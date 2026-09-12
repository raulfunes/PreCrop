'use client';

import React, { useReducer } from 'react';
import { demoReducer, getEstadoInicial } from '@/lib/demoReducer';
import { loteOficial, buildIndicators } from '@/data/fixtures';
import { calcularMedianaMalezas } from '@/lib/scoreUtils';

// ── Layout ────────────────────────────────────────────────────
import { AppHeader } from '@/components/layout/AppHeader';
import { LotHeader } from '@/components/layout/LotHeader';
import { DemoDisclaimer } from '@/components/layout/DemoDisclaimer';

// ── Componentes de dominio ────────────────────────────────────
import { ConditionSummary } from '@/components/lote/ConditionSummary';
import { EvidenceCard } from '@/components/lote/EvidenceCard';
import { SimulatedLimitCard } from '@/components/lote/SimulatedLimitCard';
import { DemoActionPanel } from '@/components/lote/DemoActionPanel';
import { EventTimeline } from '@/components/lote/EventTimeline';
import { MapaLote } from '@/components/lote/MapaLote';
import { PhotoUploadWidget } from '@/components/vision/PhotoUploadWidget';

// ── UI ────────────────────────────────────────────────────────
import type { PasoDemo, AccionDemo } from '@/types';
import { ErrorBoundary } from '@/components/ui/ErrorBoundary';

// ── Indicador de progreso de la demo ─────────────────────────
const PASOS: Array<{ id: PasoDemo; label: string; labelCorto: string }> = [
  { id: 'lote_evaluado',                label: '1. Condición inicial',   labelCorto: '1' },
  { id: 'fondos_aportados',             label: '2. Aporte',              labelCorto: '2' },
  { id: 'primer_desembolso',            label: '3. Desembolso',          labelCorto: '3' },
  { id: 'condicion_actualizada',        label: '4. Condición baja',      labelCorto: '4' },
  { id: 'segundo_desembolso_rechazado', label: '5. Bloqueo',             labelCorto: '5' },
  { id: 'repago_completado',            label: '6. Repago',              labelCorto: '6' },
];

function PasoIndicator({ paso }: { paso: PasoDemo }) {
  const indiceActual = PASOS.findIndex((p) => p.id === paso);
  return (
    <nav
      aria-label="Progreso del recorrido de demo"
      className="flex items-center gap-1 overflow-x-auto pb-0.5 scrollbar-none"
    >
      {PASOS.map((p, idx) => {
        const esActual = p.id === paso;
        const esPasado = idx < indiceActual;
        return (
          <React.Fragment key={p.id}>
            <div
              aria-current={esActual ? 'step' : undefined}
              className={[
                'flex items-center gap-1.5 px-2.5 py-1.5 rounded-[var(--radius-pill)] whitespace-nowrap shrink-0',
                'text-[11px] font-semibold transition-colors duration-[var(--duration-fast)]',
                esActual
                  ? 'bg-[var(--color-brand-primary)] text-white shadow-sm'
                  : esPasado
                  ? 'bg-[var(--color-brand-soft)] text-[var(--color-positive)]'
                  : 'bg-[var(--color-neutral-soft)] text-[var(--color-text-muted)]',
              ].join(' ')}
            >
              <span className="hidden sm:inline">{p.label}</span>
              <span className="sm:hidden" aria-hidden="true">{p.labelCorto}</span>
              <span className="sr-only sm:hidden">{p.label}</span>
            </div>
            {idx < PASOS.length - 1 && (
              <div
                className={[
                  'h-px w-3 shrink-0',
                  esPasado || esActual
                    ? 'bg-[var(--color-brand-primary)]'
                    : 'bg-[var(--color-border)]',
                ].join(' ')}
                aria-hidden="true"
              />
            )}
          </React.Fragment>
        );
      })}
    </nav>
  );
}

// ── Sección de tarjeta del dashboard ─────────────────────────
interface DashSectionProps {
  id: string;
  titulo?: string;
  children: React.ReactNode;
  className?: string;
  noPadding?: boolean;
}

function DashSection({ id, titulo, children, className = '', noPadding }: DashSectionProps) {
  return (
    <section
      id={id}
      className={[
        'bg-[var(--color-surface)] rounded-[var(--radius-card)]',
        'border border-[var(--color-border)] shadow-[var(--shadow-card)]',
        noPadding ? 'overflow-hidden' : 'p-5 md:p-6',
        className,
      ].join(' ')}
    >
      {titulo && (
        <h2 className="text-[13px] font-semibold text-[var(--color-text-muted)] uppercase tracking-wide mb-4">
          {titulo}
        </h2>
      )}
      <ErrorBoundary>{children}</ErrorBoundary>
    </section>
  );
}

// ─────────────────────────────────────────────────────────────
// Página principal
// ─────────────────────────────────────────────────────────────

/**
 * Dashboard principal de PreCrop.
 *
 * Orden de lectura (branding §11):
 *   1. AppHeader — marca + info del lote + badge DEMO
 *   2. LotHeader — nombre, cultivo, campaña, ubicación, superficie
 *   3. Main → PasoIndicator + grid de dos columnas
 *      Columna izquierda (evidencia/mapa):
 *        - Mapa del lote simulado
 *        - Evidencia: NDVI, lluvia, malezas
 *        - Historial (event timeline)
 *      Columna derecha (condición/decisión):
 *        - ConditionSummary (score + estado + motivo)
 *        - SimulatedLimitCard (cupo + fondos separados)
 *        - DemoActionPanel (acción del paso actual)
 *
 * Responsive:
 *   - Mobile (< lg): columna derecha PRIMERO (condición + acción),
 *     luego evidencia + mapa. Cumple §11: "llevar el resumen y la
 *     acción antes del mapa".
 *   - Desktop (≥ lg): dos columnas, evidencia/mapa ancha a la
 *     izquierda.
 *
 * Accesibilidad:
 *   - Skip-to-content en el logo del AppHeader
 *   - Landmark <main> con id="contenido-principal"
 *   - Secciones con aria-labelledby o aria-label
 *   - Foco visible en todos los controles interactivos
 *   - Usable a 360 px y con navegación por teclado
 */
export default function HomePage() {
  const [estadoDemo, dispatch] = useReducer(demoReducer, undefined, getEstadoInicial);
  const { condicion, finanzas, historial, scenario, visionResults } = estadoDemo;
  const [selectedPointId, setSelectedPointId] = React.useState<string | null>(null);

  const currentWeeds = calcularMedianaMalezas(visionResults, scenario);

  const realAssessedCount = Object.values(visionResults).filter(r => r.status === 'completed' && r.result?.status === 'assessed' && r.result.source === 'model').length;
  const origin = realAssessedCount >= 3 ? 'estimado' : 'simulado';

  const indicadores = buildIndicators(scenario, currentWeeds, origin);

  return (
    <div className="min-h-screen flex flex-col bg-[var(--color-canvas)]">

      {/* ── AppHeader ─────────────────────────────────────── */}
      <AppHeader />

      {/* ── LotHeader ─────────────────────────────────────── */}
      <LotHeader lote={loteOficial} />

      {/* ── Main ──────────────────────────────────────────── */}
      <main
        id="contenido-principal"
        tabIndex={-1}
        className="flex-1 max-w-7xl w-full mx-auto px-4 md:px-6 lg:px-8 py-6 md:py-8 outline-none"
      >
        {/* Selector de Escenario */}
        <div className="mb-6 p-4 bg-white border rounded-md shadow-sm flex items-center gap-4">
          <label htmlFor="scenario-select" className="font-semibold text-sm">Escenario (Demo):</label>
          <select
            id="scenario-select"
            className="border p-1 rounded-md text-sm"
            value={scenario}
            onChange={(e) => dispatch({ tipo: 'CHANGE_SCENARIO', payload: e.target.value as 'bueno' | 'mixto' | 'malo' })}
          >
            <option value="bueno">Bueno</option>
            <option value="mixto">Mixto</option>
            <option value="malo">Malo</option>
          </select>
        </div>

        {/* Encabezado de la vista */}
        <div className="mb-5 md:mb-6">
          <p className="text-[15px] text-[var(--color-text-muted)] leading-6 max-w-2xl mb-4">
            Consultá el estado del cultivo y su efecto sobre el cupo de anticipo simulado.
          </p>
          <PasoIndicator paso={estadoDemo.paso} />
        </div>

        {/*
          ── Grid principal ─────────────────────────────────────
          Desktop: [evidencia/mapa ancha] [condición/decisión 380px]
          Mobile: columna derecha primero (condición + acción),
                  luego evidencia y mapa.
          Implementado con order-* de Tailwind.
        */}
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_380px] gap-5 md:gap-6">

          {/* ══ COLUMNA DERECHA (mobile: order-1, desktop: order-2) ══ */}
          <div className="flex flex-col gap-5 md:gap-6 order-1 lg:order-2">

            {/* Condición del lote */}
            <DashSection id="condicion-lote" titulo="Condición del lote">
              <ConditionSummary condicion={condicion} />
            </DashSection>

            {/* Cupo y fondos */}
            <DashSection id="cupo-anticipos" titulo="Cupo y anticipos simulados">
              <SimulatedLimitCard
                finanzas={finanzas}
                score={condicion.score}
                estado={condicion.estado}
              />
            </DashSection>

            {/* Acción de la demo */}
            <DashSection id="accion-demo">
              <DemoActionPanel
                estado={estadoDemo}
                onAccion={(tipo) => dispatch({ tipo } as AccionDemo)}
              />
            </DashSection>
          </div>

          {/* ══ COLUMNA IZQUIERDA (mobile: order-2, desktop: order-1) ══ */}
          <div className="flex flex-col gap-5 md:gap-6 order-2 lg:order-1 min-w-0">

            {/* Mapa del lote */}
            <DashSection id="mapa-lote" noPadding>
              <MapaLote onPointSelect={(id) => setSelectedPointId(id)} />
            </DashSection>

            {selectedPointId && (
              <PhotoUploadWidget
                pointId={selectedPointId}
                scenario={scenario}
                state={visionResults[selectedPointId] || { status: 'pending', result: null }}
                onAction={(action) => dispatch(action)}
              />
            )}

            {/* Evidencia del lote */}
            <DashSection id="evidencia-lote">
              <div className="flex items-start justify-between gap-2 mb-4">
                <h2 className="text-[13px] font-semibold text-[var(--color-text-muted)] uppercase tracking-wide">
                  Evidencia del lote
                </h2>
                <span className="text-[10px] text-[var(--color-text-muted)] bg-[var(--color-neutral-soft)] px-2 py-0.5 rounded-[var(--radius-pill)]">
                  Satélite y clima
                </span>
              </div>

              <div
                className="grid grid-cols-2 sm:grid-cols-3 gap-3"
                role="list"
                aria-label="Indicadores de evidencia del lote"
              >
                {indicadores.map((ind, idx) => (
                  <div key={ind.id} role="listitem">
                    <EvidenceCard
                      indicador={ind}
                      primerAparicion={idx === 0 && !!ind.sigla}
                    />
                  </div>
                ))}
              </div>

              {/* Nota contextual */}
              <p className="mt-4 text-[11px] text-[var(--color-text-muted)] leading-4">
                Los datos <em>Estimados</em> provienen de modelos; no son mediciones verificadas.
                Los datos <em>Medidos</em> corresponden a capturas satelitales o sensores.
              </p>
            </DashSection>

            {/* Historial de eventos */}
            <DashSection id="historial-lote">
              <EventTimeline eventos={historial} />
            </DashSection>
          </div>

        </div>
      </main>

      {/* ── DemoDisclaimer ────────────────────────────────── */}
      <DemoDisclaimer />
    </div>
  );
}
