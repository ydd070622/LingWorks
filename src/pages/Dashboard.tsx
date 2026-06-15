import { useState, useEffect, useCallback, useRef } from 'react'
import { RefreshCw, Settings, X, ArrowLeft, CreditCard, SunMedium, CalendarDays, Brain, Zap, BarChart3, KeyRound } from 'lucide-react'

interface BalanceData { isAvailable: boolean; currency: string; totalBalance: string; toppedUpBalance: string }
interface UsageModel { key: string; name: string; totalTokens: number; requestCount: number; cost: number; cacheHitTokens: number; cacheMissTokens: number; responseTokens: number }
interface UsageDay { date: string; flashTokens: number; proTokens: number; totalTokens: number; totalCost: number; flashCost: number; proCost: number }
interface UsageResult { models: UsageModel[]; days: UsageDay[]; monthCost: number }
interface HistoryMonth { month: string; cost: number; tokens: number; days: UsageDay[] }

type Page = 'dashboard' | 'settings'
type DetailPage =
  | { type: 'monthly'; month: string; days: UsageDay[]; monthCost: number }
  | { type: 'model'; days: UsageDay[] }
  | { type: 'daily'; date: string; days: UsageDay[] }
  | null

const fmtInt = (n: number) => Math.round(n).toLocaleString()
const fmtMoney = (n: number) => '¥' + n.toFixed(2)
const mmdd = (d: string) => { const p = d.split('-'); return p.length === 3 ? `${+p[1]}/${+p[2]}` : d }
const fmtShort = (n: number) => n >= 1e6 ? (n / 1e6).toFixed(1) + 'M' : n >= 1e3 ? (n / 1e3).toFixed(1) + 'K' : String(n)

function recent7Days(days: UsageDay[]): UsageDay[] {
  const map = new Map(days.map(d => [d.date, d]))
  const now = new Date()
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(now); d.setDate(d.getDate() - 6 + i)
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    return map.get(key) || { date: key, flashTokens: 0, proTokens: 0, totalTokens: 0, totalCost: 0, flashCost: 0, proCost: 0 }
  })
}

function getDefaultDays(): UsageDay {
  return { date: '', flashTokens: 0, proTokens: 0, totalTokens: 0, totalCost: 0, flashCost: 0, proCost: 0 }
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
    const costByDateModel: Record<string, { flash: number; pro: number }> = {}
    if (costTotal) {
      for (const d of (costTotal.days || [])) {
        costByDate[d.date] = (d.data || []).reduce((s: number, m: any) => s + (m.usage || []).filter((e: any) => e.type !== 'REQUEST').reduce((ss: number, ee: any) => ss + (+ee.amount || 0), 0), 0)
        let fc = 0, pc = 0
        for (const m of (d.data || [])) {
          const mc = (m.usage || []).filter((e: any) => e.type !== 'REQUEST').reduce((ss: number, ee: any) => ss + (+ee.amount || 0), 0)
          const ml = (m.model || '').toLowerCase()
          if (ml.includes('flash')) fc = mc
          else if (ml.includes('pro')) pc = mc
        }
        costByDateModel[d.date] = { flash: fc, pro: pc }
      }
    }

    const costForModel = (model: string) => {
      if (!costTotal) return 0
      const ml = model.toLowerCase()
      const m = (costTotal.total || []).find((x: any) => (x.model || '').toLowerCase() === ml)
      return m ? (m.usage || []).filter((e: any) => e.type !== 'REQUEST').reduce((s: number, e: any) => s + (+e.amount || 0), 0) : 0
    }

    const models: UsageModel[] = []
    for (const mu of (am?.data?.biz_data?.total || [])) {
      const modelLower = (mu.model || '').toLowerCase()
      if (!modelLower.includes('flash') && !modelLower.includes('pro')) continue
      let total = 0, request = 0, hit = 0, miss = 0, response = 0
      for (const e of (mu.usage || [])) {
        const v = Math.round(+e.amount || 0)
        switch (e.type) { case 'REQUEST': request = v; break; case 'PROMPT_CACHE_HIT_TOKEN': hit = v; total += v; break; case 'PROMPT_CACHE_MISS_TOKEN': miss = v; total += v; break; case 'RESPONSE_TOKEN': response = v; total += v; break; case 'PROMPT_TOKEN': total += v; break }
      }
      models.push({ key: modelLower.includes('flash') ? 'flash' : 'pro', name: modelLower.includes('flash') ? 'V4 Flash' : 'V4 Pro', totalTokens: total, requestCount: request, cost: costForModel(mu.model), cacheHitTokens: hit, cacheMissTokens: miss, responseTokens: response })
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
        const ml = (mu.model || '').toLowerCase()
        if (ml.includes('flash')) flash += tokens
        else if (ml.includes('pro')) pro += tokens
      }
      const cbm = costByDateModel[d.date] || { flash: 0, pro: 0 }
      return { date: d.date, flashTokens: flash, proTokens: pro, totalTokens: total, totalCost: costByDate[d.date] || 0, flashCost: cbm.flash, proCost: cbm.pro }
    })

    const monthCost = costTotal ? (costTotal.total || []).reduce((s: number, m: any) => s + (m.usage || []).filter((e: any) => e.type !== 'REQUEST').reduce((ss: number, ee: any) => ss + (+ee.amount || 0), 0), 0) : 0
    return { models, days, monthCost }
  } catch { return null }
}

export default function Dashboard({ onSelect }: { onSelect?: (id: string) => void }) {
  const [page, setPage] = useState<Page>('dashboard')
  const [detailPage, setDetailPage] = useState<DetailPage>(null)
  const [detailModelTab, setDetailModelTab] = useState<'flash' | 'pro'>('flash')
  const [apiKey, setApiKey] = useState('')
  const [platformToken, setPlatformToken] = useState('')
  const [balance, setBalance] = useState<BalanceData | null>(null)
  const [usage, setUsage] = useState<UsageResult | null>(null)
  const [history, setHistory] = useState<HistoryMonth[]>([])
  const [loading, setLoading] = useState(false)
  const timerRef = useRef<ReturnType<typeof setInterval>>()
  const [chartH, setChartH] = useState(200)
  const [detailChartH, setDetailChartH] = useState(220)

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
      if (result) hist.push({ month: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`, cost: result.monthCost, tokens: result.days.reduce((s, day) => s + day.totalTokens, 0), days: result.days })
    }
    setHistory(hist)
    setLoading(false)
  }, [platformToken])

  useEffect(() => { loadConfig() }, [loadConfig])
  useEffect(() => { if (apiKey) { fetchBalance(); timerRef.current = setInterval(fetchBalance, 300000) }; return () => { if (timerRef.current) clearInterval(timerRef.current) } }, [apiKey])
  useEffect(() => { if (platformToken) fetchAllData() }, [platformToken])
  useEffect(() => {
    const calc = () => {
      setChartH(Math.max(60, window.innerHeight - 580))
      setDetailChartH(Math.max(60, window.innerHeight - 520))
    }
    calc()
    window.addEventListener('resize', calc)
    return () => window.removeEventListener('resize', calc)
  }, [])

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

  const todayStr = new Date().toISOString().slice(0, 10)

  // ===== SETTINGS PAGE =====
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

  // ===== DETAIL PAGE SHARED COMPONENTS =====
  const DetailHeader = ({ children, dateStr }: { children: React.ReactNode; dateStr?: string }) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '16px 0', marginBottom: 24, borderBottom: '1px solid var(--border-color)' }}>
      <button className="btn btn-ghost btn-sm" onClick={() => setDetailPage(null)} style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '6px 12px', borderRadius: 8, border: '1px solid var(--border-color)', background: 'transparent', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: 13 }}>
        <ArrowLeft size={14} /> 返回
      </button>
      <span style={{ fontSize: 18, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8 }}>{children}</span>
      {dateStr && <span style={{ fontSize: 13, color: 'var(--text-secondary)', marginLeft: 4, fontWeight: 400 }}>{dateStr}</span>}
      <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 10, background: 'rgba(99,102,241,0.12)', color: 'var(--accent)', fontWeight: 500, marginLeft: 'auto' }}>DeepSeek</span>
    </div>
  )

  const StatsBox = ({ items }: { items: { value: string; label: string; color?: string }[] }) => (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 20 }}>
      {items.map((s, i) => (
        <div key={i} style={{ background: 'rgba(255,255,255,0.03)', borderRadius: 10, padding: 14, textAlign: 'center' }}>
          <div style={{ fontSize: 20, fontWeight: 700, color: s.color }}>{s.value}</div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>{s.label}</div>
        </div>
      ))}
    </div>
  )

  const BarChartCard = ({ title, days, maxVal, getVal, barH }: { title: string; days: UsageDay[]; maxVal: number; getVal: (d: UsageDay) => number; barH: number }) => {
    const fmt = (v: number) => v >= 100 ? fmtMoney(v) : v > 0 ? '¥' + v.toFixed(2) : ''
    return (
      <div className="api-config-section" style={{ padding: 20, marginBottom: 0, flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: 6, marginBottom: 16, flexShrink: 0 }}>{title}</div>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 2, flex: 1, minHeight: 0, overflowX: 'auto', overflowY: 'hidden', padding: '0 4px' }}>
          {days.map((d, i) => {
            const val = getVal(d)
            const hasData = val > 0
            const h = hasData ? Math.max(6, (val / maxVal) * barH) : 0
            const isToday = d.date === todayStr
            const barBg = hasData ? (isToday ? 'linear-gradient(180deg,#22c55e,rgba(34,197,94,0.1))' : 'linear-gradient(180deg,#6366f1,rgba(99,102,241,0.1))') : '#2a2a3e'
            return (
              <div key={i} style={{ flex: '1 0 0', minWidth: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, height: '100%', justifyContent: 'flex-end' }}>
                <span style={{ fontSize: 11, color: 'var(--text-secondary)', fontWeight: 600, whiteSpace: 'nowrap', minHeight: 16 }}>{val > 0 ? fmt(val) : ''}</span>
                <div style={{ width: '100%', height: h, background: barBg, borderRadius: '4px 4px 0 0' }} />
                <span style={{ fontSize: 10, fontWeight: 600, color: isToday ? '#22c55e' : 'var(--text-secondary)' }}>{`${new Date(d.date).getDate()}日`}</span>
              </div>
            )
          })}
        </div>
      </div>
    )
  }

  // ===== DETAIL PAGES =====
  if (detailPage) {
    const dp = detailPage
    const inner = document.querySelector('.content-area')
    const areaH = inner ? inner.clientHeight : window.innerHeight - 100
    const cH = Math.max(60, areaH - 500)

    // ---- SCENE 1: MONTHLY detail ----
    if (dp.type === 'monthly') {
      const currentMonth = new Date().toISOString().slice(0, 7)
      const allMonths = [
        { month: currentMonth, label: `${currentMonth}（本月）`, days: usage?.days || [], monthCost: usage?.monthCost || 0 },
        ...history.filter(h => h.month !== currentMonth).map(h => ({ month: h.month, label: h.month, days: h.days, monthCost: h.cost })),
      ]
      const selected = allMonths.find(m => m.month === dp.month) || allMonths[0]
      // fill missing days to show complete month
      const [yy, mm] = selected.month.split('-').map(Number)
      const totalDays = new Date(yy, mm, 0).getDate()
      const isCurrentMonth = selected.month === currentMonth
      const maxDay = isCurrentMonth ? new Date().getDate() : totalDays
      const dayMap = new Map(selected.days.map(d => [parseInt(d.date.split('-')[2], 10), d]))
      const fullDays: UsageDay[] = []
      for (let d = 1; d <= maxDay; d++) {
        fullDays.push(dayMap.get(d) || { date: `${selected.month}-${String(d).padStart(2, '0')}`, flashTokens: 0, proTokens: 0, totalTokens: 0, totalCost: 0, flashCost: 0, proCost: 0 })
      }
      const maxCost = Math.max(...fullDays.map(d => d.totalCost), 0.01)
      const activeDays = fullDays.filter(d => d.totalCost > 0).length
      const avgCost = activeDays > 0 ? selected.monthCost / activeDays : 0
      const maxDayCost = Math.max(...fullDays.map(d => d.totalCost), 0)
      const [ym, mo] = selected.month.split('-')
      return (
        <div style={{ height: '100%', overflow: 'hidden', background: 'var(--bg-primary)', display: 'flex', flexDirection: 'column' }}>
          <div style={{ flex: 1, overflow: 'auto', padding: '0 24px 24px', maxWidth: 900, margin: '0 auto', width: '100%' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '16px 0', marginBottom: 24, borderBottom: '1px solid var(--border-color)' }}>
              <button className="btn btn-ghost btn-sm" onClick={() => setDetailPage(null)} style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '6px 12px', borderRadius: 8, border: '1px solid var(--border-color)', background: 'transparent', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: 13 }}>
                <ArrowLeft size={14} /> 返回
              </button>
              <span style={{ fontSize: 18, fontWeight: 700 }}>📅 月度消费明细</span>
              <select
                value={selected.month}
                onChange={e => {
                  const m = allMonths.find(x => x.month === e.target.value)
                  if (m) setDetailPage({ type: 'monthly', month: m.month, days: m.days, monthCost: m.monthCost })
                }}
                style={{ fontSize: 13, color: 'var(--text-secondary)', background: 'transparent', border: '1px solid var(--border-color)', borderRadius: 6, padding: '4px 8px', cursor: 'pointer', outline: 'none', fontWeight: 400 }}
              >
                {allMonths.map(m => (
                  <option key={m.month} value={m.month}>{m.label}</option>
                ))}
              </select>
              <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 10, background: 'rgba(99,102,241,0.12)', color: 'var(--accent)', fontWeight: 500, marginLeft: 'auto' }}>DeepSeek</span>
            </div>
            <StatsBox items={[
              { value: fmtMoney(selected.monthCost), label: `${+mo}月总消费`, color: 'var(--accent)' },
              { value: fmtMoney(avgCost), label: '日均消费' },
              { value: fmtMoney(maxDayCost), label: '最高单日' },
              { value: String(activeDays), label: '活跃天数' },
            ]} />
            <BarChartCard title="📊 每日消费金额" days={fullDays} maxVal={maxCost} getVal={d => d.totalCost} barH={cH} />
          </div>
        </div>
      )
    }

    // ---- SCENE 2: MODEL detail ----
    if (dp.type === 'model') {
      const isFlash = detailModelTab === 'flash'
      const maxCost = Math.max(...dp.days.map(d => isFlash ? d.flashCost : d.proCost), 0.01)
      const modelCost = dp.days.reduce((s, d) => s + (isFlash ? d.flashCost : d.proCost), 0)
      const modelTokens = dp.days.reduce((s, d) => s + (isFlash ? d.flashTokens : d.proTokens), 0)
      const activeDays = dp.days.filter(d => (isFlash ? d.flashCost : d.proCost) > 0).length
      const otherCost = isFlash ? dp.days.reduce((s, d) => s + d.proCost, 0) : dp.days.reduce((s, d) => s + d.flashCost, 0)
      const otherName = isFlash ? 'Pro' : 'Flash'
      const tabColor = isFlash ? '#f59e0b' : '#6366f1'
      return (
        <div style={{ height: '100%', overflow: 'hidden', background: 'var(--bg-primary)', display: 'flex', flexDirection: 'column' }}>
          <div style={{ flex: 1, overflow: 'auto', padding: '0 24px 24px', maxWidth: 900, margin: '0 auto', width: '100%' }}>
            <DetailHeader>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 10px', borderRadius: 6, fontSize: 12, fontWeight: 600, background: isFlash ? 'rgba(245,158,11,0.12)' : 'rgba(99,102,241,0.12)', color: tabColor }}>
                {isFlash ? <Zap size={14} /> : <Brain size={14} />}
                {isFlash ? 'V4 Flash' : 'V4 Pro'}
              </span>
              每日消费明细
            </DetailHeader>

            <div style={{ display: 'flex', gap: 4, background: 'var(--bg-card)', borderRadius: 8, padding: 3, marginBottom: 20 }}>
              {(['flash', 'pro'] as const).map((k) => (
                <button
                  key={k}
                  onClick={() => setDetailModelTab(k)}
                  style={{
                    flex: 1, textAlign: 'center', padding: '8px 16px', borderRadius: 6, fontSize: 13, fontWeight: 500,
                    cursor: 'pointer', border: 'none', background: detailModelTab === k ? 'var(--accent)' : 'transparent',
                    color: detailModelTab === k ? '#fff' : 'var(--text-muted)',
                    transition: 'all .15s',
                  }}
                >
                  {k === 'flash' ? '⚡ V4 Flash' : '🧠 V4 Pro'}
                </button>
              ))}
            </div>

            <StatsBox items={[
              { value: fmtMoney(modelCost), label: `${isFlash ? 'Flash' : 'Pro'} 月消费`, color: tabColor },
              { value: fmtMoney(activeDays > 0 ? modelCost / activeDays : 0), label: '日均消费' },
              { value: fmtShort(modelTokens), label: '总 Token' },
              { value: fmtMoney(otherCost), label: `${otherName} 月消费` },
            ]} />
            <BarChartCard title="📊 每日消费金额" days={dp.days} maxVal={maxCost} getVal={d => isFlash ? d.flashCost : d.proCost} barH={cH} />
          </div>
        </div>
      )
    }

    // ---- SCENE 3: DAILY detail ----
    if (dp.type === 'daily') {
      const dayData = dp.days.find(d => d.date === dp.date) || getDefaultDays()
      const maxToken = Math.max(dayData.flashTokens, dayData.proTokens, 1)
      const barH = Math.min(200, Math.max(60, cH))
      const sortedDays = dp.days.filter(d => d.totalTokens > 0).map(d => d.date).sort()
      const curIdx = sortedDays.indexOf(dp.date)
      const prevDate = curIdx > 0 ? sortedDays[curIdx - 1] : null
      const nextDate = curIdx < sortedDays.length - 1 ? sortedDays[curIdx + 1] : null
      const goToDay = (date: string) => setDetailPage({ type: 'daily', date, days: dp.days })
      return (
        <div style={{ height: '100%', overflow: 'hidden', background: 'var(--bg-primary)', display: 'flex', flexDirection: 'column' }}>
          <div style={{ flex: 1, overflow: 'auto', padding: '0 24px 24px', maxWidth: 900, margin: '0 auto', width: '100%' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '16px 0', marginBottom: 24, borderBottom: '1px solid var(--border-color)' }}>
              <button className="btn btn-ghost btn-sm" onClick={() => setDetailPage(null)} style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '6px 12px', borderRadius: 8, border: '1px solid var(--border-color)', background: 'transparent', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: 13 }}>
                <ArrowLeft size={14} /> 返回
              </button>
              <span style={{ fontSize: 18, fontWeight: 700 }}>📊 用量明细</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <button
                  disabled={!prevDate}
                  onClick={() => prevDate && goToDay(prevDate)}
                  style={{ display: 'flex', alignItems: 'center', gap: 2, padding: '4px 10px', borderRadius: 6, border: '1px solid var(--border-color)', background: 'transparent', color: prevDate ? 'var(--text-secondary)' : 'var(--text-muted)', cursor: prevDate ? 'pointer' : 'default', fontSize: 12, opacity: prevDate ? 1 : 0.4 }}
                >◀ 前一天</button>
                <span style={{ fontSize: 13, color: 'var(--text-secondary)', fontWeight: 400, minWidth: 90, textAlign: 'center' }}>{dp.date}</span>
                <button
                  disabled={!nextDate}
                  onClick={() => nextDate && goToDay(nextDate)}
                  style={{ display: 'flex', alignItems: 'center', gap: 2, padding: '4px 10px', borderRadius: 6, border: '1px solid var(--border-color)', background: 'transparent', color: nextDate ? 'var(--text-secondary)' : 'var(--text-muted)', cursor: nextDate ? 'pointer' : 'default', fontSize: 12, opacity: nextDate ? 1 : 0.4 }}
                >后一天 ▶</button>
              </div>
              <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 10, background: 'rgba(99,102,241,0.12)', color: 'var(--accent)', fontWeight: 500, marginLeft: 'auto' }}>DeepSeek</span>
            </div>
            <StatsBox items={[
              { value: fmtShort(dayData.totalTokens), label: '当日总 Token' },
              { value: fmtShort(dayData.flashTokens), label: 'V4 Flash', color: '#f59e0b' },
              { value: fmtShort(dayData.proTokens), label: 'V4 Pro', color: '#8b5cf6' },
              { value: fmtMoney(dayData.totalCost), label: '当日消费' },
            ]} />

            <div className="api-config-section" style={{ padding: 20, marginBottom: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: 6, marginBottom: 16, justifyContent: 'space-between' }}>
                <span>📊 Flash vs Pro 用量对比</span>
                <div style={{ display: 'flex', gap: 16, fontSize: 11, fontWeight: 400 }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><span style={{ width: 10, height: 10, borderRadius: 2, background: '#f59e0b' }} /> Flash</span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><span style={{ width: 10, height: 10, borderRadius: 2, background: '#8b5cf6' }} /> Pro</span>
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'center', gap: 60, padding: '20px 0', height: Math.max(160, barH + 60) }}>
                {/* Flash bar */}
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontSize: 14, fontWeight: 700, color: '#f59e0b' }}>{fmtShort(dayData.flashTokens)}</span>
                  <div style={{ width: 80, height: Math.max(10, (dayData.flashTokens / maxToken) * barH), background: 'linear-gradient(180deg,#f59e0b,rgba(245,158,11,0.15))', borderRadius: '6px 6px 0 0' }} />
                  <span style={{ fontSize: 12, fontWeight: 600, color: '#f59e0b' }}>V4 Flash</span>
                  <span style={{ fontSize: 14, fontWeight: 700, color: '#f59e0b' }}>{fmtMoney(dayData.flashCost)}</span>
                </div>
                {/* Pro bar */}
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontSize: 14, fontWeight: 700, color: '#8b5cf6' }}>{fmtShort(dayData.proTokens)}</span>
                  <div style={{ width: 80, height: Math.max(10, (dayData.proTokens / maxToken) * barH), background: 'linear-gradient(180deg,#8b5cf6,rgba(139,92,246,0.1))', borderRadius: '6px 6px 0 0' }} />
                  <span style={{ fontSize: 12, fontWeight: 600, color: '#8b5cf6' }}>V4 Pro</span>
                  <span style={{ fontSize: 14, fontWeight: 700, color: '#8b5cf6' }}>{fmtMoney(dayData.proCost)}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )
    }

    return null
  }

  // ===== MAIN DASHBOARD =====
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
    <div style={{ height: '100%', overflow: 'hidden', background: 'var(--bg-primary)', display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18, maxWidth: 1080, width: '100%', margin: '0 auto', padding: '20px 20px 12px 20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 15, fontWeight: 700 }}>
          🔵 DeepSeek Monitor
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button className="btn btn-ghost btn-sm" onClick={() => { fetchBalance(); fetchAllData() }} disabled={loading}><RefreshCw size={14} style={loading ? { animation: 'spin 1s infinite linear' } : {}} /></button>
          <button className="btn btn-ghost btn-sm" onClick={() => setPage('settings')}><Settings size={14} /></button>
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18, maxWidth: 1080, width: '100%', margin: '0 auto', padding: '0 20px 20px 20px', flex: 1 }}>
        {/* ===== LEFT ===== */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, height: '100%' }}>
          <div className="api-config-section" style={{ padding: 18, height: 210, marginBottom: 0 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8, fontSize: 12, color: 'var(--text-muted)', alignItems: 'center' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><CreditCard size={14} /> 账户余额</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <button className="btn btn-ghost btn-sm" style={{ fontSize: 11, padding: '2px 10px' }} onClick={() => onSelect?.('platforms')}>💰 充值</button>
                <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, padding: '2px 10px', borderRadius: 10, background: balance?.isAvailable ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)', color: balance?.isAvailable ? 'var(--success)' : '#ef4444' }}>
                  <span style={{ width: 5, height: 5, borderRadius: '50%', background: balance?.isAvailable ? 'var(--success)' : '#ef4444' }} />{balance?.isAvailable ? '可用' : '不足'}
                </span>
              </div>
            </div>
            <div style={{ fontSize: 26, fontWeight: 700, marginBottom: 12 }}>{balance ? `${balance.currency === 'USD' ? '$' : '¥'}${balance.totalBalance}` : '查询中…'}</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div style={{ background: 'var(--bg-card)', borderRadius: 8, padding: 10, textAlign: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4, fontSize: 11, color: '#f59e0b', marginBottom: 2 }}><SunMedium size={13} /> 当日</div>
                <div style={{ fontWeight: 700 }}>{today ? fmtMoney(today.totalCost) : '—'}</div>
              </div>
              <div style={{ background: 'var(--bg-card)', borderRadius: 8, padding: 10, textAlign: 'center', cursor: usage ? 'pointer' : 'default' }}
                onClick={() => usage && setDetailPage({ type: 'monthly', month: new Date().toISOString().slice(0, 7), days: usage.days, monthCost: usage.monthCost })}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4, fontSize: 11, color: '#f59e0b', marginBottom: 2 }}><CalendarDays size={13} /> 本月</div>
                <div style={{ fontWeight: 700 }}>{usage ? fmtMoney(usage.monthCost) : '—'}</div>
              </div>
            </div>
          </div>

          {[flash, pro].map((m, i) => m && (
            <div key={i} className="api-config-section" style={{ padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12, marginBottom: 0, cursor: 'pointer' }}
              onClick={() => { setDetailModelTab(m.key as 'flash' | 'pro'); usage && setDetailPage({ type: 'model', days: usage.days }) }}>
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

          <div className="api-config-section" style={{ padding: 18, marginTop: 'auto', display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, marginBottom: 0 }}>
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
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: 5, flex: 1, minHeight: 0, overflow: 'hidden' }}>
                {recentDays.map((d, i) => (
                  <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, cursor: d.totalTokens > 0 ? 'pointer' : 'default' }}
                    onClick={() => usage && d.totalTokens > 0 && setDetailPage({ type: 'daily', date: d.date, days: usage.days })}>
                    <span style={{ fontSize: 11, color: 'var(--text-secondary)', fontWeight: 600, whiteSpace: 'nowrap' }}>{d.totalTokens > 0 ? fmtShort(d.totalTokens) : ''}</span>
                    <div style={{ width: '100%', height: `${Math.max(8, (d.totalTokens / maxDailyToken) * chartH)}px`, background: i === recentDays.length - 1 ? 'linear-gradient(180deg,#22c55e,rgba(34,197,94,0.1))' : 'linear-gradient(180deg,#6366f1,rgba(99,102,241,0.1))', borderRadius: '3px 3px 0 0' }} />
                    <span style={{ fontSize: 10, fontWeight: 600, color: i === recentDays.length - 1 ? '#22c55e' : 'var(--text-secondary)' }}>{mmdd(d.date)}</span>
                  </div>
                ))}
              </div>
            ) : <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 16, fontSize: 12 }}>{platformToken ? '暂无本月数据，请确认已产生用量' : '请先配置 Token'}</div>}
          </div>
        </div>

        {/* ===== RIGHT ===== */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, height: '100%' }}>
          <div className="api-config-section" style={{ padding: 18, height: 210, marginBottom: 0 }}>
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

          <div className="api-config-section" style={{ padding: 18, marginTop: 'auto', display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, marginBottom: 0 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text2)', display: 'flex', alignItems: 'center', gap: 6, marginBottom: 12 }}>
              📈 月度消费趋势
            </div>
            {history.length > 0 ? (
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, flex: 1, minHeight: 0, overflow: 'hidden' }}>
                {history.map((h, i) => (
                  <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, cursor: 'pointer' }}
                    onClick={() => setDetailPage({ type: 'monthly', month: h.month, days: h.days, monthCost: h.cost })}>
                    <span style={{ fontSize: 11, color: 'var(--text-secondary)', fontWeight: 600 }}>{fmtMoney(h.cost)}</span>
                    <div style={{ width: '100%', height: `${Math.max(8, (h.cost / histMaxCost) * chartH)}px`, background: i === history.length - 1 ? 'linear-gradient(180deg,#22c55e,rgba(34,197,94,0.15))' : 'linear-gradient(180deg,#6366f1,rgba(99,102,241,0.1))', borderRadius: '3px 3px 0 0' }} />
                    <span style={{ fontSize: 10, fontWeight: 600, color: i === history.length - 1 ? '#22c55e' : 'var(--text-secondary)' }}>{h.month.slice(5)}月</span>
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
