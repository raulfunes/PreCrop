"""Reproduction + audit tool for the PreCrop evidence data pack.

This is the SKELETON (SDD tasks 3.1 / Phase 3): CONFIG constants, JSON I/O
with pinned LF line endings, the "precrop-canon-v1" canonicalisation +
sha256 rule, and evidence-report assembly from the already-committed v2
pack files (data/lote-sentinel-presets.json, data/demo-scenarios.json,
data/photo-point-presets.json).

The full reproduction layer (STAC fetch, rasterio NDVI stats, Open-Meteo
rain, --write/--check/--fetch-photos) lands in a later batch (Phase 4).
rasterio is intentionally NOT imported anywhere in this skeleton so that
`python scripts/build_pack.py --help` (and the test suite that imports
this module) work on a machine without rasterio installed.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict

ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = ROOT / "data"

# ---------------------------------------------------------------------------
# CONFIG - the only place constants live (per design)
# ---------------------------------------------------------------------------

AOI_BBOX = [-63.7254, -31.4245, -63.7146, -31.4155]
CENTER = {"lat": -31.42, "lon": -63.72}

SCENES = {
    "fecha_buena": "S2B_MSIL2A_20250202T140709_R110_T20JML_20250202T175010",
    "fecha_mala": "S2C_MSIL2A_20250207T140811_R110_T20JML_20250207T174511",
}

RAIN_WINDOWS = {
    "fecha_buena": {"start": "2025-01-27", "end": "2025-02-02"},
    "fecha_mala": {"start": "2025-02-01", "end": "2025-02-07"},
}

PINNED_WEEDS = {"bueno": 12, "mixto": 55, "malo": 65}

NDVI_FLOOR = 0.20
NDVI_CEILING = 0.85

WEIGHTS = {"ndvi_norm": 0.6, "climate": 0.25, "weeds_pct": -0.15}

THRESHOLDS = {"verde_min": 70, "amarillo_min": 50}

CLIMATE_TABLE = [
    {"max_mm": 5, "climate": 25},
    {"max_mm": 15, "climate": 45},
    {"max_mm": 25, "climate": 70},
    {"max_mm": 50, "climate": 90},
    {"max_mm": 80, "climate": 85},
    {"max_mm": None, "climate": 60},
]

CANON_VERSION = "precrop-canon-v1"


# ---------------------------------------------------------------------------
# I/O helpers
# ---------------------------------------------------------------------------

def read_json(path: Path) -> Any:
    with path.open("r", encoding="utf-8") as fh:
        return json.load(fh)


def write_json(path: Path, obj: Any) -> None:
    """Write JSON with LF line endings, UTF-8, ensure_ascii=False, trailing newline.

    Windows CRLF would silently change every file's bytes and every git
    diff (see design cross-cutting rules) -- newline="\\n" pins LF
    regardless of the host OS's default.
    """
    text = json.dumps(obj, indent=2, ensure_ascii=False, sort_keys=False)
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8", newline="\n") as fh:
        fh.write(text + "\n")


# ---------------------------------------------------------------------------
# Canonicalisation - "precrop-canon-v1" (see SOURCES.md / design)
# ---------------------------------------------------------------------------

def canonicalize_payload(payload: Dict[str, Any]) -> str:
    """Serialise a FLAT payload per the precrop-canon-v1 rule.

    Keys sorted ascending by Unicode code point, no whitespace anywhere,
    UTF-8 bytes, ensure_ascii=False (payload values must already be
    ASCII-only strings so this never actually escapes anything).
    """
    return json.dumps(
        payload,
        sort_keys=True,
        separators=(",", ":"),
        ensure_ascii=False,
        allow_nan=False,
    )


def hash_payload(payload: Dict[str, Any]) -> str:
    canonical = canonicalize_payload(payload)
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


# ---------------------------------------------------------------------------
# Scoring helpers (Front owns the formula; the pack only publishes it +
# applies it once to compute expected_score / the evidence report's score)
# ---------------------------------------------------------------------------

def climate_from_rain(rain_mm_7d: float) -> int:
    for rule in CLIMATE_TABLE:
        if rule["max_mm"] is None or rain_mm_7d < rule["max_mm"]:
            return rule["climate"]
    return CLIMATE_TABLE[-1]["climate"]


def ndvi_norm(ndvi: float) -> float:
    value = (ndvi - NDVI_FLOOR) / (NDVI_CEILING - NDVI_FLOOR) * 100
    return max(0.0, min(100.0, value))


def score_from_inputs(ndvi: float, rain_mm_7d: float, weeds_pct: float) -> float:
    n = ndvi_norm(ndvi)
    c = climate_from_rain(rain_mm_7d)
    return (
        WEIGHTS["ndvi_norm"] * n
        + WEIGHTS["climate"] * c
        + WEIGHTS["weeds_pct"] * weeds_pct
    )


def light_for_score(score: float) -> str:
    if score >= THRESHOLDS["verde_min"]:
        return "verde"
    if score >= THRESHOLDS["amarillo_min"]:
        return "amarillo"
    return "rojo"


def scene_timestamp_utc(scene_id: str) -> str:
    """Parse the acquisition instant out of a Sentinel-2 scene id.

    e.g. S2B_MSIL2A_20250202T140709_... -> "2025-02-02T14:07:09Z"
    """
    part = scene_id.split("_")[2]
    dt = datetime.strptime(part, "%Y%m%dT%H%M%S").replace(tzinfo=timezone.utc)
    return dt.strftime("%Y-%m-%dT%H:%M:%SZ")


# ---------------------------------------------------------------------------
# Evidence report assembly
# ---------------------------------------------------------------------------

def build_evidence(
    scenario_key: str,
    presets: Dict[str, Any],
    scenarios: Dict[str, Any],
    points: Dict[str, Any],
) -> Dict[str, Any]:
    """Assemble the flat, hashable evidence payload for one scenario.

    Reads the already-committed v2 pack files (each the single source of
    truth for its own inputs) rather than recomputing from raw upstream
    data -- the raw fetch/recompute path is this script's `--write` mode
    (later batch); this function's job is deterministic re-assembly.
    """
    scenario = scenarios["scenarios"][scenario_key]
    preset_key = scenario["satellite_preset"]
    preset = presets["presets"][preset_key]
    weeds_pct = points["scenarios"][scenario_key]["weeds_pct_lote"]

    score_exact = score_from_inputs(preset["ndvi"], preset["rain_mm_7d"], weeds_pct)
    light = light_for_score(score_exact)
    scene_id = preset["sentinel2"]["scene_id"]

    payload: Dict[str, Any] = {
        "cloud_cover_pct": preset["sentinel2"]["cloud_cover_pct"],
        "climate": climate_from_rain(preset["rain_mm_7d"]),
        "collection": preset["sentinel2"]["collection"],
        "evidence_timestamp_utc": scene_timestamp_utc(scene_id),
        "light": light,
        "lote_id": presets["lote_id"],
        "ndvi": preset["ndvi"],
        "ndvi_mean": preset["ndvi_stats"]["mean"],
        "ndvi_method": "BOA=(DN-1000)/10000; NDVI=(B08-B04)/(B08+B04)",
        "ndvi_p10": preset["ndvi_stats"]["p10"],
        "ndvi_p90": preset["ndvi_stats"]["p90"],
        "ndvi_norm": round(ndvi_norm(preset["ndvi"]), 4),
        "ndvi_source": preset["ndvi_source"],
        "ndvi_stat": "median",
        "n_pixels": preset["ndvi_stats"]["n_pixels"],
        "observed_date": preset["date"],
        "processing_baseline": preset["sentinel2"]["processing_baseline"],
        "rain_mm_7d": preset["rain_mm_7d"],
        "rain_source": preset["rain_source"],
        "rain_window_end": preset["rain_window"]["end"],
        "rain_window_start": preset["rain_window"]["start"],
        "scenario": scenario_key,
        "scene_id": scene_id,
        "score": round(score_exact, 4),
        "score_bp": round(score_exact * 100),
        "score_source": "computed_from_published_formula",
        "weeds_pct": weeds_pct,
        "weeds_source": "simulated",
    }
    return payload


def build_evidence_report(
    scenario_key: str,
    presets: Dict[str, Any],
    scenarios: Dict[str, Any],
    points: Dict[str, Any],
    report_id_suffix: str = "v1",
) -> Dict[str, Any]:
    payload = build_evidence(scenario_key, presets, scenarios, points)
    digest = hash_payload(payload)
    return {
        "schema_version": 1,
        "pack_version": presets.get("pack_version", "1.0.0"),
        "report_id": f"precrop-{presets['lote_id']}-{scenario_key}-{report_id_suffix}",
        "canonicalization": CANON_VERSION,
        "generated_at_utc": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "content_sha256": digest,
        "payload": payload,
    }


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def _load_pack_files():
    presets = read_json(DATA_DIR / "lote-sentinel-presets.json")
    scenarios = read_json(DATA_DIR / "demo-scenarios.json")
    points = read_json(DATA_DIR / "photo-point-presets.json")
    return presets, scenarios, points


def _cmd_evidence(write: bool) -> int:
    presets, scenarios, points = _load_pack_files()
    for scenario_key in scenarios["scenarios"]:
        report = build_evidence_report(scenario_key, presets, scenarios, points)
        p = report["payload"]
        print(
            f"{scenario_key}: score={p['score']} light={p['light']} "
            f"sha256={report['content_sha256']}"
        )
        if write:
            write_json(DATA_DIR / "evidence" / f"{scenario_key}.json", report)
    return 0


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(
        description="PreCrop evidence pack build/audit tool."
    )
    parser.add_argument(
        "--only",
        choices=["ndvi", "rain", "assemble", "evidence"],
        help="Run only this stage.",
    )
    parser.add_argument(
        "--write",
        action="store_true",
        help="Write regenerated files to data/ (default: print only).",
    )
    parser.add_argument(
        "--check",
        action="store_true",
        help="Recompute and compare, write nothing. "
        "(full --check lands with the fetch layer, Phase 4)",
    )
    parser.add_argument(
        "--fetch-photos",
        action="store_true",
        help="Not implemented in this skeleton (Phase 4).",
    )
    args = parser.parse_args(argv)

    if args.fetch_photos:
        print("--fetch-photos is not implemented in this skeleton (Phase 4).")
        return 2

    if args.only in (None, "evidence"):
        return _cmd_evidence(write=args.write)

    print(
        f"--only {args.only} is not implemented yet in this skeleton "
        "(fetch/ndvi/rain layer lands in a later batch)."
    )
    return 2


if __name__ == "__main__":
    raise SystemExit(main())
