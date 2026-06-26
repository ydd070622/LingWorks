import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { toast } from 'sonner'
import type { SharedProps, FollowUp, Customer } from './types'
import { avatarGrad, fmtDate } from './helpers'
import { TAG_COLORS } from './constants'

type Urgency = 'urgent' | 'normal' | 'calm'

function getUrgency(days: number | null): Urgency {
  if (days === null) return 'calm'
  if (days <= 3) return 'urgent'
  if (days <= 7) return 'normal'
  return 'calm'
}

function urgencyLabel(u: Urgency) {
  if (u === 'urgent') return { emoji: '🔴', text: '紧急' }
  if (u === 'normal') return { emoji: '🟡', text: '一般' }
  return { emoji: '🟢', text: '不急' }
}

export default function Workbench({ data, followUps, closedCusts, updateCust, setEditingCustomer, setTab, setFollowUpFilter }: SharedProps) {
  const active = data.customers.filter(c => c.stage !== 'closed')
  const closed = closedCusts.length
  const today = new Date().toISOString().split('T')[0]

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

  // Group by urgency
  const groupByUrgency = (list: (Customer & { diff: number })[]) => {
    const groups: Record<Urgency, (Customer & { diff: number })[]> = { urgent: [], normal: [], calm: [] }
    list.forEach(c => {
      const d = daysUntil(c.followUpDate)
      groups[getUrgency(d)].push(c)
    })
    return groups
  }

  const fuGroups = groupByUrgency(followUps)
  // Add customers without follow-up date to "calm" group
  const noDateCusts = data.customers.filter(c => !c.followUpDate && c.stage !== 'closed')
  if (noDateCusts.length > 0) {
    fuGroups.calm = [...fuGroups.calm, ...noDateCusts.map(c => ({ ...c, diff: 999 }))]
  }

  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({})
  const [expandedFuId, setExpandedFuId] = useState<string | null>(null)
  const [fuNote, setFuNote] = useState('')
  const [fuDate, setFuDate] = useState('')

  const toggleGroup = (key: string) => setCollapsedGroups(s => ({ ...s, [key]: !s[key] }))

  const openFU = (id: string, _note: string, date: string) => {
    if (expandedFuId === id) { setExpandedFuId(null); return }
    setExpandedFuId(id)
    setFuNote('')
    setFuDate(date || today)
  }

  const markDone = (id: string) => {
    const cust = data.customers.find(c => c.id === id)
    const existingHistory = cust?.followUpHistory ?? []
    const todayStr = new Date().toISOString().split('T')[0]
    updateCust(id, {
      followUpDate: '',
      followUpNote: cust?.followUpNote || '',
      followUpHistory: [...existingHistory, { id: 'fu_' + Date.now(), date: todayStr, content: '已完成跟进', nextDate: undefined }],
    })
    toast.success(`已标记完成 · ${cust?.name || ''}`)
  }

  const doneFU = (id: string, newStage?: string) => {
    const cust = data.customers.find(c => c.id === id)
    const existingHistory = cust?.followUpHistory ?? []
    const todayStr = new Date().toISOString().split('T')[0]
    const newEntry: FollowUp = {
      id: 'fu_' + Date.now(), date: todayStr,
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

  const renderCard = (c: Customer) => {
    const [g1, g2] = avatarGrad(c.name)
    const urgency = getUrgency(daysUntil(c.followUpDate))
    const dateRaw = c.followUpDate
    const isOpen = expandedFuId === c.id

    return (
      <div key={c.id}>
        <div className={`wb-v2-card ${urgency}`}
          onClick={() => setEditingCustomer(c)}
          title="点击编辑客户信息"
        >
          <div className="wb-v2-card-date">
            <div className="wb-v2-card-day">{dateRaw ? dayNum(dateRaw) : '—'}</div>
            <div className="wb-v2-card-mon">{dateRaw ? `${monthLabel(dateRaw)} · ${weekdayName(dateRaw)}` : '待定'}</div>
          </div>
          <div className="wb-v2-card-info">
            <div className="wb-v2-card-top">
              <div className="wb-v2-card-av" style={{ background: `linear-gradient(135deg,${g1},${g2})` }}>{c.name[0]}</div>
              <span className="wb-v2-card-name">{c.name}</span>
              {c.city && <span className="wb-v2-card-city">{c.city}</span>}
              {c.stylePreference && (
                <span className="wb-v2-card-tag" style={{ background: (TAG_COLORS[c.stylePreference] || {}).bg || 'var(--bg-tertiary)', color: (TAG_COLORS[c.stylePreference] || {}).text || 'var(--text-secondary)' }}>
                  {c.stylePreference === '意式极简' ? '意式' : c.stylePreference === '法式风格' ? '法式' : c.stylePreference}
                </span>
              )}
            </div>
            <div className="wb-v2-card-note">{c.followUpNote || '暂无跟进备注'}</div>
          </div>
          <button className="wb-v2-card-btn" onClick={e => { e.stopPropagation(); markDone(c.id) }}>
            完成跟进
          </button>
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

  const urgencyKeys: Urgency[] = ['urgent', 'normal', 'calm']

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

      {/* Follow-up Cards grouped by urgency */}
      <div className="wb-v2-body">
        {urgencyKeys.map(key => {
          const list = fuGroups[key] || []
          const label = urgencyLabel(key)
          const collapsed = collapsedGroups[key] || false
          return (
            <div key={key} className="wb-v2-group">
              <div className="wb-v2-group-head" onClick={() => toggleGroup(key)}>
                <span className="wb-v2-group-dot" style={{ background: key === 'urgent' ? '#ef4444' : key === 'normal' ? '#f59e0b' : '#6b7280' }} />
                <span className="wb-v2-group-title" style={{ color: key === 'urgent' ? '#f87171' : key === 'normal' ? '#fbbf24' : '#9ca3af' }}>
                  {label.emoji} {label.text}
                </span>
                <span className="wb-v2-group-count">{list.length} 位</span>
                <span className="wb-v2-group-line" />
                <span className={`wb-v2-group-arrow ${collapsed ? '' : 'open'}`}>▶</span>
              </div>
              {!collapsed && list.length > 0 && (
                <div className="wb-v2-grid">
                  {list.map(renderCard)}
                </div>
              )}
              {!collapsed && list.length === 0 && (
                <div className="wb-v3-empty" style={{ padding: '10px 0' }}>暂无</div>
              )}
            </div>
          )
        })}
        {followUps.length === 0 && (
          <div className="wb-v3-empty">🎉 暂无待跟进客户</div>
        )}
      </div>

    </div>
  )
}
