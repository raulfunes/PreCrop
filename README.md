# PreCrop · Evidencia del Cultivo para Decidir Anticipos (MVP Hackathon)

**PreCrop** es una interfaz de frontend para presentar en hackathons. Permite visualizar la evidencia agronómica (satelital y climática) de un lote de cultivo y simular la toma de decisiones financieras (límite simulado, desembolsos y repagos) durante la campaña agrícola.

---

## 🎯 Alcance del Frontend

> **IMPORTANTE:** Esta aplicación es un MVP **exclusivamente de frontend**.
>
> - **Datos y Score:** Todos los datos agronómicos (NDVI, lluvias, malezas) y el score de condición del lote son simulados mediante fixtures locales en TypeScript que cargan datos de la carpeta `data/`. El cálculo de score usa las fórmulas oficiales.
> - **Operaciones Financieras:** El cupo simulado, la habilitación de desembolsos, el bloqueo por estado desfavorable y la liquidación final de repago se calculan de manera pura y en memoria en el cliente (`src/lib/scoreUtils.ts` y `src/lib/demoReducer.ts`).
> - **Sin Backend Obligatorio:** Puede funcionar de manera simulada local. Si se provee la variable `VISION_BACKEND_URL`, se conecta al motor de Python de visión real (que debe ejecutarse en `127.0.0.1:8000`).
> - **Evaluación IA:** Cuando se usa el backend, la aplicación hace 1 sola petición por fotografía hacia el proxy local de Next.js, el cual contacta al motor en Python (que internamente realiza las 2 llamadas a los modelos IA).
> - **Visualización de Mapa:** El mapa del lote es un componente `Leaflet` local sin API key que interactúa con polígonos locales. Todo el estado (aportes, desembolsos, repagos, score) es un estado en memoria.

---

## 🚀 Instalación y Ejecución

### Requisitos Previos
- **Node.js** 20.9 o superior.
- **npm** (incluido con Node.js).

### Pasos
1. Clonar o descargar el repositorio e ingresar al directorio:
   ```bash
   cd PreCrop
   ```

2. Instalar las dependencias del proyecto:
   ```bash
   npm install
   ```

3. (Opcional) Configurar el Backend de Visión:
   Copiar `.env.example` a `.env.local` y asegurarse de tener corriendo el servidor Python en `http://127.0.0.1:8000`. Si no se configura, usará el modo simulado (presets).

3. Iniciar el servidor de desarrollo:
   ```bash
   npm run dev
   ```

4. Abrir en el navegador:
   [http://localhost:3000](http://localhost:3000)

---

## 🎬 Cómo Presentar la Demo en Vivo

La aplicación incluye un selector de 3 escenarios (Bueno, Mixto, Malo) y un recorrido interactivo de 6 pasos. Asegúrate de estar en el escenario "Bueno" para comenzar:

1. **Paso 1 · Condición Inicial:** Muestra el "Lote demo Río Segundo / Córdoba". Sube al menos 3 fotos en los puntos del mapa (simulado o estimado por IA) y el score se ajustará alrededor de **74.4** (Verde · Condición Favorable).
2. **Paso 2 · Aporte:** Simula el aporte de **USD 50.000** de prueba.
3. **Paso 3 · Desembolso:** Simula el primer desembolso de **USD 30.000** al productor (quedan USD 20.000 disponibles).
4. **Paso 4 · Cambio de Condición:** Cambia el escenario a "Malo" desde el selector y sube las fotos. El score cae a **48.5** (Rojo · Condición Desfavorable), recalculando el cupo teórico y mostrando la evidencia climática (falta de lluvia) y de malezas (aumento).
5. **Paso 5 · Bloqueo de Desembolso:** Al intentar solicitar un segundo desembolso, el frontend aplica la regla del sistema y lo **rechaza de forma explícita** por estar en estado rojo (score < 50), aclarando que los USD 30.000 desembolsados anteriormente mantienen sus condiciones.
6. **Paso 6 · Repago y Liquidación:** Simula el cierre de campaña con un repago de capital e interés y devolución de los fondos no usados, para un total a distribuir de **USD 53.000**.
7. **Reiniciar Demo:** Usar el botón secundario **"Reiniciar demo"** para volver de manera segura al estado inicial en cualquier momento.

---

## 🛠️ Comandos de Verificación

```bash
# Verificación de tipos TypeScript
npx tsc --noEmit

# Auditoría de linter (ESLint)
npx eslint src --ext .ts,.tsx

# Compilación de producción
npm run build
```

---

## 🎨 Sistema de Diseño y Accesibilidad

Desarrollado respetando la identidad visual y guías de `docs/branding.md`:
- **Tipografía:** Inter (Google Fonts via `next/font`).
- **Paleta de Colores:** Tokens hexadecimales sobrios con fondo `#FAF9F6` y verde primario `#175E36`.
- **Accesibilidad (WCAG 2.1 AA):** Triple codificación (color + icono + texto), foco visible de 3 px, botones de al menos 44×44 px y etiquetas `aria-live` moderadas para anuncios de voz.
- **Responsive:** Mobile-first optimizado para pantallas de 360 px en adelante.
