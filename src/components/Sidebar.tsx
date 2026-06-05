import { useState, useEffect } from 'react'
import { Globe, Brush, Settings, Sun, Moon, ChevronLeft, ChevronRight, Wrench, Layers, CreditCard, Wifi, User, ChevronDown, Sparkles, Images, HistoryIcon, LayoutGrid, Wallet, Contact, Download, FolderOpen } from 'lucide-react'
import type { NavItem, DownloadItem } from '../types'

interface SidebarProps {
  items: NavItem[]
  activeId: string
  theme: 'dark' | 'light'
  collapsed: boolean
  collapsedSections: Set<string>
  downloads: DownloadItem[]
  onSelect: (id: string) => void
  onToggleTheme: () => void
  onToggleCollapse: () => void
  onOpenSettings: () => void
  onToggleSection: (sectionId: string) => void
  onGoHome: () => void
  onCancelDownload: (id: string) => void
  onClearDownloads: () => void
}

const toolIcons: Record<string, React.ReactNode> = {
  txt2img: <Sparkles size={16} color="#f59e0b" />,
  img2img: <Images size={16} color="#8b5cf6" />,
  history: <HistoryIcon size={16} color="#06b6d4" />,
}

const aggregatorIcons: Record<string, React.ReactNode> = {
  platforms: <LayoutGrid size={16} color="#6366f1" />,
  recharge: <Wallet size={16} color="#22c55e" />,
}

const favicons: Record<string, string> = {
  liblib: './favicons/liblib.png',
  runninghub: './favicons/runninghub.png',
  tapnow: './favicons/tapnow.jpg',
  chatgpt: './favicons/chatgpt.png',
  github: './favicons/github.png',
  gemini: './favicons/gemini.png',
  skyun: './favicons/skyun.png',
  mitce: './favicons/mitce.png',
}

const iconLabel: Record<string, React.ReactNode> = {
  liblib: 'Lib', runninghub: 'RH', tapnow: 'TN', chatgpt: 'CG', github: 'GH', gemini: 'GE',
  txt2img: <Sparkles size={16} color="#f59e0b" />,
  img2img: <Images size={16} color="#8b5cf6" />,
  history: <HistoryIcon size={16} color="#06b6d4" />,
  platforms: <LayoutGrid size={16} color="#6366f1" />,
  recharge: <Wallet size={16} color="#22c55e" />,
  accounts: <Contact size={16} color="#f97316" />,
  skyun: 'SK', mitce: 'MC',
}

export default function Sidebar({ items, activeId, theme, collapsed, collapsedSections, downloads, onSelect, onToggleTheme, onToggleCollapse, onOpenSettings, onToggleSection, onGoHome, onCancelDownload, onClearDownloads }: SidebarProps) {
  const websites = items.filter(i => i.type === 'website')
  const tools = items.filter(i => i.type === 'tool')
  const aggregators = items.filter(i => i.type === 'aggregator')
  const accounts = items.filter(i => i.type === 'account')
  const vpnSites = items.filter(i => i.type === 'vpn')

  const activeDownloads = downloads.filter(d => d.state === 'progress')
  const hasDownloads = downloads.length > 0
  const [showDlFlyout, setShowDlFlyout] = useState(false)

  useEffect(() => {
    if (!showDlFlyout) return
    const handler = () => setShowDlFlyout(false)
    document.addEventListener('click', handler)
    return () => document.removeEventListener('click', handler)
  }, [showDlFlyout])

  if (collapsed) {
    return (
      <div className="sidebar sidebar-collapsed">
        <div className="sidebar-collapse-toggle" onClick={onToggleCollapse}>
          <ChevronRight size={14} />
        </div>
        <div className="sidebar-nav-collapsed">
          {websites.map(item => (
            <div
              key={item.id}
              className={`sidebar-icon-item ${activeId === item.id ? 'active' : ''}`}
              onClick={() => onSelect(item.id)}
              title={item.label}
            >
              <img src={favicons[item.id]} alt={item.label} className="sidebar-icon-img" />
            </div>
          ))}
          <div className="sidebar-sep" />
          {tools.map(item => (
            <div
              key={item.id}
              className={`sidebar-icon-item ${activeId === item.id ? 'active' : ''}`}
              onClick={() => onSelect(item.id)}
              title={item.label}
            >
              {iconLabel[item.id]}
            </div>
          ))}
          <div className="sidebar-sep" />
          {aggregators.map(item => (
            <div
              key={item.id}
              className={`sidebar-icon-item ${activeId === item.id ? 'active' : ''}`}
              onClick={() => onSelect(item.id)}
              title={item.label}
            >
              {iconLabel[item.id]}
            </div>
          ))}
          <div className="sidebar-sep" />
          {accounts.map(item => (
            <div
              key={item.id}
              className={`sidebar-icon-item ${activeId === item.id ? 'active' : ''}`}
              onClick={() => onSelect(item.id)}
              title={item.label}
            >
              {iconLabel[item.id]}
            </div>
          ))}
          <div className="sidebar-sep" />
          {vpnSites.map(item => (
            <div
              key={item.id}
              className={`sidebar-icon-item ${activeId === item.id ? 'active' : ''}`}
              onClick={() => onSelect(item.id)}
              title={item.label}
            >
              <img src={favicons[item.id]} alt={item.label} className="sidebar-icon-img" />
            </div>
          ))}
        </div>
        <div className="sidebar-footer-collapsed">
          {hasDownloads && (
            <div
              className={`sidebar-icon-item${showDlFlyout ? ' active' : ''}`}
              onClick={(e) => { e.stopPropagation(); setShowDlFlyout(!showDlFlyout) }}
              title={`下载 (${activeDownloads.length} 进行中)`}
              style={{ position: 'relative', color: activeDownloads.length > 0 ? '#10b981' : 'var(--text-muted)' }}
            >
              <Download size={14} />
              {activeDownloads.length > 0 && (
                <span className="dl-icon-badge">{activeDownloads.length}</span>
              )}
            </div>
          )}
          <div className="sidebar-icon-item" onClick={onToggleTheme} title={theme === 'dark' ? '浅色' : '深色'}>
            {theme === 'dark' ? <Sun size={14} /> : <Moon size={14} />}
          </div>
          <div className="sidebar-icon-item" onClick={onOpenSettings} title="设置">
            <Settings size={14} />
          </div>
        </div>
        {showDlFlyout && hasDownloads && (
          <div className={`dl-flyout${collapsed ? '' : ' dl-expanded'}`} onClick={e => e.stopPropagation()}>
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

  return (
    <div className="sidebar">
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
              <img src={favicons[item.id]} alt="" className="sidebar-icon-img" />
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
            <span className="sidebar-item-icon"><Contact size={16} color="#f97316" /></span>
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
        {hasDownloads && (
          <div
            className="sidebar-item"
            onClick={(e) => { e.stopPropagation(); setShowDlFlyout(!showDlFlyout) }}
            style={{ fontSize: 12, color: activeDownloads.length > 0 ? '#10b981' : 'var(--text-muted)', position: 'relative' }}
          >
            <span className="sidebar-item-icon"><Download size={14} /></span>
            <span>下载 {activeDownloads.length > 0 && `(${activeDownloads.length})`}</span>
          </div>
        )}
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
        <div className={`dl-flyout${collapsed ? '' : ' dl-expanded'}`} onClick={e => e.stopPropagation()}>
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
