# Acceptance

What has to be true before anything ships, and how it's checked. Run `make check` (models) and `make smoke` (pages).

## 1. The models agree with themselves (`make check`)

`tests/check.mjs` solves every model the page uses, in Node with the same HiGHS WebAssembly build the browser loads, and runs each Python twin in `models/` (`highspy` 1.15.1) on the same data. Last run: **PASS 235 · DEGEN 6 · INFO 6 · FAIL 0**.

| Check | What it guards against |
|---|---|
| JS vs Python objective, primal, every dual, reduced costs, RHS and cost ranges (1e-6 relative) | A modeling slip in either implementation |
| Python's hard-coded data vs `js/models.js` defaults | A default changing on the page but not in the twin (this caught a real one) |
| Finite-difference every binding dual (±δ re-solve) | Quoting a shadow price that isn't unique |
| Step 1: objective is linear across each ranging interval | Mis-reading HiGHS ranging output |
| Step 4: the page's own branch-and-bound reaches the HiGHS MIP optimum | A bug in the tree the page draws |
| Step 6: WS ≤ RP ≤ EEV; the closed-form expected cost equals the LP | A wrong two-stage model |
| Step 7: KKT conditions hold for water-filling; golden-section search lands on the Chinchilla closed form | A wrong derivation |
| Capstone: objective = (1 − λ)·E + λ·CVaR₉₀ | A wrong risk formulation |
| Null cases: no binding wall ⇒ all duals 0; CV → 0 ⇒ VSS = EVPI = 0; identical bets ⇒ equal split; pure assignment ⇒ integral LP | Numbers that are nonzero for no reason |
| Step 5 simulation over three batches of 40 seeds (mean ± SD); bid prices beat FCFS in every batch | A single lucky seed becoming copy |

**Degenerate rows, disclosed on the page:** the four step-2 take-or-pay floor rows have non-unique duals (finite differences give ranges such as [2.60, 5.60]). The page doesn't show a single dual there. It re-solves with the floor moved ±1 MW and quotes the pair. Step 3's default assignment has two optimal matchings at the same cost; the page says so.

## 2. Every number in the copy comes from a solve

Static numbers in the copy, and where each comes from (defaults):

| Copy says | Model value | Source |
|---|---|---|
| Grid shadow price $3.48M per MW-year | 3.4803 | `s1.dual.grid` |
| …for the next 15.2 MW | 300.2 − 285 | `s1.range.grid.hi` |
| next MW after that ≈ $0.14M | 0.142 | parametric re-solve |
| 40 MW is worth ≈ $56M a year, not $139M (2.5×) | 56.43 vs 139.2 (2.47×) | re-solve at 325 MW |
| Site portfolio: LP bound $637M, whole sites $684M, gap 6.8% | 636.87 / 683.50 | `s4` LP and MIP |
| NVL72 packing: 5 racks (FFD) vs 4 (exact) | 5 / 4 | `s4.pack.ffd`, `s4.pack.mip` |
| Bid prices beat FCFS by ~17% | 4,691.7 vs 4,021.2 (+16.7%), 120 seeds | `s5.sim.*.mean` |
| Critical fractile 37.5% | (16 − 10) / 16 | closed form |
| With an “up to”: ~240 MW take-or-pay + ~110 MW “up to” | 241.6 + 108.9 | `s6.option.*` |
| Indifference fee $4.75M per MW-year ≈ $0.90/GPU-hr | 4.75 → 0.904 | `s6.option.indifferenceFee` |
| Chinchilla at 10²⁴: ~62 / ~98 / ~18 tokens per parameter; rounding β moves it ~60% | 61.98 / 97.73 / 18.14; 97.73 / 61.98 = 1.58 | `s7.chin.*.ratio` |
| Capstone: a MW of campus power ≈ $16.5M over six quarters | 16.50 | Σ power-cap duals |
| Capstone: all-spot costs ~2.5× and serves 55% | 2.50×, 0.550 | fixed-plan re-solve |
| Step 8: A $417M, B $282M (serves only 30 MW in Q2), C $543M, D $465M | as stated | the four formulations |

Everything else on the page (readouts, tables, charts, the price list, the field-test answer key) is computed live.

## 3. The pages work (`make smoke`, plus manual checks)

- Every route loads in headless Chrome with no error callout and finishes rendering.
- No horizontal scroll at 375 px on any route (checked in the browser's mobile emulation: `scrollWidth ≤ innerWidth`).
- Light and dark themes, plus `?theme=light|dark` for screenshots.
- Routing uses `#/s3`-style hashes that match no element id, plus `history.scrollRestoration = "manual"`.
- Recomputes are scheduled with timers, not `requestAnimationFrame`, so steps finish computing in background tabs.
