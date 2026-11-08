import type { CardDef, CardEffect, CardEffectBlock, NemesisCardDef, NemesisDef, NemesisEffectBlock } from '../../../types'
import { buildTieredNemesisDeck } from '../../wave1/nemeses/cards'

type Tier = NemesisCardDef['tier']
const noCardEffects: CardEffectBlock[] = []
const immediate = (...effects: CardEffect[]): NemesisEffectBlock[] => [{ trigger: 'immediately', effects }]
const persistent = (...effects: CardEffect[]): NemesisEffectBlock[] => [{ trigger: 'persistent', effects }]
const powerResolved = (...effects: CardEffect[]): NemesisEffectBlock[] => [{ trigger: 'power_resolved', effects }]
const unleash = (amount = 1): CardEffect => ({ kind: 'unleash', amount })

function makeCard(
  id: string,
  name: string,
  type: NemesisCardDef['type'],
  tier: Tier,
  extra: Pick<NemesisCardDef, 'life' | 'power'> = {},
): NemesisCardDef {
  return { id, name, type, tier, cost: 0, set: 'wave9_the_timeless', effects: noCardEffects, ...extra }
}

export const THE_TIMELESS_NEMESIS_CARDS: Record<string, NemesisCardDef> = {
  bubbling_anachro: {
    ...makeCard('bubbling_anachro', 'Bubbling Anachro', 'minion', 1, { life: 6 }),
    nemesisEffects: persistent(
      { kind: 'deal_damage', amount: 2, target: 'gravehold' },
      { kind: 'discard_top_card', target: 'any_player', targetAvailability: 'full_or_max' },
    ),
  },
  subside: {
    ...makeCard('subside', 'Subside', 'attack', 1),
    nemesisEffects: immediate(
      { kind: 'exile_cards', source: 'hand', amount: 1, target: 'any_player', cardType: 'spell', targetAvailability: 'full_or_max' },
      { kind: 'deal_player_damage', amount: 3, target: 'self' },
    ),
  },
  infinity_warp: {
    ...makeCard('infinity_warp', 'Infinity Warp', 'attack', 1),
    nemesisEffects: immediate({ kind: 'summon_finality_from_specific_discard' }),
  },
  paradox_scourge: {
    ...makeCard('paradox_scourge', 'Paradox Scourge', 'minion', 2, { life: 10 }),
    onDamage: [{ kind: 'gain_nemesis_counter', counter: 'nemesis', amount: 1 }],
    nemesisEffects: persistent({
      kind: 'discard_cards', source: 'hand', amount: 1, target: 'any_player',
      mostExpensive: true, targetAvailability: 'full_or_max',
    }),
  },
  beyond_time_and_space: {
    ...makeCard('beyond_time_and_space', 'Beyond Time and Space', 'power', 2, { power: 2 }),
    setAsideWhenResolved: true,
    nemesisEffects: powerResolved({ kind: 'summon_finality_from_specific_discard' }),
  },
  crushing_eventuality: {
    ...makeCard('crushing_eventuality', 'Crushing Eventuality', 'power', 2, { power: 3 }),
    toDiscard: { costs: [{ kind: 'spend_aether', amount: 7 }] },
    nemesisEffects: powerResolved(
      unleash(2),
      { kind: 'exile_market_card_from_most_expensive_pile' },
      { kind: 'deal_player_damage', amount: 3, target: 'any_player', selection: 'fewest_cards_in_deck' },
    ),
  },
  ghastly_epoch: {
    ...makeCard('ghastly_epoch', 'Ghastly Epoch', 'power', 3, { power: 1 }),
    nemesisEffects: [{
      trigger: 'power_resolved',
      effects: [{
        kind: 'conditional',
        condition: { kind: 'specific_deck_top_card_cost', comparison: 'greater_than', amount: 0 },
        effects: [{ kind: 'deal_damage', amount: 6, target: 'gravehold' }],
      }, {
        kind: 'conditional',
        condition: { kind: 'specific_deck_top_card_cost', comparison: 'at_most', amount: 0 },
        effects: [{ kind: 'deal_damage', amount: 10, target: 'gravehold' }],
      }],
    }],
  },
  ossilith: {
    ...makeCard('ossilith', 'Ossilith', 'minion', 3, { life: 15 }),
    nemesisEffects: persistent(
      { kind: 'exile_cards', source: 'hand', amount: 1, target: 'any_player', targetAvailability: 'full_or_max' },
      { kind: 'deal_player_damage_by_last_selected_cost', divisor: 1, baseAmount: 5, reduceByCost: true, target: 'self' },
    ),
  },
  wipe: {
    ...makeCard('wipe', 'Wipe', 'attack', 3),
    nemesisEffects: immediate(
      { kind: 'exile_cards', source: 'hand', amount: 2, target: 'any_player', targetAvailability: 'full_or_max' },
      { kind: 'draw_cards', amount: 2, target: 'self' },
      { kind: 'deal_player_damage', amount: 4, target: 'self' },
    ),
  },
  finality: {
    ...makeCard('finality', 'Finality', 'minion', 0, { life: 5 }),
    increasedDifficultyLifeBonus: 1,
    returnToSpecificDiscardOnDefeat: true,
    nemesisEffects: [
      {
        trigger: 'persistent',
        condition: { kind: 'nemesis_difficulty_is', difficulty: 'increased' },
        effects: [
          { kind: 'exile_cards', source: 'hand', amount: 1, target: 'any_player', targetAvailability: 'full_or_max' },
          { kind: 'deal_damage', amount: 1, target: 'source_minion' },
        ],
      },
      {
        trigger: 'persistent',
        condition: { kind: 'nemesis_difficulty_is', difficulty: 'standard' },
        effects: [
          { kind: 'exile_cards', source: 'hand_or_discard', amount: 1, target: 'any_player', discardTopOnly: true, targetAvailability: 'full_or_max' },
          { kind: 'deal_damage', amount: 1, target: 'source_minion' },
        ],
      },
    ],
  },
}

export const CURSE_OF_EXHAUSTION: CardDef = {
  id: 'curse_of_exhaustion',
  name: 'Curse of Exhaustion',
  type: 'corruption',
  cost: 0,
  set: 'wave9_the_timeless',
  cannotBeDestroyed: true,
  cannotBeExiled: true,
  cannotBeConjured: true,
  resolveWhenInHand: true,
  resolveInHandDestination: 'discard',
  effects: [{
    trigger: { kind: 'on_play' },
    effects: [
      { kind: 'draw_cards', amount: 1, target: 'self' },
      {
        kind: 'choose_one', prompt: 'Choose one effect', layout: 'centered-prompt-cards', options: [
          { id: 'player_damage', label: 'Suffer 1 damage', effects: [{ kind: 'deal_player_damage', amount: 1, target: 'self' }] },
          { id: 'gravehold_damage', label: 'Gravehold suffers 2 damage', effects: [{ kind: 'deal_damage', amount: 2, target: 'gravehold' }] },
        ],
      },
      { kind: 'gain_nemesis_counter', counter: 'nemesis', amount: 1 },
    ],
  }],
}

export const THE_TIMELESS_NEMESIS_CARDS_WITH_CURSE: Record<string, NemesisCardDef | CardDef> = {
  ...THE_TIMELESS_NEMESIS_CARDS,
  curse_of_exhaustion: CURSE_OF_EXHAUSTION,
}

export const theTimeless: NemesisDef = {
  type: 'the_timeless',
  name: 'The Timeless',
  wave: 9,
  hp: 60,
  difficultyLevel: 7,
  uniqueCardIdsByTier: {
    1: ['bubbling_anachro', 'subside', 'infinity_warp'],
    2: ['paradox_scourge', 'beyond_time_and_space', 'crushing_eventuality'],
    3: ['ghastly_epoch', 'ossilith', 'wipe'],
  },
  basicCardsPerTier: { 1: 3, 2: 5, 3: 7 },
  strikeCardIds: [],
  startingCounters: { nemesis: 0 },
  standardRules: {},
  increasedDifficultyRules: {},
  specificDeckVisibility: 'revealed',
  specificDeckName: 'Exiled pile',
  specificPileKind: 'exiled',
  rulesModuleId: 'the_timeless',
  deckBuilder: () => buildTieredNemesisDeck(theTimeless),
  specificDeckBuilder: () => [],
  specificDiscardBuilder: () => Array.from({ length: 8 }, () => 'finality'),
}
