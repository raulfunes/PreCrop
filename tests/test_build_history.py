"""Unit tests for build_history.py's PURE helpers.

No network, no rasterio -- these are the functions the campaign sweep
delegates its date arithmetic and its peak/gap decisions to, so covering
them here proves the logic without a live STAC or Open-Meteo call.

The gap cases matter most: a cloudy February must survive as a declared
hole, never as a zero. A zero would invent the worst year of the series and
drag the pre-sowing limit to nothing.

Run with the same command as the rest of the suite:
    <venv>/Scripts/python -m pytest tests/ -q
"""

from __future__ import annotations

import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "scripts"))
import build_history  # noqa: E402  (path must be extended first)


class TestCampaignYears:
    def test_splits_sowing_and_harvest(self):
        assert build_history.campaign_years("2018/19") == (2018, 2019)
        assert build_history.campaign_years("2024/25") == (2024, 2025)

    def test_century_rollover(self):
        assert build_history.campaign_years("1999/00") == (1999, 2000)

    def test_rejects_non_consecutive_years(self):
        with pytest.raises(ValueError):
            build_history.campaign_years("2018/20")


class TestPeakWindow:
    def test_window_falls_in_the_harvest_year(self):
        assert build_history.peak_window("2022/23") == ("2023-01-15", "2023-03-15")

    def test_every_configured_campaign_has_a_window(self):
        for campana in build_history.CAMPAIGNS:
            start, end = build_history.peak_window(campana)
            assert start < end


class TestRainWindow:
    def test_spans_december_to_february(self):
        assert build_history.rain_window("2018/19") == ("2018-12-01", "2019-02-28")

    def test_leap_february_keeps_the_29th(self):
        # 2020 is a leap year: the window must not silently drop a day.
        assert build_history.rain_window("2019/20") == ("2019-12-01", "2020-02-29")


class TestSumRain:
    def test_sums_only_inside_the_window(self):
        times = ["2018-11-30", "2018-12-01", "2019-01-15", "2019-02-28", "2019-03-01"]
        values = [100.0, 1.0, 2.0, 3.0, 100.0]
        assert build_history.sum_rain(times, values, "2018-12-01", "2019-02-28") == 6.0

    def test_skips_nulls(self):
        times = ["2019-01-01", "2019-01-02", "2019-01-03"]
        values = [1.5, None, 2.5]
        assert build_history.sum_rain(times, values, "2019-01-01", "2019-01-03") == 4.0

    def test_empty_window_is_zero_not_an_error(self):
        assert build_history.sum_rain([], [], "2019-01-01", "2019-02-28") == 0.0


class TestPickPeak:
    def test_picks_the_highest_median(self):
        candidates = [
            {"scene_id": "A", "date": "2023-01-20", "ndvi": 0.42},
            {"scene_id": "B", "date": "2023-02-04", "ndvi": 0.71},
            {"scene_id": "C", "date": "2023-03-01", "ndvi": 0.55},
        ]
        assert build_history.pick_peak(candidates)["scene_id"] == "B"

    def test_ignores_scenes_that_were_skipped(self):
        candidates = [
            {"scene_id": "A", "date": "2023-01-20", "ndvi": None, "skipped": "too_few_valid_pixels"},
            {"scene_id": "B", "date": "2023-02-04", "ndvi": 0.31},
        ]
        assert build_history.pick_peak(candidates)["scene_id"] == "B"

    def test_returns_none_when_nothing_is_usable(self):
        candidates = [{"scene_id": "A", "date": "2023-01-20", "ndvi": None}]
        assert build_history.pick_peak(candidates) is None

    def test_no_candidates_at_all(self):
        assert build_history.pick_peak([]) is None

    def test_tie_breaks_on_the_earlier_date(self):
        candidates = [
            {"scene_id": "LATE", "date": "2023-02-10", "ndvi": 0.6},
            {"scene_id": "EARLY", "date": "2023-01-20", "ndvi": 0.6},
        ]
        assert build_history.pick_peak(candidates)["scene_id"] == "LATE"


class TestSeriesValues:
    def test_drops_gaps_without_coercing_them_to_zero(self):
        campaigns = [
            {"campana": "2018/19", "ndvi_peak": 0.70},
            {"campana": "2019/20", "ndvi_peak": None},
            {"campana": "2020/21", "ndvi_peak": 0.55},
        ]
        values = build_history.series_values(campaigns)
        assert values == [0.70, 0.55]
        assert 0 not in values
        # The worst year is the worst MEASURED year, not the gap.
        assert min(values) == 0.55

    def test_all_gaps_yields_an_empty_series(self):
        campaigns = [{"campana": "2018/19", "ndvi_peak": None}]
        assert build_history.series_values(campaigns) == []


class TestCompare:
    def _history(self, ndvi, rain):
        return {"campaigns": [
            {"campana": "2022/23", "ndvi_peak": ndvi, "rain_dec_feb_mm": rain, "scene_id": "S1"}
        ]}

    def test_identical_series_has_no_problems(self):
        a = self._history(0.5, 120.0)
        assert build_history.compare(a, self._history(0.5, 120.0)) == []

    def test_drift_inside_tolerance_passes(self):
        # Open-Meteo revises historic days by fractions of a mm.
        a = self._history(0.5, 120.1)
        assert build_history.compare(a, self._history(0.5, 120.0)) == []

    def test_drift_outside_tolerance_is_reported(self):
        a = self._history(0.6, 120.0)
        assert build_history.compare(a, self._history(0.5, 120.0)) != []

    def test_scene_change_is_reported(self):
        a = self._history(0.5, 120.0)
        b = self._history(0.5, 120.0)
        b["campaigns"][0]["scene_id"] = "OTHER"
        assert build_history.compare(a, b) != []

    def test_gap_appearing_where_a_value_was_is_reported(self):
        a = self._history(None, 120.0)
        assert build_history.compare(a, self._history(0.5, 120.0)) != []
