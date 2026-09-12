// ============================================================
// PreCrop · Tipos TypeScript
// Fuente de verdad única para el modelo de dominio del MVP.
// ============================================================

// ── Semáforo de condición del cultivo ────────────────────────
// El score NO es un score crediticio ni una probabilidad de cobro.
export type EstadoLote = 'verde' | 'amarillo' | 'rojo' | 'sin-datos';

// ── Tipo de evidencia de un indicador ────────────────────────
export type TipoEvidencia = 'medido' | 'estimado' | 'simulado';

// ── Tipo de evento del historial ─────────────────────────────
export type TipoEvento =
  | 'aporte'
  | 'desembolso'
  | 'actualizacion-condicion'
  | 'rechazo'
  | 'repago';

// ── Pasos de la máquina de estados de la demo ────────────────
// Seis pasos ordenados y sin retorno. El reducer rechaza
// cualquier acción que no corresponda al paso activo.
export type PasoDemo =
  | 'lote_evaluado'               // Paso 1: condición inicial visible
  | 'fondos_aportados'            // Paso 2: USD 50.000 de prueba aportados
  | 'primer_desembolso'           // Paso 3: USD 30.000 desembolsados
  | 'condicion_actualizada'       // Paso 4: score bajó de 82 a 48
  | 'segundo_desembolso_rechazado'// Paso 5: bloqueo por estado rojo
  | 'repago_completado';          // Paso 6: USD 53.000 distribuidos

// ── Acciones válidas del reducer ─────────────────────────────
// Discriminated union: cada tipo es manejado por exactamente un
// caso en el switch del reducer.
export type AccionDemo =
  | { tipo: 'APORTAR_FONDOS' }
  | { tipo: 'REALIZAR_DESEMBOLSO' }
  | { tipo: 'ACTUALIZAR_CONDICION' }
  | { tipo: 'INTENTAR_SEGUNDO_DESEMBOLSO' }
  | { tipo: 'COMPLETAR_REPAGO' }
  | { tipo: 'REINICIAR_DEMO' }
  | { tipo: 'CHANGE_SCENARIO'; payload: 'bueno' | 'mixto' | 'malo' }
  | { tipo: 'INICIAR_ANALISIS'; payload: { pointId: string } }
  | { tipo: 'PHOTO_UPLOADED'; payload: VisionResult }
  | { tipo: 'ERROR_ANALISIS'; payload: { pointId: string; error: string } }
  | { tipo: 'LIMPIAR_RESULTADOS' };

// ── Lote ─────────────────────────────────────────────────────
export interface Lote {
  id: string;
  nombre: string;
  campana: string;
  ubicacion: string;
  cultivo: string;
  hectareas: number;
}

// ── Condición del lote ────────────────────────────────────────
export interface CondicionLote {
  /** 0–100. No es score crediticio ni probabilidad de cobro. */
  score: number;
  scoreAnterior?: number;
  estado: EstadoLote;
  motivoPrincipal: string;
  fechaActualizacion: string;
  desactualizado?: boolean;
}

// ── Indicador de evidencia satelital o climática ─────────────
export interface Indicador {
  id: string;
  nombre: string;
  sigla?: string;
  /** Ej: "NDVI · indicador de vigor del cultivo" (primera aparición) */
  descripcionSigla?: string;
  valor: number | string;
  unidad: string;
  /** Ej: "últimos 7 días" */
  periodo?: string;
  fecha: string;
  tipo: TipoEvidencia;
  /** Nombre del icono en lucide-react */
  icono?: string;
}

// ── Finanzas de la simulación ─────────────────────────────────
// Siempre fondos de prueba. Nunca representan fondos reales.
export interface FinanzasDemo {
  /** Base monetaria en USD para calcular el cupo simulado */
  cosechaEstimadaBase: number;
  /** cosechaEstimadaBase × (score / 100) × 0,7 */
  cupoSimulado: number;
  /** Total de prueba aportado a la simulación */
  fondosAportados: number;
  /** Fondos de prueba ya entregados */
  capitalDesembolsado: number;
  /** fondosAportados - capitalDesembolsado */
  fondosDisponibles: number;
  /** 0,10 = 10 % simple por campaña sobre capital desembolsado */
  tasaCampana: number;
}

/** Alias de compatibilidad con componentes anteriores. */
export type FinanzasMock = FinanzasDemo;

// ── Resultado del cálculo de repago ──────────────────────────
export interface ResultadoRepago {
  capitalDesembolsado: number;
  /** capitalDesembolsado × tasaCampana */
  interes: number;
  /** capitalDesembolsado + interes */
  repago: number;
  /** fondos aportados que nunca se desembolsaron */
  fondosNoUsados: number;
  /** repago + fondosNoUsados */
  totalADistribuir: number;
}

// ── Evento del historial de la demo ──────────────────────────
export interface EventoHistorial {
  id: string;
  tipo: TipoEvento;
  fecha: string;
  descripcion: string;
  monto?: number;
  scoreAnterior?: number;
  scoreNuevo?: number;
  motivo?: string;
}

// ── Estado completo de la máquina de estados ─────────────────
export interface EstadoDemo {
  scenario: 'bueno' | 'mixto' | 'malo';
  visionResults: Record<string, VisionPointState>;
  paso: PasoDemo;
  condicion: CondicionLote;
  finanzas: FinanzasDemo;
  historial: EventoHistorial[];
  /** Mensaje de rechazo del último intento bloqueado, si existe */
  rechazo: string | null;
}

export interface VisionResultModel {
  pointId: string;
  weedsPct: number;
  soyPct: number | null;
  confidence: number;
  status: 'assessed';
  confidenceBand: 'alta' | 'baja' | 'sin_calibrar';
  confidenceScope: 'weeds';
  soyCalibrated: boolean;
  model: string;
  reviewUrl: string;
  gps: { lat: number; lon: number } | null;
  reason: string;
  limitations: string[];
  source: 'model';
}

export interface VisionResultPreset {
  pointId: string;
  weedsPct: number;
  soyPct: null;
  confidence: null;
  status: 'assessed';
  reviewUrl: null;
  source: 'preset';
}

export interface VisionResultNotAssessable {
  pointId: string;
  status: 'not_assessable';
  reason: string;
  limitations: string[];
}

export interface VisionResultProviderError {
  pointId: string;
  status: 'provider_error';
  error: string;
  detail: string;
}

export type VisionResult = VisionResultModel | VisionResultPreset | VisionResultNotAssessable | VisionResultProviderError;

export type PuntoAnalysisStatus = 'pending' | 'analyzing' | 'completed' | 'error';

export interface VisionPointState {
  status: PuntoAnalysisStatus;
  result: VisionResult | null;
  error?: string;
}

// ── Variantes de componentes UI ───────────────────────────────
export type VarianteBoton = 'primario' | 'secundario' | 'terciario';
export type TamanioBoton = 'sm' | 'md' | 'lg';
export type VarianteBadge =
  | 'positivo'
  | 'advertencia'
  | 'peligro'
  | 'neutro'
  | 'medido'
  | 'estimado'
  | 'simulado'
  | 'demo';

// ── Evidence API Types ───────────────────────────────────────

export interface EvidenceRequestPayload {
  scenario: 'bueno' | 'mixto' | 'malo';
  weeds_pct?: number;
  weeds_source?: 'estimated' | 'simulated';
  amount_ars?: number;
}

export interface AdvanceLimitData {
  rule_version: string;
  condition_index: number;
  light: 'verde' | 'amarillo' | 'rojo';
  floor: {
    campana: string | null;
    yield_t_ha: number | null;
    value_usd: number | null;
    source: string;
    available: boolean;
    basis: string;
  };
  advance_limit: {
    usd: number | null;
    ars: number | null;
    ceiling_usd: number | null;
    pct_of_ceiling: number;
    new_disbursements:
      | 'allowed'
      | 'review'
      | 'blocked'
      | 'blocked_no_capacity';
    formula: string;
    note: string;
  };
  benchmark: {
    flat_pct: number;
    usd: number | null;
    note: string;
  };
  reference: {
    ha: number;
    price_usd_t: number;
    haircut: number;
    fx_ars_per_usd: number | null;
    floor_value_usd: number | null;
  };
}

export interface ScoreResponse {
  scenario: 'bueno' | 'mixto' | 'malo';
  inputs: {
    ndvi: number;
    rain_mm_7d: number;
    weeds_pct: number;
  };
  result: {
    ndvi_norm: number;
    climate: number;
    score_exact: number;
    score: number;
    score_bp: number;
    light: 'verde' | 'amarillo' | 'rojo';
  };
  factors: Array<{
    name: string;
    label: string;
    value: number;
    weight: number;
    contribution: number;
    source: string;
    input: Record<string, number>;
  }>;
  advance: AdvanceLimitData | null;
  superseded_advance: {
    rule_version: string;
    usd: number;
    basis: string;
    note: string;
  } | null;
  evidence: {
    canonicalization: string;
    pack_version: string;
    content_sha256: string;
    payload: Record<string, string | number | boolean | null>;
  };
}

export interface PublishResponse extends ScoreResponse {
  anchor: {
    network: string;
    mock: boolean;
    signature: string;
    explorer_url: string;
  };
}

export interface DisburseResponse {
  mock: boolean;
  rail: string;
  transfer: {
    asset: string;
    amount_ars: number;
    from: string;
    to: string;
    reference: string;
    status: string;
    settled_in_seconds: number;
    note: string;
  };
  advance: AdvanceLimitData;
  evidence_sha256: string;
}

// ── Capacity API Types ──────────────────────────────────────

export interface CapacitySeriesRow {
  campana: string;
  official_dpto_kg_ha: number | null;
  ndvi_peak: number | null;
  ndvi_index: number | null;
  official_index: number | null;
  lote_vs_district: number | null;
  status: 'paired' | 'unpaired';
}

export interface CapacityV2 {
  rule_version: 'capacidad-v2' | string;
  series: CapacitySeriesRow[];
  worst_year: {
    campana: string;
    official_dpto_kg_ha: number;
    yield_t_ha: number;
    source: string;
    basis: string;
  } | null;
  district_volatility: {
    cv: number | null;
    basis: string;
    note: string;
  };
  representativeness: {
    representative: boolean;
    lote_vs_district_median: number | null;
    lote_vs_district_cv: number | null;
    band: {
      min: number;
      max: number;
    };
    paired_campaigns: number;
    reasons: string[];
    basis: string;
    note: string;
  };
  pre_sowing_limit: {
    usd: number | null;
    ars: number | null;
    usd_if_representative: number | null;
    status: 'allowed' | 'blocked_unrepresentative';
    formula: string;
    basis: string;
    note: string;
  };
  reference: {
    ha: number;
    price_usd_t: number;
    haircut: number;
    fx_ars_per_usd: number | null;
  };
}

export interface RejectedAlternative {
  rule_version: string;
  approach: string;
  worst_campaign: {
    campaign: string;
    yield_est_t_ha: number;
    tons_est: number;
    ndvi: number;
  };
  stability: {
    cv_pct: number | null;
    label: string;
  };
  contrast_official: {
    campaigns_with_official: number;
    mean_abs_error_pct: number | null;
    note: string;
  };
  usd_it_would_have_published: number;
  note: string;
}

export interface CapacityResponse {
  pack_version: string;
  lote_id: string;
  rule_version: string;
  generated_from: {
    history_generated_at_utc: string;
    method: {
      satellite: string;
      ndvi: string;
      peak: string;
      rain: string;
      caveat: string;
    };
  };
  capacity: CapacityV2;
  rejected_alternative: RejectedAlternative;
  sources: {
    history: {
      refs: string[];
      generated_at_utc: string;
    };
    official: {
      refs: string[];
      license: string;
      generated_at_utc: string;
    };
  };
  disclaimer: string;
}

export interface ApiErrorResponse {
  error: string;
  status?: number;
  reason?: string;
  hint?: string;
  detail?: string;
  advance?: AdvanceLimitData; // To hold potential block details for disburse
}

export class ApiError extends Error {
  public data: ApiErrorResponse;
  constructor(data: ApiErrorResponse) {
    super(data.error || 'Unknown API Error');
    this.name = 'ApiError';
    this.data = data;
  }
}
