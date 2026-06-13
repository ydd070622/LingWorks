/**
 * Tools IPC — image ops, shell ops, window control, shortcuts, theme, history images
 */
import { ipcMain, app, BrowserWindow, dialog, shell, nativeTheme, globalShortcut } from 'electron'
import * as path from 'path'
import * as fs from 'fs'

export function registerTools(mainWindow: BrowserWindow | null) {
  // ===== History Images =====
  ipcMain.handle('save-history-image', async (_e, base64: string, id: string) => {
    const dir = path.join(app.getPath('userData'), 'history-images')
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
    const filePath = path.join(dir, `${id}.png`)
    const data = base64.replace(/^data:image\/\w+;base64,/, '')
    fs.writeFileSync(filePath, Buffer.from(data, 'base64'))
    return filePath
  })

  ipcMain.handle('read-history-image', async (_e, filePath: string) => {
    try {
      if (!fs.existsSync(filePath)) {
        console.log('[read-history-image] file not found:', filePath)
        return null
      }
      const stat = fs.statSync(filePath)
      if (stat.size === 0) {
        console.log('[read-history-image] file is empty:', filePath)
        return null
      }
      const buffer = fs.readFileSync(filePath)
      const ext = path.extname(filePath).toLowerCase().slice(1) || 'png'
      const mimeType = ext === 'jpg' ? 'image/jpeg' : `image/${ext}`
      return `data:${mimeType};base64,${buffer.toString('base64')}`
    } catch (e: any) {
      console.error('[read-history-image] error:', e.message)
      return null
    }
  })

  ipcMain.handle('delete-history-image', async (_e, filePath: string) => {
    try { if (fs.existsSync(filePath)) fs.unlinkSync(filePath) } catch {}
  })

  ipcMain.handle('get-history-image-dir', () =>
    path.join(app.getPath('userData'), 'history-images')
  )

  // Download image from URL in main process (bypasses renderer Node.js pollution)
  ipcMain.handle('download-image', async (_e, url: string) => {
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0' },
        signal: AbortSignal.timeout(60000),
      })
      if (!res.ok) {
        console.error('[download-image] HTTP error:', res.status)
        return null
      }
      const arrayBuffer = await res.arrayBuffer()
      const buffer = Buffer.from(arrayBuffer)
      const contentType = res.headers.get('content-type') || 'image/png'
      return `data:${contentType};base64,${buffer.toString('base64')}`
    } catch (e: any) {
      console.error('[download-image] error:', e.message)
      return null
    }
  })

  // ===== Image Tools =====
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

  // ===== Shell & System =====
  ipcMain.handle('open-external', async (_e, url: string) => {
    await shell.openExternal(url)
  })

  ipcMain.handle('shell-open-path', async (_e, p: string) => {
    shell.openPath(p)
  })

  ipcMain.handle('shell-show-item', async (_e, p: string) => {
    shell.showItemInFolder(p)
  })

  ipcMain.handle('get-desktop-path', () => app.getPath('desktop'))

  ipcMain.handle('select-folder', async (_e, defaultPath: string) => {
    const result = await dialog.showOpenDialog(mainWindow!, {
      defaultPath: defaultPath || app.getPath('desktop'),
      properties: ['openDirectory'],
    })
    return result.canceled ? null : result.filePaths[0]
  })

  // ===== Theme =====
  ipcMain.handle('set-theme-source', async (_e, source: string) => {
    if (source === 'dark' || source === 'light' || source === 'system') {
      nativeTheme.themeSource = source
    }
  })

  // ===== Window Control =====
  ipcMain.handle('window-minimize', () => mainWindow?.minimize())
  ipcMain.handle('window-maximize', () => {
    if (mainWindow?.isMaximized()) { mainWindow?.unmaximize() }
    else { mainWindow?.maximize() }
  })
  ipcMain.handle('window-close', () => mainWindow?.close())
  ipcMain.handle('window-is-maximized', () => mainWindow?.isMaximized() ?? false)
  ipcMain.handle('window-set-position', (_e, x: number, y: number) => {
    mainWindow?.setPosition(x, y)
  })

  // ===== Shortcuts =====
  ipcMain.handle('register-shortcuts', async (_e, bindings: Record<string, string>) => {
    globalShortcut.unregisterAll()

    // Always register DevTools shortcuts first
    globalShortcut.register('F12', () => {
      mainWindow?.webContents.toggleDevTools()
    })
    globalShortcut.register('CommandOrControl+Shift+I', () => {
      mainWindow?.webContents.toggleDevTools()
    })

    // Register user-defined shortcuts
    for (const [combo, targetId] of Object.entries(bindings)) {
      try {
        globalShortcut.register(combo, () => {
          mainWindow?.webContents.send('shortcut-trigger', targetId)
        })
      } catch (e) {
        console.error('Failed to register shortcut:', combo, e)
      }
    }
  })
}
