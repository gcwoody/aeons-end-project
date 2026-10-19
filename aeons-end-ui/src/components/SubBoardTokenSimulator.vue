<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { SubBoardLayoutDocument, SubBoardRegion } from './sub-board-layout'
import nemesisTokenImage from '../../../image-database/common images/NemesisToken.png'
import terrorTokenImage from '../../../image-database/cards/wave9/nemesis/The Terror in Brass/The Terror in Brass Token.jpg'

type TokenType = 'nemesis' | 'terror'
type PlacedToken = { id: number; type: TokenType; anchorId: string }
type ResizeHandle = 'n' | 'e' | 's' | 'w' | 'ne' | 'se' | 'sw' | 'nw'
type AnchorEdit = { anchorId: string; x?: number; y?: number; tokenSize?: { width?: number; height?: number } }
type PointerEdit = {
  pointerId: number
  anchorId: string
  kind: 'move' | 'resize'
  handle?: ResizeHandle
  start: { x: number; y: number }
  initial: { x: number; y: number; width: number; height: number }
}

const props = defineProps<{
  imageUrl: string
  imageAlt: string
  layout: SubBoardLayoutDocument
}>()
const emit = defineEmits<{
  (event: 'anchor-edit-start', anchorId: string): void
  (event: 'anchor-edit', change: AnchorEdit): void
  (event: 'anchor-edit-end', anchorId: string): void
  (event: 'nudge-anchor', change: { anchorId: string; x: number; y: number }): void
  (event: 'save'): void
  (event: 'undo'): void
}>()

const tokenTypes: Record<TokenType, { label: string; imageUrl: string }> = {
  nemesis: { label: 'Nemesis token', imageUrl: nemesisTokenImage },
  terror: { label: 'The Terror token', imageUrl: terrorTokenImage },
}

const tokens = ref<PlacedToken[]>([])
const board = ref<HTMLElement | null>(null)
const selectedTokenId = ref<number | null>(null)
const placementType = ref<TokenType | null>(null)
const statusMessage = ref('Choose a token to place, or select a token on the board to move it.')
const resizeHandles: ResizeHandle[] = ['n', 'e', 's', 'w', 'ne', 'se', 'sw', 'nw']
let pointerEdit: PointerEdit | null = null
let nextTokenId = 1

const stageStyle = computed(() => ({
  aspectRatio: `${props.layout.imageSize.width || 1} / ${props.layout.imageSize.height || 1}`,
}))
const placedTokens = computed(() => tokens.value.flatMap(token => {
  const anchor = props.layout.anchors.find(item => item.id === token.anchorId)
  if (!anchor) return []
  return [{ ...token, anchor, ...tokenTypes[token.type] }]
}))
const occupiedAnchorIds = computed(() => new Set(tokens.value.map(token => token.anchorId)))

watch(
  () => props.layout.anchors.map(anchor => anchor.id),
  (anchorIds) => {
    const validAnchorIds = new Set(anchorIds)
    tokens.value = tokens.value.filter(token => validAnchorIds.has(token.anchorId))
    if (selectedTokenId.value !== null && !tokens.value.some(token => token.id === selectedTokenId.value)) {
      selectedTokenId.value = null
    }
  },
)

function regionStyle(region: SubBoardRegion) {
  return {
    left: `${region.x}%`,
    top: `${region.y}%`,
    width: `${region.width}%`,
    height: `${region.height}%`,
  }
}

function tokenStyle(anchor: { x: number; y: number; tokenSize: { width: number; height: number } }) {
  return {
    left: `${anchor.x}%`,
    top: `${anchor.y}%`,
    width: `${anchor.tokenSize.width}%`,
    height: `${anchor.tokenSize.height}%`,
  }
}

function beginPlacement(type: TokenType) {
  placementType.value = type
  selectedTokenId.value = null
  statusMessage.value = `Click an empty region to place ${tokenTypes[type].label}.`
}

function selectToken(token: PlacedToken) {
  selectedTokenId.value = token.id
  statusMessage.value = `${tokenTypes[token.type].label} selected. Drag to move, drag an edge or corner to resize, or use the arrow keys to nudge it.${placementType.value ? ` ${tokenTypes[placementType.value].label} placement mode remains active.` : ''}`
}

function boardPoint(event: PointerEvent) {
  const bounds = board.value?.getBoundingClientRect()
  if (!bounds?.width || !bounds.height) return null
  return {
    x: ((event.clientX - bounds.left) / bounds.width) * 100,
    y: ((event.clientY - bounds.top) / bounds.height) * 100,
  }
}

function beginTokenEdit(event: PointerEvent, token: PlacedToken, kind: PointerEdit['kind'], handle?: ResizeHandle) {
  if (event.button !== 0) return
  event.preventDefault()
  event.stopPropagation()
  selectToken(token)
  const point = boardPoint(event)
  const anchor = props.layout.anchors.find(item => item.id === token.anchorId)
  if (!point || !anchor) return
  pointerEdit = {
    pointerId: event.pointerId,
    anchorId: anchor.id,
    kind,
    handle,
    start: point,
    initial: { x: anchor.x, y: anchor.y, width: anchor.tokenSize.width, height: anchor.tokenSize.height },
  }
  emit('anchor-edit-start', anchor.id)
  ;(event.currentTarget as HTMLElement).closest<HTMLButtonElement>('.sub-board-simulator-token')?.focus({ preventScroll: true })
  ;(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId)
}

function beginTokenMove(event: PointerEvent, token: PlacedToken) {
  beginTokenEdit(event, token, 'move')
}

function beginTokenResize(event: PointerEvent, token: PlacedToken, handle: ResizeHandle) {
  beginTokenEdit(event, token, 'resize', handle)
}

function updateTokenEdit(event: PointerEvent) {
  const edit = pointerEdit
  const point = boardPoint(event)
  if (!edit || edit.pointerId !== event.pointerId || !point) return
  const deltaX = point.x - edit.start.x
  const deltaY = point.y - edit.start.y

  if (edit.kind === 'move') {
    emit('anchor-edit', {
      anchorId: edit.anchorId,
      x: edit.initial.x + deltaX,
      y: edit.initial.y + deltaY,
    })
    return
  }

  const minSize = 0.5
  let left = edit.initial.x - edit.initial.width / 2
  let right = edit.initial.x + edit.initial.width / 2
  let top = edit.initial.y - edit.initial.height / 2
  let bottom = edit.initial.y + edit.initial.height / 2
  if (edit.handle?.includes('w')) left = Math.max(0, Math.min(right - minSize, left + deltaX))
  else if (edit.handle?.includes('e')) right = Math.min(100, Math.max(left + minSize, right + deltaX))
  if (edit.handle?.includes('n')) top = Math.max(0, Math.min(bottom - minSize, top + deltaY))
  else if (edit.handle?.includes('s')) bottom = Math.min(100, Math.max(top + minSize, bottom + deltaY))
  emit('anchor-edit', {
    anchorId: edit.anchorId,
    x: (left + right) / 2,
    y: (top + bottom) / 2,
    tokenSize: { width: right - left, height: bottom - top },
  })
}

function finishTokenEdit(event: PointerEvent) {
  const edit = pointerEdit
  if (!edit || edit.pointerId !== event.pointerId) return
  pointerEdit = null
  emit('anchor-edit-end', edit.anchorId)
  if ((event.currentTarget as HTMLElement).hasPointerCapture(event.pointerId)) {
    ;(event.currentTarget as HTMLElement).releasePointerCapture(event.pointerId)
  }
}

function handleTokenKeydown(event: KeyboardEvent, token: PlacedToken) {
  if (selectedTokenId.value !== token.id) return
  if ((event.ctrlKey || event.metaKey) && !event.shiftKey && event.key.toLowerCase() === 'z') {
    event.preventDefault()
    event.stopPropagation()
    emit('undo')
    return
  }
  const delta = 0.1
  const movement = {
    ArrowLeft: { x: -delta, y: 0 },
    ArrowRight: { x: delta, y: 0 },
    ArrowUp: { x: 0, y: -delta },
    ArrowDown: { x: 0, y: delta },
  }[event.key]
  if (!movement || event.altKey || event.ctrlKey || event.metaKey) return
  const anchor = props.layout.anchors.find(item => item.id === token.anchorId)
  if (!anchor) return
  const halfWidth = anchor.tokenSize.width / 2
  const halfHeight = anchor.tokenSize.height / 2
  const nextX = Math.max(halfWidth, Math.min(100 - halfWidth, anchor.x + movement.x))
  const nextY = Math.max(halfHeight, Math.min(100 - halfHeight, anchor.y + movement.y))
  if (nextX === anchor.x && nextY === anchor.y) {
    event.preventDefault()
    event.stopPropagation()
    statusMessage.value = 'The preview token cannot move farther in that direction.'
    return
  }
  event.preventDefault()
  event.stopPropagation()
  emit('nudge-anchor', { anchorId: token.anchorId, ...movement })
  statusMessage.value = `${tokenTypes[token.type].label} nudged by 0.1%.`
}

function handleRegionClick(region: SubBoardRegion) {
  const anchor = props.layout.anchors.find(item => item.regionId === region.id)
  if (!anchor) {
    statusMessage.value = `${region.label} has no token anchor. Add or bind one in the layout editor first.`
    return
  }

  if (placementType.value) {
    if (occupiedAnchorIds.value.has(anchor.id)) {
      statusMessage.value = `${region.label} already contains a token.`
      return
    }
    tokens.value.push({ id: nextTokenId++, type: placementType.value, anchorId: anchor.id })
    statusMessage.value = `${tokenTypes[placementType.value].label} placed on ${region.label}. Placement mode remains active; click another empty region or choose a different token type.`
    return
  }

  const selectedToken = tokens.value.find(token => token.id === selectedTokenId.value)
  if (!selectedToken) {
    statusMessage.value = `${region.label} is connected to anchor ${anchor.id}. Choose a token or select one to move.`
    return
  }
  if (occupiedAnchorIds.value.has(anchor.id) && selectedToken.anchorId !== anchor.id) {
    statusMessage.value = `${region.label} already contains a token. Choose an empty region.`
    return
  }
  selectedToken.anchorId = anchor.id
  statusMessage.value = `${tokenTypes[selectedToken.type].label} moved to ${region.label}.`
}

function removeSelectedToken() {
  const removed = tokens.value.find(token => token.id === selectedTokenId.value)
  if (!removed) return
  tokens.value = tokens.value.filter(token => token.id !== removed.id)
  selectedTokenId.value = null
  statusMessage.value = `${tokenTypes[removed.type].label} removed from the board.`
}

function clearTokens() {
  tokens.value = []
  selectedTokenId.value = null
  placementType.value = null
  statusMessage.value = 'All simulated tokens cleared.'
}
</script>

<template>
  <section class="sub-board-simulator" aria-label="Sub board token interaction simulator" data-component="SubBoard.TokenSimulator">
    <div class="sub-board-simulator-heading">
      <div>
        <p class="sub-board-simulator-kicker">Interactive preview</p>
        <h3>Token placement and movement</h3>
      </div>
      <span>{{ tokens.length }} token{{ tokens.length === 1 ? '' : 's' }} on board</span>
    </div>

    <div class="sub-board-simulator-controls">
      <button type="button" class="btn" :class="{ primary: placementType === 'nemesis' }" @click="beginPlacement('nemesis')">Place Nemesis token</button>
      <button type="button" class="btn" :class="{ primary: placementType === 'terror' }" @click="beginPlacement('terror')">Place Terror token</button>
      <button type="button" class="btn" :disabled="selectedTokenId === null" @click="removeSelectedToken">Remove selected</button>
      <button type="button" class="btn" :disabled="tokens.length === 0" @click="clearTokens">Clear tokens</button>
      <button type="button" class="btn primary" @click="emit('save')">Save layout</button>
    </div>

    <p class="sub-board-simulator-help">Place: choose a token, then click one or more empty regions; placement stays active until you choose another token type. Adjust: select a token, drag it to move its anchor, drag an edge or corner to resize it, or use the arrow keys for 0.1% position changes. All adjustments update the layout and can be saved here.</p>

    <div ref="board" class="sub-board-simulator-board" :style="stageStyle" @pointermove="updateTokenEdit" @pointerup="finishTokenEdit" @pointercancel="finishTokenEdit">
      <img class="sub-board-simulator-background" :src="imageUrl" :alt="imageAlt" draggable="false" />
      <button
        v-for="region in layout.regions"
        :key="region.id"
        type="button"
        class="sub-board-simulator-region"
        :class="{ occupied: layout.anchors.some(anchor => anchor.regionId === region.id && occupiedAnchorIds.has(anchor.id)) }"
        :style="regionStyle(region)"
        :aria-label="`${region.label}${occupiedAnchorIds.has(layout.anchors.find(anchor => anchor.regionId === region.id)?.id ?? '') ? ', occupied' : ', empty'}`"
        @click="handleRegionClick(region)"
      >
        <span>{{ region.label }}</span>
      </button>
      <button
        v-for="token in placedTokens"
        :key="token.id"
        type="button"
        class="sub-board-simulator-token"
        :class="{ selected: selectedTokenId === token.id }"
        :style="tokenStyle(token.anchor)"
        :aria-label="`${token.label} on ${layout.regions.find(region => region.id === token.anchor.regionId)?.label ?? 'unlinked region'}`"
        @pointerdown="beginTokenMove($event, token)"
        @click.stop="selectToken(token)"
        @keydown.stop="handleTokenKeydown($event, token)"
      >
        <img :src="token.imageUrl" :alt="token.label" draggable="false" />
        <span
          v-for="handle in selectedTokenId === token.id ? resizeHandles : []"
          :key="`resize-${handle}`"
          class="sub-board-simulator-resize-handle"
          :class="`handle-${handle}`"
          :aria-label="`Resize ${token.label} ${handle}`"
          @pointerdown.stop="beginTokenResize($event, token, handle)"
        />
      </button>
    </div>
    <p class="sub-board-simulator-status" role="status" aria-live="polite">{{ statusMessage }}</p>
  </section>
</template>

<style scoped>
.sub-board-simulator { display: grid; gap: 10px; margin-top: 18px; padding: 14px; border: 1px solid var(--border); border-radius: 8px; background: rgba(13, 16, 24, .78); }
.sub-board-simulator-heading { display: flex; flex-wrap: wrap; align-items: end; justify-content: space-between; gap: 8px; }
.sub-board-simulator-heading h3 { margin: 0; color: var(--text); font-size: 16px; }
.sub-board-simulator-heading > span,
.sub-board-simulator-kicker { color: var(--muted); font-size: 11px; }
.sub-board-simulator-kicker { margin: 0 0 3px; text-transform: uppercase; letter-spacing: .06em; }
.sub-board-simulator-controls { display: flex; flex-wrap: wrap; gap: 7px; }
.sub-board-simulator-help { margin: 0; color: var(--muted); font-size: 12px; line-height: 1.45; }
.sub-board-simulator-board { position: relative; width: min(100%, 1000px); overflow: hidden; margin: 0 auto; border: 1px solid rgba(255,255,255,.24); border-radius: 7px; background: #0d1018; }
.sub-board-simulator-background { position: absolute; inset: 0; display: block; width: 100%; height: 100%; object-fit: fill; pointer-events: none; }
.sub-board-simulator-region { position: absolute; z-index: 1; box-sizing: border-box; overflow: hidden; padding: 2px; border: 1px dashed rgba(255, 224, 119, .84); border-radius: 4px; background: rgba(255, 209, 73, .08); color: #fff4cc; font-size: clamp(7px, .75vw, 10px); cursor: pointer; }
.sub-board-simulator-region span { display: inline-block; max-width: 100%; overflow: hidden; padding: 1px 3px; border-radius: 2px; background: rgba(10, 14, 22, .76); text-overflow: ellipsis; white-space: nowrap; }
.sub-board-simulator-region:hover { border-style: solid; background: rgba(255, 209, 73, .25); }
.sub-board-simulator-region.occupied { border-color: rgba(118, 224, 187, .92); background: rgba(87, 209, 162, .12); }
.sub-board-simulator-token { position: absolute; z-index: 2; display: grid; place-items: center; box-sizing: border-box; overflow: visible; padding: 2px; transform: translate(-50%, -50%); border: 2px solid transparent; border-radius: 5px; background: transparent; cursor: move; touch-action: none; }
.sub-board-simulator-token img { display: block; width: 100%; height: 100%; object-fit: contain; filter: drop-shadow(0 2px 4px rgba(0,0,0,.8)); pointer-events: none; }
.sub-board-simulator-token.selected { border-color: #ffe16b; background: rgba(255, 225, 107, .16); filter: drop-shadow(0 0 4px rgba(255,225,107,.65)); }
.sub-board-simulator-resize-handle { position: absolute; z-index: 3; display: block; width: 10px; height: 10px; border: 0; border-radius: 0; background: transparent; touch-action: none; }
.sub-board-simulator-resize-handle.handle-n { top: -6px; left: 10px; right: 10px; width: auto; cursor: ns-resize; }
.sub-board-simulator-resize-handle.handle-e { top: 10px; right: -6px; bottom: 10px; height: auto; cursor: ew-resize; }
.sub-board-simulator-resize-handle.handle-s { right: 10px; bottom: -6px; left: 10px; width: auto; cursor: ns-resize; }
.sub-board-simulator-resize-handle.handle-w { top: 10px; bottom: 10px; left: -6px; height: auto; cursor: ew-resize; }
.sub-board-simulator-resize-handle.handle-ne { top: -6px; right: -6px; cursor: nesw-resize; }
.sub-board-simulator-resize-handle.handle-se { right: -6px; bottom: -6px; cursor: nwse-resize; }
.sub-board-simulator-resize-handle.handle-sw { bottom: -6px; left: -6px; cursor: nesw-resize; }
.sub-board-simulator-resize-handle.handle-nw { top: -6px; left: -6px; cursor: nwse-resize; }
.sub-board-simulator-status { min-height: 18px; margin: 0; color: var(--accent); font-size: 12px; }
</style>
