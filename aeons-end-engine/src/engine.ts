import {
  GameState, PlayerState, Phase, Direction,
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
      regularAetherSpent: 0,
      condAetherSpent: {},
      bonusAether: 0,
      breaches: clone(def.breaches),
      charge: 0,
      chargeThreshold: def.chargeThreshold,
      exhausted: false,
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
      furyTokens: 0,
      unleashDescription: rageborne.unleashDescription,
      tierAnnounced: [false, false, false],
    },
    gravehold: { hp: 30, maxHp: 30 },
    market: { piles: marketPiles },
    turnOrderDeck: turnOrder, turnOrderDiscard: [],
    currentTurn: '', currentPhase: 'casting' as Phase,
    round: 1, gameOver: false, winner: null, timestamp: 0,
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

// ===== Aether System =====

export type SpendType = 'gem' | 'spell' | 'relic' | 'general'

export function getTotalAether(p: PlayerState): number {
  let total = 0
  for (const cardId of p.playedThisTurn) {
    const card = getCard(cardId)
    if (card.type === 'gem') {
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
    if (card.type === 'gem') {
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
    if (card.type === 'gem') {
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
    if (c.type === 'gem') {
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
  const p = getPlayer(g, playerId)
  const b = p.breaches.find(br => br.index === breachIndex)
  if (!b?.prepSpell) return 'No spell prepped on this breach'

  const cardDef = getCard(b.prepSpell) as SpellCard
  const totalDmg = cardDef.damage + (b.opened ? b.damageBonus : 0)

  if (totalDmg > 0) {
    damageNemesis(g, totalDmg)
  }
  if (cardDef.bonusAether) {
    p.bonusAether += cardDef.bonusAether
  }

  p.discard.unshift(b.prepSpell)
  const name = cardDef.name
  b.prepSpell = null

  return `Cast ${name}: dealt ${totalDmg} damage to nemesis` +
    (cardDef.bonusAether ? `, +${cardDef.bonusAether} Aether` : '')
}

// ===== Main Phase =====

export function playCard(g: GameState, playerId: string, cardId: string): string | null {
  const p = getPlayer(g, playerId)
  const idx = p.hand.indexOf(cardId)
  if (idx === -1) return 'Card not in hand'

  const card = getCard(cardId)
  if (card.type === 'spell') return 'Spells must be prepped, use "r" command'

  p.hand.splice(idx, 1)
  p.playedThisTurn.push(cardId)

  if (card.type === 'gem') {
    const gem = card as GemCard
    let msg = `Played ${gem.name}: +${gem.aetherValue} Aether`
    if (gem.conditionalAether) msg += ` (+${gem.conditionalAether.amount} for gems)`
    return msg
  }
  return `Played ${card.name}`
}

export function prepSpell(
  g: GameState, playerId: string, cardId: string, breachIndex: number,
): string | null {
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
  }).filter(b => b.remaining > 0)
}

export function buyCard(g: GameState, playerId: string, pileIndex: number): string | null {
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
  pile.remaining--
  p.discard.unshift(pile.cardId)
  return `Bought ${card.name} (${card.cost}a) -> discard pile`
}

export function focusBreach(g: GameState, playerId: string, breachIndex: number): string | null {
  const p = getPlayer(g, playerId)
  const b = p.breaches.find(br => br.index === breachIndex)
  if (!b) return 'Invalid breach'
  if (b.opened) return 'Already open'
  if (b.focusCount >= b.focusToOpen) return 'Already focused'

  const available = getSpendableAether(p, 'general')
  if (available < b.focusCost) return `Need ${b.focusCost} Aether, have ${available}`

  spendAether(p, b.focusCost, 'general')
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

export function openBreach(g: GameState, playerId: string, breachIndex: number): string | null {
  const p = getPlayer(g, playerId)
  const b = p.breaches.find(br => br.index === breachIndex)
  if (!b) return 'Invalid breach'
  if (b.opened) return 'Already open'
  if (b.focusCount < b.focusToOpen) return 'Not enough focus'

  b.opened = true
  return `Breach ${toRoman(breachIndex)} opened!`
}

export function openBreachDirect(g: GameState, playerId: string, breachIndex: number): string | null {
  const p = getPlayer(g, playerId)
  const b = p.breaches.find(br => br.index === breachIndex)
  if (!b) return 'Invalid breach'
  if (b.opened) return 'Already open'

  const cost = b.openCost[b.focusDirection]
  const available = getSpendableAether(p, 'general')
  if (available < cost) return `Need ${cost} Aether (direct open), have ${available}`

  spendAether(p, cost, 'general')
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
    return `${def.abilityName}: cast any prepped spell twice (not fully implemented in CLI)`
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
  p.regularAetherSpent = 0
  p.condAetherSpent = {}
  p.bonusAether = 0
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
  g.nemesis.hp -= amount
  if (g.nemesis.hp <= 0) {
    g.nemesis.hp = 0
    g.gameOver = true
    g.winner = 'players'
  }
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

export function nemesisUnleash(g: GameState): string {
  g.nemesis.furyTokens++
  return `Unleash! Fury: ${g.nemesis.furyTokens - 1} -> ${g.nemesis.furyTokens}`
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
    g.nemesis.furyTokens += 2
    const openB = p.breaches.find(b => b.opened)
    if (openB) { openB.opened = false; openB.prepSpell = null }
    p.charge = 0
    return `${p.mageType} EXHAUSTED! Unleash x2, breach lost, Gravehold -${excess * 2}`
  }
  return null
}

export function canPlayerAct(g: GameState, playerId: string): boolean {
  const p = getPlayer(g, playerId)
  if (p.exhausted) return false

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
    if (!b.opened && b.focusCount < b.focusToOpen && b.focusCost <= aether) return true
    if (!b.opened && b.openCost[b.focusDirection] <= aether) return true
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
