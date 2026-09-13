import { MAGE_IMAGE_IMPORTS } from './generated-image-imports'

export interface MageImages {
  front: string
  back: string
}

export function mageImageUrls(mageType: string): MageImages | undefined {
  return MAGE_IMAGE_IMPORTS[mageType.toLowerCase()]
}
