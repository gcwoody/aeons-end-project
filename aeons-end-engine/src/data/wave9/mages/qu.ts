import type { BreachState, CardDef, CardEffect } from '../../../types'
import type { MageDef } from '../../wave1/mages'

type BreachFactory = (
  index: number, opened: boolean, startDir: 'east' | 'south' | 'west' | 'north' | null,
  present?: boolean,
) => BreachState

export const QU_CARDS: Record<string, CardDef> = {
  molded_valite: {
    id: 'molded_valite', name: 'Molded Valite', type: 'gem', cost: 0, set: 'wave9',
    effects: [{
      trigger: { kind: 'on_play' },
      effects: [
        { kind: 'gain_aether', amount: 1 },
        {
          kind: 'choose_optional',
          prompt: "Flip Qu's Form Card?",
          effects: [{ kind: 'flip_mage_form', target: 'source' }],
        },
      ],
    }],
  },
  qus_form_card: {
    id: 'qus_form_card', name: "Qu's Form Card", type: 'mage_form', cost: 0, set: 'wave9',
    effects: [
      {
        trigger: { kind: 'on_gain_from_supply_pile' },
        effectPlayerScope: 'owner',
        condition: {
          kind: 'all_of',
          conditions: [
            { kind: 'mage_form_is', form: 'giver', player: 'active' },
            { kind: 'player_relation_to_source', relation: 'same' },
          ],
        },
        effects: [{ kind: 'resolve_mage_form_supply_gain', formSide: 'giver', step: 'offer' }],
      },
      {
        trigger: { kind: 'on_gain_from_supply_pile' },
        effectPlayerScope: 'owner',
        condition: {
          kind: 'all_of',
          conditions: [
            { kind: 'mage_form_is', form: 'taker', player: 'active' },
            { kind: 'player_relation_to_source', relation: 'ally' },
          ],
        },
        effects: [{ kind: 'resolve_mage_form_supply_gain', formSide: 'taker', step: 'offer' }],
      },
    ],
  },
}

export const QU_UNIQUE_CARDS = Object.keys(QU_CARDS)

const flipForm: CardEffect = { kind: 'flip_mage_form', target: 'source' }

export function createQu(makeBreach: BreachFactory): MageDef {
  return {
    wave: 9,
    type: 'qu',
    abilityName: 'Twinned Retrieval',
    abilityTrigger: { kind: 'main_phase', scope: 'current_player' },
    abilityEffects: [{
      kind: 'choose_one',
      prompt: 'Choose Twinned Retrieval effect',
      layout: 'mage-ability',
      options: [
        {
          id: 'giver',
          label: 'Giver: An ally draws 3 cards. Flip Qu’s Form Card.',
          condition: { kind: 'mage_form_is', form: 'giver', player: 'source' },
          effects: [
            { kind: 'draw_cards', amount: 1, target: 'ally', relativeToSource: true },
            { kind: 'draw_cards', amount: 1, target: 'ally', relativeToSource: true },
            { kind: 'draw_cards', amount: 1, target: 'ally', relativeToSource: true },
            flipForm,
          ],
        },
        {
          id: 'taker',
          label: 'Taker: Cast an ally’s prepped spell and put it into your hand. Flip Qu’s Form Card.',
          condition: {
            kind: 'all_of',
            conditions: [
              { kind: 'mage_form_is', form: 'taker', player: 'source' },
              { kind: 'has_ally_prepped_spell' },
            ],
          },
          effects: [{
            kind: 'cast_prepped_spell', source: 'any_prepped_spell',
            ownerScope: 'ally', returnToCasterHand: true,
          }, flipForm],
        },
      ],
    }],
    hp: 10,
    chargeThreshold: 4,
    startHand: ['crystal', 'crystal', 'crystal', 'molded_valite', 'spark'],
    startDeck: ['crystal', 'crystal', 'crystal', 'spark', 'spark'],
    hasSpecificDeck: true,
    specificDeckName: "Qu's Form Card",
    specificDeck: ['qus_form_card'],
    specificDeckDisplay: 'face_up',
    initialFormSide: 'giver',
    breaches: [
      makeBreach(1, true, null),
      makeBreach(2, false, 'west'),
      makeBreach(3, false, 'south'),
      makeBreach(4, false, 'south'),
    ],
  }
}
