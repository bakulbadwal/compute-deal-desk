// art.js — the campus cutaway on the landing page. Flat shapes, themed by CSS variables.
export function campusArt() {
  const racks = (x, y, n, w, hgt, fill, gap = 6) => Array.from({ length: n }, (_, i) =>
    `<rect x="${x + i * (w + gap)}" y="${y}" width="${w}" height="${hgt}" rx="2" fill="${fill}" stroke="var(--ink)" stroke-width="1.2"/>` +
    Array.from({ length: 4 }, (_, k) => `<rect x="${x + i * (w + gap) + 3}" y="${y + 5 + k * (hgt - 8) / 4}" width="${w - 6}" height="${(hgt - 8) / 4 - 3}" fill="var(--sheet)" opacity=".55"/>`).join("") +
    `<circle cx="${x + i * (w + gap) + w - 5}" cy="${y + 4}" r="1.6" fill="var(--green)"/>`).join("");
  return `
<svg class="hero-art" viewBox="0 0 640 450" role="img" aria-labelledby="artT artD">
  <title id="artT">A compute campus in cutaway</title>
  <desc id="artD">A substation feeds a three-floor data hall: air-cooled racks at the bottom, liquid-cooled racks in the middle, cooling on the roof, and the deal desk on the top floor, where a screen shows the shadow price of power stepping down.</desc>
  <rect x="0" y="0" width="640" height="450" rx="14" fill="var(--sheet)" stroke="var(--rule-strong)"/>
  <!-- ground -->
  <rect x="0" y="392" width="640" height="58" rx="0" fill="var(--grey-soft)"/>
  <line x1="0" y1="392" x2="640" y2="392" stroke="var(--ink)" stroke-width="1.5"/>
  <!-- transmission tower + lines -->
  <g stroke="var(--ink)" stroke-width="1.5" fill="none">
    <path d="M42 392 L62 170 L82 392 M48 330 L76 330 M53 270 L71 270 M57 215 L67 215 M46 186 L78 186"/>
    <path d="M0 150 Q 30 160 46 186 M0 168 Q 34 176 78 186" stroke-width="1.2"/>
    <path d="M78 186 Q 110 200 128 262" stroke-width="1.2"/>
  </g>
  <!-- substation -->
  <g>
    <rect x="96" y="262" width="88" height="130" fill="none" stroke="var(--wall)" stroke-width="2.5" stroke-dasharray="5 4"/>
    <rect x="108" y="300" width="28" height="44" rx="3" fill="var(--steel, #9AA3B2)" stroke="var(--ink)" stroke-width="1.2"/>
    <rect x="144" y="300" width="28" height="44" rx="3" fill="var(--steel, #9AA3B2)" stroke="var(--ink)" stroke-width="1.2"/>
    <path d="M116 300v-14M128 300v-14M152 300v-14M164 300v-14" stroke="var(--ink)" stroke-width="2"/>
    <rect x="104" y="356" width="72" height="26" rx="3" fill="var(--sheet-2)" stroke="var(--ink)" stroke-width="1.2"/>
    <text x="140" y="373" text-anchor="middle" font-family="IBM Plex Mono, monospace" font-size="11" font-weight="600" fill="var(--wall-d)">285 MW</text>
    <text x="140" y="414" text-anchor="middle" font-family="IBM Plex Sans, sans-serif" font-size="11.5" fill="var(--wall-d)" font-weight="600">the wall:</text><text x="140" y="429" text-anchor="middle" font-family="IBM Plex Sans, sans-serif" font-size="11.5" fill="var(--wall-d)" font-weight="600">grid connection</text>
  </g>
  <!-- power feed into building -->
  <path d="M184 372 H 214" stroke="var(--brass)" stroke-width="4"/>
  <path d="M199 366 l 6 6 l -6 6" fill="none" stroke="var(--brass)" stroke-width="2"/>
  <!-- building -->
  <rect x="214" y="96" width="330" height="296" fill="var(--sheet-2)" stroke="var(--ink)" stroke-width="2"/>
  <!-- roof cooling -->
  <g>
    <rect x="232" y="72" width="78" height="24" rx="3" fill="var(--blue-soft)" stroke="var(--ink)" stroke-width="1.2"/>
    <rect x="322" y="72" width="78" height="24" rx="3" fill="var(--blue-soft)" stroke="var(--ink)" stroke-width="1.2"/>
    <rect x="412" y="72" width="78" height="24" rx="3" fill="var(--blue-soft)" stroke="var(--ink)" stroke-width="1.2"/>
    ${[250, 290, 340, 380, 430, 470].map(x => `<circle cx="${x}" cy="84" r="8" fill="none" stroke="var(--blue)" stroke-width="1.5"/><path d="M${x - 5} 84h10M${x} 79v10" stroke="var(--blue)" stroke-width="1"/>`).join("")}
    <text x="508" y="88" font-family="IBM Plex Sans, sans-serif" font-size="11" fill="var(--ink-2)">cooling</text>
  </g>
  <!-- floor lines -->
  <line x1="214" y1="190" x2="544" y2="190" stroke="var(--ink)" stroke-width="1.5"/>
  <line x1="214" y1="292" x2="544" y2="292" stroke="var(--ink)" stroke-width="1.5"/>
  <!-- top floor: the desk -->
  <g>
    <rect x="232" y="146" width="150" height="10" rx="2" fill="var(--wood, #B8793F)" stroke="var(--ink)" stroke-width="1.2"/>
    <rect x="240" y="156" width="6" height="34" fill="var(--ink-2)"/><rect x="368" y="156" width="6" height="34" fill="var(--ink-2)"/>
    <rect x="262" y="104" width="92" height="40" rx="3" fill="var(--navy)" stroke="var(--ink)" stroke-width="1.2"/>
    <path d="M270 112 H 290 V 120 H 312 V 132 H 330 V 136 H 346" fill="none" stroke="var(--brass)" stroke-width="2.5" stroke-linejoin="round"/>
    <text x="308" y="141" text-anchor="middle" font-family="IBM Plex Mono, monospace" font-size="7.5" fill="var(--paper)">$/MW · shadow price</text>
    <circle cx="410" cy="132" r="9" fill="var(--ink-2)"/>
    <path d="M396 190 V 156 Q 410 142 424 156 V 190" fill="var(--plum)"/>
    <rect x="440" y="120" width="86" height="58" rx="2" fill="var(--paper)" stroke="var(--ink)" stroke-width="1.2"/>
    <path d="M448 132h60M448 142h70M448 152h48M448 164h30" stroke="var(--ink-3)" stroke-width="2"/>
    <text x="483" y="114" text-anchor="middle" font-family="IBM Plex Sans, sans-serif" font-size="10.5" fill="var(--ink-2)">term sheet</text>
  </g>
  <!-- middle floor: liquid-cooled -->
  ${racks(232, 206, 9, 26, 70, "var(--blue)")}
  <path d="M232 284 H 528" stroke="var(--blue)" stroke-width="3" opacity=".7"/>
  <!-- bottom floor: air-cooled -->
  ${racks(232, 310, 9, 26, 66, "var(--chart-6)")}
  <!-- labels -->
  <g font-family="IBM Plex Sans, sans-serif" font-size="11.5" fill="var(--ink-2)">
    <text x="552" y="150">the desk</text>
    <text x="552" y="244">liquid-cooled</text><text x="552" y="258">halls</text>
    <text x="552" y="344">air-cooled</text><text x="552" y="358">halls</text>
  </g>
  <!-- fiber out to buyers -->
  <path d="M544 372 C 590 372, 600 330, 640 330" fill="none" stroke="var(--green)" stroke-width="2.5" stroke-dasharray="2 5" stroke-linecap="round"/>
  <text x="600" y="414" text-anchor="middle" font-family="IBM Plex Sans, sans-serif" font-size="11" fill="var(--green)" font-weight="600">to labs, APIs,</text>
  <text x="600" y="428" text-anchor="middle" font-family="IBM Plex Sans, sans-serif" font-size="11" fill="var(--green)" font-weight="600">sovereigns</text>
</svg>`;
}
