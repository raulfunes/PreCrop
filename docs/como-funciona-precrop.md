# Cómo funciona PreCrop

Un solo lote de soja en Río Segundo, Córdoba. Tres fuentes de datos, un índice de condición del cultivo, un límite de anticipo sugerido, y una firma en la cadena que certifica de dónde salió. La plata viaja por Twin en ARGt.

```mermaid
flowchart LR
    SAT["🛰️ Satélite Sentinel-2<br/>NDVI: qué tan verde está el lote"]
    CLI["🌧️ Clima Open-Meteo<br/>lluvia de los últimos 7 días"]
    FOT["📷 Fotos en 5 puntos del lote"]

    PACK[("📦 Pack de datos<br/>JSON en el repo<br/>NDVI · lluvia · puntos · economía del lote")]
    VIS["🤖 Visión (IA)<br/>estima % de malezas"]
    API["⚙️ Backend evidence-api<br/>índice de condición 0-100<br/>producción estimada<br/>límite de anticipo sugerido"]
    WEB["🖥️ Pantalla (Front)<br/>mapa + semáforo + límite"]
    SOL["🔗 Solana devnet (MOCK)<br/>firma score + fecha + hash"]
    COOP["🏦 La coop<br/>un humano del consejo aprueba"]
    TWIN["💸 Twin · ARGt<br/>la coop paga el anticipo<br/>a la billetera del productor"]
    PROD["👨‍🌾 Productor · Belo<br/>paga el agroquímico con QR o tarjeta"]

    SAT --> PACK
    CLI --> PACK
    FOT --> VIS
    PACK -->|"NDVI y lluvia"| API
    VIS -->|"% malezas"| API
    API -->|"semáforo + límite + factores"| WEB
    API -->|"publica y firma la evidencia"| SOL
    WEB --> COOP
    SOL -.->|"la coop verifica la firma"| COOP
    COOP -->|"aprueba: transfiere en ARGt, en segundos"| TWIN
    TWIN --> PROD
    PROD -->|"cosecha: entrega las toneladas,<br/>se descuenta el anticipo en la liquidación"| COOP
```

## Qué es cada cosa, en una línea

| Pieza | Qué hace | Quién la hace |
|---|---|---|
| Pack de datos | La verdad del lote: NDVI medido, lluvia medida, puntos, economía de referencia, informes con hash. No llama a ningún satélite el día de la demo. | Datos |
| Visión | Mira las fotos de los 5 puntos y dice cuánta maleza hay. Hoy es estimado, no hay drone. Acá está la IA. | IA |
| Backend | Junta NDVI + lluvia + malezas en un índice de condición 0 a 100, estima toneladas y sugiere hasta cuánto anticipar. Reglas visibles y versionadas, no un modelo de crédito. | Datos |
| Pantalla | Mapa del lote, toggle de escenarios, fotos, semáforo, límite sugerido y los factores que lo movieron. | Front |
| Solana | El escribano: deja firmado que ese índice existía con esa evidencia en esa fecha. No presta plata, no verifica el campo. | Datos |
| La coop | Un humano mira el límite y los factores, y aprueba o no. | El cliente |
| Twin | El riel de pago: la coop transfiere el anticipo en ARGt (stablecoin en pesos) a la billetera del productor, cualquier día, en segundos. | Track Twin |
| Productor | Usa la plata con Belo sin entender qué es una blockchain. En la cosecha entrega y se le descuenta. | El socio |

## La historia de la demo

```mermaid
flowchart LR
    A["2 de febrero<br/>NDVI 0.782 · lluvia 46.7 mm · malezas 12 %"] -->|"condición 74"| V["🟢 VERDE<br/>límite sugerido: 52 % del valor esperado<br/>la coop aprueba y paga en ARGt"]
    V --> B["7 de febrero, 5 días después<br/>NDVI 0.763 · lluvia 0.1 mm · malezas 65 %"]
    B -->|"condición 48"| R["🔴 ROJO<br/>segundo desembolso frenado solo"]
    R --> P["Cosecha<br/>entrega las toneladas, el anticipo<br/>se descuenta en la liquidación"]
```

Lo honesto, y se dice en voz alta: entre el 2 y el 7 de febrero el satélite casi no cambia (la planta no se seca en cinco días). Lo que tira el lote a rojo es la **seca real de 14 días** más las **malezas**, que hoy son simuladas. El satélite solo lo deja en amarillo; las fotos lo llevan a rojo. Ese es el valor de las fotos.

## Vocabulario que no se negocia

- **Índice de condición del cultivo**, nunca "score crediticio" ni "riesgo". No hay etiquetas de repago contra las que validar un modelo de crédito, y no hacen falta: el repago está capturado en la liquidación de la entrega.
- **Límite de anticipo sugerido**: el output principal. Hasta X % del valor de la producción estimada. El benchmark es lo que la coop hace hoy: un porcentaje plano para todos.
- **IA** solo para la detección de malezas por visión. El índice es un conjunto de reglas transparente y versionado (`cupo-v1`), interpretable por diseño porque el usuario es un consejo que rinde cuentas a sus socios.
- **Flywheel**: cada anticipo genera un label (se entregó, cuántas toneladas, con qué desvío). Firmado en la cadena, ese dataset no existe hoy en el país. La heurística es el arranque en frío que lo fabrica.
