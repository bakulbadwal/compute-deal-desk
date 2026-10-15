// Step 5 · The bid-price desk — revenue management: DLP bid prices vs first-come-first-served.
import { h, s, f, slider, seg, predict, clicks, say, beyond, modelCard, readout, scheduler, scale, niceTicks, axes, legend, css, ledger, touch } from "../ui.js";
import { S5, S5_PRODUCTS, s5Model, s5Stream, s5Simulate } from "../models.js";

export async function render(root) {
  let model = null, base = null, seed = 7, policy = "resolve";

  root.append(
    h("p", { class: "lede", html: "Switch seats: you run the <b>revenue desk at a neocloud</b>. Over the next four weeks you have <b>40 spare GB200 racks a week</b>. Eight products compete for them: on-demand by the week, two-week fine-tune blocks, a four-week reservation, and cut-price batch. Prices are in $k per rack-week. A GPU-hour is perishable like an airline seat: unsold today, gone forever. Cheap requests tend to book early; the valuable ones show up later." }),
    predict({
      q: "Racks are free and a cheap batch request arrives. What should a good desk do?",
      options: ["Accept: an empty rack earns nothing", "Accept only if its fare beats the bid price of the weeks it uses", "Always reject batch"],
      answer: 1,
      explain: "Accepting uses up a rack-week that a later, better-paying request might want. The <b>bid price</b> of a week is the shadow price of that week's capacity in a planning LP: the expected value of the last rack. Accept a request only if its fare covers the bid prices of every week it uses.",
    }));

  // (a) bid prices
  const bpBox = h("div", { class: "chartbox" }), dlpTbl = h("div", { class: "tbl-wrap" });
  root.append(h("div", { class: "card" },
    h("div", { class: "card-h" }, h("h3", {}, "(a) The bid prices"), h("span", { class: "sub" }, "Solve the planning LP on expected demand. Its week duals are the hurdles.")),
    h("div", { style: { maxWidth: "560px" } }, bpBox), dlpTbl));

  // (b) simulation
  const timeBox = h("div", { class: "chartbox" }), cmpBox = h("div", { class: "chartbox" });
  const ro = { rev: readout("Revenue this month", "", { cls: "brass", sub: "$k" }), acc: readout("Requests accepted", "", {}), left: readout("Racks unsold at the end", "", {}) };
  const avgBtn = h("button", { class: "btn small", type: "button" }, "Average over 40 seeded months");
  root.append(h("div", { class: "card" },
    h("div", { class: "card-h" }, h("h3", {}, "(b) Run the month"), h("span", { class: "sub" }, "One seeded stream of booking requests. Green = accepted, grey = rejected.")),
    h("div", { class: "btnrow" },
      seg({ label: "Policy", options: [["fcfs", "First come, first served"], ["bid", "Bid prices (solved once)"], ["resolve", "Bid prices, re-solved as you go"]], value: policy, onchange: v => { policy = v; runSim(); } }),
      slider({ label: "Seed (a different month)", min: 1, max: 40, step: 1, value: seed, fmt: v => v, id: "s5seed", oninput: v => { seed = v; runSim(); } })),
    timeBox,
    h("div", { class: "readouts" }, ro.rev, ro.acc, ro.left),
    h("div", { class: "btnrow" }, avgBtn), cmpBox));

  const card = modelCard({
    decisions: "<i>x<sub>j</sub></i> = how many of product <i>j</i> to plan to accept (a booking limit).",
    objective: "Maximize Σ fare<sub>j</sub> · x<sub>j</sub>.",
    constraints: "For each week <i>w</i>: Σ racks used in <i>w</i> by accepted products ≤ 40. For each product: x<sub>j</sub> ≤ expected demand. The four week rows' duals are the bid prices.",
    py: "s5_bid_price_desk.py",
    excel: "the deterministic LP is one small Solver model; the simulation needs a macro or a data table. The course's markdown-pricing session is the same idea seen from the price side: set prices over time so perishable inventory sells out at the best total revenue.",
    getLP: () => model?.toLP() || "",
  });
  root.append(
    clicks(null, h("ul", {},
      h("li", { html: "<b>Perishable capacity changes the question</b> from “can I fit this?” to “is this the best use of the rack?”" }),
      h("li", { html: "<b>The bid price is a shadow price again,</b> this time the seller's: the value of the last rack in a week. Same math as step 1, the other side of the table." }),
      h("li", { html: "<b>Bid-price control is a strong heuristic, not the optimum.</b> Talluri & van Ryzin (1998) showed it can be beaten in principle; re-solving the LP as demand reveals itself closes much of the gap, which is what the third policy does. Their 1999 paper averages duals over sampled demand: the bridge to step 6." }))),
    say("A GPU-hour is an airline seat. We price the last rack in each week with a planning LP, and we turn down cheap work when a better booking is likely to come."),
    card,
    beyond([
      ["AI pricing", "Batch APIs at half price", "Labs sell batch inference at a 50% discount and priority tiers at a premium. That's revenue management: batch soaks up capacity whose bid price is low (it can wait for off-peak), and priority protects capacity for high-fare demand."],
      ["Beyond the course", "Reserved vs on-demand", "A reservation is a booking that arrives early with a discount for commitment. Whether to take it is the bid-price test summed across every week it covers. That's why reserved prices are lower but not arbitrarily lower."],
    ]));

  function drawBids(r) {
    const bids = S5.capacity.map((_, w) => r.dual[`week_${w + 1}`]);
    const W = 420, H = 230, m = { l: 48, r: 10, t: 14, b: 36 };
    const x = scale(0, 4, m.l, W - m.r), y = scale(0, 40, H - m.b, m.t), bw = (x(1) - x(0)) * 0.6;
    const svg = s("svg", { class: "chart", viewBox: `0 0 ${W} ${H}`, role: "img", "aria-label": "Bid price per week" });
    svg.append(axes({ x: v => x(v + 0.5), y, W, H, m, xt: [0, 1, 2, 3], xfmt: t => `Week ${t + 1}`, yt: [0, 10, 20, 30, 40], yfmt: v => "$" + v + "k", ylab: "Bid price per rack" }));
    bids.forEach((b, i) => {
      svg.append(s("rect", { x: x(i) + ((x(1) - x(0)) - bw) / 2, y: y(b), width: bw, height: y(0) - y(b), fill: css("--brass"), rx: 3 }));
      svg.append(s("text", { class: "big", x: x(i + 0.5), y: y(b) - 6, "text-anchor": "middle" }, `$${b.toFixed(0)}k`));
    });
    bpBox.innerHTML = ""; bpBox.append(svg);
    dlpTbl.innerHTML = "";
    dlpTbl.append(h("table", { class: "t" }, h("thead", {}, h("tr", {}, ["Product", "Fare", "Hurdle", "Plan to accept", "Expected"].map(t => h("th", {}, t)))),
      h("tbody", {}, S5_PRODUCTS.map(q => {
        const hurdle = q.weeks.reduce((a, w) => a + bids[w], 0);
        const ok = q.fare >= hurdle - 1e-9;
        return h("tr", {}, h("td", {}, q.label), h("td", { class: "num" }, q.fare), h("td", { class: "num", style: { color: ok ? "var(--green)" : "var(--wall-d)" } }, hurdle.toFixed(0)), h("td", { class: "num" }, r.x[q.id].toFixed(0)), h("td", { class: "num" }, q.mean));
      }))),
      h("p", { class: "note", html: `Hurdle = the sum of bid prices over the weeks a product uses. Weeks 2 and 4 are priced at the full on-demand fare ($${bids[1].toFixed(0)}k): an on-demand customer is waiting for the last rack. Week 3's bid is what a weeks 3–4 fine-tune block pays beyond week 4's price. Week 1's bid ($${bids[0].toFixed(0)}k) is whatever is left of the reservation's $100k after weeks 2–4 take their cut: the reservation is the marginal product there. Batch never clears its hurdle.` }));
    ledger.put("s5-bid", { what: "Step 5 · the last free rack in week 2 vs week 1", price: `$${bids[1].toFixed(0)}k vs $${bids[0].toFixed(0)}k a rack-week`, note: "Bid prices: week duals of the planning LP (teaching fares)." });
  }
  const runSim = scheduler(async () => {
    const stream = s5Stream(seed), r = await s5Simulate(stream, policy);
    const W = 760, H = 150, m = { l: 10, r: 10, t: 22, b: 18 };
    const x = scale(0, stream.length, m.l, W - 120);
    const prodY = q => m.t + (S5_PRODUCTS.findIndex(p2 => p2.id === q) / (S5_PRODUCTS.length - 1)) * (H - m.t - m.b);
    const svg = s("svg", { class: "chart", viewBox: `0 0 ${W} ${H + 10}`, role: "img", "aria-label": "Booking requests over the month, accepted or rejected" });
    S5_PRODUCTS.forEach(q => svg.append(s("text", { x: W - m.r, y: prodY(q.id) + 4, "text-anchor": "end", "font-size": 10 }, q.label.replace("On-demand, ", "OD ").replace("Fine-tune block, ", "FT ").replace("Reserved, all 4 weeks", "Reserved").replace("Batch (50% off), week 4", "Batch"))));
    r.log.forEach((e, i) => {
      const c = s("circle", { cx: x(i + 0.5), cy: prodY(e.id), r: 3.4, fill: e.ok ? css("--green") : css("--rule-strong") });
      c.append(s("title", {}, `${S5_PRODUCTS.find(q => q.id === e.id).label}: fare $${e.fare}k, hurdle $${e.hurdle.toFixed(0)}k → ${e.ok ? "accepted" : e.fits ? "rejected" : "no room"}`));
      svg.append(c);
    });
    svg.append(s("text", { x: m.l, y: 12, class: "lbl" }, "earlier →  booking requests in arrival order  → later"));
    timeBox.innerHTML = ""; timeBox.append(svg);
    ro.rev.set(f.int(r.revenue)); ro.acc.set(`${r.accepted} of ${stream.length}`); ro.left.set(String(r.capLeft.reduce((a, b) => a + b, 0)), "rack-weeks");
  });
  avgBtn.addEventListener("click", async e => {
    touch(e.target); avgBtn.disabled = true; avgBtn.textContent = "Simulating 120 runs…";
    const sums = { fcfs: [], bid: [], resolve: [] };
    for (let sd = 1; sd <= 40; sd++) { const st = s5Stream(sd); for (const pol of Object.keys(sums)) sums[pol].push((await s5Simulate(st, pol)).revenue); }
    const avg = a => a.reduce((x1, y1) => x1 + y1, 0) / a.length, sd = a => { const mu = avg(a); return Math.sqrt(avg(a.map(v => (v - mu) ** 2))); };
    const rows = Object.entries(sums).map(([k, v]) => [k, avg(v), sd(v)]);
    const W = 520, H = 150, m = { l: 190, r: 70, t: 10, b: 10 }, max = Math.max(...rows.map(q => q[1])) * 1.05;
    const x = scale(0, max, m.l, W - m.r), bh = 30;
    const names = { fcfs: "First come, first served", bid: "Bid prices (solved once)", resolve: "Bid prices, re-solved" };
    const svg = s("svg", { class: "chart", viewBox: `0 0 ${W} ${H}`, role: "img", "aria-label": "Average revenue by policy" });
    rows.forEach(([k, v, d], i) => {
      const yy = m.t + i * (bh + 14);
      svg.append(s("text", { x: m.l - 8, y: yy + bh / 2 + 4, "text-anchor": "end", class: "lbl" }, names[k]),
        s("rect", { x: m.l, y: yy, width: x(v) - m.l, height: bh, fill: k === "fcfs" ? css("--rule-strong") : css("--brass"), rx: 3 }),
        s("text", { class: "big", x: x(v) + 6, y: yy + bh / 2 + 4 }, `$${f.int(v)}k`));
    });
    const lift = rows[2][1] / rows[0][1] - 1, lift1 = rows[1][1] / rows[0][1] - 1;
    cmpBox.innerHTML = ""; cmpBox.append(svg, h("p", { class: "note", html: `Averages over seeded months 1–40 (± SD across months: ${rows.map(q => `$${f.int(q[2])}k`).join(", ")}). Bid prices beat first-come-first-served by <b>${f.pct(lift1, 0)}</b>; re-solving adds a little more (<b>${f.pct(lift, 0)}</b> in total). Same racks, same customers; the only difference is saying no to some early, cheap requests.` }));
    avgBtn.textContent = "Averaged over 40 months";
    ledger.put("s5-lift", { what: "Step 5 · saying no to cheap early bookings", price: `+${f.pct(lift, 0)} revenue`, note: "Re-solved bid prices vs first-come-first-served, 40 seeded months." });
  });

  model = s5Model(); base = await model.solve();
  drawBids(base); card.refresh();
  runSim();
}
