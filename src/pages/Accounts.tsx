import { useState, useEffect, useCallback } from 'react'
import { Plus, Copy, Pencil, Trash2, X, Check, Eye, EyeOff } from 'lucide-react'
import type { Account } from '../types'

export default function Accounts() {
  const [accounts, setAccounts] = useState<Account[]>([])
  const [editing, setEditing] = useState<Account | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ name: '', username: '', password: '', note: '' })
  const [showPassword, setShowPassword] = useState<Record<string, boolean>>({})
  const [copied, setCopied] = useState<string | null>(null)

  useEffect(() => {
    const load = async () => {
      if (window.electronAPI) {
        const saved = await window.electronAPI.getStore('accounts')
        if (Array.isArray(saved)) setAccounts(saved)
      } else {
        const saved = localStorage.getItem('accounts')
        if (saved) {
          try { setAccounts(JSON.parse(saved)) } catch {}
        }
      }
    }
    load()
  }, [])

  const save = useCallback(async (list: Account[]) => {
    setAccounts(list)
    if (window.electronAPI) {
      await window.electronAPI.setStore('accounts', list)
    } else {
      localStorage.setItem('accounts', JSON.stringify(list))
    }
  }, [])

  const handleAdd = () => {
    setForm({ name: '', username: '', password: '', note: '' })
    setEditing(null)
    setShowForm(true)
  }

  const handleEdit = (acc: Account) => {
    setForm({ name: acc.name, username: acc.username, password: acc.password, note: acc.note || '' })
    setEditing(acc)
    setShowForm(true)
  }

  const handleDelete = (id: string) => {
    if (confirm('确定删除此账号？')) {
      save(accounts.filter(a => a.id !== id))
    }
  }

  const handleSave = () => {
    if (!form.name.trim() || !form.username.trim()) return
    if (editing) {
      save(accounts.map(a => a.id === editing.id ? { ...a, ...form } : a))
    } else {
      const newAcc: Account = { id: Date.now().toString(), ...form }
      save([...accounts, newAcc])
    }
    setShowForm(false)
    setEditing(null)
  }

  const copyToClipboard = async (text: string, key: string) => {
    await navigator.clipboard.writeText(text)
    setCopied(key)
    setTimeout(() => setCopied(null), 1500)
  }

  const toggleShowPassword = (id: string) => {
    setShowPassword(prev => ({ ...prev, [id]: !prev[id] }))
  }

  return (
    <div className="accounts-page">
      <div className="accounts-header">
        <span>共 {accounts.length} 个账号</span>
        <button className="btn-add" onClick={handleAdd}><Plus size={16} /> 添加账号</button>
      </div>

      <div className="accounts-grid">
        {accounts.map(acc => (
          <div key={acc.id} className="glass-card account-card" style={{ padding: 20, cursor: 'default', display: 'flex', flexDirection: 'column', gap: 10, border: '1px solid var(--border-color)' }}>
            <div className="account-card-header">
              <span className="account-card-name">{acc.name}</span>
              <div style={{ display: 'flex', gap: 2 }}>
                <button className="btn-icon" onClick={() => handleEdit(acc)} title="编辑"><Pencil size={13} /></button>
                <button className="btn-icon" onClick={() => handleDelete(acc.id)} title="删除"><Trash2 size={13} /></button>
              </div>
            </div>
            <div className="account-card-field">
              <span className="account-label">账号</span>
              <span className="account-value">{acc.username}</span>
              <button
                className={`btn-copy-icon ${copied === acc.id + '-user' ? 'copied' : ''}`}
                onClick={() => copyToClipboard(acc.username, acc.id + '-user')}
                title="复制"
              >
                {copied === acc.id + '-user' ? <Check size={13} /> : <Copy size={13} />}
              </button>
            </div>
            {acc.password ? (
              <div className="account-card-field">
                <span className="account-label">密码</span>
                <span className="account-value">
                  {showPassword[acc.id] ? acc.password : '••••••••'}
                </span>
                <button className="btn-copy-icon" onClick={() => toggleShowPassword(acc.id)} title={showPassword[acc.id] ? '隐藏' : '显示'}>
                  {showPassword[acc.id] ? <EyeOff size={13} /> : <Eye size={13} />}
                </button>
                <button
                  className={`btn-copy-icon ${copied === acc.id + '-pwd' ? 'copied' : ''}`}
                  onClick={() => copyToClipboard(acc.password, acc.id + '-pwd')}
                  title="复制"
                >
                  {copied === acc.id + '-pwd' ? <Check size={13} /> : <Copy size={13} />}
                </button>
              </div>
            ) : null}
            {acc.note && <div className="account-card-note">{acc.note}</div>}
          </div>
        ))}
        {accounts.length === 0 && (
          <div className="accounts-empty">暂无账号，点击上方按钮添加</div>
        )}
      </div>

      {showForm && (
        <div className="modal-overlay" onClick={() => setShowForm(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>{editing ? '编辑账号' : '添加账号'}</h3>
              <button onClick={() => setShowForm(false)}><X size={18} /></button>
            </div>
            <div className="modal-body">
              <label>名称 *</label>
              <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="如：ChatGPT" />
              <label>账号 *</label>
              <input value={form.username} onChange={e => setForm({ ...form, username: e.target.value })} placeholder="用户名/邮箱/手机号" />
               <label>密码</label>
              <input type="password" value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} placeholder="密码" />
              <label>备注</label>
              <input value={form.note} onChange={e => setForm({ ...form, note: e.target.value })} placeholder="选填" />
            </div>
            <div className="modal-footer">
              <button className="btn-cancel" onClick={() => setShowForm(false)}>取消</button>
              <button className="btn-save" onClick={handleSave}>保存</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
