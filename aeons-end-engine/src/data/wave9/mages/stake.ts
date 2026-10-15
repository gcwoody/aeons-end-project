import type { BreachState, CardDef, CardEffect } from '../../../types'
import type { MageDef } from '../../wave1/mages'

type BreachFactory = (
  index: number, opened: boolean, startDir: 'east' | 'south' | 'west' | 'north' | null,
  present?: boolean, special?: BreachState['special'],
) => BreachState

const breachIndex = 4

export const STAKE_BREACH_UPGRADE_CARD_IDS = [
  'upgraded_efficiency',
  'upgraded_energetics',
  'upgraded_focus',
  'upgraded_potential',
  'upgraded_reflex',
]

export const STAKE_CARDS: Record<string, CardDef> = {
  piercing_light: {
    id: 'piercing_light',
    name: 'Piercing Light',
    type: 'spell',
    cost: 0,
    set: 'wave9',
    effects: [{
      trigger: { kind: 'on_cast' },
      effects: [
        { kind: 'deal_damage', amount: 1, target: 'nemesis_or_minion' },
        {
          kind: 'conditional',
          condition: { kind: 'has_installed_breach_upgrade', breachIndex },
          effects: [{
            kind: 'choose_optional',
            prompt: 'Destroy Piercing Light?',
            effects: [{ kind: 'destroy_cards', source: 'self' }],
          }],
        },
      ],
    }],
  },
  sagestone: {
    id: 'sagestone',
    name: 'Sagestone',
    type: 'gem',
    cost: 0,
    set: 'wave9',
    effects: [{
      trigger: { kind: 'on_play' },
      effects: [
        { kind: 'gain_aether', amount: 1 },
        {
          kind: 'choose_optional',
          prompt: 'Lose 1 Knowledge to gain a charge?',
          skipIfUnavailable: true,
          acceptCondition: { kind: 'has_knowledge', amount: 1 },
          effects: [
            { kind: 'lose_knowledge', amount: 1 },
            { kind: 'gain_charge', amount: 1, target: 'self' },
          ],
        },
      ],
    }],
  },
  upgraded_efficiency: {
    id: 'upgraded_efficiency',
    name: 'Upgraded Efficiency',
    type: 'breach_upgrade',
    cost: 2,
    set: 'wave9',
    effects: [{
      trigger: { kind: 'on_breach_upgrade_installed' },
      effects: [{ kind: 'increase_breach_prep_limit', amount: 1, breachIndex }],
    }],
  },
  upgraded_energetics: {
    id: 'upgraded_energetics',
    name: 'Upgraded Energetics',
    type: 'breach_upgrade',
    cost: 2,
    set: 'wave9',
    effects: [{
      trigger: { kind: 'on_cast' },
      oncePerTurn: true,
      effects: [{ kind: 'gain_charge', amount: 1, target: 'breach_owner' }],
    }],
  },
  upgraded_focus: {
    id: 'upgraded_focus',
    name: 'Upgraded Focus',
    type: 'breach_upgrade',
    cost: 4,
    set: 'wave9',
    effects: [{
      trigger: { kind: 'on_breach_upgrade_installed' },
      effects: [{ kind: 'increase_breach_damage_bonus', amount: 2, breachIndex }],
    }],
  },
  upgraded_potential: {
    id: 'upgraded_potential',
    name: 'Upgraded Potential',
    type: 'breach_upgrade',
    cost: 6,
    set: 'wave9',
    effects: [{
      trigger: { kind: 'on_breach_upgrade_installed' },
      effects: [{ kind: 'increase_breach_damage_bonus', amount: 3, breachIndex }],
    }],
  },
  upgraded_reflex: {
    id: 'upgraded_reflex',
    name: 'Upgraded Reflex',
    type: 'breach_upgrade',
    cost: 3,
    set: 'wave9',
    effects: [{
      trigger: { kind: 'on_cast' },
      effects: [{
        kind: 'draw_cards',
        amount: 1,
        target: 'ally',
        relativeToSpellCaster: true,
      }],
    }],
  },
}

export const STAKE_UNIQUE_CARDS = ['piercing_light', 'sagestone']

export const stakeAbilityEffects: CardEffect[] = [{
  kind: 'choose_one',
  prompt: 'Choose an effect to activate',
  layout: 'mage-ability',
  options: [
    {
      id: 'prepare_spells',
      label: 'Return a spell in your discard pile to hand. Until end of turn, you may prep any number of spells to your breach.',
      condition: { kind: 'has_card_in_zone', zone: 'discard', cardType: 'spell' },
      effects: [
        { kind: 'return_cards_to_hand', source: 'discard', amount: 1, minAmount: 1 },
        { kind: 'set_prep_limit', amount: 'unlimited', breachIndices: [breachIndex] },
      ],
    },
    {
      id: 'install_upgrade',
      label: 'Choose a set-aside breach upgrade. Spend Knowledge equal to its cost. Then, add that card and its effect to the Prototype breach.',
      condition: {
        kind: 'has_affordable_card_in_specific_deck',
        cardType: 'breach_upgrade',
        payment: 'knowledge',
        player: 'source',
      },
      effects: [{ kind: 'install_breach_upgrade', breachIndex, cardType: 'breach_upgrade', player: 'source' }],
    },
  ],
}]

export function createStake(makeBreach: BreachFactory): MageDef {
  const prototypeBreach = makeBreach(4, false, 'north', true, 'prototype')
  prototypeBreach.indestructible = true
  prototypeBreach.installedUpgrades = []

  return {
    wave: 9,
    type: 'stake',
    abilityName: 'Tinker',
    abilityTrigger: { kind: 'main_phase', scope: 'current_player' },
    abilityEffects: stakeAbilityEffects,
    hp: 10,
    chargeThreshold: 4,
    startHand: ['sagestone', 'crystal', 'crystal', 'crystal', 'piercing_light'],
    startDeck: ['sagestone', 'crystal', 'crystal', 'crystal', 'piercing_light'],
    breaches: [
      makeBreach(1, false, null, false),
      makeBreach(2, false, null, false),
      makeBreach(3, false, null, false),
      prototypeBreach,
    ],
    hasSpecificDeck: true,
    specificDeckName: "Stake's Breach Upgrade Deck",
    specificDeck: [...STAKE_BREACH_UPGRADE_CARD_IDS],
    specificDeckDisplay: 'face_up',
    tracksKnowledge: true,
  }
}
