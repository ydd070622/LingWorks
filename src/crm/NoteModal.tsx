import { useState } from 'react'
import { X } from 'lucide-react'
import type { Note } from './types'

export default function NoteModal({ note, onSave, onClose }: {
  note: Partial<Note>
  onSave: (n: Partial<Note> & { id?: string }) => void
  onClose: () => void
}) {
  const [form, setForm] = useState({
    title: note.title || '', publishDate: note.publishDate || '',
    status: note.status || 'draft',
  })
  const h = (f: string, v: string) => setForm(p => ({ ...p, [f]: v }))

  return (
    <div className="crm-modal-overlay" onClick={onClose}>
      <div className="crm-modal crm-modal-sm" onClick={e => e.stopPropagation()}>
        <div className="crm-modal-header">
          <span className="crm-modal-title">{note.id ? '编辑笔记' : '添加笔记'}</span>
          <button className="crm-modal-close" onClick={onClose}><X size={18} /></button>
        </div>
        <div className="crm-modal-body">
          <div className="crm-form-group">
            <label className="crm-form-label">标题 *</label>
            <input className="crm-form-input" value={form.title} onChange={e => h('title', e.target.value)} />
          </div>
          <div className="crm-form-row">
            <div className="crm-form-group">
              <label className="crm-form-label">状态</label>
              <select className="crm-form-input" value={form.status} onChange={e => h('status', e.target.value)}>
                <option value="published">已发布</option>
                <option value="draft">草稿</option>
              </select>
            </div>
            <div className="crm-form-group">
              <label className="crm-form-label">发布日期</label>
              <input type="date" className="crm-form-input" value={form.publishDate} onChange={e => h('publishDate', e.target.value)} />
            </div>
          </div>
        </div>
        <div className="crm-modal-footer">
          <button className="crm-btn-ghost" onClick={onClose}>取消</button>
          <button className="crm-btn-primary" onClick={() => { if (form.title.trim()) { try { onSave({ id: note.id, ...form }) } catch (e) { alert('保存失败: ' + String(e)) } } }}>保存</button>
        </div>
      </div>
    </div>
  )
}
