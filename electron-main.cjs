const { app, BrowserWindow, Notification, Tray, Menu, nativeImage, ipcMain, screen, powerMonitor } = require('electron')
const path = require('path')
const fs = require('fs')

const PROTOCOL = 'dreamsdesk'

// Log uncaught errors to a file so we can diagnose crashes
const logFile = path.join(app.getPath('temp'), 'dreamsdesk-crash.log')
function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}\n`
  try { fs.appendFileSync(logFile, line) } catch (_) {}
  console.log(msg)
}
process.on('uncaughtException', (err) => { log('UNCAUGHT: ' + err.stack); app.quit() })
process.on('unhandledRejection', (err) => { log('UNHANDLED: ' + String(err)) })

if (process.defaultApp) {
  if (process.argv.length >= 2) {
    app.setAsDefaultProtocolClient(PROTOCOL, process.execPath, [path.resolve(process.argv[1])])
  }
} else {
  app.setAsDefaultProtocolClient(PROTOCOL)
}

let initialDeepLinkUrl = null
if (process.platform === 'win32' || process.platform === 'linux') {
  initialDeepLinkUrl = process.argv.find(arg => arg.startsWith(`${PROTOCOL}://`)) || null
}

ipcMain.handle('get-initial-deep-link', () => {
  const url = initialDeepLinkUrl
  initialDeepLinkUrl = null
  return url
})

const gotTheLock = app.requestSingleInstanceLock()

if (!gotTheLock) {
  app.quit()
  process.exit(0)
} else {
  app.on('second-instance', (event, commandLine, workingDirectory) => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.show()
      mainWindow.focus()
    }
    const url = commandLine.find(arg => arg.startsWith(`${PROTOCOL}://`))
    if (url && mainWindow) {
      mainWindow.webContents.send('deep-link', url)
    }
  })
}

let mainWindow
let tray = null
let isQuitting = false


function getDistPath() {
  if (process.env.NODE_ENV === 'development') {
    return path.join(__dirname, 'dist')
  }
  // In production, dist is bundled inside the app asar/folder
  const appPath = app.getAppPath()
  log('getDistPath: appPath=' + appPath)
  const distPath = path.join(appPath, 'dist')
  log('getDistPath: distPath=' + distPath + ' exists=' + fs.existsSync(distPath))
  return distPath
}

let localServer = null

function createWindow() {
  log('createWindow: start')

  // Ensure dist is copied to temp BEFORE creating window (icon needed)
  const distPath = process.env.NODE_ENV === 'development'
    ? path.join(__dirname, 'dist')
    : getDistPath()
  log('createWindow: distPath=' + distPath)

  // Resolve icon: use extraResources path in production, public/ in dev
  const getIconPath = () => {
    if (process.env.NODE_ENV === 'development') {
      return path.join(__dirname, 'public', 'logo.ico')
    }
    return path.join(process.resourcesPath, 'logo.ico')
  }
  const iconFile = getIconPath()
  log('createWindow: iconFile=' + iconFile + ' exists=' + fs.existsSync(iconFile))

  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    title: "Dreamsdesk",
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      backgroundThrottling: false
    },
    autoHideMenuBar: true,
    icon: fs.existsSync(iconFile) ? iconFile : undefined
  })

  app.setAppUserModelId('com.dreamsdesign.taskapp')

  ipcMain.on('show-notification', (event, { title, body, icon }) => {
    new Notification({ title, body, icon: icon || iconFile }).show()
  })

  const isDev = process.env.NODE_ENV === 'development'

  if (isDev) {
    mainWindow.loadURL('http://localhost:8000')
  } else {
    try {
      log('createWindow: distPath=' + distPath)
      log('createWindow: distExists=' + fs.existsSync(distPath))
      log('createWindow: indexExists=' + fs.existsSync(path.join(distPath, 'index.html')))

      const express = require('express')
      const http = require('http')
      const expressApp = express()
      expressApp.use(express.static(distPath))
      expressApp.get('/{*splat}', (_req, res) => {
        res.sendFile(path.join(distPath, 'index.html'))
      })
      localServer = http.createServer(expressApp)
      localServer.on('error', (err) => {
        log('SERVER ERROR: ' + err.message)
      })
      localServer.listen(42899, '127.0.0.1', () => {
        const port = localServer.address().port
        log('createWindow: server listening on port ' + port)
        const url = `http://127.0.0.1:${port}`
        log('createWindow: loading ' + url)
        mainWindow.loadURL(url)
      })
    } catch (e) {
      log('createWindow: FAILED to start server: ' + e.message + '\n' + e.stack)
    }
  }

  mainWindow.webContents.on('did-fail-load', (e, code, desc) => {
    log('LOAD FAILED: ' + code + ' ' + desc)
  })

  // On app startup, navigate to tasks page (shows punch-in if not punched in)
  mainWindow.webContents.once('did-finish-load', () => {
    setTimeout(() => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('show-punch-in')
      }
    }, 1200)
  })

  mainWindow.webContents.on('console-message', (e, level, msg) => {
    if (level >= 2) log('CONSOLE [' + level + ']: ' + msg)
  })

  mainWindow.on('close', (event) => {
    if (!isQuitting) {
      event.preventDefault()
      mainWindow.hide()
    }
  })

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

function createTray() {
  let iconPath
  if (process.env.NODE_ENV === 'development') {
    iconPath = path.join(__dirname, 'public', 'logo.ico')
  } else {
    iconPath = path.join(process.resourcesPath, 'logo.ico')
  }
  const icon = fs.existsSync(iconPath) ? iconPath : nativeImage.createEmpty()
  tray = new Tray(icon)
  const contextMenu = Menu.buildFromTemplate([
    { label: 'Show App', click: () => mainWindow.show() },
    { label: 'Quit', click: () => {
      isQuitting = true
      app.quit()
    }}
  ])
  tray.setToolTip('Dreamsdesk')
  tray.setContextMenu(contextMenu)

  tray.on('click', () => {
    if (mainWindow) {
      if (mainWindow.isVisible()) {
        mainWindow.focus()
      } else {
        mainWindow.show()
      }
    }
  })
}

// ── Timer Overlay Window (always-on-top pill) ──
let timerOverlay = null

function createTimerOverlay() {
  if (timerOverlay && !timerOverlay.isDestroyed()) {
    timerOverlay.close()
    timerOverlay = null
  }

  const { width: screenW, height: screenH } = screen.getPrimaryDisplay().workAreaSize

  timerOverlay = new BrowserWindow({
    width: 130,
    height: 44,
    x: screenW - 150,
    y: screenH - 68,
    alwaysOnTop: true,
    skipTaskbar: true,
    frame: false,
    transparent: true,
    resizable: false,
    focusable: true,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
  })

  timerOverlay.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(`<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body {
    width: 130px;
    height: 44px;
    background: transparent;
    overflow: hidden;
    user-select: none;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Inter', system-ui, sans-serif;
  }
  .pill {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 0 12px;
    height: 44px;
    width: 130px;
    background: linear-gradient(90deg, #702c91 0%, #c0207a 50%, #702c91 100%);
    background-size: 200% 100%;
    border-radius: 999px;
    box-shadow: 0 6px 20px rgba(112,44,145,0.45);
    cursor: grab;
    animation: shimmer 3s ease-in-out infinite;
  }
  .pill:active { cursor: grabbing; }
  @keyframes shimmer {
    0%, 100% { background-position: 0% 50%; }
    50% { background-position: 100% 50%; }
  }
  .dot {
    width: 10px;
    height: 10px;
    border-radius: 50%;
    background: #25d366;
    flex-shrink: 0;
    animation: pulse 1.8s ease-in-out infinite;
  }
  @keyframes pulse {
    0%, 100% { opacity: 1; transform: scale(1); }
    50% { opacity: 0.35; transform: scale(0.7); }
  }
  .time-display {
    flex: 1;
    font-size: 15px;
    font-weight: 800;
    color: #fff;
    font-variant-numeric: tabular-nums;
    letter-spacing: 0.06em;
    line-height: 1.1;
    font-family: 'SF Mono', 'Fira Code', 'Consolas', 'Courier New', monospace;
  }
  .stop-btn {
    width: 28px;
    height: 28px;
    border-radius: 50%;
    border: none;
    background: rgba(255,255,255,0.18);
    color: #fff;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    transition: background 0.2s;
    font-size: 13px;
    line-height: 1;
    font-weight: 700;
  }
  .stop-btn:hover { background: rgba(239,68,68,0.9); }
</style>
</head>
<body>
<div class="pill" id="pill">
  <div class="dot"></div>
  <div class="time-display" id="timerDisplay">00:00</div>
  <button class="stop-btn" id="stopBtn" title="Stop Timer">&#9632;</button>
</div>
<script>
  const { ipcRenderer } = require('electron');
  const display = document.getElementById('timerDisplay');
  const pill = document.getElementById('pill');

  ipcRenderer.on('overlay-update', (event, data) => {
    display.textContent = data.time || '00:00';
  });

  document.getElementById('stopBtn').addEventListener('click', (e) => {
    e.stopPropagation();
    ipcRenderer.send('timer-stop');
  });

  // ── Boundary-clamped drag ──
  let dragging = false;
  let dragStartX = 0, dragStartY = 0;

  pill.addEventListener('mousedown', (e) => {
    if (e.target.id === 'stopBtn') return;
    dragging = true;
    dragStartX = e.screenX;
    dragStartY = e.screenY;
    e.preventDefault();
  });

  window.addEventListener('mousemove', (e) => {
    if (!dragging) return;
    const dx = e.screenX - dragStartX;
    const dy = e.screenY - dragStartY;
    dragStartX = e.screenX;
    dragStartY = e.screenY;
    ipcRenderer.send('move-timer-overlay', { dx, dy });
  });

  window.addEventListener('mouseup', () => { dragging = false; });
</script>
</body>
</html>
`)}`)

  // ── Boundary-clamped move handler ──
  timerOverlay.on('move', () => {
    if (!timerOverlay || timerOverlay.isDestroyed()) return
    const { width: sw, height: sh } = screen.getPrimaryDisplay().workAreaSize
    const [x, y] = timerOverlay.getPosition()
    const b = timerOverlay.getBounds()
    const cx = Math.max(0, Math.min(x, sw - b.width))
    const cy = Math.max(0, Math.min(y, sh - b.height))
    if (cx !== x || cy !== y) timerOverlay.setPosition(cx, cy)
  })

  timerOverlay.on('closed', () => {
    timerOverlay = null
  })
}


function updateTimerOverlay(data) {
  if (timerOverlay && !timerOverlay.isDestroyed()) {
    timerOverlay.webContents.send('overlay-update', data)
  }
}

ipcMain.on('move-timer-overlay', (_event, { dx, dy }) => {
  if (timerOverlay && !timerOverlay.isDestroyed()) {
    const { width: sw, height: sh } = screen.getPrimaryDisplay().workAreaSize
    const [x, y] = timerOverlay.getPosition()
    const b = timerOverlay.getBounds()
    const newX = Math.max(0, Math.min(x + dx, sw - b.width))
    const newY = Math.max(0, Math.min(y + dy, sh - b.height))
    timerOverlay.setPosition(newX, newY)
  }
})

ipcMain.on('timer-update', (_event, data) => {
  if (data.active) {
    if (!timerOverlay || timerOverlay.isDestroyed()) {
      createTimerOverlay()
    }
    updateTimerOverlay(data)
  } else {
    if (timerOverlay && !timerOverlay.isDestroyed()) {
      timerOverlay.close()
    }
    timerOverlay = null
  }
})

ipcMain.on('timer-stop', () => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.show()
    mainWindow.focus()
    mainWindow.webContents.send('timer-stop-from-overlay')
  }
})

// System-wide idle time (seconds) so the renderer can auto-pause the task timer
// when the user hasn't moved the mouse/used the keyboard for 5 minutes.
ipcMain.handle('get-system-idle-time', () => powerMonitor.getSystemIdleTime())

app.whenReady().then(() => {
  log('app ready')
  
  // Start on system startup
  app.setLoginItemSettings({
    openAtLogin: true,
    path: process.execPath
  })

  createWindow()
  createTray()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })

  // Show window + navigate to punch-in screen when screen is unlocked
  powerMonitor.on('unlock-screen', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.show()
      mainWindow.focus()
      // Tell the React app to navigate to tasks/punch-in
      setTimeout(() => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('show-punch-in')
        }
      }, 500)
    }
  })


  // Attempt auto punch-out when Windows is shutting down / logging off
  // session-end fires before the OS fully shuts down
  app.on('session-end', () => {
    log('session-end: attempting auto punch-out')
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('auto-punch-out')
    }
  })

  // Power suspend (sleep/hibernate/power-cut UPS signal) — best-effort auto punch-out
  powerMonitor.on('suspend', () => {
    log('suspend: attempting auto punch-out')
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('auto-punch-out')
    }
  })

  // before-quit: send auto-punch-out and wait up to 6s for the renderer to confirm
  // before allowing the app to exit — this ensures the network call completes
  app.on('before-quit', (event) => {
    log('before-quit: attempting auto punch-out')
    if (!isQuitting) {
      isQuitting = true
      if (mainWindow && !mainWindow.isDestroyed()) {
        event.preventDefault() // pause quit temporarily
        let quitTimer = setTimeout(() => {
          log('before-quit: punch-out timeout — forcing quit')
          app.quit()
        }, 6000) // max 6s wait

        // Listen for renderer to signal punch-out is complete
        ipcMain.once('punch-out-done', () => {
          log('before-quit: punch-out-done received — quitting')
          clearTimeout(quitTimer)
          app.quit()
        })

        mainWindow.webContents.send('auto-punch-out')
      }
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin' && isQuitting) {
    if (localServer) localServer.close()
    app.quit()
  }
})

app.on('open-url', (event, url) => {
  event.preventDefault()
  if (mainWindow) {
    mainWindow.webContents.send('deep-link', url)
  }
})
