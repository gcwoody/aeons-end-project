<script setup lang="ts">
import { useGame } from '../game/useGame'

const {
  state, newGame, resumeGame,
  requestDeleteSave, cancelDeleteSave, deleteSave,
} = useGame()

function saveTime(timestamp: number): string {
  return new Date(timestamp).toLocaleString()
}

function turnLabel(turn: string): string {
  return turn === 'nemesis' ? 'Nemesis' : turn.toUpperCase()
}
</script>

<template>
  <div class="setup">
    <h1>Aeon's End — Digital Demo</h1>
    <p style="color: var(--muted)">2 players vs Rageborne</p>
    <div class="row">
      <label>
        Player 1
        <select v-model="state.mage1">
          <option value="jian">Jian (Black Mirror)</option>
          <option value="brama">Brama (Brink Siphon)</option>
        </select>
      </label>
      <label>
        Player 2
        <select v-model="state.mage2">
          <option value="jian">Jian (Black Mirror)</option>
          <option value="brama">Brama (Brink Siphon)</option>
        </select>
      </label>
    </div>
    <div class="row">
      <button class="btn primary" style="font-size: 15px; padding: 10px 28px" @click="newGame(state.mage1, state.mage2)">
        Start Game
      </button>
    </div>
    <section class="save-list" aria-label="Saved Games">
      <h2>Saved Games ({{ state.saves.length }})</h2>
      <p v-if="!state.hasSave" class="muted">No saved games found.</p>
      <article v-for="save in state.saves" :key="save.id" class="save-entry">
        <div>
          <strong>{{ save.players.join(' + ') }} vs {{ save.nemesisType }}</strong>
          <span class="save-details">
            Round {{ save.round }} · Turn {{ save.turn }} · Current: {{ turnLabel(save.currentTurn) }} · {{ saveTime(save.updatedAt) }}
          </span>
        </div>
        <div class="save-actions">
          <button class="btn" @click="resumeGame(save.id)">Resume Game</button>
          <button class="btn danger" @click="requestDeleteSave(save.id)">Delete</button>
        </div>
      </article>
    </section>

    <div v-if="state.deleteSaveId" class="overlay save-delete-overlay">
      <div class="overlay-card">
        <h2>Delete Saved Game?</h2>
        <p class="exit-copy">Are you sure you want to delete this saved game?</p>
        <div class="overlay-actions">
          <button class="btn danger" @click="deleteSave(state.deleteSaveId!)">Delete</button>
          <button class="btn" @click="cancelDeleteSave">Cancel</button>
        </div>
      </div>
    </div>
  </div>
</template>
