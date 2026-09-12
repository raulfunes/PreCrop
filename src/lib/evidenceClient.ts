import type { VisionPointState, EvidenceRequestPayload, ScoreResponse, PublishResponse, DisburseResponse, CapacityResponse, ApiErrorResponse } from '@/types';
import { ApiError } from '@/types';
import { evidenceApiUrl, evidenceApiHeaders } from '@/lib/evidenceApi';


/**
 * Función pura para construir el payload de las llamadas a la API.
 */
export function buildEvidenceRequest(
  scenario: 'bueno' | 'mixto' | 'malo',
  visionResults: Record<string, VisionPointState>
): EvidenceRequestPayload {
  // Same rule as the lot state on the API: every assessed photo counts, whether the
  // value came from the vision model or from the preset fallback when no API answered.
  const assessed = Object.values(visionResults)
    .filter(r => r.status === 'completed' && r.result?.status === 'assessed');
  const validPct = assessed
    .map(r => (r.result && r.result.status === 'assessed') ? r.result.weedsPct : -1)
    .filter(w => Number.isFinite(w) && w >= 0 && w <= 100);

  if (validPct.length < 3) {
    return { scenario };
  }

  validPct.sort((a, b) => a - b);
  const mid = Math.floor(validPct.length / 2);
  const median = validPct.length % 2 !== 0 ? validPct[mid] : (validPct[mid - 1] + validPct[mid]) / 2;

  return {
    scenario,
    weeds_pct: median,
    weeds_source: assessed.every(r => r.result?.status === 'assessed' && r.result.source === 'model') ? 'estimated' : 'simulated',
  };
}

async function fetchWithHandling<T>(endpoint: string, options: RequestInit): Promise<T> {
  const url = `${evidenceApiUrl()}${endpoint}`;
  let res: Response;
  try {
    res = await fetch(url, {
      ...options,
      headers: evidenceApiHeaders(options.headers),
    });
  } catch (error) {
    throw new ApiError({
      error: 'Error de red',
      detail: error instanceof Error ? error.message : 'Error desconocido de red',
    });
  }

  if (!res.ok) {
    let errorData: ApiErrorResponse;
    try {
      errorData = await res.json();
    } catch {
      errorData = { error: `HTTP ${res.status} ${res.statusText}` };
    }
    errorData.status = res.status;
    throw new ApiError(errorData);
  }

  return res.json();
}

async function fetchText(endpoint: string, signal?: AbortSignal): Promise<string> {
  const url = `${evidenceApiUrl()}${endpoint}`;
  let res: Response;
  try {
    res = await fetch(url, { signal, headers: evidenceApiHeaders() });
  } catch (error) {
    throw new ApiError({
      error: 'Error de red',
      detail: error instanceof Error ? error.message : 'Error desconocido de red',
    });
  }

  if (!res.ok) {
    let errorData: ApiErrorResponse;
    try {
      errorData = await res.json();
    } catch {
      errorData = { error: `HTTP ${res.status} ${res.statusText}` };
    }
    errorData.status = res.status;
    throw new ApiError(errorData);
  }

  return res.text();
}

/** Every route accepts ?lote=<id>; without it the API uses the committed demo lot. */
function withLot(endpoint: string, loteId?: string): string {
  if (!loteId) return endpoint;
  return `${endpoint}${endpoint.includes('?') ? '&' : '?'}lote=${encodeURIComponent(loteId)}`;
}

export const evidenceClient = {
  async score(payload: EvidenceRequestPayload, signal?: AbortSignal, loteId?: string): Promise<ScoreResponse> {
    return fetchWithHandling<ScoreResponse>(withLot('/score', loteId), {
      method: 'POST',
      body: JSON.stringify(payload),
      signal,
    });
  },

  async publish(payload: EvidenceRequestPayload, signal?: AbortSignal, loteId?: string): Promise<PublishResponse> {
    return fetchWithHandling<PublishResponse>(withLot('/publish', loteId), {
      method: 'POST',
      body: JSON.stringify(payload),
      signal,
    });
  },

  async disburse(payload: EvidenceRequestPayload, signal?: AbortSignal, loteId?: string): Promise<DisburseResponse> {
    return fetchWithHandling<DisburseResponse>(withLot('/disburse', loteId), {
      method: 'POST',
      body: JSON.stringify(payload),
      signal,
    });
  },

  async capacity(signal?: AbortSignal, loteId?: string): Promise<CapacityResponse> {
    return fetchWithHandling<CapacityResponse>(withLot('/capacity', loteId), {
      method: 'GET',
      signal,
    });
  },

  async report(
    scenario: 'bueno' | 'mixto' | 'malo',
    options?: { weeds_pct?: number; signature?: string; explorer_url?: string },
    signal?: AbortSignal,
    loteId?: string
  ): Promise<string> {
    const params = new URLSearchParams();
    if (options?.weeds_pct !== undefined) params.set('weeds_pct', String(options.weeds_pct));
    if (options?.signature !== undefined) params.set('signature', options.signature);
    if (options?.explorer_url !== undefined) params.set('explorer_url', options.explorer_url);
    const qs = params.toString();
    const endpoint = withLot(`/report/${scenario}${qs ? `?${qs}` : ''}`, loteId);
    return fetchText(endpoint, signal);
  },
};
