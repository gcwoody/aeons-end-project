<script setup lang="ts">
import { computed, ref } from 'vue'
import { getCard } from '@engine/data'
import type { PlayerId } from '@engine/types'
import CardSurface from './CardSurface.vue'

export interface CardDistributionUiCard {
  cardId: string
  instanceId: string
}

export interface CardDistributionUiPlayer {
  playerId: PlayerId
  mageName: string
}

const props = defineProps<{
  cards: CardDistributionUiCard[]
  players: CardDistributionUiPlayer[]
}>()

const emit = defineEmits<{
  confirm: [assignments: Array<{ instanceId: string; playerId: PlayerId }>]
}>()

const assignments = ref<Record<string, PlayerId>>({})
const selectedInstanceId = ref<string | null>(null)
const draggingInstanceId = ref<string | null>(null)

const unassignedCards = computed(() =>
  props.cards.filter(card => !assignments.value[card.instanceId]),
)
const assignedCards = (playerId: PlayerId) =>
  props.cards.filter(card => assignments.value[card.instanceId] === playerId)

function assign(instanceId: string, playerId: PlayerId) {
  if (!props.cards.some(card => card.instanceId === instanceId) ||
    !props.players.some(player => player.playerId === playerId)) return
  assignments.value[instanceId] = playerId
  selectedInstanceId.value = null
}

function selectUnassigned(instanceId: string) {
  selectedInstanceId.value = selectedInstanceId.value === instanceId ? null : instanceId
}

function returnToUnassigned(instanceId: string) {
  delete assignments.value[instanceId]
  selectedInstanceId.value = instanceId
}

function beginDrag(event: DragEvent, instanceId: string) {
  draggingInstanceId.value = instanceId
  selectedInstanceId.value = instanceId
  if (event.dataTransfer) {
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData('text/plain', instanceId)
  }
}

function finishDrag() {
  draggingInstanceId.value = null
}

function droppedOnPlayer(event: DragEvent, playerId: PlayerId) {
  event.preventDefault()
  const instanceId = event.dataTransfer?.getData('text/plain') || draggingInstanceId.value
  if (instanceId) assign(instanceId, playerId)
  finishDrag()
}

function dropUnassigned(event: DragEvent) {
  event.preventDefault()
  const instanceId = event.dataTransfer?.getData('text/plain') || draggingInstanceId.value
  if (instanceId) returnToUnassigned(instanceId)
  finishDrag()
}

function assignSelectedToPlayer(playerId: PlayerId) {
  if (selectedInstanceId.value) assign(selectedInstanceId.value, playerId)
}

function confirm() {
  if (unassignedCards.value.length > 0) return
  emit('confirm', props.cards.map(card => ({
    instanceId: card.instanceId,
    playerId: assignments.value[card.instanceId]!,
  })))
}
</script>

<template>
  <section class="card-distribution-panel" data-ui-component="Decision.CardDistribution">
    <p class="decision-hint">Drag each card to a player's row. You can also select a card, then select a row.</p>

    <div
      class="card-distribution-unassigned"
      aria-label="Cards to distribute"
      @dragover.prevent
      @drop="dropUnassigned"
    >
      <span class="card-distribution-label">Cards to distribute</span>
      <div class="card-distribution-card-row">
        <button
          v-for="card in unassignedCards"
          :key="card.instanceId"
          type="button"
          class="card-distribution-card"
          :class="{
            'is-selected': selectedInstanceId === card.instanceId,
            'is-dragging': draggingInstanceId === card.instanceId,
          }"
          :aria-label="`Select ${getCard(card.cardId).name} to distribute`"
          :aria-pressed="selectedInstanceId === card.instanceId"
          :draggable="true"
          @click="selectUnassigned(card.instanceId)"
          @dragstart="beginDrag($event, card.instanceId)"
          @dragend="finishDrag"
        >
          <CardSurface
            base-class="card-distribution-card-surface"
            size="pile"
            :card-id="card.cardId"
            :data-card-motion-suppress-flight="true"
            :data-card-instance-id="card.instanceId"
          />
        </button>
        <span v-if="unassignedCards.length === 0" class="card-distribution-empty">All cards assigned</span>
      </div>
    </div>

    <div class="card-distribution-player-rows" aria-label="Players who can receive cards">
      <section
        v-for="player in players"
        :key="player.playerId"
        class="card-distribution-player-row"
        :class="{ 'is-drop-target': selectedInstanceId !== null }"
        role="group"
        :aria-label="`${player.mageName}'s cards`"
        @dragover.prevent
        @drop="droppedOnPlayer($event, player.playerId)"
      >
        <div class="card-distribution-player-heading">
          <h3>{{ player.mageName }}</h3>
          <button
            class="btn small"
            type="button"
            :disabled="selectedInstanceId === null"
            @click="assignSelectedToPlayer(player.playerId)"
          >
            Assign selected
          </button>
        </div>
        <div class="card-distribution-card-row">
          <button
            v-for="card in assignedCards(player.playerId)"
            :key="card.instanceId"
            type="button"
            class="card-distribution-card assigned"
            :aria-label="`Return ${getCard(card.cardId).name} to unassigned cards`"
            draggable="true"
            @click.stop="returnToUnassigned(card.instanceId)"
            @dragstart="beginDrag($event, card.instanceId)"
            @dragend="finishDrag"
          >
            <CardSurface
              base-class="card-distribution-card-surface"
              size="pile"
              :card-id="card.cardId"
              :data-card-motion-suppress-flight="true"
              :data-card-instance-id="card.instanceId"
            />
          </button>
          <span v-if="assignedCards(player.playerId).length === 0" class="card-distribution-empty">
            Drop cards here
          </span>
        </div>
      </section>
    </div>

    <div class="decision-footer card-distribution-footer">
      <span>{{ unassignedCards.length }} card{{ unassignedCards.length === 1 ? '' : 's' }} left to assign</span>
      <button class="btn primary" type="button" :disabled="unassignedCards.length > 0" @click="confirm">
        Confirm
      </button>
    </div>
  </section>
</template>

<style scoped>
.card-distribution-panel {
  display: grid;
  gap: 12px;
  min-width: min(740px, calc(100vw - 72px));
}

.card-distribution-unassigned,
.card-distribution-player-row {
  display: grid;
  gap: 8px;
  padding: 10px;
  border: 1px solid var(--border);
  border-radius: var(--radius-card);
  background: var(--panel);
}

.card-distribution-unassigned {
  min-height: 168px;
}

.card-distribution-label,
.card-distribution-player-row h3 {
  margin: 0;
  color: var(--text-muted);
  font-size: 0.9rem;
  font-weight: 700;
}

.card-distribution-player-heading {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
}

.card-distribution-player-rows {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
  gap: 10px;
}

.card-distribution-player-row {
  min-height: 164px;
  align-content: start;
  outline: none;
}

.card-distribution-player-row.is-drop-target:focus,
.card-distribution-player-row.is-drop-target:hover {
  border-color: var(--accent);
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--accent) 38%, transparent);
}

.card-distribution-card-row {
  display: flex;
  align-items: flex-start;
  flex-wrap: wrap;
  gap: 8px;
  min-height: 122px;
}

.card-distribution-card {
  width: 78px;
  padding: 0;
  border: 2px solid transparent;
  border-radius: var(--radius-card);
  background: transparent;
  cursor: grab;
  touch-action: none;
}

.card-distribution-card:active { cursor: grabbing; }
.card-distribution-card.is-selected { border-color: var(--accent); }
.card-distribution-card.is-dragging { opacity: 0.45; }

.card-distribution-card-surface {
  width: 100%;
  height: auto;
  aspect-ratio: var(--card-aspect-ratio);
  overflow: hidden;
}

.card-distribution-empty {
  align-self: center;
  color: var(--text-muted);
  font-size: 0.85rem;
}

.card-distribution-footer {
  justify-content: space-between;
}

@media (max-width: 700px) {
  .card-distribution-panel { min-width: 0; }
  .card-distribution-player-rows { grid-template-columns: 1fr; }
}
</style>
