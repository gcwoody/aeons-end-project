import type { CardDef } from '../../types'
import type { MageDef } from '../wave1/mages'
import { mergeCatalogs } from '../catalog'
import * as BasicCards from './cards/basic'
import * as Gems from './cards/gems'
import * as Relics from './cards/relics'
import * as Spells from './cards/spells'
import * as Trinkets from './special-decks/trinkets'
import * as Dezmodia from './mages/dezmodia'
import * as Inco from './mages/inco'
import * as Indira from './mages/indira'
import * as Nook from './mages/nook'
import * as Qu from './mages/qu'
import * as Remnant from './mages/remnant'
import * as Stake from './mages/stake'
import * as Tressa from './mages/tressa'
import * as Wolf from './mages/wolf'
import * as YanMagda from './mages/yanmagda'

export * from './cards/basic'
export * from './cards/gems'
export * from './cards/relics'
export * from './cards/spells'
export * from './special-decks/trinkets'
export * from './mages/dezmodia'
export * from './mages/inco'
export * from './mages/indira'
export * from './mages/nook'
export * from './mages/qu'
export * from './mages/remnant'
export * from './mages/stake'
export * from './mages/tressa'
export * from './mages/wolf'
export * from './mages/yanmagda'

export const WAVE9_MAGE_CARDS: Record<string, CardDef> = mergeCatalogs(
  Dezmodia.DEZMODIA_CARDS,
  Inco.INCO_CARDS,
  Indira.INDIRA_CARDS,
  Nook.NOOK_CARDS,
  Qu.QU_CARDS,
  Remnant.REMNANT_CARDS,
  Stake.STAKE_CARDS,
  Tressa.TRESSA_CARDS,
  Wolf.WOLF_CARDS,
  YanMagda.YAN_MAGDA_CARDS,
)

export const WAVE9_INITIAL_CARDS: Record<string, CardDef> = mergeCatalogs(
  { wave9_crystal: BasicCards.wave9Crystal, wave9_spark: BasicCards.wave9Spark },
  WAVE9_MAGE_CARDS,
  Trinkets.TRINKET_CARDS,
)

export const WAVE9_MARKET_CARDS: Record<string, CardDef> = mergeCatalogs(
  Gems.WAVE9_GEM_CARDS,
  Relics.WAVE9_RELIC_CARDS,
  Spells.WAVE9_SPELL_CARDS,
)

export const WAVE9_MAGE_UNIQUE_CARDS: Record<string, string[]> = {
  nook: Nook.NOOK_UNIQUE_CARDS,
  indira: Indira.INDIRA_UNIQUE_CARDS,
  dezmodia: Dezmodia.DEZMODIA_UNIQUE_CARDS,
  remnant: Remnant.REMNANT_UNIQUE_CARDS,
  stake: Stake.STAKE_UNIQUE_CARDS,
  wolf: Wolf.WOLF_UNIQUE_CARDS,
  inco: Inco.INCO_UNIQUE_CARDS,
  qu: Qu.QU_UNIQUE_CARDS,
  tressa: Tressa.TRESSA_UNIQUE_CARDS,
  yan_magda: YanMagda.YAN_MAGDA_UNIQUE_CARDS,
}

export function createWave9Mages(makeBreach: Parameters<typeof Nook.createNook>[0]): Record<string, MageDef> {
  return {
    nook: Nook.createNook(makeBreach),
    indira: Indira.createIndira(makeBreach),
    dezmodia: Dezmodia.createDezmodia(makeBreach),
    remnant: Remnant.createRemnant(makeBreach),
    stake: Stake.createStake(makeBreach),
    wolf: Wolf.createWolf(makeBreach),
    inco: Inco.createInco(makeBreach),
    qu: Qu.createQu(makeBreach),
    tressa: Tressa.createTressa(makeBreach),
    yan_magda: YanMagda.createYanMagda(makeBreach),
  }
}
