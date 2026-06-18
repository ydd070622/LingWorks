/**
 * Auto-updater — check GitHub for latest release, download silently, notify renderer
 */
import { app, BrowserWindow, net, shell, ipcMain } from 'electron'
import * as path from 'path'
import * as fs from 'fs'

function compareVersions(local: string, remote: string): boolean {
  const l = local.split('.').map(Number)
  const r = remote.split('.').map(Number)
  for (let i = 0; i < 3; i++) {
    if ((r[i] || 0) > (l[i] || 0)) return true
    if ((r[i] || 0) < (l[i] || 0)) return false
  }
  return false
}

let downloadedFilePath: string | null = null

export async function checkForUpdates(mainWindow: BrowserWindow) {
  try {
    const res = await net.fetch('https://api.github.com/repos/ydd070622/LingWorks/releases/latest')
    if (!res.ok) return
    const data = await res.json() as { tag_name?: string; body?: string; assets?: { browser_download_url?: string }[] }
    const remoteVersion = (data.tag_name || '').replace(/^v/, '')
    const localVersion = app.getVersion()
    if (!remoteVersion || !compareVersions(localVersion, remoteVersion)) return

    const downloadUrl = data.assets?.[0]?.browser_download_url
    if (!downloadUrl) return

    // Notify renderer that update is available — starts silent download
    mainWindow.webContents.send('update-available', {
      version: remoteVersion,
      currentVersion: localVersion,
      downloadUrl,
    })

    // Auto-start silent download
    await startDownload(mainWindow, downloadUrl, remoteVersion)
  } catch {}
}

// Silent download triggered by renderer (or auto-started)
async function startDownload(mainWindow: BrowserWindow, downloadUrl: string, version: string) {
  try {
    const tmpDir = app.getPath('temp')
    const fileName = `LingWorks Setup ${version}.exe`
    const filePath = path.join(tmpDir, fileName)

    // Check if already downloaded (previous session)
    if (fs.existsSync(filePath)) {
      downloadedFilePath = filePath
      mainWindow.webContents.send('update-downloaded', { filePath, version })
      return
    }

    const dlRes = await net.fetch(downloadUrl)
    if (!dlRes.ok || !dlRes.body) {
      mainWindow.webContents.send('update-error', '下载失败')
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
        mainWindow.webContents.send('update-download-progress', { percent: pct })
      }
    }

    fs.writeFileSync(filePath, Buffer.concat(chunks))
    downloadedFilePath = filePath
    mainWindow.webContents.send('update-downloaded', { filePath, version })
  } catch {
    mainWindow.webContents.send('update-error', '下载失败')
  }
}

export function registerUpdateIPC(mainWindow: BrowserWindow) {
  ipcMain.handle('update-install', async () => {
    if (downloadedFilePath) {
      shell.openPath(downloadedFilePath)
      setTimeout(() => app.quit(), 500)
    }
  })
}
