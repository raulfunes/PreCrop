# Pack de evidencia del lote demo

Este directorio es la **fuente de verdad del lote demo** (`demo-rio-segundo-01`, Río Segundo, Córdoba, 100 ha de soja). Publica los inputs medidos y la metadata para calcular el score. **No calcula el score**: eso lo hace Front. Es JSON estático: el día de la demo no se llama a ningún satélite ni API.

Versión del pack: `pack_version 1.0.0`. Si cambia el schema, sube `pack_version` y se avisa en standup.

## Quién lee qué

| Vos sos | Leés | Para |
|---|---|---|
| **Front** | `demo-scenarios.json` → `scoring` y `scenarios.*` | Toggle bueno / mixto / malo, fórmula, umbrales, score esperado |
| | `lote-sentinel-presets.json` → `presets.*`, `normalization`, `climate_table` | NDVI, lluvia, cómo normalizar |
| | `lote.geojson` | Pintar el polígono y el centro en el mapa |
| **Visión** | `photo-point-presets.json` → `points`, `scenarios.*.weeds_pct_by_point` | Puntos P1..P5 y malezas esperadas por punto (fallback si la API falla) |
| | `demo-scenarios.json` → `scenarios.*.photos` | Qué foto va en qué punto (rutas relativas a `data/`) |
| **Chain** | `evidence/{bueno,mixto,malo}.json` | `content_sha256`, `payload.score_bp`, `payload.evidence_timestamp_utc` para anclar on-chain |

## Los números

| Escenario | Fecha satélite | NDVI (mediana) | Lluvia 7 d | climate | Malezas | Score | Semáforo |
|---|---|---|---|---|---|---|---|
| bueno | 2025-02-02 | 0.782 | 46.7 mm | 90 | 12 % | 74.4 | verde |
| mixto | 2025-02-02 | 0.782 | 46.7 mm | 90 | 55 % | 68.0 | amarillo |
| malo | 2025-02-07 | 0.763 | 0.1 mm | 25 | 65 % | 48.5 | rojo |

NDVI y lluvia son **medidos** (Sentinel-2 L2A vía Planetary Computer, Open-Meteo). Malezas son **simuladas**: no hay drone ni modelo entrenado. Cada número lleva su etiqueta `source` en el JSON.

Hay solo dos fechas de satélite. `mixto` reutiliza el satélite de `bueno` a propósito: lo único que cambia son las malezas, y eso es lo que muestra el valor de las fotos.

## Cómo se calcula el score

```
ndvi_norm = clip((ndvi - 0.20) / (0.85 - 0.20) * 100, 0, 100)
climate   = climate_table(rain_mm_7d)        # primera regla con rain_mm_7d < max_mm
score     = 0.6 * ndvi_norm + 0.25 * climate - 0.15 * weeds_pct
```

| rain_mm_7d | climate |
|---|---|
| < 5 | 25 |
| < 15 | 45 |
| < 25 | 70 |
| < 50 | 90 |
| < 80 | 85 |
| resto | 60 |

Umbrales: **verde ≥ 70**, **amarillo 50 a 69**, **rojo < 50**.

Los márgenes son finos (1.5 a 4 puntos). **No redondear ningún input antes de calcular.** Usar el `ndvi` de 3 decimales tal cual está publicado. `expected_score` en cada escenario es para autochequeo, no es un input.

## Límite de anticipo sugerido (regla `cupo-v1`)

El índice de condición no es un score de crédito. Lo que se entrega a la coop es un **límite de anticipo sugerido**, calculado con reglas a la vista a partir de `lote-economics.json` (rinde de referencia, precio pizarra, tipo de cambio, haircut, cada uno con su fuente):

```
produccion_estimada_t = ha * rinde_ref_t_ha * condicion / 100
valor_referencia_usd  = ha * rinde_ref_t_ha * precio_usd_t
limite_usd            = valor_referencia_usd * haircut * condicion / 100     # rojo bloquea desembolsos nuevos
```

Con los valores publicados: bueno 74.4 → 52 % del valor de referencia (unos 60.800 USD, verde); mixto 68.0 → 48 % (revisar); malo 48.5 → bloqueado. El benchmark es lo que la coop hace hoy: un porcentaje plano para todos. El backend (`services/evidence-api`, `POST /score`) devuelve el límite, los factores que lo movieron, los pesos y la versión de la regla.

## La frase honesta del escenario malo

Entre el 2 y el 7 de febrero el NDVI casi no baja (0.782 → 0.763): la vegetación es inercial, en cinco días la planta no se seca. Lo que tira el lote de verde a rojo es la **lluvia** (46.7 → 0.1 mm, seca real de 14 días) y las **malezas simuladas** (12 % → 65 %). El satélite solo lleva el lote a amarillo; las fotos lo llevan a rojo. Decirlo así en el pitch.

Agosto de 2024 (`fecha_mala_agosto_barbecho`) está archivado en el JSON como contraste fuera de campaña. Es barbecho de invierno, **no** es soja dañada. No usarlo en la demo.

## Evidencia y hash (Chain)

Cada escenario tiene un informe en `evidence/` con `payload` (los inputs y el score) y su `content_sha256`. Regla `precrop-canon-v1`:

1. Tomar solo `payload`.
2. Serializar con claves ordenadas, sin espacios, UTF-8 (el payload es ASCII puro).
3. Los floats enteros se escriben como entero (100, no 100.0).
4. sha256 en hexadecimal minúscula.

En JS: `JSON.stringify` **no ordena claves**, hay que ordenarlas a mano. Hay un vector de prueba (entrada y hash esperado) en `tests/test_pack.py` para verificar la implementación.

`score_bp = floor(score_exact * 100 + 0.5)` (74.4231 → 7442). Redondeo half-up, igual en Python y en JS.

## Fotos

`presets/fotos/*.jpg` las provee otro track. Los nombres están fijados en `demo-scenarios.json` (`limpio_1`, `limpio_2`, `medio_1`, `enmalezado_1`, `enmalezado_2`). Son fotos genéricas de campo (Unsplash), **no** del lote. Decirlo si preguntan.

## Reproducir y validar

```bash
python -m venv .venv && .venv/Scripts/pip install -r tests/requirements.txt
.venv/Scripts/python -m pytest tests -q            # valida el pack sin red

python -m venv .venv-build && .venv-build/Scripts/pip install -r scripts/requirements.txt
.venv-build/Scripts/python scripts/build_pack.py --check   # recalcula NDVI y lluvia en vivo y compara
```

Método, fuentes y aritmética completa en `SOURCES.md`.
