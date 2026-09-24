import { test, expect } from '@playwright/test'

test('loads setup and starts a game', async ({ page }) => {
  await page.goto('/')

  await expect(page.getByRole('heading', { name: "Aeon's End — Digital Demo" })).toBeVisible()
  await expect(page.getByRole('heading', { name: /Saved Games/ })).toBeVisible()

  await page.getByRole('button', { name: 'Start Game' }).click()

  await expect(page.getByText('Market', { exact: true })).toBeVisible()
  await expect(page.getByText(/Round \d+/)).toBeVisible()
  await expect(page.getByRole('region', { name: 'Nemesis Mainboard' })).toBeVisible()
  await expect(page.getByRole('img', { name: 'Rageborne mat' })).toBeVisible()
  await expect(page.getByText('Strike Deck', { exact: true })).toBeVisible()
  await expect(page.locator('.nemesis-play')).toBeVisible()

  for (let attempt = 0; attempt < 8; attempt++) {
    const continueDraw = page.getByRole('button', { name: 'Continue', exact: true })
    if (await continueDraw.isVisible().catch(() => false)) {
      await continueDraw.click()
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
    break
  }

  await page.getByRole('button', { name: 'Open game help' }).click()
  await expect(page.getByRole('dialog', { name: 'Game Help' })).toBeVisible()
  await expect(page.getByText('Ctrl + Z', { exact: true })).toBeVisible()
  await expect(page.getByText('Toggle Debug Tools.', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Close game help' }).click()
  await expect(page.getByRole('dialog', { name: 'Game Help' })).toBeHidden()
})

test('rejects selecting the same Mage twice', async ({ page }) => {
  await page.goto('/')
  await page.getByLabel('Player 1').selectOption('brama')
  await expect(page.getByText('This Mage has already been selected by another player.')).toBeVisible()
  await page.getByRole('button', { name: 'Start Game' }).click()
  await expect(page.getByText('Market', { exact: true })).toHaveCount(0)
})

test('Jian ability enters the no-popup prepped-spell flow', async ({ page }) => {
  await page.goto('/')
  await page.getByLabel('Player 1').selectOption('jian')
  await page.getByLabel('Player 2').selectOption('brama')
  await page.getByRole('button', { name: 'Start Game' }).click()

  // The turn-order deck is shuffled. Resolve Nemesis turns and pass the other
  // player's empty turn until Jian is the active player in Main Phase.
  for (let attempt = 0; attempt < 12; attempt++) {
    const continueDraw = page.getByRole('button', { name: 'Continue', exact: true })
    if (await continueDraw.isVisible().catch(() => false)) {
      await continueDraw.click()
      continue
    }
    const nemesisConfirm = page.getByRole('button', { name: 'Confirm', exact: true })
    if (await nemesisConfirm.isVisible().catch(() => false)) {
      await nemesisConfirm.click()
      continue
    }
    const nemesisEffectCard = page.locator('.nemesis-play-card.effect-target').first()
    if (await nemesisEffectCard.isVisible().catch(() => false)) {
      await nemesisEffectCard.click()
      continue
    }
    const attackButton = page.getByRole('button', { name: /^(Attack .+|Gravehold)$/ }).first()
    if (await attackButton.isVisible().catch(() => false)) {
      await attackButton.click()
      continue
    }
    const currentButton = page.locator('.char-btn.cur')
    const currentMage = await currentButton.locator('.cn').textContent().catch(() => null)
    if (await currentButton.isVisible().catch(() => false)) {
      await currentButton.click()
      const mainPhaseButton = page.getByRole('button', { name: 'Start Main Phase →' })
      if (await mainPhaseButton.isVisible().catch(() => false)) await mainPhaseButton.click()
      if (currentMage?.toLowerCase() !== 'jian') {
        const endTurnButton = page.getByRole('button', { name: 'End Turn', exact: true })
        if (await endTurnButton.isVisible().catch(() => false)) {
          await endTurnButton.click()
          continue
        }
      }
    }
    if (currentMage?.toLowerCase() === 'jian' && await page.getByRole('button', { name: 'Activate Ability' }).isVisible().catch(() => false)) break
    await page.waitForTimeout(50)
  }

  await page.keyboard.press('Control+d')
  await expect(page.getByText('Debug Tools', { exact: true })).toBeVisible()

  const addCardSection = page.locator('.debug-section').filter({ hasText: 'Add card' })
  const section = page.locator('.debug-section').filter({ hasText: 'jian (wave1_JIAN)' })
  await section.getByRole('spinbutton', { name: 'Charge for jian' }).fill('4')
  const cardPicker = addCardSection.locator('.debug-card-picker')
  await cardPicker.getByRole('searchbox', { name: 'Search debug cards' }).fill('spark')
  await cardPicker.locator('.debug-card-option[data-card-id="spark"]').click()
  await addCardSection.getByLabel('Debug card player').selectOption('wave1_JIAN')
  await addCardSection.getByLabel('Debug card zone').selectOption('hand')
  await addCardSection.getByRole('button', { name: 'Add Card', exact: true }).click()

  // Keep the drag assertion deterministic: selecting Jian only changes the
  // displayed player, while the active turn can still belong to Brama after
  // the shuffled turn-order setup. Force Jian into Main Phase in the same
  // debug transaction that added the test spell.
  const stateField = page.locator('.debug-panel textarea')
  await page.getByRole('button', { name: 'Load Current', exact: true }).click()
  const debugState = JSON.parse(await stateField.inputValue())
  debugState.phase = 'main'
  debugState.selectedPlayer = 'wave1_JIAN'
  debugState.game.currentTurn = 'wave1_JIAN'
  debugState.game.currentPhase = 'main'
  debugState.game.pendingDecision = null
  debugState.game.pendingEffect = null
  await stateField.fill(JSON.stringify(debugState))
  await page.getByRole('button', { name: 'Apply', exact: true }).click()

  await page.getByRole('button', { name: 'Close (Ctrl+D)' }).click()
  await page.locator('.char-btn').filter({ hasText: 'jian' }).click()

  // The current player is the selected player. Put one of the added Sparks on
  // the first open breach, then activate Jian's ability.
  const sparkInHand = page.locator('.hand .card.spell-draggable').filter({ has: page.locator('img[alt="Spark"]') }).last()
  await expect(sparkInHand).toBeVisible()
  await sparkInHand.scrollIntoViewIfNeeded()
  const sparkBox = await sparkInHand.boundingBox()
  const breachBox = await page.locator('.breach[data-breach-index="1"]').boundingBox()
  expect(sparkBox).not.toBeNull()
  expect(breachBox).not.toBeNull()
  await page.mouse.move(sparkBox!.x + sparkBox!.width / 2, sparkBox!.y + sparkBox!.height / 2)
  await page.mouse.down()
  await page.mouse.move(breachBox!.x + breachBox!.width / 2, breachBox!.y + breachBox!.height / 2, { steps: 8 })
  await page.mouse.up()
  await expect(page.locator('.breach[data-breach-index="1"] .breach-spell-card-frame')).toHaveCount(1)
  const abilityButton = page.getByRole('button', { name: 'Activate Ability' })
  await expect(abilityButton).toBeEnabled()
  await abilityButton.click()

  const highlightedSpell = page.locator('.breach-spell-card-frame.ability-prepped-spell')
  await expect(highlightedSpell).toHaveCount(1)
  await expect(page.locator('.decision-overlay')).toHaveCount(0)
  const damageBadge = highlightedSpell.locator('.spell-damage-badge')
  await expect(damageBadge).toHaveText('1')
  await expect(damageBadge).toBeHidden()
  await highlightedSpell.hover()
  await expect(damageBadge).toBeVisible()

  await highlightedSpell.click()
  await expect(highlightedSpell).toHaveCount(1)
  await highlightedSpell.click()
  await expect(page.locator('.breach-spell-card-frame.ability-prepped-spell')).toHaveCount(0)
  await expect(abilityButton).toBeDisabled()
})
