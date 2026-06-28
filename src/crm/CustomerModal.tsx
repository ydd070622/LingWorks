import { useState } from 'react'
import { toast } from 'sonner'
import { X } from 'lucide-react'
import type { Customer, FollowUp } from './types'
import { STYLES, ACCOUNTS } from './constants'
import { fmtDate, today } from './helpers'

export default function CustomerModal({ customer, onSave, onDelete, onClose }: {
  customer: Partial<Customer>
  onSave: (c: Partial<Customer> & { id?: string }) => void
  onDelete?: () => void
  onClose: () => void
}) {
  const [form, setForm] = useState({
    recordDate: customer.recordDate || today(),
    name: customer.name || '',
    city: customer.city || '',
    community: customer.community || '',
    houseArea: customer.houseArea || '',
    stylePreference: customer.stylePreference || '',
    style: customer.style || '',
    followUpDate: customer.followUpDate || '',
    followUpNote: customer.followUpNote || '',
  })
  const h = (f: string, v: string) => setForm(p => ({ ...p, [f]: v }))

  const history = customer.followUpHistory ?? []
  const reversedHistory = [...history].reverse()

  const handleSave = () => {
    if (!form.name.trim()) return
    const upd: Partial<Customer> & { id?: string } = {
      id: customer.id,
      ...form,
      // 新客户默认归属待选，已有客户保留原归属
      ...(customer.id ? {} : { stage: 'wechat' as const }),
    }

    // 跟进备注有变化时——记录新的跟进内容到历史
    if (customer.id) {
      const oldNote = customer.followUpNote || ''
      const fuChanged = form.followUpNote.trim() && form.followUpNote !== oldNote
      if (fuChanged) {
        const newEntry: FollowUp = {
          id: 'fu_' + Date.now(),
          date: today(),
          content: form.followUpNote.trim(),  // 记录新内容
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

          {/* Row 1: 日期 + 业主姓名 */}
          <div className="crm-form-row">
            <div className="crm-form-group" style={{ maxWidth: 140 }}>
              <label className="crm-form-label">日期</label>
              <input type="date" className="crm-form-input" value={form.recordDate} onChange={e => h('recordDate', e.target.value)} />
            </div>
            <div className="crm-form-group" style={{ flex: 1 }}>
              <label className="crm-form-label">业主姓名 *</label>
              <input className="crm-form-input" value={form.name} onChange={e => h('name', e.target.value)} placeholder="输入客户姓名" />
            </div>
          </div>

          {/* Row 2: 地区 + 喜欢风格 */}
          <div className="crm-form-row">
            <div className="crm-form-group">
              <label className="crm-form-label">地区</label>
              <input className="crm-form-input" value={form.city} onChange={e => h('city', e.target.value)} placeholder="如：深圳、广州" />
            </div>
            <div className="crm-form-group">
              <label className="crm-form-label">喜欢风格</label>
              <select className="crm-form-input" value={form.stylePreference} onChange={e => h('stylePreference', e.target.value)}>
                <option value="">-- 选择 --</option>
                {STYLES.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
              </select>
            </div>
          </div>

          {/* Row 2.5: 小区名称 + 房子面积 */}
          <div className="crm-form-row">
            <div className="crm-form-group">
              <label className="crm-form-label">小区名称</label>
              <input className="crm-form-input" value={form.community} onChange={e => h('community', e.target.value)} placeholder="如：万科城、碧桂园" />
            </div>
            <div className="crm-form-group">
              <label className="crm-form-label">房子面积</label>
              <input className="crm-form-input" value={form.houseArea} onChange={e => h('houseArea', e.target.value)} placeholder="如：120㎡" />
            </div>
          </div>

          {/* Row 3: 客户归属 + 下次跟进日期 */}
          <div className="crm-form-row">
            <div className="crm-form-group">
              <label className="crm-form-label">客户归属</label>
              <select className="crm-form-input" value={form.style} onChange={e => h('style', e.target.value)}>
                <option value="">-- 选择 --</option>
                {ACCOUNTS.map(a => <option key={a.id} value={a.id}>{a.label}</option>)}
              </select>
            </div>
            <div className="crm-form-group">
              <label className="crm-form-label">下次跟进日期</label>
              <input type="date" className="crm-form-input" value={form.followUpDate} onChange={e => h('followUpDate', e.target.value)} />
            </div>
          </div>

          {/* Divider + 跟进情况 */}
          <div className="crm-section-title" style={{ marginTop: 4 }}>
            跟进情况
            {history.length > 0 && <span className="crm-section-count">{history.length} 条</span>}
          </div>
          <div className="crm-form-group">
            <textarea
              className="crm-form-textarea"
              value={form.followUpNote}
              onChange={e => h('followUpNote', e.target.value)}
              rows={5}
              placeholder="记录本次沟通内容、客户反馈、后续计划等..."
            />
          </div>

          {/* 跟进历史时间线 */}
          {history.length > 0 && (
            <div className="crm-fu-history" style={{ marginTop: 0 }}>
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
          <button className="crm-btn-primary" onClick={handleSave}>保存客户</button>
        </div>
      </div>
    </div>
  )
}
