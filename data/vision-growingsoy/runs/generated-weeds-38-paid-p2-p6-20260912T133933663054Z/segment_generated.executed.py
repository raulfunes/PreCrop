"""One bounded Gemini weed-only pass over selected generated PreCrop photos."""
import argparse
from collections import Counter
from datetime import datetime, timezone
import io
import json
import os
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

import segment as vision
from confidence import confianza
from overlay import sheet
from prepare import digest, strict_json, write_json


MODEL = "gemini-3.8-flash"
EXPERIMENT = "generated-weeds-38-paid"
BASE = Path(__file__).resolve().parents[2]
SOURCE = BASE / "public" / "images"
RUNS = Path(__file__).resolve().parent / "runs"
IMAGES = (
    ("P1", "soja-punto-fuga-pocas-malezas.jpg"),
    ("P2", "soja-brotes-jovenes-01.jpg"),
    ("P3", "soja-brotes-jovenes-02.jpg"),
    ("P4", "soja-brotes-jovenes-borde-lote.jpg"),
    ("P5", "soja-brotes-maleza-media-01.jpg"),
    ("P6", "soja-brotes-maleza-media-alta-02.jpg"),
    ("P7", "soja-brotes-maleza-alta-03.jpg"),
    ("P8", "soja-brotes-maleza-alta-borde-lote-04.jpg"),
)
INPUT_USD_PER_MILLION = 0.75
OUTPUT_USD_PER_MILLION = 3.75


def load_inputs(ids=None):
    selected = dict(IMAGES) if ids is None else {point_id: dict(IMAGES)[point_id] for point_id in ids}
    rows = []
    for point_id, name in selected.items():
        path = SOURCE / name
        data = path.read_bytes()
        if len(data) > 10 * 1024 * 1024:
            raise ValueError(f"Image too large: {name}")
        with Image.open(io.BytesIO(data)) as image:
            image.load()
            if image.format not in ("JPEG", "PNG"):
                raise ValueError(f"Unsupported image: {name}")
            mime = Image.MIME[image.format]
            rgb = image.convert("RGB")
        rows.append((point_id, name, path, data, mime, rgb))
    return rows


def usage(raw):
    try:
        metadata = strict_json(raw.decode("utf-8")).get("usageMetadata", {})
    except (UnicodeError, ValueError, AttributeError):
        return {}
    allowed = ("promptTokenCount", "candidatesTokenCount", "thoughtsTokenCount", "totalTokenCount")
    return {key: metadata[key] for key in allowed if type(metadata.get(key)) is int}


def summarize(run):
    counts = Counter(row["status"] for row in run["results"])
    tokens = Counter()
    for row in run["results"]:
        tokens.update(row.get("usage", {}))
    output_tokens = tokens["candidatesTokenCount"] + tokens["thoughtsTokenCount"]
    cost = (tokens["promptTokenCount"] * INPUT_USD_PER_MILLION
            + output_tokens * OUTPUT_USD_PER_MILLION) / 1_000_000
    run["summary"] = {
        "counts": dict(counts),
        "token_totals": dict(tokens),
        "estimated_cost_usd": round(cost, 6),
    }


def save_report(directory, run):
    summarize(run)
    write_json(directory / "run.json", run)
    lines = [
        "# Malezas en ocho imagenes generadas — Gemini 3.8 Flash",
        "",
        f"Fecha UTC: {run['started_at']}  ",
        f"Solicitudes: {run['requests_sent']}/{run['max_requests']} · reintentos automaticos: 0  ",
        f"Costo estimado por usageMetadata: USD {run['summary']['estimated_cost_usd']:.6f}",
        "",
        "| Punto | Imagen | Estado | Malezas | Confianza | Tiempo |",
        "| --- | --- | --- | ---: | ---: | ---: |",
    ]
    for row in run["results"]:
        pct = "—" if row.get("weed_pct") is None else f"{row['weed_pct']:.2f}%"
        conf = "—" if row.get("confidence") is None else f"{row['confidence']:.2f} ({row['confidence_band']})"
        elapsed = "—" if row.get("elapsed_seconds") is None else f"{row['elapsed_seconds']:.1f}s"
        lines.append(f"| {row['id']} | `{row['image']}` | `{row['status']}` | {pct} | {conf} | {elapsed} |")
    lines += [
        "",
        "Los rotulos poca/media/alta describen la intencion de generacion; no son verdad agronomica.",
        "El porcentaje sale de la misma mascara que aparece pintada en cada vista de revision.",
        "",
        "![Resumen de las ocho vistas](contact-sheet.jpg)",
        "",
    ]
    (directory / "report.md").write_text("\n".join(lines), encoding="utf-8")


def contact_sheet(directory, run, inputs):
    cards = []
    by_id = {point_id: rgb for point_id, _, _, _, _, rgb in inputs}
    for row in run["results"]:
        if row.get("review"):
            with Image.open(directory / row["review"]) as image:
                card = image.convert("RGB")
        else:
            photo = by_id[row["id"]]
            card = Image.new("RGB", (photo.width * 2 + 12, photo.height + 34), "#eeeeee")
            card.paste(photo, (0, 34))
            card.paste(photo, (photo.width + 12, 34))
            draw = ImageDraw.Draw(card)
            try:
                font = ImageFont.truetype("segoeui.ttf", 17)
            except OSError:
                font = ImageFont.load_default()
            draw.text((8, 8), f"{row['id']} — {row['status']}", fill="red", font=font)
        card.thumbnail((900, 520))
        cards.append(card)
    width = max(card.width for card in cards) * 2 + 20
    row_heights = [max(cards[i].height, cards[i + 1].height) for i in range(0, len(cards), 2)]
    out = Image.new("RGB", (width, sum(row_heights) + 20 * (len(row_heights) - 1)), "white")
    y = 0
    for i, height in zip(range(0, len(cards), 2), row_heights):
        out.paste(cards[i], (0, y))
        out.paste(cards[i + 1], (cards[i].width + 20, y))
        y += height + 20
    out.save(directory / "contact-sheet.jpg", quality=90)


def check():
    inputs = load_inputs()
    assert len(inputs) == 8 and [row[0] for row in inputs] == [f"P{i}" for i in range(1, 9)]
    assert [row[0] for row in load_inputs(("P2", "P6"))] == ["P2", "P6"]
    prompt = vision.render_prompt(vision.PROMPT, "soja")
    assert prompt and "{{" not in prompt
    raw = json.dumps({"status": "assessed", "reason": "check", "limitations": [],
                      "polygons": [[[0, 0], [100, 0], [0, 100]]]})
    _, mask = vision.detection(raw, (100, 100))
    assert 0 < vision.metrics(mask, None)["weed_pct"] < 1
    print("OK: 8 inputs, prompt, polygon rasterization and bounded request plan.")


def run(billing_acknowledged, ids):
    if not billing_acknowledged:
        raise SystemExit("Declare --billing-acknowledged before a potentially paid run.")
    key = os.environ.get("GEMINI_API_KEY", "").strip()
    if not key:
        raise SystemExit("Missing GEMINI_API_KEY in the environment.")
    if len(ids) != 2 or len(set(ids)) != 2 or any(point_id not in dict(IMAGES) for point_id in ids):
        raise SystemExit("This paid pilot requires exactly two distinct IDs from P1 through P8.")
    inputs = load_inputs(ids)
    experiment = EXPERIMENT + "-" + "-".join(point_id.lower() for point_id in ids)
    now = datetime.now(timezone.utc)
    directory = RUNS / (experiment + now.strftime("-%Y%m%dT%H%M%S%fZ"))
    directory.mkdir(parents=True)
    marker = RUNS / f"{experiment}.started.json"
    try:
        with marker.open("x", encoding="utf-8") as file:
            json.dump({"run": directory.name, "maximum_requests": len(inputs), "model": MODEL}, file)
    except FileExistsError:
        raise SystemExit(f"Paid run already reserved: {marker}")

    prompt = vision.render_prompt(vision.PROMPT, "soja")
    (directory / vision.PROMPT.name).write_bytes(vision.PROMPT.read_bytes())
    run_data = {
        "experiment": experiment,
        "started_at": now.isoformat(),
        "model": MODEL,
        "provider": "Google Gemini API",
        "configuration": vision.CONFIG,
        "prompt_sha256": digest(vision.PROMPT),
        "script_sha256": digest(Path(__file__)),
        "billing_acknowledged_by_operator": True,
        "automatic_retries": 0,
        "max_requests": len(inputs),
        "requests_sent": 0,
        "results": [],
    }
    save_report(directory, run_data)
    endpoint = f"/v1beta/models/{MODEL}:generateContent"
    for point_id, name, path, data, mime, rgb in inputs:
        result = {"id": point_id, "image": name, "image_sha256": digest(path), "status": "pending"}
        run_data["results"].append(result)
        run_data["requests_sent"] += 1
        save_report(directory, run_data)
        transport, raw = vision.request_once(vision.payload(data, mime, prompt), key, endpoint)
        result.update(transport)
        raw_name = f"{point_id}.response.bin"
        (directory / raw_name).write_bytes(raw)
        result["raw_api_response"] = raw_name
        result["usage"] = usage(raw)
        if transport["api_error"]:
            result["status"] = "api_error"
        else:
            try:
                text = vision.response_text(raw)
                (directory / f"{point_id}.model.txt").write_text(text, encoding="utf-8")
                obj, mask = vision.detection(text, rgb.size)
                result.update(status=obj["status"], response=obj)
                result["weed_pct"] = vision.metrics(mask, None)["weed_pct"]
                if mask is not None:
                    result["mask"] = f"{point_id}.mask.png"
                    mask.save(directory / result["mask"])
                    result["review"] = f"{point_id}.review.png"
                    sheet(rgb, mask, result["weed_pct"], point_id).save(directory / result["review"])
                    result["confidence"], result["confidence_band"] = confianza(obj["polygons"])
            except (ValueError, TypeError, KeyError, AttributeError, IndexError, RecursionError):
                result["status"] = "invalid_response"
                result["weed_pct"] = None
        save_report(directory, run_data)
        print(f"{point_id}: {result['status']} {result.get('weed_pct')}", flush=True)
    contact_sheet(directory, run_data, inputs)
    save_report(directory, run_data)
    print(directory / "report.md")
    return directory


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true")
    parser.add_argument("--billing-acknowledged", action="store_true")
    parser.add_argument("--ids", default="P2,P6")
    args = parser.parse_args()
    check() if args.check else run(args.billing_acknowledged, tuple(args.ids.split(",")))
