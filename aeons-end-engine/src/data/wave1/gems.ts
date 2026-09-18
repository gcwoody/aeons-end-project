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

// Wave 1 Mage-specific cards. Their complete reusable effects are added in
// the card-effect implementation phase; these definitions are registered now
// so Mage setup, saves, and the UI can resolve their card metadata safely.
export const amethystShard: GemCard = {
  id: 'amethyst_shard', name: 'Amethyst Shard', type: 'gem', cost: 0, set: 'base',
  effects: [{
    trigger: { kind: 'on_play' },
    effects: [
      { kind: 'gain_aether', amount: 1 },
      {
        kind: 'choose_optional',
        prompt: 'Let an ally draw a card, then discard a card?',
        effects: [
          { kind: 'draw_cards', amount: 1, target: 'ally' },
          { kind: 'discard_cards', source: 'hand', amount: 1 },
        ],
      },
    ],
  }],
}

export const emeraldShard: GemCard = {
  id: 'emerald_shard', name: 'Emerald Shard', type: 'gem', cost: 0, set: 'base',
  effects: [{
    trigger: { kind: 'on_play' },
    effects: [{
      kind: 'choose_one',
      prompt: 'Choose an Emerald Shard effect',
      options: [
        { id: 'gain_aether', label: 'Gain 1 Aether', effects: [{ kind: 'gain_aether', amount: 1 }] },
        { id: 'gain_life', label: 'Let any player gain 1 Life', effects: [{ kind: 'gain_life', amount: 1, target: 'any_player' }] },
      ],
    }],
  }],
}

export const quartzShard: GemCard = {
  id: 'quartz_shard', name: 'Quartz Shard', type: 'gem', cost: 0, set: 'base',
  effects: [{
    trigger: { kind: 'on_play' },
    effects: [
      { kind: 'gain_aether', amount: 1 },
      {
        kind: 'reveal_turn_order_card',
        returnChoice: true,
        playerEffects: [{ kind: 'gain_aether', amount: 1 }],
        nemesisEffects: [],
      },
    ],
  }],
}

export const garnetShard: GemCard = {
  id: 'garnet_shard', name: 'Garnet Shard', type: 'gem', cost: 0, set: 'base',
  effects: [{
    trigger: { kind: 'on_play' },
    effects: [{
      kind: 'choose_one',
      prompt: 'Choose a Garnet Shard effect',
      options: [
        { id: 'gain_aether', label: 'Gain 1 Aether', effects: [{ kind: 'gain_aether', amount: 1 }] },
        {
          id: 'cast_prepped_spell', label: "Cast any player's prepped spell",
          effects: [{ kind: 'cast_prepped_spell', source: 'any_prepped_spell', discard: true }],
        },
      ],
    }],
  }],
}

export const tourmalineShard: GemCard = {
  id: 'tourmaline_shard', name: 'Tourmaline Shard', type: 'gem', cost: 0, set: 'base',
  effects: [{
    trigger: { kind: 'on_play' },
    effects: [
      { kind: 'gain_aether', amount: 1 },
      {
        kind: 'choose_optional',
        prompt: 'Let an ally suffer 1 damage to destroy a card in hand?',
        effects: [
          { kind: 'deal_player_damage', amount: 1, target: 'ally' },
          { kind: 'destroy_cards', source: 'hand', minAmount: 1, maxAmount: 1 },
        ],
      },
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
          {
            kind: 'conditional',
            condition: { kind: 'last_selection_nonempty' },
            effects: [{ kind: 'draw_cards', amount: 1, target: 'ally' }],
          },
        ],
      },
    ],
  }],
}

export const cloudedSapphire: GemCard = {
  id: 'clouded_sapphire', name: 'Clouded Sapphire', type: 'gem', cost: 6, set: 'wave1',
  effects: [{
    trigger: { kind: 'on_play' },
    effects: [
      { kind: 'gain_aether', amount: 3 },
      {
        kind: 'conditional',
        condition: { kind: 'card_play_count_this_turn', cardId: 'clouded_sapphire', comparison: 'equals', count: 1 },
        effects: [{ kind: 'gain_charge', amount: 1, target: 'allies_collectively' }],
      },
    ],
  }],
}

export const jade: GemCard = {
  id: 'jade', name: 'Jade', type: 'gem', cost: 2, set: 'wave1',
  effects: [{ trigger: { kind: 'on_play' }, effects: [{ kind: 'gain_aether', amount: 2 }] }],
}

export const searingRuby: GemCard = {
  id: 'searing_ruby', name: 'Searing Ruby', type: 'gem', cost: 4, set: 'wave1',
  effects: [{
    trigger: { kind: 'on_play' },
      effects: [
        { kind: 'gain_aether', amount: 2 },
        { kind: 'gain_conditional_aether', amount: 1, condition: 'spell' },
    ],
  }],
}

export const siftersPearl: GemCard = {
  id: 'sifters_pearl', name: "Sifter's Pearl", type: 'gem', cost: 3, set: 'wave1',
  effects: [{
    trigger: { kind: 'on_play' },
    effects: [
      { kind: 'gain_aether', amount: 2 },
      { kind: 'review_top_cards' },
    ],
  }],
}

export const INITIAL_GEM_CARDS: Record<string, CardDef> = {
  crystal,
  moonstone_shard: moonstoneShard,
  amethyst_shard: amethystShard,
  emerald_shard: emeraldShard,
  quartz_shard: quartzShard,
  garnet_shard: garnetShard,
  tourmaline_shard: tourmalineShard,
}

export const MARKET_GEM_CARDS: Record<string, CardDef> = {
  vriswood_amber: vriswoodAmber,
  diamond_cluster: diamondCluster,
  burning_opal: burningOpal,
  clouded_sapphire: cloudedSapphire,
  jade,
  searing_ruby: searingRuby,
  sifters_pearl: siftersPearl,
}
