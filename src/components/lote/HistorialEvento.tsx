'use client';

import React from 'react';
import {
  Wallet,
  ArrowUpRight,
  RefreshCw,
  ShieldAlert,
  Undo2,
  TrendingDown,
  TrendingUp,
  Minus,
} from 'lucide-react';
import type { EventoHistorial, TipoEvento } from '@/types';
import { formatUSD } from '@/lib/scoreUtils';

interface HistorialEventoProps {
  eventos: EventoHistorial[];
}

const configEvento: Record<
  TipoEvento,
  { Icono: React.ElementType; claseIcono: string; claseContenedor: string; etiquetaRegla?: string }
> = {
  aporte: {
    Icono: Wallet,
    claseIcono: 'text-[var(--color-positive)]',
    claseContenedor: 'bg-[var(--color-brand-soft)]',
  },
  desembolso: {
    Icono: ArrowUpRight,
    claseIcono: 'text-[var(--color-brand-primary)]',
    claseContenedor: 'bg-[var(--color-brand-soft)]',
  },
  'actualizacion-condicion': {
    Icono: RefreshCw,
    claseIcono: 'text-[var(--color-text-muted)]',
    claseContenedor: 'bg-[var(--color-neutral-soft)]',
  },
  rechazo: {
    Icono: ShieldAlert,
    claseIcono: 'text-[var(--color-danger)]',
    claseContenedor: 'bg-[var(--color-danger-soft)]',
    etiquetaRegla: 'Regla del sistema aplicada',
  },
  repago: {
    Icono: Undo2,
    claseIcono: 'text-[var(--color-positive)]',
    claseContenedor: 'bg-[var(--color-brand-soft)]',
  },
};

/**
 * Línea de tiempo del historial de eventos de la demo.
 * Cada paso incluye número o timestamp simulado.
 * El evento de rechazo se muestra claramente como una regla de riesgo del sistema aplicada.
 */
export function HistorialEvento({ eventos }: HistorialEventoProps) {
  if (eventos.length === 0) {
    return (
      <p className="text-[14px] text-[var(--color-text-muted)] py-2">
        Todavía no hay eventos registrados.
      </p>
    );
  }

  // Orden cronológico inverso (el más reciente primero)
  const eventosInvertidos = [...eventos].reverse();
  const totalEventos = eventos.length;

  return (
    <ol className="flex flex-col gap-0" aria-label="Historial de eventos de la demo">
      {eventosInvertidos.map((evento, idx) => {
        const { Icono, claseIcono, claseContenedor, etiquetaRegla } = configEvento[evento.tipo];
        const esUltimo = idx === eventosInvertidos.length - 1;
        const numeroPaso = totalEventos - idx;

        return (
          <li
            key={evento.id}
            className="relative flex gap-4 pb-5 last:pb-0"
          >
            {/* Línea vertical de la línea de tiempo */}
            {!esUltimo && (
              <div
                className="absolute left-4 top-8 bottom-0 w-px bg-[var(--color-border)]"
                aria-hidden="true"
              />
            )}

            {/* Ícono del evento */}
            <div
              className={[
                'relative z-10 w-8 h-8 rounded-full flex items-center justify-center shrink-0 shadow-2xs',
                claseContenedor,
              ].join(' ')}
              aria-hidden="true"
            >
              <Icono size={15} className={claseIcono} />
            </div>

            {/* Contenido del evento */}
            <div className="flex flex-col gap-1 pt-0.5 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[10px] font-bold text-[var(--color-text-muted)] bg-[var(--color-neutral-soft)] px-1.5 py-0.5 rounded-[var(--radius-badge)] uppercase tracking-wide">
                  Paso {numeroPaso}
                </span>

                {etiquetaRegla && (
                  <span className="text-[10px] font-bold text-[var(--color-danger)] bg-[var(--color-danger-soft)] px-2 py-0.5 rounded-[var(--radius-pill)] uppercase tracking-wide">
                    {etiquetaRegla}
                  </span>
                )}

                <span className="text-[13px] font-semibold text-[var(--color-ink)] leading-5">
                  {evento.descripcion}
                </span>

                {evento.monto !== undefined && (
                  <span className="text-[13px] font-bold tabular-nums text-[var(--color-brand-primary)]">
                    {formatUSD(evento.monto)}
                  </span>
                )}
              </div>

              {/* Cambio de score */}
              {evento.scoreAnterior !== undefined && evento.scoreNuevo !== undefined && (
                (() => {
                  const diferencia = evento.scoreNuevo - evento.scoreAnterior;
                  const esPositivo = diferencia > 0;
                  const esNegativo = diferencia < 0;

                  let IconoTendencia = Minus;
                  let colorClass = 'text-[var(--color-text-muted)] bg-[var(--color-neutral-soft)]';
                  let textoCambio = 'Sin cambios';
                  let ariaTexto = `Score sin cambios: ${evento.scoreAnterior}.`;

                  if (esPositivo) {
                    IconoTendencia = TrendingUp;
                    colorClass = 'text-[var(--color-positive)] bg-[var(--color-brand-soft)]';
                    textoCambio = `+${diferencia} pts`;
                    ariaTexto = `Score anterior ${evento.scoreAnterior}. Subió ${diferencia} puntos. Score actual ${evento.scoreNuevo}.`;
                  } else if (esNegativo) {
                    IconoTendencia = TrendingDown;
                    colorClass = 'text-[var(--color-danger)] bg-[var(--color-danger-soft)]';
                    textoCambio = `${diferencia} pts`;
                    ariaTexto = `Score anterior ${evento.scoreAnterior}. Bajó ${-diferencia} puntos. Score actual ${evento.scoreNuevo}.`;
                  }

                  return (
                    <div
                      className={`flex items-center gap-1.5 text-[12px] font-medium px-2 py-1 rounded-[var(--radius-badge)] w-fit ${colorClass}`}
                      aria-label={ariaTexto}
                    >
                      <IconoTendencia size={14} aria-hidden="true" />
                      <span>
                        Score: {evento.scoreAnterior}/100 → {evento.scoreNuevo}/100 ({textoCambio})
                      </span>
                    </div>
                  );
                })()
              )}

              {/* Motivo o detalle de la regla */}
              {evento.motivo && (
                <p className="text-[12px] text-[var(--color-text-muted)] leading-[18px] max-w-prose">
                  {evento.motivo}
                </p>
              )}

              {/* Fecha / Hora simulada */}
              <span className="text-[11px] text-[var(--color-text-muted)] mt-0.5">
                {evento.fecha}
              </span>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
