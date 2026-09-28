import type { BreachState, CardDef, CardEffect, CardEffectBlock } from '../../types'
import type { MageDef } from '../wave1/mage'

type BreachFactory = (
  index: number, opened: boolean, startDir: 'east' | 'south' | 'west' | 'north' | null,
  present?: boolean,
) => BreachState

const vaultCard = (
  id: string, name: string, effects: CardEffectBlock[],
): CardDef => ({ id, name, type: 'treasure', treasureLevel: 3, cost: 0, set: 'wave9', effects })

const levelThreeTreasures = [
  'alchemic_stance', 'artifact_stance', 'breach_stance', 'creator_stance', 'overload_stance',
]

export const TRESSA_CARDS: Record<string, CardDef> = {
  transmaterium: {
    id: 'transmaterium', name: 'Transmaterium', type: 'gem', cost: 0, set: 'wave9',
    effects: [{ trigger: { kind: 'on_play' }, effects: [{ kind: 'gain_charge', amount: 1, target: 'self' }] }],
  },
  translocate: {
    id: 'translocate', name: 'Translocate', type: 'spell', cost: 0, set: 'wave9',
    effects: [{ trigger: { kind: 'on_cast' }, effects: [
      { kind: 'deal_damage', amount: 1, target: 'nemesis_or_minion' },
      { kind: 'choose_optional', prompt: "Put the top card of Tressa's Vault on the bottom?", effects: [{ kind: 'move_specific_deck_top_to_bottom' }] },
    ] }],
  },
  alchemic_stance: vaultCard('alchemic_stance', 'Alchemic Stance', [{
    trigger: { kind: 'while_in_play', phase: 'end_turn_before_draw' },
    effectPlayerScope: 'owner',
    oncePerTurn: true,
    effects: [{
      kind: 'choose_optional',
      prompt: 'Return a Relic or Spell from your discard pile to your hand?',
      acceptCondition: { kind: 'has_eligible_card_in_zone', zone: 'discard', cardTypes: ['relic', 'spell'] },
      effects: [{ kind: 'return_cards_to_hand', source: 'discard', amount: 1, minAmount: 1, cardTypes: ['relic', 'spell'] }],
    }],
  }]),
  artifact_stance: vaultCard('artifact_stance', 'Artifact Stance', [{
    trigger: { kind: 'while_in_play', phase: 'main_phase' },
    effectPlayerScope: 'owner',
    ownerTurnOnly: true,
    oncePerTurn: true,
    manualActivation: true,
    effects: [{
      kind: 'choose_one',
      prompt: 'Choose a card to destroy for Artifact Stance',
      options: [
        {
          id: 'gem', label: 'Destroy a Gem in hand costing 2 or more',
          condition: { kind: 'has_eligible_card_in_zone', zone: 'hand', cardTypes: ['gem'], minimumCost: 2 },
          effects: [
            { kind: 'destroy_cards', source: 'hand', minAmount: 1, maxAmount: 1, cardTypes: ['gem'], minCost: 2 },
            { kind: 'gain_card_from_market', maxCost: 0, bonusOverLastSelection: 2 },
          ],
        },
        {
          id: 'relic', label: 'Destroy a Relic in hand costing 2 or more',
          condition: { kind: 'has_eligible_card_in_zone', zone: 'hand', cardTypes: ['relic'], minimumCost: 2 },
          effects: [
            { kind: 'destroy_cards', source: 'hand', minAmount: 1, maxAmount: 1, cardTypes: ['relic'], minCost: 2 },
            { kind: 'gain_card_from_market', maxCost: 0, bonusOverLastSelection: 2 },
          ],
        },
      ],
    }],
  }]),
  breach_stance: vaultCard('breach_stance', 'Breach Stance', [{
    trigger: { kind: 'while_in_play', phase: 'main_phase' },
    effectPlayerScope: 'owner',
    ownerTurnOnly: true,
    oncePerTurn: true,
    manualActivation: true,
    effects: [{
      kind: 'choose_optional',
      prompt: 'Discard a card to focus your closed breach with the lowest focus cost?',
      disableIfUnavailable: true,
      effects: [
        { kind: 'discard_cards', source: 'hand', amount: 1, minAmount: 1, maxAmount: 1 },
        { kind: 'focus_breach', target: 'self', selection: 'lowest_focus_cost' },
      ],
    }],
  }]),
  creator_stance: vaultCard('creator_stance', 'Creator Stance', [{
    trigger: { kind: 'while_in_play', phase: 'main_phase' },
    effectPlayerScope: 'owner',
    effects: [{ kind: 'reduce_card_type_cost', cardTypes: ['gem', 'relic'], amount: 1 }],
  }]),
  overload_stance: vaultCard('overload_stance', 'Overload Stance', [{
    trigger: { kind: 'while_in_play', phase: 'casting_phase_end' },
    effectPlayerScope: 'owner',
    oncePerTurn: true,
    effects: [
      { kind: 'conditional', condition: { kind: 'spells_cast_this_turn', comparison: 'equals', count: 1 }, effects: [{ kind: 'deal_damage', amount: 1, target: 'nemesis_or_minion' }] },
      { kind: 'conditional', condition: { kind: 'spells_cast_this_turn', comparison: 'equals', count: 2 }, effects: [{ kind: 'deal_damage', amount: 1, target: 'nemesis_or_minion' }] },
      { kind: 'conditional', condition: { kind: 'spells_cast_this_turn', comparison: 'at_least', count: 3 }, effects: [{ kind: 'deal_damage', amount: 4, target: 'nemesis_or_minion' }] },
    ],
  }]),
}

export const TRESSA_UNIQUE_CARDS = Object.keys(TRESSA_CARDS)

export function createTressa(makeBreach: BreachFactory): MageDef {
  return {
    wave: 9,
    type: 'tressa',
    abilityName: 'Reconnect Tissue',
    abilityTrigger: { kind: 'main_phase', scope: 'current_player' },
    abilityEffects: [
      { kind: 'gain_charge', amount: 2, target: 'ally', continueAsTarget: true },
      {
        kind: 'destroy_cards',
        source: 'hand_or_discard',
        minAmount: 0,
        maxAmount: 1,
        target: 'self',
        prompt: 'Destroy a card from your hand or discard pile?',
        restoreToSourceAfterSelection: true,
      },
      {
        kind: 'choose_optional',
        prompt: "Put a level-3 Treasure in play on the bottom of Tressa's Vault and put its top card into play?",
        acceptCondition: { kind: 'has_eligible_card_in_zone', zone: 'player_cards_in_play', cardTypes: ['treasure'], treasureLevel: 3, target: 'source' },
        effects: [{ kind: 'cycle_specific_deck_with_in_play_treasure' }],
      },
    ],
    hp: 10,
    chargeThreshold: 4,
    startHand: ['crystal', 'crystal', 'crystal', 'transmaterium', 'spark'],
    startDeck: ['translocate', 'crystal', 'crystal', 'crystal', 'crystal'],
    hasSpecificDeck: true,
    specificDeckName: "Tressa's Vault",
    specificDeck: levelThreeTreasures,
    specificDeckShuffled: true,
    specificDeckDisplay: 'top_revealed',
    specificDeckBack: 'treasure_3',
    setupEffects: [{ kind: 'reveal_specific_deck', mode: 'put_one_into_play' }],
    breaches: [
      makeBreach(1, false, null, false),
      makeBreach(2, false, 'west'),
      makeBreach(3, false, 'east'),
      makeBreach(4, false, 'west'),
    ],
  }
}
