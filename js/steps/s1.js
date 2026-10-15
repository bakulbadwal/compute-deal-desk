// Step 1 · The price of a wall — shadow prices, ranges, the sensitivity report, and buying the wall.
import { h, s, f, plotClip, slider, toggle, seg, predict, clicks, say, beyond, modelCard, readout, scheduler, scale, niceTicks, axes, legend, css, ledger, tp, touch } from "../ui.js";
import { S1, S1_PRODUCTS, S1_OFFERS, s1Model, s1Margins } from "../models.js";
import { isBinding } from "../lp.js";
import { perMWyrToGpuHr } from "../econ.js";

const INF = Infinity;

/** Excel-style allowable increase/decrease for a row, from HiGHS ranging + slack. */
function rowAllow(row, act, rg) {
  const ub = row.ub < INF, rhs = ub ? row.ub : row.lb;
  if (!isBinding(row, act)) return ub ? { rhs, inc: INF, dec: rhs - act } : { rhs, inc: act - rhs, dec: INF };
  return { rhs, inc: rg.hi - rhs, dec: rhs - rg.lo };
}

export async function render(root) {
  const p = structuredClone(S1);
  let base = null, model = null, sel = "grid", delta = 0;

  root.append(
    h("p", { class: "lede", html: "Same campus, now at full size: <b>six products</b> (two lab leases, enterprise inference, an on-demand API, batch, a sovereign contract) and <b>five physical walls</b> (the grid connection, liquid- and air-cooled halls, the network fabric, Blackwell GPU deliveries), plus four market limits and the anchor lab's take-or-pay floor. The solver doesn't just return a plan. It returns a <b>price for every wall</b>: what one more unit would add to the margin. That's the <b>shadow price</b>, and it's the most useful number in a capacity negotiation." }),
    predict({
      q: "The grid wall's shadow price is $3.48M per MW-year. The utility offers a 40 MW substation upgrade. Roughly what is 40 MW worth to you per year?",
      options: ["$139M (40 × $3.48M)", "About $56M", "About $5M", "Nothing: the grid isn't binding"],
      answer: 1,
      explain: "A shadow price holds only over its <b>allowable range</b>. Here it's $3.48M for the first 15.2 MW; then Blackwell deliveries bind, and the next MW is worth just $0.14M (it can only run low-margin batch). 15.2 × 3.48 + 24.8 × 0.14 ≈ $56M. Multiplying the price by 40 overstates it 2.5×. Nudge the grid wall below and watch the slope change.",
    }),
  );

  // ── (a) Nudge a wall
  const nudgeBox = h("div", { class: "chartbox" });
  const ro = {
    dual: readout("Shadow price of this wall", "", { cls: "brass" }),
    range: readout("…holds while the wall is between", "", {}),
    pred: readout("Shadow price × your nudge", "", {}),
    act: readout("Actual change in margin", "", { cls: "good" }),
  };
  const wallSel = h("select", { "aria-label": "Choose a wall", style: { font: "inherit", padding: "5px 8px", borderRadius: "6px", border: "1px solid var(--rule-strong)", background: "var(--sheet)", color: "var(--ink)" } });
  const nudge = slider({ label: "Move the wall (units of that wall)", min: -60, max: 60, step: 0.5, value: 0, fmt: v => (v > 0 ? "+" : "") + v.toFixed(1), id: "s1nudge", oninput: v => { delta = v; runNudge(); } });
  wallSel.addEventListener("change", () => { sel = wallSel.value; delta = 0; nudge.set(0); runAll(); touch(wallSel); });
  const nudgeCard = h("div", { class: "card" },
    h("div", { class: "card-h" }, h("h3", {}, "(a) Nudge a wall"), h("span", { class: "sub" }, "Margin as you move one wall. The slope is the shadow price; it changes at the edges of the shaded range.")),
    h("div", { class: "grid2" }, h("div", {}, nudgeBox), h("div", { class: "ctrl" }, h("label", { class: "small muted" }, "Which wall?"), wallSel, nudge, h("p", { class: "note", html: "Units: grid in MW at the fence; halls and markets in MW of IT; fabric in spine units; deliveries in thousands of GPUs." }))),
    h("div", { class: "readouts" }, ro.dual, ro.range, ro.pred, ro.act));
  root.append(nudgeCard);

  // ── (b) The sensitivity report
  let names = "excel";
  const reportBox = h("div", {});
  root.append(h("div", { class: "card" },
    h("div", { class: "card-h" }, h("h3", {}, "(b) The sensitivity report"), h("span", { class: "sub" }, "Laid out exactly like Excel Solver's, filled live from HiGHS. Click a constraint row to nudge that wall above."),
      seg({ label: "Column names", options: [["excel", "Excel names"], ["solver", "Solver names"]], value: "excel", onchange: v => { names = v; drawReport(); } })),
    reportBox,
    h("p", { class: "note", html: "<b>Lie detector:</b> if a binding row shows an allowable increase or decrease of 0, the problem is <i>degenerate</i>: the shadow price isn't unique, and the report is showing one of several valid answers. This campus is built to be non-degenerate; the model card tells you how to check." })));

  // ── (c) Buy the wall
  const mktBox = h("div", { class: "chartbox" });
  const offerTbl = h("div", { class: "tbl-wrap" });
  const offerToggles = S1_OFFERS.map(o => toggle({ label: `${o.label}: ${o.size} MW at ${f.m(o.price)}/MW-yr`, checked: false, onchange: v => { p.offers[o.id] = v; runAll(); } }));
  root.append(h("div", { class: "card" },
    h("div", { class: "card-h" }, h("h3", {}, "(c) Buy the wall"), h("span", { class: "sub" }, "Four ways to move the grid wall. The staircase is what each extra MW is worth to you; the offers are what each MW costs.")),
    h("div", { class: "grid2" }, h("div", {}, mktBox, legend([[css("--brass"), "What one more MW is worth (the shadow price, step by step)"], [css("--blue"), "Offers, cheapest first (a supply curve)"]])),
      h("div", { class: "ctrl" }, h("h4", {}, "Put offers on the table"), ...offerToggles,
        h("p", { class: "note", html: "With offers on, the solver decides how much of each to buy. It buys exactly where the staircase sits above the offer price, and not a MW further." }))),
    offerTbl));

  const card = modelCard({
    decisions: "MW of each of the six products; MW bought from each offer you switch on.",
    objective: "Maximize annual margin: Σ margin<sub>j</sub> · MW<sub>j</sub> − Σ offer price × MW bought.",
    constraints: "Grid: 1.14 × Σ MW ≤ 285 + MW bought. Liquid halls ≤ 215 MW. Air halls ≤ 95 MW. Fabric ≤ 205 units. Blackwell deliveries: 0.6k GPUs per MW ≤ 116k. Four market caps. Anchor floor ≥ 80 MW.",
    py: "s1_price_of_a_wall.py",
    excel: "this is the model the Sensitivity Report was invented for. Tick “Make Unconstrained Variables Non-Negative,” choose Simplex LP, and ask for the Sensitivity report. Check degeneracy yourself: re-solve with a wall moved ±1 and compare the change with the shadow price (the acceptance tests do this for every binding wall).",
    getLP: () => model?.toLP() || "",
  });
  root.append(
    clicks(null, h("ul", {},
      h("li", { html: "<b>The dual is a price list with an expiry quantity.</b> Every shadow price comes with an allowable range. Inside it, the price is exact. Outside it, another wall binds and the price changes." }),
      h("li", { html: "<b>The grid's shadow price is the margin on what one more MW lets you run, divided by the PUE.</b> It is <i>not</i> the Freed Megawatts “~8.8×” ratio. That's depreciation of freed compute over the energy saving, and it explains why the capacity value dwarfs the power bill, but it's a different number." }),
      h("li", { html: "<b>Reduced cost</b> answers “how much better would an unused product need to get to earn a MW?” The on-demand API sits out by a few hundred thousand dollars per MW-year. <b>Cost ranging</b> answers “how far can a price move before the plan changes?”" }),
      h("li", { html: "<b>Walls interact.</b> Power without GPUs is worth almost nothing: past 15 MW the binding wall is Blackwell deliveries, and the substation's last 25 MW buys you batch work at $0.14M a MW. Put all four offers on the table and the LP buys the whole 10.4 MW cooling retrofit plus just 4.8 MW of the 40 MW substation: 15.2 MW in all, the width of the range. Real upgrades are lumpy; that's step 4." }))),
    say("The grid is worth $3.48 million a megawatt-year to us, but only for the next 15 megawatts. After that we're GPU-bound, and more power is worth almost nothing until the next delivery lands."),
    card,
    beyond([
      ["Beyond the course", "Power prices are shadow prices", "Grid operators clear the market by solving an optimal dispatch. The <b>locational marginal price</b> at each node is the dual of that node's power-balance constraint: zero congestion means one system price; a congested line splits prices. A balance dual can even go negative. Same math as this report, run every five minutes."],
      ["Beyond the course", "Freed Megawatts, done properly", "A cooling retrofit that frees 9 MW inside a fixed 285 MW connection is worth the grid's shadow price × 9 MW of extra IT, not the power bill it saves. That's the capacity-priced contract the <a href=\"https://bakulbadwal.github.io/hyperscale-ledger/#rack\">Below the rack</a> view argues for."],
      ["Interview line", "“What's a megawatt worth to us?”", "“It depends which wall binds next. Today it's about $3.5M a megawatt-year for the next 15 MW. Past that we're GPU-bound, so I'd pair any power deal with a delivery slot.”"],
    ]));

  // ── Drawing helpers
  const NW = 520, NH = 300, nm = { l: 58, r: 16, t: 14, b: 40 };
  let curve = [];
  async function sweep(rowName) {
    const row = model.rows.find(r => r.name === rowName);
    const ub = row.ub < INF, rhs = ub ? row.ub : row.lb;
    const lo = Math.max(0, rhs - 60), hi = rhs + 60, n = 48, pts = [];
    for (let k = 0; k <= n; k++) {
      const v = lo + (hi - lo) * k / n;
      const m2 = s1Model(p); m2.setRow(rowName, ub ? { ub: v } : { lb: v });
      const r = await m2.solve();
      pts.push([v, r.status === "optimal" ? r.obj : null]);
    }
    return pts;
  }
  function drawNudge(r2) {
    const row = model.rows.find(r => r.name === sel);
    const ub = row.ub < INF, rhs = ub ? row.ub : row.lb;
    const al = rowAllow(row, base.act[sel], base.range.rows[sel]);
    const good = curve.filter(q => q[1] !== null);
    const ys = good.map(q => q[1]);
    const x = scale(curve[0][0], curve[curve.length - 1][0], nm.l, NW - nm.r), y = scale(Math.min(...ys) - 5, Math.max(...ys) + 5, NH - nm.b, nm.t);
    const svg = s("svg", { class: "chart", viewBox: `0 0 ${NW} ${NH}`, role: "img", "aria-label": `Margin versus ${row.label}` });
    svg.append(axes({ x, y, W: NW, H: NH, m: nm, xt: niceTicks(curve[0][0], curve[curve.length - 1][0], 6), yt: niceTicks(Math.min(...ys), Math.max(...ys), 5), yfmt: v => "$" + v, xlab: row.label, ylab: "Annual margin ($M)" }));
    const g = plotClip(svg, NW, NH, nm);
    const lo = Math.max(curve[0][0], rhs - al.dec), hi = Math.min(curve[curve.length - 1][0], rhs + al.inc);
    g.append(s("rect", { x: x(lo), y: nm.t, width: Math.max(0, x(hi) - x(lo)), height: NH - nm.t - nm.b, fill: css("--brass-soft"), opacity: 0.8 }));
    // tangent at the base point: slope = dual
    const d = base.dual[sel];
    g.append(s("line", { x1: x(curve[0][0]), y1: y(base.obj + d * (curve[0][0] - rhs)), x2: x(curve[curve.length - 1][0]), y2: y(base.obj + d * (curve[curve.length - 1][0] - rhs)), stroke: css("--brass"), "stroke-width": 1.5, "stroke-dasharray": "5 4" }));
    g.append(s("polyline", { points: good.map(([a, b]) => `${x(a)},${y(b)}`).join(" "), fill: "none", stroke: css("--ink"), "stroke-width": 2.4 }));
    svg.append(s("circle", { cx: x(rhs), cy: y(base.obj), r: 5, fill: css("--sheet"), stroke: css("--ink"), "stroke-width": 1.5 }));
    if (r2 && r2.status === "optimal") svg.append(s("circle", { cx: x(rhs + delta), cy: y(r2.obj), r: 7, fill: css("--brass"), stroke: css("--ink"), "stroke-width": 1.5 }));
    svg.append(s("text", { class: "halo", x: x(rhs) + 8, y: y(base.obj) + 18, fill: css("--ink-2") }, "today"));
    nudgeBox.innerHTML = ""; nudgeBox.append(svg);
  }
  const fmtAllow = v => (v === INF ? "1E+30" : f.n(v, 2));
  function drawReport() {
    const r = base, mg = s1Margins(p);
    const E = names === "excel";
    const vh = E ? ["Cell", "Final Value", "Reduced Cost", "Objective Coefficient", "Allowable Increase", "Allowable Decrease"] : ["Variable", "Primal x", "Reduced cost (dual of bound)", "Cost c_j", "Cost range ↑", "Cost range ↓"];
    const ch = E ? ["Constraint", "Final Value", "Shadow Price", "Constraint R.H. Side", "Allowable Increase", "Allowable Decrease"] : ["Row", "Activity", "Dual y_i", "RHS b_i", "RHS range ↑", "RHS range ↓"];
    const vt = h("table", { class: "t xlsx" }, h("caption", {}, "Variable Cells ($M per MW-year)"), h("thead", {}, h("tr", {}, vh.map(t => h("th", {}, t)))),
      h("tbody", {}, model.vars.filter(v => !v.name.startsWith("buy_")).map(v => {
        const c = mg[v.name], rg = r.range.cols[v.name];
        return h("tr", {}, h("td", {}, v.label), h("td", { class: "num" }, f.n(r.x[v.name], 2)), h("td", { class: "num" }, f.n(r.rc[v.name], 3)), h("td", { class: "num" }, f.n(c, 3)),
          h("td", { class: "num" }, fmtAllow(rg.costHi - c)), h("td", { class: "num" }, fmtAllow(c - rg.costLo)));
      })));
    const ct = h("table", { class: "t xlsx" }, h("caption", {}, "Constraints"), h("thead", {}, h("tr", {}, ch.map(t => h("th", {}, t)))),
      h("tbody", {}, model.rows.map(row => {
        const al = rowAllow(row, r.act[row.name], r.range.rows[row.name]);
        const b = isBinding(row, r.act[row.name]);
        const degen = b && (al.inc < 1e-9 || al.dec < 1e-9);
        const tr = h("tr", { class: `click ${b ? "bind" : ""} ${row.name === sel ? "sel" : ""}`, tabindex: "0", title: "Nudge this wall" },
          h("td", {}, row.label, degen ? h("span", { class: "lie" }, "degenerate") : null), h("td", { class: "num" }, f.n(r.act[row.name], 2)), h("td", { class: "num" }, f.n(r.dual[row.name], 3)),
          h("td", { class: "num" }, f.n(al.rhs, 1)), h("td", { class: "num" }, fmtAllow(al.inc)), h("td", { class: "num" }, fmtAllow(al.dec)));
        const go = () => { sel = row.name; wallSel.value = sel; delta = 0; nudge.set(0); runAll(); touch(tr); nudgeCard.scrollIntoView({ behavior: "smooth", block: "start" }); };
        tr.addEventListener("click", go); tr.addEventListener("keydown", e => { if (e.key === "Enter") go(); });
        return tr;
      })));
    reportBox.innerHTML = "";
    reportBox.append(h("div", { class: "tbl-wrap" }, vt), h("div", { class: "tbl-wrap" }, ct),
      h("p", { class: "note", html: `Highlighted rows are binding walls. Objective: <b class="num">${f.m(r.obj, 1)}</b> per year ${tp().outerHTML}.` }));
  }
  async function drawMarket() {
    // Marginal value of grid MW: the shadow price as the grid wall moves out, without offers.
    const pts = [];
    for (let e = 0; e <= 110; e += 0.5) {
      const m2 = s1Model({ ...p, offers: {}, gridMW: p.gridMW + e });
      const r = await m2.solve();
      pts.push([e, r.dual.grid]);
    }
    const W = 520, H = 280, m = { l: 58, r: 16, t: 14, b: 40 };
    const x = scale(0, 110, m.l, W - m.r), y = scale(0, 4, H - m.b, m.t);
    const svg = s("svg", { class: "chart", viewBox: `0 0 ${W} ${H}`, role: "img", "aria-label": "Marginal value of grid megawatts versus offer prices" });
    svg.append(axes({ x, y, W, H, m, xt: niceTicks(0, 110, 6), yt: [0, 1, 2, 3, 4], yfmt: v => "$" + v + "M", xlab: "Extra MW at the fence", ylab: "$M per MW-year" }));
    const g = plotClip(svg, W, H, m);
    // supply curve of switched-on offers, cheapest first
    const on = S1_OFFERS.filter(o => p.offers[o.id]).sort((a, b) => a.price - b.price);
    let cum = 0;
    let lastLabelY = Infinity, lastLabelX = -Infinity;
    for (const o of on) {
      g.append(s("rect", { x: x(cum), y: y(o.price), width: x(cum + o.size) - x(cum), height: y(0) - y(o.price), fill: css("--blue-soft"), stroke: css("--blue"), "stroke-width": 1.5 }));
      // Stagger labels of neighbouring small offers so they don't collide.
      let ly = y(o.price) - 5;
      if (x(cum) - lastLabelX < 110 && Math.abs(ly - lastLabelY) < 14) ly = lastLabelY - 14;
      lastLabelX = x(cum); lastLabelY = ly;
      svg.append(s("text", { class: "halo", x: x(cum) + 4, y: ly, fill: css("--blue") }, o.label.split(",")[0].replace("Behind-the-meter ", "")));
      cum += o.size;
    }
    let d = "";
    pts.forEach(([e, v], i) => { d += (i ? `L${x(e)},${y(pts[i - 1][1])} L${x(e)},${y(v)} ` : `M${x(e)},${y(v)} `); });
    g.append(s("path", { d, fill: "none", stroke: css("--brass"), "stroke-width": 3 }));
    mktBox.innerHTML = ""; mktBox.append(svg);
  }
  function drawOffers() {
    const on = S1_OFFERS.filter(o => p.offers[o.id]);
    offerTbl.innerHTML = "";
    if (!on.length) { offerTbl.append(h("p", { class: "note" }, "Switch on an offer to see what the solver buys.")); return; }
    offerTbl.append(h("table", { class: "t" }, h("thead", {}, h("tr", {}, ["Offer", "Size (MW)", "Price $M/MW-yr", "Solver buys (MW)", "Verdict"].map(t => h("th", {}, t)))),
      h("tbody", {}, on.map(o => {
        const b = base.x["buy_" + o.id] || 0;
        const v = b > o.size - 1e-6 ? "Buy all of it" : b > 1e-6 ? `Buy ${b.toFixed(1)} of ${o.size} MW` : "Pass";
        return h("tr", {}, h("td", {}, o.label), h("td", { class: "num" }, o.size), h("td", { class: "num" }, f.n(o.price, 2)), h("td", { class: "num" }, f.n(b, 1)), h("td", {}, v));
      }))),
      h("p", { class: "note", html: `With these offers the campus earns <b class="num">${f.m(base.obj, 1)}</b> a year net of what it pays for the relief. The grid's shadow price is now ${f.m(base.dual.grid)}: the solver kept buying until the next MW was worth exactly what it cost, or the offers ran out.` }));
  }

  for (const row of s1Model(p).rows) wallSel.append(h("option", { value: row.name }, row.label));
  wallSel.value = sel;

  async function solveBase() {
    model = s1Model(p);
    base = await model.solve({ ranging: true });
  }
  const runNudge = scheduler(async () => {
    const row = model.rows.find(r => r.name === sel);
    const ub = row.ub < INF, rhs = ub ? row.ub : row.lb;
    const m2 = s1Model(p); m2.setRow(sel, ub ? { ub: rhs + delta } : { lb: rhs + delta });
    const r2 = await m2.solve();
    const al = rowAllow(row, base.act[sel], base.range.rows[sel]);
    ro.dual.set(f.m(base.dual[sel], 3), sel === "grid" ? `per MW-year ≈ ${f.gh(perMWyrToGpuHr(base.dual[sel] * p.pue))} per GPU-hour of IT` : "per unit per year");
    ro.range.set(`${al.dec === INF ? "−∞" : f.n(rhs - al.dec, 1)} to ${al.inc === INF ? "∞" : f.n(rhs + al.inc, 1)}`, `today: ${f.n(rhs, 1)}`);
    ro.pred.set(f.m(base.dual[sel] * delta, 2));
    if (r2.status === "optimal") {
      ro.act.set(f.m(r2.obj - base.obj, 2));
      const outside = delta > al.inc + 1e-9 || -delta > al.dec + 1e-9;
      ro.act.setCls(outside ? "wall" : "good");
      ro.act.set(f.m(r2.obj - base.obj, 2), outside ? "outside the range: the price changed" : "inside the range: price × nudge is exact");
      if (outside && !ro.act.dataset.out) { ro.act.classList.add("bump"); setTimeout(() => ro.act.classList.remove("bump"), 500); }
      ro.act.dataset.out = outside ? "1" : "";
    } else { ro.act.set("infeasible", "the floor can't be met"); ro.act.setCls("wall"); }
    drawNudge(r2);
  });
  const runAll = scheduler(async () => {
    await solveBase();
    curve = await sweep(sel);
    drawReport(); drawOffers(); await drawMarket();
    runNudge(); card.refresh();
    const g = base.range.rows.grid, al = rowAllow(model.rows[0], base.act.grid, g);
    if (!Object.values(p.offers).some(Boolean)) {
      ledger.put("s1-grid", { what: "Step 1 · one more MW at the fence (285 MW campus)", price: `${f.m(base.dual.grid)} per MW-year`, note: `Valid for the next ${f.n(al.inc, 1)} MW; then Blackwell deliveries bind (teaching prices).` });
      const sub = await s1Model({ ...p, gridMW: p.gridMW + 40 }).solve();
      ledger.put("s1-40mw", { what: "Step 1 · a 40 MW substation upgrade, all of it", price: `${f.m(sub.obj - base.obj, 1)} per year`, note: `Not 40 × the shadow price (${f.m(40 * base.dual.grid, 0)}).` });
      ledger.put("s1-floor", { what: "Step 1 · the anchor lab's take-or-pay floor", price: `${f.m(-base.dual.floor)} per MW-year`, note: "What each MW of the floor costs the campus versus selling that MW elsewhere." });
    }
  });
  runAll();
}
