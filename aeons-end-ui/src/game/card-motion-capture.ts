import { getNemesisCardInstanceZone } from '@engine/engine'
import type { GameState } from '@engine/types'
import { captureCardFlight, captureCardZoneMotion } from './card-flight'
import type { CardZoneMotionCardSnapshot, CardZoneMotionSnapshot } from './card-flight'
import { getNemesisPresentation } from './nemesis-presentation'

/** Capture ordinary board cards plus pile-backed cards that can move from Nemesis decks. */
export function captureGameCardZoneMotion(
  game: GameState,
  root: ParentNode = document,
  excludedElement: HTMLElement | null = null,
): CardZoneMotionSnapshot {
  const snapshot = captureCardZoneMotion(root, excludedElement)
  const addPileCard = (
    zone: 'nemesis_deck' | 'strike_deck',
    index: number,
    element: HTMLElement | null,
    face: 'front' | 'back',
  ) => {
    const pile = getNemesisCardInstanceZone(game, zone)
    const cardId = pile.cards[index]
    const instanceId = pile.instanceIds[index]
    if (!cardId || !instanceId || snapshot.cards.some(card => card.instanceId === instanceId)) return
    const card: CardZoneMotionCardSnapshot = {
      zone,
      cardId,
      ownerId: pile.ownerId ?? 'nemesis',
      key: `${zone}-${instanceId}`,
      instanceId,
      face,
      flight: captureCardFlight(element),
    }
    snapshot.cards.push(card)
  }

  const nemesisDeck = getNemesisCardInstanceZone(game, 'nemesis_deck')
  if (nemesisDeck.cards.length > 0) {
    addPileCard(
      'nemesis_deck',
      nemesisDeck.cards.length - 1,
      root.querySelector<HTMLElement>('[data-nemesis-deck-pile="true"]'),
      'back',
    )
  }

  const specificDeck = getNemesisCardInstanceZone(game, 'strike_deck')
  if (specificDeck.cards.length > 0) {
    const displaysTopFaceUp = getNemesisPresentation(game.nemesis.type).specificDeck.display === 'face_up'
    const pileElement = root.querySelector<HTMLElement>(
      '[data-card-flight-source="nemesis-specific-deck"]',
    )
    const topCardElement = pileElement?.querySelector<HTMLElement>('[data-card-motion-pile-top="true"]') ?? null
    addPileCard(
      'strike_deck',
      0,
      displaysTopFaceUp ? topCardElement : pileElement,
      displaysTopFaceUp ? 'front' : 'back',
    )
  }

  return snapshot
}
