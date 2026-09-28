import type { CardEffect, GemCard } from '../../types'

const returnToDeck: CardEffect = { kind: 'return_trinket_to_deck' }

function trinket(id: string, name: string, effects: CardEffect[]): GemCard {
  return {
    id,
    name,
    type: 'gem',
    cost: 0,
    set: 'wave9',
    mechanics: ['trinket'],
    effects: [{ trigger: { kind: 'on_play' }, effects }],
  }
}

export const TRINKET_CARDS: Record<string, GemCard> = {
  clouded_trinket: trinket('clouded_trinket', 'Clouded Trinket', [
    { kind: 'cast_prepped_spell', source: 'any_prepped_spell', allowSkip: true },
    returnToDeck,
  ]),
  ethereal_trinket: trinket('ethereal_trinket', 'Ethereal Trinket', [
    { kind: 'draw_cards', amount: 1, target: 'ally' },
    returnToDeck,
  ]),
  glittering_trinket: trinket('glittering_trinket', 'Glittering Trinket', [
    { kind: 'gain_aether', amount: 1 },
    { kind: 'gain_aether_token', target: 'ally' },
    returnToDeck,
  ]),
  golden_trinket: trinket('golden_trinket', 'Golden Trinket', [
    { kind: 'gain_aether', amount: 1 },
    { kind: 'gain_conditional_aether', amount: 1, condition: 'gain' },
    returnToDeck,
  ]),
  power_trinket: trinket('power_trinket', 'Power Trinket', [
    { kind: 'gain_charge', amount: 1, target: 'self' },
    returnToDeck,
  ]),
}

export const TRINKET_DECK_CARD_IDS = [
  'clouded_trinket', 'clouded_trinket',
  'ethereal_trinket', 'ethereal_trinket', 'ethereal_trinket',
  'glittering_trinket', 'glittering_trinket', 'glittering_trinket',
  'golden_trinket', 'golden_trinket',
  'power_trinket', 'power_trinket', 'power_trinket',
] as const

/** Build and shuffle the fixed Trinket deck composition. */
export function buildTrinketDeck(random: () => number = Math.random): string[] {
  const deck = [...TRINKET_DECK_CARD_IDS]
  for (let index = deck.length - 1; index > 0; index--) {
    const swapIndex = Math.floor(random() * (index + 1))
    ;[deck[index], deck[swapIndex]] = [deck[swapIndex]!, deck[index]!]
  }
  return deck
}
