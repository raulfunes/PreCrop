'use client';

import React from 'react';
import { ArrowRight, AlertCircle, CheckCircle2, RotateCcw, ShieldAlert } from 'lucide-react';
import type { EstadoDemo, AccionDemo } from '@/types';
import { formatUSD, calcularRepago, getLabelEstado } from '@/lib/scoreUtils';
import { DEMO } from '@/data/fixtures';
import { Button } from '@/components/ui/Button';

interface AccionDesembolsoProps {
  estado: EstadoDemo;
  /** Despacha una acción a demoReducer. */
  onAccion: (tipo: AccionDemo['tipo']) => void;
}

/**
 * Panel de acción del recorrido demo interactivo.
 * Ofrece exactamente una acción principal por etapa y la posibilidad
 * de reiniciar la demo de forma segura.
 */
export function AccionDesembolso({ estado, onAccion }: AccionDesembolsoProps) {
  const { paso, condicion, finanzas, rechazo } = estado;

  return (
    <div className="flex flex-col gap-4" aria-live="polite" aria-atomic="true">
      {/* ── Paso 1: lote_evaluado ────────────────────────────────── */}
      {paso === 'lote_evaluado' && (
        <div className="flex flex-col gap-4">
          <p className="text-[14px] text-[var(--color-text-muted)] leading-5">
            Aportá fondos al lote para habilitar desembolsos.
          </p>
          <Button
            variante="primario"
            tamanio="lg"
            onClick={() => onAccion('APORTAR_FONDOS')}
            iconoDerecha={<ArrowRight size={18} />}
            className="w-full"
          >
            Simular aporte de {formatUSD(DEMO.APORTE_USD)}
          </Button>
        </div>
      )}

      {/* ── Paso 2: fondos_aportados ─────────────────────────────── */}
      {paso === 'fondos_aportados' && (
        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-2 p-3 bg-[var(--color-brand-soft)] rounded-[var(--radius-badge)]">
            <CheckCircle2 size={16} className="text-[var(--color-positive)] shrink-0" aria-hidden="true" />
            <span className="text-[13px] text-[var(--color-positive)] font-medium">
              Aporte registrado: {formatUSD(finanzas.fondosAportados)} disponibles.
            </span>
          </div>
          <p className="text-[14px] text-[var(--color-text-muted)] leading-5">
            El lote tiene {getLabelEstado(condicion.estado).toLowerCase()} (Score {condicion.score}/100). Podés simular el primer desembolso.
          </p>
          <Button
            variante="primario"
            tamanio="lg"
            onClick={() => onAccion('REALIZAR_DESEMBOLSO')}
            iconoDerecha={<ArrowRight size={18} />}
            className="w-full"
          >
            Simular desembolso de {formatUSD(DEMO.PRIMER_DESEMBOLSO_USD)}
          </Button>
        </div>
      )}

      {/* ── Paso 3: primer_desembolso ────────────────────────────── */}
      {paso === 'primer_desembolso' && (
        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-2 p-3 bg-[var(--color-brand-soft)] rounded-[var(--radius-badge)]">
            <CheckCircle2 size={16} className="text-[var(--color-positive)] shrink-0" aria-hidden="true" />
            <span className="text-[13px] text-[var(--color-positive)] font-medium">
              Desembolso registrado: {formatUSD(finanzas.capitalDesembolsado)} entregados.
              Quedan {formatUSD(finanzas.fondosDisponibles)} disponibles.
            </span>
          </div>
          <p className="text-[14px] text-[var(--color-text-muted)] leading-5">
            Siguiente paso: simulá un cambio de condición agronómica desfavorable por déficit hídrico.
          </p>
          <Button
            variante="secundario"
            tamanio="lg"
            onClick={() => onAccion('ACTUALIZAR_CONDICION')}
            iconoDerecha={<ArrowRight size={18} />}
            className="w-full"
          >
            Simular cambio de condición
          </Button>
        </div>
      )}

      {/* ── Paso 4: condicion_actualizada ───────────────────────── */}
      {paso === 'condicion_actualizada' && (
        <div className="flex flex-col gap-4">
          <div className="flex items-start gap-2 p-3 bg-[var(--color-danger-soft)] rounded-[var(--radius-badge)] border border-[var(--color-danger)]/20">
            <AlertCircle size={16} className="text-[var(--color-danger)] shrink-0 mt-0.5" aria-hidden="true" />
            <div>
              <p className="text-[13px] text-[var(--color-danger)] font-semibold">
                Condición desfavorable · Score {condicion.score}/100 (Rojo)
              </p>
              <p className="text-[12px] text-[var(--color-danger)] mt-0.5 leading-4">
                El score cayó de {condicion.scoreAnterior} a {condicion.score} puntos. Intentá realizar un segundo desembolso para verificar la regla de bloqueo.
              </p>
            </div>
          </div>
          <p className="text-[14px] text-[var(--color-text-muted)] leading-5">
            Intentá solicitar un nuevo desembolso en estado desfavorable.
          </p>
          <Button
            variante="primario"
            tamanio="lg"
            onClick={() => onAccion('INTENTAR_SEGUNDO_DESEMBOLSO')}
            iconoDerecha={<ArrowRight size={18} />}
            className="w-full"
          >
            Intentar segundo desembolso
          </Button>
        </div>
      )}

      {/* ── Paso 5: segundo_desembolso_rechazado ─────────────────── */}
      {paso === 'segundo_desembolso_rechazado' && (
        <div className="flex flex-col gap-4">
          <div className="flex items-start gap-2.5 p-4 bg-[var(--color-danger-soft)] rounded-[var(--radius-card)] border border-[var(--color-danger)]/30">
            <ShieldAlert size={20} className="text-[var(--color-danger)] shrink-0 mt-0.5" aria-hidden="true" />
            <div className="flex flex-col gap-1.5">
              <span className="text-[10px] font-bold tracking-wider uppercase text-[var(--color-danger)] bg-white/70 px-2 py-0.5 rounded-[var(--radius-pill)] w-fit">
                Regla de riesgo aplicada
              </span>
              <p className="text-[13px] font-semibold text-[var(--color-danger)] leading-5">
                {rechazo ?? `Nuevos desembolsos bloqueados. El score bajó a ${condicion.score}/100 y la regla de la demo bloquea nuevos desembolsos por debajo de 50.`}
              </p>
              <p className="text-[12px] text-[var(--color-text-muted)] leading-4 pt-1 border-t border-[var(--color-danger)]/15">
                ℹ️ El capital ya desembolsado ({formatUSD(finanzas.capitalDesembolsado)}) mantiene sus condiciones originales ({finanzas.tasaCampana * 100} % por campaña).
              </p>
            </div>
          </div>
          <p className="text-[14px] text-[var(--color-text-muted)] leading-5">
            Procedé a simular la liquidación y repago al cierre de campaña.
          </p>
          <Button
            variante="secundario"
            tamanio="lg"
            onClick={() => onAccion('COMPLETAR_REPAGO')}
            iconoDerecha={<ArrowRight size={18} />}
            className="w-full"
          >
            Simular repago y distribución
          </Button>
        </div>
      )}

      {/* ── Paso 6: repago_completado ────────────────────────────── */}
      {paso === 'repago_completado' && (
        (() => {
          const repagoObj = calcularRepago(
            finanzas.capitalDesembolsado,
            finanzas.tasaCampana,
            finanzas.fondosDisponibles
          );
          return (
            <div className="flex flex-col gap-3">
              <div className="flex items-center gap-2 p-3 bg-[var(--color-brand-soft)] rounded-[var(--radius-badge)]">
                <CheckCircle2 size={16} className="text-[var(--color-positive)] shrink-0" aria-hidden="true" />
                <span className="text-[13px] text-[var(--color-positive)] font-semibold">
                  Repago y distribución
                </span>
              </div>
              <div className="flex flex-col gap-2.5 p-4 bg-[var(--color-neutral-soft)] rounded-[var(--radius-card)] border border-[var(--color-border)]">
                <div className="flex justify-between items-center text-[13px]">
                  <span className="text-[var(--color-text-muted)] font-medium">
                    Repago (Capital {formatUSD(finanzas.capitalDesembolsado)} + {finanzas.tasaCampana * 100} % interés)
                  </span>
                  <span className="font-bold tabular-nums text-[var(--color-ink)]">
                    {formatUSD(repagoObj.repago)}
                  </span>
                </div>
                <div className="flex justify-between items-center text-[13px]">
                  <span className="text-[var(--color-text-muted)] font-medium">Fondos no utilizados devueltos</span>
                  <span className="font-bold tabular-nums text-[var(--color-ink)]">
                    {formatUSD(repagoObj.fondosNoUsados)}
                  </span>
                </div>
                <div className="border-t border-[var(--color-border)] pt-2.5 mt-1 flex justify-between items-center">
                  <span className="text-[14px] font-bold text-[var(--color-ink)]">
                    Total final a distribuir
                  </span>
                  <span className="text-[18px] font-extrabold tabular-nums text-[var(--color-brand-primary)]">
                    {formatUSD(repagoObj.totalADistribuir)}
                  </span>
                </div>
              </div>
            </div>
          );
        })()
      )}

      {/* ── Botón Secundario: Reiniciar demo ────────────────────────── */}
      {paso !== 'lote_evaluado' && (
        <div className="pt-2 border-t border-[var(--color-border)]">
          <Button
            variante="terciario"
            tamanio="md"
            onClick={() => onAccion('REINICIAR_DEMO')}
            iconoIzquierda={<RotateCcw size={15} />}
            className="w-full text-[var(--color-text-muted)] hover:text-[var(--color-ink)]"
          >
            Reiniciar demo
          </Button>
        </div>
      )}
    </div>
  );
}
