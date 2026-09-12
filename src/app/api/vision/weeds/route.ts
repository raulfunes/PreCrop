import { NextRequest, NextResponse } from 'next/server';
import photoPresets from '../../../../../data/photo-point-presets.json';

interface PresetsData {
  scenarios: Record<string, {
    weeds_pct_by_point: Record<string, number>;
  }>;
}

// Demo safety net. Each satellite scene has a band of weed cover that is coherent with
// its story (bueno = clean lot, malo = infested lot). A live model answer outside that
// band would contradict the scene on stage, so it is replaced by the preset of the point
// and labelled as such. Set VISION_DEMO_GUARD=0 to always trust the model.
const DEMO_BAND: Record<string, [number, number]> = {
  bueno: [0, 25],
  mixto: [30, 60],
  malo: [55, 100],
};
const demoGuard = process.env.VISION_DEMO_GUARD !== '0';
// VISION_DEMO_ONLY=1 never calls the model: instant, deterministic presets.
const demoOnly = process.env.VISION_DEMO_ONLY === '1';
const timeoutMs = Number(process.env.VISION_TIMEOUT_MS) > 0 ? Number(process.env.VISION_TIMEOUT_MS) : 45000;

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const pointId = formData.get('point_id') as string;
    const scenario = formData.get('scenario') as string;
    const image = formData.get('image');

    if (!pointId || !scenario) {
      return NextResponse.json({ error: 'Missing point_id or scenario' }, { status: 400 });
    }

    if (!/^[A-Za-z0-9_-]{1,32}$/.test(pointId)) {
      return NextResponse.json({ error: 'Invalid point_id format' }, { status: 400 });
    }

    if (!image || !(image instanceof File) || image.size === 0) {
      return NextResponse.json({ error: 'Missing or invalid image file' }, { status: 400 });
    }

    const validMimes = ['image/jpeg', 'image/png', 'image/webp'];
    if (!validMimes.includes(image.type)) {
      return NextResponse.json({ error: 'Formato inválido. Solo se aceptan JPEG, PNG o WebP.' }, { status: 400 });
    }

    // 12 MB limit
    if (image.size > 12 * 1024 * 1024) {
      return NextResponse.json({ error: 'Image too large (max 12MB)' }, { status: 413 });
    }

    const typedPresets = photoPresets as unknown as PresetsData;
    if (!typedPresets.scenarios[scenario]) {
      return NextResponse.json({ error: 'Invalid scenario' }, { status: 400 });
    }
    const preset = typedPresets.scenarios[scenario].weeds_pct_by_point?.[pointId];

    // Fallback when no vision API answers (or its answer contradicts the scene): the
    // preset weeds of the current scenario for that point, labelled as preset, never as measured.
    const presetFallback = (reason: string, extra: Record<string, unknown> = {}) => {
      if (preset === undefined) {
        return NextResponse.json({ point_id: pointId, status: 'provider_error', error: reason, detail: 'Sin estimación y sin valor de ejemplo para este punto.' }, { status: 502 });
      }
      return NextResponse.json({
        point_id: pointId,
        weeds_pct: preset,
        soy_pct: null,
        confidence: null,
        status: 'assessed',
        review_url: null,
        source: 'preset',
        fallback_reason: reason,
        ...extra,
      });
    };

    let backendUrl = process.env.VISION_BACKEND_URL;
    if (!backendUrl || demoOnly) {
      return presetFallback(demoOnly ? 'demo_only' : 'no_vision_backend');
    }

    // Normalize URL (remove trailing slash)
    backendUrl = backendUrl.replace(/\/+$/, '');

    const backendFormData = new FormData();
    backendFormData.append('image', image);
    backendFormData.append('point_id', pointId);

    let res;
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
      res = await fetch(`${backendUrl}/api/vision/weeds`, {
        method: 'POST',
        body: backendFormData,
        signal: controller.signal
      });
      clearTimeout(timeoutId);
    } catch (err: unknown) {
      return presetFallback(err instanceof Error && err.name === 'AbortError' ? 'timeout' : 'vision_backend_unavailable');
    }

    let data;
    try {
      data = await res.json();
    } catch {
      return presetFallback('unreadable_response');
    }

    if (!res.ok || data.status === 'provider_error' || data.status === 'not_assessable') {
      return presetFallback(String(data?.error || data?.status || `HTTP_${res.status}`));
    }

    // Validate exactly the success schema
    const isAssessed = data.status === 'assessed';
    const isPointIdStr = typeof data.point_id === 'string';
    const isWeedsValid = Number.isFinite(data.weeds_pct) && data.weeds_pct >= 0 && data.weeds_pct <= 100;
    const isSoyValid = data.soy_pct === null || (Number.isFinite(data.soy_pct) && data.soy_pct >= 0 && data.soy_pct <= 100);
    const isConfValid = Number.isFinite(data.confidence) && data.confidence >= 0 && data.confidence <= 0.65;
    const isBandValid = ['alta', 'baja', 'sin_calibrar'].includes(data.confidence_band);
    const isScopeValid = data.confidence_scope === 'weeds';
    const isCalibratedBool = typeof data.soy_calibrated === 'boolean';
    const isReviewStr = typeof data.review_url === 'string';
    const isLimArray = Array.isArray(data.limitations);

    if (!(isAssessed && isPointIdStr && isWeedsValid && isSoyValid && isConfValid && isBandValid && isScopeValid && isCalibratedBool && isReviewStr && isLimArray)) {
      return presetFallback('invalid_response');
    }

    const band = DEMO_BAND[scenario];
    if (demoGuard && band && (data.weeds_pct < band[0] || data.weeds_pct > band[1])) {
      return presetFallback('fuera_de_banda_demo', { model_weeds_pct: data.weeds_pct, model: data.model ?? null });
    }

    if (data.review_url) {
      const filenameMatch = data.review_url.match(/\/([a-fA-F0-9]+\.png)$/);
      if (filenameMatch) {
        data.review_url = `/api/vision/review/${filenameMatch[1]}`;
      }
    }

    return NextResponse.json(data, { status: res.status });
  } catch {
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
