// app.js — shell, router, landing page, price list.
import { h, $, ledger, progress } from "./ui.js";
import { highs } from "./lp.js";
import { campusArt } from "./art.js";

export const STEPS = [
  { id: "s0", k: "0", title: "Three questions", short: "Decisions, objective, walls", session: "S1 · Intro to optimization", seat: "Neocloud campus", mod: "./steps/s0.js",
    blurb: "Split a 250 MW campus between a training lease and an inference cloud. Two products, so the whole floor plan is a picture." },
  { id: "s1", k: "1", title: "The price of a wall", short: "Shadow prices, ranges", session: "S2–S3 · Sensitivity (Buckeye Power & Light)", seat: "Neocloud campus", mod: "./steps/s1.js",
    blurb: "Six products, five physical walls. What is one more MW at the fence worth, for how many MW, and which offers to relax it should you buy?" },
  { id: "s2", k: "2", title: "The capacity ladder", short: "Multiperiod: build, lease, spot", session: "S4 · Multiperiod (DHL workforce)", seat: "Lab compute strategy", mod: "./steps/s2.js",
    blurb: "Twelve quarters, three ways to get capacity with three lead times, and a take-or-pay floor the board already signed." },
  { id: "s3", k: "3", title: "Who gets which GPUs", short: "Assignment, the free lunch, trade-offs", session: "S5, S7 · Matching + multi-objective", seat: "Lab compute strategy", mod: "./steps/s3.js",
    blurb: "Match teams to clusters. Then add one realistic capacity row and watch the free lunch end. Then trade cost against latency." },
  { id: "s4", k: "4", title: "Lumpy choices", short: "Integer programs, branch-and-bound", session: "S8–S9 · Integer + logical constraints, heuristics", seat: "Lab compute strategy", mod: "./steps/s4.js",
    blurb: "Choose a site portfolio: 20–30 MW parcels or a 120 MW campus, with either/or rules. Then pack jobs into NVLink racks." },
  { id: "s5", k: "5", title: "The bid-price desk", short: "Revenue management", session: "S10 · Markdown pricing", seat: "Neocloud revenue desk", mod: "./steps/s5.js",
    blurb: "Four weeks of spare racks, eight products, a stream of booking requests. Accept or reject each one, live." },
  { id: "s6", k: "6", title: "Commit or flex", short: "Take-or-pay vs “up to” under uncertainty", session: "S11, S13 · Uncertainty; predict → prescribe", seat: "Lab compute strategy", mod: "./steps/s6.js",
    blurb: "How much take-or-pay to sign when demand is uncertain, and what an “up to” is worth to both sides of the table." },
  { id: "s7", k: "7", title: "Diminishing returns", short: "Nonlinear: λ and Chinchilla", session: "S14 · Nonlinear + portfolio", seat: "Lab research director", mod: "./steps/s7.js",
    blurb: "Split compute across research bets with concave returns. Then solve Chinchilla as the constrained optimization it is." },
  { id: "s8", k: "8", title: "The modeler's desk", short: "AI writes the model, you own it", session: "S6, S12 · GenAI and optimization", seat: "Any seat", mod: "./steps/s8.js",
    blurb: "Four AI-written formulations of one problem. Three are quietly wrong. Run the verifier, ask what-ifs, spot the LP." },
  { id: "cap", k: "★", title: "The allocation memo", short: "Capstone", session: "Group project (40%)", seat: "Lab compute strategy", mod: "./steps/cap.js",
    blurb: "Six quarters, four contract types, five demand futures, one power cap. Build the plan, read its shadow prices, write the memo." },
  { id: "test", k: "✓", title: "Field test", short: "Ten questions", session: "Class contribution (40%)", seat: "You", mod: "./steps/test.js",
    blurb: "Ten questions you answer by operating the widgets." },
];

const main = $("#main"), tabs = $("#tabs"), wrap = $("#wrap"), side = $("#ledger");

function renderTabs(cur) {
  tabs.innerHTML = "";
  tabs.append(h("a", { class: "tab", href: "#/", "aria-current": cur === "home" ? "page" : null }, h("span", { class: "k" }, "◆"), "Start"));
  for (const st of STEPS) {
    tabs.append(h("a", { class: `tab ${progress.done.has(st.id) ? "done" : ""}`, href: `#/${st.id}`, "aria-current": cur === st.id ? "page" : null, title: st.short },
      h("span", { class: "k" }, st.k), st.title, h("span", { class: "dot", "aria-hidden": "true" })));
  }
  const on = tabs.querySelector('[aria-current="page"]');
  if (on) on.scrollIntoView({ block: "nearest", inline: "nearest" });
}
progress.listeners.push(() => renderTabs(current));

function renderLedger() {
  const items = Object.entries(ledger.items).sort((a, b) => a[1].at - b[1].at);
  $("#ledgerCount").textContent = items.length;
  side.innerHTML = "";
  side.append(h("div", { class: "card" },
    h("h3", {}, "The price list"),
    h("div", { class: "intro" }, "Every shadow price you uncover lands here, in deal language. It's the sheet you'd take into the room."),
    h("ul", {}, items.length ? items.map(([, it]) => h("li", {}, h("div", { class: "what" }, it.what), h("div", { class: "price" }, it.price), it.note ? h("div", { class: "note" }, it.note) : null))
      : h("li", { class: "empty" }, "Nothing yet. Start with step 1.")),
    h("div", { class: "foot" },
      h("button", { class: "btn small ghost", type: "button", onclick: () => window.print() }, "Print / PDF"),
      h("button", { class: "btn small ghost", type: "button", onclick: () => { if (confirm("Clear the price list?")) ledger.clear(); } }, "Clear"))));
}
ledger.listeners.push(renderLedger);

$("#ledgerBtn").addEventListener("click", () => {
  const open = side.classList.toggle("open");
  $("#ledgerBtn").setAttribute("aria-expanded", String(open));
  if (open && window.innerWidth <= 1180) side.scrollIntoView({ behavior: "smooth" });
});
$("#themeBtn").addEventListener("click", () => {
  const root = document.documentElement;
  const dark = root.dataset.theme ? root.dataset.theme === "dark" : matchMedia("(prefers-color-scheme: dark)").matches;
  root.dataset.theme = dark ? "light" : "dark";
  try { localStorage.setItem("cdd.theme", root.dataset.theme); } catch {}
  route(); // charts read colors at draw time
});

function landing() {
  const el = h("div", {});
  el.append(
    h("section", { class: "hero" },
      h("div", {},
        h("h1", { html: "What is <em>one more megawatt</em> worth to us?" }),
        h("p", { class: "lede", html: "Every AI compute deal is an allocation problem with walls: the grid connection, the halls, the GPU deliveries, the contract floors. The <b>shadow price</b> of each wall is what one more unit would be worth, and it's the number that wins negotiations. This lab teaches you to find it, trust it, and know when it stops being true." }),
        h("p", { class: "lede small muted", html: "It covers the ideas in Darden's <i>Optimization</i> elective (GBUS 8631) and goes past them, pointed at compute, power and deals. Nothing is canned: every optimum, dual and range on these pages is solved live by <a href=\"https://highs.dev\">HiGHS</a>, an open-source LP/MIP solver running in your browser." }),
        h("div", { class: "btnrow" }, h("a", { class: "btn", href: "#/s0" }, "Start with step 0 →"), h("a", { class: "btn ghost", href: "#/s1" }, "Jump to the keystone: step 1"))),
      h("div", { html: campusArt() })),
    h("div", { class: "card flat" },
      h("h3", {}, "Two seats at the table"),
      h("p", { html: "Some steps put you on the <span class=\"chip seat\">neocloud campus</span> selling capacity; others put you at a <span class=\"chip seat\">lab</span> buying it. Deal teams that understand the counterparty's shadow prices negotiate better, so you'll sit on both sides." }),
      h("div", { class: "trilogy" },
        h("div", {}, h("b", {}, "Inference Kitchen"), "Inside one GPU and one fleet: memory, batching, the scheduler. ", h("a", { href: "https://bakulbadwal.github.io/inference-kitchen/" }, "Open")),
        h("div", {}, h("b", {}, "Hyperscale Ledger"), "The campus: audited GPU specs, rack power, the 250 MW scenario this lab borrows. ", h("a", { href: "https://bakulbadwal.github.io/hyperscale-ledger/" }, "Open")),
        h("div", { class: "me" }, h("b", {}, "Compute Deal Desk"), "The allocation: who gets capacity, on which contract, at what price, and what a wall is worth."))),
    h("h2", { style: { marginTop: "26px" } }, "The ten stops"),
    h("div", { class: "map" }, STEPS.map(st => h("a", { href: `#/${st.id}` },
      h("div", { class: "k" }, `STEP ${st.k} · ${st.seat.toUpperCase()}`), h("b", {}, st.title), h("span", {}, st.blurb), h("div", { class: "sess" }, "Course: " + st.session)))),
    h("div", { class: "card flat", style: { marginTop: "22px" } },
      h("h3", {}, "Honest about models"),
      h("p", { html: "<b>Exact:</b> every optimum, shadow price, reduced cost, allowable range, MIP gap and stochastic-programming metric is computed at run time by HiGHS 1.15 (WebAssembly), and a <a href=\"https://github.com/bakulbadwal/compute-deal-desk/tree/main/models\">Python twin</a> re-solves each model with <code>highspy</code> in CI-style checks. <b>Sourced:</b> rack power, rack cost, GPU life, PUE, power price and the 250 MW campus come from the <a href=\"https://bakulbadwal.github.io/hyperscale-ledger/\">Hyperscale Ledger</a>; contract shapes come from public deal reporting. <b>Teaching values:</b> every $/GPU-hour price, margin and demand curve. Per-deal compute pricing isn't public, so any dollar shadow price carries an <span class=\"badge-tp\">at teaching prices</span> tag. Quote the ratios and the mechanics, not the dollars." }))
  );
  return el;
}

let current = null;
const cache = new Map();
async function route() {
  const m = location.hash.match(/^#\/(\w+)/);
  const id = m && STEPS.some(s => s.id === m[1]) ? m[1] : "home";
  current = id;
  renderTabs(id);
  main.innerHTML = "";
  wrap.classList.toggle("full", id === "home");
  side.hidden = id === "home";
  if (id === "home") { main.append(landing()); document.title = "Compute Deal Desk"; window.scrollTo(0, 0); return; }
  const st = STEPS.find(s => s.id === id);
  document.title = `${st.k} · ${st.title} — Compute Deal Desk`;
  const sec = h("section", { "data-step": id });
  main.append(sec);
  window.scrollTo(0, 0);
  sec.append(h("div", { class: "loading" }, "Solving…"));
  try {
    await highs();
    let mod = cache.get(st.mod);
    if (!mod) { mod = await import(st.mod); cache.set(st.mod, mod); }
    sec.innerHTML = "";
    const i = STEPS.indexOf(st);
    sec.append(h("header", { class: "step-head" },
      h("div", { class: "chips" }, h("span", { class: "chip" }, `Step ${st.k}`), h("span", { class: "chip seat" }, "Seat: " + st.seat), h("span", { class: "chip course" }, "Course: " + st.session)),
      h("h2", {}, st.title)));
    await mod.render(sec, { step: st });
    sec.append(h("nav", { class: "stepnav", "aria-label": "Step navigation" },
      i > 0 ? h("a", { class: "btn ghost", href: `#/${STEPS[i - 1].id}` }, `← ${STEPS[i - 1].title}`) : h("a", { class: "btn ghost", href: "#/" }, "← Start"),
      i < STEPS.length - 1 ? h("a", { class: "btn", href: `#/${STEPS[i + 1].id}` }, `${STEPS[i + 1].title} →`) : h("span")));
  } catch (e) {
    console.error(e);
    sec.innerHTML = "";
    sec.append(h("div", { class: "callout warn" }, "Something went wrong loading this step: " + e.message + ". If you opened the file directly, serve the folder over http (see the README)."));
  }
}
window.addEventListener("hashchange", route);
window.addEventListener("load", () => window.scrollTo(0, 0));
renderLedger();
route();
