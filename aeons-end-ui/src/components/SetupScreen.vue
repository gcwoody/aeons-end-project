<script setup lang="ts">
import { useGame } from '../game/useGame'

const { state, newGame, resumeGame } = useGame()
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
      <button v-if="state.hasSave" class="btn" style="font-size: 15px; padding: 10px 28px" @click="resumeGame()">
        Resume Game
      </button>
    </div>
  </div>
</template>
