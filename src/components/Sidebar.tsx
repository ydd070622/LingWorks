import { Globe, Brush, Settings, Clock, Sun, Moon, ChevronLeft, ChevronRight, Wrench, Grid3X3, Layers, CreditCard, Wifi, User } from 'lucide-react'
import type { NavItem } from '../types'

interface SidebarProps {
  items: NavItem[]
  activeId: string
  theme: 'dark' | 'light'
  collapsed: boolean
  onSelect: (id: string) => void
  onToggleTheme: () => void
  onToggleCollapse: () => void
  onOpenSettings: () => void
}

const toolIcons: Record<string, React.ReactNode> = {
  txt2img: <Brush size={16} />,
  img2img: <Brush size={16} />,
  history: <Clock size={16} />,
}

const aggregatorIcons: Record<string, React.ReactNode> = {
  platforms: <Grid3X3 size={16} />,
  recharge: <CreditCard size={16} />,
}

const favicons: Record<string, string> = {
  liblib: './favicons/liblib.png',
  runninghub: './favicons/runninghub.png',
  tapnow: './favicons/tapnow.jpg',
  chatgpt: './favicons/chatgpt.png',
  gemini: './favicons/gemini.png',
  skyun: './favicons/skyun.png',
  mitce: './favicons/mitce.png',
}

const iconLabel: Record<string, string> = {
  liblib: 'Lib', runninghub: 'RH', tapnow: 'TN', chatgpt: 'CG', gemini: 'GE',
  txt2img: '文', img2img: '图', history: '历',
  platforms: '台', recharge: '充', accounts: '号',
  skyun: 'SK', mitce: 'MC',
}

export default function Sidebar({ items, activeId, theme, collapsed, onSelect, onToggleTheme, onToggleCollapse, onOpenSettings }: SidebarProps) {
  const websites = items.filter(i => i.type === 'website')
  const tools = items.filter(i => i.type === 'tool')
  const aggregators = items.filter(i => i.type === 'aggregator')
  const accounts = items.filter(i => i.type === 'account')
  const vpnSites = items.filter(i => i.type === 'vpn')

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
          <div className="sidebar-icon-item" onClick={onToggleTheme} title={theme === 'dark' ? '浅色' : '深色'}>
            {theme === 'dark' ? <Sun size={14} /> : <Moon size={14} />}
          </div>
          <div className="sidebar-icon-item" onClick={onOpenSettings} title="API 设置">
            <Settings size={14} />
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="sidebar">
      <div className="sidebar-header">
        <div>
          <h1>AI Web Tools</h1>
        </div>
        <div className="sidebar-collapse-toggle" onClick={onToggleCollapse} title="收起侧栏">
          <ChevronLeft size={14} />
        </div>
      </div>

      <div className="sidebar-section">
        <div className="sidebar-section-title"><Globe size={14} /> 常用网站</div>
      </div>
      <div className="sidebar-nav">
        {websites.map(item => (
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

        <div className="sidebar-section" style={{ marginTop: 12 }}>
          <div className="sidebar-section-title"><Wrench size={14} /> 生图工具</div>
        </div>
        {tools.map(item => (
          <div
            key={item.id}
            className={`sidebar-item ${activeId === item.id ? 'active' : ''}`}
            onClick={() => onSelect(item.id)}
          >
            <span className="sidebar-item-icon">{toolIcons[item.id] || <Brush size={16} />}</span>
            <span>{item.label}</span>
          </div>
        ))}

        <div className="sidebar-section" style={{ marginTop: 12 }}>
          <div className="sidebar-section-title"><Layers size={14} /> 聚合网站</div>
        </div>
        {aggregators.map(item => (
          <div
            key={item.id}
            className={`sidebar-item ${activeId === item.id ? 'active' : ''}`}
            onClick={() => onSelect(item.id)}
          >
            <span className="sidebar-item-icon">{aggregatorIcons[item.id]}</span>
            <span>{item.label}</span>
          </div>
        ))}

        <div className="sidebar-section" style={{ marginTop: 12 }}>
          <div className="sidebar-section-title"><User size={14} /> 常用账号</div>
        </div>
        {accounts.map(item => (
          <div
            key={item.id}
            className={`sidebar-item ${activeId === item.id ? 'active' : ''}`}
            onClick={() => onSelect(item.id)}
          >
            <span className="sidebar-item-icon"><User size={16} /></span>
            <span>{item.label}</span>
          </div>
        ))}

        <div className="sidebar-section" style={{ marginTop: 12 }}>
          <div className="sidebar-section-title"><Wifi size={14} /> VPN配置</div>
        </div>
        {vpnSites.map(item => (
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
        <div className="sidebar-item" onClick={onToggleTheme} style={{ fontSize: 12, color: 'var(--text-muted)' }}>
          <span className="sidebar-item-icon">{theme === 'dark' ? <Sun size={14} /> : <Moon size={14} />}</span>
          <span>{theme === 'dark' ? '浅色主题' : '深色主题'}</span>
        </div>
        <div className="sidebar-item" onClick={onOpenSettings} style={{ fontSize: 12, color: 'var(--text-muted)' }}>
          <span className="sidebar-item-icon"><Settings size={14} /></span>
          <span>API 设置</span>
        </div>
      </div>
    </div>
  )
}
