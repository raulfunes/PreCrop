// PreCrop evidence API. Zero framework: node:http only.
//   GET  /health                -> { ok, pack_version, publisher }
//   GET  /pack                  -> list of public pack files
//   GET  /pack/<name>           -> raw JSON from data/ (whitelisted)
//   POST /score   { scenario, weeds_pct? }  -> score + evidence payload + sha256
//   POST /publish { scenario, weeds_pct? }  -> same + Solana memo tx (oracle)
import { createServer } from "node:http";
import { existsSync } from "node:fs";
import { capacity } from "@precrop/score";
import { loadPack, readPublicFile, PUBLIC_FILES, economicsInputs, historyPeaks } from "./pack.js";
import { buildEvidence, memoText } from "./evidence.js";
import { committeeReport } from "./report.js";
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

function send(res, status, body, type = "application/json", raw = false) {
  res.writeHead(status, { "Content-Type": `${type}; charset=utf-8`, ...CORS });
  res.end(raw || type !== "application/json" ? body : JSON.stringify(body, null, 2));
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
      return send(res, 200, raw, "application/json", true);
    }

    if (req.method === "GET" && url.pathname === "/capacity") {
      const peaks = historyPeaks(pack.history);
      if (!peaks.length) return send(res, 503, { error: "no lote-history.json in pack; run scripts/build_history.py" });
      return send(res, 200, {
        lote_id: pack.presets.lote_id,
        pack_version: pack.pack_version,
        generated_from: { history_generated_at_utc: pack.history.generated_at_utc, method: pack.history.method },
        ...capacity(peaks, economicsInputs(pack.economics), pack.official?.campaigns ?? {}),
      });
    }

    if (req.method === "GET" && url.pathname.startsWith("/report/")) {
      const scenario = url.pathname.slice("/report/".length);
      if (!["bueno", "mixto", "malo"].includes(scenario)) return send(res, 400, { error: "scenario must be one of bueno | mixto | malo" });
      const q = url.searchParams;
      const md = committeeReport(scenario, pack, {
        weeds_pct: q.has("weeds_pct") ? Number(q.get("weeds_pct")) : undefined,
        signature: q.get("signature") ?? undefined,
        explorer_url: q.get("explorer_url") ?? undefined,
        publisher: keypair ? keypair.publicKey.toBase58() : undefined,
      });
      return send(res, 200, md, "text/markdown");
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

    if (req.method === "POST" && url.pathname === "/disburse") {
      // MOCK of step 3 of the Twin flow: the coop sends the approved advance in ARGt
      // (peso stablecoin) to the producer's wallet. Twin exposes partner APIs, not a
      // public testnet, so this returns the shape of a transfer without moving anything.
      const body = await readBody(req);
      const { scenario, override } = parseScoreRequest(body);
      const ev = buildEvidence(scenario, pack, override);
      if (!ev.advance) return send(res, 503, { error: "no lote-economics.json in pack" });
      if (ev.advance.advance_limit.new_disbursements === "blocked") {
        return send(res, 409, {
          error: "disbursement blocked",
          reason: `condition index ${ev.advance.condition_index} is rojo; new disbursements are blocked`,
          advance: ev.advance,
        });
      }
      const requested = body.amount_ars !== undefined ? Number(body.amount_ars) : ev.advance.advance_limit.ars;
      if (!Number.isFinite(requested) || requested <= 0) return send(res, 400, { error: "amount_ars must be a positive number" });
      if (ev.advance.advance_limit.ars !== null && requested > ev.advance.advance_limit.ars) {
        return send(res, 409, { error: "amount above suggested limit", limit_ars: ev.advance.advance_limit.ars, requested_ars: requested });
      }
      return send(res, 200, {
        mock: true,
        rail: "Twin ARGt (EVM) via partner API; simulated here",
        transfer: {
          asset: "ARGt",
          amount_ars: requested,
          from: body.from ?? "coop-treasury-wallet (mock)",
          to: body.to ?? "producer-wallet (mock)",
          reference: `${ev.evidence.content_sha256.slice(0, 16)}:${scenario}`,
          status: "simulated",
          settled_in_seconds: 3,
          note: "Repayment is deducted at delivery settlement; no on-chain loan.",
        },
        advance: ev.advance,
        evidence_sha256: ev.evidence.content_sha256,
      });
    }

    return send(res, 404, { error: "not found" });
  } catch (err) {
    const status = /must be|unknown scenario|invalid JSON|too large|amount_ars/.test(err.message) ? 400 : 500;
    return send(res, status, { error: err.message });
  }
});

server.listen(PORT, () => {
  console.log(`evidence-api listening on http://localhost:${PORT} (pack ${pack.pack_version}, publisher ${keypair ? keypair.publicKey.toBase58() : "none"})`);
});
