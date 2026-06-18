/**
 * Xiaohongshu Notes Sync IPC Handler
 * Spawns Python scraper process, captures JSON output, returns to renderer
 */
import { ipcMain } from 'electron'
import { spawn } from 'child_process'
import * as path from 'path'

function getPythonDir(): string {
  const isDev = !require('electron').app.isPackaged
  if (isDev) {
    return path.join(__dirname, '..', 'python')
  }
  return path.join(process.resourcesPath, '..', 'python')
}

function getSyncScript(): string {
  return path.join(getPythonDir(), 'sync_notes.py')
}

export function registerXHSSync() {
  ipcMain.handle('sync-xhs-notes', async () => {
    return new Promise<{ success: boolean; notes: any[]; message: string; account?: any }>((resolve) => {
      const scriptPath = getSyncScript()
      const pythonCmd = process.platform === 'win32' ? 'python' : 'python3'

      console.log(`[xhs-sync] Starting: ${pythonCmd} ${scriptPath}`)

      const proc = spawn(pythonCmd, [scriptPath, '--headless'], {
        cwd: getPythonDir(),
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
        console.error(`[xhs-sync] Failed to spawn: ${err.message}`)
        resolve({
          success: false,
          notes: [],
          message: `无法启动 Python (${err.message})。请确认 Python 已安装且在 PATH 中。`,
        })
      })
    })
  })
}
