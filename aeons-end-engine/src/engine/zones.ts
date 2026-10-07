import type { CardMechanic, GameState, PlayerState } from '../types'
import { getCard, MAGES } from '../data'
import { buildTrinketDeck } from '../data/wave9/special-decks/trinkets'
import {
  createCardInstance, ensureCardInstanceZone, findCardInstanceId,
  isCardInstanceRevealed, markCardInstanceRevealed, insertCardInstanceAt,
  removeCardInstanceAt,
  resetCardInstancesAfterShuffle,
} from './card-instances'
import { shuffle } from './decks'
import type { CardInstanceRef } from './card-instances'

export function getPlayer(game: GameState, id: string): PlayerState {
  return game.players.find(player => player.id === id)!
}

/** Ensure stable identities for the physical copies currently in a Mage's deck. */
export function ensurePlayerDeckInstances(game: GameState, player: PlayerState): string[] {
  player.deckInstanceIds = ensureCardInstanceZone(
    game, player.deck, player.deckInstanceIds, player.deckInstanceIds === undefined,
  )
  return player.deckInstanceIds
}

/** A Mage deck card is face-up in its viewer only when its physical copy is known. */
export function isPlayerDeckCardRevealed(game: GameState, playerId: string, index: number): boolean {
  const player = game.players.find(candidate => candidate.id === playerId)
  if (!player || !player.deck[index]) return false
  const instanceIds = ensurePlayerDeckInstances(game, player)
  return isCardInstanceRevealed(game, instanceIds[index])
}

/** Recycle a player's discard if needed and mark the requested top cards seen. */
export function preparePlayerDeckForRevealWithInstances(
  game: GameState, player: PlayerState, amount: number,
): void {
  const instanceIds = ensurePlayerDeckInstances(game, player)
  if (amount > player.deck.length && player.discard.length > 0) {
    const recycled = [...player.discard].reverse()
    const recycledIds = ensureCardInstanceZone(game, recycled, undefined, true)
    player.deck.push(...recycled)
    instanceIds.push(...recycledIds)
    player.discard.splice(0, player.discard.length)
  }
  for (const instanceId of instanceIds.slice(0, Math.max(0, amount))) {
    markCardInstanceRevealed(game, instanceId)
  }
}

/** Remove the top physical card from a Mage deck while keeping its identity aligned. */
export function takePlayerDeckCard(game: GameState, player: PlayerState, reveal = true): string | undefined {
  return takePlayerDeckCardAt(game, player, 0, reveal)
}

/** Remove a physical card from any indexed position in a Mage deck. */
export function takePlayerDeckCardAt(
  game: GameState, player: PlayerState, index: number, reveal = true,
): string | undefined {
  const instanceIds = ensurePlayerDeckInstances(game, player)
  const removed = removeCardInstanceAt(game, player.deck, instanceIds, index)
  if (!removed) return undefined
  if (reveal) markCardInstanceRevealed(game, removed.instanceId)
  return removed.cardId
}

/** Remove indexed copies while retaining their physical identities for reordering. */
export function takePlayerDeckInstancesAt(
  game: GameState, player: PlayerState, indexes: number[], reveal = true,
): CardInstanceRef[] {
  const instanceIds = ensurePlayerDeckInstances(game, player)
  const removed: CardInstanceRef[] = []
  for (const index of [...indexes].sort((a, b) => b - a)) {
    const card = removeCardInstanceAt(game, player.deck, instanceIds, index)
    if (!card) continue
    if (reveal) markCardInstanceRevealed(game, card.instanceId)
    removed.unshift(card)
  }
  return removed
}

/** Put already identified cards at the top of a Mage deck in a chosen order. */
export function putPlayerDeckInstancesOnTop(
  game: GameState, player: PlayerState, cards: CardInstanceRef[],
): void {
  const instanceIds = ensurePlayerDeckInstances(game, player)
  player.deck.unshift(...cards.map(card => card.cardId))
  instanceIds.unshift(...cards.map(card => card.instanceId))
}

/** Put a known card on top/bottom of a Mage deck and track the new physical copy. */
export function putPlayerCardInDeck(
  game: GameState, player: PlayerState, cardId: string, position: 'top' | 'bottom' = 'top',
): void {
  const instanceIds = ensurePlayerDeckInstances(game, player)
  const instance = createCardInstance(game, cardId, true)
  const index = position === 'top' ? 0 : player.deck.length
  player.deck.splice(index, 0, cardId)
  instanceIds.splice(index, 0, instance.instanceId)
}

/**
 * Shuffle a Mage's discard pile into their deck. Every copy in the resulting
 * deck loses its known position, including cards that were already in deck.
 */
export function shufflePlayerDiscardIntoDeck(game: GameState, player: PlayerState): void {
  const deckIds = ensurePlayerDeckInstances(game, player)
  const discardInstances = player.discard.map(cardId => createCardInstance(game, cardId, true))
  const cards = [
    ...player.deck.map((cardId, index) => ({ cardId, instanceId: deckIds[index]! })),
    ...player.discard.map((cardId, index) => ({ cardId, instanceId: discardInstances[index]!.instanceId })),
  ]
  const shuffled = shuffle(cards)
  player.deck.splice(0, player.deck.length, ...shuffled.map(card => card.cardId))
  player.deckInstanceIds = shuffled.map(card => card.instanceId)
  player.discard.splice(0, player.discard.length)
  resetCardInstancesAfterShuffle(game, player.deckInstanceIds)
}

/** Shuffle a Mage's hand into their deck and forget every resulting position. */
export function shufflePlayerHandIntoDeck(game: GameState, player: PlayerState): void {
  const deckIds = ensurePlayerDeckInstances(game, player)
  const handInstances = player.hand.map(cardId => createCardInstance(game, cardId, true))
  const cards = [
    ...player.deck.map((cardId, index) => ({ cardId, instanceId: deckIds[index]! })),
    ...player.hand.map((cardId, index) => ({ cardId, instanceId: handInstances[index]!.instanceId })),
  ]
  const shuffled = shuffle(cards)
  player.deck.splice(0, player.deck.length, ...shuffled.map(card => card.cardId))
  player.deckInstanceIds = shuffled.map(card => card.instanceId)
  player.hand.splice(0, player.hand.length)
  player.handPreppedSpellInstanceIds = []
  resetCardInstancesAfterShuffle(game, player.deckInstanceIds)
}

/** Draw cards while preserving unknown deck positions and known recycled discards. */
export function drawPlayerDeckCards(game: GameState, player: PlayerState, count: number): string[] {
  const drawn: string[] = []
  let deckIds = ensurePlayerDeckInstances(game, player)
  while (drawn.length < Math.max(0, count)) {
    if (player.deck.length === 0) {
      if (player.discard.length === 0) break
      const recycled = [...player.discard].reverse()
      const recycledIds = ensureCardInstanceZone(game, recycled, undefined, true)
      player.deck.push(...recycled)
      deckIds.push(...recycledIds)
      player.discard.splice(0, player.discard.length)
    }
    const card = takePlayerDeckCard(game, player, true)
    if (!card) break
    drawn.push(card)
    deckIds = player.deckInstanceIds!
  }
  return drawn
}

/** Return the mechanics printed on supply piles chosen during game setup. */
export function getSupplyMechanics(game: GameState): CardMechanic[] {
  return [...new Set(game.supplyMechanics ?? game.market.piles.flatMap(pile =>
    [...(getCard(pile.cardId).mechanics ?? []), ...(getCard(pile.cardId).developCost === undefined ? [] : ['develop' as const])],
  ))]
}

/** Read setup-time Swap and Develop zone visibility, with defaults for older saves. */
export function getGameZoneVisibility(game: GameState): { swap: boolean; develop: boolean } {
  const supplyMechanics = getSupplyMechanics(game)
  const swap = game.hasSwapZone === true || supplyMechanics.includes('swap') || game.players.some(player => {
    const definition = MAGES[player.mageType]
    return definition?.hasSwapZone === true || (definition?.swapZone?.length ?? 0) > 0 || (player.swapZone?.length ?? 0) > 0
  })
  const develop = game.hasDevelopZone === true || supplyMechanics.includes('develop') || (
    game.players.some(player =>
      MAGES[player.mageType]?.hasDevelopZone === true || (player.developZone?.length ?? 0) > 0,
    ) || (game.developZone?.length ?? 0) > 0
  )
  return { swap, develop }
}

/** Return the public Develop cards, including data from a legacy save if present. */
export function getDevelopZoneCards(game: GameState): string[] {
  return game.developZone ?? game.players.flatMap(player => player.developZone ?? [])
}

export function ensureTrinketDeckState(game: GameState): { cards: string[]; revealed: boolean[]; instanceIds: string[] } {
  game.trinketDeck ??= buildTrinketDeck()
  const priorRevealState = game.trinketDeckRevealed ?? []
  game.trinketDeckInstanceIds = ensureCardInstanceZone(
    game, game.trinketDeck, game.trinketDeckInstanceIds,
  )
  for (let index = 0; index < game.trinketDeck.length; index++) {
    if (priorRevealState[index]) markCardInstanceRevealed(game, game.trinketDeckInstanceIds[index]!)
  }
  const revealed = game.trinketDeckInstanceIds.map(instanceId =>
    isCardInstanceRevealed(game, instanceId),
  )
  let syncedRevealed = game.trinketDeckRevealed
  if (!syncedRevealed || !sameBooleanValues(priorRevealState, revealed)) {
    game.trinketDeckRevealed = revealed
    syncedRevealed = revealed
  }
  return { cards: game.trinketDeck, revealed: syncedRevealed, instanceIds: game.trinketDeckInstanceIds }
}

/** Return the shared Trinket deck in top-to-bottom order, migrating older saves if needed. */
export function getTrinketDeckCards(game: GameState): string[] {
  return ensureTrinketDeckState(game).cards
}

/** Whether one physical Trinket copy has previously been revealed. */
export function isTrinketDeckCardRevealed(game: GameState, index: number): boolean {
  const { instanceIds } = ensureTrinketDeckState(game)
  return isCardInstanceRevealed(game, instanceIds[index])
}

/** Keep Crooked Mask's public-card memory aligned with physical deck copies. */
export function ensureCorruptionDeckState(game: GameState): { cards: string[]; revealed: boolean[]; instanceIds: string[] } {
  const nemesis = game.nemesis
  nemesis.corruptionDeck ??= []
  const priorRevealState = nemesis.corruptionDeckRevealed ?? []
  nemesis.corruptionDeckInstanceIds = ensureCardInstanceZone(
    game, nemesis.corruptionDeck, nemesis.corruptionDeckInstanceIds,
  )
  for (let index = 0; index < nemesis.corruptionDeck.length; index++) {
    if (priorRevealState[index]) markCardInstanceRevealed(game, nemesis.corruptionDeckInstanceIds[index]!)
  }
  const revealed = nemesis.corruptionDeckInstanceIds.map(instanceId =>
    isCardInstanceRevealed(game, instanceId),
  )
  let syncedRevealed = nemesis.corruptionDeckRevealed
  if (!syncedRevealed || !sameBooleanValues(priorRevealState, revealed)) {
    nemesis.corruptionDeckRevealed = revealed
    syncedRevealed = revealed
  }
  return {
    cards: nemesis.corruptionDeck,
    revealed: syncedRevealed,
    instanceIds: nemesis.corruptionDeckInstanceIds,
  }
}

/** Draw the top Corruption while removing its deck-only reveal memory. */
export function takeCorruptionFromDeck(game: GameState): string | undefined {
  const { cards, revealed, instanceIds } = ensureCorruptionDeckState(game)
  revealed.shift()
  instanceIds.shift()
  return cards.shift()
}

/** Return a known Corruption to the public bottom of Crooked Mask's deck. */
export function returnCorruptionToBottom(game: GameState, cardId: string, instanceId?: string): void {
  const { cards, revealed, instanceIds } = ensureCorruptionDeckState(game)
  const physicalId = instanceId ?? findCardInstanceId(game, cardId)
    ?? createCardInstance(game, cardId).instanceId
  cards.push(cardId)
  instanceIds.push(physicalId)
  markCardInstanceRevealed(game, physicalId)
  revealed.push(true)
}

export function isCorruptionDeckCardRevealed(game: GameState, index: number): boolean {
  const { instanceIds } = ensureCorruptionDeckState(game)
  return isCardInstanceRevealed(game, instanceIds[index])
}

export function isNemesisDeckCardRevealed(game: GameState, index: number): boolean {
  const deck = game.nemesis.deck
  game.nemesis.deckInstanceIds = ensureCardInstanceZone(game, deck, game.nemesis.deckInstanceIds)
  return isCardInstanceRevealed(game, game.nemesis.deckInstanceIds[index])
}

/** Shared face-visibility rule for Mage-specific decks with remembered cards. */
export function isSpecificDeckCardRevealed(game: GameState, playerId: string, index: number): boolean {
  const player = game.players.find(candidate => candidate.id === playerId)
  if (!player) return false
  const cards = player.specificDeck ?? []
  const hadInstanceMemory = (player.specificDeckInstanceIds?.length ?? 0) === cards.length &&
    player.specificDeckInstanceIds!.every(instanceId => game.cardInstanceStates?.[instanceId] !== undefined)
  player.specificDeckInstanceIds = ensureCardInstanceZone(game, cards, player.specificDeckInstanceIds)
  if (!hadInstanceMemory && player.knownSpecificDeckCards?.length) {
    // Old saves recorded only printed IDs. Migrate only an unambiguous single
    // copy; if duplicate copies are present, their exact reveal history was
    // not saved, so keep them face-down rather than reveal every matching copy.
    for (const cardId of player.knownSpecificDeckCards) {
      const matchingIndexes = cards.flatMap((candidate, cardIndex) => candidate === cardId ? [cardIndex] : [])
      if (matchingIndexes.length === 1) {
        const instanceId = player.specificDeckInstanceIds[matchingIndexes[0]!]
        if (instanceId) markCardInstanceRevealed(game, instanceId)
      }
    }
    player.knownSpecificDeckCards = []
  }
  const cardId = cards[index]
  if (!cardId) return false
  const display = MAGES[player.mageType]?.specificDeckDisplay
  const instanceId = player.specificDeckInstanceIds[index]!
  if (display === 'face_up' || (display === 'top_revealed' && index === 0)) {
    markCardInstanceRevealed(game, instanceId)
    return true
  }
  return isCardInstanceRevealed(game, instanceId)
}

export function rememberOwnedTrinketInstance(player: PlayerState, instanceId: string): void {
  player.trinketInstanceIds ??= []
  if (!player.trinketInstanceIds.includes(instanceId)) player.trinketInstanceIds.push(instanceId)
}

export function takeOwnedTrinketInstance(game: GameState, player: PlayerState, cardId: string): string | undefined {
  const index = (player.trinketInstanceIds ?? []).findIndex(instanceId =>
    game.cardInstanceStates?.[instanceId]?.cardId === cardId,
  )
  if (index < 0) return undefined
  return player.trinketInstanceIds!.splice(index, 1)[0]
}

/** Return a publicly seen Nemesis discard card to the top of its deck. */
export function returnNemesisDiscardCardToDeck(game: GameState, discardIndex: number): string | undefined {
  const removed = removeCardInstanceAt(
    game, game.nemesis.discard, game.nemesis.discardInstanceIds ??= [], discardIndex,
  )
  if (!removed) return undefined
  game.nemesis.deckInstanceIds = ensureCardInstanceZone(game, game.nemesis.deck, game.nemesis.deckInstanceIds)
  insertCardInstanceAt(game, game.nemesis.deck, game.nemesis.deckInstanceIds, removed, 0, true)
  return removed.cardId
}

export function ensureSharedDevelopZone(game: GameState): string[] {
  if (!game.developZone) game.developZone = game.players.flatMap(player => player.developZone ?? [])
  for (const player of game.players) delete player.developZone
  game.hasSwapZone ??= getGameZoneVisibility(game).swap
  game.hasDevelopZone ??= getGameZoneVisibility(game).develop
  return game.developZone
}

function sameBooleanValues(left: boolean[], right: boolean[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index])
}
