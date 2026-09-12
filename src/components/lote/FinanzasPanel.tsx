'use client';

import React from 'react';
import { Info } from 'lucide-react';
import type { FinanzasDemo, EstadoLote } from '@/types';
import { formatUSD, calcularCupoSimulado } from '@/lib/scoreUtils';

interface FinanzasPanelProps {
  finanzas: FinanzasDemo;
  score: number;
  estado: EstadoLote;
}

interface FilaFinanzaProps {
  etiqueta: string;
  valor: string;
  descripcion?: string;
  destacado?: boolean;
  colorValor?: string;
}

function FilaFinanza({ etiqueta, valor, descripcion, destacado, colorValor }: FilaFinanzaProps) {
  return (
    <div className="flex items-center justify-between py-3 border-b border-[var(--color-border)] last:border-0">
      <div className="flex flex-col gap-0.5">
        <span className={[
          'text-[14px] leading-5',
          destacado ? 'font-semibold text-[var(--color-ink)]' : 'text-[var(--color-text-muted)]',
        ].join(' ')}>
          {etiqueta}
        </span>
        {descripcion && (
          <span className="text-[11px] text-[var(--color-text-muted)]">{descripcion}</span>
        )}
      </div>
      <span className={[
        'text-[15px] font-bold tabular-nums leading-5',
        colorValor ?? 'text-[var(--color-ink)]',
      ].join(' ')}>
        {valor}
      </span>
    </div>
  );
}

/**
 * Panel de finanzas simuladas.
 * Muestra cupo simulado (con fórmula), fondos aportados, capital desembolsado
 * y fondos disponibles — siempre como montos separados.
 */
export function FinanzasPanel({ finanzas, score, estado }: FinanzasPanelProps) {
  const cupoCalculado = calcularCupoSimulado(finanzas.cosechaEstimadaBase, score);
  const porcentajeUsado =
    finanzas.cupoSimulado > 0
      ? Math.min(100, Math.round((finanzas.capitalDesembolsado / finanzas.cupoSimulado) * 100))
      : 0;

  return (
    <div className="flex flex-col gap-0">
      <FilaFinanza
        etiqueta="Cupo de anticipo simulado"
        valor={formatUSD(cupoCalculado)}
        descripcion="cosecha estimada × (score/100) × 0,7"
        destacado
      />
      <FilaFinanza
        etiqueta="Fondos de prueba aportados"
        valor={formatUSD(finanzas.fondosAportados)}
        descripcion="DEMO · Fondos de prueba · MOCK"
      />
      <FilaFinanza
        etiqueta="Capital desembolsado"
        valor={formatUSD(finanzas.capitalDesembolsado)}
        descripcion="Fondos de prueba entregados en la simulación"
        colorValor={finanzas.capitalDesembolsado > 0 ? 'text-[var(--color-brand-primary)]' : undefined}
        destacado={finanzas.capitalDesembolsado > 0}
      />
      <FilaFinanza
        etiqueta="Fondos disponibles"
        valor={formatUSD(finanzas.fondosDisponibles)}
        descripcion="Saldo de prueba sin desembolsar"
        colorValor={
          finanzas.fondosDisponibles > 0
            ? 'text-[var(--color-positive)]'
            : 'text-[var(--color-text-muted)]'
        }
      />

      {finanzas.capitalDesembolsado > 0 && (
        <div className="mt-4">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[12px] text-[var(--color-text-muted)]">
              Uso del cupo simulado
            </span>
            <span className="text-[12px] font-semibold text-[var(--color-ink)] tabular-nums">
              {porcentajeUsado} %
            </span>
          </div>
          <div
            className="h-2 rounded-[var(--radius-pill)] bg-[var(--color-neutral-soft)] overflow-hidden"
            role="progressbar"
            aria-valuenow={porcentajeUsado}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={`Uso del cupo simulado: ${porcentajeUsado}%`}
          >
            <div
              className={[
                'h-full rounded-[var(--radius-pill)] transition-all duration-500',
                estado === 'rojo'
                  ? 'bg-[var(--color-danger)]'
                  : estado === 'amarillo'
                  ? 'bg-[var(--color-warning)]'
                  : 'bg-[var(--color-brand-primary)]',
              ].join(' ')}
              style={{ width: `${porcentajeUsado}%` }}
            />
          </div>
        </div>
      )}

      <div className="mt-4 flex items-start gap-2 p-3 bg-[var(--color-neutral-soft)] rounded-[var(--radius-badge)]">
        <Info size={14} className="text-[var(--color-text-muted)] mt-0.5 shrink-0" aria-hidden="true" />
        <p className="text-[12px] text-[var(--color-text-muted)] leading-[18px]">
          <strong className="text-[var(--color-ink)]">
            10 % por campaña sobre capital desembolsado · Simulación.
          </strong>{' '}
          Este interés se aplica al capital efectivamente desembolsado y no representa una tasa anual.
        </p>
      </div>
    </div>
  );
}
