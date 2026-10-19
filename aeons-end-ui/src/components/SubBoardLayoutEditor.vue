<script setup lang="ts">
import { computed, onBeforeUnmount, reactive, ref, shallowReactive, watch } from 'vue'
import type {
  SubBoardAnchor,
  SubBoardImageOption,
  SubBoardLayoutDocument,
  SubBoardRegion,
} from './sub-board-layout'
import SubBoardTokenSimulator from './SubBoardTokenSimulator.vue'

type EditorMode = 'select' | 'draw-region' | 'place-anchor'
type Point = { x: number; y: number }
type ResizeHandle = 'n' | 'e' | 's' | 'w' | 'ne' | 'se' | 'sw' | 'nw'
type CopiedLayoutItems = { regions: SubBoardRegion[]; anchors: SubBoardAnchor[] }
type TokenSize = { width: number; height: number }
type PreviewAnchorEdit = { anchorId: string; x?: number; y?: number; tokenSize?: { width?: number; height?: number } }
type SaveFeedback = { tone: 'success' | 'error' | 'download'; message: string }
type HistoryEntry = { boardId: string; layout: SubBoardLayoutDocument }
type LayoutFilePickerOptions = {
  multiple?: boolean
  suggestedName?: string
  types?: Array<{ description: string; accept: Record<string, string[]> }>
}
type LayoutFilePickerWindow = Window & {
  showOpenFilePicker?: (options?: LayoutFilePickerOptions) => Promise<FileSystemFileHandle[]>
  showSaveFilePicker?: (options?: LayoutFilePickerOptions) => Promise<FileSystemFileHandle>
}
type LayoutSaveTarget = { fileName: string; fileHandle: FileSystemFileHandle | null; savedJson: string }
type Gesture =
  | { kind: 'draw-region'; pointerId: number; regionId: string; start: Point }
  | { kind: 'move-region'; pointerId: number; regionId: string; start: Point; initial: SubBoardRegion }
  | { kind: 'move-selection'; pointerId: number; start: Point; regions: SubBoardRegion[]; anchors: SubBoardAnchor[] }
  | { kind: 'resize-region'; pointerId: number; regionId: string; handle: ResizeHandle; start: Point; initial: SubBoardRegion }
  | { kind: 'resize-anchor-token'; pointerId: number; anchorId: string; handle: ResizeHandle; start: Point; center: Point; initial: TokenSize }
  | { kind: 'move-anchor'; pointerId: number; anchorId: string; start: Point; initial: Point }

const props = defineProps<{ examples: SubBoardImageOption[] }>()

const editorRoot = ref<HTMLElement | null>(null)
const selectedBoardId = ref(props.examples[0]?.id ?? '')
const layouts = reactive<Record<string, SubBoardLayoutDocument>>({})
const layoutSaveTargets = shallowReactive<Record<string, LayoutSaveTarget>>({})
const customImage = ref<SubBoardImageOption | null>(null)
const stage = ref<HTMLElement | null>(null)
const imagePicker = ref<HTMLInputElement | null>(null)
const layoutPicker = ref<HTMLInputElement | null>(null)
const resizeHandles: ResizeHandle[] = ['n', 'e', 's', 'w', 'ne', 'se', 'sw', 'nw']
const tokenResizeHandles: ResizeHandle[] = ['n', 'e', 's', 'w', 'ne', 'se', 'sw', 'nw']
const defaultTokenSize: TokenSize = { width: 4, height: 4 }
const minimumTokenSize = 0.5
const mode = ref<EditorMode>('select')
const selectedRegionIds = ref<string[]>([])
const selectedAnchorIds = ref<string[]>([])
const regionIdDraft = ref('')
const anchorIdDraft = ref('')
const gesture = ref<Gesture | null>(null)
const copiedItems = ref<CopiedLayoutItems | null>(null)
const undoHistory = ref<HistoryEntry[]>([])
const hasPendingHistory = ref(false)
let pendingHistory: HistoryEntry | null = null
const showIds = ref(true)
const statusMessage = ref('Select a tool, then edit the regions and token anchors on the image.')
const saveFeedback = ref<SaveFeedback | null>(null)
let saveFeedbackTimeout: number | null = null

const imageOptions = computed(() => [
  ...props.examples,
  ...(customImage.value ? [customImage.value] : []),
])
const activeImage = computed(() => imageOptions.value.find(option => option.id === selectedBoardId.value) ?? null)
const activeLayout = computed(() => layouts[selectedBoardId.value] ?? null)
const selectionCount = computed(() => selectedRegionIds.value.length + selectedAnchorIds.value.length)
const selectedRegion = computed(() => selectedRegionIds.value.length === 1 && selectedAnchorIds.value.length === 0
  ? activeLayout.value?.regions.find(region => region.id === selectedRegionIds.value[0]) ?? null
  : null)
const selectedAnchor = computed(() => selectedAnchorIds.value.length === 1 && selectedRegionIds.value.length === 0
  ? activeLayout.value?.anchors.find(anchor => anchor.id === selectedAnchorIds.value[0]) ?? null
  : null)
const selectedAnchorRegion = computed(() => activeLayout.value?.regions.find(region => region.id === selectedAnchor.value?.regionId) ?? null)
const relatedAnchor = computed(() => selectedRegion.value
  ? activeLayout.value?.anchors.find(anchor => anchor.regionId === selectedRegion.value?.id) ?? null
  : null)
const selectedGroupBounds = computed(() => {
  const regions = (activeLayout.value?.regions ?? []).filter(region => selectedRegionIds.value.includes(region.id))
  const anchors = (activeLayout.value?.anchors ?? []).filter(anchor => selectedAnchorIds.value.includes(anchor.id))
  const xValues = [
    ...regions.flatMap(region => [region.x, region.x + region.width]),
    ...anchors.flatMap(anchor => [anchor.x - anchor.tokenSize.width / 2, anchor.x + anchor.tokenSize.width / 2]),
  ]
  const yValues = [
    ...regions.flatMap(region => [region.y, region.y + region.height]),
    ...anchors.flatMap(anchor => [anchor.y - anchor.tokenSize.height / 2, anchor.y + anchor.tokenSize.height / 2]),
  ]
  if (xValues.length === 0 || yValues.length === 0) return null
  return {
    x: Math.min(...xValues),
    y: Math.min(...yValues),
    right: Math.max(...xValues),
    bottom: Math.max(...yValues),
  }
})
const selectedGroupX = computed({
  get: () => selectedGroupBounds.value?.x ?? 0,
  set: (value: number) => translateSelectedGroup('x', value),
})
const selectedGroupY = computed({
  get: () => selectedGroupBounds.value?.y ?? 0,
  set: (value: number) => translateSelectedGroup('y', value),
})
const selectedGroupLabel = computed({
  get: () => {
    const layout = activeLayout.value
    if (!layout) return ''
    const labels = [
      ...layout.regions.filter(region => selectedRegionIds.value.includes(region.id)).map(region => region.label),
      ...layout.anchors.filter(anchor => selectedAnchorIds.value.includes(anchor.id)).map(anchor => anchor.label),
    ]
    return labels.length > 0 && labels.every(label => label === labels[0]) ? labels[0] : ''
  },
  set: (label: string) => {
    const layout = activeLayout.value
    if (!layout) return
    for (const region of layout.regions) {
      if (selectedRegionIds.value.includes(region.id)) region.label = label
    }
    for (const anchor of layout.anchors) {
      if (selectedAnchorIds.value.includes(anchor.id)) anchor.label = label
    }
  },
})
const stageStyle = computed(() => {
  const width = activeLayout.value?.imageSize.width || activeImage.value?.width || 1
  const height = activeLayout.value?.imageSize.height || activeImage.value?.height || 1
  return { aspectRatio: `${width} / ${height}` }
})
function cloneParts<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

function captureHistoryEntry(boardId = selectedBoardId.value): HistoryEntry | null {
  const layout = layouts[boardId]
  return layout ? { boardId, layout: cloneParts(layout) } : null
}

function recordUndoEntry(before: HistoryEntry | null) {
  if (!before) return
  const current = layouts[before.boardId]
  if (!current || JSON.stringify(current) === JSON.stringify(before.layout)) return
  undoHistory.value.push(before)
  if (undoHistory.value.length > 100) undoHistory.value.shift()
}

function beginHistoryTransaction(boardId = selectedBoardId.value) {
  if (!pendingHistory) {
    pendingHistory = captureHistoryEntry(boardId)
    hasPendingHistory.value = !!pendingHistory
  }
}

function beginFieldHistoryTransaction(_event: FocusEvent) {
  beginHistoryTransaction()
}

function commitHistoryTransaction() {
  const before = pendingHistory
  pendingHistory = null
  hasPendingHistory.value = false
  recordUndoEntry(before)
}

function commitInspectorEdits() {
  if (selectedRegion.value) {
    normalizeSelectedRegion()
    applyRegionId()
  } else if (selectedAnchor.value) {
    normalizeSelectedAnchor()
    applyAnchorId()
  }
  commitHistoryTransaction()
}

function restoreHistoryEntry(entry: HistoryEntry) {
  layouts[entry.boardId] = cloneParts(entry.layout)
  selectedBoardId.value = entry.boardId
  selectedRegionIds.value = []
  selectedAnchorIds.value = []
  regionIdDraft.value = ''
  anchorIdDraft.value = ''
  gesture.value = null
  statusMessage.value = 'Last edit undone.'
}

function undoLastOperation() {
  if (pendingHistory) {
    const before = pendingHistory
    pendingHistory = null
    hasPendingHistory.value = false
    restoreHistoryEntry(before)
    return
  }
  const entry = undoHistory.value.pop()
  if (entry) restoreHistoryEntry(entry)
  else statusMessage.value = 'There is no editor action to undo.'
}

function emptyLayout(image: SubBoardImageOption): SubBoardLayoutDocument {
  return {
    schemaVersion: 2,
    boardId: image.id,
    boardName: image.label,
    imageFile: image.imageFile,
    imageSize: { width: image.width || 1, height: image.height || 1 },
    regions: cloneParts(image.starterLayout?.regions ?? []).map(region => ({
      ...region,
      x: rounded(region.x), y: rounded(region.y),
      width: rounded(region.width), height: rounded(region.height),
    })),
    anchors: cloneParts(image.starterLayout?.anchors ?? []).map(anchor => ({
      ...anchor,
      tokenSize: { ...anchor.tokenSize },
      x: rounded(anchor.x), y: rounded(anchor.y),
    })),
  }
}

function ensureLayout(boardId: string) {
  const image = imageOptions.value.find(option => option.id === boardId)
  if (image && !layouts[boardId]) layouts[boardId] = emptyLayout(image)
}

watch(selectedBoardId, (boardId) => {
  ensureLayout(boardId)
  selectedRegionIds.value = []
  selectedAnchorIds.value = []
  regionIdDraft.value = ''
  anchorIdDraft.value = ''
  gesture.value = null
  mode.value = 'select'
}, { immediate: true })

function clamp(value: number, min = 0, max = 100): number {
  return Math.max(min, Math.min(max, value))
}

function rounded(value: number): number {
  return Math.round(value * 100) / 100
}

function boundedCoordinate(value: number, min = 0, max = 100): number {
  return rounded(clamp(value, min, max))
}

function translateSelectedGroup(axis: 'x' | 'y', requestedPosition: number) {
  const layout = activeLayout.value
  const bounds = selectedGroupBounds.value
  if (!layout || !bounds || !Number.isFinite(requestedPosition)) return
  const currentPosition = axis === 'x' ? bounds.x : bounds.y
  const farEdge = axis === 'x' ? bounds.right : bounds.bottom
  const delta = clamp(rounded(requestedPosition) - currentPosition, -currentPosition, 100 - farEdge)
  if (axis === 'x') {
    for (const region of layout.regions) {
      if (selectedRegionIds.value.includes(region.id)) region.x = boundedCoordinate(region.x + delta, 0, 100 - region.width)
    }
    for (const anchor of layout.anchors) {
      if (selectedAnchorIds.value.includes(anchor.id)) {
        anchor.x = boundedCoordinate(anchor.x + delta, anchor.tokenSize.width / 2, 100 - anchor.tokenSize.width / 2)
      }
    }
  } else {
    for (const region of layout.regions) {
      if (selectedRegionIds.value.includes(region.id)) region.y = boundedCoordinate(region.y + delta, 0, 100 - region.height)
    }
    for (const anchor of layout.anchors) {
      if (selectedAnchorIds.value.includes(anchor.id)) {
        anchor.y = boundedCoordinate(anchor.y + delta, anchor.tokenSize.height / 2, 100 - anchor.tokenSize.height / 2)
      }
    }
  }
}

function boardPoint(event: PointerEvent): Point | null {
  if (!stage.value) return null
  const bounds = stage.value.getBoundingClientRect()
  if (!bounds.width || !bounds.height) return null
  return {
    x: boundedCoordinate(((event.clientX - bounds.left) / bounds.width) * 100),
    y: boundedCoordinate(((event.clientY - bounds.top) / bounds.height) * 100),
  }
}

function findRegionAtPoint(point: Point) {
  return (activeLayout.value?.regions ?? [])
    .filter(region => point.x >= region.x && point.x <= region.x + region.width
      && point.y >= region.y && point.y <= region.y + region.height)
    .sort((left, right) => left.width * left.height - right.width * right.height)[0] ?? null
}

function updateAnchorRegionBinding(anchor: SubBoardAnchor, point: Point) {
  const region = findRegionAtPoint(point)
  if (!region) {
    anchor.regionId = ''
    return
  }
  const alreadyBound = activeLayout.value?.anchors.some(item => item.id !== anchor.id && item.regionId === region.id)
  anchor.regionId = alreadyBound ? '' : region.id
}

function capturePointer(event: PointerEvent) {
  event.preventDefault()
  stage.value?.setPointerCapture(event.pointerId)
  editorRoot.value?.focus({ preventScroll: true })
}

function refreshInspectorDrafts() {
  regionIdDraft.value = selectedRegion.value?.id ?? ''
  anchorIdDraft.value = selectedAnchor.value?.id ?? ''
}

function selectOnlyRegion(id: string) {
  const target = activeLayout.value?.regions.find(region => region.id === id)
  commitInspectorEdits()
  selectedRegionIds.value = [target?.id ?? id]
  selectedAnchorIds.value = []
  refreshInspectorDrafts()
}

function selectOnlyAnchor(id: string) {
  const target = activeLayout.value?.anchors.find(anchor => anchor.id === id)
  commitInspectorEdits()
  selectedRegionIds.value = []
  selectedAnchorIds.value = [target?.id ?? id]
  refreshInspectorDrafts()
}

function clearSelection() {
  commitInspectorEdits()
  selectedRegionIds.value = []
  selectedAnchorIds.value = []
  refreshInspectorDrafts()
}

function toggleRegionSelection(id: string) {
  commitInspectorEdits()
  selectedRegionIds.value = selectedRegionIds.value.includes(id)
    ? selectedRegionIds.value.filter(selectedId => selectedId !== id)
    : [...selectedRegionIds.value, id]
  refreshInspectorDrafts()
}

function toggleAnchorSelection(id: string) {
  commitInspectorEdits()
  selectedAnchorIds.value = selectedAnchorIds.value.includes(id)
    ? selectedAnchorIds.value.filter(selectedId => selectedId !== id)
    : [...selectedAnchorIds.value, id]
  refreshInspectorDrafts()
}

function isMultiSelect(event: PointerEvent): boolean {
  return event.ctrlKey || event.metaKey
}

function nextId(prefix: string): string {
  const entities = [
    ...(activeLayout.value?.regions.map(region => region.id) ?? []),
    ...(activeLayout.value?.anchors.map(anchor => anchor.id) ?? []),
  ]
  let number = 1
  while (entities.includes(`${prefix}-${number}`)) number += 1
  return `${prefix}-${number}`
}

function beginDrawRegion(event: PointerEvent, point: Point) {
  const layout = activeLayout.value
  if (!layout) return
  commitInspectorEdits()
  beginHistoryTransaction()
  const id = nextId('region')
  layout.regions.push({ id, label: `Region ${id.split('-').pop() ?? '1'}`, x: point.x, y: point.y, width: 0.2, height: 0.2 })
  selectedRegionIds.value = [id]
  selectedAnchorIds.value = []
  refreshInspectorDrafts()
  capturePointer(event)
  gesture.value = { kind: 'draw-region', pointerId: event.pointerId, regionId: id, start: point }
}

function addAnchorAtPoint(
  point: Point,
  status = 'Anchor added. Choose Select and drag it to adjust its position.',
  requestedRegionId?: string,
) {
  const layout = activeLayout.value
  if (!layout) return
  const region = requestedRegionId
    ? layout.regions.find(item => item.id === requestedRegionId) ?? null
    : findRegionAtPoint(point)
  commitInspectorEdits()
  if (!region) {
    statusMessage.value = 'Place an anchor inside a region so it can be linked to that region.'
    return
  }
  const existingAnchor = layout.anchors.find(anchor => anchor.regionId === region.id)
  if (existingAnchor) {
    selectOnlyAnchor(existingAnchor.id)
    statusMessage.value = `${region.label} already has an anchor; its anchor is selected.`
    return
  }
  const before = captureHistoryEntry()
  const id = nextId('anchor')
  const tokenSize = { ...defaultTokenSize }
  const anchorPoint = {
    x: boundedCoordinate(point.x, tokenSize.width / 2, 100 - tokenSize.width / 2),
    y: boundedCoordinate(point.y, tokenSize.height / 2, 100 - tokenSize.height / 2),
  }
  layout.anchors.push({
    id,
    label: `Anchor ${id.split('-').pop() ?? '1'}`,
    regionId: region.id,
    ...anchorPoint,
    tokenSize,
  })
  selectOnlyAnchor(id)
  recordUndoEntry(before)
  statusMessage.value = status
}

function beginPlaceAnchor(point: Point) {
  addAnchorAtPoint(point)
}

function createAnchorAtRegionCenter(event: MouseEvent, region: SubBoardRegion) {
  event.preventDefault()
  if (mode.value !== 'select' || !activeLayout.value) return
  selectOnlyRegion(region.id)
  const center = {
    x: boundedCoordinate(region.x + region.width / 2),
    y: boundedCoordinate(region.y + region.height / 2),
  }
  addAnchorAtPoint(center, `Anchor added at the center of ${region.label}.`, region.id)
}

function handleStagePointerDown(event: PointerEvent) {
  if (event.button !== 0) return
  if (mode.value === 'select') {
    if (!isMultiSelect(event)) clearSelection()
    return
  }
  const point = boardPoint(event)
  if (!point) return
  if (mode.value === 'draw-region') beginDrawRegion(event, point)
  else if (mode.value === 'place-anchor') beginPlaceAnchor(point)
}

function startRegionGesture(event: PointerEvent, region: SubBoardRegion, kind: 'move-region' | 'resize-region', handle: ResizeHandle = 'se') {
  if (event.button !== 0) return
  commitInspectorEdits()
  if (mode.value !== 'select') {
    if (mode.value === 'draw-region') event.stopPropagation()
    return
  }
  event.stopPropagation()
  if (isMultiSelect(event)) {
    event.preventDefault()
    toggleRegionSelection(region.id)
    editorRoot.value?.focus({ preventScroll: true })
    return
  }
  if (!selectedRegionIds.value.includes(region.id)) selectOnlyRegion(region.id)
  const point = boardPoint(event)
  if (!point) return
  beginHistoryTransaction()
  capturePointer(event)
  if (kind === 'move-region' && selectionCount.value > 1) {
    gesture.value = {
      kind: 'move-selection',
      pointerId: event.pointerId,
      start: point,
      regions: (activeLayout.value?.regions ?? []).filter(item => selectedRegionIds.value.includes(item.id)).map(item => ({ ...item })),
      anchors: (activeLayout.value?.anchors ?? []).filter(item => selectedAnchorIds.value.includes(item.id)).map(item => ({ ...item })),
    }
  } else if (kind === 'resize-region') {
    gesture.value = { kind, pointerId: event.pointerId, regionId: region.id, handle, start: point, initial: { ...region } }
  } else {
    gesture.value = { kind, pointerId: event.pointerId, regionId: region.id, start: point, initial: { ...region } }
  }
}

function startAnchorMove(event: PointerEvent, anchor: SubBoardAnchor) {
  if (event.button !== 0) return
  commitInspectorEdits()
  if (mode.value !== 'select') {
    if (mode.value === 'draw-region') event.stopPropagation()
    return
  }
  event.stopPropagation()
  if (isMultiSelect(event)) {
    event.preventDefault()
    toggleAnchorSelection(anchor.id)
    editorRoot.value?.focus({ preventScroll: true })
    return
  }
  if (!selectedAnchorIds.value.includes(anchor.id)) selectOnlyAnchor(anchor.id)
  const point = boardPoint(event)
  if (!point) return
  beginHistoryTransaction()
  capturePointer(event)
  if (selectionCount.value > 1) {
    gesture.value = {
      kind: 'move-selection',
      pointerId: event.pointerId,
      start: point,
      regions: (activeLayout.value?.regions ?? []).filter(item => selectedRegionIds.value.includes(item.id)).map(item => ({ ...item })),
      anchors: (activeLayout.value?.anchors ?? []).filter(item => selectedAnchorIds.value.includes(item.id)).map(item => ({ ...item })),
    }
  } else {
    gesture.value = { kind: 'move-anchor', pointerId: event.pointerId, anchorId: anchor.id, start: point, initial: { x: anchor.x, y: anchor.y } }
  }
}

function startAnchorResize(event: PointerEvent, anchor: SubBoardAnchor, handle: ResizeHandle) {
  if (event.button !== 0) return
  event.stopPropagation()
  commitInspectorEdits()
  if (mode.value !== 'select') return
  if (isMultiSelect(event)) {
    toggleAnchorSelection(anchor.id)
    editorRoot.value?.focus({ preventScroll: true })
    return
  }
  if (!selectedAnchorIds.value.includes(anchor.id)) selectOnlyAnchor(anchor.id)
  const point = boardPoint(event)
  if (!point) return
  beginHistoryTransaction()
  capturePointer(event)
  gesture.value = {
    kind: 'resize-anchor-token',
    pointerId: event.pointerId,
    anchorId: anchor.id,
    handle,
    start: point,
    center: { x: anchor.x, y: anchor.y },
    initial: { ...anchor.tokenSize },
  }
}

function updateGesture(event: PointerEvent) {
  const currentGesture = gesture.value
  const point = boardPoint(event)
  const layout = activeLayout.value
  if (!currentGesture || currentGesture.pointerId !== event.pointerId || !point || !layout) return

  if (currentGesture.kind === 'draw-region') {
    const region = layout.regions.find(item => item.id === currentGesture.regionId)
    if (!region) return
    region.x = rounded(Math.min(currentGesture.start.x, point.x))
    region.y = rounded(Math.min(currentGesture.start.y, point.y))
    region.width = rounded(Math.abs(point.x - currentGesture.start.x))
    region.height = rounded(Math.abs(point.y - currentGesture.start.y))
  } else if (currentGesture.kind === 'move-region') {
    const region = layout.regions.find(item => item.id === currentGesture.regionId)
    if (!region) return
    region.x = boundedCoordinate(currentGesture.initial.x + point.x - currentGesture.start.x, 0, 100 - currentGesture.initial.width)
    region.y = boundedCoordinate(currentGesture.initial.y + point.y - currentGesture.start.y, 0, 100 - currentGesture.initial.height)
  } else if (currentGesture.kind === 'move-selection') {
    const deltaX = point.x - currentGesture.start.x
    const deltaY = point.y - currentGesture.start.y
    for (const initial of currentGesture.regions) {
      const region = layout.regions.find(item => item.id === initial.id)
      if (!region) continue
      region.x = boundedCoordinate(initial.x + deltaX, 0, 100 - initial.width)
      region.y = boundedCoordinate(initial.y + deltaY, 0, 100 - initial.height)
    }
    for (const initial of currentGesture.anchors) {
      const anchor = layout.anchors.find(item => item.id === initial.id)
      if (!anchor) continue
      anchor.x = boundedCoordinate(initial.x + deltaX, anchor.tokenSize.width / 2, 100 - anchor.tokenSize.width / 2)
      anchor.y = boundedCoordinate(initial.y + deltaY, anchor.tokenSize.height / 2, 100 - anchor.tokenSize.height / 2)
      updateAnchorRegionBinding(anchor, { x: anchor.x, y: anchor.y })
    }
  } else if (currentGesture.kind === 'resize-region') {
    const region = layout.regions.find(item => item.id === currentGesture.regionId)
    if (!region) return
    const initial = currentGesture.initial
    const deltaX = point.x - currentGesture.start.x
    const deltaY = point.y - currentGesture.start.y
    const minSize = 0.5
    if (currentGesture.handle.includes('w')) {
      const right = initial.x + initial.width
      region.x = boundedCoordinate(initial.x + deltaX, 0, right - minSize)
      region.width = rounded(right - region.x)
    } else if (currentGesture.handle.includes('e')) {
      region.width = boundedCoordinate(initial.width + deltaX, minSize, 100 - initial.x)
    }
    if (currentGesture.handle.includes('n')) {
      const bottom = initial.y + initial.height
      region.y = boundedCoordinate(initial.y + deltaY, 0, bottom - minSize)
      region.height = rounded(bottom - region.y)
    } else if (currentGesture.handle.includes('s')) {
      region.height = boundedCoordinate(initial.height + deltaY, minSize, 100 - initial.y)
    }
  } else if (currentGesture.kind === 'resize-anchor-token') {
    const anchor = layout.anchors.find(item => item.id === currentGesture.anchorId)
    if (!anchor) return
    const deltaX = point.x - currentGesture.start.x
    const deltaY = point.y - currentGesture.start.y
    const initialLeft = currentGesture.center.x - currentGesture.initial.width / 2
    const initialRight = currentGesture.center.x + currentGesture.initial.width / 2
    const initialTop = currentGesture.center.y - currentGesture.initial.height / 2
    const initialBottom = currentGesture.center.y + currentGesture.initial.height / 2
    let left = initialLeft
    let right = initialRight
    let top = initialTop
    let bottom = initialBottom
    if (currentGesture.handle.includes('w')) left = clamp(initialLeft + deltaX, 0, initialRight - minimumTokenSize)
    if (currentGesture.handle.includes('e')) right = clamp(initialRight + deltaX, initialLeft + minimumTokenSize, 100)
    if (currentGesture.handle.includes('n')) top = clamp(initialTop + deltaY, 0, initialBottom - minimumTokenSize)
    if (currentGesture.handle.includes('s')) bottom = clamp(initialBottom + deltaY, initialTop + minimumTokenSize, 100)
    anchor.x = rounded((left + right) / 2)
    anchor.y = rounded((top + bottom) / 2)
    anchor.tokenSize.width = rounded(right - left)
    anchor.tokenSize.height = rounded(bottom - top)
  } else {
    const anchor = layout.anchors.find(item => item.id === currentGesture.anchorId)
    if (!anchor) return
    anchor.x = boundedCoordinate(currentGesture.initial.x + point.x - currentGesture.start.x, anchor.tokenSize.width / 2, 100 - anchor.tokenSize.width / 2)
    anchor.y = boundedCoordinate(currentGesture.initial.y + point.y - currentGesture.start.y, anchor.tokenSize.height / 2, 100 - anchor.tokenSize.height / 2)
    updateAnchorRegionBinding(anchor, { x: anchor.x, y: anchor.y })
  }
}

function endGesture(event: PointerEvent) {
  const currentGesture = gesture.value
  if (!currentGesture || currentGesture.pointerId !== event.pointerId) return
  const layout = activeLayout.value
  if (currentGesture.kind === 'draw-region' && layout) {
    const regionIndex = layout.regions.findIndex(region => region.id === currentGesture.regionId)
    const region = layout.regions[regionIndex]
    if (region && (region.width < 0.5 || region.height < 0.5)) {
      layout.regions.splice(regionIndex, 1)
      selectedRegionIds.value = []
      selectedAnchorIds.value = []
      refreshInspectorDrafts()
      statusMessage.value = 'That region was too small and was removed. Drag across a larger area to draw a region.'
    } else if (region) {
      mode.value = 'select'
      statusMessage.value = 'Region added. Drag it to move it, or use an edge or corner handle to resize it.'
    }
  }
  if (layout && (currentGesture.kind === 'move-anchor' || currentGesture.kind === 'move-selection')) {
    const movedAnchors = currentGesture.kind === 'move-anchor'
      ? [layout.anchors.find(anchor => anchor.id === currentGesture.anchorId)].filter((anchor): anchor is SubBoardAnchor => !!anchor)
      : currentGesture.anchors.map(initial => layout.anchors.find(anchor => anchor.id === initial.id)).filter((anchor): anchor is SubBoardAnchor => !!anchor)
    const unboundAnchor = movedAnchors.find(anchor => !anchor.regionId)
    if (unboundAnchor) statusMessage.value = 'Drop the anchor inside a region that is not linked to another anchor.'
    else if (movedAnchors.length === 1) {
      const region = layout.regions.find(item => item.id === movedAnchors[0].regionId)
      statusMessage.value = region ? `Anchor linked to ${region.label}.` : 'Anchor moved.'
    }
  }
  gesture.value = null
  if (stage.value?.hasPointerCapture(event.pointerId)) stage.value.releasePointerCapture(event.pointerId)
  commitHistoryTransaction()
}

function regionStyle(region: SubBoardRegion) {
  return {
    left: `${region.x}%`,
    top: `${region.y}%`,
    width: `${region.width}%`,
    height: `${region.height}%`,
  }
}

function anchorStyle(anchor: SubBoardAnchor) {
  return {
    left: `${anchor.x}%`,
    top: `${anchor.y}%`,
    width: `${anchor.tokenSize.width}%`,
    height: `${anchor.tokenSize.height}%`,
  }
}

function deleteSelection() {
  const layout = activeLayout.value
  if (!layout || selectionCount.value === 0) return
  commitInspectorEdits()
  const deletingOnlyAnchors = selectedAnchorIds.value.length > 0 && selectedRegionIds.value.length === 0
  const pairedAnchorIds = new Set(selectedAnchorIds.value)
  for (const anchor of layout.anchors) {
    if (selectedRegionIds.value.includes(anchor.regionId)) pairedAnchorIds.add(anchor.id)
  }
  const before = captureHistoryEntry()
  layout.regions = layout.regions.filter(region => !selectedRegionIds.value.includes(region.id))
  layout.anchors = layout.anchors.filter(anchor => !pairedAnchorIds.has(anchor.id))
  selectedRegionIds.value = []
  selectedAnchorIds.value = []
  refreshInspectorDrafts()
  recordUndoEntry(before)
  statusMessage.value = deletingOnlyAnchors
    ? 'Selected anchor deleted. Its region remains and needs a new anchor before export.'
    : 'Selected items deleted.'
}

function copiedId(sourceId: string): string {
  const ids = new Set([
    ...(activeLayout.value?.regions.map(region => region.id) ?? []),
    ...(activeLayout.value?.anchors.map(anchor => anchor.id) ?? []),
  ])
  const base = `${sourceId}-copy`
  let id = base
  let suffix = 2
  while (ids.has(id)) id = `${base}-${suffix++}`
  return id
}

function nearbyPosition(value: number, max: number): number {
  const offset = 2
  return boundedCoordinate(value + offset <= max ? value + offset : Math.max(0, value - offset), 0, max)
}

function copySelection() {
  if (selectionCount.value === 0 || !activeLayout.value) return
  commitInspectorEdits()
  const pairedRegionIds = new Set(selectedRegionIds.value)
  const pairedAnchorIds = new Set(selectedAnchorIds.value)
  for (const anchor of activeLayout.value.anchors) {
    if (pairedRegionIds.has(anchor.regionId)) pairedAnchorIds.add(anchor.id)
  }
  copiedItems.value = {
    regions: activeLayout.value.regions.filter(region => pairedRegionIds.has(region.id)).map(region => ({ ...region })),
    anchors: activeLayout.value.anchors.filter(anchor => pairedAnchorIds.has(anchor.id)).map(anchor => ({
      ...anchor,
      tokenSize: { ...anchor.tokenSize },
    })),
  }
  const copiedCount = copiedItems.value.regions.length + copiedItems.value.anchors.length
  statusMessage.value = copiedItems.value.regions.length === 0 && copiedCount > 0
    ? `${copiedCount} anchor${copiedCount === 1 ? '' : 's'} copied. Paste, then drag each one into an available region to link it.`
    : `${copiedCount} linked item${copiedCount === 1 ? '' : 's'} copied. Press Ctrl+V to place copies nearby.`
}

function pasteCopy() {
  const layout = activeLayout.value
  const copies = copiedItems.value
  if (!layout || !copies) return

  commitInspectorEdits()
  const before = captureHistoryEntry()
  mode.value = 'select'
  const pastedRegionIds: string[] = []
  const pastedAnchorIds: string[] = []
  const copiedRegionIds = new Map<string, string>()
  for (const copy of copies.regions) {
    const id = copiedId(copy.id)
    const item: SubBoardRegion = {
      ...copy,
      id,
      label: `${copy.label} copy`,
      x: nearbyPosition(copy.x, 100 - copy.width),
      y: nearbyPosition(copy.y, 100 - copy.height),
      width: rounded(copy.width),
      height: rounded(copy.height),
    }
    layout.regions.push(item)
    copiedRegionIds.set(copy.id, id)
    pastedRegionIds.push(item.id)
  }
  for (const copy of copies.anchors) {
    const item: SubBoardAnchor = {
      ...copy,
      id: copiedId(copy.id),
      label: `${copy.label} copy`,
      regionId: copiedRegionIds.get(copy.regionId) ?? '',
      x: boundedCoordinate(nearbyPosition(copy.x, 100 - copy.tokenSize.width / 2), copy.tokenSize.width / 2, 100 - copy.tokenSize.width / 2),
      y: boundedCoordinate(nearbyPosition(copy.y, 100 - copy.tokenSize.height / 2), copy.tokenSize.height / 2, 100 - copy.tokenSize.height / 2),
      tokenSize: { ...copy.tokenSize },
    }
    layout.anchors.push(item)
    pastedAnchorIds.push(item.id)
  }
  selectedRegionIds.value = pastedRegionIds
  selectedAnchorIds.value = pastedAnchorIds
  refreshInspectorDrafts()
  recordUndoEntry(before)
  statusMessage.value = `${selectionCount.value} pasted item${selectionCount.value === 1 ? '' : 's'} selected. Drag to position; anchors link automatically when moved into an available region.`
  editorRoot.value?.focus({ preventScroll: true })
}

function matchAnchorToRegion() {
  commitInspectorEdits()
  const anchor = selectedAnchor.value
  const region = activeLayout.value?.regions.find(item => item.id === anchor?.regionId)
  if (!anchor || !region) {
    statusMessage.value = 'Bind this anchor to a region before matching its position and size.'
    return
  }
  const before = captureHistoryEntry()
  anchor.x = rounded(region.x + region.width / 2)
  anchor.y = rounded(region.y + region.height / 2)
  anchor.tokenSize = { width: rounded(region.width), height: rounded(region.height) }
  recordUndoEntry(before)
  statusMessage.value = 'Anchor position and size matched to its region.'
}

function isTextEntryTarget(target: EventTarget | null): boolean {
  return target instanceof HTMLElement
    && (target.isContentEditable || !!target.closest('input, textarea, select, [contenteditable="true"]'))
}

function handleEditorKeydown(event: KeyboardEvent) {
  if (event.target instanceof HTMLElement && event.target.closest('[data-component="SubBoard.TokenSimulator"]')) return
  if (isTextEntryTarget(event.target)) return
  if (event.key === 'Delete' && selectionCount.value > 0) {
    event.preventDefault()
    deleteSelection()
    return
  }
  if ((event.ctrlKey || event.metaKey) && !event.shiftKey && event.key.toLowerCase() === 'z') {
    event.preventDefault()
    undoLastOperation()
    return
  }
  const directions: Record<string, { axis: 'x' | 'y'; delta: number; label: string }> = {
    ArrowLeft: { axis: 'x', delta: -0.1, label: 'left' },
    ArrowRight: { axis: 'x', delta: 0.1, label: 'right' },
    ArrowUp: { axis: 'y', delta: -0.1, label: 'up' },
    ArrowDown: { axis: 'y', delta: 0.1, label: 'down' },
  }
  const direction = directions[event.key]
  if (direction && selectionCount.value > 0 && mode.value === 'select'
    && !event.ctrlKey && !event.metaKey && !event.altKey) {
    event.preventDefault()
    nudgeSelection(direction.axis, direction.delta, direction.label)
    return
  }
  if (!(event.ctrlKey || event.metaKey)) return
  const key = event.key.toLowerCase()
  if (key === 'c' && selectionCount.value > 0) {
    event.preventDefault()
    copySelection()
  } else if (key === 'v' && copiedItems.value) {
    event.preventDefault()
    pasteCopy()
  }
}

function nudgeSelection(axis: 'x' | 'y', delta: number, direction: string) {
  const layout = activeLayout.value
  if (!layout) return
  commitInspectorEdits()
  const bounds = selectedGroupBounds.value
  if (!bounds) return
  const before = captureHistoryEntry()
  const currentPosition = bounds[axis]
  translateSelectedGroup(axis, currentPosition + delta)
  if (!before || JSON.stringify(layout) === JSON.stringify(before.layout)) {
    statusMessage.value = 'The selection cannot move farther in that direction.'
    return
  }
  const movedAnchors = layout.anchors.filter(anchor => selectedAnchorIds.value.includes(anchor.id))
  for (const anchor of movedAnchors) updateAnchorRegionBinding(anchor, { x: anchor.x, y: anchor.y })
  recordUndoEntry(before)
  const unboundAnchor = movedAnchors.some(anchor => !anchor.regionId)
  const movedItems = selectionCount.value
  statusMessage.value = `${movedItems} selected item${movedItems === 1 ? '' : 's'} moved ${direction} by 0.1%.${unboundAnchor ? ' An anchor needs an available linked region.' : ''}`
}

function beginPreviewAnchorEdit(anchorId: string) {
  selectOnlyAnchor(anchorId)
  beginHistoryTransaction()
}

function updatePreviewAnchor(change: PreviewAnchorEdit) {
  const anchor = activeLayout.value?.anchors.find(item => item.id === change.anchorId)
  if (!anchor) return

  anchor.x = boundedCoordinate(change.x ?? anchor.x, minimumTokenSize / 2, 100 - minimumTokenSize / 2)
  anchor.y = boundedCoordinate(change.y ?? anchor.y, minimumTokenSize / 2, 100 - minimumTokenSize / 2)
  const maxWidth = Math.max(minimumTokenSize, Math.min(anchor.x * 2, (100 - anchor.x) * 2))
  const maxHeight = Math.max(minimumTokenSize, Math.min(anchor.y * 2, (100 - anchor.y) * 2))
  anchor.tokenSize.width = boundedCoordinate(change.tokenSize?.width ?? anchor.tokenSize.width, minimumTokenSize, maxWidth)
  anchor.tokenSize.height = boundedCoordinate(change.tokenSize?.height ?? anchor.tokenSize.height, minimumTokenSize, maxHeight)
  updateAnchorRegionBinding(anchor, { x: anchor.x, y: anchor.y })
}

function finishPreviewAnchorEdit(anchorId: string) {
  const before = pendingHistory
  const changed = !!before && JSON.stringify(activeLayout.value) !== JSON.stringify(before.layout)
  commitHistoryTransaction()
  const anchor = activeLayout.value?.anchors.find(item => item.id === anchorId)
  const region = activeLayout.value?.regions.find(item => item.id === anchor?.regionId)
  statusMessage.value = anchor && !anchor.regionId
    ? 'Preview anchor is not linked to an available region. Adjust or bind it before using the layout.'
    : changed
      ? `Preview token adjustment updated the layout${region ? ` at ${region.label}` : ''}.`
      : `Selected the preview anchor${region ? ` for ${region.label}` : ''}. Drag or resize it to adjust the layout.`
}

function nudgePreviewAnchor(change: { anchorId: string; x: number; y: number }) {
  const anchor = activeLayout.value?.anchors.find(item => item.id === change.anchorId)
  if (!anchor) return
  commitInspectorEdits()
  beginHistoryTransaction()
  const before = JSON.stringify(anchor)
  updatePreviewAnchor({ anchorId: anchor.id, x: anchor.x + change.x, y: anchor.y + change.y })
  commitHistoryTransaction()
  const unbound = !anchor.regionId
  statusMessage.value = JSON.stringify(anchor) === before
    ? 'The preview token cannot move farther in that direction.'
    : `Preview token moved by 0.1%.${unbound ? ' It is not linked to an available region.' : ''}`
}

function normalizeSelectedRegion() {
  const region = selectedRegion.value
  if (!region) return
  const previous = pendingHistory?.layout.regions.find(item => item.id === region.id)
  for (const property of ['x', 'y', 'width', 'height'] as const) {
    const value = region[property]
    region[property] = Number.isFinite(value) ? rounded(value) : previous?.[property] ?? 0
  }
}

function normalizeSelectedAnchor() {
  const anchor = selectedAnchor.value
  if (!anchor) return
  const previous = pendingHistory?.layout.anchors.find(item => item.id === anchor.id)
  const xValue = anchor.x
  const yValue = anchor.y
  anchor.x = Number.isFinite(xValue) ? boundedCoordinate(xValue, minimumTokenSize / 2, 100 - minimumTokenSize / 2) : previous?.x ?? 50
  anchor.y = Number.isFinite(yValue) ? boundedCoordinate(yValue, minimumTokenSize / 2, 100 - minimumTokenSize / 2) : previous?.y ?? 50
  for (const property of ['width', 'height'] as const) {
    const value = anchor.tokenSize[property]
    const center = property === 'width' ? anchor.x : anchor.y
    const maxSize = Math.max(minimumTokenSize, Math.min(center * 2, (100 - center) * 2))
    const desiredSize = Number.isFinite(value) ? value : previous?.tokenSize[property] ?? defaultTokenSize[property]
    anchor.tokenSize[property] = boundedCoordinate(desiredSize, minimumTokenSize, maxSize)
  }
  anchor.x = boundedCoordinate(anchor.x, anchor.tokenSize.width / 2, 100 - anchor.tokenSize.width / 2)
  anchor.y = boundedCoordinate(anchor.y, anchor.tokenSize.height / 2, 100 - anchor.tokenSize.height / 2)
}

function applyRegionId() {
  const region = selectedRegion.value
  const id = regionIdDraft.value.trim()
  const ids = [
    ...(activeLayout.value?.regions.filter(item => item !== region).map(item => item.id) ?? []),
    ...(activeLayout.value?.anchors.map(item => item.id) ?? []),
  ]
  if (!region) return
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id) || ids.includes(id)) {
    regionIdDraft.value = region.id
    statusMessage.value = 'IDs must be unique and use lowercase letters, numbers, and hyphens.'
    return
  }
  for (const anchor of activeLayout.value?.anchors ?? []) {
    if (anchor.regionId === region.id) anchor.regionId = id
  }
  region.id = id
  selectedRegionIds.value = [id]
  regionIdDraft.value = id
}

function applyAnchorId() {
  const anchor = selectedAnchor.value
  const id = anchorIdDraft.value.trim()
  const ids = [
    ...(activeLayout.value?.regions.map(item => item.id) ?? []),
    ...(activeLayout.value?.anchors.filter(item => item !== anchor).map(item => item.id) ?? []),
  ]
  if (!anchor) return
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id) || ids.includes(id)) {
    anchorIdDraft.value = anchor.id
    statusMessage.value = 'IDs must be unique and use lowercase letters, numbers, and hyphens.'
    return
  }
  anchor.id = id
  selectedAnchorIds.value = [id]
  anchorIdDraft.value = id
}

function resetLayout() {
  if (!activeImage.value) return
  commitInspectorEdits()
  const before = captureHistoryEntry()
  layouts[selectedBoardId.value] = emptyLayout(activeImage.value)
  selectedRegionIds.value = []
  selectedAnchorIds.value = []
  regionIdDraft.value = ''
  anchorIdDraft.value = ''
  mode.value = 'select'
  recordUndoEntry(before)
  statusMessage.value = 'Layout reset to its example starting points.'
}

function changeBoard(event: Event) {
  commitInspectorEdits()
  selectedBoardId.value = (event.target as HTMLSelectElement).value
}

const documentToExport = computed<SubBoardLayoutDocument | null>(() => {
  if (!activeLayout.value || !activeImage.value) return null
  return {
    schemaVersion: 2,
    boardId: activeLayout.value.boardId,
    boardName: activeImage.value.label,
    imageFile: activeImage.value.imageFile,
    imageSize: { ...activeLayout.value.imageSize },
    regions: activeLayout.value.regions.map(region => ({
      ...region,
      x: rounded(region.x), y: rounded(region.y),
      width: rounded(region.width), height: rounded(region.height),
    })),
    anchors: activeLayout.value.anchors.map(anchor => ({
      ...anchor,
      x: rounded(anchor.x),
      y: rounded(anchor.y),
      tokenSize: { width: rounded(anchor.tokenSize.width), height: rounded(anchor.tokenSize.height) },
    })),
  }
})

const validationError = computed(() => {
  const document = documentToExport.value
  if (!document) return 'Choose an image before exporting a layout.'
  const ids = [...document.regions.map(item => item.id), ...document.anchors.map(item => item.id)]
  if (ids.some(id => !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id))) return 'Use lowercase letters, numbers, and hyphens for IDs.'
  if (new Set(ids).size !== ids.length) return 'Every region and anchor needs a unique ID.'
  if (document.regions.some(item => !item.label.trim() || item.width <= 0 || item.height <= 0
    || item.x < 0 || item.y < 0 || item.x + item.width > 100 || item.y + item.height > 100)) {
    return 'Each region needs a label and must fit inside the image.'
  }
  if (document.anchors.some(item => !item.label.trim() || item.x < 0 || item.y < 0 || item.x > 100 || item.y > 100)) {
    return 'Each anchor needs a label and must stay inside the image.'
  }
  const regionIds = new Set(document.regions.map(region => region.id))
  if (document.anchors.some(anchor => !regionIds.has(anchor.regionId))) {
    return 'Every anchor must be linked to an existing region.'
  }
  if (new Set(document.anchors.map(anchor => anchor.regionId)).size !== document.anchors.length) {
    return 'Each region can be linked to only one anchor.'
  }
  if (document.regions.some(region => !document.anchors.some(anchor => anchor.regionId === region.id))) {
    return 'Every region must be linked to one token anchor.'
  }
  if (document.anchors.some(anchor => anchor.tokenSize.width < minimumTokenSize
    || anchor.tokenSize.height < minimumTokenSize
    || anchor.x - anchor.tokenSize.width / 2 < 0
    || anchor.x + anchor.tokenSize.width / 2 > 100
    || anchor.y - anchor.tokenSize.height / 2 < 0
    || anchor.y + anchor.tokenSize.height / 2 > 100)) {
    return 'Each token size must be positive and fit inside the image.'
  }
  return ''
})

function coordinateJsonToken(value: number): string {
  return `__SUB_BOARD_COORDINATE_${rounded(value).toFixed(2)}__`
}

const exportedJson = computed(() => {
  const document = documentToExport.value
  if (!document) return ''
  const withFixedCoordinates = {
    ...document,
    regions: document.regions.map(region => ({
      ...region,
      x: coordinateJsonToken(region.x),
      y: coordinateJsonToken(region.y),
      width: coordinateJsonToken(region.width),
      height: coordinateJsonToken(region.height),
    })),
    anchors: document.anchors.map(anchor => ({
      ...anchor,
      x: coordinateJsonToken(anchor.x),
      y: coordinateJsonToken(anchor.y),
      tokenSize: {
        width: coordinateJsonToken(anchor.tokenSize.width),
        height: coordinateJsonToken(anchor.tokenSize.height),
      },
    })),
  }
  return JSON.stringify(withFixedCoordinates, null, 2)
    .replace(/"__SUB_BOARD_COORDINATE_(-?\d+\.\d{2})__"/g, '$1')
})

function downloadLayout() {
  if (!documentToExport.value) return
  downloadJsonFile(exportedJson.value, `${documentToExport.value.boardId}-layout.json`)
  statusMessage.value = 'Layout JSON downloaded. Keep the image file beside it when adding the layout to the UI.'
}

function downloadJsonFile(json: string, fileName: string) {
  const blob = new Blob([json], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  link.click()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}

function showSaveFeedback(tone: SaveFeedback['tone'], message: string) {
  if (saveFeedbackTimeout !== null) window.clearTimeout(saveFeedbackTimeout)
  saveFeedback.value = { tone, message }
  saveFeedbackTimeout = window.setTimeout(() => {
    saveFeedback.value = null
    saveFeedbackTimeout = null
  }, 4000)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function parseLayoutDocument(value: unknown): SubBoardLayoutDocument {
  if (!isRecord(value) || (value.schemaVersion !== 1 && value.schemaVersion !== 2)
    || !Array.isArray(value.regions) || !Array.isArray(value.anchors)) {
    throw new Error('This file is not a supported sub board layout (expected schema version 1 or 2).')
  }
  const validRegion = (item: unknown): item is SubBoardRegion => isRecord(item)
    && typeof item.id === 'string' && typeof item.label === 'string'
    && isFiniteNumber(item.x) && isFiniteNumber(item.y)
    && isFiniteNumber(item.width) && isFiniteNumber(item.height)
  const validAnchor = (item: unknown): item is Record<string, unknown> & { id: string; label: string; x: number; y: number } => isRecord(item)
    && typeof item.id === 'string' && typeof item.label === 'string'
    && isFiniteNumber(item.x) && isFiniteNumber(item.y)
  if (!value.regions.every(validRegion) || !value.anchors.every(validAnchor)) {
    throw new Error('This layout has a region or anchor with missing fields.')
  }
  const imageSize = value.imageSize
  if (!isRecord(imageSize) || !isFiniteNumber(imageSize.width) || !isFiniteNumber(imageSize.height)) {
    throw new Error('This layout is missing its image dimensions.')
  }
  const regions = cloneParts(value.regions) as SubBoardRegion[]
  const sourceAnchors = cloneParts(value.anchors) as Array<Record<string, unknown> & { id: string; label: string; x: number; y: number }>
  if (value.regions.some(region => region.x < 0 || region.y < 0 || region.width <= 0 || region.height <= 0
    || region.x + region.width > 100 || region.y + region.height > 100)
    || value.anchors.some(anchor => anchor.x < 0 || anchor.y < 0 || anchor.x > 100 || anchor.y > 100)) {
    throw new Error('Every region and anchor must fit inside the image.')
  }
  return {
    schemaVersion: 2,
    boardId: typeof value.boardId === 'string' ? value.boardId : '',
    boardName: typeof value.boardName === 'string' ? value.boardName : 'Imported layout',
    imageFile: typeof value.imageFile === 'string' ? value.imageFile : '',
    imageSize: { width: imageSize.width, height: imageSize.height },
    regions: regions.map(region => ({
      ...region,
      x: rounded(region.x), y: rounded(region.y),
      width: rounded(region.width), height: rounded(region.height),
    })),
    anchors: sourceAnchors.map(anchor => {
      const containingRegion = regions
        .filter(region => anchor.x >= region.x && anchor.x <= region.x + region.width
          && anchor.y >= region.y && anchor.y <= region.y + region.height)
        .sort((left, right) => left.width * left.height - right.width * right.height)[0]
      const requestedRegionId = typeof anchor.regionId === 'string' && regions.some(region => region.id === anchor.regionId)
        ? anchor.regionId
        : containingRegion?.id ?? ''
      const regionId = regions.some(region => region.id === requestedRegionId) ? requestedRegionId : ''
      const sourceTokenSize = isRecord(anchor.tokenSize) ? anchor.tokenSize : null
      const x = boundedCoordinate(anchor.x, minimumTokenSize / 2, 100 - minimumTokenSize / 2)
      const y = boundedCoordinate(anchor.y, minimumTokenSize / 2, 100 - minimumTokenSize / 2)
      const maxWidth = Math.max(minimumTokenSize, Math.min(x * 2, (100 - x) * 2))
      const maxHeight = Math.max(minimumTokenSize, Math.min(y * 2, (100 - y) * 2))
      const tokenSize = {
        width: boundedCoordinate(
          sourceTokenSize && isFiniteNumber(sourceTokenSize.width) ? sourceTokenSize.width : defaultTokenSize.width,
          minimumTokenSize,
          maxWidth,
        ),
        height: boundedCoordinate(
          sourceTokenSize && isFiniteNumber(sourceTokenSize.height) ? sourceTokenSize.height : defaultTokenSize.height,
          minimumTokenSize,
          maxHeight,
        ),
      }
      return { id: anchor.id, label: anchor.label, regionId, x, y, tokenSize }
    }),
  }
}

const layoutJsonPickerOptions: LayoutFilePickerOptions = {
  types: [{ description: 'JSON layout', accept: { 'application/json': ['.json'] } }],
}

async function chooseLayoutFile() {
  commitInspectorEdits()
  const filePicker = window as LayoutFilePickerWindow
  if (!filePicker.showOpenFilePicker) {
    layoutPicker.value?.click()
    return
  }
  try {
    const [fileHandle] = await filePicker.showOpenFilePicker({ ...layoutJsonPickerOptions, multiple: false })
    if (!fileHandle) return
    await importLayoutFile(await fileHandle.getFile(), fileHandle)
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') return
    statusMessage.value = error instanceof Error ? error.message : 'Could not open that layout file.'
  }
}

async function importLayout(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return
  await importLayoutFile(file, null)
}

async function importLayoutFile(file: File, fileHandle: FileSystemFileHandle | null) {
  try {
    commitInspectorEdits()
    const imported = parseLayoutDocument(JSON.parse(await file.text()) as unknown)
    const matchingImage = imageOptions.value.find(option => option.id === imported.boardId)
    const targetId = matchingImage?.id ?? selectedBoardId.value
    ensureLayout(targetId)
    const image = imageOptions.value.find(option => option.id === targetId)
    if (!image) throw new Error('Choose an image before importing a layout.')
    const before = captureHistoryEntry(targetId)
    layouts[targetId] = {
      ...imported,
      boardId: targetId,
      boardName: image.label,
      imageFile: image.imageFile,
      imageSize: { width: image.width || imported.imageSize.width, height: image.height || imported.imageSize.height },
    }
    recordUndoEntry(before)
    selectedBoardId.value = targetId
    selectedRegionIds.value = []
    selectedAnchorIds.value = []
    regionIdDraft.value = ''
    anchorIdDraft.value = ''
    layoutSaveTargets[targetId] = {
      fileName: file.name,
      fileHandle,
      savedJson: exportedJson.value,
    }
    statusMessage.value = matchingImage
      ? `Loaded layout for ${image.label}.`
      : `Loaded its coordinates onto ${image.label}; the image itself is not included in JSON.`
  } catch (error) {
    statusMessage.value = error instanceof Error ? error.message : 'Could not read that layout file.'
  }
}

async function saveLayout() {
  if (saveFeedbackTimeout !== null) window.clearTimeout(saveFeedbackTimeout)
  saveFeedbackTimeout = null
  saveFeedback.value = null
  commitInspectorEdits()
  const boardId = selectedBoardId.value
  const source = layoutSaveTargets[boardId] ?? {
    fileName: `${activeImage.value?.id ?? boardId}-layout.json`,
    fileHandle: null,
    savedJson: '',
  }
  const json = exportedJson.value

  const filePicker = window as LayoutFilePickerWindow
  try {
    const fileHandle = source.fileHandle ?? (filePicker.showSaveFilePicker
      ? await filePicker.showSaveFilePicker({ ...layoutJsonPickerOptions, suggestedName: source.fileName })
      : null)
    if (!fileHandle) {
      downloadJsonFile(json, source.fileName)
      layoutSaveTargets[boardId] = { ...source, savedJson: json }
      statusMessage.value = `Downloaded ${source.fileName}. This browser cannot retain a save location, so choose a location again on the next Save.`
      showSaveFeedback('download', `Downloaded ${source.fileName}. Choose a save location to replace your original file.`)
      return
    }
    const writable = await fileHandle.createWritable()
    try {
      await writable.write(json)
      await writable.close()
    } catch (error) {
      await writable.abort().catch(() => undefined)
      throw error
    }
    layoutSaveTargets[boardId] = {
      ...source,
      fileName: fileHandle.name,
      fileHandle,
      savedJson: json,
    }
    statusMessage.value = `Saved ${fileHandle.name}.`
    showSaveFeedback('success', `Layout saved successfully to ${fileHandle.name}.`)
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') return
    statusMessage.value = error instanceof Error ? error.message : 'Could not save the layout file.'
    showSaveFeedback('error', `Save failed: ${statusMessage.value}`)
  }
}

function loadCustomImage(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return
  commitInspectorEdits()
  if (customImage.value) URL.revokeObjectURL(customImage.value.imageUrl)
  const id = `uploaded-${Date.now()}`
  const imageUrl = URL.createObjectURL(file)
  customImage.value = { id, label: file.name, imageUrl, imageFile: file.name, width: 1, height: 1 }
  selectedBoardId.value = id
  ensureLayout(id)
  statusMessage.value = 'Image loaded. Draw regions or place anchors, then export the layout JSON.'
}

function handleImageLoad(event: Event) {
  const imageElement = event.target as HTMLImageElement
  if (!activeLayout.value || !imageElement.naturalWidth || !imageElement.naturalHeight) return
  activeLayout.value.imageSize = { width: imageElement.naturalWidth, height: imageElement.naturalHeight }
  if (customImage.value?.id === selectedBoardId.value) {
    customImage.value.width = imageElement.naturalWidth
    customImage.value.height = imageElement.naturalHeight
  }
}

onBeforeUnmount(() => {
  if (customImage.value) URL.revokeObjectURL(customImage.value.imageUrl)
  if (saveFeedbackTimeout !== null) window.clearTimeout(saveFeedbackTimeout)
})
</script>

<template>
  <div ref="editorRoot" class="sub-board-editor" data-component="SubBoard.LayoutEditor" tabindex="-1" aria-label="Sub board layout editor" @keydown.capture="handleEditorKeydown">
    <div
      v-if="saveFeedback"
      class="sub-board-editor-save-toast"
      :class="`is-${saveFeedback.tone}`"
      :role="saveFeedback.tone === 'error' ? 'alert' : 'status'"
      aria-live="polite"
    >
      <span aria-hidden="true">{{ saveFeedback.tone === 'success' ? '✓' : saveFeedback.tone === 'error' ? '!' : '↓' }}</span>
      {{ saveFeedback.message }}
    </div>
    <div class="sub-board-editor-toolbar">
      <label class="sub-board-editor-field">
        <span>Board image</span>
        <select :value="selectedBoardId" aria-label="Choose sub board image" @change="changeBoard">
          <option v-for="image in imageOptions" :key="image.id" :value="image.id">{{ image.label }}</option>
        </select>
      </label>
      <div class="sub-board-editor-tools" role="toolbar" aria-label="Layout editing tools">
        <button type="button" class="btn" :class="{ primary: mode === 'select' }" @click="mode = 'select'">Select</button>
        <button type="button" class="btn" :class="{ primary: mode === 'draw-region' }" @click="mode = 'draw-region'">Draw region</button>
        <button type="button" class="btn" :class="{ primary: mode === 'place-anchor' }" @click="mode = 'place-anchor'">Place anchor</button>
      </div>
      <div class="sub-board-editor-tools sub-board-editor-file-tools">
        <button type="button" class="btn" @click="imagePicker?.click()">Load image…</button>
        <input ref="imagePicker" class="sub-board-editor-file-input" type="file" accept="image/*" @change="loadCustomImage" />
        <button type="button" class="btn" @click="saveLayout">Save</button>
        <button type="button" class="btn" @click="chooseLayoutFile">Import JSON…</button>
        <input ref="layoutPicker" class="sub-board-editor-file-input" type="file" accept="application/json,.json" @change="importLayout" />
        <button type="button" class="btn" :disabled="undoHistory.length === 0 && !hasPendingHistory" @click="undoLastOperation">Undo</button>
        <button type="button" class="btn" :disabled="selectionCount === 0" @click="copySelection">Copy selected</button>
        <button type="button" class="btn" :disabled="!copiedItems" @click="pasteCopy">Paste copy</button>
        <button type="button" class="btn" :disabled="selectionCount === 0" @click="deleteSelection">Delete selected</button>
        <button type="button" class="btn" @click="resetLayout">Reset layout</button>
      </div>
    </div>

    <div class="sub-board-editor-workspace">
      <div class="sub-board-editor-canvas-column">
        <div
          ref="stage"
          class="sub-board-editor-stage"
          :class="`is-${mode}`"
          :style="stageStyle"
          @pointerdown="handleStagePointerDown"
          @pointermove="updateGesture"
          @pointerup="endGesture"
          @pointercancel="endGesture"
        >
          <img v-if="activeImage" :src="activeImage.imageUrl" :alt="activeImage.label" draggable="false" @load="handleImageLoad" />
          <template v-if="activeLayout">
            <div
              v-for="region in activeLayout.regions"
              :key="`region-${region.id}`"
              class="sub-board-editor-region"
              :class="{ selected: selectedRegionIds.includes(region.id), related: selectedAnchor?.regionId === region.id, 'is-drawing': gesture?.kind === 'draw-region' && gesture.regionId === region.id }"
              :style="regionStyle(region)"
              role="button"
              tabindex="0"
              :aria-label="`${region.label}, region ${region.id}`"
              @contextmenu="createAnchorAtRegionCenter($event, region)"
              @pointerdown="startRegionGesture($event, region, 'move-region')"
            >
              <span v-if="showIds" class="sub-board-editor-region-label"><strong>{{ region.id }}</strong><small>{{ region.label }}</small></span>
              <template v-if="selectedRegionIds.length === 1 && selectedRegionIds[0] === region.id && selectedAnchorIds.length === 0 && mode === 'select'">
                <span
                  v-for="handle in resizeHandles"
                  :key="`resize-${handle}`"
                  class="sub-board-editor-resize-handle"
                  :class="`handle-${handle}`"
                  role="button"
                  tabindex="-1"
                  :aria-label="`Resize region ${handle}`"
                  @pointerdown="startRegionGesture($event, region, 'resize-region', handle)"
                />
              </template>
            </div>
            <button
              v-for="anchor in activeLayout.anchors"
              :key="`anchor-${anchor.id}`"
              type="button"
              class="sub-board-editor-anchor"
              :class="{ selected: selectedAnchorIds.includes(anchor.id), related: selectedRegion?.id === anchor.regionId }"
              :style="anchorStyle(anchor)"
              :aria-label="`${anchor.label}, anchor ${anchor.id}, linked to ${activeLayout.regions.find(region => region.id === anchor.regionId)?.label ?? 'no region'}`"
              @pointerdown="startAnchorMove($event, anchor)"
            >
              <span v-if="showIds" class="sub-board-editor-anchor-label">{{ anchor.id }}</span>
              <template v-if="selectedAnchorIds.length === 1 && selectedAnchorIds[0] === anchor.id && selectedRegionIds.length === 0 && mode === 'select'">
                <span
                  v-for="handle in tokenResizeHandles"
                  :key="`token-resize-${handle}`"
                  class="sub-board-editor-resize-handle"
                  :class="`handle-${handle}`"
                  role="button"
                  tabindex="-1"
                  :aria-label="`Resize token ${handle}`"
                  @pointerdown="startAnchorResize($event, anchor, handle)"
                />
              </template>
            </button>
          </template>
        </div>
        <div class="sub-board-editor-canvas-footer">
          <label class="sub-board-editor-checkbox"><input v-model="showIds" type="checkbox" /> Show IDs and labels</label>
          <span>{{ activeLayout?.regions.length ?? 0 }} regions · {{ activeLayout?.anchors.length ?? 0 }} anchors · coordinates use 0–100%</span>
        </div>
      </div>

      <aside class="sub-board-editor-inspector" aria-label="Layout properties">
        <template v-if="selectedRegion">
          <h4>Region</h4>
          <label class="sub-board-editor-field"><span>ID</span><input v-model="regionIdDraft" type="text" spellcheck="false" @focus="beginFieldHistoryTransaction" @blur="commitInspectorEdits" /></label>
          <label class="sub-board-editor-field"><span>Label</span><input v-model="selectedRegion.label" type="text" @focus="beginFieldHistoryTransaction" @blur="commitInspectorEdits" /></label>
          <div class="sub-board-editor-number-grid">
            <label class="sub-board-editor-field"><span>X %</span><input v-model.number="selectedRegion.x" type="number" min="0" max="100" step="0.01" @focus="beginFieldHistoryTransaction" @blur="commitInspectorEdits" /></label>
            <label class="sub-board-editor-field"><span>Y %</span><input v-model.number="selectedRegion.y" type="number" min="0" max="100" step="0.01" @focus="beginFieldHistoryTransaction" @blur="commitInspectorEdits" /></label>
            <label class="sub-board-editor-field"><span>Width %</span><input v-model.number="selectedRegion.width" type="number" min="0.5" max="100" step="0.01" @focus="beginFieldHistoryTransaction" @blur="commitInspectorEdits" /></label>
            <label class="sub-board-editor-field"><span>Height %</span><input v-model.number="selectedRegion.height" type="number" min="0.5" max="100" step="0.01" @focus="beginFieldHistoryTransaction" @blur="commitInspectorEdits" /></label>
          </div>
          <p v-if="relatedAnchor">Linked token anchor: <button type="button" class="sub-board-editor-link-button" @click="selectOnlyAnchor(relatedAnchor.id)">{{ relatedAnchor.id }} · {{ relatedAnchor.label }}</button></p>
          <p v-else>This region needs a token anchor. Place one inside this region or right-click it.</p>
        </template>
        <template v-else-if="selectedAnchor">
          <h4>Token anchor</h4>
          <label class="sub-board-editor-field"><span>ID</span><input v-model="anchorIdDraft" type="text" spellcheck="false" @focus="beginFieldHistoryTransaction" @blur="commitInspectorEdits" /></label>
          <label class="sub-board-editor-field"><span>Label</span><input v-model="selectedAnchor.label" type="text" @focus="beginFieldHistoryTransaction" @blur="commitInspectorEdits" /></label>
          <label class="sub-board-editor-field">
            <span>Bound region</span>
            <select v-model="selectedAnchor.regionId" @focus="beginFieldHistoryTransaction" @blur="commitInspectorEdits">
              <option value="">Choose a region…</option>
              <option
                v-for="region in activeLayout?.regions ?? []"
                :key="region.id"
                :value="region.id"
                :disabled="region.id !== selectedAnchor.regionId && activeLayout?.anchors.some(anchor => anchor.id !== (selectedAnchor?.id ?? '') && anchor.regionId === region.id)"
              >{{ region.id }} · {{ region.label }}</option>
            </select>
          </label>
          <div class="sub-board-editor-number-grid">
            <label class="sub-board-editor-field"><span>X %</span><input v-model.number="selectedAnchor.x" type="number" min="0" max="100" step="0.01" @focus="beginFieldHistoryTransaction" @blur="commitInspectorEdits" /></label>
            <label class="sub-board-editor-field"><span>Y %</span><input v-model.number="selectedAnchor.y" type="number" min="0" max="100" step="0.01" @focus="beginFieldHistoryTransaction" @blur="commitInspectorEdits" /></label>
            <label class="sub-board-editor-field"><span>Token width %</span><input v-model.number="selectedAnchor.tokenSize.width" type="number" min="0.5" max="100" step="0.01" @focus="beginFieldHistoryTransaction" @blur="commitInspectorEdits" /></label>
            <label class="sub-board-editor-field"><span>Token height %</span><input v-model.number="selectedAnchor.tokenSize.height" type="number" min="0.5" max="100" step="0.01" @focus="beginFieldHistoryTransaction" @blur="commitInspectorEdits" /></label>
          </div>
          <button type="button" class="btn sub-board-editor-match-button" :disabled="!selectedAnchorRegion" @click="matchAnchorToRegion">Match position and size to region</button>
          <p>Drag any edge to move that boundary; drag a corner to move two boundaries. The anchor stays at the rectangle's center. Each region and anchor are linked one-to-one.</p>
        </template>
        <template v-else-if="selectionCount > 1">
          <h4>{{ selectionCount }} items selected</h4>
          <label class="sub-board-editor-field"><span>Shared label</span><input v-model="selectedGroupLabel" type="text" placeholder="Mixed labels" @focus="beginFieldHistoryTransaction" @blur="commitInspectorEdits" /></label>
          <div class="sub-board-editor-number-grid">
            <label class="sub-board-editor-field"><span>Group X %</span><input v-model.number="selectedGroupX" type="number" min="0" max="100" step="0.01" @focus="beginFieldHistoryTransaction" @blur="commitInspectorEdits" /></label>
            <label class="sub-board-editor-field"><span>Group Y %</span><input v-model.number="selectedGroupY" type="number" min="0" max="100" step="0.01" @focus="beginFieldHistoryTransaction" @blur="commitInspectorEdits" /></label>
          </div>
          <p>Ctrl-click to add or remove an item. Drag any selected item to move the group. Press Delete to remove all selected items.</p>
          <p>Shared label applies one label to every selected item. Group X and Y move the selection while keeping the spacing between items.</p>
        </template>
        <template v-else>
          <h4>How to edit</h4>
          <p>Draw a rectangle for a board region, then place its token anchor inside it. Every region needs exactly one anchor, and every anchor must point to its region.</p>
          <p>Drag a region edge to resize one side, or a corner to resize two sides. Ctrl-click to select multiple items; Delete removes the selection.</p>
          <p>In Select mode, right-click a region to place an anchor at its center.</p>
        </template>

        <p class="sub-board-editor-status" role="status" aria-live="polite">{{ statusMessage }}</p>
        <p v-if="validationError" class="sub-board-editor-validation" role="alert">{{ validationError }}</p>
        <button type="button" class="btn primary sub-board-editor-export-button" @click="downloadLayout">Export layout JSON</button>
        <details class="sub-board-editor-json">
          <summary>Preview JSON</summary>
          <textarea :value="exportedJson" readonly spellcheck="false" aria-label="Layout JSON preview" />
        </details>
        <p class="sub-board-editor-note">The JSON stores coordinates and the image filename. Keep the image asset in the project when registering the layout.</p>
      </aside>
    </div>

    <SubBoardTokenSimulator
      v-if="activeLayout && activeImage"
      :layout="activeLayout"
      :image-url="activeImage.imageUrl"
      :image-alt="activeImage.label"
      @anchor-edit-start="beginPreviewAnchorEdit"
      @anchor-edit="updatePreviewAnchor"
      @anchor-edit-end="finishPreviewAnchorEdit"
      @nudge-anchor="nudgePreviewAnchor"
      @save="saveLayout"
      @undo="undoLastOperation"
    />
  </div>
</template>

<style scoped>
.sub-board-editor { display: grid; gap: 14px; }
.sub-board-editor:focus { outline: none; }
.sub-board-editor-save-toast { position: fixed; z-index: 3000; top: 18px; right: 18px; display: flex; max-width: min(460px, calc(100vw - 36px)); align-items: center; gap: 9px; padding: 12px 16px; border: 1px solid rgba(139, 224, 181, .72); border-radius: 8px; background: rgba(17, 43, 33, .97); box-shadow: 0 8px 28px rgba(0,0,0,.38); color: #dfffee; font-size: 13px; line-height: 1.4; }
.sub-board-editor-save-toast > span { display: grid; flex: 0 0 22px; width: 22px; height: 22px; place-items: center; border-radius: 50%; background: rgba(139, 224, 181, .2); color: #8be0b5; font-size: 15px; font-weight: 800; }
.sub-board-editor-save-toast.is-download { border-color: rgba(255, 209, 125, .72); background: rgba(56, 42, 18, .97); color: #fff0d0; }
.sub-board-editor-save-toast.is-download > span { background: rgba(255, 209, 125, .2); color: #ffd17d; }
.sub-board-editor-save-toast.is-error { border-color: rgba(255, 143, 143, .74); background: rgba(56, 22, 26, .97); color: #ffe5e5; }
.sub-board-editor-save-toast.is-error > span { background: rgba(255, 143, 143, .2); color: #ff9c9c; }
.sub-board-editor-toolbar { display: flex; flex-wrap: wrap; align-items: end; gap: 10px; }
.sub-board-editor-tools { display: flex; flex-wrap: wrap; align-items: end; gap: 7px; }
.sub-board-editor-file-tools { margin-left: auto; }
.sub-board-editor-field { display: grid; min-width: 0; gap: 4px; color: var(--muted); font-size: 11px; font-weight: 700; }
.sub-board-editor-field input,
.sub-board-editor-field select { min-width: 0; min-height: 34px; padding: 6px 8px; border: 1px solid var(--border); border-radius: 5px; background: #111622; color: var(--text); font: inherit; }
.sub-board-editor-toolbar > .sub-board-editor-field { min-width: 220px; }
.sub-board-editor-file-input { display: none; }
.sub-board-editor-workspace { display: grid; grid-template-columns: minmax(0, 1fr) 270px; align-items: start; gap: 14px; }
.sub-board-editor-canvas-column { min-width: 0; }
.sub-board-editor-stage { position: relative; box-sizing: border-box; width: 100%; max-width: 1000px; margin: 0 auto; overflow: hidden; outline: 1px solid rgba(255,255,255,.28); outline-offset: -1px; border-radius: 7px; background: #0d1018; touch-action: none; user-select: none; }
.sub-board-editor-stage > img { position: absolute; inset: 0; display: block; width: 100%; height: 100%; object-fit: fill; pointer-events: none; }
.sub-board-editor-stage.is-draw-region { cursor: crosshair; }
.sub-board-editor-stage.is-place-anchor { cursor: copy; }
.sub-board-editor-region { position: absolute; box-sizing: border-box; border: 2px solid rgba(92, 203, 255, .92); border-radius: 4px; background: rgba(24, 136, 189, .16); cursor: move; }
.sub-board-editor-region.selected { border-color: #ffe16b; background: rgba(255, 210, 57, .2); box-shadow: inset 0 0 0 1px rgba(255,255,255,.72); }
.sub-board-editor-region.related { border-color: #80e0bd; box-shadow: 0 0 0 2px rgba(74, 218, 168, .65), inset 0 0 0 1px rgba(255,255,255,.45); }
.sub-board-editor-region.is-drawing { border-style: dashed; }
.sub-board-editor-region-label { position: absolute; top: 2px; left: 3px; display: grid; max-width: calc(100% - 6px); padding: 2px 4px; border-radius: 3px; background: rgba(10, 14, 22, .86); color: white; font-size: clamp(8px, .8vw, 11px); line-height: 1.2; pointer-events: none; }
.sub-board-editor-region-label strong,
.sub-board-editor-region-label small { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.sub-board-editor-region-label small { color: #d0d8e7; font-size: .9em; }
.sub-board-editor-resize-handle { position: absolute; z-index: 3; width: 10px; height: 10px; border: 0; border-radius: 0; background: transparent; touch-action: none; }
.sub-board-editor-resize-handle::after { display: none; }
.sub-board-editor-resize-handle.handle-n { top: -5px; left: 8px; width: calc(100% - 16px); height: 10px; cursor: ns-resize; }
.sub-board-editor-resize-handle.handle-e { top: 8px; right: -5px; width: 10px; height: calc(100% - 16px); cursor: ew-resize; }
.sub-board-editor-resize-handle.handle-s { bottom: -5px; left: 8px; width: calc(100% - 16px); height: 10px; cursor: ns-resize; }
.sub-board-editor-resize-handle.handle-w { top: 8px; left: -5px; width: 10px; height: calc(100% - 16px); cursor: ew-resize; }
.sub-board-editor-resize-handle.handle-ne,
.sub-board-editor-resize-handle.handle-se,
.sub-board-editor-resize-handle.handle-sw,
.sub-board-editor-resize-handle.handle-nw { width: 10px; height: 10px; border: 0; border-radius: 0; background: transparent; }
.sub-board-editor-resize-handle.handle-ne { top: -6px; right: -6px; cursor: nesw-resize; }
.sub-board-editor-resize-handle.handle-se { right: -6px; bottom: -6px; cursor: nwse-resize; }
.sub-board-editor-resize-handle.handle-sw { bottom: -6px; left: -6px; cursor: nesw-resize; }
.sub-board-editor-resize-handle.handle-nw { top: -6px; left: -6px; cursor: nwse-resize; }
.sub-board-editor-anchor { position: absolute; z-index: 2; display: block; box-sizing: border-box; min-width: 0; min-height: 0; padding: 0; transform: translate(-50%, -50%); border: 2px dashed #f1d9ff; border-radius: 4px; background: rgba(169,71,236,.2); color: white; cursor: move; box-shadow: 0 1px 5px rgba(0,0,0,.65); touch-action: none; }
.sub-board-editor-anchor::after { position: absolute; top: 50%; left: 50%; width: 6px; height: 6px; transform: translate(-50%, -50%); border: 1px solid #190a24; border-radius: 50%; background: #f1d9ff; content: ''; pointer-events: none; }
.sub-board-editor-anchor.selected { outline: 2px solid #ffe16b; outline-offset: 2px; }
.sub-board-editor-anchor.related { outline: 2px solid #80e0bd; outline-offset: 2px; }
.sub-board-editor-anchor-label { position: absolute; top: -3px; left: 50%; max-width: 150px; transform: translate(-50%, -100%); overflow: hidden; padding: 2px 4px; border-radius: 3px; background: rgba(10,14,22,.9); font-size: 9px; white-space: nowrap; pointer-events: none; }
.sub-board-editor-anchor .sub-board-editor-resize-handle { z-index: 4; }
.sub-board-editor-canvas-footer { display: flex; flex-wrap: wrap; justify-content: space-between; gap: 8px; margin-top: 7px; color: var(--muted); font-size: 11px; }
.sub-board-editor-checkbox { display: inline-flex; align-items: center; gap: 6px; }
.sub-board-editor-inspector { display: grid; gap: 9px; padding: 12px; border: 1px solid var(--border); border-radius: 7px; background: rgba(13,16,24,.84); }
.sub-board-editor-inspector h4 { margin: 0; color: var(--text); font-size: 13px; }
.sub-board-editor-inspector p { margin: 0; color: var(--muted); font-size: 11px; line-height: 1.45; }
.sub-board-editor-link-button { padding: 0; border: 0; background: transparent; color: var(--accent); font: inherit; text-align: left; text-decoration: underline; cursor: pointer; }
.sub-board-editor-number-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; }
.sub-board-editor-match-button { justify-self: start; }
.sub-board-editor-status { min-height: 30px; padding-top: 5px; border-top: 1px solid rgba(255,255,255,.1); }
.sub-board-editor-validation { color: #ffb6a9 !important; }
.sub-board-editor-export-button { width: 100%; }
.sub-board-editor-json summary { color: var(--accent); cursor: pointer; font-size: 11px; font-weight: 700; }
.sub-board-editor-json textarea { display: block; width: 100%; height: 170px; box-sizing: border-box; margin-top: 7px; padding: 8px; resize: vertical; border: 1px solid var(--border); border-radius: 5px; background: #090c12; color: #dce8f7; font: 10px/1.4 ui-monospace, SFMono-Regular, Consolas, monospace; }
.sub-board-editor-note { color: var(--muted); font-size: 10px !important; }
@media (max-width: 900px) {
  .sub-board-editor-workspace { grid-template-columns: 1fr; }
  .sub-board-editor-inspector { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .sub-board-editor-inspector > h4,
  .sub-board-editor-status,
  .sub-board-editor-validation,
  .sub-board-editor-export-button,
  .sub-board-editor-json,
  .sub-board-editor-note { grid-column: 1 / -1; }
  .sub-board-editor-file-tools { margin-left: 0; }
}
</style>
