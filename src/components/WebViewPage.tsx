import { useEffect, useRef, useState, useCallback } from 'react'
import { RefreshCw, ArrowLeft, ArrowRight, Languages } from 'lucide-react'
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
}

let tabCounter = 0

export default function WebViewPage({ site, visible }: WebViewPageProps) {
  const [tabs, setTabs] = useState<Tab[]>(() => [
    { id: 'init', url: site.url, title: site.label },
  ])
  const [activeId, setActiveId] = useState('init')
  const [translatedTabs, setTranslatedTabs] = useState<Set<string>>(new Set())
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

    wv.addEventListener('did-finish-load', () => {
      ;(wv as any).executeJavaScript(`
        Object.defineProperty(navigator,'webdriver',{get:function(){return false}});
        Object.defineProperty(navigator,'plugins',{get:function(){return {length:3,item:function(){return null},namedItem:function(){return null},refresh:function(){return false}}});
        Object.defineProperty(navigator,'languages',{get:function(){return ['zh-CN','zh','en']}});
        (function(){
          function fix(){
            document.querySelectorAll('a[target="_blank"]').forEach(function(a){ a.setAttribute('target','_self'); });
          }
          fix();
          new MutationObserver(fix).observe(document.body,{childList:true,subtree:true});
        })();
      `)
    })

    return wv
  }, [site.id])

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const tab = tabs.find(t => t.id === activeId)
    if (!tab) return

    let wv = webviewMap.current.get(tab.id)
    if (!wv) {
      wv = createWebview(tab.id, tab.url)
      webviewMap.current.set(tab.id, wv)
    }

    if (container.firstChild !== wv) {
      while (container.firstChild) container.removeChild(container.firstChild)
      container.appendChild(wv)
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

  const handleSwitch = (id: string) => setActiveId(id)

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

  return (
    <div style={{ display: visible ? 'flex' : 'none', flexDirection: 'column', height: '100%' }}>
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
    </div>
  )
}
