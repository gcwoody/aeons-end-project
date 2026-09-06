# Aeon's End Digital — Project Conventions (Global Config)

This file is the global config for AI coding agents working in this repository.
Read it before making changes.

## Language requirement (IMPORTANT)
- **All user-facing UI strings must be English** — buttons, labels, log messages,
  hints, overlays, card text. No Chinese in the UI.
- Code identifiers are English; **code comments must be English**.
- Internal markdown docs (this file, design/plan docs) may be Chinese; Chinese is
  allowed in docs only, never in UI or code.

## Project structure
- `aeons-end-engine/` — shared rule engine (pure TypeScript, no Node.js dependencies
  in `engine.ts`/`data.ts`/`types.ts`). It is consumed directly by the UI.
- `aeons-end-ui/` — Vue 3 + Vite frontend. Imports the engine source via the
  `@engine` alias → `../aeons-end-engine/src` (no copy, no duplication).
  Run: `cd aeons-end-ui && npm run dev` (dev server at http://localhost:5173).

## Engine rules to respect
- The engine mutates a single `GameState` object in place. The UI wraps it in Vue
  `reactive()` so mutations are tracked.
- The UI consumes the engine directly. Do NOT change engine behavior to fit the UI;
  fix the UI layer (composables/components) instead.

## UI conventions
- **Ctrl+Z** undoes the last user operation (max 5 steps, keyboard shortcut only, no button).
- **Ctrl+D** toggles the debug panel (edit HP/charge, add cards, toggle breaches, export/import JSON).
- The game **auto-saves** to localStorage; the Setup screen offers "Resume Game" when a save exists.
- A player turn **auto-ends** when the player has no legal actions — checked when the
  main phase begins and after every action.
- Aether is displayed as: total earned, available, regular vs conditional breakdown.
- Prep flow: click a spell card in hand, then click an open/focused breach.

## Developer map
- See `dev-guide.md` (file responsibilities, where to change features, debugging guide).

## Getting started
- Install: `cd aeons-end-ui && npm install`
- Dev server: `npm run dev`
- Build: `npm run build`
- Browser E2E: `npx playwright install chromium`, then `npm run test:e2e`
- Type-check via editor; `npm run build` uses Vite (no full type-check).
