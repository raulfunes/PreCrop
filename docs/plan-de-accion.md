# Plan de acción — PreCrop, equipo de 3

**Tesis:** PreCrop le vende a cooperativas y acopios chicos la evidencia que hoy no tienen para prestar. Con el historial satelital del lote y el mapa oficial de rindes de Córdoba define el **cupo del anticipo antes de sembrar**, contra el peor año que ese departamento ya tuvo. Durante la campaña, un **semáforo de condición** gobierna si el próximo desembolso se libera o se corta. Capacidad define cuánto; condición define si seguís. No prestamos: vendemos la decisión ya tomada, en un formato que un comité de crédito puede firmar.

## Qué hay en `main` (revisado 12-sep, tarde)

| Pieza | Dónde | Estado |
|---|---|---|
| Pack de datos v1: NDVI medido (2 fechas 2025), lluvia, puntos, economía del lote, evidencia con hash | `data/` | ✅ |
| Historial de 7 campañas (pico y mínimo de NDVI, lluvia dic–feb) | `data/lote-history.json`, `scripts/build_history.py` | ✅ |
| Rindes oficiales del dpto. Río Segundo (MAGyP) | `data/rindes-oficiales.json`, `scripts/build_rindes_oficiales.py` | ✅ |
| Fórmula compartida + hash + `capacidad-v2` + `cupo-v2` (v1 servida como alternativa rechazada) | `packages/score` | ✅ 25 tests |
| Backend: `/score`, `/capacity`, `/report/<escenario>`, `/disburse` (mock), `/publish` (parado) | `services/evidence-api` | ✅ 4 tests |
| Validación del pack sin red | `tests/` | ✅ 92 tests |
| Front MVP en Next: mapa, semáforo, evidencia, desembolso simulado, misma fórmula | `src/` (raíz) | ✅, con ajustes pendientes |
| Visión: experimento de segmentación con Gemini | `api/`, `data/vision-growingsoy/` | 🧪 no bloquea la demo |
| Pitch 60 s, diagrama, branding, README del pack | `docs/`, `data/README.md` | ✅ actualizados a v2 |
| Tira de imágenes NDVI (7 veranos, pico y mínimo) | `data/history-images/` | ✅ generada, local |
| Web3 (firma en devnet) y Twin (pago en ARGt) | `services/evidence-api` | ⏸️ afuera de la demo |

**Fuente de verdad de los datos: `data/`.** Los números vigentes son los de `capacidad-v2` y `cupo-v2`: cupo pre-siembra **29.877 USD**; en campaña verde **22.235**, amarillo 20.308, rojo 0. Cualquier 70.700, 60.800 o 52 % es un documento viejo.

## Lo que falta

### Front (lo único que bloquea la demo)

1. **Tomar los números del backend.** El cupo de Front sale hoy de una base fija de 100.000 USD (52.100). El backend da 22.235 en verde. Leer `advance.advance_limit.usd` de `POST /score` y `capacity.pre_sowing_limit.usd` de `GET /capacity`. Regla: `usd: null` es "sin respaldo", no cero; se muestra `representativeness.reasons`.
2. **Pantalla Capacidad:** la tira de siete veranos (o la tabla), el peor año oficial resaltado, el cupo pre-siembra en grande con la frase "contra el peor año que este departamento ya tuvo".
3. **Factores y versión de regla** al lado del semáforo (`factors[]`, `rule_version`).
4. **Vista Informe:** renderiza `GET /report/<escenario>` con botón de imprimir. Cierra el pitch.

### Tercera persona

1. Ensayar el pitch de 60 s (`docs/pitch.md`) con cronómetro, tres veces.
2. Las cinco fotos a `data/presets/fotos/` con los nombres del pack.

### Franco

1. Subir la tira de imágenes a `main` si el equipo la quiere en pantalla.
2. Regenerar el preview local con los números v2 si hace falta para ensayar.
3. Freeze de `main` cuatro horas antes de presentar. Una sola persona mergea.

## Riesgos que se dicen en voz alta

- **La banda de representatividad (0,85–1,15) y el haircut (0,7) son política del equipo,** no calibración con un agrónomo. Cambiarlos cambia el cupo.
- **Un solo lote.** Es real y con siete años de historia; vale más que diez inventados. Multi-lote queda para después.
- **Malezas estimadas.** Sin drone, con fotos genéricas. La IA es experimental y se dice.
- **Si Front no llega a la pantalla Capacidad,** el pitch funciona igual con condición sola y el cupo pre-siembra dicho en voz alta desde el informe.
