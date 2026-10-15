// econ.js — the unit economics every step shares.
// Sourced (S) values come from the Hyperscale Ledger (bakulbadwal/hyperscale-ledger, Scenario defaults):
//   GB200 NVL72 rack ≈ 120 kW for 72 GPUs, ≈ $3.0M per rack, 5-year GPU life, PUE 1.14, $0.0834/kWh, 250 MW IT.
// Teaching (T) values are round numbers chosen to make the lesson legible. They are labelled on the page.
// Per-deal compute pricing is not public (AI Deals Field Guide, "Do not quote without checking").

export const LEDGER = {
  rackKW: 120,          // S: GB200 NVL72, trade press figure the Ledger flags (NVIDIA publishes none)
  gpusPerRack: 72,      // S
  rackCostM: 3.0,       // S: $M per rack, all-in
  lifeYears: 5,         // S: Scenario default GPU useful life
  pue: 1.14,            // S
  powerPerMWh: 83.4,    // S: $/MWh = $0.0834/kWh
  campusItMW: 250,      // S
};

export const HOURS = 8760;

/** GPUs per MW of IT load: 1000 kW / (120 kW / 72 GPUs) = 600. */
export const gpusPerMW = (L = LEDGER) => 1000 / (L.rackKW / L.gpusPerRack);

/** Annual cost of 1 MW of IT capacity, in $M, split into its parts. */
export function costPerMWyr({ L = LEDGER, opexM = 1.5 } = {}) {
  const gpus = gpusPerMW(L);
  const capexM = gpus * (L.rackCostM / L.gpusPerRack);           // ≈ $25M per MW
  const depreciation = capexM / L.lifeYears;                      // ≈ $5.0M / yr
  const power = (1 * L.pue * HOURS * L.powerPerMWh) / 1e6;        // ≈ $0.83M / yr
  return { capexM, depreciation, power, opex: opexM, total: depreciation + power + opexM };
}

/** Annual revenue of 1 MW sold at $p per GPU-hour with a billed fraction u, in $M. */
export const revenuePerMWyr = (p, u, L = LEDGER) => (p * HOURS * gpusPerMW(L) * u) / 1e6;

/** $M per MW-year  →  $ per GPU-hour equivalent (100% billed). Used to translate shadow prices. */
export const perMWyrToGpuHr = (m, L = LEDGER) => (m * 1e6) / (HOURS * gpusPerMW(L));

export const fmt = {
  m: (x, d = 2) => (x === Infinity ? "∞" : x === -Infinity ? "−∞" : `$${(+x).toFixed(d)}M`),
  num: (x, d = 1) => (x === Infinity ? "∞" : x === -Infinity ? "−∞" : (+x).toFixed(d)),
  mw: (x, d = 0) => (x === Infinity ? "∞" : `${(+x).toFixed(d)} MW`),
  pct: (x, d = 0) => `${(100 * x).toFixed(d)}%`,
  gpuhr: x => `$${(+x).toFixed(2)}/GPU-hr`,
};
