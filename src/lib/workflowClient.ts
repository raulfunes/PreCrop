// Client for the two-role workflow of the Evidence API:
// coop approves the pre-sowing quota, producer records photos and requests
// disbursements. A rejected disbursement (409) is a normal outcome, not an
// error, so it is returned instead of thrown.
import { ApiError } from '@/types';
import { evidenceApiUrl, evidenceApiHeaders } from '@/lib/evidenceApi';

export type Scenario = 'bueno' | 'mixto' | 'malo';
export type WorkflowLight = 'verde' | 'amarillo' | 'rojo';

export interface LotPhotoRecord {
  weeds_pct: number;
  confidence: number | null;
  source: string;
  model?: string | null;
  file?: string | null;
  synthetic: boolean;
  gps: { lat: number; lon: number; distance_m: number; tolerance_m: number; source: string } | null;
  at: string;
}

export interface LotDisbursement {
  n: number;
  at: string;
  scenario: Scenario;
  status: 'paid' | 'rejected';
  reason?: string;
  weeds_median_pct: number | null;
  index: number | null;
  light: WorkflowLight | null;
  amount_usd: number;
  amount_ars?: number | null;
  rail?: string;
  reference?: string;
  evidence_sha256?: string;
  note?: string | null;
}

export interface LotStateResponse {
  lote_id: string;
  approved: {
    quota_usd: number;
    suggested_usd: number;
    worst_official_campaign: string | null;
    approved_by: string;
    note: string | null;
    at: string;
  } | null;
  photos: Record<string, LotPhotoRecord>;
  photos_assessed: number;
  min_points_for_score: number;
  weeds_median_pct: number | null;
  disbursements: LotDisbursement[];
  paid_usd: number;
  remaining_quota_usd: number | null;
  next: { step: 'coop_approval' | 'photos' | 'request_disbursement'; message: string };
  preview: {
    scenario: Scenario;
    inputs: { ndvi: number; rain_mm_7d: number; weeds_pct: number };
    index: number;
    light: WorkflowLight;
    released_usd: number;
    paid_usd: number;
    available_usd: number;
    can_withdraw: boolean;
    evidence_sha256: string;
  } | null;
}

export interface DisburseWorkflowResponse {
  mock: boolean;
  status: number;
  receipt: LotDisbursement;
  state: LotStateResponse;
}


async function call<T>(endpoint: string, init: RequestInit = {}, okStatuses: number[] = [200]): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${evidenceApiUrl()}${endpoint}`, {
      ...init,
      headers: evidenceApiHeaders(init.headers),
    });
  } catch (error) {
    throw new ApiError({ error: 'Error de red', detail: error instanceof Error ? error.message : 'desconocido' });
  }
  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    body = null;
  }
  if (!okStatuses.includes(res.status)) {
    const data = (body && typeof body === 'object' ? body : { error: `HTTP ${res.status}` }) as { error?: string };
    throw new ApiError({ error: data.error || `HTTP ${res.status}`, status: res.status });
  }
  return body as T;
}

export interface LotPoint { point_id: string; label: string; lat: number; lon: number }

export interface CreatedLot {
  lote: { id: string; nombre: string; ha: number; departamento: string; provincia?: string; center: { lat: number; lon: number }; departments?: Array<{ departamento: string; share: number }> };
  elapsed_s: number;
  scenario_campaign: string;
  points: LotPoint[];
  history: Array<{ campaign: string; peak: number | null; min: number | null; rain_dec_feb_mm: number | null }>;
  condition: Record<'bueno' | 'malo', { date: string; ndvi: number; rain_mm_7d: number; index: number; light: WorkflowLight }>;
}

export interface LocateResponse { point_id: string; label: string; distance_m: number; tolerance_m: number; within_tolerance: boolean }

export interface LotSummary { id: string; nombre: string; ha: number; departamento: string; source?: string }
export interface LotDetail {
  lote: LotSummary & { center?: { lat: number; lon: number } };
  geometry: { type: 'Polygon'; coordinates: number[][][] };
  points: LotPoint[] | { points: LotPoint[] };
}

export const workflowClient = {
  listLots(): Promise<{ default: string; lotes: LotSummary[] }> {
    return call('/lotes');
  },
  getLot(loteId: string): Promise<LotDetail> {
    return call<LotDetail>(`/lotes/${encodeURIComponent(loteId)}`);
  },
  locate(loteId: string, lat: number, lon: number): Promise<LocateResponse> {
    return call<LocateResponse>(`/lotes/${encodeURIComponent(loteId)}/locate?lat=${lat}&lon=${lon}`);
  },
  /** Build a lot live from a GeoJSON polygon (about 20 s: department, official series, 7 campaigns, scenarios). */
  createLot(body: { name?: string; geometry: { type: 'Polygon'; coordinates: number[][][] } }): Promise<CreatedLot> {
    return call(`/lotes`, { method: 'POST', body: JSON.stringify(body) }, [201]);
  },
  state(loteId: string, scenario: Scenario): Promise<LotStateResponse> {
    return call(`/lotes/${loteId}/state?scenario=${scenario}`);
  },
  approve(loteId: string, body: { quota_usd?: number; approved_by?: string } = {}): Promise<LotStateResponse> {
    return call(`/lotes/${loteId}/approve`, { method: 'POST', body: JSON.stringify(body) });
  },
  recordPhoto(
    loteId: string,
    body: { point_id?: string; gps?: { lat: number; lon: number; source?: string }; weeds_pct: number; confidence?: number | null; source?: string; model?: string | null; synthetic?: boolean; scenario?: Scenario },
  ): Promise<LotStateResponse> {
    return call(`/lotes/${loteId}/photos`, { method: 'POST', body: JSON.stringify(body) });
  },
  clearPhotos(loteId: string): Promise<LotStateResponse> {
    return call(`/lotes/${loteId}/photos`, { method: 'DELETE' });
  },
  disburse(loteId: string, body: { scenario: Scenario; amount_usd?: number }): Promise<DisburseWorkflowResponse> {
    return call(`/lotes/${loteId}/disburse`, { method: 'POST', body: JSON.stringify(body) }, [200, 409]);
  },
  reset(loteId: string): Promise<LotStateResponse> {
    return call(`/lotes/${loteId}/state`, { method: 'DELETE' });
  },
};
