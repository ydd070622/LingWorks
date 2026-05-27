import { useState } from 'react'
import { Search } from 'lucide-react'

interface SearchEngine {
  id: string
  name: string
  siteId: string
  buildUrl: (q: string) => string
}

const engines: SearchEngine[] = [
  {
    id: 'google', name: 'Google', siteId: 'gemini',
    buildUrl: q => `https://www.google.com/search?q=${encodeURIComponent(q)}&igu=1`,
  },
  {
    id: 'deepseek', name: 'DeepSeek', siteId: 'deepseek',
    buildUrl: q => `https://chat.deepseek.com/a/chat/s/${encodeURIComponent(q)}`,
  },
  {
    id: 'chatgpt', name: 'ChatGPT', siteId: 'chatgpt',
    buildUrl: q => `https://chatgpt.com/?q=${encodeURIComponent(q)}`,
  },
  {
    id: 'gemini', name: 'Gemini', siteId: 'gemini',
    buildUrl: q => `https://gemini.google.com/app?q=${encodeURIComponent(q)}`,
  },
  {
    id: 'kimi', name: 'Kimi', siteId: 'kimi',
    buildUrl: q => `https://kimi.moonshot.cn/?q=${encodeURIComponent(q)}`,
  },
]

export default function Home({ onNavigate }: { onNavigate: (id: string) => void }) {
  const [query, setQuery] = useState('')
  const [engine, setEngine] = useState(engines[0])

  const handleSearch = () => {
    const q = query.trim()
    if (!q) return
    const url = engine.buildUrl(q)
    window.electronAPI?.createTab({ url, siteId: engine.siteId })
    onNavigate(engine.siteId)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleSearch()
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
      </div>
    </div>
  )
}
