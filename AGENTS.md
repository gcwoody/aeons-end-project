# Aeon's End Digital — Agent Entry Guide

This file is the short entry point for coding agents. Read the documents below
before making changes; do not duplicate their detailed rules here.

## Required reading

1. `README.md` — what the game currently includes and the common commands.
2. `dev-guide.md` — engine rules, typed effects, data workflow, and tests.
3. `game-rulings.md` — important rules and rulings that are easy to misimplement.
4. `ui/ui-guide.md` — the UI components, layout, interactions, and Gallery.
5. For a card or Mage change, read only its source entry under `documents/` and
   the matching engine data/tests. Read `documents/wave9/collection-summary.md`
   only when checking the full Wave 9 collection.
6. Read `design/wave9-plan.md` only when checking Wave 9 implementation status.
7. When continuing work across conversations, read `HANDOFF.md` for a short
   project snapshot; confirm details against the current code and guides.
8. For card-animation work, read the “卡牌动效结构” section in
   `ui/ui-guide.md` and inspect the matching modules under
   `aeons-end-ui/src/game/`. The current code and UI guide replace the old
   phase plans and reports as the implementation reference.

## Non-negotiable project rules

- All user-facing UI strings are English. Code identifiers and comments are
  English. Internal Markdown documentation may be Chinese.
- `aeons-end-engine/` is the shared pure TypeScript rule engine. It mutates one
  `GameState` in place; the Vue UI observes it through `reactive()`.
- `aeons-end-ui/` consumes the engine directly through the `@engine` alias.
  Do not copy rules into Vue components or change engine behavior to compensate
  for a UI problem.
- New card and Mage rules must use typed effects, triggers, and decisions.
  Add a reusable engine/UI primitive when the existing model cannot express a
  genuinely new mechanic; do not hard-code a single card ID into a generic path.
- Card movement visuals follow the shared event, policy, and queue structure in
  the UI guide; do not infer a moved card from pile-count changes or add a
  card-ID-specific route.

## Common commands

```powershell
cd aeons-end-engine
npm test

cd ..\aeons-end-ui
npx vue-tsc --noEmit
npm run dev
npm run build
npm run test:e2e -- --workers=2
npm run test:ui-gallery
```

For UI-specific conventions, use `ui/ui-guide.md` rather than adding another
parallel UI rule document.
