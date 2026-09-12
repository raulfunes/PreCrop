'use client';

import React from 'react';
import { Info, TrendingUp, AlertCircle } from 'lucide-react';
import { formatUSD } from '@/lib/scoreUtils';
import type { ScoreResponse } from '@/types';

interface SimulatedLimitCardProps {
  advance: ScoreResponse['advance'];
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

export function SimulatedLimitCard({ advance }: SimulatedLimitCardProps) {
  if (!advance) {
    return (
      <section aria-labelledby="simulated-limit-heading" className="flex flex-col gap-4 items-center justify-center py-6 text-center">
        <h2 id="simulated-limit-heading" className="sr-only">
          Cupo de anticipo simulado
        </h2>
        <AlertCircle size={24} className="text-[var(--color-text-muted)] mb-2" />
        <p className="text-[14px] font-medium text-[var(--color-ink)]">
          Límite no disponible
        </p>
        <p className="text-[13px] text-[var(--color-text-muted)] max-w-[200px]">
          El estado actual del lote no habilita el cálculo de un límite de anticipo.
        </p>
      </section>
    );
  }

  const { advance_limit, reference, rule_version } = advance;
  const isBlocked = advance_limit.new_disbursements === 'blocked';

  return (
    <section aria-labelledby="simulated-limit-heading" className="flex flex-col gap-0">
      <h2 id="simulated-limit-heading" className="sr-only">
        Cupo de anticipo simulado
      </h2>

      <FilaDato
        etiqueta="Límite de anticipo sugerido"
        descripcion={`Referencia: ${formatUSD(reference.reference_value_usd)} · ${advance_limit.pct_of_reference_value}`}
        valor={formatUSD(advance_limit.usd)}
        esDestacado
        colorValor="text-[var(--color-brand-primary)]"
        icono={<TrendingUp size={14} className="text-[var(--color-brand-primary)]" />}
      />

      <FilaDato
        etiqueta="Límite en ARGt"
        descripcion="Conversión simulada a tasa actual"
        valor={`ARGt ${advance_limit.ars.toLocaleString('es-AR')}`}
      />

      {isBlocked && (
        <div className="mt-4 flex items-start gap-2 p-3 bg-[var(--color-danger-soft)] rounded-[var(--radius-badge)] border border-[var(--color-danger)]/20">
          <AlertCircle size={14} className="text-[var(--color-danger)] shrink-0 mt-0.5" aria-hidden="true" />
          <p className="text-[12px] text-[var(--color-danger)] leading-[18px]">
            <strong>Nuevos desembolsos bloqueados.</strong>{' '}
            El cupo teórico positivo no habilita desembolsos en estado desfavorable.
          </p>
        </div>
      )}

      <div className="mt-4 flex items-start gap-2 p-3 bg-[var(--color-neutral-soft)] rounded-[var(--radius-badge)]">
        <Info size={13} className="text-[var(--color-text-muted)] shrink-0 mt-0.5" aria-hidden="true" />
        <p className="text-[11px] text-[var(--color-text-muted)] leading-[17px]">
          <strong className="text-[var(--color-ink)]">Regla de capacidad: {rule_version}</strong><br/>
          Simulación. El monto definitivo depende de la cotización al momento del contrato.
        </p>
      </div>
    </section>
  );
}
