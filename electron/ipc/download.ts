/**
 * Download IPC — cancel-download handler + webview download management
 */
import { ipcMain, app, BrowserWindow, session, webContents } from 'electron'
import * as path from 'path'
import * as fs from 'fs'

const downloadItems = new Map<string, Electron.DownloadItem>()
const activeFetches = new Set<string>()

// All known site IDs that use persistent partition in webviews
const KNOWN_PARTITIONS = [
  'liblib','runninghub','tapnow','chatgpt','github','gemini',
  'xhs_juguang','duannao','zhisuan','onethingai','skyun','mitce',
]

// Track which sessions already have download handlers
const handledSessions = new WeakSet<Electron.Session>()

/** Pre-register download handlers on all known persistent partitions */
export function registerAllPartitions(mainWindow: BrowserWindow | null) {
  console.log('[download] registerAllPartitions: registering on', KNOWN_PARTITIONS.length, 'partitions')
  for (const pid of KNOWN_PARTITIONS) {
    try {
      const sess = session.fromPartition(`persist:${pid}`)
      attachDownloadHandler(sess, mainWindow)
      console.log('[download] registerAllPartitions: OK persist:' + pid)
    } catch (e: any) {
      console.error('[download] registerAllPartitions: FAIL persist:' + pid, e.message)
    }
  }
}

/** IPC handler: renderer can request download handler registration for a specific webContents */
export function registerWebviewSessionIPC(mainWindow: BrowserWindow | null) {
  ipcMain.handle('register-webview-session', async (_e, wcId: number) => {
    try {
      const wc = webContents.fromId(wcId)
      if (!wc) { console.warn('[download] register-webview-session: webContents not found for id', wcId); return false }
      const sess = wc.session
      if (handledSessions.has(sess)) return true // already registered
      attachDownloadHandler(sess, mainWindow)
      console.log('[download] register-webview-session: OK wcId=' + wcId)
      return true
    } catch (e: any) {
      console.error('[download] register-webview-session: ERROR', e.message)
      return false
    }
  })
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
 * Register will-download handler on a given Electron Session.
 * Works for both main window session and persistent webview partitions.
 */
function attachDownloadHandler(sess: Electron.Session, mainWindow: BrowserWindow | null) {
  if (handledSessions.has(sess)) return
  handledSessions.add(sess)
  console.log('[download] attachDownloadHandler: registering will-download on session')

  sess.on('will-download', async (event, item) => {
    event.preventDefault()
    const name = item.getFilename()
    const url = item.getURL()
    const totalBytes = item.getTotalBytes()
    console.log('[download] will-download FIRED:', name)

    // Synchronous URL lock prevents double-fetch when webview re-triggers
    if (activeFetches.has(url)) {
      console.log('[download] DEDUP skip (already fetching):', url)
      return
    }
    activeFetches.add(url)

    // Resolve save path (with dedup)
    const dir = getDownloadPath()
    let filePath = path.join(dir, name)
    let counter = 1
    const ext = path.extname(name)
    const base = path.basename(name, ext)
    while (fs.existsSync(filePath)) {
      filePath = path.join(dir, `${base} (${counter})${ext}`)
      counter++
    }

    const dlId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

    mainWindow?.webContents.send('download-started', {
      id: dlId,
      filename: name,
      totalBytes,
      receivedBytes: 0,
      state: 'progress',
    })

    try {
      console.log('[download] fetch via session:', url)
      const response = await sess.fetch(url)

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`)
      }

      const cl = response.headers.get('content-length')
      const contentLength = cl ? parseInt(cl, 10) : totalBytes
      const body = response.body

      if (body) {
        const reader = body.getReader()
        const writeStream = fs.createWriteStream(filePath)
        let received = 0

        try {
          while (true) {
            const { done, value } = await reader.read()
            if (done) break
            received += value.length
            writeStream.write(Buffer.from(value))

            const total = contentLength > 0 ? contentLength : received
            mainWindow?.webContents.send('download-progress', {
              id: dlId,
              receivedBytes: received,
              totalBytes: total,
            })
          }
        } finally {
          writeStream.end()
        }

        await new Promise<void>((resolve, reject) => {
          writeStream.on('finish', resolve)
          writeStream.on('error', reject)
        })
      } else {
        const buf = Buffer.from(await response.arrayBuffer())
        fs.writeFileSync(filePath, buf)
      }

      console.log('[download] saved:', filePath)
      mainWindow?.webContents.send('download-completed', { id: dlId, filePath })
    } catch (e: any) {
      console.error('[download] fetch failed:', e.message)
      mainWindow?.webContents.send('download-failed', { id: dlId })
    } finally {
      activeFetches.delete(url)
    }
  })
}

/**
 * Attach webview download handling to a webContents.
 * Called from web-contents-created event for webview types.
 */
export function attachWebviewDownloads(mainWindow: BrowserWindow | null) {
  return (contents: Electron.WebContents) => {
    attachDownloadHandler(contents.session, mainWindow)
  }
}
