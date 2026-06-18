/**
 * Electron Main Process — entry point, window creation, webview management
 */
import { app, BrowserWindow, Menu, globalShortcut, shell } from 'electron'
import * as path from 'path'

// IPC modules
import { registerStore, readConfigSync } from './ipc/store'
import { registerSearch } from './ipc/search'
import { registerAuth } from './ipc/auth'
import { registerDownload, attachWebviewDownloads, registerWebviewSessionIPC } from './ipc/download'
import { registerTools } from './ipc/tools'
import { registerTranslate } from './ipc/translate'

// Agent tool IPC handlers (web_fetch, file_*)
import './tool-handlers'

// Auto-updater
import { checkForUpdates, registerUpdateIPC } from './updater'

// ===== App Configuration =====
app.commandLine.appendSwitch('disable-gpu-sandbox')
app.commandLine.appendSwitch('disable-features', 'WebDriver')

const isDev = !app.isPackaged
Menu.setApplicationMenu(null)

let mainWindow: BrowserWindow | null = null
let toolsRef: { get closeToTray(): boolean } | null = null

// ===== Window Creation =====
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1000,
    minHeight: 700,
    frame: false,
    transparent: true,
    title: 'LingWorks',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      webviewTag: true,
      webSecurity: false,
      nodeIntegration: true,
      contextIsolation: false,
      sandbox: false,
    },
    backgroundColor: '#00000000',
    icon: path.join(__dirname, isDev ? '../public/app-icon.ico' : '../dist/app-icon.ico'),
  })

  if (process.platform === 'win32') {
    mainWindow.setBackgroundColor('#00000000')
  }

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173')
    mainWindow.webContents.openDevTools()
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'))
  }

  mainWindow.on('maximize', () => mainWindow?.webContents.send('window-maximize-change', true))
  mainWindow.on('unmaximize', () => mainWindow?.webContents.send('window-maximize-change', false))

  // DevTools shortcut (F12 or Ctrl+Shift+I) for production builds
  globalShortcut.register('F12', () => {
    mainWindow?.webContents.toggleDevTools()
  })
  globalShortcut.register('CommandOrControl+Shift+I', () => {
    mainWindow?.webContents.toggleDevTools()
  })

  // Register IPC handlers (pass mainWindow reference)
  registerStore()
  registerSearch()
  registerAuth()
  toolsRef = registerTools(mainWindow) || null
  registerTranslate()

  // Download management
  const { activeDownloads, trackSession } = registerDownload(mainWindow)

  // Download handlers for webview persistent sessions are registered lazily via
  // registerWebviewSessionIPC — the renderer calls it on did-attach (when partition
  // is guaranteed to be applied). Pre-registration removed to speed up startup.
  registerWebviewSessionIPC(mainWindow)

  // Track all future non-webview windows for download handling
  app.on('web-contents-created', (_, contents) => {
    if (contents.getType() === 'window') {
      trackSession(contents.session)
    }
  })

  // Download protection + tray close behavior
  let downloadCloseOverride = false
  mainWindow.on('close', (e) => {
    if (downloadCloseOverride) return
    // Close-to-tray: hide instead of close
    if (toolsRef?.closeToTray) {
      e.preventDefault()
      mainWindow?.hide()
      return
    }
    if (activeDownloads.size > 0) {
      e.preventDefault()
      const { dialog } = require('electron')
      dialog.showMessageBox(mainWindow!, {
        type: 'warning',
        title: '下载进行中',
        message: `有 ${activeDownloads.size} 个下载任务正在进行中，确定要关闭窗口吗？`,
        detail: '关闭窗口将丢失所有未完成的下载。',
        buttons: ['取消', '确定关闭'],
        defaultId: 0,
        cancelId: 0,
      }).then(({ response }: { response: number }) => {
        if (response === 1) {
          downloadCloseOverride = true
          mainWindow?.close()
        }
      })
    }
  })
}

// ===== WebView Management (CSP, UA, popups, context menu) =====
app.on('web-contents-created', (_e, contents) => {
  const type = contents.getType()

  if (type !== 'webview') {
    // Handle popup windows
    if (type === 'window') {
      contents.on('will-navigate', (_ev, url) => {
        if (url.startsWith('http://') || url.startsWith('https://')) {
          const hostId = (contents as any).hostWebContents?.id
          mainWindow?.webContents.send('popup-navigate', { url, hostWebContentsId: hostId })
          const win = BrowserWindow.fromWebContents(contents)
          if (win) win.close()
        }
      })
    }
    return
  }

  // Strip CSP headers to allow webview content to load
  contents.session.webRequest.onHeadersReceived(
    { urls: ['*://*/*'] },
    (details, callback) => {
      const headers: Record<string, string[]> = {}
      for (const [key, value] of Object.entries(details.responseHeaders ?? {})) {
        const lk = key.toLowerCase()
        if (lk !== 'content-security-policy' &&
            lk !== 'content-security-policy-report-only' &&
            lk !== 'x-frame-options') {
          headers[key] = value
        }
      }
      callback({ responseHeaders: headers })
    }
  )

  // Attach webview download handler
  attachWebviewDownloads(mainWindow)(contents)

  // User-Agent spoofing
  const chromeUA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36'
  contents.setUserAgent(chromeUA)
  contents.session.setUserAgent(chromeUA, 'zh-CN,zh;q=0.9,en;q=0.8')

  // Window open handler — intercept new tabs
  contents.setWindowOpenHandler(({ url }) => {
    if (url === 'about:blank') {
      return { action: 'allow', overrideBrowserWindowOptions: { show: false } }
    }
    if (url.startsWith('http://') || url.startsWith('https://')) {
      const sourceUrl = contents.getURL()
      let siteId = ''
      if (sourceUrl.includes('runninghub.cn')) siteId = 'runninghub'
      else if (sourceUrl.includes('liblib.tv')) siteId = 'liblib'
      else if (sourceUrl.includes('tapnow.ai')) siteId = 'tapnow'
      else if (sourceUrl.includes('chatgpt.com')) siteId = 'chatgpt'
      else if (sourceUrl.includes('github.com')) siteId = 'github'
      else if (sourceUrl.includes('gemini.google.com')) siteId = 'gemini'
      else if (sourceUrl.includes('bigmodel.cn')) siteId = 'bigmodel'
      else if (sourceUrl.includes('kimi.com')) siteId = 'kimi'
      else if (sourceUrl.includes('deepseek.com')) siteId = 'deepseek'
      else if (sourceUrl.includes('minimaxi.com')) siteId = 'minimaxi'
      else if (sourceUrl.includes('siliconflow.cn')) siteId = 'siliconflow'
      else if (sourceUrl.includes('aliyun.com')) siteId = 'bailian'
      else if (sourceUrl.includes('tavily.com')) siteId = 'tavily'
      else if (sourceUrl.includes('bewild.ai')) siteId = 'bewild'
      else if (sourceUrl.includes('juzixp.com')) siteId = 'juzixp'
      else if (sourceUrl.includes('9981store.com')) siteId = 'store9981'
      else if (sourceUrl.includes('skyun.top')) siteId = 'skyun'
      else if (sourceUrl.includes('mitce.net')) siteId = 'mitce'
      else if (sourceUrl.includes('cephalon.cloud')) siteId = 'duannao'
      else if (sourceUrl.includes('aigate.cc')) siteId = 'zhisuan'
      else if (sourceUrl.includes('onethingai.com')) siteId = 'onethingai'

      if (siteId) {
        mainWindow?.webContents.send('new-tab', { url, siteId })
      }
    }
    return { action: 'deny' }
  })

  // Right-click context menu
  contents.on('context-menu', (_event, params) => {
    const selection = (params.selectionText || '').trim()
    if (!selection) return

    const sourceUrl = contents.getURL()
    const { Menu, clipboard } = require('electron')
    const menu = Menu.buildFromTemplate([
      {
        label: '复制文本',
        accelerator: 'CmdOrCtrl+C',
        click: () => {
          clipboard.writeText(selection)
        },
      },
      {
        label: '搜索选中内容',
        click: () => {
          mainWindow?.webContents.send('context-menu:search', { text: selection })
        },
      },
      {
        label: '翻译',
        click: () => {
          mainWindow?.webContents.send('context-menu:translate', { text: selection })
        },
      },
      { type: 'separator' },
      {
        label: '发给智能体',
        click: () => {
          mainWindow?.webContents.send('context-menu:send-to-agent', {
            text: selection,
            sourceUrl,
          })
        },
      },
    ])
    menu.popup()
  })
})

// ===== App Lifecycle =====
app.whenReady().then(() => {
  // Restore saved theme
  const savedTheme = readConfigSync('theme')
  if (savedTheme === 'dark' || savedTheme === 'light' || savedTheme === 'system') {
    const { nativeTheme } = require('electron')
    nativeTheme.themeSource = savedTheme
  }

  createWindow()

  // Restore close-to-tray on startup
  const savedCloseToTray = readConfigSync('closeToTray')
  if (savedCloseToTray && toolsRef) {
    // Trigger tray setup via IPC
    mainWindow?.webContents.on('did-finish-load', () => {
      mainWindow?.webContents.send('restore-close-to-tray', true)
    })
  }

  if (mainWindow) {
    registerUpdateIPC(mainWindow)
    checkForUpdates(mainWindow)
  }
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow()
  else mainWindow?.show()
})

app.on('will-quit', () => {
  globalShortcut.unregisterAll()
})
