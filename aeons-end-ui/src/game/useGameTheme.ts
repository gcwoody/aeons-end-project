import { ref } from 'vue'

export const gameThemeChoices = [
  { id: 'sunforge', label: 'Sunforge', swatch: '#edbf55' },
  { id: 'obsidian', label: 'Obsidian', swatch: '#777f8b' },
] as const

export type GameThemeId = typeof gameThemeChoices[number]['id']
export type GameThemePreference = GameThemeId | 'random'

const storageKey = 'aeonsEnd.gameThemePreference.v1'
const validThemeIds = new Set<string>(gameThemeChoices.map(choice => choice.id))

function readThemePreference(): GameThemePreference {
  try {
    const saved = window.localStorage.getItem(storageKey)
    if (saved === 'random' || (saved && validThemeIds.has(saved))) return saved as GameThemePreference
  } catch {
    // Theme selection remains usable when browser storage is unavailable.
  }
  return 'random'
}

function chooseRandomTheme(): GameThemeId {
  const index = Math.floor(Math.random() * gameThemeChoices.length)
  return gameThemeChoices[index]!.id
}

const themePreference = ref<GameThemePreference>(readThemePreference())
const activeTheme = ref<GameThemeId>(
  themePreference.value === 'random' ? chooseRandomTheme() : themePreference.value,
)

function setThemePreference(preference: GameThemePreference) {
  themePreference.value = preference
  activeTheme.value = preference === 'random' ? chooseRandomTheme() : preference
  try {
    window.localStorage.setItem(storageKey, preference)
  } catch {
    // Keep the current session's selection even when it cannot be persisted.
  }
}

function applyThemeForGameEntry() {
  activeTheme.value = themePreference.value === 'random'
    ? chooseRandomTheme()
    : themePreference.value
}

export function useGameTheme() {
  return { activeTheme, themePreference, setThemePreference, applyThemeForGameEntry }
}
