import React from 'react';
import type { ScoreResponse, CapacityResponse } from '@/types';
import type { LotStateResponse } from '@/lib/workflowClient';
import { ArrowRight, Wallet, Activity, ArrowUpRight, Image as ImageIcon } from 'lucide-react';
import { SkeletonValue } from '@/components/ui/Loading';
import { SeriesPanel } from './SeriesPanel';
import type { Role } from './RoleActions';

const usd = (n: number | null | undefined) => (n === null || n === undefined ? '—' : `USD ${Math.round(n).toLocaleString('es-AR')}`);

const LIGHT: Record<string, { label: string; dot: string; text: string }> = {
  verde: { label: 'Condición favorable', dot: 'bg-[var(--color-positive-bright)]', text: 'text-[var(--color-positive)]' },
  amarillo: { label: 'Condición en observación', dot: 'bg-[var(--color-warning)]', text: 'text-[var(--color-warning)]' },
  rojo: { label: 'Condición desfavorable', dot: 'bg-[var(--color-danger)]', text: 'text-[var(--color-danger)]' },
};

interface MetricCardProps {
  id: string;
  onClick: (id: string) => void;
  title: string;
  value: React.ReactNode;
  icon: React.ReactNode;
  indicator?: React.ReactNode;
}

function MetricCard({ id, onClick, title, value, icon, indicator }: MetricCardProps) {
  return (
    <button
      type="button"
      id={`metric-${id}`}
      onClick={() => onClick(id)}
      className="group text-left border rounded-[var(--radius-card)] shadow-[var(--shadow-card)] p-3 flex flex-col justify-between min-w-0 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-brand-primary)] focus-visible:ring-offset-2 bg-[var(--color-surface)] border-[var(--color-border)] hover:border-[var(--color-brand-primary)] hover:shadow-md h-full"
    >
      <div className="flex justify-between items-start w-full mb-2 gap-1">
        <div className="flex items-center gap-1.5 min-w-0">
          <div className="text-[var(--color-text-muted)] group-hover:text-[var(--color-brand-primary)] transition-colors shrink-0">
            {icon}
          </div>
          <span className="text-[10px] font-bold uppercase tracking-wide text-[var(--color-text-muted)] group-hover:text-[var(--color-ink)] transition-colors leading-tight">{title}</span>
        </div>
        <ArrowRight size={14} className="text-[var(--color-text-muted)] opacity-0 group-hover:opacity-100 transform group-hover:translate-x-1 transition-all shrink-0" aria-hidden="true" />
      </div>
      <div className="mt-auto">
        <div className="flex items-end gap-2">
          <span className="text-[20px] leading-none font-bold tabular-nums text-[var(--color-ink)]">{value}</span>
          {indicator && <div className="mb-0.5">{indicator}</div>}
        </div>
      </div>
    </button>
  );
}

/**
 * La coop decide cuanto presta; el productor mira cuanto le habilitaron. Las tarjetas
 * son las mismas, pero el titulo se lee distinto segun de que lado del mostrador este
 * quien las mira.
 */
const TITULOS: Record<Role, Record<'capacity' | 'condition' | 'available' | 'evidence', string>> = {
  coop: {
    capacity: 'Cupo pre-siembra',
    condition: 'Condición del cultivo',
    available: 'Disponible para desembolsar',
    evidence: 'Evidencia de campo',
  },
  productor: {
    capacity: 'Tu cupo aprobado',
    condition: 'Condición de tu lote',
    available: 'Disponible para retirar',
    evidence: 'Tus fotos del lote',
  },
};

interface MetricGridProps {
  capacity: CapacityResponse | null;
  score: ScoreResponse | null;
  lot: LotStateResponse | null;
  onSelectModal: (id: string) => void;
  role: Role;
  /** Peticiones en vuelo, para distinguir "todavia no llego" de "no hay dato". */
  capacityLoading?: boolean;
  scoreLoading?: boolean;
  lotLoading?: boolean;
}

export function MetricGrid({ capacity, score, lot, onSelectModal, role, capacityLoading = false, scoreLoading = false, lotLoading = false }: MetricGridProps) {
  const titulos = TITULOS[role];
  const cap = capacity?.capacity ?? null;
  const preSowing = cap?.pre_sowing_limit.usd ?? null;
  const hasCapacityData = capacity !== null;

  const light = score?.result.light ?? null;
  const lightCfg = light ? LIGHT[light] : null;

  const preview = lot?.preview ?? null;
  const available = preview ? preview.available_usd : null;
  
  const photos = lot?.photos_assessed ?? 0;
  const minPhotos = lot?.min_points_for_score ?? 3;

  return (
    <section aria-label="Métricas del lote" className="grid grid-cols-1 sm:grid-cols-2 sm:grid-rows-[auto_100px_100px] gap-3 h-full auto-rows-min content-start">
      {/* La serie encabeza el tablero a fila completa: es la evidencia de la que
          cuelgan las cuatro metricas de abajo. */}
      <SeriesPanel capacity={capacity} role={role} isLoading={capacityLoading} className="sm:col-span-2" />

      {/* 1. Cupo pre-siembra */}
      <MetricCard
        id="capacity"
        onClick={onSelectModal}
        title={titulos.capacity}
        icon={<Wallet size={16} strokeWidth={2.5} />}
        value={
          capacityLoading || !hasCapacityData ? <SkeletonValue className="h-[20px] w-28" /> :
          preSowing === null ? 'Sin respaldo' : usd(preSowing)
        }
      />
      
      {/* 2. Condición del cultivo */}
      <MetricCard
        id="condition"
        onClick={onSelectModal}
        title={titulos.condition}
        icon={<Activity size={16} strokeWidth={2.5} />}
        value={
          scoreLoading || !score ? <SkeletonValue className="h-[20px] w-20" /> :
          <>{score.result.score_exact.toFixed(1)}<span className="text-[12px] font-medium text-[var(--color-text-muted)]"> / 100</span></>
        }
        indicator={
          lightCfg ? (
            <span className="inline-flex items-center" title={lightCfg.label}>
              <span className={`h-2.5 w-2.5 rounded-full ${lightCfg.dot}`} aria-hidden />
            </span>
          ) : null
        }
      />

      {/* 3. Disponible para retirar */}
      <MetricCard
        id="available"
        onClick={onSelectModal}
        title={titulos.available}
        icon={<ArrowUpRight size={16} strokeWidth={2.5} />}
        value={
          lotLoading && !lot ? <SkeletonValue className="h-[20px] w-28" /> :
          available === null
            ? (!lot?.approved ? 'Pendiente' : (score?.advance?.advance_limit.usd != null ? usd(score.advance.advance_limit.usd) : 'Sin respaldo'))
            : usd(available)
        }
      />

      {/* 4. Evidencia de campo */}
      <MetricCard
        id="evidence"
        onClick={onSelectModal}
        title={titulos.evidence}
        icon={<ImageIcon size={16} strokeWidth={2.5} />}
        value={
          <>{photos}<span className="text-[12px] font-medium text-[var(--color-text-muted)]"> / {minPhotos}</span></>
        }
      />
    </section>
  );
}
