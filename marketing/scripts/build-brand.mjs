// Regenerates every derived brand asset from the standard emblem
// (web/public/brand/zellige-emblem.png). Run `npm run brand` in marketing/ after
// changing the emblem or Zel's face; never edit these outputs by hand.
//   web/public/brand/zel/zel-<mood>.png   Zel (emblem + face), one per mood, 1254 px
//   marketing/src/assets/emblem.webp       landing emblem, 320 px
//   marketing/public/favicon.png           landing favicon, 64 px
// (The emblem layers come from build-layers.mjs, which `npm run brand` runs first.)
import { mkdir, rm } from 'node:fs/promises';
import sharp from 'sharp';
import { fileURLToPath } from 'node:url';

const path = (relative) => fileURLToPath(new URL(relative, import.meta.url));
const emblem = path('../../web/public/brand/zellige-emblem.png');
const { faces } = await import(path('../.brand/brand-entry.js'));

await mkdir(path('../../web/public/brand/zel'), { recursive: true });
for (const [mood, svg] of Object.entries(faces())) {
  const out = path(`../../web/public/brand/zel/zel-${mood}.png`);
  await sharp(emblem).resize(1254, 1254).composite([{ input: Buffer.from(svg) }]).png({ compressionLevel: 9 }).toFile(out);
  console.log(`zel-${mood}.png`);
}
await sharp(emblem).resize(320).webp({ quality: 90 }).toFile(path('../src/assets/emblem.webp'));
await sharp(emblem).resize(64).png().toFile(path('../public/favicon.png'));
await rm(path('../.brand'), { recursive: true, force: true });
console.log('emblem.webp, favicon.png');
