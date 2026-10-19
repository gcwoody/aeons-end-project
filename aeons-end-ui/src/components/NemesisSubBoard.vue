<script setup lang="ts">
import { computed } from 'vue'
import type { NemesisSubBoardToken } from '@engine/types'
import type { SubBoardAnchor, SubBoardLayoutDocument, SubBoardRegion } from './sub-board-layout'

const props = defineProps<{
  imageUrl: string
  layout: SubBoardLayoutDocument
  tokens: NemesisSubBoardToken[]
  availableRegionIds: string[]
  selectableRegionIds?: string[]
  tokenImageUrl: (tokenId: string) => string | undefined
}>()

const emit = defineEmits<{
  activate: [regionId: string]
  selectRegion: [regionId: string]
  preview: []
}>()

const anchorsByRegion = computed(() => new Map(props.layout.anchors.map(anchor => [anchor.regionId, anchor])))
const available = computed(() => new Set(props.availableRegionIds))
const selectable = computed(() => new Set(props.selectableRegionIds ?? []))

function regionStyle(region: SubBoardRegion) {
  return {
    left: `${region.x}%`,
    top: `${region.y}%`,
    width: `${region.width}%`,
    height: `${region.height}%`,
  }
}

function tokenAnchor(token: NemesisSubBoardToken): SubBoardAnchor | undefined {
  return anchorsByRegion.value.get(token.regionId)
}

function tokenStyle(token: NemesisSubBoardToken) {
  const anchor = tokenAnchor(token)
  if (!anchor) return { display: 'none' }
  return {
    left: `${anchor.x}%`,
    top: `${anchor.y}%`,
    width: `${anchor.tokenSize.width}%`,
    height: `${anchor.tokenSize.height}%`,
  }
}

function onRegionClick(event: MouseEvent, regionId: string) {
  if (selectable.value.has(regionId)) {
    event.stopPropagation()
    emit('selectRegion', regionId)
    return
  }
  if (!available.value.has(regionId)) return
  event.stopPropagation()
  emit('activate', regionId)
}
</script>

<template>
  <section class="nemesis-sub-board" aria-label="Nemesis Sub Board" :style="{ '--sub-board-ratio': layout.imageSize.width / layout.imageSize.height }" @click="emit('preview')">
    <img class="nemesis-sub-board-image" :src="imageUrl" :alt="layout.boardName" draggable="false" />
    <button
      v-for="region in layout.regions"
      :key="region.id"
      type="button"
      class="nemesis-sub-board-region"
      :class="{
        'is-available': available.has(region.id),
        'is-selectable': selectable.has(region.id),
        'game-highlight': available.has(region.id) || selectable.has(region.id),
        'game-highlight--available': available.has(region.id),
        'game-highlight--choice': selectable.has(region.id),
      }"
      :style="regionStyle(region)"
      :aria-disabled="!available.has(region.id) && !selectable.has(region.id)"
      :aria-label="region.label"
      @click="onRegionClick($event, region.id)"
    />
    <img
      v-for="token in tokens"
      :key="token.instanceId"
      class="nemesis-sub-board-token"
      :class="{ 'nemesis-sub-board-token--terror': token.tokenId === 'terror' }"
      :src="tokenImageUrl(token.tokenId)"
      :alt="`${token.tokenId} token`"
      :style="tokenStyle(token)"
      draggable="false"
    />
  </section>
</template>
