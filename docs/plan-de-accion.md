# Plan de acción — PreCrop, equipo de 3

**Tesis:** PreCrop le vende a cooperativas y acopios chicos la evidencia que hoy no tienen para prestar. Con el historial satelital del lote calcula cuánto produce en un año malo y qué tan estable es, y con eso define el **cupo del anticipo antes de sembrar**, contra el peor año que ese lote ya tuvo. Durante la campaña, un **semáforo de condición** gobierna si el próximo desembolso se libera o se corta. Capacidad define cuánto; condición define si seguís. No prestamos: vendemos la decisión ya tomada, en un formato que un comité de crédito puede firmar, contrastada contra los rindes oficiales de Córdoba.

## Qué hay en `main` (revisado 12-sep)

| Pieza | Dónde | Estado | Cubre |
|---|---|---|---|
| Pack de datos v1: NDVI medido (2 fechas 2025), lluvia, puntos, economía del lote, evidencia con hash | `data/` | ✅ | Condición |
| Fórmula compartida + hash + regla `cupo-v1` (límite de anticipo) | `packages/score` | ✅ | Condición |
| Backend: `/score`, `/publish` (oráculo Solana devnet), `/disburse` (mock Twin ARGt) | `services/evidence-api` | ✅ | Condición + pago |
| Front MVP en Next: mapa, semáforo, evidencia, desembolso simulado, misma fórmula que el pack | `src/` (raíz) | ✅ | Demo |
| Visión: experimento de segmentación con Gemini, dataset público, endpoint Python | `api/`, `data/vision-growingsoy/`, `VISION-IA.md` | 🧪 experimental, resultados flojos | Malezas |
| Pitch, diagrama, branding | `docs/` | ✅ | Narrativa |
| **Historial del lote por campaña** (año malo, estabilidad) | — | ❌ | **Capacidad** |
| **Contraste contra rindes oficiales de Córdoba** | — | ❌ | **Capacidad** |
| **Informe firmable para el comité** | — | ❌ | Formato |
| Firma real en devnet | wallet creada, sin SOL | ⏳ | Demo |

**Fuente de verdad de los datos: `data/`.** Las copias viejas de `lote-sentinel-presets.json` y `SOURCES.md` que había en la raíz (NDVI 0.489, score adentro) se borraron. Si alguien ve un 0.489, está leyendo un archivo viejo.

## Decisión: visión al mínimo

El experimento de visión no llegó a un detector confiable (IoU 0 en la prueba evaluable, cortes por 503 del proveedor) y no hay tiempo para que llegue. La demo NO depende de él: las malezas salen del valor simulado del pack (`photo-point-presets.json`), que ya cierra el semáforo en verde, amarillo y rojo. El proxy del Front a `VISION_BACKEND_URL` queda como está, con fallback al pack. Lo único que se hace de visión: subir las cinco fotos a `data/presets/fotos/` con los nombres del pack para que la pantalla tenga imágenes. Se dice honesto en el pitch: malezas estimadas sobre fotos, sin drone; la IA está ahí y es experimental.

## Lo que falta, en orden de dependencia

```
historial NDVI por campaña ──► regla capacidad-v1 ──► contraste vs rindes oficiales ──► informe comité ──► pantalla Capacidad ──► pitch final
```

Todo lo de capacidad se construye con lo que ya funciona: el script de STAC, la regla lineal NDVI → rinde, el pack en JSON.

## Reparto

### Franco — datos y backend (unas 8 h)

1. **Historial del lote** (3 a 4 h). `scripts/build_history.py` reutilizando `build_pack.py`: para cada campaña de 2018/19 a 2024/25, escenas Sentinel-2 L2A sobre el polígono entre el 15 de enero y el 15 de marzo con nubes < 10 %, mediana de NDVI por escena, quedarse con el **pico** por campaña. Lluvia acumulada diciembre–febrero (Open-Meteo). Salida `data/lote-history.json`: una fila por campaña con fecha, escena, NDVI pico, lluvia y fuente.
   - Trampa: el offset de reflectancia (restar 1000) aplica solo a `processing_baseline >= 04.00` (desde enero 2022). Las campañas anteriores NO llevan offset. Decidir por escena.
   - Si una campaña no tiene escena limpia en la ventana, ampliar y anotarlo. No rellenar.
2. **Regla `capacidad-v1`** (1 h) en `packages/score`: rinde estimado por campaña = rinde de referencia × NDVI_norm / 100. Año malo = mínimo de la serie. Estabilidad = coeficiente de variación. **Cupo pre-siembra = ha × rinde del año malo × precio × haircut.** Endpoint `GET /capacity` con la serie, el año malo, la estabilidad, el cupo y las fuentes.
3. **Informe para el comité** (2 h). `GET /report/<escenario>`: una página en markdown con lote, capacidad (serie, año malo, cupo pre-siembra), condición actual (índice, factores, límite), contraste oficial, fuentes, versión de reglas, hash y firma. Es el "formato que un comité puede firmar".
4. **Firma real en devnet** (15 min). Cargar SOL en `HBhUd4K6SkgaYQm54xF5rhmQJndc3NJq7JHt15MYhGg8` desde https://faucet.solana.com y correr `/publish`. Guardar el link del explorer.

### Front (unas 8 h)

El MVP ya usa la misma fórmula y lee los JSON de `data/`. Ajustes:

1. **Una sola fuente para el número que firma la coop.** Hoy el cupo se calcula sobre `COSECHA_BASE_USD = 100.000` fijo; el backend usa el valor de referencia de `lote-economics.json` (116.736 USD). Mismo porcentaje, distinto monto (52.100 vs 60.800 USD). Tomar el bloque `advance` de `POST /score` y mostrar el límite, los factores con su aporte y `rule_version`.
2. **Botones**: "Publicar evidencia" → `POST /publish` → link al explorer. "Aprobar y pagar en ARGt" → `POST /disburse` → recibo simulado. Cartel MOCK.
3. **Pantalla Capacidad** (cuando esté `/capacity`): barras por campaña con el rinde estimado del lote y el oficial al lado, el año malo resaltado, el cupo pre-siembra en grande con la frase "contra el peor año que este lote ya tuvo".
4. **Vista Informe**: renderiza `/report` con botón de imprimir.

### Tercera persona — rindes oficiales, pitch, video (unas 8 h)

1. **Tabla de rindes oficiales** (3 h). Rinde de soja de Río Segundo (o provincial si no está el departamental) para cada campaña 2018/19 a 2024/25, desde los informes de la Bolsa de Cereales de Córdoba, con link por fila. Dejarla en `data/rindes-oficiales.json`. Es lo que Franco necesita para el contraste y lo que la coop reconoce como "el mapa oficial".
2. **Pitch** (3 h). Reescribir `docs/pitch-90s.md` con la tesis nueva: capacidad antes de sembrar contra el peor año, condición durante la campaña, la coop firma, Twin paga. Ensayar con cronómetro. Respuestas listas para "¿validado contra qué?", "¿y si riega?", "¿esto ya existe?".
3. **Fotos y video** (2 h). Las cinco fotos a `data/presets/fotos/` con los nombres del pack. Grabar la demo con las tres escenas por si el día D no hay red.

## Próximas 24 h

| Bloque | Franco | Front | Tercera persona |
|---|---|---|---|
| 0–4 h | Historial por campaña | `advance` de `/score` + botones | Tabla de rindes oficiales |
| 4–8 h | Regla capacidad + `/capacity` + contraste | Pantalla Capacidad | Pitch nuevo |
| 8–12 h | Informe comité + firma devnet | Vista Informe + carteles | Fotos + video |
| 12–16 h | Pitch y ensayo | Pitch y ensayo | Pitch y ensayo |
| 16–20 h | Freeze | Freeze | Freeze |

Una sola persona mergea `main`. Freeze cuatro horas antes de presentar.

## Riesgos que hay que decir en voz alta

- **Rinde por NDVI es una regla lineal, no un modelo calibrado.** Sin la tabla de contraste con los rindes oficiales, el cupo pre-siembra es un número sin respaldo. Esa tabla sostiene la tesis.
- **El año malo se estima con una escena por campaña.** Si hubo nubes, hay un hueco. Se muestra, no se rellena.
- **ARGt / Twin:** confirmar con el track el estado regulatorio (suspensión de la CNV, marzo 2026) antes de decir "en producción". En la demo el pago es MOCK.
- **Si el historial se atrasa,** la demo sigue con condición sola. Capacidad suma la tesis nueva; condición ya está y no se rompe.
