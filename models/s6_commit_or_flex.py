"""Step 6 · Commit or flex — two-stage stochastic LP, VSS, EVPI, and what an "up to" is worth.

Seat: compute strategy at a lab signing next year's inference capacity. Demand is uncertain:
20 equal-weight scenarios at stratified quantiles of a lognormal (mean 300 MW, CV 0.25).
First stage: commit c MW take-or-pay (and, with the option on, reserve r MW "up to").
Second stage, per scenario: exercise ≤ r at the strike, buy spot (capped), or go short.
  RP   = expected cost of the stochastic solution (the "recourse problem")
  WS   = wait-and-see: average of solving each scenario with perfect foresight
  EEV  = expected cost of planning to the mean forecast and living with it
  VSS  = EEV − RP  (value of modelling the uncertainty)    EVPI = RP − WS (value of a perfect forecast)
Mirror of s6Scenarios/s6Model/s6Metrics/s6OptionValue in js/models.js, same defaults.

Run:  .venv/bin/python models/s6_commit_or_flex.py [--json]
"""
import math

from common import INF, emit, new_model, solve

S6 = dict(mean=300, cv=0.25, n=20, commit=10.0, spot=16.0, spot_cap=80, short=30.0,
          fee=2.0, strike=10.5)   # $M per MW-yr (T)


def norm_inv(p):
    """Inverse standard normal CDF, Acklam's rational approximation — a line-for-line port of models.js."""
    a = [-3.969683028665376e1, 2.209460984245205e2, -2.759285104469687e2, 1.383577518672690e2, -3.066479806614716e1, 2.506628277459239]
    b = [-5.447609879822406e1, 1.615858368580409e2, -1.556989798598866e2, 6.680131188771972e1, -1.328068155288572e1]
    c = [-7.784894002430293e-3, -3.223964580411365e-1, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783]
    d = [7.784695709041462e-3, 3.224671290700398e-1, 2.445134137142996, 3.754408661907416]
    pl = 0.02425
    if p < pl:
        q = math.sqrt(-2 * math.log(p))
        return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1)
    if p > 1 - pl:
        q = math.sqrt(-2 * math.log(1 - p))
        return -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1)
    q = p - 0.5
    r = q * q
    return (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1)


def scenarios(p):
    s2 = math.log(1 + p["cv"] ** 2)
    mu, s = math.log(p["mean"]) - s2 / 2, math.sqrt(s2)
    return [math.exp(mu + s * norm_inv((k + 0.5) / p["n"])) for k in range(p["n"])]


def stochastic_lp(p, scen, option, fix_commit=None, fix_reserve=None):
    """Risk-neutral two-stage LP. Returns (objective, x dict, expected cost recomputed per scenario)."""
    h, N = new_model(), len(scen)
    pin = lambda v: dict(lb=v, ub=v) if v is not None else dict(lb=0, ub=INF)
    c = h.addVariable(obj=p["commit"], name="commit", **pin(fix_commit))
    r = h.addVariable(obj=p["fee"], name="reserve", **pin(fix_reserve)) if option else None
    ex, spot, short = [], [], []
    for s, d in enumerate(scen):
        if option:
            ex.append(h.addVariable(lb=0, obj=p["strike"] / N, name=f"ex_{s}"))
        spot.append(h.addVariable(lb=0, ub=p["spot_cap"], obj=p["spot"] / N, name=f"spot_{s}"))
        short.append(h.addVariable(lb=0, obj=p["short"] / N, name=f"short_{s}"))
        h.addConstr(c + spot[s] + short[s] + (ex[s] if option else 0) >= d, name=f"serve_{s}")
        if option:
            h.addConstr(ex[s] - r <= 0, name=f"exlim_{s}")
    obj = solve(h, "min")
    v = h.getSolution().col_value
    x = {"commit": v[c.index], "reserve": v[r.index] if option else 0.0}
    costs = [p["commit"] * x["commit"] + (p["fee"] * x["reserve"] + p["strike"] * v[ex[s].index] if option else 0)
             + p["spot"] * v[spot[s].index] + p["short"] * v[short[s].index] for s in range(N)]
    return obj, x, sum(costs) / N


def metrics(p, option):
    scen = scenarios(p)
    _, rp_x, RP = stochastic_lp(p, scen, option)
    WS = sum(stochastic_lp(p, [d], option)[0] for d in scen) / len(scen)
    _, ev_x, _ = stochastic_lp(p, [sum(scen) / len(scen)], option)          # plan to the mean
    _, _, EEV = stochastic_lp(p, scen, option, ev_x["commit"], ev_x["reserve"] if option else None)
    return {"RP": RP, "WS": WS, "EEV": EEV, "VSS": EEV - RP, "EVPI": RP - WS,
            "commit": rp_x["commit"], "reserve": rp_x["reserve"], "evCommit": ev_x["commit"]}


def option_value(p):
    scen = scenarios(p)
    without = stochastic_lp(p, scen, False)[0]
    with_obj, with_x, _ = stochastic_lp(p, scen, True)
    lo, hi = 0.0, p["spot"] * 2           # bisection: highest fee at which any "up to" is still reserved
    for _ in range(40):
        mid = (lo + hi) / 2
        if stochastic_lp({**p, "fee": mid}, scen, True)[1]["reserve"] > 1e-6:
            lo = mid
        else:
            hi = mid
    return {"value": without - with_obj, "reserve": with_x["reserve"], "commit": with_x["commit"], "indifferenceFee": (lo + hi) / 2}


results = {"data": dict(mean=S6["mean"], cv=S6["cv"], n=S6["n"], commitPrice=S6["commit"], spotPrice=S6["spot"],
                        spotCap=S6["spot_cap"], shortPrice=S6["short"], optionFee=S6["fee"], optionStrike=S6["strike"]),
           "scenarios": scenarios(S6), "off": metrics(S6, False), "on": metrics(S6, True), "option": option_value(S6)}


def summary(r):
    out = []
    for k in ("off", "on"):
        m = r[k]
        out.append(f"Step 6 · option {k:3s}: RP {m['RP']:.2f}  WS {m['WS']:.2f}  EEV {m['EEV']:.2f}  "
                   f"VSS {m['VSS']:.2f}  EVPI {m['EVPI']:.2f}  ($M; commit {m['commit']:.1f} MW, reserve {m['reserve']:.1f} MW)")
    o = r["option"]
    out.append(f"  the \"up to\" is worth ${o['value']:.2f}M at a $2.00 fee; indifference fee ${o['indifferenceFee']:.4f}M per MW-yr")
    return "\n".join(out)


emit(results, summary)
