# Segmentación — v2-weeds-36-resto2

Modelo: `gemini-3.6-flash`. Fecha UTC: 2026-09-12T05:07:51.745335+00:00.
Solicitudes realizadas: 1/4. Bloqueo: HTTP_503.

| Foto | Estado | Referencia % | Contornos % | Error pp | IoU | Ambas vacías |
| --- | --- | ---: | ---: | ---: | ---: | --- |
| GW07 | api_error | 1.8057 | — | — | — | False |
| GW08 | blocked | 1.7002 | — | — | — | False |
| GW09 | blocked | 1.2510 | — | — | — | False |
| control | blocked | — | — | — | — | False |

MAE: — pp (0/3 fotos).
IoU media: — (0 pares con unión no vacía).
El control no integra MAE ni IoU. Ambas máscaras vacías se cuentan aparte.

## Comparaciones

Rojo: píxeles de la máscara binaria usada en el cálculo. Sin resultado se muestra gris.

![GW07: original, detección y referencia](GW07.comparison.png)

![GW08: original, detección y referencia](GW08.comparison.png)

![GW09: original, detección y referencia](GW09.comparison.png)

![control: original, detección y referencia](control.comparison.png)

## Observaciones

Revisión visual de detección pendiente; no se infieren aciertos por pruebas sintéticas.
No ampliar al resto del conjunto de desarrollo ni abrir el final sin revisar esta corrida.
