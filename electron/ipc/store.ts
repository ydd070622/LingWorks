/**
 * Store IPC — config.json CRUD handlers
 */
import { ipcMain, app } from 'electron'
import * as path from 'path'
import * as fs from 'fs'

function getConfigPath(): string {
  return path.join(app.getPath('userData'), 'config.json')
}

export function registerStore() {
  ipcMain.handle('store-get', (_e, key: string) => {
    try {
      const p = getConfigPath()
      if (!fs.existsSync(p)) return null
      const data = JSON.parse(fs.readFileSync(p, 'utf-8'))
      return data[key] ?? null
    } catch { return null }
  })

  ipcMain.handle('store-set', (_e, key: string, value: any) => {
    const p = getConfigPath()
    let data: Record<string, any> = {}
    try {
      if (fs.existsSync(p)) data = JSON.parse(fs.readFileSync(p, 'utf-8'))
    } catch {}
    data[key] = value
    fs.writeFileSync(p, JSON.stringify(data, null, 2))
  })

  ipcMain.handle('store-delete', (_e, key: string) => {
    const p = getConfigPath()
    try {
      if (!fs.existsSync(p)) return
      const data = JSON.parse(fs.readFileSync(p, 'utf-8'))
      delete data[key]
      fs.writeFileSync(p, JSON.stringify(data, null, 2))
    } catch {}
  })

  ipcMain.handle('store-clear', () => {
    const p = getConfigPath()
    fs.writeFileSync(p, JSON.stringify({}))
  })
}

/** Read a single key from config (sync, for use during startup) */
export function readConfigSync(key: string): any {
  try {
    const p = getConfigPath()
    if (!fs.existsSync(p)) return null
    const data = JSON.parse(fs.readFileSync(p, 'utf-8'))
    return data[key] ?? null
  } catch { return null }
}
