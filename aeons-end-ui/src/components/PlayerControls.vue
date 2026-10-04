<script setup lang="ts">
import aetherIconUrl from '../../../image-database/common images/Aether.png'
import knowledgeIconUrl from '../../../image-database/common images/Knowledge.png'
import { aetherTokenImageUrl, pulseTokenImageUrl } from '../card-images'

interface PlayerControlSummary {
  id: string
  mageName: string
  turnOrderTokenUrl?: string
  hp: number
  charge: number
  chargeThreshold: number
  handCount: number
  handGain: number
  exhausted: boolean
  selected: boolean
  currentTurn: boolean
  turnMarkerArrival: boolean
}

interface AetherSummary {
  regularAvail: number
  gemAether: number
  spellAether: number
  breachAether: number
  aetherTokens: number
}

interface DoomTokenTrack {
  imageUrl: string
  label: string
  count: number
}

defineProps<{
  players: PlayerControlSummary[]
  phaseLabel?: string
  aether: AetherSummary
  pulseTokenCount: number | null
  currentPlayerSelected: boolean
  castingPhase: boolean
  mainPhase: boolean
  canAffordCharge: boolean
  showFreeSpellCast: boolean
  canFreeSpellCast: boolean
  showAbility: boolean
  canActivateAbility: boolean
  doomTokenTrack: DoomTokenTrack | null
  knowledgeCount: number | null
  endTurnWarningVisible: boolean
}>()

const emit = defineEmits<{
  'select-player': [playerId: string]
  'gain-charge': [amount: number]
  'play-all-gems': []
  'end-turn': []
  'to-main-phase': []
  'debug-cast': []
  'activate-ability': []
  'toggle-help': []
}>()
</script>

<template>
  <div class="controls">
    <div class="controls-left">
      <div class="char-select">
        <button
          v-for="candidate in players"
          :key="candidate.id"
          class="char-btn"
          :class="{
            sel: candidate.selected,
            cur: candidate.currentTurn,
            'turn-marker-arrival': candidate.turnMarkerArrival,
            'has-hand-gain': candidate.handGain > 0,
          }"
          @click="emit('select-player', candidate.id)"
        >
          <img class="char-turn-token" :src="candidate.turnOrderTokenUrl ?? ''" alt="" aria-hidden="true" draggable="false" />
          <span class="cn">{{ candidate.mageName }}</span>
          <span class="chp" :data-damage-target="`player:${candidate.id}`">HP <strong class="controls-number">{{ candidate.hp }}</strong></span>
          <span class="cch">Charge <strong class="controls-number">{{ candidate.charge }}</strong>/<strong class="controls-number">{{ candidate.chargeThreshold }}</strong></span>
          <span class="chand">Hand <strong class="controls-number">{{ candidate.handCount }}</strong></span>
          <span v-if="candidate.handGain > 0" class="chand-gain" role="status" :aria-label="`${candidate.mageName} hand gained ${candidate.handGain} cards`">+{{ candidate.handGain }}</span>
          <span v-if="candidate.exhausted" class="cex">EXHAUSTED</span>
        </button>
      </div>
      <div class="controls-status">
        <span class="phase">{{ phaseLabel }}</span>
      </div>
    </div>

    <div class="controls-main">
      <span class="aether">
        <img class="resource-icon" :src="aetherIconUrl" alt="Aether" />
        <span><strong class="controls-number">{{ aether.regularAvail }}</strong><template v-if="aether.gemAether > 0"> · <strong class="controls-number">{{ aether.gemAether }}</strong> gem aether</template><template v-if="aether.spellAether > 0"> · <strong class="controls-number">{{ aether.spellAether }}</strong> spell aether</template><template v-if="aether.breachAether > 0"> · <strong class="controls-number">{{ aether.breachAether }}</strong> breach aether</template></span>
      </span>
      <span
        v-if="aether.aetherTokens > 0"
        class="aether-token-status"
        :aria-label="`${aether.aetherTokens} Aether Tokens`"
        :title="`${aether.aetherTokens} Aether Tokens`"
      >
        <img :src="aetherTokenImageUrl()" alt="Aether Token" draggable="false" />
        <strong class="controls-number">{{ aether.aetherTokens }}</strong>
      </span>
      <span
        v-if="pulseTokenCount !== null"
        class="pulse-token-status"
        :aria-label="`${pulseTokenCount} Pulse Tokens`"
        :title="`${pulseTokenCount} Pulse Tokens`"
      >
        <img :src="pulseTokenImageUrl()" alt="Pulse Token" draggable="false" />
        <strong class="controls-number">{{ pulseTokenCount }}</strong>
      </span>
      <template v-if="currentPlayerSelected">
        <button v-if="castingPhase" class="btn" @click="emit('to-main-phase')">Start Main Phase →</button>
        <template v-if="mainPhase">
          <button class="btn small" :disabled="!canAffordCharge" @click="emit('gain-charge', 1)">Charge</button>
          <button class="btn small" @click="emit('play-all-gems')">Play All Gems</button>
          <span class="end-turn-action">
            <button class="btn primary" @click="emit('end-turn')">End Turn</button>
            <span v-if="endTurnWarningVisible" class="end-turn-warning" role="status">
              Actions remain. End turn anyway?
            </span>
          </span>
        </template>
      </template>
      <button
        v-if="showFreeSpellCast"
        class="btn small"
        :disabled="!canFreeSpellCast"
        @click="emit('debug-cast')"
      >Cast Prepped Spell</button>
      <button
        v-if="showAbility"
        class="btn small"
        :disabled="!canActivateAbility"
        @click="emit('activate-ability')"
      >Activate Ability</button>
      <div
        v-if="doomTokenTrack"
        class="doom-token-track"
        role="img"
        :aria-label="doomTokenTrack.label"
        :title="doomTokenTrack.label"
      >
        <img
          v-for="tokenIndex in 5"
          :key="tokenIndex"
          :src="doomTokenTrack.imageUrl"
          alt=""
          :class="{ 'is-active': doomTokenTrack.count >= tokenIndex }"
        >
      </div>
      <span v-if="knowledgeCount !== null" class="knowledge-status">
        <img class="resource-icon" :src="knowledgeIconUrl" alt="Knowledge" />
        <strong class="controls-number">{{ knowledgeCount }}</strong>
      </span>
    </div>
    <button class="btn help-button" aria-label="Open game help" title="Game Help" @click="emit('toggle-help')">?</button>
  </div>
</template>
