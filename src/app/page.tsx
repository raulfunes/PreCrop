'use client';

import React, { useReducer, useState } from 'react';
import { demoReducer, getEstadoInicial } from '@/lib/demoReducer';
import { loteOficial, buildIndicators } from '@/data/fixtures';
import { calcularMedianaMalezas } from '@/lib/scoreUtils';

// ── Hooks y API ───────────────────────────────────────────────
import { useEvidenceApi } from '@/hooks/useEvidenceApi';

// ── Layout ────────────────────────────────────────────────────
import { AppHeader } from '@/components/layout/AppHeader';
import { LotHeader } from '@/components/layout/LotHeader';
import { DemoDisclaimer } from '@/components/layout/DemoDisclaimer';

// ── Componentes de dominio ────────────────────────────────────
import { ConditionSummary } from '@/components/lote/ConditionSummary';
import { EvidenceCard } from '@/components/lote/EvidenceCard';
import { SimulatedLimitCard } from '@/components/lote/SimulatedLimitCard';
import { ActionButtons } from '@/components/lote/ActionButtons';
import { EventTimeline } from '@/components/lote/EventTimeline';
import { MapaLote } from '@/components/lote/MapaLote';
import { PhotoUploadWidget } from '@/components/vision/PhotoUploadWidget';

// ── UI ────────────────────────────────────────────────────────
import { ErrorBoundary } from '@/components/ui/ErrorBoundary';

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

export default function HomePage() {
  const [estadoDemo, dispatch] = useReducer(demoReducer, undefined, getEstadoInicial);
  const { historial, scenario, visionResults } = estadoDemo;
  const [selectedPointId, setSelectedPointId] = React.useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'condicion' | 'capacidad' | 'informe'>('condicion');

  const { scoreData, isLoading, error, publish, disburse, retry } = useEvidenceApi(scenario, visionResults);

  const currentWeeds = calcularMedianaMalezas(visionResults, scenario);
  const realAssessedCount = Object.values(visionResults).filter(r => r.status === 'completed' && r.result?.status === 'assessed' && r.result.source === 'model').length;
  const origin = realAssessedCount >= 3 ? 'estimado' : 'simulado';

  const indicadores = buildIndicators(scenario, currentWeeds, origin);

  const handleRetryScore = () => {
    retry();
  };

  const actionKey = scoreData ? `${scenario}:${scoreData.evidence.content_sha256}` : scenario;
  const isActionDisabled = isLoading || !!error || !scoreData || scoreData.scenario !== scenario;

  return (
    <div className="min-h-screen flex flex-col bg-[var(--color-canvas)]">
      <AppHeader />
      <LotHeader lote={loteOficial} />

      <main
        id="contenido-principal"
        tabIndex={-1}
        className="flex-1 max-w-7xl w-full mx-auto px-4 md:px-6 lg:px-8 py-6 md:py-8 outline-none"
      >
        {/* Selector de Escenario */}
        <div className="mb-6 p-4 bg-white border rounded-[var(--radius-card)] shadow-[var(--shadow-card)] flex items-center gap-4">
          <label htmlFor="scenario-select" className="font-semibold text-sm">Escenario (Demo):</label>
          <select
            id="scenario-select"
            className="border border-[var(--color-border)] p-1.5 rounded-md text-sm bg-[var(--color-canvas)] focus:outline-none focus:ring-2 focus:ring-[var(--color-brand-primary)]"
            value={scenario}
            onChange={(e) => dispatch({ tipo: 'CHANGE_SCENARIO', payload: e.target.value as 'bueno' | 'mixto' | 'malo' })}
          >
            <option value="bueno">Bueno</option>
            <option value="mixto">Mixto</option>
            <option value="malo">Malo</option>
          </select>
        </div>

        {/* Tabs de Navegación */}
        <div className="flex items-center gap-1 border-b border-[var(--color-border)] mb-6">
          <button
            onClick={() => setActiveTab('condicion')}
            className={`px-4 py-2.5 text-[14px] font-semibold border-b-2 transition-colors ${activeTab === 'condicion' ? 'border-[var(--color-brand-primary)] text-[var(--color-brand-primary)]' : 'border-transparent text-[var(--color-text-muted)] hover:text-[var(--color-ink)]'}`}
          >
            Condición
          </button>
          <button
            onClick={() => setActiveTab('capacidad')}
            className={`px-4 py-2.5 text-[14px] font-semibold border-b-2 transition-colors ${activeTab === 'capacidad' ? 'border-[var(--color-brand-primary)] text-[var(--color-brand-primary)]' : 'border-transparent text-[var(--color-text-muted)] hover:text-[var(--color-ink)]'}`}
          >
            Capacidad
          </button>
          <button
            onClick={() => setActiveTab('informe')}
            className={`px-4 py-2.5 text-[14px] font-semibold border-b-2 transition-colors ${activeTab === 'informe' ? 'border-[var(--color-brand-primary)] text-[var(--color-brand-primary)]' : 'border-transparent text-[var(--color-text-muted)] hover:text-[var(--color-ink)]'}`}
          >
            Informe
          </button>
        </div>

        {activeTab !== 'condicion' ? (
          <div className="flex items-center justify-center py-20">
            <p className="text-[15px] font-medium text-[var(--color-text-muted)]">Pendiente de disponibilidad del backend</p>
          </div>
        ) : (
          <>
            <div className="mb-5 md:mb-6">
              <p className="text-[15px] text-[var(--color-text-muted)] leading-6 max-w-2xl mb-4">
                Consultá el estado del cultivo y publicá evidencia en la blockchain o simulá el pago de anticipos.
              </p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-[1fr_380px] gap-5 md:gap-6">
              {/* ══ COLUMNA DERECHA (mobile: order-1, desktop: order-2) ══ */}
              <div className="flex flex-col gap-5 md:gap-6 order-1 lg:order-2">
                <DashSection id="condicion-lote" titulo="Condición del lote">
                  <ConditionSummary scoreData={scoreData} isLoading={isLoading} error={error} onRetry={handleRetryScore} />
                </DashSection>

                <DashSection id="cupo-anticipos" titulo="Límite de anticipo sugerido">
                  <SimulatedLimitCard advance={scoreData?.advance || null} />
                </DashSection>

                <DashSection id="accion-demo">
                  <ActionButtons 
                    key={actionKey}
                    publish={publish} 
                    disburse={disburse} 
                    advance={scoreData?.advance || null} 
                    disabled={isActionDisabled}
                  />
                </DashSection>
              </div>

              {/* ══ COLUMNA IZQUIERDA (mobile: order-2, desktop: order-1) ══ */}
              <div className="flex flex-col gap-5 md:gap-6 order-2 lg:order-1 min-w-0">
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

                <DashSection id="evidencia-lote">
                  <div className="flex items-start justify-between gap-2 mb-4">
                    <h2 className="text-[13px] font-semibold text-[var(--color-text-muted)] uppercase tracking-wide">
                      Evidencia del lote
                    </h2>
                    <span className="text-[10px] text-[var(--color-text-muted)] bg-[var(--color-neutral-soft)] px-2 py-0.5 rounded-[var(--radius-pill)]">
                      Satélite y clima
                    </span>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3" role="list" aria-label="Indicadores de evidencia del lote">
                    {indicadores.map((ind, idx) => (
                      <div key={ind.id} role="listitem">
                        <EvidenceCard indicador={ind} primerAparicion={idx === 0 && !!ind.sigla} />
                      </div>
                    ))}
                  </div>

                  <p className="mt-4 text-[11px] text-[var(--color-text-muted)] leading-4">
                    Los datos <em>Estimados</em> provienen de modelos; no son mediciones verificadas.
                    Los datos <em>Medidos</em> corresponden a capturas satelitales o sensores.
                  </p>
                </DashSection>

                <DashSection id="historial-lote">
                  <EventTimeline eventos={historial} />
                </DashSection>
              </div>
            </div>
          </>
        )}
      </main>

      <DemoDisclaimer />
    </div>
  );
}
