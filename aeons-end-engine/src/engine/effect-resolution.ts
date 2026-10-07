import type { BreachChoice, CardEffect, CardEffectOption, CardSelectionSource, CardZone, GameState, NemesisCardDef, PendingEffectResolution } from '../types'
import type { SpendType } from './aether'
import type { EffectResolutionServices } from '../engine'
import { gainPlayerCharge } from './charge-feedback'
import { addCardToHand, addCardsToHand } from './player-state'
import {
  drawPlayerDeckCards, preparePlayerDeckForRevealWithInstances, putPlayerCardInDeck,
  rememberOwnedTrinketInstance, returnCorruptionToBottom,
  shufflePlayerDiscardIntoDeck, shufflePlayerHandIntoDeck, takeCorruptionFromDeck,
  takeOwnedTrinketInstance, takePlayerDeckCard,
} from './zones'
import {
  createCardInstance, ensureCardInstanceZone, findCardInstanceId, insertCardInstanceAt, markCardInstanceRevealed,
  removeCardInstanceAt,
} from './card-instances'

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
    destroyOwnedCard,
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
    optionalCardSelectionAvailable,
    pauseEffect,
    pauseRevealTopCard,
    pendingDecision,
    playerCardPowerTokenCount,
    putPlayerCardIntoPlay,
    queuePlayerExhaustion,
    rememberSpecificDeckCard,
    rememberSpecificDeckTop,
    removeCardFromHand,
    removePlayerCardFromPlay,
    removePreppedSpellAt,
    removeResolvingCardForSwap,
    replenishTurnOrderDeckForReveal,
    resetBreachToStartingPosition,
    resolveSimultaneousEffectGroups,
    returnSelectedCard,
    returnStrikeCardToDeck,
    shuffle,
    spellBreachDamageBonus,
    spendAether,
    sufferPlayerDamage,
    toRoman,
    turnSpellDamageBonus,
    MAGES,
    MAX_PULSE_TOKENS
  } = services

  return function runEffectResolution(
  g: GameState, resolution: PendingEffectResolution,
): string[] {
  const messages: string[] = []
  g.pendingEffect = null
  if (resolution.sourceCardOwnerId === undefined && resolution.sourceCardId) {
    resolution.sourceCardOwnerId = resolution.pendingSpellCast?.cardId === resolution.sourceCardId
      ? resolution.pendingSpellCast.playerId
      : resolution.sourcePlayerId
  }
  discardPendingSpellCast(g, resolution)

  // Stop a compound effect as soon as any of its steps ends the game. Without
  // this condition, a lethal Gravehold damage step could fall through to the
  // next Nemesis card or continue resolving later effects in the same frame.
  while (!g.gameOver && resolution.remainingEffects.length > 0) {
    const effect = resolution.remainingEffects.shift()!
    const currentPlayerId = effectPlayerId(g, resolution)
    const p = getPlayer(g, currentPlayerId)

    if (effect.kind === 'restore_effect_context') {
      resolution.sourcePlayerId = effect.sourcePlayerId
      resolution.sourceCardOwnerId = effect.sourceCardOwnerId
      resolution.sourceCardId = effect.sourceCardId
      resolution.effectPlayerId = effect.effectPlayerId
      resolution.pendingSpellCast = effect.pendingSpellCast ? { ...effect.pendingSpellCast } : undefined
      if (!effect.preserveSpellDamageState) {
        resolution.spellDamageBonus = effect.spellDamageBonus
        resolution.spellAdditionalDamageBonus = effect.spellAdditionalDamageBonus
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
        const corruptionId = takeCorruptionFromDeck(g)
        if (!corruptionId) {
          missed++
          continue
        }
        if (effect.destination === 'hand') addCardToHand(recipient, corruptionId)
        else if (effect.destination === 'deck_top') putPlayerCardInDeck(g, recipient, corruptionId, 'top')
        else putPlayerCardInDeck(g, recipient, corruptionId, 'bottom')
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
        const corruptionId = takeCorruptionFromDeck(g)
        if (!corruptionId) messages.push(dealDamage(g, { kind: 'gravehold', id: 'gravehold', label: 'Gravehold' }, 2))
        else if (effect.destination === 'hand') addCardToHand(recipient, corruptionId)
        else if (effect.destination === 'deck_top') putPlayerCardInDeck(g, recipient, corruptionId, 'top')
        else putPlayerCardInDeck(g, recipient, corruptionId, 'bottom')
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
      const cardId = effect.kind === 'destroy_source_corruption' ? resolution.sourceCardId : effect.cardId
      if (cardId && getCard(cardId).type === 'corruption' && g.nemesis.corruptionDeck) {
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
      const stinger = g.nemesis.playArea.find(card => card.cardType === 'minion' && card.cardId === resolution.sourceCardId)
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
      const stinger = g.nemesis.playArea.find(card => card.cardType === 'minion' && card.cardId === resolution.sourceCardId)
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
      for (const index of crystalIndices.sort((a, b) => b - a)) target.discard.unshift(target.hand.splice(index, 1)[0]!)
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
      for (let index = 0; index < Math.max(0, effect.amount); index++) {
        const removed = removeCardInstanceAt(g, g.nemesis.deck, g.nemesis.deckInstanceIds ??= [], 0)
        const cardId = removed?.cardId
        if (!cardId || !removed) break
        discarded.push(cardId)
        if ((getCard(cardId) as NemesisCardDef).tier === 3) tierThree++
        insertCardInstanceAt(g, g.nemesis.discard, g.nemesis.discardInstanceIds ??= [], removed, 0, true)
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
          const corruptionId = takeCorruptionFromDeck(g)
          if (!corruptionId) {
            messages.push(dealDamage(g, { kind: 'gravehold', id: 'gravehold', label: 'Gravehold' }, 2))
            continue
          }
          putPlayerCardInDeck(g, recipient, corruptionId, 'top')
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
        const targets = getPlayerTargets(g, currentPlayerId, 'any_player')
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
      const amount = effect.roundUp === false ? Math.floor(cost / effect.divisor) : Math.ceil(cost / Math.max(1, effect.divisor))
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
      const trinkets = ensureTrinketDeckState(g)
      for (let index = 0; index < removed.length; index++) {
        const selected = candidates[index]
        const cardId = trinkets.cards.shift()
        trinkets.revealed.shift()
        const instanceId = trinkets.instanceIds.shift()
        if (selected && cardId) {
          const recipient = getPlayer(g, selected.playerId)
          addCardToHand(recipient, cardId)
          if (instanceId) rememberOwnedTrinketInstance(recipient, instanceId)
        }
      }
      messages.push(`Discarded ${removed.map(id => getCard(id).name).join(', ')}; each player gains a Trinket into hand`)
      continue
    }

    if (effect.kind === 'return_three_minions_from_nemesis_discard') {
      g.nemesis.discardInstanceIds ??= []
      const selected = g.nemesis.discard.flatMap((cardId, index) => getCard(cardId).type === 'minion' ? [{ cardId, index }] : []).slice(0, 3)
      if (selected.length === 0) {
        messages.push('No Minions are in the Nemesis discard pile')
        continue
      }
      const removedByIndex = new Map<number, { cardId: string; instanceId: string; revealed: boolean }>()
      for (const item of [...selected].sort((left, right) => right.index - left.index)) {
        const removed = removeCardInstanceAt(g, g.nemesis.discard, g.nemesis.discardInstanceIds, item.index)
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
          ...(definition.nemesisTokens != null ? { nemesisTokens: definition.nemesisTokens } : {}),
        })
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
      const drawn = drawCardsForPlayer(g, target.id, effect.amount)
      messages.push(`${target.mageType} shuffles their hand into their deck and draws ${drawn} card(s)`)
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
      const { cards, revealed, instanceIds } = ensureTrinketDeckState(g)
      const amount = Math.max(0, Math.floor(effect.amount))
      const gainedCards: string[] = []
      for (let index = 0; index < amount; index++) {
        const cardId = cards.shift()
        if (!cardId) break
        revealed.shift()
        const instanceId = instanceIds.shift()
        if (instanceId) rememberOwnedTrinketInstance(recipient, instanceId)
        if (effect.destination === 'deck_top') putPlayerCardInDeck(g, recipient, cardId, 'top')
        else recipient.discard.unshift(cardId)
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
          const cardsInDestination = source === 'deck' ? recipient.deck : recipient.discard
          const index = cardsInDestination.indexOf(choices[0]!)
          if (index >= 0) addCardToHand(recipient, cardsInDestination.splice(index, 1)[0]!)
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
      addCardToHand(owner, source.splice(index, 1)[0]!)
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
      const cardId = deckOwner.specificDeck?.shift()
      if (!cardId) {
        messages.push(`${MAGES[deckOwner.mageType]?.specificDeckName ?? 'Mage-specific deck'} is empty`)
        continue
      }
      forgetSpecificDeckCard(deckOwner, cardId)
      const receiver = getPlayer(g, targets[0]!.playerId)
      if (effect.destination === 'deck_top') putPlayerCardInDeck(g, receiver, cardId, 'top')
      else receiver.discard.unshift(cardId)
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
      p.specificDeckInstanceIds = ensureCardInstanceZone(g, p.specificDeck!, p.specificDeckInstanceIds)
      p.specificDeckInstanceIds.shift()
      p.specificDeck!.shift()
      forgetSpecificDeckCard(p, cardId)
      p.discard.unshift(cardId)
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
      const instanceIds = ensureCardInstanceZone(g, deckOwner.specificDeck!, deckOwner.specificDeckInstanceIds)
      deckOwner.specificDeckInstanceIds = instanceIds
      const topInstanceId = instanceIds.shift()
      deckOwner.specificDeck!.shift()
      deckOwner.specificDeck!.push(cardId)
      if (topInstanceId) instanceIds.push(topInstanceId)
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
      const instanceIds = ensureCardInstanceZone(g, owner.specificDeck!, owner.specificDeckInstanceIds)
      owner.specificDeckInstanceIds = instanceIds
      instanceIds.shift()
      const incoming = owner.specificDeck!.shift()!
      owner.specificDeck!.push(chosen.cardId)
      owner.specificDeckInstanceIds = ensureCardInstanceZone(g, owner.specificDeck!, instanceIds)
      rememberSpecificDeckCard(g, owner, chosen.cardId, owner.specificDeck!.length - 1)
      owner.playerCardsInPlay!.splice(chosen.index, 1)
      owner.playerCardSupplyTargets?.splice(chosen.index, 1)
      owner.playerCardPowerTokens?.splice(chosen.index, 1)
      rememberSpecificDeckTop(g, owner)
      addRemainingEffects(resolution, putPlayerCardIntoPlay(
        g, owner.id, incoming, resolution.sourcePlayerId ?? currentPlayerId, captureEffectContext(resolution),
      ))
      messages.push(`Exchanged ${chosen.cardName} for ${getCard(incoming).name} from Tressa's Vault`)
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
      if (conditionMatches(g, currentPlayerId, effect.condition, resolution)) addRemainingEffects(resolution, effect.effects)
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
      const cardId = takePlayerDeckCard(g, owner)
      if (!cardId) {
        messages.push(`${owner.mageType} has no card available to Conjure`)
        continue
      }
      const candidates: BreachChoice[] = owner.breaches
        .filter(breach => canConjureToBreach(g, owner, breach, effect.breachEligibility))
        .map(breach => ({
          playerId: owner.id,
          breachIndex: breach.index,
          playerName: owner.mageType,
          focusCost: breach.focusCost,
          focusCount: breach.focusCount,
          focusToOpen: breach.focusToOpen,
        }))
      resolution.conjuredCard = { playerId: owner.id, cardId }
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
      addCardToHand(owner, owner.discard.splice(index, 1)[0]!)
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
      // The first cast in a repeated hand-spell effect is the explicit
      // "without discarding it" exception. The final cast is a normal cast,
      // so move the physical card to its owner's discard before resolving its
      // Cast text. This mirrors the timing used for spells cast from Breaches.
      const discardThisCast = effect.remaining <= 1
      if (discardThisCast) {
        const removed = removeCardFromHand(owner, index)
        if (removed.cardId !== effect.cardId) {
          messages.push('The selected ally spell is no longer in hand')
          continue
        }
        owner.discard.unshift(removed.cardId)
      }
      const outerContext = captureEffectContext(resolution)
      const casterPlayerId = resolution.sourcePlayerId ?? currentPlayerId
      resolution.pendingSpellCast = {
        playerId: effect.playerId, casterPlayerId, breachIndex: -1, spellIndex: -1,
        cardId: effect.cardId, discard: false,
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
        ...(effect.remaining > 1 ? [{ kind: 'cast_selected_spell_from_hand', playerId: effect.playerId, cardId: effect.cardId, remaining: effect.remaining - 1 } satisfies CardEffect] : []),
      ])
      messages.push(`Cast ${getCard(effect.cardId).name} from an ally's hand${discardThisCast ? '' : ' without discarding it'}`)
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
      const instanceId = resolutionState.drawnCardInstanceId
        ?? createCardInstance(g, cardId, true).instanceId
      insertCardInstanceAt(g, g.nemesis.discard, g.nemesis.discardInstanceIds ??= [], {
        cardId, instanceId, revealed: true,
      }, 0, true)
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
      owner.playedThisTurn.splice(playedIndex, 1)
      const { cards, revealed, instanceIds } = ensureTrinketDeckState(g)
      const returnedInstanceId = takeOwnedTrinketInstance(g, owner, cardId)
        ?? createCardInstance(g, cardId, true).instanceId
      markCardInstanceRevealed(g, returnedInstanceId)
      cards.push(cardId)
      revealed.push(true)
      instanceIds.push(returnedInstanceId)
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
      const targets = getEffectPlayerTargets(g, resolution, currentPlayerId, effect.target)
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
      g.nemesis.playArea.push({
        cardId, cardType: 'minion', placedAt, instanceId: removed.instanceId,
        enteredOnNemesisTurn: g.nemesis.nemesisTurnNumber,
        lifeTokens: definition.life ?? 0,
        ...(definition.nemesisTokens != null ? { nemesisTokens: definition.nemesisTokens } : {}),
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
      const drawnCards = drawPlayerDeckCards(g, target, Math.max(0, effect.drawAmount))
      addCardsToHand(target, drawnCards)
      if (g.currentTurn === target.id && (g.currentPhase === 'casting' || g.currentPhase === 'main')) {
        target.corruptionsDrawnThisTurn ??= []
        target.corruptionsDrawnThisTurn.push(...drawnCards.filter(cardId => getCard(cardId).type === 'corruption'))
      }
      resolution.effectPlayerId = target.id
      const candidates = getCardChoices(g, target.id, 'hand').map(choice => ({
        ...choice, highlight: 'required' as const,
      }))
      const max = Math.min(Math.max(0, effect.discardAmount), candidates.length)
      if (max === 0) {
        messages.push(`${target.mageType} draws ${drawnCards.length} card(s)`)
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
        resolution.remainingEffects.push(effect)
        continue
      }
      const amount = Math.floor(damageEffectAmountValue(
        g, currentPlayerId, effect.amount, effect.additionalDamage, resolution.sourceCardId, resolution,
      ))
      // A divided-damage effect is one pool. Apply cast-wide damage modifiers
      // once before the player allocates individual points among enemies.
      const damagePool = Math.floor(applySpellDamageBonus(resolution, amount))
      if (damagePool <= 0) continue
      if (targets.length === 1) {
        messages.push(dealNemesisTargetDamage(g, resolution, targets[0]!, damagePool))
        continue
      }
      resolution.dividedDamageAllocation = {
        total: damagePool,
        remaining: 0,
        target: effect.target,
        amounts: automaticallyAllocateDamage(g, targets, damagePool),
      }
      const decision = createDecision(g,
        `Review the ${damagePool} assigned damage, then click the Spell again to resolve`,
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
        resolution.remainingEffects.push(effect)
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
      const targets = effect.target === 'doom_owner'
        ? getSelectedDamagePlayerTargets(g, currentPlayerId, effect.target, effect.selection)
        : getEffectPlayerTargets(g, resolution, currentPlayerId, effect.target, effect.selection)
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
      const drawn = drawCardsForPlayer(g, target.id, effect.amount)
      resolution.effectPlayerId = effect.relativeToSource
        ? resolution.sourcePlayerId ?? target.id
        : target.id
      messages.push(`${target.mageType} draws ${drawn} card(s)`)
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
      removeCardFromHand(player, handIndex)
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
      owner.playedThisTurn.splice(index, 1)
      ensurePlayerCollections(owner)
      destroyOwnedCard(owner, effect.cardId, g)
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
      if (!removePlayerCardFromPlay(owner, effect.cardId)) {
        messages.push(`${getCard(effect.cardId).name} is no longer in Player cards in play`)
        continue
      }
      destroyOwnedCard(owner, effect.cardId, g)
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
          addCardToHand(p, gained)
          messages.push(`Moved ${getCard(gained).name} to hand`)
        } else {
          putPlayerCardInDeck(g, p, gained, 'top')
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

    if (effect.kind === 'discard_cards') {
      const targetScope = effect.target ?? 'self'
      const targets = getEffectPlayerTargets(g, resolution, currentPlayerId, targetScope, effect.selection)
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
      const candidates = getCardChoices(g, discardPlayerId, effect.source)
        .filter(choice => (!effect.cardType || getCard(choice.cardId).type === effect.cardType) &&
          (!effect.cardIds || effect.cardIds.includes(choice.cardId)) &&
          getCard(choice.cardId).cost >= (effect.minCost ?? 0))
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
      shufflePlayerDiscardIntoDeck(g, target)
      messages.push(`${target.mageType} shuffles their discard pile into their deck`)
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
        const cardId = takePlayerDeckCard(g, target)
        if (!cardId) break
        destroyOwnedCard(target, cardId, g)
        destroyed.push(cardId)
      }
      messages.push(`${target.mageType} destroys ${destroyed.length} card(s) from the top of their deck`)
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
        .filter(choice => (!effect.cardType || getCard(choice.cardId).type === effect.cardType) &&
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
            cardId: option.cardId,
            disabled: option.condition ? !conditionMatches(g, currentPlayerId, option.condition, resolution) : false,
          })),
          layout: effect.layout,
        }, resolution.sourceCardId,
      )
      messages.push(...pauseEffect(g, resolution, effect, decision))
      return messages
    }

    if (effect.kind === 'choose_optional') {
      if (effect.skipIfUnavailable && !optionalCardSelectionAvailable(g, currentPlayerId, effect.effects)) {
        resolution.lastOptionalAccepted = false
        messages.push('No eligible card is available for this effect')
        continue
      }
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
      // Damage bonuses modify damage explicitly dealt by the spell. They do
      // not create a new zero-base damage event or target-selection step.
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
        let preppedInstanceId: string | null = null
        if ((pending.transferToAlly || pending.returnToCasterHand) &&
          breach?.prepSpells[pending.spellIndex] === pending.cardId) {
          preppedInstanceId = breach.preppedSpellInstanceIds?.[pending.spellIndex] ?? null
          removePreppedSpellAt(breach, pending.spellIndex)
        }
        if (pending.transferToAlly) {
          addCardToHand(getPlayer(g, pending.destinationPlayerId ?? pending.playerId), pending.cardId, preppedInstanceId)
        }
        if (pending.returnToCasterHand) {
          addCardToHand(getPlayer(g, pending.casterPlayerId ?? pending.playerId), pending.cardId, preppedInstanceId)
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
      resolution.pendingSpellCast = {
        playerId: choice.playerId,
        casterPlayerId,
        breachIndex: choice.breachIndex,
        spellIndex: choice.spellIndex,
        cardId: choice.cardId,
        discard: effect.discard !== false && !effect.returnToCasterHand && !(breach.special === 'transfer' && breach.opened),
        transferToAlly: !effect.returnToCasterHand && breach.special === 'transfer' && breach.opened,
        returnToCasterHand: effect.returnToCasterHand,
        faceDown,
      }
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
          }]
          : []),
      ])
      if ((effect.times ?? 1) > 1 && effect.repeatConfirmation === true) {
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
