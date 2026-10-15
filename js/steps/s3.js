// Step 3 · Who gets which GPUs — assignment (integral for free), generalized assignment (not), and a cost–latency frontier.
import { h, s, f, slider, seg, predict, clicks, say, beyond, modelCard, readout, scheduler, scale, niceTicks, axes, legend, css, ledger, touch } from "../ui.js";
import { S3_TEAMS, S3_CLUSTERS, S3_COST, S3_JOBS, S3_POOLS, s3AssignModel, s3GapModel, s3GapCost, s3GapLat, rng } from "../models.js";

export async function render(root) {
  let cost = S3_COST.map(r => r.slice());
  let assignM = null, gapM = null;

  root.append(
    h("p", { class: "lede", html: "Six teams, six clusters that differ in chip, software stack and region. Who goes where? Matching problems run everything from kidney exchanges (the course's case) to GPU scheduling. They hide one of optimization's best free lunches, and the step shows exactly where it ends." }),
    predict({
      q: "You solve the team-to-cluster matching as a plain LP, allowing fractions (0.4 of a team on a cluster). What comes back?",
      options: ["Fractions everywhere, so you have to round", "Exactly one cluster per team, every time", "It depends on the costs"],
      answer: 1,
      explain: "Pure assignment has a special constraint matrix (it's <i>totally unimodular</i>), so every corner of its floor plan is whole-numbered. The LP lands on a corner, so it returns 0s and 1s for free, whatever the costs. Shuffle the costs below to try to break it.",
    }));

  // (a) Assignment heatmap
  const heat = h("div", { class: "chartbox" });
  const roA = { obj: readout("Cost of the best matching", "", { cls: "brass", sub: "$M per quarter" }), frac: readout("Fractional values in the LP answer", "", { cls: "good" }), tries: readout("Cost tables tried", "1", {}) };
  let tries = 1;
  root.append(h("div", { class: "card" },
    h("div", { class: "card-h" }, h("h3", {}, "(a) Teams to clusters"), h("span", { class: "sub" }, "$M per quarter for each pairing. Outlined = the LP's answer.")),
    heat,
    h("div", { class: "btnrow", style: { marginTop: "10px" } },
      h("button", { class: "btn small", type: "button", onclick: e => { const r = rng(Date.now() % 1e6); cost = cost.map(row => row.map(() => +(3 + r() * 12).toFixed(1))); tries++; runA(); touch(e.target); } }, "Shuffle the costs"),
      h("button", { class: "btn small ghost", type: "button", onclick: e => { cost = S3_COST.map(r => r.slice()); runA(); touch(e.target); } }, "Reset")),
    h("div", { class: "readouts" }, roA.obj, roA.frac, roA.tries),
    h("p", { class: "note" }, "HiGHS returns one optimal matching; when two pairings tie (the default table has a tie), either is correct.")));

  // (b) GAP
  const gapBox = h("div", {});
  const roB = { lp: readout("LP relaxation (fractions allowed)", "", {}), ip: readout("Whole jobs only (MIP)", "", { cls: "brass" }), gap: readout("Integrality gap", "", { cls: "wall" }) };
  root.append(h("div", { class: "card" },
    h("div", { class: "card-h" }, h("h3", {}, "(b) Add one realistic row"), h("span", { class: "sub" }, "Jobs have sizes and clusters have capacity. Same LP, one new kind of constraint.")),
    gapBox, h("div", { class: "readouts" }, roB.lp, roB.ip, roB.gap)));

  // (c) Frontier
  const fBox = h("div", { class: "chartbox" }), fTbl = h("div", { class: "tbl-wrap" });
  let frontier = [], pick = 0;
  const fSlider = slider({ label: "Latency budget (user-weighted ms): slide left to tighten", min: 0, max: 9, step: 1, value: 9, fmt: v => frontier[v] ? f.n(frontier[v].lat, 1) : "", id: "s3f", oninput: v => { pick = v; drawFrontier(); } });
  root.append(h("div", { class: "card" },
    h("div", { class: "card-h" }, h("h3", {}, "(c) Cost or latency?"), h("span", { class: "sub" }, "User-facing jobs want the close (expensive) cluster. Each dot is the cheapest plan under a latency budget.")),
    h("div", { class: "grid2" }, h("div", {}, fBox), h("div", { class: "ctrl" }, fSlider, h("p", { class: "note", html: "Built with the <b>ε-constraint method</b>: minimize cost subject to latency ≤ budget, then tighten the budget. Weighted sums (“cost + w × latency”) miss frontier points that sit in a dent; the ε-constraint finds them all." }))),
    fTbl));

  const card = modelCard({
    decisions: "(a) <i>x<sub>ij</sub></i> = 1 if team <i>i</i> gets cluster <i>j</i>. (b, c) <i>y<sub>ij</sub></i> = 1 if job <i>i</i> runs on pool <i>j</i>.",
    objective: "Minimize total $M per quarter (cost of each pairing).",
    constraints: "(a) each team gets exactly one cluster; each cluster hosts exactly one team. (b) each job placed exactly once; Σ job MW on a pool ≤ pool capacity. (c) plus Σ latency weight × ms ≤ budget.",
    py: "s3_who_gets_which_gpus.py",
    excel: "a 6×6 grid of changing cells with row sums = 1 and column sums = 1. Solver's Simplex LP returns 0/1 without an integer constraint, which surprises everyone the first time. For (b) you must add “int” or “bin” constraints and switch to the slower branch-and-bound.",
    getLP: () => (gapM || assignM)?.toLP() || "",
  });
  root.append(
    clicks(null, h("ul", {},
      h("li", { html: "<b>Pure matching is integral for free.</b> One-to-one assignment and transportation problems have totally unimodular constraint matrices, so the LP's corners are whole numbers." }),
      h("li", { html: "<b>One capacity row ends the free lunch.</b> Give jobs sizes and clusters capacities (the <i>generalized assignment problem</i>) and the LP splits jobs into fractions. Whole jobs only makes it NP-hard. That's why GPU schedulers are heuristics with guarantees, not exact solvers." }),
      h("li", { html: "<b>“Optimal” depends on the weights.</b> The frontier is the honest exhibit for a leadership trade-off: show the curve and let the decision-maker pick the point, rather than burying a weight in a formula." }))),
    say("Matching is easy until sizes and capacities show up; then it's a hard integer problem. And when two goals fight, I bring the frontier, not a single answer."),
    card,
    beyond([
      ["Course case", "Kidney exchange", "The UK Living Kidney Sharing Scheme matches incompatible donor–recipient pairs in cycles and chains. It's an integer program with a matching structure, solved to a strict hierarchy of objectives (most transplants first, then quality). Same toolkit, life-and-death stakes."],
      ["Beyond the course", "Compute marketplaces", "GPU marketplaces match buyers' jobs to sellers' capacity blocks. When block sizes and job sizes don't line up, the matching becomes a packing problem, and the clearing price moves with it."],
    ]));

  // drawing
  function drawHeat(r) {
    const n = cost.length, cw = 78, ch = 38, L = 140, T = 44, W = L + cw * n + 8, H = T + ch * n + 6;
    const svg = s("svg", { class: "chart", viewBox: `0 0 ${W} ${H}`, role: "img", "aria-label": "Assignment cost matrix with the optimal matching outlined" });
    const all = cost.flat(), lo = Math.min(...all), hi = Math.max(...all);
    S3_CLUSTERS.forEach((c, j) => { const [a, b] = c.split(" · "); svg.append(s("text", { x: L + cw * j + cw / 2, y: 18, "text-anchor": "middle", class: "lbl" }, a), s("text", { x: L + cw * j + cw / 2, y: 33, "text-anchor": "middle" }, b)); });
    for (let i = 0; i < n; i++) {
      svg.append(s("text", { x: L - 8, y: T + ch * i + ch / 2 + 4, "text-anchor": "end", class: "lbl" }, S3_TEAMS[i]));
      for (let j = 0; j < n; j++) {
        const v = cost[i][j], t = (v - lo) / (hi - lo || 1);
        const on = r.x[`x_${i}_${j}`] > 0.5;
        svg.append(s("rect", { x: L + cw * j + 2, y: T + ch * i + 2, width: cw - 4, height: ch - 4, rx: 4, fill: css("--brass"), "fill-opacity": 0.1 + 0.45 * (1 - t), stroke: on ? css("--ink") : "none", "stroke-width": on ? 3 : 0 }));
        svg.append(s("text", { class: "halo", x: L + cw * j + cw / 2, y: T + ch * i + ch / 2 + 4, "text-anchor": "middle", fill: css("--ink"), "font-weight": on ? 700 : 500, "font-family": "IBM Plex Mono, monospace", "font-size": 12 }, v.toFixed(1)));
      }
    }
    heat.innerHTML = ""; heat.append(svg);
  }
  const runA = scheduler(async () => {
    assignM = s3AssignModel(cost);
    const r = await assignM.solve();
    const frac = Object.values(r.x).filter(v => v > 1e-6 && v < 1 - 1e-6).length;
    drawHeat(r);
    roA.obj.set(f.n(r.obj, 1)); roA.frac.set(String(frac), frac ? "" : "every value is exactly 0 or 1"); roA.tries.set(String(tries));
    card.refresh();
  });

  async function runB() {
    gapM = s3GapModel({ integer: true });
    const lp = await s3GapModel({ integer: false }).solve(), ip = await gapM.solve();
    roB.lp.set(f.m(lp.obj, 2)); roB.ip.set(f.m(ip.obj, 2)); roB.gap.set(f.pct((ip.obj - lp.obj) / ip.obj, 1), "the price of whole jobs");
    const tbl = h("table", { class: "t" }, h("thead", {}, h("tr", {}, h("th", {}, "Job (MW)"), ...S3_POOLS.map(pl => h("th", {}, `${pl.label} · cap ${pl.cap}`)))),
      h("tbody", {}, S3_JOBS.map((job, i) => h("tr", {}, h("td", {}, `${job.label} (${job.mw})`), ...S3_POOLS.map((_, j) => {
        const a = lp.x[`y_${i}_${j}`], b = ip.x[`y_${i}_${j}`];
        const txt = (a > 1e-6 ? (a > 1 - 1e-6 ? "LP 1" : `LP ${a.toFixed(2)}`) : "") + (b > 0.5 ? (a > 1e-6 ? " · " : "") + "MIP ✓" : "");
        const fracCell = a > 1e-6 && a < 1 - 1e-6;
        return h("td", { class: "num", style: fracCell ? { background: "var(--wall-soft)", color: "var(--wall-d)", fontWeight: 600 } : {} }, txt);
      })))));
    let ex = "";
    for (let i = 0; i < S3_JOBS.length && !ex; i++) {
      const parts = S3_POOLS.map((pl, j) => [pl, lp.x[`y_${i}_${j}`]]).filter(([, v]) => v > 1e-6 && v < 1 - 1e-6);
      if (parts.length > 1) ex = `${S3_JOBS[i].label}: ${parts.map(([pl, v]) => `${v.toFixed(2)} in ${pl.label.split(" · ")[1]}`).join(", ")}`;
    }
    gapBox.innerHTML = ""; gapBox.append(h("div", { class: "tbl-wrap" }, tbl), h("p", { class: "note", html: `Orange cells: the LP splits a job across pools${ex ? ` (${ex})` : ""}, which you can't do with one training run or one serving deployment. The MIP (✓) is the real plan.` }));
    ledger.put("s3-gap", { what: "Step 3 · keeping every job whole (8 jobs, 4 pools)", price: `${f.m(ip.obj - lp.obj, 2)} per quarter`, note: "The integrality gap: what indivisibility costs versus the fractional bound." });
  }

  const lat = x => { let l = 0; for (const [k, v] of Object.entries(x)) if (v > 0.5) { const [, i, j] = k.split("_").map(Number); l += s3GapLat(i, j); } return l; };
  async function buildFrontier() {
    const pts = [];
    let r = await s3GapModel().solve(), L = lat(r.x);
    pts.push({ cost: r.obj, lat: L, x: r.x });
    for (let k = 0; k < 30; k++) {
      const q = await s3GapModel({ latCap: L - 0.01 }).solve();
      if (q.status !== "optimal") break;
      L = lat(q.x); pts.push({ cost: q.obj, lat: L, x: q.x });
    }
    // keep Pareto-efficient points only (drop any point with equal cost and higher latency)
    frontier = pts.filter((p1, i) => !pts.some((p2, j) => j !== i && p2.cost <= p1.cost + 1e-9 && p2.lat < p1.lat - 1e-9)).sort((a, b) => a.lat - b.lat);
    fSlider.querySelector("input").max = frontier.length - 1;
    pick = frontier.length - 1; fSlider.set(pick);
  }
  function drawFrontier() {
    const W = 520, H = 280, m = { l: 56, r: 16, t: 14, b: 40 };
    const xs = frontier.map(p1 => p1.lat), ys = frontier.map(p1 => p1.cost);
    const x = scale(Math.min(...xs) - 8, Math.max(...xs) + 8, m.l, W - m.r), y = scale(Math.min(...ys) - 1, Math.max(...ys) + 1, H - m.b, m.t);
    const svg = s("svg", { class: "chart", viewBox: `0 0 ${W} ${H}`, role: "img", "aria-label": "Cost versus latency frontier" });
    svg.append(axes({ x, y, W, H, m, xt: niceTicks(Math.min(...xs) - 8, Math.max(...xs) + 8, 6), yt: niceTicks(Math.min(...ys) - 1, Math.max(...ys) + 1, 5), yfmt: v => "$" + v, xlab: "Latency score (user-weighted round-trip ms)", ylab: "$M per quarter" }));
    let d = ""; frontier.forEach((p1, i) => { d += `${i ? "L" : "M"}${x(p1.lat)},${y(p1.cost)} `; });
    svg.append(s("path", { d, fill: "none", stroke: css("--rule-strong"), "stroke-width": 1.5 }));
    frontier.forEach((p1, i) => {
      const c = s("circle", { cx: x(p1.lat), cy: y(p1.cost), r: i === pick ? 8 : 5, fill: i === pick ? css("--brass") : css("--sheet"), stroke: css("--ink"), "stroke-width": 1.5, style: "cursor:pointer" });
      c.addEventListener("click", () => { pick = i; fSlider.set(i); drawFrontier(); touch(fBox); });
      c.append(s("title", {}, `${f.m(p1.cost)} per quarter at latency ${p1.lat.toFixed(1)}`));
      svg.append(c);
    });
    fBox.innerHTML = ""; fBox.append(svg);
    const P = frontier[pick];
    fTbl.innerHTML = "";
    fTbl.append(h("table", { class: "t" }, h("thead", {}, h("tr", {}, h("th", {}, "User-facing job"), h("th", {}, "Runs on"), h("th", {}, "ms"))),
      h("tbody", {}, S3_JOBS.map((job, i) => {
        if (!job.lat) return null;
        const j = S3_POOLS.findIndex((_, jj) => P.x[`y_${i}_${jj}`] > 0.5);
        return h("tr", {}, h("td", {}, job.label), h("td", {}, S3_POOLS[j].label), h("td", { class: "num" }, S3_POOLS[j].ms));
      }))),
      h("p", { class: "note", html: `This point: <b>${f.m(P.cost, 2)}</b> a quarter, latency score <b>${P.lat.toFixed(1)}</b>. Moving from the cheapest plan to the fastest costs <b>${f.m(frontier[0].cost - frontier[frontier.length - 1].cost, 2)}</b> a quarter and cuts latency by <b>${f.pct(1 - frontier[0].lat / frontier[frontier.length - 1].lat)}</b>.` }));
  }

  await runB();
  await buildFrontier();
  drawFrontier();
  runA();
}
