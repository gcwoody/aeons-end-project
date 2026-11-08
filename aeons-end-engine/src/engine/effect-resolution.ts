import type { BreachChoice, CardEffect, CardEffectOption, CardMoveZone, CardSelectionSource, CardZone, GameState, NemesisCardDef, NemesisCardInPlay, NemesisDrawContext, PendingEffectResolution } from '../types'
import type { SpendType } from './aether'
import type { EffectResolutionServices } from '../engine'
import { gainPlayerCharge } from './charge-feedback'
import { recordHealthChange } from './health-feedback'
import {
  getPlayer, preparePlayerDeckForRevealWithInstances, putPlayerCardInDeck,
  rememberOwnedTrinketInstance, returnCorruptionToBottom,
  shufflePlayerDiscardIntoDeck, shufflePlayerHandIntoDeck, takeCorruptionFromDeck,
  takeOwnedTrinketInstance,
} from './zones'
import {
  createCardInstance, ensureCardInstanceZone, findCardInstanceId, insertCardInstanceAt, markCardInstanceRevealed,
  removeCardInstanceAt, resetCardInstancesAfterShuffle,
} from './card-instances'
import {
  createCardInZone, destroyCardFromZone, ensurePendingSpellCastInstanceId,
  getBreachCardInstanceZone, getNemesisCardStackZone,
  getNemesisCardInstanceZone, getPlayerCardInstanceZone, moveCardBetweenZones, moveNemesisPlayCardToZone,
  moveCardToTemporary,
  placeTemporaryCardInZone, recordCardDestruction, recordCardMove, recordCardShuffle, recordCardTemporary,
} from './card-movement'
import { availableCardEffectOptionIds } from './effect-conditions'
import { autoSelectSameCardChoices } from './sequential-card-selection'
import { addSubBoardToken, getSubBoardTokens, moveSubBoardToken, removeSubBoardToken } from './sub-board'
import { getSourceMinion, retainFullyResolvableOrMaximumTargets } from './targets'

export function createEffectResolver(services: EffectResolutionServices) {
  const {
    activeNemesisRules,
    addRemainingEffects,
    advanceNemesisTurn,
    amountValue,
    applyFreeBreachFocus,
    applySpellDamageBonus,
    automaticallyAllocateDamage,
    availableRecallChoices,
    breachOnCastEffects,
    canConjureToBreach,
    captureEffectContext,
    cardNameMatchesAny,
    checkGameOver,
    checkPlayerDeath,
    clearPendingSpellCast,
    collectBreachOpenedEffects,
    collectPlayerCardTriggerEffects,
    conditionMatches,
    contextualizeCardEffectBlock,
    createDecision,
    damageEffectAmountValue,
    damageNemesis,
    dealDamage,
    dealNemesisTargetDamage,
    destroyCard,
    destroyExhaustedBreach,
    devourMarketPile,
    discardCollectiveCards,
    discardCompletedNemesisCard,
    discardPendingSpellCast,
    discardPreppedSpellChoices,
    discardSelectedCards,
    drawCardsForPlayer,
    drawStrikeCard,
    effectPlayerId,
    effectTargetPlayerId,
    emptyMarketPileCount,
    ensurePlayerCollections,
    ensureTrinketDeckState,
    findPlayerCardInPlayIndex,
    fixedDevourPile,
    forgetSpecificDeckCard,
    gainCard,
    gainLife,
    gainPulseTokens,
    gainSwapZoneCard,
    getBreachChoices,
    getCard,
    getCardChoices,
    getCollectiveCardChoices,
    getDamageTargets,
    getDoomOwner,
    getEffectPlayerTargets,
    getExhaustBreachChoices,
    getLifeTargets,
    getMarketCardCost,
    getNemesisDefinition,
    getPlayer,
    getPlayerTargets,
    getPlayerTurnEffects,
    getPlayerTurnOrderCards,
    getPreppedSpellChoices,
    getPreppedSpellCost,
    getSelectedDamagePlayerTargets,
    getSelectedPlayerTargets,
    getSpendableAether,
    getSupplyPileGainEffects,
    getUnspentAether,
    getZoneCards,
    hasDeferredAdditionalDamage,
    isFaceDownPreppedSpell,
    isPresentBreach,
    leastExpensiveMarketPiles,
    losePulseTokens,
    marketPileChoices,
    matchingBlocks,
    moveGainedSupplyCardToDeck,
    optionalEffectAvailable,
    pauseEffect,
    pauseRevealTopCard,
    pendingDecision,
    playerCardPowerTokenCount,
    putPlayerCardIntoPlay,
    queuePlayerExhaustion,
    rememberSpecificDeckCard,
    rememberSpecificDeckTop,
    replenishTurnOrderDeckForReveal,
    resetBreachToStartingPosition,
    resolveSimultaneousEffectGroups,
    returnSelectedCard,
    returnStrikeCardToDeck,
    shuffle,
    setPendingDecision,
    spellBreachDamageBonus,
    spendAether,
    sufferPlayerDamage,
    toRoman,
    turnSpellDamageBonus,
    MAGES,
    MAX_PULSE_TOKENS
  } = services
  const specificDeckName = (g: GameState) =>
    getNemesisDefinition(g.nemesis.definitionId)?.specificDeckName ?? 'Nemesis specific deck'

  return function runEffectResolution(
  g: GameState, resolution: PendingEffectResolution,
): string[] {
  const messages: string[] = []
  const deferDamageUntilPrerequisitesResolve = (effect: CardEffect) => {
    // Keep a damage effect that depends on a later choice inside its current
    // card-effect block. Appending it to the whole resolution queue can put it
    // after resolve_spell_damage_bonus, which mistakes the cast for a spell
    // with no damage and creates a separate bonus-only damage instance.
    const blockEndIndex = resolution.remainingEffects.findIndex(candidate =>
      candidate.kind === 'restore_effect_context' && candidate.preserveSpellDamageState,
    )
    const spellBonusIndex = resolution.remainingEffects.findIndex(candidate =>
      candidate.kind === 'resolve_spell_damage_bonus',
    )
    const insertAt = blockEndIndex >= 0
      ? blockEndIndex
      : spellBonusIndex >= 0
        ? spellBonusIndex
        : resolution.remainingEffects.length
    resolution.remainingEffects.splice(insertAt, 0, effect)
  }
  g.pendingEffect = null
  if (resolution.sourceCardOwnerId === undefined && resolution.sourceCardId) {
    resolution.sourceCardOwnerId = resolution.pendingSpellCast?.cardId === resolution.sourceCardId
      ? resolution.pendingSpellCast.playerId
      : resolution.sourcePlayerId
  }
  ensurePendingSpellCastInstanceId(g, resolution.pendingSpellCast)
  discardPendingSpellCast(g, resolution)

  const nemesisEffectsFor = (card: NemesisCardDef, trigger: 'immediately' | 'power_resolved'): CardEffect[] =>
    (card.nemesisEffects ?? []).filter(block => block.trigger === trigger)
      .flatMap(block => block.condition
        ? [{ kind: 'conditional' as const, condition: block.condition, effects: block.effects }]
        : block.effects)
  const restoreCurrentNemesisCard = (): CardEffect => ({
    kind: 'restore_nemesis_card_context',
    activeCardInstanceId: g.nemesisResolution?.activeCardInstanceId,
    activeCardId: g.nemesisResolution?.activeCardId,
    activeTrigger: g.nemesisResolution?.activeTrigger,
    activeCardPendingDiscard: g.nemesisResolution?.activeCardPendingDiscard,
  })
  const restoreCurrentEffectContext = (): CardEffect => ({
    kind: 'restore_effect_context',
    sourcePlayerId: resolution.sourcePlayerId,
    sourceCardOwnerId: resolution.sourceCardOwnerId,
    sourceCardId: resolution.sourceCardId,
    effectPlayerId: resolution.effectPlayerId,
    pendingSpellCast: resolution.pendingSpellCast ? { ...resolution.pendingSpellCast } : undefined,
    spellDamageBonus: resolution.spellDamageBonus,
    spellAdditionalDamageBonus: resolution.spellAdditionalDamageBonus,
  })
  const captureNemesisDrawContext = (): NemesisDrawContext => ({
    drawnCardId: g.nemesisResolution?.drawnCardId,
    drawnCardProcessed: g.nemesisResolution?.drawnCardProcessed,
    drawnCardRevealed: g.nemesisResolution?.drawnCardRevealed,
    drawnCardInstanceId: g.nemesisResolution?.drawnCardInstanceId,
    drawnCardResponseHandled: g.nemesisResolution?.drawnCardResponseHandled,
    drawnCardCancelled: g.nemesisResolution?.drawnCardCancelled,
    drawnCardSourceZone: g.nemesisResolution?.drawnCardSourceZone,
    drawnCardSourceParentInstanceId: g.nemesisResolution?.drawnCardSourceParentInstanceId,
  })
  const setNemesisDrawContext = (context: NemesisDrawContext) => {
    const turn = g.nemesisResolution
    if (!turn) return
    turn.drawnCardId = context.drawnCardId
    turn.drawnCardProcessed = context.drawnCardProcessed
    turn.drawnCardRevealed = context.drawnCardRevealed
    turn.drawnCardInstanceId = context.drawnCardInstanceId
    turn.drawnCardResponseHandled = context.drawnCardResponseHandled
    turn.drawnCardCancelled = context.drawnCardCancelled
    turn.drawnCardSourceZone = context.drawnCardSourceZone
    turn.drawnCardSourceParentInstanceId = context.drawnCardSourceParentInstanceId
  }
  const pushNemesisDrawContext = (
    cardId: string,
    instanceId: string,
    sourceZone: 'strike_deck' | 'nemesis_card_stack',
    parentInstanceId?: string,
  ) => {
    const turn = g.nemesisResolution
    if (!turn) return
    turn.drawnCardContextStack ??= []
    turn.drawnCardContextStack.push(captureNemesisDrawContext())
    setNemesisDrawContext({
      drawnCardId: cardId,
      drawnCardProcessed: false,
      drawnCardRevealed: true,
      drawnCardInstanceId: instanceId,
      drawnCardResponseHandled: true,
      drawnCardCancelled: false,
      drawnCardSourceZone: sourceZone,
      drawnCardSourceParentInstanceId: parentInstanceId,
    })
  }
  const popNemesisDrawContext = (): { context: NemesisDrawContext; cancelled: boolean } | null => {
    const turn = g.nemesisResolution
    const previous = turn?.drawnCardContextStack?.pop()
    if (!turn || !previous) return null
    const cancelled = turn.drawnCardCancelled === true
    const context = captureNemesisDrawContext()
    setNemesisDrawContext(previous)
    return { context, cancelled }
  }
  const nemesisDrawAbilityPlayer = (cardType: NemesisCardDef['type']) => {
    if (cardType !== 'attack' && cardType !== 'power') return undefined
    return g.players.find(player => {
      const mage = MAGES[player.mageType]
      if (!mage || player.charge < player.chargeThreshold || mage.abilityEffects.length === 0) return false
      if (mage.abilityTrigger.kind !== 'nemesis_card_drawn') return false
      return mage.abilityTrigger.cardType === 'attack_or_power' || mage.abilityTrigger.cardType === cardType
    })
  }
  const createNemesisCardInPlay = (
    cardId: string,
    instanceId: string,
    definition: NemesisCardDef,
    turnProtection: boolean,
    source: { zoneId: string; zone: CardMoveZone; ownerId: string | null; index: number },
  ): NemesisCardInPlay => {
    const placedAt = (g.nemesis.cardInstanceCounter ?? 0) + 1
    g.nemesis.cardInstanceCounter = placedAt
    const placed: NemesisCardInPlay = {
      cardId,
      cardType: definition.type,
      placedAt,
      instanceId,
      enteredOnNemesisTurn: g.nemesis.nemesisTurnNumber,
      ...(definition.displayRow ? { displayRow: definition.displayRow } : {}),
      ...(definition.type === 'minion'
        ? {
            lifeTokens: definition.life ?? 0,
            ...(definition.nemesisTokens != null ? { nemesisTokens: definition.nemesisTokens } : {}),
          }
        : definition.type === 'power'
          ? {
              powerTokens: definition.power ?? 0,
              ...(turnProtection ? { powerTokenLossBlockedOnTurn: g.nemesis.nemesisTurnNumber } : {}),
            }
          : {}),
    }
    createCardInstance(g, cardId, true, instanceId)
    g.nemesis.playArea.push(placed)
    recordCardMove(g, instanceId, cardId,
      source,
      { zoneId: 'nemesis:play_area', zone: 'nemesis_play_area', ownerId: 'nemesis', index: g.nemesis.playArea.length - 1 },
      'nemesis_turn')
    return placed
  }

  // Stop a compound effect as soon as any of its steps ends the game. Without
  // this condition, a lethal Gravehold damage step could fall through to the
  // next Nemesis card or continue resolving later effects in the same frame.
  while (!g.gameOver && (resolution.remainingEffects.length > 0 ||
    g.players.some(player => (player.pendingInHandResolutionInstanceIds?.length ?? 0) > 0))) {
    let effect: CardEffect
    const triggerOwner = g.players.find(player => (player.pendingInHandResolutionInstanceIds?.length ?? 0) > 0)
    if (triggerOwner) {
      const instanceId = triggerOwner.pendingInHandResolutionInstanceIds!.shift()!
      effect = { kind: 'resolve_tracked_in_hand_card', playerId: triggerOwner.id, instanceId }
    } else {
      effect = resolution.remainingEffects.shift()!
    }
    if (effect.kind === 'resolve_tracked_in_hand_card') {
      resolution.effectPlayerId = effect.playerId
    }
    const currentPlayerId = effectPlayerId(g, resolution)
    const p = getPlayer(g, currentPlayerId)

    if (effect.kind === 'resolve_tracked_in_hand_card') {
      const hand = getPlayerCardInstanceZone(g, effect.playerId, 'hand')
      const handIndex = hand.instanceIds.indexOf(effect.instanceId)
      if (handIndex < 0) continue
      const cardId = hand.cards[handIndex]!
      if (getCard(cardId).resolveWhenInHand !== true) continue
      const outerContext = captureEffectContext(resolution)
      const removed = moveCardToTemporary(g, hand, handIndex, {
        zoneId: `temporary:in_hand:${effect.playerId}`, zone: 'temporary', ownerId: effect.playerId, index: 0,
      }, 'effect')
      if (!removed) continue
      resolution.resolvingCorruption = {
        playerId: effect.playerId, cardId: removed.cardId, instanceId: removed.instanceId,
      }
      const cardContext: CardEffect = {
        kind: 'restore_effect_context', sourcePlayerId: effect.playerId,
        sourceCardOwnerId: effect.playerId, sourceCardId: cardId, effectPlayerId: effect.playerId,
      }
      const cardEffects = matchingBlocks(cardId, effect.playerId, g, { kind: 'on_play' }, undefined,
        effect.playerId, undefined, effect.playerId).flatMap(block => block.effects)
      addRemainingEffects(resolution, [
        cardContext,
        ...cardEffects,
        { kind: 'destroy_source_corruption' },
        outerContext,
      ])
      messages.push(`${getPlayer(g, effect.playerId).mageType} resolves ${getCard(cardId).name}`)
      continue
    }

    if (effect.kind === 'restore_effect_context') {
      const currentSpellCast = resolution.pendingSpellCast
      resolution.sourcePlayerId = effect.sourcePlayerId
      resolution.sourceCardOwnerId = effect.sourceCardOwnerId
      resolution.sourceCardId = effect.sourceCardId
      resolution.effectPlayerId = effect.effectPlayerId
      resolution.pendingSpellCast = effect.pendingSpellCast ? { ...effect.pendingSpellCast } : undefined
      if (effect.preserveSpellDamageState && currentSpellCast && resolution.pendingSpellCast &&
        currentSpellCast.playerId === resolution.pendingSpellCast.playerId &&
        currentSpellCast.cardId === resolution.pendingSpellCast.cardId &&
        currentSpellCast.breachIndex === resolution.pendingSpellCast.breachIndex &&
        currentSpellCast.spellIndex === resolution.pendingSpellCast.spellIndex &&
        currentSpellCast.instanceId === resolution.pendingSpellCast.instanceId) {
        resolution.pendingSpellCast.damageInstancesResolved = Math.max(
          currentSpellCast.damageInstancesResolved ?? 0,
          resolution.pendingSpellCast.damageInstancesResolved ?? 0,
        )
      }
      ensurePendingSpellCastInstanceId(g, resolution.pendingSpellCast)
      if (!effect.preserveSpellDamageState) {
        resolution.spellDamageBonus = effect.spellDamageBonus
        resolution.spellAdditionalDamageBonus = effect.spellAdditionalDamageBonus
      }
      continue
    }

    if (effect.kind === 'restore_nemesis_card_context') {
      if (g.nemesisResolution) {
        g.nemesisResolution.activeCardInstanceId = effect.activeCardInstanceId
        g.nemesisResolution.activeCardId = effect.activeCardId
        g.nemesisResolution.activeTrigger = effect.activeTrigger
        g.nemesisResolution.activeCardPendingDiscard = effect.activeCardPendingDiscard
      }
      continue
    }

    if (effect.kind === 'gain_corruptions') {
      const targets = getEffectPlayerTargets(g, resolution, currentPlayerId, effect.target ?? 'self')
      if (targets.length === 0) {
        messages.push('No player can gain a Corruption')
        continue
      }
      if (targets.length > 1) {
        const decision = createDecision(g, 'Choose a player to gain Corruption(s)',
          'select_player_target', { targets }, resolution.sourceCardId)
        messages.push(...pauseEffect(g, resolution, effect, decision))
        return messages
      }
      const recipient = getPlayer(g, targets[0]!.playerId)
      const amount = Math.max(0, Math.floor(effect.amount))
      let gained = 0
      let missed = 0
      for (let index = 0; index < amount; index++) {
        const corruptionDeck = getNemesisCardInstanceZone(g, 'corruption_deck')
        const corruptionId = corruptionDeck.cards[0]
        if (!corruptionId) {
          missed++
          continue
        }
        const destination = effect.destination === 'hand'
          ? getPlayerCardInstanceZone(g, recipient.id, 'hand')
          : getPlayerCardInstanceZone(g, recipient.id, 'deck')
        const destinationIndex = effect.destination === 'deck_bottom' ? destination.cards.length
          : effect.destination === 'hand' ? destination.cards.length : 0
        moveCardBetweenZones(g, corruptionDeck, 0, destination, destinationIndex, 'gain', {
          hide: effect.destination !== 'hand',
        })
        gained++
      }
      if (gained) messages.push(`${recipient.mageType} gains ${gained} Corruption(s) to ${effect.destination === 'hand' ? 'their hand' : `the ${effect.destination === 'deck_top' ? 'top' : 'bottom'} of their deck`}`)
      for (let index = 0; index < missed; index++) {
        messages.push(dealDamage(g, { kind: 'gravehold', id: 'gravehold', label: 'Gravehold' }, 2))
      }
      continue
    }

    if (effect.kind === 'gain_corruptions_collectively') {
      const remaining = resolution.remainingCorruptionGains ?? Math.max(0, Math.floor(effect.amount))
      if (remaining <= 0) {
        resolution.remainingCorruptionGains = undefined
        continue
      }
      resolution.remainingCorruptionGains = remaining
      // "The players collectively gain" means the players assign each
      // Corruption among themselves; a player's Breaches are irrelevant.
      const targets = g.players.map(player => ({ kind: 'player' as const, playerId: player.id }))
      if (targets.length === 1) {
        const recipient = getPlayer(g, targets[0]!.playerId)
        const corruptionDeck = getNemesisCardInstanceZone(g, 'corruption_deck')
        const corruptionId = corruptionDeck.cards[0]
        if (!corruptionId) messages.push(dealDamage(g, { kind: 'gravehold', id: 'gravehold', label: 'Gravehold' }, 2))
        else {
          const destination = effect.destination === 'hand'
            ? getPlayerCardInstanceZone(g, recipient.id, 'hand')
            : getPlayerCardInstanceZone(g, recipient.id, 'deck')
          const destinationIndex = effect.destination === 'deck_bottom' ? destination.cards.length
            : effect.destination === 'hand' ? destination.cards.length : 0
          moveCardBetweenZones(g, corruptionDeck, 0, destination, destinationIndex, 'gain', {
            hide: effect.destination !== 'hand',
          })
        }
        resolution.remainingCorruptionGains = remaining - 1
        addRemainingEffects(resolution, [effect])
        continue
      }
      const decision = createDecision(g, `Choose a player to gain a Corruption (${effect.amount - remaining + 1}/${effect.amount})`,
        'select_player_target', { targets }, resolution.sourceCardId)
      messages.push(...pauseEffect(g, resolution, effect, decision))
      return messages
    }

    if (effect.kind === 'gain_corruption_and_shuffle_discard') {
      const targets = getPlayerTargets(g, currentPlayerId, 'any_player')
      if (targets.length > 1) {
        const decision = createDecision(g, 'Choose a player to gain a Corruption and shuffle their discard pile',
          'select_player_target', { targets }, resolution.sourceCardId)
        messages.push(...pauseEffect(g, resolution, effect, decision))
        return messages
      }
      const targetId = targets[0]?.playerId
      if (!targetId) {
        messages.push('No player can gain a Corruption')
        continue
      }
      resolution.effectPlayerId = targetId
      addRemainingEffects(resolution, [
        { kind: 'gain_corruptions', amount: 1, target: 'self', destination: 'deck_top' },
        { kind: 'shuffle_discard_into_deck', target: 'self' },
      ])
      continue
    }

    if (effect.kind === 'resolve_corruptions') {
      const owner = getPlayer(g, currentPlayerId)
      const drawnCounts = new Map<string, number>()
      if (effect.timing === 'end_main') {
        for (const cardId of owner.corruptionsDrawnThisTurn ?? []) {
          drawnCounts.set(cardId, (drawnCounts.get(cardId) ?? 0) + 1)
        }
      }
      const candidates = getCardChoices(g, owner.id, 'hand').filter(choice => {
        if (getCard(choice.cardId).type !== 'corruption') return false
        if (effect.timing === 'turn_start') return true
        const remainingCopies = drawnCounts.get(choice.cardId) ?? 0
        if (remainingCopies <= 0) return false
        drawnCounts.set(choice.cardId, remainingCopies - 1)
        return true
      })
      if (candidates.length === 0) {
        if (effect.timing === 'end_main') owner.corruptionsDrawnThisTurn = []
        continue
      }
      const decision = createDecision(g,
        effect.timing === 'turn_start'
          ? 'Choose a Corruption in hand to resolve before Casting'
          : 'Choose a Corruption drawn this turn to resolve',
        'select_cards', { source: 'hand', candidates, min: 1, max: 1 }, resolution.sourceCardId)
      messages.push(...pauseEffect(g, resolution, effect, decision))
      return messages
    }

    if (effect.kind === 'destroy_source_corruption' || effect.kind === 'return_source_corruption') {
      const resolving = effect.kind === 'destroy_source_corruption' ? resolution.resolvingCorruption : undefined
      const cardId = resolving?.cardId ?? (effect.kind === 'destroy_source_corruption' ? resolution.sourceCardId : effect.cardId)
      if (resolving) {
        const source = {
          zoneId: `temporary:corruption:${resolving.playerId}`,
          zone: 'temporary' as const, ownerId: resolving.playerId, index: 0,
        }
        if (getCard(resolving.cardId).resolveInHandDestination === 'discard') {
          const owner = getPlayer(g, resolving.playerId)
          const discard = getPlayerCardInstanceZone(g, owner.id, 'discard')
          placeTemporaryCardInZone(g, resolving.instanceId, resolving.cardId, source,
            discard, 0, 'discard', true)
          messages.push(`Discarded ${getCard(resolving.cardId).name}`)
        } else if (g.nemesis.type === 'crooked_mask' && g.nemesis.corruptionDeck) {
          const corruption = getNemesisCardInstanceZone(g, 'corruption_deck')
          placeTemporaryCardInZone(g, resolving.instanceId, resolving.cardId, source,
            corruption, corruption.cards.length, 'return', true)
          messages.push(`Returned ${getCard(resolving.cardId).name} to the bottom of the Corruption deck`)
        } else {
          const owner = getPlayer(g, resolving.playerId)
          owner.destroyedCards.push(resolving.cardId)
          owner.destroyedCardInstanceIds ??= []
          owner.destroyedCardInstanceIds.push(resolving.instanceId)
          recordCardDestruction(g, resolving.instanceId, resolving.cardId, source, 'destroy')
        }
        resolution.resolvingCorruption = undefined
      } else if (cardId && getCard(cardId).type === 'corruption' && g.nemesis.corruptionDeck) {
        returnCorruptionToBottom(g, cardId)
        messages.push(`Returned ${getCard(cardId).name} to the bottom of the Corruption deck`)
      }
      continue
    }

    if (effect.kind === 'arm_turn_order_deck_reset') {
      if (resolution.sourceCardId) {
        g.nemesis.turnOrderDeckResetCardId = resolution.sourceCardId
        g.nemesis.turnOrderDeckResetCardInstanceId = g.nemesis.playArea.find(card =>
          card.cardId === resolution.sourceCardId,
        )?.instanceId ?? findCardInstanceId(g, resolution.sourceCardId)
        messages.push(`${getCard(resolution.sourceCardId).name} waits beside the turn order deck`)
      }
      continue
    }

    if (effect.kind === 'resolve_glinting_stinger') {
      const stinger = getSourceMinion(g, resolution.sourceCardId)
      if (!stinger) continue
      const tokens = Math.max(0, stinger.nemesisTokens ?? stinger.powerTokens ?? 0)
      stinger.nemesisTokens = tokens
      delete stinger.powerTokens
      if (tokens < 2) {
        stinger.nemesisTokens = tokens + 1
        messages.push(`Glinting Stinger gains a Nemesis token (${stinger.nemesisTokens}/2)`)
        continue
      }
      const targets = g.players
        .filter(player => getExhaustBreachChoices(g, player.id).length > 0)
        .map(player => ({ kind: 'player' as const, playerId: player.id }))
      const selectedPlayerId = resolution.selectedActionPlayerId
      if (!selectedPlayerId && targets.length > 1) {
        const decision = createDecision(g, 'Choose a player to destroy one of their Breaches', 'select_player_target', { targets }, resolution.sourceCardId)
        messages.push(...pauseEffect(g, resolution, effect, decision))
        return messages
      }
      const targetId = selectedPlayerId ?? targets[0]?.playerId
      if (!targetId) continue
      const breaches = getExhaustBreachChoices(g, targetId)
      if (breaches.length === 0) {
        messages.push('No Breach can be destroyed; Glinting Stinger keeps its two Nemesis tokens')
        resolution.selectedActionPlayerId = undefined
        continue
      }
      if (breaches.length === 1) {
        const destroyed = destroyExhaustedBreach(g, breaches[0]!)
        messages.push(destroyed)
        if (destroyed.includes('no longer available')) {
          resolution.selectedActionPlayerId = undefined
          continue
        }
        stinger.nemesisTokens = tokens - 2
        resolution.selectedActionPlayerId = undefined
        continue
      }
      const decision = createDecision(g, `Choose a ${getPlayer(g, targetId).mageType} Breach to destroy`, 'select_breach', { candidates: breaches }, resolution.sourceCardId)
      messages.push(...pauseEffect(g, resolution, { kind: 'destroy_breach' }, decision))
      return messages
    }

    if (effect.kind === 'destroy_breach') {
      const targetId = resolution.selectedActionPlayerId
      const candidates = targetId ? getExhaustBreachChoices(g, targetId) : []
      if (candidates.length === 0) {
        messages.push('The selected player has no Breach that can be destroyed')
        continue
      }
      if (candidates.length > 1) {
        const decision = createDecision(g, 'Choose a Breach to destroy', 'select_breach', { candidates }, resolution.sourceCardId)
        messages.push(...pauseEffect(g, resolution, effect, decision))
        return messages
      }
      const destroyed = destroyExhaustedBreach(g, candidates[0]!)
      messages.push(destroyed)
      if (destroyed.includes('no longer available')) {
        resolution.selectedActionPlayerId = undefined
        continue
      }
      const stinger = getSourceMinion(g, resolution.sourceCardId)
      if (stinger) stinger.nemesisTokens = Math.max(0, (stinger.nemesisTokens ?? 0) - 2)
      resolution.selectedActionPlayerId = undefined
      continue
    }

    if (effect.kind === 'place_card_on_top_of_own_deck') {
      const candidates = getCardChoices(g, currentPlayerId, 'hand')
      if (candidates.length === 0) {
        messages.push(`${p.mageType} has no card in hand to place on their deck`)
        continue
      }
      const decision = createDecision(g, 'Choose a card in hand to place on top of your deck', 'select_cards',
        { source: 'hand', candidates, min: 1, max: 1 }, resolution.sourceCardId)
      messages.push(...pauseEffect(g, resolution, effect, decision))
      return messages
    }

    if (effect.kind === 'place_hand_card_on_ally_deck') {
      let actorId = resolution.selectedActionPlayerId
      if (!actorId) {
        const targets = getPlayerTargets(g, currentPlayerId, 'any_player')
        if (targets.length > 1) {
          const decision = createDecision(g, 'Choose a player to place a card on an ally’s deck', 'select_player_target', { targets }, resolution.sourceCardId)
          messages.push(...pauseEffect(g, resolution, effect, decision))
          return messages
        }
        actorId = targets[0]?.playerId
      }
      if (!actorId) continue
      const allies = getPlayerTargets(g, actorId, 'ally')
      if (allies.length === 0) {
        messages.push(`${getPlayer(g, actorId).mageType} has no ally`)
        resolution.selectedActionPlayerId = undefined
        continue
      }
      if (!resolution.placementRecipientPlayerId && allies.length > 1) {
        const decision = createDecision(g, `Choose an ally of ${getPlayer(g, actorId).mageType} to receive a card on top of their deck`, 'select_player_target', { targets: allies }, resolution.sourceCardId)
        messages.push(...pauseEffect(g, resolution, effect, decision))
        return messages
      }
      if (!resolution.placementRecipientPlayerId && allies.length === 1) {
        resolution.placementRecipientPlayerId = allies[0]!.playerId
      }
      resolution.effectPlayerId = actorId
      const candidates = getCardChoices(g, actorId, 'hand')
      if (candidates.length === 0) {
        messages.push(`${getPlayer(g, actorId).mageType} has no card in hand to place`)
        resolution.selectedActionPlayerId = undefined
        resolution.placementRecipientPlayerId = undefined
        continue
      }
      const decision = createDecision(g, 'Choose a card in hand to place on top of an ally’s deck', 'select_cards',
        { source: 'hand', candidates, min: 1, max: 1, ownerId: actorId }, resolution.sourceCardId)
      messages.push(...pauseEffect(g, resolution, effect, decision))
      return messages
    }

    if (effect.kind === 'tempt_highest_crystals') {
      let targetId = resolution.selectedActionPlayerId
      if (!targetId) {
        const targets = getSelectedPlayerTargets(g, currentPlayerId, 'any_player', 'most_crystals')
        if (targets.length > 1) {
          const decision = createDecision(g, 'Choose a player with the most Crystals in hand', 'select_player_target', { targets }, resolution.sourceCardId)
          messages.push(...pauseEffect(g, resolution, effect, decision))
          return messages
        }
        targetId = targets[0]?.playerId
      }
      if (!targetId) continue
      const target = getPlayer(g, targetId)
      const crystalIndices = target.hand.flatMap((cardId, index) => {
        const card = getCard(cardId)
        return card.type === 'gem' && card.name.trim().toLowerCase() === 'crystal' ? [index] : []
      })
      const handZone = getPlayerCardInstanceZone(g, target.id, 'hand')
      const discardZone = getPlayerCardInstanceZone(g, target.id, 'discard')
      for (const index of crystalIndices.sort((a, b) => b - a)) {
        moveCardBetweenZones(g, handZone, index, discardZone, 0, 'discard')
      }
      resolution.effectPlayerId = target.id
      resolution.selectedActionPlayerId = undefined
      messages.push(`${target.mageType} discards ${crystalIndices.length} Crystal(s)`)
      addRemainingEffects(resolution, [
        { kind: 'deal_player_damage', amount: 3, target: 'self' },
        { kind: 'gain_card_from_market', maxCost: 4 },
      ])
      continue
    }

    if (effect.kind === 'discard_nemesis_top_cards') {
      let tierThree = 0
      const discarded: string[] = []
      const deck = getNemesisCardInstanceZone(g, 'nemesis_deck')
      const discard = getNemesisCardInstanceZone(g, 'nemesis_discard')
      for (let index = 0; index < Math.max(0, effect.amount); index++) {
        const moved = moveCardBetweenZones(g, deck, 0, discard, 0, 'effect')
        const cardId = moved?.cardId
        if (!cardId || !moved) break
        discarded.push(cardId)
        if ((getCard(cardId) as NemesisCardDef).tier === 3) tierThree++
      }
      messages.push(discarded.length ? `Discarded ${discarded.map(id => getCard(id).name).join(', ')} from the Nemesis deck` : 'The Nemesis deck has no cards to discard')
      if (tierThree > 0) messages.push(dealDamage(g, { kind: 'gravehold', id: 'gravehold', label: 'Gravehold' }, tierThree * effect.graveholdDamagePerTierThree))
      continue
    }

    if (effect.kind === 'afflict_two_players_with_corruptions') {
      for (const recipient of g.players.slice(0, 2)) {
        const requested = Math.max(0, effect.corruptionAmount)
        let gained = 0
        for (let index = 0; index < requested; index++) {
          const corruptionDeck = getNemesisCardInstanceZone(g, 'corruption_deck')
          const corruptionId = corruptionDeck.cards[0]
          if (!corruptionId) {
            messages.push(dealDamage(g, { kind: 'gravehold', id: 'gravehold', label: 'Gravehold' }, 2))
            continue
          }
          const deck = getPlayerCardInstanceZone(g, recipient.id, 'deck')
          moveCardBetweenZones(g, corruptionDeck, 0, deck, 0, 'gain', { hide: true })
          gained++
        }
        if (gained) messages.push(`${recipient.mageType} gains ${gained} Corruption(s) on top of their deck`)
        messages.push(gainLife(g, { kind: 'player', playerId: recipient.id }, 1) ?? `${recipient.mageType} gains no life`)
      }
      continue
    }

    if (effect.kind === 'discard_noncorruptions_and_gain_corruptions') {
      let targetId = resolution.selectedActionPlayerId
      if (!targetId) {
        let targets = getPlayerTargets(g, currentPlayerId, 'any_player')
        if (effect.targetAvailability === 'full_or_max') {
          targets = retainFullyResolvableOrMaximumTargets(targets, effect.discardAmount, target =>
            getCardChoices(g, target.playerId, 'hand').filter(choice => getCard(choice.cardId).type !== 'corruption').length)
        }
        if (targets.length > 1) {
          const decision = createDecision(g, 'Choose a player to discard non-Corruption cards', 'select_player_target', { targets }, resolution.sourceCardId)
          messages.push(...pauseEffect(g, resolution, effect, decision))
          return messages
        }
        targetId = targets[0]?.playerId
      }
      if (!targetId) continue
      resolution.effectPlayerId = targetId
      const target = getPlayer(g, targetId)
      const candidates = getCardChoices(g, targetId, 'hand').filter(choice => getCard(choice.cardId).type !== 'corruption')
      const amount = Math.min(Math.max(0, effect.discardAmount), candidates.length)
      if (amount > 0 && candidates.length > amount) {
        const decision = createDecision(g, `${target.mageType}: discard ${amount} non-Corruption card(s)`, 'select_cards',
          { source: 'hand', candidates, min: amount, max: amount, ownerId: targetId }, resolution.sourceCardId)
        messages.push(...pauseEffect(g, resolution, effect, decision))
        return messages
      }
      const discarded = discardSelectedCards(g, targetId, candidates.slice(0, amount))
      if (discarded.length) messages.push(`${target.mageType} discards ${discarded.map(id => getCard(id).name).join(', ')}`)
      resolution.selectedActionPlayerId = undefined
      addRemainingEffects(resolution, [{ kind: 'gain_corruptions', amount: effect.corruptionAmount, target: 'self', destination: effect.destination }])
      continue
    }

    if (effect.kind === 'discard_noncorruption_cards') {
      const candidates = getCardChoices(g, currentPlayerId, 'hand').filter(choice => getCard(choice.cardId).type !== 'corruption')
      const amount = Math.min(Math.max(0, effect.amount), candidates.length)
      if (amount === 0) {
        messages.push('No non-Corruption cards are available to discard')
        continue
      }
      if (candidates.length > amount) {
        const decision = createDecision(g, `Discard ${amount} non-Corruption card(s)`, 'select_cards',
          { source: 'hand', candidates, min: amount, max: amount }, resolution.sourceCardId)
        messages.push(...pauseEffect(g, resolution, effect, decision))
        return messages
      }
      messages.push(`Discarded ${discardSelectedCards(g, currentPlayerId, candidates).map(id => getCard(id).name).join(', ')}`)
      continue
    }

    if (effect.kind === 'deal_player_damage_by_last_selected_cost') {
      const cost = resolution.lastSelectedCardCost ?? 0
      const amount = effect.reduceByCost
        ? Math.max(0, (effect.baseAmount ?? 0) - cost)
        : (effect.roundUp === false ? Math.floor(cost / effect.divisor) : Math.ceil(cost / Math.max(1, effect.divisor)))
      resolution.lastSelectedCardCost = undefined
      addRemainingEffects(resolution, [{ kind: 'deal_player_damage', amount, target: effect.target }])
      continue
    }

    if (effect.kind === 'gain_least_expensive_card') {
      addRemainingEffects(resolution, [
        { kind: 'gain_card_from_market', cardType: effect.cardType, leastExpensive: true, destination: effect.destination === 'hand' ? 'discard_top' : 'deck_top' },
        ...(effect.destination === 'hand' ? [{ kind: 'move_gained_card' as const, destination: 'hand' as const }] : []),
      ])
      continue
    }

    if (effect.kind === 'return_nemesis_turn_order_card') {
      const index = g.turnOrderDiscard.findIndex(cardId => cardId === 'nemesis')
      if (index < 0) messages.push('No Nemesis turn order card is in the discard pile')
      else {
        g.turnOrderDeck.unshift(g.turnOrderDiscard.splice(index, 1)[0]!)
        messages.push('Placed a Nemesis turn order card on top of the deck')
      }
      continue
    }

    if (effect.kind === 'devouring_wave_discard_and_gain') {
      const candidates = getCollectiveCardChoices(g, 'hand').filter(item => getCard(item.choice.cardId).cost >= 2)
      const amount = Math.min(2, candidates.length)
      if (amount === 0) {
        messages.push('No card costing 2 Aether or more is available to discard')
        continue
      }
      if (candidates.length > amount) {
        const decision = createDecision(g, `Choose ${amount} card(s) costing 2 Aether or more to discard`,
          'select_collective_cards', { candidates, min: amount, max: amount }, resolution.sourceCardId)
        messages.push(...pauseEffect(g, resolution, effect, decision))
        return messages
      }
      const removed = discardCollectiveCards(g, candidates)
      const trinketDeck = getNemesisCardInstanceZone(g, 'trinket_deck')
      for (let index = 0; index < removed.length; index++) {
        const selected = candidates[index]
        const cardId = trinketDeck.cards[0]
        const instanceId = trinketDeck.instanceIds[0]
        if (selected && cardId) {
          const recipient = getPlayer(g, selected.playerId)
          const hand = getPlayerCardInstanceZone(g, recipient.id, 'hand')
          const moved = moveCardBetweenZones(g, trinketDeck, 0, hand, hand.cards.length, 'gain')
          if (moved) rememberOwnedTrinketInstance(recipient, instanceId ?? moved.instanceId)
        }
      }
      messages.push(`Discarded ${removed.map(id => getCard(id).name).join(', ')}; each player gains a Trinket into hand`)
      continue
    }

    if (effect.kind === 'return_three_minions_from_nemesis_discard') {
      const nemesisDiscard = getNemesisCardInstanceZone(g, 'nemesis_discard')
      const selected = g.nemesis.discard.flatMap((cardId, index) => getCard(cardId).type === 'minion' ? [{ cardId, index }] : []).slice(0, 3)
      if (selected.length === 0) {
        messages.push('No Minions are in the Nemesis discard pile')
        continue
      }
      const removedByIndex = new Map<number, { cardId: string; instanceId: string; revealed: boolean }>()
      for (const item of [...selected].sort((left, right) => right.index - left.index)) {
        const removed = removeCardInstanceAt(g, nemesisDiscard.cards, nemesisDiscard.instanceIds, item.index)
        if (removed) removedByIndex.set(item.index, removed)
      }
      for (const item of selected) {
        const removed = removedByIndex.get(item.index)
        if (!removed) continue
        const definition = getCard(item.cardId) as NemesisCardDef
        const placedAt = (g.nemesis.cardInstanceCounter ?? 0) + 1
        g.nemesis.cardInstanceCounter = placedAt
        createCardInstance(g, item.cardId, true, removed.instanceId)
        g.nemesis.playArea.push({
          cardId: item.cardId, cardType: 'minion', placedAt, instanceId: removed.instanceId,
          enteredOnNemesisTurn: g.nemesis.nemesisTurnNumber, lifeTokens: definition.life ?? 0,
          ...(definition.displayRow ? { displayRow: definition.displayRow } : {}),
          ...(definition.nemesisTokens != null ? { nemesisTokens: definition.nemesisTokens } : {}),
        })
        recordCardMove(g, removed.instanceId, item.cardId,
          { zoneId: nemesisDiscard.zoneId, zone: 'nemesis_discard', ownerId: 'nemesis', index: item.index },
          { zoneId: 'nemesis:play_area', zone: 'nemesis_play_area', ownerId: 'nemesis', index: g.nemesis.playArea.length - 1 },
          'return')
      }
      messages.push(`Returned ${selected.map(item => getCard(item.cardId).name).join(', ')} to play without resolving Persistent`)
      continue
    }

    if (effect.kind === 'shuffle_hand_into_deck_and_draw') {
      let targetId = resolution.selectedActionPlayerId
      if (!targetId) {
        const targets = getPlayerTargets(g, currentPlayerId, 'any_player')
        if (targets.length > 1) {
          const decision = createDecision(g, 'Choose a player to shuffle their hand into their deck', 'select_player_target', { targets }, resolution.sourceCardId)
          messages.push(...pauseEffect(g, resolution, effect, decision))
          return messages
        }
        targetId = targets[0]?.playerId
      }
      if (!targetId) continue
      const target = getPlayer(g, targetId)
      shufflePlayerHandIntoDeck(g, target)
      resolution.effectPlayerId = target.id
      resolution.selectedActionPlayerId = undefined
      messages.push(`${target.mageType} shuffles their hand into their deck`)
      if (effect.amount > 0) {
        addRemainingEffects(resolution, [{
          kind: 'draw_cards_for_player', playerId: target.id, remaining: effect.amount, drawn: 0,
        }])
      } else {
        messages.push(`${target.mageType} draws 0 card(s)`)
      }
      continue
    }

    if (effect.kind === 'obliterate_most_open_breach_player') {
      let targetId = resolution.selectedActionPlayerId
      if (!targetId) {
        const targets = getSelectedPlayerTargets(g, currentPlayerId, 'any_player', 'most_opened_breaches')
        if (targets.length > 1) {
          const decision = createDecision(g, 'Choose a player with the most opened Breaches', 'select_player_target', { targets }, resolution.sourceCardId)
          messages.push(...pauseEffect(g, resolution, effect, decision))
          return messages
        }
        targetId = targets[0]?.playerId
      }
      if (!targetId) continue
      resolution.effectPlayerId = targetId
      resolution.selectedActionPlayerId = undefined
      addRemainingEffects(resolution, [{
        kind: 'choose_one', prompt: `${getPlayer(g, targetId).mageType}: destroy four cards in hand or suffer 4 damage`,
        options: [
          { id: 'destroy', label: 'Destroy four cards in hand', condition: { kind: 'zone_card_count', zone: 'hand', comparison: 'at_least', count: 4 }, effects: [{ kind: 'destroy_cards', source: 'hand', minAmount: 4, maxAmount: 4 }] },
          { id: 'damage', label: 'Suffer 4 damage', effects: [{ kind: 'deal_player_damage', amount: 4, target: 'self' }] },
        ],
      }])
      continue
    }

    if (effect.kind === 'resolve_bottom_nemesis_attack_twice') {
      let sourceIndex = -1
      for (let index = g.nemesis.discard.length - 1; index >= 0; index--) {
        if (getCard(g.nemesis.discard[index]!).type === 'attack') {
          sourceIndex = index
          break
        }
      }
      const attackId = sourceIndex < 0 ? undefined : g.nemesis.discard[sourceIndex]
      const attack = attackId ? getCard(attackId) as NemesisCardDef : undefined
      const effects = attack?.nemesisEffects?.filter(block => block.trigger === 'immediately').flatMap(block => block.effects) ?? []
      if (!attackId || effects.length === 0) {
        messages.push('No Attack with an effect is in the Nemesis discard pile')
        continue
      }
      const restore = captureEffectContext(resolution)
      addRemainingEffects(resolution, [
        { kind: 'restore_effect_context', sourceCardId: attackId },
        ...effects, ...effects,
        restore,
      ])
      messages.push(`Resolving ${attack!.name} twice`)
      continue
    }

    if (effect.kind === 'look_at_top_card_may_destroy') {
      preparePlayerDeckForRevealWithInstances(g, p, 1)
      if (p.deck.length === 0) {
        messages.push(`${p.mageType} has no card to reveal`)
        continue
      }
      const cardId = p.deck[0]!
      const choice = { zone: 'deck' as const, index: 0, cardId, cardName: getCard(cardId).name }
      const decision = createDecision(g, `Look at ${getCard(cardId).name} on top of your deck. You may destroy it.`,
        'select_cards', {
          source: 'deck', candidates: [choice], min: 0, max: 1, layout: 'simple', targetHighlight: 'choice',
        }, resolution.sourceCardId)
      messages.push(...pauseEffect(g, resolution, effect, decision))
      return messages
    }

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

    if (effect.kind === 'await_card_motions') {
      const decision = createDecision(
        g, 'Waiting for card movement', 'await_card_motions', {}, resolution.sourceCardId,
      )
      const error = setPendingDecision(g, decision)
      if (error) {
        messages.push(error)
        continue
      }
      resolution.awaiting = effect
      g.pendingEffect = resolution
      return messages
    }

    if (effect.kind === 'confirm_player_card_effect') {
      const decision = createDecision(g,
        effect.prompt,
        'confirm_player_card_effect',
        { cardId: effect.cardId, playerId: effect.playerId, cardIndex: effect.cardIndex },
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

    if (effect.kind === 'flip_mage_form') {
      const targetId = effect.target === 'active'
        ? currentPlayerId
        : resolution.sourcePlayerId ?? currentPlayerId
      const target = getPlayer(g, targetId)
      target.mageFormSide = target.mageFormSide === 'giver' ? 'taker' : 'giver'
      messages.push(`${target.mageType}'s Form changes to ${target.mageFormSide === 'giver' ? 'Giver' : 'Taker'}`)
      continue
    }

    if (effect.kind === 'resolve_mage_form_supply_gain') {
      if (!effect.formOwnerId || !effect.gainingPlayerId || !effect.gainedCardId || !effect.formCardId) {
        messages.push('The Mage Form supply effect is missing its gain context')
        continue
      }
      const formOwner = getPlayer(g, effect.formOwnerId)
      const formOwnerName = getCard(effect.formCardId).name.replace(/'s Form Card$/i, '')
      const cardPreview = {
        cardId: effect.formCardId,
        mageType: formOwner.mageType,
        formSide: effect.formSide,
      }
      if (effect.step === 'offer') {
        const prompt = effect.formSide === 'giver'
          ? 'Use Giver Form to place the gained card on an ally’s deck?'
          : `Use Taker Form to place the gained card on ${formOwnerName}’s deck?`
        const decision = createDecision(g, prompt, 'choose_optional', {
          accept: { id: 'accept', label: 'Yes' },
          skip: { id: 'skip', label: 'No' },
          cardPreview,
        }, effect.formCardId)
        messages.push(...pauseEffect(g, resolution, effect, decision))
        return messages
      }
      if (effect.step === 'choose_ally') {
        const targets = getPlayerTargets(g, effect.formOwnerId, 'ally')
        if (targets.length === 0) {
          messages.push('No ally can receive the gained card')
          continue
        }
        if (targets.length === 1) {
          messages.push(...moveGainedSupplyCardToDeck(g, effect, targets[0]!.playerId))
          continue
        }
        const decision = createDecision(g,
          'Choose an ally whose deck will receive the gained card',
          'select_player_target', { targets, cardPreview }, effect.formCardId,
        )
        messages.push(...pauseEffect(g, resolution, effect, decision))
        return messages
      }
      const recipientId = effect.formSide === 'giver' ? '' : effect.formOwnerId
      if (effect.formSide === 'taker' && recipientId) {
        messages.push(...moveGainedSupplyCardToDeck(g, effect, recipientId))
      }
      continue
    }

    if (effect.kind === 'reveal_firethorns') {
      if (!resolution.firethornPlayerIds) {
        const required = Math.min(g.players.length, Math.max(1, effect.playerCount ?? g.players.length))
        resolution.firethornPlayerIds = g.players.length <= required
          ? g.players.map(player => player.id)
          : []
      }
      const required = Math.min(g.players.length, Math.max(1, effect.playerCount ?? g.players.length))
      if (resolution.firethornPlayerIds.length < required) {
        const selected = new Set(resolution.firethornPlayerIds)
        const candidates = getPlayerTargets(g, currentPlayerId, 'any_player')
          .filter(target => !selected.has(target.playerId))
        const remaining = required - resolution.firethornPlayerIds.length
        if (candidates.length <= remaining) {
          resolution.firethornPlayerIds.push(...candidates.map(target => target.playerId))
          addRemainingEffects(resolution, [effect])
          continue
        }
        const decision = createDecision(g, 'Choose a player to reveal Firethorns', 'select_player_target',
          { targets: candidates }, resolution.sourceCardId,
        )
        messages.push(...pauseEffect(g, resolution, effect, decision))
        return messages
      }
      const targetId = resolution.firethornPlayerIds[resolution.firethornPlayerIndex ?? 0]
      if (!targetId) {
        resolution.firethornPlayerIds = undefined
        resolution.firethornPlayerIndex = undefined
        resolution.firethornCurrentPlayerId = undefined
        continue
      }
      const target = getPlayer(g, targetId)
      const revealedCards = getCardChoices(g, target.id, 'deck_or_discard')
      const eligibleCount = revealedCards.filter(choice => getCard(choice.cardId).name.includes('Firethorn')).length
      const candidates = revealedCards.map(choice => {
        const eligible = getCard(choice.cardId).name.includes('Firethorn')
        return {
          ...choice,
          disabled: !eligible,
          disabledReason: eligible ? undefined : 'Only Firethorns can be selected.',
        }
      })
      resolution.firethornCurrentPlayerId = target.id
      const decision = createDecision(g,
        eligibleCount > 0
          ? `${target.mageType}: choose up to two Firethorns from your deck or discard pile to put into your hand`
          : `${target.mageType}: no Firethorns are available in your deck or discard pile`,
        'select_cards', {
          source: 'deck_or_discard', candidates, min: 0, max: Math.min(2, eligibleCount),
          ownerId: target.id,
        }, resolution.sourceCardId,
      )
      messages.push(...pauseEffect(g, resolution, effect, decision))
      return messages
    }

    if (effect.kind === 'gain_trinkets') {
      const targets = getEffectPlayerTargets(g, resolution, currentPlayerId, effect.target ?? 'self')
      if (targets.length === 0) {
        messages.push('No eligible player can gain Trinkets')
        continue
      }
      if (targets.length > 1) {
        const decision = createDecision(g, 'Choose a player to gain Trinkets',
          'select_player_target', { targets }, resolution.sourceCardId)
        messages.push(...pauseEffect(g, resolution, effect, decision))
        return messages
      }
      const recipient = getPlayer(g, targets[0]!.playerId)
      resolution.effectPlayerId = recipient.id
      const trinketDeck = getNemesisCardInstanceZone(g, 'trinket_deck')
      const amount = Math.max(0, Math.floor(effect.amount))
      const gainedCards: string[] = []
      for (let index = 0; index < amount; index++) {
        const cardId = trinketDeck.cards[0]
        if (!cardId) break
        const instanceId = trinketDeck.instanceIds[0]
        const targetZone = effect.destination === 'deck_top'
          ? getPlayerCardInstanceZone(g, recipient.id, 'deck')
          : getPlayerCardInstanceZone(g, recipient.id, 'discard')
        const moved = moveCardBetweenZones(g, trinketDeck, 0, targetZone, 0, 'gain')
        if (!moved) break
        rememberOwnedTrinketInstance(recipient, instanceId ?? moved.instanceId)
        gainedCards.push(cardId)
      }
      const destination = effect.destination === 'deck_top' ? 'deck' : 'discard pile'
      if (gainedCards.length > 0) {
        messages.push(`${recipient.mageType} gains ${gainedCards.length} of ${amount} Trinket${amount === 1 ? '' : 's'} to their ${destination}`)
      }
      if (gainedCards.length < amount) messages.push('The Trinket deck is empty')
      if (effect.putOneInHand && gainedCards.length > 0) {
        const source: 'discard' | 'deck' = effect.destination === 'deck_top' ? 'deck' : 'discard'
        const choices = [...new Set(gainedCards)]
        if (choices.length === 1) {
          const sourceZone = getPlayerCardInstanceZone(g, recipient.id, source)
          const index = sourceZone.cards.indexOf(choices[0]!)
          const handZone = getPlayerCardInstanceZone(g, recipient.id, 'hand')
          if (index >= 0) moveCardBetweenZones(g, sourceZone, index, handZone, handZone.cards.length, 'gain')
        } else {
          const chooseTrinket: CardEffect = {
            kind: 'choose_one',
            prompt: 'Choose a gained Trinket to put into your hand',
            options: choices.map(cardId => ({
              id: cardId,
              label: `Put ${getCard(cardId).name} into your hand`,
              cardId,
              effects: [{ kind: 'move_gained_trinket_to_hand', cardId, source }],
            })),
            layout: 'large-card-choice',
          }
          const decision = createDecision(g, chooseTrinket.prompt, 'choose_one', {
            options: chooseTrinket.options.map(option => ({
              id: option.id,
              label: option.label,
              cardId: option.cardId,
            })),
            layout: chooseTrinket.layout,
          }, resolution.sourceCardId)
          messages.push(...pauseEffect(g, resolution, chooseTrinket, decision))
          return messages
        }
      }
      continue
    }

    if (effect.kind === 'move_gained_trinket_to_hand') {
      const owner = getPlayer(g, currentPlayerId)
      const source = effect.source === 'deck' ? owner.deck : owner.discard
      const index = source.indexOf(effect.cardId)
      if (index < 0) {
        messages.push('The selected Trinket is no longer in its destination pile')
        continue
      }
      const sourceZone = getPlayerCardInstanceZone(g, owner.id, effect.source)
      const hand = getPlayerCardInstanceZone(g, owner.id, 'hand')
      moveCardBetweenZones(g, sourceZone, index, hand, hand.cards.length, 'gain')
      messages.push(`${getCard(effect.cardId).name} is put into ${owner.mageType}'s hand`)
      continue
    }

    if (effect.kind === 'gain_specific_deck_top') {
      const targets = getEffectPlayerTargets(g, resolution, currentPlayerId, effect.target ?? 'self')
      if (targets.length === 0) {
        messages.push('No eligible player can receive the Mage-specific card')
        continue
      }
      if (targets.length > 1) {
        const decision = createDecision(g, 'Choose a player to receive the Firethorn',
          'select_player_target', { targets }, resolution.sourceCardId)
        messages.push(...pauseEffect(g, resolution, effect, decision))
        return messages
      }
      const deckOwner = getPlayer(g,
        resolution.sourceCardOwnerId ?? resolution.sourcePlayerId ?? currentPlayerId)
      const specificDeck = getPlayerCardInstanceZone(g, deckOwner.id, 'specific_deck')
      const cardId = specificDeck.cards[0]
      if (!cardId) {
        messages.push(`${MAGES[deckOwner.mageType]?.specificDeckName ?? 'Mage-specific deck'} is empty`)
        continue
      }
      forgetSpecificDeckCard(deckOwner, cardId)
      const receiver = getPlayer(g, targets[0]!.playerId)
      const targetZone = effect.destination === 'deck_top'
        ? getPlayerCardInstanceZone(g, receiver.id, 'deck')
        : getPlayerCardInstanceZone(g, receiver.id, 'discard')
      moveCardBetweenZones(g, specificDeck, 0, targetZone, 0, 'gain')
      messages.push(`${receiver.mageType} gains ${getCard(cardId).name} to their ${effect.destination === 'deck_top' ? 'deck' : 'discard pile'}`)
      continue
    }

    if (effect.kind === 'gain_firethorn_top_for_five') {
      if (p.mageType !== 'inco') {
        messages.push('Only Inco can gain a Firethorn from this deck')
        continue
      }
      const cardId = p.specificDeck?.[0]
      if (!cardId) {
        messages.push('The Firethorn deck is empty')
        continue
      }
      const card = getCard(cardId)
      const spendType: SpendType = card.type === 'gem' || card.type === 'spell' || card.type === 'relic'
        ? card.type
        : 'gain'
      const available = getSpendableAether(p, spendType)
      if (available < 5) {
        messages.push(`Need 5 Aether, have ${available}`)
        continue
      }
      spendAether(p, 5, spendType)
      const specificDeck = getPlayerCardInstanceZone(g, p.id, 'specific_deck')
      const discard = getPlayerCardInstanceZone(g, p.id, 'discard')
      moveCardBetweenZones(g, specificDeck, 0, discard, 0, 'gain')
      forgetSpecificDeckCard(p, cardId)
      messages.push(`Gained ${getCard(cardId).name} from the Firethorn deck for 5 Aether`)
      continue
    }

    if (effect.kind === 'move_specific_deck_top_to_bottom') {
      const deckOwner = getPlayer(g,
        resolution.sourceCardOwnerId ?? resolution.sourcePlayerId ?? currentPlayerId)
      const cardId = deckOwner.specificDeck?.[0]
      if (!cardId) {
        messages.push("Tressa's Vault is empty")
        continue
      }
      rememberSpecificDeckCard(g, deckOwner, cardId, 0)
      const specificDeck = getPlayerCardInstanceZone(g, deckOwner.id, 'specific_deck')
      moveCardBetweenZones(g, specificDeck, 0, specificDeck, specificDeck.cards.length, 'reorder')
      rememberSpecificDeckTop(g, deckOwner)
      messages.push(`Put ${getCard(cardId).name} on the bottom of Tressa's Vault`)
      continue
    }

    if (effect.kind === 'cycle_specific_deck_with_in_play_treasure') {
      const owner = getPlayer(g,
        resolution.sourceCardOwnerId ?? resolution.sourcePlayerId ?? currentPlayerId)
      resolution.effectPlayerId = owner.id
      const candidates = (owner.playerCardsInPlay ?? []).flatMap((cardId, index) => {
        const card = getCard(cardId)
        return card.type === 'treasure' && card.treasureLevel === 3
          ? [{ zone: 'player_cards_in_play' as const, index, cardId, cardName: card.name }]
          : []
      })
      if (!owner.specificDeck?.[0] || candidates.length === 0) {
        messages.push("No level-3 Treasure and Vault card are available to exchange")
        continue
      }
      if (candidates.length > 1) {
        const decision = createDecision(g, 'Choose a level-3 Treasure to put on the bottom of Tressa\'s Vault',
          'select_cards', { source: 'player_cards_in_play', candidates, min: 1, max: 1 }, resolution.sourceCardId)
        messages.push(...pauseEffect(g, resolution, effect, decision))
        return messages
      }
      const chosen = candidates[0]!
      const incomingTop = owner.specificDeck![0]!
      rememberSpecificDeckCard(g, owner, incomingTop, 0)
      rememberSpecificDeckTop(g, owner)
      const specificDeck = getPlayerCardInstanceZone(g, owner.id, 'specific_deck')
      const inPlay = getPlayerCardInstanceZone(g, owner.id, 'player_cards_in_play')
      const returnedInstanceId = inPlay.instanceIds[chosen.index]
      const incoming = moveCardBetweenZones(g, specificDeck, 0, inPlay, inPlay.cards.length, 'effect')
      if (!incoming || !returnedInstanceId) {
        messages.push('The level-3 Treasure or Vault card is no longer available')
        continue
      }
      const returnedIndex = inPlay.instanceIds.indexOf(returnedInstanceId)
      moveCardBetweenZones(g, inPlay, returnedIndex, specificDeck, specificDeck.cards.length, 'effect')
      rememberSpecificDeckCard(g, owner, chosen.cardId, specificDeck.cards.length - 1)
      rememberSpecificDeckTop(g, owner)
      addRemainingEffects(resolution, putPlayerCardIntoPlay(
        g, owner.id, incoming.cardId, resolution.sourcePlayerId ?? currentPlayerId,
        captureEffectContext(resolution), incoming.instanceId,
      ))
      messages.push(`Exchanged ${chosen.cardName} for ${getCard(incoming.cardId).name} from Tressa's Vault`)
      continue
    }

    if (effect.kind === 'reset_open_breach') {
      const candidates: BreachChoice[] = getEffectPlayerTargets(g, resolution, currentPlayerId, effect.target)
        .flatMap(target => getPlayer(g, target.playerId).breaches
          .filter(breach => isPresentBreach(breach) && breach.opened && effect.breachIndices.includes(breach.index))
          .map(breach => ({
            playerId: target.playerId, breachIndex: breach.index,
            playerName: getPlayer(g, target.playerId).mageType,
            focusCost: breach.focusCost, focusCount: breach.focusCount, focusToOpen: breach.focusToOpen,
          })))
      if (candidates.length === 0) {
        messages.push('No opened III or IV ally breach is available to reset')
        continue
      }
      if (candidates.length > 1) {
        const decision = createDecision(g, 'Choose an opened ally Breach to reset',
          'select_breach', { candidates }, resolution.sourceCardId)
        messages.push(...pauseEffect(g, resolution, effect, decision))
        return messages
      }
      const choice = candidates[0]!
      const breach = getPlayer(g, choice.playerId).breaches.find(item => item.index === choice.breachIndex)!
      resetBreachToStartingPosition(breach)
      resolution.effectPlayerId = choice.playerId
      messages.push(`Reset ${choice.playerName}'s Breach ${toRoman(choice.breachIndex)} to its starting position`)
      continue
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
      addRemainingEffects(resolution,
        conditionMatches(g, currentPlayerId, effect.condition, resolution)
          ? effect.effects
          : effect.elseEffects ?? [],
      )
      continue
    }

    if (effect.kind === 'focus_breach') {
      let candidates = getBreachChoices(g, effect.target,
        effectTargetPlayerId(resolution, currentPlayerId, effect.target))
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
        addRemainingEffects(resolution, collectBreachOpenedEffects(
          g, resolution.sourcePlayerId ?? currentPlayerId, captureEffectContext(resolution),
        ))
      }
      continue
    }

    if (effect.kind === 'focus_breach_all_players') {
      const playerIds = resolution.focusAllPlayerIds ?? g.players
        .filter(player => effect.target !== 'allies' || player.id !== (resolution.sourcePlayerId ?? currentPlayerId))
        .filter(player => conditionMatches(g, player.id, effect.condition, resolution))
        .map(player => player.id)
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
        if (!wasOpened && target?.opened) addRemainingEffects(resolution, collectBreachOpenedEffects(
          g, resolution.sourcePlayerId ?? currentPlayerId, captureEffectContext(resolution),
        ))
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
      preparePlayerDeckForRevealWithInstances(g, revealedPlayer, 1)
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
      const targetContextPlayerId = effectTargetPlayerId(
        resolution, currentPlayerId, effect.target ?? 'self', effect.relativeToSource === true,
      )
      const targets = getEffectPlayerTargets(g, resolution, targetContextPlayerId,
        effect.target ?? 'self', undefined, effect.relativeToSource === true)
      if (targets.length === 0) {
        messages.push('No eligible player can Conjure')
        continue
      }

      let conjurerId = resolution.conjureTargetPlayerId
      if (conjurerId) {
        if (!targets.some(target => target.playerId === conjurerId)) {
          resolution.conjureTargetPlayerId = undefined
          messages.push('The selected Conjure recipient is no longer eligible')
          continue
        }
      } else if (targets.length > 1) {
        const prompt = effect.target === 'ally' ? 'Choose an ally to Conjure' : 'Choose a player to Conjure'
        const decision = createDecision(g, prompt, 'select_player_target', { targets }, resolution.sourceCardId)
        messages.push(...pauseEffect(g, resolution, effect, decision))
        return messages
      } else {
        conjurerId = targets[0]!.playerId
      }

      resolution.conjureTargetPlayerId = undefined
      const owner = getPlayer(g, conjurerId!)
      preparePlayerDeckForRevealWithInstances(g, owner, 1)
      const deck = getPlayerCardInstanceZone(g, owner.id, 'deck')
      const removed = removeCardInstanceAt(g, deck.cards, deck.instanceIds, 0)
      if (!removed) {
        messages.push(`${owner.mageType} has no card available to Conjure`)
        continue
      }
      markCardInstanceRevealed(g, removed.instanceId)
      const cardId = removed.cardId
      const candidates: BreachChoice[] = owner.breaches
        .filter(breach => canConjureToBreach(g, owner, breach, effect.breachEligibility, removed.cardId))
        .map(breach => ({
          playerId: owner.id,
          breachIndex: breach.index,
          playerName: owner.mageType,
          focusCost: breach.focusCost,
          focusCount: breach.focusCount,
          focusToOpen: breach.focusToOpen,
        }))
      resolution.conjuredCard = { playerId: owner.id, cardId, instanceId: removed.instanceId }
      recordCardTemporary(g, removed.instanceId, cardId,
        { zoneId: deck.zoneId, zone: 'deck', ownerId: owner.id, index: 0 },
        { zoneId: `temporary:conjure:${owner.id}`, zone: 'temporary', ownerId: owner.id, index: 0 })
      const prompt = owner.id === currentPlayerId
        ? `Conjure: look at ${getCard(cardId).name} from the top of your deck`
        : `${owner.mageType} Conjures: look at ${getCard(cardId).name} from the top of their deck`
      const decision = createDecision(g, prompt, 'select_conjure_breach', { cardId, candidates }, resolution.sourceCardId)
      messages.push(...pauseEffect(g, resolution, effect, decision))
      return messages
    }

    if (effect.kind === 'reveal_top_cards_for_discard') {
      const owner = getPlayer(g, currentPlayerId)
      preparePlayerDeckForRevealWithInstances(g, owner, effect.amount)
      const amount = Math.min(Math.max(0, effect.amount), owner.deck.length)
      if (amount === 0) {
        messages.push('No cards are available to reveal')
        continue
      }
      const candidates = owner.deck.slice(0, amount).map((cardId, index) => ({
        zone: 'deck' as const, index, cardId, cardName: getCard(cardId).name,
      }))
      const revealedCardLabel = amount === 1 ? 'card' : 'cards'
      const prompt = effect.reorderRemaining
        ? `Reveal the top ${amount} ${revealedCardLabel}. Drag to reorder them, then select any to discard.`
        : `Reveal the top ${amount} ${revealedCardLabel} and choose any to discard`
      const decision = createDecision(g, prompt, 'select_cards', {
        source: 'deck', candidates, min: 0, max: amount,
        reorderable: effect.reorderRemaining === true,
      }, resolution.sourceCardId)
      messages.push(...pauseEffect(g, resolution, effect, decision))
      return messages
    }

    if (effect.kind === 'reveal_top_card_to_hand_if_spell') {
      const targets = getEffectPlayerTargets(g, resolution, currentPlayerId, effect.target)
      if (targets.length === 0) {
        messages.push('No eligible player can reveal a card')
        continue
      }
      if (targets.length > 1) {
        const decision = createDecision(g, 'Choose a player to reveal the top card of their deck',
          'select_player_target', { targets }, resolution.sourceCardId)
        messages.push(...pauseEffect(g, resolution, effect, decision))
        return messages
      }
      const revealMessages = pauseRevealTopCard(g, resolution, effect, targets[0]!.playerId)
      messages.push(...revealMessages)
      if (g.pendingDecision) return messages
      continue
    }

    if (effect.kind === 'move_source_card_to_hand') {
      const owner = getPlayer(g, resolution.sourceCardOwnerId ?? resolution.sourcePlayerId ?? currentPlayerId)
      const index = resolution.sourceCardId ? owner.discard.indexOf(resolution.sourceCardId) : -1
      if (index < 0 || !resolution.sourceCardId) {
        messages.push('The source card is no longer in the discard pile')
        continue
      }
      const discard = getPlayerCardInstanceZone(g, owner.id, 'discard')
      const hand = getPlayerCardInstanceZone(g, owner.id, 'hand')
      moveCardBetweenZones(g, discard, index, hand, hand.cards.length, 'return')
      messages.push(`Returned ${getCard(resolution.sourceCardId).name} to hand`)
      continue
    }

    if (effect.kind === 'destroy_market_card') {
      // The effect names its Supply pile directly. It must not depend on the
      // outer effect source, which may be Garnet Shard, Debug Tools, or
      // another nested effect that initiated this cast.
      const cardId = effect.cardId
      const pile = cardId ? g.market.piles.find(candidate => candidate.cardId === cardId) : undefined
      if (!pile || pile.remaining <= 0) {
        messages.push('The supply pile has no card to destroy')
        continue
      }
      pile.remaining--
      messages.push(`Destroyed one ${getCard(cardId!).name} from its supply pile (${pile.remaining} remaining)`)
      continue
    }

    if (effect.kind === 'grant_spell_damage_bonus') {
      const turnEffects = getPlayerTurnEffects(p)
      turnEffects.spellDamageBonuses ??= []
      turnEffects.spellDamageBonuses.push({
        amount: Math.max(0, effect.amount),
        maxCost: Math.max(0, effect.maxCost),
      })
      messages.push(`${p.mageType}'s qualifying spells deal ${Math.max(0, effect.amount)} additional damage this turn`)
      continue
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
      if (effect.repeatConfirmation && !effect.repeatConfirmed) {
        const candidate = { playerId: owner.id, choice: { zone: 'hand', cardId: effect.cardId, index } } as const
        const decision = createDecision(g, `Click ${getCard(effect.cardId).name} to cast it again`,
          'select_collective_cards', { candidates: [candidate], min: 1, max: 1, repeat: true }, resolution.sourceCardId)
        messages.push(...pauseEffect(g, resolution, effect, decision))
        return messages
      }
      // The first cast in a repeated hand-spell effect is the explicit
      // "without discarding it" exception. The final cast is a normal cast,
      // so move the physical card to its owner's discard before resolving its
      // Cast text. This mirrors the timing used for spells cast from Breaches.
      const discardThisCast = effect.remaining <= 1
      const sourceHand = getPlayerCardInstanceZone(g, owner.id, 'hand')
      let castInstanceId = sourceHand.instanceIds[index]
      if (discardThisCast) {
        const discard = getPlayerCardInstanceZone(g, owner.id, 'discard')
        const moved = moveCardBetweenZones(g, sourceHand, index, discard, 0, 'cast_spell')
        if (moved?.cardId !== effect.cardId) {
          messages.push('The selected ally spell is no longer in hand')
          continue
        }
        castInstanceId = moved.instanceId
      }
      const outerContext = captureEffectContext(resolution)
      const casterPlayerId = resolution.sourcePlayerId ?? currentPlayerId
      resolution.pendingSpellCast = {
        playerId: effect.playerId, casterPlayerId, breachIndex: -1, spellIndex: -1,
        cardId: effect.cardId, instanceId: castInstanceId, discard: false,
      }
      resolution.sourcePlayerId = casterPlayerId
      resolution.sourceCardOwnerId = effect.playerId
      resolution.sourceCardId = effect.cardId
      resolution.effectPlayerId = casterPlayerId
      resolution.spellDamageBonus = turnSpellDamageBonus(g, casterPlayerId, getCard(effect.cardId).cost)
      resolution.spellAdditionalDamageBonus = 0
      const caster = getPlayer(g, casterPlayerId)
      caster.spellsCastThisTurn = (caster.spellsCastThisTurn ?? 0) + 1
      const spellContext = captureEffectContext(resolution)
      const castEffects = matchingBlocks(effect.cardId, owner.id, g, { kind: 'on_cast' }, undefined,
        casterPlayerId, undefined, casterPlayerId)
        .flatMap(block => contextualizeCardEffectBlock(
          block, effect.cardId, owner.id, casterPlayerId, spellContext,
        ))
      addRemainingEffects(resolution, [
        ...castEffects,
        { kind: 'resolve_spell_damage_bonus' },
        { kind: 'finalize_spell_cast' },
        outerContext,
        ...(effect.remaining > 1 ? [{
          kind: 'cast_selected_spell_from_hand',
          playerId: effect.playerId,
          cardId: effect.cardId,
          remaining: effect.remaining - 1,
          repeatConfirmation: true,
        } satisfies CardEffect] : []),
      ])
      messages.push(`Cast ${getCard(effect.cardId).name} from an ally's hand${discardThisCast ? '' : ' without discarding it'}`)
      continue
    }

    if (effect.kind === 'gain_minion_life') {
      const minion = g.nemesis.playArea.find(card =>
        card.cardType === 'minion' && card.cardId === effect.minionCardId,
      )
      if (!minion) {
        messages.push(`${getCard(effect.minionCardId).name} is not in play`)
        continue
      }
      const amount = Math.max(0, Math.floor(effect.amount))
      minion.lifeTokens = Math.max(0, minion.lifeTokens ?? 0) + amount
      recordHealthChange(g, { kind: 'healing', targetId: `minion:${minion.placedAt}`, amount })
      messages.push(`${getCard(minion.cardId).name} gains ${amount} life (${minion.lifeTokens})`)
      continue
    }

    if (effect.kind === 'move_cards_to_nemesis_specific_deck') {
      const deckName = specificDeckName(g)
      const blocked = g.nemesis.playArea.some(card =>
        (getCard(card.cardId) as NemesisCardDef).blocksPlacementIntoSpecificDeck === true,
      )
      if (blocked) {
        messages.push(`Cards cannot be placed into the ${deckName} right now`)
        continue
      }
      const candidates = getCardChoices(g, currentPlayerId, effect.source).filter(choice =>
        (!effect.cardIds || effect.cardIds.includes(choice.cardId)) &&
        (!effect.cardNames || effect.cardNames.includes(getCard(choice.cardId).name)) &&
        (!effect.cardTypes || effect.cardTypes.includes(getCard(choice.cardId).type)),
      )
      const maximum = Math.min(Math.max(0, effect.maxAmount), candidates.length)
      const minimum = Math.min(Math.max(0, effect.minAmount), maximum)
      if (maximum === 0) {
        messages.push(`No eligible card is available to place into the ${deckName}`)
        continue
      }
      if (minimum !== maximum || candidates.length > minimum || maximum > 1) {
        const decision = createDecision(
          g,
          minimum === maximum
            ? `Choose ${minimum} card(s) to place into the ${deckName}`
            : `Choose up to ${maximum} card(s) to place into the ${deckName}`,
          'select_cards',
          { source: effect.source, candidates, min: minimum, max: maximum },
          resolution.sourceCardId,
        )
        messages.push(...pauseEffect(g, resolution, effect, decision))
        return messages
      }
      const source = getPlayerCardInstanceZone(g, currentPlayerId, candidates[0]!.zone)
      const vortex = getNemesisCardInstanceZone(g, 'strike_deck')
      const moved = moveCardBetweenZones(g, source, candidates[0]!.index, vortex, 0, 'effect', { reveal: true })
      if (moved) messages.push(`Placed ${getCard(moved.cardId).name} into the ${deckName}`)
      continue
    }

    if (effect.kind === 'expunge_nemesis_specific_deck') {
      if (!resolution.vortexExpungeStartPlayerId) {
        const targets = g.players.map(player => ({ kind: 'player' as const, playerId: player.id }))
        const decision = createDecision(
          g, 'Choose which Mage receives the first Vortex card', 'select_player_target',
          { targets }, resolution.sourceCardId,
        )
        messages.push(...pauseEffect(g, resolution, effect, decision))
        return messages
      }
      const startIndex = g.players.findIndex(player => player.id === resolution.vortexExpungeStartPlayerId)
      resolution.vortexExpungeStartPlayerId = undefined
      const vortex = getNemesisCardInstanceZone(g, 'strike_deck')
      const shuffled = shuffle(vortex.cards.map((cardId, index) => ({
        cardId, instanceId: vortex.instanceIds[index]!,
      })))
      vortex.cards.splice(0, vortex.cards.length, ...shuffled.map(item => item.cardId))
      vortex.instanceIds.splice(0, vortex.instanceIds.length, ...shuffled.map(item => item.instanceId))
      resetCardInstancesAfterShuffle(g, vortex.instanceIds)
      vortex.cards.forEach((cardId, index) => recordCardShuffle(
        g, vortex.instanceIds[index]!, cardId,
        { zoneId: vortex.zoneId, zone: vortex.zone, ownerId: vortex.ownerId, index },
        'shuffle',
      ))

      for (let dealt = 0; dealt < Math.max(0, effect.amount); dealt++) {
        const playerIndex = (Math.max(0, startIndex) + dealt) % g.players.length
        const recipient = g.players[playerIndex]!
        if (vortex.cards.length > 0) {
          const deck = getPlayerCardInstanceZone(g, recipient.id, 'deck')
          moveCardBetweenZones(g, vortex, 0, deck, 0, 'effect', { hide: true })
        } else {
          messages.push(dealDamage(g, { kind: 'gravehold', id: 'gravehold', label: 'Gravehold' }, effect.fallbackGraveholdDamage))
        }
      }
      messages.push(`Oracle of Filth Expunges; cards were dealt starting with ${getPlayer(g, g.players[Math.max(0, startIndex)]!.id).mageType}`)
      if (g.nemesis.difficulty === 'increased' && !g.gameOver) {
        addRemainingEffects(resolution, [{
          kind: 'choose_one',
          prompt: 'Choose a character to gain 3 life',
          options: [
            { id: 'oracle', label: 'Oracle of Filth gains 3 life', effects: [{ kind: 'gain_life', amount: 3, target: 'nemesis' }] },
            { id: 'pupil', label: 'Pupil of Oblivion gains 3 life', effects: [{ kind: 'gain_minion_life', minionCardId: 'pupil_of_oblivion', amount: 3 }] },
          ],
        }])
      }
      continue
    }

    if (effect.kind === 'gain_nemesis_specific_deck_cards') {
      if (effect.recipient === 'choose' && !resolution.selectedActionPlayerId) {
        const targets = g.players.map(player => ({ kind: 'player' as const, playerId: player.id }))
        const decision = createDecision(g, `Choose a player to gain cards from the ${specificDeckName(g)}`,
          'select_player_target', { targets }, resolution.sourceCardId)
        messages.push(...pauseEffect(g, resolution, effect, decision))
        return messages
      }
      const vortex = getNemesisCardInstanceZone(g, 'strike_deck')
      const available = vortex.cards.map((cardId, index) => ({
        cardId, instanceId: vortex.instanceIds[index]!, index, cost: getCard(cardId).cost,
      }))
      const ordered = effect.selection === 'top'
        ? available
        : [...available].sort((left, right) => right.cost - left.cost || left.index - right.index)
      const count = Math.min(Math.max(0, effect.amount), ordered.length)
      for (let index = 0; index < count; index++) {
        const card = ordered[index]!
        const currentIndex = vortex.instanceIds.indexOf(card.instanceId)
        const recipientIndex = effect.recipient === 'alternate_players' ? index % g.players.length : 0
        const recipientId = effect.recipient === 'choose'
          ? resolution.selectedActionPlayerId!
          : effect.recipient === 'alternate_players'
            ? g.players[recipientIndex]!.id
            : currentPlayerId
        const destination = getPlayerCardInstanceZone(g, recipientId,
          effect.destination === 'deck_top' ? 'deck' : 'discard')
        moveCardBetweenZones(g, vortex, currentIndex, destination,
          effect.destination === 'deck_top' ? 0 : 0,
          'gain', effect.destination === 'deck_top' ? { hide: true } : { reveal: true })
      }
      if (effect.recipient === 'choose') {
        const recipient = getPlayer(g, resolution.selectedActionPlayerId!)
        resolution.effectPlayerId = recipient.id
        resolution.selectedActionPlayerId = undefined
        messages.push(`${recipient.mageType} gains ${count} card(s) from the ${specificDeckName(g)}`)
      } else {
        messages.push(`Players gain ${count} card(s) from the ${specificDeckName(g)}`)
      }
      continue
    }

    if (effect.kind === 'distribute_nemesis_specific_deck_cards') {
      const vortex = getNemesisCardInstanceZone(g, 'strike_deck')
      const available = vortex.cards.map((cardId, index) => ({
        cardId, instanceId: vortex.instanceIds[index]!, index, cost: getCard(cardId).cost,
      }))
      const ordered = effect.selection === 'top'
        ? available
        : [...available].sort((left, right) => right.cost - left.cost || left.index - right.index)
      const cards = ordered.slice(0, Math.max(0, effect.amount)).map(({ cardId, instanceId }) => ({
        cardId, instanceId,
      }))
      if (cards.length === 0) {
        messages.push(`No cards are available in the ${specificDeckName(g)} to distribute`)
        continue
      }
      const decision = createDecision(
        g,
        `Distribute ${cards.length} card(s) from the ${specificDeckName(g)} among the players`,
        'distribute_cards',
        {
          source: 'nemesis_specific_deck',
          destination: effect.destination,
          cards,
          players: g.players.map(player => player.id),
        },
        resolution.sourceCardId,
      )
      messages.push(...pauseEffect(g, resolution, effect, decision))
      return messages
    }

    if (effect.kind === 'destroy_nemesis_specific_deck_cards') {
      const vortex = getNemesisCardInstanceZone(g, 'strike_deck')
      const destroyed: string[] = []
      for (let index = vortex.cards.length - 1; index >= 0; index--) {
        if (getCard(vortex.cards[index]!).cost > effect.maxCost) continue
        const cardId = destroyCardFromZone(g, vortex, index)
        if (cardId) destroyed.push(cardId)
      }
      messages.push(`Destroyed ${destroyed.length} card(s) from the ${specificDeckName(g)}`)
      continue
    }

    if (effect.kind === 'place_specific_deck_cards_under_source_minion') {
      const minion = getSourceMinion(g, resolution.sourceCardId)
      if (!minion) {
        messages.push('The source Minion is no longer in play')
        continue
      }
      const vortex = getNemesisCardInstanceZone(g, 'strike_deck')
      const stack = getNemesisCardStackZone(g, minion)
      const count = Math.min(Math.max(0, effect.amount), vortex.cards.length)
      for (let index = 0; index < count; index++) {
        moveCardBetweenZones(g, vortex, 0, stack, stack.cards.length, 'effect', { reveal: true })
      }
      messages.push(`Placed ${count} card(s) under ${getCard(minion.cardId).name}`)
      continue
    }

    if (effect.kind === 'attach_bottom_nemesis_deck_card_under_source') {
      const activeInstanceId = g.nemesisResolution?.activeCardInstanceId
      const sourceCard = activeInstanceId
        ? g.nemesis.playArea.find(card => (card.instanceId ?? `${card.cardId}:${card.placedAt}`) === activeInstanceId)
        : undefined
      const deck = getNemesisCardInstanceZone(g, 'nemesis_deck')
      if (!sourceCard || deck.cards.length === 0) {
        const gameOver = checkGameOver(g)
        if (gameOver) {
          messages.push(gameOver)
          resolution.remainingEffects = []
        } else {
          messages.push('No Nemesis deck card is available to place under the Prophecy')
        }
        continue
      }
      const stack = getNemesisCardStackZone(g, sourceCard)
      const moved = moveCardBetweenZones(g, deck, deck.cards.length - 1, stack, 0, 'effect', { reveal: true })
      if (moved) {
        messages.push(`Placed ${getCard(moved.cardId).name} face up under ${getCard(sourceCard.cardId).name}`)
      }
      const gameOver = deck.cards.length === 0 ? checkGameOver(g) : null
      if (gameOver) {
        messages.push(gameOver)
        resolution.remainingEffects = []
      }
      continue
    }

    if (effect.kind === 'move_top_nemesis_specific_deck_card_to_bottom') {
      const deck = getNemesisCardInstanceZone(g, 'strike_deck')
      if (deck.cards.length === 0) {
        messages.push(`No card is available in the ${specificDeckName(g)}`)
        continue
      }
      const moved = moveCardBetweenZones(g, deck, 0, deck, deck.cards.length, 'return', { reveal: true })
      if (moved) {
        markCardInstanceRevealed(g, moved.instanceId)
        messages.push(`Placed ${getCard(moved.cardId).name} on the bottom of the ${specificDeckName(g)}`)
      }
      continue
    }

    if (effect.kind === 'play_top_nemesis_specific_deck_card') {
      const deck = getNemesisCardInstanceZone(g, 'strike_deck')
      let cardId: string | undefined = deck.cards[0]
      let instanceId: string | undefined = deck.instanceIds[0]
      if (effect.drawAbilityResolved && g.nemesisResolution?.drawnCardContextStack?.length) {
        const drawnContext = popNemesisDrawContext()
        if (!drawnContext) continue
        cardId = drawnContext.context.drawnCardId
        instanceId = drawnContext.context.drawnCardInstanceId
        if (drawnContext.cancelled) {
          const card = cardId ? getCard(cardId) as NemesisCardDef : undefined
          messages.push(card?.returnToSpecificDeckOnDiscard
            ? `${card.name} was returned to the bottom of the ${specificDeckName(g)} before entering play`
            : `${card?.name ?? 'Nemesis card'} was discarded before entering play`)
          continue
        }
      }
      if (!cardId) {
        messages.push(`No card is available in the ${specificDeckName(g)}`)
        continue
      }
      const definition = getCard(cardId) as NemesisCardDef
      if (definition.type !== 'attack' && definition.type !== 'minion' && definition.type !== 'power') {
        messages.push(`${getCard(cardId).name} cannot be played as a Nemesis card`)
        continue
      }
      if (effect.checkDrawAbility && !effect.drawAbilityResolved && instanceId && g.nemesisResolution) {
        const abilityPlayer = nemesisDrawAbilityPlayer(definition.type)
        pushNemesisDrawContext(cardId, instanceId, 'strike_deck')
        addRemainingEffects(resolution, [
          ...(abilityPlayer ? [{ kind: 'activate_ability' as const, mageId: abilityPlayer.id }] : []),
          { ...effect, drawAbilityResolved: true },
        ])
        continue
      }
      const deckIndex = instanceId ? deck.instanceIds.indexOf(instanceId) : 0
      if (deckIndex < 0) {
        messages.push(`${getCard(cardId).name} is no longer in the ${specificDeckName(g)}`)
        continue
      }
      const source = { zoneId: deck.zoneId, zone: 'strike_deck' as const, ownerId: 'nemesis', index: deckIndex }
      const removed = removeCardInstanceAt(g, deck.cards, deck.instanceIds, deckIndex)
      if (!removed) continue
      markCardInstanceRevealed(g, removed.instanceId)
      const previousNemesisContext = restoreCurrentNemesisCard()
      const previousEffectContext = restoreCurrentEffectContext()
      createNemesisCardInPlay(cardId, removed.instanceId, definition, true, source)
      if (g.nemesisResolution) {
        g.nemesisResolution.activeCardInstanceId = removed.instanceId
        g.nemesisResolution.activeCardId = cardId
        g.nemesisResolution.activeTrigger = 'immediately'
        g.nemesisResolution.activeCardPendingDiscard = definition.type === 'attack'
      }
      resolution.sourcePlayerId = undefined
      resolution.sourceCardOwnerId = undefined
      resolution.sourceCardId = cardId
      resolution.effectPlayerId = undefined
      resolution.pendingSpellCast = undefined
      const followUps: CardEffect[] = [
        ...nemesisEffectsFor(definition, 'immediately'),
        ...(definition.type === 'power' && (effect.powerTokensToRemove ?? 0) > 0
          ? [{
              kind: 'remove_nemesis_power_token_from_card_instance' as const,
              instanceId: removed.instanceId,
              ignoreTurnProtection: true,
              protectAfterRemoval: effect.protectPowerTokensThisTurn,
            }]
          : []),
        ...(effect.afterPlay ?? []),
        ...(definition.type === 'attack' ? [{ kind: 'finish_active_nemesis_card' as const }] : []),
        previousNemesisContext,
        previousEffectContext,
      ]
      addRemainingEffects(resolution, followUps)
      messages.push(`Played ${definition.name} from the ${specificDeckName(g)}`)
      continue
    }

    if (effect.kind === 'play_card_under_source_nemesis_card') {
      const activeInstanceId = g.nemesisResolution?.activeCardInstanceId
      const sourceCard = activeInstanceId
        ? g.nemesis.playArea.find(card => (card.instanceId ?? `${card.cardId}:${card.placedAt}`) === activeInstanceId)
        : undefined
      if (!sourceCard?.underCards?.length) {
        messages.push('No card remains under this Prophecy')
        continue
      }
      const stack = getNemesisCardStackZone(g, sourceCard)
      let instanceId: string | undefined = stack.instanceIds[0]
      let cardId: string | undefined = stack.cards[0]
      if (effect.drawAbilityResolved && g.nemesisResolution?.drawnCardContextStack?.length) {
        const drawnContext = popNemesisDrawContext()
        if (!drawnContext) continue
        cardId = drawnContext.context.drawnCardId
        instanceId = drawnContext.context.drawnCardInstanceId
        if (drawnContext.cancelled) {
          messages.push(`${cardId ? getCard(cardId).name : 'Nemesis card'} was discarded before entering play`)
          continue
        }
      }
      if (!cardId || !instanceId) continue
      const definition = getCard(cardId) as NemesisCardDef
      if (definition.type !== 'attack' && definition.type !== 'minion' && definition.type !== 'power') {
        messages.push(`${definition.name} cannot be played as a Nemesis card`)
        continue
      }
      if (!effect.drawAbilityResolved && g.nemesisResolution) {
        const abilityPlayer = nemesisDrawAbilityPlayer(definition.type)
        pushNemesisDrawContext(cardId, instanceId, 'nemesis_card_stack', sourceCard.instanceId)
        addRemainingEffects(resolution, [
          ...(abilityPlayer ? [{ kind: 'activate_ability' as const, mageId: abilityPlayer.id }] : []),
          { kind: 'play_card_under_source_nemesis_card', drawAbilityResolved: true },
        ])
        continue
      }
      const sourceIndex = stack.instanceIds.indexOf(instanceId)
      if (sourceIndex < 0) {
        messages.push(`${definition.name} is no longer under ${getCard(sourceCard.cardId).name}`)
        continue
      }
      const source = { zoneId: stack.zoneId, zone: 'nemesis_card_stack' as const, ownerId: 'nemesis', index: sourceIndex }
      const removed = removeCardInstanceAt(g, stack.cards, stack.instanceIds, sourceIndex)
      if (!removed) continue
      markCardInstanceRevealed(g, removed.instanceId)
      const previousNemesisContext = restoreCurrentNemesisCard()
      const previousEffectContext = restoreCurrentEffectContext()
      createNemesisCardInPlay(removed.cardId, removed.instanceId, definition, true, source)
      if (g.nemesisResolution) {
        g.nemesisResolution.activeCardInstanceId = removed.instanceId
        g.nemesisResolution.activeCardId = removed.cardId
        g.nemesisResolution.activeTrigger = 'immediately'
        g.nemesisResolution.activeCardPendingDiscard = definition.type === 'attack'
      }
      resolution.sourcePlayerId = undefined
      resolution.sourceCardOwnerId = undefined
      resolution.sourceCardId = removed.cardId
      resolution.effectPlayerId = undefined
      resolution.pendingSpellCast = undefined
      addRemainingEffects(resolution, [
        ...nemesisEffectsFor(definition, 'immediately'),
        ...(definition.type === 'attack' ? [{ kind: 'finish_active_nemesis_card' as const }] : []),
        previousNemesisContext,
        previousEffectContext,
      ])
      messages.push(`Played ${definition.name} from underneath ${getCard(sourceCard.cardId).name}`)
      continue
    }

    if (effect.kind === 'remove_nemesis_power_token') {
      const candidates = g.nemesis.playArea.filter(card => card.cardType === 'power' &&
        (card.powerTokens ?? 0) > 0 &&
        card.powerTokenLossBlockedOnTurn !== g.nemesis.nemesisTurnNumber)
      if (candidates.length === 0) {
        messages.push('No Power in play can lose a Power token')
        continue
      }
      const options = candidates.map(card => ({
        id: card.instanceId ?? `${card.cardId}:${card.placedAt}`,
        label: `${getCard(card.cardId).name} (${card.powerTokens} Power token${card.powerTokens === 1 ? '' : 's'})`,
        cardId: card.cardId,
        effects: [{
          kind: 'remove_nemesis_power_token_from_card_instance' as const,
          instanceId: card.instanceId ?? `${card.cardId}:${card.placedAt}`,
        }],
      }))
      if (options.length === 1) addRemainingEffects(resolution, options[0]!.effects)
      else addRemainingEffects(resolution, [{
        kind: 'choose_one', prompt: 'Choose a Power to lose 1 Power token', options,
      }])
      continue
    }

    if (effect.kind === 'remove_nemesis_power_token_from_card_instance') {
      const card = g.nemesis.playArea.find(candidate =>
        candidate.cardType === 'power' &&
        (candidate.instanceId ?? `${candidate.cardId}:${candidate.placedAt}`) === effect.instanceId,
      )
      if (!card || (card.powerTokens ?? 0) <= 0) {
        messages.push('The selected Power can no longer lose a Power token')
        continue
      }
      if (!effect.ignoreTurnProtection && card.powerTokenLossBlockedOnTurn === g.nemesis.nemesisTurnNumber) {
        messages.push(`${getCard(card.cardId).name} cannot lose another Power token this turn`)
        continue
      }
      card.powerTokens = Math.max(0, (card.powerTokens ?? 0) - 1)
      if (effect.protectAfterRemoval) card.powerTokenLossBlockedOnTurn = g.nemesis.nemesisTurnNumber
      messages.push(`${getCard(card.cardId).name} loses 1 Power token (${card.powerTokens} remaining)`)
      if (card.powerTokens === 0) {
        const previousNemesisContext = restoreCurrentNemesisCard()
        const previousEffectContext = restoreCurrentEffectContext()
        const afterPowerTokenRemoved = activeNemesisRules(g)?.afterPowerTokenRemoved?.(g, card) ?? []
        if (g.nemesisResolution) {
          g.nemesisResolution.activeCardInstanceId = effect.instanceId
          g.nemesisResolution.activeCardId = card.cardId
          g.nemesisResolution.activeTrigger = 'power_resolved'
          g.nemesisResolution.activeCardPendingDiscard = true
        }
        resolution.sourcePlayerId = undefined
        resolution.sourceCardOwnerId = undefined
        resolution.sourceCardId = card.cardId
        resolution.effectPlayerId = undefined
        resolution.pendingSpellCast = undefined
        addRemainingEffects(resolution, [
          ...nemesisEffectsFor(getCard(card.cardId) as NemesisCardDef, 'power_resolved'),
          { kind: 'finish_active_nemesis_card' },
          ...afterPowerTokenRemoved,
          previousNemesisContext,
          previousEffectContext,
        ])
      }
      continue
    }

    if (effect.kind === 'finish_active_nemesis_card') {
      if (g.nemesisResolution) discardCompletedNemesisCard(g, g.nemesisResolution)
      continue
    }

    if (effect.kind === 'play_set_aside_nemesis_card') {
      const setAside = g.nemesis.setAsideCards ??= []
      const setAsideIndex = setAside.findIndex(card => card.cardId === effect.cardId)
      if (setAsideIndex < 0) {
        messages.push(`${getCard(effect.cardId).name} is not set aside`)
        continue
      }
      const card = setAside.splice(setAsideIndex, 1)[0]!
      const definition = getCard(effect.cardId) as NemesisCardDef
      const instanceId = card.instanceId ?? `${card.cardId}:${card.placedAt}`
      const previousNemesisContext = restoreCurrentNemesisCard()
      const previousEffectContext = restoreCurrentEffectContext()
      createNemesisCardInPlay(effect.cardId, instanceId, definition, false, {
        zoneId: 'nemesis:set_aside',
        zone: 'nemesis_set_aside',
        ownerId: 'nemesis',
        index: setAsideIndex,
      })
      if (g.nemesisResolution) {
        g.nemesisResolution.activeCardInstanceId = instanceId
        g.nemesisResolution.activeCardId = effect.cardId
        g.nemesisResolution.activeTrigger = 'immediately'
        g.nemesisResolution.activeCardPendingDiscard = definition.type === 'attack'
      }
      resolution.sourcePlayerId = undefined
      resolution.sourceCardOwnerId = undefined
      resolution.sourceCardId = effect.cardId
      resolution.effectPlayerId = undefined
      resolution.pendingSpellCast = undefined
      addRemainingEffects(resolution, [
        ...nemesisEffectsFor(definition, 'immediately'),
        ...(definition.type === 'attack' ? [{ kind: 'finish_active_nemesis_card' as const }] : []),
        previousNemesisContext,
        previousEffectContext,
      ])
      messages.push(`Returned ${definition.name} from beside the mat to play`)
      continue
    }

    if (effect.kind === 'place_sub_board_token') {
      const subBoard = activeNemesisRules(g)?.subBoard
      if (!subBoard || subBoard.id === '' ||
        (subBoard.canPlaceToken && !subBoard.canPlaceToken(g,
          resolution.sourcePlayerId ?? resolution.effectPlayerId ?? currentPlayerId,
          effect.tokenId, effect.regionId))) {
        messages.push('That sub-board space cannot receive a token')
        continue
      }
      if (getSubBoardTokens(g).some(token => token.tokenId === effect.tokenId && token.regionId === effect.regionId)) {
        messages.push('That sub-board space is already occupied')
        continue
      }
      addSubBoardToken(g, effect.tokenId, effect.regionId, effect.instanceId)
      messages.push(`Placed a token on ${effect.regionId}`)
      addRemainingEffects(resolution, [
        ...(subBoard.afterTokenPlaced?.(g, effect.tokenId, effect.regionId) ?? []),
        ...(subBoard.effectsForRegion?.(g, effect.tokenId, effect.regionId) ?? []),
      ])
      continue
    }

    if (effect.kind === 'move_sub_board_token') {
      const moved = moveSubBoardToken(g, effect.tokenId, effect.regionId, effect.instanceId)
      if (moved) messages.push(`Moved ${effect.tokenId} token to ${effect.regionId}`)
      else messages.push(`No ${effect.tokenId} token is available to move`)
      continue
    }

    if (effect.kind === 'advance_sub_board_token') {
      const subBoard = activeNemesisRules(g)?.subBoard
      const route = subBoard?.tokenRoute?.(effect.tokenId)
      const token = [...getSubBoardTokens(g)].reverse().find(candidate => candidate.tokenId === effect.tokenId)
      const currentIndex = token && route ? route.indexOf(token.regionId) : -1
      if (!token || !route || currentIndex < 0 || currentIndex >= route.length - 1) {
        messages.push(`The ${effect.tokenId} token cannot advance on this route`)
        continue
      }
      const nextRegionId = route[currentIndex + 1]!
      moveSubBoardToken(g, effect.tokenId, nextRegionId, token.instanceId)
      messages.push(`Advanced ${effect.tokenId} token to ${nextRegionId}`)
      addRemainingEffects(resolution, [
        ...(subBoard?.effectsForRegion?.(g, effect.tokenId, nextRegionId) ?? []),
        ...(subBoard?.returnToStartAtRouteEnd && currentIndex + 1 === route.length - 1 && route[0]
          ? [{ kind: 'move_sub_board_token' as const, tokenId: effect.tokenId, regionId: route[0], instanceId: token.instanceId }]
          : []),
      ])
      continue
    }

    if (effect.kind === 'resolve_sub_board_space') {
      const subBoard = activeNemesisRules(g)?.subBoard
      const regionId = effect.regionId ?? [...getSubBoardTokens(g)].reverse()
        .find(token => token.tokenId === effect.tokenId)?.regionId
      if (regionId) addRemainingEffects(resolution, subBoard?.effectsForRegion?.(g, effect.tokenId, regionId) ?? [])
      continue
    }

    if (effect.kind === 'remove_sub_board_tokens') {
      const candidates = getSubBoardTokens(g).filter(token => token.tokenId === effect.tokenId &&
        (!effect.regionIds || effect.regionIds.includes(token.regionId)))
      if (effect.amount === 'all') {
        for (const candidate of [...candidates]) removeSubBoardToken(g, candidate.instanceId)
        if (candidates.length > 0) messages.push(`Removed ${candidates.length} ${effect.tokenId} token(s)`)
        continue
      }
      const remaining = Math.max(0, Math.floor(effect.amount))
      if (remaining === 0 || candidates.length === 0) {
        if (remaining > 0) messages.push(`No ${effect.tokenId} tokens are available to remove`)
        continue
      }
      const nextRemoval: CardEffect[] = remaining > 1
        ? [{ ...effect, amount: remaining - 1 }]
        : []
      const selectableTokens = effect.selectByRegion
        ? [...new Map(candidates.map(candidate => [candidate.regionId, candidate])).values()]
        : candidates
      const options = selectableTokens.map(candidate => ({
        id: effect.selectByRegion ? candidate.regionId : candidate.instanceId,
        label: effect.selectByRegion ? `Armor Chart ${candidate.regionId}` : `Remove token from ${candidate.regionId}`,
        ...(effect.selectByRegion ? { regionId: candidate.regionId } : {}),
        effects: [
          { kind: 'remove_sub_board_token_instance' as const, instanceId: candidate.instanceId },
          ...nextRemoval,
        ],
      }))
      if (options.length === 1) addRemainingEffects(resolution, options[0]!.effects)
      else {
        const prompt = effect.selectByRegion
          ? `Choose an Armor Chart space to remove a ${effect.tokenId} token from`
          : `Choose a ${effect.tokenId} token to remove`
        const choiceEffect: CardEffect = {
          kind: 'choose_one',
          prompt,
          options,
          ...(effect.selectByRegion ? { layout: 'sub-board-region-choice' as const } : {}),
        }
        const decision = createDecision(g,
          prompt,
          'choose_one',
          {
            options: options.map(({ id, label, regionId }) => ({ id, label, regionId })),
            ...(effect.selectByRegion ? { layout: 'sub-board-region-choice' } : {}),
          },
          resolution.sourceCardId,
        )
        messages.push(...pauseEffect(g, resolution, choiceEffect, decision))
        return messages
      }
      continue
    }

    if (effect.kind === 'remove_sub_board_token_instance') {
      const removed = removeSubBoardToken(g, effect.instanceId)
      if (removed) messages.push(`Removed ${removed.tokenId} token from ${removed.regionId}`)
      continue
    }

    if (effect.kind === 'move_cast_spell_to_nemesis_specific_deck') {
      const pending = resolution.pendingSpellCast
      if (!pending?.instanceId) {
        messages.push('The cast spell copy could not be identified')
        continue
      }
      const blocked = g.nemesis.playArea.some(card =>
        (getCard(card.cardId) as NemesisCardDef).blocksPlacementIntoSpecificDeck === true,
      )
      if (blocked) {
        messages.push('The cast spell stays in its current zone because cards cannot enter the Vortex')
        continue
      }
      const owner = getPlayer(g, pending.playerId)
      const sources = [
        getPlayerCardInstanceZone(g, owner.id, 'discard'),
        getPlayerCardInstanceZone(g, owner.id, 'hand'),
        ...owner.breaches.map(breach => getBreachCardInstanceZone(g, owner.id, breach.index)),
      ]
      const source = sources.find(zone => zone.instanceIds.includes(pending.instanceId!))
      if (!source) {
        messages.push('The cast spell is no longer available to place into the Vortex')
        continue
      }
      const vortex = getNemesisCardInstanceZone(g, 'strike_deck')
      const index = source.instanceIds.indexOf(pending.instanceId)
      moveCardBetweenZones(g, source, index, vortex, 0, 'effect', { reveal: true })
      messages.push(`Placed ${getCard(pending.cardId).name} into the Vortex`)
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

    if (effect.kind === 'exile_market_card_from_most_expensive_pile') {
      const candidates = marketPileChoices(g).filter(candidate => candidate.remaining > 0)
      if (candidates.length === 0) {
        messages.push('No supply card is available to Exile')
        continue
      }
      const highestCost = Math.max(...candidates.map(candidate => getCard(candidate.cardId).cost))
      const highestCostCandidates = candidates.filter(candidate => getCard(candidate.cardId).cost === highestCost)
      if (highestCostCandidates.length > 1) {
        const decision = createDecision(g, 'Choose a most expensive supply pile to Exile from',
          'select_market_pile', { candidates: highestCostCandidates, emphasis: 'required' }, resolution.sourceCardId)
        messages.push(...pauseEffect(g, resolution, effect, decision))
        return messages
      }
      const choice = highestCostCandidates[0]!
      const pile = g.market.piles[choice.pileIndex]!
      pile.remaining--
      createCardInZone(g, getNemesisCardInstanceZone(g, 'strike_deck'), choice.cardId, 0, 'effect', true,
        { zoneId: `supply:${choice.pileIndex}`, zone: 'supply', ownerId: null, index: 0 })
      messages.push(`Exiled ${choice.cardName} from the supply`)
      continue
    }

    if (effect.kind === 'summon_finality_from_specific_discard') {
      const finalityPile = getNemesisCardInstanceZone(g, 'strike_discard')
      if (finalityPile.cards.length === 0) {
        messages.push(dealDamage(g, { kind: 'gravehold', id: 'gravehold', label: 'Gravehold' }, 10))
        continue
      }
      const removed = removeCardInstanceAt(g, finalityPile.cards, finalityPile.instanceIds, 0)
      if (!removed) continue
      const definition = getCard(removed.cardId) as NemesisCardDef
      const placedAt = (g.nemesis.cardInstanceCounter ?? 0) + 1
      g.nemesis.cardInstanceCounter = placedAt
      const lifeBonus = g.nemesis.difficulty === 'increased'
        ? definition.increasedDifficultyLifeBonus ?? 0
        : 0
      createCardInstance(g, removed.cardId, true, removed.instanceId)
      g.nemesis.playArea.push({
        cardId: removed.cardId,
        cardType: 'minion',
        placedAt,
        instanceId: removed.instanceId,
        enteredOnNemesisTurn: g.nemesis.nemesisTurnNumber,
        lifeTokens: (definition.life ?? 0) + lifeBonus,
      })
      recordCardMove(g, removed.instanceId, removed.cardId,
        { zoneId: finalityPile.zoneId, zone: finalityPile.zone, ownerId: finalityPile.ownerId, index: 0 },
        { zoneId: 'nemesis:play_area', zone: 'nemesis_play_area', ownerId: 'nemesis', index: g.nemesis.playArea.length - 1 },
        'effect')
      messages.push(`Finality enters play with ${(definition.life ?? 0) + lifeBonus} life`)
      continue
    }

    if (effect.kind === 'unleash') {
      const rules = activeNemesisRules(g)
      const dynamicEffects = rules?.unleashEffectsFor
      const configured = rules?.unleashEffects
      if (dynamicEffects) {
        const count = Math.max(0, effect.amount ?? 1)
        if (count > 0) {
          addRemainingEffects(resolution, [
            ...dynamicEffects(g),
            ...(count > 1 ? [{ kind: 'unleash' as const, amount: count - 1 }] : []),
          ])
        }
      } else if (configured && configured.length > 0) {
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
      returnStrikeCardToDeck(g, effect.cardId, resolution.revealedStrikeCardInstanceId)
      resolution.revealedStrikeCardId = undefined
      resolution.revealedStrikeCardInstanceId = undefined
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
      const instanceId = resolutionState.drawnCardInstanceId
        ?? createCardInstance(g, cardId, true).instanceId
      const discard = getNemesisCardInstanceZone(g, 'nemesis_discard')
      if (resolutionState.drawnCardSourceZone === 'nemesis_card_stack') {
        const parent = g.nemesis.playArea.find(card =>
          (card.instanceId ?? `${card.cardId}:${card.placedAt}`) === resolutionState.drawnCardSourceParentInstanceId,
        )
        const stack = parent ? getNemesisCardStackZone(g, parent) : undefined
        const index = stack?.instanceIds.indexOf(instanceId) ?? -1
        if (!stack || index < 0) {
          messages.push('The revealed Nemesis card is no longer under its Prophecy')
          continue
        }
        moveCardBetweenZones(g, stack, index, discard, 0, 'effect', { reveal: true })
      } else if (resolutionState.drawnCardSourceZone === 'strike_deck') {
        const deck = getNemesisCardInstanceZone(g, 'strike_deck')
        const index = deck.instanceIds.indexOf(instanceId)
        if (index < 0) {
          messages.push(`The revealed ${specificDeckName(g)} card is no longer available`)
          continue
        }
        const definition = getCard(cardId) as NemesisCardDef
        if (definition.returnToSpecificDeckOnDiscard) {
          moveCardBetweenZones(g, deck, index, deck, deck.cards.length, 'return', { reveal: true })
          markCardInstanceRevealed(g, instanceId)
        } else {
          moveCardBetweenZones(g, deck, index, discard, 0, 'effect', { reveal: true })
        }
      } else {
        // A normal draw is temporarily represented by NemesisResolutionState,
        // so cancellation inserts it directly into the Nemesis discard pile.
        insertCardInstanceAt(g, g.nemesis.discard, g.nemesis.discardInstanceIds ??= [], {
          cardId, instanceId, revealed: true,
        }, 0, true)
      }
      if (resolutionState.drawnCardSourceZone) resolutionState.drawnCardProcessed = true
      messages.push(`Discarded revealed Nemesis card: ${getCard(cardId).name}`)
      continue
    }

    if (effect.kind === 'gain_aether') {
      const amount = Math.max(0, effect.amount)
      p.bonusAether += amount
      messages.push(`${p.mageType} gains ${amount} Aether`)
      continue
    }

    if (effect.kind === 'lose_unspent_aether') {
      const unspent = getUnspentAether(p)
      // Preserve Aether already spent this turn; only the remaining portion
      // is lost. Conditional pools retain their spent ledger so later cost
      // checks cannot make previously spent Aether available again.
      p.bonusAether = Math.min(p.bonusAether, p.regularAetherSpent)
      for (const [condition, earned] of Object.entries(p.conditionalAetherEarned ?? {})) {
        p.conditionalAetherEarned[condition] = Math.min(earned, p.condAetherSpent?.[condition] ?? 0)
      }
      p.aetherTokens = 0
      messages.push(`${p.mageType} loses ${unspent} unspent Aether`)
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
      owner.specificDeckInstanceIds = ensureCardInstanceZone(g, owner.specificDeck!, owner.specificDeckInstanceIds)
      owner.specificDeck!.splice(cardIndex, 1)
      owner.specificDeckInstanceIds.splice(cardIndex, 1)
      breach.installedUpgrades ??= []
      breach.installedUpgrades.push(card.id)
      resolution.effectPlayerId = owner.id
      const actorPlayerId = resolution.sourcePlayerId ?? currentPlayerId
      const restoreContext = captureEffectContext(resolution)
      const installationEffects = matchingBlocks(card.id, owner.id, g,
        { kind: 'on_breach_upgrade_installed' }, undefined, owner.id, undefined, actorPlayerId)
        .flatMap(block => contextualizeCardEffectBlock(
          block, card.id, owner.id, actorPlayerId, restoreContext,
        ))
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
      const targets = getEffectPlayerTargets(g, resolution, currentPlayerId, effect.target ?? 'self')
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

    if (effect.kind === 'return_trinket_to_deck') {
      const owner = getPlayer(g, resolution.sourceCardOwnerId ?? resolution.sourcePlayerId ?? currentPlayerId)
      const cardId = resolution.sourceCardId
      const playedIndex = cardId ? owner.playedThisTurn.lastIndexOf(cardId) : -1
      if (!cardId || playedIndex < 0 || !getCard(cardId).mechanics?.includes('trinket')) {
        messages.push('The played Trinket is no longer available to return')
        continue
      }
      const played = getPlayerCardInstanceZone(g, owner.id, 'played_this_turn')
      const trinketDeck = getNemesisCardInstanceZone(g, 'trinket_deck')
      const returnedInstanceId = played.instanceIds[playedIndex]
      if (returnedInstanceId) {
        const ownedIndex = owner.trinketInstanceIds?.indexOf(returnedInstanceId) ?? -1
        if (ownedIndex >= 0) owner.trinketInstanceIds!.splice(ownedIndex, 1)
      }
      moveCardBetweenZones(g, played, playedIndex, trinketDeck, trinketDeck.cards.length, 'return')
      messages.push(`Returned ${getCard(cardId).name} to the bottom of the Trinket deck`)
      continue
    }

    if (effect.kind === 'gain_pulse_token' || effect.kind === 'lose_pulse_token') {
      const targets = getEffectPlayerTargets(g, resolution, currentPlayerId, effect.target ?? 'self')
      const action = effect.kind === 'gain_pulse_token' ? 'gain' : 'lose'
      if (targets.length === 0) {
        messages.push(`No eligible player can ${action} Pulse tokens`)
        continue
      }
      if (targets.length > 1) {
        const decision = createDecision(g,
          `Choose a player to ${action} Pulse tokens`,
          'select_player_target', { targets }, resolution.sourceCardId,
        )
        messages.push(...pauseEffect(g, resolution, effect, decision))
        return messages
      }
      const target = getPlayer(g, targets[0]!.playerId)
      const amount = effect.kind === 'gain_pulse_token'
        ? Math.max(0, Math.floor(effect.amount ?? 1))
        : Math.floor(amountValue(g, currentPlayerId, effect.amount, resolution.sourceCardId, resolution))
      if (effect.kind === 'gain_pulse_token') {
        const gained = gainPulseTokens(target, amount)
        messages.push(gained > 0
          ? `${target.mageType} gains ${gained} Pulse token${gained === 1 ? '' : 's'} (${target.pulseTokens}/${MAX_PULSE_TOKENS})`
          : `${target.mageType} cannot gain more Pulse tokens (${MAX_PULSE_TOKENS}/${MAX_PULSE_TOKENS})`)
      } else {
        const lost = losePulseTokens(target, amount)
        messages.push(lost > 0
          ? `${target.mageType} loses ${lost} Pulse token${lost === 1 ? '' : 's'} (${target.pulseTokens}/${MAX_PULSE_TOKENS})`
          : `${target.mageType} does not have enough Pulse tokens`)
      }
      continue
    }

    if (effect.kind === 'gain_charge') {
      const amount = Math.max(0, effect.amount)
      const targets = effect.target === 'breach_owner' && resolution.pendingSpellCast
        ? [getPlayer(g, resolution.pendingSpellCast.playerId)]
        : effect.target === 'self'
          ? [p]
          : effect.target === 'any_player'
            ? g.players
          : effect.target === 'each_ally'
            ? getEffectPlayerTargets(g, resolution, currentPlayerId, 'ally')
              .map(target => getPlayer(g, target.playerId))
              .filter(target => conditionMatches(g, target.id, effect.condition, resolution))
          : effect.target === 'ally'
            ? getSelectedPlayerTargets(g, resolution.sourcePlayerId ?? currentPlayerId, 'ally').map(target => getPlayer(g, target.playerId))
            : g.players.filter(player => player.id !== resolution.sourcePlayerId)
      if (effect.target === 'ally' && targets.length > 1) {
        const decision = createDecision(g, 'Choose an ally to gain charge', 'select_player_target',
          { targets: targets.map(target => ({ kind: 'player' as const, playerId: target.id })) }, resolution.sourceCardId)
        messages.push(...pauseEffect(g, resolution, effect, decision))
        return messages
      }
      if (effect.target === 'any_player' && targets.length > 1) {
        const decision = createDecision(g, 'Choose a player to gain charge', 'select_player_target',
          { targets: targets.map(target => ({ kind: 'player' as const, playerId: target.id })) }, resolution.sourceCardId)
        messages.push(...pauseEffect(g, resolution, effect, decision))
        return messages
      }
      if (effect.target === 'ally' && effect.continueAsTarget && targets.length === 1) {
        resolution.effectPlayerId = targets[0]!.id
      }
      let remaining = amount
      for (const target of targets) {
        const gained = gainPlayerCharge(g, target, remaining)
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
      const targets = getEffectPlayerTargets(g, resolution, currentPlayerId, effect.target, effect.selection)
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
      const removed = removeCardInstanceAt(g, g.nemesis.discard, g.nemesis.discardInstanceIds ??= [], index)
      if (!removed) continue
      const cardId = removed.cardId
      const definition = getCard(cardId) as NemesisCardDef
      const placedAt = (g.nemesis.cardInstanceCounter ?? 0) + 1
      g.nemesis.cardInstanceCounter = placedAt
      createCardInstance(g, cardId, true, removed.instanceId)
      const sourceIndex = index
      g.nemesis.playArea.push({
        cardId, cardType: 'minion', placedAt, instanceId: removed.instanceId,
        enteredOnNemesisTurn: g.nemesis.nemesisTurnNumber,
        lifeTokens: definition.life ?? 0,
        ...(definition.displayRow ? { displayRow: definition.displayRow } : {}),
        ...(definition.nemesisTokens != null ? { nemesisTokens: definition.nemesisTokens } : {}),
      })
      recordCardMove(g, removed.instanceId, cardId,
        { zoneId: 'nemesis:nemesis_discard', zone: 'nemesis_discard', ownerId: 'nemesis', index: sourceIndex },
        { zoneId: 'nemesis:play_area', zone: 'nemesis_play_area', ownerId: 'nemesis', index: g.nemesis.playArea.length - 1 },
        'return')
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
      // Treat this as a reveal of the next available Turn Order deck. If the
      // current round is exhausted, recycle and shuffle the discard first so
      // the player can arrange the complete next round.
      replenishTurnOrderDeckForReveal(g, 1)
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
      const decision = effect.returnChoice
        ? createDecision(g, 'Place the revealed turn order card on top or bottom?',
          'choose_turn_order_position', { cardId: top }, resolution.sourceCardId)
        : createDecision(g,
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

    if (effect.kind === 'gain_charge_per_hand_card') {
      const actor = getPlayer(g, resolution.sourcePlayerId ?? currentPlayerId)
      const allies = getEffectPlayerTargets(g, resolution, currentPlayerId, 'ally').map(target => getPlayer(g, target.playerId))
      let sourceGained = 0
      for (const ally of allies) {
        const amount = ally.hand.filter(cardId => getCard(cardId).cost >= effect.minCost).length
        sourceGained += amount
        const gained = gainPlayerCharge(g, ally, amount)
        if (gained > 0) messages.push(`${ally.mageType} gains ${gained} charge (${ally.charge}/${ally.chargeThreshold})`)
      }
      const gainedBySource = gainPlayerCharge(g, actor, sourceGained)
      if (gainedBySource > 0) messages.push(`${actor.mageType} gains ${gainedBySource} charge (${actor.charge}/${actor.chargeThreshold})`)
      continue
    }

    if (effect.kind === 'attach_relic') {
      const candidates: BreachChoice[] = getEffectPlayerTargets(g, resolution, currentPlayerId, effect.target)
        .flatMap(target => getPlayer(g, target.playerId).breaches
          .filter(breach => isPresentBreach(breach) && !breach.attachedRelic)
          .map(breach => ({
            playerId: target.playerId, breachIndex: breach.index,
            playerName: getPlayer(g, target.playerId).mageType,
            focusCost: breach.focusCost, focusCount: breach.focusCount, focusToOpen: breach.focusToOpen,
          })))
      if (candidates.length === 0) {
        messages.push('No Breach without an attached relic is available')
        if (resolution.sourceCardInHandPendingPlay) {
          resolution.remainingEffects = []
          resolution.sourceCardInHandPendingPlay = false
        }
        continue
      }
      // Attachment is always an explicit board choice, even when only one
      // Breach is currently eligible. This keeps the target visible and lets
      // the player confirm the placement instead of silently auto-attaching.
      const decision = createDecision(g, 'Choose a Breach to attach this relic to', 'select_breach', { candidates, action: 'attach' }, resolution.sourceCardId)
      messages.push(...pauseEffect(g, resolution, effect, decision))
      return messages
    }

    if (effect.kind === 'draw_and_discard_cards') {
      if (!effect.resumeAfterDraw) {
        const targets = getEffectPlayerTargets(g, resolution, currentPlayerId, effect.target ?? 'self')
        if (targets.length === 0) {
          messages.push('No eligible ally is available')
          continue
        }
        if (targets.length > 1) {
          const decision = createDecision(g, 'Choose an ally to draw and discard cards', 'select_player_target', { targets }, resolution.sourceCardId)
          messages.push(...pauseEffect(g, resolution, effect, decision))
          return messages
        }
        const target = getPlayer(g, targets[0]!.playerId)
        resolution.effectPlayerId = target.id
        const resumedEffect: CardEffect = {
          ...effect, drawAmount: 0, target: 'self', resumeAfterDraw: true,
        }
        addRemainingEffects(resolution, [
          ...(effect.drawAmount > 0 ? [{
            kind: 'draw_cards_for_player' as const,
            playerId: target.id, remaining: effect.drawAmount, drawn: 0,
          }] : []),
          resumedEffect,
        ])
        continue
      }

      const target = getPlayer(g, resolution.effectPlayerId ?? currentPlayerId)
      const candidates = getCardChoices(g, target.id, 'hand').map(choice => ({
        ...choice, highlight: 'required' as const,
      }))
      const max = Math.min(Math.max(0, effect.discardAmount), candidates.length)
      if (max === 0) {
        messages.push(`${target.mageType} has no card to discard`)
        continue
      }
      const decision = createDecision(g, `Choose ${max} card(s) from hand to discard`, 'select_cards', {
        source: 'hand', candidates, min: max, max,
      }, resolution.sourceCardId)
      messages.push(...pauseEffect(g, resolution, effect, decision))
      return messages
    }

    if (effect.kind === 'resolve_recall') {
      const recallActorId = resolution.sourcePlayerId ?? currentPlayerId
      const candidates = availableRecallChoices(g, effect.ignoreOncePerTurn === true, recallActorId)
      if (candidates.length === 0 || effect.maxTimes <= 0) continue
      const decision = createDecision(g, 'Choose a Recall effect to resolve', 'select_collective_cards', { candidates, min: 0, max: 1 }, resolution.sourceCardId)
      messages.push(...pauseEffect(g, resolution, effect, decision))
      return messages
    }

    if (effect.kind === 'choose_token_amount') {
      const available = effect.token === 'pulse' ? Math.max(0, p.pulseTokens ?? 0) : 0
      const maxAmount = Math.min(available, Math.max(0, Math.floor(effect.maxAmount ?? available)))
      const minAmount = Math.min(maxAmount, Math.max(0, Math.floor(effect.minAmount ?? 0)))
      if (maxAmount === 0 && minAmount === 0) {
        resolution.lastChosenTokenAmount = 0
        addRemainingEffects(resolution, effect.effects)
        continue
      }
      const decision = createDecision(g, effect.prompt, 'choose_token_amount', {
        token: effect.token, minAmount, maxAmount, available, summary: effect.summary,
        layout: effect.layout,
      }, resolution.sourceCardId)
      messages.push(...pauseEffect(g, resolution, effect, decision))
      return messages
    }

    if (effect.kind === 'deal_damage_divided') {
      const targets = getDamageTargets(g, effect.target, resolution.sourceCardId)
      if (targets.length === 0) {
        messages.push('No valid damage target')
        continue
      }
      if (hasDeferredAdditionalDamage(effect) &&
        resolution.lastSelectedCardCount === undefined &&
        resolution.lastOptionalAccepted === undefined) {
        resolution.lastSelectedCardCount = 0
        resolution.lastSelectedCardCost = 0
        resolution.lastOptionalAccepted = false
        deferDamageUntilPrerequisitesResolve(effect)
        continue
      }
      const amount = Math.floor(damageEffectAmountValue(
        g, currentPlayerId, effect.amount, effect.additionalDamage, resolution.sourceCardId, resolution,
      ))
      // A divided-damage effect is one pool. Apply cast-wide damage modifiers
      // once before targets receive their individual points.
      const damagePool = Math.floor(applySpellDamageBonus(resolution, amount))
      if (damagePool <= 0) continue
      if (targets.length === 1 && effect.target !== 'all_players') {
        messages.push(dealNemesisTargetDamage(g, resolution, targets[0]!, damagePool))
        continue
      }
      const playerDamageAllocation = effect.target === 'all_players'
      resolution.dividedDamageAllocation = {
        total: damagePool,
        remaining: playerDamageAllocation ? damagePool : 0,
        target: effect.target,
        amounts: playerDamageAllocation ? {} : automaticallyAllocateDamage(g, targets, damagePool),
      }
      const decision = createDecision(g,
        playerDamageAllocation
          ? `Allocate ${damagePool} damage among the players`
          : `Review the ${damagePool} assigned damage, then click the Spell again to resolve`,
        'allocate_divided_damage', { targets, total: damagePool }, resolution.sourceCardId)
      messages.push(...pauseEffect(g, resolution, effect, decision))
      return messages
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
        deferDamageUntilPrerequisitesResolve(effect)
        continue
      }
      const amount = damageEffectAmountValue(
        g, currentPlayerId, effect.amount, effect.additionalDamage, resolution.sourceCardId, resolution,
      )
      const targets = getDamageTargets(g, effect.target, resolution.sourceCardId)
      if (targets.length === 0) {
        messages.push('No valid damage target')
        continue
      }
      if (targets.length > 1) {
        const decision = createDecision(g, 'Choose a damage target', 'select_damage_target',
          { targets }, resolution.sourceCardId,
        )
        messages.push(...pauseEffect(g, resolution, effect, decision))
        return messages
      }
      messages.push(dealNemesisTargetDamage(g, resolution, targets[0]!, applySpellDamageBonus(resolution, amount)))
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
      messages.push(dealNemesisTargetDamage(g, resolution, targets[0]!, applySpellDamageBonus(resolution, amount)))
      continue
    }

    if (effect.kind === 'deal_player_damage') {
      let targets = effect.target === 'doom_owner'
        ? getSelectedDamagePlayerTargets(g, currentPlayerId, effect.target, effect.selection)
        : getEffectPlayerTargets(g, resolution, currentPlayerId, effect.target, effect.selection)
      if (effect.preferTargetWithCardNamesInHand?.length) {
        const eligibleTargets = targets.filter(target => getPlayer(g, target.playerId).hand.some(cardId =>
          effect.preferTargetWithCardNamesInHand!.includes(getCard(cardId).name),
        ))
        if (eligibleTargets.length > 0) targets = eligibleTargets
      }
      if (effect.preferTargetWithCardTypesInHand?.length) {
        const eligibleTargets = targets.filter(target => getPlayer(g, target.playerId).hand.some(cardId =>
          effect.preferTargetWithCardTypesInHand!.includes(getCard(cardId).type),
        ))
        if (eligibleTargets.length > 0) targets = eligibleTargets
      }
      if (targets.length === 0) {
        messages.push('No valid player damage target')
        continue
      }
      if (targets.length > 1) {
        const decision = createDecision(g, 'Choose a player to suffer damage', 'select_player_target',
          {
            targets,
            damageAmounts: Object.fromEntries(targets.map(target => [
              target.playerId,
              amountValue(g, target.playerId, effect.amount, resolution.sourceCardId),
            ])),
          }, resolution.sourceCardId,
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

    if (effect.kind === 'deal_player_damage_all') {
      for (const target of g.players) {
        if (g.gameOver) break
        const damage = amountValue(g, target.id, effect.amount, resolution.sourceCardId)
        messages.push(sufferPlayerDamage(g, target.id, damage))
        const excess = Math.max(0, -target.hp)
        const death = checkPlayerDeath(g, target.id, true)
        if (death) {
          messages.push(death)
          queuePlayerExhaustion(resolution, target.id, excess)
        }
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
        : effect.relativeToSource
          ? resolution.sourcePlayerId ?? currentPlayerId
          : currentPlayerId
      const targets = getEffectPlayerTargets(g, resolution, targetContextPlayerId, effect.target ?? 'self', effect.selection,
        effect.relativeToSource === true || effect.relativeToSpellCaster === true)
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
      resolution.effectPlayerId = effect.relativeToSource
        ? resolution.sourcePlayerId ?? target.id
        : target.id
      if (effect.amount > 0) {
        addRemainingEffects(resolution, [{
          kind: 'draw_cards_for_player', playerId: target.id, remaining: effect.amount, drawn: 0,
        }])
      } else {
        messages.push(`${target.mageType} draws 0 card(s)`)
      }
      continue
    }

    if (effect.kind === 'draw_cards_for_player') {
      const target = getPlayer(g, effect.playerId)
      if (effect.remaining <= 0) {
        messages.push(`${target.mageType} draws ${effect.drawn} card(s)`)
        continue
      }
      const drawn = drawCardsForPlayer(g, target.id, 1)
      const totalDrawn = effect.drawn + drawn
      if (drawn > 0 && effect.remaining > 1) {
        addRemainingEffects(resolution, [{
          kind: 'draw_cards_for_player', playerId: target.id,
          remaining: effect.remaining - 1, drawn: totalDrawn,
        }])
      } else {
        messages.push(`${target.mageType} draws ${totalDrawn} card(s)`)
      }
      continue
    }

    if (effect.kind === 'gain_life') {
      const targets = getLifeTargets(g,
        effectTargetPlayerId(resolution, currentPlayerId, effect.target === 'ally' ? 'ally' : 'self'),
        effect.target)
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
      if (targets[0]!.kind === 'nemesis') {
        const gameOver = checkGameOver(g)
        if (gameOver) {
          messages.push(gameOver)
          resolution.remainingEffects = []
          return messages
        }
      }
      continue
    }

    if (effect.kind === 'lose_charge') {
      let targets = getEffectPlayerTargets(g, resolution, currentPlayerId, effect.target ?? 'self')
      if (effect.targetAvailability === 'full_or_max') {
        targets = retainFullyResolvableOrMaximumTargets(targets, effect.amount, target =>
          getPlayer(g, target.playerId).charge)
      }
      if (targets.length > 1) {
        const decision = createDecision(g, 'Choose a player to lose charge', 'select_player_target',
          { targets }, resolution.sourceCardId,
        )
        messages.push(...pauseEffect(g, resolution, effect, decision))
        return messages
      }
      const target = getPlayer(g, targets[0]?.playerId ?? currentPlayerId)
      const amount = Math.min(Math.max(0, effect.amount), target.charge)
      target.charge -= amount
      messages.push(`${target.mageType} loses ${amount} charge (${target.charge}/${target.chargeThreshold})`)
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
      const hand = getPlayerCardInstanceZone(g, player.id, 'hand')
      const played = getPlayerCardInstanceZone(g, player.id, 'played_this_turn')
      const moved = moveCardBetweenZones(g, hand, handIndex, played, played.cards.length, 'play')
      if (!moved) {
        messages.push('The selected card is no longer available')
        continue
      }
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
      ensurePlayerCollections(p)
      p.cardPlayCountsThisTurn[effect.cardId] = (p.cardPlayCountsThisTurn[effect.cardId] ?? 0) + 1
      const restoreContext = captureEffectContext(resolution)
      const nested = matchingBlocks(effect.cardId, currentPlayerId, g, { kind: 'on_play' }, undefined,
        currentPlayerId, undefined, currentPlayerId).flatMap(block =>
        contextualizeCardEffectBlock(block, effect.cardId, currentPlayerId, currentPlayerId, restoreContext))
      if (effect.destroyAfter) nested.push({ kind: 'destroy_played_card', cardId: effect.cardId, playerId: currentPlayerId })
      addRemainingEffects(resolution, nested)
      messages.push(`Played ${card.name}`)
      continue
    }

    if (effect.kind === 'destroy_played_card') {
      const owner = getPlayer(g,
        effect.playerId ?? resolution.sourceCardOwnerId ?? resolution.sourcePlayerId ?? currentPlayerId)
      const index = [...owner.playedThisTurn].lastIndexOf(effect.cardId)
      if (index < 0) {
        messages.push('Played card is no longer available to destroy')
        continue
      }
      const played = getPlayerCardInstanceZone(g, owner.id, 'played_this_turn')
      destroyCardFromZone(g, played, index)
      messages.push(getCard(effect.cardId).returnToSwapZoneOnDestroy
        ? `${getCard(effect.cardId).name} returns to the Swap zone`
        : `Destroyed ${getCard(effect.cardId).name}`)
      continue
    }

    if (effect.kind === 'destroy_player_card_in_play') {
      // The active player controls the action, but the Treasure remains in its
      // owner's Player cards in play area and must be destroyed there.
      const owner = getPlayer(g,
        effect.playerId ?? resolution.sourceCardOwnerId ?? resolution.sourcePlayerId ?? currentPlayerId)
      const inPlay = getPlayerCardInstanceZone(g, owner.id, 'player_cards_in_play')
      const index = inPlay.cards.lastIndexOf(effect.cardId)
      if (index < 0) {
        messages.push(`${getCard(effect.cardId).name} is no longer in Player cards in play`)
        continue
      }
      destroyCardFromZone(g, inPlay, index)
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
        const restoreContext = captureEffectContext(resolution)
        const followups = matchingBlocks(effect.cardId, currentPlayerId, g, { kind: 'on_gain' }, undefined,
          currentPlayerId, undefined, currentPlayerId).flatMap(block =>
          contextualizeCardEffectBlock(block, effect.cardId, currentPlayerId, currentPlayerId, restoreContext))
        const supplyGainEffects = marketPileIndex === undefined
          ? []
          : getSupplyPileGainEffects(
              g, marketPileIndex, currentPlayerId, effect.cardId, destination, restoreContext,
            )
        addRemainingEffects(resolution, [...followups, ...supplyGainEffects])
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
      const played = getPlayerCardInstanceZone(g, p.id, 'played_this_turn')
      const discard = getPlayerCardInstanceZone(g, p.id, 'discard')
      const swapZone = getPlayerCardInstanceZone(g, p.id, 'swap_zone')
      const playedIndex = played.cards.lastIndexOf(sourceCardId)
      const discardIndex = playedIndex >= 0 ? -1 : discard.cards.indexOf(sourceCardId)
      const sourceZone = playedIndex >= 0 ? played : discard
      const sourceIndex = playedIndex >= 0 ? playedIndex : discardIndex
      const incoming = sourceIndex < 0
        ? undefined
        : moveCardBetweenZones(g, sourceZone, sourceIndex, swapZone, swapZone.cards.length, 'swap')
      if (!incoming) {
        messages.push(`${getCard(sourceCardId).name} is no longer available to swap`)
        continue
      }
      ensurePlayerCollections(p)
      const targetIndex = swapZone.cards.indexOf(effect.cardId)
      if (targetIndex < 0) {
        messages.push(`${getCard(incoming.cardId).name} enters the Swap zone; ${getCard(effect.cardId).name} is unavailable`)
        continue
      }
      const movedOut = moveCardBetweenZones(g, swapZone, targetIndex, discard, 0, 'swap')
      if (!movedOut) continue
      messages.push(`Swapped ${getCard(incoming.cardId).name} for ${getCard(movedOut.cardId).name}`)
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
        const cardId = gainSwapZoneCard(g, p, candidates[0]!)
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
      const owner = getPlayer(g,
        resolution.sourceCardOwnerId ?? resolution.sourcePlayerId ?? currentPlayerId)
      ensurePlayerCollections(owner)
      const revealed = owner.specificDeck!.slice(0, 2)
      if (revealed.length === 0) {
        messages.push('No cards are available in the Mage-specific deck')
        continue
      }
      const deckInstanceIds = ensureCardInstanceZone(g, owner.specificDeck!, owner.specificDeckInstanceIds)
      owner.specificDeckInstanceIds = deckInstanceIds
      const revealedInstanceIds = deckInstanceIds.slice(0, revealed.length)
      // Record each seen physical card independently, even when the deck has
      // multiple copies with the same printed ID.
      revealed.forEach((cardId, index) => services.rememberSpecificDeckCard(g, owner, cardId, index))
      if (effect.mode === 'put_one_into_play') {
        resolution.specificDeckReveal = {
          playerId: owner.id,
          cards: revealed,
          instanceIds: revealedInstanceIds,
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
          'select_cards', {
            source: 'specific_deck', candidates, min: 1, max: 1,
            layout: effect.choiceLayout ?? 'simple',
          },
          resolution.sourceCardId,
        )
        messages.push(...pauseEffect(g, resolution, effect, decision))
        return messages
      }

      owner.specificDeck!.splice(0, revealed.length)
      owner.specificDeckInstanceIds!.splice(0, revealed.length)
      resolution.specificDeckReveal = {
        playerId: owner.id,
        cards: revealed,
        instanceIds: revealedInstanceIds,
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
            { candidates, emphasis: 'required' }, resolution.sourceCardId,
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
      const minion = getSourceMinion(g, resolution.sourceCardId)
      if (!minion) {
        messages.push('No source Minion is in play')
        continue
      }
      const before = Math.max(0, minion.lifeTokens ?? 0)
      minion.lifeTokens = Math.max(0, effect.base + emptyMarketPileCount(g) * effect.amountPerEmptyMarketPile)
      recordHealthChange(g, {
        kind: 'healing',
        targetId: `minion:${minion.placedAt}`,
        amount: Math.max(0, minion.lifeTokens - before),
      })
      messages.push(`${getCard(minion.cardId).name} gains ${minion.lifeTokens} life`)
      continue
    }

    if (effect.kind === 'move_gained_card') {
      const gained = resolution.lastGainedCardId
      if (gained && p.discard[0] === gained) {
        const discard = getPlayerCardInstanceZone(g, p.id, 'discard')
        if (effect.destination === 'hand') {
          const hand = getPlayerCardInstanceZone(g, p.id, 'hand')
          moveCardBetweenZones(g, discard, 0, hand, hand.cards.length, 'gain')
          messages.push(`Moved ${getCard(gained).name} to hand`)
        } else {
          const deck = getPlayerCardInstanceZone(g, p.id, 'deck')
          moveCardBetweenZones(g, discard, 0, deck, 0, 'gain')
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
      const maxCost = effect.bonusOverLastSelection === undefined
        ? effect.maxCost
        : Math.max(0, (resolution.lastSelectedCardCost ?? 0) + effect.bonusOverLastSelection)
      let candidates = marketPileChoices(g, effect.cardType).filter(candidate =>
        candidate.remaining > 0 && (maxCost === undefined ||
          getMarketCardCost(g, candidate.pileIndex, currentPlayerId) <= maxCost))
      if (effect.leastExpensive && candidates.length > 0) {
        const leastCost = Math.min(...candidates.map(candidate =>
          getMarketCardCost(g, candidate.pileIndex, currentPlayerId)))
        candidates = candidates.filter(candidate =>
          getMarketCardCost(g, candidate.pileIndex, currentPlayerId) === leastCost)
      }
      if (candidates.length === 0) {
        messages.push(maxCost === undefined
          ? `No ${effect.cardType ? `${effect.cardType} ` : ''}supply card is available`
          : `No ${effect.cardType ? `${effect.cardType} ` : ''}supply card costing ${maxCost} Aether or less is available`)
        continue
      }
      const prompt = maxCost === undefined
        ? `Choose a ${effect.cardType ? `${effect.cardType} ` : ''}supply card${effect.leastExpensive ? ' from the least expensive pile' : ''} to gain`
        : `Choose a ${effect.cardType ? `${effect.cardType} ` : ''}supply card costing ${maxCost} Aether or less${effect.leastExpensive ? ' from the least expensive pile' : ''} to gain`
      const decision = createDecision(g,
        prompt,
        'select_market_pile', { candidates, ...(effect.leastExpensive ? { emphasis: 'required' as const } : {}) }, resolution.sourceCardId)
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
      const tokenOwner = getPlayer(g, effect.playerId ?? resolution.sourceCardOwnerId ?? resolution.sourcePlayerId ?? currentPlayerId)
      const target = getPlayer(g, effect.playerId ?? currentPlayerId)
      const count = playerCardPowerTokenCount(tokenOwner, effect.cardId)
      if (count <= 0) {
        messages.push('No cards are required for this Power-token cost')
        continue
      }
      const candidates = getCardChoices(g, target.id, 'hand_or_discard')
        .filter(choice => getCard(choice.cardId).cannotBeDestroyed !== true)
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
      const castingPlayerId = resolution.effectPlayerId ?? resolution.sourcePlayerId ?? currentPlayerId
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

    if (effect.kind === 'discard_top_card') {
      let targets = getEffectPlayerTargets(g, resolution, currentPlayerId, effect.target)
      if (effect.targetAvailability === 'full_or_max') {
        targets = retainFullyResolvableOrMaximumTargets(targets, 1, target =>
          getPlayer(g, target.playerId).deck.length > 0 ? 1 : 0)
      }
      if (targets.length > 1) {
        const decision = createDecision(g, 'Choose a player to discard the top card of their deck',
          'select_player_target', { targets }, resolution.sourceCardId)
        messages.push(...pauseEffect(g, resolution, effect, decision))
        return messages
      }
      const target = getPlayer(g, targets[0]?.playerId ?? currentPlayerId)
      if (target.deck.length === 0) {
        messages.push(`${target.mageType} has no card to discard from the top of their deck`)
        continue
      }
      const deck = getPlayerCardInstanceZone(g, target.id, 'deck')
      const discard = getPlayerCardInstanceZone(g, target.id, 'discard')
      const moved = moveCardBetweenZones(g, deck, 0, discard, 0, 'discard', { reveal: true })
      messages.push(moved
        ? `${target.mageType} discards ${getCard(moved.cardId).name} from the top of their deck`
        : `${target.mageType} has no card to discard from the top of their deck`)
      continue
    }

    if (effect.kind === 'exile_cards') {
      let targets = getEffectPlayerTargets(g, resolution, currentPlayerId, effect.target ?? 'self')
      const eligibleFor = (playerId: string) => getCardChoices(g, playerId, effect.source).filter(choice => {
        const card = getCard(choice.cardId)
        return card.cannotBeExiled !== true &&
          (!effect.cardType || card.type === effect.cardType) &&
          (!effect.cardTypes || effect.cardTypes.includes(card.type)) &&
          card.cost >= (effect.minCost ?? 0) &&
          (!effect.discardTopOnly || choice.zone !== 'discard' || choice.index === 0)
      })
      if (effect.targetAvailability === 'full_or_max') {
        targets = retainFullyResolvableOrMaximumTargets(targets, effect.amount, target =>
          eligibleFor(target.playerId).length)
      }
      if (targets.length > 1) {
        const decision = createDecision(g, 'Choose a player to Exile cards from',
          'select_player_target', { targets }, resolution.sourceCardId)
        messages.push(...pauseEffect(g, resolution, effect, decision))
        return messages
      }
      const targetId = targets[0]?.playerId ?? currentPlayerId
      resolution.effectPlayerId = targetId
      let candidates = eligibleFor(targetId)
      if (effect.mostExpensive && candidates.length > 0) {
        const highestCost = Math.max(...candidates.map(choice => getCard(choice.cardId).cost))
        candidates = candidates.filter(choice => getCard(choice.cardId).cost === highestCost)
      }
      const amount = Math.min(Math.max(0, Math.floor(effect.amount)), candidates.length)
      if (amount === 0) {
        resolution.lastSelectedCardCount = 0
        resolution.lastSelectedCardCost = 0
        messages.push('No eligible cards are available to Exile')
        continue
      }
      if (candidates.length > amount || amount > 1) {
        const decision = createDecision(g, `Choose ${amount} card(s) to Exile`, 'select_cards',
          { source: effect.source, candidates, min: amount, max: amount }, resolution.sourceCardId)
        messages.push(...pauseEffect(g, resolution, effect, decision))
        return messages
      }
      const selected = candidates.slice(0, amount)
      const exiled = getNemesisCardInstanceZone(g, 'strike_deck')
      const moved: string[] = []
      for (const choice of selected) {
        const source = getPlayerCardInstanceZone(g, targetId, choice.zone)
        const card = moveCardBetweenZones(g, source, choice.index, exiled, 0, 'effect', { reveal: true })
        if (card) moved.push(card.cardId)
      }
      resolution.lastSelectedCardCount = moved.length
      resolution.lastSelectedCardCost = moved.length > 0
        ? Math.max(...moved.map(cardId => getCard(cardId).cost)) : 0
      messages.push(moved.length > 0
        ? `Exiled ${moved.map(cardId => getCard(cardId).name).join(', ')}`
        : 'No cards were Exiled')
      if (moved.length > 0) {
        addRemainingEffects(resolution, [{ kind: 'await_card_motions' }])
        return [...messages, ...runEffectResolution(g, resolution)]
      }
      continue
    }

    if (effect.kind === 'discard_cards') {
      const targetScope = effect.target ?? 'self'
      let targets = getEffectPlayerTargets(g, resolution, currentPlayerId, targetScope, effect.selection)
      const candidatesFor = (targetId: string) => {
        let candidates = getCardChoices(g, targetId, effect.source)
        .filter(choice => (!effect.cardType || getCard(choice.cardId).type === effect.cardType) &&
          (!effect.cardIds || effect.cardIds.includes(choice.cardId)) &&
          getCard(choice.cardId).cost >= (effect.minCost ?? 0))
        if (effect.mostExpensive && candidates.length > 0) {
          const highestCost = Math.max(...candidates.map(choice => getCard(choice.cardId).cost))
          candidates = candidates.filter(choice => getCard(choice.cardId).cost === highestCost)
        }
        return candidates
      }
      if (effect.targetAvailability === 'full_or_max') {
        targets = retainFullyResolvableOrMaximumTargets(targets, effect.maxAmount ?? effect.amount, target =>
          candidatesFor(target.playerId).length)
      }
      if (targets.length > 1) {
        let followupDrawAmount = 0
        if (!effect.restoreToSourceAfterSelection) {
          for (const followup of resolution.remainingEffects) {
            if (followup.kind !== 'draw_cards' || (followup.target ?? 'self') !== 'self' ||
              followup.relativeToSource || followup.relativeToSpellCaster) break
            followupDrawAmount += Math.max(0, followup.amount)
          }
        }
        const minAmount = Math.max(0, effect.minAmount ?? effect.amount)
        const maxAmount = Math.max(minAmount, effect.maxAmount ?? effect.amount)
        const decision = createDecision(g, 'Choose a player', 'select_player_target',
          {
            targets,
            playerDiscardAction: { minAmount, maxAmount, drawAmount: followupDrawAmount },
          }, resolution.sourceCardId,
        )
        messages.push(...pauseEffect(g, resolution, effect, decision))
        return messages
      }
      const discardPlayerId = targets[0]?.playerId ?? currentPlayerId
      resolution.effectPlayerId = discardPlayerId
      const candidates = candidatesFor(discardPlayerId)
      const fixedAmount = effect.minAmount === undefined && effect.maxAmount === undefined
      const min = Math.min(Math.max(0, effect.minAmount ?? effect.amount), candidates.length)
      const max = Math.min(Math.max(min, effect.maxAmount ?? effect.amount), candidates.length)
      if (max === 0) {
        resolution.lastSelectedCardCount = effect.sequentialProgress?.discarded ?? 0
        resolution.lastSelectedCardCost = effect.sequentialProgress?.highestCost ?? 0
        if (effect.restoreToSourceAfterSelection) {
          resolution.effectPlayerId = resolution.sourcePlayerId ?? currentPlayerId
        }
        messages.push('No cards available to discard')
        continue
      }
      const requestedMin = effect.minAmount ?? effect.amount
      const requestedMax = effect.maxAmount ?? effect.amount
      const sequentialHandDiscard = effect.source === 'hand' && requestedMin === requestedMax &&
        (effect.selectionMode === 'one_at_a_time' ||
          (effect.selectionMode !== 'together' && requestedMax > 1))
      if (sequentialHandDiscard) {
        const progress = effect.sequentialProgress ?? {
          remaining: min,
          discarded: 0,
          highestCost: 0,
        }
        const remaining = Math.min(progress.remaining, candidates.length)
        const automatic = autoSelectSameCardChoices(candidates, remaining)
        if (automatic) {
          const removed = discardSelectedCards(g, discardPlayerId, automatic, true)
          const discarded = progress.discarded + removed.length
          const highestCost = Math.max(progress.highestCost,
            ...removed.map(cardId => getCard(cardId).cost))
          const stillRequired = Math.max(0, progress.remaining - removed.length)
          resolution.lastSelectedCardCount = discarded
          resolution.lastSelectedCardCost = highestCost
          if (stillRequired > 0) {
            addRemainingEffects(resolution, [{
              ...effect,
              amount: stillRequired,
              minAmount: stillRequired,
              maxAmount: stillRequired,
              selectionMode: 'one_at_a_time',
              sequentialProgress: { remaining: stillRequired, discarded, highestCost },
            }])
          } else if (effect.restoreToSourceAfterSelection) {
            resolution.effectPlayerId = resolution.sourcePlayerId ?? currentPlayerId
          }
          messages.push(`Discarded ${removed.map(id => getCard(id).name).join(', ')}`)
          if (removed.length > 0) {
            addRemainingEffects(resolution, [{ kind: 'await_card_motions' }])
            return [...messages, ...runEffectResolution(g, resolution)]
          }
          continue
        }
        const sequenceEffect: CardEffect = {
          ...effect,
          selectionMode: 'one_at_a_time',
          sequentialProgress: progress,
        }
        const decision = createDecision(g,
          `Choose one card to discard (${remaining} remaining)`,
          'select_cards',
          { source: effect.source, candidates, min: 1, max: 1, layout: 'instant-card-choice' },
          resolution.sourceCardId,
        )
        messages.push(...pauseEffect(g, resolution, sequenceEffect, decision))
        return messages
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
      if (effect.restoreToSourceAfterSelection) {
        resolution.effectPlayerId = resolution.sourcePlayerId ?? currentPlayerId
      }
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
        .filter(choice => (effect.cardTypes ?? ['spell']).includes(getCard(choice.cardId).type) &&
          (effect.maxCost === undefined || getCard(choice.cardId).cost <= effect.maxCost))
      const max = Math.min(Math.max(0, effect.amount), candidates.length)
      if (max === 0) {
        messages.push('No eligible cards are available in the discard pile')
        continue
      }
      const min = Math.min(Math.max(0, effect.minAmount ?? 0), max)
      const prompt = min === max
        ? `Choose ${min} eligible card(s) to return to your hand`
        : `Choose up to ${max} eligible card(s) to return to your hand`
      const decision = createDecision(g, prompt, 'select_cards',
        { source: effect.source, candidates, min, max, layout: 'simple', targetHighlight: 'choice' }, resolution.sourceCardId,
      )
      messages.push(...pauseEffect(g, resolution, effect, decision))
      return messages
    }

    if (effect.kind === 'shuffle_discard_into_deck') {
      const targets = getEffectPlayerTargets(g, resolution, currentPlayerId, effect.target ?? 'self')
      if (targets.length > 1) {
        const decision = createDecision(g, 'Choose a player to shuffle their discard pile into their deck',
          'select_player_target', { targets }, resolution.sourceCardId,
        )
        messages.push(...pauseEffect(g, resolution, effect, decision))
        return messages
      }
      const target = getPlayer(g, targets[0]?.playerId ?? currentPlayerId)
      const movedCount = target.discard.length
      shufflePlayerDiscardIntoDeck(g, target)
      messages.push(`${target.mageType} shuffles their discard pile into their deck`)
      if (movedCount > 0) addRemainingEffects(resolution, [{ kind: 'await_card_motions' }])
      continue
    }

    if (effect.kind === 'destroy_top_cards') {
      const targets = getEffectPlayerTargets(g, resolution, currentPlayerId, effect.target ?? 'self')
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
          preparePlayerDeckForRevealWithInstances(g, target, 1)
        }
        const deck = getPlayerCardInstanceZone(g, target.id, 'deck')
        const cardId = destroyCardFromZone(g, deck, 0)
        if (!cardId) break
        destroyed.push(cardId)
      }
      messages.push(`${target.mageType} destroys ${destroyed.length} card(s) from the top of their deck`)
      if (destroyed.length > 0) addRemainingEffects(resolution, [{ kind: 'await_card_motions' }])
      continue
    }

    if (effect.kind === 'discard_prepped_spells') {
      let targets = getEffectPlayerTargets(g, resolution, currentPlayerId, effect.target ?? 'any_player', effect.selection)
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

    if (effect.kind === 'discard_prepped_spells_collectively') {
      const candidates = getPreppedSpellChoices(g)
      const amount = Math.min(Math.max(0, effect.amount), candidates.length)
      if (amount === 0) {
        messages.push('No prepped spells are available to discard collectively')
        continue
      }
      if (!effect.mostExpensive) {
        if (candidates.length === amount) {
          const discarded = discardPreppedSpellChoices(g, candidates)
          messages.push(`Players collectively discard prepped spell(s): ${discarded.join(', ')}`)
        } else {
          const decision = createDecision(g, `Choose ${amount} prepped spell(s) to discard collectively`,
            'select_prepped_spells', { candidates, min: amount, max: amount }, resolution.sourceCardId)
          messages.push(...pauseEffect(g, resolution, effect, decision))
          return messages
        }
        continue
      }
      const ordered = [...candidates].sort((a, b) =>
        (getPreppedSpellCost(g, b.playerId, b.breachIndex, b.spellIndex) ?? 0) -
        (getPreppedSpellCost(g, a.playerId, a.breachIndex, a.spellIndex) ?? 0))
      const cutoffCost = getPreppedSpellCost(g, ordered[amount - 1]!.playerId,
        ordered[amount - 1]!.breachIndex, ordered[amount - 1]!.spellIndex) ?? 0
      const required = ordered.filter(choice =>
        (getPreppedSpellCost(g, choice.playerId, choice.breachIndex, choice.spellIndex) ?? 0) > cutoffCost)
      const tied = ordered.filter(choice =>
        (getPreppedSpellCost(g, choice.playerId, choice.breachIndex, choice.spellIndex) ?? 0) === cutoffCost)
      const remaining = amount - required.length
      if (tied.length > remaining) {
        const decision = createDecision(g, `Choose ${amount} prepped spell(s) to discard collectively`,
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
      messages.push(`Players collectively discard prepped spell(s): ${discarded.join(', ')}`)
      continue
    }

    if (effect.kind === 'destroy_cards') {
      if (effect.source === 'self') {
        // During an on-cast effect, "self" means the spell being cast. The
        // sourceCardId can still belong to the relic or Mage ability that
        // initiated the cast, so the pending spell context must take priority.
        const pendingCast = resolution.pendingSpellCast?.cardId === resolution.sourceCardId
          ? resolution.pendingSpellCast
          : undefined
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
        const sourcePlayerId = castOwner?.id ?? resolution.sourceCardOwnerId ?? currentPlayerId
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
      const targetContextPlayerId = effect.target === 'ally'
        ? resolution.sourcePlayerId ?? currentPlayerId
        : currentPlayerId
      const targetRefs = getSelectedPlayerTargets(g, targetContextPlayerId, effect.target ?? 'self')
      if (targetRefs.length > 1) {
        const decision = createDecision(g, 'Choose a player to destroy a card', 'select_player_target',
          { targets: targetRefs }, resolution.sourceCardId)
        messages.push(...pauseEffect(g, resolution, effect, decision))
        return messages
      }
      const targetPlayerId = targetRefs[0]?.playerId ?? currentPlayerId
      resolution.effectPlayerId = targetPlayerId
      const candidates = getCardChoices(g, targetPlayerId, source)
        .filter(choice => getCard(choice.cardId).cannotBeDestroyed !== true &&
          (!effect.cardType || getCard(choice.cardId).type === effect.cardType) &&
          (!effect.cardTypes || effect.cardTypes.includes(getCard(choice.cardId).type)) &&
          getCard(choice.cardId).cost >= (effect.minCost ?? 0))
      const max = Math.min(Math.max(0, effect.maxAmount ?? 1), candidates.length)
      if (max === 0) {
        resolution.lastSelectedCardCount = 0
        resolution.lastSelectedCardCost = 0
        if (effect.restoreToSourceAfterSelection) {
          resolution.effectPlayerId = resolution.sourcePlayerId ?? currentPlayerId
        }
        messages.push('No cards available to destroy')
        continue
      }
      const min = Math.min(Math.max(0, effect.minAmount ?? 0), max)
      const prompt = effect.prompt ?? (min > 0
        ? `Choose ${min} card(s) to destroy`
        : `Choose up to ${max} card(s) to destroy`)
      const decision = createDecision(g, prompt,
        'select_cards', {
          source, candidates, min, max,
          ...(source !== 'hand' && (effect.cardType !== undefined || effect.cardTypes !== undefined || effect.minCost !== undefined)
            ? { targetHighlight: 'choice' as const }
            : {}),
          layout: 'simple',
        }, resolution.sourceCardId,
      )
      messages.push(...pauseEffect(g, resolution, effect, decision))
      return messages
    }

    if (effect.kind === 'resolve_simultaneous_effects') {
      const groups = effect.groups.filter(group => group.effects.length > 0)
      if (groups.length === 0) continue
      if (groups.length === 1) {
        addRemainingEffects(resolution, groups[0]!.effects)
        continue
      }
      const decision = createDecision(g,
        'Choose the first simultaneous effect to resolve',
        'choose_one',
        {
          options: groups.map(group => ({
            id: group.id,
            label: `${group.sourceLabel}: ${group.effectLabel}`,
          })),
        },
        resolution.sourceCardId,
      )
      messages.push(...pauseEffect(g, resolution, effect, decision))
      return messages
    }

    if (effect.kind === 'choose_one') {
      if (effect.options.length === 0) continue
      const choicePlayerId = resolution.effectPlayerId ?? currentPlayerId
      const availableOptionIds = availableCardEffectOptionIds(effect.options, condition =>
        conditionMatches(g, choicePlayerId, condition, resolution))
      if (effect.options.length === 1) {
        const option = effect.options[0]!
        if (availableOptionIds.has(option.id)) addRemainingEffects(resolution, option.effects)
        else messages.push('No effect option is currently available')
        continue
      }
      if (availableOptionIds.size === 1) {
        const onlyAvailableOption = effect.options.find(option => availableOptionIds.has(option.id))
        if (onlyAvailableOption?.autoSelectIfSoleAvailable) {
          addRemainingEffects(resolution, onlyAvailableOption.effects)
          continue
        }
      }
      const options: CardEffectOption[] = effect.options
      const decision = createDecision(g, effect.prompt, 'choose_one',
        {
          options: options.map(option => ({
            id: option.id,
            label: option.label,
            cardId: option.cardId,
            regionId: option.regionId,
            disabled: !availableOptionIds.has(option.id),
          })),
          layout: effect.layout,
        }, resolution.sourceCardId,
      )
      messages.push(...pauseEffect(g, resolution, effect, decision))
      return messages
    }

    if (effect.kind === 'choose_optional') {
      if (effect.skipIfUnavailable && (
        !optionalEffectAvailable(g, currentPlayerId, effect.effects, resolution.sourcePlayerId ?? currentPlayerId) ||
        (effect.acceptCondition !== undefined &&
          !conditionMatches(g, currentPlayerId, effect.acceptCondition, resolution))
      )) {
        resolution.lastOptionalAccepted = false
        messages.push('This optional effect is unavailable')
        continue
      }
      const acceptDisabled = Boolean(
        (effect.acceptCondition !== undefined &&
          !conditionMatches(g, currentPlayerId, effect.acceptCondition, resolution)) ||
        (effect.disableIfUnavailable &&
          !optionalEffectAvailable(g, currentPlayerId, effect.effects, resolution.sourcePlayerId ?? currentPlayerId)),
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
      const pending = resolution.pendingSpellCast
      const bonus = (resolution.spellDamageBonus ?? 0) + (resolution.spellAdditionalDamageBonus ?? 0)
      // A chosen Cast branch can contain no damage effect at all. Treat that
      // cast as one zero-base damage instance so its Breach/other cast bonus
      // still resolves through the regular target and damage rules.
      if (pending && !pending.fallbackDamageAttempted &&
        (pending.damageInstancesResolved ?? 0) === 0 && bonus > 0) {
        pending.fallbackDamageAttempted = true
        addRemainingEffects(resolution, [
          { kind: 'deal_damage', amount: 0, target: 'nemesis_or_minion' },
          effect,
        ])
        continue
      }
      // Damage bonuses modify damage explicitly dealt by the spell. They do
      // not create a second damage event if the spell already resolved one.
      resolution.spellDamageBonus = undefined
      resolution.spellAdditionalDamageBonus = undefined
      resolution.effectPlayerId = undefined
      continue
    }

    if (effect.kind === 'place_cast_spell_in_ally_hand') {
      const pending = resolution.pendingSpellCast
      if (!pending) {
        messages.push('No Transfer spell is pending')
        continue
      }
      const casterPlayerId = pending.casterPlayerId ?? pending.playerId
      const allies = getPlayerTargets(g, casterPlayerId, 'ally')
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
        if ((pending.transferToAlly || pending.returnToCasterHand) && breach) {
          const source = getBreachCardInstanceZone(g, pending.playerId, pending.breachIndex)
          const instanceId = ensurePendingSpellCastInstanceId(g, pending) ?? null
          const spellIndex = instanceId
            ? source.instanceIds.indexOf(instanceId)
            : pending.spellIndex
          if (spellIndex >= 0 && source.cards[spellIndex] === pending.cardId) {
            const destinationPlayerId = pending.transferToAlly
              ? pending.destinationPlayerId ?? pending.playerId
              : pending.casterPlayerId ?? pending.playerId
            const hand = getPlayerCardInstanceZone(g, destinationPlayerId, 'hand')
            moveCardBetweenZones(g, source, spellIndex, hand, hand.cards.length, 'return', {
              handPreppedSpellInstanceId: instanceId,
            })
          }
        }
      }
      const continuedSelection = resolution.preppedSpellSelectionStack?.pop()
      resolution.selectedPreppedSpell = continuedSelection ?? undefined
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
          const casterId = resolution.sourcePlayerId ?? effectPlayerId(g, resolution)
          if (effect.ownerScope === 'ally') {
            candidates = candidates.filter(candidate => candidate.playerId !== casterId)
          } else if (effect.ownerScope === 'self') {
            candidates = candidates.filter(candidate => candidate.playerId === casterId)
          }
          if (effect.minCost !== undefined || effect.maxCost !== undefined) {
            candidates = candidates.filter(candidate => {
              const cost = getPreppedSpellCost(g, candidate.playerId, candidate.breachIndex, candidate.spellIndex)
              return cost !== null && (effect.minCost === undefined || cost >= effect.minCost) &&
                (effect.maxCost === undefined || cost <= effect.maxCost)
            })
          }
          if (candidates.length === 0) {
            messages.push('No prepped spell is available')
            continue
          }
          const decision = effect.allowSkip
            ? createDecision(g, 'Choose a prepped spell to cast, or skip', 'select_prepped_spells',
              { candidates, min: 0, max: 1, confirmSelection: true }, resolution.sourceCardId)
            : createDecision(g, 'Choose a prepped spell to cast', 'select_prepped_spell',
              { candidates }, resolution.sourceCardId)
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
          { candidates: [choice], repeat: effect.repeatConfirmation === true }, resolution.sourceCardId,
        )
        messages.push(...pauseEffect(g, resolution, effect, decision))
        return messages
      }
      resolution.confirmedPreppedSpell = undefined
      // Save the selection that was active before this cast. Cast effects can
      // be nested (for example Debug Tools -> Infernal Cascade -> another
      // prepped spell), so each finalize step restores its own prior value.
      resolution.preppedSpellSelectionStack ??= []
      resolution.preppedSpellSelectionStack.push(resolution.selectedPreppedSpell ?? null)
      // A selected spell is scoped to this cast effect. Do not let the
      // selection from a generic/debug cast leak into an on-cast effect that
      // asks for another prepped spell. Repeated casts intentionally retain
      // the choice until the repeat has been confirmed.
      if (effect.source !== 'any_prepped_spell' || (effect.times ?? 1) <= 1) {
        resolution.selectedPreppedSpell = undefined
      } else if ((effect.times ?? 1) > 1) {
        resolution.selectedPreppedSpell = choice
        resolution.confirmedPreppedSpell = choice
      }
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
      // A spell may be prepped by another player. The Mage who initiated this
      // cast effect is still its caster, even if an earlier effect temporarily
      // changed effectPlayerId to a target Mage.
      const casterPlayerId = resolution.sourcePlayerId ?? effectPlayerId(g, resolution)
      const outerContext = captureEffectContext(resolution)
      const source = getBreachCardInstanceZone(g, choice.playerId, choice.breachIndex)
      resolution.pendingSpellCast = {
        playerId: choice.playerId,
        casterPlayerId,
        breachIndex: choice.breachIndex,
        spellIndex: choice.spellIndex,
        cardId: choice.cardId,
        instanceId: source.instanceIds[choice.spellIndex],
        discard: effect.discard !== false && !effect.returnToCasterHand && !(breach.special === 'transfer' && breach.opened),
        transferToAlly: !effect.returnToCasterHand && breach.special === 'transfer' && breach.opened,
        returnToCasterHand: effect.returnToCasterHand,
        faceDown,
      }
      ensurePendingSpellCastInstanceId(g, resolution.pendingSpellCast)
      resolution.sourcePlayerId = casterPlayerId
      resolution.sourceCardOwnerId = choice.playerId
      resolution.sourceCardId = choice.cardId
      getPlayer(g, casterPlayerId).spellsCastThisTurn = (getPlayer(g, casterPlayerId).spellsCastThisTurn ?? 0) + 1
      discardPendingSpellCast(g, resolution)
      resolution.pendingSpellCast.casterPlayerId = casterPlayerId
      resolution.effectPlayerId = casterPlayerId
      const spellCost = getPreppedSpellCost(g, choice.playerId, choice.breachIndex, choice.spellIndex) ?? card.cost
      resolution.spellDamageBonus = spellBreachDamageBonus(breach) + turnSpellDamageBonus(g, casterPlayerId, spellCost)
      resolution.spellAdditionalDamageBonus = Math.max(0, effect.bonusDamage ?? 0)
      const spellContext = captureEffectContext(resolution)
      const spellEffects: CardEffect[] = faceDown
        ? [{ kind: 'deal_damage', amount: 2, target: 'nemesis_or_minion' } satisfies CardEffect]
        : matchingBlocks(choice.cardId, choice.playerId, g, { kind: 'on_cast' }, undefined,
          casterPlayerId, undefined, casterPlayerId).flatMap(block => contextualizeCardEffectBlock(
            block, choice.cardId, choice.playerId, casterPlayerId, spellContext,
          ))
      const afterSpellCastEffects = resolveSimultaneousEffectGroups(
        breachOnCastEffects(g, spellOwner, breach, casterPlayerId, spellContext),
      )
      addRemainingEffects(resolution, [
        ...spellEffects,
        ...afterSpellCastEffects,
        ...(resolution.pendingSpellCast.transferToAlly ? [{ kind: 'place_cast_spell_in_ally_hand' } satisfies CardEffect] : []),
        { kind: 'resolve_spell_damage_bonus' },
        { kind: 'finalize_spell_cast' },
        outerContext,
        ...((effect.times ?? 1) > 1
          ? [{
            ...effect,
            times: effect.times! - 1,
            // `discard: false` is an exception for this cast only. A repeated
            // cast is a new cast and therefore uses the normal discard rule.
            discard: effect.discard === false ? undefined : effect.discard,
            // Every repeated cast needs a fresh player confirmation, even if
            // the original effect did not opt into the older flag explicitly.
            repeatConfirmation: true,
          }]
          : []),
      ])
      if ((effect.times ?? 1) > 1) {
        // The next cast is still the same selected card, but it must be
        // explicitly confirmed by the player before resolving.
        resolution.confirmedPreppedSpell = undefined
      }
      messages.push(`Cast ${card.name}${effect.discard === false ? ' without discarding it' : ''}`)
      continue
    }
  }

  if (!g.gameOver && resolution.afterAbilityPlayerId && resolution.remainingEffects.length === 0) {
    const abilityPlayerId = resolution.afterAbilityPlayerId
    resolution.afterAbilityPlayerId = undefined
    resolution.effectPlayerId = abilityPlayerId
    const effects = collectPlayerCardTriggerEffects(
      g, { kind: 'on_ability_resolved' }, abilityPlayerId, captureEffectContext(resolution),
    )
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
}
