'use client';

import React from 'react';
import type { EventoHistorial } from '@/types';
import { HistorialEvento } from './HistorialEvento';

interface EventTimelineProps {
  eventos: EventoHistorial[];
}

/**
 * EventTimeline — punto 6 del orden de lectura (branding §11).
 *
 * Envuelve HistorialEvento en una sección con:
 *   - Título accesible y visible
 *   - Contador de eventos
 *   - Nota contextual explicando el rol del historial en la demo
 */
export function EventTimeline({ eventos }: EventTimelineProps) {
  return (
    <section aria-labelledby="event-timeline-heading" className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-2">
        <h2
          id="event-timeline-heading"
          className="text-[15px] font-semibold text-[var(--color-ink)]"
        >
          Historial de la demo
        </h2>
        {eventos.length > 0 && (
          <span
            className="text-[11px] font-semibold text-[var(--color-text-muted)]
                       bg-[var(--color-neutral-soft)] px-2 py-0.5 rounded-[var(--radius-pill)]
                       tabular-nums"
            aria-label={`${eventos.length} eventos registrados`}
          >
            {eventos.length} {eventos.length === 1 ? 'evento' : 'eventos'}
          </span>
        )}
      </div>

      <HistorialEvento eventos={eventos} />
    </section>
  );
}
