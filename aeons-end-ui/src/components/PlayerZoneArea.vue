<script setup lang="ts">
import CardHoverPreview from './CardHoverPreview.vue'
import CardSurface from './CardSurface.vue'
import ZoneScroller from './ZoneScroller.vue'

interface ZoneCardDisplay {
  key: string
  ownerId?: string
  cardId: string
  index: number
  typeClass: string
  pending?: boolean
  selected?: boolean
  preppedAction?: boolean
  actionAvailable?: boolean
  endTurnActionAttention?: boolean
  title?: string
}

interface SwapZoneOwnerDisplay {
  id: string
  cards: ZoneCardDisplay[]
}

defineProps<{
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
</script>

<template>
  <div class="played-zones" :class="{ 'has-swap-zone': hasSwapZone, 'has-develop-zone': hasDevelopZone }">
    <div class="played-zone-headings" aria-hidden="true">
      <span v-if="hasSwapZone" class="played-zone-heading played-zone-heading-swap">SWAP ZONE</span>
      <span class="played-zone-heading played-zone-heading-played">PLAYED ZONE</span>
      <span v-if="hasDevelopZone" class="played-zone-heading played-zone-heading-develop">DEVELOP ZONE</span>
    </div>
    <section v-if="hasSwapZone" class="played-zone played-zone-swap" aria-label="Swap Zone">
      <ZoneScroller class="zone-card-scroll">
        <div class="zone-card-track">
          <template v-for="owner in swapZoneOwners" :key="`swap-owner-${owner.id}`">
            <CardHoverPreview
              v-for="card in owner.cards"
              :key="card.key"
              :card-id="card.cardId"
            >
              <CardSurface
                :card-id="card.cardId"
                size="mini"
                :class="[card.typeClass, {
                  'pending-board-card': card.pending,
                  'pending-board-card-selected': card.pending && card.selected,
                  'game-highlight': card.pending,
                  'game-highlight--choice': card.pending && !card.selected,
                  'game-highlight--selected': card.pending && card.selected,
                }]"
                @click="emit('click-swap-card', owner.id, card.index, card.cardId)"
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
        <div class="zone-card-track">
          <template v-if="isDiscard">
            <CardHoverPreview v-for="card in discardCards" :key="card.key" :card-id="card.cardId">
              <CardSurface
                :card-id="card.cardId"
                size="mini"
                class="clickable"
                :data-discard-phase-card-index="card.index"
                :class="card.typeClass"
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
        <div class="zone-card-track">
          <CardHoverPreview v-for="card in developCards" :key="card.key" :card-id="card.cardId">
            <CardSurface
              :card-id="card.cardId"
              size="mini"
              :title="card.title"
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
