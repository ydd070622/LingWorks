import { useState, useMemo } from 'react'
import { Search, X, Plus, ArrowUp, ArrowDown, Download } from 'lucide-react'
import { toast } from 'sonner'
import { pinyin } from 'pinyin-pro'
import Fuse from 'fuse.js'
import ExcelJS from 'exceljs'
import type { SharedProps, Customer, EnrichedCustomer } from './types'
import { TAG_COLORS } from './constants'
import { avatarGrad, fuDisplay, fmtDate, today } from './helpers'

export default function CustomerPage({ data, setEditingCustomer, enrichCust, updateCust, deleteCusts, followUpFilter, setFollowUpFilter }: SharedProps) {
  const [search, setSearch] = useState('')
  const [batchMode, setBatchMode] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [timeDesc, setTimeDesc] = useState(true)
  const [recordTimeDesc, setRecordTimeDesc] = useState(true)
  const [sortBy, setSortBy] = useState<'followUp' | 'record'>('followUp')

  // 只显示未归档的客户
  const customers = data.customers.filter(c => c.stage !== 'closed' && !c.archived).map(enrichCust)

  const fuse = useMemo(() => new Fuse(customers, {
    keys: ['name', 'city', 'stylePreference', 'style', 'followUpNote'],
    threshold: 0.3,
    findAllMatches: true,
  }), [customers])

  const filtered = useMemo(() => {
    let list = customers
    if (search) {
      // 1) Fuzzy search via Fuse
      const results = fuse.search(search)
      list = results.map(r => r.item)
      // 2) Direct Chinese substring match (catches "王小姐" in "王小姐梁先生")
      const q = search.toLowerCase()
      const directMatches = customers.filter(c =>
        c.name.toLowerCase().includes(q) && !list.some(m => m.id === c.id)
      )
      list = [...list, ...directMatches]
      // 3) Pinyin match (for romanized search like "wang")
      const pinyinMatches = customers.filter(c =>
        pinyin(c.name).toLowerCase().includes(q) && !list.some(m => m.id === c.id)
      )
      list = [...list, ...pinyinMatches]
    }
    // followUpFilter: filter by follow-up date range
    if (followUpFilter) {
      list = list.filter(c => c.followUpDate >= followUpFilter.start && c.followUpDate <= followUpFilter.end)
    }
    return list.sort((a, b) => {
      if (sortBy === 'record') {
        const ra = a.recordDate || ''
        const rb = b.recordDate || ''
        if (!ra && !rb) return 0
        if (!ra) return 1
        if (!rb) return -1
        return recordTimeDesc ? rb.localeCompare(ra) : ra.localeCompare(rb)
      }
      const da = a.followUpDate || ''
      const db = b.followUpDate || ''
      if (!da && !db) return 0
      if (!da) return 1
      if (!db) return -1
      return timeDesc ? db.localeCompare(da) : da.localeCompare(db)
    })
  }, [customers, search, fuse, timeDesc, recordTimeDesc, sortBy, followUpFilter])

  const onAdd = (account?: string) => setEditingCustomer(account ? { style: account } as Partial<Customer> : {})

  // Date helpers for filters
  const now = new Date()
  const daysFromNow = (n: number) => { const d = new Date(now); d.setDate(d.getDate() + n); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}` }
  const getMonday = (d: Date) => { const r = new Date(d); r.setDate(d.getDate() - (d.getDay() === 0 ? 6 : d.getDay() - 1)); return r }
  const fmtLocal = (d: Date) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
  const thisMon = getMonday(now)
  const thisWeekStart = fmtLocal(thisMon)
  const thisWeekEnd = fmtLocal(new Date(thisMon.getTime() + 6 * 86400000))
  const nextMon = new Date(thisMon.getTime() + 7 * 86400000)
  const thisWeekEnd2 = fmtLocal(nextMon)
  const nextWeekEnd = fmtLocal(new Date(nextMon.getTime() + 6 * 86400000))

  // Excel export — matches 客户信息表.xls template
  const handleDownload = async () => {
    const wb = new ExcelJS.Workbook()
    const ws = wb.addWorksheet('Sheet1')

    // Column widths (from XLS template: xlrd width / 256 = chars)
    // 序号6.1 | 日期6.0 | 业主姓名7.9 | 地区7.0 | 小区8.2 | 面积7.9 | 风格6.8 | 跟进时间8.9 | 跟进情况72.8
    ws.columns = [
      { width: 6.1 },   // 序号
      { width: 6.0 },   // 日期
      { width: 7.9 },   // 业主姓名
      { width: 7.0 },   // 地区
      { width: 8.2 },   // 小区
      { width: 7.9 },   // 面积
      { width: 6.8 },   // 风格
      { width: 8.9 },   // 跟进时间
      { width: 72.8 },  // 跟进情况
    ]

    // Row 1-2: Merged title "客户信息表" (row height 14.2pt = 28.4)
    ws.mergeCells('A1:I2')
    const titleCell = ws.getCell('A1')
    titleCell.value = '客户信息表'
    titleCell.font = { name: '微软雅黑', size: 14, bold: true }
    titleCell.alignment = { horizontal: 'center', vertical: 'middle' }
    ws.getRow(1).height = 14.2
    ws.getRow(2).height = 14.2

    // Row 3: Headers (row height 32pt)
    const headers = ['序号', '日期', '业主姓名', '地区', '小区', '面积', '风格', '跟进时间', '跟进情况']
    const headerRow = ws.getRow(3)
    headerRow.height = 32
    headers.forEach((h, i) => {
      const cell = headerRow.getCell(i + 1)
      cell.value = h
      cell.font = { name: '微软雅黑', size: 10, bold: true }
      cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }
      cell.border = {
        top: { style: 'thin' }, bottom: { style: 'thin' },
        left: { style: 'thin' }, right: { style: 'thin' },
      }
    })

    // Data rows (row height 40pt)
    filtered.forEach((c, idx) => {
      const row = ws.getRow(4 + idx)
      row.height = 40
      const styleShort = c.stylePreference === '意式极简' ? '意式' : c.stylePreference === '法式风格' ? '法式' : c.stylePreference
      const cells = [
        idx + 1,                                              // 序号
        c.recordDate ? c.recordDate.split('-').slice(1).map(s => parseInt(s)).join('.') : '',  // 日期: 6.26
        c.name,                                               // 业主姓名
        c.city || '',                                          // 地区
        c.community || '',                                     // 小区
        c.houseArea || '',                                     // 面积
        styleShort || c.stylePreference || '',                 // 风格
        c.followUpDate ? c.followUpDate.split('-').slice(1).map(s => parseInt(s)).join('.') : '',  // 跟进时间
        c.followUpNote || '',                                  // 跟进情况
      ]
      cells.forEach((v, i) => {
        const cell = row.getCell(i + 1)
        cell.value = v
        cell.font = { name: '微软雅黑', size: 10 }
        cell.alignment = { horizontal: i === 8 ? 'left' : 'center', vertical: 'top', wrapText: true }
        cell.border = {
          top: { style: 'thin' }, bottom: { style: 'thin' },
          left: { style: 'thin' }, right: { style: 'thin' },
        }
      })
    })

    const buf = await wb.xlsx.writeBuffer()
    const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = `客户信息表_${today()}.xlsx`; a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="crm-page">
      <div className="crm-toolbar">
        <div className="crm-toolbar-left">
          <Search size={14} style={{ opacity: 0.4 }} />
          <input className="crm-search" placeholder="搜索客户、微信名、电话、户型…" value={search} onChange={e => setSearch(e.target.value)} />
          {/* Quick filters */}
          <div className="crm-filter-btns">
            {[
              ['全部', null],
              ['本周', 'thisWeek'],
              ['下周', 'nextWeek'],
              ['近7天', '7d'],
              ['近14天', '14d'],
            ].map(([label, key]) => {
              const active = key === 'thisWeek' ? !!followUpFilter && followUpFilter.start === thisWeekStart
                : key === 'nextWeek' ? !!followUpFilter && followUpFilter.start === thisWeekEnd2
                : key === '7d' ? !!followUpFilter && followUpFilter.start === daysFromNow(0) && followUpFilter.end === daysFromNow(6)
                : key === '14d' ? !!followUpFilter && followUpFilter.start === daysFromNow(0) && followUpFilter.end === daysFromNow(13)
                : !followUpFilter
              return (
                <button key={key!} className={`crm-filter-btn ${active ? 'active' : ''}`}
                  onClick={() => {
                    if (key === 'thisWeek') setFollowUpFilter({ start: thisWeekStart, end: thisWeekEnd })
                    else if (key === 'nextWeek') setFollowUpFilter({ start: thisWeekEnd2, end: nextWeekEnd })
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
          <span className="crm-count-label">{filtered.length} 位客户</span>
          {batchMode ? (
            <>
              <button className="crm-btn-danger-outline" onClick={() => { if (selectedIds.size > 0) { deleteCusts(Array.from(selectedIds)); setSelectedIds(new Set()); setBatchMode(false) } }} disabled={selectedIds.size === 0}>
                删除选中 ({selectedIds.size})
              </button>
              <button className="crm-btn-ghost" onClick={() => { setBatchMode(false); setSelectedIds(new Set()) }}>取消</button>
            </>
          ) : (
            <>
              <button className="crm-btn-ghost" onClick={() => { setBatchMode(true) }}>管理</button>
              <button className="crm-btn-ghost" onClick={handleDownload} title="下载为Excel表格"><Download size={13} /></button>
              <button className="crm-btn-primary" onClick={() => onAdd()}><Plus size={14} /> 添加客户</button>
            </>
          )}
        </div>
      </div>

      <div className="crm-table-wrap">
        <table className="crm-table">
            <thead>
              <tr>
                {batchMode && <th style={{ width: 36 }}><input type="checkbox" checked={filtered.length > 0 && filtered.every(c => selectedIds.has(c.id))} onChange={e => { if (e.target.checked) setSelectedIds(new Set(filtered.map(c => c.id))); else setSelectedIds(new Set()) }} /></th>}
                <th style={{ width: 160, textAlign: 'left' }}>客户</th>
                <th style={{ width: 100 }}>
                  <button className="crm-th-sort" onClick={() => { setRecordTimeDesc(v => !v); setSortBy('record') }} title="点击排序">
                    添加时间
                    {recordTimeDesc ? <ArrowDown size={11} /> : <ArrowUp size={11} />}
                  </button>
                </th>
                <th style={{ width: 70 }}>地区</th>
                <th style={{ width: 80 }}>小区名称</th>
                <th style={{ width: 70 }}>房子面积</th>
                <th style={{ width: 80 }}>喜欢风格</th>
                <th style={{ width: 90 }}>客户归属</th>
                <th style={{ width: 90 }}>跟进</th>
                <th style={{ width: 110 }}>
                  <button className="crm-th-sort" onClick={() => { setTimeDesc(v => !v); setSortBy('followUp') }} title="点击排序">
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
                      <button className="crm-btn-ghost-xs" style={{ color: '#f87171' }} onClick={e => { e.stopPropagation(); if (confirm('确定归档？客户将不再出现在客户管理页面')) { updateCust(c.id, { archived: true }); toast.success(`${c.name} 已归档`) } }}>归档</button>
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
