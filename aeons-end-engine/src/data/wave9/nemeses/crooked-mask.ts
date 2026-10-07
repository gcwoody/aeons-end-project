import type { CardEffect, CardEffectBlock, CardDef, NemesisCardDef, NemesisDef } from '../../../types'
import { buildTieredNemesisDeck } from '../../wave1/nemeses/cards'

type Tier = 1 | 2 | 3
const noEffects: CardEffectBlock[] = []
const immediate = (...effects: CardEffect[]) => [{ trigger: 'immediately' as const, effects }]
const persistent = (...effects: CardEffect[]) => [{ trigger: 'persistent' as const, effects }]
const powerResolved = (...effects: CardEffect[]) => [{ trigger: 'power_resolved' as const, effects }]
const unleash = (amount = 1): CardEffect => ({ kind: 'unleash', amount })

function makeNemesisCard(id: string, name: string, type: NemesisCardDef['type'], tier: Tier, extra: Pick<NemesisCardDef, 'life' | 'power'> = {}): NemesisCardDef {
  return { id, name, type, tier, cost: 0, set: 'wave9_crooked_mask', effects: noEffects, ...extra }
}

const corruptionCard = (id: string, name: string, effects: CardEffect[]): CardDef => ({
  id, name, type: 'corruption', cost: 0, set: 'wave9_crooked_mask_corruption',
  // resolve_corruptions returns the resolved physical card after On Play has
  // finished. Keep that lifecycle in the shared resolver to return it once.
  effects: [{ trigger: { kind: 'on_play' }, effects }],
})

export const CROOKED_MASK_UNIQUE_CARDS: Record<string, NemesisCardDef> = {
  burden_btb: { ...makeNemesisCard('burden_btb', 'Burden (Beyond the Breach)', 'attack', 1), nemesisEffects: immediate({ kind: 'gain_corruptions_collectively', amount: 2, destination: 'deck_top' }, { kind: 'focus_breach', target: 'any_player' }) },
  corrupter_btb: { ...makeNemesisCard('corrupter_btb', 'Corrupter (Beyond the Breach)', 'minion', 1, { life: 6 }), onDamage: [{ kind: 'gain_corruptions', amount: 1, target: 'self', destination: 'deck_top' }], nemesisEffects: persistent({ kind: 'deal_damage', amount: 1, target: 'gravehold' }) },
  tempt_btb: { ...makeNemesisCard('tempt_btb', 'Tempt (Beyond the Breach)', 'attack', 1), nemesisEffects: immediate({ kind: 'tempt_highest_crystals' }) },
  pain_sower_btb: { ...makeNemesisCard('pain_sower_btb', 'Pain Sower (Beyond the Breach)', 'minion', 2, { life: 11 }), nemesisEffects: persistent({ kind: 'deal_player_damage', amount: 2, target: 'any_player' }, { kind: 'focus_breach', target: 'ally' }) },
  twisting_madness_btb: { ...makeNemesisCard('twisting_madness_btb', 'Twisting Madness (Beyond the Breach)', 'power', 2, { power: 2 }), nemesisEffects: powerResolved({ kind: 'gain_life', amount: 3, target: 'gravehold' }, { kind: 'gain_life', amount: 13, target: 'nemesis' }), toDiscard: { costs: [{ kind: 'discard_cards', source: 'hand', amount: 4, drawAfter: 1 }] } },
  vex_btb: { ...makeNemesisCard('vex_btb', 'Vex (Beyond the Breach)', 'attack', 2), nemesisEffects: immediate({ kind: 'discard_nemesis_top_cards', amount: 2, graveholdDamagePerTierThree: 4 }) },
  afflict_crooked_mask_btb: { ...makeNemesisCard('afflict_crooked_mask_btb', 'Afflict (Crooked Mask) (Beyond the Breach)', 'attack', 3), nemesisEffects: immediate({ kind: 'afflict_two_players_with_corruptions', corruptionAmount: 2 }) },
  bedlam_sage_btb: { ...makeNemesisCard('bedlam_sage_btb', 'Bedlam Sage (Beyond the Breach)', 'minion', 2, { life: 14 }), nemesisEffects: persistent({ kind: 'gain_life', amount: 2, target: 'gravehold' }, { kind: 'deal_player_damage', amount: 3, target: 'any_player', selection: 'highest_hp' }) },
  ruin_priest_btb: { ...makeNemesisCard('ruin_priest_btb', 'Ruin Priest (Beyond the Breach)', 'minion', 3, { life: 17 }), nemesisEffects: persistent({ kind: 'discard_noncorruptions_and_gain_corruptions', discardAmount: 3, corruptionAmount: 3, destination: 'hand' }) },
}

export const CROOKED_MASK_UNIQUE_CARDS_BY_TIER: Record<Tier, string[]> = {
  1: ['burden_btb', 'corrupter_btb', 'tempt_btb'],
  2: ['pain_sower_btb', 'twisting_madness_btb', 'vex_btb'],
  3: ['afflict_crooked_mask_btb', 'bedlam_sage_btb', 'ruin_priest_btb'],
}

export const CROOKED_MASK_CORRUPTION_CARDS: Record<string, CardDef> = {
  blind_abandon_btb: corruptionCard('blind_abandon_btb', 'Blind Abandon (Beyond the Breach)', [{ kind: 'deal_player_damage', amount: 1, target: 'self' }, { kind: 'choose_optional', prompt: 'You may destroy a non-Corruption card in hand', effects: [{ kind: 'destroy_cards', source: 'hand', minAmount: 1, maxAmount: 1, cardTypes: ['gem', 'relic', 'spell', 'treasure'] }] }]),
  contagion_btb: corruptionCard('contagion_btb', 'Contagion (Beyond the Breach)', [{ kind: 'deal_player_damage', amount: 1, target: 'self' }, { kind: 'return_cards_to_hand', source: 'discard', amount: 1, minAmount: 0, cardTypes: ['gem', 'relic', 'spell', 'treasure', 'corruption'], maxCost: 0 }]),
  delirium_veil_btb: corruptionCard('delirium_veil_btb', 'Delirium Veil (Beyond the Breach)', [{ kind: 'deal_damage', amount: 2, target: 'gravehold' }, { kind: 'focus_breach', target: 'self' }]),
  dire_wisdom_btb: corruptionCard('dire_wisdom_btb', 'Dire Wisdom (Beyond the Breach)', [{ kind: 'gain_card_from_market', cardType: 'spell' }, { kind: 'gain_corruptions', amount: 3, target: 'self', destination: 'deck_top' }]),
  endless_hunger_btb: corruptionCard('endless_hunger_btb', 'Endless Hunger (Beyond the Breach)', [{ kind: 'deal_damage', amount: 3, target: 'gravehold' }, { kind: 'gain_life', amount: 2, target: 'self' }]),
  fever_of_war_btb: corruptionCard('fever_of_war_btb', 'Fever of War (Beyond the Breach)', [{ kind: 'deal_player_damage', amount: 1, target: 'self' }, { kind: 'deal_damage', amount: 2, target: 'nemesis_or_minion' }]),
  grim_sight_btb: corruptionCard('grim_sight_btb', 'Grim Sight (Beyond the Breach)', [{ kind: 'deal_damage', amount: 2, target: 'gravehold' }, { kind: 'look_at_top_card_may_destroy' }]),
  insatiable_avarice_btb: corruptionCard('insatiable_avarice_btb', 'Insatiable Avarice (Beyond the Breach)', [{ kind: 'deal_player_damage', amount: 2, target: 'self' }, { kind: 'gain_least_expensive_card', cardType: 'gem', destination: 'hand' }]),
  lust_for_power_btb: corruptionCard('lust_for_power_btb', 'Lust for Power (Beyond the Breach)', [{ kind: 'deal_player_damage', amount: 1, target: 'self' }, { kind: 'gain_charge', amount: 1, target: 'self' }]),
  nothingness_btb: corruptionCard('nothingness_btb', 'Nothingness (Beyond the Breach)', [{ kind: 'discard_noncorruption_cards', amount: 2 }, { kind: 'deal_player_damage', amount: 2, target: 'self' }, { kind: 'shuffle_turn_order_card', damage: 0, target: 'any_player' }]),
  reckless_might_btb: corruptionCard('reckless_might_btb', 'Reckless Might (Beyond the Breach)', [{ kind: 'gain_card_from_market', cardType: 'relic', destination: 'deck_top' }, { kind: 'deal_player_damage_by_last_selected_cost', divisor: 2, roundUp: true, target: 'self' }]),
}

const corruptionIds = Object.keys(CROOKED_MASK_CORRUPTION_CARDS)
function shuffled<T>(items: T[]): T[] {
  const result = [...items]
  for (let index = result.length - 1; index > 0; index--) {
    const swap = Math.floor(Math.random() * (index + 1))
    ;[result[index], result[swap]] = [result[swap]!, result[index]!]
  }
  return result
}

export const crookedMask: NemesisDef = {
  type: 'crooked_mask',
  name: 'Crooked Mask',
  wave: 9,
  hp: 70,
  difficultyLevel: 5,
  uniqueCardIdsByTier: CROOKED_MASK_UNIQUE_CARDS_BY_TIER,
  basicCardsPerTier: { 1: 3, 2: 5, 3: 7 },
  strikeCardIds: [],
  startingCounters: {},
  standardRules: {},
  increasedDifficultyRules: {},
  rulesModuleId: 'crooked_mask',
  deckBuilder: () => buildTieredNemesisDeck(crookedMask),
  corruptionDeckBuilder: () => shuffled(corruptionIds),
}
