<script setup lang="ts">
import { computed } from 'vue'
import { getCard } from '@engine/data'
import FaceUpPileCard from './FaceUpPileCard.vue'

export type SpecificPileDisplay = 'count' | 'face_up'

const props = withDefaults(defineProps<{
  label: string
  enabled: boolean
  cardCount: number
  display?: SpecificPileDisplay
  topCardId?: string
  /** When supplied, the face-up card becomes a disabled/enabled action button. */
  actionLabel?: string
  actionEnabled?: boolean
}>(), {
  display: 'count',
  topCardId: undefined,
  actionLabel: undefined,
  actionEnabled: false,
})

const emit = defineEmits<{ activate: []; inspect: [] }>()
const showsFaceUpCard = computed(() => props.display === 'face_up' && !!props.topCardId)

function activate() {
  if (props.actionEnabled) emit('activate')
}
</script>

<template>
  <section
    class="nemesis-asset nemesis-specific-pile-asset"
    :class="{ 'is-unavailable': !enabled, 'shows-face-up-card': display === 'face_up' }"
    :aria-label="label"
  >
    <span class="nemesis-section-title">{{ label }}</span>

    <FaceUpPileCard
      v-if="showsFaceUpCard"
      display-class="nemesis-specific-pile"
      :card-id="topCardId!"
      :ariaLabel="actionLabel ?? `${label}: ${getCard(topCardId!).name}`"
      :primary-enabled="actionEnabled"
      @primary="activate"
      @inspect="emit('inspect')"
    />

    <strong v-else-if="enabled">{{ cardCount }}</strong>
    <span v-else class="asset-subtext">Not used</span>
    <span v-if="display === 'face_up'" class="asset-subtext">{{ cardCount }} card(s)</span>
  </section>
</template>
