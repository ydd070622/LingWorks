import { useState } from 'react'
import { Search } from 'lucide-react'

export default function Home() {
  const [query, setQuery] = useState('')

  const handleSearch = () => {
    const q = query.trim()
    if (!q) return
    const url = `https://www.google.com/search?q=${encodeURIComponent(q)}`
    if (window.electronAPI?.openExternal) {
      window.electronAPI.openExternal(url)
    } else {
      window.open(url, '_blank')
    }
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
      </div>
    </div>
  )
}
