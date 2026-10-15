// Step 8 · The modeler's desk — AI writes the model, you own it: a verifier, OptiGuide-style what-ifs, and "spot the LP".
import { h, f, seg, predict, clicks, say, beyond, touch, ledger } from "../ui.js";
import { Model } from "../lp.js";
import { S2, s2Model, s2Stack } from "../models.js";

// The word problem, verbatim on the page.
const WORD = `You need 60 MW in Q1 and 140 MW in Q2. Options: a neocloud lease signed in Q1 runs both quarters at $2.6M per MW-quarter; a lease signed in Q2 runs Q2 only at $2.6M; spot costs $4.2M per MW-quarter, at most 30 MW a quarter. Or build a site: $25M fixed, it energizes in Q2, delivers up to 80 MW at $1.0M per MW-quarter. Minimize cost.`;

/** Four formulations an AI assistant might hand you. Only A is right. Each is real code-shaped text plus the JS model it describes. */
function formulations({ d1 = 60, d2 = 140 } = {}) {
  const base = (name, { q2sense = ">=", carry = true, M = 80 } = {}) => {
    const m = new Model(name, "min");
    m.addVar("L1", { cost: 5.2 }); m.addVar("L2", { cost: 2.6 });
    m.addVar("sp1", { cost: 4.2, ub: 30 }); m.addVar("sp2", { cost: 4.2, ub: 30 });
    m.addVar("y", { cost: 25, ub: 1, int: true }); m.addVar("s2", { cost: 1.0 });
    m.addRow("q1", { L1: 1, sp1: 1 }, { lb: d1 });
    const t = { L2: 1, sp2: 1, s2: 1 }; if (carry) t.L1 = 1;
    m.addRow("q2", t, q2sense === ">=" ? { lb: d2 } : { ub: d2 });
    m.addRow("site", { s2: 1, y: -M }, { ub: 0 });
    return m;
  };
  return [
    { id: "A", model: base("A"), bug: null, code: `L1 = m.addVariable(cost=5.2)        # lease signed Q1: $2.6 x 2 quarters
L2 = m.addVariable(cost=2.6)        # lease signed Q2
sp1 = m.addVariable(ub=30, cost=4.2); sp2 = m.addVariable(ub=30, cost=4.2)
y  = m.addBinary(cost=25)           # build the site?
s2 = m.addVariable(cost=1.0)        # MW from the site in Q2
m.addConstr(L1 + sp1 >= 60)                 # Q1 demand
m.addConstr(L1 + L2 + sp2 + s2 >= 140)      # Q2 demand (Q1 lease still running)
m.addConstr(s2 <= 80 * y)                   # site only if built` },
    { id: "B", model: base("B", { q2sense: "<=" }), bug: "sign", code: `L1 = m.addVariable(cost=5.2)
L2 = m.addVariable(cost=2.6)
sp1 = m.addVariable(ub=30, cost=4.2); sp2 = m.addVariable(ub=30, cost=4.2)
y  = m.addBinary(cost=25)
s2 = m.addVariable(cost=1.0)
m.addConstr(L1 + sp1 >= 60)                 # Q1 demand
m.addConstr(L1 + L2 + sp2 + s2 <= 140)      # Q2 demand
m.addConstr(s2 <= 80 * y)` },
    { id: "C", model: base("C", { carry: false }), bug: "flow", code: `L1 = m.addVariable(cost=5.2)
L2 = m.addVariable(cost=2.6)
sp1 = m.addVariable(ub=30, cost=4.2); sp2 = m.addVariable(ub=30, cost=4.2)
y  = m.addBinary(cost=25)
s2 = m.addVariable(cost=1.0)
m.addConstr(L1 + sp1 >= 60)                 # Q1 demand
m.addConstr(L2 + sp2 + s2 >= 140)           # Q2 demand
m.addConstr(s2 <= 80 * y)` },
    { id: "D", model: base("D", { M: 50 }), bug: "bigM", code: `L1 = m.addVariable(cost=5.2)
L2 = m.addVariable(cost=2.6)
sp1 = m.addVariable(ub=30, cost=4.2); sp2 = m.addVariable(ub=30, cost=4.2)
y  = m.addBinary(cost=25)
s2 = m.addVariable(cost=1.0)
m.addConstr(L1 + sp1 >= 60)                 # Q1 demand
m.addConstr(L1 + L2 + sp2 + s2 >= 140)      # Q2 demand
m.addConstr(s2 <= 50 * y)                   # big-M: site only if built` },
  ];
}

/** An independent check of a plan against the word problem itself (not against any formulation). */
function audit(x, { d1 = 60, d2 = 140 } = {}) {
  const q1 = x.L1 + x.sp1, q2 = x.L1 + x.L2 + x.sp2 + (x.y > 0.5 ? Math.min(x.s2, 80) : 0);
  const cost = 5.2 * x.L1 + 2.6 * x.L2 + 4.2 * (x.sp1 + x.sp2) + 25 * (x.y > 0.5 ? 1 : 0) + 1.0 * x.s2;
  return { q1, q2, cost, ok: q1 >= d1 - 1e-6 && q2 >= d2 - 1e-6 };
}

export async function render(root) {
  root.append(
    h("p", { class: "lede", html: "The elective's GenAI policy is the right one: let AI write the model fast, but <b>own it</b>. You have to be able to explain and defend every line. The trouble is that AI's optimization bugs are quiet. The solve succeeds, the answer looks plausible, and it's wrong. This step gives you four AI-written formulations of one word problem and a verifier to catch the wrong ones." }),
    h("div", { class: "callout", html: `<b>The word problem.</b> ${WORD}` }),
    predict({
      q: "Read the four formulations below before running anything. How many are correct?",
      options: ["All four", "Three", "Two", "Only one"],
      answer: 3,
      explain: "Only A. B flips the Q2 demand sign, C forgets that the Q1 lease is still running in Q2 (a missing flow-balance term), and D's big-M is too small to let the site deliver its full 80 MW. Run the verifier to see which check catches each, because no single check catches all three.",
    }));

  const forms = formulations();
  const codePre = h("pre", { class: "lp", style: { maxHeight: "none" } }, forms[0].code);
  root.append(h("div", { class: "card" },
    h("div", { class: "card-h" }, h("h3", {}, "Four formulations"), h("span", { class: "sub" }, "Python, as an assistant would hand it to you. Read each one before running the verifier.")),
    seg({ label: "Formulation", options: forms.map(fm => [fm.id, `Formulation ${fm.id}`]), value: "A", onchange: v => { codePre.textContent = forms.find(q => q.id === v).code; } }),
    h("div", { style: { marginTop: "10px" } }, codePre)));

  const verBox = h("div", {});
  const runBtn = h("button", { class: "btn", type: "button" }, "Run the verifier on all four");
  root.append(h("div", { class: "card" }, h("div", { class: "card-h" }, h("h3", {}, "(a) The verifier"), h("span", { class: "sub" }, "Each check is cheap, and each catches a different kind of bug.")), runBtn, verBox));
  runBtn.addEventListener("click", async e => {
    touch(e.target); runBtn.disabled = true;
    const results = [];
    // Hand-solvable toy: 10 MW both quarters. By hand: one 10 MW Q1 lease covers both quarters for 10 × 5.2 = $52M (spot would be $84M).
    const HAND = 52;
    for (const fm of forms) {
      const r = await fm.model.solve();
      const a = audit(r.x);
      const toy = await formulations({ d1: 10, d2: 10 }).find(q => q.id === fm.id).model.solve();
      // Big-M reachability: force the site on and maximize what it can deliver.
      const reach = fm.model.toModelData ? await (async () => { const m2 = formulations().find(q => q.id === fm.id).model; m2.setBounds("y", 1, 1); m2.vars.forEach(v => { v.cost = 0; }); m2.setCost("s2", -1); m2.setRow("q2", { lb: -Infinity, ub: Infinity }); const rr = await m2.solve(); return rr.status === "optimal" ? rr.x.s2 : NaN; })() : NaN;
      // Sensitivity sanity: Q2 demand's dual (fix y at its optimum, then LP duals) should be positive.
      const m3 = formulations().find(q => q.id === fm.id).model; m3.setBounds("y", Math.round(r.x.y), Math.round(r.x.y)); m3.vars.find(v => v.name === "y").int = false;
      const r3 = await m3.solve();
      results.push({ fm, r, a, toy: toy.obj, reach, dual: r3.dual?.q2 ?? NaN });
    }
    const pass = (ok, txt) => h("td", { style: { color: ok ? "var(--green)" : "var(--wall-d)", fontWeight: 600 } }, (ok ? "✓ " : "✗ ") + txt);
    verBox.innerHTML = "";
    verBox.append(h("div", { class: "tbl-wrap" }, h("table", { class: "t" },
      h("thead", {}, h("tr", {}, ["", "Solver says", "1 · Audit the plan against the word problem", "2 · Hand-solvable toy (10 + 10 MW → $52M)", "3 · Can the site reach 80 MW?", "4 · Does more Q2 demand cost more?"].map(t => h("th", {}, t)))),
      h("tbody", {}, results.map(({ fm, r, a, toy, reach, dual }) => h("tr", {},
        h("td", {}, h("b", {}, fm.id)),
        h("td", { class: "num" }, `optimal, ${f.m(r.obj, 1)}`),
        pass(a.ok && Math.abs(a.cost - r.obj) < 1e-6, a.ok ? `serves ${a.q1.toFixed(0)} / ${a.q2.toFixed(0)} MW` : `serves only ${a.q1.toFixed(0)} / ${a.q2.toFixed(0)} MW`),
        pass(Math.abs(toy - HAND) < 1e-6, `${f.m(toy, 0)}`),
        pass(Math.abs(reach - 80) < 1e-6, `${isNaN(reach) ? "?" : reach.toFixed(0)} MW`),
        pass(dual > 1e-9, `dual ${f.n(dual, 2)}`)))))),
      h("div", { class: "callout", style: { marginTop: "10px" }, html: "<b>What each check caught.</b> B's flipped sign fails the audit, the toy, and the dual check (more Q2 demand costs it nothing, a giveaway). C's missing carryover passes the audit (it over-serves Q2) but fails the toy: it buys a second lease for capacity it already has. D passes the audit, the toy and the dual check, but its site can only reach 50 MW. <b>Only the reachability check catches a too-small big-M.</b> And notice which answer looks best: B reports the lowest cost of the four. A wrong model usually gets adopted because its answer is attractive." }));
    ledger.put("s8-bug", { what: "Step 8 · cost of trusting formulation C over A", price: `${f.m(results[2].r.obj - results[0].r.obj, 1)} on a two-quarter plan`, note: "A missing flow-balance term: the solve succeeds and over-buys." });
    runBtn.textContent = "Verifier run";
  });

  // (b) Ask the model
  const askBox = h("div", {});
  const WHATIF = [
    ["Blackwell delivery slips: build lead +2 quarters", p => ({ ...p, buildLead: p.buildLead + 2 })],
    ["Power price +30% (build cost per MW-quarter rises by 30% of its power share)", p => ({ ...p, buildCost: p.buildCost + 0.3 * 0.833 / 4 })],
    ["Neocloud lease price +15%", p => ({ ...p, leaseCost: p.leaseCost * 1.15 })],
    ["The board drops the take-or-pay floor", p => ({ ...p, floorOn: false })],
    ["Demand grows 14% a quarter, not 10%", p => ({ ...p, growth: 0.14 })],
  ];
  const sum = (st, k) => st.slice(0, 12).reduce((a, q) => a + q[k], 0);
  async function ask(i) {
    const p0 = structuredClone(S2), p1 = WHATIF[i][1](p0);
    const r0 = await s2Model(p0).solve(), r1 = await s2Model(p1).solve();
    const a = s2Stack(p0, r0), b = s2Stack(p1, r1);
    const row = (lab, v0, v1, fmt) => h("tr", {}, h("td", {}, lab), h("td", { class: "num" }, fmt(v0)), h("td", { class: "num" }, fmt(v1)), h("td", { class: "num", style: { color: v1 > v0 + 1e-6 ? "var(--wall-d)" : v1 < v0 - 1e-6 ? "var(--green)" : "inherit" } }, (v1 - v0 >= 0 ? "+" : "−") + fmt(Math.abs(v1 - v0))));
    askBox.innerHTML = "";
    askBox.append(h("p", {}, h("b", {}, "“" + WHATIF[i][0] + "?”"), " The model re-solves and diffs the plan:"),
      h("div", { class: "tbl-wrap" }, h("table", { class: "t" }, h("thead", {}, h("tr", {}, ["Step 2 plan, 12 quarters", "Before", "After", "Change"].map(t => h("th", {}, t)))),
        h("tbody", {}, row("Total cost ($M)", r0.obj, r1.obj, v => f.int(v)), row("MW-quarters from builds", sum(a, "build"), sum(b, "build"), v => f.int(v)), row("MW-quarters from new leases", sum(a, "lease"), sum(b, "lease"), v => f.int(v)),
          row("MW-quarters on spot", sum(a, "spot"), sum(b, "spot"), v => f.int(v)), row("MW-quarters unserved", sum(a, "short"), sum(b, "short"), v => f.int(v))))));
  }
  root.append(h("div", { class: "card" },
    h("div", { class: "card-h" }, h("h3", {}, "(b) Ask the model"), h("span", { class: "sub" }, "The OptiGuide pattern: the language model turns a question into a change to the model, and the solver answers it. Here the questions are pre-written, so no API key is needed.")),
    h("div", { class: "btnrow" }, WHATIF.map(([q], i) => h("button", { class: "btn small ghost", type: "button", onclick: e => { touch(e.target); ask(i); } }, q))), askBox));

  // (c) Spot the LP
  const CARDS = [
    ["A neocloud must decide how many GB200 racks to order for each of the next four quarters, given lead times, a capex budget and contracted demand.", true, "Decisions: racks per quarter. Objective: minimize cost (or maximize margin). Constraints: budget, lead times, demand. A multiperiod LP/MIP (step 2)."],
    ["Forecast next quarter's token demand from the last three years of usage.", false, "That's prediction, not optimization: there's no decision and no constraint. It becomes an optimization input (step 6), but on its own it's a forecasting problem."],
    ["Route 40 inference requests a second across three GPU pools to minimize latency without exceeding any pool's capacity.", true, "Decisions: share of traffic to each pool. Objective: latency. Constraints: pool capacity. An LP (a transportation problem)."],
    ["Negotiate the strike price of an “up to” with a neocloud's CFO.", false, "A negotiation has two parties with their own objectives. There's no single decision-maker optimizing, but each side's walk-away price comes from an optimization (step 6's indifference fee)."],
    ["Choose which 3 of 9 sovereign-AI deals to pursue this year, given deal-team hours and a rule that you can't take both Gulf deals.", true, "Decisions: pursue or not (binary). Objective: expected value. Constraints: hours, an either/or rule. A knapsack-style MIP (step 4)."],
    ["Set prices for batch, standard and priority API tiers to maximize revenue from a fixed fleet.", true, "Decisions: prices or capacity per tier. Objective: revenue. Constraints: fleet capacity. Revenue management (step 5); nonlinear if prices move demand."],
    ["Decide whether the company should enter the AI chip market.", false, "Strategy, not optimization: the options aren't enumerable and the objective isn't a formula. You might optimize sub-questions inside it (which fab, how much capacity)."],
    ["Split a $2B compute budget between pretraining, RL and inference so the next model ships with the best capability per dollar.", true, "Decisions: compute per program. Objective: capability (concave). Constraint: budget. A nonlinear allocation, and the water-filling rule of step 7."],
  ];
  const spot = h("div", { class: "quiz" });
  CARDS.forEach(([q, isOpt, why], i) => {
    const rev = h("div", { class: "reveal" });
    const mk = (lab, val) => h("button", { class: "opt", type: "button", onclick: e => {
      touch(e.target);
      [...e.target.parentNode.children].forEach(b => { b.disabled = true; });
      e.target.classList.add(val === isOpt ? "right" : "wrong", "chosen");
      rev.innerHTML = `<b>${val === isOpt ? "Right." : "Not quite."}</b> ${why}`; rev.classList.add("on");
    } }, lab);
    spot.append(h("div", { class: "qq" }, h("div", {}, h("span", { class: "muted small" }, `${i + 1}. `), q), h("div", { class: "opts", style: { marginTop: "8px" } }, mk("Optimization problem", true), mk("Not one", false)), rev));
  });
  root.append(h("div", { class: "card" }, h("div", { class: "card-h" }, h("h3", {}, "(c) Spot the LP"), h("span", { class: "sub" }, "The course's application-report skill: is there a decision, an objective and constraints? Three of the eight aren't optimization problems at all.")), spot));

  root.append(
    clicks(null, h("ul", {},
      h("li", { html: "<b>Optimization bugs are quiet.</b> A wrong sign, a missing flow-balance term or a small big-M all solve to “optimal.” The only defense is checks that don't trust the model: an audit against the word problem, a hand-solvable toy, reachability, and dual signs." }),
      h("li", { html: "<b>LLM over the solver, not instead of it.</b> Let the language model write and modify formulations and explain results; let the solver compute; let a verifier check. That's OptiGuide's design, and it's how every number on this site is produced." }),
      h("li", { html: "<b>Spotting the problem is the skill.</b> If you can name the decisions, the objective and the walls, you can hand the rest to code." }))),
    say("I let the model draft the formulation, but I run four checks before I believe it: audit the plan against the actual problem, solve a toy I can do by hand, test that every big-M can be reached, and check that the duals have the right signs."),
    beyond([
      ["Research", "OptiMUS", "Stanford (ICML 2024): an LLM agent that formulates, codes, debugs and solves (MI)LPs from natural language, evaluated on the NL4Opt and NLP4LP benchmarks."],
      ["Research", "OptiGuide", "Microsoft Research (2023): an LLM translates supply-chain questions (“what if this supplier is down?”) into solver code over an existing model and explains the result. Tested on Azure server placement."],
      ["The 2026 solver landscape", "Commercial, open, and on GPUs", "Commercial: Gurobi, CPLEX, Xpress. Open: HiGHS (this site), SCIP, OR-Tools. GPU: NVIDIA cuOpt, open-sourced under Apache-2.0, with PDLP-family LP and MIP solvers. GPUs now solve the LP that allocates GPUs."],
    ]));
}
