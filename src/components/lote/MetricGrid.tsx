import React from 'react';
import type { ScoreResponse, CapacityResponse } from '@/types';
import type { LotStateResponse } from '@/lib/workflowClient';
import { ArrowRight, Wallet, Activity, ArrowUpRight, Image as ImageIcon } from 'lucide-react';
import { SkeletonValue } from '@/components/ui/Loading';

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
      className="group text-left border rounded-[var(--radius-card)] shadow-[var(--shadow-card)] p-4 flex flex-col justify-between min-w-0 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-brand-primary)] focus-visible:ring-offset-2 bg-[var(--color-surface)] border-[var(--color-border)] hover:border-[var(--color-brand-primary)] hover:shadow-md h-full"
    >
      <div className="flex justify-between items-start w-full mb-3">
        <div className="flex items-center gap-2">
          <div className="text-[var(--color-text-muted)] group-hover:text-[var(--color-brand-primary)] transition-colors">
            {icon}
          </div>
          <span className="text-[12px] font-bold uppercase tracking-wide text-[var(--color-text-muted)] group-hover:text-[var(--color-ink)] transition-colors">{title}</span>
        </div>
        <ArrowRight size={16} className="text-[var(--color-text-muted)] opacity-0 group-hover:opacity-100 transform group-hover:translate-x-1 transition-all" aria-hidden="true" />
      </div>
      <div className="mt-auto">
        <div className="flex items-end gap-2">
          <span className="text-[26px] leading-none font-bold tabular-nums text-[var(--color-ink)]">{value}</span>
          {indicator && <div className="mb-1">{indicator}</div>}
        </div>
      </div>
    </button>
  );
}

interface MetricGridProps {
  capacity: CapacityResponse | null;
  score: ScoreResponse | null;
  lot: LotStateResponse | null;
  onSelectModal: (id: string) => void;
  /** Peticiones en vuelo, para distinguir "todavia no llego" de "no hay dato". */
  capacityLoading?: boolean;
  scoreLoading?: boolean;
  lotLoading?: boolean;
}

export function MetricGrid({ capacity, score, lot, onSelectModal, capacityLoading = false, scoreLoading = false, lotLoading = false }: MetricGridProps) {
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
    <section aria-label="Métricas del lote" className="grid grid-cols-1 sm:grid-cols-2 gap-4 h-full">
      {/* 1. Cupo pre-siembra */}
      <MetricCard
        id="capacity"
        onClick={onSelectModal}
        title="Cupo pre-siembra"
        icon={<Wallet size={18} strokeWidth={2.5} />}
        value={
          capacityLoading || !hasCapacityData ? <SkeletonValue className="h-[26px] w-36" /> :
          preSowing === null ? 'Sin respaldo' : usd(preSowing)
        }
      />
      
      {/* 2. Condición del cultivo */}
      <MetricCard
        id="condition"
        onClick={onSelectModal}
        title="Condición del cultivo"
        icon={<Activity size={18} strokeWidth={2.5} />}
        value={
          scoreLoading || !score ? <SkeletonValue className="h-[26px] w-24" /> :
          <>{score.result.score_exact.toFixed(1)}<span className="text-[14px] font-medium text-[var(--color-text-muted)]"> / 100</span></>
        }
        indicator={
          lightCfg ? (
            <span className="inline-flex items-center" title={lightCfg.label}>
              <span className={`h-3 w-3 rounded-full ${lightCfg.dot}`} aria-hidden />
            </span>
          ) : null
        }
      />

      {/* 3. Disponible para retirar */}
      <MetricCard
        id="available"
        onClick={onSelectModal}
        title="Disponible para retirar"
        icon={<ArrowUpRight size={18} strokeWidth={2.5} />}
        value={
          lotLoading && !lot ? <SkeletonValue className="h-[26px] w-36" /> :
          available === null
            ? (!lot?.approved ? 'Pendiente' : (score?.advance?.advance_limit.usd != null ? usd(score.advance.advance_limit.usd) : 'Sin respaldo'))
            : usd(available)
        }
      />

      {/* 4. Evidencia de campo */}
      <MetricCard
        id="evidence"
        onClick={onSelectModal}
        title="Evidencia de campo"
        icon={<ImageIcon size={18} strokeWidth={2.5} />}
        value={
          <>{photos}<span className="text-[14px] font-medium text-[var(--color-text-muted)]"> / {minPhotos}</span></>
        }
      />
    </section>
  );
}
