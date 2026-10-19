import type { GameState, NemesisSubBoardToken } from '../types'

export function getSubBoardTokens(game: GameState): NemesisSubBoardToken[] {
  return game.nemesis.subBoardTokens ??= []
}

export function getSubBoardTokenAt(
  game: GameState,
  tokenId: string,
  regionId: string,
): NemesisSubBoardToken | undefined {
  return getSubBoardTokens(game).find(token => token.tokenId === tokenId && token.regionId === regionId)
}

export function hasSubBoardToken(
  game: GameState,
  tokenId: string,
  regionId?: string,
): boolean {
  return getSubBoardTokens(game).some(token =>
    token.tokenId === tokenId && (regionId === undefined || token.regionId === regionId))
}

export function addSubBoardToken(
  game: GameState,
  tokenId: string,
  regionId: string,
  instanceId?: string,
): NemesisSubBoardToken {
  const counter = (game.nemesis.subBoardTokenCounter ?? 0) + 1
  game.nemesis.subBoardTokenCounter = counter
  const token = { instanceId: instanceId ?? `sub-board-token:${counter}`, tokenId, regionId }
  getSubBoardTokens(game).push(token)
  return token
}

export function moveSubBoardToken(
  game: GameState,
  tokenId: string,
  regionId: string,
  instanceId?: string,
): NemesisSubBoardToken | undefined {
  const token = instanceId
    ? getSubBoardTokens(game).find(candidate => candidate.instanceId === instanceId)
    : [...getSubBoardTokens(game)].reverse().find(candidate => candidate.tokenId === tokenId)
  if (!token || token.tokenId !== tokenId) return undefined
  token.regionId = regionId
  return token
}

export function removeSubBoardToken(game: GameState, instanceId: string): NemesisSubBoardToken | undefined {
  const tokens = getSubBoardTokens(game)
  const index = tokens.findIndex(token => token.instanceId === instanceId)
  if (index < 0) return undefined
  return tokens.splice(index, 1)[0]
}

