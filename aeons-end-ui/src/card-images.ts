import buriedLightUrl from '../../image-database/cards/wave1/mages/Buried Light.jpg'
import moonstoneShardUrl from '../../image-database/cards/wave1/mages/Moonstone Shard.jpg'
import crystalUrl from '../../image-database/cards/wave1/gems/Crystal (Aeon\'s End) Front.jpg'
import sparkUrl from '../../image-database/cards/wave1/spells/Spark (Aeon\'s End).jpg'
import vriswoodAmberUrl from '../../image-database/cards/wave1/gems/V\'riswood Amber.jpg'
import diamondClusterUrl from '../../image-database/cards/wave1/gems/Diamond Cluster.jpg'
import burningOpalUrl from '../../image-database/cards/wave1/gems/Burning Opal.jpg'
import flexingDaggerUrl from '../../image-database/cards/wave1/relics/Flexing Dagger.jpg'
import bottledVortexUrl from '../../image-database/cards/wave1/relics/Bottled Vortex.jpg'
import lavaTendrilUrl from '../../image-database/cards/wave1/spells/Lava Tendril.jpg'
import essenceTheftUrl from '../../image-database/cards/wave1/spells/Essence Theft.jpg'
import planarInsightUrl from '../../image-database/cards/wave1/spells/Planar Insight.jpg'
import arcaneNexusUrl from '../../image-database/cards/wave1/spells/Arcane Nexus.jpg'

const CARD_IMAGES: Record<string, string> = {
  buried_light: buriedLightUrl,
  moonstone_shard: moonstoneShardUrl,
  crystal: crystalUrl,
  spark: sparkUrl,
  vriswood_amber: vriswoodAmberUrl,
  diamond_cluster: diamondClusterUrl,
  burning_opal: burningOpalUrl,
  flexing_dagger: flexingDaggerUrl,
  bottled_vortex: bottledVortexUrl,
  lava_tendril: lavaTendrilUrl,
  essence_theft: essenceTheftUrl,
  planar_insight: planarInsightUrl,
  arcane_nexus: arcaneNexusUrl,
}

export function cardImageUrl(cardId: string): string | undefined {
  return CARD_IMAGES[cardId]
}
