import { test, expect } from '@playwright/test'

test('Market columns stay snug as card size follows the available board height', async ({ page }) => {
  await page.goto('/')
  await page.evaluate(() => localStorage.clear())
  await page.reload()
  await page.getByRole('button', { name: 'Start Game' }).click()
  const inspect = () => page.evaluate(() => {
    const market = document.querySelector<HTMLElement>('.market-col')!
    const grid = document.querySelector<HTMLElement>('.market-grid')!
    const cards = [...grid.querySelectorAll<HTMLElement>('.pile:not(.pile-empty)')]
    const nemesisBoard = document.querySelector<HTMLElement>('.nemesis-board')!
    const trinket = document.querySelector<HTMLElement>('.trinket-deck-pile')!
    const nemesisPileCard = document.querySelector<HTMLElement>('.nemesis-pile-card')!
    const nemesisPlayCard = document.querySelector<HTMLElement>('.nemesis-play-card')
    const rectangles = cards.slice(0, 3).map(card => {
      const { left, top, width, height } = card.getBoundingClientRect()
      return { left, top, width, height, aspectRatio: width / height }
    })
    const trinketRect = trinket.getBoundingClientRect()
    const trinketImage = trinket.querySelector<HTMLImageElement>('img')!
    const handCardRect = document.querySelector<HTMLElement>('.hand .card.card-image')!.getBoundingClientRect()
    const deckCardRect = document.querySelector<HTMLElement>('.player-deck-pile .player-pile-card')!.getBoundingClientRect()
    const nemesisPileRect = nemesisPileCard.getBoundingClientRect()
    const nemesisPlayRect = nemesisPlayCard?.getBoundingClientRect()
    return {
      marketWidth: market.getBoundingClientRect().width,
      rowCardsWidth: rectangles.reduce((total, card) => total + card.width, 0),
      firstSupplyCard: rectangles[0],
      thirdSupplyCard: rectangles[2],
      handCardRatio: handCardRect.width / handCardRect.height,
      playerDeckRatio: deckCardRect.width / deckCardRect.height,
      nemesisPileRatio: nemesisPileRect.width / nemesisPileRect.height,
      nemesisPlayRatio: nemesisPlayRect ? nemesisPlayRect.width / nemesisPlayRect.height : null,
      trinket: {
        left: trinketRect.left,
        top: trinketRect.top,
        width: trinketRect.width,
        height: trinketRect.height,
        aspectRatio: trinketRect.width / trinketRect.height,
        imageObjectFit: getComputedStyle(trinketImage).objectFit,
      },
      boardWidth: nemesisBoard.getBoundingClientRect().width,
      columnGap: getComputedStyle(grid).columnGap,
      tileGaps: rectangles.slice(0, -1).map((rect, index) => rectangles[index + 1]!.left - rect.left - rect.width),
    }
  })

  await page.setViewportSize({ width: 1440, height: 900 })
  const standard = await inspect()
  await page.setViewportSize({ width: 1920, height: 900 })
  const wide = await inspect()
  await page.setViewportSize({ width: 1920, height: 1080 })
  const tall = await inspect()
  expect(standard.marketWidth).toBeGreaterThan(0)
  expect(wide.marketWidth).toBe(standard.marketWidth)
  expect(tall.marketWidth).toBeGreaterThan(standard.marketWidth)
  for (const result of [standard, wide, tall]) {
    expect(Math.abs(result.marketWidth - result.rowCardsWidth - 32)).toBeLessThan(1)
    expect(Math.abs(result.trinket.width - result.thirdSupplyCard.width)).toBeLessThan(1)
    expect(Math.abs(result.trinket.aspectRatio - 63.5 / 88)).toBeLessThan(0.002)
    expect(Math.abs(result.firstSupplyCard.aspectRatio - 63.5 / 88)).toBeLessThan(0.002)
    expect(Math.abs(result.handCardRatio - 63.5 / 88)).toBeLessThan(0.002)
    expect(Math.abs(result.playerDeckRatio - 63.5 / 88)).toBeLessThan(0.002)
    expect(Math.abs(result.nemesisPileRatio - 63.5 / 88)).toBeLessThan(0.002)
    if (result.nemesisPlayRatio !== null) {
      expect(Math.abs(result.nemesisPlayRatio - 63.5 / 88)).toBeLessThan(0.002)
    }
    expect(result.trinket.imageObjectFit).toBe('cover')
    const supplyCenterX = result.thirdSupplyCard.left + result.thirdSupplyCard.width / 2
    const trinketCenterX = result.trinket.left + result.trinket.width / 2
    expect(Math.abs(trinketCenterX - supplyCenterX)).toBeLessThan(1)
  }
  await page.locator('.trinket-deck-pile').click()
  const viewerCard = page.locator('.pile-modal .pile-card-image').first()
  await expect(viewerCard).toBeVisible()
  const viewerRatio = await viewerCard.evaluate(element => {
    const rect = element.getBoundingClientRect()
    return rect.width / rect.height
  })
  expect(Math.abs(standard.trinket.aspectRatio - viewerRatio)).toBeLessThan(0.002)
  expect(Math.abs(viewerRatio - 63.5 / 88)).toBeLessThan(0.002)
  await page.locator('.pile-modal').getByRole('button', { name: 'Close' }).click()
  await page.locator('.player-deck-pile').click()
  const playerDeckViewerCard = page.locator('.pile-modal .pile-card-image').first()
  await expect(playerDeckViewerCard).toBeVisible()
  const playerDeckViewerRatio = await playerDeckViewerCard.evaluate(element => {
    const rect = element.getBoundingClientRect()
    return rect.width / rect.height
  })
  expect(Math.abs(playerDeckViewerRatio - 63.5 / 88)).toBeLessThan(0.002)
  await page.locator('.pile-modal').getByRole('button', { name: 'Close' }).click()
  await page.locator('.hand .card.card-image').first().hover()
  const preview = page.locator('body > .card-hover-preview')
  await expect(preview).toBeVisible()
  const hoverPreviewRatio = await preview.evaluate(element => {
    const rect = element.getBoundingClientRect()
    return rect.width / rect.height
  })
  expect(Math.abs(hoverPreviewRatio - 63.5 / 88)).toBeLessThan(0.002)
  expect(standard.columnGap).toBe('6px')
  expect(wide.columnGap).toBe(standard.columnGap)
  for (const gap of [...standard.tileGaps, ...wide.tileGaps, ...tall.tileGaps]) {
    expect(gap).toBeGreaterThanOrEqual(5)
    expect(gap).toBeLessThanOrEqual(7)
  }
  expect(tall.trinket.width).toBeGreaterThan(standard.trinket.width)
  expect(wide.boardWidth).toBeGreaterThan(standard.boardWidth)
})
