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
| GET | `/capacity` | Cupo **pre-siembra** contra el peor año publicado del departamento. Ver [abajo](#get-capacity) |
| POST | `/score` | `{ "scenario": "malo", "weeds_pct": 61 }` → score, banda, `score_bp`, payload de evidencia y `content_sha256` |
| POST | `/publish` | Lo mismo, y además manda una transacción Memo firmada por la wallet publicadora. Devuelve `signature` y `explorer_url` |

`weeds_pct` es opcional: si Visión lo manda, se usa y queda etiquetado `estimated`; si no, se usa el valor simulado del pack.

## GET /capacity

Responde **cuánto se puede anticipar antes de sembrar**. Es la otra mitad de la tesis: capacidad define *cuánto*, condición (`/score`) define *si sigue*. No recibe body ni parámetros.

El cupo se dimensiona contra **el peor año que el departamento realmente tuvo**, según la serie oficial del MAGyP — no contra una estimación satelital. Regla `capacidad-v2`:

```
cupo_usd = ha × rinde_peor_año_oficial_t_ha × precio_usd_t × haircut
         = 100 × 1.17 × 364.8 × 0.7 = 29 877 USD
```

### Qué hace el NDVI acá

**Habilita la regla, no multiplica el cupo.** Por cada campaña se calcula el índice NDVI del lote sobre el índice de rinde oficial; la **mediana** de esos ratios dice si el lote sigue a su departamento. Si cae dentro de la banda 0.85–1.15, el rinde departamental es un proxy legítimo para este lote y el cupo se publica. Si no, se retiene con el motivo.

Se usa mediana y no media a propósito: en 2022/23 el ratio da **2.36**, porque el NDVI se mantuvo alto mientras el rinde se desplomaba por la sequía. Ese outlier queda visible en `series` pero no mueve la mediana. Su dispersión (CV 0.44) es la razón por la que este ratio nunca escala el cupo — corregiría un 3.7 % con un 44 % de ruido.

### Respuesta

```jsonc
{
  "pack_version": "1.0.0",
  "lote_id": "demo-rio-segundo-01",
  "rule_version": "capacidad-v2",
  "capacity": {
    "series": [                          // una fila por campaña 2018/19–2024/25
      {
        "campana": "2022/23",
        "official_dpto_kg_ha": 1170,
        "ndvi_peak": 0.7741,
        "ndvi_index": 0.9507,            // ndvi_peak / mediana de la serie
        "official_index": 0.4026,        // rinde / mediana de la serie
        "lote_vs_district": 2.3614,       // el outlier de la sequía, visible
        "status": "paired"               // "unpaired" si falta NDVI o rinde
      }
    ],
    "worst_year": {
      "campana": "2022/23",
      "official_dpto_kg_ha": 1170,
      "yield_t_ha": 1.17,
      "source": "measured"               // dato publicado, no estimado
    },
    "district_volatility": { "cv": 0.2912 },      // cuánto oscila el departamento
    "representativeness": {
      "representative": true,
      "lote_vs_district_median": 1.0368,
      "lote_vs_district_cv": 0.4393,
      "band": { "min": 0.85, "max": 1.15 },
      "paired_campaigns": 7,
      "reasons": []                      // poblado solo cuando bloquea
    },
    "pre_sowing_limit": {
      "usd": 29877,                      // null si no es representativo
      "ars": 45861195,
      "usd_if_representative": 29877,    // siempre presente, para auditar la brecha
      "status": "allowed",               // o "blocked_unrepresentative"
      "formula": "ha * worst_official_yield_t_ha * price_usd_t * haircut"
    }
  },
  "rejected_alternative": { /* ver abajo */ },
  "sources": { "history": { "refs": [...] }, "official": { "refs": [...], "license": "CC-BY 4.0" } },
  "disclaimer": "MOCK/demo. ..."
}
```

### Contrato para Front

- **Mostrar `pre_sowing_limit.usd` solo si no es `null`.** `null` significa *sin respaldo*, que no es lo mismo que cero: el lote no soporta un cupo calculable con esta evidencia, no soporta un cupo de nada. Cuando es `null`, mostrar `representativeness.reasons`.
- `usd_if_representative` está siempre, incluso bloqueado. Es para auditar la brecha entre lo que la regla habría dicho y lo que está respaldado. **No mostrarlo como si fuera el cupo.**
- `worst_year.source` es `"measured"`: se puede citar el número al comité y linkear la fuente desde `sources.official.refs`.
- Todos los bloques traen su `formula` / `basis` en prosa. Están para mostrarse al lado del número, que es el argumento de transparencia.

### `rejected_alternative`

Lleva la regla `capacidad-v1`, que estimaba toneladas por campaña desde el NDVI pico. **No validó** y por eso no es la regla activa:

| | |
|---|---|
| Peor año estimado | 2023/24 |
| Peor año oficial | **2022/23** |
| r² contra la serie oficial | 0.43 |
| Cupo que habría publicado | 70 735 USD |

El NDVI pico varía 17 % entre campañas mientras el rinde real varía 214 %, y en 2022/23 la canopia siguió verde en febrero aunque el cultivo no llenó grano. Publicar esos 70 735 USD habría dimensionado el anticipo **2,4× por encima** de lo que soporta el peor año real.

Se sirve —en vez de borrarse— porque un comité que pregunte *"¿por qué no leen el rinde del satélite?"* merece la respuesta medida.

### Decisiones de política, no agronómicas

`haircut = 0.7` (`data/lote-economics.json`) y la banda de representatividad `0.85–1.15` son política del equipo, no calibración validada con un agrónomo. Cambiarlas cambia el cupo.

### Datos que consume

| Archivo | Lo genera | Reproducir |
|---|---|---|
| `data/lote-history.json` | `scripts/build_history.py` | `python scripts/build_history.py --check` |
| `data/rindes-oficiales.json` | `scripts/build_rindes_oficiales.py` | `python scripts/build_rindes_oficiales.py --check` |

Ambos exponen también por `GET /pack/<archivo>`. Los dos scripts devuelven `0` si reproduce, `1` si hay diferencia y `2` si el upstream no respondió. Los dos JSON tienen que llevar el mismo `pack_version` que el resto del pack o el servicio no arranca.

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
