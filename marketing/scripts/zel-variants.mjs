// Design exploration (not part of the build): several takes on Zel's personality,
// rendered from the corrected emblem into docs/design/proposals/zel-variants/.
import { mkdir } from 'node:fs/promises';
import sharp from 'sharp';
import { fileURLToPath } from 'node:url';

const path = (relative) => fileURLToPath(new URL(relative, import.meta.url));
const OUT = path('../../docs/design/proposals/zel-variants/');
const E = 1254; // emblem size
const C = 1400; // canvas, with room above for a crest
const OX = (C - E) / 2, OY = C - E - 40;
const TOP_Y = 470; // the top point lives above this line (emblem px)

async function raw(file) {
  const { data } = await sharp(file).resize(E, E).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return data;
}
const emblem = await raw(path('../../web/public/brand/zellige-emblem.png'));
const original = await raw(path('../../docs/design/proposals/zellige-emblem-original.png'));
const points = await raw(path('../src/assets/layer-points.webp'));

// Split the emblem: the body without its top point, and the top point alone (teal or cobalt).
function split(source) {
  const body = Buffer.from(emblem);
  const top = Buffer.alloc(E * E * 4);
  for (let y = 0; y < TOP_Y; y += 1) {
    for (let x = 0; x < E; x += 1) {
      const k = (y * E + x) * 4;
      if (points[k + 3] < 20) continue;
      top.set(source.subarray(k, k + 4), k);
      body[k + 3] = 0;
    }
  }
  return { body, top };
}
const png = (buffer) => sharp(buffer, { raw: { width: E, height: E, channels: 4 } }).png().toBuffer();
const tealParts = split(emblem);
const cobaltTop = await png(split(original).top);
const body = await png(tealParts.body);
const tealTop = await png(tealParts.top);

// --- SVG overlays, in canvas coordinates ------------------------------------
const cx = OX + 627, cy = OY + 627;
function face({ scale = 0.62, cheeks = false, brows = false, eyes = 'hello' } = {}) {
  const arc = (x) => `<path d="M${x - 44} 644Q${x} 578 ${x + 44} 644" fill="none" stroke="#f8f6ef" stroke-width="24" stroke-linecap="round"/>`;
  const open = (x) => `<ellipse cx="${x}" cy="622" rx="32" ry="44" fill="#f8f6ef"/><circle cx="${x + 10}" cy="606" r="11" fill="#fff"/>`;
  const eyeMarkup = eyes === 'open' ? open(521) + open(723) : arc(521) + arc(723);
  return `<defs><radialGradient id="f" cx="40%" cy="30%" r="75%"><stop offset="0" stop-color="#1a2433"/><stop offset=".55" stop-color="#05080d"/><stop offset="1" stop-color="#000"/></radialGradient></defs>
<g transform="translate(${cx} ${cy}) scale(${scale}) translate(-622 -634)">
<ellipse cx="622" cy="634" rx="206" ry="168" fill="#c9a962"/>
<ellipse cx="622" cy="634" rx="196" ry="158" fill="url(#f)"/>
<path d="M480 540Q540 488 640 486" fill="none" stroke="#fff" stroke-opacity=".55" stroke-width="16" stroke-linecap="round"/>
${eyeMarkup}
${cheeks ? '<ellipse cx="478" cy="700" rx="40" ry="20" fill="#e9876f" opacity=".55"/><ellipse cx="766" cy="700" rx="40" ry="20" fill="#e9876f" opacity=".55"/>' : ''}
${brows ? '<path d="M478 548Q521 526 562 546M682 546Q723 526 766 548" fill="none" stroke="#f8f6ef" stroke-width="14" stroke-linecap="round" opacity=".9"/>' : ''}
</g>`;
}
// Faceted four-point sparkle, like the stars on the wordmark.
function sparkle(x, y, r, tones = ['#2fa39d', '#0d5f60', '#17807c', '#0a4c52', '#14807c', '#08434a', '#3cb5ad', '#106b6a']) {
  const p = [[0, -1], [0.3, -0.3], [1, 0], [0.3, 0.3], [0, 1], [-0.3, 0.3], [-1, 0], [-0.3, -0.3]];
  return p.map(([a, b], i) => {
    const [c, d] = p[(i + 1) % 8];
    return `<path d="M${x} ${y}L${x + a * r} ${y + b * r}L${x + c * r} ${y + d * r}Z" fill="${tones[i]}"/>`;
  }).join('') + `<path d="M${x} ${y - r}L${x + 0.3 * r} ${y - 0.3 * r}L${x + r} ${y}L${x + 0.3 * r} ${y + 0.3 * r}L${x} ${y + r}L${x - 0.3 * r} ${y + 0.3 * r}L${x - r} ${y}L${x - 0.3 * r} ${y - 0.3 * r}Z" fill="none" stroke="#c9a962" stroke-width="${r * 0.05}" stroke-linejoin="round"/>`;
}
const gold = ['#f4d993', '#b8913f', '#d9b765', '#8f6a26', '#c9a24f', '#7d5c1f', '#e6c77c', '#a9843a'];
const cobalt = ['#3a70d0', '#123785', '#1c4fae', '#0b2a66', '#16409a', '#0e3076', '#5288e0', '#1a47a2'];
const svg = (inner) => Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${C}" height="${C}" viewBox="0 0 ${C} ${C}">${inner}</svg>`);
const sparkles = sparkle(OX + 1090, OY + 250, 70) + sparkle(OX + 170, OY + 980, 50) + sparkle(OX + 1150, OY + 1000, 34);

// Top point transforms: grow from its base (taller crest) and/or tilt (a wave).
// The piece is cropped to its box first; (BX, BY) is its base inside that crop.
const CROP = { left: 400, top: 0, width: 460, height: TOP_Y };
const BX = 627 - CROP.left, BY = 450;
async function topPiece(image, { grow = 1, tilt = 0 } = {}) {
  const w = Math.round(CROP.width * grow), h = Math.round(CROP.height * grow);
  let piece = await sharp(image).extract(CROP).resize(w, h).png().toBuffer();
  let left = OX + 627 - BX * grow, top = OY + 450 - BY * grow;
  if (tilt) {
    piece = await sharp(piece).rotate(tilt, { background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer();
    const meta = await sharp(piece).metadata();
    // Rotate about the base: rotate the base's offset from the crop centre.
    const bx = BX * grow - w / 2, by = BY * grow - h / 2, t = (tilt * Math.PI) / 180;
    const rx = bx * Math.cos(t) - by * Math.sin(t), ry = bx * Math.sin(t) + by * Math.cos(t);
    left = OX + 627 - (meta.width / 2 + rx);
    top = OY + 450 - (meta.height / 2 + ry);
  }
  return { input: piece, left: Math.round(left), top: Math.round(top) };
}

async function render(name, layers) {
  const out = `${OUT}${name}.png`;
  await sharp({ create: { width: C, height: C, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite(layers).png().toFile(out);
  return out;
}

await mkdir(OUT, { recursive: true });
const base = { input: body, left: OX, top: OY };
const variants = {
  'a-actual': [base, { input: tealTop, left: OX, top: OY }, { input: svg(face()), left: 0, top: 0 }],
  'b-expresivo': [base, { input: tealTop, left: OX, top: OY }, { input: svg(face({ scale: 0.76, cheeks: true, brows: true }) + sparkles), left: 0, top: 0 }],
  'c-tupe-azul': [base, await topPiece(cobaltTop, { grow: 1.12 }), { input: svg(face({ scale: 0.74, cheeks: true }) + sparkles), left: 0, top: 0 }],
  'd-saludo': [base, await topPiece(tealTop, { tilt: -18 }), { input: svg(face({ scale: 0.74, cheeks: true, eyes: 'open' }) + sparkles), left: 0, top: 0 }],
  'e-estrella-dorada': [base, { input: tealTop, left: OX, top: OY }, { input: svg(face({ scale: 0.74, brows: true }) + sparkle(OX + 627, OY - 10, 90, gold) + sparkle(OX + 760, OY + 90, 44, gold)), left: 0, top: 0 }],
  'f-tupe-y-estrella': [base, await topPiece(cobaltTop, { grow: 1.08, tilt: -10 }), { input: svg(face({ scale: 0.78, cheeks: true, brows: true, eyes: 'open' }) + sparkle(OX + 1030, OY + 150, 64, cobalt) + sparkle(OX + 200, OY + 980, 44)), left: 0, top: 0 }],
};
for (const [name, layers] of Object.entries(variants)) console.log(await render(name, layers));
