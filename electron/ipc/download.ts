/**
 * Download IPC — cancel-download handler + webview download management
 */
import { ipcMain, app, BrowserWindow } from 'electron'
import * as path from 'path'
import * as fs from 'fs'

const downloadItems = new Map<string, Electron.DownloadItem>()

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

export function registerDownload(mainWindow: BrowserWindow | null) {
  ipcMain.handle('cancel-download', async (_e, id: string) => {
    const item = downloadItems.get(id)
    if (item) { item.cancel(); downloadItems.delete(id) }
  })

  // Track active downloads across webviews and main window sessions
  const activeDownloads = new Set<string>()
  const trackedSessions = new WeakSet<Electron.Session>()

  const trackSession = (sess: Electron.Session) => {
    if (trackedSessions.has(sess)) return
    trackedSessions.add(sess)
    sess.on('will-download', (_e, item) => {
      const id = `${Date.now()}-${Math.random()}`
      activeDownloads.add(id)
      item.once('done', () => activeDownloads.delete(id))
    })
  }

  // Track main window session
  if (mainWindow) {
    trackSession(mainWindow.webContents.session)
  }

  return { activeDownloads, trackSession }
}

/**
 * Attach webview download handling to a webContents.
 * Called from web-contents-created event for webview types.
 */
export function attachWebviewDownloads(mainWindow: BrowserWindow | null) {
  return (contents: Electron.WebContents) => {
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
  }
}
