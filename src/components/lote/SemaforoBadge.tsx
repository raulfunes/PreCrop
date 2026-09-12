'use client';

import React from 'react';
import { CheckCircle2, AlertTriangle, XCircle, Clock } from 'lucide-react';
import type { EstadoLote } from '@/types';
import { getLabelEstado } from '@/lib/scoreUtils';

interface SemaforoBadgeProps {
  estado: EstadoLote;
  /** Tamaño del icono en px */
  iconoSize?: number;
  className?: string;
}

// Color, icono y clases por estado
const configEstado: Record<
  EstadoLote,
  {
    Icono: React.ElementType;
    clasesContenedor: string;
    clasesTexto: string;
  }
> = {
  verde: {
    Icono: CheckCircle2,
    clasesContenedor:
      'bg-[var(--color-brand-soft)] border border-[var(--color-positive-bright)]/40',
    clasesTexto: 'text-[var(--color-positive)]',
  },
  amarillo: {
    Icono: AlertTriangle,
    clasesContenedor:
      'bg-[var(--color-warning-soft)] border border-[var(--color-warning)]/40',
    clasesTexto: 'text-[var(--color-warning)]',
  },
  rojo: {
    Icono: XCircle,
    clasesContenedor:
      'bg-[var(--color-danger-soft)] border border-[var(--color-danger)]/40',
    clasesTexto: 'text-[var(--color-danger)]',
  },
  'sin-datos': {
    Icono: Clock,
    clasesContenedor:
      'bg-[var(--color-neutral-soft)] border border-[var(--color-border)]',
    clasesTexto: 'text-[var(--color-text-muted)]',
  },
};

/**
 * Semáforo de condición del lote.
 * Combina color + icono + etiqueta de texto.
 * Nunca usa solo el color para comunicar el estado.
 */
export function SemaforoBadge({ estado, iconoSize = 16, className = '' }: SemaforoBadgeProps) {
  const { Icono, clasesContenedor, clasesTexto } = configEstado[estado];
  const label = getLabelEstado(estado);

  return (
    <span
      role="img"
      aria-label={`Estado del cultivo: ${label}`}
      className={[
        'inline-flex items-center gap-1.5 px-3 py-1.5',
        'rounded-[var(--radius-pill)]',
        'text-[13px] font-semibold leading-[18px]',
        clasesContenedor,
        clasesTexto,
        className,
      ].join(' ')}
    >
      <Icono size={iconoSize} aria-hidden="true" strokeWidth={2} />
      <span>{label}</span>
    </span>
  );
}
