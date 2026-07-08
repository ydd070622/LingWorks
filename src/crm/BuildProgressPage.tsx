import { Plus, Search } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import type { SharedProps } from './types'
import { avatarGrad } from './helpers'
import ManualBuildProjectModal from './ManualBuildProjectModal'
import BuildProjectEditModal from './BuildProjectEditModal'

export default function BuildProgressPage({
  data,
  buildProjects,
  setEditingCustomer,
  completeBuildProject,
  addManualBuildProject,
  updateBuildProject,
  updateCust,
  designers,
}: SharedProps) {
  const [search, setSearch] = useState('')
  const [showManualAdd, setShowManualAdd] = useState(false)
  const [editingProjectId, setEditingProjectId] = useState<string | null>(null)

  const editingProject = editingProjectId ? buildProjects.find(p => p.id === editingProjectId) : null
  const editingCustomer = editingProject ? data.customers.find(c => c.id === editingProject.customerId) : undefined

  const filtered = search.trim()
    ? buildProjects.filter(p =>
        p.projectName.toLowerCase().includes(search.toLowerCase()) ||
        (data.customers.find(c => c.id === p.customerId)?.name || '').toLowerCase().includes(search.toLowerCase()) ||
        (p.designer || '').toLowerCase().includes(search.toLowerCase())
      )
    : buildProjects

  const handleComplete = (id: string) => {
    const note = prompt('完工备注：', '施工项目已完工。') || ''
    completeBuildProject(id, note)
  }

  return (
    <div>
      <div className="crm-toolbar">
        <div className="crm-toolbar-left">
          <button className="btn btn-primary" onClick={() => setShowManualAdd(true)}><Plus size={14} /> 补录施工项目</button>
          <Search size={14} style={{ opacity: 0.4, marginLeft: 8 }} />
          <input className="crm-search" placeholder="搜索项目名称、业主、设计师..." value={search} onChange={e => setSearch(e.target.value)} />
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
              <th>本周施工内容</th>
              <th>本周主材进场</th>
              <th>本周遗留问题</th>
              <th>下周计划施工内容</th>
              <th>计划完成时间</th>
              <th>备注</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr><td colSpan={12}><div className="crm-empty"><span>📭</span>暂无施工进度项目</div></td></tr>
            )}
            {filtered.map((p, idx) => {
              const c = data.customers.find(c => c.id === p.customerId)
              const [g1, g2] = avatarGrad(c?.name || '')
              return (
                <tr key={p.id} style={{ cursor: 'pointer' }} onClick={() => setEditingProjectId(p.id)}>
                  <td>{idx + 1}</td>
                  <td style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{p.projectName}</td>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'center' }}>
                      <span className="cell-av" style={{ background: `linear-gradient(135deg,${g1},${g2})` }}>{c?.name?.[0] || '?'}</span>
                      <span>{c?.name || '—'}</span>
                    </div>
                  </td>
                  <td>{p.designer ? <span className="crm-tag" style={{ background: 'rgba(59,130,246,.15)', color: '#60a5fa' }}>{p.designer}</span> : <span className="cell-none">—</span>}</td>
                  <td className="cell-mono">{p.signDate}</td>
                  <td><span className="cell-muted">{p.thisWeekWork || p.progress || '—'}</span></td>
                  <td><span className="cell-muted">{p.thisWeekMaterials || '—'}</span></td>
                  <td><span className="cell-muted">{p.thisWeekIssues || '—'}</span></td>
                  <td><span className="cell-muted">{p.nextWeekPlan || '—'}</span></td>
                  <td className="cell-mono">{p.planEndDate || <span className="cell-none">—</span>}</td>
                  <td><span className="cell-muted">{p.remark || p.detail || '—'}</span></td>
                  <td style={{ whiteSpace: 'nowrap' }} onClick={e => e.stopPropagation()}>
                    <button className="crm-btn-ghost-xs" onClick={() => setEditingProjectId(p.id)}>编辑进度</button>
                    <button className="crm-btn-ghost-xs" style={{ marginLeft: 6 }} onClick={() => c && setEditingCustomer(c)}>查看业主</button>
                    <button className="crm-btn-ghost-xs crm-btn-primary-sm" style={{ marginLeft: 6 }} onClick={() => handleComplete(p.id)}>完工归档</button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {showManualAdd && (
        <ManualBuildProjectModal
          designers={designers}
          onSave={input => { addManualBuildProject(input); setShowManualAdd(false) }}
          onClose={() => setShowManualAdd(false)}
        />
      )}

      {editingProject && (
        <BuildProjectEditModal
          project={editingProject}
          customer={editingCustomer}
          designers={designers}
          mode="progress"
          onSave={(projectUpdate, customerUpdate) => {
            updateBuildProject(editingProject.id, projectUpdate)
            if (editingCustomer) updateCust(editingCustomer.id, customerUpdate)
            setEditingProjectId(null)
            toast.success('施工进度已保存')
          }}
          onClose={() => setEditingProjectId(null)}
        />
      )}
    </div>
  )
}
