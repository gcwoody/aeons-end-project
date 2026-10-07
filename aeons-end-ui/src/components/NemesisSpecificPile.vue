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
  topCardId?: string
  /** When supplied, the face-up card becomes a disabled/enabled action button. */
  actionLabel?: string
  actionEnabled?: boolean
}>(), {
  display: 'count',
  backImageUrl: undefined,
  flightSource: undefined,
  topCardId: undefined,
  actionLabel: undefined,
  actionEnabled: false,
})

const emit = defineEmits<{ activate: []; inspect: [] }>()
const showsFaceUpCard = computed(() => props.display === 'face_up' && !!props.topCardId)
const canInspect = computed(() => props.enabled && props.cardCount > 0)

function activate() {
  if (props.actionEnabled) emit('activate')
}
</script>

<template>
  <section
    class="nemesis-pile-slot nemesis-specific-pile-asset"
    :class="{ 'is-unavailable': !enabled, 'is-empty': cardCount === 0, 'shows-face-up-card': display === 'face_up' }"
    :aria-label="label"
    :title="label"
  >
    <FaceUpPileCard
      v-if="showsFaceUpCard"
      display-class="nemesis-specific-pile"
      :card-id="topCardId!"
      :ariaLabel="`Open ${label}: ${getCard(topCardId!).name}`"
      :primary-enabled="true"
      @primary="emit('inspect')"
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
        :data-card-flight-source="flightSource"
      />
      <span v-else class="nemesis-pile-placeholder">{{ enabled ? `${label} 0` : 'Not used' }}</span>
    </button>
    <span v-if="enabled && cardCount > 0" class="nemesis-pile-count">{{ cardCount }}</span>
    <button v-if="actionLabel" type="button" class="btn small nemesis-specific-buy" :aria-label="actionLabel" :disabled="!actionEnabled" @click.stop="activate">Buy</button>
  </section>
</template>
