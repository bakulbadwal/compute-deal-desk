"""common.py — the three things every step script does the same way.

1. new_model():  a silent HiGHS instance with the SAME options the web page uses (js/lp.js):
                 LPs run dual/primal simplex with presolve off, so the basis we read duals and
                 ranging from is the one the solver actually finished on. MIPs use HiGHS defaults.
2. solve():      set the objective sense, run, and insist the model came back optimal.
3. emit():       print a JSON dict with --json (the acceptance checker reads this),
                 otherwise a short human-readable summary.

Everything else — the data, the variables, the constraints — lives in each step's own script,
so each one reads top to bottom like a Solver worksheet.
"""
import json
import math
import sys

import highspy

INF = highspy.kHighsInf


# ── Unit economics (mirror of js/econ.js). S = sourced from the Hyperscale Ledger, T = teaching value.
RACK_KW, GPUS_PER_RACK, RACK_COST_M, LIFE_YEARS = 120, 72, 3.0, 5   # S: GB200 NVL72
PUE, POWER_PER_MWH, HOURS = 1.14, 83.4, 8760                       # S
GPUS_PER_MW = 1000 / (RACK_KW / GPUS_PER_RACK)                     # = 600


def cost_per_mw_yr(opex_m=1.5):
    """$M per MW-year of IT capacity: depreciation + power + opex (≈ 5.00 + 0.83 + 1.50)."""
    capex = GPUS_PER_MW * (RACK_COST_M / GPUS_PER_RACK)            # ≈ $25M per MW
    return capex / LIFE_YEARS + (PUE * HOURS * POWER_PER_MWH) / 1e6 + opex_m


def revenue_per_mw_yr(price, billed):
    """$M per MW-year sold at $price per GPU-hour with a billed fraction `billed`."""
    return price * HOURS * GPUS_PER_MW * billed / 1e6


def new_model(mip=False, ranging=False):
    h = highspy.Highs()
    h.silent()
    if not mip:
        h.setOptionValue("presolve", "off")   # keep the basis we rank on
        h.setOptionValue("solver", "simplex")  # duals + ranging need a simplex basis
        if ranging:
            h.setOptionValue("ranging", "on")
    return h


def solve(h, sense="max"):
    h.changeObjectiveSense(highspy.ObjSense.kMaximize if sense == "max" else highspy.ObjSense.kMinimize)
    h.run()
    status = h.getModelStatus()
    if status != highspy.HighsModelStatus.kOptimal:
        raise RuntimeError(f"HiGHS status: {h.modelStatusToString(status)}")
    return h.getObjectiveValue()


def clean(x):
    """Same rounding as js/lp.js: tiny values are zero, ±1e30 is infinity."""
    if not math.isfinite(x) or abs(x) >= 1e29:
        return "inf" if x > 0 else "-inf"
    return 0.0 if abs(x) < 1e-9 else x


def linexpr(h, terms):
    """{var: coef} -> a HiGHS linear expression."""
    return h.qsum([c * v for v, c in terms.items() if c != 0])


def emit(results, summary):
    if "--json" in sys.argv:
        print(json.dumps(results))
    else:
        print(summary(results))
