import { expect, test, type Page } from '@playwright/test'
import type { GameState } from '../../aeons-end-engine/src/types'

type DebugSnapshot = { game: GameState; phase: string; selectedPlayer: string }

async function readSnapshot(page: Page): Promise<DebugSnapshot> {
  await page.keyboard.press('Control+d')
  await page.getByRole('button', { name: 'Load Current', exact: true }).click()
  return JSON.parse(await page.locator('.debug-panel textarea').inputValue())
}

async function applySnapshot(page: Page, snapshot: DebugSnapshot) {
  await page.locator('.debug-panel textarea').fill(JSON.stringify(snapshot))
  await page.getByRole('button', { name: 'Apply', exact: true }).click()
  await page.getByRole('button', { name: 'Close (Ctrl+D)', exact: true }).click()
}

async function prepareQu(page: Page, form: 'giver' | 'taker', emptyDeck: boolean) {
  await page.goto('/')
  await page.evaluate(() => localStorage.clear())
  await page.reload()
  await page.getByRole('tab', { name: 'Wave 9', exact: true }).first().click()
  await page.getByRole('tab', { name: 'Wave 1', exact: true }).last().click()
  await page.getByLabel('Player 1 Mage').selectOption('qu')
  await page.getByLabel('Player 2 Mage').selectOption('brama')
  await page.getByRole('button', { name: 'Start Game', exact: true }).click()
  await expect(page.locator('.turn-transition-shield')).toHaveCount(0)
  if (await page.locator('.nemesis-draw-reveal-screen').isVisible()) {
    await expect(page.locator('.nemesis-draw-flight-scene')).toHaveCount(0)
    await page.locator('.nemesis-draw-reveal-screen').click({ position: { x: 12, y: 12 } })
  }
  const snapshot = await readSnapshot(page)
  const [qu, ally] = snapshot.game.players
  qu!.mageFormSide = form
  for (const player of snapshot.game.players) {
    player.hand = ['crystal', 'crystal', 'crystal', 'spark', 'spark']
    player.deck = emptyDeck ? [] : ['crystal', 'spark', 'jade']
    player.deckInstanceIds = []
    player.discard = []
    player.charge = 0
    player.bonusAether = 10
    player.playedThisTurn = []
    for (const breach of player.breaches) {
      breach.prepSpells = []
      breach.preppedThisTurn = []
      breach.preppedSpellFaceDown = []
      breach.preppedSpellInstanceIds = []
    }
  }
  const buyer = form === 'giver' ? qu! : ally!
  snapshot.game.currentTurn = buyer.id
  snapshot.game.currentPhase = 'main'
  snapshot.game.pendingDecision = null
  snapshot.game.pendingEffect = null
  snapshot.game.pendingNemesisDiscard = null
  snapshot.game.nemesisResolution = null
  snapshot.game.nemesis.playArea = []
  snapshot.game.market.piles = [{ cardId: 'moonstone_shard', remaining: 5 }]
  snapshot.phase = 'main'
  snapshot.selectedPlayer = buyer.id
  await applySnapshot(page, snapshot)
  return { quId: qu!.id, allyId: ally!.id, buyerId: buyer.id, snapshot }
}

async function sampleHandFeedback(page: Page) {
  await page.evaluate(() => {
    const observations: Array<{ hands: string[]; bubbles: string[] }> = []
    let stopped = false
    const sample = () => {
      observations.push({
        hands: [...document.querySelectorAll('.char-btn .chand strong')].map(element => element.textContent ?? ''),
        bubbles: [...document.querySelectorAll('.status-change-bubble--hand')].map(element => element.textContent ?? ''),
      })
      if (!stopped) requestAnimationFrame(sample)
    }
    Object.assign(window, { stopHandFeedbackSamples: () => { stopped = true; return observations } })
    sample()
  })
}

for (const form of ['giver', 'taker'] as const) {
  for (const emptyDeck of [true, false]) {
    for (const gainMethod of ['purchase', 'effect'] as const) {
      test(`Qu ${form} ${gainMethod} into ${emptyDeck ? 'empty' : 'existing'} deck preserves both hands`, async ({ page }, testInfo) => {
        await page.setViewportSize({ width: 1440, height: 900 })
        const { quId, allyId, buyerId } = await prepareQu(page, form, emptyDeck)
        if (gainMethod === 'effect') {
          const snapshot = await readSnapshot(page)
          snapshot.game.pendingDecision = {
            id: 'qu-effect-gain', playerId: buyerId, kind: 'select_market_pile', prompt: 'Choose a card to gain',
            candidates: [{ pileIndex: 0, cardId: 'moonstone_shard', cardName: 'Moonstone Shard', remaining: 5 }],
          }
          snapshot.game.pendingEffect = {
            sourcePlayerId: buyerId, effectPlayerId: buyerId, remainingEffects: [],
            awaiting: { kind: 'gain_card_from_market', destination: 'discard_top' },
          }
          await applySnapshot(page, snapshot)
        }
        await sampleHandFeedback(page)
        await page.locator('[data-supply-pile-index="0"]').click()
        const offer = page.locator('.decision-modal')
        await expect(offer).toContainText(form === 'giver' ? 'Use Giver Form' : 'Use Taker Form')
        await offer.getByRole('button', { name: 'Yes', exact: true }).click()
        await expect(offer).toHaveCount(0)
        await expect(page.locator('.card-flight-clone')).toHaveCount(0)
        const observations = await page.evaluate(() => (window as any).stopHandFeedbackSamples()) as Array<{
          hands: string[]; bubbles: string[];
        }>
        expect(observations.every(sample => sample.hands.length === 2 && sample.hands.every(count => count === '5')),
          JSON.stringify(observations.filter(sample => sample.hands.some(count => count !== '5')))).toBe(true)
        expect(observations.every(sample => sample.bubbles.length === 0), 'deck placement displayed a hand gain bubble').toBe(true)
        const after = await readSnapshot(page)
        await page.getByRole('button', { name: 'Close (Ctrl+D)', exact: true }).click()
        const recipient = after.game.players.find(player => player.id === (form === 'giver' ? allyId : quId))!
        expect(recipient.deck[0]).toBe('moonstone_shard')
        expect(recipient.deck.length).toBe(emptyDeck ? 1 : 4)
        for (const player of after.game.players) expect(player.hand.length).toBe(5)
        if (form === 'giver' && emptyDeck && gainMethod === 'effect') {
          await page.locator(`[data-player-control-id="${allyId}"]`).click()
          await page.screenshot({ path: testInfo.outputPath('qu-giver-deck-placement.png') })
        }
      })
    }
  }
}

test('Qu Giver draws real cards into the ally hand and undo clears the feedback', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  const { quId, allyId } = await prepareQu(page, 'giver', false)
  const snapshot = await readSnapshot(page)
  snapshot.game.players[0]!.charge = 4
  await applySnapshot(page, snapshot)
  await page.getByRole('button', { name: 'Activate Ability', exact: true }).click()
  await page.getByRole('button', { name: /Giver: An ally draws 3 cards/ }).click()
  const ally = page.locator(`[data-player-control-id="${allyId}"]`)
  await expect(ally.locator('.chand strong')).toHaveText('8')
  await expect(ally.locator('.status-change-bubble--hand')).toHaveText('+3')
  await expect(ally.locator('.status-change-bubble--hand')).toHaveCSS('background-color', 'rgb(255, 255, 255)')
  await expect(page.locator(`[data-player-control-id="${quId}"] .chand strong`)).toHaveText('5')
  await page.screenshot({ path: testInfo.outputPath('real-hand-gain-feedback.png') })
  await page.keyboard.press('Control+z')
  await expect(ally.locator('.chand strong')).toHaveText('5')
  await expect(page.locator('.status-change-bubble--hand')).toHaveCount(0)
})

test('undo also clears a charge bubble without changing the hand counter', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  const { quId } = await prepareQu(page, 'giver', false)
  await page.getByRole('button', { name: 'Charge', exact: true }).click()
  const qu = page.locator(`[data-player-control-id="${quId}"]`)
  await expect(qu.locator('.status-change-bubble--charge')).toHaveText('+1')
  await expect(qu.locator('.chand strong')).toHaveText('5')
  await page.keyboard.press('Control+z')
  await expect(qu.locator('.cch strong').first()).toHaveText('0')
  await expect(page.locator('.status-change-bubble--charge')).toHaveCount(0)
  await expect(qu.locator('.chand strong')).toHaveText('5')
})

test('a temporary Conjure reveal does not count as a real hand card', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  const { quId } = await prepareQu(page, 'giver', false)
  const snapshot = await readSnapshot(page)
  snapshot.game.players[0]!.hand = ['fused_opal', 'crystal', 'crystal', 'spark', 'spark']
  await applySnapshot(page, snapshot)
  await page.locator('[data-hand-card-id="fused_opal"]').click()
  await page.getByRole('button', { name: 'Conjure', exact: true }).click()
  await expect(page.locator('.hand .pending-conjure-card')).toBeVisible()
  const handCount = page.locator(`[data-player-control-id="${quId}"] .chand strong`)
  await expect(handCount).toHaveText('4')
  await expect(page.locator('.status-change-bubble--hand')).toHaveCount(0)
  await page.locator('.decision-modal').getByRole('button', { name: 'Skip', exact: true }).click()
  await expect(handCount).toHaveText('4')
})

test('only a market card placed into the ally hand creates a white hand bubble', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  const { quId, allyId } = await prepareQu(page, 'giver', false)
  const snapshot = await readSnapshot(page)
  snapshot.game.pendingDecision = {
    id: 'ally-hand-gain', playerId: quId, kind: 'select_market_pile',
    prompt: 'Choose a card to gain', candidates: [{ pileIndex: 0, cardId: 'moonstone_shard', cardName: 'Moonstone Shard', remaining: 5 }],
  }
  snapshot.game.pendingEffect = {
    sourcePlayerId: quId, effectPlayerId: allyId,
    awaiting: { kind: 'gain_card_from_market', destination: 'discard_top' },
    remainingEffects: [{ kind: 'move_gained_card', destination: 'hand' }],
  }
  await applySnapshot(page, snapshot)
  await page.locator('[data-supply-pile-index="0"]').click()
  const ally = page.locator(`[data-player-control-id="${allyId}"]`)
  await expect(ally.locator('.chand strong')).toHaveText('6')
  await expect(ally.locator('.status-change-bubble--hand')).toHaveText('+1')
  await expect(ally.locator('.status-change-bubble--hand')).toHaveAttribute('aria-label', 'Brama gained 1 card to hand')
  await expect(page.locator(`[data-player-control-id="${quId}"] .chand strong`)).toHaveText('5')
})

test('paying with hand Gems changes only Qu hand before the Giver deck placement', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  const { quId, allyId } = await prepareQu(page, 'giver', true)
  const snapshot = await readSnapshot(page)
  snapshot.game.players[0]!.hand = ['crystal', 'crystal', 'crystal', 'crystal', 'spark']
  snapshot.game.players[0]!.bonusAether = 0
  await applySnapshot(page, snapshot)
  await page.getByRole('button', { name: 'Play All Gems', exact: true }).click()
  const quCount = page.locator(`[data-player-control-id="${quId}"] .chand strong`)
  const allyCount = page.locator(`[data-player-control-id="${allyId}"] .chand strong`)
  await expect(quCount).toHaveText('1')
  await expect(allyCount).toHaveText('5')
  await page.locator('[data-supply-pile-index="0"]').click()
  await page.locator('.decision-modal').getByRole('button', { name: 'Yes', exact: true }).click()
  await expect(quCount).toHaveText('1')
  await expect(allyCount).toHaveText('5')
  await expect(page.locator('.status-change-bubble--hand')).toHaveCount(0)
})

test('restoring a pending Giver offer preserves both hands and completes its deck placement', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  const { allyId } = await prepareQu(page, 'giver', true)
  await page.locator('[data-supply-pile-index="0"]').click()
  await expect(page.locator('.decision-modal')).toContainText('Use Giver Form')
  await applySnapshot(page, await readSnapshot(page))
  await page.locator('.decision-modal').getByRole('button', { name: 'Yes', exact: true }).click()
  await expect(page.locator('.char-btn .chand strong')).toHaveText(['5', '5'])
  await expect(page.locator('.status-change-bubble--hand')).toHaveCount(0)
  const after = await readSnapshot(page)
  expect(after.game.players.find(player => player.id === allyId)!.deck).toEqual(['moonstone_shard'])
})
