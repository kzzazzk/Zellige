// One-off correction of the standard emblem: its top point was glazed cobalt while
// the other three points are teal, which breaks the emblem's four-fold symmetry.
// Recolours that piece's glaze to match the teal points (per-channel colour
// transfer, so its own shading and texture are kept); gold rims are untouched.
// The original is kept at docs/design/proposals/zellige-emblem-original.png.
import { copyFile, access } from 'node:fs/promises';
import sharp from 'sharp';
import { fileURLToPath } from 'node:url';

const emblem = fileURLToPath(new URL('../../web/public/brand/zellige-emblem.png', import.meta.url));
const original = fileURLToPath(new URL('../../docs/design/proposals/zellige-emblem-original.png', import.meta.url));
// Always start from the untouched original, so the script can be re-run safely.
await access(original).catch(() => copyFile(emblem, original));

const { data, info } = await sharp(original).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
const { width: W, height: H } = info;
const N = W * H;
function hsv(k) {
  const i = k * 4, r = data[i], g = data[i + 1], b = data[i + 2];
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  let h = 0;
  if (d) h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [(h * 60 + 360) % 360, max ? d / max : 0];
}
const cobalt = (k) => { const [h, s] = hsv(k); return data[k * 4 + 3] > 40 && h >= 200 && h <= 250 && s > 0.3; };
const teal = (k) => { const [h, s] = hsv(k); return data[k * 4 + 3] > 40 && h >= 160 && h < 200 && s > 0.25; };

// The top point: cobalt connected to its middle, bridging thin crackle lines.
const top = new Uint8Array(N);
const stack = [Math.round(H * 0.17) * W + (W >> 1)];
if (!cobalt(stack[0])) throw new Error('Seed is not on the cobalt top point');
while (stack.length) {
  const k = stack.pop();
  if (top[k]) continue;
  top[k] = 1;
  const x = k % W, y = (k - x) / W;
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    for (let step = 1; step <= 5; step += 1) {
      const nx = x + dx * step, ny = y + dy * step;
      if (nx < 0 || ny < 0 || nx >= W || ny >= H) break;
      const n = ny * W + nx;
      if (cobalt(n)) { if (!top[n]) stack.push(n); break; }
    }
  }
}

// Reference glaze: the three teal points (teal outside the central star's disc).
const stats = (select) => {
  const sum = [0, 0, 0], sq = [0, 0, 0];
  let n = 0;
  for (let k = 0; k < N; k += 1) {
    if (!select(k)) continue;
    n += 1;
    for (let c = 0; c < 3; c += 1) { const v = data[k * 4 + c]; sum[c] += v; sq[c] += v * v; }
  }
  const mean = sum.map((s) => s / n);
  return { n, mean, std: sq.map((s, c) => Math.sqrt(s / n - mean[c] ** 2)) };
};
const from = stats((k) => top[k]);
const to = stats((k) => {
  const x = k % W, y = (k - x) / W;
  return teal(k) && Math.hypot(x - W / 2, y - H / 2) > W * 0.27;
});

const fixed = Buffer.from(data);
for (let k = 0; k < N; k += 1) {
  if (!top[k]) continue;
  for (let c = 0; c < 3; c += 1) {
    const v = (data[k * 4 + c] - from.mean[c]) / (from.std[c] || 1) * to.std[c] + to.mean[c];
    fixed[k * 4 + c] = Math.max(0, Math.min(255, Math.round(v)));
  }
}
await sharp(fixed, { raw: { width: W, height: H, channels: 4 } }).png().toFile(emblem);
console.log(`Recoloured ${from.n} px of the top point to the teal of ${to.n} px; wrote ${emblem}`);
