import { useState, useEffect } from 'react'
import { Globe, Brush, Settings, Sun, Moon, ChevronLeft, ChevronRight, Wrench, Layers, CreditCard, Wifi, User, ChevronDown, Sparkles, Images, HistoryIcon, LayoutGrid, Wallet, Contact, Download, FolderOpen, LayoutDashboard, Workflow } from 'lucide-react'
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
  onSidebarActivity: () => void
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

export default function Sidebar({ items, activeId, theme, collapsed, collapsedSections, downloads, expandDownloads, onSelect, onToggleTheme, onToggleCollapse, onOpenSettings, onToggleSection, onGoHome, onCancelDownload, onClearDownloads, onSidebarActivity, agentOpen, onToggleAgent }: SidebarProps) {
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
  const xhsSites = items.filter(i => i.type === 'xhs')
const imageWorkshopItems = items.filter(i => i.type === 'tool')
const consoleItems = items.filter(i => i.type === 'aggregator' || i.type === 'account' || i.type === 'vpn')
const comfyuiPageItem = items.find(i => i.type === 'comfyui-page')

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
    <div className="sidebar sidebar-collapsed" onMouseMove={onSidebarActivity} onMouseEnter={onSidebarActivity}>
      <div className="sidebar-collapse-toggle" onClick={onToggleCollapse} title="展开侧栏">
        <ChevronRight size={14} />
      </div>
      <div className="sidebar-nav-collapsed">
        {websites.map(item => (
          <div key={item.id} className={`sidebar-icon-item ${activeId === item.id ? 'active' : ''}`} onClick={() => onSelect(item.id)} title={item.label}>
            {favicons[item.id] ? <img src={favicons[item.id]} alt={item.label} className="sidebar-icon-img" /> : (iconLabel[item.id] || <Globe size={14} />)}
          </div>
        ))}
        <div className="sidebar-sep" />
        {xhsSites.map(item => (
          <div key={item.id} className={`sidebar-icon-item ${activeId === item.id ? 'active' : ''}`} onClick={() => onSelect(item.id)} title={item.label}>
            {favicons[item.id] ? <img src={favicons[item.id]} alt={item.label} className="sidebar-icon-img" /> : (iconLabel[item.id] || <Globe size={14} />)}
          </div>
        ))}
        <div className="sidebar-sep" />
        {comfyuiPageItem && (
          <div key={comfyuiPageItem.id} className={`sidebar-icon-item ${activeId === comfyuiPageItem.id ? 'active' : ''}`} onClick={() => onSelect(comfyuiPageItem.id)} title={comfyuiPageItem.label}>
            <img src="./favicons/duannao.png" alt="" className="sidebar-icon-img" />
          </div>
        )}
        {imageWorkshopItems.map(item => (
          <div key={item.id} className={`sidebar-icon-item ${activeId === item.id ? 'active' : ''}`} onClick={() => onSelect(item.id)} title={item.label}>
            {item.type === 'comfyui'
              ? (favicons[item.id] ? <img src={favicons[item.id]} alt={item.label} className="sidebar-icon-img" /> : (iconLabel[item.id] || <Globe size={14} />))
              : (toolIcons[item.id] || <Brush size={14} />)}
          </div>
        ))}
        <div className="sidebar-sep" />
        {consoleItems.map(item => {
          const isAccount = item.type === 'account'
          const isVpn = item.type === 'vpn'
          return (
          <div key={item.id} className={`sidebar-icon-item ${activeId === item.id ? 'active' : ''}`} onClick={() => onSelect(item.id)} title={item.label}>
            {isVpn && favicons[item.id] ? <img src={favicons[item.id]} alt={item.label} className="sidebar-icon-img" />
             : isAccount ? (iconLabel[item.id] || <Contact size={14} color="#f97316" />)
             : (aggregatorIcons[item.id] || <Globe size={14} />)}
          </div>
          )
        })}
      </div>
      <div className="sidebar-footer-collapsed">
        <div className={`sidebar-icon-item${showDlFlyout ? ' active' : ''}`} onClick={(e) => { e.stopPropagation(); setShowDlFlyout(!showDlFlyout) }} title={`下载${activeDownloads.length > 0 ? ` (${activeDownloads.length} 进行中)` : ''}`} style={{ position: 'relative', color: activeDownloads.length > 0 ? '#10b981' : 'var(--text-muted)' }}>
          <Download size={14} />
          {activeDownloads.length > 0 && <span className="dl-icon-badge">{activeDownloads.length}</span>}
        </div>
        <div className="sidebar-icon-item" onClick={onToggleTheme} title={theme === 'dark' ? '浅色主题' : '深色主题'}>
          {theme === 'dark' ? <Sun size={14} /> : <Moon size={14} />}
        </div>
        <div className="sidebar-icon-item" onClick={onOpenSettings} title="设置">
          <Settings size={14} />
        </div>
      </div>
      {showDlFlyout && hasDownloads && (
        <div className="dl-flyout" onClick={e => e.stopPropagation()}>
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
                      <div className="dl-meta">{dl.totalBytes > 0 ? `${(dl.receivedBytes / 1e6).toFixed(1)} / ${(dl.totalBytes / 1e6).toFixed(1)} MB · ${Math.round((dl.receivedBytes / dl.totalBytes) * 100)}%` : `${(dl.receivedBytes / 1e6).toFixed(1)} MB · 下载中`}</div>
                      <div className="dl-bar-wrap"><div className="dl-bar" style={{ width: dl.totalBytes > 0 ? `${(dl.receivedBytes / dl.totalBytes) * 100}%` : '20%' }} /></div>
                    </>
                  )}
                  {dl.state === 'completed' && <div className="dl-meta">已完成 · {(dl.receivedBytes / 1e6).toFixed(1)} MB</div>}
                  {dl.state === 'failed' && <div className="dl-meta">已取消或失败</div>}
                </div>
                <div className="dl-actions">
                  {dl.state === 'progress' && <span className="dl-cancel" onClick={() => onCancelDownload(dl.id)}>✕</span>}
                  {dl.state === 'completed' && dl.filePath && <span className="dl-open" onClick={() => window.electronAPI?.shellShowItem(dl.filePath!)} title="在文件夹中显示"><FolderOpen size={14} /></span>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

  return (
    <div className="sidebar" onMouseMove={onSidebarActivity} onMouseEnter={onSidebarActivity}>
      <div className="sidebar-header">
        <div className="sidebar-header-title" onClick={onGoHome} title="回到主页">
          <h1>AI Web Tools</h1>
        </div>
        <div className="sidebar-collapse-toggle" onClick={onToggleCollapse} title="收起侧栏">
          <ChevronLeft size={14} />
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
          <div className="sidebar-section-title clickable" onClick={() => onToggleSection('xhs')}>
            <Globe size={14} /> 小红书工作台
            <ChevronDown size={12} className={`chevron ${collapsedSections.has('xhs') ? 'collapsed' : ''}`} />
          </div>
        </div>
        {!collapsedSections.has('xhs') && xhsSites.map(item => (
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
          <div className="sidebar-section-title clickable" onClick={() => onToggleSection('image-workshop')}>
            <Brush size={14} /> 图像工坊
            <ChevronDown size={12} className={`chevron ${collapsedSections.has('image-workshop') ? 'collapsed' : ''}`} />
          </div>
        </div>
        {!collapsedSections.has('image-workshop') && comfyuiPageItem && (
          <div
            key={comfyuiPageItem.id}
            className={`sidebar-item ${activeId === comfyuiPageItem.id ? 'active' : ''}`}
            onClick={() => onSelect(comfyuiPageItem.id)}
          >
            <span className="sidebar-item-icon"><img src="./favicons/duannao.png" alt="" className="sidebar-icon-img" /></span>
            <span>{comfyuiPageItem.label}</span>
          </div>
        )}
        {!collapsedSections.has('image-workshop') && imageWorkshopItems.map(item => (
          <div
            key={item.id}
            className={`sidebar-item ${activeId === item.id ? 'active' : ''}`}
            onClick={() => onSelect(item.id)}
          >
            <span className="sidebar-item-icon">
              {item.type === 'comfyui'
                ? (favicons[item.id] ? <img src={favicons[item.id]} alt="" className="sidebar-icon-img" /> : (iconLabel[item.id] || <Globe size={16} />))
                : (toolIcons[item.id] || <Brush size={16} />)}
            </span>
            <span>{item.label}</span>
          </div>
        ))}
        <div className="sidebar-section">
          <div className="sidebar-section-title clickable" onClick={() => onToggleSection('console')}>
            <Layers size={14} /> 控制台
            <ChevronDown size={12} className={`chevron ${collapsedSections.has('console') ? 'collapsed' : ''}`} />
          </div>
        </div>
        {!collapsedSections.has('console') && consoleItems.map(item => {
          const isAccount = item.type === 'account'
          const isVpn = item.type === 'vpn'
          return (
            <div
              key={item.id}
              className={`sidebar-item ${activeId === item.id ? 'active' : ''}`}
              onClick={() => onSelect(item.id)}
            >
              <span className="sidebar-item-icon">
                {isVpn && favicons[item.id] ? <img src={favicons[item.id]} alt="" className="sidebar-icon-img" />
                 : isAccount ? (iconLabel[item.id] || <Contact size={16} color="#f97316" />)
                 : (aggregatorIcons[item.id] || <Globe size={16} />)}
              </span>
              <span>{item.label}</span>
            </div>
          )
        })}
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
