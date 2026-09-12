'use client';

import React from 'react';
import {
  Leaf,
  CloudRain,
  Thermometer,
  AlertTriangle,
  Cloud,
  Activity,
  Microscope,
  Wind,
} from 'lucide-react';
import type { Indicador, TipoEvidencia } from '@/types';

interface EvidenceCardProps {
  indicador: Indicador;
  /** Si true, se muestra la descripción completa de la sigla (NDVI · indicador de...) */
  primerAparicion?: boolean;
}

// ── Mapa de íconos ───────────────────────────────────────────
const ICONO_MAP: Record<string, React.ElementType> = {
  Leaf,
  CloudRain,
  Thermometer,
  AlertTriangle,
  Cloud,
  Activity,
  Microscope,
  Wind,
};

// ── Badge de tipo de evidencia ────────────────────────────────
interface ConditionBadgeProps {
  tipo: TipoEvidencia;
}

/**
 * ConditionBadge — diferencia con color + texto el origen del dato.
 * Medido  → verde
 * Estimado→ amarillo
 * Simulado→ neutro
 *
 * Branding §10: "Una estimación de malezas no debe parecer una medición verificada."
 */
export function ConditionBadge({ tipo }: ConditionBadgeProps) {
  const config: Record<TipoEvidencia, { clases: string; label: string; aria: string }> = {
    medido: {
      clases: 'bg-[var(--color-brand-soft)] text-[var(--color-positive)] border border-[var(--color-positive-bright)]/30',
      label: 'Medido',
      aria: 'Tipo de dato: Medido',
    },
    estimado: {
      clases: 'bg-[var(--color-warning-soft)] text-[var(--color-warning)] border border-[var(--color-warning)]/30',
      label: 'Estimado',
      aria: 'Tipo de dato: Estimado',
    },
    simulado: {
      clases: 'bg-[var(--color-neutral-soft)] text-[var(--color-text-muted)] border border-[var(--color-border)]',
      label: 'Simulado',
      aria: 'Tipo de dato: Simulado',
    },
  };

  const { clases, label, aria } = config[tipo];
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-[var(--radius-badge)] text-[10px] font-semibold uppercase tracking-wide ${clases}`}
      aria-label={aria}
    >
      {label}
    </span>
  );
}

/**
 * EvidenceCard — tarjeta de indicador de evidencia (branding §10, §13).
 *
 * Muestra:
 *   - Ícono + nombre del indicador
 *   - Badge de tipo: Medido / Estimado / Simulado
 *   - Valor + unidad en tamaño destacado
 *   - Periodo de referencia (si existe)
 *   - Fecha de captura
 *   - Descripción completa de la sigla en la primera aparición
 *     (branding §4: "NDVI · indicador de vigor del cultivo")
 *
 * No concluye desde el valor: muestra contexto, no diagnóstico.
 */
export function EvidenceCard({ indicador, primerAparicion }: EvidenceCardProps) {
  const {
    nombre,
    sigla,
    descripcionSigla,
    valor,
    unidad,
    periodo,
    fecha,
    tipo,
    icono,
  } = indicador;

  const IconoComp = icono ? (ICONO_MAP[icono] ?? Activity) : Activity;

  // Formateo: decimales solo si el número los tiene
  const valorFormateado =
    typeof valor === 'number'
      ? valor % 1 !== 0
        ? valor.toFixed(2).replace('.', ',')
        : valor.toLocaleString('es-AR')
      : valor;

  // En la primera aparición se muestra la descripción completa de la sigla
  const tituloPrincipal = (primerAparicion && descripcionSigla) ? descripcionSigla : nombre;

  return (
    <article
      className="flex flex-col gap-3 p-4
        bg-[var(--color-surface)] rounded-[var(--radius-card)]
        border border-[var(--color-border)] shadow-[var(--shadow-card)]
        transition-shadow duration-[var(--duration-fast)]
        hover:shadow-[0_3px_10px_rgb(24_57_43/0.10)]
        focus-within:ring-2 focus-within:ring-[var(--color-brand-primary)] focus-within:ring-offset-2"
      aria-label={`${tituloPrincipal}: ${valorFormateado}${unidad ? ' ' + unidad : ''}${periodo ? ', ' + periodo : ''}. Fecha: ${fecha}.`}
    >
      {/* ── Cabecera: ícono + badge tipo ────────────────── */}
      <div className="flex items-start justify-between gap-2">
        <div
          className="w-9 h-9 rounded-[var(--radius-badge)] bg-[var(--color-brand-soft)]
                     flex items-center justify-center shrink-0"
          aria-hidden="true"
        >
          <IconoComp
            size={18}
            className={tipo === 'estimado' ? 'text-[var(--color-warning)]' : 'text-[var(--color-positive)]'}
          />
        </div>
        <ConditionBadge tipo={tipo} />
      </div>

      {/* ── Nombre del indicador ────────────────────────── */}
      <div className="flex flex-col gap-0.5">
        <span className="text-[12px] font-semibold text-[var(--color-ink)] leading-4">
          {tituloPrincipal}
        </span>
        {/* Sub-línea: solo si tiene descripción de sigla y no es la primera aparición */}
        {sigla && descripcionSigla && nombre !== descripcionSigla && !primerAparicion && (
          <span className="text-[10px] text-[var(--color-text-muted)] leading-3">
            {nombre}
          </span>
        )}
      </div>

      {/* ── Valor + unidad ──────────────────────────────── */}
      <div
        className="flex items-baseline gap-1"
        aria-label={`Valor: ${valorFormateado}${unidad ? ' ' + unidad : ''}`}
      >
        <span className="text-[30px] font-bold text-[var(--color-ink)] leading-none tabular-nums">
          {valorFormateado}
        </span>
        {unidad && (
          <span className="text-[14px] text-[var(--color-text-muted)] font-semibold leading-none">
            {unidad}
          </span>
        )}
      </div>

      {/* ── Contexto temporal ───────────────────────────── */}
      <div className="flex flex-col gap-0.5">
        {periodo && (
          <span className="text-[11px] text-[var(--color-text-muted)] leading-4">
            {periodo}
          </span>
        )}
        <span className="text-[10px] text-[var(--color-text-muted)] leading-4">
          Captura: {fecha}
        </span>
      </div>
    </article>
  );
}
