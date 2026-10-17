<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { getCard } from '@engine/data'
import {
  cardImageUrl,
  nemesisTurnOrderTokenUrl,
  playerCardBackUrl,
  playerTurnOrderTokenUrl,
  pulseTokenImageUrl,
  specificDeckBackUrl,
} from '../card-images'
import CardHoverPreview from './CardHoverPreview.vue'
import CardSurface from './CardSurface.vue'
import AttachedQuarterCard from './AttachedQuarterCard.vue'
import HandMotionDemo from './HandMotionDemo.vue'
import CardSelectionPanel, { type CardSelectionItem } from './CardSelectionPanel.vue'
import LargeCardChoicePanel, { type LargeCardChoiceOption } from './LargeCardChoicePanel.vue'
import CenteredDecisionPrompt from './CenteredDecisionPrompt.vue'
import ZoneScroller from './ZoneScroller.vue'
import ModalBase from './ModalBase.vue'
import MageAbilityChoice from './MageAbilityChoice.vue'
import TwoButtonChoice from './TwoButtonChoice.vue'
import TokenAmountChoicePanel from './TokenAmountChoicePanel.vue'
import TokenBadge from './TokenBadge.vue'
import TurnOrderToken from './TurnOrderToken.vue'
import TurnOrderTokenRow, { type TurnOrderTokenItem } from './TurnOrderTokenRow.vue'
import PlayerDamageChoice, { type PlayerDamageChoiceItem } from './PlayerDamageChoice.vue'
import PlayerDiscardChoice, { type PlayerDiscardActionSummary, type PlayerDiscardChoiceItem } from './PlayerDiscardChoice.vue'
import PlayerLifeChoice, { type PlayerLifeChoiceItem } from './PlayerLifeChoice.vue'
import PreppedSpellChoicePanel from './PreppedSpellChoicePanel.vue'
import { mageImageUrls } from '../mage-images'

type GalleryModal = 'pile' | 'decision' | 'reveal' | 'instant-choice' | 'two-button' | 'token-amount' | 'turn-order' | 'centered-prompt' | 'centered-prompt-cards' | null

const modal = ref<GalleryModal>(null)
const galleryModalEl = ref<HTMLElement | null>(null)
const gallerySelectedCardKeys = ref<string[]>([])
const galleryConfirmedCardNames = ref<string[]>([])
const galleryCardChoices: CardSelectionItem[] = ['clouded_trinket', 'golden_trinket'].map(cardId => ({
  key: cardId,
  cardId,
  cardName: getCard(cardId).name,
  groupKey: 'revealed-cards',
  groupLabel: '',
}))
const galleryCardOrderKeys = ref(galleryCardChoices.map(choice => choice.key))
const galleryOrderedCardChoices = computed(() => {
  const order = new Map(galleryCardOrderKeys.value.map((key, index) => [key, index]))
  return [...galleryCardChoices].sort((a, b) =>
    (order.get(a.key) ?? Number.MAX_SAFE_INTEGER) - (order.get(b.key) ?? Number.MAX_SAFE_INTEGER))
})
const galleryInstantCardChoices: LargeCardChoiceOption[] = galleryCardChoices.map(choice => ({
  id: choice.key,
  cardId: choice.cardId,
  cardName: choice.cardName,
}))
const galleryInstantChoiceConfirmed = ref('')
const galleryTwoButtonChoiceConfirmed = ref('')
const galleryPulseAmount = ref(0)
const galleryPulseAmountConfirmed = ref<number | null>(null)
const galleryTurnOrderKeys = ref(['p1-0', 'nemesis-0', 'p2-0', 'p1-1', 'nemesis-1'])
const galleryPulseSummary = {
  template: 'Deal {amount} damage divided however you choose among enemies.',
  baseAmount: 2,
}
const galleryTwoButtonOptions = [
  { id: 'damage', label: 'Deal 2 damage and gain 1 Pulse token' },
  { id: 'spend', label: 'Lose 3 Pulse tokens to deal 7 damage', disabled: false },
]
const galleryDamageChoices: PlayerDamageChoiceItem[] = [
  { target: { kind: 'player', playerId: 'gallery-jian' }, mageName: 'Jian', hp: 7, tokenUrl: playerTurnOrderTokenUrl(1), damage: 2 },
  { target: { kind: 'player', playerId: 'gallery-brama' }, mageName: 'Brama', hp: 9, tokenUrl: playerTurnOrderTokenUrl(2), damage: 3 },
]
const galleryLifeChoices: PlayerLifeChoiceItem[] = [
  { target: { kind: 'player', playerId: 'gallery-jian' }, mageName: 'Jian', hp: 7, tokenUrl: playerTurnOrderTokenUrl(1), amount: 2 },
  { target: { kind: 'player', playerId: 'gallery-brama' }, mageName: 'Brama', hp: 9, tokenUrl: playerTurnOrderTokenUrl(2), amount: 2 },
]
const galleryDamageTarget = ref('')
const galleryLifeTarget = ref('')
const galleryDiscardTarget = ref('')
const galleryPreppedSpellResult = ref('')
const galleryDiscardChoices: PlayerDiscardChoiceItem[] = [
  { target: { kind: 'player', playerId: 'gallery-jian' }, mageName: 'Jian', handCount: 5, tokenUrl: playerTurnOrderTokenUrl(1) },
  { target: { kind: 'player', playerId: 'gallery-brama' }, mageName: 'Brama', handCount: 4, tokenUrl: playerTurnOrderTokenUrl(2) },
]
const galleryDiscardAction: PlayerDiscardActionSummary = { minAmount: 3, maxAmount: 3, drawAmount: 1 }
const galleryDiscardOnlyAction: PlayerDiscardActionSummary = { minAmount: 2, maxAmount: 2, drawAmount: 0 }
const galleryTurnOrderItems = computed<TurnOrderTokenItem[]>(() => {
  const tokens: Record<string, TurnOrderTokenItem> = {
    'p1-0': { key: 'p1-0', label: 'Player 1 turn', tokenUrl: playerTurnOrderTokenUrl(1) },
    'nemesis-0': { key: 'nemesis-0', label: 'Nemesis turn', tokenUrl: nemesisTurnOrderTokenUrl() },
    'p2-0': { key: 'p2-0', label: 'Player 2 turn', tokenUrl: playerTurnOrderTokenUrl(2) },
    'p1-1': { key: 'p1-1', label: 'Player 1 turn', tokenUrl: playerTurnOrderTokenUrl(1) },
    'nemesis-1': { key: 'nemesis-1', label: 'Nemesis turn', tokenUrl: nemesisTurnOrderTokenUrl() },
  }
  return galleryTurnOrderKeys.value.map(key => tokens[key]).filter((item): item is TurnOrderTokenItem => !!item)
})

watch(modal, (value) => {
  if (!value) return
  if (value === 'decision') {
    gallerySelectedCardKeys.value = []
    galleryConfirmedCardNames.value = []
    galleryCardOrderKeys.value = galleryCardChoices.map(choice => choice.key)
  }
  if (value === 'instant-choice') galleryInstantChoiceConfirmed.value = ''
  if (value === 'two-button') galleryTwoButtonChoiceConfirmed.value = ''
  if (value === 'token-amount') {
    galleryPulseAmount.value = 0
    galleryPulseAmountConfirmed.value = null
  }
  if (value === 'turn-order') galleryTurnOrderKeys.value = ['p1-0', 'nemesis-0', 'p2-0', 'p1-1', 'nemesis-1']
  nextTick(() => galleryModalEl.value?.focus({ preventScroll: true }))
})

function handleGalleryKeydown(event: KeyboardEvent) {
  if (event.key !== 'Escape' || modal.value !== 'pile') return
  event.preventDefault()
  modal.value = null
}

onMounted(() => window.addEventListener('keydown', handleGalleryKeydown))
onBeforeUnmount(() => window.removeEventListener('keydown', handleGalleryKeydown))

const handCards = ['vision_shard', 'crystal', 'spark']
const miniCards = ['crystal', 'spark', 'corrupted_coil', 'runic_flute', 'fungal_network']
const pileCards = ['calcified_electinium', 'corrupted_coil', 'fungal_network', 'runic_flute', 'time_cortex']
const galleryDoomedUnderCards = ['vortex_blast', 'abyssal_vial']
const mageAbilityMatUrl = mageImageUrls('indira')?.front
const mageAbilityOptions = [
  {
    id: 'cast_twice',
    label: "Cast a spell from an ally's hand twice without discarding it",
  },
  {
    id: 'spell_aether',
    label: 'Gain 5 Aether that may only be spent on Spells',
  },
]
const selectedMageAbilityChoice = ref('')
const selectedMageAbilityChoiceLabel = computed(() =>
  mageAbilityOptions.find(option => option.id === selectedMageAbilityChoice.value)?.label ?? '',
)

function cardName(cardId: string): string {
  return getCard(cardId).name
}

function reorderGalleryCards(keys: string[]) {
  galleryCardOrderKeys.value = [...keys]
}

function confirmGalleryCardSelection() {
  galleryConfirmedCardNames.value = galleryOrderedCardChoices.value
    .filter(choice => gallerySelectedCardKeys.value.includes(choice.key))
    .map(choice => choice.cardName)
}

function confirmGalleryInstantChoice(optionId: string) {
  const choice = galleryInstantCardChoices.find(option => option.id === optionId)
  if (!choice) return
  galleryInstantChoiceConfirmed.value = choice.cardName
  modal.value = null
}

function confirmGalleryTwoButtonChoice(optionId: string) {
  galleryTwoButtonChoiceConfirmed.value = galleryTwoButtonOptions.find(option => option.id === optionId)?.label ?? ''
  modal.value = null
}

function confirmGalleryPulseAmount() {
  galleryPulseAmountConfirmed.value = galleryPulseAmount.value
  modal.value = null
}

function castGalleryPreppedSpell() {
  galleryPreppedSpellResult.value = 'Spark cast.'
}

function skipGalleryPreppedSpell() {
  galleryPreppedSpellResult.value = 'Skipped.'
}

function reorderGalleryTurnOrder(keys: string[]) {
  galleryTurnOrderKeys.value = keys
}

</script>

<template>
  <main class="ui-gallery" data-ui-gallery>
    <header class="ui-gallery-header">
      <div>
        <p class="ui-gallery-kicker">Aeon's End Digital · UI Gallery</p>
        <h1>Reusable UI Components</h1>
        <p class="ui-gallery-intro">
          Development-only component catalogue. These fixtures do not modify a game state.
        </p>
      </div>
      <a class="btn" href="/">Exit Gallery</a>
    </header>

    <section class="ui-gallery-section" data-gallery-section="hand-motion">
      <article class="ui-gallery-item" data-component="Hand.Motion">
        <h2>Hand motion</h2>
        <p class="ui-gallery-caption">Play a card, fly it to the discard pile, add cards, scroll an overflowing hand, or switch Mage. Repeat actions during movement to check how the shared flight and hand-shift animations finish.</p>
        <HandMotionDemo />
      </article>
    </section>

    <section class="ui-gallery-section" data-gallery-section="card-surfaces">
      <div class="ui-gallery-section-heading">
        <div>
          <p class="ui-gallery-index">01 · Cards</p>
          <h2>Card surfaces and states</h2>
        </div>
        <span class="ui-gallery-note">2px borders · rounded corners · hover previews</span>
      </div>

      <div class="ui-gallery-grid ui-gallery-grid-cards">
        <article class="ui-gallery-item" data-component="Card.Hand">
          <h3>Card.Hand</h3>
          <p class="ui-gallery-caption">Standard face-up hand card</p>
          <div class="ui-gallery-surface hand-surface">
            <CardHoverPreview :card-id="handCards[0]">
              <CardSurface :card-id="handCards[0]" class="gallery-hand-card" />
            </CardHoverPreview>
          </div>
        </article>

        <article class="ui-gallery-item" data-component="Card.Mini">
          <h3>Card.Mini</h3>
          <p class="ui-gallery-caption">Played, Swap and Develop zones</p>
          <div class="ui-gallery-surface mini-surface">
            <CardHoverPreview v-for="cardId in miniCards.slice(0, 3)" :key="cardId" :card-id="cardId">
              <CardSurface :card-id="cardId" size="mini" class="gallery-mini-card" />
            </CardHoverPreview>
          </div>
        </article>

        <article class="ui-gallery-item" data-component="Card.Pile">
          <h3>Card.Pile</h3>
          <p class="ui-gallery-caption">Deck, discard and specific deck surfaces</p>
          <div class="ui-gallery-surface pile-surface">
            <CardSurface base-class="gallery-pile-card" class="gallery-pile-card-back" image-fit="fill" :image-url="playerCardBackUrl()" image-alt="Player card back">
              <template #overlay><span class="gallery-pile-count">12</span></template>
            </CardSurface>
            <CardHoverPreview :card-id="pileCards[0]">
              <CardSurface base-class="gallery-pile-card" :card-id="pileCards[0]">
                <template #overlay><span class="gallery-pile-count">4</span></template>
              </CardSurface>
            </CardHoverPreview>
          </div>
        </article>

        <article class="ui-gallery-item" data-component="Card.FaceDown">
          <h3>Card.FaceDown</h3>
          <p class="ui-gallery-caption">Unknown information stays face-down</p>
          <div class="ui-gallery-surface face-down-surface">
            <CardHoverPreview :image-url="specificDeckBackUrl('treasure_2')" image-alt="Treasure deck card back">
              <div class="gallery-face-down-card">
                <img :src="specificDeckBackUrl('treasure_2')" alt="Treasure deck card back" draggable="false" />
              </div>
            </CardHoverPreview>
          </div>
        </article>

        <article class="ui-gallery-item" data-component="Card.AttachedQuarter">
          <h3>Card.AttachedQuarter</h3>
          <p class="ui-gallery-caption">Treasure attached to a supply pile</p>
          <div class="ui-gallery-surface attached-surface">
            <CardHoverPreview :card-id="'amethyst_shard'">
              <div class="gallery-attached-supply">
                <img :src="cardImageUrl('amethyst_shard')" :alt="cardName('amethyst_shard')" draggable="false" />
                <AttachedQuarterCard card-id="runic_flute" />
              </div>
            </CardHoverPreview>
          </div>
        </article>

        <article class="ui-gallery-item" data-component="Card.Reveal">
          <h3>Card.Reveal</h3>
          <p class="ui-gallery-caption">Readable revealed cards in a decision modal</p>
          <div class="ui-gallery-surface reveal-surface">
            <CardHoverPreview v-for="cardId in pileCards.slice(0, 2)" :key="cardId" :card-id="cardId">
              <div class="gallery-reveal-card">
                <img :src="cardImageUrl(cardId)" :alt="cardName(cardId)" draggable="false" />
              </div>
            </CardHoverPreview>
          </div>
        </article>

        <article class="ui-gallery-item" data-component="Damage.DividedAllocation">
          <h3>Damage.DividedAllocation</h3>
          <p class="ui-gallery-caption">Red minus badges show the automatic assignment; adjust with right-click and confirm by clicking the Spell again</p>
          <div class="ui-gallery-surface gallery-damage-allocation">
            <div v-for="(cardId, index) in ['needlemaw', 'cauterizer']" :key="cardId" class="gallery-damage-unit">
              <img :src="cardImageUrl(cardId)" :alt="cardName(cardId)" draggable="false" />
              <span class="damage-allocation-badge" :aria-label="`${index + 1} damage assigned`">−{{ index + 1 }}</span>
            </div>
          </div>
        </article>

        <article class="ui-gallery-item" data-component="Decision.MarketTargets">
          <h3>Decision.MarketTargets</h3>
          <p class="ui-gallery-caption">Orange marks a choice; red marks a required target</p>
          <div class="gallery-market-targets">
            <div class="gallery-market-target-item">
              <button class="pile decision-market-choice game-highlight game-highlight--choice player-card-hover-feedback" type="button" aria-label="Eligible supply pile">
                <img :src="cardImageUrl('vriswood_amber')" alt="Eligible V’riswood Amber pile" draggable="false" />
              </button>
              <span>Eligible</span>
            </div>
            <div class="gallery-market-target-item">
              <button class="pile" type="button" aria-label="Ineligible supply pile">
                <img :src="cardImageUrl('crystal')" alt="Ineligible Crystal pile" draggable="false" />
              </button>
              <span>Ineligible</span>
            </div>
            <div class="gallery-market-target-item">
              <button class="pile decision-market-choice decision-market-choice-required game-highlight game-highlight--required player-card-hover-feedback" type="button" aria-label="Required supply pile">
                <img :src="cardImageUrl('runic_flute')" alt="Required Runic Flute pile" draggable="false" />
              </button>
              <span>Required</span>
            </div>
          </div>
        </article>
      </div>

      <div class="ui-gallery-state-row" data-component="Card.States">
        <span class="ui-gallery-state-label">Highlight meaning</span>
        <div class="card small card-image gallery-state-card game-highlight game-highlight--available player-card-hover-feedback">
          <img :src="cardImageUrl('crystal')" alt="Actionable Crystal" draggable="false" />
          <span class="gallery-state-chip">Available</span>
        </div>
        <div class="card small card-image gallery-state-card game-highlight game-highlight--choice player-card-hover-feedback">
          <img :src="cardImageUrl('spark')" alt="Selectable Spark" draggable="false" />
          <span class="gallery-state-chip">Choice</span>
        </div>
        <div class="card small card-image gallery-state-card game-highlight game-highlight--selected player-card-hover-feedback">
          <img :src="cardImageUrl('spark')" alt="Selected Spark" draggable="false" />
          <span class="gallery-state-chip">Selected</span>
        </div>
        <div class="card small card-image gallery-state-card game-highlight game-highlight--required player-card-hover-feedback">
          <img :src="cardImageUrl('spark')" alt="Highlighted target Spark" draggable="false" />
          <span class="gallery-state-chip">Required</span>
        </div>
        <div class="card small card-image gallery-state-card game-highlight game-highlight--context player-card-hover-feedback">
          <img :src="cardImageUrl('crystal')" alt="Contextual target Crystal" draggable="false" />
          <span class="gallery-state-chip">Context</span>
        </div>
        <div class="card small card-image gallery-state-card disabled-card">
          <img :src="cardImageUrl('crystal')" alt="Disabled Crystal" draggable="false" />
          <span class="gallery-state-chip">Disabled</span>
        </div>
      </div>
    </section>

    <section class="ui-gallery-section" data-gallery-section="piles-and-zones">
      <div class="ui-gallery-section-heading">
        <div>
          <p class="ui-gallery-index">02 · Piles and zones</p>
          <h2>Overflow, empty states and conditional zones</h2>
        </div>
        <span class="ui-gallery-note">center short rows · scroll long rows</span>
      </div>

      <div class="ui-gallery-grid ui-gallery-grid-zones">
        <article class="ui-gallery-item" data-component="ZoneScroller">
          <h3>ZoneScroller</h3>
          <p class="ui-gallery-caption">Long content keeps all cards reachable</p>
          <ZoneScroller class="ui-gallery-zone-scroll">
            <div class="ui-gallery-zone-track">
              <CardHoverPreview v-for="(cardId, index) in [...miniCards, ...miniCards]" :key="`${cardId}-${index}`" :card-id="cardId">
                <div class="card small card-image gallery-mini-card">
                  <img :src="cardImageUrl(cardId)" :alt="cardName(cardId)" draggable="false" />
                </div>
              </CardHoverPreview>
            </div>
          </ZoneScroller>
        </article>

        <article class="ui-gallery-item" data-component="Pile.Deck">
          <h3>Pile.Deck</h3>
          <p class="ui-gallery-caption">Non-empty pile</p>
          <div class="ui-gallery-pile-demo">
            <CardSurface base-class="gallery-pile-card" class="gallery-pile-card-back" image-fit="fill" :image-url="playerCardBackUrl()" image-alt="Deck">
              <template #overlay><span class="gallery-pile-count">18</span></template>
            </CardSurface>
          </div>
        </article>

        <article class="ui-gallery-item" data-component="Pile.Empty">
          <h3>Pile.Empty</h3>
          <p class="ui-gallery-caption">Empty pile preserves its identity</p>
          <div class="ui-gallery-empty-pile">Discard 0</div>
        </article>

        <article class="ui-gallery-item" data-component="Badge.Token">
          <h3>Badge.Token</h3>
          <p class="ui-gallery-caption">Stable status badge placement</p>
          <div class="ui-gallery-badge-demo">
            <TokenBadge class="gallery-token-badge" label="Power" :count="2" tone="power" />
            <TokenBadge class="gallery-token-badge gallery-token-badge-gold" label="Aether Token" :count="3" tone="aether" />
          </div>
        </article>

        <article class="ui-gallery-item gallery-underneath-item" data-component="Nemesis.UnderneathCards">
          <h3>Nemesis.UnderneathCards</h3>
          <p class="ui-gallery-caption">Cards placed underneath a Minion stay face-up, overlap in order, and move with that Minion’s display.</p>
          <div class="ui-gallery-surface gallery-underneath-surface">
            <CardHoverPreview :card-id="'the_doomed'" :preview-width="210" :preview-height="291.02">
              <div class="nemesis-play-card nemesis-minion nemesis-stationed-card game-highlight gallery-underneath-minion" aria-label="The Doomed with two Vortex cards underneath">
                <img :src="cardImageUrl('the_doomed')" :alt="cardName('the_doomed')" draggable="false" />
                <div class="nemesis-under-card-stack" :aria-label="`Cards underneath: ${galleryDoomedUnderCards.map(cardName).join(', ')}`">
                  <CardSurface
                    v-for="cardId in galleryDoomedUnderCards"
                    :key="`doomed-under-${cardId}`"
                    base-class="nemesis-under-card"
                    size="mini"
                    :card-id="cardId"
                    :image-alt="cardName(cardId)"
                  />
                </div>
              </div>
            </CardHoverPreview>
          </div>
        </article>
      </div>
    </section>

    <section class="ui-gallery-section" data-gallery-section="modals">
      <div class="ui-gallery-section-heading">
        <div>
          <p class="ui-gallery-index">03 · Modals</p>
          <h2>Decision and pile viewer examples</h2>
        </div>
        <span class="ui-gallery-note">centered prompts, blocking decisions, and readable card layouts</span>
      </div>
      <div class="ui-gallery-modal-launchers">
        <button class="btn primary" data-gallery-open="pile" @click="modal = 'pile'">Open PileViewer</button>
        <button class="btn" data-gallery-open="decision" @click="modal = 'decision'">Open CardSelectionModal</button>
        <button class="btn" data-gallery-open="reveal" @click="modal = 'reveal'">Open Reveal Card</button>
        <button class="btn" data-gallery-open="instant-choice" @click="modal = 'instant-choice'">Open Instant Card Choice</button>
        <button class="btn" data-gallery-open="two-button" @click="modal = 'two-button'">Open Two Button Choice</button>
        <button class="btn" data-gallery-open="centered-prompt" @click="modal = 'centered-prompt'">Open Centered Prompt</button>
        <button class="btn" data-gallery-open="centered-prompt-cards" @click="modal = 'centered-prompt-cards'">Open Centered Prompt with Cards</button>
        <button class="btn" data-gallery-open="token-amount" @click="modal = 'token-amount'">Open Token Amount Choice</button>
        <button class="btn" data-gallery-open="turn-order" @click="modal = 'turn-order'">Open Turn Order Tokens</button>
      </div>
      <article class="ui-gallery-item" data-component="Interaction.PointerReorder">
        <h3>Interaction.PointerReorder</h3>
        <p class="ui-gallery-caption">Shared by revealed-card sorting, Debug deck editing and Turn Order tokens</p>
        <div class="ui-gallery-code-example">
          <code>Pointer capture → midpoint insertion → smooth reflow</code>
          <span>Hover: grab · hold: grabbing · no native drag preview</span>
        </div>
      </article>
      <article class="ui-gallery-item" data-component="Decision.PlayerDamageChoice">
        <h3>Decision.PlayerDamageChoice</h3>
        <p class="ui-gallery-caption">A shared target picker for effects that ask a Mage to suffer damage</p>
        <div class="ui-gallery-surface gallery-damage-choice-surface">
          <PlayerDamageChoice :choices="galleryDamageChoices" @select="galleryDamageTarget = $event.playerId" />
        </div>
        <p v-if="galleryDamageTarget" class="ui-gallery-ability-choice-selection" role="status">
          {{ galleryDamageChoices.find(choice => choice.target.playerId === galleryDamageTarget)?.mageName }} selected
        </p>
      </article>
      <article class="ui-gallery-item" data-component="Decision.PlayerLifeChoice">
        <h3>Decision.PlayerLifeChoice</h3>
        <p class="ui-gallery-caption">A shared Mage picker for effects that let players gain life</p>
        <div class="ui-gallery-surface gallery-life-choice-surface">
          <PlayerLifeChoice :choices="galleryLifeChoices" @select="galleryLifeTarget = $event.playerId" />
        </div>
        <p v-if="galleryLifeTarget" class="ui-gallery-ability-choice-selection">
          {{ galleryLifeChoices.find(choice => choice.target.playerId === galleryLifeTarget)?.mageName }} selected
        </p>
      </article>
      <article class="ui-gallery-item" data-component="Decision.PlayerDiscardChoice">
        <h3>Decision.PlayerDiscardChoice</h3>
        <p class="ui-gallery-caption">A shared Mage picker that states the discard and immediate draw before a target is chosen</p>
        <div class="ui-gallery-surface gallery-player-discard-surface">
          <PlayerDiscardChoice
            :choices="galleryDiscardChoices"
            :action="galleryDiscardAction"
            @select="galleryDiscardTarget = $event.playerId"
          />
        </div>
        <p class="ui-gallery-caption gallery-discard-only-example">Discard-only state:</p>
        <div class="ui-gallery-surface gallery-player-discard-surface">
          <PlayerDiscardChoice :choices="galleryDiscardChoices" :action="galleryDiscardOnlyAction" />
        </div>
        <p v-if="galleryDiscardTarget" class="ui-gallery-ability-choice-selection" role="status">
          {{ galleryDiscardChoices.find(choice => choice.target.playerId === galleryDiscardTarget)?.mageName }} selected
        </p>
      </article>
      <article class="ui-gallery-item" data-component="Decision.PreppedSpellChoicePanel">
        <h3>Decision.PreppedSpellChoicePanel</h3>
        <p class="ui-gallery-caption">Click an optional prepped spell to cast it immediately, or skip</p>
        <div class="ui-gallery-surface gallery-prepped-choice-surface">
          <button
            class="gallery-prepped-choice-card game-highlight game-highlight--choice"
            type="button"
            aria-label="Cast Spark"
            @click="castGalleryPreppedSpell"
          >
            <CardSurface card-id="spark" size="mini" />
          </button>
          <PreppedSpellChoicePanel
            :selected-count="0"
            :min="0"
            :max="1"
            :allow-skip="true"
            :confirm-selection="false"
            @skip="skipGalleryPreppedSpell"
          />
        </div>
        <p class="ui-gallery-ability-choice-selection">
          {{ galleryPreppedSpellResult || 'Click the card to cast it immediately, or click Skip.' }}
        </p>
      </article>
      <p v-if="galleryInstantChoiceConfirmed" class="ui-gallery-ability-choice-selection" role="status">
        Instant choice confirmed: {{ galleryInstantChoiceConfirmed }}
      </p>
      <p v-if="galleryTwoButtonChoiceConfirmed" class="ui-gallery-ability-choice-selection" role="status">
        Two-button choice confirmed: {{ galleryTwoButtonChoiceConfirmed }}
      </p>
      <p v-if="galleryPulseAmountConfirmed !== null" class="ui-gallery-ability-choice-selection" role="status">
        Pulse amount confirmed: {{ galleryPulseAmountConfirmed }}
      </p>
      <article class="ui-gallery-item" data-component="Decision.MageAbilityChoice">
        <h3>Decision.MageAbilityChoice</h3>
        <p class="ui-gallery-caption">Two ability effects, presented as choices beneath the Mage mat</p>
        <div class="ui-gallery-ability-choice-surface">
          <MageAbilityChoice
            class="gallery-mage-ability-choice"
            :mage-mat-url="mageAbilityMatUrl"
            mage-name="Indira"
            :options="mageAbilityOptions"
            @select="selectedMageAbilityChoice = $event"
          />
        </div>
        <p class="ui-gallery-ability-choice-selection" aria-live="polite">
          {{ selectedMageAbilityChoiceLabel ? `Selected: ${selectedMageAbilityChoiceLabel}` : 'Select a choice to preview its interaction.' }}
        </p>
      </article>
    </section>

    <section class="ui-gallery-section" data-gallery-section="naming">
      <div class="ui-gallery-section-heading">
        <div>
          <p class="ui-gallery-index">04 · Naming</p>
          <h2>Use component names in future requests</h2>
        </div>
      </div>
      <div class="ui-gallery-code-example">
        <code>Card.Pile + face-down + known-information + clickable</code>
        <span>Specific Deck viewer with remembered reveals</span>
      </div>
    </section>

    <CenteredDecisionPrompt
      v-if="modal === 'centered-prompt' || modal === 'centered-prompt-cards'"
      data-gallery-modal
      data-component="Decision.CenteredPrompt"
      :title="modal === 'centered-prompt-cards' ? 'Choose a Supply pile to replace' : 'A centered decision prompt'"
      :message="modal === 'centered-prompt-cards'
        ? 'Select a highlighted Supply pile. The orange card is the replacement for this step.'
        : 'This shared prompt stays centered while the board remains visible around it.'"
      :preview-card-ids="modal === 'centered-prompt-cards' ? ['vortex_blast', 'abyssal_vial'] : []"
      :highlighted-preview-card-id="modal === 'centered-prompt-cards' ? 'vortex_blast' : undefined"
    >
      <template #actions>
        <button class="btn primary" @click="modal = null">Close</button>
      </template>
    </CenteredDecisionPrompt>

    <ModalBase
      v-if="modal && modal !== 'centered-prompt' && modal !== 'centered-prompt-cards'"
      unstyled
      overlay-class="ui-gallery-modal-overlay"
      panel-class="ui-gallery-modal"
      v-model:panel-ref="galleryModalEl"
      data-gallery-modal
      @overlay-click="modal = null"
    >
        <button class="ui-gallery-modal-close" aria-label="Close gallery modal" @click="modal = null">×</button>
        <template v-if="modal === 'pile'">
          <p class="ui-gallery-index">PileViewer · top → bottom</p>
          <h2>Specific Deck</h2>
          <div class="ui-gallery-modal-cards">
            <CardHoverPreview v-for="cardId in pileCards" :key="cardId" :card-id="cardId">
              <div class="gallery-modal-card">
                <img :src="cardImageUrl(cardId)" :alt="cardName(cardId)" draggable="false" />
              </div>
            </CardHoverPreview>
          </div>
          <button class="btn" @click="modal = null">Close</button>
        </template>
        <template v-else-if="modal === 'decision'">
          <p class="ui-gallery-index">Interaction.PointerReorder · Decision.CardSelection</p>
          <h2>Choose cards to discard</h2>
          <p class="ui-gallery-modal-hint">Grab and slide cards to set their order, select any to discard, then confirm.</p>
          <CardSelectionPanel
            v-model:selected-keys="gallerySelectedCardKeys"
            :choices="galleryOrderedCardChoices"
            :min="0"
            :max="3"
            :group-labels="false"
            :reorderable="true"
            :large-cards="true"
            @reorder="reorderGalleryCards"
            @confirm="confirmGalleryCardSelection"
            @skip="gallerySelectedCardKeys = []"
          />
          <p v-if="galleryConfirmedCardNames.length" class="ui-gallery-modal-hint" role="status">
            Confirmed: {{ galleryConfirmedCardNames.join(', ') }}
          </p>
        </template>
        <template v-else-if="modal === 'reveal'">
          <p class="ui-gallery-index">Decision.RevealCard · mandatory confirmation</p>
          <h2>Reveal a Card</h2>
          <p class="ui-gallery-modal-hint">The revealed card stays visible until the effect is confirmed.</p>
          <div class="ui-gallery-modal-reveal">
            <CardHoverPreview :card-id="pileCards[0]">
              <div class="gallery-modal-reveal-card">
                <img :src="cardImageUrl(pileCards[0])" :alt="cardName(pileCards[0])" draggable="false" />
              </div>
            </CardHoverPreview>
          </div>
          <div class="ui-gallery-modal-actions">
            <button class="btn primary" @click="modal = null">Confirm</button>
          </div>
        </template>
        <template v-else-if="modal === 'instant-choice'">
          <p class="ui-gallery-index">Decision.LargeCardChoice · immediate confirmation</p>
          <h2>Choose a Trinket</h2>
          <p class="ui-gallery-modal-hint">Click a card to confirm immediately.</p>
          <LargeCardChoicePanel
            :choices="galleryInstantCardChoices"
            @choose="confirmGalleryInstantChoice"
          />
        </template>
        <template v-else-if="modal === 'two-button'">
          <p class="ui-gallery-index">Decision.TwoButtonChoice · immediate decision</p>
          <h2>Choose one effect</h2>
          <p class="ui-gallery-modal-hint">Two clear blue buttons for a single choice.</p>
          <TwoButtonChoice :options="galleryTwoButtonOptions" @select="confirmGalleryTwoButtonChoice" />
        </template>
        <template v-else-if="modal === 'token-amount'">
          <p class="ui-gallery-index">Decision.TokenAmountChoice · confirm amount</p>
          <h2>Choose how many Pulse tokens to lose</h2>
          <TokenAmountChoicePanel
            token-name="Pulse"
            :token-image-url="pulseTokenImageUrl()"
            :min-amount="0"
            :max-amount="5"
            :summary="galleryPulseSummary"
            v-model="galleryPulseAmount"
            @confirm="confirmGalleryPulseAmount"
          />
        </template>
        <template v-else-if="modal === 'turn-order'">
          <p class="ui-gallery-index">Interaction.PointerReorder · Decision.TurnOrderTokens</p>
          <h2>Arrange the turn order deck</h2>
          <p class="ui-gallery-modal-hint">Reveal the token faces, then grab and slide them from left to right to set the deck order.</p>
          <TurnOrderTokenRow
            :items="galleryTurnOrderItems"
            :draggable-items="true"
            aria-label="Gallery turn order tokens"
            @reorder="reorderGalleryTurnOrder"
          />
          <div class="ui-gallery-turn-order-hidden">
            <TurnOrderToken label="Turn order card hidden" :hidden="true" />
            <span>Hidden turn order cards use the question-mark token.</span>
          </div>
          <div class="ui-gallery-modal-actions">
            <button class="btn" @click="galleryTurnOrderKeys = ['p1-0', 'nemesis-0', 'p2-0', 'p1-1', 'nemesis-1']">Reset</button>
            <button class="btn primary" @click="modal = null">Return Cards</button>
          </div>
        </template>
    </ModalBase>
  </main>
</template>

<style scoped>
.ui-gallery {
  height: var(--viewport-height);
  min-height: 0;
  max-height: var(--viewport-height);
  padding: 28px clamp(18px, 4vw, 64px) 60px;
  overflow-x: hidden;
  overflow-y: auto;
  background: radial-gradient(1100px 700px at 50% -10%, #202a43 0%, var(--bg) 68%);
}
.ui-gallery-header,
.ui-gallery-section-heading {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 20px;
}
.ui-gallery-header {
  max-width: 1440px;
  margin: 0 auto 28px;
}
.ui-gallery-header h1,
.ui-gallery-section h2,
.ui-gallery-item h3 {
  margin: 0;
}
.ui-gallery-header h1 { font-size: clamp(26px, 4vw, 42px); letter-spacing: .02em; }
.ui-gallery-intro { max-width: 620px; margin: 8px 0 0; color: var(--muted); line-height: 1.5; }
.ui-gallery-kicker,
.ui-gallery-index {
  margin: 0 0 6px;
  color: var(--accent);
  font-size: 11px;
  font-weight: 700;
  letter-spacing: .14em;
  text-transform: uppercase;
}
.ui-gallery-section {
  max-width: 1440px;
  margin: 0 auto 24px;
  padding: 20px;
  border: var(--pixel-border-width) solid var(--border);
  border-radius: 12px;
  background: rgba(27, 32, 48, .86);
}
.ui-gallery-section-heading { align-items: center; margin-bottom: 18px; }
.ui-gallery-note { color: var(--muted); font-size: 12px; text-align: right; }
.ui-gallery-grid { display: grid; gap: 14px; }
.ui-gallery-grid-cards { grid-template-columns: repeat(3, minmax(0, 1fr)); }
.ui-gallery-grid-zones { grid-template-columns: minmax(0, 2fr) repeat(3, minmax(150px, 1fr)); }
.ui-gallery-ability-choice-surface {
  display: flex;
  justify-content: center;
  padding: 12px;
  border: var(--pixel-border-width) dashed var(--border);
  border-radius: 8px;
  background: #151a29;
}
.gallery-mage-ability-choice {
  --mage-ability-mat-width: 320px;
  --mage-ability-choice-font-size: 13px;
  --mage-ability-choice-button-min-height: 58px;
}
.gallery-player-discard-surface { min-height: 120px; }
.gallery-discard-only-example { min-height: 0; margin-top: 14px; }
.ui-gallery-ability-choice-selection { min-height: 18px; margin: 8px 0 0; color: var(--muted); font-size: 12px; }
.ui-gallery-item {
  min-width: 0;
  padding: 14px;
  border: var(--pixel-border-width) solid rgba(47, 56, 80, .8);
  border-radius: 9px;
  background: rgba(18, 21, 29, .58);
}
.ui-gallery-item h3 { color: var(--text); font-size: 15px; }
.ui-gallery-caption { min-height: 32px; margin: 5px 0 12px; color: var(--muted); font-size: 12px; line-height: 1.35; }
.ui-gallery-surface {
  display: flex;
  min-height: 220px;
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding: 12px;
  border: var(--pixel-border-width) dashed var(--border);
  border-radius: 8px;
  background: #151a29;
}
.hand-surface { min-height: 270px; }
.mini-surface { min-height: 150px; }
.gallery-hand-card { width: 148px; height: auto; aspect-ratio: var(--card-aspect-ratio); padding: 0; }
.card.gallery-mini-card {
  width: 78px;
  min-width: 78px;
  height: auto;
  aspect-ratio: var(--card-aspect-ratio);
  padding: 0;
  border-color: transparent;
}
.gallery-hand-card img,
.gallery-mini-card img,
.gallery-pile-card img,
.gallery-face-down-card img,
.gallery-attached-supply > img,
.gallery-reveal-card img,
.gallery-modal-card img,
.gallery-modal-reveal-card img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
  border-radius: inherit;
}
.pile-surface { min-height: 270px; }
.gallery-pile-card {
  position: relative;
  width: var(--hand-card-width);
  height: var(--hand-card-height);
  overflow: hidden;
  border: var(--pixel-border-width) solid transparent;
  border-radius: var(--card-radius);
  background: transparent;
}
.gallery-pile-card-back img { object-fit: fill; }
.gallery-pile-count {
  position: absolute;
  top: 5px;
  left: 5px;
  min-width: 24px;
  padding: 2px 6px;
  border-radius: 999px;
  background: rgba(11, 16, 32, .84);
  color: #fff;
  font-size: 12px;
  font-weight: 700;
  text-align: center;
}
.face-down-surface { min-height: 270px; }
.gallery-face-down-card {
  width: var(--hand-card-width);
  height: var(--hand-card-height);
  overflow: hidden;
  border: var(--pixel-border-width) solid transparent;
  border-radius: var(--card-radius);
}
.attached-surface { min-height: 270px; }
.gallery-attached-supply {
  position: relative;
  width: 144px;
  height: auto;
  aspect-ratio: var(--card-aspect-ratio);
  overflow: hidden;
  border: var(--pixel-border-width) solid transparent;
  border-radius: var(--card-radius);
}
.reveal-surface { min-height: 270px; }
.gallery-reveal-card { width: 96px; height: auto; aspect-ratio: var(--card-aspect-ratio); overflow: hidden; border: 0; border-radius: var(--card-radius); }
.gallery-damage-allocation { display: flex; min-height: 174px; align-items: center; justify-content: center; gap: 18px; }
.gallery-damage-unit { position: relative; width: 74px; height: auto; aspect-ratio: var(--card-aspect-ratio); overflow: visible; border: 0; border-radius: var(--card-radius); }
.gallery-damage-unit > img { display: block; width: 100%; height: 100%; object-fit: cover; border-radius: inherit; }
.gallery-damage-unit .damage-allocation-badge { top: -10px; right: -10px; }
.gallery-prepped-choice-surface { display: flex; min-height: 180px; flex-direction: column; align-items: center; justify-content: center; gap: 10px; }
.gallery-prepped-choice-card { width: 62px; padding: 0; border: 2px solid transparent; border-radius: var(--card-radius); background: transparent; cursor: pointer; }
.gallery-prepped-choice-card .card-surface { width: 100%; min-width: 0; height: auto; aspect-ratio: var(--card-aspect-ratio); }
.gallery-life-choice-surface { min-height: 164px; }
.ui-gallery-state-row {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 12px;
  margin-top: 14px;
  padding: 12px;
  border: var(--pixel-border-width) dashed var(--border);
  border-radius: 8px;
}
.ui-gallery-state-label { margin-right: 4px; color: var(--muted); font-size: 12px; font-weight: 700; }
.gallery-state-card { position: relative; width: 74px; height: auto; aspect-ratio: var(--card-aspect-ratio); padding: 0; overflow: hidden; border-color: transparent; }
.gallery-state-card img { display: block; width: 100%; height: 100%; object-fit: cover; border-radius: inherit; }
.gallery-market-targets { display: flex; align-items: flex-start; justify-content: center; gap: 18px; padding: 8px 0; }
.gallery-market-target-item { display: flex; width: 74px; flex-direction: column; align-items: center; gap: 6px; color: var(--muted); font-size: 11px; font-weight: 700; }
.gallery-market-target-item .pile { width: 74px; }
.disabled-card { opacity: .56; cursor: not-allowed; }
.gallery-state-chip { position: absolute; right: 4px; bottom: 4px; left: 4px; padding: 3px 4px; border-radius: 4px; background: rgba(11, 16, 32, .86); color: #fff; font-size: 10px; text-align: center; }
.ui-gallery-zone-scroll { min-width: 0; overflow-x: auto; padding: 8px 2px; border: var(--pixel-border-width) dashed var(--border); border-radius: 8px; background: #151a29; }
.ui-gallery-zone-track { display: flex; width: max-content; min-width: 100%; align-items: center; justify-content: center; gap: 10px; }
.ui-gallery-zone-track .card-hover-wrap { flex: 0 0 auto; }
.ui-gallery-pile-demo { display: flex; min-height: 174px; align-items: center; justify-content: center; }
.gallery-underneath-item { grid-column: 1 / -1; }
.gallery-underneath-surface { min-height: 250px; }
.nemesis-play-card.gallery-underneath-minion { width: 132px; height: auto; aspect-ratio: var(--card-aspect-ratio); overflow: visible; }
.ui-gallery-empty-pile { display: grid; flex: 0 0 auto; width: var(--hand-card-width); height: var(--hand-card-height); box-sizing: border-box; place-items: center; border: var(--pixel-border-width) dashed var(--border); border-radius: var(--card-radius); color: var(--muted); font-size: 13px; font-weight: 700; letter-spacing: .06em; text-transform: uppercase; }
.ui-gallery-badge-demo { display: flex; min-height: 174px; flex-direction: column; align-items: center; justify-content: center; gap: 12px; }
.gallery-token-badge { padding: 5px 8px; border-radius: 4px; background: #11151f; color: #fff; font-size: 13px; font-weight: 700; }
.gallery-token-badge-gold { color: #f3cf35; }
.ui-gallery-modal-launchers { display: flex; flex-wrap: wrap; justify-content: center; gap: 12px; }
.ui-gallery-code-example { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 12px; padding: 14px; border: var(--pixel-border-width) dashed var(--border); border-radius: 8px; background: #151a29; }
.ui-gallery-code-example code { color: var(--accent); font-size: 12px; }
.ui-gallery-code-example span { color: var(--muted); font-size: 12px; }
.ui-gallery-modal-overlay { position: fixed; inset: 0; z-index: var(--z-pile-viewer); display: grid; place-items: center; overflow: auto; padding: 20px; background: var(--overlay-backdrop); }
.ui-gallery-modal { position: relative; width: min(900px, calc(100vw - 40px)); max-height: min(88vh, 720px); overflow: auto; padding: 26px; border: var(--pixel-border-width) solid var(--border); border-radius: 12px; background: var(--panel); text-align: center; }
.ui-gallery-modal:focus { outline: none; }
.ui-gallery-modal h2 { margin: 0 0 8px; }
.ui-gallery-modal-close { position: absolute; top: 8px; right: 10px; border: 0; background: transparent; color: var(--muted); cursor: pointer; font-size: 26px; line-height: 1; }
.ui-gallery-modal-hint { margin: 0 0 14px; color: var(--muted); }
.ui-gallery-modal-cards { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 12px; margin: 16px 0 20px; }
.gallery-modal-card { width: 100%; aspect-ratio: var(--card-aspect-ratio); overflow: hidden; border: 0; border-radius: var(--card-radius); }
.ui-gallery-modal-reveal { display: flex; justify-content: center; gap: 20px; margin: 16px 0 20px; }
.gallery-modal-reveal-card { width: 220px; height: auto; aspect-ratio: var(--card-aspect-ratio); overflow: hidden; border: 0; border-radius: var(--card-radius); }
.ui-gallery-modal-actions { display: flex; justify-content: center; gap: 10px; }
.ui-gallery-turn-order-hidden {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  margin: 4px auto 14px;
  color: var(--muted);
  font-size: 12px;
}
.ui-gallery-turn-order-hidden .turn-order-token-surface {
  width: 52px;
  height: 52px;
  margin: 0;
  font-size: 20px;
}
@media (max-width: 900px) {
  .ui-gallery-grid-cards { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .ui-gallery-grid-zones { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}
@media (max-width: 560px) {
  .ui-gallery { padding-inline: 10px; }
  .ui-gallery-header,
  .ui-gallery-section-heading { flex-direction: column; }
  .ui-gallery-note { text-align: left; }
  .ui-gallery-grid-cards,
  .ui-gallery-grid-zones { grid-template-columns: 1fr; }
  .ui-gallery-section { padding: 12px; }
  .ui-gallery-modal-cards { grid-template-columns: repeat(3, minmax(0, 1fr)); }
  .gallery-modal-reveal-card { width: min(42vw, 220px); height: auto; aspect-ratio: var(--card-aspect-ratio); }
}
</style>

<style>
/* Modal.Base renders this panel in its own component scope, so keep the
   Gallery fixture's shell selectors global while the rest stays scoped. */
.ui-gallery-modal-overlay { position: fixed; inset: 0; z-index: var(--z-pile-viewer); display: grid; place-items: center; overflow: auto; padding: 20px; background: var(--overlay-backdrop); }
.ui-gallery-modal { position: relative; width: min(900px, calc(100vw - 40px)); max-height: min(88vh, 720px); overflow: auto; padding: 26px; border: var(--pixel-border-width) solid var(--border); border-radius: 12px; background: var(--panel); text-align: center; }
.ui-gallery-modal:focus { outline: none; }
.ui-gallery-modal h2 { margin: 0 0 8px; }
.ui-gallery-modal-close { position: absolute; top: 8px; right: 10px; border: 0; background: transparent; color: var(--muted); cursor: pointer; font-size: 26px; line-height: 1; }
.ui-gallery-modal-hint { margin: 0 0 14px; color: var(--muted); }
.ui-gallery-modal-cards { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 12px; margin: 16px 0 20px; }
.ui-gallery-modal-actions { display: flex; justify-content: center; gap: 10px; }
.ui-gallery-modal-reveal { display: flex; justify-content: center; gap: 20px; margin: 16px 0 20px; }
@media (max-width: 560px) {
  .ui-gallery-modal-cards { grid-template-columns: repeat(3, minmax(0, 1fr)); }
  .gallery-modal-reveal-card { width: min(42vw, 220px); height: auto; aspect-ratio: var(--card-aspect-ratio); }
}
</style>
