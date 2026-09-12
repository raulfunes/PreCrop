import { NextRequest, NextResponse } from 'next/server';
import photoPresets from '../../../../../data/photo-point-presets.json';

interface PresetsData {
  scenarios: Record<string, {
    weeds_pct_by_point: Record<string, number>;
  }>;
}

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

    let backendUrl = process.env.VISION_BACKEND_URL;

    if (backendUrl) {
      // Normalize URL (remove trailing slash)
      backendUrl = backendUrl.replace(/\/+$/, '');

      const backendFormData = new FormData();
      backendFormData.append('image', image);
      backendFormData.append('point_id', pointId);

      let res;
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 30000);
        res = await fetch(`${backendUrl}/api/vision/weeds`, {
          method: 'POST',
          body: backendFormData,
          signal: controller.signal
        });
        clearTimeout(timeoutId);
      } catch (err: unknown) {
        if (err instanceof Error && err.name === 'AbortError') {
           return NextResponse.json({
             point_id: pointId,
             status: 'provider_error',
             error: 'Timeout',
             detail: 'El servicio demoró demasiado en responder.'
           }, { status: 502 });
        }
        return NextResponse.json({
          point_id: pointId,
          status: 'provider_error',
          error: 'Backend de visión no disponible',
          detail: 'No se pudo contactar al servicio de análisis visual.'
        }, { status: 502 });
      }

      let data;
      try {
        data = await res.json();
      } catch {
        return NextResponse.json({
          point_id: pointId,
          status: 'provider_error',
          error: 'Respuesta ilegible',
          detail: 'El backend devolvió un formato que no es JSON válido.'
        }, { status: 502 });
      }

      if (res.ok) {
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
           return NextResponse.json({
             point_id: pointId,
             status: 'provider_error',
             error: 'Respuesta JSON inválida',
             detail: 'El backend omitió campos requeridos o los valores están fuera de rango.'
           }, { status: 502 });
        }
      }

      if (res.ok && data.review_url) {
         const filenameMatch = data.review_url.match(/\/([a-fA-F0-9]+\.png)$/);
         if (filenameMatch) {
            data.review_url = `/api/vision/review/${filenameMatch[1]}`;
         }
      }

      return NextResponse.json(data, { status: res.status });
    } else {
      // Fallback
      const typedPresets = photoPresets as unknown as PresetsData;
      const scenarios = typedPresets.scenarios;

      if (!scenarios[scenario]) {
        return NextResponse.json({ error: 'Invalid scenario' }, { status: 400 });
      }

      const weedsPct = scenarios[scenario].weeds_pct_by_point[pointId];
      if (weedsPct === undefined) {
        return NextResponse.json({ error: 'Invalid point_id for this scenario' }, { status: 400 });
      }

      return NextResponse.json({
        point_id: pointId,
        weeds_pct: weedsPct,
        soy_pct: null,
        confidence: null,
        status: 'assessed',
        review_url: null,
        source: 'preset'
      });
    }
  } catch {
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
