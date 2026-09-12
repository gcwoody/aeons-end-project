// ===== Card Types =====
export type CardType = 'gem' | 'relic' | 'spell' | 'attack' | 'minion' | 'power' | 'strike'

// ===== Typed Card Effects =====

export type EffectAmount =
  | number
  | {
      kind: 'per_open_breach'
      base: number
      amountPerBreach: number
    }
  | {
      kind: 'per_nemesis_counter'
      counter: string
      base: number
      amountPerCounter: number
    }
  | {
      kind: 'per_prepped_spell'
      base: number
      amountPerSpell: number
    }
  | { kind: 'current_minion_life' }

export type EffectComparison = 'equals' | 'at_least'

export type CardEffectCondition =
  | {
      kind: 'card_play_count_this_turn'
      cardId: string
      comparison: EffectComparison
      count: number
    }
  | {
      kind: 'open_breach_count'
      comparison: EffectComparison
      count: number
    }
  | {
      kind: 'nemesis_turn_order_discard_count'
      comparison: EffectComparison
      count: number
    }
  | {
      /** True when the player still has a present breach that is not open. */
      kind: 'has_unopened_breach'
    }

export type CardEffectTrigger =
  | { kind: 'on_gain' }
  | { kind: 'on_play' }
  | { kind: 'on_cast' }
  | {
      kind: 'while_prepped'
      phase: 'casting_phase_end' | 'main_phase'
    }

export type AbilityTrigger =
  | { kind: 'main_phase'; scope: 'current_player' | 'any_player' }
  | { kind: 'casting_phase' }
  | { kind: 'ally_turn_end' }
  | { kind: 'nemesis_card_drawn'; cardType: 'attack' | 'power' | 'attack_or_power' }
  | { kind: 'nemesis_draw_phase' }
  | { kind: 'turn_order_card_drawn' }

export type PlayerTargetScope = 'self' | 'ally' | 'any_player'
export type PlayerSelectionRule =
  | 'most_prepped_spells'
  | 'lowest_hp'
  | 'most_charges'
  | 'most_opened_breaches'
export type PlayerTargetRef = { kind: 'player'; playerId: string }
export type LifeTargetScope = PlayerTargetScope | 'nemesis' | 'gravehold'
export type DamageTargetScope = 'nemesis' | 'minion' | 'source_minion' | 'gravehold' | 'nemesis_or_minion'
export type CardSelectionSource = 'hand' | 'discard' | 'hand_or_discard' | 'played_gem_this_turn'
export type CardSelectionLayout = 'simple' | 'pile'
export type CardZone = 'deck' | 'hand' | 'discard' | 'played_this_turn'
export type CardGainDestination = 'discard_top' | 'deck_top'

export interface CardChoice {
  zone: CardZone
  index: number
  cardId: string
  cardName: string
}

export interface CollectiveCardChoice {
  playerId: string
  choice: CardChoice
}

export interface PreppedSpellChoice {
  playerId: string
  breachIndex: number
  spellIndex: number
  cardId: string
  cardName: string
}

export interface TurnOrderCardChoice {
  index: number
  cardId: string
}

export type LifeTargetRef =
  | { kind: 'player'; playerId: string }
  | { kind: 'nemesis' }
  | { kind: 'gravehold' }

export type DamageTargetRef =
  | { kind: 'nemesis'; id: 'nemesis'; label: string }
  | { kind: 'gravehold'; id: 'gravehold'; label: string }
  | { kind: 'minion'; id: string; placedAt: number; cardId: string; label: string }

export interface PendingDecisionContext {
  sourceCardId?: string
  effectPath?: number[]
}

export interface PendingDecisionBase {
  id: string
  playerId: string
  prompt: string
  context?: PendingDecisionContext
}

/** Serializable continuation data used while an effect waits for a choice. */
export interface PendingEffectResolution {
  playerId: string
  sourceCardId?: string
  remainingEffects: CardEffect[]
  lastGainedCardId?: string
  awaiting?: CardEffect
  /** Bonus damage granted by the breach where a spell was cast. */
  spellDamageBonus?: number
  /** Whether the spell has an explicit damage instance to receive the bonus. */
  spellDamageEffectSeen?: boolean
  /** Phase that created a prepped-spell resolution, when applicable. */
  preppedPhase?: 'casting_phase_end' | 'main_phase'
  /** The player whose prepped spell is currently being resolved. */
  effectPlayerId?: string
  /** The prepped spell selected by an ability and reused by later effects. */
  selectedPreppedSpell?: PreppedSpellChoice
  /** Confirms a board click before a prepped-spell cast effect continues. */
  confirmedPreppedSpell?: PreppedSpellChoice
  /** Resume the Nemesis state machine when this effect frame finishes. */
  nemesisResume?: boolean
  /** Auxiliary Nemesis card already removed from its deck and awaiting reveal confirmation. */
  revealedStrikeCardId?: string
  /** Spell cast that remains on its breach until the cast effect sequence finishes. */
  pendingSpellCast?: PendingSpellCast
}

export interface PendingSpellCast {
  playerId: string
  breachIndex: number
  spellIndex: number
  cardId: string
  discard: boolean
}

/** A serializable continuation for a Power card's optional To Discard action. */
export interface PendingNemesisDiscard {
  playerId: string
  cardInstanceId: string
  costs: NemesisDiscardCost[]
  nextCostIndex: number
  selectedCards: CardChoice[]
  selectedPreppedSpells: PreppedSpellChoice[]
  selectedCardPayments: Array<{ costIndex: number; choices: CardChoice[] }>
  selectedPreppedSpellPayments: Array<{ costIndex: number; choices: PreppedSpellChoice[] }>
}

export interface DecisionOption {
  id: string
  label: string
  /** The option is shown for context but cannot be selected in the current state. */
  disabled?: boolean
}

export type PendingDecision = PendingDecisionBase & (
  | {
      kind: 'choose_one'
      options: DecisionOption[]
    }
  | {
      kind: 'choose_optional'
      accept: DecisionOption
      skip: DecisionOption
    }
  | {
      kind: 'select_cards'
      source: CardSelectionSource
      candidates: CardChoice[]
      min: number
      max: number
      layout?: CardSelectionLayout
    }
  | {
      kind: 'select_prepped_spell'
      candidates: PreppedSpellChoice[]
    }
  | {
      kind: 'select_prepped_spells'
      candidates: PreppedSpellChoice[]
      min: number
      max: number
      /** Choices that are required but remain on the board until confirmation. */
      requiredChoices?: PreppedSpellChoice[]
    }
  | {
      kind: 'select_collective_cards'
      candidates: CollectiveCardChoice[]
      min: number
      max: number
    }
  | {
      kind: 'select_life_target'
      targets: LifeTargetRef[]
    }
  | {
      kind: 'select_player_target'
      targets: PlayerTargetRef[]
    }
  | {
      kind: 'select_damage_target'
      targets: DamageTargetRef[]
    }
  | {
      kind: 'reorder_turn_order'
      cards: TurnOrderCardChoice[]
    }
  | {
      kind: 'select_turn_order_card'
      cards: TurnOrderCardChoice[]
    }
  | {
      kind: 'confirm_turn_order_reveal'
      cardId: string
    }
  | {
      kind: 'confirm_nemesis_draw'
      cardId: string
      source?: 'nemesis_deck' | 'specific_deck'
    }
  | {
      kind: 'confirm_nemesis_effect'
      cardId: string
      instanceId: string
      trigger: NemesisEffectTrigger
    }
  | {
      kind: 'choose_turn_order_position'
      cardId: string
    }
  | {
      kind: 'confirm_prepped_effect'
      cardId: string
      breachIndex: number
      spellIndex?: number
    }
)

export type PendingDecisionAnswer =
  | { kind: 'choose_one'; optionId: string }
  | { kind: 'choose_optional'; accepted: boolean }
  | { kind: 'select_cards'; choices: CardChoice[] }
  | { kind: 'select_prepped_spell'; choice: PreppedSpellChoice }
  | { kind: 'select_prepped_spells'; choices: PreppedSpellChoice[] }
  | { kind: 'select_collective_cards'; choices: CollectiveCardChoice[] }
  | { kind: 'select_life_target'; target: LifeTargetRef }
  | { kind: 'select_player_target'; target: PlayerTargetRef }
  | { kind: 'select_damage_target'; target: DamageTargetRef }
  | { kind: 'reorder_turn_order'; order: number[] }
  | { kind: 'select_turn_order_card'; choice: TurnOrderCardChoice }
  | { kind: 'confirm_turn_order_reveal'; accepted: true }
  | { kind: 'confirm_nemesis_draw'; accepted: true }
  | { kind: 'confirm_nemesis_effect'; accepted: true }
  | { kind: 'choose_turn_order_position'; position: 'top' | 'bottom' }
  | { kind: 'confirm_prepped_effect'; accepted: true }

export interface BreachCostReduction {
  amount: number
  actions: Array<'focus' | 'open'>
}

export interface PlayerTurnEffects {
  nextBreachCostReductions: BreachCostReduction[]
  usedPreppedEffects: string[]
  prepSpellLimit: number
}

export interface CardEffectOption {
  id: string
  label: string
  effects: CardEffect[]
  /** Optional dynamic rule used to determine whether this choice is available. */
  condition?: CardEffectCondition
}

/** A small, serializable vocabulary for reusable card rules. */
export type CardEffect =
  | { kind: 'gain_aether'; amount: number }
  | { kind: 'gain_charge'; amount: number; target: 'self' | 'allies_collectively' }
  | { kind: 'review_turn_order_deck' }
  | {
      kind: 'reveal_turn_order_card'
      playerEffects: CardEffect[]
      nemesisEffects: CardEffect[]
      returnChoice?: boolean
    }
  | { kind: 'gain_conditional_aether'; amount: number; condition: string }
  | { kind: 'deal_damage'; amount: EffectAmount; target: DamageTargetScope }
  | {
      kind: 'deal_player_damage'
      amount: EffectAmount
      target: PlayerTargetScope
      selection?: PlayerSelectionRule
    }
  | {
      kind: 'draw_cards'
      amount: number
      target?: PlayerTargetScope
      selection?: PlayerSelectionRule
    }
  /** The engine must clamp the resulting life to the target object's maxHp. */
  | { kind: 'gain_life'; amount: number; target: LifeTargetScope }
  | {
      kind: 'gain_card'
      cardId: string
      source: 'market' | 'specific'
      destination?: 'discard_top' | 'deck_top'
    }
  | { kind: 'move_gained_card'; destination: 'deck_top' }
  | {
      kind: 'discard_cards'
      source: 'hand'
      amount: number
      target?: PlayerTargetScope
      selection?: PlayerSelectionRule
    }
  | {
      kind: 'discard_prepped_spells'
      amount: number
      minCost?: number
      target?: PlayerTargetScope
      selection?: PlayerSelectionRule
      mostExpensive?: boolean
    }
  | { kind: 'shuffle_discard_into_deck'; target?: PlayerTargetScope }
  | { kind: 'destroy_top_cards'; amount: number; target?: PlayerTargetScope }
  | { kind: 'discard_cards_collectively'; amount: EffectAmount; source: 'hand' }
  | {
      kind: 'deal_gravehold_damage_with_gem_discard'
      amount: number
      maxGems: number
      reductionPerGem: number
    }
  | { kind: 'lose_all_charge'; target: PlayerTargetScope }
  | { kind: 'return_last_discarded_minion' }
  | { kind: 'shuffle_nemesis_turn_order_cards' }
  | {
      kind: 'destroy_cards'
      source: 'self' | CardSelectionSource
      minAmount?: number
      maxAmount?: number
    }
  | {
      kind: 'choose_one'
      prompt: string
      options: CardEffectOption[]
    }
  | {
      kind: 'choose_optional'
      prompt: string
      effects: CardEffect[]
    }
  | {
      kind: 'modify_next_breach_cost'
      amount: number
      actions: Array<'focus' | 'open'>
    }
  | {
      kind: 'return_card_to_hand'
      source: 'played_gem_this_turn'
    }
  | { kind: 'return_cards_to_hand'; source: 'discard'; amount: number }
  | { kind: 'set_prep_limit'; amount: number }
  | { kind: 'place_revealed_turn_order_card' }
  | {
      kind: 'cast_prepped_spell'
      source: 'any_prepped_spell' | 'selected_prepped_spell'
      discard: boolean
    }
  /** Shuffle a selected player turn-order card back into the deck and damage its owner. */
  | { kind: 'shuffle_turn_order_card'; damage: number }
  /** Internal effect used when a triggered Ability asks whether to activate. */
  | { kind: 'activate_ability'; mageId: string }
  /** Prevent player and Gravehold damage until the current turn ends. */
  | { kind: 'prevent_damage_this_turn' }
  /** Internal marker used to finish one cast inside a larger effect sequence. */
  | { kind: 'resolve_spell_damage_bonus' }
  /** Internal marker used to move a cast spell to its discard pile after resolution. */
  | { kind: 'finalize_spell_cast' }
  /** Increase the active Nemesis' configured Unleash counter/effects. */
  | { kind: 'unleash'; amount?: number }
  /** Generic Nemesis counter operations used by reusable Nemesis effects. */
  | { kind: 'gain_nemesis_counter'; counter: string; amount: number }
  | { kind: 'lose_nemesis_counter'; counter: string; amount: number }
  /** Draw and resolve one card from the Nemesis' auxiliary Strike deck. */
  | { kind: 'resolve_strike'; count?: number }
  | { kind: 'return_strike_card'; cardId: string }
  /** Cancel the currently revealed Attack/Power before it resolves. */
  | { kind: 'discard_current_nemesis_card' }
  /** Internal pause used for mandatory effects on prepped cards. */
  | {
      kind: 'confirm_prepped_effect'
      prompt: string
      cardId: string
      breachIndex: number
      spellIndex: number
      effects: CardEffect[]
    }

export interface CardEffectBlock {
  trigger: CardEffectTrigger
  effects: CardEffect[]
  condition?: CardEffectCondition
  oncePerTurn?: boolean
  /** Pause for player confirmation before resolving a mandatory prepped effect. */
  requiresConfirmation?: boolean
}

export interface CardDef {
  id: string
  name: string
  type: CardType
  cost: number
  set: string
  effects?: CardEffectBlock[]
}

export interface GemCard extends CardDef {
  type: 'gem'
}

export interface RelicCard extends CardDef {
  type: 'relic'
}

export interface SpellCard extends CardDef {
  type: 'spell'
}

export type NemesisCardType = 'attack' | 'minion' | 'power'

export interface NemesisCardDef extends CardDef {
  type: NemesisCardType
  tier: 1 | 2 | 3
  life?: number
  power?: number
  nemesisEffects?: NemesisEffectBlock[]
  toDiscard?: NemesisToDiscard
  /** Optional passive rule applied to each damage instance dealt to this Minion. */
  damagePerInstance?: number
}

export type NemesisDiscardCost =
  | { kind: 'spend_aether'; amount: number }
  | { kind: 'lose_charge'; amount: number }
  | {
      kind: 'destroy_cards'
      source: 'hand' | 'discard' | 'hand_or_discard'
      amount: number
      minCost?: number
    }
  | { kind: 'discard_cards'; source: 'hand'; amount: number }
  | { kind: 'destroy_prepped_spells'; amount: number; minCost?: number }

export interface NemesisToDiscard {
  costs: NemesisDiscardCost[]
}

/** @deprecated Use NemesisCardDef in new code. */
export type NemesisCard = NemesisCardDef

export interface StrikeCardDef extends CardDef {
  type: 'strike'
  set: 'rageborne'
}

export type NemesisEffectTrigger = 'immediately' | 'persistent' | 'power_resolved'

export interface NemesisEffectBlock {
  trigger: NemesisEffectTrigger
  effects: CardEffect[]
  condition?: CardEffectCondition
}

export type NemesisDifficulty = 'standard' | 'increased'

export interface NemesisDef {
  type: string
  name: string
  hp: number
  difficultyLevel: number
  uniqueCardIdsByTier: Record<1 | 2 | 3, string[]>
  basicCardsPerTier: Record<1 | 2 | 3, number>
  strikeCardIds: string[]
  startingCounters: Record<string, number>
  standardRules: Record<string, number>
  increasedDifficultyRules: Record<string, number>
  /** Typed effect sequence executed whenever this Nemesis unleashes. */
  unleashEffects?: CardEffect[]
}

// ===== Breach =====
export type Direction = 'east' | 'south' | 'west' | 'north'

export interface BreachState {
  index: number
  /** Whether this breach exists for the Mage. Older saves omit this and mean true. */
  present?: boolean
  opened: boolean
  prepSpells: string[]
  focusDirection: Direction
  focusCost: number
  focusCount: number
  focusToOpen: number
  openCost: Record<Direction, number>
  focusedThisTurn: boolean
  damageBonus: number
}

// ===== Nemesis Cards In Play =====
export interface NemesisCardInPlay {
  cardId: string
  cardType: 'minion' | 'power'
  placedAt: number
  instanceId?: string
  enteredOnNemesisTurn?: number
  lifeTokens?: number
  powerTokens?: number
}

export interface UnleashEffect {
  description: string
}

// ===== Game State =====
export interface PlayerState {
  id: string
  mageType: string
  hp: number
  maxHp: number
  deck: string[]
  hand: string[]
  discard: string[]
  playedThisTurn: string[]
  /** Number of times each card has been played this turn, including cards returned to hand. */
  cardPlayCountsThisTurn: Record<string, number>
  /** Conditional Aether earned this turn, keyed by its spending condition. */
  conditionalAetherEarned: Record<string, number>
  regularAetherSpent: number
  condAetherSpent: Record<string, number>
  bonusAether: number
  breaches: BreachState[]
  charge: number
  chargeThreshold: number
  exhausted: boolean
  /** Cards permanently removed from this player's deck cycle. */
  destroyedCards: string[]
  /** Temporary effects and once-per-turn markers, reset during draw phase. */
  turnEffects: PlayerTurnEffects
}

export interface GraveholdState {
  hp: number
  maxHp: number
}

export interface NemesisState {
  definitionId: string
  name: string
  type: string
  hp: number
  maxHp: number
  difficultyLevel: number
  difficulty: NemesisDifficulty
  deck: string[]
  discard: string[]
  strikeDeck: string[]
  strikeDiscard: string[]
  counters: Record<string, number>
  /** Number of Nemesis turns that have started for this game. */
  nemesisTurnNumber?: number
  /** Monotonic ID source for cards entering the Nemesis play area. */
  cardInstanceCounter?: number
  playArea: NemesisCardInPlay[]
  tierAnnounced: boolean[]
}

export interface MarketPile {
  cardId: string
  remaining: number
}

export interface MarketState {
  piles: MarketPile[]
}

export type PlayerPhase = 'casting' | 'main' | 'draw'
export type NemesisPhase = 'nemesis_main' | 'nemesis_draw'
export type Phase = PlayerPhase | NemesisPhase

export type NemesisResolutionStep = 'main' | 'draw' | 'complete'

/** Serializable progress for one Nemesis turn. */
export interface NemesisResolutionState {
  step: NemesisResolutionStep
  mainQueue: string[]
  mainIndex: number
  activeCardInstanceId?: string
  activeCardId?: string
  activeTrigger?: NemesisEffectTrigger
  drawnCardId?: string
  drawnCardProcessed?: boolean
  /** The UI has shown the drawn Nemesis card and the player confirmed it. */
  drawnCardRevealed?: boolean
  drawnCardResponseHandled?: boolean
  drawnCardCancelled?: boolean
  /** Player who owns the Nemesis response controls when a decision is needed. */
  controllerPlayerId?: string
  /** The current Main Phase card has been visibly confirmed by the player. */
  mainEffectConfirmed?: boolean
}

export interface GameState {
  players: PlayerState[]
  nemesis: NemesisState
  gravehold: GraveholdState
  market: MarketState
  turnOrderDeck: string[]
  turnOrderDiscard: string[]
  currentTurn: string
  currentPhase: Phase
  round: number
  gameOver: boolean
  winner: string | null
  timestamp: number
  pendingDecision: PendingDecision | null
  pendingEffect: PendingEffectResolution | null
  pendingNemesisDiscard?: PendingNemesisDiscard | null
  nemesisResolution?: NemesisResolutionState | null
  decisionCounter: number
  /** Phaedraxa-style protection active for the current turn. */
  damagePrevention: boolean
}
