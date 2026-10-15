# Design: Compute Deal Desk

**North star: a term sheet on paper.** The lab is a deal desk, so the surfaces are the objects on one: warm paper with faint ledger lines, navy ink, brass for every price, and signal orange for every wall you're pressed against. It's a sibling of Inference Kitchen (same paper ground and hand-built SVG) with its own register: more serious, because the reader is getting ready for a negotiation.

## Color has one job per hue

| Token | Light | Dark | Means |
|---|---|---|---|
| `--brass` / `--brass-d` | #A67C2E / #7D5B1C | #D6AE5E / #E5C47E | A price: shadow prices, bid prices, λ, the price list |
| `--wall` / `--wall-d` | #D2552B / #A93F1B | #EE7A4F / #F39A77 | A binding constraint, infeasibility, a wrong answer |
| `--green` | #2E7A57 | #6CC296 | Exact / verified / good outcome |
| `--blue`, `--navy` | #2F5D8A, #22385C | #7FA8D6, #9DB7DD | Structure: the feasible region, the user's plan, primary buttons |
| `--plum` | #6B4C8A | #B49AD3 | “Beyond the course” and secondary series |
| `--paper`, `--sheet`, `--ink` | #F5F0E4, #FFFCF4, #1E2430 | #14171D, #1B1F27, #ECE6D8 | Ground, cards, text |

The partner rule from the kitchen carries over: a saturated hue never sets body text on paper; its `-d` partner does.

## Type

- **Fraunces** (display serif) for headings, predictions and the “say it out loud” line: the voice of the memo.
- **IBM Plex Sans** for body and labels.
- **IBM Plex Mono** with tabular figures for every number, so columns of duals line up like a sensitivity report.

## Components

- **Readouts** (`.ro`): a label, a big mono number, a sub-line. Brass for prices, orange for walls, green for verified.
- **Predict first** (dashed brass card): answer before you play; the reveal explains.
- **Say it out loud** (blurred until you move a control in the step): the one sentence to use in an interview.
- **Model card** (`details.model`): the formulation in words, the live LP text the solver receives, the Python twin and the Excel equivalent.
- **The price list** (sticky sidebar at ≥ 1180 px, a toggle below): every shadow price discovered, in deal language; prints to one page.
- **Charts** are hand-built SVG, clipped to their plot area, with labels haloed in the card color so they stay legible over lines.

## Layout and motion

- A 1240 px container with a 300 px price list at desktop; cards use container queries to stack their two columns below 700 px card width. No horizontal scroll at 375 px.
- Motion is limited to a brief “wall bump” when a nudge leaves a shadow price's allowable range, and a hover lift on landing cards. Both respect `prefers-reduced-motion`.
- Light and dark modes follow the system, with a toggle and `?theme=` for screenshots.
