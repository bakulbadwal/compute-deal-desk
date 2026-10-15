// Step 4 · Lumpy choices — integer programs, logical constraints, branch-and-bound, and a heuristic without a bound.
import { h, s, f, slider, toggle, predict, clicks, say, beyond, modelCard, readout, scheduler, css, onFill, ledger, touch, legend } from "../ui.js";
import { S4, S4_SITES, S4_PACK, s4Model, branchAndBound, ffd, packModel } from "../models.js";

export async function render(root) {
  const p = structuredClone(S4);
  let model = null, bb = null, shown = 0;

  root.append(
    h("p", { class: "lede", html: "You need <b>237 MW</b> of new capacity, at least <b>66 MW</b> of it live within three quarters. There are eight candidate sites: 20–40 MW colos and shells that are fast but pricey, a 120 MW Texas campus that's cheap per MW but needs a substation upgrade, a Norwegian hydro site and more. A site is a yes or a no: you can't sign 0.4 of a lease. And there's an either/or. The two Ohio sites share one utility queue position, so you can have A or B, not both." }),
    predict({
      q: "Solve it as an LP (fractions allowed), then round to whole sites. How close does that get you?",
      options: ["Rounding the LP gives the best whole-site plan", "Rounding can break the rules or cost more; you need a real integer solve", "The LP is already whole numbers, like step 3"],
      answer: 1,
      explain: "The LP wants 0.4 of one site and 0.6 of another. Round up and you overspend; round down and you miss the 237 MW. Yes/no decisions with fixed costs make the floor plan a set of dots, not a polygon, so you need branch-and-bound. The LP answer is still useful, though: it's a <b>bound</b> on what any whole-site plan can cost.",
    }));

  const siteTbl = h("div", { class: "tbl-wrap" });
  const ro = { lp: readout("LP relaxation: the bound", "", { sub: "$M per year" }), ip: readout("Best whole-site portfolio", "", { cls: "brass", sub: "$M per year" }), gap: readout("Gap the integers cost", "", { cls: "wall" }), nodes: readout("Nodes branch-and-bound explored", "", {}) };
  root.append(h("div", { class: "card" },
    h("div", { class: "card-h" }, h("h3", {}, "(a) The site portfolio"), h("span", { class: "sub" }, "Annual cost = fixed cost + MW × $/MW. Bars show how much of each site the LP wants; ✓ = chosen by the integer solve.")),
    h("div", { class: "grid2" }, siteTbl, h("div", { class: "ctrl" },
      slider({ label: "MW you need in total", min: 150, max: 330, step: 1, value: p.need, fmt: v => f.mw(v), id: "s4n", oninput: v => { p.need = v; run(); } }),
      slider({ label: "MW live within 3 quarters", min: 0, max: 120, step: 1, value: p.early, fmt: v => f.mw(v), id: "s4e", oninput: v => { p.early = v; run(); } }),
      slider({ label: "Most sites the deal team can run", min: 2, max: 8, step: 1, value: p.maxSites, fmt: v => v, id: "s4m", oninput: v => { p.maxSites = v; run(); } }),
      toggle({ label: "Logic: Texas campus needs the substation upgrade (C ≤ D)", checked: p.cRequiresD, onchange: v => { p.cRequiresD = v; run(); } }),
      toggle({ label: "Logic: one AEP queue position (A + B ≤ 1)", checked: p.aXorB, onchange: v => { p.aXorB = v; run(); } }))),
    h("div", { class: "readouts" }, ro.lp, ro.ip, ro.gap, ro.nodes)));

  const treeBox = h("div", { class: "chartbox" }), nodeInfo = h("div", { class: "callout" });
  const stepper = slider({ label: "Nodes revealed", min: 1, max: 1, step: 1, value: 1, fmt: v => `${v}`, id: "s4t", oninput: v => { if (!bb) return; shown = v; drawTree(); } });
  root.append(h("div", { class: "card" },
    h("div", { class: "card-h" }, h("h3", {}, "(b) Branch-and-bound, node by node"), h("span", { class: "sub" }, "Each node is an LP with some sites forced to 0 or 1. Step through the search.")),
    treeBox, legend([[css("--sheet-2"), "Branched (fractional LP)"], [css("--green"), "Whole-site plan found"], [css("--rule-strong"), "Pruned: bound no better than the best plan so far"], [css("--wall"), "Infeasible"]]),
    h("div", { class: "grid2", style: { marginTop: "10px" } }, h("div", { class: "ctrl" }, stepper, h("div", { class: "btnrow" },
      h("button", { class: "btn small ghost", type: "button", onclick: e => { if (!bb) return; shown = 1; stepper.set(1); drawTree(); touch(e.target); } }, "Start over"),
      h("button", { class: "btn small", type: "button", onclick: e => { if (!bb) return; shown = Math.min(bb.nodes.length, shown + 1); stepper.set(shown); drawTree(); touch(e.target); } }, "Next node →"),
      h("button", { class: "btn small ghost", type: "button", onclick: e => { if (!bb) return; shown = bb.nodes.length; stepper.set(shown); drawTree(); touch(e.target); } }, "Run to the end"))), nodeInfo)));

  const packBox = h("div", { class: "chartbox" });
  root.append(h("div", { class: "card" },
    h("div", { class: "card-h" }, h("h3", {}, "(c) A heuristic without a bound"), h("span", { class: "sub" }, `${S4_PACK.length} jobs that must each stay inside one 72-GPU NVLink rack (GB200 NVL72). How many racks?`)),
    packBox));

  const card = modelCard({
    decisions: "<i>open<sub>s</sub></i> ∈ {0, 1} for each of the eight sites (D is the substation upgrade, no MW of its own).",
    objective: "Minimize annual cost: Σ (fixed<sub>s</sub> + MW<sub>s</sub> × $/MW<sub>s</sub>) × open<sub>s</sub>.",
    constraints: "Σ MW × open ≥ 237. Σ MW × open over sites live within 3 quarters ≥ 66. <b>Logical:</b> open<sub>C</sub> ≤ open<sub>D</sub> (“if C then D”); open<sub>A</sub> + open<sub>B</sub> ≤ 1 (“A or B, not both”). Σ open ≤ 5.",
    py: "s4_lumpy_choices.py",
    excel: "binary changing cells (Solver constraint “bin”). “If C then D” is a single row, C − D ≤ 0. Solver's integer engine runs branch-and-bound like the tree above, and its “Integer Optimality %” setting is the MIP gap at which it stops.",
    getLP: () => model?.toLP() || "",
  });
  root.append(
    clicks(null, h("ul", {},
      h("li", { html: "<b>Yes/no decisions and fixed costs make problems hard.</b> The floor plan becomes a scatter of whole-number points, and the best one is usually not a rounded LP corner." }),
      h("li", { html: "<b>The relaxation is a bound.</b> No whole-site portfolio can beat the LP's cost. Branch-and-bound uses that to prune: once a plan costs no more than a branch's bound, that whole branch is dead." }),
      h("li", { html: "<b>The MIP gap is the honest stopping rule.</b> On big problems solvers stop at, say, 1% from the bound. A heuristic with no bound (first-fit packing, a greedy site list) can't tell you how far from optimal it is." }),
      h("li", { html: "<b>Logic is just rows.</b> “If C then D” is C − D ≤ 0. “A or B” is A + B ≤ 1. “At least two of these three” is a sum ≥ 2. Most deal rules translate this way." }))),
    say("The relaxation says no portfolio can cost less than $637M a year. Ours costs $684M, and branch-and-bound proved nothing whole-numbered is cheaper. That proof is why I trust it over a rule of thumb."),
    card,
    beyond([
      ["Deal angle", "The 20–30 MW pivot", "AI Deals §1: labs are now scouting portfolios of 20–30 MW sites for speed instead of single gigawatt campuses. That's this model: lumpy sites, an early-MW constraint, and a deal-team bandwidth cap."],
      ["Back to step 1", "Lumpy relief", "With all four offers on, step 1's LP bought 4.8 MW of a 40 MW substation. A real upgrade is all or nothing: make that buy variable binary and the substation is either worth the full contribution or it isn't."],
    ]));

  function drawSites(lp, ip) {
    siteTbl.innerHTML = "";
    siteTbl.append(h("table", { class: "t" }, h("thead", {}, h("tr", {}, ["Site", "MW", "Live in (qtrs)", "$M/yr if chosen", "LP wants", "Chosen"].map(t => h("th", {}, t)))),
      h("tbody", {}, S4_SITES.map(st => {
        const a = lp.x[`open_${st.id}`] ?? 0, b = ip.x?.[`open_${st.id}`] > 0.5;
        return h("tr", {}, h("td", {}, st.label), h("td", { class: "num" }, st.mw || "—"), h("td", { class: "num" }, st.q), h("td", { class: "num" }, f.n(st.fixed + st.mw * st.perMW, 1)),
          h("td", {}, h("span", { style: { display: "inline-block", width: "60px", height: "10px", background: "var(--grey-soft)", borderRadius: "3px", verticalAlign: "middle", position: "relative", overflow: "hidden" } },
            h("span", { style: { position: "absolute", inset: "0 auto 0 0", width: `${a * 100}%`, background: a > 1e-6 && a < 1 - 1e-6 ? "var(--wall)" : "var(--blue)" } })), " ", h("span", { class: "num small" }, a.toFixed(2))),
          h("td", {}, b ? "✓" : ""));
      }))));
  }
  function layout() {
    const nodes = bb.nodes, kids = new Map();
    for (const n of nodes) { if (n.parent !== null) { if (!kids.has(n.parent)) kids.set(n.parent, []); kids.get(n.parent).push(n.id); } }
    const pos = new Map(); let leaf = 0;
    const visit = id => {
      const ch = (kids.get(id) || []).slice().sort((a, b) => a - b);
      if (!ch.length) { pos.set(id, leaf++); return pos.get(id); }
      const xs = ch.map(visit); const v = (Math.min(...xs) + Math.max(...xs)) / 2; pos.set(id, v); return v;
    };
    visit(0);
    return { pos, leaves: Math.max(1, leaf) };
  }
  function drawTree() {
    const { pos, leaves } = layout();
    const depth = Math.max(...bb.nodes.map(n => n.depth));
    const W = 760, H = 70 + depth * 64, x = i => 30 + (W - 60) * (leaves > 1 ? i / (leaves - 1) : 0.5), y = d => 28 + d * 64;
    const svg = s("svg", { class: "chart", viewBox: `0 0 ${W} ${H}`, role: "img", "aria-label": "Branch-and-bound tree" });
    const vis = bb.nodes.slice(0, shown);
    const col = n => n.status === "integer" ? css("--green") : n.status === "pruned" ? css("--rule-strong") : n.status === "infeasible" ? css("--wall") : css("--sheet-2");
    for (const n of vis) if (n.parent !== null) {
      const pn = bb.nodes[n.parent];
      svg.append(s("line", { x1: x(pos.get(pn.id)), y1: y(pn.depth), x2: x(pos.get(n.id)), y2: y(n.depth), stroke: css("--rule-strong"), "stroke-width": 1.5 }));
      svg.append(s("text", { class: "halo", x: (x(pos.get(pn.id)) + x(pos.get(n.id))) / 2, y: (y(pn.depth) + y(n.depth)) / 2, "text-anchor": "middle", "font-size": 10 }, n.branch.replace("open_", "")));
    }
    vis.forEach((n, i) => {
      const last = i === vis.length - 1;
      const c = s("circle", { cx: x(pos.get(n.id)), cy: y(n.depth), r: last ? 13 : 10, fill: col(n), stroke: last ? css("--brass") : css("--ink"), "stroke-width": last ? 3 : 1.2 });
      c.append(s("title", {}, `Node ${n.id}: ${n.status}${n.bound !== undefined ? `, bound ${f.m(n.bound, 1)}` : ""}`));
      svg.append(c, s("text", { x: x(pos.get(n.id)), y: y(n.depth) + 4, "text-anchor": "middle", "font-size": 10, "font-weight": 600, fill: n.status === "integer" || n.status === "infeasible" ? onFill(col(n)) : css("--ink") }, n.id));
    });
    treeBox.innerHTML = ""; treeBox.append(svg);
    const n = vis[vis.length - 1];
    const best = vis.filter(q => q.status === "integer").reduce((a, q) => (!a || q.bound < a.bound ? q : a), null);
    const why = {
      branched: `The LP here costs ${f.m(n.bound, 1)} but wants ${(n.val ?? 0).toFixed(2)} of site ${n.on?.replace("open_", "")}. Branch: force it to 1, then to 0.`,
      integer: `Every site is whole: a real portfolio at ${f.m(n.bound, 1)}. ${best && best.id === n.id ? "It's the best so far: the new incumbent." : ""}`,
      pruned: `This LP's bound (${f.m(n.bound ?? 0, 1)}) is no better than the best whole-site plan already found, so nothing below it can win. Pruned without exploring.`,
      infeasible: "No plan meets the rules with these sites forced. Dead end.",
    }[n.status];
    nodeInfo.innerHTML = `<b>Node ${n.id}</b>${n.branch ? ` (${n.branch.replace("open_", "")})` : " (the root: plain LP)"}: ${why}<br><span class="small muted">Best whole-site plan so far: ${best ? f.m(best.bound, 1) : "none yet"} · nodes explored ${vis.length} of ${bb.nodes.length}</span>`;
  }
  async function drawPack() {
    const pk = packModel(), r = await pk.solve(), F = ffd(S4_PACK);
    const opt = [];
    for (let b = 0; b < S4_PACK.length; b++) { const items = S4_PACK.filter((_, i) => r.x[`a_${i}_${b}`] > 0.5); if (items.length) opt.push({ items, used: items.reduce((a, c) => a + c, 0) }); }
    const lower = Math.ceil(S4_PACK.reduce((a, c) => a + c, 0) / 72);
    const draw = (bins, title) => {
      const W = 360, H = 200, bw = 46, gap = 12, base = 170, scl = 140 / 72;
      const svg = s("svg", { class: "chart", viewBox: `0 0 ${W} ${H}`, role: "img", "aria-label": title });
      svg.append(s("text", { x: 4, y: 14, class: "lbl" }, title));
      bins.forEach((b, i) => {
        const x0 = 10 + i * (bw + gap);
        svg.append(s("rect", { x: x0, y: base - 72 * scl, width: bw, height: 72 * scl, fill: "none", stroke: css("--ink-3"), "stroke-dasharray": "3 3" }));
        let acc = 0;
        for (const it of b.items) {
          const fill = it === 28 ? css("--blue") : css("--plum");
          svg.append(s("rect", { x: x0 + 2, y: base - (acc + it) * scl + 1, width: bw - 4, height: it * scl - 2, rx: 3, fill }));
          svg.append(s("text", { x: x0 + bw / 2, y: base - (acc + it / 2) * scl + 4, "text-anchor": "middle", fill: onFill(fill), "font-size": 10, "font-weight": 600 }, it));
          acc += it;
        }
        svg.append(s("text", { x: x0 + bw / 2, y: base + 14, "text-anchor": "middle" }, `${b.used}/72`));
      });
      return svg;
    };
    packBox.innerHTML = "";
    packBox.append(h("div", { class: "grid2 even" }, draw(F, `First-fit decreasing: ${F.length} racks`), draw(opt, `Exact MIP: ${opt.length} racks`)),
      h("p", { class: "note", html: `Jobs of 28 and 22 GPUs. First-fit decreasing (the rule most schedulers start from) pairs the 28s first (56 of 72, stranding 16 GPUs in each of those racks), then fits the 22s three to a rack (66 of 72), and needs <b>${F.length}</b> racks. The exact solve pairs one 28 with two 22s (72 exactly) and needs <b>${opt.length}</b>, which equals the lower bound ⌈${S4_PACK.reduce((a, c) => a + c, 0)}/72⌉ = ${lower}. That lower bound is what lets you <i>prove</i> it's optimal. At ~$3M a rack, the heuristic quietly wastes one; that's fragmentation.` }));
    ledger.put("s4-rack", { what: "Step 4 · one stranded NVL72 rack from first-fit packing", price: "≈ $3.0M of capex + 120 kW", note: "Ledger rack cost. A heuristic without a bound can't see it." });
  }

  const run = scheduler(async () => {
    model = s4Model(p);
    const lp = await model.solve({ relax: true }), ip = await model.solve();
    if (ip.status !== "optimal") {
      siteTbl.innerHTML = `<div class="callout warn">No portfolio meets these rules (solver: ${ip.status}). Loosen a requirement.</div>`;
      [ro.lp, ro.ip, ro.gap, ro.nodes].forEach(r => r.set("—")); bb = null; treeBox.innerHTML = ""; nodeInfo.textContent = "No tree to walk: the root LP is already infeasible."; return;
    }
    drawSites(lp, ip);
    bb = await branchAndBound(model);
    ro.lp.set(f.n(lp.obj, 1)); ro.ip.set(f.n(ip.obj, 1)); ro.gap.set(f.pct((ip.obj - lp.obj) / ip.obj, 1)); ro.nodes.set(String(bb.nodes.length), `our tree reaches ${f.n(bb.best?.obj ?? NaN, 1)}`);
    stepper.querySelector("input").max = bb.nodes.length;
    shown = shown ? Math.min(shown, bb.nodes.length) : bb.nodes.length; stepper.set(shown);
    drawTree(); card.refresh();
    if (p.need === S4.need && p.early === S4.early) ledger.put("s4-int", { what: "Step 4 · whole sites instead of fractions (237 MW portfolio)", price: `${f.m(ip.obj - lp.obj, 1)} per year`, note: `Integrality gap ${f.pct((ip.obj - lp.obj) / ip.obj, 1)} over the LP bound (teaching prices).` });
  });
  run();
  drawPack();
}
