import type { NemesisRuleModule } from './types'

export const twiceDeadProphetRules: NemesisRuleModule = {
  id: 'twice_dead_prophet',
  unleashEffects: [
    { kind: 'gain_life', amount: 2, target: 'nemesis' },
    { kind: 'gain_nemesis_counter', counter: 'nemesis', amount: 1 },
  ],
  setup: ({ game }) => {
    if (game.nemesis.difficulty === 'increased') {
      game.nemesis.hp += 20
      game.nemesis.maxHp += 20
    }
  },
  endTurn: {
    oncePerTurn: true,
    shouldResolve: game => (game.nemesis.counters.nemesis ?? 0) >= 6,
    effects: [{
      kind: 'play_top_nemesis_specific_deck_card',
      afterPlay: [{ kind: 'lose_nemesis_counter', counter: 'nemesis', amount: 4 }],
    }],
    message: 'Twice-Dead Prophet reveals a Prophecy for every 6 Nemesis tokens',
    sourceCardId: 'twice_dead_prophet',
  },
}
