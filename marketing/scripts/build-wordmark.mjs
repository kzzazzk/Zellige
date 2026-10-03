// Generates src/assets/zellige-wordmark.svg: the moodboard wordmark drawn as geometry
// (circular e/g bowls, stepped l-l-i, star dots) and filled with faceted navy glaze.
import { Delaunay } from 'd3-delaunay';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const S = 68;          // stroke
const BASE = 568;      // baseline
const XH = 320;        // x-height top
const R = (BASE - XH) / 2; // bowl radius 124
const CY = XH + R;
const RI = R - S;      // counter radius
const round = 7;

// Painted in order into the mask: white keeps, black removes.
const layers = [];
const keep = (svg) => layers.push(`<g fill="#fff">${svg}</g>`);
const cut = (svg) => layers.push(`<g fill="#000">${svg}</g>`);
const rect = (x, y, w, h, r = round) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}"/>`;
const circle = (cx, cy, r) => `<circle cx="${cx}" cy="${cy}" r="${r}"/>`;

// z
keep(`<path d="M15 ${XH + round}q0-${round} ${round}-${round}H243q7 0 7 7V${XH + S - 2}L${15 + 98} ${BASE - S}H243q7 0 7 7V${BASE - round}q0 ${round}-${round} ${round}H22q-7 0-7-7V${BASE - S + 2}L${250 - 98} ${XH + S}H22q-7 0-7-7Z"/>`);
// e: ring with a heavy bar, open towards the lower right
function e(cx) {
  keep(circle(cx, CY, R));
  cut(circle(cx, CY, RI));
  cut(`<path d="M${cx} ${CY + 30}L${cx + R + 30} ${CY + 30}L${cx + R + 30} ${CY + R * 0.9}Z"/>`);
  keep(rect(cx - RI - 2, CY - 22, RI * 2 + 4 + (R - RI) * 0.6, 52, 0));
}
e(405);
// Stepped l, l, i: each stem lower than the last, the stars sit on the last two.
keep(rect(570, 200, 70, BASE - 200));
keep(rect(683, 250, 69, BASE - 250));
keep(rect(800, XH, 66, BASE - XH));
// g: open descender under a round bowl, a right stem and a short diagonal ear
const gx = 1040;
const ty = BASE + 4;
keep(circle(gx, ty, R - 4));
cut(circle(gx, ty, R - 4 - S + 4));
cut(rect(gx - R - 10, CY - R - 10, R * 2 + 20, ty - CY + R + 10, 0));
cut(`<path d="M${gx - 10} ${ty}L${gx - R - 20} ${ty - 4}L${gx - R - 20} ${ty + R * 1.05}Z"/>`);
keep(circle(gx, CY, R));
cut(circle(gx, CY, RI));
keep(rect(gx + R - S, CY, S, ty - CY, 0));
keep(`<path d="M${gx + 58} ${CY - 98}L${gx + 106} ${CY - 146}Q${gx + 112} ${CY - 152} ${gx + 118} ${CY - 146}L${gx + 142} ${CY - 122}Q${gx + 148} ${CY - 116} ${gx + 142} ${CY - 110}L${gx + 96} ${CY - 64}Z"/>`);
e(1330);

// Fat four-point stars, faceted like the mascot's sparkles.
function star(cx, cy, r, tones, inner = 0.34) {
  const p = [[0, -1], [inner, -inner], [1, 0], [inner, inner], [0, 1], [-inner, inner], [-1, 0], [-inner, -inner]]
    .map(([x, y]) => [cx + x * r, cy + y * r]);
  return p.map((a, i) => {
    const b = p[(i + 1) % 8];
    return `<path d="M${cx} ${cy}L${a[0].toFixed(1)} ${a[1].toFixed(1)}L${b[0].toFixed(1)} ${b[1].toFixed(1)}Z" fill="${tones[i]}"/>`;
  }).join('');
}

let seed = 11;
function wordmark(name, navy, glints, tones) {
// Low-poly navy facets, about one stroke wide, with faint lighter edges.
const W = 1480, H = 760;
seed = 11;
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
let pts = Array.from({ length: 260 }, () => [rnd() * W, 160 + rnd() * (H - 160)]);
for (const corner of [[0, 160], [W, 160], [0, H], [W, H]]) pts.push(corner);
const tri = Delaunay.from(pts).triangles;

let facets = '';
for (let i = 0; i < tri.length; i += 3) {
  const d = [tri[i], tri[i + 1], tri[i + 2]].map((k) => pts[k].map((v) => v.toFixed(1)).join(' ')).join('L');
  // A few facets catch the light in brighter cobalt, like glazed shards.
  const tone = rnd() < 0.12 ? glints[Math.floor(rnd() * glints.length)] : navy[Math.floor(rnd() * navy.length)];
  facets += `<path d="M${d}Z" fill="${tone}" stroke="${glints[0]}" stroke-opacity="${(0.05 + rnd() * 0.16).toFixed(2)}" stroke-width="1.2"/>`;
}

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 40 ${W} ${H - 30}" role="img" aria-label="zellige">
<defs>
<mask id="m" maskUnits="userSpaceOnUse" x="0" y="0" width="${W}" height="${H}">${layers.join('')}</mask>
<linearGradient id="gloss" x1="0" y1="0" x2="0.15" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".2"/><stop offset=".4" stop-color="#fff" stop-opacity="0"/><stop offset=".75" stop-color="#000" stop-opacity=".12"/><stop offset="1" stop-color="#5d8fd8" stop-opacity=".15"/></linearGradient>
</defs>
<g mask="url(#m)"><rect width="${W}" height="${H}" fill="${navy[navy.length - 1]}"/>${facets}<rect width="${W}" height="${H}" fill="url(#gloss)"/></g>
${star(722, 136, 76, tones)}${star(838, 242, 56, tones)}
</svg>`;
const out = fileURLToPath(new URL(`../src/assets/${name}`, import.meta.url));
writeFileSync(out, svg);
console.log(`Wrote ${out} (${svg.length} bytes)`);
}

// Day: deep navy facets on ivory. Night: porcelain facets (cool ivory, pearl glints). The two
// stars are gold in both, so the mark keeps one constant anchor across themes.
// (Glazed cobalt was tried at night and rejected: too little contrast on the ink background.)
wordmark('zellige-wordmark.svg',
  ['#081936', '#0a1f42', '#0b2147', '#071630', '#0c2550', '#06132b', '#0f2d5e', '#09193a', '#123468', '#0a1c3f'],
  ['#1d4d8f', '#1a4a8e', '#2257a8'],
  // Gold stars in both modes: the fixed anchor of the mark. A deeper gold by day, to hold on ivory.
  ['#e2c06a', '#8f6a26', '#c9a24f', '#6e5118', '#b08a3a', '#5f4514', '#9a7529', '#d4b05a']);
wordmark('zellige-wordmark-night.svg',
  ['#f7f5ef', '#e9e5da', '#fdfcf8', '#d6d0c2', '#f1eee5', '#c9c2b2', '#faf8f2', '#e0dbcf', '#ffffff', '#ece8de'],
  ['#ffffff', '#e8eef8', '#d8e2f1'],
  ['#f4d993', '#b8913f', '#d9b765', '#8f6a26', '#c9a24f', '#7d5c1f', '#a9843a', '#e6c77c']);
