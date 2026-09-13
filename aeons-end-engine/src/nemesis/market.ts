import { getCard } from '../data'
import type { GameState, MarketPileChoice } from '../types'

/** Describe every market supply pile, optionally restricted to one card type. */
export function marketPileChoices(
  game: GameState,
  cardType?: 'gem' | 'relic' | 'spell',
): MarketPileChoice[] {
  return game.market.piles.flatMap((pile, pileIndex) => {
    const card = getCard(pile.cardId)
    if (cardType && card.type !== cardType) return []
    return [{ pileIndex, cardId: pile.cardId, cardName: card.name, remaining: pile.remaining }]
  })
}

/** Return the non-empty piles tied for the lowest card cost. */
export function leastExpensiveMarketPiles(
  game: GameState,
  cardType?: 'gem' | 'relic' | 'spell',
): MarketPileChoice[] {
  const candidates = marketPileChoices(game, cardType).filter(candidate => candidate.remaining > 0)
  if (candidates.length === 0) return []
  const lowestCost = Math.min(...candidates.map(candidate => getCard(candidate.cardId).cost))
  return candidates.filter(candidate => getCard(candidate.cardId).cost === lowestCost)
}
