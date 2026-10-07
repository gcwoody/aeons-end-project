import { expect, test } from '@playwright/test'

test('captured card flights contain only card artwork, without market badges or highlights', async ({ page }) => {
  await page.goto('/')
  const result = await page.evaluate(async () => {
    const { captureCardFlight } = await import('/src/game/card-flight.ts')
    const source = document.createElement('button')
    source.className = 'pile can-buy develop-action-available'
    source.innerHTML = '<img src="/player-card%20back.jpg" alt="Card"><span class="remaining">4</span><span class="develop-cost-badge">D 3</span>'
    source.style.cssText = 'position:fixed;left:24px;top:24px;width:100px;height:140px'
    document.body.append(source)

    const flight = captureCardFlight(source)
    const result = flight && {
      className: flight.clone.className,
      childTags: [...flight.clone.children].map(child => child.tagName),
      imageAlt: flight.clone.querySelector('img')?.alt,
      text: flight.clone.textContent,
    }
    flight?.clone.remove()
    source.remove()
    return result
  })

  expect(result).toEqual({
    className: 'card-flight-clone',
    childTags: ['IMG'],
    imageAlt: '',
    text: '',
  })
})

test('board pile transfer pairs removed cards with player hand, deck, and discard additions', async ({ page }) => {
  await page.goto('/')
  const result = await page.evaluate(async () => {
    const { captureCardZoneTransfer, resolveCardZoneTransfers } = await import('/src/game/card-flight.ts')
    const source = document.createElement('div')
    source.style.cssText = 'position:fixed;left:24px;top:24px;width:100px;height:140px'
    source.innerHTML = '<img src="/player-card%20back.jpg" alt="">'
    document.body.append(source)

    const before = [
      { id: 'player-1', hand: ['contagion'], deck: [], discard: [] },
      { id: 'player-2', hand: [], deck: ['spark'], discard: [] },
    ]
    const snapshot = captureCardZoneTransfer(source, ['contagion', 'dire_wisdom'], before)
    const after = [
      { id: 'player-1', hand: ['contagion', 'contagion'], deck: [], discard: [] },
      { id: 'player-2', hand: [], deck: ['dire_wisdom', 'spark'], discard: [] },
    ]
    const transfers = resolveCardZoneTransfers(snapshot, [], after)
    const summary = transfers.map(transfer => ({
      cardId: transfer.cardId,
      playerId: transfer.playerId,
      zone: transfer.zone,
      zoneIndex: transfer.zoneIndex,
      previousDeckTop: transfer.previousDeckTop,
      previousDeckCount: transfer.previousDeckCount,
      hasFlight: !!transfer.flight,
    }))
    transfers.forEach(transfer => transfer.flight?.clone.remove())
    source.remove()
    return summary
  })

  expect(result).toEqual([
    {
      cardId: 'contagion', playerId: 'player-1', zone: 'hand', zoneIndex: 1,
      previousDeckTop: null, previousDeckCount: 0, hasFlight: true,
    },
    {
      cardId: 'dire_wisdom', playerId: 'player-2', zone: 'deck', zoneIndex: 0,
      previousDeckTop: 'spark', previousDeckCount: 1, hasFlight: true,
    },
  ])
})

test('a card arriving on a player deck keeps the existing deck surface visible', async ({ page }) => {
  await page.goto('/')
  const destinationVisibleDuringFlight = await page.evaluate(async () => {
    const { animateCardFlight, captureCardFlight, cardZoneFlightDestinationMode } = await import('/src/game/card-flight.ts')
    document.documentElement.style.setProperty('--card-flight-duration', '500ms')
    const source = document.createElement('div')
    const destination = document.createElement('div')
    source.style.cssText = 'position:fixed;left:24px;top:24px;width:100px;height:140px'
    destination.style.cssText = 'position:fixed;left:400px;top:200px;width:100px;height:140px'
    source.innerHTML = '<img src="/player-card%20back.jpg" alt="">'
    destination.innerHTML = '<img src="/player-card%20back.jpg" alt="">'
    document.body.append(source, destination)

    const flight = captureCardFlight(source)
    const animation = animateCardFlight(flight, destination, {
      destinationMode: cardZoneFlightDestinationMode('deck', false),
    })
    await new Promise(resolve => window.setTimeout(resolve, 60))
    const visibleDuringFlight = getComputedStyle(destination).visibility !== 'hidden'
    await animation
    source.remove()
    destination.remove()
    return visibleDuringFlight
  })

  expect(destinationVisibleDuringFlight).toBe(true)
})
