import type {
  Lote,
  CondicionLote,
  Indicador,
  FinanzasDemo,
  EventoHistorial,
} from '@/types';
import { clasificarScore, calcularCupoSimulado, calcularScoreAgronomico } from '@/lib/scoreUtils';
import demoScenarios from '../../data/demo-scenarios.json';
import loteSentinelPresets from '../../data/lote-sentinel-presets.json';

export const DEMO = {
  COSECHA_BASE_USD:       100_000,
  TASA_CAMPANA:           0.10,
  APORTE_USD:             50_000,
  PRIMER_DESEMBOLSO_USD:  30_000,
} as const;

export const FONDOS_NO_USADOS   = DEMO.APORTE_USD - DEMO.PRIMER_DESEMBOLSO_USD;
export const REPAGO_USD         = DEMO.PRIMER_DESEMBOLSO_USD * (1 + DEMO.TASA_CAMPANA);
export const TOTAL_DISTRIBUIR   = REPAGO_USD + FONDOS_NO_USADOS;

export const loteOficial: Lote = {
  id:         loteSentinelPresets.lote_id,
  nombre:     loteSentinelPresets.nombre,
  campana:    '2025/26',
  ubicacion:  'Río Segundo, Córdoba',
  cultivo:    'Soja', // loteSentinelPresets.cultivo = 'soja', but capitalized
  hectareas:  loteSentinelPresets.ha,
};

interface DemoScenariosType {
  scenarios: Record<string, {
    satellite_preset: string;
  }>;
}

interface LotePresetsType {
  presets: Record<string, {
    ndvi: number;
    rain_mm_7d: number;
    date: string;
  }>;
}

export function getScenarioData(scenarioId: 'bueno' | 'mixto' | 'malo') {
  const scenarioData = (demoScenarios as unknown as DemoScenariosType).scenarios[scenarioId];
  const presetKey = scenarioData.satellite_preset;
  const satelliteData = (loteSentinelPresets as unknown as LotePresetsType).presets[presetKey];

  return {
    scenarioId,
    ndvi: satelliteData.ndvi,
    rain: satelliteData.rain_mm_7d,
    fecha: satelliteData.date,
  };
}

export function buildIndicators(scenarioId: 'bueno' | 'mixto' | 'malo', weedsPct: number, origin: 'simulado' | 'estimado' = 'estimado'): Indicador[] {
  const data = getScenarioData(scenarioId);
  return [
    {
      id:                 'ndvi',
      nombre:             'Vigor del cultivo',
      sigla:              'NDVI',
      descripcionSigla:   'NDVI · indicador de vigor del cultivo',
      valor:              data.ndvi,
      unidad:             '',
      fecha:              data.fecha,
      tipo:               'medido',
      icono:              'Leaf',
    },
    {
      id:       'lluvia',
      nombre:   'Lluvia acumulada',
      valor:    data.rain,
      unidad:   'mm',
      periodo:  'últimos 7 días',
      fecha:    data.fecha,
      tipo:     'medido',
      icono:    'CloudRain',
    },
    {
      id:       'malezas',
      nombre:   'Malezas estimadas',
      valor:    weedsPct,
      unidad:   '%',
      fecha:    data.fecha,
      tipo:     origin === 'simulado' ? 'simulado' : 'estimado',
      icono:    'AlertTriangle',
    },
  ];
}

export function getCondicionLote(scenarioId: 'bueno' | 'mixto' | 'malo', weedsPct: number, scoreAnterior?: number): CondicionLote {
  const data = getScenarioData(scenarioId);
  const score = calcularScoreAgronomico(data.ndvi, data.rain, weedsPct);

  return {
    score: score,
    scoreAnterior,
    estado: clasificarScore(score),
    motivoPrincipal: `Índice de condición para escenario ${scenarioId}.`,
    fechaActualizacion: data.fecha,
  };
}

export function getFinanzasIniciales(score: number): FinanzasDemo {
  return {
    cosechaEstimadaBase:  DEMO.COSECHA_BASE_USD,
    cupoSimulado:         calcularCupoSimulado(DEMO.COSECHA_BASE_USD, score),
    fondosAportados:      0,
    capitalDesembolsado:  0,
    fondosDisponibles:    0,
    tasaCampana:          DEMO.TASA_CAMPANA,
  };
}

export const eventoAporte: EventoHistorial = {
  id:          'ev-002',
  tipo:        'aporte',
  fecha:       'Actual',
  descripcion: 'Aporte de fondos al lote',
  monto:       DEMO.APORTE_USD,
};

export const eventoDesembolso: EventoHistorial = {
  id:          'ev-003',
  tipo:        'desembolso',
  fecha:       'Actual',
  descripcion: 'Primer desembolso simulado al productor · DEMO · MOCK',
  monto:       DEMO.PRIMER_DESEMBOLSO_USD,
};

export const eventoRechazo: EventoHistorial = {
  id:          'ev-005',
  tipo:        'rechazo',
  fecha:       'Actual',
  descripcion: 'Intento de segundo desembolso rechazado.',
};

export const eventoRepago: EventoHistorial = {
  id:          'ev-006',
  tipo:        'repago',
  fecha:       'Actual',
  descripcion: `Repago completo simulado: capital + 10 % por campaña + fondos no utilizados · DEMO`,
  monto:       TOTAL_DISTRIBUIR,
};
