import { useState } from 'react'
import { Plus, Trash2, X, Pencil } from 'lucide-react'
import type { CustomModel } from '../types'

interface ApiSettingsProps {
  models: CustomModel[]
  onSave: (models: CustomModel[]) => void
  onClose: () => void
}

const emptyModel: CustomModel = { name: '', apiKey: '', endpoint: '', modelName: '' }

export default function ApiSettings({ models, onSave, onClose }: ApiSettingsProps) {
  const [list, setList] = useState<CustomModel[]>(() => JSON.parse(JSON.stringify(models)))
  const [editing, setEditing] = useState<CustomModel>({ ...emptyModel })
  const [editingIndex, setEditingIndex] = useState<number | null>(null)

  const startEdit = (m: CustomModel, i: number) => {
    setEditing({ ...m })
    setEditingIndex(i)
  }

  const cancelEdit = () => {
    setEditing({ ...emptyModel })
    setEditingIndex(null)
  }

  const addOrUpdate = () => {
    if (!editing.name.trim()) return
    if (editingIndex !== null) {
      const updated = [...list]
      updated[editingIndex] = { ...editing }
      setList(updated)
    } else {
      setList([...list, { ...editing }])
    }
    setEditing({ ...emptyModel })
    setEditingIndex(null)
  }

  const removeModel = (i: number) => {
    if (editingIndex === i) cancelEdit()
    setList(list.filter((_, idx) => idx !== i))
  }

  const handleSave = () => {
    onSave(list)
    onClose()
  }

  return (
    <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="modal-content">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h2>API 模型设置</h2>
          <button className="btn btn-ghost btn-sm" onClick={onClose}><X size={16} /></button>
        </div>

        <div className="glass-card" style={{ padding: 16, marginBottom: 16 }}>
          <div style={{ display: 'grid', gap: 10 }}>
            <div>
              <label className="label">名称</label>
              <input className="input-base" value={editing.name} onChange={e => setEditing({...editing, name: e.target.value})} placeholder="例: 我的模型" />
            </div>
            <div>
              <label className="label">API Key</label>
              <input className="input-base" type="password" value={editing.apiKey} onChange={e => setEditing({...editing, apiKey: e.target.value})} placeholder="sk-..." />
            </div>
            <div>
              <label className="label">接口地址</label>
              <input className="input-base" value={editing.endpoint} onChange={e => setEditing({...editing, endpoint: e.target.value})} placeholder="https://api.example.com" />
            </div>
            <div>
              <label className="label">模型名称</label>
              <input className="input-base" value={editing.modelName} onChange={e => setEditing({...editing, modelName: e.target.value})} placeholder="gpt-4o-image" />
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn btn-primary btn-sm" onClick={addOrUpdate} disabled={!editing.name.trim()}>
                {editingIndex !== null ? <><Pencil size={14} /> 更新</> : <><Plus size={14} /> 添加</>}
              </button>
              {editingIndex !== null && (
                <button className="btn btn-ghost btn-sm" onClick={cancelEdit}>取消</button>
              )}
            </div>
          </div>
        </div>

        {list.length === 0 ? (
          <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 20, fontSize: 13 }}>
            暂无自定义模型
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {list.map((m, i) => (
              <div key={i} className="glass-card" style={{ padding: '10px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                  <div style={{ fontWeight: 500, fontSize: 13 }}>{m.name}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{m.modelName} · {m.endpoint}</div>
                </div>
                <div style={{ display: 'flex', gap: 4 }}>
                  <button className="btn btn-ghost btn-sm" onClick={() => startEdit(m, i)}>
                    <Pencil size={14} />
                  </button>
                  <button className="btn btn-ghost btn-sm" onClick={() => removeModel(i)}>
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        <button className="btn btn-primary" style={{ marginTop: 16, width: '100%' }} onClick={handleSave}>
          保存设置 ({list.length})
        </button>
      </div>
    </div>
  )
}
