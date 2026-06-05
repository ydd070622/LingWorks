import { app, BrowserWindow, ipcMain, dialog, Menu, shell, net, nativeTheme } from 'electron'
import * as path from 'path'
import * as fs from 'fs'

app.commandLine.appendSwitch('disable-gpu-sandbox')
app.commandLine.appendSwitch('disable-software-rasterizer')
app.commandLine.appendSwitch('disable-features', 'WebDriver')

const isDev = !app.isPackaged
Menu.setApplicationMenu(null)

let mainWindow: BrowserWindow | null = null
const downloadItems = new Map<string, Electron.DownloadItem>()

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

ipcMain.handle('set-theme-source', async (_e, source: string) => {
  if (source === 'dark' || source === 'light' || source === 'system') {
    nativeTheme.themeSource = source
  }
})

ipcMain.handle('get-desktop-path', () => app.getPath('desktop'))

ipcMain.handle('select-folder', async (_e, defaultPath: string) => {
  const result = await dialog.showOpenDialog(mainWindow!, {
    defaultPath: defaultPath || app.getPath('desktop'),
    properties: ['openDirectory'],
  })
  return result.canceled ? null : result.filePaths[0]
})

ipcMain.handle('cancel-download', async (_e, id: string) => {
  const item = downloadItems.get(id)
  if (item) { item.cancel(); downloadItems.delete(id) }
})

ipcMain.handle('shell-open-path', async (_e, p: string) => {
  shell.openPath(p)
})

ipcMain.handle('shell-show-item', async (_e, p: string) => {
  shell.showItemInFolder(p)
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
    const data = await res.json() as { tag_name?: string; body?: string; assets?: { browser_download_url?: string }[] }
    const remoteVersion = (data.tag_name || '').replace(/^v/, '')
    const localVersion = app.getVersion()
    if (!remoteVersion || !compareVersions(localVersion, remoteVersion)) return

    const downloadUrl = data.assets?.[0]?.browser_download_url
    if (!downloadUrl) return

    const result = await dialog.showMessageBox(mainWindow!, {
      type: 'info',
      title: '发现新版本',
      message: `发现新版本 v${remoteVersion}（当前 v${localVersion}）`,
      detail: data.body || '',
      buttons: ['立即更新', '以后再说'],
      defaultId: 0,
      cancelId: 1,
    })
    if (result.response !== 0) return

    const tmpDir = app.getPath('temp')
    const fileName = `AI Web Tools Setup ${remoteVersion}.exe`
    const filePath = path.join(tmpDir, fileName)

    const downloadWin = new BrowserWindow({
      width: 400,
      height: 150,
      resizable: false,
      parent: mainWindow!,
      modal: false,
      webPreferences: { nodeIntegration: true, contextIsolation: false },
    })
    const html = `<!DOCTYPE html><html><body style="background:#1e1e2e;color:#e8e8ed;font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;flex-direction:column;gap:12px"><h3 style="margin:0;font-size:16px">正在下载更新...</h3><progress id="bar" value="0" max="100" style="width:300px;height:16px;border-radius:8px"></progress><span id="percent" style="font-size:13px;color:#888">0%</span></body></html>`
    downloadWin.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`)
    downloadWin.setTitle('更新下载')

    const dlRes = await net.fetch(downloadUrl)
    if (!dlRes.ok || !dlRes.body) {
      downloadWin.close()
      return
    }

    const total = Number(dlRes.headers.get('content-length') || 0)
    let downloaded = 0
    const reader = (dlRes.body as any).getReader()
    const chunks: Buffer[] = []

    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      chunks.push(Buffer.from(value))
      downloaded += value.length
      if (total > 0) {
        const pct = Math.round((downloaded / total) * 100)
        downloadWin.webContents.executeJavaScript(`
          document.getElementById('bar').value=${pct}; document.getElementById('percent').textContent='${pct}%';
        `).catch(() => {})
      }
    }

    fs.writeFileSync(filePath, Buffer.concat(chunks))
    downloadWin.close()

    const installResult = await dialog.showMessageBox(mainWindow!, {
      type: 'info',
      title: '下载完成',
      message: '更新已下载完成，是否立即安装？',
      detail: '安装时将自动关闭当前程序',
      buttons: ['立即安装', '以后再说'],
      defaultId: 0,
      cancelId: 1,
    })
    if (installResult.response === 0) {
      shell.openPath(filePath)
      setTimeout(() => app.quit(), 500)
    }
  } catch {}
}

function getDownloadPath(): string {
  const p = path.join(app.getPath('userData'), 'config.json')
  try {
    if (fs.existsSync(p)) {
      const data = JSON.parse(fs.readFileSync(p, 'utf-8'))
      if (data.downloadPath && fs.existsSync(data.downloadPath)) {
        return data.downloadPath
      }
    }
  } catch {}
  return app.getPath('desktop')
}

app.whenReady().then(() => {
  try {
    const p = path.join(app.getPath('userData'), 'config.json')
    if (fs.existsSync(p)) {
      const data = JSON.parse(fs.readFileSync(p, 'utf-8'))
      if (data.theme === 'dark' || data.theme === 'light') {
        nativeTheme.themeSource = data.theme
      }
    }
  } catch {}
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

  contents.session.on('will-download', (_event, item) => {
    const name = item.getFilename()
    // deduplicate: check if same filename already downloading
    for (const [, dl] of downloadItems) {
      if (dl.getFilename() === name && dl.getState() === 'progressing') {
        item.cancel()
        return
      }
    }

    const dir = getDownloadPath()
    let filePath = path.join(dir, name)
    let counter = 1
    const ext = path.extname(name)
    const base = path.basename(name, ext)
    while (fs.existsSync(filePath)) {
      filePath = path.join(dir, `${base} (${counter})${ext}`)
      counter++
    }
    item.setSavePath(filePath)

    const dlId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    downloadItems.set(dlId, item)

    mainWindow?.webContents.send('download-started', {
      id: dlId,
      filename: name,
      totalBytes: item.getTotalBytes(),
      receivedBytes: 0,
      state: 'progress',
    })

    item.on('updated', () => {
      mainWindow?.webContents.send('download-progress', {
        id: dlId,
        receivedBytes: item.getReceivedBytes(),
        totalBytes: item.getTotalBytes(),
      })
    })

    item.on('done', (_event, state) => {
      downloadItems.delete(dlId)
      if (state === 'completed') {
        mainWindow?.webContents.send('download-completed', { id: dlId, filePath })
      } else {
        mainWindow?.webContents.send('download-failed', { id: dlId })
      }
    })
  })

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
