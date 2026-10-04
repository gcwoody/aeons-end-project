import type { BreachState, CardDef, CardEffect } from '../../../types'
import type { MageDef } from '../../wave1/mages'

type BreachFactory = (
  index: number, opened: boolean, startDir: 'east' | 'south' | 'west' | 'north' | null,
  present?: boolean, special?: BreachState['special'],
) => BreachState

export const YAN_MAGDA_CARDS: Record<string, CardDef> = {
  foretold_flame: {
    id: 'foretold_flame', name: 'Foretold Flame', type: 'spell', cost: 0, set: 'wave9',
    effects: [
      {
        trigger: { kind: 'on_breach_open' },
        effects: [{ kind: 'deal_damage', amount: 2, target: 'nemesis_or_minion' }],
      },
      {
        trigger: { kind: 'on_cast' },
        effects: [{ kind: 'deal_damage', amount: 1, target: 'nemesis_or_minion' }],
      },
    ],
  },
}

export const YAN_MAGDA_UNIQUE_CARDS = Object.keys(YAN_MAGDA_CARDS)

export function createYanMagda(makeBreach: BreachFactory): MageDef {
  const abilityEffects: CardEffect[] = [
    { kind: 'gain_card_from_market' },
    {
      kind: 'choose_optional',
      prompt: 'Have an ally reset an opened III or IV breach to its starting position and gain a card on top of their deck?',
      acceptCondition: { kind: 'has_opened_breach', target: 'ally', breachIndices: [3, 4] },
      effects: [
        { kind: 'reset_open_breach', target: 'ally', breachIndices: [3, 4] },
        { kind: 'gain_card_from_market', destination: 'deck_top' },
      ],
    },
  ]

  return {
    wave: 9,
    type: 'yan_magda',
    abilityName: 'Void Touch',
    abilityTrigger: { kind: 'main_phase', scope: 'current_player' },
    abilityEffects,
    hp: 10,
    chargeThreshold: 5,
    startHand: ['crystal', 'crystal', 'crystal', 'foretold_flame', 'spark'],
    startDeck: ['crystal', 'crystal', 'crystal', 'spark', 'spark'],
    breaches: [
      makeBreach(1, true, null),
      makeBreach(2, true, null),
      makeBreach(3, false, 'east', true, 'intoned'),
      makeBreach(4, false, 'east', true, 'intoned'),
    ],
  }
}
