'use client';

import React from 'react';
import type { CapacitySeriesRow } from '@/types';

interface YieldSeriesChartProps {
  series: CapacitySeriesRow[];
  worstCampana?: string | null;
  /** Pixel height of the bars area. */
  height?: number;
  caption?: boolean;
}

const short = (campana: string) => campana.replace(/^20(\d\d)\/(\d\d)$/, '$1/$2');

/** Compact bar chart of the official department soy yield, one bar per campaign, worst in red. */
export function YieldSeriesChart({ series, worstCampana = null, height = 120, caption = true }: YieldSeriesChartProps) {
  const rows = series.filter((r) => r.official_dpto_kg_ha !== null);
  if (rows.length === 0) {
    return <p className="text-[12px] text-[var(--color-text-muted)]">Sin serie oficial para este departamento.</p>;
  }
  const max = Math.max(...rows.map((r) => r.official_dpto_kg_ha as number));
  const worstRow = rows.find((r) => r.campana === worstCampana) ?? null;

  return (
    <figure className="m-0">
      <div className="flex items-end gap-2" style={{ height: height + 20 }} role="img" aria-label="Rinde oficial de soja del departamento por campaña">
        {rows.map((r) => {
          const v = r.official_dpto_kg_ha as number;
          const isWorst = r.campana === worstCampana;
          const pct = Math.max(4, (v / max) * 100);
          return (
            <div key={r.campana} className="flex-1 min-w-0 flex flex-col items-center justify-end h-full">
              <span className={`text-[11px] leading-4 tabular-nums ${isWorst ? 'font-bold text-[var(--color-danger)]' : 'font-medium text-[var(--color-ink)]'}`}>
                {(v / 1000).toFixed(1)}
              </span>
              <div className="w-full flex items-end" style={{ height }}>
                <div
                  className={`w-full rounded-t-[4px] ${isWorst ? 'bg-[var(--color-danger)]' : 'bg-[var(--color-brand-primary)] opacity-85'}`}
                  style={{ height: `${pct}%` }}
                  title={`${r.campana}: ${v.toLocaleString('es-AR')} kg/ha`}
                />
              </div>
            </div>
          );
        })}
      </div>
      <div className="flex gap-2 mt-1">
        {rows.map((r) => (
          <span key={r.campana} className={`flex-1 min-w-0 text-center text-[11px] leading-4 tabular-nums ${r.campana === worstCampana ? 'font-bold text-[var(--color-danger)]' : 'text-[var(--color-text-muted)]'}`}>
            {short(r.campana)}
          </span>
        ))}
      </div>
      {caption && (
        <figcaption className="mt-2 text-[11px] text-[var(--color-text-muted)] leading-4">
          Rinde oficial de soja del departamento, en t/ha (MAGyP).
          {worstRow && <> Peor campaña <strong className="text-[var(--color-danger)]">{worstRow.campana}</strong>: {(worstRow.official_dpto_kg_ha as number).toLocaleString('es-AR')} kg/ha, la base del cupo.</>}
        </figcaption>
      )}
    </figure>
  );
}
