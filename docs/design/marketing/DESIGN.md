---
name: Zellige marketing landing
description: Implemented visual tokens for the static marketing surface only.
colors:
  teal: "#0a5057"
  atlas: "#0e6b6a"
  ivory: "#f8f6ef"
  blue: "#0f3b6e"
  gold: "#c9a962"
  ink: "#142d3e"
  muted: "#50646c"
  on-teal-muted: "#c4deda"
  line: "#d5d4c9"
typography:
  display:
    fontFamily: "Onest, ui-sans-serif, system-ui, sans-serif"
    fontSize: "clamp(100px, 17.5vw, 280px)"
    fontWeight: 780
    lineHeight: 1.04
    letterSpacing: "-.04em"
  headline:
    fontFamily: "Onest, ui-sans-serif, system-ui, sans-serif"
    fontSize: "clamp(36px, 4.5vw, 64px)"
    fontWeight: 550
    lineHeight: 1.12
    letterSpacing: "-.035em"
  title:
    fontFamily: "Onest, ui-sans-serif, system-ui, sans-serif"
    fontSize: "23px"
    fontWeight: 550
    lineHeight: 1.3
    letterSpacing: "-.025em"
  body:
    fontFamily: "Onest, ui-sans-serif, system-ui, sans-serif"
    fontSize: "16px"
    fontWeight: 400
    lineHeight: 1.7
  label:
    fontFamily: "Onest, ui-sans-serif, system-ui, sans-serif"
    fontSize: "14px"
    fontWeight: 550
    lineHeight: 1.5
rounded:
  preview: "12px"
  preview-mobile: "6px"
  pill: "999px"
  circle: "50%"
spacing:
  gutter: "clamp(24px, 4vw, 64px)"
  compact: "12px"
  small: "16px"
  control: "20px"
  regular: "24px"
  navigation: "32px"
  mobile-section-gap: "36px"
  hero-gap: "40px"
  medium: "48px"
  large: "64px"
  mobile-section: "72px"
  section: "128px"
components:
  button-ivory:
    backgroundColor: "{colors.ivory}"
    textColor: "{colors.teal}"
    typography: "{typography.label}"
    rounded: "{rounded.pill}"
    padding: "12px 24px"
  button-ivory-hover:
    backgroundColor: "{colors.gold}"
  button-teal:
    backgroundColor: "{colors.teal}"
    textColor: "{colors.ivory}"
    typography: "{typography.label}"
    rounded: "{rounded.pill}"
    padding: "12px 24px"
  button-teal-hover:
    backgroundColor: "{colors.blue}"
  button-mobile:
    padding: "12px 20px"
---

# Design System: Zellige marketing landing

## Overview

**Creative North Star: "Zellige ceramic identity"**

This document describes only `marketing/index.html` and `marketing/styles.css`.
The supplied ceramic companion, teal and ivory palette, brass accents and bold
rounded lettering define this surface. Its composition follows the confirmed
[landing direction](../marketing.md).

The root [DESIGN.md](../../../DESIGN.md) and root `.impeccable/design.json`
continue to describe the conversation app. This scoped document and its
[sidecar](.impeccable/design.json) do not replace them or change runtime styles.

**Key Characteristics:**

- Oversized lowercase lettering with generous open space.
- Flat teal, ivory and brass fields with supplied ceramic imagery.
- Pill actions, visible keyboard focus and a single entrance sequence.

## Colors

Primary teal anchors the hero, footer and final action. Atlas supplies the scroll
control hover, while blue supplies the teal button hover. Secondary brass appears
in the invitation field, ivory button hover and text selection. Neutral ivory is
the reading surface and reversed text; ink is body text, muted is supporting text,
on-teal-muted is secondary reversed text, and line separates capability rows.
The frontmatter retains the CSS custom-property names and exact source values.

## Typography

Onest is a local variable font (`/fonts/onest-variable.ttf`, weights 100–900,
`font-display: swap`), with the sans fallbacks declared above. Display is the hero
wordmark; headline is the default section heading; title is the capability title;
body describes feature and invitation copy; label describes button text.

The hero wordmark becomes `16vw` at the tablet breakpoint and `23vw` with a 1.1
line height on mobile. The footer uses `clamp(88px, 25vw, 480px)`, weight 780,
line height 1.1 and tracking `-.04em`. Introductory body text is 18px/1.7, dropping
to 16px on mobile; supporting captions are 12px, or 11px for mobile captions.
These are role-specific sizes, not a mathematical type scale.

## Layout

Fluid gutters frame a 1200px product preview. The desktop hero uses a
`minmax(0, 2.4fr) minmax(250px, 1fr)` grid with a 40px gap and minimum height
`max(780px, 100svh)`. Capabilities use equal columns with a 100px gap. The
introductory heading is limited to 720px; its supporting text to 560px.

At 1000px and below, the hero uses a flexible column plus a 240px purpose column,
a 24px gap and minimum height `max(760px, 100svh)`; capabilities use a 48px gap.
At 700px and below, the hero stacks and centers, capabilities become one column,
the secondary navigation link hides, and section spacing contracts. At 1800px
and above, the hero content centers within 1660px. Exact media conditions are
recorded in the sidecar.

## Elevation & Depth

Large color fields remain flat. The static pilot screenshot alone has the
ambient shadow `0 24px 64px rgb(10 80 87 / .12)`. Depth in the ceramic imagery is
part of the supplied artwork, not a shared control shadow.

## Shapes

Buttons use the pill radius, the emblem link and scroll control are circular,
and the screenshot uses the preview radius with its smaller mobile counterpart.
Capability rows use thin straight separators. Preserve the supplied ceramic
silhouettes and their brass seams.

## Components

Buttons are anchors with centered text and an inline arrow, minimum height 48px,
and a 20px content gap, reduced to 12px on mobile. Ivory buttons sit on teal;
teal buttons sit on brass. Hover changes only the background color. Focus uses
a 3px outline offset by 6px: ivory for the ivory action and teal for the teal
action. Other links use `currentColor`. No custom disabled or active state is
implemented on these navigation actions.

Corner navigation uses the emblem and a secondary text link alongside the pilot
action. Text links underline on hover. The circular scroll link has a 48px
minimum target and an Atlas hover field. Capability rows remain open text blocks
with separators, not cards. The product preview is an unmodified static capture.

The wordmark and ceramic marks enter once; there is no loop or scroll-driven
animation. The sidecar preserves timing, easing, focus and reduced-motion rules.

## Do's and Don'ts

- Do retain the supplied ceramic assets and local Onest font.
- Do keep visible focus and respect reduced-motion preferences.
- Do document this landing separately from the conversation app.
- Don't apply the landing's wordmark scale or composition to app controls.
- Don't present the static product preview as an interactive interface.
- Don't introduce a new palette or looping decorative motion.
