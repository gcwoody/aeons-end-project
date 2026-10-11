import { getCard } from '../data'
import { createCardInZone, getNemesisCardInstanceZone } from '../engine/card-movement'
import type { NemesisRuleModule } from './types'

/** Prince of Gluttons-specific Devour behavior after the shared Unleash keyword. */
export const princeOfGluttonsRules: NemesisRuleModule = {
  id: 'prince_of_gluttons',
  unleashEffects: [{ kind: 'devour_market_cards', amount: 3, pile: 'least_expensive' }],
  setup: ({ game, definition, marketPileChoices, createDecision }) => {
    // Standard setup places one card from each Gem supply into the Devoured pile.
    const gemPiles = marketPileChoices(game, 'gem')
      .sort((left, right) => getCard(right.cardId).cost - getCard(left.cardId).cost)
    for (const choice of gemPiles) {
      const pile = game.market.piles[choice.pileIndex]!
      if (pile.remaining <= 0) continue
      pile.remaining--
      createCardInZone(game, getNemesisCardInstanceZone(game, 'strike_deck'), pile.cardId, 0, 'setup')
    }

    const additionalChoices = game.nemesis.difficulty === 'increased'
      ? (definition.increasedDifficultyRules.additionalSetupDevours ?? 0)
      : 0
    if (additionalChoices <= 0) return

    const candidates = marketPileChoices(game).filter(candidate => candidate.remaining > 0)
    if (candidates.length === 0) return
    game.pendingDecision = createDecision(
      `Choose a supply pile to Devour (${additionalChoices} remaining)`,
      'select_setup_devour_pile',
      { candidates, remainingChoices: additionalChoices },
    )
  },
}
