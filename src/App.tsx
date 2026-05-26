import { useState, useEffect, useCallback } from 'react'
import Sidebar from './components/Sidebar'
import WebViewPage from './components/WebViewPage'
import TextToImage from './pages/TextToImage'
import ImageToImage from './pages/ImageToImage'
import History from './pages/History'
import Platforms from './pages/Platforms'
import Recharge from './pages/Recharge'
import ApiSettings from './pages/ApiSettings'
import Accounts from './pages/Accounts'
import type { NavItem, CustomModel } from './types'

const defaultModels: CustomModel[] = [
  { name: 'Pollinations AI', apiKey: '', endpoint: 'https://pollinations.ai', modelName: 'pollinations' },
]

const navItems: NavItem[] = [
  { type: 'website', id: 'liblib', label: 'Liblib', url: 'https://www.liblib.tv', icon: 'globe' },
  { type: 'website', id: 'runninghub', label: 'RunningHub', url: 'https://www.runninghub.cn', icon: 'globe' },
  { type: 'website', id: 'tapnow', label: 'TapNow', url: 'https://app.tapnow.ai', icon: 'globe' },
  { type: 'website', id: 'chatgpt', label: 'ChatGPT', url: 'https://chatgpt.com', icon: 'globe' },
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
  const [activeId, setActiveId] = useState('liblib')
  const [models, setModels] = useState<CustomModel[]>(defaultModels)
  const [theme, setTheme] = useState<'dark' | 'light'>('dark')
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [showSettings, setShowSettings] = useState(false)

  useEffect(() => {
    document.documentElement.className = theme === 'dark' ? 'theme-dark' : 'theme-light'
  }, [theme])

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
          onSelect={setActiveId}
          onToggleTheme={toggleTheme}
          onToggleCollapse={() => setSidebarCollapsed(!sidebarCollapsed)}
          onOpenSettings={() => setShowSettings(true)}
        />

      <div className="main-content">
        {activeItem?.type === 'tool' && (
          <div className="toolbar">
            <span className="toolbar-title">{activeItem?.label}</span>
          </div>
        )}

        <div className="content-area">
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
        <ApiSettings models={models} onSave={saveModels} onClose={() => setShowSettings(false)} />
      )}
    </div>
  )
}
