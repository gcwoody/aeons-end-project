import type { CardDef, SpellCard } from '../../../types'

// Spark is shared by all mages.
export const spark: SpellCard = {
  id: 'spark', name: 'Spark', type: 'spell', cost: 0, set: 'base',
  effects: [{
    trigger: { kind: 'on_cast' },
    effects: [{ kind: 'deal_damage', amount: 1, target: 'nemesis_or_minion' }],
  }],
}

// Buried Light is Brama's unique starting card.
export const buriedLight: SpellCard = {
  id: 'buried_light', name: 'Buried Light', type: 'spell', cost: 0, set: 'base',
  effects: [{
    trigger: { kind: 'on_cast' },
    effects: [
      { kind: 'deal_damage', amount: 1, target: 'nemesis_or_minion' },
      { kind: 'gain_aether', amount: 1 },
    ],
  }],
}

// Flare reveals the top unrevealed turn-order card without changing its position.
export const flare: SpellCard = {
  id: 'flare', name: 'Flare', type: 'spell', cost: 0, set: 'base',
  effects: [{
    trigger: { kind: 'on_cast' },
    effects: [{
      kind: 'reveal_turn_order_card',
      playerEffects: [{ kind: 'deal_damage', amount: 3, target: 'nemesis_or_minion' }],
      nemesisEffects: [{ kind: 'deal_damage', amount: 1, target: 'nemesis_or_minion' }],
    }],
  }],
}

export const lavaTendril: SpellCard = {
  id: 'lava_tendril', name: 'Lava Tendril', type: 'spell', cost: 4, set: 'wave1',
  effects: [
    {
      trigger: { kind: 'while_prepped', phase: 'casting_phase_end' },
      oncePerTurn: true,
      requiresConfirmation: true,
      effects: [{ kind: 'deal_damage', amount: 1, target: 'nemesis_or_minion' }],
    },
    {
      trigger: { kind: 'on_cast' },
      effects: [{ kind: 'deal_damage', amount: 3, target: 'nemesis_or_minion' }],
    },
  ],
}

export const essenceTheft: SpellCard = {
  id: 'essence_theft', name: 'Essence Theft', type: 'spell', cost: 5, set: 'wave1',
  effects: [{
    trigger: { kind: 'on_cast' },
    effects: [
      { kind: 'deal_damage', amount: 3, target: 'nemesis_or_minion' },
      {
        kind: 'choose_optional',
        prompt: 'Discard a card so any player gains 1 life?',
        effects: [
          { kind: 'discard_cards', source: 'hand', amount: 1 },
          {
            kind: 'conditional',
            condition: { kind: 'last_selection_nonempty' },
            effects: [{ kind: 'gain_life', amount: 1, target: 'any_player' }],
          },
        ],
      },
    ],
  }],
}

export const planarInsight: SpellCard = {
  id: 'planar_insight', name: 'Planar Insight', type: 'spell', cost: 6, set: 'wave1',
  effects: [{
    trigger: { kind: 'on_cast' },
    effects: [{
      kind: 'deal_damage',
      amount: { kind: 'per_open_breach', base: 2, amountPerBreach: 1 },
      target: 'nemesis_or_minion',
    }],
  }],
}

export const arcaneNexus: SpellCard = {
  id: 'arcane_nexus', name: 'Arcane Nexus', type: 'spell', cost: 7, set: 'wave1',
  effects: [
    {
      trigger: { kind: 'while_prepped', phase: 'main_phase' },
      oncePerTurn: true,
      effects: [{
        kind: 'choose_optional',
        prompt: 'Return a gem played this turn to your hand?',
        effects: [{ kind: 'return_card_to_hand', source: 'played_gem_this_turn' }],
      }],
    },
    {
      trigger: { kind: 'on_cast' },
      effects: [{ kind: 'deal_damage', amount: 4, target: 'nemesis_or_minion' }],
    },
  ],
}

export const amplifyVision: SpellCard = {
  id: 'amplify_vision', name: 'Amplify Vision', type: 'spell', cost: 4, set: 'wave1',
  effects: [{
    trigger: { kind: 'on_cast' },
    effects: [
      { kind: 'focus_breach', target: 'self', selection: 'lowest_focus_cost' },
      {
        kind: 'deal_damage',
        amount: 2,
        target: 'nemesis_or_minion',
        additionalDamage: [{ amount: 1, condition: { kind: 'all_breaches_opened' } }],
      },
    ],
  }],
}

export const chaosArc: SpellCard = {
  id: 'chaos_arc', name: 'Chaos Arc', type: 'spell', cost: 6, set: 'wave1',
  effects: [{
    trigger: { kind: 'on_cast' },
    effects: [{ kind: 'deal_damage', amount: { kind: 'per_adjacent_prepped_spell', base: 3, amountPerSpell: 2 }, target: 'nemesis_or_minion' }],
  }],
}

export const consumingVoid: SpellCard = {
  id: 'consuming_void', name: 'Consuming Void', type: 'spell', cost: 7, set: 'wave1',
  effects: [{
    trigger: { kind: 'on_cast' },
    effects: [
      { kind: 'destroy_cards', source: 'hand', minAmount: 0, maxAmount: 2 },
      { kind: 'deal_damage_from_last_selection', target: 'nemesis_or_minion', amountPerCard: 3 },
    ],
  }],
}

export const darkFire: SpellCard = {
  id: 'dark_fire', name: 'Dark Fire', type: 'spell', cost: 5, set: 'wave1',
  effects: [{
    trigger: { kind: 'on_cast' },
    effects: [
      { kind: 'discard_cards', source: 'hand', amount: 0, minAmount: 0, maxAmount: 2 },
      { kind: 'deal_damage_from_last_selection', target: 'nemesis_or_minion', amountPerCard: 3 },
    ],
  }],
}

export const feralLightning: SpellCard = {
  id: 'feral_lightning', name: 'Feral Lightning', type: 'spell', cost: 5, set: 'wave1', prepToClosedBreach: true,
  effects: [{ trigger: { kind: 'on_cast' }, effects: [{ kind: 'deal_damage', amount: 3, target: 'nemesis_or_minion' }] }],
}

export const ignite: SpellCard = {
  id: 'ignite', name: 'Ignite', type: 'spell', cost: 4, set: 'wave1',
  effects: [{
    trigger: { kind: 'on_cast' },
    effects: [
      { kind: 'deal_damage', amount: 2, target: 'nemesis_or_minion' },
      { kind: 'gain_charge', amount: 1, target: 'allies_collectively' },
    ],
  }],
}

export const oblivionSwell: SpellCard = {
  id: 'oblivion_swell', name: 'Oblivion Swell', type: 'spell', cost: 5, set: 'wave1',
  effects: [
    {
      trigger: { kind: 'while_prepped', phase: 'main_phase' },
      oncePerTurn: true,
      manualActivation: true,
      effects: [{ kind: 'gain_aether', amount: 1 }],
    },
    {
      trigger: { kind: 'on_cast' },
      effects: [
        {
          kind: 'deal_damage',
          amount: 2,
          target: 'nemesis_or_minion',
          additionalDamage: [{
            amount: { kind: 'last_selection_cost' },
            condition: { kind: 'last_selection_nonempty' },
          }],
        },
        {
          kind: 'choose_optional',
          prompt: 'Discard a gem to deal additional damage equal to its cost?',
          disableIfUnavailable: true,
          effects: [
            { kind: 'discard_cards', source: 'hand', amount: 1, minAmount: 1, maxAmount: 1, cardType: 'gem' },
          ],
        },
      ],
    },
  ],
}

export const phoenixFlame: SpellCard = {
  id: 'phoenix_flame', name: 'Phoenix Flame', type: 'spell', cost: 3, set: 'wave1',
  effects: [{
    trigger: { kind: 'on_cast' },
    effects: [
      {
        kind: 'deal_damage',
        amount: 2,
        target: 'nemesis_or_minion',
        additionalDamage: [{ amount: 2, condition: { kind: 'last_optional_accepted' } }],
      },
      {
        kind: 'choose_optional',
        prompt: 'Lose 1 charge to deal 2 additional damage?',
        acceptCondition: { kind: 'has_charge', amount: 1 },
        effects: [{ kind: 'lose_charge', amount: 1 }],
      },
    ],
  }],
}

export const spectralEcho: SpellCard = {
  id: 'spectral_echo', name: 'Spectral Echo', type: 'spell', cost: 3, set: 'wave1',
  effects: [{
    trigger: { kind: 'on_cast' },
    effects: [
      { kind: 'deal_damage', amount: 2, target: 'nemesis_or_minion' },
      { kind: 'choose_optional', prompt: 'Destroy a card in hand?', effects: [{ kind: 'destroy_cards', source: 'hand', minAmount: 0, maxAmount: 1 }] },
    ],
  }],
}

export const wildfireWhip: SpellCard = {
  id: 'wildfire_whip', name: 'Wildfire Whip', type: 'spell', cost: 6, set: 'wave1',
  effects: [
    {
      trigger: { kind: 'while_prepped', phase: 'main_phase' },
      condition: { kind: 'has_aether', amount: 2 },
      manualActivation: true,
      effects: [
        { kind: 'spend_aether', amount: 2 },
        { kind: 'cast_prepped_spell', source: 'any_prepped_spell' },
      ],
    },
    { trigger: { kind: 'on_cast' }, effects: [{ kind: 'deal_damage', amount: 4, target: 'nemesis_or_minion' }] },
  ],
}

export const INITIAL_SPELL_CARDS: Record<string, CardDef> = {
  spark,
  buried_light: buriedLight,
  flare,
}

export const MARKET_SPELL_CARDS: Record<string, CardDef> = {
  lava_tendril: lavaTendril,
  essence_theft: essenceTheft,
  planar_insight: planarInsight,
  arcane_nexus: arcaneNexus,
  amplify_vision: amplifyVision,
  chaos_arc: chaosArc,
  consuming_void: consumingVoid,
  dark_fire: darkFire,
  feral_lightning: feralLightning,
  ignite,
  oblivion_swell: oblivionSwell,
  phoenix_flame: phoenixFlame,
  spectral_echo: spectralEcho,
  wildfire_whip: wildfireWhip,
}
