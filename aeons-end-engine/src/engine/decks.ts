import type { DeckRecyclePolicy, PlayerState } from '../types'

export function shuffle<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j]!, a[i]!]
  }
  return a
}

export function drawFromDeck(deck: string[], discard: string[], count: number): {
  drawn: string[]; newDeck: string[]; newDiscard: string[]
} {
  const drawn: string[] = []
  let remainingDeck = [...deck]
  let remainingDiscard = [...discard]

  while (drawn.length < count) {
    if (remainingDeck.length === 0) {
      if (remainingDiscard.length === 0) break
      remainingDeck = cardsRecycledIntoDeck(remainingDiscard, 'reverse_discard')
      remainingDiscard = []
    }
    const card = remainingDeck.shift()
    if (card) drawn.push(card)
  }
  return { drawn, newDeck: remainingDeck, newDiscard: remainingDiscard }
}

/** Apply the deck's standard discard recycle order before cards are drawn or revealed. */
export function cardsRecycledIntoDeck<T>(discard: T[], policy: DeckRecyclePolicy): T[] {
  return policy === 'shuffle_discard' ? shuffle(discard) : [...discard].reverse()
}

/**
 * Ensure a reveal can show its full requested count. Any recycled discard cards
 * follow the cards already in the deck; the caller chooses that deck's rule.
 */
export function ensureDeckForReveal<T>(
  deck: T[],
  discard: T[],
  amount: number,
  policy: DeckRecyclePolicy,
  onRecycle?: () => void,
): boolean {
  if (amount <= deck.length || discard.length === 0) return false
  deck.push(...cardsRecycledIntoDeck(discard, policy))
  discard.splice(0, discard.length)
  onRecycle?.()
  return true
}

export function preparePlayerDeckForReveal(player: PlayerState, amount: number): void {
  ensureDeckForReveal(player.deck, player.discard, amount, 'reverse_discard')
}
