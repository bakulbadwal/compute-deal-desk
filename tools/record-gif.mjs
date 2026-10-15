// Record the README GIF: step 1 in motion (nudge the grid wall past its range, then buy the wall).
// Drives headless Chrome over the DevTools protocol (no extra packages), writes PNG frames, then
// tools/frames-to-gif.py stitches them. Needs the local server: python3 tools/serve.py 8817
//
//   node tools/record-gif.mjs <framesDir>
import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const OUT = process.argv[2] || "frames";
const BASE = process.env.BASE || "http://localhost:8817";
const CHROME = process.env.CHROME || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const PORT = 9333;
mkdirSync(OUT, { recursive: true });

const chrome = spawn(CHROME, ["--headless=new", "--disable-gpu", "--hide-scrollbars", `--remote-debugging-port=${PORT}`,
  `--user-data-dir=${mkdtempSync(join(tmpdir(), "cdd-rec-"))}`, "--window-size=1280,1000", "about:blank"], { stdio: "ignore" });
const sleep = ms => new Promise(r => setTimeout(r, ms));

let ws, id = 0; const pending = new Map();
async function connect() {
  for (let k = 0; k < 50; k++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
      const page = list.find(t => t.type === "page");
      if (page) { ws = new WebSocket(page.webSocketDebuggerUrl); break; }
    } catch { /* not up yet */ }
    await sleep(200);
  }
  await new Promise(r => ws.addEventListener("open", r));
  ws.addEventListener("message", e => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } });
}
const send = (method, params = {}) => new Promise(r => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
const evalJs = async expr => (await send("Runtime.evaluate", { expression: expr, awaitPromise: true, returnByValue: true })).result?.result?.value;

let n = 0;
async function shot(selIndex, hold = 1) {
  const r = await evalJs(`(() => { const c = document.querySelectorAll('.card')[${selIndex}]; const b = c.getBoundingClientRect(); return { x: b.left + scrollX - 8, y: b.top + scrollY - 8, w: b.width + 16, h: b.height + 16 }; })()`);
  const res = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: true, clip: { x: r.x, y: r.y, width: r.w, height: r.h, scale: 1 } });
  for (let k = 0; k < hold; k++) writeFileSync(join(OUT, `f${String(n++).padStart(4, "0")}.png`), Buffer.from(res.result.data, "base64"));
}

await connect();
await send("Page.enable");
await send("Emulation.setDeviceMetricsOverride", { width: 1280, height: 1000, deviceScaleFactor: 1, mobile: false });
await send("Page.navigate", { url: `${BASE}/?theme=light#/s1` });
await sleep(4000);
await evalJs(`for (const sel of ['.ledger', '.tabs', '.mast']) { const el = document.querySelector(sel); if (el) el.style.display = 'none'; } 1`);

// Part 1: nudge the grid wall from 0 to +40 MW. Inside the range the readout is green; past +15.2 it flips.
await evalJs(`document.querySelectorAll('.card')[0].scrollIntoView(); 1`);
await sleep(600);
await shot(0, 6);
for (let v = 1; v <= 40; v += 1) {
  await evalJs(`(() => { const i = document.getElementById('s1nudge'); i.value = ${v}; i.dispatchEvent(new Event('input', { bubbles: true })); return 1; })()`);
  await sleep(260);
  await shot(0, v === 15 ? 6 : 1);
}
await shot(0, 10);

// Part 2: buy the wall. Switch the four offers on one at a time; the solver buys up to where the staircase meets supply.
const buyCard = await evalJs(`[...document.querySelectorAll('.card')].findIndex(c => /Buy the wall/.test(c.textContent))`);
await evalJs(`document.querySelectorAll('.card')[${buyCard}].scrollIntoView(); 1`);
await sleep(600);
await shot(buyCard, 6);
for (let k = 0; k < 4; k++) {
  await evalJs(`(() => { const c = document.querySelectorAll('.card')[${buyCard}]; const t = c.querySelectorAll('.toggle input')[${k}]; t.checked = true; t.dispatchEvent(new Event('change', { bubbles: true })); return 1; })()`);
  await sleep(2600);
  await shot(buyCard, k === 3 ? 18 : 8);
}

console.log(`wrote ${n} frames to ${OUT}`);
ws.close(); chrome.kill();
