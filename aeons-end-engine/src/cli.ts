import * as readline from 'readline'
import * as fs from 'fs'
import * as path from 'path'
import { GameState } from './types'
import {
  createGame, startTurn, getPlayer,
  getCastableSpells, castSpell,
  playCard, prepSpell,
  getBuyableCards, buyCard,
  focusBreach, openBreachDirect,
  gainCharge, activateAbility,
  resolveDrawPhase, getTotalAether, drawFromDeck,
  getAllRemainingConditional, getConditionalAetherByType,
  nemesisDrawCard, nemesisResolveAttack,
  checkGameOver, checkPlayerDeath, canPlayerAct,
  toRoman,
} from './engine'
import { MAGES, getCard } from './data'

let g: GameState
let skipStartTurn = false

const SAVE_PATH = path.join(__dirname, '..', 'save.json')

function saveGame(): void {
  const save = {
    state: g,
    savedAt: new Date().toISOString(),
    round: g.round,
    turn: g.turnOrderDiscard.length,
  }
  fs.writeFileSync(SAVE_PATH, JSON.stringify(save, null, 2), 'utf-8')
  console.log(`  Game saved (Round ${save.round}, Turn ${save.turn})`)
}

function loadGame(): boolean {
  if (!fs.existsSync(SAVE_PATH)) {
    console.log('  No save file found.')
    return false
  }
  const raw = fs.readFileSync(SAVE_PATH, 'utf-8')
  const save = JSON.parse(raw)
  g = save.state as GameState
  console.log(`  Loaded save (Round ${save.round}, Turn ${save.turn})`)
  return true
}

const C = { r: '\x1b[0m', purple: '\x1b[35m', blue: '\x1b[34m', yellow: '\x1b[33m', red: '\x1b[31m' }
const P = (c: string, s: string) => `${c}${s}${C.r}`

function prompt(question: string): Promise<string> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
  return new Promise(resolve => {
    rl.question(question, answer => { rl.close(); resolve(answer.trim()) })
  })
}

function displaySeparator(title: string): void {
  console.log(`\n${'='.repeat(54)}`)
  console.log(`  ${title}`)
  console.log('='.repeat(54))
}

function displayAether(playerId: string): string {
  const p = getPlayer(g, playerId)
  const total = getTotalAether(p)

  // original split: regular vs each conditional type
  let origCond = 0
  for (const id of p.playedThisTurn) {
    const c = getCard(id)
    if (c.type === 'gem') {
      const gem = c as any
      if (gem.conditionalAether) origCond += gem.conditionalAether.amount
    }
  }
  const origReg = total - origCond
  const regularAvail = Math.max(0, origReg - p.regularAetherSpent)

  const conds = getAllRemainingConditional(p)
  let condAvail = 0
  for (const v of Object.values(conds)) condAvail += v

  const available = regularAvail + condAvail
  const detail: string[] = [`${regularAvail} reg`]
  for (const [t, v] of Object.entries(conds)) {
    if (getConditionalAetherByType(p, t) > 0) detail.push(`${v} ${t}`)
  }
  return `${P(C.yellow, 'Aether')}: ${available}/${total} (${detail.join(', ')})`
}

function displayHand(playerId: string): string {
  const p = getPlayer(g, playerId)
  if (p.hand.length === 0) return '(empty)'
  return p.hand.map((cid, i) => {
    const c = getCard(cid)
    return `[${i}] ${c.name} (${c.type})`
  }).join(', ')
}

const DIR_ARROW: Record<string, string> = { east: '\u2192', south: '\u2193', west: '\u2190', north: '\u2191' }

function bShow(breaches: any[]): string {
  return breaches.map((b: any) => {
    const spell = b.prepSpell ? `[${getCard(b.prepSpell).name}]` : '[_]'
    if (b.opened) return `${toRoman(b.index)} ${spell}`
    const d = DIR_ARROW[b.focusDirection]
    if (b.focusedThisTurn) return `${toRoman(b.index)} ${spell}:${d} focus:${b.focusCost} open:${b.openCost[b.focusDirection]}`
    return `${toRoman(b.index)}:${d} focus:${b.focusCost} open:${b.openCost[b.focusDirection]}`
  }).join(' | ')
}

function displayPlayer(pId: string): void {
  const p = getPlayer(g, pId)
  if (p.exhausted) {
    console.log(`  ${p.mageType} [EXHAUSTED]`)
    return
  }
  console.log(`  ${p.mageType} | ${P(C.red, `HP: ${p.hp}/${p.maxHp}`)} | ${P(C.blue, `Charge: ${p.charge}/${p.chargeThreshold}`)} | ${displayAether(pId)}`)
  console.log(`  ${P(C.purple, 'Breaches')}: ${bShow(p.breaches)}`)
  console.log(`  ${P(C.blue, 'Hand')}: ${displayHand(pId)}`)
}

function displayMarket(): void {
  console.log('  Market:')
  for (const b of getBuyableCards(g)) {
    console.log(`    [${b.pileIndex}] ${b.cardName} (${b.cardType}, ${b.cost}a) x${b.remaining}`)
  }
}

function displayNemesis(): void {
  const n = g.nemesis
  console.log(`  Nemesis: ${n.type} | HP: ${n.hp}/${n.maxHp} | Fury: ${n.furyTokens}`)
  console.log(`  Deck: ${n.deck.length} | Discard: ${n.discard.length} | PlayArea: ${n.playArea.length}`)
}

function displayFull(): void {
  displayPlayer('p1')
  displayPlayer('p2')
  displayNemesis()
  console.log(`  Gravehold: ${g.gravehold.hp}/${g.gravehold.maxHp}`)
  displayMarket()
}

function showState(sub: string): void {
  const s = sub.toLowerCase()
  if (s === 'm') { displayMarket(); return }
  if (s === 'n') { displayNemesis(); return }
  if (s === 'p1' || s === 'jian') { displayPlayer('p1'); return }
  if (s === 'p2' || s === 'brama') { displayPlayer('p2'); return }
  displayFull()
}

function showHelp(): void {
  console.log(`
  [p <idx>]       Play gem/relic
  [p <idx> <b>]   Prep spell to breach
  [pg]            Play all gems
  [b <pile>]      Buy from market
  [f <breach>]    Focus breach (auto-opens)
  [o <breach>]    Open breach directly
  [c <n>]         Gain charge (2a each)
  [a [p1/p2]]     Activate ability
  [d]             End main phase
  [s [p1/p2/n/m]] Show state
  [save]          Save game to file`)
}

async function playerCastingPhase(playerId: string): Promise<void> {
  while (true) {
    const spells = getCastableSpells(g, playerId)
    if (spells.length === 0) break

    const remainingMust = spells.filter(s => s.mustCast)

    console.log('  Castable:')
    for (const s of spells) {
      const tag = s.mustCast ? ` ${P(C.red, '[MUST]')}` : ''
      console.log(`    [${s.breachIndex}] Breach ${toRoman(s.breachIndex)}: ${s.cardName}${tag}`)
    }

    const promptText = remainingMust.length > 0
      ? `  Cast breach? > `
      : `  Cast breach? (number) or Enter to skip > `

    const input = await prompt(promptText)

    if (input === '') {
      if (remainingMust.length > 0) {
        console.log(`  !! Must cast ${remainingMust.length} remaining spell(s) first!`)
        continue
      }
      console.log('  skip')
      break
    }

    const idx = parseInt(input)
    const spell = spells.find(s => s.breachIndex === idx)
    if (!spell) { console.log('  Invalid'); continue }

    const msg = castSpell(g, playerId, spell.breachIndex)
    console.log(`  Cast -> ${msg}`)
    if (msg && msg.includes('Aether')) console.log(`  ${displayAether(playerId)}`)
    const death = checkPlayerDeath(g, playerId)
    if (death) console.log(`  !! ${death}`)
    if (g.gameOver) return
  }
}

async function playerMainPhase(playerId: string): Promise<void> {
  const p = getPlayer(g, playerId)
  let showStateNext = true

  while (true) {
    if (g.gameOver) return
    if (showStateNext) {
      console.log(`  ${P(C.purple, 'Breaches')}: ${bShow(p.breaches)}`)
      console.log(`  ${P(C.blue, 'Hand')}: ${displayHand(playerId)}`)
      console.log(`  ${displayAether(playerId)}`)
    }
    showStateNext = true

    const input = await prompt('  > ')
    const parts = input.split(/\s+/)
    const cmd = parts[0]?.toLowerCase()
    let msg: string | null = null

    try {
      if (cmd === 'd' || cmd === '') break
      else if (cmd === '?') { showHelp(); showStateNext = false; continue }
      else if (cmd === 's') { showState(parts[1] ?? ''); showStateNext = false; continue }
      else if (cmd === 'save') { saveGame(); showStateNext = false; continue }
      else if (cmd === 'pg') {
        const gems = p.hand.filter(cid => getCard(cid).type === 'gem')
        if (gems.length === 0) msg = 'No gems in hand'
        else { for (const gid of gems) { const m = playCard(g, playerId, gid); if (m) console.log(`  -> ${m}`) } }
        console.log(`  ${displayAether(playerId)}`)
      }
      else if (cmd === 'p') {
        const cardIdx = parseInt(parts[1]!)
        if (isNaN(cardIdx) || cardIdx < 0 || cardIdx >= p.hand.length) {
          msg = 'Invalid card index'
        } else {
          const cardId = p.hand[cardIdx]!
          const breachIdx = parts[2] !== undefined ? parseInt(parts[2]!) : undefined
          if (breachIdx !== undefined) {
            msg = prepSpell(g, playerId, cardId, breachIdx)
          } else if (getCard(cardId).type === 'spell') {
            msg = 'Spell needs breach. Use: p <idx> <breachIdx>'
          } else {
            msg = playCard(g, playerId, cardId)
            if (msg) console.log(`  -> ${msg}`)
            const card = getCard(cardId)
            if (card.type === 'relic') {
              const relic = card as any
              const res = drawFromDeck(p.deck, p.discard, relic.drawCount)
              p.deck = res.newDeck
              p.discard = res.newDiscard
              for (const c of res.drawn) p.hand.push(c)
              console.log(`  -> Relic: drew ${res.drawn.length} (discard ${relic.discardCount} not implemented in CLI)`)
            }
            console.log(`  ${displayAether(playerId)}`)
          }
        }
      }
      else if (cmd === 'b') {
        const pileIdx = parseInt(parts[1]!)
        if (isNaN(pileIdx)) msg = 'Usage: b <pileIdx>'
        else msg = buyCard(g, playerId, pileIdx)
      }
      else if (cmd === 'f') {
        const breachIdx = parseInt(parts[1]!)
        if (isNaN(breachIdx)) msg = 'Usage: f <breachIdx>'
        else msg = focusBreach(g, playerId, breachIdx)
      }
      else if (cmd === 'o') {
        const breachIdx = parseInt(parts[1]!)
        if (isNaN(breachIdx)) msg = 'Usage: o <breachIdx>'
        else msg = openBreachDirect(g, playerId, breachIdx)
      }
      else if (cmd === 'c') {
        const amount = parseInt(parts[1]!) || 1
        msg = gainCharge(g, playerId, amount)
      }
      else if (cmd === 'a') {
        const target = parts[1] || undefined
        msg = activateAbility(g, playerId, target === 'p1' ? 'p1' : target === 'p2' ? 'p2' : undefined)
      }
      else { msg = 'Type ? for help' }
    } catch (e: any) { msg = `Error: ${e.message}` }

    if (msg) {
      console.log(`  -> ${msg}`)
      if (['b', 'f', 'o', 'c', 'a'].includes(cmd!)) console.log(`  ${displayAether(playerId)}`)
    }
    checkPlayerDeath(g, playerId)
    if (g.gameOver) return
    if (!canPlayerAct(g, playerId)) { console.log('  (no actions left, end phase)'); break }
  }
}

async function playerDrawPhase(playerId: string): Promise<void> {
  for (const m of resolveDrawPhase(g, playerId)) console.log(`  ${m}`)
}

async function nemesisTurn(): Promise<void> {
  const card = nemesisDrawCard(g)
  if (!card) { console.log('  Nemesis deck empty'); return }

  console.log(`  Drew: ${card.cardName} (Tier ${card.tier}, ${card.damage} dmg)`)

  let resolved: 'p1' | 'p2' | 'gravehold'
  while (true) {
    const t = await prompt('  Target [p1 / p2 / g] > ')
    if (t === 'g') { resolved = 'gravehold'; break }
    if (t === 'p2') { resolved = 'p2'; break }
    if (t === 'p1') { resolved = 'p1'; break }
    console.log('  Invalid')
  }

  const msg = nemesisResolveAttack(g, resolved, card.damage)
  console.log(`  -> ${msg}`)
  if (resolved !== 'gravehold') {
    const death = checkPlayerDeath(g, resolved)
    if (death) console.log(`  !! ${death}`)
  }
}

async function runGameLoop(): Promise<void> {
  while (!g.gameOver) {
    if (!skipStartTurn) {
      startTurn(g)
    }
    skipStartTurn = false
    if (g.gameOver) break

    const turn = g.currentTurn
    const turnNum = g.turnOrderDiscard.length

    if (turn === 'nemesis') {
      displaySeparator(`Turn ${turnNum} (Round ${g.round}) -- RAGEBORNE`)
      await nemesisTurn()
      if (g.gravehold.hp <= 0) { g.gravehold.hp = 0; g.gameOver = true; g.winner = 'nemesis'; console.log('\n  !! GRAVEHOLD DESTROYED!') }
      const over = checkGameOver(g)
      if (over) console.log(`\n=== ${over} ===`)
    } else {
      const p = getPlayer(g, turn)
      console.log(`\n--- Turn ${turnNum} (Round ${g.round}) | Nemesis ${g.nemesis.hp}/${g.nemesis.maxHp} | Grave ${g.gravehold.hp}/${g.gravehold.maxHp}`)
      displayPlayer(turn)

      const spells = getCastableSpells(g, turn)
      if (spells.length > 0) {
        displaySeparator(`${p.mageType.toUpperCase()} -- Casting Phase`)
        await playerCastingPhase(turn)
        if (g.gameOver) { console.log(`\n=== ${checkGameOver(g)} ===`); break }
      }

      if (!canPlayerAct(g, turn)) {
        console.log('  Main Phase skipped (no actions).')
      } else {
        displaySeparator(`${p.mageType.toUpperCase()} -- Main Phase`)
        await playerMainPhase(turn)
        if (g.gameOver) { console.log(`\n=== ${checkGameOver(g)} ===`); break }
      }

      await playerDrawPhase(turn)
    }

    if (g.turnOrderDeck.length === 0) console.log('  --- end of round ---')
  }

  console.log('\n=== GAME OVER ===')
  console.log(`Winner: ${g.winner} | Nemesis HP: ${g.nemesis.hp}/${g.nemesis.maxHp} | Gravehold: ${g.gravehold.hp}/${g.gravehold.maxHp}`)
  for (const p of g.players) console.log(`${p.mageType}: HP ${p.hp}/${p.maxHp} ${p.exhausted ? '[EXHAUSTED]' : ''}`)
}

async function resumeGame(): Promise<void> {
  skipStartTurn = true
  showHelp()
  await runGameLoop()
  process.exit(0)
}

export async function main(): Promise<void> {
  console.log("Aeon's End -- Phase 0 CLI Demo")
  console.log('2 Players vs Rageborne')

  if (fs.existsSync(SAVE_PATH)) {
    const raw = fs.readFileSync(SAVE_PATH, 'utf-8')
    const save = JSON.parse(raw)
    const ch = await prompt(`\nFound saved game (Round ${save.round}, Turn ${save.turn}). Load it? [y/N] `)
    if (ch.toLowerCase() === 'y') {
      g = save.state as GameState
      console.log('  Save loaded. Resuming...')
      return resumeGame()
    }
  }

  const m1 = await prompt('\nPlayer 1 mage (jian/brama): ')
  const mage1 = Object.keys(MAGES).includes(m1.toLowerCase()) ? m1.toLowerCase() : 'jian'
  console.log(`Player 1: ${mage1.toUpperCase()}`)

  const m2 = await prompt('Player 2 mage (jian/brama): ')
  const mage2 = Object.keys(MAGES).includes(m2.toLowerCase()) ? m2.toLowerCase() : 'brama'
  console.log(`Player 2: ${mage2.toUpperCase()}`)

  g = createGame(mage1, mage2)
  console.log('\n=== GAME START ===')
  console.log(`Nemesis: Rageborne (${g.nemesis.hp} HP) | Gravehold: ${g.gravehold.hp} HP`)
  showHelp()

  await runGameLoop()
  process.exit(0)
}
