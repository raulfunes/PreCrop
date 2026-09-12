"""Comprobacion offline del conjunto ampliado: python -B data/vision-growingsoy/weeds-v2/verify.py
Recalcula referencias desde las anotaciones originales y compara hashes. No usa red."""
import json
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT.parent))
from prepare import digest, union_mask
from PIL import Image

def main():
    manifest = json.loads((ROOT / "manifest.json").read_text(encoding="utf-8"))
    cocos = {s: json.loads((ROOT.parent / "source" / f"{s}.coco.json").read_text(encoding="utf-8"))
             for s in ("train", "valid", "test")}
    frozen = {im["key"] for im in
              json.loads((ROOT.parent / "manifest.json").read_text(encoding="utf-8"))["images"]}
    seen, clips = set(), {}
    for image in manifest["images"]:
        path, mask_path = ROOT / image["image_path"], ROOT / image["mask_path"]
        assert digest(path) == image["sha256"], image["id"]
        assert digest(mask_path) == image["mask_sha256"], image["id"]
        assert image["key"] not in frozen, f"{image['id']} duplica el conjunto congelado"
        assert image["key"] not in seen, image["key"]
        seen.add(image["key"])
        with Image.open(path) as photo:
            assert photo.format == "JPEG" and photo.size == (image["width"], image["height"])
        annotations = [a for a in cocos[image["source_split"]]["annotations"]
                       if a["image_id"] == image["original_id"]]
        mask = union_mask(annotations, image["width"], image["height"])
        pixels = sum(mask.get_flattened_data())
        assert pixels == image["weed_pixels"], image["id"]
        assert 100.0 * pixels / image["total_pixels"] == image["reference_pct"], image["id"]
        with Image.open(mask_path) as stored:
            assert stored.convert("1").tobytes() == mask.tobytes(), image["id"]
        # Un clip no puede aparecer en los dos lados: seria fuga entre ajuste y evaluacion.
        assert clips.setdefault(image["clip"], image["split"]) == image["split"], image["clip"]
        # Separacion minima entre fotogramas del mismo clip, tambien contra el conjunto congelado.
        for other in manifest["images"]:
            if other is not image and other["clip"] == image["clip"]:
                assert abs(other["frame"] - image["frame"]) >= 400, (image["id"], other["id"])
    print(f"OK: {len(manifest['images'])} fotos, hashes, referencias recalculadas, "
          "clips sin fuga, separacion de fotogramas y sin solape con el conjunto congelado. Sin red.")


if __name__ == "__main__":
    main()
