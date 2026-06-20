/**
 * Agent Tool IPC Handlers — run in Electron main process (Node.js native fetch, no CORS).
 * Ports & Adapters: tools are executed here, agent loop runs in renderer.
 */

import { ipcMain, shell } from 'electron'
import * as fs from 'fs'
import * as path from 'path'

const FETCH_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36'

// ===== HTML → Plain Text Extraction (DeepSeek approach, regex-only, zero deps) =====
function extractReadableText(raw: string, contentType: string): { title: string; text: string } {
  if (!contentType.includes('html') && !contentType.includes('text')) {
    return { title: '', text: normalizeWhitespace(raw) }
  }

  // Extract <title>
  const titleMatch = raw.match(/<title[^>]*>([\s\S]*?)<\/title>/i)
  const title = titleMatch ? decodeHtmlEntities(titleMatch[1].trim()) : ''

  // Remove <script> and <style> blocks
  let cleaned = raw
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<head[\s\S]*?<\/head>/gi, ' ')

  // Semantic tags → newlines
  cleaned = cleaned
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|h[1-6]|tr|article|section)>/gi, '\n')

  // All other tags → space
  cleaned = cleaned.replace(/<[^>]+>/g, ' ')

  // Decode HTML entities
  cleaned = decodeHtmlEntities(cleaned)

  // Normalize whitespace
  return { title, text: normalizeWhitespace(cleaned) }
}

function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&#x2F;/g, '/')
    .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(Number(d)))
}

function normalizeWhitespace(text: string): string {
  return text
    .replace(/[\t ]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/^[ \n]+|[ \n]+$/g, '')
}

// ===== URL Validation =====
function validateUrl(rawUrl: string): string | null {
  try {
    const url = new URL(rawUrl)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null
    return url.href
  } catch {
    return null
  }
}

// ===== IPC Handler: web_fetch =====
ipcMain.handle('web-fetch', async (_ev, url: string, maxBytes: number = 50000) => {
  const validUrl = validateUrl(url)
  if (!validUrl) return { error: '无效的 URL，仅支持 http/https' }

  try {
    console.log('[web-fetch] Fetching:', validUrl)
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 15000)

    const response = await fetch(validUrl, {
      headers: {
        'User-Agent': FETCH_UA,
        'Accept': 'text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.8',
        'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
      },
      signal: controller.signal,
      redirect: 'follow',
    })

    clearTimeout(timeout)

    if (!response.ok) {
      return { error: `HTTP ${response.status} ${response.statusText}`, url: response.url }
    }

    const contentType = response.headers.get('content-type') || ''
    const finalUrl = response.url

    // Read body (respect maxBytes)
    const text = await response.text()
    const truncated = text.length > maxBytes ? text.slice(0, maxBytes) : text

    const { title, text: extracted } = extractReadableText(truncated, contentType)

    // Further truncate extracted text
    const finalText = extracted.length > maxBytes ? extracted.slice(0, maxBytes) + '\n...(内容已截断)' : extracted

    console.log('[web-fetch] Done:', finalUrl, 'title:', title, 'textLen:', finalText.length)

    return {
      url: finalUrl,
      title: title || undefined,
      content: finalText,
    }
  } catch (e: any) {
    console.log('[web-fetch] Error:', e.message)
    return { error: e.name === 'AbortError' ? '请求超时' : e.message }
  }
})

// ===== IPC Handler: file_list =====
ipcMain.handle('file-list', async (_ev, dirPath: string) => {
  try {
    console.log('[file-list] Listing:', dirPath)
    if (!fs.existsSync(dirPath)) {
      return { error: `路径不存在: ${dirPath}` }
    }
    const stat = fs.statSync(dirPath)
    if (!stat.isDirectory()) {
      return { error: `不是目录: ${dirPath}` }
    }
    const entries = fs.readdirSync(dirPath, { withFileTypes: true })
    const items = entries.slice(0, 200).map(e => {
      try {
        const entryStat = fs.statSync(path.join(dirPath, e.name))
        return {
          name: e.name,
          isDir: e.isDirectory(),
          size: e.isFile() ? entryStat.size : undefined,
          modified: entryStat.mtime.toISOString(),
        }
      } catch {
        // Skip entries with permission errors (e.g. System Volume Information)
        return {
          name: e.name,
          isDir: e.isDirectory(),
          size: undefined,
          modified: undefined,
        }
      }
    })
    console.log('[file-list] Found', items.length, 'items')
    return {
      path: dirPath,
      count: entries.length,
      items,
    }
  } catch (e: any) {
    console.log('[file-list] Error:', e.message)
    return { error: e.message, path: dirPath }
  }
})

// ===== IPC Handler: file_read =====
ipcMain.handle('file-read', async (_ev, filePath: string, maxLines?: number) => {
  try {
    console.log('[file-read] Reading:', filePath, 'maxLines:', maxLines)
    if (!fs.existsSync(filePath)) {
      return { error: `文件不存在: ${filePath}` }
    }
    const stat = fs.statSync(filePath)
    const sizeKB = (stat.size / 1024).toFixed(1)
    
    // Limit to 2MB for safety
    if (stat.size > 2 * 1024 * 1024) {
      return { error: `文件过大 (${sizeKB}KB)，超过 2MB 限制`, path: filePath }
    }
    
    let content = fs.readFileSync(filePath, 'utf-8')
    const totalLines = content.split('\n').length
    
    if (maxLines && maxLines > 0) {
      const lines = content.split('\n')
      content = lines.slice(0, maxLines).join('\n')
    }
    
    console.log('[file-read] Done:', filePath, 'size:', sizeKB + 'KB', 'lines:', totalLines)
    return {
      path: filePath,
      size: stat.size,
      sizeKB,
      totalLines,
      content,
      truncated: maxLines ? content.split('\n').length < totalLines : false,
    }
  } catch (e: any) {
    console.log('[file-read] Error:', e.message)
    // Might be binary file
    try {
      const buffer = fs.readFileSync(filePath)
      const sizeKB = (buffer.length / 1024).toFixed(1)
      return {
        path: filePath,
        size: buffer.length,
        sizeKB,
        content: `[二进制文件，大小 ${sizeKB}KB]`,
      }
    } catch (e2: any) {
      return { error: e2.message, path: filePath }
    }
  }
})

// ===== IPC Handler: file_write =====
ipcMain.handle('file-write', async (_ev, filePath: string, content: string) => {
  try {
    console.log('[file-write] Writing:', filePath, 'size:', content.length)
    const dir = path.dirname(filePath)
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true })
    }
    fs.writeFileSync(filePath, content, 'utf-8')
    const stat = fs.statSync(filePath)
    console.log('[file-write] Done:', filePath)
    return {
      path: filePath,
      size: stat.size,
      message: `成功写入 ${content.length} 字符`,
    }
  } catch (e: any) {
    console.log('[file-write] Error:', e.message)
    return { error: e.message, path: filePath }
  }
})

// ===== IPC Handler: file_rename =====
ipcMain.handle('file-rename', async (_ev, oldPath: string, newPath: string) => {
  try {
    console.log('[file-rename] Renaming:', oldPath, '→', newPath)
    if (!fs.existsSync(oldPath)) {
      return { error: `源文件不存在: ${oldPath}` }
    }
    if (fs.existsSync(newPath)) {
      return { error: `目标文件已存在: ${newPath}` }
    }
    const dir = path.dirname(newPath)
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true })
    }
    fs.renameSync(oldPath, newPath)
    console.log('[file-rename] Done:', oldPath, '→', newPath)
    return {
      oldPath,
      newPath,
      message: `成功重命名: ${path.basename(oldPath)} → ${path.basename(newPath)}`,
    }
  } catch (e: any) {
    console.log('[file-rename] Error:', e.message)
    return { error: e.message, oldPath, newPath }
  }
})

// ===== IPC Handler: file_delete =====
ipcMain.handle('file-delete', async (_ev, filePath: string) => {
  try {
    console.log('[file-delete] Deleting:', filePath)
    if (!fs.existsSync(filePath)) {
      return { error: `文件不存在: ${filePath}` }
    }
    const stat = fs.statSync(filePath)
    if (stat.isDirectory()) {
      fs.rmSync(filePath, { recursive: true, force: true })
    } else {
      fs.unlinkSync(filePath)
    }
    console.log('[file-delete] Done:', filePath)
    return {
      path: filePath,
      message: `成功删除: ${path.basename(filePath)}`,
    }
  } catch (e: any) {
    console.log('[file-delete] Error:', e.message)
    return { error: e.message, path: filePath }
  }
})

// ===== IPC Handler: file_copy =====
ipcMain.handle('file-copy', async (_ev, srcPath: string, destPath: string) => {
  try {
    console.log('[file-copy] Copying:', srcPath, '→', destPath)
    if (!fs.existsSync(srcPath)) {
      return { error: `源文件不存在: ${srcPath}` }
    }
    if (fs.existsSync(destPath)) {
      return { error: `目标已存在: ${destPath}` }
    }
    const dir = path.dirname(destPath)
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true })
    }
    const stat = fs.statSync(srcPath)
    if (stat.isDirectory()) {
      fs.cpSync(srcPath, destPath, { recursive: true })
    } else {
      fs.copyFileSync(srcPath, destPath)
    }
    console.log('[file-copy] Done:', srcPath, '→', destPath)
    return {
      srcPath,
      destPath,
      message: `成功复制: ${path.basename(srcPath)} → ${path.basename(destPath)}`,
    }
  } catch (e: any) {
    console.log('[file-copy] Error:', e.message)
    return { error: e.message, srcPath, destPath }
  }
})

// ===== IPC Handler: file_search =====
ipcMain.handle('file-search', async (_ev, dirPath: string, pattern: string, maxResults: number = 50) => {
  try {
    console.log('[file-search] Searching:', dirPath, 'pattern:', pattern)
    if (!fs.existsSync(dirPath)) {
      return { error: `目录不存在: ${dirPath}` }
    }
    const results: Array<{ name: string; path: string; isDir: boolean; size?: number }> = []
    // Convert glob-like pattern to regex (support * and ?)
    const regexStr = pattern
      .replace(/[.+^${}()|[\]\\]/g, '\\$&')
      .replace(/\*/g, '.*')
      .replace(/\?/g, '.')
    const regex = new RegExp(regexStr, 'i')

    function searchDir(dir: string, depth: number) {
      if (depth > 5 || results.length >= maxResults) return
      try {
        const entries = fs.readdirSync(dir, { withFileTypes: true })
        for (const entry of entries) {
          if (results.length >= maxResults) return
          const fullPath = path.join(dir, entry.name)
          if (regex.test(entry.name)) {
            const item: any = { name: entry.name, path: fullPath, isDir: entry.isDirectory() }
            if (entry.isFile()) {
              try { item.size = fs.statSync(fullPath).size } catch {}
            }
            results.push(item)
          }
          if (entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== 'node_modules') {
            searchDir(fullPath, depth + 1)
          }
        }
      } catch { /* skip permission errors */ }
    }

    searchDir(dirPath, 0)
    console.log('[file-search] Found:', results.length, 'results')
    return {
      dirPath,
      pattern,
      count: results.length,
      results,
    }
  } catch (e: any) {
    console.log('[file-search] Error:', e.message)
    return { error: e.message, dirPath, pattern }
  }
})

// ===== IPC Handler: file_mkdir =====
ipcMain.handle('file-mkdir', async (_ev, dirPath: string) => {
  try {
    console.log('[file-mkdir] Creating directory:', dirPath)
    if (fs.existsSync(dirPath)) {
      return { error: `目录已存在: ${dirPath}` }
    }
    fs.mkdirSync(dirPath, { recursive: true })
    console.log('[file-mkdir] Done:', dirPath)
    return {
      path: dirPath,
      message: `成功创建目录: ${path.basename(dirPath)}`,
    }
  } catch (e: any) {
    console.log('[file-mkdir] Error:', e.message)
    return { error: e.message, path: dirPath }
  }
})

// ===== IPC Handler: file_info =====
ipcMain.handle('file-info', async (_ev, filePath: string) => {
  try {
    console.log('[file-info] Getting info:', filePath)
    if (!fs.existsSync(filePath)) {
      return { error: `文件不存在: ${filePath}` }
    }
    const stat = fs.statSync(filePath)
    const ext = path.extname(filePath).toLowerCase()
    const typeMap: Record<string, string> = {
      '.jpg': '图片', '.jpeg': '图片', '.png': '图片', '.gif': '图片', '.bmp': '图片', '.webp': '图片', '.svg': '图片',
      '.mp4': '视频', '.avi': '视频', '.mkv': '视频', '.mov': '视频', '.wmv': '视频',
      '.mp3': '音频', '.wav': '音频', '.flac': '音频', '.aac': '音频', '.ogg': '音频',
      '.pdf': 'PDF文档', '.doc': 'Word文档', '.docx': 'Word文档', '.xls': 'Excel表格', '.xlsx': 'Excel表格',
      '.ppt': 'PPT', '.pptx': 'PPT', '.txt': '文本文件', '.csv': 'CSV文件',
      '.zip': '压缩包', '.rar': '压缩包', '.7z': '压缩包', '.tar': '压缩包', '.gz': '压缩包',
      '.exe': '可执行文件', '.msi': '安装程序', '.bat': '批处理文件', '.ps1': 'PowerShell脚本',
      '.js': 'JavaScript', '.ts': 'TypeScript', '.py': 'Python', '.java': 'Java', '.html': 'HTML', '.css': 'CSS',
      '.json': 'JSON', '.xml': 'XML', '.md': 'Markdown',
    }
    const formatSize = (bytes: number) => {
      if (bytes < 1024) return bytes + ' B'
      if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
      if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
      return (bytes / (1024 * 1024 * 1024)).toFixed(2) + ' GB'
    }
    return {
      path: filePath,
      name: path.basename(filePath),
      ext,
      type: stat.isDirectory() ? '文件夹' : (typeMap[ext] || '文件'),
      isDirectory: stat.isDirectory(),
      size: stat.size,
      sizeFormatted: formatSize(stat.size),
      created: stat.birthtime.toISOString(),
      modified: stat.mtime.toISOString(),
      accessed: stat.atime.toISOString(),
    }
  } catch (e: any) {
    console.log('[file-info] Error:', e.message)
    return { error: e.message, path: filePath }
  }
})

// ===== IPC Handler: file_open =====
ipcMain.handle('file-open', async (_ev, filePath: string) => {
  try {
    console.log('[file-open] Opening:', filePath)
    if (!fs.existsSync(filePath)) {
      return { error: `文件不存在: ${filePath}` }
    }
    const err = await shell.openPath(filePath)
    if (err) {
      return { error: `打开失败: ${err}`, path: filePath }
    }
    return { path: filePath, message: `已打开: ${path.basename(filePath)}` }
  } catch (e: any) {
    console.log('[file-open] Error:', e.message)
    return { error: e.message, path: filePath }
  }
})

// ===== IPC Handler: file_show =====
ipcMain.handle('file-show', async (_ev, filePath: string) => {
  try {
    console.log('[file-show] Showing in folder:', filePath)
    if (!fs.existsSync(filePath)) {
      return { error: `文件不存在: ${filePath}` }
    }
    shell.showItemInFolder(filePath)
    return { path: filePath, message: `已在资源管理器中显示: ${path.basename(filePath)}` }
  } catch (e: any) {
    console.log('[file-show] Error:', e.message)
    return { error: e.message, path: filePath }
  }
})

// ===== IPC Handler: file_edit =====
ipcMain.handle('file-edit', async (_ev, filePath: string, search: string, replace: string) => {
  try {
    console.log('[file-edit] Editing:', filePath)
    if (!fs.existsSync(filePath)) {
      return { error: `文件不存在: ${filePath}` }
    }
    let content = fs.readFileSync(filePath, 'utf-8')
    
    if (!content.includes(search)) {
      return {
        error: `在文件中找不到匹配内容`,
        path: filePath,
        searchPreview: search.slice(0, 200),
      }
    }
    
    const newContent = content.replace(search, replace)
    fs.writeFileSync(filePath, newContent, 'utf-8')
    
    const oldLines = content.split('\n').length
    const newLines = newContent.split('\n').length
    console.log('[file-edit] Done:', filePath, `lines: ${oldLines} → ${newLines}`)
    return {
      path: filePath,
      message: `成功替换编辑（${oldLines}行 → ${newLines}行）`,
      oldLines,
      newLines,
    }
  } catch (e: any) {
    console.log('[file-edit] Error:', e.message)
    return { error: e.message, path: filePath }
  }
})
