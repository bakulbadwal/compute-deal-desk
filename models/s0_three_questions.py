"""Step 0 · Three questions — what can I choose, what am I after, what stops me?

Seat: you run a 250 MW neocloud campus with two products.
  T = MW leased to a lab for training (reserved, billed 100%)
  I = MW sold as inference cloud (billed at its utilization)
Mirror of s0Model() in js/models.js, same default data.

Run:  .venv/bin/python models/s0_three_questions.py [--json]
"""
from common import (GPUS_PER_RACK, LIFE_YEARS, POWER_PER_MWH, PUE, RACK_COST_M, RACK_KW, cost_per_mw_yr, emit,
                    new_model, revenue_per_mw_yr, solve)

# ── Data (T = teaching value, S = sourced)
P_TRAIN, U_TRAIN = 1.90, 1.00   # T: $/GPU-hr, billed fraction
P_INFER, U_INFER = 3.40, 0.62   # T
OPEX = 1.5                      # T: $M per MW-yr
GRID = 250                      # S: IT MW the grid connection supports
INFER_DEMAND = 140              # T: MW of inference the market will buy
FABRIC = 220                    # T: spine-port units (training 1.0/MW, inference 0.4/MW)
ANCHOR = 60                     # T: MW promised to the anchor lab (take-or-pay floor)
HALLS = 400                     # physical cap on hall shells; never binds, keeps the region finite

# Margin per MW-year = revenue − (depreciation + power + opex)
cost = cost_per_mw_yr(OPEX)
margin_T = revenue_per_mw_yr(P_TRAIN, U_TRAIN) - cost
margin_I = revenue_per_mw_yr(P_INFER, U_INFER) - cost

h = new_model()
# Q1: what can I choose?  ("By Changing Variable Cells")
T = h.addVariable(lb=0, obj=margin_T, name="T")
I = h.addVariable(lb=0, obj=margin_I, name="I")
# Q3: what stops me?      ("Subject to the Constraints")
rows = {
    "grid":   h.addConstr(T + I <= GRID, name="grid"),
    "demand": h.addConstr(I <= INFER_DEMAND, name="demand"),
    "fabric": h.addConstr(T + 0.4 * I <= FABRIC, name="fabric"),
    "anchor": h.addConstr(T >= ANCHOR, name="anchor"),
    "halls":  h.addConstr(T + I <= HALLS, name="halls"),
}
# Q2: what am I after?    ("Set Objective" → Max)
obj = solve(h, "max")

sol = h.getSolution()
results = {
    # The defaults this script used, in models.js names (the checker diffs them against S0).
    "data": dict(pTrain=P_TRAIN, uTrain=U_TRAIN, pInfer=P_INFER, uInfer=U_INFER, opexM=OPEX, grid=GRID,
                 inferDemand=INFER_DEMAND, fabric=FABRIC, anchor=ANCHOR,
                 ledger=dict(rackKW=RACK_KW, gpusPerRack=GPUS_PER_RACK, rackCostM=RACK_COST_M, lifeYears=LIFE_YEARS,
                             pue=PUE, powerPerMWh=POWER_PER_MWH)),
    "obj": obj,
    "margin": {"T": margin_T, "I": margin_I, "cost": cost},
    "x": {"T": sol.col_value[0], "I": sol.col_value[1]},
    # Shadow price of each wall: $M of margin per extra MW of that wall.
    "dual": {k: sol.row_dual[c.index] for k, c in rows.items()},
}


def summary(r):
    d = r["dual"]
    return (f"Step 0 · margin ${r['obj']:.2f}M/yr with T = {r['x']['T']:.1f} MW, I = {r['x']['I']:.1f} MW\n"
            f"  shadow prices ($M per MW-yr): grid {d['grid']:.4f}, demand {d['demand']:.4f}, "
            f"fabric {d['fabric']:.4f}, anchor {d['anchor']:.4f}")


emit(results, summary)
