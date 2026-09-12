'use client';

import React from 'react';
import { CheckCircle2, AlertTriangle, XOctagon, Clock, RefreshCw, AlertCircle, Calendar } from 'lucide-react';
import type { ScoreResponse, EstadoLote, ApiError } from '@/types';
import { getLabelEstado } from '@/lib/scoreUtils';
import { Button } from '@/components/ui/Button';

interface ConditionSummaryProps {
  scoreData: ScoreResponse | null;
  isLoading: boolean;
  error: ApiError | null;
  onRetry: () => void;
}

// ── Configuración de estado ──────
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

export function ConditionSummary({ scoreData, isLoading, error, onRetry }: ConditionSummaryProps) {
  if (isLoading && !scoreData) {
    return (
      <div className="flex flex-col items-center justify-center py-10 gap-3 text-[var(--color-text-muted)]">
        <RefreshCw className="animate-spin" size={24} />
        <p className="text-[14px] font-medium">Calculando condición...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-10 gap-4 text-center">
        <AlertCircle size={32} className="text-[var(--color-danger)]" />
        <div>
          <p className="text-[14px] font-semibold text-[var(--color-danger)]">Error al calcular la condición</p>
          <p className="text-[13px] text-[var(--color-danger)]/80 mt-1 max-w-[250px] mx-auto">{error.message}</p>
        </div>
        <Button onClick={onRetry} variante="secundario" tamanio="sm">
          Reintentar
        </Button>
      </div>
    );
  }

  if (!scoreData) return null;

  const { result, factors, evidence } = scoreData;
  const cfg = CONFIG_ESTADO[result.light] || CONFIG_ESTADO['sin-datos'];
  const { Icono } = cfg;
  const label = getLabelEstado(result.light);

  const observedDate = typeof evidence?.payload?.observed_date === 'string'
    ? evidence.payload.observed_date
    : null;

  return (
    <section aria-labelledby="condition-summary-heading" className={`flex flex-col gap-5 ${isLoading ? 'opacity-50 pointer-events-none' : 'transition-opacity duration-300'}`}>
      <h2 id="condition-summary-heading" className="sr-only">
        Resumen de condición del lote
      </h2>

      {/* ── Score + badge de estado ─────────────────────── */}
      <div className="flex items-start gap-5 flex-wrap" aria-live="polite" aria-atomic="true">
        <div>
          <div className="flex items-baseline gap-1" aria-label={`Score de condición del cultivo: ${result.score.toFixed(1)} sobre 100`}>
            <span className={`text-[56px] leading-none font-bold tabular-nums ${cfg.claseScore}`} aria-hidden="true">
              {result.score.toFixed(1)}
            </span>
            <span className="text-[24px] font-semibold text-[var(--color-text-muted)] leading-none" aria-hidden="true">
              /100
            </span>
          </div>
          <p className="text-[11px] text-[var(--color-text-muted)] mt-1 max-w-[160px] leading-4">
            Condición del cultivo, no un score crediticio
          </p>
        </div>

        <div className="flex flex-col gap-2 pt-1">
          <div className={`inline-flex items-center gap-2 px-3 py-2 rounded-[var(--radius-control)] border ${cfg.claseFondo} ${cfg.claseBorde}`} role="status">
            <Icono size={18} className={cfg.claseIcono} aria-hidden="true" />
            <span className={`text-[14px] font-semibold leading-5 ${cfg.claseTexto}`}>
              {label}
            </span>
          </div>
        </div>
      </div>

      <hr className="border-[var(--color-border)]" aria-hidden="true" />

      {/* ── Composición del índice (Factores) ───────────────── */}
      <div className="flex flex-col gap-3">
        <h3 className="text-[12px] font-semibold text-[var(--color-text-muted)] uppercase tracking-wide">
          Composición del índice
        </h3>

        {factors && factors.length > 0 ? (
          <div className="flex flex-col gap-2">
            {factors.map((f, i) => {
              const isNegative = f.contribution < 0;
              return (
                <div key={i} className="flex justify-between items-center bg-[var(--color-neutral-soft)] p-2 rounded border border-[var(--color-border)]">
                  <div className="flex flex-col gap-0.5">
                    <span className="text-[13px] font-medium text-[var(--color-ink)]">{f.label}</span>
                    <span className="text-[11px] text-[var(--color-text-muted)]">{f.value} · peso: {f.weight} · origen: {f.source}</span>
                  </div>
                  <span className={`text-[13px] font-bold tabular-nums ${isNegative ? 'text-[var(--color-danger)]' : 'text-[var(--color-positive)]'}`}>
                    {isNegative ? '' : '+'}{f.contribution.toFixed(1)} pts
                  </span>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="text-[13px] text-[var(--color-text-muted)]">No hay factores disponibles.</p>
        )}
      </div>

      {/* ── Fecha de actualización ───────────────────────── */}
      {observedDate && (
        <div className="flex items-center gap-2 text-[12px] text-[var(--color-text-muted)] mt-2">
          <Calendar size={13} aria-hidden="true" />
          <span>Actualizado: {observedDate}</span>
        </div>
      )}
    </section>
  );
}
