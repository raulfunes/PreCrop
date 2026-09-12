'use client';

import React from 'react';
import { YieldSeriesChart } from './YieldSeriesChart';
import { SkeletonValue } from '@/components/ui/Loading';
import type { CapacityResponse } from '@/types';
import type { Role } from './RoleActions';

interface SeriesPanelProps {
  capacity: CapacityResponse | null;
  role: Role;
  isLoading?: boolean;
  className?: string;
}

const TEXTOS: Record<Role, { titulo: string; pie: string; tablaResumen: string }> = {
  coop: {
    titulo: 'Serie oficial y respuesta satelital',
    pie: 'El cupo se dimensiona contra el peor año publicado del departamento.',
    tablaResumen: 'Ver campaña por campaña',
  },
  productor: {
    titulo: 'Historial de rindes de tu zona',
    pie: 'Tu cupo se calcula contra el peor año que tuvo el departamento, no contra el promedio.',
    tablaResumen: 'Ver campaña por campaña',
  },
};

/**
 * Serie oficial del departamento y como la siguio el lote. Vivia plegada dentro del
 * modal de cupo; ahora encabeza el tablero, porque es la evidencia que sostiene el
 * numero de las tarjetas que tiene debajo. El detalle por campaña queda plegado para
 * que el bloque entre en el alto de pantalla junto con las cuatro metricas.
 */
export function SeriesPanel({ capacity, role, isLoading = false, className = '' }: SeriesPanelProps) {
  const t = TEXTOS[role];
  const cap = capacity?.capacity ?? null;
  const series = cap?.series ?? [];
  const worst = cap?.worst_year ?? null;

  return (
    <section
      aria-label={t.titulo}
      className={`flex flex-col min-w-0 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-[var(--radius-card)] shadow-[var(--shadow-card)] p-3 ${className}`}
    >
      <div className="flex items-baseline justify-between gap-2 mb-2">
        <h2 className="text-[11px] font-bold uppercase tracking-wide text-[var(--color-text-muted)]">
          {t.titulo}
        </h2>
        {series.length > 0 && (
          <span className="text-[10px] text-[var(--color-text-muted)] tabular-nums shrink-0">
            {series.length} campañas
          </span>
        )}
      </div>

      {isLoading && !cap ? (
        <SkeletonValue className="h-[92px] w-full" />
      ) : series.length === 0 ? (
        <p className="text-[12px] text-[var(--color-text-muted)] py-4">Sin serie oficial para este departamento.</p>
      ) : (
        <>
          <YieldSeriesChart series={series} worstCampana={worst?.campana ?? null} height={72} caption={false} />

          <p className="mt-2 text-[11px] text-[var(--color-text-muted)] leading-4">
            {t.pie}
            {worst && (
              <>
                {' '}Peor campaña{' '}
                <strong className="text-[var(--color-danger)]">{worst.campana}</strong>:{' '}
                {worst.official_dpto_kg_ha.toLocaleString('es-AR')} kg/ha.
              </>
            )}
          </p>

          <details className="group mt-2 border-t border-[var(--color-border)] pt-2">
            <summary className="flex items-center justify-between cursor-pointer text-[11px] font-semibold text-[var(--color-brand-primary)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-brand-primary)] rounded">
              {t.tablaResumen}
              <span className="transition group-open:rotate-180" aria-hidden="true">▼</span>
            </summary>
            <div className="mt-2 max-h-[170px] overflow-y-auto">
              <table className="w-full text-[11px] leading-4 tabular-nums">
                <thead className="sticky top-0 bg-[var(--color-surface)]">
                  <tr className="text-left uppercase tracking-wide text-[var(--color-text-muted)] border-b border-[var(--color-border)]">
                    <th className="py-1 pr-2 font-semibold">Campaña</th>
                    <th className="py-1 pr-2 font-semibold text-right">Rinde dpto.</th>
                    <th className="py-1 pr-2 font-semibold text-right">NDVI lote</th>
                    <th className="py-1 font-semibold text-right">Lote/dpto.</th>
                  </tr>
                </thead>
                <tbody>
                  {series.map((c) => {
                    const isWorst = c.campana === worst?.campana;
                    return (
                      <tr
                        key={c.campana}
                        className={`border-b border-[var(--color-border)] last:border-0 ${isWorst ? 'bg-[var(--color-danger-soft)] text-[var(--color-danger)] font-semibold' : 'text-[var(--color-ink)]'}`}
                      >
                        <td className="py-1 pr-2">
                          {c.campana}
                          {isWorst && <span className="ml-1 text-[9px] uppercase">peor</span>}
                        </td>
                        <td className="py-1 pr-2 text-right">
                          {c.official_dpto_kg_ha !== null ? c.official_dpto_kg_ha.toLocaleString('es-AR') : 's/d'}
                        </td>
                        <td className="py-1 pr-2 text-right">{c.ndvi_peak !== null ? c.ndvi_peak.toFixed(3) : 's/d'}</td>
                        <td className="py-1 text-right">{c.lote_vs_district !== null ? `${c.lote_vs_district.toFixed(2)}x` : 's/d'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {cap && (
                <p className="mt-2 text-[10px] text-[var(--color-text-muted)] leading-4">
                  <strong className="text-[var(--color-ink)]">Representatividad:</strong>{' '}
                  {cap.representativeness.basis} {cap.representativeness.note}
                </p>
              )}
            </div>
          </details>
        </>
      )}
    </section>
  );
}
