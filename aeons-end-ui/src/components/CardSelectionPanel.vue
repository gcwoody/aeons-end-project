<script setup lang="ts">
import { computed } from 'vue'
import { cardImageUrl } from '../card-images'
import { chunkCards } from '../game/pile-layout'
import CardHoverPreview from './CardHoverPreview.vue'

export interface CardSelectionItem {
  key: string
  cardId: string
  cardName: string
  groupKey: string
  groupLabel: string
}

const props = defineProps<{
  choices: CardSelectionItem[]
  min: number
  max: number
  selectedKeys: string[]
  /** Render a small, fixed set of revealed cards at readable card size. */
  largeCards?: boolean
}>()

const emit = defineEmits<{
  'update:selectedKeys': [keys: string[]]
  confirm: []
  skip: []
}>()

const groups = computed(() => {
  const grouped = new Map<string, { key: string; label: string; choices: CardSelectionItem[] }>()
  for (const choice of props.choices) {
    const group = grouped.get(choice.groupKey) ?? {
      key: choice.groupKey,
      label: choice.groupLabel,
      choices: [],
    }
    group.choices.push(choice)
    grouped.set(choice.groupKey, group)
  }
  return [...grouped.values()].map(group => ({
    ...group,
    rows: chunkCards(group.choices),
  }))
})

function isSelected(key: string): boolean {
  return props.selectedKeys.includes(key)
}

function toggle(key: string): void {
  if (isSelected(key)) {
    emit('update:selectedKeys', props.selectedKeys.filter(selected => selected !== key))
    return
  }
  // A one-card decision behaves like a radio group: choosing another card
  // replaces the previous choice instead of requiring an extra deselect click.
  if (props.max === 1) {
    emit('update:selectedKeys', [key])
    return
  }
  if (props.selectedKeys.length >= props.max) return
  emit('update:selectedKeys', [...props.selectedKeys, key])
}
</script>

<template>
  <div class="card-selection-panel" :class="{ 'large-cards': props.largeCards }">
    <div v-for="group in groups" :key="group.key" class="decision-card-zone">
      <span class="decision-card-zone-label">{{ group.label }}</span>
      <div class="decision-card-rows">
        <div
          v-for="(row, index) in group.rows"
          :key="`${group.key}:${index}`"
          class="pile-row decision-card-row"
          :style="{ '--choice-columns': row.length }"
        >
          <CardHoverPreview
            v-for="choice in row"
            :key="choice.key"
            :card-id="choice.cardId"
            :disabled="props.largeCards"
          >
            <button
              class="decision-card-choice"
              :class="{ selected: isSelected(choice.key) }"
              type="button"
              @click="toggle(choice.key)"
            >
              <img v-if="cardImageUrl(choice.cardId)" :src="cardImageUrl(choice.cardId)" :alt="choice.cardName" />
              <span v-else>{{ choice.cardName }}</span>
            </button>
          </CardHoverPreview>
        </div>
      </div>
    </div>

    <div class="decision-footer">
      <span class="stat">Selected {{ selectedKeys.length }} / {{ max }}</span>
      <div class="decision-footer-actions">
        <button v-if="min === 0" class="btn" type="button" @click="emit('skip')">Skip</button>
        <button
          class="btn primary"
          type="button"
          :disabled="selectedKeys.length < min || selectedKeys.length > max"
          @click="emit('confirm')"
        >
          Confirm
        </button>
      </div>
    </div>
  </div>
</template>
