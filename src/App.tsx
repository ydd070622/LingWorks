import { useState, useEffect, useCallback } from 'react'
import Sidebar from './components/Sidebar'
import WebViewPage from './components/WebViewPage'
import TextToImage from './pages/TextToImage'
import ImageToImage from './pages/ImageToImage'
import History from './pages/History'
import Platforms from './pages/Platforms'
import Recharge from './pages/Recharge'
import Settings from './pages/Settings'
import Accounts from './pages/Accounts'
import Home from './pages/Home'
import type { NavItem, CustomModel, DownloadItem } from './types'

const defaultModels: CustomModel[] = [
  { name: 'Pollinations AI', apiKey: '', endpoint: 'https://pollinations.ai', modelName: 'pollinations' },
]

const navItems: NavItem[] = [
  { type: 'website', id: 'liblib', label: 'Lib tv', url: 'https://www.liblib.tv', icon: 'globe' },
  { type: 'website', id: 'runninghub', label: 'RunningHub', url: 'https://www.runninghub.cn', icon: 'globe' },
  { type: 'website', id: 'tapnow', label: 'TapNow', url: 'https://app.tapnow.ai', icon: 'globe' },
  { type: 'website', id: 'chatgpt', label: 'ChatGPT', url: 'https://chatgpt.com', icon: 'globe' },
  { type: 'website', id: 'github', label: 'GitHub', url: 'https://github.com', icon: 'globe' },
  { type: 'website', id: 'gemini', label: 'Gemini', url: 'https://gemini.google.com', icon: 'globe' },
  { type: 'tool', id: 'txt2img', label: '文生图', icon: 'tool' },
  { type: 'tool', id: 'img2img', label: '图生图', icon: 'tool' },
  { type: 'tool', id: 'history', label: '生成历史', icon: 'tool' },
  { type: 'aggregator', id: 'platforms', label: '开放平台', icon: 'tool' },
  { type: 'aggregator', id: 'recharge', label: '充值平台', icon: 'tool' },
  { type: 'account', id: 'accounts', label: '常用账号', icon: 'tool' },
  { type: 'vpn', id: 'skyun', label: 'Skyun', url: 'https://skyun.top/', icon: 'globe' },
  { type: 'vpn', id: 'mitce', label: 'Mitce', url: 'https://mitce.net/', icon: 'globe' },
]

export default function App() {
  const [activeId, setActiveId] = useState('home')
  const [models, setModels] = useState<CustomModel[]>(defaultModels)
  const [theme, setTheme] = useState<'dark' | 'light'>('dark')
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(new Set())
  const [showSettings, setShowSettings] = useState(false)

  const [searchQuery, setSearchQuery] = useState('')
  const [searchEngineId, setSearchEngineId] = useState('baidu')
  const [searchUrl, setSearchUrl] = useState<string | null>(null)

  const [downloads, setDownloads] = useState<DownloadItem[]>([])

  const toggleSection = useCallback((sectionId: string) => {
    setCollapsedSections(prev => {
      const next = new Set(prev)
      next.has(sectionId) ? next.delete(sectionId) : next.add(sectionId)
      return next
    })
  }, [])

  useEffect(() => {
    document.documentElement.className = theme === 'dark' ? 'theme-dark' : 'theme-light'
  }, [theme])

  useEffect(() => {
    const unsubs: (() => void)[] = []
    const api = window.electronAPI
    if (api) {
      unsubs.push(api.onDownloadStarted((d) => {
        setDownloads(prev => {
          if (prev.some(dl => dl.filename === d.filename && dl.state === 'progress')) return prev
          return [...prev, { ...d, state: 'progress' as const }]
        })
      }))
      unsubs.push(api.onDownloadProgress((d) => {
        setDownloads(prev => prev.map(dl =>
          dl.id === d.id ? { ...dl, receivedBytes: d.receivedBytes, totalBytes: d.totalBytes || dl.totalBytes } : dl
        ))
      }))
      unsubs.push(api.onDownloadCompleted((d) => {
        setDownloads(prev => prev.map(dl =>
          dl.id === d.id ? { ...dl, state: 'completed' as const, filePath: d.filePath } : dl
        ))
      }))
      unsubs.push(api.onDownloadFailed((d) => {
        setDownloads(prev => prev.map(dl =>
          dl.id === d.id ? { ...dl, state: 'failed' as const } : dl
        ))
      }))
    }
    return () => unsubs.forEach(fn => fn())
  }, [])

  const cancelDownload = useCallback(async (id: string) => {
    if (window.electronAPI) await window.electronAPI.cancelDownload(id)
    setDownloads(prev => prev.map(dl => dl.id === id ? { ...dl, state: 'failed' as const } : dl))
  }, [])

  const clearDownloads = useCallback(() => {
    setDownloads(prev => prev.filter(dl => dl.state === 'progress'))
  }, [])

  useEffect(() => {
    const load = async () => {
      if (window.electronAPI) {
        const [saved, savedTheme] = await Promise.all([
          window.electronAPI.getStore('customModels'),
          window.electronAPI.getStore('theme'),
        ])
        if (saved !== null && Array.isArray(saved)) {
          setModels(saved)
        }
        if (savedTheme === 'light' || savedTheme === 'dark') {
          setTheme(savedTheme)
        }
      } else {
        const saved = localStorage.getItem('customModels')
        if (saved !== null) {
          try {
            const parsed = JSON.parse(saved)
            if (Array.isArray(parsed)) setModels(parsed)
          } catch {}
        }
        const savedTheme = localStorage.getItem('theme')
        if (savedTheme === 'light' || savedTheme === 'dark') {
          setTheme(savedTheme)
        }
      }
    }
    load()
  }, [])

  const saveModels = useCallback(async (m: CustomModel[]) => {
    setModels(m)
    if (window.electronAPI) {
      await window.electronAPI.setStore('customModels', m)
    } else {
      localStorage.setItem('customModels', JSON.stringify(m))
    }
  }, [])

  const toggleTheme = useCallback(async () => {
    const next = theme === 'dark' ? 'light' : 'dark'
    setTheme(next)
    if (window.electronAPI) {
      await window.electronAPI.setStore('theme', next)
      await window.electronAPI.setThemeSource(next)
    } else {
      localStorage.setItem('theme', next)
    }
  }, [theme])

  const activeItem = navItems.find(i => i.id === activeId)

  const websiteSites = navItems.filter(i => i.type === 'website') as (NavItem & { type: 'website' })[]
  const vpnSites = navItems.filter(i => i.type === 'vpn') as (NavItem & { type: 'vpn' })[]

  return (
    <div className="app-layout">
        <Sidebar
          items={navItems}
          activeId={activeId}
          theme={theme}
          collapsed={sidebarCollapsed}
          collapsedSections={collapsedSections}
          downloads={downloads}
          onSelect={setActiveId}
          onToggleTheme={toggleTheme}
          onToggleCollapse={() => setSidebarCollapsed(!sidebarCollapsed)}
          onOpenSettings={() => setShowSettings(true)}
          onToggleSection={toggleSection}
          onGoHome={() => setActiveId('home')}
          onCancelDownload={cancelDownload}
          onClearDownloads={clearDownloads}
        />

      <div className="main-content">
        {activeItem?.type === 'tool' && (
          <div className="toolbar">
            <span className="toolbar-title">{activeItem?.label}</span>
          </div>
        )}

        <div className="content-area">
          {activeId === 'home' && <Home onSelect={setActiveId} searchQuery={searchQuery} searchEngineId={searchEngineId} searchUrl={searchUrl} onSetSearchQuery={setSearchQuery} onSetSearchEngine={setSearchEngineId} onSetSearchUrl={setSearchUrl} />}
          {websiteSites.map(site => (
            <WebViewPage key={site.id} site={site} visible={activeId === site.id} />
          ))}
          {vpnSites.map(site => (
            <WebViewPage key={site.id} site={site} visible={activeId === site.id} />
          ))}
          {activeId === 'txt2img' && <TextToImage models={models} />}
          {activeId === 'img2img' && <ImageToImage models={models} />}
          {activeId === 'history' && <History />}
          {activeId === 'platforms' && <Platforms />}
          {activeId === 'recharge' && <Recharge />}
          {activeId === 'accounts' && <Accounts />}
        </div>
      </div>

      {showSettings && (
        <Settings models={models} onSave={saveModels} onClose={() => setShowSettings(false)} />
      )}
    </div>
  )
}
