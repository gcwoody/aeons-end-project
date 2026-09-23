import type { GemCard, SpellCard } from '../../types'

/** Wave 9's alternate artwork for the shared starting Gem. */
export const wave9Crystal: GemCard = {
  id: 'wave9_crystal', name: 'Crystal', type: 'gem', cost: 0, set: 'wave9',
  effects: [{
    trigger: { kind: 'on_play' },
    effects: [{ kind: 'gain_aether', amount: 1 }],
  }],
}

/** Wave 9's alternate artwork for the shared starting Spell. */
export const wave9Spark: SpellCard = {
  id: 'wave9_spark', name: 'Spark', type: 'spell', cost: 0, set: 'wave9',
  effects: [{
    trigger: { kind: 'on_cast' },
    effects: [{ kind: 'deal_damage', amount: 1, target: 'nemesis_or_minion' }],
  }],
}
