# Segmentación — v2-control-36

Modelo: `gemini-3.6-flash`. Fecha UTC: 2026-09-12T05:05:36.404310+00:00.
Solicitudes realizadas: 1/1. Bloqueo: ninguno.

| Foto | Estado | Referencia % | Contornos % | Error pp | IoU | Ambas vacías |
| --- | --- | ---: | ---: | ---: | ---: | --- |
| control | not_assessable | — | — | — | — | False |

MAE: — pp (0/0 fotos).
IoU media: — (0 pares con unión no vacía).
El control no integra MAE ni IoU. Ambas máscaras vacías se cuentan aparte.

## Comparaciones

Rojo: píxeles de la máscara binaria usada en el cálculo. Sin resultado se muestra gris.

![control: original, detección y referencia](control.comparison.png)

## Observaciones

Revisión visual de detección pendiente; no se infieren aciertos por pruebas sintéticas.
No ampliar al resto del conjunto de desarrollo ni abrir el final sin revisar esta corrida.
