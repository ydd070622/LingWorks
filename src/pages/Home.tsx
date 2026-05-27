import { useState, useRef, useEffect } from 'react'
import { Search } from 'lucide-react'

interface SearchEngine {
  id: string
  name: string
  buildUrl: (q: string) => string
  ai?: boolean
}

const engines: SearchEngine[] = [
  { id: 'baidu', name: '百度', buildUrl: q => `https://www.baidu.com/s?wd=${encodeURIComponent(q)}` },
  { id: 'bing', name: '必应', buildUrl: q => `https://www.bing.com/search?q=${encodeURIComponent(q)}` },
  { id: 'google', name: 'Google', buildUrl: q => `https://www.google.com/search?q=${encodeURIComponent(q)}` },
  { id: 'deepseek', name: 'DeepSeek', buildUrl: () => 'https://chat.deepseek.com/', ai: true },
  { id: 'kimi', name: 'Kimi', buildUrl: () => 'https://kimi.moonshot.cn/', ai: true },
]

type WebviewElement = HTMLElement & { src: string }

export default function Home() {
  const [query, setQuery] = useState('')
  const [engine, setEngine] = useState(engines[0])
  const [searchUrl, setSearchUrl] = useState<string | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!searchUrl || !containerRef.current) return
    const q = query.trim()
    const wv = document.createElement('webview') as unknown as WebviewElement
    wv.setAttribute('src', searchUrl)
    wv.setAttribute('disablewebsecurity', '')
    wv.setAttribute('allowpopups', '')
    Object.assign(wv.style, {
      width: '100%', height: '100%', border: 'none',
      position: 'absolute', top: '0', left: '0',
    })

    if (engine.ai && q) {
      wv.addEventListener('did-finish-load', () => {
        ;(wv as any).executeJavaScript(`
          (function(q){
            var tries=0, max=20;
            function fill(){
              tries++;
              var el = document.querySelector('textarea') || document.querySelector('[contenteditable="true"]') || document.querySelector('[role="textbox"]');
              if (el) {
                if (el.contentEditable === 'true' || el.getAttribute('contenteditable') === 'true') {
                  el.textContent = q;
                  el.focus();
                } else {
                  el.value = q;
                  el.focus();
                }
                el.dispatchEvent(new Event('input', { bubbles: true }));
              } else if (tries < max) {
                setTimeout(fill, 800);
              }
            }
            setTimeout(fill, 1500);
          })(${JSON.stringify(q)})
        `)
      })
    }

    while (containerRef.current.firstChild) containerRef.current.removeChild(containerRef.current.firstChild)
    containerRef.current.appendChild(wv)
    return () => wv.remove()
  }, [searchUrl, engine.ai, query])

  const handleSearch = () => {
    const q = query.trim()
    if (!q) return
    setSearchUrl(engine.buildUrl(q))
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleSearch()
  }

  const handleBack = () => setSearchUrl(null)

  if (searchUrl) {
    return (
      <div className="home-page-results">
        <div className="home-results-bar">
          <span className="home-results-back" onClick={handleBack}>← 返回搜索</span>
          <span className="home-results-engine">{engine.name} 搜索</span>
        </div>
        <div ref={containerRef} style={{ flex: 1, position: 'relative' }} />
      </div>
    )
  }

  return (
    <div className="home-page">
      <div className="home-content">
        <h1 className="home-title">AI Web Tools</h1>
        <p className="home-subtitle">所有 AI 工具，一站汇聚</p>
        <div className="home-search-wrap">
          <input
            className="home-search-box"
            type="text"
            placeholder="输入关键词搜索..."
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
          />
          <Search className="home-search-icon" size={18} onClick={handleSearch} />
        </div>
        <div className="home-engines">
          {engines.map(e => (
            <span
              key={e.id}
              className={'home-engine-btn' + (engine.id === e.id ? ' active' : '')}
              onClick={() => setEngine(e)}
            >
              {e.name}
            </span>
          ))}
        </div>
        <div className="home-footer">
          © 2026 YDD. All Rights Reserved.
        </div>
      </div>
    </div>
  )
}
