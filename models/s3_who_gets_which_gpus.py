"""Step 3 · Who gets which GPUs — assignment and generalized assignment.

(a) Six teams onto six clusters, one each. Solved as a plain LP: the assignment polytope has
    integer corners (the constraint matrix is totally unimodular), so the LP answer is already 0/1.
(b) Eight sized jobs onto four capacity-limited pools (generalized assignment). Now the LP
    relaxation splits jobs across pools; the MIP pays a little more for whole placements.
Mirror of s3AssignModel() and s3GapModel() in js/models.js, same default data.

Run:  .venv/bin/python models/s3_who_gets_which_gpus.py [--json]
"""
import highspy

from common import emit, linexpr, new_model, solve

# (a) $M per quarter for team i on cluster j (T)
COST = [
    [9.0, 14.5, 11.0, 12.5, 10.5, 15.0],
    [7.5, 8.0, 9.5, 9.0, 7.0, 10.5],
    [4.0, 3.0, 4.5, 3.5, 3.5, 4.0],
    [6.0, 5.5, 7.5, 6.5, 5.0, 6.5],
    [5.5, 4.5, 6.5, 6.0, 5.5, 4.0],
    [6.5, 5.0, 5.5, 4.5, 6.0, 5.5],
]
n = len(COST)
h = new_model()
x = [[h.addVariable(lb=0, ub=1, obj=COST[i][j], name=f"x_{i}_{j}") for j in range(n)] for i in range(n)]
for i in range(n):
    h.addConstr(h.qsum(x[i]) == 1, name=f"team_{i}")
for j in range(n):
    h.addConstr(h.qsum([x[i][j] for i in range(n)]) == 1, name=f"cl_{j}")
assign_obj = solve(h, "min")
xv = h.getSolution().col_value
assign_integral = all(min(abs(v), abs(v - 1)) < 1e-9 for v in xv)
pairs = [(i, j) for i in range(n) for j in range(n) if xv[x[i][j].index] > 0.5]

# (b) Generalized assignment: job sizes (MW) and pool capacities (MW), $M/quarter per MW, fit multipliers (T)
JOBS = [("pre", 60), ("rl", 34), ("eval", 12), ("code", 26), ("voice", 18), ("api", 30), ("synth", 22), ("ft", 15)]
POOLS = [("own", 90, 0.46), ("hyp", 80, 0.80), ("neo", 60, 0.55), ("eu", 40, 0.70)]
FIT = {"pre": [1.0, 1.15, 1.05, 1.3], "rl": [1.0, 1.05, 1.0, 1.2], "eval": [1.1, 1.0, 1.0, 1.0],
       "code": [1.0, 1.0, 1.0, 1.1], "voice": [1.0, 1.05, 1.0, 1.1], "api": [1.0, 1.0, 1.0, 0.95],
       "synth": [1.0, 1.1, 0.95, 1.05], "ft": [1.05, 1.0, 1.0, 1.0]}


def gap(integer):
    g = new_model(mip=integer)
    vt = highspy.HighsVarType.kInteger if integer else highspy.HighsVarType.kContinuous
    y = [[g.addVariable(lb=0, ub=1, obj=mw * per * FIT[jid][j], type=vt, name=f"y_{i}_{j}")
          for j, (_, cap, per) in enumerate(POOLS)] for i, (jid, mw) in enumerate(JOBS)]
    for i in range(len(JOBS)):
        g.addConstr(g.qsum(y[i]) == 1, name=f"job_{i}")
    for j, (_, cap, _) in enumerate(POOLS):
        g.addConstr(linexpr(g, {y[i][j]: mw for i, (_, mw) in enumerate(JOBS)}) <= cap, name=f"cap_{j}")
    return solve(g, "min")


results = {
    "data": dict(cost=COST, jobMW=[mw for _, mw in JOBS], poolCap=[c for _, c, _ in POOLS],
                 gapCost=[[mw * per * FIT[jid][j] for j, (_, _, per) in enumerate(POOLS)] for jid, mw in JOBS]),
    "assignObj": assign_obj,
    "assignIntegral": assign_integral,
    "assignment": pairs,
    "gapLP": gap(integer=False),
    "gapMIP": gap(integer=True),
}


def summary(r):
    return (f"Step 3a · assignment LP cost ${r['assignObj']:.2f}M/qtr, integral without asking: {r['assignIntegral']}\n"
            f"  team→cluster: {r['assignment']}\n"
            f"Step 3b · GAP LP relaxation ${r['gapLP']:.3f}M, MIP ${r['gapMIP']:.3f}M "
            f"(integrality costs ${r['gapMIP'] - r['gapLP']:.3f}M)")


emit(results, summary)
