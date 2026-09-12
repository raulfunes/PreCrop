// Base compartida de los dos clientes del evidence-api (evidenceClient y workflowClient).
//
// El backend corre en la PC del equipo y sale por un túnel ngrok. En el plan free,
// ngrok intercepta las requests que parecen venir de un navegador y devuelve su página
// de advertencia (ERR_NGROK_6024): HTML, sin cabeceras CORS, así que el fetch muere con
// "No 'Access-Control-Allow-Origin' header is present". Mandar
// ngrok-skip-browser-warning la saltea. Con un dominio propio o en local no molesta.

export function evidenceApiUrl(): string {
  return (process.env.NEXT_PUBLIC_EVIDENCE_API_URL || 'http://127.0.0.1:8787').replace(/\/$/, '');
}

/** Cabeceras comunes. `extra` pisa lo que haga falta. */
export function evidenceApiHeaders(extra?: HeadersInit): HeadersInit {
  return {
    'Content-Type': 'application/json',
    'ngrok-skip-browser-warning': 'true',
    ...(extra as Record<string, string> | undefined),
  };
}
