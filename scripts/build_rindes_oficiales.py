"""Official soy yields for the capacity contrast -> data/rindes-oficiales.json.

One row per campaign, 2018/19 to 2024/25, with two yields side by side:

  * departmental (Rio Segundo), the lote's own district
  * provincial (Cordoba), the wider context

Both come from the same open dataset: MAGyP / Direccion de Estimaciones
Agricolas, soy series by province and department, CC-BY. The departmental
figure is published there directly; the provincial one is AGGREGATED here
(total production over total harvested area) rather than taken from a
headline, so the arithmetic is auditable and the two columns are built the
same way.

Why not the Bolsa de Cereales de Cordoba, which is the name a coop
recognises: BCCBA does not publish a per-campaign historical series at a
stable URL -- its site carries monthly agrometeorology reports, and the
campaign figures circulate through press coverage. Rather than transcribe
seven numbers from seven news articles and call them official, the BCCBA
figure is kept as a declared CROSS-CHECK on the one campaign where it is
verifiable (2022/23), and the note says so. If someone later obtains the
BCCBA closing reports, they drop into `bccba_cross_check` per campaign
without touching the measured columns.

This table is not decorative. The pre-sowing limit rests on a linear
NDVI->yield rule that is not a calibrated model; without an official
series next to it, the limit is a number with no backing. The specific
thing it has to show is that the lote's worst year coincides with the
official worst year (2022/23, the drought).

Usage:
    python scripts/build_rindes_oficiales.py            # fetch + print
    python scripts/build_rindes_oficiales.py --write    # write the JSON
    python scripts/build_rindes_oficiales.py --check    # compare committed
"""

from __future__ import annotations

import argparse
import csv
import io
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

SCRIPTS_DIR = Path(__file__).resolve().parent
ROOT = SCRIPTS_DIR.parent
sys.path.insert(0, str(SCRIPTS_DIR))

import build_pack as bp  # noqa: E402  (path set above)

DATA_DIR = ROOT / "data"
OUT_PATH = DATA_DIR / "rindes-oficiales.json"

SCHEMA_VERSION = 1
PACK_VERSION = "1.0.0"  # MUST match the rest of the pack or loadPack() throws
LOTE_ID = "demo-rio-segundo-01"

CSV_URL = (
    "https://datos.magyp.gob.ar/dataset/8ae4865f-d2f2-45a2-9343-7a4a12728a90/"
    "resource/ba694aa3-99d2-4d7d-9936-60f88e36ad9a/download/soja-serie-1941-2024.csv"
)
DATASET_URL = "https://datos.magyp.gob.ar/dataset/soja-siembra-cosecha-produccion-rendimiento"
CSV_ENCODING = "utf-8-sig"  # the file carries a BOM; latin-1 turns "Cordoba" into mojibake

PROVINCE = "Cordoba"

# El departamento NO se fija a mano: se resuelve del propio polígono contra
# Georef, la misma fuente que usa el servicio (services/evidence-api/src/live.js).
# Hardcodearlo es cómo el dato committeado terminó siendo de un departamento y
# el script de otro, con --check fallando contra su propio archivo.
GEOREF_URL = "https://apis.datos.gob.ar/georef/api/ubicacion"
LOTE_GEOJSON = DATA_DIR / "lote.geojson"
DEPARTMENT_FALLBACK = "Rio Primero"

CAMPAIGNS = ["2018/19", "2019/20", "2020/21", "2021/22", "2022/23", "2023/24", "2024/25"]

# The one campaign whose provincial figure could be verified against the
# Bolsa de Cereales de Cordoba. Kept as a cross-check on the aggregation
# method, NOT as a published value: 15.2 qq/ha reported vs ~15.7 computed.
BCCBA_CROSS_CHECK = {
    "2022/23": {
        "rinde_prov_qq_ha_reported": 15.2,
        "ref": "https://www.agrositio.com.ar/noticia/231556-cordoba-calculos-finales-de-produccion-de-soja-campana-202223.html",
        "note": (
            "BCCBA final calculation for the 2022/23 drought campaign, via press "
            "coverage. Used only to sanity-check the aggregation of the MAGyP "
            "series, which lands within about 3 pct of it."
        ),
    }
}


# ---------------------------------------------------------------------------
# Pure helpers (no network -- covered by tests/test_build_rindes.py)
# ---------------------------------------------------------------------------

def to_long_campaign(campana: str) -> str:
    """"2018/19" -> "2018/2019", the spelling the MAGyP CSV uses."""
    left, right = campana.split("/")
    sowing = int(left)
    harvest = sowing + 1
    if len(right) == 2 and right != f"{harvest % 100:02d}":
        raise ValueError(f"campaign must span consecutive years: {campana}")
    return f"{sowing}/{harvest}"


def strip_accents(text: str) -> str:
    """ASCII fold. The pack keeps data/*.json ASCII-only (see canon.js), so
    "Rio Segundo" is stored, not "Rio Segundo" with its accent."""
    import unicodedata

    decomposed = unicodedata.normalize("NFKD", text)
    return "".join(c for c in decomposed if not unicodedata.combining(c))


def to_number(raw: Optional[str]) -> float:
    """Blank cells mean 'not reported', which sums as zero but must never be
    confused with a measured zero -- callers check the row count too."""
    text = (raw or "").strip()
    return float(text) if text else 0.0


def match_province(row: Dict[str, str]) -> bool:
    return strip_accents(row.get("provincia", "")).strip().lower() == PROVINCE.lower()


def match_department(row: Dict[str, str], department: str) -> bool:
    return strip_accents(row.get("departamento", "")).strip().lower() == department.lower()


def provincial_yield(rows: List[Dict[str, str]]) -> Optional[float]:
    """Province yield in kg/ha = total production (t) / total harvested (ha).

    Aggregating production over area is the correct weighting; averaging the
    departments' yields would give a small department the same weight as a
    large one and quietly overstate a bad year.
    """
    production_t = sum(to_number(r["produccion_tm"]) for r in rows)
    harvested_ha = sum(to_number(r["superficie_cosechada_ha"]) for r in rows)
    if harvested_ha <= 0:
        return None
    return round(production_t / harvested_ha * 1000, 1)


def build_rows(records: List[Dict[str, str]], department: str = DEPARTMENT_FALLBACK) -> List[Dict[str, Any]]:
    province_rows = [r for r in records if match_province(r)]
    # A decoding slip (reading this UTF-8 file as latin-1) turns "Cordoba"
    # into "CA3rdoba" and every match silently fails, producing a table of
    # GAPs that looks like missing data instead of a bug. Fail loudly.
    if not province_rows:
        raise RuntimeError(
            f"no rows matched provincia={PROVINCE!r} in {len(records)} records -- "
            "check CSV_ENCODING or the province spelling upstream"
        )
    out: List[Dict[str, Any]] = []

    for campana in CAMPAIGNS:
        long_name = to_long_campaign(campana)
        season = [r for r in province_rows if r.get("campania", "").strip() == long_name]
        dept = [r for r in season if match_department(r, department)]

        row: Dict[str, Any] = {
            "campana": campana,
            "campania_magyp": long_name,
            "departamento": department,
            "provincia": PROVINCE,
        }

        if dept:
            record = dept[0]
            row.update(
                {
                    "rinde_dpto_kg_ha": round(to_number(record["rendimiento_kgxha"]), 1),
                    "superficie_sembrada_ha": round(to_number(record["superficie_sembrada_ha"]), 1),
                    "superficie_cosechada_ha": round(to_number(record["superficie_cosechada_ha"]), 1),
                    "produccion_tm": round(to_number(record["produccion_tm"]), 1),
                    "dpto_source": "measured",
                }
            )
        else:
            row.update(
                {
                    "rinde_dpto_kg_ha": None,
                    "dpto_source": "unavailable",
                    "gap_reason": f"no {department} row for {long_name} in the MAGyP series",
                }
            )

        prov = provincial_yield(season)
        row.update(
            {
                "rinde_prov_kg_ha": prov,
                "prov_departamentos_agregados": len(season),
                "prov_source": "computed" if prov is not None else "unavailable",
            }
        )

        if campana in BCCBA_CROSS_CHECK:
            row["bccba_cross_check"] = BCCBA_CROSS_CHECK[campana]

        out.append(row)

    return out


# ---------------------------------------------------------------------------
# Network
# ---------------------------------------------------------------------------

def lote_centroid(path: Path = None) -> tuple:
    """(lat, lon) del centroide del polígono del lote."""
    ring = bp.read_json(path or LOTE_GEOJSON)["geometry"]["coordinates"][0]
    lons = [pt[0] for pt in ring]
    lats = [pt[1] for pt in ring]
    return sum(lats) / len(lats), sum(lons) / len(lons)


def resolve_department(lat: float, lon: float) -> str:
    """Departamento que contiene ese punto, según Georef. Si el servicio no
    responde se cae al último valor conocido y se avisa: un nombre equivocado
    acá elige la serie de rindes equivocada."""
    import requests

    try:
        resp = requests.get(GEOREF_URL, params={"lat": lat, "lon": lon}, timeout=30)
        resp.raise_for_status()
        name = (resp.json().get("ubicacion") or {}).get("departamento") or {}
        resolved = name.get("nombre")
        if resolved:
            return strip_accents(resolved)
    except Exception as err:  # red caída: no es motivo para fallar el build
        print(f"aviso: Georef no respondio ({type(err).__name__}); se usa {DEPARTMENT_FALLBACK}", file=sys.stderr)
    return DEPARTMENT_FALLBACK


def fetch_records() -> List[Dict[str, str]]:
    """Download the MAGyP soy series and parse it. Import is local so this
    module imports without requests installed (same rule as build_pack)."""
    import requests

    resp = requests.get(CSV_URL, timeout=180)
    resp.raise_for_status()
    text = resp.content.decode(CSV_ENCODING, errors="replace")
    return list(csv.DictReader(io.StringIO(text)))


# ---------------------------------------------------------------------------
# Assembly
# ---------------------------------------------------------------------------

def build_document(rows: List[Dict[str, Any]]) -> Dict[str, Any]:
    measured = [r["rinde_dpto_kg_ha"] for r in rows if r.get("rinde_dpto_kg_ha") is not None]
    worst = min(rows, key=lambda r: r["rinde_dpto_kg_ha"]) if measured else None

    return {
        "schema_version": SCHEMA_VERSION,
        "pack_version": PACK_VERSION,
        "lote_id": LOTE_ID,
        "purpose": (
            "Official soy yields per campaign for the capacity contrast: the "
            "departmental figure for the lote's district next to the provincial "
            "one. The NDVI-based estimate is a transparent linear rule, not a "
            "calibrated model, so it is published against this series -- and the "
            "check that matters is that the lote's worst year matches the "
            "official worst year."
        ),
        "generated_at_utc": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "method": {
            "dpto_rule": "rendimiento_kgxha as published by MAGyP for the department",
            "prov_rule": "sum(produccion_tm) / sum(superficie_cosechada_ha) * 1000 over all Cordoba departments in the campaign",
            "prov_note": (
                "Aggregated by production over area, not averaged across "
                "departments: a plain average would weight a small department "
                "like a large one and understate a bad year."
            ),
            "encoding": CSV_ENCODING,
            "bccba_note": (
                "The Bolsa de Cereales de Cordoba does not publish a per-campaign "
                "historical series at a stable URL; its public archive carries "
                "monthly agrometeorology reports. The BCCBA figure is therefore "
                "recorded as a cross-check on the campaign where it is verifiable, "
                "not transcribed as an official column."
            ),
            "refs": [DATASET_URL, CSV_URL],
        },
        "license": "Creative Commons Attribution 4.0 (MAGyP open data)",
        "coverage": {
            "campaigns_total": len(rows),
            "campaigns_with_dpto": len(measured),
            "worst_campaign": worst["campana"] if worst else None,
            "worst_rinde_dpto_kg_ha": worst["rinde_dpto_kg_ha"] if worst else None,
        },
        "campaigns": rows,
    }


def build_or_reuse(doc: Dict[str, Any], path: Path) -> Dict[str, Any]:
    """Keep the committed timestamp when nothing else changed (see build_pack)."""
    if not path.exists():
        return doc
    try:
        previous = bp.read_json(path)
    except (OSError, ValueError):
        return doc
    stable_old = {k: v for k, v in previous.items() if k != "generated_at_utc"}
    stable_new = {k: v for k, v in doc.items() if k != "generated_at_utc"}
    return previous if stable_old == stable_new else doc


def compare(doc: Dict[str, Any], committed: Dict[str, Any]) -> List[str]:
    problems = []
    old = {c["campana"]: c for c in committed.get("campaigns", [])}
    for row in doc["campaigns"]:
        prev = old.get(row["campana"])
        if prev is None:
            problems.append(f"{row['campana']}: not in committed file")
            continue
        for field in ("rinde_dpto_kg_ha", "rinde_prov_kg_ha"):
            if row.get(field) != prev.get(field):
                problems.append(f"{row['campana']}.{field}: {prev.get(field)} -> {row.get(field)}")
    return problems


def git_is_dirty(path: Path) -> bool:
    try:
        out = subprocess.run(
            ["git", "status", "--porcelain", "--", str(path)],
            cwd=str(ROOT), capture_output=True, text=True, timeout=30,
        )
    except (OSError, subprocess.SubprocessError):
        return False
    return any(line and not line.startswith("??") for line in out.stdout.splitlines())


def summarise(doc: Dict[str, Any]) -> str:
    lines = [f"{'campana':>9}  {'dpto kg/ha':>10}  {'prov kg/ha':>10}  {'dpto qq':>8}"]
    for row in doc["campaigns"]:
        dpto = row.get("rinde_dpto_kg_ha")
        prov = row.get("rinde_prov_kg_ha")
        lines.append(
            f"{row['campana']:>9}  "
            f"{(f'{dpto:.0f}' if dpto is not None else 'GAP'):>10}  "
            f"{(f'{prov:.0f}' if prov is not None else 'GAP'):>10}  "
            f"{(f'{dpto/100:.2f}' if dpto is not None else '-'):>8}"
        )
    cov = doc["coverage"]
    lines.append(
        f"worst campaign: {cov['worst_campaign']} at {cov['worst_rinde_dpto_kg_ha']} kg/ha"
    )
    return "\n".join(lines)


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    parser.add_argument("--write", action="store_true", help="write data/rindes-oficiales.json")
    parser.add_argument("--check", action="store_true", help="compare against the committed file")
    parser.add_argument("--force", action="store_true", help="write even if the target is dirty")
    parser.add_argument("--departamento", default=None, help="fuerza el departamento (ASCII, p.ej. 'Rio Primero'); por defecto se resuelve del poligono")
    args = parser.parse_args(argv)

    try:
        records = fetch_records()
    except ImportError as err:
        print(f"UNVERIFIED: missing dependency ({err})", file=sys.stderr)
        return 2
    except Exception as err:
        name = type(err).__name__
        if name in {"ConnectionError", "Timeout", "HTTPError", "ReadTimeout"}:
            print(f"UNVERIFIED: upstream unavailable ({name}: {err})", file=sys.stderr)
            return 2
        raise

    if args.departamento:
        department = args.departamento
    else:
        lat, lon = lote_centroid()
        department = resolve_department(lat, lon)
        print(f"departamento resuelto del poligono ({lat:.4f}, {lon:.4f}): {department}")

    doc = build_document(build_rows(records, department))
    print(summarise(doc))

    if args.check:
        if not OUT_PATH.exists():
            print(f"UNVERIFIED: {OUT_PATH.name} not committed yet", file=sys.stderr)
            return 2
        problems = compare(doc, bp.read_json(OUT_PATH))
        if problems:
            print("MISMATCH:", file=sys.stderr)
            for line in problems:
                print(f"  {line}", file=sys.stderr)
            return 1
        print("check ok: committed official yields reproduce")
        return 0

    if args.write:
        if git_is_dirty(OUT_PATH) and not args.force:
            print(
                f"refusing to write: {OUT_PATH.name} has uncommitted changes (use --force)",
                file=sys.stderr,
            )
            return 1
        bp.write_json(OUT_PATH, build_or_reuse(doc, OUT_PATH))
        print(f"wrote {OUT_PATH.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
