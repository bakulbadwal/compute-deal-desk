# The Python track: the course in code instead of Excel

Each step of Compute Deal Desk solves its model in your browser with HiGHS compiled to WebAssembly
(`js/models.js`). This folder has the **same models with the same default data**, written as short,
readable Python scripts that call the native HiGHS solver through `highspy`. Read one top to bottom
and you have the whole formulation: data, decision variables, objective, constraints, solve, report.

The acceptance checker (`tests/check.mjs`) runs every script and requires each number it shares
with the web page to agree to 1e-6 relative. It also checks that every script's hard-coded data
still equals the current `js/models.js` defaults.

## Run it

```bash
python3 -m venv .venv && .venv/bin/pip install -r models/requirements.txt   # once
.venv/bin/python models/s1_price_of_a_wall.py           # human-readable summary
.venv/bin/python models/s1_price_of_a_wall.py --json    # every number, as JSON
make py      # run all nine scripts
make check   # the acceptance checker: JS vs Python, finite-difference duals, null cases, simulation
```

| Script | Step | What it solves |
|---|---|---|
| `s0_three_questions.py` | 0 | Two-product campus LP: choices, objective, walls, shadow prices |
| `s1_price_of_a_wall.py` | 1 | Six-product campus LP with the full Sensitivity Report: duals, reduced costs, RHS and cost ranging |
| `s2_capacity_ladder.py` | 2 | 12-quarter build / lease / spot LP; demand duals per quarter; take-or-pay floor duals |
| `s3_who_gets_which_gpus.py` | 3 | Assignment LP (integral on its own) and generalized assignment, LP relaxation vs MIP |
| `s4_lumpy_choices.py` | 4 | Site-portfolio MIP with logic constraints; rack packing, exact MIP vs first-fit-decreasing |
| `s5_bid_price_desk.py` | 5 | Deterministic LP for network revenue management; week duals = bid prices |
| `s6_commit_or_flex.py` | 6 | Two-stage stochastic LP: RP, WS, EEV, VSS, EVPI, and the value of an "up to" option |
| `s7_diminishing_returns.py` | 7 | Concave budget split (water-filling, KKT) and the Chinchilla compute-optimal split |
| `capstone_allocation_memo.py` | Capstone | Six-quarter, five-scenario contract portfolio with a CVaR risk weight |

`common.py` holds what every script does identically: solver options that match the page
(simplex, presolve off, so the duals and ranging come from the basis the solver finished on), the
unit economics from `js/econ.js`, and the `--json` switch.

## Excel Solver ↔ code

| Excel Solver | In these scripts | In HiGHS terms |
|---|---|---|
| **Set Objective** (Max / Min) | `obj=` on each `h.addVariable(...)`, then `solve(h, "max")` | objective coefficients and sense |
| **By Changing Variable Cells** | `h.addVariable(lb=0, ub=..., name=...)` | columns (decision variables) |
| **Subject to the Constraints** | `h.addConstr(expression <= rhs)` | rows |
| "Make Unconstrained Variables Non-Negative" | `lb=0` (the default) | column lower bounds |
| `int` / `bin` constraint on a cell | `type=HighsVarType.kInteger`, `h.addBinary(...)` | integrality; HiGHS switches to branch-and-cut |
| **Simplex LP** engine | any LP here (`new_model()`) | dual or primal simplex |
| **GRG Nonlinear** engine | step 7: the KKT conditions solved directly (water-filling, Lagrange closed form) | not an LP; no HiGHS call needed |
| **Evolutionary** engine | not used: every model here is an LP or MIP, so HiGHS proves optimality | — |

### Sensitivity Report ↔ code

| Sensitivity Report column | What it means | Where it comes from |
|---|---|---|
| Constraints · **Shadow Price** | $ of objective per unit more of the right-hand side | `h.getSolution().row_dual[i]` |
| Constraints · **Allowable Increase / Decrease** | how far the RHS can move before the shadow price changes | `h.getRanging()` → `row_bound_up.value_` / `row_bound_dn.value_` (these are the RHS endpoints themselves, not deltas) |
| Variable Cells · **Reduced Cost** | how much a product's margin must improve before it enters the plan | `h.getSolution().col_dual[j]` |
| Variable Cells · **Allowable Increase / Decrease** (objective coefficient) | how far a margin can move before the plan changes | `h.getRanging()` → `col_cost_up.value_` / `col_cost_dn.value_` (endpoints) |

Two cautions the checker enforces:

- **Ranging needs a simplex basis.** HiGHS only produces ranging after a simplex solve, so
  `new_model(ranging=True)` turns presolve off and forces simplex, exactly as `js/lp.js` does.
- **A shadow price can be non-unique.** When a solution is degenerate, many dual values are optimal,
  and two correct solvers can print different ones. Step 2's take-or-pay floor rows are like this:
  the web page (HiGHS 1.15.3, WebAssembly) and this script (HiGHS 1.15.1, native) report different
  floor duals, and both are right. The checker finite-differences each binding row and shows the
  interval of valid prices instead of pretending there is one number.
