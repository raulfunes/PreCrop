# Resultados del visor sobre ocho imágenes generadas

Fecha: 12-sep-2026, 10:14–10:21 ART  
Modelo: `gemini-3.6-flash`  
Cultivo esperado: soja  
Modo: backend real con la clave local y `--free-project-confirmed`

Las categorías "poca", "media" y "alta" describen la intención usada para generar las imágenes. No son referencias agronómicas ni máscaras humanas. El porcentaje del visor es la unión de los polígonos que predijo el modelo dividida por la superficie completa de la foto.

| Punto | Imagen | Malezas | Soja | Confianza | Estado |
| --- | --- | ---: | ---: | ---: | --- |
| P1 | `soja-punto-fuga-pocas-malezas.jpg` | — | — | — | `provider_error`: HTTP 503 en ambos intentos |
| P2 | `soja-brotes-jovenes-01.jpg` | 0,18 % | — | 0,10 · baja | Evaluada; una plántula aislada |
| P3 | `soja-brotes-jovenes-02.jpg` | 0,08 % | — | 0,07 · baja | Evaluada; una plántula aislada |
| P4 | `soja-brotes-jovenes-borde-lote.jpg` | 0,00 % | — | 0,00 · sin calibrar | Evaluada; excluyó la vegetación exterior del margen |
| P5 | `soja-brotes-maleza-media-01.jpg` | 13,58 % | — | — | El backend terminó y creó el overlay; el proxy web perdió la respuesta por timeout |
| P6 | `soja-brotes-maleza-media-alta-02.jpg` | 11,41 % | 19,45 % | 0,43 · baja | Evaluada |
| P7 | `soja-brotes-maleza-alta-03.jpg` | — | — | — | `provider_error`: HTTP 429; dos reintentos también recibieron 429 |
| P8 | `soja-brotes-maleza-alta-borde-lote-04.jpg` | — | — | — | `provider_error`: HTTP 429 |

## Overlays válidos

- [P2](../api/reviews/5bf45c00aaf048058cfd7aaed2af3491.png)
- [P3](../api/reviews/31c12fe42dfd4490ae5468635d58e61d.png)
- [P4](../api/reviews/e50ecef867b7412ba0b65650fc661066.png)
- [P5](../api/reviews/0287b1dc2a054bf09ec5a9e59d2c9c61.png)
- [P6](../api/reviews/663ef55bec9949c8b0e3c40cc1a3f80e.png)

`api/reviews/` es un directorio de ejecución ignorado por Git. La lámina resumen conservada con los recursos del proyecto es `public/images/resultados-visor-8-imagenes.jpg`.

## Lectura de la prueba

- Las tres imágenes limpias evaluadas quedaron entre 0,00 % y 0,18 %. P4 es un caso útil: el modelo reconoció la vegetación alta del costado como exterior al lote y no la contó.
- Las dos imágenes infestadas que sí terminaron quedaron en 13,58 % y 11,41 %. La inspección de los overlays muestra que el modelo marca algunos parches grandes y omite numerosas malezas pequeñas, especialmente hacia el punto de fuga.
- El orden no fue monotónico: la imagen generada como media-alta produjo 11,41 %, menos que los 13,58 % de la imagen media. Estas etiquetas visuales no sirven como verdad de referencia y el ángulo reduce el tamaño aparente de la vegetación lejana.
- La cobertura de soja no está calibrada. Falló en P2–P5 y sólo apareció en P6 (19,45 %), por lo que no conviene usarla como métrica de calidad de esta prueba.
- Cinco de ocho fotos dejaron evidencia visual; tres no tienen estimación por saturación o cuota del proveedor. Los errores no se convierten en cero.

Antes de valorar precisión se necesitan máscaras humanas sobre estas mismas imágenes. Esta corrida sólo permite revisar comportamiento y fallos del visor.

## Piloto pago con Gemini 3.8 Flash

Fecha: 12-sep-2026, 10:39 ART
Alcance autorizado: dos solicitudes, sólo malezas, sin reintentos
Imágenes: P2 (limpia) y P6 (maleza media-alta)

Las dos solicitudes llegaron al endpoint de `gemini-3.8-flash`, pero Google respondió `HTTP 503 UNAVAILABLE`: el modelo estaba experimentando alta demanda y recomendó intentar más tarde. No hubo candidatos, `usageMetadata`, máscaras ni porcentajes. El costo calculable con la respuesta fue USD 0,000000.

[Corrida, respuestas crudas saneadas y lámina](../data/vision-growingsoy/runs/generated-weeds-38-paid-p2-p6-20260912T133933663054Z/report.md). El resultado no permite comparar precisión con `gemini-3.6-flash`; sólo confirma que 3.8 no estuvo disponible durante esta ventana. No se hicieron reintentos para respetar el máximo de dos pruebas.

### Gemini 3.1 Pro Preview

Fecha: 12-sep-2026, 10:52 ART
Alcance autorizado: P2 y P6, sólo malezas, dos solicitudes sin reintentos

Las dos solicitudes devolvieron `HTTP 429 RESOURCE_EXHAUSTED`. Google identificó las cuotas como `generate_content_free_tier_*`, con límite cero para `gemini-3.1-pro`. Esto confirma que la clave de `.env` no tuvo acceso pago durante las solicitudes. La opción local `--billing-acknowledged` registra autorización para generar gasto, pero no activa la facturación del proyecto en Google AI Studio.

No hubo candidatos, `usageMetadata`, máscaras ni porcentajes; el costo calculable fue USD 0,000000. [Corrida y respuestas saneadas](../data/vision-growingsoy/runs/generated-weeds-paid-gemini-3-1-pro-preview-p2-p6-20260912T135202845417Z/report.md). Para medir la calidad de Pro primero hay que vincular la facturación al proyecto dueño de esta clave o reemplazarla por una clave de un proyecto con nivel pago.

### Segundo intento con Gemini 3.8 Flash

Fecha: 12-sep-2026, 10:59 ART
Alcance autorizado: P2 y P6, sólo malezas, dos solicitudes sin reintentos

P2 devolvió `HTTP 503 UNAVAILABLE` por alta demanda. P6 sí fue evaluada: **9,13 % de malezas**, confianza calibrada 0,33 (baja), 2083 tokens de entrada y 1161 de salida. A la tarifa paga publicada, ese consumo equivale a USD 0,005916; la respuesta no acredita que se haya cobrado y la clave venía operando en free tier.

En la misma P6, `gemini-3.6-flash` había estimado 11,41 %. La nueva estimación baja 2,28 puntos porcentuales y el overlay de 3.8 todavía omite numerosas malezas pequeñas y gramíneas visibles. No hay una mejora clara; sin máscara humana tampoco se puede decidir cuál de los dos contornos es más preciso. [Corrida, overlay y comparación 3.6/3.8](../data/vision-growingsoy/runs/generated-weeds-paid-gemini-3-8-flash-p2-p6-20260912T135902467963Z/report.md).

## Piloto con Codex

Fecha: 12-sep-2026, 11:29 ART
Modelo: `gpt-6-astra` mediante Codex CLI y sesión de ChatGPT
Alcance: P2 y P6, sólo malezas, dos ejecuciones sin reintentos

Las dos ejecuciones terminaron correctamente. P2, generada como limpia, quedó en **0,00 %**; Codex consideró ambigua una plántula aislada y no la marcó sólo por estar en el entresurco. P6 quedó en **5,85 %**, frente a 11,41 % con Gemini 3.6 Flash y 9,13 % con Gemini 3.8 Flash.

En la revisión visual de P6, Codex produjo contornos mucho más ajustados a hojas y gramíneas individuales que los parches amplios de Gemini. También dejó sin marcar malezas pequeñas y vegetación del fondo, de modo que el menor porcentaje no demuestra mayor precisión y probablemente subestima la cobertura visible. Se necesitan máscaras humanas para decidir cuál resultado es mejor.

La CLI reportó 45.872 tokens de entrada, 3.941 de salida y 898 de razonamiento entre ambas ejecuciones. P2 tardó 17,0 s y P6 151,6 s. La sesión de ChatGPT no expuso un costo monetario por ejecución. A este ritmo, procesar 20 imágenes sería posible como evaluación por lotes, pero consumiría bastante cuota y podría tardar decenas de minutos.

[Corrida, JSON, máscaras y lámina de revisión](../data/vision-growingsoy/runs/generated-weeds-codex-p2-p6-20260912T142906849121Z/report.md).
