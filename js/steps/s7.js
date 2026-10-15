// Step 7 · Diminishing returns — water-filling (the Lagrange multiplier is the shadow price of compute) and Chinchilla as a constrained optimization.
import { h, s, f, slider, seg, predict, clicks, say, beyond, modelCard, readout, scheduler, scale, niceTicks, axes, legend, css, ledger, plotClip } from "../ui.js";
import { S7_BETS, waterFill, betValue, CHINCHILLA_FITS, chinchilla, chinLoss } from "../models.js";

const sup = v => String(v).replace(/[0-9.\-]/g, c => ({ "0": "⁰", "1": "¹", "2": "²", "3": "³", "4": "⁴", "5": "⁵", "6": "⁶", "7": "⁷", "8": "⁸", "9": "⁹", ".": "·", "-": "⁻" })[c]);
const B200_BF16_DENSE = 2.25e15; // FLOP/s, dense BF16, from the Hyperscale Ledger corpus (NVIDIA Blackwell datasheet; mirror flagged there)

export async function render(root) {
  let budget = 200, logC = 24, mfu = 0.4;

  root.append(
    h("p", { class: "lede", html: "Now you're the research director with <b>200 MW-years</b> of compute to split across four bets. Each has diminishing returns: the first MW teaches a lot, the hundredth less. The course calls this nonlinear optimization. In practice it comes down to one rule, and the multiplier that enforces it is, once again, a shadow price." }),
    predict({
      q: "What does the best split look like?",
      options: ["Equal shares to every bet", "Everything to the bet with the biggest total payoff", "Fund each bet until its next MW pays the same as every other bet's next MW"],
      answer: 2,
      explain: "At the optimum, every funded bet has the same <b>marginal</b> return per MW. That common value, λ, is the Lagrange multiplier on the budget: the shadow price of compute. A bet whose very first MW pays less than λ gets nothing at all.",
    }));

  // (a) water-filling
  const wfBox = h("div", { class: "chartbox" });
  const ro = { lam: readout("λ: the shadow price of compute", "", { cls: "brass", sub: "capability points per extra MW-year" }), opt: readout("Best split", "", { cls: "good", sub: "capability points" }), eq: readout("Equal split", "", { sub: "capability points" }), all: readout("All-in on the biggest bet", "", { sub: "capability points" }) };
  const alloc = h("div", { class: "tbl-wrap" });
  root.append(h("div", { class: "card" },
    h("div", { class: "card-h" }, h("h3", {}, "(a) Split the budget"), h("span", { class: "sub" }, "Each curve is a bet's marginal return. The water line is λ: every funded bet is filled until its marginal return falls to it.")),
    h("div", { class: "grid2" }, wfBox, h("div", { class: "ctrl" }, slider({ label: "Compute budget (MW-years)", min: 10, max: 600, step: 5, value: budget, fmt: v => v, id: "s7b", oninput: v => { budget = v; runA(); } }))),
    alloc,
    h("div", { class: "readouts" }, ro.lam, ro.opt, ro.eq, ro.all),
    h("p", { class: "note" }, "Return curves are teaching models (a·ln(1 + x/b)); “capability points” is a made-up unit. The rule doesn't depend on them: equal marginal returns, and λ prices the budget.")));

  // (b) Chinchilla
  const chBox = h("div", { class: "chartbox" }), chTbl = h("div", { class: "tbl-wrap" });
  root.append(h("div", { class: "card" },
    h("div", { class: "card-h" }, h("h3", {}, "(b) Chinchilla is a constrained optimization"), h("span", { class: "sub" }, "Minimize loss L(N, D) = E + A/N^α + B/D^β subject to 6·N·D = C. Same Lagrangian, published numbers.")),
    h("div", { class: "grid2" }, chBox, h("div", { class: "ctrl" },
      slider({ label: "Training compute C (FLOPs)", min: 21, max: 27, step: 0.1, value: logC, fmt: v => `10${sup(v.toFixed(1))}`, id: "s7c", oninput: v => { logC = v; runB(); } }),
      slider({ label: "Model FLOPs utilization (for the GPU-days)", min: 0.2, max: 0.6, step: 0.01, value: mfu, fmt: v => f.pct(v), id: "s7m", oninput: v => { mfu = v; runB(); } }))),
    chTbl));

  const card = modelCard({
    decisions: "(a) MW-years <i>x<sub>i</sub></i> to each bet. (b) parameters <i>N</i> and training tokens <i>D</i>.",
    objective: "(a) Maximize Σ a<sub>i</sub> ln(1 + x<sub>i</sub>/b<sub>i</sub>). (b) Minimize E + A/N<sup>α</sup> + B/D<sup>β</sup>.",
    constraints: "(a) Σ x<sub>i</sub> = budget, x ≥ 0. KKT: a<sub>i</sub>/(b<sub>i</sub> + x<sub>i</sub>) = λ for funded bets, ≤ λ for unfunded. Solved by bisection on λ (exact to machine precision). (b) 6ND = C. Closed form (Hoffmann et al. 2022, eq. 4): N* = G·(C/6)<sup>β/(α+β)</sup>, D* = G<sup>−1</sup>·(C/6)<sup>α/(α+β)</sup>, G = (αA / βB)<sup>1/(α+β)</sup>.",
    py: "s7_diminishing_returns.py",
    excel: "Solver's GRG Nonlinear engine solves (a) directly. The course's portfolio session (Pension Realty) is the same structure with a risk term: Markowitz is a quadratic program, which HiGHS also solves.",
    getLP: () => "(a) and (b) are solved in closed form / by bisection on λ, not by the LP solver: the KKT conditions give the answer exactly.",
  });
  root.append(
    clicks(null, h("ul", {},
      h("li", { html: "<b>Nonlinear isn't exotic.</b> Equal marginal returns is the whole rule. The water line λ is the Lagrange multiplier, which is the shadow price of compute: what one more MW-year would add." }),
      h("li", { html: "<b>Some bets get zero.</b> If a bet's first MW pays less than λ, it's unfunded. At the default budget the agents bet gets nothing. Raise the budget and it enters once λ falls below its first-MW return." }),
      h("li", { html: "<b>Chinchilla is a Lagrangian too.</b> Split a fixed compute budget between parameters and tokens so the marginal loss reduction per FLOP is equal on both sides." }),
      h("li", { html: "<b>The optimum is only as good as the fit.</b> At 10²⁴ FLOPs, Hoffmann's unrounded fit says ~62 tokens per parameter, the paper's rounded printed values say ~98, and Epoch's 2024 refit says ~18. Rounding one exponent (β 0.2849 → 0.28) moves the rule by about 60%. That's predict-then-optimize risk in the most-cited scaling law." }))),
    say("Fund every bet until its next megawatt pays the same; that common number is what compute is worth to us. And when someone quotes a tokens-per-parameter rule, ask which fit and which rounding."),
    card,
    beyond([
      ["Sources", "The three fits", "Hoffmann et al., <i>Training Compute-Optimal Large Language Models</i> (arXiv 2203.15556): E 1.6934, A 406.4, B 410.7, α 0.3392, β 0.2849 unrounded; printed as 1.69 / 406.4 / 410.7 / 0.34 / 0.28. Besiroglu et al., <i>Chinchilla Scaling: A Replication Attempt</i> (arXiv 2404.10102): E 1.8172, A 482.01, B 2085.43, α 0.3478, β 0.3658."],
      ["Deal angle", "Compute allocation inside a lab", "Labs split compute between pretraining, RL, inference and research bets. Equal-marginal-return is the logic behind every “which team gets the next cluster” fight, and λ is the internal transfer price nobody writes down."],
    ]));

  function drawWF(r) {
    const W = 540, H = 300, m = { l: 52, r: 14, t: 14, b: 40 };
    const xmax = Math.max(budget, 200), ymax = Math.max(...S7_BETS.map(b => b.a / b.b)) * 1.05;
    const x = scale(0, xmax, m.l, W - m.r), y = scale(0, ymax, H - m.b, m.t);
    const svg = s("svg", { class: "chart", viewBox: `0 0 ${W} ${H}`, role: "img", "aria-label": "Marginal return curves and the water line" });
    svg.append(axes({ x, y, W, H, m, xt: niceTicks(0, xmax, 6), yt: niceTicks(0, ymax, 5), xlab: "MW-years to the bet", ylab: "Marginal return per MW-year" }));
    const g = plotClip(svg, W, H, m);
    const cols = ["--blue", "--green", "--plum", "--wall"];
    S7_BETS.forEach((b, i) => {
      const pts = []; for (let k = 0; k <= 100; k++) { const xx = xmax * k / 100; pts.push(`${x(xx)},${y(b.a / (b.b + xx))}`); }
      g.append(s("polyline", { points: pts.join(" "), fill: "none", stroke: css(cols[i]), "stroke-width": 2.2 }));
      g.append(s("circle", { cx: x(r.x[i]), cy: y(b.a / (b.b + r.x[i])), r: 6, fill: css(cols[i]), stroke: css("--ink"), "stroke-width": 1.2 }));
    });
    g.append(s("line", { x1: m.l, x2: W - m.r, y1: y(r.lam), y2: y(r.lam), stroke: css("--brass"), "stroke-width": 2.5, "stroke-dasharray": "7 4" }));
    svg.append(s("text", { class: "halo", x: W - m.r - 4, y: y(r.lam) - 6, "text-anchor": "end", fill: css("--brass-d"), "font-weight": 600 }, `λ = ${r.lam.toFixed(3)}`));
    wfBox.innerHTML = ""; wfBox.append(svg, legend(S7_BETS.map((b, i) => [css(cols[i]), b.label])));
  }
  const runA = scheduler(async () => {
    const r = waterFill(budget);
    drawWF(r);
    const eq = betValue(S7_BETS.map(() => budget / 4)), best = S7_BETS.reduce((a, b, i) => (b.a > S7_BETS[a].a ? i : a), 0);
    const all = betValue(S7_BETS.map((_, i) => (i === best ? budget : 0)));
    ro.lam.set(r.lam.toFixed(3)); ro.opt.set(f.n(r.value, 1)); ro.eq.set(f.n(eq, 1), `${f.pct(eq / r.value - 1, 1)} vs best`); ro.all.set(f.n(all, 1), `${f.pct(all / r.value - 1, 1)} vs best`);
    alloc.innerHTML = "";
    alloc.append(h("table", { class: "t" }, h("thead", {}, h("tr", {}, ["Bet", "MW-years", "Next MW pays"].map(t => h("th", {}, t)))),
      h("tbody", {}, S7_BETS.map((b, i) => h("tr", {}, h("td", {}, b.label), h("td", { class: "num" }, f.n(r.x[i], 1)), h("td", { class: "num" }, (b.a / (b.b + r.x[i])).toFixed(3) + (r.x[i] < 1e-9 ? " (< λ: unfunded)" : "")))))));
    if (budget === 200) ledger.put("s7-lam", { what: "Step 7 · one more MW-year for research (200 MW-yr budget)", price: `λ = ${r.lam.toFixed(3)} capability points`, note: "The internal shadow price of compute; teaching return curves." });
  });

  const runB = scheduler(async () => {
    const C = Math.pow(10, logC);
    const W = 540, H = 300, m = { l: 56, r: 14, t: 14, b: 42 };
    const sols = CHINCHILLA_FITS.map(fit => ({ fit, sol: chinchilla(C, fit) }));
    const Ns = sols.map(q => q.sol.N), lo = Math.log10(Math.min(...Ns)) - 1, hi = Math.log10(Math.max(...Ns)) + 1;
    const curves = sols.map(({ fit }) => { const pts = []; for (let k = 0; k <= 120; k++) { const ln = lo + (hi - lo) * k / 120; pts.push([ln, chinLoss(Math.pow(10, ln), C, fit)]); } return pts; });
    const ys = curves.flat().map(q => q[1]), ylo = Math.min(...ys), yhi = Math.min(Math.max(...ys), ylo + 0.6);
    const x = scale(lo, hi, m.l, W - m.r), y = scale(ylo - 0.01, yhi, H - m.b, m.t);
    const svg = s("svg", { class: "chart", viewBox: `0 0 ${W} ${H}`, role: "img", "aria-label": "Loss along the iso-FLOP curve for three fits" });
    svg.append(axes({ x, y, W, H, m, xt: niceTicks(lo, hi, 5).filter(v => Number.isInteger(v)), xfmt: v => `10${sup(v)}`, yt: niceTicks(ylo - 0.01, yhi, 5), yfmt: v => v.toFixed(2), xlab: "Parameters N (log scale); tokens D = C / 6N", ylab: "Predicted loss" }));
    const g = plotClip(svg, W, H, m);
    const cols = ["--blue", "--chart-6", "--wall"];
    curves.forEach((pts, i) => g.append(s("polyline", { points: pts.map(([a, b]) => `${x(a)},${y(b)}`).join(" "), fill: "none", stroke: css(cols[i]), "stroke-width": 2.2, "stroke-dasharray": i === 1 ? "6 4" : null })));
    sols.forEach(({ sol }, i) => g.append(s("circle", { cx: x(Math.log10(sol.N)), cy: y(sol.L), r: 6, fill: css(cols[i]), stroke: css("--ink"), "stroke-width": 1.2 })));
    chBox.innerHTML = ""; chBox.append(svg, legend(CHINCHILLA_FITS.map((fit, i) => [css(cols[i]), fit.label])));
    const gpuDays = C / (B200_BF16_DENSE * mfu) / 86400;
    chTbl.innerHTML = "";
    chTbl.append(h("table", { class: "t" }, h("thead", {}, h("tr", {}, ["Fit", "N*", "D* (tokens)", "Tokens / param"].map(t => h("th", {}, t)))),
      h("tbody", {}, sols.map(({ fit, sol }) => h("tr", {}, h("td", {}, fit.label), h("td", { class: "num" }, `${(sol.N / 1e9).toFixed(1)}B`), h("td", { class: "num" }, `${(sol.D / 1e12).toFixed(2)}T`), h("td", { class: "num" }, sol.ratio.toFixed(1)))))),
      h("p", { class: "note", html: `This run is about <b>${f.int(gpuDays)} B200 GPU-days</b> at ${f.pct(mfu)} utilization (dense BF16 2.25 PFLOP/s, from the Hyperscale Ledger), or ${f.int(gpuDays / 30)} GPUs for a month.` }));
    if (Math.abs(logC - 24) < 1e-9) ledger.put("s7-chin", { what: "Step 7 · Chinchilla tokens per parameter at 10²⁴ FLOPs", price: sols.map(q => q.sol.ratio.toFixed(0)).join(" / "), note: "Hoffmann unrounded / Hoffmann as printed / Epoch refit: the rule depends on the fit." });
  });
  runA(); runB();
}
