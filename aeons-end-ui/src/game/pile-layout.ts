export type PileKind = 'deck' | 'discard'

export function chunkCards<T>(cards: T[], size = 5): T[][] {
  const groups: T[][] = []
  for (let i = 0; i < cards.length; i += size) groups.push(cards.slice(i, i + size))
  return groups
}

/** Group cards in the same order used by the pile viewer. */
export function groupPileCards<T>(cards: T[], pile: PileKind, deckCount: number): T[][] {
  if (pile === 'deck') return chunkCards(cards)
  if (cards.length === 0) return []

  // The bottom discard cards complete the next five-card draw after recycling.
  const deckRemainder = deckCount % 5
  const lastGroupSize = Math.min(cards.length, 5 - deckRemainder)
  const splitAt = cards.length - lastGroupSize
  return [...chunkCards(cards.slice(0, splitAt)), cards.slice(splitAt)]
}

export function pileRowLabel(pile: PileKind, index: number, rowCount: number): string {
  return pile === 'deck' ? (index === 0 ? 'NEXT DRAW' : 'FUTURE DRAW')
    : (index === rowCount - 1 ? 'NEXT DRAW' : 'FUTURE DRAW')
}
