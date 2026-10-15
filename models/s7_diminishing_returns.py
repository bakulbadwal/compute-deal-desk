"""Step 7 · Diminishing returns — nonlinear allocation and the Chinchilla split.

(a) Split a compute budget of 200 across four research bets with concave returns
    R_i(x) = a_i · ln(1 + x / b_i). KKT says every funded bet's marginal return a_i / (b_i + x_i)
    equals one number, λ, the shadow price of compute; unfunded bets have a_i / b_i ≤ λ.
    So x_i = max(0, a_i/λ − b_i) and we search λ until the x_i sum to the budget ("water-filling").
    This is what Excel's GRG Nonlinear engine finds; here it is closed-form plus a 1-D bisection.
(b) Chinchilla: minimize L(N, D) = E + A/N^α + B/D^β subject to 6·N·D = C (Hoffmann et al. 2022).
    Lagrange gives N* = G·(C/6)^(β/(α+β)), D* = (C/6)^(α/(α+β)) / G with G = (αA / βB)^(1/(α+β)).
Mirror of waterFill() and chinchilla() in js/models.js, same defaults.

Run:  .venv/bin/python models/s7_diminishing_returns.py [--json]
"""
import math

from common import emit

BETS = [("pre", 80, 150), ("rl", 45, 25), ("inf", 18, 10), ("agent", 30, 90)]   # (id, a, b) — T
BUDGET = 200


def water_fill(budget, bets):
    alloc = lambda lam: [max(0.0, a / lam - b) for _, a, b in bets]
    lo, hi = 1e-9, max(a / b for _, a, b in bets) + 1
    for _ in range(200):                      # same bisection as the JS, same iteration count
        mid = (lo + hi) / 2
        if sum(alloc(mid)) > budget:
            lo = mid
        else:
            hi = mid
    lam = (lo + hi) / 2
    x = alloc(lam)
    return {"lam": lam, "x": x, "value": sum(a * math.log(1 + xi / b) for (_, a, b), xi in zip(bets, x))}


FITS = {   # E, A, B, alpha, beta
    "hoff":  (1.6934, 406.4, 410.7, 0.3392, 0.2849),   # Hoffmann 2022, unrounded fitted values
    "hoffr": (1.69, 406.4, 410.7, 0.34, 0.28),         # Hoffmann 2022, as printed (rounded)
    "epoch": (1.8172, 482.01, 2085.43, 0.3478, 0.3658),  # Besiroglu et al. 2024 refit
}
C = 1e24   # training FLOPs


def chinchilla(C, E, A, B, alpha, beta):
    G = ((alpha * A) / (beta * B)) ** (1 / (alpha + beta))
    N = G * (C / 6) ** (beta / (alpha + beta))
    D = (C / 6) ** (alpha / (alpha + beta)) / G
    return {"N": N, "D": D, "L": E + A / N ** alpha + B / D ** beta, "ratio": D / N}


results = {"data": dict(bets=[dict(id=i, a=a, b=b) for i, a, b in BETS],
                        fits=[dict(id=k, E=f[0], A=f[1], B=f[2], alpha=f[3], beta=f[4]) for k, f in FITS.items()]),
           "waterFill": water_fill(BUDGET, BETS),
           "chinchilla": {k: chinchilla(C, *f) for k, f in FITS.items()}}


def summary(r):
    w = r["waterFill"]
    out = [f"Step 7a · λ = {w['lam']:.6f}; allocation " + ", ".join(f"{b[0]} {x:.2f}" for b, x in zip(BETS, w["x"]))
           + f"; value {w['value']:.3f}"]
    for k, c in r["chinchilla"].items():
        out.append(f"Step 7b · {k:5s}: N = {c['N'] / 1e9:.1f}B params, D = {c['D'] / 1e12:.2f}T tokens, "
                   f"{c['ratio']:.1f} tokens/param, loss {c['L']:.4f}")
    return "\n".join(out)


emit(results, summary)
