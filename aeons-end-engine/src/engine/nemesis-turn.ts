import type {
  CardChoice, CardEffect, CardEffectCondition, CardSelectionSource, GameState, MarketPileChoice,
  NemesisCardDef, NemesisCardInPlay, NemesisDiscardCost, NemesisEffectTrigger,
  NemesisResolutionState, PendingEffectResolution, PendingDecision, PlayerState, PreppedSpellChoice,
} from '../types'
import { getCard, getNemesisDefinition, MAGES } from '../data'
import { getNemesisRules } from '../nemesis/registry'
import { leastExpensiveMarketPiles, marketPileChoices } from '../nemesis/market'
import { shuffle } from './decks'
import { getSpendableAether, spendAether } from './aether'
import { ensurePlayerCollections } from './player-state'
import { getPlayer } from './zones'
import {
  createCardInstance, ensureCardInstanceZone, insertCardInstanceAt,
  markCardInstanceRevealed, removeCardInstanceAt, resetCardInstancesAfterShuffle,
} from './card-instances'
import {
  createCardInZone, destroyCardFromZone, destroySelectedPlayerCards, getBreachCardInstanceZone, getNemesisCardStackZone,
  getNemesisCardInstanceZone, moveCardBetweenZones, moveNemesisPlayCardToZone, placeTemporaryCardInZone,
  recordCardDestruction, recordCardMove, recordCardShuffle, recordCardTemporary,
} from './card-movement'
import type { checkGameOver as CheckGameOver, dealDamage as DealDamage } from './combat'

export interface NemesisTurnServices {
  conditionMatches(game: GameState, playerId: undefined, condition?: CardEffectCondition, sourceCardId?: string): boolean
  runEffectResolution(game: GameState, resolution: PendingEffectResolution): string[]
  resolveEffects: typeof import('../engine').resolveEffects
  createDecision(
    game: GameState,
    prompt: string,
    kind: PendingDecision['kind'],
    details: Record<string, unknown>,
    sourceCardId?: string,
  ): PendingDecision
  setPendingDecision: typeof import('../engine').setPendingDecision
  checkGameOver: typeof CheckGameOver
  dealDamage: typeof DealDamage
  getCardChoices(game: GameState, playerId: string, source: CardSelectionSource): CardChoice[]
  getPreppedSpellChoices(game: GameState): PreppedSpellChoice[]
  getPreppedSpellCost(game: GameState, playerId: string, breachIndex: number, spellIndex: number): number | null
  discardSelectedCards(game: GameState, playerId: string, choices: CardChoice[], preserveSelectionOrder?: boolean): string[]
  drawCardsForPlayer(game: GameState, playerId: string, amount: number): number
}

export interface NemesisDiscardAction {
  instanceId: string
  cardId: string
  cardName: string
  costs: NemesisDiscardCost[]
}

export function createNemesisTurnRuntime(services: NemesisTurnServices) {
  const {
    conditionMatches, runEffectResolution, resolveEffects, createDecision, setPendingDecision,
    checkGameOver, dealDamage, getCardChoices, getPreppedSpellChoices, getPreppedSpellCost,
    discardSelectedCards, drawCardsForPlayer,
  } = services

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
    createCardInstance(g, card.cardId, true, card.instanceId)
  }
  n.deckInstanceIds = ensureCardInstanceZone(g, n.deck, n.deckInstanceIds)
  n.discardInstanceIds = ensureCardInstanceZone(g, n.discard, n.discardInstanceIds, true)
  n.strikeDeckInstanceIds = ensureCardInstanceZone(g, n.strikeDeck, n.strikeDeckInstanceIds)
  n.strikeDiscardInstanceIds = ensureCardInstanceZone(g, n.strikeDiscard, n.strikeDiscardInstanceIds, true)
}

function cardInstanceKey(card: NemesisCardInPlay): string {
  return card.instanceId ?? `${card.cardId}:${card.placedAt}`
}

function orderedNemesisMainCards(cards: NemesisCardInPlay[]): NemesisCardInPlay[] {
  return [...cards].sort((a, b) => {
    const rowOrder = (a.displayRow === 'top' ? 0 : 1) - (b.displayRow === 'top' ? 0 : 1)
    return rowOrder || a.placedAt - b.placedAt
  })
}

function initializeNemesisTurn(g: GameState): void {
  ensureNemesisRuntime(g)
  const n = g.nemesis
  n.nemesisTurnNumber = (n.nemesisTurnNumber ?? 0) + 1
  g.nemesisResolution = {
    step: 'main',
    mainQueue: orderedNemesisMainCards(n.playArea).map(cardInstanceKey),
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
  const sourceIndex = g.nemesis.playArea.indexOf(card)
  g.nemesis.playArea = g.nemesis.playArea.filter(candidate => candidate !== card)
  const instanceId = card.instanceId ?? `${card.cardId}:${card.placedAt}`
  insertCardInstanceAt(g, g.nemesis.discard, g.nemesis.discardInstanceIds ??= [], {
    cardId: card.cardId, instanceId, revealed: true,
  }, 0, true)
  recordCardMove(g, instanceId, card.cardId,
    { zoneId: 'nemesis:play_area', zone: 'nemesis_play_area', ownerId: 'nemesis', index: sourceIndex },
    { zoneId: 'nemesis:nemesis_discard', zone: 'nemesis_discard', ownerId: 'nemesis', index: 0 },
    'discard')
}

/** Move a resolved Attack or depleted Power to the Nemesis discard. */
function discardCompletedNemesisCard(g: GameState, resolution: NemesisResolutionState): void {
  if (!resolution.activeCardPendingDiscard) return
  const card = activeNemesisCard(g, resolution)
  const isSetAsideForTurnOrderReset = card?.cardType === 'power' &&
    g.nemesis.turnOrderDeckResetCardId === card.cardId &&
    (!g.nemesis.turnOrderDeckResetCardInstanceId ||
      cardInstanceKey(card) === g.nemesis.turnOrderDeckResetCardInstanceId)
  const isSetAsideByCardRule = card?.cardType === 'power' &&
    (getCard(card.cardId) as NemesisCardDef).setAsideWhenResolved === true
  if ((isSetAsideForTurnOrderReset || isSetAsideByCardRule) && card) {
    const sourceIndex = g.nemesis.playArea.indexOf(card)
    g.nemesis.playArea = g.nemesis.playArea.filter(candidate => candidate !== card)
    g.nemesis.setAsideCards ??= []
    if (!g.nemesis.setAsideCards.some(candidate => cardInstanceKey(candidate) === cardInstanceKey(card))) {
      g.nemesis.setAsideCards.push(card)
      recordCardMove(g, cardInstanceKey(card), card.cardId,
        { zoneId: 'nemesis:play_area', zone: 'nemesis_play_area', ownerId: 'nemesis', index: sourceIndex },
        { zoneId: 'nemesis:set_aside', zone: 'nemesis_set_aside', ownerId: 'nemesis', index: g.nemesis.setAsideCards.length - 1 },
        'return')
    }
  } else if (card?.cardType === 'power' &&
    (getCard(card.cardId) as NemesisCardDef).returnToSpecificDeckOnResolve === true) {
    const destination = getNemesisCardInstanceZone(g, 'strike_deck')
    if (moveNemesisPlayCardToZone(g, card, destination, destination.cards.length, 'return')) {
      markCardInstanceRevealed(g, card.instanceId ?? `${card.cardId}:${card.placedAt}`)
    }
  } else if (card?.cardType === 'attack' || card?.cardType === 'power') {
    discardNemesisCard(g, card)
  }
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
  const strikeDeck = getNemesisCardInstanceZone(g, 'strike_deck')
  for (let index = 0; index < devoured; index++) {
    createCardInZone(g, strikeDeck, pile.cardId, 0, 'effect')
  }

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
    .filter(block => conditionMatches(g, undefined, block.condition, card.id))
    .flatMap(block => block.effects) ?? []
  if (trigger === 'persistent') {
    effects.push(...(activeNemesisRules(g)?.additionalPersistentEffects?.(g, card) ?? []))
  }
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
function advanceNemesisTurn(g: GameState): string[] {
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
        resolution.drawnCardInstanceId = undefined
        resolution.drawnCardProcessed = undefined
        resolution.drawnCardResponseHandled = undefined
        resolution.drawnCardCancelled = undefined
        resolution.drawnCardRevealed = undefined
        resolution.step = 'complete'
        continue
      }
      const nemesisDeck = getNemesisCardInstanceZone(g, 'nemesis_deck')
      const drawnCard = resolution.drawnCardId
        ? undefined
        : removeCardInstanceAt(g, nemesisDeck.cards, nemesisDeck.instanceIds, 0)
      const cardId = resolution.drawnCardId ?? drawnCard?.cardId
      if (!cardId) {
        messages.push('Nemesis deck is empty — Draw Phase complete')
        resolution.step = 'complete'
        continue
      }
      resolution.drawnCardId = cardId
      resolution.drawnCardInstanceId ??= drawnCard?.instanceId
      if (resolution.drawnCardInstanceId) markCardInstanceRevealed(g, resolution.drawnCardInstanceId)
      if (drawnCard) {
        recordCardTemporary(g, drawnCard.instanceId, drawnCard.cardId,
          { zoneId: nemesisDeck.zoneId, zone: 'nemesis_deck', ownerId: 'nemesis', index: 0 },
          { zoneId: 'temporary:nemesis_draw', zone: 'temporary', ownerId: 'nemesis', index: 0 },
          'reveal')
        const gameOver = getNemesisDefinition(g.nemesis.definitionId)?.deckEmptyLoses &&
          nemesisDeck.cards.length === 0 ? checkGameOver(g) : null
        if (gameOver) {
          messages.push(gameOver)
          return messages
        }
      }
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
        if (resolution.drawnCardInstanceId) {
          recordCardDestruction(g, resolution.drawnCardInstanceId, cardId,
            { zoneId: 'temporary:nemesis_draw', zone: 'temporary', ownerId: 'nemesis', index: 0 }, 'effect')
        }
        messages.push(`${definition.name} has no effect and will not enter play`)
        continue
      }
      resolution.drawnCardProcessed = true
      if (definition.type === 'attack') {
        messages.push(`Drew Attack: ${definition.name} — resolve immediately`)
        const counter = (g.nemesis.cardInstanceCounter ?? 0) + 1
        g.nemesis.cardInstanceCounter = counter
        const placedInstanceId = resolution.drawnCardInstanceId ?? `${cardId}:${counter}`
        const placed: NemesisCardInPlay = {
          cardId,
          cardType: 'attack',
          placedAt: counter,
          instanceId: placedInstanceId,
          enteredOnNemesisTurn: g.nemesis.nemesisTurnNumber,
        }
        createCardInstance(g, cardId, true, placed.instanceId)
        g.nemesis.playArea.push(placed)
        recordCardMove(g, placedInstanceId, cardId,
          { zoneId: 'temporary:nemesis_draw', zone: 'temporary', ownerId: 'nemesis', index: 0 },
          { zoneId: 'nemesis:play_area', zone: 'nemesis_play_area', ownerId: 'nemesis', index: g.nemesis.playArea.length - 1 },
          'nemesis_turn')
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
        const placedInstanceId = resolution.drawnCardInstanceId ?? `${cardId}:${counter}`
        const placed: NemesisCardInPlay = {
          cardId,
          cardType: definition.type,
          placedAt: counter,
          instanceId: placedInstanceId,
          enteredOnNemesisTurn: g.nemesis.nemesisTurnNumber,
          ...(definition.displayRow ? { displayRow: definition.displayRow } : {}),
          ...(definition.type === 'minion'
            ? {
                lifeTokens: definition.life ?? 0,
                ...(definition.nemesisTokens != null ? { nemesisTokens: definition.nemesisTokens } : {}),
              }
            : { powerTokens: definition.power ?? 0 }),
        }
        createCardInstance(g, cardId, true, placed.instanceId)
        g.nemesis.playArea.push(placed)
        recordCardMove(g, placedInstanceId, cardId,
          { zoneId: 'temporary:nemesis_draw', zone: 'temporary', ownerId: 'nemesis', index: 0 },
          { zoneId: 'nemesis:play_area', zone: 'nemesis_play_area', ownerId: 'nemesis', index: g.nemesis.playArea.length - 1 },
          'nemesis_turn')
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
    if (nemesisDefinition && endTurnRule?.shouldResolve(g, nemesisDefinition) &&
      !(endTurnRule.oncePerTurn && resolution.endTurnRuleResolved)) {
      messages.push(endTurnRule.message)
      if (endTurnRule.oncePerTurn) resolution.endTurnRuleResolved = true
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

function resolveNemesisMainPhase(g: GameState): string[] {
  if (g.currentTurn !== 'nemesis') return ['It is not the Nemesis turn']
  ensureNemesisRuntime(g)
  if (!g.nemesisResolution) initializeNemesisTurn(g)
  g.nemesisResolution!.step = 'main'
  g.currentPhase = 'nemesis_main'
  return advanceNemesisTurn(g)
}

function resolveNemesisDrawPhase(g: GameState): string[] {
  if (g.currentTurn !== 'nemesis') return ['It is not the Nemesis turn']
  ensureNemesisRuntime(g)
  if (!g.nemesisResolution) initializeNemesisTurn(g)
  g.nemesisResolution!.step = 'draw'
  g.currentPhase = 'nemesis_draw'
  return advanceNemesisTurn(g)
}



function drawStrikeCard(g: GameState): string | null {
  ensureNemesisRuntime(g)
  if (g.nemesis.strikeDeck.length === 0 && g.nemesis.strikeDiscard.length > 0) shuffleStrikeDeck(g)
  const deck = getNemesisCardInstanceZone(g, 'strike_deck')
  if (!deck.cards.length) return null
  const resolution = g.pendingEffect
  if (resolution) {
    const card = removeCardInstanceAt(g, deck.cards, deck.instanceIds, 0)
    if (!card) return null
    resolution.revealedStrikeCardInstanceId = card.instanceId
    recordCardTemporary(g, card.instanceId, card.cardId,
      { zoneId: deck.zoneId, zone: 'strike_deck', ownerId: 'nemesis', index: 0 },
      { zoneId: 'temporary:strike_resolution', zone: 'temporary', ownerId: 'nemesis', index: 0 },
      'reveal')
    return card.cardId
  }
  const card = removeCardInstanceAt(g, deck.cards, deck.instanceIds, 0)
  if (!card) return null
  g.nemesis.resolvingStrikeCardId = card.cardId
  g.nemesis.resolvingStrikeCardInstanceId = card.instanceId
  recordCardTemporary(g, card.instanceId, card.cardId,
    { zoneId: deck.zoneId, zone: 'strike_deck', ownerId: 'nemesis', index: 0 },
    { zoneId: 'temporary:strike_resolution', zone: 'temporary', ownerId: 'nemesis', index: 0 },
    'reveal')
  return card.cardId
}

/** Return a resolved Strike to the auxiliary deck and shuffle it back in. */
function returnStrikeCardToDeck(g: GameState, cardId: string, instanceId?: string): void {
  ensureNemesisRuntime(g)
  const deck = getNemesisCardInstanceZone(g, 'strike_deck')
  const resolvingInstanceId = instanceId ?? (
    g.nemesis.resolvingStrikeCardId === cardId ? g.nemesis.resolvingStrikeCardInstanceId : undefined
  )
  if (resolvingInstanceId) {
    placeTemporaryCardInZone(g, resolvingInstanceId, cardId,
      { zoneId: 'temporary:strike_resolution', zone: 'temporary', ownerId: 'nemesis', index: 0 },
      deck, deck.cards.length, 'return', true)
    if (g.nemesis.resolvingStrikeCardInstanceId === resolvingInstanceId) {
      g.nemesis.resolvingStrikeCardId = undefined
      g.nemesis.resolvingStrikeCardInstanceId = undefined
    }
  } else {
    const discard = getNemesisCardInstanceZone(g, 'strike_discard')
    const index = discard.cards.findIndex(candidate => candidate === cardId)
    if (index >= 0) moveCardBetweenZones(g, discard, index, deck, deck.cards.length, 'return')
    else createCardInZone(g, deck, cardId, deck.cards.length, 'return', true)
  }
  shuffleStrikeDeck(g)
}

function shuffleStrikeDeck(g: GameState): void {
  const deck = getNemesisCardInstanceZone(g, 'strike_deck')
  const discard = getNemesisCardInstanceZone(g, 'strike_discard')
  while (discard.cards.length > 0) {
    moveCardBetweenZones(g, discard, discard.cards.length - 1, deck, deck.cards.length, 'shuffle')
  }
  const shuffled = shuffle(deck.cards.map((cardId, index) => ({
    cardId, instanceId: deck.instanceIds[index]!,
  })))
  deck.cards.splice(0, deck.cards.length, ...shuffled.map(card => card.cardId))
  deck.instanceIds.splice(0, deck.instanceIds.length, ...shuffled.map(card => card.instanceId))
  resetCardInstancesAfterShuffle(g, deck.instanceIds)
  deck.instanceIds.forEach((instanceId, index) => {
    recordCardShuffle(g, instanceId, deck.cards[index]!, {
      zoneId: deck.zoneId, zone: deck.zone, ownerId: deck.ownerId, index,
    })
  })
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
      return eligiblePreppedSpellsForNemesisCost(g, playerId, cost).length >= Math.max(0, cost.amount)
    }
    if (cost.kind === 'discard_cards') return getCardChoices(g, playerId, cost.source).length >= Math.max(0, cost.amount)
    const candidates = getCardChoices(g, playerId, cost.source)
      .filter(choice => getCard(choice.cardId).cost >= (cost.minCost ?? 0))
    return candidates.length >= Math.max(0, cost.amount)
  }
  
  function eligiblePreppedSpellsForNemesisCost(
    g: GameState,
    payerPlayerId: string,
    cost: Extract<NemesisDiscardCost, { kind: 'destroy_prepped_spells' }>,
  ): PreppedSpellChoice[] {
    return getPreppedSpellChoices(g).filter(choice =>
      (cost.playerScope === 'any_player' || choice.playerId === payerPlayerId) &&
      (getPreppedSpellCost(g, choice.playerId, choice.breachIndex, choice.spellIndex) ?? 0) >= (cost.minCost ?? 0),
    )
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
  function getNemesisDiscardActions(
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
    for (const payment of pending.selectedCardPayments) {
      const cost = pending.costs[payment.costIndex]
      const removed = cost?.kind === 'discard_cards'
        ? discardSelectedCards(g, pending.playerId, payment.choices, true)
        : destroySelectedPlayerCards(g, pending.playerId, payment.choices)
      ensurePlayerCollections(player)
      const actionWord = cost?.kind === 'discard_cards' ? 'Discarded' : 'Destroyed'
      messages.push(`${actionWord} ${removed.map(id => getCard(id).name).join(', ')} to discard ${action.cardName}`)
      if (cost?.kind === 'discard_cards' && (cost.drawAfter ?? 0) > 0) {
        const drawn = drawCardsForPlayer(g, pending.playerId, cost.drawAfter!)
        messages.push(`${player.mageType} draws ${drawn} card${drawn === 1 ? '' : 's'} after paying ${action.cardName}'s To Discard cost`)
      }
    }
    for (const payment of pending.selectedPreppedSpellPayments) {
      const removed: string[] = []
      for (const choice of [...payment.choices].sort((a, b) => b.spellIndex - a.spellIndex)) {
        const owner = getPlayer(g, choice.playerId)
        const breach = owner.breaches.find(item => item.index === choice.breachIndex)
        if (!breach || breach.prepSpells[choice.spellIndex] !== choice.cardId) continue
        const source = getBreachCardInstanceZone(g, owner.id, breach.index)
        const destroyed = destroyCardFromZone(g, source, choice.spellIndex)
        if (destroyed) removed.push(destroyed)
      }
      messages.push(`Destroyed ${removed.map(id => getCard(id).name).join(', ')} to discard ${action.cardName}`)
    }
  
    const card = nemesisCardByInstance(g, pending.cardInstanceId)
    if (!card) {
      g.pendingNemesisDiscard = null
      return ['The Power card is no longer in play']
    }
    const definition = getCard(card.cardId) as NemesisCardDef
    if (definition.returnToSpecificDeckOnDiscard) {
      if (definition.discardUnderCardsToNemesisDiscard) {
        const stack = getNemesisCardStackZone(g, card)
        const discard = getNemesisCardInstanceZone(g, 'nemesis_discard')
        while (stack.cards.length > 0) {
          moveCardBetweenZones(g, stack, 0, discard, 0, 'discard', { reveal: true })
        }
      }
      const deck = getNemesisCardInstanceZone(g, 'strike_deck')
      const instanceId = card.instanceId ?? `${card.cardId}:${card.placedAt}`
      if (moveNemesisPlayCardToZone(g, card, deck, deck.cards.length, 'return')) {
        markCardInstanceRevealed(g, instanceId)
      }
    } else {
      const sourceIndex = g.nemesis.playArea.indexOf(card)
      g.nemesis.playArea = g.nemesis.playArea.filter(candidate => candidate !== card)
      const discardIndex = 0
      insertCardInstanceAt(g, g.nemesis.discard, g.nemesis.discardInstanceIds ??= [], {
        cardId: card.cardId,
        instanceId: card.instanceId ?? `${card.cardId}:${card.placedAt}`,
        revealed: true,
      }, discardIndex, true)
      recordCardMove(g, card.instanceId ?? `${card.cardId}:${card.placedAt}`, card.cardId,
        { zoneId: 'nemesis:play_area', zone: 'nemesis_play_area', ownerId: 'nemesis', index: sourceIndex },
        { zoneId: 'nemesis:nemesis_discard', zone: 'nemesis_discard', ownerId: 'nemesis', index: discardIndex },
        'discard')
    }
    g.pendingNemesisDiscard = null
    messages.push(definition.returnToSpecificDeckOnDiscard
      ? `Returned ${action.cardName} to the bottom of the ${getNemesisDefinition(g.nemesis.definitionId)?.specificDeckName ?? 'Nemesis specific deck'}`
      : `Discarded Power: ${action.cardName}`)
    return messages
  }
  
  function continueNemesisDiscard(g: GameState): string[] {
    const pending = g.pendingNemesisDiscard
    if (!pending) return ['No pending To Discard action']
    while (pending.nextCostIndex < pending.costs.length) {
      const cost = pending.costs[pending.nextCostIndex]!
      pending.nextCostIndex++
      if (cost.kind === 'destroy_prepped_spells') {
        const candidates = eligiblePreppedSpellsForNemesisCost(g, pending.playerId, cost)
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
  function discardNemesisPower(g: GameState, playerId: string, instanceId: string): string[] {
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
  
  return {
    ensureNemesisRuntime, cardInstanceKey, initializeNemesisTurn, activeNemesisRules, usesDevouredPile, emptyMarketPileCount,
    devourMarketPile, fixedDevourPile, discardCompletedNemesisCard, advanceNemesisTurn,
    resolveNemesisMainPhase, resolveNemesisDrawPhase, drawStrikeCard, returnStrikeCardToDeck,
    getNemesisDiscardActions, continueNemesisDiscard, discardNemesisPower,
  }
}
