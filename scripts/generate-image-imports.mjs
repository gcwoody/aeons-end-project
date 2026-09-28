import { readdir, readFile, writeFile } from 'node:fs/promises'
import { basename, dirname, extname, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const scriptDirectory = dirname(fileURLToPath(import.meta.url))
const repositoryRoot = resolve(scriptDirectory, '..')
const engineDataRoot = resolve(repositoryRoot, 'aeons-end-engine/src/data')
const cardsRoot = resolve(repositoryRoot, 'image-database/cards')
const breachRoot = resolve(repositoryRoot, 'image-database/common breach')
const generatedFile = resolve(repositoryRoot, 'aeons-end-ui/src/generated-image-imports.ts')

const imageExtensions = new Set(['.jpg', '.jpeg', '.png', '.webp', '.avif'])

async function walkFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true })
  const files = []
  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    const entryPath = resolve(directory, entry.name)
    if (entry.isDirectory()) {
      files.push(...await walkFiles(entryPath))
    } else if (imageExtensions.has(extname(entry.name).toLowerCase())) {
      files.push(entryPath)
    }
  }
  return files
}

function slug(value) {
  return value
    .replace(/\.[^.]+$/, '')
    .replace(/\s+(front|back)$/i, '')
    .replace(/\s*\(aeon's end\)$/i, '')
    .replace(/[\u0027\u2019]/g, '')
    .normalize('NFKD')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toLowerCase()
}

function relativeImportPath(fromFile, targetFile) {
  return relative(dirname(fromFile), targetFile).replaceAll('\\', '/')
}

async function readSourceFiles(files) {
  const sources = await Promise.all(files.map((file) => readFile(file, 'utf8')))
  return sources.join('\n')
}

async function walkSourceFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true })
  const files = []
  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    const entryPath = resolve(directory, entry.name)
    if (entry.isDirectory()) {
      files.push(...await walkSourceFiles(entryPath))
    } else {
      files.push(entryPath)
    }
  }
  return files
}

function extractRegisteredCardIds(source) {
  const ids = new Set()
  const directCardPattern = /\bid:\s*['"]([a-z0-9_]+)['"](?:(?!\bid:)[\s\S]){0,240}?\bname:\s*['"][^'\"]+['"](?:(?!\bid:)[\s\S]){0,160}?\btype:\s*['"](?:gem|relic|spell|treasure|mage_form|breach_upgrade|attack|minion|power|strike)['"]/g
  const factoryCardPattern = /\b(?:make(?:Nemesis|Strike)Card|vaultCard)\(\s*['"]([a-z0-9_]+)['"]/g
  for (const pattern of [directCardPattern, factoryCardPattern]) {
    for (const match of source.matchAll(pattern)) ids.add(match[1])
  }
  return [...ids].sort()
}

function extractMageTypes(source) {
  const types = new Set()
  const mageDefinitionPattern = /\btype:\s*['"]([a-z0-9_]+)['"](?:(?!\btype:)[\s\S]){0,280}?\babilityName:/g
  for (const match of source.matchAll(mageDefinitionPattern)) types.add(match[1])
  return [...types].sort()
}

function extractNemesisTypes(source) {
  const types = new Set()
  const nemesisDefinitionPattern = /\b\w+\s*:\s*NemesisDef\s*=\s*\{[\s\S]*?\btype:\s*['"]([a-z0-9_]+)['"]/g
  for (const match of source.matchAll(nemesisDefinitionPattern)) types.add(match[1])
  return [...types].sort()
}

function indexBySlug(files, keyForFile) {
  const index = new Map()
  for (const file of files) {
    const key = keyForFile(file)
    if (!key) continue
    const existing = index.get(key)
    if (existing && existing !== file) {
      // Earlier waves provide the canonical art when a later collection
      // includes a reprint of an already registered card.
      continue
    }
    index.set(key, file)
  }
  return index
}

function getCardImageIndex(files) {
  const eligibleFiles = files.filter((file) => {
    const relativePath = relative(cardsRoot, file).replaceAll('\\', '/')
    const baseName = basename(file)
    const isMagePortrait = relativePath.includes('/mages/') && /\s+(front|back)\.[^.]+$/i.test(baseName)
    const isNemesisMat = relativePath.includes('/nemesis/')
      && /\s+(front|back)\.[^.]+$/i.test(baseName)
      && slug(baseName).replace(/_beyond_the_breach$/, '') === slug(relativePath.split('/').at(-2) ?? '')
    const isCardBack = /\s+back\.[^.]+$/i.test(baseName)
    return !isMagePortrait && !isNemesisMat && !isCardBack
  })
  const index = indexBySlug(eligibleFiles, (file) => slug(basename(file)))

  // Basic cards keep the same printed name across waves but can have
  // wave-specific artwork. Expose a stable `waveN_<card>` alias for data
  // definitions that intentionally use that wave's alternate card art while
  // preserving the original canonical ID for older Mages and saves.
  for (const file of eligibleFiles) {
    const relativePath = relative(cardsRoot, file).replaceAll('\\', '/')
    const wave = relativePath.match(/^wave(\d+)\//i)?.[1]
    if (!wave) continue
    const variantKey = `wave${wave}_${slug(basename(file))}`
    if (!index.has(variantKey)) index.set(variantKey, file)
  }
  return index
}

function getMageImageIndex(files) {
  const index = new Map()
  for (const file of files) {
    const relativePath = relative(cardsRoot, file).replaceAll('\\', '/')
    if (!relativePath.includes('/mages/')) continue
    const baseName = basename(file)
    const match = baseName.match(/^(.+)\s+(Front|Back)\.[^.]+$/i)
    if (!match) continue
    const mageType = slug(match[1]).replace(/_(?:beyond_the_breach|the_surface|the_returned)$/, '')
    const side = match[2].toLowerCase()
    const images = index.get(mageType) ?? {}
    if (images[side] && images[side] !== file) {
      throw new Error(`Duplicate Mage ${side} image for "${mageType}":\n- ${images[side]}\n- ${file}`)
    }
    images[side] = file
    index.set(mageType, images)
  }
  return index
}

function getMageTokenImageIndex(files) {
  const eligibleFiles = files.filter((file) => {
    const relativePath = relative(cardsRoot, file).replaceAll('\\', '/')
    const supportsTransparency = ['.png', '.webp', '.avif'].includes(extname(file).toLowerCase())
    return relativePath.includes('/mages/') && /\btoken\b/i.test(basename(file)) && supportsTransparency
  })
  return indexBySlug(eligibleFiles, (file) => slug(basename(file)))
}

function getNemesisMatImageIndex(files) {
  const index = new Map()
  for (const file of files) {
    const relativePath = relative(cardsRoot, file).replaceAll('\\', '/')
    if (!relativePath.includes('/nemesis/')) continue
    const baseName = basename(file)
    const match = baseName.match(/^(.+)\s+(Front|Back)\.[^.]+$/i)
    if (!match || slug(match[1]) !== slug(relativePath.split('/').at(-2) ?? '')) continue
    const nemesisType = slug(match[1])
    const side = match[2].toLowerCase()
    const images = index.get(nemesisType) ?? {}
    if (images[side] && images[side] !== file) {
      throw new Error(`Duplicate Nemesis mat ${side} image for "${nemesisType}":\n- ${images[side]}\n- ${file}`)
    }
    images[side] = file
    index.set(nemesisType, images)
  }
  return index
}

function getBreachImageIndex(files) {
  const romanToNumber = { I: 1, II: 2, III: 3, IV: 4 }
  const index = new Map()
  for (const file of files) {
    const baseName = basename(file)
    const match = baseName.match(/^Breach_(I|II|III|IV)_(Open|Down)\.[^.]+$/i)
    if (!match) continue
    index.set(`${romanToNumber[match[1].toUpperCase()]}:${match[2].toLowerCase()}`, file)
  }
  return index
}

function ensureRequiredImages(ids, imageIndex, category) {
  const missing = ids.filter((id) => !imageIndex.has(id))
  if (missing.length > 0) {
    throw new Error(`Missing ${category} image(s) for registered data: ${missing.join(', ')}`)
  }
}

function ensureImagePair(ids, imageIndex, category) {
  const missing = ids.flatMap((id) => {
    const pair = imageIndex.get(id)
    return pair?.front && pair?.back ? [] : [`${id} (${pair?.front ? 'back' : 'front'} image missing)`]
  })
  if (missing.length > 0) throw new Error(`Missing ${category} image pair(s): ${missing.join(', ')}`)
}

function quote(value) {
  return JSON.stringify(value)
}

function createGeneratedSource({ cardIds, cardImages, mageTypes, mageImages, mageTokenImages, nemesisTypes, nemesisImages, breachImages }) {
  const imports = []
  const importNames = new Map()
  const addImport = (file) => {
    const existing = importNames.get(file)
    if (existing) return existing
    const name = `image${imports.length}`
    importNames.set(file, name)
    imports.push({ name, file })
    return name
  }
  const importPath = (file) => relativeImportPath(generatedFile, file)

  const cardEntries = cardIds.map((id) => [id, addImport(cardImages.get(id))])
  const mageEntries = mageTypes.map((type) => [type, mageImages.get(type)])
  const mageTokenEntries = [...mageTokenImages.entries()].sort(([left], [right]) => left.localeCompare(right))
  const nemesisEntries = nemesisTypes.map((type) => [type, nemesisImages.get(type)])
  const breachEntries = [...breachImages.entries()].sort(([left], [right]) => left.localeCompare(right))

  for (const [, pair] of mageEntries) {
    addImport(pair.front)
    addImport(pair.back)
  }
  for (const [, file] of mageTokenEntries) addImport(file)
  for (const [, pair] of nemesisEntries) {
    addImport(pair.front)
    addImport(pair.back)
  }
  for (const [, file] of breachEntries) addImport(file)

  const lines = [
    '// This file is generated by scripts/generate-image-imports.mjs. Do not edit by hand.',
    '',
    ...imports.map(({ name, file }) => `import ${name} from ${quote(importPath(file))}`),
    '',
    'export interface GeneratedImagePair {',
    '  front: string',
    '  back: string',
    '}',
    '',
    'export const CARD_IMAGE_IMPORTS: Record<string, string> = {',
    ...cardEntries.map(([id, name]) => `  ${id}: ${name},`),
    '}',
    '',
    'export const MAGE_IMAGE_IMPORTS: Record<string, GeneratedImagePair> = {',
    ...mageEntries.map(([type, pair]) => `  ${type}: { front: ${importNames.get(pair.front)}, back: ${importNames.get(pair.back)} },`),
    '}',
    '',
    'export const MAGE_TOKEN_IMAGE_IMPORTS: Record<string, string> = {',
    ...mageTokenEntries.map(([id, file]) => `  ${id}: ${importNames.get(file)},`),
    '}',
    '',
    'export const NEMESIS_MAT_IMAGE_IMPORTS: Record<string, GeneratedImagePair> = {',
    ...nemesisEntries.map(([type, pair]) => `  ${type}: { front: ${importNames.get(pair.front)}, back: ${importNames.get(pair.back)} },`),
    '}',
    '',
    'export const BREACH_IMAGE_IMPORTS: Record<string, string> = {',
    ...breachEntries.map(([key, file]) => `  ${quote(key)}: ${importNames.get(file)},`),
    '}',
    '',
  ]
  return `${lines.join('\n')}\n`
}

const [engineFiles, cardFiles, breachFiles] = await Promise.all([
  walkSourceFiles(engineDataRoot),
  walkFiles(cardsRoot),
  walkFiles(breachRoot),
])
const engineSource = await readSourceFiles(engineFiles.filter((file) => file.endsWith('.ts')))
const cardIds = extractRegisteredCardIds(engineSource)
const nemesisFiles = engineFiles.filter((file) => basename(file).toLowerCase() === 'nemesis.ts')
const nemesisSource = await readSourceFiles(nemesisFiles)
const mageTypes = extractMageTypes(engineSource)
const nemesisTypes = extractNemesisTypes(nemesisSource)
const cardImages = getCardImageIndex(cardFiles)
const mageImages = getMageImageIndex(cardFiles)
const mageTokenImages = getMageTokenImageIndex(cardFiles)
const nemesisImages = getNemesisMatImageIndex(cardFiles)
const breachImages = getBreachImageIndex(breachFiles)

ensureRequiredImages(cardIds, cardImages, 'card')
ensureImagePair(mageTypes, mageImages, 'Mage')
ensureImagePair(nemesisTypes, nemesisImages, 'Nemesis mat')
if (!breachImages.has('1:open')) throw new Error('Missing breach image for 1:open')
for (const index of [2, 3, 4]) {
  if (!breachImages.has(`${index}:open`)) throw new Error(`Missing breach image for ${index}:open`)
  if (!breachImages.has(`${index}:down`)) throw new Error(`Missing breach image for ${index}:down`)
}

await writeFile(generatedFile, createGeneratedSource({
  cardIds, cardImages, mageTypes, mageImages, mageTokenImages, nemesisTypes, nemesisImages, breachImages,
}), 'utf8')

console.log(`Generated ${generatedFile}`)
console.log(`Mapped ${cardIds.length} cards, ${mageTypes.length} Mages, ${mageTokenImages.size} Mage token(s), ${nemesisTypes.length} Nemesis mat(s), and ${breachImages.size} breaches.`)
