'use client';

import React, { useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { demoReducer, getEstadoInicial } from '@/lib/demoReducer';
import { buildIndicators } from '@/data/fixtures';
import { calcularMedianaMalezas } from '@/lib/scoreUtils';
import { buildEvidenceRequest } from '@/lib/evidenceClient';
import { workflowClient, type LotPoint, type LotSummary } from '@/lib/workflowClient';
import demoLotFile from '../../data/lotes/lote-demo-rio-primero.json';

// ── Hooks y API ───────────────────────────────────────────────
import { useEvidenceApi } from '@/hooks/useEvidenceApi';
import { useCapacity } from '@/hooks/useCapacity';
import { useReport } from '@/hooks/useReport';
import { useLotWorkflow } from '@/hooks/useLotWorkflow';

// ── Layout ────────────────────────────────────────────────────
import { AppHeader } from '@/components/layout/AppHeader';
import { DemoDisclaimer } from '@/components/layout/DemoDisclaimer';

// ── Componentes de dominio ────────────────────────────────────
import { ConditionSummary } from '@/components/lote/ConditionSummary';
import { EvidenceCard } from '@/components/lote/EvidenceCard';
import { SimulatedLimitCard } from '@/components/lote/SimulatedLimitCard';
import { MapaLote } from '@/components/lote/MapaLote';
import type { LatLng } from '@/components/lote/LeafletMap';
import { PhotoBatchUpload } from '@/components/vision/PhotoBatchUpload';
import type { PhotoGps } from '@/lib/photoGps';
import { YieldSeriesChart } from '@/components/lote/YieldSeriesChart';
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

/** Closed GeoJSON ring (lon, lat) -> open Leaflet ring (lat, lon). */
const ringOf = (geometry: { coordinates: number[][][] }): LatLng[] =>
  geometry.coordinates[0].slice(0, -1).map(([lon, lat]) => [lat, lon] as LatLng);

const pointsOf = (points: unknown): LotPoint[] =>
  (Array.isArray(points) ? points : (points as { points: LotPoint[] }).points) as LotPoint[];

// The demo lot is a real, irregular field in Río Primero built through the same
// pipeline as a drawn polygon and committed under data/lotes/.
const DEMO_LOT: LotView = {
  id: demoLotFile.lote.id,
  nombre: demoLotFile.lote.nombre,
  ha: demoLotFile.lote.ha,
  departamento: demoLotFile.lote.departamento,
  polygon: ringOf(demoLotFile.geometry),
  points: pointsOf(demoLotFile.points),
};

const LOT_STORAGE_KEY = 'precrop.lote';

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
        'bg-[var(--color-surface-sage)] rounded-[var(--radius-card)]',
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
  const [lots, setLots] = useState<LotSummary[]>([]);
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
  // The evidence cards show what the API actually measured for this lot and scene,
  // not the fixture values of the committed pack.
  const payload = (scoreData?.evidence.payload ?? null) as Record<string, unknown> | null;
  const indicadores = buildIndicators(scenario, currentWeeds, realAssessedCount >= 3 ? 'estimado' : 'simulado').map((ind) => {
    if (!payload) return ind;
    const fecha = typeof payload.observed_date === 'string' ? payload.observed_date : ind.fecha;
    if (ind.id === 'ndvi' && typeof payload.ndvi === 'number') return { ...ind, valor: payload.ndvi, fecha };
    if (ind.id === 'lluvia' && typeof payload.rain_mm_7d === 'number') return { ...ind, valor: payload.rain_mm_7d, fecha };
    if (ind.id === 'malezas' && typeof payload.weeds_pct === 'number') return { ...ind, valor: payload.weeds_pct, fecha, tipo: payload.weeds_source === 'estimated' ? 'estimado' as const : 'simulado' as const };
    return ind;
  });

  // Cada foto analizada (modelo, o valor de ejemplo si ninguna API respondió) se
  // registra en el estado del lote con su metadata GPS: la del EXIF cuando la foto
  // la trae, o la del punto asignado (mock) cuando no la trae.
  const synced = useRef<Set<string>>(new Set());
  const photoGps = useRef<Record<string, PhotoGps>>({});
  useEffect(() => {
    for (const [pointId, st] of Object.entries(visionResults)) {
      const r = st.result;
      if (st.status !== 'completed' || !r || r.status !== 'assessed') continue;
      const isModel = r.source === 'model';
      const key = `${lot.id}:${pointId}:${r.weedsPct}:${isModel ? r.confidence : 'preset'}`;
      if (synced.current.has(key)) continue;
      synced.current.add(key);
      const point = lot.points.find((p) => p.point_id === pointId);
      const gps = photoGps.current[pointId] ?? ((isModel && r.gps) ? { ...r.gps, source: 'exif' } : (point ? { lat: point.lat, lon: point.lon, source: 'exif-mock' } : undefined));
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
    photoGps.current = {};
    dispatch({ tipo: 'LIMPIAR_RESULTADOS' });
    setSelectedPointId(null);
  };

  const remember = (id: string) => { try { localStorage.setItem(LOT_STORAGE_KEY, id); } catch { /* private mode */ } };

  const refreshLots = async () => {
    try {
      const r = await workflowClient.listLots();
      const known = r.lotes.filter((l) => l.id !== 'demo-rio-segundo-01');
      known.sort((a, b) => (a.id === DEMO_LOT.id ? -1 : b.id === DEMO_LOT.id ? 1 : a.nombre.localeCompare(b.nombre)));
      setLots(known);
    } catch { /* the selector simply shows the current lot */ }
  };

  const selectLot = async (id: string) => {
    if (id === lot.id) return;
    setDrawing(false);
    if (id === DEMO_LOT.id) { resetDemoState(); setLot(DEMO_LOT); remember(id); return; }
    try {
      const d = await workflowClient.getLot(id);
      resetDemoState();
      setLot({ id: d.lote.id, nombre: d.lote.nombre, ha: d.lote.ha, departamento: d.lote.departamento, polygon: ringOf(d.geometry), points: pointsOf(d.points) });
      remember(id);
    } catch (e) {
      setCreateError(e instanceof Error ? e.message : 'No se pudo cargar el lote');
    }
  };

  // Lots drawn in earlier sessions stay available, and the last one used comes back after a reload.
  useEffect(() => {
    const t = setTimeout(() => {
      void refreshLots();
      let saved: string | null = null;
      try { saved = localStorage.getItem(LOT_STORAGE_KEY); } catch { saved = null; }
      if (saved && saved !== DEMO_LOT.id) void selectLot(saved);
    }, 0);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
      remember(created.lote.id);
      void refreshLots();
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

      <main id="contenido-principal" tabIndex={-1} className="flex-1 w-full px-4 md:px-6 2xl:px-10 py-5 md:py-6 outline-none flex flex-col gap-5">
        {/* ── Barra de control ──────────────────────────── */}
        <div className="flex flex-wrap items-center gap-4 md:gap-6 bg-[var(--color-surface-sage)] border border-[var(--color-border)] rounded-[var(--radius-card)] shadow-[var(--shadow-card)] px-4 py-3 print:hidden" data-print-hide>
          <div className="flex items-center gap-2 p-1 rounded-[var(--radius-pill)] bg-[var(--color-surface)] border border-[var(--color-border)]" role="group" aria-label="Rol">
            <span className="text-[12px] font-semibold uppercase tracking-wide text-[var(--color-text-muted)] ml-2 mr-1">Ver como</span>
            {(['coop', 'productor'] as const).map((r) => (
              <button
                key={r}
                type="button"
                aria-pressed={role === r}
                onClick={() => setRole(r)}
                className={`h-9 px-4 rounded-[var(--radius-pill)] text-[13px] font-semibold transition-colors ${role === r ? 'bg-[var(--color-brand-primary)] text-white shadow-sm' : 'bg-transparent text-[var(--color-ink)] hover:bg-[var(--color-border)]/50'}`}
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
              {drawing ? 'Dibujando… (clic por vértice)' : 'Dibujar lote nuevo'}
            </button>
          )}
          <div className="flex items-center gap-2">
            <label htmlFor="lote-select" className="text-[12px] font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">Lote</label>
            <select
              id="lote-select"
              className="h-9 max-w-[280px] border border-[var(--color-control-border)] px-2 rounded-[var(--radius-control)] text-[13px] bg-[var(--color-surface)] focus:outline-none focus:ring-2 focus:ring-[var(--color-brand-primary)]"
              value={lot.id}
              disabled={!!creating}
              onChange={(e) => void selectLot(e.target.value)}
            >
              {(lots.some((l) => l.id === lot.id) ? lots : [{ id: lot.id, nombre: lot.nombre, ha: lot.ha, departamento: lot.departamento }, ...lots]).map((l) => (
                <option key={l.id} value={l.id}>{l.nombre} · {l.ha} ha</option>
              ))}
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
              aside={<span className="text-[11px] text-[var(--color-text-muted)]">{drawing ? 'Un clic por vértice; doble clic para cerrar' : `${lot.points.length} puntos de muestreo`}</span>}
            >
              <div className="h-[520px]">
                <MapaLote
                  polygon={lot.polygon}
                  points={lot.points}
                  drawing={drawing}
                  selectedPointId={selectedPointId}
                  photoPointIds={Object.entries(visionResults).filter(([, st]) => st.status === 'completed' && st.result?.status === 'assessed').map(([id]) => id)}
                  onPointSelect={(id) => setSelectedPointId(id)}
                  onPolygonComplete={(ring) => void handlePolygonComplete(ring)}
                  onCancelDraw={() => setDrawing(false)}
                />
              </div>
            </DashSection>

            {role === 'productor' ? (
              <DashSection id="fotos-lote" titulo="Fotos de la recorrida" aside={<span className="text-[11px] text-[var(--color-text-muted)]">Asignación por GPS de la foto</span>}>
                <PhotoBatchUpload
                  lotId={lot.id}
                  points={lot.points}
                  scenario={scenario}
                  visionResults={visionResults}
                  selectedPointId={selectedPointId}
                  minPhotos={workflow.state?.min_points_for_score ?? 3}
                  onAction={(action) => dispatch(action)}
                  onAssign={(pointId, gps) => { photoGps.current[pointId] = gps; }}
                  onSelectPoint={(id) => setSelectedPointId((cur) => (cur === id ? null : id))}
                />
              </DashSection>
            ) : (
              selectedPointId && (
                <p className="text-[13px] text-[var(--color-text-muted)] px-1">
                  Punto {selectedPointId}: las fotos las sube el productor. Cambiá a “Productor” para cargarlas.
                </p>
              )
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

            <DashSection id="serie-oficial" titulo={`Serie oficial · ${lot.departamento}`} aside={capacityData ? <span className="text-[11px] text-[var(--color-text-muted)]">{capacityData.capacity.series.length} campañas</span> : undefined}>
              {capacityData ? (
                <YieldSeriesChart series={capacityData.capacity.series} worstCampana={capacityData.capacity.worst_year?.campana ?? null} height={96} />
              ) : (
                <p className="text-[12px] text-[var(--color-text-muted)]">{capacityLoading ? 'Cargando la serie oficial…' : 'Sin serie oficial.'}</p>
              )}
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
