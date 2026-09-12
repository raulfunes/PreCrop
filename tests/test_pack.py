"""Offline validation for the PreCrop evidence data pack.

No network, no rasterio. Run with:
    <venv>/Scripts/python -m pytest tests/test_pack.py -q

Test IDs (T1..T12, V10) map to the design's "tests/test_pack.py" table
(sdd/evidence-data-service/design, obs #761).
"""

from __future__ import annotations

import hashlib
import json
import math
import re
import sys
from pathlib import Path
from statistics import median

import pytest

ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = ROOT / "data"

sys.path.insert(0, str(ROOT / "scripts"))
import build_pack  # noqa: E402  (path must be extended first)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def load(name: str):
    with (DATA_DIR / name).open("r", encoding="utf-8") as fh:
        return json.load(fh)


def load_evidence(scenario_key: str):
    path = DATA_DIR / "evidence" / f"{scenario_key}.json"
    with path.open("r", encoding="utf-8") as fh:
        return json.load(fh)


def iter_kv(obj, skip_dict_keys=frozenset()):
    """Recursively yield every (key, value) pair at any depth.

    `skip_dict_keys` stops recursion INTO the value of a matching key (the
    key itself is still yielded once) -- used to exempt honesty-label
    objects like `sources: {ndvi, rain, weeds}` from raw-value-duplication
    scans: they hold labels (measured/estimated/simulated), not the
    duplicated values themselves.
    """
    if isinstance(obj, dict):
        for k, v in obj.items():
            yield k, v
            if k in skip_dict_keys:
                continue
            yield from iter_kv(v, skip_dict_keys)
    elif isinstance(obj, list):
        for item in obj:
            yield from iter_kv(item, skip_dict_keys)


def find_keys(obj, predicate, skip_dict_keys=frozenset()):
    return [k for k, v in iter_kv(obj, skip_dict_keys) if predicate(k)]


def polygon_bounds(ring):
    xs = [pt[0] for pt in ring]
    ys = [pt[1] for pt in ring]
    return [min(xs), min(ys), max(xs), max(ys)]


def point_in_ring(lon: float, lat: float, ring) -> bool:
    """Ray-casting point-in-polygon test (ring = closed list of [lon, lat])."""
    inside = False
    n = len(ring)
    j = n - 1
    for i in range(n):
        xi, yi = ring[i]
        xj, yj = ring[j]
        if (yi > lat) != (yj > lat):
            x_intersect = (xj - xi) * (lat - yi) / (yj - yi) + xi
            if lon < x_intersect:
                inside = not inside
        j = i
    return inside


SCENARIO_KEYS = ["bueno", "mixto", "malo"]
VALID_SOURCES = {"measured", "estimated", "simulated"}
KEY_RE = re.compile(r"^[a-z0-9_]+$")


# ---------------------------------------------------------------------------
# T1 - schema_version / pack_version present and consistent
# ---------------------------------------------------------------------------

class TestT1SchemaVersion:
    def test_root_files_have_schema_and_pack_version(self):
        versions = {}
        for fname in (
            "lote-sentinel-presets.json",
            "demo-scenarios.json",
            "photo-point-presets.json",
        ):
            data = load(fname)
            assert data.get("schema_version") is not None, f"{fname} missing schema_version"
            assert data.get("pack_version") is not None, f"{fname} missing pack_version"
            versions[fname] = data["pack_version"]

        geojson = load("lote.geojson")
        props = geojson["properties"]
        assert props.get("schema_version") is not None
        assert props.get("pack_version") is not None
        versions["lote.geojson"] = props["pack_version"]

        assert len(set(versions.values())) == 1, f"pack_version mismatch: {versions}"

    @pytest.mark.parametrize("scenario_key", SCENARIO_KEYS)
    def test_evidence_files_have_schema_and_pack_version(self, scenario_key):
        presets = load("lote-sentinel-presets.json")
        report = load_evidence(scenario_key)
        assert report["schema_version"] == 1
        assert report["pack_version"] == presets["pack_version"]


# ---------------------------------------------------------------------------
# T2 / T3 - geometry
# ---------------------------------------------------------------------------

class TestT2Geometry:
    def test_polygon_is_closed_and_bbox_matches_presets(self):
        geojson = load("lote.geojson")
        ring = geojson["geometry"]["coordinates"][0]
        assert ring[0] == ring[-1], "polygon ring is not closed"

        bounds = polygon_bounds(ring)
        presets = load("lote-sentinel-presets.json")
        for a, b in zip(presets["bbox"], bounds):
            assert abs(a - b) < 1e-9, f"bbox {presets['bbox']} != polygon bounds {bounds}"


class TestT3PointsInsideAOI:
    def test_points_strictly_inside_polygon(self):
        geojson = load("lote.geojson")
        ring = geojson["geometry"]["coordinates"][0]
        points = load("photo-point-presets.json")["points"]
        assert len(points) == 5
        for p in points:
            assert point_in_ring(p["lon"], p["lat"], ring), f"{p['point_id']} outside AOI"


# ---------------------------------------------------------------------------
# T4 - score recompute from published inputs
# ---------------------------------------------------------------------------

class TestT4ScoreRecompute:
    @pytest.mark.parametrize("scenario_key", SCENARIO_KEYS)
    def test_score_matches_expected_and_light(self, scenario_key):
        presets = load("lote-sentinel-presets.json")
        scenarios = load("demo-scenarios.json")
        points = load("photo-point-presets.json")

        scenario = scenarios["scenarios"][scenario_key]
        preset = presets["presets"][scenario["satellite_preset"]]
        weeds_by_point = points["scenarios"][scenario_key]["weeds_pct_by_point"]
        weeds = median(weeds_by_point.values())

        score = build_pack.score_from_inputs(preset["ndvi"], preset["rain_mm_7d"], weeds)
        expected = scenario["expected"]

        assert abs(score - expected["score_exact"]) < 1e-4
        assert build_pack.light_for_score(score) == expected["light"]
        assert round(score, 1) == scenario["expected_score"]
        assert build_pack.light_for_score(score) == scenario["expected_band"]


# ---------------------------------------------------------------------------
# T5 - echo equals upstream source (D6)
# ---------------------------------------------------------------------------

class TestT5EchoMatchesUpstream:
    @pytest.mark.parametrize("scenario_key", SCENARIO_KEYS)
    def test_echo_matches_upstream(self, scenario_key):
        presets = load("lote-sentinel-presets.json")
        scenarios = load("demo-scenarios.json")
        points = load("photo-point-presets.json")

        scenario = scenarios["scenarios"][scenario_key]
        preset = presets["presets"][scenario["satellite_preset"]]
        expected = scenario["expected"]

        assert expected["ndvi_used"] == preset["ndvi"]
        assert expected["climate_used"] == build_pack.climate_from_rain(preset["rain_mm_7d"])
        assert expected["weeds_used"] == points["scenarios"][scenario_key]["weeds_pct_lote"]


# ---------------------------------------------------------------------------
# T6 - weeds_pct_lote is the median of weeds_pct_by_point
# ---------------------------------------------------------------------------

class TestT6WeedsMedian:
    @pytest.mark.parametrize("scenario_key", SCENARIO_KEYS)
    def test_weeds_pct_lote_is_median(self, scenario_key):
        points = load("photo-point-presets.json")
        block = points["scenarios"][scenario_key]
        assert block["weeds_pct_lote"] == median(block["weeds_pct_by_point"].values())


# ---------------------------------------------------------------------------
# T7 - no weeds re-duplication in demo-scenarios.json
#
# NOTE: the design's own JSON shape for demo-scenarios.json requires
# `expected.weeds_used` (D6 echo, verified by T5 above) and `weeds_ref`
# (a pointer, not a value). The design's T7 one-liner ("no key matching
# `weed` anywhere") is therefore over-broad relative to the design's own
# worked example; the intent per "catches: weeds re-duplicating" is to
# forbid the RAW per-point/per-lote weeds values re-entering this file
# (weeds_pct, weeds_pct_lote, weeds_pct_by_point, weeds_pct_expected),
# not the deliberately-tested scoring echo. See apply-progress for this
# spec/design conflict and its resolution.
# ---------------------------------------------------------------------------

class TestT7NoWeedDuplication:
    ALLOWED_WEED_KEYS = {"weeds_used", "weeds_ref"}
    # "sources" objects (per scenario) hold honesty LABELS keyed by short
    # domain names -- {"ndvi": "measured", "rain": "measured",
    # "weeds": "simulated"} -- not the duplicated raw values. "weights"
    # (inside the root "scoring" block) holds formula COEFFICIENT names
    # -- {"ndvi_norm": 0.6, "climate": 0.25, "weeds_pct": -0.15} -- again
    # not a duplicated value. Both are metadata-about-fields, not the
    # fields themselves; exempt them from the raw-value-duplication scan.
    LABEL_CONTAINERS = {"sources", "weights"}

    def test_no_disallowed_weed_keys(self):
        scenarios = load("demo-scenarios.json")
        offending = [
            k
            for k in find_keys(
                scenarios, lambda k: "weed" in k.lower(), skip_dict_keys=self.LABEL_CONTAINERS
            )
            if k not in self.ALLOWED_WEED_KEYS
        ]
        assert offending == [], f"disallowed weed-duplicating keys: {offending}"

    def test_no_duplicated_satellite_values(self):
        """R4.1: no ndvi / rain_mm_7d / scene_id keys in demo-scenarios.json."""
        scenarios = load("demo-scenarios.json")
        banned = {"ndvi", "rain_mm_7d", "scene_id"}
        offending = find_keys(scenarios, lambda k: k in banned, skip_dict_keys=self.LABEL_CONTAINERS)
        assert offending == [], f"duplicated upstream keys: {offending}"


# ---------------------------------------------------------------------------
# T8 - forbidden derived keys stripped from the satellite presets file
# ---------------------------------------------------------------------------

class TestT8ForbiddenKeys:
    FORBIDDEN_ROOT_KEYS = {"formula", "haircut", "base_valuation_usd"}
    FORBIDDEN_PRESET_KEYS = {"vigor", "climate", "score", "valuation_usd"}

    def test_no_forbidden_root_keys(self):
        presets = load("lote-sentinel-presets.json")
        offending = self.FORBIDDEN_ROOT_KEYS & presets.keys()
        assert not offending, f"forbidden root keys present: {offending}"
        assert "geojson" not in presets, "geometry must live in lote.geojson, not embedded"

    def test_no_forbidden_preset_keys(self):
        presets = load("lote-sentinel-presets.json")
        for preset_key, preset in presets["presets"].items():
            offending = self.FORBIDDEN_PRESET_KEYS & preset.keys()
            assert not offending, f"{preset_key} has forbidden keys {offending}"

    def test_climate_table_and_normalization_present(self):
        """climate_table (mapping) and normalization stay -- they are metadata,
        not a per-preset derived scalar, and are explicitly ALLOWED."""
        presets = load("lote-sentinel-presets.json")
        assert "climate_table" in presets
        assert all("climate" in rule for rule in presets["climate_table"]["rules"])
        assert "normalization" in presets

    def test_no_rain_norm_anywhere(self):
        for fname in (
            "lote-sentinel-presets.json",
            "demo-scenarios.json",
            "photo-point-presets.json",
        ):
            data = load(fname)
            offending = find_keys(data, lambda k: k == "rain_norm")
            assert offending == [], f"rain_norm found in {fname}"


# ---------------------------------------------------------------------------
# T9 - source labels on every value-bearing block
# ---------------------------------------------------------------------------

class TestT9SourceLabels:
    def test_presets_have_source_labels(self):
        presets = load("lote-sentinel-presets.json")
        for key in ("fecha_buena", "fecha_mala", "fecha_mala_agosto_barbecho"):
            preset = presets["presets"][key]
            assert preset["ndvi_source"] in VALID_SOURCES
            assert preset["rain_source"] in VALID_SOURCES

        norm = presets["normalization"]
        assert norm["ndvi_norm"]["source"] in VALID_SOURCES
        assert norm["climate"]["source"] in VALID_SOURCES
        assert norm["weeds_norm"]["source"] in VALID_SOURCES

    def test_geometry_has_source_label(self):
        geojson = load("lote.geojson")
        assert geojson["properties"]["source"] in VALID_SOURCES

    @pytest.mark.parametrize("scenario_key", SCENARIO_KEYS)
    def test_weeds_have_source_labels(self, scenario_key):
        points = load("photo-point-presets.json")
        assert points["scenarios"][scenario_key]["source"] in VALID_SOURCES

    @pytest.mark.parametrize("scenario_key", SCENARIO_KEYS)
    def test_scenario_sources_present(self, scenario_key):
        scenarios = load("demo-scenarios.json")
        sources = scenarios["scenarios"][scenario_key]["sources"]
        for value in sources.values():
            assert value in VALID_SOURCES


# ---------------------------------------------------------------------------
# T10 - evidence hash matches + frozen golden vector
# ---------------------------------------------------------------------------

class TestT10EvidenceHash:
    @pytest.mark.parametrize("scenario_key", SCENARIO_KEYS)
    def test_evidence_hash_matches(self, scenario_key):
        report = load_evidence(scenario_key)
        recomputed = build_pack.hash_payload(report["payload"])
        assert recomputed == report["content_sha256"]

    def test_three_reports_have_distinct_digests(self):
        digests = {load_evidence(k)["content_sha256"] for k in SCENARIO_KEYS}
        assert len(digests) == 3

    def test_golden_vector(self):
        """Frozen at apply time (2026-09-12). Chain must reproduce this exact
        digest from the same 15-byte canonical string in their TS client."""
        payload = {"b": "x", "a": 1}
        canonical = build_pack.canonicalize_payload(payload)
        assert canonical == '{"a":1,"b":"x"}'

        digest = build_pack.hash_payload(payload)
        expected_digest = hashlib.sha256(canonical.encode("utf-8")).hexdigest()
        assert digest == expected_digest
        assert digest == "ecf9e98ec0641e23113ff3ce8bdc78d0ddd249886517fd4a7f68cc83d4e65667"


# ---------------------------------------------------------------------------
# T11 - payload constraints for cross-language canonicalisation
# ---------------------------------------------------------------------------

class TestT11PayloadConstraints:
    @pytest.mark.parametrize("scenario_key", SCENARIO_KEYS)
    def test_payload_constraints(self, scenario_key):
        report = load_evidence(scenario_key)
        payload = report["payload"]

        assert "content_sha256" not in payload

        for key, value in payload.items():
            assert KEY_RE.match(key), f"key {key!r} violates {KEY_RE.pattern}"
            assert not isinstance(value, (dict, list)), f"{key} is nested"
            assert value is not None, f"{key} is null"

            if isinstance(value, str):
                assert value.isascii(), f"{key} value is not ASCII: {value!r}"
            elif isinstance(value, bool):
                continue
            elif isinstance(value, (int, float)):
                assert math.isfinite(value), f"{key} is not finite"
                assert abs(value) < 1e6, f"{key} exceeds 1e6: {value}"
                as_str = f"{value:.10f}".rstrip("0")
                decimals = as_str.split(".")[1] if "." in as_str else ""
                assert len(decimals) <= 4, f"{key} has more than 4 decimals: {value}"


# ---------------------------------------------------------------------------
# T12 - referenced photos exist on disk
#
# presets/fotos/* are owned by another track (Vision/photo owner), not
# generated by this pack (see demo-scenarios.json photos_ownership_note).
# Skip until that track drops the files in place.
# ---------------------------------------------------------------------------

class TestT12Photos:
    @pytest.mark.parametrize("scenario_key", SCENARIO_KEYS)
    def test_photos_exist(self, scenario_key):
        photos_dir = DATA_DIR / "presets" / "fotos"
        if not photos_dir.exists() or not any(photos_dir.glob("*.jpg")):
            pytest.skip("presets/fotos owned by another track; skip until files are present")

        scenarios = load("demo-scenarios.json")
        points = load("photo-point-presets.json")
        valid_point_ids = {p["point_id"] for p in points["points"]}
        for photo in scenarios["scenarios"][scenario_key]["photos"]:
            path = DATA_DIR / photo["file"]
            assert path.exists() and path.stat().st_size > 0, f"missing {path}"
            assert photo["point_id"] in valid_point_ids


# ---------------------------------------------------------------------------
# V10 - no scenario references the archived fallow preset
# ---------------------------------------------------------------------------

class TestV10NoArchivedFallowReference:
    def test_no_scenario_references_archived_fallow(self):
        scenarios = load("demo-scenarios.json")
        for key, scenario in scenarios["scenarios"].items():
            assert scenario["satellite_preset"] != "fecha_mala_agosto_barbecho", (
                f"scenario {key} references the archived winter-fallow preset"
            )
