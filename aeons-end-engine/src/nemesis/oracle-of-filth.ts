import { getCard } from '../data'
import { createCardInstance } from '../engine/card-instances'
import { recordCardCreation } from '../engine/card-movement'
import type { NemesisRuleModule } from './types'

const PUPIL_ID = 'pupil_of_oblivion'
/** Oracle of Filth's setup and Unleash are kept out of the shared turn loop. */
export const oracleOfFilthRules: NemesisRuleModule = {
  id: 'oracle_of_filth',
  unleashEffects: [{ kind: 'gain_minion_life', minionCardId: PUPIL_ID, amount: 4 }],
  setup: ({ game, marketPileChoices, createDecision }) => {
    const pupil = getCard(PUPIL_ID)
    const counter = (game.nemesis.cardInstanceCounter ?? 0) + 1
    game.nemesis.cardInstanceCounter = counter
    const instanceId = `oracle-starting-minion:${counter}`
    game.nemesis.playArea.push({
      cardId: PUPIL_ID,
      cardType: 'minion',
      placedAt: counter,
      instanceId,
      lifeTokens: 2,
      displayRow: 'top',
    })
    createCardInstance(game, PUPIL_ID, true, instanceId)
    recordCardCreation(game, instanceId, pupil.id, {
      zoneId: 'nemesis:play_area', zone: 'nemesis_play_area', ownerId: 'nemesis', index: 0,
    }, 'setup')

    const candidates = marketPileChoices(game).filter(candidate =>
      candidate.remaining > 0 && !getCard(candidate.cardId).setupOnlyNemesisSupplyFor,
    )
    if (candidates.length === 0) return
    game.pendingDecision = createDecision(
      'Choose a supply pile to replace with Vortex Blast',
      'select_setup_supply_replacement',
      {
        candidates,
        replacementCardId: 'vortex_blast',
        nextReplacementCardId: 'abyssal_vial',
        previewCardIds: ['vortex_blast', 'abyssal_vial'],
      },
    )
  },
}
