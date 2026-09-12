"""Two-image Codex weed-segmentation pilot over generated PreCrop photos."""
import argparse
from datetime import datetime, timezone
import json
from pathlib import Path
import subprocess
import time

from PIL import Image, ImageDraw, ImageFont

from confidence import confianza
from overlay import sheet
from prepare import digest, write_json
import segment as vision


MODEL = "gpt-6-astra"
BASE = Path(__file__).resolve().parents[2]
SOURCE = BASE / "public" / "images"
RUNS = Path(__file__).resolve().parent / "runs"
IMAGES = {
    "P2": "soja-brotes-jovenes-01.jpg",
    "P6": "soja-brotes-maleza-media-alta-02.jpg",
}


def save_report(directory, run):
    write_json(directory / "run.json", run)
    lines = [
        f"# Malezas en 2 imagenes generadas — Codex {run['model']}", "",
        f"Fecha UTC: {run['started_at']}",
        f"Ejecuciones completadas: {len(run['results'])}/2", "",
        "| Punto | Imagen | Estado | Malezas | Confianza | Tiempo |",
        "| --- | --- | --- | ---: | ---: | ---: |",
    ]
    for row in run["results"]:
        pct = "—" if row.get("weed_pct") is None else f"{row['weed_pct']:.2f}%"
        conf = "—" if row.get("confidence") is None else f"{row['confidence']:.2f} ({row['confidence_band']})"
        lines.append(f"| {row['id']} | `{row['image']}` | `{row['status']}` | {pct} | {conf} | {row['elapsed_seconds']:.1f}s |")
    lines += [
        "", "El porcentaje sale de la misma mascara que aparece pintada en cada vista.",
        "La confianza reutiliza la calibracion exploratoria de Gemini y no esta calibrada para Codex.",
        "Las fotos son sinteticas; los resultados no constituyen validacion agronomica.", "",
        "![Resumen de las dos vistas](contact-sheet.jpg)", "",
    ]
    (directory / "report.md").write_text("\n".join(lines), encoding="utf-8")


def contact_sheet(directory, rows):
    cards = []
    for row in rows:
        if row.get("review"):
            with Image.open(directory / row["review"]) as image:
                card = image.convert("RGB")
        else:
            with Image.open(SOURCE / row["image"]) as image:
                photo = image.convert("RGB")
            card = Image.new("RGB", (photo.width * 2 + 12, photo.height + 34), "#eeeeee")
            card.paste(photo, (0, 34)), card.paste(photo, (photo.width + 12, 34))
            draw = ImageDraw.Draw(card)
            try:
                font = ImageFont.truetype("segoeui.ttf", 17)
            except OSError:
                font = ImageFont.load_default()
            draw.text((8, 8), f"{row['id']} — {row['status']}", fill="red", font=font)
        card.thumbnail((900, 520))
        cards.append(card)
    out = Image.new("RGB", (cards[0].width + cards[1].width + 20,
                            max(cards[0].height, cards[1].height)), "white")
    out.paste(cards[0], (0, 0)), out.paste(cards[1], (cards[0].width + 20, 0))
    out.save(directory / "contact-sheet.jpg", quality=90)


def check():
    assert set(IMAGES) == {"P2", "P6"}
    assert all((SOURCE / name).is_file() for name in IMAGES.values())
    prompt = vision.render_prompt(vision.PROMPT, "soja")
    assert prompt and "{{" not in prompt
    raw = json.dumps({"status": "assessed", "reason": "check", "limitations": [],
                      "polygons": [[[0, 0], [100, 0], [0, 100]]]})
    _, mask = vision.detection(raw, (100, 100))
    assert 0 < vision.metrics(mask, None)["weed_pct"] < 1
    print("OK: 2 inputs, rendered prompt and polygon rasterization.")


def run():
    now = datetime.now(timezone.utc)
    directory = RUNS / ("generated-weeds-codex-p2-p6-" + now.strftime("%Y%m%dT%H%M%S%fZ"))
    directory.mkdir(parents=True)
    prompt = vision.render_prompt(vision.PROMPT, "soja")
    schema_path = directory / "response-schema.json"
    write_json(schema_path, vision.SCHEMA)
    (directory / "prompt-segmentation-v2.txt").write_text(prompt, encoding="utf-8")
    run_data = {
        "experiment": "generated-weeds-codex-p2-p6",
        "started_at": now.isoformat(),
        "provider": "OpenAI Codex CLI via ChatGPT login",
        "model": MODEL,
        "prompt_sha256": digest(directory / "prompt-segmentation-v2.txt"),
        "results": [],
    }
    save_report(directory, run_data)
    for point_id, name in IMAGES.items():
        image_path = SOURCE / name
        output_path = directory / f"{point_id}.model.json"
        events_path = directory / f"{point_id}.events.jsonl"
        started = time.monotonic()
        command = [
            "codex", "exec", "--ephemeral", "--ignore-rules", "--sandbox", "read-only",
            "--model", MODEL, "--image", str(image_path), "--output-schema", str(schema_path),
            "--json", "--output-last-message", str(output_path), "--cd", str(BASE), prompt,
        ]
        completed = subprocess.run(command, capture_output=True, text=True, encoding="utf-8",
                                   timeout=300, creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0))
        events_path.write_text(completed.stdout, encoding="utf-8")
        (directory / f"{point_id}.stderr.txt").write_text(completed.stderr, encoding="utf-8")
        row = {
            "id": point_id, "image": name, "image_sha256": digest(image_path),
            "elapsed_seconds": time.monotonic() - started,
            "status": "cli_error" if completed.returncode else "pending",
            "exit_code": completed.returncode,
        }
        if completed.returncode == 0:
            try:
                raw = output_path.read_text(encoding="utf-8")
                obj, mask = vision.detection(raw, Image.open(image_path).size)
                row.update(status=obj["status"], response=obj,
                           weed_pct=vision.metrics(mask, None)["weed_pct"])
                if mask is not None:
                    row["mask"], row["review"] = f"{point_id}.mask.png", f"{point_id}.review.png"
                    mask.save(directory / row["mask"])
                    with Image.open(image_path) as image:
                        sheet(image.convert("RGB"), mask, row["weed_pct"], point_id).save(directory / row["review"])
                    row["confidence"], row["confidence_band"] = confianza(obj["polygons"])
            except (OSError, ValueError, TypeError, KeyError, AttributeError, IndexError, RecursionError):
                row.update(status="invalid_response", weed_pct=None)
        run_data["results"].append(row)
        save_report(directory, run_data)
        print(f"{point_id}: {row['status']} {row.get('weed_pct')}", flush=True)
    contact_sheet(directory, run_data["results"])
    save_report(directory, run_data)
    print(directory / "report.md")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    check() if args.check else run()
