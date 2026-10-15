# Case Study: Compute Deal Desk
### A product-thinking write-up (not a README). For how to run it, see the [README](./README.md).

A hands-on lab that teaches the one quantitative skill compute-deal seats actually use: turning a capacity decision into a model, and reading the model's **shadow prices** (what one more MW, GPU-hour or contract tranche is worth, and over what range) well enough to quote them in a negotiation.

---

## The problem I was solving

Two things collided.

1. **The roles I'm recruiting for are allocation problems in disguise.** Compute strategy, deal strategy and infrastructure-partnership seats at labs, hyperscalers and neoclouds spend their days on questions like “how much take-or-pay do we sign,” “is this 40 MW substation worth it,” and “which 20–30 MW sites do we pursue.” Each one has decisions, an objective and walls. The person who can name the binding wall and its price wins the conversation.
2. **The standard way to learn this is a spreadsheet course.** Business-school optimization electives teach formulation and sensitivity analysis well, but in Excel Solver, on retail and logistics cases. In 2026 the modeling is the skill and the tool is incidental: a coding agent writes a `highspy` model in minutes, and the hard part is knowing whether to trust it.

The gap: **nothing taught shadow prices as prices, pointed at compute and power, with a real solver you could poke.** The existing material is either theory (duality proofs), generic (Solver tutorials), or vendor marketing (“efficiency saves you X”).

## Who it's for

Primary user: me, an operator rather than an engineer, preparing for compute-strategy and deal-desk interviews and wanting to be fluent in the questions my own AI-deals research says those interviews ask. Secondary: MBA classmates heading to tech, infra or deals roles who skipped optimization, and anyone who has to read a sensitivity report someone emailed them.

## The core product insight

**Teach the shadow price as a price with an expiry quantity.** Most explanations stop at “the dual is the marginal value.” The lab makes the second half unmissable: in step 1, the grid connection is worth $3.48M per MW-year *for the next 15.2 MW*, then GPU deliveries bind and the price collapses. So a 40 MW substation is worth about $56M a year, not 40 × $3.48M = $139M. Every later step reuses the same idea from a different seat: the bid price of a rack-week (the seller's shadow price), the value of an “up to” (a price on flexibility), and λ in a research budget (the shadow price of compute).

## Key product decisions & the tradeoffs I made

| Decision | Why | Tradeoff I accepted |
|---|---|---|
| **A real solver in the browser (HiGHS via WebAssembly), not canned answers** | Learners distrust toy numbers, and a solver lets every slider re-optimize honestly. Ranging, reduced costs and MIP gaps come straight from it. | A 3.5 MB WebAssembly payload, and the site needs `http://` rather than opening from a file. Worth it: “nothing is canned” is the product. |
| **A Python twin for every model, and a checker that compares them** | Two independent implementations catch modeling bugs one can't. The twins double as “the course in code.” | More to maintain. The checker caught a stale default within an hour of being written, which paid for it. |
| **Finite-difference every dual, and say so when it's degenerate** | Solver reports quietly mislead when a problem is degenerate: the shadow price isn't unique. The checker found exactly this on the step-2 take-or-pay floor. | The page quotes a *pair* (cost to raise, saving to lower) instead of one clean number there. Less tidy, more honest. |
| **“At teaching prices” on every dollar** | Per-deal compute pricing isn't public. A lab that leaks invented dollar figures as facts does harm in an interview. | Slightly noisier UI. The mechanics and ratios are the takeaways, so the badge points users to the right thing to quote. |
| **Two seats at the table** (neocloud and lab) | Deal teams that understand the counterparty's shadow prices negotiate better. | Some context-switching between steps. Each step names its seat up front. |
| **The Excel layout kept, not hidden** | Deal desks and FP&A still email Solver reports. The step-1 report is laid out exactly like Excel's, with a toggle to solver names. | It's a nod to a tool the lab otherwise argues past, but recognizing the artifact you'll be handed is a real skill. |
| **Wrong models on purpose** (step 8) | Biggest risk in AI-assisted modeling: bugs that still solve to “optimal.” Four formulations, three quietly wrong, and four cheap checks that each catch a different bug. | Takes trust to build. The wrong model reports the *lowest* cost, which is the point. |

## How I'd measure success

**North star:** can a user answer the field test's ten questions (each answered by operating a widget at defaults) at ≥ 8/10, and say the step-1 “say it out loud” line unprompted in a mock interview?

**What I'd instrument with a backend:** step completion and drop-off (the site already tracks progress locally); the share of users who open a model card (a proxy for “owns the model”); the predict-then-reveal hit rate per step (where intuition is weakest); price-list exports (the “takeaway” behavior).

**What I don't measure today:** it's static and local-first, so there's no telemetry. That's deliberate for v1; I'd want qualitative signal (do classmates use the price list in recruiting conversations?) before adding accounts.

## What's next (roadmap)

1. **A gigawatt-scale step:** a portfolio of campuses across grids, with locational marginal prices as duals of real node-balance constraints.
2. **Live data where it exists:** spot GPU-hour indices and public interconnection-queue data in place of teaching prices for steps 2 and 6.
3. **Bring-your-own-model:** paste an LP or a `highspy` script and get the model card, sensitivity report and the step-8 verifier for free.
4. **Stochastic step 2:** the capacity ladder under the step-6 scenario machinery (multi-stage, with re-planning), since that's how real compute plans are made.
