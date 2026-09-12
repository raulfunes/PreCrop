// ============================================================
// PreCrop · Funciones puras — sin efectos secundarios
// Testeables de forma aislada; no importan estado de React.
// ============================================================

import type { EstadoLote, FinanzasDemo, ResultadoRepago, VisionPointState } from '@/types';
import lotePresets from '../../data/lote-sentinel-presets.json';
import photoPresets from '../../data/photo-point-presets.json';

// ── Mediana centralizada ──────────────────────────────────────
export function calcularMedianaMalezas(results: Record<string, VisionPointState>, scenario: string): number {
  const validPct = Object.values(results)
    .filter(r => r.status === 'completed' && r.result?.status === 'assessed')
    .map(r => r.result?.status === 'assessed' ? r.result.weedsPct : -1)
    .filter(w => Number.isFinite(w) && w >= 0 && w <= 100);

  if (validPct.length < 3) {
    const photoPresetsTyped = photoPresets as unknown as { scenarios?: Record<string, { weeds_pct_lote: number }> };
    const preset = photoPresetsTyped.scenarios?.[scenario];
    if (!preset) {
      throw new Error(`Escenario inválido o sin datos: ${scenario}`);
    }
    return preset.weeds_pct_lote;
  }
  validPct.sort((a, b) => a - b);
  const mid = Math.floor(validPct.length / 2);
  return validPct.length % 2 !== 0 ? validPct[mid] : (validPct[mid - 1] + validPct[mid]) / 2;
}

// ── Clasificación del score ───────────────────────────────────
/**
 * Clasifica el score de condición del cultivo en un estado semáforo.
 *
 * IMPORTANTE: el score representa la condición agronómica del cultivo.
 * No es un score crediticio ni una probabilidad de cobro.
 * La baja del score no borra la deuda ya desembolsada.
 *
 * Reglas:
 *   Verde    (favorable)       score >= 70
 *   Amarillo (en observación)  50 <= score < 70
 *   Rojo     (desfavorable)    score < 50  → bloquea nuevos desembolsos
 *   sin-datos                  score < 0   → también bloquea
 */
export function clasificarScore(score: number): EstadoLote {
  if (score < 0) return 'sin-datos';
  if (score >= 70) return 'verde';
  if (score >= 50) return 'amarillo';
  return 'rojo';
}

export function getClimateScore(rain_mm_7d: number): number {
  const rules = lotePresets.climate_table.rules;
  for (const rule of rules) {
    if (rule.max_mm === null || rain_mm_7d < rule.max_mm) {
      return rule.climate;
    }
  }
  return 60; // fallback just in case
}

export function getNdviNorm(ndvi: number): number {
  const norm = (ndvi - 0.20) / (0.85 - 0.20) * 100;
  return Math.min(Math.max(norm, 0), 100);
}

export function calcularScoreAgronomico(ndvi: number, rain_mm_7d: number, weeds_pct: number): number {
  const ndvi_norm = getNdviNorm(ndvi);
  const climate = getClimateScore(rain_mm_7d);
  return 0.60 * ndvi_norm + 0.25 * climate - 0.15 * weeds_pct;
}

/** Alias de compatibilidad con componentes anteriores. */
export const getEstado = clasificarScore;

// ── Etiquetas de estado (microcopy del branding §4) ──────────
export function getLabelEstado(estado: EstadoLote): string {
  const labels: Record<EstadoLote, string> = {
    verde:        'Condición favorable',
    amarillo:     'Condición en observación',
    rojo:         'Condición desfavorable',
    'sin-datos':  'Sin datos vigentes',
  };
  return labels[estado];
}

// ── Cupo simulado ─────────────────────────────────────────────
/**
 * Cálculo del cupo simulado:
 *   cosechaEstimadaBase × (score / 100) × 0,7
 *
 * La base debe estar en USD para obtener un cupo en USD.
 * El resultado se redondea al entero más cercano.
 *
 * IMPORTANTE: un cupo teórico positivo NO habilita desembolsos
 * cuando el estado es rojo o sin-datos.
 *
 * @example
 *   calcularCupoSimulado(100_000, 82) → 57_400
 *   calcularCupoSimulado(100_000, 48) → 33_600
 */
export function calcularCupoSimulado(
  cosechaEstimadaBase: number,
  score: number,
): number {
  return cosechaEstimadaBase * (score / 100) * 0.7; // Internal precision kept exact
}

// ── Habilitación de desembolso ────────────────────────────────
/**
 * Determina si un nuevo desembolso está habilitado.
 *
 * El rojo bloquea siempre, independientemente del cupo disponible.
 * sin-datos bloquea hasta que los datos sean actualizados.
 * Verde y amarillo habilitan si hay fondos disponibles y cupo remanente.
 */
export function puedeDesembolsar(
  estado: EstadoLote,
  finanzas: FinanzasDemo,
): boolean {
  if (estado === 'rojo' || estado === 'sin-datos') return false;
  return (
    finanzas.fondosDisponibles > 0 &&
    finanzas.capitalDesembolsado < finanzas.cupoSimulado
  );
}

/**
 * Devuelve el motivo del bloqueo de desembolso, o null si está habilitado.
 * El score actual se incluye en el mensaje para mayor claridad.
 */
export function getMotivoBloqueo(
  estado: EstadoLote,
  finanzas: FinanzasDemo,
  scoreActual?: number,
): string | null {
  if (estado === 'rojo') {
    const ref = scoreActual !== undefined ? `${scoreActual}/100` : 'por debajo de 50';
    return `El score bajó a ${ref}. La regla de la demo bloquea nuevos desembolsos por debajo de 50.`;
  }
  if (estado === 'sin-datos') {
    return 'Desembolsos pendientes de actualización de datos.';
  }
  if (finanzas.fondosDisponibles <= 0) {
    return 'No hay fondos disponibles para desembolsar.';
  }
  if (finanzas.capitalDesembolsado >= finanzas.cupoSimulado) {
    return 'Se alcanzó el cupo simulado para este lote.';
  }
  return null;
}

// ── Cálculo del repago ────────────────────────────────────────
/**
 * Calcula el repago completo y el total a distribuir.
 *
 * Fórmulas:
 *   interes          = capitalDesembolsado × tasaCampana
 *   repago           = capitalDesembolsado + interes
 *   totalADistribuir = repago + fondosNoUsados
 *
 * La tasa se aplica sobre el capital efectivamente desembolsado.
 * No representa una tasa anual.
 *
 * @example
 *   calcularRepago(30_000, 0.10, 20_000)
 *   → { interes: 3_000, repago: 33_000, fondosNoUsados: 20_000, totalADistribuir: 53_000 }
 */
export function calcularRepago(
  capitalDesembolsado: number,
  tasaCampana: number,
  fondosNoUsados: number,
): ResultadoRepago {
  const interes = Math.round(capitalDesembolsado * tasaCampana);
  const repago = capitalDesembolsado + interes;
  const totalADistribuir = repago + fondosNoUsados;

  return {
    capitalDesembolsado,
    interes,
    repago,
    fondosNoUsados,
    totalADistribuir,
  };
}

// ── Formateo de montos ────────────────────────────────────────
/**
 * Formatea un número como moneda USD con separadores de miles (es-AR).
 * @example formatUSD(53000) → "USD 53.000"
 */
export function formatUSD(valor: number): string {
  return `USD ${valor.toLocaleString('es-AR')}`;
}
