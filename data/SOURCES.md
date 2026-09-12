# SOURCES — Paquete de datos PreCrop (demo Río Segundo / Córdoba)

Este archivo es la trazabilidad de **cada número publicado** en el pack: de dónde sale, con qué fórmula, y cómo reproducirlo. Si un juez pregunta "¿de dónde sale el 0.782?", la respuesta está acá, no en la memoria de nadie.

**Resumen en una línea:** dos fechas reales de la misma campaña de soja (2025-02-02 y 2025-02-07), NDVI recalculado con el offset correcto de Sentinel-2 L2A, lluvia real de Open-Meteo, y malezas simuladas — el semáforo cae de verde a rojo por **lluvia + malezas**, no porque el satélite muestre daño (el NDVI casi no se mueve en 5 días).

## Ruta rápida

1. [AOI](#aoi) — dónde
2. [Fechas y por qué](#fechas-satelitales-y-por-qué) — cuándo, y por qué esas dos
3. [NDVI](#ndvi--método-y-valores) — cómo se calculó
4. [Lluvia 7 días](#lluvia-7-días--método-y-aritmética-diaria) — cómo se calculó
5. [Normalización y los 3 scores esperados](#normalización-y-los-3-scores-esperados) — el semáforo
6. [Malezas por punto](#malezas-por-punto--dueño-único) — quién es dueño del dato
7. [Evidencia y hash (Chain)](#evidencia-y-hash-para-chain) — qué se ancla on-chain
8. [Fotos preset](#fotos-preset--no-son-de-este-lote-y-no-las-genera-este-paquete) — de dónde salen, quién las pone
9. [Cómo reproducir](#cómo-reproducir) — `--check` contra las APIs en vivo
10. [Histórico / superseded](#histórico--fórmula-y-valores-superados-no-usar) — lo que ya no vale

## AOI

| Campo | Valor |
|---|---|
| `lote_id` | `demo-rio-segundo-01` |
| Centro | `(-31.42, -63.72)` |
| `bbox` (WGS84) | `[-63.7254, -31.4245, -63.7146, -31.4155]` |
| Tamaño | ~1 km de lado, ~100 ha nominales |
| Geometría | `data/lote.geojson`, `geometry_kind: "analysis_box"` |

**No es un polígono catastral.** Es una caja de análisis de ~1 km alrededor del centro; mezcla el cultivo con caminos y bordes. Esto importa para elegir qué estadístico de NDVI publicar (ver abajo).

## Fechas satelitales y por qué

| Preset | Fecha | Scene ID (Sentinel-2 L2A) | Nubosidad | ¿Por qué? |
|---|---|---|---|---|
| `fecha_buena` | 2025-02-02 | `S2B_MSIL2A_20250202T140709_R110_T20JML_20250202T175010` | 0.28% | Pico vegetativo de soja, misma campaña 2024/25, escena verificada sin nubes sobre el AOI. |
| `fecha_mala` | 2025-02-07 | `S2C_MSIL2A_20250207T140811_R110_T20JML_20250207T174511` | 33.2% (verificada 0% sobre el AOI puntual) | **Misma campaña**, 5 días después. La regla del equipo es no narrar una escena fuera de campaña como "daño" — por eso NO se usa agosto. |

`mixto` reutiliza el bloque satelital de `fecha_buena` (mismo NDVI, misma lluvia): lo único que cambia son las malezas simuladas. No hay una tercera fecha satelital.

### Escena archivada (barbecho invernal, NO es un escenario de pitch)

| Campo | Valor |
|---|---|
| Preset | `fecha_mala_agosto_barbecho` |
| Fecha | 2024-08-26 |
| NDVI | 0.151 (método viejo, ver nota) |
| Lluvia 7d | 6.9 mm |
| `deprecated_for_pitch` | `true` |

Es barbecho invernal, **fuera de la campaña de soja** — no hay cultivo en pie, así que un NDVI bajo ahí no significa "cultivo dañado". Además se calculó con el método viejo `DN/10000` (sin el offset), así que **no es comparable numéricamente** con los valores 2025 sin recalcularlo. Se mantiene en el archivo solo como contraste histórico; ningún escenario de `demo-scenarios.json` lo referencia (test `V10`).

## NDVI — método y valores

- **Fuente:** Microsoft Planetary Computer STAC, colección `sentinel-2-l2a` (sin API key; `planetary-computer` firma URLs SAS). Búsqueda **por `scene_id` exacto** (no por rango de fechas) — determinística, un solo resultado.
- **Lectura:** ventana rasterio sobre el `bbox` del AOI, en el CRS de la escena (EPSG:32720 — UTM 20S), bandas **B04** (rojo) y **B08** (NIR). Se lee **solo la ventana**, nunca la escena completa.
- **Corrección de offset:** `processing_baseline >= "04.00"` desplazó los DN en +1000 (cambio de armonización de ESA, 2022-01-25). Reflectancia BOA correcta: `BOA = (DN − 1000) / 10000`. `NDVI = (B08 − B04) / (B08 + B04)`.
- **Estadístico publicado:** la **mediana**, no la media. La caja de ~1 km mezcla cultivo con caminos/bordes, así que la mediana representa mejor el interior vegetado que la media (que además, con los anclajes fijos del equipo, deja `bueno` en 69.4 = amarillo — rompe la demo). Media, p10, p90 y n_pixels quedan publicados igual en `ndvi_stats` para auditoría.
- **n_pixels esperado:** 10 300 (103 × 100 px @ 10 m). Si no da ese número, la ventana/CRS está mal — el script lo verifica con un `assert`.

| Preset | mean | **median (publicado)** | p10 | p90 | n_pixels |
|---|---|---|---|---|---|
| fecha_buena (2025-02-02) | 0.727 | **0.782** | 0.515 | 0.898 | 10300 |
| fecha_mala (2025-02-07) | 0.698 | **0.763** | 0.474 | 0.877 | 10300 |

**Estado:** `measured`. Fuente completa de precisión: `data/ndvi_recalc_results.json` (calculado 2026-09-12T02:37Z).

## Lluvia 7 días — método y aritmética diaria

- **Fuente:** [Open-Meteo Historical Weather API](https://archive-api.open-meteo.com/v1/archive) — gratis, sin key, `daily=precipitation_sum`, `timezone=America/Argentina/Cordoba`, lat/lon del centro del AOI.
- **Ventana:** el día de la escena + los 6 días previos (7 días inclusive).

| fecha_buena — ventana 2025-01-27 … 2025-02-02 | mm | fecha_mala — ventana 2025-02-01 … 2025-02-07 | mm |
|---|---|---|---|
| 2025-01-27 | 14.9 | 2025-02-01 | 0.0 |
| 2025-01-28 | 31.8 | 2025-02-02 | 0.0 |
| 2025-01-29 | 0.0 | 2025-02-03 | 0.0 |
| 2025-01-30 | 0.0 | 2025-02-04 | 0.0 |
| 2025-01-31 | 0.0 | 2025-02-05 | 0.1 |
| 2025-02-01 | 0.0 | 2025-02-06 | 0.0 |
| 2025-02-02 | 0.0 | 2025-02-07 | 0.0 |
| **Suma** | **46.7** | **Suma** | **0.1** |

**Estado:** `measured`. Verificado en vivo contra el endpoint el 2026-09-12 (ver [Cómo reproducir](#cómo-reproducir)) — reproduce exacto.

## `climate_table` (heurística del demo, no un modelo agrometeorológico)

| `rain_mm_7d` | `climate` | label |
|---|---|---|
| < 5 | 25 | sequía |
| < 15 | 45 | seco |
| < 25 | 70 | aceptable |
| < 50 | **90** | óptimo |
| < 80 | 85 | húmedo |
| ≥ 80 | 60 | exceso |

→ fecha_buena (46.7 mm): **90**. fecha_mala (0.1 mm): **25**.

## Normalización y los 3 scores esperados

```
ndvi_norm = clip((ndvi - 0.20) / (0.85 - 0.20) * 100, 0, 100)   # anclas fijas agronómicas, "estimated", NO derivadas de este lote
climate   = climate_table(rain_mm_7d)                            # tabla de arriba
weeds     = weeds_pct                                            # pass-through 0-100, "simulated"

score = 0.6 * ndvi_norm + 0.25 * climate - 0.15 * weeds          # fórmula: la dueña es Front, el pack solo la publica y la aplica una vez para el self-check
```

No existe (ni debe existir) ninguna clave `rain_norm` en el pack — fue reemplazada por `climate_table` antes de publicarse nada.

| Escenario | preset | ndvi | ndvi_norm | climate | weeds (simulado) | score exacto | **score** | banda | margen al umbral |
|---|---|---|---|---|---|---|---|---|---|
| **bueno** | fecha_buena | 0.782 | 89.5385 | 90 | 12 | 74.4231 | **74.4** | verde | +4.4 sobre 70 |
| **mixto** | fecha_buena | 0.782 | 89.5385 | 90 | 55 | 67.9731 | **68.0** | amarillo | −2.0 de verde (70) |
| **malo** | fecha_mala | 0.763 | 86.6154 | 25 | 65 | 48.4692 | **48.5** | rojo | −1.5 de amarillo (50) |

**Los márgenes son finos (1.5 a 4.4 puntos).** Por eso: usar el `ndvi` publicado de 3 decimales tal cual, sin redondear ningún input — redondear **solo** el resultado final. `demo-scenarios.json` publica esto mismo como `scoring.precision_warning`.

### Por qué el semáforo cambia de verde a rojo (honestidad para el pitch)

**El NDVI casi no se mueve en 5 días** (0.782 → 0.763): la vegetación es inercial, el satélite solo no muestra "daño" entre el 2 y el 7 de febrero. La caída de verde a rojo la explican **la lluvia** (46.7 → 0.1 mm) **y las malezas SIMULADAS** (12% → 65%) — no el satélite. Decir esto explícitamente en el pitch; cada escenario lo repite en su propio `narrative_note`.

## Malezas por punto — dueño único

`data/photo-point-presets.json` es la **única fuente de verdad** para malezas por punto. `demo-scenarios.json` nunca lleva un número de malezas propio — solo un `weeds_ref` que apunta al archivo correcto (esto lo hace cumplir el test `T7`).

- 5 puntos fijos P1..P5 (protocolo: nadir, 0.6–1.5 m de altura, GPS ±30 m, mínimo 3 puntos, agregación por **mediana**).
- `weeds_pct_lote` publicado = mediana de `weeds_pct_by_point` (enforced por `T6`).

| Escenario | mediana (`weeds_pct_lote`) |
|---|---|
| bueno | 12 |
| mixto | 55 |
| malo | 65 |

Todos los valores están etiquetados `"source": "simulated"` — no hay drone ni visión real corriendo sobre este lote.

## Evidencia y hash (para Chain)

Cada escenario tiene un reporte en `data/evidence/{bueno,mixto,malo}.json`: `schema_version`, `lote_id`, `scenario`, un `payload` plano, y `content_sha256` **fuera** de `payload` (un hash nunca puede estar dentro de lo que hashea).

**Regla de canonicalización `precrop-canon-v1`** (Chain debe reproducirla exacto):

1. Se hashea **solo** el objeto `payload`. `content_sha256`, `generated_at_utc`, `report_id`, `schema_version` son hermanos de `payload`, no entran en el hash.
2. `payload` es un mapa **plano**: valores `string`, número finito, o `bool`. Sin objetos anidados, sin arrays, sin `null`.
3. Serialización: claves ordenadas ascendente por code point Unicode, `{"key":value,...}`, **sin espacios**, bytes UTF-8.
4. `sha256(bytes)` → hex en minúsculas.
5. Restricciones que hacen esto reproducible en Python/JS/Solidity: toda clave matchea `^[a-z0-9_]+$`; todo string es ASCII-only (los acentos viven fuera de `payload`, en `narrative_note` y compañía); todo número es finito, `|x| < 1e6`, con ≤ 4 decimales.

```python
canonical = json.dumps(payload, sort_keys=True, separators=(",", ":"),
                        ensure_ascii=False, allow_nan=False)
digest = hashlib.sha256(canonical.encode("utf-8")).hexdigest()
```

**Vector de oro** (para que Chain valide su implementación TS antes del demo): `payload = {"b": "x", "a": 1}` canonicaliza a `{"a":1,"b":"x"}` (15 bytes) → `sha256` = `ecf9e98ec0641e23113ff3ce8bdc78d0ddd249886517fd4a7f68cc83d4e65667`.

| Escenario | `content_sha256` | `score_bp` |
|---|---|---|
| bueno | `9e0fe345042016d7f867c6ae84d5d5a41f2d64e77ac7ce0eb76f2b881d1cead2` | 7442 |
| mixto | `537abfe0522f30e4a8d01536204d170d9532ac2ad73696dbd431233b33fa323e` | 6797 |
| malo | `55a8eaf55d5e1afda3d56ae171fb93647d77496284f0d6ea3e80b230fe8f9068` | 4847 |

`score_bp = round(score * 100)` — enteros en basis points porque Solidity no tiene floats. Chain llama `publishScore(loteId, score_bp, evidence_timestamp_utc, content_sha256)`, un evento por escenario (por eso son tres reportes y no uno combinado).

## Fotos preset — no son de este lote, y no las genera este paquete

**Las 5 fotos referenciadas en `demo-scenarios.json` (`presets/fotos/*.jpg`) las provee otro track del equipo** (Vision/dueño de fotos), no este pack de datos. Este archivo y `demo-scenarios.json`/`photo-point-presets.json` solo definen el **contrato** (nombres de archivo + mapeo a `point_id`); quien las agregue debe respetar esos nombres exactos. `tests/test_pack.py::TestT12Photos` se salta (no falla) mientras los archivos no estén presentes.

Son fotos de stock de Unsplash de campos genéricos — **no son fotos de este lote**. Se documentan acá los ids para dar la atribución correcta cuando el otro track las suba:

| Archivo | Uso demo | Photo ID (Unsplash) |
|---|---|---|
| `limpio_1.jpg` | escenario bueno | `photo-1625246333195-78d9c38ad449` |
| `limpio_2.jpg` | escenario bueno | `photo-1574943320219-553eb213f72d` |
| `medio_1.jpg` | mixto / malo parcial | `photo-1464226184884-fa280b87c399` |
| `enmalezado_1.jpg` | escenario malo | `photo-1416879595882-3373a0480b5b` |
| `enmalezado_2.jpg` | escenario malo | `photo-1500382017468-9049fed747ef` |

Decirlo en el pitch si preguntan: son fotos genéricas de campo para simular el flujo de visión, no del lote Río Segundo.

## Cómo reproducir

`scripts/build_pack.py` regenera cada valor `measured` desde las APIs de arriba. **No corre en el camino de la demo** — es una herramienta de auditoría, y el pack ya está commiteado como JSON estático.

```bash
# Windows, venv limpio y dedicado (nunca conda/GDAL — rasterio trae sus propias wheels)
python -m venv .venv-build
.venv-build/Scripts/pip install -r scripts/requirements.txt

# Recalcula NDVI + lluvia desde STAC/Open-Meteo en vivo y compara contra
# lo commiteado. No escribe nada.
.venv-build/Scripts/python scripts/build_pack.py --check
```

`--check` sale con código **0** si todo reproduce dentro de tolerancia, **1** si algo no matchea (imprime una tabla con los deltas), **2** si STAC/Open-Meteo no están alcanzables (offline el día de la demo no es una falla). Verificado en vivo el 2026-09-12: los 6 campos (NDVI mean/median × 2 fechas, lluvia × 2 fechas) reproducen — la lluvia da exacta, el NDVI dentro de milésimas.

Otros modos:
- `--only ndvi` / `--only rain` / `--only assemble`: diagnósticos de solo lectura (no escriben nada).
- `--only evidence [--write]` (default): reensambla `data/evidence/*.json` desde los archivos ya commiteados — no toca la red.
- `--write` (con `--only assemble`): regenera `lote-sentinel-presets.json` y `evidence/*.json` desde las APIs; se niega si `lote-sentinel-presets.json` tiene cambios sin commitear.

`scripts/requirements.txt` es un `pip freeze` real de un venv limpio (no versiones tipeadas a mano).

> **Nota para verify:** el spec (R1.2, R7.1) nombra un `scripts/validate_pack.py` como el chequeo offline del pack. Lo que existe hoy es `tests/test_pack.py` (`pytest tests/ -q`), que implementa las mismas aserciones T1..T12/V10 pero como suite de pytest, no como script standalone. Es una discrepancia spec↔implementación heredada de una batch anterior.

## Histórico / fórmula y valores superados (NO usar)

Todo lo de esta sección quedó reemplazado. Se documenta para que nadie lo reintroduzca por accidente.

### NDVI sin offset (fórmula vieja `DN/10000`)

Antes de aplicar el offset `-1000` del `processing_baseline >= 04.00`, el NDVI daba comprimido hacia 0:

| Fecha | mean (viejo, SUPERSEDED) | median (viejo, SUPERSEDED) |
|---|---|---|
| 2025-02-02 | 0.489 | 0.545 |
| 2025-02-07 | 0.460 | 0.519 |

Durante la noche del 11-sep, mientras se recalculaba, `fecha_mala.ndvi` llegó a publicarse como **`0.35` (provisional/mock)** — nunca fue un valor medido, era un placeholder hasta terminar el recálculo con offset. No usar.

### `fecha_mala` viejo = 2024-08-26

Antes de la decisión de usar `2025-02-07` (misma campaña), `fecha_mala` apuntaba a la escena archivada de agosto 2024 (barbecho invernal). Quedó reclasificada como `fecha_mala_agosto_barbecho`, `deprecated_for_pitch: true` (ver [arriba](#escena-archivada-barbecho-invernal-no-es-un-escenario-de-pitch)).

### Fórmula de score y valuación vieja

```
vigor = ndvi * 100
climate = tabla(rain_mm_7d)
score = 0.45*vigor + 0.35*(100 - weed_pct) + 0.20*climate
valuation = 100000 * (score/100) * 0.7
```

| Preset | ndvi (viejo) | weed_pct (est.) | rain | climate | score | valuation_usd |
|---|---|---|---|---|---|---|
| fecha_buena | 0.489 | 9 | 46.7 | 90 | 71.85 | 50298.5 |
| fecha_mala | 0.151 | 26 | 6.9 | 45 | 41.7 | 29186.5 |

Reemplazada por la fórmula de Front (`0.6*ndvi_norm + 0.25*climate - 0.15*weeds`, ver [arriba](#normalización-y-los-3-scores-esperados)). El pack ya no publica `score`, `valuation_usd`, `vigor` ni `weed_pct` en `lote-sentinel-presets.json` — son datos derivados que le corresponden a Front, no a este paquete (enforced por `T8`).

### Archivo de stats crudas

El archivo de stats crudas del recálculo NDVI es `data/ndvi_recalc_results.json` (creado 2026-09-12T02:37Z) — es el único nombre válido para ese propósito en este pack.
