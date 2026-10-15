import type {
  CardChoice, CardMoveAuditIssue, CardMoveEvent, CardMoveReason, CardMoveZone, CardMoveZoneAddress,
  GameState, PlayerState,
} from '../types'
import { getCard } from '../data'
import {
  createCardInstance, ensureCardInstanceZone, insertCardInstanceAt,
  isCardInstanceRevealed, markCardInstanceHidden, removeCardInstanceAt,
} from './card-instances'
import type { CardInstanceRef } from './card-instances'

export interface CardInstanceZone {
  zoneId: string
  zone: CardMoveZone
  ownerId: string | null
  cards: string[]
  instanceIds: string[]
  defaultRevealed?: boolean
  onRemove?: (index: number) => void
  onInsert?: (index: number, card: CardInstanceRef) => void
}

export interface CardInstanceLocation extends CardMoveZoneAddress {}

export interface CardMoveOptions {
  handPreppedSpellInstanceId?: string | null
  reveal?: boolean
  /** Override inherited reveal memory when a rule puts a card face-down. */
  hide?: boolean
}

export interface CardMoveTransactionResult<T> {
  value: T
  transactionId: string
  events: CardMoveEvent[]
  auditIssues: CardMoveAuditIssue[]
}

interface TransactionCollector {
  transactionId: string
  events: CardMoveEvent[]
  sequence: number
  defaultReason: CardMoveReason
  initialLocations: Map<string, { cardId: string; location: CardInstanceLocation }>
}

export interface CardMoveTransactionHandle {
  game: GameState
  collector: TransactionCollector
  start: number
  ownsCollector: boolean
}

const activeTransactions = new WeakMap<GameState, TransactionCollector>()
let nextTransactionNumber = 0

type CardMoveEventPayload = CardMoveEvent extends infer Event
  ? Event extends CardMoveEvent
    ? Omit<Event, 'transactionId' | 'eventId' | 'sequence' | 'reason'>
    : never
  : never

function nextTransactionId(): string {
  nextTransactionNumber += 1
  return `card-motion-transaction:${nextTransactionNumber}`
}

function address(zone: CardInstanceZone, index: number): CardMoveZoneAddress {
  return { zoneId: zone.zoneId, zone: zone.zone, ownerId: zone.ownerId, index }
}

function registerEvent(
  game: GameState,
  event: CardMoveEventPayload,
  reason?: CardMoveReason,
): CardMoveEvent | undefined {
  const collector = activeTransactions.get(game)
  if (!collector) return undefined
  collector.sequence += 1
  const sequence = collector.sequence
  const base = {
    transactionId: collector.transactionId,
    eventId: `${collector.transactionId}:event:${sequence}`,
    sequence,
    reason: reason ?? collector.defaultReason,
  }
  const recorded = { ...base, ...event } as CardMoveEvent
  collector.events.push(recorded)
  return recorded
}

function ensurePlayerZone(
  game: GameState,
  player: PlayerState,
  zone: Exclude<CardMoveZone,
    | 'develop' | 'nemesis_deck' | 'nemesis_discard' | 'nemesis_play_area' | 'nemesis_set_aside'
    | 'nemesis_card_stack' | 'corruption_deck' | 'strike_deck' | 'strike_discard'
    | 'trinket_deck' | 'supply' | 'breach' | 'temporary'>,
): CardInstanceZone {
  let cards: string[]
  let ids: string[] | undefined
  switch (zone) {
    case 'deck': cards = player.deck; ids = player.deckInstanceIds; break
    case 'hand': cards = player.hand; ids = player.handInstanceIds; break
    case 'discard': cards = player.discard; ids = player.discardInstanceIds; break
    case 'played_this_turn': cards = player.playedThisTurn; ids = player.playedThisTurnInstanceIds; break
    case 'swap_zone': cards = player.swapZone ??= []; ids = player.swapZoneInstanceIds; break
    case 'specific_deck': cards = player.specificDeck ??= []; ids = player.specificDeckInstanceIds; break
    case 'player_cards_in_play': cards = player.playerCardsInPlay ??= []; ids = player.playerCardsInPlayInstanceIds; break
    case 'destroyed': cards = player.destroyedCards; ids = player.destroyedCardInstanceIds; break
    default: throw new Error(`Unsupported player card zone: ${zone satisfies never}`)
  }
  const defaultRevealed = zone !== 'deck' && zone !== 'specific_deck'
  ids = seedLegacyOwnedTrinketIds(game, player, zone, cards, ids)
  const ensured = ensureCardInstanceZone(game, cards, ids, defaultRevealed)
  switch (zone) {
    case 'deck': player.deckInstanceIds = ensured; break
    case 'hand': player.handInstanceIds = ensured; break
    case 'discard': player.discardInstanceIds = ensured; break
    case 'played_this_turn': player.playedThisTurnInstanceIds = ensured; break
    case 'swap_zone': player.swapZoneInstanceIds = ensured; break
    case 'specific_deck': player.specificDeckInstanceIds = ensured; break
    case 'player_cards_in_play': player.playerCardsInPlayInstanceIds = ensured; break
    case 'destroyed': player.destroyedCardInstanceIds = ensured; break
  }
  return {
    zoneId: `player:${player.id}:${zone}`,
    zone,
    ownerId: player.id,
    cards,
    instanceIds: ensured,
    defaultRevealed,
    ...(zone === 'player_cards_in_play' ? {
      onRemove: (index: number) => {
        player.playerCardSupplyTargets?.splice(index, 1)
        player.playerCardPowerTokens?.splice(index, 1)
      },
      onInsert: (index: number) => {
        player.playerCardSupplyTargets ??= []
        player.playerCardPowerTokens ??= []
        player.playerCardSupplyTargets.splice(index, 0, null)
        player.playerCardPowerTokens.splice(index, 0, 0)
      },
    } : {}),
  }
}

function seedLegacyOwnedTrinketIds(
  game: GameState,
  player: PlayerState,
  zone: string,
  cards: string[],
  instanceIds: string[] | undefined,
): string[] | undefined {
  if (!player.trinketInstanceIds?.length) return instanceIds
  const zoneIds: Record<string, string[] | undefined> = {
    deck: player.deckInstanceIds,
    hand: player.handInstanceIds,
    discard: player.discardInstanceIds,
    played_this_turn: player.playedThisTurnInstanceIds,
    swap_zone: player.swapZoneInstanceIds,
    specific_deck: player.specificDeckInstanceIds,
    player_cards_in_play: player.playerCardsInPlayInstanceIds,
    destroyed: player.destroyedCardInstanceIds,
  }
  const occupied = new Set(Object.entries(zoneIds)
    .filter(([otherZone]) => otherZone !== zone)
    .flatMap(([, ids]) => ids ?? []))
  for (const breach of player.breaches) {
    for (const instanceId of breach.preppedSpellInstanceIds ?? []) occupied.add(instanceId)
    if (breach.attachedRelic?.instanceId) occupied.add(breach.attachedRelic.instanceId)
  }
  const seeded = cards.map((cardId, index) => {
    const existing = instanceIds?.[index]
    if (existing && game.cardInstanceStates?.[existing]?.cardId === cardId) {
      occupied.add(existing)
      return existing
    }
    const owned = player.trinketInstanceIds!.find(instanceId =>
      !occupied.has(instanceId) && game.cardInstanceStates?.[instanceId]?.cardId === cardId,
    )
    if (owned) {
      occupied.add(owned)
      return owned
    }
    return createCardInstance(game, cardId, zone !== 'deck' && zone !== 'specific_deck').instanceId
  })
  // Zone getters are also used by Vue computed values. Keep the existing
  // reactive ID array when migration did not change any identities.
  if (instanceIds && instanceIds.length === seeded.length
    && instanceIds.every((instanceId, index) => instanceId === seeded[index])) {
    return instanceIds
  }
  return seeded
}

export function getPlayerCardInstanceZone(
  game: GameState,
  playerId: string,
  zone: 'deck' | 'hand' | 'discard' | 'played_this_turn' | 'swap_zone' | 'specific_deck' | 'player_cards_in_play' | 'destroyed',
): CardInstanceZone {
  const player = game.players.find(candidate => candidate.id === playerId)
  if (!player) throw new Error(`Unknown player for card zone: ${playerId}`)
  return ensurePlayerZone(game, player, zone)
}

export function getBreachCardInstanceZone(
  game: GameState,
  playerId: string,
  breachIndex: number,
): CardInstanceZone {
  const player = game.players.find(candidate => candidate.id === playerId)
  const breach = player?.breaches.find(candidate => candidate.index === breachIndex)
  if (!player || !breach) throw new Error(`Unknown Breach card zone: ${playerId}:${breachIndex}`)
  const ids = breach.preppedSpellInstanceIds ??= []
  for (let index = 0; index < breach.prepSpells.length; index += 1) {
    const existingId = ids[index]
    const instance = createCardInstance(game, breach.prepSpells[index]!, true, existingId)
    ids[index] = instance.instanceId
  }
  if (ids.length > breach.prepSpells.length) ids.splice(breach.prepSpells.length)
  return {
    zoneId: `player:${player.id}:breach:${breach.index}`,
    zone: 'breach',
    ownerId: player.id,
    cards: breach.prepSpells,
    instanceIds: ids,
    defaultRevealed: true,
    onRemove: (index: number) => {
      breach.preppedThisTurn?.splice(index, 1)
      breach.preppedSpellFaceDown?.splice(index, 1)
    },
  }
}

export function getBreachAttachedRelicZone(
  game: GameState,
  playerId: string,
  breachIndex: number,
): CardInstanceZone | undefined {
  const player = game.players.find(candidate => candidate.id === playerId)
  const breach = player?.breaches.find(candidate => candidate.index === breachIndex)
  if (!player || !breach) return undefined
  if (breach.attachedRelic) {
    const relic = breach.attachedRelic
    const instance = createCardInstance(game, relic.cardId, true, relic.instanceId)
    relic.instanceId = instance.instanceId
    return {
      zoneId: `player:${player.id}:breach:${breach.index}:attached`,
      zone: 'breach', ownerId: relic.ownerId,
      cards: [relic.cardId], instanceIds: [instance.instanceId], defaultRevealed: true,
      onRemove: () => { breach.attachedRelic = undefined },
    }
  }
  const cards: string[] = []
  const instanceIds: string[] = []
  return {
    zoneId: `player:${player.id}:breach:${breach.index}:attached`,
    zone: 'breach', ownerId: player.id,
    cards, instanceIds, defaultRevealed: true,
    onInsert: (_index, card) => {
      breach.attachedRelic = { cardId: card.cardId, ownerId: player.id, instanceId: card.instanceId }
    },
  }
}

export function getSharedDevelopCardInstanceZone(game: GameState): CardInstanceZone {
  game.developZone ??= game.players.flatMap(player => player.developZone ?? [])
  game.developZoneInstanceIds = ensureCardInstanceZone(
    game, game.developZone, game.developZoneInstanceIds, true,
  )
  return {
    zoneId: 'shared:develop', zone: 'develop', ownerId: null,
    cards: game.developZone, instanceIds: game.developZoneInstanceIds, defaultRevealed: true,
  }
}

export function getNemesisCardInstanceZone(
  game: GameState,
  zone: 'nemesis_deck' | 'nemesis_discard' | 'corruption_deck' | 'strike_deck' | 'strike_discard' | 'trinket_deck',
): CardInstanceZone {
  let cards: string[]
  let ids: string[] | undefined
  switch (zone) {
    case 'nemesis_deck': cards = game.nemesis.deck; ids = game.nemesis.deckInstanceIds; break
    case 'nemesis_discard': cards = game.nemesis.discard; ids = game.nemesis.discardInstanceIds; break
    case 'corruption_deck': cards = game.nemesis.corruptionDeck ??= []; ids = game.nemesis.corruptionDeckInstanceIds; break
    case 'strike_deck': cards = game.nemesis.strikeDeck; ids = game.nemesis.strikeDeckInstanceIds; break
    case 'strike_discard': cards = game.nemesis.strikeDiscard; ids = game.nemesis.strikeDiscardInstanceIds; break
    case 'trinket_deck': cards = game.trinketDeck ??= []; ids = game.trinketDeckInstanceIds; break
    default: throw new Error(`Unsupported Nemesis card zone: ${zone satisfies never}`)
  }
  const defaultRevealed = zone === 'nemesis_discard' || zone === 'strike_discard'
  const ensured = ensureCardInstanceZone(game, cards, ids, defaultRevealed)
  switch (zone) {
    case 'nemesis_deck': game.nemesis.deckInstanceIds = ensured; break
    case 'nemesis_discard': game.nemesis.discardInstanceIds = ensured; break
    case 'corruption_deck': game.nemesis.corruptionDeckInstanceIds = ensured; break
    case 'strike_deck': game.nemesis.strikeDeckInstanceIds = ensured; break
    case 'strike_discard': game.nemesis.strikeDiscardInstanceIds = ensured; break
    case 'trinket_deck': game.trinketDeckInstanceIds = ensured; break
  }
  return {
    zoneId: `nemesis:${zone}`, zone, ownerId: 'nemesis', cards, instanceIds: ensured, defaultRevealed,
  }
}

/** Card instances stored beneath one Nemesis Minion remain independently tracked. */
export function getNemesisCardStackZone(game: GameState, minion: import('../types').NemesisCardInPlay): CardInstanceZone {
  minion.underCards ??= []
  minion.underCardInstanceIds = ensureCardInstanceZone(
    game, minion.underCards, minion.underCardInstanceIds, true,
  )
  return {
    zoneId: `nemesis:minion:${minion.placedAt}:under`,
    zone: 'nemesis_card_stack',
    ownerId: 'nemesis',
    cards: minion.underCards,
    instanceIds: minion.underCardInstanceIds,
    defaultRevealed: true,
  }
}

export function moveCardBetweenZones(
  game: GameState,
  source: CardInstanceZone,
  sourceIndex: number,
  destination: CardInstanceZone,
  destinationIndex: number,
  reason: CardMoveReason,
  options: CardMoveOptions = {},
): CardInstanceRef | undefined {
  const sourcePlayer = source.zone === 'hand'
    ? game.players.find(player => player.id === source.ownerId)
    : undefined
  const destinationPlayer = destination.zone === 'hand'
    ? game.players.find(player => player.id === destination.ownerId)
    : undefined
  if (sourcePlayer) ensureHandPreppedSpellIds(sourcePlayer)
  if (destinationPlayer) ensureHandPreppedSpellIds(destinationPlayer)
  const removed = removeCardInstanceAt(game, source.cards, source.instanceIds, sourceIndex)
  if (!removed) return undefined
  source.onRemove?.(sourceIndex)
  if (sourcePlayer) sourcePlayer.handPreppedSpellInstanceIds!.splice(sourceIndex, 1)
  const safeDestinationIndex = Math.max(0, Math.min(destinationIndex, destination.cards.length))
  insertCardInstanceAt(
    game, destination.cards, destination.instanceIds, removed, safeDestinationIndex,
    destination.defaultRevealed === true || options.reveal === true,
  )
  if (options.hide) markCardInstanceHidden(game, removed.instanceId)
  destination.onInsert?.(safeDestinationIndex, removed)
  if (destinationPlayer) {
    destinationPlayer.handPreppedSpellInstanceIds!.splice(
      safeDestinationIndex, 0, options.handPreppedSpellInstanceId ?? null,
    )
  }
  syncLegacyRevealState(game, source, destination)
  const base = {
    instanceId: removed.instanceId,
    cardId: removed.cardId,
    reason,
  }
  const transactionId = activeTransactions.get(game)?.transactionId
  if (transactionId) {
    if (source.zoneId === destination.zoneId) {
      registerEvent(game, {
        kind: 'reorder', instanceId: base.instanceId, cardId: base.cardId,
        zone: address(destination, safeDestinationIndex),
        fromIndex: sourceIndex, toIndex: safeDestinationIndex,
      }, reason)
    } else {
      recordCardMove(game, base.instanceId, base.cardId,
        address(source, sourceIndex), address(destination, safeDestinationIndex), reason)
    }
    void transactionId
  }
  return { ...removed, revealed: isCardInstanceRevealed(game, removed.instanceId) }
}

function ensureHandPreppedSpellIds(player: PlayerState): void {
  player.handPreppedSpellInstanceIds ??= player.hand.map(() => null)
  while (player.handPreppedSpellInstanceIds.length < player.hand.length) {
    player.handPreppedSpellInstanceIds.push(null)
  }
  if (player.handPreppedSpellInstanceIds.length > player.hand.length) {
    player.handPreppedSpellInstanceIds.splice(player.hand.length)
  }
}

export function destroyCardFromZone(
  game: GameState,
  source: CardInstanceZone,
  index: number,
  reason: CardMoveReason = 'destroy',
  applyReplacement = true,
): string | undefined {
  const cardId = source.cards[index]
  const instanceId = source.instanceIds[index]
  if (!cardId || !instanceId) return undefined
  const card = getCard(cardId)
  if (applyReplacement && card.returnToSwapZoneOnDestroy && source.ownerId) {
    const player = game.players.find(candidate => candidate.id === source.ownerId)
    if (player) {
      const swap = getPlayerCardInstanceZone(game, player.id, 'swap_zone')
      return moveCardBetweenZones(game, source, index, swap, swap.cards.length, 'return')?.cardId
    }
  }
  if (applyReplacement && card.type === 'corruption' && game.nemesis.type === 'crooked_mask' && source.ownerId) {
    const player = game.players.find(candidate => candidate.id === source.ownerId)
    if (player) {
      const corruption = getNemesisCardInstanceZone(game, 'corruption_deck')
      return moveCardBetweenZones(game, source, index, corruption, corruption.cards.length, 'return')?.cardId
    }
  }
  source.cards.splice(index, 1)
  source.instanceIds.splice(index, 1)
  source.onRemove?.(index)
  if (source.ownerId) {
    const player = game.players.find(candidate => candidate.id === source.ownerId)
    if (player) {
      player.destroyedCards.push(cardId)
      player.destroyedCardInstanceIds ??= []
      player.destroyedCardInstanceIds.push(instanceId)
    }
  }
  recordCardDestruction(game, instanceId, cardId, address(source, index), reason)
  syncLegacyRevealState(game, source)
  return cardId
}

export function createCardInZone(
  game: GameState,
  destination: CardInstanceZone,
  cardId: string,
  destinationIndex: number,
  reason: CardMoveReason,
  revealed = destination.defaultRevealed ?? false,
  source?: CardMoveZoneAddress,
): CardInstanceRef {
  const instance = createCardInstance(game, cardId, revealed)
  const safeIndex = Math.max(0, Math.min(destinationIndex, destination.cards.length))
  destination.cards.splice(safeIndex, 0, cardId)
  destination.instanceIds.splice(safeIndex, 0, instance.instanceId)
  destination.onInsert?.(safeIndex, instance)
  recordCardCreation(game, instance.instanceId, cardId, address(destination, safeIndex), reason, source)
  syncLegacyRevealState(game, destination)
  return instance
}

export function placeTemporaryCardInZone(
  game: GameState,
  instanceId: string,
  cardId: string,
  source: CardMoveZoneAddress,
  destination: CardInstanceZone,
  destinationIndex: number,
  reason: CardMoveReason,
  revealed = true,
): void {
  const card = createCardInstance(game, cardId, revealed, instanceId)
  const safeIndex = Math.max(0, Math.min(destinationIndex, destination.cards.length))
  insertCardInstanceAt(game, destination.cards, destination.instanceIds, card, safeIndex, revealed)
  destination.onInsert?.(safeIndex, card)
  const target = address(destination, safeIndex)
  recordCardMove(game, instanceId, cardId, source, target, reason)
  syncLegacyRevealState(game, destination)
}

/** Remove a card from a real zone while an effect resolves it outside the board. */
export function moveCardToTemporary(
  game: GameState,
  source: CardInstanceZone,
  sourceIndex: number,
  destination: CardMoveZoneAddress,
  reason: CardMoveReason = 'temporary',
): CardInstanceRef | undefined {
  const sourcePlayer = source.zone === 'hand'
    ? game.players.find(player => player.id === source.ownerId)
    : undefined
  if (sourcePlayer) ensureHandPreppedSpellIds(sourcePlayer)
  const removed = removeCardInstanceAt(game, source.cards, source.instanceIds, sourceIndex)
  if (!removed) return undefined
  source.onRemove?.(sourceIndex)
  if (sourcePlayer) sourcePlayer.handPreppedSpellInstanceIds!.splice(sourceIndex, 1)
  recordCardTemporary(game, removed.instanceId, removed.cardId,
    address(source, sourceIndex), destination, reason)
  syncLegacyRevealState(game, source)
  return removed
}

/** Draw into hand while keeping each physical copy's identity attached. */
export function drawPlayerCardsToHand(
  game: GameState,
  playerId: string,
  count: number,
): string[] {
  const player = game.players.find(candidate => candidate.id === playerId)
  if (!player) throw new Error(`Unknown player for draw: ${playerId}`)
  const drawn: string[] = []
  while (drawn.length < Math.max(0, count)) {
    let deck = getPlayerCardInstanceZone(game, playerId, 'deck')
    if (deck.cards.length === 0) {
      const discard = getPlayerCardInstanceZone(game, playerId, 'discard')
      if (discard.cards.length === 0) break
      // Discard top is index 0; recycle bottom-first to the deck bottom.
      for (let index = discard.cards.length - 1; index >= 0; index -= 1) {
        deck = getPlayerCardInstanceZone(game, playerId, 'deck')
        const moved = moveCardBetweenZones(game, discard, index, deck, deck.cards.length, 'draw')
        void moved
      }
    }
    deck = getPlayerCardInstanceZone(game, playerId, 'deck')
    const hand = getPlayerCardInstanceZone(game, playerId, 'hand')
    const moved = moveCardBetweenZones(game, deck, 0, hand, hand.cards.length, 'draw')
    if (!moved) break
    drawn.push(moved.cardId)
  }
  return drawn
}

export function moveSelectedPlayerCards(
  game: GameState,
  playerId: string,
  choices: CardChoice[],
  destinationZone: 'deck' | 'hand' | 'discard' | 'played_this_turn' | 'swap_zone' | 'specific_deck' | 'player_cards_in_play' | 'destroyed',
  reason: CardMoveReason,
  placement: 'top' | 'bottom' = 'top',
): CardInstanceRef[] {
  const selected = choices.flatMap(choice => {
    const source = getPlayerCardInstanceZone(game, playerId, choice.zone)
    if (source.cards[choice.index] !== choice.cardId) return []
    const instanceId = source.instanceIds[choice.index]
    return instanceId ? [{ choice, instanceId }] : []
  })
  const moved: CardInstanceRef[] = []
  for (const item of selected) {
    const source = getPlayerCardInstanceZone(game, playerId, item.choice.zone)
    const sourceIndex = source.instanceIds.indexOf(item.instanceId)
    if (sourceIndex < 0) continue
    const destination = getPlayerCardInstanceZone(game, playerId, destinationZone)
    const destinationIndex = placement === 'top' ? 0 : destination.cards.length
    const card = moveCardBetweenZones(
      game, source, sourceIndex, destination, destinationIndex, reason,
      destinationZone === 'hand' && source.zone === 'breach'
        ? { handPreppedSpellInstanceId: item.instanceId }
        : {},
    )
    if (card) moved.push(card)
  }
  return moved
}

export function destroySelectedPlayerCards(
  game: GameState,
  playerId: string,
  choices: CardChoice[],
): string[] {
  const selected = choices.flatMap(choice => {
    const source = getPlayerCardInstanceZone(game, playerId, choice.zone)
    if (source.cards[choice.index] !== choice.cardId) return []
    const instanceId = source.instanceIds[choice.index]
    return instanceId ? [{ choice, instanceId }] : []
  }).sort((left, right) => left.choice.zone.localeCompare(right.choice.zone) || right.choice.index - left.choice.index)
  const destroyed: string[] = []
  for (const item of selected) {
    const source = getPlayerCardInstanceZone(game, playerId, item.choice.zone)
    const index = source.instanceIds.indexOf(item.instanceId)
    if (index < 0) continue
    const cardId = destroyCardFromZone(game, source, index)
    if (cardId) destroyed.push(cardId)
  }
  return destroyed
}

export function recordCardCreation(
  game: GameState,
  instanceId: string,
  cardId: string,
  destination: CardMoveZoneAddress,
  reason: CardMoveReason,
  source?: CardMoveZoneAddress,
): void {
  registerEvent(game, {
    kind: 'create', instanceId, cardId, destination,
    ...(source ? { source } : {}),
  }, reason)
}

export function recordCardMove(
  game: GameState,
  instanceId: string,
  cardId: string,
  source: CardMoveZoneAddress,
  destination: CardMoveZoneAddress,
  reason: CardMoveReason,
): void {
  const collector = activeTransactions.get(game)
  const moveId = collector ? `${collector.transactionId}:move:${collector.sequence + 1}` : 'untracked-move'
  registerEvent(game, { kind: 'move', instanceId, cardId, source, destination, moveId }, reason)
}

export function recordCardTemporary(
  game: GameState,
  instanceId: string,
  cardId: string,
  source: CardMoveZoneAddress | undefined,
  destination: CardMoveZoneAddress,
  reason: CardMoveReason = 'temporary',
): void {
  registerEvent(game, { kind: 'temporary', instanceId, cardId, source, destination }, reason)
}

export function recordCardDestruction(
  game: GameState,
  instanceId: string,
  cardId: string,
  source: CardMoveZoneAddress,
  reason: CardMoveReason = 'destroy',
): void {
  registerEvent(game, { kind: 'destroy', instanceId, cardId, source }, reason)
}

export function recordCardReorder(
  game: GameState,
  instanceId: string,
  cardId: string,
  zone: CardMoveZoneAddress,
  fromIndex: number,
  toIndex: number,
  reason: CardMoveReason = 'reorder',
): void {
  registerEvent(game, { kind: 'reorder', instanceId, cardId, zone, fromIndex, toIndex }, reason)
}

export function recordCardShuffle(
  game: GameState,
  instanceId: string,
  cardId: string,
  zone: CardMoveZoneAddress,
  reason: CardMoveReason = 'shuffle',
): void {
  registerEvent(game, { kind: 'shuffle', instanceId, cardId, zone }, reason)
}

export function recordCardReveal(
  game: GameState,
  instanceId: string,
  cardId: string,
  zone: CardMoveZoneAddress,
): void {
  registerEvent(game, { kind: 'reveal', instanceId, cardId, zone }, 'reveal')
}

export function withCardMoveTransaction<T>(
  game: GameState,
  reason: CardMoveReason,
  action: () => T,
): CardMoveTransactionResult<T> {
  const handle = beginCardMoveTransaction(game, reason)
  let value!: T
  try {
    value = action()
  } catch (error) {
    finishCardMoveTransaction(handle)
    throw error
  }
  const transaction = finishCardMoveTransaction(handle)
  return {
    value,
    transactionId: transaction.transactionId,
    events: transaction.events,
    auditIssues: transaction.auditIssues,
  }
}

/** Start collecting movement facts across a caller-owned action boundary. */
export function beginCardMoveTransaction(
  game: GameState,
  reason: CardMoveReason,
): CardMoveTransactionHandle {
  const existing = activeTransactions.get(game)
  if (existing) {
    return { game, collector: existing, start: existing.events.length, ownsCollector: false }
  }
  const collector: TransactionCollector = {
    transactionId: nextTransactionId(), events: [], sequence: 0,
    defaultReason: reason, initialLocations: captureCardInstanceLocations(game),
  }
  activeTransactions.set(game, collector)
  return { game, collector, start: 0, ownsCollector: true }
}

/** Finish a caller-owned action boundary and return only its movement facts. */
export function finishCardMoveTransaction(
  handle: CardMoveTransactionHandle,
): Omit<CardMoveTransactionResult<void>, 'value'> {
  const { game, collector, start, ownsCollector } = handle
  const events = collector.events.slice(start)
  if (!ownsCollector) {
    return { transactionId: collector.transactionId, events, auditIssues: [] }
  }
  if (activeTransactions.get(game) === collector) activeTransactions.delete(game)
  const finalLocations = captureCardInstanceLocations(game)
  return {
    transactionId: collector.transactionId,
    events,
    auditIssues: auditCardMoveLocations(collector.initialLocations, finalLocations, collector.events),
  }
}

export function captureCardInstanceLocations(
  game: GameState,
): Map<string, { cardId: string; location: CardInstanceLocation }> {
  const locations = new Map<string, { cardId: string; location: CardInstanceLocation }>()
  const zones: CardInstanceZone[] = []
  for (const player of game.players) {
    zones.push(
      ensurePlayerZone(game, player, 'deck'), ensurePlayerZone(game, player, 'hand'),
      ensurePlayerZone(game, player, 'discard'), ensurePlayerZone(game, player, 'played_this_turn'),
      ensurePlayerZone(game, player, 'swap_zone'), ensurePlayerZone(game, player, 'specific_deck'),
      ensurePlayerZone(game, player, 'player_cards_in_play'), ensurePlayerZone(game, player, 'destroyed'),
    )
    for (const breach of player.breaches) {
      zones.push(getBreachCardInstanceZone(game, player.id, breach.index))
      const attached = getBreachAttachedRelicZone(game, player.id, breach.index)
      if (attached?.cards.length) zones.push(attached)
    }
  }
  zones.push(getSharedDevelopCardInstanceZone(game))
  for (const zone of ['nemesis_deck', 'nemesis_discard', 'corruption_deck', 'strike_deck', 'strike_discard', 'trinket_deck'] as const) {
    zones.push(getNemesisCardInstanceZone(game, zone))
  }
  for (const zone of zones) {
    zone.cards.forEach((cardId, index) => {
      const instanceId = zone.instanceIds[index]
      if (!instanceId) return
      locations.set(instanceId, { cardId, location: address(zone, index) })
    })
  }
  for (const [index, card] of game.nemesis.playArea.entries()) {
    const instanceId = card.instanceId ?? `${card.cardId}:${card.placedAt}`
    card.instanceId = instanceId
    createCardInstance(game, card.cardId, true, instanceId)
    locations.set(instanceId, {
      cardId: card.cardId,
      location: { zoneId: 'nemesis:play_area', zone: 'nemesis_play_area', ownerId: 'nemesis', index },
    })
    const stacked = getNemesisCardStackZone(game, card)
    stacked.cards.forEach((cardId, stackIndex) => {
      const stackInstanceId = stacked.instanceIds[stackIndex]
      if (!stackInstanceId) return
      locations.set(stackInstanceId, { cardId, location: address(stacked, stackIndex) })
    })
  }
  for (const [index, card] of (game.nemesis.setAsideCards ?? []).entries()) {
    const instanceId = card.instanceId ?? `${card.cardId}:${card.placedAt}`
    card.instanceId = instanceId
    createCardInstance(game, card.cardId, true, instanceId)
    locations.set(instanceId, {
      cardId: card.cardId,
      location: { zoneId: 'nemesis:set_aside', zone: 'nemesis_set_aside', ownerId: 'nemesis', index },
    })
  }
  const conjured = game.pendingEffect?.conjuredCard
  if (conjured) {
    const instanceId = conjured.instanceId ?? createCardInstance(game, conjured.cardId, true).instanceId
    conjured.instanceId = instanceId
    createCardInstance(game, conjured.cardId, true, instanceId)
    locations.set(instanceId, {
      cardId: conjured.cardId,
      location: {
        zoneId: `temporary:conjure:${conjured.playerId}`,
        zone: 'temporary', ownerId: conjured.playerId, index: 0,
      },
    })
  }
  const drawn = game.nemesisResolution?.drawnCardId && game.nemesisResolution.drawnCardInstanceId
    ? { cardId: game.nemesisResolution.drawnCardId, instanceId: game.nemesisResolution.drawnCardInstanceId }
    : undefined
  if (drawn && !locations.has(drawn.instanceId)) {
    createCardInstance(game, drawn.cardId, true, drawn.instanceId)
    locations.set(drawn.instanceId, {
      cardId: drawn.cardId,
      location: { zoneId: 'temporary:nemesis_draw', zone: 'temporary', ownerId: 'nemesis', index: 0 },
    })
  }
  const resolvingCorruption = game.pendingEffect?.resolvingCorruption
  if (resolvingCorruption && !locations.has(resolvingCorruption.instanceId)) {
    createCardInstance(game, resolvingCorruption.cardId, true, resolvingCorruption.instanceId)
    locations.set(resolvingCorruption.instanceId, {
      cardId: resolvingCorruption.cardId,
      location: {
        zoneId: `temporary:corruption:${resolvingCorruption.playerId}`,
        zone: 'temporary', ownerId: resolvingCorruption.playerId, index: 0,
      },
    })
  }
  const resolvingStrike = game.pendingEffect?.revealedStrikeCardInstanceId
    ? {
        cardId: game.pendingEffect.revealedStrikeCardId
          ?? game.cardInstanceStates?.[game.pendingEffect.revealedStrikeCardInstanceId]?.cardId,
        instanceId: game.pendingEffect.revealedStrikeCardInstanceId,
      }
    : undefined
  if (resolvingStrike?.cardId && !locations.has(resolvingStrike.instanceId)) {
    createCardInstance(game, resolvingStrike.cardId, true, resolvingStrike.instanceId)
    locations.set(resolvingStrike.instanceId, {
      cardId: resolvingStrike.cardId,
      location: { zoneId: 'temporary:strike_resolution', zone: 'temporary', ownerId: 'nemesis', index: 0 },
    })
  }
  const externalStrike = game.nemesis.resolvingStrikeCardId && game.nemesis.resolvingStrikeCardInstanceId
    ? { cardId: game.nemesis.resolvingStrikeCardId, instanceId: game.nemesis.resolvingStrikeCardInstanceId }
    : undefined
  if (externalStrike && !locations.has(externalStrike.instanceId)) {
    createCardInstance(game, externalStrike.cardId, true, externalStrike.instanceId)
    locations.set(externalStrike.instanceId, {
      cardId: externalStrike.cardId,
      location: { zoneId: 'temporary:strike_resolution', zone: 'temporary', ownerId: 'nemesis', index: 0 },
    })
  }
  return locations
}

export function auditCardMoveLocations(
  before: Map<string, { cardId: string; location: CardInstanceLocation }>,
  after: Map<string, { cardId: string; location: CardInstanceLocation }>,
  events: CardMoveEvent[],
): CardMoveAuditIssue[] {
  const issues: CardMoveAuditIssue[] = []
  for (const instanceId of new Set([...before.keys(), ...after.keys()])) {
    const old = before.get(instanceId)
    const current = after.get(instanceId)
    const chain = events.filter(event => event.instanceId === instanceId)
    if (!old && current && !chain.some(event => event.kind === 'create' || event.kind === 'temporary')) {
      issues.push({ instanceId, cardId: current.cardId, message: `Created in ${current.location.zoneId} without a create fact` })
      continue
    }
    if (old && !current && !chain.some(event => event.kind === 'destroy' || event.kind === 'temporary')) {
      issues.push({ instanceId, cardId: old.cardId, message: `Removed from ${old.location.zoneId} without a destroy fact` })
      continue
    }
    if (!old || !current || sameLocation(old.location, current.location)) continue
    if (chain.some(event => event.kind === 'destroy' || event.kind === 'temporary')) continue
    let expected = old.location.zoneId
    for (const event of chain) {
      if (event.kind === 'move') {
        if (event.source.zoneId !== expected) continue
        expected = event.destination.zoneId
      } else if (event.kind === 'shuffle') {
        expected = event.zone.zoneId
      }
    }
    if (expected !== current.location.zoneId) {
      issues.push({
        instanceId,
        cardId: current.cardId,
        message: `Moved from ${old.location.zoneId} to ${current.location.zoneId} without a complete move-fact chain`,
      })
    }
  }
  return issues
}

function sameLocation(left: CardInstanceLocation, right: CardInstanceLocation): boolean {
  return left.zoneId === right.zoneId && left.index === right.index
}

function syncLegacyRevealState(game: GameState, ...zones: CardInstanceZone[]): void {
  for (const zone of zones) {
    if (zone.zone === 'corruption_deck') {
      game.nemesis.corruptionDeckRevealed = zone.instanceIds.map(instanceId =>
        isCardInstanceRevealed(game, instanceId),
      )
    } else if (zone.zone === 'trinket_deck') {
      game.trinketDeckRevealed = zone.instanceIds.map(instanceId =>
        isCardInstanceRevealed(game, instanceId),
      )
    }
  }
}

