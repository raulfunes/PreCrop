# SOURCES — PreCrop hackathon data pack (Río Segundo / Córdoba)

AOI demo: center **(-31.42, -63.72)**, caja ~**1 km** (bbox en el JSON).

## Fechas elegidas

| Preset | Fecha ISO | Por qué |
|--------|-----------|---------|
| **fecha_buena** | `2025-02-02` | Pico verde soja en Córdoba (ene–mar). Escena S2 cloud≈0%. Lluvia 7d real alta → buen climate_score. |
| **fecha_mala** | `2024-08-26` | Barbecho invernal / fuera de campaña. NDVI bajo medido. Lluvia 7d baja → climate seco. Contraste demo claro. |

Escena alternativa pico (no usada en presets): `2024-01-29` (NDVI mean≈0.48) pero lluvia 7d Open-Meteo = **0 mm** → peor narrativa “buena”.

## NDVI (medido)

- **Fuente:** Microsoft Planetary Computer STAC `sentinel-2-l2a` (sin API key de pago; `planetary-computer` firma URLs SAS).
- **Método:** ventana COG bandas **B04 (rojo)** y **B08 (NIR)** con `rasterio` sobre el bbox AOI; reflectancia L2A como DN/10000; NDVI = (NIR−Red)/(NIR+Red); media sobre ~10 300 píxeles 10 m.
- **fecha_buena:** mean **0.489** (median 0.545) — scene `S2B_MSIL2A_20250202T140709_R110_T20JML_20250202T175010`
- **fecha_mala:** mean **0.151** (median 0.135) — scene `S2B_MSIL2A_20240826T140709_R110_T20JML_20240826T181009`
- **Estado:** **measured** (no estimado). Nota: el mean del AOI mezcla cultivo + bordes/caminos; por eso el pico (~0.49) es más bajo que un lote puro de soja (típicamente 0.7–0.9). El median de fecha_buena (0.545) refleja mejor el interior vegetado.
- **Blockers:** ninguno para STAC/COG en este entorno. No se usó Copernicus Dataspace (evita login).

## Precipitación 7 días (real)

- **Fuente:** [Open-Meteo Historical Weather API](https://archive-api.open-meteo.com/v1/archive) — gratis, sin key.
- **Parámetros:** `daily=precipitation_sum`, `timezone=America/Argentina/Cordoba`, lat/lon del centro AOI.
- Ventana = día de la escena + **6 días previos** (7 días inclusive).
- **fecha_buena (2025-02-02):** sum = **46.7 mm** (daily: 14.9, 31.8, 0, 0, 0, 0, 0) → window 2025-01-27 … 2025-02-02
- **fecha_mala (2024-08-26):** sum = **6.9 mm** (daily: 4.8, 0, 0, 1.8, 0.3, 0, 0) → 2024-08-20 … 2024-08-26

## climate_score (tabla simple)

Definida para el demo (no es un modelo agrometeorológico):

| rain_mm_7d | climate |
|------------|---------|
| < 5 | 25 |
| < 15 | 45 |
| < 25 | 70 |
| < 50 | 90 |
| < 80 | 85 |
| ≥ 80 | 60 (exceso) |

→ fecha_buena: **90** · fecha_mala: **45**

## weed_pct — ESTIMADO (no CV)

**No hay drone ni modelo de visión.** Valores conservadores etiquetados `estimado` en el JSON:

- fecha_buena: **9%** — supuesto manejo razonable en pico vegetativo.
- fecha_mala: **26%** — barbecho invernal con malezas/rastrojo (conservador, no “campo abandonado”).

No pretender detección automática.

## Score y valuación

```
vigor = ndvi * 100
climate = tabla(rain_mm_7d)
score = 0.45*vigor + 0.35*(100 - weed_pct) + 0.20*climate
valuation = 100000 * (score/100) * 0.7
```

| Preset | ndvi | weed_pct | rain | climate | score | valuation_usd |
|--------|------|----------|------|---------|-------|---------------|
| fecha_buena | 0.489 | 9 (est.) | 46.7 | 90 | 71.85 | 50298.5 |
| fecha_mala | 0.151 | 26 (est.) | 6.9 | 45 | 41.7 | 29186.5 |

## Archivos

- `data/lote-sentinel-presets.json` — presets listos para drop-in (`fecha_buena` / `fecha_mala`)
- `data/_raw_fetch.json` — raw stats del fetch (debug)
- `data/SOURCES.md` — este archivo

## Cómo reproducir

```bash
# STAC search + NDVI window + Open-Meteo (ver script usado en el pack / _raw_fetch.json)
# Deps: pystac-client, planetary-computer, rasterio, numpy, requests
```


## Fotos preset (simulación — Unsplash)

Descargadas 2026-09-11 a `data/presets/fotos/` via images.unsplash.com (licencia Unsplash: uso libre; atribución recomendada).

| Archivo | Uso demo | URL origen (photo id) |
|---------|----------|------------------------|
| limpio_1.jpg | escenario bueno | photo-1625246333195-78d9c38ad449 |
| limpio_2.jpg | escenario bueno | photo-1574943320219-553eb213f72d |
| medio_1.jpg | mixto / malo parcial | photo-1464226184884-fa280b87c399 |
| enmalezado_1.jpg | escenario malo | photo-1416879595882-3373a0480b5b |
| enmalezado_2.jpg | escenario malo | photo-1500382017468-9049fed747ef |

**Importante:** son fotos genéricas de campo para simular el flujo visión, no del lote Río Segundo. Decirlo en pitch si preguntan.

Escenarios coordinados: `data/demo-scenarios.json` (bueno / malo / mixto).


## UPDATE 11-sep noche — malo misma campaña + NDVI offset

### Qué hacer en la demo (decisión)
- **Prioridad:** mock funcional (toggle bueno→malo→rojo→bloqueo→repago).
- **Malo nuevo:** `2025-02-07` (no agosto). Lluvia 7d **0.1 mm** verificada Open-Meteo (vs **46.7 mm** el 2 feb).
- **No usar 17 feb como “seco”:** lluvia 7d al 17 feb = **28.0 mm** (llovió 15–16 feb).
- Agosto 2024 queda archivado como `fecha_mala_agosto_barbecho` (solo contraste fuera de campaña).

### NDVI
- Hipótesis: fórmula vieja `DN/10000` sin offset **1000** → NDVI comprimido.
- Correcta a revisar: `(DN − 1000) / 10000` en L2A post-2022.
- Hasta recalcular: `fecha_mala.ndvi = 0.35` **provisional/mock**; avisar Front antes de cambiar el 0.489.

### Acción Franco
1. Dejar que Front/Visión mockeen con `demo-scenarios.json`.
2. Recalcular NDVI 2-feb y 7-feb con offset (breaking change + standup).
3. Confirmar scene_id Sentinel 2025-02-07 sobre el lote (nubes locales).
