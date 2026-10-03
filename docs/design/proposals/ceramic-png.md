# Ceramic PNG — 2026-10-02

## Selected output prompt

> Use case: sketch-to-render.
> Render image 1 in the rich glazed ceramic style of image 2.
> Image 1 is a precise 1254 × 1254 pixel geometric texture. KEEP ITS LAYOUT EXACTLY: do not move, resize, crop, rotate, split or add any polygon, including the little blue corner motifs. Keep the same canvas and every boundary intersection. Opposite edges of this layout already align for repeating, so absolutely no reframing or extra margin.
> Image 2 is ONLY the material reference: deep teal and cobalt blue mottled glaze, warm ivory ceramic, fine crazing, shallow beveled edges and thin gold joints. Apply those surface materials to the corresponding colored pieces of image 1. Keep image 1's small corner motif blue and teal, not ivory.
> Perfect front-on orthographic material texture, full bleed, uniform lighting. Opaque PNG. No mist, vignette, edge fade, frame, text, perspective or extra ornaments. Preserve the exact flat diagram geometry; change only its surface from flat color to dimensional glazed ceramic. The gold joins follow the existing thin outlines and never create additional divisions.

## Asset notes

The user approved the composition but requested the same motif as a PNG with
the original emblem's glazed ceramic finish, not a visible vector guide.

- Final reusable asset: `marketing/images/zellige-rosette-ceramic-v1.png`.
- Format: 1254 × 1254 RGBA PNG; two by two large motifs, like the SVG.
- Browser pixel inspection found partial alpha (minimum 215/255), despite the
  opaque-output prompt. The landing renders it over the same graphite surface
  in every treatment. Do not describe the exported file as fully opaque.
- Final geometry reference: `ceramic-png-geometry.png`, a native 1254px render
  of the SVG study, rather than the earlier 1200px preview.
- Material reference: `web/public/brand/zellige-emblem.png`, unchanged.
- Generated with the built-in image tool; not a rasterized SVG or CSS noise pass.
- First output was rejected for pale/faded edges; the second for a repeat-phase
  mismatch. The third was rejected because it deformed connector diamonds.
  The selected fourth output uses a fresh native-resolution guide and the
  original emblem, not the rejected geometry. Repeated use was checked visually
  in Chromium at the landing's display scale, with no large geometric step.
- Landing CSS uses the PNG for all three decorative treatments at the existing
  scales. No separate grain overlay is applied. The SVG remains an authoring
  reference and is not packaged as the landing's visible artwork.
- PNG generation can move boundaries and change texture. The vector geometry
  tests certify the guide, **not** pixel-exact PNG geometry or texture seams.
  Do not describe this raster as mathematically certified seamless.

## Initial prompt (rejected output)

> Use case: sketch-to-render / precise-object-edit.
> Asset type: reusable PNG ceramic mosaic texture for the Zellige landing page.
> Image 1 is the EXACT EDIT TARGET and geometry master: a square field with two by two large teal eight-point stars, ivory interlocking petals, teal horizontal diamonds, cobalt vertical diamonds, and small blue square junctions containing a subordinate miniature repeat of the same motif.
> Image 2 is the ORIGINAL BRAND EMBLEM, MATERIAL AND FINISH REFERENCE ONLY.
> Primary request: render Image 1 as sumptuous glazed ceramic in precisely Image 2's style. Change ONLY the surface treatment, relief and material lighting of Image 1. Preserve its exact composition, framing, piece silhouettes, count, positions, proportions, color assignments, small-scale corner motif and all meeting vertices. Do NOT copy the isolated silhouette or arrangement of Image 2.
> Materials: deep mineral teal and lapis/cobalt blue glaze with rich natural mottling and fine hairline craquelure; warm ivory ceramic petals; thin polished brass/gold shared joints with shallow beveled glazed edges. Match the dimensional ceramic richness and restrained realistic highlights of the original emblem, not flat vector colors, a generic noise overlay, cloth, paper, plastic or a sketch.
> Geometry invariants: four LARGE eight-point teal stars in the same 2 by 2 arrangement; the SAME eight irregular ivory petals around each, without extra internal cuts; blue and teal connectors remain single diamond pieces; the small blue square junctions keep their existing miniature blue/teal rosette tessellation, visibly subordinate. Every piece shares one thin gold joint with its neighbor: no overlapping tiles, no double outlines, no floating pieces, no black voids. Gold hairline glaze cracks are allowed but must not become new polygon divisions.
> View: perfectly front-facing orthographic, square, no perspective, full bleed to all four edges. Keep identical edge phase/cropping from Image 1 so opposite edges join when the image is repeated in a grid. Uniform diffuse light; no global vignette or lighting gradient; no cast shadows outside the tile plane. Seamless continuation left/right and top/bottom, including glaze texture where feasible.
> Output ONE finished high-resolution square PNG, preferably 2048 x 2048. No border, frame, captions, text, mascot, typography, webpage, mockup or extra ornaments. This is a material render of the exact supplied geometry, NOT a redesign.

## Targeted edge correction (also superseded)

> Use case: precise-object-edit.
> Image 1 is the EDIT TARGET: keep its exact mosaic geometry and rich ceramic/glaze/gold style.
> Image 2 is the geometry reference, including the exact matching left-right and top-bottom crop boundaries.
> Fix ONLY the pale gray cloudy haze / faded vignette / dithered transparent-looking areas on the outer edges and especially the four corners of Image 1. Replace those with fully opaque, clean, saturated ceramic continued naturally from the interior: cobalt and teal mosaic pieces, ivory ceramic, and thin gold joints must remain equally sharp and richly colored from the center to the absolute edge. Restore the miniature rosette pattern in the blue square junction pieces all the way to edges and corners as shown in Image 2. No extra lighting bloom, mist, dust, fog, fading, transparency, gray background, vignette, border, or edge highlight band.
> Preserve the EXACT four large stars, eight ivory petals, diamond connectors, miniature blue corner motifs, their locations, silhouettes and proportions. Do not add, remove or resize any piece. Keep blue/teal/ivory/gold and original dimensional glazed ceramic look with fine crackle. Orthographic, full bleed square 2 by 2 repeat, NO perspective. Match corresponding geometry at opposite edges. Uniform illumination across entire image suitable for seamless tiled repetition in a website. Output one fully opaque finished PNG of the same composition. No text, typography, UI, logo wordmark, or watermark.
