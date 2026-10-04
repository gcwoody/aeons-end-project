import type { CardDef } from '../../types'
import { mergeCatalogs } from '../catalog'
import * as Gems from './cards/gems'
import * as Relics from './cards/relics'
import * as Spells from './cards/spells'
import * as Mages from './mages'
import * as Nemeses from './nemeses/cards'

export * from './cards/gems'
export * from './cards/relics'
export * from './cards/spells'
export * from './mages'
export * from './nemeses/cards'

export const WAVE1_INITIAL_CARDS: Record<string, CardDef> = {
  ...mergeCatalogs(Gems.INITIAL_GEM_CARDS, Spells.INITIAL_SPELL_CARDS),
}

export const WAVE1_MARKET_CARDS: Record<string, CardDef> = {
  ...mergeCatalogs(Gems.MARKET_GEM_CARDS, Relics.MARKET_RELIC_CARDS, Spells.MARKET_SPELL_CARDS),
}

export const WAVE1_MAGE_UNIQUE_CARDS = Mages.MAGE_UNIQUE_CARDS
export const WAVE1_NEMESIS_CARDS = Nemeses.NEMESIS_CARDS
export const WAVE1_NEMESES = Nemeses.NEMESES

export function createWave1Mages(makeBreach: Parameters<typeof Mages.createMages>[0]) {
  return Mages.createMages(makeBreach)
}
