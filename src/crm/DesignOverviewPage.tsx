import { Plus, Search } from 'lucide-react'
import { useMemo, useState } from 'react'
import type { SharedProps } from './types'
import { avatarGrad } from './helpers'
import ManualDesignProjectModal from './ManualDesignProjectModal'

export default function DesignOverviewPage({ data, closedCusts, setViewingContract, createBuildProjectFromDesign, discardDesignProject, addManualDesignProject, designers }: SharedProps) {
  const [search, setSearch] = useState('')
  const [showManualAdd, setShowManualAdd] = useState(false)

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

  const handleToBuild = (customerId: string) => {
    const planEndDate = prompt('施工计划完成时间（YYYY-MM-DD，可留空）：', '')
    const detail = prompt('施工项目详情：', '由设计阶段转入施工。') || ''
    createBuildProjectFromDesign(customerId, planEndDate || undefined, detail)
  }

  const handleDiscard = (customerId: string) => {
    const reason = prompt('废弃原因：', '设计阶段终止')
    if (!reason) return
    const note = prompt('废弃备注：', '设计阶段项目终止，归档为废弃方案。') || ''
    discardDesignProject(customerId, reason, note)
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
              <th>计划完成时间</th>
              <th>进度</th>
              <th>项目详情</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr><td colSpan={9}><div className="crm-empty"><span>📭</span>暂无设计项目</div></td></tr>
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
                  <td className="cell-mono">{row.project?.estEndDate || <span className="cell-none">—</span>}</td>
                  <td><span className="crm-badge crm-badge-blue">已签约</span></td>
                  <td><span className="cell-muted">{c.designProjectDetail || '—'}</span></td>
                  <td style={{ whiteSpace: 'nowrap' }} onClick={e => e.stopPropagation()}>
                    <button className="crm-btn-ghost-xs crm-btn-primary-sm" onClick={() => handleToBuild(c.id)}>进入施工</button>
                    <button className="crm-btn-ghost-xs crm-btn-danger-sm" style={{ marginLeft: 6 }} onClick={() => handleDiscard(c.id)}>设计终止</button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

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
