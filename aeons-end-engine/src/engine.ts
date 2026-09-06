import {
  GameState, PlayerState, Phase, Direction,
  CardChoice, CardGainDestination, CardSelectionSource, CardZone,
  DamageTargetRef, DamageTargetScope, LifeTargetRef, LifeTargetScope,
  PendingDecision, PendingDecisionAnswer, PendingEffectResolution,
  CardEffect, CardEffectBlock, CardEffectCondition, CardEffectOption,
  CardEffectTrigger, PlayerTargetRef, PlayerTargetScope, PlayerTurnEffects,
} from './types'
import { getCard, MAGES, rageborne, MARKET_CARDS } from './data'
import type { GemCard, SpellCard, NemesisCard, RelicCard } from './types'
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

export function createGame(mage1Type: string, mage2Type: string): GameState {
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

  const t1 = shuffle(Array.from({ length: 6 }, (_, i) => `attack_t1_${i + 1}`))
  const t2 = shuffle(Array.from({ length: 8 }, (_, i) => `attack_t2_${i + 1}`))
  const t3 = shuffle(Array.from({ length: 10 }, (_, i) => `attack_t3_${i + 1}`))
  const nemesisDeck = [...t1, ...t2, ...t3]
  const turnOrder = shuffle(['p1', 'p1', 'p2', 'p2', 'nemesis', 'nemesis'])

  return {
    players: [player1, player2],
    nemesis: {
      type: 'rageborne',
      hp: rageborne.hp, maxHp: rageborne.hp,
      deck: nemesisDeck, discard: [], playArea: [],
      tierAnnounced: [false, false, false],
    },
    gravehold: { hp: 30, maxHp: 30 },
    market: { piles: marketPiles },
    turnOrderDeck: turnOrder, turnOrderDiscard: [],
    currentTurn: '', currentPhase: 'casting' as Phase,
    round: 1, gameOver: false, winner: null, timestamp: 0,
    pendingDecision: null,
    pendingEffect: null,
    decisionCounter: 0,
  }
}

// ===== Turn Management =====

export function startTurn(g: GameState): GameState {
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
  return g
}

export function getPlayer(g: GameState, id: string): PlayerState {
  return g.players.find(p => p.id === id)!
}

function pendingActionMessage(g: GameState): string | null {
  return g.pendingDecision ? 'Resolve the pending card decision first' : null
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
  if (!p.turnEffects) {
    p.turnEffects = {
      nextBreachCostReductions: [],
      usedPreppedEffects: [],
    }
  }
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

export function getDamageTargets(g: GameState, scope: DamageTargetScope): DamageTargetRef[] {
  const targets: DamageTargetRef[] = []
  if (scope === 'nemesis' || scope === 'nemesis_or_minion') {
    targets.push({ kind: 'nemesis', id: 'nemesis', label: 'Nemesis' })
  }
  if (scope === 'minion' || scope === 'nemesis_or_minion') {
    for (const minion of g.nemesis.playArea) {
      if (minion.cardType !== 'minion') continue
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

function hasTrigger(cardId: string, trigger: CardEffectTrigger['kind']): boolean {
  return (getCard(cardId).effects ?? []).some(block => block.trigger.kind === trigger)
}

function amountValue(
  g: GameState,
  playerId: string,
  amount: Extract<CardEffect, { kind: 'deal_damage' }>['amount'],
): number {
  if (typeof amount === 'number') return Math.max(0, amount)
  const openBreaches = getPlayer(g, playerId).breaches.filter(b => b.opened).length
  return Math.max(0, amount.base + openBreaches * amount.amountPerBreach)
}

function spellBreachDamageBonus(breach: PlayerState['breaches'][number]): number {
  return breach.opened && breach.index >= 3 ? 1 : 0
}

function applySpellDamageBonus(resolution: PendingEffectResolution, amount: number): number {
  const bonus = resolution.spellDamageBonus ?? 0
  return bonus > 0 ? amount + bonus : amount
}

function conditionMatches(g: GameState, playerId: string, condition?: CardEffectCondition): boolean {
  if (!condition) return true
  const p = getPlayer(g, playerId)
  let value = 0
  let expected = 0

  if (condition.kind === 'card_play_count_this_turn') {
    ensurePlayerCollections(p)
    value = p.cardPlayCountsThisTurn[condition.cardId] ?? 0
    expected = condition.count
  } else {
    value = p.breaches.filter(b => b.opened).length
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

function runEffectResolution(
  g: GameState, resolution: PendingEffectResolution,
): string[] {
  const messages: string[] = []
  g.pendingEffect = null

  while (resolution.remainingEffects.length > 0) {
    const effect = resolution.remainingEffects.shift()!
    const p = getPlayer(g, resolution.playerId)

    if (effect.kind === 'confirm_prepped_effect') {
      const decision = createDecision(
        g,
        resolution.playerId,
        effect.prompt,
        'confirm_prepped_effect',
        { cardId: effect.cardId, breachIndex: effect.breachIndex },
        resolution.sourceCardId,
      )
      messages.push(...pauseEffect(g, resolution, effect, decision))
      return messages
    }

    if (effect.kind === 'gain_aether') {
      const amount = Math.max(0, effect.amount)
      p.bonusAether += amount
      messages.push(`${p.mageType} gains ${amount} Aether`)
      continue
    }

    if (effect.kind === 'deal_damage') {
      const amount = amountValue(g, resolution.playerId, effect.amount)
      const targets = getDamageTargets(g, effect.target)
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

    if (effect.kind === 'draw_cards') {
      const targets = getPlayerTargets(g, resolution.playerId, effect.target ?? 'self')
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
      messages.push(`${target.mageType} draws ${drawn} card(s)`)
      continue
    }

    if (effect.kind === 'gain_life') {
      const targets = getLifeTargets(g, resolution.playerId, effect.target)
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
      const message = gainCard(g, resolution.playerId, effect.cardId, destination, marketPileIndex, false)
      if (message) {
        resolution.lastGainedCardId = effect.cardId
        const followups = matchingBlocks(effect.cardId, resolution.playerId, g, { kind: 'on_gain' })
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
      const candidates = getCardChoices(g, resolution.playerId, effect.source)
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
      const removed = discardSelectedCards(g, resolution.playerId, candidates.slice(0, amount))
      messages.push(`Discarded ${removed.map(id => getCard(id).name).join(', ')}`)
      continue
    }

    if (effect.kind === 'destroy_cards') {
      if (effect.source === 'self') {
        const selfChoice = getCardChoices(g, resolution.playerId, 'hand_or_discard')
          .find(choice => choice.cardId === resolution.sourceCardId)
          ?? getZoneCards(getPlayer(g, resolution.playerId), 'played_this_turn')
            .map((cardId, index) => ({ zone: 'played_this_turn' as CardZone, index, cardId, cardName: getCard(cardId).name }))
            .find(choice => choice.cardId === resolution.sourceCardId)
        if (!selfChoice) {
          messages.push('Source card is no longer available to destroy')
        } else {
          const message = destroyCard(g, resolution.playerId, selfChoice)
          if (message) messages.push(message)
        }
        continue
      }

      const source = effect.source as CardSelectionSource
      const candidates = getCardChoices(g, resolution.playerId, source)
      const max = Math.min(effect.maxAmount ?? 1, candidates.length)
      if (max === 0) {
        messages.push('No cards available to destroy')
        continue
      }
      const decision = createDecision(
        g, resolution.playerId, `Choose up to ${max} card(s) to destroy`, 'select_cards',
        { source, candidates, min: 0, max }, resolution.sourceCardId,
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
        { options: options.map(option => ({ id: option.id, label: option.label })) }, resolution.sourceCardId,
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

    if (effect.kind === 'return_card_to_hand') {
      const candidates = getCardChoices(g, resolution.playerId, effect.source)
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
      const returned = returnSelectedCard(g, resolution.playerId, candidates[0]!)
      if (returned) messages.push(`Returned ${getCard(returned).name} to hand`)
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

  g.pendingEffect = null
  return messages
}

/** Resolve the matching effect blocks for a card event. */
export function resolveCardEffects(
  g: GameState, playerId: string, sourceCardId: string, trigger: CardEffectTrigger,
  lastGainedCardId?: string, spellDamageBonus = 0,
): string[] {
  if (g.pendingDecision || g.pendingEffect) return ['Another card effect is already waiting for a decision']
  const blocks = matchingBlocks(sourceCardId, playerId, g, trigger)
  if (blocks.length === 0) return []
  return runEffectResolution(g, {
    playerId,
    sourceCardId,
    remainingEffects: blocks.flatMap(block => block.effects),
    lastGainedCardId,
    spellDamageBonus,
  })
}

export interface PreppedCardAction {
  breachIndex: number
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
    if (!breach.prepSpell) continue
    const blocks = matchingBlocks(breach.prepSpell, playerId, g, { kind: 'while_prepped', phase })
    for (const [blockIndex, block] of blocks.entries()) {
      const effect = findReturnCardEffect(block.effects)
      if (!effect || !isDeferredReturnAction(block.effects)) continue
      const marker = `${breach.prepSpell}:${breach.index}:${phase}:${blockIndex}`
      if (block.oncePerTurn && turnEffects.usedPreppedEffects.includes(marker)) continue
      const choices = getCardChoices(g, playerId, effect.source)
      if (choices.length === 0) continue
      actions.push({ breachIndex: breach.index, cardId: breach.prepSpell, kind: effect.kind, choices, marker })
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
  const block = breach?.prepSpell
    ? matchingBlocks(breach.prepSpell, playerId, g, { kind: 'while_prepped', phase: 'main_phase' })
      .find((item, index) => `${breach.prepSpell}:${breach.index}:main_phase:${index}` === action.marker)
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
    if (!breach.prepSpell) continue
    const cardId = breach.prepSpell
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
            effects: block.effects,
          }]
        : block.effects
      if (!block.oncePerTurn) {
        allEffects.push(...blockEffects)
        continue
      }
      const marker = `${cardId}:${breach.index}:${phase}:${blockIndex}`
      if (turnEffects.usedPreppedEffects.includes(marker) || seen.has(marker)) continue
      seen.add(marker)
      turnEffects.usedPreppedEffects.push(marker)
      allEffects.push(...blockEffects)
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
  const resolution = g.pendingEffect
  if (!decision || !resolution) return ['No pending card decision']
  if (decision.id !== decisionId) return ['Stale card decision']
  if (decision.kind !== answer.kind) return ['Decision answer has the wrong type']
  if (decision.playerId !== resolution.playerId) return ['Decision player mismatch']

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
    ) {
      restore()
      return ['Invalid prepped effect confirmation']
    }
    addRemainingEffects(resolution, effect.effects)
  } else if (answer.kind === 'choose_one') {
    if (decision.kind !== 'choose_one') return ['Decision answer has the wrong type']
    const source = effect.kind === 'choose_one' ? effect.options.find(option => option.id === answer.optionId) : undefined
    if (!source) {
      g.pendingDecision = decision
      resolution.awaiting = effect
      return ['Invalid choice']
    }
    addRemainingEffects(resolution, source.effects)
  } else if (answer.kind === 'choose_optional') {
    if (decision.kind !== 'choose_optional' || effect.kind !== 'choose_optional') return ['Decision answer has the wrong type']
    if (answer.accepted) addRemainingEffects(resolution, effect.effects)
  } else if (answer.kind === 'select_cards') {
    if (decision.kind !== 'select_cards') return ['Decision answer has the wrong type']
    const selected = answer.choices
    if (selected.length < decision.min || selected.length > decision.max) {
      restore()
      return [`Choose between ${decision.min} and ${decision.max} card(s)`]
    }
    if (!selectedChoicesAreCurrent(g, resolution.playerId, decision.candidates, selected)) {
      restore()
      return ['Card selection is no longer valid']
    }
    if (effect.kind === 'discard_cards') {
      if (!selected.every(choice => cardChoiceMatches(choice, effect.source))) {
        restore()
        return ['Invalid card source']
      }
      const removed = discardSelectedCards(g, resolution.playerId, selected)
      return [`Discarded ${removed.map(id => getCard(id).name).join(', ')}`, ...runEffectResolution(g, resolution)]
    }
    if (effect.kind === 'destroy_cards') {
      if (effect.source !== 'self' && !selected.every(choice => cardChoiceMatches(choice, effect.source as CardSelectionSource))) {
        restore()
        return ['Invalid card source']
      }
      const removed = removeSelectedCards(g, resolution.playerId, selected)
      const p = getPlayer(g, resolution.playerId)
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
      const returned = returnSelectedCard(g, resolution.playerId, choice)
      if (!returned) {
        restore()
        return ['Card selection is no longer valid']
      }
      return [`Returned ${getCard(returned).name} to hand`, ...runEffectResolution(g, resolution)]
    }
    restore()
    return ['Card selection does not match the pending effect']
  } else if (answer.kind === 'select_player_target') {
    if (decision.kind !== 'select_player_target' || effect.kind !== 'draw_cards') {
      restore()
      return ['Decision answer has the wrong type']
    }
    const target = decision.targets.find(candidate => candidate.playerId === answer.target.playerId)
    if (!target) {
      restore()
      return ['Invalid player target']
    }
    const player = getPlayer(g, target.playerId)
    const drawn = drawCardsForPlayer(g, target.playerId, effect.amount)
    return [`${player.mageType} draws ${drawn} card(s)`, ...runEffectResolution(g, resolution)]
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
    const amount = amountValue(g, resolution.playerId, effect.amount)
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
  let total = 0
  for (const cardId of p.playedThisTurn) {
    const card = getCard(cardId)
    if (card.type === 'gem' && !hasTrigger(cardId, 'on_play')) {
      const gem = card as GemCard
      total += gem.aetherValue
      if (gem.conditionalAether) total += gem.conditionalAether.amount
    }
  }
  return total + p.bonusAether
}

/** Total conditional aether of a specific type earned this turn. */
export function getConditionalAetherByType(p: PlayerState, type: string): number {
  let total = 0
  for (const cardId of p.playedThisTurn) {
    const card = getCard(cardId)
    if (card.type === 'gem' && !hasTrigger(cardId, 'on_play')) {
      const gem = card as GemCard
      if (gem.conditionalAether?.condition === type) total += gem.conditionalAether.amount
    }
  }
  return total
}

/** Remaining unspent conditional aether of a given type. */
export function getRemainingConditionalAether(p: PlayerState, type: string): number {
  return Math.max(0, getConditionalAetherByType(p, type) - (p.condAetherSpent[type] ?? 0))
}

/** All remaining conditional aether, keyed by type. */
export function getAllRemainingConditional(p: PlayerState): Record<string, number> {
  const result: Record<string, number> = {}
  for (const cardId of p.playedThisTurn) {
    const card = getCard(cardId)
    if (card.type === 'gem' && !hasTrigger(cardId, 'on_play')) {
      const gem = card as GemCard
      if (gem.conditionalAether) {
        const t = gem.conditionalAether.condition
        result[t] = Math.max(0, (result[t] ?? 0) + gem.conditionalAether.amount)
      }
    }
  }
  for (const [k, v] of Object.entries(p.condAetherSpent)) {
    result[k] = Math.max(0, (result[k] ?? 0) - v)
  }
  return result
}

function getAllCondTotal(p: PlayerState): number {
  let t = 0
  for (const id of p.playedThisTurn) {
    const c = getCard(id)
    if (c.type === 'gem' && !hasTrigger(id, 'on_play')) {
      const gem = c as GemCard
      if (gem.conditionalAether) t += gem.conditionalAether.amount
    }
  }
  return t
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
  breachIndex: number; cardId: string; cardName: string; mustCast: boolean
}

export function getCastableSpells(g: GameState, playerId: string): CastableSpell[] {
  const p = getPlayer(g, playerId)
  return p.breaches
    .filter(b => b.prepSpell)
    .map(b => ({
      breachIndex: b.index,
      cardId: b.prepSpell!,
      cardName: getCard(b.prepSpell!).name,
      mustCast: !b.opened,
    }))
}

export function castSpell(g: GameState, playerId: string, breachIndex: number): string | null {
  const blocked = pendingActionMessage(g)
  if (blocked) return blocked
  const p = getPlayer(g, playerId)
  const b = p.breaches.find(br => br.index === breachIndex)
  if (!b?.prepSpell) return 'No spell prepped on this breach'

  const cardDef = getCard(b.prepSpell) as SpellCard
  const typedCast = hasTrigger(cardDef.id, 'on_cast')
  const spellDamageBonus = spellBreachDamageBonus(b)
  const totalDmg = typedCast ? 0 : cardDef.damage + spellDamageBonus

  if (totalDmg > 0) {
    damageNemesis(g, totalDmg)
  }
  if (!typedCast && cardDef.bonusAether) {
    p.bonusAether += cardDef.bonusAether
  }

  p.discard.unshift(b.prepSpell)
  const name = cardDef.name
  b.prepSpell = null

  const messages = [`Cast ${name}: dealt ${totalDmg} damage to nemesis` +
    (!typedCast && cardDef.bonusAether ? `, +${cardDef.bonusAether} Aether` : '')]
  if (typedCast) {
    messages.push(...resolveCardEffects(g, playerId, cardDef.id, { kind: 'on_cast' }, undefined, spellDamageBonus))
  }
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

  const typedPlay = hasTrigger(cardId, 'on_play')
  if (card.type === 'gem' && !typedPlay) {
    const gem = card as GemCard
    let msg = `Played ${gem.name}: +${gem.aetherValue} Aether`
    if (gem.conditionalAether) msg += ` (+${gem.conditionalAether.amount} for gems)`
    return msg
  }
  const messages = [`Played ${card.name}`]
  if (typedPlay) messages.push(...resolveCardEffects(g, playerId, cardId, { kind: 'on_play' }))
  return messages.join('; ')
}

export function prepSpell(
  g: GameState, playerId: string, cardId: string, breachIndex: number,
): string | null {
  const blocked = pendingActionMessage(g)
  if (blocked) return blocked
  const p = getPlayer(g, playerId)
  const idx = p.hand.indexOf(cardId)
  if (idx === -1) return 'Card not in hand'

  const card = getCard(cardId)
  if (card.type !== 'spell') return 'Only spell cards can be prepped'

  const b = p.breaches.find(br => br.index === breachIndex)
  if (!b) return 'Invalid breach'
  if (b.prepSpell) return 'Breach already has a spell'
  if (!b.opened && !b.focusedThisTurn) return 'Cannot prep on this breach'

  p.hand.splice(idx, 1)
  b.prepSpell = cardId
  return `Prepped ${card.name} on Breach ${toRoman(breachIndex)}`
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
  if (!b) return 'Invalid breach'
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
  if (!b) return null
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
  if (!b) return 'Invalid breach'
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
  if (!b) return 'Invalid breach'
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
  g: GameState, playerId: string, targetPlayerId?: string,
): string | null {
  const p = getPlayer(g, playerId)
  if (p.charge < p.chargeThreshold) return `Need ${p.chargeThreshold} charge, have ${p.charge}`
  if (p.exhausted) return 'Mage is exhausted'

  const def = MAGES[p.mageType]!
  p.charge = 0

  if (def.abilityName === 'Brink Siphon') {
    const target = getPlayer(g, targetPlayerId ?? playerId)
    target.hp = Math.min(target.hp + 4, target.maxHp)
    return `${def.abilityName}: ${target.mageType} gains 4 life (${target.hp}/${target.maxHp})`
  }

  if (def.abilityName === 'Black Mirror') {
    return `${def.abilityName}: cast any prepped spell twice (not fully implemented)`
  }

  return 'Ability activated'
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
  p.regularAetherSpent = 0
  p.condAetherSpent = {}
  p.bonusAether = 0
  const turnEffects = getPlayerTurnEffects(p)
  turnEffects.nextBreachCostReductions = []
  turnEffects.usedPreppedEffects = []
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
    const before = g.gravehold.hp
    g.gravehold.hp = Math.max(0, before - value)
    return `Gravehold takes ${before - g.gravehold.hp} damage (${g.gravehold.hp}/${g.gravehold.maxHp})`
  }

  const minion = g.nemesis.playArea.find(card =>
    card.cardType === 'minion' && card.placedAt === target.placedAt,
  )
  if (!minion) return `Target ${target.label} is no longer in play`
  const before = Math.max(0, minion.lifeTokens ?? 0)
  minion.lifeTokens = Math.max(0, before - value)
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
  const card = getCard(cardId) as NemesisCard

  return { cardId, cardName: card.name, tier: card.tier, damage: card.damage ?? 0 }
}

export function nemesisResolveAttack(
  g: GameState, target: 'p1' | 'p2' | 'gravehold', damage: number,
): string {
  if (target === 'gravehold') {
    g.gravehold.hp -= damage
    return `Gravehold takes ${damage} damage (${g.gravehold.hp}/${g.gravehold.maxHp})`
  }
  const p = getPlayer(g, target)
  p.hp -= damage
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
    p.hp = 0
    p.exhausted = true
    const excess = Math.abs(p.hp)
    g.gravehold.hp -= excess * 2
    const openB = p.breaches.find(b => b.opened)
    if (openB) { openB.opened = false; openB.prepSpell = null }
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
    p.breaches.some(b => (b.opened || b.focusedThisTurn) && !b.prepSpell)) return true

  const aether = getSpendableAether(p, 'general')

  // Can buy something from market
  for (const pile of g.market.piles) {
    if (pile.remaining > 0 && getCard(pile.cardId).cost <= aether) return true
  }

  // Can focus or open a breach
  for (const b of p.breaches) {
    const focusCost = Math.max(0, b.focusCost - breachCostReduction(p, 'focus'))
    const openCost = Math.max(0, b.openCost[b.focusDirection] - breachCostReduction(p, 'open'))
    if (!b.opened && b.focusCount < b.focusToOpen && focusCost <= aether) return true
    if (!b.opened && openCost <= aether) return true
  }

  // Can gain charge
  if (aether >= 2 && p.charge < p.chargeThreshold) return true

  // Can activate ability
  if (p.charge >= p.chargeThreshold) return true

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
