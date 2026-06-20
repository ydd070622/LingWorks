import type { SharedProps } from './types'
import { STAGES } from './constants'
import { avatarGrad, fuDisplay, fmtDate } from './helpers'

export default function Workbench({ data, followUps, todayCount, overdueCount, closedCusts, leadCount, setEditingCustomer, setTab }: SharedProps) {
  const total = data.customers.filter(c => c.stage !== 'closed').length
  const revenue = closedCusts.reduce((s, c) => s + (c.dealAmount || 0), 0)
  const thisMonth = new Date().toISOString().slice(0, 7)
  const newMonth = data.customers.filter(c => c.stage !== 'closed' && c.createdAt.startsWith(thisMonth)).length
  const allFollowUps = followUps
  const recentActivity = [...data.customers].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 5)

  return (
    <div>
      <div className="crm-kpi-grid">
        <div className="crm-kpi-card accent">
          <span className="crm-kpi-label">总客户数</span>
          <span className="crm-kpi-value">{total}</span>
          <span className="crm-kpi-sub">本月新增 {newMonth}</span>
        </div>
        <div className={`crm-kpi-card ${overdueCount > 0 ? 'danger' : 'warn'}`}>
          <span className="crm-kpi-label">今日待跟进</span>
          <span className="crm-kpi-value">{todayCount}</span>
          <span className="crm-kpi-sub">{overdueCount > 0 ? `${overdueCount} 人已逾期` : '暂无逾期'}</span>
        </div>
        <div className="crm-kpi-card success">
          <span className="crm-kpi-label">已成交</span>
          <span className="crm-kpi-value">{closedCusts.length}</span>
          <span className="crm-kpi-sub">转化率 {total > 0 ? Math.round(closedCusts.length / total * 100) : 0}%</span>
        </div>
        <div className="crm-kpi-card success">
          <span className="crm-kpi-label">总成交额</span>
          <span className="crm-kpi-value" style={{ fontSize: 22 }}>¥{(revenue / 10000).toFixed(1)}<span style={{ fontSize: 13, fontWeight: 500 }}>万</span></span>
          <span className="crm-kpi-sub">均单 ¥{closedCusts.length > 0 ? Math.round(revenue / closedCusts.length / 1000) / 10 : 0}万</span>
        </div>
      </div>

      <div className="crm-wb-grid">
        <div className="crm-section">
          <div className="crm-section-header">
            <span className="crm-section-title">⏰ 待跟进客户</span>
            <span className="crm-section-sub">{allFollowUps.length} 人待跟进</span>
            <button className="crm-btn-ghost-sm" style={{ marginLeft: 'auto' }} onClick={() => setTab('customers')}>全部 →</button>
          </div>
          <div className="crm-fu-list">
            {allFollowUps.length === 0 && <div className="crm-empty">暂无待跟进客户</div>}
            {allFollowUps.map(c => {
              const fu = fuDisplay(c.followUpDate)
              const [g1, g2] = avatarGrad(c.name)
              return (
                <div key={c.id} className="crm-fu-item" onClick={() => setEditingCustomer(c)}>
                  <div className="crm-avatar" style={{ background: `linear-gradient(135deg,${g1},${g2})` }}>{c.name[0]}</div>
                  <div className="crm-fu-info">
                    <div className="crm-fu-name">{c.name}</div>
                    <div className="crm-fu-detail">{c.houseType || '未填'} · {c.city || '未填'} · {c.followUpNote || '需跟进'}</div>
                  </div>
                  {fu && <span className={`crm-tag ${fu.cls}`}>{fu.text}</span>}
                </div>
              )
            })}
          </div>
        </div>

        <div className="crm-section">
          <div className="crm-section-header">
            <span className="crm-section-title">快捷操作</span>
          </div>
          <div className="crm-qa-grid">
            {[
              { label: '新增客户', action: () => { setTab('customers'); setTimeout(() => setEditingCustomer({ stage: 'wechat' }), 100) } },
              { label: `线索池 (${leadCount})`, action: () => setTab('leadpool') },
              { label: '看板视图', action: () => setTab('customers') },
              { label: `合同管理 (${closedCusts.length})`, action: () => setTab('contracts') },
              { label: '数据看板', action: () => setTab('dashboard') },
              { label: '笔记管理', action: () => setTab('notes') },
            ].map(qa => (
              <button key={qa.label} className="crm-qa-item" onClick={qa.action}>{qa.label}</button>
            ))}
          </div>
        </div>
      </div>

      <div className="crm-section" style={{ marginTop: 12 }}>
        <div className="crm-section-header">
          <span className="crm-section-title">最近动态</span>
        </div>
        <div>
          {recentActivity.map(c => {
            const stage = STAGES.find(s => s.id === c.stage)
            return (
              <div key={c.id} className="crm-activity-row" onClick={() => setEditingCustomer(c)}>
                <span className="crm-dot" style={{ background: stage?.dotColor }} />
                <span className="crm-activity-name">{c.name}</span>
                <span className="crm-activity-stage">
                  {c.stage === 'closed' ? `成交 ¥${(c.dealAmount || 0).toLocaleString()}` : `→ ${stage?.label}`}
                </span>
                <span className="crm-activity-date">{fmtDate(c.updatedAt)}</span>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
