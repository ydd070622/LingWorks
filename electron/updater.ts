/**
 * Auto-updater — check Gitee for latest release, download, and install
 */
import { app, BrowserWindow, dialog, net, shell } from 'electron'
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

export async function checkForUpdates(mainWindow: BrowserWindow) {
  try {
    const res = await net.fetch('https://gitee.com/api/v5/repos/ydd070622/ai-web-tools/releases/latest')
    if (!res.ok) return
    const data = await res.json() as { tag_name?: string; body?: string; assets?: { browser_download_url?: string }[] }
    const remoteVersion = (data.tag_name || '').replace(/^v/, '')
    const localVersion = app.getVersion()
    if (!remoteVersion || !compareVersions(localVersion, remoteVersion)) return

    const downloadUrl = data.assets?.[0]?.browser_download_url
    if (!downloadUrl) return

    const result = await dialog.showMessageBox(mainWindow, {
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
      parent: mainWindow,
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

    const installResult = await dialog.showMessageBox(mainWindow, {
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
