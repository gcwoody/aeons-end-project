import type { BreachState, CardDef, CardEffect, Direction } from '../../types'
import type { MageDef } from '../wave1/mage'

type BreachFactory = (
  index: number, opened: boolean, startDir: Direction | null,
  present?: boolean, special?: BreachState['special'],
) => BreachState

export const REMNANT_CARDS: Record<string, CardDef> = {
  violet_shard: {
    id: 'violet_shard',
    name: 'Violet Shard',
    type: 'gem',
    cost: 0,
    set: 'wave9',
    effects: [{
      trigger: { kind: 'on_play' },
      effects: [
        { kind: 'gain_aether', amount: 1 },
        {
          kind: 'choose_optional',
          prompt: 'Have an ally discard a card to gain 2 Breach Aether?',
          disableIfUnavailable: true,
          effects: [
            {
              kind: 'discard_cards',
              source: 'hand',
              amount: 1,
              minAmount: 1,
              maxAmount: 1,
              target: 'ally',
            },
            { kind: 'gain_conditional_aether', amount: 2, condition: 'breach', target: 'source' },
          ],
        },
      ],
    }],
  },
}

export const REMNANT_UNIQUE_CARDS = Object.keys(REMNANT_CARDS)

const abilityEffects: CardEffect[] = [{
  kind: 'choose_one',
  prompt: 'Choose Rebuild Matter effect',
  layout: 'mage-ability',
  options: [
    {
      id: 'rebuild',
      label: 'Return up to two spells from your discard pile and prep one additional spell on Breaches III and IV this turn',
      effects: [
        { kind: 'return_cards_to_hand', source: 'discard', amount: 2 },
        { kind: 'set_prep_limit', amount: 2, breachIndices: [3, 4] },
      ],
    },
    {
      id: 'heal_gravehold',
      label: 'Gravehold gains 4 life',
      effects: [{ kind: 'gain_life', amount: 4, target: 'gravehold' }],
    },
  ],
}]

export function createRemnant(makeBreach: BreachFactory): MageDef {
  return {
    wave: 9,
    type: 'remnant',
    abilityName: 'Rebuild Matter',
    abilityTrigger: { kind: 'main_phase', scope: 'current_player' },
    abilityEffects,
    hp: 10,
    chargeThreshold: 4,
    startHand: ['wave9_crystal', 'wave9_crystal', 'violet_shard', 'wave9_spark', 'wave9_spark'],
    startDeck: ['wave9_crystal', 'wave9_crystal', 'wave9_crystal', 'wave9_spark', 'wave9_spark'],
    breaches: [
      makeBreach(1, true, null),
      makeBreach(2, false, 'east'),
      makeBreach(3, false, 'east', true, 'rift'),
      makeBreach(4, false, 'east', true, 'rift'),
    ],
  }
}
