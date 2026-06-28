import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { toast } from 'sonner'
import type { SharedProps, FollowUp, Customer } from './types'
import { avatarGrad, fmtDate, today } from './helpers'
import { TAG_COLORS } from './constants'

type SubKey = 'overdue' | 'today' | 'tomorrow' | 'dayAfter'
type MajorKey = 'normal' | 'calm'

function subLabel(key: SubKey) {
  if (key === 'overdue')  return { emoji: '⚠', text: '已逾期',   dotColor: '#ef4444', cardClass: 'overdue' }
  if (key === 'today')    return { emoji: '📍', text: '今天跟进', dotColor: '#f97316', cardClass: 'today' }
  if (key === 'tomorrow') return { emoji: '📅', text: '明天跟进', dotColor: '#eab308', cardClass: 'tomorrow' }
  return { emoji: '📅', text: '后天跟进', dotColor: '#22c55e', cardClass: 'dayAfter' }
}

export default function Workbench({ data, followUps, closedCusts, updateCust, setEditingCustomer, setTab, setFollowUpFilter }: SharedProps) {
  const active = data.customers.filter(c => c.stage !== 'closed')
  const closed = closedCusts.length

  // Natural weeks (Mon-Sun) — local-date-safe
  function fmtLocal(d: Date) { return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}` }

  const now = new Date()
  const dow = now.getDay()
  const thisMon = new Date(now); thisMon.setDate(now.getDate() - (dow === 0 ? 6 : dow - 1)); thisMon.setHours(0,0,0,0)
  const thisSun = new Date(thisMon); thisSun.setDate(thisMon.getDate() + 6)
  const nextMon = new Date(thisMon); nextMon.setDate(thisMon.getDate() + 7)
  const nextSun = new Date(nextMon); nextSun.setDate(nextMon.getDate() + 6)
  const thisMonStr = fmtLocal(thisMon)
  const thisSunStr = fmtLocal(thisSun)
  const nextMonStr = fmtLocal(nextMon)
  const nextSunStr = fmtLocal(nextSun)

  const thisWeekFU = followUps.filter(c => c.followUpDate >= thisMonStr && c.followUpDate <= thisSunStr)
  const nextWeekFU = followUps.filter(c => c.followUpDate >= nextMonStr && c.followUpDate <= nextSunStr)

  // Days until follow-up
  const daysUntil = (dateStr: string): number | null => {
    const d = new Date(dateStr + 'T00:00:00')
    const diff = d.getTime() - now.setHours(0,0,0,0)
    return Math.round(diff / 86400000)
  }

  // Group by due date
  type FuEntry = Customer & { diff: number }
  const allFUs: FuEntry[] = followUps.map(c => ({
    ...c,
    diff: daysUntil(c.followUpDate) ?? 999,
  }))

  const groups = {
    overdue:  allFUs.filter(c => c.diff < 0),
    today:    allFUs.filter(c => c.diff === 0),
    tomorrow: allFUs.filter(c => c.diff === 1),
    dayAfter: allFUs.filter(c => c.diff === 2),
    normal:   allFUs.filter(c => c.diff >= 3 && c.diff <= 7),
    calm:     allFUs.filter(c => c.diff > 7),
  }

  // Customers without follow-up date → "calm"
  const noDateCusts = data.customers.filter(c => !c.followUpDate && c.stage !== 'closed')
  if (noDateCusts.length > 0) {
    groups.calm = [...groups.calm, ...noDateCusts.map(c => ({ ...c, diff: 999 }))]
  }

  const urgentCount = groups.overdue.length + groups.today.length + groups.tomorrow.length + groups.dayAfter.length

  const subKeys: SubKey[] = ['overdue', 'today', 'tomorrow', 'dayAfter']

  const [collapsedUrgent, setCollapsedUrgent] = useState(false)
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({ normal: false, calm: false })
  const [expandedFuId, setExpandedFuId] = useState<string | null>(null)
  const [fuNote, setFuNote] = useState('')
  const [fuDate, setFuDate] = useState('')

  const toggleMajor = (key: string) => setCollapsedGroups(s => ({ ...s, [key]: !s[key] }))

  const openFU = (id: string, _note: string, date: string) => {
    if (expandedFuId === id) { setExpandedFuId(null); return }
    setExpandedFuId(id)
    setFuNote('')
    setFuDate(date || today())
  }

  const markDone = (id: string) => {
    const cust = data.customers.find(c => c.id === id)
    const existingHistory = cust?.followUpHistory ?? []
    updateCust(id, {
      followUpDate: '',
      followUpNote: cust?.followUpNote || '',
      followUpHistory: [...existingHistory, { id: 'fu_' + Date.now(), date: today(), content: '已完成跟进', nextDate: undefined }],
    })
    toast.success(`已标记完成 · ${cust?.name || ''}`)
  }

  const doneFU = (id: string, newStage?: string) => {
    const cust = data.customers.find(c => c.id === id)
    const existingHistory = cust?.followUpHistory ?? []
    const newEntry: FollowUp = {
      id: 'fu_' + Date.now(), date: today(),
      content: fuNote || (newStage === 'closed' ? '已成交' : '完成跟进'),
      nextDate: newStage === 'closed' ? undefined : (fuDate || undefined),
    }
    if (newStage === 'closed') {
      const amt = prompt('成交金额（元）：', '28000')
      if (!amt) return
      const dealAmount = parseInt(amt) || 0
      updateCust(id, {
        stage: 'closed', followUpNote: fuNote || '已成交', followUpDate: '',
        dealAmount, contractStatus: 'signed',
        paymentPlan: [
          { id: 'p_dep_' + Date.now(), label: '定金', amount: Math.round(dealAmount * 0.3), paid: false, date: '' },
          { id: 'p_pro_' + Date.now(), label: '进度款', amount: Math.round(dealAmount * 0.4), paid: false, date: '' },
          { id: 'p_fin_' + Date.now(), label: '尾款', amount: dealAmount - Math.round(dealAmount * 0.3) - Math.round(dealAmount * 0.4), paid: false, date: '' },
        ],
        followUpHistory: [...existingHistory, newEntry],
      })
      toast.success(`已成交 ¥${dealAmount.toLocaleString()} · ${cust?.name || ''}`)
    } else {
      updateCust(id, {
        followUpNote: fuNote || (cust?.followUpNote || ''),
        followUpDate: fuDate,
        followUpHistory: [...existingHistory, newEntry],
      })
      toast.success(`已记录跟进 · ${cust?.name || ''}`)
    }
    setExpandedFuId(null)
  }

  const weekdayName = (d: string) => ['周日','周一','周二','周三','周四','周五','周六'][new Date(d + 'T00:00:00').getDay()]
  const monthLabel = (d: string) => `${parseInt(d.split('-')[1])}月`
  const dayNum = (d: string) => d.split('-')[2]

  const diffBadge = (diff: number): string | null => {
    if (diff < 0) return `逾期 ${Math.abs(diff)} 天`
    if (diff === 0) return '今天'
    if (diff === 1) return '明天'
    if (diff === 2) return '后天'
    return null
  }

  const renderCard = (c: FuEntry, cardClass: string) => {
    const [g1, g2] = avatarGrad(c.name)
    const dateRaw = c.followUpDate
    const isOpen = expandedFuId === c.id
    const badge = diffBadge(c.diff)

    return (
      <div key={c.id}>
        <div className={`wb-v3-card ${cardClass}`}
          onClick={() => setEditingCustomer(c)}
          title="点击编辑客户信息"
        >
          <div className="wb-v3-card-date">
            <div className="wb-v3-card-day">{dateRaw ? dayNum(dateRaw) : '—'}</div>
            <div className="wb-v3-card-mon">{dateRaw ? `${monthLabel(dateRaw)} · ${weekdayName(dateRaw)}` : '待定'}</div>
          </div>
          <div className="wb-v3-card-info">
            <div className="wb-v3-card-top">
              <div className="wb-v3-card-av" style={{ background: `linear-gradient(135deg,${g1},${g2})` }}>{c.name[0]}</div>
              <span className="wb-v3-card-name">{c.name}</span>
              {c.city && <span className="wb-v3-card-city">{c.city}</span>}
              {c.stylePreference && (
                <span className="wb-v3-card-tag" style={{ background: (TAG_COLORS[c.stylePreference] || {}).bg || 'var(--bg-tertiary)', color: (TAG_COLORS[c.stylePreference] || {}).text || 'var(--text-secondary)' }}>
                  {c.stylePreference === '意式极简' ? '意式' : c.stylePreference === '法式风格' ? '法式' : c.stylePreference}
                </span>
              )}
            </div>
            <div className="wb-v3-card-note">{c.followUpNote || '暂无跟进备注'}</div>
          </div>
          <div className="wb-v3-card-footer">
            {badge && <span className={`wb-v3-card-badge ${cardClass}`}>{badge}</span>}
            <button className="wb-v3-card-btn" onClick={e => { e.stopPropagation(); markDone(c.id) }}>
              完成跟进
            </button>
          </div>
        </div>
        <AnimatePresence>
          {isOpen && (
            <motion.div className="wb-v3-fu-inline" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.2 }} onClick={e => e.stopPropagation()}>
              <div className="wb-v3-fu-inline-row">
                <div className="wb-v3-fu-inline-group" style={{ flex: 2 }}>
                  <label className="wb-v3-fu-inline-label">跟进备注</label>
                  <textarea className="wb-v3-fu-inline-input" value={fuNote} onChange={e => setFuNote(e.target.value)} />
                </div>
                <div className="wb-v3-fu-inline-group">
                  <label className="wb-v3-fu-inline-label">下次跟进</label>
                  <input type="date" className="wb-v3-fu-inline-input" value={fuDate} onChange={e => setFuDate(e.target.value)} />
                </div>
              </div>
              <div className="wb-v3-fu-inline-actions">
                <button className="wb-v3-fu-btn edit" onClick={() => doneFU(c.id, 'closed')}>已成交</button>
                <button className="wb-v3-fu-btn done" onClick={() => doneFU(c.id)}>保存跟进</button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    )
  }

  return (
    <div className="wb-v3">

      {/* Metric Cards — 4 clickable */}
      <div className="wb-v3-metrics">
        <div className="wb-v3-metric" onClick={() => { setFollowUpFilter(null); setTab('customers') }} title="查看全部客户">
          <div className="wb-v3-metric-icon" style={{ background: 'rgba(129,140,248,0.12)', color: '#818cf8' }}>👥</div>
          <div><div className="wb-v3-metric-value">{active.length}</div><div className="wb-v3-metric-label">全部客户</div></div>
        </div>
        <div className="wb-v3-metric" onClick={() => { setFollowUpFilter({ start: thisMonStr, end: thisSunStr }); setTab('customers') }} title="本周待跟进">
          <div className="wb-v3-metric-icon" style={{ background: 'rgba(239,68,68,0.12)', color: '#f87171' }}>❗</div>
          <div><div className="wb-v3-metric-value" style={{ color: '#f87171' }}>{thisWeekFU.length}</div><div className="wb-v3-metric-label">本周待跟进</div></div>
        </div>
        <div className="wb-v3-metric" onClick={() => { setFollowUpFilter({ start: nextMonStr, end: nextSunStr }); setTab('customers') }} title="下周待跟进">
          <div className="wb-v3-metric-icon" style={{ background: 'rgba(245,158,11,0.12)', color: '#fbbf24' }}>📅</div>
          <div><div className="wb-v3-metric-value" style={{ color: '#fbbf24' }}>{nextWeekFU.length}</div><div className="wb-v3-metric-label">下周待跟进</div></div>
        </div>
        <div className="wb-v3-metric" onClick={() => setTab('contracts')} title="已成交客户">
          <div className="wb-v3-metric-icon" style={{ background: 'rgba(34,197,94,0.12)', color: '#4ade80' }}>✅</div>
          <div><div className="wb-v3-metric-value" style={{ color: '#4ade80' }}>{closed}</div><div className="wb-v3-metric-label">已成交</div></div>
        </div>
      </div>

      {/* Follow-up Cards — v3 grouping */}
      <div className="wb-v3-body">

        {/* ═══ 🔴 紧急 — 可折叠父组 ═══ */}
        {urgentCount > 0 && (
          <div className="wb-v3-group wb-v3-group-major">
            <div className="wb-v3-group-head wb-v3-group-head-major" onClick={() => setCollapsedUrgent(!collapsedUrgent)}>
              <span className="wb-v3-group-dot" style={{ background: '#ef4444' }} />
              <span className="wb-v3-group-title" style={{ color: '#f87171' }}>🔴 紧急</span>
              <span className="wb-v3-group-count">{urgentCount} 位</span>
              <span className="wb-v3-group-line" />
              <span className={`wb-v3-group-arrow ${collapsedUrgent ? '' : 'open'}`}>▶</span>
            </div>

            {!collapsedUrgent && (
              <div className="wb-v3-urgent-children">
                {subKeys.map(key => {
                  const list = groups[key] || []
                  const label = subLabel(key)
                  if (list.length === 0) return null
                  return (
                    <div key={key} className="wb-v3-sub-group">
                      <div className="wb-v3-sub-head">
                        <span className="wb-v3-sub-dot" style={{ background: label.dotColor }} />
                        {label.emoji} {label.text}
                        <span className="wb-v3-sub-count">{list.length} 位</span>
                      </div>
                      <div className="wb-v3-grid wb-v3-grid-col-4">
                        {list.map(c => renderCard(c, label.cardClass))}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {/* ═══ 🟡 一般 ═══ */}
        {groups.normal.length > 0 && (
          <div className="wb-v3-group wb-v3-group-major">
            <div className="wb-v3-group-head wb-v3-group-head-major" onClick={() => toggleMajor('normal')}>
              <span className="wb-v3-group-dot" style={{ background: '#f59e0b' }} />
              <span className="wb-v3-group-title" style={{ color: '#fbbf24' }}>🟡 一般</span>
              <span className="wb-v3-group-count">{groups.normal.length} 位</span>
              <span className="wb-v3-group-line" />
              <span className={`wb-v3-group-arrow ${collapsedGroups.normal ? '' : 'open'}`}>▶</span>
            </div>
            {!collapsedGroups.normal && (
              <div className="wb-v3-grid wb-v3-grid-col-4">
                {groups.normal.map(c => renderCard(c, 'normal'))}
              </div>
            )}
          </div>
        )}

        {/* ═══ 🟢 不急 ═══ */}
        {groups.calm.length > 0 && (
          <div className="wb-v3-group wb-v3-group-major">
            <div className="wb-v3-group-head wb-v3-group-head-major" onClick={() => toggleMajor('calm')}>
              <span className="wb-v3-group-dot" style={{ background: '#6b7280' }} />
              <span className="wb-v3-group-title" style={{ color: '#9ca3af' }}>🟢 不急</span>
              <span className="wb-v3-group-count">{groups.calm.length} 位</span>
              <span className="wb-v3-group-line" />
              <span className={`wb-v3-group-arrow ${collapsedGroups.calm ? '' : 'open'}`}>▶</span>
            </div>
            {!collapsedGroups.calm && (
              <div className="wb-v3-grid wb-v3-grid-col-4">
                {groups.calm.map(c => renderCard(c, 'calm'))}
              </div>
            )}
          </div>
        )}

        {followUps.length === 0 && noDateCusts.length === 0 && (
          <div className="wb-v3-empty">🎉 暂无待跟进客户</div>
        )}
      </div>

    </div>
  )
}
