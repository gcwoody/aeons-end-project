<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { getPlayer, getCastableSpells, getBreachActionCosts, getPreppedSpellChoices, toRoman } from '@engine/engine'
import { getCard, MAGES } from '@engine/data'
import { cardImageUrl } from '../card-images'
import type { BreachState } from '@engine/types'
import { useGame } from '../game/useGame'
import CardHoverPreview from './CardHoverPreview.vue'
import { breachImageUrl, breachRotation } from '../breach-images'
import MageBoard from './MageBoard.vue'

const {
  state, displayPlayer, isCurrentSelected, canActMain, canCast,
  canActivateAbilityInMain,
  aetherInfo, prepSpell, focusBreach, openBreach, gainCharge, activateAbility,
  activatePreppedCardAction, preppedCardActions,
  isPendingPreppedSpellSelected, togglePendingPreppedSpell,
  playCard, playAllGems, castSpell, endTurn, toMainPhase,
  selectPlayer, clickDiscardCard, openPile, resolveDecision, toggleHelp,
} = useGame()

const p1 = computed(() => getPlayer(state.game!, 'p1'))
const p2 = computed(() => getPlayer(state.game!, 'p2'))
const player = displayPlayer
const aether = computed(() => aetherInfo(player.value))
const ready = computed(() => player.value.charge >= player.value.chargeThreshold)
const hasPreppedSpell = computed(() => !!state.game && getPreppedSpellChoices(state.game).length > 0)
const abilityNeedsPreppedSpell = computed(() =>
  MAGES[player.value?.mageType ?? '']?.abilityEffects.some(effect => effect.kind === 'cast_prepped_spell') ?? false,
)
const isMain = computed(() => state.phase === 'main')
const isCasting = computed(() => state.phase === 'casting')
const isDiscard = computed(() => state.phase === 'discard_order')
const draggingSpell = ref(false)
const handElement = ref<HTMLElement | null>(null)
const handOffset = ref(0)
const draggedSpellId = ref<string | null>(null)
const draggedSpellIndex = ref<number | null>(null)
const dragPosition = ref({ x: 0, y: 0 })
let dragPointerId = -1
let dragStartX = 0
let dragStartY = 0
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
    nemesis_target: 'Nemesis Turn · Target Selection',
    gameover: 'Game Over',
  }[state.phase])
})

const DIR: Record<string, string> = { east: '→', south: '↓', west: '←', north: '↑' }

const canPrep = (b: BreachState) =>
  b.present !== false && canActMain.value
    && b.prepSpells.length < player.value.turnEffects.prepSpellLimit
    && (b.opened || b.focusedThisTurn)

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

const abilityPreppedSpellChoice = (b: BreachState, spellIndex = 0) => {
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

const typeClass = (cid: string) =>
  getCard(cid).type === 'gem' ? 'gem' : getCard(cid).type === 'relic' ? 'relic' : 'spell'

function breachCosts(b: BreachState) {
  return getBreachActionCosts(state.game!, player.value.id, b.index) ?? { focus: 0, open: 0 }
}

function isPreppedActionCard(index: number, cardId: string): boolean {
  return preppedCardActions.value.some(action =>
    action.choices.some(choice =>
      choice.zone === 'played_this_turn' && choice.index === index && choice.cardId === cardId))
}

function clickPlayedCard(index: number) {
  if (!canActMain.value) return
  const cardId = player.value.playedThisTurn[index]
  if (!cardId || !isPreppedActionCard(index, cardId)) return
  activatePreppedCardAction({
    zone: 'played_this_turn', index, cardId, cardName: getCard(cardId).name,
  })
}

function clickHand(i: number) {
  if (!canActMain.value) return
  const cid = player.value.hand[i]
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
  if (hand !== handElement.value || hand.scrollWidth <= hand.clientWidth || event.deltaY === 0) return
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
  if (event.button !== 0 || !canActMain.value || getCard(player.value.hand[i]).type !== 'spell') return
  state.prepTarget = null
  draggedSpellId.value = player.value.hand[i]!
  draggedSpellIndex.value = i
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
    draggingSpell.value = true
  }
  if (draggingSpell.value) event.preventDefault()
}

function finishSpellPointerDrag(event: PointerEvent) {
  if (event.pointerId !== dragPointerId) return
  const wasDragging = draggingSpell.value
  const spellIndex = draggedSpellIndex.value
  // The breach hover preview is rendered in a top-level layer and can cover
  // the actual breach at release time. Use the breach rectangles directly so
  // the drag target remains reliable regardless of the preview z-index.
  const target = [...document.querySelectorAll<HTMLElement>('[data-breach-index]')]
    .find((element) => {
      const rect = element.getBoundingClientRect()
      return event.clientX >= rect.left && event.clientX <= rect.right
        && event.clientY >= rect.top && event.clientY <= rect.bottom
    })
  const breachIndex = target ? Number(target.dataset.breachIndex) : NaN
  removeSpellPointerListeners()
  draggingSpell.value = false
  draggedSpellId.value = null
  draggedSpellIndex.value = null
  if (wasDragging) {
    const breach = player.value.breaches.find((item) => item.index === breachIndex)
    if (spellIndex !== null && breach && canPrep(breach)) prepSpell(spellIndex, breach.index)
  }
}

function cancelSpellPointerDrag() {
  removeSpellPointerListeners()
  draggingSpell.value = false
  draggedSpellId.value = null
  draggedSpellIndex.value = null
  state.prepTarget = null
}

function removeSpellPointerListeners() {
  window.removeEventListener('pointermove', handleSpellPointerMove)
  window.removeEventListener('pointerup', finishSpellPointerDrag)
  window.removeEventListener('pointercancel', cancelSpellPointerDrag)
  dragPointerId = -1
}

onBeforeUnmount(removeSpellPointerListeners)
onMounted(() => {
  window.addEventListener('resize', updateHandAlignment)
  if (handElement.value && typeof ResizeObserver !== 'undefined') {
    handResizeObserver = new ResizeObserver(updateHandAlignment)
    handResizeObserver.observe(handElement.value)
  }
  nextTick(updateHandAlignment)
})
watch(() => player.value?.hand.length, () => nextTick(updateHandAlignment))
watch(() => state.selectedPlayer, () => nextTick(updateHandAlignment))
onBeforeUnmount(() => {
  window.removeEventListener('resize', updateHandAlignment)
  handResizeObserver?.disconnect()
  if (handAlignmentFrame !== null) cancelAnimationFrame(handAlignmentFrame)
  if (handScrollFrame !== null) cancelAnimationFrame(handScrollFrame)
})

function clickBreach(b: BreachState) {
  if (b.present === false) return
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
  const pendingChoice = pendingPreppedSpellChoice(b, spellIndex)
  if (pendingChoice) {
    togglePendingPreppedSpell(pendingChoice)
    return
  }
  const abilityChoice = abilityPreppedSpellChoice(b, spellIndex)
  if (abilityChoice) {
    resolveDecision({ kind: 'select_prepped_spell', choice: abilityChoice })
    return
  }
  if (isMandatoryPreppedEffect(b, spellIndex)) {
    confirmMandatoryPreppedEffect(b)
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
        v-if="cardImageUrl(draggedSpellId)"
        :src="cardImageUrl(draggedSpellId)"
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
          'drag-target': draggingSpell && canPrep(b),
          'mandatory-prepped-effect': isMandatoryPreppedEffect(b),
        }"
        @click="clickBreach(b)"
        :data-breach-index="b.index"
      >
        <template v-if="b.present !== false">
        <div class="breach-token-wrap">
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
              'ability-prepped-spell': !!abilityPreppedSpellChoice(b, spellIndex),
              'pending-prepped-spell': !!pendingPreppedSpellChoice(b, spellIndex),
              'pending-prepped-spell-selected': !!pendingPreppedSpellChoice(b, spellIndex) && isPendingPreppedSpellSelected(pendingPreppedSpellChoice(b, spellIndex)!),
              'pending-cast-spell': pendingCastSpell(b, spellIndex),
            }"
          >
            <CardHoverPreview :card-id="spellId">
              <div
                class="breach-spell-card-frame"
                @click.stop="clickSpellFrame(b, spellIndex)"
                :class="{
                  'castable-spell': isCastableBreach(b),
                  'must-cast-spell': isMustCastBreach(b),
                  'mandatory-prepped-effect': isMandatoryPreppedEffect(b, spellIndex),
                  'ability-prepped-spell': !!abilityPreppedSpellChoice(b, spellIndex),
                  'pending-prepped-spell': !!pendingPreppedSpellChoice(b, spellIndex),
                  'pending-prepped-spell-selected': !!pendingPreppedSpellChoice(b, spellIndex) && isPendingPreppedSpellSelected(pendingPreppedSpellChoice(b, spellIndex)!),
                  'pending-cast-spell': pendingCastSpell(b, spellIndex),
                }"
              >
                <img v-if="cardImageUrl(spellId)" :src="cardImageUrl(spellId)" :alt="getCard(spellId).name" />
                <span v-else>[{{ getCard(spellId).name }}]</span>
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

    <div class="played-row">
      <span class="label">Played</span>
      <template v-if="isDiscard">
        <CardHoverPreview
          v-for="(cid, i) in state.discardRemaining" :key="cid + i"
          :card-id="cid"
        >
          <div class="card small clickable" :class="[typeClass(cid), { 'card-image': cardImageUrl(cid) }]" @click="clickDiscardCard(cid)">
            <img v-if="cardImageUrl(cid)" :src="cardImageUrl(cid)" :alt="getCard(cid).name" />
            <div v-else class="cname">{{ getCard(cid).name }}</div>
          </div>
        </CardHoverPreview>
        <span v-if="state.discardRemaining.length === 0" class="empty">— done —</span>
      </template>
      <template v-else>
        <CardHoverPreview
          v-for="(cid, i) in player.playedThisTurn" :key="cid + i"
          :card-id="cid"
        >
          <div
            class="card small"
            :class="[typeClass(cid), { 'card-image': cardImageUrl(cid), 'prepped-action': isPreppedActionCard(i, cid) }]"
            @click="clickPlayedCard(i)"
          >
            <img v-if="cardImageUrl(cid)" :src="cardImageUrl(cid)" :alt="getCard(cid).name" />
            <div v-else class="cname">{{ getCard(cid).name }}</div>
          </div>
        </CardHoverPreview>
        <span v-if="player.playedThisTurn.length === 0" class="empty">— none —</span>
      </template>
    </div>

    <div class="hand-row">
      <MageBoard :mage-type="player.mageType" />
      <div class="deck-pile clickable" @click="openPile('deck')">
        <span class="label">Deck</span>
        <span class="count">{{ player.deck.length }}</span>
      </div>
      <div ref="handElement" class="hand" :style="{ '--hand-offset': `${handOffset}px` }" @wheel="handleHandWheel">
        <CardHoverPreview
          v-for="(cid, i) in player.hand" :key="cid + i"
          :card-id="cid"
        >
          <div class="card" :class="[typeClass(cid), {
            'card-image': cardImageUrl(cid),
            dragging: draggingSpell && draggedSpellIndex === i,
            'spell-draggable': canActMain && getCard(cid).type === 'spell',
          }]"
          @click="clickHand(i)"
          draggable="false"
          @pointerdown="startSpellPointerDrag(i, $event)">
          <img v-if="cardImageUrl(cid)" :src="cardImageUrl(cid)" :alt="getCard(cid).name" draggable="false" />
          <template v-else>
            <div class="cname">{{ getCard(cid).name }}</div>
          </template>
          </div>
        </CardHoverPreview>
      </div>
      <div class="discard-pile clickable" @click="openPile('discard')">
        <span class="label">Discard</span>
        <span class="count">{{ player.discard.length }}</span>
      </div>
    </div>

    <div class="controls">
      <div class="controls-left">
        <div class="char-select">
          <button
            class="char-btn" :class="{ sel: state.selectedPlayer === 'p1', cur: state.game!.currentTurn === 'p1' }"
            @click="selectPlayer('p1')"
          >
            <span class="cn">{{ p1.mageType }}</span>
            <span class="chp">HP {{ p1.hp }}</span>
            <span class="cch">Charge {{ p1.charge }}/{{ p1.chargeThreshold }}</span>
            <span v-if="p1.exhausted" class="cex">EXHAUSTED</span>
          </button>
          <button
            class="char-btn" :class="{ sel: state.selectedPlayer === 'p2', cur: state.game!.currentTurn === 'p2' }"
            @click="selectPlayer('p2')"
          >
            <span class="cn">{{ p2.mageType }}</span>
            <span class="chp">HP {{ p2.hp }}</span>
            <span class="cch">Charge {{ p2.charge }}/{{ p2.chargeThreshold }}</span>
            <span v-if="p2.exhausted" class="cex">EXHAUSTED</span>
          </button>
        </div>
        <div class="controls-status">
          <span class="turn">{{ player.mageType }}</span>
          <span class="phase">{{ phaseLabel }}</span>
        </div>
      </div>
      <div class="controls-main">
        <span class="aether">
          Aether {{ aether.regularAvail }}<template v-if="aether.gemAether > 0"> · {{ aether.gemAether }} gem aether</template>
        </span>
        <template v-if="isCurrentSelected">
          <button v-if="isCasting" class="btn" @click="toMainPhase">Start Main Phase →</button>
          <template v-if="isMain">
            <button class="btn small" :disabled="player.charge >= player.chargeThreshold" @click="gainCharge(1)">Charge</button>
            <button class="btn small" @click="playAllGems">Play All Gems</button>
            <button class="btn primary" @click="endTurn">End Turn</button>
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
