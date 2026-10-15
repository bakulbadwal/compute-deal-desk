"""Step 5 · The bid-price desk — network revenue management with a deterministic LP (DLP).

Seat: revenue desk at a neocloud. Four weeks of spare racks (40 per week), eight products that use
one or more weeks. Fares in $k per rack-week. Sell up to mean demand of each product so total racks
per week fit. The dual of each week's capacity row is that week's BID PRICE: accept a request only
if its fare covers the sum of bid prices of the weeks it uses.
Mirror of s5Model() in js/models.js, same default data.

Run:  .venv/bin/python models/s5_bid_price_desk.py [--json]
"""
from common import emit, linexpr, new_model, solve

CAPACITY = [40, 40, 40, 40]
# (id, weeks used, fare $k, mean requests) — T
PRODUCTS = [
    ("od1", [0], 36, 18), ("od2", [1], 36, 20), ("od3", [2], 36, 24), ("od4", [3], 36, 26),
    ("ft12", [0, 1], 58, 12), ("ft34", [2, 3], 58, 14),
    ("res", [0, 1, 2, 3], 100, 16),
    ("bat", [3], 18, 30),
]

h = new_model()
x = {pid: h.addVariable(lb=0, ub=mean, obj=fare, name=pid) for pid, weeks, fare, mean in PRODUCTS}
weeks = [h.addConstr(linexpr(h, {x[pid]: 1 for pid, wk, f, m in PRODUCTS if w in wk}) <= CAPACITY[w], name=f"week_{w + 1}")
         for w in range(len(CAPACITY))]
obj = solve(h, "max")
sol = h.getSolution()
bid = [sol.row_dual[c.index] for c in weeks]

results = {
    "data": dict(capacity=CAPACITY, products=[dict(id=i, weeks=w, fare=f, mean=m) for i, w, f, m in PRODUCTS]),
    "obj": obj,
    "bidPrice": bid,
    "x": {pid: sol.col_value[v.index] for pid, v in x.items()},
    # The accept rule each product faces: fare vs the sum of its weeks' bid prices.
    "hurdle": {pid: sum(bid[w] for w in wk) for pid, wk, f, m in PRODUCTS},
}


def summary(r):
    rows = "\n".join(f"  {pid:5s} fare {fare:4d}  hurdle {r['hurdle'][pid]:5.1f}  "
                     f"{'accept' if fare >= r['hurdle'][pid] - 1e-9 else 'reject'}" for pid, wk, fare, m in PRODUCTS)
    return (f"Step 5 · DLP revenue ${r['obj']:.0f}k; bid prices by week ($k/rack): "
            + ", ".join(f"{b:.1f}" for b in r["bidPrice"]) + "\n" + rows)


emit(results, summary)
