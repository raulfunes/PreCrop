// One-page committee report (markdown). What a coop credit committee signs:
// capacity (pre-sowing quota against the worst campaign), current condition
// (index, factors, suggested limit), sources, rule versions, evidence hash.
import { capacityFromOfficial } from "@precrop/score";
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
  const peaksByCampaign = new Map(peaks.map((p) => [p.campaign, p]));
  const official = pack.official?.campaigns ?? {};
  const cap = pack.history && pack.official ? capacityFromOfficial(pack.history, econ, pack.official) : null;
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
    L.push("| Campaña | Rinde oficial dpto. | Pico NDVI | Lluvia dic–feb | Lote / dpto. |");
    L.push("|---|---|---|---|---|");
    for (const r of cap.series) {
      const mark = r.campana === cap.worst_year?.campana ? " **(peor)**" : "";
      const peak = peaksByCampaign.get(r.campana);
      L.push(
        `| ${r.campana}${mark} | ${r.official_dpto_kg_ha === null ? "s/d" : r.official_dpto_kg_ha + " kg/ha"} | ${r.ndvi_peak === null ? "s/d" : r.ndvi_peak.toFixed(3)} | ${peak?.rain_dec_feb_mm == null ? "s/d" : peak.rain_dec_feb_mm + " mm"} | ${r.lote_vs_district === null ? "s/d" : r.lote_vs_district.toFixed(2)} |`,
      );
    }
    L.push("");
    L.push(`- Campañas pareadas: ${cap.representativeness.paired_campaigns}. Volatilidad del departamento: CV ${cap.district_volatility.cv}.`);
    L.push(`- **Peor campaña del departamento: ${cap.worst_year.campana}**, ${cap.worst_year.official_dpto_kg_ha} kg/ha (${cap.worst_year.yield_t_ha} t/ha), rinde publicado por el MAGyP, no estimado.`);
    if (cap.pre_sowing_limit.usd === null) {
      L.push(`- **Cupo pre-siembra: retenido.** ${cap.pre_sowing_limit.note} Motivos: ${cap.representativeness.reasons.join("; ")}.`);
    } else {
      L.push(`- **Cupo pre-siembra sugerido: ${fmtUsd(cap.pre_sowing_limit.usd)} (${fmtArs(cap.pre_sowing_limit.ars)})**. Fórmula: ${cap.pre_sowing_limit.formula}, haircut ${cap.reference.haircut}.`);
    }
    L.push(`- El lote sigue a su departamento (relación mediana ${cap.representativeness.lote_vs_district_median}, banda ${cap.representativeness.band.min}–${cap.representativeness.band.max}), que es lo que habilita usar el rinde departamental como piso. El NDVI habilita la regla; no multiplica el cupo.`);
    L.push("");
    L.push("_El cupo no se lee del satélite. Estimar toneladas desde el pico de NDVI (regla `capacidad-v1`) ubica el peor año en 2023/24 y no en 2022/23, con un error medio del 28,6 % contra los rindes oficiales: el pico mide canopia, no llenado de grano. Por eso el piso sale de la serie oficial y el NDVI solo verifica que el lote siga a su departamento._");
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
    if (a.advance_limit.usd === null) {
      L.push(`- **Límite de anticipo: retenido.** ${a.advance_limit.note}`);
    } else {
      L.push(`- Piso: peor campaña del departamento (${a.floor.campana}), ${a.floor.yield_t_ha} t/ha → ${fmtUsd(a.floor.value_usd)}. Techo tras haircut: ${fmtUsd(a.advance_limit.ceiling_usd)}.`);
      L.push(`- **Límite de anticipo sugerido: ${fmtUsd(a.advance_limit.usd)} (${fmtArs(a.advance_limit.ars)})**, ${a.advance_limit.pct_of_ceiling} % del techo. Nuevos desembolsos: **${a.advance_limit.new_disbursements}**.`);
    }
    L.push(`- Benchmark (porcentaje plano ${a.benchmark.flat_pct} %): ${fmtUsd(a.benchmark.usd)}.`);
  }
  L.push("");
  L.push(`_${pack.scenarios.scenarios[scenario].narrative_note}_`);
  L.push("");

  L.push("## 3. Reglas y versiones");
  L.push("");
  L.push(`- Índice de condición: \`${pack.scenarios.scoring.formula}\`; umbrales verde ≥ 70, amarillo 50–69, rojo < 50. NDVI normalizado con anclas ${pack.presets.normalization.ndvi_norm.ndvi_floor}–${pack.presets.normalization.ndvi_norm.ndvi_ceiling}; clima por tabla de lluvia de 7 días.`);
  L.push(`- Límite de anticipo: regla \`${ev.advance?.rule_version ?? "cupo-v2"}\`. Capacidad: regla \`${cap?.rule_version ?? "capacidad-v2"}\`. Hash de evidencia: \`${ev.evidence.canonicalization}\`. Pack \`${pack.pack_version}\`.`);
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
