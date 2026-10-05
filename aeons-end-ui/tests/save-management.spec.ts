import { test, expect } from '@playwright/test'

const gameFixture = {
  scenario: { id: 'two_player' },
  players: [
    { id: 'wave1_JIAN', mageType: 'jian' },
    { id: 'wave1_BRAMA', mageType: 'brama' },
  ],
}

const undoFixture = {
  game: gameFixture,
  phase: 'main',
  prepTarget: null,
  selectedPlayer: 'wave1_JIAN',
  discardRemaining: ['spark'],
}

const saveFixture = {
  id: 'save-fixture',
  name: 'Campaign One',
  players: ['Jian', 'Brama'],
  nemesisType: 'Rageborne',
  round: 2,
  turn: 4,
  currentTurn: 'wave1_JIAN',
  createdAt: 1_700_000_000_000,
  updatedAt: 1_700_000_000_000,
  game: gameFixture,
  phase: 'main',
  selectedPlayer: 'wave1_JIAN',
  discardRemaining: ['crystal'],
  undoStack: [undoFixture],
}

test('saved games can be copied and renamed, with the changes persisted', async ({ page }) => {
  await page.addInitScript(save => {
    const key = 'aeons-end-saves-v3'
    if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify([save]))
  }, saveFixture)
  await page.goto('/')

  const original = page.locator('.save-entry').filter({ hasText: 'Campaign One' })
  await original.getByRole('button', { name: 'Copy Save' }).click()
  await expect(page.locator('.save-entry')).toHaveCount(2)
  await expect(page.getByText('Campaign One (Copy)', { exact: true })).toBeVisible()

  const copy = page.locator('.save-entry').filter({ hasText: 'Campaign One (Copy)' })
  await copy.getByRole('button', { name: 'Rename' }).click()
  await page.getByRole('textbox', { name: 'Saved game name' }).fill('Final Boss Attempt')
  await page.getByRole('button', { name: 'Save name' }).click()
  await expect(page.getByText('Final Boss Attempt', { exact: true })).toBeVisible()

  const saves = await page.evaluate(() => JSON.parse(localStorage.getItem('aeons-end-saves-v3') ?? '[]'))
  expect(saves).toHaveLength(2)
  expect(new Set(saves.map((save: { id: string }) => save.id)).size).toBe(2)
  expect(saves.find((save: { name: string }) => save.name === 'Final Boss Attempt').game)
    .toEqual(gameFixture)
  expect(saves.find((save: { name: string }) => save.name === 'Final Boss Attempt').undoStack)
    .toEqual([undoFixture])

  await page.reload()
  await expect(page.getByText('Final Boss Attempt', { exact: true })).toBeVisible()
})
