import { useState, useEffect, useCallback, useRef } from 'react'
import { RefreshCw, Settings, X, ArrowLeft, CreditCard, SunMedium, CalendarDays, Brain, Zap, BarChart3, KeyRound } from 'lucide-react'

interface BalanceData { isAvailable: boolean; currency: string; totalBalance: string; toppedUpBalance: string }
interface UsageModel { key: string; name: string; totalTokens: number; requestCount: number; cost: number; cacheHitTokens: number; cacheMissTokens: number; responseTokens: number }
interface UsageDay { date: string; flashTokens: number; proTokens: number; totalTokens: number; totalCost: number }
interface UsageResult { models: UsageModel[]; days: UsageDay[]; monthCost: number }

type Page = 'dashboard' | 'settings' | 'detail'
type ModelKey = 'flash' | 'pro'

const fmtInt = (n: number) => Math.round(n).toLocaleString()
const fmtMoney = (n: number) => '¥' + n.toFixed(2)
const mmdd = (d: string) => { const p = d.split('-'); return p.length === 3 ? `${+p[1]}/${+p[2]}` : d }

function recent7Days(days: UsageDay[]): UsageDay[] {
  const map = new Map(days.map(d => [d.date, d]))
  const now = new Date()
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(now); d.setDate(d.getDate() - 6 + i)
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    return map.get(key) || { date: key, flashTokens: 0, proTokens: 0, totalTokens: 0, totalCost: 0 }
  })
}

export default function Dashboard() {
  const [page, setPage] = useState<Page>('dashboard')
  const [detailModel, setDetailModel] = useState<ModelKey>('flash')
  const [apiKey, setApiKey] = useState('')
  const [balance, setBalance] = useState<BalanceData | null>(null)
  const [balanceState, setBalanceState] = useState<'loading' | 'ok' | 'error' | 'nokey'>('loading')
  const [usage, setUsage] = useState<UsageResult | null>(null)
  const [usageState, setUsageState] = useState<'loading' | 'ok' | 'error' | 'nokey'>('loading')
  const [platformToken, setPlatformToken] = useState('')
  const [configPath, setConfigPath] = useState('')
  const timerRef = useRef<ReturnType<typeof setInterval>>()

  const loadApiKey = useCallback(async () => {
    if (window.electronAPI) {
      const models = await window.electronAPI.getStore('customModels')
      if (Array.isArray(models)) {
        const ds = models.find((m: any) => m.name && m.name.toLowerCase().includes('deepseek'))
        if (ds?.apiKey) setApiKey(ds.apiKey)
      }
      const pt = await window.electronAPI.getStore('dsPlatformToken')
      if (typeof pt === 'string') setPlatformToken(pt)
      try { setConfigPath((await window.electronAPI.getStore('configPath')) || '') } catch {}
    }
  }, [])

  const fetchBalance = useCallback(async () => {
    if (!apiKey) { setBalanceState('nokey'); return }
    setBalanceState('loading')
    try {
      const res = await fetch('https://api.deepseek.com/user/balance', { headers: { Authorization: `Bearer ${apiKey}` } })
      if (!res.ok) throw new Error('查询失败')
      const data = await res.json()
      const infos = data.balance_infos || []
      let total = 0, topped = 0
      for (const info of infos) { total += +info.total_balance; topped += +info.topped_up_balance }
      setBalance({ isAvailable: data.is_available ?? total > 0, currency: infos[0]?.currency || 'CNY', totalBalance: total.toFixed(2), toppedUpBalance: topped.toFixed(2) })
      setBalanceState('ok')
    } catch { setBalanceState('error') }
  }, [apiKey])

  const fetchUsage = useCallback(async () => {
    if (!platformToken) { setUsageState('nokey'); return }
    setUsageState('loading')
    try {
      const res = await fetch('https://platform.deepseek.com/api/v1/usage/summary', {
        headers: { Authorization: `Bearer ${platformToken}` }
      })
      if (!res.ok) throw new Error('查询失败')
      const data = await res.json()
      const models: UsageModel[] = (data.models || []).map((m: any) => ({
        key: (m.model || '').toLowerCase().includes('pro') ? 'pro' : 'flash',
        name: m.model || '', totalTokens: (m.total_tokens || 0),
        requestCount: m.request_count || 0, cost: m.cost || 0,
        cacheHitTokens: m.cache_hit_tokens || 0, cacheMissTokens: m.cache_miss_tokens || 0,
        responseTokens: m.completion_tokens || 0,
      }))
      const days: UsageDay[] = (data.days || data.daily || []).map((d: any) => ({
        date: d.date || d.day, flashTokens: d.flash_tokens || 0, proTokens: d.pro_tokens || 0,
        totalTokens: (d.total_tokens || 0), totalCost: d.total_cost || d.cost || 0,
      }))
      setUsage({ models, days, monthCost: data.month_cost || data.total_cost || 0 })
      setUsageState('ok')
    } catch { setUsageState('error') }
  }, [platformToken])

  const refreshAll = useCallback(() => { fetchBalance(); fetchUsage() }, [fetchBalance, fetchUsage])

  useEffect(() => { loadApiKey() }, [loadApiKey])
  useEffect(() => { if (apiKey) { refreshAll(); timerRef.current = setInterval(refreshAll, 300000) }; return () => { if (timerRef.current) clearInterval(timerRef.current) } }, [apiKey])

  const flash = usage?.models.find(m => m.key === 'flash') || null
  const pro = usage?.models.find(m => m.key === 'pro') || null
  const maxTokens = Math.max(flash?.totalTokens || 0, pro?.totalTokens || 0, 1)
  const today = usage?.days.find(d => d.date === new Date().toISOString().slice(0, 10)) || null

  if (page === 'detail') {
    const isFlash = detailModel === 'flash'
    const data = isFlash ? flash : pro
    const title = isFlash ? 'V4 Flash' : 'V4 Pro'
    const points = recent7Days(usage?.days || []).map(d => ({ date: d.date, value: isFlash ? d.flashTokens : d.proTokens }))
    const maxVal = Math.max(...points.map(p => p.value), 1)

    return (
      <div style={{ padding: 24, height: '100%', overflow: 'auto', background: 'var(--bg-primary)' }}>
        <div style={{ marginBottom: 16 }}><span style={{ fontSize: 13, color: 'var(--accent)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }} onClick={() => setPage('dashboard')}><ArrowLeft size={14} /> 返回</span></div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '18px 20px', borderRadius: 12, background: 'var(--bg-card)', border: '1px solid var(--border-color)', marginBottom: 16 }}>
          <div style={{ width: 52, height: 52, borderRadius: 12, background: isFlash ? 'rgba(245,158,11,0.12)' : 'rgba(99,102,241,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 28 }}>
            {isFlash ? <Zap size={30} fill="#f59e0b" color="#f59e0b" /> : <Brain size={28} color="#6366f1" />}
          </div>
          <div><h2 style={{ fontSize: 16, fontWeight: 700 }}>{title}</h2><div style={{ fontSize: 18, fontWeight: 700, color: isFlash ? '#f59e0b' : 'var(--accent)' }}>{data ? fmtMoney(data.cost) : '—'}</div></div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
          <div className="api-config-section" style={{ textAlign: 'center', padding: 16 }}>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>请求次数</div>
            <div style={{ fontSize: 20, fontWeight: 700, color: isFlash ? '#f59e0b' : 'var(--accent)' }}>{data ? fmtInt(data.requestCount) : '—'}</div>
          </div>
          <div className="api-config-section" style={{ textAlign: 'center', padding: 16 }}>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>Token 总量</div>
            <div style={{ fontSize: 20, fontWeight: 700 }}>{data ? fmtInt(data.totalTokens) : '—'}</div>
          </div>
        </div>

        <div className="api-config-section" style={{ padding: 20 }}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 16, display: 'flex', justifyContent: 'space-between' }}>
            <span>按日 Token 消耗</span>
            <span style={{ color: 'var(--accent)' }}>{data ? fmtInt(data.totalTokens) : ''}</span>
          </div>
          {usageState === 'ok' && points.length > 0 ? (
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, height: 120 }}>
              {points.map((p, i) => (
                <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                  <span style={{ fontSize: 10, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{p.value > 0 ? (p.value >= 1e6 ? (p.value / 1e6).toFixed(1) + 'M' : p.value >= 1e3 ? (p.value / 1e3).toFixed(1) + 'K' : String(p.value)) : ''}</span>
                  <div style={{ width: '100%', height: `${Math.max(6, (p.value / maxVal) * 100 * 0.85)}px`, background: isFlash ? 'linear-gradient(180deg,#f59e0b,rgba(245,158,11,0.15))' : 'linear-gradient(180deg,#6366f1,rgba(99,102,241,0.15))', borderRadius: '4px 4px 0 0' }} />
                  <span style={{ fontSize: 9, color: 'var(--text-muted)' }}>{mmdd(p.date)}</span>
                </div>
              ))}
            </div>
          ) : <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 30 }}>{usageState === 'nokey' ? '未配置' : usageState === 'loading' ? '查询中…' : '暂无数据'}</div>}
        </div>
      </div>
    )
  }

  if (page === 'settings') {
    return (
      <div style={{ padding: 24, height: '100%', overflow: 'auto' }}>
        <div style={{ marginBottom: 16 }}><span style={{ fontSize: 13, color: 'var(--accent)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }} onClick={() => setPage('dashboard')}><ArrowLeft size={14} /> 返回</span></div>
        <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 20 }}>⚙️ 设置</h2>

        <div className="api-config-section" style={{ padding: 20, marginBottom: 16 }}>
          <h4 style={{ fontSize: 13, fontWeight: 600, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6 }}><KeyRound size={14} /> API Key</h4>
          <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 8 }}>用于调用 DeepSeek API 获取余额和用量数据，保存在本地配置中。</p>
          <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
            <input className="input-base" style={{ flex: 1 }} type="password" value={apiKey} onChange={async e => {
              setApiKey(e.target.value)
              if (window.electronAPI) {
                const models = await window.electronAPI.getStore('customModels')
                let list = Array.isArray(models) ? models : []
                const idx = list.findIndex((m: any) => m.name === 'DeepSeek')
                const item = { name: 'DeepSeek', apiKey: e.target.value, endpoint: 'https://api.deepseek.com/v1', modelName: 'deepseek-chat' }
                if (idx >= 0) list[idx] = item; else list.push(item)
                await window.electronAPI.setStore('customModels', list)
              }
            }} placeholder={apiKey ? '••••••••••••••••••••••••••••••••••••' : 'sk-...'} />
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <button className="btn btn-primary btn-sm" onClick={refreshAll}>验证并保存</button>
            <span style={{ fontSize: 11, color: apiKey ? 'var(--success)' : 'var(--text-muted)' }}>{apiKey ? '已配置' : '未配置'}</span>
          </div>
        </div>

        <div className="api-config-section" style={{ padding: 20 }}>
          <h4 style={{ fontSize: 13, fontWeight: 600, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6 }}><BarChart3 size={14} /> 用量同步 Token</h4>
          <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 8 }}>DeepSeek 用量详情需网页登录 token（与 API Key 不同）。</p>
          <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 8 }}>获取方式：浏览器登录 <a href="#" onClick={e => { e.preventDefault(); if (window.electronAPI) window.electronAPI.openExternal('https://platform.deepseek.com/usage') }} style={{ color: 'var(--accent)' }}>platform.deepseek.com</a>，F12 控制台输入：<code style={{ background: 'rgba(99,102,241,0.1)', padding: '2px 6px', borderRadius: 4, fontSize: 11 }}>JSON.parse(localStorage.userToken).value</code></p>
          <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
            <input className="input-base" style={{ flex: 1 }} type="password" value={platformToken} onChange={async e => {
              setPlatformToken(e.target.value)
              if (window.electronAPI) await window.electronAPI.setStore('dsPlatformToken', e.target.value)
            }} placeholder={platformToken ? '••••••••••••••••••••••••••••••••••' : '粘贴 token...'} />
            <button className="btn btn-primary btn-sm" onClick={async () => {
              if (!platformToken) return
              setPage('dashboard')
              await fetchUsage()
            }}>保存并刷新</button>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 4 }}>
            <span style={{ fontSize: 11, color: platformToken ? 'var(--success)' : 'var(--text-muted)' }}>{platformToken ? '已配置' : '未配置（仅可查看余额）'}</span>
            {platformToken && <button className="btn btn-ghost btn-sm" style={{ fontSize: 11 }} onClick={async () => { setPlatformToken(''); if (window.electronAPI) await window.electronAPI.setStore('dsPlatformToken', ''); setUsage(null); setUsageState('nokey') }}>清除 Token</button>}
          </div>
        </div>
      </div>
    )
  }

  // === DASHBOARD ===
  return (
    <div style={{ padding: 24, height: '100%', overflow: 'auto', background: 'var(--bg-primary)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 24 }}>🔵</span>
          <h1 style={{ fontSize: 16, fontWeight: 700 }}>DeepSeek Monitor</h1>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-ghost" onClick={refreshAll}><RefreshCw size={14} /></button>
          <button className="btn btn-ghost" onClick={() => setPage('settings')}><Settings size={14} /></button>
        </div>
      </div>

      {/* Balance card */}
      <div className="api-config-section" style={{ padding: 20, marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}><CreditCard size={15} /><span>账户余额</span></div>
          <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, padding: '2px 10px', borderRadius: 10, background: balance?.isAvailable ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)', color: balance?.isAvailable ? 'var(--success)' : '#ef4444' }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: balance?.isAvailable ? 'var(--success)' : '#ef4444' }} />{balance?.isAvailable ? '可用' : '余额不足'}
          </span>
        </div>
        <div style={{ fontSize: 32, fontWeight: 700, marginBottom: 14, color: balanceState === 'ok' ? 'var(--text)' : 'var(--text-muted)' }}>
          {balanceState === 'loading' ? '查询中…' : balanceState === 'nokey' ? '未配置' : balanceState === 'error' ? '查询失败' : `${balance?.currency === 'USD' ? '$' : '¥'}${balance?.totalBalance || '0.00'}`}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div style={{ padding: 12, background: 'var(--bg-card)', borderRadius: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: '#f59e0b', marginBottom: 4 }}><SunMedium size={13} /> 当日消耗</div>
            <strong>{today ? fmtMoney(today.totalCost) : '—'}</strong>
          </div>
          <div style={{ padding: 12, background: 'var(--bg-card)', borderRadius: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: '#f59e0b', marginBottom: 4 }}><CalendarDays size={13} /> 本月消费</div>
            <strong>{usageState === 'ok' && usage ? fmtMoney(usage.monthCost) : '—'}</strong>
          </div>
        </div>
      </div>

      {/* Model cards */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 16 }}>
        {(['flash', 'pro'] as ModelKey[]).map(k => {
          const d = k === 'flash' ? flash : pro
          const isFlash = k === 'flash'
          return (
            <div key={k} className="api-config-section" style={{ padding: '14px 18px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 14 }} onClick={() => { setDetailModel(k); setPage('detail') }}>
              <div style={{ width: 44, height: 44, borderRadius: 10, background: isFlash ? 'rgba(245,158,11,0.12)' : 'rgba(99,102,241,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22 }}>
                {isFlash ? <Zap size={24} fill="#f59e0b" color="#f59e0b" /> : <Brain size={22} color="#6366f1" />}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600, marginBottom: 4 }}>{isFlash ? 'V4 Flash' : 'V4 Pro'}</div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span>{d ? `${fmtInt(d.totalTokens)} Tokens` : '—'}</span>
                  <div style={{ flex: 1, height: 4, background: 'rgba(255,255,255,0.06)', borderRadius: 2 }}>
                    <div style={{ height: '100%', width: `${d ? Math.max(2, (d.totalTokens / maxTokens) * 100) : 0}%`, background: isFlash ? 'linear-gradient(90deg,#f59e0b,#fbbf24)' : 'linear-gradient(90deg,#6366f1,#818cf8)', borderRadius: 2 }} />
                  </div>
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontWeight: 700 }}>{d ? fmtMoney(d.cost) : '—'}</div>
              </div>
            </div>
          )
        })}
      </div>

      {/* Trend chart */}
      <div className="api-config-section" style={{ padding: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 600 }}><BarChart3 size={14} color="var(--accent)" /> 消耗趋势</div>
        </div>
        {usageState === 'ok' && usage && usage.days.length > 0 ? (
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, height: 100 }}>
            {recent7Days(usage.days).map((d, i) => {
              const max = Math.max(...recent7Days(usage.days).map(x => x.totalTokens), 1)
              return (
                <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                  <span style={{ fontSize: 10, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{d.totalTokens > 0 ? (d.totalTokens >= 1e6 ? (d.totalTokens / 1e6).toFixed(0) + 'M' : d.totalTokens >= 1e3 ? (d.totalTokens / 1e3).toFixed(1) + 'K' : String(d.totalTokens)) : ''}</span>
                  <div style={{ width: '100%', height: `${Math.max(6, (d.totalTokens / max) * 100 * 0.75)}px`, background: 'linear-gradient(180deg,var(--accent),rgba(99,102,241,0.15))', borderRadius: '4px 4px 0 0' }} />
                  <span style={{ fontSize: 9, color: 'var(--text-muted)' }}>{mmdd(d.date)}</span>
                </div>
              )
            })}
          </div>
        ) : (
          <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 30 }}>
            {usageState === 'nokey' ? '未配置 API Key' : usageState === 'loading' ? '查询中…' : usageState === 'error' ? '查询失败' : '暂无数据'}
          </div>
        )}
      </div>
    </div>
  )
}
