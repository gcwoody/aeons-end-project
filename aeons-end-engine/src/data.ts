import type {
  CardDef, BreachState, Direction, NemesisDifficulty, ScenarioConfig, MarketSetupConfig,
} from './types'
import {
  INITIAL_GEM_CARDS, MARKET_GEM_CARDS,
  crystal, moonstoneShard, amethystShard, emeraldShard, quartzShard, garnetShard, tourmalineShard,
  vriswoodAmber, diamondCluster, burningOpal, cloudedSapphire, jade, searingRuby, siftersPearl,
} from './data/wave1/gems'
import {
  MARKET_RELIC_CARDS,
  flexingDagger, bottledVortex, blastingStaff, focusingOrb, magesTalisman, unstablePrism,
} from './data/wave1/relics'
import {
  INITIAL_SPELL_CARDS, MARKET_SPELL_CARDS,
  spark, buriedLight, flare, lavaTendril, essenceTheft, planarInsight, arcaneNexus,
  amplifyVision, chaosArc, consumingVoid, darkFire, feralLightning, ignite, oblivionSwell,
  phoenixFlame, spectralEcho, wildfireWhip,
} from './data/wave1/spells'
import { createMages, MAGE_UNIQUE_CARDS as WAVE1_MAGE_UNIQUE_CARDS } from './data/wave1/mage'
import type { MageDef } from './data/wave1/mage'
import { createNook, NOOK_CARDS, NOOK_UNIQUE_CARDS } from './data/wave9/nook'
import { createIndira, INDIRA_CARDS, INDIRA_UNIQUE_CARDS } from './data/wave9/indira'
import { createDezmodia, DEZMODIA_CARDS, DEZMODIA_UNIQUE_CARDS } from './data/wave9/dezmodia'
import { createRemnant, REMNANT_CARDS, REMNANT_UNIQUE_CARDS } from './data/wave9/remnant'
import { createStake, STAKE_CARDS, STAKE_UNIQUE_CARDS } from './data/wave9/stake'
import { createWolf, WOLF_CARDS, WOLF_UNIQUE_CARDS } from './data/wave9/wolf'
import { createInco, INCO_CARDS, INCO_UNIQUE_CARDS } from './data/wave9/inco'
import { createQu, QU_CARDS, QU_UNIQUE_CARDS } from './data/wave9/qu'
import { createTressa, TRESSA_CARDS, TRESSA_UNIQUE_CARDS } from './data/wave9/tressa'
import { createYanMagda, YAN_MAGDA_CARDS, YAN_MAGDA_UNIQUE_CARDS } from './data/wave9/yanmagda'
import { wave9Crystal, wave9Spark } from './data/wave9/basic'
import {
  NEMESIS_CARDS, rageborne, princeOfGluttons, NEMESES,
  BASIC_NEMESIS_CARDS, RAGEBORNE_UNIQUE_CARDS, RAGEBORNE_STRIKE_CARDS,
  BASIC_NEMESIS_CARDS_BY_TIER, RAGEBORNE_UNIQUE_CARDS_BY_TIER, PRINCE_OF_GLUTTONS_UNIQUE_CARDS, PRINCE_OF_GLUTTONS_UNIQUE_CARDS_BY_TIER,
  buildRageborneDeck, buildRageborneStrikeDeck, buildPrinceOfGluttonsDeck,
} from './data/wave1/nemesis'

// Re-export the Wave 1 catalog so existing engine and UI imports stay stable.
export {
  crystal, moonstoneShard, amethystShard, emeraldShard, quartzShard, garnetShard, tourmalineShard,
  vriswoodAmber, diamondCluster, burningOpal, cloudedSapphire, jade, searingRuby, siftersPearl,
  flexingDagger, bottledVortex, blastingStaff, focusingOrb, magesTalisman, unstablePrism,
  spark, buriedLight, flare, lavaTendril, essenceTheft, planarInsight, arcaneNexus,
  amplifyVision, chaosArc, consumingVoid, darkFire, feralLightning, ignite, oblivionSwell,
  phoenixFlame, spectralEcho, wildfireWhip,
  wave9Crystal, wave9Spark,
  NOOK_CARDS, NOOK_UNIQUE_CARDS,
  INDIRA_CARDS, INDIRA_UNIQUE_CARDS,
  DEZMODIA_CARDS, DEZMODIA_UNIQUE_CARDS,
  REMNANT_CARDS, REMNANT_UNIQUE_CARDS,
  STAKE_CARDS, STAKE_UNIQUE_CARDS,
  WOLF_CARDS, WOLF_UNIQUE_CARDS,
  INCO_CARDS, INCO_UNIQUE_CARDS,
  QU_CARDS, QU_UNIQUE_CARDS,
  TRESSA_CARDS, TRESSA_UNIQUE_CARDS,
  YAN_MAGDA_CARDS, YAN_MAGDA_UNIQUE_CARDS,
  NEMESIS_CARDS, rageborne, princeOfGluttons, NEMESES,
  BASIC_NEMESIS_CARDS, RAGEBORNE_UNIQUE_CARDS, RAGEBORNE_STRIKE_CARDS,
  BASIC_NEMESIS_CARDS_BY_TIER, RAGEBORNE_UNIQUE_CARDS_BY_TIER, PRINCE_OF_GLUTTONS_UNIQUE_CARDS, PRINCE_OF_GLUTTONS_UNIQUE_CARDS_BY_TIER,
  buildRageborneDeck, buildRageborneStrikeDeck, buildPrinceOfGluttonsDeck,
}
export type { MageDef } from './data/wave1/mage'

export const MAGE_UNIQUE_CARDS: Record<string, string[]> = {
  ...WAVE1_MAGE_UNIQUE_CARDS,
  nook: NOOK_UNIQUE_CARDS,
  indira: INDIRA_UNIQUE_CARDS,
  dezmodia: DEZMODIA_UNIQUE_CARDS,
  remnant: REMNANT_UNIQUE_CARDS,
  stake: STAKE_UNIQUE_CARDS,
  wolf: WOLF_UNIQUE_CARDS,
  inco: INCO_UNIQUE_CARDS,
  qu: QU_UNIQUE_CARDS,
  tressa: TRESSA_UNIQUE_CARDS,
  yan_magda: YAN_MAGDA_UNIQUE_CARDS,
}

export function getNemesisDefinition(type: string) {
  return NEMESES[type]
}

/** Create the only currently supported scenario: two players versus one Nemesis. */
export function createTwoPlayerScenario(
  mageTypes: [string, string],
  nemesisType = rageborne.type,
  nemesisDifficulty: NemesisDifficulty = 'standard',
  marketSetup?: MarketSetupConfig,
): ScenarioConfig {
  const [firstMage, secondMage] = mageTypes
  if (!MAGES[firstMage] || !MAGES[secondMage]) {
    throw new Error('Scenario contains an unknown Mage')
  }
  if (firstMage === secondMage) {
    throw new Error('This Mage has already been selected by another player')
  }
  if (!NEMESES[nemesisType]) {
    throw new Error(`Unknown Nemesis: ${nemesisType}`)
  }
  return {
    id: 'two_player',
    playerCount: 2,
    mageTypes: [firstMage, secondMage],
    nemesisType,
    nemesisDifficulty,
    turnOrderDeckSize: 6,
    playerTurnOrderCardsPerPlayer: 2,
    nemesisTurnOrderCards: 2,
    marketSetup: marketSetup ? {
      mode: marketSetup.mode,
      slots: [...marketSetup.slots],
    } : defaultMarketSetup(),
  }
}

// Unified card lookups used by the engine.
export const INITIAL_CARDS: Record<string, CardDef> = {
  ...INITIAL_GEM_CARDS,
  ...INITIAL_SPELL_CARDS,
  wave9_crystal: wave9Crystal,
  wave9_spark: wave9Spark,
  ...NOOK_CARDS,
  ...INDIRA_CARDS,
  ...DEZMODIA_CARDS,
  ...REMNANT_CARDS,
  ...STAKE_CARDS,
  ...WOLF_CARDS,
  ...INCO_CARDS,
  ...QU_CARDS,
  ...TRESSA_CARDS,
  ...YAN_MAGDA_CARDS,
}

export const ALL_MARKET_CARDS: Record<string, CardDef> = {
  ...MARKET_GEM_CARDS,
  ...MARKET_RELIC_CARDS,
  ...MARKET_SPELL_CARDS,
}

/** The original nine-card market remains the default preset for backwards-compatible saves. */
export const DEFAULT_MARKET_SLOTS = [
  'vriswood_amber', 'diamond_cluster', 'burning_opal',
  'flexing_dagger', 'bottled_vortex',
  'lava_tendril', 'essence_theft', 'planar_insight', 'arcane_nexus',
]

export const MARKET_SLOT_TYPES = [
  'gem', 'gem', 'gem', 'relic', 'relic', 'spell', 'spell', 'spell', 'spell',
] as const

/** Backwards-compatible name for the complete market card catalog. */
export const MARKET_CARDS: Record<string, CardDef> = ALL_MARKET_CARDS

export function defaultMarketSetup(): MarketSetupConfig {
  return { mode: 'manual', slots: [...DEFAULT_MARKET_SLOTS] }
}

/** Return a user-facing validation error, or null for a valid market setup. */
export function validateMarketSetup(config?: MarketSetupConfig): string | null {
  if (!config) return null
  if (config.mode === 'template1') return null
  if (config.mode !== 'manual') return 'Unknown market setup mode'
  if (config.slots.length !== 9) return 'Manual market setup must contain exactly nine slots'
  if (new Set(config.slots).size !== config.slots.length) return 'Manual market setup cannot repeat a card'
  for (const [index, cardId] of config.slots.entries()) {
    const card = ALL_MARKET_CARDS[cardId]
    if (!card) return `Unknown market card: ${cardId}`
    if (card.type !== MARKET_SLOT_TYPES[index]) {
      return `${card.name} cannot be placed in ${MARKET_SLOT_TYPES[index]} slot ${index + 1}`
    }
  }
  return null
}

export type RandomSource = () => number

function pickRandom<T>(items: T[], count: number, random: RandomSource): T[] {
  const pool = [...items]
  for (let index = pool.length - 1; index > 0; index--) {
    const swap = Math.floor(random() * (index + 1))
    ;[pool[index], pool[swap]] = [pool[swap]!, pool[index]!]
  }
  return pool.slice(0, count)
}

/** Resolve a Setup selection into the nine concrete market card IDs. */
export function resolveMarketCardIds(config?: MarketSetupConfig, random: RandomSource = Math.random): string[] {
  const validationError = validateMarketSetup(config)
  if (validationError) throw new Error(validationError)
  if (!config || config.mode === 'manual') {
    const slots = config?.slots ?? DEFAULT_MARKET_SLOTS
    return [...slots]
  }
  // Setup stores the first Template 1 roll in its slots so the images shown
  // before Start Game are exactly the piles that enter play. An empty template
  // still means "roll now" for callers that do not have a preview yet.
  if (config.slots.length > 0) {
    const resolvedError = validateMarketSetup({ mode: 'manual', slots: config.slots })
    if (resolvedError) throw new Error(`Template 1 resolved slots are invalid: ${resolvedError}`)
    return [...config.slots]
  }
  const cards = Object.values(ALL_MARKET_CARDS)
  const gems = pickRandom(cards.filter(card => card.type === 'gem' && card.cost <= 3), 1, random)
    .concat(pickRandom(cards.filter(card => card.type === 'gem' && card.cost === 4), 1, random))
    .concat(pickRandom(cards.filter(card => card.type === 'gem' && card.cost >= 5), 1, random))
  const relics = pickRandom(cards.filter(card => card.type === 'relic' && card.cost <= 3), 1, random)
    .concat(pickRandom(cards.filter(card => card.type === 'relic' && card.cost >= 4), 1, random))
  const spells = pickRandom(cards.filter(card => card.type === 'spell' && card.cost === 3), 1, random)
    .concat(pickRandom(cards.filter(card => card.type === 'spell' && card.cost === 4), 1, random))
    .concat(pickRandom(cards.filter(card => card.type === 'spell' && card.cost === 5), 1, random))
    .concat(pickRandom(cards.filter(card => card.type === 'spell' && card.cost >= 6), 1, random))
  const ids = [...gems, ...relics, ...spells].map(card => card.id)
  if (ids.length !== 9) throw new Error('Template 1 cannot fill all nine market slots from the current catalog')
  return ids
}

export function getCard(id: string): CardDef {
  return INITIAL_CARDS[id] ?? ALL_MARKET_CARDS[id] ?? NEMESIS_CARDS[id]
}

/** Resolve wave-specific artwork for the shared Crystal and Spark starters. */
export function resolveMageStartingCardId(wave: number, cardId: string): string {
  if (cardId !== 'crystal' && cardId !== 'spark') return cardId
  const waveVariant = `wave${wave}_${cardId}`
  return INITIAL_CARDS[waveVariant] ? waveVariant : cardId
}

// ===== Breach Configuration =====
export const COMMON_BREACH_FOCUS_COSTS: Record<number, number> = {
  1: 0,
  2: 2,
  3: 3,
  4: 4,
}

export const COMMON_BREACH_OPEN_COSTS: Record<number, Record<Direction, number>> = {
  1: { east: 0, south: 0, west: 0, north: 0 },
  2: { east: 5, south: 4, west: 3, north: 2 },
  3: { east: 9, south: 7, west: 5, north: 3 },
  4: { east: 13, south: 10, west: 7, north: 4 },
}

/** Printed open costs on Remnant's two custom Rift Breaches. */
const RIFT_BREACH_OPEN_COSTS: Record<number, Record<Direction, number>> = {
  3: { east: 6, south: 8, west: 5, north: 7 },
  4: { east: 10, south: 13, west: 10, north: 7 },
}

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

export function makeBreach(
  index: number, opened: boolean, startDir: Direction | null, present = true,
  special?: BreachState['special'],
): BreachState {
  const damageBonus = special === 'rift' || special === 'prototype' ? 0 : index >= 3 ? 1 : 0
  if (!present) {
    return {
      index, present: false, opened: false, prepSpells: [], preppedThisTurn: [], preppedSpellFaceDown: [],
      focusDirection: 'north', focusCost: 0, focusCount: 0, focusToOpen: 0,
      openCost: { east: 0, south: 0, west: 0, north: 0 },
      focusedThisTurn: false,
      damageBonus: 0, special,
    }
  }
  if (opened) {
    return {
      index, present: true, opened: true, prepSpells: [], preppedThisTurn: [], preppedSpellFaceDown: [],
      focusDirection: 'north', focusCost: 0, focusCount: 0, focusToOpen: 0,
      openCost: { east: 0, south: 0, west: 0, north: 0 },
      focusedThisTurn: false,
      damageBonus, special,
    }
  }
  const dir = startDir!
  const resolvedFocusCost = COMMON_BREACH_FOCUS_COSTS[index] ?? 0
  const commonOpenCosts = COMMON_BREACH_OPEN_COSTS[index]
  const startingOpenCost = special === 'rift'
    ? RIFT_BREACH_OPEN_COSTS[index] ?? commonOpenCosts ?? calcOpenCosts(dir, resolvedFocusCost)
    : commonOpenCosts ?? calcOpenCosts(dir, resolvedFocusCost)
  return {
    index, present: true, opened: false, prepSpells: [], preppedThisTurn: [], preppedSpellFaceDown: [],
    focusDirection: dir, focusCost: resolvedFocusCost, focusCount: 0,
    focusToOpen: focusesToOpen(dir),
    openCost: { ...startingOpenCost },
    startingDirection: dir,
    startingFocusCost: resolvedFocusCost,
    startingFocusToOpen: focusesToOpen(dir),
    startingOpenCost: { ...startingOpenCost },
    focusedThisTurn: false,
    damageBonus, special,
  }
}

const wave1Mages = createMages(makeBreach)
export const nook = createNook(makeBreach)
export const indira = createIndira(makeBreach)
export const dezmodia = createDezmodia(makeBreach)
export const remnant = createRemnant(makeBreach)
export const stake = createStake(makeBreach)
export const jian = wave1Mages.jian
export const brama = wave1Mages.brama
export const xaxos = wave1Mages.xaxos
export const adelheim = wave1Mages.adelheim
export const kadir = wave1Mages.kadir
export const lash = wave1Mages.lash
export const mist = wave1Mages.mist
export const phaedraxa = wave1Mages.phaedraxa
export const wolf = createWolf(makeBreach)
export const inco = createInco(makeBreach)
export const qu = createQu(makeBreach)
export const tressa = createTressa(makeBreach)
export const yanMagda = createYanMagda(makeBreach)
export const MAGES: Record<string, MageDef> = { ...wave1Mages, nook, indira, dezmodia, remnant, stake, wolf, inco, qu, tressa, yan_magda: yanMagda }
