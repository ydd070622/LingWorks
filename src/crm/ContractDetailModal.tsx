import { useState } from 'react'
import { toast } from 'sonner'
import { X, Check, Pencil, Trash2, Plus } from 'lucide-react'
import type { Customer, Payment } from './types'
import { CONTRACT_STATUS, defaultPaymentPlan } from './constants'
import { today } from './helpers'

export default function ContractDetailModal({ contract, onSave, onDelete, onArchive, onClose }: {
  contract: Customer
  onSave: (id: string, upd: Partial<Customer>) => void
  onDelete: () => void
  onArchive?: () => void
  onClose: () => void
}) {
  const [form, setForm] = useState({
    name: contract.name, projectId: contract.projectId || '',
    style: contract.style, dealAmount: contract.dealAmount?.toString() || '',
    notes: contract.notes || '', signDate: contract.signDate || '',
    contractStatus: contract.contractStatus || 'signed',
  })
  const [paymentPlan, setPaymentPlan] = useState<Payment[]>(contract.paymentPlan?.length ? [...contract.paymentPlan] : [])
  const [editingPayId, setEditingPayId] = useState<string | null>(null)
  const [editLabel, setEditLabel] = useState('')
  const [editAmount, setEditAmount] = useState('')
  const [newLabel, setNewLabel] = useState('')
  const [newAmount, setNewAmount] = useState('')
  const [newPaid, setNewPaid] = useState(false)

  const h = (f: string, v: string) => setForm(p => ({ ...p, [f]: v }))
  const dealAmount = parseInt(form.dealAmount) || 0
  const totalPaid = paymentPlan.filter(p => p.paid).reduce((s, p) => s + p.amount, 0)
  const remaining = dealAmount - totalPaid
  const ratio = dealAmount > 0 ? (totalPaid / dealAmount * 100) : 0
  const isOwed = ratio < 100 && form.contractStatus === 'done'

  const doSave = (overrides?: Partial<Customer>) => {
    if (!form.name.trim() || !form.dealAmount) return
    onSave(contract.id, {
      name: form.name, projectId: form.projectId || undefined,
      style: form.style, dealAmount,
      notes: form.notes, signDate: form.signDate || undefined,
      contractStatus: form.contractStatus,
      paymentPlan,
      ...overrides,
    })
    toast.success('合同已保存')
  }

  const markPaid = (p: Payment) => {
    setPaymentPlan(prev => prev.map(x => x.id === p.id ? { ...x, paid: true, date: today() } : x))
    toast.success(`已记录收款 ¥${p.amount.toLocaleString()} · ${p.label}`)
  }
  const unmarkPaid = (p: Payment) => {
    setPaymentPlan(prev => prev.map(x => x.id === p.id ? { ...x, paid: false, date: '' } : x))
    toast('已撤销「' + p.label + '」的收款')
  }
  const startEdit = (p: Payment) => {
    setEditingPayId(p.id); setEditLabel(p.label); setEditAmount(String(p.amount))
  }
  const saveEdit = () => {
    if (!editLabel.trim() || isNaN(parseInt(editAmount))) return
    setPaymentPlan(prev => prev.map(x => x.id === editingPayId ? { ...x, label: editLabel.trim(), amount: parseInt(editAmount) || 0 } : x))
    setEditingPayId(null)
    toast.success('回款计划已更新')
  }
  const deletePay = (id: string) => {
    if (!confirm('删除这一期回款计划？')) return
    setPaymentPlan(prev => prev.filter(x => x.id !== id))
    toast.success('已删除该期回款')
  }
  const addPay = () => {
    if (!newLabel.trim() || isNaN(parseInt(newAmount)) || parseInt(newAmount) <= 0) return
    const p: Payment = {
      id: 'p_man_' + Date.now(),
      label: newLabel.trim(), amount: parseInt(newAmount) || 0,
      paid: newPaid, date: newPaid ? today() : '',
    }
    setPaymentPlan(prev => [...prev, p])
    setNewLabel(''); setNewAmount(''); setNewPaid(false)
    toast.success(`已添加「${p.label}」¥${p.amount.toLocaleString()}`)
  }
  const applyTemplate = () => {
    if (!confirm('用标准分期模板（定金30%/进度款40%/尾款30%）覆盖当前回款计划？')) return
    setPaymentPlan(defaultPaymentPlan(dealAmount))
    toast.success('已应用标准分期模板')
  }

  const contractStatus = CONTRACT_STATUS.find(s => s.id === form.contractStatus)

  return (
    <div className="crm-modal-overlay" onClick={onClose}>
      <div className="crm-modal crm-modal-lg" onClick={e => e.stopPropagation()}>
        <div className="crm-modal-header">
          <span className="crm-modal-title">合同详情 · {contract.name}</span>
          <button className="crm-modal-close" onClick={onClose}><X size={18} /></button>
        </div>
        <div className="crm-modal-body">
          {/* 基本信息 */}
          <div className="crm-form-row">
            <div className="crm-form-group" style={{ flex: 2 }}>
              <label className="crm-form-label">客户姓名</label>
              <input className="crm-form-input" value={form.name} onChange={e => h('name', e.target.value)} />
            </div>
            <div className="crm-form-group">
              <label className="crm-form-label">合同编号</label>
              <input className="crm-form-input" value={form.projectId} onChange={e => h('projectId', e.target.value)} placeholder="如 P2026-001" />
            </div>
          </div>
          <div className="crm-form-row">
            <div className="crm-form-group">
              <label className="crm-form-label">归属账号</label>
              <select className="crm-form-input" value={form.style} onChange={e => h('style', e.target.value)}>
                <option value="">-- 选择 --</option>
                <option value="守一意式">守一意式</option>
                <option value="守中意式">守中意式</option>
                <option value="守中法式">守中法式</option>
              </select>
            </div>
            <div className="crm-form-group">
              <label className="crm-form-label">合同金额（元）*</label>
              <input type="number" className="crm-form-input" value={form.dealAmount} onChange={e => h('dealAmount', e.target.value)} />
            </div>
            <div className="crm-form-group">
              <label className="crm-form-label">签约日期</label>
              <input type="date" className="crm-form-input" value={form.signDate} onChange={e => h('signDate', e.target.value)} />
            </div>
          </div>

          {/* 合同状态 */}
          <div className="crm-section-title">
            合同状态
            {isOwed && <span className="crm-badge crm-badge-danger" style={{ marginLeft: 8, fontSize: 10 }}>⚠ 已完工但回款未清</span>}
          </div>
          <div className="crm-status-pills">
            {CONTRACT_STATUS.map(s => (
              <span
                key={s.id}
                className={`crm-status-pill ${form.contractStatus === s.id ? 'active' : ''} crm-pill-${s.color}`}
                onClick={() => h('contractStatus', s.id)}
              >
                {s.icon} {s.label}
              </span>
            ))}
          </div>

          {/* 回款概览 */}
          <div className="crm-section-title">回款概览</div>
          <div className="crm-pay-summary">
            <div className="crm-pay-summary-item">
              <div className="crm-pay-summary-label">合同总额</div>
              <div className="crm-pay-summary-value">¥{dealAmount.toLocaleString()}</div>
            </div>
            <div className="crm-pay-summary-item">
              <div className="crm-pay-summary-label">已收款</div>
              <div className="crm-pay-summary-value green">¥{totalPaid.toLocaleString()}</div>
            </div>
            <div className="crm-pay-summary-item">
              <div className="crm-pay-summary-label">待收款</div>
              <div className="crm-pay-summary-value" style={{ color: remaining > 0 ? 'var(--danger, #ef4444)' : undefined }}>¥{remaining.toLocaleString()}</div>
            </div>
            <div className="crm-pay-summary-item">
              <div className="crm-pay-summary-label">回款率</div>
              <div className="crm-pay-summary-value">{ratio.toFixed(0)}%</div>
            </div>
          </div>

          {/* 回款计划列表 */}
          <div className="crm-section-title">
            回款计划
            <span className="crm-section-count">{paymentPlan.filter(p => p.paid).length}/{paymentPlan.length} 期已收</span>
            <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
              <button className="crm-btn-ghost-xs" onClick={applyTemplate}>应用标准模板</button>
            </div>
          </div>
          <div className="crm-plan-list">
            {paymentPlan.length === 0 && (
              <div className="crm-empty" style={{ padding: 16, fontSize: 13 }}>暂无回款计划，点击下方添加或应用标准模板</div>
            )}
            {paymentPlan.map(p => {
              if (editingPayId === p.id) {
                return (
                  <div key={p.id} className={`crm-plan-item ${p.paid ? 'paid' : 'unpaid'}`}>
                    <div className="crm-plan-item-body">
                      <div className="crm-plan-item-row">
                        <input className="crm-form-input crm-form-input-sm" value={editLabel} onChange={e => setEditLabel(e.target.value)} placeholder="阶段名称" style={{ flex: 1 }} />
                        <input type="number" className="crm-form-input crm-form-input-sm" value={editAmount} onChange={e => setEditAmount(e.target.value)} placeholder="金额" style={{ width: 100 }} />
                      </div>
                      <div className="crm-plan-item-meta">编辑中 — 修改名称或金额后点「确定」</div>
                    </div>
                    <div className="crm-plan-item-actions">
                      <button className="crm-btn-ghost-xs crm-btn-primary-sm" onClick={saveEdit}>确定</button>
                      <button className="crm-btn-ghost-xs" onClick={() => setEditingPayId(null)}>取消</button>
                    </div>
                  </div>
                )
              }
              return (
                <div key={p.id} className={`crm-plan-item ${p.paid ? 'paid' : 'unpaid'}`}>
                  <div className="crm-plan-item-body">
                    <div className="crm-plan-item-row">
                      <span className="crm-plan-item-label">
                        {p.label}
                        {p.paid
                          ? <span className="crm-badge crm-badge-success" style={{ marginLeft: 6, fontSize: 10 }}>已收</span>
                          : <span className="crm-badge crm-badge-warn" style={{ marginLeft: 6, fontSize: 10 }}>待收</span>}
                      </span>
                      <span className={`crm-plan-item-amount ${p.paid ? 'paid' : 'unpaid'}`}>¥{p.amount.toLocaleString()}</span>
                    </div>
                    <div className="crm-plan-item-meta">
                      {p.paid ? `收款日期：${p.date ? p.date.replace(/-/g, '月').replace(/^(\d+)月/, (_, m) => `${parseInt(m)}月`).replace(/月(\d+)$/, '月$1日') : '—'}` : '待收款'}
                    </div>
                  </div>
                  <div className="crm-plan-item-actions">
                    {!p.paid
                      ? <button className="crm-btn-ghost-xs crm-btn-primary-sm" onClick={() => markPaid(p)}><Check size={11} /> 标记已收</button>
                      : <button className="crm-btn-ghost-xs" onClick={() => unmarkPaid(p)}>撤销</button>}
                    <button className="crm-btn-ghost-xs" onClick={() => startEdit(p)}><Pencil size={11} /></button>
                    <button className="crm-btn-ghost-xs crm-btn-danger-sm" onClick={() => deletePay(p.id)}><Trash2 size={11} /></button>
                  </div>
                </div>
              )
            })}
          </div>

          {/* 添加自定义期次 */}
          <div className="crm-plan-add">
            <input className="crm-form-input crm-form-input-sm" value={newLabel} onChange={e => setNewLabel(e.target.value)} placeholder="阶段名称" style={{ flex: 2 }} />
            <input type="number" className="crm-form-input crm-form-input-sm" value={newAmount} onChange={e => setNewAmount(e.target.value)} placeholder="金额" style={{ width: 90 }} />
            <select className="crm-form-input crm-form-input-sm" value={newPaid ? 'true' : 'false'} onChange={e => setNewPaid(e.target.value === 'true')} style={{ width: 90 }}>
              <option value="false">待收</option>
              <option value="true">已收</option>
            </select>
            <button className="crm-btn-ghost-xs crm-btn-primary-sm" onClick={addPay}><Plus size={11} /> 添加</button>
          </div>

          {/* 备注 */}
          <div className="crm-section-title">备注</div>
          <textarea className="crm-form-textarea" value={form.notes} onChange={e => h('notes', e.target.value)} rows={2} />
        </div>
        <div className="crm-modal-footer">
          {onArchive && <button className="crm-btn-ghost" style={{ color: 'var(--text-muted)' }} onClick={() => { if (confirm('归档后将移至「合同归档」，确定？')) onArchive() }}>归档</button>}
          {!onArchive && <button className="crm-btn-ghost crm-btn-danger" onClick={onDelete}>删除</button>}
          <div style={{ flex: 1 }} />
          <button className="crm-btn-ghost" onClick={onClose}>取消</button>
          <button className="crm-btn-primary" onClick={() => doSave()}>保存</button>
        </div>
      </div>
    </div>
  )
}
