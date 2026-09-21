/**
 * Collect the Wave 9 Beyond the Breach rules archive and its card images.
 *
 * Card images are stored under `cards/wave9`; shared icons are stored under
 * `common images` and are never duplicated into individual card folders.
 */

import { mkdir, writeFile, stat, readFile, rename } from 'node:fs/promises'
import { resolve, dirname, extname, basename } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createHash } from 'node:crypto'

const scriptDirectory = dirname(fileURLToPath(import.meta.url))
const repositoryRoot = resolve(scriptDirectory, '..')
const apiUrl = 'https://aeonsend.wiki.gg/api.php'
const sourceRoot = 'https://aeonsend.wiki.gg/wiki/'
const pageName = 'Beyond the Breach'
const userAgent = 'AeonsEndImageDatabase/1.0 (local project)'
const imageExtensions = new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp'])
const documentRoot = resolve(repositoryRoot, 'documents', 'wave9')
const imageRoot = resolve(scriptDirectory, 'cards', 'wave9')
const commonImageRoot = resolve(scriptDirectory, 'common images')
const commonImageNames = new Set(['Aether.png', 'Knowledge.png', 'Recall.jpg'])
// These redundant Mage-breach images were deliberately removed during manual review.
const manuallyExcludedImageNames = new Set([
  'Breach Down Icon.jpg',
  'Breach I Open.jpg',
  'Breach II Down.jpg',
  'Breach II Left.jpg',
  'Breach II Right.jpg',
  'Breach III Down.jpg',
  'Breach III Right.jpg',
  'Breach IV Down.jpg',
  'Breach IV Right.jpg',
  'Breach Left Icon.jpg',
  'Breach Opened Icon.jpg',
  'Breach Right Icon.jpg',
  'No Breach.jpg',
  'Prototype Breach Icon.jpg',
  'Rift Breach III Icon.jpg',
  'Rift Breach IV Icon.jpg',
  'Transfer Breach Icon.jpg',
])
const cacheRoot = resolve(scriptDirectory, '.cache', 'beyond-the-breach-wave9')
const fetchedAt = new Date().toISOString()
const sleep = (milliseconds) => new Promise((resolveSleep) => setTimeout(resolveSleep, milliseconds))
const minimumApiRequestGapMs = 1_500
let lastApiRequestAt = 0

const skipSections = new Set([
  'Flavor Text',
  'Story',
  'Trivia',
  'Tips & Strategy',
  'Alternate Versions',
  'Featured In',
  'First Edition Version',
])

const mageTitles = [
  'Indira (Beyond the Breach)',
  'Nook (Beyond the Breach)',
  'Stake',
  'Wolf',
  'Dezmodia (Beyond the Breach)',
  'Remnant (Beyond the Breach)',
]

const friendTitles = ['Dai, the Youth', 'Lash, the Dreamer', 'Qu, the Rift Walker']
const foeTitles = ['Creeping Dark', 'The Anomaly', 'The Hunger']
const nemesisTitles = [
  'The Terror in Brass',
  'Twice-Dead Prophet',
  'Oracle of Filth',
  'Wayward Reflection',
  'Crooked Mask (Beyond the Breach)',
]

const pageCache = new Map()

async function requestJson(parameters, description) {
  const url = `${apiUrl}?${new URLSearchParams(parameters)}`
  let lastError
  for (let attempt = 1; attempt <= 5; attempt += 1) {
    try {
      const waitMs = Math.max(0, minimumApiRequestGapMs - (Date.now() - lastApiRequestAt))
      if (waitMs) await sleep(waitMs)
      lastApiRequestAt = Date.now()
      const response = await fetch(url, {
        headers: { 'User-Agent': userAgent, Accept: 'application/json' },
        signal: AbortSignal.timeout(45_000),
      })
      if (!response.ok) {
        const error = new Error(`HTTP ${response.status} ${response.statusText}`)
        const retryAfterSeconds = Number(response.headers.get('retry-after'))
        if (response.status === 429) error.retryAfterMs = Number.isFinite(retryAfterSeconds)
          ? retryAfterSeconds * 1_000
          : 30_000
        throw error
      }
      return await response.json()
    } catch (error) {
      lastError = error
      console.warn(`${description}: attempt ${attempt}/5 failed (${error.message})`)
      if (attempt < 5) await sleep(error.retryAfterMs ?? attempt * 1_000)
    }
  }
  throw new Error(`${description}: failed after 5 attempts: ${lastError.message}`)
}

function cachePath(title, properties) {
  const digest = createHash('sha256').update(`${title}\u0000${properties}`).digest('hex')
  return resolve(cacheRoot, `${digest}.json`)
}

async function parseWikiPage(title, properties) {
  const path = cachePath(title, properties)
  try {
    return JSON.parse(await readFile(path, 'utf8'))
  } catch {
    const data = await requestJson({
      action: 'parse',
      page: title,
      redirects: '1',
      prop: properties,
      format: 'json',
    }, `Fetch ${title}`)
    await mkdir(cacheRoot, { recursive: true })
    await writeFile(path, `${JSON.stringify(data)}\n`, 'utf8')
    return data
  }
}

function wikiUrl(title) {
  return `${sourceRoot}${encodeURIComponent(title.replaceAll(' ', '_')).replaceAll('%28', '(').replaceAll('%29', ')').replaceAll('%27', "'")}`
}

function readTemplate(wikitext, offset) {
  const start = wikitext.indexOf('{{', offset)
  if (start < 0) return null
  let depth = 0
  for (let index = start; index < wikitext.length - 1; index += 1) {
    const pair = wikitext.slice(index, index + 2)
    if (pair === '{{') {
      depth += 1
      index += 1
    } else if (pair === '}}') {
      depth -= 1
      index += 1
      if (depth === 0) return { start, end: index + 1, text: wikitext.slice(start, index + 1) }
    }
  }
  return null
}

function splitTemplateParts(content) {
  const parts = []
  let current = ''
  let templateDepth = 0
  let linkDepth = 0
  for (let index = 0; index < content.length; index += 1) {
    const pair = content.slice(index, index + 2)
    if (pair === '{{') {
      templateDepth += 1
      current += pair
      index += 1
    } else if (pair === '}}') {
      templateDepth -= 1
      current += pair
      index += 1
    } else if (pair === '[[') {
      linkDepth += 1
      current += pair
      index += 1
    } else if (pair === ']]') {
      linkDepth -= 1
      current += pair
      index += 1
    } else if (content[index] === '|' && templateDepth === 0 && linkDepth === 0) {
      parts.push(current.trim())
      current = ''
    } else {
      current += content[index]
    }
  }
  parts.push(current.trim())
  return parts
}

function firstTemplateFields(wikitext) {
  const primaryTemplates = new Set(['playercard', 'mage', 'nemesis', 'nemesiscard', 'friend', 'foe', 'banner'])
  let cursor = 0
  let fallback = null
  while (true) {
    const template = readTemplate(wikitext, cursor)
    if (!template) break
    cursor = template.end
    const parts = splitTemplateParts(template.text.slice(2, -2))
    if (!fallback) fallback = parts
    if (primaryTemplates.has(parts[0]?.trim().toLowerCase())) return templateFields(parts)
  }
  return fallback ? templateFields(fallback) : { name: 'Unknown', fields: {} }
}

function templateFields(parts) {
  const fields = {}
  for (const part of parts.slice(1)) {
    const separator = part.indexOf('=')
    if (separator < 0) continue
    fields[part.slice(0, separator).trim()] = part.slice(separator + 1).trim()
  }
  return { name: parts[0] || 'Unknown', fields }
}

function extractTemplateTitles(wikitext, templateName) {
  const result = []
  let cursor = 0
  while (true) {
    const template = readTemplate(wikitext, cursor)
    if (!template) break
    cursor = template.end
    const parts = splitTemplateParts(template.text.slice(2, -2))
    if (parts[0]?.trim().toLowerCase() !== templateName.toLowerCase()) continue
    const values = parts.slice(1)
    const link = values.find((value) => /^link\s*=/i.test(value.trim()))
    const title = (link ? link.replace(/^\s*link\s*=\s*/i, '') : values[0] || '').trim()
    if (title && !result.includes(title)) result.push(title)
  }
  return result
}

function extractSection(wikitext, heading) {
  const escapedHeading = heading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const header = new RegExp(`^={2,}\\s*${escapedHeading}\\s*={2,}\\s*$`, 'mi')
  const match = header.exec(wikitext)
  if (!match) throw new Error(`Could not find section ${heading} on ${pageName}`)
  const after = match.index + match[0].length
  const next = /^==+[^=].*?==+\s*$/gm
  next.lastIndex = after
  const following = next.exec(wikitext)
  return wikitext.slice(after, following ? following.index : wikitext.length)
}

function extractTopLevelSection(wikitext, heading) {
  const escapedHeading = heading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const header = new RegExp(`^==(?![=])\\s*${escapedHeading}\\s*==(?!=)\\s*$`, 'mi')
  const match = header.exec(wikitext)
  if (!match) throw new Error(`Could not find top-level section ${heading} on ${pageName}`)
  const after = match.index + match[0].length
  const next = /^==(?![=]).*?==(?!=)\s*$/gm
  next.lastIndex = after
  const following = next.exec(wikitext)
  return wikitext.slice(after, following ? following.index : wikitext.length)
}

function cleanedText(value) {
  let text = value
  text = text.replace(/<!--[\s\S]*?-->/g, '')
  text = text.replace(/<ref\b[^>]*\/>/gi, '')
  text = text.replace(/<ref\b[^>]*>[\s\S]*?<\/ref>/gi, '')
  text = text.replace(/<hr\s*\/?>/gi, '\n\n')
  text = text.replace(/<br\s*\/?>/gi, '\n')
  text = text.replace(/<[^>]+>/g, '')
  let previous
  do {
    previous = text
    text = text.replace(/\{\{([^{}]*)\}\}/g, (_match, body) => {
      const parts = body.split('|').map((part) => part.trim())
      const name = parts[0].toLowerCase()
      if (name === 'cost') return 'Aether'
      if (name === 'recall') return 'Recall'
      if (name === 'aethertoken') return 'aether token'
      if (name === 'knowledge') return 'knowledge token'
      if (name === 'pagename') return 'this card'
      if (name === 'card' || name === 'cardimage') {
        return parts.slice(1).find((part) => !/^link\s*=/i.test(part)) || ''
      }
      if (name === 'quote') return parts.find((part) => part.startsWith('quote='))?.slice(6).trim() || ''
      return parts.find((part) => part.includes('='))?.split('=', 2)[1]?.trim() || ''
    })
  } while (text !== previous)
  text = text.replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, '$2')
  text = text.replace(/\[\[([^\]]+)\]\]/g, '$1')
  text = text.replace(/'{2,}/g, '')
  text = text.replace(/\[https?:[^\s\]]+\s+([^\]]+)\]/g, '$1')
  text = text.replace(/\n[ \t]+/g, '\n')
  text = text.replace(/[ \t]{2,}/g, ' ')
  text = text.replace(/\n{3,}/g, '\n\n')
  return text.trim()
}

function relevantSections(wikitext) {
  const activeWikitext = wikitext.replace(/<!--[\s\S]*?-->/g, '')
  const headers = [...activeWikitext.matchAll(/^==(?![=])\s*(.+?)\s*==(?!=)\s*$/gm)]
  return headers.flatMap((match, index) => {
    const heading = match[1].trim()
    if (skipSections.has(heading)) return []
    const end = headers[index + 1]?.index ?? activeWikitext.length
    const text = cleanedText(activeWikitext.slice(match.index + match[0].length, end))
    return text ? [{ heading, text }] : []
  })
}

function safeFilename(name) {
  return basename(name).replace(/[<>:"/\\|?*\x00-\x1f]/g, '_')
}

function safeFolderName(name) {
  return name.replace(/\s*\(Beyond the Breach\)\s*$/i, '').replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').trim()
}

function usefulImageNames(images) {
  return [...new Set(images.map((name) => name.trim().replaceAll('_', ' ')).filter((name) => imageExtensions.has(extname(name).toLowerCase())))]
}

async function parsePage(requestedTitle) {
  if (pageCache.has(requestedTitle)) return pageCache.get(requestedTitle)
  const data = await parseWikiPage(requestedTitle, 'wikitext|images')
  const parsed = data.parse
  if (!parsed) throw new Error(`Wiki did not return a parse result for ${requestedTitle}`)
  const wikitext = parsed.wikitext?.['*'] || ''
  const template = firstTemplateFields(wikitext)
  const record = {
    requestedTitle,
    title: parsed.title,
    url: wikiUrl(parsed.title),
    template,
    sections: relevantSections(wikitext),
    imageNames: usefulImageNames(parsed.images || []),
    nestedTitles: extractTemplateTitles(wikitext, 'CardImage'),
  }
  pageCache.set(requestedTitle, record)
  return record
}

async function extractMainPageLists() {
  const data = await parseWikiPage(pageName, 'wikitext')
  const wikitext = data.parse?.wikitext?.['*']
  if (!wikitext) throw new Error(`Could not load ${pageName} wikitext`)
  const titlesFrom = (heading) => extractTemplateTitles(extractSection(wikitext, heading), 'CardImage')
  return {
    gems: titlesFrom('Gems (5)'),
    spells: titlesFrom('Spells (11)'),
    relics: titlesFrom('Relics (5)'),
    banners: titlesFrom('Banner Gallery'),
    trinkets: titlesFrom('Trinket Gallery'),
    basicTier1: titlesFrom('Tier 1'),
    basicTier2: titlesFrom('Tier 2'),
    basicTier3: titlesFrom('Tier 3'),
    errata: cleanedText(extractTopLevelSection(wikitext, 'Errata')),
  }
}

async function withNestedCards(record, group) {
  const childTitles = record.nestedTitles.filter((title) => title !== record.title && title !== record.requestedTitle)
  const children = []
  for (const title of childTitles) children.push(await parsePage(title))
  const imageFolder = group === 'Nemesis' ? safeFolderName(record.title) : undefined
  return {
    ...record,
    group,
    imageFolder,
    children: children.map((child) => ({ ...child, imageFolder })),
  }
}

async function collectParentGroup(titles, group) {
  const result = []
  for (const title of titles) result.push(await withNestedCards(await parsePage(title), group))
  return result
}

async function imageUrls(imageNames) {
  const urls = new Map()
  for (let start = 0; start < imageNames.length; start += 50) {
    const batch = imageNames.slice(start, start + 50)
    const data = await requestJson({
      action: 'query',
      titles: batch.map((name) => `File:${name}`).join('|'),
      prop: 'imageinfo',
      iiprop: 'url',
      format: 'json',
    }, `Resolve ${batch.length} image URL(s)`)
    for (const page of Object.values(data.query?.pages || {})) {
      const name = page.title?.replace(/^File:/, '')
      const url = page.imageinfo?.[0]?.url
      if (name && url) urls.set(name, url)
    }
  }
  return urls
}

async function existsWithContent(path) {
  try {
    return (await stat(path)).size > 0
  } catch {
    return false
  }
}

async function downloadImage(url, destination, legacyDestination = null) {
  if (await existsWithContent(destination)) return 'skipped'
  if (legacyDestination && legacyDestination !== destination && await existsWithContent(legacyDestination)) {
    await mkdir(dirname(destination), { recursive: true })
    await rename(legacyDestination, destination)
    return 'moved'
  }
  let lastError
  for (let attempt = 1; attempt <= 5; attempt += 1) {
    try {
      const response = await fetch(url, { headers: { 'User-Agent': userAgent }, signal: AbortSignal.timeout(90_000) })
      if (!response.ok) throw new Error(`HTTP ${response.status} ${response.statusText}`)
      const contentType = response.headers.get('content-type') || ''
      if (!contentType.startsWith('image/')) throw new Error(`Expected image content, received ${contentType || 'unknown content type'}`)
      await writeFile(destination, new Uint8Array(await response.arrayBuffer()))
      return 'downloaded'
    } catch (error) {
      lastError = error
      console.warn(`Download ${basename(destination)}: attempt ${attempt}/5 failed (${error.message})`)
      if (attempt < 5) await sleep(attempt * 1_000)
    }
  }
  throw new Error(`Download ${basename(destination)}: failed after 5 attempts: ${lastError.message}`)
}

function flattenRecords(records) {
  return records.flatMap((record) => [record, ...flattenRecords(record.children || [])])
}

function imageDirectoryFor(imageSubdirectory, record) {
  if (imageSubdirectory === 'nemesis' && record.imageFolder) {
    return resolve(imageRoot, imageSubdirectory, record.imageFolder)
  }
  const tierDirectory = imageSubdirectory === 'nemesis/basic nemesis cards' ? record.group : ''
  return resolve(imageRoot, imageSubdirectory, tierDirectory)
}

function imagePathFor(imageDirectory, imageName) {
  const filename = safeFilename(imageName)
  return commonImageNames.has(imageName)
    ? resolve(commonImageRoot, filename)
    : resolve(imageDirectory, filename)
}

function recordMarkdown(record, depth = 2) {
  const lines = [`${'#'.repeat(depth)} ${record.title}`, '']
  if (record.group) lines.push(`- Group: ${record.group}`)
  if (record.requestedTitle !== record.title) lines.push(`- Requested Wiki title: ${record.requestedTitle}`)
  lines.push(`- Wiki: [${record.title}](${record.url})`)
  lines.push(`- Source template: \`${record.template.name}\``, '')
  const fields = Object.entries(record.template.fields)
    .map(([key, value]) => [key, cleanedText(value)])
    .filter(([, value]) => value)
  if (fields.length) {
    lines.push('**Template fields**', '')
    for (const [key, value] of fields) lines.push(`- ${key}: ${value}`)
    lines.push('')
  }
  for (const section of record.sections) {
    lines.push(`**${section.heading}**`, '', section.text, '')
  }
  if (record.images?.length) {
    lines.push('**Images**', '')
    for (const image of record.images) {
      lines.push(`- Local: \`${image.localPath}\``)
      lines.push(`  - Source: [${image.name}](${image.url})`)
    }
    lines.push('')
  } else if (record.imageNames.length) {
    lines.push('**Images**', '', '- Missing source URL; see collection warning in the terminal output.', '')
  }
  for (const child of record.children || []) lines.push(recordMarkdown(child, depth + 1))
  return lines.join('\n').trimEnd()
}

async function writeDocument(relativePath, title, scope, records) {
  const destination = resolve(documentRoot, relativePath)
  await mkdir(dirname(destination), { recursive: true })
  const lines = [
    `# ${title}`,
    '',
    '> This file was collected from the Aeon\'s End Wiki for the project\'s Wave 9 implementation plan.',
    '> It is a rules reference, not runtime data. Verify disputed text against physical cards and official rulebooks before implementation.',
    '',
    '## Source and scope',
    '',
    `- Box page: [Beyond the Breach](${wikiUrl(pageName)})`,
    `- Collected at (UTC): ${fetchedAt}`,
    `- Scope: ${scope}`,
    '',
    ...records.flatMap((record) => [recordMarkdown(record), '']),
  ]
  await writeFile(destination, `${lines.join('\n').trimEnd()}\n`, 'utf8')
  return destination
}

async function writeErrataDocument(errataText) {
  const destination = resolve(documentRoot, 'errata.md')
  const text = errataText.replace(/^===\s*(.+?)\s*===$/gm, '## $1')
  const lines = [
    '# Beyond the Breach — Errata',
    '',
    '> This file records the Beyond the Breach box-page errata that applies to the Wave 9 collection and implementation scope.',
    '> Confirm each item against the linked ruling and physical card before implementing it.',
    '',
    `- Source: [Beyond the Breach](${wikiUrl(pageName)})`,
    `- Rulings: [Beyond the Breach rulings](${wikiUrl('Rulings')}#Beyond_the_Breach)`,
    `- Collected at (UTC): ${fetchedAt}`,
    '',
    '## Box-page errata',
    '',
    text,
    '',
  ]
  await writeFile(destination, lines.join('\n'), 'utf8')
}

async function main() {
  console.log(`Collecting ${pageName} into ${documentRoot}`)
  const lists = await extractMainPageLists()
  const mages = await collectParentGroup(mageTitles, 'Breach Mage')
  const friends = await collectParentGroup(friendTitles, 'Friend')
  const foes = await collectParentGroup(foeTitles, 'Foe')
  const nemeses = await collectParentGroup(nemesisTitles, 'Nemesis')
  const gems = await collectParentGroup(lists.gems, 'Gem')
  const relics = await collectParentGroup(lists.relics, 'Relic')
  const spells = await collectParentGroup(lists.spells, 'Spell')
  const trinkets = await collectParentGroup(lists.trinkets, 'Trinket')
  const banners = await collectParentGroup(lists.banners, 'Banner')
  const basicCards = [
    ...await collectParentGroup(lists.basicTier1, 'Tier 1'),
    ...await collectParentGroup(lists.basicTier2, 'Tier 2'),
    ...await collectParentGroup(lists.basicTier3, 'Tier 3'),
  ]
  const documents = [
    ['mages/mages.md', 'mages', 'Beyond the Breach — Breach Mages', 'Six Breach Mages and their unique cards.', mages],
    ['gems/gems.md', 'gems', 'Beyond the Breach — Gems', 'Five supply Gem sets.', gems],
    ['relics/relics.md', 'relics', 'Beyond the Breach — Relics', 'Five supply Relic sets.', relics],
    ['spells/spells.md', 'spells', 'Beyond the Breach — Spells', 'Eleven supply Spell sets.', spells],
    ['trinkets/trinkets.md', 'trinkets', 'Beyond the Breach — Trinkets', 'The five-card Trinket deck.', trinkets],
    ['friends-and-foes/friends.md', 'friends-and-foes/friends', 'Beyond the Breach — Friends', 'Three Friend mats and their cards.', friends],
    ['friends-and-foes/foes.md', 'friends-and-foes/foes', 'Beyond the Breach — Foes', 'Three Foe mats and their cards.', foes],
    ['friends-and-foes/banners.md', 'friends-and-foes/banners', 'Beyond the Breach — Banners', 'All Beyond the Breach Banner cards.', banners],
    ['nemeses/nemeses.md', 'nemesis', 'Beyond the Breach — Nemeses', 'Five Nemesis mats and their associated cards.', nemeses],
    ['basic-nemesis-cards/basic-nemesis-cards.md', 'nemesis/basic nemesis cards', 'Beyond the Breach — Basic Nemesis Cards', 'Tier 1, Tier 2, and Tier 3 Basic Nemesis Cards.', basicCards],
  ]
  const categoryRecords = documents.map(([, , , , records]) => records)
  const uniqueImages = new Map()
  for (const [, imageSubdirectory, , , records] of documents) {
    for (const record of flattenRecords(records)) {
      const imageDirectory = imageDirectoryFor(imageSubdirectory, record)
      for (const imageName of record.imageNames) {
        const destination = imagePathFor(imageDirectory, imageName)
        const key = destination
        uniqueImages.set(key, {
          destination,
          imageName,
          legacyDestination: imageSubdirectory === 'nemesis'
            ? resolve(imageRoot, 'nemesis', safeFilename(imageName))
            : null,
        })
      }
    }
  }
  const urls = await imageUrls([...new Set([...uniqueImages.values()].map(({ imageName }) => imageName))])
  let downloaded = 0
  let skipped = 0
  let moved = 0
  const missingImages = []
  for (const { destination, imageName, legacyDestination } of uniqueImages.values()) {
    if (manuallyExcludedImageNames.has(imageName)) continue
    const url = urls.get(imageName)
    if (!url) {
      missingImages.push(imageName)
      continue
    }
    await mkdir(dirname(destination), { recursive: true })
    const result = await downloadImage(url, destination, legacyDestination)
    if (result === 'downloaded') downloaded += 1
    else if (result === 'moved') moved += 1
    else skipped += 1
  }
  for (const [relativePath, imageSubdirectory, title, scope, records] of documents) {
    for (const record of flattenRecords(records)) {
      const imageDirectory = imageDirectoryFor(imageSubdirectory, record)
      record.images = record.imageNames.flatMap((name) => {
        const url = urls.get(name)
        return url && !manuallyExcludedImageNames.has(name)
          ? [{ name, url, localPath: imagePathFor(imageDirectory, name).replaceAll(/\\/g, '/') }]
          : []
      })
    }
    await writeDocument(relativePath, title, scope, records)
  }
  await writeErrataDocument(lists.errata)
  const summary = [
    '# Beyond the Breach — Collection Summary',
    '',
    `- Collected at (UTC): ${fetchedAt}`,
    `- Source: [Beyond the Breach](${wikiUrl(pageName)})`,
    `- Documents: ${documents.length + 1}`,
    `- Parent records: ${categoryRecords.flat().length}`,
    `- Downloaded images: ${downloaded}`,
    `- Reorganized images: ${moved}`,
    `- Existing images kept: ${skipped}`,
    `- Manually excluded image names: ${manuallyExcludedImageNames.size}`,
    `- Unresolved image names: ${missingImages.length}`,
    '',
    '## Scope',
    '',
    '- Included: six Mages, 21 Supply card sets, Trinkets, Friends, Foes, Banners, five Nemeses, and Basic Nemesis Cards.',
    '- Excluded: Treasures, Upgraded Basic Nemesis Cards, Expedition/Battle 5 material, and mini expansions.',
    '',
  ]
  if (missingImages.length) {
    summary.push('## Unresolved image names', '', ...missingImages.map((name) => `- ${name}`), '')
  }
  await writeFile(resolve(documentRoot, 'collection-summary.md'), summary.join('\n'), 'utf8')
  console.log(`Completed: ${documents.length + 1} Markdown files, ${downloaded} image(s) downloaded, ${skipped} kept, ${missingImages.length} unresolved.`)
}

main().catch((error) => {
  console.error(error.stack || error)
  process.exitCode = 1
})
