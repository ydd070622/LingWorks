import type { SharedProps } from './types'
import { avatarGrad, fmtDate } from './helpers'

export default function CompletedBuildsPage({ data, completedBuildProjects }: SharedProps) {
  return (
    <div>
      <div className="crm-page-header">
        <h2>完工归档</h2>
        <span className="crm-page-count">共 {completedBuildProjects.length} 个完工项目</span>
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
              <th>完工日期</th>
              <th>完工备注</th>
            </tr>
          </thead>
          <tbody>
            {completedBuildProjects.length === 0 && (
              <tr><td colSpan={8}><div className="crm-empty"><span>📭</span>暂无完工归档项目</div></td></tr>
            )}
            {completedBuildProjects.map((p, idx) => {
              const c = data.customers.find(c => c.id === p.customerId)
              const [g1, g2] = avatarGrad(c?.name || '')
              return (
                <tr key={p.id}>
                  <td>{idx + 1}</td>
                  <td style={{ fontWeight: 600 }}>{p.projectName}</td>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'center' }}>
                      <span className="cell-av" style={{ background: `linear-gradient(135deg,${g1},${g2})` }}>{c?.name?.[0] || '?'}</span>
                      <span>{c?.name || '—'}</span>
                    </div>
                  </td>
                  <td>{p.designer || <span className="cell-none">—</span>}</td>
                  <td className="cell-mono">{p.signDate}</td>
                  <td className="cell-mono">{p.planEndDate || <span className="cell-none">—</span>}</td>
                  <td className="crm-muted">{fmtDate(p.completedDate)}</td>
                  <td className="crm-notes-cell">{p.completedNote || p.remark || p.detail || <span className="crm-muted">—</span>}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
