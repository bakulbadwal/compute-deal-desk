// Step 0 · Three questions — a two-variable LP you can see.
import { h, s, f, plotClip, slider, toggle, predict, clicks, say, beyond, modelCard, readout, scheduler, scale, niceTicks, axes, legend, css, ledger, tp } from "../ui.js";
import { S0, s0Model, s0Margins } from "../models.js";
import { costPerMWyr, revenuePerMWyr } from "../econ.js";
import { isBinding } from "../lp.js";

export async function render(root) {
  const p = structuredClone(S0);
  let last = null, model = null;

  root.append(
    h("p", { class: "lede", html: "You run a <b>250 MW neocloud campus</b>. You can lease capacity to a lab for training (reserved, billed every hour) or sell it as an inference cloud (higher price, but billed only when used). Every allocation problem, from this one to a gigawatt deal, comes down to three questions: <b>what do we decide, what are we scored on, and what stops us?</b>" }),
    predict({
      q: "At the default prices, which walls will the best plan be pressed against?",
      options: ["Only the grid connection", "The grid and inference demand", "The network fabric and the grid", "None: there's slack everywhere"],
      answer: 1,
      explain: () => `Inference earns more per MW (${f.m(s0Margins(p).I)} vs ${f.m(s0Margins(p).T)} per MW-year), so the plan sells all the inference the market will buy, then fills the rest of the grid with training. Two walls bind, so the plan sits at their corner.`,
    }),
  );

  // ── Widget
  const chartBox = h("div", { class: "chartbox" });
  const ro = {
    T: readout("Training lease", "", { sub: "MW" }), I: readout("Inference cloud", "", { sub: "MW" }),
    obj: readout("Annual margin", "", { cls: "brass" }), bind: readout("Walls you're pressed against", "", { cls: "wall txt" }),
  };
  const wallNames = { grid: "Grid connection", demand: "Inference demand", fabric: "Network fabric", anchor: "Anchor lease floor" };
  const ctrl = h("div", { class: "ctrl" },
    h("h4", {}, "Prices"),
    slider({ label: "Training lease, $/GPU-hour", min: 1.2, max: 3.2, step: 0.05, value: p.pTrain, fmt: v => f.gh(v), id: "s0pt", oninput: v => { p.pTrain = v; run(); } }),
    slider({ label: "Inference cloud, $/GPU-hour", min: 2.0, max: 5.0, step: 0.05, value: p.pInfer, fmt: v => f.gh(v), id: "s0pi", oninput: v => { p.pInfer = v; run(); } }),
    slider({ label: "Inference utilization (share of hours billed)", min: 0.3, max: 1, step: 0.01, value: p.uInfer, fmt: v => f.pct(v), id: "s0ui", oninput: v => { p.uInfer = v; run(); } }),
    h("h4", {}, "Walls"),
    slider({ label: "Inference demand (MW the market will buy)", min: 40, max: 240, step: 5, value: p.inferDemand, fmt: v => f.mw(v), id: "s0d", oninput: v => { p.inferDemand = v; run(); } }),
    ...Object.entries(wallNames).map(([k, lab]) => toggle({ label: `Wall on: ${lab}`, checked: true, onchange: v => { p.walls[k] = v; run(); } })),
  );
  const marginTbl = h("div", { class: "tbl-wrap" });
  root.append(h("div", { class: "card" },
    h("div", { class: "card-h" }, h("h3", {}, "The floor plan"), h("span", { class: "sub" }, "Shaded = every plan the walls allow. Orange = a wall you're pressed against.")),
    h("div", { class: "grid2" }, h("div", {}, chartBox, legend([[css("--blue-soft") || "#DCE7F2", "Feasible plans"], [css("--wall"), "Binding wall"], [css("--rule-strong"), "Wall with slack"], [css("--brass"), "Best plan + iso-margin line"]])), ctrl),
    h("div", { class: "readouts" }, ro.T, ro.I, ro.obj, ro.bind),
    h("details", {}, h("summary", { class: "small" }, "Where the margins come from (Hyperscale Ledger unit economics)"), marginTbl)));

  const card = modelCard({
    decisions: "<i>T</i> = MW leased for training, <i>I</i> = MW sold as inference cloud.",
    objective: "Maximize annual margin: <i>m<sub>T</sub>·T + m<sub>I</sub>·I</i> ($M per MW-year, from price × hours × GPUs × billed share − depreciation − power − opex).",
    constraints: "Grid: <i>T + I ≤ 250</i>. Inference demand: <i>I ≤ d</i>. Fabric: <i>T + 0.4·I ≤ 220</i> (training needs a full non-blocking spine). Anchor floor: <i>T ≥ 60</i>.",
    py: "s0_three_questions.py",
    excel: "two changing cells (T, I), one objective cell, four constraint rows. Solver's “Simplex LP” engine solves it. In a 2-variable model you can also just draw it, which is what this chart does.",
    getLP: () => model?.toLP() || "",
  });
  root.append(
    clicks(null,
      h("ul", {},
        h("li", { html: "<b>Decisions, objective, walls.</b> Name all three before touching a spreadsheet. Most bad models are wrong at this step, not in the math." }),
        h("li", { html: "<b>The best plan sits on a corner of the floor plan.</b> Drag the inference price: the plan doesn't slide smoothly, it <i>jumps</i> from corner to corner when the iso-margin line tilts past a wall." }),
        h("li", { html: "<b>Which walls bind is the story.</b> A wall with air between you and it is worth nothing at the margin. Switch the fabric wall off: nothing changes, because you weren't pressed against it." }))),
    say("Every allocation is three answers: what we decide, what we're scored on, and what stops us. The plan lives on a corner, and the walls we're pressed against are the whole negotiation."),
    card,
    beyond([
      ["Beyond the course", "Your cluster scheduler is solving one of these", "Kubernetes-style GPU schedulers and the inference engines in <a href=\"https://bakulbadwal.github.io/inference-kitchen/\">Inference Kitchen</a> solve small allocation problems thousands of times a second; the business version is the same shape, just slower and with contracts."],
      ["Interview line", "“What's binding?”", "In any capacity conversation, ask which constraint binds before you ask for more of anything. More of a slack resource is worth zero."],
    ]));

  // ── Drawing
  const W = 520, H = 360, m = { l: 48, r: 14, t: 14, b: 40 };
  const x = scale(0, 300, m.l, W - m.r), y = scale(0, 260, H - m.b, m.t);
  function lines() {
    const L = [{ a: 1, b: 0, c: 0, ge: true, id: "axT" }, { a: 0, b: 1, c: 0, ge: true, id: "axI" }, { a: 1, b: 1, c: 400, id: "halls" }];
    if (p.walls.grid) L.push({ a: 1, b: 1, c: p.grid, id: "grid" });
    if (p.walls.demand) L.push({ a: 0, b: 1, c: p.inferDemand, id: "demand" });
    if (p.walls.fabric) L.push({ a: 1, b: 0.4, c: p.fabric, id: "fabric" });
    if (p.walls.anchor) L.push({ a: 1, b: 0, c: p.anchor, ge: true, id: "anchor" });
    return L;
  }
  function polygon(L) {
    const pts = [];
    for (let i = 0; i < L.length; i++) for (let j = i + 1; j < L.length; j++) {
      const A = L[i], B = L[j], det = A.a * B.b - A.b * B.a;
      if (Math.abs(det) < 1e-12) continue;
      const T = (A.c * B.b - A.b * B.c) / det, I = (A.a * B.c - A.c * B.a) / det;
      if (L.every(l => (l.ge ? l.a * T + l.b * I >= l.c - 1e-7 : l.a * T + l.b * I <= l.c + 1e-7))) pts.push([T, I]);
    }
    const cx = pts.reduce((a, q) => a + q[0], 0) / pts.length, cy = pts.reduce((a, q) => a + q[1], 0) / pts.length;
    return pts.sort((u, v) => Math.atan2(u[1] - cy, u[0] - cx) - Math.atan2(v[1] - cy, v[0] - cx));
  }
  function draw(r) {
    const svg = s("svg", { class: "chart", viewBox: `0 0 ${W} ${H}`, role: "img", "aria-label": `Feasible region; best plan T=${r.x.T.toFixed(0)} MW, I=${r.x.I.toFixed(0)} MW` });
    svg.append(axes({ x, y, W, H, m, xt: niceTicks(0, 300, 6), yt: niceTicks(0, 260, 5), xlab: "T · training lease (MW)", ylab: "I · inference cloud (MW)" }));
    const L = lines(), poly = polygon(L);
    const g = plotClip(svg, W, H, m);
    if (poly.length > 2) g.append(s("polygon", { points: poly.map(([a, b]) => `${x(a)},${y(b)}`).join(" "), fill: css("--blue-soft"), stroke: "none", opacity: 0.9 }));
    // walls
    for (const l of L.filter(l => wallNames[l.id])) {
      const row = model.rows.find(rw => rw.name === l.id);
      const bind = row && isBinding(row, r.act[l.id]);
      let p1, p2;
      if (Math.abs(l.b) < 1e-12) { p1 = [l.c / l.a, 0]; p2 = [l.c / l.a, 260]; }
      else { p1 = [0, l.c / l.b]; p2 = [300, (l.c - l.a * 300) / l.b]; }
      const col = bind ? css("--wall") : css("--rule-strong");
      g.append(s("line", { x1: x(p1[0]), y1: y(p1[1]), x2: x(p2[0]), y2: y(p2[1]), stroke: col, "stroke-width": bind ? 3 : 1.6, "stroke-dasharray": bind ? null : "5 4" }));
      // Label positions chosen so no two labels share a corner: grid at the top-left, fabric above the grid line at the top,
      // anchor floor along the x-axis, demand at the right end of its own line.
      const pos = { grid: [8, p.grid - 14, "start"], demand: [296, p.inferDemand + 6, "end"], fabric: [p.fabric - 0.4 * 236 + 4, 236, "start"], anchor: [p.anchor + 3, 6, "start"] }[l.id];
      svg.append(s("text", { class: "halo", x: x(pos[0]), y: y(pos[1]), fill: bind ? css("--wall-d") : css("--ink-3"), "font-weight": bind ? 600 : 400, "text-anchor": pos[2] }, wallNames[l.id]));
    }
    // iso-margin line through the optimum
    const mg = s0Margins(p), z = r.obj;
    if (mg.I > 0) {
      const a = [0, z / mg.I], b = [300, (z - mg.T * 300) / mg.I];
      g.append(s("line", { x1: x(a[0]), y1: y(a[1]), x2: x(b[0]), y2: y(b[1]), stroke: css("--brass"), "stroke-width": 1.6, "stroke-dasharray": "2 4" }));
    }
    // corners
    for (const [a, b] of poly) {
      const val = mg.T * a + mg.I * b;
      const c = s("circle", { cx: x(a), cy: y(b), r: 4, fill: css("--sheet"), stroke: css("--ink-2"), "stroke-width": 1.5 });
      c.append(s("title", {}, `Corner T=${a.toFixed(0)}, I=${b.toFixed(0)}: margin ${f.m(val, 0)}`));
      svg.append(c);
    }
    svg.append(s("circle", { cx: x(r.x.T), cy: y(r.x.I), r: 8, fill: css("--brass"), stroke: css("--ink"), "stroke-width": 1.5 }));
    svg.append(s("text", { class: "big", x: x(r.x.T) + 12, y: y(r.x.I) - 10 }, `best: ${r.x.T.toFixed(0)} / ${r.x.I.toFixed(0)}`));
    chartBox.innerHTML = ""; chartBox.append(svg);
  }
  function margins() {
    const c = costPerMWyr({ opexM: p.opexM });
    const rows = [["Revenue", revenuePerMWyr(p.pTrain, p.uTrain), revenuePerMWyr(p.pInfer, p.uInfer)], ["− GPU depreciation (5-yr)", -c.depreciation, -c.depreciation], ["− Power (PUE 1.14, $0.0834/kWh)", -c.power, -c.power], ["− Opex (teaching value)", -c.opex, -c.opex]];
    const mg = s0Margins(p);
    marginTbl.innerHTML = "";
    marginTbl.append(h("table", { class: "t" }, h("thead", {}, h("tr", {}, h("th", {}, "$M per MW-year"), h("th", {}, "Training lease"), h("th", {}, "Inference cloud"))),
      h("tbody", {}, rows.map(rw => h("tr", {}, h("td", {}, rw[0]), h("td", { class: "num" }, f.n(rw[1], 2)), h("td", { class: "num" }, f.n(rw[2], 2)))),
        h("tr", {}, h("td", {}, h("b", {}, "Margin")), h("td", { class: "num" }, h("b", {}, f.n(mg.T, 2))), h("td", { class: "num" }, h("b", {}, f.n(mg.I, 2)))))),
      h("p", { class: "note", html: "1 MW of IT = 600 GPUs (GB200 NVL72: 120 kW per 72 GPUs). Capex $3.0M per rack ⇒ $25M per MW. All from the Hyperscale Ledger's Scenario defaults; prices and opex are teaching values." }));
  }
  const run = scheduler(async () => {
    model = s0Model(p);
    const r = await model.solve({ ranging: true });
    if (r.status !== "optimal") { chartBox.innerHTML = `<div class="callout warn">The solver says: ${r.status}. Without enough walls the plan can grow forever; switch one back on.</div>`; return; }
    last = r;
    ro.T.set(f.n(r.x.T, 0)); ro.I.set(f.n(r.x.I, 0));
    ro.obj.set(f.m(r.obj, 0), "per year"); ro.obj.querySelector(".s").append(tp());
    const b = model.rows.filter(rw => wallNames[rw.name] && isBinding(rw, r.act[rw.name])).map(rw => wallNames[rw.name]);
    ro.bind.set(b.length ? b.join(" + ") : "none", "");
    ro.bind.setCls(b.length ? "wall txt" : "txt");
    draw(r); margins(); card.refresh();
    if (p.walls.grid) ledger.put("s0-grid", { what: "Step 0 · one more MW of grid on the 250 MW campus", price: `${f.m(r.dual.grid)} per MW-year`, note: "Shadow price of the grid wall (teaching prices). Step 1 explains it." });
  });
  run();
}
