# Plan de acción — PreCrop, equipo de 3

**Tesis:** PreCrop le vende a cooperativas y acopios chicos la evidencia que hoy no tienen para prestar. Con el historial satelital del lote calcula cuánto produce en un año malo y qué tan estable es, y con eso define el **cupo del anticipo antes de sembrar**, contra el peor año que ese lote ya tuvo. Durante la campaña, un **semáforo de condición** gobierna si el próximo desembolso se libera o se corta. Capacidad define cuánto; condición define si seguís. No prestamos: vendemos la decisión ya tomada, en un formato que un comité de crédito puede firmar, contrastada contra los rindes oficiales de Córdoba.

## Qué hay en `main` hoy

| Pieza | Estado | Cubre |
|---|---|---|
| `data/` pack v1: NDVI medido (2 fechas, 2025), lluvia, puntos, economía del lote, evidencia con hash | ✅ | Condición |
| `packages/score`: índice de condición, hash `precrop-canon-v1`, regla `cupo-v1` (límite de anticipo) | ✅ | Condición |
| `services/evidence-api`: `/score`, `/publish` (oráculo Solana devnet), `/disburse` (mock Twin ARGt) | ✅ | Condición + pago |
| `scripts/build_pack.py`: reproduce NDVI y lluvia desde Planetary Computer y Open-Meteo | ✅ | Reproducibilidad |
| Pitch 90 s, diagrama, README | ✅ | Narrativa |
| **Historial del lote por campaña** (año malo, estabilidad) | ❌ | **Capacidad** |
| **Contraste contra rindes oficiales de Córdoba** | ❌ | **Capacidad** |
| **Informe firmable para el comité** | ❌ | Formato |
| Pantallas de Front, API de visión, fotos | ❌ | Demo |
| Firma real en devnet (falta SOL en la wallet) | ⏳ | Demo |

## Lo que falta, en orden de dependencia

```
historial NDVI por campaña ──► regla capacidad-v1 ──► contraste vs rindes oficiales ──► informe comité ──► pantalla Capacidad
                                                                                                          └─► pitch final
```

Todo lo de capacidad se construye con las mismas herramientas que ya funcionan: el script de STAC, la fórmula lineal NDVI → rinde, el pack en JSON.

## Reparto por persona

### Franco — datos y backend (unas 10 h)

1. **Historial del lote** (3 a 4 h). `scripts/build_history.py`, reutilizando `build_pack.py`: para cada campaña desde 2018/19 hasta 2024/25, buscar escenas Sentinel-2 L2A sobre el polígono entre el 15 de enero y el 15 de marzo con nubes < 10 %, calcular la mediana de NDVI por escena y quedarse con el **pico** de cada campaña. Sumar la lluvia acumulada de diciembre a febrero (Open-Meteo). Salida: `data/lote-history.json`, una fila por campaña con fecha, escena, NDVI pico, lluvia y fuente.
   - Trampa conocida: el offset de reflectancia (restar 1000) aplica solo a escenas con `processing_baseline >= 04.00` (desde enero de 2022). Las campañas anteriores NO llevan offset. El script tiene que decidir por escena o el historial queda mal.
   - Riesgo: alguna campaña sin escena limpia en febrero. Si pasa, ampliar la ventana y dejarlo anotado.
2. **Regla `capacidad-v1`** (1 h) en `packages/score`: rinde estimado por campaña = rinde de referencia × NDVI_norm / 100 (la misma regla lineal de hoy). Año malo = mínimo de la serie. Estabilidad = coeficiente de variación. **Cupo pre-siembra = ha × rinde del año malo × precio × haircut.** Endpoint `GET /capacity` que devuelve la serie, el año malo, la estabilidad, el cupo y las fuentes.
3. **Contraste contra rindes oficiales** (2 h). Tabla por campaña con el rinde departamental de Río Segundo (o provincial si no está el departamental) de la Bolsa de Cereales de Córdoba, con link a cada informe, al lado del estimado del lote. Un scatter y el error medio. No prueba default: prueba que el estimador de producción no es humo, y muestra que el año malo del lote coincide con el año malo oficial (2022/23 sequía).
4. **Informe para el comité** (2 h). `GET /report/<escenario>` devuelve un informe de una página en markdown: lote, capacidad (serie, año malo, cupo pre-siembra), condición actual (índice, factores, límite), fuentes, versión de las reglas, hash y firma. Front lo muestra y lo imprime. Es el "formato que un comité puede firmar".
5. **Firma real en devnet** (15 min). Cargar SOL en `HBhUd4K6SkgaYQm54xF5rhmQJndc3NJq7JHt15MYhGg8` desde https://faucet.solana.com y correr `/publish`. Guardar el link del explorer para la demo.

### Front (unas 10 h)

1. **Pantalla Condición** (ya tiene todo el backend): mapa con `lote.geojson`, toggle bueno / mixto / malo, fotos por punto, semáforo, límite sugerido y los tres factores con su aporte. Botón "Publicar evidencia" → `/publish` → link al explorer. Botón "Aprobar y pagar en ARGt" → `/disburse` → recibo simulado.
2. **Pantalla Capacidad** (cuando esté `/capacity`): barras por campaña con el rinde estimado del lote y el oficial del departamento al lado, el año malo resaltado, el cupo pre-siembra en grande con la frase "contra el peor año que este lote ya tuvo".
3. **Vista Informe**: renderiza el markdown de `/report` con botón de imprimir.
4. Cartel MOCK / devnet en todas las pantallas.

### Visión (unas 6 h)

1. `POST /api/vision/weeds`: recibe las fotos de P1..P5, devuelve `weeds_pct` por punto y la mediana. Modelo liviano (gpt-4o-mini o gemini-flash) con prompt de conteo de cobertura; fallback al valor del pack si falla.
2. Subir las cinco fotos a `data/presets/fotos/` con los nombres del pack y el archivo de atribución.
3. Conectar la mediana al `/score` del backend (`weeds_pct` en el body). Verificar que con malezas altas el escenario cae a rojo como en el pack.
4. Es la única pieza donde decimos "IA". Preparar la frase honesta: sin drone, estimado sobre fotos, se dice en voz alta.

### Los tres — cierre (3 h)

- Ensayar el pitch con la tesis nueva: capacidad antes de sembrar, condición durante la campaña, la coop firma, Twin paga.
- Video de respaldo offline.
- Congelar `main` cuatro horas antes de presentar. Una sola persona mergea.

## Orden sugerido para las próximas 24 h

| Bloque | Franco | Front | Visión |
|---|---|---|---|
| 0–4 h | Historial por campaña | Pantalla Condición | API de malezas |
| 4–8 h | Regla capacidad + `/capacity` + contraste oficial | Pantalla Capacidad | Fotos + conexión a `/score` |
| 8–12 h | Informe comité + firma devnet | Vista Informe + carteles | Pruebas con las tres escenas |
| 12–16 h | Pitch y video | Pitch y video | Pitch y video |
| 16–20 h | Freeze | Freeze | Freeze |

## Riesgos que hay que decir en voz alta

- **Rinde por NDVI es una regla lineal, no un modelo calibrado.** Por eso el contraste con los rindes oficiales es obligatorio, no decorativo. Sin esa tabla, el cupo pre-siembra es un número sin respaldo.
- **El año malo del lote se estima con una escena por campaña.** Si en febrero de un año hubo nubes, la serie tiene un hueco. Se muestra el hueco, no se rellena.
- **ARGt / Twin:** confirmar con el track el estado regulatorio (suspensión de la CNV de marzo de 2026) antes de decir "en producción". En la demo el pago es MOCK.
- **Tiempo:** si el historial se atrasa, la demo sigue funcionando con condición sola. Capacidad es lo que suma la tesis nueva, pero condición es lo que ya está y no se rompe.
