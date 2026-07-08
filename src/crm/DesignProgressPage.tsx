import { Plus, Search, X } from 'lucide-react'
import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import type { SharedProps } from './types'
import { avatarGrad, fmtDate, today } from './helpers'
import ManualDesignProjectModal from './ManualDesignProjectModal'

export default function DesignProgressPage({ data, closedCusts, setViewingContract, updateCust, createBuildProjectFromDesign, addManualDesignProject, designers }: SharedProps) {
  const [search, setSearch] = useState('')
  const [showManualAdd, setShowManualAdd] = useState(false)
  const [editingRemarkId, setEditingRemarkId] = useState<string | null>(null)
  const [remarkText, setRemarkText] = useState('')

  const rows = useMemo(() => closedCusts
    .filter(c => !c.contractArchived)
    .map(c => {
      const project = data.projects.find(p => p.customerId === c.id)
      const projectName = c.designProjectName || c.community || '设计项目'
      return { customer: c, project, projectName }
    }), [closedCusts, data.projects])

  const filtered = search.trim()
    ? rows.filter(r =>
        r.projectName.toLowerCase().includes(search.toLowerCase()) ||
        r.customer.name.toLowerCase().includes(search.toLowerCase()) ||
        (r.project?.designer || '').toLowerCase().includes(search.toLowerCase())
      )
    : rows

  const editingCustomer = editingRemarkId ? closedCusts.find(c => c.id === editingRemarkId) : null
  const remarkHistory = editingCustomer?.designRemarkHistory ?? []

  const openRemark = (customerId: string) => {
    const c = closedCusts.find(c => c.id === customerId)
    setEditingRemarkId(customerId)
    setRemarkText(c?.designRemark || '')
  }

  const saveRemark = () => {
    if (!editingCustomer) return
    const content = remarkText.trim()
    if (!content) {
      toast.error('请输入项目备注')
      return
    }
    const history = editingCustomer.designRemarkHistory ?? []
    const nextHistory = content === (editingCustomer.designRemark || '')
      ? history
      : [...history, { id: 'design_remark_' + Date.now(), date: today(), content }]
    updateCust(editingCustomer.id, {
      designRemark: content,
      designRemarkHistory: nextHistory,
    })
    setEditingRemarkId(null)
    setRemarkText('')
    toast.success('设计项目备注已保存')
  }

  const handleToBuild = (customerId: string) => {
    const planEndDate = prompt('施工计划完成时间（YYYY-MM-DD，可留空）：', '')
    const detail = prompt('施工项目详情：', '由设计阶段转入施工。') || ''
    createBuildProjectFromDesign(customerId, planEndDate || undefined, detail)
  }

  return (
    <div>
      <div className="crm-toolbar">
        <div className="crm-toolbar-left">
          <button className="btn btn-primary" onClick={() => setShowManualAdd(true)}><Plus size={14} /> 补录设计项目</button>
          <Search size={14} style={{ opacity: 0.4, marginLeft: 8 }} />
          <input className="crm-search" placeholder="搜索项目名称、业主、设计师…" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <div className="crm-toolbar-right">
          <span className="crm-page-count">共 {filtered.length} 个项目</span>
        </div>
      </div>

      <div className="crm-table-wrap">
        <table className="crm-table">
          <thead>
            <tr>
              <th style={{ width: 50 }}>序号</th>
              <th>项目名称</th>
              <th>业主</th>
              <th>设计师</th>
              <th>签约起始时间</th>
              <th>本周设计内容</th>
              <th>本周遗留问题</th>
              <th>下周计划设计内容</th>
              <th>计划完成时间</th>
              <th>备注</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr><td colSpan={11}><div className="crm-empty"><span>📭</span>暂无设计进度项目</div></td></tr>
            )}
            {filtered.map((row, idx) => {
              const c = row.customer
              const [g1, g2] = avatarGrad(c.name)
              return (
                <tr key={c.id} style={{ cursor: 'pointer' }} onClick={() => setViewingContract(c)}>
                  <td>{idx + 1}</td>
                  <td style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{row.projectName}</td>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'center' }}>
                      <span className="cell-av" style={{ background: `linear-gradient(135deg,${g1},${g2})` }}>{c.name[0]}</span>
                      <span>{c.name}</span>
                    </div>
                  </td>
                  <td>{row.project?.designer ? <span className="crm-tag" style={{ background: 'rgba(59,130,246,.15)', color: '#60a5fa' }}>{row.project.designer}</span> : <span className="cell-none">—</span>}</td>
                  <td className="cell-mono">{c.signDate || c.updatedAt}</td>
                  <td><span className="cell-none">—</span></td>
                  <td><span className="cell-none">—</span></td>
                  <td><span className="cell-none">—</span></td>
                  <td className="cell-mono">{row.project?.estEndDate || <span className="cell-none">—</span>}</td>
                  <td>
                    <span className="cell-muted">{c.designRemark || '—'}</span>
                    {(c.designRemarkHistory?.length || 0) > 0 && <span className="crm-section-count" style={{ marginLeft: 6 }}>{c.designRemarkHistory!.length} 条</span>}
                  </td>
                  <td>
                    <button className="crm-btn-ghost-xs" onClick={e => { e.stopPropagation(); openRemark(c.id) }}>备注</button>
                    <button className="crm-btn-ghost-xs" style={{ marginLeft: 6 }} onClick={e => { e.stopPropagation(); setViewingContract(c) }}>合同</button>
                    <button className="crm-btn-ghost-xs crm-btn-primary-sm" style={{ marginLeft: 6 }} onClick={e => { e.stopPropagation(); handleToBuild(c.id) }}>进入施工</button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {editingCustomer && (
        <div className="crm-modal-overlay">
          <div className="crm-modal crm-modal-sm" onClick={e => e.stopPropagation()}>
            <div className="crm-modal-header">
              <span className="crm-modal-title">设计项目备注 · {editingCustomer.name}</span>
              <button className="crm-modal-close" onClick={() => setEditingRemarkId(null)}><X size={18} /></button>
            </div>
            <div className="crm-modal-body">
              <div className="crm-form-group">
                <label className="crm-form-label">本次备注</label>
                <textarea className="crm-form-textarea" rows={4} value={remarkText} onChange={e => setRemarkText(e.target.value)} placeholder="记录项目过程中的沟通、问题、安排等..." />
              </div>
              <div className="crm-section-title">
                备注历史
                {remarkHistory.length > 0 && <span className="crm-section-count">{remarkHistory.length} 条</span>}
              </div>
              {remarkHistory.length === 0 ? (
                <div className="crm-empty" style={{ padding: 16 }}>暂无历史备注</div>
              ) : (
                <div className="crm-fu-history" style={{ marginTop: 0 }}>
                  {[...remarkHistory].reverse().map(item => (
                    <div key={item.id} className="crm-fu-history-item">
                      <div className="crm-fu-history-dot" />
                      <div className="crm-fu-history-body">
                        <div className="crm-fu-history-date">{fmtDate(item.date)}</div>
                        <div className="crm-fu-history-content">{item.content}</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="crm-modal-footer">
              <button className="crm-btn-ghost" onClick={() => setEditingRemarkId(null)}>取消</button>
              <button className="crm-btn-primary" onClick={saveRemark}>保存备注</button>
            </div>
          </div>
        </div>
      )}
      {showManualAdd && (
        <ManualDesignProjectModal
          designers={designers}
          onSave={input => { addManualDesignProject(input); setShowManualAdd(false) }}
          onClose={() => setShowManualAdd(false)}
        />
      )}
    </div>
  )
}
