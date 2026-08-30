import {
  CardDef, GemCard, RelicCard, SpellCard, NemesisCard,
  BreachState, Direction, NemesisCardInPlay,
} from './types'

// ===== Rotation Helpers =====
// Clockwise rotation
const rotateCW = (d: Direction): Direction =>
  ({ east: 'south', south: 'west', west: 'north', north: 'open' }[d] as Direction)

function focusesToOpen(startDir: Direction): number {
  return { east: 4, south: 3, west: 2, north: 1 }[startDir]
}

function calcOpenCosts(startDir: Direction, focusCost: number): Record<Direction, number> {
  const result: Partial<Record<Direction, number>> = {}
  let dir = startDir
  let remaining = focusesToOpen(startDir)
  while (remaining > 0) {
    result[dir] = remaining * focusCost - (remaining - 1)
    dir = rotateCW(dir)
    remaining--
  }
  return result as Record<Direction, number>
}

// ===== Initial Cards =====
// Spark and Crystal are shared by all mages
export const spark: SpellCard = {
  id: 'spark', name: 'Spark', type: 'spell', cost: 0, set: 'base', damage: 1,
}

export const crystal: GemCard = {
  id: 'crystal', name: 'Crystal', type: 'gem', cost: 0, set: 'base', aetherValue: 1,
}

// Moonstone Shard is Jian's unique starting card
export const moonstoneShard: GemCard = {
  id: 'moonstone_shard', name: 'Moonstone Shard', type: 'gem', cost: 0, set: 'base',
  aetherValue: 1, conditionalAether: { amount: 1, condition: 'gem' },
}

// Buried Light is Brama's unique starting card
export const buriedLight: SpellCard = {
  id: 'buried_light', name: 'Buried Light', type: 'spell', cost: 0, set: 'base',
  damage: 1, bonusAether: 1,
}

// Lookup table for all initial cards (used by getCard)
export const INITIAL_CARDS: Record<string, CardDef> = {
  spark, crystal, moonstone_shard: moonstoneShard, buried_light: buriedLight,
}

// ===== Mage Unique Cards =====
export const MAGE_UNIQUE_CARDS: Record<string, string[]> = {
  jian: ['moonstone_shard'],
  brama: ['buried_light'],
}

// ===== Demo Market Cards =====
export const gem1: GemCard = {
  id: 'gem_1', name: 'Gem (2/2)', type: 'gem', cost: 2, set: 'demo', aetherValue: 2,
}
export const gem2: GemCard = {
  id: 'gem_2', name: 'Gem (3/2)', type: 'gem', cost: 3, set: 'demo', aetherValue: 2,
}
export const gem3: GemCard = {
  id: 'gem_3', name: 'Gem (4/3)', type: 'gem', cost: 4, set: 'demo', aetherValue: 3,
}
export const relic1: RelicCard = {
  id: 'relic_1', name: 'Relic (3: draw 2+1)', type: 'relic',
  cost: 3, set: 'demo', drawCount: 2, discardCount: 1,
}
export const relic2: RelicCard = {
  id: 'relic_2', name: 'Relic (5: draw 3+1)', type: 'relic',
  cost: 5, set: 'demo', drawCount: 3, discardCount: 1,
}
export const spell1: SpellCard = {
  id: 'spell_1', name: 'Spell (4/3)', type: 'spell', cost: 4, set: 'demo', damage: 3,
}
export const spell2: SpellCard = {
  id: 'spell_2', name: 'Spell (5/4)', type: 'spell', cost: 5, set: 'demo', damage: 4,
}
export const spell3: SpellCard = {
  id: 'spell_3', name: 'Spell (6/5)', type: 'spell', cost: 6, set: 'demo', damage: 5,
}
export const spell4: SpellCard = {
  id: 'spell_4', name: 'Spell (7/6)', type: 'spell', cost: 7, set: 'demo', damage: 6,
}

export const MARKET_CARDS: Record<string, CardDef> = {
  gem_1: gem1, gem_2: gem2, gem_3: gem3,
  relic_1: relic1, relic_2: relic2,
  spell_1: spell1, spell_2: spell2, spell_3: spell3, spell_4: spell4,
}

export function getCard(id: string): CardDef {
  return INITIAL_CARDS[id] ?? MARKET_CARDS[id] ?? NEMESIS_CARDS[id]
}

// ===== Nemesis Cards (Rageborne Demo) =====
function makeAttackCards(
  tier: 1 | 2 | 3, count: number, damage: number,
): Record<string, NemesisCard> {
  const result: Record<string, NemesisCard> = {}
  for (let i = 1; i <= count; i++) {
    const id = `attack_t${tier}_${i}`
    result[id] = {
      id, name: `Tier ${tier} Attack #${i}`, type: 'attack',
      cost: 0, set: 'rageborne', tier, damage,
    }
  }
  return result
}

export const NEMESIS_CARDS: Record<string, CardDef> = {
  ...makeAttackCards(1, 6, 1),
  ...makeAttackCards(2, 8, 2),
  ...makeAttackCards(3, 10, 3),
}

// ===== Breach Configuration =====
export function makeBreach(
  index: number, opened: boolean, startDir: Direction | null, focusCost: number,
): BreachState {
  if (opened) {
    return {
      index, opened: true, prepSpell: null,
      focusDirection: 'north', focusCost: 0, focusCount: 0, focusToOpen: 0,
      openCost: { east: 0, south: 0, west: 0, north: 0 },
      focusedThisTurn: false,
      damageBonus: index >= 3 ? 1 : 0,
    }
  }
  const dir = startDir!
  return {
    index, opened: false, prepSpell: null,
    focusDirection: dir, focusCost, focusCount: 0,
    focusToOpen: focusesToOpen(dir),
    openCost: calcOpenCosts(dir, focusCost),
    focusedThisTurn: false,
    damageBonus: index >= 3 ? 1 : 0,
  }
}

// ===== Mage Definitions =====
export interface MageDef {
  type: string
  abilityName: string
  abilityDesc: string
  hp: number
  chargeThreshold: number
  startHand: string[]
  startDeck: string[]
  breaches: BreachState[]
}

export const jian: MageDef = {
  type: 'jian',
  abilityName: 'Black Mirror',
  abilityDesc: 'Cast any prepped spell twice without discarding it',
  hp: 10,
  chargeThreshold: 4,
  startHand: ['spark', 'spark', 'crystal', 'crystal', 'moonstone_shard'],
  startDeck: ['crystal', 'crystal', 'crystal', 'spark', 'spark'],
  breaches: [
    makeBreach(1, true, null, 0),
    makeBreach(2, true, null, 0),
    makeBreach(3, false, 'east', 3),
    makeBreach(4, false, 'south', 4),
  ],
}

export const brama: MageDef = {
  type: 'brama',
  abilityName: 'Brink Siphon',
  abilityDesc: 'Any player gains 4 life',
  hp: 10,
  chargeThreshold: 5,
  startHand: ['buried_light', 'crystal', 'crystal', 'crystal', 'crystal'],
  startDeck: ['crystal', 'crystal', 'crystal', 'spark', 'spark'],
  breaches: [
    makeBreach(1, true, null, 0),
    makeBreach(2, false, 'south', 2),
    makeBreach(3, false, 'east', 3),
    makeBreach(4, false, 'west', 4),
  ],
}

export const MAGES: Record<string, MageDef> = { jian, brama }

// ===== Nemesis Definition =====
const nemesisDeck: string[] = [
  ...Array.from({ length: 6 }, (_, i) => `attack_t1_${i + 1}`),
  ...Array.from({ length: 8 }, (_, i) => `attack_t2_${i + 1}`),
  ...Array.from({ length: 10 }, (_, i) => `attack_t3_${i + 1}`),
]

export const rageborne = {
  type: 'rageborne',
  hp: 70,
  unleashDescription: 'Rageborne gains one Fury token',
  deck: [...nemesisDeck],
}
