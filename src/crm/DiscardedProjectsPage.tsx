import { useState } from 'react'
import { toast } from 'sonner'
import type { SharedProps } from './types'
import { avatarGrad, fmtDate } from './helpers'

const stageLabel: Record<string, string> = {
  planning: '平面规划中',
  meeting: '待约洽谈',
  design: '设计阶段',
}

export default function DiscardedProjectsPage({ data, discardedProjects, restoreDiscardedProject }: SharedProps) {
  const [manageMode, setManageMode] = useState(false)
  const [selectedIds, setSelectedIds] = useState<string[]>([])

  const toggleSelect = (id: string) => setSelectedIds(s => s.includes(id) ? s.filter(i => i !== id) : [...s, id])
  const toggleAll = () => setSelectedIds(s => s.length === discardedProjects.length ? [] : discardedProjects.map(p => p.id))
  const restoreSelected = () => {
    if (selectedIds.length === 0) return
    selectedIds.forEach(restoreDiscardedProject)
    toast.success(`已恢复 ${selectedIds.length} 个废弃方案`)
    setSelectedIds([])
    setManageMode(false)
  }

  return (
    <div>
      <div className="crm-page-header">
        <h2>废弃方案</h2>
        <span className="crm-page-count">共 {discardedProjects.length} 个方案</span>
        <div style={{ flex: 1 }} />
        {manageMode && selectedIds.length > 0 && (
          <button className="btn btn-primary btn-sm" onClick={restoreSelected}>恢复选中 ({selectedIds.length})</button>
        )}
        <button className={`btn btn-sm ${manageMode ? 'btn-danger' : 'btn-ghost'}`} style={{ marginLeft: 8 }} onClick={() => { setManageMode(!manageMode); setSelectedIds([]) }}>
          {manageMode ? '完成' : '管理'}
        </button>
      </div>

      <div className="crm-table-wrap">
        <table className="crm-table">
          <thead>
            <tr>
              {manageMode && <th style={{ width: 36, textAlign: 'center' }}><input type="checkbox" checked={discardedProjects.length > 0 && selectedIds.length === discardedProjects.length} onChange={toggleAll} /></th>}
              <th>来源阶段</th>
              <th>项目名称</th>
              <th>客户</th>
              <th>设计师</th>
              <th>废弃原因</th>
              <th>废弃备注</th>
              <th>废弃日期</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {discardedProjects.length === 0 && (
              <tr><td colSpan={manageMode ? 9 : 8}><div className="crm-empty"><span>📭</span>暂无废弃方案</div></td></tr>
            )}
            {discardedProjects.map(p => {
              const c = data.customers.find(c => c.id === p.customerId)
              const [g1, g2] = avatarGrad(c?.name || '')
              return (
                <tr key={p.id} onClick={() => manageMode && toggleSelect(p.id)} style={{ cursor: manageMode ? 'pointer' : 'default' }}>
                  {manageMode && <td style={{ textAlign: 'center' }} onClick={e => e.stopPropagation()}><input type="checkbox" checked={selectedIds.includes(p.id)} onChange={() => toggleSelect(p.id)} /></td>}
                  <td><span className="crm-archive-badge invalid"><span className="badge-dot" />{stageLabel[p.stage] || p.stage}</span></td>
                  <td style={{ fontWeight: 600 }}>{p.projectName}</td>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'center' }}>
                      <span className="cell-av" style={{ background: `linear-gradient(135deg,${g1},${g2})` }}>{c?.name?.[0] || '?'}</span>
                      <span>{c?.name || '—'}</span>
                    </div>
                  </td>
                  <td>{p.designer || <span className="cell-none">—</span>}</td>
                  <td><span className="crm-tag overdue">{p.reason}</span></td>
                  <td className="crm-notes-cell">{p.note || <span className="crm-muted">—</span>}</td>
                  <td className="crm-muted">{fmtDate(p.discardedDate)}</td>
                  <td><button className="crm-btn-ghost-xs" onClick={e => { e.stopPropagation(); restoreDiscardedProject(p.id) }}>恢复</button></td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
