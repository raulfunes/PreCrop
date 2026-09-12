# PreCrop — instrucciones para agentes

Hackathon HackCBA, equipo de 3. Producto: evidencia del lote para que una cooperativa decida anticipos. Leer primero `docs/plan-de-accion.md` (estado real y reparto) y `data/README.md` (contrato de datos).

## Dónde está cada cosa

| Qué | Dónde |
|---|---|
| Fuente de verdad de los datos del lote (NDVI, lluvia, puntos, economía, evidencia con hash) | `data/` — leer `data/README.md` |
| Fórmula compartida, hash `precrop-canon-v1`, regla `cupo-v1` | `packages/score` (JS, `npm test`) |
| Backend: `/score`, `/publish` (Solana devnet), `/disburse` (mock Twin) | `services/evidence-api` (`npm start`, `npm test`) |
| Front MVP (Next.js) | `src/` en la raíz (`npm run dev`) |
| Reproducción del pack desde satélite y clima | `scripts/build_pack.py` (`--check`) |
| Validación del pack sin red | `tests/` (`pytest tests -q`) |
| Visión (experimental, no bloquea la demo) | `api/`, `data/vision-growingsoy/`, `VISION-IA.md` |
| Pitch, diagrama, branding, plan | `docs/` |

## Reglas

- **Números:** los del pack en `data/` son los únicos válidos. NDVI publicado = mediana con offset corregido (0.782 / 0.763). Cualquier 0.489 es un archivo viejo.
- **Vocabulario:** "índice de condición del cultivo" y "límite de anticipo sugerido". Nunca "score crediticio" ni "riesgo". "IA" solo para la detección de malezas.
- **Fórmula:** `0.6 * ndvi_norm + 0.25 * climate - 0.15 * weeds_pct`, anclas 0.20 / 0.85, tabla de lluvia con `<` estricto, umbrales 70 / 50. Vive en `packages/score` y en `src/lib/scoreUtils.ts`; si cambia, cambia en los dos y en `data/`.
- **Commits:** conventional commits, sin `Co-Authored-By` ni atribución de IA. Archivos con LF (`.gitattributes`).
- **Cartel MOCK / devnet** en todo lo financiero y on-chain.
- Una sola persona mergea `main`.
