const { app, BrowserWindow, dialog, shell } = require('electron')
const fs = require('node:fs')
const http = require('node:http')
const path = require('node:path')

const APP_PORT = 47382
const APP_HOST = '127.0.0.1'
const APP_ID = 'com.aeonsendigital.desktop'
const APP_ORIGIN = `http://${APP_HOST}:${APP_PORT}`
const DEV_URL = process.env.AEONS_END_DEV_URL || ''
const projectRoot = process.env.AEONS_END_PROJECT_ROOT || path.resolve(__dirname, '..')
const appIconPath = path.join(__dirname, 'assets', 'app-icon.ico')
const gameRoot = app.isPackaged ? process.resourcesPath : projectRoot
const siteRoot = path.join(gameRoot, 'local-demo-site')
const imageRoot = path.join(gameRoot, 'image-database')

let mainWindow = null
let gameServer = null
let shuttingDown = false

const appLock = app.requestSingleInstanceLock()
if (!appLock) app.quit()

if (appLock) {
  if (process.platform === 'win32') app.setAppUserModelId(APP_ID)
  const profileRoot = app.isPackaged
    ? path.join(path.dirname(process.execPath), 'profile')
    : path.join(__dirname, '.dev-profile')
  fs.mkdirSync(profileRoot, { recursive: true })
  app.setPath('userData', profileRoot)

  app.on('second-instance', () => {
    if (!mainWindow) return
    if (mainWindow.isMinimized()) mainWindow.restore()
    if (!mainWindow.isVisible()) mainWindow.show()
    mainWindow.focus()
  })
}

function safeFilePath(basePath, relativePath) {
  const absoluteBase = path.resolve(basePath)
  const candidate = path.resolve(absoluteBase, relativePath)
  const relativeCandidate = path.relative(absoluteBase, candidate)
  if (relativeCandidate === '..' || relativeCandidate.startsWith(`..${path.sep}`) || path.isAbsolute(relativeCandidate)) {
    return null
  }

  let current = absoluteBase
  for (const part of relativeCandidate.split(path.sep).filter(Boolean)) {
    current = path.join(current, part)
    try {
      if (fs.lstatSync(current).isSymbolicLink()) return null
    } catch (error) {
      if (error.code === 'ENOENT') return candidate
      throw error
    }
  }
  return candidate
}

function contentType(filePath) {
  const types = {
    '.avif': 'image/avif',
    '.css': 'text/css; charset=utf-8',
    '.html': 'text/html; charset=utf-8',
    '.ico': 'image/x-icon',
    '.jpeg': 'image/jpeg',
    '.jpg': 'image/jpeg',
    '.js': 'text/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.png': 'image/png',
    '.svg': 'image/svg+xml',
    '.webp': 'image/webp',
  }
  return types[path.extname(filePath).toLowerCase()] || 'application/octet-stream'
}

function sendFile(request, response, filePath, cacheControl) {
  let stats
  try {
    stats = fs.statSync(filePath)
  } catch {
    response.writeHead(404, { 'Content-Length': '0', Connection: 'close' })
    response.end()
    return
  }

  if (!stats.isFile()) {
    response.writeHead(404, { 'Content-Length': '0', Connection: 'close' })
    response.end()
    return
  }

  response.writeHead(200, {
    'Cache-Control': cacheControl,
    'Content-Length': stats.size,
    'Content-Type': contentType(filePath),
    Connection: 'close',
  })
  if (request.method === 'HEAD') response.end()
  else fs.createReadStream(filePath).pipe(response)
}

function createGameServer() {
  return http.createServer((request, response) => {
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      response.writeHead(405, { Allow: 'GET, HEAD', 'Content-Length': '0' })
      response.end()
      return
    }

    let pathname
    try {
      pathname = decodeURIComponent(new URL(request.url, APP_ORIGIN).pathname)
    } catch {
      response.writeHead(400, { 'Content-Length': '0' })
      response.end()
      return
    }

    if (pathname === '/__aeons_end_desktop_check__') {
      response.writeHead(204, { 'Content-Length': '0', Connection: 'close' })
      response.end()
      return
    }

    if (pathname.startsWith('/image-database/')) {
      const relativeImagePath = pathname.slice('/image-database/'.length)
      const imagePath = safeFilePath(imageRoot, relativeImagePath)
      if (!imagePath) {
        response.writeHead(404, { 'Content-Length': '0' })
        response.end()
        return
      }
      sendFile(request, response, imagePath, 'public, max-age=31536000, immutable')
      return
    }

    const relativeSitePath = pathname.replace(/^\/+/, '') || 'index.html'
    let sitePath = safeFilePath(siteRoot, relativeSitePath)
    if (!sitePath) {
      response.writeHead(404, { 'Content-Length': '0' })
      response.end()
      return
    }

    if (!fs.existsSync(sitePath) && !path.extname(relativeSitePath)) {
      sitePath = safeFilePath(siteRoot, 'index.html')
    }
    if (!sitePath) {
      response.writeHead(404, { 'Content-Length': '0' })
      response.end()
      return
    }

    const cacheControl = pathname.startsWith('/assets/')
      ? 'public, max-age=31536000, immutable'
      : 'no-cache, must-revalidate'
    sendFile(request, response, sitePath, cacheControl)
  })
}

function waitForServer(server) {
  return new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(APP_PORT, APP_HOST, () => {
      server.removeListener('error', reject)
      resolve()
    })
  })
}

function stopGameServer() {
  if (!gameServer || !gameServer.listening) return
  gameServer.close()
  gameServer = null
}

function createWindow() {
  let firstFrameReady = false
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    show: false,
    autoHideMenuBar: true,
    icon: appIconPath,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })
  mainWindow.maximize()

  const appUrl = DEV_URL || `${APP_ORIGIN}/`
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://')) shell.openExternal(url)
    return { action: 'deny' }
  })
  mainWindow.webContents.on('will-navigate', (event, url) => {
    const allowedOrigin = DEV_URL ? new URL(DEV_URL).origin : APP_ORIGIN
    if (new URL(url).origin !== allowedOrigin) {
      event.preventDefault()
      if (url.startsWith('https://')) shell.openExternal(url)
    }
  })
  if (DEV_URL) {
    mainWindow.on('show', () => console.log('[desktop] Window shown.'))
    mainWindow.on('hide', () => console.log('[desktop] Window hidden.'))
    mainWindow.on('minimize', () => console.log('[desktop] Window minimized.'))
    mainWindow.on('restore', () => console.log('[desktop] Window restored.'))
    mainWindow.on('closed', () => console.log('[desktop] Window closed.'))
    mainWindow.webContents.on('did-start-loading', () => {
      console.log(`[desktop] Loading ${mainWindow?.webContents.getURL() || appUrl}`)
    })
    mainWindow.webContents.on('did-finish-load', () => {
      console.log(`[desktop] Loaded ${mainWindow?.webContents.getURL() || appUrl}`)
    })
    mainWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL, isMainFrame) => {
      console.error(`[desktop] Load failed (mainFrame=${isMainFrame}, code=${errorCode}): ${errorDescription} — ${validatedURL}`)
    })
    mainWindow.webContents.on('console-message', details => {
      if (details.level === 'warning' || details.level === 'error') {
        console.error(`[renderer:${details.level}] ${details.message} (${details.sourceId}:${details.lineNumber})`)
      }
    })
    mainWindow.webContents.on('render-process-gone', (_event, details) => {
      console.error(`[desktop] Renderer exited: ${details.reason}, exitCode=${details.exitCode}`)
    })
    mainWindow.on('unresponsive', () => console.error('[desktop] Window became unresponsive.'))
  }

  mainWindow.once('ready-to-show', () => {
    firstFrameReady = true
    console.log('[desktop] First frame is ready; showing the game window.')
    if (mainWindow) {
      mainWindow.show()
      mainWindow.focus()
    }
  })
  mainWindow.on('closed', () => {
    mainWindow = null
    app.quit()
  })
  mainWindow.loadURL(appUrl).catch(error => {
    console.error(`[desktop] Could not load ${appUrl}: ${error.stack || error.message}`)
    if (mainWindow) {
      mainWindow.show()
      if (DEV_URL) mainWindow.webContents.openDevTools({ mode: 'detach' })
    }
  })

  if (DEV_URL) {
    setTimeout(() => {
      if (!mainWindow) return
      if (!firstFrameReady) {
        console.error('[desktop] The first frame did not become ready within 10 seconds; opening the window and DevTools for diagnosis.')
        mainWindow.show()
        mainWindow.webContents.openDevTools({ mode: 'detach' })
        return
      }
      if (!mainWindow.isVisible() && !mainWindow.isMinimized()) {
        console.error('[desktop] The game window became hidden after its first frame; restoring it.')
        mainWindow.show()
        mainWindow.focus()
      }
    }, 10000).unref()

    setTimeout(() => {
      if (!mainWindow) {
        console.error('[desktop] Window state after 3 seconds: destroyed.')
        return
      }
      console.log(`[desktop] Window state after 3 seconds: visible=${mainWindow.isVisible()}, minimized=${mainWindow.isMinimized()}, bounds=${JSON.stringify(mainWindow.getBounds())}`)
    }, 3000).unref()
  }
}

if (appLock) {
  app.whenReady().then(async () => {
    if (!DEV_URL) {
      if (!fs.existsSync(path.join(siteRoot, 'index.html')) || !fs.existsSync(imageRoot)) {
        await dialog.showMessageBox({
          type: 'error',
          title: "Aeon's End Digital",
          message: 'Local game files are missing.',
          detail: 'Download and extract the complete desktop package, then try again.',
        })
        app.quit()
        return
      }

      gameServer = createGameServer()
      try {
        await waitForServer(gameServer)
      } catch (error) {
        gameServer = null
        await dialog.showMessageBox({
          type: 'error',
          title: "Aeon's End Digital",
          message: 'The local game server could not start.',
          detail: error.code === 'EADDRINUSE'
            ? `Port ${APP_PORT} is already in use. Close the other local game client and try again.`
            : error.message,
        })
        app.quit()
        return
      }
    }

    createWindow()
  })

  app.on('before-quit', () => {
    if (shuttingDown) return
    shuttingDown = true
    stopGameServer()
  })

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit()
  })
}
