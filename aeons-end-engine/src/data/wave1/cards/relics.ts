import type { CardDef, RelicCard } from '../../../types'

export const flexingDagger: RelicCard = {
  id: 'flexing_dagger', name: 'Flexing Dagger', type: 'relic',
  cost: 2, set: 'wave1',
  effects: [{
    trigger: { kind: 'on_play' },
    effects: [{
      kind: 'choose_one',
      prompt: 'Choose a Flexing Dagger effect',
      options: [
        {
          id: 'reduce_breach_cost',
          label: 'Reduce the next focus or open cost by 3',
          condition: { kind: 'has_unopened_breach' },
          effects: [{ kind: 'modify_next_breach_cost', amount: 3, actions: ['focus', 'open'] }],
        },
        {
          id: 'destroy_for_damage',
          label: 'Destroy this to deal 1 damage',
          effects: [
            { kind: 'destroy_cards', source: 'self' },
            { kind: 'deal_damage', amount: 1, target: 'nemesis_or_minion' },
          ],
        },
      ],
    }],
  }],
}

export const bottledVortex: RelicCard = {
  id: 'bottled_vortex', name: 'Bottled Vortex', type: 'relic',
  cost: 3, set: 'wave1',
  effects: [{
    trigger: { kind: 'on_play' },
    effects: [
      { kind: 'destroy_cards', source: 'self' },
      { kind: 'destroy_cards', source: 'hand_or_discard', maxAmount: 2 },
      { kind: 'draw_cards', amount: 1 },
    ],
  }],
}

export const blastingStaff: RelicCard = {
  id: 'blasting_staff', name: 'Blasting Staff', type: 'relic', cost: 4, set: 'wave1',
  effects: [{
    trigger: { kind: 'on_play' },
    effects: [{
      kind: 'choose_optional',
      prompt: 'Cast a spell prepped this turn for +2 damage?',
      disableIfUnavailable: true,
      effects: [{ kind: 'cast_prepped_spell', source: 'prepped_spell_prepped_this_turn', discard: true, bonusDamage: 2 }],
    }],
  }],
}

export const focusingOrb: RelicCard = {
  id: 'focusing_orb', name: 'Focusing Orb', type: 'relic', cost: 4, set: 'wave1',
  effects: [{
    trigger: { kind: 'on_play' },
    effects: [{
      kind: 'choose_one',
      prompt: 'Choose a Focusing Orb effect',
      options: [
        { id: 'focus', label: "Focus any player's closed breach", effects: [{ kind: 'focus_breach', target: 'any_player', selection: 'choose' }] },
        { id: 'destroy', label: 'Destroy this to let Gravehold gain 3 life', effects: [{ kind: 'destroy_cards', source: 'self' }, { kind: 'gain_life', amount: 3, target: 'gravehold' }] },
      ],
    }],
  }],
}

export const magesTalisman: RelicCard = {
  id: 'mages_talisman', name: "Mage's Talisman", type: 'relic', cost: 5, set: 'wave1',
  effects: [{
    trigger: { kind: 'on_play' },
    effects: [
      { kind: 'gain_charge', amount: 1, target: 'self' },
      { kind: 'gain_charge', amount: 1, target: 'allies_collectively' },
    ],
  }],
}

export const unstablePrism: RelicCard = {
  id: 'unstable_prism', name: 'Unstable Prism', type: 'relic', cost: 3, set: 'wave1',
  effects: [{
    trigger: { kind: 'on_play' },
    effects: [{
      kind: 'choose_one',
      prompt: 'Choose an Unstable Prism effect',
      options: [
        {
          id: 'play_gem',
          label: 'Play a gem in hand twice, then destroy it',
          condition: { kind: 'has_card_in_hand', cardType: 'gem' },
          effects: [{ kind: 'play_card_from_hand', cardType: 'gem', times: 2, destroy: true }],
        },
        { id: 'gain_aether', label: 'Gain 2 Aether', effects: [{ kind: 'gain_aether', amount: 2 }] },
      ],
    }],
  }],
}

export const MARKET_RELIC_CARDS: Record<string, CardDef> = {
  flexing_dagger: flexingDagger,
  bottled_vortex: bottledVortex,
  blasting_staff: blastingStaff,
  focusing_orb: focusingOrb,
  mages_talisman: magesTalisman,
  unstable_prism: unstablePrism,
}
