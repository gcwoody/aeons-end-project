// ===== Card Types =====
export type CardType = 'gem' | 'relic' | 'spell' | 'corruption' | 'treasure' | 'mage_form' | 'breach_upgrade' | 'attack' | 'minion' | 'power' | 'strike'
export type CardMechanic = 'pulse_token' | 'recall' | 'develop' | 'swap' | 'trinket' | 'attach' | 'unlimited_conjure'

/** Order used when a draw or reveal needs cards from a deck's discard pile. */
export type DeckRecyclePolicy = 'reverse_discard' | 'shuffle_discard'

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
  | { kind: 'per_specific_deck_card_cost'; base: number }
  | {
      /** Cost of the card selected by the immediately preceding card-selection effect. */
      kind: 'last_selection_cost'
    }
  | { kind: 'last_chosen_token_amount' }
  | {
      /** Current life of the Nemesis Minion whose effect is resolving. */
      kind: 'current_minion_life'
    }
  | { kind: 'unspent_aether' }

export type EffectComparison = 'equals' | 'at_least' | 'at_most' | 'greater_than'

export type CardEffectCondition =
  | { kind: 'all_of'; conditions: CardEffectCondition[] }
  | { kind: 'has_pulse_tokens'; amount: number; player?: 'source' | 'active' }
  | { kind: 'has_prepped_spell'; ownerScope?: 'any_player' | 'ally'; minCost?: number }
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
      /** Count only spells whose current rules cost meets this threshold. */
      minCost?: number
    }
  | { kind: 'has_player_turn_order_card' }
  | {
      kind: 'nemesis_turn_order_discard_count'
      comparison: EffectComparison
      count: number
    }
  | {
      /** True when a matching player still has a present breach that is not open. */
      kind: 'has_unopened_breach'
      target?: PlayerTargetScope
    }
  | { kind: 'all_breaches_opened' }
  | { kind: 'has_pulse_token_capacity' }
  | { kind: 'has_focusable_breach'; target: 'self' | 'ally' | 'any_player' }
  | { kind: 'mage_form_is'; form: 'giver' | 'taker'; player?: 'source' | 'active' }
  | { kind: 'has_charge'; amount: number }
  | { kind: 'has_knowledge'; amount: number; player?: 'source' | 'active' }
  | { kind: 'has_doom'; amount: number }
  | { kind: 'has_aether'; amount: number }
  | { kind: 'has_card_in_zone'; zone: CardZone; cardType?: CardType; cardId?: string }
  | {
      /** Number of cards matching these optional filters in one player zone. */
      kind: 'zone_card_count'
      zone: CardZone
      cardId?: string
      cardType?: CardType
      comparison: EffectComparison
      count: number
    }
  | { kind: 'has_affordable_card_in_specific_deck'; cardType: CardType; payment: 'knowledge'; player?: 'source' | 'active' }
  | { kind: 'has_installed_breach_upgrade'; breachIndex: number }
  | { kind: 'has_card_in_hand'; cardType: 'gem' | 'relic' | 'spell' }
  | { kind: 'has_eligible_card_in_zone'; zone: CardZone | 'hand_or_discard'; cardTypes: CardType[]; cardIds?: string[]; minimumCost?: number; treasureLevel?: TreasureLevel; target?: PlayerTargetScope | 'source' }
  | { kind: 'specific_deck_card_count'; comparison: EffectComparison; count: number }
  | { kind: 'specific_deck_top_card_cost'; comparison: EffectComparison; amount: number }
  | { kind: 'nemesis_specific_deck_accepts_cards' }
  | { kind: 'source_minion_life'; comparison: EffectComparison; amount: number }
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
  | { kind: 'supply_pile_empty'; cardId: string }
  /** True when the immediately preceding card-selection effect selected at least one card. */
  | { kind: 'last_selection_nonempty' }
  /** True when the immediately preceding optional choice was accepted. */
  | { kind: 'last_optional_accepted' }
  | { kind: 'has_recall_in_any_discard' }
  | { kind: 'has_last_selected_card_cost'; comparison: EffectComparison; amount: number }
  | { kind: 'nemesis_discard_minion_count'; comparison: EffectComparison; amount: number }
  | { kind: 'collective_hand_card_count'; comparison: EffectComparison; count: number; cardTypes?: CardType[]; minCost?: number }
  | { kind: 'has_nonempty_market_pile'; cardType?: 'gem' | 'relic' | 'spell' }
  | { kind: 'any_player_charge'; amount: number }
  | { kind: 'any_player_below_max_life' }
  | { kind: 'has_bottom_nemesis_discard_attack_with_effect' }
  | { kind: 'nemesis_life'; comparison: EffectComparison; amount: number }
  | { kind: 'sub_board_token_count'; tokenId: string; comparison: EffectComparison; count: number; regionIds?: string[] }
  | { kind: 'nemesis_difficulty_is'; difficulty: NemesisDifficulty }

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
  | { kind: 'on_attached_breach_spell_cast' }
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
  | 'highest_hp'
  | 'most_crystals'
  | 'most_charges'
  | 'most_opened_breaches'
  | 'fewest_cards_in_deck'
export type PlayerTargetRef = { kind: 'player'; playerId: PlayerId }
export type LifeTargetScope = PlayerTargetScope | 'nemesis' | 'gravehold'
export type DamageTargetScope = 'nemesis' | 'minion' | 'source_minion' | 'gravehold' | 'nemesis_or_minion'
export type DividedDamageTargetScope = DamageTargetScope | 'all_players'
export type CardSelectionSource = 'hand' | 'discard' | 'deck' | 'hand_or_discard' | 'deck_or_discard' | 'played_gem_this_turn' | 'played_this_turn' | 'swap_zone' | 'specific_deck' | 'player_cards_in_play'
export type CardSelectionLayout = 'simple' | 'pile' | 'instant-card-choice'
export type CardZone = 'deck' | 'hand' | 'discard' | 'played_this_turn' | 'swap_zone' | 'specific_deck' | 'player_cards_in_play'
export type CardGainDestination = 'discard_top' | 'deck_top'

/** Stable rule-side zones used by card movement facts (never UI coordinates). */
export type CardMoveZone =
  | 'deck' | 'hand' | 'discard' | 'played_this_turn' | 'swap_zone' | 'specific_deck'
  | 'player_cards_in_play' | 'destroyed' | 'breach' | 'develop' | 'nemesis_deck' | 'nemesis_card_stack'
  | 'nemesis_discard' | 'nemesis_play_area' | 'nemesis_set_aside' | 'corruption_deck' | 'strike_deck'
  | 'strike_discard' | 'trinket_deck' | 'supply' | 'temporary'

export type CardMoveReason =
  | 'play' | 'discard' | 'discard_cost' | 'discard_phase' | 'draw' | 'gain' | 'buy'
  | 'develop' | 'swap' | 'prep_spell' | 'cast_spell' | 'recall' | 'destroy'
  | 'return' | 'effect' | 'nemesis_turn' | 'setup' | 'shuffle' | 'reorder'
  | 'reveal' | 'temporary'

export interface CardMoveZoneAddress {
  zoneId: string
  zone: CardMoveZone
  ownerId: string | null
  index: number
}

interface CardMoveEventBase {
  transactionId: string
  eventId: string
  sequence: number
  instanceId: string
  cardId: string
  reason: CardMoveReason
}

export type CardMoveEvent =
  | (CardMoveEventBase & { kind: 'move'; source: CardMoveZoneAddress; destination: CardMoveZoneAddress; moveId: string })
  | (CardMoveEventBase & { kind: 'create'; source?: CardMoveZoneAddress; destination: CardMoveZoneAddress })
  | (CardMoveEventBase & { kind: 'destroy'; source: CardMoveZoneAddress })
  | (CardMoveEventBase & { kind: 'reorder'; zone: CardMoveZoneAddress; fromIndex: number; toIndex: number })
  | (CardMoveEventBase & { kind: 'shuffle'; zone: CardMoveZoneAddress })
  | (CardMoveEventBase & { kind: 'reveal'; zone: CardMoveZoneAddress })
  | (CardMoveEventBase & { kind: 'temporary'; source?: CardMoveZoneAddress; destination: CardMoveZoneAddress })

export interface CardMoveAuditIssue {
  instanceId: string
  cardId: string
  message: string
}

export interface TokenAmountChoiceSummary {
  /** Sentence containing `{amount}`, rendered above the confirmation button. */
  template: string
  /** Amount contributed by the card before the selected token count. */
  baseAmount: number
  /** Amount added to the summary per selected token. Defaults to one. */
  amountPerToken?: number
}

export interface CardChoice {
  zone: CardZone
  index: number
  cardId: string
  cardName: string
  /** The card remains visible in a selection panel but cannot currently be chosen. */
  disabled?: boolean
  disabledReason?: string
  /** Optional presentation hint for cards newly drawn by a compound effect. */
  /** Semantic outline tone rendered by the shared UI highlight layer. */
  highlight?: 'required' | 'choice'
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
  | { kind: 'player'; id: string; playerId: PlayerId; label: string }
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

export type DamageTargetDecisionContinuation = PendingDecisionBase & (
  | { kind: 'select_damage_target'; targets: DamageTargetRef[] }
  | { kind: 'allocate_divided_damage'; targets: DamageTargetRef[]; total: number }
)

/** Serializable continuation data used while an effect waits for a choice. */
export interface PendingEffectResolution {
  /** Mage whose action is currently resolving the effect. Nemesis effects may omit it. */
  sourcePlayerId?: PlayerId
  /** Owner of the physical source card; may differ from the Mage resolving its effect. */
  sourceCardOwnerId?: PlayerId
  sourceCardId?: string
  /** A card being played from hand remains there until an attach target is confirmed. */
  sourceCardInHandPendingPlay?: boolean
  sourceCardHandIndex?: number
  remainingEffects: CardEffect[]
  lastGainedCardId?: string
  awaiting?: CardEffect
  /** Bonus damage granted by the breach where a spell was cast. */
  spellDamageBonus?: number
  /** One-time "additional damage" bonus granted by an effect such as Blasting Staff. */
  spellAdditionalDamageBonus?: number
  /** Phase that created a prepped-spell resolution, when applicable. */
  preppedPhase?: 'casting_phase_end' | 'main_phase'
  /** The player whose prepped spell is currently being resolved. */
  effectPlayerId?: string
  /** The prepped spell selected by an ability and reused by later effects. */
  selectedPreppedSpell?: PreppedSpellChoice
  /** Nested cast effects temporarily hide an outer selected-spell continuation. */
  preppedSpellSelectionStack?: Array<PreppedSpellChoice | null>
  /** Confirms a board click before a prepped-spell cast effect continues. */
  confirmedPreppedSpell?: PreppedSpellChoice
  /** Resume the Nemesis state machine when this effect frame finishes. */
  nemesisResume?: boolean
  /** Auxiliary Nemesis card already removed from its deck and awaiting reveal confirmation. */
  revealedStrikeCardId?: string
  /** Physical copy ID for the Strike held during its reveal and resolution. */
  revealedStrikeCardInstanceId?: string
  /** Spell cast that remains on its breach until the cast effect sequence finishes. */
  pendingSpellCast?: PendingSpellCast
  /** Number/cost of cards selected by the previous optional card effect. */
  lastSelectedCardCount?: number
  lastSelectedCardCost?: number
  /** Number of Doom lost by the most recent lose_doom effect. */
  lastDoomLost?: number
  /** Remaining individual recipients to ask while allocating collective Corruptions. */
  remainingCorruptionGains?: number
  /** Token amount selected by the most recent choose_token_amount effect. */
  lastChosenTokenAmount?: number
  /** Result of the most recent optional choice in this effect frame. */
  lastOptionalAccepted?: boolean
  /** Players still waiting to reveal a top deck card for a reveal effect. */
  revealTopPlayerIds?: PlayerId[]
  revealedTopCard?: { playerId: PlayerId; cardId: string }
  /** Hand card selected for a play-card-from-hand effect. */
  selectedCardId?: string
  /** Temporary player chosen for a multi-step Nemesis effect. */
  selectedActionPlayerId?: PlayerId
  /** Mage chosen to receive the first card during an Oracle Expunge. */
  vortexExpungeStartPlayerId?: PlayerId
  /** Recipient chosen for a card-placement effect. */
  placementRecipientPlayerId?: PlayerId
  /** Card revealed by Conjure while waiting for a Breach choice. */
  conjuredCard?: { playerId: PlayerId; cardId: string; instanceId?: string }
  /** Corruption temporarily removed from hand while its nested effects resolve. */
  resolvingCorruption?: { playerId: PlayerId; cardId: string; instanceId: string }
  /** Selected recipient for a target-scoped Conjure, without changing its effect source. */
  conjureTargetPlayerId?: PlayerId
  /** Ability owner whose resolution should fire on_ability_resolved hooks. */
  afterAbilityPlayerId?: PlayerId
  /** Remaining players for a Time Cortex all-player Breach focus. */
  focusAllPlayerIds?: PlayerId[]
  /** Cards temporarily revealed from a Mage-specific deck while placement choices resolve. */
  specificDeckReveal?: {
    playerId: PlayerId
    cards: string[]
    /** Stable physical-copy IDs parallel to the temporarily revealed cards. */
    instanceIds?: string[]
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
  /** Damage allocations while resolving a divided-damage spell. */
  dividedDamageAllocation?: {
    total: number
    remaining: number
    target: DividedDamageTargetScope
    amounts: Record<string, number>
  }
}

export interface PendingSpellCast {
  playerId: PlayerId
  /** Mage whose action initiated the cast when different from the spell owner. */
  casterPlayerId?: PlayerId
  breachIndex: number
  spellIndex: number
  cardId: string
  /** Physical copy identity, retained when an on-Cast rule moves the spell. */
  instanceId?: string
  /** Damage effects already resolved by this cast, including zero-base effects. */
  damageInstancesResolved?: number
  /** Prevent repeated fallback damage if no legal enemy target exists. */
  fallbackDamageAttempted?: boolean
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
  selectedCardPayments: Array<{ costIndex: number; choices: CardChoice[]; applied?: boolean }>
  selectedPreppedSpellPayments: Array<{ costIndex: number; choices: PreppedSpellChoice[] }>
  /** A sequentially discarded hand card must finish flying before the next choice. */
  awaitingCardMotions?: boolean
}

export interface DecisionOption {
  id: string
  label: string
  /** Card shown as the visual choice for card-selection style decisions. */
  cardId?: string
  /** Sub-board region associated with a board-click choice. */
  regionId?: string
  /** The option is shown for context but cannot be selected in the current state. */
  disabled?: boolean
}

export type SpecificDeckPlacement = 'top' | 'bottom'

export interface CardDistributionItem {
  cardId: string
  instanceId: string
}

export type PendingDecision = PendingDecisionBase & (
  | {
      kind: 'choose_one'
      options: DecisionOption[]
      /** Optional presentation hint for choices with long text. */
      layout?: 'stacked-panels' | 'two-button-choice' | 'mage-ability' | 'large-card-selection' | 'large-card-choice' | 'centered-prompt-cards' | 'centered-prompt' | 'sub-board-region-choice'
    }
  | DamageTargetDecisionContinuation
  | {
      /** Spend an adjustable number of one token type before continuing effects. */
      kind: 'choose_token_amount'
      token: 'pulse'
      minAmount: number
      maxAmount: number
      available: number
      summary?: TokenAmountChoiceSummary
      layout?: 'centered-prompt'
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
      /** Persistent candidate outline tone from the shared choice/required palette. */
      targetHighlight?: 'required' | 'choice'
      /** Allow the candidate cards to be reordered before confirming this decision. */
      reorderable?: boolean
      /** Owner of a source-specific deck when it differs from the active effect player. */
      ownerId?: PlayerId
    }
  | {
      /** Cards shown to the player and assigned to player zones before confirmation. */
      kind: 'distribute_cards'
      source: 'nemesis_specific_deck'
      destination: 'discard' | 'deck_top'
      cards: CardDistributionItem[]
      players: PlayerId[]
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
      /** This is an explicit confirmation of a repeated cast of the same spell. */
      repeat?: boolean
    }
  | {
      kind: 'select_breach'
      candidates: BreachChoice[]
      /** Board interaction that opened this decision. Attach decisions must
       * highlight the Breach itself without lighting its Focus button. */
      action?: 'focus' | 'attach' | 'reset'
    }
  | { kind: 'select_conjure_breach'; cardId: string; candidates: BreachChoice[] }
  | { kind: 'select_exhaust_breach'; candidates: BreachChoice[] }
  | {
      kind: 'select_prepped_spells'
      candidates: PreppedSpellChoice[]
      min: number
      max: number
      /** Keep single-choice selections pending until Confirm is pressed. */
      confirmSelection?: boolean
      /** Choices that are required but remain on the board until confirmation. */
      requiredChoices?: PreppedSpellChoice[]
    }
  | {
      kind: 'select_collective_cards'
      candidates: CollectiveCardChoice[]
      min: number
      max: number
      /** This single card must be clicked again to confirm a repeated spell cast. */
      repeat?: boolean
    }
  | {
      kind: 'select_life_target'
      targets: LifeTargetRef[]
    }
  | {
      kind: 'select_player_target'
      targets: PlayerTargetRef[]
      /** Exact damage each player would suffer if selected for this effect. */
      damageAmounts?: Record<PlayerId, number>
      /** Action summary for a player-targeted discard, including an immediate self-draw follow-up. */
      playerDiscardAction?: {
        minAmount: number
        maxAmount: number
        drawAmount: number
      }
    }
  | {
      kind: 'confirm_oracle_nemesis_damage_target'
      target: DamageTargetRef
      resumeDecision: DamageTargetDecisionContinuation
    }
  | {
      kind: 'select_market_pile'
      candidates: MarketPileChoice[]
      /** Use the required-target highlight for constrained choices such as the least expensive pile. */
      emphasis?: 'required'
    }
  | {
      /** A Nemesis setup rule requires choosing a supply pile before turn one. */
      kind: 'select_setup_devour_pile'
      candidates: MarketPileChoice[]
      remainingChoices: number
    }
  | {
      /** Setup moves one card from a highest-cost Supply pile to the Exiled pile. */
      kind: 'select_setup_exiled_pile'
      candidates: MarketPileChoice[]
    }
  | {
      /** Setup replaces one selected supply pile with a Nemesis-specific card. */
      kind: 'select_setup_supply_replacement'
      candidates: MarketPileChoice[]
      replacementCardId: string
      nextReplacementCardId?: string
      /** Card faces shown with this setup choice to explain the replacement options. */
      previewCardIds?: string[]
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
      /** A revealed player-deck card must remain visible until the effect is confirmed. */
      kind: 'confirm_revealed_card'
      cardId: string
      playerId: PlayerId
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
  | {
      /** A triggered player card stays highlighted until its owner confirms it from the board. */
      kind: 'confirm_player_card_effect'
      cardId: string
      playerId: PlayerId
      cardIndex: number
    }
  | {
      /** Internal pause until the UI finishes card movement animations. */
      kind: 'await_card_motions'
    }
)

export type PendingDecisionAnswer =
  | { kind: 'choose_one'; optionId: string }
  | { kind: 'choose_optional'; accepted: boolean }
  | { kind: 'select_cards'; choices: CardChoice[]; order?: CardChoice[] }
  | { kind: 'distribute_cards'; assignments: Array<{ instanceId: string; playerId: PlayerId }> }
  | { kind: 'place_specific_deck_card'; cardId: string; placement: SpecificDeckPlacement; slot?: number }
  | { kind: 'select_prepped_spell'; choice: PreppedSpellChoice | null }
  | { kind: 'select_breach'; choice: BreachChoice }
  | { kind: 'select_conjure_breach'; choice: BreachChoice | null }
  | { kind: 'select_exhaust_breach'; choice: BreachChoice }
  | { kind: 'select_prepped_spells'; choices: PreppedSpellChoice[] }
  | { kind: 'select_collective_cards'; choices: CollectiveCardChoice[] }
  | { kind: 'select_life_target'; target: LifeTargetRef }
  | { kind: 'select_player_target'; target: PlayerTargetRef }
  | { kind: 'select_damage_target'; target: DamageTargetRef }
  | { kind: 'allocate_divided_damage'; action: 'add' | 'remove'; targetId: string }
  | { kind: 'allocate_divided_damage'; action: 'confirm' }
  | { kind: 'confirm_oracle_nemesis_damage_target'; accepted: boolean }
  | { kind: 'choose_token_amount'; amount: number }
  | { kind: 'select_market_pile'; choice: MarketPileChoice }
  | { kind: 'select_setup_devour_pile'; choice: MarketPileChoice }
  | { kind: 'select_setup_exiled_pile'; choice: MarketPileChoice }
  | { kind: 'select_setup_supply_replacement'; choice: MarketPileChoice }
  | { kind: 'reorder_turn_order'; order: number[] }
  | { kind: 'select_turn_order_card'; choice: TurnOrderCardChoice }
  | { kind: 'confirm_turn_order_reveal'; accepted: true }
  | { kind: 'confirm_nemesis_draw'; accepted: true }
  | { kind: 'confirm_nemesis_effect'; accepted: true }
  | { kind: 'confirm_revealed_card'; accepted: true }
  | { kind: 'choose_turn_order_position'; position: 'top' | 'bottom' }
  | { kind: 'confirm_prepped_effect'; accepted: true }
  | { kind: 'confirm_player_card_effect'; accepted: true }
  | { kind: 'await_card_motions'; accepted: true }

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
  /** Spell damage bonuses that last until this player's Draw Phase. */
  spellDamageBonuses?: Array<{ amount: number; maxCost: number }>
}

export interface CardEffectOption {
  id: string
  label: string
  effects: CardEffect[]
  /** Card shown when this option is presented as a visual card choice. */
  cardId?: string
  /** Sub-board region associated with a board-click choice. */
  regionId?: string
  /** Optional dynamic rule used to determine whether this choice is available. */
  condition?: CardEffectCondition
  /** Resolve this option automatically when it is the only available choice. */
  autoSelectIfSoleAvailable?: boolean
  /** Used only when every option's full-resolution condition fails. Highest rank wins. */
  fallbackPriority?: number
}

/** Effects that trigger together, grouped by the card or mat that produced them. */
export interface SimultaneousEffectGroup {
  id: string
  sourceLabel: string
  effectLabel: string
  effects: CardEffect[]
}

/** A small, serializable vocabulary for reusable card rules. */
export type CardEffect =
  | { kind: 'gain_pulse_token'; amount?: number; target?: PlayerTargetScope }
  | { kind: 'lose_pulse_token'; amount: EffectAmount; target?: PlayerTargetScope }
  | {
      kind: 'choose_token_amount'
      token: 'pulse'
      prompt: string
      minAmount?: number
      maxAmount?: number
      summary?: TokenAmountChoiceSummary
      layout?: 'centered-prompt'
      effects: CardEffect[]
    }
  | { kind: 'gain_knowledge'; amount: number; target?: 'self' | 'breach_owner' }
  | { kind: 'lose_knowledge'; amount: number }
  | { kind: 'gain_doom'; amount: number }
  | { kind: 'lose_doom'; amount: number | 'all' }
  | { kind: 'repeat_effect'; count: 'last_doom_lost'; effects: CardEffect[] }
  | { kind: 'deal_damage_to_each_enemy'; amount: number }
  /** Deal one damage pool, initially auto-allocate by current life, then allow edits and explicit confirmation. */
  | {
      kind: 'deal_damage_divided'
      amount: EffectAmount
      target: DividedDamageTargetScope
      /** Damage modifiers are added to this single pool before players divide it. */
      additionalDamage?: AdditionalDamage[]
    }
  | { kind: 'install_breach_upgrade'; breachIndex: number; cardType: 'breach_upgrade'; player?: 'source' | 'active' }
  | { kind: 'select_breach_upgrade_card'; breachIndex: number; ownerId: PlayerId }
  /** Internal continuation after the player selects a Breach Upgrade card. */
  | { kind: 'install_breach_upgrade_card'; cardId: string; breachIndex: number; ownerId: PlayerId }
  | { kind: 'increase_breach_prep_limit'; amount: number; breachIndex: number }
  | { kind: 'increase_breach_damage_bonus'; amount: number; breachIndex: number }
  | { kind: 'gain_aether'; amount: number }
  | { kind: 'lose_unspent_aether' }
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
  /** Gain Corruptions from the active Nemesis' auxiliary deck. */
  | { kind: 'gain_corruptions'; amount: number; target?: PlayerTargetScope; destination: 'deck_top' | 'deck_bottom' | 'hand' }
  | { kind: 'gain_corruption_and_shuffle_discard' }
  /** Resolve a player's eligible Corruptions in any order at a rule-defined timing. */
  | { kind: 'resolve_corruptions'; timing: 'turn_start' | 'end_main' }
  | { kind: 'resolve_tracked_in_hand_card'; playerId: PlayerId; instanceId: string }
  | { kind: 'resolve_corruption_card'; cardId: string; playerId: PlayerId }
  | { kind: 'return_source_corruption'; cardId: string; playerId: PlayerId }
  | { kind: 'destroy_source_corruption' }
  | { kind: 'gain_corruptions_collectively'; amount: number; destination: 'deck_top' | 'deck_bottom' | 'hand' }
  | { kind: 'arm_turn_order_deck_reset' }
  | { kind: 'resolve_glinting_stinger' }
  | { kind: 'destroy_breach' }
  | { kind: 'place_card_on_top_of_own_deck' }
  | { kind: 'place_hand_card_on_ally_deck' }
  | { kind: 'tempt_highest_crystals' }
  | { kind: 'focus_breach_for_different_player' }
  | { kind: 'discard_nemesis_top_cards'; amount: number; graveholdDamagePerTierThree: number }
  | { kind: 'afflict_two_players_with_corruptions'; corruptionAmount: number }
  | { kind: 'discard_noncorruptions_and_gain_corruptions'; discardAmount: number; corruptionAmount: number; destination: 'hand' | 'deck_top' | 'deck_bottom'; targetAvailability?: 'full_or_max' }
  | { kind: 'discard_noncorruption_cards'; amount: number }
  | { kind: 'deal_player_damage_by_last_selected_cost'; divisor: number; roundUp?: boolean; target: DamagePlayerTargetScope; baseAmount?: number; reduceByCost?: boolean }
  | { kind: 'discard_top_card'; target: PlayerTargetScope; targetAvailability?: 'full_or_max' }
  | { kind: 'look_at_top_card_may_destroy' }
  | { kind: 'gain_least_expensive_card'; cardType: 'gem' | 'relic' | 'spell'; destination: 'hand' | 'deck_top' }
  | { kind: 'return_nemesis_turn_order_card' }
  | { kind: 'devouring_wave_discard_and_gain' }
  | { kind: 'return_three_minions_from_nemesis_discard' }
  | { kind: 'shuffle_hand_into_deck_and_draw'; amount: number }
  | { kind: 'obliterate_most_open_breach_player' }
  | { kind: 'resolve_bottom_nemesis_attack_twice' }
  | { kind: 'return_nemesis_turn_order_card' }
  | { kind: 'devouring_wave_discard_and_gain' }
  | { kind: 'return_three_minions_from_nemesis_discard' }
  | { kind: 'shuffle_hand_into_deck_and_draw'; amount: number }
  | { kind: 'obliterate_most_open_breach_player' }
  | { kind: 'resolve_bottom_nemesis_attack_twice' }
  | { kind: 'look_at_top_card_may_destroy' }
  | { kind: 'gain_least_expensive_card'; cardType: 'gem' | 'relic' | 'spell'; destination: 'hand' | 'deck_top' }
  | { kind: 'deal_damage_by_last_selected_cost'; target: DamageTargetScope; divisor: number; roundUp?: boolean }
  | { kind: 'shuffle_turn_order_discard_into_deck' }
  /** Internal continuation that moves a gained Trinket to hand. */
  | { kind: 'move_gained_trinket_to_hand'; cardId: string; source: 'discard' | 'deck' }
  /** Return the currently played Trinket to the shared deck's known bottom. */
  | { kind: 'return_trinket_to_deck' }
  | {
      kind: 'conjure'
      breachEligibility?: 'standard' | 'any_present'
      target?: PlayerTargetScope
      /** Resolve player target scope relative to the effect's initiating Mage. */
      relativeToSource?: boolean
    }
  /** Reveal an ally's top card and put it in hand only if it is a spell. */
  | { kind: 'reveal_top_card_to_hand_if_spell'; target: PlayerTargetScope }
  /** Return the card that created this effect frame from discard to its owner's hand. */
  | { kind: 'move_source_card_to_hand' }
  /** Remove one card from a supply pile, identified directly or by this effect's source card. */
  /** Remove one card from the explicitly named Supply pile. */
  | { kind: 'destroy_market_card'; cardId: string }
  /** Grant a temporary bonus to the caster's later spells within this cost limit. */
  | { kind: 'grant_spell_damage_bonus'; amount: number; maxCost: number }
  | { kind: 'spend_aether'; amount: number }
  | {
      kind: 'gain_charge'
      amount: number
      target: 'self' | 'ally' | 'any_player' | 'each_ally' | 'allies_collectively' | 'breach_owner'
      /** Filter individually targeted allies before granting charge. */
      condition?: CardEffectCondition
      /** Continue the following effects from the selected ally's perspective. */
      continueAsTarget?: boolean
    }
  | {
      /** Grant one charge for each qualifying card in each affected hand. */
      kind: 'gain_charge_per_hand_card'
      minCost: number
      target: 'self_and_each_ally'
    }
  | {
      /** Attach the source relic to a Breach selected from the target scope. */
      kind: 'attach_relic'
      target: 'self' | 'ally' | 'any_player'
    }
  | {
      /** Draw cards first, then choose cards from the target's full hand to discard. */
      kind: 'draw_and_discard_cards'
      drawAmount: number
      discardAmount: number
      target?: PlayerTargetScope
      /** Internal continuation after each drawn card has resolved any hand-entry triggers. */
      resumeAfterDraw?: boolean
    }
  | {
      /** Resolve one selected Recall effect up to `maxTimes` times. */
      kind: 'resolve_recall'
      maxTimes: number
      /** Permit the effect to resolve Recall copies already used this turn. */
      ignoreOncePerTurn?: boolean
    }
  /** Internal continuation that restores the active source context between nested effects. */
  | {
      kind: 'restore_effect_context'
      sourcePlayerId?: PlayerId
      sourceCardOwnerId?: PlayerId
      sourceCardId?: string
      effectPlayerId?: PlayerId
      pendingSpellCast?: PendingSpellCast
      spellDamageBonus?: number
      spellAdditionalDamageBonus?: number
      /** Restore identities but retain damage state changed while resolving a nested trigger. */
      preserveSpellDamageState?: boolean
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
      /** If any target has one of these in hand, restrict the choice to those players. */
      preferTargetWithCardNamesInHand?: string[]
      /** If any target has one of these card types in hand, restrict the choice to those players. */
      preferTargetWithCardTypesInHand?: CardType[]
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
  /** Internal continuation that draws one card at a time so hand-entry triggers can interrupt. */
  | { kind: 'draw_cards_for_player'; playerId: string; remaining: number; drawn: number }
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
  | {
      kind: 'reveal_specific_deck'
      mode: 'put_one_into_play' | 'return_each'
      /** Optional one-click presentation for choosing one revealed card. */
      choiceLayout?: CardSelectionLayout
    }
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
      cardType?: 'gem' | 'relic' | 'spell'
      leastExpensive?: boolean
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
      minCost?: number
      cardType?: 'gem' | 'relic' | 'spell'
      /** Restrict this discard to exact card definitions. */
      cardIds?: string[]
      target?: PlayerTargetScope
      selection?: PlayerSelectionRule
      /** Prefer targets able to complete the full amount; if none can, retain those with the most eligible cards. */
      targetAvailability?: 'full_or_max'
      /** Restrict the choice to the highest-cost matching cards. */
      mostExpensive?: boolean
      /** Restore the effect to its source Mage after a player-targeted discard. */
      restoreToSourceAfterSelection?: boolean
      /** Fixed multi-card hand discards default to one-at-a-time; use together to retain multi-select. */
      selectionMode?: 'one_at_a_time' | 'together'
      /** Saved progress for a paused one-at-a-time hand discard. */
      sequentialProgress?: { remaining: number; discarded: number; highestCost: number }
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
  | { kind: 'discard_cards_collectively'; amount: EffectAmount; source: 'hand'; minCost?: number }
  | {
      kind: 'deal_gravehold_damage_with_gem_discard'
      amount: number
      maxGems: number
      reductionPerGem: number
    }
  | { kind: 'lose_all_charge'; target: PlayerTargetScope; selection?: PlayerSelectionRule }
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
  | {
      /** Exile selected player cards face up on top of the active Nemesis' specific deck. */
      kind: 'exile_cards'
      source: 'hand' | 'discard' | 'hand_or_discard'
      amount: number
      target?: PlayerTargetScope
      cardType?: CardType
      cardTypes?: CardType[]
      minCost?: number
      discardTopOnly?: boolean
      mostExpensive?: boolean
      /** Choose a target able to complete the full amount, or the target able to do the most. */
      targetAvailability?: 'full_or_max'
    }
  | {
      kind: 'conditional'
      condition: CardEffectCondition
      effects: CardEffect[]
      /** Optional mutually exclusive branch evaluated against the same state. */
      elseEffects?: CardEffect[]
    }
  | {
      kind: 'focus_breach'
      target: 'self' | 'ally' | 'any_player'
      selection?: 'choose' | 'lowest_focus_cost'
    }
  | {
      kind: 'focus_breach_all_players'
      target?: 'all_players' | 'allies'
      condition?: CardEffectCondition
    }
  | { kind: 'reveal_top_cards' }
  | { kind: 'reveal_top_cards_for_discard'; amount: number; reorderRemaining?: boolean }
  | {
      kind: 'deal_damage_from_last_selection'
      target: DamageTargetScope
      amountPerCard: number
      base?: number
    }
  | { kind: 'deal_damage_from_last_selection_cost'; target: DamageTargetScope; base?: number }
  | { kind: 'play_card_from_hand'; cardType: 'gem'; times: number; destroy: boolean }
  | { kind: 'cast_spell_from_hand'; times: number }
  | {
      kind: 'cast_selected_spell_from_hand'
      playerId: PlayerId
      cardId: string
      remaining: number
      /** This cast is a repeat and waits for an explicit confirmation first. */
      repeatConfirmation?: boolean
      /** Set only after the player confirms this repeated hand spell. */
      repeatConfirmed?: boolean
    }
  | { kind: 'play_card_instance'; cardId: string; destroyAfter: boolean; recordPlay?: boolean }
  | { kind: 'destroy_played_card'; cardId: string; playerId?: PlayerId }
  /** Remove a face-up Mage-specific card from the Player cards in play area. */
  | { kind: 'destroy_player_card_in_play'; cardId: string; playerId?: PlayerId }
  | { kind: 'lose_charge'; amount: number; target?: PlayerTargetScope; targetAvailability?: 'full_or_max' }
  | {
      /** Internal choice to order effects that triggered from distinct sources at once. */
      kind: 'resolve_simultaneous_effects'
      groups: SimultaneousEffectGroup[]
    }
  | {
      kind: 'choose_one'
      prompt: string
      options: CardEffectOption[]
      /** Optional presentation hint for choices with long text. */
      layout?: 'stacked-panels' | 'two-button-choice' | 'mage-ability' | 'large-card-selection' | 'large-card-choice' | 'centered-prompt-cards' | 'centered-prompt' | 'sub-board-region-choice'
    }
  | {
      kind: 'choose_optional'
      prompt: string
      effects: CardEffect[]
      /** Disable the accept option when a nested card or spell selection has no valid choice. */
      disableIfUnavailable?: boolean
      /** Skip this prompt when its accept condition or nested card/spell selection is unavailable. */
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
  | { kind: 'return_cards_to_hand'; source: 'discard'; amount: number; minAmount?: number; cardTypes?: CardType[]; maxCost?: number }
  | { kind: 'set_prep_limit'; amount: number | 'unlimited'; breachIndices?: number[] }
  | { kind: 'place_revealed_turn_order_card' }
  | {
      kind: 'cast_prepped_spell'
      source: 'any_prepped_spell' | 'selected_prepped_spell' | 'prepped_spell_prepped_this_turn'
      /** Cast spells are discarded by default; set false only for an explicit
       * exception such as Jian's Black Mirror or the first Infernal Cascade
       * cast. Repeated casts are separate casts and regain the default. */
      discard?: boolean
      /** Let a "may cast" effect skip without choosing a spell. */
      allowSkip?: boolean
      /** Minimum and maximum printed/prepared cost eligible for this cast. */
      minCost?: number
      maxCost?: number
      /** Total number of times to cast the chosen spell. */
      times?: number
      /** Require the player to click the same prepped spell before each repeat. */
      repeatConfirmation?: boolean
      bonusDamage?: number
      ownerScope?: 'any_player' | 'ally' | 'self'
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
  /** Play the top card of the Nemesis-specific deck as if it had been drawn. */
  | {
      kind: 'play_top_nemesis_specific_deck_card'
      afterPlay?: CardEffect[]
      powerTokensToRemove?: number
      protectPowerTokensThisTurn?: boolean
      /** The card is genuinely drawn (such as Vile Petition), so offer draw responses first. */
      checkDrawAbility?: boolean
      /** Internal continuation after any draw response has been offered. */
      drawAbilityResolved?: boolean
    }
  /** Return a named card from the Nemesis mat to play, keeping its physical instance. */
  | { kind: 'play_set_aside_nemesis_card'; cardId: string }
  /** Attach the bottom Nemesis-deck card, face-up, to the active Nemesis card. */
  | { kind: 'attach_bottom_nemesis_deck_card_under_source' }
  /** Play the card under the active Nemesis card as if it had been drawn. */
  | { kind: 'play_card_under_source_nemesis_card'; drawAbilityResolved?: boolean }
  /** Move the top card of the Nemesis-specific deck to its bottom. */
  | { kind: 'move_top_nemesis_specific_deck_card_to_bottom' }
  /** Remove one Power token from an eligible Power in play, asking the player when needed. */
  | { kind: 'remove_nemesis_power_token' }
  | {
      kind: 'remove_nemesis_power_token_from_card_instance'
      instanceId: string
      ignoreTurnProtection?: boolean
      protectAfterRemoval?: boolean
    }
  /** Finish an Attack or depleted Power after its effects have resolved. */
  | { kind: 'finish_active_nemesis_card' }
  /** Restore the Nemesis card context after resolving a nested card's effects. */
  | {
      kind: 'restore_nemesis_card_context'
      activeCardInstanceId?: string
      activeCardId?: string
      activeTrigger?: NemesisEffectTrigger
      activeCardPendingDiscard?: boolean
    }
  /** Apply the same damage amount to every player. */
  | { kind: 'deal_player_damage_all'; amount: EffectAmount }
  /** Players collectively discard the requested most-expensive prepped spells. */
  | { kind: 'discard_prepped_spells_collectively'; amount: number; mostExpensive?: boolean }
  /** Exile one card from a most-expensive non-empty supply pile. */
  | { kind: 'exile_market_card_from_most_expensive_pile' }
  /** Put a Finality from the specific discard pile into play, or damage Gravehold if empty. */
  | { kind: 'summon_finality_from_specific_discard' }
  /** Draw and resolve one card from the Nemesis' auxiliary Strike deck. */
  | { kind: 'resolve_strike'; count?: number }
  | { kind: 'return_strike_card'; cardId: string }
  /** Cancel the currently revealed Attack/Power before it resolves. */
  | { kind: 'discard_current_nemesis_card' }
  | { kind: 'gain_minion_life'; amount: number; minionCardId: string }
  /** Add or move a token on the active Nemesis' UI sub board. */
  | { kind: 'place_sub_board_token'; tokenId: string; regionId: string; instanceId?: string }
  | { kind: 'move_sub_board_token'; tokenId: string; regionId: string; instanceId?: string }
  | { kind: 'advance_sub_board_token'; tokenId: string }
  | { kind: 'resolve_sub_board_space'; tokenId: string; regionId?: string }
  /** Remove a fixed number of tokens (asking the player which one) or all matching tokens. */
  | { kind: 'remove_sub_board_tokens'; tokenId: string; amount: number | 'all'; regionIds?: string[]; selectByRegion?: boolean }
  | { kind: 'remove_sub_board_token_instance'; instanceId: string }
  /** Re-enter a Nemesis card that was set aside, resetting its printed Power tokens. */
  | { kind: 'play_set_aside_nemesis_card'; cardId: string }
  /** Move selected Mage cards to the top of the Nemesis specific-deck zone. */
  | {
      kind: 'move_cards_to_nemesis_specific_deck'
      source: 'hand' | 'played_this_turn'
      minAmount: number
      maxAmount: number
      cardIds?: string[]
      cardNames?: string[]
      cardTypes?: CardType[]
    }
  /** Shuffle the Nemesis specific deck and deal cards face-down from a player-chosen starting Mage. */
  | { kind: 'expunge_nemesis_specific_deck'; amount: number; fallbackGraveholdDamage: number }
  /** Gain cards from the Nemesis specific deck, either from its top or by printed cost. */
  | {
      kind: 'gain_nemesis_specific_deck_cards'
      amount: number
      selection: 'top' | 'most_expensive'
      recipient: 'active' | 'choose' | 'alternate_players'
      destination: 'discard' | 'deck_top'
      damage?: number
    }
  /** Let players assign selected Nemesis-deck cards to any Mage. */
  | {
      kind: 'distribute_nemesis_specific_deck_cards'
      amount: number
      selection: 'top' | 'most_expensive'
      destination: 'discard' | 'deck_top'
    }
  | { kind: 'destroy_nemesis_specific_deck_cards'; maxCost: number }
  | { kind: 'place_specific_deck_cards_under_source_minion'; amount: number }
  | { kind: 'move_cast_spell_to_nemesis_specific_deck' }
  /** Internal pause used for mandatory effects on prepped cards. */
  | {
      kind: 'confirm_prepped_effect'
      prompt: string
      cardId: string
      breachIndex: number
      spellIndex: number
      effects: CardEffect[]
    }
  | {
      kind: 'confirm_player_card_effect'
      prompt: string
      cardId: string
      playerId: PlayerId
      cardIndex: number
      effects: CardEffect[]
    }
  /** Internal continuation barrier for movement effects that must finish before later effects. */
  | { kind: 'await_card_motions' }

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
  /** Pause for confirmation on the source card before resolving a mandatory triggered effect. */
  requiresConfirmation?: boolean
}

export interface CardDef {
  id: string
  name: string
  type: CardType
  cost: number
  set: string
  /** Added to the market only by a named Nemesis setup, never selected as a normal pile. */
  setupOnlyNemesisSupplyFor?: string
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
  /** Rules restrictions for cards that cannot be affected by these mechanics. */
  cannotBeDestroyed?: boolean
  cannotBeExiled?: boolean
  cannotBeConjured?: boolean
  /** Resolve this card's on_play effects when it is in hand at the start/end of a turn. */
  resolveWhenInHand?: boolean
  /** Destination after a tracked in-hand resolution; defaults to destruction. */
  resolveInHandDestination?: 'destroy' | 'discard'
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
  tier: 0 | 1 | 2 | 3
  life?: number
  power?: number
  /** Initial Nemesis token count tracked by this Minion, when applicable. */
  nemesisTokens?: number
  nemesisEffects?: NemesisEffectBlock[]
  toDiscard?: NemesisToDiscard
  /** Optional passive rule applied to each damage instance dealt to this Minion. */
  damagePerInstance?: number
  /** Reduce each damage instance by this amount, to a minimum of 1 damage. */
  damageReductionPerInstance?: number
  /** Resolve this sequence whenever a player deals damage to this Minion. */
  onDamage?: CardEffect[]
  /** Resolve when a spell deals damage to this Minion. */
  onSpellDamage?: CardEffect[]
  /** Display this Nemesis card in a dedicated row of the play area. */
  displayRow?: 'top' | 'play'
  /** Minimum life this Minion can have after taking damage. */
  minimumLife?: number
  /** Cards under this Minion are gained by the Mage who defeats it. */
  gainCardsUnderneathOnDefeat?: boolean
  /** This Nemesis card prevents adding cards to its specific deck while in play. */
  blocksPlacementIntoSpecificDeck?: boolean
  /** This Nemesis card prevents players from placing tokens on a named sub-board. */
  blocksNemesisSubBoardPlacement?: string
  /** This Nemesis card suppresses effects printed on a named sub-board. */
  suppressesNemesisSubBoardEffects?: string
  /** Additional damage to a target when an effect from a named sub-board deals it. */
  subBoardDamageBonus?: { subBoardId: string; target: 'gravehold'; amount: number }
  /** Remove this card from the play area to the Nemesis mat after its Power resolves. */
  setAsideWhenResolved?: boolean
  /** Extra life added when this Minion enters play on Increased Difficulty. */
  increasedDifficultyLifeBonus?: number
  /** Return this defeated Minion to the Nemesis-specific discard pile. */
  returnToSpecificDiscardOnDefeat?: boolean
  /** Show one card underneath this card as a large attached corner card. */
  underCardDisplay?: 'stack' | 'attached_quarter'
  /** Return this Power to the bottom of the Nemesis-specific deck when resolved. */
  returnToSpecificDeckOnResolve?: boolean
  /** Return this Power to the bottom of the Nemesis-specific deck when discarded. */
  returnToSpecificDeckOnDiscard?: boolean
  /** Move cards underneath this Power to the top of the Nemesis discard when discarded. */
  discardUnderCardsToNemesisDiscard?: boolean
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
  | {
      kind: 'discard_cards'
      source: 'hand'
      amount: number
      drawAfter?: number
      /** Multi-card hand payments default to one-at-a-time selection; use together for bulk choice. */
      selectionMode?: 'one_at_a_time' | 'together'
    }
  | {
      kind: 'destroy_prepped_spells'
      amount: number
      minCost?: number
      /** Defaults to the Mage paying this To Discard cost. */
      playerScope?: 'payer' | 'any_player'
    }

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
  /** Expansion wave used by setup's content picker. */
  wave?: number
  hp: number
  /** Nemesis life can rise without a cap. */
  noLifeMaximum?: boolean
  /** The Nemesis wins when its life reaches this value. */
  lifeLossThreshold?: number
  /** The Nemesis wins as soon as its main deck becomes empty. */
  deckEmptyLoses?: boolean
  difficultyLevel: number
  uniqueCardIdsByTier: Record<1 | 2 | 3, string[]>
  basicCardsPerTier: Record<1 | 2 | 3, number>
  strikeCardIds: string[]
  startingCounters: Record<string, number>
  standardRules: Record<string, number>
  increasedDifficultyRules: Record<string, number>
  /** If present, only these card sources can reduce Nemesis life. */
  damageOnlyFromCardIds?: string[]
  /** Initial known state of the Nemesis-specific deck. */
  specificDeckVisibility?: 'revealed' | 'hidden'
  /** The top card is always visible, while the rest retain per-instance memory. */
  specificDeckTopAlwaysRevealed?: boolean
  /** Optional player-facing name for this Nemesis' specific deck. */
  specificDeckName?: string
  /** Runtime rules module that supplies this Nemesis' Unleash sequence and optional hooks. */
  rulesModuleId?: string
  /** Builders for this Nemesis' decks. Definitions may omit unused auxiliary decks. */
  deckBuilder?: () => string[]
  specificDeckBuilder?: () => string[]
  /** Optional Nemesis-specific discard pile used by mechanics such as Finality. */
  specificDiscardBuilder?: () => string[]
  /** Auxiliary deck for Nemesis mechanics such as Crooked Mask's Corruptions. */
  corruptionDeckBuilder?: () => string[]
  /** How the otherwise generic specific-deck zone is used by this Nemesis. */
  specificPileKind?: 'devoured' | 'exiled'
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
  /** Stable identities for prepped spell copies, preserved when they move between Breaches. */
  preppedSpellInstanceIds?: string[]
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
  /** Prep eligibility from a turn-local Focus; cleared at Draw Phase cleanup and each new turn. */
  focusedThisTurn: boolean
  damageBonus: number
  /** Breach upgrades attached to this Breach, in installation order. */
  installedUpgrades?: string[]
  /** Relic attached beneath this Breach token. ownerId is the Breach owner,
   * whose discard pile receives the relic if the attachment is removed. */
  attachedRelic?: { cardId: string; ownerId: PlayerId; instanceId?: string }
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
  /** Monotonic order when this card most recently entered its current board row. */
  displayOrder?: number
  instanceId?: string
  enteredOnNemesisTurn?: number
  lifeTokens?: number
  powerTokens?: number
  /** Prevent further Power-token loss until the Nemesis turn number changes. */
  powerTokenLossBlockedOnTurn?: number
  nemesisTokens?: number
  displayRow?: 'top' | 'play'
  underCards?: string[]
  underCardInstanceIds?: string[]
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
  /** Stable identities for physical card copies in the draw deck. */
  deckInstanceIds?: string[]
  hand: string[]
  /** Stable identities for physical card copies currently in hand. */
  handInstanceIds?: string[]
  /** Identity carried in hand for a spell returned from a Breach this turn. */
  handPreppedSpellInstanceIds?: Array<string | null>
  /** Monotonic source for stable identities assigned when spells are first prepped. */
  preppedSpellInstanceCounter?: number
  discard: string[]
  /** Stable identities for physical card copies in discard. */
  discardInstanceIds?: string[]
  playedThisTurn: string[]
  /** Stable identities for physical card copies played this turn. */
  playedThisTurnInstanceIds?: string[]
  /** Mage-specific face-up cards waiting to be swapped into the deck. */
  swapZone?: string[]
  /** Stable identities for physical copies in the Mage-specific Swap zone. */
  swapZoneInstanceIds?: string[]
  /** @deprecated Legacy per-player Develop contents are migrated to GameState.developZone. */
  developZone?: string[]
  /** Face-down Mage-specific deck, such as Dezmodia's Stash. */
  specificDeck?: string[]
  /** Stable identities for physical copies in this Mage-specific deck. */
  specificDeckInstanceIds?: string[]
  /** Qu's currently displayed side of the Mage Form card. */
  mageFormSide?: 'giver' | 'taker'
  /** True after setup choices for this Mage's specific deck have resolved. */
  mageSetupComplete?: boolean
  /** Turn cleanup has moved played cards and is waiting for end-of-turn effects. */
  drawPhaseSetupComplete?: boolean
  /** Snapshot of cards played before the UI's discard-order step moves them. */
  pendingEndTurnCardIds?: string[]
  /** Number of spells this player has cast during their current turn. */
  spellsCastThisTurn?: number
  /** Mage-specific cards whose faces have been revealed to the player. */
  knownSpecificDeckCards?: string[]
  /** Physical Trinket copies currently owned outside the shared Trinket deck. */
  trinketInstanceIds?: string[]
  /** Face-up Mage cards placed into play; later cards are placed on top. */
  playerCardsInPlay?: string[]
  /** Stable identities for face-up Mage cards currently in play. */
  playerCardsInPlayInstanceIds?: string[]
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
  /** Stable identities for cards permanently removed from the deck cycle. */
  destroyedCardInstanceIds?: string[]
  /** Temporary effects and once-per-turn markers, reset during draw phase. */
  turnEffects: PlayerTurnEffects
  /** Corruption cards drawn into hand this turn, awaiting end-of-Main-Phase resolution. */
  corruptionsDrawnThisTurn?: string[]
  /** Physical cards that trigger when they enter hand, queued in entry order. */
  pendingInHandResolutionInstanceIds?: string[]
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
  /** Crooked Mask's face-down Corruption deck, top card first. */
  corruptionDeck?: string[]
  /** Public Corruptions already seen in the Corruption deck, aligned by card index. */
  corruptionDeckRevealed?: boolean[]
  corruptionDeckInstanceIds?: string[]
  deckInstanceIds?: string[]
  discardInstanceIds?: string[]
  strikeDeckInstanceIds?: string[]
  strikeDiscardInstanceIds?: string[]
  strikeDeckRevealed?: boolean[]
  /** Strike copy temporarily outside the auxiliary deck while a direct draw resolves. */
  resolvingStrikeCardId?: string
  resolvingStrikeCardInstanceId?: string
  /** Dark Conclusion waits beside the turn-order deck until its reset trigger. */
  turnOrderDeckResetCardId?: string
  turnOrderDeckResetCardInstanceId?: string
  /** Face-up Nemesis cards set aside beside the active play row. */
  setAsideCards?: NemesisCardInPlay[]
  /** Physical tokens currently placed on a Nemesis sub board. */
  subBoardTokens?: NemesisSubBoardToken[]
  subBoardTokenCounter?: number
  counters: Record<string, number>
  /** Number of Nemesis turns that have started for this game. */
  nemesisTurnNumber?: number
  /** Monotonic ID source for cards entering the Nemesis play area. */
  cardInstanceCounter?: number
  playArea: NemesisCardInPlay[]
  tierAnnounced: boolean[]
}

export interface NemesisSubBoardToken {
  instanceId: string
  tokenId: string
  regionId: string
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

/** Serializable identity and response state for a Nemesis card awaiting resolution. */
export interface NemesisDrawContext {
  drawnCardId?: string
  drawnCardProcessed?: boolean
  drawnCardRevealed?: boolean
  drawnCardInstanceId?: string
  drawnCardResponseHandled?: boolean
  drawnCardCancelled?: boolean
  drawnCardSourceZone?: 'strike_deck' | 'nemesis_card_stack'
  drawnCardSourceParentInstanceId?: string
}

/** Serializable progress for one Nemesis turn. */
export interface NemesisResolutionState extends NemesisDrawContext {
  step: NemesisResolutionStep
  mainQueue: string[]
  mainIndex: number
  activeCardInstanceId?: string
  activeCardId?: string
  activeTrigger?: NemesisEffectTrigger
  /** Supports a draw-triggered ability resolving inside another Nemesis effect. */
  drawnCardContextStack?: NemesisDrawContext[]
  /** The current Main Phase card has been visibly confirmed by the player. */
  mainEffectConfirmed?: boolean
  /** A revealed Attack or depleted Power remains in play until all effects finish. */
  activeCardPendingDiscard?: boolean
  /** An end-of-turn rule marked once-per-turn has already run this turn. */
  endTurnRuleResolved?: boolean
}

export interface GameState {
  scenario: ScenarioConfig
  players: PlayerState[]
  nemesis: NemesisState
  gravehold: GraveholdState
  market: MarketState
  /** Shared public Develop zone; cards here are not part of the supply. */
  developZone?: string[]
  /** Stable identities aligned with the shared Develop zone. */
  developZoneInstanceIds?: string[]
  /** Shared Wave 9 Trinket deck, top card first. */
  trinketDeck?: string[]
  /** Per-copy reveal memory aligned with trinketDeck (top card at index 0). */
  trinketDeckRevealed?: boolean[]
  trinketDeckInstanceIds?: string[]
  /** Stable per-copy IDs and reveal history for decks that can remember known cards. */
  cardInstanceStates?: Record<string, CardInstanceState>
  cardInstanceCounter?: number
  /** Short-lived resolved health changes consumed by the UI feedback layer. */
  healthChangeEvents?: HealthChangeEvent[]
  /** Short-lived charge gains consumed by the Mage control bubble feedback layer. */
  chargeGainEvents?: ChargeGainEvent[]
  /** Setup-time visibility for Mage Swap zones, shared across Mage views. */
  hasSwapZone?: boolean
  /** Setup-time visibility for the shared Develop zone, shared across Mage views. */
  hasDevelopZone?: boolean
  /** Mechanics present in the starting market, preserved even when a pile empties. */
  supplyMechanics?: CardMechanic[]
  /** The player confirmed Oracle of Filth's one-time warning about targeting it with a spell. */
  oracleOfFilthDamageTargetWarningConfirmed?: boolean
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
  /** UI continuation for the mandatory end-of-Main-Phase Corruption sequence. */
  pendingCorruptionEndTurnPlayerId?: PlayerId
  /** UI continuation for Crooked Mask's before-Casting corruption sequence. */
  pendingCorruptionStartPlayerId?: PlayerId
}

export interface HealthChangeEvent {
  kind: 'damage' | 'healing'
  targetId: string
  amount: number
}

export interface ChargeGainEvent {
  playerId: PlayerId
  amount: number
}

/** Runtime identity and public reveal history for one physical card copy. */
export interface CardInstanceState {
  cardId: string
  revealed: boolean
}
