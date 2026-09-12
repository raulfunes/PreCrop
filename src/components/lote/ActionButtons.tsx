'use client';

import React, { useState } from 'react';
import { ArrowRight, CheckCircle2, AlertCircle, Copy, ExternalLink, ShieldAlert } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { ApiError } from '@/types';
import type { ScoreResponse, PublishResponse, DisburseResponse } from '@/types';

interface ActionButtonsProps {
  publish: () => Promise<PublishResponse>;
  disburse: (amountArs?: number) => Promise<DisburseResponse>;
  advance: ScoreResponse['advance'];
  disabled: boolean;
}

export function ActionButtons({ publish, disburse, advance, disabled }: ActionButtonsProps) {
  const [publishing, setPublishing] = useState(false);
  const [publishResult, setPublishResult] = useState<PublishResponse | null>(null);
  const [publishError, setPublishError] = useState<ApiError | null>(null);

  const [disbursing, setDisbursing] = useState(false);
  const [disburseResult, setDisburseResult] = useState<DisburseResponse | null>(null);
  const [disburseError, setDisburseError] = useState<ApiError | null>(null);
  const [showReviewConfirm, setShowReviewConfirm] = useState(false);

  const handlePublish = async () => {
    setPublishing(true);
    setPublishError(null);
    try {
      const res = await publish();
      setPublishResult(res);
    } catch (err: unknown) {
      setPublishError(err instanceof ApiError ? err : new ApiError({ error: 'Error de red al publicar' }));
    } finally {
      setPublishing(false);
    }
  };

  const executeDisburse = async () => {
    setDisbursing(true);
    setDisburseError(null);
    setShowReviewConfirm(false);
    try {
      const res = await disburse();
      setDisburseResult(res);
    } catch (err: unknown) {
      setDisburseError(err instanceof ApiError ? err : new ApiError({ error: 'Error de red al desembolsar' }));
    } finally {
      setDisbursing(false);
    }
  };

  const handleDisburseClick = () => {
    if (advance?.advance_limit.new_disbursements === 'review') {
      setShowReviewConfirm(true);
    } else {
      executeDisburse();
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  const disburseStatus = advance?.advance_limit.new_disbursements || 'blocked';
  const disablePublish = disabled || publishing;
  const isBlocked = disburseStatus === 'blocked' || disburseStatus === 'blocked_no_capacity';
  const disableDisburse = disabled || disbursing || isBlocked;

  return (
    <div className="flex flex-col gap-6">
      {/* SECCIÓN PUBLICAR */}
      <div className="flex flex-col gap-3">
        <h3 className="text-[13px] font-semibold text-[var(--color-text-muted)] uppercase tracking-wide">
          1. Publicar Evidencia
        </h3>

        {!publishResult ? (
          <>
            <Button
              variante="primario"
              tamanio="lg"
              onClick={handlePublish}
              disabled={disablePublish}
              iconoDerecha={<ArrowRight size={18} />}
              className="w-full"
            >
              {publishing ? 'Publicando...' : 'Publicar evidencia'}
            </Button>
            {publishError && (
              <div className="p-3 bg-[var(--color-danger-soft)] rounded-[var(--radius-badge)] border border-[var(--color-danger)]/20">
                <div className="flex items-start gap-2">
                  <AlertCircle size={16} className="text-[var(--color-danger)] shrink-0 mt-0.5" />
                  <div className="flex flex-col gap-1">
                    <span className="text-[13px] font-semibold text-[var(--color-danger)]">
                      {publishError.data?.error || publishError.message}
                    </span>
                    {publishError.data?.hint && (
                      <span className="text-[12px] text-[var(--color-danger)]/80 leading-4">
                        {publishError.data.hint}
                      </span>
                    )}
                    <button onClick={handlePublish} className="text-left mt-1 text-[12px] font-medium text-[var(--color-danger)] underline">
                      Reintentar
                    </button>
                  </div>
                </div>
              </div>
            )}
          </>
        ) : (
          <div className="p-4 bg-[var(--color-brand-soft)] rounded-[var(--radius-card)] border border-[var(--color-brand-primary)]/20 flex flex-col gap-3">
            <div className="flex items-center gap-2">
              <CheckCircle2 size={16} className="text-[var(--color-positive)] shrink-0" />
              <span className="text-[13px] text-[var(--color-positive)] font-semibold">
                DEVNET · Evidencia publicada
              </span>
            </div>
            <div className="flex flex-col gap-2 text-[12px] text-[var(--color-ink)]">
              <div className="flex justify-between items-center bg-white/50 p-2 rounded">
                <span className="text-[var(--color-text-muted)]">Network:</span>
                <span className="font-mono">{publishResult.anchor.network}</span>
              </div>
              <div className="flex justify-between items-center bg-white/50 p-2 rounded">
                <span className="text-[var(--color-text-muted)]">Hash:</span>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-[10px] truncate max-w-[150px]">{publishResult.evidence.content_sha256}</span>
                  <button onClick={() => copyToClipboard(publishResult.evidence.content_sha256)} className="text-[var(--color-brand-primary)]" title="Copiar Hash">
                    <Copy size={12} />
                  </button>
                </div>
              </div>
              <div className="flex justify-between items-center bg-white/50 p-2 rounded">
                <span className="text-[var(--color-text-muted)]">Firma:</span>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-[10px] truncate max-w-[150px]">{publishResult.anchor.signature}</span>
                </div>
              </div>
              <a href={publishResult.anchor.explorer_url} target="_blank" rel="noopener noreferrer" className="mt-1 flex items-center justify-center gap-2 text-[var(--color-brand-primary)] font-medium bg-white py-1.5 rounded border border-[var(--color-brand-primary)]/20 hover:bg-[var(--color-brand-soft)] transition-colors">
                Ver en Explorer <ExternalLink size={14} />
              </a>
            </div>
          </div>
        )}
      </div>

      <hr className="border-[var(--color-border)]" />

      {/* SECCIÓN DESEMBOLSAR */}
      <div className="flex flex-col gap-3">
        <h3 className="text-[13px] font-semibold text-[var(--color-text-muted)] uppercase tracking-wide">
          2. Desembolso
        </h3>

        {!disburseResult ? (
          <>
            {showReviewConfirm ? (
              <div className="p-3 bg-[var(--color-warning-soft)] rounded-[var(--radius-card)] border border-[var(--color-warning)]/30 flex flex-col gap-3">
                <div className="flex items-start gap-2">
                  <ShieldAlert size={16} className="text-[var(--color-warning)] shrink-0 mt-0.5" />
                  <div className="flex flex-col gap-1">
                    <span className="text-[13px] font-semibold text-[var(--color-warning)]">
                      Revisión de comité requerida
                    </span>
                    <span className="text-[12px] text-[var(--color-warning)]/80 leading-4">
                      El comité debe revisar esta operación. ¿Continuar con la simulación?
                    </span>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button variante="terciario" tamanio="sm" onClick={() => setShowReviewConfirm(false)} className="flex-1">
                    Cancelar
                  </Button>
                  <Button variante="primario" tamanio="sm" onClick={executeDisburse} className="flex-1">
                    Continuar
                  </Button>
                </div>
              </div>
            ) : (
              <Button
                variante="secundario"
                tamanio="lg"
                onClick={handleDisburseClick}
                disabled={disableDisburse}
                iconoDerecha={<ArrowRight size={18} />}
                className="w-full"
              >
                {disbursing ? 'Procesando...' : 'Aprobar y pagar en ARGt'}
              </Button>
            )}

            {isBlocked && !disabled && (
              <p className="text-[12px] text-[var(--color-danger)] font-medium mt-1">
                Motivo: {disburseStatus === 'blocked_no_capacity' ? 'No se estableció un techo de capacidad respaldado.' : 'Condición roja: no se liberan nuevos desembolsos.'}
              </p>
            )}

            {disburseError && (
              <div className="p-3 bg-[var(--color-danger-soft)] rounded-[var(--radius-badge)] border border-[var(--color-danger)]/20">
                <div className="flex items-start gap-2">
                  <AlertCircle size={16} className="text-[var(--color-danger)] shrink-0 mt-0.5" />
                  <div className="flex flex-col gap-1">
                    <span className="text-[13px] font-semibold text-[var(--color-danger)]">
                      Error: {disburseError.data?.error || disburseError.message}
                    </span>
                    {disburseError.data?.detail && (
                      <span className="text-[12px] text-[var(--color-danger)]/80 leading-4">
                        {disburseError.data.detail}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            )}
          </>
        ) : (
          <div className="p-4 bg-[var(--color-neutral-soft)] rounded-[var(--radius-card)] border border-[var(--color-border)] flex flex-col gap-3">
            <div className="flex items-center gap-2">
              <CheckCircle2 size={16} className="text-[var(--color-positive)] shrink-0" />
              <span className="text-[13px] text-[var(--color-positive)] font-semibold">
                Recibo de desembolso
              </span>
            </div>

            <div className="flex flex-col gap-2 text-[12px] text-[var(--color-ink)] bg-white p-3 rounded shadow-sm border border-[var(--color-border)]/50">
              <div className="flex justify-between items-center border-b pb-2">
                <span className="text-[var(--color-text-muted)]">Monto:</span>
                <span className="font-bold text-[14px]">{disburseResult.transfer.amount_ars.toLocaleString('es-AR')} {disburseResult.transfer.asset}</span>
              </div>
              <div className="flex justify-between items-center pt-1">
                <span className="text-[var(--color-text-muted)]">Estado:</span>
                <span className="font-medium capitalize text-[var(--color-positive)]">{disburseResult.transfer.status}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-[var(--color-text-muted)]">From:</span>
                <span className="font-mono text-[10px]">{disburseResult.transfer.from}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-[var(--color-text-muted)]">To:</span>
                <span className="font-mono text-[10px]">{disburseResult.transfer.to}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-[var(--color-text-muted)]">Ref:</span>
                <span className="font-mono text-[10px]">{disburseResult.transfer.reference}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-[var(--color-text-muted)]">Hash doc:</span>
                <span className="font-mono text-[10px] truncate max-w-[120px]">{disburseResult.evidence_sha256}</span>
              </div>
            </div>
          </div>
        )}
      </div>

    </div>
  );
}
