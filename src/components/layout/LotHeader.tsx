'use client';

import React from 'react';
import { MapPin, Layers, Sprout, Ruler } from 'lucide-react';
import type { Lote } from '@/types';

interface LotHeaderProps {
  lote: Lote;
}

/**
 * LotHeader — bloque de identificación del lote debajo del AppHeader.
 * Comunica: nombre, cultivo, campaña, ubicación y superficie.
 * Corresponde al punto 1 del orden de lectura del branding §11.
 *
 * En desktop: fila horizontal con datos separados.
 * En mobile: dos líneas compactas.
 */
export function LotHeader({ lote }: LotHeaderProps) {
  return (
    <section
      aria-label={`Identificación del lote: ${lote.nombre}`}
      className="bg-[var(--color-surface)] border-b border-[var(--color-border)]"
    >
      <div className="max-w-7xl mx-auto px-4 md:px-6 lg:px-8 py-4 md:py-5">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">

          {/* Nombre + cultivo + campaña */}
          <div className="flex flex-col gap-0.5">
            <h1 className="text-[22px] md:text-[26px] font-bold text-[var(--color-ink)] leading-tight tracking-tight">
              {lote.nombre}
            </h1>
            <div className="flex items-center gap-2 flex-wrap text-[13px] text-[var(--color-text-muted)]">
              <span className="flex items-center gap-1">
                <Sprout size={13} className="text-[var(--color-brand-primary)]" aria-hidden="true" />
                <strong className="font-semibold text-[var(--color-ink)]">{lote.cultivo}</strong>
              </span>
              <span aria-hidden="true">·</span>
              <span className="flex items-center gap-1">
                <Layers size={12} aria-hidden="true" />
                Campaña {lote.campana}
              </span>
            </div>
          </div>

          {/* Ubicación + superficie */}
          <div className="flex items-center gap-4 flex-wrap">
            <span className="flex items-center gap-1.5 text-[13px] text-[var(--color-text-muted)]">
              <MapPin size={14} className="text-[var(--color-brand-primary)] shrink-0" aria-hidden="true" />
              {lote.ubicacion}
            </span>
            <span className="flex items-center gap-1.5 text-[13px] text-[var(--color-text-muted)]">
              <Ruler size={14} className="shrink-0" aria-hidden="true" />
              <strong className="font-semibold text-[var(--color-ink)] tabular-nums">{lote.hectareas}</strong>
              {' '}ha
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}
