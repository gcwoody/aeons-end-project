<script setup lang="ts">
import type { BreachState, PreppedSpellChoice } from '@engine/types'
import { getCard } from '@engine/data'
import { cardImageUrl, playerCardBackUrl } from '../card-images'
import { breachPresentation } from '../breach-images'
import { toRoman } from '@engine/engine'
import BreachArtwork from './BreachArtwork.vue'
import CardHoverPreview from './CardHoverPreview.vue'
import CardSurface from './CardSurface.vue'

interface BreachActionCosts {
  focus: number
  open: number
}

interface PendingDamageCast {
  cardId: string
  spellIndex: number
}

interface BreachDisplayBindings {
  canMovePreppedTo: (breach: BreachState) => boolean
  canPrep: (breach: BreachState) => boolean
  conjureBreachChoice: (breach: BreachState) => unknown | null
  isCastableBreach: (breach: BreachState) => boolean
  isMustCastBreach: (breach: BreachState) => boolean
  isMandatoryPreppedEffect: (breach: BreachState, spellIndex?: number) => boolean
  preppedSpellCastChoice: (breach: BreachState, spellIndex?: number) => PreppedSpellChoice | null
  isRepeatCastConfirmation: (breach: BreachState, spellIndex?: number) => boolean
  pendingPreppedSpellChoice: (breach: BreachState, spellIndex?: number) => PreppedSpellChoice | null
  pendingCastSpell: (breach: BreachState, spellIndex: number) => boolean
  isPreppedSpellAction: (breach: BreachState, spellIndex: number) => boolean
  isRepeatablePreppedSpell: (breach: BreachState, spellIndex: number) => boolean
  isAwaitingDividedDamageConfirmation: (breach: BreachState, spellIndex: number) => boolean
  dividedDamageConfirmationSpell: (breach: BreachState) => PendingDamageCast | null
  displayedSpellStackIndex: (breach: BreachState, spellIndex: number) => number
  isDecisionBreachTarget: (breach: BreachState) => boolean
  effectFocusChoice: (breach: BreachState) => unknown | null
  breachCosts: (breach: BreachState) => BreachActionCosts
  isFaceDownPreppedSpell: (breach: BreachState, spellIndex: number) => boolean
  isDraggedPreppedSpell: (breach: BreachState, spellIndex: number) => boolean
  isPendingPreppedSpellSelected: (choice: PreppedSpellChoice) => boolean
  spellDamagePreviewLabel: (breach: BreachState, spellIndex?: number) => string | null
}

const props = defineProps<{
  ownerId: string
  breaches: BreachState[]
  canActMain: boolean
  canRepositionPrepped: boolean
  hasPendingDecision: boolean
  draggingSpell: boolean
  draggedSpellId: string | null
  draggedPreppedSpell: { breachIndex: number; spellIndex: number } | null
  draggedConjuredCard: boolean
  ui: BreachDisplayBindings
}>()

const emit = defineEmits<{
  'click-breach': [breach: BreachState]
  'click-focus': [breach: BreachState]
  'open-breach': [breachIndex: number]
  'click-spell': [breach: BreachState, spellIndex: number]
  'start-spell-drag': [breach: BreachState, spellIndex: number, event: PointerEvent]
  'confirm-divided-damage': []
}>()
</script>

<template>
  <div class="breaches">
    <div
      v-for="breach in breaches"
      :key="breach.index"
      class="breach"
      :class="{
        absent: breach.present === false,
        open: breach.opened,
        castable: ui.isCastableBreach(breach),
        'must-cast': ui.isMustCastBreach(breach),
        'drag-target': draggingSpell && (draggedPreppedSpell
          ? ui.canMovePreppedTo(breach)
          : draggedConjuredCard
            ? !!ui.conjureBreachChoice(breach)
            : ui.canPrep(breach)),
        'move-drag-target': draggingSpell && !!draggedPreppedSpell && ui.canMovePreppedTo(breach),
        'mandatory-prepped-effect': ui.isMandatoryPreppedEffect(breach),
      }"
      :aria-hidden="breach.present === false ? 'true' : undefined"
      :data-breach-index="breach.index"
      @click="emit('click-breach', breach)"
    >
      <template v-if="breach.present !== false">
        <div class="breach-token-wrap" :class="{ 'decision-breach-target': ui.isDecisionBreachTarget(breach) }">
          <BreachArtwork
            :key="`${ownerId}-${breach.index}`"
            :breach="breach"
            :owner-id="ownerId"
            :alt="`Breach ${toRoman(breach.index)} ${breach.opened ? 'open' : 'closed'}`"
            :disabled="draggedSpellId !== null"
          />
          <CardHoverPreview v-if="breach.attachedRelic" :card-id="breach.attachedRelic.cardId" @click.stop>
            <CardSurface
              :card-id="breach.attachedRelic.cardId"
              size="hand"
              class="breach-attached-relic"
              :data-attached-relic-id="breach.attachedRelic.cardId"
              :image-alt="getCard(breach.attachedRelic.cardId).name"
            />
          </CardHoverPreview>
          <div
            v-if="breach.installedUpgrades?.length"
            class="breach-upgrade-strip"
            :aria-label="`Upgrades on Breach ${toRoman(breach.index)}`"
          >
            <CardHoverPreview
              v-for="(upgradeId, upgradeIndex) in breach.installedUpgrades"
              :key="`${upgradeId}:${upgradeIndex}`"
              :card-id="upgradeId"
            >
              <CardSurface
                :card-id="upgradeId"
                size="hand"
                class="breach-upgrade-card"
                :image-alt="getCard(upgradeId).name"
              />
            </CardHoverPreview>
          </div>
          <div
            v-for="(spellId, spellIndex) in breach.prepSpells"
            :key="`${spellId}:${spellIndex}`"
            class="spell"
            :style="{
              '--spell-stack-index': ui.displayedSpellStackIndex(breach, spellIndex),
              zIndex: ui.displayedSpellStackIndex(breach, spellIndex) + 3,
            }"
            :class="{
              'castable-spell': ui.isCastableBreach(breach),
              'must-cast-spell': ui.isMustCastBreach(breach),
              'mandatory-prepped-effect': ui.isMandatoryPreppedEffect(breach, spellIndex),
              'ability-prepped-spell': !!ui.preppedSpellCastChoice(breach, spellIndex),
              'repeat-cast-confirmation': ui.isRepeatCastConfirmation(breach, spellIndex),
              'pending-prepped-spell': !!ui.pendingPreppedSpellChoice(breach, spellIndex),
              'pending-prepped-spell-selected': !!ui.pendingPreppedSpellChoice(breach, spellIndex)
                && ui.isPendingPreppedSpellSelected(ui.pendingPreppedSpellChoice(breach, spellIndex)!),
              'pending-cast-spell': ui.pendingCastSpell(breach, spellIndex),
              'manual-prepped-action': ui.isPreppedSpellAction(breach, spellIndex),
              'repeatable-prepped-action': ui.isRepeatablePreppedSpell(breach, spellIndex),
            }"
          >
            <CardHoverPreview
              :card-id="spellId"
              :image-url="ui.isFaceDownPreppedSpell(breach, spellIndex) ? cardImageUrl(spellId) : undefined"
            >
              <div
                class="breach-spell-card-frame"
                :data-spell-index="spellIndex"
                :class="{
                  'face-down-spell': ui.isFaceDownPreppedSpell(breach, spellIndex),
                  'dragging-prepped-spell': ui.isDraggedPreppedSpell(breach, spellIndex),
                  'castable-spell': ui.isCastableBreach(breach),
                  'must-cast-spell': ui.isMustCastBreach(breach),
                  'mandatory-prepped-effect': ui.isMandatoryPreppedEffect(breach, spellIndex),
                  'ability-prepped-spell': !!ui.preppedSpellCastChoice(breach, spellIndex),
                  'repeat-cast-confirmation': ui.isRepeatCastConfirmation(breach, spellIndex),
                  'pending-prepped-spell': !!ui.pendingPreppedSpellChoice(breach, spellIndex),
                  'pending-prepped-spell-selected': !!ui.pendingPreppedSpellChoice(breach, spellIndex)
                    && ui.isPendingPreppedSpellSelected(ui.pendingPreppedSpellChoice(breach, spellIndex)!),
                  'pending-cast-spell': ui.pendingCastSpell(breach, spellIndex),
                  'manual-prepped-action': ui.isPreppedSpellAction(breach, spellIndex),
                  'repeatable-prepped-action': ui.isRepeatablePreppedSpell(breach, spellIndex),
                  'repositionable-spell': canRepositionPrepped && !hasPendingDecision,
                }"
                @click.stop="emit('click-spell', breach, spellIndex)"
                @pointerdown="emit('start-spell-drag', breach, spellIndex, $event)"
              >
                <img v-if="ui.isFaceDownPreppedSpell(breach, spellIndex)" :src="playerCardBackUrl()" alt="Face-down conjured spell" />
                <img v-else-if="cardImageUrl(spellId)" :src="cardImageUrl(spellId)" :alt="getCard(spellId).name" />
                <span v-else>[{{ getCard(spellId).name }}]</span>
                <span
                  v-if="ui.spellDamagePreviewLabel(breach, spellIndex) !== null"
                  class="spell-damage-badge"
                  :class="{ 'spell-damage-badge-hover': !ui.pendingCastSpell(breach, spellIndex), 'spell-damage-badge-active': ui.pendingCastSpell(breach, spellIndex) }"
                  :aria-label="`Upcoming damage: ${ui.spellDamagePreviewLabel(breach, spellIndex)}`"
                >
                  {{ ui.spellDamagePreviewLabel(breach, spellIndex) }}
                </span>
              </div>
            </CardHoverPreview>
          </div>
          <template v-for="pendingSpell in [ui.dividedDamageConfirmationSpell(breach)]" :key="pendingSpell?.cardId">
            <div
              v-if="pendingSpell"
              class="spell"
              :style="{ '--spell-stack-index': pendingSpell.spellIndex, zIndex: pendingSpell.spellIndex + 3 }"
            >
              <button
                type="button"
                class="breach-spell-card-frame divided-damage-confirm-spell"
                :aria-label="`Confirm ${getCard(pendingSpell.cardId).name} damage allocation`"
                :title="`Click to confirm ${getCard(pendingSpell.cardId).name}`"
                @click.stop="emit('confirm-divided-damage')"
              >
                <img v-if="cardImageUrl(pendingSpell.cardId)" :src="cardImageUrl(pendingSpell.cardId)" :alt="getCard(pendingSpell.cardId).name" draggable="false" />
                <span v-else>{{ getCard(pendingSpell.cardId).name }}</span>
              </button>
            </div>
          </template>
        </div>
        <div
          v-if="!breach.opened && (ui.effectFocusChoice(breach) || (canActMain && !hasPendingDecision))"
          class="btns"
          @click.stop
        >
          <button
            class="btn small"
            :class="{ 'effect-focus-target': !!ui.effectFocusChoice(breach) }"
            :aria-label="ui.effectFocusChoice(breach)
              ? `Focus Breach ${toRoman(breach.index)} with effect`
              : `Focus Breach ${toRoman(breach.index)} for ${ui.breachCosts(breach).focus} Aether`"
            @click.stop="emit('click-focus', breach)"
          >{{ ui.effectFocusChoice(breach) ? 'Focus' : `Focus ${ui.breachCosts(breach).focus}` }}</button>
          <button v-if="canActMain && !hasPendingDecision" class="btn small" @click="emit('open-breach', breach.index)">Open {{ ui.breachCosts(breach).open }}</button>
        </div>
      </template>
    </div>
  </div>
</template>
