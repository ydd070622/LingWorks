/**
 * Electron Main Process — entry point, window creation, webview management
 */
import { app, BrowserWindow, Menu, globalShortcut, shell, session, ipcMain } from 'electron'
import * as path from 'path'

// IPC modules
import { registerStore, readConfigSync } from './ipc/store'
import { registerSearch } from './ipc/search'
import { registerAuth } from './ipc/auth'
import { registerDownload, attachWebviewDownloads, registerWebviewSessionIPC } from './ipc/download'
import { registerTools } from './ipc/tools'
import { registerTranslate } from './ipc/translate'
import { registerWeChatBot } from './ipc/wechat-bot'

// Agent tool IPC handlers (web_fetch, file_*)
import './tool-handlers'

// Feishu CLI IPC handlers
import './ipc/feishu'

// CRM Sync (GitHub Gist)
import { registerSync } from './ipc/sync'

// Auto-updater
import { checkForUpdates, registerUpdateIPC } from './updater'

// ===== App Configuration =====
app.commandLine.appendSwitch('disable-gpu-sandbox')
app.commandLine.appendSwitch('disable-features', 'WebDriver')
app.commandLine.appendSwitch('disable-blink-features', 'AutomationControlled')

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
  registerWeChatBot()
  registerSync()

  // Download management
  const { activeDownloads, trackSession } = registerDownload(mainWindow)

  // Download handlers for webview persistent sessions are registered lazily via
  // registerWebviewSessionIPC — the renderer calls it on did-attach (when partition
  // is guaranteed to be applied). Pre-registration removed to speed up startup.
  registerWebviewSessionIPC(mainWindow)

  // Clear cookies/storage for a specific partition (used before login to avoid stale state)
  ipcMain.handle('clear-partition-cookies', async (_e, partition: string) => {
    try {
      const sess = session.fromPartition(`persist:${partition}`)
      await sess.clearStorageData({ storages: ['cookies', 'localstorage'] })
      return true
    } catch (err: any) {
      console.error('[clear-partition-cookies]', err.message)
      return false
    }
  })

  // Inject webview preload to spoof Chrome detection for Google sign-in
  const webviewPreload = path.join(__dirname, 'webview-preload.js')
  mainWindow.webContents.on('will-attach-webview', (_event, webPreferences) => {
    webPreferences.preload = webviewPreload
    webPreferences.contextIsolation = false
    webPreferences.nodeIntegration = false
  })

  // Inject sec-ch-ua headers for main window requests too
  const secChUaHeaders = (details: any, callback: any) => {
    details.requestHeaders['sec-ch-ua'] = '"Chromium";v="130", "Not)A;Brand";v="99", "Google Chrome";v="130"'
    details.requestHeaders['sec-ch-ua-platform'] = '"Windows"'
    details.requestHeaders['sec-ch-ua-mobile'] = '?0'
    details.requestHeaders['sec-ch-ua-arch'] = '"x86"'
    details.requestHeaders['sec-ch-ua-bitness'] = '"64"'
    details.requestHeaders['sec-ch-ua-full-version'] = '"130.0.6723.44"'
    details.requestHeaders['sec-ch-ua-full-version-list'] = '"Chromium";v="130.0.6723.44", "Not)A;Brand";v="99.0.0.0", "Google Chrome";v="130.0.6723.44"'
    details.requestHeaders['sec-ch-ua-model'] = '""'
    details.requestHeaders['sec-ch-ua-platform-version'] = '"10.0.0"'
    callback({ requestHeaders: details.requestHeaders })
  }
  mainWindow.webContents.session.webRequest.onBeforeSendHeaders(
    { urls: ['*://*/*'] },
    secChUaHeaders
  )

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
          // Don't close XiaoHongShu login/OAuth popups — they need to complete the auth flow
          const isXHSPopup = url.includes('xiaohongshu.com') || url.includes('xhscdn.com')
          const hostId = (contents as any).hostWebContents?.id
          if (!isXHSPopup) {
            mainWindow?.webContents.send('popup-navigate', { url, hostWebContentsId: hostId })
            const win = BrowserWindow.fromWebContents(contents)
            if (win) win.close()
          }
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

  // Inject sec-ch-ua Client Hints headers (Google browser detection)
  contents.session.webRequest.onBeforeSendHeaders(
    { urls: ['*://*/*'] },
    (details, callback) => {
      details.requestHeaders['sec-ch-ua'] = '"Chromium";v="130", "Not)A;Brand";v="99", "Google Chrome";v="130"'
      details.requestHeaders['sec-ch-ua-platform'] = '"Windows"'
      details.requestHeaders['sec-ch-ua-mobile'] = '?0'
      details.requestHeaders['sec-ch-ua-arch'] = '"x86"'
      details.requestHeaders['sec-ch-ua-bitness'] = '"64"'
      details.requestHeaders['sec-ch-ua-full-version'] = '"130.0.6723.44"'
      details.requestHeaders['sec-ch-ua-full-version-list'] = '"Chromium";v="130.0.6723.44", "Not)A;Brand";v="99.0.0.0", "Google Chrome";v="130.0.6723.44"'
      details.requestHeaders['sec-ch-ua-model'] = '""'
      details.requestHeaders['sec-ch-ua-platform-version'] = '"10.0.0"'
      callback({ requestHeaders: details.requestHeaders })
    }
  )

  // Attach webview download handler
  attachWebviewDownloads(mainWindow)(contents)

  // Ensure session accepts all cookies (fixes cross-domain auth cookie issues)
  contents.session.setPermissionRequestHandler((_wc, permission, callback) => {
    callback(true)
  })

  // User-Agent spoofing (match Chromium 130 on Windows)
  const chromeUA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.6723.44 Safari/537.36'
  contents.setUserAgent(chromeUA)
  contents.session.setUserAgent(chromeUA, 'zh-CN,zh;q=0.9,en;q=0.8')

  // Inject preload to spoof Chrome detection checks
  contents.session.setPreloads([path.join(__dirname, 'webview-preload.js')])

  // Window open handler — intercept new tabs
  contents.setWindowOpenHandler(({ url }) => {
    if (url === 'about:blank') {
      return { action: 'allow', overrideBrowserWindowOptions: { show: false } }
    }

    // Allow popups for XiaoHongShu login/OAuth flows (QR scan, token exchange)
    const sourceUrl = contents.getURL()
    const isXHS = sourceUrl.includes('xiaohongshu.com') || sourceUrl.includes('xhscdn.com')
    if (isXHS && url.startsWith('http')) {
      // Cross-subdomain navigation (e.g. ad.xhs → business.xhs) → open as new tab
      if (url.includes('xiaohongshu.com') && !url.includes(new URL(sourceUrl).hostname)) {
        mainWindow?.webContents.send('xhs-new-tab', { url })
        return { action: 'deny' }
      }
      return { action: 'allow' }
    }

    if (url.startsWith('http://') || url.startsWith('https://')) {
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
  app.setName('LingWorks')  // 设置对话框标题显示名称
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
