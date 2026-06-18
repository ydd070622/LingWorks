import { useEffect, useRef, useState, useCallback } from 'react'
import { ArrowLeft, User, Plus, Trash2, Edit3, Check, X, Settings, RefreshCw, ArrowLeft as ArrowLeftIcon, ArrowRight, Copy, ExternalLink } from 'lucide-react'

type WebviewElement = HTMLElement & {
  src: string
  getURL: () => string
  getWebContentsId: () => number
  canGoBack: () => boolean
  goBack: () => void
  goForward: () => void
  reload: () => void
  executeJavaScript: (code: string) => Promise<any>
  addEventListener: (event: string, handler: (...args: any[]) => void) => void
}

interface AccountConfig {
  id: string
  name: string
  color: string
  loggedIn?: boolean
  lastLogin?: number
  lastActive?: number
}

interface Tab {
  id: string
  url: string
  title: string
}

const COLORS = ['#ff6b6b', '#feca57', '#48dbfb', '#a29bfe', '#55efc4', '#fd79a8', '#fdcb6e', '#74b9ff']
const STORE_KEY = 'xhs_accounts'

const SITES = [
  { key: 'xhs',     label: '小红书',    url: 'https://www.xiaohongshu.com',       emoji: '📕', bg: 'rgba(255,71,87,0.15)',   border: 'rgba(255,71,87,0.4)',   text: '#ff4757' },
  { key: 'jg',      label: '聚光平台', url: 'https://ad.xiaohongshu.com',          emoji: '📊', bg: 'rgba(255,138,101,0.12)', border: 'rgba(255,138,101,0.4)', text: '#ff8a65' },
  { key: 'creator', label: '创作者中心', url: 'https://creator.xiaohongshu.com',    emoji: '✍️', bg: 'rgba(99,102,241,0.12)',  border: 'rgba(99,102,241,0.4)',  text: '#818cf8' },
  { key: 'pro',     label: '专业号',    url: 'https://business.xiaohongshu.com',    emoji: '💼', bg: 'rgba(245,158,11,0.12)', border: 'rgba(245,158,11,0.4)',  text: '#fbbf24' },
]

function genColor(i: number) { return COLORS[i % COLORS.length] }

function formatRelativeTime(ts?: number): string {
  if (!ts) return '未知'
  const diff = Date.now() - ts
  const min = Math.floor(diff / 60000)
  if (min < 1) return '刚刚'
  if (min < 60) return `${min} 分钟前`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr} 小时前`
  const day = Math.floor(hr / 24)
  if (day < 7) return `${day} 天前`
  const d = new Date(ts)
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

function defaultAccounts(): AccountConfig[] {
  const now = Date.now()
  return [
    { id: 'xhs_account_1', name: '小红书·账号一', color: genColor(0), loggedIn: true, lastLogin: now - 3600000, lastActive: now - 600000 },
    { id: 'xhs_account_2', name: '小红书·账号二', color: genColor(1), loggedIn: true, lastLogin: now - 7200000, lastActive: now - 3600000 },
    { id: 'xhs_account_3', name: '小红书·账号三', color: genColor(2), loggedIn: false, lastLogin: now - 86400000, lastActive: now - 43200000 },
  ]
}

let tabCounter = 0

export default function XiaoHongShuCards({ onUrlChange, resetKey }: { onUrlChange?: (url: string, pageContent?: string) => void; resetKey?: number }) {
  const [accounts, setAccounts] = useState<AccountConfig[]>(defaultAccounts())
  const [loaded, setLoaded] = useState(false)
  const [manageMode, setManageMode] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [activeView, setActiveView] = useState<{ account: AccountConfig; url: string; label: string } | null>(null)
  const [showGrid, setShowGrid] = useState(true)

  // Re-clicking sidebar "小红书" returns to grid WITHOUT destroying webviews
  useEffect(() => {
    if (resetKey && resetKey > 0) setShowGrid(true)
  }, [resetKey])

  const [tabs, setTabs] = useState<Tab[]>([])
  const [activeTabId, setActiveTabId] = useState('')
  const [ctxTab, setCtxTab] = useState<Tab | null>(null)
  const [ctxPos, setCtxPos] = useState<{ x: number; y: number } | null>(null)
  const wvMap = useRef<Map<string, WebviewElement>>(new Map())
  const containerRef = useRef<HTMLDivElement>(null)
  const accountRef = useRef(activeView)

  useEffect(() => { accountRef.current = activeView }, [activeView])

  useEffect(() => {
    (async () => {
      const saved = await window.electronAPI?.getStore(STORE_KEY)
      if (Array.isArray(saved) && saved.length > 0) {
        // Add default status fields for old accounts
        const migrated = (saved as AccountConfig[]).map(a => ({
          ...a,
          loggedIn: a.loggedIn ?? false,
          lastLogin: a.lastLogin ?? 0,
          lastActive: a.lastActive ?? 0,
        }))
        setAccounts(migrated)
      }
      setLoaded(true)
    })()
  }, [])

  // Init tabs when entering a view
  useEffect(() => {
    if (!activeView) return
    const initId = `xhs-${++tabCounter}`
    setTabs([{ id: initId, url: activeView.url, title: activeView.label }])
    setActiveTabId(initId)
    setCtxTab(null)
    setCtxPos(null)
  }, [activeView?.account.id, activeView?.url])

  const saveStore = useCallback(async (list: AccountConfig[]) => {
    if (window.electronAPI) await window.electronAPI.setStore(STORE_KEY, list)
  }, [])

  const createWebview = useCallback((tabId: string, tabUrl: string) => {
    const acc = accountRef.current
    const accountId = acc?.account.id || ''
    const wv = document.createElement('webview') as unknown as WebviewElement
    wv.setAttribute('src', tabUrl)
    wv.setAttribute('partition', `persist:${accountId}`)
    wv.setAttribute('disablewebsecurity', '')
    wv.setAttribute('allowpopups', '')
    Object.assign(wv.style, {
      width: '100%', height: '100%', border: 'none',
      position: 'absolute', top: '0', left: '0',
    })

    wv.addEventListener('page-title-updated', (e: any) => {
      if (e.title) {
        setTabs(prev => prev.map(t => t.id === tabId ? { ...t, title: e.title } : t))
      }
    })

    // Report URL + rendered DOM content for agent context
    wv.addEventListener('did-finish-load', () => {
      if (onUrlChange) {
        const url = (wv as any).getURL?.() || tabUrl
        try {
          ;(wv as any).executeJavaScript('document.body?document.body.innerText:document.documentElement.innerText').then((content: string) => {
            const trimmed = content?.slice(0, 8000) || ''
            onUrlChange(url, trimmed ? `页面内容（前8000字符）:\n${trimmed}` : undefined)
          }).catch(() => {
            onUrlChange(url)
          })
        } catch {
          onUrlChange(url)
        }
      }
      try {
        ;(wv as any).executeJavaScript(`
          Object.defineProperty(navigator,'webdriver',{get:function(){return false}});
          document.addEventListener('click',function(e){
            var a=e.target.closest('a');
            if(a&&a.target==='_blank'&&a.href){
              e.preventDefault();e.stopPropagation();
              window.location.href=a.href;
            }
          },true);
        `)
      } catch (_) { /* ignore */ }
    })

    wv.addEventListener('did-navigate-in-page', ((e: any) => {
      if (onUrlChange && e.url) {
        // Delay extraction to wait for SPA content to render after navigation
        setTimeout(() => {
          try {
            ;(wv as any).executeJavaScript('document.body?document.body.innerText:document.documentElement.innerText').then((content: string) => {
              const trimmed = content?.slice(0, 8000) || ''
              onUrlChange(e.url, trimmed ? `页面内容（前8000字符）:\n${trimmed}` : undefined)
            }).catch(() => {
              onUrlChange(e.url)
            })
          } catch {
            onUrlChange(e.url)
          }
        }, 1200)
      }
    }) as EventListener)

    wv.addEventListener('new-window', (e: any) => {
      e.preventDefault()
      const url = e.url || e.targetUrl
      if (url && wv) {
        ;(wv as any).loadURL(url)
      }
    })

    return wv
  }, [])

  useEffect(() => {
    const container = containerRef.current
    if (!container || !activeView) return

    const tab = tabs.find(t => t.id === activeTabId)
    if (!tab) return

    let wv = wvMap.current.get(tab.id)
    if (!wv) {
      wv = createWebview(tab.id, tab.url)
      wvMap.current.set(tab.id, wv)
    }

    if (!container.contains(wv)) {
      container.appendChild(wv)
    }
    wvMap.current.forEach((w, id) => {
      if (container.contains(w)) {
        (w.style as any).display = id === tab.id ? '' : 'none'
      }
    })
  }, [activeTabId, tabs, activeView, createWebview])

  useEffect(() => {
    return () => {
      wvMap.current.forEach(w => w.remove())
      wvMap.current.clear()
    }
  }, [])

  const handleClose = (id: string) => {
    if (tabs.length <= 1) return
    setTabs(prev => {
      const idx = prev.findIndex(t => t.id === id)
      const next = prev.filter(t => t.id !== id)
      setActiveTabId(activeTabId === id ? next[Math.min(idx, next.length - 1)].id : activeTabId)
      return next
    })
    const wv = wvMap.current.get(id)
    if (wv) { wv.remove(); wvMap.current.delete(id) }
  }

  const handleRefresh = () => {
    const wv = wvMap.current.get(activeTabId)
    if (wv) (wv as any).reload?.()
  }

  const handleGoBack = () => {
    const wv = wvMap.current.get(activeTabId)
    if (wv) (wv as any).goBack?.()
  }

  const handleGoForward = () => {
    const wv = wvMap.current.get(activeTabId)
    if (wv) (wv as any).goForward?.()
  }

  const handleTabContext = (e: React.MouseEvent, tab: Tab) => {
    e.preventDefault()
    setCtxTab(tab)
    setCtxPos({ x: e.clientX, y: e.clientY })
  }

  const closeCtx = () => { setCtxTab(null); setCtxPos(null) }

  const handleCopyUrl = () => {
    if (!ctxTab) return
    const wv = wvMap.current.get(ctxTab.id)
    const url = wv ? ((wv as any).getURL?.() || wv.src) : ctxTab.url
    navigator.clipboard.writeText(url).catch(() => {})
    closeCtx()
  }

  const handleOpenExternal = () => {
    if (ctxTab) {
      if (window.electronAPI) window.electronAPI.openExternal(ctxTab.url)
      else window.open(ctxTab.url, '_blank')
    }
    closeCtx()
  }

  const renameAccount = async (id: string, name: string) => {
    const updated = accounts.map(a => a.id === id ? { ...a, name } : a)
    setAccounts(updated)
    saveStore(updated)
    setEditingId(null)
  }

  const deleteAccount = async (id: string) => {
    const updated = accounts.filter(a => a.id !== id)
    setAccounts(updated)
    saveStore(updated)
  }

  const addAccount = async () => {
    const idx = accounts.length
    const newAcc: AccountConfig = {
      id: `xhs_account_${Date.now()}`,
      name: `小红书·账号${idx + 1}`,
      color: genColor(idx),
      loggedIn: false,
      lastLogin: 0,
      lastActive: 0,
    }
    const updated = [...accounts, newAcc]
    setAccounts(updated)
    saveStore(updated)
  }

  const toggleLogin = async (id: string) => {
    const now = Date.now()
    const updated = accounts.map(a => {
      if (a.id !== id) return a
      const newLoggedIn = !a.loggedIn
      return {
        ...a,
        loggedIn: newLoggedIn,
        lastLogin: newLoggedIn ? now : a.lastLogin,
        lastActive: newLoggedIn ? now : a.lastActive,
      }
    })
    setAccounts(updated)
    saveStore(updated)
  }

  if (!loaded) return null

  const cols = Math.min(accounts.length, 4)
  const cardStyle: React.CSSProperties = {
    background: 'var(--bg-secondary)',
    borderRadius: 16,
    border: '1px solid var(--border-color)',
    padding: 24,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 12,
    transition: 'all 0.2s',
    width: cols <= 2 ? 280 : undefined,
    flex: cols > 2 ? 1 : undefined,
  }

  return (
    <>
      {/* WebView area — kept alive even when grid is shown */}
      {activeView && (
      <div style={{ display: showGrid ? 'none' : 'flex', flexDirection: 'column', height: '100%', background: 'var(--bg-primary)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 12px', borderBottom: '1px solid var(--border-color)', flexShrink: 0, overflow: 'hidden' }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: activeView.account.color, flexShrink: 0, whiteSpace: 'nowrap' }}>{activeView.account.name}</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 2, flexShrink: 0 }}>
            <div style={{ padding: '3px 5px', borderRadius: 4, cursor: 'pointer', color: 'var(--text-muted)', display: 'flex' }}
              onClick={handleGoBack} title="后退"><ArrowLeftIcon size={13} /></div>
            <div style={{ padding: '3px 5px', borderRadius: 4, cursor: 'pointer', color: 'var(--text-muted)', display: 'flex' }}
              onClick={handleGoForward} title="前进"><ArrowRight size={13} /></div>
          </div>
          <div style={{ display: 'flex', gap: 2, flex: 1, minWidth: 0, overflow: 'hidden', alignItems: 'center' }}>
            {tabs.map(tab => (
              <div
                key={tab.id}
                style={{
                  display: 'flex', alignItems: 'center', gap: 4,
                  padding: '2px 10px', borderRadius: 6, cursor: 'pointer',
                  fontSize: 11, whiteSpace: 'nowrap', flexShrink: 1, minWidth: 0, maxWidth: 160,
                  background: tab.id === activeTabId ? 'rgba(99,102,241,0.15)' : 'transparent',
                  color: tab.id === activeTabId ? 'var(--text-primary)' : 'var(--text-muted)',
                }}
                onClick={() => setActiveTabId(tab.id)}
                onContextMenu={e => handleTabContext(e, tab)}
              >
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{tab.title}</span>
                {tabs.length > 1 && (
                  <span style={{ opacity: 0.5, fontSize: 14, lineHeight: 1, cursor: 'pointer', flexShrink: 0 }}
                    onClick={e => { e.stopPropagation(); handleClose(tab.id) }}>×</span>
                )}
              </div>
            ))}
          </div>
          <div style={{ padding: '3px 5px', borderRadius: 4, cursor: 'pointer', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}
            onClick={handleRefresh} title="刷新"><RefreshCw size={13} /><span style={{ fontSize: 12 }}>刷新网页</span></div>
        </div>
        <div ref={containerRef} style={{ flex: 1, position: 'relative' }} />
        {ctxTab && ctxPos && (
          <div style={{ position: 'fixed', inset: 0, zIndex: 999 }} onClick={closeCtx} onContextMenu={e => { e.preventDefault(); closeCtx() }}>
            <div style={{
              position: 'absolute', left: ctxPos.x, top: ctxPos.y,
              background: 'var(--bg-secondary)', border: '1px solid var(--border-color)',
              borderRadius: 8, padding: 4, minWidth: 140,
              boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
            }}>
              <div className="webview-ctx-item" onClick={handleCopyUrl}><Copy size={12} /> 复制网址</div>
              <div className="webview-ctx-item" onClick={handleOpenExternal}><ExternalLink size={12} /> 在浏览器中打开</div>
              <div style={{ height: 1, background: 'var(--border-color)', margin: '2px 8px' }} />
              <div className="webview-ctx-item" onClick={() => { handleClose(ctxTab.id); closeCtx() }}>关闭标签</div>
            </div>
          </div>
        )}
      </div>
      )}

      {/* Grid view */}
  <div style={{ display: showGrid ? 'flex' : 'none', height: '100%', background: 'var(--bg-primary)', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 24, maxWidth: 1100, width: '100%', padding: '0 24px' }}>
        <div style={{ textAlign: 'center', display: 'flex', alignItems: 'center', gap: 16 }}>
          <h1 style={{ fontSize: 24, fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>小红书聚光</h1>
          <button
            onClick={() => setManageMode(!manageMode)}
            style={{
              display: 'flex', alignItems: 'center', gap: 4, padding: '4px 12px', borderRadius: 6,
              background: manageMode ? 'var(--accent)' : 'transparent',
              color: manageMode ? '#fff' : 'var(--text-muted)',
              border: `1px solid ${manageMode ? 'var(--accent)' : 'var(--border-color)'}`,
              fontSize: 12, cursor: 'pointer',
            }}
          >
            <Settings size={13} /> {manageMode ? '完成' : '管理'}
          </button>
        </div>
        {manageMode && (
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 8 }}>
            <button
              onClick={addAccount}
              style={{
                display: 'flex', alignItems: 'center', gap: 4, padding: '6px 16px', borderRadius: 8,
                background: 'var(--accent)', color: '#fff', border: 'none',
                fontSize: 13, fontWeight: 600, cursor: 'pointer',
              }}
            >
              <Plus size={14} /> 添加账号
            </button>
          </div>
        )}
        <div style={{ display: 'flex', gap: 20, width: '100%', flexWrap: 'wrap', justifyContent: 'center' }}>
          {accounts.map(acc => {
            const isEditing = editingId === acc.id
            const isOnline = acc.loggedIn
            return (
              <div key={acc.id} style={cardStyle} className="xhs-acc-card">
                {/* Login toggle button */}
                <button
                  className={`xhs-login-btn ${isOnline ? 'logged' : ''}`}
                  onClick={() => toggleLogin(acc.id)}
                >
                  {isOnline ? '✓ 已登录' : '标记登录'}
                </button>

                <div style={{
                  width: 48, height: 48, borderRadius: '50%',
                  background: `${acc.color}22`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  flexShrink: 0, position: 'relative',
                }}>
                  <User size={24} color={acc.color} />
                  <div
                    className={`xhs-online-dot ${isOnline ? 'online' : 'offline'}`}
                    onClick={() => toggleLogin(acc.id)}
                  />
                </div>

                {isEditing ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <input
                      value={editName}
                      onChange={e => setEditName(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') renameAccount(acc.id, editName) }}
                      style={{
                        width: 120, padding: '2px 6px', borderRadius: 4,
                        border: '1px solid var(--accent)', background: 'var(--bg-primary)',
                        color: 'var(--text-primary)', fontSize: 13, textAlign: 'center', outline: 'none',
                      }}
                      autoFocus
                    />
                    <Check size={14} style={{ cursor: 'pointer', color: '#22c55e' }}
                      onClick={() => renameAccount(acc.id, editName)} />
                    <X size={14} style={{ cursor: 'pointer', color: 'var(--text-muted)' }}
                      onClick={() => setEditingId(null)} />
                  </div>
                ) : (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>{acc.name}</span>
                    {manageMode && (
                      <>
                        <Edit3 size={12} style={{ cursor: 'pointer', color: 'var(--text-muted)' }}
                          onClick={() => { setEditingId(acc.id); setEditName(acc.name) }} />
                        <Trash2 size={12} style={{ cursor: 'pointer', color: '#ef4444' }}
                          onClick={() => deleteAccount(acc.id)} />
                      </>
                    )}
                  </div>
                )}

                {/* Status panel */}
                <div className="xhs-status-section">
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11 }}>
                    <span style={{ color: 'var(--text-muted)' }}>登录状态</span>
                    <span style={{ color: isOnline ? '#22c55e' : 'var(--text-muted)', fontWeight: 500 }}>
                      {isOnline ? '● 已登录' : '○ 未登录'}
                    </span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11 }}>
                    <span style={{ color: 'var(--text-muted)' }}>最近活跃</span>
                    <span style={{ color: 'var(--text-secondary)', fontWeight: 500 }}>
                      {formatRelativeTime(acc.lastActive)}
                    </span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11 }}>
                    <span style={{ color: 'var(--text-muted)' }}>上次登录</span>
                    <span style={{ color: 'var(--text-secondary)', fontWeight: 500 }}>
                      {formatRelativeTime(acc.lastLogin)}
                    </span>
                  </div>
                </div>

                <span style={{ fontSize: 11, color: 'var(--text-muted)', opacity: 0.6 }}>🔒 独立 session</span>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, width: '100%', marginTop: 4 }}>
                  {SITES.map(site => (
                    <button
                      key={site.key}
                      onClick={() => {
                        // Update lastActive
                        const updated = accounts.map(a => a.id === acc.id ? { ...a, lastActive: Date.now() } : a)
                        setAccounts(updated)
                        saveStore(updated)
                        setActiveView({ account: acc, url: site.url, label: site.label })
                        setShowGrid(false)
                      }}
                      style={{
                        padding: '7px 8px', borderRadius: 8,
                        background: site.bg,
                        color: site.text,
                        border: `1px solid ${site.border}`,
                        fontSize: 11, fontWeight: 600, cursor: 'pointer',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
                        transition: 'all 0.2s',
                      }}
                    >
                      {site.emoji} {site.label}
                    </button>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
        <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 8 }}>
          每个账号独立 cookie 隔离，小红书、聚光平台、创作者中心、专业号共享同一登录态
        </p>
      </div>
    </div>
    </>
  )
}
