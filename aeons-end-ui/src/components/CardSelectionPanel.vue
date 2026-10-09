<script setup lang="ts">
import { computed } from 'vue'
import { cardImageUrl } from '../card-images'
import { chunkCards } from '../game/pile-layout'
import { usePointerReorder } from '../game/usePointerReorder'
import CardHoverPreview from './CardHoverPreview.vue'

export interface CardSelectionItem {
  key: string
  cardId: string
  cardName: string
  groupKey: string
  groupLabel: string
  disabled?: boolean
  disabledReason?: string
  highlight?: 'required' | 'choice'
  motionZone?: string
  motionOwnerId?: string
}

const props = defineProps<{
  choices: CardSelectionItem[]
  min: number
  max: number
  selectedKeys: string[]
  /** Render a small, fixed set of revealed cards at readable card size. */
  largeCards?: boolean
  /** Omit source labels when the decision prompt already describes the group. */
  groupLabels?: boolean
  /** Allow revealed candidates to be reordered by dragging. */
  reorderable?: boolean
}>()

const emit = defineEmits<{
  'update:selectedKeys': [keys: string[]]
  reorder: [keys: string[]]
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

const { draggingKey, onPointerDown, consumeDragged } = usePointerReorder({
  getKeys: () => props.choices.map(choice => choice.key),
  reorder: keys => emit('reorder', keys),
  enabled: () => props.reorderable === true,
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

function toggleAfterClick(key: string): void {
  if (consumeDragged()) return
  toggle(key)
}
</script>

<template>
  <div class="card-selection-panel" :class="{ 'large-cards': props.largeCards, 'no-group-labels': props.groupLabels === false, reorderable: props.reorderable }">
    <div v-if="props.reorderable" class="decision-card-zone decision-card-sort-zone">
      <span v-if="props.groupLabels !== false && groups[0]?.label" class="decision-card-zone-label">{{ groups[0].label }}</span>
      <div class="decision-card-rows">
        <TransitionGroup
          name="pointer-sort"
          tag="div"
          class="pointer-sort-row decision-card-sort-row"
          :class="{ 'is-dragging': draggingKey !== null }"
          aria-label="Reorder revealed cards"
        >
          <button
            v-for="(choice, index) in props.choices"
            :key="choice.key"
            class="decision-card-choice game-highlight"
            :class="{
              selected: isSelected(choice.key),
              'game-highlight--selected': isSelected(choice.key),
              unavailable: choice.disabled,
              'pointer-sort-item': true,
              'is-dragging': draggingKey === choice.key,
            }"
            type="button"
            :aria-label="'Select ' + choice.cardName + '; position ' + (index + 1)"
            :aria-pressed="isSelected(choice.key)"
            :disabled="choice.disabled"
            :data-card-selection-key="choice.key"
            :data-card-selection-id="choice.cardId"
            :data-card-motion-zone="choice.motionZone"
            :data-card-motion-card-id="choice.motionZone ? choice.cardId : undefined"
            :data-card-motion-owner-id="choice.motionOwnerId"
            :data-card-motion-key="choice.motionZone ? `decision-${choice.key}` : undefined"
            :data-sort-key="choice.key"
            :title="choice.disabled ? choice.disabledReason : undefined"
            @click="toggleAfterClick(choice.key)"
            @pointerdown="onPointerDown($event, choice.key)"
          >
            <CardHoverPreview :card-id="choice.cardId" :disabled="choice.disabled || draggingKey !== null">
              <img v-if="cardImageUrl(choice.cardId)" :src="cardImageUrl(choice.cardId)" :alt="choice.cardName" draggable="false" />
              <span v-else>{{ choice.cardName }}</span>
            </CardHoverPreview>
          </button>
        </TransitionGroup>
      </div>
    </div>

    <template v-else>
      <div v-for="group in groups" :key="group.key" class="decision-card-zone">
        <span v-if="props.groupLabels !== false && group.label" class="decision-card-zone-label">{{ group.label }}</span>
        <div class="decision-card-rows">
          <div
            v-for="(row, index) in group.rows"
            :key="group.key + ':' + index"
            class="pile-row decision-card-row"
            :style="{ '--choice-columns': row.length }"
          >
            <CardHoverPreview
              v-for="choice in row"
              :key="choice.key"
              :card-id="choice.cardId"
              :disabled="props.largeCards || choice.disabled"
            >
              <button
                class="decision-card-choice game-highlight"
                :class="{
                  selected: isSelected(choice.key),
                  'game-highlight--selected': isSelected(choice.key),
                  'game-highlight--choice': !isSelected(choice.key) && choice.highlight === 'choice',
                  'game-highlight--required': !isSelected(choice.key) && choice.highlight === 'required',
                  unavailable: choice.disabled,
                }"
                type="button"
                :aria-label="'Select ' + choice.cardName"
                :aria-pressed="isSelected(choice.key)"
                :disabled="choice.disabled"
                :data-card-selection-key="choice.key"
                :data-card-selection-id="choice.cardId"
                :data-card-motion-zone="choice.motionZone"
                :data-card-motion-card-id="choice.motionZone ? choice.cardId : undefined"
                :data-card-motion-owner-id="choice.motionOwnerId"
                :data-card-motion-key="choice.motionZone ? `decision-${choice.key}` : undefined"
                :title="choice.disabled ? choice.disabledReason : undefined"
                @click="toggle(choice.key)"
              >
                <img v-if="cardImageUrl(choice.cardId)" :src="cardImageUrl(choice.cardId)" :alt="choice.cardName" />
                <span v-else>{{ choice.cardName }}</span>
              </button>
            </CardHoverPreview>
          </div>
        </div>
      </div>
    </template>

    <div class="decision-footer">
      <span v-if="props.max > 0" class="stat">Selected {{ selectedKeys.length }} / {{ max }}</span>
      <div class="decision-footer-actions">
        <button v-if="min === 0" class="btn" type="button" @click="emit('skip')">Skip</button>
        <button
          v-if="props.max > 0 || props.min > 0"
          class="btn primary"
          :disabled="selectedKeys.length < min || selectedKeys.length > max"
          @click="emit('confirm')"
        >
          Confirm
        </button>
      </div>
    </div>
  </div>
</template>
