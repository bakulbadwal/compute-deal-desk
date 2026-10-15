// Step 2 · The capacity ladder — multiperiod planning with lead times and a take-or-pay floor.
import { h, s, f, plotClip, slider, toggle, seg, predict, clicks, say, beyond, modelCard, readout, scheduler, scale, niceTicks, axes, legend, css, ledger, tp, tooltip } from "../ui.js";
import { S2, QUARTERS, s2Model, s2Demand, s2Stack, s2Tail } from "../models.js";
import { perMWyrToGpuHr } from "../econ.js";

export async function render(root) {
  const p = structuredClone(S2);
  let model = null, r = null;

  root.append(
    h("p", { class: "lede", html: "Now you're on the other side of the table: <b>compute strategy at a lab</b>. Demand grows 10% a quarter. You own a 120 MW campus, and an old 60 MW lease runs out at the end of 2027. You can <b>build</b> (cheapest per quarter, but power and construction take six quarters), <b>lease from a neocloud</b> (two quarters to energize, eight-quarter tranches), or buy <b>spot</b> (no lead time, expensive, thin). And the board already signed a <b>take-or-pay floor</b>: at least 150 MW leased from Q3 '27 to Q2 '28." }),
    predict({
      q: "One more MW of demand in Q2 '27 versus one more in Q3 '29: which costs more to serve, and by how much?",
      options: ["Q2 '27, more than 2×", "Q3 '29, more than 2×", "About the same"],
      answer: 0,
      explain: "Lead times set the marginal price. By Q2 '27 nothing but spot can arrive, so the next MW costs the spot price, $4.20M. By Q3 '29 a build decided now can land, so the next MW costs the build price, $1.83M. The bottom chart plots this for every quarter: the dual of each quarter's demand row.",
    }));

  const stackBox = h("div", { class: "chartbox" }), priceBox = h("div", { class: "chartbox" });
  const ro = {
    cost: readout("Cost over 12 quarters", "", { cls: "brass" }),
    floor: readout("What the take-or-pay floor costs", "", { cls: "wall" }),
    tail: readout("Commitments past Q4 '29 the plan never priced", "", {}),
    spot: readout("Spot share of capacity-quarters", "", {}),
  };
  const floorTbl = h("div", { class: "tbl-wrap" });
  const ctrl = h("div", { class: "ctrl" },
    h("h4", {}, "Demand and lead times"),
    slider({ label: "Demand growth per quarter", min: 0.0, max: 0.2, step: 0.01, value: p.growth, fmt: v => f.pct(v), id: "s2g", oninput: v => { p.growth = v; run(); } }),
    slider({ label: "Build lead time (quarters)", min: 2, max: 10, step: 1, value: p.buildLead, fmt: v => v, id: "s2bl", oninput: v => { p.buildLead = v; run(); } }),
    slider({ label: "Lease lead time (quarters)", min: 0, max: 4, step: 1, value: p.leaseLead, fmt: v => v, id: "s2ll", oninput: v => { p.leaseLead = v; run(); } }),
    slider({ label: "Spot available per quarter", min: 0, max: 120, step: 5, value: p.spotCap, fmt: v => f.mw(v), id: "s2sc", oninput: v => { p.spotCap = v; run(); } }),
    h("h4", {}, "The contract"),
    toggle({ label: "Board-signed take-or-pay floor is in force", checked: p.floorOn, onchange: v => { p.floorOn = v; run(); } }),
    slider({ label: "Floor: leased MW you must hold, Q3 '27–Q2 '28", min: 60, max: 300, step: 10, value: p.floor, fmt: v => f.mw(v), id: "s2fl", oninput: v => { p.floor = v; run(); } }),
    h("h4", {}, "The end of the window"),
    seg({ label: "Tail", options: [["ignore", "Ignore what runs past Q4 '29"], ["full", "Charge it"]], value: p.tail, onchange: v => { p.tail = v; run(); } }),
  );
  root.append(h("div", { class: "card" },
    h("div", { class: "card-h" }, h("h3", {}, "The ladder"), h("span", { class: "sub" }, "Capacity in place each quarter, by source, against demand.")),
    h("div", { class: "grid2" }, h("div", {}, stackBox, legend([[css("--chart-6"), "Owned campus"], [css("--plum"), "Old lease"], [css("--blue"), "New neocloud leases"], [css("--green"), "Builds"], [css("--brass"), "Spot"], [css("--wall"), "Unserved"], [css("--ink"), "Demand", "line"]]),
      h("h4", { style: { marginTop: "14px" } }, "The price of one more MW, quarter by quarter"), priceBox), ctrl),
    h("div", { class: "readouts" }, ro.cost, ro.floor, ro.tail, ro.spot),
    floorTbl));

  const card = modelCard({
    decisions: "MW of builds decided each quarter, MW of leases signed each quarter, MW of spot and unserved demand each quarter.",
    objective: "Minimize cost: build $1.83M per MW-quarter while active (depreciation + power + opex, from the Ledger), lease $2.60M per MW-quarter for its eight-quarter term, spot $4.20M, unserved $9.00M (lost margin).",
    constraints: "<b>Flow balance per quarter:</b> owned + old lease + builds energized by now + leases active now + spot + unserved ≥ demand. A build decided in quarter <i>s</i> counts from <i>s</i> + lead; a lease from <i>s</i> + lead for eight quarters. <b>Floor:</b> leased MW ≥ 150 in Q3 '27–Q2 '28. Spot ≤ its cap.",
    py: "s2_capacity_ladder.py",
    excel: "a 12-column sheet, one column per quarter, with SUMPRODUCT rows that add up which commitments are live in each quarter. The workforce-planning case (DHL) is the same structure with people instead of megawatts: hires take time to arrive and stay for a term.",
    getLP: () => model?.toLP() || "",
  });
  root.append(
    clicks(null, h("ul", {},
      h("li", { html: "<b>Lead times set the price of capacity.</b> Where only spot can arrive in time (Q2 '27, and Q2 '28 once the floor's leases are used up), the next MW costs the spot price. Where the board's floor already over-covers demand (Q3 '27 to Q1 '28), it costs nothing. From Q3 '28 a build decided now can land, so it costs the build price. The lease never prices a single quarter's extra MW, because a lease is an eight-quarter tranche: it prices a sustained increase." }),
      h("li", { html: "<b>The floor has a price you can quote.</b> Re-solve without it: the difference is what you'd pay the neocloud to turn the floor into an “up to.” Move it one MW in one quarter and you get that quarter's price, quoted as a pair, because these rows are degenerate. That's AI Deals Q2 (“the floor is the buyer's liability”) as a number." }),
      h("li", { html: "<b>Every finite plan lies at its end.</b> Ignore what runs past Q4 '29 and the model loves late builds, because it only pays for a quarter of a five-year commitment. Charge it, and late builds vanish and unserved demand appears. Neither is right. Real desks plan over a longer window than they act on, act on the first few quarters, and re-plan." }))),
    say("The next megawatt costs whatever can arrive in time. Next quarter that's spot; in six quarters it's a build. And the take-or-pay floor costs us real money in the quarters we're already covered."),
    card,
    beyond([
      ["Beyond the course", "Rolling horizon", "Solve 20 quarters, commit to 2, re-solve next quarter with new data. It's how airlines, utilities and capacity-planning teams avoid end effects without pretending the future ends."],
      ["Deal angle", "Ladder your tranches", "AI Deals §3: CoreWeave–OpenAI grew in three tranches; neocloud deals ladder 2–6-year terms. Tranches are this model's lease variables: small, staggered commitments that keep the marginal price near the lease rate."],
    ]));

  const W = 540, H = 300, m = { l: 52, r: 12, t: 12, b: 36 };
  function drawStack(st, D) {
    const T = p.T, max = Math.max(...D.slice(0, T)) * 1.12;
    const x = scale(0, T, m.l, W - m.r), y = scale(0, max, H - m.b, m.t), bw = (x(1) - x(0)) * 0.72;
    const svg = s("svg", { class: "chart", viewBox: `0 0 ${W} ${H}`, role: "img", "aria-label": "Capacity by source per quarter against demand" });
    svg.append(axes({ x: v => x(v + 0.5), y, W, H, m, xt: [0, 2, 4, 6, 8, 10], xfmt: t => QUARTERS[t], yt: niceTicks(0, max, 5), ylab: "MW" }));
    const parts = [["owned", "--chart-6"], ["legacy", "--plum"], ["lease", "--blue"], ["build", "--green"], ["spot", "--brass"], ["short", "--wall"]];
    stackBox.innerHTML = ""; const tip = tooltip(stackBox);
    st.slice(0, T).forEach((q, i) => {
      let acc = 0;
      for (const [k, c] of parts) {
        const v = q[k]; if (v < 1e-6) continue;
        svg.append(s("rect", { x: x(i) + ((x(1) - x(0)) - bw) / 2, y: y(acc + v), width: bw, height: Math.max(0, y(acc) - y(acc + v)), fill: css(c) }));
        acc += v;
      }
      const hit = s("rect", { x: x(i), y: m.t, width: x(1) - x(0), height: H - m.t - m.b, fill: "transparent" });
      hit.addEventListener("mousemove", () => tip.show(`<b>${QUARTERS[i]}</b><br>Demand ${f.mw(D[i])}<br>Owned ${f.mw(q.owned)} · Old lease ${f.mw(q.legacy)}<br>New leases ${f.mw(q.lease)} · Builds ${f.mw(q.build)}<br>Spot ${f.mw(q.spot)} · Unserved ${f.mw(q.short)}`, `${(x(i + 0.5) / W) * 100}%`, 40));
      hit.addEventListener("mouseleave", () => tip.hide());
      svg.append(hit);
    });
    svg.append(s("polyline", { points: D.slice(0, T).map((d, i) => `${x(i + 0.5)},${y(d)}`).join(" "), fill: "none", stroke: css("--ink"), "stroke-width": 2.2, "stroke-dasharray": "6 3" }));
    svg.append(s("text", { class: "halo", x: x(T - 0.3), y: y(D[T - 1]) - 8, "text-anchor": "end", fill: css("--ink"), "font-weight": 600 }, "demand"));
    if (p.floorOn) svg.append(s("rect", { x: x(p.floorFrom - 1), y: m.t, width: x(p.floorTo) - x(p.floorFrom - 1), height: 14, fill: css("--wall-soft") }), s("text", { x: x(p.floorFrom - 1) + 4, y: m.t + 11, fill: css("--wall-d") }, "take-or-pay floor"));
    stackBox.prepend(svg);
  }
  function drawPrices(duals) {
    const T = p.T, Hh = 170, mm = { l: 52, r: 12, t: 12, b: 30 };
    const max = Math.max(p.spotCost, ...duals) * 1.18;
    const x = scale(0, T, mm.l, W - mm.r), y = scale(0, max, Hh - mm.b, mm.t), bw = (x(1) - x(0)) * 0.6;
    const svg = s("svg", { class: "chart", viewBox: `0 0 ${W} ${Hh}`, role: "img", "aria-label": "Marginal cost of one more MW of demand per quarter" });
    svg.append(axes({ x: v => x(v + 0.5), y, W, H: Hh, m: mm, xt: [0, 2, 4, 6, 8, 10], xfmt: t => QUARTERS[t], yt: niceTicks(0, max, 4), yfmt: v => "$" + v }));
    for (const [lab, val, c] of [["spot", p.spotCost, "--brass"], ["lease", p.leaseCost, "--blue"], ["build", p.buildCost, "--green"]]) {
      svg.append(s("line", { x1: mm.l, x2: W - mm.r, y1: y(val), y2: y(val), stroke: css(c), "stroke-dasharray": "3 4" }), s("text", { class: "halo", x: W - mm.r - 2, y: y(val) - 3, "text-anchor": "end", fill: css(c) }, lab));
    }
    duals.slice(0, T).forEach((d, i) => {
      const r2 = s("rect", { x: x(i) + ((x(1) - x(0)) - bw) / 2, y: y(d), width: bw, height: Math.max(0, y(0) - y(d)), fill: css("--ink-2"), rx: 2 });
      r2.append(s("title", {}, `${QUARTERS[i]}: one more MW costs ${f.m(d)} for the quarter`));
      svg.append(r2, s("text", { class: "val halo", x: x(i + 0.5), y: y(d) - 4, "text-anchor": "middle", "font-size": 10 }, d.toFixed(2)));
    });
    priceBox.innerHTML = ""; priceBox.append(svg, h("p", { class: "note", html: "Bars: the dual of each quarter's demand row, in $M per MW-quarter. A bar of zero means existing commitments already cover one more MW (the floor or a lumpy tranche left slack)." }));
  }

  const run = scheduler(async () => {
    model = s2Model(p);
    r = await model.solve();
    if (r.status !== "optimal") { stackBox.innerHTML = `<div class="callout warn">Solver status: ${r.status}.</div>`; return; }
    const st = s2Stack(p, r), D = s2Demand(p);
    const duals = Array.from({ length: p.T }, (_, i) => r.dual[`demand_${i + 1}`]);
    drawStack(st, D); drawPrices(duals);
    ro.cost.set(f.money(r.obj)); ro.cost.querySelector(".s").replaceChildren(tp());
    let floorCost = 0;
    if (p.floorOn) {
      const r0 = await s2Model({ ...p, floorOn: false }).solve();
      floorCost = r.obj - r0.obj;
      ro.floor.set(f.m(floorCost, 1), "what you'd pay to make it an “up to”");
    } else ro.floor.set("off", "");
    ro.tail.set(f.money(s2Tail(p, r)), p.tail === "ignore" ? "invisible to the objective" : "now charged");
    const spot = st.slice(0, p.T).reduce((a, q) => a + q.spot, 0), tot = st.slice(0, p.T).reduce((a, q) => a + q.owned + q.legacy + q.lease + q.build + q.spot, 0);
    ro.spot.set(f.pct(spot / tot, 1));
    floorTbl.innerHTML = "";
    if (p.floorOn) {
      // The floor rows are degenerate (the shadow price isn't unique), so quote one-sided prices by re-solving.
      const rows = [];
      for (let t = p.floorFrom; t <= p.floorTo; t++) {
        const mk = d => { const m2 = s2Model(p); const row = m2.rows.find(x => x.name === `floor_${t}`); row.lb += d; return m2.solve(); };
        const up = await mk(1), dn = await mk(-1);
        rows.push([QUARTERS[t - 1], up.obj - r.obj, r.obj - dn.obj]);
      }
      floorTbl.append(h("table", { class: "t" }, h("thead", {}, h("tr", {}, h("th", {}, "Floor quarter ($M per MW)"), ...rows.map(q => h("th", {}, q[0])))),
        h("tbody", {},
          h("tr", {}, h("td", {}, "Raise the floor 1 MW: extra cost"), ...rows.map(q => h("td", { class: "num" }, f.n(q[1], 2)))),
          h("tr", {}, h("td", {}, "Lower it 1 MW: saving"), ...rows.map(q => h("td", { class: "num" }, f.n(q[2], 2)))))),
        h("p", { class: "note", html: "Measured by re-solving, not read off the dual: these floor rows are <b>degenerate</b>, so the solver's single “shadow price” for each is one valid answer out of a range. When the two rows differ, the honest quote is the pair. Zero saving = you'd hold that much lease anyway." }));
    }
    card.refresh();
    if (p.floorOn && p.floor === S2.floor && p.growth === S2.growth) {
      ledger.put("s2-floor", { what: "Step 2 · converting the 150 MW take-or-pay floor to an “up to”", price: `${f.m(floorCost, 1)} over the floor period`, note: "Most you'd pay the neocloud for the flexibility (teaching prices)." });
      ledger.put("s2-next", { what: `Step 2 · one more MW of demand in ${QUARTERS[1]} vs ${QUARTERS[10]}`, price: `${f.m(r.dual.demand_2)} vs ${f.m(r.dual.demand_11)} per MW-quarter`, note: "Lead times set the marginal price of capacity." });
    }
  });
  run();
}
