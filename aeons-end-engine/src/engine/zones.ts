import type { CardMechanic, GameState, PlayerState } from '../types'
import { getCard, MAGES } from '../data'
import { buildTrinketDeck } from '../data/wave9/special-decks/trinkets'

export function getPlayer(game: GameState, id: string): PlayerState {
  return game.players.find(player => player.id === id)!
}

/** Return the mechanics printed on supply piles chosen during game setup. */
export function getSupplyMechanics(game: GameState): CardMechanic[] {
  return [...new Set(game.supplyMechanics ?? game.market.piles.flatMap(pile =>
    [...(getCard(pile.cardId).mechanics ?? []), ...(getCard(pile.cardId).developCost === undefined ? [] : ['develop' as const])],
  ))]
}

/** Read setup-time Swap and Develop zone visibility, with defaults for older saves. */
export function getGameZoneVisibility(game: GameState): { swap: boolean; develop: boolean } {
  const swap = game.hasSwapZone ?? game.players.some(player => {
    const definition = MAGES[player.mageType]
    return definition?.hasSwapZone === true || (definition?.swapZone?.length ?? 0) > 0 || (player.swapZone?.length ?? 0) > 0
  })
  const develop = game.hasDevelopZone ?? (
    getSupplyMechanics(game).includes('develop') || game.players.some(player =>
      MAGES[player.mageType]?.hasDevelopZone === true || (player.developZone?.length ?? 0) > 0,
    ) || (game.developZone?.length ?? 0) > 0
  )
  return { swap, develop }
}

/** Return the public Develop cards, including data from a legacy save if present. */
export function getDevelopZoneCards(game: GameState): string[] {
  return game.developZone ?? game.players.flatMap(player => player.developZone ?? [])
}

export function ensureTrinketDeckState(game: GameState): { cards: string[]; revealed: boolean[] } {
  game.trinketDeck ??= buildTrinketDeck()
  const priorRevealState = game.trinketDeckRevealed ?? []
  if (priorRevealState.length !== game.trinketDeck.length) {
    game.trinketDeckRevealed = game.trinketDeck.map((_, index) => priorRevealState[index] === true)
  }
  return { cards: game.trinketDeck, revealed: game.trinketDeckRevealed! }
}

/** Return the shared Trinket deck in top-to-bottom order, migrating older saves if needed. */
export function getTrinketDeckCards(game: GameState): string[] {
  return ensureTrinketDeckState(game).cards
}

/** Whether one physical Trinket copy has previously been revealed. */
export function isTrinketDeckCardRevealed(game: GameState, index: number): boolean {
  return ensureTrinketDeckState(game).revealed[index] === true
}

export function ensureSharedDevelopZone(game: GameState): string[] {
  if (!game.developZone) game.developZone = game.players.flatMap(player => player.developZone ?? [])
  for (const player of game.players) delete player.developZone
  game.hasSwapZone ??= getGameZoneVisibility(game).swap
  game.hasDevelopZone ??= getGameZoneVisibility(game).develop
  return game.developZone
}
