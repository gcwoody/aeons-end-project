import type { BreachState, CardDef, CardEffect, Direction } from '../../../types'
import type { MageDef } from '../../wave1/mages'

type BreachFactory = (
  index: number, opened: boolean, startDir: Direction | null,
  present?: boolean, special?: 'transfer',
) => BreachState

export const INDIRA_CARDS: Record<string, CardDef> = {
  fused_opal: {
    id: 'fused_opal',
    name: 'Fused Opal',
    type: 'gem',
    cost: 0,
    set: 'wave9',
    effects: [{
      trigger: { kind: 'on_play' },
      effects: [{
        kind: 'choose_one',
        prompt: 'Choose Fused Opal effect',
        options: [
          { id: 'aether', label: 'Gain 1 Aether', effects: [{ kind: 'gain_aether', amount: 1 }] },
          { id: 'conjure', label: 'Conjure', effects: [{ kind: 'conjure' }] },
        ],
      }],
    }],
  },
}

export const INDIRA_UNIQUE_CARDS = Object.keys(INDIRA_CARDS)

const abilityEffects: CardEffect[] = [{
  kind: 'choose_one',
  prompt: "Choose Pyromancer's Guile effect",
  layout: 'mage-ability',
  options: [
    {
      id: 'cast_twice',
      label: "Cast a spell from an ally's hand without discarding it, then cast it again",
      effects: [{ kind: 'cast_spell_from_hand', times: 2 }],
    },
    {
      id: 'spell_aether',
      label: 'Gain 5 Aether that may only be spent on Spells',
      effects: [{ kind: 'gain_conditional_aether', amount: 5, condition: 'spell' }],
    },
  ],
}]

export function createIndira(makeBreach: BreachFactory): MageDef {
  return {
    wave: 9,
    type: 'indira',
    abilityName: "Pyromancer's Guile",
    abilityTrigger: { kind: 'main_phase', scope: 'current_player' },
    abilityEffects,
    hp: 10,
    chargeThreshold: 5,
    startHand: ['crystal', 'crystal', 'crystal', 'crystal', 'spark'],
    startDeck: ['crystal', 'crystal', 'crystal', 'crystal', 'fused_opal'],
    breaches: [
      makeBreach(1, false, null, false),
      makeBreach(2, false, 'south'),
      makeBreach(3, false, 'east', true, 'transfer'),
      makeBreach(4, false, null, false),
    ],
  }
}
