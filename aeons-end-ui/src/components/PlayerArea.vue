<script setup lang="ts">
import { computed } from 'vue'
import { getPlayer, toRoman } from '@engine/engine'
import { getCard } from '@engine/data'
import type { BreachState } from '@engine/types'
import { useGame } from '../game/useGame'

const {
  state, displayPlayer, isCurrentSelected, canActMain, canCast,
  aetherInfo, prepSpell, focusBreach, openBreach, gainCharge, activateAbility,
  playCard, playAllGems, castSpell, endTurn, toMainPhase,
  selectPlayer, clickDiscardCard, openPile,
} = useGame()

const p1 = computed(() => getPlayer(state.game!, 'p1'))
const p2 = computed(() => getPlayer(state.game!, 'p2'))
const player = displayPlayer
const aether = computed(() => aetherInfo(player.value))
const ready = computed(() => player.value.charge >= player.value.chargeThreshold)
const isMain = computed(() => state.phase === 'main')
const isCasting = computed(() => state.phase === 'casting')
const isDiscard = computed(() => state.phase === 'discard_order')

const phaseLabel = computed(() => ({
  setup: 'Setup', casting: 'Casting Phase', main: 'Main Phase',
  discard_order: 'Discard Phase', nemesis_target: 'Nemesis Turn', gameover: 'Game Over',
}[state.phase]))

const DIR: Record<string, string> = { east: '→', south: '↓', west: '←', north: '↑' }

const canPrep = (b: BreachState) =>
  state.prepTarget !== null && canActMain.value && (b.opened || b.focusedThisTurn)

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
  if (getCard(cid).type === 'spell') {
    state.prepTarget = state.prepTarget === i ? null : i
  } else {
    playCard(i)
  }
}

function clickBreach(b: BreachState) {
  if (canCast.value && b.prepSpell) { castSpell(b.index); return }
  if (canPrep(b)) { prepSpell(state.prepTarget!, b.index) }
}
</script>

<template>
  <div class="player-area">
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
        :class="{ open: b.opened, castable: canCast && b.prepSpell, 'prep-ok': canPrep(b) }"
        @click="clickBreach(b)"
      >
        <div class="roman">{{ toRoman(b.index) }}</div>
        <div v-if="b.prepSpell" class="spell">[{{ getCard(b.prepSpell).name }}]</div>
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
          class="card small clickable" :class="typeClass(cid)"
          @click="clickDiscardCard(cid)"
        >
          <div class="cname">{{ getCard(cid).name }}</div>
        </div>
        <span v-if="state.discardRemaining.length === 0" class="empty">— done —</span>
      </template>
      <template v-else>
        <div
          v-for="(cid, i) in player.playedThisTurn" :key="cid + i"
          class="card small" :class="typeClass(cid)"
        >
          <div class="cname">{{ getCard(cid).name }}</div>
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
          class="card" :class="[typeClass(cid), { selected: state.prepTarget === i }]"
          @click="clickHand(i)"
        >
          <div class="cname">{{ getCard(cid).name }}</div>
          <div class="cval">{{ cardValue(cid) }}</div>
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
