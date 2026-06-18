import { useState, useEffect, useCallback, useRef } from 'react'
import Sidebar from './components/Sidebar'
import WebViewPage from './components/WebViewPage'
import AgentPanel from './components/AgentPanel'
import TextToImage from './pages/TextToImage'
import ImageToImage from './pages/ImageToImage'
import History from './pages/History'
import Platforms from './pages/Platforms'
import Recharge from './pages/Recharge'
import Settings from './pages/Settings'
import Accounts from './pages/Accounts'
import Home from './pages/Home'
import Prompts from './pages/Prompts'
import Dashboard from './pages/Dashboard'
import ComfyuiPlatforms from './pages/ComfyuiPlatforms'
import XiaoHongShuCards from './pages/XiaoHongShuCards'
import CRMPanel from './pages/CRMPanel'
import type { NavItem, CustomModel, DownloadItem, ShortcutBindings, AgentContext } from './types'
import type { SearchResult } from './services/multi-search'
import { X, Loader2, House, PanelLeft } from 'lucide-react'

// No default free image generation model (Pollinations AI now requires payment/API key)
// Users need to configure their own API in Settings
const defaultModels: CustomModel[] = []

const navItems: NavItem[] = [
  { type: 'website', id: 'liblib', label: 'Lib tv', url: 'https://www.liblib.tv', icon: 'globe' },
  { type: 'website', id: 'runninghub', label: 'RunningHub', url: 'https://www.runninghub.cn', icon: 'globe' },
  { type: 'website', id: 'tapnow', label: 'TapNow', url: 'https://app.tapnow.ai', icon: 'globe' },
  { type: 'website', id: 'chatgpt', label: 'ChatGPT', url: 'https://chatgpt.com', icon: 'globe' },
  { type: 'website', id: 'github', label: 'GitHub', url: 'https://github.com', icon: 'globe' },
  { type: 'website', id: 'gemini', label: 'Gemini', url: 'https://gemini.google.com', icon: 'globe' },
  { type: 'xhs', id: 'xhs_juguang', label: '小红书', url: '', icon: 'globe' },
  { type: 'crm', id: 'crm', label: '客户管理', icon: 'users' },
  { type: 'comfyui', id: 'duannao', label: '端脑云', url: 'https://cephalon.cloud/aigc', icon: 'globe' },
  { type: 'comfyui', id: 'zhisuan', label: '智算云扉', url: 'https://waas.aigate.cc/index', icon: 'globe' },
  { type: 'comfyui', id: 'onethingai', label: 'OneThingAi', url: 'https://onethingai.com', icon: 'globe' },
  { type: 'comfyui-page', id: 'comfyui', label: 'Comfyui', icon: 'tool' },
  { type: 'tool', id: 'txt2img', label: '文生图', icon: 'tool' },
  { type: 'tool', id: 'img2img', label: '图生图', icon: 'tool' },
  { type: 'tool', id: 'history', label: '生成历史', icon: 'tool' },
  { type: 'tool', id: 'prompts', label: 'Prompt 管理', icon: 'tool' },
  { type: 'aggregator', id: 'platforms', label: '开放平台', icon: 'tool' },
  { type: 'aggregator', id: 'recharge', label: '充值平台', icon: 'tool' },
  { type: 'aggregator', id: 'dashboard', label: '数据看板', icon: 'tool' },
  { type: 'account', id: 'accounts', label: '常用账号', icon: 'tool' },
  { type: 'vpn', id: 'skyun', label: 'Skyun', url: 'https://skyun.top/', icon: 'globe' },
  { type: 'vpn', id: 'mitce', label: 'Mitce', url: 'https://mitce.net/', icon: 'globe' },
]

export default function App() {
  const [activeId, setActiveId] = useState('home')
  const [models, setModels] = useState<CustomModel[]>(defaultModels)
  const [theme, setTheme] = useState<'dark' | 'light' | 'system'>('dark')
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(new Set())
  const [autoOpenPlatform, setAutoOpenPlatform] = useState<string | null>(null)
  const [showSettings, setShowSettings] = useState(false)
  const [shortcuts, setShortcuts] = useState<ShortcutBindings>({})
  const [agentOpen, setAgentOpen] = useState(false)
  const [browserUrl, setBrowserUrl] = useState('')
  const [browserContent, setBrowserContent] = useState('')
  const [agentContext, setAgentContext] = useState<AgentContext | null>(null)
  const [adoptPrompt, setAdoptPrompt] = useState<{ type: 'positive' | 'negative'; text: string } | null>(null)

  // Floating card for search / translate results
  type FloatingCard = { kind: 'search' | 'translate'; text: string }
  const [floatingCard, setFloatingCard] = useState<FloatingCard | null>(null)
  const [floatingCardPos, setFloatingCardPos] = useState<{ x: number; y: number }>({ x: 0, y: 0 })
  const dragRef = useRef<{ sx: number; sy: number; cx: number; cy: number } | null>(null)

  const onFloatingCardDrag = useCallback((e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('button')) return
    dragRef.current = { sx: e.screenX, sy: e.screenY, cx: floatingCardPos.x, cy: floatingCardPos.y }
    const onMove = (ev: MouseEvent) => {
      const d = dragRef.current
      if (!d) return
      setFloatingCardPos({ x: d.cx + ev.screenX - d.sx, y: d.cy + ev.screenY - d.sy })
    }
    const onUp = () => {
      dragRef.current = null
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
    }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }, [floatingCardPos])

  const [searchResults, setSearchResults] = useState<SearchResult[]>([])
  const [searchLoading, setSearchLoading] = useState(false)
  const [searchError, setSearchError] = useState<string | null>(null)
  const [translateResult, setTranslateResult] = useState<string | null>(null)
  const [translateLoading, setTranslateLoading] = useState(false)
  const [translateError, setTranslateError] = useState<string | null>(null)

  const handleSendToAgent = (ctx: AgentContext) => {
    setAgentContext(ctx)
    setAgentOpen(true)
  }

  // Listen for adopt-prompt custom event from QuoteBlock (bypasses React prop chain)
  useEffect(() => {
    const handler = (e: Event) => {
      const { type, text } = (e as CustomEvent).detail
      setAdoptPrompt({ type, text })
      setActiveId('txt2img')
    }
    window.addEventListener('adopt-prompt', handler)
    return () => window.removeEventListener('adopt-prompt', handler)
  }, [])

  const [searchQuery, setSearchQuery] = useState('')
  const [searchEngineId, setSearchEngineId] = useState('baidu')
  const [searchUrl, setSearchUrl] = useState<string | null>(null)

  const [downloads, setDownloads] = useState<DownloadItem[]>([])
  const [isMaximized, setIsMaximized] = useState(false)

  // Update state
  const [updateInfo, setUpdateInfo] = useState<{ version: string; currentVersion: string; downloadUrl: string } | null>(null)
  const [updateDownloaded, setUpdateDownloaded] = useState(false)
  const [updateDownloading, setUpdateDownloading] = useState(false)
  const [updateDownloadProgress, setUpdateDownloadProgress] = useState(0)
  const [showUpdateDialog, setShowUpdateDialog] = useState(false)

  // Trigger sidebar download panel auto-expand on download events
  const [expandDownloads, setExpandDownloads] = useState(0)

  // Reset keys for aggregator pages — increment to trigger back-to-grid
  const [platformResetKey, setPlatformResetKey] = useState(0)
  const [rechargeResetKey, setRechargeResetKey] = useState(0)
  const [xhsResetKey, setXhsResetKey] = useState(0)

  // Ref-based dedup (not affected by React batching) to prevent duplicate download entries
  const activeDownloadRef = useRef(new Set<string>())

  const onTitleMouseDown = useCallback((e: React.MouseEvent) => {
    if (isMaximized) return
    if ((e.target as HTMLElement).closest('.traffic-btn')) return
    const api = window.electronAPI
    if (!api) return
    const sx = e.screenX
    const sy = e.screenY
    const wx = window.screenX
    const wy = window.screenY
    const onMove = (ev: MouseEvent) => {
      api.setWindowPosition(wx + ev.screenX - sx, wy + ev.screenY - sy)
    }
    const onUp = () => {
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
    }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }, [isMaximized])

  const toggleSection = useCallback((sectionId: string) => {
    setCollapsedSections(prev => {
      const next = new Set(prev)
      next.has(sectionId) ? next.delete(sectionId) : next.add(sectionId)
      return next
    })
  }, [])

  const autoCollapseTimer = useRef<ReturnType<typeof setTimeout>>()
  const resetAutoCollapse = useCallback(() => {
    clearTimeout(autoCollapseTimer.current)
    autoCollapseTimer.current = setTimeout(() => setSidebarCollapsed(true), 10000)
  }, [])

  // Reset 10s idle timer whenever sidebar expands (manual toggle or initial mount)
  useEffect(() => {
    if (!sidebarCollapsed) resetAutoCollapse()
    return () => clearTimeout(autoCollapseTimer.current)
  }, [sidebarCollapsed, resetAutoCollapse])

  useEffect(() => {
    const applyTheme = (t: string) => {
      if (t === 'system') {
        const dark = window.matchMedia('(prefers-color-scheme: dark)').matches
        document.documentElement.className = dark ? 'theme-dark' : 'theme-light'
      } else {
        document.documentElement.className = t === 'dark' ? 'theme-dark' : 'theme-light'
      }
    }
    applyTheme(theme)
    if (theme === 'system') {
      const mq = window.matchMedia('(prefers-color-scheme: dark)')
      const handler = () => applyTheme('system')
      mq.addEventListener('change', handler)
      return () => mq.removeEventListener('change', handler)
    }
  }, [theme])

  // Keyboard shortcut handler — via main process globalShortcut
  useEffect(() => {
    const api = window.electronAPI
    if (!api) return
    api.registerShortcuts(shortcuts)
  }, [shortcuts])

  useEffect(() => {
    const api = window.electronAPI
    if (!api) return
    const unsub = api.onShortcutTrigger((targetId: string) => {
      if (targetId === 'agent-panel') {
        setAgentOpen(prev => !prev)
      } else {
        setActiveId(targetId)
      }
    })
    return unsub
  }, [])

  // Right-click context menu → send to Agent
  useEffect(() => {
    const api = window.electronAPI
    if (!api) return
    const unsub = api.onContextMenuSendToAgent((data: { text: string; sourceUrl: string }) => {
      handleSendToAgent({ kind: 'text', text: data.text, sourceUrl: data.sourceUrl, autoSubmit: true })
    })
    return unsub
  }, [])

  // Right-click → search floating card
  useEffect(() => {
    const api = window.electronAPI
    if (!api) return
    const unsub = api.onContextMenuSearch(async (data: { text: string }) => {
      setSearchResults([])
      setSearchError(null)
      setSearchLoading(true)
      setTranslateResult(null)
      setTranslateError(null)
      setFloatingCard({ kind: 'search', text: data.text })
      setFloatingCardPos({ x: window.innerWidth - 420, y: window.innerHeight - 380 })
      try {
        const results = await api.webSearch(data.text)
        setSearchResults(results)
        if (results.length === 0) setSearchError('未找到搜索结果')
      } catch (e: any) {
        setSearchError(e.message || '搜索失败')
      } finally {
        setSearchLoading(false)
      }
    })
    return unsub
  }, [])

  // Right-click → translate floating card
  useEffect(() => {
    const api = window.electronAPI
    if (!api) return
    const unsub = api.onContextMenuTranslate(async (data: { text: string }) => {
      setTranslateResult(null)
      setTranslateError(null)
      setTranslateLoading(true)
      setSearchResults([])
      setSearchError(null)
      setFloatingCard({ kind: 'translate', text: data.text })
      setFloatingCardPos({ x: window.innerWidth - 420, y: window.innerHeight - 380 })
      try {
        const result = await api.translate(data.text)
        if (result) {
          setTranslateResult(result)
        } else {
          setTranslateError('翻译服务暂不可用')
        }
      } catch (e: any) {
        setTranslateError(e.message || '翻译失败')
      } finally {
        setTranslateLoading(false)
      }
    })
    return unsub
  }, [])

  useEffect(() => {
    const unsubs: (() => void)[] = []
    const api = window.electronAPI
    if (api) {
      unsubs.push(api.onDownloadStarted((d) => {
        // Ref-based dedup prevents duplicate entries from batched setState
        if (activeDownloadRef.current.has(d.filename)) return
        activeDownloadRef.current.add(d.filename)
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
        setDownloads(prev => {
          const found = prev.find(dl => dl.id === d.id)
          if (found) {
            activeDownloadRef.current.delete(found.filename)
          }
          return prev.map(dl =>
            dl.id === d.id ? { ...dl, state: 'completed' as const, filePath: d.filePath } : dl
          )
        })
        setExpandDownloads(Date.now())
      }))
      unsubs.push(api.onDownloadFailed((d) => {
        setDownloads(prev => {
          const found = prev.find(dl => dl.id === d.id)
          if (found) {
            activeDownloadRef.current.delete(found.filename)
          }
          return prev.map(dl =>
            dl.id === d.id ? { ...dl, state: 'failed' as const } : dl
          )
        })
      }))
    }
    return () => unsubs.forEach(fn => fn())
  }, [])

  // Update listeners
  useEffect(() => {
    const api = window.electronAPI
    if (!api) return
    const unsubs2: (() => void)[] = []
    unsubs2.push(api.onUpdateAvailable((data: any) => {
      setUpdateInfo({ version: data.version, currentVersion: data.currentVersion, downloadUrl: data.downloadUrl })
    }))
    unsubs2.push(api.onUpdateDownloadProgress((data: any) => {
      setUpdateDownloadProgress(data.percent)
    }))
    unsubs2.push(api.onUpdateDownloaded((data: any) => {
      setUpdateDownloaded(true)
      setUpdateDownloading(false)
      setUpdateDownloadProgress(100)
      setUpdateInfo(prev => prev || { version: data.version, currentVersion: '', downloadUrl: '' })
      setShowUpdateDialog(true) // auto-show install prompt
    }))
    unsubs2.push(api.onUpdateError((msg: string) => {
      console.error('Update error:', msg)
    }))
    return () => unsubs2.forEach(fn => fn())
  }, [])

  useEffect(() => {
    const api = window.electronAPI
    if (api) {
      api.isMaximized().then(setIsMaximized)
      return api.onMaximizeChange(setIsMaximized)
    }
  }, [])

  const cancelDownload = useCallback(async (id: string) => {
    if (window.electronAPI) await window.electronAPI.cancelDownload(id)
    setDownloads(prev => prev.map(dl => dl.id === id ? { ...dl, state: 'failed' as const } : dl))
  }, [])

  const clearDownloads = useCallback(() => {
    setDownloads(prev => prev.filter(dl => dl.state === 'progress'))
  }, [])

  useEffect(() => {
    // Filter out invalid Pollinations models (now requires payment/API key)
    const filterModels = (models: CustomModel[]): CustomModel[] => {
      return models.filter(m => {
        // Remove default Pollinations without API key
        if (m.modelName === 'pollinations' && !m.apiKey) return false
        // Remove models using old pollinations endpoint
        if (m.endpoint?.includes('pollinations.ai') && !m.apiKey) return false
        return true
      })
    }

    const load = async () => {
      if (window.electronAPI) {
        const [saved, savedTheme, savedShortcuts] = await Promise.all([
          window.electronAPI.getStore('customModels'),
          window.electronAPI.getStore('theme'),
          window.electronAPI.getStore('shortcutBindings'),
        ])
        const DEFAULT_SHORTCUTS = {
          'Alt+1': 'chatgpt', 'Alt+2': 'github', 'Alt+3': 'liblib',
          'Alt+4': 'runninghub', 'Alt+5': 'gemini', 'Alt+6': 'tapnow',
          'Ctrl+Shift+T': 'txt2img', 'Ctrl+Shift+I': 'img2img',
          'Ctrl+Space': 'agent-panel',
        }
        if (saved !== null && Array.isArray(saved)) {
          const filtered = filterModels(saved)
          setModels(filtered)
        }
        if (savedTheme === 'light' || savedTheme === 'dark' || savedTheme === 'system') {
          setTheme(savedTheme)
        }
        // Always ensure agent-panel shortcut exists
        const mergedShortcuts = { ...DEFAULT_SHORTCUTS, ...(savedShortcuts || {}) }
        setShortcuts(mergedShortcuts)
      } else {
        const saved = localStorage.getItem('customModels')
        if (saved !== null) {
          try {
            const parsed = JSON.parse(saved)
            if (Array.isArray(parsed)) {
              const filtered = filterModels(parsed)
              setModels(filtered)
            }
          } catch {}
        }
        const savedTheme = localStorage.getItem('theme')
        if (savedTheme === 'light' || savedTheme === 'dark' || savedTheme === 'system') {
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
  const comfyuiSites = navItems.filter(i => i.type === 'comfyui') as (NavItem & { type: 'comfyui' })[]
  const vpnSites = navItems.filter(i => i.type === 'vpn') as (NavItem & { type: 'vpn' })[]

  return (
    <div className={`app-layout${isMaximized ? '' : ' app-rounded'}`}>
      <div className="window-titlebar" onMouseDown={onTitleMouseDown}>
        <span className="titlebar-label">LingWorks</span>
       <span className="titlebar-drag-area" onDoubleClick={() => window.electronAPI?.maximizeWindow()} />
        <button
          className="titlebar-home-btn"
          onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
          title={sidebarCollapsed ? '展开侧栏' : '收起侧栏'}
        >
          <PanelLeft size={14} />
        </button>
        <button
          className="titlebar-home-btn"
          onClick={() => setActiveId('home')}
          title="回到主页"
        >
          <House size={14} />
        </button>
        <button
          className={`titlebar-agent-btn${agentOpen ? ' active' : ''}`}
          onClick={() => setAgentOpen(!agentOpen)}
          title="智能体助手 (Ctrl+Space)"
        >
          <span>智能体</span>
          <span className={`titlebar-agent-dot${agentOpen ? '' : ' off'}`} />
          <span className="titlebar-agent-key">Ctrl+Space</span>
        </button>
        {updateInfo && (
          <button
            className="titlebar-update-btn"
            onClick={() => setShowUpdateDialog(true)}
            title={'发现新版本 v' + updateInfo.version}
          >
            Update
          </button>
        )}
        <div className="titlebar-btns">
          <button className="traffic-btn traffic-minimize" onClick={() => window.electronAPI?.minimizeWindow()} title="最小化">─</button>
          <button className="traffic-btn traffic-maximize" onClick={() => window.electronAPI?.maximizeWindow()} title={isMaximized ? '还原' : '最大化'}>{isMaximized ? '❐' : '☐'}</button>
          <button className="traffic-btn traffic-close" onClick={() => window.electronAPI?.closeWindow()} title="关闭">✕</button>
        </div>
      </div>
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        {showSettings ? (
          <Settings models={models} onSave={saveModels} onClose={() => setShowSettings(false)} onNavigate={setActiveId} />
        ) : (<>
        <Sidebar
          items={navItems}
          activeId={activeId}
          theme={theme}
          collapsed={sidebarCollapsed}
          collapsedSections={collapsedSections}
          downloads={downloads}
          expandDownloads={expandDownloads}
          onSelect={setActiveId}
          onReselect={(id) => {
            if (id === 'platforms') setPlatformResetKey(k => k + 1)
            if (id === 'recharge') setRechargeResetKey(k => k + 1)
            if (id === 'xhs_juguang') setXhsResetKey(k => k + 1)
          }}
          onToggleTheme={toggleTheme}
          onOpenSettings={() => setShowSettings(true)}
          onToggleSection={toggleSection}
          onCancelDownload={cancelDownload}
          onClearDownloads={clearDownloads}
          onSidebarActivity={resetAutoCollapse}
          agentOpen={agentOpen}
          onToggleAgent={() => setAgentOpen(!agentOpen)}
        />

      <div className="main-content">
        <div className="content-area">
          {activeId === 'home' && <Home onSelect={setActiveId} searchQuery={searchQuery} searchEngineId={searchEngineId} searchUrl={searchUrl} onSetSearchQuery={setSearchQuery} onSetSearchEngine={setSearchEngineId} onSetSearchUrl={setSearchUrl} />}
          {websiteSites.map(site => (
            <WebViewPage key={site.id} site={site} visible={activeId === site.id} onUrlChange={(url, content) => { setBrowserUrl(url); setBrowserContent(content || '') }} />
          ))}
          {activeId === 'xhs_juguang' && <XiaoHongShuCards onUrlChange={(url, content) => { setBrowserUrl(url); setBrowserContent(content || '') }} resetKey={xhsResetKey} />}
          {activeId === 'crm' && <CRMPanel />}
          {comfyuiSites.map(site => (
            <WebViewPage key={site.id} site={site} visible={activeId === site.id} onUrlChange={(url, content) => { setBrowserUrl(url); setBrowserContent(content || '') }} />
          ))}
          {vpnSites.map(site => (
            <WebViewPage key={site.id} site={site} visible={activeId === site.id} onUrlChange={(url, content) => { setBrowserUrl(url); setBrowserContent(content || '') }} />
          ))}
          {activeId === 'comfyui' && <ComfyuiPlatforms onNavigate={setActiveId} />}
          {activeId === 'txt2img' && <TextToImage models={models} onSendToAgent={handleSendToAgent} adoptPrompt={adoptPrompt} onAdoptConsumed={() => setAdoptPrompt(null)} />}
          {activeId === 'img2img' && <ImageToImage models={models} onSendToAgent={handleSendToAgent} />}
          {activeId === 'history' && <History />}
          {activeId === 'prompts' && <Prompts />}
          {activeId === 'platforms' && <Platforms autoOpenPlatform={autoOpenPlatform} onPlatformOpened={() => setAutoOpenPlatform(null)} resetKey={platformResetKey} />}
          {activeId === 'recharge' && <Recharge resetKey={rechargeResetKey} />}
          {activeId === 'dashboard' && <Dashboard onSelect={(id) => { setActiveId(id); if (id === 'platforms') setAutoOpenPlatform('deepseek') }} />}
          {activeId === 'accounts' && <Accounts />}
        </div>
      </div>

        </>)}

        <AgentPanel isOpen={agentOpen} onClose={() => setAgentOpen(false)} currentUrl={browserUrl} currentContent={browserContent} currentPage={activeId} initialContext={agentContext} onContextConsumed={() => setAgentContext(null)} onNavigate={(page) => setActiveId(page)} />

      {/* Floating Search / Translate Card — draggable mini card */}
      {floatingCard && (
        <div
          className="floating-card"
          style={{ left: floatingCardPos.x, top: floatingCardPos.y }}
        >
          <div className="floating-card-header" onMouseDown={onFloatingCardDrag}>
            <span className="floating-card-title">
              {floatingCard.kind === 'search' ? '🔍 搜索' : '🌐 翻译'}
            </span>
            <button className="floating-card-close" onClick={() => setFloatingCard(null)}>
              <X size={14} />
            </button>
          </div>
          <div className="floating-card-body">
            {floatingCard.kind === 'search' ? (
              <>
                {searchLoading && (
                  <div className="floating-card-loading">
                    <Loader2 size={14} className="spinning" /> 搜索中...
                  </div>
                )}
                {searchError && (
                  <div className="floating-card-error">{searchError}</div>
                )}
                {!searchLoading && !searchError && searchResults.length > 0 && (
                  <div className="floating-card-results">
                    {searchResults.map((r, i) => (
                      <a
                        key={i}
                        className="floating-card-result"
                        href={r.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={e => {
                          e.preventDefault()
                          window.electronAPI?.openExternal(r.url)
                        }}
                      >
                        <div className="floating-card-result-title">{r.title}</div>
                        {r.snippet && <div className="floating-card-result-snippet">{r.snippet}</div>}
                        <div className="floating-card-result-source">
                          {r.source && <span>{r.source}</span>}
                          <span className="floating-card-result-url">{r.url.replace(/^https?:\/\/(www\.)?/, '').split('/')[0]}</span>
                        </div>
                      </a>
                    ))}
                  </div>
                )}
              </>
            ) : (
              <>
                {translateLoading && (
                  <div className="floating-card-loading">
                    <Loader2 size={14} className="spinning" /> 翻译中...
                  </div>
                )}
                {translateError && (
                  <div className="floating-card-error">{translateError}</div>
                )}
                {!translateLoading && !translateError && translateResult && (
                  <div className="floating-card-translate">{translateResult}</div>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {/* Update confirmation dialog */}
      {showUpdateDialog && updateInfo && (
        <div className="update-dialog-overlay" onClick={() => setShowUpdateDialog(false)}>
          <div className="update-dialog" onClick={e => e.stopPropagation()}>
            <div className="update-dialog-icon">{updateDownloaded ? '✅' : '⬆'}</div>
            <h3>{updateDownloaded ? '下载完成' : '确认更新到 v' + updateInfo.version}</h3>
            <p>当前版本 v{updateInfo.currentVersion}{updateDownloaded ? '，是否立即重启安装？' : '，点击立即更新开始下载。'}</p>
            {(updateDownloading || updateDownloaded) && (
              <div className="update-dialog-progress">
                <div className="update-dialog-progress-bar" style={{ width: updateDownloadProgress + '%' }} />
                <span>{updateDownloadProgress}%</span>
              </div>
            )}
            <div className="update-dialog-actions">
              <button className="update-btn-later" onClick={() => setShowUpdateDialog(false)}>稍后</button>
              {!updateDownloaded && !updateDownloading ? (
                <button
                  className="update-btn-restart"
                  onClick={async () => {
                    setShowUpdateDialog(false)
                    setUpdateDownloading(true)
                    setUpdateDownloadProgress(0)
                    try {
                      await window.electronAPI?.startUpdateDownload(updateInfo.downloadUrl, updateInfo.version)
                    } catch {}
                  }}
                >
                  立即更新
                </button>
              ) : (
                <button
                  className="update-btn-restart"
                  onClick={() => window.electronAPI?.installUpdate()}
                  disabled={!updateDownloaded}
                >
                  立即重启更新
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      </div>
    </div>
  )
}
