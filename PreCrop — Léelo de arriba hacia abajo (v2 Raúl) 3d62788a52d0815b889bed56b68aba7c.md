# PreCrop — Léelo de arriba hacia abajo (v2 Raúl)

> **UPDATE Builder 11-sep-2026:** sumar VISIÓN IA al MVP. Agrónomo toma fotos nadir (0,6–1,5 m, 10–15 h, EXIF GPS) en 3–5 pins del lote (centro + extremos; tolerancia 30 m) → API gpt-4o-mini / Gemini Flash → % malezas por punto → mediana → score. NDVI y lluvia se mantienen; pesos NDVI/lluvia/malezas: 0,6/0,25/0,15, normalizaciones pendientes. Partner solo lectura. Fallback slider/presets; sin fotos, no verde pleno para el segundo desembolso. Sin drone ni CNN propia. V2: puntos sesgados por NDVI bajo/alto.
>
> Base vigente para Claude: [PRECROP-LEER-ESTO.md](PRECROP-LEER-ESTO.md), [VISION-IA.md](VISION-IA.md) y [CLAUDE.md](CLAUDE.md). Presets P1–P5 bueno/malo: [data/photo-point-presets.json](data/photo-point-presets.json). Pack local; Notion sin bloques libres. El resto conserva la narrativa original salvo ajustes de alcance indicados.

# DECISIÓN CERRADA — 10/10 de empresa (HackCBA → startup)

**Producto en una frase:** semáforo verde / amarillo / rojo del lote para **quien ya presta** (coop, banco, insumos).

|  |  |
| --- | --- |
| **Qué vendemos** | Evidencia del lote vivo (SaaS: por lote o por campaña) |
| **Quién paga** | La coop / banco / fintech — **no** el productor |
| **Qué NO somos** | Banco · token regulado · “los únicos con satélite” |
| **Por qué el mercado existe** | BC Explorer + Tarken ya cobran monitoreo/crédito a grandes → demanda probada |
| **Nuestro wedge** | Coop chica/mediana que hoy decide con Excel, visita o PDF |
| **Innovación “wow”** | ~5/10 |
| **Innovación de negocio** | 9–10/10 (complementar, no inventar categoría) |

## Pitch jurado (90s)

Hoy se presta a mitad de campaña casi a ojo. Los grandes ya tienen satélite+crédito. Nosotros hacemos que una **coop chica** pueda congelar o soltar el próximo desembolso con un semáforo semanal — sin comprar Tarken.

## Demo hack (obligatoria)

aporte → primer desembolso → score baja (rojo) → **rechazo automático** del segundo → repago 10% fijo + devolver no usado.

Token = adorno de demo. Interés = **10% fijo** sobre capital desembolsado.

## Post-hack (startup de verdad)

La semana siguiente: **5 llamadas** a coops/acopios. Sin eso no hay empresa — solo premio.

---

HackCBA · tracks IA / Agro / Web3 · ~36h

Equipo: builders (poco agro, web3 medio nuevo)

> Empezá acá. Fácil → técnico. Framing actualizado tras feedback de Raúl.
> 

---

# PARTE 1 — La idea (5 minutos)

## ¿Qué es PreCrop?

Un **score de condición del cultivo** (0–100, más alto = mejor) armado con satélite + clima (+ malezas cuando haya evidencia).

Ese score alimenta un **cupo de anticipo simulado**: cuánto tendría sentido adelantar antes de cosechar.

**Producto real (startup):** vender el score / la evidencia a quien ya presta (banco, cooperativa, fintech).

**En el hackathon:** además mostramos un **mecanismo** con tokens de prueba = participación en un préstamo simulado de un lote/campaña.

**Frase jurado:** “No financiamos a ojo. El campo reporta solo.”

**Frase startup:** “Vendemos la verdad del lote; la plata la pone quien ya puede prestar.”

## Qué NO somos

- No somos un banco.
- No custodianos grano (eso es más Agrotoken).
- No vendemos hectáreas (eso es Landtoken).
- El token de la demo **no** es un producto regulado.

## Regla de oro

Una sola historia de demo:

**evaluar lote → aportar fondos de prueba → recibir participación → baja la condición → alerta / sin más desembolso → repago mock.**

Todo cartel **MOCK / testnet**.

---

# PARTE 2 — Agro en criollo

- **Lote** = pedazo de campo (polígono en el mapa).
- **Pre-cosecha** = antes de sacar el grano; el productor ya gastó y aún no cobró.
- **Anticipo** = plata que presta alguien contra la campaña futura.
- **Condición del cultivo** = qué tan bien se ve el lote (vigor/NDVI, clima, malezas si hay dato).
- **NDVI** = índice de “qué tan verde/vigoroso”; en el MVP puede venir de Sentinel ya bajado.
- **Malezas** = estimación IA sobre fotos de 3–5 puntos y mediana; fallback manual/presets identificado. Sin drone en 36h; no es medición exhaustiva del lote.

## Competidores (actualizado — sin sobreclaim)

**No digan:** “esto no existe como producto cerrado en Argentina.” No está demostrado.

| Referente | Qué hace (verificado a nivel propuesta/público) |
| --- | --- |
| **SatSure** (afuera) | Evaluación crediticia, monitoreo de préstamos y apoyo a cobranzas con satélite. Es más que “un número”. |
| **BC Explorer — Crédito Inteligente** (AR) | Integra historial financiero, productividad, datos del productor y monitoreo satelital para evaluar crédito. |
| **Prenda de Cultivo — BC Explorer** (AR) | Financiación usando siembras como garantía; seguimiento opcional del cultivo. Bolsa informó primeras operaciones ~2024; digitalización con tech blockchain de Agrotoken. |
| **Tokena** (Córdoba) | Publicita inversión en campañas agrícolas + blockchain + seguimiento + liquidación al fin de campaña. Propuesta pública; operaciones reales no verificadas aquí. |
| **Agrotoken** | No solo grano en acopio: su stack también aparece en digitalización de prenda de cultivo. |
| **TerraCredit / Verdian** | Páginas de evaluación agro con satélite; esta revisión no les atribuye la misma evidencia de adopción bancaria que a SatSure. |

**Qué sigue pendiente de validar:** que alguien ya tenga exactamente *cupo dinámico + participaciones tokenizadas + reparto de cobros* como PreCrop lo demea. La originalidad exacta no está probada.

**Implicación para el pitch:** el token solo no es ventaja. Hay que decir **a quién ayudan mejor** y **qué decisión concreta** puede tomar un financiador/cooperativa gracias a PreCrop (score claro → cupo / alerta / sí-no de desembolso).

**Ustedes en 36h (sin pelear originalidad mágica):**

1. Núcleo: 1 lote, evidencia, score explicado, cupo simulado.
2. Aplicación financiera demo: aporte → participación → alerta → repago (todo MOCK).
3. Diferenciación: resolver una necesidad concreta de un financiador local (información comprensible + acción útil).

---

# PARTE 3 — Qué representa el token (definición Raúl)

Cada token de la demo = **participación en un préstamo simulado** de una campaña de un lote.

Debe quedar explícito (en UI o slide):

| Campo | Ejemplo demo |
| --- | --- |
| Operación | Préstamo simulado USD 50.000 |
| Lote / campaña | Lote demo Córdoba · campaña soja |
| Emisión | 1.000 tokens |
| Qué compra quien aporta | 1/1.000 de los cobros de ese préstamo |
| Deudor (simulado) | Productor demo |
| Vencimiento | Fin de campaña (fecha inventada clara) |
| Repago | Productor devuelve fondos de prueba → se reparte proporcional |
| Incumplimiento | Recuperación parcial simulada; el token **no garantiza** cobrar todo |

### Verdades incómodas (decirlas)

1. **mint() no financia al productor.** Solo crea unidades. La plata llega cuando alguien **aporta** a cambio de tokens.
2. **setScore no es el precio de mercado del token.** Actualiza condición / dispara reglas (alerta, tope de desembolso). El “precio” de compraventa es otra cosa: no lo inventen.
3. **La chain registra lo que informa el oráculo; no verifica el campo.** En demo el oráculo es el equipo. Guardar fecha, versión y hash del informe ayuda a la narrativa.

### Cupo vs plata ya prestada

Fórmula de **cupo de anticipo simulado** (no “valuación/precio del token”):

```
cupo = cosecha_estimada_base × (score/100) × 0.7
```

Ejemplo: base 100.000 → score 82 ≈ cupo 57.400 · score 48 ≈ cupo 33.600.

Si ya se desembolsaron 50.000 y el score baja: **alerta + no más desembolso**.

No se borra la deuda ni se queman tokens mágicamente.

---

# PARTE 4 — Pitch (~75s)

Un productor ya gastó en la campaña y necesita anticipo antes de cosechar.

Hoy se firma casi a ojo.

Afuera hay scores satelitales para bancos. En el anticipo argentino falta una capa de verdad del lote vivo.

PreCrop mira la condición del cultivo (satélite + clima) y calcula un cupo de anticipo simulado.

Más score = mejor condición.

En la demo: alguien aporta fondos de prueba y recibe tokens = participación en ese préstamo.

Si el score baja → alerta y se cortan nuevos desembolsos. Después, repago simulado.

No somos un banco. Vendemos evidencia. El token muestra el mecanismo.

PreCrop: que el campo hable solo.

---

# PARTE 5 — Recorrido de demo (voz alta)

1. Evaluar lote → score de condición + cupo simulado
2. Aportar (fondos de prueba) → recibir tokens
3. Empeora la condición (82 → 48) → alerta / sin más desembolso
4. Repago mock → distribución proporcional
5. Cartel MOCK / testnet en todo momento

Si el jurado no es web3: cortar en pasos 1–3.

### Datos satélite

- Preferir **dos fechas dentro de la misma campaña** o escenarios **simulados** etiquetados.
- **No** usar feb 2025 (pico) vs ago 2024 (barbecho) como “se dañó la cosecha”.
- Archivos: `lote-sentinel-presets.json` + `SOURCES.md` (adjuntos / pack local). NDVI y lluvia medidos; malezas estimadas.

---

# PARTE 6 — Scope MVP

## IN

- Mapa 1 lote
- 3–5 pins centro/extremos, fotos con protocolo y GPS (tolerancia 30 m), API de visión y mediana de malezas
- Score de condición + cupo simulado
- NDVI + lluvia + malezas con pesos 0,6/0,25/0,15; sin fotos no hay verde pleno para el segundo desembolso
- Agrónomo carga/revisa; partner solo lectura; fallback slider/presets explícito
- Flujo aporte → tokens → alerta → repago (aunque sea mock)
- Oráculo demo (wallet del equipo) + registro fecha / hash si pueden
- Carteles MOCK / testnet

## OUT

CNN propia / visión calibrada exhaustiva · drone · grilla completa de muestreo · selección de puntos por NDVI (v2) · Sentinel live el día D · custody/CNV · precio de mercado del token · multi-lote

## Stack sugerido

Next.js + Leaflet · fórmula en cliente/API · Hardhat/Sepolia o mock · roles separados (emitir vs setScore) cuando toquen contrato

---

# PARTE 7 — Glosario corto

| Término | Significado |
| --- | --- |
| Score de condición | 0–100; más alto = mejor cultivo |
| Cupo de anticipo simulado | Tope calculado con la fórmula; no es precio de token |
| Token (demo) | Participación 1/N en cobros del préstamo simulado |
| Aporte | Fondos de prueba a cambio de tokens |
| Oráculo | Quién escribe el score (en demo: el equipo) |
| Sepolia / mock | Redes o modos de juguete; no plata real |
| NDVI | Vigor desde satélite |

---

# PARTE 8 — Cómo no pisarse

```
apps/web          → Front
packages/contracts → Chain
data/             → Data
docs/             → Pitch
```

Orden actualizado: Data JSON + presets de puntos → mapa/pins + score/cupo + fallback y roles → fotos/GPS + API visión + mediana → aporte/tokens/repago mock → Pitch graba. Chain opcional después del flujo completo.

1 persona mergea `main`.

---

# PARTE 9 — Timeline 36h

| Bloque | Qué |
| --- | --- |
| 0–6h | Cerrar normalizaciones; mapa/pins + score/cupo + fallback + copy MOCK |
| 6–16h | Roles; fotos/GPS → visión → mediana → publicación |
| 16–24h | Aporte → desembolso → alerta/rechazo → repago mock; oráculo/hash si da |
| 24–32h | Pitch + slides + video |
| 32–36h | Freeze |

Prioridad: Mock siempre listo → Hardhat → Sepolia solo con faucet.

---

# PARTE 10 — Objeciones

| Pregunta | Respuesta |
| --- | --- |
| ¿Agrotoken / Landtoken? | Grano custodiado / tierra. Nosotros: condición pre-cosecha + cupo. |
| ¿Es legal el token? | Simulación de mecanismo en testnet. Producto: score. |
| ¿El score es probabilidad de cobro? | No. Es condición del cultivo → cupo simulado. |
| ¿setScore cambia el precio? | No. Dispara reglas (alerta / tope). |
| ¿Quién presta de verdad? | Partner (banco/coop). Nosotros la evidencia. |

---

# PARTE 11 — Checklist Demo Day

- [ ]  Cartel MOCK visible
- [ ]  Score + cupo se entienden en 10s
- [ ]  Fotos de puntos → % malezas → mediana → score; GPS/protocolo visibles
- [ ]  Partner solo lectura y fallback etiquetado; sin fotos no hay verde pleno para segundo desembolso
- [ ]  Aporte → token explicado en una frase
- [ ]  Baja de score → alerta (no magia de precio)
- [ ]  Video offline
- [ ]  Pitch 75s cronometrado

**Cierre:** “PreCrop hace que el campo hable solo — y que el anticipo deje de ser a ojo.”

## Archivos

[lote-sentinel-presets.json](lote-sentinel-presets.json)

[SOURCES.md](SOURCES.md)

## Política financiera de la demo (cerrada)

**Interés:** 10% simple por toda la campaña demo, sobre el capital efectivamente desembolsado (no sobre lo aportado y no usado).

| Condición | Interés | Nuevos desembolsos |
| --- | --- | --- |
| Verde: score ≥ 70 | 10% fijo | Permitidos dentro del cupo y fondos disponibles |
| Amarillo: 50 ≤ score < 70 | 10% fijo | Con un límite adicional definido al inicio |
| Rojo: score < 50 | 10% fijo | Bloqueados |
| Sin datos vigentes | 10% fijo | Pendientes de actualización |

**UPDATE 11-sep:** sin fotos no hay verde pleno para el segundo desembolso aunque el score sea ≥ 70. Presets no acreditan fotos reales. Propuesta operativa del diseño: dejar segundo y posteriores pendientes hasta completar evidencia; confirmar si habrá una vía amarilla limitada. Estas restricciones se suman a cupo, saldo y vigencia.

Rojo = cero desembolsos nuevos, aunque el cupo teórico aún deje margen.

### Ejemplo numérico

- Ana + Pedro aportan 50.000
- Juan recibe 30.000; quedan 20.000 sin desembolsar
- Score cae a 48 → un desembolso adicional se rechaza solo
- Si Juan paga completo → devuelve 33.000 (30k + 10%)
- 
    - los 20.000 nunca prestados → 53.000 para repartir (sin comisiones en el ejemplo)

### Arquitectura

Un servicio publica el score vía oráculo. El contrato/mock aplica reglas al recibir una tx. No consulta el satélite solo.

IA = estimar condición. Autorización de desembolso = reglas explícitas.

### Demo concentrada (hack)

aporte → primer desembolso → update de condición → rechazo automático del segundo → repago + devolver saldo no usado

(Opcional después: agente/reserva en pantalla partida.)
