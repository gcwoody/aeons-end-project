import type { AbilityTrigger, BreachState, CardEffect } from '../../types'

export interface MageDef {
  type: string
  abilityName: string
  abilityTrigger: AbilityTrigger
  abilityEffects: CardEffect[]
  hp: number
  chargeThreshold: number
  startHand: string[]
  startDeck: string[]
  breaches: BreachState[]
}

type BreachFactory = (
  index: number, opened: boolean, startDir: 'east' | 'south' | 'west' | 'north' | null, focusCost: number,
) => BreachState

export const MAGE_UNIQUE_CARDS: Record<string, string[]> = {
  jian: ['moonstone_shard'],
  brama: ['buried_light'],
}

export function createMages(makeBreach: BreachFactory): Record<string, MageDef> {
  const jian: MageDef = {
    type: 'jian',
    abilityName: 'Black Mirror',
    abilityTrigger: { kind: 'main_phase' },
    abilityEffects: [
      { kind: 'cast_prepped_spell', source: 'any_prepped_spell', discard: false },
      { kind: 'cast_prepped_spell', source: 'selected_prepped_spell', discard: true },
    ],
    hp: 10,
    chargeThreshold: 4,
    startHand: ['moonstone_shard', 'crystal', 'crystal', 'spark', 'spark' ],
    startDeck: ['crystal', 'crystal', 'crystal', 'spark', 'spark'],
    breaches: [
      makeBreach(1, true, null, 0),
      makeBreach(2, true, null, 0),
      makeBreach(3, false, 'east', 3),
      makeBreach(4, false, 'south', 4),
    ],
  }

  const brama: MageDef = {
    type: 'brama',
    abilityName: 'Brink Siphon',
    abilityTrigger: { kind: 'main_phase' },
    abilityEffects: [{ kind: 'gain_life', amount: 4, target: 'any_player' }],
    hp: 10,
    chargeThreshold: 5,
    startHand: ['buried_light', 'crystal', 'crystal', 'crystal', 'crystal'],
    startDeck: ['crystal', 'crystal', 'crystal', 'spark', 'spark'],
    breaches: [
      makeBreach(1, true, null, 0),
      makeBreach(2, false, 'south', 2),
      makeBreach(3, false, 'east', 3),
      makeBreach(4, false, 'west', 4),
    ],
  }

  return { jian, brama }
}
