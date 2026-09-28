// ===== Card Types =====
export type CardType = 'gem' | 'relic' | 'spell' | 'treasure' | 'mage_form' | 'breach_upgrade' | 'attack' | 'minion' | 'power' | 'strike'
export type CardMechanic = 'pulse_token' | 'recall' | 'develop' | 'trinket'

export type TreasureLevel = 1 | 2 | 3

/** Stable identifier for a player in the saved game state. */
export type PlayerId = string
export type TurnOrderActorId = PlayerId | 'nemesis'

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
  | {
      kind: 'per_adjacent_prepped_spell'
      base: number
      amountPerSpell: number
    }
  | {
      kind: 'per_empty_market_pile'
      base: number
      amountPerPile: number
    }
  | {
      /** Cost of the card selected by the immediately preceding card-selection effect. */
      kind: 'last_selection_cost'
    }
  | { kind: 'current_minion_life' }

export type EffectComparison = 'equals' | 'at_least'

export type CardEffectCondition =
  | { kind: 'all_of'; conditions: CardEffectCondition[] }
  | { kind: 'has_pulse_tokens'; amount: number; player?: 'source' | 'active' }
  | { kind: 'has_prepped_spell'; ownerScope?: 'any_player' | 'ally' }
  | {
      /** Number of matching copies currently in the shared Develop zone. */
      kind: 'develop_zone_card_count'
      cardId: string | 'source'
      comparison: EffectComparison
      count: number
    }
  | { kind: 'player_relation_to_source'; relation: 'same' | 'ally' }
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
      kind: 'prepped_spell_count'
      comparison: EffectComparison
      count: number
    }
  | { kind: 'has_player_turn_order_card' }
  | {
      kind: 'nemesis_turn_order_discard_count'
      comparison: EffectComparison
      count: number
    }
  | {
      /** True when the player still has a present breach that is not open. */
      kind: 'has_unopened_breach'
    }
  | { kind: 'all_breaches_opened' }
  | { kind: 'mage_form_is'; form: 'giver' | 'taker'; player?: 'source' | 'active' }
  | { kind: 'has_charge'; amount: number }
  | { kind: 'has_knowledge'; amount: number; player?: 'source' | 'active' }
  | { kind: 'has_doom'; amount: number }
  | { kind: 'has_aether'; amount: number }
  | { kind: 'has_card_in_zone'; zone: CardZone; cardType?: CardType }
  | { kind: 'has_affordable_card_in_specific_deck'; cardType: CardType; payment: 'knowledge'; player?: 'source' | 'active' }
  | { kind: 'has_installed_breach_upgrade'; breachIndex: number }
  | { kind: 'has_card_in_hand'; cardType: 'gem' | 'relic' | 'spell' }
  | { kind: 'has_eligible_card_in_zone'; zone: CardZone | 'hand_or_discard'; cardTypes: CardType[]; minimumCost?: number; treasureLevel?: TreasureLevel; target?: PlayerTargetScope | 'source' }
  | { kind: 'has_opened_breach'; target: PlayerTargetScope; breachIndices?: number[] }
  | { kind: 'has_ally_prepped_spell' }
  | { kind: 'spells_cast_this_turn'; comparison: EffectComparison; count: number }
  | {
      kind: 'hand_card_count'
      cardTypes: Array<'gem' | 'relic' | 'spell'>
      minCost: number
      comparison: EffectComparison
      count: number
    }
  | { kind: 'set_supply_pile_empty'; cardId: string }
  /** True when the immediately preceding card-selection effect selected at least one card. */
  | { kind: 'last_selection_nonempty' }
  /** True when the immediately preceding optional choice was accepted. */
  | { kind: 'last_optional_accepted' }

/** A conditional amount added to one existing damage instance. */
export interface AdditionalDamage {
  amount: EffectAmount
  condition?: CardEffectCondition
}

export type CardEffectTrigger =
  | { kind: 'on_gain' }
  | { kind: 'on_gain_from_supply_pile' }
  | { kind: 'on_play' }
  | { kind: 'on_cast' }
  | { kind: 'on_develop' }
  | { kind: 'recall' }
  | { kind: 'on_put_into_play' }
  | { kind: 'on_breach_open' }
  | { kind: 'on_breach_upgrade_installed' }
  | { kind: 'on_ability_resolved' }
  | { kind: 'while_set_next_to_supply' }
  | {
      kind: 'while_prepped'
      phase: 'casting_phase_end' | 'main_phase'
    }
  | {
      kind: 'while_in_play'
      phase: 'main_phase' | 'casting_phase_end' | 'end_turn_before_draw'
    }

export type AbilityTrigger =
  | { kind: 'main_phase'; scope: 'current_player' | 'any_player' }
  | { kind: 'casting_phase' }
  | { kind: 'ally_turn_end' }
  | { kind: 'nemesis_card_drawn'; cardType: 'attack' | 'power' | 'attack_or_power' }
  | { kind: 'nemesis_draw_phase' }
  | { kind: 'turn_order_card_drawn' }

export type PlayerTargetScope = 'self' | 'ally' | 'any_player'
export type DamagePlayerTargetScope = PlayerTargetScope | 'doom_owner'
export type PlayerSelectionRule =
  | 'most_prepped_spells'
  | 'lowest_hp'
  | 'most_charges'
  | 'most_opened_breaches'
export type PlayerTargetRef = { kind: 'player'; playerId: PlayerId }
export type LifeTargetScope = PlayerTargetScope | 'nemesis' | 'gravehold'
export type DamageTargetScope = 'nemesis' | 'minion' | 'source_minion' | 'gravehold' | 'nemesis_or_minion'
export type CardSelectionSource = 'hand' | 'discard' | 'hand_or_discard' | 'deck_or_discard' | 'played_gem_this_turn' | 'swap_zone' | 'specific_deck' | 'player_cards_in_play'
export type CardSelectionLayout = 'simple' | 'pile'
export type CardZone = 'deck' | 'hand' | 'discard' | 'played_this_turn' | 'swap_zone' | 'specific_deck' | 'player_cards_in_play'
export type CardGainDestination = 'discard_top' | 'deck_top'

export interface CardChoice {
  zone: CardZone
  index: number
  cardId: string
  cardName: string
  /** The card remains visible in a selection panel but cannot currently be chosen. */
  disabled?: boolean
  disabledReason?: string
}

export interface CollectiveCardChoice {
  playerId: PlayerId
  choice: CardChoice
}

export interface PreppedSpellChoice {
  playerId: PlayerId
  breachIndex: number
  spellIndex: number
  cardId: string
  cardName: string
}

export interface BreachChoice {
  playerId: PlayerId
  breachIndex: number
  playerName: string
  focusCost: number
  focusCount: number
  focusToOpen: number
}

export interface TurnOrderCardChoice {
  index: number
  cardId: string
}

/** A supply pile selected by a market-facing Nemesis effect. */
export interface MarketPileChoice {
  pileIndex: number
  cardId: string
  cardName: string
  remaining: number
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
  /** Global decision state; submission authority is outside the rule engine. */
  id: string
  prompt: string
  context?: PendingDecisionContext
  /** Optional card artwork to show while resolving a card-specific decision. */
  cardPreview?: { cardId: string; mageType: string; formSide?: 'giver' | 'taker' }
}

/** Serializable continuation data used while an effect waits for a choice. */
export interface PendingEffectResolution {
  /** Mage whose card/effect created this resolution. Nemesis effects may omit it. */
  sourcePlayerId?: PlayerId
  sourceCardId?: string
  remainingEffects: CardEffect[]
  lastGainedCardId?: string
  awaiting?: CardEffect
  /** Bonus damage granted by the breach where a spell was cast. */
  spellDamageBonus?: number
  /** One-time "additional damage" bonus granted by an effect such as Blasting Staff. */
  spellAdditionalDamageBonus?: number
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
  /** Number/cost of cards selected by the previous optional card effect. */
  lastSelectedCardCount?: number
  lastSelectedCardCost?: number
  /** Number of Doom lost by the most recent lose_doom effect. */
  lastDoomLost?: number
  /** Result of the most recent optional choice in this effect frame. */
  lastOptionalAccepted?: boolean
  /** Players still waiting to reveal a top deck card for a reveal effect. */
  revealTopPlayerIds?: PlayerId[]
  revealedTopCard?: { playerId: PlayerId; cardId: string }
  /** Hand card selected for a play-card-from-hand effect. */
  selectedCardId?: string
  /** Card revealed by Conjure while waiting for a Breach choice. */
  conjuredCard?: { playerId: PlayerId; cardId: string }
  /** Ability owner whose resolution should fire on_ability_resolved hooks. */
  afterAbilityPlayerId?: PlayerId
  /** Remaining players for a Time Cortex all-player Breach focus. */
  focusAllPlayerIds?: PlayerId[]
  /** Cards temporarily revealed from a Mage-specific deck while placement choices resolve. */
  specificDeckReveal?: {
    playerId: PlayerId
    cards: string[]
    mode: 'put_one_into_play' | 'return_each'
    /** Original reveal slot for each remaining revealed card, preserving UI positions. */
    cardSlots?: number[]
    nextIndex?: number
    topCards?: string[]
    bottomCards?: string[]
  }
  /** Inco's ability resolves each player's revealed Firethorn choices in turn. */
  firethornPlayerIds?: PlayerId[]
  firethornPlayerIndex?: number
  firethornCurrentPlayerId?: PlayerId
}

export interface PendingSpellCast {
  playerId: PlayerId
  /** Mage whose action initiated the cast when different from the spell owner. */
  casterPlayerId?: PlayerId
  breachIndex: number
  spellIndex: number
  cardId: string
  discard: boolean
  /** Transfer Breach casts must be placed into an ally's hand after resolving. */
  transferToAlly?: boolean
  /** Qu's Taker effect returns the cast spell to the Mage's hand. */
  returnToCasterHand?: boolean
  destinationPlayerId?: PlayerId
  /** A face-down Conjure spell uses the synthetic 2-damage Cast effect. */
  faceDown?: boolean
}

/** A serializable continuation for a Power card's optional To Discard action. */
export interface PendingNemesisDiscard {
  playerId: PlayerId
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
  /** Card shown as the visual choice for card-selection style decisions. */
  cardId?: string
  /** The option is shown for context but cannot be selected in the current state. */
  disabled?: boolean
}

export type SpecificDeckPlacement = 'top' | 'bottom'

export type PendingDecision = PendingDecisionBase & (
  | {
      kind: 'choose_one'
      options: DecisionOption[]
      /** Optional presentation hint for choices with long text. */
      layout?: 'stacked-panels' | 'mage-ability' | 'large-card-selection' | 'large-card-choice'
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
      /** Owner of a source-specific deck when it differs from the active effect player. */
      ownerId?: PlayerId
    }
  | {
      /** Revealed Mage-specific cards awaiting an individual top/bottom placement. */
      kind: 'place_specific_deck_card'
      cards: Array<{ cardId: string; cardName: string; slot: number }>
    }
  | {
      kind: 'select_prepped_spell'
      candidates: PreppedSpellChoice[]
      /** Allows an effect such as Runic Flute to stop after any cast. */
      allowSkip?: boolean
    }
  | { kind: 'select_breach'; candidates: BreachChoice[] }
  | { kind: 'select_conjure_breach'; cardId: string; candidates: BreachChoice[] }
  | { kind: 'select_exhaust_breach'; candidates: BreachChoice[] }
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
      kind: 'select_market_pile'
      candidates: MarketPileChoice[]
    }
  | {
      /** A Nemesis setup rule requires choosing a supply pile before turn one. */
      kind: 'select_setup_devour_pile'
      candidates: MarketPileChoice[]
      remainingChoices: number
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
  | { kind: 'place_specific_deck_card'; cardId: string; placement: SpecificDeckPlacement }
  | { kind: 'select_prepped_spell'; choice: PreppedSpellChoice | null }
  | { kind: 'select_breach'; choice: BreachChoice }
  | { kind: 'select_conjure_breach'; choice: BreachChoice | null }
  | { kind: 'select_exhaust_breach'; choice: BreachChoice }
  | { kind: 'select_prepped_spells'; choices: PreppedSpellChoice[] }
  | { kind: 'select_collective_cards'; choices: CollectiveCardChoice[] }
  | { kind: 'select_life_target'; target: LifeTargetRef }
  | { kind: 'select_player_target'; target: PlayerTargetRef }
  | { kind: 'select_damage_target'; target: DamageTargetRef }
  | { kind: 'select_market_pile'; choice: MarketPileChoice }
  | { kind: 'select_setup_devour_pile'; choice: MarketPileChoice }
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
  /** Main-phase action markers for Mage-specific cards already in play. */
  usedPlayerCardEffects?: string[]
  /** Number of copies of each Recall block already activated this turn. */
  usedRecallEffects?: Record<string, number>
  prepSpellLimit: number | 'unlimited'
  /** Per-Breach overrides for effects that change spell capacity selectively. */
  prepSpellLimitByBreach?: Record<number, number | 'unlimited'>
  /** Breach upgrade triggers already used during this active player's turn. */
  usedBreachUpgradeEffects?: string[]
}

export interface CardEffectOption {
  id: string
  label: string
  effects: CardEffect[]
  /** Card shown when this option is presented as a visual card choice. */
  cardId?: string
  /** Optional dynamic rule used to determine whether this choice is available. */
  condition?: CardEffectCondition
}

/** A small, serializable vocabulary for reusable card rules. */
export type CardEffect =
  | { kind: 'gain_pulse_token'; amount?: number; target?: PlayerTargetScope }
  | { kind: 'lose_pulse_token'; amount: number; target?: PlayerTargetScope }
  | { kind: 'gain_knowledge'; amount: number; target?: 'self' | 'breach_owner' }
  | { kind: 'lose_knowledge'; amount: number }
  | { kind: 'gain_doom'; amount: number }
  | { kind: 'lose_doom'; amount: number | 'all' }
  | { kind: 'repeat_effect'; count: 'last_doom_lost'; effects: CardEffect[] }
  | { kind: 'deal_damage_to_each_enemy'; amount: number }
  | { kind: 'install_breach_upgrade'; breachIndex: number; cardType: 'breach_upgrade'; player?: 'source' | 'active' }
  | { kind: 'select_breach_upgrade_card'; breachIndex: number; ownerId: PlayerId }
  /** Internal continuation after the player selects a Breach Upgrade card. */
  | { kind: 'install_breach_upgrade_card'; cardId: string; breachIndex: number; ownerId: PlayerId }
  | { kind: 'increase_breach_prep_limit'; amount: number; breachIndex: number }
  | { kind: 'increase_breach_damage_bonus'; amount: number; breachIndex: number }
  | { kind: 'gain_aether'; amount: number }
  | { kind: 'gain_aether_token'; amount?: number; target?: PlayerTargetScope }
  | {
      /** Draw Trinkets from the shared deck into a player's discard or deck. */
      kind: 'gain_trinkets'
      amount: number
      target?: PlayerTargetScope
      destination?: CardGainDestination
      /** Put one card from this effect's gains into the recipient's hand. */
      putOneInHand?: boolean
    }
  /** Internal continuation that moves a gained Trinket to hand. */
  | { kind: 'move_gained_trinket_to_hand'; cardId: string; source: 'discard' | 'deck' }
  /** Return the currently played Trinket to the shared deck's known bottom. */
  | { kind: 'return_trinket_to_deck' }
  | { kind: 'conjure'; breachEligibility?: 'standard' | 'any_present' }
  | { kind: 'spend_aether'; amount: number }
  | {
      kind: 'gain_charge'
      amount: number
      target: 'self' | 'ally' | 'allies_collectively' | 'breach_owner'
      /** Continue the following effects from the selected ally's perspective. */
      continueAsTarget?: boolean
    }
  | { kind: 'flip_mage_form'; target?: 'source' | 'active' }
  | {
      /** Internal continuation for an optional Mage Form supply-gain effect. */
      kind: 'resolve_mage_form_supply_gain'
      formSide: 'giver' | 'taker'
      step: 'offer' | 'choose_ally' | 'apply'
      formCardId?: string
      formOwnerId?: PlayerId
      gainingPlayerId?: PlayerId
      gainedCardId?: string
      destination?: CardGainDestination
    }
  | { kind: 'reveal_turn_order_deck' }
  | {
      kind: 'reveal_turn_order_card'
      playerEffects: CardEffect[]
      nemesisEffects: CardEffect[]
      returnChoice?: boolean
    }
  | { kind: 'gain_conditional_aether'; amount: number; condition: string; target?: 'source' }
  | {
      kind: 'deal_damage'
      amount: EffectAmount
      target: DamageTargetScope
      /** Bonuses described as "additional damage" share this effect's target and instance. */
      additionalDamage?: AdditionalDamage[]
    }
  | {
      kind: 'deal_player_damage'
      amount: EffectAmount
      target: DamagePlayerTargetScope
      selection?: PlayerSelectionRule
    }
  | {
      kind: 'draw_cards'
      amount: number
      target?: PlayerTargetScope
      selection?: PlayerSelectionRule
      /** Resolve self/ally relative to the Mage who initiated the current spell cast. */
      relativeToSpellCaster?: boolean
      /** Resolve self/ally relative to the Mage who began this effect sequence. */
      relativeToSource?: boolean
    }
  | { kind: 'reveal_firethorns'; playerCount?: number }
  | { kind: 'gain_specific_deck_top'; target?: PlayerTargetScope; destination?: CardGainDestination }
  | { kind: 'gain_firethorn_top_for_five' }
  | { kind: 'move_specific_deck_top_to_bottom' }
  | { kind: 'cycle_specific_deck_with_in_play_treasure' }
  | { kind: 'reset_open_breach'; target: 'ally'; breachIndices: number[] }
  | { kind: 'reduce_card_type_cost'; cardTypes: CardType[]; amount: number }
  /** The engine must clamp the resulting life to the target object's maxHp. */
  | { kind: 'gain_life'; amount: number; target: LifeTargetScope }
  | {
      kind: 'gain_card'
      cardId: string
      source: 'market' | 'specific'
      destination?: 'discard_top' | 'deck_top'
    }
  /** Exchange the current card for a named card from the active Mage's Swap zone. */
  | { kind: 'swap_for'; cardId: string }
  /** Move selected cards from a player zone into that player's Swap zone. */
  | {
      kind: 'move_cards_to_swap_zone'
      source: 'hand_or_discard'
      minAmount: number
      maxAmount: number
      nameIncludes: string[]
    }
  /** Gain a matching card from the active Mage's Swap zone onto their discard pile. */
  | { kind: 'gain_card_from_swap_zone'; nameIncludes: string[] }
  /** Reveal and resolve the top cards of the active Mage's specific deck. */
  | { kind: 'reveal_specific_deck'; mode: 'put_one_into_play' | 'return_each' }
  /** Move cards from one supply pile to the active Nemesis' specific pile. */
  | {
      kind: 'devour_market_cards'
      amount: EffectAmount
      pile: 'least_expensive' | 'second_most_expensive' | 'most_expensive' | 'choose'
      cardType?: 'gem' | 'relic' | 'spell'
    }
  /** Set the source Minion's life based on exhausted supply piles. */
  | { kind: 'set_source_minion_life'; base: number; amountPerEmptyMarketPile: number }
  | { kind: 'move_gained_card'; destination: 'deck_top' | 'hand' }
  | {
      kind: 'gain_card_from_market'
      maxCost?: number
      destination?: CardGainDestination
      bonusOverLastSelection?: number
    }
  | {
      kind: 'set_next_to_supply_pile'
      cardType?: 'gem' | 'relic' | 'spell'
      cardTypes?: Array<'gem' | 'relic' | 'spell'>
      minCost?: number
      cardId?: string
    }
  | { kind: 'reduce_supply_cost'; amount: number }
  | { kind: 'gain_power_token'; cardId: string; playerId?: PlayerId }
  | { kind: 'destroy_cards_equal_to_power_tokens'; cardId: string; playerId?: PlayerId }
  | { kind: 'cast_any_number_prepped_spells' }
  | { kind: 'cast_specific_prepped_spell'; choice: PreppedSpellChoice }
  | {
      kind: 'discard_cards'
      source: 'hand'
      amount: number
      minAmount?: number
      maxAmount?: number
      cardType?: 'gem' | 'relic' | 'spell'
      /** Restrict this discard to exact card definitions. */
      cardIds?: string[]
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
      cardType?: 'gem' | 'relic' | 'spell'
      cardTypes?: CardType[]
      minCost?: number
      target?: PlayerTargetScope
      prompt?: string
      /** Restore the effect sequence to its source after this selection resolves. */
      restoreToSourceAfterSelection?: boolean
    }
  | { kind: 'conditional'; condition: CardEffectCondition; effects: CardEffect[] }
  | {
      kind: 'focus_breach'
      target: 'self' | 'any_player'
      selection?: 'choose' | 'lowest_focus_cost'
    }
  | { kind: 'focus_breach_all_players' }
  | { kind: 'reveal_top_cards' }
  | {
      kind: 'deal_damage_from_last_selection'
      target: DamageTargetScope
      amountPerCard: number
      base?: number
    }
  | { kind: 'deal_damage_from_last_selection_cost'; target: DamageTargetScope; base?: number }
  | { kind: 'play_card_from_hand'; cardType: 'gem'; times: number; destroy: boolean }
  | { kind: 'cast_spell_from_hand'; times: number }
  | { kind: 'cast_selected_spell_from_hand'; playerId: PlayerId; cardId: string; remaining: number }
  | { kind: 'play_card_instance'; cardId: string; destroyAfter: boolean; recordPlay?: boolean }
  | { kind: 'destroy_played_card'; cardId: string; playerId?: PlayerId }
  /** Remove a face-up Mage-specific card from the Player cards in play area. */
  | { kind: 'destroy_player_card_in_play'; cardId: string; playerId?: PlayerId }
  | { kind: 'lose_charge'; amount: number }
  | {
      kind: 'choose_one'
      prompt: string
      options: CardEffectOption[]
      /** Optional presentation hint for choices with long text. */
      layout?: 'stacked-panels' | 'mage-ability' | 'large-card-selection' | 'large-card-choice'
    }
  | {
      kind: 'choose_optional'
      prompt: string
      effects: CardEffect[]
      /** Disable the accept option when a nested card-selection effect has no valid cards. */
      disableIfUnavailable?: boolean
      /** Skip this prompt when a nested card-selection effect has no valid cards. */
      skipIfUnavailable?: boolean
      /** Disable the accept option when this condition is not currently met. */
      acceptCondition?: CardEffectCondition
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
  | { kind: 'return_cards_to_hand'; source: 'discard'; amount: number; minAmount?: number; cardTypes?: CardType[] }
  | { kind: 'set_prep_limit'; amount: number | 'unlimited'; breachIndices?: number[] }
  | { kind: 'place_revealed_turn_order_card' }
  | {
      kind: 'cast_prepped_spell'
      source: 'any_prepped_spell' | 'selected_prepped_spell' | 'prepped_spell_prepped_this_turn'
      /** Cast spells are discarded by default; set false only for explicit
       * effects such as Jian's Black Mirror first cast. */
      discard?: boolean
      /** Let a "may cast" effect skip without choosing a spell. */
      allowSkip?: boolean
      bonusDamage?: number
      ownerScope?: 'any_player' | 'ally'
      returnToCasterHand?: boolean
    }
  /** Shuffle a selected player turn-order card back into the deck and damage its owner. */
  | { kind: 'shuffle_turn_order_card'; damage: number; target?: 'self' | 'any_player' }
  /** Internal effect used when a triggered Ability asks whether to activate. */
  | { kind: 'activate_ability'; mageId: string }
  /** Prevent player and Gravehold damage until the current turn ends. */
  | { kind: 'prevent_damage_this_turn' }
  /** Internal marker used to finish one cast inside a larger effect sequence. */
  | { kind: 'resolve_spell_damage_bonus' }
  /** Internal marker used to move a cast spell to its discard pile after resolution. */
  | { kind: 'finalize_spell_cast' }
  /** Internal marker used by a Transfer Breach to choose the ally hand destination. */
  | { kind: 'place_cast_spell_in_ally_hand' }
  /** Perform the active Nemesis' complete Unleash sequence. */
  | { kind: 'unleash'; amount?: number }
  /** Internal exhaustion sequence marker. The player has already reached zero life. */
  | { kind: 'exhaust_player'; playerId: PlayerId; overflowDamage: number }
  /** Internal marker that asks the exhausted player to choose a Breach to destroy. */
  | { kind: 'destroy_exhausted_breach'; playerId: PlayerId; overflowDamage: number }
  /** Internal marker that applies the final exhaustion consequences. */
  | { kind: 'finish_exhaustion'; playerId: PlayerId; overflowDamage: number }
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
  /** Mage context for implicit "you/your" references when a card is activated during another Mage's turn. */
  effectPlayerScope?: 'owner' | 'active'
  /** The active turn must belong to the owner of this in-play card. */
  ownerTurnOnly?: boolean
  /** Main-phase effects that wait for an explicit click on the prepped spell. */
  manualActivation?: boolean
  /** Pause for player confirmation before resolving a mandatory prepped effect. */
  requiresConfirmation?: boolean
}

export interface CardDef {
  id: string
  name: string
  type: CardType
  cost: number
  set: string
  /** Printed level for Treasure cards; absent on Supply and Nemesis cards. */
  treasureLevel?: TreasureLevel
  /** Aether cost to Develop this card from supply or the shared Develop zone. */
  developCost?: number
  /** Rules keywords used for setup-time shared UI, such as Pulse token presence. */
  mechanics?: CardMechanic[]
  effects?: CardEffectBlock[]
  prepToClosedBreach?: boolean
  /** A destroyed card with this flag returns to its owner's Swap zone. */
  returnToSwapZoneOnDestroy?: boolean
}

export interface GemCard extends CardDef {
  type: 'gem'
}

export interface RelicCard extends CardDef {
  type: 'relic'
}

/** A non-market Treasure card, identified by its printed expedition level. */
export interface TreasureCard extends CardDef {
  type: 'treasure'
  treasureLevel: TreasureLevel
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

export type MarketSetupMode = 'manual' | 'template1'

export interface MarketSetupConfig {
  mode: MarketSetupMode
  /** Exactly nine card IDs for manual setup; template1 may leave this empty. */
  slots: string[]
}

/**
 * Serializable setup for the currently supported two-player scenario.
 *
 * The turn-order deck always contains six cards in this scenario: two cards
 * per player and two Nemesis cards. The composition fields are explicit so
 * player-count-specific rules can be extended later without changing the
 * saved game shape again.
 */
export interface ScenarioConfig {
  id: 'two_player'
  playerCount: 2
  mageTypes: [string, string]
  nemesisType: string
  nemesisDifficulty: NemesisDifficulty
  turnOrderDeckSize: 6
  playerTurnOrderCardsPerPlayer: 2
  nemesisTurnOrderCards: 2
  marketSetup?: MarketSetupConfig
}

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
  /** Runtime rules module that supplies this Nemesis' Unleash sequence and optional hooks. */
  rulesModuleId?: string
  /** Builders for this Nemesis' decks. Definitions may omit unused auxiliary decks. */
  deckBuilder?: () => string[]
  specificDeckBuilder?: () => string[]
  /** How the otherwise generic specific-deck zone is used by this Nemesis. */
  specificPileKind?: 'devoured'
}

// ===== Breach =====
export type Direction = 'east' | 'south' | 'west' | 'north'

export interface BreachState {
  index: number
  /** Whether this breach exists for the Mage. */
  present?: boolean
  opened: boolean
  prepSpells: string[]
  /** Parallel flags used by effects that target spells prepped this turn. */
  preppedThisTurn?: boolean[]
  /** Parallel flags for face-down Conjure spells. */
  preppedSpellFaceDown?: boolean[]
  focusDirection: Direction
  /** Direction and costs the Breach had at setup, used by reset effects. */
  startingDirection?: Direction
  startingFocusCost?: number
  startingFocusToOpen?: number
  startingOpenCost?: Record<Direction, number>
  focusCost: number
  focusCount: number
  focusToOpen: number
  openCost: Record<Direction, number>
  focusedThisTurn: boolean
  damageBonus: number
  /** Breach upgrades attached to this Breach, in installation order. */
  installedUpgrades?: string[]
  /** Permanent extra spell capacity from installed upgrades. */
  prepSpellLimitBonus?: number
  /** Breaches such as Stake's Prototype cannot be destroyed. */
  indestructible?: boolean
  /** Special Breach rules, e.g. Indira's Transfer, Remnant's Rift, and Stake's Prototype. */
  special?: 'transfer' | 'rift' | 'prototype' | 'intoned'
}

// ===== Nemesis Cards In Play =====
export interface NemesisCardInPlay {
  cardId: string
  /** Attacks are shown here temporarily while their effects resolve. */
  cardType: 'attack' | 'minion' | 'power'
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
  id: PlayerId
  mageType: string
  hp: number
  maxHp: number
  deck: string[]
  hand: string[]
  discard: string[]
  playedThisTurn: string[]
  /** Mage-specific face-up cards waiting to be swapped into the deck. */
  swapZone?: string[]
  /** @deprecated Legacy per-player Develop contents are migrated to GameState.developZone. */
  developZone?: string[]
  /** Face-down Mage-specific deck, such as Dezmodia's Stash. */
  specificDeck?: string[]
  /** Qu's currently displayed side of the Mage Form card. */
  mageFormSide?: 'giver' | 'taker'
  /** True after setup choices for this Mage's specific deck have resolved. */
  mageSetupComplete?: boolean
  /** Turn cleanup has moved played cards and is waiting for end-of-turn effects. */
  drawPhaseSetupComplete?: boolean
  /** Number of spells this player has cast during their current turn. */
  spellsCastThisTurn?: number
  /** Mage-specific cards whose faces have been revealed to the player. */
  knownSpecificDeckCards?: string[]
  /** Face-up Mage cards placed into play; later cards are placed on top. */
  playerCardsInPlay?: string[]
  /** Supply pile index for each corresponding card in playerCardsInPlay. */
  playerCardSupplyTargets?: Array<number | null>
  /** Power-token count for each corresponding card in playerCardsInPlay. */
  playerCardPowerTokens?: number[]
  /** Aether tokens are spent as one Aether each and expire during draw. */
  aetherTokens?: number
  /** Pulse tokens persist across turns and are capped at five. */
  pulseTokens?: number
  /** Persistent Knowledge resource, tracked independently of turn-scoped Aether. */
  knowledge?: number
  /** Persistent Doom tokens tracked for Mages that use the Doom mechanic. */
  doomTokens?: number
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
  /** The current Main Phase card has been visibly confirmed by the player. */
  mainEffectConfirmed?: boolean
  /** A revealed Attack or depleted Power remains in play until all effects finish. */
  activeCardPendingDiscard?: boolean
}

export interface GameState {
  scenario: ScenarioConfig
  players: PlayerState[]
  nemesis: NemesisState
  gravehold: GraveholdState
  market: MarketState
  /** Shared public Develop zone; cards here are not part of the supply. */
  developZone?: string[]
  /** Shared Wave 9 Trinket deck, top card first. */
  trinketDeck?: string[]
  /** Per-copy reveal memory aligned with trinketDeck (top card at index 0). */
  trinketDeckRevealed?: boolean[]
  /** Setup-time visibility for Mage Swap zones, shared across Mage views. */
  hasSwapZone?: boolean
  /** Setup-time visibility for the shared Develop zone, shared across Mage views. */
  hasDevelopZone?: boolean
  /** Mechanics present in the starting market, preserved even when a pile empties. */
  supplyMechanics?: CardMechanic[]
  turnOrderDeck: string[]
  turnOrderDiscard: string[]
  currentTurn: TurnOrderActorId
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
