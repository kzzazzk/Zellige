# Conversation app

Mode: Operate. Scope: `web/src/App.tsx` and its conversation components.
The user approved evolving the existing console into a T3 Code-like app with
shadcn components, real API operations and secondary technical details.

## Direction contract

THESIS: Keep the conversation central; navigation and execution profiles must
not divide canonical history into provider-specific products.

OWN-WORLD: T3 Code informs the compact shadcn/Base UI shell. The user's supplied
mascot board defines the identity: navy and teal, ivory, restrained brass, and
a ceramic companion welcoming users without suggesting real agent activity.

STORY: Connect once per tab, find or create a conversation, save messages,
branch deliberately, and inspect queued executions without claiming they ran.

FIRST VIEWPORT: A 256px desktop sidebar, a compact header with branch selection,
readable central history and a bottom composer. On mobile the sidebar becomes
a drawer; the message and save action remain the main task.

FORM: User-pinned application shell, implemented directly from the existing
React/Vite app; reusable transparent brand artwork is documented in
`brand-assets.md`. Signature
interaction: editing appends on a new branch and preserves the original.

FINISH: unreviewed and undocumented is unfinished; this build ends with the
finish review, the verdict, DESIGN.md, and every shipping raster carrying its
provenance.
