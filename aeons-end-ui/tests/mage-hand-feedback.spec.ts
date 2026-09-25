import { test, expect } from '@playwright/test'

test('ally draw updates the Mage button without changing the displayed Mage', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/')
  await page.evaluate(() => localStorage.clear())
  await page.reload()
  await page.getByRole('tab', { name: 'Wave 1', exact: true }).first().click()
  await page.getByRole('tab', { name: 'Wave 1', exact: true }).last().click()
  await page.getByLabel('Player 1 Mage').selectOption('mist')
  await page.getByLabel('Player 2 Mage').selectOption('brama')
  await page.getByRole('button', { name: 'Start Game' }).click()

  await page.keyboard.press('Control+d')
  await page.getByRole('button', { name: 'Load Current', exact: true }).click()
  const stateField = page.locator('.debug-panel textarea')
  const saved = JSON.parse(await stateField.inputValue())
  const mist = saved.game.players.find((candidate: { mageType: string }) => candidate.mageType === 'mist')
  const brama = saved.game.players.find((candidate: { mageType: string }) => candidate.mageType === 'brama')
  mist.charge = mist.chargeThreshold
  brama.deck = ['crystal', 'spark', 'crystal', 'spark']
  brama.discard = []
  saved.game.currentTurn = mist.id
  saved.game.currentPhase = 'main'
  saved.game.pendingDecision = null
  saved.game.pendingEffect = null
  saved.phase = 'main'
  saved.selectedPlayer = mist.id
  await stateField.fill(JSON.stringify(saved))
  await page.getByRole('button', { name: 'Apply', exact: true }).click()
  await page.getByRole('button', { name: 'Close (Ctrl+D)' }).click()

  const mistButton = page.locator('.char-btn').filter({ has: page.locator('.cn', { hasText: 'mist' }) })
  const bramaButton = page.locator('.char-btn').filter({ has: page.locator('.cn', { hasText: 'brama' }) })
  const before = Number(await bramaButton.locator('.chand strong').textContent())
  await expect(page.locator('.chand-gain')).toHaveCount(0)
  await expect(page.locator('.controls-status .turn')).toHaveCount(0)
  await expect(mistButton.locator('.chp')).toHaveText('HP 10')
  await expect(mistButton.locator('.chp')).toHaveCSS('color', 'rgb(247, 118, 142)')
  const controls = await page.evaluate(() => ({
    screenCenter: window.innerWidth / 2,
    controlsRight: document.querySelector('.controls')!.getBoundingClientRect().right,
    leftRight: document.querySelector('.controls-left')!.getBoundingClientRect().right,
    leftBottom: document.querySelector('.controls-left')!.getBoundingClientRect().bottom,
    mainLeft: document.querySelector('.controls-main')!.getBoundingClientRect().left,
    mainCenter: document.querySelector('.controls-main')!.getBoundingClientRect().left + document.querySelector('.controls-main')!.getBoundingClientRect().width / 2,
    mainTop: document.querySelector('.controls-main')!.getBoundingClientRect().top,
    mainRight: document.querySelector('.controls-main')!.getBoundingClientRect().right,
    helpLeft: document.querySelector('.help-button')!.getBoundingClientRect().left,
    helpBottom: document.querySelector('.help-button')!.getBoundingClientRect().bottom,
    helpRight: document.querySelector('.help-button')!.getBoundingClientRect().right,
  }))
  expect(controls.leftRight <= controls.mainLeft || controls.leftBottom <= controls.mainTop).toBe(true)
  expect(Math.abs(controls.mainCenter - controls.screenCenter)).toBeLessThanOrEqual(1)
  expect(controls.mainRight <= controls.helpLeft || controls.helpBottom <= controls.mainTop).toBe(true)
  expect(controls.helpRight).toBeLessThanOrEqual(controls.controlsRight)

  await page.getByRole('button', { name: 'Activate Ability' }).click()
  await expect(bramaButton.locator('.chand strong')).toHaveText(String(before + 4))
  await expect(bramaButton.locator('.chand-gain')).toHaveText('+4')
  await expect(mistButton).toHaveClass(/sel/)
  const gainPosition = await page.evaluate(() => {
    const button = document.querySelector('.char-btn.has-hand-gain')!.getBoundingClientRect()
    const badge = document.querySelector('.chand-gain')!.getBoundingClientRect()
    const phase = document.querySelector('.controls-status')!.getBoundingClientRect()
    const buttons = [...document.querySelectorAll('.char-btn')].map(element => element.getBoundingClientRect())
    return {
      buttonBottom: button.bottom,
      buttonRight: button.right,
      badgeLeft: badge.left,
      badgeBottom: badge.bottom,
      badgeRight: badge.right,
      phaseLeft: phase.left,
      firstButtonGap: buttons[1]!.left - buttons[0]!.right,
    }
  })
  expect(gainPosition.badgeBottom).toBeLessThanOrEqual(gainPosition.buttonBottom)
  expect(gainPosition.badgeLeft).toBeLessThan(gainPosition.buttonRight)
  expect(gainPosition.badgeRight).toBeGreaterThan(gainPosition.buttonRight)
  expect(gainPosition.badgeRight).toBeLessThanOrEqual(gainPosition.phaseLeft)
  expect(gainPosition.badgeRight - gainPosition.buttonRight).toBeLessThanOrEqual(gainPosition.firstButtonGap)

  await page.keyboard.press('Control+z')
  await expect(bramaButton.locator('.chand strong')).toHaveText(String(before))
  await expect(bramaButton.locator('.chand-gain')).toHaveCount(0)

  await page.getByRole('button', { name: 'Activate Ability' }).click()
  await expect(bramaButton.locator('.chand-gain')).toHaveText('+4')
  await bramaButton.click()
  await expect(bramaButton).toHaveClass(/sel/)
  await expect(bramaButton.locator('.chand-gain')).toHaveCount(0)
})

test('Mage buttons and ability resources do not overlap at desktop width', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  for (const mage of ['stake', 'wolf']) {
    await page.goto('/')
    await page.evaluate(() => localStorage.clear())
    await page.reload()
    await page.getByRole('tab', { name: 'Wave 9', exact: true }).first().click()
    await page.getByRole('tab', { name: 'Wave 1', exact: true }).last().click()
    await page.getByLabel('Player 1 Mage').selectOption(mage)
    await page.getByLabel('Player 2 Mage').selectOption('brama')
    await page.getByRole('button', { name: 'Start Game' }).click()
    await page.keyboard.press('Control+d')
    await page.getByRole('button', { name: 'Load Current', exact: true }).click()
    const stateField = page.locator('.debug-panel textarea')
    const saved = JSON.parse(await stateField.inputValue())
    saved.game.currentTurn = saved.game.players[0].id
    saved.game.currentPhase = 'main'
    saved.game.pendingDecision = null
    saved.game.pendingEffect = null
    saved.phase = 'main'
    saved.selectedPlayer = saved.game.players[0].id
    await stateField.fill(JSON.stringify(saved))
    await page.getByRole('button', { name: 'Apply', exact: true }).click()
    await page.getByRole('button', { name: 'Close (Ctrl+D)' }).click()
    const aetherIcon = page.locator('.controls .aether img[alt="Aether"]')
    await expect(aetherIcon).toBeVisible()
    expect(await aetherIcon.evaluate(image => (image as HTMLImageElement).naturalWidth)).toBeGreaterThan(0)
    await expect(page.locator('.controls .aether > span')).toHaveCSS('color', 'rgb(255, 255, 255)')
    const aetherNumber = page.locator('.controls .aether .controls-number').first()
    await expect(aetherNumber).toHaveCSS('font-size', '12px')
    await expect(aetherNumber).toHaveCSS('font-weight', '700')
    const knowledgeStatus = page.locator('.controls .knowledge-status')
    if (mage === 'stake') {
      await expect(knowledgeStatus.locator('img[alt="Knowledge"]')).toBeVisible()
      await expect(knowledgeStatus.locator('.controls-number')).toHaveText(/^\d+$/)
      await expect(knowledgeStatus).toHaveCSS('color', 'rgb(228, 219, 188)')
    } else {
      await expect(knowledgeStatus).toHaveCount(0)
    }
    const controls = await page.evaluate(() => ({
      screenCenter: window.innerWidth / 2,
      controlsRight: document.querySelector('.controls')!.getBoundingClientRect().right,
      leftRight: document.querySelector('.controls-left')!.getBoundingClientRect().right,
      leftBottom: document.querySelector('.controls-left')!.getBoundingClientRect().bottom,
      mainLeft: document.querySelector('.controls-main')!.getBoundingClientRect().left,
      mainCenter: document.querySelector('.controls-main')!.getBoundingClientRect().left + document.querySelector('.controls-main')!.getBoundingClientRect().width / 2,
      mainTop: document.querySelector('.controls-main')!.getBoundingClientRect().top,
      mainRight: document.querySelector('.controls-main')!.getBoundingClientRect().right,
      helpLeft: document.querySelector('.help-button')!.getBoundingClientRect().left,
      helpBottom: document.querySelector('.help-button')!.getBoundingClientRect().bottom,
      helpRight: document.querySelector('.help-button')!.getBoundingClientRect().right,
    }))
    expect(controls.leftRight <= controls.mainLeft || controls.leftBottom <= controls.mainTop,
      `${mage} controls overlap`).toBe(true)
    expect(Math.abs(controls.mainCenter - controls.screenCenter), `${mage} actions are not centered`).toBeLessThanOrEqual(1)
    expect(controls.mainRight <= controls.helpLeft || controls.helpBottom <= controls.mainTop,
      `${mage} help overlaps`).toBe(true)
    expect(controls.helpRight, `${mage} help is clipped`).toBeLessThanOrEqual(controls.controlsRight)
  }
})
