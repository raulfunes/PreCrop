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
import { CapacityScreen } from '@/components/lote/CapacityScreen';
import { ReportScreen } from '@/components/lote/ReportScreen';
import { KpiStrip } from '@/components/lote/KpiStrip';
import { RoleActions, type Role } from '@/components/lote/RoleActions';
import { TrafficLightGauge } from '@/components/lote/TrafficLightGauge';

// ── UI ────────────────────────────────────────────────────────
import { ErrorBoundary } from '@/components/ui/ErrorBoundary';

type Scenario = 'bueno' | 'mixto' | 'malo';
type TabId = 'condicion' | 'capacidad' | 'informe';

interface LotView {
  id: string;
  nombre: string;
  ha: number;
  departamento: string;
  polygon: LatLng[] | null;
  points: LotPoint[];
}

const ringOf = (geometry: { coordinates: number[][][] }): LatLng[] =>
  geometry.coordinates[0].slice(0, -1).map(([lon, lat]) => [lat, lon] as LatLng);

const pointsOf = (points: unknown): LotPoint[] =>
  (Array.isArray(points) ? points : (points as { points: LotPoint[] }).points) as LotPoint[];

const DEMO_LOT: LotView = {
  id: demoLotFile.lote.id,
  nombre: demoLotFile.lote.nombre,
  ha: demoLotFile.lote.ha,
  departamento: demoLotFile.lote.departamento,
  polygon: ringOf(demoLotFile.geometry),
  points: pointsOf(demoLotFile.points),
};

const LOT_STORAGE_KEY = 'precrop.lote';

interface DashSectionProps {
  id: string;
  titulo?: string;
  aside?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  noPadding?: boolean;
  tabIndex?: number;
}

function DashSection({ id, titulo, aside, children, className = '', noPadding, tabIndex }: DashSectionProps) {
  return (
    <section
      id={id}
      tabIndex={tabIndex}
      className={[
        'bg-[var(--color-surface)] rounded-[var(--radius-card)]',
        'border border-[var(--color-border)] shadow-[var(--shadow-card)]',
        noPadding ? 'overflow-hidden' : 'p-4 md:p-5',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-brand-primary)]',
        className,
      ].join(' ')}
    >
      {(titulo || aside) && (
        <div className={`flex items-start justify-between gap-3 ${noPadding ? 'px-4 pt-4 pb-3' : 'mb-3'}`}>
          {titulo && <h2 className="text-[12px] font-bold text-[var(--color-text-muted)] uppercase tracking-wide">{titulo}</h2>}
          {aside}
        </div>
      )}
      <ErrorBoundary>{children}</ErrorBoundary>
    </section>
  );
}

export default function HomePage() {
  const [estadoDemo, dispatch] = useReducer(demoReducer, undefined, getEstadoInicial);
  const { scenario, visionResults } = estadoDemo;
  const [selectedPointId, setSelectedPointId] = useState<string | null>(null);
  const [role, setRole] = useState<Role>('coop');
  
  const [activeTab, setActiveTab] = useState<TabId>('condicion');
  const [activeKpi, setActiveKpi] = useState<string>('score');

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
  // Fetch report in background, ready for tab
  const { markdown: reportMarkdown, isLoading: reportLoading, error: reportError, retry: reportRetry } = useReport(scenario, activeTab === 'informe', reportOptions, lot.id);

  const currentWeeds = calcularMedianaMalezas(visionResults, scenario);
  const realAssessedCount = Object.values(visionResults).filter((r) => r.status === 'completed' && r.result?.status === 'assessed' && r.result.source === 'model').length;
  
  const payload = (scoreData?.evidence.payload ?? null) as Record<string, unknown> | null;
  const indicadores = buildIndicators(scenario, currentWeeds, realAssessedCount >= 3 ? 'estimado' : 'simulado').map((ind) => {
    if (!payload) return ind;
    const fecha = typeof payload.observed_date === 'string' ? payload.observed_date : ind.fecha;
    if (ind.id === 'ndvi' && typeof payload.ndvi === 'number') return { ...ind, valor: payload.ndvi, fecha };
    if (ind.id === 'lluvia' && typeof payload.rain_mm_7d === 'number') return { ...ind, valor: payload.rain_mm_7d, fecha };
    if (ind.id === 'malezas' && typeof payload.weeds_pct === 'number') return { ...ind, valor: payload.weeds_pct, fecha, tipo: payload.weeds_source === 'estimated' ? 'estimado' as const : 'simulado' as const };
    return ind;
  });

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
    } catch { /* ignored */ }
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
    setCreating('Procesando el lote...');
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

  const handleKpiSelect = (id: string) => {
    setActiveKpi(id);
    if (id === 'capacidad') setActiveTab('capacidad');
    else setActiveTab('condicion');

    setTimeout(() => {
      const elId = id === 'decision' ? 'acciones' : id === 'evidence' ? 'evidencia-lote' : id === 'capacidad' ? 'capacidad-resumen' : 'semaforo';
      const el = document.getElementById(elId);
      if (el) {
        el.focus({ preventScroll: true });
        el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
    }, 50);
  };

  return (
    <div className="min-h-screen flex flex-col bg-[var(--color-canvas)]">
      <AppHeader />

      <main id="contenido-principal" tabIndex={-1} className="flex-1 w-full max-w-[1920px] mx-auto px-4 md:px-6 2xl:px-10 py-4 outline-none flex flex-col gap-4">
        {/* ── Barra de control compacta ──────────────────────────── */}
        <div className="flex flex-wrap items-center gap-3 lg:gap-4 bg-[var(--color-surface-sage)] border border-[var(--color-border)] rounded-[var(--radius-card)] shadow-[var(--shadow-card)] px-3 py-2 lg:px-4 print:hidden" data-print-hide>
          <div className="flex items-center gap-1 p-0.5 rounded-[var(--radius-pill)] bg-[var(--color-surface)] border border-[var(--color-border)]" role="group" aria-label="Rol">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-[var(--color-text-muted)] ml-2 mr-1 hidden lg:inline">Ver como</span>
            {(['coop', 'productor'] as const).map((r) => (
              <button
                key={r}
                type="button"
                aria-pressed={role === r}
                onClick={() => setRole(r)}
                className={`h-8 px-3 rounded-[var(--radius-pill)] text-[12px] font-semibold transition-colors ${role === r ? 'bg-[var(--color-brand-primary)] text-white shadow-sm' : 'bg-transparent text-[var(--color-ink)] hover:bg-[var(--color-border)]/50'}`}
              >
                {r === 'coop' ? 'Cooperativa' : 'Productor'}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2">
            <label htmlFor="scenario-select" className="text-[11px] font-semibold uppercase tracking-wide text-[var(--color-text-muted)] hidden lg:inline">Escena satelital</label>
            <select
              id="scenario-select"
              className="h-8 border border-[var(--color-control-border)] px-2 rounded-[var(--radius-control)] text-[12px] bg-[var(--color-surface)] focus:outline-none focus:ring-2 focus:ring-[var(--color-brand-primary)]"
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
              className={`h-8 px-3 rounded-[var(--radius-control)] text-[12px] font-semibold border transition-colors disabled:opacity-50 ${drawing ? 'bg-[var(--color-warning-soft)] border-[var(--color-warning)] text-[var(--color-warning)]' : 'bg-[var(--color-surface)] border-[var(--color-brand-primary)] text-[var(--color-brand-primary)] hover:bg-[var(--color-brand-soft)]'}`}
            >
              {drawing ? 'Dibujando… (clic por vértice)' : 'Dibujar nuevo'}
            </button>
          )}
          
          <div className="flex items-center gap-2">
            <label htmlFor="lote-select" className="text-[11px] font-semibold uppercase tracking-wide text-[var(--color-text-muted)] hidden lg:inline">Lote</label>
            <select
              id="lote-select"
              className="h-8 max-w-[200px] lg:max-w-[280px] border border-[var(--color-control-border)] px-2 rounded-[var(--radius-control)] text-[12px] bg-[var(--color-surface)] focus:outline-none focus:ring-2 focus:ring-[var(--color-brand-primary)] text-ellipsis"
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
            className="ml-auto h-8 px-2 lg:px-3 rounded-[var(--radius-control)] text-[12px] font-semibold text-[var(--color-text-muted)] hover:text-[var(--color-ink)] hover:bg-[var(--color-neutral-soft)] disabled:opacity-50"
          >
            Reiniciar demo
          </button>
        </div>

        {(creating || createError) && (
          <div role="status" className={`rounded-[var(--radius-card)] px-4 py-2 text-[13px] ${createError ? 'bg-[var(--color-danger-soft)] text-[var(--color-danger)]' : 'bg-[var(--color-brand-soft)] text-[var(--color-brand-primary)]'}`}>
            {createError ?? creating}
          </div>
        )}

        {/* ── KPIs (Tab triggers) ─────────────────────────── */}
        <KpiStrip capacity={capacityData} score={scoreData} lot={workflow.state} activeId={activeKpi} onSelect={handleKpiSelect} />

        {/* ── Área de Trabajo (Workspace) ─────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-[56%_44%] xl:grid-cols-[58%_42%] gap-5 lg:min-h-[clamp(520px,calc(100vh-280px),760px)]">
          {/* Columna Izquierda: Mapa (En móvil pasa abajo) */}
          <div className="flex flex-col min-w-0 bg-[var(--color-surface)] rounded-[var(--radius-card)] border border-[var(--color-border)] shadow-[var(--shadow-card)] overflow-hidden order-2 lg:order-1">
            <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--color-border)] bg-[var(--color-surface-sage)]">
              <h2 className="text-[13px] font-bold text-[var(--color-text-muted)] uppercase tracking-wide">
                {lot.nombre} · {lot.ha} ha · {lot.departamento}
              </h2>
              <span className="text-[11px] text-[var(--color-text-muted)] hidden sm:inline">
                {drawing ? 'Un clic por vértice; doble clic para cerrar' : `${lot.points.length} puntos de muestreo`}
              </span>
            </div>
            <div className="flex-1 relative min-h-[400px]">
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
          </div>

          {/* Columna Derecha: Panel Operativo (En móvil pasa arriba) */}
          <div className="flex flex-col min-w-0 bg-[var(--color-canvas)] rounded-[var(--radius-card)] border border-[var(--color-border)] shadow-[var(--shadow-card)] overflow-hidden order-1 lg:order-2">
            <div className="flex px-4 pt-3 bg-[var(--color-surface-sage)] border-b border-[var(--color-border)] gap-6 shadow-sm overflow-x-auto" role="tablist" aria-label="Panel Operativo">
              <button
                role="tab"
                aria-selected={activeTab === 'condicion'}
                onClick={() => { setActiveTab('condicion'); setActiveKpi('score'); }}
                className={`pb-2.5 px-1 text-[13px] font-semibold border-b-[3px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-brand-primary)] ${activeTab === 'condicion' ? 'border-[var(--color-brand-primary)] text-[var(--color-brand-primary)]' : 'border-transparent text-[var(--color-text-muted)] hover:text-[var(--color-ink)] hover:border-[var(--color-control-border)]'}`}
              >
                Condición
              </button>
              <button
                role="tab"
                aria-selected={activeTab === 'capacidad'}
                onClick={() => { setActiveTab('capacidad'); setActiveKpi('capacidad'); }}
                className={`pb-2.5 px-1 text-[13px] font-semibold border-b-[3px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-brand-primary)] ${activeTab === 'capacidad' ? 'border-[var(--color-brand-primary)] text-[var(--color-brand-primary)]' : 'border-transparent text-[var(--color-text-muted)] hover:text-[var(--color-ink)] hover:border-[var(--color-control-border)]'}`}
              >
                Capacidad
              </button>
              <button
                role="tab"
                aria-selected={activeTab === 'informe'}
                onClick={() => { setActiveTab('informe'); setActiveKpi(''); }}
                className={`pb-2.5 px-1 text-[13px] font-semibold border-b-[3px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-brand-primary)] ${activeTab === 'informe' ? 'border-[var(--color-brand-primary)] text-[var(--color-brand-primary)]' : 'border-transparent text-[var(--color-text-muted)] hover:text-[var(--color-ink)] hover:border-[var(--color-control-border)]'}`}
              >
                Informe
              </button>
            </div>

            <div id="operative-panel" className="flex-1 overflow-y-auto p-4 md:p-5 flex flex-col gap-5">
              {activeTab === 'condicion' && (
                <>
                  <DashSection id="semaforo" titulo="Resumen de Condición" tabIndex={-1}>
                    <div className="flex items-center gap-6">
                      <div className="shrink-0">
                        <TrafficLightGauge value={scoreData?.result.score_exact ?? null} size="lg" />
                      </div>
                      <div className="flex-1">
                        <ConditionSummary scoreData={scoreData} isLoading={isLoading} error={error} onRetry={retry} />
                      </div>
                    </div>
                  </DashSection>

                  <DashSection id="evidencia-lote" titulo="Evidencia Base" tabIndex={-1} aside={<span className="text-[10px] text-[var(--color-text-muted)] bg-[var(--color-neutral-soft)] px-2 py-0.5 rounded-[var(--radius-pill)]">Satélite, clima y fotos</span>}>
                    <div className="flex flex-col gap-3">
                      <div className="grid grid-cols-3 gap-2" role="list" aria-label="Indicadores">
                        {indicadores.map((ind, idx) => (
                          <div key={ind.id} role="listitem">
                            <EvidenceCard indicador={ind} primerAparicion={idx === 0 && !!ind.sigla} />
                          </div>
                        ))}
                      </div>
                      <p className="text-[11px] text-[var(--color-text-muted)] leading-tight text-center mt-1">
                        <em>Medido</em>: satélite y clima. <em>Estimado</em>: visión artificial. <em>Simulado</em>: valores por defecto hasta contar con 3 fotos reales.
                      </p>
                    </div>
                  </DashSection>

                  {role === 'productor' ? (
                    <DashSection id="fotos-lote" titulo="Fotos de la recorrida" tabIndex={-1}>
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
                      <p className="text-[12px] text-[var(--color-text-muted)] px-2 bg-[var(--color-neutral-soft)] py-2 rounded">
                        Punto <strong>{selectedPointId}</strong> seleccionado. Cambiá a “Productor” para gestionar las fotos.
                      </p>
                    )
                  )}

                  <DashSection id="acciones" titulo={role === 'coop' ? 'Decisión de la cooperativa' : 'Solicitud del productor'} tabIndex={-1}>
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

                  <details className="group bg-[var(--color-surface)] border border-[var(--color-border)] rounded-[var(--radius-card)] shadow-[var(--shadow-card)] overflow-hidden focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-brand-primary)]">
                    <summary className="flex items-center justify-between p-4 cursor-pointer hover:bg-[var(--color-neutral-soft)] font-semibold text-[13px] text-[var(--color-text-muted)] uppercase tracking-wide focus:outline-none">
                      Regla del límite aplicable
                      <span className="transition group-open:rotate-180 text-[var(--color-brand-primary)]">▼</span>
                    </summary>
                    <div className="p-4 pt-2 border-t border-[var(--color-border)]">
                      <SimulatedLimitCard advance={scoreData?.advance || null} superseded_advance={scoreData?.superseded_advance || undefined} />
                    </div>
                  </details>
                </>
              )}

              {activeTab === 'capacidad' && (
                <div id="capacidad-resumen" tabIndex={-1} className="outline-none">
                  <CapacityScreen data={capacityData} isLoading={capacityLoading} error={capacityError} onRetry={capacityRetry} />
                </div>
              )}

              {activeTab === 'informe' && (
                <div id="informe-resumen" tabIndex={-1} className="flex flex-col gap-4 outline-none">
                  <div className="bg-[var(--color-surface)] p-5 rounded-[var(--radius-card)] border border-[var(--color-border)] shadow-[var(--shadow-card)]">
                    <h3 className="text-[16px] font-bold text-[var(--color-ink)] mb-2">Informe consolidado</h3>
                    <p className="text-[13px] text-[var(--color-text-muted)] leading-relaxed mb-4">
                      Este documento resume la capacidad histórica, la condición actual evaluada por satélite e IA, los factores climáticos intervinientes y el cuadro de firmas requerido para la aprobación final.
                    </p>
                    <ReportScreen markdown={reportMarkdown} isLoading={reportLoading} error={reportError} onRetry={reportRetry} scenario={scenario} />
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </main>

      <DemoDisclaimer />
    </div>
  );
}
