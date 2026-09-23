<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { mageImageUrls } from '../mage-images'
import CardHoverPreview from './CardHoverPreview.vue'
import { useGame } from '../game/useGame'
import { useModalDrag } from '../game/useModalDrag'
import { registerDismissibleOverlay } from '../game/dismissible-overlays'
import ModalBase from './ModalBase.vue'

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
        :image-alt="`${props.mageType} mage board front`"
        :preview-width="840"
        :preview-height="604"
        image-object-fit="contain"
        preview-class="mage-preview"
      >
        <img class="mage-image" :src="images.front" :alt="`${props.mageType} mage board`" draggable="false" />
      </CardHoverPreview>
    </span>
    <div v-else class="mage-unavailable">No mage board</div>

    <ModalBase
      v-if="showModal && images"
      overlay-class="mage-overlay"
      :panel-ref="modalEl"
      panel-class="mage-modal draggable-modal"
      :panel-style="modalStyle"
      :dragging="dragging"
      @overlay-click="closeModal"
      @panel-pointerdown="startDrag"
    >
        <div class="mage-modal-frame" :class="{ flipped: showBack }">
          <img
            class="mage-modal-image"
            :src="showBack ? images.back : images.front"
            :alt="`${props.mageType} mage board ${showBack ? 'back' : 'front'}`"
            draggable="false"
          />
        </div>
        <div class="overlay-actions">
          <button class="btn" @click="showBack = !showBack">{{ showBack ? 'Show Front' : 'Flip to Back' }}</button>
          <button class="btn" @click="closeModal">Close</button>
        </div>
    </ModalBase>
  </div>
</template>
