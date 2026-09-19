import type { CardEffect, GameState, MarketPileChoice, NemesisDef, PendingDecision } from '../types'

export interface NemesisRuleContext {
  game: GameState
  definition: NemesisDef
  marketPileChoices: (game: GameState, cardType?: 'gem' | 'relic' | 'spell') => MarketPileChoice[]
  createDecision: (
    prompt: string,
    kind: PendingDecision['kind'],
    details: Record<string, unknown>,
  ) => PendingDecision
}

/**
 * Runtime rules owned by one Nemesis. Keep this surface small: only behavior
 * that is not naturally expressed as a shared CardEffect belongs here.
 */
export interface NemesisRuleModule {
  id: string
  /** The complete effect sequence performed by this Nemesis' Unleash keyword. */
  unleashEffects: CardEffect[]
  /** Optional setup owned by this Nemesis, before the first turn begins. */
  setup?: (context: NemesisRuleContext) => void
  /** Optional effects appended after a resolved Strike card. */
  strikeAfterResolve?: (game: GameState, definition: NemesisDef, strikeId: string) => CardEffect[]
  endTurn?: NemesisEndTurnRule
}

export interface NemesisEndTurnRule {
  /** Whether this Nemesis has an additional end-of-turn action to resolve. */
  shouldResolve: (game: GameState, definition: NemesisDef) => boolean
  /** Effects are still executed by the shared effect interpreter. */
  effects: CardEffect[]
  message: string
  sourceCardId: string
}
