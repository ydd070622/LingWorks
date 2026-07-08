import { useState, useMemo } from 'react'
import { toast } from 'sonner'
import { Search, X, Download } from 'lucide-react'
import { pinyin } from 'pinyin-pro'
import Fuse from 'fuse.js'
import ExcelJS from 'exceljs'
import type { SharedProps, CRMData } from './types'
import { avatarGrad, today } from './helpers'

export default function ActiveProjectsPage({ data, planningProjects, batchUpdate, addProject, completeProject, deleteProject, updateProject, updateCust, setTab, designers, addDesigner, deleteDesigner, followUpFilter, setFollowUpFilter, discardProject }: SharedProps & { batchUpdate: (fn: (data: CRMData) => CRMData) => void }) {

  const availableCustomers = data.customers.filter(
    c => c.stage !== 'closed' && !planningProjects.some(p => p.customerId === c.id)
  )

  // --- Search & filter ---
  const [search, setSearch] = useState('')

  // Flatten projects with customer data for search/filter/export
  const flatProjects = useMemo(() => planningProjects.map(p => {
    const c = data.customers.find(c => c.id === p.customerId)
    return { ...p, _cust: c }
  }), [planningProjects, data.customers])

  const fuse = useMemo(() => new Fuse(flatProjects, {
    keys: ['_cust.name', '_cust.community', '_cust.phone', '_cust.followUpNote', 'designer'],
    threshold: 0.3,
    findAllMatches: true,
  }), [flatProjects])

  const filtered = useMemo(() => {
    let list = flatProjects
    if (search) {
      const results = fuse.search(search)
      list = results.map(r => r.item)
      const q = search.toLowerCase()
      const directMatches = flatProjects.filter(p =>
        (p._cust?.name || '').toLowerCase().includes(q) && !list.some(m => m.id === p.id)
      )
      list = [...list, ...directMatches]
      const pinyinMatches = flatProjects.filter(p =>
        pinyin(p._cust?.name || '').toLowerCase().includes(q) && !list.some(m => m.id === p.id)
      )
      list = [...list, ...pinyinMatches]
    }
    if (followUpFilter) {
      list = list.filter(p => p._cust?.followUpDate && p._cust.followUpDate >= followUpFilter.start && p._cust.followUpDate <= followUpFilter.end)
    }
    return list
  }, [flatProjects, search, fuse, followUpFilter])

  // Date helpers for filters
  const now = new Date()
  const daysFromNow = (n: number) => { const d = new Date(now); d.setDate(d.getDate() + n); return d.toISOString().slice(0,10) }
  const getMonday = (d: Date) => { const r = new Date(d); r.setDate(d.getDate() - (d.getDay() === 0 ? 6 : d.getDay() - 1)); return r }
  const fmtLocal = (d: Date) => d.toISOString().slice(0,10)
  const thisMon = getMonday(now)
  const thisWeekStart = fmtLocal(thisMon)
  const thisWeekEnd = fmtLocal(new Date(thisMon.getTime() + 6 * 86400000))
  const nextMon = new Date(thisMon.getTime() + 7 * 86400000)
  const nextWeekStart = fmtLocal(nextMon)
  const nextWeekEnd = fmtLocal(new Date(nextMon.getTime() + 6 * 86400000))

  // --- State ---
  const [manageMode, setManageMode] = useState(false)
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [showAdd, setShowAdd] = useState(false)
  const [showEdit, setShowEdit] = useState(false)
  const [showDesignerMgr, setShowDesignerMgr] = useState(false)
  const [newDesignerName, setNewDesignerName] = useState('')

  // Add form
  const [custSearch, setCustSearch] = useState('')
  const [selectedCustId, setSelectedCustId] = useState('')
  const [addStart, setAddStart] = useState(today())
  const [addEnd, setAddEnd] = useState('')
  const [addFuDate, setAddFuDate] = useState('')
  const [addDesignerVal, setAddDesignerVal] = useState('')
  const [addFuNote, setAddFuNote] = useState('')

// Edit form
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editStart, setEditStart] = useState('')
  const [editEnd, setEditEnd] = useState('')
  const [editFuDate, setEditFuDate] = useState('')
  const [editDesigner, setEditDesigner] = useState('')
  const [editFuNote, setEditFuNote] = useState('')
  const [editCompleteDate, setEditCompleteDate] = useState('')

  // Complete / Designer
  const [completingId, setCompletingId] = useState<string | null>(null)
  const [completedDate, setCompletedDate] = useState(today())

  const [showDropdown, setShowDropdown] = useState(false)

  // --- Helpers ---
  const filteredCusts = custSearch.trim()
    ? availableCustomers.filter(c => c.name.toLowerCase().includes(custSearch.toLowerCase()) || c.community.toLowerCase().includes(custSearch.toLowerCase()))
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
    setSelectedIds(s => s.length === filtered.length ? [] : filtered.map(p => p.id))
  }
  const batchDelete = () => {
    if (selectedIds.length === 0) return
    if (!confirm(`确定删除选中的 ${selectedIds.length} 个项目？`)) return
    selectedIds.forEach(id => deleteProject(id))
    setSelectedIds([]); setManageMode(false)
    toast.success(`已删除 ${selectedIds.length} 个项目`)
  }

  const handleDiscard = (id: string) => {
    const reason = prompt('废弃原因：', '业主暂不需要')
    if (!reason) return
    const note = prompt('废弃备注：', '方案废弃，保留历史记录。') || ''
    discardProject(id, reason, note)
  }

  // --- Add Project ---
  const resetAdd = () => { setCustSearch(''); setSelectedCustId(''); setAddDesignerVal(''); setAddFuNote(''); setAddStart(today()); setAddEnd(''); setAddFuDate('') }
  const handleAdd = () => {
    if (!selectedCustId) { toast.error('请选择客户'); return }
    if (!addStart) { toast.error('请填写开始日期'); return }
    if (!addEnd) { toast.error('请填写预估完成日期'); return }
    if (!addDesignerVal) { toast.error('请选择设计师'); return }
    batchUpdate(prev => {
      const newProject = { id: 'proj_' + Date.now(), customerId: selectedCustId, startDate: addStart, estEndDate: addEnd, designer: addDesignerVal, completedDate: null as string | null }
      let d = {
        ...prev,
        projects: [...(prev.projects || []), newProject]
      }
      if (addFuDate) {
        d = { ...d, customers: d.customers.map(c => c.id === selectedCustId ? { ...c, followUpDate: addFuDate } : c) }
      }
      if (addFuNote.trim()) {
        const c = prev.customers.find(c => c.id === selectedCustId)
        d = { ...d, customers: d.customers.map(cust => cust.id === selectedCustId ? { ...cust, followUpNote: addFuNote.trim(), followUpDate: addFuDate || c?.followUpDate || today() } : cust) }
      }
      return d
    })
    setShowAdd(false); resetAdd()
    toast.success('项目已创建（跟进已同步到客户管理）')
  }

  // --- Edit Project ---
  const openEdit = (pId: string) => {
    const p = planningProjects.find(p => p.id === pId); if (!p) return
    const c = data.customers.find(c => c.id === p.customerId)
    setEditingId(pId); setEditStart(p.startDate); setEditEnd(p.estEndDate)
    setEditFuDate(c?.followUpDate || ''); setEditDesigner(p.designer); setEditFuNote(c?.followUpNote || ''); setEditCompleteDate('')
    setShowEdit(true)
  }
  const handleEdit = () => {
    if (!editingId) return
    const p = planningProjects.find(p => p.id === editingId); if (!p) return
    // Set completed date → move to done (separate flow, uses completeProject)
    if (editCompleteDate) {
      completeProject(editingId, editCompleteDate)
      setShowEdit(false); setEditingId(null)
      return
    }
    // Atomic batch update: project + customer in one operation
    batchUpdate(prev => {
      let d = {
        ...prev,
        projects: (prev.projects || []).map(proj => proj.id === editingId ? { ...proj, startDate: editStart, estEndDate: editEnd, designer: editDesigner } : proj)
      }
      if (editFuDate) {
        d = { ...d, customers: d.customers.map(c => c.id === p.customerId ? { ...c, followUpDate: editFuDate } : c) }
      }
      if (editFuNote.trim()) {
        const c = prev.customers.find(c => c.id === p.customerId)
        d = { ...d, customers: d.customers.map(cust => cust.id === p.customerId ? { ...cust, followUpNote: editFuNote.trim(), followUpDate: editFuDate || c?.followUpDate || today() } : cust) }
      }
      return d
    })
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
    const inUse = [...planningProjects, ...data.projects.filter(p => !!p.completedDate)].some(p => p.designer === name)
    if (inUse) { toast.error(`设计师「${name}」还有项目关联，无法删除`); return }
    deleteDesigner(name); toast.success('设计师已删除')
  }

  const allSelected = filtered.length > 0 && filtered.every(p => selectedIds.includes(p.id))

  // --- Excel Export ---
  const handleDownload = async () => {
    const wb = new ExcelJS.Workbook()
    const ws = wb.addWorksheet('Sheet1')

    ws.columns = [
      { width: 5.5 },    // 序号
      { width: 9.375 },  // 客户
      { width: 9.125 },  // 小区名称
      { width: 8.125 },  // 开始日期
      { width: 13.375 }, // 预估完成日期
      { width: 13.625 }, // 确认完成日期
      { width: 13.625 }, // 下次跟进日期
      { width: 8.25 },   // 设计师
      { width: 72.125 }, // 跟进情况
    ]

    // Row 1-2: Merged title
    ws.mergeCells('A1:I2')
    const titleCell = ws.getCell('A1')
    titleCell.value = '平面规划中客户表'
    titleCell.font = { name: '微软雅黑', size: 14, bold: true }
    titleCell.alignment = { horizontal: 'center', vertical: 'middle' }
    ws.getRow(1).height = 14.25
    ws.getRow(2).height = 14.25

    // Row 3: Headers (height 32pt)
    const headers = ['序号', '客户', '小区名称', '开始日期', '预估完成日期', '确认完成日期', '下次跟进日期', '设计师', '跟进情况']
    const headerRow = ws.getRow(3)
    headerRow.height = 32
    headers.forEach((h, i) => {
      const cell = headerRow.getCell(i + 1)
      cell.value = h
      cell.font = { name: '微软雅黑', size: 10, bold: true }
      cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }
      cell.border = { top: { style: 'thin' }, bottom: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' } }
    })

    // Data rows
    filtered.forEach((p, idx) => {
      const row = ws.getRow(4 + idx)
      row.height = 40
      const c = p._cust
      const cells = [
        idx + 1,
        c?.name || '',
        c?.community || '',
        p.startDate ? p.startDate.split('-').slice(1).map(s => parseInt(s)).join('.') : '',
        p.estEndDate ? p.estEndDate.split('-').slice(1).map(s => parseInt(s)).join('.') : '',
        p.completedDate ? p.completedDate.split('-').slice(1).map(s => parseInt(s)).join('.') : '',
        c?.followUpDate ? c.followUpDate.split('-').slice(1).map(s => parseInt(s)).join('.') : '',
        p.designer || '',
        c?.followUpNote || '',
      ]
      cells.forEach((v, i) => {
        const cell = row.getCell(i + 1)
        cell.value = v
        cell.font = { name: '微软雅黑', size: 10 }
        cell.alignment = { horizontal: i === 8 ? 'left' : 'center', vertical: 'top', wrapText: true }
        cell.border = { top: { style: 'thin' }, bottom: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' } }
      })
    })

    const buf = await wb.xlsx.writeBuffer()
    const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = `平面规划中客户表_${today()}.xlsx`; a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div>
      {/* ═══ Toolbar ═══ */}
      <div className="crm-toolbar">
        <div className="crm-toolbar-left">
          <button className="btn btn-primary" onClick={() => setShowAdd(true)}>+ 新建项目</button>
          <Search size={14} style={{ opacity: 0.4, marginLeft: 8 }} />
          <input className="crm-search" placeholder="搜索客户、小区、设计师…" value={search} onChange={e => setSearch(e.target.value)} />
          <div className="crm-filter-btns">
            {[
              ['全部', null],
              ['本周', 'thisWeek'],
              ['下周', 'nextWeek'],
              ['近7天', '7d'],
              ['近14天', '14d'],
            ].map(([label, key]) => {
              const active = key === 'thisWeek' ? !!followUpFilter && followUpFilter.start === thisWeekStart
                : key === 'nextWeek' ? !!followUpFilter && followUpFilter.start === nextWeekStart
                : key === '7d' ? !!followUpFilter && followUpFilter.start === daysFromNow(0) && followUpFilter.end === daysFromNow(6)
                : key === '14d' ? !!followUpFilter && followUpFilter.start === daysFromNow(0) && followUpFilter.end === daysFromNow(13)
                : !followUpFilter
              return (
                <button key={key!} className={`crm-filter-btn ${active ? 'active' : ''}`}
                  onClick={() => {
                    if (key === 'thisWeek') setFollowUpFilter({ start: thisWeekStart, end: thisWeekEnd })
                    else if (key === 'nextWeek') setFollowUpFilter({ start: nextWeekStart, end: nextWeekEnd })
                    else if (key === '7d') setFollowUpFilter({ start: daysFromNow(0), end: daysFromNow(6) })
                    else if (key === '14d') setFollowUpFilter({ start: daysFromNow(0), end: daysFromNow(13) })
                    else setFollowUpFilter(null)
                  }}>{label}</button>
              )
            })}
          </div>
          {followUpFilter && (
            <span className="crm-filter-chip">
              📅 {followUpFilter.start} ~ {followUpFilter.end}
              <button onClick={() => setFollowUpFilter(null)}><X size={12} /></button>
            </span>
          )}
        </div>
        <div className="crm-toolbar-right">
          <span className="crm-page-count" style={{ marginRight: 8 }}>共 {filtered.length} 个项目</span>
          <button className="crm-btn-ghost" onClick={handleDownload} title="下载为Excel表格"><Download size={13} /></button>
          {manageMode ? (
            <>
              {selectedIds.length > 0 && (
                <button className="crm-btn-danger-outline" onClick={batchDelete}>删除选中 ({selectedIds.length})</button>
              )}
              <button className="crm-btn-ghost" onClick={() => { setManageMode(false); setSelectedIds([]) }}>取消</button>
            </>
          ) : (
            <button className="crm-btn-ghost" onClick={() => setManageMode(true)}>管理</button>
          )}
        </div>
      </div>

      {/* ═══ Table ═══ */}
      <div className="crm-table-wrap">
        <table className="crm-table">
          <thead>
            <tr>
              {manageMode && <th style={{ width: 40, textAlign: 'center' }}><input type="checkbox" checked={allSelected} onChange={toggleSelectAll} /></th>}
              <th style={{ textAlign: 'left' }}>客户</th><th>小区名称</th><th>开始日期</th><th>预估完成日期</th>
              <th>时间提醒</th><th>设计师</th><th>下次跟进日期</th><th>确认完成日期</th><th>跟进情况</th>
              <th style={{ textAlign: 'center' }}>操作</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr><td colSpan={manageMode ? 11 : 10}><div className="crm-empty"><span>📭</span>暂无进行中的项目</div></td></tr>
            )}
            {filtered.map(p => {
              const c = p._cust
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
                    </div>
                  </td>
                  <td className="cell-muted">{c?.community || <span className="cell-none">—</span>}</td>
                  <td className="cell-mono">{p.startDate}</td>
                  <td className="cell-mono">{p.estEndDate}</td>
                  <td><span className={`proj-reminder ${tr.cls}`}><span className="proj-reminder-dot" style={{ background: tr.color }} />{tr.text}</span></td>
                  <td>{p.designer ? <span className={`proj-designer ${designerCls(p.designer)}`}>{p.designer}</span> : <span className="cell-none">未分配</span>}</td>
                  <td className="cell-mono">{c?.followUpDate || <span className="cell-none">—</span>}</td>
                  <td><span className="cell-none">—</span></td>
                  <td>
                    <span className="proj-fu-note">
                      <span className="proj-fu-dot" style={{ background: getFuDot(p.customerId) }} />
                      <span style={{ maxWidth: 130, overflow: 'hidden', textOverflow: 'ellipsis', display: 'inline-block', verticalAlign: 'middle' }} title={noteText}>{noteText || <span className="cell-none">暂无备注</span>}</span>
                    </span>
                  </td>
                  <td style={{ textAlign: 'center', whiteSpace: 'nowrap' }} onClick={e => e.stopPropagation()}>
                    <button className="btn btn-complete btn-sm" onClick={() => { setCompletingId(p.id); setCompletedDate(today()) }}>确认完成</button>
                    <button className="btn btn-danger btn-sm" style={{ marginLeft: 6 }} onClick={() => handleDiscard(p.id)}>废弃方案</button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* ═══ Add Modal ═══ */}
      {showAdd && (
        <div className="proj-modal-overlay">
          <div className="proj-modal" onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h3 style={{ margin: 0 }}>新建项目</h3>
              <button className="crm-modal-close" onClick={() => { setShowAdd(false); resetAdd() }}><X size={18} /></button>
            </div>

            {/* Row 1: 客户 + 小区名称 */}
            <div style={{ display: 'flex', gap: 12, marginBottom: 12 }}>
              <div style={{ flex: 3 }}>
                <label>客户 <span className="proj-hint">（点击搜索框后出现下拉列表）</span></label>
                <div className="proj-search-wrap">
                  <Search size={14} className="proj-search-icon" />
                  <input className="proj-search-input" placeholder="点击此处搜索客户..."
                    value={selectedCust ? `${selectedCust.name} · ${selectedCust.community || '无小区'}` : custSearch}
                    onChange={e => { setCustSearch(e.target.value); setSelectedCustId(''); setShowDropdown(true) }}
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
                          <div key={c.id} className="proj-dropdown-item" onClick={() => { setSelectedCustId(c.id); setCustSearch('') }}>
                            <span className="proj-dropdown-name">{c.name}</span>
                            <span className="proj-dropdown-info">{c.community || '无小区'}</span>
                          </div>
                        ))
                      )}
                    </div>
                  )}
                </div>
              </div>
              <div style={{ flex: 2 }}>
                <label>小区名称 <span className="proj-hint">（自动获取）</span></label>
                <input className="proj-input" value={selectedCust?.community || ''} readOnly />
              </div>
            </div>

            {/* Row 2: 开始日期 + 预估完成日期 */}
            <div style={{ display: 'flex', gap: 12, marginBottom: 12 }}>
              <div style={{ flex: 1 }}>
                <label>开始日期</label>
                <input type="date" className="proj-input" value={addStart} onChange={e => setAddStart(e.target.value)} />
              </div>
              <div style={{ flex: 1 }}>
                <label>预估完成日期</label>
                <input type="date" className="proj-input" value={addEnd} onChange={e => setAddEnd(e.target.value)} />
              </div>
            </div>

            {/* Row 3: 下次跟进时间 + 设计师 */}
            <div style={{ display: 'flex', gap: 12, marginBottom: 12 }}>
              <div style={{ flex: 1 }}>
                <label>下次跟进时间 <span className="proj-hint">（同步到客户管理）</span></label>
                <input type="date" className="proj-input" value={addFuDate} onChange={e => setAddFuDate(e.target.value)} />
              </div>
              <div style={{ flex: 1 }}>
                <label>设计师</label>
                <div className="proj-designer-row">
                  <select className="proj-input" value={addDesignerVal} onChange={e => setAddDesignerVal(e.target.value)} style={{ flex: 1 }}>
                    <option value="">{designers.length === 0 ? '-- 请先添加设计师 --' : '-- 选择设计师 --'}</option>
                    {designers.map(d => <option key={d} value={d}>{d}</option>)}
                  </select>
                  <button className="btn btn-primary btn-sm" onClick={() => setShowDesignerMgr(true)}>+</button>
                </div>
              </div>
            </div>

            {/* Row 4: 跟进情况 textarea */}
            <div style={{ marginBottom: 12 }}>
              <label>跟进情况 <span className="proj-hint">（同步到客户管理）</span></label>
              <textarea className="proj-input" placeholder="输入跟进内容，会同步更新到客户管理系统" value={addFuNote} onChange={e => setAddFuNote(e.target.value)} rows={3} style={{ resize: 'vertical', minHeight: 72 }} />
            </div>

            <div className="proj-modal-actions">
              <button className="btn btn-ghost" onClick={() => { setShowAdd(false); resetAdd() }}>取消</button>
              <button className="btn btn-primary" onClick={handleAdd}>确认创建</button>
            </div>
          </div>
        </div>
      )}

      {/* ═══ Edit Modal ═══ */}
      {showEdit && editingId && (
        <div className="proj-modal-overlay">
          <div className="proj-modal" onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h3 style={{ margin: 0 }}>编辑项目</h3>
              <button className="crm-modal-close" onClick={() => { setShowEdit(false); setEditingId(null) }}><X size={18} /></button>
            </div>
            {(() => {
              const p = planningProjects.find(p => p.id === editingId)
              const c = p ? data.customers.find(c => c.id === p.customerId) : null
              return <>
                {/* Row 1: 客户 + 小区名称 */}
                <div style={{ display: 'flex', gap: 12, marginBottom: 12 }}>
                  <div style={{ flex: 3 }}>
                    <label>客户</label>
                    <input className="proj-input" value={c?.name || ''} readOnly />
                  </div>
                  <div style={{ flex: 2 }}>
                    <label>小区名称</label>
                    <input className="proj-input" value={c?.community || ''} readOnly />
                  </div>
                </div>

                {/* Row 2: 开始日期 + 预估完成日期 */}
                <div style={{ display: 'flex', gap: 12, marginBottom: 12 }}>
                  <div style={{ flex: 1 }}>
                    <label>开始日期</label>
                    <input type="date" className="proj-input" value={editStart} onChange={e => setEditStart(e.target.value)} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <label>预估完成日期</label>
                    <input type="date" className="proj-input" value={editEnd} onChange={e => setEditEnd(e.target.value)} />
                  </div>
                </div>

                {/* Row 3: 下次跟进时间 + 确认完成日期 */}
                <div style={{ display: 'flex', gap: 12, marginBottom: 12 }}>
                  <div style={{ flex: 1 }}>
                    <label>下次跟进时间 <span className="proj-hint">（同步到客户管理）</span></label>
                    <input type="date" className="proj-input" value={editFuDate} onChange={e => setEditFuDate(e.target.value)} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <label>确认完成日期 <span className="proj-hint">（项目将移至待约洽谈）</span></label>
                    <div className="proj-date-wrap">
                      <input type="date" className="proj-input" value={editCompleteDate || ''} onChange={e => {
                        setEditCompleteDate(e.target.value)
                      }} />
                      <span className="proj-date-icon">📅</span>
                    </div>
                  </div>
                </div>

                {/* Row 4: 设计师 */}
                <div style={{ marginBottom: 12 }}>
                  <label>设计师</label>
                  <select className="proj-input" value={editDesigner} onChange={e => setEditDesigner(e.target.value)}>
                    <option value="">-- 选择设计师 --</option>
                    {designers.map(d => <option key={d} value={d}>{d}</option>)}
                  </select>
                </div>

                {/* Row 5: 跟进情况 textarea */}
                <div style={{ marginBottom: 12 }}>
                  <label>跟进情况 <span className="proj-hint">（同步到客户管理）</span></label>
                  <textarea className="proj-input" placeholder="输入跟进内容" value={editFuNote} onChange={e => setEditFuNote(e.target.value)} rows={3} style={{ resize: 'vertical', minHeight: 72 }} />
                </div>
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
        <div className="proj-modal-overlay">
          <div className="proj-modal proj-modal-sm" onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h3 style={{ margin: 0 }}>管理设计师</h3>
              <button className="crm-modal-close" onClick={() => setShowDesignerMgr(false)}><X size={18} /></button>
            </div>
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
        <div className="proj-modal-overlay">
          <div className="proj-modal proj-modal-sm" style={{ textAlign: 'center' }} onClick={e => e.stopPropagation()}>
            <h3>确认完成项目</h3>
            <p className="proj-confirm-hint">
              将 <b>{data.customers.find(c => c.id === planningProjects.find(p => p.id === completingId)?.customerId)?.community || '项目'}</b> 标记为已完成
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
