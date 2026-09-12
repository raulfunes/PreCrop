'use client';

import React, { useState } from 'react';
import { RefreshCw, AlertCircle, TrendingUp, BarChart3, Info, ChevronDown, ChevronUp, ExternalLink } from 'lucide-react';
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
  const [showRejected, setShowRejected] = useState(false);

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

  const { capacity, rejected_alternative, sources, generated_from } = data;
  const { series, worst_year, representativeness, pre_sowing_limit, reference, district_volatility } = capacity;

  if (series.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-3 text-[var(--color-text-muted)]">
        <BarChart3 size={24} />
        <p className="text-[14px] font-medium">No hay campañas cargadas en el historial.</p>
      </div>
    );
  }

  const maxYield = Math.max(...series.map(c => c.official_dpto_kg_ha || 0));

  return (
    <div className="flex flex-col gap-6">
      {/* Cupo pre-siembra */}
      <section className="bg-[var(--color-surface)] rounded-[var(--radius-card)] border border-[var(--color-border)] shadow-[var(--shadow-card)] p-5 md:p-6">
        <h2 className="text-[13px] font-semibold text-[var(--color-text-muted)] uppercase tracking-wide mb-4">
          Cupo pre-siembra sugerido
        </h2>

        {representativeness.representative ? (
          <>
            <div className="flex items-baseline gap-2 mb-2">
              <TrendingUp size={18} className="text-[var(--color-brand-primary)]" />
              <span className="text-[32px] font-bold tabular-nums text-[var(--color-brand-primary)]">
                {pre_sowing_limit.usd !== null ? formatUSD(pre_sowing_limit.usd) : 'N/A'}
              </span>
            </div>
            {pre_sowing_limit.ars !== null && (
              <p className="text-[15px] font-semibold text-[var(--color-ink)] mb-1">
                ARGt {pre_sowing_limit.ars.toLocaleString('es-AR')}
              </p>
            )}
            <p className="text-[14px] font-medium text-[var(--color-ink)] mb-3">
              Contra el peor año que el departamento realmente tuvo
            </p>
          </>
        ) : (
          <div className="mb-4">
            <div className="p-3 bg-[var(--color-warning-soft)] border border-[var(--color-warning)]/30 rounded mb-3">
              <p className="text-[14px] font-bold text-[var(--color-warning)] mb-1">Sin respaldo suficiente</p>
              <p className="text-[13px] text-[var(--color-ink)]">
                Este lote no es estadísticamente representativo de su departamento. No se puede establecer un cupo seguro basado en la historia departamental oficial.
              </p>
              <ul className="list-disc pl-5 mt-2 text-[12px] text-[var(--color-text-muted)]">
                {representativeness.reasons.map((r, i) => <li key={i}>{r}</li>)}
              </ul>
            </div>
            {pre_sowing_limit.usd_if_representative !== null && (
              <div className="opacity-60">
                <p className="text-[11px] font-bold uppercase mb-1">Valor hipotético, no publicable</p>
                <div className="text-[20px] font-bold tabular-nums text-[var(--color-text-muted)]">
                  {formatUSD(pre_sowing_limit.usd_if_representative)}
                </div>
              </div>
            )}
          </div>
        )}

        {worst_year && (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 text-[13px] mb-4">
            <div className="bg-[var(--color-neutral-soft)] p-3 rounded border border-[var(--color-border)]">
              <span className="text-[var(--color-text-muted)]">Peor campaña oficial</span>
              <p className="font-bold text-[var(--color-ink)] mt-0.5">{worst_year.campana}</p>
            </div>
            <div className="bg-[var(--color-neutral-soft)] p-3 rounded border border-[var(--color-border)]">
              <span className="text-[var(--color-text-muted)]">Rinde dpto oficial</span>
              <p className="font-bold text-[var(--color-ink)] mt-0.5">
                {worst_year.official_dpto_kg_ha.toLocaleString('es-AR')} kg/ha
                <span className="block font-normal text-[10px] text-[var(--color-text-muted)] mt-0.5">Medido</span>
              </p>
            </div>
            <div className="bg-[var(--color-neutral-soft)] p-3 rounded border border-[var(--color-border)]">
              <span className="text-[var(--color-text-muted)]">Equivalencia productiva</span>
              <p className="font-bold text-[var(--color-ink)] mt-0.5">{worst_year.yield_t_ha} t/ha</p>
            </div>
            <div className="bg-[var(--color-neutral-soft)] p-3 rounded border border-[var(--color-border)]">
              <span className="text-[var(--color-text-muted)]">Volatilidad Distrital</span>
              <p className="font-bold text-[var(--color-ink)] mt-0.5 capitalize">
                {district_volatility.cv !== null ? `${(district_volatility.cv * 100).toFixed(2)} %` : 's/d'}
              </p>
            </div>
          </div>
        )}

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-[12px] p-3 bg-white border border-[var(--color-border)] rounded mb-4">
          <div><span className="text-[var(--color-text-muted)]">Regla:</span> <span className="font-mono">{capacity.rule_version}</span></div>
          <div><span className="text-[var(--color-text-muted)]">Precio ref:</span> {formatUSD(reference.price_usd_t)}/t</div>
          <div><span className="text-[var(--color-text-muted)]">Haircut:</span> {reference.haircut}</div>
          <div><span className="text-[var(--color-text-muted)]">Superficie:</span> {reference.ha} ha</div>
        </div>

        <div className="flex flex-col gap-2 p-3 bg-[var(--color-neutral-soft)] rounded-[var(--radius-badge)]">
          <div className="flex items-start gap-2">
            <Info size={14} className="text-[var(--color-text-muted)] shrink-0 mt-0.5" />
            <div className="text-[11px] text-[var(--color-text-muted)] leading-[17px]">
              <strong className="text-[var(--color-ink)]">Fórmula:</strong> {pre_sowing_limit.formula}<br/>
              <strong className="text-[var(--color-ink)]">Base:</strong> {pre_sowing_limit.basis}
            </div>
          </div>
        </div>
      </section>

      {/* Historial de campañas */}
      <section className="bg-[var(--color-surface)] rounded-[var(--radius-card)] border border-[var(--color-border)] shadow-[var(--shadow-card)] p-5 md:p-6">
        <h2 className="text-[13px] font-semibold text-[var(--color-text-muted)] uppercase tracking-wide mb-4">
          Serie oficial y respuesta satelital ({series.length} campañas)
        </h2>

        <div className="flex flex-col gap-3" role="list" aria-label="Historial de campañas">
          {series.map((c) => {
            const isWorst = c.campana === worst_year?.campana;
            const barWidth = c.official_dpto_kg_ha !== null && maxYield > 0
              ? (c.official_dpto_kg_ha / maxYield) * 100 : 0;

            return (
              <div
                key={c.campana}
                role="listitem"
                className={`p-3 rounded border ${isWorst ? 'border-[var(--color-danger)]/40 bg-[var(--color-danger-soft)]' : 'border-[var(--color-border)] bg-[var(--color-neutral-soft)]'}`}
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className={`text-[14px] font-bold ${isWorst ? 'text-[var(--color-danger)]' : 'text-[var(--color-ink)]'}`}>
                      {c.campana}
                    </span>
                    {isWorst && (
                      <span className="text-[10px] font-semibold text-white bg-[var(--color-danger)] px-1.5 py-0.5 rounded">PEOR OFICIAL</span>
                    )}
                    {c.status === 'unpaired' && (
                      <span className="text-[10px] font-semibold text-[var(--color-text-muted)] bg-[var(--color-neutral)] border border-[var(--color-border)] px-1.5 py-0.5 rounded">NO PAREADA</span>
                    )}
                  </div>
                  <span className="text-[13px] font-bold tabular-nums text-[var(--color-ink)]">
                    {c.official_dpto_kg_ha !== null ? `${c.official_dpto_kg_ha.toLocaleString('es-AR')} kg/ha` : 's/d'}
                  </span>
                </div>

                <div className="flex items-center gap-2 mb-3">
                  <span className="text-[10px] text-[var(--color-text-muted)] w-[50px] shrink-0">Dpto</span>
                  <div className="flex-1 bg-white rounded-full h-4 overflow-hidden border border-[var(--color-border)]/50">
                    {c.official_dpto_kg_ha !== null && (
                      <div
                        className={`h-full rounded-full transition-all ${isWorst ? 'bg-[var(--color-danger)]' : 'bg-[var(--color-brand-primary)]'}`}
                        style={{ width: `${barWidth}%` }}
                        role="meter"
                        aria-valuenow={c.official_dpto_kg_ha}
                        aria-valuemin={0}
                        aria-valuemax={maxYield}
                        aria-label={`Rinde dpto: ${c.official_dpto_kg_ha} kg/ha`}
                      />
                    )}
                  </div>
                </div>

                <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-[var(--color-text-muted)]">
                  <span>Pico NDVI lote: {c.ndvi_peak !== null ? c.ndvi_peak.toFixed(3) : 's/d'}</span>
                  <span>Índice NDVI lote: {c.ndvi_index !== null ? c.ndvi_index.toFixed(3) : 's/d'}</span>
                  <span>Índice rinde dpto: {c.official_index !== null ? c.official_index.toFixed(3) : 's/d'}</span>
                  {c.lote_vs_district !== null ? (
                    <span>Relación lote/dpto: {c.lote_vs_district.toFixed(4)}× · {(c.lote_vs_district - 1) > 0 ? '+' : ''}{((c.lote_vs_district - 1) * 100).toFixed(2)} %</span>
                  ) : (
                    <span>Relación lote/dpto: s/d</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        <div className="mt-4 p-3 bg-[var(--color-neutral-soft)] rounded border border-[var(--color-border)]">
          <div className="flex items-start gap-2">
            <Info size={14} className="text-[var(--color-text-muted)] shrink-0 mt-0.5" />
            <div className="text-[12px] text-[var(--color-text-muted)] space-y-2">
              <p><strong className="text-[var(--color-ink)]">Representatividad estadística:</strong> {representativeness.basis} {representativeness.note}</p>
              <p>Campañas pareadas: {representativeness.paired_campaigns}. Relación mediana lote/departamento: {representativeness.lote_vs_district_median !== null ? `${representativeness.lote_vs_district_median.toFixed(4)}×` : 's/d'}. Desvío mediano respecto del departamento: {representativeness.lote_vs_district_median !== null ? `${(representativeness.lote_vs_district_median - 1) > 0 ? '+' : ''}${((representativeness.lote_vs_district_median - 1) * 100).toFixed(2)} %` : 's/d'}. CV de los desvíos: {representativeness.lote_vs_district_cv !== null ? `${(representativeness.lote_vs_district_cv * 100).toFixed(2)} %` : 's/d'}.</p>
              <p>Banda aceptada: {representativeness.band.min.toFixed(2)}×–{representativeness.band.max.toFixed(2)}×. Equivale a un desvío de {((representativeness.band.min - 1) * 100).toFixed(0)} % a {((representativeness.band.max - 1) * 100) > 0 ? '+' : ''}{((representativeness.band.max - 1) * 100).toFixed(0)} %.</p>
            </div>
          </div>
        </div>
      </section>

      {/* Alternativa Rechazada (plegable) */}
      <section className="bg-[var(--color-surface)] rounded-[var(--radius-card)] border border-[var(--color-border)] shadow-[var(--shadow-card)] overflow-hidden">
        <button
          onClick={() => setShowRejected(!showRejected)}
          className="w-full p-4 flex items-center justify-between hover:bg-[var(--color-neutral-soft)] transition-colors focus:outline-none"
        >
          <div className="flex items-center gap-2">
            <span className="text-[13px] font-semibold text-[var(--color-text-muted)]">
              ¿Por qué no calculamos el rinde directamente desde NDVI?
            </span>
          </div>
          {showRejected ? <ChevronUp size={16} className="text-[var(--color-text-muted)]" /> : <ChevronDown size={16} className="text-[var(--color-text-muted)]" />}
        </button>

        {showRejected && (
          <div className="p-4 pt-0 border-t border-[var(--color-border)]">
            <div className="bg-[var(--color-danger-soft)] border border-[var(--color-danger)]/20 rounded p-4 mt-4">
              <div className="flex items-start gap-3">
                <AlertCircle size={20} className="text-[var(--color-danger)] shrink-0 mt-0.5" />
                <div className="flex-1 space-y-3 text-[13px] text-[var(--color-ink)]">
                  <p>
                    El enfoque que estimaba el rinde directamente desde el pico de NDVI (<span className="font-mono">{rejected_alternative.rule_version}</span>) fue descartado al contrastarlo con la serie oficial departamental.
                  </p>

                  <div className="bg-white/60 p-3 rounded border border-[var(--color-danger)]/10 text-[12px]">
                    <p className="font-bold text-[var(--color-danger)] mb-1 uppercase tracking-wider text-[10px]">
                      NO VIGENTE · ALTERNATIVA DESCARTADA
                    </p>
                    <p className="text-[20px] font-bold text-[var(--color-text-muted)] line-through decoration-[var(--color-danger)]">
                      {formatUSD(rejected_alternative.usd_it_would_have_published)}
                    </p>
                    <div className="mt-2 text-[var(--color-text-muted)] space-y-1">
                      <p>Peor campaña erróneamente estimada: {rejected_alternative.worst_campaign.campaign} ({rejected_alternative.worst_campaign.yield_est_t_ha} t/ha)</p>
                      <p>Error medio frente a oficial: {rejected_alternative.contrast_official.mean_abs_error_pct !== null ? `${rejected_alternative.contrast_official.mean_abs_error_pct}%` : 's/d'}</p>
                    </div>
                  </div>

                  <p className="text-[12px] text-[var(--color-text-muted)] italic">
                    {rejected_alternative.note}
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}
      </section>

      {/* Fuentes y Disclaimer */}
      <section className="bg-[var(--color-neutral-soft)] rounded-[var(--radius-card)] p-4 border border-[var(--color-border)] text-[11px] text-[var(--color-text-muted)] space-y-3">
        <div>
          <strong className="text-[var(--color-ink)]">Fuentes Oficiales</strong>
          {sources.official.refs.length > 0 && (
            <div className="mt-1 flex flex-wrap gap-2">
              {sources.official.refs.map((refUrl, i) => (
                <a key={i} href={refUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-[var(--color-brand-primary)] hover:underline">
                  Ver dataset oficial <ExternalLink size={10} />
                </a>
              ))}
            </div>
          )}
          <p className="mt-1">Licencia: {sources.official.license}</p>
          <p>Generado: {new Date(sources.official.generated_at_utc).toLocaleString()}</p>
        </div>

        <div>
          <strong className="text-[var(--color-ink)]">Historia Satelital (NDVI)</strong>
          {sources.history.refs.length > 0 && (
            <div className="mt-1 flex flex-wrap gap-2">
              {sources.history.refs.map((refUrl, i) => (
                <a key={i} href={refUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-[var(--color-brand-primary)] hover:underline">
                  Ver archivo satelital <ExternalLink size={10} />
                </a>
              ))}
            </div>
          )}
          <p className="mt-1">Generado: {new Date(sources.history.generated_at_utc).toLocaleString()}</p>
          <p>{generated_from.method.caveat}</p>
        </div>

        <div className="pt-2 border-t border-[var(--color-border)]">
          <p>{data.disclaimer}</p>
        </div>
      </section>
    </div>
  );
}
