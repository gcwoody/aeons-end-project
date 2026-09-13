import { CARD_IMAGE_IMPORTS, NEMESIS_MAT_IMAGE_IMPORTS } from './generated-image-imports'

export function cardImageUrl(cardId: string): string | undefined {
  return CARD_IMAGE_IMPORTS[cardId]
}

export function nemesisMatImageUrl(
  nemesisType = 'rageborne', side: 'front' | 'back' = 'front',
): string | undefined {
  return NEMESIS_MAT_IMAGE_IMPORTS[nemesisType]?.[side]
}
