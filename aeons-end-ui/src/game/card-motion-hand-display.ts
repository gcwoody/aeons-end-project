import type { GameState, PlayerId } from '@engine/types'
import type { CardFlightSnapshot, CardZoneTransfer } from './card-flight'

export interface HandDiscardPresentationCard {
  cardId: string
  instanceId: string
  handIndex: number
  presentationKey: string
}

export interface HandDiscardPresentation {
  playerId: PlayerId
  cards: HandDiscardPresentationCard[]
}

export interface HandPlayPresentation {
  playerId: PlayerId
  cardId: string
  instanceId: string
  handIndex: number
  presentationKey: string
  motionKey: string
}

export interface PendingPlayCardFlight {
  ownerId: PlayerId
  cardId: string
  instanceId: string
  handIndex: number
  motionKey: string
  presentationKey: string
  hiddenDestination: HTMLElement | null
  hiddenDestinationZone: string | null
  hiddenDestinationKey: string | null
  hiddenDestinationVisibility: string
}

export interface PendingPlayCardFlightInput {
  ownerId: PlayerId
  cardId: string
  instanceId: string
  handIndex: number
  motionKey: string
}

export interface HandZonePresentationSnapshot {
  cards: Array<{
    playerId: PlayerId
    cardId: string
    instanceId: string
    handIndex: number
  }>
}

export interface CardMotionHandDisplayAccess {
  getDiscardPresentation(): HandDiscardPresentation | null
  setDiscardPresentation(value: HandDiscardPresentation | null): void
  getPlayPresentation(): HandPlayPresentation | null
  setPlayPresentation(value: HandPlayPresentation | null): void
}

/** Owns the temporary hand layout shown while hand cards move to other zones. */
export function createCardMotionHandDisplay(access: CardMotionHandDisplayAccess) {
  let pendingPlayFlight: PendingPlayCardFlight | null = null

  function stageDepartures(
    transfers: readonly CardZoneTransfer[],
    snapshot: HandZonePresentationSnapshot | null,
    game: GameState | null,
    getHandInstanceIds: (game: GameState, playerId: PlayerId) => readonly string[],
  ) {
    if (!snapshot || !game) return
    const handTransfers = transfers.filter(transfer =>
      (transfer.zone === 'discard' || transfer.zone === 'deck') &&
      !!transfer.flight && transfer.sourcePlayerId && transfer.sourceHandInstanceId,
    )
    if (handTransfers.length === 0) return

    const existing = access.getDiscardPresentation()
    const preferredPlayerId = existing?.playerId
    const playerId = preferredPlayerId && handTransfers.some(transfer => transfer.sourcePlayerId === preferredPlayerId)
      ? preferredPlayerId
      : handTransfers[0]!.sourcePlayerId!
    const movingInstances = new Set(handTransfers
      .filter(transfer => transfer.sourcePlayerId === playerId)
      .map(transfer => transfer.sourceHandInstanceId!))
    const player = game.players.find(candidate => candidate.id === playerId)
    if (!player) return

    const remainingInstances = new Set(getHandInstanceIds(game, playerId))
    const cards = snapshot.cards
      .filter(card => card.playerId === playerId &&
        (remainingInstances.has(card.instanceId) || movingInstances.has(card.instanceId)))
      .sort((left, right) => left.handIndex - right.handIndex)
      .map(card => ({
        cardId: card.cardId,
        instanceId: card.instanceId,
        handIndex: card.handIndex,
        presentationKey: `${playerId}:hand:${card.instanceId}`,
      }))
    if (cards.length > 0) access.setDiscardPresentation({ playerId, cards })
  }

  function setDiscardPresentation(presentation: HandDiscardPresentation | null) {
    access.setDiscardPresentation(presentation)
  }

  function getDiscardPresentation() {
    return access.getDiscardPresentation()
  }

  function clearDiscardPresentation() {
    access.setDiscardPresentation(null)
  }

  function setPendingPlayFlight(pending: PendingPlayCardFlight, presentation: HandPlayPresentation) {
    pendingPlayFlight = pending
    access.setPlayPresentation(presentation)
  }

  /** Keep a just-played card in its hand slot until its play decision resolves. */
  function holdPlayedCardForDecision(input: PendingPlayCardFlightInput) {
    const presentationKey = `${input.ownerId}:play:${input.motionKey}`
    const pending: PendingPlayCardFlight = {
      ...input,
      presentationKey,
      hiddenDestination: null,
      hiddenDestinationZone: null,
      hiddenDestinationKey: null,
      hiddenDestinationVisibility: '',
    }
    setPendingPlayFlight(pending, {
      playerId: input.ownerId,
      cardId: input.cardId,
      instanceId: input.instanceId,
      handIndex: input.handIndex,
      presentationKey,
      motionKey: input.motionKey,
    })
    return pending
  }

  function getPendingPlayFlight() {
    return pendingPlayFlight
  }

  function takePendingPlayFlight() {
    const pending = pendingPlayFlight
    pendingPlayFlight = null
    return pending
  }

  function clearPlayPresentation(presentationKey?: string) {
    const current = access.getPlayPresentation()
    if (presentationKey && current?.presentationKey !== presentationKey) return
    access.setPlayPresentation(null)
  }

  function clearPendingPlayFlight() {
    const pending = pendingPlayFlight
    if (!pending) return
    if (pending.hiddenDestination?.style.visibility === 'hidden') {
      pending.hiddenDestination.style.visibility = pending.hiddenDestinationVisibility
    }
    clearPlayPresentation(pending.presentationKey)
    pendingPlayFlight = null
  }

  function clearAll() {
    clearPendingPlayFlight()
    clearDiscardPresentation()
    clearPlayPresentation()
  }

  return {
    stageDepartures,
    getDiscardPresentation,
    setDiscardPresentation,
    clearDiscardPresentation,
    holdPlayedCardForDecision,
    getPendingPlayFlight,
    takePendingPlayFlight,
    clearPlayPresentation,
    clearPendingPlayFlight,
    clearAll,
  }
}
