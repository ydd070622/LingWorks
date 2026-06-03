import { useEffect, useRef, useState, useCallback } from 'react'
import { ArrowLeft, ArrowRight, ExternalLink, RefreshCw, Languages, Plus, X, Trash2, Pencil } from 'lucide-react'
import { platforms as defaultPlatforms, type Platform } from '../data/platforms'

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

const generateColor = () => {
  const colors = ['#6366f1','#ec4899','#f59e0b','#10b981','#3b82f6','#8b5cf6','#ef4444','#06b6d4','#84cc16','#f97316']
  return colors[Math.floor(Math.random() * colors.length)]
}

let tabCounter = 0

export default function Platforms() {
  const [platforms, setPlatforms] = useState<Platform[]>([])
  const [tabs, setTabs] = useState<Tab[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [translatedTabs, setTranslatedTabs] = useState<Set<string>>(new Set())
  const webviewMap = useRef<Map<string, WebviewElement>>(new Map())
  const containerRef = useRef<HTMLDivElement>(null)
  const isGridView = activeId === null

  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [dragId, setDragId] = useState<string | null>(null)
  const [dragOverId, setDragOverId] = useState<string | null>(null)
  const [form, setForm] = useState({ name: '', url: '', iconData: '', iconFile: null as File | null })
  const [manageMode, setManageMode] = useState(false)

  const platformSiteIds = useRef(new Set(platforms.map(p => p.id)))

  const loadPlatforms = useCallback(async () => {
    let list: Platform[] = []
    try {
      if (window.electronAPI) {
        const saved = await window.electronAPI.getStore('customPlatforms')
        if (Array.isArray(saved) && saved.length > 0) {
          list = saved
        }
      }
    } catch {}
    if (list.length === 0) {
      try {
        const saved = localStorage.getItem('customPlatforms')
        if (saved) {
          const parsed = JSON.parse(saved)
          if (Array.isArray(parsed) && parsed.length > 0) {
            list = parsed
          }
        }
      } catch {}
    }
    if (list.length === 0) {
      list = JSON.parse(JSON.stringify(defaultPlatforms))
    }
    setPlatforms(list)
    platformSiteIds.current = new Set(list.map(p => p.id))
  }, [])

  const savePlatforms = useCallback(async (list: Platform[]) => {
    setPlatforms(list)
    platformSiteIds.current = new Set(list.map(p => p.id))
    if (window.electronAPI) {
      await window.electronAPI.setStore('customPlatforms', list)
    } else {
      localStorage.setItem('customPlatforms', JSON.stringify(list))
    }
  }, [])

  useEffect(() => { loadPlatforms() }, [loadPlatforms])

  useEffect(() => {
    const unsub = window.electronAPI?.onNewTab((data) => {
      if (platformSiteIds.current.has(data.siteId)) {
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
  const backToGrid = () => setActiveId(null)

  const closeTab = (id: string) => {
    setTabs(prev => {
      const idx = prev.findIndex(t => t.id === id)
      const next = prev.filter(t => t.id !== id)
      if (next.length === 0) setActiveId(null)
      else setActiveId(activeId === id ? next[Math.min(idx, next.length - 1)].id : activeId)
      return next
    })
    const wv = webviewMap.current.get(id)
    if (wv) { wv.remove(); webviewMap.current.delete(id) }
  }

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
            var css = 'iframe[src*="translate.google.com"], iframe[src*="translate.googleapis.com"], .goog-te-banner-frame, .skiptranslate, .goog-te-spinner-pos, .goog-te-gadget-icon, .goog-tooltip, .goog-text-highlight, .goog-te-balloon-frame, .goog-te-menu-frame, #google_translate_element { display:none!important; height:0!important; width:0!important; min-height:0!important; border:none!important; } body { top:0!important; position:static!important; } .goog-te-gadget { font-size:0!important; color:transparent!important; }';
            var st = document.createElement('style'); st.id = '__tr_hide__'; st.textContent = css; document.head.appendChild(st);
            document.cookie = 'googtrans=/auto/zh-CN;path=/';
            var d = document.createElement('div'); d.id = 'google_translate_element'; d.style.cssText = 'display:none!important;'; document.body.appendChild(d);
            window.googleTranslateElementInit = function() { new google.translate.TranslateElement({pageLanguage:'auto',autoDisplay:false},'google_translate_element'); };
            var s = document.createElement('script'); s.src = 'https://translate.google.com/translate_a/element.js?cb=googleTranslateElementInit'; document.head.appendChild(s);
            function cleanup() { document.querySelectorAll('iframe').forEach(function(f) { if (f.src && (f.src.includes('translate.google.com') || f.src.includes('translate.googleapis.com'))) f.remove(); }); document.body.style.top = '0'; }
            setTimeout(cleanup, 1500); setTimeout(cleanup, 3000); setTimeout(cleanup, 8000);
          } catch(e) {}
        })();
      `)
      setTranslatedTabs(prev => new Set([...prev, activeId!]))
    }
  }

  // --- Form handlers ---
  const openAddForm = () => {
    setForm({ name: '', url: '', iconData: '', iconFile: null })
    setEditingId(null)
    setShowForm(true)
  }

  const openEditForm = (p: Platform) => {
    setForm({ name: p.name, url: p.url, iconData: p.iconData || '', iconFile: null })
    setEditingId(p.id)
    setShowForm(true)
  }

  const handleSave = async () => {
    if (!form.name.trim() || !form.url.trim()) return
    if (editingId) {
      const list = platforms.map(p => p.id === editingId ? { ...p, name: form.name.trim(), url: form.url.trim(), iconData: form.iconData } : p)
      await savePlatforms(list)
    } else {
      const newP: Platform = {
        id: 'custom-' + Date.now(),
        name: form.name.trim(),
        url: form.url.trim(),
        color: generateColor(),
        custom: true,
        iconData: form.iconData,
      }
      await savePlatforms([...platforms, newP])
    }
    setShowForm(false)
  }

  const handleDelete = async (id: string) => {
    const p = platforms.find(x => x.id === id)
    if (!confirm(`确定删除「${p?.name}」？`)) return
    const list = platforms.filter(x => x.id !== id)
    await savePlatforms(list)
    setTabs(prev => prev.filter(t => t.platformId !== id))
  }

  const handleReset = async () => {
    if (!confirm('确定恢复为默认平台列表？自定义的平台将被删除。')) return
    const list = JSON.parse(JSON.stringify(defaultPlatforms)) as Platform[]
    setPlatforms(list)
    platformSiteIds.current = new Set(list.map(p => p.id))
    if (window.electronAPI) {
      await window.electronAPI.setStore('customPlatforms', list)
    } else {
      localStorage.setItem('customPlatforms', JSON.stringify(list))
    }
  }

  const handleIconUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      setForm(prev => ({ ...prev, iconData: reader.result as string, iconFile: file }))
    }
    reader.readAsDataURL(file)
  }

  // --- Drag & Drop ---
  const handleDragStart = (e: React.DragEvent, id: string) => {
    setDragId(id)
    e.dataTransfer.effectAllowed = 'move'
  }

  const handleDragOver = (e: React.DragEvent, id: string) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    setDragOverId(id)
  }

  const handleDragLeave = () => {
    setDragOverId(null)
  }

  const handleDrop = async (e: React.DragEvent, targetId: string) => {
    e.preventDefault()
    if (!dragId || dragId === targetId) {
      setDragId(null); setDragOverId(null)
      return
    }
    const list = [...platforms]
    const fromIdx = list.findIndex(p => p.id === dragId)
    const toIdx = list.findIndex(p => p.id === targetId)
    if (fromIdx < 0 || toIdx < 0) { setDragId(null); setDragOverId(null); return }
    const [moved] = list.splice(fromIdx, 1)
    list.splice(toIdx, 0, moved)
    await savePlatforms(list)
    setDragId(null)
    setDragOverId(null)
  }

  const handleDragEnd = () => {
    setDragId(null)
    setDragOverId(null)
  }

  // --- WebView view ---
  if (!isGridView) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
        <div className="tab-bar">
          <div className="nav-btns">
            <div className="nav-btn" onClick={handleGoBack} title="后退"><ArrowLeft size={13} /></div>
            <div className="nav-btn" onClick={handleGoForward} title="前进"><ArrowRight size={13} /></div>
          </div>
          <div onClick={backToGrid} style={{ width: 34, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: 'var(--text-muted)', flexShrink: 0, borderRight: '1px solid var(--border-color)' }} title="返回平台列表"><ArrowLeft size={14} /></div>
          <div className="tabs-container">
            {tabs.map(tab => (
              <div key={tab.id} className={'tab-item' + (tab.id === activeId ? ' active' : '')} onClick={() => switchTab(tab.id)}>
                <span className="tab-title">{tab.title}</span>
                {tabs.length > 1 && <span className="tab-close" onClick={e => { e.stopPropagation(); closeTab(tab.id) }}>×</span>}
              </div>
            ))}
          </div>
          <div onClick={handleTranslate} className={'tab-translate' + (translatedTabs.has(activeId!) ? ' active' : '')} title={translatedTabs.has(activeId!) ? '取消翻译' : '翻译为中文'}>
            <Languages size={13} /><span className="tab-refresh-label">翻译</span>
          </div>
          <div onClick={handleRefresh} className="tab-refresh" title="刷新">
            <RefreshCw size={13} /><span className="tab-refresh-label">刷新网页</span>
          </div>
        </div>
        <div ref={containerRef} style={{ flex: 1, position: 'relative' }} />
      </div>
    )
  }

  // --- Grid view ---
  return (
    <div style={{ padding: '24px 32px', height: '100%', overflow: 'auto' }}>
      <div style={{ marginBottom: 16, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 4, marginTop: 0 }}>开放平台</h2>
          <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0 }}>拖拽排序，按需增删，点击使用</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={() => setManageMode(!manageMode)}
            style={{ padding: '6px 14px', borderRadius: 8, border: '1px solid var(--border-color)', background: manageMode ? 'var(--accent)' : 'transparent', color: manageMode ? '#fff' : 'var(--text-secondary)', cursor: 'pointer', fontSize: 13, fontWeight: 500 }}
          >{manageMode ? '完成' : '管理'}</button>
          {manageMode && <button onClick={handleReset} style={{ padding: '6px 14px', borderRadius: 8, border: '1px solid var(--border-color)', background: 'transparent', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: 13 }}>恢复默认</button>}
        </div>
      </div>

      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))',
        gap: 12,
      }}>
        {platforms.map(platform => {
          const isDragging = dragId === platform.id
          const isOver = dragOverId === platform.id
          const iconSrc = platform.iconData || `./favicons/platforms/${platform.id}.png`
          return (
            <div
              key={platform.id}
              className="glass-card"
              draggable={manageMode}
              onDragStart={e => handleDragStart(e, platform.id)}
              onDragOver={e => handleDragOver(e, platform.id)}
              onDragLeave={handleDragLeave}
              onDrop={e => handleDrop(e, platform.id)}
              onDragEnd={handleDragEnd}
              onClick={() => manageMode ? openEditForm(platform) : openPlatform(platform)}
              style={{
                padding: 20,
                cursor: 'pointer',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 10,
                transition: 'all 0.15s',
                border: '1px solid transparent',
                opacity: isDragging ? 0.4 : 1,
                transform: isOver ? 'scale(1.05)' : undefined,
                position: 'relative',
              }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = platform.color; e.currentTarget.style.transform = 'translateY(-2px)' }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = 'transparent'; e.currentTarget.style.transform = 'none' }}
            >
              {manageMode && (
                <div
                  onClick={e => { e.stopPropagation(); handleDelete(platform.id) }}
                  style={{ position: 'absolute', top: 4, right: 4, width: 22, height: 22, borderRadius: 4, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', cursor: 'pointer', zIndex: 2 }}
                  title="删除"
                  onMouseEnter={e => { e.currentTarget.style.color = '#ef4444'; e.currentTarget.style.background = 'var(--bg-card-hover)' }}
                  onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-muted)'; e.currentTarget.style.background = 'transparent' }}
                ><X size={13} /></div>
              )}
              <div style={{
                width: 100, height: 100, borderRadius: 20,
                background: `${platform.color}22`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                border: `1px solid ${platform.color}44`,
              }}>
                <img
                  src={iconSrc}
                  alt={platform.name}
                  style={{ width: 70, height: 70, borderRadius: 8, objectFit: 'contain' }}
                  onError={e => {
                    (e.target as HTMLElement).style.display = 'none'
                    const parent = (e.target as HTMLElement).parentElement
                    if (parent) {
                      const span = document.createElement('span')
                      span.textContent = platform.name.charAt(0)
                      span.style.cssText = `font-size: 40px; font-weight: 700; color: ${platform.color}`
                      parent.appendChild(span)
                    }
                  }}
                />
              </div>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 14, fontWeight: 600 }}>{platform.name}</div>
              </div>
            </div>
          )
        })}
        {/* Add card */}
        <div
          className="glass-card"
            onClick={openAddForm}
          style={{
            padding: 20, cursor: 'pointer',
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            gap: 6, transition: 'all 0.15s',
            border: '1px dashed var(--border-color)', opacity: 0.5,
          }}
          onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--accent)'; e.currentTarget.style.opacity = '1' }}
          onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border-color)'; e.currentTarget.style.opacity = '0.5' }}
        >
          <Plus size={24} style={{ color: 'var(--text-muted)' }} />
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>添加平台</span>
        </div>
      </div>

      {/* Form Modal */}
      {showForm && (
        <div className="modal-overlay" onClick={() => setShowForm(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>{editingId ? '编辑平台' : '添加平台'}</h3>
              <button onClick={() => setShowForm(false)}>×</button>
            </div>
            <div className="modal-body">
              <label>名称 *</label>
              <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="平台名称" autoFocus />
              <label>网址 *</label>
              <input value={form.url} onChange={e => setForm({ ...form, url: e.target.value })} placeholder="https://..." />
              <label>Logo 图标（可选）</label>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <input type="file" accept="image/*" onChange={handleIconUpload} style={{ fontSize: 12 }} />
                {form.iconData && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <img src={form.iconData} alt="preview" style={{ width: 28, height: 28, borderRadius: 6, objectFit: 'cover' }} />
                    <span style={{ fontSize: 11, color: 'var(--text-muted)', cursor: 'pointer' }} onClick={() => setForm({ ...form, iconData: '', iconFile: null })}>× 移除</span>
                  </div>
                )}
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn-cancel" onClick={() => setShowForm(false)}>取消</button>
              <button className="btn-save" onClick={handleSave}>保存</button>
            </div>
          </div>
        </div>
      )}

      {/* Delete dialog */}
      {platforms.length === 0 && (
        <div style={{ textAlign: 'center', padding: 60, color: 'var(--text-muted)' }}>
          <p>暂无平台，点击下方 + 添加</p>
        </div>
      )}
    </div>
  )
}
