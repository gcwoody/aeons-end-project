import buriedLightUrl from '../../image-database/buried light.jpg'
import moonstoneShardUrl from '../../image-database/moonstone shard.jpg'
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
