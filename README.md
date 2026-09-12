# PreCrop · Evidencia del lote para decidir anticipos

Una cooperativa tiene que decidir cuánto anticipar a un productor **antes de la cosecha**, y hoy lo hace con poca evidencia. PreCrop reúne la que ya existe —satélite, clima, rindes oficiales del departamento y fotos a pie de lote— y la convierte en dos números defendibles ante un comité: **cuánto se puede anticipar** y **si el anticipo sigue habilitado**.

No es un score crediticio. Es una regla transparente sobre datos publicados, con la fuente de cada número al lado.

**Demo en vivo:** https://precrop-1n71ira4q-raulfunes-projects.vercel.app

---

## Las dos preguntas

**Capacidad — ¿cuánto?** El cupo se dimensiona contra el **peor año que el departamento realmente tuvo**, según la serie oficial del MAGyP, no contra una estimación satelital.

```
cupo = ha × rinde_peor_año_oficial × precio_usd_t × haircut
     = 100 × 1,769 × 364,8 × 0,7 = 45.173 USD
```

El NDVI histórico **habilita la regla, no multiplica el cupo**: si el lote sigue a su departamento (mediana de ratios dentro de 0,85–1,15), el rinde departamental es un proxy legítimo. Si no, el cupo se retiene con el motivo.

**Condición — ¿sigue?** Durante la campaña, un índice combina vigor satelital, lluvia y malezas detectadas en las fotos:

```
0,6 × ndvi_norm + 0,25 × clima − 0,15 × malezas
```

Umbrales 70 / 50 → verde, amarillo, rojo. **Capacidad pone el techo; condición libera una porción.** En rojo, los desembolsos nuevos se bloquean; lo ya desembolsado mantiene sus condiciones.

---

## Arquitectura

| Pieza | Qué hace | Dónde |
|---|---|---|
| **Front** (Next.js 16) | Las dos pantallas: coop aprueba el cupo, productor sube fotos y pide retiros | `src/` |
| **evidence-api** (Node, sin framework) | Sirve el pack, calcula el índice, arma lotes desde un polígono y ancla la evidencia en Solana devnet | `services/evidence-api/` |
| **Fórmula compartida** | El cálculo, el hash `precrop-canon-v1` y las reglas de cupo | `packages/score/` |
| **Visión** (Python) | Estimación de malezas sobre la foto con Gemini | `api/vision_weeds.py` |
| **Pack de datos** | NDVI, lluvia, puntos, economía y evidencia con hash | `data/` — ver `data/README.md` |

El navegador habla directo con el evidence-api; visión va proxeada por el front, para que su credencial nunca llegue al cliente.

---

## Correrlo

Requiere Node 20+ y Python 3.14 con Pillow (sólo para visión real).

```bash
npm install
cp .env.example .env        # los valores por defecto alcanzan para la demo
npm run dev                 # http://localhost:3000
```

En otra terminal, el backend de datos:

```bash
cd services/evidence-api && npm install && npm start   # http://localhost:8787
```

### Exponerlo a internet

`scripts/serve-ngrok.ps1` levanta los dos backends y abre los túneles:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\serve-ngrok.ps1
```

Imprime las URLs públicas y las variables listas para pegar. El túnel de visión va con basic-auth porque detrás está una credencial que factura. Las URLs de ngrok cambian en cada arranque: con un dominio reservado se pasa `-EvidenceDomain`.

---

## Configuración de datos

Tres valores salen de tabla en vez de calcularse, para que la demo no dependa de red ni de cuota. **Los tres están activos por defecto** y se apagan con su flag.

| Flag | Qué evita | Tabla |
|---|---|---|
| `LOTES_MOCK=0` | Georef + MAGyP + Planetary Computer al crear un lote (~5 s → 0,7 s) | `data/lotes-mock.json` |
| `CAPACITY_MOCK=0` | El cruce serie oficial × NDVI para el cupo | `data/capacity-mock.json` |
| `VISION_MOCK=0` | La llamada a Gemini por foto | `data/vision-mock.json` |

Las tablas están sembradas con las fórmulas reales, así que los números publicados no se contradicen: **100 ha sigue dando 45.173 USD**. Un lote creado en modo mock queda marcado con `source: "mock"` y hereda el departamento del lote demo. Detalle completo en [`services/evidence-api/README.md`](services/evidence-api/README.md#mocks-de-demo).

---

## El guion

1. **La coop aprueba el cupo.** 45.173 USD contra el peor año del departamento, con la serie a la vista.
2. **El productor sube tres fotos.** El GPS de cada una la asigna a su punto del protocolo; malezas ~6 % → índice 75,2 **verde**.
3. **Retiro habilitado:** 33.958 USD.
4. **Cambia la condición.** Escena `malo` y fotos con malezas ~70 % → índice 45,5 **rojo**.
5. **El segundo retiro se rechaza**, con el motivo y la evidencia que lo sostiene.

Cada paso deja un payload con su `sha256`, anclable en devnet con `POST /publish`.

---

## Verificar

```bash
npm run build                              # front
cd services/evidence-api && npm test       # la evidencia reproduce data/evidence/*.json, hash incluido
cd packages/score && npm test              # la fórmula
pytest tests -q                            # el pack, sin red
```

---

## Documentación

- [`docs/plan-de-accion.md`](docs/plan-de-accion.md) — estado y reparto
- [`data/README.md`](data/README.md) — contrato de datos y procedencia de cada número
- [`services/evidence-api/README.md`](services/evidence-api/README.md) — endpoints, reglas de cupo y mocks
- [`VISION-IA.md`](VISION-IA.md) — alcance y límites de la detección de malezas
