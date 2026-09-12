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
        assert len(presets["bbox"]) == 4, f"bbox must be [minx,miny,maxx,maxy]: {presets['bbox']}"
        for a, b in zip(presets["bbox"], bounds):
            assert abs(a - b) < 1e-9, f"bbox {presets['bbox']} != polygon bounds {bounds}"

    def test_geojson_top_level_bbox_matches_ring_bounds(self):
        """lote.geojson carries its own top-level `bbox` member (a GeoJSON
        Feature convention) IN ADDITION to the geometry ring -- nothing
        previously checked that the two agree with each other."""
        geojson = load("lote.geojson")
        ring = geojson["geometry"]["coordinates"][0]
        bounds = polygon_bounds(ring)
        assert len(geojson["bbox"]) == 4
        for a, b in zip(geojson["bbox"], bounds):
            assert abs(a - b) < 1e-9, f"geojson bbox {geojson['bbox']} != ring bounds {bounds}"


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

        # expected.score / expected.ndvi_norm are themselves derived fields
        # (D6 echo) -- assert they match the recomputation too, not just
        # expected_score/expected_band at the top level.
        assert expected["score"] == round(score, 1)
        assert abs(expected["ndvi_norm"] - build_pack.ndvi_norm(preset["ndvi"])) < 1e-4


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
        """Matches both the English root ("weed") and the Spanish root
        ("malez", as in "malezas") -- this file mixes English JSON keys
        with Spanish prose fields, so a Spanish-named weeds key would slip
        past an English-only substring check."""
        scenarios = load("demo-scenarios.json")
        offending = [
            k
            for k in find_keys(
                scenarios,
                lambda k: "weed" in k.lower() or "malez" in k.lower(),
                skip_dict_keys=self.LABEL_CONTAINERS,
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
    # Banned ANYWHERE in the file except inside the two allowlisted
    # metadata containers below -- a single recursive scan replaces the
    # old split root-keys / preset-keys checks (which could miss a
    # forbidden key nested somewhere neither list of paths anticipated).
    BANNED_KEYS = {"score", "valuation_usd", "vigor", "formula", "haircut", "base_valuation_usd"}
    # normalization.{ndvi_norm,climate,weeds_norm}.formula documents each
    # formula as a STRING (not a computed value), and
    # climate_table.rules[].climate is the per-rule climate SCORE -- both
    # are legitimate published metadata, not the forbidden per-preset
    # derived scalars this test guards against.
    ALLOWED_CONTAINERS = {"normalization", "climate_table"}

    def test_no_banned_keys_anywhere(self):
        presets = load("lote-sentinel-presets.json")
        offending = [
            k
            for k in find_keys(
                presets, lambda k: k in self.BANNED_KEYS, skip_dict_keys=self.ALLOWED_CONTAINERS
            )
        ]
        assert offending == [], f"forbidden keys present: {offending}"
        assert "geojson" not in presets, "geometry must live in lote.geojson, not embedded"

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

    def test_golden_vector_integral_float(self):
        """Second frozen vector (2026-09-12), covering the case the first
        one does NOT: an integral float (100.0) and an int (12) that must
        canonicalise to the SAME token shape a JS client would produce.
        Python's `json.dumps` alone would emit `100.0`; JS's
        `JSON.stringify` of the equivalent numeric value always emits
        `100`. Chain's TS client must reproduce this exact digest too --
        if it only matches the first golden vector (all-int payload), the
        float-normalisation path is unverified."""
        payload = {"a": 0.1, "b": 100.0, "c": 12, "d": "x"}
        canonical = build_pack.canonicalize_payload(payload)
        assert canonical == '{"a":0.1,"b":100,"c":12,"d":"x"}'

        digest = build_pack.hash_payload(payload)
        assert digest == "4833dae1058c20c0ead97091467a634ebce2e9748d7d134816a2033b7f5e8453"

    def test_negative_zero_canonicalises_to_plain_zero(self):
        canonical = build_pack.canonicalize_payload({"x": -0.0})
        assert canonical == '{"x":0}'


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

                if isinstance(value, float):
                    assert not value.is_integer(), (
                        f"{key}={value!r} is an integral float; Python's json.dumps "
                        "writes it as e.g. '100.0' while JS's JSON.stringify of the "
                        "same numeric value writes '100' -- this must be an int in "
                        "the payload (or pass through build_pack.canonicalize_payload, "
                        "which coerces it)"
                    )
                    assert value != 0.0 or math.copysign(1.0, value) == 1.0, (
                        f"{key} is -0.0, not plain 0"
                    )


# ---------------------------------------------------------------------------
# Evidence <-> build_pack tie: nothing else in this suite proves that the
# COMMITTED data/evidence/*.json payloads are what build_evidence() would
# produce today from the committed presets/scenarios/points -- T10 only
# proves the hash matches whatever payload is already on disk. Without this,
# presets/scenarios could drift out from under a stale evidence/*.json and
# every other test would keep passing.
# ---------------------------------------------------------------------------

class TestEvidenceMatchesBuildPack:
    @pytest.mark.parametrize("scenario_key", SCENARIO_KEYS)
    def test_committed_payload_equals_freshly_built(self, scenario_key):
        presets = load("lote-sentinel-presets.json")
        scenarios = load("demo-scenarios.json")
        points = load("photo-point-presets.json")

        rebuilt = build_pack.build_evidence(scenario_key, presets, scenarios, points)
        committed = load_evidence(scenario_key)["payload"]

        assert rebuilt == committed


# ---------------------------------------------------------------------------
# Formula metadata parity: demo-scenarios.json / lote-sentinel-presets.json
# publish the scoring formula, thresholds, normalisation anchors and
# climate_table as DATA (for Front to read) -- nothing previously asserted
# that published metadata actually equals the constants build_pack.py (and
# therefore expected_score/T4) uses to compute the same numbers. A drift
# here would mean Front computes a different score than the evidence
# reports without any test catching it.
# ---------------------------------------------------------------------------

class TestFormulaMetadataParity:
    def test_weights_match(self):
        scenarios = load("demo-scenarios.json")
        assert scenarios["scoring"]["weights"] == build_pack.WEIGHTS

    def test_thresholds_match(self):
        scenarios = load("demo-scenarios.json")
        assert scenarios["scoring"]["thresholds"] == build_pack.THRESHOLDS

    def test_ndvi_norm_anchors_match(self):
        presets = load("lote-sentinel-presets.json")
        norm = presets["normalization"]["ndvi_norm"]
        assert norm["ndvi_floor"] == build_pack.NDVI_FLOOR
        assert norm["ndvi_ceiling"] == build_pack.NDVI_CEILING

    def test_climate_table_rules_match(self):
        presets = load("lote-sentinel-presets.json")
        published = [
            (rule["max_mm"], rule["climate"]) for rule in presets["climate_table"]["rules"]
        ]
        pinned = [(rule["max_mm"], rule["climate"]) for rule in build_pack.CLIMATE_TABLE]
        assert published == pinned


# ---------------------------------------------------------------------------
# Provenance: the published ndvi for each LIVE preset must actually be the
# rounded median of its own ndvi_stats (the file-wide convention), the two
# live scene ids must differ, each scene id's embedded date must match the
# preset's own `date`, and the archived preset must stay flagged. The
# archived preset predates the median convention -- it declares its OWN
# ndvi_published_stat: "mean" override (see lote-sentinel-presets.json)
# instead of silently disagreeing with the file-wide "median" one.
# ---------------------------------------------------------------------------

class TestProvenance:
    LIVE_PRESET_KEYS = ["fecha_buena", "fecha_mala"]

    @pytest.mark.parametrize("preset_key", LIVE_PRESET_KEYS)
    def test_live_ndvi_is_rounded_median_of_its_own_stats(self, preset_key):
        presets = load("lote-sentinel-presets.json")
        assert presets["ndvi_published_stat"] == "median"
        preset = presets["presets"][preset_key]
        assert preset["ndvi"] == round(preset["ndvi_stats"]["median"], 3)

    @pytest.mark.parametrize("preset_key", LIVE_PRESET_KEYS)
    def test_scene_id_date_matches_preset_date(self, preset_key):
        presets = load("lote-sentinel-presets.json")
        preset = presets["presets"][preset_key]
        scene_id = preset["sentinel2"]["scene_id"]
        # e.g. S2B_MSIL2A_20250202T140709_... -> "20250202"
        embedded_date = scene_id.split("_")[2].split("T")[0]
        assert embedded_date == preset["date"].replace("-", "")

    def test_two_live_scene_ids_differ(self):
        presets = load("lote-sentinel-presets.json")
        ids = {presets["presets"][k]["sentinel2"]["scene_id"] for k in self.LIVE_PRESET_KEYS}
        assert len(ids) == 2

    def test_archived_preset_stays_flagged_and_declares_its_own_stat(self):
        presets = load("lote-sentinel-presets.json")
        archived = presets["presets"]["fecha_mala_agosto_barbecho"]
        assert archived["deprecated_for_pitch"] is True
        # Overrides the file-wide "median" convention -- see the field's own
        # note in lote-sentinel-presets.json for why.
        assert archived["ndvi_published_stat"] == "mean"
        assert archived["ndvi_published_stat"] != presets["ndvi_published_stat"]
        assert archived["ndvi_old_method_median_ref"] != archived["ndvi"]


# ---------------------------------------------------------------------------
# T12 - photo contract (unconditional) + on-disk existence (skipped until
# the photo-owning track drops files in)
#
# presets/fotos/* are owned by another track (Vision/photo owner), not
# generated by this pack (see demo-scenarios.json photos_ownership_note).
# Split in two: the CONTRACT (point_ids, weeds_ref, point_id references)
# is this pack's responsibility and must be checked unconditionally; only
# the on-disk jpg bytes are the other track's responsibility and skip.
# ---------------------------------------------------------------------------

class TestT12Photos:
    @pytest.mark.parametrize("scenario_key", SCENARIO_KEYS)
    def test_point_ids_and_weeds_ref_contract(self, scenario_key):
        """Unconditional -- never skipped, regardless of whether the photo
        files exist yet."""
        scenarios = load("demo-scenarios.json")
        points = load("photo-point-presets.json")
        scenario = scenarios["scenarios"][scenario_key]
        valid_point_ids = {p["point_id"] for p in points["points"]}

        assert len(scenario["point_ids"]) == 5
        assert set(scenario["point_ids"]) == valid_point_ids

        weeds_ref = scenario["weeds_ref"]
        assert weeds_ref["scenario"] == scenario_key
        assert (DATA_DIR / weeds_ref["file"]).exists(), f"weeds_ref.file missing: {weeds_ref['file']}"

        for photo in scenario["photos"]:
            assert photo["point_id"] in valid_point_ids

    @pytest.mark.parametrize("scenario_key", SCENARIO_KEYS)
    def test_photos_exist_on_disk(self, scenario_key):
        photos_dir = DATA_DIR / "presets" / "fotos"
        if not photos_dir.exists() or not any(photos_dir.glob("*.jpg")):
            pytest.skip("presets/fotos owned by another track; skip until files are present")

        scenarios = load("demo-scenarios.json")
        for photo in scenarios["scenarios"][scenario_key]["photos"]:
            path = DATA_DIR / photo["file"]
            assert path.exists() and path.stat().st_size > 0, f"missing {path}"


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
