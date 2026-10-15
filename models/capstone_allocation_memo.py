"""Capstone · The allocation memo — six quarters, five demand paths, four contract types, a CVaR knob.

Seat: compute strategy at a mid-size lab. Decide the contracts NOW (first stage), then each demand
path reveals itself and you serve it from the campus, spot, the option, or go short (second stage).
  hyp  hyperscaler reserved, all 6 quarters        neo  neocloud take-or-pay, from Q3
  opt  "up to" reserved from Q2 (fee + strike)     upg  campus power upgrade, +MW from Q4 (≤ 40)
Objective: (1 − λ)·E[cost] + λ·CVaR_90%[cost]  (Rockafellar–Uryasev: η + E[(cost − η)+] / (1 − α)).
λ = 0 is risk-neutral; raising λ buys insurance against the Breakout path.
Mirror of capModel()/capScore() in js/models.js, same defaults. Reports λ = 0, 0.2, 0.6.

Run:  .venv/bin/python models/capstone_allocation_memo.py [--json]
"""
from common import INF, emit, linexpr, new_model, solve

T = 6
INFER_BASE, INFER_GROWTH = 190, 0.12                                        # T
SCEN = [("bust", 0.65, 0.10), ("slow", 0.85, 0.20), ("base", 1.00, 0.40),   # (id, multiplier by Q6, prob)
        ("hot", 1.25, 0.20), ("boom", 1.60, 0.10)]
TRAIN = [0, 0, 160, 160, 0, 0]          # MW for the pretraining run, Q3–Q4
OWN_CAP = 150                           # MW the campus can power (sunk, costs nothing extra to use)
UPG_MAX, UPG_FROM, UPG_PRICE = 40, 4, 4.5
HYP_PRICE = 2.75                        # $M per MW-quarter, all six quarters
NEO_PRICE, NEO_FROM = 2.40, 3
OPT_FEE, OPT_STRIKE, OPT_FROM = 0.45, 2.90, 2
SPOT_PRICE, SPOT_CAP, SHORT_PRICE = 4.20, 50, 9.0
ALPHA = 0.9

DEMAND = [[INFER_BASE * (1 + INFER_GROWTH) ** t * mult ** ((t + 1) / T) for t in range(T)] for _, mult, _ in SCEN]
# First-stage cost per MW for the whole period, and which quarters each contract is live
FIRST = {"hyp": (HYP_PRICE * T, lambda t: True, INF),
         "neo": (NEO_PRICE * (T - NEO_FROM + 1), lambda t: t >= NEO_FROM, INF),
         "opt": (OPT_FEE * (T - OPT_FROM + 1), lambda t: t >= OPT_FROM, INF),
         "upg": (UPG_PRICE, lambda t: t >= UPG_FROM, UPG_MAX)}


def solve_memo(lam):
    h = new_model()
    f = {k: h.addVariable(lb=0, ub=ub, obj=(1 - lam) * cost, name=k) for k, (cost, on, ub) in FIRST.items()}
    eta = h.addVariable(lb=-INF, obj=lam, name="eta") if lam > 0 else None   # VaR threshold
    second = []   # (scenario, quarter, spot, short, ex)
    for s, (sid, mult, w) in enumerate(SCEN):
        cost_terms = {f[k]: -FIRST[k][0] for k in f}       # scenario cost, negated, for the tail row
        for t in range(1, T + 1):
            own = h.addVariable(lb=0, obj=0, name=f"own_{s}_{t}")
            spot = h.addVariable(lb=0, ub=SPOT_CAP, obj=(1 - lam) * w * SPOT_PRICE, name=f"spot_{s}_{t}")
            short = h.addVariable(lb=0, ub=DEMAND[s][t - 1], obj=(1 - lam) * w * SHORT_PRICE, name=f"short_{s}_{t}")
            cost_terms[spot], cost_terms[short] = -SPOT_PRICE, -SHORT_PRICE
            serve = {own: 1, f["hyp"]: 1, spot: 1, short: 1}
            if FIRST["neo"][1](t):
                serve[f["neo"]] = 1
            ex = None
            if FIRST["opt"][1](t):
                ex = h.addVariable(lb=0, obj=(1 - lam) * w * OPT_STRIKE, name=f"ex_{s}_{t}")
                serve[ex], cost_terms[ex] = 1, -OPT_STRIKE
                h.addConstr(ex - f["opt"] <= 0, name=f"exlim_{s}_{t}")
            h.addConstr(linexpr(h, serve) >= DEMAND[s][t - 1] + TRAIN[t - 1], name=f"serve_{s}_{t}")
            power = {own: 1, f["upg"]: -1} if FIRST["upg"][1](t) else {own: 1}
            h.addConstr(linexpr(h, power) <= OWN_CAP, name=f"power_{s}_{t}")
            second.append((s, spot, short, ex))
        if lam > 0:   # z_s ≥ cost_s − η
            z = h.addVariable(lb=0, obj=lam * w / (1 - ALPHA), name=f"z_{s}")
            h.addConstr(linexpr(h, {z: 1, eta: 1, **cost_terms}) >= 0, name=f"tail_{s}")
    solve(h, "min")
    v = h.getSolution().col_value
    x = {k: v[var.index] for k, var in f.items()}
    # Score the plan in true dollars, per demand path
    fixed = sum(FIRST[k][0] * x[k] for k in x)
    per = [fixed] * len(SCEN)
    for s, spot, short, ex in second:
        per[s] += SPOT_PRICE * v[spot.index] + SHORT_PRICE * v[short.index] + (OPT_STRIKE * v[ex.index] if ex else 0)
    return {**x, "expected": sum(w * c for (_, _, w), c in zip(SCEN, per)), "worst": max(per),
            "perScenario": dict(zip([s[0] for s in SCEN], per))}


results = {str(lam): solve_memo(lam) for lam in (0, 0.2, 0.6)}
results["data"] = dict(T=T, inferBase=INFER_BASE, inferGrowth=INFER_GROWTH, train=TRAIN, ownCap=OWN_CAP,
                       upgradeMax=UPG_MAX, upgradeFrom=UPG_FROM, upgradePrice=UPG_PRICE, hypPrice=HYP_PRICE,
                       neoPrice=NEO_PRICE, neoFrom=NEO_FROM, optFee=OPT_FEE, optStrike=OPT_STRIKE, optFrom=OPT_FROM,
                       spotPrice=SPOT_PRICE, spotCap=SPOT_CAP, shortPrice=SHORT_PRICE, alpha=ALPHA,
                       scen=[dict(id=i, mult=m, prob=p) for i, m, p in SCEN])


def summary(r):
    out = ["Capstone · first-stage MW and cost ($M) by risk weight λ"]
    for lam, m in ((k, v) for k, v in r.items() if k != "data"):
        out.append(f"  λ={lam:3s}: hyp {m['hyp']:6.1f}  neo {m['neo']:6.1f}  opt {m['opt']:6.1f}  upg {m['upg']:4.1f}  "
                   f"E[cost] {m['expected']:8.1f}  worst path {m['worst']:8.1f}")
    return "\n".join(out)


emit(results, summary)
