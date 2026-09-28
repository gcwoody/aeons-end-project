export function displayMageName(name: string): string {
  return name
    .split(/[_\s]+/)
    .filter(Boolean)
    .map(part => `${part.charAt(0).toUpperCase()}${part.slice(1).toLowerCase()}`)
    .join(' ')
}

export function displayPlayerId(playerId: string): string {
  const match = playerId.match(/^wave(\d+)_(.+)$/i)
  if (!match) return playerId
  return `Wave ${match[1]} — ${displayMageName(match[2]!)}`
}

export function formatMageNamesInText(text: string, mageTypes: string[]): string {
  let formatted = text
  const uniqueMageTypes = [...new Set(mageTypes)].sort((left, right) => right.length - left.length)
  for (const mageType of uniqueMageTypes) {
    const escaped = mageType.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const pattern = new RegExp(`(^|[^A-Za-z0-9_])${escaped}(?=$|[^A-Za-z0-9_])`, 'gi')
    formatted = formatted.replace(pattern, (_match, prefix: string) => `${prefix}${displayMageName(mageType)}`)
  }
  return formatted
}
