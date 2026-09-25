import {
  GameState, PlayerState, Phase, Direction,
  BreachState, CardChoice, CollectiveCardChoice, CardGainDestination, CardSelectionSource, CardZone,
  DamageTargetRef, DamageTargetScope, LifeTargetRef, LifeTargetScope,
  PendingDecision, PendingDecisionAnswer, PendingEffectResolution, PendingSpellCast,
  CardEffect, CardEffectBlock, CardEffectCondition, CardEffectOption,
  CardEffectTrigger, PlayerTargetRef, PlayerTargetScope, PlayerSelectionRule, PlayerTurnEffects,
  PreppedSpellChoice, BreachChoice, TurnOrderCardChoice, MarketPileChoice, NemesisDifficulty, ScenarioConfig, PlayerId,
  NemesisCardDef, NemesisCardInPlay, NemesisDiscardCost, NemesisEffectTrigger,
  NemesisResolutionState, PendingNemesisDiscard,
} from './types'
import {
  getCard, MAGES, rageborne, resolveMarketCardIds, createTwoPlayerScenario, getNemesisDefinition,
  resolveMageStartingCardId,
} from './data'
import type { MageDef } from './data'
import { getNemesisRules } from './nemesis/registry'
import { leastExpensiveMarketPiles, marketPileChoices } from './nemesis/market'

// ===== Utilities =====

const DIR_ARROW: Record<string, string> = { east: '→', south: '↓', west: '←', north: '↑' }

/** Apply one focus consistently for paid and effect-granted Breach focuses. */
function advanceBreachFocus(breach: BreachState): boolean {
  breach.focusCount++
  breach.focusedThisTurn = true
  if (breach.focusCount < breach.focusToOpen) {
    breach.focusDirection = rotateDirection(breach.focusDirection)
    return false
  }
  breach.opened = true
  return true
}

export function clone<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj))
}

export function shuffle<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!]
  }
  return a
}

function drawFromDeck(deck: string[], discard: string[], count: number): {
  drawn: string[]; newDeck: string[]; newDiscard: string[]
} {
  const drawn: string[] = []
  let d = [...deck]
  let disc = [...discard]

  while (drawn.length < count) {
    if (d.length === 0) {
      if (disc.length === 0) break
      d = [...disc].reverse()
      disc = []
    }
    const card = d.shift()
    if (card) drawn.push(card)
  }
  return { drawn, newDeck: d, newDiscard: disc }
}

// ===== Game Init =====

export function playerIdForMage(mageType: string): PlayerId {
  const mage = MAGES[mageType]
  if (!mage) throw new Error(`Unknown Mage: ${mageType}`)
  return `wave${mage.wave}_${mage.type.toUpperCase()}`
}

function buildScenarioTurnOrder(scenario: ScenarioConfig, playerIds: PlayerId[]): string[] {
  if (
    scenario.id !== 'two_player'
    || scenario.playerCount !== 2
    || scenario.turnOrderDeckSize !== 6
    || scenario.playerTurnOrderCardsPerPlayer !== 2
    || scenario.nemesisTurnOrderCards !== 2
    || playerIds.length !== 2
  ) {
    throw new Error('Only the two-player scenario is currently supported')
  }
  const cards = [
    ...playerIds.flatMap(playerId => Array.from(
      { length: scenario.playerTurnOrderCardsPerPlayer }, () => playerId,
    )),
    ...Array.from({ length: scenario.nemesisTurnOrderCards }, () => 'nemesis' as const),
  ]
  if (cards.length !== scenario.turnOrderDeckSize) {
    throw new Error(`Scenario turn-order configuration must produce ${scenario.turnOrderDeckSize} cards`)
  }
  return shuffle(cards)
}

export function createGame(scenario: ScenarioConfig): GameState
export function createGame(
  mage1Type: string,
  mage2Type: string,
  nemesisDifficulty?: NemesisDifficulty,
  nemesisType?: string,
): GameState
export function createGame(
  scenarioOrMage1: ScenarioConfig | string,
  mage2Type?: string,
  nemesisDifficulty: NemesisDifficulty = 'standard',
  nemesisType = rageborne.type,
): GameState {
  const scenario = typeof scenarioOrMage1 === 'string'
    ? createTwoPlayerScenario([scenarioOrMage1, mage2Type!], nemesisType, nemesisDifficulty)
    : scenarioOrMage1
  const mage1Def = MAGES[scenario.mageTypes[0]]
  const mage2Def = MAGES[scenario.mageTypes[1]]
  const nemesisDef = getNemesisDefinition(scenario.nemesisType)
  if (!mage1Def || !mage2Def) throw new Error('Scenario contains an unknown Mage')
  if (scenario.mageTypes[0] === scenario.mageTypes[1]) {
    throw new Error('This Mage has already been selected by another player')
  }
  if (!nemesisDef) throw new Error(`Unknown Nemesis: ${scenario.nemesisType}`)

  function createPlayer(id: string, def: MageDef): PlayerState {
    return {
      id, mageType: def.type,
      hp: def.hp, maxHp: def.hp,
      deck: def.startDeck.map(cardId => resolveMageStartingCardId(def.wave, cardId)),
      hand: def.startHand.map(cardId => resolveMageStartingCardId(def.wave, cardId)),
      discard: [],
      playedThisTurn: [],
      swapZone: [...(def.swapZone ?? [])],
      developZone: [],
      specificDeck: def.specificDeckShuffled
        ? shuffle(def.specificDeck ?? [])
        : [...(def.specificDeck ?? [])],
      knownSpecificDeckCards: [],
      playerCardsInPlay: [],
      playerCardSupplyTargets: [],
      playerCardPowerTokens: [],
      aetherTokens: 0,
      knowledge: 0,
      doomTokens: def.tracksDoom ? 0 : undefined,
      cardPlayCountsThisTurn: {},
      conditionalAetherEarned: {},
      regularAetherSpent: 0,
      condAetherSpent: {},
      bonusAether: 0,
      breaches: clone(def.breaches),
      charge: 0,
      chargeThreshold: def.chargeThreshold,
      exhausted: false,
      destroyedCards: [],
      turnEffects: {
        nextBreachCostReductions: [],
        usedPreppedEffects: [],
        usedPlayerCardEffects: [],
        usedBreachUpgradeEffects: [],
        prepSpellLimit: 1,
        prepSpellLimitByBreach: {},
      },
    }
  }

  const player1 = createPlayer(playerIdForMage(mage1Def.type), mage1Def)
  const player2 = createPlayer(playerIdForMage(mage2Def.type), mage2Def)

  const marketPiles = resolveMarketCardIds(scenario.marketSetup).map(cardId => {
    const card = getCard(cardId)
    const remaining = card.type === 'gem' ? 7 : 5
    return { cardId, remaining }
  })

  const nemesisDeck = nemesisDef.deckBuilder?.() ?? []
  const strikeDeck = nemesisDef.specificDeckBuilder?.() ?? []
  const turnOrder = buildScenarioTurnOrder(scenario, [player1.id, player2.id])

  const game: GameState = {
    scenario: clone(scenario),
    players: [player1, player2],
    nemesis: {
      definitionId: nemesisDef.type,
      name: nemesisDef.name,
      type: nemesisDef.type,
      hp: nemesisDef.hp, maxHp: nemesisDef.hp,
      difficultyLevel: nemesisDef.difficultyLevel,
      difficulty: scenario.nemesisDifficulty,
      deck: nemesisDeck, discard: [],
      strikeDeck, strikeDiscard: [],
      counters: { ...nemesisDef.startingCounters },
      playArea: [],
      tierAnnounced: [false, false, false],
    },
    gravehold: { hp: 30, maxHp: 30 },
    market: { piles: marketPiles },
    turnOrderDeck: turnOrder, turnOrderDiscard: [],
    currentTurn: '', currentPhase: 'casting' as Phase,
    round: 1, gameOver: false, winner: null, timestamp: 0,
    pendingDecision: null,
    pendingEffect: null,
    pendingNemesisDiscard: null,
    nemesisResolution: null,
    decisionCounter: 0,
    damagePrevention: false,
  }
  getNemesisRules(nemesisDef.rulesModuleId ?? nemesisDef.type)?.setup?.({
    game,
    definition: nemesisDef,
    marketPileChoices,
    createDecision: (prompt, kind, details) =>
      createDecision(game, prompt, kind, details),
  })
  return game
}

// ===== Turn Management =====

export function startTurn(g: GameState): GameState {
  g.damagePrevention = false
  if (g.turnOrderDeck.length === 0) {
    g.turnOrderDeck = buildScenarioTurnOrder(g.scenario, g.players.map(player => player.id))
    g.turnOrderDiscard = []
    g.round++
  }
  const turn = g.turnOrderDeck.shift()!
  g.turnOrderDiscard.push(turn)
  g.currentTurn = turn
  g.timestamp++

  g.currentPhase = turn === 'nemesis' ? 'nemesis_main' : 'casting'
  if (turn === 'nemesis') initializeNemesisTurn(g)
  queueTurnOrderCardDrawnAbilities(g)
  return g
}

function ensureNemesisRuntime(g: GameState): void {
  const n = g.nemesis
  n.strikeDeck ??= []
  n.strikeDiscard ??= []
  n.counters ??= {}
  n.nemesisTurnNumber ??= 0
  n.cardInstanceCounter ??= n.playArea.reduce(
    (highest, card) => Math.max(highest, card.placedAt), 0,
  )
  for (const card of n.playArea) {
    card.instanceId ??= `${card.cardId}:${card.placedAt}`
  }
}

function cardInstanceKey(card: NemesisCardInPlay): string {
  return card.instanceId ?? `${card.cardId}:${card.placedAt}`
}

function initializeNemesisTurn(g: GameState): void {
  ensureNemesisRuntime(g)
  const n = g.nemesis
  n.nemesisTurnNumber = (n.nemesisTurnNumber ?? 0) + 1
  g.nemesisResolution = {
    step: 'main',
    mainQueue: n.playArea.map(cardInstanceKey),
    mainIndex: 0,
  }
}

function activeNemesisCard(
  g: GameState, resolution: NemesisResolutionState,
): NemesisCardInPlay | null {
  const key = resolution.activeCardInstanceId
  if (!key) return null
  return g.nemesis.playArea.find(card => cardInstanceKey(card) === key) ?? null
}

function discardNemesisCard(g: GameState, card: NemesisCardInPlay): void {
  g.nemesis.playArea = g.nemesis.playArea.filter(candidate => candidate !== card)
  g.nemesis.discard.unshift(card.cardId)
}

/** Move a resolved Attack or depleted Power to the Nemesis discard. */
function discardCompletedNemesisCard(g: GameState, resolution: NemesisResolutionState): void {
  if (!resolution.activeCardPendingDiscard) return
  const card = activeNemesisCard(g, resolution)
  if (card?.cardType === 'attack' || card?.cardType === 'power') discardNemesisCard(g, card)
  resolution.activeCardPendingDiscard = undefined
}

function usesDevouredPile(g: GameState): boolean {
  return getNemesisDefinition(g.nemesis.definitionId)?.specificPileKind === 'devoured'
}

function activeNemesisRules(g: GameState) {
  const definition = getNemesisDefinition(g.nemesis.definitionId)
  return getNemesisRules(definition?.rulesModuleId ?? g.nemesis.definitionId)
}

function emptyMarketPileCount(g: GameState): number {
  return g.market.piles.filter(pile => pile.remaining <= 0).length
}

/** Move the requested cards to the Devoured pile, applying its empty-pile rule. */
function devourMarketPile(g: GameState, pileIndex: number, amount: number): string[] {
  const pile = g.market.piles[pileIndex]
  if (!usesDevouredPile(g) || !pile || amount <= 0) return ['No supply pile can be Devoured']
  if (pile.remaining <= 0) return [`${getCard(pile.cardId).name} is empty — Devour does not begin`]

  const devoured = Math.min(amount, pile.remaining)
  pile.remaining -= devoured
  for (let index = 0; index < devoured; index++) g.nemesis.strikeDeck.unshift(pile.cardId)

  const messages = [`Devoured ${devoured} ${getCard(pile.cardId).name} card(s)`]
  const missing = amount - devoured
  if (missing > 0) messages.push(dealDamage(g, { kind: 'gravehold', id: 'gravehold', label: 'Gravehold' }, missing * 2))
  if (!g.gameOver && g.market.piles.every(candidate => candidate.remaining <= 0)) {
    const gameOver = checkGameOver(g)
    if (gameOver) messages.push(gameOver)
  }
  return messages
}

function fixedDevourPile(
  g: GameState,
  pile: Extract<CardEffect, { kind: 'devour_market_cards' }>['pile'],
  cardType?: 'gem' | 'relic' | 'spell',
): MarketPileChoice | null {
  // Fixed-cost Devours skip exhausted supply piles before ranking costs.
  const candidates = marketPileChoices(g, cardType).filter(candidate => candidate.remaining > 0)
  if (pile === 'least_expensive') {
    return leastExpensiveMarketPiles(g, cardType)[0] ?? null
  }
  if (pile === 'most_expensive') {
    return candidates.sort((left, right) => getCard(right.cardId).cost - getCard(left.cardId).cost)[0] ?? null
  }
  if (pile === 'second_most_expensive') {
    return candidates.sort((left, right) => getCard(right.cardId).cost - getCard(left.cardId).cost)[1] ?? null
  }
  return null
}

function nemesisEffectBlocks(
  card: NemesisCardDef, trigger: NemesisEffectTrigger,
): number {
  return card.nemesisEffects?.filter(block => block.trigger === trigger).length ?? 0
}

function resolveNemesisCardEffects(
  g: GameState,
  resolution: NemesisResolutionState,
  card: NemesisCardDef,
  trigger: NemesisEffectTrigger,
): string[] {
  const effects = card.nemesisEffects
    ?.filter(block => block.trigger === trigger)
    .filter(block => conditionMatches(g, undefined, block.condition))
    .flatMap(block => block.effects) ?? []
  if (effects.length === 0) return []
  return runEffectResolution(g, {
    sourceCardId: card.id,
    remainingEffects: [...effects],
    nemesisResume: true,
  })
}

function getNemesisDrawAbilityPlayer(g: GameState, cardType: NemesisCardDef['type']): PlayerState | null {
  if (cardType !== 'attack' && cardType !== 'power') return null
  return g.players.find(player => {
    const def = MAGES[player.mageType]
    if (!def || player.charge < player.chargeThreshold) return false
    if (def.abilityTrigger.kind !== 'nemesis_card_drawn') return false
    return def.abilityTrigger.cardType === 'attack_or_power' || def.abilityTrigger.cardType === cardType
  }) ?? null
}

/**
 * Advance the current Nemesis turn until it completes or a later phase adds a
 * player decision. The progress object is serializable so it can be saved at
 * every step without relying on a call stack.
 */
export function advanceNemesisTurn(g: GameState): string[] {
  if (g.currentTurn !== 'nemesis') return ['It is not the Nemesis turn']
  // A lethal effect must end the Nemesis state machine immediately. This
  // guard also protects callers that try to advance again after a game-over
  // message has already been shown.
  if (g.gameOver) return []
  ensureNemesisRuntime(g)
  if (!g.nemesisResolution) initializeNemesisTurn(g)
  const resolution = g.nemesisResolution!
  const messages: string[] = []

  while (!g.gameOver && !g.pendingDecision && !g.pendingEffect && g.nemesisResolution) {
    if (resolution.step === 'main') {
      // Keep a depleted Power visible while its effect resolution is paused by
      // a player decision. The continuation reaches this point again after the
      // decision and only then moves the card to the Nemesis discard pile.
      discardCompletedNemesisCard(g, resolution)
      const key = resolution.mainQueue[resolution.mainIndex]
      if (!key) {
        resolution.step = 'draw'
        g.currentPhase = 'nemesis_draw'
        messages.push('Nemesis Main Phase complete — entering Draw Phase')
        continue
      }

      const card = g.nemesis.playArea.find(candidate => cardInstanceKey(candidate) === key)
      resolution.mainIndex++
      if (!card) continue
      const definition = getCard(card.cardId) as NemesisCardDef
      if (resolution.activeCardInstanceId !== key) resolution.mainEffectConfirmed = false
      resolution.activeCardInstanceId = key
      resolution.activeCardId = card.cardId

      const enteredThisTurn = card.enteredOnNemesisTurn === g.nemesis.nemesisTurnNumber
      const confirmationTrigger: NemesisEffectTrigger = card.cardType === 'minion'
        ? 'persistent' : 'power_resolved'
      const needsMainConfirmation = !enteredThisTurn && (
        card.cardType === 'minion'
          ? nemesisEffectBlocks(definition, 'persistent') > 0
          : true
      )
      if (needsMainConfirmation && !resolution.mainEffectConfirmed) {
        resolution.activeTrigger = confirmationTrigger
        const decision = createDecision(
          g,
          card.cardType === 'minion'
            ? `Resolve Persistent: ${definition.name}`
            : `Resolve Power: ${definition.name}`,
          'confirm_nemesis_effect',
          { cardId: card.cardId, instanceId: key, trigger: confirmationTrigger },
        )
        const error = setPendingDecision(g, decision)
        if (error) return [error]
        // The queue cursor advances only after the confirmed card has been
        // processed. Restore it while the visible confirmation is pending.
        resolution.mainIndex--
        messages.push(`Waiting to resolve ${definition.name}`)
        return messages
      }
      resolution.mainEffectConfirmed = false
      if (card.cardType === 'minion') {
        if (!enteredThisTurn) {
          resolution.activeTrigger = 'persistent'
          const blockCount = nemesisEffectBlocks(definition, 'persistent')
          messages.push(`Resolving Persistent for ${definition.name}${blockCount ? ` (${blockCount} block(s))` : ''}`)
          messages.push(...resolveNemesisCardEffects(g, resolution, definition, 'persistent'))
          if (g.pendingDecision || g.pendingEffect) return messages
        }
        resolution.activeCardInstanceId = undefined
        resolution.activeCardId = undefined
        resolution.activeTrigger = undefined
        continue
      }

      if (enteredThisTurn) {
        messages.push(`${definition.name} was placed this turn — its Power does not decrease`)
        resolution.activeCardInstanceId = undefined
        resolution.activeCardId = undefined
        resolution.activeTrigger = undefined
        continue
      }

      card.powerTokens = Math.max(0, (card.powerTokens ?? 0) - 1)
      messages.push(`${definition.name} loses 1 Power token (${card.powerTokens} remaining)`)
      if (card.powerTokens > 0) {
        resolution.activeCardInstanceId = undefined
        resolution.activeCardId = undefined
        resolution.activeTrigger = undefined
        continue
      }

      resolution.activeTrigger = 'power_resolved'
      const blockCount = nemesisEffectBlocks(definition, 'power_resolved')
      messages.push(`Power depleted for ${definition.name}${blockCount ? ` — resolving ${blockCount} block(s)` : ''}`)
      resolution.activeCardPendingDiscard = true
      messages.push(...resolveNemesisCardEffects(g, resolution, definition, 'power_resolved'))
      if (g.pendingDecision || g.pendingEffect) return messages
      discardCompletedNemesisCard(g, resolution)
      resolution.activeCardInstanceId = undefined
      resolution.activeCardId = undefined
      resolution.activeTrigger = undefined
      continue
    }

    if (resolution.step === 'draw') {
      g.currentPhase = 'nemesis_draw'
      if (resolution.drawnCardId && resolution.drawnCardProcessed) {
        discardCompletedNemesisCard(g, resolution)
        resolution.drawnCardId = undefined
        resolution.drawnCardProcessed = undefined
        resolution.drawnCardResponseHandled = undefined
        resolution.drawnCardCancelled = undefined
        resolution.drawnCardRevealed = undefined
        resolution.step = 'complete'
        continue
      }
      const cardId = resolution.drawnCardId ?? g.nemesis.deck.shift()
      if (!cardId) {
        messages.push('Nemesis deck is empty — Draw Phase complete')
        resolution.step = 'complete'
        continue
      }
      resolution.drawnCardId = cardId
      const definition = getCard(cardId) as NemesisCardDef
      if (!resolution.drawnCardRevealed) {
        resolution.drawnCardRevealed = true
        const decision = createDecision(
          g,
          `Nemesis drew ${definition.name}`,
          'confirm_nemesis_draw',
          { cardId },
        )
        const error = setPendingDecision(g, decision)
        if (error) return [error]
        messages.push(`Nemesis card revealed: ${definition.name}`)
        return messages
      }
      if (!resolution.drawnCardResponseHandled) {
        resolution.drawnCardResponseHandled = true
        const abilityPlayer = getNemesisDrawAbilityPlayer(g, definition.type)
        if (abilityPlayer) {
          messages.push(`${MAGES[abilityPlayer.mageType]!.abilityName} is available before ${definition.name} resolves`)
          messages.push(...resolveEffects(
            g,
            abilityPlayer.id,
            [{ kind: 'activate_ability', mageId: abilityPlayer.id }],
            `ability:${MAGES[abilityPlayer.mageType]!.abilityName}`,
            0,
            undefined,
            true,
          ))
          if (g.pendingDecision || g.pendingEffect) return messages
          continue
        }
      }
      if (resolution.drawnCardCancelled) {
        resolution.drawnCardProcessed = true
        messages.push(`${definition.name} has no effect and will not enter play`)
        continue
      }
      resolution.drawnCardProcessed = true
      if (definition.type === 'attack') {
        messages.push(`Drew Attack: ${definition.name} — resolve immediately`)
        const counter = (g.nemesis.cardInstanceCounter ?? 0) + 1
        g.nemesis.cardInstanceCounter = counter
        const placed: NemesisCardInPlay = {
          cardId,
          cardType: 'attack',
          placedAt: counter,
          instanceId: `${cardId}:${counter}`,
          enteredOnNemesisTurn: g.nemesis.nemesisTurnNumber,
        }
        g.nemesis.playArea.push(placed)
        resolution.activeCardInstanceId = placed.instanceId
        resolution.activeCardId = cardId
        resolution.activeCardPendingDiscard = true
        const blockCount = nemesisEffectBlocks(definition, 'immediately')
        if (blockCount) messages.push(`Resolving ${blockCount} immediate effect block(s)`)
        messages.push(...resolveNemesisCardEffects(g, resolution, definition, 'immediately'))
        if (g.pendingDecision || g.pendingEffect) return messages
      } else {
        const counter = (g.nemesis.cardInstanceCounter ?? 0) + 1
        g.nemesis.cardInstanceCounter = counter
        const placed: NemesisCardInPlay = {
          cardId,
          cardType: definition.type,
          placedAt: counter,
          instanceId: `${cardId}:${counter}`,
          enteredOnNemesisTurn: g.nemesis.nemesisTurnNumber,
          ...(definition.type === 'minion'
            ? { lifeTokens: definition.life ?? 0 }
            : { powerTokens: definition.power ?? 0 }),
        }
        g.nemesis.playArea.push(placed)
        messages.push(`Drew ${definition.type === 'minion' ? 'Minion' : 'Power'}: ${definition.name} — placed in play`)
        const blockCount = nemesisEffectBlocks(definition, 'immediately')
        if (blockCount) messages.push(`Resolving ${blockCount} immediate effect block(s)`)
        messages.push(...resolveNemesisCardEffects(g, resolution, definition, 'immediately'))
        if (g.pendingDecision || g.pendingEffect) return messages
      }
      continue
    }

    g.currentPhase = 'nemesis_draw'
    const nemesisDefinition = getNemesisDefinition(g.nemesis.definitionId)
    const endTurnRule = activeNemesisRules(g)?.endTurn
    if (nemesisDefinition && endTurnRule?.shouldResolve(g, nemesisDefinition)) {
      messages.push(endTurnRule.message)
      messages.push(...resolveEffects(
        g,
        undefined,
        endTurnRule.effects,
        endTurnRule.sourceCardId,
        0,
        undefined,
        true,
      ))
      if (g.pendingDecision || g.pendingEffect) return messages
      continue
    }
    g.nemesisResolution = null
    messages.push('Nemesis turn complete')
  }
  return messages
}

export function resolveNemesisMainPhase(g: GameState): string[] {
  if (g.currentTurn !== 'nemesis') return ['It is not the Nemesis turn']
  ensureNemesisRuntime(g)
  if (!g.nemesisResolution) initializeNemesisTurn(g)
  g.nemesisResolution!.step = 'main'
  g.currentPhase = 'nemesis_main'
  return advanceNemesisTurn(g)
}

export function resolveNemesisDrawPhase(g: GameState): string[] {
  if (g.currentTurn !== 'nemesis') return ['It is not the Nemesis turn']
  ensureNemesisRuntime(g)
  if (!g.nemesisResolution) initializeNemesisTurn(g)
  g.nemesisResolution!.step = 'draw'
  g.currentPhase = 'nemesis_draw'
  return advanceNemesisTurn(g)
}

export interface NemesisDiscardAction {
  instanceId: string
  cardId: string
  cardName: string
  costs: NemesisDiscardCost[]
}

function nemesisCardByInstance(g: GameState, instanceId: string): NemesisCardInPlay | null {
  ensureNemesisRuntime(g)
  return g.nemesis.playArea.find(card => cardInstanceKey(card) === instanceId) ?? null
}

function costIsCurrentlyPayable(g: GameState, playerId: string, cost: NemesisDiscardCost): boolean {
  const player = getPlayer(g, playerId)
  if (cost.kind === 'spend_aether') return getSpendableAether(player, 'general') >= Math.max(0, cost.amount)
  if (cost.kind === 'lose_charge') return player.charge >= Math.max(0, cost.amount)
  if (cost.kind === 'destroy_prepped_spells') {
    return getPreppedSpellChoices(g)
      .filter(choice => (getPreppedSpellCost(g, choice.playerId, choice.breachIndex, choice.spellIndex) ?? 0) >= (cost.minCost ?? 0)).length >= Math.max(0, cost.amount)
  }
  if (cost.kind === 'discard_cards') return getCardChoices(g, playerId, cost.source).length >= Math.max(0, cost.amount)
  const candidates = getCardChoices(g, playerId, cost.source)
    .filter(choice => getCard(choice.cardId).cost >= (cost.minCost ?? 0))
  return candidates.length >= Math.max(0, cost.amount)
}

function costsAreCurrentlyPayable(g: GameState, playerId: string, costs: NemesisDiscardCost[]): boolean {
  const player = getPlayer(g, playerId)
  let aether = getSpendableAether(player, 'general')
  let charge = player.charge
  for (const cost of costs) {
    if (cost.kind === 'spend_aether') {
      aether -= Math.max(0, cost.amount)
      if (aether < 0) return false
    } else if (cost.kind === 'lose_charge') {
      charge -= Math.max(0, cost.amount)
      if (charge < 0) return false
    } else if (!costIsCurrentlyPayable(g, playerId, cost)) {
      return false
    }
  }
  return true
}

/** Return Power cards that the active player can legally discard this Main Phase. */
export function getNemesisDiscardActions(
  g: GameState, playerId: string, includePending = false,
): NemesisDiscardAction[] {
  if (
    g.currentPhase !== 'main' || g.currentTurn !== playerId || g.pendingDecision || g.pendingEffect ||
    (g.pendingNemesisDiscard && !includePending)
  ) return []
  const actions: NemesisDiscardAction[] = []
  for (const card of g.nemesis.playArea) {
    if (card.cardType !== 'power') continue
    const definition = getCard(card.cardId) as NemesisCardDef
    const costs = definition.toDiscard?.costs ?? []
    if (costs.length === 0 || !costsAreCurrentlyPayable(g, playerId, costs)) continue
    actions.push({
      instanceId: cardInstanceKey(card),
      cardId: card.cardId,
      cardName: definition.name,
      costs: costs.map(cost => ({ ...cost })),
    })
  }
  return actions
}

function finishNemesisDiscard(g: GameState): string[] {
  const pending = g.pendingNemesisDiscard
  if (!pending) return ['No pending To Discard action']
  const action = getNemesisDiscardActions(g, pending.playerId, true)
    .find(candidate => candidate.instanceId === pending.cardInstanceId)
  if (!action) {
    g.pendingNemesisDiscard = null
    return ['The Power card can no longer be discarded']
  }

  const player = getPlayer(g, pending.playerId)
  if (!costsAreCurrentlyPayable(g, pending.playerId, pending.costs)) {
    g.pendingNemesisDiscard = null
    return ['The To Discard cost can no longer be paid']
  }

  const messages: string[] = []
  for (const cost of pending.costs) {
    if (cost.kind === 'spend_aether') {
      spendAether(player, Math.max(0, cost.amount), 'general')
      messages.push(`Spent ${Math.max(0, cost.amount)} Aether to discard ${action.cardName}`)
    } else if (cost.kind === 'lose_charge') {
      player.charge -= Math.max(0, cost.amount)
      messages.push(`${player.mageType} loses ${Math.max(0, cost.amount)} charge to discard ${action.cardName}`)
    }
  }
  if (pending.selectedCards.length > 0) {
    for (const payment of pending.selectedCardPayments) {
      const cost = pending.costs[payment.costIndex]
      const removed = cost?.kind === 'discard_cards'
        ? discardSelectedCards(g, pending.playerId, payment.choices)
        : removeSelectedCards(g, pending.playerId, payment.choices)
      ensurePlayerCollections(player)
      if (cost?.kind !== 'discard_cards') removed.forEach(cardId => destroyOwnedCard(player, cardId))
      const actionWord = cost?.kind === 'discard_cards' ? 'Discarded' : 'Destroyed'
      messages.push(`${actionWord} ${removed.map(id => getCard(id).name).join(', ')} to discard ${action.cardName}`)
    }
  }
  for (const payment of pending.selectedPreppedSpellPayments) {
    const removed: string[] = []
    for (const choice of [...payment.choices].sort((a, b) => b.spellIndex - a.spellIndex)) {
      const owner = getPlayer(g, choice.playerId)
      const breach = owner.breaches.find(item => item.index === choice.breachIndex)
      if (!breach || breach.prepSpells[choice.spellIndex] !== choice.cardId) continue
      breach.prepSpells.splice(choice.spellIndex, 1)
      breach.preppedThisTurn?.splice(choice.spellIndex, 1)
      breach.preppedSpellFaceDown?.splice(choice.spellIndex, 1)
      ensurePlayerCollections(owner)
      destroyOwnedCard(owner, choice.cardId)
      removed.push(choice.cardId)
    }
    messages.push(`Destroyed ${removed.map(id => getCard(id).name).join(', ')} to discard ${action.cardName}`)
  }

  const card = nemesisCardByInstance(g, pending.cardInstanceId)
  if (!card) {
    g.pendingNemesisDiscard = null
    return ['The Power card is no longer in play']
  }
  g.nemesis.playArea = g.nemesis.playArea.filter(candidate => candidate !== card)
  g.nemesis.discard.unshift(card.cardId)
  g.pendingNemesisDiscard = null
  messages.push(`Discarded Power: ${action.cardName}`)
  return messages
}

function continueNemesisDiscard(g: GameState): string[] {
  const pending = g.pendingNemesisDiscard
  if (!pending) return ['No pending To Discard action']
  while (pending.nextCostIndex < pending.costs.length) {
    const cost = pending.costs[pending.nextCostIndex]!
    pending.nextCostIndex++
    if (cost.kind === 'destroy_prepped_spells') {
      const candidates = getPreppedSpellChoices(g)
        .filter(choice => (getPreppedSpellCost(g, choice.playerId, choice.breachIndex, choice.spellIndex) ?? 0) >= (cost.minCost ?? 0))
      const amount = Math.max(0, cost.amount)
      if (candidates.length < amount) {
        g.pendingNemesisDiscard = null
        return ['The To Discard spell requirement is no longer available']
      }
      if (candidates.length === amount) {
        pending.selectedPreppedSpells.push(...candidates)
        pending.selectedPreppedSpellPayments.push({ costIndex: pending.nextCostIndex - 1, choices: candidates })
        continue
      }
      const decision = createDecision(g,
        `Choose ${amount} prepped spell(s) to destroy to discard the Power`,
        'select_prepped_spells',
        { candidates, min: amount, max: amount },
      )
      const error = setPendingDecision(g, decision)
      if (error) return [error]
      return [`Decision required: ${decision.prompt}`]
    }
    if (cost.kind !== 'destroy_cards' && cost.kind !== 'discard_cards') continue

    const candidates = getCardChoices(g, pending.playerId, cost.source)
      .filter(choice => cost.kind === 'discard_cards' || getCard(choice.cardId).cost >= (cost.minCost ?? 0))
    const amount = Math.max(0, cost.amount)
    if (candidates.length < amount) {
      g.pendingNemesisDiscard = null
      return ['The To Discard card requirement is no longer available']
    }
    if (candidates.length === amount) {
      pending.selectedCards.push(...candidates)
      pending.selectedCardPayments.push({ costIndex: pending.nextCostIndex - 1, choices: candidates })
      continue
    }
    const actionPrompt = cost.kind === 'discard_cards'
      ? `Choose ${amount} card(s) to discard the Power`
      : `Choose ${amount} card(s) to destroy to discard the Power`
    const decision = createDecision(g,
      actionPrompt,
      'select_cards',
      { source: cost.source, candidates, min: amount, max: amount, layout: 'simple' },
    )
    const error = setPendingDecision(g, decision)
    if (error) return [error]
    return [`Decision required: ${decision.prompt}`]
  }
  return finishNemesisDiscard(g)
}

/** Begin a Power card's optional To Discard action, pausing for any required card choice. */
export function discardNemesisPower(g: GameState, playerId: string, instanceId: string): string[] {
  if (g.pendingDecision || g.pendingEffect || g.pendingNemesisDiscard) return ['Resolve the pending action first']
  const action = getNemesisDiscardActions(g, playerId).find(candidate => candidate.instanceId === instanceId)
  if (!action) return ['This Power cannot be discarded right now']
  g.pendingNemesisDiscard = {
    playerId,
    cardInstanceId: instanceId,
    costs: action.costs.map(cost => ({ ...cost })),
    nextCostIndex: 0,
    selectedCards: [],
    selectedPreppedSpells: [],
    selectedCardPayments: [],
    selectedPreppedSpellPayments: [],
  }
  return continueNemesisDiscard(g)
}

/** Draw a Strike card, recycling and shuffling the Strike discard when needed. */
export function drawStrikeCard(g: GameState): string | null {
  ensureNemesisRuntime(g)
  if (g.nemesis.strikeDeck.length === 0 && g.nemesis.strikeDiscard.length > 0) {
    g.nemesis.strikeDeck = shuffle(g.nemesis.strikeDiscard)
    g.nemesis.strikeDiscard = []
  }
  return g.nemesis.strikeDeck.shift() ?? null
}

/** Return a resolved Strike to the auxiliary deck and shuffle it back in. */
export function returnStrikeCardToDeck(g: GameState, cardId: string): void {
  ensureNemesisRuntime(g)
  g.nemesis.strikeDeck = shuffle([...g.nemesis.strikeDeck, cardId])
}

export function getPlayer(g: GameState, id: string): PlayerState {
  return g.players.find(p => p.id === id)!
}

/** Queue the optional abilities that trigger immediately after a turn-order draw. */
function queueTurnOrderCardDrawnAbilities(g: GameState): void {
  const candidate = g.players.find(player => {
    const def = MAGES[player.mageType]
    return player.charge >= player.chargeThreshold
      && !!def
      && def.abilityEffects.length > 0
      && def.abilityTrigger.kind === 'turn_order_card_drawn'
  })
  if (!candidate) return
  const def = MAGES[candidate.mageType]!
  resolveEffects(
    g,
    candidate.id,
    [{ kind: 'activate_ability', mageId: candidate.id }],
    `ability:${def.abilityName}`,
  )
}

function pendingActionMessage(g: GameState): string | null {
  return g.pendingDecision ? 'Resolve the pending card decision first' : null
}

function isPresentBreach(breach: PlayerState['breaches'][number]): boolean {
  // Saves created before optional Breach slots were introduced omit `present`.
  return breach.present !== false
}

// ===== Card Zones, Gain, and Destruction =====

function getZoneCards(p: PlayerState, zone: CardZone): string[] {
  if (zone === 'deck') return p.deck
  if (zone === 'hand') return p.hand
  if (zone === 'discard') return p.discard
  if (zone === 'swap_zone') return p.swapZone ?? (p.swapZone = [])
  if (zone === 'specific_deck') return p.specificDeck ?? (p.specificDeck = [])
  return p.playedThisTurn
}

function ensurePlayerCollections(p: PlayerState): void {
  if (!p.destroyedCards) p.destroyedCards = []
  if (!p.swapZone) p.swapZone = []
  if (!p.developZone) p.developZone = []
  if (!p.specificDeck) p.specificDeck = []
  if (!p.knownSpecificDeckCards) p.knownSpecificDeckCards = []
  if (!p.playerCardsInPlay) p.playerCardsInPlay = []
  if (!p.playerCardSupplyTargets) p.playerCardSupplyTargets = []
  if (!p.playerCardPowerTokens) p.playerCardPowerTokens = []
  p.aetherTokens ??= 0
  p.knowledge ??= 0
  if (MAGES[p.mageType]?.tracksDoom) p.doomTokens ??= 0
  while (p.playerCardSupplyTargets.length < p.playerCardsInPlay.length) p.playerCardSupplyTargets.push(null)
  while (p.playerCardPowerTokens.length < p.playerCardsInPlay.length) p.playerCardPowerTokens.push(0)
  if (!p.cardPlayCountsThisTurn) {
    p.cardPlayCountsThisTurn = {}
    for (const cardId of p.playedThisTurn) {
      p.cardPlayCountsThisTurn[cardId] = (p.cardPlayCountsThisTurn[cardId] ?? 0) + 1
    }
  }
  if (!p.conditionalAetherEarned) p.conditionalAetherEarned = {}
  if (!p.turnEffects) {
    p.turnEffects = {
      nextBreachCostReductions: [],
      usedPreppedEffects: [],
      usedPlayerCardEffects: [],
      usedBreachUpgradeEffects: [],
      prepSpellLimit: 1,
      prepSpellLimitByBreach: {},
    }
  }
  p.turnEffects.usedPlayerCardEffects ??= []
  p.turnEffects.usedBreachUpgradeEffects ??= []
  p.turnEffects.prepSpellLimitByBreach ??= {}
  for (const breach of p.breaches) {
    if (!breach.preppedThisTurn || breach.preppedThisTurn.length !== breach.prepSpells.length) {
      breach.preppedThisTurn = breach.prepSpells.map(() => false)
    }
    if (!breach.preppedSpellFaceDown || breach.preppedSpellFaceDown.length !== breach.prepSpells.length) {
      breach.preppedSpellFaceDown = breach.prepSpells.map(() => false)
    }
  }
  p.turnEffects.prepSpellLimit ??= 1
}

export function getPlayerTurnEffects(p: PlayerState): PlayerTurnEffects {
  ensurePlayerCollections(p)
  return p.turnEffects
}

export function getPrepSpellLimit(p: PlayerState, breachIndex: number): number {
  const turnEffects = getPlayerTurnEffects(p)
  const breach = p.breaches.find(item => item.index === breachIndex)
  const permanentLimit = 1 + Math.max(0, breach?.prepSpellLimitBonus ?? 0)
  const turnLimit = turnEffects.prepSpellLimitByBreach?.[breachIndex] ?? turnEffects.prepSpellLimit
  return turnLimit === 'unlimited' ? Number.POSITIVE_INFINITY : Math.max(permanentLimit, turnLimit)
}

export function getCardChoices(
  g: GameState, playerId: string, source: CardSelectionSource,
): CardChoice[] {
  const p = getPlayer(g, playerId)
  const choices: CardChoice[] = []
  const addZone = (zone: CardZone, predicate: (cardId: string) => boolean = () => true) => {
    for (const [index, cardId] of getZoneCards(p, zone).entries()) {
      if (!predicate(cardId)) continue
      choices.push({ zone, index, cardId, cardName: getCard(cardId).name })
    }
  }

  if (source === 'hand') addZone('hand')
  if (source === 'discard') addZone('discard')
  if (source === 'hand_or_discard') {
    addZone('hand')
    addZone('discard')
  }
  if (source === 'played_gem_this_turn') {
    addZone('played_this_turn', cardId => getCard(cardId).type === 'gem')
  }
  if (source === 'swap_zone') addZone('swap_zone')
  if (source === 'specific_deck') addZone('specific_deck')
  return choices
}

function getCollectiveCardChoices(g: GameState, source: 'hand'): CollectiveCardChoice[] {
  return g.players.flatMap(player => getCardChoices(g, player.id, source)
    .map(choice => ({ playerId: player.id, choice })))
}

function selectedCollectiveCardsAreCurrent(
  g: GameState,
  candidates: CollectiveCardChoice[],
  selected: CollectiveCardChoice[],
): boolean {
  const candidateKeys = new Set(candidates.map(item =>
    `${item.playerId}:${item.choice.zone}:${item.choice.index}:${item.choice.cardId}`))
  const selectedKeys = new Set<string>()
  for (const item of selected) {
    const key = `${item.playerId}:${item.choice.zone}:${item.choice.index}:${item.choice.cardId}`
    if (selectedKeys.has(key) || !candidateKeys.has(key)) return false
    const player = getPlayer(g, item.playerId)
    if (getZoneCards(player, item.choice.zone)[item.choice.index] !== item.choice.cardId) return false
    selectedKeys.add(key)
  }
  return true
}

function discardCollectiveCards(g: GameState, selected: CollectiveCardChoice[]): string[] {
  const removed: string[] = []
  const grouped = new Map<string, CollectiveCardChoice[]>()
  for (const item of selected) {
    const group = grouped.get(item.playerId) ?? []
    group.push(item)
    grouped.set(item.playerId, group)
  }
  for (const [playerId, items] of grouped) {
    const player = getPlayer(g, playerId)
    for (const item of [...items].sort((a, b) => b.choice.index - a.choice.index)) {
      const cardId = removeCardFromZone(player, item.choice.zone, item.choice.index)
      if (cardId) {
        player.discard.unshift(cardId)
        removed.push(cardId)
      }
    }
  }
  return removed
}

/** Return every currently prepped spell, including spells belonging to allies. */
export function getPreppedSpellChoices(g: GameState): PreppedSpellChoice[] {
  const choices: PreppedSpellChoice[] = []
  for (const player of g.players) {
    for (const breach of player.breaches) {
      if (!isPresentBreach(breach)) continue
      for (const [spellIndex, cardId] of breach.prepSpells.entries()) {
        choices.push({
          playerId: player.id,
          breachIndex: breach.index,
          spellIndex,
          cardId,
          cardName: getCard(cardId).name,
        })
      }
    }
  }
  return choices
}

function isFaceDownPreppedSpell(breach: PlayerState['breaches'][number], spellIndex: number): boolean {
  return breach.preppedSpellFaceDown?.[spellIndex] === true
}

/** Return the rules cost of a prepared card (Conjure face-down cards cost 2). */
export function getPreppedSpellCost(
  g: GameState, playerId: string, breachIndex: number, spellIndex: number,
): number | null {
  const player = getPlayer(g, playerId)
  const breach = player.breaches.find(item => item.index === breachIndex)
  const cardId = breach?.prepSpells[spellIndex]
  if (!breach || !cardId) return null
  return isFaceDownPreppedSpell(breach, spellIndex) ? 2 : getCard(cardId).cost
}

function getBreachChoices(g: GameState, target: 'self' | 'any_player', playerId: string): BreachChoice[] {
  const players = target === 'self' ? [getPlayer(g, playerId)] : g.players
  return players.flatMap(player => player.breaches
    .filter(breach => isPresentBreach(breach) && !breach.opened && breach.focusCount < breach.focusToOpen)
    .map(breach => ({
      playerId: player.id,
      breachIndex: breach.index,
      playerName: player.mageType,
      focusCost: breach.focusCost,
      focusCount: breach.focusCount,
      focusToOpen: breach.focusToOpen,
    })))
}

/** Return every Breach that can be destroyed as part of a player's exhaustion. */
function getExhaustBreachChoices(g: GameState, playerId: string): BreachChoice[] {
  const player = getPlayer(g, playerId)
  return player.breaches
    .filter(breach => isPresentBreach(breach) && !breach.indestructible)
    .map(breach => ({
      playerId: player.id,
      breachIndex: breach.index,
      playerName: player.mageType,
      focusCost: breach.focusCost,
      focusCount: breach.focusCount,
      focusToOpen: breach.focusToOpen,
    }))
}

function applyFreeBreachFocus(g: GameState, choice: BreachChoice): string {
  const player = getPlayer(g, choice.playerId)
  const breach = player.breaches.find(item => item.index === choice.breachIndex)
  if (!breach || !isPresentBreach(breach) || breach.opened || breach.focusCount >= breach.focusToOpen) {
    return 'The selected breach is no longer available'
  }
  const opened = advanceBreachFocus(breach)
  if (!opened) {
    return `Focused ${player.mageType}'s Breach ${toRoman(breach.index)} (${breach.focusCount}/${breach.focusToOpen})`
  }
  return `${player.mageType}'s Breach ${toRoman(breach.index)} OPENED!`
}

/** Destroy a Breach and move every spell prepared on it to its owner's discard pile. */
function destroyExhaustedBreach(g: GameState, choice: BreachChoice): string {
  const player = getPlayer(g, choice.playerId)
  const breach = player.breaches.find(item => item.index === choice.breachIndex)
  if (!breach || !isPresentBreach(breach) || breach.indestructible) return 'The selected breach is no longer available'

  const prepared = [...breach.prepSpells]
  // Keep all moved cards available in the discard pile. Their exact order is
  // immaterial to the rules, while unshifting preserves the normal discard
  // convention used by the rest of the engine.
  for (const cardId of prepared) player.discard.unshift(cardId)
  breach.prepSpells = []
  breach.preppedThisTurn = []
  breach.preppedSpellFaceDown = []
  breach.present = false
  breach.opened = false
  breach.focusedThisTurn = false
  return prepared.length > 0
    ? `${player.mageType} destroys Breach ${toRoman(breach.index)} and discards ${prepared.length} prepared spell(s)`
    : `${player.mageType} destroys Breach ${toRoman(breach.index)}`
}

/** Move selected prepped spells to their owners' discard piles. */
function discardPreppedSpellChoices(g: GameState, choices: PreppedSpellChoice[]): string[] {
  const discarded: string[] = []
  const ordered = [...choices].sort((a, b) =>
    a.playerId.localeCompare(b.playerId) ||
    a.breachIndex - b.breachIndex ||
    b.spellIndex - a.spellIndex)
  for (const choice of ordered) {
    const owner = getPlayer(g, choice.playerId)
    const breach = owner.breaches.find(item => item.index === choice.breachIndex)
    if (!breach || breach.prepSpells[choice.spellIndex] !== choice.cardId) continue
    breach.prepSpells.splice(choice.spellIndex, 1)
    breach.preppedThisTurn?.splice(choice.spellIndex, 1)
    breach.preppedSpellFaceDown?.splice(choice.spellIndex, 1)
    owner.discard.unshift(choice.cardId)
    discarded.push(choice.cardName)
  }
  return discarded
}

export function removeCardFromZone(
  p: PlayerState, zone: CardZone, index: number,
): string | null {
  const cards = getZoneCards(p, zone)
  if (index < 0 || index >= cards.length) return null
  return cards.splice(index, 1)[0] ?? null
}

/** Apply a card's replacement destination when it is destroyed. */
function destroyOwnedCard(p: PlayerState, cardId: string): void {
  ensurePlayerCollections(p)
  if (getCard(cardId).returnToSwapZoneOnDestroy) {
    p.swapZone!.push(cardId)
    return
  }
  p.destroyedCards.push(cardId)
}

function cardNameMatchesAny(cardId: string, nameIncludes: string[]): boolean {
  const name = getCard(cardId).name
  return nameIncludes.some(fragment => name.includes(fragment))
}

/** Remove the physical card currently resolving so it can enter the Swap zone. */
function removeResolvingCardForSwap(p: PlayerState, cardId: string): string | null {
  const playedIndex = p.playedThisTurn.lastIndexOf(cardId)
  if (playedIndex >= 0) return p.playedThisTurn.splice(playedIndex, 1)[0] ?? null

  // A spell is moved to the top of its discard pile before its on-cast
  // effects resolve, so its current copy is always found here.
  const discardIndex = p.discard.indexOf(cardId)
  if (discardIndex >= 0) return p.discard.splice(discardIndex, 1)[0] ?? null
  return null
}

function gainSwapZoneCard(p: PlayerState, choice: CardChoice): string | null {
  const swapZone = p.swapZone ?? (p.swapZone = [])
  if (choice.zone !== 'swap_zone' || swapZone[choice.index] !== choice.cardId) return null
  const cardId = swapZone.splice(choice.index, 1)[0]
  if (!cardId) return null
  p.discard.unshift(cardId)
  return cardId
}

/** Place a Mage-specific card face-up in the Player cards in play area. */
function putPlayerCardIntoPlay(
  g: GameState, playerId: string, cardId: string,
): CardEffect[] {
  const player = getPlayer(g, playerId)
  ensurePlayerCollections(player)
  player.playerCardsInPlay!.push(cardId)
  player.playerCardSupplyTargets!.push(null)
  player.playerCardPowerTokens!.push(0)
  return matchingBlocks(cardId, playerId, g, { kind: 'on_put_into_play' }).flatMap(block => block.effects.map(effect =>
    effect.kind === 'set_next_to_supply_pile' ? { ...effect, cardId } : effect,
  ))
}

function removePlayerCardFromPlay(p: PlayerState, cardId: string): boolean {
  ensurePlayerCollections(p)
  const index = p.playerCardsInPlay!.lastIndexOf(cardId)
  if (index < 0) return false
  p.playerCardsInPlay!.splice(index, 1)
  p.playerCardSupplyTargets?.splice(index, 1)
  p.playerCardPowerTokens?.splice(index, 1)
  return true
}

function findPlayerCardInPlayIndex(
  p: PlayerState, cardId: string, preferredIndex?: number,
): number {
  ensurePlayerCollections(p)
  if (preferredIndex !== undefined && p.playerCardsInPlay![preferredIndex] === cardId) return preferredIndex
  return p.playerCardsInPlay!.lastIndexOf(cardId)
}

function setPlayerCardSupplyTarget(
  g: GameState, playerId: string, cardId: string, pileIndex: number,
): boolean {
  const player = getPlayer(g, playerId)
  const index = findPlayerCardInPlayIndex(player, cardId)
  if (index < 0) return false
  player.playerCardSupplyTargets![index] = pileIndex
  return true
}

function playerCardSupplyTarget(
  p: PlayerState, cardIndex: number,
): number | null {
  ensurePlayerCollections(p)
  return p.playerCardSupplyTargets?.[cardIndex] ?? null
}

function playerCardPowerTokenCount(
  p: PlayerState, cardId: string, preferredIndex?: number,
): number {
  const index = findPlayerCardInPlayIndex(p, cardId, preferredIndex)
  return index < 0 ? 0 : p.playerCardPowerTokens?.[index] ?? 0
}

function collectPlayerCardTriggerEffects(
  g: GameState, trigger: CardEffectTrigger,
): CardEffect[] {
  const effects: CardEffect[] = []
  for (const owner of g.players) {
    ensurePlayerCollections(owner)
    for (const cardId of owner.playerCardsInPlay ?? []) {
      for (const block of matchingBlocks(cardId, owner.id, g, trigger)) {
        effects.push(...block.effects.map(effect =>
          effect.kind === 'gain_power_token'
            ? { ...effect, playerId: owner.id }
            : effect,
        ))
      }
    }
  }
  return effects
}

function collectBreachOpenedEffects(g: GameState): CardEffect[] {
  return collectPlayerCardTriggerEffects(g, { kind: 'on_breach_open' })
}

function resolveBreachOpenedEffects(g: GameState, playerId: string): string[] {
  const effects = collectBreachOpenedEffects(g)
  return effects.length > 0 ? resolveEffects(g, playerId, effects, undefined, 0, playerId) : []
}

function getSupplyPileGainEffects(g: GameState, pileIndex: number): CardEffect[] {
  return g.players.flatMap(owner => {
    ensurePlayerCollections(owner)
    return (owner.playerCardsInPlay ?? []).flatMap((placedCardId, cardIndex) => {
      if (playerCardSupplyTarget(owner, cardIndex) !== pileIndex) return []
      return matchingBlocks(placedCardId, owner.id, g, { kind: 'on_gain_from_supply_pile' })
        .flatMap(block => block.effects)
    })
  })
}

/** Permanently remove a selected card from a player's card zones. */
export function destroyCard(g: GameState, playerId: string, choice: CardChoice): string | null {
  const p = getPlayer(g, playerId)
  ensurePlayerCollections(p)
  const cards = getZoneCards(p, choice.zone)
  if (cards[choice.index] !== choice.cardId) return 'Card selection is no longer valid'

  const cardId = removeCardFromZone(p, choice.zone, choice.index)
  if (!cardId) return 'Card not found'
  destroyOwnedCard(p, cardId)
  return getCard(cardId).returnToSwapZoneOnDestroy
    ? `${getCard(cardId).name} returns to the Swap zone`
    : `Destroyed ${getCard(cardId).name}`
}

/** Gain a card into the requested top-of-pile destination. */
export function gainCard(
  g: GameState,
  playerId: string,
  cardId: string,
  destination: CardGainDestination = 'discard_top',
  marketPileIndex?: number,
  triggerEffects = true,
  specificPile = false,
): string | null {
  if (triggerEffects) {
    const blocked = pendingActionMessage(g)
    if (blocked) return blocked
  }
  const card = getCard(cardId)
  if (!card) return `Unknown card: ${cardId}`

  if (marketPileIndex !== undefined) {
    const pile = g.market.piles[marketPileIndex]
    if (!pile || pile.cardId !== cardId) return 'Invalid market pile'
    if (pile.remaining <= 0) return 'Pile empty'
    pile.remaining--
    if (usesDevouredPile(g) && g.market.piles.every(candidate => candidate.remaining <= 0)) {
      g.gameOver = true
      g.winner = 'nemesis'
    }
  }
  if (specificPile) {
    if (g.nemesis.strikeDeck[0] !== cardId) return 'The top specific-pile card is no longer available'
    g.nemesis.strikeDeck.shift()
  }

  const p = getPlayer(g, playerId)
  if (destination === 'deck_top') p.deck.unshift(cardId)
  else p.discard.unshift(cardId)
  const message = `Gained ${card.name} -> ${destination === 'deck_top' ? 'deck' : 'discard pile'}`
  if (!triggerEffects) return message
  const effectMessages = resolveCardEffects(g, playerId, cardId, { kind: 'on_gain' }, cardId)
  if (marketPileIndex !== undefined) {
    const placedEffects = getSupplyPileGainEffects(g, marketPileIndex)
    if (placedEffects.length > 0) {
      if (g.pendingEffect) {
        g.pendingEffect.remainingEffects.push(...placedEffects)
      } else {
        effectMessages.push(...resolveEffects(
          g, playerId, placedEffects, cardId, 0, playerId, false, undefined, cardId,
        ))
      }
    }
  }
  return [...[message], ...effectMessages].join('; ')
}

// ===== Pending Decisions and Targets =====

export function nextPendingDecisionId(g: GameState): string {
  g.decisionCounter = (g.decisionCounter ?? 0) + 1
  return `decision-${g.decisionCounter}`
}

export function setPendingDecision(g: GameState, decision: PendingDecision): string | null {
  if (g.pendingDecision) return 'Another decision is already pending'
  g.pendingDecision = decision
  return null
}

export function clearPendingDecision(g: GameState): PendingDecision | null {
  const decision = g.pendingDecision
  g.pendingDecision = null
  return decision
}

export function getLifeTargets(
  g: GameState, sourcePlayerId: string, scope: LifeTargetScope,
): LifeTargetRef[] {
  if (scope === 'nemesis') return [{ kind: 'nemesis' }]
  if (scope === 'gravehold') return [{ kind: 'gravehold' }]
  if (scope === 'self') {
    const player = getPlayer(g, sourcePlayerId)
    return player.exhausted ? [] : [{ kind: 'player', playerId: sourcePlayerId }]
  }
  if (scope === 'ally') {
    return g.players
      .filter(player => player.id !== sourcePlayerId && !player.exhausted)
      .map(player => ({ kind: 'player', playerId: player.id }))
  }
  return g.players
    .filter(player => !player.exhausted)
    .map(player => ({ kind: 'player', playerId: player.id }))
}

export function getPlayerTargets(
  g: GameState, sourcePlayerId: string, scope: PlayerTargetScope,
): PlayerTargetRef[] {
  if (scope === 'self') return [{ kind: 'player', playerId: sourcePlayerId }]
  if (scope === 'ally') {
    return g.players
      .filter(player => player.id !== sourcePlayerId)
      .map(player => ({ kind: 'player', playerId: player.id }))
  }
  return g.players.map(player => ({ kind: 'player', playerId: player.id }))
}

function getSelectedPlayerTargets(
  g: GameState,
  sourcePlayerId: string,
  scope: PlayerTargetScope,
  selection?: PlayerSelectionRule,
): PlayerTargetRef[] {
  let targets = getPlayerTargets(g, sourcePlayerId, scope)
  if (!selection || targets.length === 0) return targets
  // Effects that choose the player with the lowest life never target an
  // exhausted Mage; explicit damage targets may still affect one.
  if (selection === 'lowest_hp') targets = targets.filter(target => !getPlayer(g, target.playerId).exhausted)
  if (targets.length === 0) return []
  const values = targets.map(target => {
    const player = getPlayer(g, target.playerId)
    if (selection === 'most_prepped_spells') {
      return player.breaches.reduce((sum, breach) => sum + breach.prepSpells.length, 0)
    }
    if (selection === 'lowest_hp') return -player.hp
    if (selection === 'most_charges') return player.charge
    return player.breaches.filter(breach => isPresentBreach(breach) && breach.opened).length
  })
  const best = Math.max(...values)
  return targets.filter((_, index) => values[index] === best)
}

function getDoomOwner(g: GameState): PlayerState | undefined {
  return g.players.find(player => MAGES[player.mageType]?.tracksDoom)
}

function getSelectedDamagePlayerTargets(
  g: GameState,
  sourcePlayerId: string,
  scope: PlayerTargetScope | 'doom_owner',
  selection?: PlayerSelectionRule,
): PlayerTargetRef[] {
  if (scope === 'doom_owner') {
    const player = getDoomOwner(g)
    return player ? [{ kind: 'player', playerId: player.id }] : []
  }
  return getSelectedPlayerTargets(g, sourcePlayerId, scope, selection)
}

export function gainLife(g: GameState, target: LifeTargetRef, amount: number): string | null {
  const value = Math.max(0, amount)
  if (target.kind === 'player') {
    const p = getPlayer(g, target.playerId)
    if (!p) return 'Invalid life target'
    if (p.exhausted) return `${p.mageType} cannot gain life while exhausted`
    const before = p.hp
    p.hp = Math.min(p.maxHp, before + value)
    return `${p.mageType} gains ${p.hp - before} life (${p.hp}/${p.maxHp})`
  }

  if (target.kind === 'nemesis') {
    const before = g.nemesis.hp
    g.nemesis.hp = Math.min(g.nemesis.maxHp, before + value)
    return `Nemesis gains ${g.nemesis.hp - before} life (${g.nemesis.hp}/${g.nemesis.maxHp})`
  }

  const before = g.gravehold.hp
  g.gravehold.hp = Math.min(g.gravehold.maxHp, before + value)
  return `Gravehold gains ${g.gravehold.hp - before} life (${g.gravehold.hp}/${g.gravehold.maxHp})`
}

export function getDamageTargets(g: GameState, scope: DamageTargetScope, sourceCardId?: string): DamageTargetRef[] {
  const targets: DamageTargetRef[] = []
  if (scope === 'nemesis' || scope === 'nemesis_or_minion') {
    targets.push({ kind: 'nemesis', id: 'nemesis', label: 'Nemesis' })
  }
  if (scope === 'minion' || scope === 'nemesis_or_minion' || scope === 'source_minion') {
    for (const minion of g.nemesis.playArea) {
      if (minion.cardType !== 'minion') continue
      if (scope === 'source_minion' && (!sourceCardId || minion.cardId !== sourceCardId)) continue
      targets.push({
        kind: 'minion',
        id: `minion:${minion.placedAt}`,
        placedAt: minion.placedAt,
        cardId: minion.cardId,
        label: getCard(minion.cardId).name,
      })
    }
  }
  if (scope === 'gravehold') {
    targets.push({ kind: 'gravehold', id: 'gravehold', label: 'Gravehold' })
  }
  return targets
}

// ===== Card Effect Resolution =====

function amountValue(
  g: GameState,
  playerId: string,
  amount: Extract<CardEffect, { kind: 'deal_damage' }>['amount'],
  sourceCardId?: string,
  resolution?: PendingEffectResolution,
): number {
  if (typeof amount === 'number') return Math.max(0, amount)
  if (amount.kind === 'per_open_breach') {
    const openBreaches = getPlayer(g, playerId).breaches.filter(b => isPresentBreach(b) && b.opened).length
    return Math.max(0, amount.base + openBreaches * amount.amountPerBreach)
  }
  if (amount.kind === 'per_nemesis_counter') {
    const counter = g.nemesis.counters[amount.counter] ?? 0
    return Math.max(0, amount.base + counter * amount.amountPerCounter)
  }
  if (amount.kind === 'per_prepped_spell') {
    const prepped = getPlayer(g, playerId).breaches
      .reduce((sum, breach) => sum + breach.prepSpells.length, 0)
    return Math.max(0, amount.base + prepped * amount.amountPerSpell)
  }
  if (amount.kind === 'per_adjacent_prepped_spell') {
    const cast = resolution?.pendingSpellCast
    const owner = getPlayer(g, cast?.playerId ?? playerId)
    const breachIndex = cast?.breachIndex ?? 0
    const adjacent = owner.breaches.filter(breach =>
      isPresentBreach(breach) && Math.abs(breach.index - breachIndex) === 1,
    )
    const count = adjacent.reduce((sum, breach) => sum + breach.prepSpells.length, 0)
    return Math.max(0, amount.base + count * amount.amountPerSpell)
  }
  if (amount.kind === 'per_empty_market_pile') {
    return Math.max(0, amount.base + emptyMarketPileCount(g) * amount.amountPerPile)
  }
  if (amount.kind === 'last_selection_cost') {
    return Math.max(0, resolution?.lastSelectedCardCost ?? 0)
  }
  const minion = g.nemesis.playArea.find(card =>
    card.cardType === 'minion' && (!sourceCardId || card.cardId === sourceCardId),
  )
  return Math.max(0, minion?.lifeTokens ?? 0)
}

/** Resolve the amount of one damage instance, including conditional bonuses. */
function damageAmountValue(
  g: GameState,
  playerId: string,
  effect: Extract<CardEffect, { kind: 'deal_damage' }>,
  sourceCardId?: string,
  resolution?: PendingEffectResolution,
): number {
  let amount = amountValue(g, playerId, effect.amount, sourceCardId, resolution)
  for (const bonus of effect.additionalDamage ?? []) {
    if (conditionMatches(g, playerId, bonus.condition, resolution)) {
      amount += amountValue(g, playerId, bonus.amount, sourceCardId, resolution)
    }
  }
  return Math.max(0, amount)
}

function hasDeferredAdditionalDamage(
  effect: Extract<CardEffect, { kind: 'deal_damage' }>,
): boolean {
  return (effect.additionalDamage ?? []).some(bonus =>
    (typeof bonus.amount !== 'number' && bonus.amount.kind === 'last_selection_cost') ||
    bonus.condition?.kind === 'last_optional_accepted')
}

function spellBreachDamageBonus(breach: PlayerState['breaches'][number]): number {
  return isPresentBreach(breach) && breach.opened ? Math.max(0, breach.damageBonus) : 0
}

function applySpellDamageBonus(resolution: PendingEffectResolution, amount: number): number {
  const breachBonus = resolution.spellDamageBonus ?? 0
  const additionalBonus = resolution.spellAdditionalDamageBonus ?? 0
  if (additionalBonus > 0) {
    // An external "additional damage" effect (for example Blasting Staff's
    // +2) modifies only the first damage instance of the cast. The Breach III/
    // IV bonus remains per damage instance, as required by the Breach rules.
    resolution.spellAdditionalDamageBonus = 0
  }
  return amount + breachBonus + additionalBonus
}

interface SpellDamagePreviewBounds {
  minAmount: number
  maxAmount: number
  minInstances: number
  maxInstances: number
}

/** Damage range shown by the UI when a spell's final amount is not yet known. */
export interface SpellDamagePreviewRange {
  min: number
  max: number
}

type PreviewConditionState = 'true' | 'false' | 'unknown'

function exactSpellDamagePreview(amount: number, instances = 1): SpellDamagePreviewBounds {
  return {
    minAmount: amount,
    maxAmount: amount,
    minInstances: instances,
    maxInstances: instances,
  }
}

function addSpellDamagePreview(total: SpellDamagePreviewBounds, next: SpellDamagePreviewBounds): SpellDamagePreviewBounds {
  return {
    minAmount: total.minAmount + next.minAmount,
    maxAmount: total.maxAmount + next.maxAmount,
    minInstances: total.minInstances + next.minInstances,
    maxInstances: total.maxInstances + next.maxInstances,
  }
}

function unionSpellDamagePreviews(options: Array<SpellDamagePreviewBounds | null>): SpellDamagePreviewBounds | null {
  // A possible branch that cannot be evaluated must not be silently omitted;
  // otherwise the badge could claim a range that excludes a real outcome.
  if (options.some(option => option === null)) return null
  const available = options.filter((option): option is SpellDamagePreviewBounds => option !== null)
  if (available.length === 0) return null
  return {
    minAmount: Math.min(...available.map(option => option.minAmount)),
    maxAmount: Math.max(...available.map(option => option.maxAmount)),
    minInstances: Math.min(...available.map(option => option.minInstances)),
    maxInstances: Math.max(...available.map(option => option.maxInstances)),
  }
}

function previewAmountRange(
  g: GameState,
  playerId: string,
  amount: Extract<CardEffect, { kind: 'deal_damage' }>['amount'],
  sourceCardId?: string,
  resolution?: PendingEffectResolution,
): { min: number; max: number } {
  if (typeof amount === 'number') return { min: Math.max(0, amount), max: Math.max(0, amount) }
  // Selection-dependent amounts are not knowable before the selection. Keep
  // them out of the guaranteed preview; once the resolution has a selection,
  // amountValue supplies the exact value.
  if (amount.kind === 'last_selection_cost' && resolution?.lastSelectedCardCost === undefined) {
    return { min: 0, max: 0 }
  }
  const value = amountValue(g, playerId, amount, sourceCardId, resolution)
  return { min: value, max: value }
}

function previewConditionState(
  g: GameState,
  playerId: string,
  condition: CardEffectCondition | undefined,
  resolution?: PendingEffectResolution,
): PreviewConditionState {
  if (!condition) return 'true'
  if (condition.kind === 'last_selection_nonempty') {
    if (resolution?.lastSelectedCardCount === undefined) return 'unknown'
    return resolution.lastSelectedCardCount > 0 ? 'true' : 'false'
  }
  if (condition.kind === 'last_optional_accepted') {
    if (resolution?.lastOptionalAccepted === undefined) return 'unknown'
    return resolution.lastOptionalAccepted ? 'true' : 'false'
  }
  return conditionMatches(g, playerId, condition, resolution) ? 'true' : 'false'
}

function previewDamageEffect(
  g: GameState,
  playerId: string,
  effect: Extract<CardEffect, { kind: 'deal_damage' }>,
  sourceCardId?: string,
  resolution?: PendingEffectResolution,
): SpellDamagePreviewBounds {
  const amount = previewAmountRange(g, playerId, effect.amount, sourceCardId, resolution)
  let minAmount = amount.min
  let maxAmount = amount.max
  for (const bonus of effect.additionalDamage ?? []) {
    const state = previewConditionState(g, playerId, bonus.condition, resolution)
    const bonusAmount = previewAmountRange(g, playerId, bonus.amount, sourceCardId, resolution)
    if (state === 'true') {
      minAmount += bonusAmount.min
      maxAmount += bonusAmount.max
    } else if (state === 'unknown') {
      // The base damage is guaranteed, while the conditional bonus is only a
      // possible outcome until the preceding choice/reveal has resolved.
      maxAmount += bonusAmount.max
    }
  }
  return {
    minAmount,
    maxAmount,
    minInstances: 1,
    maxInstances: 1,
  }
}

interface SpellDamagePreviewOptions {
  /** A turn-order card is known only after its reveal decision has opened it. */
  knownTurnOrderCard?: string
}

function previewSpellDamageEffects(
  g: GameState,
  playerId: string,
  effects: CardEffect[],
  sourceCardId?: string,
  resolution?: PendingEffectResolution,
  options: SpellDamagePreviewOptions = {},
): SpellDamagePreviewBounds | null {
  let preview: SpellDamagePreviewBounds = exactSpellDamagePreview(0, 0)
  for (const effect of effects) {
    if (effect.kind === 'deal_damage') {
      preview = addSpellDamagePreview(preview, previewDamageEffect(g, playerId, effect, sourceCardId, resolution))
      continue
    }

    if (effect.kind === 'conditional') {
      const state = previewConditionState(g, playerId, effect.condition, resolution)
      if (state === 'false') continue
      const conditionalPreview = previewSpellDamageEffects(g, playerId, effect.effects, sourceCardId, resolution, options)
      if (!conditionalPreview) return null
      if (state === 'true') {
        preview = addSpellDamagePreview(preview, conditionalPreview)
      } else if (state === 'unknown') {
        preview = addSpellDamagePreview(preview, unionSpellDamagePreviews([
          exactSpellDamagePreview(0, 0), conditionalPreview,
        ])!)
      }
      continue
    }

    if (effect.kind === 'reveal_turn_order_card') {
      const top = g.turnOrderDeck[0]
      if (!top) return null
      const known = options.knownTurnOrderCard === top
      const branches = known
        ? [top === 'nemesis' ? effect.nemesisEffects : effect.playerEffects]
        : [effect.nemesisEffects, effect.playerEffects]
      const branchPreviews = branches.map(branch =>
        previewSpellDamageEffects(g, playerId, branch, sourceCardId, resolution, options))
      const branchPreview = known
        ? branchPreviews[0]
        : unionSpellDamagePreviews(branchPreviews)
      if (!branchPreview) return null
      preview = addSpellDamagePreview(preview, branchPreview)
      continue
    }
    if (effect.kind === 'choose_one') {
      const possible = effect.options.filter(option =>
        previewConditionState(g, playerId, option.condition, resolution) !== 'false')
      const optionPreviews = possible.map(option =>
        previewSpellDamageEffects(g, playerId, option.effects, sourceCardId, resolution, options))
      const chosenPreview = unionSpellDamagePreviews(optionPreviews)
      if (!chosenPreview) return null
      preview = addSpellDamagePreview(preview, chosenPreview)
    }
    // Optional effects are intentionally excluded: their damage is not guaranteed.
  }
  return preview
}

function getSpellDamagePreviewBounds(
  g: GameState, casterPlayerId: string, spellOwnerPlayerId: string,
  breachIndex: number, spellIndex = 0, options: SpellDamagePreviewOptions = {},
): SpellDamagePreviewBounds | null {
  const owner = getPlayer(g, spellOwnerPlayerId)
  const breach = owner.breaches.find(item => item.index === breachIndex)
  if (!breach || !isPresentBreach(breach)) return null
  const cardId = breach.prepSpells[spellIndex]
  if (!cardId) return null
  const faceDown = isFaceDownPreppedSpell(breach, spellIndex)
  const preview = faceDown
    ? { minAmount: 2, maxAmount: 2, minInstances: 1, maxInstances: 1 }
    : getCard(cardId).type !== 'spell' ? null
      : previewSpellDamageEffects(
        g, casterPlayerId,
        matchingBlocks(cardId, casterPlayerId, g, { kind: 'on_cast' }).flatMap(block => block.effects),
        cardId, undefined, options,
      )
  if (!preview) return null
  const breachBonus = spellBreachDamageBonus(breach)
  return {
    minAmount: preview.minAmount + preview.minInstances * breachBonus,
    maxAmount: preview.maxAmount + preview.maxInstances * breachBonus,
    minInstances: preview.minInstances,
    maxInstances: preview.maxInstances,
  }
}

/** Return the possible damage range shown while a prepped spell waits for its target. */
export function getSpellDamagePreviewRange(
  g: GameState, casterPlayerId: string, spellOwnerPlayerId: string,
  breachIndex: number, spellIndex = 0,
): SpellDamagePreviewRange | null {
  const owner = getPlayer(g, spellOwnerPlayerId)
  const breach = owner.breaches.find(item => item.index === breachIndex)
  const cardId = breach?.prepSpells[spellIndex]
  const decision = g.pendingDecision
  const activePendingSpell = g.pendingEffect?.pendingSpellCast?.cardId === cardId
  const knownTurnOrderCard = cardId && decision?.kind === 'confirm_turn_order_reveal'
    && decision.context?.sourceCardId === cardId
    ? decision.cardId
    : activePendingSpell && decision?.kind !== 'confirm_turn_order_reveal'
      ? g.turnOrderDeck[0]
      : undefined
  const preview = getSpellDamagePreviewBounds(
    g, casterPlayerId, spellOwnerPlayerId, breachIndex, spellIndex,
    { knownTurnOrderCard },
  )
  if (!preview || preview.maxAmount <= 0) return null
  return { min: preview.minAmount, max: preview.maxAmount }
}

/** Return the guaranteed damage value for callers that need a single number. */
export function getSpellDamagePreview(
  g: GameState, casterPlayerId: string, spellOwnerPlayerId: string,
  breachIndex: number, spellIndex = 0,
): number | null {
  const preview = getSpellDamagePreviewBounds(
    g, casterPlayerId, spellOwnerPlayerId, breachIndex, spellIndex,
    // This legacy helper is intentionally exact for known engine callers.
    { knownTurnOrderCard: g.turnOrderDeck[0] },
  )
  if (!preview || preview.maxAmount <= 0) return null
  return preview.minAmount
}

function effectPlayerId(g: GameState, resolution: PendingEffectResolution): string {
  // Nemesis effects have no Mage source. Keep a deterministic effect context
  // for legacy self-targeted card text without treating it as decision access.
  return resolution.effectPlayerId ?? resolution.sourcePlayerId ?? g.players[0]?.id ?? ''
}

function conditionMatches(
  g: GameState,
  playerId: string | undefined,
  condition?: CardEffectCondition,
  resolution?: PendingEffectResolution,
  sourceCardId?: string,
  sourceCardIndex?: number,
  sourcePlayerId?: string,
): boolean {
  if (!condition) return true
  if (condition.kind === 'last_selection_nonempty') return (resolution?.lastSelectedCardCount ?? 0) > 0
  if (condition.kind === 'last_optional_accepted') return resolution?.lastOptionalAccepted === true
  if (condition.kind === 'nemesis_turn_order_discard_count') {
    const value = g.turnOrderDiscard.filter(cardId => cardId === 'nemesis').length
    return condition.comparison === 'equals' ? value === condition.count : value >= condition.count
  }
  if (condition.kind === 'has_player_turn_order_card') {
    return Boolean(playerId && g.turnOrderDiscard.some(cardId => cardId === playerId))
  }
  if (condition.kind === 'has_doom') {
    return (getDoomOwner(g)?.doomTokens ?? 0) >= Math.max(0, condition.amount)
  }
  if (!playerId) return false
  const p = getPlayer(g, playerId)
  if (condition.kind === 'has_unopened_breach') {
    return p.breaches.some(breach => isPresentBreach(breach) && !breach.opened)
  }
  if (condition.kind === 'all_breaches_opened') {
    const present = p.breaches.filter(isPresentBreach)
    return present.length > 0 && present.every(breach => breach.opened)
  }
  if (condition.kind === 'has_charge') return p.charge >= Math.max(0, condition.amount)
  if (condition.kind === 'has_knowledge') {
    const targetId = condition.player === 'source'
      ? resolution?.sourcePlayerId ?? sourcePlayerId ?? playerId
      : playerId
    return (getPlayer(g, targetId).knowledge ?? 0) >= Math.max(0, condition.amount)
  }
  if (condition.kind === 'has_aether') return getSpendableAether(p, 'general') >= Math.max(0, condition.amount)
  if (condition.kind === 'has_card_in_zone') {
    return getZoneCards(p, condition.zone).some(cardId =>
      !condition.cardType || getCard(cardId).type === condition.cardType,
    )
  }
  if (condition.kind === 'has_affordable_card_in_specific_deck') {
    const targetId = condition.player === 'source'
      ? resolution?.sourcePlayerId ?? sourcePlayerId ?? playerId
      : playerId
    const target = getPlayer(g, targetId)
    const resource = condition.payment === 'knowledge' ? target.knowledge ?? 0 : 0
    return (target.specificDeck ?? []).some(cardId => {
      const card = getCard(cardId)
      return card.type === condition.cardType && card.cost <= resource
    })
  }
  if (condition.kind === 'has_installed_breach_upgrade') {
    const owner = resolution?.pendingSpellCast
      ? getPlayer(g, resolution.pendingSpellCast.playerId)
      : p
    const breach = owner.breaches.find(item => item.index === condition.breachIndex)
    return (breach?.installedUpgrades?.length ?? 0) > 0
  }
  if (condition.kind === 'has_card_in_hand') {
    return p.hand.some(cardId => getCard(cardId).type === condition.cardType)
  }
  if (condition.kind === 'hand_card_count') {
    const count = p.hand.filter(cardId => {
      const card = getCard(cardId)
      return condition.cardTypes.includes(card.type as 'gem' | 'relic' | 'spell') && card.cost >= condition.minCost
    }).length
    return condition.comparison === 'equals' ? count === condition.count : count >= condition.count
  }
  if (condition.kind === 'set_supply_pile_empty') {
    if (!sourceCardId || sourceCardIndex === undefined) return false
    // The Treasure remains owned by its source player even when another
    // player activates its "during any player's main phase" action.
    const sourceOwner = getPlayer(g, sourcePlayerId ?? playerId)
    const index = findPlayerCardInPlayIndex(sourceOwner, sourceCardId, sourceCardIndex)
    const pileIndex = index < 0 ? null : playerCardSupplyTarget(sourceOwner, index)
    return pileIndex !== null && (g.market.piles[pileIndex]?.remaining ?? 0) <= 0
  }
  let value = 0
  let expected = 0

  if (condition.kind === 'card_play_count_this_turn') {
    ensurePlayerCollections(p)
    value = p.cardPlayCountsThisTurn[condition.cardId] ?? 0
    expected = condition.count
  } else if (condition.kind === 'open_breach_count') {
    value = p.breaches.filter(b => isPresentBreach(b) && b.opened).length
    expected = condition.count
  } else if (condition.kind === 'prepped_spell_count') {
    value = p.breaches
      .filter(isPresentBreach)
      .reduce((sum, breach) => sum + breach.prepSpells.length, 0)
    expected = condition.count
  }

  return condition.comparison === 'equals' ? value === expected : value >= expected
}

function matchingBlocks(
  cardId: string, playerId: string, g: GameState, trigger: CardEffectTrigger,
  sourceCardIndex?: number,
  conditionPlayerId = playerId,
): CardEffectBlock[] {
  return (getCard(cardId).effects ?? []).filter(block => {
    if (block.trigger.kind !== trigger.kind) return false
    if (block.trigger.kind === 'while_prepped' && trigger.kind === 'while_prepped') {
      if (block.trigger.phase !== trigger.phase) return false
    }
    if (block.trigger.kind === 'while_in_play' && trigger.kind === 'while_in_play') {
      if (block.trigger.phase !== trigger.phase) return false
    }
    return conditionMatches(
      g, conditionPlayerId, block.condition, undefined, cardId, sourceCardIndex, playerId,
    )
  })
}

function addRemainingEffects(resolution: PendingEffectResolution, effects: CardEffect[]): void {
  resolution.remainingEffects = [...effects, ...resolution.remainingEffects]
}

/** Queue the complete, ordered exhaustion sequence after a lethal damage hit. */
function queuePlayerExhaustion(
  resolution: PendingEffectResolution,
  playerId: string,
  overflowDamage: number,
): void {
  addRemainingEffects(resolution, [{
    kind: 'exhaust_player',
    playerId,
    overflowDamage: Math.max(0, overflowDamage),
  }])
}

function clearPendingSpellCast(resolution: PendingEffectResolution): void {
  resolution.pendingSpellCast = undefined
}

/** Move a cast spell to its owner's discard before any on-cast effects run.
 * The pending cast metadata remains available while those effects resolve so
 * damage calculations can still identify the original Breach. */
function discardPendingSpellCast(g: GameState, resolution: PendingEffectResolution): void {
  const pending = resolution.pendingSpellCast
  if (!pending || !pending.discard) return

  const owner = getPlayer(g, pending.playerId)
  const breach = owner.breaches.find(item => item.index === pending.breachIndex)
  if (breach?.prepSpells[pending.spellIndex] !== pending.cardId) return

  breach.prepSpells.splice(pending.spellIndex, 1)
  breach.preppedThisTurn?.splice(pending.spellIndex, 1)
  breach.preppedSpellFaceDown?.splice(pending.spellIndex, 1)
  owner.discard.unshift(pending.cardId)
}

function breachOnCastEffects(
  g: GameState,
  breachOwner: PlayerState,
  breach: BreachState,
  casterPlayerId: string,
): CardEffect[] {
  if (!breach.opened) return []

  const effects: CardEffect[] = []
  if (breach.special === 'rift') {
    effects.push({ kind: 'draw_cards', amount: 1, target: 'ally', relativeToSpellCaster: true })
  }
  if (breach.special === 'prototype') {
    effects.push({ kind: 'gain_knowledge', amount: 1, target: 'breach_owner' })
  }

  const activeTurnId = g.currentTurn !== 'nemesis' ? g.currentTurn : casterPlayerId
  const activeTurnPlayer = g.players.find(player => player.id === activeTurnId) ?? breachOwner
  const turnEffects = getPlayerTurnEffects(activeTurnPlayer)
  const upgradeEffects: CardEffect[] = []
  for (const cardId of breach.installedUpgrades ?? []) {
    for (const [blockIndex, block] of (getCard(cardId).effects ?? []).entries()) {
      if (block.trigger.kind !== 'on_cast' ||
        !conditionMatches(g, breachOwner.id, block.condition, undefined, cardId, undefined, casterPlayerId)) continue
      if (block.oncePerTurn) {
        const marker = `${breach.index}:${cardId}:${blockIndex}`
        if (turnEffects.usedBreachUpgradeEffects!.includes(marker)) continue
        turnEffects.usedBreachUpgradeEffects!.push(marker)
      }
      upgradeEffects.push(...block.effects)
    }
  }
  return [...effects, ...upgradeEffects]
}

function cardChoiceMatches(choice: CardChoice, expectedSource: CardSelectionSource): boolean {
  if (expectedSource === 'hand') return choice.zone === 'hand'
  if (expectedSource === 'discard') return choice.zone === 'discard'
  if (expectedSource === 'hand_or_discard') return choice.zone === 'hand' || choice.zone === 'discard'
  if (expectedSource === 'specific_deck') return choice.zone === 'specific_deck'
  return choice.zone === 'played_this_turn'
}

function findOptionalCardSelection(
  effects: CardEffect[],
): Extract<CardEffect, { kind: 'discard_cards' }> | null {
  for (const effect of effects) {
    if (effect.kind === 'discard_cards') return effect
    if (effect.kind === 'conditional' || effect.kind === 'choose_optional') {
      const nested = findOptionalCardSelection(effect.effects)
      if (nested) return nested
    }
    if (effect.kind === 'choose_one') {
      const nested = effect.options
        .map(option => findOptionalCardSelection(option.effects))
        .find(Boolean)
      if (nested) return nested
    }
  }
  return null
}

/** Whether an opt-in effect has at least one card available for its nested selection. */
function optionalCardSelectionAvailable(g: GameState, playerId: string, effects: CardEffect[]): boolean {
  const discard = findOptionalCardSelection(effects)
  if (!discard) return true
  const targets = getSelectedPlayerTargets(g, playerId, discard.target ?? 'self', discard.selection)
  return targets.some(target => getCardChoices(g, target.playerId, discard.source)
    .some(choice => !discard.cardType || getCard(choice.cardId).type === discard.cardType))
}

function selectedChoicesAreCurrent(
  g: GameState, playerId: string, candidates: CardChoice[], selected: CardChoice[],
): boolean {
  const p = getPlayer(g, playerId)
  const candidateKeys = new Set(candidates.map(choice => `${choice.zone}:${choice.index}:${choice.cardId}`))
  const selectedKeys = new Set<string>()
  for (const choice of selected) {
    const key = `${choice.zone}:${choice.index}:${choice.cardId}`
    if (selectedKeys.has(key) || !candidateKeys.has(key)) return false
    if (getZoneCards(p, choice.zone)[choice.index] !== choice.cardId) return false
    selectedKeys.add(key)
  }
  return true
}

function removeSelectedCards(g: GameState, playerId: string, choices: CardChoice[]): string[] {
  const p = getPlayer(g, playerId)
  const valid = choices.filter(choice => {
    const cards = getZoneCards(p, choice.zone)
    return cards[choice.index] === choice.cardId
  })
  const grouped = new Map<CardZone, CardChoice[]>()
  for (const choice of valid) {
    const group = grouped.get(choice.zone) ?? []
    group.push(choice)
    grouped.set(choice.zone, group)
  }
  const removed: string[] = []
  for (const [zone, zoneChoices] of grouped) {
    for (const choice of [...zoneChoices].sort((a, b) => b.index - a.index)) {
      const cardId = removeCardFromZone(p, zone, choice.index)
      if (cardId) removed.push(cardId)
    }
  }
  return removed
}

function discardSelectedCards(g: GameState, playerId: string, choices: CardChoice[]): string[] {
  const removed = removeSelectedCards(g, playerId, choices)
  const p = getPlayer(g, playerId)
  for (const cardId of removed) p.discard.unshift(cardId)
  return removed
}

function returnSelectedCard(g: GameState, playerId: string, choice: CardChoice): string | null {
  const p = getPlayer(g, playerId)
  if (choice.zone !== 'played_this_turn' || p.playedThisTurn[choice.index] !== choice.cardId) {
    return null
  }
  const cardId = removeCardFromZone(p, choice.zone, choice.index)
  if (!cardId) return null
  p.hand.push(cardId)
  return cardId
}

function createDecision(
  g: GameState, prompt: string, kind: PendingDecision['kind'],
  details: Record<string, unknown>,
  sourceCardId?: string,
): PendingDecision {
  return {
    id: nextPendingDecisionId(g),
    prompt,
    context: sourceCardId ? { sourceCardId } : undefined,
    ...details,
    kind,
  } as PendingDecision
}

function pauseEffect(
  g: GameState, resolution: PendingEffectResolution, effect: CardEffect,
  decision: PendingDecision,
): string[] {
  const error = setPendingDecision(g, decision)
  if (error) return [error]
  resolution.awaiting = effect
  g.pendingEffect = resolution
  return [`Decision required: ${decision.prompt}`]
}

function drawCardsForPlayer(g: GameState, playerId: string, amount: number): number {
  const p = getPlayer(g, playerId)
  const result = drawFromDeck(p.deck, p.discard, Math.max(0, amount))
  p.deck = result.newDeck
  p.discard = result.newDiscard
  p.hand.push(...result.drawn)
  return result.drawn.length
}

function getPlayerTurnOrderCards(g: GameState): TurnOrderCardChoice[] {
  return g.turnOrderDiscard
    .map((cardId, index) => ({ cardId, index }))
    .filter(choice => g.players.some(player => player.id === choice.cardId))
}

/** Ensure the turn-order deck has cards available for a reveal effect. */
function replenishTurnOrderDeckForReveal(g: GameState, amount: number): void {
  if (g.turnOrderDeck.length >= amount || g.turnOrderDiscard.length === 0) return

  // A reveal can happen after the final card of a round. Recycle the turn-order
  // discard as a new shuffled deck and clear the bar for the upcoming round.
  const recycled = shuffle(g.turnOrderDiscard)
  g.turnOrderDeck.push(...recycled)
  g.turnOrderDiscard = []
  g.round++
}

function runEffectResolution(
  g: GameState, resolution: PendingEffectResolution,
): string[] {
  const messages: string[] = []
  g.pendingEffect = null
  discardPendingSpellCast(g, resolution)

  // Stop a compound effect as soon as any of its steps ends the game. Without
  // this condition, a lethal Gravehold damage step could fall through to the
  // next Nemesis card or continue resolving later effects in the same frame.
  while (!g.gameOver && resolution.remainingEffects.length > 0) {
    const effect = resolution.remainingEffects.shift()!
    const currentPlayerId = effectPlayerId(g, resolution)
    const p = getPlayer(g, currentPlayerId)

    if (effect.kind === 'confirm_prepped_effect') {
      const decision = createDecision(g,
        effect.prompt,
        'confirm_prepped_effect',
        { cardId: effect.cardId, breachIndex: effect.breachIndex, spellIndex: effect.spellIndex },
        resolution.sourceCardId,
      )
      messages.push(...pauseEffect(g, resolution, effect, decision))
      return messages
    }

    if (effect.kind === 'activate_ability') {
      const target = getPlayer(g, effect.mageId)
      const def = MAGES[target.mageType]
      if (!def || def.abilityEffects.length === 0) {
        messages.push('This ability is not implemented yet')
        continue
      }
      const decision = createDecision(g,
        `Activate ${def.abilityName}?`,
        'choose_optional',
        {
          accept: { id: 'activate', label: 'Activate' },
          skip: { id: 'skip', label: 'Skip' },
        },
        resolution.sourceCardId,
      )
      messages.push(...pauseEffect(g, resolution, effect, decision))
      return messages
    }

    if (effect.kind === 'spend_aether') {
      const amount = Math.max(0, effect.amount)
      const available = getSpendableAether(p, 'general')
      if (available < amount) {
        messages.push(`Need ${amount} Aether, have ${available}`)
      } else {
        spendAether(p, amount, 'general')
        messages.push(`${p.mageType} spends ${amount} Aether`)
      }
      continue
    }

    if (effect.kind === 'conditional') {
      if (conditionMatches(g, currentPlayerId, effect.condition, resolution)) addRemainingEffects(resolution, effect.effects)
      continue
    }

    if (effect.kind === 'focus_breach') {
      let candidates = getBreachChoices(g, effect.target, currentPlayerId)
      if (effect.selection === 'lowest_focus_cost' && candidates.length > 0) {
        const lowest = Math.min(...candidates.map(choice => choice.focusCost))
        candidates = candidates.filter(choice => choice.focusCost === lowest)
      }
      if (candidates.length === 0) {
        messages.push('No eligible closed breach is available')
        continue
      }
      if (candidates.length > 1) {
        const decision = createDecision(g,
          effect.target === 'self' ? 'Choose a closed breach to focus' : 'Choose a player breach to focus',
          'select_breach', { candidates }, resolution.sourceCardId,
        )
        messages.push(...pauseEffect(g, resolution, effect, decision))
        return messages
      }
      const beforeOpened = getPlayer(g, candidates[0]!.playerId).breaches.some(breach =>
        breach.index === candidates[0]!.breachIndex && breach.opened)
      messages.push(applyFreeBreachFocus(g, candidates[0]!))
      if (!beforeOpened && candidates[0]!.playerId && getPlayer(g, candidates[0]!.playerId).breaches
        .some(breach => breach.index === candidates[0]!.breachIndex && breach.opened)) {
        addRemainingEffects(resolution, collectBreachOpenedEffects(g))
      }
      continue
    }

    if (effect.kind === 'focus_breach_all_players') {
      const playerIds = resolution.focusAllPlayerIds ?? g.players.map(player => player.id)
      resolution.focusAllPlayerIds = undefined
      let paused = false
      for (const [index, targetPlayerId] of playerIds.entries()) {
        const candidates = getBreachChoices(g, 'self', targetPlayerId)
        if (candidates.length === 0) continue
        if (candidates.length > 1) {
          resolution.focusAllPlayerIds = playerIds.slice(index + 1)
          const decision = createDecision(g, `${getPlayer(g, targetPlayerId).mageType} chooses a Breach to focus`,
            'select_breach', { candidates }, resolution.sourceCardId)
          messages.push(...pauseEffect(g, resolution, effect, decision))
          paused = true
          break
        }
        const target = getPlayer(g, targetPlayerId).breaches.find(item => item.index === candidates[0]!.breachIndex)
        const wasOpened = target?.opened ?? false
        messages.push(applyFreeBreachFocus(g, candidates[0]!))
        if (!wasOpened && target?.opened) addRemainingEffects(resolution, collectBreachOpenedEffects(g))
      }
      if (paused) return messages
      continue
    }

    if (effect.kind === 'reveal_top_cards') {
      resolution.revealTopPlayerIds ??= g.players.map(player => player.id)
      const playerId = resolution.revealTopPlayerIds.shift()
      if (!playerId) {
        resolution.revealTopPlayerIds = undefined
        resolution.revealedTopCard = undefined
        continue
      }
      const revealedPlayer = getPlayer(g, playerId)
      if (revealedPlayer.deck.length === 0 && revealedPlayer.discard.length > 0) {
        revealedPlayer.deck = [...revealedPlayer.discard].reverse()
        revealedPlayer.discard = []
      }
      const cardId = revealedPlayer.deck[0]
      if (!cardId) {
        addRemainingEffects(resolution, [effect])
        continue
      }
      resolution.revealedTopCard = { playerId, cardId }
      const decision = createDecision(g,
        `${revealedPlayer.mageType} reveals ${getCard(cardId).name}: discard it or return it to the top?`,
        'choose_one',
        { options: [
          { id: 'discard', label: 'Discard the revealed card' },
          { id: 'keep', label: 'Return it to the top of the deck' },
        ] }, resolution.sourceCardId,
      )
      messages.push(...pauseEffect(g, resolution, effect, decision))
      return messages
    }

    if (effect.kind === 'conjure') {
      const owner = getPlayer(g, currentPlayerId)
      if (owner.deck.length === 0 && owner.discard.length > 0) {
        owner.deck = [...owner.discard].reverse()
        owner.discard = []
      }
      const cardId = owner.deck.shift()
      if (!cardId) {
        messages.push('No card is available to Conjure')
        continue
      }
      const candidates: BreachChoice[] = owner.breaches
        .filter(breach => isPresentBreach(breach) && breach.prepSpells.length < getPrepSpellLimit(owner, breach.index) &&
          (breach.opened || breach.focusedThisTurn))
        .map(breach => ({
          playerId: owner.id,
          breachIndex: breach.index,
          playerName: owner.mageType,
          focusCost: breach.focusCost,
          focusCount: breach.focusCount,
          focusToOpen: breach.focusToOpen,
        }))
      if (candidates.length === 0) {
        owner.deck.unshift(cardId)
        messages.push('No eligible Breach is available for Conjure')
        continue
      }
      resolution.conjuredCard = { playerId: owner.id, cardId }
      const decision = createDecision(g,
        `Choose a Breach to Conjure ${getCard(cardId).name} face-down`,
        'select_conjure_breach', { cardId, candidates }, resolution.sourceCardId,
      )
      messages.push(...pauseEffect(g, resolution, effect, decision))
      return messages
    }

    if (effect.kind === 'cast_spell_from_hand') {
      const candidates = getCollectiveCardChoices(g, 'hand')
        .filter(item => item.playerId !== currentPlayerId && getCard(item.choice.cardId).type === 'spell')
      if (candidates.length === 0) {
        messages.push('No spell is available in an ally hand')
        continue
      }
      const decision = createDecision(g, "Choose a spell from an ally's hand to cast twice",
        'select_collective_cards', { candidates, min: 1, max: 1 }, resolution.sourceCardId)
      messages.push(...pauseEffect(g, resolution, effect, decision))
      return messages
    }

    if (effect.kind === 'cast_selected_spell_from_hand') {
      const owner = getPlayer(g, effect.playerId)
      const index = owner.hand.indexOf(effect.cardId)
      if (index < 0 || getCard(effect.cardId).type !== 'spell') {
        messages.push('The selected ally spell is no longer in hand')
        continue
      }
      resolution.pendingSpellCast = {
        playerId: effect.playerId, breachIndex: -1, spellIndex: -1,
        cardId: effect.cardId, discard: false,
      }
      resolution.sourceCardId = effect.cardId
      resolution.effectPlayerId = currentPlayerId
      resolution.spellDamageBonus = 0
      resolution.spellDamageEffectSeen = false
      const castEffects = matchingBlocks(effect.cardId, currentPlayerId, g, { kind: 'on_cast' })
        .flatMap(block => block.effects)
      addRemainingEffects(resolution, [
        ...castEffects,
        { kind: 'resolve_spell_damage_bonus' },
        { kind: 'finalize_spell_cast' },
        ...(effect.remaining > 1 ? [{ kind: 'cast_selected_spell_from_hand', playerId: effect.playerId, cardId: effect.cardId, remaining: effect.remaining - 1 } satisfies CardEffect] : []),
      ])
      messages.push(`Cast ${getCard(effect.cardId).name} from an ally's hand without discarding it`)
      continue
    }

    if (effect.kind === 'gain_nemesis_counter' || effect.kind === 'lose_nemesis_counter') {
      const amount = Math.max(0, effect.amount)
      const before = g.nemesis.counters[effect.counter] ?? 0
      const after = effect.kind === 'gain_nemesis_counter'
        ? before + amount
        : Math.max(0, before - amount)
      g.nemesis.counters[effect.counter] = after
      messages.push(`${g.nemesis.name} ${effect.kind === 'gain_nemesis_counter' ? 'gains' : 'loses'} ${Math.abs(after - before)} ${effect.counter} (${after})`)
      continue
    }

    if (effect.kind === 'unleash') {
      const configured = activeNemesisRules(g)?.unleashEffects
      if (configured && configured.length > 0) {
        // An amount means the Nemesis performs its complete Unleash effect
        // that many times. Repeat the whole configured sequence so non-counter
        // effects (for example Prince of Gluttons' Devour) are not collapsed.
        const count = Math.max(0, effect.amount ?? 1)
        const expanded = Array.from({ length: count }, () => configured).flat()
        addRemainingEffects(resolution, expanded)
      } else {
        const counter = 'unleash'
        const amount = Math.max(0, effect.amount ?? 1)
        g.nemesis.counters[counter] = (g.nemesis.counters[counter] ?? 0) + amount
        messages.push(`${g.nemesis.name} unleashes (${counter}: ${g.nemesis.counters[counter]})`)
      }
      continue
    }

    if (effect.kind === 'exhaust_player') {
      const exhausted = getPlayer(g, effect.playerId)
      // The damage handler marks the Mage exhausted before queueing this
      // continuation. Keep the marker idempotent for loaded/older saves.
      exhausted.exhausted = true
      exhausted.hp = 0
      addRemainingEffects(resolution, [
        { kind: 'unleash', amount: 2 },
        {
          kind: 'destroy_exhausted_breach',
          playerId: effect.playerId,
          overflowDamage: Math.max(0, effect.overflowDamage),
        },
        {
          kind: 'finish_exhaustion',
          playerId: effect.playerId,
          overflowDamage: Math.max(0, effect.overflowDamage),
        },
      ])
      messages.push(`${exhausted.mageType} exhaustion sequence: Nemesis unleashes twice`)
      continue
    }

    if (effect.kind === 'destroy_exhausted_breach') {
      const candidates = getExhaustBreachChoices(g, effect.playerId)
      if (candidates.length === 0) {
        messages.push(`${getPlayer(g, effect.playerId).mageType} has no Breach available to destroy`)
        continue
      }
      if (candidates.length > 1) {
        const decision = createDecision(g,
          'Choose a Breach to destroy for exhaustion',
          'select_exhaust_breach',
          { candidates },
          resolution.sourceCardId,
        )
        messages.push(...pauseEffect(g, resolution, effect, decision))
        return messages
      }
      messages.push(destroyExhaustedBreach(g, candidates[0]!))
      continue
    }

    if (effect.kind === 'finish_exhaustion') {
      const exhausted = getPlayer(g, effect.playerId)
      exhausted.charge = 0
      messages.push(`${exhausted.mageType} charge is reset to 0`)
      const overflow = Math.max(0, effect.overflowDamage)
      if (overflow > 0) {
        messages.push(dealDamage(
          g,
          { kind: 'gravehold', id: 'gravehold', label: 'Gravehold' },
          overflow * 2,
        ))
      }
      const gameOver = checkGameOver(g)
      if (gameOver) {
        messages.push(gameOver)
        resolution.remainingEffects = []
      }
      continue
    }

    if (effect.kind === 'resolve_strike') {
      const strikeId = resolution.revealedStrikeCardId ?? drawStrikeCard(g)
      if (!strikeId) {
        messages.push('No Strike card is available')
        continue
      }
      if (!resolution.revealedStrikeCardId) {
        resolution.revealedStrikeCardId = strikeId
        const decision = createDecision(g,
          `Strike card drawn: ${getCard(strikeId).name}`,
          'confirm_nemesis_draw',
          { cardId: strikeId, source: 'specific_deck' },
          resolution.sourceCardId,
        )
        messages.push(...pauseEffect(g, resolution, effect, decision))
        return messages
      }
      resolution.revealedStrikeCardId = undefined
      const strike = getCard(strikeId)
      messages.push(`Resolve Strike: ${strike.name}`)
      const nemesisDefinition = getNemesisDefinition(g.nemesis.definitionId)
      const strikeAfterResolve = nemesisDefinition
        ? (activeNemesisRules(g)?.strikeAfterResolve?.(g, nemesisDefinition, strikeId)
          ?? [{ kind: 'return_strike_card', cardId: strikeId } as CardEffect])
        : [{ kind: 'return_strike_card', cardId: strikeId } as CardEffect]
      const nextStrike: CardEffect[] = [
        ...(strike.effects?.flatMap(block => block.effects) ?? []),
        ...strikeAfterResolve,
      ]
      const remaining = Math.max(0, (effect.count ?? 1) - 1)
      if (remaining > 0) nextStrike.push({ kind: 'resolve_strike', count: remaining })
      addRemainingEffects(resolution, nextStrike)
      continue
    }

    if (effect.kind === 'return_strike_card') {
      returnStrikeCardToDeck(g, effect.cardId)
      messages.push(`Returned Strike ${getCard(effect.cardId).name} to the Strike deck`)
      continue
    }

    if (effect.kind === 'discard_current_nemesis_card') {
      const resolutionState = g.nemesisResolution
      const cardId = resolutionState?.drawnCardId
      if (!cardId || resolutionState.drawnCardProcessed) {
        messages.push('No Nemesis card is waiting for a pre-resolution response')
        continue
      }
      resolutionState.drawnCardCancelled = true
      // The card was already drawn from the Nemesis deck.  Move it to the
      // discard pile now so cancelling it has the same destination as a
      // normally resolved Attack, without allowing any of its effects to run.
      g.nemesis.discard.unshift(cardId)
      messages.push(`Discarded revealed Nemesis card: ${getCard(cardId).name}`)
      continue
    }

    if (effect.kind === 'gain_aether') {
      const amount = Math.max(0, effect.amount)
      p.bonusAether += amount
      messages.push(`${p.mageType} gains ${amount} Aether`)
      continue
    }

    if (effect.kind === 'gain_knowledge') {
      const recipient = effect.target === 'breach_owner' && resolution.pendingSpellCast
        ? getPlayer(g, resolution.pendingSpellCast.playerId)
        : p
      ensurePlayerCollections(recipient)
      const amount = Math.max(0, effect.amount)
      recipient.knowledge = (recipient.knowledge ?? 0) + amount
      messages.push(`${recipient.mageType} gains ${amount} Knowledge (${recipient.knowledge})`)
      continue
    }

    if (effect.kind === 'lose_knowledge') {
      ensurePlayerCollections(p)
      const amount = Math.min(Math.max(0, effect.amount), p.knowledge ?? 0)
      p.knowledge = (p.knowledge ?? 0) - amount
      messages.push(`${p.mageType} loses ${amount} Knowledge (${p.knowledge})`)
      continue
    }

    if (effect.kind === 'gain_doom') {
      const doomOwner = getDoomOwner(g)
      if (!doomOwner) {
        messages.push('No Mage tracks Doom')
        continue
      }
      ensurePlayerCollections(doomOwner)
      const amount = Math.max(0, Math.floor(effect.amount))
      const before = doomOwner.doomTokens ?? 0
      doomOwner.doomTokens = Math.min(5, before + amount)
      const gained = doomOwner.doomTokens - before
      messages.push(`${doomOwner.mageType} gains ${gained} Doom (${doomOwner.doomTokens})`)
      if (gained > 0 && doomOwner.doomTokens >= 5) {
        addRemainingEffects(resolution, [
          { kind: 'deal_damage_to_each_enemy', amount: 10 },
          { kind: 'deal_player_damage', amount: 10, target: 'doom_owner' },
          { kind: 'lose_doom', amount: 'all' },
        ])
      }
      continue
    }

    if (effect.kind === 'lose_doom') {
      const doomOwner = getDoomOwner(g)
      if (!doomOwner) {
        resolution.lastDoomLost = 0
        messages.push('No Mage tracks Doom')
        continue
      }
      ensurePlayerCollections(doomOwner)
      const current = doomOwner.doomTokens ?? 0
      const amount = effect.amount === 'all'
        ? current
        : Math.min(current, Math.max(0, Math.floor(effect.amount)))
      doomOwner.doomTokens = current - amount
      resolution.lastDoomLost = amount
      messages.push(`${doomOwner.mageType} loses ${amount} Doom (${doomOwner.doomTokens})`)
      continue
    }

    if (effect.kind === 'repeat_effect') {
      const count = Math.max(0, Math.floor(resolution.lastDoomLost ?? 0))
      const repeated = Array.from({ length: count }, () => effect.effects).flat()
      addRemainingEffects(resolution, repeated)
      continue
    }

    if (effect.kind === 'deal_damage_to_each_enemy') {
      const amount = Math.max(0, effect.amount)
      const minions = getDamageTargets(g, 'minion')
      for (const minion of minions) messages.push(dealDamage(g, minion, amount))
      const before = g.nemesis.hp
      damageNemesis(g, amount)
      messages.push(`Nemesis takes ${before - g.nemesis.hp} damage (${g.nemesis.hp}/${g.nemesis.maxHp})`)
      continue
    }

    if (effect.kind === 'install_breach_upgrade') {
      const owner = effect.player === 'source' && resolution.sourcePlayerId
        ? getPlayer(g, resolution.sourcePlayerId)
        : p
      ensurePlayerCollections(owner)
      const breach = owner.breaches.find(item => item.index === effect.breachIndex)
      const candidates = (owner.specificDeck ?? []).flatMap((cardId, index) => {
        const card = getCard(cardId)
        if (card.type !== effect.cardType) return []
        return [{
          zone: 'specific_deck' as const,
          index,
          cardId,
          cardName: card.name,
          disabled: card.cost > (owner.knowledge ?? 0),
        }]
      })
      if (!breach || !isPresentBreach(breach) || candidates.length === 0 || candidates.every(choice => choice.disabled)) {
        messages.push('No affordable Breach Upgrade is available to install')
        continue
      }
      const decision = createDecision(g,
        'Choose a Breach Upgrade to install',
        'select_cards',
        { source: 'specific_deck', candidates, min: 1, max: 1, ownerId: owner.id },
        resolution.sourceCardId,
      )
      messages.push(...pauseEffect(g, resolution,
        { kind: 'select_breach_upgrade_card', breachIndex: effect.breachIndex, ownerId: owner.id },
        decision,
      ))
      return messages
    }

    if (effect.kind === 'install_breach_upgrade_card') {
      const owner = getPlayer(g, effect.ownerId)
      ensurePlayerCollections(owner)
      const cardIndex = (owner.specificDeck ?? []).indexOf(effect.cardId)
      const card = getCard(effect.cardId)
      const breach = owner.breaches.find(item => item.index === effect.breachIndex)
      if (cardIndex < 0 || card.type !== 'breach_upgrade' || !breach || !isPresentBreach(breach) ||
        (owner.knowledge ?? 0) < card.cost) {
        messages.push('The selected Breach Upgrade is no longer available or affordable')
        continue
      }
      owner.knowledge = (owner.knowledge ?? 0) - card.cost
      owner.specificDeck!.splice(cardIndex, 1)
      breach.installedUpgrades ??= []
      breach.installedUpgrades.push(card.id)
      resolution.effectPlayerId = owner.id
      const installationEffects = matchingBlocks(card.id, owner.id, g,
        { kind: 'on_breach_upgrade_installed' }).flatMap(block => block.effects)
      if (installationEffects.length > 0) addRemainingEffects(resolution, installationEffects)
      messages.push(`${owner.mageType} installs ${card.name} on Breach ${toRoman(breach.index)} for ${card.cost} Knowledge`)
      continue
    }

    if (effect.kind === 'increase_breach_prep_limit') {
      const breach = p.breaches.find(item => item.index === effect.breachIndex)
      if (!breach || !isPresentBreach(breach)) {
        messages.push(`Breach ${toRoman(effect.breachIndex)} is unavailable for an upgrade`)
        continue
      }
      breach.prepSpellLimitBonus = (breach.prepSpellLimitBonus ?? 0) + Math.max(0, effect.amount)
      messages.push(`Breach ${toRoman(breach.index)} can hold ${1 + breach.prepSpellLimitBonus} spell(s)`)
      continue
    }

    if (effect.kind === 'increase_breach_damage_bonus') {
      const breach = p.breaches.find(item => item.index === effect.breachIndex)
      if (!breach || !isPresentBreach(breach)) {
        messages.push(`Breach ${toRoman(effect.breachIndex)} is unavailable for an upgrade`)
        continue
      }
      breach.damageBonus += Math.max(0, effect.amount)
      messages.push(`Breach ${toRoman(breach.index)} gains +${Math.max(0, effect.amount)} spell damage`)
      continue
    }

    if (effect.kind === 'gain_aether_token') {
      const targets = getSelectedPlayerTargets(g, currentPlayerId, effect.target ?? 'self')
      if (targets.length === 0) {
        messages.push('No eligible player can gain an Aether token')
        continue
      }
      if (targets.length > 1) {
        const decision = createDecision(g, 'Choose a player to gain an Aether token',
          'select_player_target', { targets }, resolution.sourceCardId)
        messages.push(...pauseEffect(g, resolution, effect, decision))
        return messages
      }
      const target = getPlayer(g, targets[0]!.playerId)
      ensurePlayerCollections(target)
      const amount = Math.max(1, effect.amount ?? 1)
      target.aetherTokens = (target.aetherTokens ?? 0) + amount
      messages.push(`${target.mageType} gains ${amount} Aether token${amount === 1 ? '' : 's'}`)
      continue
    }

    if (effect.kind === 'gain_charge') {
      const amount = Math.max(0, effect.amount)
      const targets = effect.target === 'breach_owner' && resolution.pendingSpellCast
        ? [getPlayer(g, resolution.pendingSpellCast.playerId)]
        : effect.target === 'self'
          ? [p]
          : g.players.filter(player => player.id !== resolution.sourcePlayerId)
      let remaining = amount
      for (const target of targets) {
        const gained = Math.min(remaining, Math.max(0, target.chargeThreshold - target.charge))
        target.charge += gained
        remaining -= gained
        if (gained > 0) {
          messages.push(`${target.mageType} gains ${gained} charge (${target.charge}/${target.chargeThreshold})`)
        }
        if (remaining === 0) break
      }
      if (remaining > 0) messages.push(`${remaining} charge cannot be gained`)
      continue
    }

    if (effect.kind === 'prevent_damage_this_turn') {
      g.damagePrevention = true
      messages.push('Players and Gravehold are protected from damage this turn')
      continue
    }

    if (effect.kind === 'lose_all_charge') {
      const targets = getSelectedPlayerTargets(g, currentPlayerId, effect.target)
      if (targets.length > 1) {
        const decision = createDecision(g, 'Choose a player to lose all charge',
          'select_player_target', { targets }, resolution.sourceCardId,
        )
        messages.push(...pauseEffect(g, resolution, effect, decision))
        return messages
      }
      const target = getPlayer(g, targets[0]?.playerId ?? currentPlayerId)
      const lost = target.charge
      target.charge = 0
      messages.push(`${target.mageType} loses ${lost} charge`)
      continue
    }

    if (effect.kind === 'return_last_discarded_minion') {
      const index = g.nemesis.discard.findIndex(cardId => getCard(cardId).type === 'minion')
      if (index < 0) {
        messages.push('No discarded Minion is available to return')
        continue
      }
      const cardId = g.nemesis.discard.splice(index, 1)[0]!
      const definition = getCard(cardId) as NemesisCardDef
      const placedAt = (g.nemesis.cardInstanceCounter ?? 0) + 1
      g.nemesis.cardInstanceCounter = placedAt
      g.nemesis.playArea.push({
        cardId, cardType: 'minion', placedAt, instanceId: `${cardId}:${placedAt}`,
        enteredOnNemesisTurn: g.nemesis.nemesisTurnNumber,
        lifeTokens: definition.life ?? 0,
      })
      messages.push(`Returned Minion ${definition.name} to play`)
      continue
    }

    if (effect.kind === 'shuffle_nemesis_turn_order_cards') {
      const cards = g.turnOrderDiscard.filter(cardId => cardId === 'nemesis')
      if (cards.length === 0) {
        messages.push('No Nemesis turn-order cards are in the discard pile')
        continue
      }
      g.turnOrderDiscard = g.turnOrderDiscard.filter(cardId => cardId !== 'nemesis')
      g.turnOrderDeck = shuffle([...g.turnOrderDeck, ...cards])
      messages.push(`Shuffled ${cards.length} Nemesis turn-order card(s) into the deck`)
      continue
    }

    if (effect.kind === 'reveal_turn_order_deck') {
      if (g.turnOrderDeck.length === 0) {
        messages.push('Turn order deck is empty')
        continue
      }
      const cards = g.turnOrderDeck.map((cardId, index) => ({ index, cardId }))
      const decision = createDecision(g,
        'Reveal the turn order deck and choose its order',
        'reorder_turn_order',
        { cards },
        resolution.sourceCardId,
      )
      messages.push(...pauseEffect(g, resolution, effect, decision))
      return messages
    }

    if (effect.kind === 'shuffle_turn_order_card') {
      // "Their turn order card" refers to the player whose main phase is
      // currently resolving, not to the owner of a Treasure that granted the
      // action.  Effects such as Lash explicitly target any player instead.
      const cards = getPlayerTurnOrderCards(g)
        .filter(card => effect.target !== 'self' || card.cardId === currentPlayerId)
      if (cards.length === 0) {
        messages.push('No player turn order card is available in the discard pile')
        continue
      }
      const decision = createDecision(g,
        'Choose a player turn order card to shuffle back into the deck',
        'select_turn_order_card',
        { cards },
        resolution.sourceCardId,
      )
      messages.push(...pauseEffect(g, resolution, effect, decision))
      return messages
    }

    if (effect.kind === 'reveal_turn_order_card') {
      replenishTurnOrderDeckForReveal(g, 1)
      const top = g.turnOrderDeck[0]
      if (!top) {
        messages.push('Turn order deck is empty')
        continue
      }
      const decision = createDecision(g,
        `Reveal ${top === 'nemesis' ? 'Nemesis' : 'Player'} turn order card and continue?`,
        'confirm_turn_order_reveal',
        { cardId: top },
        resolution.sourceCardId,
      )
      messages.push(...pauseEffect(g, resolution, effect, decision))
      return messages
    }

    if (effect.kind === 'place_revealed_turn_order_card') {
      const top = g.turnOrderDeck[0]
      if (!top) {
        messages.push('The revealed turn order card is no longer available')
        continue
      }
      const decision = createDecision(g, 'Place the revealed turn order card on top or bottom?',
        'choose_turn_order_position', { cardId: top }, resolution.sourceCardId,
      )
      messages.push(...pauseEffect(g, resolution, effect, decision))
      return messages
    }

    if (effect.kind === 'gain_conditional_aether') {
      const amount = Math.max(0, effect.amount)
      const recipient = effect.target === 'source' && resolution.sourcePlayerId
        ? getPlayer(g, resolution.sourcePlayerId)
        : p
      ensurePlayerCollections(recipient)
      recipient.conditionalAetherEarned[effect.condition] =
        (recipient.conditionalAetherEarned[effect.condition] ?? 0) + amount
      messages.push(`${recipient.mageType} gains ${amount} conditional Aether for ${effect.condition}`)
      continue
    }

    if (effect.kind === 'deal_damage') {
      // Some card texts ask for an optional choice before adding its value as
      // "additional damage". Defer this damage instance until that choice has
      // resolved so the base and bonus remain one event (and one target choice).
      if (hasDeferredAdditionalDamage(effect) &&
        resolution.lastSelectedCardCount === undefined &&
        resolution.lastOptionalAccepted === undefined) {
        resolution.lastSelectedCardCount = 0
        resolution.lastSelectedCardCost = 0
        resolution.lastOptionalAccepted = false
        resolution.remainingEffects.push(effect)
        continue
      }
      const amount = damageAmountValue(g, currentPlayerId, effect, resolution.sourceCardId, resolution)
      const targets = getDamageTargets(g, effect.target, resolution.sourceCardId)
      if (targets.length === 0) {
        messages.push('No valid damage target')
        continue
      }
      if (targets.length > 1) {
        resolution.spellDamageEffectSeen = true
        const decision = createDecision(g, 'Choose a damage target', 'select_damage_target',
          { targets }, resolution.sourceCardId,
        )
        messages.push(...pauseEffect(g, resolution, effect, decision))
        return messages
      }
      resolution.spellDamageEffectSeen = true
      messages.push(dealDamage(g, targets[0]!, applySpellDamageBonus(resolution, amount)))
      continue
    }

    if (effect.kind === 'deal_damage_from_last_selection' || effect.kind === 'deal_damage_from_last_selection_cost') {
      const count = resolution.lastSelectedCardCount ?? 0
      const amount = effect.kind === 'deal_damage_from_last_selection'
        ? Math.max(0, (effect.base ?? 0) + count * effect.amountPerCard)
        : Math.max(0, (effect.base ?? 0) + (resolution.lastSelectedCardCost ?? 0))
      const targets = getDamageTargets(g, effect.target, resolution.sourceCardId)
      resolution.lastSelectedCardCount = undefined
      resolution.lastSelectedCardCost = undefined
      if (targets.length === 0) {
        messages.push('No valid damage target')
        continue
      }
      if (targets.length > 1) {
        const decision = createDecision(g, 'Choose a damage target', 'select_damage_target', { targets }, resolution.sourceCardId)
        messages.push(...pauseEffect(g, resolution, { kind: 'deal_damage', amount, target: effect.target }, decision))
        return messages
      }
      resolution.spellDamageEffectSeen = true
      messages.push(dealDamage(g, targets[0]!, applySpellDamageBonus(resolution, amount)))
      continue
    }

    if (effect.kind === 'deal_player_damage') {
      const targets = getSelectedDamagePlayerTargets(g, currentPlayerId, effect.target, effect.selection)
      if (targets.length === 0) {
        messages.push('No valid player damage target')
        continue
      }
      if (targets.length > 1) {
        const decision = createDecision(g, 'Choose a player to suffer damage', 'select_player_target',
          { targets }, resolution.sourceCardId,
        )
        messages.push(...pauseEffect(g, resolution, effect, decision))
        return messages
      }
      const target = getPlayer(g, targets[0]!.playerId)
      resolution.effectPlayerId = target.id
      // Amounts such as Bleed Static's per_prepped_spell are based on the
      // player who was selected, not the player controlling the Nemesis
      // resolution.
      const damage = amountValue(g, target.id, effect.amount, resolution.sourceCardId)
      messages.push(sufferPlayerDamage(g, target.id, damage))
      const excess = Math.max(0, -target.hp)
      const death = checkPlayerDeath(g, target.id, true)
      if (death) {
        messages.push(death)
        queuePlayerExhaustion(resolution, target.id, excess)
      } else if (target.exhausted) {
        const gameOver = checkGameOver(g)
        if (gameOver) {
          messages.push(gameOver)
          resolution.remainingEffects = []
        }
      }
      continue
    }

    if (effect.kind === 'draw_cards') {
      const targetContextPlayerId = effect.relativeToSpellCaster
        ? resolution.pendingSpellCast?.casterPlayerId ?? resolution.sourcePlayerId ?? currentPlayerId
        : currentPlayerId
      const targets = getSelectedPlayerTargets(g, targetContextPlayerId, effect.target ?? 'self', effect.selection)
      if (targets.length === 0) {
        messages.push('No valid player target')
        continue
      }
      if (targets.length > 1) {
        const decision = createDecision(g, 'Choose a player to draw cards', 'select_player_target',
          { targets }, resolution.sourceCardId,
        )
        messages.push(...pauseEffect(g, resolution, effect, decision))
        return messages
      }
      const target = getPlayer(g, targets[0]!.playerId)
      const drawn = drawCardsForPlayer(g, target.id, effect.amount)
      resolution.effectPlayerId = target.id
      messages.push(`${target.mageType} draws ${drawn} card(s)`)
      continue
    }

    if (effect.kind === 'gain_life') {
      const targets = getLifeTargets(g, currentPlayerId, effect.target)
      if (targets.length === 0) {
        messages.push('No valid life target')
        continue
      }
      if (targets.length > 1) {
        const decision = createDecision(g, 'Choose a life target', 'select_life_target',
          { targets }, resolution.sourceCardId,
        )
        messages.push(...pauseEffect(g, resolution, effect, decision))
        return messages
      }
      const message = gainLife(g, targets[0]!, effect.amount)
      if (message) messages.push(message)
      continue
    }

    if (effect.kind === 'lose_charge') {
      const amount = Math.min(Math.max(0, effect.amount), p.charge)
      p.charge -= amount
      messages.push(`${p.mageType} loses ${amount} charge (${p.charge}/${p.chargeThreshold})`)
      continue
    }

    if (effect.kind === 'play_card_from_hand') {
      const selectedId = resolution.selectedCardId
      const candidates = getCardChoices(g, currentPlayerId, 'hand')
        .filter(choice => getCard(choice.cardId).type === effect.cardType)
      if (!selectedId) {
        if (candidates.length === 0) {
          messages.push(`No ${effect.cardType} card is available in hand`)
          continue
        }
        const decision = createDecision(g, `Choose a ${effect.cardType} to play`, 'select_cards',
          { source: 'hand', candidates, min: 1, max: 1 }, resolution.sourceCardId,
        )
        messages.push(...pauseEffect(g, resolution, effect, decision))
        return messages
      }
      resolution.selectedCardId = undefined
      const handIndex = getPlayer(g, currentPlayerId).hand.indexOf(selectedId)
      if (handIndex < 0 || getCard(selectedId).type !== effect.cardType) {
        messages.push('The selected card is no longer available')
        continue
      }
      const player = getPlayer(g, currentPlayerId)
      player.hand.splice(handIndex, 1)
      const times = Math.max(1, effect.times)
      const instances: CardEffect[] = []
      for (let index = 0; index < times; index++) {
        instances.push({
          kind: 'play_card_instance', cardId: selectedId,
          destroyAfter: effect.destroy && index === times - 1,
          recordPlay: index === 0,
        })
      }
      addRemainingEffects(resolution, instances)
      continue
    }

    if (effect.kind === 'play_card_instance') {
      const card = getCard(effect.cardId)
      // Keep the physical card in the played area while its nested on-play
      // effects are resolving. This matters when the replay pauses for a
      // choice (for example Burning Opal) before Unstable Prism destroys it.
      if (effect.recordPlay !== false) p.playedThisTurn.push(effect.cardId)
      ensurePlayerCollections(p)
      p.cardPlayCountsThisTurn[effect.cardId] = (p.cardPlayCountsThisTurn[effect.cardId] ?? 0) + 1
      const nested = matchingBlocks(effect.cardId, currentPlayerId, g, { kind: 'on_play' }).flatMap(block => block.effects)
      if (effect.destroyAfter) nested.push({ kind: 'destroy_played_card', cardId: effect.cardId, playerId: currentPlayerId })
      addRemainingEffects(resolution, nested)
      messages.push(`Played ${card.name}`)
      continue
    }

    if (effect.kind === 'destroy_played_card') {
      const owner = getPlayer(g, effect.playerId ?? resolution.sourcePlayerId ?? currentPlayerId)
      const index = [...owner.playedThisTurn].lastIndexOf(effect.cardId)
      if (index < 0) {
        messages.push('Played card is no longer available to destroy')
        continue
      }
      owner.playedThisTurn.splice(index, 1)
      ensurePlayerCollections(owner)
      destroyOwnedCard(owner, effect.cardId)
      messages.push(getCard(effect.cardId).returnToSwapZoneOnDestroy
        ? `${getCard(effect.cardId).name} returns to the Swap zone`
        : `Destroyed ${getCard(effect.cardId).name}`)
      continue
    }

    if (effect.kind === 'destroy_player_card_in_play') {
      // The active player controls the action, but the Treasure remains in its
      // owner's Player cards in play area and must be destroyed there.
      const owner = getPlayer(g, effect.playerId ?? resolution.sourcePlayerId ?? currentPlayerId)
      if (!removePlayerCardFromPlay(owner, effect.cardId)) {
        messages.push(`${getCard(effect.cardId).name} is no longer in Player cards in play`)
        continue
      }
      destroyOwnedCard(owner, effect.cardId)
      messages.push(`Destroyed ${getCard(effect.cardId).name} from Player cards in play`)
      continue
    }

    if (effect.kind === 'gain_card') {
      let marketPileIndex: number | undefined
      const fromSpecificPile = effect.source === 'specific'
      if (effect.source === 'market') {
        marketPileIndex = g.market.piles.findIndex(pile => pile.cardId === effect.cardId && pile.remaining > 0)
        if (marketPileIndex === -1) {
          messages.push(`Cannot gain ${getCard(effect.cardId).name}: market pile is empty`)
          continue
        }
      }
      if (fromSpecificPile && g.nemesis.strikeDeck[0] !== effect.cardId) {
        messages.push(`Cannot gain ${getCard(effect.cardId).name}: it is not on top of the specific pile`)
        continue
      }
      const destination = effect.destination ?? 'discard_top'
      const message = gainCard(g, currentPlayerId, effect.cardId, destination, marketPileIndex, false, fromSpecificPile)
      if (message) {
        resolution.lastGainedCardId = effect.cardId
        const followups = matchingBlocks(effect.cardId, currentPlayerId, g, { kind: 'on_gain' })
          .flatMap(block => block.effects)
        addRemainingEffects(resolution, followups)
        messages.push(message)
      }
      continue
    }

    if (effect.kind === 'swap_for') {
      const sourceCardId = resolution.sourceCardId
      if (!sourceCardId) {
        messages.push('No card is available to swap')
        continue
      }
      const sourceCard = removeResolvingCardForSwap(p, sourceCardId)
      if (!sourceCard) {
        messages.push(`${getCard(sourceCardId).name} is no longer available to swap`)
        continue
      }
      ensurePlayerCollections(p)
      const swapZone = p.swapZone!
      swapZone.push(sourceCard)
      const targetIndex = swapZone.indexOf(effect.cardId)
      if (targetIndex < 0) {
        messages.push(`${getCard(sourceCard).name} enters the Swap zone; ${getCard(effect.cardId).name} is unavailable`)
        continue
      }
      const swappedCard = swapZone.splice(targetIndex, 1)[0]!
      p.discard.unshift(swappedCard)
      messages.push(`Swapped ${getCard(sourceCard).name} for ${getCard(swappedCard).name}`)
      continue
    }

    if (effect.kind === 'move_cards_to_swap_zone') {
      const candidates = getCardChoices(g, currentPlayerId, effect.source)
        .filter(choice => cardNameMatchesAny(choice.cardId, effect.nameIncludes))
      const max = Math.min(Math.max(0, effect.maxAmount), candidates.length)
      const min = Math.min(Math.max(0, effect.minAmount), max)
      if (max === 0) {
        messages.push('No matching card is available to move to the Swap zone')
        continue
      }
      const decision = createDecision(g,
        `Choose up to ${max} Crystal or Spark card(s) for the Swap zone`,
        'select_cards', { source: effect.source, candidates, min, max }, resolution.sourceCardId,
      )
      messages.push(...pauseEffect(g, resolution, effect, decision))
      return messages
    }

    if (effect.kind === 'gain_card_from_swap_zone') {
      const candidates = getCardChoices(g, currentPlayerId, 'swap_zone')
        .filter(choice => cardNameMatchesAny(choice.cardId, effect.nameIncludes))
      if (candidates.length === 0) {
        messages.push('No Crystal or Spark card is available in the Swap zone')
        continue
      }
      if (candidates.length === 1) {
        const cardId = gainSwapZoneCard(p, candidates[0]!)
        if (cardId) messages.push(`Gained ${getCard(cardId).name} from the Swap zone`)
        continue
      }
      const decision = createDecision(g,
        'Choose a Crystal or Spark card from the Swap zone to gain',
        'select_cards', { source: 'swap_zone', candidates, min: 1, max: 1 }, resolution.sourceCardId,
      )
      messages.push(...pauseEffect(g, resolution, effect, decision))
      return messages
    }

    if (effect.kind === 'reveal_specific_deck') {
      const owner = getPlayer(g, currentPlayerId)
      ensurePlayerCollections(owner)
      const revealed = owner.specificDeck!.slice(0, 2)
      if (revealed.length === 0) {
        messages.push('No cards are available in the Mage-specific deck')
        continue
      }
      // Online play keeps information that the player has already seen. The
      // cards remain face-down in the physical deck, but their faces may be
      // shown when the player inspects the deck later.
      owner.knownSpecificDeckCards ??= []
      for (const cardId of revealed) {
        if (!owner.knownSpecificDeckCards.includes(cardId)) owner.knownSpecificDeckCards.push(cardId)
      }
      if (effect.mode === 'put_one_into_play') {
        resolution.specificDeckReveal = {
          playerId: owner.id,
          cards: revealed,
          mode: effect.mode,
        }
        const candidates = revealed.map((cardId, index) => ({
          zone: 'specific_deck' as const,
          index,
          cardId,
          cardName: getCard(cardId).name,
        }))
        const decision = createDecision(g,
          'Choose one revealed card to put into play. Return the other to the bottom of the deck.',
          'select_cards', { source: 'specific_deck', candidates, min: 1, max: 1, layout: 'simple' },
          resolution.sourceCardId,
        )
        messages.push(...pauseEffect(g, resolution, effect, decision))
        return messages
      }

      owner.specificDeck!.splice(0, revealed.length)
      resolution.specificDeckReveal = {
        playerId: owner.id,
        cards: revealed,
        mode: effect.mode,
        cardSlots: revealed.map((_, index) => index),
      }
      const decision = createDecision(g,
        'Choose a revealed card to return to the top or bottom of the Mage-specific deck',
        'place_specific_deck_card',
        { cards: revealed.map((cardId, index) => ({ cardId, cardName: getCard(cardId).name, slot: index })) },
        resolution.sourceCardId,
      )
      messages.push(...pauseEffect(g, resolution, effect, decision))
      return messages
    }

    if (effect.kind === 'devour_market_cards') {
      const amount = amountValue(g, currentPlayerId, effect.amount, resolution.sourceCardId)
      if (amount === 0) {
        messages.push('No cards are Devoured')
        continue
      }
      if (effect.pile === 'choose') {
        const candidates = marketPileChoices(g, effect.cardType).filter(candidate => candidate.remaining > 0)
        if (candidates.length === 0) {
          messages.push('No non-empty matching supply pile can be Devoured')
          continue
        }
        const decision = createDecision(g, 'Choose a supply pile to Devour', 'select_market_pile',
          { candidates }, resolution.sourceCardId,
        )
        messages.push(...pauseEffect(g, resolution, effect, decision))
        return messages
      }
      if (effect.pile === 'least_expensive') {
        const candidates = leastExpensiveMarketPiles(g, effect.cardType)
        if (candidates.length > 1) {
          const decision = createDecision(g, 'Choose a least expensive supply pile to Devour', 'select_market_pile',
            { candidates }, resolution.sourceCardId,
          )
          messages.push(...pauseEffect(g, resolution, effect, decision))
          return messages
        }
      }
      const target = fixedDevourPile(g, effect.pile, effect.cardType)
      if (!target) {
        messages.push('No matching supply pile can be Devoured')
        continue
      }
      messages.push(...devourMarketPile(g, target.pileIndex, amount))
      continue
    }

    if (effect.kind === 'set_source_minion_life') {
      const minion = g.nemesis.playArea.find(card =>
        card.cardType === 'minion' && card.cardId === resolution.sourceCardId,
      )
      if (!minion) {
        messages.push('No source Minion is in play')
        continue
      }
      minion.lifeTokens = Math.max(0, effect.base + emptyMarketPileCount(g) * effect.amountPerEmptyMarketPile)
      messages.push(`${getCard(minion.cardId).name} gains ${minion.lifeTokens} life`)
      continue
    }

    if (effect.kind === 'move_gained_card') {
      const gained = resolution.lastGainedCardId
      if (gained && p.discard[0] === gained) {
        p.discard.shift()
        if (effect.destination === 'hand') {
          p.hand.push(gained)
          messages.push(`Moved ${getCard(gained).name} to hand`)
        } else {
          p.deck.unshift(gained)
          messages.push(`Moved ${getCard(gained).name} to the top of the deck`)
        }
      } else {
        messages.push('No newly gained card is available to move')
      }
      continue
    }

    if (effect.kind === 'set_next_to_supply_pile') {
      const candidates = marketPileChoices(g, effect.cardType)
        .filter(candidate => candidate.remaining > 0)
        .filter(candidate => !effect.cardTypes || effect.cardTypes.includes(getCard(candidate.cardId).type as 'gem' | 'relic' | 'spell'))
        .filter(candidate => effect.minCost === undefined || getCard(candidate.cardId).cost >= effect.minCost)
      if (candidates.length === 0) {
        messages.push('No matching supply pile is available')
        continue
      }
      const decision = createDecision(g, 'Choose a supply pile for this Treasure', 'select_market_pile',
        { candidates }, resolution.sourceCardId)
      messages.push(...pauseEffect(g, resolution, effect, decision))
      return messages
    }

    if (effect.kind === 'gain_card_from_market') {
      const candidates = marketPileChoices(g).filter(candidate =>
        candidate.remaining > 0 && getCard(candidate.cardId).cost <= effect.maxCost)
      if (candidates.length === 0) {
        messages.push(`No supply card costing ${effect.maxCost} Aether or less is available`)
        continue
      }
      const decision = createDecision(g,
        `Choose a supply card costing ${effect.maxCost} Aether or less to gain`,
        'select_market_pile', { candidates }, resolution.sourceCardId)
      messages.push(...pauseEffect(g, resolution, effect, decision))
      return messages
    }

    if (effect.kind === 'gain_power_token') {
      const owner = getPlayer(g, effect.playerId ?? resolution.sourcePlayerId ?? currentPlayerId)
      const index = findPlayerCardInPlayIndex(owner, effect.cardId)
      if (index < 0) {
        messages.push(`${getCard(effect.cardId).name} is not in Player cards in play`)
        continue
      }
      owner.playerCardPowerTokens![index] = (owner.playerCardPowerTokens![index] ?? 0) + 1
      messages.push(`${getCard(effect.cardId).name} gains a Power token (${owner.playerCardPowerTokens![index]})`)
      continue
    }

    if (effect.kind === 'destroy_cards_equal_to_power_tokens') {
      // Power tokens belong to the Treasure owner, while "their hand or
      // discard pile" refers to the player taking this main-phase action.
      const tokenOwner = getPlayer(g, resolution.sourcePlayerId ?? effect.playerId ?? currentPlayerId)
      const target = getPlayer(g, effect.playerId ?? currentPlayerId)
      const count = playerCardPowerTokenCount(tokenOwner, effect.cardId)
      if (count <= 0) {
        messages.push('No cards are required for this Power-token cost')
        continue
      }
      const candidates = getCardChoices(g, target.id, 'hand_or_discard')
      const amount = Math.min(count, candidates.length)
      if (amount < count) {
        messages.push(`Not enough cards are available to destroy (${amount}/${count})`)
        continue
      }
      const decision = createDecision(g, `Destroy ${count} card(s) from hand or discard`,
        'select_cards', { source: 'hand_or_discard', candidates, min: count, max: count }, resolution.sourceCardId)
      messages.push(...pauseEffect(g, resolution, effect, decision))
      return messages
    }

    if (effect.kind === 'cast_any_number_prepped_spells') {
      // Runic Flute casts for the player taking the current turn, not for the
      // Mage who owns the Treasure. The transient spell-cast context is
      // cleared after each spell, so fall back to the active turn owner when
      // the iterative choice is opened again.
      const castingPlayerId = resolution.effectPlayerId ?? g.currentTurn ?? currentPlayerId
      const candidates = getPreppedSpellChoices(g).filter(choice => choice.playerId === castingPlayerId)
      if (candidates.length === 0) {
        messages.push('No prepped spell is available to cast')
        continue
      }
      const decision = createDecision(g, 'Choose a prepped spell to cast, or skip',
        'select_prepped_spell', { candidates, allowSkip: true }, resolution.sourceCardId)
      messages.push(...pauseEffect(g, resolution, effect, decision))
      return messages
    }

    if (effect.kind === 'cast_specific_prepped_spell') {
      resolution.selectedPreppedSpell = effect.choice
      addRemainingEffects(resolution, [{ kind: 'cast_prepped_spell', source: 'selected_prepped_spell' }])
      continue
    }

    if (effect.kind === 'discard_cards') {
      const targetScope = effect.target ?? 'self'
      const targets = getSelectedPlayerTargets(g, currentPlayerId, targetScope, effect.selection)
      if (targets.length > 1) {
        const decision = createDecision(g, 'Choose a player to discard cards', 'select_player_target',
          { targets }, resolution.sourceCardId,
        )
        messages.push(...pauseEffect(g, resolution, effect, decision))
        return messages
      }
      const discardPlayerId = targets[0]?.playerId ?? currentPlayerId
      resolution.effectPlayerId = discardPlayerId
      const candidates = getCardChoices(g, discardPlayerId, effect.source)
        .filter(choice => !effect.cardType || getCard(choice.cardId).type === effect.cardType)
      const fixedAmount = effect.minAmount === undefined && effect.maxAmount === undefined
      const min = Math.min(Math.max(0, effect.minAmount ?? effect.amount), candidates.length)
      const max = Math.min(Math.max(min, effect.maxAmount ?? effect.amount), candidates.length)
      if (max === 0) {
        resolution.lastSelectedCardCount = 0
        resolution.lastSelectedCardCost = 0
        messages.push('No cards available to discard')
        continue
      }
      if (!fixedAmount || candidates.length > min || max > 1) {
        const decision = createDecision(g, min === max ? `Choose ${min} card(s) to discard` : `Choose up to ${max} card(s) to discard`, 'select_cards',
          { source: effect.source, candidates, min, max }, resolution.sourceCardId,
        )
        messages.push(...pauseEffect(g, resolution, effect, decision))
        return messages
      }
      const removed = discardSelectedCards(g, discardPlayerId, candidates.slice(0, min))
      resolution.lastSelectedCardCount = removed.length
      resolution.lastSelectedCardCost = removed.length > 0 ? Math.max(...removed.map(id => getCard(id).cost)) : 0
      messages.push(`Discarded ${removed.map(id => getCard(id).name).join(', ')}`)
      continue
    }

    if (effect.kind === 'discard_cards_collectively') {
      const amount = amountValue(g, currentPlayerId, effect.amount, resolution.sourceCardId)
      const candidates = getCollectiveCardChoices(g, effect.source)
      if (amount === 0 || candidates.length === 0) {
        messages.push('No cards are available to discard collectively')
        continue
      }
      if (candidates.length > amount) {
        const decision = createDecision(g, `Choose ${amount} card(s) to discard collectively`,
          'select_collective_cards', { candidates, min: amount, max: amount }, resolution.sourceCardId,
        )
        messages.push(...pauseEffect(g, resolution, effect, decision))
        return messages
      }
      const removed = discardCollectiveCards(g, candidates)
      messages.push(`Players collectively discard ${removed.map(id => getCard(id).name).join(', ')}`)
      continue
    }

    if (effect.kind === 'deal_gravehold_damage_with_gem_discard') {
      const candidates = getCollectiveCardChoices(g, 'hand')
        .filter(item => getCard(item.choice.cardId).type === 'gem')
      const max = Math.min(Math.max(0, effect.maxGems), candidates.length)
      if (max === 0) {
        const message = dealDamage(g, { kind: 'gravehold', id: 'gravehold', label: 'Gravehold' }, effect.amount)
        messages.push(message)
        continue
      }
      const decision = createDecision(g,
        `Discard up to ${max} gem(s) to reduce Gravehold damage?`,
        'select_collective_cards', { candidates, min: 0, max }, resolution.sourceCardId,
      )
      messages.push(...pauseEffect(g, resolution, effect, decision))
      return messages
    }

    if (effect.kind === 'return_cards_to_hand') {
      const candidates = getCardChoices(g, currentPlayerId, effect.source)
        .filter(choice => getCard(choice.cardId).type === 'spell')
      const max = Math.min(Math.max(0, effect.amount), candidates.length)
      if (max === 0) {
        messages.push('No spells are available in the discard pile')
        continue
      }
      const min = Math.min(Math.max(0, effect.minAmount ?? 0), max)
      const prompt = min === max
        ? `Choose ${min} spell(s) to return to your hand`
        : `Choose up to ${max} spell(s) to return to your hand`
      const decision = createDecision(g, prompt, 'select_cards',
        { source: effect.source, candidates, min, max, layout: 'simple' }, resolution.sourceCardId,
      )
      messages.push(...pauseEffect(g, resolution, effect, decision))
      return messages
    }

    if (effect.kind === 'shuffle_discard_into_deck') {
      const targets = getSelectedPlayerTargets(g, currentPlayerId, effect.target ?? 'self')
      if (targets.length > 1) {
        const decision = createDecision(g, 'Choose a player to shuffle their discard pile into their deck',
          'select_player_target', { targets }, resolution.sourceCardId,
        )
        messages.push(...pauseEffect(g, resolution, effect, decision))
        return messages
      }
      const target = getPlayer(g, targets[0]?.playerId ?? currentPlayerId)
      target.deck = shuffle([...target.deck, ...target.discard])
      target.discard = []
      messages.push(`${target.mageType} shuffles their discard pile into their deck`)
      continue
    }

    if (effect.kind === 'destroy_top_cards') {
      const targets = getSelectedPlayerTargets(g, currentPlayerId, effect.target ?? 'self')
      if (targets.length > 1) {
        const decision = createDecision(g, 'Choose a player to destroy cards from their deck',
          'select_player_target', { targets }, resolution.sourceCardId,
        )
        messages.push(...pauseEffect(g, resolution, effect, decision))
        return messages
      }
      const target = getPlayer(g, targets[0]?.playerId ?? currentPlayerId)
      ensurePlayerCollections(target)
      const destroyed: string[] = []
      for (let index = 0; index < Math.max(0, effect.amount); index++) {
        if (target.deck.length === 0 && target.discard.length > 0) {
          target.deck = [...target.discard].reverse()
          target.discard = []
        }
        const cardId = target.deck.shift()
        if (!cardId) break
        destroyOwnedCard(target, cardId)
        destroyed.push(cardId)
      }
      messages.push(`${target.mageType} destroys ${destroyed.length} card(s) from the top of their deck`)
      continue
    }

    if (effect.kind === 'discard_prepped_spells') {
      let targets = getSelectedPlayerTargets(g, currentPlayerId, effect.target ?? 'any_player', effect.selection)
      let candidates = getPreppedSpellChoices(g).filter(choice => targets.some(target => target.playerId === choice.playerId))
      candidates = candidates.filter(choice =>
        (getPreppedSpellCost(g, choice.playerId, choice.breachIndex, choice.spellIndex) ?? 0) >= (effect.minCost ?? 0))
      let amount = Math.min(Math.max(0, effect.amount), candidates.length)
      if (amount === 0) {
        messages.push('No eligible prepped spell is available')
        continue
      }

      if (effect.mostExpensive) {
        // "Most expensive" means the requested number of cards by descending
        // cost. If the cutoff is tied, pause so the player can confirm the
        // complete selection; never alter the board before that confirmation.
        const ordered = [...candidates].sort((a, b) =>
          (getPreppedSpellCost(g, b.playerId, b.breachIndex, b.spellIndex) ?? 0) -
          (getPreppedSpellCost(g, a.playerId, a.breachIndex, a.spellIndex) ?? 0))
        const cutoffCost = getPreppedSpellCost(g, ordered[amount - 1]!.playerId, ordered[amount - 1]!.breachIndex, ordered[amount - 1]!.spellIndex) ?? 0
        const required = ordered.filter(choice => (getPreppedSpellCost(g, choice.playerId, choice.breachIndex, choice.spellIndex) ?? 0) > cutoffCost)
        const cutoffChoices = ordered.filter(choice => (getPreppedSpellCost(g, choice.playerId, choice.breachIndex, choice.spellIndex) ?? 0) === cutoffCost)
        const remaining = amount - required.length
        if (cutoffChoices.length > remaining) {
          const decision = createDecision(g, `Choose ${amount} prepped spell(s) to discard`,
            'select_prepped_spells', {
              candidates: ordered.filter(choice =>
                (getPreppedSpellCost(g, choice.playerId, choice.breachIndex, choice.spellIndex) ?? 0) >= cutoffCost),
              min: amount,
              max: amount,
              requiredChoices: required,
            }, resolution.sourceCardId,
          )
          messages.push(...pauseEffect(g, resolution, effect, decision))
          return messages
        }

        const discarded = discardPreppedSpellChoices(g, ordered.slice(0, amount))
        if (discarded.length > 0) messages.push(`Discarded prepped spell(s): ${discarded.join(', ')}`)
        continue
      }

      if (amount === 0) continue
      if (candidates.length > amount || amount > 1) {
        const decision = createDecision(g, `Choose ${amount} prepped spell(s) to discard`,
          'select_prepped_spells', { candidates, min: amount, max: amount }, resolution.sourceCardId,
        )
        messages.push(...pauseEffect(g, resolution, effect, decision))
        return messages
      }
      const discarded = discardPreppedSpellChoices(g, [candidates[0]!])
      if (discarded.length > 0) messages.push(`Discarded prepped spell ${discarded[0]}`)
      continue
    }

    if (effect.kind === 'destroy_cards') {
      if (effect.source === 'self') {
        // During an on-cast effect, "self" means the spell being cast. The
        // sourceCardId can still belong to the relic or Mage ability that
        // initiated the cast, so the pending spell context must take priority.
        const pendingCast = resolution.pendingSpellCast
        const castOwner = pendingCast?.discard
          ? getPlayer(g, pendingCast.playerId)
          : undefined
        const castDiscardIndex = castOwner?.discard.findIndex(cardId => cardId === pendingCast?.cardId) ?? -1
        const castChoice = castOwner && pendingCast && castDiscardIndex >= 0
          ? {
              zone: 'discard' as CardZone,
              index: castDiscardIndex,
              cardId: castOwner.discard[castDiscardIndex]!,
              cardName: getCard(castOwner.discard[castDiscardIndex]!).name,
            }
          : undefined
        const sourcePlayerId = castOwner?.id ?? currentPlayerId
        const selfChoice = castChoice
          ?? getZoneCards(getPlayer(g, sourcePlayerId), 'played_this_turn')
          .map((cardId, index) => ({ zone: 'played_this_turn' as CardZone, index, cardId, cardName: getCard(cardId).name }))
          .find(choice => choice.cardId === resolution.sourceCardId)
          ?? getCardChoices(g, sourcePlayerId, 'hand_or_discard')
            .find(choice => choice.cardId === resolution.sourceCardId)
        if (!selfChoice) {
          messages.push('Source card is no longer available to destroy')
        } else {
          const message = destroyCard(g, sourcePlayerId, selfChoice)
          if (message) messages.push(message)
          resolution.lastSelectedCardCount = message ? 1 : 0
          resolution.lastSelectedCardCost = message ? getCard(selfChoice.cardId).cost : 0
        }
        continue
      }

      const source = effect.source as CardSelectionSource
      const candidates = getCardChoices(g, currentPlayerId, source)
        .filter(choice => !effect.cardType || getCard(choice.cardId).type === effect.cardType)
      const max = Math.min(Math.max(0, effect.maxAmount ?? 1), candidates.length)
      if (max === 0) {
        resolution.lastSelectedCardCount = 0
        resolution.lastSelectedCardCost = 0
        messages.push('No cards available to destroy')
        continue
      }
      const min = Math.min(Math.max(0, effect.minAmount ?? 0), max)
      const decision = createDecision(g, min > 0 ? `Choose ${min} card(s) to destroy` : `Choose up to ${max} card(s) to destroy`,
        'select_cards', {
          source, candidates, min, max,
          layout: 'simple',
        }, resolution.sourceCardId,
      )
      messages.push(...pauseEffect(g, resolution, effect, decision))
      return messages
    }

    if (effect.kind === 'choose_one') {
      if (effect.options.length === 0) continue
      if (effect.options.length === 1) {
        addRemainingEffects(resolution, effect.options[0]!.effects)
        continue
      }
      const options: CardEffectOption[] = effect.options
      const decision = createDecision(g, effect.prompt, 'choose_one',
        {
          options: options.map(option => ({
            id: option.id,
            label: option.label,
            disabled: option.condition ? !conditionMatches(g, currentPlayerId, option.condition, resolution) : false,
          })),
          layout: effect.layout,
        }, resolution.sourceCardId,
      )
      messages.push(...pauseEffect(g, resolution, effect, decision))
      return messages
    }

    if (effect.kind === 'choose_optional') {
      const acceptDisabled = Boolean(
        (effect.acceptCondition !== undefined &&
          !conditionMatches(g, currentPlayerId, effect.acceptCondition, resolution)) ||
        (effect.disableIfUnavailable && !optionalCardSelectionAvailable(g, currentPlayerId, effect.effects)),
      )
      const decision = createDecision(g, effect.prompt, 'choose_optional',
        {
          accept: { id: 'accept', label: 'Yes', disabled: acceptDisabled },
          skip: { id: 'skip', label: 'No' },
        }, resolution.sourceCardId,
      )
      messages.push(...pauseEffect(g, resolution, effect, decision))
      return messages
    }

    if (effect.kind === 'modify_next_breach_cost') {
      const amount = Math.max(0, effect.amount)
      if (amount > 0 && effect.actions.length > 0) {
        getPlayerTurnEffects(p).nextBreachCostReductions.push({ amount, actions: [...effect.actions] })
        messages.push(`Next ${effect.actions.join('/')} breach action costs ${amount} less Aether`)
      }
      continue
    }

    if (effect.kind === 'set_prep_limit') {
      const turnEffects = getPlayerTurnEffects(p)
      const limit = effect.amount === 'unlimited' ? 'unlimited' : Math.max(1, effect.amount)
      if (effect.breachIndices?.length) {
        turnEffects.prepSpellLimitByBreach ??= {}
        for (const breachIndex of effect.breachIndices) {
          turnEffects.prepSpellLimitByBreach[breachIndex] = limit
        }
        const breachLabels = effect.breachIndices.map(index => `Breach ${toRoman(index)}`).join(' and ')
        messages.push(limit === 'unlimited'
          ? `Any number of spells may be prepped on ${breachLabels} this turn`
          : `Up to ${limit} spells may be prepped on ${breachLabels} this turn`)
      } else {
        turnEffects.prepSpellLimit = limit
        turnEffects.prepSpellLimitByBreach = {}
        messages.push(limit === 'unlimited'
          ? 'Any number of spells may be prepped on each breach this turn'
          : `Up to ${limit} spells may be prepped on each breach this turn`)
      }
      continue
    }

    if (effect.kind === 'return_card_to_hand') {
      const candidates = getCardChoices(g, currentPlayerId, effect.source)
      if (candidates.length === 0) {
        messages.push('No played gem is available to return')
        continue
      }
      if (candidates.length > 1) {
        const decision = createDecision(g, 'Choose a played gem to return to your hand', 'select_cards',
          { source: effect.source, candidates, min: 1, max: 1 }, resolution.sourceCardId,
        )
        messages.push(...pauseEffect(g, resolution, effect, decision))
        return messages
      }
      const returned = returnSelectedCard(g, currentPlayerId, candidates[0]!)
      if (returned) messages.push(`Returned ${getCard(returned).name} to hand`)
      continue
    }

    if (effect.kind === 'resolve_spell_damage_bonus') {
      if ((resolution.spellDamageBonus || resolution.spellAdditionalDamageBonus) && !resolution.spellDamageEffectSeen) {
        const bonusEffect: CardEffect = {
          kind: 'deal_damage', amount: 0, target: 'nemesis_or_minion',
        }
        const targets = getDamageTargets(g, bonusEffect.target)
        if (targets.length > 1) {
          resolution.spellDamageEffectSeen = true
          const decision = createDecision(g, 'Choose a damage target', 'select_damage_target',
            { targets }, resolution.sourceCardId,
          )
          messages.push(...pauseEffect(g, resolution, bonusEffect, decision))
          return messages
        }
        if (targets.length === 1) {
          resolution.spellDamageEffectSeen = true
          messages.push(dealDamage(g, targets[0]!, applySpellDamageBonus(resolution, 0)))
        }
      }
      resolution.spellDamageBonus = undefined
      resolution.spellAdditionalDamageBonus = undefined
      resolution.spellDamageEffectSeen = false
      resolution.effectPlayerId = undefined
      continue
    }

    if (effect.kind === 'place_cast_spell_in_ally_hand') {
      const pending = resolution.pendingSpellCast
      if (!pending) {
        messages.push('No Transfer spell is pending')
        continue
      }
      const allies = getPlayerTargets(g, pending.playerId, 'ally')
      if (allies.length === 0) {
        pending.destinationPlayerId = pending.playerId
        messages.push('No ally is available; the Transfer spell returns to its owner')
        continue
      }
      if (allies.length > 1) {
        const decision = createDecision(g, 'Choose an ally to receive the Transfer spell',
          'select_player_target', { targets: allies }, resolution.sourceCardId)
        messages.push(...pauseEffect(g, resolution, effect, decision))
        return messages
      }
      pending.destinationPlayerId = allies[0]!.playerId
      messages.push(`Transfer spell will return to ${getPlayer(g, allies[0]!.playerId).mageType}'s hand`)
      continue
    }

    if (effect.kind === 'finalize_spell_cast') {
      const pending = resolution.pendingSpellCast
      if (pending) {
        const owner = getPlayer(g, pending.playerId)
        const breach = owner.breaches.find(item => item.index === pending.breachIndex)
        if (pending.transferToAlly && breach?.prepSpells[pending.spellIndex] === pending.cardId) {
          breach.prepSpells.splice(pending.spellIndex, 1)
          breach.preppedThisTurn?.splice(pending.spellIndex, 1)
          breach.preppedSpellFaceDown?.splice(pending.spellIndex, 1)
        }
        if (pending.transferToAlly) {
          getPlayer(g, pending.destinationPlayerId ?? pending.playerId).hand.push(pending.cardId)
        }
      }
      clearPendingSpellCast(resolution)
      continue
    }

    if (effect.kind === 'cast_prepped_spell') {
      let choice = resolution.selectedPreppedSpell
      if (effect.source === 'any_prepped_spell' || effect.source === 'prepped_spell_prepped_this_turn') {
        if (!choice) {
          let candidates = getPreppedSpellChoices(g)
          if (effect.source === 'prepped_spell_prepped_this_turn') {
            candidates = candidates.filter(candidate => {
              const owner = getPlayer(g, candidate.playerId)
              const breach = owner.breaches.find(item => item.index === candidate.breachIndex)
              return breach?.preppedThisTurn?.[candidate.spellIndex] === true
            })
          }
          if (candidates.length === 0) {
            messages.push('No prepped spell is available')
            continue
          }
          const decision = createDecision(g, 'Choose a prepped spell to cast', 'select_prepped_spell',
            { candidates }, resolution.sourceCardId,
          )
          messages.push(...pauseEffect(g, resolution, effect, decision))
          return messages
        }
      }
      if (!choice) {
        messages.push('No prepped spell has been selected')
        continue
      }
      const confirmed = resolution.confirmedPreppedSpell
      const sameChoice = confirmed &&
        confirmed.playerId === choice.playerId &&
        confirmed.breachIndex === choice.breachIndex &&
        confirmed.spellIndex === choice.spellIndex &&
        confirmed.cardId === choice.cardId
      if (!sameChoice) {
        const decision = createDecision(g, 'Choose a prepped spell to cast', 'select_prepped_spell',
          { candidates: [choice] }, resolution.sourceCardId,
        )
        messages.push(...pauseEffect(g, resolution, effect, decision))
        return messages
      }
      resolution.confirmedPreppedSpell = undefined
      if (effect.source !== 'any_prepped_spell') resolution.selectedPreppedSpell = undefined
      const spellOwner = getPlayer(g, choice.playerId)
      const breach = spellOwner.breaches.find(item => item.index === choice.breachIndex)
      if (!breach || breach.prepSpells[choice.spellIndex] !== choice.cardId) {
        messages.push('The selected prepped spell is no longer available')
        continue
      }
      const card = getCard(choice.cardId)
      const faceDown = isFaceDownPreppedSpell(breach, choice.spellIndex)
      if (card.type !== 'spell' && !faceDown) {
        messages.push('The selected card is not a spell')
        continue
      }
      // A spell may be prepped by another player (for example, Jian casting
      // Brama's Buried Light). The player who activates this effect is still
      // the spell's caster, so all player-facing on-cast effects resolve for
      // resolution.sourcePlayerId rather than the spell owner.
      resolution.pendingSpellCast = {
        playerId: choice.playerId,
        breachIndex: choice.breachIndex,
        spellIndex: choice.spellIndex,
        cardId: choice.cardId,
        discard: effect.discard !== false && !(breach.special === 'transfer' && breach.opened),
        transferToAlly: breach.special === 'transfer' && breach.opened,
        faceDown,
      }
      discardPendingSpellCast(g, resolution)
      const casterPlayerId = effectPlayerId(g, resolution)
      resolution.pendingSpellCast.casterPlayerId = casterPlayerId
      resolution.effectPlayerId = casterPlayerId
      resolution.spellDamageBonus = spellBreachDamageBonus(breach)
      resolution.spellAdditionalDamageBonus = Math.max(0, effect.bonusDamage ?? 0)
      resolution.spellDamageEffectSeen = false
      const castEffects: CardEffect[] = faceDown
        ? [{ kind: 'deal_damage', amount: 2, target: 'nemesis_or_minion' } satisfies CardEffect]
        : matchingBlocks(choice.cardId, casterPlayerId, g, { kind: 'on_cast' }).flatMap(block => block.effects)
      castEffects.push(...breachOnCastEffects(g, spellOwner, breach, casterPlayerId))
      addRemainingEffects(resolution, [
        ...castEffects,
        ...(resolution.pendingSpellCast.transferToAlly ? [{ kind: 'place_cast_spell_in_ally_hand' } satisfies CardEffect] : []),
        { kind: 'resolve_spell_damage_bonus' },
        { kind: 'finalize_spell_cast' },
      ])
      messages.push(`Cast ${card.name}${effect.discard === false ? ' without discarding it' : ''}`)
      continue
    }
  }

  if ((resolution.spellDamageBonus || resolution.spellAdditionalDamageBonus) && !resolution.spellDamageEffectSeen) {
    const bonusEffect: CardEffect = {
      kind: 'deal_damage', amount: 0, target: 'nemesis_or_minion',
    }
    const targets = getDamageTargets(g, bonusEffect.target)
    if (targets.length > 1) {
      resolution.spellDamageEffectSeen = true
      const decision = createDecision(g, 'Choose a damage target', 'select_damage_target',
        { targets }, resolution.sourceCardId,
      )
      messages.push(...pauseEffect(g, resolution, bonusEffect, decision))
      return messages
    }
    if (targets.length === 1) {
      resolution.spellDamageEffectSeen = true
      messages.push(dealDamage(g, targets[0]!, applySpellDamageBonus(resolution, 0)))
    }
  }

  if (!g.gameOver && resolution.afterAbilityPlayerId && resolution.remainingEffects.length === 0) {
    const abilityPlayerId = resolution.afterAbilityPlayerId
    resolution.afterAbilityPlayerId = undefined
    resolution.effectPlayerId = abilityPlayerId
    const effects = collectPlayerCardTriggerEffects(g, { kind: 'on_ability_resolved' })
    if (effects.length > 0) {
      addRemainingEffects(resolution, effects)
      return [...messages, ...runEffectResolution(g, resolution)]
    }
  }

  clearPendingSpellCast(resolution)

  if (resolution.nemesisResume && g.currentTurn === 'nemesis' && g.nemesisResolution) {
    // This also handles a final effect that ends the game, where the normal
    // Nemesis continuation is intentionally not started.
    discardCompletedNemesisCard(g, g.nemesisResolution)
  }
  g.pendingEffect = null
  if (!g.gameOver && resolution.nemesisResume && g.currentTurn === 'nemesis' && g.nemesisResolution) {
    return [...messages, ...advanceNemesisTurn(g)]
  }
  return messages
}

/** Resolve the matching effect blocks for a card event. */
export function resolveEffects(
  g: GameState, sourcePlayerId: string | undefined, effects: CardEffect[],
  sourceCardId?: string, spellDamageBonus = 0, effectPlayerIdOverride?: string,
  nemesisResume = false, pendingSpellCast?: PendingSpellCast,
  lastGainedCardId?: string, afterAbilityPlayerId?: string,
): string[] {
  if (g.pendingDecision || g.pendingEffect) return ['Another card effect is already waiting for a decision']
  return runEffectResolution(g, {
    sourcePlayerId,
    sourceCardId,
    remainingEffects: [...effects],
    spellDamageBonus,
    effectPlayerId: effectPlayerIdOverride,
    nemesisResume,
    pendingSpellCast,
    lastGainedCardId,
    afterAbilityPlayerId,
  })
}

export function resolveCardEffects(
  g: GameState, playerId: string, sourceCardId: string, trigger: CardEffectTrigger,
  lastGainedCardId?: string, spellDamageBonus = 0, pendingSpellCast?: PendingSpellCast,
): string[] {
  const blocks = matchingBlocks(sourceCardId, playerId, g, trigger)
  if (blocks.length === 0 && !pendingSpellCast) return []
  return runEffectResolution(g, {
    sourcePlayerId: playerId,
    sourceCardId,
    remainingEffects: blocks.flatMap(block => block.effects),
    lastGainedCardId,
    spellDamageBonus,
    pendingSpellCast,
  })
}

export interface PreppedCardAction {
  breachIndex: number
  spellIndex: number
  cardId: string
  /** Whether the action targets a played card or the prepped spell itself. */
  kind: 'return_card_to_hand' | 'activate_effect'
  choices: CardChoice[]
  marker: string
  /** Whether the action can be activated repeatedly while its conditions remain true. */
  repeatable: boolean
}

function findReturnCardEffect(effects: CardEffect[]): Extract<CardEffect, { kind: 'return_card_to_hand' }> | null {
  for (const effect of effects) {
    if (effect.kind === 'return_card_to_hand') return effect
    if (effect.kind === 'choose_optional' || effect.kind === 'choose_one') {
      const nested = effect.kind === 'choose_optional'
        ? findReturnCardEffect(effect.effects)
        : effect.options.map(option => findReturnCardEffect(option.effects)).find(Boolean) ?? null
      if (nested) return nested
    }
  }
  return null
}

function isDeferredReturnAction(effects: CardEffect[]): boolean {
  if (effects.length !== 1) return false
  const effect = effects[0]!
  if (effect.kind === 'return_card_to_hand') return true
  if (effect.kind === 'choose_optional') return isDeferredReturnAction(effect.effects)
  if (effect.kind === 'choose_one') {
    return effect.options.length > 0 && effect.options.every(option => isDeferredReturnAction(option.effects))
  }
  return false
}

/** Main-phase while-prepped blocks are either board-card actions or explicit
 * clicks on the spell itself. Automatic resolution must leave both kinds
 * untouched until the player activates them. */
function isManualPreppedActionBlock(block: CardEffectBlock): boolean {
  return block.manualActivation === true || isDeferredReturnAction(block.effects)
}

/** Whether a typed effect sequence requires at least one prepared spell. */
function containsCastAnyNumberPreppedSpells(effects: CardEffect[]): boolean {
  return effects.some(effect => {
    if (effect.kind === 'cast_any_number_prepped_spells') return true
    if (effect.kind === 'conditional' || effect.kind === 'choose_optional') {
      return containsCastAnyNumberPreppedSpells(effect.effects)
    }
    if (effect.kind === 'choose_one') {
      return effect.options.some(option => containsCastAnyNumberPreppedSpells(option.effects))
    }
    return false
  })
}

function getPreppedReturnActions(
  g: GameState, playerId: string, phase: 'main_phase',
): PreppedCardAction[] {
  const p = getPlayer(g, playerId)
  const turnEffects = getPlayerTurnEffects(p)
  const actions: PreppedCardAction[] = []
  for (const breach of p.breaches) {
    if (!isPresentBreach(breach)) continue
    for (const [spellIndex, cardId] of breach.prepSpells.entries()) {
      const blocks = matchingBlocks(cardId, playerId, g, { kind: 'while_prepped', phase })
      for (const [blockIndex, block] of blocks.entries()) {
        const effect = findReturnCardEffect(block.effects)
        const isReturnAction = !!effect && isDeferredReturnAction(block.effects)
        if (!isReturnAction && !block.manualActivation) continue
        const marker = `${cardId}:${breach.index}:${spellIndex}:${phase}:${blockIndex}`
        if (block.oncePerTurn && turnEffects.usedPreppedEffects.includes(marker)) continue
        if (isReturnAction && effect) {
          const choices = getCardChoices(g, playerId, effect.source)
          if (choices.length === 0) continue
          actions.push({ breachIndex: breach.index, spellIndex, cardId, kind: effect.kind, choices, marker, repeatable: !block.oncePerTurn })
        } else if (block.effects.length > 0) {
          actions.push({ breachIndex: breach.index, spellIndex, cardId, kind: 'activate_effect', choices: [], marker, repeatable: !block.oncePerTurn })
        }
      }
    }
  }
  return actions
}

/** Return main-phase prepped-spell actions that can be activated without blocking the turn. */
export function getPreppedCardActions(g: GameState, playerId: string): PreppedCardAction[] {
  if (g.pendingDecision || g.pendingEffect) return []
  return getPreppedReturnActions(g, playerId, 'main_phase')
}

/** Activate a selected main-phase action from a currently prepped spell. */
export function activatePreppedCardAction(
  g: GameState, playerId: string, choice: CardChoice,
): string | null {
  if (g.pendingDecision || g.pendingEffect) return 'Resolve the pending card decision first'
  const action = getPreppedCardActions(g, playerId)
    .find(candidate => candidate.choices.some(item =>
      item.zone === choice.zone && item.index === choice.index && item.cardId === choice.cardId))
  if (!action || action.kind !== 'return_card_to_hand') return 'That card is not an available prepped action'
  const p = getPlayer(g, playerId)
  const turnEffects = getPlayerTurnEffects(p)
  const breach = p.breaches.find(item => item.index === action.breachIndex)
  const block = breach?.prepSpells[action.spellIndex]
    ? matchingBlocks(breach.prepSpells[action.spellIndex]!, playerId, g, { kind: 'while_prepped', phase: 'main_phase' })
      .find((item, index) => `${breach.prepSpells[action.spellIndex]}:${breach.index}:${action.spellIndex}:main_phase:${index}` === action.marker)
    : undefined
  const returned = returnSelectedCard(g, playerId, choice)
  if (!returned) return 'That card is no longer available'
  if (block?.oncePerTurn) turnEffects.usedPreppedEffects.push(action.marker)
  return `Returned ${getCard(returned).name} to hand`
}

/** Activate a Main Phase while-prepped effect by clicking the prepped spell. */
export function activatePreppedSpellAction(
  g: GameState, playerId: string, breachIndex: number, spellIndex: number,
): string[] {
  if (g.pendingDecision || g.pendingEffect) return ['Resolve the pending card decision first']
  const action = getPreppedCardActions(g, playerId).find(candidate =>
    candidate.kind === 'activate_effect'
      && candidate.breachIndex === breachIndex
      && candidate.spellIndex === spellIndex,
  )
  if (!action) return ['That prepped spell has no available Main Phase action']

  const p = getPlayer(g, playerId)
  const breach = p.breaches.find(item => item.index === breachIndex)
  const cardId = breach?.prepSpells[spellIndex]
  if (!breach || !cardId || cardId !== action.cardId) return ['That prepped spell is no longer available']
  const block = matchingBlocks(cardId, playerId, g, { kind: 'while_prepped', phase: 'main_phase' })
    .find((item, index) => `${cardId}:${breachIndex}:${spellIndex}:main_phase:${index}` === action.marker)
  if (!block || !block.manualActivation) return ['That prepped spell has no available Main Phase action']

  if (block.oncePerTurn) getPlayerTurnEffects(p).usedPreppedEffects.push(action.marker)
  return runEffectResolution(g, {
    sourcePlayerId: playerId,
    sourceCardId: cardId,
    remainingEffects: [...block.effects],
    preppedPhase: 'main_phase',
  })
}

/** A clickable Main Phase action exposed by a face-up Mage-specific card in play. */
export interface PlayerCardInPlayAction {
  cardIndex: number
  cardId: string
  marker: string
  repeatable: boolean
}

/** Return actions from a displayed player's in-play cards using the current turn actor's state. */
export function getPlayerCardInPlayActions(g: GameState, playerId: string): PlayerCardInPlayAction[] {
  if (g.pendingDecision || g.pendingEffect || g.currentPhase !== 'main' || g.currentTurn === 'nemesis') return []
  const player = getPlayer(g, playerId)
  const actingPlayerId = g.currentTurn
  ensurePlayerCollections(player)
  const used = getPlayerTurnEffects(getPlayer(g, actingPlayerId)).usedPlayerCardEffects ?? []
  const actions: PlayerCardInPlayAction[] = []
  for (const [cardIndex, cardId] of player.playerCardsInPlay!.entries()) {
    const blocks = matchingBlocks(
      cardId, playerId, g, { kind: 'while_in_play', phase: 'main_phase' }, cardIndex, actingPlayerId,
    )
    for (const [blockIndex, block] of blocks.entries()) {
      if (!block.manualActivation || block.effects.length === 0) continue
      if (containsCastAnyNumberPreppedSpells(block.effects) &&
        !getPreppedSpellChoices(g).some(choice => choice.playerId === actingPlayerId)) continue
      const marker = `in_play:${cardId}:${cardIndex}:main_phase:${blockIndex}`
      if (block.oncePerTurn && used.includes(marker)) continue
      actions.push({ cardIndex, cardId, marker, repeatable: !block.oncePerTurn })
    }
  }
  return actions
}

/** Resolve a clicked Main Phase action from a face-up Mage-specific card in play. */
export function activatePlayerCardInPlayAction(
  g: GameState, playerId: string, cardIndex: number,
): string[] {
  if (g.pendingDecision || g.pendingEffect) return ['Resolve the pending card decision first']
  if (g.currentPhase !== 'main' || g.currentTurn === 'nemesis') {
    return ['Player cards in play can only be activated during a player Main Phase']
  }
  const actingPlayerId = g.currentTurn
  const actions = getPlayerCardInPlayActions(g, playerId)
  const action = actions.find(candidate => candidate.cardIndex === cardIndex)
  if (!action) return ['That Player card in play has no available Main Phase action']
  const player = getPlayer(g, playerId)
  const cardId = player.playerCardsInPlay?.[cardIndex]
  if (!cardId || cardId !== action.cardId) return ['That Player card in play is no longer available']
  const block = matchingBlocks(
    cardId, playerId, g, { kind: 'while_in_play', phase: 'main_phase' }, cardIndex, actingPlayerId,
  )
    .find((candidate, blockIndex) => `in_play:${cardId}:${cardIndex}:main_phase:${blockIndex}` === action.marker)
  if (!block || !block.manualActivation) return ['That Player card in play has no available Main Phase action']
  if (block.oncePerTurn) getPlayerTurnEffects(getPlayer(g, actingPlayerId)).usedPlayerCardEffects!.push(action.marker)
  return runEffectResolution(g, {
    sourcePlayerId: playerId,
    effectPlayerId: actingPlayerId,
    sourceCardId: cardId,
    remainingEffects: [...block.effects],
    preppedPhase: 'main_phase',
  })
}

/** Resolve effects that belong to spells currently prepped on the player's breaches. */
export function resolvePreppedEffects(
  g: GameState, playerId: string, phase: 'casting_phase_end' | 'main_phase',
): string[] {
  if (g.pendingDecision || g.pendingEffect) return ['Another card effect is already waiting for a decision']
  const p = getPlayer(g, playerId)
  const turnEffects = getPlayerTurnEffects(p)
  const allEffects: CardEffect[] = []
  const seen = new Set<string>()

  for (const breach of p.breaches) {
    if (!isPresentBreach(breach)) continue
    for (const [spellIndex, cardId] of breach.prepSpells.entries()) {
      const blocks = matchingBlocks(cardId, playerId, g, { kind: 'while_prepped', phase })
      for (const [blockIndex, block] of blocks.entries()) {
      // Main-phase card actions are exposed as clickable choices instead of a blocking modal.
      if (phase === 'main_phase' && isManualPreppedActionBlock(block)) continue
      const blockEffects: CardEffect[] = phase === 'casting_phase_end' && block.requiresConfirmation
      ? [{
            kind: 'confirm_prepped_effect',
            prompt: `Resolve ${getCard(cardId).name}'s effect`,
            cardId,
            breachIndex: breach.index,
            spellIndex,
            effects: block.effects,
          }]
        : block.effects
      if (!block.oncePerTurn) {
        allEffects.push(...blockEffects)
        continue
      }
      const marker = `${cardId}:${breach.index}:${spellIndex}:${phase}:${blockIndex}`
      if (turnEffects.usedPreppedEffects.includes(marker) || seen.has(marker)) continue
      seen.add(marker)
      turnEffects.usedPreppedEffects.push(marker)
      allEffects.push(...blockEffects)
      }
    }
  }

  if (allEffects.length === 0) return []
  return runEffectResolution(g, {
    sourcePlayerId: playerId,
    remainingEffects: allEffects,
    preppedPhase: phase,
  })
}

/** Complete the currently pending card decision and continue its effect sequence. */
export function resolvePendingDecision(
  g: GameState, decisionId: string, answer: PendingDecisionAnswer,
): string[] {
  const decision = g.pendingDecision
  if (decision?.kind === 'select_setup_devour_pile') {
    if (decision.id !== decisionId || answer.kind !== 'select_setup_devour_pile') {
      return ['Invalid setup Devour choice']
    }
    const choice = decision.candidates.find(candidate =>
      candidate.pileIndex === answer.choice.pileIndex && candidate.cardId === answer.choice.cardId,
    )
    const pile = choice ? g.market.piles[choice.pileIndex] : null
    if (!choice || !pile || pile.cardId !== choice.cardId || pile.remaining <= 0) {
      return ['The selected supply pile is no longer available']
    }

    const messages = devourMarketPile(g, choice.pileIndex, 1)
    const remainingChoices = decision.remainingChoices - 1
    if (g.gameOver || remainingChoices <= 0) {
      g.pendingDecision = null
      return [...messages, 'Increased difficulty setup complete']
    }

    const candidates = marketPileChoices(g).filter(candidate => candidate.remaining > 0)
    if (candidates.length === 0) {
      g.pendingDecision = null
      return [...messages, 'No supply piles remain to complete setup']
    }
    g.pendingDecision = createDecision(g,
      `Choose a supply pile to Devour (${remainingChoices} remaining)`,
      'select_setup_devour_pile',
      { candidates, remainingChoices },
    )
    return messages
  }
  if (decision?.kind === 'confirm_nemesis_draw') {
    if (decision.id !== decisionId || answer.kind !== 'confirm_nemesis_draw' || !answer.accepted) {
      return ['Invalid Nemesis draw confirmation']
    }
    if (decision.source === 'specific_deck') {
      const resolution = g.pendingEffect
      if (!resolution || resolution.awaiting?.kind !== 'resolve_strike' ||
        resolution.revealedStrikeCardId !== decision.cardId) {
        return ['The revealed Nemesis specific card is no longer available']
      }
      const effect = resolution.awaiting
      resolution.awaiting = undefined
      g.pendingDecision = null
      addRemainingEffects(resolution, [effect])
      return [`Confirmed specific deck draw: ${getCard(decision.cardId).name}`, ...runEffectResolution(g, resolution)]
    }
    const resolution = g.nemesisResolution
    if (!resolution || resolution.drawnCardId !== decision.cardId || !resolution.drawnCardRevealed) {
      return ['The revealed Nemesis card is no longer available']
    }
    g.pendingDecision = null
    return [`Confirmed Nemesis draw: ${getCard(decision.cardId).name}`]
  }
  if (decision?.kind === 'confirm_nemesis_effect') {
    if (decision.id !== decisionId || answer.kind !== 'confirm_nemesis_effect' || !answer.accepted) {
      return ['Invalid Nemesis effect confirmation']
    }
    const resolution = g.nemesisResolution
    if (!resolution || resolution.activeCardInstanceId !== decision.instanceId ||
      resolution.activeCardId !== decision.cardId || resolution.activeTrigger !== decision.trigger) {
      return ['The Nemesis effect is no longer available']
    }
    resolution.mainEffectConfirmed = true
    g.pendingDecision = null
    return [`Confirmed Nemesis effect: ${getCard(decision.cardId).name}`]
  }
  const pendingNemesisDiscard = g.pendingNemesisDiscard
  if (pendingNemesisDiscard) {
    if (!decision) return ['No pending card decision']
    if (decision.id !== decisionId) return ['Stale card decision']
    const cost = pendingNemesisDiscard.costs[pendingNemesisDiscard.nextCostIndex - 1]
    if (!cost) return ['Pending To Discard cost is invalid']
    if (cost.kind === 'destroy_prepped_spells') {
      if (decision.kind !== 'select_prepped_spells' || answer.kind !== 'select_prepped_spells') {
        return ['Decision answer has the wrong type']
      }
      const amount = Math.max(0, cost.amount)
      if (answer.choices.length !== amount) {
        return [`Choose exactly ${amount} eligible prepped spell(s)`]
      }
      const selected = answer.choices
      const candidateKeys = new Set(decision.candidates.map(choice =>
        `${choice.playerId}:${choice.breachIndex}:${choice.spellIndex}:${choice.cardId}`))
      const selectedKeys = new Set<string>()
      for (const candidate of selected) {
        const key = `${candidate.playerId}:${candidate.breachIndex}:${candidate.spellIndex}:${candidate.cardId}`
        if (selectedKeys.has(key) || !candidateKeys.has(key) ||
          (getPreppedSpellCost(g, candidate.playerId, candidate.breachIndex, candidate.spellIndex) ?? 0) < (cost.minCost ?? 0)) {
          return ['Invalid prepped spell choice']
        }
        const owner = getPlayer(g, candidate.playerId)
        const breach = owner.breaches.find(item => item.index === candidate.breachIndex)
        if (!breach || breach.prepSpells[candidate.spellIndex] !== candidate.cardId) {
          return ['The selected prepped spell is no longer available']
        }
        selectedKeys.add(key)
      }
      pendingNemesisDiscard.selectedPreppedSpells.push(...selected)
      pendingNemesisDiscard.selectedPreppedSpellPayments.push({
        costIndex: pendingNemesisDiscard.nextCostIndex - 1,
        choices: selected,
      })
      g.pendingDecision = null
      return continueNemesisDiscard(g)
    }
    if (decision.kind !== 'select_cards' || answer.kind !== 'select_cards') {
      return ['Decision answer has the wrong type']
    }
    if (cost.kind !== 'destroy_cards' && cost.kind !== 'discard_cards') {
      return ['Pending To Discard cost is invalid']
    }
    const selected = answer.choices
    const amount = Math.max(0, cost.amount)
    if (selected.length !== amount || !selected.every(choice =>
      (cost.kind === 'discard_cards' || getCard(choice.cardId).cost >= (cost.minCost ?? 0)) &&
      cardChoiceMatches(choice, cost.source))) {
      return [`Choose exactly ${amount} eligible card(s) to destroy`]
    }
    const candidates = getCardChoices(g, pendingNemesisDiscard.playerId, cost.source)
      .filter(choice => cost.kind === 'discard_cards' || getCard(choice.cardId).cost >= (cost.minCost ?? 0))
    if (!selectedChoicesAreCurrent(g, pendingNemesisDiscard.playerId, candidates, selected)) {
      return ['Card selection is no longer valid']
    }
    pendingNemesisDiscard.selectedCards.push(...selected)
    pendingNemesisDiscard.selectedCardPayments.push({
      costIndex: pendingNemesisDiscard.nextCostIndex - 1,
      choices: selected,
    })
    g.pendingDecision = null
    return continueNemesisDiscard(g)
  }
  const resolution = g.pendingEffect
  if (!decision || !resolution) return ['No pending card decision']
  if (decision.id !== decisionId) return ['Stale card decision']
  if (decision.kind !== answer.kind) return ['Decision answer has the wrong type']
  const effect = resolution.awaiting
  if (!effect) return ['Pending decision has no effect continuation']
  g.pendingDecision = null
  resolution.awaiting = undefined
  const restore = () => {
    g.pendingDecision = decision
    resolution.awaiting = effect
  }

  if (answer.kind === 'confirm_prepped_effect') {
    if (
      decision.kind !== 'confirm_prepped_effect' ||
      effect.kind !== 'confirm_prepped_effect' ||
      decision.cardId !== effect.cardId ||
      decision.breachIndex !== effect.breachIndex
      || decision.spellIndex !== effect.spellIndex
    ) {
      restore()
      return ['Invalid prepped effect confirmation']
    }
    addRemainingEffects(resolution, effect.effects)
  } else if (answer.kind === 'choose_one') {
    if (decision.kind !== 'choose_one') return ['Decision answer has the wrong type']
    const selected = decision.options.find(option => option.id === answer.optionId)
    if (selected?.disabled) {
      restore()
      return ['This choice is not available']
    }
    if (effect.kind === 'reveal_top_cards') {
      if (answer.optionId !== 'discard' && answer.optionId !== 'keep') {
        restore()
        return ['Invalid reveal choice']
      }
      const revealed = resolution.revealedTopCard
      const player = revealed ? getPlayer(g, revealed.playerId) : null
      if (!revealed || !player || player.deck[0] !== revealed.cardId) {
        restore()
        return ['The revealed card is no longer on top of the deck']
      }
      if (answer.optionId === 'discard') {
        player.deck.shift()
        player.discard.unshift(revealed.cardId)
      }
      resolution.revealedTopCard = undefined
      addRemainingEffects(resolution, [effect])
      return [`${player.mageType} ${answer.optionId === 'discard' ? 'discards' : 'keeps'} ${getCard(revealed.cardId).name}`, ...runEffectResolution(g, resolution)]
    }
    const source = effect.kind === 'choose_one' ? effect.options.find(option => option.id === answer.optionId) : undefined
    if (!source) {
      g.pendingDecision = decision
      resolution.awaiting = effect
      return ['Invalid choice']
    }
    addRemainingEffects(resolution, source.effects)
  } else if (answer.kind === 'place_specific_deck_card') {
    if (decision.kind !== 'place_specific_deck_card' ||
      effect.kind !== 'reveal_specific_deck' || effect.mode !== 'return_each') {
      restore()
      return ['Decision answer has the wrong type']
    }
    const reveal = resolution.specificDeckReveal
    const owner = reveal ? getPlayer(g, reveal.playerId) : null
    const selectedIndex = reveal?.cards.indexOf(answer.cardId) ?? -1
    if (!reveal || !owner || reveal.mode !== 'return_each' ||
      selectedIndex < 0 || !['top', 'bottom'].includes(answer.placement) ||
      decision.cards.length !== reveal.cards.length ||
      decision.cards.some((card, index) => card.cardId !== reveal.cards[index])) {
      restore()
      return ['Invalid Mage-specific deck placement choice']
    }
    const [returned] = reveal.cards.splice(selectedIndex, 1)
    reveal.cardSlots?.splice(selectedIndex, 1)
    if (!returned) {
      restore()
      return ['The selected Mage-specific card is no longer available']
    }
    if (answer.placement === 'top') owner.specificDeck!.unshift(returned)
    else owner.specificDeck!.push(returned)
    if (reveal.cards.length > 0) {
      const nextDecision = createDecision(g,
        'Choose a revealed card to return to the top or bottom of the Mage-specific deck',
        'place_specific_deck_card',
        { cards: reveal.cards.map((cardId, index) => ({
          cardId,
          cardName: getCard(cardId).name,
          slot: reveal.cardSlots?.[index] ?? index,
        })) },
        resolution.sourceCardId,
      )
      return pauseEffect(g, resolution, effect, nextDecision)
    }
    resolution.specificDeckReveal = undefined
    return [
      `Returned ${returned ? getCard(returned).name : 'the revealed card'} to the ${answer.placement === 'top' ? 'top' : 'bottom'} of the Mage-specific deck`,
      ...runEffectResolution(g, resolution),
    ]
  } else if (answer.kind === 'choose_optional') {
    if (decision.kind !== 'choose_optional') return ['Decision answer has the wrong type']
    if (effect.kind === 'choose_optional') {
      if (answer.accepted && decision.accept.disabled) {
        restore()
        return ['This choice is not available']
      }
      resolution.lastOptionalAccepted = answer.accepted
      if (answer.accepted) addRemainingEffects(resolution, effect.effects)
    } else if (effect.kind === 'activate_ability') {
      const target = getPlayer(g, effect.mageId)
      const def = MAGES[target.mageType]
      if (!def || def.abilityEffects.length === 0) {
        restore()
        return ['This ability is not implemented yet']
      }
      if (answer.accepted) {
        if (target.charge < target.chargeThreshold) {
          restore()
          return ['The ability no longer has enough charge']
        }
        target.charge = 0
        addRemainingEffects(resolution, def.abilityEffects)
      }
    } else {
      restore()
      return ['Decision answer does not match the pending optional effect']
    }
  } else if (answer.kind === 'select_conjure_breach') {
    if (decision.kind !== 'select_conjure_breach' || effect.kind !== 'conjure' ||
      resolution.conjuredCard?.cardId !== decision.cardId) {
      restore()
      return ['Invalid Conjure choice']
    }
    const conjured = resolution.conjuredCard
    const owner = getPlayer(g, conjured.playerId)
    const putBack = () => {
      owner.deck.unshift(conjured.cardId)
      resolution.conjuredCard = undefined
    }
    if (!answer.choice) {
      putBack()
      return ['Conjured card returned to the top of the deck', ...runEffectResolution(g, resolution)]
    }
    const choice = decision.candidates.find(candidate =>
      candidate.playerId === answer.choice?.playerId && candidate.breachIndex === answer.choice?.breachIndex)
    const breach = choice && owner.breaches.find(item => item.index === choice.breachIndex)
    if (!choice || !breach || !isPresentBreach(breach) || breach.prepSpells.length >= getPrepSpellLimit(owner, breach.index) ||
      (!breach.opened && !breach.focusedThisTurn)) {
      restore()
      return ['The selected Breach is no longer available for Conjure']
    }
    breach.prepSpells.push(conjured.cardId)
    breach.preppedThisTurn ??= []
    breach.preppedThisTurn.push(true)
    breach.preppedSpellFaceDown ??= []
    breach.preppedSpellFaceDown.push(true)
    resolution.conjuredCard = undefined
    return [`Conjured ${getCard(conjured.cardId).name} face-down on Breach ${toRoman(breach.index)}`, ...runEffectResolution(g, resolution)]
  } else if (answer.kind === 'select_prepped_spell') {
    if (decision.kind !== 'select_prepped_spell') {
      restore()
      return ['Decision answer has the wrong type']
    }
    if (!answer.choice) {
      if (!decision.allowSkip || effect.kind !== 'cast_any_number_prepped_spells') {
        restore()
        return ['Skipping this prepped spell choice is not allowed']
      }
      return ['Skipped casting a prepped spell', ...runEffectResolution(g, resolution)]
    }
    const selectedChoice = answer.choice
    const choice = decision.candidates.find(candidate =>
      candidate.playerId === selectedChoice.playerId &&
      candidate.breachIndex === selectedChoice.breachIndex &&
      candidate.spellIndex === selectedChoice.spellIndex &&
      candidate.cardId === selectedChoice.cardId,
    )
    if (!choice) {
      restore()
      return ['Invalid prepped spell choice']
    }
    if (effect.kind === 'cast_any_number_prepped_spells') {
      resolution.selectedPreppedSpell = choice
      resolution.confirmedPreppedSpell = choice
      addRemainingEffects(resolution, [
        { kind: 'cast_prepped_spell', source: 'selected_prepped_spell' },
        { kind: 'cast_any_number_prepped_spells' },
      ])
      return runEffectResolution(g, resolution)
    }
    if (effect.kind !== 'cast_prepped_spell') {
      restore()
      return ['Decision answer has the wrong type']
    }
    resolution.selectedPreppedSpell = choice
    resolution.confirmedPreppedSpell = choice
    addRemainingEffects(resolution, [effect])
  } else if (answer.kind === 'select_breach') {
    if (decision.kind !== 'select_breach' ||
      (effect.kind !== 'focus_breach' && effect.kind !== 'focus_breach_all_players')) {
      restore()
      return ['Decision answer has the wrong type']
    }
    const choice = decision.candidates.find(candidate =>
      candidate.playerId === answer.choice.playerId && candidate.breachIndex === answer.choice.breachIndex)
    if (!choice) {
      restore()
      return ['Invalid breach choice']
    }
    const currentCandidates = effect.kind === 'focus_breach_all_players'
      ? getBreachChoices(g, 'self', choice.playerId)
      : getBreachChoices(g, effect.target, effectPlayerId(g, resolution))
    const current = currentCandidates.find(candidate =>
      candidate.playerId === choice.playerId && candidate.breachIndex === choice.breachIndex)
    if (!current) {
      restore()
      return ['The selected breach is no longer available']
    }
    const targetBreach = getPlayer(g, current.playerId).breaches.find(item => item.index === current.breachIndex)
    const wasOpened = targetBreach?.opened ?? false
    const message = applyFreeBreachFocus(g, current)
    if (effect.kind === 'focus_breach_all_players') {
      addRemainingEffects(resolution, [{ kind: 'focus_breach_all_players' }])
    }
    if (!wasOpened && targetBreach?.opened) {
      // The Breach-open trigger must resolve before the next player is focused.
      addRemainingEffects(resolution, collectBreachOpenedEffects(g))
    }
    return [message, ...runEffectResolution(g, resolution)]
  } else if (answer.kind === 'select_exhaust_breach') {
    if (decision.kind !== 'select_exhaust_breach' || effect.kind !== 'destroy_exhausted_breach') {
      restore()
      return ['Decision answer has the wrong type']
    }
    const choice = decision.candidates.find(candidate =>
      candidate.playerId === answer.choice.playerId && candidate.breachIndex === answer.choice.breachIndex)
    if (!choice || choice.playerId !== effect.playerId) {
      restore()
      return ['Invalid breach choice']
    }
    const current = getExhaustBreachChoices(g, effect.playerId)
      .find(candidate => candidate.playerId === choice.playerId && candidate.breachIndex === choice.breachIndex)
    if (!current) {
      restore()
      return ['The selected breach is no longer available']
    }
    const message = destroyExhaustedBreach(g, current)
    return [message, ...runEffectResolution(g, resolution)]
  } else if (answer.kind === 'select_cards') {
    if (decision.kind !== 'select_cards') return ['Decision answer has the wrong type']
    const selected = answer.choices
    if (selected.length < decision.min || selected.length > decision.max) {
      restore()
      return [`Choose between ${decision.min} and ${decision.max} card(s)`]
    }
    const currentPlayerId = effectPlayerId(g, resolution)
    const selectionOwnerId = effect.kind === 'select_breach_upgrade_card'
      ? effect.ownerId
      : currentPlayerId
    if (!selectedChoicesAreCurrent(g, selectionOwnerId, decision.candidates, selected)) {
      restore()
      return ['Card selection is no longer valid']
    }
    if (effect.kind === 'select_breach_upgrade_card') {
      const choice = selected[0]
      const candidate = choice && decision.candidates.find(item =>
        item.zone === choice.zone && item.index === choice.index && item.cardId === choice.cardId,
      )
      const owner = getPlayer(g, effect.ownerId)
      const card = choice ? getCard(choice.cardId) : null
      const breach = owner.breaches.find(item => item.index === effect.breachIndex)
      if (decision.source !== 'specific_deck' || decision.ownerId !== owner.id || selected.length !== 1 ||
        !choice || choice.zone !== 'specific_deck' || !candidate || candidate.disabled ||
        !card || card.type !== 'breach_upgrade' || (owner.knowledge ?? 0) < card.cost ||
        !breach || !isPresentBreach(breach)) {
        restore()
        return ['The selected Breach Upgrade is no longer available or affordable']
      }
      addRemainingEffects(resolution, [{
        kind: 'install_breach_upgrade_card',
        cardId: card.id,
        breachIndex: effect.breachIndex,
        ownerId: owner.id,
      }])
      return [`Selected ${card.name}`, ...runEffectResolution(g, resolution)]
    }
    if (effect.kind === 'discard_cards') {
      if (!selected.every(choice => cardChoiceMatches(choice, effect.source))) {
        restore()
        return ['Invalid card source']
      }
      if (effect.cardType && !selected.every(choice => getCard(choice.cardId).type === effect.cardType)) {
        restore()
        return ['Invalid card type']
      }
      const removed = discardSelectedCards(g, currentPlayerId, selected)
      resolution.lastSelectedCardCount = removed.length
      resolution.lastSelectedCardCost = removed.length > 0 ? Math.max(...removed.map(id => getCard(id).cost)) : 0
      return [`Discarded ${removed.map(id => getCard(id).name).join(', ')}`, ...runEffectResolution(g, resolution)]
    }
    if (effect.kind === 'destroy_cards') {
      if (effect.source !== 'self' && !selected.every(choice => cardChoiceMatches(choice, effect.source as CardSelectionSource))) {
        restore()
        return ['Invalid card source']
      }
      const removed = removeSelectedCards(g, currentPlayerId, selected)
      const p = getPlayer(g, currentPlayerId)
      ensurePlayerCollections(p)
      removed.forEach(cardId => destroyOwnedCard(p, cardId))
      resolution.lastSelectedCardCount = removed.length
      resolution.lastSelectedCardCost = removed.length > 0 ? Math.max(...removed.map(id => getCard(id).cost)) : 0
      return [`Destroyed ${removed.map(id => getCard(id).name).join(', ')}`, ...runEffectResolution(g, resolution)]
    }
    if (effect.kind === 'destroy_cards_equal_to_power_tokens') {
      if (selected.length === 0 || !selected.every(choice => cardChoiceMatches(choice, 'hand_or_discard'))) {
        restore()
        return ['Choose cards from hand or discard pile']
      }
      const tokenOwner = getPlayer(g, resolution.sourcePlayerId ?? effect.playerId ?? currentPlayerId)
      const target = getPlayer(g, effect.playerId ?? currentPlayerId)
      const count = playerCardPowerTokenCount(tokenOwner, effect.cardId)
      if (selected.length !== count || !selectedChoicesAreCurrent(g, target.id, decision.candidates, selected)) {
        restore()
        return [`Choose exactly ${count} card(s) to destroy`]
      }
      const removed = removeSelectedCards(g, target.id, selected)
      removed.forEach(cardId => destroyOwnedCard(target, cardId))
      addRemainingEffects(resolution, [{ kind: 'destroy_player_card_in_play', cardId: effect.cardId, playerId: tokenOwner.id }])
      return [`Destroyed ${removed.map(id => getCard(id).name).join(', ')}`, ...runEffectResolution(g, resolution)]
    }
    if (effect.kind === 'move_cards_to_swap_zone') {
      if (!selected.every(choice => cardChoiceMatches(choice, effect.source) && cardNameMatchesAny(choice.cardId, effect.nameIncludes))) {
        restore()
        return ['Only matching Crystal or Spark cards can enter the Swap zone']
      }
      const moved = removeSelectedCards(g, currentPlayerId, selected)
      const player = getPlayer(g, currentPlayerId)
      ensurePlayerCollections(player)
      player.swapZone!.push(...moved)
      return [
        ...(moved.length > 0 ? [`Moved ${moved.map(id => getCard(id).name).join(', ')} to the Swap zone`] : []),
        ...runEffectResolution(g, resolution),
      ]
    }
    if (effect.kind === 'gain_card_from_swap_zone') {
      const choice = selected[0]
      if (!choice || selected.length !== 1 || !cardNameMatchesAny(choice.cardId, effect.nameIncludes)) {
        restore()
        return ['Choose one matching card from the Swap zone']
      }
      const player = getPlayer(g, currentPlayerId)
      const cardId = gainSwapZoneCard(player, choice)
      if (!cardId) {
        restore()
        return ['The selected Swap zone card is no longer available']
      }
      return [`Gained ${getCard(cardId).name} from the Swap zone`, ...runEffectResolution(g, resolution)]
    }
    if (effect.kind === 'reveal_specific_deck' && effect.mode === 'put_one_into_play') {
      const reveal = resolution.specificDeckReveal
      const selectedChoice = selected[0]
      const owner = reveal ? getPlayer(g, reveal.playerId) : null
      if (!reveal || !owner || !selectedChoice || selectedChoice.zone !== 'specific_deck' ||
        !reveal.cards.includes(selectedChoice.cardId)) {
        restore()
        return ['Choose one revealed Mage-specific card to put into play']
      }
      const revealed = owner.specificDeck!.splice(0, reveal.cards.length)
      if (revealed.length !== reveal.cards.length || revealed.some((cardId, index) => cardId !== reveal.cards[index])) {
        owner.specificDeck!.unshift(...revealed)
        restore()
        return ['The revealed Mage-specific cards are no longer available']
      }
      const selectedIndex = reveal.cards.indexOf(selectedChoice.cardId)
      const putIntoPlay = revealed[selectedIndex]
      const returned = revealed.filter((_, index) => index !== selectedIndex)
      if (!putIntoPlay) {
        restore()
        return ['The selected Mage-specific card is no longer available']
      }
      owner.specificDeck!.push(...returned)
      resolution.specificDeckReveal = undefined
      addRemainingEffects(resolution, putPlayerCardIntoPlay(g, owner.id, putIntoPlay))
      return [`Put ${getCard(putIntoPlay).name} into play`, ...runEffectResolution(g, resolution)]
    }
    if (effect.kind === 'play_card_from_hand') {
      const choice = selected[0]
      if (!choice || choice.zone !== 'hand' || getCard(choice.cardId).type !== effect.cardType) {
        restore()
        return ['Invalid card choice']
      }
      resolution.selectedCardId = choice.cardId
      addRemainingEffects(resolution, [effect])
      return runEffectResolution(g, resolution)
    }
    if (effect.kind === 'return_card_to_hand') {
      const choice = selected[0]
      if (!choice || !cardChoiceMatches(choice, effect.source)) {
        restore()
        return ['Invalid card choice']
      }
      const returned = returnSelectedCard(g, currentPlayerId, choice)
      if (!returned) {
        restore()
        return ['Card selection is no longer valid']
      }
      return [`Returned ${getCard(returned).name} to hand`, ...runEffectResolution(g, resolution)]
    }
    if (effect.kind === 'return_cards_to_hand') {
      if (!selected.every(choice => choice.zone === effect.source && getCard(choice.cardId).type === 'spell')) {
        restore()
        return ['Invalid spell selection']
      }
      const removed = removeSelectedCards(g, currentPlayerId, selected)
      const player = getPlayer(g, currentPlayerId)
      const returned = [...removed].reverse()
      player.hand.push(...returned)
      return [`Returned ${returned.map(id => getCard(id).name).join(', ')} to hand`, ...runEffectResolution(g, resolution)]
    }
    restore()
    return ['Card selection does not match the pending effect']
  } else if (answer.kind === 'select_prepped_spells') {
    if (decision.kind !== 'select_prepped_spells') {
      restore()
      return ['Decision answer has the wrong type']
    }
    if (effect.kind === 'cast_any_number_prepped_spells') {
      const selected = answer.choices
      if (selected.length < decision.min || selected.length > decision.max) {
        restore()
        return [`Choose between ${decision.min} and ${decision.max} prepped spell(s)`]
      }
      const candidateKeys = new Set(decision.candidates.map(choice =>
        `${choice.playerId}:${choice.breachIndex}:${choice.spellIndex}:${choice.cardId}`))
      const selectedKeys = new Set<string>()
      for (const choice of selected) {
        const key = `${choice.playerId}:${choice.breachIndex}:${choice.spellIndex}:${choice.cardId}`
        const owner = getPlayer(g, choice.playerId)
        const breach = owner.breaches.find(item => item.index === choice.breachIndex)
        if (selectedKeys.has(key) || !candidateKeys.has(key) ||
          !breach || breach.prepSpells[choice.spellIndex] !== choice.cardId) {
          restore()
          return ['Invalid prepped spell choice']
        }
        selectedKeys.add(key)
      }
      addRemainingEffects(resolution, selected.map(choice => ({
        kind: 'cast_specific_prepped_spell', choice,
      } satisfies CardEffect)))
      return runEffectResolution(g, resolution)
    }
    if (decision.kind !== 'select_prepped_spells' || effect.kind !== 'discard_prepped_spells') {
      restore()
      return ['Decision answer has the wrong type']
    }
    const selected = answer.choices
    if (selected.length < decision.min || selected.length > decision.max) {
      restore()
      return [`Choose between ${decision.min} and ${decision.max} prepped spell(s)`]
    }
    const candidateKeys = new Set(decision.candidates.map(choice =>
      `${choice.playerId}:${choice.breachIndex}:${choice.spellIndex}:${choice.cardId}`))
    const selectedKeys = new Set<string>()
    for (const choice of selected) {
      const key = `${choice.playerId}:${choice.breachIndex}:${choice.spellIndex}:${choice.cardId}`
      if (selectedKeys.has(key) || !candidateKeys.has(key)) {
        restore()
        return ['Invalid prepped spell choice']
      }
      const owner = getPlayer(g, choice.playerId)
      const breach = owner.breaches.find(item => item.index === choice.breachIndex)
      if (!breach || breach.prepSpells[choice.spellIndex] !== choice.cardId) {
        restore()
        return ['The selected prepped spell is no longer available']
      }
      selectedKeys.add(key)
    }
    const requiredKeys = (decision.requiredChoices ?? []).map(choice =>
      `${choice.playerId}:${choice.breachIndex}:${choice.spellIndex}:${choice.cardId}`)
    if (requiredKeys.some(key => !selectedKeys.has(key))) {
      restore()
      return ['All required prepped spells must be selected']
    }
    discardPreppedSpellChoices(g, selected)
    return [`Discarded ${selected.map(choice => choice.cardName).join(', ')}`, ...runEffectResolution(g, resolution)]
  } else if (answer.kind === 'select_collective_cards') {
    if (decision.kind !== 'select_collective_cards') {
      restore()
      return ['Decision answer has the wrong type']
    }
    const selected = answer.choices
    if (selected.length < decision.min || selected.length > decision.max ||
      !selectedCollectiveCardsAreCurrent(g, decision.candidates, selected)) {
      restore()
      return ['Collective card selection is no longer valid']
    }
    if (effect.kind === 'discard_cards_collectively') {
      const amount = amountValue(g, effectPlayerId(g, resolution), effect.amount, resolution.sourceCardId)
      if (selected.length !== amount) {
        restore()
        return [`Choose exactly ${amount} card(s) to discard collectively`]
      }
      const removed = discardCollectiveCards(g, selected)
      return [`Players collectively discard ${removed.map(id => getCard(id).name).join(', ')}`, ...runEffectResolution(g, resolution)]
    }
    if (effect.kind === 'deal_gravehold_damage_with_gem_discard') {
      if (!selected.every(item => getCard(item.choice.cardId).type === 'gem')) {
        restore()
        return ['Only gems may be discarded for this effect']
      }
      const removed = discardCollectiveCards(g, selected)
      const damage = Math.max(0, effect.amount - selected.length * effect.reductionPerGem)
      const message = dealDamage(g, { kind: 'gravehold', id: 'gravehold', label: 'Gravehold' }, damage)
      return [`Discarded ${removed.map(id => getCard(id).name).join(', ')} to reduce damage`, message, ...runEffectResolution(g, resolution)]
    }
    if (effect.kind === 'cast_spell_from_hand') {
      if (selected.length !== 1 || selected[0]!.playerId === effectPlayerId(g, resolution) ||
        getCard(selected[0]!.choice.cardId).type !== 'spell') {
        restore()
        return ['Choose exactly one spell from an ally hand']
      }
      addRemainingEffects(resolution, [{
        kind: 'cast_selected_spell_from_hand',
        playerId: selected[0]!.playerId,
        cardId: selected[0]!.choice.cardId,
        remaining: Math.max(1, effect.times),
      }])
      return runEffectResolution(g, resolution)
    }
    restore()
    return ['Collective card selection does not match the pending effect']
  } else if (answer.kind === 'select_market_pile') {
    if (decision.kind !== 'select_market_pile' ||
      (effect.kind !== 'devour_market_cards' && effect.kind !== 'set_next_to_supply_pile' && effect.kind !== 'gain_card_from_market')) {
      restore()
      return ['Decision answer has the wrong type']
    }
    const choice = decision.candidates.find(candidate =>
      candidate.pileIndex === answer.choice.pileIndex && candidate.cardId === answer.choice.cardId,
    )
    const pile = choice ? g.market.piles[choice.pileIndex] : null
    if (!choice || !pile || pile.cardId !== choice.cardId || pile.remaining <= 0) {
      restore()
      return ['The selected supply pile is no longer available']
    }
    if (effect.kind === 'set_next_to_supply_pile') {
      const ownerId = resolution.sourcePlayerId ?? effectPlayerId(g, resolution)
      const treasureId = effect.cardId ?? resolution.sourceCardId
      if (!treasureId || !setPlayerCardSupplyTarget(g, ownerId, treasureId, choice!.pileIndex)) {
        restore()
        return ['The Treasure is no longer in Player cards in play']
      }
      return [`Set ${getCard(treasureId).name} next to ${choice!.cardName}`, ...runEffectResolution(g, resolution)]
    }
    if (effect.kind === 'gain_card_from_market') {
      const destination = effect.destination ?? 'discard_top'
      const message = gainCard(g, effectPlayerId(g, resolution), choice!.cardId,
        destination, choice!.pileIndex, false)
      if (message) {
        resolution.lastGainedCardId = choice!.cardId
        const gainingPlayerId = effectPlayerId(g, resolution)
        const followups = matchingBlocks(choice!.cardId, gainingPlayerId, g, { kind: 'on_gain' })
          .flatMap(block => block.effects)
        addRemainingEffects(resolution, [...followups, ...getSupplyPileGainEffects(g, choice!.pileIndex)])
      }
      return [message ?? 'Unable to gain the selected supply card', ...runEffectResolution(g, resolution)]
    }
    if (!choice || !pile || pile.cardId !== choice.cardId || pile.remaining <= 0) {
      restore()
      return ['The selected supply pile is no longer available']
    }
    const amount = amountValue(g, effectPlayerId(g, resolution), effect.amount, resolution.sourceCardId, resolution)
    return [...devourMarketPile(g, choice.pileIndex, amount), ...runEffectResolution(g, resolution)]
  } else if (answer.kind === 'select_player_target') {
    if (decision.kind !== 'select_player_target' ||
      (effect.kind !== 'draw_cards' && effect.kind !== 'deal_player_damage' &&
        effect.kind !== 'discard_cards' && effect.kind !== 'shuffle_discard_into_deck' &&
        effect.kind !== 'destroy_top_cards' && effect.kind !== 'place_cast_spell_in_ally_hand' &&
        effect.kind !== 'gain_aether_token')) {
      restore()
      return ['Decision answer has the wrong type']
    }
    const target = decision.targets.find(candidate => candidate.playerId === answer.target.playerId)
    if (!target) {
      restore()
      return ['Invalid player target']
    }
    const player = getPlayer(g, target.playerId)
    if (effect.kind === 'place_cast_spell_in_ally_hand') {
      const pending = resolution.pendingSpellCast
      if (!pending || !pending.transferToAlly || !getPlayerTargets(g, pending.playerId, 'ally').some(item => item.playerId === target.playerId)) {
        restore()
        return ['Invalid Transfer spell recipient']
      }
      pending.destinationPlayerId = target.playerId
      return [`Transfer spell will return to ${player.mageType}'s hand`, ...runEffectResolution(g, resolution)]
    }
    if (effect.kind === 'gain_aether_token') {
      const amount = Math.max(1, effect.amount ?? 1)
      player.aetherTokens = (player.aetherTokens ?? 0) + amount
      resolution.effectPlayerId = target.playerId
      return [`${player.mageType} gains ${amount} Aether token${amount === 1 ? '' : 's'}`, ...runEffectResolution(g, resolution)]
    }
    resolution.effectPlayerId = target.playerId
    if (effect.kind === 'draw_cards') {
      const drawn = drawCardsForPlayer(g, target.playerId, effect.amount)
      return [`${player.mageType} draws ${drawn} card(s)`, ...runEffectResolution(g, resolution)]
    }
    if (effect.kind === 'deal_player_damage') {
      const damage = amountValue(g, effectPlayerId(g, resolution), effect.amount, resolution.sourceCardId)
      const message = sufferPlayerDamage(
        g,
        target.playerId,
        damage,
      )
      const excess = Math.max(0, -player.hp)
      const death = checkPlayerDeath(g, target.playerId, true)
      if (death) queuePlayerExhaustion(resolution, target.playerId, excess)
      else if (player.exhausted) {
        const gameOver = checkGameOver(g)
        if (gameOver) resolution.remainingEffects = []
        return [message, ...(gameOver ? [gameOver] : []), ...runEffectResolution(g, resolution)]
      }
      return [message, ...(death ? [death] : []), ...runEffectResolution(g, resolution)]
    }
    resolution.effectPlayerId = target.playerId
    const targetedEffect = { ...effect, target: 'self' as const }
    addRemainingEffects(resolution, [targetedEffect])
    return [`${player.mageType} is the target`, ...runEffectResolution(g, resolution)]
  } else if (answer.kind === 'select_life_target') {
    if (decision.kind !== 'select_life_target' || effect.kind !== 'gain_life') {
      restore()
      return ['Decision answer has the wrong type']
    }
    const target = decision.targets.find(candidate => JSON.stringify(candidate) === JSON.stringify(answer.target))
    if (!target) {
      restore()
      return ['Invalid life target']
    }
    const message = gainLife(g, target, effect.amount)
    return [ ...(message ? [message] : []), ...runEffectResolution(g, resolution) ]
  } else if (answer.kind === 'reorder_turn_order') {
    if (decision.kind !== 'reorder_turn_order' || effect.kind !== 'reveal_turn_order_deck') {
      restore()
      return ['Decision answer has the wrong type']
    }
    const validIndexes = decision.cards.map(card => card.index)
    const selectedIndexes = answer.order
    if (
      selectedIndexes.length !== validIndexes.length ||
      new Set(selectedIndexes).size !== validIndexes.length ||
      selectedIndexes.some(index => !validIndexes.includes(index))
    ) {
      restore()
      return ['Turn order must include every revealed card exactly once']
    }
    g.turnOrderDeck = selectedIndexes.map(index => decision.cards.find(card => card.index === index)!.cardId)
    return ['Turn order deck reordered', ...runEffectResolution(g, resolution)]
  } else if (answer.kind === 'select_turn_order_card') {
    if (decision.kind !== 'select_turn_order_card' || effect.kind !== 'shuffle_turn_order_card') {
      restore()
      return ['Decision answer has the wrong type']
    }
    const choice = decision.cards.find(candidate =>
      candidate.index === answer.choice.index && candidate.cardId === answer.choice.cardId)
    if (!choice || g.turnOrderDiscard[choice.index] !== choice.cardId) {
      restore()
      return ['The selected turn order card is no longer available']
    }
    g.turnOrderDiscard.splice(choice.index, 1)
    g.turnOrderDeck = shuffle([...g.turnOrderDeck, choice.cardId])
    const target = getPlayer(g, choice.cardId)
    const damage = Math.max(0, effect.damage)
    const message = sufferPlayerDamage(g, target.id, damage)
    const excess = Math.max(0, -target.hp)
    const death = checkPlayerDeath(g, target.id, true)
    if (death) queuePlayerExhaustion(resolution, target.id, excess)
    const gameOver = !death && target.exhausted ? checkGameOver(g) : null
    if (gameOver) resolution.remainingEffects = []
    return [
      `Shuffled ${target.mageType}'s turn order card back into the deck`,
      message,
      ...(death ? [death] : []),
      ...(gameOver ? [gameOver] : []),
      ...runEffectResolution(g, resolution),
    ]
  } else if (answer.kind === 'confirm_turn_order_reveal') {
    if (decision.kind !== 'confirm_turn_order_reveal' || effect.kind !== 'reveal_turn_order_card') {
      restore()
      return ['Decision answer has the wrong type']
    }
    const top = g.turnOrderDeck[0]
    if (!top || top !== decision.cardId) {
      restore()
      return ['The revealed turn order card is no longer available']
    }
    const branchEffects = top === 'nemesis' ? effect.nemesisEffects : effect.playerEffects
    addRemainingEffects(
      resolution,
      effect.returnChoice
        ? [{ kind: 'place_revealed_turn_order_card' }, ...branchEffects]
        : branchEffects,
    )
    return [`Revealed ${top === 'nemesis' ? 'Nemesis' : 'Player'} turn order card`, ...runEffectResolution(g, resolution)]
  } else if (answer.kind === 'choose_turn_order_position') {
    if (decision.kind !== 'choose_turn_order_position' || effect.kind !== 'place_revealed_turn_order_card') {
      restore()
      return ['Decision answer has the wrong type']
    }
    const top = g.turnOrderDeck[0]
    if (!top || top !== decision.cardId) {
      restore()
      return ['The revealed turn order card is no longer available']
    }
    if (answer.position === 'bottom') g.turnOrderDeck.push(g.turnOrderDeck.shift()!)
    return [`Placed the revealed turn order card on the ${answer.position}`, ...runEffectResolution(g, resolution)]
  } else {
    if (decision.kind !== 'select_damage_target' || effect.kind !== 'deal_damage') {
      restore()
      return ['Decision answer has the wrong type']
    }
    const target = decision.targets.find(candidate => candidate.id === answer.target.id)
    if (!target) {
      restore()
      return ['Invalid damage target']
    }
    const amount = damageAmountValue(g, effectPlayerId(g, resolution), effect, resolution.sourceCardId, resolution)
    resolution.spellDamageEffectSeen = true
    const message = dealDamage(g, target, applySpellDamageBonus(resolution, amount))
    return [message, ...runEffectResolution(g, resolution)]
  }

  return runEffectResolution(g, resolution)
}

export function pendingDecision(g: GameState): PendingDecision | null {
  return g.pendingDecision
}

// ===== Aether System =====

export type SpendType = 'gem' | 'spell' | 'relic' | 'breach' | 'general'

export function getTotalAether(p: PlayerState): number {
  const conditionalEarned = Object.values(p.conditionalAetherEarned ?? {})
    .reduce((sum, amount) => sum + amount, 0)
  return conditionalEarned + p.bonusAether + (p.aetherTokens ?? 0)
}

/** Total conditional aether of a specific type earned this turn. */
export function getConditionalAetherByType(p: PlayerState, type: string): number {
  return p.conditionalAetherEarned?.[type] ?? 0
}

/** Remaining unspent conditional aether of a given type. */
export function getRemainingConditionalAether(p: PlayerState, type: string): number {
  return Math.max(0, getConditionalAetherByType(p, type) - (p.condAetherSpent[type] ?? 0))
}

/** All remaining conditional aether, keyed by type. */
export function getAllRemainingConditional(p: PlayerState): Record<string, number> {
  const result: Record<string, number> = {}
  for (const [type, amount] of Object.entries(p.conditionalAetherEarned ?? {})) {
    result[type] = amount
  }
  for (const [k, v] of Object.entries(p.condAetherSpent)) {
    result[k] = Math.max(0, (result[k] ?? 0) - v)
  }
  return result
}

function getAllCondTotal(p: PlayerState): number {
  return Object.values(p.conditionalAetherEarned ?? {})
    .reduce((sum, amount) => sum + amount, 0)
}

function getSpendableAether(p: PlayerState, type: SpendType): number {
  const totalCond = getAllCondTotal(p)
  const regularTotal = getTotalAether(p) - totalCond
  const regularAvail = Math.max(0, regularTotal - p.regularAetherSpent)
  const tokens = Math.max(0, p.aetherTokens ?? 0)
  if (type === 'general') return regularAvail + tokens
  const condAvail = getConditionalAetherByType(p, type) - (p.condAetherSpent[type] ?? 0)
  return regularAvail + Math.max(0, condAvail) + tokens
}

function spendAether(p: PlayerState, amount: number, type: SpendType): void {
  const tokenSpent = Math.min(Math.max(0, p.aetherTokens ?? 0), Math.max(0, amount))
  p.aetherTokens = Math.max(0, (p.aetherTokens ?? 0) - tokenSpent)
  const remaining = Math.max(0, amount - tokenSpent)
  if (type !== 'general') {
    const condAvail = getConditionalAetherByType(p, type) - (p.condAetherSpent[type] ?? 0)
    const fromCond = Math.min(Math.max(0, condAvail), remaining)
    p.condAetherSpent[type] = (p.condAetherSpent[type] ?? 0) + fromCond
    p.regularAetherSpent += remaining - fromCond
  } else {
    p.regularAetherSpent += remaining
  }
}

function breachCostReduction(p: PlayerState, action: 'focus' | 'open'): number {
  return getPlayerTurnEffects(p).nextBreachCostReductions
    .filter(reduction => reduction.actions.includes(action))
    .reduce((total, reduction) => total + reduction.amount, 0)
}

function consumeBreachCostReductions(p: PlayerState, action: 'focus' | 'open'): void {
  const effects = getPlayerTurnEffects(p)
  effects.nextBreachCostReductions = effects.nextBreachCostReductions
    .filter(reduction => !reduction.actions.includes(action))
}

// ===== Casting Phase =====

export interface CastableSpell {
  breachIndex: number; spellIndex: number; cardId: string; cardName: string; mustCast: boolean
}

export function getCastableSpells(g: GameState, playerId: string): CastableSpell[] {
  const p = getPlayer(g, playerId)
  return p.breaches.flatMap(b => {
    if (!isPresentBreach(b)) return []
    return b.prepSpells.map((cardId, spellIndex) => ({
      breachIndex: b.index,
      spellIndex,
      cardId,
      cardName: getCard(cardId).name,
      mustCast: !b.opened,
    }))
  })
}

export function castSpell(g: GameState, playerId: string, breachIndex: number, spellIndex = 0): string | null {
  const blocked = pendingActionMessage(g)
  if (blocked) return blocked
  const p = getPlayer(g, playerId)
  const b = p.breaches.find(br => br.index === breachIndex)
  if (!b || !isPresentBreach(b) || !b.prepSpells[spellIndex]) return 'No spell prepped on this breach'

  const cardId = b.prepSpells[spellIndex]!
  const cardDef = getCard(cardId)
  const spellDamageBonus = spellBreachDamageBonus(b)
  const faceDown = isFaceDownPreppedSpell(b, spellIndex)

  const name = cardDef.name

  const messages = [`Cast ${name}`]
  const pending: PendingSpellCast = {
    playerId, casterPlayerId: playerId, breachIndex, spellIndex, cardId,
    discard: !(b.special === 'transfer' && b.opened),
    transferToAlly: b.special === 'transfer' && b.opened,
    faceDown,
  }
  const directEffects: CardEffect[] = faceDown
    ? [{ kind: 'deal_damage', amount: 2, target: 'nemesis_or_minion' }]
    : matchingBlocks(cardDef.id, playerId, g, { kind: 'on_cast' }).flatMap(block => block.effects)
  directEffects.push(...breachOnCastEffects(g, p, b, playerId))
  if (pending.transferToAlly) directEffects.push({ kind: 'place_cast_spell_in_ally_hand' })
  if (pending.transferToAlly) directEffects.push({ kind: 'finalize_spell_cast' })
  messages.push(...resolveEffects(g, playerId, directEffects, cardDef.id, spellDamageBonus, undefined, false, pending))
  return messages.join('; ')
}

// ===== Main Phase =====

export function playCard(g: GameState, playerId: string, cardId: string): string | null {
  const blocked = pendingActionMessage(g)
  if (blocked) return blocked
  const p = getPlayer(g, playerId)
  const idx = p.hand.indexOf(cardId)
  if (idx === -1) return 'Card not in hand'

  const card = getCard(cardId)
  if (card.type === 'spell') return 'Spells must be prepped, use "r" command'
  if (card.type !== 'gem' && card.type !== 'relic' && card.type !== 'treasure') {
    return `${card.name} cannot be played from hand`
  }

  p.hand.splice(idx, 1)
  p.playedThisTurn.push(cardId)
  ensurePlayerCollections(p)
  p.cardPlayCountsThisTurn[cardId] = (p.cardPlayCountsThisTurn[cardId] ?? 0) + 1

  const messages = [`Played ${card.name}`]
  messages.push(...resolveCardEffects(g, playerId, cardId, { kind: 'on_play' }))
  return messages.join('; ')
}

export function prepSpell(
  g: GameState, playerId: string, cardId: string, breachIndex: number, handIndex?: number,
): string | null {
  const blocked = pendingActionMessage(g)
  if (blocked) return blocked
  const p = getPlayer(g, playerId)
  const idx = handIndex ?? p.hand.indexOf(cardId)
  if (idx < 0 || idx >= p.hand.length || p.hand[idx] !== cardId) return 'Card not in hand'

  const card = getCard(cardId)
  if (card.type !== 'spell') return 'Only spell cards can be prepped'

  const b = p.breaches.find(br => br.index === breachIndex)
  if (!b || !isPresentBreach(b)) return 'Invalid breach'
  const prepLimit = getPrepSpellLimit(p, breachIndex)
  if (b.prepSpells.length >= prepLimit) return `Breach already has ${prepLimit} spell(s)`
  if (!b.opened && !b.focusedThisTurn && !card.prepToClosedBreach) return 'Cannot prep on this breach'

  p.hand.splice(idx, 1)
  b.prepSpells.push(cardId)
  b.preppedThisTurn ??= []
  b.preppedThisTurn.push(true)
  b.preppedSpellFaceDown ??= []
  b.preppedSpellFaceDown.push(false)
  return `Prepped ${card.name} on Breach ${toRoman(breachIndex)}`
}

/** Return one of the player's prepped spells to their hand during Main Phase. */
export function returnPreppedSpellToHand(
  g: GameState, playerId: string, breachIndex: number, spellIndex: number,
): string | null {
  const blocked = pendingActionMessage(g)
  if (blocked) return blocked
  if (g.currentPhase !== 'main' || g.currentTurn !== playerId) return 'Prepped spells can only be returned during your Main Phase'

  const p = getPlayer(g, playerId)
  const breach = p.breaches.find(item => item.index === breachIndex)
  if (!breach || !isPresentBreach(breach)) return 'Invalid Breach'
  const cardId = breach.prepSpells[spellIndex]
  if (!cardId) return 'No spell is prepped at this position'
  if (isFaceDownPreppedSpell(breach, spellIndex)) {
    return 'Face-down Conjured spells cannot be returned to hand'
  }
  breach.prepSpells.splice(spellIndex, 1)
  breach.preppedThisTurn?.splice(spellIndex, 1)
  breach.preppedSpellFaceDown?.splice(spellIndex, 1)
  p.hand.push(cardId)
  return `Returned ${getCard(cardId).name} to hand`
}

/** Move a prepped spell during the player's turn, swapping with a spell at the target when needed. */
export function movePreppedSpell(
  g: GameState, playerId: string, sourceBreachIndex: number, sourceSpellIndex: number,
  targetBreachIndex: number, targetSpellIndex?: number,
): string | null {
  const blocked = pendingActionMessage(g)
  if (blocked) return blocked
  if (g.currentPhase !== 'main' || g.currentTurn !== playerId) return 'Prepped spells can only be moved before your turn ends'
  if (sourceBreachIndex === targetBreachIndex) return 'Choose a different Breach'

  const p = getPlayer(g, playerId)
  const source = p.breaches.find(breach => breach.index === sourceBreachIndex)
  const target = p.breaches.find(breach => breach.index === targetBreachIndex)
  if (!source || !target || !isPresentBreach(source) || !isPresentBreach(target)) return 'Invalid Breach'
  const sourceCardId = source.prepSpells[sourceSpellIndex]
  if (!sourceCardId) return 'No spell is prepped at the source position'
  // Most spells can only be prepared on an open or focused Breach. A spell
  // with the prepToClosedBreach keyword (for example Feral Lightning) keeps
  // that exception when it is repositioned from one Breach to another.
  const sourceCard = getCard(sourceCardId)
  if (!target.opened && !target.focusedThisTurn && !sourceCard.prepToClosedBreach) {
    return 'The target Breach is not available for preparation'
  }

  if (target.prepSpells.length > 0) {
    const swapIndex = targetSpellIndex ?? 0
    if (!target.prepSpells[swapIndex]) return 'No spell is prepped at the target position'
    const targetCardId = target.prepSpells[swapIndex]!
    source.prepSpells[sourceSpellIndex] = targetCardId
    target.prepSpells[swapIndex] = sourceCardId
    const sourceWasPrepped = source.preppedThisTurn?.[sourceSpellIndex] ?? false
    const targetWasPrepped = target.preppedThisTurn?.[swapIndex] ?? false
    source.preppedThisTurn ??= source.prepSpells.map(() => false)
    target.preppedThisTurn ??= target.prepSpells.map(() => false)
    source.preppedThisTurn[sourceSpellIndex] = targetWasPrepped
    target.preppedThisTurn[swapIndex] = sourceWasPrepped
    source.preppedSpellFaceDown ??= source.prepSpells.map(() => false)
    target.preppedSpellFaceDown ??= target.prepSpells.map(() => false)
    const sourceFaceDown = source.preppedSpellFaceDown[sourceSpellIndex] ?? false
    const targetFaceDown = target.preppedSpellFaceDown[swapIndex] ?? false
    source.preppedSpellFaceDown[sourceSpellIndex] = targetFaceDown
    target.preppedSpellFaceDown[swapIndex] = sourceFaceDown
    return `Swapped ${getCard(sourceCardId).name} and ${getCard(targetCardId).name}`
  }

  source.prepSpells.splice(sourceSpellIndex, 1)
  const movedWasPrepped = source.preppedThisTurn?.splice(sourceSpellIndex, 1)[0] ?? false
  const movedFaceDown = source.preppedSpellFaceDown?.splice(sourceSpellIndex, 1)[0] ?? false
  target.prepSpells.push(sourceCardId)
  target.preppedThisTurn ??= []
  target.preppedThisTurn.push(movedWasPrepped)
  target.preppedSpellFaceDown ??= []
  target.preppedSpellFaceDown.push(movedFaceDown)
  return `Moved ${getCard(sourceCardId).name} to Breach ${toRoman(targetBreachIndex)}`
}

export interface BuyableCard {
  pileIndex: number; cardId: string; cardName: string; cardType: string
  cost: number; remaining: number
}

/** Cost after typed Treasure modifiers attached to a supply pile. */
export function getMarketCardCost(g: GameState, pileIndex: number): number {
  const pile = g.market.piles[pileIndex]
  if (!pile) return 0
  let reduction = 0
  for (const owner of g.players) {
    ensurePlayerCollections(owner)
    for (const [cardIndex, cardId] of (owner.playerCardsInPlay ?? []).entries()) {
      if (playerCardSupplyTarget(owner, cardIndex) !== pileIndex) continue
      reduction += (getCard(cardId).effects ?? [])
        .filter(block => block.trigger.kind === 'while_set_next_to_supply')
        .flatMap(block => block.effects)
        .filter((effect): effect is Extract<CardEffect, { kind: 'reduce_supply_cost' }> => effect.kind === 'reduce_supply_cost')
        .reduce((sum, effect) => sum + Math.max(0, effect.amount), 0)
    }
  }
  return Math.max(0, getCard(pile.cardId).cost - reduction)
}

export function getBuyableCards(g: GameState): BuyableCard[] {
  return g.market.piles.map((pile, i) => {
    const card = getCard(pile.cardId)
    return {
      pileIndex: i, cardId: pile.cardId, cardName: card.name,
      cardType: card.type, cost: getMarketCardCost(g, i), remaining: pile.remaining,
    }
  })
}

export function buyCard(g: GameState, playerId: string, pileIndex: number): string | null {
  const blocked = pendingActionMessage(g)
  if (blocked) return blocked
  const pile = g.market.piles[pileIndex]
  if (!pile || pile.remaining <= 0) return 'Pile empty'

  const card = getCard(pile.cardId)
  const p = getPlayer(g, playerId)
  const spendType: SpendType = card.type === 'gem' ? 'gem'
    : card.type === 'spell' ? 'spell'
    : card.type === 'relic' ? 'relic' : 'general'
  const available = getSpendableAether(p, spendType)
  const cost = getMarketCardCost(g, pileIndex)

  if (available < cost) return `Need ${cost} Aether, have ${available}`

  spendAether(p, cost, spendType)
  const message = gainCard(g, playerId, pile.cardId, 'discard_top', pileIndex)
  if (!message) return null
  const defeat = g.gameOver && g.winner === 'nemesis' && usesDevouredPile(g)
    ? '; DEFEAT! All supply piles have been Devoured!'
    : ''
  return `Bought ${card.name} (${cost}a) -> ${message}${defeat}`
}

/** Buy the revealed top card of a Nemesis-specific supply pile. */
export function buySpecificPileCard(g: GameState, playerId: string): string | null {
  const blocked = pendingActionMessage(g)
  if (blocked) return blocked
  if (!usesDevouredPile(g)) return 'This Nemesis has no buyable specific pile'
  const cardId = g.nemesis.strikeDeck[0]
  if (!cardId) return 'The Devoured pile is empty'

  const card = getCard(cardId)
  const p = getPlayer(g, playerId)
  const spendType: SpendType = card.type === 'gem' ? 'gem'
    : card.type === 'spell' ? 'spell'
    : card.type === 'relic' ? 'relic' : 'general'
  const available = getSpendableAether(p, spendType)
  if (available < card.cost) return `Need ${card.cost} Aether, have ${available}`

  spendAether(p, card.cost, spendType)
  const message = gainCard(g, playerId, cardId, 'discard_top', undefined, true, true)
  return message ? `Gained ${card.name} from the Devoured pile (${card.cost}a) -> ${message}` : null
}

export function focusBreach(g: GameState, playerId: string, breachIndex: number): string | null {
  const blocked = pendingActionMessage(g)
  if (blocked) return blocked
  const p = getPlayer(g, playerId)
  const b = p.breaches.find(br => br.index === breachIndex)
  if (!b || !isPresentBreach(b)) return 'Invalid breach'
  if (b.opened) return 'Already open'
  if (b.focusCount >= b.focusToOpen) return 'Already focused'

  const effectiveCost = Math.max(0, b.focusCost - breachCostReduction(p, 'focus'))
  const available = getSpendableAether(p, 'breach')
  if (available < effectiveCost) return `Need ${effectiveCost} Aether, have ${available}`

  spendAether(p, effectiveCost, 'breach')
  consumeBreachCostReductions(p, 'focus')
  const opened = advanceBreachFocus(b)
  if (!opened) {
    const arrow = DIR_ARROW[b.focusDirection]
    return `Focused: facing ${arrow} (${b.focusCount}/${b.focusToOpen})`
  }
  const messages = [`Breach ${toRoman(breachIndex)} OPENED!`]
  messages.push(...resolveBreachOpenedEffects(g, playerId))
  return messages.join('; ')
}

/** Return the currently payable focus and direct-open costs for UI display. */
export function getBreachActionCosts(
  g: GameState, playerId: string, breachIndex: number,
): { focus: number; open: number } | null {
  const p = getPlayer(g, playerId)
  const b = p.breaches.find(br => br.index === breachIndex)
  if (!b || !isPresentBreach(b)) return null
  return {
    focus: Math.max(0, b.focusCost - breachCostReduction(p, 'focus')),
    open: Math.max(0, b.openCost[b.focusDirection] - breachCostReduction(p, 'open')),
  }
}

export function openBreach(g: GameState, playerId: string, breachIndex: number): string | null {
  const blocked = pendingActionMessage(g)
  if (blocked) return blocked
  const p = getPlayer(g, playerId)
  const b = p.breaches.find(br => br.index === breachIndex)
  if (!b || !isPresentBreach(b)) return 'Invalid breach'
  if (b.opened) return 'Already open'
  if (b.focusCount < b.focusToOpen) return 'Not enough focus'

  b.opened = true
  consumeBreachCostReductions(p, 'open')
  return [`Breach ${toRoman(breachIndex)} opened!`, ...resolveBreachOpenedEffects(g, playerId)].join('; ')
}

export function openBreachDirect(g: GameState, playerId: string, breachIndex: number): string | null {
  const blocked = pendingActionMessage(g)
  if (blocked) return blocked
  const p = getPlayer(g, playerId)
  const b = p.breaches.find(br => br.index === breachIndex)
  if (!b || !isPresentBreach(b)) return 'Invalid breach'
  if (b.opened) return 'Already open'

  const cost = Math.max(0, b.openCost[b.focusDirection] - breachCostReduction(p, 'open'))
  const available = getSpendableAether(p, 'breach')
  if (available < cost) return `Need ${cost} Aether (direct open), have ${available}`

  spendAether(p, cost, 'breach')
  consumeBreachCostReductions(p, 'open')
  b.opened = true
  b.focusedThisTurn = true
  b.focusCount = b.focusToOpen
  return [`Breach ${toRoman(breachIndex)} opened (${cost}a direct)!`, ...resolveBreachOpenedEffects(g, playerId)].join('; ')
}

export function gainCharge(g: GameState, playerId: string, amount: number): string | null {
  const p = getPlayer(g, playerId)
  const cost = amount * 2
  const available = getSpendableAether(p, 'general')
  if (available < cost) return `Need ${cost} Aether, have ${available}`
  if (p.charge + amount > p.chargeThreshold) return `Charge capped at ${p.chargeThreshold}`

  spendAether(p, cost, 'general')
  p.charge += amount
  return `Gained ${amount} charge (${p.charge}/${p.chargeThreshold})`
}

export function activateAbility(
  g: GameState, playerId: string,
): string | null {
  const blocked = pendingActionMessage(g)
  if (blocked) return blocked
  if (!canActivateAbilityDuringMain(g, playerId)) {
    return 'Abilities can only be activated during your main phase'
  }
  const p = getPlayer(g, playerId)
  if (p.charge < p.chargeThreshold) return `Need ${p.chargeThreshold} charge, have ${p.charge}`

  const def = MAGES[p.mageType]!
  if (def.abilityEffects.length === 0) return 'This ability is not implemented yet'
  if (def.abilityTrigger.kind !== 'main_phase') return 'This ability cannot be activated during the main phase'
  if (def.abilityEffects.some(effect => effect.kind === 'shuffle_turn_order_card') && getPlayerTurnOrderCards(g).length === 0) {
    return 'No player turn order card is available in the discard pile'
  }
  if (def.abilityEffects.some(effect => effect.kind === 'cast_prepped_spell') && getPreppedSpellChoices(g).length === 0) {
    return 'No prepped spell is available for this ability'
  }
  p.charge = 0
  const messages = [`${def.abilityName} activated`]
  const targetPlayerId = def.abilityTrigger.kind === 'main_phase' && def.abilityTrigger.scope === 'any_player'
    ? g.currentTurn
    : playerId
  messages.push(...resolveEffects(
    g, playerId, def.abilityEffects, `ability:${def.abilityName}`, 0, targetPlayerId,
    false, undefined, undefined, targetPlayerId,
  ))
  return messages.join('; ')
}

/** Whether this mage may offer its main-phase ability button in the current turn. */
export function canActivateAbilityDuringMain(g: GameState, playerId: string): boolean {
  if (g.currentPhase !== 'main' || g.currentTurn === 'nemesis' || g.pendingDecision || g.pendingEffect) return false
  const player = g.players.find(candidate => candidate.id === playerId)
  if (!player) return false
  const def = MAGES[player.mageType]
  if (!def || def.abilityEffects.length === 0 || def.abilityTrigger.kind !== 'main_phase') return false
  if (def.abilityEffects.some(effect => effect.kind === 'shuffle_turn_order_card') && getPlayerTurnOrderCards(g).length === 0) return false
  return def.abilityTrigger.scope === 'any_player' || g.currentTurn === playerId
}

// ===== Draw Phase =====

export function resolveDrawPhase(g: GameState, playerId: string): string[] {
  const p = getPlayer(g, playerId)
  const msgs: string[] = []

  // Move played cards to discard (reverse order = last played on top)
  for (const cardId of [...p.playedThisTurn].reverse()) {
    p.discard.unshift(cardId)
  }
  p.playedThisTurn = []
  p.cardPlayCountsThisTurn = {}
  p.conditionalAetherEarned = {}
  p.regularAetherSpent = 0
  p.condAetherSpent = {}
  p.bonusAether = 0
  const unusedAetherTokens = p.aetherTokens ?? 0
  p.aetherTokens = 0
  const turnEffects = getPlayerTurnEffects(p)
  turnEffects.nextBreachCostReductions = []
  turnEffects.usedPreppedEffects = []
  turnEffects.usedPlayerCardEffects = []
  turnEffects.usedBreachUpgradeEffects = []
  turnEffects.prepSpellLimit = 1
  turnEffects.prepSpellLimitByBreach = {}
  for (const b of p.breaches) {
    b.focusedThisTurn = false
    b.preppedThisTurn = b.prepSpells.map(() => false)
  }

  // Draw to 5
  while (p.hand.length < 5) {
    const result = drawFromDeck(p.deck, p.discard, 1)
    p.deck = result.newDeck
    p.discard = result.newDiscard
    if (result.drawn.length > 0) {
      p.hand.push(result.drawn[0]!)
    } else break
  }
  msgs.push(`Hand filled to ${p.hand.length}, Aether reset${unusedAetherTokens > 0 ? `; discarded ${unusedAetherTokens} unused Aether token${unusedAetherTokens === 1 ? '' : 's'}` : ''}`)

  return msgs
}

export function damageNemesis(g: GameState, amount: number): void {
  g.nemesis.hp -= Math.max(0, amount)
  if (g.nemesis.hp <= 0) {
    g.nemesis.hp = 0
    g.gameOver = true
    g.winner = 'players'
  }
}

/** Deal damage to a resolved target reference. */
export function dealDamage(g: GameState, target: DamageTargetRef, amount: number): string {
  const value = Math.max(0, amount)
  if (target.kind === 'nemesis') {
    const before = g.nemesis.hp
    damageNemesis(g, value)
    return `Nemesis takes ${before - g.nemesis.hp} damage (${g.nemesis.hp}/${g.nemesis.maxHp})`
  }

  if (target.kind === 'gravehold') {
    if (g.damagePrevention) return 'Gravehold suffers no damage this turn'
    const before = g.gravehold.hp
    g.gravehold.hp = Math.max(0, before - value)
    // Gravehold damage is a terminal condition just like Nemesis damage. Keep
    // the check here so every typed damage effect gets the same game-over
    // semantics before its enclosing resolution can continue.
    if (g.gravehold.hp <= 0) checkGameOver(g)
    return `Gravehold takes ${before - g.gravehold.hp} damage (${g.gravehold.hp}/${g.gravehold.maxHp})`
  }

  const minion = g.nemesis.playArea.find(card =>
    card.cardType === 'minion' && card.placedAt === target.placedAt,
  )
  if (!minion) return `Target ${target.label} is no longer in play`
  const definition = getCard(minion.cardId) as NemesisCardDef
  const resolvedValue = definition.damagePerInstance === undefined
    ? value
    : Math.min(value, Math.max(0, definition.damagePerInstance))
  const before = Math.max(0, minion.lifeTokens ?? 0)
  minion.lifeTokens = Math.max(0, before - resolvedValue)
  if (minion.lifeTokens === 0) {
    g.nemesis.playArea = g.nemesis.playArea.filter(card => card !== minion)
    g.nemesis.discard.unshift(minion.cardId)
    return `${target.label} takes ${before} damage and is defeated`
  }
  return `${target.label} takes ${before - minion.lifeTokens} damage (${minion.lifeTokens} life remaining)`
}

export function sufferPlayerDamage(g: GameState, playerId: string, damage: number): string {
  const p = getPlayer(g, playerId)
  const value = Math.max(0, damage)
  if (g.damagePrevention) return `${p.mageType} suffers no damage this turn`
  if (p.exhausted) {
    const graveholdDamage = value * 2
    g.gravehold.hp = Math.max(0, g.gravehold.hp - graveholdDamage)
    if (g.gravehold.hp <= 0) checkGameOver(g)
    return `${p.mageType} is exhausted; Gravehold takes ${graveholdDamage} damage (${g.gravehold.hp}/${g.gravehold.maxHp})`
  }
  p.hp -= value
  return `${p.mageType} takes ${value} damage (${p.hp}/${p.maxHp})`
}

// ===== Win/Loss Checks =====

export function checkGameOver(g: GameState): string | null {
  if (g.nemesis.hp <= 0) { g.gameOver = true; g.winner = 'players'; return 'VICTORY! Nemesis defeated!' }
  if (g.gravehold.hp <= 0) { g.gameOver = true; g.winner = 'nemesis'; return 'DEFEAT! Gravehold destroyed!' }
  if (g.players.every(p => p.exhausted)) { g.gameOver = true; g.winner = 'nemesis'; return 'DEFEAT! All mages exhausted!' }
  if (usesDevouredPile(g) && g.market.piles.every(pile => pile.remaining <= 0)) {
    g.gameOver = true
    g.winner = 'nemesis'
    return 'DEFEAT! All supply piles have been Devoured!'
  }
  return null
}

export function checkPlayerDeath(g: GameState, playerId: string, deferConsequences = false): string | null {
  const p = getPlayer(g, playerId)
  if (p.hp <= 0 && !p.exhausted) {
    const excess = Math.max(0, -p.hp)
    p.hp = 0
    p.exhausted = true
    // Keep the legacy direct helper behavior for callers that only need the
    // immediate state transition. Effect-resolution callers pass `true` so
    // the ordered Unleash → Breach → charge → overflow sequence can pause for
    // player input and resume safely.
    if (!deferConsequences) {
      g.gravehold.hp = Math.max(0, g.gravehold.hp - excess * 2)
      const openBreach = p.breaches.find(breach =>
        isPresentBreach(breach) && breach.opened && !breach.indestructible,
      )
      if (openBreach) {
        openBreach.opened = false
        openBreach.prepSpells = []
        openBreach.preppedThisTurn = []
        openBreach.preppedSpellFaceDown = []
        openBreach.present = false
      }
      p.charge = 0
      const gameOver = checkGameOver(g)
      const breachOutcome = openBreach ? 'Breach lost' : 'no Breach destroyed'
      return gameOver
        ? `${p.mageType} EXHAUSTED! ${breachOutcome}, Gravehold -${excess * 2}; ${gameOver}`
        : `${p.mageType} EXHAUSTED! ${breachOutcome}, Gravehold -${excess * 2}`
    }
    return `${p.mageType} EXHAUSTED! Nemesis unleashes twice; choose a Breach to destroy`
  }
  return null
}

/** Start an exhaustion continuation from a caller outside an effect frame. */
export function resolvePlayerExhaustion(
  g: GameState, playerId: string, overflowDamage: number,
): string[] {
  if (g.pendingDecision || g.pendingEffect) return ['Another card effect is already waiting for a decision']
  return runEffectResolution(g, {
    sourcePlayerId: playerId,
    remainingEffects: [{
      kind: 'exhaust_player',
      playerId,
      overflowDamage: Math.max(0, overflowDamage),
    }],
  })
}

export function canPlayerAct(g: GameState, playerId: string): boolean {
  const p = getPlayer(g, playerId)
  if (g.pendingDecision) return false

  // Has non-spell cards in hand
  if (p.hand.some(cid => getCard(cid).type !== 'spell')) return true
  // Has open or focused breach to prep a spell
  if (p.breaches.some(b => isPresentBreach(b) && b.prepSpells.length < getPrepSpellLimit(p, b.index) &&
    p.hand.some(cid => {
      const card = getCard(cid)
      return card.type === 'spell' && (b.opened || b.focusedThisTurn || card.prepToClosedBreach)
    }))) return true

  // A Power card's To Discard action remains a legal Main Phase action even
  // when the player has no Aether left. Keep it in the action check so an
  // Aether or Charge payment cannot end the phase before this interrupt.
  if (getNemesisDiscardActions(g, playerId).length > 0) return true

  // A prepped spell such as Arcane Nexus can expose a once-per-turn Main
  // Phase action even when the player has no cards to play or buy. Keep the
  // turn open so the clickable action is not skipped by auto-end logic.
  if (getPreppedCardActions(g, playerId).length > 0) return true

  // Mage-specific cards placed into play may expose an explicit Main Phase
  // action (for example, destroying a Treasure for its benefit).
  if (g.players.some(player => getPlayerCardInPlayActions(g, player.id).length > 0)) return true

  const aether = getSpendableAether(p, 'general')
  const breachAether = getSpendableAether(p, 'breach')

  // Can buy something from market. Conditional Aether is type-restricted
  // (for example Indira's Spell-only Aether), so check the same spend type
  // that buyCard uses instead of only the general Aether pool.
  for (const pile of g.market.piles) {
    if (pile.remaining <= 0) continue
    const card = getCard(pile.cardId)
    const spendType: SpendType = card.type === 'gem' ? 'gem'
      : card.type === 'spell' ? 'spell'
        : card.type === 'relic' ? 'relic' : 'general'
    if (getMarketCardCost(g, g.market.piles.indexOf(pile)) <= getSpendableAether(p, spendType)) return true
  }

  // Can focus or open a breach
  for (const b of p.breaches) {
    if (!isPresentBreach(b)) continue
    const focusCost = Math.max(0, b.focusCost - breachCostReduction(p, 'focus'))
    const openCost = Math.max(0, b.openCost[b.focusDirection] - breachCostReduction(p, 'open'))
    if (!b.opened && b.focusCount < b.focusToOpen && focusCost <= breachAether) return true
    if (!b.opened && openCost <= breachAether) return true
  }

  // Can gain charge
  if (aether >= 2 && p.charge < p.chargeThreshold) return true

  // A charged mage may activate its ability. Some abilities are available
  // during any player's main phase, so they must also prevent auto-ending
  // the current player's turn.
  for (const candidate of g.players) {
    if (candidate.charge < candidate.chargeThreshold || !canActivateAbilityDuringMain(g, candidate.id)) continue
    const def = MAGES[candidate.mageType]
    if (!def || def.abilityEffects.length === 0) continue
    if (def.abilityEffects.some(effect => effect.kind === 'shuffle_turn_order_card') && getPlayerTurnOrderCards(g).length === 0) continue
    if (!def.abilityEffects.some(effect => effect.kind === 'cast_prepped_spell') || getPreppedSpellChoices(g).length > 0) {
      return true
    }
  }

  return false
}

// ===== Helpers =====

export function toRoman(n: number): string {
  return ['', 'I', 'II', 'III', 'IV'][n] ?? String(n)
}

export function rotateDirection(d: Direction): Direction {
  return ({ east: 'south', south: 'west', west: 'north', north: 'east' })[d] as Direction
}

export { drawFromDeck }
