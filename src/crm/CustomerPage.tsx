import { useState, useMemo } from 'react'
import { Search, X, Plus, GripVertical } from 'lucide-react'
import type { SharedProps, Customer, EnrichedCustomer } from './types'
import { STAGES, TAG_COLORS } from './constants'
import { avatarGrad, fuDisplay, fmtDate } from './helpers'

export default function CustomerPage({ data, viewMode, setViewMode, setEditingCustomer, filterNoteId, setFilterNoteId, enrichCust, moveCust, deleteCusts }: SharedProps) {
  const [search, setSearch] = useState('')
  const [dragId, setDragId] = useState<string | null>(null)
  const [batchMode, setBatchMode] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())

  const customers = data.customers.filter(c => c.stage !== 'closed' && c.stage !== 'lead').map(enrichCust)

  const filtered = useMemo(() => {
    let list = customers
    if (search) list = list.filter(c => c.name.includes(search) || c.phone.includes(search) || c.houseType.includes(search))
    if (filterNoteId) list = list.filter(c => c.sourceNoteId === filterNoteId)
    return list
  }, [customers, search, filterNoteId])

  const kanbanGroups = useMemo(() => {
    const m: Record<string, EnrichedCustomer[]> = {}
    STAGES.filter(s => s.id !== 'closed').forEach(s => { m[s.id] = [] })
    filtered.forEach(c => { if (m[c.stage]) m[c.stage].push(c) })
    return m
  }, [filtered])

  const onAdd = (stage: string) => setEditingCustomer({ stage: stage as Customer['stage'] })

  return (
    <div className="crm-page">
      <div className="crm-toolbar">
        <div className="crm-toolbar-left">
          <Search size={14} style={{ opacity: 0.4 }} />
          <input className="crm-search" placeholder="搜索客户、电话、户型…" value={search} onChange={e => setSearch(e.target.value)} />
          {filterNoteId && (
            <span className="crm-filter-chip">
              📌 {data.notes.find(n => n.id === filterNoteId)?.title?.slice(0, 16)}…
              <button onClick={() => setFilterNoteId(null)}><X size={12} /></button>
            </span>
          )}
        </div>
        <div className="crm-toolbar-right">
          <span className="crm-count-label">{filtered.length} 位客户</span>
          <div className="crm-view-toggle">
            <button className={`crm-view-btn ${viewMode === 'table' ? 'active' : ''}`} onClick={() => setViewMode('table')}>列表</button>
            <button className={`crm-view-btn ${viewMode === 'kanban' ? 'active' : ''}`} onClick={() => setViewMode('kanban')}>看板</button>
          </div>
          {batchMode ? (
            <>
              <button className="crm-btn-danger-outline" onClick={() => { if (selectedIds.size > 0) { deleteCusts(Array.from(selectedIds)); setSelectedIds(new Set()); setBatchMode(false) } }} disabled={selectedIds.size === 0}>
                删除选中 ({selectedIds.size})
              </button>
              <button className="crm-btn-ghost" onClick={() => { setBatchMode(false); setSelectedIds(new Set()) }}>取消</button>
            </>
          ) : (
            <>
              <button className="crm-btn-ghost" onClick={() => { setBatchMode(true); setViewMode('table') }}>管理</button>
              <button className="crm-btn-primary" onClick={() => onAdd('wechat')}><Plus size={14} /> 添加客户</button>
            </>
          )}
        </div>
      </div>

      {viewMode === 'table' ? (
        <div className="crm-table-wrap">
          <table className="crm-table">
            <thead>
              <tr>
                {batchMode && <th style={{ width: 36 }}><input type="checkbox" checked={filtered.length > 0 && filtered.every(c => selectedIds.has(c.id))} onChange={e => { if (e.target.checked) setSelectedIds(new Set(filtered.map(c => c.id))); else setSelectedIds(new Set()) }} /></th>}
                <th style={{ width: 140 }}>客户</th>
                <th style={{ width: 130 }}>来源</th>
                <th style={{ width: 80 }}>阶段</th>
                <th style={{ width: 160 }}>需求</th>
                <th style={{ width: 100 }}>跟进</th>
                <th style={{ width: 90 }}>更新时间</th>
                <th style={{ width: 70 }}>操作</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(c => {
                const stage = STAGES.find(s => s.id === c.stage)
                const fu = fuDisplay(c.followUpDate || null)
                const [g1, g2] = avatarGrad(c.name)
                const toggleSel = (id: string) => { const next = new Set(selectedIds); if (next.has(id)) next.delete(id); else next.add(id); setSelectedIds(next) }
                return (
                  <tr key={c.id} onClick={() => { if (batchMode) toggleSel(c.id); else setEditingCustomer(c) }}>
                    {batchMode && <td onClick={e => e.stopPropagation()}><input type="checkbox" checked={selectedIds.has(c.id)} onChange={() => toggleSel(c.id)} /></td>}
                    <td>
                      <div className="crm-td-name">
                        <div className="crm-avatar crm-avatar-sm" style={{ background: `linear-gradient(135deg,${g1},${g2})` }}>{c.name[0]}</div>
                        {c.name}
                      </div>
                    </td>
                    <td><span className="crm-source-link">{c.sourceIcon} {c.sourceLabel}</span></td>
                    <td><span className={`crm-tag stage-${c.stage}`}><span className="crm-dot-sm" style={{ background: stage?.dotColor }} />{stage?.label}</span></td>
                    <td><span className="crm-info-text">{[c.houseType, c.city, c.style].filter(Boolean).join(' · ') || '未填'}</span></td>
                    <td>{fu ? <span className={`crm-tag ${fu.cls}`}>{fu.text}</span> : <span className="crm-muted">—</span>}</td>
                    <td><span className="crm-muted">{fmtDate(c.updatedAt)}</span></td>
                    <td>
                      <button className="crm-btn-ghost-xs" onClick={e => { e.stopPropagation(); setEditingCustomer(c) }}>详情</button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="crm-kanban">
          {STAGES.filter(s => s.id !== 'closed').map(s => {
            const cards = kanbanGroups[s.id] || []
            return (
              <div key={s.id} className="crm-kanban-col"
                onDragOver={e => { e.preventDefault(); e.currentTarget.classList.add('drag-over') }}
                onDragLeave={e => { e.currentTarget.classList.remove('drag-over') }}
                onDrop={e => { e.currentTarget.classList.remove('drag-over'); if (dragId) moveCust(dragId, s.id); setDragId(null) }}>
                <div className="crm-kanban-col-header">
                  <span className="crm-dot" style={{ background: s.dotColor }} />
                  <span>{s.label}</span>
                  <span className="crm-kanban-count">{cards.length}</span>
                </div>
                <div className="crm-kanban-cards">
                  {cards.map(c => (
                    <div key={c.id} className={`crm-card ${dragId === c.id ? 'dragging' : ''}`}
                      style={{ borderLeftColor: s.dotColor }}
                      draggable
                      onDragStart={e => { e.dataTransfer.effectAllowed = 'move'; setDragId(c.id) }}
                      onDragEnd={() => setDragId(null)}
                      onClick={() => setEditingCustomer(c)}>
                      <div className="crm-card-top">
                        <div className="crm-avatar crm-avatar-sm" style={{ background: `linear-gradient(135deg,${avatarGrad(c.name)[0]},${avatarGrad(c.name)[1]})` }}>{c.name[0]}</div>
                        <div>
                          <div className="crm-card-name">{c.name}</div>
                          <div className="crm-card-source">{c.sourceIcon} {c.sourceLabel}</div>
                        </div>
                      </div>
                      <div className="crm-card-tags">
                        {c.houseType && <span className="crm-card-tag tag-blue">{c.houseType}</span>}
                        {c.city && <span className="crm-card-tag tag-yellow">{c.city}</span>}
                        {c.style && <span className="crm-card-tag" style={{ background: (TAG_COLORS[c.style] || {}).bg || 'var(--bg-tertiary)', color: (TAG_COLORS[c.style] || {}).text || 'var(--text-secondary)' }}>{c.style}</span>}
                      </div>
                      <div className="crm-card-footer">
                        {(() => { const fu = fuDisplay(c.followUpDate); return fu ? <span className={`crm-tag ${fu.cls}`}>{fu.text}</span> : <span className="crm-muted">{fmtDate(c.updatedAt)}更新</span> })()}
                      </div>
                    </div>
                  ))}
                </div>
                <button className="crm-kanban-add" onClick={() => onAdd(s.id)}>+ 添加</button>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
