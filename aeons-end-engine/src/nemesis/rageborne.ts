import type { NemesisRuleModule } from './types'

/** Rageborne-specific Fury threshold and Strike behavior. */
export const rageborneRules: NemesisRuleModule = {
  id: 'rageborne',
  unleashEffects: [{ kind: 'gain_nemesis_counter', counter: 'fury', amount: 1 }],
  strikeAfterResolve: (game, definition, strikeId) => {
    const furyLoss = game.nemesis.difficulty === 'increased'
      ? (definition.increasedDifficultyRules.furyLossAfterStrike ?? 0)
      : (definition.standardRules.furyLossAfterStrike ?? 0)
    return [
      { kind: 'lose_nemesis_counter', counter: 'fury', amount: furyLoss },
      { kind: 'return_strike_card', cardId: strikeId },
    ]
  },
  endTurn: {
    shouldResolve: (game, definition) => {
      const threshold = definition.standardRules.endTurnStrikeThreshold
      return threshold != null && (game.nemesis.counters.fury ?? 0) >= threshold
    },
    effects: [{ kind: 'resolve_strike' }],
    message: 'Rageborne strikes at the end of the Nemesis turn',
    sourceCardId: 'rageborne:strike',
  },
}
