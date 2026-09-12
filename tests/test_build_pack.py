"""Unit tests for build_pack.py's Phase 4 PURE helpers.

No network, no rasterio, no pystac_client, no planetary_computer, no
requests -- these are exactly the functions `ndvi_stats`/`rain_7d` delegate
their math to, so covering them here proves the arithmetic without ever
touching a live API. See tests/test_pack.py for the offline pack-contract
suite (T1..T12, V10); this file is scoped to scripts/build_pack.py itself.

Run with the same command as the rest of the suite:
    <venv>/Scripts/python -m pytest tests/ -q
"""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "scripts"))
import build_pack  # noqa: E402  (path must be extended first)


class TestNdviOffsetForBaseline:
    def test_baseline_at_or_above_04_00_gets_offset(self):
        assert build_pack.ndvi_offset_for_baseline("04.00") == -1000.0
        assert build_pack.ndvi_offset_for_baseline("05.11") == -1000.0
        assert build_pack.ndvi_offset_for_baseline("10.00") == -1000.0

    def test_baseline_below_04_00_gets_no_offset(self):
        assert build_pack.ndvi_offset_for_baseline("03.99") == 0.0
        assert build_pack.ndvi_offset_for_baseline("02.10") == 0.0
        assert build_pack.ndvi_offset_for_baseline("00.00") == 0.0


class TestPercentile:
    def test_matches_known_numpy_linear_values(self):
        # numpy.percentile([1..10], 10) == 1.9 ; ..., 90) == 9.1
        values = list(range(1, 11))
        assert build_pack.percentile(values, 10) == 1.9
        assert build_pack.percentile(values, 90) == 9.1

    def test_median_via_50th_percentile(self):
        assert build_pack.percentile([1, 2, 3, 4, 5], 50) == 3.0
        assert build_pack.percentile([1, 2, 3, 4], 50) == 2.5

    def test_single_value(self):
        assert build_pack.percentile([0.782], 10) == 0.782
        assert build_pack.percentile([0.782], 90) == 0.782

    def test_unsorted_input(self):
        assert build_pack.percentile([5, 1, 3, 2, 4], 50) == 3.0


class TestRainWindowDates:
    def test_window_is_scene_date_plus_six_previous_days(self):
        start, end = build_pack.rain_window_dates("2025-02-02")
        assert end == "2025-02-02"
        assert start == "2025-01-27"

    def test_matches_published_fecha_mala_window(self):
        start, end = build_pack.rain_window_dates("2025-02-07")
        assert (start, end) == ("2025-02-01", "2025-02-07")

    def test_crosses_month_boundary(self):
        start, end = build_pack.rain_window_dates("2025-03-03")
        assert (start, end) == ("2025-02-25", "2025-03-03")


class TestCheckField:
    def test_within_tolerance_is_ok(self):
        row = build_pack._check_field("x", 0.782, 0.7825, tolerance=0.002)
        assert row["ok"] is True
        assert row["delta"] == 0.0005

    def test_outside_tolerance_is_not_ok(self):
        row = build_pack._check_field("x", 0.782, 0.79, tolerance=0.002)
        assert row["ok"] is False
