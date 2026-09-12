// One-page committee report (markdown). What a coop credit committee signs:
// capacity (pre-sowing quota against the worst campaign), current condition
// (index, factors, suggested limit), sources, rule versions, evidence hash.
import { capacity } from "@precrop/score";
import { buildEvidence, memoText } from "./evidence.js";
import { economicsInputs, historyPeaks } from "./pack.js";

const LIGHT = { verde: "VERDE", amarillo: "AMARILLO", rojo: "ROJO" };
const fmtUsd = (n) => (n === null || n === undefined ? "s/d" : `USD ${Math.round(n).toLocaleString("es-AR")}`);
const fmtArs = (n) => (n === null || n === undefined ? "s/d" : `$ ${Math.round(n).toLocaleString("es-AR")}`);

/**
 * @param {string} scenario bueno | mixto | malo
 * @param {object} pack from loadPack()
 * @param {{ weeds_pct?: number, signature?: string, explorer_url?: string, publisher?: string }} [opts]
 */
export function committeeReport(scenario, pack, opts = {}) {
  const override = opts.weeds_pct === undefined ? {} : { weeds_pct: opts.weeds_pct };
  const ev = buildEvidence(scenario, pack, override);
  const econ = economicsInputs(pack.economics);
  const peaks = historyPeaks(pack.history);
  const official = pack.official?.campaigns ?? {};
  const cap = peaks.length ? capacity(peaks, econ, official) : null;
  const sat = pack.presets.presets[pack.scenarios.scenarios[scenario].satellite_preset];
  const today = new Date().toISOString().slice(0, 10);
  const L = [];

  L.push(`# Informe de evidencia del lote — ${pack.presets.nombre}`);
  L.push("");
  L.push(`Lote \`${pack.presets.lote_id}\` · ${pack.presets.ha} ha · ${pack.presets.cultivo} · emitido ${today} · pack ${pack.pack_version} · **MOCK / demo**`);
  L.push("");
  L.push("Este informe no es un score crediticio. Estima la producción del lote con reglas a la vista y sugiere un límite de anticipo. La decisión es del comité.");
  L.push("");

  L.push("## 1. Capacidad: cuánto produce este lote en un año malo");
  L.push("");
  if (!cap) {
    L.push("_Sin historial cargado (`data/lote-history.json`)._");
  } else {
    L.push("| Campaña | Pico NDVI | Mín. en ventana | Lluvia dic–feb | Rinde estimado | Rinde oficial | Desvío |");
    L.push("|---|---|---|---|---|---|---|");
    for (const r of cap.campaigns) {
      const mark = r.campaign === cap.worst_campaign.campaign ? " **(peor)**" : "";
      L.push(
        `| ${r.campaign}${mark} | ${r.ndvi.toFixed(3)} | ${r.ndvi_min_in_window === null ? "s/d" : r.ndvi_min_in_window.toFixed(3)} | ${r.rain_dec_feb_mm === null ? "s/d" : r.rain_dec_feb_mm + " mm"} | ${r.yield_est_t_ha.toFixed(2)} t/ha | ${r.official_yield_t_ha === null ? "s/d" : r.official_yield_t_ha.toFixed(2) + " t/ha"} | ${r.error_vs_official_pct === null ? "s/d" : r.error_vs_official_pct + " %"} |`,
      );
    }
    L.push("");
    L.push(`- Campañas evaluadas: ${cap.n_campaigns}. Rinde medio estimado: ${cap.mean_yield_t_ha} t/ha. Estabilidad: ${cap.stability.label} (CV ${cap.stability.cv_pct} %).`);
    L.push(`- **Peor campaña: ${cap.worst_campaign.campaign}**, ${cap.worst_campaign.yield_est_t_ha} t/ha → ${cap.worst_campaign.tons_est} t.`);
    L.push(`- **Cupo pre-siembra sugerido: ${fmtUsd(cap.pre_sowing_quota.usd)} (${fmtArs(cap.pre_sowing_quota.ars)})**, ${cap.pre_sowing_quota.pct_of_reference_value} % del valor de referencia. Fórmula: ${cap.pre_sowing_quota.formula}, haircut ${cap.pre_sowing_quota.haircut}.`);
    L.push(`- Contraste oficial: ${cap.contrast_official.campaigns_with_official ? `${cap.contrast_official.campaigns_with_official} campañas, error medio ${cap.contrast_official.mean_abs_error_pct} %` : "pendiente (falta data/rindes-oficiales.json)"}.`);
    L.push("");
    L.push("_El pico de NDVI mide canopia, no llenado de grano: una seca de enero puede verse en la columna \"mín. en ventana\" y no en el pico. Por eso el contraste con los rindes oficiales no es decorativo._");
  }
  L.push("");

  L.push(`## 2. Condición actual: escenario \`${scenario}\``);
  L.push("");
  L.push(`Escena ${sat.sentinel2.scene_id} del ${sat.date}. Índice de condición **${ev.result.score_exact}** → **${LIGHT[ev.result.light]}**.`);
  L.push("");
  L.push("| Factor | Valor | Peso | Aporte | Fuente |");
  L.push("|---|---|---|---|---|");
  for (const f of ev.factors) L.push(`| ${f.label} | ${f.value} | ${f.weight} | ${f.contribution} | ${f.source} |`);
  L.push("");
  if (ev.advance) {
    const a = ev.advance;
    L.push(`- Producción estimada a esta condición: ${a.production_estimate.tons} t (${a.production_estimate.yield_t_ha} t/ha).`);
    L.push(`- **Límite de anticipo sugerido: ${fmtUsd(a.advance_limit.usd)} (${fmtArs(a.advance_limit.ars)})**, ${a.advance_limit.pct_of_reference_value} % del valor de referencia. Nuevos desembolsos: **${a.advance_limit.new_disbursements}**.`);
    L.push(`- Benchmark (porcentaje plano ${a.benchmark.flat_pct} %): ${fmtUsd(a.benchmark.usd)}.`);
  }
  L.push("");
  L.push(`_${pack.scenarios.scenarios[scenario].narrative_note}_`);
  L.push("");

  L.push("## 3. Reglas y versiones");
  L.push("");
  L.push(`- Índice de condición: \`${pack.scenarios.scoring.formula}\`; umbrales verde ≥ 70, amarillo 50–69, rojo < 50. NDVI normalizado con anclas ${pack.presets.normalization.ndvi_norm.ndvi_floor}–${pack.presets.normalization.ndvi_norm.ndvi_ceiling}; clima por tabla de lluvia de 7 días.`);
  L.push(`- Límite de anticipo: regla \`${ev.advance?.rule_version ?? "cupo-v1"}\`. Capacidad: regla \`${cap?.rule_version ?? "capacidad-v1"}\`. Hash de evidencia: \`${ev.evidence.canonicalization}\`. Pack \`${pack.pack_version}\`.`);
  L.push("");

  L.push("## 4. Evidencia y firma");
  L.push("");
  L.push(`- sha256 del informe de evidencia: \`${ev.evidence.content_sha256}\``);
  L.push(`- Texto anclado: \`${memoText(ev.evidence)}\``);
  if (opts.signature) L.push(`- Firma en Solana devnet: \`${opts.signature}\`${opts.explorer_url ? ` — ${opts.explorer_url}` : ""}`);
  if (opts.publisher) L.push(`- Wallet publicadora: \`${opts.publisher}\``);
  L.push("");

  L.push("## 5. Fuentes");
  L.push("");
  L.push(`- NDVI: ${pack.presets.ndvi_method ?? "Sentinel-2 L2A, Planetary Computer"} (medido). Lluvia: Open-Meteo archive (medido). Malezas: ${ev.evidence.payload.weeds_source}.`);
  L.push(`- Rinde de referencia ${econ.yield_ref_t_ha} t/ha (${pack.economics.yield_ref_t_ha.source}). Precio ${pack.economics.price.ars_t.toLocaleString("es-AR")} $/t pizarra Rosario ${pack.economics.price.date}, dólar ${econ.fx_ars_per_usd} (${pack.economics.price.source}). Haircut ${econ.haircut} (${pack.economics.haircut.source}).`);
  if (pack.history) L.push(`- Historial: ${pack.history.method.satellite}. ${pack.history.method.caveat}`);
  if (pack.official?.source) L.push(`- Rindes oficiales: ${pack.official.source}.`);
  L.push("");

  L.push("## 6. Decisión del comité");
  L.push("");
  L.push("| | |");
  L.push("|---|---|");
  L.push("| Cupo aprobado | |");
  L.push("| Condición para el próximo desembolso | |");
  L.push("| Firmas | |");
  L.push("| Fecha | |");
  L.push("");
  return L.join("\n") + "\n";
}
