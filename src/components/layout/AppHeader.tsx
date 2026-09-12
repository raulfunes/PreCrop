'use client';

import React from 'react';
import { Leaf } from 'lucide-react';

/**
 * AppHeader — cabecera principal de PreCrop (branding §6, §11).
 *
 * Estructura:
 *   [Logo PreCrop]  [Descriptor]  [DEMO badge]
 *
 * - Logotipo: cuadrado verde bosque con ícono de hoja blanco + nombre PreCrop.
 * - Descriptor: "Evidencia del cultivo para decidir anticipos" visible en sm+.
 * - Badge DEMO persistente en todos los anchos.
 * - Info del lote: nombre + campaña + ubicación en la misma barra (md+)
 *   o en una franja secundaria debajo (mobile).
 */
export function AppHeader() {
  return (
    <header
      className="sticky top-0 z-30 bg-[var(--color-surface)] border-b border-[var(--color-border)] shadow-[var(--shadow-card)]"
      role="banner"
    >
      <div className="max-w-7xl mx-auto px-4 md:px-6 lg:px-8">
        <div className="h-16 flex items-center justify-between gap-3">

          {/* ── Logotipo + descriptor ─────────────────────── */}
          <div className="flex items-center gap-3 min-w-0">
            {/* Símbolo: cuadrado verde con ícono blanco */}
            <a
              href="#contenido-principal"
              className="shrink-0 w-9 h-9 rounded-[10px] bg-[var(--color-brand-primary)]
                         flex items-center justify-center
                         focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2
                         focus-visible:ring-[var(--color-brand-primary)]"
              aria-label="PreCrop · Ir al contenido principal"
            >
              <Leaf size={20} className="text-white" strokeWidth={2} aria-hidden="true" />
            </a>

            {/* Nombre + descriptor */}
            <div className="flex flex-col leading-none min-w-0">
              <span
                className="text-[19px] font-bold text-[var(--color-ink)] tracking-tight"
                aria-label="PreCrop"
              >
                Pre<span className="text-[var(--color-brand-primary)]">Crop</span>
              </span>
              <span className="hidden sm:block text-[11px] text-[var(--color-text-muted)] leading-3 mt-0.5 truncate">
                Evidencia del cultivo para decidir anticipos
              </span>
            </div>
          </div>


          {/* ── Badge DEMO — siempre visible ─────────────── */}
          <span
            className="shrink-0 inline-flex items-center gap-1.5 px-3 py-1 rounded-[var(--radius-pill)]
                       bg-[var(--color-warning-soft)] border border-[var(--color-warning)]/30
                       text-[11px] font-semibold text-[var(--color-warning)] uppercase tracking-wide
                       select-none"
            aria-label="Modo demo. Fondos de prueba simulados."
          >
            <span aria-hidden="true">●</span>
            <span className="hidden xs:inline">DEMO · </span>
            Fondos de prueba
          </span>
        </div>
      </div>


    </header>
  );
}
