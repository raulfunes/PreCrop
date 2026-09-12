"""Four-request, free-project-only segmentation experiment. See VISION-IA.md."""
import argparse
import base64
from collections import Counter
from datetime import datetime, timezone
import http.client
import io
import json
import math
import os
from pathlib import Path
import statistics
import subprocess
import sys
import time

from PIL import Image, ImageChops, ImageDraw
from prepare import ROOT, PILLOW_VERSION, digest, strict_json, union_mask, validate_response, write_json

MODEL = "gemini-3.8-flash"
EXPERIMENT = "segmentation-v2-weeds-retry"
HOST = "generativelanguage.googleapis.com"
ENDPOINT = f"/v1beta/models/{MODEL}:generateContent"
IDS = ("GW02", "GW01", "GW03")
PROMPT = ROOT / "prompt-segmentation-v2.txt"
SET = ROOT / "weeds-v2"  # conjunto activo; el control sigue en ROOT
CROPS = ROOT / "crop-morphology.json"
RUNS = ROOT / "runs"
TIMEOUT = 30
MAX_RESPONSE = 1024 * 1024
# ponytail: keep the provider grammar small; all size/range/geometry limits remain
# in detection(). If provider limits become explicit, add only supported constraints here.
SCHEMA = {
    "type": "object", "additionalProperties": False,
    "required": ["status", "reason", "limitations", "polygons"],
    "properties": {
        "status": {"type": "string", "enum": ["assessed", "not_assessable"]},
        "reason": {"type": "string"},
        "limitations": {"type": "array", "items": {"type": "string"}},
        "polygons": {"type": "array", "items": {
            "type": "array", "items": {
                "type": "array", "minItems": 2, "maxItems": 2,
                "items": {"type": "number", "minimum": 0, "maximum": 1000}}}},
    },
}
CONFIG = {"candidateCount": 1, "maxOutputTokens": 8192,
          "thinkingConfig": {"thinkingLevel": "LOW"},
          "responseMimeType": "application/json", "responseJsonSchema": SCHEMA}


def cross(a, b, c):
    return (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])


def validate_polygon(points):
    if not isinstance(points, list) or not 3 <= len(points) <= 128:
        raise ValueError("Invalid vertex count")
    for p in points:
        if not isinstance(p, list) or len(p) != 2 or any(
                type(v) not in (int, float) or not math.isfinite(v) or not 0 <= v <= 1000 for v in p):
            raise ValueError("Invalid [x,y] coordinate")
    if len({tuple(p) for p in points}) != len(points):
        raise ValueError("Repeated vertex")
    edges = list(zip(points, points[1:] + points[:1]))
    if abs(sum(a[0] * b[1] - b[0] * a[1] for a, b in edges)) < 1e-8:
        raise ValueError("Degenerate polygon")
    # ponytail: O(n²) segment check, bounded to 128 vertices; use a sweep line if this limit grows.
    for i, (a, b) in enumerate(edges):
        for j, (c, d) in enumerate(edges[i + 1:], i + 1):
            if j == i + 1 or (i == 0 and j == len(edges) - 1):
                continue
            if (max(min(a[0], b[0]), min(c[0], d[0])) <= min(max(a[0], b[0]), max(c[0], d[0]))
                    and max(min(a[1], b[1]), min(c[1], d[1])) <= min(max(a[1], b[1]), max(c[1], d[1]))
                    and cross(a, b, c) * cross(a, b, d) <= 0
                    and cross(c, d, a) * cross(c, d, b) <= 0):
                raise ValueError("Self-intersecting polygon")
    corners = []
    for i, b in enumerate(points):
        a, c = points[i - 1], points[(i + 1) % len(points)]
        if cross(a, b, c) == 0:
            if (b[0] - a[0]) * (c[0] - b[0]) + (b[1] - a[1]) * (c[1] - b[1]) <= 0:
                raise ValueError("Backtracking edge")
        else:
            corners.append(b)
    if len(corners) == 4 and all(abs(
            (corners[i - 1][0] - b[0]) * (corners[(i + 1) % 4][0] - b[0]) +
            (corners[i - 1][1] - b[1]) * (corners[(i + 1) % 4][1] - b[1])) < 1e-8
            for i, b in enumerate(corners)):
        raise ValueError("Rectangle is not a contour")


def detection(raw, size):
    if not isinstance(raw, str) or len(raw) > 100000:
        raise ValueError("Response must be bounded JSON text")
    obj = strict_json(raw)
    if not isinstance(obj, dict) or set(obj) != {"status", "reason", "limitations", "polygons"}:
        raise ValueError("Invalid segmentation fields")
    if obj["status"] not in ("assessed", "not_assessable"):
        raise ValueError("Invalid segmentation status")
    # Reuse the original contract's reason/limitations validation without changing it.
    validate_response(json.dumps({"status": "estimated" if obj["status"] == "assessed" else "not_assessable",
                                 "weed_pct": 0 if obj["status"] == "assessed" else None,
                                 "reason": obj["reason"], "limitations": obj["limitations"]}))
    polygons = obj["polygons"]
    if not isinstance(polygons, list) or len(polygons) > 64:
        raise ValueError("Invalid polygons")
    if obj["status"] == "not_assessable":
        if polygons:
            raise ValueError("Abstention requires empty polygons")
        return obj, None
    annotations = []
    for points in polygons:
        validate_polygon(points)
        # Whole-image coordinates, floor fill shared with references; 1000 clips to the last pixel.
        scaled = [v for x, y in points for v in
                  (min(size[0] - 1, x * size[0] / 1000), min(size[1] - 1, y * size[1] / 1000))]
        annotations.append({"category_id": 1, "segmentation": [scaled]})
    return obj, union_mask(annotations, *size)


def metrics(mask, reference):
    result = {"weed_pct": None, "absolute_error_pp": None, "iou": None, "both_empty": False}
    if mask is None:
        return result
    total = mask.width * mask.height
    result["weed_pct"] = 100 * (total - mask.histogram()[0]) / total
    if reference is not None:
        if mask.size != reference.size or mask.mode != "1" or reference.mode != "1":
            raise ValueError("Incompatible masks")
        reference_pct = 100 * (total - reference.histogram()[0]) / total
        result["absolute_error_pp"] = abs(result["weed_pct"] - reference_pct)
        union = total - ImageChops.logical_or(mask, reference).histogram()[0]
        intersection = total - ImageChops.logical_and(mask, reference).histogram()[0]
        result["both_empty"] = union == 0
        result["iou"] = intersection / union if union else None
    return result


def comparison(rgb, mask, reference, labels):
    sheet = Image.new("RGB", (rgb.width * 3, rgb.height + 44), "white")
    draw = ImageDraw.Draw(sheet)
    for i, region in enumerate((None, mask, reference)):
        panel = rgb.copy()
        if region is not None:
            panel.paste(Image.blend(rgb, Image.new("RGB", rgb.size, "red"), .4), (0, 0), region)
        elif i:
            panel = Image.new("RGB", rgb.size, "#dedede")
            ImageDraw.Draw(panel).text((15, 20), "SIN MASCARA / SIN RESULTADO", fill="black")
        sheet.paste(panel, (i * rgb.width, 44))
        draw.text((i * rgb.width + 8, 8), labels[i], fill="black")
    return sheet


def render_prompt(path, crop):
    """Resuelve los marcadores del prompt. Falla si queda alguno sin sustituir."""
    text = path.read_text(encoding="utf-8").replace("{{CULTIVO_ESPERADO}}", crop)
    if "{{MORFOLOGIA_CULTIVO}}" in text:
        crops = json.loads(CROPS.read_text(encoding="utf-8"))["crops"]
        if crop not in crops:
            raise ValueError(f"Sin morfologia declarada para el cultivo {crop!r}")
        text = text.replace("{{MORFOLOGIA_CULTIVO}}", crops[crop])
    if "{{" in text:
        raise ValueError("Marcador sin resolver en el prompt")
    return text


def payload(image_bytes, mime, prompt):
    return {"contents": [{"role": "user", "parts": [
        {"text": prompt}, {"inlineData": {"mimeType": mime,
         "data": base64.b64encode(image_bytes).decode("ascii")}}]}], "generationConfig": CONFIG}


def http_once(body, key, endpoint=None):
    start = time.monotonic()
    result = {"http_status": None, "api_error": None}
    raw = b""
    connection = http.client.HTTPSConnection(HOST, timeout=TIMEOUT)
    try:
        connection.request("POST", endpoint or ENDPOINT, json.dumps(body).encode("utf-8"),
                           {"Content-Type": "application/json", "x-goog-api-key": key})
        response = connection.getresponse()
        result["http_status"] = response.status
        raw = response.read(MAX_RESPONSE + 1)
        if len(raw) > MAX_RESPONSE:
            result["api_error"] = "response_too_large"
        elif response.status != 200:
            result["api_error"] = f"HTTP_{response.status}"
    except (OSError, http.client.HTTPException):
        # Do not log exception strings: providers/proxies may echo credentials.
        result["api_error"] = "transport_error_or_timeout"
    finally:
        connection.close()
    result["elapsed_seconds"] = time.monotonic() - start
    clean = raw.replace(key.encode("utf-8"), b"[REDACTED]")
    result["credential_redacted"] = clean != raw
    return result, clean


def request_once(body, key, endpoint=None):
    start = time.monotonic()
    # A child process gives DNS/connect/read a single wall-clock deadline, even on Windows.
    # The credential travels only through an anonymous pipe, never argv or files.
    try:
        child = subprocess.run([sys.executable, "-B", str(Path(__file__).resolve()), "--transport"],
                               input=json.dumps({"body": body, "key": key,
                                                 "endpoint": endpoint or ENDPOINT}), capture_output=True,
                               text=True, encoding="utf-8", timeout=TIMEOUT,
                               creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0))
        if child.returncode != 0:
            raise ValueError("Transport child failed")
        result, encoded = strict_json(child.stdout)
        raw = base64.b64decode(encoded, validate=True)
    except (subprocess.TimeoutExpired, OSError, ValueError):
        result, raw = {"http_status": None, "api_error": "transport_error_or_timeout"}, b""
    result["elapsed_seconds"] = time.monotonic() - start
    return result, raw


def response_text(raw):
    obj = strict_json(raw.decode("utf-8"))
    if not isinstance(obj, dict) or obj.get("promptFeedback", {}).get("blockReason"):
        raise ValueError("Invalid or blocked API response")
    candidates = obj.get("candidates")
    if not isinstance(candidates, list) or len(candidates) != 1 or candidates[0].get("finishReason") != "STOP":
        raise ValueError("Missing, blocked or incomplete candidate")
    parts = candidates[0]["content"]["parts"]
    if not isinstance(parts, list):
        raise ValueError("Invalid content parts")
    text_parts = [p["text"] for p in parts if not p.get("thought", False)]
    if not text_parts or any(not isinstance(p, str) for p in text_parts):
        raise ValueError("Missing output text")
    return "".join(text_parts)


def save_report(directory, run):
    rows = run["results"]
    errors = [r["absolute_error_pp"] for r in rows if r["absolute_error_pp"] is not None]
    ious = [r["iou"] for r in rows if r["iou"] is not None]
    run["summary"] = {"counts": dict(Counter(r["status"] for r in rows)),
                      "mae_pp": statistics.mean(errors) if errors else None,
                      "mae_n": len(errors), "mean_iou": statistics.mean(ious) if ious else None,
                      "iou_n": len(ious), "both_empty_n": sum(r["both_empty"] for r in rows)}
    write_json(directory / "run.json", run)
    def number(v):
        return "—" if v is None else f"{v:.4f}"
    lines = [f"# Segmentación — {run['experiment']}", "", f"Modelo: `{run['model']}`. Fecha UTC: {run['started_at']}.",
             f"Solicitudes realizadas: {run['requests_sent']}/4. Bloqueo: {run['blocked_reason'] or 'ninguno'}.", "",
             "| Foto | Estado | Referencia % | Contornos % | Error pp | IoU | Ambas vacías |",
             "| --- | --- | ---: | ---: | ---: | ---: | --- |"]
    for r in rows:
        lines.append(f"| {r['id']} | {r['status']} | {number(r['reference_pct'])} | {number(r['weed_pct'])} | "
                     f"{number(r['absolute_error_pp'])} | {number(r['iou'])} | {r['both_empty']} |")
    lines += ["", f"MAE: {number(run['summary']['mae_pp'])} pp ({len(errors)}/3 fotos).",
              f"IoU media: {number(run['summary']['mean_iou'])} ({len(ious)} pares con unión no vacía).",
              "El control no integra MAE ni IoU. Ambas máscaras vacías se cuentan aparte.", "",
              "## Comparaciones", "", "Rojo: píxeles de la máscara binaria usada en el cálculo. Sin resultado se muestra gris.", ""]
    for r in rows:
        if "comparison" in r:
            lines += [f"![{r['id']}: original, detección y referencia]({r['comparison']})", ""]
    lines += ["## Observaciones", "", "Revisión visual de detección pendiente; no se infieren aciertos por pruebas sintéticas.",
              "No ampliar al resto del conjunto de desarrollo ni abrir el final sin revisar esta corrida."]
    (directory / "report.md").write_text("\n".join(lines) + "\n", encoding="utf-8")


def run_experiment(free_project_confirmed=False, experiment=EXPERIMENT, billing_acknowledged=False,
                   model=MODEL):
    endpoint = f"/v1beta/models/{model}:generateContent"
    manifest = strict_json((SET / "manifest.json").read_text(encoding="utf-8"))
    selected = [dict(next(r for r in manifest["images"] if r["id"] == name and r["split"] == "desarrollo"),
                     base=SET) for name in IDS]
    control = strict_json((ROOT / "manifest.json").read_text(encoding="utf-8"))["control"]
    selected.append({"id": "control", "image_path": control["path"], "sha256": control["sha256"],
                     "reference_pct": None, "base": ROOT})
    # Validate only authorized inputs before reserving the request budget.
    inputs = []
    for row in selected:
        path = row["base"] / row["image_path"]
        data = path.read_bytes()
        if digest(path) != row["sha256"] or len(data) > 10 * 1024 * 1024:
            raise ValueError("Image hash/size mismatch")
        with Image.open(io.BytesIO(data)) as image:
            if image.format not in ("JPEG", "PNG") or image.mode != "RGB" or image.size != (640, 640):
                raise ValueError("Unexpected input image")
            mime, rgb = Image.MIME[image.format], image.copy()
        reference = None
        if row.get("mask_path"):
            path = row["base"] / row["mask_path"]
            if digest(path) != row["mask_sha256"]:
                raise ValueError("Reference hash mismatch")
            with Image.open(path) as image:
                reference = image.copy()
            if metrics(reference, reference)["weed_pct"] != row["reference_pct"]:
                raise ValueError("Reference percentage mismatch")
        inputs.append((row, data, mime, rgb, reference))
    now = datetime.now(timezone.utc)
    directory = RUNS / (experiment + now.strftime("-%Y%m%dT%H%M%S%fZ"))
    directory.mkdir(parents=True)
    (directory / PROMPT.name).write_bytes(PROMPT.read_bytes())
    prompt = render_prompt(PROMPT, "soja")
    key = os.environ.get("GEMINI_API_KEY", "").strip()
    # Una de las dos declaraciones del operador: proyecto sin facturacion, o gasto asumido.
    blocked = "missing_GEMINI_API_KEY" if not key else (
        None if (free_project_confirmed or billing_acknowledged)
        else "project_without_billing_not_confirmed")
    budget = RUNS / f"{experiment}.started.json"
    if not blocked:
        try:
            with budget.open("x", encoding="utf-8") as file:
                json.dump({"run": directory.name, "maximum_requests": 4}, file)
        except FileExistsError:
            blocked = "four_request_experiment_already_reserved"
    run = {"experiment": experiment, "started_at": now.isoformat(), "model": model, "provider": "Google Gemini API",
           "endpoint": f"https://{HOST}{endpoint}", "configuration": CONFIG, "timeout_seconds": TIMEOUT,
           "automatic_retries": 0, "max_requests": 4, "expected_crop": "soja",
           "free_project_confirmed_by_operator": free_project_confirmed,
           "billing_acknowledged_by_operator": billing_acknowledged,
           "prompt_sha256": digest(PROMPT), "script_sha256": digest(Path(__file__)),
           "manifest_sha256": digest(SET / "manifest.json"), "pillow": PILLOW_VERSION,
           "requests_sent": 0, "blocked_reason": blocked, "results": []}
    save_report(directory, run)
    for row, data, mime, rgb, reference in inputs:
        mask = None
        result = {"id": row["id"], "status": "blocked" if blocked else "pending",
                  "image_path": row["image_path"], "image_sha256": row["sha256"],
                  "reference_pct": row["reference_pct"], "reference_sha256": row.get("mask_sha256")}
        if not blocked:
            run["requests_sent"] += 1
            save_report(directory, run)  # Persist attempted count before network activity.
            transport, raw = request_once(payload(data, mime, prompt), key, endpoint)
            result.update(transport)
            raw_name = f"{row['id']}.response.bin"
            (directory / raw_name).write_bytes(raw)
            result["raw_api_response"] = raw_name
            if transport["api_error"]:
                result["status"] = "api_error"
                blocked = run["blocked_reason"] = transport["api_error"]
            else:
                try:
                    text = response_text(raw)
                    (directory / f"{row['id']}.model.txt").write_bytes(text.encode("utf-8"))
                    obj, mask = detection(text, rgb.size)
                    result.update(status=obj["status"], response=obj)
                except (ValueError, TypeError, KeyError, AttributeError, IndexError, RecursionError):
                    result["status"] = "invalid_response"
        result.update(metrics(mask, reference))
        if row["id"] == "control":
            result["control_pass"] = result["status"] == "not_assessable" if result["status"] in ("assessed", "not_assessable") else None
        if mask is not None:
            result["mask"] = f"{row['id']}.mask.png"
            mask.save(directory / result["mask"])
        result["comparison"] = f"{row['id']}.comparison.png"
        pct = result["weed_pct"]
        comparison(rgb, mask, reference, [f"{row['id']} Original", f"Deteccion: {result['status']}" +
                   (f" | {pct:.4f}%" if pct is not None else ""),
                   "Referencia" + (f" | {row['reference_pct']:.4f}%" if reference is not None else " no aplicable")]
                   ).save(directory / result["comparison"])
        run["results"].append(result)
        save_report(directory, run)
    print(directory / "report.md")
    print(f"Requests: {run['requests_sent']}/4; blocked: {run['blocked_reason']}; {run['summary']}")
    return run


if __name__ == "__main__":
    if sys.argv[1:] == ["--transport"]:
        request = strict_json(sys.stdin.read())
        result, raw = http_once(request["body"], request["key"], request.get("endpoint"))
        print(json.dumps([result, base64.b64encode(raw).decode("ascii")]))
        sys.exit(0)
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--experiment", default=EXPERIMENT,
                        help="Nombre del experimento; su reserva impide repetirlo.")
    parser.add_argument("--free-project-confirmed", action="store_true",
                        help="Operator has verified this key belongs to a project WITHOUT billing in AI Studio")
    parser.add_argument("--billing-acknowledged", action="store_true",
                        help="Operator accepts this key may bill a project with credits or billing enabled")
    parser.add_argument("--model", default=MODEL, help="Identificador exacto del modelo; queda en run.json")
    args = parser.parse_args()
    run_experiment(args.free_project_confirmed, args.experiment, args.billing_acknowledged, args.model)
