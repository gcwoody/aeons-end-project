import { test, expect, type Locator, type Page } from '@playwright/test'

const newMages = ['adelheim', 'kadir', 'lash', 'mist', 'phaedraxa']

async function resetSetup(page: Page) {
  await page.goto('/')
  await page.evaluate(() => localStorage.clear())
  await page.reload()
}

async function resolveAttackIfNeeded(page: Page) {
  for (let attempt = 0; attempt < 6; attempt++) {
    const target = page.getByRole('button', { name: /^Attack (P1|P2|Gravehold)$/ }).first()
    if (!(await target.isVisible().catch(() => false))) return
    await target.click()
  }
}

async function resolveStartupInterrupts(page: Page) {
  for (let attempt = 0; attempt < 8; attempt++) {
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
    const attack = page.getByRole('button', { name: /^Attack (P1|P2|Gravehold)$/ }).first()
    if (await attack.isVisible().catch(() => false)) {
      await attack.click()
      continue
    }
    return
  }
}

async function expectAllImagesLoaded(page: Page) {
  await page.waitForFunction(() => Array.from(document.images).every(image => image.complete))
  const brokenImages = await page.locator('img').evaluateAll(images => images
    .filter(image => image.naturalWidth === 0)
    .map(image => ({ alt: image.alt, src: image.currentSrc || image.src })))
  expect(brokenImages).toEqual([])
}

async function applyDebugGameState(page: Page, update: (game: any) => void) {
  await page.keyboard.press('Control+d')
  await expect(page.getByText('Debug Tools', { exact: true })).toBeVisible()
  const stateField = page.locator('.debug-panel textarea')
  await page.getByRole('button', { name: 'Load Current', exact: true }).click()
  const debugState = JSON.parse(await stateField.inputValue())
  debugState.selectedPlayer = 'p1'
  update(debugState.game)
  await stateField.fill(JSON.stringify(debugState))
  await page.getByRole('button', { name: 'Apply', exact: true }).click()
  await page.getByRole('button', { name: 'Close (Ctrl+D)' }).click()
}

async function dragSpellToBreach(page: Page, spell: Locator, breachIndex: number) {
  await spell.scrollIntoViewIfNeeded()
  const source = await spell.boundingBox()
  const target = await page.locator(`.breach[data-breach-index="${breachIndex}"]`).boundingBox()
  expect(source).not.toBeNull()
  expect(target).not.toBeNull()
  await page.mouse.move(source!.x + source!.width / 2, source!.y + source!.height / 2)
  await page.mouse.down()
  await page.mouse.move(target!.x + target!.width / 2, target!.y + target!.height / 2, { steps: 8 })
  await page.mouse.up()
}

test('all new Wave 1 Mages can start with their boards visible', async ({ page }) => {
  for (const mage of newMages) {
    await resetSetup(page)
    await page.getByLabel('Player 1').selectOption(mage)
    await page.getByLabel('Player 2').selectOption('jian')
    await page.getByRole('button', { name: 'Start Game' }).click()

    await resolveStartupInterrupts(page)
    await expectAllImagesLoaded(page)
    await page.locator('.char-btn').first().click()
    await expect(page.getByRole('img', { name: `${mage} mage board` })).toBeVisible()
    await resolveAttackIfNeeded(page)
  }
})

test('Mage board modal stays above the hand and below the exit modal', async ({ page }) => {
  await resetSetup(page)
  await page.getByLabel('Player 1').selectOption('jian')
  await page.getByLabel('Player 2').selectOption('brama')
  await page.getByRole('button', { name: 'Start Game' }).click()
  await resolveStartupInterrupts(page)

  await page.locator('.mage-image-wrap').first().click()
  await expect(page.locator('.mage-overlay')).toBeVisible()
  const layerOrder = await page.evaluate(() => ({
    handRow: getComputedStyle(document.querySelector('.hand-row')!).zIndex,
    mageArea: getComputedStyle(document.querySelector('.mage-area')!).zIndex,
    mageOverlay: getComputedStyle(document.querySelector('.mage-overlay')!).zIndex,
  }))
  expect(Number(layerOrder.mageArea)).toBeGreaterThan(Number(layerOrder.handRow))
  expect(Number(layerOrder.mageOverlay)).toBeGreaterThan(Number(layerOrder.handRow))

  await page.keyboard.press('Escape')
  const exitLayer = await page.locator('.exit-overlay').evaluate(element => getComputedStyle(element).zIndex)
  expect(Number(exitLayer)).toBeGreaterThan(Number(layerOrder.mageOverlay))
})

test('Kadir can stack two spells on one Breach in the UI', async ({ page }) => {
  await resetSetup(page)
  await page.getByLabel('Player 1').selectOption('kadir')
  await page.getByLabel('Player 2').selectOption('brama')
  await page.getByRole('button', { name: 'Start Game' }).click()

  await page.keyboard.press('Control+d')
  await expect(page.getByText('Debug Tools', { exact: true })).toBeVisible()

  const kadirSection = page.locator('.debug-section').filter({ hasText: 'kadir (p1)' })
  await kadirSection.locator('input[type="number"]').nth(1).fill('5')
  const addCardSection = page.locator('.debug-section').filter({ hasText: 'Add card' })
  for (const playerId of ['p1', 'p2']) {
    for (const cardId of ['spark', 'flare']) {
      await addCardSection.locator('select').nth(0).selectOption(cardId)
      await addCardSection.locator('select').nth(1).selectOption(playerId)
      await addCardSection.locator('select').nth(2).selectOption('hand')
      await addCardSection.getByRole('button', { name: 'Add', exact: true }).click()
    }
  }
  await page.getByRole('button', { name: 'Close (Ctrl+D)' }).click()

  for (let attempt = 0; attempt < 10; attempt++) {
    await resolveAttackIfNeeded(page)
    const mainPhase = page.getByRole('button', { name: 'Start Main Phase →' })
    if (await mainPhase.isVisible().catch(() => false)) await mainPhase.click()
    await page.locator('.char-btn').first().click()
    const ability = page.getByRole('button', { name: 'Activate Ability' })
    if (await ability.isVisible().catch(() => false)) {
      await expect(ability).toBeEnabled()
      await ability.click()
      break
    }
    await page.waitForTimeout(50)
  }

  const currentPlayer = page.locator('.char-btn.cur')
  await expect(currentPlayer).toHaveCount(1)
  await currentPlayer.click()
  for (const cardName of ['Spark', 'Flare']) {
    const spell = page.locator('.hand .card').filter({ has: page.locator(`img[alt="${cardName}"]`) }).last()
    await spell.click()
    await expect(page.locator('.breach[data-breach-index="1"] .breach-spell-card-frame')).toHaveCount(cardName === 'Spark' ? 0 : 1)
    await dragSpellToBreach(page, spell, 1)
  }

  await expect(page.locator('.breach[data-breach-index="1"] .breach-spell-card-frame')).toHaveCount(2)
})

test('Save & Exit creates a resumable game record', async ({ page }) => {
  await resetSetup(page)
  await page.getByLabel('Player 1').selectOption('kadir')
  await page.getByLabel('Player 2').selectOption('mist')
  await page.getByRole('button', { name: 'Start Game' }).click()
  await expect(page.getByText('Market', { exact: true })).toBeVisible()
  await resolveAttackIfNeeded(page)

  await page.keyboard.press('Escape')
  await expect(page.getByRole('heading', { name: 'Exit Game?' })).toBeVisible()
  await page.getByRole('button', { name: 'Save & Exit' }).click()

  await expect(page.getByRole('heading', { name: /Saved Games \(1\)/ })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Resume Game' })).toBeVisible()
  await page.getByRole('button', { name: 'Resume Game' }).click()
  await expect(page.getByText('Market', { exact: true })).toBeVisible()
})

test('hand stays inside its column and scrolls horizontally with the wheel', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1100 })
  await resetSetup(page)
  await page.getByLabel('Player 1').selectOption('jian')
  await page.getByLabel('Player 2').selectOption('brama')
  await page.getByRole('button', { name: 'Start Game' }).click()
  await resolveStartupInterrupts(page)

  const hand = page.locator('.hand')
  await applyDebugGameState(page, game => {
    for (const player of game.players) {
      player.hand = ['spark', 'crystal', 'spark', 'crystal']
    }
  })
  const measureHand = () => hand.evaluate(element => {
    const cards = [...element.querySelectorAll<HTMLElement>('.card')]
    const first = cards[0]!.getBoundingClientRect()
    const last = cards[cards.length - 1]!.getBoundingClientRect()
    const container = element.getBoundingClientRect()
    const styles = getComputedStyle(element)
    const contentWidth = last.right - first.left
    const safeLeft = container.left
    const safeRight = container.right - Number.parseFloat(styles.paddingRight)
    const centeredLeft = window.innerWidth / 2 - contentWidth / 2
    return {
      actualLeft: first.left,
      expectedLeft: Math.min(Math.max(safeLeft, centeredLeft), safeRight - contentWidth),
      contentWidth,
    }
  })
  const centered = await measureHand()
  expect(Math.abs(centered.actualLeft - centered.expectedLeft)).toBeLessThan(2)

  await applyDebugGameState(page, game => {
    for (const player of game.players) {
      player.hand = ['spark', 'crystal', 'spark', 'crystal', 'spark']
    }
  })
  const stillCentered = await measureHand()
  expect(Math.abs(stillCentered.actualLeft - stillCentered.expectedLeft)).toBeLessThan(2)

  await applyDebugGameState(page, game => {
    for (const player of game.players) {
      player.hand = Array.from({ length: 12 }, (_, index) => index % 2 ? 'crystal' : 'spark')
    }
  })

  await expect(hand).toBeVisible()
  const dimensions = await hand.evaluate(element => ({
    clientWidth: element.clientWidth,
    scrollWidth: element.scrollWidth,
    scrollLeft: element.scrollLeft,
    cardTop: element.querySelector<HTMLElement>('.card')!.getBoundingClientRect().top,
    cardBottom: element.querySelector<HTMLElement>('.card')!.getBoundingClientRect().bottom,
    handTop: element.getBoundingClientRect().top,
    handBottom: element.getBoundingClientRect().bottom,
  }))
  expect(dimensions.scrollWidth).toBeGreaterThan(dimensions.clientWidth)
  expect(dimensions.cardTop - dimensions.handTop).toBeGreaterThanOrEqual(3)
  expect(dimensions.handBottom - dimensions.cardBottom).toBeGreaterThanOrEqual(3)
  const box = await hand.boundingBox()
  expect(box).not.toBeNull()
  await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2)
  await page.mouse.wheel(0, 500)
  await expect.poll(() => hand.evaluate(element => element.scrollLeft)).toBeGreaterThan(dimensions.scrollLeft)
  const rightPosition = await hand.evaluate(element => element.scrollLeft)
  await page.mouse.wheel(0, -500)
  await expect.poll(() => hand.evaluate(element => element.scrollLeft)).toBeLessThan(rightPosition)
})

test('discard pile groups future cards from the bottom upward', async ({ page }) => {
  await resetSetup(page)
  await page.getByLabel('Player 1').selectOption('jian')
  await page.getByLabel('Player 2').selectOption('brama')
  await page.getByRole('button', { name: 'Start Game' }).click()
  await resolveStartupInterrupts(page)

  await applyDebugGameState(page, game => {
    for (const player of game.players) {
      player.deck = ['crystal', 'spark', 'crystal', 'spark', 'crystal']
      player.discard = Array.from({ length: 11 }, (_, index) => index % 2 ? 'crystal' : 'spark')
    }
  })

  await page.locator('.discard-pile').click()
  const rows = page.locator('.pile-modal .pile-row')
  await expect(rows).toHaveCount(3)
  await expect(rows.nth(0).locator('.pile-row-label')).toHaveText('FUTURE DRAW')
  await expect(rows.nth(1).locator('.pile-row-label')).toHaveText('FUTURE DRAW')
  await expect(rows.nth(2).locator('.pile-row-label')).toHaveText('NEXT DRAW')
  await expect(rows.nth(0).locator('.pile-card')).toHaveCount(1)
  await expect(rows.nth(1).locator('.pile-card')).toHaveCount(5)
  await expect(rows.nth(2).locator('.pile-card')).toHaveCount(5)
})
