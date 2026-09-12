'use client';

import React from 'react';
import type { VarianteBadge } from '@/types';

interface BadgeProps {
  variante?: VarianteBadge;
  children: React.ReactNode;
  className?: string;
  /** Icono a la izquierda (componente React, p. ej. lucide) */
  icono?: React.ReactNode;
}

// Estilos por variante (color + icono + texto)
const estilosPorVariante: Record<VarianteBadge, string> = {
  positivo:
    'bg-[var(--color-brand-soft)] text-[var(--color-positive)] border border-[var(--color-positive-bright)]/30',
  advertencia:
    'bg-[var(--color-warning-soft)] text-[var(--color-warning)] border border-[var(--color-warning)]/30',
  peligro:
    'bg-[var(--color-danger-soft)] text-[var(--color-danger)] border border-[var(--color-danger)]/30',
  neutro:
    'bg-[var(--color-neutral-soft)] text-[var(--color-text-muted)] border border-[var(--color-border)]',
  medido:
    'bg-[var(--color-brand-soft)] text-[var(--color-positive)] border border-[var(--color-positive-bright)]/20',
  estimado:
    'bg-[var(--color-warning-soft)] text-[var(--color-warning)] border border-[var(--color-warning)]/20',
  simulado:
    'bg-[var(--color-neutral-soft)] text-[var(--color-text-muted)] border border-[var(--color-border)]',
  demo:
    'bg-[var(--color-brand-primary)] text-white border-0',
};

/**
 * Badge reutilizable de PreCrop.
 * Combina color + icono + texto para representar estados y tipos de evidencia.
 */
export function Badge({ variante = 'neutro', children, className = '', icono }: BadgeProps) {
  return (
    <span
      className={[
        'inline-flex items-center gap-1.5 px-2 py-0.5 text-[12px] font-semibold leading-[18px] rounded-[8px] whitespace-nowrap',
        estilosPorVariante[variante],
        className,
      ].join(' ')}
    >
      {icono && (
        <span className="shrink-0 flex items-center" aria-hidden="true">
          {icono}
        </span>
      )}
      {children}
    </span>
  );
}
