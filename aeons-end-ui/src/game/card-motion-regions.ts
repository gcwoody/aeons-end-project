import { cardZoneFlightDestinationMode } from './card-motion-policy'
import type { CardZoneTransfer, PlayerCardZone } from './card-flight'

export interface CardMotionRegionAnchor {
  element: HTMLElement
  destinationMode: 'overlay' | 'replace'
}

type RegionResolver = (
  playerArea: HTMLElement,
  transfer: CardZoneTransfer,
  projectedDiscardTop: string | null,
) => CardMotionRegionAnchor | null

const playerRegionResolvers: Record<PlayerCardZone, RegionResolver> = {
  hand: (playerArea, transfer) => {
    const handCards = [...playerArea.querySelectorAll<HTMLElement>('[data-card-flight-target="hand"]')]
      .filter(element => element.dataset.heldPlayCard !== 'true')
    const handCard = (transfer.instanceId
      ? handCards.find(element => element.dataset.cardInstanceId === transfer.instanceId)
      : undefined) ?? handCards.find(element =>
      element.getAttribute('data-hand-card-id') === transfer.cardId &&
      element.getAttribute('data-hand-card-index') === String(transfer.zoneIndex),
    ) ?? [...handCards].reverse().find(element =>
      element.getAttribute('data-hand-card-id') === transfer.cardId)
    return handCard ? {
      element: handCard,
      destinationMode: cardZoneFlightDestinationMode(transfer.zone, true),
    } : null
  },
  deck: playerArea => {
    const deck = [...playerArea.querySelectorAll<HTMLElement>('[data-card-flight-target="deck"]')][0]
    return deck ? {
      element: deck,
      destinationMode: cardZoneFlightDestinationMode('deck', false),
    } : null
  },
  discard: (playerArea, transfer, projectedDiscardTop) => {
    const topCardId = projectedDiscardTop ?? transfer.previousDiscardTop
    const top = topCardId
      ? [...playerArea.querySelectorAll<HTMLElement>('[data-discard-top-card]')]
        .find(element => element.getAttribute('data-discard-top-card') === topCardId)
      : undefined
    if (top) return {
      element: top,
      destinationMode: cardZoneFlightDestinationMode('discard', true),
    }
    const pile = [...playerArea.querySelectorAll<HTMLElement>('[data-card-flight-zone="discard"]')][0]
    return pile ? {
      element: pile,
      destinationMode: cardZoneFlightDestinationMode('discard', false),
    } : null
  },
}

/** Resolve a visible player-zone anchor through the region registry. */
export function resolvePlayerCardRegionAnchor(
  playerArea: HTMLElement | null,
  transfer: CardZoneTransfer,
  projectedDiscardTop: string | null = null,
): CardMotionRegionAnchor | null {
  if (!playerArea && typeof document !== 'undefined') {
    // Only the selected Mage has a full board on screen. Use the recipient's
    // always-visible player control as the fallback for cross-player arrivals.
    const playerControl = [...document.querySelectorAll<HTMLElement>('[data-player-control-id]')]
      .find(element => element.dataset.playerControlId === transfer.playerId)
    return playerControl ? { element: playerControl, destinationMode: 'overlay' } : null
  }
  if (!playerArea) return null
  return playerRegionResolvers[transfer.zone](playerArea, transfer, projectedDiscardTop)
}
