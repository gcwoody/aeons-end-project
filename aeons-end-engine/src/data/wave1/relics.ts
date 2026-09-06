import type { CardDef, RelicCard } from '../../types'

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

export const MARKET_RELIC_CARDS: Record<string, CardDef> = {
  flexing_dagger: flexingDagger,
  bottled_vortex: bottledVortex,
}
