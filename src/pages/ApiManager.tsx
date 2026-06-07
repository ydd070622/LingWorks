import { useState, useEffect, useCallback } from 'react'
import { Check, X, Copy, Plus, Pencil, RefreshCw } from 'lucide-react'

interface ProviderConfig {
  id: string; name: string; icon: string; color: string
  apiKey: string; endpoint: string; enabled: boolean
  models: { id: string; name: string; type: string; desc: string; enabled: boolean }[]
}

interface UsageData {
  balance: number
  totalSpent: number
  dailyCosts: { date: string; cost: number }[]
  models: { id: string; inputTokens: number; outputTokens: number; cost: number }[]
  lastUpdate: number
}

const DEFAULT_PROVIDERS: ProviderConfig[] = [
  { id: 'deepseek', name: 'DeepSeek', icon: '🔵', color: '#4f46e5', apiKey: '', endpoint: 'https://api.deepseek.com/v1', enabled: false,
    models: [{ id: 'deepseek-chat', name: 'deepseek-chat', type: 'chat', desc: '通用对话', enabled: true }, { id: 'deepseek-reasoner', name: 'deepseek-reasoner', type: 'chat', desc: '深度推理', enabled: true }] },
  { id: 'openai', name: 'OpenAI', icon: '🟢', color: '#10a37f', apiKey: '', endpoint: 'https://api.openai.com/v1', enabled: false,
    models: [{ id: 'gpt-4o', name: 'gpt-4o', type: 'chat', desc: '多模态', enabled: true }, { id: 'gpt-4-turbo', name: 'gpt-4-turbo', type: 'chat', desc: '128K', enabled: true }] },
  { id: 'claude', name: 'Anthropic Claude', icon: '🟠', color: '#f59e0b', apiKey: '', endpoint: 'https://api.anthropic.com/v1', enabled: false,
    models: [{ id: 'claude-3.5-sonnet', name: 'claude-3.5-sonnet', type: 'chat', desc: '最佳性价比', enabled: true }, { id: 'claude-3-opus', name: 'claude-3-opus', type: 'chat', desc: '最强推理', enabled: true }] },
]

type Page = 'dashboard' | 'channels'

export default function ApiManager() {
  const [page, setPage] = useState<Page>('dashboard')
  const [providers, setProviders] = useState<ProviderConfig[]>(DEFAULT_PROVIDERS)
  const [usageData, setUsageData] = useState<Record<string, UsageData>>({})
  const [showAdd, setShowAdd] = useState(false)
  const [channelForm, setChannelForm] = useState<ProviderConfig | null>(null)
  const [fetching, setFetching] = useState<string | null>(null)
  const [toast, setToast] = useState('')

  const load = useCallback(async () => {
    if (window.electronAPI) {
      const saved = await window.electronAPI.getStore('apiProviders')
      if (Array.isArray(saved) && saved.length > 0) setProviders(saved.map((s: any) => { const d = DEFAULT_PROVIDERS.find(m => m.id === s.id); return d ? { ...d, ...s, models: s.models || d.models } : s }))
      const ud = await window.electronAPI.getStore('apiUsageData')
      if (ud) setUsageData(ud)
    }
  }, [])
  useEffect(() => { load() }, [load])

  const save = async (list: ProviderConfig[]) => { setProviders(list); if (window.electronAPI) await window.electronAPI.setStore('apiProviders', list) }
  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(''), 1500) }

  const fetchUsage = async (p: ProviderConfig) => {
    if (!p.apiKey) { showToast('请先配置 API Key'); return }
    setFetching(p.id)
    try {
      const res = await fetch(`https://api.deepseek.com/user/balance`, { headers: { Authorization: `Bearer ${p.apiKey}` } })
      if (res.ok) {
        const data = await res.json()
        const balance = data.balance_infos?.[0]?.total_balance || data.total_balance || 0
        const spent = data.balance_infos?.[0]?.topped_up_balance || data.total_spent || 0
        const dailyCosts: { date: string; cost: number }[] = []
        const models: { id: string; inputTokens: number; outputTokens: number; cost: number }[] = []
        if (data.daily_costs) {
          for (const [date, cost] of Object.entries(data.daily_costs).slice(-7)) dailyCosts.push({ date, cost: cost as number })
        }
        const ud: UsageData = { balance, totalSpent: spent - balance, dailyCosts, models, lastUpdate: Date.now() }
        const next = { ...usageData, [p.id]: ud }
        setUsageData(next)
        if (window.electronAPI) await window.electronAPI.setStore('apiUsageData', next)
        showToast(`余额 ¥${balance.toFixed(2)} · 已用 ¥${(spent - balance).toFixed(2)}`)
      } else {
        showToast('获取失败，请检查 API Key')
      }
    } catch { showToast('请求失败') }
    finally { setFetching(null) }
  }

  const fetchModels = async (p: ProviderConfig) => {
    if (!p.apiKey) { showToast('请先填入 API Key'); return }
    setFetching(p.id + '-models')
    try {
      const res = await fetch(`${p.endpoint}/models`, { headers: { Authorization: `Bearer ${p.apiKey}` } })
      const data = await res.json()
      const list = data.data || data.models || []
      if (Array.isArray(list) && list.length > 0) {
        const fetched = list.filter((m: any) => m.id && !m.id.includes('embed') && !m.id.includes('moderation') && !m.id.includes('whisper'))
          .map((m: any) => ({ id: m.id, name: m.id, type: 'chat' as const, desc: m.owned_by || '', enabled: true }))
        const next = providers.map(pr => pr.id === p.id ? { ...pr, models: fetched } : pr)
        await save(next); showToast(`拉取 ${fetched.length} 个模型`)
      } else showToast('未获取到模型')
    } catch { showToast('拉取失败') }
    finally { setFetching(null) }
  }

  const maxCost = Math.max(...Object.values(usageData).map(u => u.totalSpent), 1)

  return (
    <div style={{ display: 'flex', height: '100%' }}>
      <div style={{ width: 150, flexShrink: 0, background: 'var(--bg-secondary)', borderRight: '1px solid var(--border-color)', padding: '12px 8px', display: 'flex', flexDirection: 'column', gap: 2 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', padding: '6px 12px 4px', textTransform: 'uppercase', letterSpacing: 1 }}>数据看板</div>
        {(['dashboard', 'channels'] as Page[]).map(p => (
          <div key={p} className={`prompts-cat-item${page === p ? ' active' : ''}`} style={{ cursor: 'pointer' }} onClick={() => setPage(p)}>
            {p === 'dashboard' ? '📊 用量总览' : '📡 渠道管理'}
          </div>
        ))}
      </div>

      <div style={{ flex: 1, overflow: 'auto', padding: 24 }}>
        {page === 'dashboard' && (
          <>
            <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 16 }}>📊 用量总览</div>
            {providers.filter(p => p.apiKey).length === 0 ? (
              <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 60 }}>尚未配置渠道，请先在「渠道管理」中添加 API Key</div>
            ) : (
              providers.filter(p => p.apiKey).map(p => {
                const ud = usageData[p.id]
                return (
                  <div key={p.id} className="api-config-section" style={{ marginBottom: 16, padding: 20 }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <span style={{ fontSize: 20 }}>{p.icon}</span>
                        <div>
                          <div style={{ fontSize: 14, fontWeight: 700 }}>{p.name}</div>
                          <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{p.models.filter(m => m.enabled).length} 个模型</div>
                        </div>
                      </div>
                      <button className="btn btn-ghost btn-sm" onClick={() => fetchUsage(p)} disabled={fetching === p.id}>
                        {fetching === p.id ? <RefreshCw size={13} style={{ animation: 'spin 1s infinite' }} /> : <RefreshCw size={13} />} 刷新用量
                      </button>
                    </div>

                    {ud ? (
                      <>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12, marginBottom: 14 }}>
                          <div style={{ padding: 12, background: 'var(--bg-card)', borderRadius: 8, border: '1px solid var(--border-color)' }}>
                            <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--success)' }}>¥{ud.balance.toFixed(2)}</div>
                            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>剩余余额</div>
                          </div>
                          <div style={{ padding: 12, background: 'var(--bg-card)', borderRadius: 8, border: '1px solid var(--border-color)' }}>
                            <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--accent)' }}>¥{ud.totalSpent.toFixed(2)}</div>
                            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>已消费</div>
                          </div>
                          <div style={{ padding: 12, background: 'var(--bg-card)', borderRadius: 8, border: '1px solid var(--border-color)' }}>
                            <div style={{ fontSize: 20, fontWeight: 700 }}>¥{(ud.balance + ud.totalSpent).toFixed(2)}</div>
                            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>总充值</div>
                          </div>
                        </div>

                        {ud.dailyCosts.length > 0 && (
                          <div style={{ marginBottom: 12 }}>
                            <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 8 }}>近{ud.dailyCosts.length}日消费趋势</div>
                            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, height: 80 }}>
                              {ud.dailyCosts.map((dc, i) => {
                                const maxDc = Math.max(...ud.dailyCosts.map(d => d.cost), 1)
                                return (
                                  <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
                                    <div style={{ width: '100%', height: `${(dc.cost / maxDc) * 60}px`, background: 'linear-gradient(180deg, var(--accent), rgba(99,102,241,0.2))', borderRadius: '3px 3px 0 0', minHeight: 2 }} />
                                    <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>¥{dc.cost.toFixed(2)}</div>
                                    <div style={{ fontSize: 9, color: 'var(--text-muted)' }}>{dc.date.slice(5)}</div>
                                  </div>
                                )
                              })}
                            </div>
                          </div>
                        )}

                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderTop: '1px solid var(--border-color)' }}>
                          <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>更新于 {new Date(ud.lastUpdate).toLocaleString()}</div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <div style={{ flex: 1, height: 4, width: 120, background: 'rgba(255,255,255,0.06)', borderRadius: 2 }}>
                              <div style={{ height: '100%', width: `${Math.min((ud.totalSpent / (ud.balance + ud.totalSpent)) * 100, 100)}%`, background: ud.totalSpent / (ud.balance + ud.totalSpent) > 0.8 ? '#ef4444' : 'var(--accent)', borderRadius: 2 }} />
                            </div>
                            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{((ud.totalSpent / (ud.balance + ud.totalSpent)) * 100).toFixed(1)}%</span>
                          </div>
                        </div>
                      </>
                    ) : (
                      <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 20, fontSize: 13 }}>点击「刷新用量」获取数据</div>
                    )}
                  </div>
                )
              })
            )}
          </>
        )}

        {page === 'channels' && (
          <>
            <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 16 }}>📡 渠道管理</div>
            <button className="btn btn-primary" style={{ marginBottom: 16 }} onClick={() => { const ds = DEFAULT_PROVIDERS[0]; setChannelForm({ ...ds, models: ds.models.map(m => ({ ...m })) }); setShowAdd(true) }}>
              <Plus size={14} /> 添加渠道
            </button>
            {providers.map(p => (
              <div key={p.id} className="api-channel-card" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 18px', borderRadius: 10, background: 'var(--bg-card)', border: '1px solid var(--border-color)', marginBottom: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{ width: 38, height: 38, borderRadius: 8, background: `${p.color}22`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>{p.icon}</div>
                  <div>
                    <div style={{ fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>{p.name} <span style={{ fontSize: 11, color: p.apiKey ? 'var(--success)' : 'var(--text-muted)', fontWeight: 400 }}>{p.apiKey ? '已配置' : '未配置'}</span></div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{p.apiKey ? `sk-${'*'.repeat(12)}${p.apiKey.slice(-4)} · ${p.endpoint}` : p.endpoint}</div>
                    <div style={{ display: 'flex', gap: 4, marginTop: 4 }}>{p.models.filter(m => m.enabled).map(m => <span key={m.id} className="api-model-badge">{m.name}</span>)}</div>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button className="btn btn-ghost btn-sm" onClick={() => { setChannelForm({ ...p, models: p.models.map(m => ({ ...m })) }); setShowAdd(true) }}><Pencil size={12} /></button>
                  <button className="btn btn-ghost btn-sm" onClick={() => fetchModels(p)} disabled={fetching === p.id + '-models'}>拉取模型</button>
                </div>
              </div>
            ))}
            {showAdd && channelForm && (
              <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) setShowAdd(false) }}>
                <div className="prompts-modal" onClick={e => e.stopPropagation()} style={{ width: 560 }}>
                  <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <h3 style={{ fontSize: 15, fontWeight: 600 }}>{channelForm.apiKey ? '编辑渠道' : '添加渠道'}</h3>
                    <button className="btn btn-ghost btn-sm" onClick={() => setShowAdd(false)}><X size={14} /></button>
                  </div>
                  <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 14, maxHeight: 500, overflow: 'auto' }}>
                    <div style={{ display: 'flex', gap: 12 }}>
                      <div style={{ flex: 1 }}>
                        <label className="label" style={{ marginBottom: 4, display: 'block' }}>供应商</label>
                        <select className="input-base select-base" value={channelForm.id} onChange={e => { const def = DEFAULT_PROVIDERS.find(d => d.id === e.target.value); if (def) setChannelForm({ ...def, models: def.models.map(m => ({ ...m })), apiKey: channelForm.apiKey }) }}>
                          {DEFAULT_PROVIDERS.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                        </select>
                      </div>
                      <div style={{ width: 160 }}><label className="label" style={{ marginBottom: 4, display: 'block' }}>API 地址</label><input className="input-base" value={channelForm.endpoint} onChange={e => setChannelForm({ ...channelForm, endpoint: e.target.value })} /></div>
                    </div>
                    <div><label className="label" style={{ marginBottom: 4, display: 'block' }}>API Key</label><input className="input-base" type="password" value={channelForm.apiKey} onChange={e => setChannelForm({ ...channelForm, apiKey: e.target.value })} placeholder="sk-..." /></div>
                    <div>
                      <label className="label" style={{ marginBottom: 6, display: 'block' }}>选择模型</label>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        {channelForm.models.map(m => (
                          <div key={m.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 10px', background: 'var(--bg-card)', borderRadius: 6, border: '1px solid var(--border-color)' }}>
                            <span style={{ fontSize: 13 }}>{m.name}</span>
                            <div className={`settings-toggle${m.enabled ? ' on' : ''}`} onClick={() => setChannelForm({ ...channelForm, models: channelForm.models.map(mm => mm.id === m.id ? { ...mm, enabled: !mm.enabled } : mm) })} />
                          </div>
                        ))}
                      </div>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                      <button className="btn btn-ghost" onClick={() => setShowAdd(false)}>取消</button>
                      <button className="btn btn-primary" onClick={async () => { const list = providers.some(p => p.id === channelForm.id) ? providers.map(p => p.id === channelForm.id ? channelForm : p) : [...providers, channelForm]; await save(list); setShowAdd(false); showToast('已保存') }} disabled={!channelForm.apiKey.trim()}><Check size={14} /> 保存</button>
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
