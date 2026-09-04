import adelheimBack from '../../image-database/wave1_breach_mages/Adelheim Back.jpg'
import adelheimFront from '../../image-database/wave1_breach_mages/Adelheim Front.jpg'
import bramaBack from '../../image-database/wave1_breach_mages/Brama Back.jpg'
import bramaFront from '../../image-database/wave1_breach_mages/Brama Front.jpg'
import jianBack from '../../image-database/wave1_breach_mages/Jian Back.jpg'
import jianFront from '../../image-database/wave1_breach_mages/Jian Front.jpg'
import kadirBack from '../../image-database/wave1_breach_mages/Kadir Back.jpg'
import kadirFront from '../../image-database/wave1_breach_mages/Kadir Front.jpg'
import lashBack from '../../image-database/wave1_breach_mages/Lash Back.jpg'
import lashFront from '../../image-database/wave1_breach_mages/Lash Front.jpg'
import mistBack from '../../image-database/wave1_breach_mages/Mist Back.jpg'
import mistFront from '../../image-database/wave1_breach_mages/Mist Front.jpg'
import phaedraxaBack from '../../image-database/wave1_breach_mages/Phaedraxa Back.jpg'
import phaedraxaFront from '../../image-database/wave1_breach_mages/Phaedraxa Front.jpg'
import xaxosBack from '../../image-database/wave1_breach_mages/Xaxos Back.jpg'
import xaxosFront from '../../image-database/wave1_breach_mages/Xaxos Front.jpg'

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
