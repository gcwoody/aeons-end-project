<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue'
import { getPlayer, getCastableSpells, toRoman } from '@engine/engine'
import { getCard } from '@engine/data'
import { cardImageUrl } from '../card-images'
import type { BreachState } from '@engine/types'
import { useGame } from '../game/useGame'

const {
  state, displayPlayer, isCurrentSelected, canActMain, canCast,
  aetherInfo, prepSpell, focusBreach, openBreach, gainCharge, activateAbility,
  playCard, playAllGems, castSpell, endTurn, toMainPhase,
  selectPlayer, clickDiscardCard, toggleRelicDiscard, openPile,
} = useGame()

const p1 = computed(() => getPlayer(state.game!, 'p1'))
const p2 = computed(() => getPlayer(state.game!, 'p2'))
const player = displayPlayer
const aether = computed(() => aetherInfo(player.value))
const ready = computed(() => player.value.charge >= player.value.chargeThreshold)
const isMain = computed(() => state.phase === 'main')
const isCasting = computed(() => state.phase === 'casting')
const isDiscard = computed(() => state.phase === 'discard_order')
const draggingSpell = ref(false)
const draggedSpellId = ref<string | null>(null)
const dragPosition = ref({ x: 0, y: 0 })
let dragPointerId = -1
let dragStartX = 0
let dragStartY = 0
const relicDrawnStart = computed(() =>
  state.pendingRelic ? player.value.hand.length - state.pendingRelic.drawn.length : -1,
)

const phaseLabel = computed(() => ({
  setup: 'Setup', casting: 'Casting Phase', main: 'Main Phase',
  discard_order: 'Discard Phase', nemesis_target: 'Nemesis Turn', gameover: 'Game Over',
}[state.phase]))

const DIR: Record<string, string> = { east: '→', south: '↓', west: '←', north: '↑' }

const canPrep = (b: BreachState) =>
  state.prepTarget !== null && canActMain.value && !b.prepSpell && (b.opened || b.focusedThisTurn)

const isMustCastBreach = (b: BreachState) =>
  canCast.value && !!b.prepSpell && getCastableSpells(state.game!, player.value.id)
    .some((spell) => spell.breachIndex === b.index && spell.mustCast)

const typeClass = (cid: string) =>
  getCard(cid).type === 'gem' ? 'gem' : getCard(cid).type === 'relic' ? 'relic' : 'spell'

function cardValue(cid: string): string {
  const c = getCard(cid)
  if (c.type === 'gem') return `+${c.aetherValue} aether${c.conditionalAether ? ` (+${c.conditionalAether.amount} for gems)` : ''}`
  if (c.type === 'spell') return `Deal ${c.damage} damage${c.bonusAether ? ` +${c.bonusAether} aether` : ''}`
  if (c.type === 'relic') return `Draw ${c.drawCount}, discard ${c.discardCount}`
  return ''
}

function clickHand(i: number) {
  if (!canActMain.value) return
  const cid = player.value.hand[i]
  if (relicDrawnStart.value >= 0 && i >= relicDrawnStart.value) {
    toggleRelicDiscard(i)
    return
  }
  if (state.pendingRelic) return
  if (getCard(cid).type === 'spell') {
    state.prepTarget = state.prepTarget === i ? null : i
  } else {
    playCard(i)
  }
}

function startSpellPointerDrag(i: number, event: PointerEvent) {
  if (event.button !== 0 || !canActMain.value || getCard(player.value.hand[i]).type !== 'spell') return
  state.prepTarget = i
  draggedSpellId.value = player.value.hand[i]!
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
  if (distance > 5) draggingSpell.value = true
  if (draggingSpell.value) event.preventDefault()
}

function finishSpellPointerDrag(event: PointerEvent) {
  if (event.pointerId !== dragPointerId) return
  const wasDragging = draggingSpell.value
  const target = document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLElement>('[data-breach-index]')
  const breachIndex = target ? Number(target.dataset.breachIndex) : NaN
  removeSpellPointerListeners()
  draggingSpell.value = false
  draggedSpellId.value = null
  if (wasDragging) {
    const breach = player.value.breaches.find((item) => item.index === breachIndex)
    if (state.prepTarget !== null && breach && canPrep(breach)) prepSpell(state.prepTarget, breach.index)
    else state.prepTarget = null
  }
}

function cancelSpellPointerDrag() {
  removeSpellPointerListeners()
  draggingSpell.value = false
  draggedSpellId.value = null
  state.prepTarget = null
}

function removeSpellPointerListeners() {
  window.removeEventListener('pointermove', handleSpellPointerMove)
  window.removeEventListener('pointerup', finishSpellPointerDrag)
  window.removeEventListener('pointercancel', cancelSpellPointerDrag)
  dragPointerId = -1
}

onBeforeUnmount(removeSpellPointerListeners)

function clickBreach(b: BreachState) {
  if (canCast.value && b.prepSpell) { castSpell(b.index); return }
  if (canPrep(b)) { prepSpell(state.prepTarget!, b.index) }
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
    <div class="char-row">
      <div class="char-select">
        <button
          class="char-btn" :class="{ sel: state.selectedPlayer === 'p1', cur: state.game!.currentTurn === 'p1' }"
          @click="selectPlayer('p1')"
        >
          <span class="cn">{{ p1.mageType }}</span>
          <span class="chp">HP {{ p1.hp }}</span>
          <span class="cch">⚡{{ p1.charge }}/{{ p1.chargeThreshold }}</span>
          <span v-if="p1.exhausted" class="cex">EXHAUSTED</span>
        </button>
        <button
          class="char-btn" :class="{ sel: state.selectedPlayer === 'p2', cur: state.game!.currentTurn === 'p2' }"
          @click="selectPlayer('p2')"
        >
          <span class="cn">{{ p2.mageType }}</span>
          <span class="chp">HP {{ p2.hp }}</span>
          <span class="cch">⚡{{ p2.charge }}/{{ p2.chargeThreshold }}</span>
          <span v-if="p2.exhausted" class="cex">EXHAUSTED</span>
        </button>
      </div>
      <div class="phase-line">
        <span class="turn">{{ state.game!.currentTurn.toUpperCase() }}</span>
        <span class="phase">{{ phaseLabel }}</span>
      </div>
    </div>

    <div class="breaches">
      <div
        v-for="b in player.breaches" :key="b.index"
        class="breach"
        :class="{
          open: b.opened,
          castable: canCast && b.prepSpell,
          'must-cast': isMustCastBreach(b),
          'prep-ok': canPrep(b),
          'drag-target': draggingSpell && canPrep(b),
        }"
        @click="clickBreach(b)"
        :data-breach-index="b.index"
      >
        <div class="roman">{{ toRoman(b.index) }}</div>
        <div v-if="b.prepSpell" class="spell">
          <img v-if="cardImageUrl(b.prepSpell)" :src="cardImageUrl(b.prepSpell)" :alt="getCard(b.prepSpell).name" />
          <span v-else>[{{ getCard(b.prepSpell).name }}]</span>
        </div>
        <div v-else-if="b.opened" class="spell open-label">Open</div>
        <div v-else class="dir">{{ DIR[b.focusDirection] }} · focus {{ b.focusCost }}a · open {{ b.openCost[b.focusDirection] }}a</div>
        <div v-if="b.index >= 3" class="breach-bonus">Once Opened: +1 Damage on Cast</div>
        <div v-if="canActMain && !b.opened" class="btns" @click.stop>
          <button class="btn small" @click="focusBreach(b.index)">Focus</button>
          <button class="btn small" @click="openBreach(b.index)">Open</button>
        </div>
      </div>
    </div>

    <div class="played-row">
      <span class="label">Played</span>
      <template v-if="isDiscard">
        <div
          v-for="(cid, i) in state.discardRemaining" :key="cid + i"
          class="card small clickable" :class="[typeClass(cid), { 'card-image': cardImageUrl(cid) }]"
          @click="clickDiscardCard(cid)"
        >
          <img v-if="cardImageUrl(cid)" :src="cardImageUrl(cid)" :alt="getCard(cid).name" />
          <div v-else class="cname">{{ getCard(cid).name }}</div>
        </div>
        <span v-if="state.discardRemaining.length === 0" class="empty">— done —</span>
      </template>
      <template v-else>
        <div
          v-for="(cid, i) in player.playedThisTurn" :key="cid + i"
          class="card small" :class="[typeClass(cid), { 'card-image': cardImageUrl(cid) }]"
        >
          <img v-if="cardImageUrl(cid)" :src="cardImageUrl(cid)" :alt="getCard(cid).name" />
          <div v-else class="cname">{{ getCard(cid).name }}</div>
        </div>
        <span v-if="player.playedThisTurn.length === 0" class="empty">— none —</span>
      </template>
    </div>

    <div class="hand-row">
      <div class="deck-pile clickable" @click="openPile('deck')">
        <span class="label">Deck</span>
        <span class="count">{{ player.deck.length }}</span>
      </div>
      <div class="hand">
        <div
          v-for="(cid, i) in player.hand" :key="cid + i"
          class="card" :class="[typeClass(cid), {
            selected: state.prepTarget === i,
            'card-image': cardImageUrl(cid),
            'relic-discardable': relicDrawnStart >= 0 && i >= relicDrawnStart,
            'relic-discard-selected': relicDrawnStart >= 0 && state.pendingRelic?.selected.includes(i - relicDrawnStart),
            dragging: draggingSpell && state.prepTarget === i,
            'spell-draggable': canActMain && !state.pendingRelic && getCard(cid).type === 'spell',
          }]"
          @click="clickHand(i)"
          draggable="false"
          @pointerdown="startSpellPointerDrag(i, $event)"
        >
          <img v-if="cardImageUrl(cid)" :src="cardImageUrl(cid)" :alt="getCard(cid).name" draggable="false" />
          <template v-else>
            <div class="cname">{{ getCard(cid).name }}</div>
            <div class="cval">{{ cardValue(cid) }}</div>
          </template>
        </div>
      </div>
      <div class="discard-pile clickable" @click="openPile('discard')">
        <span class="label">Discard</span>
        <span class="count">{{ player.discard.length }}</span>
        <span v-if="player.discard[0]" class="top">{{ getCard(player.discard[0]).name }}</span>
      </div>
    </div>

    <div class="controls">
      <span class="aether">Aether {{ aether.available }}/{{ aether.total }} ({{ aether.regularAvail }} regular)</span>
      <template v-if="isCurrentSelected">
        <button v-if="isCasting" class="btn" @click="toMainPhase">Start Main Phase →</button>
        <template v-if="isMain">
          <button class="btn small" @click="playAllGems">Play All Gems</button>
          <button class="btn small" :disabled="player.charge >= player.chargeThreshold" @click="gainCharge(1)">Charge +1 (2a)</button>
          <button class="btn small" :disabled="!ready" @click="activateAbility()">Activate Ability</button>
          <button class="btn primary" @click="endTurn">End Turn</button>
        </template>
      </template>
    </div>
  </div>
</template>
