// PreCrop evidence API. Zero framework: node:http only.
//   GET  /health                -> { ok, pack_version, publisher }
//   GET  /pack                  -> list of public pack files
//   GET  /pack/<name>           -> raw JSON from data/ (whitelisted)
//   GET  /capacity              -> per-campaign series, worst year, pre-sowing limit
//   POST /score   { scenario, weeds_pct? }  -> score + evidence payload + sha256
//   POST /publish { scenario, weeds_pct? }  -> same + Solana memo tx (oracle)
import { createServer } from "node:http";
import { existsSync } from "node:fs";
import { capacity } from "@precrop/score";
import { loadPack, readPublicFile, PUBLIC_FILES, economicsInputs, historyPeaks } from "./pack.js";
import { buildEvidence, memoText } from "./evidence.js";
import { buildCapacity } from "./capacity.js";
import { committeeReport } from "./report.js";
import { registerDemo, resolveDemoDepartment, getLot, listLots, createLot } from "./lotes.js";
import { loadState, describeState, approveQuota, recordPhoto, clearPhotos, resetState, requestDisbursement, resolvePointByGps } from "./state.js";
import { loadKeypair, publishMemo, publisherBalanceSol, DEFAULT_RPC_URL } from "./memo.js";

const PORT = Number(process.env.PORT ?? 8787);
const RPC_URL = process.env.RPC_URL ?? DEFAULT_RPC_URL;
const KEYPAIR_PATH = process.env.PUBLISHER_KEYPAIR ?? ".keys/publisher.json";

const pack = loadPack();
registerDemo(pack);
resolveDemoDepartment(pack)
  .then((r) => r && console.log(`[lotes] demo lot department resolved live: ${r.departamento} (committed file: ${r.committed ?? "n/a"}); worst official ${r.worst.campana} ${r.worst.rinde_dpto_kg_ha} kg/ha`))
  .catch((err) => console.log(`[lotes] demo department not resolved (offline?): ${err.message}; using committed rindes-oficiales.json`));
const keypair = existsSync(KEYPAIR_PATH) ? loadKeypair(KEYPAIR_PATH) : null;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
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
    if (req.method === "DELETE" && !url.pathname.startsWith("/lotes/")) return send(res, 405, { error: "method not allowed" });

    // ---- lots: the committed demo lot plus lots built live from a polygon.
    // Every other route accepts ?lote=<id> and defaults to the demo lot.
    if (req.method === "GET" && url.pathname === "/lotes") {
      return send(res, 200, { default: pack.presets.lote_id, lotes: listLots().map((l) => ({ ...l, state: describeState(getLot(l.id), loadState(l.id)).next })) });
    }
    // ---- two-role workflow: /lotes/<id>/{state,approve,photos,disburse}
    const wf = /^\/lotes\/([^/]+)\/(state|approve|photos|disburse|locate)$/.exec(url.pathname);
    if (wf) {
      const one = getLot(wf[1]);
      if (!one) return send(res, 404, { error: "unknown lote" });
      const state = loadState(one.lote.id);
      const scenario = url.searchParams.get("scenario") ?? "bueno";
      try {
        if (wf[2] === "locate" && req.method === "GET") {
          const lat = Number(url.searchParams.get("lat")), lon = Number(url.searchParams.get("lon"));
          if (!Number.isFinite(lat) || !Number.isFinite(lon)) return send(res, 400, { error: "lat and lon query params are required" });
          return send(res, 200, resolvePointByGps(one, lat, lon));
        }
        if (wf[2] === "state" && req.method === "GET") return send(res, 200, describeState(one, state, scenario));
        if (wf[2] === "state" && req.method === "DELETE") return send(res, 200, describeState(one, resetState(one.lote.id), scenario));
        if (wf[2] === "approve" && req.method === "POST") return send(res, 200, describeState(one, approveQuota(one, state, await readBody(req)), scenario));
        if (wf[2] === "photos" && req.method === "POST") {
          const body = await readBody(req);
          return send(res, 200, describeState(one, recordPhoto(one, state, body), body.scenario ?? scenario));
        }
        if (wf[2] === "photos" && req.method === "DELETE") return send(res, 200, describeState(one, clearPhotos(state), scenario));
        if (wf[2] === "disburse" && req.method === "POST") {
          const body = await readBody(req);
          const r = requestDisbursement(one, state, body);
          return send(res, r.status, { mock: true, ...r });
        }
      } catch (err) {
        return send(res, err.status ?? 500, { error: err.message });
      }
      return send(res, 405, { error: "method not allowed" });
    }

    if (req.method === "GET" && url.pathname.startsWith("/lotes/")) {
      const one = getLot(url.pathname.slice("/lotes/".length));
      if (!one) return send(res, 404, { error: "unknown lote" });
      return send(res, 200, { lote: one.lote, geometry: one.geometry ?? null, presets: one.presets, points: one.points.points, official: one.official, history: one.history, state: describeState(one, loadState(one.lote.id)) });
    }
    if (req.method === "POST" && url.pathname === "/lotes") {
      const body = await readBody(req);
      const started = Date.now();
      const created = await createLot(body, pack, (p) => console.log("[lotes]", JSON.stringify(p)));
      const bueno = buildEvidence("bueno", created);
      const malo = buildEvidence("malo", created);
      return send(res, 201, {
        lote: created.lote,
        elapsed_s: Math.round((Date.now() - started) / 100) / 10,
        scenario_campaign: created.presets.scenario_campaign,
        capacity: buildCapacity(created),
        condition: {
          bueno: { date: bueno.evidence.payload.observed_date, ndvi: bueno.inputs.ndvi, rain_mm_7d: bueno.inputs.rain_mm_7d, index: bueno.result.score_exact, light: bueno.result.light, advance: bueno.advance?.advance_limit ?? null },
          malo: { date: malo.evidence.payload.observed_date, ndvi: malo.inputs.ndvi, rain_mm_7d: malo.inputs.rain_mm_7d, index: malo.result.score_exact, light: malo.result.light, advance: malo.advance?.advance_limit ?? null },
        },
        points: created.points.points,
        history: created.history.campaigns.map((c) => ({ campaign: c.campaign, peak: c.peak?.ndvi ?? null, min: c.min?.ndvi ?? null, rain_dec_feb_mm: c.rain_dec_feb_mm ?? null })),
        official: created.official.campaigns,
      });
    }

    const lot = getLot(url.searchParams.get("lote"), pack.presets.lote_id);
    if (!lot) return send(res, 404, { error: `unknown lote '${url.searchParams.get("lote")}'; see GET /lotes` });

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
      if (!lot.history) {
        return send(res, 503, { error: "no history for this lote; run scripts/build_history.py or POST /lotes" });
      }
      return send(res, 200, buildCapacity(lot));
    }

    if (req.method === "GET" && url.pathname.startsWith("/report/")) {
      const scenario = url.pathname.slice("/report/".length);
      if (!["bueno", "mixto", "malo"].includes(scenario)) return send(res, 400, { error: "scenario must be one of bueno | mixto | malo" });
      const q = url.searchParams;
      const md = committeeReport(scenario, lot, {
        weeds_pct: q.has("weeds_pct") ? Number(q.get("weeds_pct")) : undefined,
        signature: q.get("signature") ?? undefined,
        explorer_url: q.get("explorer_url") ?? undefined,
        publisher: keypair ? keypair.publicKey.toBase58() : undefined,
      });
      return send(res, 200, md, "text/markdown");

    }

    if (req.method === "POST" && url.pathname === "/score") {
      const { scenario, override } = parseScoreRequest(await readBody(req));
      return send(res, 200, buildEvidence(scenario, lot, override));
    }

    if (req.method === "POST" && url.pathname === "/publish") {
      if (!keypair) {
        return send(res, 503, {
          error: "no publisher keypair",
          hint: `run 'npm run keygen' or set PUBLISHER_KEYPAIR (looked for ${KEYPAIR_PATH})`,
        });
      }
      const { scenario, override } = parseScoreRequest(await readBody(req));
      const ev = buildEvidence(scenario, lot, override);
      const text = memoText(ev.evidence);
      const balance = await publisherBalanceSol(keypair, RPC_URL);
      if (balance < 0.001) {
        return send(res, 503, {
          error: "Firma en cadena no disponible en esta demo: la wallet publicadora no tiene SOL de devnet.",
          hint: `Cargar SOL en https://faucet.solana.com para ${keypair.publicKey.toBase58()} y reintentar. La evidencia y su hash ya estan calculados.`,
          publisher: keypair.publicKey.toBase58(),
          balance_sol: balance,
          evidence_sha256: ev.evidence.content_sha256,
          memo: text,
          mock: true,
        });
      }
      const tx = await publishMemo({ text, keypair, rpcUrl: RPC_URL });
      return send(res, 200, { ...ev, anchor: { network: RPC_URL, mock: true, ...tx } });
    }

    if (req.method === "POST" && url.pathname === "/disburse") {
      // MOCK of step 3 of the Twin flow: the coop sends the approved advance in ARGt
      // (peso stablecoin) to the producer's wallet. Twin exposes partner APIs, not a
      // public testnet, so this returns the shape of a transfer without moving anything.
      const body = await readBody(req);
      const { scenario, override } = parseScoreRequest(body);
      const ev = buildEvidence(scenario, lot, override);
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
