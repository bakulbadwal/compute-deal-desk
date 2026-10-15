// ui.js — small DOM + SVG toolkit shared by every step. No framework.

export function h(tag, attrs = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === null || v === undefined || v === false) continue;
    if (k === "class") el.className = v;
    else if (k === "html") el.innerHTML = v;
    else if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
    else if (k === "style" && typeof v === "object") Object.assign(el.style, v);
    else el.setAttribute(k, v === true ? "" : v);
  }
  for (const c of kids.flat(Infinity)) if (c !== null && c !== undefined && c !== false) el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  return el;
}
export const $ = (sel, root = document) => root.querySelector(sel);

const SVGNS = "http://www.w3.org/2000/svg";
export function s(tag, attrs = {}, ...kids) {
  const el = document.createElementNS(SVGNS, tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === null || v === undefined || v === false) continue;
    if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
    else el.setAttribute(k, v);
  }
  for (const c of kids.flat(Infinity)) if (c !== null && c !== undefined && c !== false) el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  return el;
}

/* ── Formatting ── */
export const f = {
  m: (x, d = 2) => (!isFinite(x) ? (x > 0 ? "∞" : "−∞") : `${x < 0 ? "−" : ""}$${Math.abs(x).toFixed(d)}M`),
  bn: (x, d = 2) => `$${(x / 1000).toFixed(d)}B`,
  money: (x) => (Math.abs(x) >= 1000 ? f.bn(x) : f.m(x, Math.abs(x) >= 100 ? 0 : 1)),
  n: (x, d = 1) => (!isFinite(x) ? (x > 0 ? "∞" : "−∞") : `${x < 0 ? "−" : ""}${Math.abs(x).toFixed(d)}`),
  mw: (x, d = 0) => (!isFinite(x) ? "∞" : `${(+x).toFixed(d)} MW`),
  pct: (x, d = 0) => `${x < 0 ? "−" : ""}${Math.abs(100 * x).toFixed(d)}%`,
  gh: (x) => `$${x.toFixed(2)}`,
  int: (x) => Math.round(x).toLocaleString("en-US"),
};

/* ── Controls ── */
export function slider({ label, min, max, step = 1, value, fmt = v => v, oninput, id }) {
  const out = h("output", {}, fmt(value));
  const inp = h("input", { type: "range", min, max, step, value, id, "aria-label": label });
  inp.addEventListener("input", () => { const v = +inp.value; out.textContent = fmt(v); oninput(v); touch(inp); });
  const wrap = h("div", { class: "slider" }, h("label", { for: id }, label), out, inp);
  wrap.set = v => { inp.value = v; out.textContent = fmt(+v); };
  return wrap;
}
export function toggle({ label, checked = false, onchange }) {
  const inp = h("input", { type: "checkbox" }); inp.checked = checked;
  inp.addEventListener("change", () => { onchange(inp.checked); touch(inp); });
  const el = h("label", { class: "toggle" }, inp, h("span", {}, label));
  el.set = v => { inp.checked = v; };
  return el;
}
export function seg({ options, value, onchange, label }) {
  const el = h("div", { class: "seg", role: "group", "aria-label": label || "" });
  const btns = options.map(([v, t]) => {
    const b = h("button", { type: "button", "aria-pressed": String(v === value) }, t);
    b.addEventListener("click", () => { btns.forEach(x => x.setAttribute("aria-pressed", "false")); b.setAttribute("aria-pressed", "true"); onchange(v); touch(b); });
    return b;
  });
  el.append(...btns);
  return el;
}

/** Anything the user moves inside a step "touches" it: unlocks the say-it-out-loud line and marks progress. */
export function touch(el) {
  const step = el.closest?.("[data-step]");
  if (!step) return;
  step.querySelectorAll(".say.locked").forEach(x => x.classList.remove("locked"));
  progress.mark(step.dataset.step);
}

/* ── Teaching blocks ── */
export function predict({ q, options, answer, explain }) {
  const rev = h("div", { class: "reveal" });
  const box = h("div", { class: "predict" }, h("h4", {}, "Predict first"), h("div", { class: "q" }, q));
  const opts = h("div", { class: "opts" });
  options.forEach((o, i) => {
    const b = h("button", { class: "opt", type: "button" }, o);
    b.addEventListener("click", () => {
      [...opts.children].forEach((x, j) => { x.disabled = true; if (j === answer) x.classList.add("right"); });
      if (i !== answer) b.classList.add("wrong");
      b.classList.add("chosen");
      rev.innerHTML = (i === answer ? "<b>Right.</b> " : "<b>Not quite.</b> ") + (typeof explain === "function" ? explain() : explain);
      rev.classList.add("on");
    });
    opts.append(b);
  });
  box.append(opts, rev);
  return box;
}
export const clicks = (title, ...body) => h("div", { class: "click" }, h("h4", {}, title || "What clicks"), ...body);
export function say(line) {
  const el = h("div", { class: "say locked" }, h("h4", {}, "Say it out loud"), h("div", { class: "line" }, line));
  return el;
}
export function beyond(items) {
  return h("div", { class: "beyond" }, items.map(([tag, title, body]) => h("div", { class: "b" }, h("div", { class: "tag" }, tag), h("h4", {}, title), h("div", { html: body }))));
}
/** The model card: formulation in words, the live LP text, the Python twin, the Excel equivalent. */
export function modelCard({ decisions, objective, constraints, py, excel, getLP }) {
  const pre = h("pre", { class: "lp" }, "");
  const d = h("details", { class: "model" },
    h("summary", {}, "Model card: the formulation, the LP the solver sees, and the code"),
    h("div", { class: "mbody" },
      h("dl", { class: "formul" }, h("dt", {}, "Decisions"), h("dd", { html: decisions }), h("dt", {}, "Objective"), h("dd", { html: objective }), h("dt", {}, "Constraints"), h("dd", { html: constraints })),
      h("div", {}, h("h4", {}, "What HiGHS solves (CPLEX LP format, live)"), pre),
      h("div", { class: "xl", html: `<b>Python twin:</b> <a href="https://github.com/bakulbadwal/compute-deal-desk/blob/main/models/${py}" target="_blank" rel="noopener"><code>models/${py}</code></a> solves the same model with <code>highspy</code>. <b>In Excel Solver:</b> ${excel}` })));
  d.addEventListener("toggle", () => { if (d.open && getLP) pre.textContent = getLP(); });
  d.refresh = () => { if (d.open && getLP) pre.textContent = getLP(); };
  return d;
}
export function readout(label, value, { cls = "", sub = "" } = {}) {
  const v = h("div", { class: "v" }, value);
  const sEl = h("div", { class: "s" }, sub);
  const el = h("div", { class: `ro ${cls}` }, h("div", { class: "l" }, label), v, sEl);
  el.set = (val, s2) => { v.textContent = val; if (s2 !== undefined) sEl.textContent = s2; };
  el.setCls = c => { el.className = `ro ${c}`; };
  return el;
}
export const tp = () => h("span", { class: "badge-tp", title: "Rests on teaching prices: per-deal compute pricing is not public" }, "at teaching prices");

/* ── Progress + price list (localStorage, fails safe) ── */
const LS = {
  get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* private mode */ } },
};
export const progress = {
  done: new Set(LS.get("cdd.done", [])),
  listeners: [],
  mark(step) { if (!this.done.has(step)) { this.done.add(step); LS.set("cdd.done", [...this.done]); this.listeners.forEach(fn => fn()); } },
};
export const ledger = {
  items: LS.get("cdd.ledger", {}),
  listeners: [],
  put(key, { what, price, note, step }) {
    this.items[key] = { what, price, note, step, at: Date.now() };
    LS.set("cdd.ledger", this.items);
    this.listeners.forEach(fn => fn(key));
  },
  clear() { this.items = {}; LS.set("cdd.ledger", {}); this.listeners.forEach(fn => fn()); },
};

/** Run an async recompute at most once per animation frame; the latest call wins. */
export function scheduler(fn) {
  let pending = false, again = false;
  const run = async () => {
    pending = true;
    do { again = false; try { await fn(); } catch (e) { console.error(e); } } while (again);
    pending = false;
  };
  return () => { if (pending) { again = true; return; } pending = true; setTimeout(run, 0); };
}

/* ── Chart primitives ── */
export function scale(d0, d1, r0, r1) { const k = (r1 - r0) / ((d1 - d0) || 1); const sc = v => r0 + (v - d0) * k; sc.inv = p => d0 + (p - r0) / k; return sc; }
export function niceTicks(lo, hi, n = 5) {
  const span = hi - lo || 1, step0 = span / n, mag = Math.pow(10, Math.floor(Math.log10(step0)));
  const step = [1, 2, 2.5, 5, 10].map(m => m * mag).find(st => span / st <= n) || 10 * mag;
  const out = []; for (let v = Math.ceil(lo / step) * step; v <= hi + 1e-9; v += step) out.push(+v.toFixed(10));
  return out;
}
/** Axes + gridlines. Returns a <g>. */
export function axes({ x, y, W, H, m, xt, yt, xfmt = v => v, yfmt = v => v, xlab, ylab }) {
  const g = s("g");
  for (const t of yt) { g.append(s("line", { class: "grid", x1: m.l, x2: W - m.r, y1: y(t), y2: y(t) }), s("text", { x: m.l - 6, y: y(t) + 4, "text-anchor": "end" }, yfmt(t))); }
  for (const t of xt) { g.append(s("text", { x: x(t), y: H - m.b + 16, "text-anchor": "middle" }, xfmt(t))); }
  g.append(s("line", { class: "ax", x1: m.l, x2: W - m.r, y1: H - m.b, y2: H - m.b }), s("line", { class: "ax", x1: m.l, x2: m.l, y1: m.t, y2: H - m.b }));
  if (xlab) g.append(s("text", { class: "lbl", x: (m.l + W - m.r) / 2, y: H - 4, "text-anchor": "middle" }, xlab));
  if (ylab) g.append(s("text", { class: "lbl", x: 12, y: m.t + (H - m.t - m.b) / 2, transform: `rotate(-90 12 ${m.t + (H - m.t - m.b) / 2})`, "text-anchor": "middle" }, ylab));
  return g;
}
/** Legend: [color, label] draws a swatch; [color, label, "line"] draws a line marker instead. */
export const legend = items => h("div", { class: "legend" }, items.map(([c, t, kind]) => h("span", {}, h("i", { class: kind === "line" ? "line" : "", style: kind === "line" ? { background: "transparent", borderTop: `2px solid ${c}` } : { background: c } }), t)));
export const css = v => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
/** Text color that reads on a filled shape: dark ink on light fills, paper on dark fills (works in both themes). */
export function onFill(color) {
  const m = /^#([0-9a-f]{6})$/i.exec(color || "");
  if (!m) return css("--sheet");
  const n = parseInt(m[1], 16), r = n >> 16, g = (n >> 8) & 255, b = n & 255;
  const lum = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  return lum > 0.6 ? "#1E2430" : "#FFFCF4";
}
export function tooltip(box) {
  const t = h("div", { class: "tip" }); box.append(t);
  return {
    show(html, xPct, yPx) { t.innerHTML = html; t.style.left = xPct; t.style.top = yPx + "px"; t.classList.add("on"); },
    hide() { t.classList.remove("on"); },
  };
}
let _clipN = 0;
/** A <g> clipped to the plot area. */
export function plotClip(svg, W, H, m) {
  const id = "clip" + (++_clipN);
  svg.append(s("clipPath", { id }, s("rect", { x: m.l, y: m.t, width: W - m.l - m.r, height: H - m.t - m.b })));
  const g = s("g", { "clip-path": `url(#${id})` });
  svg.append(g);
  return g;
}
