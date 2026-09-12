// Per-lot workflow state for the two-role demo:
//   coop approves a pre-sowing quota  ->  producer uploads photos at >= 3 points
//   -> producer requests a disbursement -> condition gate decides -> mock Twin payout.
// Persisted as data/lotes/<id>.state.json (gitignored), reloaded on restart.
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { computeScore } from "@precrop/score";
import { DATA_DIR } from "./pack.js";
import { buildEvidence } from "./evidence.js";
import { buildCapacity } from "./capacity.js";

const STATE_DIR = join(DATA_DIR, "lotes");
const round = (x, d) => Math.round(x * 10 ** d) / 10 ** d;
const now = () => new Date().toISOString().slice(0, 19) + "Z";

function statePath(id) {
  return join(STATE_DIR, `${id}.state.json`);
}

export function loadState(id) {
  const p = statePath(id);
  if (existsSync(p)) return JSON.parse(readFileSync(p, "utf8"));
  return { lote_id: id, approved: null, photos: {}, disbursements: [], created_at_utc: now() };
}

function saveState(state) {
  mkdirSync(STATE_DIR, { recursive: true });
  state.updated_at_utc = now();
  writeFileSync(statePath(state.lote_id), JSON.stringify(state, null, 2) + "\n", "utf8");
  return state;
}

function median(values) {
  const s = [...values].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/** Derived view of a lot's state: photos, weeds median, what the producer can do next. */
export function describeState(lot, state, scenario = "bueno") {
  const protocol = lot.points.protocol ?? { min_points_for_score: 3, aggregation: "median" };
  const minPoints = protocol.min_points_for_score ?? 3;
  const assessed = Object.entries(state.photos).filter(([, p]) => Number.isFinite(p.weeds_pct));
  const weedsMedian = assessed.length ? round(median(assessed.map(([, p]) => p.weeds_pct)), 1) : null;
  const paid = round(state.disbursements.filter((d) => d.status === "paid").reduce((a, d) => a + d.amount_usd, 0), 0);
  const quota = state.approved?.quota_usd ?? null;

  let preview = null;
  if (quota !== null && weedsMedian !== null && assessed.length >= minPoints) {
    const ev = buildEvidence(scenario, lot, { weeds_pct: weedsMedian, weeds_source: "estimated" });
    const released = round(quota * (ev.result.score_exact / 100), 0);
    const available = ev.result.light === "rojo" ? 0 : Math.max(0, released - paid);
    preview = {
      scenario,
      inputs: ev.inputs,
      index: ev.result.score_exact,
      light: ev.result.light,
      released_usd: released,
      paid_usd: paid,
      available_usd: available,
      can_withdraw: available > 0 && ev.result.light !== "rojo",
      factors: ev.factors,
      evidence_sha256: ev.evidence.content_sha256,
    };
  }

  return {
    lote_id: state.lote_id,
    approved: state.approved,
    photos: state.photos,
    photos_assessed: assessed.length,
    min_points_for_score: minPoints,
    weeds_median_pct: weedsMedian,
    disbursements: state.disbursements,
    paid_usd: paid,
    remaining_quota_usd: quota === null ? null : Math.max(0, round(quota - paid, 0)),
    next: quota === null
      ? { step: "coop_approval", message: "La coop todavia no aprobo el cupo de este lote." }
      : assessed.length < minPoints
        ? { step: "photos", message: `Faltan fotos: ${assessed.length} de ${minPoints} puntos con foto.` }
        : { step: "request_disbursement", message: preview?.can_withdraw ? "Puede solicitar el desembolso." : "Condicion desfavorable: no hay desembolso disponible." },
    preview,
  };
}

export function approveQuota(lot, state, body = {}) {
  const cap = buildCapacity(lot);
  const capBlock = cap.capacity ?? cap;
  const ceiling = capBlock.pre_sowing_limit?.usd ?? null;
  if (ceiling === null) throw Object.assign(new Error("capacity could not establish a floor for this lote; nothing to approve"), { status: 409 });
  const requested = body.quota_usd === undefined ? ceiling : Number(body.quota_usd);
  if (!Number.isFinite(requested) || requested <= 0) throw Object.assign(new Error("quota_usd must be a positive number"), { status: 400 });
  if (requested > ceiling) throw Object.assign(new Error(`quota_usd ${requested} exceeds the suggested pre-sowing quota ${ceiling}`), { status: 409 });
  state.approved = {
    quota_usd: round(requested, 0),
    suggested_usd: ceiling,
    worst_official_campaign: capBlock.worst_year?.campana ?? null,
    approved_by: body.approved_by ?? "comite (demo)",
    note: body.note ?? null,
    at: now(),
  };
  return saveState(state);
}

export function recordPhoto(lot, state, body = {}) {
  const ids = new Set(lot.points.points.map((p) => p.point_id));
  if (!ids.has(body.point_id)) throw Object.assign(new Error(`point_id must be one of ${[...ids].join(", ")}`), { status: 400 });
  const w = Number(body.weeds_pct);
  if (!Number.isFinite(w) || w < 0 || w > 100) throw Object.assign(new Error("weeds_pct must be a number between 0 and 100"), { status: 400 });
  state.photos[body.point_id] = {
    weeds_pct: round(w, 2),
    confidence: body.confidence ?? null,
    source: body.source ?? "model",
    model: body.model ?? null,
    file: body.file ?? null,
    synthetic: Boolean(body.synthetic),
    at: now(),
  };
  return saveState(state);
}

/** Demo reset: forget approval, photos and disbursements of a lot. */
export function resetState(id) {
  const p = statePath(id);
  if (existsSync(p)) unlinkSync(p);
  return loadState(id);
}

export function clearPhotos(state) {
  state.photos = {};
  return saveState(state);
}

export function requestDisbursement(lot, state, body = {}) {
  const scenario = body.scenario ?? "bueno";
  const view = describeState(lot, state, scenario);
  const reject = (reason, extra = {}) => {
    const d = { n: state.disbursements.length + 1, at: now(), scenario, status: "rejected", reason, weeds_median_pct: view.weeds_median_pct, index: view.preview?.index ?? null, light: view.preview?.light ?? null, amount_usd: 0, ...extra };
    state.disbursements.push(d);
    saveState(state);
    return { status: 409, receipt: d, state: describeState(lot, state, scenario) };
  };
  if (!state.approved) return reject("La coop no aprobo el cupo de este lote.");
  if (view.photos_assessed < view.min_points_for_score) return reject(`Faltan fotos: ${view.photos_assessed} de ${view.min_points_for_score} puntos.`);
  const p = view.preview;
  if (p.light === "rojo") return reject(`Condicion desfavorable (indice ${p.index}, rojo): desembolso bloqueado.`, { evidence_sha256: p.evidence_sha256 });
  if (p.available_usd <= 0) return reject("Sin cupo disponible: lo liberado por condicion ya fue desembolsado.", { evidence_sha256: p.evidence_sha256 });
  const requested = body.amount_usd === undefined ? p.available_usd : Number(body.amount_usd);
  if (!Number.isFinite(requested) || requested <= 0) throw Object.assign(new Error("amount_usd must be a positive number"), { status: 400 });
  if (requested > p.available_usd) return reject(`Monto ${requested} supera lo disponible ${p.available_usd}.`, { evidence_sha256: p.evidence_sha256 });
  const fx = lot.economics.price.fx_ars_per_usd ?? null;
  const d = {
    n: state.disbursements.length + 1,
    at: now(),
    scenario,
    status: "paid",
    weeds_median_pct: view.weeds_median_pct,
    index: p.index,
    light: p.light,
    amount_usd: round(requested, 0),
    amount_ars: fx ? round(requested * fx, 0) : null,
    rail: "Twin ARGt (mock)",
    reference: `${p.evidence_sha256.slice(0, 16)}:${scenario}:${state.disbursements.length + 1}`,
    evidence_sha256: p.evidence_sha256,
    note: p.light === "amarillo" ? "condicion en observacion: desembolso con revision" : null,
  };
  state.disbursements.push(d);
  saveState(state);
  return { status: 200, receipt: d, state: describeState(lot, state, scenario) };
}
