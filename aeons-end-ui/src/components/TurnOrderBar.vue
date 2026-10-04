<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { useGame } from '../game/useGame'
import { createTurnOrderLabels, turnOrderActorLabel } from '../game/turn-order-labels'
import { nemesisTurnOrderTokenUrl, playerTurnOrderTokenUrl } from '../card-images'

const { state } = useGame()
const game = computed(() => state.game!)
const taken = computed(() => game.value.turnOrderDiscard)
const round = computed(() => game.value.round)
const slots = computed(() => Array.from({ length: 6 }, (_, index) => taken.value[index] ?? null))
const currentIdx = computed(() => taken.value.length - 1)
const playerLabels = computed(() => createTurnOrderLabels(game.value.players))
const actorLabel = (actor: string) => turnOrderActorLabel(actor, playerLabels.value)
const turnOrderRoot = ref<HTMLElement | null>(null)
const arrivalPosition = ref<{ left: number; top: number; width: number; height: number } | null>(null)

watch(() => [state.turnTransitionId, state.turnTransitionActive] as const, async ([transitionId, active]) => {
  if (!active) {
    arrivalPosition.value = null
    return
  }

  arrivalPosition.value = null
  await nextTick()
  // A new turn can begin before Vue flushes the previous transition. Ignore
  // stale geometry so the arrival clone always belongs to the newest token.
  if (!state.turnTransitionActive || state.turnTransitionId !== transitionId) return
  const rect = turnOrderRoot.value?.querySelector<HTMLElement>('.slot.current')?.getBoundingClientRect()
  arrivalPosition.value = rect && rect.width > 0 && rect.height > 0
    ? { left: rect.left, top: rect.top, width: rect.width, height: rect.height }
    : null
}, { flush: 'post' })

function tokenUrl(actor: string | null): string | undefined {
  if (!actor) return undefined
  if (actor === 'nemesis') return nemesisTurnOrderTokenUrl()
  const playerIndex = game.value.players.findIndex(player => player.id === actor)
  return playerTurnOrderTokenUrl(playerIndex + 1)
}
</script>

<template>
  <div ref="turnOrderRoot" class="turn-order-cards">
    <div class="slots">
      <div
        v-for="(slot, index) in slots" :key="index"
        class="slot"
        :class="{
          current: index === currentIdx,
          hidden: !slot,
          arriving: state.turnTransitionActive && index === currentIdx,
        }"
        :aria-label="slot ? `${actorLabel(slot)} turn` : 'Turn order card hidden'"
      >
        <img v-if="tokenUrl(slot)" class="turn-order-token" :src="tokenUrl(slot)" alt="" draggable="false" />
        <span v-if="!tokenUrl(slot)" aria-hidden="true">?</span>
      </div>
    </div>
    <div class="turn-round">Round {{ round }}</div>
    <Teleport to="body">
      <img
        v-if="state.turnTransitionActive && arrivalPosition && tokenUrl(taken[currentIdx] ?? null)"
        :key="state.turnTransitionId"
        class="turn-order-token-arrival"
        :src="tokenUrl(taken[currentIdx] ?? null)"
        :style="{
          left: `${arrivalPosition.left}px`,
          top: `${arrivalPosition.top}px`,
          width: `${arrivalPosition.width}px`,
          height: `${arrivalPosition.height}px`,
        }"
        alt=""
        aria-hidden="true"
        draggable="false"
      />
    </Teleport>
  </div>
</template>
