# evidence-api

Backend chico del track de datos. Sirve el pack, calcula el score con la fórmula compartida (`@precrop/score`) y hace de **oráculo**: firma y ancla el score en Solana devnet. Todo con cartel MOCK.

```bash
cd services/evidence-api
npm install
npm run keygen      # una vez: crea .keys/publisher.json y pide 1 SOL de devnet
npm start           # http://localhost:8787
```

| Método | Ruta | Qué hace |
|---|---|---|
| GET | `/health` | Versión del pack, pubkey del publicador |
| GET | `/pack` · `/pack/<archivo>` | Los JSON de `data/` (lista blanca) |
| POST | `/score` | `{ "scenario": "malo", "weeds_pct": 61 }` → score, banda, `score_bp`, payload de evidencia y `content_sha256` |
| POST | `/publish` | Lo mismo, y además manda una transacción Memo firmada por la wallet publicadora. Devuelve `signature` y `explorer_url` |
| POST | `/disburse` | MOCK del pago por Twin en ARGt: valida rojo y límite, devuelve un recibo simulado |
| GET | `/capacity` | Historial por campaña, peor campaña, estabilidad y cupo pre-siembra (regla `capacidad-v1`); cruza `rindes-oficiales.json` si existe |
| GET | `/report/<escenario>` | Informe de una página en markdown para el comité (`?signature=&explorer_url=&weeds_pct=` opcionales) |

`weeds_pct` es opcional: si Visión lo manda, se usa y queda etiquetado `estimated`; si no, se usa el valor simulado del pack.

## Qué queda on-chain

Un memo con este texto, firmado por la wallet publicadora:

```
precrop-canon-v1|demo-rio-segundo-01|malo|4847|2025-02-07T14:08:11Z|<sha256 del payload>
```

Verificar: (1) el firmante de la transacción es la pubkey publicadora que muestra `/health`; (2) el sha256 del memo coincide con el `content_sha256` del informe de evidencia (recalculable con `@precrop/score`).

Es el programa Memo de Solana, sin programa propio. Si sobra tiempo se reemplaza por un programa Anchor con un PDA por lote; el texto anclado y la verificación no cambian.

## Test

```bash
npm test    # la evidencia que arma el servicio es idéntica a data/evidence/*.json, hash incluido
```
