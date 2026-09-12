import type { CardEffect, CardEffectBlock, EffectAmount, NemesisCardDef, NemesisDef, StrikeCardDef } from '../../types'

type Tier = 1 | 2 | 3
type RandomSource = () => number

const NO_EFFECTS: CardEffectBlock[] = []

function makeNemesisCard(
  id: string,
  name: string,
  type: NemesisCardDef['type'],
  tier: Tier,
  extra: Pick<NemesisCardDef, 'life' | 'power'> = {},
): NemesisCardDef {
  return {
    id, name, type, tier, cost: 0, set: 'basic_nemesis',
    effects: NO_EFFECTS,
    ...extra,
  }
}

function makeStrikeCard(id: string, name: string, effects: CardEffect[] = []): StrikeCardDef {
  return {
    id, name, type: 'strike', cost: 0, set: 'rageborne',
    effects: effects.length > 0
      ? [{ trigger: { kind: 'on_cast' as const }, effects }]
      : NO_EFFECTS,
  }
}

const unleash = (amount = 1): CardEffect => ({ kind: 'unleash', amount })
const immediate = (...effects: CardEffect[]) => [{ trigger: 'immediately' as const, effects }]
const persistent = (...effects: CardEffect[]) => [{ trigger: 'persistent' as const, effects }]
const powerResolved = (...effects: CardEffect[]) => [{ trigger: 'power_resolved' as const, effects }]
const anyPlayerDamage = (amount: EffectAmount) => ({
  kind: 'deal_player_damage' as const, amount, target: 'any_player' as const,
})
const lowestLifeDamage = (amount: number) => ({
  kind: 'deal_player_damage' as const, amount, target: 'any_player' as const, selection: 'lowest_hp' as const,
})
const mostBreachesDamage = (amount: number) => ({
  kind: 'deal_player_damage' as const, amount, target: 'any_player' as const, selection: 'most_opened_breaches' as const,
})
const mostChargesDamage = (amount: number) => ({
  kind: 'deal_player_damage' as const, amount, target: 'any_player' as const, selection: 'most_charges' as const,
})
const mostPreppedDamage = (amount: Extract<CardEffect, { kind: 'deal_player_damage' }>['amount']) => ({
  kind: 'deal_player_damage' as const, amount, target: 'any_player' as const, selection: 'most_prepped_spells' as const,
})

export const BASIC_NEMESIS_CARDS: Record<string, NemesisCardDef> = {
  agony_field: {
    ...makeNemesisCard('agony_field', 'Agony Field', 'power', 1, { power: 2 }),
    nemesisEffects: powerResolved(
      unleash(),
      { kind: 'discard_cards', source: 'hand', amount: 3, target: 'any_player' },
      { kind: 'draw_cards', amount: 1, target: 'self' },
    ),
    toDiscard: { costs: [{ kind: 'destroy_cards', source: 'hand', amount: 1, minCost: 2 }] },
  },
  bane_sire: { ...makeNemesisCard('bane_sire', 'Bane Sire', 'minion', 1, { life: 6 }), nemesisEffects: persistent(unleash()) },
  bleed_static: {
    ...makeNemesisCard('bleed_static', 'Bleed Static', 'power', 1, { power: 3 }),
    nemesisEffects: powerResolved(mostPreppedDamage({ kind: 'per_prepped_spell', base: 0, amountPerSpell: 2 })),
  },
  eye_of_nothing: {
    ...makeNemesisCard('eye_of_nothing', 'Eye of Nothing', 'power', 1, { power: 2 }),
    nemesisEffects: powerResolved(unleash(2)),
    toDiscard: { costs: [{ kind: 'spend_aether', amount: 6 }] },
  },
  haze_spewer: {
    ...makeNemesisCard('haze_spewer', 'Haze Spewer', 'minion', 1, { life: 5 }),
    nemesisEffects: persistent(
      { kind: 'deal_damage', amount: { kind: 'current_minion_life' }, target: 'gravehold' },
      { kind: 'deal_damage', amount: 1, target: 'source_minion' },
    ),
  },
  skewer: {
    ...makeNemesisCard('skewer', 'Skewer', 'attack', 1),
    nemesisEffects: immediate(unleash(), anyPlayerDamage(3), { kind: 'draw_cards', amount: 1, target: 'self' }),
  },
  slaughter: { ...makeNemesisCard('slaughter', 'Slaughter', 'attack', 1), nemesisEffects: immediate(unleash(), { kind: 'deal_damage', amount: 3, target: 'gravehold' }) },
  woven_sky: {
    ...makeNemesisCard('woven_sky', 'Woven Sky', 'power', 1, { power: 2 }),
    nemesisEffects: powerResolved(unleash(), anyPlayerDamage(4)),
    toDiscard: { costs: [{ kind: 'discard_cards', source: 'hand', amount: 3 }] },
  },

  awaken: {
    ...makeNemesisCard('awaken', 'Awaken', 'attack', 2),
    nemesisEffects: immediate(
      {
        kind: 'choose_one', prompt: 'Choose the Awaken effect', options: [
          { id: 'rage', label: 'Unleash twice and damage Gravehold', effects: [unleash(2), { kind: 'deal_damage', amount: 3, target: 'gravehold' }] },
          { id: 'return_minion', label: 'Return the most recently discarded Minion', effects: [{ kind: 'return_last_discarded_minion' }] },
        ],
      },
    ),
  },
  cauterizer: {
    ...makeNemesisCard('cauterizer', 'Cauterizer', 'minion', 2, { life: 3 }),
    damagePerInstance: 1,
  },
  dispel: {
    ...makeNemesisCard('dispel', 'Dispel', 'attack', 2),
    nemesisEffects: immediate(unleash(2), { kind: 'discard_prepped_spells', amount: 1, target: 'any_player', selection: 'most_prepped_spells', mostExpensive: true }),
  },
  lay_waste: { ...makeNemesisCard('lay_waste', 'Lay Waste', 'attack', 2), nemesisEffects: immediate(unleash(2), anyPlayerDamage(2)) },
  needlemaw: { ...makeNemesisCard('needlemaw', 'Needlemaw', 'minion', 2, { life: 11 }), nemesisEffects: persistent({ kind: 'deal_damage', amount: 2, target: 'gravehold' }) },
  pulverizing_ray: {
    ...makeNemesisCard('pulverizing_ray', 'Pulverizing Ray', 'power', 2, { power: 1 }),
    nemesisEffects: powerResolved({
      kind: 'deal_gravehold_damage_with_gem_discard', amount: 18, maxGems: 6, reductionPerGem: 3,
    }),
  },
  venomite: {
    ...makeNemesisCard('venomite', 'Venomite', 'minion', 2, { life: 9 }),
    nemesisEffects: persistent({
      kind: 'choose_one', prompt: 'Choose the Venomite effect', options: [
        { id: 'damage', label: 'Lowest-life player suffers 2 damage', effects: [lowestLifeDamage(2)] },
        { id: 'discard', label: 'Discard a prepped spell costing 3 or more', effects: [{ kind: 'discard_prepped_spells', amount: 1, minCost: 3, target: 'any_player' }] },
      ],
    }),
  },

  doom_aegis: {
    ...makeNemesisCard('doom_aegis', 'Doom Aegis', 'power', 3, { power: 1 }),
    nemesisEffects: powerResolved(mostChargesDamage(4), { kind: 'lose_all_charge', target: 'any_player' }),
    toDiscard: { costs: [{ kind: 'spend_aether', amount: 7 }] },
  },
  gather_darkness: {
    ...makeNemesisCard('gather_darkness', 'Gather Darkness', 'attack', 3),
    nemesisEffects: immediate(
      { kind: 'shuffle_discard_into_deck', target: 'any_player' },
      { kind: 'destroy_top_cards', amount: 4, target: 'self' },
      unleash(2),
    ),
  },
  jagged_one: { ...makeNemesisCard('jagged_one', 'Jagged One', 'minion', 3, { life: 14 }), nemesisEffects: persistent(unleash(2)) },
  obliterate: {
    ...makeNemesisCard('obliterate', 'Obliterate', 'attack', 3),
    nemesisEffects: immediate(
      unleash(2),
      { kind: 'choose_one', prompt: 'Choose the Obliterate effect', options: [
        { id: 'destroy', label: 'Destroy four cards in hand', effects: [{ kind: 'destroy_cards', source: 'hand', minAmount: 4, maxAmount: 4 }] },
        { id: 'damage', label: 'Suffer 4 damage', effects: [mostBreachesDamage(4)] },
      ] },
    ),
  },
  reality_rupture: {
    ...makeNemesisCard('reality_rupture', 'Reality Rupture', 'power', 3, { power: 1 }),
    toDiscard: { costs: [{ kind: 'destroy_prepped_spells', amount: 2, minCost: 3 }] },
  },
  sunder: {
    ...makeNemesisCard('sunder', 'Sunder', 'attack', 3),
    nemesisEffects: immediate({
      kind: 'choose_one', prompt: 'Choose the Sunder effect', options: [
        { id: 'damage', label: 'Damage Gravehold and the lowest-life player', effects: [{ kind: 'deal_damage', amount: 4, target: 'gravehold' }, lowestLifeDamage(4)] },
        { id: 'shuffle', label: 'Shuffle Nemesis turn-order cards into the deck', effects: [{ kind: 'shuffle_nemesis_turn_order_cards' }] },
      ],
    }),
  },
  topple: { ...makeNemesisCard('topple', 'Topple', 'attack', 3), nemesisEffects: immediate(unleash(2), { kind: 'deal_damage', amount: 4, target: 'gravehold' }) },
}

export const RAGEBORNE_UNIQUE_CARDS: Record<string, NemesisCardDef> = {
  cleave: { ...makeNemesisCard('cleave', 'Cleave', 'attack', 1), nemesisEffects: immediate({ kind: 'resolve_strike' }) },
  provoker: {
    ...makeNemesisCard('provoker', 'Provoker', 'minion', 1, { life: 5 }),
    nemesisEffects: persistent({ kind: 'deal_damage', amount: { kind: 'per_nemesis_counter', counter: 'fury', base: 0, amountPerCounter: 1 }, target: 'gravehold' }),
  },
  unrelenting_ire: {
    ...makeNemesisCard('unrelenting_ire', 'Unrelenting Ire', 'attack', 1),
    nemesisEffects: [
      ...immediate(unleash()),
      { trigger: 'immediately', condition: { kind: 'nemesis_turn_order_discard_count', comparison: 'at_least', count: 2 }, effects: [unleash(2)] },
    ],
  },
  blood_cry: {
    ...makeNemesisCard('blood_cry', 'Blood Cry', 'power', 2, { power: 2 }),
    nemesisEffects: powerResolved(unleash(4)),
    toDiscard: { costs: [{ kind: 'lose_charge', amount: 4 }] },
  },
  invoke_carnage: {
    ...makeNemesisCard('invoke_carnage', 'Invoke Carnage', 'power', 2, { power: 2 }),
    nemesisEffects: powerResolved(unleash(), { kind: 'deal_player_damage', amount: { kind: 'per_nemesis_counter', counter: 'fury', base: 1, amountPerCounter: 1 }, target: 'any_player' }),
    toDiscard: { costs: [{ kind: 'spend_aether', amount: 7 }] },
  },
  scorn: {
    ...makeNemesisCard('scorn', 'Scorn', 'minion', 2, { life: 9 }),
    nemesisEffects: persistent({
      kind: 'choose_one', prompt: 'Choose the Scorn effect', options: [
        { id: 'damage', label: 'Gravehold suffers 3 damage', effects: [{ kind: 'deal_damage', amount: 3, target: 'gravehold' }] },
        { id: 'unleash', label: 'Unleash twice', effects: [unleash(2)] },
      ],
    }),
  },
  avatar_of_wrath: { ...makeNemesisCard('avatar_of_wrath', 'Avatar of Wrath', 'minion', 3, { life: 16 }), nemesisEffects: persistent({ kind: 'resolve_strike' }) },
  onslaught: {
    ...makeNemesisCard('onslaught', 'Onslaught', 'attack', 3),
    nemesisEffects: immediate(
      unleash(3),
      { kind: 'discard_cards_collectively', amount: { kind: 'per_nemesis_counter', counter: 'fury', base: 0, amountPerCounter: 1 }, source: 'hand' },
    ),
  },
  rolling_death: {
    ...makeNemesisCard('rolling_death', 'Rolling Death', 'power', 3, { power: 2 }),
    nemesisEffects: powerResolved({ kind: 'resolve_strike', count: 2 }),
    toDiscard: { costs: [{ kind: 'spend_aether', amount: 8 }] },
  },
}

export const RAGEBORNE_STRIKE_CARDS: Record<string, StrikeCardDef> = {
  convoke: makeStrikeCard('convoke', 'Convoke', [anyPlayerDamage(4)]),
  devastate: makeStrikeCard('devastate', 'Devastate', [{ kind: 'deal_damage', amount: 5, target: 'gravehold' }]),
  eviscerate: makeStrikeCard('eviscerate', 'Eviscerate', [lowestLifeDamage(2)]),
  frenzy: makeStrikeCard('frenzy', 'Frenzy', [mostBreachesDamage(3)]),
  raze: makeStrikeCard('raze', 'Raze', [{ kind: 'deal_damage', amount: 3, target: 'gravehold' }, anyPlayerDamage(1)]),
  seize: makeStrikeCard('seize', 'Seize', [{ kind: 'discard_prepped_spells', amount: 2, target: 'any_player', mostExpensive: true }]),
}

export const BASIC_NEMESIS_CARDS_BY_TIER: Record<Tier, string[]> = {
  1: ['agony_field', 'bane_sire', 'bleed_static', 'eye_of_nothing', 'haze_spewer', 'skewer', 'slaughter', 'woven_sky'],
  2: ['awaken', 'cauterizer', 'dispel', 'lay_waste', 'needlemaw', 'pulverizing_ray', 'venomite'],
  3: ['doom_aegis', 'gather_darkness', 'jagged_one', 'obliterate', 'reality_rupture', 'sunder', 'topple'],
}

export const RAGEBORNE_UNIQUE_CARDS_BY_TIER: Record<Tier, string[]> = {
  1: ['cleave', 'provoker', 'unrelenting_ire'],
  2: ['blood_cry', 'invoke_carnage', 'scorn'],
  3: ['avatar_of_wrath', 'onslaught', 'rolling_death'],
}

export const NEMESIS_CARDS: Record<string, NemesisCardDef | StrikeCardDef> = {
  ...BASIC_NEMESIS_CARDS,
  ...RAGEBORNE_UNIQUE_CARDS,
  ...RAGEBORNE_STRIKE_CARDS,
}

export const rageborne: NemesisDef = {
  type: 'rageborne',
  name: 'Rageborne',
  hp: 70,
  difficultyLevel: 2,
  uniqueCardIdsByTier: RAGEBORNE_UNIQUE_CARDS_BY_TIER,
  basicCardsPerTier: { 1: 3, 2: 5, 3: 7 },
  strikeCardIds: Object.keys(RAGEBORNE_STRIKE_CARDS),
  startingCounters: { fury: 1 },
  standardRules: { furyLossAfterStrike: 3, endTurnStrikeThreshold: 4 },
  increasedDifficultyRules: { furyLossAfterStrike: 1 },
  unleashEffects: [{ kind: 'gain_nemesis_counter', counter: 'fury', amount: 1 } as CardEffect],
}

function shuffleWithRandom<T>(items: T[], random: RandomSource): T[] {
  const result = [...items]
  for (let index = result.length - 1; index > 0; index--) {
    const swapIndex = Math.floor(random() * (index + 1))
    ;[result[index], result[swapIndex]] = [result[swapIndex]!, result[index]!]
  }
  return result
}

/** Build the two-player Rageborne deck in tier order, with each tier shuffled separately. */
export function buildRageborneDeck(random: RandomSource = Math.random): string[] {
  const deck: string[] = []
  for (const tier of [1, 2, 3] as const) {
    const basic = shuffleWithRandom(BASIC_NEMESIS_CARDS_BY_TIER[tier], random)
      .slice(0, rageborne.basicCardsPerTier[tier])
    const tierCards = [...RAGEBORNE_UNIQUE_CARDS_BY_TIER[tier], ...basic]
    deck.push(...shuffleWithRandom(tierCards, random))
  }
  return deck
}

export function buildRageborneStrikeDeck(random: RandomSource = Math.random): string[] {
  return shuffleWithRandom(rageborne.strikeCardIds, random)
}
