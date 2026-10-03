# Zellige — ceramic identity, Buzz-inspired composition

Current direction: the user's North African zellige identity **and** the scale,
open composition and restrained motion of [Buzz](https://buzz.xyz/). These are
complementary requirements, not competing directions. The user explicitly requested
no Impeccable workflow. Marketing is independent of the chat app; do not add links
to the development site, GitHub, or a login. No application preview. Since
2026-10-03 the companion mascot, **Zel**, appears in the hero, at the user's request.

## Responsibilities

The landing is a Vite + React app (`marketing/`) styled with Tailwind v4 and
shadcn components, sharing the pilot's brand tokens. The build prerenders static
HTML and hydrates it; everything ships under the existing CSP (`'self'` only).

- `marketing/src/components/`: `Header`, `Hero` (moodboard wordmark, horseshoe arch
  onto the ceramic mosaic, companion stepping out of it), `Sections` (manifesto,
  assembling panorama, branch diagram with native disclosures, project band) and
  `Footer`. `ui/` holds shadcn components.
- `marketing/src/components/Companion.tsx`: Zel, the mascot, with eight expressions
  (`hello`, `look`, `thinking`, `excited`, `curious`, `focused`, `wink`, `content`).
  The face is redrawn in SVG over the original artwork, so it blinks and its open
  eyes can follow the pointer. `Guide.tsx` is the small companion that accompanies
  the reader between hero and footer, changing mood and line per section.
- Narrative: zellige is a tile made of many small stones; each stone is a way of
  using AI. `Trio.tsx` draws three stones (personal agents, chat managers and
  meta-harnesses, chat) as thirds of a twelve-point star around the companion.
  The hero assembles it once on load (CSS only); `Story.tsx` (section 01) brings in
  one stone per scroll step while the companion changes mood. Without JS or with
  reduced motion the tile is shown assembled and the steps read as a list. The
  arch survives only as a faint outline behind the hero tile.
- Hero (2026-10-03, "direction 1"): centred like the emblem — wordmark, Zel, one
  line, one button. The emblem's layers fly in from beyond the screen and lock
  around Zel; pointing at a layer lifts it and names it (no permanent labels);
  scrolling away lets the layers fall and fade toward section 01. The dictionary
  entry for "zellige" lives in section 01.
- Languages: `/es/` and `/en/` are prerendered; `/` serves Spanish without JS and
  `public/locale.js` sends it to the browser's language. No language switcher.
- Zellige ornament is reserved for brand moments (wordmark, arch, mosaic, logo,
  mascot). Buttons and UI components stay plain and modern.
- `marketing/src/gl/CeramicGlaze.tsx`: WebGL2 glaze highlight over the approved
  ceramic artwork, following the pointer. It never redraws the pattern; without
  WebGL the same artwork shows as a CSS background.
- `marketing/src/assets/zellige-wordmark.svg`: the moodboard wordmark drawn as
  geometry (circular e/g, stepped l-l-i with star dots, faceted navy glaze).
  Regenerate with `node scripts/build-wordmark.mjs` in `marketing/`.
- `marketing/src/assets/{ceramic,emblem}.webp`: web-sized copies of
  `marketing/images/zellige-rosette-ceramic-v1.png` and the pilot's brand PNGs.
- `marketing/images/`: source artwork. `zellige-rosette-ceramic-v1.png` is the
  approved mosaic ([prompts](proposals/ceramic-png.md)); `zellige-rosette-v2.svg`,
  `ceramic-grain.png` and `zellige-mosaic.png` are superseded studies, never
  published.
- `marketing/public/fonts/`: local Onest and Cormorant Garamond with SIL OFL licenses.
- `tests/marketing.test.mjs`: checks the prerendered build: private-link isolation,
  local assets only, no inline scripts/styles/data URIs, section targets, contrast
  and brand art.
- `tests/pattern-geometry.test.mjs`: coverage, non-overlap, periodic boundary
  matching, recursive containment and bounded SVG size.
- `deploy/build-marketing.mjs`: eleven explicit public files; no pilot or private
  repository material is bundled.
- `compose.lab.yaml`: pilot service plus an optional local marketing fallback.
  This design iteration did not change containers, DNS or production deployments.

The earlier `marketing/DESIGN.md`, its sidecar, and `marketing-review.md` describe
older iterations; they are not current acceptance reports for this design.
Root `DESIGN.md` continues to concern the conversation app only.

## Current composition — 2026-10-02 (evening)

Feedback: the landing felt too basic and too close to a generic editorial
template. The Buzz scale stays, but the ceramic identity now leads:

- Hero: wordmark and copy beside a horseshoe arch (inline SVG) filled with the
  ceramic PNG, a navy frame, brass seams and an alfiz. Three loose tiles drift
  on scroll. The dot grid became a brass eight-point-star lattice (`--lattice`).
- Seams: a brass hairline with a star joins hero and manifesto; open details,
  links and numbering use brass. Monospace eyebrows were replaced by Onest caps.
- Panorama: `landing.js` splits the mosaic into loose pieces that settle into
  one seamless surface as it scrolls in ("distintas piezas, una misma
  historia"). Without JS or with reduced motion it renders whole.
- Branches: an inline SVG of ceramic tiles shows a history and a branch,
  replacing the four-tile study and several redundant slogans.
- Project: the one night-blue band, edged with a ceramic strip, lists what
  exists today and what is still missing (agents).
- Body copy is 15–17px instead of 9–13px.

The ceramic PNG is referenced once through the `--ceramic` token and once by the
inline SVG `<pattern>`. Tests cover that token and night-band contrast.

## Earlier verification — 2026-10-02

Latest palette decision: after the blue/teal and graphite trials, the user asked
to return to white. Page surfaces are ivory again, with dark ink/teal text and
contrast-adjusted brass details. The PNG has partial alpha, so its dedicated
ceramic underlay remains unchanged to preserve the rendered artwork colors.
The layout, typography, motion and original logo are unchanged.
The user approved the design, but asked for the same pattern
as a PNG in the original emblem's ceramic style. The landing now consumes that
PNG, without the former CSS grain overlays. The guide remains vector-based; its
geometry tests do not certify pixel-exact geometry or texture seams in generated
artwork. Interface accents have separate tokens from the tile colors.

The reference was inspected in Chromium at 1440px, and its published HTML/CSS/JS
were read. The former serif headline plus boxed photo was replaced by a large
wordmark, a lighter header, floating ceramic pieces, an uninterrupted mosaic
section and a larger closing mark. The brand palette, original emblem, internal
links and honest project status remain. No Buzz assets or copy were reused.

The redesign guide was used to audit and improve the existing HTML/CSS rather
than changing framework; the user's multi-color identity takes precedence over
generic palette advice. No Impeccable workflow was used.

Local build and 24 marketing/packaging/geometry tests passed, including PNG asset,
text and control contrast checks for the light palette. Earlier Chromium checks at
1440px, 390px and 320px found no horizontal overflow. Font loading and reached
lazy images passed. Reduced motion yields zero animations and zero hidden reveal
elements. The short decorative animation ends within five seconds; there is no
continuous motion. After local verification, the user explicitly requested
publication: the ivory/ceramic-PNG version was manually deployed to
<https://zellige.dev> on 2026-10-02. All eleven public files match the local
artifact byte-for-byte. No commit or push was made. The pilot and canonical
emblem file are untouched. See [deployment status](../deployment/vercel.md).

```sh
node --test --test-isolation=none tests/marketing.test.mjs tests/marketing-build.test.mjs tests/pattern-geometry.test.mjs
node deploy/build-marketing.mjs
python3 -m http.server 18790 --bind 127.0.0.1 --directory .output/marketing/.vercel/output/static
```

## Historical pattern provenance — earlier, rejected proportions

Generated on 2026-10-02 using the built-in image tool. References: the existing
standard emblem `web/public/brand/zellige-emblem.png` and the user's original
non-mascot identity board. Saved as a project-owned asset; no remote dependency.
The original generated output is preserved under the tool's generated-images
directory. Existing brand assets and the chat UI are not changed.

Original generation prompt (superseded corner geometry):

> Use case: stylized-concept. Asset type: reusable square ceramic mosaic pattern texture for the Zellige website, no UI. Input image 1: standard Zellige emblem, reference for exact geometric family, palette and ceramic material. Input image 2: supplied original brand moodboard, especially its tiled mosaic swatches and tiled backdrop, reference for the interlocking repeating pattern. Generate ONE full-bleed square orthographic straight-on field of interlocking North African zellige tiles. A sophisticated precise repeating tessellation of large deep-teal eight-point stars, cobalt/navy diamond and square tiles, and warm ivory kite/petal shapes, separated by thin muted brass-gold joints, matching the standard emblem. Three to four repeats across the entire image, uniform scale; all pieces fit together edge-to-edge with no empty background. A real glazed ceramic surface: rich subtly mottled mineral glaze, fine gentle crazing, slightly irregular handmade edges, restrained soft grazing light and tiny bevels, not a flat vector drawing, not plastic or metallic tiles. Clean coherent geometry, quiet natural material, luxurious rather than ornate. Even lighting throughout, no vignette or cast object shadows. Seamless tileable left/right and top/bottom edges if possible. Sharp enough for a large website surface; 2048 by 2048 square. No writing, words, letters, typography, logos floating above it, mascot, face, people, UI, border or separate objects. This is original pattern artwork inspired by the provided geometry, not a historical artifact or photograph.

## Corner repair — 2026-10-02

The previous raster overlapped corner pieces inside the artwork; CSS repetition
was not the cause. The replacement shares one complete cobalt square between
neighboring rosettes. It retains the teal eight-point stars, eight ivory petals,
blue/teal diamonds, glazed ceramic and gold joints. The standard emblem file,
landing layout and pilot are unchanged.

`pattern-geometry.html` is the reusable authoring guide, not a public website
asset. It constructs a periodic planar cell of side `2 + 2√2`: star, eight petals,
shared diamonds and blue corner squares. An independent polygon-intersection
check found no positive-area overlaps, and the pieces cover the cell's full area
`(2 + 2√2)²`. The final raster follows a 3×3 rendering of this guide, with blue
vertical diamonds and teal horizontal diamonds. This validates the construction,
not pixel-exact texture continuity across the generated image's outer edges.

Final art was edited with the built-in image tool, using the geometry guide,
previous ceramic artwork and unchanged standard emblem as references. The
generated output `exec-3fddecb9-8ab1-41e4-8808-1c1b5b7cd8ca.png` replaces
`marketing/images/zellige-mosaic.png`. Both the original and generated versions
remain in the image tool's output directories. Visual inspection confirmed clean
internal joins; the 11 landing/packaging checks pass but do not measure geometry.
The local marketing container was rebuilt in isolation; its served PNG matches
the source SHA-256. Desktop (1440px), mobile (390px) and a 3×3 browser-repeat
preview were visually checked. The pilot kept the same container ID and start
time, and the emblem retained its original SHA-256. No Vercel/DNS changes,
commits or pushes were made as part of this pattern repair.

Final editing prompt:

> Use case: sketch-to-render / precise-object-edit.
> We are repairing the overlapping corner joins in an existing Zellige brand mosaic, NOT redesigning the identity.
> Image 1: exact corrected planar geometry GUIDE and edit target. Keep EVERY polygon boundary, shape, position and relative size in image 1. This is a rigorously edge-sharing mosaic with no overlaps. The large blue squares at the junctions are single shared corner tiles, never four overlapping stamped logo corners. Do not divide these squares, add internal geometric seams, or reintroduce the faulty joins.
> Image 2: ORIGINAL existing mosaic, MATERIAL AND FINISH REFERENCE ONLY. Transfer its beautiful rich glazed ceramic, natural mottling, fine irregular crazing, shallow bevels and golden joints onto image 1's exact shapes. Do not transfer image 2's geometry errors or its staggered arrangement.
> Image 3: original Zellige emblem, identity and material reference only; do not modify or show it separately.
> Primary request: render image 1 in the exact ceramic look of images 2 and 3. Preserve deep teal eight-point stars, eight ivory kite/petal pieces around every star, complete cobalt/navy blue squares at the corner junctions, blue vertical diamonds and teal horizontal diamonds. Every one of those motifs is essential. Single thin continuous gold shared joints, no doubled frames, no layering, no tile overlaps, no clipped or stacked squares. This corrected regular arrangement lets the original pieces fit together; it should still unmistakably belong to the same logo.
> Full-bleed square orthographic ceramic surface, exactly the same 3 by 3 layout as image 1, no perspective. Deep mineral blue, rich dark teal, warm ivory; restrained fine gold boundaries. Slight physical bevels, beautiful realistic glaze, modest fine crackle, even diffuse lighting. Preserve the exact sharp silhouettes and meeting vertices of image 1 under the texture. Align all opposite edges for a repeatable texture. No flat vector look in the final artwork.
> No extra decorations, diagonal cuts across square tiles, invented shapes, text, labels, watermark, mascot, frame, vignette, or black voids. Return ONE finished ceramic artwork.
