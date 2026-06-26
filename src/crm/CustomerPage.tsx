import { useState, useMemo } from 'react'
import { Search, X, Plus, GripVertical, ArrowUp, ArrowDown, Download } from 'lucide-react'
import { pinyin } from 'pinyin-pro'
import Fuse from 'fuse.js'
import type { SharedProps, Customer, EnrichedCustomer } from './types'
import { STAGES, TAG_COLORS, ACCOUNTS } from './constants'
import { avatarGrad, fuDisplay, fmtDate } from './helpers'

export default function CustomerPage({ data, viewMode, setViewMode, setEditingCustomer, enrichCust, updateCust, moveCust, deleteCusts, followUpFilter, setFollowUpFilter }: SharedProps) {
  const [search, setSearch] = useState('')
  const [dragId, setDragId] = useState<string | null>(null)
  const [batchMode, setBatchMode] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  // 排序：默认按跟进时间降序（最近跟进在上）
  const [timeDesc, setTimeDesc] = useState(true)

  const customers = data.customers.filter(c => c.stage !== 'closed').map(enrichCust)

  const fuse = useMemo(() => new Fuse(customers, {
    keys: ['name', 'city', 'stylePreference', 'style', 'followUpNote'],
    threshold: 0.4,
  }), [customers])

  const filtered = useMemo(() => {
    let list = customers
    if (search) {
      const results = fuse.search(search)
      list = results.map(r => r.item)
      // Also check pinyin for exact pinyin search
      const q = search.toLowerCase()
      const pinyinMatches = customers.filter(c => pinyin(c.name).toLowerCase().includes(q) && !list.some(m => m.id === c.id))
      list = [...list, ...pinyinMatches]
    }
    // followUpFilter: filter by follow-up date range
    if (followUpFilter) {
      list = list.filter(c => c.followUpDate >= followUpFilter.start && c.followUpDate <= followUpFilter.end)
    }
    return list.sort((a, b) => {
      const da = a.followUpDate || '0000-00-00'
      const db = b.followUpDate || '0000-00-00'
      return timeDesc ? db.localeCompare(da) : da.localeCompare(db)
    })
  }, [customers, search, fuse, timeDesc])

  const kanbanGroups = useMemo(() => {
    const m: Record<string, EnrichedCustomer[]> = {}
    const accountIds = ACCOUNTS.map(a => a.id)
    const allCols = [...accountIds, '__unassigned']
    allCols.forEach(id => { m[id] = [] })
    filtered.forEach(c => {
      const key = c.style && (accountIds as string[]).includes(c.style) ? c.style : '__unassigned'
      m[key].push(c)
    })
    return { groups: m, columns: allCols }
  }, [filtered])

  const onAdd = (account?: string) => setEditingCustomer(account ? { style: account } as Partial<Customer> : {})

  // CSV download
  const handleDownload = () => {
    const headers = ['客户','日期','地区','小区名称','房子面积','喜欢风格','客户归属','跟进','下次跟进时间','跟进情况']
    const rows = filtered.map(c => {
      const fu = fuDisplay(c.followUpDate || null)
      const shortStyle = c.stylePreference === '意式极简' ? '意式' : c.stylePreference === '法式风格' ? '法式' : c.stylePreference
      return [
        c.name,
        c.recordDate ? fmtDate(c.recordDate) : '',
        c.city || '',
        c.community || '',
        c.houseArea || '',
        shortStyle || c.stylePreference || '',
        c.style || '',
        fu ? fu.text : (c.followUpDate ? fmtDate(c.followUpDate) : '—'),
        c.followUpDate || '',
        c.followUpNote || '',
      ]
    })
    const BOM = '\uFEFF'
    const csv = BOM + [headers.join(','), ...rows.map(r => r.map(c => `"${(c||'').replace(/"/g,'""')}"`).join(','))].join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = `客户列表_${new Date().toISOString().split('T')[0]}.csv`; a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="crm-page">
      <div className="crm-toolbar">
        <div className="crm-toolbar-left">
          <Search size={14} style={{ opacity: 0.4 }} />
          <input className="crm-search" placeholder="搜索客户、微信名、电话、户型…" value={search} onChange={e => setSearch(e.target.value)} />
          {followUpFilter && (
            <span className="crm-filter-chip">
              📅 {followUpFilter.start} ~ {followUpFilter.end}
              <button onClick={() => setFollowUpFilter(null)}><X size={12} /></button>
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
              <button className="crm-btn-ghost" onClick={handleDownload} title="下载为CSV表格"><Download size={13} /></button>
              <button className="crm-btn-primary" onClick={() => onAdd()}><Plus size={14} /> 添加客户</button>
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
                <th style={{ width: 160 }}>客户</th>
                <th style={{ width: 80 }}>日期</th>
                <th style={{ width: 70 }}>地区</th>
                <th style={{ width: 80 }}>小区名称</th>
                <th style={{ width: 70 }}>房子面积</th>
                <th style={{ width: 80 }}>喜欢风格</th>
                <th style={{ width: 90 }}>客户归属</th>
                <th style={{ width: 90 }}>跟进</th>
                <th style={{ width: 110 }}>
                  <button
                    className={`crm-th-sort active`}
                    onClick={() => setTimeDesc(v => !v)}
                    title={timeDesc ? '按跟进时间降序，点击切换升序' : '按跟进时间升序，点击切换降序'}
                  >
                    跟进时间
                    {timeDesc ? <ArrowDown size={11} /> : <ArrowUp size={11} />}
                  </button>
                </th>
                <th style={{ width: 70 }}>操作</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(c => {
                const fu = fuDisplay(c.followUpDate || null)
                const [g1, g2] = avatarGrad(c.name)
                const toggleSel = (id: string) => { const next = new Set(selectedIds); if (next.has(id)) next.delete(id); else next.add(id); setSelectedIds(next) }
                return (
                  <tr key={c.id} onClick={() => { if (batchMode) toggleSel(c.id); else setEditingCustomer(c) }}>
                    {batchMode && <td onClick={e => e.stopPropagation()}><input type="checkbox" checked={selectedIds.has(c.id)} onChange={() => toggleSel(c.id)} /></td>}
                    <td>
                      <div className="crm-td-name">
                        <div className="crm-avatar crm-avatar-sm" style={{ background: `linear-gradient(135deg,${g1},${g2})` }}>{c.name[0]}</div>
                        <div>
                          <div>{c.name}</div>
                          {c.wechat && <div className="crm-muted" style={{ fontSize: 10, lineHeight: 1.3 }}>{c.wechat}</div>}
                        </div>
                      </div>
                    </td>
                    <td><span className="crm-muted">{fmtDate(c.recordDate) || '—'}</span></td>
                    <td><span className="crm-info-text">{c.city || <span className="crm-muted">—</span>}</span></td>
                    <td><span className="crm-info-text">{c.community || <span className="crm-muted">—</span>}</span></td>
                    <td><span className="crm-info-text">{c.houseArea || <span className="crm-muted">—</span>}</span></td>
                    <td>{c.stylePreference ? <span className="crm-tag" style={{ background: (TAG_COLORS[c.stylePreference] || {}).bg || 'var(--bg-tertiary)', color: (TAG_COLORS[c.stylePreference] || {}).text || 'var(--text-secondary)' }}>{c.stylePreference}</span> : <span className="crm-muted">—</span>}</td>
                    <td>{c.style ? <span className="crm-tag" style={{ background: (TAG_COLORS[c.style] || {}).bg || 'var(--bg-tertiary)', color: (TAG_COLORS[c.style] || {}).text || 'var(--text-secondary)' }}>{c.style}</span> : <span className="crm-muted">—</span>}</td>
                    <td>{fu ? <span className={`crm-tag ${fu.cls}`}>{fu.text}</span> : <span className="crm-muted">—</span>}</td>
                    <td><span className="crm-muted">{c.followUpDate ? fmtDate(c.followUpDate) : '—'}</span></td>
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
          {kanbanGroups.columns.map(colId => {
            const cards = kanbanGroups.groups[colId] || []
            const isUnassigned = colId === '__unassigned'
            const accountInfo = !isUnassigned ? ACCOUNTS.find(a => a.id === colId) : null
            const label = accountInfo?.label || '未分配'
            const tagColor = !isUnassigned ? TAG_COLORS[colId] : { bg: '#6b7280', text: '#fff' }
            return (
              <div key={colId} className="crm-kanban-col"
                onDragOver={e => { e.preventDefault(); e.currentTarget.classList.add('drag-over') }}
                onDragLeave={e => { e.currentTarget.classList.remove('drag-over') }}
                onDrop={e => {
                  e.currentTarget.classList.remove('drag-over')
                  if (dragId) {
                    updateCust(dragId, { style: isUnassigned ? '' : colId })
                    setDragId(null)
                  }
                }}>
                <div className="crm-kanban-col-header">
                  <span className="crm-dot" style={{ background: tagColor.bg }} />
                  <span>{label}</span>
                  <span className="crm-kanban-count">{cards.length}</span>
                </div>
                <div className="crm-kanban-cards">
                  {cards.map(c => (
                    <div key={c.id} className={`crm-card ${dragId === c.id ? 'dragging' : ''}`}
                      style={{ borderLeftColor: tagColor.bg }}
                      draggable
                      onDragStart={e => { e.dataTransfer.effectAllowed = 'move'; setDragId(c.id) }}
                      onDragEnd={() => setDragId(null)}
                      onClick={() => setEditingCustomer(c)}>
                      <div className="crm-card-top">
                        <div className="crm-avatar crm-avatar-sm" style={{ background: `linear-gradient(135deg,${avatarGrad(c.name)[0]},${avatarGrad(c.name)[1]})` }}>{c.name[0]}</div>
                        <div>
                          <div className="crm-card-name">{c.name}</div>
                          {c.city && <div className="crm-muted" style={{ fontSize: 10 }}>{c.city}</div>}
                        </div>
                      </div>
                      <div className="crm-card-tags">
                        {c.stylePreference && <span className="crm-card-tag" style={{ background: (TAG_COLORS[c.stylePreference] || {}).bg || 'var(--bg-tertiary)', color: (TAG_COLORS[c.stylePreference] || {}).text || 'var(--text-secondary)' }}>{c.stylePreference}</span>}
                        {c.wechat && <span className="crm-card-tag tag-blue">{c.wechat}</span>}
                      </div>
                      <div className="crm-card-footer">
                        {(() => { const fu = fuDisplay(c.followUpDate); return fu ? <span className={`crm-tag ${fu.cls}`}>{fu.text}</span> : <span className="crm-muted">{c.followUpDate ? fmtDate(c.followUpDate) : '待定'}</span> })()}
                        <span className={`crm-stage-dot stage-${c.stage}`} title={STAGES.find(s => s.id === c.stage)?.label || c.stage} />
                      </div>
                    </div>
                  ))}
                </div>
                <button className="crm-kanban-add" onClick={() => onAdd(isUnassigned ? undefined : colId)}>+ 添加</button>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
