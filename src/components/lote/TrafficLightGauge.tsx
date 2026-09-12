'use client';

import React from 'react';

type Light = 'verde' | 'amarillo' | 'rojo';

interface TrafficLightGaugeProps {
  /** Condition index 0-100; null while loading. */
  value: number | null;
  size?: 'sm' | 'lg';
  className?: string;
}

const THRESHOLDS = { amarillo: 50, verde: 70 };

function lightFor(v: number): Light {
  if (v >= THRESHOLDS.verde) return 'verde';
  if (v >= THRESHOLDS.amarillo) return 'amarillo';
  return 'rojo';
}

const LABEL: Record<Light, string> = { verde: 'Verde · desembolsos habilitados', amarillo: 'Amarillo · en observación', rojo: 'Rojo · desembolsos bloqueados' };

/**
 * Semáforo como escala: la barra va de rojo a verde con los umbrales marcados y
 * el indicador se desliza al valor actual. Las tres luces se encienden según la banda.
 */
export function TrafficLightGauge({ value, size = 'lg', className = '' }: TrafficLightGaugeProps) {
  const v = value === null ? null : Math.max(0, Math.min(100, value));
  const light = v === null ? null : lightFor(v);
  const big = size === 'lg';
  const lamp = (l: Light) => {
    const on = light === l;
    const color = l === 'verde' ? '#22c55e' : l === 'amarillo' ? '#eab308' : '#dc2626';
    return (
      <span
        key={l}
        aria-hidden
        className="rounded-full border transition-all duration-500"
        style={{
          width: big ? 22 : 12,
          height: big ? 22 : 12,
          background: on ? color : 'var(--color-neutral-soft)',
          borderColor: on ? color : 'var(--color-border)',
          boxShadow: on ? `0 0 ${big ? 14 : 8}px ${color}` : 'none',
        }}
      />
    );
  };

  return (
    <div className={`flex flex-col gap-2 ${className}`} role="img" aria-label={v === null ? 'Semáforo sin datos' : `Índice ${v.toFixed(1)}: ${LABEL[light!]}`}>
      <div className="flex items-center gap-3">
        <div className={`flex items-center gap-1.5 rounded-[var(--radius-pill)] bg-[var(--color-ink)] ${big ? 'px-2.5 py-1.5' : 'px-1.5 py-1'}`}>
          {(['rojo', 'amarillo', 'verde'] as Light[]).map(lamp)}
        </div>
        {big && light && <span className="text-[13px] font-semibold text-[var(--color-ink)]">{LABEL[light]}</span>}
      </div>
      <div className={`relative ${big ? 'h-4' : 'h-2.5'} rounded-full overflow-visible`} style={{ background: 'linear-gradient(90deg, #dc2626 0%, #dc2626 50%, #eab308 50%, #eab308 70%, #22c55e 70%, #22c55e 100%)' }}>
        {[THRESHOLDS.amarillo, THRESHOLDS.verde].map((t) => (
          <span key={t} aria-hidden className="absolute top-0 bottom-0 w-px bg-white/80" style={{ left: `${t}%` }} />
        ))}
        {v !== null && (
          <span
            aria-hidden
            className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 rounded-full border-2 border-[var(--color-ink)] bg-white shadow transition-[left] duration-700 ease-out"
            style={{ left: `${v}%`, width: big ? 22 : 14, height: big ? 22 : 14 }}
          />
        )}
      </div>
      {big && (
        <div className="flex justify-between text-[11px] text-[var(--color-text-muted)] tabular-nums">
          <span>0 · rojo</span>
          <span>50 · amarillo</span>
          <span>70 · verde</span>
          <span>100</span>
        </div>
      )}
    </div>
  );
}
