<script setup lang="ts">
import { computed } from 'vue'
import { getCard } from '@engine/data'
import CardSurface from './CardSurface.vue'
import FaceUpPileCard from './FaceUpPileCard.vue'

export type SpecificPileDisplay = 'count' | 'face_up'

const props = withDefaults(defineProps<{
  label: string
  enabled: boolean
  cardCount: number
  backImageUrl?: string
  flightSource?: string
  display?: SpecificPileDisplay
  topCardAlwaysRevealed?: boolean
  topCardId?: string
  /** When supplied, the face-up card becomes a disabled/enabled action button. */
  actionLabel?: string
  actionEnabled?: boolean
  primaryActionOnCard?: boolean
}>(), {
  display: 'count',
  backImageUrl: undefined,
  flightSource: undefined,
  topCardId: undefined,
  actionLabel: undefined,
  actionEnabled: false,
  primaryActionOnCard: false,
  topCardAlwaysRevealed: false,
})

const emit = defineEmits<{ activate: []; inspect: [] }>()
const showsFaceUpCard = computed(() => props.display === 'face_up' && !!props.topCardId)
const canInspect = computed(() => props.enabled && props.cardCount > 0)

function activate() {
  if (props.actionEnabled) emit('activate')
}

function activateOrInspect() {
  if (props.primaryActionOnCard && props.actionEnabled) emit('activate')
  else emit('inspect')
}
</script>

<template>
  <section
    class="nemesis-pile-slot nemesis-specific-pile-asset"
    :data-card-flight-source="flightSource"
    :data-card-motion-face="display === 'face_up' ? 'front' : 'back'"
    :data-card-motion-top-always-revealed="topCardAlwaysRevealed ? 'true' : undefined"
    :class="{ 'is-unavailable': !enabled, 'is-empty': cardCount === 0, 'shows-face-up-card': display === 'face_up' }"
    :aria-label="label"
    :title="label"
  >
    <FaceUpPileCard
      v-if="showsFaceUpCard"
      display-class="nemesis-specific-pile"
      :card-id="topCardId!"
      :ariaLabel="`Open ${label}: ${getCard(topCardId!).name}`"
      :primary-enabled="primaryActionOnCard"
      :available="primaryActionOnCard && actionEnabled"
      @primary="activateOrInspect"
      @inspect="emit('inspect')"
    />
    <button
      v-else
      type="button"
      class="nemesis-pile-inspect"
      :class="{ 'is-empty': !canInspect }"
      :aria-label="`Open ${label}`"
      :aria-disabled="!canInspect"
      @click="canInspect && emit('inspect')"
    >
      <CardSurface
        v-if="enabled && cardCount > 0"
        base-class="nemesis-pile-card"
        size="pile"
        :image-url="backImageUrl"
        :image-alt="`${label} card back`"
      />
      <span v-else class="nemesis-pile-placeholder">{{ enabled ? `${label} 0` : 'Not used' }}</span>
    </button>
    <span v-if="enabled && cardCount > 0" class="nemesis-pile-count">{{ cardCount }}</span>
    <button v-if="actionLabel && !primaryActionOnCard" type="button" class="btn small nemesis-specific-buy" :aria-label="actionLabel" :disabled="!actionEnabled" @click.stop="activate">Buy</button>
  </section>
</template>
