import type { AbilityTrigger, BreachState, CardEffect } from '../../types'

export interface MageDef {
  type: string
  abilityName: string
  abilityTrigger: AbilityTrigger
  abilityEffects: CardEffect[]
  hp: number
  chargeThreshold: number
  startHand: string[]
  startDeck: string[]
  breaches: BreachState[]
}

type BreachFactory = (
  index: number, opened: boolean, startDir: 'east' | 'south' | 'west' | 'north' | null,
  present?: boolean,
) => BreachState

export const MAGE_UNIQUE_CARDS: Record<string, string[]> = {
  adelheim: ['amethyst_shard'],
  jian: ['moonstone_shard'],
  kadir: ['emerald_shard'],
  lash: ['quartz_shard'],
  mist: ['garnet_shard'],
  phaedraxa: ['tourmaline_shard'],
  brama: ['buried_light'],
  xaxos: ['flare'],
}

export function createMages(makeBreach: BreachFactory): Record<string, MageDef> {
  const jian: MageDef = {
    type: 'jian',
    abilityName: 'Black Mirror',
    abilityTrigger: { kind: 'main_phase', scope: 'current_player' },
    abilityEffects: [
      { kind: 'cast_prepped_spell', source: 'any_prepped_spell', discard: false },
      { kind: 'cast_prepped_spell', source: 'selected_prepped_spell', discard: true },
    ],
    hp: 10,
    chargeThreshold: 4,
    startHand: ['moonstone_shard', 'crystal', 'crystal', 'spark', 'spark' ],
    startDeck: ['crystal', 'crystal', 'crystal', 'spark', 'spark'],
    breaches: [
      makeBreach(1, true, null),
      makeBreach(2, true, null),
      makeBreach(3, false, 'east'),
      makeBreach(4, false, 'south'),
    ],
  }

  const brama: MageDef = {
    type: 'brama',
    abilityName: 'Brink Siphon',
    abilityTrigger: { kind: 'main_phase', scope: 'current_player' },
    abilityEffects: [{ kind: 'gain_life', amount: 4, target: 'any_player' }],
    hp: 10,
    chargeThreshold: 5,
    startHand: ['buried_light', 'crystal', 'crystal', 'crystal', 'crystal'],
    startDeck: ['crystal', 'crystal', 'crystal', 'spark', 'spark'],
    breaches: [
      makeBreach(1, true, null),
      makeBreach(2, false, 'south'),
      makeBreach(3, false, 'east'),
      makeBreach(4, false, 'west'),
    ],
  }

  const xaxos: MageDef = {
    type: 'xaxos',
    abilityName: 'Metaphysical Link',
    abilityTrigger: { kind: 'main_phase', scope: 'any_player' },
    abilityEffects: [
      { kind: 'gain_charge', amount: 4, target: 'allies_collectively' },
      { kind: 'review_turn_order_deck' },
    ],
    hp: 10,
    chargeThreshold: 5,
    startHand: ['flare', 'crystal', 'crystal', 'crystal', 'crystal'],
    startDeck: ['crystal', 'crystal', 'crystal', 'crystal', 'spark'],
    breaches: [
      makeBreach(1, true, null),
      makeBreach(2, false, 'east'),
      makeBreach(3, false, 'east'),
      makeBreach(4, false, 'south'),
    ],
  }

  const adelheim: MageDef = {
    type: 'adelheim',
    abilityName: 'Aethereal Ward',
    abilityTrigger: { kind: 'nemesis_draw_phase' },
    // Nemesis draw and resolution are not implemented yet. Keep the trigger and
    // name available without exposing a non-functional ability button.
    abilityEffects: [],
    hp: 10,
    chargeThreshold: 5,
    startHand: ['amethyst_shard', 'crystal', 'crystal', 'spark', 'spark'],
    startDeck: ['crystal', 'crystal', 'crystal', 'crystal', 'crystal'],
    breaches: [
      makeBreach(1, true, null),
      makeBreach(2, false, 'west'),
      makeBreach(3, false, 'east'),
      makeBreach(4, false, 'south'),
    ],
  }

  const kadir: MageDef = {
    type: 'kadir',
    abilityName: 'Otherworldly Gate',
    abilityTrigger: { kind: 'main_phase', scope: 'any_player' },
    abilityEffects: [
      { kind: 'return_cards_to_hand', source: 'discard', amount: 3 },
      { kind: 'set_prep_limit', amount: 2 },
    ],
    hp: 10,
    chargeThreshold: 5,
    startHand: ['emerald_shard', 'crystal', 'crystal', 'crystal', 'spark'],
    startDeck: ['crystal', 'crystal', 'crystal', 'spark', 'spark'],
    breaches: [
      makeBreach(1, true, null),
      makeBreach(2, false, 'west'),
      makeBreach(3, false, 'south'),
      makeBreach(4, false, 'west'),
    ],
  }

  const lash: MageDef = {
    type: 'lash',
    abilityName: 'Quicken Thought',
    abilityTrigger: { kind: 'main_phase', scope: 'any_player' },
    abilityEffects: [{ kind: 'shuffle_turn_order_card', damage: 1 }],
    hp: 10,
    chargeThreshold: 5,
    startHand: ['quartz_shard', 'crystal', 'crystal', 'crystal', 'spark'],
    startDeck: ['crystal', 'crystal', 'crystal', 'spark', 'spark'],
    breaches: [
      makeBreach(1, true, null),
      makeBreach(2, false, 'west'),
      makeBreach(3, false, 'east'),
      makeBreach(4, false, 'west'),
    ],
  }

  const mist: MageDef = {
    type: 'mist',
    abilityName: 'Divine Augury',
    abilityTrigger: { kind: 'main_phase', scope: 'current_player' },
    abilityEffects: [{ kind: 'draw_cards', amount: 4, target: 'ally' }],
    hp: 10,
    chargeThreshold: 5,
    startHand: ['garnet_shard', 'crystal', 'crystal', 'crystal', 'spark'],
    startDeck: ['crystal', 'crystal', 'crystal', 'spark', 'spark'],
    breaches: [
      makeBreach(1, true, null),
      makeBreach(2, false, 'west'),
      makeBreach(3, false, 'south'),
      makeBreach(4, false, 'south'),
    ],
  }

  const phaedraxa: MageDef = {
    type: 'phaedraxa',
    abilityName: 'Auspex Rune',
    abilityTrigger: { kind: 'turn_order_card_drawn' },
    abilityEffects: [{ kind: 'prevent_damage_this_turn' }],
    hp: 10,
    chargeThreshold: 5,
    startHand: ['tourmaline_shard', 'crystal', 'crystal', 'crystal', 'spark'],
    startDeck: ['crystal', 'crystal', 'crystal', 'crystal', 'spark'],
    breaches: [
      makeBreach(1, false, null, false),
      makeBreach(2, true, null),
      makeBreach(3, false, 'south'),
      makeBreach(4, false, 'west'),
    ],
  }

  return { jian, brama, xaxos, adelheim, kadir, lash, mist, phaedraxa }
}
