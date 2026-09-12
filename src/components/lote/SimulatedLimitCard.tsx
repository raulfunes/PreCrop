'use client';

import React from 'react';
import { Info, TrendingUp, AlertCircle } from 'lucide-react';
import { formatUSD } from '@/lib/scoreUtils';
import type { ScoreResponse } from '@/types';

interface SimulatedLimitCardProps {
  advance: ScoreResponse['advance'];
  superseded_advance?: ScoreResponse['superseded_advance'];
}

// ── Fila de dato financiero ─────────────────────────────────
interface FilaDatoProps {
  etiqueta: string;
  descripcion?: React.ReactNode;
  valor: React.ReactNode;
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
        'text-[15px] font-bold tabular-nums leading-5 shrink-0 text-right',
        colorValor ?? (muted ? 'text-[var(--color-text-muted)]' : 'text-[var(--color-ink)]'),
      ].join(' ')}
      >
        {valor}
      </span>
    </div>
  );
}

export function SimulatedLimitCard({ advance, superseded_advance }: SimulatedLimitCardProps) {
  if (!advance) {
    return (
      <section aria-labelledby="simulated-limit-heading" className="flex flex-col gap-4 items-center justify-center py-6 text-center">
        <h2 id="simulated-limit-heading" className="sr-only">Límite disponible por condición</h2>
        <AlertCircle size={24} className="text-[var(--color-text-muted)] mb-2" />
        <p className="text-[14px] font-medium text-[var(--color-ink)]">Límite no disponible</p>
      </section>
    );
  }

  const { advance_limit, floor, rule_version } = advance;
  const { new_disbursements, usd, ceiling_usd, pct_of_ceiling, formula, note } = advance_limit;

  const isBlockedRed = usd === 0 && new_disbursements === 'blocked';
  const isBlockedNoCap = usd === null && new_disbursements === 'blocked_no_capacity';

  return (
    <section aria-labelledby="simulated-limit-heading" className="flex flex-col gap-0">
      <h2 id="simulated-limit-heading" className="sr-only">Límite disponible por condición</h2>

      {isBlockedNoCap ? (
        <div className="flex flex-col gap-2 py-4 items-center text-center">
          <AlertCircle size={24} className="text-[var(--color-warning)]" />
          <p className="text-[14px] font-semibold text-[var(--color-warning)]">
            No hay capacidad respaldada para calcular un cupo
          </p>
          <p className="text-[13px] text-[var(--color-text-muted)] max-w-[280px]">
            {floor.available ? `Piso disponible en ${floor.campana} pero sin techo oficial.` : 'Tampoco hay un piso satelital medido válido.'}
          </p>
        </div>
      ) : isBlockedRed ? (
        <div className="flex flex-col gap-2 py-4 items-center text-center">
          <AlertCircle size={24} className="text-[var(--color-danger)]" />
          <p className="text-[14px] font-semibold text-[var(--color-danger)]">
            Desembolso bloqueado por condición roja
          </p>
          <p className="text-[20px] font-bold tabular-nums text-[var(--color-danger)]">
            Cupo medido: USD 0
          </p>
        </div>
      ) : (
        <FilaDato
          etiqueta="Límite disponible por condición"
          descripcion="Capacidad establece el techo. La condición actual libera una porción."
          valor={usd !== null ? formatUSD(usd) : 'N/A'}
          esDestacado
          colorValor="text-[var(--color-brand-primary)]"
          icono={<TrendingUp size={14} className="text-[var(--color-brand-primary)]" />}
        />
      )}

      {ceiling_usd !== null && (
        <FilaDato
          etiqueta="Techo de capacidad"
          descripcion={`Límite sugerido pre-siembra`}
          valor={formatUSD(ceiling_usd)}
        />
      )}

      {pct_of_ceiling > 0 && (
        <FilaDato
          etiqueta="Porcentaje liberado"
          descripcion="Por índice de condición"
          valor={`${pct_of_ceiling.toLocaleString('es-AR')}%`}
        />
      )}

      {floor.campana && (
        <FilaDato
          etiqueta="Piso productivo medido"
          descripcion={`Campaña: ${floor.campana}`}
          valor={<>
            <div>{floor.yield_t_ha} t/ha</div>
            <div className="text-[11px] font-normal text-[var(--color-text-muted)]">Valor: {floor.value_usd !== null ? formatUSD(floor.value_usd) : 'N/A'}</div>
          </>}
        />
      )}

      {superseded_advance && (
        <div className="mt-4 p-3 bg-[var(--color-neutral-soft)] border border-[var(--color-border)] rounded-[var(--radius-card)]">
          <p className="text-[12px] font-semibold text-[var(--color-ink)] mb-1">NO VIGENTE · Regla anterior descartada</p>
          <p className="text-[13px] font-bold text-[var(--color-text-muted)] line-through decoration-[var(--color-danger)] mb-1">
            {formatUSD(superseded_advance.usd)}
          </p>
          <p className="text-[11px] text-[var(--color-text-muted)] leading-[17px]">
            La regla <strong>{superseded_advance.rule_version}</strong> fue reemplazada por carecer de respaldo real. {superseded_advance.note}
          </p>
        </div>
      )}

      <div className="mt-4 flex items-start gap-2 p-3 bg-[var(--color-neutral-soft)] rounded-[var(--radius-badge)]">
        <Info size={13} className="text-[var(--color-text-muted)] shrink-0 mt-0.5" aria-hidden="true" />
        <div className="text-[11px] text-[var(--color-text-muted)] leading-[17px]">
          <strong className="text-[var(--color-ink)]">Regla del límite: {rule_version}</strong><br/>
          Fórmula: {formula}<br/>
          {note}
        </div>
      </div>
    </section>
  );
}
