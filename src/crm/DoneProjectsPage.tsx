import { useState } from 'react'
import { toast } from 'sonner'
import type { SharedProps } from './types'
import { avatarGrad } from './helpers'

export default function DoneProjectsPage({ data, doneProjects, deleteProject, designers }: SharedProps) {
  const todayStr = new Date().toISOString().split('T')[0]

  const [manageMode, setManageMode] = useState(false)
  const [selectedIds, setSelectedIds] = useState<string[]>([])

  const getFuDot = (custId: string) => {
    const c = data.customers.find(c => c.id === custId)
    if (!c || !c.followUpDate) return '#6b7280'
    const diff = Math.round((new Date(c.followUpDate + 'T00:00:00').getTime() - new Date(todayStr + 'T00:00:00').getTime()) / 86400000)
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
    setSelectedIds(s => s.length === doneProjects.length ? [] : doneProjects.map(p => p.id))
  }
  const batchDelete = () => {
    if (selectedIds.length === 0) return
    if (!confirm(`确定删除选中的 ${selectedIds.length} 个项目？`)) return
    selectedIds.forEach(id => deleteProject(id))
    setSelectedIds([]); setManageMode(false)
    toast.success(`已删除 ${selectedIds.length} 个项目`)
  }

  const allSelected = doneProjects.length > 0 && doneProjects.every(p => selectedIds.includes(p.id))

  return (
    <div>
      <div className="crm-page-header">
        <h2>✅ 已做项目</h2>
        <span className="crm-page-count">共 {doneProjects.length} 个项目</span>
        <div style={{ flex: 1 }} />
        {manageMode && selectedIds.length > 0 && (
          <button className="btn btn-danger btn-sm" onClick={batchDelete}>删除选中 ({selectedIds.length})</button>
        )}
        <button className={`btn btn-sm ${manageMode ? 'btn-danger' : 'btn-ghost'}`} style={{ marginLeft: 8 }} onClick={() => { setManageMode(!manageMode); setSelectedIds([]) }}>
          {manageMode ? '完成管理' : '管理'}
        </button>
      </div>

      <div className="crm-table-wrap">
        <table className="crm-table">
          <thead>
            <tr>
              {manageMode && <th style={{ width: 40, textAlign: 'center' }}><input type="checkbox" checked={allSelected} onChange={toggleSelectAll} /></th>}
              <th>客户</th><th>小区名称</th><th>开始日期</th><th>预估完成日期</th>
              <th>确认完成日期</th><th>设计师</th><th>跟进情况</th>
              {manageMode && <th />}
            </tr>
          </thead>
          <tbody>
            {doneProjects.length === 0 && (
              <tr><td colSpan={manageMode ? 9 : 8}><div className="crm-empty"><span>📭</span>暂无已完成的项目</div></td></tr>
            )}
            {doneProjects.map(p => {
              const c = data.customers.find(c => c.id === p.customerId)
              const [g1, g2] = avatarGrad(c?.name || '')
              const noteText = c?.followUpNote || ''
              return (
                <tr key={p.id}>
                  {manageMode && <td style={{ width: 40, textAlign: 'center' }}><input type="checkbox" checked={selectedIds.includes(p.id)} onChange={() => toggleSelect(p.id)} /></td>}
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span className="cell-av" style={{ background: `linear-gradient(135deg,${g1},${g2})` }}>{c?.name?.[0] || '?'}</span>
                      <span className="cell-name">{c?.name || '?'}</span>
                    </div>
                  </td>
                  <td className="cell-muted">{c?.community || <span className="cell-none">—</span>}</td>
                  <td className="cell-mono">{p.startDate}</td>
                  <td className="cell-mono">{p.estEndDate}</td>
                  <td className="cell-done">{p.completedDate}</td>
                  <td>{p.designer ? <span className={`proj-designer ${designerCls(p.designer)}`}>{p.designer}</span> : <span className="cell-none">未分配</span>}</td>
                  <td>
                    <span className="proj-fu-note">
                      <span className="proj-fu-dot" style={{ background: getFuDot(p.customerId) }} />
                      <span style={{ maxWidth: 130, overflow: 'hidden', textOverflow: 'ellipsis', display: 'inline-block', verticalAlign: 'middle' }} title={noteText}>{noteText || <span className="cell-none">暂无备注</span>}</span>
                    </span>
                  </td>
                  {manageMode && <td />}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
