'use client';

import React, { useState } from 'react';
import { Button } from '@/components/ui/Button';
import type { LotStateResponse, DisburseWorkflowResponse } from '@/lib/workflowClient';
import type { CapacityResponse } from '@/types';

export type Role = 'coop' | 'productor';

const usd = (n: number | null | undefined) => (n === null || n === undefined ? '—' : `USD ${Math.round(n).toLocaleString('es-AR')}`);
const ars = (n: number | null | undefined) => (n === null || n === undefined ? '—' : `ARGt ${Math.round(n).toLocaleString('es-AR')}`);

interface RoleActionsProps {
  role: Role;
  lot: LotStateResponse | null;
  capacity: CapacityResponse | null;
  busy: 'approve' | 'disburse' | 'reset' | 'photo' | null;
  lastReceipt: DisburseWorkflowResponse | null;
  onApprove: () => Promise<void>;
  onDisburse: () => Promise<DisburseWorkflowResponse>;
  onClearPhotos: () => Promise<void>;
}

/** Actions of the active role plus the shared disbursement history. */
export function RoleActions({ role, lot, capacity, busy, lastReceipt, onApprove, onDisburse, onClearPhotos }: RoleActionsProps) {
  const [localError, setLocalError] = useState<string | null>(null);
  const suggested = capacity?.capacity.pre_sowing_limit.usd ?? null;
  const representative = capacity?.capacity.representativeness.representative ?? false;
  const approved = lot?.approved ?? null;
  const preview = lot?.preview ?? null;
  const photos = lot?.photos_assessed ?? 0;
  const minPhotos = lot?.min_points_for_score ?? 3;

  const wrap = async (fn: () => Promise<unknown>) => {
    setLocalError(null);
    try { await fn(); } catch (e) { setLocalError(e instanceof Error ? e.message : 'Error inesperado'); }
  };

  return (
    <div className="flex flex-col gap-5">
      {role === 'coop' ? (
        <div className="flex flex-col gap-3">
          <p className="text-[14px] text-[var(--color-ink)] leading-6">
            Cupo sugerido por capacidad: <strong className="tabular-nums">{usd(suggested)}</strong>
            {representative ? ' · el lote sigue a su departamento' : ' · sin respaldo: el lote no sigue a su departamento'}
          </p>
          {approved ? (
            <div className="rounded-[var(--radius-control)] bg-[var(--color-brand-soft)] px-4 py-3 text-[14px] text-[var(--color-brand-primary)]">
              <strong>Cupo aprobado: {usd(approved.quota_usd)}</strong> · {approved.approved_by} · {new Date(approved.at).toLocaleString('es-AR')}
            </div>
          ) : (
            <Button
              variante="primario"
              tamanio="lg"
              cargando={busy === 'approve'}
              textoCargando="Aprobando…"
              disabled={suggested === null || !representative}
              onClick={() => wrap(onApprove)}
            >
              Aprobar cupo sugerido
            </Button>
          )}
          <p className="text-[12px] text-[var(--color-text-muted)] leading-5">
            La coop nunca puede aprobar por encima del cupo sugerido. El productor recién puede pedir un desembolso cuando el cupo está aprobado y hay fotos en {minPhotos} puntos.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {!approved && (
            <div className="rounded-[var(--radius-control)] bg-[var(--color-neutral-soft)] px-4 py-3 text-[14px] text-[var(--color-text-muted)]">
              La coop todavía no aprobó el cupo de este lote.
            </div>
          )}
          {approved && photos < minPhotos && (
            <div className="rounded-[var(--radius-control)] bg-[var(--color-warning-soft)] px-4 py-3 text-[14px] text-[var(--color-warning)]">
              Para solicitar un desembolso, subí fotos en {minPhotos} puntos del lote (hay {photos}). Tocá un punto en el mapa.
            </div>
          )}
          {approved && preview && (
            <div className="rounded-[var(--radius-control)] border border-[var(--color-border)] px-4 py-3 text-[14px] leading-6">
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-[var(--color-text-muted)]">Disponible ahora</span>
                <strong className={`text-[20px] tabular-nums ${preview.light === 'rojo' ? 'text-[var(--color-danger)]' : 'text-[var(--color-ink)]'}`}>{usd(preview.available_usd)}</strong>
              </div>
              <div className="text-[12px] text-[var(--color-text-muted)]">
                Índice {preview.index.toFixed(1)} · {preview.light} · liberado {usd(preview.released_usd)} · pagado {usd(preview.paid_usd)}
              </div>
            </div>
          )}
          <div className="flex flex-wrap gap-3">
            <Button
              variante="primario"
              tamanio="lg"
              cargando={busy === 'disburse'}
              textoCargando="Solicitando…"
              disabled={!preview?.can_withdraw}
              onClick={() => wrap(onDisburse)}
            >
              Retirar {preview?.can_withdraw ? usd(preview.available_usd) : ''}
            </Button>
            {photos > 0 && (
              <Button variante="secundario" tamanio="lg" cargando={busy === 'photo'} onClick={() => wrap(onClearPhotos)}>
                Nueva ronda de fotos
              </Button>
            )}
          </div>
          <p className="text-[12px] text-[var(--color-text-muted)] leading-5">
            El retiro se paga en ARGt por Twin (simulado). Si la condición está en rojo, el sistema lo rechaza y queda registrado.
          </p>
        </div>
      )}

      {lastReceipt && (
        <div
          className={`rounded-[var(--radius-control)] px-4 py-3 text-[14px] leading-6 ${lastReceipt.receipt.status === 'paid' ? 'bg-[var(--color-brand-soft)] text-[var(--color-brand-primary)]' : 'bg-[var(--color-danger-soft)] text-[var(--color-danger)]'}`}
          role="status"
        >
          {lastReceipt.receipt.status === 'paid' ? (
            <>
              <strong>Desembolso {lastReceipt.receipt.n} pagado:</strong> {usd(lastReceipt.receipt.amount_usd)} ({ars(lastReceipt.receipt.amount_ars)}) · {lastReceipt.receipt.rail} · ref {lastReceipt.receipt.reference}
            </>
          ) : (
            <>
              <strong>Desembolso {lastReceipt.receipt.n} rechazado:</strong> {lastReceipt.receipt.reason}
            </>
          )}
        </div>
      )}

      {localError && (
        <p className="text-[13px] text-[var(--color-danger)]" role="alert">{localError}</p>
      )}

      {lot && lot.disbursements.length > 0 && (
        <div>
          <h3 className="text-[11px] font-semibold uppercase tracking-wide text-[var(--color-text-muted)] mb-2">Historial de desembolsos</h3>
          <ol className="flex flex-col gap-2">
            {lot.disbursements.map((d) => (
              <li key={d.n} className="flex items-start justify-between gap-3 text-[13px] leading-5 border-b border-[var(--color-border)] pb-2 last:border-0">
                <div>
                  <span className={`inline-block rounded-[var(--radius-pill)] px-2 py-0.5 text-[11px] font-semibold ${d.status === 'paid' ? 'bg-[var(--color-brand-soft)] text-[var(--color-brand-primary)]' : 'bg-[var(--color-danger-soft)] text-[var(--color-danger)]'}`}>
                    {d.status === 'paid' ? 'Pagado' : 'Rechazado'}
                  </span>
                  <span className="ml-2 text-[var(--color-text-muted)]">
                    #{d.n} · escena {d.scenario} · índice {d.index ?? '—'} · malezas {d.weeds_median_pct ?? '—'} %
                  </span>
                  {d.reason && <div className="text-[var(--color-text-muted)]">{d.reason}</div>}
                </div>
                <strong className="tabular-nums whitespace-nowrap">{usd(d.amount_usd)}</strong>
              </li>
            ))}
          </ol>
        </div>
      )}
    </div>
  );
}
