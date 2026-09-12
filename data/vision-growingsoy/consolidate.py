"""Consolida las corridas de un modelo y prompt sobre weeds-v2:
python -B data/vision-growingsoy/consolidate.py [modelo]
Una sola respuesta evaluable por foto; si hubiera mas de una, falla en vez de elegir."""
import json, statistics, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
MODEL = sys.argv[1] if len(sys.argv) > 1 else "gemini-3.6-flash"

def main():
    manifest = json.loads((ROOT / "weeds-v2" / "manifest.json").read_text(encoding="utf-8"))
    planned = [i for i in manifest["images"] if i["split"] == "desarrollo"]
    assessed, attempts = {}, {}
    for path in sorted((ROOT / "runs").glob("*/run.json")):
        run = json.loads(path.read_text(encoding="utf-8"))
        if run.get("model") != MODEL:
            continue
        for r in run.get("results", []):
            if r["id"] == "control" or r["status"] == "blocked":
                continue
            attempts.setdefault(r["id"], []).append(r["status"])
            if r["status"] == "assessed":
                # No escoger entre reintentos: una foto con dos respuestas evaluables es un error.
                assert r["id"] not in assessed, f"{r['id']} tiene mas de una respuesta evaluable"
                assessed[r["id"]] = r
    rows = []
    for image in sorted(planned, key=lambda i: -i["reference_pct"]):
        rows.append((image["id"], image["reference_pct"], assessed.get(image["id"]),
                     attempts.get(image["id"], [])))
    print(f"Modelo: {MODEL} · prompt v2 · conjunto weeds-v2 (desarrollo)\n")
    print(f"{'foto':6} {'ref %':>9} {'pred %':>9} {'err pp':>8} {'IoU':>7}  intentos")
    for gid, ref, res, tries in rows:
        n = lambda v: "—" if v is None else f"{v:.4f}"
        if res:
            print(f"{gid:6} {ref:>8.4f}% {res['weed_pct']:>8.4f}% "
                  f"{res['absolute_error_pp']:>8.4f} {n(res['iou']):>7}  {','.join(tries)}")
        else:
            print(f"{gid:6} {ref:>8.4f}% {'—':>9} {'—':>8} {'—':>7}  {','.join(tries) or 'sin enviar'}")
    errs = [r["absolute_error_pp"] for _, _, r, _ in rows if r]
    ious = [r["iou"] for _, _, r, _ in rows if r and r["iou"] is not None]
    print(f"\nEvaluadas: {len(errs)}/{len(rows)}")
    print(f"MAE: {statistics.fmean(errs):.4f} pp" if errs else "MAE: sin dato")
    if ious:
        print(f"IoU media: {statistics.fmean(ious):.4f} · mediana {statistics.median(ious):.4f} "
              f"· minimo {min(ious):.4f} · maximo {max(ious):.4f}")
        print(f"IoU por debajo de 0,3: {sum(1 for v in ious if v < 0.3)}/{len(ious)}")
    # Sesgo con signo: un MAE bajo puede esconder subestimacion sistematica, que en el
    # score de PreCrop empuja el semaforo hacia verde.
    signed = [r["weed_pct"] - ref for _, ref, r, _ in rows if r]
    if signed:
        print(f"Sesgo medio: {statistics.fmean(signed):+.4f} pp "
              f"({sum(1 for v in signed if v < 0)}/{len(signed)} por debajo de la referencia)")
    alta = [r["iou"] for _, ref, r, _ in rows if r and ref >= 10 and r["iou"] is not None]
    baja = [r["iou"] for _, ref, r, _ in rows if r and ref < 10 and r["iou"] is not None]
    if alta and baja:
        print(f"IoU media con referencia >= 10%: {statistics.fmean(alta):.4f} ({len(alta)} fotos)")
        print(f"IoU media con referencia <  10%: {statistics.fmean(baja):.4f} ({len(baja)} fotos)")


if __name__ == "__main__":
    main()
