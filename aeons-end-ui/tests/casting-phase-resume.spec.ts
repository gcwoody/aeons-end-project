import { test, expect, type Page } from '@playwright/test'
import { createTwoPlayerScenario } from '../../aeons-end-engine/src/data'
import { createGame } from '../../aeons-end-engine/src/engine'

function castingSave(name: string, withPreppedSpell = false) {
  const game = createGame(createTwoPlayerScenario(['jian', 'brama']))
  const activePlayer = game.players[0]!
  game.currentTurn = activePlayer.id
  game.currentPhase = 'casting'
  if (withPreppedSpell) {
    const openBreach = activePlayer.breaches.find(breach => breach.opened)!
    openBreach.prepSpells = ['spark']
    openBreach.preppedThisTurn = [false]
    openBreach.preppedSpellFaceDown = [false]
  }

  return {
    id: name,
    name,
    players: game.players.map(player => player.mageType),
    nemesisType: game.nemesis.definitionId,
    round: game.round,
    turn: game.timestamp,
    currentTurn: game.currentTurn,
    createdAt: 1_700_000_000_000,
    updatedAt: 1_700_000_000_000,
    game,
    phase: 'casting',
    selectedPlayer: activePlayer.id,
    discardRemaining: [],
    undoStack: [],
  }
}

async function resumeSave(page: Page, save: ReturnType<typeof castingSave>) {
  await page.addInitScript(saved => {
    localStorage.setItem('aeons-end-saves-v3', JSON.stringify([saved]))
  }, save)
  await page.goto('/')
  await page.getByRole('button', { name: 'Resume Game' }).click()
}

test('a new Mage turn with no prepped spells starts directly in Main Phase', async ({ page }) => {
  await page.addInitScript(() => { Math.random = () => 0 })
  await page.setViewportSize({ width: 1920, height: 1080 })
  await page.goto('/')
  await page.evaluate(() => localStorage.clear())
  await page.reload()
  await page.getByRole('tab', { name: 'Wave 1' }).first().click()
  await page.getByRole('tab', { name: 'Wave 1' }).last().click()
  await page.getByLabel('Player 1').selectOption('jian')
  await page.getByLabel('Player 2').selectOption('brama')
  await page.getByRole('button', { name: 'Start Game' }).click()

  await expect(page.getByText('Main Phase · Action', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Start Main Phase →' })).toHaveCount(0)
})

test('resuming a Casting save with no prepped spells continues to Main Phase', async ({ page }) => {
  await resumeSave(page, castingSave('save1'))

  await expect(page.getByText('Main Phase · Action', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Start Main Phase →' })).toHaveCount(0)
})

test('resuming a Casting save with a prepped spell remains in Casting Phase', async ({ page }) => {
  await resumeSave(page, castingSave('casting-with-spell', true))

  await expect(page.getByText('Casting Phase · Spell Selection', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Start Main Phase →' })).toBeVisible()
})
