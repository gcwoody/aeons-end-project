import type { AbilityTrigger, BreachState, CardEffect } from '../../types'

export interface MageDef {
  wave: number
  type: string
  abilityName: string
  abilityTrigger: AbilityTrigger
  abilityEffects: CardEffect[]
  hp: number
  chargeThreshold: number
  startHand: string[]
  startDeck: string[]
  breaches: BreachState[]
  /** Face-up Mage-specific cards placed in the Swap zone during setup. */
  swapZone?: string[]
  /** Reserve the shared Swap zone even when it starts empty. */
  hasSwapZone?: boolean
  /** Reserve the shared Develop zone even when it starts empty. */
  hasDevelopZone?: boolean
  /** Whether the UI should reserve a face-down Mage-specific deck column. */
  hasSpecificDeck?: boolean
  /** Optional display name for the Mage-specific deck (for example, Dezmodia's Stash). */
  specificDeckName?: string
  /** Initial cards for the Mage-specific deck. */
  specificDeck?: string[]
  /** Shuffle the initial Mage-specific deck during setup. */
  specificDeckShuffled?: boolean
  /** Optional card-back family used by the Mage-specific deck UI. */
  specificDeckBack?: 'treasure_1' | 'treasure_2' | 'treasure_3' | 'player'
  /** Display the top card of the Mage-specific deck face up. */
  specificDeckDisplay?: 'face_down' | 'face_up'
  /** Display a Knowledge counter in the player control bar. */
  tracksKnowledge?: boolean
  /** Display Doom tokens in the player control bar. */
  tracksDoom?: boolean
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
    wave: 1,
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
    wave: 1,
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
    wave: 1,
    type: 'xaxos',
    abilityName: 'Metaphysical Link',
    abilityTrigger: { kind: 'main_phase', scope: 'any_player' },
    abilityEffects: [
      { kind: 'gain_charge', amount: 4, target: 'allies_collectively' },
      { kind: 'reveal_turn_order_deck' },
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
    wave: 1,
    type: 'adelheim',
    abilityName: 'Aethereal Ward',
    abilityTrigger: { kind: 'nemesis_card_drawn', cardType: 'attack_or_power' },
    abilityEffects: [{ kind: 'discard_current_nemesis_card' }],
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
    wave: 1,
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
    wave: 1,
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
    wave: 1,
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
    wave: 1,
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
