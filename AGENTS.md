# Aeon's End Digital — Agent Entry Guide

This file is the short entry point for coding agents. Read the documents below
before making changes; do not duplicate their detailed rules here.

## Required reading

1. `README.md` — project scope, commands, structure, and user-facing shortcuts.
2. `dev-guide.md` — engine/UI boundary, file map, typed effects, data workflow,
   debugging, and test expectations.
3. `ui/ui-guide.md` — the single UI source of truth for components, states,
   dimensions, responsive layout, z-index, interactions, Gallery, and visual
   regression.
4. `design/wave9-plan.md` — current Wave9 scope and development order.
5. `documents/wave9/collection-summary.md` and the relevant Wave9 subfolder —
   collected card, Mage, Nemesis, and errata data before implementing content.
6. `documents/current-development-handoff.md` — current implementation baseline,
   recent Played Zone fixes, validation commands, and handoff notes for continuing work.

For a specific Wave or card, read the matching document under `documents/` and
the corresponding engine data/test files before editing code.

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

## Common commands

```powershell
cd aeons-end-engine
npm test

cd ..\aeons-end-ui
npm run dev
npm run build
npm run test:e2e
```

For UI-specific conventions, use `ui/ui-guide.md` rather than adding another
parallel UI rule document.
