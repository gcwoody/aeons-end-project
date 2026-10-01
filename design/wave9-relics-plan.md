# Wave 9 Relics Implementation Plan

## Scope

Implement all ten Wave 9 Relics in the shared typed engine and Vue UI:
Chronoid, Omen Loop, Rift Ring, Tearstone Amulet, Thought Totem, Dreamer's
Crown, Stormspinner Wand, Pact Prism, Book of Before, and Visionary Staff.

## Phase 1 — Data and rules verification

1. Keep `documents/wave9/relics/relics.md` as the card text and image manifest.
2. Register every image and verify card IDs, costs, Develop costs, mechanics,
   and source sets against the collected wiki text.
3. Reuse existing typed primitives for Recall, Develop, Pulse tokens, Trinkets,
   turn-order reveal, charges, Aether tokens, and top-of-deck placement.

## Phase 2 — Typed engine primitives

1. Add an `attach` mechanic and a serializable attachment on each Breach that
   records the relic card and its owner.
2. Add typed effects for attaching a relic, losing all unspent Aether, and
   granting charges from qualifying cards in hand.
3. Add a reusable draw-then-discard selection effect. It draws first, exposes
   only the newly drawn cards as candidates, and carries a red-highlight hint
   to the UI.
4. Add a reusable Recall selection effect that can resolve a limited number of
   Recall blocks from any player's discard pile.

## Phase 3 — Lifecycle and rules integration

1. Move an attached relic out of `playedThisTurn`; it remains under its Breach
   through Draw Phases and is discarded to its owner if that Breach is
   destroyed.
2. Run attached-relic cast triggers when a spell is cast from the matching
   Breach, before the cast sequence continues.
3. Preserve normal cast, Recall, Develop, Trinket, and end-of-turn semantics.
4. Implement each card's effects using the typed vocabulary, including
   Dreamer's Crown's common/conditional/token Aether total and Stormspinner
   Wand's hand-cost charge calculation.

## Phase 4 — UI and interaction

1. Render an attached relic below its Breach token, aligned with prepped spell
   centers and below the Breach in stacking order.
2. Reuse existing Breach, card selection, optional choice, Recall, and large
   card preview components.
3. Render Visionary Staff's newly drawn hand cards with a red selection border
   and require an exact two-card confirmation.
4. Add any pending-decision labels and card previews needed for Attach and
   cross-player Recall without duplicating rule logic in Vue.

## Phase 5 — Registration and validation

1. Add a Wave 9 relic data file, imports, and market-card registry entries.
2. Add focused engine tests for attachment/discard lifecycle, unspent Aether,
   draw-then-discard, Recall limits, and the ten card definitions.
3. Run `npm test`, `npx vue-tsc --noEmit`, and `npm run build`; fix regressions
   without changing unrelated existing behavior.
