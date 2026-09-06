import type { NemesisCard, CardDef } from '../../types'

function makeAttackCards(
  tier: 1 | 2 | 3, count: number, damage: number,
): Record<string, NemesisCard> {
  const result: Record<string, NemesisCard> = {}
  for (let i = 1; i <= count; i++) {
    const id = `attack_t${tier}_${i}`
    result[id] = {
      id, name: `Tier ${tier} Attack #${i}`, type: 'attack',
      cost: 0, set: 'rageborne', tier, damage,
    }
  }
  return result
}

export const NEMESIS_CARDS: Record<string, CardDef> = {
  ...makeAttackCards(1, 6, 1),
  ...makeAttackCards(2, 8, 2),
  ...makeAttackCards(3, 10, 3),
}

const nemesisDeck: string[] = [
  ...Array.from({ length: 6 }, (_, i) => `attack_t1_${i + 1}`),
  ...Array.from({ length: 8 }, (_, i) => `attack_t2_${i + 1}`),
  ...Array.from({ length: 10 }, (_, i) => `attack_t3_${i + 1}`),
]

export const rageborne = {
  type: 'rageborne',
  hp: 70,
  deck: [...nemesisDeck],
}
