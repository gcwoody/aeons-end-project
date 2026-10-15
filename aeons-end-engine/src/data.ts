import type {
  CardDef, BreachState, Direction, NemesisDifficulty, ScenarioConfig, MarketSetupConfig,
} from './types'
import type { MageDef } from './data/wave1'
import { mergeCatalogs } from './data/catalog'
import * as Wave1 from './data/wave1'
import * as Wave9 from './data/wave9'

// Keep the historical public data entry point while each Wave owns its catalog.
export * from './data/wave1'
export * from './data/wave9'
export type { MageDef } from './data/wave1'

export const MAGE_UNIQUE_CARDS: Record<string, string[]> = {
  ...Wave1.WAVE1_MAGE_UNIQUE_CARDS,
  ...Wave9.WAVE9_MAGE_UNIQUE_CARDS,
}

export const NEMESES = { ...Wave1.WAVE1_NEMESES, ...Wave9.WAVE9_NEMESES }
export const ALL_NEMESIS_CARDS = mergeCatalogs(Wave1.WAVE1_NEMESIS_CARDS, Wave9.WAVE9_NEMESIS_CARDS)

export function getNemesisDefinition(type: string) {
  return NEMESES[type]
}

/** Create the only currently supported scenario: two players versus one Nemesis. */
export function createTwoPlayerScenario(
  mageTypes: [string, string],
  nemesisType = Wave1.rageborne.type,
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
export const INITIAL_CARDS: Record<string, CardDef> = mergeCatalogs(
  Wave1.WAVE1_INITIAL_CARDS,
  Wave9.WAVE9_INITIAL_CARDS,
)

export const ALL_MARKET_CARDS: Record<string, CardDef> = mergeCatalogs(
  Wave1.WAVE1_MARKET_CARDS,
  Wave9.WAVE9_MARKET_CARDS,
)

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
    if (card.setupOnlyNemesisSupplyFor) {
      return `${card.name} is added during ${NEMESES[card.setupOnlyNemesisSupplyFor]?.name ?? 'Nemesis'} setup and cannot be selected as an initial market pile`
    }
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
  const cards = Object.values(ALL_MARKET_CARDS).filter(card => !card.setupOnlyNemesisSupplyFor)
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
  return INITIAL_CARDS[id] ?? ALL_MARKET_CARDS[id] ?? ALL_NEMESIS_CARDS[id]
}

/** Standard starting supply size for a market pile. */
export function getStartingSupplyPileCount(card: CardDef): number {
  return card.type === 'gem' ? 7 : 5
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

/** Common open prices by current facing, including Breaches with special artwork/effects. */
export const COMMON_BREACH_OPEN_COSTS: Record<number, Record<Direction, number>> = {
  1: { east: 0, south: 0, west: 0, north: 0 },
  2: { east: 5, south: 4, west: 3, north: 2 },
  3: { east: 9, south: 7, west: 5, north: 3 },
  4: { east: 13, south: 10, west: 7, north: 4 },
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
  // Special Breach artwork/effects do not change the common printed costs.
  // The current facing direction selects the applicable cost at runtime.
  const startingOpenCost = commonOpenCosts ?? calcOpenCosts(dir, resolvedFocusCost)
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

const wave1Mages = Wave1.createWave1Mages(makeBreach)
const wave9Mages = Wave9.createWave9Mages(makeBreach)
export const nook = wave9Mages.nook!
export const indira = wave9Mages.indira!
export const dezmodia = wave9Mages.dezmodia!
export const remnant = wave9Mages.remnant!
export const stake = wave9Mages.stake!
export const jian = wave1Mages.jian
export const brama = wave1Mages.brama
export const xaxos = wave1Mages.xaxos
export const adelheim = wave1Mages.adelheim
export const kadir = wave1Mages.kadir
export const lash = wave1Mages.lash
export const mist = wave1Mages.mist
export const phaedraxa = wave1Mages.phaedraxa
export const wolf = wave9Mages.wolf!
export const inco = wave9Mages.inco!
export const qu = wave9Mages.qu!
export const tressa = wave9Mages.tressa!
export const yanMagda = wave9Mages.yan_magda!
export const MAGES: Record<string, MageDef> = { ...wave1Mages, ...wave9Mages }

function validateContentReferences(): void {
  for (const cardId of Object.keys(INITIAL_CARDS)) {
    if (Object.prototype.hasOwnProperty.call(ALL_MARKET_CARDS, cardId)) {
      throw new Error(`Card ID "${cardId}" is registered as both an initial card and a market card`)
    }
  }

  const playerCardIds = new Set([...Object.keys(INITIAL_CARDS), ...Object.keys(ALL_MARKET_CARDS)])
  for (const mage of Object.values(MAGES)) {
    const referencedIds = [
      ...mage.startDeck,
      ...mage.startHand,
      ...(mage.swapZone ?? []),
      ...(mage.specificDeck ?? []),
      ...mage.breaches.flatMap(breach => breach.prepSpells),
    ]
    for (const cardId of referencedIds) {
      if (!playerCardIds.has(cardId)) {
        throw new Error(`Mage "${mage.type}" references missing player card "${cardId}"`)
      }
    }
  }

  for (const nemesis of Object.values(NEMESES)) {
    const referencedIds = [
      ...Object.values(nemesis.uniqueCardIdsByTier).flat(),
      ...nemesis.strikeCardIds,
    ]
    for (const cardId of referencedIds) {
      if (!Object.prototype.hasOwnProperty.call(ALL_NEMESIS_CARDS, cardId)) {
        throw new Error(`Nemesis "${nemesis.type}" references missing Nemesis card "${cardId}"`)
      }
    }
  }

  const marketError = validateMarketSetup(defaultMarketSetup())
  if (marketError) throw new Error(`Default market setup is invalid: ${marketError}`)
}

validateContentReferences()
