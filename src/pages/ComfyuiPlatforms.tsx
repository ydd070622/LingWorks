import { useState, useEffect, useCallback } from 'react'
import { Plus, X, ExternalLink } from 'lucide-react'

interface ComfyuiPlatform {
  id: string
  name: string
  url: string
  color: string
  custom?: boolean
  iconData?: string
}

const defaultPlatforms: ComfyuiPlatform[] = [
  { id: 'duannao', name: '端脑云', url: 'https://cephalon.cloud/aigc', color: '#6366f1' },
  { id: 'zhisuan', name: '智算云扉', url: 'https://waas.aigate.cc/index', color: '#10b981' },
  { id: 'onethingai', name: 'OneThingAI', url: 'https://onethingai.com', color: '#f59e0b' },
]

const generateColor = () => {
  const colors = ['#6366f1','#ec4899','#f59e0b','#10b981','#3b82f6','#8b5cf6','#ef4444','#06b6d4','#84cc16','#f97316']
  return colors[Math.floor(Math.random() * colors.length)]
}

export default function ComfyuiPlatforms({ onNavigate }: { onNavigate?: (id: string) => void }) {
  const [platforms, setPlatforms] = useState<ComfyuiPlatform[]>([])
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState({ name: '', url: '', iconData: '' })
  const [manageMode, setManageMode] = useState(false)

  const loadPlatforms = useCallback(async () => {
    let list: ComfyuiPlatform[] = []
    try {
      const saved = localStorage.getItem('comfyuiPlatforms')
      if (saved) {
        const parsed = JSON.parse(saved)
        if (Array.isArray(parsed) && parsed.length > 0) list = parsed
      }
    } catch {}
    if (list.length === 0) list = JSON.parse(JSON.stringify(defaultPlatforms))
    setPlatforms(list)
  }, [])

  const savePlatforms = useCallback(async (list: ComfyuiPlatform[]) => {
    setPlatforms(list)
    localStorage.setItem('comfyuiPlatforms', JSON.stringify(list))
  }, [])

  useEffect(() => { loadPlatforms() }, [loadPlatforms])

  const openAddForm = () => {
    setForm({ name: '', url: '', iconData: '' })
    setEditingId(null)
    setShowForm(true)
  }

  const openEditForm = (p: ComfyuiPlatform) => {
    setForm({ name: p.name, url: p.url, iconData: p.iconData || '' })
    setEditingId(p.id)
    setShowForm(true)
  }

  const handleSave = async () => {
    if (!form.name.trim() || !form.url.trim()) return
    if (editingId) {
      const list = platforms.map(p => p.id === editingId ? { ...p, name: form.name.trim(), url: form.url.trim(), iconData: form.iconData } : p)
      await savePlatforms(list)
    } else {
      const newP: ComfyuiPlatform = {
        id: 'comfyui-' + Date.now(),
        name: form.name.trim(),
        url: form.url.trim(),
        color: generateColor(),
        custom: true,
        iconData: form.iconData,
      }
      await savePlatforms([...platforms, newP])
    }
    setShowForm(false)
  }

  const handleDelete = async (id: string) => {
    const p = platforms.find(x => x.id === id)
    if (!confirm('确定删除"' + (p?.name || '') + '"?',)) return
    const list = platforms.filter(x => x.id !== id)
    await savePlatforms(list)
  }

  const handleReset = async () => {
    if (!confirm('确定恢复为默认平台列表？自定义的平台将被删除。')) return
    const list = JSON.parse(JSON.stringify(defaultPlatforms))
    await savePlatforms(list)
  }

  const handleIconUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => setForm(prev => ({ ...prev, iconData: reader.result as string }))
    reader.readAsDataURL(file)
  }

  return (
    <div style={{ padding: '24px 32px', height: '100%', overflow: 'auto' }}>
      <div style={{ marginBottom: 16, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 4, marginTop: 0 }}>Comfyui 云端</h2>
          <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0 }}>点击卡片打开，管理模式下可增删改</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={() => setManageMode(!manageMode)}
            style={{ padding: '6px 14px', borderRadius: 8, border: '1px solid var(--border-color)', background: manageMode ? 'var(--accent)' : 'transparent', color: manageMode ? '#fff' : 'var(--text-secondary)', cursor: 'pointer', fontSize: 13, fontWeight: 500 }}
          >{manageMode ? '完成' : '管理'}</button>
          {manageMode && <button onClick={handleReset} style={{ padding: '6px 14px', borderRadius: 8, border: '1px solid var(--border-color)', background: 'transparent', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: 13 }}>恢复默认</button>}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 12 }}>
        {platforms.map(platform => {
          const iconSrc = platform.iconData || ('./favicons/' + platform.id + '.png')
          return (
            <div
              key={platform.id}
              className="glass-card"
              onClick={() => manageMode ? openEditForm(platform) : onNavigate?.(platform.id)}
              style={{ padding: 20, cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, transition: 'all 0.15s', border: '1px solid transparent', position: 'relative' }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = platform.color; e.currentTarget.style.transform = 'translateY(-2px)' }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = 'transparent'; e.currentTarget.style.transform = 'none' }}
            >
              {manageMode && (
                <div
                  onClick={e => { e.stopPropagation(); handleDelete(platform.id) }}
                  style={{ position: 'absolute', top: 4, right: 4, width: 22, height: 22, borderRadius: 4, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', cursor: 'pointer', zIndex: 2 }}
                  onMouseEnter={e => { e.currentTarget.style.color = '#ef4444'; e.currentTarget.style.background = 'var(--bg-card-hover)' }}
                  onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-muted)'; e.currentTarget.style.background = 'transparent' }}
                ><X size={13} /></div>
              )}
              <div style={{ width: 100, height: 100, borderRadius: 20, background: platform.color + '22', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid ' + platform.color + '44' }}>
                <img
                  src={iconSrc}
                  alt={platform.name}
                  style={{ width: 70, height: 70, borderRadius: 8, objectFit: 'contain' }}
                  onError={e => {
                    (e.target as HTMLElement).style.display = 'none'
                    const parent = (e.target as HTMLElement).parentElement
                    if (parent) {
                      const span = document.createElement('span')
                      span.textContent = platform.name.charAt(0)
                      span.style.cssText = 'font-size: 40px; font-weight: 700; color: ' + platform.color
                      parent.appendChild(span)
                    }
                  }}
                />
              </div>
              <div style={{ textAlign: 'center', display: 'flex', alignItems: 'center', gap: 4 }}>
                <div style={{ fontSize: 14, fontWeight: 600 }}>{platform.name}</div>
                {!manageMode && <ExternalLink size={12} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />}
              </div>
            </div>
          )
        })}
        <div
          className="glass-card"
          onClick={openAddForm}
          style={{ padding: 20, cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 6, transition: 'all 0.15s', border: '1px dashed var(--border-color)', opacity: 0.5 }}
          onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--accent)'; e.currentTarget.style.opacity = '1' }}
          onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border-color)'; e.currentTarget.style.opacity = '0.5' }}
        >
          <Plus size={24} style={{ color: 'var(--text-muted)' }} />
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>添加平台</span>
        </div>
      </div>

      {showForm && (
        <div className="modal-overlay" onClick={() => setShowForm(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>{editingId ? '编辑平台' : '添加平台'}</h3>
              <button onClick={() => setShowForm(false)}>×</button>
            </div>
            <div className="modal-body">
              <label>名称 *</label>
              <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="平台名称" autoFocus />
              <label>网址 *</label>
              <input value={form.url} onChange={e => setForm({ ...form, url: e.target.value })} placeholder="https://..." />
              <label>Logo 图标（可选）</label>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <input type="file" accept="image/*" onChange={handleIconUpload} style={{ fontSize: 12 }} />
                {form.iconData && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <img src={form.iconData} alt="preview" style={{ width: 28, height: 28, borderRadius: 6, objectFit: 'cover' }} />
                    <span style={{ fontSize: 11, color: 'var(--text-muted)', cursor: 'pointer' }} onClick={() => setForm({ ...form, iconData: '' })}>× 移除</span>
                  </div>
                )}
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn-cancel" onClick={() => setShowForm(false)}>取消</button>
              <button className="btn-save" onClick={handleSave}>保存</button>
            </div>
          </div>
        </div>
      )}

      {platforms.length === 0 && (
        <div style={{ textAlign: 'center', padding: 60, color: 'var(--text-muted)' }}>
          <p>暂无平台，点击下方 + 添加</p>
        </div>
      )}
    </div>
  )
}
