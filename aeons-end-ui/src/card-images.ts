import buriedLightUrl from '../../image-database/wave1_breach_mages/Buried Light.jpg'
import moonstoneShardUrl from '../../image-database/wave1_breach_mages/Moonstone Shard.jpg'
import crystalUrl from '../../image-database/wave1_supply_cards/starter_cards/Crystal (Aeon\'s End) Front.jpg'
import sparkUrl from '../../image-database/wave1_supply_cards/starter_cards/Spark (Aeon\'s End).jpg'
import vriswoodAmberUrl from '../../image-database/wave1_supply_cards/supply_gems/V\'riswood Amber.jpg'
import diamondClusterUrl from '../../image-database/wave1_supply_cards/supply_gems/Diamond Cluster.jpg'
import burningOpalUrl from '../../image-database/wave1_supply_cards/supply_gems/Burning Opal.jpg'
import flexingDaggerUrl from '../../image-database/wave1_supply_cards/supply_relics/Flexing Dagger.jpg'
import bottledVortexUrl from '../../image-database/wave1_supply_cards/supply_relics/Bottled Vortex.jpg'
import lavaTendrilUrl from '../../image-database/wave1_supply_cards/supply_spells/Lava Tendril.jpg'
import essenceTheftUrl from '../../image-database/wave1_supply_cards/supply_spells/Essence Theft.jpg'
import planarInsightUrl from '../../image-database/wave1_supply_cards/supply_spells/Planar Insight.jpg'
import arcaneNexusUrl from '../../image-database/wave1_supply_cards/supply_spells/Arcane Nexus.jpg'

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
