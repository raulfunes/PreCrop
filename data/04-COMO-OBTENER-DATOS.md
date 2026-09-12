# Cómo obtener los datos (track data)

> Para la trazabilidad completa (fórmulas, tablas, hash) ver `data/SOURCES.md`. Este archivo es la guía operativa corta: qué correr y qué mirar.

## Qué necesitás por escenario (trazabilidad)

1. `scene_id` Sentinel-2 L2A (búsqueda por id exacto, no por rango de fechas).
2. NDVI — mediana sobre el polígono, con el offset correcto (`BOA = (DN − 1000) / 10000`).
3. Lluvia 7 días (Open-Meteo).
4. `content_sha256` del reporte de evidencia (para anclar on-chain).

Archivos vivos:

- `data/lote-sentinel-presets.json` — presets NDVI/lluvia por fecha
- `data/demo-scenarios.json` — los 3 escenarios (bueno/mixto/malo)
- `data/photo-point-presets.json` — malezas por punto (única fuente)
- `data/lote.geojson` — geometría AOI
- `data/ndvi_recalc_results.json` — stats crudas del recálculo NDVI
- `data/evidence/{bueno,mixto,malo}.json` — reportes con hash, para Chain

Las stats crudas del recálculo NDVI viven únicamente en `data/ndvi_recalc_results.json`. El reporte combinado que existía antes fue reemplazado por los tres reportes de `data/evidence/` (uno por escenario, cada uno con su propio hash).

## Pipeline (repetible) — `scripts/build_pack.py`

```bash
# Windows, venv dedicado y limpio (nunca conda/GDAL)
python -m venv .venv-build
.venv-build/Scripts/pip install -r scripts/requirements.txt

# Recalcula NDVI + lluvia desde STAC/Open-Meteo en vivo, compara contra
# lo commiteado, no escribe nada.
.venv-build/Scripts/python scripts/build_pack.py --check
```

- Búsqueda STAC: Microsoft Planetary Computer, colección `sentinel-2-l2a`, por `scene_id` exacto.
- NDVI: ventana rasterio sobre el `bbox` del AOI (EPSG:32720), bandas B04/B08, `BOA = (DN − 1000) / 10000` para `processing_baseline >= 04.00`, mediana publicada.
- Lluvia: `archive-api.open-meteo.com`, `daily=precipitation_sum`, ventana = fecha de la escena + 6 días previos.

**No hay paso de descarga de fotos en este pipeline.** Las 5 fotos preset de `data/presets/fotos/` las provee otro track del equipo (ver `SOURCES.md`); este script no las genera ni las descarga.

## Resultados vigentes (recalculados, con offset)

| Fecha | Scene | NDVI mediana (publicado) | NDVI media | Lluvia 7d |
|-------|-------|---------------------------|------------|-----------|
| 2025-02-02 (fecha_buena) | `S2B_…20250202…T20JML…` | **0.782** | 0.727 | 46.7 mm |
| 2025-02-07 (fecha_mala) | `S2C_…20250207…T20JML…` | **0.763** | 0.698 | 0.1 mm |

**Insight:** en 5 días el NDVI casi no baja. El contraste de la demo es **lluvia + malezas simuladas**, no un desplome de NDVI — decirlo en el pitch.

## Trazabilidad → web3

1. `scripts/build_pack.py` genera `data/evidence/{bueno,mixto,malo}.json`.
2. Cada uno trae su propio `content_sha256` (regla `precrop-canon-v1`, ver `SOURCES.md`).
3. Chain llama `publishScore(loteId, score_bp, evidence_timestamp_utc, content_sha256)` — un evento por escenario.

## Qué le entregás al front

El JSON actualizado (`lote-sentinel-presets.json`, `demo-scenarios.json`) más el aviso de breaking change ya hecho en su momento: **NDVI buena 0.489 → 0.782** (fórmula vieja sin offset → mediana con offset correcto).
