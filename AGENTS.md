# Regla de commits

Cada cambio grande debe cerrarse con un commit local después de completar las verificaciones correspondientes, para poder volver fácilmente a un estado anterior. Usar un mensaje que describa el cambio y mantener cada commit coherente y recuperable. No esperar una nueva petición para commitear el trabajo autorizado.

Revisar lo que se incluye antes de commitear; no incorporar credenciales ni mezclar cambios ajenos. No hacer push ni reescribir el historial salvo indicación del usuario.
<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
