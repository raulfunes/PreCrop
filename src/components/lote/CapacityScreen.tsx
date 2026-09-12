'use client';

import React from 'react';
import { RefreshCw, AlertCircle, TrendingUp, BarChart3, Info, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { formatUSD } from '@/lib/scoreUtils';
import type { CapacityResponse, ApiError } from '@/types';

interface CapacityScreenProps {
  data: CapacityResponse | null;
  isLoading: boolean;
  error: ApiError | null;
  onRetry: () => void;
}

export function CapacityScreen({ data, isLoading, error, onRetry }: CapacityScreenProps) {
  if (isLoading && !data) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-3 text-[var(--color-text-muted)]">
        <RefreshCw className="animate-spin" size={24} />
        <p className="text-[14px] font-medium">Cargando historial de capacidad...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-4 text-center">
        <AlertCircle size={32} className="text-[var(--color-danger)]" />
        <div>
          <p className="text-[14px] font-semibold text-[var(--color-danger)]">Error al cargar capacidad</p>
          <p className="text-[13px] text-[var(--color-danger)]/80 mt-1 max-w-[300px] mx-auto">{error.message}</p>
        </div>
        <Button onClick={onRetry} variante="secundario" tamanio="sm">Reintentar</Button>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-3 text-[var(--color-text-muted)]">
        <BarChart3 size={24} />
        <p className="text-[14px] font-medium">Sin datos de capacidad disponibles.</p>
      </div>
    );
  }

  if (data.campaigns.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-3 text-[var(--color-text-muted)]">
        <BarChart3 size={24} />
        <p className="text-[14px] font-medium">No hay campañas cargadas en el historial.</p>
      </div>
    );
  }

  const { pre_sowing_quota, worst_campaign, stability, campaigns, rule_version } = data;
  const maxYield = Math.max(...campaigns.map(c => c.yield_est_t_ha));

  return (
    <div className="flex flex-col gap-6">
      {/* Demo banner */}
      <div className="p-3 bg-[var(--color-warning-soft)] rounded-[var(--radius-badge)] border border-[var(--color-warning)]/20 text-center">
        <span className="text-[12px] font-semibold text-[var(--color-warning)]">DEMO · Regla no calibrada</span>
      </div>

      {/* Cupo pre-siembra */}
      <section className="bg-[var(--color-surface)] rounded-[var(--radius-card)] border border-[var(--color-border)] shadow-[var(--shadow-card)] p-5 md:p-6">
        <h2 className="text-[13px] font-semibold text-[var(--color-text-muted)] uppercase tracking-wide mb-4">
          Cupo pre-siembra sugerido
        </h2>
        <div className="flex items-baseline gap-2 mb-2">
          <TrendingUp size={18} className="text-[var(--color-brand-primary)]" />
          <span className="text-[32px] font-bold tabular-nums text-[var(--color-brand-primary)]">
            {formatUSD(pre_sowing_quota.usd)}
          </span>
        </div>
        {pre_sowing_quota.ars !== null && (
          <p className="text-[15px] font-semibold text-[var(--color-ink)] mb-1">
            ARGt {pre_sowing_quota.ars.toLocaleString('es-AR')}
          </p>
        )}
        {pre_sowing_quota.ars === null && (
          <p className="text-[13px] text-[var(--color-text-muted)] mb-1">Conversión a ARGt no disponible</p>
        )}
        <p className="text-[13px] text-[var(--color-text-muted)] mb-3">
          {pre_sowing_quota.pct_of_reference_value}% del valor de referencia · Haircut {pre_sowing_quota.haircut}
        </p>
        <p className="text-[14px] font-medium text-[var(--color-ink)] mb-3">
          Contra el peor año que este lote ya tuvo
        </p>

        <div className="grid grid-cols-2 gap-3 text-[13px]">
          <div className="bg-[var(--color-neutral-soft)] p-3 rounded border border-[var(--color-border)]">
            <span className="text-[var(--color-text-muted)]">Peor campaña</span>
            <p className="font-bold text-[var(--color-ink)] mt-0.5">{worst_campaign.campaign}</p>
          </div>
          <div className="bg-[var(--color-neutral-soft)] p-3 rounded border border-[var(--color-border)]">
            <span className="text-[var(--color-text-muted)]">Rinde del peor año</span>
            <p className="font-bold text-[var(--color-ink)] mt-0.5">{worst_campaign.yield_est_t_ha} t/ha</p>
          </div>
          <div className="bg-[var(--color-neutral-soft)] p-3 rounded border border-[var(--color-border)]">
            <span className="text-[var(--color-text-muted)]">Toneladas estimadas</span>
            <p className="font-bold text-[var(--color-ink)] mt-0.5">{worst_campaign.tons_est} t</p>
          </div>
          <div className="bg-[var(--color-neutral-soft)] p-3 rounded border border-[var(--color-border)]">
            <span className="text-[var(--color-text-muted)]">Estabilidad</span>
            <p className="font-bold text-[var(--color-ink)] mt-0.5 capitalize">
              {stability.label}{stability.cv_pct !== null ? ` (CV ${stability.cv_pct}%)` : ''}
            </p>
          </div>
        </div>

        <div className="mt-4 flex items-start gap-2 p-3 bg-[var(--color-neutral-soft)] rounded-[var(--radius-badge)]">
          <Info size={13} className="text-[var(--color-text-muted)] shrink-0 mt-0.5" />
          <p className="text-[11px] text-[var(--color-text-muted)] leading-[17px]">
            <strong className="text-[var(--color-ink)]">Regla del límite: {rule_version}</strong> · Pack {data.pack_version}
          </p>
        </div>
      </section>

      {/* Campañas */}
      <section className="bg-[var(--color-surface)] rounded-[var(--radius-card)] border border-[var(--color-border)] shadow-[var(--shadow-card)] p-5 md:p-6">
        <h2 className="text-[13px] font-semibold text-[var(--color-text-muted)] uppercase tracking-wide mb-4">
          Historial de campañas ({data.n_campaigns})
        </h2>

        <div className="flex flex-col gap-3" role="list" aria-label="Historial de campañas">
          {campaigns.map((c) => {
            const isWorst = c.campaign === worst_campaign.campaign;
            const barWidth = maxYield > 0 ? (c.yield_est_t_ha / maxYield) * 100 : 0;
            const officialBarWidth = c.official_yield_t_ha !== null && maxYield > 0
              ? (c.official_yield_t_ha / maxYield) * 100 : 0;

            return (
              <div
                key={c.campaign}
                role="listitem"
                className={`p-3 rounded border ${isWorst ? 'border-[var(--color-danger)]/40 bg-[var(--color-danger-soft)]' : 'border-[var(--color-border)] bg-[var(--color-neutral-soft)]'}`}
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className={`text-[14px] font-bold ${isWorst ? 'text-[var(--color-danger)]' : 'text-[var(--color-ink)]'}`}>
                      {c.campaign}
                    </span>
                    {isWorst && (
                      <span className="text-[10px] font-semibold text-white bg-[var(--color-danger)] px-1.5 py-0.5 rounded">PEOR</span>
                    )}
                  </div>
                  <span className="text-[13px] font-bold tabular-nums text-[var(--color-ink)]">{c.yield_est_t_ha} t/ha</span>
                </div>

                {/* Barras de rinde */}
                <div className="flex flex-col gap-1.5 mb-2">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-[var(--color-text-muted)] w-[55px] shrink-0">Estimado</span>
                    <div className="flex-1 bg-white rounded-full h-4 overflow-hidden border border-[var(--color-border)]/50">
                      <div
                        className={`h-full rounded-full transition-all ${isWorst ? 'bg-[var(--color-danger)]' : 'bg-[var(--color-brand-primary)]'}`}
                        style={{ width: `${barWidth}%` }}
                        role="meter"
                        aria-valuenow={c.yield_est_t_ha}
                        aria-valuemin={0}
                        aria-valuemax={maxYield}
                        aria-label={`Rinde estimado: ${c.yield_est_t_ha} t/ha`}
                      />
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-[var(--color-text-muted)] w-[55px] shrink-0">Oficial</span>
                    <div className="flex-1 bg-white rounded-full h-4 overflow-hidden border border-[var(--color-border)]/50">
                      {c.official_yield_t_ha !== null ? (
                        <div
                          className="h-full rounded-full bg-[var(--color-text-muted)]/40 transition-all"
                          style={{ width: `${officialBarWidth}%` }}
                          role="meter"
                          aria-valuenow={c.official_yield_t_ha}
                          aria-valuemin={0}
                          aria-valuemax={maxYield}
                          aria-label={`Rinde oficial: ${c.official_yield_t_ha} t/ha`}
                        />
                      ) : (
                        <span className="text-[10px] text-[var(--color-text-muted)] px-2 leading-4">s/d</span>
                      )}
                    </div>
                    <span className="text-[10px] tabular-nums text-[var(--color-text-muted)] w-[45px] text-right">
                      {c.official_yield_t_ha !== null ? `${c.official_yield_t_ha} t/ha` : 's/d'}
                    </span>
                  </div>
                </div>

                {/* Datos adicionales */}
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-[var(--color-text-muted)]">
                  <span>NDVI: {c.ndvi.toFixed(3)}</span>
                  <span>Lluvia dic–feb: {c.rain_dec_feb_mm !== null ? `${c.rain_dec_feb_mm} mm` : 's/d'}</span>
                  <span>Desvío oficial: {c.error_vs_official_pct !== null ? `${c.error_vs_official_pct}%` : 's/d'}</span>
                </div>
              </div>
            );
          })}
        </div>

        {/* Contraste oficial */}
        <div className="mt-4 p-3 bg-[var(--color-neutral-soft)] rounded border border-[var(--color-border)]">
          <div className="flex items-start gap-2">
            <AlertTriangle size={14} className="text-[var(--color-warning)] shrink-0 mt-0.5" />
            <div className="text-[12px] text-[var(--color-text-muted)]">
              <p className="font-semibold text-[var(--color-ink)]">Contraste oficial pendiente</p>
              <p className="mt-0.5">{data.contrast_official.note}</p>
            </div>
          </div>
        </div>

        {/* Caveat */}
        <div className="mt-3 p-3 bg-[var(--color-neutral-soft)] rounded border border-[var(--color-border)]">
          <div className="flex items-start gap-2">
            <Info size={14} className="text-[var(--color-text-muted)] shrink-0 mt-0.5" />
            <p className="text-[12px] text-[var(--color-text-muted)]">
              {data.generated_from.method.caveat}
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
