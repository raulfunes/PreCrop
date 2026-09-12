'use client';

import React from 'react';
import { Leaf, MapPin } from 'lucide-react';
import { DemoBanner } from '@/components/ui/DemoBanner';
import type { Lote } from '@/types';

interface HeaderProps {
  lote: Lote;
}

/**
 * Encabezado principal de PreCrop.
 * Orden: logotipo provisional → nombre del lote + campaña → etiqueta DEMO.
 * Logotipo: símbolo hoja blanco sobre cuadrado verde bosque + nombre en verde tinta.
 */
export function Header({ lote }: HeaderProps) {
  return (
    <header className="
      sticky top-0 z-30
      bg-[var(--color-surface)] border-b border-[var(--color-border)]
      shadow-[0_1px_3px_rgb(24_57_43/0.06)]
    ">
      <div className="
        max-w-7xl mx-auto px-6 md:px-8
        h-16 flex items-center justify-between gap-4
      ">
        {/* Logotipo PreCrop */}
        <div className="flex items-center gap-3 shrink-0">
          {/* Símbolo: cuadrado verde con hoja blanca */}
          <div
            className="
              w-9 h-9 rounded-[10px]
              bg-[var(--color-brand-primary)]
              flex items-center justify-center shrink-0
            "
            aria-hidden="true"
          >
            <Leaf size={20} className="text-white" strokeWidth={2} />
          </div>

          {/* Nombre PreCrop */}
          <span
            className="text-[20px] font-bold leading-none text-[var(--color-ink)] tracking-tight"
            aria-label="PreCrop"
          >
            Pre<span className="text-[var(--color-brand-primary)]">Crop</span>
          </span>
        </div>

        {/* Info del lote */}
        <div className="hidden sm:flex flex-col items-start min-w-0">
          <span className="text-[14px] font-semibold text-[var(--color-ink)] truncate leading-5">
            {lote.nombre}
          </span>
          <span className="flex items-center gap-1 text-[12px] text-[var(--color-text-muted)] leading-4 mt-0.5">
            <MapPin size={11} aria-hidden="true" />
            {lote.ubicacion} · Campaña {lote.campana}
          </span>
        </div>

        {/* Banner demo (siempre visible) */}
        <DemoBanner />
      </div>

      {/* Info del lote en mobile (debajo del header) */}
      <div className="sm:hidden px-4 pb-2 flex items-center gap-1.5 text-[12px] text-[var(--color-text-muted)]">
        <MapPin size={11} aria-hidden="true" />
        <span>{lote.nombre} · {lote.ubicacion} · Campaña {lote.campana}</span>
      </div>
    </header>
  );
}
