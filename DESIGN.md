---
name: Zellige conversation app
description: Compact shadcn/Base UI controls around portable conversation history.
colors:
  dark-background: "#09151d"
  dark-foreground: "#f8f6ef"
  dark-sidebar: "#061119"
  dark-popover: "#10232e"
  dark-primary: "#1d4d8f"
  dark-primary-foreground: "#f8f6ef"
  dark-muted-foreground: "#a0b6bf"
  dark-border: "#28404c"
  dark-ring: "#c9a962"
  dark-seam: "#a8894f"
  light-background: "#f8f6ef"
  light-foreground: "#142d3e"
  light-sidebar: "#eeeae0"
  light-primary: "#1d4d8f"
  light-primary-foreground: "#f8f6ef"
  light-muted-foreground: "#50646c"
  light-border: "#d5d4c9"
  light-seam: "#b08a4a"
typography:
  body:
    fontFamily: "Onest, ui-sans-serif, system-ui, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.428571
  message:
    fontFamily: "Onest, ui-sans-serif, system-ui, sans-serif"
    fontSize: "15px"
    fontWeight: 400
    lineHeight: 1.866667
  heading:
    fontFamily: "Onest, ui-sans-serif, system-ui, sans-serif"
    fontSize: "24px"
    fontWeight: 500
    lineHeight: 1.333333
  label:
    fontFamily: "Onest, ui-sans-serif, system-ui, sans-serif"
    fontSize: "12px"
    fontWeight: 500
rounded:
  sm: "6px"
  md: "8px"
  lg: "10px"
  xl: "12px"
spacing:
  tight: "8px"
  compact: "12px"
  normal: "16px"
  section: "24px"
components:
  primary-button-dark:
    backgroundColor: "{colors.dark-primary}"
    textColor: "{colors.dark-primary-foreground}"
    typography: "{typography.label}"
    rounded: "{rounded.md}"
    height: "28px"
  sidebar-dark:
    backgroundColor: "{colors.dark-sidebar}"
    textColor: "{colors.dark-foreground}"
    width: "256px"
---

# Zellige design system

## Overview

The interaction reference is T3 Code: a compact conversation workspace with
actual shadcn/Base UI primitives. The user's mascot moodboard defines the visual
identity. Marketing lives separately and shares the same brand assets.
The implemented source of truth is `web/src/styles.css` and `web/src/components/`.

## Colors

Deep navy surfaces separate navigation, history and composer. Cobalt marks
primary actions, teal selections, and brass focus/detail. Light mode uses ivory
and a darker brass for accessible text. Dark is the initial theme; Settings
offers light mode. Semantic CSS variables switch as a unit.
Destructive colors indicate errors, never ordinary emphasis. Brass seams
(`--seam`, `--seam-soft`) are the connective tissue: hairlines between
sidebar, header and history, the message rail, and the active conversation.

## Typography

Onest is served locally from `web/public/fonts/`, the same face as the landing
wordmark. Cormorant Garamond italic is reserved for one accent word in empty
states. Section labels use the brass `.eyebrow` style. Messages are 15px with
generous line height; navigation stays compact. Monospace belongs to JSON and
identifiers inside the optional inspector.

## Layout

The app fills the dynamic viewport. At 768px and above, navigation occupies a
fixed sidebar; below it, navigation moves into a left drawer. The header is 56px
high. History and composer share a centered 768px maximum width. History scrolls
independently; the composer remains at the bottom. Long titles truncate.

## Elevation & Depth

Main surfaces use tone and thin borders. The sidebar and the empty-state disc
carry the brass eight-point-star lattice (`.zellige-lattice`) at low opacity:
texture, not a gradient. Dialogs and menus use the provided shadcn overlay
treatments; do not introduce decorative gradients or glow.

## Shapes

Controls follow the compact base-mira primitives. The composer uses the largest
shared corner radius. Lucide supplies a consistent icon family.

## Components

Use `components/ui/` for buttons, inputs, selects, dialogs, menus and sheets.
Keep hover, disabled and visible-focus states. History reads as a seam of
pieces: a brass rail with a diamond node per message (filled for the
assistant), user text in a tinted bubble, assistant text unboxed. Conversations
use the `StarGlyph` icon, filled when active. The connected empty state offers
suggestion chips that only fill the draft. Message actions appear on hover
or keyboard focus on desktop and remain visible on small screens.
Edits create a new branch; drafts stay scoped to their conversation and branch.
Queued execution confirmation is a visible live status, not an assistant reply.
Reduced-motion preferences disable decorative transitions and animations.

## Do's and Don'ts

- Do keep conversation content central and diagnostics optional.
- Do preserve accessible names for icon-only actions.
- Do use semantic theme tokens instead of isolated hard-coded colors.
- Don't imply that a queued run has generated an answer.
- Don't replace this app shell with marketing layouts or nested dashboard cards.
