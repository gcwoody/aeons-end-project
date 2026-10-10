import { expect, test } from '@playwright/test'

const newMarketCards = [
  'clouded_sapphire', 'jade', 'searing_ruby', 'sifters_pearl',
  'blasting_staff', 'focusing_orb', 'mages_talisman', 'unstable_prism',
  'amplify_vision', 'chaos_arc', 'consuming_void', 'dark_fire',
  'feral_lightning', 'ignite', 'oblivion_swell', 'phoenix_flame',
  'spectral_echo', 'wildfire_whip',
]

async function openDebug(page: import('@playwright/test').Page) {
  await page.keyboard.press('Control+d')
  await expect(page.getByText('Debug Tools', { exact: true })).toBeVisible()
}



test('Searing Ruby shows spell-only Aether in the player control bar', async ({ page }) => {
  await page.goto('/')
  await page.evaluate(() => localStorage.clear())
  await page.reload()
  await page.getByRole('button', { name: 'Start Game' }).click()
  await openDebug(page)
  const stateField = page.locator('.debug-panel textarea')
  await page.getByRole('button', { name: 'Load Current', exact: true }).click()
  const debugState = JSON.parse(await stateField.inputValue())
  const player = debugState.game.players[0]
  debugState.selectedPlayer = player.id
  debugState.phase = 'main'
  debugState.game.currentTurn = player.id
  debugState.game.currentPhase = 'main'
  debugState.game.pendingDecision = null
  debugState.game.pendingEffect = null
  player.hand = ['searing_ruby']
  player.playedThisTurn = []
  player.bonusAether = 0
  player.regularAetherSpent = 0
  player.condAetherSpent = {}
  player.conditionalAetherEarned = {}
  await stateField.fill(JSON.stringify(debugState))
  await page.getByRole('button', { name: 'Apply', exact: true }).click()
  await page.getByRole('button', { name: 'Close (Ctrl+D)' }).click()

  await page.locator('.hand .card').filter({ has: page.locator('img[alt="Searing Ruby"]') }).click()
  await expect(page.locator('.aether')).toContainText('1 spell aether')
  await expect(page.locator('.aether > span')).toHaveCSS('color', 'rgb(255, 255, 255)')
})

test("Sifter's Pearl shows the revealed card in the decision modal", async ({ page }) => {
  await page.goto('/')
  await page.evaluate(() => localStorage.clear())
  await page.reload()
  await page.getByRole('button', { name: 'Start Game' }).click()
  await openDebug(page)

  const stateField = page.locator('.debug-panel textarea')
  await page.getByRole('button', { name: 'Load Current', exact: true }).click()
  const debugState = JSON.parse(await stateField.inputValue())
  const player = debugState.game.players[0]
  const ally = debugState.game.players[1]
  debugState.selectedPlayer = player.id
  debugState.phase = 'main'
  debugState.game.currentTurn = player.id
  debugState.game.currentPhase = 'main'
  debugState.game.pendingDecision = null
  debugState.game.pendingEffect = null
  player.hand = ['sifters_pearl']
  player.playedThisTurn = []
  player.deck = ['jade']
  player.discard = []
  player.bonusAether = 0
  ally.deck = []
  ally.discard = []
  await stateField.fill(JSON.stringify(debugState))
  await page.getByRole('button', { name: 'Apply', exact: true }).click()
  await page.getByRole('button', { name: 'Close (Ctrl+D)' }).click()

  await page.locator('.hand .card').filter({ has: page.locator("img[alt=\"Sifter's Pearl\"]") }).click()
  await expect(page.locator('.decision-modal')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.locator('.decision-modal')).toBeVisible()
  await expect(page.locator('.exit-overlay')).toHaveCount(0)
  await expect(page.locator('.reveal-top-card img[alt="Jade"]')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Discard the revealed card' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Return it to the top of the deck' })).toBeVisible()

  await page.getByRole('button', { name: 'Discard the revealed card' }).click()
  await expect(page.locator('.reveal-top-card')).toHaveCount(0)
  await expect(page.locator('.decision-modal')).toHaveCount(0)
})

test("Sifter's Pearl keeps the fast hand-play flight after both reveal decisions", async ({ page }) => {
  await page.goto('/')
  await page.evaluate(() => localStorage.clear())
  await page.reload()
  await page.getByRole('button', { name: 'Start Game' }).click()
  await openDebug(page)

  const stateField = page.locator('.debug-panel textarea')
  await page.getByRole('button', { name: 'Load Current', exact: true }).click()
  const debugState = JSON.parse(await stateField.inputValue())
  // Play from the second player so the reveal popups switch the view away and
  // back, which used to re-key the held hand card.
  const player = debugState.game.players[1]
  const ally = debugState.game.players[0]
  debugState.selectedPlayer = player.id
  debugState.phase = 'main'
  debugState.game.currentTurn = player.id
  debugState.game.currentPhase = 'main'
  debugState.game.pendingDecision = null
  debugState.game.pendingEffect = null
  player.hand = ['sifters_pearl']
  player.playedThisTurn = []
  player.deck = ['jade', 'crystal']
  player.discard = []
  ally.deck = ['spark', 'crystal']
  ally.discard = []
  await stateField.fill(JSON.stringify(debugState))
  await page.getByRole('button', { name: 'Apply', exact: true }).click()
  await page.getByRole('button', { name: 'Close (Ctrl+D)' }).click()

  await page.addStyleTag({ content: ':root { --hand-to-play-zone-flight-duration: 350ms; --card-flight-duration: 900ms; }' })
  await page.evaluate(() => {
    const tracked = window as typeof window & { pearlCloneDurations: number[] }
    tracked.pearlCloneDurations = []
    const originalAnimate = Element.prototype.animate
    Element.prototype.animate = function (keyframes, options) {
      if ((this as HTMLElement).classList.contains('card-flight-clone')) {
        tracked.pearlCloneDurations.push(Number((options as KeyframeAnimationOptions | undefined)?.duration ?? 0))
      }
      return originalAnimate.call(this, keyframes, options)
    }
  })

  await page.locator('.hand .card').filter({ has: page.locator("img[alt=\"Sifter's Pearl\"]") }).click()
  for (let index = 0; index < 2; index++) {
    const discard = page.getByRole('button', { name: 'Discard the revealed card' })
    await expect(discard).toBeVisible({ timeout: 5000 })
    await discard.click()
  }

  const played = page.locator('.played-zone-center [data-played-card-id="sifters_pearl"]')
  await expect(played).toBeVisible({ timeout: 5000 })
  await expect(page.locator('.card-motion-shield')).toBeHidden()
  const durations = await page.evaluate(() =>
    (window as typeof window & { pearlCloneDurations: number[] }).pearlCloneDurations)
  expect(durations).toContain(350)
  expect(durations).not.toContain(900)
})
