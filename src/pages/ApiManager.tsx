import { useState, useEffect, useCallback } from 'react'
import { ArrowLeft, Check, X } from 'lucide-react'

interface ProviderConfig {
  id: string
  name: string
  icon: string
  color: string
  apiKey: string
  endpoint: string
  models: ProviderModel[]
  enabled: boolean
}

interface ProviderModel {
  id: string
  name: string
  type: 'chat' | 'image' | 'audio'
  desc: string
  enabled: boolean
}

const DEFAULT_PROVIDERS: ProviderConfig[] = [
  {
    id: 'deepseek', name: 'DeepSeek', icon: '🔵', color: '#4f46e5',
    apiKey: '', endpoint: 'https://api.deepseek.com/v1', enabled: false,
    models: [
      { id: 'deepseek-chat', name: 'deepseek-chat', type: 'chat', desc: '通用对话，128K 上下文', enabled: true },
      { id: 'deepseek-reasoner', name: 'deepseek-reasoner', type: 'chat', desc: '深度推理，CoT 思维链', enabled: true },
    ],
  },
  {
    id: 'openai', name: 'OpenAI', icon: '🟢', color: '#10a37f',
    apiKey: '', endpoint: 'https://api.openai.com/v1', enabled: false,
    models: [
      { id: 'gpt-4o', name: 'gpt-4o', type: 'chat', desc: '多模态旗舰模型', enabled: true },
      { id: 'gpt-4-turbo', name: 'gpt-4-turbo', type: 'chat', desc: '128K 上下文', enabled: true },
      { id: 'dall-e-3', name: 'dall-e-3', type: 'image', desc: 'AI 图像生成', enabled: false },
      { id: 'gpt-4o-mini', name: 'gpt-4o-mini', type: 'chat', desc: '轻量快速模型', enabled: false },
    ],
  },
  {
    id: 'claude', name: 'Anthropic Claude', icon: '🟠', color: '#d97706',
    apiKey: '', endpoint: 'https://api.anthropic.com/v1', enabled: false,
    models: [
      { id: 'claude-3.5-sonnet', name: 'claude-3.5-sonnet', type: 'chat', desc: '最佳性价比', enabled: true },
      { id: 'claude-3-opus', name: 'claude-3-opus', type: 'chat', desc: '最强推理能力', enabled: true },
      { id: 'claude-3-haiku', name: 'claude-3-haiku', type: 'chat', desc: '最快响应速度', enabled: false },
    ],
  },
  {
    id: 'google', name: 'Google Gemini', icon: '🔴', color: '#4285f4',
    apiKey: '', endpoint: 'https://generativelanguage.googleapis.com/v1beta', enabled: false,
    models: [
      { id: 'gemini-1.5-pro', name: 'gemini-1.5-pro', type: 'chat', desc: '旗舰模型', enabled: true },
      { id: 'gemini-1.5-flash', name: 'gemini-1.5-flash', type: 'chat', desc: '快速响应', enabled: true },
    ],
  },
  {
    id: 'openrouter', name: 'OpenRouter', icon: '🟣', color: '#8b5cf6',
    apiKey: '', endpoint: 'https://openrouter.ai/api/v1', enabled: false,
    models: [
      { id: 'openai/gpt-4o', name: 'openai/gpt-4o', type: 'chat', desc: 'GPT-4o via OpenRouter', enabled: true },
      { id: 'anthropic/claude-3.5-sonnet', name: 'claude-3.5-sonnet', type: 'chat', desc: 'Claude via OpenRouter', enabled: true },
    ],
  },
]

const STORE_KEY = 'apiProviders'

export default function ApiManager() {
  const [providers, setProviders] = useState<ProviderConfig[]>(DEFAULT_PROVIDERS)
  const [activeProvider, setActiveProvider] = useState<string | null>(null)
  const [editForm, setEditForm] = useState<ProviderConfig | null>(null)
  const [masterKey, setMasterKey] = useState('')

  const loadMasterKey = useCallback(async () => {
    if (window.electronAPI) {
      const saved = await window.electronAPI.getStore('apiMasterKey')
      if (typeof saved === 'string') setMasterKey(saved)
    }
  }, [])

  const loadProviders = useCallback(async () => {
    if (window.electronAPI) {
      const saved = await window.electronAPI.getStore(STORE_KEY)
      if (Array.isArray(saved) && saved.length > 0) {
        setProviders(saved.map((sp: any) => {
          const def = DEFAULT_PROVIDERS.find(d => d.id === sp.id)
          return def ? { ...def, ...sp, models: sp.models || def.models } : sp
        }))
      }
    }
  }, [])

  useEffect(() => { loadProviders(); loadMasterKey() }, [loadProviders, loadMasterKey])

  const saveProviders = async (list: ProviderConfig[]) => {
    setProviders(list)
    if (window.electronAPI) await window.electronAPI.setStore(STORE_KEY, list)
  }

  const handleEdit = (p: ProviderConfig) => {
    setEditForm({ ...p, models: p.models.map(m => ({ ...m })) })
  }

  const handleSaveEdit = async () => {
    if (!editForm) return
    const next = providers.map(p => p.id === editForm.id ? editForm : p)
    await saveProviders(next)
    setEditForm(null)
  }

  const handleTest = async (p: ProviderConfig) => {
    if (!p.apiKey) return
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json', Authorization: `Bearer ${p.apiKey}` }
      const url = p.id === 'google'
        ? `${p.endpoint}/models?key=${p.apiKey}`
        : `${p.endpoint}/models`
      const res = await fetch(url, { headers })
      if (res.ok) {
        const next = providers.map(pr => pr.id === p.id ? { ...pr, enabled: true } : pr)
        await saveProviders(next)
      } else {
        const next = providers.map(pr => pr.id === p.id ? { ...pr, enabled: false } : pr)
        await saveProviders(next)
      }
    } catch {
      const next = providers.map(pr => pr.id === p.id ? { ...pr, enabled: false } : pr)
      await saveProviders(next)
    }
  }

  const toggleModel = async (providerId: string, modelId: string) => {
    const next = providers.map(p => {
      if (p.id !== providerId) return p
      return { ...p, models: p.models.map(m => m.id === modelId ? { ...m, enabled: !m.enabled } : m) }
    })
    await saveProviders(next)
  }

  const enabledProviders = providers.filter(p => p.apiKey)
  const enabledModels = providers.reduce((sum, p) => sum + p.models.filter(m => m.enabled).length, 0)

  if (activeProvider && !editForm) {
    const p = providers.find(pr => pr.id === activeProvider)!
    return (
      <div style={{ padding: 24, height: '100%', overflow: 'auto' }}>
        <div style={{ fontSize: 13, color: 'var(--accent)', cursor: 'pointer', marginBottom: 20, display: 'flex', alignItems: 'center', gap: 6 }} onClick={() => setActiveProvider(null)}>
          <ArrowLeft size={14} /> 返回 API 管理
        </div>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <div>
            <h2 style={{ fontSize: 16, fontWeight: 700 }}><span style={{ background: `${p.color}22`, padding: '3px 8px', borderRadius: 6, fontSize: 14 }}>{p.icon}</span> {p.name}</h2>
            <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>配置 API 连接和可用模型</p>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-ghost" onClick={() => handleTest(p)}>🔄 测试连接</button>
            <button className="btn btn-primary" onClick={() => handleEdit(p)}>✏️ 编辑配置</button>
          </div>
        </div>

        <div className="api-config-section">
          <h4>🔑 连接信息</h4>
          <div style={{ display: 'flex', gap: 16, fontSize: 13 }}>
            <div style={{ flex: 1 }}><span style={{ color: 'var(--text-muted)' }}>API Key：</span>{p.apiKey ? `sk-${'*'.repeat(16)}${p.apiKey.slice(-4)}` : <span style={{ color: 'var(--red)', fontStyle: 'italic' }}>未配置</span>}</div>
            <div style={{ flex: 1 }}><span style={{ color: 'var(--text-muted)' }}>地址：</span>{p.endpoint}</div>
            <div><span style={{ color: 'var(--text-muted)' }}>状态：</span>{p.enabled ? <span style={{ color: 'var(--success)' }}><Check size={12} /> 已连接</span> : <span style={{ color: 'var(--red)' }}>未连接</span>}</div>
          </div>
        </div>

        <div className="api-config-section">
          <h4>📦 可用模型</h4>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {p.models.map(m => (
              <div key={m.id} className="api-model-item">
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontSize: 13, fontWeight: 500 }}>{m.name}</span>
                  <span className={`api-model-tag api-model-${m.type}`}>{m.type === 'chat' ? '对话' : m.type === 'image' ? '生图' : '音频'}</span>
                  <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{m.desc}</span>
                </div>
                <div className={`settings-toggle${m.enabled ? ' on' : ''}`} onClick={() => toggleModel(p.id, m.id)} />
              </div>
            ))}
          </div>
        </div>

        <div className="api-config-section">
          <h4>🚀 本地代理服务</h4>
          <div style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.8 }}>
            端点：<code style={{ background: 'rgba(34,197,94,0.1)', color: 'var(--success)', padding: '2px 8px', borderRadius: 4 }}>http://127.0.0.1:19384/v1</code> <span style={{ color: 'var(--success)', fontSize: 11 }}>● 运行中</span><br />
            在其他 AI 客户端（Cherry Studio、ChatBox 等）中填入此地址 + 任意 Key 即可使用已配置的所有模型。
          </div>
        </div>
      </div>
    )
  }

  // Edit modal
  if (editForm) {
    return (
      <div style={{ padding: 24, height: '100%', overflow: 'auto' }}>
        <div style={{ fontSize: 13, color: 'var(--accent)', cursor: 'pointer', marginBottom: 20, display: 'flex', alignItems: 'center', gap: 6 }} onClick={() => setEditForm(null)}>
          <ArrowLeft size={14} /> 返回
        </div>
        <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 20 }}>✏️ 编辑 {editForm.name}</h2>
        <div className="api-config-section">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div>
              <label className="label">API Key</label>
              <input className="input-base" type="password" value={editForm.apiKey} onChange={e => setEditForm({ ...editForm, apiKey: e.target.value })} placeholder="sk-..." />
            </div>
            <div>
              <label className="label">API 地址</label>
              <input className="input-base" value={editForm.endpoint} onChange={e => setEditForm({ ...editForm, endpoint: e.target.value })} />
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button className="btn btn-ghost" onClick={() => setEditForm(null)}>取消</button>
              <button className="btn btn-primary" onClick={handleSaveEdit}><Check size={14} /> 保存配置</button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div style={{ padding: 24, height: '100%', overflow: 'auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <h2 style={{ fontSize: 16, fontWeight: 700 }}>🔌 模型 API 管理</h2>
          <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>统一管理多平台 AI 模型，一处配置全局可用</p>
        </div>
      </div>

      <div className="api-stats">
        <div className="api-stat-card"><div className="api-stat-num" style={{ color: 'var(--success)' }}>{enabledProviders.length}</div><div>已配置</div></div>
        <div className="api-stat-card"><div className="api-stat-num" style={{ color: 'var(--accent)' }}>{enabledModels}</div><div>可用模型</div></div>
        <div className="api-stat-card"><div className="api-stat-num">{providers.length}</div><div>支持提供商</div></div>
      </div>

      {enabledProviders.length > 0 && (
        <div className="api-config-section" style={{ marginBottom: 20, borderColor: 'rgba(34,197,94,0.2)' }}>
          <h4>🚀 统一 API 入口</h4>
          <div style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 2 }}>
            <div>地址：<code style={{ background: 'rgba(34,197,94,0.1)', color: 'var(--success)', padding: '2px 8px', borderRadius: 4 }}>http://127.0.0.1:19384/v1</code> <span style={{ color: 'var(--success)', fontSize: 11 }}>● 运行中</span></div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
              <span>统一 Key：</span>
              <input
                className="input-base"
                style={{ width: 200, fontFamily: 'monospace', padding: '4px 8px', fontSize: 12 }}
                type="text"
                value={masterKey}
                onChange={async e => { setMasterKey(e.target.value); if (window.electronAPI) await window.electronAPI.setStore('apiMasterKey', e.target.value) }}
                placeholder="设置一个统一访问密钥"
              />
              {masterKey ? <span style={{ color: 'var(--success)', fontSize: 11 }}>已设置</span> : <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>未设置，留空则无需认证</span>}
            </div>
            <div style={{ fontSize: 11, marginTop: 2 }}>可用模型：{providers.filter(p => p.apiKey).flatMap(p => p.models.filter(m => m.enabled).map(m => m.id)).join('、') || '尚未配置'}</div>
          </div>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 12 }}>
        {providers.map(p => (
          <div key={p.id} className="api-provider-card" onClick={() => p.apiKey ? setActiveProvider(p.id) : handleEdit(p)}>
            <div className={`api-provider-dot${p.enabled ? ' online' : ''}`} />
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 }}>
              <div className="api-provider-icon" style={{ background: `${p.color}22` }}>{p.icon}</div>
              <div>
                <div style={{ fontSize: 14, fontWeight: 600 }}>{p.name}</div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{p.apiKey ? `已配置 · ${p.enabled ? '已连接' : '未连通'}` : '点击配置'}</div>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
              {p.models.slice(0, 4).map(m => (
                <span key={m.id} className="api-model-badge">{m.name}</span>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
