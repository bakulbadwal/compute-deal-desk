"""Step 2 · The capacity ladder — a multi-period LP (build vs lease vs spot).

Seat: compute strategy at a lab, 12 quarters. Build (6-quarter lead, cheapest, 20-quarter life),
neocloud lease (2-quarter lead, 8-quarter term), spot (no lead, expensive, capped), or go short.
Mirror of s2Model() in js/models.js with tail = "ignore" (quarters past the window are not charged).
Reports: objective, the demand dual per quarter (marginal $M of one more MW needed that quarter),
and the take-or-pay floor duals.

Run:  .venv/bin/python models/s2_capacity_ladder.py [--json]
"""
from common import clean, emit, linexpr, new_model, solve

T = 12                         # quarters planned
BASE, GROWTH = 170, 0.10       # T: MW needed in Q1 '27, growth per quarter
OWNED = 120                    # T: MW already built (sunk)
LEGACY, LEGACY_ENDS = 60, 4    # T: old lease, gone after quarter 4
BUILD_LEAD, BUILD_COST, BUILD_LIFE = 6, 1.833, 20   # $M per MW-quarter
LEASE_LEAD, LEASE_COST, LEASE_TERM = 2, 2.60, 8
SPOT_COST, SPOT_CAP = 4.20, 40
SHORT_COST = 9.0               # T: lost margin per MW-quarter unserved
FLOOR, FLOOR_FROM, FLOOR_TO = 150, 3, 6   # board-signed take-or-pay: hold ≥ 150 leased MW in Q3–Q6

demand = [BASE * (1 + GROWTH) ** t for t in range(T)]


def charged_quarters(first_active, life):
    """Quarters of a commitment that fall inside the window (tail = "ignore": the rest is free)."""
    return sum(1 for q in range(first_active, first_active + life) if q <= T)


h = new_model()
build, lease, spot, short = {}, {}, {}, {}
for t in range(1, T + 1):        # same variable order as the JS builder
    if t + BUILD_LEAD <= T:
        build[t] = h.addVariable(lb=0, obj=charged_quarters(t + BUILD_LEAD, BUILD_LIFE) * BUILD_COST, name=f"build_{t}")
    if t + LEASE_LEAD <= T:
        lease[t] = h.addVariable(lb=0, obj=charged_quarters(t + LEASE_LEAD, LEASE_TERM) * LEASE_COST, name=f"lease_{t}")
    spot[t] = h.addVariable(lb=0, ub=SPOT_CAP, obj=SPOT_COST, name=f"spot_{t}")
    short[t] = h.addVariable(lb=0, obj=SHORT_COST, name=f"short_{t}")


def leases_live(t):
    return {lease[s]: 1 for s in lease if s + LEASE_LEAD <= t < s + LEASE_LEAD + LEASE_TERM}


rows = {}
for t in range(1, T + 1):
    terms = {spot[t]: 1, short[t]: 1}
    terms.update({build[s]: 1 for s in build if s + BUILD_LEAD <= t})
    terms.update(leases_live(t))
    legacy = LEGACY if t <= LEGACY_ENDS else 0
    rows[f"demand_{t}"] = h.addConstr(linexpr(h, terms) >= demand[t - 1] - OWNED - legacy, name=f"demand_{t}")
    if FLOOR_FROM <= t <= FLOOR_TO:
        rows[f"floor_{t}"] = h.addConstr(linexpr(h, leases_live(t)) >= FLOOR - legacy, name=f"floor_{t}")

obj = solve(h, "min")
sol = h.getSolution()
results = {
    "data": dict(T=T, base=BASE, growth=GROWTH, owned=OWNED, legacyLease=LEGACY, legacyEnds=LEGACY_ENDS,
                 buildLead=BUILD_LEAD, buildCost=BUILD_COST, buildLife=BUILD_LIFE, leaseLead=LEASE_LEAD,
                 leaseCost=LEASE_COST, leaseTerm=LEASE_TERM, spotCost=SPOT_COST, spotCap=SPOT_CAP,
                 shortCost=SHORT_COST, floor=FLOOR, floorFrom=FLOOR_FROM, floorTo=FLOOR_TO),
    "obj": obj,
    "demandDual": [clean(sol.row_dual[rows[f"demand_{t}"].index]) for t in range(1, T + 1)],
    # Careful: these floor rows are DEGENERATE — the LP has many optimal duals, so a different solver
    # (or HiGHS version) can report a different, equally valid split. Finite differences give the
    # one-sided prices; tests/check.mjs prints them.
    "floorDual": {k: clean(sol.row_dual[c.index]) for k, c in rows.items() if k.startswith("floor")},
    "x": {v.name: sol.col_value[v.index] for d in (build, lease, spot, short) for v in d.values()},
}


def summary(r):
    return (f"Step 2 · 12-quarter cost ${r['obj']:.1f}M (tail ignored)\n"
            "  demand duals ($M per MW-quarter): " + ", ".join(f"{d:.3f}" for d in r["demandDual"]) + "\n"
            "  floor duals (degenerate — one valid choice among many): " + ", ".join(f"{k} {v:.3f}" for k, v in r["floorDual"].items()))


emit(results, summary)
