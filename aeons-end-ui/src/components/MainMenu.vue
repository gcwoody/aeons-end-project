<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import uiPackage from '../../package.json'
import { useGame } from '../game/useGame'
import { useModalDrag } from '../game/useModalDrag'
import panoramaUrl from '../assets/main-menu-panorama.jpg'
import ModalBase from './ModalBase.vue'

const emit = defineEmits<{ (event: 'start-game'): void }>()
const {
  state, resumeGame, duplicateSave, renameSave,
  requestDeleteSave, requestDeleteSaves, cancelDeleteSave, deleteSaves,
} = useGame()
const { modalEl, modalStyle, dragging, startDrag } = useModalDrag()
const activePanel = ref<'home' | 'saves' | 'updates'>('home')
const updateMessage = ref('')
const updateCheckState = ref<'idle' | 'checking' | 'success'>('idle')
const loadError = ref('')
const editingSaveId = ref<string | null>(null)
const saveNameDraft = ref('')
const selectedSaveIds = ref<string[]>([])
const version = `v${uiPackage.version}`
const saves = computed(() => state.saves)
const allSavesSelected = computed(() => saves.value.length > 0
  && saves.value.every(save => selectedSaveIds.value.includes(save.id)))
const pendingDeleteSaveCount = computed(() => state.deleteSaveIds.length)
let updateCheckTimer: number | undefined

onBeforeUnmount(() => {
  if (updateCheckTimer !== undefined) window.clearTimeout(updateCheckTimer)
  window.removeEventListener('keydown', handleMenuEscape)
})

onMounted(() => window.addEventListener('keydown', handleMenuEscape))

const updateCheckButtonLabel = computed(() => {
  if (updateCheckState.value === 'checking') return 'Checking...'
  if (updateCheckState.value === 'success') return 'Check successful'
  return 'Check for Updates'
})

const releaseNotes = [
  {
    title: 'Mouse-wheel card preview zoom',
    detail: 'Zoom into hovered card previews while keeping the pointer over the card.',
  },
  {
    title: 'Market selection stays open',
    detail: 'Choose several market cards without closing the picker after each choice.',
  },
  {
    title: 'Smoother inspector scrolling',
    detail: 'Wheel scrolling and dragging the horizontal scrollbar now stay in sync.',
  },
]

function openSavedGames() {
  loadError.value = ''
  activePanel.value = 'saves'
}

function loadSavedGame(saveId: string) {
  if (!resumeGame(saveId)) {
    loadError.value = 'This save could not be loaded. It may be damaged or out of date.'
    return
  }
  activePanel.value = 'home'
}

function beginSaveRename(save: (typeof state.saves)[number]) {
  editingSaveId.value = save.id
  saveNameDraft.value = save.name
}

function confirmSaveRename() {
  const saveId = editingSaveId.value
  if (!saveId || !saveNameDraft.value.trim()) return
  renameSave(saveId, saveNameDraft.value)
  cancelSaveRename()
}

function cancelSaveRename() {
  editingSaveId.value = null
  saveNameDraft.value = ''
}

function setSaveSelected(saveId: string, event: Event) {
  const checked = (event.target as HTMLInputElement).checked
  selectedSaveIds.value = checked
    ? [...new Set([...selectedSaveIds.value, saveId])]
    : selectedSaveIds.value.filter(id => id !== saveId)
}

function setAllSavesSelected(event: Event) {
  selectedSaveIds.value = (event.target as HTMLInputElement).checked
    ? saves.value.map(save => save.id)
    : []
}

function requestDeleteSelectedSaves() {
  if (selectedSaveIds.value.length > 0) requestDeleteSaves([...selectedSaveIds.value])
}

function confirmDeleteSaves() {
  deleteSaves([...state.deleteSaveIds])
  selectedSaveIds.value = []
}

function handleMenuEscape(event: KeyboardEvent) {
  if (event.key !== 'Escape' || event.defaultPrevented) return
  if (pendingDeleteSaveCount.value > 0) cancelDeleteSave()
  else if (editingSaveId.value) cancelSaveRename()
  else return
  event.preventDefault()
}

function checkForUpdates() {
  if (updateCheckTimer !== undefined) window.clearTimeout(updateCheckTimer)
  updateCheckState.value = 'checking'
  updateMessage.value = 'Checking this preview build...'
  updateCheckTimer = window.setTimeout(() => {
    updateCheckState.value = 'success'
    updateMessage.value = 'Preview check complete; an online release feed is not connected yet.'
    updateCheckTimer = undefined
  }, 1000)
}

function formatSaveDate(timestamp: number): string {
  return new Date(timestamp).toLocaleString()
}
</script>

<template>
  <div class="main-menu">
    <img class="main-menu__panorama" :src="panoramaUrl" alt="" aria-hidden="true" />
    <div class="main-menu__shade" aria-hidden="true" />

    <div class="main-menu__layout">
      <main class="main-menu__hero">
        <p class="main-menu__eyebrow"><span /> BEYOND THE BREACH · THE VOID</p>
        <h1>Time may bend.<br />Fate may not.</h1>
        <p class="main-menu__intro">
          The Void distorts every moment. Its power may finally be within reach—but can it change Gravehold’s fate?
        </p>

        <div class="main-menu__actions">
          <button class="main-menu__action main-menu__action--primary" type="button" @click="emit('start-game')">
            <span class="main-menu__action-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none">
                <path d="M12 3.5v17M3.5 12h17M5.99 5.99l12.02 12.02m0-12.02L5.99 18.01" />
                <circle cx="12" cy="12" r="8.8" />
              </svg>
            </span>
            <span class="main-menu__action-copy">
              <strong>Start New Game</strong>
              <small>Choose your Mages and Nemesis</small>
            </span>
            <span class="main-menu__action-arrow" aria-hidden="true">→</span>
          </button>

          <button class="main-menu__action" type="button" @click="openSavedGames">
            <span class="main-menu__action-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none">
                <path d="M5 4.5h11l3 3v12H5z" />
                <path d="M8 4.5v5h8v-5M8 19.5v-7h8v7" />
              </svg>
            </span>
            <span class="main-menu__action-copy">
              <strong>Load Saved Game</strong>
              <small>{{ saves.length ? `${saves.length} saved campaign${saves.length === 1 ? '' : 's'} available` : 'Continue a saved campaign' }}</small>
            </span>
            <span class="main-menu__count">{{ saves.length }}</span>
          </button>
        </div>

        <p class="main-menu__tagline">A single moment could decide the city’s future.</p>
      </main>

      <aside class="main-menu__panel" aria-label="Game version and saved games">
        <template v-if="activePanel === 'home'">
          <div class="main-menu__panel-heading">
            <div>
              <p class="main-menu__section-label">THE LATEST DISPATCH</p>
              <h2>Version &amp; Updates</h2>
            </div>
            <span class="main-menu__status-dot" aria-label="Preview build" title="Preview build" />
          </div>

          <div class="main-menu__version-card">
            <div>
              <span class="main-menu__meta-label">CLIENT VERSION</span>
              <strong>{{ version }}</strong>
            </div>
            <span class="main-menu__preview-badge">PREVIEW</span>
          </div>

          <section class="main-menu__notes-preview" aria-labelledby="menu-latest-notes">
            <div class="main-menu__notes-title">
              <h3 id="menu-latest-notes">Recent changes</h3>
              <button class="main-menu__text-button" type="button" @click="activePanel = 'updates'">Release notes</button>
            </div>
            <ul>
              <li v-for="note in releaseNotes" :key="note.title">{{ note.title }}</li>
            </ul>
          </section>

          <div class="main-menu__update-area">
            <button
              class="btn main-menu__check-button"
              :class="{ 'is-checking': updateCheckState === 'checking', 'is-success': updateCheckState === 'success' }"
              type="button"
              :aria-busy="updateCheckState === 'checking'"
              @click="checkForUpdates"
            >
              <svg v-if="updateCheckState === 'checking'" class="main-menu__spinner" viewBox="0 0 20 20" fill="none" aria-hidden="true">
                <circle cx="10" cy="10" r="7.5" stroke-opacity=".25" />
                <path d="M17.5 10A7.5 7.5 0 0 0 10 2.5" />
              </svg>
              <svg v-else-if="updateCheckState === 'success'" viewBox="0 0 20 20" fill="none" aria-hidden="true">
                <path d="m4 10.5 4 4L16.5 6" />
              </svg>
              <svg v-else viewBox="0 0 20 20" fill="none" aria-hidden="true">
                <path d="M16.8 9.2A6.8 6.8 0 0 0 4.6 6.7L3.3 8m0 0V4.6M3.3 8h3.4M3.2 10.8A6.8 6.8 0 0 0 15.4 13l1.3-1.3m0 0v3.4m0-3.4h-3.4" />
              </svg>
              {{ updateCheckButtonLabel }}
            </button>
            <p class="main-menu__update-message" aria-live="polite">
              {{ updateMessage || 'Online update checking is not connected in this preview.' }}
            </p>
          </div>
        </template>

        <template v-else-if="activePanel === 'saves'">
          <div class="main-menu__panel-heading">
            <div>
              <button class="main-menu__back-link" type="button" @click="activePanel = 'home'">← Main Menu</button>
              <p class="main-menu__section-label">YOUR CAMPAIGNS</p>
              <h2>Saved Games <span class="main-menu__save-count">{{ saves.length }}</span></h2>
            </div>
          </div>

          <div v-if="loadError" class="main-menu__error" role="alert">{{ loadError }}</div>
          <div v-if="saves.length" class="main-menu__save-bulk-actions">
            <label class="main-menu__save-select-all">
              <input type="checkbox" aria-label="Select all saved games" :checked="allSavesSelected" @change="setAllSavesSelected" />
              <span>Select all</span>
            </label>
            <button class="btn danger small" type="button" :disabled="selectedSaveIds.length === 0" @click="requestDeleteSelectedSaves">
              Delete selected ({{ selectedSaveIds.length }})
            </button>
          </div>
          <div v-if="saves.length" class="main-menu__save-list">
            <article
              v-for="save in saves"
              :key="save.id"
              class="main-menu__save-card"
            >
              <label class="main-menu__save-select">
                <input
                  type="checkbox"
                  :aria-label="`Select ${save.players.join(' + ')} vs ${save.nemesisType} save`"
                  :checked="selectedSaveIds.includes(save.id)"
                  @change="setSaveSelected(save.id, $event)"
                />
              </label>
              <button class="main-menu__save-load" type="button" @click="loadSavedGame(save.id)">
                <span class="main-menu__save-topline">
                  <strong>{{ save.name }}</strong>
                  <span aria-hidden="true">→</span>
                </span>
                <span class="main-menu__save-matchup">{{ save.players.join(' + ') }}</span>
                <span class="main-menu__save-meta">vs {{ save.nemesisType }} · Round {{ save.round }}</span>
                <span class="main-menu__save-date">{{ formatSaveDate(save.updatedAt) }}</span>
              </button>
              <div class="main-menu__save-actions">
                <form v-if="editingSaveId === save.id" class="main-menu__save-rename-form" @submit.prevent="confirmSaveRename">
                  <input v-model="saveNameDraft" type="text" maxlength="60" aria-label="Saved game name" autofocus />
                  <button class="btn small primary" type="submit" :disabled="!saveNameDraft.trim()">Save name</button>
                  <button class="btn small" type="button" @click="cancelSaveRename">Cancel</button>
                </form>
                <template v-else>
                  <button class="btn small" type="button" @click="beginSaveRename(save)">Rename</button>
                  <button class="btn small" type="button" @click="duplicateSave(save.id)">Copy Save</button>
                  <button class="btn danger small" type="button" @click="requestDeleteSave(save.id)">Delete</button>
                </template>
              </div>
            </article>
          </div>
          <div v-else class="main-menu__empty-saves">
            <span class="main-menu__empty-mark" aria-hidden="true">✦</span>
            <h3>No saved games yet</h3>
            <p>Start a game and choose Save &amp; Exit to create a campaign here.</p>
            <button class="btn primary" type="button" @click="emit('start-game')">Start New Game</button>
          </div>
        </template>

        <template v-else>
          <div class="main-menu__panel-heading">
            <div>
              <button class="main-menu__back-link" type="button" @click="activePanel = 'home'">← Version &amp; Updates</button>
              <p class="main-menu__section-label">{{ version }} · PREVIEW</p>
              <h2>Release Notes</h2>
            </div>
          </div>
          <div class="main-menu__release-list">
            <article v-for="(note, index) in releaseNotes" :key="note.title" class="main-menu__release-item">
              <span class="main-menu__release-index">0{{ index + 1 }}</span>
              <div>
                <h3>{{ note.title }}</h3>
                <p>{{ note.detail }}</p>
              </div>
            </article>
          </div>
          <p class="main-menu__release-footnote">Preview notes for client {{ version }}. A connected release feed will provide published announcements.</p>
        </template>
      </aside>

      <ModalBase
        v-if="pendingDeleteSaveCount > 0"
        overlay-class="save-delete-overlay"
        v-model:panel-ref="modalEl"
        panel-class="draggable-modal"
        :panel-style="modalStyle"
        :dragging="dragging"
        @overlay-click="cancelDeleteSave"
        @panel-pointerdown="startDrag"
      >
        <h2>{{ pendingDeleteSaveCount === 1 ? 'Delete Saved Game?' : `Delete ${pendingDeleteSaveCount} Saved Games?` }}</h2>
        <p class="exit-copy">
          {{ pendingDeleteSaveCount === 1
            ? 'Are you sure you want to delete this saved game?'
            : 'Are you sure you want to delete all selected saved games?' }}
        </p>
        <div class="overlay-actions">
          <button class="btn danger" @click="confirmDeleteSaves">
            {{ pendingDeleteSaveCount === 1 ? 'Delete' : `Delete ${pendingDeleteSaveCount} Saves` }}
          </button>
          <button class="btn" @click="cancelDeleteSave">Cancel</button>
        </div>
      </ModalBase>

      <footer class="main-menu__footer">
        <span><i aria-hidden="true" /> LOCAL PREVIEW BUILD</span>
        <span>{{ version }} <b>·</b> AEON'S END DIGITAL</span>
      </footer>
    </div>
  </div>
</template>
