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
  const roman = breachIndex === 4 ? 'IV' : 'III'
  await expect(image).toHaveAttribute('style', new RegExp(`rotate\\(${initialRotation}deg\\)`))
  if (mage === 'remnant' && breachIndex === 4) {
    await expect(breach.getByRole('button', { name: 'Open 10', exact: true })).toBeVisible()
  }
  const closedImageUrl = await image.getAttribute('src')
  const focusButton = breach.getByRole('button', { name: `Focus Breach ${roman} for ${focusCost} Aether`, exact: true })
  await focusButton.click()
  if (focusesToOpen === 2) {
    await expect(image).toHaveAttribute('alt', `Breach IV closed`)
    await expect(image).toHaveAttribute('style', /rotate\(90deg\)/)
    await focusButton.click()
  }
  if (focusesToOpen > 0) {
    await expect(image).toHaveAttribute('alt', `Breach ${breachIndex === 4 ? 'IV' : 'III'} open`)
    await expect(image).toHaveAttribute('style', /rotate\(0deg\)/)
    await expect(image).not.toHaveAttribute('src', closedImageUrl!)
  } else {
    await expect(image).toHaveAttribute('style', /rotate\(90deg\)/)
  }
}


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

test('switching Mage views does not animate Breaches as if they changed state', async ({ page }) => {
  await resetSetup(page)
  await page.getByLabel('Player 1 Mage').selectOption('qu')
  await page.getByLabel('Player 2 Mage').selectOption('jian')
  await page.getByRole('button', { name: 'Start Game' }).click()
  await resolveStartupInterrupts(page)

  await page.keyboard.press('Control+d')
  const stateField = page.locator('.debug-panel textarea')
  await page.getByRole('button', { name: 'Load Current', exact: true }).click()
  const debugState = JSON.parse(await stateField.inputValue())
  const [firstPlayer, secondPlayer] = debugState.game.players
  const firstRotationBreach = firstPlayer.breaches.find((breach: any) => breach.index === 3)
  const secondRotationBreach = secondPlayer.breaches.find((breach: any) => breach.index === 3)
  firstRotationBreach.focusDirection = 'east'
  firstRotationBreach.focusCount = 1
  firstRotationBreach.opened = false
  secondRotationBreach.focusDirection = 'south'
  secondRotationBreach.focusCount = 1
  secondRotationBreach.opened = false

  const firstOpeningBreach = firstPlayer.breaches.find((breach: any) => breach.index === 2)
  const secondOpeningBreach = secondPlayer.breaches.find((breach: any) => breach.index === 2)
  firstOpeningBreach.focusDirection = 'north'
  firstOpeningBreach.focusCount = 0
  firstOpeningBreach.opened = false
  secondOpeningBreach.focusDirection = 'north'
  secondOpeningBreach.focusCount = 2
  secondOpeningBreach.opened = true
  debugState.selectedPlayer = firstPlayer.id
  await stateField.fill(JSON.stringify(debugState))
  await page.getByRole('button', { name: 'Apply', exact: true }).click()
  await page.getByRole('button', { name: 'Close (Ctrl+D)' }).click()

  await page.addStyleTag({ content: ':root { --breach-focus-duration: 3000ms; --breach-open-duration: 3000ms; }' })
  await page.locator('.char-select .char-btn').nth(1).click()

  const openingBreach = page.locator('.breach[data-breach-index="2"]')
  const openingImage = openingBreach.locator('img.breach-token')
  await expect(openingImage).toHaveAttribute('alt', 'Breach II open')
  await expect(openingBreach.locator('.breach-flip-scene')).toHaveCount(0)
  expect(await openingImage.evaluate(element => element.getAnimations().length)).toBe(0)

  const rotatingImage = page.locator('.breach[data-breach-index="3"] img.breach-token')
  await expect(rotatingImage).toHaveAttribute('style', /rotate\(180deg\)/)
  expect(await rotatingImage.evaluate(element => element.getAnimations().length)).toBe(0)
})

test('Breach focus rotates clockwise and opening flips around its facing axis', async ({ page }) => {
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
  const breach = player.breaches.find((candidate: any) => candidate.index === 4)
  breach.focusCount = 0
  breach.focusToOpen = 2
  breach.focusDirection = 'west'
  breach.opened = false
  debugState.selectedPlayer = player.id
  debugState.phase = 'main'
  debugState.game.currentTurn = player.id
  debugState.game.currentPhase = 'main'
  player.conditionalAetherEarned.breach = 8
  player.condAetherSpent = {}
  player.regularAetherSpent = 0
  await stateField.fill(JSON.stringify(debugState))
  await page.getByRole('button', { name: 'Apply', exact: true }).click()
  await page.getByRole('button', { name: 'Close (Ctrl+D)' }).click()
  await page.addStyleTag({ content: ':root { --breach-focus-duration: 900ms; --breach-open-duration: 1000ms; }' })

  const breachArea = page.locator('.breach[data-breach-index="4"]')
  const image = breachArea.locator('img.breach-token')
  await breachArea.getByRole('button', { name: 'Focus Breach IV for 4 Aether', exact: true }).click()
  await expect.poll(() => image.evaluate(element => element.getAnimations().length)).toBeGreaterThan(0)
  const focusKeyframes = await image.evaluate(element => element.getAnimations()[0]!.effect!.getKeyframes()
    .map(frame => frame.transform))
  expect(focusKeyframes).toEqual(['rotate(0deg)', 'rotate(90deg)'])
  await image.evaluate(element => Promise.all(element.getAnimations().map(animation => animation.finished)))

  await breachArea.getByRole('button', { name: 'Focus Breach IV for 4 Aether', exact: true }).click()
  const flipBack = breachArea.locator('.breach-flip-back')
  await expect(flipBack).toBeVisible()
  await expect(flipBack).toHaveAttribute('style', /rotate3d\(0, -1, 0, 180deg\)/)
  await expect.poll(() => breachArea.locator('.breach-flip-card').evaluate(element => element.getAnimations().length))
    .toBeGreaterThan(0)
  await expect(breachArea.locator('.breach-flip-card')).toHaveCount(0)
  await expect(image).toHaveAttribute('alt', 'Breach IV open')
})

test('automatic end waits for Breach focus before starting sequential discard flights', async ({ page }) => {
  await resetSetup(page)
  await page.getByLabel('Player 1 Mage').selectOption('remnant')
  await page.getByLabel('Player 2 Mage').selectOption('jian')
  await page.getByRole('button', { name: 'Start Game' }).click()
  await resolveStartupInterrupts(page)

  await page.keyboard.press('Control+d')
  const stateField = page.locator('.debug-panel textarea')
  await page.getByRole('button', { name: 'Load Current', exact: true }).click()
  const debugState = JSON.parse(await stateField.inputValue())
  const player = debugState.game.players[0]
  const target = player.breaches.find((breach: any) => breach.index === 4)
  debugState.selectedPlayer = player.id
  debugState.phase = 'main'
  debugState.game.currentTurn = player.id
  debugState.game.currentPhase = 'main'
  debugState.game.pendingDecision = null
  debugState.game.pendingEffect = null
  player.hand = []
  player.playedThisTurn = ['crystal', 'wave9_crystal']
  player.discard = []
  player.bonusAether = 0
  player.regularAetherSpent = 0
  player.conditionalAetherEarned = { breach: 4 }
  player.condAetherSpent = {}
  player.aetherTokens = 0
  player.charge = 0
  for (const breach of player.breaches) {
    breach.prepSpells = []
    if (breach.index !== 4) {
      breach.focusCost = 100
      breach.focusToOpen = 100
    }
  }
  target.focusCount = 0
  target.focusToOpen = 3
  target.focusDirection = 'west'
  target.opened = false
  await stateField.fill(JSON.stringify(debugState))
  await page.getByRole('button', { name: 'Apply', exact: true }).click()
  await page.getByRole('button', { name: 'Close (Ctrl+D)' }).click()
  await page.addStyleTag({ content: ':root { --breach-focus-duration: 1200ms; --discard-phase-flight-duration: 450ms; }' })

  const breach = page.locator('.breach[data-breach-index="4"]')
  const image = breach.locator('img.breach-token')
  const phase = page.locator('.controls .phase')
  await breach.getByRole('button', { name: 'Focus Breach IV for 4 Aether', exact: true }).click()
  await expect.poll(() => image.evaluate(element => element.getAnimations().length)).toBeGreaterThan(0)
  await expect(phase).toHaveText('Main Phase · Action')
  await expect(page.locator('.card-motion-shield')).toBeVisible()

  await image.evaluate(element => Promise.all(element.getAnimations().map(animation => animation.finished)))
  await expect(phase).toHaveText('Discard Phase · Card Order')
  await expect(page.locator('.card-flight-clone')).toBeVisible()
  await expect(phase).toHaveText('Discard Phase · Card Order')
  await expect(phase).not.toHaveText('Discard Phase · Card Order')
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
  await expect(image).toHaveAttribute('style', /rotate\(90deg\)/)
  const breach = page.locator('.breach[data-breach-index="4"]')
  const focusButton = breach.getByRole('button', { name: 'Focus Breach IV for 4 Aether', exact: true })
  await expect(focusButton).toBeVisible()
  await focusButton.click()
  await expect(image).toHaveAttribute('alt', 'Breach IV open')
})
