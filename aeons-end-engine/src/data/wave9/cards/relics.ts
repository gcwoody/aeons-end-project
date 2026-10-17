import type { CardDef, RelicCard } from '../../../types'

export const chronoid: RelicCard = {
  id: 'chronoid', name: 'Chronoid', type: 'relic', cost: 5, set: 'wave9',
  mechanics: ['recall'],
  effects: [{ trigger: { kind: 'on_play' }, effects: [
    { kind: 'gain_aether_token', amount: 3, target: 'ally' },
  ] }, {
    trigger: { kind: 'recall' }, effects: [{ kind: 'reveal_turn_order_card', playerEffects: [], nemesisEffects: [], returnChoice: true }],
  }],
}

export const omenLoop: RelicCard = {
  id: 'omen_loop', name: 'Omen Loop', type: 'relic', cost: 3, developCost: 2, set: 'wave9',
  mechanics: ['develop', 'pulse_token'],
  effects: [{ trigger: { kind: 'on_develop' }, effects: [{ kind: 'gain_pulse_token', amount: 2 }] }, {
    trigger: { kind: 'on_play' }, effects: [
      { kind: 'destroy_cards', source: 'self' },
      { kind: 'reveal_turn_order_deck' },
      { kind: 'choose_optional', prompt: 'Lose 1 Pulse token to let an ally draw a card?', skipIfUnavailable: true, acceptCondition: { kind: 'all_of', conditions: [
        { kind: 'has_pulse_tokens', amount: 1 },
        { kind: 'has_unopened_breach', target: 'ally' },
      ] }, effects: [
        { kind: 'lose_pulse_token', amount: 1 },
        { kind: 'draw_cards', amount: 1, target: 'ally' },
      ] },
    ],
  }],
}

export const riftRing: RelicCard = {
  id: 'rift_ring', name: 'Rift Ring', type: 'relic', cost: 3, set: 'wave9',
  mechanics: ['trinket'],
  effects: [{ trigger: { kind: 'on_play' }, effects: [{ kind: 'choose_one', prompt: 'Choose a Rift Ring effect', options: [
    { id: 'trinkets', label: 'Gain 2 charges and put two Trinkets on top of your deck', effects: [
      { kind: 'gain_charge', amount: 2, target: 'self' },
      { kind: 'gain_trinkets', amount: 2, destination: 'deck_top' },
    ] },
    { id: 'destroy', label: 'Destroy this to gain 2 life', effects: [
      { kind: 'destroy_cards', source: 'self' }, { kind: 'gain_life', amount: 2, target: 'self' },
    ] },
  ] }] }],
}

export const tearstoneAmulet: RelicCard = {
  id: 'tearstone_amulet', name: 'Tearstone Amulet', type: 'relic', cost: 4, developCost: 3, set: 'wave9',
  mechanics: ['develop', 'attach'],
  effects: [{ trigger: { kind: 'on_develop' }, effects: [{ kind: 'gain_charge', amount: 1, target: 'self' }] }, {
    trigger: { kind: 'on_play' }, effects: [{ kind: 'attach_relic', target: 'any_player' }],
  }, {
    trigger: { kind: 'on_attached_breach_spell_cast' }, effects: [{
      kind: 'choose_optional', prompt: 'Any ally may Conjure?',
      effects: [{ kind: 'conjure', target: 'ally', relativeToSource: true }],
    }],
  }],
}

export const thoughtTotem: RelicCard = {
  id: 'thought_totem', name: 'Thought Totem', type: 'relic', cost: 7, developCost: 4, set: 'wave9',
  mechanics: ['develop'],
  effects: [{ trigger: { kind: 'on_develop' }, effects: [{ kind: 'gain_aether_token', amount: 2, target: 'ally' }] }, {
    trigger: { kind: 'on_play' }, effects: [
      { kind: 'gain_charge', amount: 2, target: 'self' },
      { kind: 'reveal_top_cards_for_discard', amount: 3, reorderRemaining: true },
    ],
  }],
}

export const dreamersCrown: RelicCard = {
  id: 'dreamers_crown', name: "Dreamer's Crown", type: 'relic', cost: 3, set: 'wave9',
  mechanics: ['pulse_token'],
  effects: [{ trigger: { kind: 'on_play' }, effects: [{ kind: 'choose_one', prompt: "Choose a Dreamer's Crown effect", options: [
    { id: 'charge_pulse', label: 'Gain 1 charge and 2 Pulse tokens', autoSelectIfSoleAvailable: true, effects: [
      { kind: 'gain_charge', amount: 1, target: 'self' }, { kind: 'gain_pulse_token', amount: 2 },
    ] },
    { id: 'unspent_aether', label: 'Lose 4 Pulse tokens to deal damage equal to your unspent Aether', condition: { kind: 'has_pulse_tokens', amount: 4 }, effects: [
      { kind: 'lose_pulse_token', amount: 4 },
      { kind: 'deal_damage', amount: { kind: 'unspent_aether' }, target: 'nemesis_or_minion' }, { kind: 'lose_unspent_aether' },
    ] },
  ] }] }],
}

export const stormspinnerWand: RelicCard = {
  id: 'stormspinner_wand', name: 'Stormspinner Wand', type: 'relic', cost: 8, developCost: 5, set: 'wave9',
  mechanics: ['develop'],
  effects: [{ trigger: { kind: 'on_develop' }, effects: [{ kind: 'choose_optional', prompt: 'Any ally may destroy a card in hand or discard pile?', skipIfUnavailable: true, effects: [{ kind: 'destroy_cards', source: 'hand_or_discard', target: 'ally', minAmount: 1, maxAmount: 1 }] }] }, {
    trigger: { kind: 'on_play' }, effects: [{ kind: 'gain_charge_per_hand_card', minCost: 2, target: 'self_and_each_ally' }],
  }],
}

export const pactPrism: RelicCard = {
  id: 'pact_prism', name: 'Pact Prism', type: 'relic', cost: 3, set: 'wave9',
  mechanics: [],
  effects: [{ trigger: { kind: 'while_in_play', phase: 'end_turn_before_draw' }, effects: [{ kind: 'gain_aether_token', amount: 2 }] }, {
    trigger: { kind: 'on_play' }, effects: [{ kind: 'choose_optional', prompt: 'Any ally may discard a Pact Prism from hand and draw a card?', skipIfUnavailable: true, effects: [
      { kind: 'discard_cards', source: 'hand', amount: 1, target: 'ally', cardIds: ['pact_prism'], restoreToSourceAfterSelection: true },
      { kind: 'draw_cards', amount: 1, target: 'ally', relativeToSource: true },
      { kind: 'gain_life', amount: 1, target: 'self' },
    ] }],
  }],
}

export const bookOfBefore: RelicCard = {
  id: 'book_of_before', name: 'Book of Before', type: 'relic', cost: 6, set: 'wave9',
  mechanics: ['attach'],
  effects: [{ trigger: { kind: 'on_play' }, effects: [{ kind: 'attach_relic', target: 'any_player' }] }, {
    trigger: { kind: 'on_attached_breach_spell_cast' }, effects: [{ kind: 'gain_life', amount: 1, target: 'gravehold' }],
  }],
}

export const visionaryStaff: RelicCard = {
  id: 'visionary_staff', name: 'Visionary Staff', type: 'relic', cost: 5, set: 'wave9',
  mechanics: ['recall'],
  effects: [{ trigger: { kind: 'on_play' }, effects: [{ kind: 'choose_one', prompt: 'Choose a Visionary Staff effect', options: [
    { id: 'draw_discard', label: 'An ally draws three cards and discards two cards', autoSelectIfSoleAvailable: true, effects: [{ kind: 'draw_and_discard_cards', drawAmount: 3, discardAmount: 2, target: 'ally' }] },
    { id: 'recall', label: 'Resolve a Recall effect up to two times', condition: { kind: 'has_recall_in_any_discard' }, effects: [{ kind: 'resolve_recall', maxTimes: 2, ignoreOncePerTurn: true }] },
  ] }] }, {
    trigger: { kind: 'recall' }, effects: [{ kind: 'gain_charge', amount: 1, target: 'self' }],
  }],
}

export const WAVE9_RELIC_CARDS: Record<string, CardDef> = {
  chronoid, omen_loop: omenLoop, rift_ring: riftRing,
  tearstone_amulet: tearstoneAmulet, thought_totem: thoughtTotem,
  dreamers_crown: dreamersCrown, stormspinner_wand: stormspinnerWand,
  pact_prism: pactPrism, book_of_before: bookOfBefore, visionary_staff: visionaryStaff,
}
