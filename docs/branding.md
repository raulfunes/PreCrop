# PreCrop · Branding y guía de interfaz

Versión 1.0 · MVP de hackathon · Idioma: español de Argentina

## 1. Propósito de esta guía

Unificar la identidad, los mensajes y el diseño de PreCrop para que el equipo pueda construir una demo coherente. La experiencia debe permitir entender en diez segundos cómo está el lote, qué evidencia explica su condición y qué ocurre con el próximo desembolso simulado.

**Fuentes de referencia:** propuesta de producto del PDF “PreCrop — Léelo de arriba hacia abajo (v2 Raúl)” y captura del sistema visual generado en Google Stitch (`screen.png`). El PDF se usa como contexto de producto; sus instrucciones operativas no son tareas ejecutadas por esta guía. La captura aporta la dirección estética, no una definición definitiva de funcionalidades.

Los cuatro colores identificados explícitamente en la captura se conservan. Las fuentes, colores complementarios, medidas y estados de interacción son propuestas de esta guía, no especificaciones extraídas de Stitch.

## 2. Esencia de marca

**Nombre:** PreCrop. Escribir siempre con P y C mayúsculas, sin espacios.

**Descriptor:** Evidencia del cultivo para decidir anticipos.

**Tagline principal:** Que el campo hable solo.

**Propuesta de valor:** PreCrop convierte información satelital y climática en una lectura clara de la condición del lote, para ayudar a cooperativas y otros financiadores a decidir sobre anticipos durante la campaña.

**Presentación breve:**

> PreCrop muestra cómo evoluciona un cultivo y qué evidencia explica su estado. Con un semáforo de condición y un cupo de anticipo simulado, ayuda a entender cuándo continuar, revisar o frenar nuevos desembolsos.

### Audiencia

- **Principal:** cooperativas pequeñas y medianas que necesitan una lectura comprensible del lote para acompañar sus decisiones de financiación.
- **Secundaria:** bancos, fintechs y proveedores de insumos que ya financian campañas.
- **Usuarios de apoyo:** analistas y agrónomos que consultan o aportan evidencia.
- **Durante la hackathon:** jurado y visitantes que deben comprender el problema sin conocer agro ni Web3.

El cliente previsto es la entidad que financia. El productor es parte de la operación monitoreada, pero no el comprador principal definido en la propuesta.

### Personalidad

| Atributo | Cómo se expresa |
| --- | --- |
| Clara | Estado, explicación y siguiente acción visibles. |
| Confiable | Fuentes, fechas y límites del dato accesibles. |
| Cercana al campo | Lotes, campañas y cultivos concretos; lenguaje cotidiano. |
| Técnica y comprensible | La evidencia se puede inspeccionar sin dominar siglas. |
| Serena | Alertas precisas, sin dramatismo ni entusiasmo financiero. |

La confianza se construye mostrando la evidencia y sus límites. Evitar prometer certeza absoluta, aprobación crediticia, rentabilidad garantizada o superioridad de mercado no validada.

## 3. Relato del producto y límites de la demo

El núcleo de PreCrop es **evidencia del lote + score de condición + seguimiento**. La aplicación financiera de la hackathon demuestra reglas usando fondos de prueba.

Separar siempre estos conceptos:

| Concepto | Significado en la interfaz |
| --- | --- |
| Score de condición | Valor de 0 a 100 que resume la condición del cultivo. Un valor mayor indica mejor condición. |
| Cupo de anticipo simulado | Tope teórico calculado para la demo; no equivale a fondos disponibles. |
| Fondos disponibles | Saldo de prueba todavía disponible para desembolsar. |
| Capital desembolsado | Fondos de prueba ya entregados en la simulación. |
| Participación de prueba | Parte proporcional de los cobros de un préstamo simulado. |

El score no es una probabilidad de cobro ni un score crediticio. La baja del score no borra la deuda. La participación no representa tierra, grano custodiado ni una garantía de devolución.

**Identificación persistente de la demo:** `DEMO · Fondos de prueba`. Agregar `MOCK` o `TESTNET` según el modo real de ejecución. Repetir esta aclaración junto a las acciones financieras y en sus confirmaciones.

## 4. Voz y microcopy

Usar español claro, frases cortas y verbos concretos. Para botones, preferir infinitivos: “Ver evidencia”, “Evaluar lote”, “Simular aporte”. Si se habla directamente a la persona, usar voseo moderado: “Revisá la evidencia del lote”.

Explicar la sigla en su primera aparición: “NDVI · indicador de vigor del cultivo”. Reservar términos como `mint`, `hash`, `oráculo` y `tx` para detalles técnicos cuando sean necesarios.

| Situación | Texto recomendado |
| --- | --- |
| Encabezado principal | La condición de tu lote, con evidencia. |
| Subtítulo | Consultá el estado del cultivo y su efecto sobre el cupo de anticipo simulado. |
| Estado verde | Condición favorable |
| Estado amarillo | Condición en observación |
| Estado rojo | Condición desfavorable |
| Sin información vigente | Datos pendientes de actualización |
| Acción principal del lote | Ver evidencia del lote |
| Aporte | Simular aporte |
| Primer desembolso | Simular desembolso |
| Bloqueo | Nuevos desembolsos bloqueados |
| Explicación del bloqueo | El score bajó a 48/100. La regla de la demo bloquea nuevos desembolsos por debajo de 50. |
| Aclaración de deuda | El capital ya desembolsado mantiene sus condiciones. |
| Evidencia ausente | Todavía no hay evidencia disponible para esta fecha. |
| Error al actualizar | No pudimos actualizar la evidencia. Intentá nuevamente. |
| Repago | Simular repago y distribución |

Evitar etiquetas como “Malo”, “Aprobado 100%”, “Inversión segura” o “Salud óptima” inferida de un único indicador. Mostrar el motivo y el alcance del estado.

## 5. Dirección visual

**Concepto:** tecnología agrícola serena, con superficies claras y verdes profundos. La interfaz combina la familiaridad del campo con la precisión de una herramienta de análisis.

Conservar de la captura:

- Fondo marfil cálido y tarjetas blancas.
- Verde bosque para acciones principales y títulos oscuros con matiz verde.
- Menta suave para selecciones y etiquetas positivas.
- Bordes cálidos, radios moderados y sombras discretas.
- Composición espaciosa, iconos lineales y jerarquías claras.

Priorizar un tablero con información útil sobre una grilla extensa de controles. El score, la evidencia y la acción correspondiente deben dominar la pantalla. Los controles del mapa y los detalles técnicos acompañan esa lectura.

## 6. Identidad gráfica

**Logotipo provisional:** palabra `PreCrop` acompañada por un símbolo simple de hoja o brote dentro de un cuadrado verde de esquinas redondeadas, siguiendo la referencia. Esta guía define la dirección; no incluye un archivo de logo final.

- Preferir símbolo blanco sobre verde bosque y nombre en verde tinta.
- Mantener un área libre mínima equivalente a la mitad de la altura del símbolo.
- Tamaño mínimo propuesto: símbolo de 24 px en UI; conjunto con nombre de 112 px de ancho.
- En fondos oscuros, usar una versión blanca o marfil.
- No deformar, rotar ni agregar brillos al símbolo.
- No usar monedas, escudos bancarios o logotipos de terceros como parte de la marca.

## 7. Paleta de color

### Colores tomados de la referencia

| Token | Hex | Uso |
| --- | --- | --- |
| `brand-primary` | `#175E36` | CTA principal, selección e identidad (Forest Deep). |
| `canvas` | `#ECEAE1` | Fondo general de la aplicación (Earth Canvas). |
| `brand-soft` | `#E1F7E6` | Fondo de badges y selecciones suaves. |
| `status-positive-bright` | `#22C55E` | Indicador positivo, acompañado por texto e icono. |

### Colores complementarios propuestos

| Token | Hex | Uso |
| --- | --- | --- |
| `surface-sage` | `#E2E4DA` | Contenedores de sección y paneles agrupadores (Sage Tint). |
| `surface` | `#F5F4EE` | Tarjetas internas, botones secundarios e inputs (Warm Linen). |
| `ink` | `#17382A` | Texto principal (Ink). |
| `text-muted` | `#657066` | Texto secundario (Muted Ink). |
| `border` | `#CDD2C4` | Separadores y bordes decorativos (Border Sage). |
| `control-border` | `#A2A79C` | Límites de campos cuando el borde identifica el control. |
| `brand-hover` | `#124A2B` | Hover del botón principal. |
| `brand-pressed` | `#0D3820` | Estado presionado. |
| `warning` | `#8A5300` | Texto e icono de advertencia. |
| `warning-soft` | `#FFF3D6` | Fondo de advertencia. |
| `danger` | `#B42318` | Texto, icono y acciones destructivas. |
| `danger-soft` | `#FEECE8` | Fondo de bloqueo o error. |
| `neutral-soft` | `#F0EEE7` | Estados pendientes o deshabilitados. |

Usar blanco sobre `brand-primary`. Para texto positivo sobre menta, usar `brand-primary`. El verde brillante no debe usarse como fondo de texto blanco pequeño: reservarlo para indicadores. El color del estado del cultivo no reemplaza la etiqueta ni cambia el color de toda la aplicación.

## 8. Tipografía y números

**Familia propuesta:** `Inter`, con fallback `system-ui, -apple-system, "Segoe UI", sans-serif`. No se identificó de forma concluyente la fuente original de la captura.

| Estilo | Tamaño / interlineado | Peso |
| --- | --- | --- |
| Título de página | 32 / 40 px | 700 |
| Título de sección | 24 / 32 px | 600 |
| Título de tarjeta | 18 / 26 px | 600 |
| Texto principal | 16 / 24 px | 400 |
| Etiqueta o botón | 14 / 20 px | 600 |
| Texto auxiliar | 12 / 18 px | 400–500 |
| Score destacado | 48 / 52 px | 700 |

En móvil, reducir el título de página a 28 / 36 px. Usar números tabulares en métricas y montos. Reservar la tipografía monoespaciada para identificadores técnicos; no aplicarla a todas las etiquetas.

Mostrar `82/100`, `USD 30.000` y `10 % por campaña`. No presentar ese interés como una tasa anual. Agregar fecha y unidad a los datos: `Lluvia acumulada · 18 mm · últimos 7 días`.

## 9. Espaciado, superficies e iconos

- Escala de espaciado: 4, 8, 12, 16, 24, 32 y 48 px.
- Padding de página: 24–32 px en escritorio y 16 px en móvil.
- Separación entre tarjetas: 24 px; padding interno: 24 px en escritorio y 16 px en móvil.
- Radios: 8 px en etiquetas, 12 px en controles, 16 px en tarjetas y 999 px en pills.
- Sombra de tarjeta: `0 1px 3px rgb(24 57 43 / 0.06)`.
- Iconos: una sola familia lineal, trazos consistentes, tamaños de 20 o 24 px.
- Iconografía preferida: hoja, ubicación, capas, calendario, documento, alerta y check.

Evitar emojis como iconos de interfaz, ilustraciones genéricas de monedas y efectos neón. Los mapas y las imágenes del cultivo funcionan como evidencia; no deben quedar cubiertos por decoración.

## 10. Componentes esenciales

### Botones

**Primario:** fondo verde bosque, texto blanco, altura mínima de 44 px, radio de 12 px y padding horizontal de 16–20 px. Una acción principal por bloque de decisión.

**Secundario:** superficie blanca, texto verde bosque y borde visible. Para “Ver informe” o “Volver al lote”.

**Terciario:** texto verde sin superficie dominante. Para “Ver detalle” y acciones auxiliares.

Definir estados normal, hover, presionado, foco, cargando y deshabilitado. Durante la carga, conservar el ancho y mostrar un verbo de progreso: “Actualizando…”. Un botón deshabilitado por reglas debe tener una explicación visible cercana.

### Semáforo de condición

Usar un badge de color + icono + etiqueta, un score numérico y una explicación. La representación vertical de semáforo de la captura puede acompañar la demo, pero no debe ser la única forma de comunicar el estado.

| Estado | Regla del PDF | Presentación | Consecuencia en la demo |
| --- | --- | --- | --- |
| Verde | Score ≥ 70 | Check + “Favorable” | Desembolsos sujetos al cupo y a fondos disponibles. |
| Amarillo | 50 ≤ score < 70 | Alerta + “En observación” | Límite adicional definido al inicio de la simulación. |
| Rojo | Score < 50 | Bloqueo + “Desfavorable” | Cero nuevos desembolsos. |
| Sin datos vigentes | Evidencia pendiente | Reloj + “Sin datos vigentes” | Desembolsos pendientes de actualización. |

El límite adicional de amarillo y la vigencia de los datos requieren configuración del producto: no inventar valores desde el diseño. Un error de carga no debe mostrarse como score cero. Si se conserva el último score conocido, identificarlo como desactualizado y mostrar su fecha.

### Tarjeta de evidencia

Mostrar indicador, valor, unidad, fecha de captura y fuente cuando estén disponibles. Diferenciar con etiquetas `Medido`, `Estimado` y `Simulado`. Una estimación de malezas no debe parecer una medición verificada.

Un badge como “Solo lectura” describe un permiso de interfaz. No equivale a “Auditado” ni a evidencia validada externamente.

### Mapa y controles

El MVP se concentra en un lote. Mostrar su nombre, campaña y ubicación; no agregar un selector multilote funcional si esa capacidad no existe.

Agrupar zoom, recentrado y capas en una barra compacta con objetivos táctiles de al menos 44 × 44 px. Dar nombre accesible a cada botón con icono. Mantener las leyendas de las capas visibles y la atribución del proveedor del mapa.

### Switches y simulación

Un switch activa una opción binaria, como una capa del mapa. Un control segmentado cambia entre escenarios mutuamente excluyentes. Identificar el panel como “Escenarios simulados” y separar la simulación de la evidencia medida.

No usar un slider de malezas como si estuviera modificando una observación real. Evitar interacciones que aparenten ejecutar una actualización satelital en vivo cuando se usan datos precargados.

## 11. Composición de la pantalla principal

Orden de lectura recomendado:

1. **Cabecera:** marca, nombre del lote, campaña y etiqueta persistente de demo.
2. **Resumen de condición:** score, semáforo, fecha y motivo principal.
3. **Evidencia:** mapa e indicadores disponibles de satélite y clima.
4. **Efecto sobre el anticipo:** cupo simulado, capital desembolsado, saldo y regla aplicable.
5. **Acción:** desembolso simulado habilitado o explicación del bloqueo.
6. **Historial:** aporte, desembolso, actualización de condición, rechazo y repago.

En escritorio, usar una columna amplia para mapa/evidencia y otra para condición/decisión. En móvil, llevar el resumen y la acción antes del mapa. Los detalles de participación y registro técnico se pueden desplegar.

## 12. Historia visual de la demo

El flujo sigue una sola campaña y muestra el cambio de estado sin ambigüedad:

1. El lote tiene score **82/100** y condición favorable.
2. Se aportan **USD 50.000 de prueba**.
3. Se desembolsan **USD 30.000 de prueba** y quedan **USD 20.000** sin usar.
4. Un escenario simulado baja el score a **48/100**. Mostrar anterior, actual y motivo del cambio.
5. Un intento de segundo desembolso se rechaza por la regla de estado rojo. El rechazo debe aparecer en pantalla con su causa.
6. Si se simula repago completo, se devuelven **USD 33.000**: capital desembolsado más **10 % simple por toda la campaña**.
7. Los **USD 20.000** no utilizados se devuelven junto al repago: **USD 53.000** a distribuir, sin comisiones en este ejemplo.

El 10 % se aplica al capital efectivamente desembolsado y se mantiene en todos los estados. Presentar este recorrido como un escenario de repago completo, sin prometerlo como resultado garantizado.

Si se muestra la fórmula, rotularla “Cálculo del cupo simulado”: `cosecha_estimada_base × (score / 100) × 0,7`. La base debe estar expresada en valor monetario para obtener un cupo monetario. El cupo teórico positivo no habilita desembolsos en rojo.

## 13. Ajustes respecto de la captura de Stitch

| Elemento de la captura | Adaptación para PreCrop |
| --- | --- |
| “Semáforo de crédito” | “Semáforo de condición del cultivo”. |
| “Aprobado 100%” | Estado del cultivo y regla aplicable, sin porcentaje de aprobación. |
| “Aprobar / Pedir desembolso” | Una acción concreta por rol; en demo, “Simular desembolso”. |
| “Liquidar cobertura climática” | Omitir: el PDF no define un producto de seguro paramétrico. |
| “Oráculo Chainlink” y “Smart Contract auditado” | Omitir esas atribuciones salvo que la integración o auditoría existan y se puedan acreditar. |
| “NDVI 0.49 · Salud óptima” | Mostrar valor, fecha y contexto; no derivar una conclusión universal de ese número. |
| “25% (Limpio)” | “Malezas estimadas: 25 %”, si ese dato forma parte de la demo. |
| “10.0% Fijo” | “10 % por campaña sobre capital desembolsado · Simulación”. |
| “Partner · Coop” como sello | Mostrar rol o entidad real sin aparentar una alianza confirmada. |
| Componentes `<AgroButton />` en pantalla | Reservar esos nombres para documentación técnica. |

## 14. Tokens iniciales de implementación

Estos tokens son independientes del framework y pueden adaptarse al proyecto existente.

```css
:root {
  --color-brand-primary: #175e36;
  --color-brand-hover: #124a2b;
  --color-brand-pressed: #0d3820;
  --color-brand-soft: #e1f7e6;
  --color-canvas: #eceae1;
  --color-surface-sage: #e2e4da;
  --color-surface: #f5f4ee;
  --color-ink: #17382a;
  --color-text-muted: #657066;
  --color-border: #cdd2c4;
  --color-control-border: #a2a79c;
  --color-positive: #175e36;
  --color-positive-bright: #22c55e;
  --color-warning: #8a5300;
  --color-warning-soft: #fff3d6;
  --color-danger: #b42318;
  --color-danger-soft: #feece8;
  --color-neutral-soft: #f0eee7;
  --font-sans: "Inter", system-ui, -apple-system, "Segoe UI", sans-serif;
  --radius-badge: 999px;
  --radius-control: 12px;
  --radius-card: 18px;
  --radius-pill: 999px;
  --space-1: 4px;
  --space-2: 8px;
  --space-3: 12px;
  --space-4: 16px;
  --space-6: 24px;
  --space-8: 32px;
  --space-12: 48px;
  --shadow-card: 0 4px 12px rgba(23, 56, 42, 0.04), 0 1px 2px rgba(23, 56, 42, 0.02);
  --duration-fast: 160ms;
}

:focus-visible {
  outline: 3px solid var(--color-brand-primary);
  outline-offset: 3px;
}

@media (prefers-reduced-motion: reduce) {
  :root { --duration-fast: 0ms; }
}
```

Sobre superficies oscuras, adaptar el foco a un anillo claro que siga siendo visible. Usar transiciones breves de color u opacidad; evitar animaciones decorativas continuas y celebraciones durante operaciones financieras.

## 15. Criterios de revisión antes de la demo

- El nombre, el descriptor y la paleta son consistentes en todas las pantallas.
- El score se presenta como condición del cultivo y tiene una explicación accesible.
- Los estados combinan color, icono y texto; se entienden también sin distinguir colores.
- El texto normal apunta a contraste mínimo de 4,5:1; los controles y el foco, a 3:1 respecto de su entorno. Verificar las combinaciones finales en la app.
- Toda interacción principal funciona con teclado y muestra foco visible.
- La interfaz sigue siendo usable en una pantalla de 360 px y con zoom de texto.
- Los datos muestran su fecha y distinguen medición, estimación y simulación.
- El modo de demo y los fondos de prueba permanecen identificados.
- El rojo bloquea nuevos desembolsos y muestra la causa, aunque exista cupo teórico.
- Los montos aportados, desembolsados y sin usar aparecen separados.
- No se muestran auditorías, alianzas, seguros ni capacidades que el equipo no haya implementado.

**Decisiones pendientes de producto:** límite adicional del estado amarillo, criterio de vigencia de los datos, fechas y fuentes del lote demo, modo mock o testnet y archivo definitivo del logo. Estas decisiones no impiden aplicar la identidad visual de esta guía.
