# PreCrop — pitch de 90 segundos

> Cronometrado a ~220 palabras. Las marcas de tiempo son para ensayar. Todo cartel dice MOCK / devnet.

**[0:00] El problema**
Un productor ya gastó toda la campaña en semilla, agroquímicos y labores. Todavía no cosechó y necesita un anticipo. Hoy la cooperativa que se lo presta decide casi a ojo: una visita, un Excel, un PDF. Los grandes ya tienen satélite y crédito. La coop chica, no.

**[0:15] Qué es PreCrop**
PreCrop es el semáforo del lote. Mira el cultivo con satélite, cruza el clima y suma fotos de puntos del lote, estima cuánto va a producir y sugiere hasta cuánto anticipar. Verde, la coop suelta el próximo desembolso. Rojo, lo frena. Semanal, sin ir al campo. No es un score de crédito: son reglas visibles que un consejo puede explicarle a sus socios.

**[0:35] La prueba, con un lote real**
Esto es un lote de soja en Río Segundo, Córdoba, campaña pasada. Dos de febrero: NDVI alto, llovió 47 milímetros, condición 74, verde. Límite sugerido: 52 por ciento del valor esperado. La coop aprueba y el anticipo sale en ARGt a la billetera del productor, en segundos, un sábado a la noche si hace falta. Cinco días después: seca de dos semanas, cero lluvia, malezas creciendo. Condición 48, rojo. El segundo desembolso se frena solo. En la cosecha entrega las toneladas y el anticipo se descuenta de la liquidación. Nadie tuvo que viajar.

**[0:55] Por qué se puede confiar**
Cada número sale de un informe con los datos crudos: la escena de satélite, la lluvia, las fotos, los pesos de la regla y su versión. Ese informe se hashea y se firma en Solana. La coop abre el explorador y verifica que nadie tocó el número después. No usamos la cadena para prestar plata. La usamos como escribano de la evidencia.

**[1:10] El negocio**
No somos un banco. Vendemos la verdad del lote a quien ya presta: cooperativas, acopios, fintech. Hoy la coop adelanta un porcentaje plano a todos; nosotros, uno por lote. Y cada anticipo que se origina deja un dato nuevo: cuánto se estimó, cuánto se entregó. Ese dataset hoy no existe en el país.

**[1:20] Cierre**
Las malezas hoy son estimadas con IA sobre fotos, y lo decimos. Lo demás está medido, calculado con reglas a la vista, y firmado. PreCrop: que el campo hable solo, y que el anticipo deje de ser a ojo.

---

## Notas para el equipo (no van en el pitch)

- **Vocabulario:** "índice de condición del cultivo" y "límite de anticipo sugerido". Nunca "score crediticio", "riesgo" ni "IA" colgada del índice. La IA es la visión de malezas.
- **Twin / ARGt:** es el riel de pago del paso 3 (la coop paga el anticipo en ARGt, el productor lo usa con Belo). ARGt corre en redes EVM; el ancla de evidencia está en Solana devnet. Son dos rieles distintos y se cuentan así: la evidencia se certifica en uno, la plata viaja por el otro. Twin expone API para partners, no testnet pública, así que en la demo la transferencia es MOCK (`POST /disburse`).
- **Ojo regulatorio:** en marzo de 2026 la CNV suspendió operaciones de ARGt en Belo por una investigación sobre rendimientos ofrecidos. Confirmar con la gente del track el estado actual antes de afirmar "en producción".
- **Si preguntan "¿validado contra qué?":** no es un modelo, es una regla versionada (`cupo-v1`) que estima producción. La relación NDVI–rinde está documentada en agronomía hace décadas. El backtest con rindes reales es el siguiente paso, no el de hoy.

## Si el jurado no es web3

Cortá después de "Nadie tuvo que viajar" y saltá al negocio. Quedan 70 segundos y la historia cierra igual.

## Objeciones cortas

| Pregunta | Respuesta |
|---|---|
| ¿Esto ya existe? | Afuera sí, para bancos grandes. Acá la coop chica decide con Excel. Nosotros complementamos, no inventamos la categoría. |
| ¿El score es probabilidad de cobro? | No. Es condición del cultivo. La regla de desembolso la pone quien presta. |
| ¿Es legal el token? | En la demo es simulación en testnet. El producto es el score y la evidencia. |
| ¿Y las malezas? | Hoy estimadas con fotos, sin drone. Se dice en voz alta. |
| ¿Y si el lote tiene riego? | Más del 95 % de la soja cordobesa es de secano (Córdoba riega ~127.000 ha con pivote sobre más de 7 millones sembradas) y el lote demo también. Hoy el clima se mide por lluvia, así que un lote regado sin malezas cae a amarillo, no a rojo: se revisa, no se bloquea. El riego el satélite lo ve en el vigor; la versión siguiente mide el agua en la planta (índice de humedad NDMI, mismas escenas Sentinel-2) en lugar de la lluvia. |
