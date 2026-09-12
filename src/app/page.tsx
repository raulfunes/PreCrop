'use client';

import React, { useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { demoReducer, getEstadoInicial } from '@/lib/demoReducer';
import { loteOficial, buildIndicators } from '@/data/fixtures';
import { calcularMedianaMalezas } from '@/lib/scoreUtils';
import { buildEvidenceRequest } from '@/lib/evidenceClient';
import photoPoints from '../../data/photo-point-presets.json';

// ── Hooks y API ───────────────────────────────────────────────
import { useEvidenceApi } from '@/hooks/useEvidenceApi';
import { useCapacity } from '@/hooks/useCapacity';
import { useReport } from '@/hooks/useReport';
import { useLotWorkflow } from '@/hooks/useLotWorkflow';

// ── Layout ────────────────────────────────────────────────────
import { AppHeader } from '@/components/layout/AppHeader';
import { LotHeader } from '@/components/layout/LotHeader';
import { DemoDisclaimer } from '@/components/layout/DemoDisclaimer';

// ── Componentes de dominio ────────────────────────────────────
import { ConditionSummary } from '@/components/lote/ConditionSummary';
import { EvidenceCard } from '@/components/lote/EvidenceCard';
import { SimulatedLimitCard } from '@/components/lote/SimulatedLimitCard';
import { MapaLote } from '@/components/lote/MapaLote';
import { PhotoUploadWidget } from '@/components/vision/PhotoUploadWidget';
import { CapacityScreen } from '@/components/lote/CapacityScreen';
import { ReportScreen } from '@/components/lote/ReportScreen';
import { KpiStrip } from '@/components/lote/KpiStrip';
import { RoleActions, type Role } from '@/components/lote/RoleActions';

// ── UI ────────────────────────────────────────────────────────
import { ErrorBoundary } from '@/components/ui/ErrorBoundary';

const LOTE_ID = photoPoints.lote_id;
type Scenario = 'bueno' | 'mixto' | 'malo';

// ── Sección de tarjeta del dashboard ─────────────────────────
interface DashSectionProps {
  id: string;
  titulo?: string;
  aside?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  noPadding?: boolean;
}

function DashSection({ id, titulo, aside, children, className = '', noPadding }: DashSectionProps) {
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
      {(titulo || aside) && (
        <div className="flex items-start justify-between gap-3 mb-4">
          {titulo && (
            <h2 className="text-[13px] font-semibold text-[var(--color-text-muted)] uppercase tracking-wide">{titulo}</h2>
          )}
          {aside}
        </div>
      )}
      <ErrorBoundary>{children}</ErrorBoundary>
    </section>
  );
}

// ─────────────────────────────────────────────────────────────
// Página única: todo el lote en una sola vista, sin pestañas.
// Arriba los cuatro números que lee un comité; en el medio el mapa con las
// fotos y la condición; abajo las siete campañas y el informe.
// ─────────────────────────────────────────────────────────────

export default function HomePage() {
  const [estadoDemo, dispatch] = useReducer(demoReducer, undefined, getEstadoInicial);
  const { scenario, visionResults } = estadoDemo;
  const [selectedPointId, setSelectedPointId] = useState<string | null>(null);
  const [role, setRole] = useState<Role>('coop');
  const [reportOpen, setReportOpen] = useState(false);

  const { scoreData, isLoading, error, retry } = useEvidenceApi(scenario, visionResults);
  const { data: capacityData, isLoading: capacityLoading, error: capacityError, retry: capacityRetry } = useCapacity(true);
  const workflow = useLotWorkflow(LOTE_ID, scenario);

  const currentPayload = buildEvidenceRequest(scenario, visionResults);
  const reportOptions = useMemo(() => ({ weeds_pct: currentPayload.weeds_pct }), [currentPayload.weeds_pct]);
  const { markdown: reportMarkdown, isLoading: reportLoading, error: reportError, retry: reportRetry } = useReport(scenario, reportOpen, reportOptions);

  const currentWeeds = calcularMedianaMalezas(visionResults, scenario);
  const realAssessedCount = Object.values(visionResults).filter((r) => r.status === 'completed' && r.result?.status === 'assessed' && r.result.source === 'model').length;
  const indicadores = buildIndicators(scenario, currentWeeds, realAssessedCount >= 3 ? 'estimado' : 'simulado');

  // Cada foto analizada por el modelo se registra en el estado del lote con su
  // "metadata" GPS: en producción viene del EXIF; en la demo se mockea con las
  // coordenadas del punto elegido en el mapa.
  const synced = useRef<Set<string>>(new Set());
  useEffect(() => {
    for (const [pointId, st] of Object.entries(visionResults)) {
      const r = st.result;
      if (st.status !== 'completed' || !r || r.status !== 'assessed' || r.source !== 'model') continue;
      const key = `${pointId}:${r.weedsPct}:${r.confidence}`;
      if (synced.current.has(key)) continue;
      synced.current.add(key);
      const point = photoPoints.points.find((p) => p.point_id === pointId);
      const gps = r.gps ?? (point ? { lat: point.lat, lon: point.lon, source: 'exif-mock' } : undefined);
      void workflow.recordPhoto({
        point_id: pointId,
        gps,
        weeds_pct: r.weedsPct,
        confidence: r.confidence,
        source: 'model',
        model: r.model,
      }).catch(() => undefined);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visionResults]);

  const handleReset = async () => {
    await workflow.reset();
    synced.current.clear();
    dispatch({ tipo: 'LIMPIAR_RESULTADOS' });
    dispatch({ tipo: 'CHANGE_SCENARIO', payload: 'bueno' });
    setSelectedPointId(null);
    setRole('coop');
  };

  const handleClearPhotos = async () => {
    await workflow.clearPhotos();
    synced.current.clear();
    dispatch({ tipo: 'LIMPIAR_RESULTADOS' });
  };

  return (
    <div className="min-h-screen flex flex-col bg-[var(--color-canvas)]">
      <AppHeader />
      <LotHeader lote={loteOficial} />

      <main id="contenido-principal" tabIndex={-1} className="flex-1 max-w-7xl w-full mx-auto px-4 md:px-6 lg:px-8 py-6 md:py-8 outline-none flex flex-col gap-5 md:gap-6">
        {/* ── Barra de control ──────────────────────────── */}
        <div className="flex flex-wrap items-center gap-4 md:gap-6 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-[var(--radius-card)] shadow-[var(--shadow-card)] px-4 py-3 print:hidden" data-print-hide>
          <div className="flex items-center gap-2" role="group" aria-label="Rol">
            <span className="text-[12px] font-semibold uppercase tracking-wide text-[var(--color-text-muted)] mr-1">Ver como</span>
            {(['coop', 'productor'] as const).map((r) => (
              <button
                key={r}
                type="button"
                aria-pressed={role === r}
                onClick={() => setRole(r)}
                className={`h-9 px-4 rounded-[var(--radius-pill)] text-[13px] font-semibold transition-colors ${role === r ? 'bg-[var(--color-brand-primary)] text-white' : 'bg-[var(--color-neutral-soft)] text-[var(--color-ink)] hover:bg-[var(--color-brand-soft)]'}`}
              >
                {r === 'coop' ? 'Cooperativa' : 'Productor'}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2">
            <label htmlFor="scenario-select" className="text-[12px] font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">Escena satelital</label>
            <select
              id="scenario-select"
              className="h-9 border border-[var(--color-control-border)] px-2 rounded-[var(--radius-control)] text-[13px] bg-[var(--color-surface)] focus:outline-none focus:ring-2 focus:ring-[var(--color-brand-primary)]"
              value={scenario}
              onChange={(e) => dispatch({ tipo: 'CHANGE_SCENARIO', payload: e.target.value as Scenario })}
            >
              <option value="bueno">2 feb 2025 · pico de campaña</option>
              <option value="mixto">2 feb 2025 · con malezas medias</option>
              <option value="malo">7 feb 2025 · seca de 14 días</option>
            </select>
          </div>

          <button
            type="button"
            onClick={() => void handleReset()}
            disabled={workflow.busy === 'reset'}
            className="ml-auto h-9 px-3 rounded-[var(--radius-control)] text-[13px] font-semibold text-[var(--color-text-muted)] hover:text-[var(--color-ink)] hover:bg-[var(--color-neutral-soft)] disabled:opacity-50"
          >
            Reiniciar demo
          </button>
        </div>

        {/* ── Los cuatro números ─────────────────────────── */}
        <KpiStrip capacity={capacityData} score={scoreData} lot={workflow.state} />

        {/* ── Mapa + fotos | condición + acciones ─────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_400px] gap-5 md:gap-6">
          <div className="flex flex-col gap-5 md:gap-6 min-w-0">
            <DashSection id="mapa-lote" noPadding>
              <MapaLote onPointSelect={(id) => setSelectedPointId(id)} />
            </DashSection>

            {selectedPointId && role === 'productor' && (
              <PhotoUploadWidget
                pointId={selectedPointId}
                scenario={scenario}
                state={visionResults[selectedPointId] || { status: 'pending', result: null }}
                onAction={(action) => dispatch(action)}
              />
            )}
            {selectedPointId && role === 'coop' && (
              <p className="text-[13px] text-[var(--color-text-muted)] px-1">
                Punto {selectedPointId}: las fotos las sube el productor. Cambiá a “Productor” para cargarlas.
              </p>
            )}

            <DashSection
              id="evidencia-lote"
              titulo="Evidencia del lote"
              aside={<span className="text-[10px] text-[var(--color-text-muted)] bg-[var(--color-neutral-soft)] px-2 py-0.5 rounded-[var(--radius-pill)]">Satélite, clima y fotos</span>}
            >
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3" role="list" aria-label="Indicadores de evidencia del lote">
                {indicadores.map((ind, idx) => (
                  <div key={ind.id} role="listitem">
                    <EvidenceCard indicador={ind} primerAparicion={idx === 0 && !!ind.sigla} />
                  </div>
                ))}
              </div>
              <p className="mt-4 text-[11px] text-[var(--color-text-muted)] leading-4">
                <em>Medido</em>: satélite y clima. <em>Estimado</em>: modelo de visión sobre fotos. <em>Simulado</em>: valor del pack hasta tener fotos en {workflow.state?.min_points_for_score ?? 3} puntos.
              </p>
            </DashSection>
          </div>

          <div className="flex flex-col gap-5 md:gap-6">
            <DashSection id="condicion-lote" titulo="Condición del lote">
              <ConditionSummary scoreData={scoreData} isLoading={isLoading} error={error} onRetry={retry} />
            </DashSection>

            <DashSection id="acciones" titulo={role === 'coop' ? 'Decisión de la cooperativa' : 'Solicitud del productor'}>
              <RoleActions
                role={role}
                lot={workflow.state}
                capacity={capacityData}
                busy={workflow.busy}
                lastReceipt={workflow.lastReceipt}
                onApprove={() => workflow.approve()}
                onDisburse={workflow.disburse}
                onClearPhotos={handleClearPhotos}
              />
            </DashSection>

            <DashSection id="cupo-anticipos" titulo="Regla del límite">
              <SimulatedLimitCard advance={scoreData?.advance || null} superseded_advance={scoreData?.superseded_advance || undefined} />
            </DashSection>
          </div>
        </div>

        {/* ── Capacidad: siete campañas ──────────────────── */}
        <DashSection id="capacidad" titulo="Capacidad · siete campañas del lote contra el rinde oficial">
          <CapacityScreen data={capacityData} isLoading={capacityLoading} error={capacityError} onRetry={capacityRetry} />
        </DashSection>

        {/* ── Informe del comité (plegado) ───────────────── */}
        <DashSection
          id="informe"
          titulo="Informe para el comité"
          aside={
            <button
              type="button"
              onClick={() => setReportOpen((v) => !v)}
              className="text-[13px] font-semibold text-[var(--color-brand-primary)] hover:underline"
              aria-expanded={reportOpen}
              aria-controls="informe-contenido"
            >
              {reportOpen ? 'Ocultar' : 'Ver e imprimir'}
            </button>
          }
        >
          <div id="informe-contenido" hidden={!reportOpen}>
            {reportOpen && (
              <ReportScreen markdown={reportMarkdown} isLoading={reportLoading} error={reportError} onRetry={reportRetry} scenario={scenario} />
            )}
          </div>
          {!reportOpen && (
            <p className="text-[13px] text-[var(--color-text-muted)]">Una página con capacidad, condición, factores, fuentes, versiones de las reglas y el cuadro de firmas.</p>
          )}
        </DashSection>
      </main>

      <DemoDisclaimer />
    </div>
  );
}
