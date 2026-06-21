import { useState } from 'react'
import { toast } from 'sonner'
import { X } from 'lucide-react'
import type { Note, Customer, FollowUp } from './types'
import { STAGES, SOURCES } from './constants'
import { fmtDate } from './helpers'

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

  const history = customer.followUpHistory ?? []
  const reversedHistory = [...history].reverse()  // 倒序，最新在上

  const handleSave = () => {
    if (!form.name.trim()) return
    const upd: Partial<Customer> & { id?: string } = { id: customer.id, ...form }

    // 保存去重：编辑已有客户且跟进备注或沟通记录发生变化时，追加一条历史
    if (customer.id) {
      const fuChanged = form.followUpNote.trim() && form.followUpNote !== (customer.followUpNote || '')
      const notesChanged = form.notes.trim() && form.notes !== (customer.notes || '')
      if (fuChanged || notesChanged) {
        const todayStr = new Date().toISOString().split('T')[0]
        const content = fuChanged ? form.followUpNote : form.notes
        const newEntry: FollowUp = {
          id: 'fu_' + Date.now(),
          date: todayStr,
          content,
          nextDate: form.followUpDate || undefined,
        }
        upd.followUpHistory = [...history, newEntry]
      }
    }

    onSave(upd)
    toast.success(customer.id ? '客户信息已保存' : '已新增客户')
  }

  return (
    <div className="crm-modal-overlay" onClick={onClose}>
      <div className="crm-modal crm-modal-lg" onClick={e => e.stopPropagation()}>
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
            <div className="crm-form-group"><label className="crm-form-label">跟进备注 <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>(改动会记录到历史)</span></label><input className="crm-form-input" value={form.followUpNote} onChange={e => h('followUpNote', e.target.value)} placeholder="客户说了什么" /></div>
          </div>
          <div className="crm-form-group">
            <label className="crm-form-label">沟通记录</label>
            <textarea className="crm-form-textarea" value={form.notes} onChange={e => h('notes', e.target.value)} rows={3} />
          </div>

          {/* 跟进历史时间线 */}
          <div className="crm-section-title" style={{ marginTop: 8 }}>
            📋 跟进历史
            {history.length > 0 && <span className="crm-section-count">{history.length} 条</span>}
          </div>
          {history.length === 0 ? (
            <div className="crm-fu-history-empty">暂无跟进记录</div>
          ) : (
            <div className="crm-fu-history">
              {reversedHistory.map(fu => (
                <div key={fu.id} className="crm-fu-history-item">
                  <div className="crm-fu-history-dot" />
                  <div className="crm-fu-history-body">
                    <div className="crm-fu-history-date">{fmtDate(fu.date)}{fu.nextDate ? ` · 约定 ${fmtDate(fu.nextDate)} 跟进` : ''}</div>
                    <div className="crm-fu-history-content">{fu.content}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="crm-modal-footer">
          {onDelete && <button className="crm-btn-ghost crm-btn-danger" onClick={onDelete}>删除</button>}
          <div style={{ flex: 1 }} />
          <button className="crm-btn-ghost" onClick={onClose}>取消</button>
          <button className="crm-btn-primary" onClick={handleSave}>保存</button>
        </div>
      </div>
    </div>
  )
}
