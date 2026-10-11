import type { CardInstanceState, GameState } from '../types'

export interface CardInstanceRef {
  cardId: string
  instanceId: string
  revealed: boolean
}

/** Create a stable ID for a physical card copy and register its memory. */
export function createCardInstance(
  game: GameState, cardId: string, revealed = false, stableId?: string,
): CardInstanceRef {
  game.cardInstanceStates ??= {}
  const instanceId = stableId ?? nextCardInstanceId(game)
  const state = game.cardInstanceStates[instanceId] ??= { cardId, revealed }
  state.cardId = cardId
  if (revealed) markCardInstanceRevealed(game, instanceId)
  return { cardId, instanceId, revealed: state.revealed }
}

function nextCardInstanceId(game: GameState): string {
  game.cardInstanceCounter = (game.cardInstanceCounter ?? 0) + 1
  return `card-instance:${game.cardInstanceCounter}`
}

/** Ensure a zone's identity list mirrors its card list, migrating older saves. */
export function ensureCardInstanceZone(
  game: GameState,
  cards: string[],
  instanceIds: string[] | undefined,
  defaultRevealed = false,
): string[] {
  const priorIds = instanceIds ?? []
  const unusedIds = new Set(priorIds)
  const ids = cards.map(cardId => {
    const matchingId = [...unusedIds].find(id => game.cardInstanceStates?.[id]?.cardId === cardId)
    if (matchingId) {
      unusedIds.delete(matchingId)
      if (defaultRevealed) markCardInstanceRevealed(game, matchingId)
      return matchingId
    }
    return createCardInstance(game, cardId, defaultRevealed).instanceId
  })
  if (instanceIds) {
    if (instanceIds.length !== ids.length || instanceIds.some((id, index) => id !== ids[index])) {
      instanceIds.splice(0, instanceIds.length, ...ids)
    }
    return instanceIds
  }
  return ids
}

export function cardInstanceState(game: GameState, instanceId: string): CardInstanceState | undefined {
  return game.cardInstanceStates?.[instanceId]
}

/** Find a registered physical copy by definition when its deck is unique-card based. */
export function findCardInstanceId(game: GameState, cardId: string): string | undefined {
  return Object.entries(game.cardInstanceStates ?? {}).find(([, state]) => state.cardId === cardId)?.[0]
}

export function markCardInstanceRevealed(game: GameState, instanceId: string): void {
  const state = game.cardInstanceStates?.[instanceId]
  if (state) state.revealed = true
}

/** Explicitly hide a physical copy when a rule puts it into a hidden deck. */
export function markCardInstanceHidden(game: GameState, instanceId: string): void {
  const state = game.cardInstanceStates?.[instanceId]
  if (state) state.revealed = false
}

/** A physical copy that entered a shuffled deck no longer has a known position. */
export function resetCardInstancesAfterShuffle(game: GameState, instanceIds: string[]): void {
  // A shuffle hides the positions of copies inside this deck only. A matching
  // card that remains in another known zone keeps its own reveal memory.
  for (const instanceId of instanceIds) {
    const state = game.cardInstanceStates?.[instanceId]
    if (state) state.revealed = false
  }
  if (game.trinketDeckInstanceIds) {
    game.trinketDeckRevealed = game.trinketDeckInstanceIds.map(instanceId =>
      isCardInstanceRevealed(game, instanceId),
    )
  }
  if (game.nemesis.corruptionDeckInstanceIds) {
    game.nemesis.corruptionDeckRevealed = game.nemesis.corruptionDeckInstanceIds.map(instanceId =>
      isCardInstanceRevealed(game, instanceId),
    )
  }
}

export function isCardInstanceRevealed(game: GameState, instanceId: string | undefined): boolean {
  return instanceId ? game.cardInstanceStates?.[instanceId]?.revealed === true : false
}

/** Remove a physical card and its identity from parallel zone arrays. */
export function removeCardInstanceAt(
  game: GameState, cards: string[], instanceIds: string[], index: number,
): CardInstanceRef | undefined {
  ensureCardInstanceZone(game, cards, instanceIds)
  if (index < 0 || index >= cards.length) return undefined
  const cardId = cards.splice(index, 1)[0]
  const instanceId = instanceIds.splice(index, 1)[0]
  if (!cardId || !instanceId) return undefined
  return { cardId, instanceId, revealed: isCardInstanceRevealed(game, instanceId) }
}

/** Insert a moved physical card, preserving its stable identity and history. */
export function insertCardInstanceAt(
  game: GameState,
  cards: string[],
  instanceIds: string[],
  card: CardInstanceRef,
  index = cards.length,
  reveal = false,
): void {
  ensureCardInstanceZone(game, cards, instanceIds)
  const safeIndex = Math.max(0, Math.min(index, cards.length))
  cards.splice(safeIndex, 0, card.cardId)
  instanceIds.splice(safeIndex, 0, card.instanceId)
  createCardInstance(game, card.cardId, reveal || card.revealed, card.instanceId)
  if (reveal) markCardInstanceRevealed(game, card.instanceId)
}

/** Register fresh physical copies for a zone being initialized at setup. */
export function initializeCardInstanceZone(
  game: GameState, cards: string[], defaultRevealed = false,
): string[] {
  return cards.map(cardId => createCardInstance(game, cardId, defaultRevealed).instanceId)
}
