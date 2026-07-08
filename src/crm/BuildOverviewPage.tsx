import { useState } from 'react'
import { toast } from 'sonner'
import { Plus, Search, X } from 'lucide-react'
import type { SharedProps } from './types'
import { avatarGrad, today } from './helpers'
import ManualBuildProjectModal from './ManualBuildProjectModal'
import BuildProjectEditModal from './BuildProjectEditModal'

export default function BuildOverviewPage({
  data,
  buildProjects,
  addBuildProject,
  updateBuildProject,
  completeBuildProject,
  addManualBuildProject,
  designers,
  setEditingCustomer,
  updateCust,
}: SharedProps) {
  const [showAdd, setShowAdd] = useState(false)
  const [showManualAdd, setShowManualAdd] = useState(false)
  const [editingProjectId, setEditingProjectId] = useState<string | null>(null)
  const [search, setSearch] = useState('')

  const [addProjectName, setAddProjectName] = useState('')
  const [addCustomerId, setAddCustomerId] = useState('')
  const [addDesigner, setAddDesigner] = useState('')
  const [addSignDate, setAddSignDate] = useState(today())
  const [addPlanEndDate, setAddPlanEndDate] = useState('')
  const [custSearch, setCustSearch] = useState('')
  const [showCustDropdown, setShowCustDropdown] = useState(false)

  const availableCustomers = data.customers.filter(c => c.stage === 'closed')
  const filteredCustomers = custSearch.trim()
    ? availableCustomers.filter(c => c.name.toLowerCase().includes(custSearch.toLowerCase()))
    : availableCustomers
  const selectedCust = data.customers.find(c => c.id === addCustomerId)
  const editingProject = editingProjectId ? buildProjects.find(p => p.id === editingProjectId) : null
  const editingCustomer = editingProject ? data.customers.find(c => c.id === editingProject.customerId) : undefined

  const resetAdd = () => {
    setAddProjectName('')
    setAddCustomerId('')
    setAddDesigner('')
    setAddSignDate(today())
    setAddPlanEndDate('')
    setCustSearch('')
  }

  const handleAdd = () => {
    if (!addProjectName.trim()) { toast.error('请填写项目名称'); return }
    if (!addCustomerId) { toast.error('请选择业主'); return }
    if (!addDesigner) { toast.error('请选择设计师'); return }
    if (!addSignDate) { toast.error('请选择签约起始时间'); return }
    addBuildProject({
      projectName: addProjectName.trim(),
      customerId: addCustomerId,
      designer: addDesigner,
      signDate: addSignDate,
      planEndDate: addPlanEndDate,
      progress: '',
      detail: '',
    })
    setShowAdd(false)
    resetAdd()
  }

  const handleComplete = (id: string) => {
    const note = prompt('完工备注：', '施工项目已完工。') || ''
    completeBuildProject(id, note)
  }

  const filtered = search.trim()
    ? buildProjects.filter(p =>
        p.projectName.toLowerCase().includes(search.toLowerCase()) ||
        (data.customers.find(c => c.id === p.customerId)?.name || '').toLowerCase().includes(search.toLowerCase())
      )
    : buildProjects

  return (
    <div>
      <div className="crm-toolbar">
        <div className="crm-toolbar-left">
          <button className="btn btn-primary" onClick={() => setShowAdd(true)}><Plus size={14} /> 新建施工项目</button>
          <button className="btn btn-ghost" onClick={() => setShowManualAdd(true)}><Plus size={14} /> 补录施工项目</button>
          <Search size={14} style={{ opacity: 0.4, marginLeft: 8 }} />
          <input className="crm-search" placeholder="搜索项目名称、业主..." value={search} onChange={e => setSearch(e.target.value)} />
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
              <tr><td colSpan={9}><div className="crm-empty"><span>📭</span>暂无施工项目</div></td></tr>
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
                  <td className="cell-mono">{p.planEndDate || <span className="cell-none">—</span>}</td>
                  <td><span className="cell-muted">{p.progress || '—'}</span></td>
                  <td><span className="cell-muted">{p.detail || '—'}</span></td>
                  <td onClick={e => e.stopPropagation()} style={{ whiteSpace: 'nowrap' }}>
                    <button className="crm-btn-ghost-xs" onClick={() => setEditingProjectId(p.id)}>编辑项目</button>
                    <button className="crm-btn-ghost-xs" style={{ marginLeft: 6 }} onClick={() => c && setEditingCustomer(c)}>查看业主</button>
                    <button className="crm-btn-ghost-xs crm-btn-primary-sm" style={{ marginLeft: 6 }} onClick={() => handleComplete(p.id)}>完工归档</button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {showAdd && (
        <div className="proj-modal-overlay">
          <div className="proj-modal" onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h3 style={{ margin: 0 }}>新建施工项目</h3>
              <button className="crm-modal-close" onClick={() => { setShowAdd(false); resetAdd() }}><X size={18} /></button>
            </div>

            <div style={{ marginBottom: 12 }}>
              <label>项目名称 *</label>
              <input className="proj-input" placeholder="如：翡翠湾花园施工" value={addProjectName} onChange={e => setAddProjectName(e.target.value)} />
            </div>

            <div style={{ marginBottom: 12 }}>
              <label>业主 *</label>
              <div className="proj-search-wrap">
                <Search size={14} className="proj-search-icon" />
                <input
                  className="proj-search-input"
                  placeholder="搜索已成交客户..."
                  value={selectedCust ? selectedCust.name : custSearch}
                  onChange={e => { setCustSearch(e.target.value); setAddCustomerId(''); setShowCustDropdown(true) }}
                  onFocus={() => setShowCustDropdown(true)}
                  onBlur={() => setTimeout(() => setShowCustDropdown(false), 150)}
                  autoComplete="off"
                />
                {!addCustomerId && showCustDropdown && (
                  <div className="proj-dropdown">
                    {filteredCustomers.length === 0 ? (
                      <div className="proj-dropdown-empty">无匹配客户</div>
                    ) : (
                      filteredCustomers.map(c => (
                        <div key={c.id} className="proj-dropdown-item" onClick={() => { setAddCustomerId(c.id); setCustSearch('') }}>
                          <span className="proj-dropdown-name">{c.name}</span>
                          <span className="proj-dropdown-info">{c.community || '无小区'} · ¥{(c.dealAmount || 0).toLocaleString()}</span>
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>
            </div>

            <div style={{ display: 'flex', gap: 12, marginBottom: 12 }}>
              <div style={{ flex: 1 }}>
                <label>设计师 *</label>
                <select className="proj-input" value={addDesigner} onChange={e => setAddDesigner(e.target.value)}>
                  <option value="">-- 选择设计师 --</option>
                  {designers.map(d => <option key={d} value={d}>{d}</option>)}
                </select>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 12, marginBottom: 12 }}>
              <div style={{ flex: 1 }}>
                <label>签约起始时间 *</label>
                <input type="date" className="proj-input" value={addSignDate} onChange={e => setAddSignDate(e.target.value)} />
              </div>
              <div style={{ flex: 1 }}>
                <label>计划完成时间</label>
                <input type="date" className="proj-input" value={addPlanEndDate} onChange={e => setAddPlanEndDate(e.target.value)} />
              </div>
            </div>

            <div className="proj-modal-actions">
              <button className="btn btn-ghost" onClick={() => { setShowAdd(false); resetAdd() }}>取消</button>
              <button className="btn btn-primary" onClick={handleAdd}>确认创建</button>
            </div>
          </div>
        </div>
      )}

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
          mode="overview"
          onSave={(projectUpdate, customerUpdate) => {
            updateBuildProject(editingProject.id, projectUpdate)
            if (editingCustomer) updateCust(editingCustomer.id, customerUpdate)
            setEditingProjectId(null)
            toast.success('施工项目已保存')
          }}
          onClose={() => setEditingProjectId(null)}
        />
      )}
    </div>
  )
}
