# Wave 9 Gems Implementation Plan

## Goal

Implement the Wave 9 Gem supply cards and the reusable rules/UI they depend on: Pulse tokens, Recall, Develop, and Trinkets. Wave 9 Gems in scope are the five Beyond the Breach Gem sets, two The Surface Gem sets, and two The Returned Gem sets. Existing Crystal cards remain unchanged.

## Project constraints

- Put all game rules in `aeons-end-engine`; Vue components render engine state and dispatch actions.
- Express reusable mechanics with typed effects, triggers, and decisions. Do not add card-ID special cases to generic paths.
- Keep user-facing UI strings in English.
- Preserve new mechanics through save/load and validate both engine behavior and UI interactions.

## Phases

### 1. Gem data and source audit — complete

- Verify the existing Beyond the Breach Gem entries and local image inventory.
- Add Chromia Sphere and Nebulae Fragment from The Surface, and Coiled Trillium and Ice-Dusted Jewel from The Returned, to `documents/wave9/gems/gems.md`.
- Record costs, card numbers, rules text, mechanics, image paths, and Wiki sources. Use the local card scans to cross-check text where Wiki pages cannot be fetched.
- Exit criteria: the document covers all nine Wave 9 Gem sets and clearly distinguishes collected rules data from runtime card definitions.

### 2. Pulse Token and Recall engine primitives — complete

- Add a player Pulse Token resource with a five-token cap, capped gain/loss operations, and the specified persistence/cleanup behavior.
- Drive Control Bar visibility from a setup-time supply mechanic flag; place the token display immediately left of Charge and use `image-database/common images/Pulse_token.png`.
- Add a generic Recall trigger limited to the active player's Main Phase and cards in that player's discard pile, once per card instance per turn.
- Reuse the discard-pile modal and card highlighting: show a blue pile outline when an unused Recall is available, highlight eligible cards, and dispatch the selected card's Recall effect.
- Exit criteria: tests cover cap, turn persistence, game-end cleanup, phase/zone restrictions, and independent usage of duplicate card instances.

### 3. Develop mechanics and public zones — complete

- Add a reusable Develop cost to card definitions and typed Develop effects.
- Left-click a developable supply pile to retain normal purchase behavior; right-click to pay its Develop cost and move one copy to the shared Develop zone.
- Allow either mouse button on a Develop-zone card to pay its Develop cost and gain it. Resolve Develop effects in both cases. Keep the Develop zone separate from supply counts and prevent gain-only effects from taking cards out of it.
- Use regular eligible Aether for Develop payment, not conditional Aether restricted to gaining a specific card type.
- Make zone visibility a game-setup decision. If either Swap or Develop is needed, reserve the Swap / Played / Develop row in every Mage view. Keep Swap cards associated with their owner and public across views; make Develop a shared game zone.
- Implement Chromia Sphere's bonus when at least two copies are in the Develop zone.
- Exit criteria: tests cover supply-to-zone, zone-to-player, payment restrictions, shared visibility, effect timing, and Chromia Sphere's threshold.

### 4. Trinket deck and card handling — complete

- Register Trinkets as player cards and build a separate shuffled setup deck: two Clouded Trinkets, two Golden Trinkets, and three copies of each other Trinket.
- Add typed effects to gain one or more Trinkets, with the standard destination on top of the gaining player's discard pile and support for effects that place a gained card elsewhere.
- Track which deck cards have been revealed so hidden cards remain backs while known cards can be shown faceup.
- Add a clickable deck display at the far right of the Breach row, vertically aligned with prepped spells and horizontally aligned with the third Market column.
- Normalize the skewed, white-bordered deck-back image using the existing image-normalization utility. Visually inspect a temporary output before replacing the original asset; add a small-angle correction only if cropping/resizing leaves visible skew.
- Exit criteria: tests cover setup counts, shuffle/deal behavior, destinations, empty-deck handling, and known/unknown visibility.

### 5. Implement all nine Wave 9 Gem sets

- Beyond the Breach: Atomized Ash, Hewn Gravitite, Irradiax Lump, Luminous Facet, and Phosphor Nugget.
- The Surface: Chromia Sphere and Nebulae Fragment.
- The Returned: Coiled Trillium and Ice-Dusted Jewel.
- Compose their effects from the generic engine primitives, including Recall, Pulse Token choices, ally decisions, Conjure, cross-player spell casting, and Trinket gains.
- Exit criteria: focused card tests cover every optional branch, legal target set, destination, and payment result.

### 6. Persistence, UI, and integration validation

- Persist Pulse counts, per-turn Recall usage, the shared Develop zone, Trinket deck order, and reveal knowledge. Supply defaults when restoring older current-format saves that lack new fields.
- Validate all-view zone visibility, responsive placement, click/right-click behavior, and the UI highlight states.
- Run engine tests (`npm test`), UI type/build validation (`npm run build`), and UI end-to-end tests (`npm run test:e2e`).
- Exit criteria: all relevant tests pass, assets render at the intended proportions, and a save/load check preserves the new game state.

**Phase 6 status: validation complete; full-suite follow-up remains.**

- The save system serializes the complete `GameState` as JSON. The new persistence round-trip confirms Pulse counts, per-turn Recall usage, the shared Develop zone, Trinket deck order, and reveal knowledge survive Save & Exit and Resume. Engine migration tests also cover defaults for older saves missing the new fields.
- Confirmed all Wave 9 card assets, Pulse Token art, and the normalized Trinket deck back are present in the production build. The generated image registry maps 143 cards and the build succeeds.
- Wave 9 UI regression tests pass 6/6: Pulse visibility, shared zones and Develop interactions, hidden/known Trinket rendering, Recall highlight/activation, and save/resume persistence.
- Full UI E2E run initially reported 76/93 passed and 17 failed across Breach, Mage, Debug Tools, market setup, and visual-regression cases. During triage, two Breach failures proved to be stale selectors: the UI exposes descriptive accessible names such as `Focus Breach IV for 4 Aether`, while the tests searched for the visible text `Focus 4`. Updated those selectors and reran `breach-rotation.spec.ts`; all 3 tests passed. The other full-suite failures were not rerun as a group and include setup/card-count assumptions and unrelated Mage/Debug/layout assertions, so the complete suite is not yet confirmed green. These failures are recorded rather than treated as passing; the Wave 9 focused tests above are green.
- Validation commands passed: `aeons-end-engine/npm test`, `aeons-end-ui/npx vue-tsc --noEmit`, and `aeons-end-ui/npm run build`.

## Source references

- [Beyond the Breach](https://aeonsend.wiki.gg/wiki/Beyond_the_Breach)
- [The Surface](https://aeonsend.wiki.gg/wiki/The_Surface)
- [Chromia Sphere](https://aeonsend.wiki.gg/wiki/Chromia_Sphere)
- [The Returned](https://aeonsend.wiki.gg/wiki/The_Returned)
- [Coiled Trillium](https://aeonsend.wiki.gg/wiki/Coiled_Trillium)
- [Ice-Dusted Jewel](https://aeonsend.wiki.gg/wiki/Ice-Dusted_Jewel)
- [Trinket rules and card counts](https://aeonsend.wiki.gg/wiki/Trinket)

## Progress log

- 2026-09-28: plan written.
- 2026-09-28: Phase 1 complete. `gems.md` now covers all nine Wave 9 Gem sets. Chromia Sphere, Coiled Trillium, and Ice-Dusted Jewel were checked against their Wiki pages; Nebulae Fragment's text and TS-014 number were checked against the local card scan because the Wiki page could not be fetched directly.
- 2026-09-28: Phase 2 complete. Added the capped, persistent Pulse Token resource and setup-market mechanic tracking; added Main Phase Recall actions with discard-pile highlighting and duplicate-copy usage tracking. Engine tests, UI type-check, production build, and the focused Pulse status Playwright test passed. The Playwright test used this checkout's Vite server on port 5174 because port 5173 already had an unidentified listener.
- 2026-09-28: Phase 3 complete. Added reusable Develop costs and `on_develop` triggers, normal-Aether-only payment, supply-to-zone and zone-to-discard actions, setup-wide zone visibility, public owner-labelled Swap cards, and Chromia Sphere's two-copy bonus. Engine tests cover both transitions, trigger timing, payment restrictions, game-over cleanup for the Devoured pile, old-save zone migration, and Chromia's threshold. Production build and Develop/Pulse UI Playwright regressions passed on port 5174.
- 2026-09-28: Phase 4 complete. Added the shuffled 13-card shared Trinket deck, typed Trinket gains with discard/deck-top destinations and any-player targeting, per-copy reveal memory, and return-to-known-bottom handling. Added the clickable pile and viewer with hidden/known face rendering. Normalized the skewed deck back by 1° while preserving its white border; generated imports now include all five Trinket fronts. Fixed the pile's vertical anchor to match the Breach artwork's spell anchor and verified horizontal alignment with Market column three. Engine suite, UI type-check, production build, and the focused Trinket Playwright test passed.
- 2026-09-28: Phase 5 complete. Registered all nine Wave 9 Gems and implemented their gain/play/Recall effects using typed engine primitives. Added exact-card discard filters, a Conjure mode for any present Breach (including closed Breaches), and the optional “put one gained Trinket into hand” choice. Extended image generation to recognize the Gem data factory, then confirmed all eight newly registered card fronts map to their local scans. Focused tests cover card registration, Recall payment, Pulse caps and market visibility, ally targeting/discard and Skip branches, closed-Breach Conjure, both Ice-Dusted Jewel modes, cast-without-discard, and Trinket hand placement with JSON save/resume. `aeons-end-engine` `npm test` and `aeons-end-ui` `npm run build` passed.
- 2026-09-28: Phase 6 validation complete. The new Save & Exit/Resume and Recall UI tests pass, and Wave 9-specific UI regressions pass 6/6. Engine tests, UI type-check, and production build pass. The first full UI suite run reported 76/93; after correcting stale focus-button selectors, the dedicated Breach rotation file passed 3/3. Other full-suite failures remain documented above and were not rerun as a group.
