<script setup lang="ts">
import { onBeforeUnmount, ref, watch, type StyleValue } from 'vue'

defineOptions({ inheritAttrs: false })

const props = defineProps<{
  overlayClass?: unknown
  panelClass?: unknown
  panelStyle?: StyleValue
  panelRef?: HTMLElement | null
  panelAriaLabelledby?: string
  dragging?: boolean
  unstyled?: boolean
  /** Gameplay decisions must remain open until the engine receives an answer. */
  blocking?: boolean
}>()

const emit = defineEmits<{
  overlayClick: [event: MouseEvent]
  panelPointerdown: [event: PointerEvent]
  'update:panelRef': [element: HTMLElement | null]
}>()

const panelEl = ref<HTMLElement | null>(null)

watch(panelEl, (element) => {
  emit('update:panelRef', element)
  if (!element) return
  element.tabIndex = -1
  requestAnimationFrame(() => element.focus({ preventScroll: true }))
}, { immediate: true })

onBeforeUnmount(() => {
  if (props.panelRef === panelEl.value) emit('update:panelRef', null)
})

function onBackdropClick(event: MouseEvent) {
  if (props.blocking) return
  emit('overlayClick', event)
}
</script>

<template>
  <div
    v-bind="$attrs"
    class="modal-base"
    :class="[{ overlay: !props.unstyled }, overlayClass]"
    data-ui-component="Modal.Base"
    @click.self="onBackdropClick"
  >
    <div
      ref="panelEl"
      class=""
      :class="[{ 'overlay-card': !props.unstyled }, panelClass, { dragging }]"
      :style="panelStyle"
      role="dialog"
      aria-modal="true"
      :aria-labelledby="panelAriaLabelledby"
      @pointerdown="emit('panelPointerdown', $event)"
    >
      <slot />
    </div>
  </div>
</template>
