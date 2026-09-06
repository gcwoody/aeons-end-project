<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { getCard } from '@engine/data'
import type { CardChoice, PendingDecisionAnswer } from '@engine/types'
import { cardImageUrl } from '../card-images'
import { useGame } from '../game/useGame'

const { state, resolveDecision } = useGame()
const selectedCards = ref<CardChoice[]>([])

const decision = computed(() => state.game?.pendingDecision ?? null)

const cardGroups = computed(() => {
  if (!decision.value || decision.value.kind !== 'select_cards') return []
  const groups = new Map<string, CardChoice[]>()
  for (const choice of decision.value.candidates) {
    const list = groups.get(choice.zone) ?? []
    list.push(choice)
    groups.set(choice.zone, list)
  }
  return [...groups.entries()].map(([zone, choices]) => ({
    zone,
    label: zone === 'hand' ? 'Hand' : zone === 'discard' ? 'Discard Pile' : 'Played This Turn',
    choices,
  }))
})

watch(() => decision.value?.id, () => {
  selectedCards.value = []
})

function choiceKey(choice: CardChoice): string {
  return `${choice.zone}:${choice.index}:${choice.cardId}`
}

function isSelected(choice: CardChoice): boolean {
  return selectedCards.value.some(selected => choiceKey(selected) === choiceKey(choice))
}

function toggleCard(choice: CardChoice) {
  if (isSelected(choice)) {
    selectedCards.value = selectedCards.value.filter(selected => choiceKey(selected) !== choiceKey(choice))
    return
  }
  if (!decision.value || decision.value.kind !== 'select_cards') return
  if (selectedCards.value.length >= decision.value.max) return
  selectedCards.value.push(choice)
}

function confirmCards() {
  if (!decision.value || decision.value.kind !== 'select_cards') return
  if (selectedCards.value.length < decision.value.min || selectedCards.value.length > decision.value.max) return
  const answer: PendingDecisionAnswer = { kind: 'select_cards', choices: [...selectedCards.value] }
  resolveDecision(answer)
}

function playerName(playerId: string): string {
  const player = state.game?.players.find(candidate => candidate.id === playerId)
  return player ? `${player.mageType} (${player.id.toUpperCase()})` : playerId
}

function lifeTargetName(target: { kind: string; playerId?: string }): string {
  if (target.kind === 'player') return playerName(target.playerId ?? '')
  return target.kind === 'gravehold' ? 'Gravehold' : 'Nemesis'
}

function answer(kind: PendingDecisionAnswer) {
  resolveDecision(kind)
}
</script>

<template>
  <div v-if="decision && decision.kind !== 'confirm_prepped_effect' && decision.kind !== 'select_prepped_spell'" class="overlay decision-overlay">
    <div class="overlay-card decision-modal">
      <h2>{{ decision.prompt }}</h2>

      <div v-if="decision.kind === 'choose_one'" class="decision-options">
        <button
          v-for="option in decision.options"
          :key="option.id"
          class="btn primary decision-option"
          @click="answer({ kind: 'choose_one', optionId: option.id })"
        >
          {{ option.label }}
        </button>
      </div>

      <div v-else-if="decision.kind === 'choose_optional'" class="decision-options">
        <button class="btn primary decision-option" @click="answer({ kind: 'choose_optional', accepted: true })">
          {{ decision.accept.label }}
        </button>
        <button class="btn decision-option" @click="answer({ kind: 'choose_optional', accepted: false })">
          {{ decision.skip.label }}
        </button>
      </div>

      <template v-else-if="decision.kind === 'select_cards'">
        <div v-for="group in cardGroups" :key="group.zone" class="decision-card-group">
          <h3>{{ group.label }}</h3>
          <div class="decision-card-grid">
            <button
              v-for="choice in group.choices"
              :key="choiceKey(choice)"
              class="decision-card-choice"
              :class="{ selected: isSelected(choice) }"
              @click="toggleCard(choice)"
            >
              <img v-if="cardImageUrl(choice.cardId)" :src="cardImageUrl(choice.cardId)" :alt="choice.cardName" />
              <span v-else>{{ choice.cardName }}</span>
            </button>
          </div>
        </div>
        <div class="decision-footer">
          <span class="stat">Selected {{ selectedCards.length }} / {{ decision.max }}</span>
          <div class="decision-footer-actions">
            <button v-if="decision.min === 0" class="btn" @click="answer({ kind: 'select_cards', choices: [] })">
              Skip
            </button>
            <button
              class="btn primary"
              :disabled="selectedCards.length < decision.min || selectedCards.length > decision.max"
              @click="confirmCards"
            >
              Confirm
            </button>
          </div>
        </div>
      </template>

      <div v-else-if="decision.kind === 'select_player_target'" class="decision-options">
        <button
          v-for="target in decision.targets"
          :key="target.playerId"
          class="btn primary decision-option"
          @click="answer({ kind: 'select_player_target', target })"
        >
          {{ playerName(target.playerId) }}
        </button>
      </div>

      <div v-else-if="decision.kind === 'select_life_target'" class="decision-options">
        <button
          v-for="target in decision.targets"
          :key="target.kind === 'player' ? target.playerId : target.kind"
          class="btn primary decision-option"
          @click="answer({ kind: 'select_life_target', target })"
        >
          {{ lifeTargetName(target) }}
        </button>
      </div>

      <div v-else-if="decision.kind === 'select_damage_target'" class="decision-options">
        <button
          v-for="target in decision.targets"
          :key="target.id"
          class="btn primary decision-option"
          @click="answer({ kind: 'select_damage_target', target })"
        >
          {{ target.label }}
        </button>
      </div>
    </div>
  </div>
</template>
