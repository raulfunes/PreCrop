# Visión IA — MVP PreCrop

**Etapa actual — 11-sep-2026:** prueba experimental de detección y repintado con Gemini `gemini-3.8-flash`, limitada a GS08, GS11, GS15 y un control. Tras revisar y simplificar el esquema enviado, GS08 devolvió contornos evaluables (0,6350% frente a referencia 0%; IoU 0). GS11 devolvió HTTP 503 por alta demanda y detuvo la corrida; GS15 y el control siguen pendientes. Entrada: foto RGB + cultivo esperado «soja». Sin pantallas, score ni validación agronómica; no acredita funcionamiento en otros cultivos.

El UPDATE Builder anterior incluye visión dentro del futuro MVP, con revisión del agrónomo, partner de solo lectura y fallback manual/presets. Sus nombres de modelos son antecedentes, no una selección. Las propuestas de integración y score de las secciones siguientes siguen fuera de esta etapa. Alcance general: [PRECROP-LEER-ESTO.md](PRECROP-LEER-ESTO.md).

## Experimento de segmentación v1 — implementación y resultado

[Script REST](data/vision-growingsoy/segment.py) · [Prompt de segmentación v1](data/vision-growingsoy/prompt-segmentation-v1.txt) · [Comprobación ejecutable sin red](data/vision-growingsoy/check_segment.py) · [Último reporte observado y comparaciones](data/vision-growingsoy/runs/segmentation-v1-request-v2-20260912T025323507337Z/report.md).

Esta ampliación reemplaza la etapa de «sin API ni proveedor» únicamente para este experimento local. Conserva intactos `prepare.py`, `prompt.txt` y el contrato anterior de estimación de porcentajes. No implementa aplicación, pantallas ni score.

**Configuración:** `gemini-3.8-flash`, REST `v1beta/models/gemini-3.8-flash:generateContent`, un candidato, razonamiento `LOW`, salida máxima de 8.192 tokens y esquema JSON. La ficha del modelo confirma `low`, `medium` y `high`; `minimal` devuelve error. [Ficha oficial](https://ai.google.dev/gemini-api/docs/models/gemini-3.8-flash). Los campos REST se basan en [generateContent / GenerationConfig](https://ai.google.dev/api/generate-content); las longitudes de los textos se verifican localmente, porque el subconjunto JSON Schema publicado no incluye `minLength`/`maxLength`.

La documentación de [segmentación](https://ai.google.dev/gemini-api/docs/image-understanding#segmentation) muestra contornos asociados a cajas. Aquí se pide explícitamente un contrato distinto: polígonos relativos a **toda la fotografía**, sin cajas. Que el modelo respete ese sistema de coordenadas y distinga soja de malezas es una hipótesis a comprobar, no una capacidad validada por el código local.

La tabla de [precios oficial](https://ai.google.dev/gemini-api/docs/pricing), consultada el 11-sep-2026, incluye nivel gratuito; eso no acredita la cuota ni la facturación de una clave particular. Usar exclusivamente un proyecto de AI Studio **sin facturación**. El script exige `--free-project-confirmed` como declaración del operador tras verificar el proyecto de la clave. La clave por sí sola no permite comprobar aquí esa condición. No habilita pagos ni cambia de proveedor/modelo si falta acceso gratuito.

**Límites:** exactamente GS08, GS11 y GS15, en ese orden, más `controls/no-interpretable.png`; cultivo «soja». Una imagen original por solicitud, sin referencias, máscaras, porcentajes, tercio ni ejemplos resueltos en el payload. Valida hashes, formato y dimensiones antes de enviar. Las seis finales no se abren ni envían desde este script.

Máximo cuatro solicitudes secuenciales en el experimento, sin reintentos ni redirecciones HTTP. Un proceso hijo de Python limita cada transporte completo (DNS/conexión/lectura) a 30 segundos; el padre termina y espera ese proceso ante timeout. La respuesta HTTP se acota a 1 MiB. Cualquier fallo HTTP, de transporte o exceso de tamaño detiene las solicitudes restantes. Una respuesta que incumple el contrato se registra y permite continuar con la siguiente foto dentro del presupuesto.

Al iniciar una corrida con clave y proyecto confirmado, crea exclusivamente `runs/<EXPERIMENT>.started.json`; otra ejecución no puede reservar el mismo experimento, ni siquiera si la primera se interrumpe. La reserva no se elimina automáticamente. Esto evita exceder cuatro solicitudes al relanzar o ejecutar simultáneamente. Una corrida bloqueada antes del acceso no consume la reserva. La primera revisión conserva `segmentation-v1.started.json`; el reintento solicitado por el usuario usa `segmentation-v1-request-v2.started.json`. Revisar resultados y acordar otro experimento antes de habilitar más solicitudes; no borrar las reservas para reintentar.

### Contrato de segmentación y cálculo

```json
{"status":"assessed","reason":"Sin malezas visibles.","limitations":[],"polygons":[]}
```

Ejemplo de formato, no salida observada. Las únicas claves son `status`, `reason`, `limitations` y `polygons`. `status` admite `assessed` y `not_assessable`; motivo no vacío de hasta 600 caracteres y hasta ocho limitaciones no vacías de hasta 300 caracteres. `polygons` admite hasta 64 contornos con 3–128 vértices `[x,y]`, numéricos finitos entre 0 y 1000, origen arriba a la izquierda. El cierre es implícito. Se rechazan claves duplicadas/extra, booleanos, strings numéricos, coordenadas fuera de rango, vértices repetidos, área degenerada, retrocesos, cruces y rectángulos (también rotados o con vértices colineales adicionales). El modelo debe abstenerse con lista vacía cuando la foto no sea interpretable.

La conversión es `floor(x × ancho / 1000)` y `floor(y × alto / 1000)`, limitando el borde 1000 al último píxel. Reutiliza `prepare.union_mask` para rellenar y unir polígonos en modo binario. El porcentaje es `100 × píxeles marcados / (ancho × alto)`: cobertura de los **contornos predichos**, no una estimación agronómica calibrada. Un `assessed` sin regiones produce máscara vacía y 0%; abstención, fallo o respuesta inválida produce máscara ausente y porcentaje `null`.

El error absoluto se expresa en puntos porcentuales; MAE incluye solo predicciones evaluables con referencia y siempre informa su denominador sobre tres fotos. IoU = intersección/unión de máscaras. Dos máscaras vacías se registran como coincidencia sin malezas con IoU `null`, fuera de la media de IoU; sí aportan su error cero al MAE. El control no entra en ninguna media: `control_pass` comprueba la abstención explícita y queda `null` ante fallo/bloqueo.

`ponytail:` el relleno de polígonos incluye bordes y no representa huecos interiores dentro de un contorno; las coordenadas se cuantizan a píxeles. Las geometrías rectangulares se rechazan de forma conservadora, pero pasar la validación no prueba que el contorno siga una planta. Si esta prueba revela limitaciones, revisar visualmente y diseñar después otro contrato (p. ej., máscaras con huecos), sin cambiar silenciosamente las referencias o el sistema de coordenadas.

Cada corrida crea un directorio UTC nuevo con plantilla y SHA-256, modelo/configuración, hashes de script/manifiesto/entradas/referencias, versión de Pillow, conteos y tiempos por intento. Conserva respuesta HTTP como bytes (`*.response.bin`), texto extraído exacto (`*.model.txt`), máscaras de predicciones evaluables (`*.mask.png`), comparaciones PNG y `run.json`/`report.md`. Si una respuesta refleja la clave, la redacta y registra esa excepción; nunca conserva la credencial. El PNG pinta mediante la misma máscara usada en las métricas y conserva resolución original, sin compresión JPEG adicional. Cuando falta detección, el panel central es gris con «SIN MASCARA / SIN RESULTADO»; no dibuja un falso cero. Los originales y referencias se leen sin sobrescribirlos.

### Verificación y ejecución local

```powershell
& 'C:\Users\Tripulante\AppData\Local\Python\bin\python.exe' -B data/vision-growingsoy/check_segment.py
& 'C:\Users\Tripulante\AppData\Local\Python\bin\python.exe' -B data/vision-growingsoy/prepare.py self-check
```

Ambas comprobaciones pasaron con Python 3.14.5 y Pillow 12.3.0. La nueva prueba usa respuestas sintéticas y transporte simulado dentro de un directorio temporal: orientación en imagen no cuadrada, borde 1000, unión/superposiciones, denominador completo, cero válido, abstención, contrato inválido, polígonos degenerados/rectángulos/cruces, IoU, MAE con exclusiones, pintura exacta píxel a píxel, fallo de transporte, timeout total, cuota 429, secretos no persistidos, proyecto sin confirmar y reserva de cuatro solicitudes. Ninguna llama a Gemini.

Para ejecutar la prueba real, primero verificar en AI Studio que la clave pertenece a un proyecto **sin facturación**. Cargarla únicamente en el entorno local con entrada oculta, nunca en el chat, repositorio ni argumento de línea de comandos:

```powershell
$geminiSecret = Read-Host 'GEMINI_API_KEY del proyecto sin facturación' -AsSecureString
$env:GEMINI_API_KEY = [System.Net.NetworkCredential]::new('', $geminiSecret).Password
try {
    & 'C:\Users\Tripulante\AppData\Local\Python\bin\python.exe' -B data/vision-growingsoy/segment.py --free-project-confirmed
} finally {
    Remove-Item Env:GEMINI_API_KEY
    Remove-Variable geminiSecret
}
```

### Comprobación previa sin clave — 11-sep-2026, 23:18 ART

La [corrida registrada](data/vision-growingsoy/runs/segmentation-v1-20260912T021845560808Z/run.json) quedó bloqueada por `missing_GEMINI_API_KEY`: **0/4 solicitudes**, cuatro estados `blocked`, porcentajes/MAE/IoU nulos. El nombre del directorio usa 12-sep en UTC. Se conserva también la primera comprobación de bloqueo de las 23:17 ART; ninguna consumió solicitudes. No hay respuestas ni máscaras de Gemini, ni aciertos/errores de detección que se puedan atribuir al modelo. La disponibilidad de cuota gratuita del proyecto permanece sin verificar.

| Foto | Referencia % | Resultado IA |
| --- | ---: | --- |
| GS08 | 0,0000 | Bloqueado; falta clave |
| GS11 | 0,2815 | Bloqueado; falta clave |
| GS15 | 8,1807 | Bloqueado; falta clave |
| Control uniforme | No aplicable | Bloqueado; abstención aún no comprobada con modelo |

Se inspeccionaron visualmente el [repintado sintético](data/vision-growingsoy/runs/offline-mask-check.png) y la [comparación GS15](data/vision-growingsoy/runs/segmentation-v1-20260912T021845560808Z/GS15.comparison.png). El primero mantiene orientación y bordes; la comprobación automática confirma que cambian exactamente los píxeles de la máscara. GS15 muestra correctamente el panel de detección ausente y la referencia pintada. El dibujo sintético no procede de IA ni integra métricas del experimento.

El siguiente intento real se registra abajo. **No ampliar automáticamente a las nueve fotos de desarrollo.** Otros cultivos requieren referencias propias; las seis finales siguen reservadas.

### Primera solicitud real — 11-sep-2026, 23:46 ART

El usuario proporcionó la clave en `.env` y pidió ejecutar la prueba. Se cargó únicamente en el entorno del proceso, sin mostrarla, bajo la condición de proyecto sin facturación acordada para esta prueba. `.gitignore` excluye el `.env` de la raíz. No se comprobó por separado la facturación del proyecto mediante una API administrativa.

La [corrida real](data/vision-growingsoy/runs/segmentation-v1-20260912T024646050376Z/run.json) realizó **1/4 solicitudes**: GS08 recibió HTTP 400 en 8,18 segundos. La respuesta original conservada indica `INVALID_ARGUMENT` y `Request contains an invalid argument.`; no identifica qué argumento falló ni aporta una detección. El error no permite atribuir la causa a la clave, el modelo, la configuración o el esquema. No hubo reintentos ni cambio de proveedor/modelo.

| Foto | Estado | Contornos % | Error absoluto / IoU |
| --- | --- | --- | --- |
| GS08 | `api_error` / HTTP 400 | `null` | `null` / `null` |
| GS11 | `blocked`; no enviada | `null` | `null` / `null` |
| GS15 | `blocked`; no enviada | `null` | `null` / `null` |
| Control uniforme | `blocked`; no enviado | `null` | No aplicable |

**Resultado:** la solicitud fue rechazada por la API antes de obtener una respuesta de segmentación. No hay aciertos, errores de localización, máscaras predichas ni porcentajes del modelo que evaluar; MAE e IoU permanecen nulos. Los PNG muestran la foto y referencia con panel central sin resultado. La respuesta HTTP, tiempo, configuración, hashes y estado por foto quedan en el [reporte](data/vision-growingsoy/runs/segmentation-v1-20260912T024646050376Z/report.md).

Se conserva `runs/segmentation-v1.started.json`: el presupuesto quedó reservado y el script no retomará automáticamente las otras tres solicitudes. Próximo paso: revisar el rechazo de la API y acordar una prueba corregida antes de enviar más imágenes; no interpretar este fallo de integración como evidencia de mala calidad de detección. Las seis fotos finales siguen reservadas.

### Reintento autorizado con solicitud revisada — 11-sep-2026, 23:53 ART

El usuario pidió volver a intentarlo revisando el envío. Se consultaron las guías oficiales de [imágenes](https://ai.google.dev/gemini-api/docs/image-understanding), [generateContent](https://ai.google.dev/api/generate-content), [modelos](https://ai.google.dev/api/models) y [salida estructurada](https://ai.google.dev/gemini-api/docs/structured-output#limitations). La [consulta real de metadatos](data/vision-growingsoy/runs/model-access-check.json) devolvió HTTP 200 para `gemini-3.8-flash` y confirmó `generateContent` entre sus métodos. Comprueba acceso al modelo, no estado de facturación.

La documentación advierte que el proveedor puede rechazar esquemas complejos. Se simplificó solo el esquema enviado: se quitaron `maxItems: 64` para contornos, `minItems: 3` / `maxItems: 128` para vértices y `maxItems: 8` para limitaciones. Se conservó el par `[x,y]` y sus rangos en el esquema. Todos los límites siguen en el prompt y la validación local, con comprobaciones ejecutables de exceso de contornos/vértices. Modelo, endpoint, JSON estructurado, razonamiento LOW, tokens e imágenes permanecen iguales.

**El esquema reducido fue aceptado para GS08.** Esto respalda la hipótesis de rechazo por complejidad, pero no identifica con certeza qué restricción produjo el HTTP 400 anterior. No se necesita un SDK ni una API diferente para obtener respuesta con esta clave.

| Foto | Resultado | Cobertura de contornos | Error absoluto | IoU |
| --- | --- | ---: | ---: | ---: |
| GS08 | HTTP 200, `assessed`, dos contornos | 0,635009765625% | 0,635009765625 pp | 0 |
| GS11 | HTTP 503, alta demanda (`UNAVAILABLE`) | `null` | `null` | `null` |
| GS15 | No enviada tras el fallo de GS11 | `null` | `null` | `null` |
| Control | No enviado tras el fallo de GS11 | `null` | No aplicable | No aplicable |

[Reporte y comparación](data/vision-growingsoy/runs/segmentation-v1-request-v2-20260912T025323507337Z/report.md) · [Máscara GS08](data/vision-growingsoy/runs/segmentation-v1-request-v2-20260912T025323507337Z/GS08.mask.png) · [Respuesta del modelo](data/vision-growingsoy/runs/segmentation-v1-request-v2-20260912T025323507337Z/GS08.model.txt).

En GS08 la referencia es vacía: los 2.601 píxeles marcados son falsos positivos respecto de las anotaciones. La inspección muestra dos regiones sobre vegetación central que incluyen partes del fondo/rastrojo; no hay un ejemplo de maleza correctamente localizada en esta corrida. Se comprobó que la máscara PNG coincide exactamente con la rasterización de los polígonos y con los 2.601 píxeles repintados. La representación y el cálculo funcionan; la clasificación de esta foto falla contra la referencia. No se ha validado agronómicamente.

El MAE (0,6350 pp) y la IoU media (0) incluyen **solo 1/3 fotos**, por lo que no permiten evaluar calidad global ni abstención del control. El HTTP 503 de GS11 es un fallo de disponibilidad reportado por Google, distinto del HTTP 400 de la corrida anterior. Se hicieron dos solicitudes de generación en esta corrida, sin reintentos automáticos; total histórico: tres solicitudes de generación más una consulta de metadatos. Todas las corridas y reservas quedan preservadas. No se enviaron referencias, overlays ni fotos finales.

Próximo trabajo, tras revisar estos resultados: una nueva ejecución autorizada para las fotos pendientes cuando el servicio esté disponible; no repetir GS08 para escoger una respuesta más favorable ni ampliar automáticamente a las nueve de desarrollo.

### Prompt de segmentación v2 y conjunto con malezas medibles — 12-sep-2026

[Prompt v2](data/vision-growingsoy/prompt-segmentation-v2.txt) · [Morfología por cultivo](data/vision-growingsoy/crop-morphology.json). Redactados tras revisar la corrida de GS08; **no se ejecutó ninguna solicitud con v2**. El v1 se conserva sin cambios.

Diagnóstico que lo motiva, calculado localmente sin red ni cuota: dentro de los polígonos que el modelo devolvió para GS08, el 89,1% de los píxeles es vegetación (exceso de verde medio +0,2254) frente al 33,1% del resto de la foto (+0,0670). La localización y el sistema de coordenadas relativo a toda la imagen funcionaron; lo que no quedó demostrado es la separación entre cultivo y maleza. El reporte de esa corrida describe los contornos como si incluyeran fondo y rastrojo en proporción apreciable; esa lectura subestima la coincidencia con vegetación y se corrige aquí.

El v2 cambia **solo la parte discriminante**: añade morfología del cultivo esperado, dos morfologías frecuentes de maleza a modo de ejemplo abierto, la hilera y el entresurco como criterio secundario explícitamente no absoluto, el rango de tamaños esperable y una lista de distractores observados en el conjunto (rastrojo, sombras, banderines, cintas, carteles numerados, varillas, estacas, partes del equipo y marcas de pintura sobre el suelo). El contrato JSON, las coordenadas y las prohibiciones son idénticos a los del v1, y `check_segment.py` lo comprueba: así una comparación entre corridas aísla la instrucción y no mezcla un cambio de contrato.

La morfología del cultivo vive fuera del prompt, en `crop-morphology.json`, y se inserta en `{{MORFOLOGIA_CULTIVO}}`. Hoy solo declara soja. `render_prompt()` falla si se pide un cultivo sin morfología declarada o si queda un marcador sin resolver; no envía un prompt a medio armar. Declarar un cultivo nuevo no acredita precisión en él: sigue exigiendo sus propias referencias y su propia evaluación.

**El conjunto actual no puede medir detección de malezas.** Seis de las nueve fotos de desarrollo tienen referencia cero y el máximo es 8,1807%: un modelo que respondiera siempre «sin malezas» obtendría un MAE cercano a 0,8 pp. De las 999 elegibles, 230 superan 1%, 69 superan 5% y 29 tienen más de cinco instancias anotadas. Propuesta de conjunto de desarrollo ampliado, con dos fotos por clip y 400 fotogramas de separación: `train:469` (19,6406%), `train:47` (19,3506%), `train:488` (10,2043%), `train:59` (6,3645%), `valid:41` (2,7649%), `train:431` (1,8057%), `train:328` (1,2510%) y `train:85` (0,5452%). Sumarlas al conjunto vigente, no reemplazarlo: el actual comprueba que el modelo no invente malezas donde no las hay, y el nuevo, que encuentre las que hay.

**Resuelto el 12-sep-2026.** La partición se rehízo y el conjunto ampliado vive en [weeds-v2/](data/vision-growingsoy/weeds-v2/PARTICION.md), con 13 fotos nuevas, manifiesto propio y [verificador offline](data/vision-growingsoy/weeds-v2/verify.py). El conjunto congelado de 15 no se modificó y `prepare.py verify` sigue pasando. Desarrollo queda con 16 fotos de 0% a 19,6406% (mediana 2,7649%, doce por encima de 1%) y final con 9 de 0% a 93,4673%. GS08 permanece en desarrollo pero fuera del MAE hasta que un agrónomo revise su referencia. Los detalles de reasignación y desplazamiento están en ese documento.

Dos obstáculos que hubo que resolver. Primero, los clips más ricos en malezas —`20230114-GX010238`, con 38 fotos de tres o más instancias, y `20221221-GX010110`, que contiene la de 93,4673%— están hoy reservados para evaluación final; reasignarlos no cuesta nada mientras ninguna foto final se haya enviado a un modelo, y el clip de GS08 no puede volver al lado final porque ya se envió. Segundo, la referencia de GS08 declara 0% de malezas sobre 33,5% de vegetación visible y nueve instancias anotadas, mientras que su mismo clip tiene 53 fotos de 82 con malezas anotadas y, 140 fotogramas antes, gramíneas de hoja angosta como las que el modelo describió. La métrica de vegetación sin anotar no distingue a GS08 del resto del conjunto, así que esto no prueba una omisión: hasta que un agrónomo la revise, conviene no usar esa foto como vara de medición.

### Corrida con prompt v2 sobre el conjunto ampliado — 12-sep-2026, 01:46 ART

Autorizada por el usuario sobre GW02, GW01 y GW03 más el control, con la clave de `.env` y la misma declaración de proyecto sin facturación de los intentos anteriores. `segment.py` apunta ahora a `prompt-segmentation-v2.txt` y al manifiesto de `weeds-v2/`; el control uniforme sigue en `controls/`.

**Ambos intentos quedaron detenidos por indisponibilidad del proveedor, sin ninguna detección que evaluar.** GW02 recibió HTTP 503 / `UNAVAILABLE` a los 20,27 s en la [primera corrida](data/vision-growingsoy/runs/segmentation-v2-weeds-20260912T044623869091Z/report.md) y otra vez en el [reintento](data/vision-growingsoy/runs/segmentation-v2-weeds-retry-20260912T044721405891Z/report.md); GW01, GW03 y el control no se enviaron. El cuerpo conservado dice: «This model is currently experiencing high demand. Spikes in demand are usually temporary. Please try again later.» Es un fallo de capacidad de `gemini-3.8-flash`, ajeno al prompt, al conjunto y a la clave, y distinto del HTTP 400 por complejidad de esquema del 11-sep.

Total histórico: cinco solicitudes de generación —una con HTTP 400, una con respuesta completa, tres con HTTP 503— más dos consultas de metadatos. Las reservas `segmentation-v2-weeds.started.json` y `segmentation-v2-weeds-retry.started.json` quedan en pie; no se borran para reintentar.

`segment.py` acepta `--experiment` para nombrar la corrida sin editar el código, porque cada reintento necesita una reserva nueva. La protección no cambia: un nombre ya reservado sigue bloqueado, y `check_segment.py` comprueba ambas cosas. No se amplió la selección ni se abrieron las fotos del lado final.

### Conjunto de desarrollo completo y control — 12-sep-2026, 02:08 ART

Las nueve fotos de desarrollo de `weeds-v2` evaluadas con `gemini-3.6-flash` y el prompt v2. [Consolidado reproducible](data/vision-growingsoy/consolidate.py): `python -B data/vision-growingsoy/consolidate.py`.

| Foto | Referencia | Contornos | Error | IoU |
| --- | ---: | ---: | ---: | ---: |
| GW01 | 19,6406% | 17,5002% | 2,1404 pp | 0,7445 |
| GW02 | 19,3506% | 11,8406% | 7,5100 pp | 0,5762 |
| GW03 | 10,2043% | 9,4265% | 0,7778 pp | 0,6151 |
| GW04 | 5,6079% | 3,9299% | 1,6780 pp | **0,0000** |
| GW05 | 4,4443% | 2,7673% | 1,6770 pp | 0,2716 |
| GW06 | 2,7649% | 3,8923% | 1,1274 pp | 0,6005 |
| GW07 | 1,8057% | 0,5366% | 1,2690 pp | 0,2280 |
| GW08 | 1,7002% | 2,0281% | 0,3279 pp | 0,3766 |
| GW09 | 1,2510% | 0,6550% | 0,5959 pp | **0,0000** |

**MAE 1,9004 pp · IoU media 0,3792** (mediana 0,3766; cuatro de nueve por debajo de 0,3).

**El MAE solo engaña.** GW04 tiene 1,6780 pp de error y **IoU 0**: el modelo marcó rastrojo del borde derecho y se perdió las dos malezas reales de la mitad inferior. GW09 repite el patrón con 0,5959 pp de error e IoU 0, marcando cinco manchitas sobre rastrojo y suelo. En ambas el porcentaje coincidió por casualidad. Cualquier informe debe mostrar MAE e IoU juntos; con un solo número, esa foto pasa por acierto.

**La calidad depende del tamaño de la maleza.** Con referencia ≥ 10% la IoU media es 0,6453; por debajo de 10%, 0,2461, con dos fotos en cero. El modelo resuelve matas grandes y falla con malezas chicas y dispersas sobre rastrojo, que es justamente el caso de detección temprana con más valor agronómico.

**Subestima de forma sistemática:** sesgo medio **−1,5770 pp**, siete de nueve fotos por debajo de la referencia. Con la transformación propuesta `componente_malezas = 100 − mediana`, subestimar malezas empuja el score hacia verde. Con peso 0,15 el efecto sobre el score es de unas 0,25 décimas, pero es sesgo, no ruido, y no debe corregirse con un factor inventado sin calibración.

**Control aprobado dos veces**, en corridas separadas: ante la imagen uniforme el modelo devolvió `not_assessable` con cero polígonos y motivo legible, sin fabricar un cero. [Corrida](data/vision-growingsoy/runs/v2-control-36-20260912T050536404310Z/report.md).

Límites: nueve fotos, un cultivo, un modelo y una versión de prompt. No hay comparación v1/v2 sobre el mismo conjunto y modelo, así que la mejora no se puede atribuir al prompt. Las seis fotos finales siguen cerradas y no se abren hasta congelar prompt y configuración. Esto no acredita precisión agronómica.

### Primera detección real de malezas — 12-sep-2026, 02:01 ART

**`gemini-3.6-flash`, prompt v2, conjunto `weeds-v2`: 4/4 solicitudes, tres fotos evaluadas, MAE 3,4761 pp e IoU media 0,6453.** [Reporte y comparaciones](data/vision-growingsoy/runs/v2-weeds-36-20260912T050154101573Z/report.md).

| Foto | Referencia | Contornos | Error | IoU | Tiempo |
| --- | ---: | ---: | ---: | ---: | ---: |
| GW02 | 19,3506% | 11,8406% | 7,5100 pp | 0,5762 | 7,9 s |
| GW01 | 19,6406% | 17,5002% | 2,1404 pp | 0,7445 | 7,3 s |
| GW03 | 10,2043% | 9,4265% | 0,7778 pp | 0,6151 | 10,9 s |

Es el primer resultado del proyecto con detección de malezas evaluable. En GW01 el modelo marcó la mata grande de amaranto y la pequeña del borde inferior, sin marcar la soja circundante; la diferencia con la referencia es de contorno, no de localización: usa polígonos envolventes donde la anotación sigue el borde de cada hoja, que es la limitación ya anotada como `ponytail:` en el contrato. En GW02 subestimó: 11,84% frente a 19,35%.

Los motivos devueltos citan la morfología del prompt v2 —«morfología trifoliada de la soja», «hoja ancha con bordes dentados», «hoja angosta (gramíneas)»—, lo que sugiere que las pistas discriminantes se usaron. Tres fotos no permiten atribuir la mejora al prompt: falta la comparación v1/v2 sobre el mismo conjunto y modelo.

**El control no se comprobó:** quedó en HTTP 503 como cuarta solicitud, así que la abstención ante una imagen no interpretable sigue sin verificarse con este modelo.

Camino hasta aquí: `gemini-3.8-flash` devolvió 503 en cuatro intentos y un timeout completo; `gemini-3.7-flash` también 503; `gemini-2.5-flash` respondió 404, retirado para cuentas nuevas, recomendando `gemini-3.6-flash`. El modelo quedó registrado en `run.json` y **estos resultados no son comparables con la corrida de GS08**, que usó `gemini-3.8-flash` y el prompt v1. `segment.py` acepta `--model` y `--experiment`; `--billing-acknowledged` declara que el proyecto puede facturar, sin fingir que no tiene facturación. Nada de esto acredita precisión agronómica ni generalización a otros cultivos.

### Vista de revisión integrada a la corrida — 12-sep-2026, 02:27 ART

[overlay.py](data/vision-growingsoy/overlay.py) · [comprobación](data/vision-growingsoy/check_overlay.py). Cada detección evaluable deja ahora `<ID>.review.png` junto a la máscara, generado **en la misma pasada y desde la misma máscara que el porcentaje**: en producción no hay anotación contra la cual comparar, y una vista producida aparte podría divergir de lo que se midió.

Muestra la foto recibida junto a la misma foto con las malezas en relleno translúcido y borde, más el porcentaje rotulado como estimación sin calibrar. Una máscara vacía no pinta nada: nunca dibuja un cero que el modelo no dijo.

Justifica el trabajo por sí sola en los dos casos de IoU 0. GW09 estima 0,66% frente a 1,25% de referencia —error de 0,5959 pp, aparentemente bueno— y la lámina muestra cinco manchitas sobre rastrojo y suelo, ninguna sobre una maleza. Con el número solo, esa estimación entra al score sin que nadie lo note; con la foto pintada se descarta de un vistazo. Es lo que vuelve auditable la revisión del agrónomo que el pack ya preveía.

`ponytail:` el borde se engorda hasta dos píxeles hacia afuera, así que en detecciones diminutas como las de GW09 domina visualmente y exagera la región. El porcentaje sale del relleno, no del borde. Para lectura de área a ojo, dibujar el contorno hacia adentro.

## Prueba pública preparada

[Conjunto y tabla de comparación](data/vision-growingsoy/EVALUACION.md) · [Manifiesto](data/vision-growingsoy/manifest.json) · [Prompt v1](data/vision-growingsoy/prompt.txt) · [Preparación y comprobación](data/vision-growingsoy/prepare.py).

- 15 fotos de GrowingSoy, cinco por tercio de cobertura del conjunto `labeled`; se excluye `augmented-labeled`. Se conservan los JPEG publicados, sin recortes ni recomprimir. El exportador ya los había orientado y estirado a 640×640: «original» aquí significa sin aumentos, no archivo original de cámara.
- Referencia confirmada para esta prueba: `100 × píxeles de la unión de máscaras de malezas / (ancho × alto)`. Categorías `caruru_weed` (1) y `grassy_weed` (2); `soy_plant` (3) no entra en el numerador. Cultivo, suelo, rastrojo y objetos de campo permanecen en el denominador. No usar `area` ni bounding boxes del COCO: no representan la unión de los polígonos.
- Revisión fijada: `0047fc2258c1cff54fe2c4ed325b12c9681d25be`. Se conservan las tres anotaciones COCO completas y la licencia MIT del autor en `source/`, con hashes SHA-256 en el manifiesto. Los IDs COCO son locales a cada partición: la clave incluye `train`, `valid` o `test`.
- De 1.000 imágenes se excluye `test:80`, sin anotaciones: no se interpreta como cero. Las otras 999 pasan controles estructurales de categorías, dimensiones, polígonos y coordenadas. La selección recibió además revisión técnica RGB/overlay para detectar omisiones evidentes y encuadres repetidos. El dataset no trae una marca de completitud; esta revisión no certifica la exhaustividad botánica de sus etiquetas.
- La rasterización usa Pillow 12.3.0 instalado, coordenadas redondeadas hacia abajo y polígonos rellenos en máscara binaria. Conserva una máscara PNG por foto. Es reproducible con ese método; no se presenta como rasterización oficial de COCO. Los bordes cuantizados y los polígonos aproximados introducen incertidumbre, especialmente en malezas pequeñas o entre hojas finas.

**Limitación del conjunto:** 634 de las 999 referencias elegibles son cero. Se ordenan por porcentaje, nombre de archivo y clave; se dividen por rango en tres grupos de 333. Los empates en cero atraviesan dos tercios. Por eso los rótulos son posiciones relativas, no umbrales agronómicos:

| Tercio | Rango de referencia del conjunto elegible |
| --- | ---: |
| Baja | 0–0% |
| Intermedia | 0–0,21044921875% |
| Alta | 0,210693359375–93,46728515625% |

El máximo del catálogo no fue seleccionado ni revisado visualmente. Las 15 seleccionadas van de 0 a 8,1806640625%; este lote de prueba tiene poca diversidad de cobertura y no acredita precisión en infestaciones fuertes. No cambiar tercios por umbrales inventados ni afirmar que el promedio de error es representativo de todos los cultivos. El catálogo conserva también las imágenes no seleccionadas para auditar la distribución.

Selección determinista: buscar cerca de los rangos 10/30/50/70/90% dentro de cada tercio, respetando separación de videos, un máximo de dos fotos por video y una diferencia mínima de 400 fotogramas entre ellas. Los puestos segundo y cuarto de cada tercio se reservan para evaluación final. `selection.json` fija cada elección y su rango objetivo. Los videos reservados están enumerados en `candidates()`; los clips no se comparten entre desarrollo y final. Se verifican hashes distintos y dHash con distancia mayor a 5, más inspección visual. Distancia de fotogramas no equivale a tiempo ni distancia física; pueden repetirse parcelas entre fechas, de modo que tampoco se afirma independencia por lote.

`ponytail:` esta muestra pequeña y sesgada sirve para ejecutar el protocolo y descubrir errores. Para evaluar generalización, preparar después un conjunto independiente por cultivo, lote y fecha, con cobertura más diversa y referencias revisadas por agrónomo; no basta con cambiar el nombre de cultivo del prompt.

## Ejecución y evaluación del contrato anterior de porcentajes

Este protocolo se conserva para `prompt.txt` / `prepare.py`. La prueba actual de polígonos usa el script, contrato y presupuesto de la sección anterior.

1. Separar el trabajo de preparación del ajuste del modelo. **Desarrollo:** GS01, GS03, GS05, GS06, GS08, GS10, GS11, GS13 y GS15. **Final reservada:** GS02, GS04, GS07, GS09, GS12 y GS14 (dos por tercio). El control técnico de fotos/máscaras no es una corrida de IA. No usar las seis finales, sus referencias ni sus respuestas para ajustar el prompt.
2. Elegir el modelo en una etapa posterior. Registrar proveedor, identificador exacto de modelo, fecha, configuración y versión/hash del prompt. Enviar una foto por intento y sustituir `{{CULTIVO_ESPERADO}}` por `soja`. El hash corresponde al archivo de plantilla; el cultivo usado se registra aparte. No enviar porcentajes, máscaras, overlays, tercio, referencias ni otras fotos como ejemplos. Los JPEG tienen nombres neutros GSxx.
3. Ajustar, si hace falta, solo con las nueve de desarrollo. Conservar cada versión y sus respuestas crudas. Congelar prompt y configuración antes de abrir las seis finales. Una respuesta principal por foto en cada corrida; registrar errores y reintentos en corridas separadas, sin escoger la mejor respuesta. Cambiar el prompt tras ver el resultado final exige un nuevo conjunto final independiente.
4. Guardar el JSON de cada respuesta como texto exacto en `raw_response`, o el fallo de transporte en `api_error`. El evaluador local valida tipos y rangos sin coerción. Distingue `estimated`, `not_assessable`, `respuesta_invalida`, `error_api` y `pendiente`.
5. Para cada estimación válida: `error_absoluto_pp = abs(weed_pct - reference_pct)`. El MAE es la media de esos errores sin redondear antes del cálculo. Informar desarrollo y final por separado, número de estimaciones sobre total, abstenciones, respuestas inválidas, errores de API y pendientes. Si no hay estimaciones, el MAE queda sin dato; nunca vale cero por defecto. Consultar también las filas y errores por tercio: un MAE bajo con numerosas abstenciones o referencias cero puede ser engañoso.
6. El agrónomo revisará los resultados conservando estimación original, referencia, corrección y motivo. Las correcciones no sustituyen la salida original al medir error. No agregar estas 15 fotos como si fueran puntos de un lote: la mediana se usará después en el muestreo propio. No hay umbral de aceptación ni validación agronómica establecidos.

Desde la raíz, con Python y Pillow disponibles (en esta máquina, usar `C:\Users\Tripulante\AppData\Local\Python\bin\python.exe` si el alias `python` no funciona):

```powershell
python data/vision-growingsoy/prepare.py self-check
python data/vision-growingsoy/prepare.py verify
python data/vision-growingsoy/prepare.py evaluate ruta/a/corrida.json
```

`self-check` comprueba máscaras superpuestas, denominador, cultivo excluido, anotaciones incompletas, ceros válidos, abstenciones y fallos. `verify` recalcula el catálogo y las 15 referencias desde las anotaciones, compara las máscaras y los hashes, y comprueba particiones y duplicados. No llama a ningún proveedor. `inventory`, `candidates`, `review` y `pack` reconstruyen los artefactos en ese orden; **no ejecutarlos para cambiar una selección ya congelada**. Antes de reconstruir, preservar la versión publicada y cualquier corrida.

Formato de una corrida (ejemplo de estructura, sin resultados reales):

```json
{
  "phase": "desarrollo",
  "model": "identificador-exacto",
  "provider": "proveedor",
  "date": "fecha-hora-ISO-8601",
  "expected_crop": "soja",
  "prompt_sha256": "SHA-256 del archivo prompt.txt usado",
  "results": [
    {"id": "GS01", "raw_response": "{\"status\":\"not_assessable\",\"weed_pct\":null,\"reason\":\"No puedo distinguir las plantas.\",\"limitations\":[\"Resolución insuficiente.\"]}"},
    {"id": "GS03", "api_error": "timeout"}
  ]
}
```

El evaluador rechaza IDs duplicados, desconocidos o de la otra fase; las fotos omitidas permanecen pendientes. Obtener el hash con `Get-FileHash data/vision-growingsoy/prompt.txt -Algorithm SHA256` y copiarlo en minúsculas. Guardar configuración, respuestas crudas y reporte junto a la corrida; no reemplazarla al reintentar. El helper evalúa únicamente el conjunto de soja: ampliar la evaluación a otro cultivo exige sus propias referencias.

## Casos de comprobación

| Caso | Material | Comportamiento a observar |
| --- | --- | --- |
| Confusión cultivo/maleza | GS08, soja visible y referencia 0; GS15, cultivo y malezas | No tratar toda planta verde como maleza. El cultivo esperado orienta, no garantiza identificación |
| Suelo descubierto/rastrojo | GS01 y GS11 | Mantener toda la foto en el denominador; no dividir por vegetación ni contar rastrojo como maleza |
| Superposición de hojas | GS15 y prueba sintética de máscaras del self-check | Estimar superficie visible, sin hojas ocultas ni doble conteo; reconocer límites de los polígonos de referencia |
| Imagen no interpretable | `controls/no-interpretable.png`, tarjeta uniforme generada localmente | `not_assessable` y null, con motivo. Control adicional, no integra las 15 ni el MAE |
| Respuesta inválida | self-check: JSON roto, claves repetidas/extra, string, booleano, NaN, fuera de rango, estado incompatible | Rechazar y contar aparte; no corregir a cero ni aceptar porcentajes como texto |
| Error de API / foto sin respuesta | self-check y corrida futura con fallo de transporte registrado | Contabilizar error o pendiente separado de abstención; sin porcentaje ni error numérico |

## Segunda prueba: cinco puntos propios

1. El agrónomo identifica lote/campaña y **cultivo esperado**. Planifica P1 centro interior y P2–P5 extremos dentro del polígono antes de ver resultados; registra los cinco pins. No inventar coordenadas para completar el plan.
2. En cada punto toma una foto nadir, a 0,6–1,5 m, entre 10:00 y 15:00 locales, evitando sombra del operador, desenfoque y objetos que tapen plantas. Mantener una altura elegida dentro del rango durante la recorrida y registrar la altura real; no elegir solo lugares limpios o infestados. Conservar el archivo de cámara con EXIF GPS y fecha.
3. Registrar ID P1–P5, coordenada planificada y EXIF, fecha/hora y zona, altura, nadir confirmado, nombre de archivo y autor. Comprobar distancia geográfica ≤30 m. Sin EXIF válido o fuera del protocolo: marcar pendiente/recaptura, no acreditar ubicación. Altura/nadir dependen de confirmación, no de EXIF.
4. Antes de ver la salida de IA, el agrónomo prepara la referencia por foto con el mismo denominador, idealmente con máscaras visibles de malezas; registrar herramienta, método y límites. Si solo hay estimación visual del agrónomo, identificarla como tal, no como referencia exacta por píxeles. Una foto no distinguible queda no evaluable, sin cero inventado.
5. Ejecutar el prompt congelado con el cultivo real y mantener una foto activa por punto. Registrar salidas originales, errores y revisión. Recapturar reemplaza la evidencia activa del punto y conserva el historial; no suma un sexto voto.
6. Comparar por foto antes de agregar. Tras revisión, calcular la mediana de los cinco valores válidos y mostrar cada punto y rango. Si faltan puntos, indicar cuántos de cinco: la mediana con al menos tres válidos es provisional según la propuesta existente. No declarar el muestreo completo ni extrapolar a hectáreas.

Estas fotos propias deberán guardarse en un espacio privado; no agregarlas automáticamente al conjunto público. Cada cultivo adicional necesita revisión y resultados propios; esta guía tampoco acredita por sí sola precisión agronómica.

## Muestreo y captura — confirmado

- Hack: **3–5 pins dentro del polígono**, centro + extremos. Planificar los puntos antes de analizar para no elegir después solo los resultados favorables. Sin drone.
- Tolerancia GPS: **30 m** entre EXIF GPS y pin planificado. Comprobar distancia geográfica en metros; nunca comparar diferencias de latitud/longitud con 30 directamente.
- Foto **nadir** (cámara hacia el suelo), a **0,6–1,5 m**, entre **10 y 15 h** locales de la captura, con **EXIF GPS**.
- La grilla agro ~30 × 30 m en papers es una referencia aportada por el equipo, sin paper identificado/verificado en este pack. No implementar la grilla completa en 36 h.
- V2: sesgar puntos hacia NDVI bajo/alto; mantener fuera del hack para no ampliar la primera versión.

Propuesta de colocación mínima: P1 centro interior, P2/P3 extremos opuestos y P4/P5 los otros extremos si se eligen cinco. Para polígonos cóncavos, comprobar que cada pin queda dentro; el centro de una caja envolvente puede quedar fuera. Selección manual sobre el mapa antes que un generador espacial nuevo. Las coordenadas dependen del polígono aún pendiente, no se inventan en los presets.

Propuesta de validación: servidor extrae GPS/fecha EXIF antes de quitar metadatos de la imagen enviada al proveedor. Validar coordenadas finitas y rangos geográficos; GPS ausente/inválido o distancia > 30 m deja el punto sin verificación espacial y pide recaptura. Distancia exactamente 30 m pasa la tolerancia. EXIF no prueba autenticidad: no presentarlo como antifraude. La geolocalización del navegador o una coordenada escrita a mano no sustituyen EXIF de forma silenciosa.

Altura y nadir se confirman por el agrónomo; no asumir que EXIF los acredita. Usar hora local del lote para 10:00–15:00; si la fecha EXIF no trae zona, resolverla con esa zona y registrar la suposición, o marcarla pendiente si no se conoce. Capturas fuera del protocolo permanecen identificadas y no se cuentan como fotos válidas sin una política explícita de excepción.

## Agregación por puntos

Por cada punto se conserva una foto/valor activo revisado; recapturas reemplazan el borrador de ese punto, no agregan peso extra. Un punto no evaluable o faltante no aporta 0%.

**Confirmado:** usar la mediana de los porcentajes de malezas por punto. Ordenar numéricamente; con cantidad impar tomar el central y con cantidad par promediar los dos centrales. Ejemplos: `[7,9,11] → 9`, `[7,9,11,13] → 10`, `[5,7,9,11,13] → 9`.

Propuesta: pedir al menos tres puntos distintos y completar todos los puntos planificados (3–5) para declarar el muestreo completo. Si se planificaron cinco y solo hay tres, la mediana puede mostrarse como provisional con “3/5”, sin ocultar faltantes ni certificar evidencia completa. No permitir reducir el plan a posteriori para borrar puntos desfavorables.

Separar **resultado numérico** de **evidencia fotográfica**: valores manuales/presets pueden completar una simulación numérica, pero solo fotos que cumplen el protocolo y tienen evaluación revisada completan evidencia real. Una corrección manual de una foto válida conserva su vínculo y autor; un slider sin foto no acredita captura. Una evaluación mixta muestra fuente por punto y estado global incompleto/simulado según corresponda.

`ponytail:` 3–5 puntos y su mediana son una simplificación del hack; no garantizan representatividad de todo el lote y pueden ocultar focos de malezas. Mostrar también valores por punto y rango mínimo/máximo. La mejora posterior es revisar el muestreo con agrónomo y estratificar por NDVI (v2), no afirmar precisión de una grilla que no se ejecutó.

## Qué entrega la IA

Una estimación orientativa del porcentaje de toda la foto cubierto por malezas visibles, con **foto RGB y cultivo esperado como entrada**. Esta definición del porcentaje está **confirmada para la prueba**; incluye cultivo y suelo en el denominador y debe mantenerse igual en el prompt y en los futuros controles manuales. La utilidad agronómica y la precisión siguen pendientes de evaluación. El contrato sirve para distintos cultivos; GrowingSoy prueba únicamente soja.

No convertir el valor directamente en porcentaje de las 100 ha: la foto no acredita muestreo representativo. Para el MVP se usa como señal de la muestra en una heurística demo de condición del lote, mostrando esa limitación. No estimar rendimiento, solvencia, dinero ni score mediante el modelo.

Los nombres de modelo provienen del update, no de una evaluación realizada. Elegir uno al implementar y verificar disponibilidad, entrada de imagen y formato de salida en su documentación oficial. No se fijan precios, SDK, endpoint ni versión de Gemini sin verificar. No hace falta integrar dos proveedores ni construir un router; el fallback requerido es manual/presets.

## Flujo propuesto

1. Agrónomo selecciona lote/campaña y uno de los 3–5 puntos planificados; carga foto con cultivo y fecha. Mostrar protocolo, vista previa y que se enviará al proveedor configurado.
2. Servidor verifica sesión, permiso sobre el lote, archivo, punto y EXIF GPS. Una foto por solicitud; sin aceptar URLs arbitrarias para descargar imágenes.
3. Servidor llama al modelo con la foto y el contexto; la clave permanece en servidor.
4. Validar respuesta. Si es evaluable, presentar % y limitaciones al agrónomo. Si no lo es, ofrecer otra foto o fallback.
5. Agrónomo confirma la estimación o registra valor manual. Propuesta: publicar solo después de esa revisión; editar genera borrador y no modifica lo que ya ve el partner.
6. Repetir por punto; servidor calcula mediana, estado de evidencia y score con la fórmula compartida. Publicar una revisión del conjunto con evidencia y procedencia. Partner consulta esa revisión.

## Contrato lógico de resultado

Es el contrato mínimo de la prueba, independiente del SDK; no afirmar que un proveedor devuelve estos campos por defecto. En la presentación, `estimated` significa «estimada» y `not_assessable`, «no evaluable».

```json
{
  "status": "estimated",
  "weed_pct": 18,
  "reason": "Estimación visual orientativa de la superficie visible.",
  "limitations": ["Una foto no acredita cobertura de todo el lote."]
}
```

Ejemplo ilustrativo, no inferencia real ni dato calibrado. Para una imagen no evaluable: `status = "not_assessable"`, `weed_pct = null` y un motivo legible. No incorporar un número de confianza inventado como probabilidad calibrada. El campo `confidence` que sí se emite está medido y no es una probabilidad: ver «Nivel de confianza medido».

Validación de servidor: estado permitido; % numérico finito entre 0 y 100 solamente si `estimated`; null si `not_assessable`; motivo y limitaciones con longitud acotada. Rechazar JSON roto, tipo incorrecto, campos incompatibles o contenido extra fuera del esquema acordado. No convertir strings, null o valores fuera de rango en un éxito silencioso.

El servidor agrega autor, lote/campaña, ID de punto e intento, ID de evidencia, fechas, GPS extraído, distancia/estado de protocolo, proveedor/modelo, versión de prompt y origen. Esos metadatos no los determina el modelo. Fecha de captura declarada no equivale a verificación de ubicación o antigüedad.

## Instrucción de visión de la prueba

La versión canónica completa está en [prompt.txt](data/vision-growingsoy/prompt.txt). Sustituir `{{CULTIVO_ESPERADO}}` por el cultivo informado; para las 15 fotos públicas, `soja`. No inferir ese contexto silenciosamente ni llamar «malezas» a toda la vegetación.

El prompt incluye el contrato concreto. Su redacción no sustituye validación de salida ni revisión agronómica. El modelo no recibe herramientas de escritura o financieras.

## Límites operativos propuestos

- JPEG/PNG decodificables, máximo 10 MiB y 20 megapíxeles por archivo, una foto por intento. Validar contenido real y dimensiones en servidor; no confiar solo en extensión o MIME declarado. Límites del MVP, no afirmaciones sobre límites del proveedor.
- Timeout de 30 segundos como valor inicial configurable, sin reintentos automáticos en bucle. Impedir solicitudes simultáneas duplicadas del mismo intento y limitar llamadas por usuario en servidor.
- Subidas privadas; identificadores generados por servidor; no usar el nombre del archivo como ruta. Evitar registrar fotos, base64 y credenciales en logs. Extraer y conservar GPS/fecha requeridos en la evidencia privada antes de quitar metadatos innecesarios de la copia enviada al proveedor.
- Usar el mecanismo de imagen y validación que ya ofrezca el stack elegido. Revisar dependencias solo si falta una capacidad necesaria para validar/decodificar con seguridad.
- Conservar la evidencia de una evaluación publicada mientras sea necesaria para la demo; definir retención al decidir persistencia/despliegue. No prometer anonimización ni políticas del proveedor no verificadas.

## Fallback y estados

| Situación | Comportamiento |
| --- | --- |
| Sin clave, sin red, timeout, cuota o error del proveedor | Mensaje breve y acción para otra foto/reintentar o usar modo manual |
| Imagen no evaluable | Explicar motivo; no establecer 0% |
| Archivo inválido o demasiado grande | Rechazar antes de llamar al proveedor; conservar evaluación publicada |
| GPS ausente/inválido, fuera de 30 m o protocolo incompleto | Pedir recaptura; no contar como foto válida. Fallback queda identificado y no elimina esta falta |
| Respuesta fuera del contrato | Tratar como error; no alimentar el cálculo |
| Slider | Rango 0–100 por punto con entrada numérica accesible; `source = manual`, autor y motivo; mediana compartida |
| Preset | `source = preset`, ID de escenario y punto, rótulo “Escenario simulado / estimado”; sin acreditar fotos |
| Corrección del agrónomo | Mantener resultado IA original; valor usado como manual y explicación de la corrección |
| Nueva foto mientras llega una respuesta anterior | Asociar resultado al punto e ID de intento; no sobrescribir su borrador más reciente |

No activar fallback silenciosamente. El agrónomo elige y publica; partner no puede usar controles ni endpoints de escritura. Un error de autorización no se convierte en permiso mediante fallback.

`weed_pct = 0` es válido solo como estimación/entrada explícita de cero malezas; ausencia o error es null/sin resultado. Si no hay evidencia suficiente para la fórmula, mostrar estado sin datos según política acordada, sin inventar una evaluación verde.

## Relación con el score

IA, manual y preset producen valores por punto con origen identificable y una mediana compartida. Satélite se mantiene: `score = 0.60 × componente_ndvi + 0.25 × componente_lluvia + 0.15 × componente_malezas`, todos normalizados a 0–100. Propuesta para malezas: `100 - mediana`. Las normalizaciones de NDVI/lluvia están pendientes; no deducirlas de dos presets ni garantizar que cualquier foto bajará el semáforo a rojo.

**Sin fotos → no verde pleno para el segundo desembolso**, incluso si un score por presets es ≥ 70. Mantener score y estado de evidencia como campos distintos. Propuesta operativa: segundo y posteriores desembolsos pendientes hasta completar fotos válidas; la posibilidad de una vía amarilla limitada queda a confirmar. La demo offline puede mostrar el bloqueo por falta de fotos y luego el rechazo por rojo, sin falsificar un estado de captura válida.

La política financiera consume la evaluación publicada vigente; no la respuesta cruda del proveedor. Los límites y tasas siguen siendo reglas deterministas. Un rechazo de desembolso ocurre al intentar la operación en el simulador/contrato, no porque la IA haya ejecutado una transacción.

## Cómo validar al implementar

1. Ejecutar el flujo con una foto evaluable y otra borrosa/no pertinente; guardar el resultado real con modelo y fecha, sin afirmar precisión agronómica por estas dos pruebas.
2. Comparar estimaciones de fotos representativas con revisión del agrónomo antes de describir calidad del modelo; no hay tolerancia de error acordada todavía.
3. Comprobar permisos de escritura también por solicitud directa del partner, sin confiar en la UI.
4. Forzar timeout y respuesta inválida; verificar fallback explícito, procedencia y conservación de la publicación anterior.
5. Publicar igual porcentaje y contexto mediante IA y manual; comprobar mismo cálculo, distintas fuentes. Verificar que aumentar malezas no aumenta score con otras entradas iguales.
6. Probar doble clic/respuesta atrasada y confirmar que no publica dos veces ni reemplaza una foto nueva.
7. Comprobar mediana con 3, 4 y 5 puntos, duplicados, un faltante y uno no evaluable; no promediar todos los puntos ni insertar ceros.
8. Comprobar GPS a 29,9 m, 30 m y 30,1 m; EXIF ausente; pin fuera de polígono; captura fuera de horario; confirmaciones de altura/nadir pendientes.
9. Un score alto sin fotos completas no habilita verde pleno para el segundo desembolso. Los presets conservan esa restricción incluso si completan cinco valores.

## Presets locales P1–P5

[data/photo-point-presets.json](data/photo-point-presets.json) contiene dos escenarios sintéticos nuevos: bueno `[5,7,9,11,13]` (mediana 9%) y malo `[18,22,26,30,34]` (mediana 26%). Los números se eligieron para reproducir las medianas de malezas del JSON histórico; no provienen de fotos ni de una ejecución IA.

Los cinco IDs corresponden a posiciones lógicas pendientes de ubicar en el polígono. No incluyen imagen, EXIF ni coordenadas inventadas. “Bueno/malo” describe carga relativa de malezas, no un semáforo financiero garantizado. No asociar los escenarios a febrero/agosto como deterioro real.

El recorrido con presets valida la demo offline. La integración real de visión requiere credenciales, fotos y una llamada completada; son verificaciones diferentes y ambas deben informarse por separado.

## Nivel de confianza medido

`confidence` es el **IoU esperado** contra una anotación humana: cuánto del área que el modelo pinta cae de verdad sobre maleza. No es probabilidad de acierto ni certeza del modelo. Sale de las 9 fotos de desarrollo (`gemini-3.6-flash`, prompt v2); implementación en [`data/vision-growingsoy/confidence.py`](data/vision-growingsoy/confidence.py).

**El predictor es el parche más grande detectado, no el porcentaje total.** El modelo resuelve matas grandes y falla en malezas chicas; el parche mayor mide eso y el total no, porque un total alto puede venir de sumar manchitas — que es justo la forma de los fallos. Correlación de rango con el IoU medido: parche mayor +0,767; total estimado +0,650; mediana de parches +0,533; cantidad de parches −0,317.

Se descartó un cuarto candidato: la cantidad de limitaciones que el modelo declara daba −0,867, pero es un espejismo — 7 de las 9 fotos declaran exactamente una limitación y el rango queda dominado por empates.

Curva: `0,05 + 0,60 · t/(t + 2,05)`, con `t` = parche mayor en % de la imagen. RMSE 0,168 sobre las 9. El techo 0,65 es la media medida del grupo alto, no el mejor caso: no se promete más de lo medido aunque el parche sea enorme.

| Foto | parche % | confianza | IoU real |
| --- | ---: | ---: | ---: |
| GW01 | 16,45 | 0,58 | 0,744 |
| GW02 | 11,73 | 0,56 | 0,576 |
| GW03 | 7,75 | 0,52 | 0,615 |
| GW05 | 2,73 | 0,39 | 0,272 |
| GW06 | 2,38 | 0,37 | 0,601 |
| GW04 | 2,08 | 0,35 | **0,000** |
| GW08 | 1,14 | 0,26 | 0,377 |
| GW07 | 0,41 | 0,15 | 0,228 |
| GW09 | 0,17 | 0,10 | **0,000** |

**La curva no atrapa el peor fallo.** GW04 recibe 0,35 con IoU 0 real. Siete de los nueve residuos son negativos —la curva promete menos de lo que el modelo dio—, y las dos excepciones son justamente las dos fotos que erraron por completo. Por eso el contrato manda además la foto pintada: el número solo no alcanza para descartar un GW04.

Sin medir: una foto con muchos parches medianos, donde parche mayor y total se separan por primera vez y ninguna medición dice cuál gana. Tampoco hay foto sin maleza en el conjunto, así que una respuesta «no hay maleza» no tiene calibración y sale como banda `sin_calibrar`, no como confianza baja.

Pendiente: revalidar contra el conjunto final (GW10–GW13 más las congeladas) antes de tratar estos números como estables. n=9, un modelo, un cultivo, un dataset.
