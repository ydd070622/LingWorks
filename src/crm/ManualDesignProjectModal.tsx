import { useState } from 'react'
import { X } from 'lucide-react'
import { toast } from 'sonner'
import type { ManualDesignProjectInput } from './types'
import { today } from './helpers'

interface Props {
  designers: string[]
  onSave: (input: ManualDesignProjectInput) => void
  onClose: () => void
}

export default function ManualDesignProjectModal({ designers, onSave, onClose }: Props) {
  const [form, setForm] = useState<ManualDesignProjectInput>({
    projectName: '',
    name: '',
    phone: '',
    community: '',
    houseArea: '',
    designer: '',
    signDate: today(),
    planEndDate: '',
    detail: '',
    remark: '',
  })

  const update = (key: keyof ManualDesignProjectInput, value: string) => {
    setForm(prev => ({ ...prev, [key]: value }))
  }

  const handleSave = () => {
    if (!form.projectName.trim()) { toast.error('请填写项目名称'); return }
    if (!form.name.trim()) { toast.error('请填写业主名称'); return }
    if (!form.signDate) { toast.error('请选择签约起始时间'); return }
    onSave(form)
  }

  return (
    <div className="proj-modal-overlay">
      <div className="proj-modal" onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h3 style={{ margin: 0 }}>补录设计项目</h3>
          <button className="crm-modal-close" onClick={onClose}><X size={18} /></button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div>
            <label>项目名称 *</label>
            <input className="proj-input" value={form.projectName} onChange={e => update('projectName', e.target.value)} placeholder="如：翡翠湾花园方案" />
          </div>
          <div>
            <label>业主 *</label>
            <input className="proj-input" value={form.name} onChange={e => update('name', e.target.value)} placeholder="业主名称" />
          </div>
          <div>
            <label>联系电话</label>
            <input className="proj-input" value={form.phone} onChange={e => update('phone', e.target.value)} placeholder="手机号码" />
          </div>
          <div>
            <label>小区</label>
            <input className="proj-input" value={form.community} onChange={e => update('community', e.target.value)} placeholder="小区名称" />
          </div>
          <div>
            <label>面积</label>
            <input className="proj-input" value={form.houseArea} onChange={e => update('houseArea', e.target.value)} placeholder="如：128㎡" />
          </div>
          <div>
            <label>设计师</label>
            <select className="proj-input" value={form.designer} onChange={e => update('designer', e.target.value)}>
              <option value="">-- 选择设计师 --</option>
              {designers.map(d => <option key={d} value={d}>{d}</option>)}
            </select>
          </div>
          <div>
            <label>签约起始时间 *</label>
            <input type="date" className="proj-input" value={form.signDate} onChange={e => update('signDate', e.target.value)} />
          </div>
          <div>
            <label>计划完成时间</label>
            <input type="date" className="proj-input" value={form.planEndDate} onChange={e => update('planEndDate', e.target.value)} />
          </div>
        </div>

        <div style={{ marginTop: 12 }}>
          <label>项目详情</label>
          <textarea className="proj-input" rows={3} value={form.detail} onChange={e => update('detail', e.target.value)} placeholder="补充设计范围、当前状态等" />
        </div>
        <div style={{ marginTop: 12 }}>
          <label>备注</label>
          <textarea className="proj-input" rows={3} value={form.remark} onChange={e => update('remark', e.target.value)} placeholder="项目过程备注，会进入设计阶段备注历史" />
        </div>

        <div className="proj-modal-actions">
          <button className="btn btn-ghost" onClick={onClose}>取消</button>
          <button className="btn btn-primary" onClick={handleSave}>确认补录</button>
        </div>
      </div>
    </div>
  )
}
