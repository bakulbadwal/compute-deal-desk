// Capstone · The allocation memo — a six-quarter, five-future, four-contract plan you build, score, and defend.
import { h, s, f, slider, toggle, clicks, say, modelCard, readout, scheduler, scale, niceTicks, axes, legend, css, ledger, tp, touch } from "../ui.js";
import { CAP, capModel, capScore, capDemand } from "../models.js";
import { perMWyrToGpuHr } from "../econ.js";

export async function render(root) {
  const p = structuredClone(CAP);
  const allow = { hyp: true, neo: true, opt: true, upg: true };
  let plan = { hyp: 0, neo: 0, opt: 0, upg: 0 }, best = null, mine = null, model = null;

  root.append(
    h("p", { class: "lede", html: "The capstone, standing in for the course's group project. You're on compute strategy at a <b>mid-size lab</b>, planning <b>six quarters</b> (Q1 '27–Q2 '28). Inference demand starts near 190 MW and grows about 12% a quarter, but five futures are possible, from a bust to a breakout. The next pretraining run needs <b>160 MW in Q3–Q4</b>, no excuses. Your campus can power <b>150 MW</b>, with a 40 MW upgrade available from Q4. Sign your contracts <b>now</b>; demand reveals itself quarter by quarter." }),
    h("div", { class: "card flat" }, h("h3", {}, "The menu"),
      h("div", { class: "tbl-wrap" }, h("table", { class: "t left" }, h("thead", {}, h("tr", {}, ["Contract", "When it's live", "Price", "≈ $/GPU-hr", "Flexibility"].map(t => h("th", {}, t)))),
        h("tbody", {},
          h("tr", {}, h("td", {}, "Hyperscaler reserved"), h("td", {}, "All six quarters"), h("td", { class: "num" }, `${f.m(p.hypPrice)} per MW-quarter`), h("td", { class: "num" }, f.gh(perMWyrToGpuHr(p.hypPrice * 4))), h("td", {}, "None: committed")),
          h("tr", {}, h("td", {}, "Neocloud take-or-pay"), h("td", {}, "Q3 onward (two-quarter lead)"), h("td", { class: "num" }, `${f.m(p.neoPrice)} per MW-quarter`), h("td", { class: "num" }, f.gh(perMWyrToGpuHr(p.neoPrice * 4))), h("td", {}, "None: committed")),
          h("tr", {}, h("td", {}, "Neocloud “up to”"), h("td", {}, "Q2 onward"), h("td", { class: "num" }, `${f.m(p.optFee)} fee + ${f.m(p.optStrike)} when used`), h("td", { class: "num" }, `${f.gh(perMWyrToGpuHr(p.optFee * 4))} + ${f.gh(perMWyrToGpuHr(p.optStrike * 4))}`), h("td", {}, "Exercise any amount up to what you reserved, each quarter")),
          h("tr", {}, h("td", {}, "Campus power upgrade"), h("td", {}, "Q4 onward, ≤ 40 MW"), h("td", { class: "num" }, `${f.m(p.upgradePrice)} per MW, once`), h("td", {}, "—"), h("td", {}, "Lets your own campus run more")),
          h("tr", {}, h("td", {}, "Spot"), h("td", {}, "Any quarter, ≤ 50 MW"), h("td", { class: "num" }, `${f.m(p.spotPrice)} per MW-quarter`), h("td", { class: "num" }, f.gh(perMWyrToGpuHr(p.spotPrice * 4))), h("td", {}, "Full, but thin and expensive")),
          h("tr", {}, h("td", {}, "Unserved inference"), h("td", {}, "—"), h("td", { class: "num" }, `${f.m(p.shortPrice)} per MW-quarter lost`), h("td", {}, "—"), h("td", {}, "Training can never go unserved"))))),
      h("p", { class: "note" }, "All prices are teaching values (per-deal compute pricing isn't public). Futures: bust 10%, slow 20%, base 40%, hot 20%, breakout 10%.")));

  // Plan builder
  const sl = {
    hyp: slider({ label: "Hyperscaler reserved (MW)", min: 0, max: 300, step: 1, value: 0, fmt: v => f.mw(v), id: "caph", oninput: v => { plan.hyp = v; runMine(); } }),
    neo: slider({ label: "Neocloud take-or-pay (MW)", min: 0, max: 300, step: 1, value: 0, fmt: v => f.mw(v), id: "capn", oninput: v => { plan.neo = v; runMine(); } }),
    opt: slider({ label: "“Up to” reserved (MW)", min: 0, max: 300, step: 1, value: 0, fmt: v => f.mw(v), id: "capo", oninput: v => { plan.opt = v; runMine(); } }),
    upg: slider({ label: "Campus power upgrade (MW)", min: 0, max: 40, step: 1, value: 0, fmt: v => f.mw(v), id: "capu", oninput: v => { plan.upg = v; runMine(); } }),
  };
  const setPlan = q => { plan = { ...q }; for (const k of Object.keys(sl)) sl[k].set(Math.round(plan[k])); runMine(); };
  const grade = h("div", { class: "callout" });
  const ro = { exp: readout("Expected cost", "", { cls: "brass" }), worst: readout("Worst future's cost", "", {}), slo: readout("Inference demand served (expected)", "", {}), gap: readout("Versus the solver's plan", "", {}) };
  const scenBox = h("div", { class: "chartbox" }), mixBox = h("div", { class: "chartbox" });
  root.append(h("div", { class: "card" },
    h("div", { class: "card-h" }, h("h3", {}, "Build your plan"), h("span", { class: "sub" }, "Set the four contracts. The solver plays out every future with the best spot and exercise decisions, then scores your plan.")),
    h("div", { class: "grid2" }, h("div", {}, h("h4", {}, "Cost in each future: your plan vs the solver's"), scenBox, legend([[css("--blue"), "Your plan"], [css("--brass"), "Solver's plan"]]), h("h4", { style: { marginTop: "12px" } }, "Your capacity mix, base-case future"), mixBox,
      legend([[css("--chart-6"), "Own campus"], [css("--plum"), "Hyperscaler"], [css("--blue"), "Neocloud take-or-pay"], [css("--green"), "“Up to” exercised"], [css("--brass"), "Spot"], [css("--wall"), "Unserved"]])),
      h("div", { class: "ctrl" }, ...Object.values(sl),
        h("div", { class: "btnrow" },
          h("button", { class: "btn small", type: "button", onclick: e => { touch(e.target); setPlan(best.r.x); } }, "Show me the solver's plan"),
          h("button", { class: "btn small ghost", type: "button", onclick: e => { touch(e.target); setPlan({ hyp: 0, neo: 0, opt: 0, upg: 0 }); } }, "All spot"),
          h("button", { class: "btn small ghost", type: "button", onclick: e => { touch(e.target); planToBase(); } }, "Commit to the base case")),
        h("h4", {}, "Risk appetite and the menu"),
        slider({ label: "Weight on the worst 10% of outcomes (λ)", min: 0, max: 1, step: 0.05, value: p.risk, fmt: v => v.toFixed(2), id: "capr", oninput: v => { p.risk = v; runAll(); } }),
        toggle({ label: "Hyperscaler reserved available", checked: true, onchange: v => { allow.hyp = v; runAll(); } }),
        toggle({ label: "Neocloud take-or-pay available", checked: true, onchange: v => { allow.neo = v; runAll(); } }),
        toggle({ label: "“Up to” available", checked: true, onchange: v => { allow.opt = v; runAll(); } }),
        toggle({ label: "Campus power upgrade available", checked: true, onchange: v => { allow.upg = v; runAll(); } }))),
    h("div", { class: "readouts" }, ro.exp, ro.worst, ro.slo, ro.gap), grade));

  const priceBox = h("div", {});
  root.append(h("div", { class: "card" }, h("div", { class: "card-h" }, h("h3", {}, "The solver's price list for this deal"), h("span", { class: "sub" }, "Shadow prices and reduced costs from the optimal plan: the numbers you negotiate with.")), priceBox));

  const memo = h("textarea", { class: "memo", "aria-label": "Your allocation memo", oninput: () => { memo.dataset.edited = "1"; } });
  const copyBtn = h("button", { class: "btn small ghost", type: "button", onclick: async e => { touch(e.target); try { await navigator.clipboard.writeText(memo.value); copyBtn.textContent = "Copied"; } catch { memo.select(); } } }, "Copy memo");
  root.append(h("div", { class: "card" },
    h("div", { class: "card-h" }, h("h3", {}, "Write the memo"), h("span", { class: "sub" }, "Six sentences, in the AI Deals field guide's “walk me through a deal” order. A draft from your current plan; edit it until you'd sign it.")),
    h("div", { class: "btnrow", style: { marginBottom: "8px" } }, h("button", { class: "btn small", type: "button", onclick: e => { touch(e.target); memo.value = draft(); } }, "Draft from my current plan"), copyBtn),
    memo,
    h("details", { style: { marginTop: "10px" } }, h("summary", { class: "small" }, "The six-sentence checklist"),
      h("ol", { class: "small" }, h("li", {}, "Parties and the trade: who needed what from whom."), h("li", {}, "The instrument: take-or-pay, “up to,” reserved, an upgrade."), h("li", {}, "The number and what kind of number it is: committed, “up to,” expected."), h("li", {}, "Who bears which risk: utilization, price, delivery."), h("li", {}, "What could go wrong, and the one number you'd want."), h("li", {}, "The shadow price you'd negotiate with.")))));

  const card = modelCard({
    decisions: "<b>Now:</b> MW of hyperscaler reserved, neocloud take-or-pay and “up to” reserved, and MW of campus upgrade. <b>Per future and quarter:</b> own-campus MW, spot, “up to” exercised, unserved inference.",
    objective: "Minimize (1 − λ) × expected cost + λ × CVaR<sub>90%</sub> of cost across the five futures (Rockafellar–Uryasev), with each future weighted by its probability.",
    constraints: "For every future and quarter: own + hyperscaler + neocloud (from Q3) + exercised (from Q2) + spot + unserved ≥ inference demand + training. Own ≤ 150 + upgrade (from Q4). Exercised ≤ reserved. Spot ≤ 50. Unserved ≤ inference demand (training is never shorted).",
    py: "capstone_allocation_memo.py",
    excel: "five copies of a six-column sheet sharing four first-stage cells: about 200 changing cells and 100 constraints. That's past where Solver's free engine is comfortable, which is exactly where the course reaches for Gurobi, and where code is simply easier.",
    getLP: () => model?.toLP() || "",
  });
  root.append(
    clicks(null, h("ul", {},
      h("li", { html: "<b>Mix contracts by flexibility, not just price.</b> The solver layers cheap committed capacity under the demand you're nearly sure of, an “up to” over the range you might need, and spot for the tail. All-spot costs about two and a half times as much and still leaves demand unserved." }),
      h("li", { html: "<b>Risk appetite moves commitments.</b> Raise λ and the plan commits more to protect the breakout future, at a higher expected cost. Putting that trade in front of a CFO is the memo's job." }),
      h("li", { html: "<b>The shadow prices are the negotiation.</b> What a MW of campus power is worth, what the “up to” would need to cost to stop being worth it, how far the neocloud's price can rise before you'd switch. Each is one line on the price list above." }))),
    say("We layer committed capacity under the demand we're nearly sure of, buy an “up to” over the range we might need, and keep spot for the tail. A megawatt of our own power is worth about $16.5 million over the period, so the upgrade is the first thing I'd sign."),
    card);

  function draft() {
    const sc = mine?.sc, b = best?.sc;
    if (!sc) return "";
    const pw = b.powerDual;
    return `Our lab needs inference capacity that could run anywhere from ${f.mw(capDemand(p)[0][5])} to ${f.mw(capDemand(p)[4][5])} by Q2 '28, plus 160 MW for the next pretraining run in Q3–Q4; neoclouds and hyperscalers need committed buyers to finance their builds.
We'd sign ${f.mw(plan.hyp)} of hyperscaler reserved capacity, ${f.mw(plan.neo)} of neocloud take-or-pay from Q3, an "up to" reservation of ${f.mw(plan.opt)} from Q2, and ${f.mw(plan.upg)} of campus power upgrade.
The committed spend is ${f.money(sc.fixed)} regardless of demand; expected all-in cost is ${f.money(sc.expected)}, and ${f.money(sc.worst)} in the worst future we modeled (teaching prices).
We carry utilization risk on the committed MW; the neocloud carries delivery risk and is paid a fee for the "up to"; spot and unserved demand absorb the tail, and we expect to serve ${f.pct(sc.slo, 1)} of inference demand.
The main risk is a breakout year beyond the "up to" plus spot, and the number I'd want is the neocloud's earliest firm date for the Q3 tranche.
Our own power is worth about ${f.m(pw / 6, 1)} per MW per quarter to us, so we'd pay up to that for faster energization, and we walk if the "up to" fee rises above the indifference price.`;
  }
  function drawScen() {
    const W = 520, H = 240, m = { l: 56, r: 10, t: 12, b: 36 };
    const a = mine.sc.per, b = best.sc.per, max = Math.max(...a.map(q => q.cost), ...b.map(q => q.cost)) * 1.08;
    const x = scale(0, a.length, m.l, W - m.r), y = scale(0, max, H - m.b, m.t), bw = (x(1) - x(0)) * 0.34;
    const svg = s("svg", { class: "chart", viewBox: `0 0 ${W} ${H}`, role: "img", "aria-label": "Cost per future, your plan versus the solver's" });
    svg.append(axes({ x: v => x(v + 0.5), y, W, H, m, xt: [0, 1, 2, 3, 4], xfmt: i => p.scen[i].label, yt: niceTicks(0, max, 5), yfmt: v => "$" + f.int(v), ylab: "$M over six quarters" }));
    a.forEach((q, i) => {
      svg.append(s("rect", { x: x(i) + (x(1) - x(0)) / 2 - bw - 2, y: y(q.cost), width: bw, height: y(0) - y(q.cost), fill: css("--blue"), rx: 2 }, s("title", {}, `Your plan, ${q.label}: ${f.money(q.cost)}`)));
      svg.append(s("rect", { x: x(i) + (x(1) - x(0)) / 2 + 2, y: y(b[i].cost), width: bw, height: y(0) - y(b[i].cost), fill: css("--brass"), rx: 2 }, s("title", {}, `Solver, ${q.label}: ${f.money(b[i].cost)}`)));
    });
    scenBox.innerHTML = ""; scenBox.append(svg);
  }
  function drawMix() {
    const r = mine.r, s0 = p.scen.findIndex(q => q.id === "base"), D = capDemand(p)[s0];
    const W = 520, H = 220, m = { l: 48, r: 10, t: 12, b: 30 };
    const rows = Array.from({ length: p.T }, (_, i) => {
      const t = i + 1, k = `${s0}_${t}`;
      return { own: r.x[`own_${k}`], hyp: r.x.hyp, neo: t >= p.neoFrom ? r.x.neo : 0, ex: r.x[`ex_${k}`] || 0, spot: r.x[`spot_${k}`], short: r.x[`short_${k}`], need: D[i] + p.train[i] };
    });
    const max = Math.max(...rows.map(q => Math.max(q.need, q.own + q.hyp + q.neo + q.ex + q.spot + q.short))) * 1.1;
    const x = scale(0, p.T, m.l, W - m.r), y = scale(0, max, H - m.b, m.t), bw = (x(1) - x(0)) * 0.66;
    const svg = s("svg", { class: "chart", viewBox: `0 0 ${W} ${H}`, role: "img", "aria-label": "Capacity mix by quarter in the base case" });
    svg.append(axes({ x: v => x(v + 0.5), y, W, H, m, xt: [0, 1, 2, 3, 4, 5], xfmt: i => `Q${(i % 4) + 1} '${27 + Math.floor(i / 4)}`, yt: niceTicks(0, max, 4), ylab: "MW" }));
    rows.forEach((q, i) => {
      let acc = 0;
      for (const [k, c] of [["own", "--chart-6"], ["hyp", "--plum"], ["neo", "--blue"], ["ex", "--green"], ["spot", "--brass"], ["short", "--wall"]]) {
        const v = q[k]; if (v < 1e-6) continue;
        svg.append(s("rect", { x: x(i) + ((x(1) - x(0)) - bw) / 2, y: y(acc + v), width: bw, height: y(acc) - y(acc + v), fill: css(c) })); acc += v;
      }
      svg.append(s("line", { x1: x(i) + 4, x2: x(i + 1) - 4, y1: y(q.need), y2: y(q.need), stroke: css("--ink"), "stroke-width": 2.5 }));
    });
    mixBox.innerHTML = ""; mixBox.append(svg);
  }
  function drawGrade() {
    const g = (mine.sc.expected * (1 - p.risk) + mine.sc.cvar * p.risk) / (best.sc.expected * (1 - p.risk) + best.sc.cvar * p.risk) - 1;
    const slo = mine.sc.slo;
    const tier = g <= 0.01 && slo >= 0.995 ? ["Desk-ready", "ok", "Within 1% of the solver's objective and serving ≥ 99.5% of demand. Sign it."]
      : g <= 0.05 ? ["Defensible", "", "Within 5% of the solver. Read the price list below for what you're leaving on the table."]
        : ["Back to the model", "warn", "More than 5% worse than the solver at your risk appetite. Check where your plan pays spot or goes unserved."];
    grade.className = `callout ${tier[1]}`;
    grade.innerHTML = `<b>${tier[0]}.</b> ${tier[2]} <span class="muted small">(objective gap ${f.pct(g, 1)} at λ = ${p.risk.toFixed(2)})</span>`;
    ro.gap.set(f.pct(g, 1), "objective gap");
  }
  function drawPrices() {
    const r = best.r, sc = best.sc;
    const items = [
      ["One more MW of campus power, all six quarters", f.m(sc.powerDual, 1), "Σ of the power-cap duals over futures and quarters (probability-weighted)."],
      ["Hyperscaler reserved: reduced cost per MW", f.m(r.rc.hyp, 2), r.x.hyp > 1e-6 ? "In the plan (basic): zero reduced cost." : "How much cheaper it must get to enter."],
      ["Neocloud take-or-pay: reduced cost per MW", f.m(r.rc.neo, 2), r.x.neo > 1e-6 ? "In the plan." : "How much cheaper it must get to enter."],
      ["“Up to”: reduced cost per MW", f.m(r.rc.opt, 2), r.x.opt > 1e-6 ? "In the plan." : "How much cheaper the fee must get."],
      ["Campus upgrade: reduced cost per MW", f.m(r.rc.upg, 2), r.x.upg >= p.upgradeMax - 1e-6 ? "Maxed at 40 MW: negative = worth more than it costs; you'd buy more if you could." : ""],
    ];
    priceBox.innerHTML = "";
    priceBox.append(h("div", { class: "tbl-wrap" }, h("table", { class: "t left" }, h("thead", {}, h("tr", {}, ["What", "Price", "Reading it"].map(t => h("th", {}, t)))),
      h("tbody", {}, items.map(([a, b, c]) => h("tr", {}, h("td", {}, a), h("td", { class: "num" }, b), h("td", { class: "small" }, c)))))),
      h("p", { class: "note", html: `Solver's plan at λ = ${p.risk.toFixed(2)}: ${f.mw(r.x.hyp)} hyperscaler, ${f.mw(r.x.neo)} neocloud take-or-pay, ${f.mw(r.x.opt)} “up to”, ${f.mw(r.x.upg)} upgrade. Expected cost ${f.money(sc.expected)}, worst future ${f.money(sc.worst)}, ${f.pct(sc.slo, 2)} of inference served. Duals here carry the risk weighting; at λ = 0 they are pure expected values. ${tp().outerHTML}` }));
    if (p.risk === CAP.risk && Object.values(allow).every(Boolean)) ledger.put("cap-power", { what: "Capstone · one more MW of your own campus power, six quarters", price: `${f.m(sc.powerDual, 1)}`, note: "It replaces a hyperscaler MW at $2.75M × 6 quarters, which is why it equals that." });
  }
  function planToBase() {
    // Commit to the base case: size take-or-pay + hyperscaler to the base future, no option, as a deterministic planner would.
    const D = capDemand(p)[p.scen.findIndex(q => q.id === "base")];
    const peak = Math.max(...D.map((d, i) => d + p.train[i]));
    const early = Math.max(...D.slice(0, 2).map((d, i) => d + p.train[i]));
    const hyp = Math.max(0, early - p.ownCap);
    setPlan({ hyp, neo: Math.max(0, peak - p.ownCap - p.upgradeMax - hyp), opt: 0, upg: p.upgradeMax });
  }

  const runMine = scheduler(async () => {
    if (!best) return;
    const m2 = capModel(p, { fix: plan, allow: { hyp: true, neo: true, opt: true, upg: true } });
    const r = await m2.solve();
    if (r.status !== "optimal") return;
    mine = { r, sc: capScore(p, r) };
    ro.exp.set(f.money(mine.sc.expected)); ro.exp.querySelector(".s").replaceChildren(tp());
    ro.worst.set(f.money(mine.sc.worst)); ro.slo.set(f.pct(mine.sc.slo, 2));
    drawScen(); drawMix(); drawGrade();
    if (!memo.dataset.edited) memo.value = draft();
  });
  async function solveBest() {
    model = capModel(p, { allow });
    const r = await model.solve();
    best = { r, sc: capScore(p, r) };
    drawPrices(); card.refresh();
  }
  const runAll = scheduler(async () => { await solveBest(); runMine(); });
  await solveBest();
  // Start from the deterministic "commit to the base case" plan, so there's something to improve on.
  planToBase();
}
