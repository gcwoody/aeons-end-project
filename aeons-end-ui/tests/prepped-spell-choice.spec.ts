import { expect, test, type Page } from '@playwright/test'
import type { GameState, PreppedSpellChoice } from '../../aeons-end-engine/src/types'

type DebugSnapshot = { game: GameState; phase: string; selectedPlayer: string }

async function readSnapshot(page: Page): Promise<DebugSnapshot> {
  await page.keyboard.press('Control+d')
  await page.getByRole('button', { name: 'Load Current', exact: true }).click()
  return JSON.parse(await page.locator('.debug-panel textarea').inputValue())
}

async function applySnapshot(page: Page, snapshot: DebugSnapshot) {
  await page.locator('.debug-panel textarea').fill(JSON.stringify(snapshot))
  await page.getByRole('button', { name: 'Apply', exact: true }).click()
  await page.getByRole('button', { name: 'Close (Ctrl+D)', exact: true }).click()
}

async function inspectGame(page: Page): Promise<GameState> {
  const snapshot = await readSnapshot(page)
  await page.getByRole('button', { name: 'Close (Ctrl+D)', exact: true }).click()
  return snapshot.game
}

async function prepareGame(page: Page): Promise<DebugSnapshot> {
  await page.goto('/')
  await page.evaluate(() => localStorage.clear())
  await page.reload()
  await page.getByRole('tab', { name: 'Wave 1', exact: true }).first().click()
  await page.getByRole('tab', { name: 'Wave 1', exact: true }).last().click()
  await page.getByLabel('Player 1 Mage').selectOption('mist')
  await page.getByLabel('Player 2 Mage').selectOption('brama')
  await page.getByRole('button', { name: 'Start Game', exact: true }).click()
  await expect(page.locator('.turn-transition-shield')).toHaveCount(0)
  if (await page.locator('.nemesis-draw-reveal-screen').isVisible()) {
    await expect(page.locator('.nemesis-draw-flight-scene')).toHaveCount(0)
    await page.locator('.nemesis-draw-reveal-screen').click({ position: { x: 12, y: 12 } })
  }
  const snapshot = await readSnapshot(page)
  const game = snapshot.game
  const caster = game.players[0]!
  snapshot.phase = 'main'
  snapshot.selectedPlayer = caster.id
  game.currentTurn = caster.id
  game.currentPhase = 'main'
  game.pendingDecision = null
  game.pendingEffect = null
  game.pendingNemesisDiscard = null
  game.nemesisResolution = null
  game.nemesis.hp = 70
  game.nemesis.playArea = [{
    cardId: 'haze_spewer', cardType: 'minion', placedAt: 123456,
    instanceId: 'optional-cast-minion', enteredOnNemesisTurn: 0, lifeTokens: 5,
  }]
  for (const player of game.players) {
    player.hand = ['crystal']
    player.playedThisTurn = []
    player.discard = []
    for (const breach of player.breaches) {
      breach.prepSpells = []
      breach.preppedThisTurn = []
      breach.preppedSpellFaceDown = []
      breach.preppedSpellInstanceIds = []
    }
    const breach = player.breaches[0]!
    breach.opened = true
    breach.prepSpells = ['spark']
    breach.preppedThisTurn = [false]
    breach.preppedSpellFaceDown = [false]
    breach.preppedSpellInstanceIds = [`${player.id}:optional-cast-spark`]
  }
  caster.hand = ['clouded_trinket', 'crystal']
  return snapshot
}

for (const width of [1440, 1920]) {
  test(`optional cast clicks an ally spell directly into damage targeting at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: width === 1440 ? 900 : 1080 })
    await applySnapshot(page, await prepareGame(page))
    await page.locator('.hand [data-hand-card-id="clouded_trinket"]').click()
    const panel = page.locator('.non-blocking-prepped-modal')
    await expect(panel).toBeVisible()
    await expect(panel.getByRole('button')).toHaveCount(1)
    await expect(panel.getByRole('button', { name: 'Skip', exact: true })).toBeVisible()
    await expect(panel.locator('.stat')).toHaveCount(0)
    await page.locator('.char-btn').nth(1).click()
    const spell = page.locator('.breach-spell-card-frame.pending-prepped-spell')
    await expect(spell).toHaveCount(1)
    await expect(spell).toHaveClass(/game-highlight--choice/)
    await spell.click()
    await expect(panel).toHaveCount(0)
    const minion = page.locator('[data-damage-target="minion:123456"]')
    await expect(minion).toHaveClass(/damage-target/)
    await expect(page.getByRole('button', { name: 'Confirm', exact: true })).toHaveCount(0)
    const targeting = await inspectGame(page)
    expect(targeting.pendingDecision?.kind).toBe('select_damage_target')
    expect(targeting.nemesis.playArea[0]!.lifeTokens).toBe(5)
    expect(targeting.players[1]!.discard).toContain('spark')
    expect(targeting.players[0]!.discard).not.toContain('spark')
    expect(targeting.players[0]!.breaches[0]!.prepSpells).toEqual(['spark'])
    await minion.click()
    const resolved = await inspectGame(page)
    expect(resolved.nemesis.playArea[0]!.lifeTokens).toBe(4)
    expect(resolved.pendingDecision).toBeNull()
    expect(resolved.pendingEffect).toBeNull()
    expect(resolved.trinketDeck).toContain('clouded_trinket')
  })

  test(`Skip preserves all prepped spells and continues the outer effect at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: width === 1440 ? 900 : 1080 })
    await applySnapshot(page, await prepareGame(page))
    await page.locator('.hand [data-hand-card-id="clouded_trinket"]').click()
    const panel = page.locator('.non-blocking-prepped-modal')
    await expect(panel.getByRole('button')).toHaveCount(1)
    await panel.getByRole('button', { name: 'Skip', exact: true }).click()
    await expect(panel).toHaveCount(0)
    const resolved = await inspectGame(page)
    expect(resolved.pendingDecision).toBeNull()
    expect(resolved.pendingEffect).toBeNull()
    expect(resolved.nemesis.hp).toBe(70)
    expect(resolved.nemesis.playArea[0]!.lifeTokens).toBe(5)
    for (const player of resolved.players) {
      expect(player.breaches[0]!.prepSpells).toEqual(['spark'])
      expect(player.discard).not.toContain('spark')
    }
    expect(resolved.trinketDeck).toContain('clouded_trinket')
  })
}

for (const count of [1, 2]) {
  test(`${count}-spell discard selection still waits for Confirm`, async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    const snapshot = await prepareGame(page)
    const candidates: PreppedSpellChoice[] = snapshot.game.players.map(player => ({
      playerId: player.id, breachIndex: player.breaches[0]!.index,
      spellIndex: 0, cardId: 'spark', cardName: 'Spark',
    }))
    snapshot.game.pendingDecision = {
      id: 'discard-confirmation', playerId: snapshot.game.players[0]!.id,
      prompt: 'Choose prepped spells to discard', kind: 'select_prepped_spells',
      candidates, min: count === 1 ? 0 : 2, max: count, confirmSelection: true,
      requiredChoices: count === 2 ? [candidates[1]!] : [],
    }
    snapshot.game.pendingEffect = {
      sourcePlayerId: snapshot.game.players[0]!.id, remainingEffects: [],
      awaiting: { kind: 'discard_prepped_spells', amount: count, target: 'any_player' },
    }
    await applySnapshot(page, snapshot)
    const panel = page.locator('.non-blocking-prepped-modal')
    const confirm = panel.getByRole('button', { name: 'Confirm', exact: true })
    await expect(confirm).toBeDisabled()
    await page.locator('.breach-spell-card-frame.pending-prepped-spell').click()
    await expect(panel).toBeVisible()
    await expect(confirm).toBeEnabled()
    const selected = await inspectGame(page)
    expect(selected.pendingDecision?.id).toBe('discard-confirmation')
    expect(selected.players[0]!.breaches[0]!.prepSpells).toEqual(['spark'])
    await confirm.click()
    await expect(panel).toHaveCount(0)
    const resolved = await inspectGame(page)
    expect(resolved.players[0]!.discard).toContain('spark')
    expect(resolved.players[1]!.discard.includes('spark')).toBe(count === 2)
  })
}
