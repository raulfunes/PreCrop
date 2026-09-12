'use client';

import React from 'react';
import type { ScoreResponse, CapacityResponse } from '@/types';
import type { LotStateResponse } from '@/lib/workflowClient';
import { TrafficLightGauge } from './TrafficLightGauge';

const usd = (n: number | null | undefined) => (n === null || n === undefined ? '—' : `USD ${Math.round(n).toLocaleString('es-AR')}`);

const LIGHT: Record<string, { label: string; dot: string; text: string }> = {
  verde: { label: 'Condición favorable', dot: 'bg-[var(--color-positive-bright)]', text: 'text-[var(--color-positive)]' },
  amarillo: { label: 'Condición en observación', dot: 'bg-[var(--color-warning)]', text: 'text-[var(--color-warning)]' },
  rojo: { label: 'Condición desfavorable', dot: 'bg-[var(--color-danger)]', text: 'text-[var(--color-danger)]' },
};

interface KpiProps {
  eyebrow: string;
  value: React.ReactNode;
  detail: React.ReactNode;
  tone?: 'brand' | 'ink' | 'danger' | 'warning';
  footer?: React.ReactNode;
}

function Kpi({ eyebrow, value, detail, tone = 'ink', footer }: KpiProps) {
  const toneClass = {
    brand: 'text-[var(--color-brand-primary)]',
    ink: 'text-[var(--color-ink)]',
    danger: 'text-[var(--color-danger)]',
    warning: 'text-[var(--color-warning)]',
  }[tone];
  return (
    <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-[var(--radius-card)] shadow-[var(--shadow-card)] p-5 flex flex-col gap-1 min-w-0">
      <span className="text-[11px] font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">{eyebrow}</span>
      <span className={`text-[28px] leading-[34px] font-bold tabular-nums ${toneClass}`}>{value}</span>
      <span className="text-[13px] text-[var(--color-text-muted)] leading-5">{detail}</span>
      {footer && <div className="mt-2 text-[12px]">{footer}</div>}
    </div>
  );
}

interface KpiStripProps {
  capacity: CapacityResponse | null;
  score: ScoreResponse | null;
  lot: LotStateResponse | null;
}

/** The four numbers a committee reads first, always visible, no tabs. */
export function KpiStrip({ capacity, score, lot }: KpiStripProps) {
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
    <section aria-label="Resumen del lote" className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 md:gap-5">
      <Kpi
        eyebrow="Cupo pre-siembra"
        value={usd(preSowing)}
        tone="brand"
        detail={worst ? <>Contra el peor año oficial del dpto.: <strong>{worst.campana}</strong>, {worst.yield_t_ha.toFixed(2)} t/ha</> : 'Calculando capacidad…'}
        footer={
          approved ? (
            <span className="inline-flex items-center gap-1 rounded-[var(--radius-pill)] bg-[var(--color-brand-soft)] px-2 py-0.5 font-semibold text-[var(--color-brand-primary)]">
              Aprobado por la coop · {usd(approved.quota_usd)}
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 rounded-[var(--radius-pill)] bg-[var(--color-neutral-soft)] px-2 py-0.5 font-semibold text-[var(--color-text-muted)]">
              Pendiente de aprobación
            </span>
          )
        }
      />
      <Kpi
        eyebrow="Condición del cultivo"
        value={score ? <>{score.result.score_exact.toFixed(1)}<span className="text-[14px] font-medium text-[var(--color-text-muted)]"> /100</span></> : '—'}
        tone={light === 'rojo' ? 'danger' : light === 'amarillo' ? 'warning' : 'ink'}
        detail={observed ? <>Escena satelital del {observed} · no es un score crediticio</> : 'Esperando la escena…'}
        footer={
          <div className="flex flex-col gap-2">
            <TrafficLightGauge value={score?.result.score_exact ?? null} size="sm" />
            {lightCfg && (
              <span className={`inline-flex items-center gap-2 font-semibold ${lightCfg.text}`}>
                <span className={`h-2.5 w-2.5 rounded-full ${lightCfg.dot}`} aria-hidden />
                {lightCfg.label}
              </span>
            )}
          </div>
        }
      />
      <Kpi
        eyebrow="Disponible para retirar"
        value={available === null ? (score?.advance?.advance_limit.usd != null ? usd(score.advance.advance_limit.usd) : '—') : usd(available)}
        tone={available === 0 && light === 'rojo' ? 'danger' : 'ink'}
        detail={
          preview
            ? <>Liberado por condición {usd(preview.released_usd)} · ya pagado {usd(paid)}</>
            : approved
              ? <>Faltan fotos: {photos} de {minPhotos} puntos</>
              : <>Límite sugerido por condición; se habilita cuando la coop aprueba el cupo</>
        }
        footer={lot?.next && <span className="text-[var(--color-text-muted)]">{lot.next.message}</span>}
      />
      <Kpi
        eyebrow="Evidencia de campo"
        value={<>{photos}<span className="text-[14px] font-medium text-[var(--color-text-muted)]"> / {minPhotos} fotos</span></>}
        detail={lot?.weeds_median_pct != null ? <>Malezas por fotos: mediana <strong>{lot.weeds_median_pct} %</strong></> : 'Malezas del pack (simuladas) hasta tener 3 fotos'}
        footer={
          <span className="text-[var(--color-text-muted)]">
            Retiros: <strong className="text-[var(--color-ink)]">{paidCount} pagado{paidCount === 1 ? '' : 's'}</strong>
            {rejectedCount > 0 && <> · <strong className="text-[var(--color-danger)]">{rejectedCount} rechazado{rejectedCount === 1 ? '' : 's'}</strong></>}
          </span>
        }
      />
    </section>
  );
}
