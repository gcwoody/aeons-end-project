// ===== Card Types =====
export type CardType = 'gem' | 'relic' | 'spell' | 'attack' | 'minion' | 'power'

// ===== Typed Card Effects =====

export type EffectAmount =
  | number
  | {
      kind: 'per_open_breach'
      base: number
      amountPerBreach: number
    }

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
  | { kind: 'nemesis_card_drawn'; cardType: 'attack' | 'power' }

export type PlayerTargetScope = 'self' | 'ally' | 'any_player'
export type PlayerTargetRef = { kind: 'player'; playerId: string }
export type LifeTargetScope = PlayerTargetScope | 'nemesis' | 'gravehold'
export type DamageTargetScope = 'nemesis' | 'minion' | 'gravehold' | 'nemesis_or_minion'
export type CardSelectionSource = 'hand' | 'discard' | 'hand_or_discard' | 'played_gem_this_turn'
export type CardZone = 'deck' | 'hand' | 'discard' | 'played_this_turn'
export type CardGainDestination = 'discard_top' | 'deck_top'

export interface CardChoice {
  zone: CardZone
  index: number
  cardId: string
  cardName: string
}

export interface PreppedSpellChoice {
  playerId: string
  breachIndex: number
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
}

export interface DecisionOption {
  id: string
  label: string
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
    }
  | {
      kind: 'select_prepped_spell'
      candidates: PreppedSpellChoice[]
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
      kind: 'confirm_turn_order_reveal'
      cardId: string
    }
  | {
      kind: 'confirm_prepped_effect'
      cardId: string
      breachIndex: number
  }
)

export type PendingDecisionAnswer =
  | { kind: 'choose_one'; optionId: string }
  | { kind: 'choose_optional'; accepted: boolean }
  | { kind: 'select_cards'; choices: CardChoice[] }
  | { kind: 'select_prepped_spell'; choice: PreppedSpellChoice }
  | { kind: 'select_life_target'; target: LifeTargetRef }
  | { kind: 'select_player_target'; target: PlayerTargetRef }
  | { kind: 'select_damage_target'; target: DamageTargetRef }
  | { kind: 'reorder_turn_order'; order: number[] }
  | { kind: 'confirm_turn_order_reveal'; accepted: true }
  | { kind: 'confirm_prepped_effect'; accepted: true }

export interface BreachCostReduction {
  amount: number
  actions: Array<'focus' | 'open'>
}

export interface PlayerTurnEffects {
  nextBreachCostReductions: BreachCostReduction[]
  usedPreppedEffects: string[]
}

export interface CardEffectOption {
  id: string
  label: string
  effects: CardEffect[]
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
    }
  | { kind: 'gain_conditional_aether'; amount: number; condition: string }
  | { kind: 'deal_damage'; amount: EffectAmount; target: DamageTargetScope }
  | { kind: 'draw_cards'; amount: number; target?: PlayerTargetScope }
  /** The engine must clamp the resulting life to the target object's maxHp. */
  | { kind: 'gain_life'; amount: number; target: LifeTargetScope }
  | {
      kind: 'gain_card'
      cardId: string
      source: 'market' | 'specific'
      destination?: 'discard_top' | 'deck_top'
    }
  | { kind: 'move_gained_card'; destination: 'deck_top' }
  | { kind: 'discard_cards'; source: 'hand'; amount: number }
  | {
      kind: 'destroy_cards'
      source: 'self' | CardSelectionSource
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
  | {
      kind: 'cast_prepped_spell'
      source: 'any_prepped_spell' | 'selected_prepped_spell'
      discard: boolean
    }
  /** Internal marker used to finish one cast inside a larger effect sequence. */
  | { kind: 'resolve_spell_damage_bonus' }
  /** Internal pause used for mandatory effects on prepped cards. */
  | {
      kind: 'confirm_prepped_effect'
      prompt: string
      cardId: string
      breachIndex: number
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

export interface NemesisCard extends CardDef {
  type: 'attack' | 'minion' | 'power'
  tier: 1 | 2 | 3
  damage?: number
  lifeTokens?: number
  persistentEffect?: string
  powerTokens?: number
  powerEffect?: string
}

// ===== Breach =====
export type Direction = 'east' | 'south' | 'west' | 'north'

export interface BreachState {
  index: number
  opened: boolean
  prepSpell: string | null
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
  type: string
  hp: number
  maxHp: number
  deck: string[]
  discard: string[]
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
  decisionCounter: number
}
