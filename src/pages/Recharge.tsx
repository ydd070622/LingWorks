import { useEffect, useRef, useState, useCallback } from 'react'
import { ArrowLeft, ExternalLink } from 'lucide-react'
import { rechargePlatforms, type RechargePlatform } from '../data/recharge'

interface Tab {
  id: string
  url: string
  title: string
  platformId: string
}

type WebviewElement = HTMLElement & {
  src: string
  partition: string
  getWebContentsId: () => number
}

const rechargeSiteIds = new Set(rechargePlatforms.map(p => p.id))
let tabCounter = 0

export default function Recharge() {
  const [tabs, setTabs] = useState<Tab[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const webviewMap = useRef<Map<string, WebviewElement>>(new Map())
  const containerRef = useRef<HTMLDivElement>(null)
  const isGridView = activeId === null

  useEffect(() => {
    const unsub = window.electronAPI?.onNewTab((data) => {
      if (rechargeSiteIds.has(data.siteId)) {
        const newId = `rtab-${++tabCounter}-${Date.now()}`
        setTabs(prev => [
          ...prev,
          { id: newId, url: data.url, title: '加载中...', platformId: data.siteId },
        ])
        setActiveId(newId)
      }
    })
    return () => unsub?.()
  }, [])

  const createWebview = useCallback((tabId: string, tabUrl: string, platformId: string) => {
    const wv = document.createElement('webview') as unknown as WebviewElement
    wv.setAttribute('src', tabUrl)
    wv.setAttribute('partition', `persist:recharge-${platformId}`)
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

    return wv
  }, [])

  useEffect(() => {
    const container = containerRef.current
    if (!container || isGridView) return

    const tab = tabs.find(t => t.id === activeId)
    if (!tab) return

    let wv = webviewMap.current.get(tab.id)
    if (!wv) {
      wv = createWebview(tab.id, tab.url, tab.platformId)
      webviewMap.current.set(tab.id, wv)
    }

    if (container.firstChild !== wv) {
      while (container.firstChild) container.removeChild(container.firstChild)
      container.appendChild(wv)
    }

    setTimeout(() => (wv as any).focus?.(), 50)
  }, [activeId, isGridView, tabs, createWebview])

  useEffect(() => {
    if (isGridView) {
      if (containerRef.current) {
        while (containerRef.current.firstChild) containerRef.current.removeChild(containerRef.current.firstChild)
      }
      webviewMap.current.forEach(w => { try { w.remove() } catch {} })
      webviewMap.current.clear()
    }
  }, [isGridView])

  useEffect(() => {
    return () => {
      webviewMap.current.forEach(w => w.remove())
      webviewMap.current.clear()
    }
  }, [])

  const openPlatform = (platform: RechargePlatform) => {
    const tabId = `rtab-${++tabCounter}-${Date.now()}`
    setTabs(prev => [
      ...prev,
      { id: tabId, url: platform.url, title: platform.name, platformId: platform.id },
    ])
    setActiveId(tabId)
  }

  const switchTab = (id: string) => setActiveId(id)

  const closeTab = (id: string) => {
    setTabs(prev => {
      const idx = prev.findIndex(t => t.id === id)
      const next = prev.filter(t => t.id !== id)
      if (next.length === 0) {
        setActiveId(null)
      } else {
        setActiveId(activeId === id
          ? next[Math.min(idx, next.length - 1)].id
          : activeId)
      }
      return next
    })
    const wv = webviewMap.current.get(id)
    if (wv) { wv.remove(); webviewMap.current.delete(id) }
  }

  const backToGrid = () => setActiveId(null)

  if (!isGridView) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
        <div className="tab-bar">
          <div
            onClick={backToGrid}
            style={{
              width: 34, height: 28, display: 'flex', alignItems: 'center',
              justifyContent: 'center', cursor: 'pointer', color: 'var(--text-muted)',
              flexShrink: 0, borderRight: '1px solid var(--border-color)',
            }}
            title="返回平台列表"
          >
            <ArrowLeft size={14} />
          </div>
          <div className="tabs-container">
            {tabs.map(tab => (
              <div
                key={tab.id}
                className={'tab-item' + (tab.id === activeId ? ' active' : '')}
                onClick={() => switchTab(tab.id)}
              >
                <span className="tab-title">{tab.title}</span>
                {tabs.length > 1 && (
                  <span className="tab-close" onClick={e => { e.stopPropagation(); closeTab(tab.id) }}>×</span>
                )}
              </div>
            ))}
          </div>
        </div>
        <div ref={containerRef} style={{ flex: 1, position: 'relative' }} />
      </div>
    )
  }

  return (
    <div style={{ padding: 32, height: '100%', overflow: 'auto' }}>
      <div style={{ marginBottom: 24 }}>
        <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 4 }}>充值平台</h2>
        <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>聚合各大AI平台的充值入口</p>
      </div>
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
        gap: 16,
      }}>
        {rechargePlatforms.map(platform => (
          <div
            key={platform.id}
            className="glass-card"
            style={{
              padding: 24,
              cursor: 'pointer',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 12,
              transition: 'all 0.15s',
              border: '1px solid var(--border-color)',
              position: 'relative',
            }}
            onClick={() => openPlatform(platform)}
            onMouseEnter={e => { e.currentTarget.style.borderColor = platform.color; e.currentTarget.style.transform = 'translateY(-2px)' }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border-color)'; e.currentTarget.style.transform = 'none' }}
          >
            <div
              onClick={e => { e.stopPropagation(); if (window.electronAPI) { window.electronAPI.openExternal(platform.url) } else { window.open(platform.url, '_blank') } }}
              style={{
                position: 'absolute', top: 8, right: 8,
                width: 24, height: 24, borderRadius: 4,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: 'var(--text-muted)', cursor: 'pointer', zIndex: 1,
              }}
              title="在浏览器中打开"
              onMouseEnter={e => { e.currentTarget.style.color = 'var(--accent)'; e.currentTarget.style.background = 'var(--bg-card-hover)' }}
              onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-muted)'; e.currentTarget.style.background = 'transparent' }}
            >
              <ExternalLink size={13} />
            </div>
            <div style={{
              width: 56, height: 56, borderRadius: 14,
              background: `${platform.color}22`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              border: `1px solid ${platform.color}44`,
            }}>
              <img
                src={`./favicons/platforms/${platform.id}.png`}
                alt={platform.name}
                style={{ width: 32, height: 32, borderRadius: 6 }}
                onError={e => {
                  (e.target as HTMLElement).style.display = 'none'
                  const parent = (e.target as HTMLElement).parentElement
                  if (parent) {
                    const span = document.createElement('span')
                    span.textContent = platform.name.charAt(0)
                    span.style.cssText = `font-size: 22px; font-weight: 700; color: ${platform.color}`
                    parent.appendChild(span)
                  }
                }}
              />
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 14, fontWeight: 600 }}>{platform.name}</div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2, wordBreak: 'break-all' }}>
                {platform.url.replace(/^https?:\/\//, '')}
              </div>
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 4 }}>
              <ExternalLink size={12} /> 点击打开
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
