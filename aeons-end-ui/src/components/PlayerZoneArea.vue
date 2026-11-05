<script setup lang="ts">
import { onBeforeUnmount, onBeforeUpdate, onUpdated, ref } from 'vue'
import { animateCardRowReflow, cancelCardRowReflow, captureCardRowPositions } from '../game/card-flight'
import type { CardRowPositionSnapshot } from '../game/card-flight'
import CardHoverPreview from './CardHoverPreview.vue'
import CardSurface from './CardSurface.vue'
import ZoneScroller from './ZoneScroller.vue'

interface ZoneCardDisplay {
  key: string
  motionKey: string
  ownerId?: string
  cardId: string
  instanceId?: string
  index: number
  typeClass: string
  occurrence?: number
  pending?: boolean
  selected?: boolean
  preppedAction?: boolean
  actionAvailable?: boolean
  endTurnActionAttention?: boolean
  heldForDeparture?: boolean
}

interface SwapZoneOwnerDisplay {
  id: string
  cards: ZoneCardDisplay[]
}

defineProps<{
  playerId: string
  hasSwapZone: boolean
  hasDevelopZone: boolean
  isDiscard: boolean
  swapZoneOwners: SwapZoneOwnerDisplay[]
  playedCards: ZoneCardDisplay[]
  discardCards: ZoneCardDisplay[]
  developCards: ZoneCardDisplay[]
}>()

const emit = defineEmits<{
  'click-swap-card': [ownerId: string, index: number, cardId: string]
  'click-played-card': [index: number]
  'click-discard-card': [index: number]
  'click-develop-card': [index: number]
}>()

const zoneElement = ref<HTMLElement | null>(null)
let previousRows = new Map<string, { positions: CardRowPositionSnapshot; keys: string }>()

function cardKeys(row: HTMLElement): string {
  return [...row.querySelectorAll<HTMLElement>('[data-card-motion-key]')]
    .map(card => card.dataset.cardMotionKey ?? '').join('|')
}

onBeforeUpdate(() => {
  // Capture the visible slots before Vue changes the row, including an active FLIP.
  previousRows = new Map([...zoneElement.value?.querySelectorAll<HTMLElement>('[data-card-motion-row]') ?? []]
    .map(row => [row.dataset.cardMotionRow ?? '', {
      positions: captureCardRowPositions(row),
      keys: cardKeys(row),
    }]))
})

onUpdated(() => {
  // Start the inverse transform in this update cycle, before the new layout paints.
  for (const row of zoneElement.value?.querySelectorAll<HTMLElement>('[data-card-motion-row]') ?? []) {
    const previous = previousRows.get(row.dataset.cardMotionRow ?? '')
    if (!previous || previous.keys === cardKeys(row)) continue
    animateCardRowReflow(row, previous.positions, { durationVariable: '--card-zone-reflow-duration' })
  }
  previousRows.clear()
})

onBeforeUnmount(() => {
  for (const row of zoneElement.value?.querySelectorAll<HTMLElement>('[data-card-motion-row]') ?? []) {
    cancelCardRowReflow(row)
  }
})
</script>

<template>
  <div ref="zoneElement" class="played-zones" :class="{ 'has-swap-zone': hasSwapZone, 'has-develop-zone': hasDevelopZone }">
    <div class="played-zone-headings" aria-hidden="true">
      <span v-if="hasSwapZone" class="played-zone-heading played-zone-heading-swap">SWAP ZONE</span>
      <span class="played-zone-heading played-zone-heading-played">PLAYED ZONE</span>
      <span v-if="hasDevelopZone" class="played-zone-heading played-zone-heading-develop">DEVELOP ZONE</span>
    </div>
    <section v-if="hasSwapZone" class="played-zone played-zone-swap" aria-label="Swap Zone">
      <ZoneScroller class="zone-card-scroll">
        <div class="zone-card-track" data-card-motion-row="swap:all">
          <template v-for="owner in swapZoneOwners" :key="`swap-owner-${owner.id}`">
            <CardHoverPreview
              v-for="card in owner.cards"
              :key="card.key"
              :card-id="card.cardId"
            >
              <CardSurface
                :card-id="card.cardId"
                size="mini"
                :data-card-motion-zone="card.heldForDeparture ? undefined : 'swap'"
                :data-card-motion-from-zones="card.heldForDeparture ? undefined : 'played,breach,hand,discard'"
                :data-card-motion-card-id="card.heldForDeparture ? undefined : card.cardId"
                :data-card-motion-owner-id="card.heldForDeparture ? undefined : owner.id"
                :data-card-motion-key="card.motionKey"
                :data-card-instance-id="card.instanceId"
                :data-card-motion-held-key="card.heldForDeparture ? card.motionKey : undefined"
                :class="[card.typeClass, {
                  'pending-board-card': card.pending,
                  'pending-board-card-selected': card.pending && card.selected,
                  'game-highlight': card.pending,
                  'game-highlight--choice': card.pending && !card.selected,
                  'game-highlight--selected': card.pending && card.selected,
                }]"
                @click="!card.heldForDeparture && emit('click-swap-card', owner.id, card.index, card.cardId)"
              />
            </CardHoverPreview>
          </template>
        </div>
      </ZoneScroller>
    </section>

    <section class="played-zone played-zone-center" aria-label="Played">
      <ZoneScroller
        class="played-card-scroll"
        :overflow-anchor="hasDevelopZone && !hasSwapZone ? 'end' : 'start'"
        :center-boundary="hasSwapZone && !hasDevelopZone ? 'start' : hasDevelopZone && !hasSwapZone ? 'end' : undefined"
      >
        <div class="zone-card-track" :data-card-motion-row="`played:${playerId}`">
          <template v-if="isDiscard">
            <CardHoverPreview v-for="card in discardCards" :key="card.key" :card-id="card.cardId">
              <CardSurface
                :card-id="card.cardId"
                size="mini"
                class="clickable"
                :data-discard-phase-card-index="card.index"
                :class="[card.typeClass, 'game-highlight', 'game-highlight--choice', 'player-card-hover-feedback']"
                @click="emit('click-discard-card', card.index)"
              />
            </CardHoverPreview>
            <span v-if="discardCards.length === 0" class="empty">— done —</span>
          </template>
          <template v-else>
            <CardHoverPreview v-for="card in playedCards" :key="card.key" :card-id="card.cardId">
              <CardSurface
                :card-id="card.cardId"
                size="mini"
                :data-played-card-id="card.cardId"
                data-card-motion-zone="played"
                data-card-motion-from-zones="hand"
                :data-card-motion-card-id="card.cardId"
                :data-card-motion-owner-id="card.ownerId"
                :data-card-motion-key="card.motionKey"
                :data-card-instance-id="card.instanceId"
                :data-card-motion-occurrence="card.occurrence"
                :class="[card.typeClass, {
                  'prepped-action': card.preppedAction,
                  'pending-board-card': card.pending,
                  'pending-board-card-selected': card.pending && card.selected,
                  'game-highlight': card.preppedAction || card.pending,
                  'game-highlight--available': card.preppedAction,
                  'game-highlight--choice': card.pending && !card.selected,
                  'game-highlight--selected': card.pending && card.selected,
                  'end-turn-attention': card.endTurnActionAttention,
                }]"
                :data-main-action-id="card.endTurnActionAttention ? `played-card:${card.ownerId}:${card.index}` : undefined"
                @click="emit('click-played-card', card.index)"
              />
            </CardHoverPreview>
          </template>
        </div>
      </ZoneScroller>
    </section>

    <section v-if="hasDevelopZone" class="played-zone played-zone-develop" aria-label="Develop Zone">
      <ZoneScroller class="zone-card-scroll">
        <div class="zone-card-track" data-card-motion-row="develop:shared">
          <CardHoverPreview v-for="card in developCards" :key="card.key" :card-id="card.cardId">
            <CardSurface
              :card-id="card.cardId"
              size="mini"
              data-card-motion-zone="develop"
              data-card-motion-from-zones="supply"
              :data-card-motion-card-id="card.cardId"
              data-card-motion-owner-id=""
              :data-card-instance-id="card.instanceId"
              :data-card-motion-key="card.motionKey"
              :class="[card.typeClass, {
                'develop-action-available': card.actionAvailable,
                'game-highlight': card.actionAvailable,
                'game-highlight--available': card.actionAvailable,
                'end-turn-attention': card.endTurnActionAttention,
              }]"
              :data-main-action-id="card.endTurnActionAttention ? `develop-zone-card:${card.index}` : undefined"
              @click="emit('click-develop-card', card.index)"
              @contextmenu.prevent="emit('click-develop-card', card.index)"
            />
          </CardHoverPreview>
        </div>
      </ZoneScroller>
    </section>
  </div>
</template>
