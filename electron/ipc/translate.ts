/**
 * Translate IPC — MyMemory (free, no key) + Google Translate fallback
 */
import { ipcMain } from 'electron'

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36'

function detectLang(text: string): { sl: string; tl: string } {
  // CJK → translate to English; otherwise → translate to Chinese
  if (/[\u4e00-\u9fff]/.test(text)) return { sl: 'zh-CN', tl: 'en' }
  // Japanese
  if (/[\u3040-\u309f\u30a0-\u30ff]/.test(text)) return { sl: 'ja', tl: 'zh-CN' }
  // Korean
  if (/[\uac00-\ud7af]/.test(text)) return { sl: 'ko', tl: 'zh-CN' }
  // Default: English → Chinese
  return { sl: 'en', tl: 'zh-CN' }
}

async function translateMyMemory(text: string): Promise<string | null> {
  try {
    const { sl, tl } = detectLang(text)
    const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=${sl}|${tl}`
    const resp = await fetch(url, {
      headers: { 'User-Agent': UA },
      signal: AbortSignal.timeout(8000),
    })
    if (!resp.ok) return null
    const data = await resp.json() as any
    if (data.responseData?.translatedText) {
      return data.responseData.translatedText
    }
    return null
  } catch {
    return null
  }
}

async function translateGoogle(text: string): Promise<string | null> {
  try {
    const { sl, tl } = detectLang(text)
    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${encodeURIComponent(sl)}&tl=${encodeURIComponent(tl)}&dt=t&q=${encodeURIComponent(text)}`
    const resp = await fetch(url, {
      headers: { 'User-Agent': UA },
      signal: AbortSignal.timeout(8000),
    })
    if (!resp.ok) return null
    const data = await resp.json() as any
    if (Array.isArray(data?.[0])) {
      return data[0].map((x: any) => x[0]).join('')
    }
    return null
  } catch {
    return null
  }
}

export function registerTranslate() {
  ipcMain.handle('translate', async (_ev, text: string) => {
    console.log('[translate] text:', text.slice(0, 80))

    // Try MyMemory first, fallback to Google
    const result = await translateMyMemory(text) ?? await translateGoogle(text)

    console.log('[translate] result:', result ? result.slice(0, 80) : 'FAILED')
    return result
  })
}
