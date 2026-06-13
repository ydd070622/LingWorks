/**
 * Search IPC — DDG API + DDG HTML + Bing, orchestrated in parallel
 */
import { ipcMain } from 'electron'

const SEARCH_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36'

interface SearchItem { title: string; snippet: string; url: string; source: string }

function isChinese(text: string): boolean { return /[\u4e00-\u9fff]/.test(text) }

function stripHtml(h: string): string {
  return h.replace(/<[^>]+>/g, '')
    .replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>')
    .replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&nbsp;/g,' ')
    .replace(/\s+/g,' ').trim()
}

function dedupe(items: SearchItem[], limit = 10): SearchItem[] {
  const seen = new Set<string>(); const out: SearchItem[] = []
  for (const r of items) {
    if (!r.url || seen.has(r.url)) continue
    seen.add(r.url); out.push(r)
  }
  return out.slice(0, limit)
}

// ===== 1. DDG Instant Answer API (free, no key, returns JSON) =====
async function searchDDG_API(query: string): Promise<SearchItem[]> {
  const results: SearchItem[] = []
  try {
    const url = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1`
    console.log('[search] DDG API:', url)
    const resp = await fetch(url, {
      headers: { 'User-Agent': SEARCH_UA },
      signal: AbortSignal.timeout(10000),
    })
    if (!resp.ok) { console.log('[search] DDG API HTTP', resp.status); return results }
    const data = await resp.json() as any
    console.log('[search] DDG API: Heading=', data.Heading, 'AbstractText=', (data.AbstractText || '').slice(0, 80), 'RelatedTopics=', data.RelatedTopics?.length, 'Results=', data.Results?.length)

    // Abstract (instant answer)
    if (data.AbstractText && data.AbstractText.trim()) {
      results.push({
        title: data.Heading || query,
        snippet: data.AbstractText.trim(),
        url: data.AbstractURL || '',
        source: 'DuckDuckGo',
      })
    }
    // RelatedTopics
    if (Array.isArray(data.RelatedTopics)) {
      for (const t of data.RelatedTopics) {
        if (!t.Text || !t.FirstURL) continue
        results.push({ title: stripHtml(t.Text).slice(0, 120), snippet: '', url: t.FirstURL, source: 'DuckDuckGo' })
      }
    }
    // Results (web results)
    if (Array.isArray(data.Results)) {
      for (const r of data.Results) {
        if (!r.Text || !r.FirstURL) continue
        results.push({ title: stripHtml(r.Text).slice(0, 120), snippet: '', url: r.FirstURL, source: 'DuckDuckGo' })
      }
    }
    console.log('[search] DDG API results:', results.length)
  } catch (e: any) {
    console.log('[search] DDG API error:', e.message)
  }
  return results
}

// ===== 2. DDG HTML Search (non-JS version, more results) =====
async function searchDDG_HTML(query: string): Promise<SearchItem[]> {
  const results: SearchItem[] = []
  try {
    const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`
    console.log('[search] DDG HTML:', url)
    const resp = await fetch(url, {
      headers: { 'User-Agent': SEARCH_UA, 'Accept': 'text/html', 'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8' },
      signal: AbortSignal.timeout(15000),
    })
    if (!resp.ok) { console.log('[search] DDG HTML HTTP', resp.status); return results }
    const html = await resp.text()

    // Parse DDG HTML results
    const linkPat = /<a[^>]*class="result__a"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi
    const links: { url: string; title: string }[] = []
    let m
    while ((m = linkPat.exec(html)) !== null) {
      let u = m[1]
      if (u.startsWith('//')) u = 'https:' + u
      const um = u.match(/uddg=([^&]+)/)
      if (um) u = decodeURIComponent(um[1])
      if (u.startsWith('http')) {
        links.push({ url: u, title: stripHtml(m[2]) })
      }
    }
    const snipPat = /<a[^>]*class="result__snippet"[^>]*>([\s\S]*?)<\/a>/gi
    const snippets: string[] = []
    while ((m = snipPat.exec(html)) !== null) {
      snippets.push(stripHtml(m[1]))
    }
    for (let i = 0; i < links.length; i++) {
      results.push({
        title: links[i].title,
        snippet: snippets[i] || '',
        url: links[i].url,
        source: 'DuckDuckGo',
      })
    }
    console.log('[search] DDG HTML results:', results.length)
  } catch (e: any) {
    console.log('[search] DDG HTML error:', e.message)
  }
  return results
}

// ===== 3. Bing Search (fallback) =====
async function searchBing(query: string): Promise<SearchItem[]> {
  const results: SearchItem[] = []
  try {
    const url = `https://cn.bing.com/search?q=${encodeURIComponent(query)}&ensearch=${isChinese(query) ? '0' : '1'}`
    console.log('[search] Bing:', url)
    const resp = await fetch(url, {
      headers: { 'User-Agent': SEARCH_UA, 'Accept': 'text/html', 'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8' },
      signal: AbortSignal.timeout(15000),
    })
    if (!resp.ok) { console.log('[search] Bing HTTP', resp.status); return results }
    const html = await resp.text()

    const pat = /<li class="b_algo"[^>]*>[\s\S]*?<h2[^>]*>[\s\S]*?<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?<p[^>]*>([\s\S]*?)<\/p>/gi
    let m
    while ((m = pat.exec(html)) !== null) {
      const url = m[1]
      if (!url.startsWith('http')) continue
      results.push({
        title: stripHtml(m[2]),
        snippet: stripHtml(m[3]),
        url,
        source: 'Bing',
      })
    }
    console.log('[search] Bing results:', results.length)
  } catch (e: any) {
    console.log('[search] Bing error:', e.message)
  }
  return results
}

export function registerSearch() {
  ipcMain.handle('web-search', async (_ev, query: string) => {
    console.log('[search] === START query:', query, 'isChinese:', isChinese(query))

    const [ddgApi, ddgHtml, bing] = await Promise.all([
      searchDDG_API(query),
      searchDDG_HTML(query),
      searchBing(query),
    ])

    const all = [...ddgApi, ...ddgHtml, ...bing]
    console.log('[search] === TOTAL raw:', all.length, '(DDG_API:', ddgApi.length, 'DDG_HTML:', ddgHtml.length, 'Bing:', bing.length, ')')

    const result = dedupe(all, 12)
    console.log('[search] === FINAL deduped:', result.length)
    return result
  })
}
