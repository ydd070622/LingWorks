import { useState, useRef, useEffect, useCallback } from 'react'
import { Search, Download, Upload, ArrowLeft, ArrowRight, RefreshCw } from 'lucide-react'
import { bookmarkStore } from '../bookmarkStore'
import type { BookmarkItem } from '../types'

interface SearchEngine {
  id: string
  name: string
  buildUrl: (q: string) => string
  ai?: boolean
}

const engines: SearchEngine[] = [
  { id: 'baidu', name: '百度', buildUrl: q => `https://www.baidu.com/s?wd=${encodeURIComponent(q)}` },
  { id: 'bing', name: '必应', buildUrl: q => `https://www.bing.com/search?q=${encodeURIComponent(q)}` },
  { id: 'google', name: 'Google', buildUrl: q => `https://www.google.com/search?q=${encodeURIComponent(q)}` },
  { id: 'deepseek', name: 'DeepSeek', buildUrl: () => 'https://chat.deepseek.com/', ai: true },
  { id: 'kimi', name: 'Kimi', buildUrl: () => 'https://kimi.moonshot.cn/', ai: true },
]

type WebviewElement = HTMLElement & { src: string }

interface HomeProps {
  onSelect?: (id: string) => void
}

export default function Home({ onSelect }: HomeProps) {
  // --- Search state ---
  const [query, setQuery] = useState('')
  const [engine, setEngine] = useState(engines[0])
  const [searchUrl, setSearchUrl] = useState<string | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const searchWvRef = useRef<any>(null)

  // --- Bookmark state ---
  const [bookmarks, setBookmarks] = useState<BookmarkItem[]>([])
  const [activeView, setActiveView] = useState('__root__')
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; items: CtxMenuItem[] } | null>(null)
  const [modal, setModal] = useState<ModalState | null>(null)

  const folders: (Extract<BookmarkItem, { type: 'folder' }>)[] = bookmarks.filter(
    (b): b is Extract<BookmarkItem, { type: 'folder' }> => b.type === 'folder'
  )

  const visibleBookmarks = (activeView === '__root__'
    ? bookmarks.filter(b => b.type === 'bookmark')
    : folders.find(f => f.id === activeView)?.children || []
  ) as Extract<BookmarkItem, { type: 'bookmark' }>[]

  const loadBookmarks = useCallback(async () => {
    const data = await bookmarkStore.getAll()
    setBookmarks(data)
  }, [])

  useEffect(() => { loadBookmarks() }, [loadBookmarks])

  // --- Search logic ---
  useEffect(() => {
    if (!searchUrl || !containerRef.current) return
    const q = query.trim()
    const wv = document.createElement('webview') as unknown as WebviewElement
    wv.setAttribute('src', searchUrl)
    wv.setAttribute('disablewebsecurity', '')
    wv.setAttribute('allowpopups', '')
    Object.assign(wv.style, {
      width: '100%', height: '100%', border: 'none',
      position: 'absolute', top: '0', left: '0',
    })

    wv.addEventListener('did-finish-load', () => {
      ;(wv as any).executeJavaScript(`
        (function(){
          window.open = function(url){ if(url && url.startsWith('http')) window.location.href=url; return null; };
          function fix(){ document.querySelectorAll('a[target="_blank"]').forEach(function(a){ a.setAttribute('target','_self'); }); }
          fix();
          new MutationObserver(fix).observe(document.body,{childList:true,subtree:true});
        })();
      `)
    })

    if (engine.ai && q) {
      wv.addEventListener('did-finish-load', () => {
        ;(wv as any).executeJavaScript(`
          (function(q){
            var tries=0, max=40;
            function fill(){
              tries++;
              var el = document.querySelector('textarea') || document.querySelector('[role="textbox"]') || document.querySelector('[contenteditable="true"]') || document.querySelector('input[type="text"]');
              if (el) {
                el.focus();
                try { document.execCommand('selectAll', false, null); } catch(e2){}
                try { document.execCommand('insertText', false, q); } catch(e3){
                  if (el.contentEditable === 'true' || el.getAttribute('contenteditable') === 'true') {
                    el.textContent = q;
                  } else {
                    var d = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), 'value');
                    if (d && d.set) { d.set.call(el, q); } else { el.value = q; }
                  }
                  el.dispatchEvent(new Event('input', { bubbles: true }));
                  el.dispatchEvent(new Event('change', { bubbles: true }));
                }
                setTimeout(function(){
                  var btn = el.closest('form')?.querySelector('button[type="submit"]');
                  if (!btn) {
                    var all = el.parentElement?.querySelectorAll('button, [role="button"]') || [];
                    for (var i=0; i<all.length; i++) {
                      if (all[i].offsetParent && all[i] !== el) { btn = all[i]; break; }
                    }
                  }
                  if (btn) { btn.click(); return; }
                  el.dispatchEvent(new KeyboardEvent('keydown', { key:'Enter', code:'Enter', keyCode:13, which:13, bubbles:true }));
                  el.dispatchEvent(new KeyboardEvent('keypress', { key:'Enter', code:'Enter', keyCode:13, which:13, bubbles:true }));
                  el.dispatchEvent(new KeyboardEvent('keyup', { key:'Enter', code:'Enter', keyCode:13, which:13, bubbles:true }));
                }, 200);
              } else if (tries < max) {
                setTimeout(fill, 400);
              }
            }
            setTimeout(fill, 500);
          })(${JSON.stringify(q)})
        `)
      })
    }

    while (containerRef.current.firstChild) containerRef.current.removeChild(containerRef.current.firstChild)
    containerRef.current.appendChild(wv)
    searchWvRef.current = wv
    return () => { wv.remove(); searchWvRef.current = null }
  }, [searchUrl, engine.ai, query])

  const handleSearch = () => {
    const q = query.trim()
    if (!q) return
    setSearchUrl(engine.buildUrl(q))
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleSearch()
  }

  const handleBack = () => setSearchUrl(null)

  const handleGoBack = () => {
    const wv = searchWvRef.current
    if (wv) (wv as any).goBack?.()
  }

  const handleGoForward = () => {
    const wv = searchWvRef.current
    if (wv) (wv as any).goForward?.()
  }

  const handleRefresh = () => {
    const wv = searchWvRef.current
    if (wv) (wv as any).reload?.()
  }

  // --- Bookmark click: try to match site, else open external ---
  const handleBookmarkClick = (b: Extract<BookmarkItem, { type: 'bookmark' }>) => {
    if (window.electronAPI) {
      window.electronAPI.openExternal(b.url)
    } else {
      window.open(b.url, '_blank')
    }
  }

  // --- Context Menu ---
  interface CtxMenuItem {
    label: string
    danger?: boolean
    action: () => void
  }

  const showCtxMenu = (e: React.MouseEvent, items: CtxMenuItem[]) => {
    e.preventDefault()
    setCtxMenu({ x: e.clientX, y: e.clientY, items })
  }

  const onFolderCtx = async (e: React.MouseEvent, fid: string) => {
    showCtxMenu(e, [
      { label: '重命名', action: () => openModal('renameFolder', { folderId: fid }) },
      { label: '新建文件夹', action: () => openModal('addFolder') },
      { label: '删除文件夹', danger: true, action: async () => {
        const n = confirm('确定删除文件夹？其中的书签也会被删除。')
        if (n) { await bookmarkStore.deleteFolder(fid); loadBookmarks(); if (activeView === fid) setActiveView('__root__') }
      }},
    ])
  }

  const onBookmarkCtx = (e: React.MouseEvent, fid: string, bid: string) => {
    showCtxMenu(e, [
      { label: '编辑', action: () => openModal('editBookmark', { bookmarkId: bid }) },
      { label: '复制网址', action: async () => {
        const b = findBookmark(bid)
        if (b?.url) {
          try { await navigator.clipboard.writeText(b.url) } catch {}
          // fallback: use electron clipboard
        }
      }},
      { label: '移动到文件夹', action: () => openModal('moveBookmark', { bookmarkId: bid, fromFolderId: fid }) },
      { label: '删除', danger: true, action: async () => {
        if (!confirm('确定删除该书签？')) return
        await bookmarkStore.deleteBookmark(bid)
        loadBookmarks()
      }},
    ])
  }

  const findBookmark = (bid: string): Extract<BookmarkItem, { type: 'bookmark' }> | null => {
    for (const item of bookmarks) {
      if (item.type === 'bookmark' && item.id === bid) return item as any
      if (item.type === 'folder' && item.children) {
        const f = item.children.find(c => c.id === bid)
        if (f && f.type === 'bookmark') return f as any
      }
    }
    return null
  }

  // --- Modal ---
  interface ModalState {
    type: 'addBookmark' | 'editBookmark' | 'addFolder' | 'renameFolder' | 'moveBookmark'
    bookmarkId?: string
    folderId?: string
    fromFolderId?: string
  }

  const openModal = (type: ModalState['type'], opts?: Partial<ModalState>) => {
    setModal({ type, ...opts } as ModalState)
  }

  const closeModal = () => setModal(null)

  const handleModalConfirm = async () => {
    if (!modal) return
    const type = modal.type
    if (type === 'addBookmark' || type === 'editBookmark') {
      const name = (document.getElementById('bm-name') as HTMLInputElement)?.value.trim()
      const url = (document.getElementById('bm-url') as HTMLInputElement)?.value.trim()
      const icon = (document.getElementById('bm-icon') as HTMLInputElement)?.value.trim() || '🌐'
      if (!name || !url) return
      if (type === 'editBookmark' && modal.bookmarkId) {
        await bookmarkStore.updateBookmark(modal.bookmarkId, { name, url, icon })
      } else {
        const fid = activeView === '__root__' ? undefined : activeView
        await bookmarkStore.addBookmark(name, url, icon, fid)
      }
    } else if (type === 'addFolder') {
      const name = (document.getElementById('bm-name') as HTMLInputElement)?.value.trim()
      if (!name) return
      const f = await bookmarkStore.addFolder(name)
      setActiveView(f.id)
    } else if (type === 'renameFolder' && modal.folderId) {
      const name = (document.getElementById('bm-name') as HTMLInputElement)?.value.trim()
      if (!name) return
      await bookmarkStore.renameFolder(modal.folderId, name)
    } else if (type === 'moveBookmark' && modal.bookmarkId) {
      const sel = document.getElementById('bm-moveTo') as HTMLSelectElement
      const toFid = sel?.value || ''
      if (modal.fromFolderId === toFid) return
      await bookmarkStore.moveBookmark(modal.bookmarkId, toFid)
    }
    closeModal()
    loadBookmarks()
  }

  // --- Import / Export ---
  const handleExport = async () => {
    const json = await bookmarkStore.exportData()
    const blob = new Blob([json], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'bookmarks.json'
    a.click()
    URL.revokeObjectURL(url)
  }

  const handleImport = () => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.json'
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0]
      if (!file) return
      const text = await file.text()
      try {
        await bookmarkStore.importData(text)
        loadBookmarks()
      } catch {
        alert('导入失败：文件格式不正确')
      }
    }
    input.click()
  }

  // --- Render: search results ---
  if (searchUrl) {
    return (
      <div className="home-page-results">
        <div className="home-results-bar">
          <div style={{ display: 'flex', alignItems: 'center', gap: 0 }}>
            <span className="home-results-back" style={{ marginRight: 4 }} onClick={handleBack}>← 返回搜索</span>
            <div className="nav-btns" style={{ borderRight: 'none' }}>
              <div className="nav-btn" onClick={handleGoBack} title="后退">
                <ArrowLeft size={13} />
              </div>
              <div className="nav-btn" onClick={handleGoForward} title="前进">
                <ArrowRight size={13} />
              </div>
            </div>
          </div>
          <div
            onClick={handleRefresh}
            className="tab-refresh"
            title="刷新网页"
          >
            <RefreshCw size={13} />
            <span className="tab-refresh-label">刷新网页</span>
          </div>
        </div>
        <div ref={containerRef} style={{ flex: 1, position: 'relative' }} />
      </div>
    )
  }

  // --- Render: main homepage ---
  const renderCtxMenu = () => {
    if (!ctxMenu) return null
    return (
      <div className="bookmark-ctx-menu" style={{ left: ctxMenu.x, top: ctxMenu.y }} onClick={() => setCtxMenu(null)}>
        <div className="bookmark-ctx-inner">
          {ctxMenu.items.map((item, i) => (
            <div
              key={i}
              className={`bookmark-ctx-item${item.danger ? ' danger' : ''}`}
              onClick={() => { setCtxMenu(null); item.action() }}
            >
              {item.label}
            </div>
          ))}
        </div>
      </div>
    )
  }

  const folderOptions = folders.map(f => `<option value="${f.id}">📁 ${f.name}</option>`).join('')

  return (
    <div className="home-page">
      <div className="home-content">
        <h1 className="home-title">AI Web Tools</h1>
        <p className="home-subtitle">所有 AI 工具，一站汇聚</p>
        <div className="home-search-wrap">
          <input
            className="home-search-box"
            type="text"
            placeholder="输入关键词搜索..."
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
          />
          <Search className="home-search-icon" size={18} onClick={handleSearch} />
        </div>
        <div className="home-engines">
          {engines.map(e => (
            <span
              key={e.id}
              className={'home-engine-btn' + (engine.id === e.id ? ' active' : '')}
              onClick={() => setEngine(e)}
            >
              {e.name}
            </span>
          ))}
        </div>

        <div className="bookmark-divider" />

        {/* Bookmark section */}
        <div className="bookmark-section">
          <div className="bookmark-header">
            <span
              className={'bookmark-folder' + (activeView === '__root__' ? ' active' : '')}
              onClick={() => setActiveView('__root__')}
            >🏠 全部</span>
            {folders.map(f => (
              <span
                key={f.id}
                className={'bookmark-folder' + (f.id === activeView ? ' active' : '')}
                onClick={() => setActiveView(f.id)}
                onContextMenu={e => onFolderCtx(e, f.id)}
              >📁 {f.name}</span>
            ))}
            <span className="bookmark-folder-btn" title="新建文件夹" onClick={() => openModal('addFolder')}>+</span>
          </div>

          <div className="bookmark-grid">
            {visibleBookmarks.map(b => {
              const fid = activeView !== '__root__' ? activeView : ''
              return (
                <div
                  key={b.id}
                  className="bookmark-card"
                  onClick={() => handleBookmarkClick(b as any)}
                  onContextMenu={e => onBookmarkCtx(e, fid, b.id)}
                >
                  <div className="bookmark-card-icon">{b.icon}</div>
                  <div className="bookmark-card-name" title={b.name}>{b.name}</div>
                </div>
              )
            })}
            <div className="bookmark-card add-card" onClick={() => openModal('addBookmark')}>
              <div className="bookmark-card-icon">+</div>
              <div className="bookmark-card-name">新建书签</div>
            </div>
          </div>

          <div className="bookmark-actions">
            <span className="bookmark-action-btn" onClick={handleImport}><Upload size={14} /> 导入</span>
            <span className="bookmark-action-btn" onClick={handleExport}><Download size={14} /> 导出</span>
          </div>
        </div>

        <div className="home-footer">
          © 2026 YDD. All Rights Reserved.
        </div>
      </div>

      {renderCtxMenu()}

      {/* Modal */}
      {modal && (
        <div className="modal-overlay" onClick={closeModal}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>
                {modal.type === 'addBookmark' ? '新建书签' :
                 modal.type === 'editBookmark' ? '编辑书签' :
                 modal.type === 'addFolder' ? '新建文件夹' :
                 modal.type === 'renameFolder' ? '重命名文件夹' :
                 '移动书签'}
              </h3>
              <button onClick={closeModal}>×</button>
            </div>
            <div className="modal-body">
              {modal.type === 'moveBookmark' ? (
                <>
                  <label>移动到文件夹</label>
                  <select id="bm-moveTo" className="select-base" defaultValue={modal.fromFolderId || ''}>
                    <option value="">🏠 全部（顶层）</option>
                    {folders.map(f => (
                      <option key={f.id} value={f.id}>📁 {f.name}</option>
                    ))}
                  </select>
                </>
              ) : (
                <>
                  <label>名称</label>
                  <input id="bm-name" type="text" placeholder="名称" autoFocus />
                  {modal.type !== 'addFolder' && modal.type !== 'renameFolder' && (
                    <>
                      <label>网址</label>
                      <input id="bm-url" type="text" placeholder="https://..." />
                      <label>图标 emoji</label>
                      <input id="bm-icon" type="text" placeholder="🌐" defaultValue="🌐" />
                    </>
                  )}
                </>
              )}
            </div>
            <div className="modal-footer">
              <button className="btn-cancel" onClick={closeModal}>取消</button>
              <button className="btn-save" onClick={handleModalConfirm}>确定</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
