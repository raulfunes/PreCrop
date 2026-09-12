"""Offline reference preparation; uses the already installed Pillow. See VISION-IA.md."""
import argparse
from collections import Counter, defaultdict
import hashlib
import json
import math
from pathlib import Path
import re
import statistics

from PIL import Image, ImageDraw, __version__ as PILLOW_VERSION

ROOT = Path(__file__).resolve().parent
COMMIT = "0047fc2258c1cff54fe2c4ed325b12c9681d25be"
BASE = f"https://raw.githubusercontent.com/raulsteinmetz/soy-segmentation-ds/{COMMIT}"
LEVELS = ("baja", "intermedia", "alta")


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def write_json(path, value):
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def union_mask(annotations, width, height, categories=(1, 2)):
    mask = Image.new("1", (width, height))
    draw = ImageDraw.Draw(mask)
    for annotation in annotations:
        if annotation["category_id"] in categories:
            for polygon in annotation["segmentation"]:
                # ponytail: floor + Pillow fill includes edges (about 1 pixel uncertainty).
                # For COCO benchmark compatibility, replace with official maskApi rasterization.
                draw.polygon([(math.floor(x), math.floor(y))
                              for x, y in zip(polygon[::2], polygon[1::2])], fill=1)
    return mask


def annotation_error(image, annotations):
    width, height = image["width"], image["height"]
    if type(width) is not int or type(height) is not int or min(width, height) <= 0:
        return "invalid_dimensions"
    if not annotations:
        return "no_annotations_not_verified_zero"
    for a in annotations:
        if a["category_id"] not in (1, 2, 3) or a.get("iscrowd") != 0:
            return "unknown_category_or_crowd"
        if not isinstance(a.get("segmentation"), list) or not a["segmentation"]:
            return "missing_polygon"
        for p in a["segmentation"]:
            if not isinstance(p, list) or len(p) < 6 or len(p) % 2:
                return "invalid_polygon"
            if any(type(v) not in (int, float) or not math.isfinite(v) for v in p):
                return "invalid_coordinate"
            if any(not (0 <= x <= width and 0 <= y <= height)
                   for x, y in zip(p[::2], p[1::2])):
                return "out_of_bounds_polygon"
            if not union_mask([dict(a, segmentation=[p])], width, height, (1, 2, 3)).getbbox():
                return "empty_polygon"
    return None


def catalogue():
    rows, excluded, lookup = [], [], {}
    for split in ("train", "valid", "test"):
        data = json.loads((ROOT / "source" / f"{split}.coco.json").read_text(encoding="utf-8"))
        assert {c["id"]: c["name"] for c in data["categories"]} == {
            0: "soy, weeds", 1: "caruru_weed", 2: "grassy_weed", 3: "soy_plant"}
        grouped = defaultdict(list)
        for a in data["annotations"]:
            grouped[a["image_id"]].append(a)
        assert len({i["id"] for i in data["images"]}) == len(data["images"])
        assert set(grouped) <= {i["id"] for i in data["images"]}
        for image in data["images"]:
            key = f"{split}:{image['id']}"
            annotations = grouped[image["id"]]
            error = annotation_error(image, annotations)
            if error:
                excluded.append({"key": key, "file_name": image["file_name"], "reason": error})
                continue
            match = re.fullmatch(r"(.+)_frame(\d+)_jpg\.rf\.[a-f0-9]+\.jpg", image["file_name"])
            assert match, image["file_name"]
            pixels = image["width"] * image["height"] - union_mask(
                annotations, image["width"], image["height"]).histogram()[0]
            rows.append({"key": key, "source_split": split, "original_id": image["id"],
                         "file_name": image["file_name"], "clip": match[1], "frame": int(match[2]),
                         "width": image["width"], "height": image["height"],
                         "weed_pixels": pixels, "total_pixels": image["width"] * image["height"],
                         "reference_pct": 100 * pixels / (image["width"] * image["height"]),
                         "weed_instances": sum(a["category_id"] in (1, 2) for a in annotations)})
            lookup[key] = annotations
    rows.sort(key=lambda r: (r["reference_pct"], r["file_name"], r["key"]))
    for index, row in enumerate(rows):
        row["rank"] = index + 1
        row["level"] = LEVELS[min(2, index * 3 // len(rows))]
    return rows, excluded, lookup


def inventory():
    rows, excluded, _ = catalogue()
    write_json(ROOT / "catalogue.json", {"commit": COMMIT, "pillow": PILLOW_VERSION,
               "eligible": rows, "excluded": excluded})
    print("Eligible:", len(rows), "Excluded:", len(excluded))
    print("Zero weed masks:", sum(r["weed_pixels"] == 0 for r in rows))
    for level in LEVELS:
        group = [r for r in rows if r["level"] == level]
        print(level, len(group), group[0]["reference_pct"], group[-1]["reference_pct"])
    for clip in sorted({r["clip"] for r in rows}):
        group = [r for r in rows if r["clip"] == clip]
        print(clip, dict(Counter(r["level"] for r in group)),
              "frames", min(r["frame"] for r in group), max(r["frame"] for r in group))


def candidates():
    rows = json.loads((ROOT / "catalogue.json").read_text(encoding="utf-8"))["eligible"]
    final_clips = {"20221221-GX010104", "20221221-GX010110", "20221227-GX010170", "20230114-GX010238"}
    selected = []
    for level in LEVELS:
        group = [r for r in rows if r["level"] == level]
        for slot in range(5):
            split = "final" if slot in (1, 3) else "desarrollo"
            target = group[int(len(group) * (slot + .5) / 5)]["rank"]
            pool = [r for r in group if (r["clip"] in final_clips) == (split == "final")]
            for row in sorted(pool, key=lambda r: (abs(r["rank"] - target), r["rank"])):
                siblings = [s for s in selected if s["clip"] == row["clip"]]
                if len(siblings) >= 2 or any(abs(s["frame"] - row["frame"]) < 400 for s in siblings):
                    continue
                selected.append(dict(row, id=f"GS{len(selected)+1:02d}", split=split,
                                     source_url=f"{BASE}/labeled/{row['source_split']}/{row['file_name']}",
                                     target_rank=target))
                break
            else:
                raise ValueError(f"No candidate for {level}/{slot}")
    write_json(ROOT / "selection.json", selected)
    for r in selected:
        print(r["id"], r["split"], r["level"], r["key"], r["clip"], r["frame"], r["reference_pct"])


def review():
    selected = json.loads((ROOT / "selection.json").read_text(encoding="utf-8"))
    _, _, lookup = catalogue()
    (ROOT / "review").mkdir(exist_ok=True)
    for level in LEVELS:
        sheet = Image.new("RGB", (768, 2040), "white")
        draw = ImageDraw.Draw(sheet)
        for index, row in enumerate(r for r in selected if r["level"] == level):
            with Image.open(ROOT / "images" / row["split"] / f"{row['id']}.jpg") as image:
                assert image.size == (row["width"], row["height"])
                rgb = image.convert("RGB")
            overlay = rgb.copy()
            for categories, color in [((3,), "cyan"), ((1, 2), "red")]:
                mask = union_mask(lookup[row["key"]], row["width"], row["height"], categories)
                overlay.paste(Image.blend(overlay, Image.new("RGB", rgb.size, color), .4), (0, 0), mask)
            y = index * 408
            draw.text((4, y + 4), f"{row['id']} {row['split']} {row['key']} {row['reference_pct']:.4f}% | soy=cyan weeds=red", fill="black")
            sheet.paste(rgb.resize((384, 384)), (0, y + 24))
            sheet.paste(overlay.resize((384, 384)), (384, y + 24))
        sheet.save(ROOT / "review" / f"{level}.jpg")


def pack(verify=False):
    rows, excluded, lookup = catalogue()
    catalogue_data = {"commit": COMMIT, "pillow": PILLOW_VERSION, "eligible": rows, "excluded": excluded}
    assert json.loads((ROOT / "catalogue.json").read_text(encoding="utf-8")) == catalogue_data
    by_key = {r["key"]: r for r in rows}
    selected = json.loads((ROOT / "selection.json").read_text(encoding="utf-8"))
    assert len(selected) == len({r["key"] for r in selected}) == 15
    assert Counter((r["level"], r["split"]) for r in selected) == Counter(
        {(level, split): count for level in LEVELS for split, count in [("desarrollo", 3), ("final", 2)]})
    assert not ({r["clip"] for r in selected if r["split"] == "final"} &
                {r["clip"] for r in selected if r["split"] == "desarrollo"})
    records, hashes, fingerprints = [], set(), []
    for row in selected:
        assert all(row[k] == v for k, v in by_key[row["key"]].items())
        for other in records:
            assert row["clip"] != other["clip"] or abs(row["frame"] - other["frame"]) >= 400
        path = ROOT / "images" / row["split"] / f"{row['id']}.jpg"
        sha = digest(path)
        assert sha not in hashes, "Duplicate image"
        hashes.add(sha)
        with Image.open(path) as image:
            assert image.format == "JPEG" and image.mode == "RGB"
            assert image.size == (row["width"], row["height"])
            thumbnail = image.convert("L").resize((9, 8), Image.Resampling.LANCZOS)
            bits = [thumbnail.getpixel((x, y)) > thumbnail.getpixel((x + 1, y))
                    for y in range(8) for x in range(8)]
        # ponytail: dHash only flags similar global layouts; visual review handles shifted frames.
        distances = [sum(a != b for a, b in zip(bits, previous)) for previous in fingerprints]
        assert not distances or min(distances) > 5, f"Review near duplicate: {row['id']}"
        fingerprints.append(bits)
        mask = union_mask(lookup[row["key"]], row["width"], row["height"])
        assert row["weed_pixels"] == row["total_pixels"] - mask.histogram()[0]
        mask_path = ROOT / "masks" / f"{row['id']}.png"
        if verify:
            with Image.open(mask_path) as stored:
                assert stored.mode == "1" and stored.size == mask.size
                assert stored.tobytes() == mask.tobytes()
        else:
            mask_path.parent.mkdir(exist_ok=True)
            mask.save(mask_path)
        records.append(dict(row, expected_crop="soja", license="MIT",
                            license_file="source/LICENSE", image_path=path.relative_to(ROOT).as_posix(),
                            mask_path=mask_path.relative_to(ROOT).as_posix(),
                            sha256=sha, mask_sha256=digest(mask_path),
                            visual_review="Revisión técnica de RGB y overlay; sin omisión evidente de malezas. No certificación agronómica.",
                            gps_precrop_verified=False))
    control_path = ROOT / "controls" / "no-interpretable.png"
    control = Image.new("RGB", (640, 640), (128, 128, 128))
    if verify:
        with Image.open(control_path) as stored:
            assert stored.mode == "RGB" and stored.size == control.size
            assert stored.tobytes() == control.tobytes()
    else:
        control_path.parent.mkdir(exist_ok=True)
        control.save(control_path)
    manifest = {"dataset": "GrowingSoy / soy-segmentation-ds", "commit": COMMIT,
                "source": "https://github.com/raulsteinmetz/soy-segmentation-ds",
                "license": "MIT; Copyright (c) 2023 Raul Steinmetz",
                "pillow": PILLOW_VERSION, "rasterization": "floor coordinates; Pillow ImageDraw polygon fill; binary union",
                "denominator": "width * height; all pixels including soy, soil, residue and field objects",
                "source_sha256": {p.name: digest(p) for p in sorted((ROOT / "source").iterdir())},
                "selection_sha256": digest(ROOT / "selection.json"),
                "control": {"path": control_path.relative_to(ROOT).as_posix(),
                            "sha256": digest(control_path), "source": "Generated locally; uniform RGB 128",
                            "expected_status": "not_assessable", "reference_pct": None,
                            "included_in_mae": False},
                "images": records}
    if verify:
        assert json.loads((ROOT / "manifest.json").read_text(encoding="utf-8")) == manifest
    else:
        write_json(ROOT / "manifest.json", manifest)
    print("OK: 15 RGB photos, references, source hashes, masks, split and duplicate checks.")


def strict_json(text):
    def pairs(items):
        result = {}
        for key, value in items:
            if key in result:
                raise ValueError("Duplicate JSON key")
            result[key] = value
        return result

    def constant(value):
        raise ValueError(f"Non-finite JSON constant: {value}")

    return json.loads(text, object_pairs_hook=pairs, parse_constant=constant)


def validate_response(raw):
    if not isinstance(raw, str) or len(raw) > 20000:
        raise ValueError("Response must be bounded JSON text")
    obj = strict_json(raw)
    if not isinstance(obj, dict) or set(obj) != {"status", "weed_pct", "reason", "limitations"}:
        raise ValueError("Invalid response fields")
    if not isinstance(obj["reason"], str) or not 1 <= len(obj["reason"].strip()) <= 600:
        raise ValueError("Invalid reason")
    limits = obj["limitations"]
    if not isinstance(limits, list) or len(limits) > 8 or any(
            not isinstance(s, str) or not 1 <= len(s.strip()) <= 300 for s in limits):
        raise ValueError("Invalid limitations")
    value = obj["weed_pct"]
    if obj["status"] == "estimated":
        if type(value) not in (int, float) or not 0 <= value <= 100 or not math.isfinite(value):
            raise ValueError("Invalid estimated percentage")
    elif obj["status"] == "not_assessable":
        if value is not None:
            raise ValueError("Abstention requires null")
    else:
        raise ValueError("Invalid status")
    return obj


def score(rows, results):
    ids = {r["id"] for r in rows}
    attempts = {}
    for item in results:
        if not isinstance(item, dict) or item.get("id") not in ids or item["id"] in attempts:
            raise ValueError("Unknown or duplicate image ID")
        if set(item) not in ({"id", "raw_response"}, {"id", "api_error"}):
            raise ValueError("Provide raw_response OR api_error")
        if "api_error" in item and (not isinstance(item["api_error"], str) or not item["api_error"].strip()):
            raise ValueError("Empty API error")
        attempts[item["id"]] = item
    table, counts, errors = [], Counter(), []
    for row in rows:
        item, value, error = attempts.get(row["id"]), None, None
        if item is None:
            state = "pendiente"
        elif "api_error" in item:
            state = "error_api"
        else:
            try:
                obj = validate_response(item["raw_response"])
                state, value = obj["status"], obj["weed_pct"]
                if state == "estimated":
                    error = abs(value - row["reference_pct"])
                    errors.append(error)
            except (ValueError, TypeError):
                state = "respuesta_invalida"
        counts[state] += 1
        table.append((row, state, value, error))
    return table, counts, statistics.mean(errors) if errors else None


def evaluate(path):
    run = strict_json(path.read_text(encoding="utf-8-sig"))
    if set(run) != {"phase", "model", "provider", "date", "expected_crop", "prompt_sha256", "results"}:
        raise ValueError("Invalid run fields; see VISION-IA.md")
    if run["phase"] not in ("desarrollo", "final") or run["expected_crop"] != "soja":
        raise ValueError("GrowingSoy evaluates soy only")
    if any(not isinstance(run[k], str) or not run[k].strip() for k in ("model", "provider", "date")):
        raise ValueError("Missing run provenance")
    if run["prompt_sha256"] != digest(ROOT / "prompt.txt"):
        raise ValueError("Prompt hash mismatch; use the exact frozen prompt")
    if not isinstance(run["results"], list):
        raise ValueError("results must be an array")
    rows = [r for r in json.loads((ROOT / "manifest.json").read_text(encoding="utf-8"))["images"]
            if r["split"] == run["phase"]]
    table, counts, mean = score(rows, run["results"])
    print("| Foto | Tercio | Referencia % | Estado | Estimación % | Error absoluto (pp) |")
    print("| --- | --- | ---: | --- | ---: | ---: |")
    for row, state, value, error in table:
        value_text = "—" if value is None else f"{value:.4f}"
        error_text = "—" if error is None else f"{error:.4f}"
        print(f"| {row['id']} | {row['level']} | {row['reference_pct']:.4f} | {state} | {value_text} | {error_text} |")
    print("\nMAE (pp):", "sin estimaciones" if mean is None else f"{mean:.4f}")
    print("Conteos:", json.dumps(dict(counts), ensure_ascii=False))
    print(f"Estimaciones válidas: {counts['estimated']}/{len(rows)}")


def self_check():
    def polygon(points, category=1):
        return {"category_id": category, "segmentation": [points], "iscrowd": 0}

    a = polygon([0, 0, 1, 0, 1, 1, 0, 1])
    b = polygon([1, 0, 2, 0, 2, 1, 1, 1], 2)
    soy = polygon([0, 0, 3, 0, 3, 3, 0, 3], 3)
    mask = union_mask([a, a, b, soy], 4, 4)
    assert 16 - mask.histogram()[0] == 6  # Overlap once; crop and soil stay in denominator.
    assert 100 * (16 - mask.histogram()[0]) / 16 == 37.5
    assert union_mask([soy], 4, 4).getbbox() is None
    assert annotation_error({"width": 4, "height": 4}, []) is not None
    assert annotation_error({"width": 4, "height": 4}, [polygon([])]) is not None
    valid = {"status": "estimated", "weed_pct": 0, "reason": "Sin malezas visibles.", "limitations": []}
    for value in (0, 100):
        assert validate_response(json.dumps(dict(valid, weed_pct=value)))["weed_pct"] == value
    abstain = dict(valid, status="not_assessable", weed_pct=None)
    assert validate_response(json.dumps(abstain))["weed_pct"] is None
    invalid = ["not JSON", "[]", '{"status":1,"status":2}', json.dumps(dict(valid, extra=1))]
    invalid += [json.dumps(dict(valid, weed_pct=v)) for v in (True, "0", None, -1, 101, 10**400, float("nan"), float("inf"))]
    invalid += [json.dumps(dict(abstain, weed_pct=0)), json.dumps(dict(valid, status="unknown"))]
    for raw in invalid:
        try:
            validate_response(raw)
        except (ValueError, TypeError):
            pass
        else:
            raise AssertionError(f"Accepted invalid response: {raw}")
    rows = [{"id": str(i), "reference_pct": 10} for i in range(5)]
    results = [{"id": "0", "raw_response": json.dumps(valid)},
               {"id": "1", "raw_response": json.dumps(abstain)},
               {"id": "2", "raw_response": "broken"}, {"id": "3", "api_error": "timeout"}]
    _, counts, mean = score(rows, results)
    assert mean == 10 and counts == Counter(estimated=1, not_assessable=1, respuesta_invalida=1, error_api=1, pendiente=1)
    assert score(rows, [results[1]])[2] is None
    for bad in ([results[0], results[0]], [{"id": "unknown", "api_error": "timeout"}]):
        try:
            score(rows, bad)
        except ValueError:
            pass
        else:
            raise AssertionError("Accepted duplicate/unknown ID")
    print("OK: mask union, full denominator, incomplete labels, contract, errors and abstentions.")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("command", choices=["inventory", "candidates", "review", "pack", "verify", "self-check", "evaluate"])
    parser.add_argument("run", nargs="?", type=Path)
    args = parser.parse_args()
    if args.command == "evaluate":
        if args.run is None:
            parser.error("evaluate requires a run JSON file")
        evaluate(args.run)
    else:
        {"inventory": inventory, "candidates": candidates, "review": review, "pack": pack,
         "verify": lambda: pack(verify=True), "self-check": self_check}[args.command]()
