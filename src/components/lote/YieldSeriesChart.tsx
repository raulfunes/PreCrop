'use client';

import React from 'react';
import type { CapacitySeriesRow } from '@/types';

interface YieldSeriesChartProps {
  series: CapacitySeriesRow[];
  worstCampana?: string | null;
  /** Pixel height of the drawing area. */
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
  const padTop = 18, padBottom = 18, w = 100 / rows.length;
  const total = height + padTop + padBottom;
  const worstRow = rows.find((r) => r.campana === worstCampana) ?? null;

  return (
    <figure className="m-0">
      <svg viewBox={`0 0 100 ${total}`} preserveAspectRatio="none" className="w-full" style={{ height: total }} role="img" aria-label="Rinde oficial de soja del departamento por campaña">
        {rows.map((r, i) => {
          const v = r.official_dpto_kg_ha as number;
          const h = (v / max) * height;
          const x = i * w + w * 0.18;
          const bw = w * 0.64;
          const isWorst = r.campana === worstCampana;
          const fill = isWorst ? 'var(--color-danger)' : 'var(--color-brand-primary)';
          return (
            <g key={r.campana}>
              <rect x={x} y={padTop + height - h} width={bw} height={h} rx={0.6} fill={fill} opacity={isWorst ? 1 : 0.85} vectorEffect="non-scaling-stroke" />
              <text x={x + bw / 2} y={padTop + height - h - 4} textAnchor="middle" fontSize="6.2" fontWeight={isWorst ? 700 : 500} fill={isWorst ? 'var(--color-danger)' : 'var(--color-ink)'} style={{ fontFamily: 'inherit' }}>
                {(v / 1000).toFixed(1)}
              </text>
              <text x={x + bw / 2} y={padTop + height + 12} textAnchor="middle" fontSize="6.2" fill="var(--color-text-muted)" style={{ fontFamily: 'inherit' }}>
                {short(r.campana)}
              </text>
            </g>
          );
        })}
      </svg>
      {caption && (
        <figcaption className="mt-1 text-[11px] text-[var(--color-text-muted)] leading-4">
          Rinde oficial de soja del departamento, en t/ha (MAGyP).
          {worstRow && <> Peor campaña <strong className="text-[var(--color-danger)]">{worstRow.campana}</strong>: {(worstRow.official_dpto_kg_ha as number).toLocaleString('es-AR')} kg/ha, la base del cupo.</>}
        </figcaption>
      )}
    </figure>
  );
}
