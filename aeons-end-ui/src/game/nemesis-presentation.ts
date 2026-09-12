/** Optional board regions belong to presentation, not saved rule state. */
export interface NemesisPresentation {
  subBoard: { enabled: boolean; imageUrl?: string; aspectRatio: number }
  specificDeck: { enabled: boolean; label: string }
  specificDiscard: { enabled: boolean; label: string }
}

export const nemesisPresentations: Record<string, NemesisPresentation> = {
  rageborne: {
    subBoard: { enabled: false, aspectRatio: 1 },
    specificDeck: { enabled: true, label: 'Strike Deck' },
    specificDiscard: { enabled: false, label: 'Nemesis Specific Discard' },
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
