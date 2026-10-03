// Proposal: the Zellige emblem rebuilt as one cell of the site's mosaic geometry
// (docs/design/proposals/rosette.mjs), cut like a gem to match the wordmark.
//   - colour follows symmetry: side points teal, top/bottom points blue;
//   - it tessellates: emblems placed one period apart share points and corners exactly;
//   - a second scale: each corner square holds the whole cell again, smaller.
// Writes docs/design/proposals/emblem-v2.svg (emblem) and emblem-v2-wall.svg (3×3).
import { Delaunay } from 'd3-delaunay';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { A, PERIOD, Q, S, STAR, turn } from '../../docs/design/proposals/rosette.mjs';

const U = 100; // geometry units → SVG px
const e = A - S;
const petal = [[Q, 0], [1, Q - 1], [1, 1], [e, e], [A, e], [A, 1]];
const connector = [[Q, 0], [A, 1], [2 * A - Q, 0], [A, -1]];
const square = [[A - S, A - S], [A + S, A - S], [A + S, A + S], [A - S, A + S]];

function emblemPieces() {
  const pieces = [{ kind: 'star', points: STAR }];
  for (let n = 0; n < 4; n += 1) {
    pieces.push({ kind: 'ivory', points: petal.map((p) => turn(p, n)) });
    pieces.push({ kind: 'ivory', points: petal.map(([x, y]) => turn([y, x], n)) });
    pieces.push({ kind: n % 2 ? 'blue' : 'teal', points: connector.map((p) => turn(p, n)) });
    pieces.push({ kind: 'corner', points: square.map((p) => turn(p, n)) });
  }
  return pieces;
}

const palettes = {
  star: ['#0a4c52', '#0d5f60', '#08434a', '#106b6a', '#0b5559'],
  teal: ['#0e6b6a', '#127572', '#14807c', '#0d5f60', '#17807c'],
  blue: ['#123785', '#16409a', '#0e3076', '#1c4fae', '#0b2a66'],
  corner: ['#123785', '#16409a', '#0e3076', '#1c4fae', '#0b2a66'],
  ivory: ['#f4eedf', '#ece3cc', '#f8f3e6', '#e6dbc0', '#efe7d4'],
};
const glints = { star: '#2fa39d', teal: '#4cbcb3', blue: '#3a70d0', corner: '#3a70d0', ivory: '#ffffff' };

let seed = 13;
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const fmt = (points) => points.map(([x, y]) => `${(x * U).toFixed(1)} ${(y * U).toFixed(1)}`).join('L');
let clipId = 0;

/** One piece: low-poly gem facets clipped to its outline, set in a brass rim. */
function gem({ kind, points }, { scale = 1, rim = true } = {}) {
  const id = `p${(clipId += 1)}`;
  const xs = points.map((p) => p[0]), ys = points.map((p) => p[1]);
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const cloud = [...points, [(x0 + x1) / 2, (y0 + y1) / 2]];
  const extra = Math.max(2, Math.round((x1 - x0) * (y1 - y0) * 5));
  for (let i = 0; i < extra; i += 1) cloud.push([x0 + rnd() * (x1 - x0), y0 + rnd() * (y1 - y0)]);
  const tri = Delaunay.from(cloud).triangles;
  let facets = '';
  for (let i = 0; i < tri.length; i += 3) {
    const t = [cloud[tri[i]], cloud[tri[i + 1]], cloud[tri[i + 2]]];
    // Light from the upper left: facets there catch more glints.
    const lift = 0.5 - (t[0][0] + t[1][0] + t[2][0] + t[0][1] + t[1][1] + t[2][1]) / 6 / (2 * A);
    const tone = rnd() < 0.08 + Math.max(0, lift) * 0.3 ? glints[kind] : palettes[kind][Math.floor(rnd() * palettes[kind].length)];
    facets += `<path d="M${fmt(t)}Z" fill="${tone}" stroke="${tone}" stroke-width=".8"/>`;
  }
  const d = `M${fmt(points)}Z`;
  const w = 7 * scale;
  return `<clipPath id="${id}"><path d="${d}"/></clipPath><g clip-path="url(#${id})">${facets}<path d="${d}" fill="url(#sheen)"/></g>`
    + (rim ? `<path d="${d}" fill="none" stroke="#7a521a" stroke-width="${w + 2 * scale}" stroke-linejoin="round"/><path d="${d}" fill="none" stroke="url(#brass)" stroke-width="${w}" stroke-linejoin="round"/>` : '');
}

/** The corner square holds the cell again at the recursion scale, with a fine rim. */
function corner(piece) {
  const [cx, cy] = [piece.points.reduce((s, p) => s + p[0], 0) / 4, piece.points.reduce((s, p) => s + p[1], 0) / 4];
  const k = (2 * S) / PERIOD;
  const id = `c${(clipId += 1)}`;
  let mini = '';
  for (let row = -1; row <= 1; row += 1) {
    for (let col = -1; col <= 1; col += 1) {
      for (const p of emblemPieces()) {
        const points = p.points.map(([x, y]) => [cx + (x + col * PERIOD) * k, cy + (y + row * PERIOD) * k]);
        const d = `M${fmt(points)}Z`;
        const fill = { star: '#0d5f60', ivory: '#e9dfc6', teal: '#127572', blue: '#16409a', corner: '#0e3076' }[p.kind];
        mini += `<path d="${d}" fill="${fill}" stroke="#d6a44c" stroke-width="1.1" stroke-linejoin="round"/>`;
      }
    }
  }
  const d = `M${fmt(piece.points)}Z`;
  return `<clipPath id="${id}"><path d="${d}"/></clipPath><g clip-path="url(#${id})"><path d="${d}" fill="#0e3076"/>${mini}<path d="${d}" fill="url(#sheen)"/></g>`
    + `<path d="${d}" fill="none" stroke="#7a521a" stroke-width="9" stroke-linejoin="round"/><path d="${d}" fill="none" stroke="url(#brass)" stroke-width="7" stroke-linejoin="round"/>`;
}

const defs = `<defs>
<linearGradient id="brass" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#f6d68c"/><stop offset=".3" stop-color="#c9963f"/><stop offset=".55" stop-color="#ecc879"/><stop offset="1" stop-color="#8f6522"/></linearGradient>
<linearGradient id="sheen" x1="0" y1="0" x2=".7" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".32"/><stop offset=".45" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".16"/></linearGradient>
</defs>`;

function emblemBody(dx = 0, dy = 0) {
  return `<g transform="translate(${dx * U} ${dy * U})">${emblemPieces().map((p) => (p.kind === 'corner' ? corner(p) : gem(p))).join('')}</g>`;
}

const R = (2 * A - Q + 0.06) * U;
const emblem = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${-R} ${-R} ${2 * R} ${2 * R}" role="img" aria-label="Zellige">${defs}${emblemBody()}</svg>`;
// Emblems one period apart: points and corner squares coincide, so the wall has no gaps.
let wall = '';
for (let row = -1; row <= 1; row += 1) for (let col = -1; col <= 1; col += 1) wall += emblemBody(col * PERIOD, row * PERIOD);
const W = 1.5 * PERIOD * U;
const wallSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${-W} ${-W} ${2 * W} ${2 * W}">${defs}<rect x="${-W}" y="${-W}" width="${2 * W}" height="${2 * W}" fill="#0b1d29"/>${wall}</svg>`;

const dir = fileURLToPath(new URL('../../docs/design/proposals/', import.meta.url));
writeFileSync(`${dir}emblem-v2.svg`, emblem);
writeFileSync(`${dir}emblem-v2-wall.svg`, wallSvg);
console.log(`emblem-v2.svg ${emblem.length} B, emblem-v2-wall.svg ${wallSvg.length} B`);
