# PreCrop — instrucciones para Claude

## Estado y tarea

Este repositorio contiene el pack de análisis y diseño de PreCrop. Al 11-sep-2026 no hay aplicación, dependencias ni contratos implementados. La tarea actual es preparar y revisar las bases; no interpretar estos documentos como autorización para construir o desplegar.

La preparación de fotos autorizada agrega `data/vision-growingsoy/`: 15 imágenes públicas, referencias, prompt y un helper Python que usa Pillow ya instalado. No es código de aplicación. Entrada general confirmada: foto + cultivo esperado; evaluación inicial solo en soja. Leer el protocolo y la separación desarrollo/final en `VISION-IA.md` antes de usar imágenes o ajustar prompts. No usar las seis fotos finales para ajuste.

Leer en orden:

1. [PRECROP-LEER-ESTO.md](PRECROP-LEER-ESTO.md): producto, alcance vigente, análisis, diseño y pendientes.
2. [VISION-IA.md](VISION-IA.md): muestreo de 3–5 puntos, captura, Visión IA y mediana de malezas.
3. Documento histórico `PreCrop — Léelo de arriba hacia abajo (v2 Raúl) 3d62788a52d0815b889bed56b68aba7c.md`: narrativa y política financiera original.
4. [SOURCES.md](SOURCES.md), [lote-sentinel-presets.json](lote-sentinel-presets.json) y [data/photo-point-presets.json](data/photo-point-presets.json): procedencia declarada y datos disponibles.

## Precedencia

La instrucción actual del usuario prevalece. El **UPDATE Builder 11-sep** incorpora Visión IA al MVP y reemplaza la exclusión histórica de “CV real” para la estimación mediante un modelo existente. Partner es solo lectura. Slider y presets siguen disponibles como fallback explícito.

El usuario confirmó que los dos documentos del pack no existían y amplió los requisitos en esta sesión. Esta base se redactó desde cero con esas instrucciones y los archivos presentes; no hay originales pendientes de localizar.

## Cómo trabajar

- Entender el flujo completo y buscar todos los consumidores antes de cambiar una función o regla. Corregir la causa compartida.
- Antes de escribir código: comprobar si hace falta; reutilizar lo existente; preferir biblioteca estándar, plataforma o dependencia instalada; escribir el mínimo restante.
- Sin abstracciones, dependencias, monorepo ni servicios adicionales por anticipación. La estructura del documento histórico es sugerida, no existente.
- Distinguir requisitos confirmados, propuestas de diseño y decisiones pendientes. No inventar calibración agronómica, credenciales, coordenadas ni resultados de IA.
- Un atajo con límite conocido lleva comentario `ponytail:` con su techo y siguiente paso.
- Al implementar lógica no trivial, dejar una comprobación ejecutable mínima que falle si se rompe. Reutilizar el runner disponible; no añadir un framework solo para eso.
- Preservar cambios locales ajenos. La eliminación de `README.md` ya existía al preparar este pack; no restaurarlo automáticamente.

## Invariantes

- Producto: evidencia y score de condición del cultivo para cooperativas/bancos/fintechs. Score no es probabilidad de cobro ni precio de token.
- Agrónomo carga evidencia y publica evaluaciones; partner consulta. Comprobar permisos en servidor, no solo ocultar botones.
- IA estima malezas por punto; la mediana agrega 3–5 puntos. Fotos nadir a 0,6–1,5 m, de 10 a 15 h, EXIF GPS y tolerancia de 30 m. Sin drone ni CNN propia.
- Satélite se mantiene: componentes NDVI/lluvia/malezas con pesos 0,6/0,25/0,15. Faltan normalizaciones; no sumar unidades crudas.
- Una función determinista calcula score/cupo; reglas explícitas controlan desembolsos simulados. Sin fotos, no hay verde pleno para el segundo desembolso; presets no acreditan fotos reales.
- No sustituir fallos de IA por cero malezas ni presentar presets como inferencia real.
- Rojo (`score < 50`) bloquea nuevos desembolsos. Sin datos vigentes, quedan pendientes. Una caída no borra deuda ni tokens.
- Interés demo: 10% simple sobre capital efectivamente desembolsado. Devolver fondos no usados al liquidar.
- Fondos, aportes y tokens: siempre MOCK/testnet. El partner no opera el simulador financiero.
- No usar febrero de 2025 frente a agosto de 2024 en barbecho como prueba de deterioro de una misma cosecha.

## Primera tarea al retomar

La prueba pública está preparada, sin corridas de modelo. Al retomar, seguir el protocolo de `VISION-IA.md`: elegir modelo y criterios de precisión en una etapa posterior, preservar las seis fotos finales y registrar resultados sin convertir fallos en cero. La integración de la aplicación y las decisiones pendientes del producto siguen siendo trabajo posterior.
