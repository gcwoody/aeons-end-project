import { expect, test } from '@playwright/test'

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

test('Template 1 creates the requested cost bands', async ({ page }) => {
  await page.goto('/')
  await page.evaluate(() => localStorage.clear())
  await page.reload()
  await expect(page.getByLabel('Market Setup Template')).toHaveValue('template1')
  await expect(page.getByText(/Template One: Gems ≤3 \/ 4 \/ ≥5 Aether/)).toBeVisible()
  await expect(page.getByRole('button', { name: 'Refresh semi-random market' })).toBeVisible()
  await expect(page.locator('.market-slot-card img')).toHaveCount(9)
  await page.getByRole('button', { name: 'Refresh semi-random market' }).click()
  await page.getByRole('button', { name: 'Start Game' }).click()
  await page.keyboard.press('Control+d')
  await page.getByRole('button', { name: 'Load Current', exact: true }).click()
  const saved = JSON.parse(await page.locator('.debug-panel textarea').inputValue())
  const piles = saved.game.market.piles as Array<{ cardId: string }>
  expect(piles).toHaveLength(9)
  expect(new Set(piles.map(pile => pile.cardId)).size).toBe(9)
  const costs: Record<string, number> = {
    vriswood_amber: 3, diamond_cluster: 4, burning_opal: 5, clouded_sapphire: 6, jade: 2, searing_ruby: 4, sifters_pearl: 3,
    flexing_dagger: 2, bottled_vortex: 3, blasting_staff: 4, focusing_orb: 4, mages_talisman: 5, unstable_prism: 3,
    amplify_vision: 4, arcane_nexus: 7, chaos_arc: 6, consuming_void: 7, dark_fire: 5, essence_theft: 5, feral_lightning: 5,
    ignite: 4, lava_tendril: 4, oblivion_swell: 5, phoenix_flame: 3, planar_insight: 6, spectral_echo: 3, wildfire_whip: 6,
  }
  const types: Record<string, string> = {
    ...Object.fromEntries(['vriswood_amber', 'diamond_cluster', 'burning_opal', 'clouded_sapphire', 'jade', 'searing_ruby', 'sifters_pearl'].map(id => [id, 'gem'])),
    ...Object.fromEntries(['flexing_dagger', 'bottled_vortex', 'blasting_staff', 'focusing_orb', 'mages_talisman', 'unstable_prism'].map(id => [id, 'relic'])),
  }
  const picked = piles.map(pile => ({ type: types[pile.cardId] ?? 'spell', cost: costs[pile.cardId] }))
  expect(picked.filter(card => card.type === 'gem')).toHaveLength(3)
  expect(picked.filter(card => card.type === 'relic')).toHaveLength(2)
  expect(picked.filter(card => card.type === 'spell')).toHaveLength(4)
  expect(picked.some(card => card.type === 'gem' && card.cost <= 3)).toBeTruthy()
  expect(picked.some(card => card.type === 'gem' && card.cost === 4)).toBeTruthy()
  expect(picked.some(card => card.type === 'gem' && card.cost >= 5)).toBeTruthy()
  expect(picked.some(card => card.type === 'relic' && card.cost <= 3)).toBeTruthy()
  expect(picked.some(card => card.type === 'relic' && card.cost >= 4)).toBeTruthy()
  expect(picked.some(card => card.type === 'spell' && card.cost === 3)).toBeTruthy()
  expect(picked.some(card => card.type === 'spell' && card.cost === 4)).toBeTruthy()
  expect(picked.some(card => card.type === 'spell' && card.cost === 5)).toBeTruthy()
  expect(picked.some(card => card.type === 'spell' && card.cost >= 6)).toBeTruthy()
})

test('Setup previews follow Mage and Nemesis selections', async ({ page }) => {
  await page.goto('/')
  await page.evaluate(() => localStorage.clear())
  await page.reload()
  const previews = page.locator('.setup-preview-card img')
  await expect(previews).toHaveCount(3)
  const initialMage = await previews.nth(0).getAttribute('src')
  const initialNemesis = await previews.nth(2).getAttribute('src')
  await page.getByLabel('Player 1').selectOption('adelheim')
  await page.getByLabel('Nemesis', { exact: true }).selectOption('prince_of_gluttons')
  await expect(previews.nth(0)).not.toHaveAttribute('src', initialMage ?? '')
  await expect(previews.nth(2)).not.toHaveAttribute('src', initialNemesis ?? '')
})

test('Mage mat images open a picker and sync the Mage dropdown', async ({ page }) => {
  await page.goto('/')
  await page.evaluate(() => localStorage.clear())
  await page.reload()

  const mageSelect = page.getByLabel('Player 1 Mage', { exact: true })
  await expect(mageSelect).toHaveValue('jian')
  await page.getByRole('button', { name: 'Choose Player 1 Mage' }).click()
  await expect(page.getByRole('dialog', { name: 'Choose Player 1 Mage' })).toBeVisible()
  await expect(page.locator('.mage-picker-card')).toHaveCount(8)

  await page.getByRole('button', { name: 'Choose Adelheim Mage' }).click()
  await expect(mageSelect).toHaveValue('adelheim')
  await expect(page.getByRole('dialog', { name: 'Choose Player 1 Mage' })).toHaveCount(0)
  await expect(page.getByRole('img', { name: 'adelheim mage mat' })).toBeVisible()
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
  await expect(page.getByRole('img', { name: 'prince_of_gluttons nemesis mat' })).toBeVisible()
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

test('Setup uses three columns, a visual market grid, and vertical scrolling', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 600 })
  await page.goto('/')
  await page.evaluate(() => localStorage.clear())
  await page.reload()
  await expect(page.locator('.setup-mage-column .setup-preview-card')).toHaveCount(2)
  await expect(page.locator('.setup-nemesis-column .setup-preview-card')).toHaveCount(1)
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
