import { expect, test } from '@playwright/test'

test('Debug Add Card searches all card types and inserts at the selected location', async ({ page }) => {
  await page.goto('/')
  await page.evaluate(() => localStorage.clear())
  await page.reload()
  await page.getByRole('button', { name: 'Start Game' }).click()
  await page.keyboard.press('Control+d')
  await expect(page.getByText('Debug Tools', { exact: true })).toBeVisible()

  const addControlsAboveSearch = await page.locator('.debug-add-controls').evaluate((controls) => {
    const picker = document.querySelector('.debug-card-picker')
    return !!picker && Boolean(controls.compareDocumentPosition(picker) & Node.DOCUMENT_POSITION_FOLLOWING)
  })
  expect(addControlsAboveSearch).toBe(true)

  const addCardPicker = page.locator('.debug-card-picker').first()
  const search = addCardPicker.getByRole('searchbox', { name: 'Search debug cards' })
  await search.fill('contagion')

  const corruption = addCardPicker.locator('[data-card-id="contagion_btb"]')
  await expect(corruption).toBeVisible()
  await expect(corruption.locator('img[alt="Contagion (Beyond the Breach)"]')).toBeVisible()
  await expect(corruption.locator('.debug-card-option-name')).toHaveText('Contagion (Beyond the Breach)')
  await expect(corruption.locator('.debug-card-option-meta')).toHaveCount(0)
  await corruption.click()

  const playerId = await page.getByRole('combobox', { name: 'Debug card player' }).inputValue()
  const addLocation = page.getByRole('combobox', { name: 'Debug card zone' })
  const addCardButton = page.getByRole('button', { name: 'Add Card', exact: true })
  await addLocation.selectOption('deck_top')
  await addCardButton.click()
  await addLocation.selectOption('discard_top')
  await addCardButton.click()
  await addLocation.selectOption('hand')
  await addCardButton.click()

  const stateField = page.locator('.debug-panel textarea')
  await page.getByRole('button', { name: 'Load Current', exact: true }).click()
  const debugState = JSON.parse(await stateField.inputValue())
  const player = debugState.game.players.find((candidate: { id: string }) => candidate.id === playerId)
  expect(player).toBeTruthy()
  expect(player.deck[0]).toBe('contagion_btb')
  expect(player.discard[0]).toBe('contagion_btb')
  expect(player.hand).toContain('contagion_btb')
})
