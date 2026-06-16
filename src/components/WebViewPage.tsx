import { useEffect, useRef, useState, useCallback } from 'react'
import { RefreshCw, ArrowLeft, ArrowRight, Languages, Copy, ExternalLink } from 'lucide-react'
import type { NavItem } from '../types'

interface Tab {
  id: string
  url: string
  title: string
}

type WebviewElement = HTMLElement & {
  src: string
  partition: string
  getWebContentsId: () => number
}

interface WebViewPageProps {
  site: NavItem & { url: string }
  visible: boolean
  onUrlChange?: (url: string, pageContent?: string) => void
}

let tabCounter = 0

export default function WebViewPage({ site, visible, onUrlChange }: WebViewPageProps) {
  const [tabs, setTabs] = useState<Tab[]>(() => [
    { id: 'init', url: site.url, title: site.label },
  ])
  const [activeId, setActiveId] = useState('init')
  const [translatedTabs, setTranslatedTabs] = useState<Set<string>>(new Set())
  const [ctxTab, setCtxTab] = useState<Tab | null>(null)
  const [ctxPos, setCtxPos] = useState<{ x: number; y: number } | null>(null)
  const [linkMenu, setLinkMenu] = useState<{ url: string; text: string; x: number; y: number } | null>(null)
  const webviewMap = useRef<Map<string, WebviewElement>>(new Map())
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const unsub = window.electronAPI?.onNewTab((data) => {
      if (data.siteId === site.id) {
        const newId = `tab-${++tabCounter}-${Date.now()}`
        setTabs(prev => [...prev, { id: newId, url: data.url, title: '加载中...' }])
        setActiveId(newId)
      }
    })
    const unsub2 = window.electronAPI?.onPopupNavigate((data) => {
      const newId = `tab-${++tabCounter}-${Date.now()}`
      setTabs(prev => [...prev, { id: newId, url: data.url, title: '加载中...' }])
      setActiveId(newId)
    })
    return () => { unsub?.(); unsub2?.() }
  }, [site.id])

  const createWebview = useCallback((tabId: string, tabUrl: string) => {
    const wv = document.createElement('webview') as unknown as WebviewElement
    wv.setAttribute('src', tabUrl)
    wv.setAttribute('partition', `persist:${site.id}`)
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

    // Register download handler on main process once webview is fully attached to DOM.
    // This is the SAFEST timing because partition attribute is already applied.
    wv.addEventListener('did-attach', () => {
      try {
        const wcId = wv.getWebContentsId()
        window.electronAPI?.registerWebviewSession(wcId)
      } catch {}
    })

    wv.addEventListener('did-finish-load', () => {
      if (onUrlChange) {
        const url = (wv as any).getURL?.() || tabUrl
        onUrlChange(url) // Immediately sync URL — content comes async below
        try {
          // Extract page title + rendered text for agent context
          ;(wv as any).executeJavaScript('JSON.stringify({title:document.title,text:document.body?document.body.innerText:document.documentElement.innerText})').then((raw: string) => {
            let title = ''; let content = ''
            try { const d = JSON.parse(raw); title = d.title || ''; content = d.text || '' } catch { content = raw || '' }
            const trimmed = content?.slice(0, 5000) || ''
            const label = title ? `【页面标题】${title}\n【页面URL】${url}\n【页面文本（前5000字符）】` : `【页面URL】${url}\n【页面文本（前5000字符）】`
            if (trimmed) onUrlChange(url, `${label}\n${trimmed}\n\n⚠️ 以上是该网页的真实内容，请基于此内容回答，不要依赖你的训练数据猜测。`)
          }).catch(() => {})
        } catch {}
      }
      ;(wv as any).executeJavaScript(`
        Object.defineProperty(navigator,'webdriver',{get:function(){return false}});
        Object.defineProperty(navigator,'plugins',{get:function(){return {length:3,item:function(){return null},namedItem:function(){return null},refresh:function(){return false}}});
        Object.defineProperty(navigator,'languages',{get:function(){return ['zh-CN','zh','en']}});
        window.open=function(u){if(u)window.location.href=u;return null};
        document.addEventListener('click',function(e){
          var a=e.target.closest('a');
          if(a&&a.target==='_blank'&&a.href){
            e.preventDefault();e.stopPropagation();
            window.location.href=a.href;
          }
        },true);
      `)
    })

    // Report URL on SPA navigation (pushState / hash changes) — delayed to let content render
    wv.addEventListener('did-navigate-in-page', ((e: any) => {
      if (onUrlChange && e.url) {
        onUrlChange(e.url) // Immediately sync URL
        setTimeout(() => {
          try {
            ;(wv as any).executeJavaScript('JSON.stringify({title:document.title,text:document.body?document.body.innerText:document.documentElement.innerText})').then((raw: string) => {
              let title = ''; let content = ''
              try { const d = JSON.parse(raw); title = d.title || ''; content = d.text || '' } catch { content = raw || '' }
              const trimmed = content?.slice(0, 5000) || ''
              const label = title ? `【页面标题】${title}\n【页面URL】${e.url}\n【页面文本（前5000字符）】` : `【页面URL】${e.url}\n【页面文本（前5000字符）】`
              if (trimmed) onUrlChange(e.url, `${label}\n${trimmed}\n\n⚠️ 以上是该网页的真实内容，请基于此内容回答，不要依赖你的训练数据猜测。`)
            }).catch(() => {})
          } catch {}
        }, 1200)
      }
    }) as EventListener)

    // Right-click on links → show custom context menu
    wv.addEventListener('context-menu', ((e: any) => {
      const p = e.params
      if (p.linkURL && p.linkURL.startsWith('http')) {
        e.preventDefault()
        setLinkMenu({ url: p.linkURL, text: p.linkText || p.linkURL, x: p.x, y: p.y })
      } else {
        setLinkMenu(null)
      }
    }) as EventListener)

    // Handle new-window events (window.open, target='_blank' not caught by injected JS)
    wv.addEventListener('new-window', ((e: any) => {
      e.preventDefault()
      const url = e.url || e.targetUrl
      if (url && url.startsWith('http')) {
        ;(wv as any).loadURL(url)
      }
    }) as EventListener)

    // Re-inject scripts after full page navigation (did-navigate, not just SPA)
    wv.addEventListener('did-navigate', (() => {
      ;(wv as any).executeJavaScript(`
        Object.defineProperty(navigator,'webdriver',{get:function(){return false}});
        Object.defineProperty(navigator,'plugins',{get:function(){return {length:3,item:function(){return null},namedItem:function(){return null},refresh:function(){return false}}});
        Object.defineProperty(navigator,'languages',{get:function(){return ['zh-CN','zh','en']}});
        window.open=function(u){if(u)window.location.href=u;return null};
        document.addEventListener('click',function(e){
          var a=e.target.closest('a');
          if(a&&a.target==='_blank'&&a.href){
            e.preventDefault();e.stopPropagation();
            window.location.href=a.href;
          }
        },true);
      `)
    }) as EventListener)

    return wv
  }, [site.id])

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    // Hide all webviews when entire page is not visible (Electron webview native layer
    // ignores parent CSS visibility, must directly style the webview element)
    if (!visible) {
      webviewMap.current.forEach(w => {
        if (container.contains(w)) {
          w.style.display = 'none'
        }
      })
      return
    }

    const tab = tabs.find(t => t.id === activeId)
    if (!tab) return

    const wasExisting = !!webviewMap.current.get(tab.id)
    let wv = webviewMap.current.get(tab.id)
    if (!wv) {
      wv = createWebview(tab.id, tab.url)
      webviewMap.current.set(tab.id, wv)
    }

    // show active, hide others, without removing from DOM
    if (!container.contains(wv)) {
      container.appendChild(wv)
    }
    webviewMap.current.forEach((w, id) => {
      if (container.contains(w)) {
        Object.assign(w.style, {
          display: id === tab.id ? '' : 'none',
          visibility: id === tab.id ? 'visible' : 'hidden',
          pointerEvents: id === tab.id ? 'auto' : 'none',
        })
      }
    })

    // When switching back to a previously-loaded page, re-extract content
    if (wasExisting && wv && onUrlChange) {
      const url = (wv as any).getURL?.() || tab.url
      onUrlChange(url) // Immediately sync URL — content comes async below
      try {
        ;(wv as any).executeJavaScript('JSON.stringify({title:document.title,text:document.body?document.body.innerText:document.documentElement.innerText})').then((raw: string) => {
          let title = ''; let content = ''
          try { const d = JSON.parse(raw); title = d.title || ''; content = d.text || '' } catch { content = raw || '' }
          const trimmed = content?.slice(0, 5000) || ''
          const label = title ? `【页面标题】${title}\n【页面URL】${url}\n【页面文本（前5000字符）】` : `【页面URL】${url}\n【页面文本（前5000字符）】`
          if (trimmed) onUrlChange(url, `${label}\n${trimmed}\n\n⚠️ 以上是该网页的真实内容，请基于此内容回答，不要依赖你的训练数据猜测。`)
        }).catch(() => {})
      } catch {}
    }

    if (visible) {
      setTimeout(() => (wv as any).focus?.(), 50)
    }
  }, [activeId, visible, tabs, createWebview])

  useEffect(() => {
    return () => {
      webviewMap.current.forEach(w => w.remove())
      webviewMap.current.clear()
    }
  }, [site.id])

  const handleSwitch = (id: string) => {
    setActiveId(id)
    // Report URL of the newly active tab (with DOM content if available)
    if (onUrlChange) {
      const tab = tabs.find(t => t.id === id)
      if (tab) {
        const wv = webviewMap.current.get(id)
        const url = wv ? ((wv as any).getURL?.() || tab.url) : tab.url
        onUrlChange(url) // Immediately sync URL
        try {
          if (wv) {
            ;(wv as any).executeJavaScript('JSON.stringify({title:document.title,text:document.body?document.body.innerText:document.documentElement.innerText})').then((raw: string) => {
              let title = ''; let content = ''
              try { const d = JSON.parse(raw); title = d.title || ''; content = d.text || '' } catch { content = raw || '' }
              const trimmed = content?.slice(0, 5000) || ''
              const label = title ? `【页面标题】${title}\n【页面URL】${url}\n【页面文本（前5000字符）】` : `【页面URL】${url}\n【页面文本（前5000字符）】`
              if (trimmed) onUrlChange(url, `${label}\n${trimmed}\n\n⚠️ 以上是该网页的真实内容，请基于此内容回答，不要依赖你的训练数据猜测。`)
            }).catch(() => {})
          } else {
            onUrlChange(url)
          }
        } catch {
          onUrlChange(url)
        }
      }
    }
  }

  const handleClose = (id: string) => {
    if (tabs.length <= 1) return
    setTabs(prev => {
      const idx = prev.findIndex(t => t.id === id)
      const next = prev.filter(t => t.id !== id)
      setActiveId(activeId === id
        ? next[Math.min(idx, next.length - 1)].id
        : activeId)
      return next
    })
    const wv = webviewMap.current.get(id)
    if (wv) { wv.remove(); webviewMap.current.delete(id) }
  }

  const handleTabContext = (e: React.MouseEvent, tab: Tab) => {
    e.preventDefault()
    setCtxTab(tab)
    setCtxPos({ x: e.clientX, y: e.clientY })
  }

  const closeCtx = () => { setCtxTab(null); setCtxPos(null) }

  const handleCopyUrl = () => {
    if (!ctxTab) return
    const wv = webviewMap.current.get(ctxTab.id)
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

  const handleCloseOthers = () => {
    if (ctxTab) {
      setTabs(prev => prev.filter(t => t.id === ctxTab.id))
      setActiveId(ctxTab.id)
    }
    closeCtx()
  }

  const handleCloseRight = () => {
    if (ctxTab) {
      const idx = tabs.findIndex(t => t.id === ctxTab.id)
      setTabs(prev => prev.filter((t, i) => i <= idx))
    }
    closeCtx()
  }

  const handleRefresh = () => {
    const wv = webviewMap.current.get(activeId)
    if (wv) (wv as any).reload?.()
  }

  const handleGoBack = () => {
    const wv = webviewMap.current.get(activeId)
    if (wv) (wv as any).goBack?.()
  }

  const handleGoForward = () => {
    const wv = webviewMap.current.get(activeId)
    if (wv) (wv as any).goForward?.()
  }

  const handleTranslate = () => {
    const wv = webviewMap.current.get(activeId)
    if (!wv) return
    const isTranslated = translatedTabs.has(activeId)
    if (isTranslated) {
      (wv as any).reload?.()
      setTranslatedTabs(prev => {
        const next = new Set(prev)
        next.delete(activeId)
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
      setTranslatedTabs(prev => new Set([...prev, activeId]))
    }
  }

  const handleLinkNewTab = () => {
    if (!linkMenu) return
    const newId = `tab-${++tabCounter}-${Date.now()}`
    setTabs(prev => [...prev, { id: newId, url: linkMenu.url, title: linkMenu.text || '加载中...' }])
    setActiveId(newId)
    setLinkMenu(null)
  }

  const handleLinkCopy = () => {
    if (linkMenu) navigator.clipboard.writeText(linkMenu.url).catch(() => {})
    setLinkMenu(null)
  }

  const handleLinkExternal = () => {
    if (linkMenu) {
      if (window.electronAPI) window.electronAPI.openExternal(linkMenu.url)
      else window.open(linkMenu.url, '_blank')
    }
    setLinkMenu(null)
  }

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', height: '100%',
      ...(visible ? {} : { position: 'absolute', visibility: 'hidden', pointerEvents: 'none', width: '100%', height: '100%' }),
    }}>
      <div className="tab-bar">
        <div className="nav-btns">
          <div className="nav-btn" onClick={handleGoBack} title="后退">
            <ArrowLeft size={13} />
          </div>
          <div className="nav-btn" onClick={handleGoForward} title="前进">
            <ArrowRight size={13} />
          </div>
        </div>
        <div className="tabs-container">
          {tabs.map(tab => (
            <div
              key={tab.id}
              className={'tab-item' + (tab.id === activeId ? ' active' : '')}
              onClick={() => handleSwitch(tab.id)}
              onContextMenu={e => handleTabContext(e, tab)}
            >
              <span className="tab-title">{tab.title}</span>
              {tabs.length > 1 && (
                <span className="tab-close" onClick={e => { e.stopPropagation(); handleClose(tab.id) }}>×</span>
              )}
            </div>
          ))}
        </div>
        <div
          onClick={handleTranslate}
          className={'tab-translate' + (translatedTabs.has(activeId) ? ' active' : '')}
          title={translatedTabs.has(activeId) ? '取消翻译' : '翻译为中文'}
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

      {ctxTab && ctxPos && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 999 }} onClick={closeCtx} onContextMenu={e => { e.preventDefault(); closeCtx() }}>
          <div style={{
            position: 'absolute', left: ctxPos.x, top: ctxPos.y,
            background: 'var(--bg-secondary)', border: '1px solid var(--border-color)',
            borderRadius: 8, padding: 4, minWidth: 160,
            boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
          }}>
            <div className="webview-ctx-item" onClick={handleSwitch.bind(null, ctxTab.id)}>切换到此标签</div>
            <div className="webview-ctx-item" onClick={handleCopyUrl}><Copy size={12} /> 复制网址</div>
            <div className="webview-ctx-item" onClick={handleOpenExternal}><ExternalLink size={12} /> 在浏览器中打开</div>
            <div style={{ height: 1, background: 'var(--border-color)', margin: '2px 8px' }} />
            <div className="webview-ctx-item" onClick={handleClose.bind(null, ctxTab.id)}>关闭标签</div>
            <div className="webview-ctx-item" onClick={handleCloseOthers}>关闭其他标签</div>
            <div className="webview-ctx-item" onClick={handleCloseRight}>关闭右侧标签</div>
          </div>
        </div>
      )}

      {linkMenu && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 1000 }} onClick={() => setLinkMenu(null)} onContextMenu={e => { e.preventDefault(); setLinkMenu(null) }}>
          <div style={{
            position: 'absolute', left: linkMenu.x, top: linkMenu.y,
            background: 'var(--bg-secondary)', border: '1px solid var(--border-color)',
            borderRadius: 8, padding: 4, minWidth: 180,
            boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
          }}>
            <div style={{ padding: '6px 10px', fontSize: 11, color: 'var(--text-muted)', borderBottom: '1px solid var(--border-color)', marginBottom: 2, maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {linkMenu.text}
            </div>
            <div className="webview-ctx-item" onClick={handleLinkNewTab}>
              <ExternalLink size={12} /> 在新标签页打开
            </div>
            <div className="webview-ctx-item" onClick={handleLinkCopy}>
              <Copy size={12} /> 复制链接地址
            </div>
            <div className="webview-ctx-item" onClick={handleLinkExternal}>
              <ExternalLink size={12} /> 在浏览器中打开
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
