// models.js — pure model builders for every step. No DOM. The page and the tests both call these.
import { Model } from "./lp.js";
import { LEDGER, costPerMWyr, revenuePerMWyr } from "./econ.js";

/* ───────────────────────────── Step 0 · Three questions ─────────────────────────────
   Seat: you run a 250 MW neocloud campus. Two products, so the floor plan is a polygon.
   T = MW leased to a lab for training (reserved, billed 100%)
   I = MW sold as inference cloud (billed at its utilization)                                   */
export const S0 = {
  pTrain: 1.90, uTrain: 1.00,    // T: $/GPU-hr, billed fraction
  pInfer: 3.40, uInfer: 0.62,    // T
  opexM: 1.5,                    // T: staff, network, facility, $M per MW-yr
  grid: 250,                     // S: IT MW the grid connection supports (Ledger campus)
  inferDemand: 140,              // T: MW of inference the market will buy this year
  fabric: 220,                   // T: spine-port units; training uses 1.0/MW, inference 0.4/MW
  anchor: 60,                    // T: MW already promised to the anchor lab (take-or-pay)
  walls: { grid: true, demand: true, fabric: true, anchor: true },
};

export function s0Margins(p = S0) {
  const c = costPerMWyr({ opexM: p.opexM }).total;
  return {
    T: revenuePerMWyr(p.pTrain, p.uTrain) - c,
    I: revenuePerMWyr(p.pInfer, p.uInfer) - c,
    cost: c,
  };
}

export function s0Model(p = S0) {
  const mg = s0Margins(p);
  const m = new Model("three-questions", "max");
  m.addVar("T", { cost: mg.T, label: "Training lease (MW)" });
  m.addVar("I", { cost: mg.I, label: "Inference cloud (MW)" });
  if (p.walls.grid) m.addRow("grid", { T: 1, I: 1 }, { ub: p.grid, label: "Grid connection" });
  if (p.walls.demand) m.addRow("demand", { I: 1 }, { ub: p.inferDemand, label: "Inference demand" });
  if (p.walls.fabric) m.addRow("fabric", { T: 1, I: 0.4 }, { ub: p.fabric, label: "Network fabric" });
  if (p.walls.anchor) m.addRow("anchor", { T: 1 }, { lb: p.anchor, label: "Anchor lease (floor)" });
  // Without every wall the region can be unbounded; a physical cap on halls keeps it finite.
  m.addRow("halls", { T: 1, I: 1 }, { ub: 400, label: "Hall shells (never binds by default)" });
  return m;
}

/* ───────────────────────────── Step 1 · The price of a wall ─────────────────────────────
   Same seat, full campus: six products, five physical walls, four market limits, one floor.   */
export const S1_PRODUCTS = [
  { id: "anchor",  label: "Anchor lab lease",          p: 1.90, u: 1.00, kind: "training",  cool: "liquid", fabric: 1.0, blackwell: true },
  { id: "lab2",    label: "Second lab, 2-yr lease",    p: 2.15, u: 1.00, kind: "training",  cool: "liquid", fabric: 1.0, blackwell: true },
  { id: "ent",     label: "Enterprise reserved inference", p: 2.55, u: 0.85, kind: "inference", cool: "air",    fabric: 0.3, blackwell: false },
  { id: "api",     label: "On-demand inference API",   p: 3.40, u: 0.62, kind: "inference", cool: "liquid", fabric: 0.3, blackwell: true },
  { id: "batch",   label: "Batch & fine-tuning",       p: 1.55, u: 0.92, kind: "batch",     cool: "air",    fabric: 0.5, blackwell: false },
  { id: "sov",     label: "Sovereign cloud contract",  p: 2.45, u: 1.00, kind: "sovereign", cool: "liquid", fabric: 0.4, blackwell: true, extraOpex: 0.6 },
];

export const S1 = {
  opexM: 1.5,
  gridMW: 285,          // S: grid connection in MW at the fence (250 MW IT × PUE 1.14)
  pue: 1.14,            // S
  liquidMW: 215,        // T: liquid-cooled hall capacity (IT MW)
  airMW: 95,            // T: air-cooled hall capacity (IT MW, H100/H200 generation)
  fabric: 205,          // T: spine-port units
  blackwellK: 116,      // T: thousand Blackwell GPUs delivered this year (≈193 MW at 600 GPU/MW)
  demand: { lab2: 70, ent: 70, api: 75, batch: 120, sov: 45 }, // T: MW each market will take
  anchorFloor: 80,      // T: MW contracted to the anchor lab (take-or-pay floor)
  offers: {},           // step 1c: {offerId: true} — buy-the-wall options switched on
};

/** Step 1c: four ways to move the grid wall. Sizes in grid MW (at the fence), prices in $M per grid-MW-yr. */
export const S1_OFFERS = [
  { id: "substation", label: "Substation upgrade",         size: 40, price: 0.55, note: "Utility-funded upgrade, amortized; you pay a contribution in aid of construction." },
  { id: "pue",        label: "Cooling retrofit, PUE 1.14 → 1.10", size: 10.4, price: 0.40, note: "Frees ≈9.1 MW of IT inside the same 285 MW (Ledger: Below the rack)." },
  { id: "gas",        label: "Behind-the-meter gas turbines", size: 30, price: 1.90, note: "Fast, but you pay fuel and turbine capex on top of the grid price." },
  { id: "flex",       label: "Flexible-load agreement",   size: 25, price: 2.60, note: "Utility grants firm headroom if you curtail at system peaks." },
];

export function s1Margins(p = S1) {
  const c = costPerMWyr({ opexM: p.opexM }).total;
  const out = {};
  for (const q of S1_PRODUCTS) out[q.id] = revenuePerMWyr(q.p, q.u) - c - (q.extraOpex || 0);
  return out;
}

export function s1Model(p = S1) {
  const mg = s1Margins(p);
  const m = new Model("price-of-a-wall", "max");
  for (const q of S1_PRODUCTS) m.addVar(q.id, { cost: mg[q.id], label: q.label });
  const all = Object.fromEntries(S1_PRODUCTS.map(q => [q.id, p.pue]));
  const buys = S1_OFFERS.filter(o => p.offers[o.id]);
  for (const o of buys) m.addVar("buy_" + o.id, { cost: -o.price, ub: o.size, label: "Buy: " + o.label });
  const gridTerms = { ...all };
  for (const o of buys) gridTerms["buy_" + o.id] = -1;
  m.addRow("grid", gridTerms, { ub: p.gridMW, label: "Grid connection (MW at the fence)" });
  m.addRow("liquid", Object.fromEntries(S1_PRODUCTS.filter(q => q.cool === "liquid").map(q => [q.id, 1])), { ub: p.liquidMW, label: "Liquid-cooled halls (MW)" });
  m.addRow("air", Object.fromEntries(S1_PRODUCTS.filter(q => q.cool === "air").map(q => [q.id, 1])), { ub: p.airMW, label: "Air-cooled halls (MW)" });
  m.addRow("fabric", Object.fromEntries(S1_PRODUCTS.map(q => [q.id, q.fabric])), { ub: p.fabric, label: "Network fabric (spine units)" });
  m.addRow("gpus", Object.fromEntries(S1_PRODUCTS.filter(q => q.blackwell).map(q => [q.id, 0.6])), { ub: p.blackwellK, label: "Blackwell deliveries (k GPUs)" });
  for (const [id, d] of Object.entries(p.demand)) m.addRow("mkt_" + id, { [id]: 1 }, { ub: d, label: "Market: " + S1_PRODUCTS.find(q => q.id === id).label });
  m.addRow("floor", { anchor: 1 }, { lb: p.anchorFloor, label: "Anchor take-or-pay floor" });
  return m;
}

/* ───────────────────────────── Step 2 · The capacity ladder ─────────────────────────────
   Seat: compute strategy at a lab. 12 quarters. Build (long lead, cheapest per quarter),
   neocloud lease (short lead, fixed term), spot (no lead, expensive, thin).                     */
export const QUARTERS = Array.from({ length: 24 }, (_, i) => `Q${(i % 4) + 1} '${27 + Math.floor(i / 4)}`);

export const S2 = {
  T: 12,                // quarters you act on and see
  window: 12,           // quarters the model plans over
  base: 170,            // T: MW of compute the lab needs in Q1 '27
  growth: 0.10,         // T: quarter-on-quarter demand growth
  owned: 120,           // T: MW on the lab's own campus, already built (sunk)
  legacyLease: 60,      // T: MW of an old lease that expires after Q4 '27
  legacyEnds: 4,
  buildLead: 6,         // T: quarters from decision to energized (power + build)
  buildCost: 1.833,     // S-derived: $M per MW-quarter (depreciation + power + opex ÷ 4)
  buildLife: 20,        // S: 5-year life, in quarters
  leaseLead: 2,         // AI Deals §3: neocloud capacity in 2-ish quarters when power is in hand
  leaseTerm: 8,         // AI Deals §3: 2–6-year tranches; 2 years here
  leaseCost: 2.60,      // T: $M per MW-quarter (≈ $1.98 per GPU-hour)
  spotCost: 4.20,       // T: $M per MW-quarter (≈ $3.20 per GPU-hour)
  spotCap: 40,          // T: MW of spot the market will sell you in a quarter
  shortCost: 9.0,       // T: $M per MW-quarter of demand you can't serve (lost margin + delay)
  floor: 150,           // T: board-signed take-or-pay: hold ≥ this many leased MW ...
  floorFrom: 3, floorTo: 6, // ... in quarters 3–6 (1-based, inclusive)
  floorOn: true,
  tail: "ignore",       // "ignore" | "full": are quarters of a commitment past the window charged? (textbook = ignore)
};

export const s2Demand = (p = S2, n = Math.max(p.T, p.window)) => Array.from({ length: n }, (_, t) => p.base * Math.pow(1 + p.growth, t));

export function s2Model(p = S2) {
  const T = Math.max(p.T, p.window), D = s2Demand(p, T);
  const m = new Model("capacity-ladder", "min");
  // Cost of one MW of a commitment that starts being active in quarter a (1-based) and lasts L quarters,
  // given how quarters beyond the horizon are charged.
  const commitCost = (a, L, perQ) => {
    let inH = 0, tail = 0;
    for (let q = a; q < a + L; q++) (q <= T ? inH++ : tail++);
    return inH * perQ + (p.tail === "ignore" ? 0 : tail * perQ);
  };
  for (let t = 1; t <= T; t++) {
    const on = t + p.buildLead;                 // first active quarter
    if (on <= T) m.addVar(`build_${t}`, { cost: commitCost(on, p.buildLife, p.buildCost), label: `Build decided ${QUARTERS[t - 1]}` });
    const lon = t + p.leaseLead;
    if (lon <= T) m.addVar(`lease_${t}`, { cost: commitCost(lon, p.leaseTerm, p.leaseCost), label: `Lease signed ${QUARTERS[t - 1]}` });
    m.addVar(`spot_${t}`, { cost: p.spotCost, ub: p.spotCap, label: `Spot ${QUARTERS[t - 1]}` });
    m.addVar(`short_${t}`, { cost: p.shortCost, label: `Unserved ${QUARTERS[t - 1]}` });
  }
  for (let t = 1; t <= T; t++) {
    const terms = { [`spot_${t}`]: 1, [`short_${t}`]: 1 };
    for (let s = 1; s <= T; s++) {
      if (s + p.buildLead <= t && m._vi.has(`build_${s}`)) terms[`build_${s}`] = 1;
      if (s + p.leaseLead <= t && t < s + p.leaseLead + p.leaseTerm && m._vi.has(`lease_${s}`)) terms[`lease_${s}`] = 1;
    }
    const fixed = p.owned + (t <= p.legacyEnds ? p.legacyLease : 0);
    m.addRow(`demand_${t}`, terms, { lb: D[t - 1] - fixed, label: `Serve demand ${QUARTERS[t - 1]}` });
    if (p.floorOn && t >= p.floorFrom && t <= p.floorTo) {
      const lt = {};
      for (let s = 1; s <= T; s++) if (s + p.leaseLead <= t && t < s + p.leaseLead + p.leaseTerm && m._vi.has(`lease_${s}`)) lt[`lease_${s}`] = 1;
      const legacy = t <= p.legacyEnds ? p.legacyLease : 0;
      m.addRow(`floor_${t}`, lt, { lb: p.floor - legacy, label: `Take-or-pay floor ${QUARTERS[t - 1]}` });
    }
  }
  return m;
}

/** $M of commitments that run past the window: the part of the plan the objective never priced when tail = "ignore". */
export function s2Tail(p, r) {
  const T = Math.max(p.T, p.window); let usd = 0;
  for (let t = 1; t <= T; t++) {
    const b = r.x[`build_${t}`] || 0, l = r.x[`lease_${t}`] || 0;
    const bOn = t + p.buildLead, lOn = t + p.leaseLead;
    usd += b * Math.max(0, bOn + p.buildLife - 1 - T) * p.buildCost;
    usd += l * Math.max(0, lOn + p.leaseTerm - 1 - T) * p.leaseCost;
  }
  return usd;
}

/** Capacity by source in each quarter, for the stacked chart. */
export function s2Stack(p, r) {
  const T = Math.max(p.T, p.window), out = [];
  for (let t = 1; t <= T; t++) {
    let build = 0, lease = 0;
    for (let s = 1; s <= T; s++) {
      if (s + p.buildLead <= t) build += r.x[`build_${s}`] || 0;
      if (s + p.leaseLead <= t && t < s + p.leaseLead + p.leaseTerm) lease += r.x[`lease_${s}`] || 0;
    }
    out.push({ t, owned: p.owned, legacy: t <= p.legacyEnds ? p.legacyLease : 0, build, lease, spot: r.x[`spot_${t}`], short: r.x[`short_${t}`] });
  }
  return out;
}

/* ───────────────────────────── Step 3 · Who gets which GPUs ─────────────────────────────
   Seat: compute strategy at a lab. (a) pure assignment, (b) sized jobs on capacity-limited
   clusters (generalized assignment), (c) cost vs latency frontier.                             */
export const S3_TEAMS = ["Pretraining", "RL post-training", "Evals", "Code assistant", "Voice agent", "Enterprise API"];
export const S3_CLUSTERS = ["GB200 · Iowa", "H100 · Virginia", "TPU · Oregon", "Trainium · Ohio", "Neocloud · Texas", "H200 · Frankfurt"];
// $M per quarter for team i on cluster j (T). Big numbers = poor fit (software stack, interconnect, region).
export const S3_COST = [
  [ 9.0, 14.5, 11.0, 12.5, 10.5, 15.0],
  [ 7.5,  8.0,  9.5,  9.0,  7.0, 10.5],
  [ 4.0,  3.0,  4.5,  3.5,  3.5,  4.0],
  [ 6.0,  5.5,  7.5,  6.5,  5.0,  6.5],
  [ 5.5,  4.5,  6.5,  6.0,  5.5,  4.0],
  [ 6.5,  5.0,  5.5,  4.5,  6.0,  5.5],
];

export function s3AssignModel(cost = S3_COST) {
  const n = cost.length, m = new Model("assignment", "min");
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) m.addVar(`x_${i}_${j}`, { cost: cost[i][j], ub: 1 });
  for (let i = 0; i < n; i++) m.addRow(`team_${i}`, Object.fromEntries([...Array(n)].map((_, j) => [`x_${i}_${j}`, 1])), { lb: 1, ub: 1, label: `${S3_TEAMS[i]} gets one cluster` });
  for (let j = 0; j < n; j++) m.addRow(`cl_${j}`, Object.fromEntries([...Array(n)].map((_, i) => [`x_${i}_${j}`, 1])), { lb: 1, ub: 1, label: `${S3_CLUSTERS[j]} hosts one team` });
  return m;
}

// (b) Generalized assignment: 8 jobs with sizes (MW) onto 4 clusters with capacities (MW).
export const S3_JOBS = [
  { id: "pre",   label: "Pretrain run",        mw: 60, lat: 0  },
  { id: "rl",    label: "RL post-training",    mw: 34, lat: 0  },
  { id: "eval",  label: "Eval sweep",          mw: 12, lat: 0.2 },
  { id: "code",  label: "Code assistant",      mw: 26, lat: 1  },
  { id: "voice", label: "Voice agent",         mw: 18, lat: 1.5 },
  { id: "api",   label: "Enterprise API",      mw: 30, lat: 1  },
  { id: "synth", label: "Synthetic data",      mw: 22, lat: 0  },
  { id: "ft",    label: "Customer fine-tunes", mw: 15, lat: 0.5 },
];
export const S3_POOLS = [
  { id: "own",  label: "Own campus · Iowa",   cap: 90, perMW: 0.46, ms: 38 },
  { id: "hyp",  label: "Hyperscaler · Virginia", cap: 80, perMW: 0.80, ms: 12 },
  { id: "neo",  label: "Neocloud · Texas",    cap: 60, perMW: 0.55, ms: 28 },
  { id: "eu",   label: "Partner · Frankfurt", cap: 40, perMW: 0.70, ms: 95 },
];
// $M/quarter for job i on pool j = mw × perMW × fit; fit penalizes mismatches (T).
const S3_FIT = { pre: [1.0, 1.15, 1.05, 1.3], rl: [1.0, 1.05, 1.0, 1.2], eval: [1.1, 1.0, 1.0, 1.0], code: [1.0, 1.0, 1.0, 1.1],
  voice: [1.0, 1.05, 1.0, 1.1], api: [1.0, 1.0, 1.0, 0.95], synth: [1.0, 1.1, 0.95, 1.05], ft: [1.05, 1.0, 1.0, 1.0] };
export const s3GapCost = (i, j) => S3_JOBS[i].mw * S3_POOLS[j].perMW * S3_FIT[S3_JOBS[i].id][j];
// Latency score of job i on pool j: user-facing weight × round-trip ms.
export const s3GapLat = (i, j) => S3_JOBS[i].lat * S3_POOLS[j].ms;

export function s3GapModel({ integer = true, latCap = Infinity } = {}) {
  const m = new Model("gap", "min");
  S3_JOBS.forEach((job, i) => S3_POOLS.forEach((pl, j) => m.addVar(`y_${i}_${j}`, { cost: s3GapCost(i, j), ub: 1, int: integer })));
  S3_JOBS.forEach((job, i) => m.addRow(`job_${i}`, Object.fromEntries(S3_POOLS.map((_, j) => [`y_${i}_${j}`, 1])), { lb: 1, ub: 1, label: `${job.label} placed once` }));
  S3_POOLS.forEach((pl, j) => m.addRow(`cap_${j}`, Object.fromEntries(S3_JOBS.map((job, i) => [`y_${i}_${j}`, job.mw])), { ub: pl.cap, label: `${pl.label} capacity` }));
  if (latCap < Infinity) {
    const terms = {}; S3_JOBS.forEach((_, i) => S3_POOLS.forEach((_, j) => { const l = s3GapLat(i, j); if (l) terms[`y_${i}_${j}`] = l; }));
    m.addRow("latency", terms, { ub: latCap, label: "Total latency budget" });
  }
  return m;
}

/* ───────────────────────────── Step 4 · Lumpy choices ─────────────────────────────
   Seat: compute strategy at a lab choosing where to put the next 300 MW.                      */
export const S4_SITES = [
  { id: "A", label: "A · Ohio 30 MW shell",       mw: 30,  fixed: 20,  perMW: 1.91, q: 2, utility: "AEP" },
  { id: "B", label: "B · Ohio 25 MW powered land", mw: 25, fixed: 18,  perMW: 2.24, q: 3, utility: "AEP" },
  { id: "C", label: "C · Texas 120 MW campus",     mw: 120, fixed: 70, perMW: 1.89, q: 6, utility: "ERCOT" },
  { id: "D", label: "D · Texas substation upgrade", mw: 0, fixed: 20,  perMW: 0.00,    q: 5, utility: "ERCOT" },
  { id: "E", label: "E · Norway 60 MW hydro",      mw: 60,  fixed: 50,  perMW: 1.72, q: 4, utility: "Statnett" },
  { id: "F", label: "F · Virginia 40 MW colo",     mw: 40,  fixed: 25,  perMW: 2.78, q: 1, utility: "Dominion" },
  { id: "G", label: "G · Georgia 80 MW build",     mw: 80,  fixed: 89,  perMW: 2.01, q: 5, utility: "Georgia Power" },
  { id: "H", label: "H · Quebec 20 MW colo",       mw: 20,  fixed: 7,   perMW: 2.13, q: 2, utility: "Hydro-Québec" },
];
export const S4 = {
  need: 237,          // T: MW required in total
  early: 66,          // T: MW that must be energized within 3 quarters
  earlyQ: 3,
  cRequiresD: true,   // logical: the Texas campus needs the substation upgrade
  aXorB: true,        // logical: one AEP queue position — A or B, not both
  maxSites: 5,        // T: deal team bandwidth
};

export function s4Model(p = S4, { integer = true } = {}) {
  const m = new Model("site-portfolio", "min");
  for (const s of S4_SITES) m.addVar(`open_${s.id}`, { cost: s.fixed + s.mw * s.perMW, ub: 1, int: integer, label: s.label });
  m.addRow("need", Object.fromEntries(S4_SITES.filter(s => s.mw).map(s => [`open_${s.id}`, s.mw])), { lb: p.need, label: `≥ ${p.need} MW in total` });
  m.addRow("early", Object.fromEntries(S4_SITES.filter(s => s.mw && s.q <= p.earlyQ).map(s => [`open_${s.id}`, s.mw])), { lb: p.early, label: `≥ ${p.early} MW live within ${p.earlyQ} quarters` });
  if (p.cRequiresD) m.addRow("CneedsD", { open_C: 1, open_D: -1 }, { ub: 0, label: "Texas campus only with the substation upgrade" });
  if (p.aXorB) m.addRow("AxorB", { open_A: 1, open_B: 1 }, { ub: 1, label: "One AEP queue position: A or B" });
  m.addRow("bandwidth", Object.fromEntries(S4_SITES.map(s => [`open_${s.id}`, 1])), { ub: p.maxSites, label: `At most ${p.maxSites} sites` });
  return m;
}

/**
 * Our own branch-and-bound over the binaries, calling HiGHS for each LP relaxation, so every node can be drawn.
 * Depth-first, branch on the most fractional variable, prune by bound. Returns {nodes, best, incumbentHistory}.
 */
export async function branchAndBound(model, { maxNodes = 200 } = {}) {
  const bins = model.vars.filter(v => v.int).map(v => v.name);
  const sense = model.sense === "min" ? 1 : -1;
  const nodes = []; let best = null; let id = 0;
  const stack = [{ fix: {}, parent: null, branch: null, depth: 0 }];
  while (stack.length && nodes.length < maxNodes) {
    const nd = stack.pop();
    const ov = Object.fromEntries(Object.entries(nd.fix).map(([k, v]) => [k, { lb: v, ub: v }]));
    const r = await model.solve({ relax: true, overrides: ov });
    const node = { id: id++, parent: nd.parent, branch: nd.branch, depth: nd.depth, fix: nd.fix };
    nodes.push(node);
    if (r.status !== "optimal") { node.status = "infeasible"; continue; }
    node.bound = r.obj; node.x = r.x;
    if (best && sense * r.obj >= sense * best.obj - 1e-9) { node.status = "pruned"; continue; }
    let frac = null, fv = 0;
    for (const b of bins) { const f = Math.abs(r.x[b] - Math.round(r.x[b])); if (f > 1e-6 && f > fv) { fv = f; frac = b; } }
    if (!frac) { node.status = "integer"; best = { obj: r.obj, x: r.x, node: node.id }; continue; }
    node.status = "branched"; node.on = frac; node.val = r.x[frac];
    // Explore the "round up" child first (depth-first), so an incumbent appears early.
    stack.push({ fix: { ...nd.fix, [frac]: 0 }, parent: node.id, branch: `${frac} = 0`, depth: nd.depth + 1 });
    stack.push({ fix: { ...nd.fix, [frac]: 1 }, parent: node.id, branch: `${frac} = 1`, depth: nd.depth + 1 });
  }
  return { nodes, best };
}

// (b) Packing jobs onto 8-GPU nodes: first-fit decreasing vs the exact MIP.
export const S4_PACK = [28, 28, 28, 28, 22, 22, 22, 22, 22, 22, 22, 22]; // GPUs per job; each job must sit inside one 72-GPU NVLink rack (T)
export function ffd(sizes, cap = 72) {
  const bins = [];
  for (const s of [...sizes].sort((a, b) => b - a)) {
    const b = bins.find(b => b.used + s <= cap);
    if (b) { b.used += s; b.items.push(s); } else bins.push({ used: s, items: [s] });
  }
  return bins;
}
export function packModel(sizes = S4_PACK, cap = 72) {
  const n = sizes.length, B = n, m = new Model("bin-packing", "min");
  for (let b = 0; b < B; b++) m.addVar(`node_${b}`, { cost: 1, ub: 1, int: true });
  for (let i = 0; i < n; i++) for (let b = 0; b < B; b++) m.addVar(`a_${i}_${b}`, { ub: 1, int: true });
  for (let i = 0; i < n; i++) m.addRow(`job_${i}`, Object.fromEntries([...Array(B)].map((_, b) => [`a_${i}_${b}`, 1])), { lb: 1, ub: 1 });
  for (let b = 0; b < B; b++) m.addRow(`cap_${b}`, { ...Object.fromEntries(sizes.map((s, i) => [`a_${i}_${b}`, s])), [`node_${b}`]: -cap }, { ub: 0 });
  for (let b = 1; b < B; b++) m.addRow(`sym_${b}`, { [`node_${b}`]: 1, [`node_${b - 1}`]: -1 }, { ub: 0 }); // symmetry breaking
  return m;
}

/* ───────────────────────────── Step 5 · The bid-price desk ─────────────────────────────
   Seat: revenue desk at a neocloud. Four weeks of spare racks; six products; fares in $k per rack-week.
   A rack-week of GB200 NVL72 at $3/GPU-hr ≈ 72 × 168 × 3 ≈ $36k.                                     */
export const S5 = { weeks: 4, capacity: [40, 40, 40, 40] };
export const S5_PRODUCTS = [
  { id: "od1", label: "On-demand, week 1", weeks: [0],          fare: 36, mean: 18 },
  { id: "od2", label: "On-demand, week 2", weeks: [1],          fare: 36, mean: 20 },
  { id: "od3", label: "On-demand, week 3", weeks: [2],          fare: 36, mean: 24 },
  { id: "od4", label: "On-demand, week 4", weeks: [3],          fare: 36, mean: 26 },
  { id: "ft12", label: "Fine-tune block, weeks 1–2", weeks: [0, 1], fare: 58, mean: 12 },
  { id: "ft34", label: "Fine-tune block, weeks 3–4", weeks: [2, 3], fare: 58, mean: 14 },
  { id: "res",  label: "Reserved, all 4 weeks",      weeks: [0, 1, 2, 3], fare: 100, mean: 16 },
  { id: "bat",  label: "Batch (50% off), week 4",    weeks: [3], fare: 18, mean: 30 },
];

export function s5Model(cap = S5.capacity, demand = S5_PRODUCTS.map(q => q.mean)) {
  const m = new Model("bid-price", "max");
  S5_PRODUCTS.forEach((q, j) => m.addVar(q.id, { cost: q.fare, ub: Math.max(0, demand[j]), label: q.label }));
  for (let w = 0; w < cap.length; w++) {
    const t = {}; S5_PRODUCTS.forEach(q => { if (q.weeks.includes(w)) t[q.id] = 1; });
    m.addRow(`week_${w + 1}`, t, { ub: Math.max(0, cap[w]), label: `Racks free in week ${w + 1}` });
  }
  return m;
}

/** Seeded RNG (mulberry32) so every run is reproducible. */
export function rng(seed) {
  let a = seed >>> 0;
  return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
/** Poisson draw via inversion (small means). */
function poisson(r, lam) { let L = Math.exp(-lam), k = 0, p = 1; do { k++; p *= r(); } while (p > L); return k - 1; }

/** A booking stream: each product's request count ~ Poisson(mean); low fares tend to arrive first. */
export function s5Stream(seed) {
  const r = rng(seed); const reqs = [];
  S5_PRODUCTS.forEach((q, j) => { const n = poisson(r, q.mean); for (let k = 0; k < n; k++) reqs.push({ j, id: q.id, fare: q.fare, t: r() * 0.6 + (q.fare < 40 ? 0 : 0.4) * r() }); });
  // Cheap requests skew early (booking curves): sort by an arrival time biased by fare.
  reqs.forEach(x => { x.t = x.t + (x.fare >= 58 ? 0.25 : 0) ; });
  return reqs.sort((a, b) => a.t - b.t);
}

/** Run a booking policy over a stream. policy: "fcfs" | "bid" (static DLP duals) | "resolve" (re-solve every k arrivals). */
export async function s5Simulate(stream, policy = "bid", { every = 5 } = {}) {
  const cap = S5.capacity.slice();
  let revenue = 0, accepted = 0;
  const remainingMean = S5_PRODUCTS.map(q => q.mean);
  let bid = null;
  const getBid = async (frac) => {
    const r = await s5Model(cap, remainingMean.map(m => m * frac)).solve();
    return cap.map((_, w) => r.dual[`week_${w + 1}`]);
  };
  if (policy !== "fcfs") bid = await getBid(1);
  const log = [];
  for (let k = 0; k < stream.length; k++) {
    const q = S5_PRODUCTS[stream[k].j];
    if (policy === "resolve" && k > 0 && k % every === 0) bid = await getBid(Math.max(0.05, 1 - stream[k].t));
    const fits = q.weeks.every(w => cap[w] >= 1);
    const hurdle = bid ? q.weeks.reduce((s, w) => s + bid[w], 0) : 0;
    const ok = fits && (policy === "fcfs" || q.fare >= hurdle - 1e-9);
    if (ok) { q.weeks.forEach(w => cap[w]--); revenue += q.fare; accepted++; }
    log.push({ id: q.id, fare: q.fare, hurdle, ok, fits });
  }
  return { revenue, accepted, log, capLeft: cap };
}

/* ───────────────────────────── Step 6 · Commit or flex ─────────────────────────────
   Seat: compute strategy at a lab signing next year's inference capacity.
   Prices in $M per MW-year. $1.90 per GPU-hour × 600 GPUs × 8,760 h ≈ $10.0M.                     */
export const S6 = {
  mean: 300,           // T: forecast MW of inference next year
  cv: 0.25,            // T: forecast uncertainty (coefficient of variation)
  n: 20,               // scenarios (stratified quantiles of a lognormal, equal weight)
  commitPrice: 10.0,   // T: take-or-pay $M per MW-yr (≈ $1.90/GPU-hr)
  spotPrice: 16.0,     // T: spot $M per MW-yr (≈ $3.04/GPU-hr)
  spotCap: 80,         // T: MW of spot available
  shortPrice: 30.0,    // T: lost margin per MW-yr of demand you can't serve
  optionOn: false,     // allow an "up to" (reserve now, exercise later)
  optionFee: 2.0,      // T: reservation fee per MW-yr reserved
  optionStrike: 10.5,  // T: price per MW-yr exercised
  risk: 0,             // 0 = minimize expected cost; λ ∈ (0,1] weights CVaR of the worst tail
  alpha: 0.9,          // CVaR tail: the worst 10%
};

/** Inverse standard normal CDF (Acklam's rational approximation, |error| < 1.2e-9). */
export function normInv(p) {
  const a = [-3.969683028665376e1, 2.209460984245205e2, -2.759285104469687e2, 1.383577518672690e2, -3.066479806614716e1, 2.506628277459239];
  const b = [-5.447609879822406e1, 1.615858368580409e2, -1.556989798598866e2, 6.680131188771972e1, -1.328068155288572e1];
  const c = [-7.784894002430293e-3, -3.223964580411365e-1, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783];
  const d = [7.784695709041462e-3, 3.224671290700398e-1, 2.445134137142996, 3.754408661907416];
  const pl = 0.02425;
  if (p < pl) { const q = Math.sqrt(-2 * Math.log(p)); return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1); }
  if (p > 1 - pl) { const q = Math.sqrt(-2 * Math.log(1 - p)); return -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1); }
  const q = p - 0.5, r = q * q;
  return (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
}

/** Equal-weight scenarios at stratified quantiles of a lognormal with the given mean and CV. Deterministic. */
export function s6Scenarios(p = S6) {
  const s2 = Math.log(1 + p.cv * p.cv), mu = Math.log(p.mean) - s2 / 2, s = Math.sqrt(s2);
  return Array.from({ length: p.n }, (_, k) => Math.exp(mu + s * normInv((k + 0.5) / p.n)));
}

/**
 * Two-stage stochastic LP. First stage: commit c (take-or-pay), reserve r (up-to). Second stage per scenario:
 * exercise e_s ≤ r, spot y_s ≤ cap, short u_s. With fixCommit/fixReserve the first stage is pinned (used for EEV
 * and for "plan to a point forecast"). With scen = [d] it is the deterministic model.
 */
export function s6Model(p = S6, { scen = s6Scenarios(p), fixCommit = null, fixReserve = null } = {}) {
  const m = new Model("commit-or-flex", "min");
  const N = scen.length, pi = 1 / N, lam = p.risk;
  m.addVar("commit", { cost: (1 - lam) * p.commitPrice, lb: fixCommit ?? 0, ub: fixCommit ?? Infinity, label: "Take-or-pay commitment (MW)" });
  const opt = p.optionOn;
  if (opt) m.addVar("reserve", { cost: (1 - lam) * p.optionFee, lb: fixReserve ?? 0, ub: fixReserve ?? Infinity, label: "\"Up to\" reserved (MW)" });
  if (lam > 0) m.addVar("eta", { cost: lam, lb: -Infinity, label: "VaR threshold (CVaR helper)" });
  scen.forEach((d, s) => {
    if (opt) m.addVar(`ex_${s}`, { cost: (1 - lam) * pi * p.optionStrike, label: `Exercise, scenario ${s + 1}` });
    m.addVar(`spot_${s}`, { cost: (1 - lam) * pi * p.spotPrice, ub: p.spotCap, label: `Spot, scenario ${s + 1}` });
    m.addVar(`short_${s}`, { cost: (1 - lam) * pi * p.shortPrice, label: `Unserved, scenario ${s + 1}` });
    const t = { commit: 1, [`spot_${s}`]: 1, [`short_${s}`]: 1 }; if (opt) t[`ex_${s}`] = 1;
    m.addRow(`serve_${s}`, t, { lb: d, label: `Serve demand, scenario ${s + 1}` });
    if (opt) m.addRow(`exlim_${s}`, { [`ex_${s}`]: 1, reserve: -1 }, { ub: 0, label: `Exercise ≤ reserved, scenario ${s + 1}` });
    if (lam > 0) {
      // z_s ≥ cost_s − η, with cost_s the full cost in scenario s.
      m.addVar(`z_${s}`, { cost: lam * pi / (1 - p.alpha), label: `Tail excess, scenario ${s + 1}` });
      const ct = { [`z_${s}`]: 1, eta: 1, commit: -p.commitPrice, [`spot_${s}`]: -p.spotPrice, [`short_${s}`]: -p.shortPrice };
      if (opt) { ct.reserve = -p.optionFee; ct[`ex_${s}`] = -p.optionStrike; }
      m.addRow(`tail_${s}`, ct, { lb: 0, label: `Tail excess, scenario ${s + 1}` });
    }
  });
  return m;
}

/** Cost of a solved plan in each scenario (true dollars, independent of the risk weighting). */
export function s6ScenarioCosts(p, r, scen) {
  return scen.map((_, s) => p.commitPrice * r.x.commit + (p.optionOn ? p.optionFee * r.x.reserve + p.optionStrike * r.x[`ex_${s}`] : 0)
    + p.spotPrice * r.x[`spot_${s}`] + p.shortPrice * r.x[`short_${s}`]);
}
const mean = a => a.reduce((s, v) => s + v, 0) / a.length;
export function cvar(costs, alpha) {
  const s = [...costs].sort((a, b) => b - a); const k = Math.max(1, Math.round((1 - alpha) * s.length));
  return mean(s.slice(0, k));
}

/** WS, RP, EEV, VSS, EVPI (risk-neutral, as in Birge & Louveaux). */
export async function s6Metrics(p = S6) {
  const q = { ...p, risk: 0 };
  const scen = s6Scenarios(q);
  const rp = await s6Model(q, { scen }).solve();
  const RP = mean(s6ScenarioCosts(q, rp, scen));
  let WS = 0;
  for (const d of scen) { const r = await s6Model(q, { scen: [d] }).solve(); WS += r.obj / scen.length; }
  const ev = await s6Model(q, { scen: [mean(scen)] }).solve();
  const eev = await s6Model(q, { scen, fixCommit: ev.x.commit, fixReserve: q.optionOn ? ev.x.reserve : null }).solve();
  const EEV = mean(s6ScenarioCosts(q, eev, scen));
  return { scen, rp, RP, WS, EEV, VSS: EEV - RP, EVPI: RP - WS, evCommit: ev.x.commit };
}

/** Expected cost if you commit exactly c (no option), recourse optimal per scenario. Closed form per scenario. */
export function s6CostAt(p, c, scen = s6Scenarios(p)) {
  return mean(scen.map(d => { const gap = Math.max(0, d - c); const y = Math.min(gap, p.spotCap); return p.commitPrice * c + p.spotPrice * y + p.shortPrice * (gap - y); }));
}
export const s6Mape = (c, scen) => mean(scen.map(d => Math.abs(c - d) / d));

/* ───────────────────────────── Step 7 · Diminishing returns ─────────────────────────────
   (a) Split a compute budget across research bets with concave returns R_i(x) = a_i ln(1 + x/b_i).
   KKT: every funded bet's marginal return a_i/(b_i + x_i) equals λ, the shadow price of compute.        */
export const S7_BETS = [
  { id: "pre",  label: "Pretraining scale-up",     a: 80, b: 150 },
  { id: "rl",   label: "RL environments",          a: 45, b: 25 },
  { id: "inf",  label: "Inference efficiency",     a: 18, b: 10 },
  { id: "agent", label: "Agents product",          a: 30, b: 90 },
];
export function waterFill(budget, bets = S7_BETS) {
  const alloc = lam => bets.map(b => Math.max(0, b.a / lam - b.b));
  let lo = 1e-9, hi = Math.max(...bets.map(b => b.a / b.b)) + 1;
  for (let k = 0; k < 200; k++) { const mid = (lo + hi) / 2; const s = alloc(mid).reduce((a, b) => a + b, 0); if (s > budget) lo = mid; else hi = mid; }
  const lam = (lo + hi) / 2, x = alloc(lam);
  const value = bets.reduce((s, b, i) => s + b.a * Math.log(1 + x[i] / b.b), 0);
  return { lam, x, value };
}
export const betValue = (x, bets = S7_BETS) => bets.reduce((s, b, i) => s + b.a * Math.log(1 + x[i] / b.b), 0);

// (b) Chinchilla: minimize L(N, D) = E + A/N^α + B/D^β subject to 6ND = C. Hoffmann et al. 2022 eq. 4.
export const CHINCHILLA_FITS = [
  { id: "hoff",  label: "Hoffmann 2022 (unrounded)", E: 1.6934, A: 406.4, B: 410.7, alpha: 0.3392, beta: 0.2849, src: "arXiv 2203.15556, fitted values" },
  { id: "hoffr", label: "Hoffmann 2022 (as printed, rounded)", E: 1.69, A: 406.4, B: 410.7, alpha: 0.34, beta: 0.28, src: "arXiv 2203.15556, Table / eq. 10" },
  { id: "epoch", label: "Epoch 2024 refit (Besiroglu et al.)", E: 1.8172, A: 482.01, B: 2085.43, alpha: 0.3478, beta: 0.3658, src: "arXiv 2404.10102" },
];
export function chinchilla(C, f) {
  const G = Math.pow((f.alpha * f.A) / (f.beta * f.B), 1 / (f.alpha + f.beta));
  const a = f.beta / (f.alpha + f.beta), b = f.alpha / (f.alpha + f.beta);
  const N = G * Math.pow(C / 6, a), D = Math.pow(G, -1) * Math.pow(C / 6, b);
  const L = f.E + f.A / Math.pow(N, f.alpha) + f.B / Math.pow(D, f.beta);
  return { N, D, L, ratio: D / N, a, b };
}
export const chinLoss = (N, C, f) => { const D = C / (6 * N); return f.E + f.A / Math.pow(N, f.alpha) + f.B / Math.pow(D, f.beta); };

/** Step 6: what an "up to" is worth. Value = RP without the option − RP with it (at the given fee);
 *  the indifference fee is the highest reservation fee at which the optimal plan still reserves any. */
export async function s6OptionValue(p = S6) {
  const q = { ...p, risk: 0 };
  const scen = s6Scenarios(q);
  const without = (await s6Model({ ...q, optionOn: false }, { scen }).solve()).obj;
  const withOpt = await s6Model({ ...q, optionOn: true }, { scen }).solve();
  let lo = 0, hi = q.spotPrice * 2;
  for (let k = 0; k < 40; k++) {
    const mid = (lo + hi) / 2;
    const r = await s6Model({ ...q, optionOn: true, optionFee: mid }, { scen }).solve();
    if (r.x.reserve > 1e-6) lo = mid; else hi = mid;
  }
  return { value: without - withOpt.obj, reserve: withOpt.x.reserve, commit: withOpt.x.commit, indifferenceFee: (lo + hi) / 2 };
}

/* ───────────────────────────── Capstone · The allocation memo ─────────────────────────────
   Seat: compute strategy at a mid-size lab, six quarters. Decide the contracts now; demand reveals later.     */
export const CAP = {
  T: 6,
  inferBase: 190, inferGrowth: 0.12,            // T: expected inference MW in Q1 and its growth
  scen: [                                        // T: demand paths (multiplier reached by Q6) and probabilities
    { id: "bust",  label: "Bust",        mult: 0.65, prob: 0.10 },
    { id: "slow",  label: "Slow",        mult: 0.85, prob: 0.20 },
    { id: "base",  label: "Base",        mult: 1.00, prob: 0.40 },
    { id: "hot",   label: "Hot",         mult: 1.25, prob: 0.20 },
    { id: "boom",  label: "Breakout",    mult: 1.60, prob: 0.10 },
  ],
  train: [0, 0, 160, 160, 0, 0],                 // T: MW for the next pretraining run, Q3–Q4
  ownCap: 150,                                   // T: MW the lab's own campus can power
  ownCost: 0,                                    // sunk: owned capacity costs the same used or not
  upgradeMax: 40, upgradeFrom: 4, upgradePrice: 4.5,  // T: +MW from Q4, $M per MW for the whole period
  hypPrice: 2.75,                                // T: hyperscaler reserved, $M per MW-quarter, all six quarters
  neoPrice: 2.40, neoFrom: 3,                    // T: neocloud take-or-pay, from Q3 (two-quarter lead)
  optFee: 0.45, optStrike: 2.90, optFrom: 2,     // T: "up to": fee per MW-quarter reserved, strike per MW-quarter used
  spotPrice: 4.20, spotCap: 50,                  // T
  shortPrice: 9.0,                               // T: lost margin per MW-quarter of inference not served
  risk: 0.2, alpha: 0.9,                         // weight on CVaR of the worst 10%
};

export function capDemand(p = CAP) {
  return p.scen.map(sc => Array.from({ length: p.T }, (_, t) => p.inferBase * Math.pow(1 + p.inferGrowth, t) * Math.pow(sc.mult, (t + 1) / p.T)));
}

/**
 * fix = { hyp, neo, opt, upg } pins the first stage (to score a hand-built plan). Otherwise the solver chooses.
 * allow = { hyp, neo, opt, upg } switches contract types on/off.
 */
export function capModel(p = CAP, { fix = null, allow = { hyp: true, neo: true, opt: true, upg: true } } = {}) {
  const m = new Model("allocation-memo", "min");
  const T = p.T, lam = p.risk, D = capDemand(p);
  const nOpt = T - p.optFrom + 1, nNeo = T - p.neoFrom + 1, nUpg = T - p.upgradeFrom + 1;
  const first = {
    hyp: { cost: p.hypPrice * T, on: t => true, label: "Hyperscaler reserved (MW, 6 quarters)" },
    neo: { cost: p.neoPrice * nNeo, on: t => t >= p.neoFrom, label: "Neocloud take-or-pay (MW, from Q3)" },
    opt: { cost: p.optFee * nOpt, on: t => t >= p.optFrom, label: "\"Up to\" reserved (MW, from Q2)" },
    upg: { cost: p.upgradePrice, on: t => t >= p.upgradeFrom, label: "Campus power upgrade (MW, from Q4)" },
  };
  for (const [k, v] of Object.entries(first)) {
    const ub = !allow[k] ? 0 : k === "upg" ? p.upgradeMax : Infinity;
    const val = fix ? Math.min(fix[k] ?? 0, ub) : null;
    m.addVar(k, { cost: (1 - lam) * v.cost, lb: val ?? 0, ub: val ?? ub, label: v.label });
  }
  if (lam > 0) m.addVar("eta", { cost: lam, lb: -Infinity, label: "VaR threshold (CVaR helper)" });
  p.scen.forEach((sc, s) => {
    const w = sc.prob;
    const costTerms = { hyp: -first.hyp.cost, neo: -first.neo.cost, opt: -first.opt.cost, upg: -first.upg.cost };
    for (let t = 1; t <= T; t++) {
      const k = `${s}_${t}`;
      m.addVar(`own_${k}`, { cost: 0 });
      m.addVar(`spot_${k}`, { cost: (1 - lam) * w * p.spotPrice, ub: p.spotCap });
      m.addVar(`short_${k}`, { cost: (1 - lam) * w * p.shortPrice, ub: D[s][t - 1] });
      costTerms[`spot_${k}`] = -p.spotPrice; costTerms[`short_${k}`] = -p.shortPrice;
      const serve = { [`own_${k}`]: 1, hyp: 1, [`spot_${k}`]: 1, [`short_${k}`]: 1 };
      if (first.neo.on(t)) serve.neo = 1;
      if (first.opt.on(t)) {
        m.addVar(`ex_${k}`, { cost: (1 - lam) * w * p.optStrike });
        serve[`ex_${k}`] = 1; costTerms[`ex_${k}`] = -p.optStrike;
        m.addRow(`exlim_${k}`, { [`ex_${k}`]: 1, opt: -1 }, { ub: 0 });
      }
      m.addRow(`serve_${k}`, serve, { lb: D[s][t - 1] + p.train[t - 1], label: `Serve ${sc.label} Q${t}` });
      const capT = { [`own_${k}`]: 1 }; if (first.upg.on(t)) capT.upg = -1;
      m.addRow(`power_${k}`, capT, { ub: p.ownCap, label: `Campus power, ${sc.label} Q${t}` });
    }
    if (lam > 0) {
      m.addVar(`z_${s}`, { cost: lam * w / (1 - p.alpha) });
      m.addRow(`tail_${s}`, { [`z_${s}`]: 1, eta: 1, ...costTerms }, { lb: 0 });
    }
  });
  return m;
}

/** Score a solved capstone plan: expected and worst-scenario cost, SLO, shadow prices, per-scenario detail. */
export function capScore(p, r) {
  const T = p.T, D = capDemand(p);
  const fixed = r.x.hyp * p.hypPrice * T + r.x.neo * p.neoPrice * (T - p.neoFrom + 1) + r.x.opt * p.optFee * (T - p.optFrom + 1) + r.x.upg * p.upgradePrice;
  let exp = 0, worst = -Infinity, shortE = 0, demE = 0, powerDual = 0, serveDual = 0;
  const per = p.scen.map((sc, s) => {
    let c = fixed, sh = 0, dm = 0;
    for (let t = 1; t <= T; t++) {
      const k = `${s}_${t}`;
      c += p.spotPrice * r.x[`spot_${k}`] + p.shortPrice * r.x[`short_${k}`] + (r.x[`ex_${k}`] ? p.optStrike * r.x[`ex_${k}`] : 0);
      sh += r.x[`short_${k}`]; dm += D[s][t - 1];
      if (r.dual) { powerDual += -r.dual[`power_${k}`]; serveDual += r.dual[`serve_${k}`]; }
    }
    exp += sc.prob * c; worst = Math.max(worst, c); shortE += sc.prob * sh; demE += sc.prob * dm;
    return { id: sc.id, label: sc.label, cost: c, short: sh, demand: dm };
  });
  const tail = cvar(per.flatMap(x => Array(Math.round(p.scen.find(s => s.id === x.id).prob * 100)).fill(x.cost)), p.alpha);
  return { fixed, expected: exp, worst, cvar: tail, slo: 1 - shortE / demE, powerDual, serveDual, per };
}
