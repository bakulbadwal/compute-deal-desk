// Field test — ten questions answered by operating the widgets. Every answer key is computed live from the models.
import { h, f, touch } from "../ui.js";
import { S0, s0Model, S1, s1Model, S2, s2Model, s4Model, S6, s6Metrics, CHINCHILLA_FITS, chinchilla } from "../models.js";
import { isBinding } from "../lp.js";

export async function render(root) {
  root.append(h("p", { class: "lede", html: "Ten questions. Each one is answered by going back to a step and operating its widget at the <b>default settings</b> (reload a step to reset it). Numeric answers accept a small tolerance. Every answer key is computed live by the same solver, so if the models change, the key changes with them." }));

  // Compute the answer key.
  const r0m = s0Model(S0), r0 = await r0m.solve();
  const bind0 = r0m.rows.filter(rw => isBinding(rw, r0.act[rw.name])).map(rw => rw.name).sort().join("+");
  const m1 = s1Model(S1), r1 = await m1.solve({ ranging: true });
  const inc = r1.range.rows.grid.hi - S1.gridMW;
  const r40 = await s1Model({ ...S1, gridMW: S1.gridMW + 40 }).solve();
  const r2 = await s2Model(S2).solve();
  const m4 = s4Model(), lp4 = await m4.solve({ relax: true }), ip4 = await m4.solve();
  const met = await s6Metrics({ ...S6, optionOn: true });
  const epoch = chinchilla(1e24, CHINCHILLA_FITS.find(q => q.id === "epoch")).ratio;

  const Q = [
    { step: "s0", q: "Step 0, defaults: which two walls is the best plan pressed against?", type: "mc", options: [["grid+demand", "Grid connection + inference demand"], ["fabric+grid", "Network fabric + grid connection"], ["anchor+demand", "Anchor floor + inference demand"]], ans: bind0 === "demand+grid" ? "grid+demand" : bind0, why: "Inference earns more per MW, so it fills to its market cap; training fills the rest of the grid." },
    { step: "s1", q: "Step 1: what is one more MW at the fence worth, in $M per MW-year?", type: "num", ans: r1.dual.grid, tol: 0.02, why: "The grid row's shadow price in the sensitivity report." },
    { step: "s1", q: "Step 1: for how many more MW does that price hold?", type: "num", ans: inc, tol: 0.3, why: "The grid row's allowable increase. After that, Blackwell deliveries bind." },
    { step: "s1", q: "Step 1: the utility offers +40 MW. What's it worth per year, in $M? (Not 40 × the shadow price.)", type: "num", ans: r40.obj - r1.obj, tol: 1.0, why: `Re-solve with the grid at 325 MW, or add up the staircase: 15.2 MW at $3.48M, then the rest at $0.14M. Naive 40 × $3.48M = ${f.m(40 * r1.dual.grid, 0)} overstates it.` },
    { step: "s1", q: "Step 1: by how much ($M per MW-year) would the on-demand API's margin need to rise before it earns any MW?", type: "num", ans: -r1.rc.api, tol: 0.02, why: "Its reduced cost, with the sign flipped (it's a cost of entering, in a max problem)." },
    { step: "s2", q: `Step 2, defaults: what does one more MW of demand in Q2 '27 cost, in $M per MW-quarter?`, type: "num", ans: r2.dual.demand_2, tol: 0.05, why: "Nothing but spot can arrive by next quarter, so the next MW costs the spot price." },
    { step: "s4", q: "Step 4, defaults: the integrality gap, in % of the whole-site cost?", type: "num", ans: 100 * (ip4.obj - lp4.obj) / ip4.obj, tol: 0.3, why: "(MIP − LP relaxation) ÷ MIP. It's the price of indivisible sites, and the bound branch-and-bound uses to prune." },
    { step: "s6", q: "Step 6: with unlimited spot, what share of demand scenarios should your take-or-pay cover (the critical fractile, %)?", type: "num", ans: 100 * (S6.spotPrice - S6.commitPrice) / S6.spotPrice, tol: 0.5, why: "(spot − commit) / spot = (16 − 10) / 16 = 37.5%." },
    { step: "s6", q: "Step 6 with the “up to” switched on: VSS in $M per year?", type: "num", ans: met.VSS, tol: 1.0, why: "EEV − RP. The deterministic plan never reserves an option, so it can't use the flexibility that the two-stage plan prices in." },
    { step: "s7", q: "Step 7: Epoch's 2024 refit of Chinchilla, at 10²⁴ FLOPs: tokens per parameter?", type: "num", ans: epoch, tol: 0.5, why: "Closed form N* = G·(C/6)^(β/(α+β)). Hoffmann's unrounded fit says ~62; the rounded printed fit ~98." },
  ];

  let score = 0, answered = 0;
  const scoreEl = h("div", { class: "callout" }, "Answer the questions to see your score.");
  const quiz = h("div", { class: "quiz" });
  Q.forEach((it, i) => {
    const rev = h("div", { class: "reveal" });
    const done = ok => {
      answered++; if (ok) score++;
      rev.innerHTML = `<b>${ok ? "Right." : "Not quite."}</b> Answer: <span class="num">${it.type === "num" ? f.n(it.ans, 2) : it.options.find(o => o[0] === it.ans)?.[1]}</span>. ${it.why} <a href="#/${it.step}">Back to the step</a>`;
      rev.classList.add("on");
      scoreEl.className = `callout ${answered === Q.length ? (score >= 8 ? "ok" : "warn") : ""}`;
      scoreEl.innerHTML = `<b>${score} / ${answered}</b> so far${answered === Q.length ? (score >= 8 ? ": you can run the desk." : ": revisit the steps you missed, then retake.") : "."}`;
    };
    let body;
    if (it.type === "mc") {
      body = h("div", { class: "opts" }, it.options.map(([v, lab]) => h("button", { class: "opt", type: "button", onclick: e => {
        touch(e.target); [...e.target.parentNode.children].forEach(b => { b.disabled = true; });
        const ok = v === it.ans; e.target.classList.add(ok ? "right" : "wrong", "chosen"); done(ok);
      } }, lab)));
    } else {
      const inp = h("input", { type: "number", step: "any", "aria-label": `Answer to question ${i + 1}` });
      const btn = h("button", { class: "btn small", type: "button", onclick: e => {
        touch(e.target); const v = parseFloat(inp.value); if (Number.isNaN(v)) return;
        inp.disabled = true; btn.disabled = true; done(Math.abs(v - it.ans) <= it.tol);
      } }, "Check");
      inp.addEventListener("keydown", e => { if (e.key === "Enter") btn.click(); });
      body = h("div", { class: "btnrow" }, inp, btn);
    }
    quiz.append(h("div", { class: "qq" }, h("div", { style: { marginBottom: "8px" } }, h("span", { class: "muted small" }, `${i + 1}. `), it.q), body, rev));
  });
  root.append(quiz, h("div", { style: { marginTop: "16px" } }, scoreEl));
}
