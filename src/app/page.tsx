'use client';

import React, { useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { demoReducer, getEstadoInicial } from '@/lib/demoReducer';
import { loteOficial, buildIndicators } from '@/data/fixtures';
import { calcularMedianaMalezas } from '@/lib/scoreUtils';
import { buildEvidenceRequest } from '@/lib/evidenceClient';
import { workflowClient, type LotPoint } from '@/lib/workflowClient';
import photoPoints from '../../data/photo-point-presets.json';
import type { Lote } from '@/types';

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
import type { LatLng } from '@/components/lote/LeafletMap';
import { PhotoUploadWidget } from '@/components/vision/PhotoUploadWidget';
import { CapacityScreen } from '@/components/lote/CapacityScreen';
import { ReportScreen } from '@/components/lote/ReportScreen';
import { KpiStrip } from '@/components/lote/KpiStrip';
import { RoleActions, type Role } from '@/components/lote/RoleActions';
import { TrafficLightGauge } from '@/components/lote/TrafficLightGauge';

// ── UI ────────────────────────────────────────────────────────
import { ErrorBoundary } from '@/components/ui/ErrorBoundary';

type Scenario = 'bueno' | 'mixto' | 'malo';

interface LotView {
  id: string;
  nombre: string;
  ha: number;
  departamento: string;
  polygon: LatLng[] | null; // null = the committed demo lot (the map fetches its geometry)
  points: LotPoint[];
}

const DEMO_LOT: LotView = {
  id: photoPoints.lote_id,
  nombre: 'Lote demo Río Primero / Córdoba',
  ha: 100,
  departamento: 'Río Primero',
  polygon: null,
  points: photoPoints.points as LotPoint[],
};

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
        <div className={`flex items-start justify-between gap-3 ${noPadding ? 'px-5 pt-4 pb-3' : 'mb-4'}`}>
          {titulo && <h2 className="text-[13px] font-semibold text-[var(--color-text-muted)] uppercase tracking-wide">{titulo}</h2>}
          {aside}
        </div>
      )}
      <ErrorBoundary>{children}</ErrorBoundary>
    </section>
  );
}

// ─────────────────────────────────────────────────────────────
// Página única, a pantalla completa: todo el lote en una sola vista.
// ─────────────────────────────────────────────────────────────

export default function HomePage() {
  const [estadoDemo, dispatch] = useReducer(demoReducer, undefined, getEstadoInicial);
  const { scenario, visionResults } = estadoDemo;
  const [selectedPointId, setSelectedPointId] = useState<string | null>(null);
  const [role, setRole] = useState<Role>('coop');
  const [reportOpen, setReportOpen] = useState(false);
  const [lot, setLot] = useState<LotView>(DEMO_LOT);
  const [drawing, setDrawing] = useState(false);
  const [creating, setCreating] = useState<string | null>(null);
  const [createError, setCreateError] = useState<string | null>(null);

  const { scoreData, isLoading, error, retry } = useEvidenceApi(scenario, visionResults, lot.id);
  const { data: capacityData, isLoading: capacityLoading, error: capacityError, retry: capacityRetry } = useCapacity(true, lot.id);
  const workflow = useLotWorkflow(lot.id, scenario);

  const currentPayload = buildEvidenceRequest(scenario, visionResults);
  const reportOptions = useMemo(() => ({ weeds_pct: currentPayload.weeds_pct }), [currentPayload.weeds_pct]);
  const { markdown: reportMarkdown, isLoading: reportLoading, error: reportError, retry: reportRetry } = useReport(scenario, reportOpen, reportOptions, lot.id);

  const currentWeeds = calcularMedianaMalezas(visionResults, scenario);
  const realAssessedCount = Object.values(visionResults).filter((r) => r.status === 'completed' && r.result?.status === 'assessed' && r.result.source === 'model').length;
  const indicadores = buildIndicators(scenario, currentWeeds, realAssessedCount >= 3 ? 'estimado' : 'simulado');

  const loteHeader: Lote = useMemo(() => ({
    ...loteOficial,
    id: lot.id,
    nombre: lot.nombre,
    ubicacion: `${lot.departamento}, Córdoba`,
    hectareas: lot.ha,
    campana: '2024/25 · escenas',
  }), [lot]);

  // Cada foto analizada (modelo, o valor de ejemplo si ninguna API respondió) se
  // registra en el estado del lote con su "metadata" GPS: en producción viene del
  // EXIF; en la demo se mockea con las coordenadas del punto elegido en el mapa.
  const synced = useRef<Set<string>>(new Set());
  useEffect(() => {
    for (const [pointId, st] of Object.entries(visionResults)) {
      const r = st.result;
      if (st.status !== 'completed' || !r || r.status !== 'assessed') continue;
      const isModel = r.source === 'model';
      const key = `${lot.id}:${pointId}:${r.weedsPct}:${isModel ? r.confidence : 'preset'}`;
      if (synced.current.has(key)) continue;
      synced.current.add(key);
      const point = lot.points.find((p) => p.point_id === pointId);
      const gps = (isModel && r.gps) ? r.gps : (point ? { lat: point.lat, lon: point.lon, source: 'exif-mock' } : undefined);
      void workflow.recordPhoto({
        point_id: pointId,
        gps,
        weeds_pct: r.weedsPct,
        confidence: isModel ? r.confidence : null,
        source: isModel ? 'model' : 'preset',
        model: isModel ? r.model : null,
        synthetic: !isModel,
      }).catch(() => undefined);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visionResults]);

  const resetDemoState = () => {
    synced.current.clear();
    dispatch({ tipo: 'LIMPIAR_RESULTADOS' });
    setSelectedPointId(null);
  };

  const handleReset = async () => {
    await workflow.reset();
    resetDemoState();
    dispatch({ tipo: 'CHANGE_SCENARIO', payload: 'bueno' });
    setRole('coop');
  };

  const handleClearPhotos = async () => {
    await workflow.clearPhotos();
    resetDemoState();
  };

  const handlePolygonComplete = async (ring: LatLng[]) => {
    setDrawing(false);
    setCreateError(null);
    setCreating('Procesando el lote: departamento, serie oficial y siete campañas de satélite…');
    try {
      const closed = [...ring, ring[0]].map(([lat, lon]) => [lon, lat]);
      const created = await workflowClient.createLot({ name: `Lote nuevo ${new Date().toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}`, geometry: { type: 'Polygon', coordinates: [closed] } });
      resetDemoState();
      setLot({ id: created.lote.id, nombre: created.lote.nombre, ha: created.lote.ha, departamento: created.lote.departamento, polygon: ring, points: created.points });
      setRole('coop');
    } catch (e) {
      setCreateError(e instanceof Error ? e.message : 'No se pudo crear el lote');
    } finally {
      setCreating(null);
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-[var(--color-canvas)]">
      <AppHeader />
      <LotHeader lote={loteHeader} />

      <main id="contenido-principal" tabIndex={-1} className="flex-1 w-full px-4 md:px-6 2xl:px-10 py-5 md:py-6 outline-none flex flex-col gap-5">
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
              <option value="bueno">Pico de campaña (bueno)</option>
              <option value="mixto">Pico con malezas medias (mixto)</option>
              <option value="malo">Seca de 14 días (malo)</option>
            </select>
          </div>

          {role === 'coop' && (
            <button
              type="button"
              onClick={() => { setSelectedPointId(null); setDrawing((d) => !d); }}
              disabled={!!creating}
              aria-pressed={drawing}
              className={`h-9 px-4 rounded-[var(--radius-control)] text-[13px] font-semibold border transition-colors disabled:opacity-50 ${drawing ? 'bg-[var(--color-warning-soft)] border-[var(--color-warning)] text-[var(--color-warning)]' : 'bg-[var(--color-surface)] border-[var(--color-brand-primary)] text-[var(--color-brand-primary)] hover:bg-[var(--color-brand-soft)]'}`}
            >
              {drawing ? 'Dibujando… (2 clics en el mapa)' : 'Dibujar lote nuevo'}
            </button>
          )}
          {lot.id !== DEMO_LOT.id && (
            <button
              type="button"
              onClick={() => { resetDemoState(); setLot(DEMO_LOT); }}
              className="h-9 px-3 rounded-[var(--radius-control)] text-[13px] font-semibold text-[var(--color-brand-primary)] hover:bg-[var(--color-brand-soft)]"
            >
              Volver al lote demo
            </button>
          )}

          <button
            type="button"
            onClick={() => void handleReset()}
            disabled={workflow.busy === 'reset'}
            className="ml-auto h-9 px-3 rounded-[var(--radius-control)] text-[13px] font-semibold text-[var(--color-text-muted)] hover:text-[var(--color-ink)] hover:bg-[var(--color-neutral-soft)] disabled:opacity-50"
          >
            Reiniciar demo
          </button>
        </div>

        {(creating || createError) && (
          <div role="status" className={`rounded-[var(--radius-card)] px-4 py-3 text-[14px] ${createError ? 'bg-[var(--color-danger-soft)] text-[var(--color-danger)]' : 'bg-[var(--color-brand-soft)] text-[var(--color-brand-primary)]'}`}>
            {createError ?? creating}
          </div>
        )}

        {/* ── Los cuatro números ─────────────────────────── */}
        <KpiStrip capacity={capacityData} score={scoreData} lot={workflow.state} />

        {/* ── Mapa + fotos | condición + acciones ─────────── */}
        <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1.55fr)_minmax(400px,1fr)] gap-5">
          <div className="flex flex-col gap-5 min-w-0">
            <DashSection
              id="mapa-lote"
              noPadding
              titulo={`${lot.nombre} · ${lot.ha} ha · ${lot.departamento}`}
              aside={<span className="text-[11px] text-[var(--color-text-muted)]">{role === 'productor' ? 'Tocá un punto para subir la foto' : drawing ? 'Dos clics: una esquina y la opuesta' : 'Cinco puntos de muestreo'}</span>}
            >
              <div className="h-[520px]">
                <MapaLote
                  polygon={lot.polygon}
                  points={lot.points}
                  drawing={drawing}
                  selectedPointId={selectedPointId}
                  onPointSelect={(id) => setSelectedPointId(id)}
                  onPolygonComplete={(ring) => void handlePolygonComplete(ring)}
                  onCancelDraw={() => setDrawing(false)}
                />
              </div>
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
                <em>Medido</em>: satélite y clima. <em>Estimado</em>: modelo de visión sobre fotos. <em>Simulado</em>: valor de ejemplo hasta tener fotos en {workflow.state?.min_points_for_score ?? 3} puntos.
              </p>
            </DashSection>
          </div>

          <div className="flex flex-col gap-5">
            <DashSection id="semaforo" titulo="Semáforo de condición">
              <TrafficLightGauge value={scoreData?.result.score_exact ?? null} size="lg" />
              <div className="mt-5">
                <ConditionSummary scoreData={scoreData} isLoading={isLoading} error={error} onRetry={retry} />
              </div>
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
