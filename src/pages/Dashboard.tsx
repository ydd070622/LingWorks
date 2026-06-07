import { useState, useEffect, useCallback, useRef } from 'react'
import { RefreshCw, Settings, X, ArrowLeft, CreditCard, SunMedium, CalendarDays, Brain, Zap, BarChart3, KeyRound } from 'lucide-react'

interface BalanceData { isAvailable: boolean; currency: string; totalBalance: string; toppedUpBalance: string }
interface UsageModel { key: string; name: string; totalTokens: number; requestCount: number; cost: number; cacheHitTokens: number; cacheMissTokens: number; responseTokens: number }
interface UsageDay { date: string; flashTokens: number; proTokens: number; totalTokens: number; totalCost: number }
interface UsageResult { models: UsageModel[]; days: UsageDay[]; monthCost: number }
interface HistoryMonth { month: string; cost: number; tokens: number }

type Page = 'dashboard' | 'settings'

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

const headersWithToken = (token: string): Record<string, string> => ({
  Authorization: `Bearer ${token}`,
  'x-app-version': '1.0.0', Accept: '*/*',
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36',
})

async function fetchMonthUsage(token: string, month: number, year: number): Promise<UsageResult | null> {
  try {
    const h = headersWithToken(token)
    const [amountRes, costRes] = await Promise.all([
      fetch(`https://platform.deepseek.com/api/v0/usage/amount?month=${month}&year=${year}`, { headers: h }),
      fetch(`https://platform.deepseek.com/api/v0/usage/cost?month=${month}&year=${year}`, { headers: h }),
    ])
    if (!amountRes.ok || !costRes.ok) return null
    const am = await amountRes.json(); const co = await costRes.json()

    const costTotal = co?.data?.biz_data?.[0]
    const costByDate: Record<string, number> = {}
    if (costTotal) for (const d of (costTotal.days || [])) costByDate[d.date] = (d.data || []).reduce((s: number, m: any) => s + (m.usage || []).filter((e: any) => e.type !== 'REQUEST').reduce((ss: number, ee: any) => ss + (+ee.amount || 0), 0), 0)

    const costForModel = (model: string) => {
      if (!costTotal) return 0
      const m = (costTotal.total || []).find((x: any) => x.model === model)
      return m ? (m.usage || []).filter((e: any) => e.type !== 'REQUEST').reduce((s: number, e: any) => s + (+e.amount || 0), 0) : 0
    }

    const models: UsageModel[] = []
    for (const mu of (am?.data?.biz_data?.total || [])) {
      if (mu.model !== 'deepseek-v4-flash' && mu.model !== 'deepseek-v4-pro') continue
      let total = 0, request = 0, hit = 0, miss = 0, response = 0
      for (const e of (mu.usage || [])) {
        const v = Math.round(+e.amount || 0)
        switch (e.type) { case 'REQUEST': request = v; break; case 'PROMPT_CACHE_HIT_TOKEN': hit = v; total += v; break; case 'PROMPT_CACHE_MISS_TOKEN': miss = v; total += v; break; case 'RESPONSE_TOKEN': response = v; total += v; break; case 'PROMPT_TOKEN': total += v; break }
      }
      models.push({ key: mu.model === 'deepseek-v4-flash' ? 'flash' : 'pro', name: mu.model === 'deepseek-v4-flash' ? 'V4 Flash' : 'V4 Pro', totalTokens: total, requestCount: request, cost: costForModel(mu.model), cacheHitTokens: hit, cacheMissTokens: miss, responseTokens: response })
    }

    const days: UsageDay[] = (am?.data?.biz_data?.days || []).map((d: any) => {
      let flash = 0, pro = 0, total = 0
      for (const mu of (d.data || [])) {
        let tokens = 0
        for (const e of (mu.usage || [])) {
          if (['PROMPT_CACHE_HIT_TOKEN', 'PROMPT_CACHE_MISS_TOKEN', 'RESPONSE_TOKEN', 'PROMPT_TOKEN'].includes(e.type)) {
            tokens += Math.round(parseFloat(e.amount) || 0)
          }
        }
        total += tokens
        if (mu.model === 'deepseek-v4-flash') flash = tokens
        else if (mu.model === 'deepseek-v4-pro') pro = tokens
      }
      return { date: d.date, flashTokens: flash, proTokens: pro, totalTokens: total, totalCost: costByDate[d.date] || 0 }
    })

    const monthCost = costTotal ? (costTotal.total || []).reduce((s: number, m: any) => s + (m.usage || []).filter((e: any) => e.type !== 'REQUEST').reduce((ss: number, ee: any) => ss + (+ee.amount || 0), 0), 0) : 0
    return { models, days, monthCost }
  } catch { return null }
}

export default function Dashboard() {
  const [page, setPage] = useState<Page>('dashboard')
  const [apiKey, setApiKey] = useState('')
  const [platformToken, setPlatformToken] = useState('')
  const [balance, setBalance] = useState<BalanceData | null>(null)
  const [usage, setUsage] = useState<UsageResult | null>(null)
  const [history, setHistory] = useState<HistoryMonth[]>([])
  const [loading, setLoading] = useState(false)
  const timerRef = useRef<ReturnType<typeof setInterval>>()

  const loadConfig = useCallback(async () => {
    if (window.electronAPI) {
      const models = await window.electronAPI.getStore('customModels')
      if (Array.isArray(models)) { const ds = models.find((m: any) => m.name?.toLowerCase().includes('deepseek')); if (ds?.apiKey) setApiKey(ds.apiKey) }
      const pt = await window.electronAPI.getStore('dsPlatformToken'); if (typeof pt === 'string') setPlatformToken(pt)
    }
  }, [])

  const fetchBalance = useCallback(async () => {
    if (!apiKey) return
    try {
      const res = await fetch('https://api.deepseek.com/user/balance', { headers: { Authorization: `Bearer ${apiKey}` } })
      if (res.ok) {
        const data = await res.json(); const infos = data.balance_infos || []
        let total = 0, topped = 0; for (const i of infos) { total += +i.total_balance; topped += +i.topped_up_balance }
        setBalance({ isAvailable: data.is_available ?? total > 0, currency: infos[0]?.currency || 'CNY', totalBalance: total.toFixed(2), toppedUpBalance: topped.toFixed(2) })
      }
    } catch {}
  }, [apiKey])

  const fetchAllData = useCallback(async () => {
    if (!platformToken) return
    setLoading(true)
    const now = new Date()
    const current = await fetchMonthUsage(platformToken, now.getMonth() + 1, now.getFullYear())
    if (current) setUsage(current)

    const hist: HistoryMonth[] = []
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
      const result = await fetchMonthUsage(platformToken, d.getMonth() + 1, d.getFullYear())
      if (result) hist.push({ month: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`, cost: result.monthCost, tokens: result.days.reduce((s, day) => s + day.totalTokens, 0) })
    }
    setHistory(hist)
    setLoading(false)
  }, [platformToken])

  useEffect(() => { loadConfig() }, [loadConfig])
  useEffect(() => { if (apiKey) { fetchBalance(); timerRef.current = setInterval(fetchBalance, 300000) }; return () => { if (timerRef.current) clearInterval(timerRef.current) } }, [apiKey])
  useEffect(() => { if (platformToken) fetchAllData() }, [platformToken])

  const flash = usage?.models.find(m => m.key === 'flash') || null
  const pro = usage?.models.find(m => m.key === 'pro') || null
  const maxTokens = Math.max(flash?.totalTokens || 0, pro?.totalTokens || 0, 1)
  const today = usage?.days.find(d => d.date === new Date().toISOString().slice(0, 10)) || null
  const recentDays = recent7Days(usage?.days || [])
  const maxDailyToken = Math.max(...recentDays.map(d => d.totalTokens), 1)
  const maxDailyCost = Math.max(...recentDays.map(d => d.totalCost), 0.01)
  const histMaxCost = Math.max(...history.map(h => h.cost), 1)
  const totalHistCost = history.reduce((s, h) => s + h.cost, 0)
  const totalHistTokens = history.reduce((s, h) => s + h.tokens, 0)

  // Token format
  const fmtShort = (n: number) => n >= 1e6 ? (n / 1e6).toFixed(1) + 'M' : n >= 1e3 ? (n / 1e3).toFixed(1) + 'K' : String(n)

  if (page === 'settings') {
    return (
      <div style={{ maxWidth: 500, margin: '0 auto', padding: 24 }}>
        <div style={{ marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 13, color: 'var(--accent)', cursor: 'pointer' }} onClick={() => setPage('dashboard')}><ArrowLeft size={14} /> 返回</span>
        </div>
        <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 20 }}>⚙️ 设置</h2>

        <div className="api-config-section" style={{ padding: 20, marginBottom: 16 }}>
          <h4 style={{ fontSize: 13, fontWeight: 600, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6 }}><KeyRound size={14} /> API Key（余额查询）</h4>
          <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 8 }}>用于查询 DeepSeek 账户余额。</p>
          <div style={{ display: 'flex', gap: 8 }}>
            <input className="input-base" style={{ flex: 1 }} type="password" value={apiKey} onChange={async e => {
              setApiKey(e.target.value)
              if (window.electronAPI) { const models = await window.electronAPI.getStore('customModels'); let list = Array.isArray(models) ? models : []; const idx = list.findIndex((m: any) => m.name === 'DeepSeek'); const item = { name: 'DeepSeek', apiKey: e.target.value, endpoint: 'https://api.deepseek.com/v1', modelName: 'deepseek-chat' }; if (idx >= 0) list[idx] = item; else list.push(item); await window.electronAPI.setStore('customModels', list) }
            }} placeholder={apiKey ? '••••••••••••••••••••' : 'sk-...'} />
            <button className="btn btn-primary btn-sm" onClick={fetchBalance}>验证</button>
          </div>
          <div style={{ fontSize: 11, color: apiKey ? 'var(--success)' : 'var(--text-muted)', marginTop: 6 }}>{apiKey ? '已配置' : '未配置'}</div>
        </div>

        <div className="api-config-section" style={{ padding: 20 }}>
          <h4 style={{ fontSize: 13, fontWeight: 600, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6 }}><BarChart3 size={14} /> 用量 Token（趋势+模型数据）</h4>
          <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 8 }}>用于同步 Token 用量和费用趋势。登录后自动提取。</p>
          <button className="btn btn-primary btn-sm" style={{ marginBottom: 8 }} onClick={async () => {
            if (window.electronAPI) { const token = await window.electronAPI.dsLogin(); if (token) { setPlatformToken(token); await window.electronAPI.setStore('dsPlatformToken', token) } }
          }}>🔐 网页登录自动提取</button>
          <div style={{ display: 'flex', gap: 8 }}>
            <input className="input-base" style={{ flex: 1 }} type="password" value={platformToken} onChange={async e => { setPlatformToken(e.target.value); if (window.electronAPI) await window.electronAPI.setStore('dsPlatformToken', e.target.value) }} placeholder={platformToken ? '已提取' : '或手动粘贴'} />
            <button className="btn btn-primary btn-sm" onClick={fetchAllData} disabled={!platformToken}>刷新</button>
          </div>
          <div style={{ fontSize: 11, color: platformToken ? 'var(--success)' : 'var(--text-muted)', marginTop: 6 }}>{platformToken ? '已配置' : '未配置（仅可查余额）'}</div>
        </div>
      </div>
    )
  }

  // Cost curve SVG points
  const costPoints = recentDays.map((d, i) => {
    const x = 10 + (i / Math.max(recentDays.length - 1, 1)) * 560
    const y = 100 - (d.totalCost / maxDailyCost) * 90
    return `${x},${y}`
  }).join(' ')

  const cumPoints = recentDays.reduce((acc, d, i) => {
    const cum = recentDays.slice(0, i + 1).reduce((s, dd) => s + dd.totalCost, 0)
    const x = 10 + (i / Math.max(recentDays.length - 1, 1)) * 560
    const y = 100 - (cum / (maxDailyCost * recentDays.length)) * 90
    acc.push(`${x},${y}`); return acc
  }, [] as string[]).join(' ')

  return (
    <div style={{ height: '100%', overflow: 'auto', background: 'var(--bg-primary)' }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18, maxWidth: 1080, margin: '0 auto', padding: '20px 20px 0 20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 15, fontWeight: 700 }}>
          🔵 DeepSeek Monitor
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button className="btn btn-ghost btn-sm" onClick={() => { fetchBalance(); fetchAllData() }} disabled={loading}><RefreshCw size={14} style={loading ? { animation: 'spin 1s infinite linear' } : {}} /></button>
          <button className="btn btn-ghost btn-sm" onClick={() => setPage('settings')}><Settings size={14} /></button>
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18, maxWidth: 1080, margin: '0 auto', padding: '0 20px 20px 20px' }}>
        {/* ===== LEFT ===== */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, height: '100%' }}>

          {/* Balance */}
          <div className="api-config-section" style={{ padding: 18 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8, fontSize: 12, color: 'var(--text-muted)', alignItems: 'center' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><CreditCard size={14} /> 账户余额</span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, padding: '2px 10px', borderRadius: 10, background: balance?.isAvailable ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)', color: balance?.isAvailable ? 'var(--success)' : '#ef4444' }}>
                <span style={{ width: 5, height: 5, borderRadius: '50%', background: balance?.isAvailable ? 'var(--success)' : '#ef4444' }} />{balance?.isAvailable ? '可用' : '不足'}
              </span>
            </div>
            <div style={{ fontSize: 26, fontWeight: 700, marginBottom: 12 }}>{balance ? `${balance.currency === 'USD' ? '$' : '¥'}${balance.totalBalance}` : '查询中…'}</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div style={{ background: 'var(--bg-card)', borderRadius: 8, padding: 10, textAlign: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4, fontSize: 11, color: '#f59e0b', marginBottom: 2 }}><SunMedium size={13} /> 当日</div>
                <div style={{ fontWeight: 700 }}>{today ? fmtMoney(today.totalCost) : '—'}</div>
              </div>
              <div style={{ background: 'var(--bg-card)', borderRadius: 8, padding: 10, textAlign: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4, fontSize: 11, color: '#f59e0b', marginBottom: 2 }}><CalendarDays size={13} /> 本月</div>
                <div style={{ fontWeight: 700 }}>{usage ? fmtMoney(usage.monthCost) : '—'}</div>
              </div>
            </div>
          </div>

          {/* Models */}
          {[flash, pro].map((m, i) => m && (
            <div key={i} className="api-config-section" style={{ padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ width: 38, height: 38, borderRadius: 10, background: i === 0 ? 'rgba(245,158,11,0.12)' : 'rgba(99,102,241,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>
                {i === 0 ? <Zap size={20} fill="#f59e0b" color="#f59e0b" /> : <Brain size={18} color="#6366f1" />}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 600 }}>{m.name}</div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span>{fmtShort(m.totalTokens)} Tokens</span>
                  <div style={{ flex: 1, height: 4, background: 'rgba(255,255,255,0.06)', borderRadius: 2, overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${Math.max(2, (m.totalTokens / maxTokens) * 100)}%`, background: i === 0 ? 'linear-gradient(90deg,#f59e0b,#fbbf24)' : 'linear-gradient(90deg,#6366f1,#818cf8)', borderRadius: 2 }} />
                  </div>
                </div>
              </div>
              <div style={{ fontWeight: 700, fontSize: 14 }}>{fmtMoney(m.cost)}</div>
            </div>
          ))}

          {/* Token trend */}
          <div className="api-config-section" style={{ padding: 18, marginTop: 'auto', display: 'flex', flexDirection: 'column', flex: 1 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text2)', display: 'flex', alignItems: 'center', gap: 6, marginBottom: 12, flexShrink: 0 }}>
              <BarChart3 size={14} color="var(--accent)" /> 本月 Token 消耗趋势
              {!platformToken && <span style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 400 }}>（需配置用量 Token）</span>}
              {platformToken && loading && <span style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 400, animation: 'spin 1s infinite linear', display: 'inline-block' }}>⟳</span>}
            </div>
            {!platformToken ? (
              <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 16, fontSize: 12 }}>
                点击 <span style={{ color: 'var(--accent)', cursor: 'pointer' }} onClick={() => setPage('settings')}>设置</span> → 网页登录获取用量 Token
              </div>
            ) : loading ? (
              <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 16, fontSize: 13 }}>加载中…</div>
            ) : recentDays.length > 0 ? (
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: 5, flex: 1 }}>
                {recentDays.map((d, i) => (
                  <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
                    <span style={{ fontSize: 9, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{d.totalTokens > 0 ? fmtShort(d.totalTokens) : ''}</span>
                    <div style={{ width: '100%', height: `${Math.max(6, (d.totalTokens / maxDailyToken) * 80)}px`, background: i === recentDays.length - 1 ? 'linear-gradient(180deg,#22c55e,rgba(34,197,94,0.1))' : 'linear-gradient(180deg,#6366f1,rgba(99,102,241,0.1))', borderRadius: '3px 3px 0 0' }} />
                    <span style={{ fontSize: 8, color: i === recentDays.length - 1 ? '#22c55e' : 'var(--text-muted)' }}>{mmdd(d.date)}</span>
                  </div>
                ))}
              </div>
            ) : <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 16, fontSize: 12 }}>{platformToken ? '暂无本月数据，请确认已产生用量' : '请先配置 Token'}</div>}
          </div>
        </div>

        {/* ===== RIGHT ===== */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, height: '100%' }}>

          {/* History stats */}
          <div className="api-config-section" style={{ padding: 18 }}>
            <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 12 }}>📅 历史月用量</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div style={{ background: 'var(--bg-card)', borderRadius: 8, padding: 10, textAlign: 'center' }}>
                <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--accent)' }}>{fmtMoney(totalHistCost)}</div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>累计消费</div>
              </div>
              <div style={{ background: 'var(--bg-card)', borderRadius: 8, padding: 10, textAlign: 'center' }}>
                <div style={{ fontSize: 20, fontWeight: 700 }}>{history.length}</div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>统计月数</div>
              </div>
              <div style={{ background: 'var(--bg-card)', borderRadius: 8, padding: 10, textAlign: 'center' }}>
                <div style={{ fontSize: 20, fontWeight: 700 }}>{fmtShort(totalHistTokens)}</div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>总 Token</div>
              </div>
              <div style={{ background: 'var(--bg-card)', borderRadius: 8, padding: 10, textAlign: 'center' }}>
                <div style={{ fontSize: 20, fontWeight: 700 }}>{fmtMoney(history.length > 0 ? totalHistCost / history.length : 0)}</div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>月均消费</div>
              </div>
            </div>
          </div>

          {/* Monthly trend bars */}
          <div className="api-config-section" style={{ padding: 18, marginTop: 'auto', display: 'flex', flexDirection: 'column', flex: 1 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text2)', display: 'flex', alignItems: 'center', gap: 6, marginBottom: 12 }}>
              📈 月度消费趋势
            </div>
            {history.length > 0 ? (
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, flex: 1 }}>
                {history.map((h, i) => (
                  <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
                    <span style={{ fontSize: 9, color: 'var(--text-muted)' }}>{fmtMoney(h.cost)}</span>
                    <div style={{ width: '100%', height: `${Math.max(6, (h.cost / histMaxCost) * 100)}px`, background: i === history.length - 1 ? 'linear-gradient(180deg,#22c55e,rgba(34,197,94,0.15))' : 'linear-gradient(180deg,#6366f1,rgba(99,102,241,0.1))', borderRadius: '3px 3px 0 0' }} />
                    <span style={{ fontSize: 9, color: i === history.length - 1 ? 'var(--green)' : 'var(--text-muted)' }}>{h.month.slice(5)}月</span>
                  </div>
                ))}
              </div>
            ) : <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 20, fontSize: 13 }}>暂无数据</div>}
          </div>
        </div>
      </div>
    </div>
  )
}
