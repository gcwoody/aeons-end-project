import {
  CardDef, GemCard, RelicCard, SpellCard, NemesisCard,
  BreachState, Direction, NemesisCardInPlay,
} from './types'

// ===== Rotation Helpers =====
// Clockwise rotation
const rotateCW = (d: Direction): Direction =>
  ({ east: 'south', south: 'west', west: 'north', north: 'open' }[d] as Direction)

function focusesToOpen(startDir: Direction): number {
  return { east: 4, south: 3, west: 2, north: 1 }[startDir]
}

function calcOpenCosts(startDir: Direction, focusCost: number): Record<Direction, number> {
  const result: Partial<Record<Direction, number>> = {}
  let dir = startDir
  let remaining = focusesToOpen(startDir)
  while (remaining > 0) {
    result[dir] = remaining * focusCost - (remaining - 1)
    dir = rotateCW(dir)
    remaining--
  }
  return result as Record<Direction, number>
}

// ===== Initial Cards =====
// Spark and Crystal are shared by all mages
export const spark: SpellCard = {
  id: 'spark', name: 'Spark', type: 'spell', cost: 0, set: 'base', damage: 1,
  effects: [{
    trigger: { kind: 'on_cast' },
    effects: [{ kind: 'deal_damage', amount: 1, target: 'nemesis_or_minion' }],
  }],
}

export const crystal: GemCard = {
  id: 'crystal', name: 'Crystal', type: 'gem', cost: 0, set: 'base', aetherValue: 1,
}

// Moonstone Shard is Jian's unique starting card
export const moonstoneShard: GemCard = {
  id: 'moonstone_shard', name: 'Moonstone Shard', type: 'gem', cost: 0, set: 'base',
  aetherValue: 1, conditionalAether: { amount: 1, condition: 'gem' },
}

// Buried Light is Brama's unique starting card
export const buriedLight: SpellCard = {
  id: 'buried_light', name: 'Buried Light', type: 'spell', cost: 0, set: 'base',
  damage: 1, bonusAether: 1,
}

// Lookup table for all initial cards (used by getCard)
export const INITIAL_CARDS: Record<string, CardDef> = {
  spark, crystal, moonstone_shard: moonstoneShard, buried_light: buriedLight,
}

// ===== Mage Unique Cards =====
export const MAGE_UNIQUE_CARDS: Record<string, string[]> = {
  jian: ['moonstone_shard'],
  brama: ['buried_light'],
}

// ===== Supply Cards (wave 1) =====
export const vriswoodAmber: GemCard = {
  id: 'vriswood_amber', name: "V'riswood Amber", type: 'gem', cost: 3, set: 'wave1', aetherValue: 2,
  effects: [
    {
      trigger: { kind: 'on_play' },
      effects: [{ kind: 'gain_aether', amount: 2 }],
    },
    {
      trigger: { kind: 'on_gain' },
      effects: [{
        kind: 'choose_optional',
        prompt: 'Place V\'riswood Amber on top of your deck?',
        effects: [{ kind: 'move_gained_card', destination: 'deck_top' }],
      }],
    },
  ],
}
export const diamondCluster: GemCard = {
  id: 'diamond_cluster', name: 'Diamond Cluster', type: 'gem', cost: 4, set: 'wave1', aetherValue: 2,
  effects: [
    {
      trigger: { kind: 'on_play' },
      effects: [{ kind: 'gain_aether', amount: 2 }],
    },
    {
      trigger: { kind: 'on_play' },
      condition: {
        kind: 'card_play_count_this_turn',
        cardId: 'diamond_cluster',
        comparison: 'equals',
        count: 2,
      },
      effects: [{ kind: 'gain_aether', amount: 2 }],
    },
  ],
}
export const burningOpal: GemCard = {
  id: 'burning_opal', name: 'Burning Opal', type: 'gem', cost: 5, set: 'wave1', aetherValue: 3,
  effects: [
    {
      trigger: { kind: 'on_play' },
      effects: [
        { kind: 'gain_aether', amount: 3 },
        {
          kind: 'choose_optional',
          prompt: 'Discard a card to let an ally draw a card?',
          effects: [
            { kind: 'discard_cards', source: 'hand', amount: 1 },
            { kind: 'draw_cards', amount: 1, target: 'ally' },
          ],
        },
      ],
    },
  ],
}
export const flexingDagger: RelicCard = {
  id: 'flexing_dagger', name: 'Flexing Dagger', type: 'relic',
  cost: 2, set: 'wave1', drawCount: 0, discardCount: 0,
  effects: [{
    trigger: { kind: 'on_play' },
    effects: [{
      kind: 'choose_one',
      prompt: 'Choose a Flexing Dagger effect',
      options: [
        {
          id: 'reduce_breach_cost',
          label: 'Reduce the next focus or open cost by 3',
          effects: [{ kind: 'modify_next_breach_cost', amount: 3, actions: ['focus', 'open'] }],
        },
        {
          id: 'destroy_for_damage',
          label: 'Destroy this to deal 1 damage',
          effects: [
            { kind: 'destroy_cards', source: 'self' },
            { kind: 'deal_damage', amount: 1, target: 'nemesis_or_minion' },
          ],
        },
      ],
    }],
  }],
}
export const bottledVortex: RelicCard = {
  id: 'bottled_vortex', name: 'Bottled Vortex', type: 'relic',
  cost: 3, set: 'wave1', drawCount: 0, discardCount: 0,
  effects: [{
    trigger: { kind: 'on_play' },
    effects: [
      { kind: 'destroy_cards', source: 'self' },
      { kind: 'destroy_cards', source: 'hand_or_discard', maxAmount: 2 },
      { kind: 'draw_cards', amount: 1 },
    ],
  }],
}
export const lavaTendril: SpellCard = {
  id: 'lava_tendril', name: 'Lava Tendril', type: 'spell', cost: 4, set: 'wave1', damage: 3,
  effects: [
    {
      trigger: { kind: 'while_prepped', phase: 'casting_phase_end' },
      oncePerTurn: true,
      requiresConfirmation: true,
      effects: [{ kind: 'deal_damage', amount: 1, target: 'nemesis_or_minion' }],
    },
    {
      trigger: { kind: 'on_cast' },
      effects: [{ kind: 'deal_damage', amount: 3, target: 'nemesis_or_minion' }],
    },
  ],
}
export const essenceTheft: SpellCard = {
  id: 'essence_theft', name: 'Essence Theft', type: 'spell', cost: 5, set: 'wave1', damage: 3,
  effects: [{
    trigger: { kind: 'on_cast' },
    effects: [
      { kind: 'deal_damage', amount: 3, target: 'nemesis_or_minion' },
      {
        kind: 'choose_optional',
        prompt: 'Discard a card so any player gains 1 life?',
        effects: [
          { kind: 'discard_cards', source: 'hand', amount: 1 },
          { kind: 'gain_life', amount: 1, target: 'any_player' },
        ],
      },
    ],
  }],
}
export const planarInsight: SpellCard = {
  id: 'planar_insight', name: 'Planar Insight', type: 'spell', cost: 6, set: 'wave1',
  damage: 2,
  effects: [{
    trigger: { kind: 'on_cast' },
    effects: [{
      kind: 'deal_damage',
      amount: { kind: 'per_open_breach', base: 2, amountPerBreach: 1 },
      target: 'nemesis_or_minion',
    }],
  }],
}
export const arcaneNexus: SpellCard = {
  id: 'arcane_nexus', name: 'Arcane Nexus', type: 'spell', cost: 7, set: 'wave1', damage: 4,
  effects: [
    {
      trigger: { kind: 'while_prepped', phase: 'main_phase' },
      oncePerTurn: true,
      effects: [{
        kind: 'choose_optional',
        prompt: 'Return a gem played this turn to your hand?',
        effects: [{ kind: 'return_card_to_hand', source: 'played_gem_this_turn' }],
      }],
    },
    {
      trigger: { kind: 'on_cast' },
      effects: [{ kind: 'deal_damage', amount: 4, target: 'nemesis_or_minion' }],
    },
  ],
}

export const MARKET_CARDS: Record<string, CardDef> = {
  vriswood_amber: vriswoodAmber,
  diamond_cluster: diamondCluster,
  burning_opal: burningOpal,
  flexing_dagger: flexingDagger,
  bottled_vortex: bottledVortex,
  lava_tendril: lavaTendril,
  essence_theft: essenceTheft,
  planar_insight: planarInsight,
  arcane_nexus: arcaneNexus,
}

export function getCard(id: string): CardDef {
  return INITIAL_CARDS[id] ?? MARKET_CARDS[id] ?? NEMESIS_CARDS[id]
}

// ===== Nemesis Cards (Rageborne Demo) =====
function makeAttackCards(
  tier: 1 | 2 | 3, count: number, damage: number,
): Record<string, NemesisCard> {
  const result: Record<string, NemesisCard> = {}
  for (let i = 1; i <= count; i++) {
    const id = `attack_t${tier}_${i}`
    result[id] = {
      id, name: `Tier ${tier} Attack #${i}`, type: 'attack',
      cost: 0, set: 'rageborne', tier, damage,
    }
  }
  return result
}

export const NEMESIS_CARDS: Record<string, CardDef> = {
  ...makeAttackCards(1, 6, 1),
  ...makeAttackCards(2, 8, 2),
  ...makeAttackCards(3, 10, 3),
}

// ===== Breach Configuration =====
export function makeBreach(
  index: number, opened: boolean, startDir: Direction | null, focusCost: number,
): BreachState {
  if (opened) {
    return {
      index, opened: true, prepSpell: null,
      focusDirection: 'north', focusCost: 0, focusCount: 0, focusToOpen: 0,
      openCost: { east: 0, south: 0, west: 0, north: 0 },
      focusedThisTurn: false,
      damageBonus: index >= 3 ? 1 : 0,
    }
  }
  const dir = startDir!
  return {
    index, opened: false, prepSpell: null,
    focusDirection: dir, focusCost, focusCount: 0,
    focusToOpen: focusesToOpen(dir),
    openCost: calcOpenCosts(dir, focusCost),
    focusedThisTurn: false,
    damageBonus: index >= 3 ? 1 : 0,
  }
}

// ===== Mage Definitions =====
export interface MageDef {
  type: string
  abilityName: string
  abilityDesc: string
  hp: number
  chargeThreshold: number
  startHand: string[]
  startDeck: string[]
  breaches: BreachState[]
}

export const jian: MageDef = {
  type: 'jian',
  abilityName: 'Black Mirror',
  abilityDesc: 'Cast any prepped spell twice without discarding it',
  hp: 10,
  chargeThreshold: 4,
  startHand: ['spark', 'spark', 'crystal', 'crystal', 'moonstone_shard'],
  startDeck: ['crystal', 'crystal', 'crystal', 'spark', 'spark'],
  breaches: [
    makeBreach(1, true, null, 0),
    makeBreach(2, true, null, 0),
    makeBreach(3, false, 'east', 3),
    makeBreach(4, false, 'south', 4),
  ],
}

export const brama: MageDef = {
  type: 'brama',
  abilityName: 'Brink Siphon',
  abilityDesc: 'Any player gains 4 life',
  hp: 10,
  chargeThreshold: 5,
  startHand: ['buried_light', 'crystal', 'crystal', 'crystal', 'crystal'],
  startDeck: ['crystal', 'crystal', 'crystal', 'spark', 'spark'],
  breaches: [
    makeBreach(1, true, null, 0),
    makeBreach(2, false, 'south', 2),
    makeBreach(3, false, 'east', 3),
    makeBreach(4, false, 'west', 4),
  ],
}

export const MAGES: Record<string, MageDef> = { jian, brama }

// ===== Nemesis Definition =====
const nemesisDeck: string[] = [
  ...Array.from({ length: 6 }, (_, i) => `attack_t1_${i + 1}`),
  ...Array.from({ length: 8 }, (_, i) => `attack_t2_${i + 1}`),
  ...Array.from({ length: 10 }, (_, i) => `attack_t3_${i + 1}`),
]

export const rageborne = {
  type: 'rageborne',
  hp: 70,
  deck: [...nemesisDeck],
}
