import type { BreachState, CardDef } from '../../types'
import type { MageDef } from '../wave1/mage'

type BreachFactory = (
  index: number, opened: boolean, startDir: 'east' | 'south' | 'west' | 'north' | null,
  present?: boolean,
) => BreachState

const swapNames = ['Crystal', 'Spark']

export const NOOK_CARDS: Record<string, CardDef> = {
  superior_crystal: {
    id: 'superior_crystal', name: 'Superior Crystal', type: 'gem', cost: 0, set: 'wave9',
    effects: [{ trigger: { kind: 'on_play' }, effects: [{
      kind: 'choose_one', prompt: 'Choose Superior Crystal effect', options: [
        {
          id: 'swap', label: 'Gain 3 Aether and swap for Infused Crystal',
          effects: [{ kind: 'gain_aether', amount: 3 }, { kind: 'swap_for', cardId: 'infused_crystal' }],
        },
        { id: 'aether', label: 'Gain 1 Aether', effects: [{ kind: 'gain_aether', amount: 1 }] },
      ],
    }] }],
  },
  superior_spark: {
    id: 'superior_spark', name: 'Superior Spark', type: 'spell', cost: 0, set: 'wave9',
    effects: [{ trigger: { kind: 'on_cast' }, effects: [{
      kind: 'choose_one', prompt: 'Choose Superior Spark effect', options: [
        {
          id: 'swap', label: 'Deal 3 damage and swap for Infused Spark',
          effects: [
            { kind: 'deal_damage', amount: 3, target: 'nemesis_or_minion' },
            { kind: 'swap_for', cardId: 'infused_spark' },
          ],
        },
        { id: 'damage', label: 'Deal 1 damage', effects: [{ kind: 'deal_damage', amount: 1, target: 'nemesis_or_minion' }] },
      ],
    }] }],
  },
  infused_crystal: {
    id: 'infused_crystal', name: 'Infused Crystal', type: 'gem', cost: 0, set: 'wave9',
    effects: [{ trigger: { kind: 'on_play' }, effects: [{
      kind: 'choose_one', prompt: 'Choose Infused Crystal effect', options: [
        {
          id: 'swap', label: 'Gain 2 Aether and swap for Dim Crystal',
          effects: [{ kind: 'gain_aether', amount: 2 }, { kind: 'swap_for', cardId: 'dim_crystal' }],
        },
        { id: 'aether', label: 'Gain 1 Aether', effects: [{ kind: 'gain_aether', amount: 1 }] },
      ],
    }] }],
  },
  infused_spark: {
    id: 'infused_spark', name: 'Infused Spark', type: 'spell', cost: 0, set: 'wave9',
    effects: [{ trigger: { kind: 'on_cast' }, effects: [{
      kind: 'choose_one', prompt: 'Choose Infused Spark effect', options: [
        {
          id: 'swap', label: 'Deal 2 damage and swap for Dim Spark',
          effects: [
            { kind: 'deal_damage', amount: 2, target: 'nemesis_or_minion' },
            { kind: 'swap_for', cardId: 'dim_spark' },
          ],
        },
        { id: 'damage', label: 'Deal 1 damage', effects: [{ kind: 'deal_damage', amount: 1, target: 'nemesis_or_minion' }] },
      ],
    }] }],
  },
  dim_crystal: {
    id: 'dim_crystal', name: 'Dim Crystal', type: 'gem', cost: 0, set: 'wave9',
    effects: [{ trigger: { kind: 'on_play' }, effects: [
      { kind: 'gain_aether', amount: 1 },
      { kind: 'swap_for', cardId: 'empty_crystal' },
    ] }],
  },
  dim_spark: {
    id: 'dim_spark', name: 'Dim Spark', type: 'spell', cost: 0, set: 'wave9',
    effects: [{ trigger: { kind: 'on_cast' }, effects: [
      { kind: 'deal_damage', amount: 1, target: 'nemesis_or_minion' },
      { kind: 'swap_for', cardId: 'empty_spark' },
    ] }],
  },
  empty_crystal: {
    id: 'empty_crystal', name: 'Empty Crystal', type: 'gem', cost: 0, set: 'wave9',
    returnToSwapZoneOnDestroy: true,
    effects: [{ trigger: { kind: 'on_play' }, effects: [{ kind: 'gain_aether', amount: 0 }] }],
  },
  empty_spark: {
    id: 'empty_spark', name: 'Empty Spark', type: 'spell', cost: 0, set: 'wave9',
    returnToSwapZoneOnDestroy: true,
    effects: [{ trigger: { kind: 'on_cast' }, effects: [{ kind: 'deal_damage', amount: 0, target: 'nemesis_or_minion' }] }],
  },
}

export const NOOK_UNIQUE_CARDS = Object.keys(NOOK_CARDS)

export function createNook(makeBreach: BreachFactory): MageDef {
  return {
    wave: 9,
    type: 'nook',
    abilityName: 'Rupture Time',
    abilityTrigger: { kind: 'main_phase', scope: 'current_player' },
    abilityEffects: [
      {
        kind: 'move_cards_to_swap_zone', source: 'hand_or_discard', minAmount: 0, maxAmount: 3,
        nameIncludes: swapNames,
      },
      { kind: 'gain_card_from_swap_zone', nameIncludes: swapNames },
    ],
    hp: 10,
    chargeThreshold: 4,
    startHand: ['superior_crystal', 'crystal', 'crystal', 'superior_spark', 'spark'],
    startDeck: ['crystal', 'crystal', 'crystal', 'spark', 'spark'],
    hasSwapZone: true,
    swapZone: [
      'infused_crystal', 'dim_crystal', 'empty_crystal',
      'infused_spark', 'empty_spark', 'dim_spark',
    ],
    breaches: [
      makeBreach(1, true, null),
      makeBreach(2, false, 'east'),
      makeBreach(3, false, 'east'),
      makeBreach(4, false, 'east'),
    ],
  }
}
