import type { BreachState, CardDef, CardEffect } from '../../types'
import type { MageDef } from '../wave1/mage'

type BreachFactory = (
  index: number, opened: boolean, startDir: 'east' | 'south' | 'west' | 'north' | null,
  present?: boolean, special?: BreachState['special'],
) => BreachState

const damage = (amount: number): CardEffect => ({
  kind: 'deal_damage', amount, target: 'nemesis_or_minion',
})

export const INCO_CARDS: Record<string, CardDef> = {
  genesis_emerald: {
    id: 'genesis_emerald', name: 'Genesis Emerald', type: 'gem', cost: 0, set: 'wave9',
    effects: [{
      trigger: { kind: 'on_play' },
      effects: [{
        kind: 'choose_one', prompt: 'Choose Genesis Emerald effect',
        options: [
          { id: 'aether', label: 'Gain 1 Aether', effects: [{ kind: 'gain_aether', amount: 1 }] },
          {
            id: 'firethorn', label: 'Discard 2 cards to gain the top Firethorn',
            condition: { kind: 'hand_card_count', cardTypes: ['gem', 'relic', 'spell'], minCost: 0, comparison: 'at_least', count: 2 },
            effects: [
              { kind: 'discard_cards', source: 'hand', amount: 2, minAmount: 2, maxAmount: 2 },
              { kind: 'gain_specific_deck_top', target: 'any_player', destination: 'discard_top' },
            ],
          },
        ],
      }],
    }],
  },
  arcing_firethorn: {
    id: 'arcing_firethorn', name: 'Arcing Firethorn', type: 'spell', cost: 5, set: 'wave9',
    effects: [{ trigger: { kind: 'on_cast' }, effects: [
      damage(3), { kind: 'cast_prepped_spell', source: 'any_prepped_spell', bonusDamage: 1 },
    ] }],
  },
  blooming_firethorn: {
    id: 'blooming_firethorn', name: 'Blooming Firethorn', type: 'spell', cost: 5, set: 'wave9',
    effects: [{ trigger: { kind: 'on_cast' }, effects: [damage(2), { kind: 'conjure' }] }],
  },
  calming_firethorn: {
    id: 'calming_firethorn', name: 'Calming Firethorn', type: 'spell', cost: 5, set: 'wave9',
    effects: [{ trigger: { kind: 'on_cast' }, effects: [damage(3), { kind: 'gain_charge', amount: 1, target: 'self' }] }],
  },
  imbued_firethorn: {
    id: 'imbued_firethorn', name: 'Imbued Firethorn', type: 'spell', cost: 5, set: 'wave9',
    effects: [{ trigger: { kind: 'on_cast' }, effects: [
      damage(3),
      { kind: 'choose_optional', prompt: 'Destroy a card in hand?', effects: [{ kind: 'destroy_cards', source: 'hand', minAmount: 1, maxAmount: 1 }] },
    ] }],
  },
  revealing_firethorn: {
    id: 'revealing_firethorn', name: 'Revealing Firethorn', type: 'spell', cost: 5, set: 'wave9',
    effects: [{ trigger: { kind: 'on_cast' }, effects: [
      damage(3), { kind: 'focus_breach', target: 'self', selection: 'lowest_focus_cost' },
    ] }],
  },
}

export const INCO_UNIQUE_CARDS = Object.keys(INCO_CARDS)

const firethornDeck = [
  'arcing_firethorn', 'blooming_firethorn', 'calming_firethorn', 'imbued_firethorn', 'revealing_firethorn',
  'arcing_firethorn', 'blooming_firethorn', 'calming_firethorn', 'imbued_firethorn', 'revealing_firethorn',
]

export function createInco(makeBreach: BreachFactory): MageDef {
  return {
    wave: 9,
    type: 'inco',
    abilityName: 'Massive Growth',
    abilityTrigger: { kind: 'main_phase', scope: 'current_player' },
    abilityEffects: [
      { kind: 'cast_prepped_spell', source: 'any_prepped_spell' },
      { kind: 'reveal_firethorns', playerCount: 2 },
    ],
    hp: 10,
    chargeThreshold: 5,
    startHand: ['crystal', 'crystal', 'crystal', 'genesis_emerald', 'spark'],
    startDeck: ['crystal', 'crystal', 'crystal', 'crystal', 'spark'],
    hasSpecificDeck: true,
    specificDeckName: 'Firethorn deck',
    specificDeck: firethornDeck,
    specificDeckShuffled: true,
    specificDeckDisplay: 'top_revealed',
    specificDeckBack: 'player',
    breaches: [
      makeBreach(1, true, null),
      makeBreach(2, false, 'south'),
      makeBreach(3, false, 'south'),
      makeBreach(4, false, 'south'),
    ],
  }
}
