<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { mageImageUrls } from '../mage-images'
import { displayMageName } from '../game/display-name'
import CardHoverPreview from './CardHoverPreview.vue'
import { useGame } from '../game/useGame'
import { useModalDrag } from '../game/useModalDrag'
import { registerDismissibleOverlay } from '../game/dismissible-overlays'
import ModalBase from './ModalBase.vue'
import ModalCloseButton from './ModalCloseButton.vue'

const props = defineProps<{ mageType: string }>()

const images = computed(() => mageImageUrls(props.mageType))
const { state } = useGame()
const showModal = ref(false)
const showBack = ref(false)
const { modalEl, modalStyle, dragging, startDrag } = useModalDrag()

function openModal() {
  if (!images.value) return
  showBack.value = false
  showModal.value = true
}

function closeModal() {
  showModal.value = false
}

watch(() => state.dismissibleOverlayVersion, closeModal)

const unregisterDismissibleOverlay = registerDismissibleOverlay(() => {
  if (!showModal.value) return false
  closeModal()
  return true
})
onBeforeUnmount(unregisterDismissibleOverlay)
</script>

<template>
  <div class="mage-area">
    <span v-if="images" class="mage-image-wrap" @click="openModal">
      <CardHoverPreview
        :image-url="images.front"
        :image-alt="`${displayMageName(props.mageType)} mage board front`"
        :preview-width="840"
        :preview-height="604"
        image-object-fit="contain"
        preview-class="mage-preview"
      >
        <img class="mage-image" :src="images.front" :alt="`${displayMageName(props.mageType)} mage board`" draggable="false" />
      </CardHoverPreview>
    </span>
    <div v-else class="mage-unavailable">No mage board</div>

    <ModalBase
      v-if="showModal && images"
      overlay-class="mage-overlay"
      v-model:panel-ref="modalEl"
      panel-class="mage-modal draggable-modal"
      :panel-style="modalStyle"
      :dragging="dragging"
      @overlay-click="closeModal"
      @panel-pointerdown="startDrag"
    >
        <ModalCloseButton label="Close Mage mat" @close="closeModal" />
        <button
          type="button"
          class="mage-modal-frame mage-modal-flip-scene"
          :aria-label="showBack ? `Show ${displayMageName(props.mageType)} mat front` : `Flip ${displayMageName(props.mageType)} mat to back`"
          @click="showBack = !showBack"
        >
          <span class="mage-modal-flip-card" :class="{ flipped: showBack }">
          <img
            class="mage-modal-image mage-modal-face"
            :src="images.front"
            :alt="`${displayMageName(props.mageType)} mage board front`"
            draggable="false"
          />
          <img
            class="mage-modal-image mage-modal-face mage-modal-face--back"
            :src="images.back"
            :alt="`${displayMageName(props.mageType)} mage board back`"
            draggable="false"
          />
          </span>
        </button>
    </ModalBase>
  </div>
</template>
