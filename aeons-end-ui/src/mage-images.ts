import adelheimBack from '../../image-database/cards/wave1/mages/Adelheim Back.jpg'
import adelheimFront from '../../image-database/cards/wave1/mages/Adelheim Front.jpg'
import bramaBack from '../../image-database/cards/wave1/mages/Brama Back.jpg'
import bramaFront from '../../image-database/cards/wave1/mages/Brama Front.jpg'
import jianBack from '../../image-database/cards/wave1/mages/Jian Back.jpg'
import jianFront from '../../image-database/cards/wave1/mages/Jian Front.jpg'
import kadirBack from '../../image-database/cards/wave1/mages/Kadir Back.jpg'
import kadirFront from '../../image-database/cards/wave1/mages/Kadir Front.jpg'
import lashBack from '../../image-database/cards/wave1/mages/Lash Back.jpg'
import lashFront from '../../image-database/cards/wave1/mages/Lash Front.jpg'
import mistBack from '../../image-database/cards/wave1/mages/Mist Back.jpg'
import mistFront from '../../image-database/cards/wave1/mages/Mist Front.jpg'
import phaedraxaBack from '../../image-database/cards/wave1/mages/Phaedraxa Back.jpg'
import phaedraxaFront from '../../image-database/cards/wave1/mages/Phaedraxa Front.jpg'
import xaxosBack from '../../image-database/cards/wave1/mages/Xaxos Back.jpg'
import xaxosFront from '../../image-database/cards/wave1/mages/Xaxos Front.jpg'

export interface MageImages {
  front: string
  back: string
}

const MAGE_IMAGES: Record<string, MageImages> = {
  adelheim: { front: adelheimFront, back: adelheimBack },
  brama: { front: bramaFront, back: bramaBack },
  jian: { front: jianFront, back: jianBack },
  kadir: { front: kadirFront, back: kadirBack },
  lash: { front: lashFront, back: lashBack },
  mist: { front: mistFront, back: mistBack },
  phaedraxa: { front: phaedraxaFront, back: phaedraxaBack },
  xaxos: { front: xaxosFront, back: xaxosBack },
}

export function mageImageUrls(mageType: string): MageImages | undefined {
  return MAGE_IMAGES[mageType.toLowerCase()]
}
