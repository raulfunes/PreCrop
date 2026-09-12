// PreCrop evidence API. Zero framework: node:http only.
//   GET  /health                -> { ok, pack_version, publisher }
//   GET  /pack                  -> list of public pack files
//   GET  /pack/<name>           -> raw JSON from data/ (whitelisted)
//   POST /score   { scenario, weeds_pct? }  -> score + evidence payload + sha256
//   POST /publish { scenario, weeds_pct? }  -> same + Solana memo tx (oracle)
import { createServer } from "node:http";
import { existsSync } from "node:fs";
import { loadPack, readPublicFile, PUBLIC_FILES } from "./pack.js";
import { buildEvidence, memoText } from "./evidence.js";
import { loadKeypair, publishMemo, DEFAULT_RPC_URL } from "./memo.js";

const PORT = Number(process.env.PORT ?? 8787);
const RPC_URL = process.env.RPC_URL ?? DEFAULT_RPC_URL;
const KEYPAIR_PATH = process.env.PUBLISHER_KEYPAIR ?? ".keys/publisher.json";

const pack = loadPack();
const keypair = existsSync(KEYPAIR_PATH) ? loadKeypair(KEYPAIR_PATH) : null;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

function send(res, status, body, type = "application/json") {
  res.writeHead(status, { "Content-Type": `${type}; charset=utf-8`, ...CORS });
  res.end(type === "application/json" ? JSON.stringify(body, null, 2) : body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (chunk) => {
      data += chunk;
      if (data.length > 65536) reject(new Error("body too large"));
    });
    req.on("end", () => {
      try {
        resolve(data ? JSON.parse(data) : {});
      } catch {
        reject(new Error("invalid JSON body"));
      }
    });
    req.on("error", reject);
  });
}

function parseScoreRequest(body) {
  const scenario = body.scenario;
  if (!["bueno", "mixto", "malo"].includes(scenario)) {
    throw new Error("scenario must be one of bueno | mixto | malo");
  }
  const override = {};
  if (body.weeds_pct !== undefined) {
    const w = Number(body.weeds_pct);
    if (!Number.isFinite(w) || w < 0 || w > 100) throw new Error("weeds_pct must be a number between 0 and 100");
    override.weeds_pct = w;
    override.weeds_source = body.weeds_source ?? "estimated";
  }
  return { scenario, override };
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  try {
    if (req.method === "OPTIONS") return send(res, 204, "", "text/plain");

    if (req.method === "GET" && url.pathname === "/health") {
      return send(res, 200, {
        ok: true,
        pack_version: pack.pack_version,
        lote_id: pack.presets.lote_id,
        publisher: keypair ? keypair.publicKey.toBase58() : null,
        rpc_url: RPC_URL,
        mock: true,
      });
    }

    if (req.method === "GET" && url.pathname === "/pack") {
      return send(res, 200, { pack_version: pack.pack_version, files: PUBLIC_FILES });
    }

    if (req.method === "GET" && url.pathname.startsWith("/pack/")) {
      const raw = readPublicFile(url.pathname.slice("/pack/".length));
      if (raw === null) return send(res, 404, { error: "unknown pack file" });
      return send(res, 200, raw, "application/json");
    }

    if (req.method === "POST" && url.pathname === "/score") {
      const { scenario, override } = parseScoreRequest(await readBody(req));
      return send(res, 200, buildEvidence(scenario, pack, override));
    }

    if (req.method === "POST" && url.pathname === "/publish") {
      if (!keypair) {
        return send(res, 503, {
          error: "no publisher keypair",
          hint: `run 'npm run keygen' or set PUBLISHER_KEYPAIR (looked for ${KEYPAIR_PATH})`,
        });
      }
      const { scenario, override } = parseScoreRequest(await readBody(req));
      const ev = buildEvidence(scenario, pack, override);
      const text = memoText(ev.evidence);
      const tx = await publishMemo({ text, keypair, rpcUrl: RPC_URL });
      return send(res, 200, { ...ev, anchor: { network: RPC_URL, mock: true, ...tx } });
    }

    return send(res, 404, { error: "not found" });
  } catch (err) {
    const status = /must be|unknown scenario|invalid JSON|too large/.test(err.message) ? 400 : 500;
    return send(res, status, { error: err.message });
  }
});

server.listen(PORT, () => {
  console.log(`evidence-api listening on http://localhost:${PORT} (pack ${pack.pack_version}, publisher ${keypair ? keypair.publicKey.toBase58() : "none"})`);
});
