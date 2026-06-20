import { useState } from 'react'
import type { SharedProps } from './types'
import { STAGES } from './constants'
import { avatarGrad, fuDisplay, fmtDate } from './helpers'

export default function Workbench({ data, followUps, todayCount, overdueCount, closedCusts, leadCount, updateCust, setEditingCustomer, setEditingNote, setTab }: SharedProps) {
  const active = data.customers.filter(c => !['closed', 'lead'].includes(c.stage))
  const communicating = active.filter(c => ['communicating', 'followup'].includes(c.stage)).length
  const followupCount = active.filter(c => c.stage === 'followup').length
  const closed = closedCusts.length
  const revenue = closedCusts.reduce((s, c) => s + (c.dealAmount || 0), 0)
  const paid = closedCusts.reduce((s, c) => s + (c.paymentPlan || []).filter(p => p.paid).reduce((ss, p) => ss + p.amount, 0), 0)
  const conversion = active.length + closed > 0 ? Math.round(closed / (active.length + closed) * 100) : 0

  const today = new Date().toISOString().split('T')[0]
  const todayFU = followUps.filter(c => c.followUpDate <= today)
  const futureFU = followUps.filter(c => c.followUpDate > today)

  const draftNotes = data.notes.filter(n => n.status === 'draft').length

  // Inline quick follow-up state
  const [expandedFuId, setExpandedFuId] = useState<string | null>(null)
  const [fuNote, setFuNote] = useState('')
  const [fuDate, setFuDate] = useState('')

  const openFU = (id: string, note: string, date: string) => {
    if (expandedFuId === id) { setExpandedFuId(null); return }
    setExpandedFuId(id)
    setFuNote(note)
    setFuDate(date)
  }

  const doneFU = (id: string, newStage?: string) => {
    if (newStage === 'closed') {
      const amt = prompt('成交金额（元）：', '28000')
      if (!amt) return
      const dealAmount = parseInt(amt) || 0
      updateCust(id, {
        stage: 'closed', followUpNote: fuNote, followUpDate: '',
        dealAmount, contractStatus: 'signed',
        paymentPlan: [
          { id: 'p_dep_' + Date.now(), label: '定金', amount: Math.round(dealAmount * 0.3), paid: false, date: '' },
          { id: 'p_pro_' + Date.now(), label: '进度款', amount: Math.round(dealAmount * 0.4), paid: false, date: '' },
          { id: 'p_fin_' + Date.now(), label: '尾款', amount: dealAmount - Math.round(dealAmount * 0.3) - Math.round(dealAmount * 0.4), paid: false, date: '' },
        ],
      })
    } else {
      updateCust(id, { followUpNote: fuNote, followUpDate: fuDate })
    }
    setExpandedFuId(null)
  }

  return (
    <div>
      {/* Main 3-Column Grid */}
      <div className="wb-main-grid">

        {/* Column 1: Focus */}
        <div className="wb-col-focus">
          {/* Big Stat Cards */}
          <div className="wb-stat-row">
            <div className="wb-stat-card">
              <div className="wb-stat-icon wb-stat-blue">👥</div>
              <div className="wb-stat-value">{active.length}</div>
              <div className="wb-stat-label">活跃客户</div>
              <div className="wb-stat-sub">沟通中 <span className="wb-text-green">{communicating}</span> · 待跟进 <span>{followupCount}</span></div>
              <div className="wb-stat-glow wb-glow-blue" />
            </div>
            <div className={`wb-stat-card${overdueCount > 0 ? ' wb-stat-urgent' : ''}`}>
              <div className={`wb-stat-icon ${overdueCount > 0 ? 'wb-stat-red' : 'wb-stat-yellow'}`}>⏰</div>
              <div className="wb-stat-value">{todayCount}</div>
              <div className="wb-stat-label">需要跟进</div>
              <div className="wb-stat-sub">{overdueCount > 0 ? <><span className="wb-text-red">{overdueCount} 人逾期！</span> · </> : ''}未来 <span>{futureFU.length}</span> 人待跟进</div>
              {overdueCount > 0 && <div className="wb-stat-glow wb-glow-red" />}
            </div>
          </div>

          {/* Follow-up Timeline */}
          <div className="wb-card">
            <div className="wb-card-hd">
              <span>📋</span><span className="wb-card-ttl">跟进时间线</span><span className="wb-card-badge">{followUps.length} 人</span>
              <button className="wb-card-link" onClick={() => setTab('customers')}>全部 →</button>
            </div>
            <div className="wb-card-body wb-card-body-nopad">
              {todayFU.length > 0 && (
                <>
                  <div className="wb-fu-label wb-fu-urgent">⚠️ 需立即处理 · {todayFU.length} 人</div>
                  {todayFU.map(c => {
                    const fu = fuDisplay(c.followUpDate)
                    const [g1, g2] = avatarGrad(c.name)
                    const isOpen = expandedFuId === c.id
                    return (
                      <div key={c.id}>
                        <div className={`wb-fu-row${isOpen ? ' wb-fu-open' : ''}`} onClick={() => openFU(c.id, c.followUpNote, c.followUpDate || today)}>
                          <div className="wb-fu-av" style={{ background: `linear-gradient(135deg,${g1},${g2})` }}>{c.name[0]}</div>
                          <div className="wb-fu-body">
                            <div className="wb-fu-name">{c.name}</div>
                            <div className="wb-fu-meta">{c.houseType || '未填'} · {c.city || '未填'} · {c.followUpNote || '需跟进'}</div>
                          </div>
                          {fu && <span className={`wb-fu-tag ${fu.cls}`}>{fu.text}</span>}
                        </div>
                        {isOpen && (
                          <div className="wb-fu-inline" onClick={e => e.stopPropagation()}>
                            <div className="wb-fu-inline-row">
                              <div className="wb-fu-inline-group" style={{ flex: 2 }}>
                                <label className="wb-fu-inline-label">本次跟进备注</label>
                                <textarea className="wb-fu-inline-input wb-fu-inline-textarea" value={fuNote} onChange={e => setFuNote(e.target.value)} />
                              </div>
                              <div className="wb-fu-inline-group">
                                <label className="wb-fu-inline-label">下次跟进</label>
                                <input type="date" className="wb-fu-inline-input" value={fuDate} onChange={e => setFuDate(e.target.value)} />
                              </div>
                            </div>
                            <div className="wb-fu-inline-actions">
                              <button className="wb-btn wb-btn-sm wb-btn-ghost" onClick={() => doneFU(c.id, 'closed')}>已成交</button>
                              <button className="wb-btn wb-btn-sm wb-btn-primary" onClick={() => doneFU(c.id)}>✅ 完成跟进</button>
                            </div>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </>
              )}
              {futureFU.length > 0 && (
                <>
                  <div className="wb-fu-label" style={{ marginTop: 4 }}>📅 即将跟进 · {futureFU.length} 人</div>
                  {futureFU.map(c => {
                    const fu = fuDisplay(c.followUpDate)
                    const [g1, g2] = avatarGrad(c.name)
                    const isOpen = expandedFuId === c.id
                    return (
                      <div key={c.id}>
                        <div className={`wb-fu-row${isOpen ? ' wb-fu-open' : ''}`} onClick={() => openFU(c.id, c.followUpNote, c.followUpDate || today)}>
                          <div className="wb-fu-av" style={{ background: `linear-gradient(135deg,${g1},${g2})` }}>{c.name[0]}</div>
                          <div className="wb-fu-body">
                            <div className="wb-fu-name">{c.name}</div>
                            <div className="wb-fu-meta">{c.houseType || '未填'} · {c.city || '未填'} · {c.followUpNote || '需跟进'}</div>
                          </div>
                          {fu && <span className={`wb-fu-tag ${fu.cls}`}>{fu.text}</span>}
                        </div>
                        {isOpen && (
                          <div className="wb-fu-inline" onClick={e => e.stopPropagation()}>
                            <div className="wb-fu-inline-row">
                              <div className="wb-fu-inline-group" style={{ flex: 2 }}>
                                <label className="wb-fu-inline-label">本次跟进备注</label>
                                <textarea className="wb-fu-inline-input wb-fu-inline-textarea" value={fuNote} onChange={e => setFuNote(e.target.value)} />
                              </div>
                              <div className="wb-fu-inline-group">
                                <label className="wb-fu-inline-label">下次跟进</label>
                                <input type="date" className="wb-fu-inline-input" value={fuDate} onChange={e => setFuDate(e.target.value)} />
                              </div>
                            </div>
                            <div className="wb-fu-inline-actions">
                              <button className="wb-btn wb-btn-sm wb-btn-ghost" onClick={() => doneFU(c.id, 'closed')}>已成交</button>
                              <button className="wb-btn wb-btn-sm wb-btn-primary" onClick={() => doneFU(c.id)}>✅ 完成跟进</button>
                            </div>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </>
              )}
              {followUps.length === 0 && <div className="wb-empty">🎉 暂无待跟进客户</div>}
            </div>
          </div>
        </div>

        {/* Column 2: Stats + Actions */}
        <div className="wb-col-side">
          <div className="wb-mini-metrics">
            <div className="wb-mm wb-mm-blue"><div className="wb-mm-value">{leadCount}</div><div className="wb-mm-label">新线索</div></div>
            <div className="wb-mm wb-mm-green"><div className="wb-mm-value">{closed}</div><div className="wb-mm-label">已成交</div></div>
            <div className="wb-mm wb-mm-yellow"><div className="wb-mm-value">{conversion}%</div><div className="wb-mm-label">转化率</div></div>
            <div className="wb-mm wb-mm-purple"><div className="wb-mm-value">¥{(paid / 10000).toFixed(1)}万</div><div className="wb-mm-label">已回款</div></div>
          </div>

          <div className="wb-card" style={{ marginTop: 12 }}>
            <div className="wb-card-hd"><span>⚡</span><span className="wb-card-ttl">快捷操作</span></div>
            <div className="wb-card-body">
              <div className="wb-jumps">
                <button className="wb-jump" onClick={() => { setTab('customers'); setTimeout(() => setEditingCustomer({ stage: 'wechat' }), 100) }}>👤 新增客户</button>
                <button className="wb-jump" onClick={() => { setTab('notes'); setTimeout(() => setEditingNote({}), 100) }}>✏️ 新增笔记<span className="wb-jump-badge">{draftNotes} 草稿</span></button>
                <button className="wb-jump" onClick={() => setTab('leadpool')}>🔍 线索池<span className="wb-jump-badge">{leadCount}</span></button>
                <button className="wb-jump" onClick={() => setTab('contracts')}>📄 合同管理<span className="wb-jump-badge">{closed} 份</span></button>
              </div>
            </div>
          </div>

          <div className="wb-card" style={{ marginTop: 12 }}>
            <div className="wb-card-hd"><span>💰</span><span className="wb-card-ttl">成交概览</span></div>
            <div className="wb-card-body">
              <div className="wb-rev-row"><span className="wb-rev-label">合同总额</span><span className="wb-rev-value">¥{revenue.toLocaleString()}</span></div>
              <div className="wb-rev-row"><span className="wb-rev-label">已回款</span><span className="wb-rev-value wb-rev-green">¥{paid.toLocaleString()}</span></div>
              <div className="wb-rev-row"><span className="wb-rev-label">均单</span><span className="wb-rev-sub">¥{closed > 0 ? (revenue / closed / 10000).toFixed(1) : 0}万</span></div>
            </div>
          </div>
        </div>

        {/* Column 3: Activity Feed */}
        <div className="wb-col-act">
          <div className="wb-card" style={{ height: '100%' }}>
            <div className="wb-card-hd"><span>📌</span><span className="wb-card-ttl">最近动态</span><span className="wb-card-badge">阶段变动</span></div>
            <div className="wb-card-body wb-card-body-nopad">
              <div className="wb-feed">
                {[...data.customers]
                  .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
                  .slice(0, 8)
                  .map(c => {
                    const stage = STAGES.find(s => s.id === c.stage)
                    return (
                      <div key={c.id} className="wb-act" onClick={() => setEditingCustomer(c)} style={{ cursor: 'pointer' }}>
                        <div className="wb-act-line"><div className="wb-act-dot" style={{ background: stage?.dotColor }} /></div>
                        <div className="wb-act-body">
                          <div className="wb-act-name">{c.name}</div>
                          <div className="wb-act-desc">
                            {c.stage === 'closed'
                              ? <><span className="wb-act-highlight">成交 ¥{c.dealAmount?.toLocaleString()}</span></>
                              : <>当前阶段：<span className="wb-act-highlight">{stage?.label}</span></>}
                          </div>
                          <div className="wb-act-time">{fmtDate(c.updatedAt)}</div>
                        </div>
                      </div>
                    )
                  })}
              </div>
            </div>
          </div>
        </div>

      </div>
    </div>
  )
}
