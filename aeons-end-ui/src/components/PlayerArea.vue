<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue'
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
const draggedSpellId = ref<string | null>(null)
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
    nemesis_target: 'Nemesis Turn · Target Selection',
    gameover: 'Game Over',
  }[state.phase])
})

const DIR: Record<string, string> = { east: '→', south: '↓', west: '←', north: '↑' }

const canPrep = (b: BreachState) =>
  state.prepTarget !== null && canActMain.value && !b.prepSpell && (b.opened || b.focusedThisTurn)

const isMustCastBreach = (b: BreachState) =>
  canCast.value && !state.game?.pendingDecision && !!b.prepSpell && getCastableSpells(state.game!, player.value.id)
    .some((spell) => spell.breachIndex === b.index && spell.mustCast)

const isCastableBreach = (b: BreachState) =>
  canCast.value && !state.game?.pendingDecision && !!b.prepSpell

const isMandatoryPreppedEffect = (b: BreachState) => {
  const decision = state.game?.pendingDecision
  return decision?.kind === 'confirm_prepped_effect'
    && decision.cardId === b.prepSpell
    && decision.breachIndex === b.index
}

const abilityPreppedSpellChoice = (b: BreachState) => {
  const decision = state.game?.pendingDecision
  if (decision?.kind !== 'select_prepped_spell' || !b.prepSpell) return null
  return decision.candidates.find(choice =>
    choice.playerId === player.value.id &&
    choice.breachIndex === b.index &&
    choice.cardId === b.prepSpell,
  ) ?? null
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
  if (isMandatoryPreppedEffect(b)) {
    return
  }
  if (state.game?.pendingDecision) return
  if (isCastableBreach(b)) { castSpell(b.index); return }
  if (canPrep(b)) { prepSpell(state.prepTarget!, b.index) }
}

function confirmMandatoryPreppedEffect(b: BreachState) {
  if (!isMandatoryPreppedEffect(b)) return
  resolveDecision({ kind: 'confirm_prepped_effect', accepted: true })
}

function clickSpellFrame(b: BreachState) {
  const abilityChoice = abilityPreppedSpellChoice(b)
  if (abilityChoice) {
    resolveDecision({ kind: 'select_prepped_spell', choice: abilityChoice })
    return
  }
  if (isMandatoryPreppedEffect(b)) {
    confirmMandatoryPreppedEffect(b)
    return
  }
  if (isCastableBreach(b)) castSpell(b.index)
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
          open: b.opened,
          castable: isCastableBreach(b),
          'must-cast': isMustCastBreach(b),
          'prep-ok': canPrep(b),
          'drag-target': draggingSpell && canPrep(b),
          'mandatory-prepped-effect': isMandatoryPreppedEffect(b),
        }"
        @click="clickBreach(b)"
        :data-breach-index="b.index"
      >
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
            v-if="b.prepSpell"
            class="spell"
            :class="{
              'castable-spell': isCastableBreach(b),
              'must-cast-spell': isMustCastBreach(b),
              'mandatory-prepped-effect': isMandatoryPreppedEffect(b),
              'ability-prepped-spell': !!abilityPreppedSpellChoice(b),
            }"
          >
            <CardHoverPreview :card-id="b.prepSpell">
              <div
                class="breach-spell-card-frame"
                @click.stop="clickSpellFrame(b)"
                :class="{
                  'castable-spell': isCastableBreach(b),
                  'must-cast-spell': isMustCastBreach(b),
                  'mandatory-prepped-effect': isMandatoryPreppedEffect(b),
                  'ability-prepped-spell': !!abilityPreppedSpellChoice(b),
                }"
              >
                <img v-if="cardImageUrl(b.prepSpell)" :src="cardImageUrl(b.prepSpell)" :alt="getCard(b.prepSpell).name" />
                <span v-else>[{{ getCard(b.prepSpell).name }}]</span>
              </div>
            </CardHoverPreview>
          </div>
        </div>
        <div v-if="canActMain && !b.opened" class="btns" @click.stop>
          <button class="btn small" @click="focusBreach(b.index)">Focus {{ breachCosts(b).focus }}</button>
          <button class="btn small" @click="openBreach(b.index)">Open {{ breachCosts(b).open }}</button>
        </div>
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
      <div class="hand">
        <CardHoverPreview
          v-for="(cid, i) in player.hand" :key="cid + i"
          :card-id="cid"
        >
          <div class="card" :class="[typeClass(cid), {
            selected: state.prepTarget === i,
            'card-image': cardImageUrl(cid),
            dragging: draggingSpell && state.prepTarget === i,
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
        <span v-if="player.discard[0]" class="top">{{ getCard(player.discard[0]).name }}</span>
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
            <button class="btn small" @click="playAllGems">Play All Gems</button>
            <button class="btn small" :disabled="player.charge >= player.chargeThreshold" @click="gainCharge(1)">Charge</button>
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
