// El backend de visión corre en la PC del equipo y sale a internet por un túnel ngrok
// con basic-auth, porque detrás está la GEMINI_API_KEY y cada request factura.
// Las credenciales viven solo en el servidor (VISION_BACKEND_AUTH, sin NEXT_PUBLIC_):
// el navegador nunca las ve, habla siempre con /api/vision/* de este mismo front.

/** URL del backend sin barra final, o null si no está configurado. */
export function visionBackendUrl(): string | null {
  const raw = process.env.VISION_BACKEND_URL;
  return raw ? raw.replace(/\/+$/, '') : null;
}

/** Cabeceras para el backend. Lleva Authorization solo si hay credenciales. */
export function visionBackendHeaders(): HeadersInit {
  const auth = process.env.VISION_BACKEND_AUTH;
  if (!auth || !auth.includes(':')) return {};
  return { Authorization: `Basic ${Buffer.from(auth).toString('base64')}` };
}
