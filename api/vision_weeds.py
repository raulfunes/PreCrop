"""POST /api/vision/weeds — estimacion de malezas y cultivo sobre una foto.

Arranque:
    set -a && . ./.env && set +a
    python -B api/vision_weeds.py --billing-acknowledged
    unset GEMINI_API_KEY

La credencial se lee del entorno al arrancar y nunca viaja por argv ni por disco.
El transporte, la rasterizacion y la calibracion son los mismos de la prueba
publica; este modulo solo los expone por HTTP. Ver VISION-IA.md.
"""
import argparse
import io
import json
import os
from pathlib import Path
import sys
import threading
import uuid

ROOT = Path(__file__).resolve().parent
VISION = ROOT.parent / "data" / "vision-growingsoy"
sys.path.insert(0, str(VISION))

from PIL import Image, UnidentifiedImageError  # noqa: E402
import segment as vision  # noqa: E402
from confidence import confianza  # noqa: E402
from overlay import sheet  # noqa: E402

MODEL = "gemini-3.6-flash"  # El unico medido; ver "Nivel de confianza medido".
ENDPOINT = f"/v1beta/models/{MODEL}:generateContent"
PROMPTS = {"weeds": VISION / "prompt-segmentation-v2.txt", "soy": VISION / "prompt-soy-v1.txt"}
REVIEWS = ROOT / "reviews"
MAX_IMAGE = 12 * 1024 * 1024
MAX_BODY = MAX_IMAGE + 64 * 1024
MIME = {"JPEG": "image/jpeg", "PNG": "image/png", "WEBP": "image/webp"}
POINT_ID_MAX = 32
REVIEW_NAME_LEN = 36  # 32 hexadecimales + ".png"


def parse_multipart(body, content_type):
    """Partes de un multipart/form-data acotado. Solo lo que este endpoint recibe:
    un archivo y campos de texto cortos."""
    marker = "boundary="
    if "multipart/form-data" not in content_type or marker not in content_type:
        raise ValueError("Se espera multipart/form-data")
    boundary = content_type.split(marker, 1)[1].split(";")[0].strip().strip('"')
    if not boundary or len(boundary) > 200:
        raise ValueError("Boundary invalido")
    separator = b"--" + boundary.encode("ascii")
    fields, files = {}, {}
    for chunk in body.split(separator)[1:-1]:
        chunk = chunk[2:] if chunk.startswith(b"\r\n") else chunk
        head, marca, data = chunk.partition(b"\r\n\r\n")
        if not marca:
            continue
        data = data[:-2] if data.endswith(b"\r\n") else data
        disposition = ""
        for line in head.decode("utf-8", "replace").split("\r\n"):
            if line.lower().startswith("content-disposition:"):
                disposition = line
        clave = 'name="'
        if clave not in disposition:
            continue
        name = disposition.split(clave, 1)[1].split('"', 1)[0]
        if "filename=" in disposition:
            files[name] = data
        else:
            fields[name] = data.decode("utf-8", "replace")
    return fields, files


def read_image(data):
    if not data or len(data) > MAX_IMAGE:
        raise ValueError("Imagen ausente o demasiado grande")
    try:
        image = Image.open(io.BytesIO(data))
        image.load()
    except (UnidentifiedImageError, OSError, ValueError):
        raise ValueError("No se pudo leer la imagen")
    if image.format not in MIME:
        raise ValueError("Formato no aceptado")
    return image.convert("RGB"), MIME[image.format]


def gps(data):
    """Coordenadas EXIF si la foto las trae. Informativo: el protocolo pide GPS con
    tolerancia de 30 m, pero este endpoint todavia no rechaza por eso.
    ponytail: sin verificacion de altura, nadir ni horario de captura."""
    try:
        exif = Image.open(io.BytesIO(data)).getexif().get_ifd(0x8825)
    except (UnidentifiedImageError, OSError, ValueError, AttributeError):
        return None
    if not exif or 2 not in exif or 4 not in exif:
        return None

    def grados(valor, referencia):
        d, m, s = (float(v) for v in valor)
        signo = -1 if str(referencia).upper().startswith(("S", "W")) else 1
        return round(signo * (d + m / 60 + s / 3600), 6)

    try:
        return {"lat": grados(exif[2], exif.get(1, "N")), "lon": grados(exif[4], exif.get(3, "E"))}
    except (TypeError, ValueError, ZeroDivisionError):
        return None


def estimate(kind, data, mime, size, key, out):
    """Una llamada al modelo. Deja en out el objeto y la mascara, o un error."""
    prompt = vision.render_prompt(PROMPTS[kind], "soja")
    transport, raw = vision.request_once(vision.payload(data, mime, prompt), key, ENDPOINT)
    if transport["api_error"]:
        out[kind] = {"error": transport["api_error"]}
        return
    try:
        obj, mask = vision.detection(vision.response_text(raw), size)
    except (ValueError, TypeError, KeyError, AttributeError, IndexError, RecursionError):
        out[kind] = {"error": "invalid_response"}
        return
    out[kind] = {"obj": obj, "mask": mask,
                 "pct": None if mask is None else vision.metrics(mask, None)["weed_pct"]}


def estimate_guarded(kind, *args):
    """Un hilo que muere sin dejar rastro se leeria como 'sin cultivo'. Que deje error."""
    out = args[-1]
    try:
        estimate(kind, *args)
    except Exception:  # noqa: BLE001 - el detalle puede venir del proveedor; no se registra.
        out[kind] = {"error": "internal_error"}


def analyse(data, point_id, key):
    """Malezas y cultivo salen en dos llamadas separadas a proposito: el prompt de
    malezas queda byte a byte como el que se midio, asi la confianza calibrada
    sigue valiendo. Mezclar ambas tareas en una sola llamada la invalidaria."""
    image, mime = read_image(data)
    out = {}
    hilos = [threading.Thread(target=estimate_guarded, args=(k, data, mime, image.size, key, out))
             for k in ("weeds", "soy")]
    for h in hilos:
        h.start()
    for h in hilos:
        h.join()

    weeds = out.get("weeds", {"error": "no_result"})
    if "error" in weeds:
        return 502, {"point_id": point_id, "status": "provider_error", "error": weeds["error"],
                     "detail": "Sin estimacion. Un fallo del proveedor no es cero malezas."}
    if weeds["obj"]["status"] == "not_assessable":
        return 422, {"point_id": point_id, "status": "not_assessable",
                     "reason": weeds["obj"]["reason"], "limitations": weeds["obj"]["limitations"]}

    valor, banda = confianza(weeds["obj"]["polygons"])
    review = f"{uuid.uuid4().hex}.png"
    REVIEWS.mkdir(exist_ok=True)
    sheet(image, weeds["mask"], weeds["pct"], point_id).save(REVIEWS / review)

    soy = out.get("soy", {"error": "no_result"})
    soy_pct = None if "error" in soy or soy["obj"]["status"] == "not_assessable" else round(soy["pct"], 2)
    limitaciones = list(weeds["obj"]["limitations"])
    if soy_pct is None:
        limitaciones.append("No se pudo estimar cobertura de cultivo en esta foto.")

    return 200, {
        "point_id": point_id,
        "weeds_pct": round(weeds["pct"], 2),
        "soy_pct": soy_pct,
        "confidence": valor,
        # Agregados sobre el contrato pedido; ninguno reemplaza a los cuatro de arriba.
        "status": "assessed",
        "confidence_band": banda,
        "confidence_scope": "weeds",
        "soy_calibrated": False,
        "model": MODEL,
        "review_url": f"/api/vision/review/{review}",
        "gps": gps(data),
        "reason": weeds["obj"]["reason"],
        "limitations": limitaciones,
    }


def build_handler(key):
    from http.server import BaseHTTPRequestHandler

    class Handler(BaseHTTPRequestHandler):
        server_version = "PreCropVision"
        sys_version = ""

        def log_message(self, fmt, *args):  # No registrar cabeceras: pueden traer credenciales.
            sys.stderr.write(f"{self.command} {self.path.split('?')[0]}\n")

        def send(self, status, body, content_type="application/json; charset=utf-8"):
            raw = body if isinstance(body, bytes) else json.dumps(body, ensure_ascii=False).encode("utf-8")
            self.send_response(status)
            self.send_header("Content-Type", content_type)
            self.send_header("Content-Length", str(len(raw)))
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            self.wfile.write(raw)

        def do_GET(self):
            nombre = self.path.rsplit("/", 1)[-1]
            # Solo hexadecimal y .png: no se puede salir del directorio de revisiones.
            if (not self.path.startswith("/api/vision/review/") or len(nombre) != REVIEW_NAME_LEN
                    or not nombre.endswith(".png") or any(c not in "0123456789abcdef" for c in nombre[:-4])):
                return self.send(404, {"error": "not_found"})
            destino = REVIEWS / nombre
            if not destino.is_file():
                return self.send(404, {"error": "not_found"})
            self.send(200, destino.read_bytes(), "image/png")

        def do_POST(self):
            if self.path.split("?")[0] != "/api/vision/weeds":
                return self.send(404, {"error": "not_found"})
            try:
                length = int(self.headers.get("Content-Length", "0"))
            except ValueError:
                return self.send(400, {"error": "bad_content_length"})
            if length <= 0 or length > MAX_BODY:
                return self.send(413, {"error": "body_too_large_or_empty"})
            try:
                fields, files = parse_multipart(self.rfile.read(length),
                                                self.headers.get("Content-Type", ""))
            except (ValueError, UnicodeError):
                return self.send(400, {"error": "bad_multipart"})
            point_id = (fields.get("point_id") or "").strip()
            if (not point_id or len(point_id) > POINT_ID_MAX
                    or not point_id.replace("-", "").replace("_", "").isalnum()):
                return self.send(400, {"error": "bad_point_id"})
            try:
                status, body = analyse(files.get("image", b""), point_id, key)
            except ValueError as error:
                return self.send(400, {"point_id": point_id, "error": str(error)})
            self.send(status, body)

    return Handler


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--port", type=int, default=8000)
    parser.add_argument("--free-project-confirmed", action="store_true",
                        help="El operador verifico que la clave es de un proyecto SIN facturacion")
    parser.add_argument("--billing-acknowledged", action="store_true",
                        help="El operador acepta que la clave puede facturar")
    args = parser.parse_args()
    key = os.environ.get("GEMINI_API_KEY", "")
    if not key:
        sys.exit("Falta GEMINI_API_KEY en el entorno.")
    if not (args.free_project_confirmed or args.billing_acknowledged):
        sys.exit("Declarar --free-project-confirmed o --billing-acknowledged antes de servir.")
    from http.server import ThreadingHTTPServer
    servidor = ThreadingHTTPServer(("127.0.0.1", args.port), build_handler(key))
    print(f"POST http://127.0.0.1:{args.port}/api/vision/weeds  modelo {MODEL}")
    servidor.serve_forever()


if __name__ == "__main__":
    main()
