import { spawn } from 'node:child_process'
import { cp, lstat, mkdir, rm, writeFile } from 'node:fs/promises'
import { dirname, extname, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const desktopRoot = dirname(fileURLToPath(import.meta.url))
const repositoryRoot = resolve(desktopRoot, '..')
const outputRoot = resolve(desktopRoot, 'out')
const portableExe = resolve(outputRoot, 'AeonsEnd.exe')
const stagingRoot = resolve(outputRoot, 'share-package')
const archivePath = resolve(outputRoot, 'Aeons-End-Digital-Windows-x64.zip')
const partialArchivePath = `${archivePath}.partial.zip`
const compressionScriptPath = resolve(outputRoot, 'compress-share-package.ps1')
const imageExtensions = new Set(['.jpg', '.jpeg', '.png', '.webp', '.avif', '.svg'])

function assertInside(parent, target) {
  const relativePath = relative(parent, target)
  if (!relativePath || relativePath.startsWith(`..${sep}`) || relativePath === '..') {
    throw new Error(`Refusing to modify a path outside the output folder: ${target}`)
  }
}

function psSingleQuoted(value) {
  return `'${value.replaceAll("'", "''")}'`
}

function runPowerShell(scriptPath) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn('powershell.exe', [
      '-NoLogo', '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', scriptPath,
    ], { cwd: desktopRoot, stdio: 'inherit', windowsHide: true })
    child.once('error', reject)
    child.once('exit', code => {
      if (code === 0) resolvePromise()
      else reject(new Error(`PowerShell archive creation failed with exit code ${code ?? 'unknown'}.`))
    })
  })
}

async function copyImageDatabase(source, destination) {
  await cp(source, destination, {
    recursive: true,
    filter: async sourcePath => {
      const relativePath = relative(source, sourcePath)
      if (!relativePath) return true
      const segments = relativePath.split(sep)
      if (segments.some(segment => segment === '.cache' || segment === '__pycache__')) return false
      const info = await lstat(sourcePath)
      if (info.isSymbolicLink()) throw new Error(`Symbolic links are not allowed in the image database: ${sourcePath}`)
      return info.isDirectory() || imageExtensions.has(extname(sourcePath).toLowerCase())
    },
  })
}

async function main() {
  if (process.platform !== 'win32') {
    throw new Error('The share archive must be assembled on Windows because it uses PowerShell Compress-Archive.')
  }

  const requiredFiles = [
    portableExe,
    resolve(repositoryRoot, 'Play Aeon\'s End Demo.cmd'),
    resolve(repositoryRoot, 'play-local-demo.ps1'),
    resolve(repositoryRoot, 'update-local-demo.ps1'),
    resolve(repositoryRoot, 'local-update-manifest.tsv'),
    resolve(repositoryRoot, 'local-demo-site', 'index.html'),
    resolve(repositoryRoot, 'image-database'),
  ]
  for (const path of requiredFiles) {
    try {
      await lstat(path)
    } catch {
      throw new Error(`Required packaging input is missing: ${path}\nRun "npm run package:share" after building in the project root.`)
    }
  }

  assertInside(outputRoot, stagingRoot)
  assertInside(outputRoot, archivePath)
  assertInside(outputRoot, partialArchivePath)
  assertInside(outputRoot, compressionScriptPath)

  await rm(stagingRoot, { recursive: true, force: true })
  await rm(partialArchivePath, { force: true })
  await mkdir(stagingRoot, { recursive: true })

  process.stdout.write('正在整理两个启动方式和共用的本地游戏文件...\n')
  await cp(portableExe, resolve(stagingRoot, 'AeonsEnd.exe'))

  await cp(resolve(repositoryRoot, 'local-demo-site'), resolve(stagingRoot, 'local-demo-site'), { recursive: true })
  await copyImageDatabase(resolve(repositoryRoot, 'image-database'), resolve(stagingRoot, 'image-database'))
  await cp(resolve(repositoryRoot, 'local-update-manifest.tsv'), resolve(stagingRoot, 'local-update-manifest.tsv'))
  await cp(resolve(repositoryRoot, 'Play Aeon\'s End Demo.cmd'), resolve(stagingRoot, 'Play Aeon\'s End Demo.cmd'))
  await cp(resolve(repositoryRoot, 'play-local-demo.ps1'), resolve(stagingRoot, 'play-local-demo.ps1'))
  await cp(resolve(repositoryRoot, 'update-local-demo.ps1'), resolve(stagingRoot, 'update-local-demo.ps1'))
  await writeFile(resolve(stagingRoot, 'START-HERE.txt'), '\uFEFF' + [
    'Aeon\'s End Digital — 本地游玩说明',
    '',
    '请先将整个压缩包解压到可写入的文件夹，不要直接在压缩包预览中启动。',
    'Windows 7 建议解压到较短路径，例如 C:\\Games\\AeonsEnd，避免路径过深。',
    '',
    'Windows 10/11：双击 AeonsEnd.exe，在本地桌面客户端中游玩。',
    'Windows 7：双击 Play Aeon\'s End Demo.cmd，在浏览器中游玩。',
    '浏览器游玩期间，请保持命令窗口开启；关闭窗口会停止本地游戏服务。',
    '',
    '两个启动方式共用 local-demo-site 和 image-database 文件夹，请勿移动或删除这些文件。',
    'CMD 启动器会检查 GitHub 上的更新；无法连接时会继续使用压缩包内的完整本地版本。',
    '桌面客户端目前不支持自动更新；更新客户端程序时请下载新版完整压缩包。',
    '程序尚未进行代码签名，Windows 可能会显示安全提示或未知发布者提示。',
    '',
  ].join('\r\n'), 'utf8')

  const compressionScript = [
    "$ErrorActionPreference = 'Stop'",
    "$ProgressPreference = 'SilentlyContinue'",
    `$source = ${psSingleQuoted(stagingRoot)}`,
    `$destination = ${psSingleQuoted(partialArchivePath)}`,
    "Compress-Archive -Path (Join-Path $source '*') -DestinationPath $destination -CompressionLevel Optimal -Force",
    "if (-not (Test-Path -LiteralPath $destination -PathType Leaf)) { throw 'The ZIP archive was not created.' }",
  ].join('\r\n')
  await writeFile(compressionScriptPath, compressionScript, 'utf8')

  process.stdout.write('正在压缩发行包，图片资源较多，请稍候...\n')
  try {
    await runPowerShell(compressionScriptPath)
    await rm(archivePath, { force: true })
    const { rename, stat } = await import('node:fs/promises')
    await rename(partialArchivePath, archivePath)
    const archiveInfo = await stat(archivePath)
    process.stdout.write(`发行包已生成：${archivePath}\n`)
    process.stdout.write(`压缩包大小：${(archiveInfo.size / 1_000_000).toFixed(1)} MB\n`)
  } finally {
    await rm(compressionScriptPath, { force: true })
    await rm(partialArchivePath, { force: true })
  }
}

main().catch(error => {
  process.stderr.write(`${error.stack ?? error}\n`)
  process.exitCode = 1
})
