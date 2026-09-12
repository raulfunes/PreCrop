'use client';

import React from 'react';
import { RefreshCw, AlertCircle, TrendingUp, BarChart3, Info, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { formatUSD } from '@/lib/scoreUtils';
import type { CapacityResponse, ApiError } from '@/types';
import type { Role } from './RoleActions';

interface CapacityScreenProps {
  data: CapacityResponse | null;
  isLoading: boolean;
  error: ApiError | null;
  onRetry: () => void;
  role: Role;
}

/**
 * La coop lee este modal para decidir cuanto autoriza; el productor, para entender
 * cuanto le pueden anticipar y por que. Mismos numeros, distinto sujeto.
 */
const TEXTOS: Record<Role, { titulo: string; pie: string; sinRespaldo: string }> = {
  coop: {
    titulo: 'Cupo pre-siembra sugerido',
    pie: 'Contra el peor año que el departamento realmente tuvo',
    sinRespaldo: 'Este lote no es estadísticamente representativo de su departamento. No se puede establecer un cupo seguro basado en la historia departamental oficial.',
  },
  productor: {
    titulo: 'Cupo que te pueden anticipar',
    pie: 'Calculado contra el peor año que tu departamento realmente tuvo',
    sinRespaldo: 'Tu lote no acompaña lo suficiente a la historia de su departamento, así que todavía no hay un cupo respaldado que la coop pueda ofrecerte.',
  },
};

export function CapacityScreen({ data, isLoading, error, onRetry, role }: CapacityScreenProps) {
  const t = TEXTOS[role];
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

  const { capacity, rejected_alternative, sources } = data;
  const { series, worst_year, representativeness, pre_sowing_limit, reference, district_volatility } = capacity;

  if (series.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-3 text-[var(--color-text-muted)]">
        <BarChart3 size={24} />
        <p className="text-[14px] font-medium">No hay campañas cargadas en el historial.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      {/* Resumen principal (Siempre visible) */}
      <section className="bg-[var(--color-surface)] rounded-[var(--radius-card)] border border-[var(--color-border)] shadow-[var(--shadow-card)] p-4 md:p-5">
        <h2 className="text-[12px] font-bold text-[var(--color-text-muted)] uppercase tracking-wide mb-3">
          {t.titulo}
        </h2>

        {representativeness.representative ? (
          <div className="mb-4">
            <div className="flex items-baseline gap-2 mb-1">
              <TrendingUp size={18} className="text-[var(--color-brand-primary)]" />
              <span className="text-[28px] lg:text-[32px] font-bold tabular-nums text-[var(--color-brand-primary)] leading-none">
                {pre_sowing_limit.usd !== null ? formatUSD(pre_sowing_limit.usd) : 'N/A'}
              </span>
            </div>
            {pre_sowing_limit.ars !== null && (
              <p className="text-[14px] font-semibold text-[var(--color-ink)] mb-1">
                ARGt {pre_sowing_limit.ars.toLocaleString('es-AR')}
              </p>
            )}
            <p className="text-[13px] text-[var(--color-text-muted)] mt-1">
              {t.pie}
            </p>
          </div>
        ) : (
          <div className="mb-4">
            <div className="p-3 bg-[var(--color-warning-soft)] border border-[var(--color-warning)]/30 rounded mb-3">
              <p className="text-[13px] font-bold text-[var(--color-warning)] mb-1">Sin respaldo suficiente</p>
              <p className="text-[12px] text-[var(--color-ink)] leading-snug">
                {t.sinRespaldo}
              </p>
              <ul className="list-disc pl-5 mt-2 text-[11px] text-[var(--color-text-muted)]">
                {representativeness.reasons.map((r, i) => <li key={i}>{r}</li>)}
              </ul>
            </div>
            {pre_sowing_limit.usd_if_representative !== null && (
              <div className="opacity-60">
                <p className="text-[10px] font-bold uppercase mb-0.5">Valor hipotético, no publicable</p>
                <div className="text-[18px] font-bold tabular-nums text-[var(--color-text-muted)]">
                  {formatUSD(pre_sowing_limit.usd_if_representative)}
                </div>
              </div>
            )}
          </div>
        )}

        {worst_year && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-[12px] mb-4">
            <div className="bg-[var(--color-neutral-soft)] p-2 rounded border border-[var(--color-border)]">
              <span className="text-[var(--color-text-muted)] block text-[10px] uppercase">Peor oficial</span>
              <p className="font-bold text-[var(--color-ink)] mt-0.5">{worst_year.campana}</p>
            </div>
            <div className="bg-[var(--color-neutral-soft)] p-2 rounded border border-[var(--color-border)]">
              <span className="text-[var(--color-text-muted)] block text-[10px] uppercase">Rinde oficial</span>
              <p className="font-bold text-[var(--color-ink)] mt-0.5">
                {worst_year.official_dpto_kg_ha.toLocaleString('es-AR')} kg/ha
              </p>
            </div>
            <div className="bg-[var(--color-neutral-soft)] p-2 rounded border border-[var(--color-border)]">
              <span className="text-[var(--color-text-muted)] block text-[10px] uppercase">Equivalencia</span>
              <p className="font-bold text-[var(--color-ink)] mt-0.5">{worst_year.yield_t_ha} t/ha</p>
            </div>
            <div className="bg-[var(--color-neutral-soft)] p-2 rounded border border-[var(--color-border)]">
              <span className="text-[var(--color-text-muted)] block text-[10px] uppercase">Volatilidad Dist.</span>
              <p className="font-bold text-[var(--color-ink)] mt-0.5 capitalize">
                {district_volatility.cv !== null ? `${(district_volatility.cv * 100).toFixed(1)} %` : 's/d'}
              </p>
            </div>
          </div>
        )}

        <div className="flex flex-wrap gap-x-4 gap-y-2 text-[11px] p-2.5 bg-[var(--color-canvas)] border border-[var(--color-border)] rounded mb-3">
          <div><span className="text-[var(--color-text-muted)]">Regla:</span> <span className="font-mono font-medium">{capacity.rule_version}</span></div>
          <div><span className="text-[var(--color-text-muted)]">Precio:</span> <span className="font-medium">{formatUSD(reference.price_usd_t)}/t</span></div>
          <div><span className="text-[var(--color-text-muted)]">Haircut:</span> <span className="font-medium">{reference.haircut}</span></div>
          <div><span className="text-[var(--color-text-muted)]">Sup:</span> <span className="font-medium">{reference.ha} ha</span></div>
        </div>

        <div className="flex items-start gap-2 p-2.5 bg-[var(--color-neutral-soft)] rounded-[var(--radius-badge)]">
          <Info size={14} className="text-[var(--color-text-muted)] shrink-0 mt-0.5" />
          <div className="text-[11px] text-[var(--color-text-muted)] leading-relaxed">
            <strong className="text-[var(--color-ink)]">Fórmula:</strong> {pre_sowing_limit.formula}<br/>
            <strong className="text-[var(--color-ink)]">Base:</strong> {pre_sowing_limit.basis}
          </div>
        </div>
      </section>

      {/* Alternativa Rechazada (Plegable) */}
      <details className="group bg-[var(--color-surface)] border border-[var(--color-border)] rounded-[var(--radius-card)] shadow-[var(--shadow-card)] overflow-hidden focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-brand-primary)]">
        <summary className="flex items-center justify-between p-4 cursor-pointer hover:bg-[var(--color-neutral-soft)] font-bold text-[12px] text-[var(--color-text-muted)] uppercase tracking-wide focus:outline-none">
          ¿Por qué no usamos rinde desde NDVI?
          <span className="transition group-open:rotate-180 text-[var(--color-brand-primary)]">▼</span>
        </summary>

        <div className="p-4 pt-0 border-t border-[var(--color-border)]">
          <div className="bg-[var(--color-danger-soft)] border border-[var(--color-danger)]/20 rounded p-3 mt-4">
            <div className="flex items-start gap-2">
              <AlertCircle size={16} className="text-[var(--color-danger)] shrink-0 mt-0.5" />
              <div className="flex-1 space-y-2 text-[12px] text-[var(--color-ink)]">
                <p>
                  El enfoque directo por NDVI (<span className="font-mono">{rejected_alternative.rule_version}</span>) fue descartado.
                </p>

                <div className="bg-[var(--color-surface)]/60 p-2 rounded border border-[var(--color-danger)]/10 text-[11px]">
                  <p className="font-bold text-[var(--color-danger)] mb-0.5 uppercase tracking-wider text-[9px]">
                    ALTERNATIVA DESCARTADA
                  </p>
                  <p className="text-[16px] font-bold text-[var(--color-text-muted)] line-through decoration-[var(--color-danger)]">
                    {formatUSD(rejected_alternative.usd_it_would_have_published)}
                  </p>
                  <p className="mt-1 text-[var(--color-text-muted)]">
                    Error medio frente a oficial: {rejected_alternative.contrast_official.mean_abs_error_pct !== null ? `${rejected_alternative.contrast_official.mean_abs_error_pct}%` : 's/d'}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </details>

      {/* Fuentes y Disclaimer (Plegable) */}
      <details className="group bg-[var(--color-neutral-soft)] border border-[var(--color-border)] rounded-[var(--radius-card)] overflow-hidden focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-brand-primary)]">
        <summary className="flex items-center justify-between p-3 cursor-pointer hover:bg-black/5 font-semibold text-[11px] text-[var(--color-text-muted)] uppercase tracking-wide focus:outline-none">
          Fuentes y exenciones de responsabilidad
          <span className="transition group-open:rotate-180 text-[var(--color-brand-primary)]">▼</span>
        </summary>
        
        <div className="p-4 pt-2 border-t border-[var(--color-border)] text-[11px] text-[var(--color-text-muted)] space-y-3">
          <div>
            <strong className="text-[var(--color-ink)] block mb-1">Fuentes Oficiales</strong>
            {sources.official.refs.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {sources.official.refs.map((refUrl, i) => (
                  <a key={i} href={refUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-[var(--color-brand-primary)] hover:underline">
                    Ver dataset <ExternalLink size={10} />
                  </a>
                ))}
              </div>
            )}
            <p className="mt-1">Licencia: {sources.official.license} | Generado: {new Date(sources.official.generated_at_utc).toLocaleString()}</p>
          </div>

          <div className="pt-2 border-t border-[var(--color-border)]">
            <strong className="text-[var(--color-ink)] block mb-1">Historia Satelital</strong>
            {sources.history.refs.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {sources.history.refs.map((refUrl, i) => (
                  <a key={i} href={refUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-[var(--color-brand-primary)] hover:underline">
                    Ver archivo <ExternalLink size={10} />
                  </a>
                ))}
              </div>
            )}
            <p className="mt-1">Generado: {new Date(sources.history.generated_at_utc).toLocaleString()}</p>
          </div>

          <div className="pt-2 border-t border-[var(--color-border)] italic leading-relaxed">
            <p>{data.disclaimer}</p>
          </div>
        </div>
      </details>
    </div>
  );
}
