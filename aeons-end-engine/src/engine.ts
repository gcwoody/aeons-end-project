import {
  GameState, PlayerState, Phase, Direction,
  CardChoice, CollectiveCardChoice, CardGainDestination, CardSelectionSource, CardZone,
  DamageTargetRef, DamageTargetScope, LifeTargetRef, LifeTargetScope,
  PendingDecision, PendingDecisionAnswer, PendingEffectResolution, PendingSpellCast,
  CardEffect, CardEffectBlock, CardEffectCondition, CardEffectOption,
  CardEffectTrigger, PlayerTargetRef, PlayerTargetScope, PlayerSelectionRule, PlayerTurnEffects,
  PreppedSpellChoice, TurnOrderCardChoice, NemesisDifficulty,
  NemesisCardDef, NemesisCardInPlay, NemesisDiscardCost, NemesisEffectTrigger,
  NemesisResolutionState, PendingNemesisDiscard,
} from './types'
import {
  getCard, MAGES, rageborne, MARKET_CARDS,
  buildRageborneDeck, buildRageborneStrikeDeck,
} from './data'
import type { MageDef } from './data'

// ===== Utilities =====

const DIR_ARROW: Record<string, string> = { east: '→', south: '↓', west: '←', north: '↑' }

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

export function createGame(
  mage1Type: string,
  mage2Type: string,
  nemesisDifficulty: NemesisDifficulty = 'standard',
): GameState {
  const mage1Def = MAGES[mage1Type]!
  const mage2Def = MAGES[mage2Type]!

  function createPlayer(id: string, def: MageDef): PlayerState {
    return {
      id, mageType: def.type,
      hp: def.hp, maxHp: def.hp,
      deck: [...def.startDeck],
      hand: [...def.startHand],
      discard: [],
      playedThisTurn: [],
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
        prepSpellLimit: 1,
      },
    }
  }

  const player1 = createPlayer('p1', mage1Def)
  const player2 = createPlayer('p2', mage2Def)

  const marketPiles = Object.keys(MARKET_CARDS).map(cardId => {
    const card = getCard(cardId)
    const remaining = card.type === 'gem' ? 7 : 5
    return { cardId, remaining }
  })

  const nemesisDeck = buildRageborneDeck()
  const strikeDeck = buildRageborneStrikeDeck()
  const turnOrder = shuffle(['p1', 'p1', 'p2', 'p2', 'nemesis', 'nemesis'])

  return {
    players: [player1, player2],
    nemesis: {
      definitionId: rageborne.type,
      name: rageborne.name,
      type: rageborne.type,
      hp: rageborne.hp, maxHp: rageborne.hp,
      difficultyLevel: rageborne.difficultyLevel,
      difficulty: nemesisDifficulty,
      deck: nemesisDeck, discard: [],
      strikeDeck, strikeDiscard: [],
      counters: { ...rageborne.startingCounters },
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
}

// ===== Turn Management =====

export function startTurn(g: GameState): GameState {
  g.damagePrevention = false
  if (g.turnOrderDeck.length === 0) {
    g.turnOrderDeck = shuffle(['p1', 'p1', 'p2', 'p2', 'nemesis', 'nemesis'])
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
    controllerPlayerId: g.players[0]?.id,
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
    .filter(block => conditionMatches(g, resolution.controllerPlayerId ?? g.players[0]?.id ?? '', block.condition))
    .flatMap(block => block.effects) ?? []
  if (effects.length === 0) return []
  const controller = resolution.controllerPlayerId ?? g.players[0]?.id
  if (!controller) return ['No player is available to resolve the Nemesis effect']
  return runEffectResolution(g, {
    playerId: controller,
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
  ensureNemesisRuntime(g)
  if (!g.nemesisResolution) initializeNemesisTurn(g)
  const resolution = g.nemesisResolution!
  const messages: string[] = []

  while (!g.pendingDecision && !g.pendingEffect && g.nemesisResolution) {
    if (resolution.step === 'main') {
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
        const controller = resolution.controllerPlayerId ?? g.players[0]?.id
        if (!controller) return ['No player is available to confirm the Nemesis effect']
        const decision = createDecision(
          g,
          controller,
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
      discardNemesisCard(g, card)
      messages.push(...resolveNemesisCardEffects(g, resolution, definition, 'power_resolved'))
      if (g.pendingDecision || g.pendingEffect) return messages
      resolution.activeCardInstanceId = undefined
      resolution.activeCardId = undefined
      resolution.activeTrigger = undefined
      continue
    }

    if (resolution.step === 'draw') {
      g.currentPhase = 'nemesis_draw'
      if (resolution.drawnCardId && resolution.drawnCardProcessed) {
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
        const controller = resolution.controllerPlayerId ?? g.players[0]?.id
        if (!controller) return ['No player is available to confirm the Nemesis draw']
        const decision = createDecision(
          g,
          controller,
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
        const blockCount = nemesisEffectBlocks(definition, 'immediately')
        if (blockCount) messages.push(`Resolving ${blockCount} immediate effect block(s)`)
        g.nemesis.discard.unshift(cardId)
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
    if (
      g.nemesis.definitionId === rageborne.type &&
      (g.nemesis.counters.fury ?? 0) >= rageborne.standardRules.endTurnStrikeThreshold
    ) {
      messages.push('Rageborne strikes at the end of the Nemesis turn')
      messages.push(...resolveEffects(
        g,
        resolution.controllerPlayerId ?? g.players[0]!.id,
        [{ kind: 'resolve_strike' }],
        'rageborne:strike',
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
      .filter(choice => getCard(choice.cardId).cost >= (cost.minCost ?? 0)).length >= Math.max(0, cost.amount)
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
      if (cost?.kind !== 'discard_cards') player.destroyedCards.push(...removed)
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
      ensurePlayerCollections(owner)
      owner.destroyedCards.push(choice.cardId)
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
        .filter(choice => getCard(choice.cardId).cost >= (cost.minCost ?? 0))
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
      const decision = createDecision(
        g,
        pending.playerId,
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
    const decision = createDecision(
      g,
      pending.playerId,
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
  return p.playedThisTurn
}

function ensurePlayerCollections(p: PlayerState): void {
  if (!p.destroyedCards) p.destroyedCards = []
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
      prepSpellLimit: 1,
    }
  }
  p.turnEffects.prepSpellLimit ??= 1
}

export function getPlayerTurnEffects(p: PlayerState): PlayerTurnEffects {
  ensurePlayerCollections(p)
  return p.turnEffects
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

/** Permanently remove a selected card from a player's card zones. */
export function destroyCard(g: GameState, playerId: string, choice: CardChoice): string | null {
  const p = getPlayer(g, playerId)
  ensurePlayerCollections(p)
  const cards = getZoneCards(p, choice.zone)
  if (cards[choice.index] !== choice.cardId) return 'Card selection is no longer valid'

  const cardId = removeCardFromZone(p, choice.zone, choice.index)
  if (!cardId) return 'Card not found'
  p.destroyedCards.push(cardId)
  return `Destroyed ${getCard(cardId).name}`
}

/** Gain a card into the requested top-of-pile destination. */
export function gainCard(
  g: GameState,
  playerId: string,
  cardId: string,
  destination: CardGainDestination = 'discard_top',
  marketPileIndex?: number,
  triggerEffects = true,
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
  }

  const p = getPlayer(g, playerId)
  if (destination === 'deck_top') p.deck.unshift(cardId)
  else p.discard.unshift(cardId)
  const message = `Gained ${card.name} -> ${destination === 'deck_top' ? 'deck' : 'discard pile'}`
  if (!triggerEffects) return message
  const effectMessages = resolveCardEffects(g, playerId, cardId, { kind: 'on_gain' }, cardId)
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
  if (scope === 'self') return [{ kind: 'player', playerId: sourcePlayerId }]
  if (scope === 'ally') {
    return g.players
      .filter(player => player.id !== sourcePlayerId)
      .map(player => ({ kind: 'player', playerId: player.id }))
  }
  return g.players.map(player => ({ kind: 'player', playerId: player.id }))
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
  const targets = getPlayerTargets(g, sourcePlayerId, scope)
  if (!selection || targets.length === 0) return targets
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

export function gainLife(g: GameState, target: LifeTargetRef, amount: number): string | null {
  const value = Math.max(0, amount)
  if (target.kind === 'player') {
    const p = getPlayer(g, target.playerId)
    if (!p) return 'Invalid life target'
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
  const minion = g.nemesis.playArea.find(card =>
    card.cardType === 'minion' && (!sourceCardId || card.cardId === sourceCardId),
  )
  return Math.max(0, minion?.lifeTokens ?? 0)
}

function spellBreachDamageBonus(breach: PlayerState['breaches'][number]): number {
  return isPresentBreach(breach) && breach.opened && breach.index >= 3 ? 1 : 0
}

function applySpellDamageBonus(resolution: PendingEffectResolution, amount: number): number {
  const bonus = resolution.spellDamageBonus ?? 0
  return bonus > 0 ? amount + bonus : amount
}

interface SpellDamagePreview {
  amount: number
  instances: number
}

function addSpellDamagePreview(total: SpellDamagePreview, next: SpellDamagePreview): SpellDamagePreview {
  return {
    amount: total.amount + next.amount,
    instances: total.instances + next.instances,
  }
}

function previewSpellDamageEffects(
  g: GameState, playerId: string, effects: CardEffect[], sourceCardId?: string,
): SpellDamagePreview | null {
  let preview: SpellDamagePreview = { amount: 0, instances: 0 }
  for (const effect of effects) {
    if (effect.kind === 'deal_damage') {
      preview = addSpellDamagePreview(preview, {
        amount: amountValue(g, playerId, effect.amount, sourceCardId),
        instances: 1,
      })
      continue
    }
    if (effect.kind === 'reveal_turn_order_card') {
      const top = g.turnOrderDeck[0]
      if (!top) return null
      const branch = top === 'nemesis' ? effect.nemesisEffects : effect.playerEffects
      const branchPreview = previewSpellDamageEffects(g, playerId, branch, sourceCardId)
      if (!branchPreview) return null
      preview = addSpellDamagePreview(preview, branchPreview)
      continue
    }
    if (effect.kind === 'choose_one') {
      const available = effect.options.filter(option => conditionMatches(g, playerId, option.condition))
      const optionPreviews = available.map(option => previewSpellDamageEffects(g, playerId, option.effects, sourceCardId))
      if (optionPreviews.some(optionPreview => !optionPreview)) return null
      const first = optionPreviews[0]
      if (!first || optionPreviews.some(optionPreview =>
        optionPreview!.amount !== first.amount || optionPreview!.instances !== first.instances)) return null
      preview = addSpellDamagePreview(preview, first)
    }
    // Optional effects are intentionally excluded: their damage is not guaranteed.
  }
  return preview
}

/** Return the guaranteed damage shown while a prepped spell waits for its target. */
export function getSpellDamagePreview(
  g: GameState, casterPlayerId: string, spellOwnerPlayerId: string,
  breachIndex: number, spellIndex = 0,
): number | null {
  const owner = getPlayer(g, spellOwnerPlayerId)
  const breach = owner.breaches.find(item => item.index === breachIndex)
  if (!breach || !isPresentBreach(breach)) return null
  const cardId = breach.prepSpells[spellIndex]
  if (!cardId || getCard(cardId).type !== 'spell') return null
  const effects = matchingBlocks(cardId, casterPlayerId, g, { kind: 'on_cast' })
    .flatMap(block => block.effects)
  const preview = previewSpellDamageEffects(g, casterPlayerId, effects, cardId)
  if (!preview) return null
  const amount = preview.amount + preview.instances * spellBreachDamageBonus(breach)
  return amount > 0 ? amount : null
}

function effectPlayerId(resolution: PendingEffectResolution): string {
  return resolution.effectPlayerId ?? resolution.playerId
}

function conditionMatches(g: GameState, playerId: string, condition?: CardEffectCondition): boolean {
  if (!condition) return true
  const p = getPlayer(g, playerId)
  if (condition.kind === 'has_unopened_breach') {
    return p.breaches.some(breach => isPresentBreach(breach) && !breach.opened)
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
  } else {
    value = g.turnOrderDiscard.filter(cardId => cardId === 'nemesis').length
    expected = condition.count
  }

  return condition.comparison === 'equals' ? value === expected : value >= expected
}

function matchingBlocks(
  cardId: string, playerId: string, g: GameState, trigger: CardEffectTrigger,
): CardEffectBlock[] {
  return (getCard(cardId).effects ?? []).filter(block => {
    if (block.trigger.kind !== trigger.kind) return false
    if (block.trigger.kind === 'while_prepped' && trigger.kind === 'while_prepped') {
      if (block.trigger.phase !== trigger.phase) return false
    }
    return conditionMatches(g, playerId, block.condition)
  })
}

function addRemainingEffects(resolution: PendingEffectResolution, effects: CardEffect[]): void {
  resolution.remainingEffects = [...effects, ...resolution.remainingEffects]
}

function finalizePendingSpellCast(g: GameState, resolution: PendingEffectResolution): void {
  const pending = resolution.pendingSpellCast
  if (!pending) return

  const owner = getPlayer(g, pending.playerId)
  const breach = owner.breaches.find(item => item.index === pending.breachIndex)
  if (pending.discard && breach?.prepSpells[pending.spellIndex] === pending.cardId) {
    breach.prepSpells.splice(pending.spellIndex, 1)
    owner.discard.unshift(pending.cardId)
  }
  resolution.pendingSpellCast = undefined
}

function cardChoiceMatches(choice: CardChoice, expectedSource: CardSelectionSource): boolean {
  if (expectedSource === 'hand') return choice.zone === 'hand'
  if (expectedSource === 'discard') return choice.zone === 'discard'
  if (expectedSource === 'hand_or_discard') return choice.zone === 'hand' || choice.zone === 'discard'
  return choice.zone === 'played_this_turn'
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
  g: GameState, playerId: string, prompt: string, kind: PendingDecision['kind'],
  details: Record<string, unknown>,
  sourceCardId?: string,
): PendingDecision {
  return {
    id: nextPendingDecisionId(g),
    playerId,
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
    .filter(choice => choice.cardId === 'p1' || choice.cardId === 'p2')
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

  while (resolution.remainingEffects.length > 0) {
    const effect = resolution.remainingEffects.shift()!
    const currentPlayerId = effectPlayerId(resolution)
    const p = getPlayer(g, currentPlayerId)

    if (effect.kind === 'confirm_prepped_effect') {
      const decision = createDecision(
        g,
        resolution.playerId,
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
      const decision = createDecision(
        g,
        target.id,
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
      const configured = g.nemesis.definitionId === rageborne.type ? rageborne.unleashEffects : undefined
      if (configured && configured.length > 0) {
        const multiplier = Math.max(0, effect.amount ?? 1)
        const expanded = configured.map(configuredEffect => {
          if (configuredEffect.kind !== 'gain_nemesis_counter') return configuredEffect
          return { ...configuredEffect, amount: configuredEffect.amount * multiplier }
        })
        addRemainingEffects(resolution, expanded)
      } else {
        const counter = 'unleash'
        const amount = Math.max(0, effect.amount ?? 1)
        g.nemesis.counters[counter] = (g.nemesis.counters[counter] ?? 0) + amount
        messages.push(`${g.nemesis.name} unleashes (${counter}: ${g.nemesis.counters[counter]})`)
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
        const decision = createDecision(
          g,
          resolution.playerId,
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
      const furyLoss = g.nemesis.difficulty === 'increased'
        ? rageborne.increasedDifficultyRules.furyLossAfterStrike
        : rageborne.standardRules.furyLossAfterStrike
      const nextStrike: CardEffect[] = [
        ...(strike.effects?.flatMap(block => block.effects) ?? []),
        { kind: 'lose_nemesis_counter', counter: 'fury', amount: furyLoss },
        { kind: 'return_strike_card', cardId: strikeId },
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
      messages.push(`Discarded revealed Nemesis card: ${getCard(cardId).name}`)
      continue
    }

    if (effect.kind === 'gain_aether') {
      const amount = Math.max(0, effect.amount)
      p.bonusAether += amount
      messages.push(`${p.mageType} gains ${amount} Aether`)
      continue
    }

    if (effect.kind === 'gain_charge') {
      const amount = Math.max(0, effect.amount)
      const targets = effect.target === 'self'
        ? [p]
        : g.players.filter(player => player.id !== resolution.playerId)
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
        const decision = createDecision(
          g, resolution.playerId, 'Choose a player to lose all charge',
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

    if (effect.kind === 'review_turn_order_deck') {
      if (g.turnOrderDeck.length === 0) {
        messages.push('Turn order deck is empty')
        continue
      }
      const cards = g.turnOrderDeck.map((cardId, index) => ({ index, cardId }))
      const decision = createDecision(
        g,
        resolution.playerId,
        'Review the turn order deck and choose its order',
        'reorder_turn_order',
        { cards },
        resolution.sourceCardId,
      )
      messages.push(...pauseEffect(g, resolution, effect, decision))
      return messages
    }

    if (effect.kind === 'shuffle_turn_order_card') {
      const cards = getPlayerTurnOrderCards(g)
      if (cards.length === 0) {
        messages.push('No player turn order card is available in the discard pile')
        continue
      }
      const decision = createDecision(
        g,
        resolution.playerId,
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
      const decision = createDecision(
        g,
        resolution.playerId,
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
      const decision = createDecision(
        g, resolution.playerId, 'Place the revealed turn order card on top or bottom?',
        'choose_turn_order_position', { cardId: top }, resolution.sourceCardId,
      )
      messages.push(...pauseEffect(g, resolution, effect, decision))
      return messages
    }

    if (effect.kind === 'gain_conditional_aether') {
      const amount = Math.max(0, effect.amount)
      ensurePlayerCollections(p)
      p.conditionalAetherEarned[effect.condition] =
        (p.conditionalAetherEarned[effect.condition] ?? 0) + amount
      messages.push(`${p.mageType} gains ${amount} conditional Aether for ${effect.condition}`)
      continue
    }

    if (effect.kind === 'deal_damage') {
      const amount = amountValue(g, currentPlayerId, effect.amount, resolution.sourceCardId)
      const targets = getDamageTargets(g, effect.target, resolution.sourceCardId)
      if (targets.length === 0) {
        messages.push('No valid damage target')
        continue
      }
      if (targets.length > 1) {
        resolution.spellDamageEffectSeen = true
        const decision = createDecision(
          g, resolution.playerId, 'Choose a damage target', 'select_damage_target',
          { targets }, resolution.sourceCardId,
        )
        messages.push(...pauseEffect(g, resolution, effect, decision))
        return messages
      }
      resolution.spellDamageEffectSeen = true
      messages.push(dealDamage(g, targets[0]!, applySpellDamageBonus(resolution, amount)))
      continue
    }

    if (effect.kind === 'deal_player_damage') {
      const targets = getSelectedPlayerTargets(g, currentPlayerId, effect.target, effect.selection)
      if (targets.length === 0) {
        messages.push('No valid player damage target')
        continue
      }
      if (targets.length > 1) {
        const decision = createDecision(
          g, resolution.playerId, 'Choose a player to suffer damage', 'select_player_target',
          { targets }, resolution.sourceCardId,
        )
        messages.push(...pauseEffect(g, resolution, effect, decision))
        return messages
      }
      const target = getPlayer(g, targets[0]!.playerId)
      resolution.effectPlayerId = target.id
      messages.push(sufferPlayerDamage(g, target.id, amountValue(g, currentPlayerId, effect.amount, resolution.sourceCardId)))
      const death = checkPlayerDeath(g, target.id)
      if (death) messages.push(death)
      continue
    }

    if (effect.kind === 'draw_cards') {
      const targets = getSelectedPlayerTargets(g, currentPlayerId, effect.target ?? 'self', effect.selection)
      if (targets.length === 0) {
        messages.push('No valid player target')
        continue
      }
      if (targets.length > 1) {
        const decision = createDecision(
          g, resolution.playerId, 'Choose a player to draw cards', 'select_player_target',
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
        const decision = createDecision(
          g, resolution.playerId, 'Choose a life target', 'select_life_target',
          { targets }, resolution.sourceCardId,
        )
        messages.push(...pauseEffect(g, resolution, effect, decision))
        return messages
      }
      const message = gainLife(g, targets[0]!, effect.amount)
      if (message) messages.push(message)
      continue
    }

    if (effect.kind === 'gain_card') {
      let marketPileIndex: number | undefined
      if (effect.source === 'market') {
        marketPileIndex = g.market.piles.findIndex(pile => pile.cardId === effect.cardId && pile.remaining > 0)
        if (marketPileIndex === -1) {
          messages.push(`Cannot gain ${getCard(effect.cardId).name}: market pile is empty`)
          continue
        }
      }
      const destination = effect.destination ?? 'discard_top'
      const message = gainCard(g, currentPlayerId, effect.cardId, destination, marketPileIndex, false)
      if (message) {
        resolution.lastGainedCardId = effect.cardId
        const followups = matchingBlocks(effect.cardId, currentPlayerId, g, { kind: 'on_gain' })
          .flatMap(block => block.effects)
        addRemainingEffects(resolution, followups)
        messages.push(message)
      }
      continue
    }

    if (effect.kind === 'move_gained_card') {
      const gained = resolution.lastGainedCardId
      if (gained && p.discard[0] === gained) {
        p.discard.shift()
        p.deck.unshift(gained)
        messages.push(`Moved ${getCard(gained).name} to the top of the deck`)
      } else {
        messages.push('No newly gained card is available to move')
      }
      continue
    }

    if (effect.kind === 'discard_cards') {
      const targetScope = effect.target ?? 'self'
      const targets = getSelectedPlayerTargets(g, currentPlayerId, targetScope, effect.selection)
      if (targets.length > 1) {
        const decision = createDecision(
          g, resolution.playerId, 'Choose a player to discard cards', 'select_player_target',
          { targets }, resolution.sourceCardId,
        )
        messages.push(...pauseEffect(g, resolution, effect, decision))
        return messages
      }
      const discardPlayerId = targets[0]?.playerId ?? currentPlayerId
      resolution.effectPlayerId = discardPlayerId
      const candidates = getCardChoices(g, discardPlayerId, effect.source)
      const amount = Math.min(Math.max(0, effect.amount), candidates.length)
      if (amount === 0) {
        messages.push('No cards available to discard')
        continue
      }
      if (candidates.length > amount || amount > 1) {
        const decision = createDecision(
          g, resolution.playerId, `Choose ${amount} card(s) to discard`, 'select_cards',
          { source: effect.source, candidates, min: amount, max: amount }, resolution.sourceCardId,
        )
        messages.push(...pauseEffect(g, resolution, effect, decision))
        return messages
      }
      const removed = discardSelectedCards(g, discardPlayerId, candidates.slice(0, amount))
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
        const decision = createDecision(
          g, resolution.playerId, `Choose ${amount} card(s) to discard collectively`,
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
      const decision = createDecision(
        g, resolution.playerId,
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
      const decision = createDecision(
        g, currentPlayerId, `Choose up to ${max} spell(s) to return to your hand`, 'select_cards',
        { source: effect.source, candidates, min: 0, max, layout: 'simple' }, resolution.sourceCardId,
      )
      messages.push(...pauseEffect(g, resolution, effect, decision))
      return messages
    }

    if (effect.kind === 'shuffle_discard_into_deck') {
      const targets = getSelectedPlayerTargets(g, currentPlayerId, effect.target ?? 'self')
      if (targets.length > 1) {
        const decision = createDecision(
          g, resolution.playerId, 'Choose a player to shuffle their discard pile into their deck',
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
        const decision = createDecision(
          g, resolution.playerId, 'Choose a player to destroy cards from their deck',
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
        target.destroyedCards.push(cardId)
        destroyed.push(cardId)
      }
      messages.push(`${target.mageType} destroys ${destroyed.length} card(s) from the top of their deck`)
      continue
    }

    if (effect.kind === 'discard_prepped_spells') {
      let targets = getSelectedPlayerTargets(g, currentPlayerId, effect.target ?? 'any_player', effect.selection)
      let candidates = getPreppedSpellChoices(g).filter(choice => targets.some(target => target.playerId === choice.playerId))
      candidates = candidates.filter(choice => getCard(choice.cardId).cost >= (effect.minCost ?? 0))
      let amount = Math.min(Math.max(0, effect.amount), candidates.length)
      if (amount === 0) {
        messages.push('No eligible prepped spell is available')
        continue
      }

      if (effect.mostExpensive) {
        // "Most expensive" means the requested number of cards by descending
        // cost. If the cutoff is tied, pause so the player can confirm the
        // complete selection; never alter the board before that confirmation.
        const ordered = [...candidates].sort((a, b) => getCard(b.cardId).cost - getCard(a.cardId).cost)
        const cutoffCost = getCard(ordered[amount - 1]!.cardId).cost
        const required = ordered.filter(choice => getCard(choice.cardId).cost > cutoffCost)
        const cutoffChoices = ordered.filter(choice => getCard(choice.cardId).cost === cutoffCost)
        const remaining = amount - required.length
        if (cutoffChoices.length > remaining) {
          const decision = createDecision(
            g, resolution.playerId, `Choose ${amount} prepped spell(s) to discard`,
            'select_prepped_spells', {
              candidates: ordered.filter(choice => getCard(choice.cardId).cost >= cutoffCost),
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
        const decision = createDecision(
          g, resolution.playerId, `Choose ${amount} prepped spell(s) to discard`,
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
        const selfChoice = getCardChoices(g, currentPlayerId, 'hand_or_discard')
          .find(choice => choice.cardId === resolution.sourceCardId)
          ?? getZoneCards(getPlayer(g, currentPlayerId), 'played_this_turn')
            .map((cardId, index) => ({ zone: 'played_this_turn' as CardZone, index, cardId, cardName: getCard(cardId).name }))
            .find(choice => choice.cardId === resolution.sourceCardId)
        if (!selfChoice) {
          messages.push('Source card is no longer available to destroy')
        } else {
          const message = destroyCard(g, currentPlayerId, selfChoice)
          if (message) messages.push(message)
        }
        continue
      }

      const source = effect.source as CardSelectionSource
      const candidates = getCardChoices(g, currentPlayerId, source)
      const max = Math.min(effect.maxAmount ?? 1, candidates.length)
      if (max === 0) {
        messages.push('No cards available to destroy')
        continue
      }
      const min = Math.min(Math.max(0, effect.minAmount ?? 0), max)
      const decision = createDecision(
        g, resolution.playerId, min > 0 ? `Choose ${min} card(s) to destroy` : `Choose up to ${max} card(s) to destroy`,
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
      const decision = createDecision(
        g, resolution.playerId, effect.prompt, 'choose_one',
        {
          options: options.map(option => ({
            id: option.id,
            label: option.label,
            disabled: option.condition ? !conditionMatches(g, currentPlayerId, option.condition) : false,
          })),
        }, resolution.sourceCardId,
      )
      messages.push(...pauseEffect(g, resolution, effect, decision))
      return messages
    }

    if (effect.kind === 'choose_optional') {
      const decision = createDecision(
        g, resolution.playerId, effect.prompt, 'choose_optional',
        {
          accept: { id: 'accept', label: 'Yes' },
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
      getPlayerTurnEffects(p).prepSpellLimit = Math.max(1, effect.amount)
      messages.push(`Up to ${getPlayerTurnEffects(p).prepSpellLimit} spells may be prepped on each breach this turn`)
      continue
    }

    if (effect.kind === 'return_card_to_hand') {
      const candidates = getCardChoices(g, currentPlayerId, effect.source)
      if (candidates.length === 0) {
        messages.push('No played gem is available to return')
        continue
      }
      if (candidates.length > 1) {
        const decision = createDecision(
          g, resolution.playerId, 'Choose a played gem to return to your hand', 'select_cards',
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
      if (resolution.spellDamageBonus && !resolution.spellDamageEffectSeen) {
        const bonusEffect: CardEffect = {
          kind: 'deal_damage', amount: 0, target: 'nemesis_or_minion',
        }
        const targets = getDamageTargets(g, bonusEffect.target)
        if (targets.length > 1) {
          resolution.spellDamageEffectSeen = true
          const decision = createDecision(
            g, resolution.playerId, 'Choose a damage target', 'select_damage_target',
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
      resolution.spellDamageEffectSeen = false
      resolution.effectPlayerId = undefined
      continue
    }

    if (effect.kind === 'finalize_spell_cast') {
      finalizePendingSpellCast(g, resolution)
      continue
    }

    if (effect.kind === 'cast_prepped_spell') {
      let choice = resolution.selectedPreppedSpell
      if (effect.source === 'any_prepped_spell') {
        if (!choice) {
          const candidates = getPreppedSpellChoices(g)
          if (candidates.length === 0) {
            messages.push('No prepped spell is available')
            continue
          }
          const decision = createDecision(
            g, resolution.playerId, 'Choose a prepped spell to cast', 'select_prepped_spell',
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
        const decision = createDecision(
          g, resolution.playerId, 'Choose a prepped spell to cast', 'select_prepped_spell',
          { candidates: [choice] }, resolution.sourceCardId,
        )
        messages.push(...pauseEffect(g, resolution, effect, decision))
        return messages
      }
      resolution.confirmedPreppedSpell = undefined
      const spellOwner = getPlayer(g, choice.playerId)
      const breach = spellOwner.breaches.find(item => item.index === choice.breachIndex)
      if (!breach || breach.prepSpells[choice.spellIndex] !== choice.cardId) {
        messages.push('The selected prepped spell is no longer available')
        continue
      }
      const card = getCard(choice.cardId)
      if (card.type !== 'spell') {
        messages.push('The selected card is not a spell')
        continue
      }
      // A spell may be prepped by another player (for example, Jian casting
      // Brama's Buried Light). The player who activates this effect is still
      // the spell's caster, so all player-facing on-cast effects resolve for
      // resolution.playerId rather than the spell owner.
      resolution.pendingSpellCast = {
        playerId: choice.playerId,
        breachIndex: choice.breachIndex,
        spellIndex: choice.spellIndex,
        cardId: choice.cardId,
        discard: effect.discard,
      }
      resolution.effectPlayerId = resolution.playerId
      resolution.spellDamageBonus = spellBreachDamageBonus(breach)
      resolution.spellDamageEffectSeen = false
      const castEffects = matchingBlocks(choice.cardId, resolution.playerId, g, { kind: 'on_cast' })
        .flatMap(block => block.effects)
      addRemainingEffects(resolution, [
        ...castEffects,
        { kind: 'resolve_spell_damage_bonus' },
        { kind: 'finalize_spell_cast' },
      ])
      messages.push(`Cast ${card.name}${effect.discard ? '' : ' without discarding it'}`)
      continue
    }
  }

  if (resolution.spellDamageBonus && !resolution.spellDamageEffectSeen) {
    const bonusEffect: CardEffect = {
      kind: 'deal_damage', amount: 0, target: 'nemesis_or_minion',
    }
    const targets = getDamageTargets(g, bonusEffect.target)
    if (targets.length > 1) {
      resolution.spellDamageEffectSeen = true
      const decision = createDecision(
        g, resolution.playerId, 'Choose a damage target', 'select_damage_target',
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

  finalizePendingSpellCast(g, resolution)

  g.pendingEffect = null
  if (resolution.nemesisResume && g.currentTurn === 'nemesis' && g.nemesisResolution) {
    return [...messages, ...advanceNemesisTurn(g)]
  }
  return messages
}

/** Resolve the matching effect blocks for a card event. */
export function resolveEffects(
  g: GameState, playerId: string, effects: CardEffect[],
  sourceCardId?: string, spellDamageBonus = 0, effectPlayerIdOverride?: string,
  nemesisResume = false,
): string[] {
  if (g.pendingDecision || g.pendingEffect) return ['Another card effect is already waiting for a decision']
  return runEffectResolution(g, {
    playerId,
    sourceCardId,
    remainingEffects: [...effects],
    spellDamageBonus,
    effectPlayerId: effectPlayerIdOverride,
    nemesisResume,
  })
}

export function resolveCardEffects(
  g: GameState, playerId: string, sourceCardId: string, trigger: CardEffectTrigger,
  lastGainedCardId?: string, spellDamageBonus = 0, pendingSpellCast?: PendingSpellCast,
): string[] {
  const blocks = matchingBlocks(sourceCardId, playerId, g, trigger)
  if (blocks.length === 0 && !pendingSpellCast) return []
  return runEffectResolution(g, {
    playerId,
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
  kind: 'return_card_to_hand'
  choices: CardChoice[]
  marker: string
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
        if (!effect || !isDeferredReturnAction(block.effects)) continue
        const marker = `${cardId}:${breach.index}:${spellIndex}:${phase}:${blockIndex}`
        if (block.oncePerTurn && turnEffects.usedPreppedEffects.includes(marker)) continue
        const choices = getCardChoices(g, playerId, effect.source)
        if (choices.length === 0) continue
        actions.push({ breachIndex: breach.index, spellIndex, cardId, kind: effect.kind, choices, marker })
      }
    }
  }
  return actions
}

/** Return main-phase card actions that can be activated without blocking the turn. */
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
  if (!action) return 'That card is not an available prepped action'
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
      if (phase === 'main_phase' && isDeferredReturnAction(block.effects)) continue
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
    playerId,
    remainingEffects: allEffects,
    preppedPhase: phase,
  })
}

/** Complete the currently pending card decision and continue its effect sequence. */
export function resolvePendingDecision(
  g: GameState, decisionId: string, answer: PendingDecisionAnswer,
): string[] {
  const decision = g.pendingDecision
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
    if (decision.playerId !== pendingNemesisDiscard.playerId) return ['Decision player mismatch']
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
          getCard(candidate.cardId).cost < (cost.minCost ?? 0)) {
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
  if (decision.playerId !== resolution.playerId && decision.playerId !== effectPlayerId(resolution)) {
    return ['Decision player mismatch']
  }

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
    const source = effect.kind === 'choose_one' ? effect.options.find(option => option.id === answer.optionId) : undefined
    if (!source) {
      g.pendingDecision = decision
      resolution.awaiting = effect
      return ['Invalid choice']
    }
    addRemainingEffects(resolution, source.effects)
  } else if (answer.kind === 'choose_optional') {
    if (decision.kind !== 'choose_optional') return ['Decision answer has the wrong type']
    if (effect.kind === 'choose_optional') {
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
  } else if (answer.kind === 'select_prepped_spell') {
    if (decision.kind !== 'select_prepped_spell' || effect.kind !== 'cast_prepped_spell') {
      restore()
      return ['Decision answer has the wrong type']
    }
    const choice = decision.candidates.find(candidate =>
      candidate.playerId === answer.choice.playerId &&
      candidate.breachIndex === answer.choice.breachIndex &&
      candidate.spellIndex === answer.choice.spellIndex &&
      candidate.cardId === answer.choice.cardId,
    )
    if (!choice) {
      restore()
      return ['Invalid prepped spell choice']
    }
    resolution.selectedPreppedSpell = choice
    resolution.confirmedPreppedSpell = choice
    addRemainingEffects(resolution, [effect])
  } else if (answer.kind === 'select_cards') {
    if (decision.kind !== 'select_cards') return ['Decision answer has the wrong type']
    const selected = answer.choices
    if (selected.length < decision.min || selected.length > decision.max) {
      restore()
      return [`Choose between ${decision.min} and ${decision.max} card(s)`]
    }
    const currentPlayerId = effectPlayerId(resolution)
    if (!selectedChoicesAreCurrent(g, currentPlayerId, decision.candidates, selected)) {
      restore()
      return ['Card selection is no longer valid']
    }
    if (effect.kind === 'discard_cards') {
      if (!selected.every(choice => cardChoiceMatches(choice, effect.source))) {
        restore()
        return ['Invalid card source']
      }
      const removed = discardSelectedCards(g, currentPlayerId, selected)
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
      p.destroyedCards.push(...removed)
      return [`Destroyed ${removed.map(id => getCard(id).name).join(', ')}`, ...runEffectResolution(g, resolution)]
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
      const amount = amountValue(g, effectPlayerId(resolution), effect.amount, resolution.sourceCardId)
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
    restore()
    return ['Collective card selection does not match the pending effect']
  } else if (answer.kind === 'select_player_target') {
    if (decision.kind !== 'select_player_target' ||
      (effect.kind !== 'draw_cards' && effect.kind !== 'deal_player_damage' &&
        effect.kind !== 'discard_cards' && effect.kind !== 'shuffle_discard_into_deck' &&
        effect.kind !== 'destroy_top_cards')) {
      restore()
      return ['Decision answer has the wrong type']
    }
    const target = decision.targets.find(candidate => candidate.playerId === answer.target.playerId)
    if (!target) {
      restore()
      return ['Invalid player target']
    }
    const player = getPlayer(g, target.playerId)
    resolution.effectPlayerId = target.playerId
    if (effect.kind === 'draw_cards') {
      const drawn = drawCardsForPlayer(g, target.playerId, effect.amount)
      return [`${player.mageType} draws ${drawn} card(s)`, ...runEffectResolution(g, resolution)]
    }
    if (effect.kind === 'deal_player_damage') {
      const message = sufferPlayerDamage(
        g,
        target.playerId,
        amountValue(g, effectPlayerId(resolution), effect.amount, resolution.sourceCardId),
      )
      const death = checkPlayerDeath(g, target.playerId)
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
    if (decision.kind !== 'reorder_turn_order' || effect.kind !== 'review_turn_order_deck') {
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
      return ['Turn order must include every reviewed card exactly once']
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
    const death = checkPlayerDeath(g, target.id)
    return [
      `Shuffled ${target.mageType}'s turn order card back into the deck`,
      message,
      ...(death ? [death] : []),
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
    const amount = amountValue(g, effectPlayerId(resolution), effect.amount, resolution.sourceCardId)
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

export type SpendType = 'gem' | 'spell' | 'relic' | 'general'

export function getTotalAether(p: PlayerState): number {
  const conditionalEarned = Object.values(p.conditionalAetherEarned ?? {})
    .reduce((sum, amount) => sum + amount, 0)
  return conditionalEarned + p.bonusAether
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
  if (type === 'general') return regularAvail
  const condAvail = getConditionalAetherByType(p, type) - (p.condAetherSpent[type] ?? 0)
  return regularAvail + Math.max(0, condAvail)
}

function spendAether(p: PlayerState, amount: number, type: SpendType): void {
  if (type !== 'general') {
    const condAvail = getConditionalAetherByType(p, type) - (p.condAetherSpent[type] ?? 0)
    const fromCond = Math.min(Math.max(0, condAvail), amount)
    p.condAetherSpent[type] = (p.condAetherSpent[type] ?? 0) + fromCond
    p.regularAetherSpent += amount - fromCond
  } else {
    p.regularAetherSpent += amount
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

  const name = cardDef.name

  const messages = [`Cast ${name}`]
  messages.push(...resolveCardEffects(
    g, playerId, cardDef.id, { kind: 'on_cast' }, undefined, spellDamageBonus,
    { playerId, breachIndex, spellIndex, cardId, discard: true },
  ))
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
  const prepLimit = getPlayerTurnEffects(p).prepSpellLimit
  if (b.prepSpells.length >= prepLimit) return `Breach already has ${prepLimit} spell(s)`
  if (!b.opened && !b.focusedThisTurn) return 'Cannot prep on this breach'

  p.hand.splice(idx, 1)
  b.prepSpells.push(cardId)
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
  breach.prepSpells.splice(spellIndex, 1)
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
  if (!target.opened && !target.focusedThisTurn) return 'The target Breach is not available for preparation'

  if (target.prepSpells.length > 0) {
    const swapIndex = targetSpellIndex ?? 0
    if (!target.prepSpells[swapIndex]) return 'No spell is prepped at the target position'
    const targetCardId = target.prepSpells[swapIndex]!
    source.prepSpells[sourceSpellIndex] = targetCardId
    target.prepSpells[swapIndex] = sourceCardId
    return `Swapped ${getCard(sourceCardId).name} and ${getCard(targetCardId).name}`
  }

  source.prepSpells.splice(sourceSpellIndex, 1)
  target.prepSpells.push(sourceCardId)
  return `Moved ${getCard(sourceCardId).name} to Breach ${toRoman(targetBreachIndex)}`
}

export interface BuyableCard {
  pileIndex: number; cardId: string; cardName: string; cardType: string
  cost: number; remaining: number
}

export function getBuyableCards(g: GameState): BuyableCard[] {
  return g.market.piles.map((pile, i) => {
    const card = getCard(pile.cardId)
    return {
      pileIndex: i, cardId: pile.cardId, cardName: card.name,
      cardType: card.type, cost: card.cost, remaining: pile.remaining,
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

  if (available < card.cost) return `Need ${card.cost} Aether, have ${available}`

  spendAether(p, card.cost, spendType)
  const message = gainCard(g, playerId, pile.cardId, 'discard_top', pileIndex)
  return message ? `Bought ${card.name} (${card.cost}a) -> ${message}` : null
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
  const available = getSpendableAether(p, 'general')
  if (available < effectiveCost) return `Need ${effectiveCost} Aether, have ${available}`

  spendAether(p, effectiveCost, 'general')
  consumeBreachCostReductions(p, 'focus')
  b.focusCount++
  b.focusedThisTurn = true
  if (b.focusCount < b.focusToOpen) {
    b.focusDirection = rotateDirection(b.focusDirection)
    const arrow = DIR_ARROW[b.focusDirection]
    return `Focused: facing ${arrow} (${b.focusCount}/${b.focusToOpen})`
  }
  // Focus complete: auto-open
  b.opened = true
  return `Breach ${toRoman(breachIndex)} OPENED!`
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
  return `Breach ${toRoman(breachIndex)} opened!`
}

export function openBreachDirect(g: GameState, playerId: string, breachIndex: number): string | null {
  const blocked = pendingActionMessage(g)
  if (blocked) return blocked
  const p = getPlayer(g, playerId)
  const b = p.breaches.find(br => br.index === breachIndex)
  if (!b || !isPresentBreach(b)) return 'Invalid breach'
  if (b.opened) return 'Already open'

  const cost = Math.max(0, b.openCost[b.focusDirection] - breachCostReduction(p, 'open'))
  const available = getSpendableAether(p, 'general')
  if (available < cost) return `Need ${cost} Aether (direct open), have ${available}`

  spendAether(p, cost, 'general')
  consumeBreachCostReductions(p, 'open')
  b.opened = true
  b.focusedThisTurn = true
  b.focusCount = b.focusToOpen
  return `Breach ${toRoman(breachIndex)} opened (${cost}a direct)!`
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
  if (p.exhausted) return 'Mage is exhausted'

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
  ))
  return messages.join('; ')
}

/** Whether this mage may offer its main-phase ability button in the current turn. */
export function canActivateAbilityDuringMain(g: GameState, playerId: string): boolean {
  if (g.currentPhase !== 'main' || g.currentTurn === 'nemesis' || g.pendingDecision || g.pendingEffect) return false
  const player = g.players.find(candidate => candidate.id === playerId)
  if (!player || player.exhausted) return false
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
  const turnEffects = getPlayerTurnEffects(p)
  turnEffects.nextBreachCostReductions = []
  turnEffects.usedPreppedEffects = []
  turnEffects.prepSpellLimit = 1
  for (const b of p.breaches) b.focusedThisTurn = false

  // Draw to 5
  while (p.hand.length < 5) {
    const result = drawFromDeck(p.deck, p.discard, 1)
    p.deck = result.newDeck
    p.discard = result.newDiscard
    if (result.drawn.length > 0) {
      p.hand.push(result.drawn[0]!)
    } else break
  }
  msgs.push(`Hand filled to ${p.hand.length}, Aether reset`)

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

export interface DrawnNemesisCard {
  cardId: string
  cardName: string
  tier: number
  damage: number
}

export function nemesisDrawCard(g: GameState): DrawnNemesisCard | null {
  const n = g.nemesis
  if (n.deck.length === 0) return null

  const cardId = n.deck.shift()!
  n.discard.unshift(cardId)
  const card = getCard(cardId)

  // Attack effect resolution is implemented in the Nemesis phases; this legacy
  // adapter keeps the old UI shape until that phase replaces pendingNemesis.
  const tier = 'tier' in card && typeof card.tier === 'number' ? card.tier : 0
  return { cardId, cardName: card.name, tier, damage: 0 }
}

export function nemesisResolveAttack(
  g: GameState, target: 'p1' | 'p2' | 'gravehold', damage: number,
): string {
  if (target === 'gravehold') {
    if (g.damagePrevention) return 'Gravehold suffers no damage this turn'
    g.gravehold.hp = Math.max(0, g.gravehold.hp - Math.max(0, damage))
    return `Gravehold takes ${damage} damage (${g.gravehold.hp}/${g.gravehold.maxHp})`
  }
  return sufferPlayerDamage(g, target, damage)
}

export function sufferPlayerDamage(g: GameState, playerId: string, damage: number): string {
  const p = getPlayer(g, playerId)
  if (g.damagePrevention) return `${p.mageType} suffers no damage this turn`
  p.hp -= Math.max(0, damage)
  return `${p.mageType} takes ${damage} damage (${p.hp}/${p.maxHp})`
}

// ===== Win/Loss Checks =====

export function checkGameOver(g: GameState): string | null {
  if (g.nemesis.hp <= 0) { g.gameOver = true; g.winner = 'players'; return 'VICTORY! Nemesis defeated!' }
  if (g.gravehold.hp <= 0) { g.gameOver = true; g.winner = 'nemesis'; return 'DEFEAT! Gravehold destroyed!' }
  if (g.players.every(p => p.exhausted)) { g.gameOver = true; g.winner = 'nemesis'; return 'DEFEAT! All mages exhausted!' }
  return null
}

export function checkPlayerDeath(g: GameState, playerId: string): string | null {
  const p = getPlayer(g, playerId)
  if (p.hp <= 0 && !p.exhausted) {
    const excess = Math.max(0, -p.hp)
    p.hp = 0
    p.exhausted = true
    g.gravehold.hp = Math.max(0, g.gravehold.hp - excess * 2)
    const openB = p.breaches.find(b => b.opened)
    if (openB) { openB.opened = false; openB.prepSpells = [] }
    p.charge = 0
    return `${p.mageType} EXHAUSTED! Breach lost, Gravehold -${excess * 2}`
  }
  return null
}

export function canPlayerAct(g: GameState, playerId: string): boolean {
  const p = getPlayer(g, playerId)
  if (p.exhausted) return false
  if (g.pendingDecision) return false

  // Has non-spell cards in hand
  if (p.hand.some(cid => getCard(cid).type !== 'spell')) return true
  // Has open or focused breach to prep a spell
  if (p.hand.some(cid => getCard(cid).type === 'spell') &&
    p.breaches.some(b => isPresentBreach(b) && (b.opened || b.focusedThisTurn) &&
      b.prepSpells.length < getPlayerTurnEffects(p).prepSpellLimit)) return true

  // A Power card's To Discard action remains a legal Main Phase action even
  // when the player has no Aether left. Keep it in the action check so an
  // Aether or Charge payment cannot end the phase before this interrupt.
  if (getNemesisDiscardActions(g, playerId).length > 0) return true

  const aether = getSpendableAether(p, 'general')

  // Can buy something from market
  for (const pile of g.market.piles) {
    if (pile.remaining > 0 && getCard(pile.cardId).cost <= aether) return true
  }

  // Can focus or open a breach
  for (const b of p.breaches) {
    if (!isPresentBreach(b)) continue
    const focusCost = Math.max(0, b.focusCost - breachCostReduction(p, 'focus'))
    const openCost = Math.max(0, b.openCost[b.focusDirection] - breachCostReduction(p, 'open'))
    if (!b.opened && b.focusCount < b.focusToOpen && focusCost <= aether) return true
    if (!b.opened && openCost <= aether) return true
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
