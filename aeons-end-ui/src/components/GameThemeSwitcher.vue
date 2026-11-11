<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { gameThemeChoices, useGameTheme, type GameThemePreference } from '../game/useGameTheme'

const { activeTheme, themePreference, setThemePreference } = useGameTheme()
const root = ref<HTMLElement | null>(null)
const isOpen = ref(false)
const activeThemeLabel = computed(() => gameThemeChoices.find(choice => choice.id === activeTheme.value)?.label ?? 'Sunforge')

function chooseTheme(preference: GameThemePreference) {
  setThemePreference(preference)
  isOpen.value = false
}

function closeWhenClickedOutside(event: PointerEvent) {
  if (event.target instanceof Node && !root.value?.contains(event.target)) isOpen.value = false
}

onMounted(() => document.addEventListener('pointerdown', closeWhenClickedOutside))
onBeforeUnmount(() => document.removeEventListener('pointerdown', closeWhenClickedOutside))
</script>

<template>
  <div ref="root" class="game-theme-switcher" @keydown.esc.stop.prevent="isOpen = false">
    <button
      type="button"
      class="btn utility-icon-button game-theme-switcher__trigger"
      aria-label="Choose game theme"
      title="Choose game theme"
      aria-haspopup="dialog"
      :aria-expanded="isOpen"
      @click="isOpen = !isOpen"
    >
      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path d="M12 3.25a8.75 8.75 0 1 0 0 17.5h1.1a2.3 2.3 0 0 0 1.73-3.82 1.25 1.25 0 0 1 .94-2.08h1.12A3.86 3.86 0 0 0 20.75 11 8.75 8.75 0 0 0 12 3.25Z" />
        <circle cx="7.7" cy="11.2" r="1" />
        <circle cx="10.5" cy="7.5" r="1" />
        <circle cx="15.1" cy="8" r="1" />
        <circle cx="17" cy="11.5" r="1" />
      </svg>
    </button>

    <Transition name="game-theme-popover">
      <section v-if="isOpen" class="game-theme-switcher__panel" role="dialog" aria-label="Game themes">
        <header class="game-theme-switcher__header">
          <strong>Game Theme</strong>
          <span>{{ themePreference === 'random' ? `Random · ${activeThemeLabel}` : activeThemeLabel }}</span>
        </header>
        <div class="game-theme-switcher__choices" role="group" aria-label="Choose a game theme">
          <button
            v-for="choice in gameThemeChoices"
            :key="choice.id"
            type="button"
            class="game-theme-switcher__choice"
            :class="{ 'is-selected': themePreference === choice.id }"
            :aria-pressed="themePreference === choice.id"
            @click="chooseTheme(choice.id)"
          >
            <span class="game-theme-switcher__swatch" :style="{ '--theme-swatch': choice.swatch }" aria-hidden="true" />
            <span>{{ choice.label }}</span>
            <span v-if="themePreference === choice.id" class="game-theme-switcher__check" aria-hidden="true">✓</span>
          </button>
          <button
            type="button"
            class="game-theme-switcher__choice game-theme-switcher__choice--random"
            :class="{ 'is-selected': themePreference === 'random' }"
            :aria-pressed="themePreference === 'random'"
            @click="chooseTheme('random')"
          >
            <span class="game-theme-switcher__random-icon" aria-hidden="true">⤨</span>
            <span class="game-theme-switcher__random-copy">
              <strong>Random</strong>
              <small>Choose a new theme each game</small>
            </span>
            <span v-if="themePreference === 'random'" class="game-theme-switcher__check" aria-hidden="true">✓</span>
          </button>
        </div>
      </section>
    </Transition>
  </div>
</template>
