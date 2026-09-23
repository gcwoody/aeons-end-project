<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { getCastableSpells, getBreachActionCosts, getPreppedSpellChoices, getSpellDamagePreviewRange, toRoman } from '@engine/engine'
import { getCard, MAGES } from '@engine/data'
import { cardImageUrl, playerCardBackUrl, specificDeckBackUrl } from '../card-images'
import type { BreachState, CardChoice } from '@engine/types'
import { useGame } from '../game/useGame'
import CardHoverPreview from './CardHoverPreview.vue'
import CardSurface from './CardSurface.vue'
import ZoneScroller from './ZoneScroller.vue'
import PileCountBadge from './PileCountBadge.vue'
import TokenBadge from './TokenBadge.vue'
import { breachImageUrl, breachRotation } from '../breach-images'
import MageBoard from './MageBoard.vue'

const {
  state, displayPlayer, isCurrentSelected, canActMain, canRepositionPrepped, canCast,
  canActivateAbilityInMain,
  aetherInfo, prepSpell, focusBreach, openBreach, gainCharge, activateAbility,
  activatePreppedCardAction, activatePreppedSpellAction, preppedCardActions,
  activatePlayerCardInPlayAction, playerCardInPlayActions,
  isPendingPreppedSpellSelected, togglePendingPreppedSpell,
  getBoardCardSelection, isPendingBoardCardSelected, togglePendingBoardCard,
  playCard, playAllGems, castSpell, movePreppedSpell, returnPreppedSpellToHand, requestEndTurn, toMainPhase,
  selectPlayer, clickDiscardCard, openPile, openSpecificDeckPile, openPlayerCardsInPlayPile, resolveDecision, toggleHelp,
} = useGame()

const players = computed(() => state.game?.players ?? [])
const player = computed(() => displayPlayer.value!)
const aether = computed(() => aetherInfo(player.value))
const ready = computed(() => player.value.charge >= player.value.chargeThreshold)
const hasPreppedSpell = computed(() => !!state.game && getPreppedSpellChoices(state.game).length > 0)
const abilityNeedsPreppedSpell = computed(() =>
  MAGES[player.value?.mageType ?? '']?.abilityEffects.some(effect => effect.kind === 'cast_prepped_spell') ?? false,
)
const isMain = computed(() => state.phase === 'main')
const isCasting = computed(() => state.phase === 'casting')
const isDiscard = computed(() => state.phase === 'discard_order')
const discardTopCard = computed(() => player.value.discard[0] ?? null)
const swapZoneCards = computed(() => player.value.swapZone ?? [])
const developZoneCards = computed(() => player.value.developZone ?? [])
const mageDefinition = computed(() => MAGES[player.value?.mageType ?? ''])
const hasSwapZone = computed(() => mageDefinition.value?.hasSwapZone === true || swapZoneCards.value.length > 0)
const hasDevelopZone = computed(() => mageDefinition.value?.hasDevelopZone === true || developZoneCards.value.length > 0)
const hasSpecificDeck = computed(() => mageDefinition.value?.hasSpecificDeck === true)
const specificDeckName = computed(() => mageDefinition.value?.specificDeckName ?? 'Specific Deck')
const specificDeckCards = computed(() => player.value.specificDeck ?? [])
const playerCardPlacementsInPlay = computed(() =>
  (player.value.playerCardsInPlay ?? [])
    .map((cardId, cardIndex) => ({ cardId, cardIndex }))
    .filter(({ cardIndex }) => player.value.playerCardSupplyTargets?.[cardIndex] == null),
)
const playerCardsInPlay = computed(() => playerCardPlacementsInPlay.value.map(({ cardId }) => cardId))
const hasPlayerCardsInPlay = computed(() => playerCardsInPlay.value.length > 0)
const specificDeckBackImage = computed(() =>
  mageDefinition.value?.specificDeckBack
    ? specificDeckBackUrl(mageDefinition.value.specificDeckBack)
    : undefined,
)
const draggingSpell = ref(false)
const handElement = ref<HTMLElement | null>(null)
const handOffset = ref(0)
const draggedSpellId = ref<string | null>(null)
const draggedSpellIndex = ref<number | null>(null)
const draggedPreppedSpell = ref<{ breachIndex: number; spellIndex: number } | null>(null)
const endTurnActionElement = ref<HTMLElement | null>(null)
// A real drag should not also trigger the click handler when the pointer is
// released. A short click still activates a while-prepped spell normally.
const suppressSpellClick = ref(false)
const dragPosition = ref({ x: 0, y: 0 })
let dragPointerId = -1
let dragStartX = 0
let dragStartY = 0
let dragCardWidth = 122
let dragCardHeight = 178
const phaseLabel = computed(() => {
  if (state.phase === 'casting' && state.game?.pendingEffect?.preppedPhase === 'casting_phase_end') {
    return 'End of Casting Phase · End Point'
  }
  return ({
    setup: 'Setup',
    casting: 'Casting Phase · Spell Selection',
    main: 'Main Phase · Action',
    discard_order: 'Discard Phase · Card Order',
    nemesis_main: 'Nemesis Main Phase',
    nemesis_draw: 'Nemesis Draw Phase',
    gameover: 'Game Over',
  }[state.phase])
})

const DIR: Record<string, string> = { east: '→', south: '↓', west: '←', north: '↑' }

const canPrep = (b: BreachState, cardId = draggedSpellId.value ?? '') =>
  b.present !== false && canActMain.value
    && b.prepSpells.length < player.value.turnEffects.prepSpellLimit
    && (b.opened || b.focusedThisTurn || !!cardId && getCard(cardId).prepToClosedBreach)

const canMovePreppedSpellTo = (
  b: BreachState,
  source = draggedPreppedSpell.value,
) => {
  if (b.present === false || !canRepositionPrepped.value || !source) return false
  if (source.breachIndex === b.index) return false
  const sourceBreach = player.value.breaches.find(item => item.index === source?.breachIndex)
  const sourceCardId = sourceBreach?.prepSpells[source.spellIndex]
  return b.opened || b.focusedThisTurn || !!sourceCardId && getCard(sourceCardId).prepToClosedBreach
}

const canMovePreppedTo = (b: BreachState) => canMovePreppedSpellTo(b)

const isMustCastBreach = (b: BreachState) =>
  canCast.value && !state.game?.pendingDecision && b.prepSpells.length > 0 && getCastableSpells(state.game!, player.value.id)
    .some((spell) => spell.breachIndex === b.index && spell.mustCast)

const isCastableBreach = (b: BreachState) =>
  canCast.value && !state.game?.pendingDecision && b.prepSpells.length > 0

const isMandatoryPreppedEffect = (b: BreachState, spellIndex = 0) => {
  const decision = state.game?.pendingDecision
  return decision?.kind === 'confirm_prepped_effect'
    && decision.cardId === b.prepSpells[spellIndex]
    && decision.breachIndex === b.index
    && decision.spellIndex === spellIndex
}

const preppedSpellCastChoice = (b: BreachState, spellIndex = 0) => {
  const decision = state.game?.pendingDecision
  if (decision?.kind !== 'select_prepped_spell' || !b.prepSpells[spellIndex]) return null
  return decision.candidates.find(choice =>
    choice.playerId === player.value.id &&
    choice.breachIndex === b.index &&
    choice.spellIndex === spellIndex &&
    choice.cardId === b.prepSpells[spellIndex],
  ) ?? null
}

const pendingPreppedSpellChoice = (b: BreachState, spellIndex = 0) => {
  const decision = state.game?.pendingDecision
  if (decision?.kind !== 'select_prepped_spells' || !b.prepSpells[spellIndex]) return null
  return decision.candidates.find(choice =>
    choice.playerId === player.value.id &&
    choice.breachIndex === b.index &&
    choice.spellIndex === spellIndex &&
    choice.cardId === b.prepSpells[spellIndex],
  ) ?? null
}

const pendingCastSpell = (b: BreachState, spellIndex = 0) => {
  const pending = state.game?.pendingEffect?.pendingSpellCast
  if (!pending || !state.game?.pendingDecision || !b.prepSpells[spellIndex]) return false
  return pending.playerId === player.value.id
    && pending.breachIndex === b.index
    && pending.spellIndex === spellIndex
    && pending.cardId === b.prepSpells[spellIndex]
}

const spellDamagePreview = (b: BreachState, spellIndex = 0) => {
  if (!state.game || !b.prepSpells[spellIndex]) return null

  const pending = state.game.pendingEffect?.pendingSpellCast
  if (pendingCastSpell(b, spellIndex) && pending) {
    const casterId = state.game.pendingEffect?.effectPlayerId ?? pending.playerId
    return getSpellDamagePreviewRange(state.game, casterId, player.value.id, b.index, spellIndex)
  }

  // Ability and card effects can ask the player to choose any player's
  // prepped spell, including during Main Phase. The decision owner is the
  // caster for this preview, while the displayed player's breach is the owner
  // of the prepped spell.
  const castChoice = preppedSpellCastChoice(b, spellIndex)
  const decision = state.game.pendingDecision
  if (castChoice && decision?.kind === 'select_prepped_spell') {
    const casterId = state.game.pendingEffect?.effectPlayerId
      ?? state.game.pendingEffect?.sourcePlayerId
      ?? castChoice.playerId
    return getSpellDamagePreviewRange(state.game, casterId, player.value.id, b.index, spellIndex)
  }

  // During casting, preview a prepped spell only while its card is hovered.
  // A pending decision belongs to another interaction and must not show a stale preview.
  if (!isCasting.value || !canCast.value || state.game.pendingDecision) return null
  return getSpellDamagePreviewRange(state.game, player.value.id, player.value.id, b.index, spellIndex)
}

const spellDamagePreviewLabel = (b: BreachState, spellIndex = 0) => {
  const preview = spellDamagePreview(b, spellIndex)
  if (!preview) return null
  return preview.min === preview.max ? `${preview.min}` : `${preview.min}/${preview.max}`
}

const typeClass = (cid: string) => {
  const type = getCard(cid).type
  if (type === 'gem' || type === 'relic' || type === 'treasure') return type
  return 'spell'
}

const isFaceDownPreppedSpell = (b: BreachState, spellIndex: number) =>
  b.preppedSpellFaceDown?.[spellIndex] === true

const draggedPreppedSpellFaceDown = computed(() => {
  const source = draggedPreppedSpell.value
  if (!source) return false
  const breach = player.value.breaches.find(item => item.index === source.breachIndex)
  return !!breach && isFaceDownPreppedSpell(breach, source.spellIndex)
})

const draggedSpellPreviewUrl = computed(() => {
  const cardId = draggedSpellId.value
  if (!cardId) return undefined
  return draggedPreppedSpellFaceDown.value ? playerCardBackUrl() : cardImageUrl(cardId)
})

const isDraggedPreppedSpell = (b: BreachState, spellIndex: number) =>
  draggingSpell.value
    && draggedPreppedSpell.value?.breachIndex === b.index
    && draggedPreppedSpell.value?.spellIndex === spellIndex

function breachCosts(b: BreachState) {
  return getBreachActionCosts(state.game!, player.value.id, b.index) ?? { focus: 0, open: 0 }
}

function isPreppedActionCard(index: number, cardId: string): boolean {
  return preppedCardActions.value.some(action =>
    action.choices.some(choice =>
      choice.zone === 'played_this_turn' && choice.index === index && choice.cardId === cardId))
}

function isPreppedSpellAction(b: BreachState, spellIndex: number): boolean {
  return preppedCardActions.value.some(action =>
    action.kind === 'activate_effect'
      && action.breachIndex === b.index
      && action.spellIndex === spellIndex)
}

/** Identify repeatable Main Phase while-prepped effects even when their
 * activation condition is currently unavailable (for example, Wildfire Whip
 * with less than two Aether). This keeps the card visibly actionable while
 * preventing a click from falling through to normal spell casting. */
function isRepeatablePreppedSpell(b: BreachState, spellIndex: number): boolean {
  if (!isMain.value || !isCurrentSelected.value) return false
  const cardId = b.prepSpells[spellIndex]
  if (!cardId) return false
  return (getCard(cardId).effects ?? []).some(block =>
    block.trigger.kind === 'while_prepped'
      && block.trigger.phase === 'main_phase'
      && block.manualActivation === true
      && block.oncePerTurn !== true)
}

function handleEndTurn() {
  requestEndTurn()
}

function dismissEndTurnWarning(event: PointerEvent) {
  if (!state.endTurnWarningVisible) return
  const target = event.target
  if (target instanceof Node && endTurnActionElement.value?.contains(target)) return
  state.endTurnWarningVisible = false
}

function isDecisionBreachTarget(b: BreachState): boolean {
  const decision = state.game?.pendingDecision
  return (decision?.kind === 'select_breach' || decision?.kind === 'select_exhaust_breach')
    && decision.candidates.some(choice => choice.playerId === player.value.id && choice.breachIndex === b.index)
}

function boardCardChoice(zone: CardChoice['zone'], index: number, cardId: string) {
  return getBoardCardSelection(player.value.id, zone, index, cardId)
}

function clickPlayedCard(index: number) {
  const cardId = player.value.playedThisTurn[index]
  if (!cardId) return
  const boardChoice = boardCardChoice('played_this_turn', index, cardId)
  if (boardChoice) {
    togglePendingBoardCard(boardChoice)
    return
  }
  if (!canActMain.value) return
  if (!isPreppedActionCard(index, cardId)) return
  activatePreppedCardAction({
    zone: 'played_this_turn', index, cardId, cardName: getCard(cardId).name,
  })
}

function clickSwapZoneCard(index: number) {
  const cardId = swapZoneCards.value[index]
  if (!cardId) return
  const boardChoice = boardCardChoice('swap_zone', index, cardId)
  if (boardChoice) togglePendingBoardCard(boardChoice)
}

function isPlayerCardInPlayAction(index: number, cardId: string): boolean {
  const placement = playerCardPlacementsInPlay.value[index]
  return !!placement && placement.cardId === cardId && playerCardInPlayActions.value.some(action =>
    action.cardIndex === placement.cardIndex && action.cardId === cardId,
  )
}

function playerCardPowerTokens(index: number): number {
  const placement = playerCardPlacementsInPlay.value[index]
  return placement ? player.value.playerCardPowerTokens?.[placement.cardIndex] ?? 0 : 0
}

function clickPlayerCardInPlay(index: number) {
  if (!state.game || state.phase !== 'main' || state.game.currentTurn === 'nemesis' || state.game.pendingDecision || state.game.pendingEffect) return
  if (playerCardsInPlay.value.length > 1) {
    const hasVisibleAction = playerCardPlacementsInPlay.value.some((placement, visibleIndex) =>
      isPlayerCardInPlayAction(visibleIndex, placement.cardId),
    )
    if (hasVisibleAction) openPlayerCardsInPlayPile()
    return
  }
  const placement = playerCardPlacementsInPlay.value[index]
  if (!placement || !isPlayerCardInPlayAction(index, placement.cardId)) return
  activatePlayerCardInPlayAction(placement.cardIndex)
}

function clickHand(i: number) {
  const cid = player.value.hand[i]
  if (!cid) return
  const boardChoice = boardCardChoice('hand', i, cid)
  if (boardChoice) {
    togglePendingBoardCard(boardChoice)
    return
  }
  if (!canActMain.value) return
  // Spells are prepared exclusively by dragging them onto a breach.
  if (getCard(cid).type !== 'spell') playCard(i)
}

let handScrollTarget = 0
let handScrollFrame: number | null = null

function animateHandScroll() {
  const hand = handElement.value
  if (!hand) {
    handScrollFrame = null
    return
  }
  const maxScroll = Math.max(0, hand.scrollWidth - hand.clientWidth)
  handScrollTarget = Math.min(Math.max(0, handScrollTarget), maxScroll)
  const distance = handScrollTarget - hand.scrollLeft
  if (Math.abs(distance) < 0.5) {
    hand.scrollLeft = handScrollTarget
    handScrollFrame = null
    return
  }
  // Ease toward the latest wheel target so consecutive wheel events feel like
  // one continuous horizontal movement instead of a series of hard jumps.
  hand.scrollLeft += distance * 0.2
  handScrollFrame = requestAnimationFrame(animateHandScroll)
}

function handleHandWheel(event: WheelEvent) {
  const target = event.target
  const hand = target instanceof Element ? target.closest<HTMLElement>('.hand') : null
  if (!hand || hand !== handElement.value || hand.scrollWidth <= hand.clientWidth || event.deltaY === 0) return
  event.preventDefault()
  event.stopPropagation()
  // The hand intentionally maps vertical mouse-wheel movement to horizontal
  // scrolling: wheel up moves toward the left, wheel down toward the right.
  if (handScrollFrame === null) handScrollTarget = hand.scrollLeft
  const maxScroll = Math.max(0, hand.scrollWidth - hand.clientWidth)
  handScrollTarget = Math.min(Math.max(0, handScrollTarget + event.deltaY * 1.1), maxScroll)
  if (handScrollFrame === null) handScrollFrame = requestAnimationFrame(animateHandScroll)
}

let handAlignmentFrame: number | null = null
let handResizeObserver: ResizeObserver | null = null

function updateHandAlignment() {
  if (handAlignmentFrame !== null) cancelAnimationFrame(handAlignmentFrame)
  handAlignmentFrame = requestAnimationFrame(() => {
    handAlignmentFrame = null
    const hand = handElement.value
    if (!hand || typeof window === 'undefined') return
    const cards = [...hand.querySelectorAll<HTMLElement>('.card')]
    const gap = Number.parseFloat(getComputedStyle(hand).gap) || 0
    const cardWidth = cards.reduce((total, card) => total + card.getBoundingClientRect().width, 0)
    const contentWidth = cardWidth + Math.max(0, cards.length - 1) * gap
    const rightPadding = Number.parseFloat(getComputedStyle(hand).paddingRight) || 0
    const handRect = hand.getBoundingClientRect()
    const desiredOffset = window.innerWidth / 2 - handRect.left - contentWidth / 2
    const maxOffset = Math.max(0, hand.clientWidth - rightPadding - contentWidth)
    handOffset.value = Math.round(Math.min(Math.max(0, desiredOffset), maxOffset))
  })
}

function startSpellPointerDrag(i: number, event: PointerEvent) {
  if (boardCardChoice('hand', i, player.value.hand[i] ?? '')) return
  if (event.button !== 0 || !canActMain.value || getCard(player.value.hand[i]).type !== 'spell') return
  suppressSpellClick.value = false
  const source = event.currentTarget instanceof HTMLElement ? event.currentTarget.getBoundingClientRect() : null
  dragCardWidth = source?.width ?? 122
  dragCardHeight = source?.height ?? 178
  state.prepTarget = null
  draggedSpellId.value = player.value.hand[i]!
  draggedSpellIndex.value = i
  draggedPreppedSpell.value = null
  dragPosition.value = { x: event.clientX, y: event.clientY }
  dragPointerId = event.pointerId
  dragStartX = event.clientX
  dragStartY = event.clientY
  window.addEventListener('pointermove', handleSpellPointerMove, { passive: false })
  window.addEventListener('pointerup', finishSpellPointerDrag, { once: true })
  window.addEventListener('pointercancel', cancelSpellPointerDrag, { once: true })
}

function startPreppedSpellDrag(b: BreachState, spellIndex: number, event: PointerEvent) {
  if (event.button !== 0 || !canRepositionPrepped.value || state.game?.pendingDecision || b.present === false) return
  const cardId = b.prepSpells[spellIndex]
  if (!cardId) return
  suppressSpellClick.value = false
  const source = event.currentTarget instanceof HTMLElement ? event.currentTarget.getBoundingClientRect() : null
  dragCardWidth = source?.width ?? 122
  dragCardHeight = source?.height ?? 178
  state.prepTarget = null
  draggedSpellId.value = cardId
  draggedSpellIndex.value = null
  draggedPreppedSpell.value = { breachIndex: b.index, spellIndex }
  dragPosition.value = { x: event.clientX, y: event.clientY }
  dragPointerId = event.pointerId
  dragStartX = event.clientX
  dragStartY = event.clientY
  window.addEventListener('pointermove', handleSpellPointerMove, { passive: false })
  window.addEventListener('pointerup', finishSpellPointerDrag, { once: true })
  window.addEventListener('pointercancel', cancelSpellPointerDrag, { once: true })
}

function handleSpellPointerMove(event: PointerEvent) {
  if (event.pointerId !== dragPointerId) return
  dragPosition.value = { x: event.clientX, y: event.clientY }
  const distance = Math.hypot(event.clientX - dragStartX, event.clientY - dragStartY)
  if (distance > 5) {
    if (!draggingSpell.value) {
      draggingSpell.value = true
      // A real drag is a modal pointer interaction: close any preview that
      // was already visible and prevent the click produced on release from
      // activating whichever card is underneath the pointer.
      window.dispatchEvent(new Event('card-preview-dismiss'))
      window.addEventListener('click', blockSpellDragClick, true)
    }
    suppressSpellClick.value = true
  }
  if (draggingSpell.value) event.preventDefault()
}

function blockSpellDragClick(event: MouseEvent) {
  if (!suppressSpellClick.value) return
  event.preventDefault()
  event.stopImmediatePropagation()
  suppressSpellClick.value = false
  window.removeEventListener('click', blockSpellDragClick, true)
}

function finishSpellPointerDrag(event: PointerEvent) {
  if (event.pointerId !== dragPointerId) return
  const wasDragging = draggingSpell.value
  const spellIndex = draggedSpellIndex.value
  const preppedSource = draggedPreppedSpell.value
  // A spell is prepared when the dragged card overlaps a legal Breach. The
  // pointer may be just outside the Breach when the player releases, so the
  // drop target is based on rectangle intersection rather than pointer hit
  // testing. Pick the Breach with the greatest overlap if two are touched.
  const dragPreview = document.querySelector<HTMLElement>('.spell-drag-preview')
  const dragWidth = dragPreview?.offsetWidth ?? dragCardWidth
  const dragHeight = dragPreview?.offsetHeight ?? dragCardHeight
  const draggedRect = {
    left: event.clientX - dragWidth / 2,
    right: event.clientX + dragWidth / 2,
    top: event.clientY - dragHeight / 2,
    bottom: event.clientY + dragHeight / 2,
  }
  const overlapArea = (a: typeof draggedRect, b: DOMRect) => {
    const width = Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left))
    const height = Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top))
    return width * height
  }
  const breachCandidates = [...document.querySelectorAll<HTMLElement>('[data-breach-index]')]
    .map(element => {
      const rect = element.getBoundingClientRect()
      return {
        element,
        area: overlapArea(draggedRect, rect),
        touches: draggedRect.left <= rect.right && draggedRect.right >= rect.left
          && draggedRect.top <= rect.bottom && draggedRect.bottom >= rect.top,
      }
    })
    .filter(candidate => candidate.touches)
  const breachTarget = [...breachCandidates]
    .sort((a, b) => b.area - a.area)[0]?.element
  const targetSpell = [...document.querySelectorAll<HTMLElement>('[data-spell-index]')]
    .map(element => ({
      element,
      breach: element.closest<HTMLElement>('[data-breach-index]'),
      area: overlapArea(draggedRect, element.getBoundingClientRect()),
    }))
    .filter(candidate => candidate.breach && candidate.area > 0)
    .filter(candidate => {
      const breachIndex = Number(candidate.breach?.dataset.breachIndex)
      const breach = player.value.breaches.find(item => item.index === breachIndex)
      return !!breach && canMovePreppedTo(breach)
    })
    .sort((a, b) => b.area - a.area)[0] ?? null
  const handBreachTarget = breachCandidates
    .map(candidate => ({
      ...candidate,
      breach: player.value.breaches.find(item => item.index === Number(candidate.element.dataset.breachIndex)),
    }))
    .filter(candidate => !!candidate.breach && canPrep(candidate.breach, draggedSpellId.value ?? ''))
    .sort((a, b) => b.area - a.area || Number(a.element.dataset.breachIndex) - Number(b.element.dataset.breachIndex))[0]?.element
  const target = preppedSource
    ? targetSpell?.breach ?? breachTarget
    : handBreachTarget
  const breachIndex = target ? Number(target.dataset.breachIndex) : NaN
  const targetSpellIndex = targetSpell ? Number(targetSpell.element.dataset.spellIndex) : undefined
  const preppedTargetBreach = preppedSource
    ? player.value.breaches.find(item => item.index === breachIndex)
    : null
  const canDropPreppedTarget = !!preppedTargetBreach
    && canMovePreppedSpellTo(preppedTargetBreach, preppedSource)
  const handRect = handElement.value?.getBoundingClientRect()
  const handOverlap = handRect ? overlapArea(draggedRect, handRect) : 0
  // Face-down Conjured spells may move between legal Breaches, but must remain
  // in play. This guard protects against a release over the hand creating an
  // extra card and bypassing Conjure's top-of-deck fallback.
  const sourceFaceDown = preppedSource
    ? player.value.breaches.find(item => item.index === preppedSource.breachIndex)
      ?.preppedSpellFaceDown?.[preppedSource.spellIndex] === true
    : false
  removeSpellPointerListeners()
  draggingSpell.value = false
  draggedSpellId.value = null
  draggedSpellIndex.value = null
  draggedPreppedSpell.value = null
  if (wasDragging) {
    // Browsers may still dispatch click after a pointer drag. Keep the flag
    // until that synthetic click is consumed, then clear it as a fallback for
    // releases outside the card.
    suppressSpellClick.value = true
    window.setTimeout(() => {
      suppressSpellClick.value = false
      window.removeEventListener('click', blockSpellDragClick, true)
    }, 0)
  }
  if (wasDragging) {
    if (preppedSource) {
      if (handOverlap > 0) {
        if (!sourceFaceDown) {
          returnPreppedSpellToHand(preppedSource.breachIndex, preppedSource.spellIndex)
        }
      } else {
        const breach = player.value.breaches.find((item) => item.index === breachIndex)
        if (breach && breach.index !== preppedSource.breachIndex && canDropPreppedTarget) {
          movePreppedSpell(preppedSource.breachIndex, preppedSource.spellIndex, breach.index, targetSpellIndex)
        }
      }
    } else if (spellIndex !== null && target) {
      const breach = player.value.breaches.find((item) => item.index === breachIndex)
      if (breach) {
        // A hand spell uses the normal prep flow even if the target Breach
        // already contains a spell. Multi-spell Breaches can still stack;
        // an existing spell is never replaced by a hand drag.
        if (canPrep(breach, player.value.hand[spellIndex])) prepSpell(spellIndex, breach.index)
      }
    }
  }
}

function cancelSpellPointerDrag() {
  removeSpellPointerListeners()
  window.removeEventListener('click', blockSpellDragClick, true)
  draggingSpell.value = false
  draggedSpellId.value = null
  draggedSpellIndex.value = null
  draggedPreppedSpell.value = null
  state.prepTarget = null
  suppressSpellClick.value = false
}

function removeSpellPointerListeners() {
  window.removeEventListener('pointermove', handleSpellPointerMove)
  window.removeEventListener('pointerup', finishSpellPointerDrag)
  window.removeEventListener('pointercancel', cancelSpellPointerDrag)
  dragPointerId = -1
}

onBeforeUnmount(removeSpellPointerListeners)
onMounted(() => {
  window.addEventListener('pointerdown', dismissEndTurnWarning)
  window.addEventListener('resize', updateHandAlignment)
  if (handElement.value && typeof ResizeObserver !== 'undefined') {
    handResizeObserver = new ResizeObserver(updateHandAlignment)
    handResizeObserver.observe(handElement.value)
  }
  nextTick(updateHandAlignment)
})
watch(() => player.value?.hand.length, () => nextTick(updateHandAlignment))
watch(() => state.selectedPlayer, () => nextTick(updateHandAlignment))
watch(draggingSpell, (dragging) => {
  if (typeof document !== 'undefined') {
    document.body.classList.toggle('spell-dragging', dragging)
  }
  if (dragging && typeof window !== 'undefined') {
    window.dispatchEvent(new Event('card-preview-dismiss'))
  }
})
watch(
  [() => state.phase, () => state.selectedPlayer, () => state.game?.currentTurn],
  () => { state.endTurnWarningVisible = false },
)
onBeforeUnmount(() => {
  window.removeEventListener('click', blockSpellDragClick, true)
  if (typeof document !== 'undefined') document.body.classList.remove('spell-dragging')
  window.removeEventListener('pointerdown', dismissEndTurnWarning)
  window.removeEventListener('resize', updateHandAlignment)
  handResizeObserver?.disconnect()
  if (handAlignmentFrame !== null) cancelAnimationFrame(handAlignmentFrame)
  if (handScrollFrame !== null) cancelAnimationFrame(handScrollFrame)
})

function clickBreach(b: BreachState) {
  if (b.present === false) return
  const breachDecision = state.game?.pendingDecision
  if (breachDecision?.kind === 'select_breach') {
    const choice = breachDecision.candidates.find(candidate =>
      candidate.playerId === player.value.id && candidate.breachIndex === b.index)
    if (choice) resolveDecision({ kind: 'select_breach', choice })
    return
  }
  if (breachDecision?.kind === 'select_exhaust_breach') {
    const choice = breachDecision.candidates.find(candidate =>
      candidate.playerId === player.value.id && candidate.breachIndex === b.index)
    if (choice) resolveDecision({ kind: 'select_exhaust_breach', choice })
    return
  }
  if (isMandatoryPreppedEffect(b)) {
    return
  }
  if (state.game?.pendingDecision) return
  if (isCastableBreach(b)) { castSpell(b.index); return }
}

function confirmMandatoryPreppedEffect(b: BreachState) {
  if (b.present === false) return
  if (!isMandatoryPreppedEffect(b)) return
  resolveDecision({ kind: 'confirm_prepped_effect', accepted: true })
}

function clickSpellFrame(b: BreachState, spellIndex: number) {
  if (b.present === false) return
  if (suppressSpellClick.value) {
    suppressSpellClick.value = false
    return
  }
  const pendingChoice = pendingPreppedSpellChoice(b, spellIndex)
  if (pendingChoice) {
    togglePendingPreppedSpell(pendingChoice)
    return
  }
  const castChoice = preppedSpellCastChoice(b, spellIndex)
  if (castChoice) {
    resolveDecision({ kind: 'select_prepped_spell', choice: castChoice })
    return
  }
  if (isMandatoryPreppedEffect(b, spellIndex)) {
    confirmMandatoryPreppedEffect(b)
    return
  }
  if (isRepeatablePreppedSpell(b, spellIndex) && !isPreppedSpellAction(b, spellIndex)) {
    return
  }
  if (isPreppedSpellAction(b, spellIndex)) {
    activatePreppedSpellAction(b.index, spellIndex)
    return
  }
  if (isCastableBreach(b)) castSpell(b.index, spellIndex)
}
</script>

<template>
  <div class="player-area">
    <div
      v-if="draggingSpell && draggedSpellId"
      class="spell-drag-preview"
      :style="{ left: `${dragPosition.x}px`, top: `${dragPosition.y}px` }"
    >
      <img
        v-if="draggedSpellPreviewUrl"
        :src="draggedSpellPreviewUrl"
        :alt="getCard(draggedSpellId).name"
        draggable="false"
      />
      <span v-else>{{ getCard(draggedSpellId).name }}</span>
    </div>
    <div class="char-row"></div>

    <div class="breaches">
      <div
        v-for="b in player.breaches" :key="b.index"
        class="breach"
        :class="{
          absent: b.present === false,
          open: b.opened,
          castable: isCastableBreach(b),
          'must-cast': isMustCastBreach(b),
          'drag-target': draggingSpell && (draggedPreppedSpell ? canMovePreppedTo(b) : canPrep(b)),
          'move-drag-target': draggingSpell && !!draggedPreppedSpell && canMovePreppedTo(b),
          'mandatory-prepped-effect': isMandatoryPreppedEffect(b),
        }"
        @click="clickBreach(b)"
        :data-breach-index="b.index"
      >
        <template v-if="b.present !== false">
        <div class="breach-token-wrap" :class="{ 'decision-breach-target': isDecisionBreachTarget(b) }">
          <img
            class="breach-token"
            :src="breachImageUrl(b)"
            :alt="`Breach ${toRoman(b.index)} ${b.opened ? 'open' : 'closed'}`"
            :style="{ transform: `rotate(${breachRotation(b)}deg)` }"
            draggable="false"
          />
          <CardHoverPreview
            :image-url="breachImageUrl(b)"
            :image-alt="`Breach ${toRoman(b.index)} ${b.opened ? 'open' : 'closed'}`"
            :image-rotation="breachRotation(b)"
            :preview-width="315"
            :preview-height="315"
            :disabled="draggedSpellId !== null"
            image-object-fit="fill"
            preview-class="breach-preview"
          >
            <span class="breach-hover-target" aria-hidden="true"></span>
          </CardHoverPreview>
          <div
            v-for="(spellId, spellIndex) in b.prepSpells"
            :key="`${spellId}:${spellIndex}`"
            class="spell"
            :style="{ '--spell-stack-index': spellIndex, zIndex: spellIndex + 3 }"
            :class="{
              'castable-spell': isCastableBreach(b),
              'must-cast-spell': isMustCastBreach(b),
              'mandatory-prepped-effect': isMandatoryPreppedEffect(b, spellIndex),
              'ability-prepped-spell': !!preppedSpellCastChoice(b, spellIndex),
              'pending-prepped-spell': !!pendingPreppedSpellChoice(b, spellIndex),
                  'pending-prepped-spell-selected': !!pendingPreppedSpellChoice(b, spellIndex) && isPendingPreppedSpellSelected(pendingPreppedSpellChoice(b, spellIndex)!),
                  'pending-cast-spell': pendingCastSpell(b, spellIndex),
                  'manual-prepped-action': isPreppedSpellAction(b, spellIndex),
                  'repeatable-prepped-action': isRepeatablePreppedSpell(b, spellIndex),
                }"
          >
            <CardHoverPreview :card-id="spellId" :image-url="isFaceDownPreppedSpell(b, spellIndex) ? cardImageUrl(spellId) : undefined">
              <div
                class="breach-spell-card-frame"
                @click.stop="clickSpellFrame(b, spellIndex)"
                @pointerdown="startPreppedSpellDrag(b, spellIndex, $event)"
                :data-spell-index="spellIndex"
                :class="{
                  'dragging-prepped-spell': isDraggedPreppedSpell(b, spellIndex),
                  'castable-spell': isCastableBreach(b),
                  'must-cast-spell': isMustCastBreach(b),
                  'mandatory-prepped-effect': isMandatoryPreppedEffect(b, spellIndex),
                  'ability-prepped-spell': !!preppedSpellCastChoice(b, spellIndex),
                  'pending-prepped-spell': !!pendingPreppedSpellChoice(b, spellIndex),
                  'pending-prepped-spell-selected': !!pendingPreppedSpellChoice(b, spellIndex) && isPendingPreppedSpellSelected(pendingPreppedSpellChoice(b, spellIndex)!),
                  'pending-cast-spell': pendingCastSpell(b, spellIndex),
                  'manual-prepped-action': isPreppedSpellAction(b, spellIndex),
                  'repeatable-prepped-action': isRepeatablePreppedSpell(b, spellIndex),
                  'repositionable-spell': canRepositionPrepped && !state.game?.pendingDecision,
                }"
              >
                <img v-if="isFaceDownPreppedSpell(b, spellIndex)" :src="playerCardBackUrl()" alt="Face-down conjured spell" />
                <img v-else-if="cardImageUrl(spellId)" :src="cardImageUrl(spellId)" :alt="getCard(spellId).name" />
                <span v-else>[{{ getCard(spellId).name }}]</span>
                <span
                  v-if="spellDamagePreviewLabel(b, spellIndex) !== null"
                  class="spell-damage-badge"
                  :class="{ 'spell-damage-badge-hover': !pendingCastSpell(b, spellIndex), 'spell-damage-badge-active': pendingCastSpell(b, spellIndex) }"
                  :aria-label="`Upcoming damage: ${spellDamagePreviewLabel(b, spellIndex)}`"
                >
                  {{ spellDamagePreviewLabel(b, spellIndex) }}
                </span>
              </div>
            </CardHoverPreview>
          </div>
        </div>
        <div v-if="canActMain && !b.opened" class="btns" @click.stop>
          <button class="btn small" @click="focusBreach(b.index)">Focus {{ breachCosts(b).focus }}</button>
          <button class="btn small" @click="openBreach(b.index)">Open {{ breachCosts(b).open }}</button>
        </div>
        </template>
      </div>
    </div>

    <div class="played-zones" :class="{ 'has-swap-zone': hasSwapZone, 'has-develop-zone': hasDevelopZone }">
      <section v-if="hasSwapZone" class="played-zone played-zone-swap">
        <span class="label">Swap Zone</span>
        <ZoneScroller class="zone-card-scroll">
          <div class="zone-card-track">
            <CardHoverPreview
              v-for="(cid, i) in swapZoneCards" :key="`swap-${cid}-${i}`"
              :card-id="cid"
            >
              <CardSurface
                :card-id="cid"
                size="mini"
                :class="[typeClass(cid), {
                  'pending-board-card': !!boardCardChoice('swap_zone', i, cid),
                  'pending-board-card-selected': !!boardCardChoice('swap_zone', i, cid) && isPendingBoardCardSelected(boardCardChoice('swap_zone', i, cid)!),
                }]"
                @click="clickSwapZoneCard(i)"
              />
            </CardHoverPreview>
            <span v-if="swapZoneCards.length === 0" class="empty">— empty —</span>
          </div>
        </ZoneScroller>
      </section>

      <section class="played-zone played-zone-center">
        <span class="label">Played</span>
        <ZoneScroller
          class="played-card-scroll"
          :overflow-anchor="hasDevelopZone && !hasSwapZone ? 'end' : 'start'"
        >
          <div class="zone-card-track">
            <template v-if="isDiscard">
              <CardHoverPreview
                v-for="(cid, i) in state.discardRemaining" :key="`discard-slot-${i}`"
                :card-id="cid"
              >
                <CardSurface
                  :card-id="cid"
                  size="mini"
                  class="clickable"
                  :class="typeClass(cid)"
                  @click="clickDiscardCard(i)"
                />
              </CardHoverPreview>
              <span v-if="state.discardRemaining.length === 0" class="empty">— done —</span>
            </template>
            <template v-else>
              <CardHoverPreview
                v-for="(cid, i) in player.playedThisTurn" :key="cid + i"
                :card-id="cid"
              >
                <CardSurface
                  :card-id="cid"
                  size="mini"
                  :class="[typeClass(cid), {
                    'prepped-action': isPreppedActionCard(i, cid),
                    'pending-board-card': !!boardCardChoice('played_this_turn', i, cid),
                    'pending-board-card-selected': !!boardCardChoice('played_this_turn', i, cid) && isPendingBoardCardSelected(boardCardChoice('played_this_turn', i, cid)!),
                  }]"
                  @click="clickPlayedCard(i)"
                />
              </CardHoverPreview>
              <span v-if="player.playedThisTurn.length === 0" class="empty">— none —</span>
            </template>
          </div>
        </ZoneScroller>
      </section>

      <section v-if="hasDevelopZone" class="played-zone played-zone-develop">
        <span class="label">Develop Zone</span>
        <ZoneScroller class="zone-card-scroll">
          <div class="zone-card-track">
            <CardHoverPreview
              v-for="(cid, i) in developZoneCards" :key="`develop-${cid}-${i}`"
              :card-id="cid"
            >
              <CardSurface :card-id="cid" size="mini" :class="typeClass(cid)" />
            </CardHoverPreview>
            <span v-if="developZoneCards.length === 0" class="empty">— empty —</span>
          </div>
        </ZoneScroller>
      </section>
    </div>

    <div
      class="hand-row"
      :class="{
        'has-specific-deck': hasSpecificDeck,
        'has-player-cards-in-play': hasPlayerCardsInPlay,
      }"
    >
      <MageBoard :mage-type="player.mageType" />
      <div
        v-if="hasSpecificDeck"
        class="deck-pile clickable player-specific-deck-pile"
        :class="{ 'has-cards': specificDeckCards.length > 0 }"
        :aria-label="`Open ${specificDeckName}`"
        @click="openSpecificDeckPile"
      >
        <CardSurface
          v-if="specificDeckCards.length > 0 && specificDeckBackImage"
          base-class="player-pile-card"
          size="pile"
          class="specific-deck-back"
          :image-url="specificDeckBackImage"
          :image-alt="specificDeckName"
        />
        <PileCountBadge :count="specificDeckCards.length" label="Specific" />
      </div>
      <div
        v-if="hasPlayerCardsInPlay"
        class="player-cards-in-play-pile"
        aria-label="Player cards in play"
      >
        <div class="player-card-stack">
          <CardHoverPreview
            v-for="(placement, i) in playerCardPlacementsInPlay"
            :key="`player-in-play-${placement.cardId}-${placement.cardIndex}`"
            :card-id="placement.cardId"
          >
            <CardSurface
              :card-id="placement.cardId"
              size="mini"
              class="player-in-play-card"
              :class="[typeClass(placement.cardId), {
                'in-play-action': playerCardsInPlay.length === 1 && isPlayerCardInPlayAction(i, placement.cardId),
              }]"
              :style="{ '--stack-index': i }"
              @click="clickPlayerCardInPlay(i)"
            >
              <template #overlay>
                <TokenBadge
                  v-if="playerCardPowerTokens(i) > 0"
                  label="Power"
                  :count="playerCardPowerTokens(i)"
                  tone="power"
                  placement="card"
                />
              </template>
            </CardSurface>
          </CardHoverPreview>
        </div>
      </div>
      <div
        class="deck-pile clickable player-deck-pile"
        :class="{ 'has-cards': player.deck.length > 0 }"
        @click="openPile('deck')"
      >
        <CardSurface
          v-if="player.deck.length > 0"
          base-class="player-pile-card"
          size="pile"
          :image-url="playerCardBackUrl()"
          image-alt="Player deck"
        />
        <PileCountBadge :count="player.deck.length" label="Deck" />
      </div>
      <div ref="handElement" class="hand" :style="{ '--hand-offset': `${handOffset}px` }" @wheel="handleHandWheel">
        <CardHoverPreview
          v-for="(cid, i) in player.hand" :key="cid + i"
          :card-id="cid"
        >
          <CardSurface
            :card-id="cid"
            size="hand"
            :class="[typeClass(cid), {
              dragging: draggingSpell && draggedSpellIndex === i,
              'spell-draggable': canActMain && getCard(cid).type === 'spell',
              'pending-board-card': !!boardCardChoice('hand', i, cid),
              'pending-board-card-selected': !!boardCardChoice('hand', i, cid) && isPendingBoardCardSelected(boardCardChoice('hand', i, cid)!),
            }]"
            @click="clickHand(i)"
            draggable="false"
            @pointerdown="startSpellPointerDrag(i, $event)"
          />
        </CardHoverPreview>
      </div>
      <div
        class="discard-pile clickable player-discard-pile"
        :class="{ 'has-cards': player.discard.length > 0 }"
        @click="openPile('discard')"
        @contextmenu.prevent="openPile('discard')"
      >
        <CardHoverPreview v-if="discardTopCard" :card-id="discardTopCard">
          <CardSurface
            base-class="player-pile-card"
            size="pile"
            class="player-discard-top-card"
            :card-id="discardTopCard"
            :image-alt="getCard(discardTopCard).name"
          />
        </CardHoverPreview>
        <PileCountBadge :count="player.discard.length" label="Discard" />
      </div>
    </div>

    <div class="controls">
      <div class="controls-left">
        <div class="char-select">
          <button
            v-for="candidate in players"
            :key="candidate.id"
            class="char-btn"
            :class="{ sel: state.selectedPlayer === candidate.id, cur: state.game!.currentTurn === candidate.id }"
            @click="selectPlayer(candidate.id)"
          >
            <span class="cn">{{ candidate.mageType }}</span>
            <span class="chp">HP {{ candidate.hp }}</span>
            <span class="cch">Charge {{ candidate.charge }}/{{ candidate.chargeThreshold }}</span>
            <span v-if="candidate.exhausted" class="cex">EXHAUSTED</span>
          </button>
        </div>
        <div class="controls-status">
          <span class="turn">{{ player.mageType }}</span>
          <span class="phase">{{ phaseLabel }}</span>
        </div>
      </div>
      <div class="controls-main">
        <span class="aether">
          Aether {{ aether.regularAvail }}<template v-if="aether.gemAether > 0"> · {{ aether.gemAether }} gem aether</template><template v-if="aether.spellAether > 0"> · {{ aether.spellAether }} spell aether</template>
        </span>
        <TokenBadge
          v-if="aether.aetherTokens > 0"
          class="aether-token-status"
          label="Aether Token"
          :count="aether.aetherTokens"
          tone="aether"
        />
        <template v-if="isCurrentSelected">
          <button v-if="isCasting" class="btn" @click="toMainPhase">Start Main Phase →</button>
          <template v-if="isMain">
            <button class="btn small" :disabled="player.charge >= player.chargeThreshold" @click="gainCharge(1)">Charge</button>
            <button class="btn small" @click="playAllGems">Play All Gems</button>
            <span ref="endTurnActionElement" class="end-turn-action">
              <button class="btn primary" @click="handleEndTurn">End Turn</button>
              <span v-if="state.endTurnWarningVisible" class="end-turn-warning" role="status">
                Actions remain. End turn anyway?
              </span>
            </span>
          </template>
        </template>
        <button
          v-if="isMain && canActivateAbilityInMain"
          class="btn small"
          :disabled="!ready || (abilityNeedsPreppedSpell && !hasPreppedSpell)"
          @click="activateAbility()"
        >Activate Ability</button>
      </div>
      <button class="btn help-button" aria-label="Open game help" title="Game Help" @click="toggleHelp">?</button>
    </div>
  </div>
</template>
