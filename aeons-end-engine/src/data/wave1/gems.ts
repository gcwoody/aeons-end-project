import type { CardDef, GemCard } from '../../types'

// Initial gems shared by the Wave 1 player card pool.
export const crystal: GemCard = {
  id: 'crystal', name: 'Crystal', type: 'gem', cost: 0, set: 'base',
  effects: [{
    trigger: { kind: 'on_play' },
    effects: [{ kind: 'gain_aether', amount: 1 }],
  }],
}

// Moonstone Shard is Jian's unique starting card.
export const moonstoneShard: GemCard = {
  id: 'moonstone_shard', name: 'Moonstone Shard', type: 'gem', cost: 0, set: 'base',
  effects: [{
    trigger: { kind: 'on_play' },
    effects: [
      { kind: 'gain_aether', amount: 1 },
      { kind: 'gain_conditional_aether', amount: 1, condition: 'gem' },
    ],
  }],
}

export const vriswoodAmber: GemCard = {
  id: 'vriswood_amber', name: "V'riswood Amber", type: 'gem', cost: 3, set: 'wave1',
  effects: [
    {
      trigger: { kind: 'on_play' },
      effects: [{ kind: 'gain_aether', amount: 2 }],
    },
    {
      trigger: { kind: 'on_gain' },
      effects: [{
        kind: 'choose_optional',
        prompt: 'Place V\'riswood Amber on top of your deck?',
        effects: [{ kind: 'move_gained_card', destination: 'deck_top' }],
      }],
    },
  ],
}

export const diamondCluster: GemCard = {
  id: 'diamond_cluster', name: 'Diamond Cluster', type: 'gem', cost: 4, set: 'wave1',
  effects: [
    {
      trigger: { kind: 'on_play' },
      effects: [{ kind: 'gain_aether', amount: 2 }],
    },
    {
      trigger: { kind: 'on_play' },
      condition: {
        kind: 'card_play_count_this_turn',
        cardId: 'diamond_cluster',
        comparison: 'equals',
        count: 2,
      },
      effects: [{ kind: 'gain_aether', amount: 2 }],
    },
  ],
}

export const burningOpal: GemCard = {
  id: 'burning_opal', name: 'Burning Opal', type: 'gem', cost: 5, set: 'wave1',
  effects: [{
    trigger: { kind: 'on_play' },
    effects: [
      { kind: 'gain_aether', amount: 3 },
      {
        kind: 'choose_optional',
        prompt: 'Discard a card to let an ally draw a card?',
        effects: [
          { kind: 'discard_cards', source: 'hand', amount: 1 },
          { kind: 'draw_cards', amount: 1, target: 'ally' },
        ],
      },
    ],
  }],
}

export const INITIAL_GEM_CARDS: Record<string, CardDef> = {
  crystal,
  moonstone_shard: moonstoneShard,
}

export const MARKET_GEM_CARDS: Record<string, CardDef> = {
  vriswood_amber: vriswoodAmber,
  diamond_cluster: diamondCluster,
  burning_opal: burningOpal,
}
