import type { CardDef, SpellCard } from '../../types'

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
          { kind: 'gain_life', amount: 1, target: 'any_player' },
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

export const INITIAL_SPELL_CARDS: Record<string, CardDef> = {
  spark,
  buried_light: buriedLight,
}

export const MARKET_SPELL_CARDS: Record<string, CardDef> = {
  lava_tendril: lavaTendril,
  essence_theft: essenceTheft,
  planar_insight: planarInsight,
  arcane_nexus: arcaneNexus,
}
