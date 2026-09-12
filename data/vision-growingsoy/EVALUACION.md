# GrowingSoy — prueba preparada, sin inferencias

Entrada general: foto RGB + cultivo esperado. En estas 15 fotos, el cultivo es **soja**. El [protocolo completo](../../VISION-IA.md) define ejecución, contrato, métricas y la segunda prueba con cinco puntos propios.

El modelo recibirá solamente el JPEG y el [prompt](prompt.txt) con `{{CULTIVO_ESPERADO}} = soja`. Las máscaras, referencias y láminas de revisión son material de evaluación: no se adjuntan al modelo. No usar fotos finales para ajustar prompts. No hay proveedor seleccionado ni umbral de aceptación acordado.

## Tabla de comparación inicial

Los porcentajes se muestran con cuatro decimales; el cálculo usa los valores completos del [manifiesto](manifest.json). «—» significa sin resultado, no cero. «Baja/intermedia/alta» son tercios por rango, con muchos empates en cero; no niveles agronómicos.

| Foto | Tercio | Uso | Referencia % | Estado | Estimación % | Error absoluto (pp) |
| --- | --- | --- | ---: | --- | ---: | ---: |
| [GS01](images/desarrollo/GS01.jpg) | Baja | Desarrollo | 0,0000 | Pendiente | — | — |
| [GS02](images/final/GS02.jpg) | Baja | Final reservada | 0,0000 | Pendiente | — | — |
| [GS03](images/desarrollo/GS03.jpg) | Baja | Desarrollo | 0,0000 | Pendiente | — | — |
| [GS04](images/final/GS04.jpg) | Baja | Final reservada | 0,0000 | Pendiente | — | — |
| [GS05](images/desarrollo/GS05.jpg) | Baja | Desarrollo | 0,0000 | Pendiente | — | — |
| [GS06](images/desarrollo/GS06.jpg) | Intermedia | Desarrollo | 0,0000 | Pendiente | — | — |
| [GS07](images/final/GS07.jpg) | Intermedia | Final reservada | 0,0000 | Pendiente | — | — |
| [GS08](images/desarrollo/GS08.jpg) | Intermedia | Desarrollo | 0,0000 | Pendiente | — | — |
| [GS09](images/final/GS09.jpg) | Intermedia | Final reservada | 0,0000 | Pendiente | — | — |
| [GS10](images/desarrollo/GS10.jpg) | Intermedia | Desarrollo | 0,0469 | Pendiente | — | — |
| [GS11](images/desarrollo/GS11.jpg) | Alta | Desarrollo | 0,2815 | Pendiente | — | — |
| [GS12](images/final/GS12.jpg) | Alta | Final reservada | 0,9446 | Pendiente | — | — |
| [GS13](images/desarrollo/GS13.jpg) | Alta | Desarrollo | 1,8538 | Pendiente | — | — |
| [GS14](images/final/GS14.jpg) | Alta | Final reservada | 2,8733 | Pendiente | — | — |
| [GS15](images/desarrollo/GS15.jpg) | Alta | Desarrollo | 8,1807 | Pendiente | — | — |

| Métrica | Desarrollo | Final |
| --- | ---: | ---: |
| Fotos planificadas | 9 | 6 |
| Estimaciones válidas | 0 | 0 |
| Abstenciones (`not_assessable`) | 0 | 0 |
| Respuestas inválidas | 0 | 0 |
| Errores de API | 0 | 0 |
| Pendientes | 9 | 6 |
| MAE sobre estimaciones válidas (pp) | Sin dato | Sin dato |

Los conteos iniciales reflejan que no hubo corridas; no implican ausencia de fallos del modelo. `prepare.py evaluate corrida.json` genera la tabla y resumen de una fase a partir de respuestas crudas. Las abstenciones y errores no aportan un cero al promedio. Mantener el reporte y los originales de cada corrida, sin mezclar fases ni elegir el mejor reintento.

## Archivos y procedencia

- `images/desarrollo/` y `images/final/`: 15 JPEG de la rama `labeled`, conservados byte por byte. La división original train/valid/test no determina la división de esta prueba.
- `masks/`: unión binaria de polígonos de malezas a resolución completa; blanco = maleza anotada. Suelo y cultivo siguen contando en el denominador.
- [manifest.json](manifest.json): origen y licencia por foto, identificación original, dimensiones, referencia sin redondear, partición, hashes y estado de revisión.
- [catalogue.json](catalogue.json): las 999 imágenes estructuralmente elegibles y la exclusión de `test:80` por falta de anotaciones. Sus referencias se calculan desde los COCO; las 984 no seleccionadas no recibieron revisión visual.
- [selection.json](selection.json): lista fija y rangos objetivo. Los videos no se comparten entre desarrollo y final; las fotos del mismo video están separadas al menos 400 fotogramas. No es una partición independiente por lote.
- `source/`: anotaciones y documentación originales de la revisión `0047fc2258c1cff54fe2c4ed325b12c9681d25be`. Licencia [MIT, copyright 2023 Raul Steinmetz](source/LICENSE); [fuentes completas](../../SOURCES.md).
- `review/`: láminas técnicas RGB/overlay de [baja](review/baja.jpg), [intermedia](review/intermedia.jpg) y [alta](review/alta.jpg). Cian = soja; rojo = malezas. Contienen material final reservado; usarlas solo para auditoría del conjunto, no para ajuste del modelo.
- [Control no interpretable](controls/no-interpretable.png): imagen uniforme RGB `(128,128,128)`, 640×640, generada localmente. Resultado esperado: abstención. No es una foto GrowingSoy, no tiene referencia de cobertura y no cuenta entre las 15 ni en el MAE. Registrar su respuesta de control aparte de la corrida de 9/6 fotos.

## Revisión técnica y límites

Se inspeccionaron los RGB y sus overlays el 11-sep-2026. La revisión de preparación no encontró omisiones evidentes de malezas que justificaran excluir las seleccionadas, ni pares de encuadres casi idénticos. No sustituye revisión agronómica ni certifica que cada planta esté bien clasificada. La fuente no tiene un indicador de anotación completa. No se redibujaron etiquetas ni se usaron predicciones como referencias.

Las fotos incluyen rastrojo, sombras, estacas, carteles, cintas y a veces bordes del equipo u operador. Algunas presentan marcas de color; GS15 permite observarlo en desarrollo. Todo permanece en el denominador. Los polígonos manuales son aproximados: pueden incluir huecos entre hojas finas y no resolver perfectamente las oclusiones. La referencia es cobertura según esas máscaras, con esa limitación respecto de la superficie visible real.

Los nueve ceros seleccionados no tienen anotaciones de malezas, pero sí de cultivo; son distintos del registro sin ninguna anotación que se excluyó. La prueba tiene cinco fotos del tercio alto, pero ninguna supera 8,181%. Se puede ejecutar y detectar fallos del método, sin afirmar evaluación representativa de coberturas fuertes ni de otros cultivos.

No se verificaron GPS ni condiciones de captura de PreCrop. Las fechas del exportador no prueban captura del lote. El conjunto público tampoco se utiliza para calcular una mediana de puntos propios.

## Reproducción local

No se añadió ninguna dependencia. Se usaron Python 3.14 y Pillow 12.3.0 ya instalado. Desde la raíz:

```powershell
python data/vision-growingsoy/prepare.py self-check
python data/vision-growingsoy/prepare.py verify
```

Si el alias de Windows falla, sustituir `python` por `& 'C:\Users\Tripulante\AppData\Local\Python\bin\python.exe'`. `verify` no escribe ni necesita red. Comprueba fuentes, máscara recalculada, porcentaje, JPEG, hashes, particiones y duplicados; la valoración visual se conserva arriba.

Para reconstruir en una copia de trabajo, ejecutar `inventory`, `candidates`, `review` y `pack` en ese orden. Los JPEG se recuperan de la URL exacta `source_url` de cada selección; los COCO corresponden a `labeled/{train,valid,test}/_annotations.coco.json` en la revisión fijada. `pack` registra los hashes; `verify` los compara con el manifiesto existente. Conservar el manifiesto distribuido al descargar nuevamente, para detectar cambios de bytes. No sobrescribir la selección ni los resultados de una prueba ya iniciada.

La preparación y sus comprobaciones locales no ejecutan una IA. Modelo, evaluación de precisión y aceptación agronómica quedan para la siguiente etapa.
