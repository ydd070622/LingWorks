/**
 * Xiaohongshu Notes Sync IPC Handler
 * Reads CSV data exported by xhs-monitor, returns parsed notes to renderer.
 * No Python spawn — just reads the CSV file that xhs-monitor already produces.
 */
import { ipcMain } from 'electron'
import * as path from 'path'
import * as fs from 'fs'

interface CSVNote {
  title: string
  publish_date: string
  views: number
  likes: number
  collects: number
  comments: number
  shares: number
}

function getCSVPath(): string {
  const candidates: string[] = []

  // 1. xhs-monitor on Desktop
  candidates.push(
    path.join(process.env.USERPROFILE || `C:\\Users\\${process.env.USERNAME || ''}`, 'Desktop', 'xhs-monitor', 'data', 'notes.csv'),
  )

  // 2. LingWorks project python/ directory (dev mode)
  candidates.push(
    path.join(__dirname, '..', '..', 'python', 'data', 'notes.csv'),
  )

  for (const p of candidates) {
    if (fs.existsSync(p)) return p
  }

  return candidates[0] // return first for error message
}

function parseCSV(content: string): CSVNote[] {
  const lines = content.trim().split('\n')
  if (lines.length < 2) return []

  // Header: 采集时间,笔记ID,标题,类型,发布时间,曝光量,阅读量,点赞,收藏,评论,分享
  const header = lines[0]
  const titleIdx = header.split(',').findIndex(h => h.trim() === '标题')
  const dateIdx = header.split(',').findIndex(h => h.trim() === '发布时间')
  const exposureIdx = header.split(',').findIndex(h => h.trim() === '曝光量')
  const likesIdx = header.split(',').findIndex(h => h.trim() === '点赞')
  const collectsIdx = header.split(',').findIndex(h => h.trim() === '收藏')
  const commentsIdx = header.split(',').findIndex(h => h.trim() === '评论')
  const sharesIdx = header.split(',').findIndex(h => h.trim() === '分享')

  // Get latest record per title (last in CSV = most recent)
  const noteMap = new Map<string, CSVNote>()
  for (let i = 1; i < lines.length; i++) {
    const cols = parseCSVLine(lines[i])
    const title = cols[titleIdx] || ''
    if (!title.trim()) continue

    noteMap.set(title, {
      title,
      publish_date: dateIdx >= 0 ? (cols[dateIdx] || '') : '',
      views: exposureIdx >= 0 ? (parseInt(cols[exposureIdx]) || 0) : 0,
      likes: likesIdx >= 0 ? (parseInt(cols[likesIdx]) || 0) : 0,
      collects: collectsIdx >= 0 ? (parseInt(cols[collectsIdx]) || 0) : 0,
      comments: commentsIdx >= 0 ? (parseInt(cols[commentsIdx]) || 0) : 0,
      shares: sharesIdx >= 0 ? (parseInt(cols[sharesIdx]) || 0) : 0,
    })
  }

  return Array.from(noteMap.values())
}

function parseCSVLine(line: string): string[] {
  const result: string[] = []
  let current = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '"') {
      inQuotes = !inQuotes
    } else if (ch === ',' && !inQuotes) {
      result.push(current.trim())
      current = ''
    } else {
      current += ch
    }
  }
  result.push(current.trim())
  return result
}

export function registerXHSSync() {
  ipcMain.handle('sync-xhs-notes', async () => {
    const csvPath = getCSVPath()

    if (!fs.existsSync(csvPath)) {
      return {
        success: false,
        notes: [],
        message: `未找到笔记数据文件。请先运行 xhs-monitor 采集数据。\n\n预期路径: ${csvPath}`,
      }
    }

    try {
      const content = fs.readFileSync(csvPath, 'utf-8')
      const notes = parseCSV(content)

      if (notes.length === 0) {
        return { success: true, notes: [], message: 'CSV 中暂无笔记数据' }
      }

      return {
        success: true,
        notes,
        message: `从 CSV 读取 ${notes.length} 条笔记`,
      }
    } catch (err: any) {
      return {
        success: false,
        notes: [],
        message: `读取 CSV 失败: ${err.message}`,
      }
    }
  })
}
