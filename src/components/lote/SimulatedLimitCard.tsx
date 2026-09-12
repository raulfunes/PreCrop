'use client';

import React from 'react';
import { Info, TrendingUp, AlertCircle } from 'lucide-react';
import type { FinanzasDemo, EstadoLote } from '@/types';
import { formatUSD, calcularCupoSimulado } from '@/lib/scoreUtils';

interface SimulatedLimitCardProps {
  finanzas: FinanzasDemo;
  score: number;
  estado: EstadoLote;
}

// ── Fila de dato financiero ─────────────────────────────────
interface FilaDatoProps {
  etiqueta: string;
  descripcion?: string;
  valor: string;
  esDestacado?: boolean;
  colorValor?: string;
  icono?: React.ReactNode;
  muted?: boolean;
}

function FilaDato({
  etiqueta,
  descripcion,
  valor,
  esDestacado,
  colorValor,
  icono,
  muted,
}: FilaDatoProps) {
  return (
    <div className={[
      'flex items-start justify-between gap-3 py-3',
      'border-b border-[var(--color-border)] last:border-0',
    ].join(' ')}>
      <div className="flex flex-col gap-0.5 min-w-0">
        <div className="flex items-center gap-1.5">
          {icono && <span aria-hidden="true">{icono}</span>}
          <span className={[
            'text-[13px] leading-5',
            esDestacado
              ? 'font-semibold text-[var(--color-ink)]'
              : 'font-medium text-[var(--color-ink)]',
            muted ? 'text-[var(--color-text-muted)]' : '',
          ].join(' ')}>
            {etiqueta}
          </span>
        </div>
        {descripcion && (
          <span className="text-[11px] text-[var(--color-text-muted)] leading-4">
            {descripcion}
          </span>
        )}
      </div>
      <span className={[
        'text-[15px] font-bold tabular-nums leading-5 shrink-0',
        colorValor ?? (muted ? 'text-[var(--color-text-muted)]' : 'text-[var(--color-ink)]'),
      ].join(' ')}
        aria-label={`${etiqueta}: ${valor}`}
      >
        {valor}
      </span>
    </div>
  );
}

/**
 * SimulatedLimitCard — efecto sobre el anticipo (branding §11 punto 4).
 *
 * Separa con claridad los cuatro conceptos del branding §3:
 *   - Cupo de anticipo simulado  (tope teórico calculado)
 *   - Fondos de prueba aportados (total de prueba)
 *   - Capital desembolsado       (fondos ya entregados)
 *   - Fondos disponibles         (saldo sin desembolsar)
 *
 * En el estado inicial solo existe el cupo; el resto aparece en cero.
 * Los ceros son explícitos: no se ocultan para no confundir al jurado.
 *
 * No usa "Aprobado 100%", "salud óptima", "inversión segura" ni "score crediticio".
 */
export function SimulatedLimitCard({ finanzas, score, estado }: SimulatedLimitCardProps) {
  const cupoCalculado = calcularCupoSimulado(finanzas.cosechaEstimadaBase, score);
  const porcentajeUso =
    cupoCalculado > 0
      ? Math.min(100, Math.round((finanzas.capitalDesembolsado / cupoCalculado) * 100))
      : 0;

  const hayDesembolso = finanzas.capitalDesembolsado > 0;
  const hayFondos = finanzas.fondosAportados > 0;

  return (
    <section aria-labelledby="simulated-limit-heading" className="flex flex-col gap-0">
      <h2 id="simulated-limit-heading" className="sr-only">
        Cupo de anticipo simulado y estado de fondos de prueba
      </h2>

      {/* ── Cupo simulado + fórmula ─────────────────────── */}
      <FilaDato
        etiqueta="Cupo de anticipo simulado"
        descripcion={`cosecha_base × (${score.toFixed(1)}/100) × 0,7 = ${formatUSD(cupoCalculado)}`}
        valor={formatUSD(cupoCalculado)}
        esDestacado
        colorValor="text-[var(--color-brand-primary)]"
        icono={<TrendingUp size={14} className="text-[var(--color-brand-primary)]" />}
      />

      {/* ── Fondos aportados ─────────────────────────────── */}
      <FilaDato
        etiqueta="Fondos de prueba aportados"
        descripcion="DEMO · Fondos simulados · MOCK"
        valor={hayFondos ? formatUSD(finanzas.fondosAportados) : '–'}
        muted={!hayFondos}
        colorValor={hayFondos ? 'text-[var(--color-ink)]' : undefined}
      />

      {/* ── Capital desembolsado ─────────────────────────── */}
      <FilaDato
        etiqueta="Capital desembolsado"
        descripcion={hayDesembolso ? 'Fondos de prueba entregados en la simulación' : 'Aún sin desembolsos en esta simulación'}
        valor={hayDesembolso ? formatUSD(finanzas.capitalDesembolsado) : '–'}
        muted={!hayDesembolso}
        colorValor={hayDesembolso ? 'text-[var(--color-brand-primary)]' : undefined}
        esDestacado={hayDesembolso}
      />

      {/* ── Fondos disponibles ───────────────────────────── */}
      <FilaDato
        etiqueta="Fondos disponibles"
        descripcion="Saldo de prueba sin desembolsar"
        valor={hayFondos ? formatUSD(finanzas.fondosDisponibles) : '–'}
        muted={!hayFondos || finanzas.fondosDisponibles === 0}
        colorValor={
          finanzas.fondosDisponibles > 0
            ? 'text-[var(--color-positive)]'
            : undefined
        }
      />

      {/* ── Barra de uso del cupo ────────────────────────── */}
      {hayDesembolso && (
        <div className="pt-4 pb-1">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[11px] text-[var(--color-text-muted)] font-medium">
              Uso del cupo simulado
            </span>
            <span className="text-[12px] font-bold tabular-nums text-[var(--color-ink)]">
              {porcentajeUso} %
            </span>
          </div>
          <div
            className="h-2.5 rounded-[var(--radius-pill)] bg-[var(--color-neutral-soft)] overflow-hidden"
            role="progressbar"
            aria-valuenow={porcentajeUso}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={`Uso del cupo simulado: ${porcentajeUso} por ciento`}
          >
            <div
              className={[
                'h-full rounded-[var(--radius-pill)] transition-all duration-700 ease-out',
                estado === 'rojo'   ? 'bg-[var(--color-danger)]'
                : estado === 'amarillo' ? 'bg-[var(--color-warning)]'
                : 'bg-[var(--color-brand-primary)]',
              ].join(' ')}
              style={{ width: `${porcentajeUso}%` }}
            />
          </div>
        </div>
      )}

      {/* ── Bloqueo en rojo ──────────────────────────────── */}
      {estado === 'rojo' && (
        <div className="mt-4 flex items-start gap-2 p-3 bg-[var(--color-danger-soft)] rounded-[var(--radius-badge)] border border-[var(--color-danger)]/20">
          <AlertCircle size={14} className="text-[var(--color-danger)] shrink-0 mt-0.5" aria-hidden="true" />
          <p className="text-[12px] text-[var(--color-danger)] leading-[18px]">
            <strong>Nuevos desembolsos bloqueados.</strong>{' '}
            El cupo teórico positivo no habilita desembolsos en estado desfavorable.
          </p>
        </div>
      )}

      {/* ── Nota aclaratoria (tasa + simulación) ─────────── */}
      <div className="mt-4 flex items-start gap-2 p-3 bg-[var(--color-neutral-soft)] rounded-[var(--radius-badge)]">
        <Info size={13} className="text-[var(--color-text-muted)] shrink-0 mt-0.5" aria-hidden="true" />
        <p className="text-[11px] text-[var(--color-text-muted)] leading-[17px]">
          <strong className="text-[var(--color-ink)]">{finanzas.tasaCampana * 100} % por campaña sobre capital desembolsado · Simulación.</strong>{' '}
          No es una tasa anual. Se aplica al capital efectivamente entregado.
          Cosecha estimada base: {formatUSD(finanzas.cosechaEstimadaBase)}.
        </p>
      </div>
    </section>
  );
}
