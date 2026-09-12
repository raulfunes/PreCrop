"""Unit tests for build_rindes_oficiales.py's PURE helpers.

No network. The case that matters most is the encoding one: this CSV is
UTF-8 with a BOM, and reading it as latin-1 turns "Cordoba" into
"CA3rdoba", every province match fails, and the table comes out as seven
GAPs that look like missing upstream data instead of a bug. That failure
already happened once, so it is pinned here.

Run with the same command as the rest of the suite:
    <venv>/Scripts/python -m pytest tests/ -q
"""

from __future__ import annotations

import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "scripts"))
import build_rindes_oficiales as br  # noqa: E402  (path must be extended first)


class TestToLongCampaign:
    def test_expands_two_digit_suffix(self):
        assert br.to_long_campaign("2018/19") == "2018/2019"
        assert br.to_long_campaign("2024/25") == "2024/2025"

    def test_century_rollover(self):
        assert br.to_long_campaign("1999/00") == "1999/2000"

    def test_rejects_non_consecutive_years(self):
        with pytest.raises(ValueError):
            br.to_long_campaign("2018/20")


class TestStripAccents:
    def test_folds_spanish_accents(self):
        assert br.strip_accents("Córdoba") == "Cordoba"
        assert br.strip_accents("Río Segundo") == "Rio Segundo"

    def test_leaves_ascii_untouched(self):
        assert br.strip_accents("Rio Segundo") == "Rio Segundo"


class TestMatching:
    def test_matches_accented_source_values(self):
        row = {"provincia": "Córdoba", "departamento": "Río Segundo"}
        assert br.match_province(row)
        assert br.match_department(row, "Rio Segundo")

    def test_mojibake_does_not_match(self):
        # What latin-1 decoding of this UTF-8 file produces. It must NOT
        # sneak through as a match -- build_rows raises on an empty
        # province selection precisely so this fails loudly.
        row = {"provincia": "CÃ³rdoba", "departamento": "RÃ\xado Segundo"}
        assert not br.match_province(row)
        assert not br.match_department(row, "Rio Segundo")

    def test_other_provinces_are_rejected(self):
        assert not br.match_province({"provincia": "Santa Fe"})


class TestToNumber:
    def test_parses_values(self):
        assert br.to_number("3673") == 3673.0
        assert br.to_number(" 2505 ") == 2505.0

    def test_blank_is_zero(self):
        assert br.to_number("") == 0.0
        assert br.to_number(None) == 0.0


class TestProvincialYield:
    def test_weights_by_production_over_area(self):
        rows = [
            {"produccion_tm": "1000", "superficie_cosechada_ha": "500"},   # 2000 kg/ha
            {"produccion_tm": "100", "superficie_cosechada_ha": "200"},    # 500 kg/ha
        ]
        # Aggregate: 1100 t / 700 ha = 1571.4 kg/ha, NOT the plain mean of
        # 2000 and 500 (1250) -- the big department must dominate.
        assert br.provincial_yield(rows) == 1571.4

    def test_no_harvested_area_is_none_not_zero(self):
        rows = [{"produccion_tm": "0", "superficie_cosechada_ha": "0"}]
        assert br.provincial_yield(rows) is None


class TestBuildRows:
    def _record(self, campania, depto, rinde, prod, cos):
        return {
            "provincia": "Córdoba",
            "departamento": depto,
            "campania": campania,
            "rendimiento_kgxha": rinde,
            "produccion_tm": prod,
            "superficie_sembrada_ha": "1000",
            "superficie_cosechada_ha": cos,
        }

    def test_department_comes_from_the_polygon_not_a_constant(self):
        # El JSON committeado y el script tienen que hablar del mismo
        # departamento. Cuando estaba fijo a mano quedaron desalineados y
        # --check fallaba contra su propio archivo.
        import json
        doc = json.loads((ROOT / "data" / "rindes-oficiales.json").read_text(encoding="utf-8"))
        committed = doc["campaigns"][0]["departamento"]
        lat, lon = br.lote_centroid()
        assert br.resolve_department(lat, lon) == committed

    def test_raises_when_no_province_matches(self):
        records = [{"provincia": "CÃ³rdoba", "departamento": "x", "campania": "2018/2019"}]
        with pytest.raises(RuntimeError, match="no rows matched"):
            br.build_rows(records, "Rio Segundo")

    def test_missing_department_becomes_a_declared_gap(self):
        records = [self._record("2018/2019", "Juarez Celman", "3000", "3000", "1000")]
        rows = br.build_rows(records, "Rio Segundo")
        first = next(r for r in rows if r["campana"] == "2018/19")
        assert first["rinde_dpto_kg_ha"] is None
        assert first["dpto_source"] == "unavailable"
        assert "gap_reason" in first
        # The provincial aggregate still works from the other departments.
        assert first["rinde_prov_kg_ha"] == 3000.0

    def test_department_row_is_carried_through(self):
        records = [self._record("2022/2023", "Río Segundo", "1170", "200000", "170940")]
        rows = br.build_rows(records, "Rio Segundo")
        row = next(r for r in rows if r["campana"] == "2022/23")
        assert row["rinde_dpto_kg_ha"] == 1170.0
        assert row["dpto_source"] == "measured"
        assert row["departamento"] == "Rio Segundo"  # stored ASCII-folded

    def test_cross_check_is_attached_only_where_verified(self):
        records = [
            self._record("2022/2023", "Río Segundo", "1170", "200000", "170940"),
            self._record("2018/2019", "Río Segundo", "3673", "983648", "267800"),
        ]
        rows = {r["campana"]: r for r in br.build_rows(records, "Rio Segundo")}
        assert "bccba_cross_check" in rows["2022/23"]
        assert "bccba_cross_check" not in rows["2018/19"]
