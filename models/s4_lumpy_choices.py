"""Step 4 · Lumpy choices — binaries, logic constraints, and why rounding fails.

(a) Site portfolio: open each site or not (binary). Need ≥ 237 MW total, ≥ 66 MW live within three
    quarters, Texas campus only with its substation upgrade, one AEP queue slot (A or B), ≤ 5 sites.
    The LP relaxation opens fractions of sites; the MIP answer is what you can actually sign.
(b) Packing 12 jobs onto 72-GPU NVLink racks: the exact MIP versus first-fit-decreasing.
Mirror of s4Model(), packModel() and ffd() in js/models.js, same default data.

Run:  .venv/bin/python models/s4_lumpy_choices.py [--json]
"""
import highspy

from common import emit, linexpr, new_model, solve

# (id, MW, fixed $M, $M per MW, quarters to energize) — T
SITES = [("A", 30, 20, 1.91, 2), ("B", 25, 18, 2.24, 3), ("C", 120, 70, 1.89, 6), ("D", 0, 20, 0.00, 5),
         ("E", 60, 50, 1.72, 4), ("F", 40, 25, 2.78, 1), ("G", 80, 89, 2.01, 5), ("H", 20, 7, 2.13, 2)]
NEED, EARLY, EARLY_Q, MAX_SITES = 237, 66, 3, 5


def portfolio(integer):
    h = new_model(mip=integer)
    vt = highspy.HighsVarType.kInteger if integer else highspy.HighsVarType.kContinuous
    o = {sid: h.addVariable(lb=0, ub=1, obj=fixed + mw * per, type=vt, name=f"open_{sid}")
         for sid, mw, fixed, per, q in SITES}
    h.addConstr(linexpr(h, {o[s]: mw for s, mw, *_ in SITES if mw}) >= NEED, name="need")
    h.addConstr(linexpr(h, {o[s]: mw for s, mw, f, p, q in SITES if mw and q <= EARLY_Q}) >= EARLY, name="early")
    h.addConstr(o["C"] - o["D"] <= 0, name="CneedsD")       # C ⇒ D
    h.addConstr(o["A"] + o["B"] <= 1, name="AxorB")         # not both
    h.addConstr(h.qsum(list(o.values())) <= MAX_SITES, name="bandwidth")
    obj = solve(h, "min")
    xv = h.getSolution().col_value
    return obj, {s: xv[v.index] for s, v in o.items()}


lp_obj, lp_x = portfolio(integer=False)
mip_obj, mip_x = portfolio(integer=True)

# (b) Bin packing: GPUs per job; each job must sit inside one 72-GPU rack.
SIZES, CAP = [28, 28, 28, 28, 22, 22, 22, 22, 22, 22, 22, 22], 72


def ffd(sizes, cap):
    """First-fit decreasing: sort big-to-small, drop each job in the first rack it fits."""
    bins = []
    for s in sorted(sizes, reverse=True):
        for b in bins:
            if sum(b) + s <= cap:
                b.append(s)
                break
        else:
            bins.append([s])
    return bins


def pack_mip(sizes, cap):
    n = len(sizes)
    h = new_model(mip=True)
    node = [h.addBinary(obj=1, name=f"node_{b}") for b in range(n)]
    a = [[h.addBinary(obj=0, name=f"a_{i}_{b}") for b in range(n)] for i in range(n)]
    for i in range(n):
        h.addConstr(h.qsum(a[i]) == 1, name=f"job_{i}")
    for b in range(n):
        h.addConstr(linexpr(h, {**{a[i][b]: sizes[i] for i in range(n)}, node[b]: -cap}) <= 0, name=f"cap_{b}")
    for b in range(1, n):
        h.addConstr(node[b] - node[b - 1] <= 0, name=f"sym_{b}")   # symmetry breaking
    return solve(h, "min")


results = {
    "data": dict(need=NEED, early=EARLY, earlyQ=EARLY_Q, maxSites=MAX_SITES, pack=SIZES,
                 sites=[dict(id=s, mw=mw, fixed=f, perMW=p, q=q) for s, mw, f, p, q in SITES]),
    "lpObj": lp_obj, "lpX": lp_x,
    "mipObj": mip_obj, "mipSites": sorted(s for s, v in mip_x.items() if v > 0.5),
    "packMIP": pack_mip(SIZES, CAP),
    "packFFD": len(ffd(SIZES, CAP)),
}


def summary(r):
    frac = ", ".join(f"{s} {v:.3f}" for s, v in r["lpX"].items() if v > 1e-9)
    return (f"Step 4a · LP relaxation ${r['lpObj']:.2f}M opens {frac}\n"
            f"  MIP ${r['mipObj']:.2f}M opens {' '.join(r['mipSites'])}\n"
            f"Step 4b · racks needed: MIP {r['packMIP']:.0f}, first-fit decreasing {r['packFFD']}")


emit(results, summary)
