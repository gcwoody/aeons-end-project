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
  /** Use this when a Nemesis' Unleash changes with its current board state. */
  unleashEffectsFor?: (game: GameState) => CardEffect[]
  /** Optional setup owned by this Nemesis, before the first turn begins. */
  setup?: (context: NemesisRuleContext) => void
  /** Optional effects appended after a resolved Strike card. */
  strikeAfterResolve?: (game: GameState, definition: NemesisDef, strikeId: string) => CardEffect[]
  /** Optional shared continuation appended to each matching Persistent card. */
  additionalPersistentEffects?: (game: GameState, card: import('../types').NemesisCardDef) => CardEffect[]
  /** Apply a Nemesis' shared damage rule at the common damage entry point. */
  modifyDamageTaken?: (game: GameState, amount: number, sourceCardId?: string) => number
  /** Whether the Nemesis currently has a rules-defined vulnerable state. */
  isVulnerable?: (game: GameState) => boolean
  /** Actions and effects for a Nemesis with a clickable sub board. */
  subBoard?: NemesisSubBoardRules
  /** Effects to queue after a Power token is removed from the named card instance. */
  afterPowerTokenRemoved?: (game: GameState, card: import('../types').NemesisCardInPlay) => CardEffect[]
  endTurn?: NemesisEndTurnRule
}

export interface NemesisSubBoardRules {
  id: string
  /** Ordered route from the starting space through each track space. */
  tokenRoute?: (tokenId: string) => readonly string[] | undefined
  /** Player operation that spends Aether to place a board token. */
  placement?: { tokenId: string; cost: number; regionIds: readonly string[] }
  canPlaceToken?: (game: GameState, playerId: string, tokenId: string, regionId: string) => boolean
  /** Effects to resolve when a token enters a region. */
  effectsForRegion?: (game: GameState, tokenId: string, regionId: string) => CardEffect[]
  /** Effects triggered immediately after a token has been placed by an effect. */
  afterTokenPlaced?: (game: GameState, tokenId: string, regionId: string) => CardEffect[]
  /** Return a route token to its first region after resolving the final region. */
  returnToStartAtRouteEnd?: boolean
}

export interface NemesisEndTurnRule {
  /** Whether this Nemesis has an additional end-of-turn action to resolve. */
  shouldResolve: (game: GameState, definition: NemesisDef) => boolean
  /** Effects are still executed by the shared effect interpreter. */
  effects: CardEffect[]
  message: string
  sourceCardId: string
  /** Run this end-of-turn action at most once during the current Nemesis turn. */
  oncePerTurn?: boolean
}
