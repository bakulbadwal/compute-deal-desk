"""Step 1 · The price of a wall — Excel's Sensitivity Report, in code.

Same seat as step 0, full campus: six products, five physical walls, five market limits, one floor.
Mirror of s1Model() in js/models.js (no buy-the-wall offers switched on), same default data.
Reports: objective, primal x, every row dual (shadow price), reduced costs, RHS ranging for
binding rows ("Allowable Increase/Decrease") and cost ranging for every column.

Run:  .venv/bin/python models/s1_price_of_a_wall.py [--json]
"""
from common import clean, cost_per_mw_yr, emit, linexpr, new_model, revenue_per_mw_yr, solve

# ── Data: (id, $/GPU-hr, billed fraction, cooling, fabric units per MW, needs Blackwell, extra opex)
PRODUCTS = [
    ("anchor", 1.90, 1.00, "liquid", 1.0, True, 0.0),
    ("lab2",   2.15, 1.00, "liquid", 1.0, True, 0.0),
    ("ent",    2.55, 0.85, "air",    0.3, False, 0.0),
    ("api",    3.40, 0.62, "liquid", 0.3, True, 0.0),
    ("batch",  1.55, 0.92, "air",    0.5, False, 0.0),
    ("sov",    2.45, 1.00, "liquid", 0.4, True, 0.6),
]
OPEX, PUE = 1.5, 1.14
GRID_MW = 285       # S: MW at the fence (250 MW IT × PUE 1.14)
LIQUID_MW = 215     # T
AIR_MW = 95         # T
FABRIC = 205        # T: spine-port units
BLACKWELL_K = 116   # T: thousand GPUs delivered this year (≈193 MW at 0.6k GPUs per MW)
DEMAND = {"lab2": 70, "ent": 70, "api": 75, "batch": 120, "sov": 45}  # T
ANCHOR_FLOOR = 80   # T: take-or-pay floor

h = new_model(ranging=True)
cost = cost_per_mw_yr(OPEX)
x = {pid: h.addVariable(lb=0, obj=revenue_per_mw_yr(p, u) - cost - extra, name=pid)
     for pid, p, u, cool, fab, bw, extra in PRODUCTS}

walls = {
    "grid":   ({pid: PUE for pid in x}, "<=", GRID_MW),
    "liquid": ({q[0]: 1 for q in PRODUCTS if q[3] == "liquid"}, "<=", LIQUID_MW),
    "air":    ({q[0]: 1 for q in PRODUCTS if q[3] == "air"}, "<=", AIR_MW),
    "fabric": ({q[0]: q[4] for q in PRODUCTS}, "<=", FABRIC),
    "gpus":   ({q[0]: 0.6 for q in PRODUCTS if q[5]}, "<=", BLACKWELL_K),
    **{f"mkt_{pid}": ({pid: 1}, "<=", d) for pid, d in DEMAND.items()},
    "floor":  ({"anchor": 1}, ">=", ANCHOR_FLOOR),
}
rows = {}
for name, (terms, sense, rhs) in walls.items():
    e = linexpr(h, {x[v]: c for v, c in terms.items()})
    rows[name] = h.addConstr(e <= rhs if sense == "<=" else e >= rhs, name=name)

obj = solve(h, "max")
sol = h.getSolution()
_, rg = h.getRanging()
n = len(x)

act = {k: sol.row_value[c.index] for k, c in rows.items()}
binding = [k for k, (t, s, rhs) in walls.items() if abs(act[k] - rhs) <= 1e-6 * max(1, abs(rhs))]
results = {
    "data": dict(opexM=OPEX, gridMW=GRID_MW, pue=PUE, liquidMW=LIQUID_MW, airMW=AIR_MW, fabric=FABRIC,
                 blackwellK=BLACKWELL_K, demand=DEMAND, anchorFloor=ANCHOR_FLOOR,
                 products=[dict(id=q[0], p=q[1], u=q[2], cool=q[3], fabric=q[4], blackwell=q[5], extraOpex=q[6]) for q in PRODUCTS]),
    "obj": obj,
    "x": {k: clean(sol.col_value[v.index]) for k, v in x.items()},
    "dual": {k: clean(sol.row_dual[c.index]) for k, c in rows.items()},
    "rc": {k: clean(sol.col_dual[v.index]) for k, v in x.items()},
    "binding": binding,
    # RHS ranging: the wall can move between lo and hi before the shadow price changes.
    "rowRange": {k: {"lo": clean(rg.row_bound_dn.value_[rows[k].index]),
                     "hi": clean(rg.row_bound_up.value_[rows[k].index])} for k in binding},
    # Cost ranging: the margin can move between costLo and costHi before the plan changes.
    "colRange": {k: {"costLo": clean(rg.col_cost_dn.value_[v.index]),
                     "costHi": clean(rg.col_cost_up.value_[v.index])} for k, v in x.items() if v.index < n},
}


def fmt(v):
    return v if isinstance(v, str) else f"{v:.2f}"


def summary(r):
    lines = [f"Step 1 · margin ${r['obj']:.2f}M/yr", "  plan (MW): " + ", ".join(f"{k} {v:.1f}" for k, v in r["x"].items())]
    for k in r["binding"]:
        g = r["rowRange"][k]
        lines.append(f"  wall {k:9s} shadow {r['dual'][k]:+.4f}  valid for RHS in [{fmt(g['lo'])}, {fmt(g['hi'])}]")
    return "\n".join(lines)


emit(results, summary)
