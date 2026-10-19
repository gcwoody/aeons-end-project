import { MAGES } from '@engine/data'
import {
  getBreachAttachedRelicZone,
  getBreachCardInstanceZone,
  getNemesisCardInstanceZone,
  getPlayerCardInstanceZone,
} from '@engine/engine'
import type { GameState } from '@engine/types'
import {
  cardImageUrl,
  nemesisSpecificDeckBackUrl,
  playerDeckCardBackUrl,
  specificDeckBackUrl,
  specificDeckCardImageUrl,
} from '../card-images'
import { captureCardFlight, captureCardZoneMotion } from './card-flight'
import type { CardFlightSnapshot, CardZoneMotionCardSnapshot, CardZoneMotionSnapshot } from './card-flight'
import { getNemesisPresentation } from './nemesis-presentation'

type CardFace = 'front' | 'back'

interface PhysicalCardZone {
  cards: string[]
  instanceIds: string[]
  ownerId: string | null
}

/** Keep physical pile sources available without enabling ordinary flights for hidden copies. */
export function captureGameCardZoneMotion(
  game: GameState,
  root: ParentNode = document,
  excludedElement: HTMLElement | null = null,
): CardZoneMotionSnapshot {
  const snapshot = captureCardZoneMotion(root, excludedElement)
  const hasPhysicalSource = (instanceId: string, zone: string) => snapshot.cards.some(card =>
    card.instanceId === instanceId && card.zone === zone && !card.key.startsWith('decision-') &&
    !!(card.flight || card.physicalFlight))
  const addPhysicalPileCards = (
    pile: PhysicalCardZone,
    zone: string,
    source: HTMLElement | null,
    faceAt: (index: number) => CardFace,
    imageAt: (cardId: string, index: number) => string | undefined,
    controlFallback = false,
  ) => {
    if (!source || source === excludedElement || excludedElement?.contains(source) ||
      source.dataset.cardMotionSuppressFlight === 'true' || getComputedStyle(source).visibility === 'hidden') return
    pile.cards.forEach((cardId, index) => {
      const instanceId = pile.instanceIds[index]
      if (!instanceId || hasPhysicalSource(instanceId, zone)) return
      const imageUrl = imageAt(cardId, index)
      if (!imageUrl) return
      const physicalFlight = capturePhysicalPileCard(source, imageUrl, controlFallback)
      if (!physicalFlight) return
      snapshot.cards.push({
        zone,
        cardId,
        ownerId: pile.ownerId ?? '',
        key: `physical-${zone}-${instanceId}`,
        instanceId,
        face: faceAt(index),
        flight: null,
        physicalFlight,
      })
    })
  }
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
    addPhysicalPileCards(
      specificDeck,
      'strike_deck',
      displaysTopFaceUp ? topCardElement : pileElement,
      index => displaysTopFaceUp &&
        (!getNemesisPresentation(game.nemesis.type).specificDeck.topCardAlwaysRevealed || index === 0)
        ? 'front' : 'back',
      (cardId, index) => displaysTopFaceUp &&
        (!getNemesisPresentation(game.nemesis.type).specificDeck.topCardAlwaysRevealed || index === 0)
        ? cardImageUrl(cardId) : nemesisSpecificDeckBackUrl(game.nemesis.type),
    )
  }

  for (const player of game.players) {
    const area = [...root.querySelectorAll<HTMLElement>('[data-player-area-id]')]
      .find(element => element.dataset.playerAreaId === player.id)
    const control = area ? null : [...root.querySelectorAll<HTMLElement>('[data-player-control-id]')]
      .find(element => element.dataset.playerControlId === player.id) ?? null
    const sourceFor = (selector: string) => area?.querySelector<HTMLElement>(selector) ?? control
    const mage = MAGES[player.mageType]
    addPhysicalPileCards(
      getPlayerCardInstanceZone(game, player.id, 'deck'), 'deck',
      sourceFor('[data-card-flight-target="deck"] .card-surface'),
      () => 'back', cardId => playerDeckCardBackUrl(cardId), !area,
    )
    addPhysicalPileCards(
      getPlayerCardInstanceZone(game, player.id, 'discard'), 'discard',
      sourceFor('[data-discard-top-card]'),
      () => 'front', cardId => cardImageUrl(cardId), !area,
    )
    const specificFace = (index: number): CardFace => mage?.specificDeckDisplay === 'face_up' ||
      (mage?.specificDeckDisplay === 'top_revealed' && index === 0) ? 'front' : 'back'
    addPhysicalPileCards(
      getPlayerCardInstanceZone(game, player.id, 'specific_deck'), 'specific_deck',
      sourceFor('[data-card-flight-source="mage-specific-deck"]'),
      specificFace,
      (cardId, index) => specificFace(index) === 'front'
        ? specificDeckCardImageUrl(player.mageType, cardId, player.mageFormSide)
        : specificDeckBackUrl(mage?.specificDeckBack),
      !area,
    )

    // A different Mage's board is not mounted. Its always-visible control is
    // the same fallback anchor used by cross-player card arrivals.
    if (!area && control) {
      for (const [engineZone, motionZone] of [
        ['hand', 'hand'], ['played_this_turn', 'played'], ['swap_zone', 'swap'],
        ['player_cards_in_play', 'player_cards_in_play'],
      ] as const) {
        addPhysicalPileCards(getPlayerCardInstanceZone(game, player.id, engineZone), motionZone,
          control, () => 'front', cardId => cardImageUrl(cardId), true)
      }
      for (const breach of player.breaches) {
        addPhysicalPileCards(getBreachCardInstanceZone(game, player.id, breach.index), 'breach',
          control, index => breach.preppedSpellFaceDown?.[index] ? 'back' : 'front',
          (cardId, index) => breach.preppedSpellFaceDown?.[index]
            ? playerDeckCardBackUrl(cardId) : cardImageUrl(cardId), true)
        const attached = getBreachAttachedRelicZone(game, player.id, breach.index)
        if (attached) addPhysicalPileCards(attached, 'breach', control,
          () => 'front', cardId => cardImageUrl(cardId), true)
      }
    }
  }

  return snapshot
}

/** Capture only the real board anchor, replacing its visible top with the departing copy. */
function capturePhysicalPileCard(
  source: HTMLElement,
  imageUrl: string,
  controlFallback: boolean,
): CardFlightSnapshot | null {
  const flight = captureCardFlight(source, { ignoreDecisionPresentation: true })
  if (!flight) return null
  const image = flight.clone.querySelector('img')
  if (image) {
    image.src = imageUrl
    image.style.objectFit = 'cover'
    image.style.objectPosition = 'center'
    image.style.borderRadius = 'inherit'
  }
  if (controlFallback) {
    const width = Math.min(flight.width, flight.height * 63.5 / 88)
    flight.left += (flight.width - width) / 2
    flight.width = width
  }
  return flight
}
