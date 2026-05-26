import { useState, useEffect } from 'react'
import { Clock, Download, Copy, Trash2, X, ImageIcon, List, CheckSquare, FolderOpen } from 'lucide-react'
import { historyService } from '../services/history'
import type { HistoryItem } from '../services/history'

export default function History() {
  const [items, setItems] = useState<HistoryItem[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [columns, setColumns] = useState(4)
  const [manageMode, setManageMode] = useState(false)
  const [checkedIds, setCheckedIds] = useState<Set<string>>(new Set())

  useEffect(() => {
    historyService.getAll().then(data => {
      setItems(data)
      setLoading(false)
    })
  }, [])

  const selected = items.find(i => i.id === selectedId)

  const handleDelete = async (id: string) => {
    await historyService.deleteItem(id)
    setItems(items.filter(i => i.id !== id))
    if (selectedId === id) setSelectedId(null)
  }

  const handleClearAll = async () => {
    await historyService.clearAll()
    setItems([])
    setSelectedId(null)
  }

  const toggleCheck = (id: string) => {
    setCheckedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  const selectAll = () => setCheckedIds(new Set(items.map(i => i.id)))
  const deselectAll = () => setCheckedIds(new Set())

  const handleBatchDownload = () => {
    checkedIds.forEach(id => {
      const item = items.find(i => i.id === id)
      if (item) handleSave(item.imageBase64)
    })
  }

  const handleBatchDelete = async () => {
    for (const id of checkedIds) {
      await historyService.deleteItem(id)
    }
    setItems(items.filter(i => !checkedIds.has(i.id)))
    if (checkedIds.has(selectedId || '')) setSelectedId(null)
    setCheckedIds(new Set())
  }

  const handleSave = async (dataUrl: string) => {
    if (window.electronAPI) {
      await window.electronAPI.saveImage(dataUrl, `history-${Date.now()}.png`)
    } else {
      const link = document.createElement('a')
      link.href = dataUrl
      link.download = `history-${Date.now()}.png`
      link.click()
    }
  }

  const handleCopy = async (dataUrl: string) => {
    try {
      const blob = await (await fetch(dataUrl)).blob()
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })])
    } catch {
      const input = document.createElement('input')
      input.value = dataUrl
      document.body.appendChild(input)
      input.select()
      document.execCommand('copy')
      document.body.removeChild(input)
    }
  }

  const formatTime = (ts: number) => {
    const d = new Date(ts)
    return `${d.getMonth() + 1}/${d.getDate()} ${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`
  }

  const typeLabel = (t: string) => {
    const map: Record<string, string> = { 'text-to-image': '文生图', 'image-to-image': '图生图' }
    return map[t] || t
  }

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
        <span className="spinner" />
      </div>
    )
  }

  if (items.length === 0) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
        <div className="glass-card" style={{ padding: 48, textAlign: 'center' }}>
          <ImageIcon size={48} style={{ opacity: 0.2, marginBottom: 12 }} />
          <div style={{ fontSize: 14, color: 'var(--text-muted)' }}>暂无生成记录</div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>去文生图或图生图生成图片吧</div>
        </div>
      </div>
    )
  }

  return (
    <div style={{ padding: 24, height: '100%', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
          共 {items.length} 条记录
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <select className="select-base" value={columns} onChange={e => setColumns(Number(e.target.value))} style={{ padding: '4px 8px', fontSize: 12 }}>
            {[2, 3, 4, 6].map(n => <option key={n} value={n}>{n} 列</option>)}
          </select>
          <button
            className={`btn btn-sm ${manageMode ? 'btn-primary' : 'btn-ghost'}`}
            onClick={() => { setManageMode(!manageMode); setCheckedIds(new Set()); setSelectedId(null) }}
          >
            {manageMode ? <><CheckSquare size={14} /> 完成</> : <><List size={14} /> 管理</>}
          </button>
          <button className="btn btn-ghost btn-sm" onClick={handleClearAll}>
            <Trash2 size={14} /> 清空
          </button>
        </div>
      </div>

      {manageMode && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, padding: '8px 12px', borderRadius: 'var(--radius-sm)', background: 'var(--bg-card)', fontSize: 13 }}>
          <button className="btn btn-ghost btn-sm" onClick={checkedIds.size === items.length ? deselectAll : selectAll}>
            <CheckSquare size={14} /> {checkedIds.size === items.length ? '取消全选' : '全选'}
          </button>
          <span style={{ color: 'var(--text-muted)', marginLeft: 'auto', marginRight: 8 }}>已选 {checkedIds.size} 张</span>
          <button className="btn btn-ghost btn-sm" onClick={handleBatchDownload} disabled={checkedIds.size === 0}>
            <FolderOpen size={14} /> 批量下载
          </button>
          <button className="btn btn-danger btn-sm" onClick={handleBatchDelete} disabled={checkedIds.size === 0}>
            <Trash2 size={14} /> 批量删除
          </button>
        </div>
      )}

      <div style={{ flex: 1, overflow: 'hidden', display: 'flex', gap: 16 }}>
        <div style={{ flex: 1, overflow: 'auto' }}>
          <div style={{ display: 'grid', gridTemplateColumns: `repeat(${columns}, 1fr)`, gap: 10 }}>
            {items.map(item => (
              <div
                key={item.id}
                className="result-item"
                style={{ cursor: 'pointer', borderColor: selectedId === item.id ? 'var(--accent)' : undefined }}
                onClick={() => {
                  if (manageMode) { toggleCheck(item.id) }
                  else { setSelectedId(selectedId === item.id ? null : item.id) }
                }}
              >
                <div style={{ position: 'relative' }}>
                  <img src={item.imageBase64} alt={item.prompt} style={{ aspectRatio: '3/4', objectFit: 'cover', width: '100%' }} />
                  {manageMode && (
                    <div style={{ position: 'absolute', top: 4, left: 4, width: 20, height: 20, borderRadius: 4, background: checkedIds.has(item.id) ? 'var(--accent)' : 'rgba(0,0,0,0.4)', border: '2px solid rgba(255,255,255,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, color: 'white' }}>
                      {checkedIds.has(item.id) ? '✓' : ''}
                    </div>
                  )}
                </div>
                <div style={{ padding: '6px 8px', fontSize: 11, color: 'var(--text-muted)' }}>
                  {formatTime(item.timestamp)}
                </div>
              </div>
            ))}
          </div>
        </div>

        {selected && columns >= 3 && !manageMode && (
          <div
            style={{
              width: 340,
              minWidth: 340,
              display: 'flex',
              flexDirection: 'column',
              borderRadius: 'var(--radius)',
              border: '1px solid var(--border-color)',
              overflow: 'hidden',
              background: 'var(--bg-card)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', borderBottom: '1px solid var(--border-color)' }}>
              <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>图片预览</span>
              <button className="btn btn-ghost btn-sm" onClick={() => setSelectedId(null)}><X size={14} /></button>
            </div>
            <div style={{ flex: 1, overflow: 'auto', padding: 12 }}>
              <img
                src={selected.imageBase64}
                alt={selected.prompt}
                style={{ width: '100%', borderRadius: 'var(--radius-sm)', display: 'block' }}
              />
              <div style={{ marginTop: 12, fontSize: 12, color: 'var(--text-muted)' }}>
                <div style={{ marginBottom: 4 }}><span style={{ color: 'var(--text-secondary)' }}>类型：</span>{typeLabel(selected.type)}</div>
                <div style={{ marginBottom: 4 }}><span style={{ color: 'var(--text-secondary)' }}>模型：</span>{selected.modelName}</div>
                <div><span style={{ color: 'var(--text-secondary)' }}>时间：</span>{formatTime(selected.timestamp)}</div>
              </div>
              <div style={{ marginTop: 12 }}>
                <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 4 }}>提示词</div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', background: 'rgba(0,0,0,0.2)', padding: 8, borderRadius: 'var(--radius-sm)', wordBreak: 'break-all' }}>
                  {selected.prompt}
                </div>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 6, padding: 12, borderTop: '1px solid var(--border-color)' }}>
              <button className="btn btn-ghost btn-sm" onClick={() => handleSave(selected.imageBase64)}>
                <Download size={14} /> 保存
              </button>
              <button className="btn btn-ghost btn-sm" onClick={() => handleCopy(selected.imageBase64)}>
                <Copy size={14} /> 复制
              </button>
              <button className="btn btn-danger btn-sm" onClick={() => handleDelete(selected.id)} style={{ marginLeft: 'auto' }}>
                <Trash2 size={14} /> 删除
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
