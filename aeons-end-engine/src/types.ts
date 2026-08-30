// ===== Card Types =====
export type CardType = 'gem' | 'relic' | 'spell' | 'attack' | 'minion' | 'power'

export interface CardDef {
  id: string
  name: string
  type: CardType
  cost: number
  set: string
}

export interface GemCard extends CardDef {
  type: 'gem'
  aetherValue: number
  conditionalAether?: {
    amount: number
    condition: string
  }
}

export interface RelicCard extends CardDef {
  type: 'relic'
  drawCount: number
  discardCount: number
}

export interface SpellCard extends CardDef {
  type: 'spell'
  damage: number
  bonusAether?: number
  whilePrepped?: { description: string }
}

export interface NemesisCard extends CardDef {
  type: 'attack' | 'minion' | 'power'
  tier: 1 | 2 | 3
  damage?: number
  lifeTokens?: number
  persistentEffect?: string
  powerTokens?: number
  powerEffect?: string
}

// ===== Breach =====
export type Direction = 'east' | 'south' | 'west' | 'north'

export interface BreachState {
  index: number
  opened: boolean
  prepSpell: string | null
  focusDirection: Direction
  focusCost: number
  focusCount: number
  focusToOpen: number
  openCost: Record<Direction, number>
  focusedThisTurn: boolean
  damageBonus: number
}

// ===== Nemesis Cards In Play =====
export interface NemesisCardInPlay {
  cardId: string
  cardType: 'minion' | 'power'
  placedAt: number
  lifeTokens?: number
  powerTokens?: number
}

export interface UnleashEffect {
  description: string
}

// ===== Game State =====
export interface PlayerState {
  id: string
  mageType: string
  hp: number
  maxHp: number
  deck: string[]
  hand: string[]
  discard: string[]
  playedThisTurn: string[]
  regularAetherSpent: number
  condAetherSpent: Record<string, number>
  bonusAether: number
  breaches: BreachState[]
  charge: number
  chargeThreshold: number
  exhausted: boolean
}

export interface GraveholdState {
  hp: number
  maxHp: number
}

export interface NemesisState {
  type: string
  hp: number
  maxHp: number
  deck: string[]
  discard: string[]
  playArea: NemesisCardInPlay[]
  furyTokens: number
  unleashDescription: string
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

export interface GameState {
  players: PlayerState[]
  nemesis: NemesisState
  gravehold: GraveholdState
  market: MarketState
  turnOrderDeck: string[]
  turnOrderDiscard: string[]
  currentTurn: string
  currentPhase: Phase
  round: number
  gameOver: boolean
  winner: string | null
  timestamp: number
}
