import { test, expect, type Page } from '@playwright/test'

test.use({ viewport: { width: 1920, height: 1000 } })

async function resetSetup(page: Page) {
  await page.goto('/')
  await page.evaluate(() => localStorage.clear())
  await page.reload()
  await page.getByRole('tab', { name: 'Wave 9', exact: true }).first().click()
  await page.getByRole('tab', { name: 'Wave 1', exact: true }).last().click()
}

async function resolveStartupInterrupts(page: Page) {
  for (let attempt = 0; attempt < 20; attempt++) {
    const continueDraw = page.getByRole('button', { name: 'Continue', exact: true })
    if (await continueDraw.isVisible().catch(() => false)) {
      await continueDraw.click()
      continue
    }
    const resolveCard = page.getByRole('button', { name: 'Resolve Card', exact: true })
    if (await resolveCard.isVisible().catch(() => false)) {
      await resolveCard.click()
      continue
    }
    const skip = page.getByRole('button', { name: 'Skip', exact: true })
    if (await skip.isVisible().catch(() => false)) {
      await skip.click()
      continue
    }
    const confirm = page.getByRole('button', { name: 'Confirm', exact: true })
    if (await confirm.isVisible().catch(() => false)) {
      await confirm.click()
      continue
    }
    const attack = page.getByRole('button', { name: /^(Attack .+|Gravehold)$/ }).first()
    if (await attack.isVisible().catch(() => false)) {
      await attack.click()
      continue
    }
    return
  }
}

async function focusUniqueBreach(
  page: Page,
  mage: string,
  breachIndex: number,
  focusCost: number,
  focusesToOpen = 0,
  initialRotation = 0,
) {
  await resetSetup(page)
  await page.getByLabel('Player 1 Mage').selectOption(mage)
  await page.getByLabel('Player 2 Mage').selectOption('jian')
  await page.getByRole('button', { name: 'Start Game' }).click()
  await resolveStartupInterrupts(page)

  await page.keyboard.press('Control+d')
  const stateField = page.locator('.debug-panel textarea')
  await expect(stateField).toBeVisible()
  await page.getByRole('button', { name: 'Load Current', exact: true }).click()
  const debugState = JSON.parse(await stateField.inputValue())
  const player = debugState.game.players[0]
  debugState.selectedPlayer = player.id
  debugState.phase = 'main'
  player.conditionalAetherEarned.breach = focusCost * Math.max(focusesToOpen, 1)
  player.condAetherSpent = {}
  player.regularAetherSpent = 0
  debugState.game.currentTurn = player.id
  debugState.game.currentPhase = 'main'
  await stateField.fill(JSON.stringify(debugState))
  await page.getByRole('button', { name: 'Apply', exact: true }).click()
  await page.getByRole('button', { name: 'Close (Ctrl+D)' }).click()

  const breach = page.locator(`.breach[data-breach-index="${breachIndex}"]`)
  const image = breach.locator('img.breach-token')
  await expect(image).toHaveAttribute('style', new RegExp(`rotate\\(${initialRotation}deg\\)`))
  if (mage === 'remnant' && breachIndex === 4) {
    await expect(breach.getByRole('button', { name: 'Open 10', exact: true })).toBeVisible()
  }
  const closedImageUrl = await image.getAttribute('src')
  await breach.getByRole('button', { name: `Focus ${focusCost}`, exact: true }).click()
  if (focusesToOpen === 2) {
    await expect(image).toHaveAttribute('alt', `Breach IV closed`)
    await expect(image).toHaveAttribute('style', /rotate\(0deg\)/)
    await breach.getByRole('button', { name: `Focus ${focusCost}`, exact: true }).click()
  }
  if (focusesToOpen > 0) {
    await expect(image).toHaveAttribute('alt', `Breach ${breachIndex === 4 ? 'IV' : 'III'} open`)
    await expect(image).toHaveAttribute('style', /rotate\(0deg\)/)
    await expect(image).not.toHaveAttribute('src', closedImageUrl!)
  } else {
    await expect(image).toHaveAttribute('style', /rotate\(90deg\)/)
  }
}

test('unique breaches rotate on focus or open directly when fully focused', async ({ page }) => {
  for (const setup of [
    { mage: 'remnant', breachIndex: 3, focusCost: 3 },
    { mage: 'remnant', breachIndex: 4, focusCost: 4, focusesToOpen: 2, initialRotation: 270 },
    { mage: 'indira', breachIndex: 3, focusCost: 3 },
    { mage: 'stake', breachIndex: 4, focusCost: 4, focusesToOpen: 1 },
  ]) {
    await focusUniqueBreach(page, setup.mage, setup.breachIndex, setup.focusCost, setup.focusesToOpen, setup.initialRotation)
  }
})

test('Breach artwork follows focus direction instead of the focus counter', async ({ page }) => {
  await resetSetup(page)
  await page.getByLabel('Player 1 Mage').selectOption('remnant')
  await page.getByLabel('Player 2 Mage').selectOption('jian')
  await page.getByRole('button', { name: 'Start Game' }).click()
  await resolveStartupInterrupts(page)

  await page.keyboard.press('Control+d')
  const stateField = page.locator('.debug-panel textarea')
  await expect(stateField).toBeVisible()
  await page.getByRole('button', { name: 'Load Current', exact: true }).click()
  const debugState = JSON.parse(await stateField.inputValue())
  const player = debugState.game.players[0]
  const riftIII = player.breaches.find((breach: any) => breach.index === 3)
  debugState.selectedPlayer = player.id
  debugState.phase = 'main'
  debugState.game.currentTurn = player.id
  debugState.game.currentPhase = 'main'
  riftIII.focusCount = 0
  riftIII.focusDirection = 'west'
  riftIII.opened = false
  await stateField.fill(JSON.stringify(debugState))
  await page.getByRole('button', { name: 'Apply', exact: true }).click()
  await page.getByRole('button', { name: 'Close (Ctrl+D)' }).click()

  const image = page.locator('.breach[data-breach-index="3"] img.breach-token')
  await expect(image).toHaveAttribute('alt', 'Breach III closed')
  await expect(image).toHaveAttribute('style', /rotate\(90deg\)/)
})

test('resuming a one-focus Rift IV save repairs it to the two-focus opening rule', async ({ page }) => {
  await resetSetup(page)
  await page.getByLabel('Player 1 Mage').selectOption('remnant')
  await page.getByLabel('Player 2 Mage').selectOption('jian')
  await page.getByRole('button', { name: 'Start Game' }).click()
  await resolveStartupInterrupts(page)

  await page.keyboard.press('Control+d')
  const stateField = page.locator('.debug-panel textarea')
  await expect(stateField).toBeVisible()
  await page.getByRole('button', { name: 'Load Current', exact: true }).click()
  const debugState = JSON.parse(await stateField.inputValue())
  const player = debugState.game.players[0]
  const legacyRiftIV = player.breaches.find((breach: any) => breach.index === 4)
  legacyRiftIV.focusDirection = 'north'
  legacyRiftIV.focusToOpen = 1
  legacyRiftIV.focusCount = 1
  legacyRiftIV.opened = true
  player.conditionalAetherEarned.breach = 4
  player.condAetherSpent = {}
  debugState.selectedPlayer = player.id
  debugState.phase = 'main'
  debugState.game.currentTurn = player.id
  debugState.game.currentPhase = 'main'

  const save = {
    id: 'legacy-remnant-rift-save',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    players: debugState.game.players.map((mage: any) => mage.mageType),
    nemesisType: debugState.game.nemesis.type,
    round: debugState.game.round,
    turn: debugState.game.turnOrderDiscard.length,
    currentTurn: player.id,
    game: debugState.game,
    phase: 'main',
    selectedPlayer: player.id,
    discardRemaining: [],
    undoStack: [],
  }
  await page.evaluate((storedSave) => {
    localStorage.setItem('aeons-end-saves-v3', JSON.stringify([storedSave]))
  }, save)
  await page.reload()

  await page.getByRole('button', { name: 'Resume Game', exact: true }).click()
  const image = page.locator('.breach[data-breach-index="4"] img.breach-token')
  await expect(image).toHaveAttribute('alt', 'Breach IV closed')
  await expect(image).toHaveAttribute('style', /rotate\(0deg\)/)
  const breach = page.locator('.breach[data-breach-index="4"]')
  await expect(breach.getByRole('button', { name: 'Focus 4', exact: true })).toBeVisible()
  await breach.getByRole('button', { name: 'Focus 4', exact: true }).click()
  await expect(image).toHaveAttribute('alt', 'Breach IV open')
})
