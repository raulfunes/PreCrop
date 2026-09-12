'use client';

import React from 'react';
import type { ScoreResponse, CapacityResponse } from '@/types';
import type { LotStateResponse } from '@/lib/workflowClient';
import { TrafficLightGauge } from './TrafficLightGauge';
import { ChevronDown } from 'lucide-react';

const usd = (n: number | null | undefined) => (n === null || n === undefined ? '—' : `USD ${Math.round(n).toLocaleString('es-AR')}`);

const LIGHT: Record<string, { label: string; dot: string; text: string }> = {
  verde: { label: 'Condición favorable', dot: 'bg-[var(--color-positive-bright)]', text: 'text-[var(--color-positive)]' },
  amarillo: { label: 'Condición en observación', dot: 'bg-[var(--color-warning)]', text: 'text-[var(--color-warning)]' },
  rojo: { label: 'Condición desfavorable', dot: 'bg-[var(--color-danger)]', text: 'text-[var(--color-danger)]' },
};

interface KpiProps {
  id: string;
  active: boolean;
  onClick: (id: string) => void;
  eyebrow: string;
  value: React.ReactNode;
  detail: React.ReactNode;
  tone?: 'brand' | 'ink' | 'danger' | 'warning';
  footer?: React.ReactNode;
}

function Kpi({ id, active, onClick, eyebrow, value, detail, tone = 'ink', footer }: KpiProps) {
  const toneClass = {
    brand: 'text-[var(--color-brand-primary)]',
    ink: 'text-[var(--color-ink)]',
    danger: 'text-[var(--color-danger)]',
    warning: 'text-[var(--color-warning)]',
  }[tone];

  return (
    <button
      type="button"
      id={`kpi-${id}`}
      aria-expanded={active}
      aria-controls="operative-panel"
      onClick={() => onClick(id)}
      className={`text-left border rounded-[var(--radius-card)] shadow-[var(--shadow-card)] p-3 md:p-4 flex flex-col gap-0.5 min-w-0 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-brand-primary)] focus-visible:ring-offset-2 ${
        active
          ? 'border-[var(--color-brand-primary)] bg-[var(--color-brand-soft)]/50'
          : 'bg-[var(--color-surface)] border-[var(--color-border)] hover:border-[var(--color-control-border)]'
      }`}
    >
      <div className="flex justify-between items-center w-full">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">{eyebrow}</span>
        <ChevronDown size={14} className={`transition-transform ${active ? 'rotate-180 text-[var(--color-brand-primary)]' : 'text-[var(--color-text-muted)]'}`} aria-hidden />
      </div>
      <span className={`text-[24px] lg:text-[28px] leading-tight font-bold tabular-nums ${toneClass}`}>{value}</span>
      <span className="text-[12px] lg:text-[13px] text-[var(--color-text-muted)] leading-snug line-clamp-2" title={typeof detail === 'string' ? detail : undefined}>{detail}</span>
      {footer && <div className="mt-auto pt-2 w-full">{footer}</div>}
    </button>
  );
}

interface KpiStripProps {
  capacity: CapacityResponse | null;
  score: ScoreResponse | null;
  lot: LotStateResponse | null;
  activeId: string;
  onSelect: (id: string) => void;
}

/** The four numbers a committee reads first, acting as tab triggers for the operative panel. */
export function KpiStrip({ capacity, score, lot, activeId, onSelect }: KpiStripProps) {
  const cap = capacity?.capacity ?? null;
  const preSowing = cap?.pre_sowing_limit.usd ?? null;
  const worst = cap?.worst_year ?? null;
  const approved = lot?.approved ?? null;

  const light = score?.result.light ?? null;
  const lightCfg = light ? LIGHT[light] : null;
  const observed = typeof score?.evidence.payload.observed_date === 'string' ? score.evidence.payload.observed_date : null;

  const preview = lot?.preview ?? null;
  const available = preview ? preview.available_usd : null;
  const paid = lot?.paid_usd ?? 0;
  const photos = lot?.photos_assessed ?? 0;
  const minPhotos = lot?.min_points_for_score ?? 3;
  const paidCount = lot?.disbursements.filter((d) => d.status === 'paid').length ?? 0;
  const rejectedCount = lot?.disbursements.filter((d) => d.status === 'rejected').length ?? 0;

  return (
    <section aria-label="Resumen del lote" className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
      <Kpi
        id="capacidad"
        active={activeId === 'capacidad'}
        onClick={onSelect}
        eyebrow="Cupo pre-siembra"
        value={usd(preSowing)}
        tone="brand"
        detail={worst ? <>Peor año oficial: <strong>{worst.campana}</strong>, {worst.yield_t_ha.toFixed(2)} t/ha</> : 'Calculando capacidad…'}
        footer={
          approved ? (
            <span className="inline-flex items-center gap-1 rounded-[var(--radius-pill)] bg-[var(--color-brand-soft)] px-2 py-0.5 text-[11px] font-semibold text-[var(--color-brand-primary)]">
              Aprobado · {usd(approved.quota_usd)}
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 rounded-[var(--radius-pill)] bg-[var(--color-neutral-soft)] px-2 py-0.5 text-[11px] font-semibold text-[var(--color-text-muted)]">
              Pendiente de aprobación
            </span>
          )
        }
      />
      <Kpi
        id="score"
        active={activeId === 'score'}
        onClick={onSelect}
        eyebrow="Condición del cultivo"
        value={score ? <>{score.result.score_exact.toFixed(1)}<span className="text-[14px] font-medium text-[var(--color-text-muted)]"> /100</span></> : '—'}
        tone={light === 'rojo' ? 'danger' : light === 'amarillo' ? 'warning' : 'ink'}
        detail={observed ? `Satélite del ${observed}` : 'Esperando escena…'}
        footer={
          <div className="flex flex-col gap-1.5 w-full">
            <TrafficLightGauge value={score?.result.score_exact ?? null} size="sm" />
            {lightCfg && (
              <span className={`inline-flex items-center gap-1.5 text-[11px] font-semibold ${lightCfg.text}`}>
                <span className={`h-2 w-2 rounded-full ${lightCfg.dot}`} aria-hidden />
                {lightCfg.label}
              </span>
            )}
          </div>
        }
      />
      <Kpi
        id="decision"
        active={activeId === 'decision'}
        onClick={onSelect}
        eyebrow="Disponible para retirar"
        value={available === null ? (score?.advance?.advance_limit.usd != null ? usd(score.advance.advance_limit.usd) : '—') : usd(available)}
        tone={available === 0 && light === 'rojo' ? 'danger' : 'ink'}
        detail={
          preview
            ? <>Liberado {usd(preview.released_usd)} · pagado {usd(paid)}</>
            : approved
              ? <>Faltan fotos: {photos} de {minPhotos}</>
              : 'Se habilita al aprobar cupo'
        }
        footer={lot?.next && <span className="text-[11px] text-[var(--color-text-muted)] line-clamp-1" title={lot.next.message}>{lot.next.message}</span>}
      />
      <Kpi
        id="evidence"
        active={activeId === 'evidence'}
        onClick={onSelect}
        eyebrow="Evidencia de campo"
        value={<>{photos}<span className="text-[14px] font-medium text-[var(--color-text-muted)]"> / {minPhotos}</span></>}
        detail={lot?.weeds_median_pct != null ? <>Malezas mediana <strong>{lot.weeds_median_pct} %</strong></> : 'Valores simulados de ejemplo'}
        footer={
          <span className="text-[11px] text-[var(--color-text-muted)]">
            Retiros: <strong className="text-[var(--color-ink)]">{paidCount}</strong>
            {rejectedCount > 0 && <> · <strong className="text-[var(--color-danger)]">{rejectedCount} rechazado{rejectedCount === 1 ? '' : 's'}</strong></>}
          </span>
        }
      />
    </section>
  );
}
