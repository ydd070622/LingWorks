import { app, BrowserWindow, ipcMain, dialog, Menu, shell, net } from 'electron'
import * as path from 'path'
import * as fs from 'fs'

app.commandLine.appendSwitch('disable-gpu-sandbox')
app.commandLine.appendSwitch('disable-software-rasterizer')
app.commandLine.appendSwitch('disable-features', 'WebDriver')

const isDev = !app.isPackaged
Menu.setApplicationMenu(null)

let mainWindow: BrowserWindow | null = null

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1000,
    minHeight: 700,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      webviewTag: true,
      webSecurity: false,
      nodeIntegration: true,
      contextIsolation: false,
      sandbox: false,
    },
    backgroundColor: '#0a0a0f',
    icon: path.join(__dirname, isDev ? '../public/app-icon.ico' : '../dist/app-icon.ico'),
  })

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173')
    mainWindow.webContents.openDevTools()
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'))
  }
}

ipcMain.handle('store-get', (_e, key: string) => {
  try {
    const p = path.join(app.getPath('userData'), 'config.json')
    if (!fs.existsSync(p)) return null
    const data = JSON.parse(fs.readFileSync(p, 'utf-8'))
    return data[key] ?? null
  } catch { return null }
})

ipcMain.handle('store-set', (_e, key: string, value: any) => {
  const p = path.join(app.getPath('userData'), 'config.json')
  let data: Record<string, any> = {}
  try {
    if (fs.existsSync(p)) data = JSON.parse(fs.readFileSync(p, 'utf-8'))
  } catch {}
  data[key] = value
  fs.writeFileSync(p, JSON.stringify(data, null, 2))
})

ipcMain.handle('store-delete', (_e, key: string) => {
  const p = path.join(app.getPath('userData'), 'config.json')
  try {
    if (!fs.existsSync(p)) return
    const data = JSON.parse(fs.readFileSync(p, 'utf-8'))
    delete data[key]
    fs.writeFileSync(p, JSON.stringify(data, null, 2))
  } catch {}
})

ipcMain.handle('store-clear', () => {
  const p = path.join(app.getPath('userData'), 'config.json')
  fs.writeFileSync(p, JSON.stringify({}))
})

ipcMain.handle('save-image', async (_e, dataUrl: string, defaultName: string) => {
  const result = await dialog.showSaveDialog(mainWindow!, {
    defaultPath: defaultName,
    filters: [{ name: 'Images', extensions: ['png', 'jpg', 'webp'] }],
  })
  if (result.canceled || !result.filePath) return
  const base64 = dataUrl.replace(/^data:image\/\w+;base64,/, '')
  fs.writeFileSync(result.filePath, Buffer.from(base64, 'base64'))
})

ipcMain.handle('open-image-window', async (_e, url: string) => {
  const win = new BrowserWindow({
    width: 800,
    height: 800,
    webPreferences: { webSecurity: false },
  })
  win.loadURL(url)
})

ipcMain.handle('open-external', async (_e, url: string) => {
  await shell.openExternal(url)
})

function compareVersions(local: string, remote: string): boolean {
  const l = local.split('.').map(Number)
  const r = remote.split('.').map(Number)
  for (let i = 0; i < 3; i++) {
    if ((r[i] || 0) > (l[i] || 0)) return true
    if ((r[i] || 0) < (l[i] || 0)) return false
  }
  return false
}

async function checkForUpdates() {
  try {
    const res = await net.fetch('https://gitee.com/api/v5/repos/ydd070622/ai-web-tools/releases/latest')
    if (!res.ok) return
    const data = await res.json()
    const remoteVersion = (data.tag_name || '').replace(/^v/, '')
    const localVersion = app.getVersion()
    if (!remoteVersion || !compareVersions(localVersion, remoteVersion)) return

    const result = await dialog.showMessageBox(mainWindow!, {
      type: 'info',
      title: '发现新版本',
      message: `发现新版本 v${remoteVersion}（当前 v${localVersion}）`,
      detail: data.body || '',
      buttons: ['前往下载', '以后再说'],
      defaultId: 0,
      cancelId: 1,
    })
    if (result.response === 0) {
      const downloadUrl = data.assets?.[0]?.browser_download_url
        || `https://gitee.com/ydd070622/ai-web-tools/releases/tag/${data.tag_name}`
      shell.openExternal(downloadUrl)
    }
  } catch {}
}

app.whenReady().then(() => {
  createWindow()
  checkForUpdates()
})

app.on('web-contents-created', (_e, contents) => {
  const type = contents.getType()
  if (type !== 'webview') {
    if (type === 'window') {
      contents.on('will-navigate', (_ev, url) => {
        if (url.startsWith('http://') || url.startsWith('https://')) {
          mainWindow?.webContents.send('popup-navigate', { url })
          const win = BrowserWindow.fromWebContents(contents)
          if (win) win.close()
        }
      })
    }
    return
  }

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

  const chromeUA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36'
  contents.setUserAgent(chromeUA)
  contents.session.setUserAgent(chromeUA, 'zh-CN,zh;q=0.9,en;q=0.8')

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

      if (siteId) {
        mainWindow?.webContents.send('new-tab', { url, siteId })
      }
    }
    return { action: 'deny' }
  })
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow()
})
