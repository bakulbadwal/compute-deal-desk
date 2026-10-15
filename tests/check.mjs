// check.mjs — acceptance checker for Compute Deal Desk.  Run: node tests/check.mjs  (or make check)
//
//  a. Solve every JS model at its defaults (js/models.js + js/lp.js, HiGHS via WebAssembly).
//  b. Run each Python twin in models/ with --json (native highspy) and compare shared numbers to 1e-6 relative.
//  c. Finite-difference every binding-row dual in steps 0, 1, 2 (and the step-5 bid prices).
//  d. Null cases: walls slack ⇒ duals 0; cv → 0 ⇒ VSS, EVPI → 0; identical bets ⇒ equal split; assignment LP integral.
//  e. Step 5 booking simulation over three seed batches (fcfs / bid / resolve), mean ± SD across batches.
//  f. Write every checked number to tests/out/numbers.json so page copy can be grepped against it.
//
// Status codes: PASS · DEGEN (dual not unique — both solvers' values lie inside the finite-difference
// interval, so both are valid shadow prices; the page must not present one as THE price) · FAIL.
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as M from "../js/models.js";
import { fdDual, isBinding } from "../js/lp.js";
import { LEDGER } from "../js/econ.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PY = join(ROOT, ".venv/bin/python");
const REL = 1e-6;   // py ↔ js tolerance
const FD = 1e-5;    // finite-difference tolerance (LP value function is piecewise linear; error is roundoff / δ)

const rows = [];         // {id, js, ref, status, note}
const numbers = {};      // flat id → value, written to tests/out/numbers.json

const isInf = v => v === Infinity || v === -Infinity || v === "inf" || v === "-inf" || v === null;
const num = v => (v === "inf" ? Infinity : v === "-inf" ? -Infinity : v);
const close = (a, b, tol = REL) => {
  a = num(a); b = num(b);
  if (isInf(a) || isInf(b)) return a === b;
  return Math.abs(a - b) <= tol * Math.max(1, Math.abs(a), Math.abs(b));
};
const jsonNum = v => (v === Infinity ? "inf" : v === -Infinity ? "-inf" : v);

function record(id, js, ref, status, note = "") {
  rows.push({ id, js, ref, status, note });
  numbers[id] = jsonNum(js);
}
/** py ↔ js comparison; `fd` is an optional {up, down} interval that makes a mismatch a DEGEN instead of a FAIL. */
function cmp(id, js, py, fd = null) {
  if (close(js, py)) return record(id, js, py, "PASS");
  if (fd) {
    const lo = Math.min(fd.up, fd.down), hi = Math.max(fd.up, fd.down);
    const inside = v => v >= lo - FD * Math.max(1, Math.abs(lo)) && v <= hi + FD * Math.max(1, Math.abs(hi));
    if (hi - lo > FD * Math.max(1, Math.abs(hi)) && inside(js) && inside(py))
      return record(id, js, py, "DEGEN", `dual not unique: any value in [${fmt(lo)}, ${fmt(hi)}] is optimal`);
  }
  record(id, js, py, "FAIL", "py and js disagree");
}
function assert(id, ok, value, note = "", ref = "") { record(id, value, ref, ok ? "PASS" : "FAIL", note); }
function info(id, value, note = "") { record(id, value, "", "INFO", note); }

/** Default-data drift guard: every value a Python twin hard-codes must equal the current js/models.js default. */
function diffData(js, py, path = "") {
  const bad = [];
  if (Array.isArray(py)) {
    if (!Array.isArray(js) || js.length !== py.length) return [`${path} (length)`];
    py.forEach((v, i) => bad.push(...diffData(js[i], v, `${path}[${i}]`)));
  } else if (py && typeof py === "object") {
    for (const k of Object.keys(py)) bad.push(...diffData(js?.[k], py[k], path ? `${path}.${k}` : k));
  } else if (typeof py === "number") {
    if (typeof js !== "number" || !close(js, py, 1e-12)) bad.push(`${path} js=${js} py=${py}`);
  } else if ((js ?? false) !== (py ?? false)) bad.push(`${path} js=${js} py=${py}`);
  return bad;
}
function drift(step, js, pyData) {
  const bad = diffData(js, pyData);
  record(`${step}.defaults`, bad.length ? bad.length : "in sync", "", bad.length ? "FAIL" : "PASS",
    bad.length ? `Python twin is stale vs js/models.js: ${bad.join("; ")}` : "Python twin's hard-coded data = js/models.js defaults");
}

function py(script) {
  const out = execFileSync(PY, [join(ROOT, "models", script), "--json"], { encoding: "utf8", cwd: ROOT });
  return JSON.parse(out);
}
function fmt(v) {
  if (v === undefined || v === "") return "";
  if (typeof v === "boolean") return String(v);
  if (typeof v === "string") return v;
  if (Array.isArray(v)) return v.join(" ");
  if (!isFinite(v)) return v > 0 ? "inf" : "-inf";
  const a = Math.abs(v);
  return a !== 0 && (a >= 1e7 || a < 1e-4) ? v.toExponential(6) : (+v.toPrecision(10)).toString();
}

/** FD every binding row of a model; returns {row: {up, down}} and records each check. */
async function fdAll(step, model, r) {
  const out = {};
  for (const row of model.rows) {
    const id = `${step}.fd.${row.name}`;
    if (!isBinding(row, r.act[row.name])) {
      // Complementary slackness: a wall nobody presses has price 0.
      assert(`${step}.slack.${row.name}`, Math.abs(r.dual[row.name]) < 1e-9, r.dual[row.name], "non-binding ⇒ dual 0");
      continue;
    }
    const f = await fdDual(model, row.name);
    out[row.name] = f;
    const d = r.dual[row.name];
    if (close(f.up, f.down, FD)) {
      record(id, d, f.up, close(d, f.up, FD) ? "PASS" : "FAIL", "binding; FD up = down");
    } else {
      const lo = Math.min(f.up, f.down), hi = Math.max(f.up, f.down);
      const ok = d >= lo - FD && d <= hi + FD;
      record(id, d, `${fmt(f.down)} | ${fmt(f.up)}`, ok ? "DEGEN" : "FAIL",
        `degenerate: FD down ${fmt(f.down)} ≠ up ${fmt(f.up)}; reported dual ${ok ? "inside" : "OUTSIDE"} the interval`);
    }
    numbers[`${id}.up`] = f.up; numbers[`${id}.down`] = f.down;
  }
  return out;
}

const mean = a => a.reduce((s, v) => s + v, 0) / a.length;
const sd = a => { const m = mean(a); return Math.sqrt(a.reduce((s, v) => s + (v - m) ** 2, 0) / (a.length - 1)); };

// ─────────────────────────────── Step 0 ───────────────────────────────
{
  const m = M.s0Model(), r = await m.solve({ ranging: true }), p = py("s0_three_questions.py");
  drift("s0", { ...M.S0, ledger: LEDGER }, p.data);
  assert("s0.halls", m.rows.find(x => x.name === "halls")?.ub === 400, 400, "py hard-codes the hall-shell cap at 400");
  const fd = await fdAll("s0", m, r);
  cmp("s0.obj", r.obj, p.obj);
  cmp("s0.x.T", r.x.T, p.x.T); cmp("s0.x.I", r.x.I, p.x.I);
  for (const k of ["grid", "demand", "fabric", "anchor"]) cmp(`s0.dual.${k}`, r.dual[k], p.dual[k], fd[k]);
}

// ─────────────────────────────── Step 1 ───────────────────────────────
{
  const m = M.s1Model(), r = await m.solve({ ranging: true }), p = py("s1_price_of_a_wall.py");
  drift("s1", { ...M.S1, products: M.S1_PRODUCTS.map(q => ({ extraOpex: 0, ...q })) }, p.data);
  assert("s1.noOffers", Object.values(M.S1.offers).every(v => !v), 0, "py twin models no buy-the-wall offers");
  const fd = await fdAll("s1", m, r);
  cmp("s1.obj", r.obj, p.obj);
  for (const q of M.S1_PRODUCTS) cmp(`s1.x.${q.id}`, r.x[q.id], p.x[q.id]);
  for (const row of m.rows) cmp(`s1.dual.${row.name}`, r.dual[row.name], p.dual[row.name], fd[row.name]);
  for (const q of M.S1_PRODUCTS) cmp(`s1.rc.${q.id}`, r.rc[q.id], p.rc[q.id]);
  const jsBinding = m.rows.filter(row => isBinding(row, r.act[row.name])).map(row => row.name);
  assert("s1.bindingSet", jsBinding.join(",") === p.binding.join(","), jsBinding, "js and py agree on which walls bind", p.binding);
  for (const k of jsBinding) {
    cmp(`s1.range.${k}.lo`, r.range.rows[k].lo, p.rowRange[k].lo);
    cmp(`s1.range.${k}.hi`, r.range.rows[k].hi, p.rowRange[k].hi);
  }
  for (const q of M.S1_PRODUCTS) {
    cmp(`s1.costRange.${q.id}.lo`, r.range.cols[q.id].costLo, p.colRange[q.id].costLo);
    cmp(`s1.costRange.${q.id}.hi`, r.range.cols[q.id].costHi, p.colRange[q.id].costHi);
  }
  // Ranging sanity: inside [lo, hi] the objective moves linearly at the dual (re-solve at both ends).
  for (const k of jsBinding) {
    const row = m.rows[m._ri.get(k)], side = row.ub < Infinity ? "ub" : "lb", orig = row[side];
    const { lo, hi } = r.range.rows[k];
    let ok = true;
    for (const at of [lo, hi]) {
      if (!isFinite(at)) continue;
      const t = orig + 0.999 * (at - orig);
      row[side] = t; const o = (await m.solve()).obj; row[side] = orig;
      ok = ok && close(o, r.obj + r.dual[k] * (t - orig), 1e-7);
    }
    assert(`s1.rangeLinear.${k}`, ok, r.dual[k], "objective linear in RHS across [lo, hi] at slope = dual");
  }
}

// ─────────────────────────────── Step 2 ───────────────────────────────
{
  const m = M.s2Model(), r = await m.solve(), p = py("s2_capacity_ladder.py");
  drift("s2", M.S2, p.data);
  assert("s2.assumptions", M.S2.window === M.S2.T && M.S2.tail === "ignore" && M.S2.floorOn, `${M.S2.window}/${M.S2.tail}/${M.S2.floorOn}`,
    "py twin assumes window = T, tail = ignore, floor on");
  const fd = await fdAll("s2", m, r);
  cmp("s2.obj", r.obj, p.obj);
  for (let t = 1; t <= M.S2.T; t++) cmp(`s2.dual.demand_${t}`, r.dual[`demand_${t}`], p.demandDual[t - 1], fd[`demand_${t}`]);
  for (const k of Object.keys(p.floorDual)) cmp(`s2.dual.${k}`, r.dual[k], p.floorDual[k], fd[k]);
  info("s2.tailUSD", M.s2Tail(M.S2, r), "$M of commitments past the window that tail=ignore never priced");
}

// ─────────────────────────────── Step 3 ───────────────────────────────
{
  const p = py("s3_who_gets_which_gpus.py");
  drift("s3", { cost: M.S3_COST, jobMW: M.S3_JOBS.map(j => j.mw), poolCap: M.S3_POOLS.map(q => q.cap),
    gapCost: M.S3_JOBS.map((_, i) => M.S3_POOLS.map((_, j) => M.s3GapCost(i, j))) }, p.data);
  const a = await M.s3AssignModel().solve();
  cmp("s3.assign.obj", a.obj, p.assignObj);
  const integral = Object.values(a.x).every(v => Math.min(Math.abs(v), Math.abs(v - 1)) < 1e-9);
  assert("s3.assign.integral.js", integral, integral, "null case (iv): assignment LP lands on a 0/1 corner");
  assert("s3.assign.integral.py", p.assignIntegral, p.assignIntegral, "same, native HiGHS");
  const jsPairs = Object.entries(a.x).filter(([, v]) => v > 0.5).map(([k]) => k.slice(2).replace("_", "→"));
  const pyPairs = p.assignment.map(([i, j]) => `${i}→${j}`);
  info("s3.assign.js", jsPairs, jsPairs.join(",") === pyPairs.join(",") ? "same as py" : `py found an alternate optimum: ${pyPairs.join(" ")}`);
  const lp = await M.s3GapModel({ integer: false }).solve(), mip = await M.s3GapModel().solve();
  cmp("s3.gap.lp", lp.obj, p.gapLP);
  cmp("s3.gap.mip", mip.obj, p.gapMIP);
  assert("s3.gap.lp<=mip", lp.obj <= mip.obj + 1e-9, mip.obj - lp.obj, "integrality gap ≥ 0");
}

// ─────────────────────────────── Step 4 ───────────────────────────────
{
  const p = py("s4_lumpy_choices.py");
  drift("s4", { ...M.S4, pack: M.S4_PACK, sites: M.S4_SITES }, p.data);
  assert("s4.assumptions", M.S4.cRequiresD && M.S4.aXorB, `${M.S4.cRequiresD}/${M.S4.aXorB}`, "py twin assumes both logic rows on");
  const lp = await M.s4Model(M.S4, { integer: false }).solve(), mip = await M.s4Model().solve();
  cmp("s4.lp.obj", lp.obj, p.lpObj);
  for (const s of M.S4_SITES) cmp(`s4.lp.x.${s.id}`, lp.x[`open_${s.id}`], p.lpX[s.id]);
  cmp("s4.mip.obj", mip.obj, p.mipObj);
  const sites = M.S4_SITES.filter(s => mip.x[`open_${s.id}`] > 0.5).map(s => s.id);
  assert("s4.mip.sites", sites.join("") === p.mipSites.join(""), sites, "same sites chosen", p.mipSites);
  const bb = await M.branchAndBound(M.s4Model());
  assert("s4.bnb.obj", bb.best && close(bb.best.obj, mip.obj), bb.best?.obj, `page's own branch-and-bound (${bb.nodes.length} nodes) reaches the HiGHS MIP optimum`, mip.obj);
  numbers["s4.bnb.nodes"] = bb.nodes.length;
  const pack = await M.packModel().solve(), ffd = M.ffd(M.S4_PACK).length;
  cmp("s4.pack.mip", pack.obj, p.packMIP);
  cmp("s4.pack.ffd", ffd, p.packFFD);
}

// ─────────────────────────────── Step 5 ───────────────────────────────
{
  const p = py("s5_bid_price_desk.py");
  drift("s5", { capacity: M.S5.capacity, products: M.S5_PRODUCTS }, p.data);
  const m = M.s5Model(), r = await m.solve();
  const fd = await fdAll("s5", m, r);
  cmp("s5.obj", r.obj, p.obj);
  for (let w = 1; w <= 4; w++) cmp(`s5.bid.week_${w}`, r.dual[`week_${w}`], p.bidPrice[w - 1], fd[`week_${w}`]);

  // (e) booking simulation, three seed batches
  const batches = [[1, 40], [41, 80], [81, 120]], pol = ["fcfs", "bid", "resolve"];
  const means = Object.fromEntries(pol.map(k => [k, []]));
  for (const [a, b] of batches) {
    const rev = Object.fromEntries(pol.map(k => [k, []]));
    for (let seed = a; seed <= b; seed++) {
      const stream = M.s5Stream(seed);
      for (const k of pol) rev[k].push((await M.s5Simulate(stream, k)).revenue);
    }
    for (const k of pol) { means[k].push(mean(rev[k])); numbers[`s5.sim.${k}.seeds${a}-${b}`] = mean(rev[k]); }
    const i = means.fcfs.length - 1;
    assert(`s5.sim.bid>fcfs.seeds${a}-${b}`, means.bid[i] > means.fcfs[i], means.bid[i] - means.fcfs[i],
      `bid ${fmt(means.bid[i])} vs fcfs ${fmt(means.fcfs[i])} ($k avg revenue)`);
  }
  for (const k of pol) {
    info(`s5.sim.${k}.mean`, mean(means[k]), `± ${fmt(sd(means[k]))} SD across 3 batches of 40 seeds`);
    numbers[`s5.sim.${k}.sd`] = sd(means[k]);
  }
}

// ─────────────────────────────── Step 6 ───────────────────────────────
{
  const p = py("s6_commit_or_flex.py");
  drift("s6", M.S6, p.data);
  const scen = M.s6Scenarios();
  scen.forEach((d, k) => cmp(`s6.scen.${k}`, d, p.scenarios[k]));
  for (const [key, on] of [["off", false], ["on", true]]) {
    const mm = await M.s6Metrics({ ...M.S6, optionOn: on });
    for (const f of ["RP", "WS", "EEV", "VSS", "EVPI"]) cmp(`s6.${key}.${f}`, mm[f], p[key][f]);
    cmp(`s6.${key}.commit`, mm.rp.x.commit, p[key].commit);
    if (on) cmp(`s6.${key}.reserve`, mm.rp.x.reserve, p[key].reserve);
    // RP from the model objective must equal RP recomputed from scenario costs (risk 0).
    assert(`s6.${key}.RP=obj`, close(mm.rp.obj, mm.RP, 1e-9), mm.rp.obj, "objective = mean scenario cost", mm.RP);
    assert(`s6.${key}.WS<=RP<=EEV`, mm.WS <= mm.RP + 1e-9 && mm.RP <= mm.EEV + 1e-9, mm.RP, "Birge–Louveaux ordering");
    // Null case (ii): no uncertainty ⇒ nothing to gain from modelling it or from a perfect forecast.
    const z = await M.s6Metrics({ ...M.S6, optionOn: on, cv: 1e-9 });
    assert(`s6.null.${key}.VSS`, Math.abs(z.VSS) < 1e-4, z.VSS, "cv = 1e-9 ⇒ VSS ≈ 0 ($M)");
    assert(`s6.null.${key}.EVPI`, Math.abs(z.EVPI) < 1e-4, z.EVPI, "cv = 1e-9 ⇒ EVPI ≈ 0 ($M)");
  }
  const ov = await M.s6OptionValue();
  cmp("s6.option.value", ov.value, p.option.value);
  cmp("s6.option.indifferenceFee", ov.indifferenceFee, p.option.indifferenceFee);
  cmp("s6.option.reserve", ov.reserve, p.option.reserve);
  cmp("s6.option.commit", ov.commit, p.option.commit);
  // s6CostAt (closed form, used for the page's cost curve) must agree with the LP at the LP's commit.
  const rpOff = await M.s6Model({ ...M.S6, optionOn: false }).solve();
  assert("s6.costAt=LP", close(M.s6CostAt(M.S6, rpOff.x.commit), rpOff.obj, 1e-9), M.s6CostAt(M.S6, rpOff.x.commit), "closed-form recourse = LP", rpOff.obj);
}

// ─────────────────────────────── Step 7 ───────────────────────────────
{
  const p = py("s7_diminishing_returns.py");
  drift("s7", { bets: M.S7_BETS, fits: M.CHINCHILLA_FITS }, p.data);
  const w = M.waterFill(200);
  cmp("s7.wf.lam", w.lam, p.waterFill.lam);
  M.S7_BETS.forEach((b, i) => cmp(`s7.wf.x.${b.id}`, w.x[i], p.waterFill.x[i]));
  cmp("s7.wf.value", w.value, p.waterFill.value);
  // KKT: funded bets have marginal return = λ, unfunded ≤ λ, budget spent.
  const kkt = M.S7_BETS.every((b, i) => (w.x[i] > 1e-9 ? close(b.a / (b.b + w.x[i]), w.lam, 1e-9) : b.a / b.b <= w.lam + 1e-12))
    && close(w.x.reduce((s, v) => s + v, 0), 200, 1e-9);
  assert("s7.wf.KKT", kkt, w.lam, "marginal returns equal λ on funded bets, budget binds");
  // Null case (iii): identical bets ⇒ equal split.
  const same = Array.from({ length: 4 }, (_, i) => ({ id: `b${i}`, a: 40, b: 50 }));
  const e = M.waterFill(200, same);
  assert("s7.null.equalSplit", e.x.every(v => Math.abs(v - 50) < 1e-6), e.x, "four identical bets ⇒ 50 each");
  for (const f of M.CHINCHILLA_FITS) {
    const c = M.chinchilla(1e24, f), q = p.chinchilla[f.id];
    for (const k of ["N", "D", "ratio", "L"]) cmp(`s7.chin.${f.id}.${k}`, c[k], q[k]);
    // Independent check: golden-section search on log N of L(N, C/6N) lands on the closed form.
    let lo = Math.log(1e8), hi = Math.log(1e14);
    const g = (Math.sqrt(5) - 1) / 2, L = x => M.chinLoss(Math.exp(x), 1e24, f);
    for (let k = 0; k < 200; k++) { const a = hi - g * (hi - lo), b = lo + g * (hi - lo); if (L(a) < L(b)) hi = b; else lo = a; }
    const Nn = Math.exp((lo + hi) / 2);
    assert(`s7.chin.${f.id}.numeric`, close(Nn, c.N, 1e-4) && L((lo + hi) / 2) >= c.L - 1e-12, Nn, "golden-section optimum = closed form (1e-4)", c.N);
  }
}

// ─────────────────────────────── Capstone ───────────────────────────────
{
  const p = py("capstone_allocation_memo.py");
  drift("cap", M.CAP, p.data);
  assert("cap.ownCost", M.CAP.ownCost === 0, M.CAP.ownCost, "py twin treats owned capacity as sunk (cost 0)");
  for (const risk of [0, 0.2, 0.6]) {
    const q = { ...M.CAP, risk }, r = await M.capModel(q).solve(), s = M.capScore(q, r), y = p[String(risk)];
    for (const k of ["hyp", "neo", "opt", "upg"]) cmp(`cap.${risk}.${k}`, r.x[k], y[k]);
    cmp(`cap.${risk}.expected`, s.expected, y.expected);
    cmp(`cap.${risk}.worst`, s.worst, y.worst);
    numbers[`cap.${risk}.cvar`] = s.cvar; numbers[`cap.${risk}.slo`] = s.slo;
    if (risk > 0) assert(`cap.${risk}.obj`, close(r.obj, (1 - risk) * s.expected + risk * s.cvar, 1e-7), r.obj,
      "objective = (1−λ)·E + λ·CVaR90", (1 - risk) * s.expected + risk * s.cvar);
  }
}

// ─────────────────────────── Null case (i): all walls slack ───────────────────────────
{
  // Scaling every RHS ×100 alone is NOT a null case here: the anchor lease has no market cap, so it
  // grows until some ×100 wall binds. Cap each product with a COLUMN bound instead (not a row), keep
  // the floor below the anchor's cap, and scale every row ×100: now no row is pressed.
  const S = M.S1, X = 100;
  const p = { ...S, gridMW: S.gridMW * X, liquidMW: S.liquidMW * X, airMW: S.airMW * X, fabric: S.fabric * X,
    blackwellK: S.blackwellK * X, demand: Object.fromEntries(Object.entries(S.demand).map(([k, v]) => [k, v * X])) };
  const naive = await M.s1Model(p).solve();
  const naiveBind = M.s1Model(p).rows.filter(row => isBinding(row, naive.act[row.name])).map(row => row.name);
  info("s1.null.naiveScaleBinding", naiveBind, "walls still binding after a plain ×100 scale (why the null case also caps columns)");
  const m = M.s1Model(p);
  for (const q of M.S1_PRODUCTS) m.setBounds(q.id, 0, q.id === "anchor" ? 100 : S.demand[q.id]);
  const r = await m.solve();
  const maxDual = Math.max(...m.rows.map(row => Math.abs(r.dual[row.name])));
  const anyBinding = m.rows.some(row => isBinding(row, r.act[row.name]));
  assert("s1.null.allDualsZero", maxDual === 0 && !anyBinding, maxDual, "no wall pressed ⇒ every row dual is 0");
}

// ─────────────────────────────── Report ───────────────────────────────
const w = Math.max(...rows.map(r => r.id.length));
const counts = { PASS: 0, DEGEN: 0, FAIL: 0, INFO: 0 };
console.log(`${"check".padEnd(w)}  ${"js".padStart(18)}  ${"py / ref".padStart(22)}  status  note`);
console.log("─".repeat(w + 70));
for (const r of rows) {
  counts[r.status]++;
  console.log(`${r.id.padEnd(w)}  ${fmt(r.js).padStart(18)}  ${fmt(r.ref).padStart(22)}  ${r.status.padEnd(6)}  ${r.note}`);
}
console.log("─".repeat(w + 70));
console.log(`PASS ${counts.PASS} · DEGEN ${counts.DEGEN} · INFO ${counts.INFO} · FAIL ${counts.FAIL}`);

mkdirSync(join(ROOT, "tests/out"), { recursive: true });
writeFileSync(join(ROOT, "tests/out/numbers.json"), JSON.stringify({
  generated: new Date().toISOString(),
  note: "Every number checked by tests/check.mjs (JS values; py twins agree to 1e-6 unless status says DEGEN).",
  status: Object.fromEntries(rows.map(r => [r.id, r.status])),
  numbers,
}, null, 1));
console.log("wrote tests/out/numbers.json");
process.exit(counts.FAIL ? 1 : 0);
