<script setup lang="ts">
import { computed, ref } from 'vue'
import { mageImageUrls } from '../mage-images'
import CardHoverPreview from './CardHoverPreview.vue'
import { useModalDrag } from '../game/useModalDrag'

const props = defineProps<{ mageType: string }>()

const images = computed(() => mageImageUrls(props.mageType))
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

    <div v-if="showModal && images" class="overlay mage-overlay" @click.self="closeModal">
      <div ref="modalEl" class="overlay-card mage-modal draggable-modal" :class="{ dragging }" :style="modalStyle" @pointerdown="startDrag">
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
      </div>
    </div>
  </div>
</template>
