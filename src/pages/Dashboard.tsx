import { useState, useEffect, useCallback, useRef } from 'react'
import { RefreshCw, Settings, X, ArrowLeft } from 'lucide-react'

interface UsageData {
  balance: number
  totalSpent: number
  totalTopped: number
  dailyCosts: Record<string, number>
  lastUpdate: number
}

interface ModelUsage {
  name: string
  inputTokens: number
  outputTokens: number
  inputCost: number
  outputCost: number
}

export default function Dashboard() {
  const [apiKey, setApiKey] = useState('')
  const [usage, setUsage] = useState<UsageData | null>(null)
  const [modelUsage, setModelUsage] = useState<ModelUsage[]>([])
  const [loading, setLoading] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [error, setError] = useState('')
  const timerRef = useRef<ReturnType<typeof setInterval>>()

  const loadApiKey = useCallback(async () => {
    if (window.electronAPI) {
      const models = await window.electronAPI.getStore('customModels')
      if (Array.isArray(models)) {
        const ds = models.find((m: any) => m.name && m.name.toLowerCase().includes('deepseek'))
        if (ds?.apiKey) setApiKey(ds.apiKey)
      }
      const saved = await window.electronAPI.getStore('dsUsage')
      if (saved) {
        setUsage(saved.usage)
        setModelUsage(saved.models || [])
      }
    }
  }, [])

  useEffect(() => { loadApiKey() }, [loadApiKey])

  const fetchData = useCallback(async () => {
    if (!apiKey) return
    setLoading(true)
    setError('')
    try {
      const res = await fetch('https://api.deepseek.com/user/balance', {
        headers: { Authorization: `Bearer ${apiKey}` }
      })
      if (!res.ok) { setError('获取失败，请检查 API Key'); return }
      const data = await res.json()

      const infos = data.balance_infos || []
      let balance = 0, topped = 0
      for (const info of infos) {
        balance += parseFloat(info.total_balance || 0)
        topped += parseFloat(info.topped_up_balance || 0)
      }
      const totalSpent = topped - balance

      // Try to get daily costs if available
      const dailyCosts: Record<string, number> = {}
      if (data.daily_costs) Object.assign(dailyCosts, data.daily_costs)

      // Merge with saved data
      const prevDaily = usage?.dailyCosts || {}
      for (const [k, v] of Object.entries(prevDaily)) {
        if (!dailyCosts[k]) dailyCosts[k] = v
      }

      // Try to get model usage
      let models: ModelUsage[] = modelUsage
      try {
        const mRes = await fetch('https://api.deepseek.com/user/usage', {
          headers: { Authorization: `Bearer ${apiKey}` }
        })
        if (mRes.ok) {
          const mData = await mRes.json()
          if (mData.models) {
            models = mData.models.map((m: any) => ({
              name: m.model || m.name || '',
              inputTokens: m.input_tokens || m.prompt_tokens || 0,
              outputTokens: m.output_tokens || m.completion_tokens || 0,
              inputCost: m.input_cost || 0,
              outputCost: m.output_cost || 0,
            })).filter((m: ModelUsage) => m.name)
          }
        }
      } catch {}

      const ud: UsageData = { balance, totalSpent, totalTopped: topped, dailyCosts, lastUpdate: Date.now() }
      setUsage(ud)
      setModelUsage(models)

      if (window.electronAPI) {
        await window.electronAPI.setStore('dsUsage', { usage: ud, models })
      }
    } catch (e: any) {
      setError('请求失败：' + (e.message || '网络错误'))
    } finally { setLoading(false) }
  }, [apiKey, usage, modelUsage])

  useEffect(() => {
    if (apiKey) { fetchData(); timerRef.current = setInterval(fetchData, 600000) }
    return () => { if (timerRef.current) clearInterval(timerRef.current) }
  }, [apiKey])

  const dailyList = usage ? Object.entries(usage.dailyCosts).slice(-7).map(([d, c]) => ({
    date: d, cost: typeof c === 'number' ? c : parseFloat(c as any) || 0
  })) : []
  const maxDaily = Math.max(...dailyList.map(d => d.cost), 1)
  const spentPercent = usage && usage.totalTopped > 0 ? (usage.totalSpent / usage.totalTopped) * 100 : 0

  const totalInputTokens = modelUsage.reduce((s, m) => s + m.inputTokens, 0)
  const totalOutputTokens = modelUsage.reduce((s, m) => s + m.outputTokens, 0)
  const modelMaxTokens = Math.max(...modelUsage.map(m => m.inputTokens + m.outputTokens), 1)

  return (
    <div style={{ padding: 24, height: '100%', overflow: 'auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <h2 style={{ fontSize: 16, fontWeight: 700 }}>📊 数据看板</h2>
          <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>DeepSeek 账户余额与用量监控</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-ghost" onClick={() => setShowSettings(true)}><Settings size={13} /> 设置</button>
          <button className="btn btn-primary" onClick={fetchData} disabled={loading}>
            <RefreshCw size={13} style={loading ? { animation: 'spin 1s infinite linear' } : {}} /> 刷新
          </button>
        </div>
      </div>

      {!apiKey ? (
        <div style={{ textAlign: 'center', padding: 60 }}>
          <div style={{ fontSize: 14, color: 'var(--text-muted)', marginBottom: 16 }}>尚未配置 DeepSeek API Key</div>
          <button className="btn btn-primary" onClick={() => setShowSettings(true)}>🔑 配置 API Key</button>
        </div>
      ) : (
        <>
          {error && (
            <div style={{ padding: 12, borderRadius: 8, background: 'rgba(239,68,68,0.08)', color: '#ef4444', fontSize: 13, marginBottom: 16, border: '1px solid rgba(239,68,68,0.15)' }}>
              {error}
            </div>
          )}

          {usage && (
            <>
              {/* Balance cards */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12, marginBottom: 20 }}>
                <div className="api-config-section" style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: 24, fontWeight: 700, color: 'var(--success)' }}>¥{usage.balance.toFixed(2)}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>剩余余额</div>
                </div>
                <div className="api-config-section" style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: 24, fontWeight: 700, color: 'var(--accent)' }}>¥{usage.totalSpent.toFixed(2)}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>已消费</div>
                </div>
                <div className="api-config-section" style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: 24, fontWeight: 700 }}>¥{usage.totalTopped.toFixed(2)}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>总充值</div>
                </div>
                <div className="api-config-section" style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: 24, fontWeight: 700 }}>{(totalInputTokens + totalOutputTokens).toLocaleString()}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>Token 总量</div>
                </div>
              </div>

              {/* Progress bar */}
              <div className="api-config-section" style={{ marginBottom: 20, padding: 16 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8, fontSize: 12 }}>
                  <span style={{ color: 'var(--text-muted)' }}>消费占比</span>
                  <span style={{ color: (spentPercent || 0) > 80 ? '#ef4444' : 'var(--accent)', fontWeight: 600 }}>{(spentPercent || 0).toFixed(1)}%</span>
                </div>
                <div style={{ height: 8, background: 'rgba(255,255,255,0.04)', borderRadius: 4, overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${Math.min(spentPercent || 0, 100)}%`, background: (spentPercent || 0) > 80 ? 'linear-gradient(90deg,#ef4444,#f87171)' : 'linear-gradient(90deg,#6366f1,#818cf8)', borderRadius: 4, transition: 'width .5s' }} />
                </div>
              </div>

              {/* 7-day chart */}
              {dailyList.length > 0 && (
                <div className="api-config-section" style={{ marginBottom: 20, padding: 20 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 14 }}>📈 近七天消费趋势</div>
                  <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, height: 100 }}>
                    {dailyList.map((d, i) => (
                      <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                        <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>¥{d.cost.toFixed(2)}</span>
                        <div style={{ width: '100%', height: `${(d.cost / maxDaily) * 70}px`, background: 'linear-gradient(180deg,var(--accent),rgba(99,102,241,0.2))', borderRadius: '3px 3px 0 0', minHeight: 2 }} />
                        <span style={{ fontSize: 9, color: 'var(--text-muted)' }}>{d.date.slice(5)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Model usage */}
              {modelUsage.length > 0 && (
                <div className="api-config-section" style={{ marginBottom: 20, padding: 20 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 14 }}>🤖 模型用量</div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
                    <div className="api-config-section" style={{ textAlign: 'center', padding: 14 }}>
                      <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--accent)' }}>{totalInputTokens.toLocaleString()}</div>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>输入 Token</div>
                    </div>
                    <div className="api-config-section" style={{ textAlign: 'center', padding: 14 }}>
                      <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--success)' }}>{totalOutputTokens.toLocaleString()}</div>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>输出 Token</div>
                    </div>
                  </div>
                  {modelUsage.map(m => (
                    <div key={m.name} style={{ marginBottom: 12 }}>
                      <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 6 }}>{m.name}</div>
                      <div style={{ display: 'flex', gap: 12 }}>
                        <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{ fontSize: 11, color: 'var(--text-muted)', width: 50 }}>输入</span>
                          <div style={{ flex: 1, height: 18, background: 'rgba(255,255,255,0.03)', borderRadius: 3, overflow: 'hidden' }}>
                            <div style={{ height: '100%', width: `${((m.inputTokens + m.outputTokens) / modelMaxTokens) * 100 * (m.inputTokens / (m.inputTokens + m.outputTokens || 1))}%`, background: 'linear-gradient(90deg,#6366f1,#818cf8)', borderRadius: 3, minWidth: 2 }} />
                          </div>
                          <span style={{ fontSize: 10, color: 'var(--text-muted)', width: 60 }}>{m.inputTokens.toLocaleString()}</span>
                        </div>
                        <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{ fontSize: 11, color: 'var(--text-muted)', width: 50 }}>输出</span>
                          <div style={{ flex: 1, height: 18, background: 'rgba(255,255,255,0.03)', borderRadius: 3, overflow: 'hidden' }}>
                            <div style={{ height: '100%', width: `${((m.inputTokens + m.outputTokens) / modelMaxTokens) * 100 * (m.outputTokens / (m.inputTokens + m.outputTokens || 1))}%`, background: 'linear-gradient(90deg,#22c55e,#4ade80)', borderRadius: 3, minWidth: 2 }} />
                          </div>
                          <span style={{ fontSize: 10, color: 'var(--text-muted)', width: 60 }}>{m.outputTokens.toLocaleString()}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <div style={{ textAlign: 'center', fontSize: 11, color: 'var(--text-muted)', marginTop: 8 }}>
                {usage.lastUpdate ? `最近更新：${new Date(usage.lastUpdate).toLocaleString()}` : ''}
                · 每 10 分钟自动刷新
              </div>
            </>
          )}
        </>
      )}

      {showSettings && (
        <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) setShowSettings(false) }}>
          <div className="prompts-modal" style={{ width: 460 }} onClick={e => e.stopPropagation()}>
            <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ fontSize: 15, fontWeight: 600 }}>⚙️ 数据看板设置</h3>
              <button className="btn btn-ghost btn-sm" onClick={() => setShowSettings(false)}><X size={14} /></button>
            </div>
            <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label className="label" style={{ marginBottom: 4, display: 'block' }}>DeepSeek API Key</label>
                <input className="input-base" type="password" value={apiKey} onChange={async e => {
                  setApiKey(e.target.value)
                  if (window.electronAPI) {
                    const models = await window.electronAPI.getStore('customModels')
                    let list = Array.isArray(models) ? models : []
                    const idx = list.findIndex((m: any) => m.name === 'DeepSeek')
                    if (idx >= 0) list[idx] = { ...list[idx], apiKey: e.target.value }
                    else list.push({ name: 'DeepSeek', apiKey: e.target.value, endpoint: 'https://api.deepseek.com/v1', modelName: 'deepseek-chat' })
                    await window.electronAPI.setStore('customModels', list)
                  }
                }} placeholder="sk-..." />
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
                  API Key 用于查询余额。用量 Token 暂需通过网页登录获取，将跳转 DeepSeek 平台。
                </div>
              </div>
              <div>
                <label className="label" style={{ marginBottom: 4, display: 'block' }}>网页登录同步用量</label>
                <button className="btn btn-ghost" style={{ width: '100%' }} onClick={() => {
                  if (window.electronAPI) window.electronAPI.openExternal('https://platform.deepseek.com/usage')
                }}>
                  打开 DeepSeek 平台
                </button>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
                  点击后在浏览器中登录 DeepSeek，即可查看详细用量数据。余额数据由 API Key 直接获取。
                </div>
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <button className="btn btn-primary" onClick={() => setShowSettings(false)}>完成</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
