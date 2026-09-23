import type { BreachState, CardDef, TreasureCard } from '../../types'
import type { MageDef } from '../wave1/mage'

type BreachFactory = (
  index: number, opened: boolean, startDir: 'east' | 'south' | 'west' | 'north' | null,
  present?: boolean,
) => BreachState

/** The seven level 2 Treasures that form Dezmodia's default Stash. */
export const DEZMODIA_STASH = [
  'calcified_electinium',
  'corrupted_coil',
  'fungal_network',
  'ice_heart_shard',
  'polished_dyaminium',
  'runic_flute',
  'time_cortex',
]

const setAnySupply = (
  cardType?: 'gem' | 'relic' | 'spell',
  minCost?: number,
  cardTypes?: Array<'gem' | 'relic' | 'spell'>,
) => [{
  trigger: { kind: 'on_put_into_play' as const },
  effects: [{ kind: 'set_next_to_supply_pile' as const, cardType, cardTypes, minCost }],
}]

/** Build a Treasure with an explicit printed level instead of a Supply-card type/cost. */
const levelTwoTreasure = (
  card: Omit<TreasureCard, 'treasureLevel'>,
): TreasureCard => ({ ...card, treasureLevel: 2 })

const corruptedCoilEffects = [
  {
    trigger: { kind: 'on_breach_open' as const },
    effects: [{ kind: 'gain_aether_token' as const, target: 'any_player' as const }],
  },
  {
    trigger: { kind: 'while_in_play' as const, phase: 'main_phase' as const },
    manualActivation: true,
    effects: [
      {
        kind: 'deal_damage' as const,
        amount: { kind: 'per_open_breach' as const, base: 0, amountPerBreach: 2 },
        target: 'nemesis_or_minion' as const,
      },
      { kind: 'destroy_player_card_in_play' as const, cardId: 'corrupted_coil' },
    ],
  },
]

const fungalNetworkEffects = [
  {
    trigger: { kind: 'on_ability_resolved' as const },
    effects: [
      { kind: 'gain_power_token' as const, cardId: 'fungal_network' },
      {
        kind: 'choose_optional' as const,
        prompt: 'Gain a supply card costing 4 Aether or less?',
        effects: [{ kind: 'gain_card_from_market' as const, maxCost: 4 }],
      },
    ],
  },
  {
    trigger: { kind: 'while_in_play' as const, phase: 'main_phase' as const },
    manualActivation: true,
    effects: [
      { kind: 'destroy_cards_equal_to_power_tokens' as const, cardId: 'fungal_network' },
    ],
  },
]

const timeCortexEffects = [
  {
    trigger: { kind: 'on_put_into_play' as const },
    effects: [{ kind: 'focus_breach_all_players' as const }],
  },
  {
    trigger: { kind: 'while_in_play' as const, phase: 'main_phase' as const },
    condition: { kind: 'prepped_spell_count' as const, comparison: 'at_least' as const, count: 4 },
    manualActivation: true,
    effects: [
      {
        kind: 'conditional' as const,
        condition: { kind: 'has_player_turn_order_card' as const },
        effects: [
          { kind: 'shuffle_turn_order_card' as const, damage: 0, target: 'self' as const },
          { kind: 'destroy_player_card_in_play' as const, cardId: 'time_cortex' },
        ],
      },
    ],
  },
]

export const DEZMODIA_CARDS: Record<string, CardDef> = {
  vision_shard: {
    id: 'vision_shard', name: 'Vision Shard', type: 'gem', cost: 0, set: 'wave9',
    effects: [{ trigger: { kind: 'on_play' }, effects: [{
      kind: 'choose_one',
      prompt: 'Choose Vision Shard effect',
      options: [
        { id: 'aether', label: 'Gain 1 Aether', effects: [{ kind: 'gain_aether', amount: 1 }] },
        {
          id: 'stash',
          label: 'Reveal the top two cards of Dezmodia\'s Stash and return each to the top or bottom',
          effects: [{ kind: 'reveal_specific_deck', mode: 'return_each' }],
        },
      ],
    }] }],
  },
  energized_stone: {
    id: 'energized_stone', name: 'Energized Stone', type: 'gem', cost: 0, set: 'wave9',
    effects: [{ trigger: { kind: 'on_play' }, effects: [{ kind: 'gain_charge', amount: 1, target: 'self' }] }],
  },
  calcified_electinium: levelTwoTreasure({
    id: 'calcified_electinium', name: 'Calcified Electinium', type: 'treasure', cost: 0, set: 'wave9',
    effects: [
      ...setAnySupply(undefined, 5, ['gem', 'relic']),
      {
        trigger: { kind: 'on_gain_from_supply_pile' as const },
        effects: [{ kind: 'move_gained_card' as const, destination: 'hand' as const }],
      },
      {
        trigger: { kind: 'while_in_play' as const, phase: 'main_phase' as const },
        condition: { kind: 'set_supply_pile_empty' as const, cardId: 'calcified_electinium' },
        manualActivation: true,
        effects: [
          { kind: 'gain_charge' as const, amount: 4, target: 'self' as const },
          { kind: 'destroy_player_card_in_play' as const, cardId: 'calcified_electinium' },
        ],
      },
    ],
  }),
  corrupted_coil: levelTwoTreasure({
    id: 'corrupted_coil', name: 'Corrupted Coil', type: 'treasure', cost: 0, set: 'wave9',
    effects: corruptedCoilEffects,
  }),
  fungal_network: levelTwoTreasure({
    id: 'fungal_network', name: 'Fungal Network', type: 'treasure', cost: 0, set: 'wave9',
    effects: fungalNetworkEffects,
  }),
  ice_heart_shard: levelTwoTreasure({
    id: 'ice_heart_shard', name: 'Ice-Heart Shard', type: 'treasure', cost: 0, set: 'wave9',
    effects: [
      ...setAnySupply(undefined, undefined, ['gem', 'relic']),
      {
        trigger: { kind: 'while_set_next_to_supply' as const },
        effects: [{ kind: 'reduce_supply_cost' as const, amount: 1 }],
      },
      {
        trigger: { kind: 'while_in_play' as const, phase: 'main_phase' as const },
        condition: {
          kind: 'hand_card_count' as const,
          cardTypes: ['gem', 'relic'] as const,
          minCost: 2,
          comparison: 'at_least' as const,
          count: 2,
        },
        manualActivation: true,
        effects: [
          { kind: 'draw_cards' as const, amount: 3, target: 'ally' as const },
          { kind: 'destroy_player_card_in_play' as const, cardId: 'ice_heart_shard' },
        ],
      },
    ],
  }),
  polished_dyaminium: levelTwoTreasure({
    id: 'polished_dyaminium', name: 'Polished Dyaminium', type: 'treasure', cost: 0, set: 'wave9',
    effects: [
      ...setAnySupply(),
      {
        trigger: { kind: 'on_gain_from_supply_pile' as const },
        effects: [{ kind: 'gain_charge' as const, amount: 1, target: 'self' as const }],
      },
      {
        trigger: { kind: 'while_in_play' as const, phase: 'main_phase' as const },
        condition: { kind: 'set_supply_pile_empty' as const, cardId: 'polished_dyaminium' },
        manualActivation: true,
        effects: [
          { kind: 'gain_life' as const, amount: 3, target: 'gravehold' as const },
          { kind: 'destroy_player_card_in_play' as const, cardId: 'polished_dyaminium' },
        ],
      },
    ],
  }),
  runic_flute: levelTwoTreasure({
    id: 'runic_flute', name: 'Runic Flute', type: 'treasure', cost: 0, set: 'wave9',
    effects: [
      ...setAnySupply('spell'),
      {
        trigger: { kind: 'on_gain_from_supply_pile' as const },
        effects: [{
          kind: 'choose_optional' as const,
          prompt: 'Place the gained card on top of your deck?',
          effects: [{ kind: 'move_gained_card' as const, destination: 'deck_top' as const }],
        }],
      },
      {
        trigger: { kind: 'while_in_play' as const, phase: 'main_phase' as const },
        manualActivation: true,
        effects: [
          { kind: 'cast_any_number_prepped_spells' as const },
          { kind: 'destroy_player_card_in_play' as const, cardId: 'runic_flute' },
        ],
      },
    ],
  }),
  time_cortex: levelTwoTreasure({
    id: 'time_cortex', name: 'Time Cortex', type: 'treasure', cost: 0, set: 'wave9',
    effects: timeCortexEffects,
  }),
}

export const DEZMODIA_UNIQUE_CARDS = Object.keys(DEZMODIA_CARDS)

export function createDezmodia(makeBreach: BreachFactory): MageDef {
  return {
    wave: 9,
    type: 'dezmodia',
    abilityName: 'Pilfer the Past',
    abilityTrigger: { kind: 'main_phase', scope: 'current_player' },
    abilityEffects: [{
      kind: 'choose_one',
      prompt: 'Choose Pilfer the Past effect',
      options: [
        {
          id: 'stash',
          label: 'Reveal two cards from Dezmodia\'s Stash and put one into play',
          effects: [{ kind: 'reveal_specific_deck', mode: 'put_one_into_play' }],
        },
        {
          id: 'life',
          label: 'Any player gains 3 life',
          effects: [{ kind: 'gain_life', amount: 3, target: 'any_player' }],
        },
      ],
    }],
    hp: 10,
    chargeThreshold: 4,
    startHand: ['vision_shard', 'crystal', 'crystal', 'spark', 'spark'],
    startDeck: ['energized_stone', 'crystal', 'crystal', 'crystal', 'spark'],
    hasSpecificDeck: true,
    specificDeckName: "Dezmodia's Stash",
    specificDeck: [...DEZMODIA_STASH],
    specificDeckShuffled: true,
    specificDeckBack: 'treasure_2',
    breaches: [
      makeBreach(1, true, null),
      makeBreach(2, false, 'west'),
      makeBreach(3, false, 'south'),
      makeBreach(4, false, 'south'),
    ],
  }
}
