import type {
  CardChoice, CardEffect, CardSelectionSource, DamageTargetDecisionContinuation,
  DamageTargetRef, GameState, PendingDecisionAnswer,
} from '../types'
import { getCard, getStartingSupplyPileCount, MAGES } from '../data'
import { isPresentBreach } from './breaches'
import { marketPileChoices } from '../nemesis/market'
import { shuffle } from './decks'
import { createCardInstance, ensureCardInstanceZone } from './card-instances'
import {
  destroyCardFromZone, destroySelectedPlayerCards, getBreachAttachedRelicZone, getBreachCardInstanceZone,
  getNemesisCardInstanceZone, getPlayerCardInstanceZone, moveCardBetweenZones,
  moveCardToTemporary, moveSelectedPlayerCards, placeTemporaryCardInZone, recordCardMove,
} from './card-movement'
import { MAX_PULSE_TOKENS, createPreppedSpellInstanceId, ensurePlayerCollections, getPlayerTurnEffects } from './player-state'
import {
  getPlayer, putPlayerCardInDeck, putPlayerDeckInstancesOnTop,
  rememberOwnedTrinketInstance,
  takePlayerDeckInstancesAt,
} from './zones'
import {
  effectTargetPlayerId, gainLife, getDamageTargets, getEffectPlayerTargets, getPlayerTargets,
  getSelectedDamagePlayerTargets, getSelectedPlayerTargets, retainFullyResolvableOrMaximumTargets,
} from './targets'
import { availableCardEffectOptionIds } from './effect-conditions'
import type { DecisionResolutionServices } from '../engine'

function orderedByZoneRemoval(choices: CardChoice[]): CardChoice[] {
  const grouped = new Map<string, CardChoice[]>()
  for (const choice of choices) {
    const group = grouped.get(choice.zone) ?? []
    group.push(choice)
    grouped.set(choice.zone, group)
  }
  return [...grouped.values()].flatMap(group => [...group].sort((a, b) => b.index - a.index))
}

export function createDecisionResolver(services: DecisionResolutionServices) {
  const {
    addRemainingEffects,
    amountValue,
    applyFreeBreachFocus,
    applySpellDamageBonus,
    canConjureToBreach,
    captureEffectContext,
    cardChoiceMatches,
    cardNameMatchesAny,
    checkGameOver,
    checkPlayerDeath,
    collectBreachOpenedEffects,
    conditionMatches,
    contextualizeCardEffectBlock,
    continueNemesisDiscard,
    createDecision,
    damageEffectAmountValue,
    dealDamage,
    dealNemesisTargetDamage,
    destroyExhaustedBreach,
    devourMarketPile,
    discardCollectiveCards,
    discardPreppedSpellChoices,
    discardSelectedCards,
    drawCardsForPlayer,
    effectPlayerId,
    ensureTrinketDeckState,
    gainCard,
    gainPulseTokens,
    gainSwapZoneCard,
    getBreachChoices,
    getCardChoices,
    getExhaustBreachChoices,
    getMarketCardCost,
    getPreppedSpellCost,
    getSupplyPileGainEffects,
    losePulseTokens,
    matchingBlocks,
    moveGainedSupplyCardToDeck,
    pauseEffect,
    pauseRevealTopCard,
    pendingDecision,
    playerCardPowerTokenCount,
    putPlayerCardIntoPlay,
    queuePlayerExhaustion,
    recallBlockMarker,
    resolveMageSetups,
    rememberSpecificDeckCard,
    rememberSpecificDeckTop,
    resetBreachToStartingPosition,
    resolveDividedDamageAllocationAction,
    returnSelectedCard,
    runEffectResolution,
    selectedChoicesAreCurrent,
    selectedCollectiveCardsAreCurrent,
    setPendingDecision,
    setPlayerCardSupplyTarget,
    sufferPlayerDamage,
    toRoman,
  } = services

function resolvePendingDecision(
  g: GameState, decisionId: string, answer: PendingDecisionAnswer,
): string[] {
  const decision = g.pendingDecision

  function pauseForOracleNemesisTargetWarning(
    resumeDecision: DamageTargetDecisionContinuation,
    target: DamageTargetRef,
  ): boolean {
    const spellCardId = g.pendingEffect?.pendingSpellCast?.cardId
    if (target.kind !== 'nemesis' || g.nemesis.type !== 'oracle_of_filth' ||
      g.oracleOfFilthDamageTargetWarningConfirmed || !spellCardId || getCard(spellCardId).type !== 'spell') {
      return false
    }
    g.pendingDecision = createDecision(
      g,
      'All non-Vortex Blast spell cards deal 0 damage to the Nemesis. Are you sure you want to target the Nemesis?',
      'confirm_oracle_nemesis_damage_target',
      { target, resumeDecision },
      g.pendingEffect?.sourceCardId,
    )
    return true
  }

  if (decision?.kind === 'confirm_oracle_nemesis_damage_target') {
    if (decision.id !== decisionId || answer.kind !== 'confirm_oracle_nemesis_damage_target') {
      return ['Invalid Nemesis damage target confirmation']
    }
    const resumeDecision = decision.resumeDecision
    const stillAvailable = decision.target.kind === 'nemesis' &&
      resumeDecision.targets.some(target => target.kind === 'nemesis' && target.id === decision.target.id)
    if (!stillAvailable || !g.pendingEffect ||
      (g.pendingEffect.awaiting?.kind !== 'deal_damage' &&
        g.pendingEffect.awaiting?.kind !== 'deal_damage_divided')) {
      return ['The Nemesis damage target is no longer available']
    }
    if (!answer.accepted) {
      g.pendingDecision = resumeDecision
      return ['Nemesis damage target selection cancelled']
    }
    g.oracleOfFilthDamageTargetWarningConfirmed = true
    g.pendingDecision = resumeDecision
    if (resumeDecision.kind === 'select_damage_target') {
      return resolvePendingDecision(g, resumeDecision.id, {
        kind: 'select_damage_target', target: decision.target,
      })
    }
    return resolvePendingDecision(g, resumeDecision.id, {
      kind: 'allocate_divided_damage', action: 'add', targetId: decision.target.id,
    })
  }

  if (decision?.kind === 'select_damage_target' && answer.kind === 'select_damage_target') {
    if (decision.id !== decisionId) return ['Stale card decision']
    const target = decision.targets.find(candidate => candidate.id === answer.target.id)
    if (!target) return ['Invalid damage target']
    if (pauseForOracleNemesisTargetWarning(decision, target)) {
      return ['Confirmation required before targeting the Nemesis']
    }
  }

  if (decision?.kind === 'allocate_divided_damage') {
    if (decision.id !== decisionId || answer.kind !== 'allocate_divided_damage') {
      return ['Invalid divided damage allocation action']
    }
    if (answer.action === 'add') {
      const target = decision.targets.find(candidate => candidate.id === answer.targetId)
      if (target && pauseForOracleNemesisTargetWarning(decision, target)) {
        return ['Confirmation required before targeting the Nemesis']
      }
    }
    return resolveDividedDamageAllocationAction(g, decision, answer)
  }
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
    if (g.gameOver) {
      g.pendingDecision = null
      return [...messages, 'Increased difficulty setup complete']
    }
    if (remainingChoices <= 0) {
      g.pendingDecision = null
      return [...messages, 'Increased difficulty setup complete', ...resolveMageSetups(g)]
    }

    const candidates = marketPileChoices(g).filter(candidate => candidate.remaining > 0)
    if (candidates.length === 0) {
      g.pendingDecision = null
      return [...messages, 'No supply piles remain to complete setup', ...resolveMageSetups(g)]
    }
    g.pendingDecision = createDecision(g,
      `Choose a supply pile to Devour (${remainingChoices} remaining)`,
      'select_setup_devour_pile',
      { candidates, remainingChoices },
    )
    return messages
  }
  if (decision?.kind === 'select_setup_supply_replacement') {
    if (decision.id !== decisionId || answer.kind !== 'select_setup_supply_replacement') {
      return ['Invalid setup supply replacement choice']
    }
    const choice = decision.candidates.find(candidate =>
      candidate.pileIndex === answer.choice.pileIndex && candidate.cardId === answer.choice.cardId,
    )
    const pile = choice ? g.market.piles[choice.pileIndex] : null
    const replacementCard = getCard(decision.replacementCardId)
    if (!choice || !pile || pile.cardId !== choice.cardId || pile.remaining <= 0 ||
      getCard(choice.cardId).setupOnlyNemesisSupplyFor ||
      replacementCard.setupOnlyNemesisSupplyFor !== g.nemesis.type) {
      return ['The selected supply pile is no longer available for replacement']
    }
    pile.cardId = decision.replacementCardId
    pile.remaining = getStartingSupplyPileCount(replacementCard)
    const mechanics = [...new Set(g.market.piles.flatMap(marketPile => {
      const card = getCard(marketPile.cardId)
      return [...(card.mechanics ?? []), ...(card.developCost === undefined ? [] : ['develop' as const])]
    }))]
    g.supplyMechanics = mechanics
    g.hasSwapZone = mechanics.includes('swap') || g.players.some(player =>
      MAGES[player.mageType]?.hasSwapZone === true || (MAGES[player.mageType]?.swapZone?.length ?? 0) > 0,
    )
    g.hasDevelopZone = mechanics.includes('develop') || g.players.some(player =>
      MAGES[player.mageType]?.hasDevelopZone === true,
    )

    if (decision.nextReplacementCardId) {
      const candidates = marketPileChoices(g).filter(candidate =>
        candidate.remaining > 0 && !getCard(candidate.cardId).setupOnlyNemesisSupplyFor,
      )
      if (candidates.length > 0) {
        g.pendingDecision = createDecision(g,
          'Choose a supply pile to replace with Abyssal Vial',
          'select_setup_supply_replacement',
          {
            candidates,
            replacementCardId: decision.nextReplacementCardId,
            ...(decision.previewCardIds ? { previewCardIds: decision.previewCardIds } : {}),
          },
        )
        return [`Replaced ${getCard(choice.cardId).name} with ${getCard(decision.replacementCardId).name}`]
      }
    }
    g.pendingDecision = null
    return [
      `Replaced ${getCard(choice.cardId).name} with ${getCard(decision.replacementCardId).name}`,
      ...resolveMageSetups(g),
    ]
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

  if (answer.kind === 'confirm_revealed_card') {
    if (decision.kind !== 'confirm_revealed_card' ||
      effect.kind !== 'reveal_top_card_to_hand_if_spell' || !answer.accepted) {
      restore()
      return ['Invalid revealed card confirmation']
    }
    const revealed = resolution.revealedTopCard
    const player = revealed ? getPlayer(g, revealed.playerId) : null
    if (!revealed || !player || decision.playerId !== revealed.playerId ||
      decision.cardId !== revealed.cardId || player.deck[0] !== revealed.cardId) {
      restore()
      return ['The revealed card is no longer on top of the deck']
    }
    resolution.revealedTopCard = undefined
    if (getCard(revealed.cardId).type !== 'spell') {
      return [`${player.mageType} reveals ${getCard(revealed.cardId).name}; it remains on top of the deck`, ...runEffectResolution(g, resolution)]
    }
    const deck = getPlayerCardInstanceZone(g, player.id, 'deck')
    const hand = getPlayerCardInstanceZone(g, player.id, 'hand')
    moveCardBetweenZones(g, deck, 0, hand, hand.cards.length, 'reveal')
    return [`${player.mageType} reveals ${getCard(revealed.cardId).name} and puts it into their hand`, ...runEffectResolution(g, resolution)]
  } else if (answer.kind === 'confirm_prepped_effect') {
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
    if (effect.kind === 'choose_one') {
      const available = availableCardEffectOptionIds(effect.options, condition =>
        conditionMatches(g, effectPlayerId(g, resolution), condition, resolution))
      if (!available.has(answer.optionId)) {
        restore()
        return ['This choice is not available']
      }
    }
    if (selected?.disabled && effect.kind !== 'choose_one') {
      restore()
      return ['This choice is not available']
    }
    if (effect.kind === 'resolve_simultaneous_effects') {
      const selectedGroup = effect.groups.find(group => group.id === answer.optionId)
      if (!selectedGroup) {
        restore()
        return ['Invalid simultaneous effect choice']
      }
      const remainingGroups = effect.groups.filter(group => group.id !== selectedGroup.id)
      const continuation: CardEffect[] = remainingGroups.length > 1
        ? [{ kind: 'resolve_simultaneous_effects', groups: remainingGroups }]
        : remainingGroups.flatMap(group => group.effects)
      addRemainingEffects(resolution, [...selectedGroup.effects, ...continuation])
      return [`Resolving ${selectedGroup.sourceLabel} first`, ...runEffectResolution(g, resolution)]
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
        const deck = getPlayerCardInstanceZone(g, player.id, 'deck')
        const discard = getPlayerCardInstanceZone(g, player.id, 'discard')
        moveCardBetweenZones(g, deck, 0, discard, 0, 'discard')
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
  } else if (answer.kind === 'choose_token_amount') {
    if (decision.kind !== 'choose_token_amount' || effect.kind !== 'choose_token_amount') {
      restore()
      return ['Decision answer does not match the pending token amount choice']
    }
    const available = effect.token === 'pulse'
      ? Math.max(0, getPlayer(g, effectPlayerId(g, resolution)).pulseTokens ?? 0)
      : 0
    if (!Number.isInteger(answer.amount) || answer.amount < decision.minAmount ||
      answer.amount > decision.maxAmount || answer.amount > available) {
      restore()
      return [`Choose a whole number of ${effect.token} tokens from ${decision.minAmount} to ${decision.maxAmount}`]
    }
    resolution.lastChosenTokenAmount = answer.amount
    addRemainingEffects(resolution, effect.effects)
  } else if (answer.kind === 'place_specific_deck_card') {
    if (decision.kind !== 'place_specific_deck_card' ||
      effect.kind !== 'reveal_specific_deck' || effect.mode !== 'return_each') {
      restore()
      return ['Decision answer has the wrong type']
    }
    const reveal = resolution.specificDeckReveal
    const owner = reveal ? getPlayer(g, reveal.playerId) : null
    const selectedIndex = reveal
      ? answer.slot !== undefined
        ? reveal.cardSlots?.indexOf(answer.slot) ?? -1
        : reveal.cards.indexOf(answer.cardId)
      : -1
    if (!reveal || !owner || reveal.mode !== 'return_each' ||
      selectedIndex < 0 || !['top', 'bottom'].includes(answer.placement) ||
      decision.cards.length !== reveal.cards.length ||
      decision.cards.some((card, index) => card.cardId !== reveal.cards[index] ||
        card.slot !== (reveal.cardSlots?.[index] ?? index)) ||
      reveal.cards[selectedIndex] !== answer.cardId) {
      restore()
      return ['Invalid Mage-specific deck placement choice']
    }
    const [returned] = reveal.cards.splice(selectedIndex, 1)
    const [returnedInstanceId] = reveal.instanceIds?.splice(selectedIndex, 1) ?? []
    reveal.cardSlots?.splice(selectedIndex, 1)
    if (!returned) {
      restore()
      return ['The selected Mage-specific card is no longer available']
    }
    owner.specificDeckInstanceIds = ensureCardInstanceZone(g, owner.specificDeck!, owner.specificDeckInstanceIds)
    if (answer.placement === 'top') {
      owner.specificDeck!.unshift(returned)
      if (returnedInstanceId) owner.specificDeckInstanceIds.unshift(returnedInstanceId)
      else owner.specificDeckInstanceIds.unshift(ensureCardInstanceZone(g, [returned], undefined, true)[0]!)
    } else {
      owner.specificDeck!.push(returned)
      if (returnedInstanceId) owner.specificDeckInstanceIds.push(returnedInstanceId)
      else owner.specificDeckInstanceIds.push(ensureCardInstanceZone(g, [returned], undefined, true)[0]!)
    }
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
    } else if (effect.kind === 'resolve_mage_form_supply_gain') {
      if (effect.step !== 'offer') {
        restore()
        return ['Decision answer does not match the pending Mage Form choice']
      }
      if (answer.accepted) {
        addRemainingEffects(resolution, [{
          ...effect,
          step: effect.formSide === 'giver' ? 'choose_ally' : 'apply',
        }])
      }
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
      const instanceId = conjured.instanceId ?? createCardInstance(g, conjured.cardId, true).instanceId
      const deck = getPlayerCardInstanceZone(g, owner.id, 'deck')
      placeTemporaryCardInZone(g, instanceId, conjured.cardId,
        { zoneId: `temporary:conjure:${owner.id}`, zone: 'temporary', ownerId: owner.id, index: 0 },
        deck, 0, 'return', true)
      resolution.conjuredCard = undefined
    }
    if (!answer.choice) {
      putBack()
      return ['Conjured card returned to the top of the deck', ...runEffectResolution(g, resolution)]
    }
  const choice = decision.candidates.find(candidate =>
      candidate.playerId === answer.choice?.playerId && candidate.breachIndex === answer.choice?.breachIndex)
    const breach = choice && owner.breaches.find(item => item.index === choice.breachIndex)
    if (!choice || !breach || !canConjureToBreach(g, owner, breach, effect.breachEligibility)) {
      restore()
      return ['The selected Breach is no longer available for Conjure']
    }
    ensurePlayerCollections(owner)
    const instanceId = conjured.instanceId ?? createCardInstance(g, conjured.cardId, true).instanceId
    const breachZone = getBreachCardInstanceZone(g, owner.id, breach.index)
    placeTemporaryCardInZone(g, instanceId, conjured.cardId,
      { zoneId: `temporary:conjure:${owner.id}`, zone: 'temporary', ownerId: owner.id, index: 0 },
      breachZone, breachZone.cards.length, 'prep_spell', true)
    breach.preppedThisTurn ??= []
    breach.preppedThisTurn.push(true)
    breach.preppedSpellFaceDown ??= []
    breach.preppedSpellFaceDown.push(true)
    breach.preppedSpellInstanceIds ??= []
    resolution.conjuredCard = undefined
    return [`Conjured ${getCard(conjured.cardId).name} face-down on Breach ${toRoman(breach.index)}`, ...runEffectResolution(g, resolution)]
  } else if (answer.kind === 'select_prepped_spell') {
    if (decision.kind !== 'select_prepped_spell') {
      restore()
      return ['Decision answer has the wrong type']
    }
    if (!answer.choice) {
      if (!decision.allowSkip || (effect.kind !== 'cast_any_number_prepped_spells' &&
        !(effect.kind === 'cast_prepped_spell' && effect.allowSkip))) {
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
      (effect.kind !== 'focus_breach' && effect.kind !== 'focus_breach_all_players' && effect.kind !== 'reset_open_breach' && effect.kind !== 'attach_relic' && effect.kind !== 'destroy_breach')) {
      restore()
      return ['Decision answer has the wrong type']
    }
    const choice = decision.candidates.find(candidate =>
      candidate.playerId === answer.choice.playerId && candidate.breachIndex === answer.choice.breachIndex)
    if (!choice) {
      restore()
      return ['Invalid breach choice']
    }
    if (effect.kind === 'reset_open_breach') {
      const eligible = getSelectedPlayerTargets(g, resolution.sourcePlayerId ?? effectPlayerId(g, resolution), 'ally')
        .some(target => target.playerId === choice.playerId)
      const targetBreach = getPlayer(g, choice.playerId).breaches.find(breach => breach.index === choice.breachIndex)
      if (!eligible || !effect.breachIndices.includes(choice.breachIndex) || !targetBreach ||
        !isPresentBreach(targetBreach) || !targetBreach.opened) {
        restore()
        return ['The selected opened ally Breach is no longer available']
      }
      resetBreachToStartingPosition(targetBreach)
      resolution.effectPlayerId = choice.playerId
      return [`Reset ${getPlayer(g, choice.playerId).mageType}'s Breach ${toRoman(choice.breachIndex)} to its starting position`, ...runEffectResolution(g, resolution)]
    }
    if (effect.kind === 'attach_relic') {
      const targetBreach = getPlayer(g, choice.playerId).breaches.find(item => item.index === choice.breachIndex)
      const cardId = resolution.sourceCardId
      if (!targetBreach || !isPresentBreach(targetBreach) || targetBreach.attachedRelic || !cardId) {
        restore()
        return ['The selected Breach is no longer available for attachment']
      }

      const preferredOwnerId = resolution.sourcePlayerId ?? effectPlayerId(g, resolution)
      const preferredOwner = g.players.find(player => player.id === preferredOwnerId)
      if (resolution.sourceCardInHandPendingPlay) {
        const handIndex = resolution.sourceCardHandIndex
        const validIndex = handIndex !== undefined && preferredOwner?.hand[handIndex] === cardId
          ? handIndex
          : preferredOwner?.hand.indexOf(cardId) ?? -1
        if (!preferredOwner || validIndex < 0) {
          restore()
          return ['The relic is no longer in its owner\'s hand']
        }
        const hand = getPlayerCardInstanceZone(g, preferredOwner.id, 'hand')
        const attached = getBreachAttachedRelicZone(g, choice.playerId, choice.breachIndex)
        if (!attached || !moveCardBetweenZones(g, hand, validIndex, attached, 0, 'play')) {
          restore()
          return ['The relic is no longer in its owner\'s hand']
        }
        ensurePlayerCollections(preferredOwner)
        preferredOwner.cardPlayCountsThisTurn[cardId] =
          (preferredOwner.cardPlayCountsThisTurn[cardId] ?? 0) + 1
        resolution.sourceCardInHandPendingPlay = false
      } else {
        // Resolve against the actual played zone as a fallback so a changed
        // effect-player context cannot leave an attached relic in PLAYED ZONE.
        const sourceOwner = preferredOwner?.playedThisTurn.includes(cardId)
          ? preferredOwner
          : g.players.find(player => player.playedThisTurn.includes(cardId))
        if (sourceOwner) {
          const playedIndex = sourceOwner.playedThisTurn.lastIndexOf(cardId)
          if (playedIndex >= 0) {
            const played = getPlayerCardInstanceZone(g, sourceOwner.id, 'played_this_turn')
            const attached = getBreachAttachedRelicZone(g, choice.playerId, choice.breachIndex)
            if (attached) moveCardBetweenZones(g, played, playedIndex, attached, 0, 'play')
          }
        }
      }

      // Store the Breach owner so a later destruction/discard sends the relic
      // to the correct discard pile, even when another Mage played it.
      targetBreach.attachedRelic ??= { cardId, ownerId: choice.playerId }
      const playMessage = resolution.sourceCardHandIndex !== undefined
        ? `Played ${getCard(cardId).name} and attached it to ${choice.playerName}'s Breach ${toRoman(choice.breachIndex)}`
        : `Attached ${getCard(cardId).name} to ${choice.playerName}'s Breach ${toRoman(choice.breachIndex)}`
      return [playMessage, ...runEffectResolution(g, resolution)]
    }
    if (effect.kind === 'destroy_breach') {
      const ownerId = resolution.selectedActionPlayerId
      const currentChoice = ownerId
        ? getExhaustBreachChoices(g, ownerId).find(candidate =>
          candidate.playerId === choice.playerId && candidate.breachIndex === choice.breachIndex)
        : undefined
      const stinger = g.nemesis.playArea.find(card =>
        card.cardType === 'minion' && card.cardId === resolution.sourceCardId)
      if (!currentChoice || !stinger || (stinger.nemesisTokens ?? stinger.powerTokens ?? 0) < 2) {
        restore()
        return ['The selected Breach can no longer be destroyed']
      }
      const message = destroyExhaustedBreach(g, currentChoice)
      if (message.includes('no longer available')) {
        restore()
        return [message]
      }
      stinger.nemesisTokens = Math.max(0, (stinger.nemesisTokens ?? stinger.powerTokens ?? 0) - 2)
      delete stinger.powerTokens
      resolution.selectedActionPlayerId = undefined
      return [message, ...runEffectResolution(g, resolution)]
    }
    const currentCandidates = effect.kind === 'focus_breach_all_players'
      ? getBreachChoices(g, 'self', choice.playerId)
      : getBreachChoices(g, effect.target,
        effectTargetPlayerId(resolution, effectPlayerId(g, resolution), effect.target))
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
      addRemainingEffects(resolution, [{ ...effect }])
    }
    if (!wasOpened && targetBreach?.opened) {
      // The Breach-open trigger must resolve before the next player is focused.
      addRemainingEffects(resolution, collectBreachOpenedEffects(
        g, resolution.sourcePlayerId ?? effectPlayerId(g, resolution), captureEffectContext(resolution),
      ))
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
  } else if (answer.kind === 'distribute_cards') {
    if (decision.kind !== 'distribute_cards' || effect.kind !== 'distribute_nemesis_specific_deck_cards' ||
      decision.source !== 'nemesis_specific_deck' || decision.destination !== effect.destination) {
      restore()
      return ['Decision answer has the wrong type']
    }
    const expectedInstanceIds = decision.cards.map(card => card.instanceId)
    const assignedInstanceIds = answer.assignments.map(assignment => assignment.instanceId)
    const validAssignments = answer.assignments.length === decision.cards.length &&
      new Set(assignedInstanceIds).size === assignedInstanceIds.length &&
      expectedInstanceIds.every(instanceId => assignedInstanceIds.includes(instanceId)) &&
      answer.assignments.every(assignment => decision.players.includes(assignment.playerId))
    if (!validAssignments) {
      restore()
      return ['Assign every displayed card to a player before confirming']
    }
    const source = getNemesisCardInstanceZone(g, 'strike_deck')
    const cardsAreCurrent = decision.cards.every(card => {
      const index = source.instanceIds.indexOf(card.instanceId)
      return index >= 0 && source.cards[index] === card.cardId
    })
    if (!cardsAreCurrent) {
      restore()
      return ['One or more Vortex cards are no longer available to distribute']
    }
    for (const assignment of answer.assignments) {
      const card = decision.cards.find(candidate => candidate.instanceId === assignment.instanceId)!
      const index = source.instanceIds.indexOf(card.instanceId)
      const destination = getPlayerCardInstanceZone(g, assignment.playerId,
        effect.destination === 'deck_top' ? 'deck' : 'discard')
      moveCardBetweenZones(g, source, index, destination, 0, 'gain',
        effect.destination === 'deck_top' ? { hide: true } : { reveal: true })
    }
    const summary = answer.assignments.map(assignment => {
      const card = decision.cards.find(candidate => candidate.instanceId === assignment.instanceId)!
      return `${getCard(card.cardId).name} to ${getPlayer(g, assignment.playerId).mageType}`
    })
    return [`Players distribute ${summary.join(', ')}`, ...runEffectResolution(g, resolution)]
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
      : effect.kind === 'reveal_firethorns'
        ? resolution.firethornCurrentPlayerId ?? currentPlayerId
      : currentPlayerId
    if (!selectedChoicesAreCurrent(g, selectionOwnerId, decision.candidates, selected)) {
      restore()
      return ['Card selection is no longer valid']
    }
    if (effect.kind === 'move_cards_to_nemesis_specific_deck') {
      const blocked = g.nemesis.playArea.some(card =>
        (getCard(card.cardId) as import('../types').NemesisCardDef).blocksPlacementIntoSpecificDeck === true,
      )
      const validSelection = selected.every(choice =>
        cardChoiceMatches(choice, effect.source) &&
        (!effect.cardIds || effect.cardIds.includes(choice.cardId)) &&
        (!effect.cardNames || effect.cardNames.includes(getCard(choice.cardId).name)) &&
        (!effect.cardTypes || effect.cardTypes.includes(getCard(choice.cardId).type)),
      )
      if (blocked || !validSelection) {
        restore()
        return [blocked
          ? 'Cards cannot be placed into the Nemesis specific deck right now'
          : 'Choose only eligible cards for the Nemesis specific deck']
      }
      const vortex = getNemesisCardInstanceZone(g, 'strike_deck')
      const moved: string[] = []
      for (const choice of orderedByZoneRemoval(selected)) {
        const source = getPlayerCardInstanceZone(g, currentPlayerId, choice.zone)
        const card = moveCardBetweenZones(g, source, choice.index, vortex, 0, 'effect', { reveal: true })
        if (card) moved.push(card.cardId)
      }
      resolution.lastSelectedCardCount = moved.length
      return [
        moved.length > 0
          ? `Placed ${moved.map(cardId => getCard(cardId).name).join(', ')} into the Nemesis specific deck`
          : 'No cards were placed into the Nemesis specific deck',
        ...runEffectResolution(g, resolution),
      ]
    }
    if (effect.kind === 'resolve_corruptions') {
      const choice = selected[0]
      const owner = getPlayer(g, currentPlayerId)
      if (selected.length !== 1 || choice?.zone !== 'hand' ||
        getCard(choice.cardId).type !== 'corruption' || owner.hand[choice.index] !== choice.cardId) {
        restore()
        return ['Choose one Corruption from your hand']
      }
      const outerContext = captureEffectContext(resolution)
      const source = getPlayerCardInstanceZone(g, owner.id, 'hand')
      const removed = moveCardToTemporary(g, source, choice.index,
        { zoneId: `temporary:corruption:${owner.id}`, zone: 'temporary', ownerId: owner.id, index: 0 }, 'effect')
      if (!removed) {
        restore()
        return ['The selected Corruption is no longer in hand']
      }
      resolution.resolvingCorruption = {
        playerId: owner.id, cardId: removed.cardId, instanceId: removed.instanceId,
      }
      if (effect.timing === 'end_main') {
        const tracked = owner.corruptionsDrawnThisTurn ?? []
        const trackedIndex = tracked.indexOf(choice.cardId)
        if (trackedIndex >= 0) tracked.splice(trackedIndex, 1)
      }
      const cardContext: CardEffect = {
        kind: 'restore_effect_context', sourcePlayerId: owner.id, sourceCardOwnerId: owner.id,
        sourceCardId: choice.cardId, effectPlayerId: owner.id,
      }
      const cardEffects = matchingBlocks(choice.cardId, owner.id, g, { kind: 'on_play' }, undefined,
        owner.id, undefined, owner.id).flatMap(block => block.effects)
      addRemainingEffects(resolution, [
        cardContext,
        ...cardEffects,
        { kind: 'destroy_source_corruption' },
        outerContext,
        { kind: 'resolve_corruptions', timing: effect.timing },
      ])
      return [`${owner.mageType} resolves ${getCard(choice.cardId).name}`, ...runEffectResolution(g, resolution)]
    }
    if (effect.kind === 'place_card_on_top_of_own_deck') {
      const choice = selected[0]
      if (selected.length !== 1 || choice?.zone !== 'hand' || getPlayer(g, currentPlayerId).hand[choice.index] !== choice.cardId) {
        restore()
        return ['Choose one card from your hand']
      }
      const owner = getPlayer(g, currentPlayerId)
      const hand = getPlayerCardInstanceZone(g, owner.id, 'hand')
      const deck = getPlayerCardInstanceZone(g, owner.id, 'deck')
      const moved = moveCardBetweenZones(g, hand, choice!.index, deck, 0, 'return')
      if (!moved) {
        restore()
        return ['The selected card is no longer in hand']
      }
      return [`Placed ${getCard(moved.cardId).name} on top of ${owner.mageType}'s deck`, ...runEffectResolution(g, resolution)]
    }
    if (effect.kind === 'place_hand_card_on_ally_deck') {
      const choice = selected[0]
      const actorId = resolution.selectedActionPlayerId
      const recipientId = resolution.placementRecipientPlayerId
      const actor = actorId ? getPlayer(g, actorId) : null
      if (!actor || !recipientId || selected.length !== 1 || choice?.zone !== 'hand' ||
        !getPlayerTargets(g, actor.id, 'ally').some(target => target.playerId === recipientId) ||
        actor.hand[choice.index] !== choice.cardId) {
        restore()
        return ['Choose a card in the selected player’s hand and an ally to receive it']
      }
      const hand = getPlayerCardInstanceZone(g, actor.id, 'hand')
      const recipientDeck = getPlayerCardInstanceZone(g, recipientId, 'deck')
      const moved = moveCardBetweenZones(g, hand, choice!.index, recipientDeck, 0, 'return')
      if (!moved) {
        restore()
        return ['The selected card is no longer in hand']
      }
      resolution.selectedActionPlayerId = undefined
      resolution.placementRecipientPlayerId = undefined
      return [`${actor.mageType} places ${getCard(moved.cardId).name} on top of ${getPlayer(g, recipientId).mageType}'s deck`, ...runEffectResolution(g, resolution)]
    }
    if (effect.kind === 'discard_noncorruption_cards') {
      if (selected.length !== effect.amount || !selected.every(choice => choice.zone === 'hand' && getCard(choice.cardId).type !== 'corruption')) {
        restore()
        return [`Choose ${effect.amount} non-Corruption card(s)`]
      }
      const removed = discardSelectedCards(g, currentPlayerId, selected, true)
      return [`Discarded ${removed.map(id => getCard(id).name).join(', ')}`, ...runEffectResolution(g, resolution)]
    }
    if (effect.kind === 'discard_noncorruptions_and_gain_corruptions') {
      const ownerId = resolution.selectedActionPlayerId ?? currentPlayerId
      if (!selected.every(choice => choice.zone === 'hand' && getCard(choice.cardId).type !== 'corruption') ||
        selected.length !== Math.min(effect.discardAmount, getPlayer(g, ownerId).hand.filter(id => getCard(id).type !== 'corruption').length)) {
        restore()
        return ['Choose the required number of non-Corruption cards']
      }
      const removed = discardSelectedCards(g, ownerId, selected, true)
      resolution.effectPlayerId = ownerId
      resolution.selectedActionPlayerId = undefined
      addRemainingEffects(resolution, [{ kind: 'gain_corruptions', amount: effect.corruptionAmount, target: 'self', destination: effect.destination }])
      return [`${getPlayer(g, ownerId).mageType} discards ${removed.map(id => getCard(id).name).join(', ')}`, ...runEffectResolution(g, resolution)]
    }
    if (effect.kind === 'look_at_top_card_may_destroy') {
      const choice = selected[0]
      const owner = getPlayer(g, currentPlayerId)
      if (selected.length > 1 || (choice && (choice.zone !== 'deck' || owner.deck[choice.index] !== choice.cardId))) {
        restore()
        return ['The revealed top card has changed']
      }
      if (choice) {
        const deck = getPlayerCardInstanceZone(g, owner.id, 'deck')
        destroyCardFromZone(g, deck, choice.index)
      }
      return [choice ? `Destroyed ${getCard(choice.cardId).name} from the top of the deck` : 'Kept the revealed card on top of the deck', ...runEffectResolution(g, resolution)]
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
    if (effect.kind === 'reveal_firethorns') {
      const owner = getPlayer(g, selectionOwnerId)
      if (decision.source !== 'deck_or_discard' || decision.ownerId !== owner.id ||
        !selected.every(choice => cardChoiceMatches(choice, 'deck_or_discard') && getCard(choice.cardId).name.includes('Firethorn'))) {
        restore()
        return ['Choose up to two Firethorns from the revealed deck and discard cards']
      }
      const moved = moveSelectedPlayerCards(
        g, owner.id, orderedByZoneRemoval(selected), 'hand', 'gain', 'bottom',
      ).map(card => card.cardId)
      resolution.lastSelectedCardCount = moved.length
      resolution.firethornPlayerIndex = (resolution.firethornPlayerIndex ?? 0) + 1
      resolution.firethornCurrentPlayerId = undefined
      addRemainingEffects(resolution, [effect])
      return [
        moved.length > 0 ? `${owner.mageType} puts ${moved.map(id => getCard(id).name).join(', ')} into hand` : `${owner.mageType} skips the Firethorn cards`,
        ...runEffectResolution(g, resolution),
      ]
    }
    if (effect.kind === 'cycle_specific_deck_with_in_play_treasure') {
      const owner = getPlayer(g, resolution.sourcePlayerId ?? currentPlayerId)
      resolution.effectPlayerId = owner.id
      const choice = selected[0]
      const treasure = choice && getCard(choice.cardId)
      if (decision.source !== 'player_cards_in_play' || selected.length !== 1 || choice?.zone !== 'player_cards_in_play' ||
        !treasure || treasure.type !== 'treasure' || treasure.treasureLevel !== 3 ||
        owner.playerCardsInPlay?.[choice.index] !== choice.cardId || !owner.specificDeck?.[0]) {
        restore()
        return ['The level-3 Treasure or Vault card is no longer available']
      }
      rememberSpecificDeckCard(g, owner, owner.specificDeck[0]!, 0)
      const specificDeck = getPlayerCardInstanceZone(g, owner.id, 'specific_deck')
      const inPlay = getPlayerCardInstanceZone(g, owner.id, 'player_cards_in_play')
      const returnedInstanceId = inPlay.instanceIds[choice.index]
      const incoming = moveCardBetweenZones(g, specificDeck, 0, inPlay, inPlay.cards.length, 'effect')
      if (!incoming || !returnedInstanceId) {
        restore()
        return ['The level-3 Treasure or Vault card is no longer available']
      }
      const returnedIndex = inPlay.instanceIds.indexOf(returnedInstanceId)
      moveCardBetweenZones(g, inPlay, returnedIndex, specificDeck, specificDeck.cards.length, 'effect')
      rememberSpecificDeckCard(g, owner, choice.cardId, specificDeck.cards.length - 1)
      rememberSpecificDeckTop(g, owner)
      addRemainingEffects(resolution, putPlayerCardIntoPlay(
        g, owner.id, incoming.cardId, resolution.sourcePlayerId ?? currentPlayerId,
        captureEffectContext(resolution), incoming.instanceId,
      ))
      return [`Exchanged ${treasure.name} for ${getCard(incoming.cardId).name} from Tressa's Vault`, ...runEffectResolution(g, resolution)]
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
      if (effect.cardIds && !selected.every(choice => effect.cardIds!.includes(choice.cardId))) {
        restore()
        return ['Choose only the specified card']
      }
      if (effect.minCost !== undefined && !selected.every(choice => getCard(choice.cardId).cost >= effect.minCost!)) {
        restore()
        return [`Choose only cards costing ${effect.minCost} Aether or more`]
      }
      const removed = discardSelectedCards(g, currentPlayerId, selected, true)
      resolution.lastSelectedCardCount = removed.length
      resolution.lastSelectedCardCost = removed.length > 0 ? Math.max(...removed.map(id => getCard(id).cost)) : 0
      if (effect.restoreToSourceAfterSelection) {
        resolution.effectPlayerId = resolution.sourcePlayerId ?? currentPlayerId
      }
      return [`Discarded ${removed.map(id => getCard(id).name).join(', ')}`, ...runEffectResolution(g, resolution)]
    }
    if (effect.kind === 'draw_and_discard_cards') {
      if (selected.length !== effect.discardAmount || !selected.every(choice => choice.zone === 'hand')) {
        restore()
        return [`Choose exactly ${effect.discardAmount} card(s) from hand`]
      }
      const target = getPlayer(g, resolution.effectPlayerId ?? currentPlayerId)
      const removed = discardSelectedCards(g, target.id, selected, true)
      return [`${target.mageType} discards ${removed.map(id => getCard(id).name).join(', ')}`, ...runEffectResolution(g, resolution)]
    }
    if (effect.kind === 'reveal_top_cards_for_discard') {
      if (!selected.every(choice => choice.zone === 'deck')) {
        restore()
        return ['Choose cards from the revealed top of the deck']
      }
      const owner = getPlayer(g, currentPlayerId)
      if (effect.reorderRemaining) {
        const order = answer.order ?? decision.candidates
        const validOrder = decision.reorderable === true && order.length === decision.candidates.length &&
          selectedChoicesAreCurrent(g, owner.id, decision.candidates, order) &&
          decision.candidates.every((choice, index) => choice.index === index && owner.deck[index] === choice.cardId)
        if (!validOrder) {
          restore()
          return ['The revealed cards or their order are no longer valid']
        }
        const selectedKeys = new Set(selected.map(choice => `${choice.zone}:${choice.index}:${choice.cardId}`))
        const discardedChoices = order.filter(choice =>
          selectedKeys.has(`${choice.zone}:${choice.index}:${choice.cardId}`),
        )
        const reordered = takePlayerDeckInstancesAt(
          g, owner, Array.from({ length: decision.candidates.length }, (_, index) => index),
        )
        const refsByIndex = new Map(reordered.map((card, index) => [index, card]))
        const returnedToTop = order.filter(choice =>
          !selectedKeys.has(`${choice.zone}:${choice.index}:${choice.cardId}`),
        ).map(choice => refsByIndex.get(choice.index)!).filter(Boolean)
        putPlayerDeckInstancesOnTop(g, owner, returnedToTop)
        const discard = getPlayerCardInstanceZone(g, owner.id, 'discard')
        for (let index = 0; index < discardedChoices.length; index += 1) {
          const choice = discardedChoices[index]!
          const card = refsByIndex.get(choice.index)
          if (!card) continue
          placeTemporaryCardInZone(g, card.instanceId, card.cardId,
            { zoneId: `temporary:deck_reveal:${owner.id}`, zone: 'temporary', ownerId: owner.id, index: choice.index },
            discard, index, 'discard', card.revealed)
        }
        return [
          discardedChoices.length > 0
            ? `Discarded ${discardedChoices.map(choice => getCard(choice.cardId).name).join(', ')}`
            : 'Kept the revealed cards on top of the deck',
          ...runEffectResolution(g, resolution),
        ]
      }
      const selectedByIndex = new Map(selected.map(choice => [choice.index, choice.cardId]))
      if ([...selectedByIndex.entries()].some(([index, cardId]) => owner.deck[index] !== cardId)) {
        restore()
        return ['The revealed cards are no longer on top of the deck']
      }
      const deckZone = getPlayerCardInstanceZone(g, owner.id, 'deck')
      const originalIndexByInstanceId = new Map(deckZone.instanceIds.map((instanceId, index) => [instanceId, index]))
      const removed = takePlayerDeckInstancesAt(g, owner, [...selectedByIndex.keys()])
      const discard = getPlayerCardInstanceZone(g, owner.id, 'discard')
      const discardOrder = removed
      for (let index = 0; index < discardOrder.length; index += 1) {
        const card = discardOrder[index]!
        placeTemporaryCardInZone(g, card.instanceId, card.cardId,
          { zoneId: `player:${owner.id}:deck`, zone: 'deck', ownerId: owner.id, index: originalIndexByInstanceId.get(card.instanceId) ?? 0 },
          discard, 0, 'discard', card.revealed)
      }
      return [`Discarded ${removed.map(card => getCard(card.cardId).name).join(', ')}`, ...runEffectResolution(g, resolution)]
    }
    if (effect.kind === 'destroy_cards') {
      if (effect.source !== 'self' && !selected.every(choice => cardChoiceMatches(choice, effect.source as CardSelectionSource))) {
        restore()
        return ['Invalid card source']
      }
      if (!selected.every(choice =>
        (!effect.cardType || getCard(choice.cardId).type === effect.cardType) &&
        (!effect.cardTypes || effect.cardTypes.includes(getCard(choice.cardId).type)) &&
        getCard(choice.cardId).cost >= (effect.minCost ?? 0),
      )) {
        restore()
        return ['Choose only eligible cards to destroy']
      }
      const removed = destroySelectedPlayerCards(g, currentPlayerId, selected)
      resolution.lastSelectedCardCount = removed.length
      resolution.lastSelectedCardCost = removed.length > 0 ? Math.max(...removed.map(id => getCard(id).cost)) : 0
      if (effect.restoreToSourceAfterSelection) {
        resolution.effectPlayerId = resolution.sourcePlayerId ?? currentPlayerId
      }
      return [
        removed.length > 0
          ? `Destroyed ${removed.map(id => getCard(id).name).join(', ')}`
          : 'Skipped destroying a card',
        ...runEffectResolution(g, resolution),
      ]
    }
    if (effect.kind === 'destroy_cards_equal_to_power_tokens') {
      if (selected.length === 0 || !selected.every(choice => cardChoiceMatches(choice, 'hand_or_discard'))) {
        restore()
        return ['Choose cards from hand or discard pile']
      }
      const tokenOwner = getPlayer(g, effect.playerId ?? resolution.sourceCardOwnerId ?? resolution.sourcePlayerId ?? currentPlayerId)
      const target = getPlayer(g, effect.playerId ?? currentPlayerId)
      const count = playerCardPowerTokenCount(tokenOwner, effect.cardId)
      if (selected.length !== count || !selectedChoicesAreCurrent(g, target.id, decision.candidates, selected)) {
        restore()
        return [`Choose exactly ${count} card(s) to destroy`]
      }
      const removed = destroySelectedPlayerCards(g, target.id, selected)
      addRemainingEffects(resolution, [{ kind: 'destroy_player_card_in_play', cardId: effect.cardId, playerId: tokenOwner.id }])
      return [`Destroyed ${removed.map(id => getCard(id).name).join(', ')}`, ...runEffectResolution(g, resolution)]
    }
    if (effect.kind === 'move_cards_to_swap_zone') {
      if (!selected.every(choice => cardChoiceMatches(choice, effect.source) && cardNameMatchesAny(choice.cardId, effect.nameIncludes))) {
        restore()
        return ['Only matching Crystal or Spark cards can enter the Swap zone']
      }
      const moved = moveSelectedPlayerCards(
        g, currentPlayerId, orderedByZoneRemoval(selected), 'swap_zone', 'swap', 'bottom',
      ).map(card => card.cardId)
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
      const cardId = gainSwapZoneCard(g, player, choice)
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
      const selectedIndex = selectedChoice?.index
      if (!reveal || !owner || !selectedChoice || selectedChoice.zone !== 'specific_deck' ||
        !Number.isInteger(selectedIndex) || selectedIndex! < 0 ||
        reveal.cards[selectedIndex!] !== selectedChoice.cardId) {
        restore()
        return ['Choose one revealed Mage-specific card to put into play']
      }
      const specificDeck = getPlayerCardInstanceZone(g, owner.id, 'specific_deck')
      const revealed = specificDeck.cards.slice(0, reveal.cards.length)
      const revealedInstanceIds = specificDeck.instanceIds.slice(0, reveal.cards.length)
      if (revealed.length !== reveal.cards.length || revealed.some((cardId, index) => cardId !== reveal.cards[index]) ||
        (reveal.instanceIds && revealedInstanceIds.some((instanceId, index) => instanceId !== reveal.instanceIds![index]))) {
        restore()
        return ['The revealed Mage-specific cards are no longer available']
      }
      const putIntoPlay = revealed[selectedIndex!]
      if (!putIntoPlay) {
        restore()
        return ['The selected Mage-specific card is no longer available']
      }
      const incomingInstanceId = revealedInstanceIds[selectedIndex!]
      const inPlay = getPlayerCardInstanceZone(g, owner.id, 'player_cards_in_play')
      const incomingIndex = incomingInstanceId ? specificDeck.instanceIds.indexOf(incomingInstanceId) : -1
      const incoming = incomingIndex < 0 ? undefined
        : moveCardBetweenZones(g, specificDeck, incomingIndex, inPlay, inPlay.cards.length, 'gain')
      if (!incoming) {
        restore()
        return ['The selected Mage-specific card is no longer available']
      }
      for (let index = 0; index < revealedInstanceIds.length; index += 1) {
        if (index === selectedIndex) continue
        const instanceId = revealedInstanceIds[index]!
        const sourceIndex = specificDeck.instanceIds.indexOf(instanceId)
        if (sourceIndex >= 0) moveCardBetweenZones(g, specificDeck, sourceIndex, specificDeck, specificDeck.cards.length, 'reorder')
      }
      rememberSpecificDeckTop(g, owner)
      resolution.specificDeckReveal = undefined
      addRemainingEffects(resolution, putPlayerCardIntoPlay(
        g, owner.id, putIntoPlay, resolution.sourcePlayerId ?? currentPlayerId,
        captureEffectContext(resolution), incoming.instanceId,
      ))
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
      if (!selected.every(choice => choice.zone === effect.source &&
        (effect.cardTypes ?? ['spell']).includes(getCard(choice.cardId).type) &&
        (effect.maxCost === undefined || getCard(choice.cardId).cost <= effect.maxCost))) {
        restore()
        return ['Invalid card selection']
      }
      const returned = moveSelectedPlayerCards(
        g, currentPlayerId, orderedByZoneRemoval(selected).reverse(), 'hand', 'return', 'bottom',
      ).map(card => card.cardId)
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
    if (decision.kind !== 'select_prepped_spells' ||
      (effect.kind !== 'discard_prepped_spells' &&
        !(effect.kind === 'cast_prepped_spell' && effect.allowSkip && decision.confirmSelection))) {
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
    if (effect.kind === 'cast_prepped_spell') {
      if (selected.length === 0) {
        return ['Skipped casting a prepped spell', ...runEffectResolution(g, resolution)]
      }
      const choice = selected[0]!
      resolution.selectedPreppedSpell = choice
      resolution.confirmedPreppedSpell = choice
      addRemainingEffects(resolution, [effect])
      return [`Selected ${choice.cardName} to cast`, ...runEffectResolution(g, resolution)]
    }
    const requiredKeys = (decision.requiredChoices ?? []).map(choice =>
      `${choice.playerId}:${choice.breachIndex}:${choice.spellIndex}:${choice.cardId}`)
    if (requiredKeys.some(key => !selectedKeys.has(key))) {
      restore()
      return ['All required prepped spells must be selected']
    }
    discardPreppedSpellChoices(g, selected, true)
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
      const removed = discardCollectiveCards(g, selected, true)
      return [`Players collectively discard ${removed.map(id => getCard(id).name).join(', ')}`, ...runEffectResolution(g, resolution)]
    }
    if (effect.kind === 'deal_gravehold_damage_with_gem_discard') {
      if (!selected.every(item => getCard(item.choice.cardId).type === 'gem')) {
        restore()
        return ['Only gems may be discarded for this effect']
      }
      const removed = discardCollectiveCards(g, selected, true)
      const damage = Math.max(0, effect.amount - selected.length * effect.reductionPerGem)
      const message = dealDamage(g, { kind: 'gravehold', id: 'gravehold', label: 'Gravehold' }, damage)
      return [`Discarded ${removed.map(id => getCard(id).name).join(', ')} to reduce damage`, message, ...runEffectResolution(g, resolution)]
    }
    if (effect.kind === 'devouring_wave_discard_and_gain') {
      if (selected.length !== decision.max || !selected.every(item => getCard(item.choice.cardId).cost >= 2)) {
        restore()
        return [`Choose exactly ${decision.max} card(s) costing 2 Aether or more`]
      }
      const removed = discardCollectiveCards(g, selected, true)
      const trinkets = ensureTrinketDeckState(g)
      const trinketDeck = getNemesisCardInstanceZone(g, 'trinket_deck')
      for (const item of selected) {
        const cardId = trinketDeck.cards[0]
        if (cardId) {
          const recipient = getPlayer(g, item.playerId)
          const hand = getPlayerCardInstanceZone(g, recipient.id, 'hand')
          const moved = moveCardBetweenZones(g, trinketDeck, 0, hand, hand.cards.length, 'gain')
          if (moved) rememberOwnedTrinketInstance(recipient, moved.instanceId)
        }
      }
      return [`Discarded ${removed.map(id => getCard(id).name).join(', ')}; each selected player gains a Trinket into hand`, ...runEffectResolution(g, resolution)]
    }
    if (effect.kind === 'resolve_recall') {
      if (selected.length === 0) return ['Skipped Recall', ...runEffectResolution(g, resolution)]
      if (selected.length !== 1) {
        restore()
        return ['Choose at most one Recall card']
      }
      const choice = selected[0]!
      const owner = getPlayer(g, choice.playerId)
      const cardId = choice.choice.cardId
      const ordinal = owner.discard.slice(0, choice.choice.index).filter(id => id === cardId).length
      const recallActorId = resolution.sourcePlayerId ?? effectPlayerId(g, resolution)
      const blocks = matchingBlocks(cardId, owner.id, g, { kind: 'recall' }, undefined,
        owner.id, undefined, recallActorId)
      const used = getPlayerTurnEffects(owner).usedRecallEffects!
      const available = blocks.flatMap((block, blockIndex) => {
        const marker = recallBlockMarker(cardId, blockIndex)
        const alreadyUsed = ordinal < (used[marker] ?? 0)
        return effect.ignoreOncePerTurn === true || !alreadyUsed ? [{ block, marker, alreadyUsed }] : []
      })
      const chosen = available[0]
      if (!chosen || owner.discard[choice.choice.index] !== cardId) {
        restore()
        return ['That Recall effect is no longer available']
      }
      if (!chosen.alreadyUsed) used[chosen.marker] = (used[chosen.marker] ?? 0) + 1
      // The chosen card supplies the Recall text and its physical owner, but
      // the Mage who selected it remains the effect actor. Thus "any ally"
      // excludes the initiator, while source-card movement still uses owner.
      const restoreOuterContext = captureEffectContext(resolution)
      const recallScopeId = chosen.block.effectPlayerScope === 'owner' ? owner.id : recallActorId
      const recallContext: CardEffect = {
        ...captureEffectContext(resolution),
        kind: 'restore_effect_context',
        sourcePlayerId: recallScopeId,
        sourceCardOwnerId: owner.id,
        sourceCardId: cardId,
        effectPlayerId: recallScopeId,
      }
      const repeatedEffects = Array.from(
        { length: Math.max(0, effect.maxTimes) },
        () => [recallContext, ...chosen.block.effects],
      ).flat()
      addRemainingEffects(resolution, [...repeatedEffects, restoreOuterContext])
      return [`Resolved Recall from ${getCard(cardId).name}`, ...runEffectResolution(g, resolution)]
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
    if (effect.kind === 'gain_card_from_market') {
      const maxCost = effect.bonusOverLastSelection === undefined
        ? effect.maxCost
        : Math.max(0, (resolution.lastSelectedCardCost ?? 0) + effect.bonusOverLastSelection)
      const selectedCost = getMarketCardCost(g, choice.pileIndex, effectPlayerId(g, resolution))
      const activeCandidates = decision.candidates.filter(candidate => {
        const candidatePile = g.market.piles[candidate.pileIndex]
        return candidatePile?.cardId === candidate.cardId && candidatePile.remaining > 0 &&
          (!effect.cardType || getCard(candidate.cardId).type === effect.cardType) &&
          (maxCost === undefined || getMarketCardCost(g, candidate.pileIndex, effectPlayerId(g, resolution)) <= maxCost)
      })
      const leastCost = activeCandidates.length > 0
        ? Math.min(...activeCandidates.map(candidate => getMarketCardCost(g, candidate.pileIndex, effectPlayerId(g, resolution))))
        : Number.POSITIVE_INFINITY
      if ((effect.cardType && getCard(choice.cardId).type !== effect.cardType) ||
        (maxCost !== undefined && selectedCost > maxCost) ||
        (effect.leastExpensive && selectedCost !== leastCost)) {
        restore()
        return ['The selected supply pile no longer matches this effect']
      }
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
        resolution.lastSelectedCardCost = getCard(choice!.cardId).cost
        const gainingPlayerId = effectPlayerId(g, resolution)
        const restoreContext = captureEffectContext(resolution)
        const followups = matchingBlocks(choice!.cardId, gainingPlayerId, g, { kind: 'on_gain' },
          undefined, gainingPlayerId, undefined, gainingPlayerId).flatMap(block =>
          contextualizeCardEffectBlock(block, choice!.cardId, gainingPlayerId, gainingPlayerId, restoreContext))
        addRemainingEffects(resolution, [
          ...followups,
          ...getSupplyPileGainEffects(
            g, choice!.pileIndex, gainingPlayerId, choice!.cardId, destination, restoreContext,
          ),
        ])
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
        effect.kind !== 'gain_corruptions' && effect.kind !== 'gain_corruptions_collectively' &&
        effect.kind !== 'gain_corruption_and_shuffle_discard' &&
        effect.kind !== 'resolve_glinting_stinger' &&
        effect.kind !== 'place_hand_card_on_ally_deck' &&
        effect.kind !== 'tempt_highest_crystals' &&
        effect.kind !== 'discard_noncorruptions_and_gain_corruptions' &&
        effect.kind !== 'shuffle_hand_into_deck_and_draw' &&
        effect.kind !== 'obliterate_most_open_breach_player' &&
        effect.kind !== 'discard_cards' && effect.kind !== 'shuffle_discard_into_deck' &&
        effect.kind !== 'destroy_top_cards' && effect.kind !== 'place_cast_spell_in_ally_hand' &&
        effect.kind !== 'gain_aether_token' && effect.kind !== 'gain_trinkets' && effect.kind !== 'gain_pulse_token' &&
        effect.kind !== 'lose_pulse_token' && effect.kind !== 'gain_charge' &&
        effect.kind !== 'lose_charge' && effect.kind !== 'lose_all_charge' &&
        effect.kind !== 'gain_specific_deck_top' && effect.kind !== 'destroy_cards' &&
        effect.kind !== 'reveal_firethorns' && effect.kind !== 'reveal_top_card_to_hand_if_spell' &&
        effect.kind !== 'resolve_mage_form_supply_gain' && effect.kind !== 'draw_and_discard_cards' &&
        effect.kind !== 'conjure' && effect.kind !== 'expunge_nemesis_specific_deck' &&
        effect.kind !== 'gain_nemesis_specific_deck_cards')) {
      restore()
      return ['Decision answer has the wrong type']
    }
    const target = decision.targets.find(candidate => candidate.playerId === answer.target.playerId)
    if (!target) {
      restore()
      return ['Invalid player target']
    }
    const player = getPlayer(g, target.playerId)
    if (effect.kind === 'deal_player_damage' && effect.preferTargetWithCardNamesInHand?.length) {
      let eligibleTargets = effect.target === 'doom_owner'
        ? getSelectedDamagePlayerTargets(g, effectPlayerId(g, resolution), effect.target, effect.selection)
        : getEffectPlayerTargets(g, resolution, effectPlayerId(g, resolution), effect.target, effect.selection)
      const playersWithRequiredCards = eligibleTargets.filter(candidate =>
        getPlayer(g, candidate.playerId).hand.some(cardId =>
          effect.preferTargetWithCardNamesInHand!.includes(getCard(cardId).name),
        ),
      )
      if (playersWithRequiredCards.length > 0) eligibleTargets = playersWithRequiredCards
      if (!eligibleTargets.some(candidate => candidate.playerId === target.playerId)) {
        restore()
        return ['Choose a player with an eligible card in hand, if one is available']
      }
    }
    if (effect.kind === 'expunge_nemesis_specific_deck') {
      if (!g.players.some(candidate => candidate.id === target.playerId)) {
        restore()
        return ['Choose a Mage to receive the first Vortex card']
      }
      resolution.vortexExpungeStartPlayerId = target.playerId
      addRemainingEffects(resolution, [effect])
      return [`${player.mageType} will receive the first Vortex card`, ...runEffectResolution(g, resolution)]
    }
    if (effect.kind === 'gain_nemesis_specific_deck_cards' && effect.recipient === 'choose') {
      if (!g.players.some(candidate => candidate.id === target.playerId)) {
        restore()
        return ['Choose a player to gain cards from the Nemesis specific deck']
      }
      resolution.selectedActionPlayerId = target.playerId
      addRemainingEffects(resolution, [effect])
      return [`${player.mageType} will gain cards from the Nemesis specific deck`, ...runEffectResolution(g, resolution)]
    }
    if (effect.kind === 'gain_corruptions') {
      if (!getEffectPlayerTargets(g, resolution, effectPlayerId(g, resolution), effect.target ?? 'self')
        .some(item => item.playerId === target.playerId)) {
        restore()
        return ['Invalid Corruption recipient']
      }
      resolution.effectPlayerId = target.playerId
      addRemainingEffects(resolution, [{ ...effect, target: 'self' }])
      return [`${player.mageType} will gain Corruption(s)`, ...runEffectResolution(g, resolution)]
    }
    if (effect.kind === 'gain_corruptions_collectively') {
      if (!g.players.some(item => item.id === target.playerId)) {
        restore()
        return ['Invalid player for collective Corruption gain']
      }
      const remaining = resolution.remainingCorruptionGains ?? Math.max(0, Math.floor(effect.amount))
      if (remaining <= 0) {
        restore()
        return ['There are no Corruptions left to assign']
      }
      resolution.remainingCorruptionGains = remaining - 1
      resolution.effectPlayerId = target.playerId
      addRemainingEffects(resolution, [
        { kind: 'gain_corruptions', amount: 1, target: 'self', destination: effect.destination },
        effect,
      ])
      return [`${player.mageType} will gain a Corruption (${effect.amount - remaining + 1}/${effect.amount})`, ...runEffectResolution(g, resolution)]
    }
    if (effect.kind === 'resolve_glinting_stinger') {
      const eligible = getExhaustBreachChoices(g, target.playerId).length > 0
      if (!eligible) {
        restore()
        return ['That player has no Breach that can be destroyed']
      }
      resolution.selectedActionPlayerId = target.playerId
      addRemainingEffects(resolution, [effect])
      return [`${player.mageType} will choose a Breach to destroy`, ...runEffectResolution(g, resolution)]
    }
    if (effect.kind === 'place_hand_card_on_ally_deck') {
      const actorId = resolution.selectedActionPlayerId
      if (actorId) {
        if (!getPlayerTargets(g, actorId, 'ally').some(item => item.playerId === target.playerId)) {
          restore()
          return ['Invalid ally to receive a card']
        }
        resolution.placementRecipientPlayerId = target.playerId
      } else {
        if (!getPlayerTargets(g, effectPlayerId(g, resolution), 'any_player')
          .some(item => item.playerId === target.playerId)) {
          restore()
          return ['Invalid player to choose a card from']
        }
        resolution.selectedActionPlayerId = target.playerId
      }
      addRemainingEffects(resolution, [effect])
      return [`${player.mageType} will choose a card to place on an ally's deck`, ...runEffectResolution(g, resolution)]
    }
    if (effect.kind === 'tempt_highest_crystals') {
      if (!getSelectedPlayerTargets(g, effectPlayerId(g, resolution), 'any_player', 'most_crystals')
        .some(item => item.playerId === target.playerId)) {
        restore()
        return ['The selected player no longer has the most Crystals']
      }
      resolution.selectedActionPlayerId = target.playerId
      addRemainingEffects(resolution, [effect])
      return [`${player.mageType} is affected by Tempt`, ...runEffectResolution(g, resolution)]
    }
    if (effect.kind === 'discard_noncorruptions_and_gain_corruptions') {
      let targets = getPlayerTargets(g, effectPlayerId(g, resolution), 'any_player')
      if (effect.targetAvailability === 'full_or_max') {
        targets = retainFullyResolvableOrMaximumTargets(targets, effect.discardAmount, item =>
          getCardChoices(g, item.playerId, 'hand').filter(choice => getCard(choice.cardId).type !== 'corruption').length)
      }
      if (!targets.some(item => item.playerId === target.playerId)) {
        restore()
        return ['The selected player can no longer resolve the most available Ruin Priest effect']
      }
      resolution.selectedActionPlayerId = target.playerId
      addRemainingEffects(resolution, [effect])
      return [`${player.mageType} is targeted by Ruin Priest`, ...runEffectResolution(g, resolution)]
    }
    if (effect.kind === 'shuffle_hand_into_deck_and_draw') {
      if (!getPlayerTargets(g, effectPlayerId(g, resolution), 'any_player')
        .some(item => item.playerId === target.playerId)) {
        restore()
        return ['Invalid player to shuffle their hand']
      }
      resolution.selectedActionPlayerId = target.playerId
      addRemainingEffects(resolution, [effect])
      return [`${player.mageType} is targeted by Masticate`, ...runEffectResolution(g, resolution)]
    }
    if (effect.kind === 'obliterate_most_open_breach_player') {
      if (!getSelectedPlayerTargets(g, effectPlayerId(g, resolution), 'any_player', 'most_opened_breaches')
        .some(item => item.playerId === target.playerId)) {
        restore()
        return ['The selected player no longer has the most opened Breaches']
      }
      resolution.selectedActionPlayerId = target.playerId
      addRemainingEffects(resolution, [effect])
      return [`${player.mageType} is targeted by Obliterate`, ...runEffectResolution(g, resolution)]
    }
    if (effect.kind === 'discard_cards' && effect.targetAvailability === 'full_or_max') {
      let targets = getEffectPlayerTargets(g, resolution, effectPlayerId(g, resolution), effect.target ?? 'self', effect.selection)
      const candidatesFor = (targetId: string) => getCardChoices(g, targetId, effect.source).filter(choice =>
        (!effect.cardType || getCard(choice.cardId).type === effect.cardType) &&
        (!effect.cardIds || effect.cardIds.includes(choice.cardId)) &&
        getCard(choice.cardId).cost >= (effect.minCost ?? 0))
      targets = retainFullyResolvableOrMaximumTargets(targets, effect.maxAmount ?? effect.amount, item =>
        candidatesFor(item.playerId).length)
      if (!targets.some(item => item.playerId === target.playerId)) {
        restore()
        return ['The selected player can no longer resolve the most available discard effect']
      }
    }
    if (effect.kind === 'lose_charge' && effect.targetAvailability === 'full_or_max') {
      let targets = getEffectPlayerTargets(g, resolution, effectPlayerId(g, resolution), effect.target ?? 'self')
      targets = retainFullyResolvableOrMaximumTargets(targets, effect.amount, item => getPlayer(g, item.playerId).charge)
      if (!targets.some(item => item.playerId === target.playerId)) {
        restore()
        return ['The selected player can no longer resolve the most available Charge loss']
      }
    }
    if (effect.kind === 'lose_all_charge') {
      const targets = getEffectPlayerTargets(g, resolution, effectPlayerId(g, resolution), effect.target, effect.selection)
      if (!targets.some(item => item.playerId === target.playerId)) {
        restore()
        return ['The selected player no longer meets the Charge target rule']
      }
      resolution.effectPlayerId = target.playerId
      addRemainingEffects(resolution, [{ ...effect, target: 'self' }])
      return [`${player.mageType} is the player with the most charge`, ...runEffectResolution(g, resolution)]
    }
    if (effect.kind === 'lose_charge') {
      const targets = effect.targetAvailability === 'full_or_max'
        ? retainFullyResolvableOrMaximumTargets(
          getEffectPlayerTargets(g, resolution, effectPlayerId(g, resolution), effect.target ?? 'self'),
          effect.amount,
          item => getPlayer(g, item.playerId).charge,
        )
        : getEffectPlayerTargets(g, resolution, effectPlayerId(g, resolution), effect.target ?? 'self')
      if (!targets.some(item => item.playerId === target.playerId)) {
        restore()
        return ['Invalid player to lose charge']
      }
      resolution.effectPlayerId = target.playerId
      addRemainingEffects(resolution, [{ ...effect, target: 'self' }])
      return [`${player.mageType} is the target of Charge loss`, ...runEffectResolution(g, resolution)]
    }
    if (effect.kind === 'conjure') {
      const targetContextPlayerId = effectTargetPlayerId(
        resolution, effectPlayerId(g, resolution), effect.target ?? 'self', effect.relativeToSource === true,
      )
      if (!getEffectPlayerTargets(g, resolution, targetContextPlayerId, effect.target ?? 'self',
        undefined, effect.relativeToSource === true)
        .some(item => item.playerId === target.playerId)) {
        restore()
        return ['Invalid player for Conjure']
      }
      resolution.conjureTargetPlayerId = target.playerId
      return [`${player.mageType} will Conjure`, ...runEffectResolution(g, resolution)]
    }
    if (effect.kind === 'gain_corruption_and_shuffle_discard') {
      resolution.effectPlayerId = target.playerId
      addRemainingEffects(resolution, [
        { kind: 'gain_corruptions', amount: 1, target: 'self', destination: 'deck_top' },
        { kind: 'shuffle_discard_into_deck', target: 'self' },
      ])
      return [`${player.mageType} gains a Corruption and shuffles their discard pile`, ...runEffectResolution(g, resolution)]
    }
    if (effect.kind === 'resolve_mage_form_supply_gain') {
      if (effect.step !== 'choose_ally' || effect.formSide !== 'giver' ||
        !getPlayerTargets(g, effect.formOwnerId ?? '', 'ally').some(item => item.playerId === target.playerId)) {
        restore()
        return ['Invalid ally for the Mage Form supply effect']
      }
      return [
        ...moveGainedSupplyCardToDeck(g, effect, target.playerId),
        ...runEffectResolution(g, resolution),
      ]
    }
    if (effect.kind === 'reveal_top_card_to_hand_if_spell') {
      if (!getPlayerTargets(g, resolution.sourcePlayerId ?? effectPlayerId(g, resolution), effect.target)
        .some(item => item.playerId === target.playerId)) {
        restore()
        return ['Invalid player for the top card reveal']
      }
      const revealMessages = pauseRevealTopCard(g, resolution, effect, target.playerId)
      return g.pendingDecision ? revealMessages : [...revealMessages, ...runEffectResolution(g, resolution)]
    }
    if (effect.kind === 'reveal_firethorns') {
      const selected = resolution.firethornPlayerIds ?? []
      if (selected.includes(target.playerId)) {
        restore()
        return ['Choose two different players']
      }
      selected.push(target.playerId)
      resolution.firethornPlayerIds = selected
      addRemainingEffects(resolution, [effect])
      return [`${player.mageType} will reveal Firethorns`, ...runEffectResolution(g, resolution)]
    }
    if (effect.kind === 'place_cast_spell_in_ally_hand') {
      const pending = resolution.pendingSpellCast
      const casterPlayerId = pending?.casterPlayerId ?? pending?.playerId
      if (!pending || !pending.transferToAlly || !casterPlayerId ||
        !getPlayerTargets(g, casterPlayerId, 'ally').some(item => item.playerId === target.playerId)) {
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
    if (effect.kind === 'gain_pulse_token') {
      const amount = Math.max(0, Math.floor(effect.amount ?? 1))
      const gained = gainPulseTokens(player, amount)
      const message = gained > 0
        ? `${player.mageType} gains ${gained} Pulse token${gained === 1 ? '' : 's'} (${player.pulseTokens}/${MAX_PULSE_TOKENS})`
        : `${player.mageType} cannot gain more Pulse tokens (${MAX_PULSE_TOKENS}/${MAX_PULSE_TOKENS})`
      resolution.effectPlayerId = target.playerId
      return [message, ...runEffectResolution(g, resolution)]
    }
    if (effect.kind === 'lose_pulse_token') {
      const amount = Math.floor(amountValue(
        g, effectPlayerId(g, resolution), effect.amount, resolution.sourceCardId, resolution,
      ))
      const lost = losePulseTokens(player, amount)
      const message = lost > 0
        ? `${player.mageType} loses ${lost} Pulse token${lost === 1 ? '' : 's'} (${player.pulseTokens}/${MAX_PULSE_TOKENS})`
        : `${player.mageType} does not have enough Pulse tokens`
      resolution.effectPlayerId = target.playerId
      return [message, ...runEffectResolution(g, resolution)]
    }
    if (effect.kind === 'gain_charge' || effect.kind === 'gain_specific_deck_top') {
      resolution.effectPlayerId = target.playerId
      addRemainingEffects(resolution, [{ ...effect, target: 'self' }])
      return [`${player.mageType} is the target`, ...runEffectResolution(g, resolution)]
    }
    if (effect.kind === 'destroy_cards') {
      resolution.effectPlayerId = target.playerId
      addRemainingEffects(resolution, [{ ...effect, target: 'self' }])
      return [`${player.mageType} is the target`, ...runEffectResolution(g, resolution)]
    }
    resolution.effectPlayerId = target.playerId
    if (effect.kind === 'draw_cards') {
      const drawn = drawCardsForPlayer(g, target.playerId, effect.amount)
      if (effect.relativeToSource) {
        resolution.effectPlayerId = resolution.sourcePlayerId ?? target.playerId
      }
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
    if (decision.kind !== 'choose_turn_order_position' ||
      (effect.kind !== 'place_revealed_turn_order_card' &&
        !(effect.kind === 'reveal_turn_order_card' && effect.returnChoice))) {
      restore()
      return ['Decision answer has the wrong type']
    }
    const top = g.turnOrderDeck[0]
    if (!top || top !== decision.cardId) {
      restore()
      return ['The revealed turn order card is no longer available']
    }
    if (answer.position === 'bottom') g.turnOrderDeck.push(g.turnOrderDeck.shift()!)
    if (effect.kind === 'reveal_turn_order_card') {
      const branchEffects = top === 'nemesis' ? effect.nemesisEffects : effect.playerEffects
      addRemainingEffects(resolution, branchEffects)
    }
    return [`Placed the revealed turn order card on the ${answer.position}`, ...runEffectResolution(g, resolution)]
  } else {
    if (decision.kind !== 'select_damage_target' ||
      (effect.kind !== 'deal_damage' && effect.kind !== 'deal_damage_divided')) {
      restore()
      return ['Decision answer has the wrong type']
    }
    const target = decision.targets.find(candidate => candidate.id === answer.target.id)
    if (!target) {
      restore()
      return ['Invalid damage target']
    }
    if (effect.kind === 'deal_damage_divided') {
      const allocation = resolution.dividedDamageAllocation
      const currentTarget = getDamageTargets(g, allocation?.target ?? effect.target, resolution.sourceCardId)
        .find(candidate => candidate.id === target.id)
      if (!allocation || allocation.remaining <= 0 || !currentTarget) {
        restore()
        return ['The divided damage allocation is no longer available']
      }
      allocation.amounts[target.id] = (allocation.amounts[target.id] ?? 0) + 1
      allocation.remaining--
      if (allocation.remaining > 0) {
        const targets = getDamageTargets(g, allocation.target, resolution.sourceCardId)
        const nextDecision = createDecision(g,
          `Choose an enemy for 1 of ${allocation.remaining} remaining damage`,
          'select_damage_target', { targets }, resolution.sourceCardId)
        return [`Allocated 1 damage to ${target.label}`,
          ...pauseEffect(g, resolution, effect, nextDecision)]
      }
      const messages: string[] = []
      for (const [targetId, amount] of Object.entries(allocation.amounts)) {
        const finalTarget = getDamageTargets(g, allocation.target, resolution.sourceCardId)
          .find(candidate => candidate.id === targetId)
        if (!finalTarget) continue
        messages.push(dealNemesisTargetDamage(g, resolution, finalTarget, amount))
      }
      resolution.dividedDamageAllocation = undefined
      return [...messages, ...runEffectResolution(g, resolution)]
    }
    const amount = damageEffectAmountValue(
      g, effectPlayerId(g, resolution), effect.amount, effect.additionalDamage,
      resolution.sourceCardId, resolution,
    )
    const message = dealNemesisTargetDamage(g, resolution, target, applySpellDamageBonus(resolution, amount))
    return [message, ...runEffectResolution(g, resolution)]
  }
  return runEffectResolution(g, resolution)
  }
  return resolvePendingDecision
}
