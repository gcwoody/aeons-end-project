<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type { CardDef } from '@engine/types'
import { cardImageUrl } from '../card-images'
import CardHoverPreview from './CardHoverPreview.vue'

type PickerType = CardDef['type']
type FilterType = 'all' | PickerType

const props = withDefaults(defineProps<{
  cards: CardDef[]
  modelValue: string
  title?: string
  searchPlaceholder?: string
  allowTypeFilter?: boolean
  showCost?: boolean
  showMeta?: boolean
  initialVisibleTypes?: PickerType[]
  globalShortcut?: boolean
}>(), {
  title: 'Cards',
  searchPlaceholder: 'Search cards... (/ to focus)',
  allowTypeFilter: true,
  showCost: true,
  showMeta: true,
  globalShortcut: true,
})

const emit = defineEmits<{
  'update:modelValue': [value: string]
}>()

const search = ref('')
const filter = ref<FilterType>('all')
const searchInput = ref<HTMLInputElement | null>(null)
const openGroups = ref(new Set<PickerType>())
const isSearchActive = computed(() => search.value.trim().length > 0)

const filters = computed(() => {
  const types = [...new Set(props.cards.map(card => card.type))]
  return ['all', ...types] as FilterType[]
})

const filteredCards = computed(() => {
  const query = search.value.trim().toLocaleLowerCase()
  return props.cards
    .filter(card => query || !props.initialVisibleTypes || props.initialVisibleTypes.includes(card.type))
    .filter(card => filter.value === 'all' || card.type === filter.value)
    .filter(card => !query || `${card.id} ${card.name} ${card.type}`
      .toLocaleLowerCase().includes(query))
    .sort((a, b) => a.type.localeCompare(b.type)
      || (props.showCost ? a.cost - b.cost : 0)
      || a.name.localeCompare(b.name))
})

const groups = computed(() => {
  const grouped = new Map<PickerType, CardDef[]>()
  for (const card of filteredCards.value) {
    const cards = grouped.get(card.type) ?? []
    cards.push(card)
    grouped.set(card.type, cards)
  }
  return [...grouped.entries()]
})

watch([search, filter], () => {
  const shouldRevealMatches = search.value.trim().length > 0 || filter.value !== 'all'
  openGroups.value = shouldRevealMatches
    ? new Set(groups.value.map(([type]) => type))
    : new Set<PickerType>()
})

function typeLabel(type: string): string {
  return type === 'treasure' ? 'Treasure' : type.charAt(0).toUpperCase() + type.slice(1)
}

function cardMeta(card: CardDef): string {
  if (card.type === 'treasure') {
    return `Treasure Level ${card.treasureLevel ?? 2}`
  }
  const cost = props.showCost && Number.isFinite(card.cost) ? ` · ${card.cost} Aether` : ''
  return `${typeLabel(card.type)}${cost}`
}

function cardOptionTitle(card: CardDef): string {
  return props.showMeta ? `${card.name} · ${cardMeta(card)}` : card.name
}

function selectCard(card: CardDef) {
  emit('update:modelValue', card.id)
}

function toggleGroup(type: PickerType) {
  const next = new Set(openGroups.value)
  if (next.has(type)) next.delete(type)
  else next.add(type)
  openGroups.value = next
}

function isGroupOpen(type: PickerType): boolean {
  return openGroups.value.has(type)
}

function clearSearch() {
  search.value = ''
}

function focusSearch() {
  nextTick(() => searchInput.value?.focus())
}

function handleShortcut(event: KeyboardEvent) {
  const target = event.target as HTMLElement | null
  const typing = target?.matches('input, textarea, select, [contenteditable="true"]')
  if (event.key === '/' && !typing) {
    event.preventDefault()
    focusSearch()
  } else if (event.key === 'Escape' && document.activeElement === searchInput.value) {
    clearSearch()
    searchInput.value?.blur()
  }
}

onMounted(() => {
  if (props.globalShortcut) window.addEventListener('keydown', handleShortcut)
})
onBeforeUnmount(() => {
  if (props.globalShortcut) window.removeEventListener('keydown', handleShortcut)
})
</script>

<template>
  <div class="debug-card-picker" data-ui-component="Card.DebugPicker">
    <div class="debug-card-picker-head">
      <span class="debug-label">{{ title }}</span>
      <span class="debug-card-count">{{ filteredCards.length }} shown / {{ cards.length }} total</span>
    </div>

    <div class="debug-card-search-row">
      <slot name="search-action" />
      <input
        ref="searchInput"
        v-model="search"
        class="debug-card-search"
        type="search"
        :placeholder="searchPlaceholder"
        aria-label="Search debug cards"
      />
      <button v-if="search" class="btn small" type="button" @click="clearSearch">Clear</button>
    </div>

    <div v-if="allowTypeFilter && filters.length > 2" class="debug-card-filters" role="toolbar" aria-label="Filter debug cards">
      <button
        v-for="type in filters"
        :key="type"
        class="btn small"
        :class="{ on: filter === type }"
        type="button"
        :aria-pressed="filter === type"
        @click="filter = type"
      >
        {{ type === 'all' ? 'All' : typeLabel(type) }}
      </button>
    </div>

    <div v-if="isSearchActive && filteredCards.length" class="debug-card-grid">
      <CardHoverPreview v-for="card in filteredCards" :key="card.id" :card-id="card.id" :preview-width="210" :preview-height="291.02">
        <button
          class="debug-card-option game-highlight"
          :class="{ selected: modelValue === card.id, 'game-highlight--choice': modelValue === card.id }"
          :data-card-id="card.id"
          type="button"
          :aria-label="cardOptionTitle(card)"
          :aria-pressed="modelValue === card.id"
          @click="selectCard(card)"
        >
          <img
            v-if="cardImageUrl(card.id)"
            :src="cardImageUrl(card.id)"
            :alt="card.name"
            loading="lazy"
            decoding="async"
            draggable="false"
          />
          <span v-else class="debug-card-fallback">{{ card.name }}</span>
          <span class="debug-card-option-name">{{ card.name }}</span>
          <span v-if="showMeta" class="debug-card-option-meta">{{ cardMeta(card) }}</span>
        </button>
      </CardHoverPreview>
    </div>

    <div v-else-if="groups.length" class="debug-card-groups">
      <section v-for="[type, group] in groups" :key="type" class="debug-card-group">
        <button
          class="debug-card-group-toggle"
          type="button"
          :aria-expanded="isGroupOpen(type)"
          @click="toggleGroup(type)"
        >
          <span class="debug-card-group-label">{{ typeLabel(type) }}</span>
          <span class="debug-card-group-count">{{ group.length }}</span>
          <span class="debug-card-group-chevron" aria-hidden="true">{{ isGroupOpen(type) ? '−' : '+' }}</span>
        </button>
        <div v-if="isGroupOpen(type)" class="debug-card-grid">
          <CardHoverPreview v-for="card in group" :key="card.id" :card-id="card.id" :preview-width="210" :preview-height="291.02">
            <button
              class="debug-card-option game-highlight"
              :class="{ selected: modelValue === card.id, 'game-highlight--choice': modelValue === card.id }"
              :data-card-id="card.id"
              type="button"
              :aria-label="cardOptionTitle(card)"
              :aria-pressed="modelValue === card.id"
              @click="selectCard(card)"
            >
              <img
                v-if="cardImageUrl(card.id)"
                :src="cardImageUrl(card.id)"
                :alt="card.name"
                loading="lazy"
                decoding="async"
                draggable="false"
              />
              <span v-else class="debug-card-fallback">{{ card.name }}</span>
              <span class="debug-card-option-name">{{ card.name }}</span>
              <span v-if="showMeta" class="debug-card-option-meta">{{ cardMeta(card) }}</span>
            </button>
          </CardHoverPreview>
        </div>
      </section>
    </div>
    <p v-else class="debug-hint">No cards match the current search.</p>
  </div>
</template>
