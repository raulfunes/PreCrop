'use client';

import React from 'react';
import { TrendingUp, TrendingDown, Minus, Calendar } from 'lucide-react';
import type { CondicionLote } from '@/types';
import { SemaforoBadge } from './SemaforoBadge';

interface ScoreWidgetProps {
  condicion: CondicionLote;
}

/**
 * Widget de score de condición del lote.
 * Muestra el score destacado (48px bold), el semáforo y el motivo principal.
 * Si el score cambió, muestra el anterior con la tendencia.
 */
export function ScoreWidget({ condicion }: ScoreWidgetProps) {
  const { score, scoreAnterior, estado, motivoPrincipal, fechaActualizacion, desactualizado } = condicion;

  const diferencia = scoreAnterior !== undefined ? score - scoreAnterior : 0;
  const subio = diferencia > 0;

  return (
    <div className="flex flex-col gap-4">
      {/* Score + tendencia */}
      <div className="flex items-end gap-4 flex-wrap">
        <div className="flex items-baseline gap-2">
          <span
            className="text-score text-[var(--color-ink)] tabular-nums"
            aria-label={`Score de condición: ${score} sobre 100`}
          >
            {score}
          </span>
          <span className="text-[22px] font-semibold text-[var(--color-text-muted)] leading-none">
            /100
          </span>
        </div>

        {/* Tendencia vs score anterior */}
        {scoreAnterior !== undefined && diferencia !== 0 && (
          <div
            className={[
              'flex items-center gap-1 text-[14px] font-semibold leading-5 mb-1',
              subio ? 'text-[var(--color-positive)]' : 'text-[var(--color-danger)]',
            ].join(' ')}
            aria-label={`Score anterior: ${scoreAnterior}. ${subio ? 'Subió' : 'Bajó'} ${Math.abs(diferencia)} puntos.`}
          >
            {subio ? (
              <TrendingUp size={18} aria-hidden="true" />
            ) : (
              <TrendingDown size={18} aria-hidden="true" />
            )}
            <span>{subio ? '+' : ''}{diferencia}</span>
            <span className="text-[var(--color-text-muted)] font-normal">
              (antes: {scoreAnterior})
            </span>
          </div>
        )}

        {scoreAnterior !== undefined && diferencia === 0 && (
          <div className="flex items-center gap-1 text-[14px] text-[var(--color-text-muted)] mb-1">
            <Minus size={16} aria-hidden="true" />
            <span>Sin cambio</span>
          </div>
        )}
      </div>

      {/* Semáforo */}
      <SemaforoBadge estado={estado} iconoSize={16} />

      {/* Motivo principal */}
      <p className="text-[14px] text-[var(--color-text-muted)] leading-[20px] max-w-prose">
        {motivoPrincipal}
      </p>

      {/* Fecha de actualización */}
      <div className="flex items-center gap-1.5 text-[12px] text-[var(--color-text-muted)]">
        <Calendar size={13} aria-hidden="true" />
        <span>
          {desactualizado ? (
            <span className="text-[var(--color-warning)] font-medium">
              Dato desactualizado ·{' '}
            </span>
          ) : null}
          Actualizado: {fechaActualizacion}
        </span>
      </div>
    </div>
  );
}
