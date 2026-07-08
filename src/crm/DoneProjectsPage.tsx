import { useState, useMemo } from 'react'
import { toast } from 'sonner'
import { Search, X, Download } from 'lucide-react'
import { pinyin } from 'pinyin-pro'
import Fuse from 'fuse.js'
import ExcelJS from 'exceljs'
import type { SharedProps } from './types'
import { avatarGrad, today } from './helpers'

export default function DoneProjectsPage({ data, meetingProjects, uncompleteProject, signContract, designers, setEditingCustomer, followUpFilter, setFollowUpFilter, discardProject }: SharedProps) {

  const [manageMode, setManageMode] = useState(false)
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [search, setSearch] = useState('')

  // Flatten with customer data
  const flatProjects = useMemo(() => meetingProjects.map(p => {
    const c = data.customers.find(c => c.id === p.customerId)
    return { ...p, _cust: c }
  }), [meetingProjects, data.customers])

  const fuse = useMemo(() => new Fuse(flatProjects, {
    keys: ['_cust.name', '_cust.community', '_cust.followUpNote', 'designer'],
    threshold: 0.3,
    findAllMatches: true,
  }), [flatProjects])

  const filtered = useMemo(() => {
    let list = flatProjects
    if (search) {
      const results = fuse.search(search)
      list = results.map(r => r.item)
      const q = search.toLowerCase()
      const direct = flatProjects.filter(p =>
        (p._cust?.name || '').toLowerCase().includes(q) && !list.some(m => m.id === p.id)
      )
      list = [...list, ...direct]
      const py = flatProjects.filter(p =>
        pinyin(p._cust?.name || '').toLowerCase().includes(q) && !list.some(m => m.id === p.id)
      )
      list = [...list, ...py]
    }
    if (followUpFilter) {
      list = list.filter(p => p._cust?.followUpDate && p._cust.followUpDate >= followUpFilter.start && p._cust.followUpDate <= followUpFilter.end)
    }
    return list
  }, [flatProjects, search, fuse, followUpFilter])

  // Date helpers
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

  const getFuDot = (custId: string) => {
    const c = data.customers.find(c => c.id === custId)
    if (!c || !c.followUpDate) return '#6b7280'
    const diff = Math.round((new Date(c.followUpDate + 'T00:00:00').getTime() - new Date(today() + 'T00:00:00').getTime()) / 86400000)
    if (diff < 0) return '#ef4444'
    if (diff === 0) return '#f97316'
    return '#3b82f6'
  }

  const designerCls = (d: string) => {
    const idx = designers.indexOf(d)
    return ['a1','a2','a3','a4','a5'][idx % 5] || 'a1'
  }

  const toggleSelect = (id: string) => {
    setSelectedIds(s => s.includes(id) ? s.filter(i => i !== id) : [...s, id])
  }
  const toggleSelectAll = () => {
    setSelectedIds(s => s.length === filtered.length ? [] : filtered.map(p => p.id))
  }
  const batchUncomplete = () => {
    if (selectedIds.length === 0) return
    if (!confirm('确定退档选中的 ' + selectedIds.length + ' 个项目？（将回到「平面规划中」）')) return
    selectedIds.forEach(id => uncompleteProject(id))
    setSelectedIds([]); setManageMode(false)
    toast.success('已退档 ' + selectedIds.length + ' 个项目')
  }

  const handleDiscard = (id: string) => {
    const reason = prompt('废弃原因：', '业主一直未到店')
    if (!reason) return
    const note = prompt('废弃备注：', '已完成方案但未签约，归档为废弃方案。') || ''
    discardProject(id, reason, note)
  }

  const allSelected = filtered.length > 0 && filtered.every(p => selectedIds.includes(p.id))

  // --- Excel Export ---
  const handleDownload = async () => {
    const wb = new ExcelJS.Workbook()
    const ws = wb.addWorksheet('Sheet1')

    ws.columns = [
      { width: 5.5 },     // 序号
      { width: 11.375 },  // 客户
      { width: 14.75 },   // 小区名称
      { width: 13.625 },  // 下次跟进日期
      { width: 9.375 },   // 设计师
      { width: 72.125 },  // 跟进情况
    ]

    // Row 1-2: Merged title
    ws.mergeCells('A1:F2')
    const titleCell = ws.getCell('A1')
    titleCell.value = '待约洽谈客户表'
    titleCell.font = { name: '微软雅黑', size: 14, bold: true }
    titleCell.alignment = { horizontal: 'center', vertical: 'middle' }
    ws.getRow(1).height = 14.25
    ws.getRow(2).height = 14.25

    // Row 3: Headers
    const headers = ['序号', '客户', '小区名称', '下次跟进日期', '设计师', '跟进情况']
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
        c?.followUpDate ? c.followUpDate.split('-').slice(1).map(s => parseInt(s)).join('.') : '',
        p.designer || '',
        c?.followUpNote || '',
      ]
      cells.forEach((v, i) => {
        const cell = row.getCell(i + 1)
        cell.value = v
        cell.font = { name: '微软雅黑', size: 10 }
        cell.alignment = { horizontal: i === 5 ? 'left' : 'center', vertical: 'top', wrapText: true }
        cell.border = { top: { style: 'thin' }, bottom: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' } }
      })
    })

    const buf = await wb.xlsx.writeBuffer()
    const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = '待约洽谈客户表_' + today() + '.xlsx'; a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div>
      {/* ═══ Toolbar ═══ */}
      <div className="crm-toolbar">
        <div className="crm-toolbar-left">
          <Search size={14} style={{ opacity: 0.4 }} />
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
                <button key={key!} className={'crm-filter-btn ' + (active ? 'active' : '')}
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
                <button className="crm-btn-danger-outline" onClick={batchUncomplete}>退档选中 ({selectedIds.length})</button>
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
              <th style={{ textAlign: 'left' }}>客户</th><th>小区名称</th><th>下次跟进日期</th>
              <th>设计师</th><th>跟进情况</th>
              <th style={{ textAlign: 'center' }}>操作</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr><td colSpan={manageMode ? 7 : 6}><div className="crm-empty"><span>📭</span>暂无待约洽谈的项目</div></td></tr>
            )}
            {filtered.map(p => {
              const c = p._cust
              const [g1, g2] = avatarGrad(c?.name || '')
              const noteText = c?.followUpNote || ''
              return (
                <tr key={p.id} onClick={() => { if (manageMode) toggleSelect(p.id); else c && setEditingCustomer(c) }} style={{ cursor: 'pointer' }}>
                  {manageMode && <td style={{ width: 40, textAlign: 'center' }} onClick={e => e.stopPropagation()}><input type="checkbox" checked={selectedIds.includes(p.id)} onChange={() => toggleSelect(p.id)} /></td>}
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span className="cell-av" style={{ background: 'linear-gradient(135deg,' + g1 + ',' + g2 + ')' }}>{c?.name?.[0] || '?'}</span>
                      <span className="cell-name">{c?.name || '?'}</span>
                    </div>
                  </td>
                  <td className="cell-muted">{c?.community || <span className="cell-none">—</span>}</td>
                  <td className="cell-mono">{c?.followUpDate || <span className="cell-none">—</span>}</td>
                  <td>{p.designer ? <span className={'proj-designer ' + designerCls(p.designer)}>{p.designer}</span> : <span className="cell-none">未分配</span>}</td>
                  <td>
                    <span className="proj-fu-note">
                      <span className="proj-fu-dot" style={{ background: getFuDot(p.customerId) }} />
                      <span style={{ maxWidth: 130, overflow: 'hidden', textOverflow: 'ellipsis', display: 'inline-block', verticalAlign: 'middle' }} title={noteText}>{noteText || <span className="cell-none">暂无备注</span>}</span>
                    </span>
                  </td>
                  <td style={{ textAlign: 'center', whiteSpace: 'nowrap' }} onClick={e => e.stopPropagation()}>
                    <button className="btn btn-ghost btn-sm" style={{ marginRight: 6 }} onClick={() => { if (confirm('确定将此项目退回「平面规划中」？')) uncompleteProject(p.id) }}>退档</button>
                    <button className="btn btn-complete btn-sm" onClick={() => signContract(p.id)}>合同签订</button>
                    <button className="btn btn-danger btn-sm" style={{ marginLeft: 6 }} onClick={() => handleDiscard(p.id)}>废弃方案</button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
