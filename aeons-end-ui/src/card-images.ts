import { CARD_IMAGE_IMPORTS, NEMESIS_MAT_IMAGE_IMPORTS } from './generated-image-imports'
import playerCardBack from '../../image-database/common images/player-card back.jpg'
import treasureTwoBack from '../../image-database/common images/treasure 12back.jpg'

export function cardImageUrl(cardId: string): string | undefined {
  return CARD_IMAGE_IMPORTS[cardId]
}

export function playerCardBackUrl(): string {
  return playerCardBack
}

export type SpecificDeckBack = 'treasure_1' | 'treasure_2' | 'treasure_3' | 'player'

export function specificDeckBackUrl(back: SpecificDeckBack = 'player'): string | undefined {
  if (back === 'treasure_2') return treasureTwoBack
  if (back === 'player') return playerCardBack
  return undefined
}

export function nemesisMatImageUrl(
  nemesisType = 'rageborne', side: 'front' | 'back' = 'front',
): string | undefined {
  return NEMESIS_MAT_IMAGE_IMPORTS[nemesisType]?.[side]
}
