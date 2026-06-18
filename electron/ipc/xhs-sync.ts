/**
 * Xiaohongshu Notes Sync IPC Handler
 * Spawns Python scraper process, captures JSON output, returns to renderer
 */
import { ipcMain } from 'electron'
import { spawn, execSync } from 'child_process'
import * as path from 'path'
import * as fs from 'fs'

function findPython(): string | null {
  const isWin = process.platform === 'win32'

  // Candidates in priority order
  const candidates: string[] = isWin
    ? ['python', 'python3', 'py']
    : ['python3', 'python']

  for (const cmd of candidates) {
    try {
      const result = execSync(isWin ? `where ${cmd} 2>nul` : `which ${cmd} 2>/dev/null`, {
        encoding: 'utf-8',
        timeout: 5000,
      })
      const lines = result.trim().split('\n').map(l => l.trim()).filter(Boolean)
      // Skip Microsoft Store stub (opens store, not real python)
      for (const line of lines) {
        if (line.includes('WindowsApps')) continue
        if (fs.existsSync(line)) return line
      }
    } catch {
      // Not found, try next
    }
  }

  // Fallback: check common Windows install paths
  if (isWin) {
    const localAppData = process.env.LOCALAPPDATA || ''
    const commonPaths = [
      path.join(localAppData, 'Programs', 'Python'),
      'C:\\Python313', 'C:\\Python312', 'C:\\Python311', 'C:\\Python310',
      'C:\\Program Files\\Python313', 'C:\\Program Files\\Python312',
    ]
    for (const base of commonPaths) {
      const exe = path.join(base, 'python.exe')
      if (fs.existsSync(exe)) return exe
    }
    // Check for versioned dirs under LOCALAPPDATA\Programs\Python
    if (localAppData) {
      const pythonDir = path.join(localAppData, 'Programs', 'Python')
      if (fs.existsSync(pythonDir)) {
        try {
          const dirs = fs.readdirSync(pythonDir)
          for (const d of dirs.sort().reverse()) {
            const exe = path.join(pythonDir, d, 'python.exe')
            if (fs.existsSync(exe)) return exe
          }
        } catch { /* ignore */ }
      }
    }
  }

  return null
}

function getPythonDir(): string {
  const isDev = !require('electron').app.isPackaged
  if (isDev) {
    // __dirname is dist-electron/ipc — project root is two levels up
    return path.join(__dirname, '..', '..', 'python')
  }
  // In packaged app, python/ is next to the app.asar
  return path.join(process.resourcesPath, 'app.asar.unpacked', 'python')
}

function getSyncScript(): string {
  return path.join(getPythonDir(), 'sync_notes.py')
}

export function registerXHSSync() {
  ipcMain.handle('sync-xhs-notes', async () => {
    return new Promise<{ success: boolean; notes: any[]; message: string; account?: any }>((resolve) => {
      const pythonExe = findPython()
      if (!pythonExe) {
        resolve({
          success: false,
          notes: [],
          message: '未找到 Python。请安装 Python 并确保在 PATH 中，或使用 python.org 下载安装。',
        })
        return
      }

      const scriptPath = getSyncScript()
      console.log(`[xhs-sync] Python: ${pythonExe}`)
      console.log(`[xhs-sync] Script: ${scriptPath}`)

      const proc = spawn(pythonExe, [scriptPath, '--headless'], {
        cwd: getPythonDir(),
        env: { ...process.env, PYTHONIOENCODING: 'utf-8' },
        shell: process.platform === 'win32',
      })

      let stdout = ''
      let stderr = ''

      proc.stdout.on('data', (data: Buffer) => {
        stdout += data.toString('utf-8')
      })

      proc.stderr.on('data', (data: Buffer) => {
        stderr += data.toString('utf-8')
      })

      proc.on('close', (code: number | null) => {
        console.log(`[xhs-sync] Process exited with code ${code}`)
        if (stderr) {
          console.log(`[xhs-sync] stderr: ${stderr.slice(0, 500)}`)
        }

        try {
          const result = JSON.parse(stdout.trim() || '{}')
          resolve(result)
        } catch {
          resolve({
            success: false,
            notes: [],
            message: stderr || stdout.slice(-200) || '未知错误',
          })
        }
      })

      proc.on('error', (err: Error) => {
        console.error(`[xhs-sync] Failed to spawn: ${err.message}`)
        resolve({
          success: false,
          notes: [],
          message: `无法启动 Python (${err.message})`,
        })
      })
    })
  })
}
