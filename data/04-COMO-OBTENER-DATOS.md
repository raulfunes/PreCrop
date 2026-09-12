# Cómo obtener los datos (Franco — track data)

## Qué necesitás YA (trazabilidad)

Un paquete por fecha/escenario con:
1. `scene_id` Sentinel-2 L2A
2. NDVI mean/median sobre el polígono
3. Lluvia 7d Open-Meteo
4. `content_sha256` del informe (para anclar on-chain después)

Archivos vivos:
- `data/lote-sentinel-presets.json`
- `data/ndvi_recalc_results.json`
- `data/evidence_report_demo.json`
- `data/demo-scenarios.json`

## Pipeline (repetible)

```bash
cd precrop-hackcba
python3 -m venv .venv && .venv/bin/pip install pystac-client planetary-computer rasterio numpy
# script: buscar STAC → firmar URL → leer B04/B08 en bbox UTM → NDVI con (DN-1000)/10000
# lluvia: archive-api.open-meteo.com
```

### Fórmula NDVI correcta (post ene-2022)
`BOA = (DN - 1000) / 10000` (equiv. DN + BOA_ADD_OFFSET con offset −1000)  
Luego `NDVI = (NIR - Red) / (NIR + Red)` con B08 y B04.

### Resultados medidos 2026-09-12
| Fecha | Scene | NDVI mean (correcto) | NDVI viejo (mal) | Lluvia 7d |
|-------|-------|----------------------|------------------|-----------|
| 2025-02-02 | S2B_…20250202…T20JML… | **0.727** | 0.489 | 46.7 mm |
| 2025-02-07 | S2C_…20250207…T20JML… | **0.698** | 0.460 | 0.1 mm |

**Insight:** en 5 días el NDVI casi no baja. El contraste de demo es **lluvia + malezas**, no un desplome de NDVI. Decirlo en pitch.

## Trazabilidad → web3
1. Generás `evidence_report_demo.json`
2. `sha256` del contenido
3. `publishScore(loteId, score, timestamp, hash)` on-chain

## Qué le entregás al front HOY
JSON actualizado + “breaking change: NDVI buena 0.727 no 0.489”.
