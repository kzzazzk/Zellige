// Splits the standard emblem (web/public/brand/zellige-emblem.png) into its colour
// layers, so the landing can assemble the logo around Zel layer by layer:
//   centre  — the teal eight-point star in the middle (Zel's face sits on it)
//   crown   — the eight ivory kites around it
//   cobalt  — the four blue corner squares
//   points  — the four outer teal points (see scripts/fix-emblem.mjs)
// Every layer keeps the emblem's own pixels and full canvas, so stacked they
// rebuild the logo exactly. Each gold rim goes to the nearest coloured piece, and
// the thin gold crackle lines inside pieces are smoothed into the glaze.
import sharp from 'sharp';
import { fileURLToPath } from 'node:url';

const source = fileURLToPath(new URL('../../web/public/brand/zellige-emblem.png', import.meta.url));
const out = (name) => fileURLToPath(new URL(`../src/assets/layer-${name}.webp`, import.meta.url));
const SIZE = 960;

const { data, info } = await sharp(source).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
const { width: W, height: H } = info;
const N = W * H;

function hsv(i) {
  const r = data[i], g = data[i + 1], b = data[i + 2];
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  let h = 0;
  if (d) h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [(h * 60 + 360) % 360, max ? d / max : 0, max / 255];
}

// 0 none/transparent, 1 cobalt, 2 teal, 3 ivory, 9 gold (rims and crackle)
const kind = new Uint8Array(N);
for (let k = 0; k < N; k += 1) {
  const i = k * 4;
  if (data[i + 3] < 40) continue;
  const [h, s, v] = hsv(i);
  if (s < 0.3 && v > 0.6) kind[k] = 3;
  else if (h >= 200 && h <= 250 && s > 0.3) kind[k] = 1;
  else if (h >= 160 && h < 200 && s > 0.25) kind[k] = 2;
  else kind[k] = 9;
}

// Opening (erode then dilate, radius 5): thin pale crackle lines and rim highlights
// look "ivory" by colour, but only real pieces survive being shrunk and regrown.
function grow(mask, radius) {
  const reach = new Uint8Array(N);
  let frontier = [];
  for (let k = 0; k < N; k += 1) if (mask[k]) { reach[k] = 1; frontier.push(k); }
  for (let step = 0; step < radius; step += 1) {
    const next = [];
    for (const k of frontier) {
      const x = k % W, y = (k - x) / W;
      for (const [nx, ny] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]]) {
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        const n = ny * W + nx;
        if (!reach[n]) { reach[n] = 1; next.push(n); }
      }
    }
    frontier = next;
  }
  return reach;
}
for (const id of [1, 2, 3]) {
  const mask = kind.map((value) => (value === id ? 1 : 0));
  const eroded = grow(mask.map((value) => 1 - value), 5).map((value) => 1 - value);
  const opened = grow(eroded, 5);
  for (let k = 0; k < N; k += 1) if (kind[k] === id && !opened[k]) kind[k] = 9;
}

// Layer ids: 1 centre, 2 crown, 3 cobalt, 4 points.
const layer = new Uint8Array(N);
// The centre star: teal connected to the middle, bridging crackle lines (≤5 px).
{
  const seen = new Uint8Array(N);
  const stack = [(H >> 1) * W + (W >> 1)];
  while (stack.length) {
    const k = stack.pop();
    if (seen[k]) continue;
    seen[k] = 1;
    layer[k] = 1;
    const x = k % W, y = (k - x) / W;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      for (let step = 1; step <= 5; step += 1) {
        const nx = x + dx * step, ny = y + dy * step;
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) break;
        const n = ny * W + nx;
        if (kind[n] === 2) { if (!seen[n]) stack.push(n); break; }
        if (kind[n] !== 9) break;
      }
    }
  }
}
for (let k = 0; k < N; k += 1) {
  if (layer[k]) continue;
  if (kind[k] === 3) layer[k] = 2;
  else if (kind[k] === 1) layer[k] = 3;
  else if (kind[k] === 2) layer[k] = 4;
}

// Gold pixels join the nearest coloured layer (multi-source BFS), and remember how far.
const dist = new Uint16Array(N).fill(65535);
let frontier = [];
for (let k = 0; k < N; k += 1) if (layer[k]) { dist[k] = 0; frontier.push(k); }
while (frontier.length) {
  const next = [];
  for (const k of frontier) {
    const x = k % W, y = (k - x) / W;
    for (const [nx, ny] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]]) {
      if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
      const n = ny * W + nx;
      if (kind[n] !== 9 || dist[n] !== 65535) continue;
      dist[n] = dist[k] + 1;
      layer[n] = layer[k];
      next.push(n);
    }
  }
  frontier = next;
}

// Crackle lines: thin gold runs with the same glaze on both sides. Paint them with
// the average of that glaze so the pieces read polished, not cracked.
const pixels = Buffer.from(data);
for (let k = 0; k < N; k += 1) {
  if (kind[k] !== 9 || !layer[k]) continue;
  const x = k % W, y = (k - x) / W;
  for (const [dx, dy] of [[1, 0], [0, 1], [1, 1], [1, -1]]) {
    let a = -1, b = -1;
    for (let step = 1; step <= 4 && (a < 0 || b < 0); step += 1) {
      const ax = x - dx * step, ay = y - dy * step, bx = x + dx * step, by = y + dy * step;
      if (a < 0 && ax >= 0 && ay >= 0 && ay < H && kind[ay * W + ax] !== 9) a = kind[ay * W + ax] && layer[ay * W + ax] === layer[k] ? ay * W + ax : -2;
      if (b < 0 && bx < W && by >= 0 && by < H && kind[by * W + bx] !== 9) b = kind[by * W + bx] && layer[by * W + bx] === layer[k] ? by * W + bx : -2;
    }
    if (a >= 0 && b >= 0) {
      for (let c = 0; c < 3; c += 1) pixels[k * 4 + c] = (data[a * 4 + c] + data[b * 4 + c]) >> 1;
      break;
    }
  }
}

const names = { 1: 'centre', 2: 'crown', 3: 'cobalt', 4: 'points' };
for (const [id, name] of Object.entries(names)) {
  const cut = Buffer.alloc(N * 4);
  for (let k = 0; k < N; k += 1) {
    if (layer[k] !== Number(id)) continue;
    cut.set(pixels.subarray(k * 4, k * 4 + 4), k * 4);
  }
  const meta = await sharp(cut, { raw: { width: W, height: H, channels: 4 } })
    .resize(SIZE, SIZE)
    .webp({ quality: 88, alphaQuality: 92 })
    .toFile(out(name));
  console.log(`${name}: ${meta.size} bytes`);
}
