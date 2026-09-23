<script setup lang="ts">
import { onBeforeUnmount, ref, watch, type Ref, type StyleValue } from 'vue'

defineOptions({ inheritAttrs: false })

const props = defineProps<{
  overlayClass?: unknown
  panelClass?: unknown
  panelStyle?: StyleValue
  panelRef?: Ref<HTMLElement | null>
  panelAriaLabelledby?: string
  dragging?: boolean
  unstyled?: boolean
}>()

const emit = defineEmits<{
  overlayClick: [event: MouseEvent]
  panelPointerdown: [event: PointerEvent]
}>()

const panelEl = ref<HTMLElement | null>(null)

watch(panelEl, (element) => {
  if (props.panelRef) props.panelRef.value = element
  if (!element) return
  element.tabIndex = -1
  requestAnimationFrame(() => element.focus({ preventScroll: true }))
}, { immediate: true })

onBeforeUnmount(() => {
  if (props.panelRef?.value === panelEl.value) props.panelRef.value = null
})
</script>

<template>
  <div
    v-bind="$attrs"
    class="modal-base"
    :class="[{ overlay: !props.unstyled }, overlayClass]"
    data-ui-component="Modal.Base"
    @click.self="emit('overlayClick', $event)"
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
