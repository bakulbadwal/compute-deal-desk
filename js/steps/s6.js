// Step 6 · Commit or flex — two-stage stochastic programming, VSS/EVPI, the price of an "up to", CVaR, and forecasts vs decisions.
import { h, s, f, slider, toggle, predict, clicks, say, beyond, modelCard, readout, scheduler, scale, niceTicks, axes, legend, css, ledger, tp, plotClip } from "../ui.js";
import { S6, s6Model, s6Scenarios, s6Metrics, s6OptionValue, s6CostAt, s6Mape, s6ScenarioCosts, cvar } from "../models.js";
import { perMWyrToGpuHr } from "../econ.js";

export async function render(root) {
  const p = structuredClone(S6);
  let model = null;

  root.append(
    h("p", { class: "lede", html: "Back at the lab. You must sign next year's inference capacity <b>now</b>; demand reveals itself <b>later</b>. A <b>take-or-pay</b> MW costs $10.0M a year (≈ $1.90/GPU-hour) whether you use it or not. If demand runs hot you top up on <b>spot</b> at $16.0M (≈ $3.04), but only 80 MW of spot exists; beyond that, demand goes unserved at $30M of lost margin per MW. The forecast says 300 MW, give or take 25%." }),
    predict({
      q: "How much take-or-pay should you sign?",
      options: ["The forecast: 300 MW", "Less than the forecast", "More than the forecast"],
      answer: 1,
      explain: () => "With a deep spot market the answer is the <b>critical fractile</b>: commit up to the demand level you'll exceed with probability (spot − commit) / spot = 6 / 16 = 37.5%, which is well below the forecast. Here spot is thin (80 MW), so being short in a hot year is worse, and the optimum moves back up to just under the forecast. Either way, the forecast itself is never the answer by default. Drag the spot cap to see the fractile take over.",
    }));

  // (a) cost curve
  const curveBox = h("div", { class: "chartbox" });
  const ro = { rp: readout("Best commitment (two-stage plan)", "", { cls: "brass" }), ev: readout("Plan to the forecast", "", {}), fr: readout("Critical fractile (deep spot market)", "", {}), mape: readout("Commit that minimizes forecast error (MAPE)", "", {}) };
  const ctrlA = h("div", { class: "ctrl" },
    slider({ label: "Forecast uncertainty (CV)", min: 0.02, max: 0.5, step: 0.01, value: p.cv, fmt: v => f.pct(v), id: "s6cv", oninput: v => { p.cv = v; run(); } }),
    slider({ label: "Take-or-pay price, $M per MW-year", min: 6, max: 15, step: 0.1, value: p.commitPrice, fmt: v => `${f.m(v, 1)} ≈ ${f.gh(perMWyrToGpuHr(v))}/GPU-hr`, id: "s6cp", oninput: v => { p.commitPrice = v; run(); } }),
    slider({ label: "Spot price, $M per MW-year", min: 10, max: 28, step: 0.1, value: p.spotPrice, fmt: v => `${f.m(v, 1)} ≈ ${f.gh(perMWyrToGpuHr(v))}/GPU-hr`, id: "s6sp", oninput: v => { p.spotPrice = v; run(); } }),
    slider({ label: "Spot available (MW)", min: 0, max: 400, step: 10, value: p.spotCap, fmt: v => f.mw(v), id: "s6sc", oninput: v => { p.spotCap = v; run(); } }),
  );
  root.append(h("div", { class: "card" },
    h("div", { class: "card-h" }, h("h3", {}, "(a) Expected cost of every commitment"), h("span", { class: "sub" }, "Twenty equally likely demand scenarios (dots). The curve is expected cost if you commit exactly that much and handle the rest with spot.")),
    h("div", { class: "grid2" }, h("div", {}, curveBox, legend([[css("--ink"), "Expected cost"], [css("--brass"), "Two-stage optimum"], [css("--blue"), "Plan to the forecast"], [css("--plum"), "Lowest forecast error"]])), ctrlA),
    h("div", { class: "readouts" }, ro.rp, ro.ev, ro.fr, ro.mape)));

  // (b) WS / RP / EEV + the up-to
  const roB = { ws: readout("WS: wait and see (perfect foresight)", ""), rp: readout("RP: the two-stage plan", "", { cls: "brass" }), eev: readout("EEV: plan to the average, live with it", ""), vss: readout("VSS = EEV − RP", "", { cls: "good", sub: "what modeling uncertainty is worth" }), evpi: readout("EVPI = RP − WS", "", { sub: "what perfect information is worth (an upper bound)" }) };
  const optBox = h("div", {});
  root.append(h("div", { class: "card" },
    h("div", { class: "card-h" }, h("h3", {}, "(b) What uncertainty, information and flexibility are worth"), h("span", { class: "sub" }, "Expected cost per year, $M. Three solves, two differences.")),
    h("div", { class: "readouts" }, roB.ws, roB.rp, roB.eev, roB.vss, roB.evpi),
    h("div", { class: "grid2" }, h("div", { class: "ctrl" },
      toggle({ label: "Allow an “up to”: reserve MW now, pay a fee, exercise later at a strike", checked: p.optionOn, onchange: v => { p.optionOn = v; run(); } }),
      slider({ label: "Reservation fee, $M per MW-year", min: 0, max: 8, step: 0.1, value: p.optionFee, fmt: v => f.m(v, 1), id: "s6of", oninput: v => { p.optionFee = v; run(); } }),
      slider({ label: "Strike (price when exercised), $M per MW-year", min: 8, max: 16, step: 0.1, value: p.optionStrike, fmt: v => f.m(v, 1), id: "s6os", oninput: v => { p.optionStrike = v; run(); } })), optBox)));

  // (c) risk
  const riskBox = h("div", {});
  root.append(h("div", { class: "card" },
    h("div", { class: "card-h" }, h("h3", {}, "(c) Your CFO cares about the bad years"), h("span", { class: "sub" }, "Minimize (1 − λ) × expected cost + λ × CVaR: the average of the worst 10% of years.")),
    h("div", { class: "grid2" }, riskBox, h("div", { class: "ctrl" }, slider({ label: "Weight on the worst 10% (λ)", min: 0, max: 1, step: 0.05, value: p.risk, fmt: v => v.toFixed(2), id: "s6r", oninput: v => { p.risk = v; runRisk(); } }),
      h("p", { class: "note", html: "CVaR enters an LP exactly (Rockafellar–Uryasev): one extra variable for the threshold and one per scenario for how far that year's cost exceeds it." })))));

  const card = modelCard({
    decisions: "<b>First stage (now):</b> take-or-pay MW <i>c</i>; reserved “up to” MW <i>r</i>. <b>Second stage (per scenario s, after demand <i>d<sub>s</sub></i> is known):</b> exercise <i>e<sub>s</sub></i> ≤ <i>r</i>, spot <i>y<sub>s</sub></i> ≤ cap, unserved <i>u<sub>s</sub></i>.",
    objective: "Minimize commit·c + fee·r + Σ<sub>s</sub> π<sub>s</sub> (strike·e<sub>s</sub> + spot·y<sub>s</sub> + 30·u<sub>s</sub>), optionally blended with CVaR.",
    constraints: "c + e<sub>s</sub> + y<sub>s</sub> + u<sub>s</sub> ≥ d<sub>s</sub> for every scenario. Scenarios are stratified quantiles of a lognormal (mean 300, CV 25%), equally weighted and deterministic, so there's no seed to cherry-pick.",
    py: "s6_commit_or_flex.py",
    excel: "copy the second stage 20 times (one block per scenario) and give Solver one shared first-stage cell. It's the course's Phil's Shoes structure: order before you see demand. The newsvendor formula is the special case with one scenario distribution and unlimited recourse.",
    getLP: () => model?.toLP() || "",
  });
  root.append(
    clicks(null, h("ul", {},
      h("li", { html: "<b>Commit to the critical fractile, not the forecast.</b> Cu = spot − commit (what being short costs per MW), Co = commit (what an idle MW costs). Commit where P(demand ≤ c) = Cu / (Cu + Co). When spot is thin, being short costs more and the commitment rises." }),
      h("li", { html: "<b>VSS = EEV − RP</b> is what modeling uncertainty is worth. <b>EVPI = RP − WS</b> is what <i>perfect</i> information would be worth: an upper bound on any forecasting project, not its value." }),
      h("li", { html: "<b>A deterministic model never buys an option.</b> Plan to the average and flexibility is worthless, so it reserves nothing. Switch the “up to” on and watch VSS jump: the value of flexibility only exists under uncertainty." }),
      h("li", { html: "<b>A better forecast isn't a better decision.</b> The commitment that minimizes forecast error (MAPE) isn't the one that minimizes cost, because errors in the two directions cost different amounts. Judge forecasts on the decision they drive." }))),
    say("With an “up to” on the table, I'd sign about 240 MW of take-or-pay, well under the 300 MW forecast, and reserve about 110 MW of “up to” on top. That right is worth paying for up to $4.75M per MW-year, about $0.90 an hour for every GPU we reserve."),
    card,
    beyond([
      ["Deal angle", "“Up to” is an option, and both sides can price it", "AI Deals Q2: “a take-or-pay is financeable; an option is marketing.” Now you can say what the marketing is worth: the buyer's indifference fee is the most they'd pay to keep the right to walk, and the seller's lender discounts the “up to” MW accordingly."],
      ["Beyond the course", "Decision-focused learning", "Train the forecast on the cost of the decision it drives rather than on MAPE. It's an active research area (predict-then-optimize, Elmachtoub & Grigas) and it's what step 6's last readout argues in one number."],
    ]));

  // drawing
  async function drawCurve(scen, rpC, evC) {
    const W = 540, H = 300, m = { l: 60, r: 14, t: 16, b: 42 };
    const lo = Math.max(0, Math.min(...scen) * 0.6), hi = Math.max(...scen) * 1.1;
    const cs = [], vals = [];
    for (let k = 0; k <= 80; k++) { const c = lo + (hi - lo) * k / 80; cs.push(c); vals.push(s6CostAt(p, c, scen)); }
    const yLo = Math.min(...vals), yHi = Math.min(Math.max(...vals), yLo * 1.8);
    const x = scale(lo, hi, m.l, W - m.r), y = scale(yLo * 0.97, yHi, H - m.b, m.t);
    const svg = s("svg", { class: "chart", viewBox: `0 0 ${W} ${H}`, role: "img", "aria-label": "Expected cost by commitment level" });
    svg.append(axes({ x, y, W, H, m, xt: niceTicks(lo, hi, 6), yt: niceTicks(yLo * 0.97, yHi, 5), yfmt: v => "$" + f.int(v), xlab: "Take-or-pay commitment (MW)", ylab: "Expected cost, $M per year" }));
    const g = plotClip(svg, W, H, m);
    for (const d of scen) g.append(s("circle", { cx: x(d), cy: H - m.b - 6, r: 3, fill: css("--ink-3") }));
    g.append(s("polyline", { points: cs.map((c, i) => `${x(c)},${y(vals[i])}`).join(" "), fill: "none", stroke: css("--ink"), "stroke-width": 2.4 }));
    let mc = 0, mv = Infinity; for (let c = lo; c <= hi; c += 0.5) { const v = s6Mape(c, scen); if (v < mv) { mv = v; mc = c; } }
    const mark = (c, col, lab, dy) => { g.append(s("line", { x1: x(c), x2: x(c), y1: m.t, y2: H - m.b, stroke: col, "stroke-width": 2, "stroke-dasharray": "5 3" })); svg.append(s("text", { class: "halo", x: x(c) + 4, y: m.t + 12 + dy, fill: col, "font-weight": 600 }, lab)); };
    mark(evC, css("--blue"), "forecast", 0); mark(mc, css("--plum"), "lowest MAPE", 16); mark(rpC, css("--brass"), "best", 32);
    curveBox.innerHTML = ""; curveBox.append(svg);
    return { mc, mv };
  }
  async function drawRisk() {
    const scen = s6Scenarios(p);
    const pts = [];
    for (const lam of [0, 0.2, 0.4, 0.6, 0.8, 1]) { const q = { ...p, risk: lam }; const r = await s6Model(q).solve(); const cst = s6ScenarioCosts(q, r, scen); pts.push({ lam, c: r.x.commit, E: cst.reduce((a, b) => a + b, 0) / cst.length, V: cvar(cst, p.alpha) }); }
    const q = { ...p }; const rr = await s6Model(q).solve(); const cst = s6ScenarioCosts(q, rr, scen);
    const cur = { c: rr.x.commit, E: cst.reduce((a, b) => a + b, 0) / cst.length, V: cvar(cst, p.alpha) };
    riskBox.innerHTML = "";
    riskBox.append(h("div", { class: "tbl-wrap" }, h("table", { class: "t" }, h("thead", {}, h("tr", {}, ["λ", "Commit (MW)", "Expected cost", "Worst-10% average"].map(t => h("th", {}, t)))),
      h("tbody", {}, pts.map(pt => h("tr", { class: Math.abs(pt.lam - p.risk) < 1e-9 ? "sel" : "" }, h("td", { class: "num" }, pt.lam.toFixed(1)), h("td", { class: "num" }, f.n(pt.c, 0)), h("td", { class: "num" }, f.n(pt.E, 0)), h("td", { class: "num" }, f.n(pt.V, 0))))))),
      h("p", { class: "note", html: `At λ = ${p.risk.toFixed(2)}: commit <b>${f.mw(cur.c)}</b>, expected cost <b>${f.money(cur.E)}</b>, worst-10% average <b>${f.money(cur.V)}</b>. Buying protection against bad years means committing more and paying a bit more on average.` }));
  }
  const runRisk = scheduler(drawRisk);

  const run = scheduler(async () => {
    const scen = s6Scenarios(p);
    model = s6Model(p, { scen });
    const met0 = await s6Metrics({ ...p, optionOn: false });   // panel (a) is the plain take-or-pay decision
    const met = p.optionOn ? await s6Metrics(p) : met0;
    const { mc, mv } = await drawCurve(scen, met0.rp.x.commit, met0.evCommit);
    ro.rp.set(f.mw(met0.rp.x.commit), "take-or-pay, no option");
    ro.ev.set(f.mw(met0.evCommit), `costs ${f.m(met0.EEV - met0.RP, 1)} more a year in expectation`);
    const fr = (p.spotPrice - p.commitPrice) / p.spotPrice;
    ro.fr.set(f.pct(fr, 1), fr > 0 ? `commit to the ${f.pct(fr, 0)} quantile when spot is unlimited` : "spot is cheaper than committing");
    ro.mape.set(f.mw(mc), `MAPE ${f.pct(mv, 1)}; costs ${f.m(s6CostAt(p, mc, scen) - s6CostAt(p, met0.rp.x.commit, scen), 1)} a year more than the best`);
    roB.ws.set(f.money(met.WS)); roB.rp.set(f.money(met.RP)); roB.eev.set(f.money(met.EEV)); roB.vss.set(f.m(met.VSS, 1)); roB.evpi.set(f.m(met.EVPI, 1));
    roB.rp.querySelector(".s").replaceChildren(tp());
    optBox.innerHTML = "";
    const ov = await s6OptionValue(p);
    optBox.append(h("div", { class: "readouts" },
      readout("Value of the “up to” right (at this fee)", f.m(ov.value, 1), { cls: "good", sub: "RP without it − RP with it" }),
      readout("Indifference fee", `${f.m(ov.indifferenceFee, 2)}/MW-yr`, { cls: "brass", sub: `≈ ${f.gh(perMWyrToGpuHr(ov.indifferenceFee))} per GPU-hour reserved` }),
      readout("Optimal mix with the option", `${f.n(ov.commit, 0)} + ${f.n(ov.reserve, 0)} MW`, { sub: "take-or-pay + “up to”" })),
      h("p", { class: "note", html: `The indifference fee is the highest reservation fee at which the best plan still reserves any “up to” capacity. A neocloud asking more than that is pricing the flexibility above what it's worth to this buyer. ${p.optionOn ? "" : "Switch the option on to see the plan use it."}` }));
    card.refresh();
    runRisk();
    if (p.cv === S6.cv && p.spotCap === S6.spotCap && p.commitPrice === S6.commitPrice && p.spotPrice === S6.spotPrice && p.optionFee === S6.optionFee && p.optionStrike === S6.optionStrike) {
      ledger.put("s6-upto", { what: "Step 6 · the right to walk: an “up to” on next year's inference", price: `≤ ${f.m(ov.indifferenceFee, 2)} per MW-year reserved`, note: `≈ ${f.gh(perMWyrToGpuHr(ov.indifferenceFee))}/GPU-hr. Above that, sign take-or-pay or buy spot (teaching prices).` });
      ledger.put("s6-evpi", { what: "Step 6 · a perfect demand forecast, at most", price: `${f.m(met.EVPI, 0)} per year`, note: "EVPI: the ceiling on any forecasting project for this decision." });
    }
  });
  run();
}
