import { useState, useEffect } from 'react'
import { X, Search } from 'lucide-react'
import type { Customer } from './types'
import { defaultPaymentPlan } from './constants'
import { today } from './helpers'

export default function ContractModal({ customers, prefillId, onSaveNew, onUpdateExisting, onClose }: {
  customers: Customer[]
  prefillId?: string | null
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

  // Search + dropdown state
  const [search, setSearch] = useState('')
  const [showDropdown, setShowDropdown] = useState(false)
  const [pickingCustomer, setPickingCustomer] = useState(!prefillId)

  // Auto-select prefill customer
  useEffect(() => {
    if (prefillId) {
      const c = customers.find(x => x.id === prefillId)
      if (c) {
        h('linkMode', 'existing')
        h('linkedId', c.id)
        h('name', c.name)
        h('style', c.style)
        setPickingCustomer(false)
      }
    }
  }, [prefillId])

  const selectedCust = customers.find(c => c.id === form.linkedId)

  const shouldShowDropdown = pickingCustomer && showDropdown

  const filteredCustomers = search.trim()
    ? customers.filter(c =>
        c.name.toLowerCase().includes(search.toLowerCase()) ||
        (c.phone || '').includes(search) ||
        (c.community || '').toLowerCase().includes(search.toLowerCase())
      )
    : customers

  const selectCustomer = (c: Customer) => {
    h('linkMode', 'existing')
    h('linkedId', c.id)
    h('name', c.name)
    h('style', c.style)
    setSearch('')
    setShowDropdown(false)
    setPickingCustomer(false)
  }

  const selectNewCustomer = () => {
    h('linkMode', 'new')
    h('linkedId', '')
    h('name', '')
    h('style', '')
    setSearch('')
    setShowDropdown(false)
    setPickingCustomer(false)
  }

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
            {selectedCust && !pickingCustomer ? (
              <div className="crm-linked-customer">
                <div>
                  <div className="crm-linked-customer-name">{selectedCust.name}</div>
                  <div className="crm-linked-customer-meta">{selectedCust.phone || '无电话'} · {selectedCust.community || '无小区'}</div>
                </div>
                <button className="crm-btn-ghost-xs" onClick={() => { setPickingCustomer(true); setSearch(''); setShowDropdown(true) }}>重选</button>
              </div>
            ) : (
              <div className="proj-search-wrap">
                <Search size={14} className="proj-search-icon" />
                <input className="proj-search-input" placeholder="搜索客户姓名/电话/小区..."
                  value={search}
                  onChange={e => {
                    setSearch(e.target.value)
                    if (form.linkMode === 'existing' && form.linkedId) {
                      h('linkedId', ''); h('name', ''); h('style', '')
                    }
                    setShowDropdown(true)
                  }}
                  onFocus={() => setShowDropdown(true)}
                  onBlur={() => setTimeout(() => setShowDropdown(false), 150)}
                  autoComplete="off"
                />
                {shouldShowDropdown && (
                  <div className="proj-dropdown">
                    {filteredCustomers.length === 0 ? (
                      <div className="proj-dropdown-empty">无匹配客户</div>
                    ) : (
                      filteredCustomers.map(c => (
                        <div key={c.id} className="proj-dropdown-item" onClick={() => selectCustomer(c)}>
                          <span className="proj-dropdown-name">{c.name}</span>
                          <span className="proj-dropdown-info">{c.phone || '无电话'} · {c.community || '无小区'}</span>
                        </div>
                      ))
                    )}
                    <div className="proj-dropdown-item" style={{ borderTop: '1px solid var(--border)', color: 'var(--accent)' }}
                      onClick={selectNewCustomer}>
                      <span className="proj-dropdown-name">+ 新建客户</span>
                      <span className="proj-dropdown-info">创建一个新客户并关联合同</span>
                    </div>
                  </div>
                )}
              </div>
            )}
            {form.linkMode === 'new' && (
              <input className="crm-form-input" style={{ marginTop: 8 }} value={form.name}
                onChange={e => h('name', e.target.value)} placeholder="输入新客户姓名" />
            )}
          </div>
          <div className="crm-form-row">
            <div className="crm-form-group">
              <label className="crm-form-label">合同编号</label>
              <input className="crm-form-input" value={form.projectId} onChange={e => h('projectId', e.target.value)} placeholder="如 P2026-001" autoFocus={!!prefillId} />
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
