import type {
  CardDef, BreachState, Direction,
} from './types'
import {
  INITIAL_GEM_CARDS, MARKET_GEM_CARDS,
  crystal, moonstoneShard, vriswoodAmber, diamondCluster, burningOpal,
} from './data/wave1/gems'
import {
  MARKET_RELIC_CARDS,
  flexingDagger, bottledVortex,
} from './data/wave1/relics'
import {
  INITIAL_SPELL_CARDS, MARKET_SPELL_CARDS,
  spark, buriedLight, lavaTendril, essenceTheft, planarInsight, arcaneNexus,
} from './data/wave1/spells'
import { createMages, MAGE_UNIQUE_CARDS } from './data/wave1/mage'
import { NEMESIS_CARDS, rageborne } from './data/wave1/nemesis'

// Re-export the Wave 1 catalog so existing engine and UI imports stay stable.
export {
  crystal, moonstoneShard, vriswoodAmber, diamondCluster, burningOpal,
  flexingDagger, bottledVortex,
  spark, buriedLight, lavaTendril, essenceTheft, planarInsight, arcaneNexus,
  MAGE_UNIQUE_CARDS,
  NEMESIS_CARDS, rageborne,
}
export type { MageDef } from './data/wave1/mage'

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

const wave1Mages = createMages(makeBreach)
export const jian = wave1Mages.jian
export const brama = wave1Mages.brama
export const MAGES = wave1Mages
