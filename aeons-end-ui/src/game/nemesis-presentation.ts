import type { SpecificPileDisplay } from '../components/NemesisSpecificPile.vue'

/** Optional board regions belong to presentation, not saved rule state. */
export interface NemesisPresentation {
  subBoard: { enabled: boolean; imageUrl?: string; aspectRatio: number }
  /** This remains presentation-only so the saved rules state stays generic. */
  specificDeck: {
    enabled: boolean
    label: string
    display?: SpecificPileDisplay
    topCardAlwaysRevealed?: boolean
    /** Controls card faces inside the pile viewer, independently of the board pile back. */
    cardVisibility?: 'per_instance' | 'all_face_up'
    topCardAction?: 'buy'
    /** Use an affordable face-up top card itself as the action target. */
    primaryActionOnCard?: boolean
  }
  specificDiscard: { enabled: boolean; label: string }
}

export const nemesisPresentations: Record<string, NemesisPresentation> = {
  rageborne: {
    subBoard: { enabled: false, aspectRatio: 1 },
    specificDeck: { enabled: true, label: 'Strike Deck' },
    specificDiscard: { enabled: false, label: 'Nemesis Specific Discard' },
  },
  prince_of_gluttons: {
    subBoard: { enabled: false, aspectRatio: 1 },
    specificDeck: { enabled: true, label: 'Devoured Pile', display: 'face_up', topCardAction: 'buy' },
    specificDiscard: { enabled: false, label: 'Nemesis Specific Discard' },
  },
  crooked_mask: {
    subBoard: { enabled: false, aspectRatio: 1 },
    specificDeck: { enabled: true, label: 'Corruption Deck' },
    specificDiscard: { enabled: false, label: 'Corruption Discard' },
  },
  oracle_of_filth: {
    subBoard: { enabled: false, aspectRatio: 1 },
    specificDeck: { enabled: true, label: 'Vortex Deck', cardVisibility: 'all_face_up' },
    specificDiscard: { enabled: false, label: 'Vortex Discard' },
  },
  twice_dead_prophet: {
    subBoard: { enabled: false, aspectRatio: 1 },
    specificDeck: {
      enabled: true, label: 'Prophecy deck', display: 'face_up', cardVisibility: 'per_instance',
      topCardAlwaysRevealed: true,
    },
    specificDiscard: { enabled: false, label: 'Nemesis Specific Discard' },
  },
  the_timeless: {
    subBoard: { enabled: false, aspectRatio: 1 },
    specificDeck: {
      enabled: true, label: 'Exiled pile', display: 'face_up', cardVisibility: 'all_face_up',
      topCardAction: 'buy', primaryActionOnCard: true,
    },
    specificDiscard: { enabled: true, label: 'Finality pile' },
  },
}

const defaultPresentation: NemesisPresentation = {
  subBoard: { enabled: false, aspectRatio: 1 },
  specificDeck: { enabled: false, label: 'Nemesis Specific' },
  specificDiscard: { enabled: false, label: 'Nemesis Specific Discard' },
}

export function getNemesisPresentation(type: string): NemesisPresentation {
  return nemesisPresentations[type] ?? defaultPresentation
}
