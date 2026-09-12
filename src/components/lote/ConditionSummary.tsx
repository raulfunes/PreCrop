'use client';

import React from 'react';
import { CheckCircle2, AlertTriangle, XOctagon, Clock, Calendar, TrendingUp, TrendingDown } from 'lucide-react';
import type { CondicionLote, EstadoLote } from '@/types';
import { getLabelEstado } from '@/lib/scoreUtils';

interface ConditionSummaryProps {
  condicion: CondicionLote;
}

// ── Configuración de estado (color + icono + semántica) ──────
interface ConfigEstado {
  Icono: React.ElementType;
  claseIcono: string;
  claseFondo: string;
  claseBorde: string;
  claseTexto: string;
  claseScore: string;
}

const CONFIG_ESTADO: Record<EstadoLote, ConfigEstado> = {
  verde: {
    Icono: CheckCircle2,
    claseIcono: 'text-[var(--color-positive)]',
    claseFondo: 'bg-[var(--color-brand-soft)]',
    claseBorde: 'border-[var(--color-positive-bright)]/40',
    claseTexto: 'text-[var(--color-positive)]',
    claseScore: 'text-[var(--color-ink)]',
  },
  amarillo: {
    Icono: AlertTriangle,
    claseIcono: 'text-[var(--color-warning)]',
    claseFondo: 'bg-[var(--color-warning-soft)]',
    claseBorde: 'border-[var(--color-warning)]/40',
    claseTexto: 'text-[var(--color-warning)]',
    claseScore: 'text-[var(--color-ink)]',
  },
  rojo: {
    Icono: XOctagon,
    claseIcono: 'text-[var(--color-danger)]',
    claseFondo: 'bg-[var(--color-danger-soft)]',
    claseBorde: 'border-[var(--color-danger)]/40',
    claseTexto: 'text-[var(--color-danger)]',
    claseScore: 'text-[var(--color-danger)]',
  },
  'sin-datos': {
    Icono: Clock,
    claseIcono: 'text-[var(--color-text-muted)]',
    claseFondo: 'bg-[var(--color-neutral-soft)]',
    claseBorde: 'border-[var(--color-border)]',
    claseTexto: 'text-[var(--color-text-muted)]',
    claseScore: 'text-[var(--color-text-muted)]',
  },
};

/**
 * ConditionSummary — punto 2 del orden de lectura (branding §11).
 *
 * Comunica en ≤5 segundos:
 *   - Score numérico prominente (48px bold)
 *   - Estado con color + icono + etiqueta de texto (nunca solo color)
 *   - Explicación del score como condición del cultivo
 *   - Tendencia respecto al score anterior (si existe)
 *   - Motivo principal del estado
 *   - Fecha de actualización visible
 *
 * No usa términos crediticios ni probabilidades de cobro.
 */
export function ConditionSummary({ condicion }: ConditionSummaryProps) {
  const {
    score,
    scoreAnterior,
    estado,
    motivoPrincipal,
    fechaActualizacion,
    desactualizado,
  } = condicion;

  const cfg = CONFIG_ESTADO[estado];
  const { Icono } = cfg;
  const label = getLabelEstado(estado);

  const diferencia = scoreAnterior !== undefined ? parseFloat((score - scoreAnterior).toFixed(1)) : null;
  const subio = diferencia !== null && diferencia > 0;

  return (
    <section
      aria-labelledby="condition-summary-heading"
      className="flex flex-col gap-5"
    >
      <h2 id="condition-summary-heading" className="sr-only">
        Resumen de condición del lote
      </h2>

      {/* ── Score + badge de estado ─────────────────────── */}
      <div className="flex items-start gap-5 flex-wrap" aria-live="polite" aria-atomic="true">
        {/* Score destacado */}
        <div>
          <div
            className="flex items-baseline gap-1"
            aria-label={`Score de condición del cultivo: ${score.toFixed(1)} sobre 100`}
          >
            <span
              className={`text-[56px] leading-none font-bold tabular-nums ${cfg.claseScore}`}
              aria-hidden="true"
            >
              {score.toFixed(1)}
            </span>
            <span className="text-[24px] font-semibold text-[var(--color-text-muted)] leading-none" aria-hidden="true">
              /100
            </span>
          </div>
          {/* Aclaración semántica del score */}
          <p className="text-[11px] text-[var(--color-text-muted)] mt-1 max-w-[160px] leading-4">
            Condición del cultivo, no un score crediticio
          </p>
        </div>

        {/* Badge de estado: color + icono + texto (nunca solo color) */}
        <div className="flex flex-col gap-2 pt-1">
          <div
            className={[
              'inline-flex items-center gap-2 px-3 py-2',
              'rounded-[var(--radius-control)] border',
              cfg.claseFondo,
              cfg.claseBorde,
            ].join(' ')}
            role="status"
            aria-label={`Estado de condición: ${label}`}
          >
            <Icono size={18} className={cfg.claseIcono} aria-hidden="true" />
            <span className={`text-[14px] font-semibold leading-5 ${cfg.claseTexto}`}>
              {label}
            </span>
          </div>

          {/* Tendencia vs. score anterior */}
          {diferencia !== null && diferencia !== 0 && (
            <div
              className={[
                'flex items-center gap-1.5 text-[13px] font-medium',
                subio ? 'text-[var(--color-positive)]' : 'text-[var(--color-danger)]',
              ].join(' ')}
              aria-label={`Score anterior: ${scoreAnterior}. ${subio ? 'Subió' : 'Bajó'} ${Math.abs(diferencia!)} puntos.`}
            >
              {subio ? (
                <TrendingUp size={15} aria-hidden="true" />
              ) : (
                <TrendingDown size={15} aria-hidden="true" />
              )}
              <span>{subio ? '+' : ''}{diferencia} pts</span>
              <span className="text-[var(--color-text-muted)] font-normal">
                (anterior: {scoreAnterior?.toFixed(1)}/100)
              </span>
            </div>
          )}
        </div>
      </div>

      {/* ── Separador ────────────────────────────────────── */}
      <hr className="border-[var(--color-border)]" aria-hidden="true" />

      {/* ── Motivo principal ─────────────────────────────── */}
      <div className="flex flex-col gap-2">
        <h3 className="text-[12px] font-semibold text-[var(--color-text-muted)] uppercase tracking-wide">
          ¿Por qué este estado?
        </h3>
        <p className="text-[14px] text-[var(--color-ink)] leading-[22px]">
          {motivoPrincipal}
        </p>
      </div>

      {/* ── Fecha de actualización ───────────────────────── */}
      <div className={[
        'flex items-center gap-2 text-[12px]',
        desactualizado
          ? 'text-[var(--color-warning)] font-medium'
          : 'text-[var(--color-text-muted)]',
      ].join(' ')}>
        <Calendar size={13} aria-hidden="true" />
        <span>
          {desactualizado && <span className="mr-1">⚠ Dato desactualizado ·</span>}
          Actualizado: {fechaActualizacion}
        </span>
      </div>
    </section>
  );
}
