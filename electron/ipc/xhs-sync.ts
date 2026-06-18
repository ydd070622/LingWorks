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

function getSyncScript(): string {
  const candidates: string[] = []

  // Dev mode: __dirname is dist-electron/ipc, project root is two levels up
  candidates.push(path.join(__dirname, '..', '..', 'python', 'sync_notes.py'))

  // Packaged app: asar.unpacked
  try {
    const { app } = require('electron')
    if (app.isPackaged) {
      candidates.push(path.join(process.resourcesPath, 'app.asar.unpacked', 'python', 'sync_notes.py'))
    }
  } catch {}

  // Fallback: original xhs-monitor path
  candidates.push(path.join(process.env.USERPROFILE || 'C:\\Users\\' + (process.env.USERNAME || ''), 'Desktop', 'xhs-monitor', 'sync_notes.py'))

  for (const p of candidates) {
    if (fs.existsSync(p)) {
      return p
    }
  }

  // Return first candidate for error message
  return candidates[0]
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

      const scriptDir = path.dirname(scriptPath)
      console.log(`[xhs-sync] CWD: ${scriptDir}`)

      const proc = spawn(pythonExe, [scriptPath, '--headless'], {
        cwd: scriptDir,
        env: { ...process.env, PYTHONIOENCODING: 'utf-8' },
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
        console.error(`[xhs-sync] Failed: ${err.message}`)
        console.error(`[xhs-sync] Tried: ${pythonExe} "${scriptPath}"`)
        resolve({
          success: false,
          notes: [],
          message: `同步失败: ${err.message}`,
        })
      })
    })
  })
}
