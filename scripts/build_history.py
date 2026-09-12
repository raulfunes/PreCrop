"""Per-campaign NDVI + rain history for the PreCrop lote (capacity track).

Builds data/lote-history.json: one row per soy campaign from 2018/19 to
2024/25 with the campaign's PEAK NDVI (the highest per-scene median inside
the summer window), the December-February rain accumulation, and the
provenance of both.

This is the input to the `capacidad-v1` rule: capacity answers "how much
can be advanced BEFORE sowing", measured against the worst year this lote
already had. Condition (the existing pack) answers "does the next
disbursement go out". They are different questions with different rules.

Everything that was already solved in build_pack.py is imported, not
rewritten -- most importantly `ndvi_offset_for_baseline`, which decides the
BOA offset PER SCENE from `s2:processing_baseline`. That matters here far
more than it did for the two pinned 2025 scenes: campaigns before ESA's
2022-01-25 harmonisation carry baselines 02.xx/03.xx and take NO offset,
while later ones take -1000. Getting that wrong tilts the whole series.

Like build_pack.py, rasterio / pystac_client / planetary_computer /
requests are imported LOCALLY inside the functions that need them, so this
module imports (and its pure helpers stay testable) on a machine without
them.

Exit codes follow build_pack.py: 0 ok, 1 mismatch, 2 UNVERIFIED (offline or
upstream unavailable -- deliberately not a failure).

Usage:
    python scripts/build_history.py                 # fetch + print, no write
    python scripts/build_history.py --write         # fetch + write the JSON
    python scripts/build_history.py --check         # compare against committed
"""

from __future__ import annotations

import argparse
import json
import subprocess
import sys
from datetime import date as date_cls, datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

SCRIPTS_DIR = Path(__file__).resolve().parent
ROOT = SCRIPTS_DIR.parent
sys.path.insert(0, str(SCRIPTS_DIR))

import build_pack as bp  # noqa: E402  (path set above)

DATA_DIR = ROOT / "data"
OUT_PATH = DATA_DIR / "lote-history.json"

# ---------------------------------------------------------------------------
# CONFIG
# ---------------------------------------------------------------------------

SCHEMA_VERSION = 1
PACK_VERSION = "1.0.0"  # MUST match the rest of the pack or loadPack() throws
RULE_VERSION = "capacidad-v1"
LOTE_ID = "demo-rio-segundo-01"

CAMPAIGNS = ["2018/19", "2019/20", "2020/21", "2021/22", "2022/23", "2023/24", "2024/25"]

# Summer peak window for soy in central Cordoba: 15 Jan - 15 Mar of the
# HARVEST year. Chosen to bracket the vegetative peak; the campaign's NDVI
# is the maximum per-scene median inside it, not an average of the window.
PEAK_WINDOW_START = (1, 15)
PEAK_WINDOW_END = (3, 15)

# Rain accumulation window: 1 Dec of the sowing year to the last day of Feb
# of the harvest year.
RAIN_WINDOW_START_MONTH = 12

CLOUD_MAX_PCT = 10.0
CLOUD_MAX_PCT_WIDENED = 25.0  # one widening pass before declaring a gap
MAX_SCENES_PER_CAMPAIGN = 14

# ndvi_stats over the AOI box yields 10300 px on a clean scene. Historic
# scenes legitimately come back short (cloud, swath edge, nodata), so the
# count is RECORDED per row instead of asserted -- but a scene with too few
# valid pixels is not representative and is skipped.
MIN_VALID_PIXELS = 8000

CHECK_TOLERANCES = {"ndvi": 0.002, "rain_mm": 0.2}

OPEN_METEO_URL = "https://archive-api.open-meteo.com/v1/archive"

SOURCE_REFS = [
    "https://planetarycomputer.microsoft.com/dataset/sentinel-2-l2a",
    "https://open-meteo.com/en/docs/historical-weather-api",
]


# ---------------------------------------------------------------------------
# Pure helpers -- no network, no rasterio (covered by tests/test_build_history.py)
# ---------------------------------------------------------------------------

def campaign_years(campana: str) -> tuple:
    """("2018/19") -> (2018, 2019): the sowing year and the harvest year.

    The harvest year is DERIVED (sowing + 1) and the label is then checked
    against it, rather than built by gluing the sowing century onto the
    two-digit suffix -- that shortcut turns "1999/00" into 1900.
    """
    left, right = campana.split("/")
    sowing = int(left)
    harvest = sowing + 1
    expected = f"{harvest % 100:02d}" if len(right) == 2 else str(harvest)
    if right != expected:
        raise ValueError(f"campaign must span consecutive years: {campana}")
    return sowing, harvest


def peak_window(campana: str) -> tuple:
    """(start, end) ISO dates of the summer NDVI window for a campaign."""
    _, harvest = campaign_years(campana)
    start = date_cls(harvest, *PEAK_WINDOW_START)
    end = date_cls(harvest, *PEAK_WINDOW_END)
    return start.isoformat(), end.isoformat()


def rain_window(campana: str) -> tuple:
    """(start, end) ISO dates of the Dec-Feb rain accumulation window.

    End is the last day of February, leap years included -- computed as
    1 March minus one day rather than hardcoding 28.
    """
    sowing, harvest = campaign_years(campana)
    start = date_cls(sowing, RAIN_WINDOW_START_MONTH, 1)
    end = date_cls(harvest, 3, 1) - timedelta(days=1)
    return start.isoformat(), end.isoformat()


def sum_rain(times: List[str], values: List[Optional[float]], start: str, end: str) -> float:
    """Sum daily precipitation between start and end (both inclusive).

    Nulls are skipped, matching build_pack.rain_7d. Partitioning one long
    Open-Meteo response locally keeps this to a single upstream request for
    the whole series instead of one per campaign.
    """
    total = 0.0
    for stamp, value in zip(times, values):
        if value is None:
            continue
        if start <= stamp <= end:
            total += value
    return round(total, 1)


def pick_peak(candidates: List[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
    """The scene whose NDVI median is highest -- the campaign's peak.

    Ties break on the earlier date so the result is deterministic across
    reruns regardless of STAC ordering.
    """
    usable = [c for c in candidates if c.get("ndvi") is not None]
    if not usable:
        return None
    return max(usable, key=lambda c: (c["ndvi"], c["date"]))


def series_values(campaigns: List[Dict[str, Any]]) -> List[float]:
    """The NDVI peaks that are actually measured, gaps dropped.

    Gaps are dropped, never coerced to 0: a cloudy February is missing
    evidence, not a failed crop. A zero here would invent the worst year of
    the series out of thin air and drag the pre-sowing limit to nothing.
    """
    return [c["ndvi_peak"] for c in campaigns if c.get("ndvi_peak") is not None]


# ---------------------------------------------------------------------------
# Network layer
# ---------------------------------------------------------------------------

def search_scenes(bbox: list, start: str, end: str, cloud_lt: float) -> list:
    """Sentinel-2 L2A items over the AOI in [start, end] with cloud < pct.

    build_pack.fetch_scene only searches by exact scene id, which is the
    right call for two pinned scenes and useless for a 7-campaign sweep --
    hence a window search here. The cloud filter is server-side via the
    STAC `query` extension so we do not download items we would discard.
    """
    import pystac_client

    catalog = pystac_client.Client.open(bp.STAC_URL)
    search = catalog.search(
        collections=["sentinel-2-l2a"],
        bbox=bbox,
        datetime=f"{start}/{end}",
        query={"eo:cloud_cover": {"lt": cloud_lt}},
    )
    items = list(search.items())

    # ESA reprocesses acquisitions, so the same day can come back twice with
    # different processing baselines (e.g. 2023-02-08 at 04.00 and at 05.10).
    # They are one observation, not two: keep the newest baseline per day so
    # a single day cannot be evaluated twice -- and so the peak is picked
    # from distinct dates.
    newest: Dict[str, Any] = {}
    for item in items:
        day = item.properties.get("datetime", "")[:10]
        baseline = item.properties.get("s2:processing_baseline", "00.00")
        current = newest.get(day)
        if current is None or baseline > current.properties.get("s2:processing_baseline", "00.00"):
            newest[day] = item

    unique = sorted(newest.values(), key=lambda it: it.properties.get("datetime", ""))
    return unique[:MAX_SCENES_PER_CAMPAIGN]


def ndvi_stats_window(item, bbox: list) -> Dict[str, Any]:
    """Offset-corrected NDVI stats over the AOI window for a signed item.

    Same maths as build_pack.ndvi_stats -- same offset function, same
    median, same percentile helper -- with the two hard guards relaxed for
    historic scenes:

      * CRS is recorded, not asserted. The AOI sits in T20JML (EPSG:32720)
        but a neighbouring-tile scene would otherwise raise instead of
        simply being skipped.
      * The pixel count is recorded, not asserted. build_pack asserts
        exactly 10300 because its two scenes are cloud-free; here a scene
        that comes back short is skipped via MIN_VALID_PIXELS rather than
        crashing the whole sweep.

    Returning `None` for a scene is a normal outcome, not an error.
    """
    import numpy as np
    import rasterio
    from rasterio.warp import transform_bounds
    from rasterio.windows import from_bounds

    baseline = item.properties.get("s2:processing_baseline", "00.00")
    offset = bp.ndvi_offset_for_baseline(baseline)
    crs_epsg = None

    def read_window(asset_key: str):
        nonlocal crs_epsg
        href = item.assets[asset_key].href
        with rasterio.open(href) as ds:
            crs_epsg = ds.crs.to_epsg()
            left, bottom, right, top = transform_bounds("EPSG:4326", ds.crs, *bbox)
            window = from_bounds(left, bottom, right, top, transform=ds.transform)
            return ds.read(1, window=window).astype("float64")

    red_dn = read_window("B04")
    nir_dn = read_window("B08")

    boa_red = (red_dn + offset) / 10000.0
    boa_nir = (nir_dn + offset) / 10000.0
    denom = boa_nir + boa_red
    with np.errstate(invalid="ignore", divide="ignore"):
        ndvi = np.where(denom == 0, np.nan, (boa_nir - boa_red) / denom)

    valid = ndvi[~np.isnan(ndvi)].flatten().tolist()
    n_pixels = len(valid)
    if n_pixels < MIN_VALID_PIXELS:
        return {
            "n_pixels": n_pixels,
            "processing_baseline": baseline,
            "crs_epsg": crs_epsg,
            "ndvi": None,
            "skipped": "too_few_valid_pixels",
        }

    return {
        # The pack publishes the MEDIAN, not the mean: the AOI is a ~1 km
        # analysis box that mixes crop with roads and edges (see
        # lote.geojson honesty_note). A mean here would not be comparable
        # with the committed pack values.
        "ndvi": bp.statistics_median(valid),
        "mean": sum(valid) / n_pixels,
        "p10": bp.percentile(valid, 10),
        "p90": bp.percentile(valid, 90),
        "n_pixels": n_pixels,
        "processing_baseline": baseline,
        "crs_epsg": crs_epsg,
    }


def fetch_rain_series(lat: float, lon: float, start: str, end: str) -> Dict[str, list]:
    """Daily precipitation for the whole span in ONE request.

    Seven campaigns x one request each would hammer the archive API for
    data that comes back in a single call; the per-campaign windows are cut
    out of this locally by sum_rain.
    """
    import requests

    resp = requests.get(
        OPEN_METEO_URL,
        params={
            "latitude": lat,
            "longitude": lon,
            "start_date": start,
            "end_date": end,
            "daily": "precipitation_sum",
            "timezone": bp.RAIN_TIMEZONE,
        },
        timeout=60,
    )
    resp.raise_for_status()
    daily = resp.json()["daily"]
    return {"time": daily["time"], "precipitation_sum": daily["precipitation_sum"]}


# ---------------------------------------------------------------------------
# Assembly
# ---------------------------------------------------------------------------

def build_campaign(campana: str, rain: Dict[str, list]) -> Dict[str, Any]:
    """One history row. A campaign with no usable scene is a declared gap."""
    start, end = peak_window(campana)
    rain_start, rain_end = rain_window(campana)
    rain_mm = sum_rain(rain["time"], rain["precipitation_sum"], rain_start, rain_end)

    widened = False
    items = search_scenes(bp.AOI_BBOX, start, end, CLOUD_MAX_PCT)
    if not items:
        widened = True
        items = search_scenes(bp.AOI_BBOX, start, end, CLOUD_MAX_PCT_WIDENED)

    candidates = []
    for item in items:
        stats = ndvi_stats_window(bp.sign(item), bp.AOI_BBOX)
        candidates.append(
            {
                "scene_id": item.id,
                "date": item.properties["datetime"][:10],
                "cloud_cover_pct": round(item.properties.get("eo:cloud_cover", 0.0), 2),
                **stats,
            }
        )

    row: Dict[str, Any] = {
        "campana": campana,
        "peak_window": {"start": start, "end": end},
        "rain_window": {"start": rain_start, "end": rain_end},
        "rain_dec_feb_mm": rain_mm,
        "rain_source": "measured",
        "scenes_evaluated": len(candidates),
        "cloud_max_pct": CLOUD_MAX_PCT_WIDENED if widened else CLOUD_MAX_PCT,
    }
    if widened:
        row["cloud_window_widened"] = True

    peak = pick_peak(candidates)
    if peak is None:
        # The gap is shown, never filled. docs/plan-de-accion.md is explicit
        # about this and so is the rule that consumes the series.
        row.update(
            {
                "scene_id": None,
                "date": None,
                "ndvi_peak": None,
                "ndvi_norm": None,
                "ndvi_source": "unavailable",
                "gap_reason": (
                    "no scene with usable pixels over the AOI inside the window "
                    f"at cloud cover below {row['cloud_max_pct']} pct"
                ),
            }
        )
        return row

    row.update(
        {
            "scene_id": peak["scene_id"],
            "date": peak["date"],
            "cloud_cover_pct": peak["cloud_cover_pct"],
            "processing_baseline": peak["processing_baseline"],
            "offset_applied": bp.ndvi_offset_for_baseline(peak["processing_baseline"]),
            "crs_epsg": peak["crs_epsg"],
            "n_pixels": peak["n_pixels"],
            "ndvi_peak": round(peak["ndvi"], 4),
            "ndvi_norm": round(bp.ndvi_norm(peak["ndvi"]), 4),
            "ndvi_stat": "median",
            "ndvi_source": "measured",
        }
    )
    return row


def build_history() -> Dict[str, Any]:
    span_start = rain_window(CAMPAIGNS[0])[0]
    span_end = rain_window(CAMPAIGNS[-1])[1]
    rain = fetch_rain_series(bp.CENTER["lat"], bp.CENTER["lon"], span_start, span_end)

    campaigns = [build_campaign(c, rain) for c in CAMPAIGNS]
    measured = series_values(campaigns)

    return {
        "schema_version": SCHEMA_VERSION,
        "pack_version": PACK_VERSION,
        "lote_id": LOTE_ID,
        "rule_version": RULE_VERSION,
        "purpose": (
            "Per-campaign NDVI peak and Dec-Feb rain for the lote. Input to the "
            "capacidad-v1 pre-sowing limit, which sizes the advance against the "
            "worst year this lote already had. Not a yield model: NDVI is turned "
            "into tons by a transparent linear rule, which is why the series is "
            "published next to official yields for contrast."
        ),
        "generated_at_utc": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "method": {
            "aoi_bbox": bp.AOI_BBOX,
            "ndvi_stat": "median",
            "ndvi_formula": "NDVI = (B08 - B04) / (B08 + B04)",
            "boa_formula": "BOA = (DN + BOA_ADD_OFFSET) / 10000; offset = -1000 for processing_baseline >= 04.00, else 0",
            "peak_rule": "highest per-scene NDVI median inside the campaign window",
            "peak_window": f"{PEAK_WINDOW_START[1]:02d}-{PEAK_WINDOW_START[0]:02d} to {PEAK_WINDOW_END[1]:02d}-{PEAK_WINDOW_END[0]:02d} of the harvest year",
            "rain_window": "1 Dec of the sowing year to the last day of Feb of the harvest year",
            "cloud_max_pct": CLOUD_MAX_PCT,
            "cloud_max_pct_widened": CLOUD_MAX_PCT_WIDENED,
            "min_valid_pixels": MIN_VALID_PIXELS,
            "gap_policy": "a campaign with no usable scene is published with ndvi_peak null and a gap_reason; gaps are never imputed or coerced to zero",
            "refs": SOURCE_REFS,
        },
        "coverage": {
            "campaigns_total": len(campaigns),
            "campaigns_measured": len(measured),
            "campaigns_with_gap": len(campaigns) - len(measured),
        },
        "campaigns": campaigns,
    }


def build_or_reuse(history: Dict[str, Any], path: Path) -> Dict[str, Any]:
    """Keep the committed generated_at_utc when nothing else changed.

    Same reason build_pack does it for evidence reports: without this every
    rerun would dirty the git diff with a new timestamp even when the
    measured series is byte-identical.
    """
    if not path.exists():
        return history
    try:
        previous = bp.read_json(path)
    except (OSError, json.JSONDecodeError):
        return history
    stable_old = {k: v for k, v in previous.items() if k != "generated_at_utc"}
    stable_new = {k: v for k, v in history.items() if k != "generated_at_utc"}
    if stable_old == stable_new:
        return previous
    return history


def compare(history: Dict[str, Any], committed: Dict[str, Any]) -> List[str]:
    """Field-level differences that matter, within the same tolerances
    build_pack uses (Open-Meteo is ERA5-backed and revises history by
    fractions of a mm, so exact equality would make --check flaky)."""
    problems = []
    old = {c["campana"]: c for c in committed.get("campaigns", [])}
    for row in history["campaigns"]:
        prev = old.get(row["campana"])
        if prev is None:
            problems.append(f"{row['campana']}: not in committed file")
            continue
        for field, tol in (("ndvi_peak", CHECK_TOLERANCES["ndvi"]),
                           ("rain_dec_feb_mm", CHECK_TOLERANCES["rain_mm"])):
            a, b = row.get(field), prev.get(field)
            if a is None and b is None:
                continue
            if a is None or b is None:
                problems.append(f"{row['campana']}.{field}: {b} -> {a}")
            elif abs(a - b) > tol:
                problems.append(f"{row['campana']}.{field}: {b} -> {a} (tol {tol})")
        if row.get("scene_id") != prev.get("scene_id"):
            problems.append(
                f"{row['campana']}.scene_id: {prev.get('scene_id')} -> {row.get('scene_id')}"
            )
    return problems


def git_is_dirty(path: Path) -> bool:
    """True when the target has uncommitted changes, so --write refuses to
    overwrite a reviewed value with a bad fetch (mirrors build_pack)."""
    try:
        out = subprocess.run(
            ["git", "status", "--porcelain", "--", str(path)],
            cwd=str(ROOT), capture_output=True, text=True, timeout=30,
        )
    except (OSError, subprocess.SubprocessError):
        return False
    for line in out.stdout.splitlines():
        if line and not line.startswith("??"):
            return True
    return False


def summarise(history: Dict[str, Any]) -> str:
    lines = [
        f"{'campana':>9}  {'ndvi_peak':>9}  {'ndvi_norm':>9}  {'rain_mm':>8}  scene",
    ]
    for row in history["campaigns"]:
        if row.get("ndvi_peak") is None:
            lines.append(f"{row['campana']:>9}  {'GAP':>9}  {'-':>9}  {row['rain_dec_feb_mm']:>8}  -")
        else:
            lines.append(
                f"{row['campana']:>9}  {row['ndvi_peak']:>9.4f}  {row['ndvi_norm']:>9.2f}  "
                f"{row['rain_dec_feb_mm']:>8.1f}  {row['scene_id']}"
            )
    cov = history["coverage"]
    lines.append(f"measured {cov['campaigns_measured']}/{cov['campaigns_total']}, gaps {cov['campaigns_with_gap']}")
    return "\n".join(lines)


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    parser.add_argument("--write", action="store_true", help="write data/lote-history.json")
    parser.add_argument("--check", action="store_true", help="compare against the committed file")
    parser.add_argument("--force", action="store_true", help="write even if the target is dirty")
    args = parser.parse_args(argv)

    try:
        history = build_history()
    except ImportError as err:
        print(f"UNVERIFIED: missing dependency ({err})", file=sys.stderr)
        return 2
    except Exception as err:  # network/upstream: not a data failure
        name = type(err).__name__
        if name in {"ConnectionError", "Timeout", "HTTPError", "ReadTimeout", "APIError"}:
            print(f"UNVERIFIED: upstream unavailable ({name}: {err})", file=sys.stderr)
            return 2
        raise

    print(summarise(history))

    if args.check:
        if not OUT_PATH.exists():
            print(f"UNVERIFIED: {OUT_PATH.name} not committed yet", file=sys.stderr)
            return 2
        problems = compare(history, bp.read_json(OUT_PATH))
        if problems:
            print("MISMATCH:", file=sys.stderr)
            for line in problems:
                print(f"  {line}", file=sys.stderr)
            return 1
        print("check ok: committed history reproduces")
        return 0

    if args.write:
        if git_is_dirty(OUT_PATH) and not args.force:
            print(
                f"refusing to write: {OUT_PATH.name} has uncommitted changes (use --force)",
                file=sys.stderr,
            )
            return 1
        bp.write_json(OUT_PATH, build_or_reuse(history, OUT_PATH))
        print(f"wrote {OUT_PATH.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
