import type { GameState, NemesisCardInPlay } from '../types'

/** Board-row position is independent of the identity assigned on entering play. */
export function compareNemesisCardsInRow(a: NemesisCardInPlay, b: NemesisCardInPlay): number {
  return (a.displayOrder ?? a.placedAt) - (b.displayOrder ?? b.placedAt)
}

/** Active cards resolve in the same left-to-right, top-to-bottom order as the board. */
export function orderedNemesisMainCards(cards: readonly NemesisCardInPlay[]): NemesisCardInPlay[] {
  return [...cards].sort((a, b) => {
    const rowOrder = (a.displayRow === 'top' ? 0 : 1) - (b.displayRow === 'top' ? 0 : 1)
    return rowOrder || compareNemesisCardsInRow(a, b)
  })
}

/** Moving into a different board row places this physical card at that row's right end. */
export function markNemesisCardRowArrival(game: GameState, card: NemesisCardInPlay): void {
  const boardCards = [...game.nemesis.playArea, ...(game.nemesis.setAsideCards ?? [])]
  const previousOrder = boardCards.reduce(
    (highest, candidate) => Math.max(highest, candidate.placedAt, candidate.displayOrder ?? 0),
    Math.max(game.nemesis.cardInstanceCounter ?? 0, card.placedAt, card.displayOrder ?? 0),
  )
  card.displayOrder = previousOrder + 1
  game.nemesis.cardInstanceCounter = card.displayOrder
}
