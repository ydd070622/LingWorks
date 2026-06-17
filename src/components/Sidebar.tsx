import { useState, useEffect } from 'react'
import { Globe, Brush, Settings, Sun, Moon, PanelLeft, ChevronRight, Wrench, Layers, CreditCard, Wifi, User, ChevronDown, Sparkles, Images, HistoryIcon, LayoutGrid, Wallet, Contact, Download, FolderOpen, LayoutDashboard, Workflow } from 'lucide-react'
import type { NavItem, DownloadItem } from '../types'

interface SidebarProps {
  items: NavItem[]
  activeId: string
  theme: 'dark' | 'light'
  collapsed: boolean
  collapsedSections: Set<string>
  downloads: DownloadItem[]
  expandDownloads?: boolean
  onSelect: (id: string) => void
  onToggleTheme: () => void
  onToggleCollapse: () => void
  onOpenSettings: () => void
  onToggleSection: (sectionId: string) => void
  onGoHome: () => void
  onCancelDownload: (id: string) => void
  onClearDownloads: () => void
  agentOpen?: boolean
  onToggleAgent?: () => void
}

const favicons: Record<string, string> = {
  liblib: './favicons/liblib.png',
  runninghub: './favicons/runninghub.png',
  tapnow: './favicons/tapnow.png',
  chatgpt: './favicons/chatgpt.png',
  github: './favicons/github.png',
  gemini: './favicons/gemini.png',
  skyun: './favicons/skyun.png',
  mitce: './favicons/mitce.png',
  xhs_juguang: './favicons/xhs_juguang.png',
  duannao: './favicons/duannao.png',
  zhisuan: './favicons/zhisuan.png',
  onethingai: './favicons/onethingai.png',
}

export default function Sidebar({ items, activeId, theme, collapsed, collapsedSections, downloads, expandDownloads, onSelect, onToggleTheme, onToggleCollapse, onOpenSettings, onToggleSection, onGoHome, onCancelDownload, onClearDownloads, agentOpen, onToggleAgent }: SidebarProps) {
  const makeIcon = (name: string, alt: string) => (
    <img src={`./icons/${name}.png`} alt={alt} style={{width: 24, height: 24}} />
  );

  const toolIcons: Record<string, React.ReactNode> = {
    txt2img: makeIcon('txt2img', '文生图'),
    img2img: makeIcon('img2img', '图生图'),
    history: makeIcon('history', '生成历史'),
    prompts: makeIcon('prompts', 'Prompt管理'),
  };

  const aggregatorIcons: Record<string, React.ReactNode> = {
    platforms: makeIcon('platforms', '开放平台'),
    recharge: makeIcon('recharge', '充值平台'),
    dashboard: makeIcon('dashboard', '数据面板'),
  };

  const iconLabel: Record<string, React.ReactNode> = {
    liblib: 'Lib', runninghub: 'RH', tapnow: 'TN', chatgpt: 'CG', github: 'GH', gemini: 'GE',
    txt2img: makeIcon('txt2img', '文生图'),
    img2img: makeIcon('img2img', '图生图'),
    history: makeIcon('history', '生成历史'),
    prompts: makeIcon('prompts', 'Prompt管理'),
    platforms: makeIcon('platforms', '开放平台'),
    recharge: makeIcon('recharge', '充值平台'),
    dashboard: makeIcon('dashboard', '数据面板'),
    accounts: makeIcon('accounts', '常用账号'),
    skyun: 'SK', mitce: 'MC',
    duannao: '端', zhisuan: '智', onethingai: 'AI',
  };

  const websites = items.filter(i => i.type === 'website')
  const comfyui = items.filter(i => i.type === 'comfyui')
  const tools = items.filter(i => i.type === 'tool')
  const aggregators = items.filter(i => i.type === 'aggregator')
  const accounts = items.filter(i => i.type === 'account')
  const vpnSites = items.filter(i => i.type === 'vpn')

  const activeDownloads = downloads.filter(d => d.state === 'progress')
  const hasDownloads = downloads.length > 0
  const [showDlFlyout, setShowDlFlyout] = useState(false)

  // Auto-expand download panel when downloads complete
  useEffect(() => {
    if (expandDownloads) setShowDlFlyout(true)
  }, [expandDownloads])

  useEffect(() => {
    if (!showDlFlyout) return
    const handler = () => setShowDlFlyout(false)
    document.addEventListener('click', handler)
    return () => document.removeEventListener('click', handler)
  }, [showDlFlyout])

  if (collapsed) {
    return (
      <div className="sidebar-float-tab" onClick={onToggleCollapse} title="展开侧栏">
        <ChevronRight size={18} />
      </div>
    )
  }

  return (
    <div className="sidebar">
      <div className="sidebar-header">
        <div className="sidebar-header-title" onClick={onGoHome} title="回到主页">
          <h1>AI Web Tools</h1>
        </div>
        <div className="sidebar-collapse-toggle" onClick={onToggleCollapse} title="收起侧栏">
          <PanelLeft size={18} />
        </div>
      </div>

      <div className="sidebar-nav">
        <div className="sidebar-section">
          <div className="sidebar-section-title clickable" onClick={() => onToggleSection('websites')}>
            <Globe size={14} /> 常用网站
            <ChevronDown size={12} className={`chevron ${collapsedSections.has('websites') ? 'collapsed' : ''}`} />
          </div>
        </div>
        {!collapsedSections.has('websites') && websites.map(item => (
          <div
            key={item.id}
            className={`sidebar-item ${activeId === item.id ? 'active' : ''}`}
            onClick={() => onSelect(item.id)}
          >
            <span className="sidebar-item-icon">
              {favicons[item.id] ? <img src={favicons[item.id]} alt="" className="sidebar-icon-img" /> : (iconLabel[item.id] || <Globe size={16} />)}
            </span>
            <span>{item.label}</span>
          </div>
        ))}

        <div className="sidebar-section">
          <div className="sidebar-section-title clickable" onClick={() => onToggleSection('comfyui')}>
            <Workflow size={14} /> ComfyUI
            <ChevronDown size={12} className={`chevron ${collapsedSections.has('comfyui') ? 'collapsed' : ''}`} />
          </div>
        </div>
        {!collapsedSections.has('comfyui') && comfyui.map(item => (
          <div
            key={item.id}
            className={`sidebar-item ${activeId === item.id ? 'active' : ''}`}
            onClick={() => onSelect(item.id)}
          >
            <span className="sidebar-item-icon">
              {favicons[item.id] ? <img src={favicons[item.id]} alt="" className="sidebar-icon-img" /> : (iconLabel[item.id] || <Globe size={16} />)}
            </span>
            <span>{item.label}</span>
          </div>
        ))}

        <div className="sidebar-section">
          <div className="sidebar-section-title clickable" onClick={() => onToggleSection('tools')}>
            <Wrench size={14} /> 生图工具
            <ChevronDown size={12} className={`chevron ${collapsedSections.has('tools') ? 'collapsed' : ''}`} />
          </div>
        </div>
        {!collapsedSections.has('tools') && tools.map(item => (
          <div
            key={item.id}
            className={`sidebar-item ${activeId === item.id ? 'active' : ''}`}
            onClick={() => onSelect(item.id)}
          >
            <span className="sidebar-item-icon">{toolIcons[item.id] || <Brush size={16} />}</span>
            <span>{item.label}</span>
          </div>
        ))}

        <div className="sidebar-section">
          <div className="sidebar-section-title clickable" onClick={() => onToggleSection('aggregators')}>
            <Layers size={14} /> 聚合网站
            <ChevronDown size={12} className={`chevron ${collapsedSections.has('aggregators') ? 'collapsed' : ''}`} />
          </div>
        </div>
        {!collapsedSections.has('aggregators') && aggregators.map(item => (
          <div
            key={item.id}
            className={`sidebar-item ${activeId === item.id ? 'active' : ''}`}
            onClick={() => onSelect(item.id)}
          >
            <span className="sidebar-item-icon">{aggregatorIcons[item.id]}</span>
            <span>{item.label}</span>
          </div>
        ))}

        <div className="sidebar-section">
          <div className="sidebar-section-title clickable" onClick={() => onToggleSection('accounts')}>
            <Contact size={14} /> 常用账号
            <ChevronDown size={12} className={`chevron ${collapsedSections.has('accounts') ? 'collapsed' : ''}`} />
          </div>
        </div>
        {!collapsedSections.has('accounts') && accounts.map(item => (
          <div
            key={item.id}
            className={`sidebar-item ${activeId === item.id ? 'active' : ''}`}
            onClick={() => onSelect(item.id)}
          >
            <span className="sidebar-item-icon">{iconLabel[item.id] || <Contact size={16} color="#f97316" />}</span>
            <span>{item.label}</span>
          </div>
        ))}

        <div className="sidebar-section">
          <div className="sidebar-section-title clickable" onClick={() => onToggleSection('vpn')}>
            <Wifi size={14} /> VPN配置
            <ChevronDown size={12} className={`chevron ${collapsedSections.has('vpn') ? 'collapsed' : ''}`} />
          </div>
        </div>
        {!collapsedSections.has('vpn') && vpnSites.map(item => (
          <div
            key={item.id}
            className={`sidebar-item ${activeId === item.id ? 'active' : ''}`}
            onClick={() => onSelect(item.id)}
          >
            <span className="sidebar-item-icon">
              <img src={favicons[item.id]} alt="" className="sidebar-icon-img" />
            </span>
            <span>{item.label}</span>
          </div>
        ))}
      </div>

      <div style={{ padding: '6px 8px', borderTop: '1px solid var(--border-color)' }}>
        <div
          className="sidebar-item"
          onClick={(e) => { e.stopPropagation(); setShowDlFlyout(!showDlFlyout) }}
          style={{ fontSize: 12, color: activeDownloads.length > 0 ? '#10b981' : 'var(--text-muted)', position: 'relative' }}
        >
          <span className="sidebar-item-icon"><Download size={14} /></span>
          <span>下载 {activeDownloads.length > 0 && `(${activeDownloads.length})`}</span>
        </div>
        <div className="sidebar-item" onClick={onToggleTheme} style={{ fontSize: 12, color: 'var(--text-muted)' }}>
          <span className="sidebar-item-icon">{theme === 'dark' ? <Sun size={14} /> : <Moon size={14} />}</span>
          <span>{theme === 'dark' ? '浅色主题' : '深色主题'}</span>
        </div>
        <div className="sidebar-item" onClick={onOpenSettings} style={{ fontSize: 12, color: 'var(--text-muted)' }}>
          <span className="sidebar-item-icon"><Settings size={14} /></span>
          <span>设置</span>
        </div>
      </div>
      {showDlFlyout && hasDownloads && (
        <div className="dl-flyout dl-expanded" onClick={e => e.stopPropagation()}>
          <div className="dl-flyout-header">
            <span>下载 {activeDownloads.length > 0 && `(${activeDownloads.length} 进行中)`}</span>
            <span className="dl-flyout-clear" onClick={() => { onClearDownloads(); setShowDlFlyout(false) }}>清除已完成</span>
          </div>
          <div className="dl-flyout-list">
            {downloads.map(dl => (
              <div key={dl.id} className="dl-item">
                <div className="dl-icon">{dl.state === 'completed' ? '✅' : dl.state === 'failed' ? '❌' : '📥'}</div>
                <div className="dl-info">
                  <div className="dl-name" title={dl.filename}>{dl.filename}</div>
                  {dl.state === 'progress' && (
                    <>
                      <div className="dl-meta">
                        {dl.totalBytes > 0
                          ? `${(dl.receivedBytes / 1e6).toFixed(1)} / ${(dl.totalBytes / 1e6).toFixed(1)} MB · ${Math.round((dl.receivedBytes / dl.totalBytes) * 100)}%`
                          : `${(dl.receivedBytes / 1e6).toFixed(1)} MB · 下载中`
                        }
                      </div>
                      <div className="dl-bar-wrap"><div className="dl-bar" style={{ width: dl.totalBytes > 0 ? `${(dl.receivedBytes / dl.totalBytes) * 100}%` : '20%' }} /></div>
                    </>
                  )}
                  {dl.state === 'completed' && <div className="dl-meta">已完成 · {(dl.receivedBytes / 1e6).toFixed(1)} MB</div>}
                  {dl.state === 'failed' && <div className="dl-meta">已取消或失败</div>}
                </div>
                <div className="dl-actions">
                  {dl.state === 'progress' && (
                    <span className="dl-cancel" onClick={() => onCancelDownload(dl.id)}>✕</span>
                  )}
                  {dl.state === 'completed' && dl.filePath && (
                    <span className="dl-open" onClick={() => window.electronAPI?.shellShowItem(dl.filePath!)} title="在文件夹中显示"><FolderOpen size={14} /></span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
