# Cómo funciona PreCrop

Un solo lote de soja en Río Segundo, Córdoba. Tres fuentes de datos, un score, un semáforo, y una firma en la cadena que certifica de dónde salió.

```mermaid
flowchart LR
    SAT["🛰️ Satélite Sentinel-2<br/>NDVI: qué tan verde está el lote"]
    CLI["🌧️ Clima Open-Meteo<br/>lluvia de los últimos 7 días"]
    FOT["📷 Fotos en 5 puntos del lote"]

    PACK[("📦 Pack de datos<br/>JSON en el repo<br/>NDVI · lluvia · puntos · evidencia")]
    VIS["🤖 Visión (IA)<br/>estima % de malezas"]
    API["⚙️ Backend evidence-api<br/>calcula el score 0-100<br/>arma el informe y su hash"]
    WEB["🖥️ Pantalla (Front)<br/>mapa + semáforo<br/>verde · amarillo · rojo"]
    SOL["🔗 Solana devnet (MOCK)<br/>guarda score + fecha + hash<br/>firmado por la wallet del equipo"]
    COOP["🏦 La coop<br/>verde: desembolsa<br/>rojo: frena el desembolso"]

    SAT --> PACK
    CLI --> PACK
    FOT --> VIS
    PACK -->|"NDVI y lluvia"| API
    VIS -->|"% malezas"| API
    API -->|"score + semáforo"| WEB
    API -->|"publica y firma"| SOL
    WEB --> COOP
    SOL -->|"la coop verifica la firma"| COOP
```

## Qué es cada cosa, en una línea

| Pieza | Qué hace | Quién la hace |
|---|---|---|
| Pack de datos | La verdad del lote: NDVI medido, lluvia medida, puntos, informes con hash. Ya está hecho y no llama a ningún satélite el día de la demo. | Datos (Franco) |
| Visión | Mira las fotos de los 5 puntos y dice cuánta maleza hay. Hoy es estimado, no hay drone. | IA |
| Backend | Junta NDVI + lluvia + malezas, calcula el score con la fórmula del equipo, arma el informe de evidencia y lo hashea. | Datos (Franco) |
| Pantalla | Mapa del lote, toggle de escenarios, fotos, semáforo. Botón "Publicar score". | Front |
| Solana | Es el escribano: deja firmado que ese score existía con esa evidencia en esa fecha. No presta plata, no verifica el campo. | Datos (Franco), Memo program |
| La coop | Ve el semáforo y la firma, y decide si suelta o frena el próximo desembolso. | El cliente |

## La historia de la demo

```mermaid
flowchart LR
    A["2 de febrero<br/>NDVI 0.782 · lluvia 46.7 mm · malezas 12 %"] -->|"score 74"| V["🟢 VERDE<br/>primer desembolso OK"]
    V --> B["7 de febrero, 5 días después<br/>NDVI 0.763 · lluvia 0.1 mm · malezas 65 %"]
    B -->|"score 48"| R["🔴 ROJO<br/>segundo desembolso rechazado solo"]
    R --> P["Repago simulado<br/>10 % fijo sobre lo desembolsado"]
```

Lo honesto, y se dice en voz alta: entre el 2 y el 7 de febrero el satélite casi no cambia (la planta no se seca en cinco días). Lo que tira el lote a rojo es la **seca real de 14 días** más las **malezas**, que hoy son simuladas. El satélite solo lo deja en amarillo; las fotos lo llevan a rojo. Ese es el valor de las fotos.
