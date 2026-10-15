// lp.js — a tiny modeling layer over HiGHS (highs-js, WebAssembly).
// Works in the browser and in Node. Every number the page shows comes from solve().
//
//   const m = new Model("campus", "max");
//   m.addVar("train", { cost: 2.65, lb: 0 });
//   m.addRow("grid", { train: 1.14, infer: 1.14 }, { ub: 285 });
//   const r = await m.solve({ ranging: true });
//   r.x.train, r.dual.grid, r.range.rows.grid.hi, r.lp  (the model as CPLEX LP text)

let _highs = null;
let _loader = null;

/** Register the HiGHS loader (browser: import from ./vendor/highs.mjs; Node: same file). */
export function setLoader(fn) { _loader = fn; }

export async function highs() {
  if (_highs) return _highs;
  if (!_loader) {
    const mod = await import("./vendor/highs.mjs");
    _loader = mod.default;
  }
  _highs = await _loader({});
  return _highs;
}

const INF = Infinity;

export class Model {
  constructor(name = "model", sense = "max") {
    this.name = name;
    this.sense = sense;
    this.vars = [];      // {name, cost, lb, ub, int, label}
    this.rows = [];      // {name, terms:{var:coef}, lb, ub, label}
    this._vi = new Map();
    this._ri = new Map();
  }
  addVar(name, { cost = 0, lb = 0, ub = INF, int = false, label = name } = {}) {
    if (this._vi.has(name)) throw new Error(`duplicate var ${name}`);
    this._vi.set(name, this.vars.length);
    this.vars.push({ name, cost, lb, ub, int, label });
    return name;
  }
  addRow(name, terms, { lb = -INF, ub = INF, label = name } = {}) {
    if (this._ri.has(name)) throw new Error(`duplicate row ${name}`);
    for (const v of Object.keys(terms)) if (!this._vi.has(v)) throw new Error(`row ${name}: unknown var ${v}`);
    this._ri.set(name, this.rows.length);
    this.rows.push({ name, terms, lb, ub, label });
    return name;
  }
  setCost(name, cost) { this.vars[this._vi.get(name)].cost = cost; }
  setBounds(name, lb, ub) { const v = this.vars[this._vi.get(name)]; v.lb = lb; v.ub = ub; }
  setRow(name, { lb, ub }) { const r = this.rows[this._ri.get(name)]; if (lb !== undefined) r.lb = lb; if (ub !== undefined) r.ub = ub; }
  hasInt() { return this.vars.some(v => v.int); }

  /** Human-readable CPLEX-LP text of the model (shown in every model card). */
  toLP() {
    const f = n => (Number.isInteger(n) ? String(n) : (+n.toPrecision(6)).toString());
    const term = (c, v, first) => {
      const s = c < 0 ? "- " : (first ? "" : "+ ");
      const a = Math.abs(c);
      return `${s}${a === 1 ? "" : f(a) + " "}${v}`;
    };
    const lin = terms => {
      const parts = Object.entries(terms).filter(([, c]) => c !== 0);
      if (!parts.length) return "0";
      return parts.map(([v, c], i) => term(c, v, i === 0)).join(" ");
    };
    const obj = {}; for (const v of this.vars) if (v.cost) obj[v.name] = v.cost;
    let s = `${this.sense === "max" ? "Maximize" : "Minimize"}\n obj: ${lin(obj)}\nSubject To\n`;
    for (const r of this.rows) {
      const L = lin(r.terms);
      if (r.lb === r.ub) s += ` ${r.name}: ${L} = ${f(r.ub)}\n`;
      else {
        if (r.ub < INF) s += ` ${r.name}: ${L} <= ${f(r.ub)}\n`;
        if (r.lb > -INF) s += ` ${r.name}${r.ub < INF ? "_lo" : ""}: ${L} >= ${f(r.lb)}\n`;
      }
    }
    const b = this.vars.filter(v => v.lb !== 0 || v.ub !== INF);
    if (b.length) {
      s += "Bounds\n";
      for (const v of b) {
        if (v.lb === -INF && v.ub === INF) s += ` ${v.name} free\n`;
        else if (v.ub === INF) s += ` ${v.name} >= ${f(v.lb)}\n`;
        else s += ` ${f(v.lb === -INF ? -1e30 : v.lb)} <= ${v.name} <= ${f(v.ub)}\n`;
      }
    }
    const ints = this.vars.filter(v => v.int);
    if (ints.length) {
      const bin = ints.filter(v => v.lb === 0 && v.ub === 1), gen = ints.filter(v => !(v.lb === 0 && v.ub === 1));
      if (bin.length) s += "Binary\n " + bin.map(v => v.name).join(" ") + "\n";
      if (gen.length) s += "General\n " + gen.map(v => v.name).join(" ") + "\n";
    }
    return s + "End\n";
  }

  /** The model as HiGHS ModelData (CSR). */
  toModelData(h, { relax = false } = {}) {
    const n = this.vars.length, m = this.rows.length;
    const starts = [0], indices = [], values = [];
    for (const r of this.rows) {
      const ent = Object.entries(r.terms).map(([v, c]) => [this._vi.get(v), c]).filter(([, c]) => c !== 0).sort((a, b) => a[0] - b[0]);
      for (const [j, c] of ent) { indices.push(j); values.push(c); }
      starts.push(indices.length);
    }
    const data = {
      numCols: n, numRows: m,
      sense: this.sense === "max" ? h.constants.objectiveSense.maximize : h.constants.objectiveSense.minimize,
      colCost: this.vars.map(v => v.cost),
      colLower: this.vars.map(v => (v.lb === -INF ? -h.infinity : v.lb)),
      colUpper: this.vars.map(v => (v.ub === INF ? h.infinity : v.ub)),
      rowLower: this.rows.map(r => (r.lb === -INF ? -h.infinity : r.lb)),
      rowUpper: this.rows.map(r => (r.ub === INF ? h.infinity : r.ub)),
      matrix: { format: "csr", numRows: m, numCols: n, starts, indices, values },
      colNames: this.vars.map(v => v.name),
      rowNames: this.rows.map(r => r.name),
    };
    if (!relax && this.hasInt()) data.integrality = this.vars.map(v => (v.int ? 1 : 0));
    return data;
  }

  /**
   * Solve. Options:
   *   ranging: compute sensitivity ranges (LP only; forces primal-dual simplex, presolve off)
   *   relax:   drop integrality (LP relaxation)
   *   overrides: {var: {lb, ub}} temporary bound changes (used by our own branch-and-bound)
   */
  async solve({ ranging = false, relax = false, overrides = null, timeLimit = 10 } = {}) {
    const h = await highs();
    const data = this.toModelData(h, { relax });
    if (overrides) {
      data.colLower = data.colLower.slice(); data.colUpper = data.colUpper.slice();
      for (const [v, b] of Object.entries(overrides)) {
        const j = this._vi.get(v);
        if (b.lb !== undefined) data.colLower[j] = b.lb;
        if (b.ub !== undefined) data.colUpper[j] = b.ub;
      }
    }
    const isMip = !!data.integrality;
    const model = h.createModel();
    try {
      model.options.output_flag = false;
      model.options.time_limit = timeLimit;
      if (!isMip) {
        model.options.presolve = "off";           // keep the basis we rank on
        model.options.solver = "simplex";         // ranging needs a simplex basis
      }
      if (ranging && !isMip) model.options.ranging = "on";
      model.passModel(data);
      model.run();
      const code = model.getModelStatus();
      const S = h.constants.modelStatus;
      const status = code === S.optimal ? "optimal" : code === S.infeasible ? "infeasible"
        : (code === S.unbounded || code === S.unboundedOrInfeasible) ? "unbounded"
        : code === S.timeLimit ? "timeLimit" : "other";
      const out = { status, lp: this.toLP(), isMip, model: this };
      if (status !== "optimal" && !(isMip && status === "timeLimit")) return out;
      const sol = model.getSolution();
      out.obj = model.getObjectiveValue();
      out.x = {}; out.act = {};
      this.vars.forEach((v, j) => { out.x[v.name] = clean(sol.colValue[j]); });
      this.rows.forEach((r, i) => { out.act[r.name] = clean(sol.rowValue[i]); });
      if (!isMip) {
        out.dual = {}; out.rc = {};
        this.rows.forEach((r, i) => { out.dual[r.name] = clean(sol.rowDual[i]); });
        this.vars.forEach((v, j) => { out.rc[v.name] = clean(sol.colDual[j]); });
        if (ranging) {
          const g = model.getRanging();
          out.range = { rows: {}, cols: {} };
          this.rows.forEach((r, i) => {
            out.range.rows[r.name] = {
              lo: big(g.rowBoundDown.value[i]), hi: big(g.rowBoundUp.value[i]),
              objLo: big(g.rowBoundDown.objective[i]), objHi: big(g.rowBoundUp.objective[i]),
            };
          });
          this.vars.forEach((v, j) => {
            out.range.cols[v.name] = {
              costLo: big(g.colCostDown.value[j]), costHi: big(g.colCostUp.value[j]),
              boundLo: big(g.colBoundDown.value[j]), boundHi: big(g.colBoundUp.value[j]),
            };
          });
        }
      } else {
        out.gap = model.info?.mip_gap ?? 0;
      }
      return out;
    } finally {
      model.dispose();
    }
  }
}

function clean(x) { return Math.abs(x) < 1e-9 ? 0 : x; }
function big(x) { return !isFinite(x) || Math.abs(x) >= 1e29 ? (x > 0 ? INF : -INF) : clean(x); }

/** Binding test used everywhere: a row is "pressed against a wall" if its activity sits on a finite bound. */
export function isBinding(row, act, tol = 1e-6) {
  return (row.ub < INF && Math.abs(act - row.ub) <= tol * Math.max(1, Math.abs(row.ub))) ||
         (row.lb > -INF && Math.abs(act - row.lb) <= tol * Math.max(1, Math.abs(row.lb)));
}

/**
 * Finite-difference check of a dual: re-solve with the row's binding side moved by ±delta.
 * Returns {up, down}: objective change per unit in each direction. Equal ⇒ the dual is unique there.
 */
export async function fdDual(model, rowName, delta = 1e-3) {
  const r = model.rows[model._ri.get(rowName)];
  const base = (await model.solve()).obj;
  const side = r.ub < INF ? "ub" : "lb";
  const orig = r[side];
  r[side] = orig + delta; const up = (await model.solve()).obj;
  r[side] = orig - delta; const down = (await model.solve()).obj;
  r[side] = orig;
  return { up: (up - base) / delta, down: (base - down) / delta };
}
