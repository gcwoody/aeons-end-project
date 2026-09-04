import buriedLightUrl from '../../image-database/wave1_breach_mages/Buried Light.jpg'
import moonstoneShardUrl from '../../image-database/wave1_breach_mages/Moonstone Shard.jpg'
import crystalUrl from '../../image-database/wave1 crystal.jpg'
import sparkUrl from '../../image-database/wave2 spark.jpg'

const CARD_IMAGES: Record<string, string> = {
  buried_light: buriedLightUrl,
  moonstone_shard: moonstoneShardUrl,
  crystal: crystalUrl,
  spark: sparkUrl,
}

export function cardImageUrl(cardId: string): string | undefined {
  return CARD_IMAGES[cardId]
}
