export interface TurnOrderPlayerLabelSource {
  id: string
  mageType: string
}

/** Create compact, unambiguous labels for player turn-order cards. */
export function createTurnOrderLabels(players: TurnOrderPlayerLabelSource[]): Record<string, string> {
  const labels: Record<string, string> = {}
  for (const player of players) {
    const name = player.mageType.toUpperCase()
    const peers = players.filter(candidate => candidate.id !== player.id)
    let length = 1
    while (length < name.length && peers.some(peer => peer.mageType.toUpperCase().slice(0, length) === name.slice(0, length))) {
      length++
    }
    labels[player.id] = name.slice(0, length)
  }

  const collisions = new Map<string, string[]>()
  for (const player of players) {
    const label = labels[player.id]!
    collisions.set(label, [...(collisions.get(label) ?? []), player.id])
  }
  for (const ids of collisions.values()) {
    if (ids.length < 2) continue
    ids.forEach((id, index) => { labels[id] = `${labels[id]} ${index + 1}` })
  }
  return labels
}

export function turnOrderActorLabel(actor: string, playerLabels: Record<string, string>): string {
  return actor === 'nemesis' ? 'NEM' : playerLabels[actor] ?? actor.toUpperCase()
}
