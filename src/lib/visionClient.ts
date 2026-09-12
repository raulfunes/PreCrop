import type { VisionResult } from '@/types';

export async function submitPhoto(imageFile: File, pointId: string, scenario: string): Promise<VisionResult> {
  const formData = new FormData();
  formData.append('image', imageFile);
  formData.append('point_id', pointId);
  formData.append('scenario', scenario);

  const res = await fetch('/api/vision/weeds', {
    method: 'POST',
    body: formData,
  });

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    if (res.status === 422 || res.status === 502 || data.status === 'not_assessable' || data.status === 'provider_error') {
      return {
        pointId: data.point_id ?? pointId,
        status: data.status ?? (res.status === 422 ? 'not_assessable' : 'provider_error'),
        reason: data.reason,
        limitations: data.limitations ?? [],
        error: data.error,
        detail: data.detail,
      } as VisionResult;
    }
    throw new Error(data.error || 'Error en el análisis visual');
  }

  return {
    pointId: data.point_id ?? pointId,
    weedsPct: data.weeds_pct,
    soyPct: data.soy_pct ?? null,
    confidence: data.confidence ?? null,
    status: data.status ?? 'assessed',
    confidenceBand: data.confidence_band,
    confidenceScope: data.confidence_scope,
    soyCalibrated: data.soy_calibrated,
    model: data.model,
    reviewUrl: data.review_url ?? null,
    gps: data.gps,
    reason: data.reason,
    limitations: data.limitations,
    source: data.source ?? 'model',
  } as VisionResult;
}
