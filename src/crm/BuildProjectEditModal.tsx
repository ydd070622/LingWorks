import { useState } from 'react'
import { X } from 'lucide-react'
import { toast } from 'sonner'
import type { BuildProject, Customer } from './types'

interface Props {
  project: BuildProject
  customer?: Customer
  designers: string[]
  mode: 'overview' | 'progress'
  onSave: (projectUpdate: Partial<BuildProject>, customerUpdate: Partial<Customer>) => void
  onClose: () => void
}

export default function BuildProjectEditModal({ project, customer, designers, mode, onSave, onClose }: Props) {
  const [projectName, setProjectName] = useState(project.projectName || '')
  const [ownerName, setOwnerName] = useState(customer?.name || '')
  const [phone, setPhone] = useState(customer?.phone || '')
  const [community, setCommunity] = useState(customer?.community || '')
  const [houseArea, setHouseArea] = useState(customer?.houseArea || '')
  const [designer, setDesigner] = useState(project.designer || '')
  const [signDate, setSignDate] = useState(project.signDate || '')
  const [planEndDate, setPlanEndDate] = useState(project.planEndDate || '')
  const [progress, setProgress] = useState(project.progress || '')
  const [detail, setDetail] = useState(project.detail || '')
  const [thisWeekWork, setThisWeekWork] = useState(project.thisWeekWork || '')
  const [thisWeekMaterials, setThisWeekMaterials] = useState(project.thisWeekMaterials || '')
  const [thisWeekIssues, setThisWeekIssues] = useState(project.thisWeekIssues || '')
  const [nextWeekPlan, setNextWeekPlan] = useState(project.nextWeekPlan || '')
  const [remark, setRemark] = useState(project.remark || '')

  const save = () => {
    if (!projectName.trim()) { toast.error('请填写项目名称'); return }
    if (!ownerName.trim()) { toast.error('请填写业主名称'); return }
    if (!signDate) { toast.error('请选择签约起始时间'); return }
    onSave(
      {
        projectName: projectName.trim(),
        designer: designer.trim(),
        signDate,
        planEndDate,
        progress: progress.trim(),
        detail: detail.trim(),
        thisWeekWork: thisWeekWork.trim(),
        thisWeekMaterials: thisWeekMaterials.trim(),
        thisWeekIssues: thisWeekIssues.trim(),
        nextWeekPlan: nextWeekPlan.trim(),
        remark: remark.trim(),
      },
      {
        name: ownerName.trim(),
        phone: phone.trim(),
        community: community.trim(),
        houseArea: houseArea.trim(),
      }
    )
  }

  return (
    <div className="proj-modal-overlay">
      <div className="proj-modal" onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h3 style={{ margin: 0 }}>{mode === 'overview' ? '编辑施工项目' : '编辑施工进度'}</h3>
          <button className="crm-modal-close" onClick={onClose}><X size={18} /></button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div>
            <label>项目名称 *</label>
            <input className="proj-input" value={projectName} onChange={e => setProjectName(e.target.value)} />
          </div>
          <div>
            <label>业主 *</label>
            <input className="proj-input" value={ownerName} onChange={e => setOwnerName(e.target.value)} />
          </div>
          <div>
            <label>联系电话</label>
            <input className="proj-input" value={phone} onChange={e => setPhone(e.target.value)} />
          </div>
          <div>
            <label>小区</label>
            <input className="proj-input" value={community} onChange={e => setCommunity(e.target.value)} />
          </div>
          <div>
            <label>面积</label>
            <input className="proj-input" value={houseArea} onChange={e => setHouseArea(e.target.value)} />
          </div>
          <div>
            <label>设计师</label>
            <select className="proj-input" value={designer} onChange={e => setDesigner(e.target.value)}>
              <option value="">-- 选择设计师 --</option>
              {designers.map(d => <option key={d} value={d}>{d}</option>)}
            </select>
          </div>
          <div>
            <label>签约起始时间 *</label>
            <input type="date" className="proj-input" value={signDate} onChange={e => setSignDate(e.target.value)} />
          </div>
          <div>
            <label>计划完成时间</label>
            <input type="date" className="proj-input" value={planEndDate} onChange={e => setPlanEndDate(e.target.value)} />
          </div>
        </div>

        {mode === 'overview' ? (
          <>
            <div style={{ marginTop: 12 }}>
              <label>进度</label>
              <input className="proj-input" value={progress} onChange={e => setProgress(e.target.value)} />
            </div>
            <div style={{ marginTop: 12 }}>
              <label>项目详情</label>
              <textarea className="proj-input" rows={4} value={detail} onChange={e => setDetail(e.target.value)} />
            </div>
          </>
        ) : (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 12 }}>
              <div>
                <label>本周施工内容</label>
                <textarea className="proj-input" rows={3} value={thisWeekWork} onChange={e => setThisWeekWork(e.target.value)} />
              </div>
              <div>
                <label>本周主材进场</label>
                <textarea className="proj-input" rows={3} value={thisWeekMaterials} onChange={e => setThisWeekMaterials(e.target.value)} />
              </div>
              <div>
                <label>本周遗留问题</label>
                <textarea className="proj-input" rows={3} value={thisWeekIssues} onChange={e => setThisWeekIssues(e.target.value)} />
              </div>
              <div>
                <label>下周计划施工内容</label>
                <textarea className="proj-input" rows={3} value={nextWeekPlan} onChange={e => setNextWeekPlan(e.target.value)} />
              </div>
            </div>
            <div style={{ marginTop: 12 }}>
              <label>备注</label>
              <textarea className="proj-input" rows={3} value={remark} onChange={e => setRemark(e.target.value)} />
            </div>
          </>
        )}

        <div className="proj-modal-actions">
          <button className="btn btn-ghost" onClick={onClose}>取消</button>
          <button className="btn btn-primary" onClick={save}>保存</button>
        </div>
      </div>
    </div>
  )
}
