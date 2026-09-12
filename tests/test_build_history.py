"""Contract tests for scripts/build_history.py and data/lote-history.json.

No network. build_history.py keeps almost all of its logic inside the
functions that hit STAC, so what is checkable offline is the label helper
plus the contract of the file it produced -- which is the part the capacity
rules read, and the part that would silently poison the series if it broke.

The offset check is the one that matters most: ESA shifted DN by +1000 from
baseline 04.00 (2022-01-25), so campaigns before that must carry offset 0
and later ones -1000. Getting it backwards tilts the whole history and
would move the worst year.

Run with the same command as the rest of the suite:
    <venv>/Scripts/python -m pytest tests/ -q
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "scripts"))
import build_history  # noqa: E402  (path must be extended first)

HISTORY_PATH = ROOT / "data" / "lote-history.json"
pytestmark = pytest.mark.skipif(not HISTORY_PATH.exists(), reason="lote-history.json not built yet")


@pytest.fixture(scope="module")
def history():
    return json.loads(HISTORY_PATH.read_text(encoding="utf-8"))


class TestCampaignLabel:
    def test_harvest_year_maps_to_campaign(self):
        assert build_history.campaign_label(2019) == "2018/19"
        assert build_history.campaign_label(2025) == "2024/25"

    def test_century_rollover(self):
        # 2000 harvest is campaign 1999/00, not 1999/0 and not 1999/100.
        assert build_history.campaign_label(2000) == "1999/00"


class TestHistoryContract:
    def test_covers_the_seven_campaigns(self, history):
        labels = [c["campaign"] for c in history["campaigns"]]
        assert labels == [
            "2018/19", "2019/20", "2020/21", "2021/22", "2022/23", "2023/24", "2024/25",
        ]

    def test_pack_version_matches_the_rest_of_the_pack(self, history):
        economics = json.loads((ROOT / "data" / "lote-economics.json").read_text(encoding="utf-8"))
        assert history["pack_version"] == economics["pack_version"]

    def test_every_peak_carries_a_full_precision_median(self, history):
        # The capacity rules read peak.ndvi_stats.median, not the rounded
        # peak.ndvi. If the stats block ever disappears the rules silently
        # fall back to 3 decimals.
        for c in history["campaigns"]:
            if c["peak"] is None:
                continue
            assert "ndvi_stats" in c["peak"]
            assert isinstance(c["peak"]["ndvi_stats"]["median"], float)

    def test_offset_follows_the_processing_baseline(self, history):
        for c in history["campaigns"]:
            for scene in [c["peak"], *c["scenes_evaluated"]]:
                if scene is None:
                    continue
                baseline = scene.get("processing_baseline")
                offset = scene.get("ndvi_offset_applied")
                if baseline is None or offset is None:
                    continue
                expected = -1000.0 if baseline >= "04.00" else 0.0
                assert offset == expected, f"{baseline} should carry offset {expected}, got {offset}"

    def test_ndvi_values_are_plausible(self, history):
        for c in history["campaigns"]:
            if c["peak"] is None:
                continue
            assert 0.0 < c["peak"]["ndvi"] <= 1.0

    def test_gaps_are_null_never_zero(self, history):
        # A cloudy February is missing evidence, not a failed crop. A zero
        # here would invent the worst year of the series.
        for c in history["campaigns"]:
            if c["peak"] is None:
                continue
            assert c["peak"]["ndvi"] != 0

    def test_peak_is_the_maximum_of_its_window(self, history):
        for c in history["campaigns"]:
            if c["peak"] is None or not c["scenes_evaluated"]:
                continue
            best = max(s["median"] for s in c["scenes_evaluated"])
            assert c["peak"]["ndvi_stats"]["median"] == best
