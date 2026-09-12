"""Build data/lote-history.json: peak NDVI per soy campaign over the demo lot.

For each campaign (harvest years 2019..2025 = campaigns 2018/19..2024/25)
search Sentinel-2 L2A scenes over the AOI between Jan 15 and Mar 15 with
scene-level cloud cover < 10 %, compute the offset-corrected NDVI median
over the polygon for the least cloudy scenes, and keep the PEAK. Add the
Open-Meteo rain sum for Dec-Feb (the critical window for soy in Cordoba)
and the 7-day rain ending on the peak date.

Reuses scripts/build_pack.py for the STAC catalog URL, SAS signing, the
per-scene reflectance offset (only baselines >= 04.00 carry the -1000 DN
shift) and the Open-Meteo 7-day sum. The pixel-count assertion of
build_pack.ndvi_stats is relaxed here because scenes from other years may
sit on a neighbouring tile grid and yield 1 px more or less per side.

Usage (needs the .venv-build deps: pystac-client, planetary-computer,
rasterio, numpy, requests):
    python scripts/build_history.py            # writes data/lote-history.json
    python scripts/build_history.py --dry-run  # search only, no raster reads
"""

from __future__ import annotations

import argparse
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List

sys.path.insert(0, str(Path(__file__).resolve().parent))
import build_pack as bp  # noqa: E402

HARVEST_YEARS = list(range(2019, 2026))  # 2019 -> campaign 2018/19
PEAK_WINDOW = ("01-15", "03-15")
WIDE_WINDOW = ("01-01", "03-31")
MAX_CLOUD_PCT = 10.0
MAX_SCENES_PER_CAMPAIGN = 6
PIXEL_TOLERANCE = 0.05  # accept +-5 % around EXPECTED_N_PIXELS
OUT_PATH = bp.DATA_DIR / "lote-history.json"


def campaign_label(harvest_year: int) -> str:
    return f"{harvest_year - 1}/{str(harvest_year)[2:]}"


def search_scenes(bbox: list, start: str, end: str, max_cloud: float) -> list:
    import pystac_client

    catalog = pystac_client.Client.open(bp.STAC_URL)
    search = catalog.search(
        collections=["sentinel-2-l2a"],
        bbox=bbox,
        datetime=f"{start}T00:00:00Z/{end}T23:59:59Z",
        query={"eo:cloud_cover": {"lt": max_cloud}},
        max_items=60,
    )
    items = list(search.items())
    # One scene per date: prefer the pinned tile, then the lowest cloud cover.
    by_date: Dict[str, Any] = {}
    for it in items:
        date = it.datetime.strftime("%Y-%m-%d")
        rank = (0 if "T20JML" in it.id else 1, it.properties.get("eo:cloud_cover", 100.0))
        if date not in by_date or rank < by_date[date][0]:
            by_date[date] = (rank, it)
    unique = [v[1] for v in by_date.values()]
    unique.sort(key=lambda it: it.properties.get("eo:cloud_cover", 100.0))
    return unique


def ndvi_stats_relaxed(item, bbox: list) -> Dict[str, Any]:
    """Same maths as build_pack.ndvi_stats, tolerant pixel count."""
    import numpy as np
    import rasterio
    from rasterio.warp import transform_bounds
    from rasterio.windows import from_bounds

    baseline = item.properties.get("s2:processing_baseline", "00.00")
    offset = bp.ndvi_offset_for_baseline(baseline)

    def read_window(asset_key: str):
        href = item.assets[asset_key].href
        with rasterio.open(href) as ds:
            if ds.crs.to_epsg() != bp.SCENE_CRS_EPSG:
                raise RuntimeError(f"unexpected CRS EPSG:{ds.crs.to_epsg()} for {item.id}")
            left, bottom, right, top = transform_bounds("EPSG:4326", ds.crs, *bbox)
            window = from_bounds(left, bottom, right, top, transform=ds.transform)
            return ds.read(1, window=window).astype("float64")

    red = (read_window("B04") + offset) / 10000.0
    nir = (read_window("B08") + offset) / 10000.0
    denom = nir + red
    with np.errstate(invalid="ignore", divide="ignore"):
        ndvi = np.where(denom == 0, np.nan, (nir - red) / denom)
    valid = ndvi[~np.isnan(ndvi)].flatten().tolist()
    n = len(valid)
    lo = bp.EXPECTED_N_PIXELS * (1 - PIXEL_TOLERANCE)
    hi = bp.EXPECTED_N_PIXELS * (1 + PIXEL_TOLERANCE)
    if not (lo <= n <= hi):
        raise RuntimeError(f"pixel count {n} outside tolerance for {item.id}")
    return {
        "mean": round(sum(valid) / n, 4),
        "median": round(bp.statistics_median(valid), 4),
        "p10": round(bp.percentile(valid, 10), 4),
        "p90": round(bp.percentile(valid, 90), 4),
        "n_pixels": n,
        "processing_baseline": baseline,
        "ndvi_offset_applied": offset,
    }


def rain_sum(lat: float, lon: float, start: str, end: str) -> float:
    import requests

    resp = requests.get(
        "https://archive-api.open-meteo.com/v1/archive",
        params={
            "latitude": lat,
            "longitude": lon,
            "start_date": start,
            "end_date": end,
            "daily": "precipitation_sum",
            "timezone": bp.RAIN_TIMEZONE,
        },
        timeout=30,
    )
    resp.raise_for_status()
    daily = resp.json()["daily"]["precipitation_sum"]
    return round(sum(v for v in daily if v is not None), 1)


def build_campaign(harvest_year: int, dry_run: bool) -> Dict[str, Any]:
    label = campaign_label(harvest_year)
    start, end = (f"{harvest_year}-{PEAK_WINDOW[0]}", f"{harvest_year}-{PEAK_WINDOW[1]}")
    items = search_scenes(bp.AOI_BBOX, start, end, MAX_CLOUD_PCT)
    widened = False
    if not items:
        widened = True
        start, end = (f"{harvest_year}-{WIDE_WINDOW[0]}", f"{harvest_year}-{WIDE_WINDOW[1]}")
        items = search_scenes(bp.AOI_BBOX, start, end, MAX_CLOUD_PCT)
    print(f"[{label}] window {start}..{end}{' (widened)' if widened else ''}: {len(items)} clean scenes", flush=True)

    scenes: List[Dict[str, Any]] = []
    skipped: List[Dict[str, str]] = []
    for it in items[:MAX_SCENES_PER_CAMPAIGN]:
        date = it.datetime.strftime("%Y-%m-%d")
        cloud = round(float(it.properties.get("eo:cloud_cover", 0.0)), 4)
        if dry_run:
            scenes.append({"date": date, "scene_id": it.id, "cloud_cover_pct": cloud})
            continue
        try:
            st = ndvi_stats_relaxed(bp.sign(it), bp.AOI_BBOX)
        except Exception as exc:  # noqa: BLE001 - record and continue
            skipped.append({"scene_id": it.id, "reason": str(exc)[:160]})
            print(f"  skip {it.id}: {str(exc)[:100]}", flush=True)
            continue
        scenes.append({"date": date, "scene_id": it.id, "cloud_cover_pct": cloud, **st})
        print(f"  {date} {it.id[:26]}.. cloud {cloud:.2f}% baseline {st['processing_baseline']} median {st['median']:.3f}", flush=True)

    row: Dict[str, Any] = {
        "campaign": label,
        "harvest_year": harvest_year,
        "window": {"start": start, "end": end, "widened": widened},
        "scenes_evaluated": scenes,
        "scenes_skipped": skipped,
    }
    if dry_run or not scenes:
        row["peak"] = None
        row["note"] = "no clean scene with a valid read in the window" if not scenes else "dry run"
        return row

    peak = max(scenes, key=lambda s: s["median"])
    row["peak"] = {
        "date": peak["date"],
        "scene_id": peak["scene_id"],
        "cloud_cover_pct": peak["cloud_cover_pct"],
        "processing_baseline": peak["processing_baseline"],
        "ndvi_offset_applied": peak["ndvi_offset_applied"],
        "ndvi": round(peak["median"], 3),
        "ndvi_stat": "median",
        "ndvi_stats": {k: peak[k] for k in ("mean", "median", "p10", "p90", "n_pixels")},
        "source": "measured",
    }
    row["rain_dec_feb_mm"] = rain_sum(bp.CENTER["lat"], bp.CENTER["lon"], f"{harvest_year - 1}-12-01", f"{harvest_year}-02-28")
    row["rain_mm_7d_at_peak"] = bp.rain_7d(bp.CENTER["lat"], bp.CENTER["lon"], peak["date"])
    row["rain_source"] = "measured"
    return row


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    parser.add_argument("--dry-run", action="store_true", help="STAC search only, no raster reads, no file written")
    parser.add_argument("--years", type=int, nargs="*", default=HARVEST_YEARS, help="harvest years to build")
    args = parser.parse_args(argv)

    campaigns = [build_campaign(y, args.dry_run) for y in args.years]
    if args.dry_run:
        return 0

    presets = bp.read_json(bp.DATA_DIR / "lote-sentinel-presets.json")
    out = {
        "schema_version": 1,
        "pack_version": presets["pack_version"],
        "lote_id": presets["lote_id"],
        "generated_at_utc": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "method": {
            "satellite": "Sentinel-2 L2A via Planetary Computer STAC; scene-level eo:cloud_cover < 10 %; one scene per date, pinned tile T20JML preferred",
            "ndvi": "BOA = (DN + offset)/10000 with offset -1000 only for processing_baseline >= 04.00; NDVI = (B08-B04)/(B08+B04); median over the AOI bbox",
            "peak": "max of the per-scene medians inside the window; the window is widened to Jan 1 - Mar 31 only when the Jan 15 - Mar 15 window has no clean scene (flagged)",
            "rain": "Open-Meteo archive daily precipitation_sum at the lot centre; rain_dec_feb_mm = Dec 1 (previous year) .. Feb 28; rain_mm_7d_at_peak = 7 days ending on the peak date",
            "caveat": "One peak scene per campaign. A cloudy February leaves a gap or a lower peak; gaps are shown, never filled.",
        },
        "campaigns": campaigns,
    }
    bp.write_json(OUT_PATH, out)
    print(f"wrote {OUT_PATH}")
    for c in campaigns:
        p = c["peak"]
        print(f"  {c['campaign']}: " + (f"peak {p['date']} ndvi {p['ndvi']} rain_dec_feb {c['rain_dec_feb_mm']} mm" if p else "NO PEAK"))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
