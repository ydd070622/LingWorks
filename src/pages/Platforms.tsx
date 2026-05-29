import { useEffect, useRef, useState, useCallback } from 'react'
import { ArrowLeft, ArrowRight, ExternalLink, RefreshCw, Languages } from 'lucide-react'
import { platforms, type Platform } from '../data/platforms'

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

const platformSiteIds = new Set(platforms.map(p => p.id))
let tabCounter = 0

export default function Platforms() {
  const [tabs, setTabs] = useState<Tab[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [translatedTabs, setTranslatedTabs] = useState<Set<string>>(new Set())
  const webviewMap = useRef<Map<string, WebviewElement>>(new Map())
  const containerRef = useRef<HTMLDivElement>(null)
  const isGridView = activeId === null

  useEffect(() => {
    const unsub = window.electronAPI?.onNewTab((data) => {
      if (platformSiteIds.has(data.siteId)) {
        const newId = `ptab-${++tabCounter}-${Date.now()}`
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
    wv.setAttribute('partition', `persist:platform-${platformId}`)
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

    wv.addEventListener('did-finish-load', () => {
      ;(wv as any).executeJavaScript(`
        Object.defineProperty(navigator,'webdriver',{get:function(){return false}});
        Object.defineProperty(navigator,'plugins',{get:function(){return {length:3,item:function(){return null},namedItem:function(){return null},refresh:function(){return false}}});
        Object.defineProperty(navigator,'languages',{get:function(){return ['zh-CN','zh','en']}});
      `)
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

    if (!container.contains(wv)) {
      container.appendChild(wv)
    }
    webviewMap.current.forEach((w, id) => {
      if (container.contains(w)) {
        (w.style as any).display = id === tab.id ? '' : 'none'
      }
    })

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

  const openPlatform = (platform: Platform) => {
    const tabId = `ptab-${++tabCounter}-${Date.now()}`
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

  const handleGoBack = () => {
    const wv = webviewMap.current.get(activeId!)
    if (wv) (wv as any).goBack?.()
  }

  const handleGoForward = () => {
    const wv = webviewMap.current.get(activeId!)
    if (wv) (wv as any).goForward?.()
  }

  const handleRefresh = () => {
    const wv = webviewMap.current.get(activeId!)
    if (wv) (wv as any).reload?.()
  }

  const handleTranslate = () => {
    const wv = webviewMap.current.get(activeId!)
    if (!wv) return
    const isTranslated = translatedTabs.has(activeId!)
    if (isTranslated) {
      (wv as any).reload?.()
      setTranslatedTabs(prev => {
        const next = new Set(prev)
        next.delete(activeId!)
        return next
      })
    } else {
      ;(wv as any).executeJavaScript(`
        (function(){
          try {
            var css = 
              'iframe[src*="translate.google.com"], ' +
              'iframe[src*="translate.googleapis.com"], ' +
              '.goog-te-banner-frame, .skiptranslate, ' +
              '.goog-te-spinner-pos, .goog-te-gadget-icon, ' +
              '.goog-tooltip, .goog-text-highlight, ' +
              '.goog-te-balloon-frame, .goog-te-menu-frame, ' +
              '#google_translate_element ' +
              '{ display:none!important; height:0!important; width:0!important; min-height:0!important; border:none!important; } ' +
              'body { top:0!important; position:static!important; } ' +
              '.goog-te-gadget { font-size:0!important; color:transparent!important; }';
            var st = document.createElement('style');
            st.id = '__tr_hide__';
            st.textContent = css;
            document.head.appendChild(st);
            document.cookie = 'googtrans=/auto/zh-CN;path=/';
            var d = document.createElement('div');
            d.id = 'google_translate_element';
            d.style.cssText = 'display:none!important;';
            document.body.appendChild(d);
            window.googleTranslateElementInit = function() {
              new google.translate.TranslateElement({pageLanguage:'auto',autoDisplay:false},'google_translate_element');
            };
            var s = document.createElement('script');
            s.src = 'https://translate.google.com/translate_a/element.js?cb=googleTranslateElementInit';
            document.head.appendChild(s);
            function cleanup() {
              document.querySelectorAll('iframe').forEach(function(f) {
                if (f.src && (f.src.includes('translate.google.com') || f.src.includes('translate.googleapis.com'))) {
                  f.remove();
                }
              });
              document.body.style.top = '0';
            }
            setTimeout(cleanup, 1500);
            setTimeout(cleanup, 3000);
            setTimeout(cleanup, 8000);
          } catch(e) {}
        })();
      `)
      setTranslatedTabs(prev => new Set([...prev, activeId!]))
    }
  }

  if (!isGridView) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
        <div className="tab-bar">
          <div className="nav-btns">
            <div className="nav-btn" onClick={handleGoBack} title="后退">
              <ArrowLeft size={13} />
            </div>
            <div className="nav-btn" onClick={handleGoForward} title="前进">
              <ArrowRight size={13} />
            </div>
          </div>
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
          <div
            onClick={handleTranslate}
            className={'tab-translate' + (translatedTabs.has(activeId!) ? ' active' : '')}
            title={translatedTabs.has(activeId!) ? '取消翻译' : '翻译为中文'}
          >
            <Languages size={13} />
            <span className="tab-refresh-label">翻译</span>
          </div>
          <div
            onClick={handleRefresh}
            className="tab-refresh"
            title="刷新"
          >
            <RefreshCw size={13} />
            <span className="tab-refresh-label">刷新网页</span>
          </div>
        </div>
        <div ref={containerRef} style={{ flex: 1, position: 'relative' }} />
      </div>
    )
  }

  return (
    <div style={{ padding: 32, height: '100%', overflow: 'auto' }}>
      <div style={{ marginBottom: 24 }}>
        <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 4 }}>开放平台</h2>
        <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>点击平台卡片开始使用，支持多平台同时打开</p>
      </div>
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
        gap: 16,
      }}>
        {platforms.map(platform => (
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
