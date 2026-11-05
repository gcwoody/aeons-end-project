import type { CardEffect, CardEffectBlock, NemesisCardDef, NemesisDef, NemesisDiscardCost, NemesisEffectBlock } from '../../../types'
import { buildTieredNemesisDeck } from '../../wave1/nemeses/cards'

type Tier = NemesisCardDef['tier']
const noCardEffects: CardEffectBlock[] = []
const immediate = (...effects: CardEffect[]): NemesisEffectBlock[] => [{ trigger: 'immediately', effects }]
const persistent = (...effects: CardEffect[]): NemesisEffectBlock[] => [{ trigger: 'persistent', effects }]
const powerResolved = (...effects: CardEffect[]): NemesisEffectBlock[] => [{ trigger: 'power_resolved', effects }]

function makeCard(
  id: string,
  name: string,
  type: NemesisCardDef['type'],
  tier: Tier,
  extra: Pick<NemesisCardDef, 'life' | 'power'> = {},
): NemesisCardDef {
  return { id, name, type, tier, cost: 0, set: 'wave9_twice_dead_prophet', effects: noCardEffects, ...extra }
}

function prophecy(
  id: string,
  name: string,
  power: number,
  cost: NemesisDiscardCost[],
): NemesisCardDef {
  return {
    ...makeCard(id, name, 'power', 0, { power }),
    underCardDisplay: 'attached_quarter',
    returnToSpecificDeckOnResolve: true,
    returnToSpecificDeckOnDiscard: true,
    discardUnderCardsToNemesisDiscard: true,
    toDiscard: { costs: cost },
    nemesisEffects: [
      { trigger: 'immediately', effects: [{ kind: 'attach_bottom_nemesis_deck_card_under_source' }] },
      { trigger: 'power_resolved', effects: [{ kind: 'play_card_under_source_nemesis_card' }] },
    ],
  }
}

export const TWICE_DEAD_PROPHET_NEMESIS_CARDS: Record<string, NemesisCardDef> = {
  deathless_return: {
    ...makeCard('deathless_return', 'Deathless Return', 'power', 1, { power: 3 }),
    nemesisEffects: powerResolved({ kind: 'gain_nemesis_counter', counter: 'nemesis', amount: 3 }),
  },
  graven_thing: {
    ...makeCard('graven_thing', 'Graven Thing', 'minion', 1, { life: 5 }),
    nemesisEffects: persistent(
      { kind: 'deal_player_damage', amount: 1, target: 'any_player' },
      { kind: 'gain_nemesis_counter', counter: 'nemesis', amount: 1 },
    ),
  },
  muster_twice_dead_prophet: {
    ...makeCard('muster_twice_dead_prophet', 'Muster', 'attack', 1),
    nemesisEffects: immediate({
      kind: 'choose_one', prompt: 'Choose one effect', options: [
        {
          id: 'prophet_life',
          label: 'Twice-Dead Prophet gains 10 life. You may place the top card of the Prophecy deck on the bottom of that deck.',
          effects: [
            { kind: 'gain_life', amount: 10, target: 'nemesis' },
            {
              kind: 'choose_optional', prompt: 'Place the top card of the Prophecy deck on the bottom?',
              effects: [{ kind: 'move_top_nemesis_specific_deck_card_to_bottom' }],
              skipIfUnavailable: true,
              acceptCondition: { kind: 'specific_deck_card_count', comparison: 'greater_than', count: 0 },
            },
          ],
        },
        { id: 'gravehold_damage', label: 'Gravehold suffers 5 damage', effects: [{ kind: 'deal_damage', amount: 5, target: 'gravehold' }] },
      ],
    }),
  },
  dreaded_rebirth: {
    ...makeCard('dreaded_rebirth', 'Dreaded Rebirth', 'power', 2, { power: 2 }),
    nemesisEffects: powerResolved(
      {
        kind: 'conditional', condition: { kind: 'nemesis_life', comparison: 'at_most', amount: 50 },
        effects: [
          { kind: 'gain_life', amount: 10, target: 'nemesis' },
          { kind: 'deal_damage', amount: 3, target: 'gravehold' },
        ],
      },
      {
        kind: 'conditional', condition: { kind: 'nemesis_life', comparison: 'greater_than', amount: 50 },
        effects: [
          { kind: 'deal_player_damage', amount: 4, target: 'any_player' },
          { kind: 'gain_nemesis_counter', counter: 'nemesis', amount: 2 },
        ],
      },
    ),
  },
  vigil: {
    ...makeCard('vigil', 'Vigil', 'minion', 2, { life: 10 }),
    nemesisEffects: [
      {
        trigger: 'persistent', condition: { kind: 'nemesis_life', comparison: 'at_most', amount: 50 },
        effects: [{ kind: 'gain_life', amount: 5, target: 'nemesis' }],
      },
      {
        trigger: 'persistent', condition: { kind: 'nemesis_life', comparison: 'greater_than', amount: 50 },
        effects: [{ kind: 'deal_damage', amount: 3, target: 'gravehold' }],
      },
    ],
  },
  vile_petition: {
    ...makeCard('vile_petition', 'Vile Petition', 'power', 2, { power: 2 }),
    toDiscard: { costs: [{ kind: 'spend_aether', amount: 7 }] },
    nemesisEffects: powerResolved({
      kind: 'play_top_nemesis_specific_deck_card',
      checkDrawAbility: true,
      powerTokensToRemove: 1,
      protectPowerTokensThisTurn: true,
    }),
  },
  absorb: {
    ...makeCard('absorb', 'Absorb', 'attack', 3),
    nemesisEffects: immediate({
      kind: 'conditional', condition: { kind: 'nemesis_life', comparison: 'at_most', amount: 30 },
      effects: [
        { kind: 'gain_life', amount: 10, target: 'nemesis' },
        { kind: 'discard_prepped_spells_collectively', amount: 2, mostExpensive: true },
      ],
      elseEffects: [{ kind: 'deal_damage_divided', amount: 7, target: 'all_players' }],
    }),
  },
  omen_hulk: {
    ...makeCard('omen_hulk', 'Omen Hulk', 'minion', 3, { life: 15 }),
    nemesisEffects: persistent(
      { kind: 'deal_damage', amount: 2, target: 'source_minion' },
      { kind: 'deal_player_damage', amount: 3, target: 'any_player' },
      { kind: 'remove_nemesis_power_token' },
    ),
  },
  withstand: {
    ...makeCard('withstand', 'Withstand', 'attack', 3),
    nemesisEffects: immediate(
      {
        kind: 'conditional', condition: { kind: 'nemesis_life', comparison: 'at_most', amount: 30 },
        effects: [{ kind: 'gain_life', amount: 15, target: 'nemesis' }],
      },
      {
        kind: 'conditional', condition: { kind: 'nemesis_life', comparison: 'greater_than', amount: 30 },
        effects: [{ kind: 'deal_damage', amount: 8, target: 'gravehold' }],
      },
    ),
  },
  prophecy_of_fire: prophecy('prophecy_of_fire', 'Prophecy of Fire', 3, [{ kind: 'spend_aether', amount: 8 }]),
  prophecy_of_ruin: prophecy('prophecy_of_ruin', 'Prophecy of Ruin', 2, [{ kind: 'lose_charge', amount: 4 }]),
  prophecy_of_the_storm: prophecy('prophecy_of_the_storm', 'Prophecy of the Storm', 2, [{ kind: 'spend_aether', amount: 7 }]),
}

export const TWICE_DEAD_PROPHET_UNIQUE_CARDS_BY_TIER: Record<1 | 2 | 3, string[]> = {
  1: ['deathless_return', 'graven_thing', 'muster_twice_dead_prophet'],
  2: ['dreaded_rebirth', 'vigil', 'vile_petition'],
  3: ['absorb', 'omen_hulk', 'withstand'],
}

function buildProphecyDeck(): string[] {
  const cards = [
    'prophecy_of_fire', 'prophecy_of_fire',
    'prophecy_of_ruin', 'prophecy_of_ruin',
    'prophecy_of_the_storm', 'prophecy_of_the_storm',
  ]
  for (let index = cards.length - 1; index > 0; index--) {
    const swap = Math.floor(Math.random() * (index + 1))
    ;[cards[index], cards[swap]] = [cards[swap]!, cards[index]!]
  }
  return cards
}

export const twiceDeadProphet: NemesisDef = {
  type: 'twice_dead_prophet',
  name: 'Twice-Dead Prophet',
  wave: 9,
  hp: 50,
  noLifeMaximum: true,
  lifeLossThreshold: 99,
  deckEmptyLoses: true,
  difficultyLevel: 6,
  uniqueCardIdsByTier: TWICE_DEAD_PROPHET_UNIQUE_CARDS_BY_TIER,
  basicCardsPerTier: { 1: 3, 2: 5, 3: 7 },
  strikeCardIds: [],
  startingCounters: { nemesis: 2 },
  standardRules: {},
  increasedDifficultyRules: {},
  specificDeckVisibility: 'hidden',
  specificDeckTopAlwaysRevealed: true,
  specificDeckName: 'Prophecy deck',
  rulesModuleId: 'twice_dead_prophet',
  deckBuilder: () => buildTieredNemesisDeck(twiceDeadProphet),
  specificDeckBuilder: buildProphecyDeck,
}
