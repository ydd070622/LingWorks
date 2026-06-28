import { useState } from 'react'
import { X } from 'lucide-react'
import type { Customer } from './types'
import { STAGES, defaultPaymentPlan } from './constants'
import { today } from './helpers'

export default function ContractModal({ customers, onSaveNew, onUpdateExisting, onClose }: {
  customers: Customer[]
  onSaveNew: (c: Partial<Customer>) => void
  onUpdateExisting: (id: string, upd: Partial<Customer>) => void
  onClose: () => void
}) {
  const [form, setForm] = useState({
    name: '', projectId: '', style: '', dealAmount: '', notes: '',
    linkMode: 'existing' as 'existing' | 'new',
    linkedId: '',
  })
  const h = (f: string, v: string) => setForm(p => ({ ...p, [f]: v }))

  const selectedCust = customers.find(c => c.id === form.linkedId)

  return (
    <div className="crm-modal-overlay">
      <div className="crm-modal crm-modal-sm" onClick={e => e.stopPropagation()}>
        <div className="crm-modal-header">
          <span className="crm-modal-title">新增合同</span>
          <button className="crm-modal-close" onClick={onClose}><X size={18} /></button>
        </div>
        <div className="crm-modal-body">
          <div className="crm-form-group">
            <label className="crm-form-label">关联客户 *</label>
            <select className="crm-form-input" value={form.linkMode === 'existing' ? form.linkedId : '__new__'}
              onChange={e => {
                const v = e.target.value
                if (v === '__new__') {
                  h('linkMode', 'new'); h('linkedId', ''); h('name', ''); h('style', '')
                } else {
                  h('linkMode', 'existing'); h('linkedId', v)
                  const c = customers.find(x => x.id === v)
                  if (c) { h('name', c.name); h('style', c.style) }
                }
              }}>
              <option value="">-- 选择已有客户 --</option>
              {customers.map(c => (
                <option key={c.id} value={c.id}>{c.name} · {c.phone} · {STAGES.find(s => s.id === c.stage)?.label || c.stage}</option>
              ))}
              <option value="__new__">+ 新建客户</option>
            </select>
            {form.linkMode === 'new' && (
              <input className="crm-form-input" style={{ marginTop: 8 }} value={form.name}
                onChange={e => h('name', e.target.value)} placeholder="输入新客户姓名" />
            )}
          </div>
          <div className="crm-form-row">
            <div className="crm-form-group">
              <label className="crm-form-label">合同编号</label>
              <input className="crm-form-input" value={form.projectId} onChange={e => h('projectId', e.target.value)} placeholder="如 P2026-001" />
            </div>
            <div className="crm-form-group">
              <label className="crm-form-label">归属账号</label>
              <select className="crm-form-input" value={form.style} onChange={e => h('style', e.target.value)}>
                <option value="">-- 选择 --</option>
                <option value="守一意式">守一意式</option>
                <option value="守中意式">守中意式</option>
                <option value="守中法式">守中法式</option>
              </select>
            </div>
          </div>
          {selectedCust && (
            <div className="crm-cust-link-info">
              关联客户：{selectedCust.name} · {selectedCust.phone} · {selectedCust.houseType || '未填户型'} · {selectedCust.city || '未填城市'} — 将更新此客户为已成交状态
            </div>
          )}
          <div className="crm-form-row">
            <div className="crm-form-group">
              <label className="crm-form-label">合同金额（元）*</label>
              <input type="number" className="crm-form-input" value={form.dealAmount} onChange={e => h('dealAmount', e.target.value)} placeholder="如 28000" />
            </div>
          </div>
          <div className="crm-form-group">
            <label className="crm-form-label">备注</label>
            <textarea className="crm-form-textarea" value={form.notes} onChange={e => h('notes', e.target.value)} rows={2} />
          </div>
        </div>
        <div className="crm-modal-footer">
          <button className="crm-btn-ghost" onClick={onClose}>取消</button>
          <button className="crm-btn-primary" onClick={() => {
            if (!form.name.trim() || !form.dealAmount) return
            const dealAmount = parseInt(form.dealAmount) || 0
            if (form.linkMode === 'existing' && form.linkedId) {
              // 更新已有客户，不创建重复记录
              onUpdateExisting(form.linkedId, {
                stage: 'closed',
                dealAmount,
                projectId: form.projectId || undefined,
                style: form.style || selectedCust?.style || '',
                notes: form.notes,
                contractStatus: 'signed',
                signDate: today(),
                paymentPlan: defaultPaymentPlan(dealAmount),
              })
            } else {
              // 新建客户 + 合同
              onSaveNew({
                name: form.name,
                phone: selectedCust?.phone || '', wechat: selectedCust?.wechat || '',
                houseType: selectedCust?.houseType || '', city: selectedCust?.city || '',
                stage: 'closed',
                style: form.style || selectedCust?.style || '',
                dealAmount, notes: form.notes,
                followUpDate: '', followUpNote: '', projectId: form.projectId || undefined,
                contractStatus: 'signed',
                signDate: today(),
                paymentPlan: defaultPaymentPlan(dealAmount),
              })
            }
          }}>保存合同</button>
        </div>
      </div>
    </div>
  )
}
