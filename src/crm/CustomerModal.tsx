import { useState } from 'react'
import { X } from 'lucide-react'
import type { Note, Customer } from './types'
import { STAGES, SOURCES } from './constants'

export default function CustomerModal({ customer, notes, onSave, onDelete, onClose }: {
  customer: Partial<Customer>
  notes: Note[]
  onSave: (c: Partial<Customer> & { id?: string }) => void
  onDelete?: () => void
  onClose: () => void
}) {
  const [form, setForm] = useState({
    name: customer.name || '', phone: customer.phone || '', wechat: customer.wechat || '',
    source: customer.source || 'xiaohongshu', sourceNoteId: customer.sourceNoteId || '',
    stage: customer.stage || 'lead', houseType: customer.houseType || '',
    city: customer.city || '', style: customer.style || '',
    followUpDate: customer.followUpDate || '', followUpNote: customer.followUpNote || '',
    notes: customer.notes || '',
  })
  const h = (f: string, v: string) => setForm(p => ({ ...p, [f]: v }))

  return (
    <div className="crm-modal-overlay" onClick={onClose}>
      <div className="crm-modal" onClick={e => e.stopPropagation()}>
        <div className="crm-modal-header">
          <span className="crm-modal-title">{customer.id ? '编辑客户' : '添加客户'}</span>
          <button className="crm-modal-close" onClick={onClose}><X size={18} /></button>
        </div>
        <div className="crm-modal-body">
          <div className="crm-form-row">
            <div className="crm-form-group" style={{ flex: 2 }}>
              <label className="crm-form-label">姓名 *</label>
              <input className="crm-form-input" value={form.name} onChange={e => h('name', e.target.value)} placeholder="客户姓名/称呼" />
            </div>
            <div className="crm-form-group">
              <label className="crm-form-label">阶段</label>
              <select className="crm-form-input" value={form.stage} onChange={e => h('stage', e.target.value)}>
                {STAGES.map(s => <option key={s.id} value={s.id}>{s.icon} {s.label}</option>)}
              </select>
            </div>
          </div>
          <div className="crm-form-row">
            <div className="crm-form-group"><label className="crm-form-label">手机号</label><input className="crm-form-input" value={form.phone} onChange={e => h('phone', e.target.value)} /></div>
            <div className="crm-form-group"><label className="crm-form-label">微信号</label><input className="crm-form-input" value={form.wechat} onChange={e => h('wechat', e.target.value)} /></div>
          </div>
          <div className="crm-form-row">
            <div className="crm-form-group">
              <label className="crm-form-label">来源渠道</label>
              <select className="crm-form-input" value={form.source} onChange={e => h('source', e.target.value)}>
                {SOURCES.map(s => <option key={s.id} value={s.id}>{s.icon} {s.label}</option>)}
              </select>
            </div>
            {form.source === 'xiaohongshu' && (
              <div className="crm-form-group">
                <label className="crm-form-label">来源笔记</label>
                <select className="crm-form-input" value={form.sourceNoteId || ''} onChange={e => h('sourceNoteId', e.target.value)}>
                  <option value="">-- 选择 --</option>
                  {notes.map(n => <option key={n.id} value={n.id}>{n.title.slice(0, 20)}</option>)}
                </select>
              </div>
            )}
          </div>
          <div className="crm-form-row">
            <div className="crm-form-group"><label className="crm-form-label">户型</label><input className="crm-form-input" value={form.houseType} onChange={e => h('houseType', e.target.value)} /></div>
            <div className="crm-form-group"><label className="crm-form-label">城市</label><input className="crm-form-input" value={form.city} onChange={e => h('city', e.target.value)} /></div>
            <div className="crm-form-group"><label className="crm-form-label">风格</label>
              <select className="crm-form-input" value={form.style} onChange={e => h('style', e.target.value)}>
                <option value="">-- 选择 --</option>
                <option value="意式极简">意式极简</option><option value="法式风格">法式风格</option>
              </select>
            </div>
          </div>
          <div className="crm-form-row">
            <div className="crm-form-group"><label className="crm-form-label">下次跟进日期</label><input type="date" className="crm-form-input" value={form.followUpDate} onChange={e => h('followUpDate', e.target.value)} /></div>
            <div className="crm-form-group"><label className="crm-form-label">跟进备注</label><input className="crm-form-input" value={form.followUpNote} onChange={e => h('followUpNote', e.target.value)} placeholder="客户说了什么" /></div>
          </div>
          <div className="crm-form-group">
            <label className="crm-form-label">沟通记录</label>
            <textarea className="crm-form-textarea" value={form.notes} onChange={e => h('notes', e.target.value)} rows={3} />
          </div>
        </div>
        <div className="crm-modal-footer">
          {onDelete && <button className="crm-btn-ghost crm-btn-danger" onClick={onDelete}>删除</button>}
          <div style={{ flex: 1 }} />
          <button className="crm-btn-ghost" onClick={onClose}>取消</button>
          <button className="crm-btn-primary" onClick={() => { if (form.name.trim()) onSave({ id: customer.id, ...form }) }}>保存</button>
        </div>
      </div>
    </div>
  )
}
