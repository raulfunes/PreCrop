"""Comprobacion del endpoint, sin red ni API: python -B api/check_api.py.

Levanta el servidor real en un puerto efimero y sustituye solo el transporte.
"""
import http.client
import io
import json
from pathlib import Path
import sys
import threading
from unittest.mock import patch

from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parent))
import vision_weeds as api  # noqa: E402
from confidence import confianza  # noqa: E402

CLAVE = "synthetic-secret"
TRIANGULO = [[0, 0], [500, 0], [0, 500]]
# Rectangulos y rombos se rechazan a proposito: el contrato pide contornos, no cajas.
GRANDE = [[0, 0], [1000, 0], [0, 1000]]


def foto(size=(120, 90)):
    buffer = io.BytesIO()
    Image.new("RGB", size, (70, 110, 60)).save(buffer, format="JPEG")
    return buffer.getvalue()


def cuerpo(imagen=None, point_id="P1", boundary="xYz123"):
    partes = []
    if point_id is not None:
        partes.append(f'--{boundary}\r\nContent-Disposition: form-data; name="point_id"\r\n\r\n'
                      f"{point_id}\r\n".encode("utf-8"))
    if imagen is not None:
        partes.append(f'--{boundary}\r\nContent-Disposition: form-data; name="image"; '
                      f'filename="p.jpg"\r\nContent-Type: image/jpeg\r\n\r\n'.encode("utf-8")
                      + imagen + b"\r\n")
    partes.append(f"--{boundary}--\r\n".encode("utf-8"))
    return b"".join(partes), f"multipart/form-data; boundary={boundary}"


def respuesta(polygons, status="assessed"):
    texto = json.dumps({"status": status, "reason": "Comprobacion sintetica, no inferencia.",
                        "limitations": [], "polygons": polygons})
    return json.dumps({"candidates": [{"finishReason": "STOP", "content": {
        "parts": [{"text": texto}]}}]}).encode("utf-8")


def transporte(weeds, soy):
    """Despacha por el prompt que viaja en el cuerpo, como hara el proveedor real."""
    def enviar(body, key, endpoint=None):
        assert key == CLAVE, "La clave no llego al transporte"
        assert endpoint == api.ENDPOINT, endpoint
        texto = body["contents"][0]["parts"][0]["text"]
        elegido = weeds if "segmentación v2" in texto else soy
        assert "{{" not in texto, "Marcador sin resolver en el prompt"
        return elegido
    return enviar


def pedir(puerto, ruta="/api/vision/weeds", metodo="POST", datos=None, tipo=None, cabeceras=None):
    conexion = http.client.HTTPConnection("127.0.0.1", puerto, timeout=20)
    try:
        head = dict(cabeceras or {})
        if tipo:
            head["Content-Type"] = tipo
        conexion.request(metodo, ruta, datos, head)
        r = conexion.getresponse()
        return r.status, r.read(), r.getheader("Content-Type")
    finally:
        conexion.close()


def main():
    ok = ({"http_status": 200, "api_error": None, "elapsed_seconds": 0.1}, respuesta([TRIANGULO]))
    ok_soy = ({"http_status": 200, "api_error": None, "elapsed_seconds": 0.1}, respuesta([GRANDE]))
    abstencion = ({"http_status": 200, "api_error": None, "elapsed_seconds": 0.1},
                  respuesta([], "not_assessable"))
    caido = ({"http_status": None, "api_error": "transport_error_or_timeout", "elapsed_seconds": 0.1}, b"")

    from http.server import ThreadingHTTPServer
    servidor = ThreadingHTTPServer(("127.0.0.1", 0), api.build_handler(CLAVE))
    puerto = servidor.server_address[1]
    hilo = threading.Thread(target=servidor.serve_forever, daemon=True)
    hilo.start()
    try:
        datos, tipo = cuerpo(foto())

        # 1. Camino feliz: estan los cuatro campos del contrato y los numeros son coherentes.
        with patch.object(api.vision, "request_once", side_effect=transporte(ok, ok_soy)):
            estado, crudo, _ = pedir(puerto, datos=datos, tipo=tipo)
        assert estado == 200, (estado, crudo)
        cuerpo_json = json.loads(crudo)
        assert {"point_id", "weeds_pct", "soy_pct", "confidence"} <= set(cuerpo_json)
        assert cuerpo_json["point_id"] == "P1"
        assert cuerpo_json["status"] == "assessed"
        # El triangulo chico ocupa un octavo de la imagen; el grande, la mitad.
        assert abs(cuerpo_json["weeds_pct"] - 12.5) < 1.0, cuerpo_json["weeds_pct"]
        assert abs(cuerpo_json["soy_pct"] - 50.0) < 1.5, cuerpo_json["soy_pct"]
        # La confianza sale de la misma calibracion y solo habla de malezas.
        assert cuerpo_json["confidence"] == confianza([TRIANGULO])[0]
        assert cuerpo_json["confidence_band"] == confianza([TRIANGULO])[1]
        assert cuerpo_json["confidence_scope"] == "weeds" and cuerpo_json["soy_calibrated"] is False
        assert cuerpo_json["model"] == api.MODEL
        assert CLAVE not in crudo.decode("utf-8"), "La credencial se filtro en la respuesta"

        # 2. La vista de revision se sirve; salir del directorio no.
        estado, png, tipo_png = pedir(puerto, cuerpo_json["review_url"], "GET")
        assert estado == 200 and png[:8] == b"\x89PNG\r\n\x1a\n" and tipo_png == "image/png"
        for ruta in ("/api/vision/review/../../CLAUDE.md", "/api/vision/review/x.png",
                     "/api/vision/review/" + "z" * 32 + ".png", "/api/vision/review/%2e%2e%2fx.png"):
            estado, _, _ = pedir(puerto, ruta, "GET")
            assert estado == 404, (ruta, estado)

        # 3. Abstencion: 422 y ningun porcentaje. Un fallo no puede leerse como cero malezas.
        with patch.object(api.vision, "request_once", side_effect=transporte(abstencion, ok_soy)):
            estado, crudo, _ = pedir(puerto, datos=datos, tipo=tipo)
        assert estado == 422, estado
        fallo = json.loads(crudo)
        assert fallo["status"] == "not_assessable" and "weeds_pct" not in fallo and "soy_pct" not in fallo

        # 4. Proveedor caido: 502 y tampoco hay numero.
        with patch.object(api.vision, "request_once", side_effect=transporte(caido, ok_soy)):
            estado, crudo, _ = pedir(puerto, datos=datos, tipo=tipo)
        assert estado == 502, estado
        fallo = json.loads(crudo)
        assert fallo["status"] == "provider_error" and "weeds_pct" not in fallo

        # 5. Si falla el cultivo pero no la maleza, sale la maleza y soy_pct queda en null.
        with patch.object(api.vision, "request_once", side_effect=transporte(ok, caido)):
            estado, crudo, _ = pedir(puerto, datos=datos, tipo=tipo)
        assert estado == 200, estado
        parcial = json.loads(crudo)
        assert parcial["weeds_pct"] > 0 and parcial["soy_pct"] is None
        assert any("cultivo" in l for l in parcial["limitations"])
        with patch.object(api.vision, "request_once", side_effect=transporte(ok, abstencion)):
            estado, crudo, _ = pedir(puerto, datos=datos, tipo=tipo)
        assert estado == 200 and json.loads(crudo)["soy_pct"] is None

        # 6. Entradas malas: ninguna llega al modelo.
        with patch.object(api.vision, "request_once") as jamas:
            malos = [
                (cuerpo(foto(), point_id=None), 400),
                (cuerpo(foto(), point_id="P 1; drop"), 400),
                (cuerpo(foto(), point_id="x" * (api.POINT_ID_MAX + 1)), 400),
                (cuerpo(None), 400),
                ((b"no es multipart", "application/json"), 400),
                ((datos, "multipart/form-data"), 400),
                ((b"", tipo), 413),
            ]
            for (cuerpo_malo, tipo_malo), esperado in malos:
                estado, _, _ = pedir(puerto, datos=cuerpo_malo, tipo=tipo_malo)
                assert estado == esperado, (esperado, estado, tipo_malo)
            texto_falso, _ = cuerpo(b"esto no es una imagen")
            estado, _, _ = pedir(puerto, datos=texto_falso, tipo=tipo)
            assert estado == 400, estado
            estado, _, _ = pedir(puerto, "/api/vision/otra", datos=datos, tipo=tipo)
            assert estado == 404, estado
            estado, _, _ = pedir(puerto, datos=datos, tipo=tipo,
                                 cabeceras={"Content-Length": str(api.MAX_BODY + 1)})
            assert estado == 413, estado
            jamas.assert_not_called()
    finally:
        servidor.shutdown()
        servidor.server_close()
        for resto in api.REVIEWS.glob("*.png"):
            resto.unlink()

    print("OK: contrato, confianza, abstencion 422, proveedor caido 502, cultivo parcial, "
          "vista servida, traversal y entradas invalidas. Sin red.")


if __name__ == "__main__":
    main()
