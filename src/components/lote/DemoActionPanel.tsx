'use client';

import React from 'react';
import type { EstadoDemo, AccionDemo } from '@/types';
import { AccionDesembolso } from './AccionDesembolso';

interface DemoActionPanelProps {
  estado: EstadoDemo;
  onAccion: (tipo: AccionDemo['tipo']) => void;
}

/**
 * DemoActionPanel — punto 5 del orden de lectura (branding §11).
 *
 * Envuelve AccionDesembolso en una sección semántica con:
 *   - Título de sección accesible para lectores de pantalla
 *   - Aclaración "DEMO · Fondos de prueba" siempre visible
 *
 * La acción principal varía según el paso del reducer.
 */
export function DemoActionPanel({ estado, onAccion }: DemoActionPanelProps) {
  return (
    <section aria-labelledby="demo-action-heading" className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-2">
        <h2
          id="demo-action-heading"
          className="text-[13px] font-semibold text-[var(--color-text-muted)] uppercase tracking-wide"
        >
          Próxima acción simulada
        </h2>
        <span
          className="text-[10px] font-semibold text-[var(--color-warning)] uppercase tracking-wide
                     bg-[var(--color-warning-soft)] px-2 py-0.5 rounded-[var(--radius-pill)]"
          aria-label="Modo demo. Los fondos son de prueba."
        >
          DEMO · MOCK
        </span>
      </div>

      <AccionDesembolso estado={estado} onAccion={onAccion} />
    </section>
  );
}
