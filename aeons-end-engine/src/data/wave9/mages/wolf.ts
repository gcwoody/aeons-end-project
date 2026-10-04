import type { BreachState, CardDef, CardEffect } from '../../../types'
import type { MageDef } from '../../wave1/mages'

type BreachFactory = (
  index: number, opened: boolean, startDir: 'east' | 'south' | 'west' | 'north' | null,
  present?: boolean,
) => BreachState

export const WOLF_UNIQUE_CARDS = ['doomstone', 'doom_howl']

const drawForAlly: CardEffect = {
  kind: 'draw_cards',
  amount: 1,
  target: 'ally',
  relativeToSpellCaster: true,
}

export const WOLF_CARDS: Record<string, CardDef> = {
  doomstone: {
    id: 'doomstone',
    name: 'Doomstone',
    type: 'gem',
    cost: 0,
    set: 'wave9',
    effects: [{
      trigger: { kind: 'on_play' },
      effects: [{
        kind: 'choose_one',
        prompt: 'Choose Doomstone effect',
        options: [
          {
            id: 'gain_doom',
            label: 'Gain 3 Aether. Wolf gains 2 Doom.',
            effects: [
              { kind: 'gain_aether', amount: 3 },
              { kind: 'gain_doom', amount: 2 },
            ],
          },
          {
            id: 'lose_doom',
            label: 'Wolf loses 1 Doom.',
            condition: { kind: 'has_doom', amount: 1 },
            effects: [{ kind: 'lose_doom', amount: 1 }],
          },
        ],
      }],
    }],
  },
  doom_howl: {
    id: 'doom_howl',
    name: 'Doom Howl',
    type: 'spell',
    cost: 0,
    set: 'wave9',
    effects: [{
      trigger: { kind: 'on_cast' },
      effects: [{
        kind: 'choose_one',
        prompt: 'Choose Doom Howl effect',
        options: [
          {
            id: 'gain_doom',
            label: 'Deal 3 damage. Wolf gains 2 Doom.',
            effects: [
              { kind: 'deal_damage', amount: 3, target: 'nemesis_or_minion' },
              { kind: 'gain_doom', amount: 2 },
            ],
          },
          {
            id: 'lose_doom',
            label: 'Wolf loses 1 Doom.',
            condition: { kind: 'has_doom', amount: 1 },
            effects: [{ kind: 'lose_doom', amount: 1 }],
          },
        ],
      }],
    }],
  },
}

export const wolfAbilityEffects: CardEffect[] = [
  { kind: 'lose_doom', amount: 'all' },
  drawForAlly,
  { kind: 'repeat_effect', count: 'last_doom_lost', effects: [drawForAlly] },
]

export function createWolf(makeBreach: BreachFactory): MageDef {
  return {
    wave: 9,
    type: 'wolf',
    abilityName: 'Aegis of Hope',
    abilityTrigger: { kind: 'main_phase', scope: 'current_player' },
    abilityEffects: wolfAbilityEffects,
    hp: 10,
    chargeThreshold: 6,
    startHand: ['crystal', 'crystal', 'crystal', 'doomstone', 'doom_howl'],
    startDeck: ['crystal', 'crystal', 'crystal', 'doomstone', 'doom_howl'],
    breaches: [
      makeBreach(1, false, null, false),
      makeBreach(2, false, 'east'),
      makeBreach(3, false, 'east'),
      makeBreach(4, false, 'east'),
    ],
    tracksDoom: true,
  }
}
