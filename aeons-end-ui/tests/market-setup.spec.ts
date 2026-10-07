import { expect, test } from '@playwright/test'

async function clearInitialNemesisDraw(page: import('@playwright/test').Page) {
  let quietChecks = 0
  for (let attempt = 0; attempt < 40; attempt++) {
    const flight = page.locator('.nemesis-draw-flight-scene')
    if (await flight.isVisible().catch(() => false)) {
      await expect(flight).toHaveCount(0, { timeout: 5000 })
      quietChecks = 0
      continue
    }
    const reveal = page.locator('.nemesis-draw-reveal-screen')
    if (await reveal.isVisible().catch(() => false)) {
      await reveal.click({ position: { x: 12, y: 12 } })
      await expect(reveal).toHaveCount(0)
      quietChecks = 0
      continue
    }
    const shield = page.locator('.turn-transition-shield')
    if (await shield.isVisible().catch(() => false)) {
      await expect(shield).toBeHidden({ timeout: 5000 })
      quietChecks = 0
      continue
    }
    await page.waitForTimeout(100)
    if (++quietChecks >= 3) return
  }
}

test('Market Supply cards do not lift on hover', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Start Game' }).click()
  for (let attempt = 0; attempt < 20; attempt++) {
    const flight = page.locator('.nemesis-draw-flight-scene')
    if (await flight.isVisible().catch(() => false)) {
      await expect(flight).toHaveCount(0, { timeout: 5000 })
      continue
    }
    const reveal = page.locator('.nemesis-draw-reveal-screen')
    if (await reveal.isVisible().catch(() => false)) {
      await reveal.click({ position: { x: 12, y: 12 } })
      await expect(reveal).toHaveCount(0)
      continue
    }
    const next = page.getByRole('button', { name: /^(Continue|Resolve Card|Skip|Confirm|Attack .+|Gravehold)$/ }).first()
    if (!(await next.isVisible().catch(() => false))) break
    await next.click()
  }
  await clearInitialNemesisDraw(page)
  await expect(page.locator('.turn-transition-shield')).toHaveCount(0)
  await expect(page.locator('.card-motion-shield')).toHaveCount(0)
  const pile = page.locator('.market-grid .pile').first()
  await expect(pile).toBeVisible()
  await pile.hover()
  await expect(pile).toHaveCSS('transform', 'none')
})

test('Market card picker filters by Wave and shows previews above the modal', async ({ page }) => {
  await page.goto('/')
  await page.locator('.market-slot-card').first().click()
  const waveTabs = page.getByRole('tablist', { name: 'Market Card Wave' })
  await expect(waveTabs.getByRole('tab', { name: 'Wave 1' })).toBeVisible()
  await waveTabs.getByRole('tab', { name: 'Wave 9' }).click()

  const atomizedAsh = page.locator('.market-picker-card').filter({ has: page.locator('img[alt="Atomized Ash"]') })
  await expect(atomizedAsh).toBeVisible()
  await atomizedAsh.hover()
  const preview = page.locator('.card-hover-preview.setup-market-picker-preview')
  await expect(preview).toBeVisible()
  const zIndexes = await page.evaluate(() => ({
    overlay: Number(getComputedStyle(document.querySelector('.setup-market-overlay')!).zIndex),
    preview: Number(getComputedStyle(document.querySelector('.card-hover-preview.setup-market-picker-preview')!).zIndex),
  }))
  expect(zIndexes.preview).toBeGreaterThan(zIndexes.overlay)
})

test('Setup accepts nine image-based market slot replacements', async ({ page }) => {
  await page.goto('/')
  await page.evaluate(() => localStorage.clear())
  await page.reload()
  const slots = page.locator('.market-slot-card')
  await expect(slots).toHaveCount(9)
  const selected = ['jade', 'sifters_pearl', 'clouded_sapphire', 'flexing_dagger', 'blasting_staff', 'phoenix_flame', 'ignite', 'dark_fire', 'chaos_arc']
  const selectedNames = ['Jade', "Sifter's Pearl", 'Clouded Sapphire', 'Flexing Dagger', 'Blasting Staff', 'Phoenix Flame', 'Ignite', 'Dark Fire', 'Chaos Arc']
  for (let index = 0; index < selected.length; index++) {
    await slots.nth(index).click()
    await page.getByRole('tablist', { name: 'Market Card Wave' }).getByRole('tab', { name: 'Wave 1' }).click()
    const card = page.locator('.market-picker-card').filter({ has: page.locator(`img[alt="${selectedNames[index]}"]`) }).first()
    await expect(card).toBeVisible()
    await card.click()
  }
  await page.getByRole('button', { name: 'Start Game' }).click()
  await expect(page.locator('.market-grid .pile img')).toHaveCount(9)
  await page.keyboard.press('Control+d')
  await page.getByRole('button', { name: 'Load Current', exact: true }).click()
  const saved = JSON.parse(await page.locator('.debug-panel textarea').inputValue())
  expect(saved.game.market.piles.map((pile: { cardId: string }) => pile.cardId)).toEqual(selected)
})


test('Setup previews follow Mage and Nemesis selections', async ({ page }) => {
  await page.goto('/')
  await page.evaluate(() => localStorage.clear())
  await page.reload()
  const previews = page.locator('.mat-preview-button img')
  await expect(previews).toHaveCount(3)
  const initialMage = await previews.nth(0).getAttribute('src')
  const initialNemesis = await previews.nth(2).getAttribute('src')
  const mageSelect = page.getByLabel('Player 1 Mage', { exact: true })
  const initialMageType = await mageSelect.inputValue()
  await page.getByRole('tablist', { name: 'Mage Wave Tabs — First Player' }).getByRole('tab', { name: 'Wave 1' }).click()
  await mageSelect.selectOption(initialMageType === 'adelheim' ? 'jian' : 'adelheim')
  await page.getByLabel('Nemesis', { exact: true }).selectOption('prince_of_gluttons')
  await expect(previews.nth(0)).not.toHaveAttribute('src', initialMage ?? '')
  await expect(previews.nth(2)).not.toHaveAttribute('src', initialNemesis ?? '')
})

test('Mage mat images open a picker and sync the Mage dropdown', async ({ page }) => {
  await page.goto('/')
  await page.evaluate(() => localStorage.clear())
  await page.reload()

  const mageSelect = page.getByLabel('Player 1 Mage', { exact: true })
  await page.getByRole('tablist', { name: 'Mage Wave Tabs — First Player' }).getByRole('tab', { name: 'Wave 1' }).click()
  await expect(mageSelect.locator('option')).toHaveCount(8)
  await page.getByRole('button', { name: 'Choose First Mage' }).click()
  await expect(page.getByRole('dialog', { name: 'Choose Player 1 Mage' })).toBeVisible()
  await expect(page.locator('.mage-picker-card')).toHaveCount(8)

  const secondMage = await page.getByLabel('Player 2 Mage', { exact: true }).inputValue()
  const chosenMage = secondMage === 'adelheim' ? 'kadir' : 'adelheim'
  await page.getByRole('button', { name: `Choose ${chosenMage} Mage` }).click()
  await expect(mageSelect).toHaveValue(chosenMage)
  await expect(page.getByRole('dialog', { name: 'Choose Player 1 Mage' })).toHaveCount(0)
  const chosenMageName = chosenMage.split('_').map(part => `${part[0]!.toUpperCase()}${part.slice(1)}`).join(' ')
  await expect(page.getByRole('img', { name: `${chosenMageName} mage mat` })).toBeVisible()
})

test('Nemesis mat image opens a picker and syncs the Nemesis dropdown', async ({ page }) => {
  await page.goto('/')
  await page.evaluate(() => localStorage.clear())
  await page.reload()

  const nemesisSelect = page.getByLabel('Nemesis', { exact: true })
  await expect(nemesisSelect).toHaveValue('rageborne')
  await page.getByRole('button', { name: 'Choose Nemesis' }).click()
  await expect(page.getByRole('dialog', { name: 'Choose Nemesis' })).toBeVisible()
  await expect(page.locator('.nemesis-picker-card')).toHaveCount(2)

  await page.getByRole('button', { name: 'Choose Prince of Gluttons Nemesis' }).click()
  await expect(nemesisSelect).toHaveValue('prince_of_gluttons')
  await expect(page.getByRole('dialog', { name: 'Choose Nemesis' })).toHaveCount(0)
  await expect(page.getByRole('img', { name: 'Prince of Gluttons nemesis mat' })).toBeVisible()
})

test('Setup Mage and Nemesis mat frames match the rounded image bounds', async ({ page }) => {
  await page.goto('/')
  await page.evaluate(() => localStorage.clear())
  await page.reload()

  for (const selector of ['.mat-preview-button--mage', '.mat-preview-button--nemesis']) {
    const frame = page.locator(selector).first()
    await expect(frame.locator('img')).toBeVisible()
    await frame.hover()
    const geometry = await frame.evaluate((button) => {
      const image = button.querySelector('img')!
      const frameRect = button.getBoundingClientRect()
      const imageRect = image.getBoundingClientRect()
      return {
        frame: { left: frameRect.left, top: frameRect.top, right: frameRect.right, bottom: frameRect.bottom, width: frameRect.width, height: frameRect.height },
        image: { left: imageRect.left, top: imageRect.top, right: imageRect.right, bottom: imageRect.bottom },
        naturalRatio: image.naturalWidth / image.naturalHeight,
        frameRadius: getComputedStyle(button).borderTopLeftRadius,
        imageRadius: getComputedStyle(image).borderTopLeftRadius,
        imageFit: getComputedStyle(image).objectFit,
        highlight: getComputedStyle(button, '::after').borderTopColor,
      }
    })

    for (const edge of ['left', 'top', 'right', 'bottom'] as const) {
      expect(Math.abs(geometry.frame[edge] - geometry.image[edge])).toBeLessThan(0.5)
    }
    expect(Math.abs(geometry.frame.width / geometry.frame.height - geometry.naturalRatio)).toBeLessThan(0.005)
    expect(geometry.frameRadius).not.toBe('0px')
    expect(geometry.imageRadius).toBe(geometry.frameRadius)
    expect(geometry.imageFit).toBe('fill')
    expect(geometry.highlight).not.toBe('rgba(0, 0, 0, 0)')
  }
})

test('Nemesis setup filters its dropdown and picker by Wave', async ({ page }) => {
  await page.goto('/')
  await page.evaluate(() => localStorage.clear())
  await page.reload()

  const nemesisSelect = page.getByLabel('Nemesis', { exact: true })
  await expect(nemesisSelect.locator('option')).toHaveCount(2)
  await page.getByRole('group', { name: 'Nemesis Wave Tabs' }).getByRole('button', { name: 'Wave 9' }).click()
  await expect(nemesisSelect).toHaveValue('crooked_mask')
  await expect(nemesisSelect.locator('option')).toHaveCount(1)

  await page.getByRole('button', { name: 'Choose Nemesis' }).click()
  const pickerTabs = page.getByRole('tablist', { name: 'Nemesis Wave', exact: true })
  await expect(pickerTabs.getByRole('tab', { name: 'Wave 9' })).toHaveAttribute('aria-selected', 'true')
  await expect(page.locator('.nemesis-picker-card')).toHaveCount(1)
  await expect(page.getByRole('button', { name: 'Choose Crooked Mask Nemesis' })).toBeVisible()
})

test('Setup randomizes Mages and Nemesis without changing difficulty', async ({ page }) => {
  await page.goto('/')
  await page.evaluate(() => localStorage.clear())
  await page.reload()

  const mageOptions = await page.locator('select[aria-label="Player 1 Mage"] option').allTextContents()
  expect(mageOptions.every(option => !option.includes('('))).toBeTruthy()
  await page.getByLabel('Nemesis Difficulty').selectOption('increased')

  const player1Mage = page.getByLabel('Player 1 Mage')
  const player2Mage = page.getByLabel('Player 2 Mage')
  const nemesis = page.getByLabel('Nemesis', { exact: true })
  const initialPlayer1 = await player1Mage.inputValue()
  const initialPlayer2 = await player2Mage.inputValue()
  const initialNemesis = await nemesis.inputValue()

  await page.getByRole('button', { name: 'Randomize First Mage' }).click()
  await page.getByRole('button', { name: 'Randomize Second Mage' }).click()
  await page.getByRole('button', { name: 'Randomize Nemesis' }).click()

  await expect(player1Mage).not.toHaveValue(initialPlayer1)
  await expect(player2Mage).not.toHaveValue(initialPlayer2)
  await expect(nemesis).not.toHaveValue(initialNemesis)
  expect(await player1Mage.inputValue()).not.toBe(await player2Mage.inputValue())
  await expect(page.getByLabel('Nemesis Difficulty')).toHaveValue('increased')
})

test('Setup randomizes both Mages on entry and Wave tabs select from their Wave', async ({ page }) => {
  await page.addInitScript(() => { Math.random = () => 0 })
  await page.goto('/')
  const firstTabs = page.getByRole('tablist', { name: 'Mage Wave Tabs — First Player' })
  const secondTabs = page.getByRole('tablist', { name: 'Mage Wave Tabs — Second Player' })
  const firstMage = page.getByLabel('Player 1 Mage', { exact: true })
  const secondMage = page.getByLabel('Player 2 Mage', { exact: true })

  await expect(firstTabs.getByRole('tab', { name: 'Wave 1' })).toHaveAttribute('aria-selected', 'true')
  await expect(secondTabs.getByRole('tab', { name: 'Wave 1' })).toHaveAttribute('aria-selected', 'true')
  expect(await firstMage.inputValue()).not.toBe(await secondMage.inputValue())

  await page.getByRole('button', { name: 'Start Game' }).click()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('heading', { name: 'Exit Game?' })).toBeVisible()
  await page.evaluate(() => { Math.random = () => 0.999999 })
  await page.getByRole('button', { name: 'Exit Without Saving' }).click()
  await expect(firstTabs.getByRole('tab', { name: 'Wave 9' })).toHaveAttribute('aria-selected', 'true')
  await expect(secondTabs.getByRole('tab', { name: 'Wave 9' })).toHaveAttribute('aria-selected', 'true')
  await expect(firstMage.locator('option')).toHaveCount(10)
  await expect(secondMage.locator('option')).toHaveCount(9)
  expect(await firstMage.inputValue()).not.toBe(await secondMage.inputValue())

  await firstTabs.getByRole('tab', { name: 'Wave 1' }).click()
  await expect(firstTabs.getByRole('tab', { name: 'Wave 1' })).toHaveAttribute('aria-selected', 'true')
  await expect(firstMage.locator('option')).toHaveCount(8)
  const wave1Mage = await firstMage.inputValue()
  await firstTabs.getByRole('tab', { name: 'Wave 1' }).click()
  await expect(firstMage).not.toHaveValue(wave1Mage)

  await secondTabs.getByRole('tab', { name: 'Wave 1' }).click()
  await expect(secondTabs.getByRole('tab', { name: 'Wave 1' })).toHaveAttribute('aria-selected', 'true')
  await expect(secondMage.locator('option')).toHaveCount(7)
  expect(await firstMage.inputValue()).not.toBe(await secondMage.inputValue())
})

test('Setup uses three columns, a visual market grid, and vertical scrolling', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 600 })
  await page.goto('/')
  await page.evaluate(() => localStorage.clear())
  await page.reload()
  await expect(page.locator('.setup-mage-column .mat-preview-button--mage')).toHaveCount(2)
  await expect(page.locator('.setup-nemesis-column .mat-preview-button--nemesis')).toHaveCount(1)
  await expect(page.locator('.market-slot-grid')).toHaveCount(1)
  await expect(page.locator('.market-slot-grid img')).toHaveCount(9)
  await expect(page.locator('.market-slot-name, .market-slot-cost, .market-slot-label')).toHaveCount(0)
  await expect(page.getByLabel('Market Setup Template')).toHaveValue('template1')
  const toolbar = await page.locator('.market-setup-toolbar').evaluate(element => {
    const title = element.querySelector('h2')!.getBoundingClientRect()
    const select = element.querySelector('select')!.getBoundingClientRect()
    const refresh = element.querySelector('button')!.getBoundingClientRect()
    return {
      titleRight: title.right,
      selectLeft: select.left,
      selectRight: select.right,
      refreshLeft: refresh.left,
      selectHeight: select.height,
      refreshHeight: refresh.height,
    }
  })
  expect(toolbar.selectLeft).toBeGreaterThanOrEqual(toolbar.titleRight)
  expect(toolbar.refreshLeft).toBeGreaterThanOrEqual(toolbar.selectRight)
  expect(Math.abs(toolbar.selectHeight - toolbar.refreshHeight)).toBeLessThanOrEqual(1)
  const layout = await page.locator('.setup-layout').evaluate(element => {
    const style = getComputedStyle(element)
    const setup = element.closest('.setup')!
    return { columns: style.gridTemplateColumns.split(' ').length, scrollable: setup.scrollHeight > setup.clientHeight }
  })
  expect(layout.columns).toBe(3)
  expect(layout.scrollable).toBeTruthy()
})
