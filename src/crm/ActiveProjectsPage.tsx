import { useState } from 'react'
import { toast } from 'sonner'
import { Search } from 'lucide-react'
import type { SharedProps } from './types'
import { avatarGrad, today } from './helpers'

export default function ActiveProjectsPage({ data, activeProjects, addProject, completeProject, deleteProject, updateProject, updateCust, setTab, designers, addDesigner, deleteDesigner }: SharedProps) {

  const availableCustomers = data.customers.filter(
    c => c.stage !== 'closed' && !activeProjects.some(p => p.customerId === c.id)
  )

  // --- State ---
  const [manageMode, setManageMode] = useState(false)
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [showAdd, setShowAdd] = useState(false)
  const [showEdit, setShowEdit] = useState(false)
  const [showDesignerMgr, setShowDesignerMgr] = useState(false)
  const [newDesignerName, setNewDesignerName] = useState('')

  // Add form
  const [search, setSearch] = useState('')
  const [selectedCustId, setSelectedCustId] = useState('')
  const [addStart, setAddStart] = useState(today())
  const [addEnd, setAddEnd] = useState('')
  const [addDesignerVal, setAddDesignerVal] = useState('')
  const [addFuNote, setAddFuNote] = useState('')

// Edit form
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editStart, setEditStart] = useState('')
  const [editEnd, setEditEnd] = useState('')
  const [editDesigner, setEditDesigner] = useState('')
  const [editFuNote, setEditFuNote] = useState('')
  const [editCompleteDate, setEditCompleteDate] = useState('')

  // Complete / Designer
  const [completingId, setCompletingId] = useState<string | null>(null)
  const [completedDate, setCompletedDate] = useState(today())

  const [showDropdown, setShowDropdown] = useState(false)

  // --- Helpers ---
  const filteredCusts = search.trim()
    ? availableCustomers.filter(c => c.name.toLowerCase().includes(search.toLowerCase()) || c.community.toLowerCase().includes(search.toLowerCase()))
    : availableCustomers

  const selectedCust = data.customers.find(c => c.id === selectedCustId)

  const getFuDot = (custId: string) => {
    const c = data.customers.find(c => c.id === custId)
    if (!c || !c.followUpDate) return '#6b7280'
    const diff = Math.round((new Date(c.followUpDate + 'T00:00:00').getTime() - new Date(today() + 'T00:00:00').getTime()) / 86400000)
    if (diff < 0) return '#ef4444'
    if (diff === 0) return '#f97316'
    return '#3b82f6'
  }

  const getTimeReminder = (start: string, end: string) => {
    const s = new Date(start + 'T00:00:00'), e = new Date(end + 'T00:00:00'), n = new Date(today() + 'T00:00:00')
    const toEnd = Math.round((e.getTime() - n.getTime()) / 86400000), toStart = Math.round((s.getTime() - n.getTime()) / 86400000)
    if (toStart > 0) return { cls: 'far', text: toStart + '天后开始', color: '#6b7280' }
    if (toEnd < 0) return { cls: 'overdue', text: '已逾期 ' + Math.abs(toEnd) + ' 天', color: '#ef4444' }
    if (toEnd === 0) return { cls: 'today', text: '⏰ 今天完成', color: '#f59e0b' }
    if (toEnd === 1) return { cls: 'soon', text: '剩余 1 天', color: '#f97316' }
    if (toEnd <= 3) return { cls: 'soon', text: '剩余 ' + toEnd + ' 天', color: '#f97316' }
    return { cls: 'normal', text: '剩余 ' + toEnd + ' 天', color: '#3b82f6' }
  }

  const designerCls = (d: string) => {
    const idx = designers.indexOf(d)
    return ['a1','a2','a3','a4','a5'][idx % 5] || 'a1'
  }

  // --- Toggle ---
  const toggleSelect = (id: string) => {
    setSelectedIds(s => s.includes(id) ? s.filter(i => i !== id) : [...s, id])
  }
  const toggleSelectAll = () => {
    setSelectedIds(s => s.length === activeProjects.length ? [] : activeProjects.map(p => p.id))
  }
  const batchDelete = () => {
    if (selectedIds.length === 0) return
    if (!confirm(`确定删除选中的 ${selectedIds.length} 个项目？`)) return
    selectedIds.forEach(id => deleteProject(id))
    setSelectedIds([]); setManageMode(false)
    toast.success(`已删除 ${selectedIds.length} 个项目`)
  }

  // --- Add Project ---
  const resetAdd = () => { setSearch(''); setSelectedCustId(''); setAddDesignerVal(''); setAddFuNote(''); setAddStart(today()); setAddEnd('') }
  const handleAdd = () => {
    if (!selectedCustId) { toast.error('请选择客户'); return }
    if (!addStart) { toast.error('请填写开始日期'); return }
    if (!addEnd) { toast.error('请填写预估完成日期'); return }
    if (!addDesignerVal) { toast.error('请选择设计师'); return }
    addProject({ customerId: selectedCustId, startDate: addStart, estEndDate: addEnd, designer: addDesignerVal, completedDate: null })
    // Sync follow-up note to customer
    if (addFuNote.trim()) { updateCust(selectedCustId, { followUpNote: addFuNote.trim(), followUpDate: selectedCust?.followUpDate || today() }) }
    setShowAdd(false); resetAdd()
    toast.success('项目已创建（跟进已同步到客户管理）')
  }

  // --- Edit Project ---
  const openEdit = (pId: string) => {
    const p = activeProjects.find(p => p.id === pId); if (!p) return
    const c = data.customers.find(c => c.id === p.customerId)
    setEditingId(pId); setEditStart(p.startDate); setEditEnd(p.estEndDate)
    setEditDesigner(p.designer); setEditFuNote(c?.followUpNote || ''); setEditCompleteDate('')
    setShowEdit(true)
  }
  const handleEdit = () => {
    if (!editingId) return
    const p = activeProjects.find(p => p.id === editingId); if (!p) return
    updateProject(editingId, { startDate: editStart, estEndDate: editEnd, designer: editDesigner })
    // Sync follow-up note to customer
    if (editFuNote.trim()) {
      const c = data.customers.find(c => c.id === p.customerId)
      updateCust(p.customerId, { followUpNote: editFuNote.trim(), followUpDate: c?.followUpDate || today() })
    }
    // Set completed date → move to done
    if (editCompleteDate) {
      completeProject(editingId, editCompleteDate)
      setShowEdit(false); setEditingId(null)
      toast.success('项目已移至「已做项目」')
      return
    }
    setShowEdit(false); setEditingId(null)
    toast.success('项目已更新（跟进已同步到客户管理）')
  }

  // --- Complete ---
  const handleComplete = () => {
    if (!completingId) return
    completeProject(completingId, completedDate)
    setCompletingId(null)
  }

  // --- Designer ---
  const handleAddDesigner = () => {
    const n = newDesignerName.trim()
    if (!n) { toast.error('请输入设计师姓名'); return }
    if (designers.includes(n)) { toast.error('该设计师已存在'); return }
    addDesigner(n); setNewDesignerName('')
    toast.success('设计师已添加')
  }
  const handleDeleteDesigner = (name: string) => {
    const inUse = [...activeProjects, ...data.projects.filter(p => !!p.completedDate)].some(p => p.designer === name)
    if (inUse) { toast.error(`设计师「${name}」还有项目关联，无法删除`); return }
    deleteDesigner(name); toast.success('设计师已删除')
  }

  const allSelected = activeProjects.length > 0 && activeProjects.every(p => selectedIds.includes(p.id))

  return (
    <div>
      {/* ═══ Header ═══ */}
      <div className="crm-page-header">
        <h2>📐 在做项目</h2>
        <span className="crm-page-count">共 {activeProjects.length} 个项目</span>
        <div style={{ flex: 1 }} />
        {manageMode && selectedIds.length > 0 && (
          <button className="btn btn-danger btn-sm" onClick={batchDelete}>删除选中 ({selectedIds.length})</button>
        )}
        <button className={`btn btn-sm ${manageMode ? 'btn-danger' : 'btn-ghost'}`} style={{ marginLeft: 8 }} onClick={() => { setManageMode(!manageMode); setSelectedIds([]) }}>
          {manageMode ? '完成管理' : '管理'}
        </button>
      </div>

      <div className="crm-toolbar">
        <button className="btn btn-primary" onClick={() => setShowAdd(true)}>+ 新建项目</button>
      </div>

      {/* ═══ Table ═══ */}
      <div className="crm-table-wrap">
        <table className="crm-table">
          <thead>
            <tr>
              {manageMode && <th style={{ width: 40, textAlign: 'center' }}><input type="checkbox" checked={allSelected} onChange={toggleSelectAll} /></th>}
              <th style={{ textAlign: 'left' }}>客户</th><th>小区名称</th><th>开始日期</th><th>预估完成日期</th>
              <th>时间提醒</th><th>设计师</th><th>确认完成日期</th><th>跟进情况</th>
              <th style={{ textAlign: 'right' }}>操作</th>
            </tr>
          </thead>
          <tbody>
            {activeProjects.length === 0 && (
              <tr><td colSpan={manageMode ? 10 : 9}><div className="crm-empty"><span>📭</span>暂无进行中的项目</div></td></tr>
            )}
            {activeProjects.map(p => {
              const c = data.customers.find(c => c.id === p.customerId)
              const tr = getTimeReminder(p.startDate, p.estEndDate)
              const [g1, g2] = avatarGrad(c?.name || '')
              const noteText = c?.followUpNote || ''
              return (
                <tr key={p.id} onClick={() => manageMode ? toggleSelect(p.id) : openEdit(p.id)} style={{ cursor: 'pointer' }}>
                  {manageMode && <td style={{ width: 40, textAlign: 'center' }} onClick={e => e.stopPropagation()}><input type="checkbox" checked={selectedIds.includes(p.id)} onChange={() => toggleSelect(p.id)} /></td>}
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span className="cell-av" style={{ background: `linear-gradient(135deg,${g1},${g2})` }}>{c?.name?.[0] || '?'}</span>
                      <span className="cell-name">{c?.name || '?'}</span>
                      {!manageMode && <span className="proj-edit-hint">点击编辑</span>}
                    </div>
                  </td>
                  <td className="cell-muted">{c?.community || <span className="cell-none">—</span>}</td>
                  <td className="cell-mono">{p.startDate}</td>
                  <td className="cell-mono">{p.estEndDate}</td>
                  <td><span className={`proj-reminder ${tr.cls}`}><span className="proj-reminder-dot" style={{ background: tr.color }} />{tr.text}</span></td>
                  <td>{p.designer ? <span className={`proj-designer ${designerCls(p.designer)}`}>{p.designer}</span> : <span className="cell-none">未分配</span>}</td>
                  <td><span className="cell-none">—</span></td>
                  <td>
                    <span className="proj-fu-note">
                      <span className="proj-fu-dot" style={{ background: getFuDot(p.customerId) }} />
                      <span style={{ maxWidth: 130, overflow: 'hidden', textOverflow: 'ellipsis', display: 'inline-block', verticalAlign: 'middle' }} title={noteText}>{noteText || <span className="cell-none">暂无备注</span>}</span>
                    </span>
                  </td>
                  <td style={{ textAlign: 'right' }} onClick={e => e.stopPropagation()}>
                    <button className="btn btn-complete btn-sm" onClick={() => { setCompletingId(p.id); setCompletedDate(today()) }}>确认完成</button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* ═══ Add Modal ═══ */}
      {showAdd && (
        <div className="proj-modal-overlay" onClick={() => { setShowAdd(false); resetAdd() }}>
          <div className="proj-modal" onClick={e => e.stopPropagation()}>
            <h3>新建项目</h3>
            <label>客户 <span className="proj-hint">（点击搜索框后出现下拉列表）</span></label>
            <div className="proj-search-wrap">
              <Search size={14} className="proj-search-icon" />
              <input className="proj-search-input" placeholder="点击此处搜索客户..."
                value={selectedCust ? `${selectedCust.name} · ${selectedCust.community || '无小区'}` : search}
                onChange={e => { setSearch(e.target.value); setSelectedCustId(''); setShowDropdown(true) }}
                onFocus={() => { setShowDropdown(true) }}
                onBlur={() => setTimeout(() => setShowDropdown(false), 150)}
                autoComplete="off"
              />
              {!selectedCustId && showDropdown && (
                <div className="proj-dropdown">
                  {filteredCusts.length === 0 ? (
                    <div className="proj-dropdown-empty">无匹配客户</div>
                  ) : (
                    filteredCusts.map(c => (
                      <div key={c.id} className="proj-dropdown-item" onClick={() => { setSelectedCustId(c.id); setSearch('') }}>
                        <span className="proj-dropdown-name">{c.name}</span>
                        <span className="proj-dropdown-info">{c.community || '无小区'}</span>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
            <label>小区名称 <span className="proj-hint">（自动获取）</span></label>
            <input className="proj-input" value={selectedCust?.community || ''} readOnly />
            <label>开始日期</label>
            <input type="date" className="proj-input" value={addStart} onChange={e => setAddStart(e.target.value)} />
            <label>预估完成日期</label>
            <input type="date" className="proj-input" value={addEnd} onChange={e => setAddEnd(e.target.value)} />
            <label>设计师</label>
            <div className="proj-designer-row">
              <select className="proj-input" value={addDesignerVal} onChange={e => setAddDesignerVal(e.target.value)} style={{ flex: 1 }}>
                <option value="">{designers.length === 0 ? '-- 请先添加设计师 --' : '-- 选择设计师 --'}</option>
                {designers.map(d => <option key={d} value={d}>{d}</option>)}
              </select>
              <button className="btn btn-primary btn-sm" onClick={() => setShowDesignerMgr(true)}>+</button>
            </div>
            <label>跟进情况 <span className="proj-hint">（同步到客户管理）</span></label>
            <input className="proj-input" placeholder="输入跟进内容，会同步更新到客户管理系统" value={addFuNote} onChange={e => setAddFuNote(e.target.value)} />
            <div className="proj-modal-actions">
              <button className="btn btn-ghost" onClick={() => { setShowAdd(false); resetAdd() }}>取消</button>
              <button className="btn btn-primary" onClick={handleAdd}>确认创建</button>
            </div>
          </div>
        </div>
      )}

      {/* ═══ Edit Modal ═══ */}
      {showEdit && editingId && (
        <div className="proj-modal-overlay" onClick={() => { setShowEdit(false); setEditingId(null) }}>
          <div className="proj-modal" onClick={e => e.stopPropagation()}>
            <h3>编辑项目</h3>
            {(() => {
              const p = activeProjects.find(p => p.id === editingId)
              const c = p ? data.customers.find(c => c.id === p.customerId) : null
              return <>
                <label>客户</label>
                <input className="proj-input" value={c?.name || ''} readOnly />
                <label>小区名称</label>
                <input className="proj-input" value={c?.community || ''} readOnly />
                <label>开始日期</label>
                <input type="date" className="proj-input" value={editStart} onChange={e => setEditStart(e.target.value)} />
                <label>预估完成日期</label>
                <input type="date" className="proj-input" value={editEnd} onChange={e => setEditEnd(e.target.value)} />
                <label>确认完成日期 <span className="proj-hint">（如已完工可在此填写，项目将移至已做项目）</span></label>
                <div className="proj-date-wrap">
                  <input type="date" className="proj-input" value={editCompleteDate || ''} onChange={e => {
                    setEditCompleteDate(e.target.value)
                    if (e.target.value) setShowEditCompleteConfirm(true)
                  }} />
                  <span className="proj-date-icon">📅</span>
                </div>
                <label>设计师</label>
                <select className="proj-input" value={editDesigner} onChange={e => setEditDesigner(e.target.value)}>
                  <option value="">-- 选择设计师 --</option>
                  {designers.map(d => <option key={d} value={d}>{d}</option>)}
                </select>
                <label>跟进情况 <span className="proj-hint">（同步到客户管理）</span></label>
                <input className="proj-input" placeholder="输入跟进内容" value={editFuNote} onChange={e => setEditFuNote(e.target.value)} />
              </>
            })()}
            <div className="proj-modal-actions">
              <button className="btn btn-ghost" onClick={() => { setShowEdit(false); setEditingId(null) }}>取消</button>
              <button className="btn btn-primary" onClick={handleEdit}>保存</button>
            </div>
          </div>
        </div>
      )}

      {/* ═══ Designer Manager ═══ */}
      {showDesignerMgr && (
        <div className="proj-modal-overlay" onClick={() => setShowDesignerMgr(false)}>
          <div className="proj-modal proj-modal-sm" onClick={e => e.stopPropagation()}>
            <h3>管理设计师</h3>
            <label>添加新设计师</label>
            <div style={{ display: 'flex', gap: 6 }}>
              <input className="proj-input" style={{ flex: 1 }} placeholder="输入设计师姓名" value={newDesignerName} onChange={e => setNewDesignerName(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleAddDesigner()} />
              <button className="btn btn-primary btn-sm" onClick={handleAddDesigner}>添加</button>
            </div>
            <label style={{ marginTop: 14 }}>现有设计师（{designers.length} 位）</label>
            <div className="proj-designer-list">
              {designers.length === 0 ? (
                <div className="proj-dropdown-empty">暂无设计师，请添加</div>
              ) : (
                designers.map(d => (
                  <div key={d} className="proj-designer-list-item">
                    <span>{d}</span>
                    <button className="btn btn-danger btn-sm" onClick={() => handleDeleteDesigner(d)}>✕</button>
                  </div>
                ))
              )}
            </div>
            <div className="proj-modal-actions">
              <button className="btn btn-ghost" onClick={() => setShowDesignerMgr(false)}>关闭</button>
            </div>
          </div>
        </div>
      )}

      {/* ═══ Confirm Complete ═══ */}
      {completingId && (
        <div className="proj-modal-overlay" onClick={() => setCompletingId(null)}>
          <div className="proj-modal proj-modal-sm" style={{ textAlign: 'center' }} onClick={e => e.stopPropagation()}>
            <h3>确认完成项目</h3>
            <p className="proj-confirm-hint">
              将 <b>{data.customers.find(c => c.id === activeProjects.find(p => p.id === completingId)?.customerId)?.community || '项目'}</b> 标记为已完成
            </p>
            <label>确认完成日期</label>
            <div className="proj-date-wrap">
              <input type="date" className="proj-input" value={completedDate} onChange={e => setCompletedDate(e.target.value)} />
              <span className="proj-date-icon">📅</span>
            </div>
            <div className="proj-modal-actions">
              <button className="btn btn-ghost" onClick={() => setCompletingId(null)}>取消</button>
              <button className="btn btn-success" onClick={handleComplete}>✅ 确认完成</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
