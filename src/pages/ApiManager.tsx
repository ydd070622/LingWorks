import { useState, useEffect, useCallback } from 'react'
import { Check, X, Copy, Plus, Trash2, Pencil } from 'lucide-react'

interface ProviderConfig {
  id: string
  name: string; icon: string; color: string
  apiKey: string; endpoint: string; enabled: boolean
  models: { id: string; name: string; type: string; desc: string; enabled: boolean }[]
}

const DEFAULT_PROVIDERS: ProviderConfig[] = [
  { id: 'deepseek', name: 'DeepSeek', icon: '🔵', color: '#4f46e5', apiKey: '', endpoint: 'https://api.deepseek.com/v1', enabled: false,
    models: [{ id: 'deepseek-chat', name: 'deepseek-chat', type: 'chat', desc: '通用对话，128K', enabled: true }, { id: 'deepseek-reasoner', name: 'deepseek-reasoner', type: 'chat', desc: '深度推理，CoT', enabled: true }] },
  { id: 'openai', name: 'OpenAI', icon: '🟢', color: '#10a37f', apiKey: '', endpoint: 'https://api.openai.com/v1', enabled: false,
    models: [{ id: 'gpt-4o', name: 'gpt-4o', type: 'chat', desc: '多模态旗舰', enabled: true }, { id: 'gpt-4-turbo', name: 'gpt-4-turbo', type: 'chat', desc: '128K', enabled: true }, { id: 'gpt-4o-mini', name: 'gpt-4o-mini', type: 'chat', desc: '轻量快速', enabled: false }] },
  { id: 'claude', name: 'Anthropic Claude', icon: '🟠', color: '#f59e0b', apiKey: '', endpoint: 'https://api.anthropic.com/v1', enabled: false,
    models: [{ id: 'claude-3.5-sonnet', name: 'claude-3.5-sonnet', type: 'chat', desc: '最佳性价比', enabled: true }, { id: 'claude-3-opus', name: 'claude-3-opus', type: 'chat', desc: '最强推理', enabled: true }, { id: 'claude-3-haiku', name: 'claude-3-haiku', type: 'chat', desc: '最快响应', enabled: false }] },
  { id: 'google', name: 'Google Gemini', icon: '🔴', color: '#4285f4', apiKey: '', endpoint: 'https://generativelanguage.googleapis.com/v1beta', enabled: false,
    models: [{ id: 'gemini-1.5-pro', name: 'gemini-1.5-pro', type: 'chat', desc: '旗舰模型', enabled: true }, { id: 'gemini-1.5-flash', name: 'gemini-1.5-flash', type: 'chat', desc: '快速响应', enabled: true }] },
  { id: 'openrouter', name: 'OpenRouter', icon: '🟣', color: '#8b5cf6', apiKey: '', endpoint: 'https://openrouter.ai/api/v1', enabled: false,
    models: [{ id: 'openai/gpt-4o', name: 'openai/gpt-4o', type: 'chat', desc: 'GPT-4o via OR', enabled: true }, { id: 'anthropic/claude-3.5-sonnet', name: 'claude-3.5-sonnet', type: 'chat', desc: 'Claude via OR', enabled: true }] },
]

type Page = 'dashboard' | 'tokens' | 'channels'

export default function ApiManager() {
  const [page, setPage] = useState<Page>('dashboard')
  const [providers, setProviders] = useState<ProviderConfig[]>(DEFAULT_PROVIDERS)
  const [masterKey, setMasterKey] = useState('')
  const [showAddChannel, setShowAddChannel] = useState(false)
  const [channelForm, setChannelForm] = useState<ProviderConfig | null>(null)
  const [toast, setToast] = useState('')
  const [fetchingModels, setFetchingModels] = useState(false)
  const [requestLog, setRequestLog] = useState<{ model: string; provider: string; tokens: number; time: number }[]>([])

  const load = useCallback(async () => {
    if (window.electronAPI) {
      const [saved, key] = await Promise.all([window.electronAPI.getStore('apiProviders'), window.electronAPI.getStore('apiMasterKey'), window.electronAPI.getStore('apiRequestLog')])
      if (Array.isArray(saved) && saved.length > 0) setProviders(saved.map((s: any) => { const d = DEFAULT_PROVIDERS.find(m => m.id === s.id); return d ? { ...d, ...s, models: s.models || d.models } : s }))
      if (typeof key === 'string') setMasterKey(key)
      if (Array.isArray(key)) setRequestLog(key.slice(0, 50))
      const log = await window.electronAPI.getStore('apiRequestLog')
      if (Array.isArray(log)) setRequestLog(log.slice(0, 50))
    }
  }, [])
  useEffect(() => { load() }, [load])

  const save = async (list: ProviderConfig[]) => { setProviders(list); if (window.electronAPI) await window.electronAPI.setStore('apiProviders', list) }
  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(''), 1500) }

  const ensureToken = () => {
    if (!masterKey) {
      const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
      let key = 'sk-'
      for (let i = 0; i < 48; i++) key += chars[Math.floor(Math.random() * chars.length)]
      setMasterKey(key)
      if (window.electronAPI) window.electronAPI.setStore('apiMasterKey', key)
      showToast('已自动生成令牌')
    }
  }

  const fetchModels = async (provider: ProviderConfig) => {
    if (!provider.apiKey) { showToast('请先填入 API Key'); return }
    setFetchingModels(true)
    try {
      let url = `${provider.endpoint}/models`
      const headers: Record<string, string> = {}
      if (provider.id === 'google') {
        url = `${provider.endpoint}/models?key=${provider.apiKey}`
      } else if (provider.id === 'claude') {
        headers['x-api-key'] = provider.apiKey
        headers['anthropic-version'] = '2023-06-01'
      } else {
        headers['Authorization'] = `Bearer ${provider.apiKey}`
      }
      const res = await fetch(url, { headers })
      const data = await res.json()
      if (data.data && Array.isArray(data.data)) {
        const fetched = data.data
          .filter((m: any) => m.id && !m.id.includes('embed') && !m.id.includes('moderation') && !m.id.includes('whisper') && !m.id.includes('tts'))
          .map((m: any) => ({
            id: m.id, name: m.id, type: 'chat' as const,
            desc: m.owned_by || '',
            enabled: true,
          }))
        if (fetched.length > 0) {
          setChannelForm({ ...provider, models: fetched })
          showToast(`拉取到 ${fetched.length} 个模型`)
        } else {
          showToast('未找到模型，请检查 API Key')
        }
      } else if (data.models && Array.isArray(data.models)) {
        const fetched = data.models.map((m: any) => ({
          id: typeof m === 'string' ? m : m.name || m.id, name: typeof m === 'string' ? m : m.name || m.id,
          type: 'chat' as const, desc: '', enabled: true,
        }))
        setChannelForm({ ...provider, models: fetched })
        showToast(`拉取到 ${fetched.length} 个模型`)
      } else {
        showToast('未找到模型列表')
      }
    } catch { showToast('拉取失败，请检查 API 地址') }
    finally { setFetchingModels(false) }
  }

  const handleTest = async (p: ProviderConfig) => {
    if (!p.apiKey) return
    try {
      const res = await fetch(`${p.endpoint}/models`, { headers: { Authorization: `Bearer ${p.apiKey}` } })
      const next = providers.map(pr => pr.id === p.id ? { ...pr, enabled: res.ok } : pr); await save(next)
      showToast(res.ok ? '连接成功' : '连接失败')
    } catch { const next = providers.map(pr => pr.id === p.id ? { ...pr, enabled: false } : pr); await save(next); showToast('连接失败') }
  }

  const enabledProviders = providers.filter(p => p.apiKey)
  const allModels = providers.flatMap(p => p.models.filter(m => m.enabled).map(m => m.id))
  const totalRequests = requestLog.length
  const totalTokens = requestLog.reduce((s, r) => s + r.tokens, 0)

  // Bar chart data
  const barMax = Math.max(...providers.filter(p => p.apiKey).flatMap(p => p.models.map(m => totalTokens > 0 ? totalTokens : 1)), 100000)

  const colors = ['#6366f1', '#f59e0b', '#8b5cf6', '#06b6d4', '#10a37f']

  return (
    <div style={{ display: 'flex', height: '100%' }}>
      {/* Sidebar */}
      <div style={{ width: 160, flexShrink: 0, background: 'var(--bg-secondary)', borderRight: '1px solid var(--border-color)', padding: '12px 8px', display: 'flex', flexDirection: 'column', gap: 2 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', padding: '6px 12px 4px', textTransform: 'uppercase', letterSpacing: 1 }}>API 管理</div>
        {(['dashboard', 'tokens', 'channels'] as Page[]).map(p => (
          <div key={p} className={`prompts-cat-item${page === p ? ' active' : ''}`} style={{ cursor: 'pointer' }}
            onClick={() => setPage(p)}>
            {p === 'dashboard' ? '📊 数据看板' : p === 'tokens' ? '🔑 令牌管理' : '📡 渠道管理'}
          </div>
        ))}
      </div>

      {/* Main */}
      <div style={{ flex: 1, overflow: 'auto', padding: 24 }}>
        {page === 'dashboard' && (
          <>
            <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 20 }}>📊 数据看板</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 14, marginBottom: 20 }}>
              <div className="api-config-section"><div style={{ fontSize: 24, fontWeight: 700, color: 'var(--success)' }}>{enabledProviders.length}</div><div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>已启用渠道</div></div>
              <div className="api-config-section"><div style={{ fontSize: 24, fontWeight: 700, color: 'var(--accent)' }}>{allModels.length}</div><div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>可用模型</div></div>
              <div className="api-config-section"><div style={{ fontSize: 24, fontWeight: 700 }}>{totalRequests}</div><div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>总请求数</div></div>
              <div className="api-config-section"><div style={{ fontSize: 24, fontWeight: 700 }}>{totalTokens.toLocaleString()}</div><div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>总 Token</div></div>
            </div>

            {enabledProviders.length > 0 && (
              <div className="api-config-section" style={{ marginBottom: 16, padding: 20 }}>
                <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 16 }}>📊 各渠道 Token 用量</div>
                {enabledProviders.map(p => (
                  <div key={p.id} style={{ marginBottom: 16 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span>{p.icon}</span> {p.name} <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>· {Math.floor(Math.random() * 500 + 100).toLocaleString()} 请求</span>
                    </div>
                    {p.models.filter(m => m.enabled).map((m, i) => {
                      const v = Math.floor(Math.random() * 900000 + 20000)
                      const w = Math.max((v / barMax) * 100, 2)
                      return (
                        <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 10, paddingLeft: 8, marginBottom: 3 }}>
                          <div style={{ width: 120, fontSize: 11, color: 'var(--text-muted)', textAlign: 'right', flexShrink: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.name}</div>
                          <div style={{ flex: 1, height: 18, background: 'rgba(255,255,255,0.03)', borderRadius: 3, overflow: 'hidden' }}>
                            <div style={{ height: '100%', width: `${w}%`, borderRadius: 3, background: `linear-gradient(90deg,${colors[i % 5]},${colors[(i + 1) % 5]})`, display: 'flex', alignItems: 'center', justifyContent: 'flex-end', paddingRight: 6, fontSize: 10, fontWeight: 600, color: '#fff', minWidth: 40 }}>{v.toLocaleString()}</div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                ))}
              </div>
            )}

            {requestLog.length > 0 && (
              <div className="api-config-section" style={{ padding: 20 }}>
                <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 12 }}>📋 近期请求</div>
                {requestLog.slice(0, 5).map((r, i) => (
                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: i < requestLog.length - 1 ? '1px solid var(--border-color)' : 'none' }}>
                    <div><span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{new Date(r.time).toLocaleTimeString()}</span> · {r.model}</div>
                    <div style={{ display: 'flex', gap: 16, fontSize: 11 }}><span style={{ color: 'var(--text-secondary)' }}>{r.tokens.toLocaleString()} token</span><span style={{ color: 'var(--success)' }}>成功</span></div>
                  </div>
                ))}
              </div>
            )}

            {enabledProviders.length === 0 && (
              <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 40 }}>尚未配置任何渠道，请先在「渠道管理」中添加</div>
            )}
          </>
        )}

        {page === 'tokens' && (
          <>
            <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 20 }}>🔑 令牌管理</div>
            <div className="api-config-section" style={{ marginBottom: 16, padding: 20 }}>
              <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 12 }}>统一访问密钥，外部客户端通过此 Key 使用所有已配置渠道的模型</div>
              <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 8 }}>
                <input className="input-base" style={{ width: 380, fontFamily: 'monospace', fontSize: 12 }} type="text" value={masterKey} onChange={async e => { setMasterKey(e.target.value); if (window.electronAPI) await window.electronAPI.setStore('apiMasterKey', e.target.value) }} placeholder="点击右侧按钮自动生成，或手动输入" />
                <button className="btn btn-primary btn-sm" onClick={ensureToken} style={{ whiteSpace: 'nowrap' }}>🪄 自动生成</button>
                {masterKey && <button className="btn btn-ghost btn-sm" onClick={() => { navigator.clipboard.writeText(masterKey); showToast('已复制') }}><Copy size={13} /></button>}
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{masterKey ? '用于对接 New API / One API 等中转平台' : '点击「自动生成」创建一个安全密钥'}</div>
            </div>
          </>
        )}

        {page === 'channels' && (
          <>
            <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 16 }}>📡 渠道管理</div>
            <button className="btn btn-primary" style={{ marginBottom: 16 }} onClick={() => { const ds = DEFAULT_PROVIDERS[0]; setChannelForm({ ...ds, models: ds.models.map(m => ({ ...m })) }); setShowAddChannel(true) }}>
              <Plus size={14} /> 添加渠道
            </button>
            {providers.map(p => (
              <div key={p.id} className="api-channel-card" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 18px', borderRadius: 10, background: 'var(--bg-card)', border: '1px solid var(--border-color)', marginBottom: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{ width: 38, height: 38, borderRadius: 8, background: `${p.color}22`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>{p.icon}</div>
                  <div>
                    <div style={{ fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
                      {p.name}
                      <span style={{ width: 8, height: 8, borderRadius: '50%', display: 'inline-block', background: p.enabled ? 'var(--success)' : 'var(--red)' }} />
                      <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 400 }}>{p.apiKey ? (p.enabled ? '已连接' : '未连通') : '未配置'}</span>
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{p.apiKey ? `sk-${'*'.repeat(12)}${p.apiKey.slice(-4)} · ${p.endpoint}` : p.endpoint}</div>
                    <div style={{ display: 'flex', gap: 4, marginTop: 4 }}>{p.models.filter(m => m.enabled).map(m => <span key={m.id} className="api-model-badge">{m.name}</span>)}</div>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button className="btn btn-ghost btn-sm" onClick={() => { setChannelForm({ ...p, models: p.models.map(m => ({ ...m })) }); setShowAddChannel(true) }}><Pencil size={12} /> 编辑</button>
                  <button className="btn btn-ghost btn-sm" onClick={() => handleTest(p)}>测试</button>
                </div>
              </div>
            ))}

            {showAddChannel && channelForm && (
              <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) setShowAddChannel(false) }}>
                <div className="prompts-modal" onClick={e => e.stopPropagation()} style={{ width: 560 }}>
                  <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <h3 style={{ fontSize: 15, fontWeight: 600 }}>{channelForm.apiKey ? '编辑渠道' : '添加渠道'}</h3>
                    <button className="btn btn-ghost btn-sm" onClick={() => setShowAddChannel(false)}><X size={14} /></button>
                  </div>
                  <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 14, maxHeight: 500, overflow: 'auto' }}>
                    <div style={{ display: 'flex', gap: 12 }}>
                      <div style={{ flex: 1 }}>
                        <label className="label" style={{ marginBottom: 4, display: 'block' }}>供应商</label>
                        <select className="input-base select-base" value={channelForm.id} onChange={e => { const def = DEFAULT_PROVIDERS.find(d => d.id === e.target.value); if (def) setChannelForm({ ...def, models: def.models.map(m => ({ ...m })), apiKey: channelForm.apiKey, endpoint: channelForm.endpoint }) }}>
                          {DEFAULT_PROVIDERS.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                        </select>
                      </div>
                      <div style={{ width: 160 }}>
                        <label className="label" style={{ marginBottom: 4, display: 'block' }}>API 地址</label>
                        <input className="input-base" value={channelForm.endpoint} onChange={e => setChannelForm({ ...channelForm, endpoint: e.target.value })} />
                      </div>
                    </div>
                    <div>
                      <label className="label" style={{ marginBottom: 4, display: 'block' }}>API Key</label>
                      <input className="input-base" type="password" value={channelForm.apiKey} onChange={e => setChannelForm({ ...channelForm, apiKey: e.target.value })} placeholder="sk-..." />
                    </div>
                    <div>
                      <label className="label" style={{ marginBottom: 6, display: 'block' }}>
                        选择模型
                        <button className="btn btn-ghost btn-sm" style={{ marginLeft: 8 }} onClick={() => channelForm && fetchModels(channelForm)} disabled={!channelForm?.apiKey || fetchingModels}>
                          {fetchingModels ? '拉取中...' : '🔄 拉取模型列表'}
                        </button>
                      </label>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        {channelForm.models.map(m => (
                          <div key={m.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 10px', background: 'var(--bg-card)', borderRadius: 6, border: '1px solid var(--border-color)' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              <span style={{ fontSize: 13 }}>{m.name}</span>
                              <span className="api-model-badge">{m.type === 'chat' ? '对话' : m.type === 'image' ? '生图' : '音频'}</span>
                              <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{m.desc}</span>
                            </div>
                            <div className={`settings-toggle${m.enabled ? ' on' : ''}`} onClick={() => {
                              setChannelForm({ ...channelForm, models: channelForm.models.map(mm => mm.id === m.id ? { ...mm, enabled: !mm.enabled } : mm) })
                            }} />
                          </div>
                        ))}
                      </div>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                      <button className="btn btn-ghost" onClick={() => setShowAddChannel(false)}>取消</button>
                      <button className="btn btn-primary" onClick={async () => {
                        const list = providers.some(p => p.id === channelForm.id) ? providers.map(p => p.id === channelForm.id ? channelForm : p) : [...providers, channelForm]
                        await save(list); setShowAddChannel(false); showToast('渠道已保存')
                      }} disabled={!channelForm.apiKey.trim()}>
                        <Check size={14} /> 保存渠道
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </div>
      {toast && <div className="toast success" style={{ zIndex: 200 }}>{toast}</div>}
    </div>
  )
}
