import type {
  CardDef, BreachState, Direction, NemesisDifficulty, ScenarioConfig,
} from './types'
import {
  INITIAL_GEM_CARDS, MARKET_GEM_CARDS,
  crystal, moonstoneShard, amethystShard, emeraldShard, quartzShard, garnetShard, tourmalineShard,
  vriswoodAmber, diamondCluster, burningOpal,
} from './data/wave1/gems'
import {
  MARKET_RELIC_CARDS,
  flexingDagger, bottledVortex,
} from './data/wave1/relics'
import {
  INITIAL_SPELL_CARDS, MARKET_SPELL_CARDS,
  spark, buriedLight, flare, lavaTendril, essenceTheft, planarInsight, arcaneNexus,
} from './data/wave1/spells'
import { createMages, MAGE_UNIQUE_CARDS } from './data/wave1/mage'
import {
  NEMESIS_CARDS, rageborne, princeOfGluttons, NEMESES,
  BASIC_NEMESIS_CARDS, RAGEBORNE_UNIQUE_CARDS, RAGEBORNE_STRIKE_CARDS,
  BASIC_NEMESIS_CARDS_BY_TIER, RAGEBORNE_UNIQUE_CARDS_BY_TIER, PRINCE_OF_GLUTTONS_UNIQUE_CARDS, PRINCE_OF_GLUTTONS_UNIQUE_CARDS_BY_TIER,
  buildRageborneDeck, buildRageborneStrikeDeck, buildPrinceOfGluttonsDeck,
} from './data/wave1/nemesis'

// Re-export the Wave 1 catalog so existing engine and UI imports stay stable.
export {
  crystal, moonstoneShard, amethystShard, emeraldShard, quartzShard, garnetShard, tourmalineShard,
  vriswoodAmber, diamondCluster, burningOpal,
  flexingDagger, bottledVortex,
  spark, buriedLight, flare, lavaTendril, essenceTheft, planarInsight, arcaneNexus,
  MAGE_UNIQUE_CARDS,
  NEMESIS_CARDS, rageborne, princeOfGluttons, NEMESES,
  BASIC_NEMESIS_CARDS, RAGEBORNE_UNIQUE_CARDS, RAGEBORNE_STRIKE_CARDS,
  BASIC_NEMESIS_CARDS_BY_TIER, RAGEBORNE_UNIQUE_CARDS_BY_TIER, PRINCE_OF_GLUTTONS_UNIQUE_CARDS, PRINCE_OF_GLUTTONS_UNIQUE_CARDS_BY_TIER,
  buildRageborneDeck, buildRageborneStrikeDeck, buildPrinceOfGluttonsDeck,
}
export type { MageDef } from './data/wave1/mage'

export function getNemesisDefinition(type: string) {
  return NEMESES[type]
}

/** Create the only currently supported scenario: two players versus one Nemesis. */
export function createTwoPlayerScenario(
  mageTypes: [string, string],
  nemesisType = rageborne.type,
  nemesisDifficulty: NemesisDifficulty = 'standard',
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
  }
}

// Unified card lookups used by the engine.
export const INITIAL_CARDS: Record<string, CardDef> = {
  ...INITIAL_GEM_CARDS,
  ...INITIAL_SPELL_CARDS,
}

export const MARKET_CARDS: Record<string, CardDef> = {
  ...MARKET_GEM_CARDS,
  ...MARKET_RELIC_CARDS,
  ...MARKET_SPELL_CARDS,
}

export function getCard(id: string): CardDef {
  return INITIAL_CARDS[id] ?? MARKET_CARDS[id] ?? NEMESIS_CARDS[id]
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
): BreachState {
  if (!present) {
    return {
      index, present: false, opened: false, prepSpells: [],
      focusDirection: 'north', focusCost: 0, focusCount: 0, focusToOpen: 0,
      openCost: { east: 0, south: 0, west: 0, north: 0 },
      focusedThisTurn: false,
      damageBonus: 0,
    }
  }
  if (opened) {
    return {
      index, present: true, opened: true, prepSpells: [],
      focusDirection: 'north', focusCost: 0, focusCount: 0, focusToOpen: 0,
      openCost: { east: 0, south: 0, west: 0, north: 0 },
      focusedThisTurn: false,
      damageBonus: index >= 3 ? 1 : 0,
    }
  }
  const dir = startDir!
  const resolvedFocusCost = COMMON_BREACH_FOCUS_COSTS[index] ?? 0
  const commonOpenCosts = COMMON_BREACH_OPEN_COSTS[index]
  return {
    index, present: true, opened: false, prepSpells: [],
    focusDirection: dir, focusCost: resolvedFocusCost, focusCount: 0,
    focusToOpen: focusesToOpen(dir),
    openCost: commonOpenCosts ?? calcOpenCosts(dir, resolvedFocusCost),
    focusedThisTurn: false,
    damageBonus: index >= 3 ? 1 : 0,
  }
}

const wave1Mages = createMages(makeBreach)
export const jian = wave1Mages.jian
export const brama = wave1Mages.brama
export const xaxos = wave1Mages.xaxos
export const adelheim = wave1Mages.adelheim
export const kadir = wave1Mages.kadir
export const lash = wave1Mages.lash
export const mist = wave1Mages.mist
export const phaedraxa = wave1Mages.phaedraxa
export const MAGES = wave1Mages
