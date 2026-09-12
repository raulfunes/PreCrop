// Pre-sowing capacity for the lote, serving both rules.
//
// ACTIVE: capacidad-v2. The limit is sized against the worst campaign the
// district actually had, as published by MAGyP, and NDVI only gates whether
// this lote tracks its district closely enough to borrow that figure.
//
// REPORTED ALONGSIDE: capacidad-v1, which estimates tons per campaign from
// peak NDVI. It is not the active rule because, contrasted against the
// official series, it puts the worst year on 2023/24 instead of 2022/23 and
// explains r2 0.43 of the official variance. A committee asking "why not
// just read the yield off the satellite" deserves the measured answer, so
// v1 is served rather than deleted -- with its own error-vs-official table,
// which is only populated now that data/rindes-oficiales.json exists.
import { capacity, capacityFromOfficial, CAPACITY_V2_RULE_VERSION } from "@precrop/score";
import { economicsInputs, historyPeaks } from "./pack.js";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

// Mock del cupo pre-siembra por superficie (data/capacity-mock.json). Activo por defecto:
// el numero real cruza la serie oficial del MAGyP con el NDVI historico, que para un lote
// dibujado en vivo depende de red y tarda. CAPACITY_MOCK=0 vuelve a la regla capacidad-v2.
//
// La tabla esta sembrada con la formula real del lote demo, asi que 100 ha sigue dando
// 45.173 USD. Solo reemplaza el monto: la serie, el peor año y la representatividad se
// siguen calculando y publicando, para que el informe al comite no quede vacio.
const MOCK_PATH = fileURLToPath(new URL("../../../data/capacity-mock.json", import.meta.url));
const capacityMock = JSON.parse(readFileSync(MOCK_PATH, "utf-8"));
const capacityMockOn = process.env.CAPACITY_MOCK !== "0";

/** Escalon mas cercano de la tabla; fuera de rango, el extremo. */
export function mockLimitUsd(ha) {
  if (!Number.isFinite(ha) || ha <= 0) return null;
  let best = null;
  for (const key of Object.keys(capacityMock.usd_by_ha)) {
    const step = Number(key);
    if (best === null || Math.abs(step - ha) < Math.abs(best - ha)) best = step;
  }
  return best === null ? null : { step_ha: best, usd: capacityMock.usd_by_ha[String(best)] };
}

/**
 * capacidad-v1 wants { [campaign]: t/ha }; data/rindes-oficiales.json stores
 * an array of rows in kg/ha. Convert here rather than in the rule, so the
 * published file keeps the unit its source publishes.
 */
export function officialYieldsTHa(official) {
  const out = {};
  for (const row of official?.campaigns ?? []) {
    const key = row.campana ?? row.campaign;
    const kg = row.rinde_dpto_kg_ha;
    if (key && kg !== null && kg !== undefined) out[key] = kg / 1000;
  }
  return out;
}

export function buildCapacity(pack) {
  const econ = economicsInputs(pack.economics);
  const active = capacityFromOfficial(pack.history, econ, pack.official);

  // v1 over the same peaks, now with the official yields wired in so its
  // contrast table and mean absolute error are actually computed.
  const peaks = historyPeaks(pack.history);
  const direct = peaks.length ? capacity(peaks, econ, officialYieldsTHa(pack.official)) : null;

  if (capacityMockOn) {
    const mocked = mockLimitUsd(econ.ha);
    if (mocked) {
      const fx = econ.fx_ars_per_usd ?? null;
      active.pre_sowing_limit = {
        ...active.pre_sowing_limit,
        usd: mocked.usd,
        ars: fx === null ? null : Math.round(mocked.usd * fx),
        status: "allowed",
        source: "mock",
        mock: true,
        step_ha: mocked.step_ha,
        ha: econ.ha,
        formula: `tabla fija por superficie (${capacityMock.rule_version}): ${econ.ha} ha -> escalon de ${mocked.step_ha} ha`,
        // Lo que la regla real habria publicado, para que la diferencia quede auditable.
        usd_if_representative: active.pre_sowing_limit?.usd_if_representative ?? null,
      };
    }
  }

  return {
    pack_version: pack.pack_version,
    lote_id: pack.presets.lote_id,
    rule_version: CAPACITY_V2_RULE_VERSION,
    generated_from: {
      history_generated_at_utc: pack.history?.generated_at_utc ?? null,
      method: pack.history?.method ?? null,
    },
    capacity: active,
    rejected_alternative: direct
      ? {
          rule_version: direct.rule_version,
          approach: "estimate tons per campaign from peak NDVI, take the minimum",
          worst_campaign: direct.worst_campaign,
          stability: direct.stability,
          contrast_official: direct.contrast_official,
          usd_it_would_have_published: direct.pre_sowing_quota.usd,
          note:
            "kept as evidence of why the limit is not read off the satellite; this number is not the published limit",
        }
      : null,
    sources: {
      history: {
        refs: pack.history?.method?.refs ?? [],
        generated_at_utc: pack.history?.generated_at_utc ?? null,
      },
      official: {
        refs: pack.official?.method?.refs ?? [],
        license: pack.official?.license ?? null,
        generated_at_utc: pack.official?.generated_at_utc ?? null,
      },
    },
    disclaimer:
      "MOCK/demo. Capacity sizes a pre-sowing advance against the worst campaign on record for the district. It is a transparent rule over published yields, not a yield model and not a credit score.",
  };
}
