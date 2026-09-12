# Partición vigente — conjunto ampliado con malezas medibles

Fecha: 12-sep-2026. Este directorio agrega 13 fotos; el conjunto congelado de 15 (`../manifest.json`, `../images/`, `../masks/`) **no se modifica**. `python -B data/vision-growingsoy/weeds-v2/verify.py` recalcula referencias y hashes sin usar red.

## Por qué

El conjunto anterior no podía medir detección de malezas: seis de sus nueve fotos de desarrollo tenían referencia cero y el máximo era 8,1807%, de modo que un modelo que respondiera siempre «sin malezas» habría obtenido un MAE cercano a 0,8 pp. Las fotos con más malezas del catálogo estaban del lado de la evaluación final. Reasignar los clips era gratis mientras ninguna foto final se hubiera enviado a un modelo, y ese seguía siendo el caso: la única solicitud completada del proyecto fue GS08.

## Clips por lado

Ningún clip aparece en los dos lados: fotos del mismo video son la misma parcela y compartirlas filtraría el ajuste hacia la evaluación.

| Desarrollo | Final |
| --- | --- |
| 20230103-GX010195, 20230110-GX010226, 20230114-GX010238, 20230114-GX010233, 20230103-GX010189, 20221216-GX010025 | 20221221-GX010110, 20221227-GX010170, 20230110-GX010220, 20221216-GX010015, 20221221-GX010104, 20221227-GX010163 |

## Conjunto activo

**Desarrollo — 16 fotos, referencia de 0% a 19,6406%, mediana 2,7649%, doce por encima de 1%:** GW01 (19,6406%), GW02 (19,3506%), GW03 (10,2043%), GS15 (8,1807%), GW04 (5,6079%), GW05 (4,4443%), GS14 (2,8733%), GW06 (2,7649%), GS13 (1,8538%), GW07 (1,8057%), GW08 (1,7002%), GW09 (1,2510%), GS11 (0,2815%), GS10 (0,0469%), GS03 (0%) y GS08 (0%, fuera del MAE).

**Final — 9 fotos, referencia de 0% a 93,4673%:** GW10 (93,4673%), GW11 (6,9907%), GW12 (4,2920%), GW13 (0,9189%), GS01, GS02, GS04, GS05 y GS06 (0%). Congelado: no se abre hasta fijar prompt y configuración.

## Cambios respecto de la partición anterior

Cambian de lado, por el reparto de clips: GS01, GS05 y GS06 pasan a final; GS14 pasa a desarrollo.

Quedan fuera del conjunto activo, **conservadas en el repositorio**, porque bloqueaban por separación de fotogramas a una foto con maleza sustancial mientras su propia referencia era casi nula: GS09 (0%, a 180 fotogramas de GW02), GS12 (0,9446%, a 60 de GW10) y GS07 (0%, a 320 de GW11). La regla aplicada es explícita: una candidata por encima de 5% desplaza a una bloqueante por debajo de 1%; nunca al revés, y nunca a una foto ya enviada a un modelo.

GS08 permanece en desarrollo pero **no cuenta en el MAE** hasta que un agrónomo revise su referencia. Declara 0% de malezas sobre 33,5% de vegetación visible y nueve instancias anotadas, mientras que su mismo clip tiene 53 fotos de 82 con malezas anotadas y, 140 fotogramas antes, gramíneas de hoja angosta como las que el modelo describió en la corrida real. La métrica de vegetación sin anotar no la distingue del resto del conjunto, así que esto no prueba una omisión: solo desaconseja usarla como vara de medición. Su clip tampoco puede volver al lado final, porque ya se envió.

## Procedencia y límites

Mismo origen, revisión y licencia que el conjunto congelado: [soy-segmentation-ds](https://github.com/raulsteinmetz/soy-segmentation-ds) en `0047fc2258c1cff54fe2c4ed325b12c9681d25be`, MIT, copyright 2023 Raul Steinmetz; ver [SOURCES.md](../../../SOURCES.md). Las referencias se recalculan desde las anotaciones COCO originales con el mismo denominador de todos los píxeles.

Las anotaciones siguen siendo aproximadas: encontré plantas sin marcar en GW03 y en fotos vecinas de GW04. Ninguna de estas fotos acredita GPS, altura, horario ni pertenencia a un lote de PreCrop, y el conjunto solo prueba soja. Tener malezas medibles permite detectar fallos del método; no acredita precisión agronómica ni generalización a otros cultivos.
