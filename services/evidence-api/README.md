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
| POST | `/score` | `{ "scenario": "malo", "weeds_pct": 61 }` → score, banda, `score_bp`, cupo `cupo-v2` contra el techo de capacidad, payload de evidencia y `content_sha256` |
| POST | `/publish` | Lo mismo, y además manda una transacción Memo firmada por la wallet publicadora. Devuelve `signature` y `explorer_url` |
| POST | `/disburse` | MOCK del pago por Twin en ARGt: valida rojo y límite, devuelve un recibo simulado |
| GET | `/capacity` | Historial por campaña, peor campaña, estabilidad y cupo pre-siembra (regla `capacidad-v1`); cruza `rindes-oficiales.json` si existe |
| GET | `/report/<escenario>` | Informe de una página en markdown para el comité (`?signature=&explorer_url=&weeds_pct=` opcionales) |

`weeds_pct` es opcional: si Visión lo manda, se usa y queda etiquetado `estimated`; si no, se usa el valor simulado del pack.

### El cupo de `/score` cuelga del techo de `/capacity`

Las dos reglas estaban dando respuestas distintas para el mismo lote: `cupo-v1` calculaba sobre el rinde de referencia a condición plena (3,2 t/ha → 116.736 USD de base) y autorizaba ~54–61k USD, mientras capacidad leía el peor año real del departamento y ponía el piso en 29.877 USD. Un comité encuentra esa contradicción enseguida.

`cupo-v2` conserva **toda** la fórmula de condición —malezas de Visión incluidas, con su peso −0,15— y solo cambia la base:

```
piso   = ha × rinde_peor_año_oficial × precio   = 100 × 1,17 × 364,8 = 42.682 USD
techo  = piso × haircut                         = 29.877 USD   ← lo que publica /capacity
cupo   = techo × condición/100
```

**Capacidad pone el techo; condición libera una porción.** Por eso el cupo nunca puede superar lo que el lote soportó en su peor campaña registrada:

| malezas (Visión) | score | cupo `cupo-v2` | % del techo | `cupo-v1` daba |
|---|---|---|---|---|
| 12 % | 74,4 verde | 22.235 USD | 74,4 % | 60.819 USD |
| 65 % | 66,5 amarillo | 19.860 USD | 66,5 % | 54.282 USD |

El bloque `superseded_advance` de la respuesta trae el número de `cupo-v1` para que el cambio sea auditable.

**El gate se propaga.** Si capacidad no pudo establecer un piso (el lote no sigue a su departamento, o la serie es muy corta), `advance_limit.usd` vuelve `null` y `new_disbursements` es `blocked_no_capacity`. Ojo con la diferencia, que Front tiene que respetar:

- `usd: 0` con `new_disbursements: "blocked"` → **cero medido**: el lote está en rojo, no sale plata.
- `usd: null` con `blocked_no_capacity` → **no sabemos el piso**. No es cero y no debe mostrarse como cero.

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
