# SOURCES — PreCrop (resumen)

NDVI medido vía Planetary Computer Sentinel-2. Lluvia vía Open-Meteo. Malezas estimadas.

**Importante (Raúl):** no usar 2025-02-02 vs 2024-08-26 (barbecho) como narrativa de “se dañó la cosecha”. Preferir escenarios simulados etiquetados o dos fechas dentro de la misma campaña.

El material original remite a `data/SOURCES.md` para escenas y método, pero ese archivo no está disponible. La procedencia de NDVI/lluvia es la declarada en el pack; no se reprodujo su extracción en esta entrega.

## UPDATE Builder 11-sep — visión y muestreo

- Requisitos aportados por el usuario: 3–5 pins centro/extremos, tolerancia GPS 30 m; fotos nadir a 0,6–1,5 m, 10–15 h, EXIF GPS; API de visión → % malezas por punto → mediana. Sin drone ni CNN propia. Ver [VISION-IA.md](VISION-IA.md).
- Pesos indicados por el usuario: NDVI 0,6; lluvia 0,25; malezas 0,15. Normalizaciones pendientes; satélite se mantiene. Sin fotos no hay verde pleno para segundo desembolso.
- Grilla agro ~30 × 30 m: referencia del equipo a papers, sin fuente bibliográfica identificada en el pack. No se presenta como validada aquí ni se implementa en el hack. V2: sesgar puntos por NDVI bajo/alto.
- [data/photo-point-presets.json](data/photo-point-presets.json): datos sintéticos nuevos P1–P5, escenarios bueno/malo y medianas 9%/26%. No son fotos reales ni inferencias ejecutadas. No contienen GPS y no validan captura.
- Los valores de malezas del JSON histórico siguen siendo estimados. Sus cupos no coinciden exactamente con la fórmula aplicada a los scores visibles: ver brechas en [PRECROP-LEER-ESTO.md](PRECROP-LEER-ESTO.md). Se conserva ese JSON sin alteraciones.
- No hay validación del proveedor/modelo ni precisión agronómica en esta entrega documental. Los modelos nombrados son candidatos del update; verificar contrato oficial y hacer una prueba real al implementar.

## Prueba pública GrowingSoy — 11-sep-2026

- Fuente primaria: [raulsteinmetz/soy-segmentation-ds](https://github.com/raulsteinmetz/soy-segmentation-ds/tree/0047fc2258c1cff54fe2c4ed325b12c9681d25be), revisión fijada `0047fc2258c1cff54fe2c4ed325b12c9681d25be`. Autores declarados: Raul Steinmetz, Henrique Liesenfield Krever, Vinicius Kaster Marini y Celio Trois. El repositorio contiene fotografías de soja con malezas y anotaciones manuales COCO.
- Licencia declarada por el repositorio y el campo `licenses` del COCO: MIT, copyright 2023 Raul Steinmetz. Se conserva el [texto original de licencia](data/vision-growingsoy/source/LICENSE). La copia pública consultada no exige autenticación.
- [README del exportador `labeled`](https://github.com/raulsteinmetz/soy-segmentation-ds/blob/0047fc2258c1cff54fe2c4ed325b12c9681d25be/labeled/README.roboflow.txt): 1.000 imágenes sin aumentos; autoorientación y resize estirado a 640×640. No se usan imágenes de `augmented-labeled`. Se conserva [copia local](data/vision-growingsoy/source/README.roboflow.txt).
- [Manifiesto de las 15 fotos](data/vision-growingsoy/manifest.json): URL exacta por imagen, partición e ID original, video/fotograma, dimensiones, licencia, conteo de píxeles, porcentaje de referencia y hashes. Las [anotaciones originales](data/vision-growingsoy/source/) y el [catálogo calculado](data/vision-growingsoy/catalogue.json) permiten reproducir el muestreo. El script no usa predicciones del README como etiquetas.
- Referencia calculada localmente mediante unión binaria de polígonos de `caruru_weed` y `grassy_weed`, dividida por todos los píxeles. Detalles y límites de rasterización, revisión técnica, tercios y sesgo de ceros: [VISION-IA.md](VISION-IA.md). No equivale a una medición perfecta de hojas visibles ni a validación agronómica.
- Las fechas en los nombres de archivo y `date_captured` del exportador no verifican fecha/ubicación de una captura de PreCrop. No se acredita GPS, altura, horario ni pertenencia al lote del proyecto. Son datos públicos de prueba, separados de los presets y de futuras fotos propias.
- El usuario confirmó que el análisis debe aceptar distintos cultivos indicando el esperado. Esta fuente solo permite probar soja; no respalda generalización a otros cultivos. No se ejecutó inferencia ni se eligió modelo.
