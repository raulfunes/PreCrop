'use client';

import React from 'react';
import { FlaskConical } from 'lucide-react';

/**
 * Banner persistente de demo.
 * Debe estar visible en todo momento junto a acciones financieras.
 * Texto: "DEMO · Fondos de prueba · MOCK"
 */
export function DemoBanner() {
  return (
    <div
      role="status"
      aria-label="Modo de demostración con fondos de prueba"
      className="
        inline-flex items-center gap-2
        bg-[var(--color-brand-primary)] text-white
        px-3 py-1.5 rounded-[var(--radius-pill)]
        text-[12px] font-semibold leading-[18px]
        select-none shrink-0
      "
    >
      <FlaskConical size={14} aria-hidden="true" />
      <span>DEMO · Fondos de prueba · MOCK</span>
    </div>
  );
}
