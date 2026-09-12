import type { VisionPointState, EvidenceRequestPayload, ScoreResponse, PublishResponse, DisburseResponse, ApiErrorResponse } from '@/types';
import { ApiError } from '@/types';

function getApiUrl(): string {
  const url = process.env.NEXT_PUBLIC_EVIDENCE_API_URL || 'http://127.0.0.1:8787';
  return url.replace(/\/$/, '');
}

/**
 * Función pura para construir el payload de las llamadas a la API.
 */
export function buildEvidenceRequest(
  scenario: 'bueno' | 'mixto' | 'malo',
  visionResults: Record<string, VisionPointState>
): EvidenceRequestPayload {
  const validPct = Object.values(visionResults)
    .filter(r => r.status === 'completed' && r.result?.status === 'assessed' && r.result.source === 'model')
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
    weeds_source: 'estimated',
  };
}

async function fetchWithHandling<T>(endpoint: string, options: RequestInit): Promise<T> {
  const url = `${getApiUrl()}${endpoint}`;
  let res: Response;
  try {
    res = await fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      }
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

export const evidenceClient = {
  async score(payload: EvidenceRequestPayload, signal?: AbortSignal): Promise<ScoreResponse> {
    return fetchWithHandling<ScoreResponse>('/score', {
      method: 'POST',
      body: JSON.stringify(payload),
      signal,
    });
  },

  async publish(payload: EvidenceRequestPayload, signal?: AbortSignal): Promise<PublishResponse> {
    return fetchWithHandling<PublishResponse>('/publish', {
      method: 'POST',
      body: JSON.stringify(payload),
      signal,
    });
  },

  async disburse(payload: EvidenceRequestPayload, signal?: AbortSignal): Promise<DisburseResponse> {
    return fetchWithHandling<DisburseResponse>('/disburse', {
      method: 'POST',
      body: JSON.stringify(payload),
      signal,
    });
  }
};
