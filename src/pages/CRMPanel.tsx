import { useState, useEffect, useMemo, useCallback } from 'react'
import { LayoutDashboard, Users, Filter, FileText, BarChart3, FileEdit, Plus, Search, X, ChevronRight, GripVertical } from 'lucide-react'

// ==================== Types ====================
interface Note {
  id: string; title: string; publishDate: string; status: 'published' | 'draft'
  views: number; likes: number; comments: number
}
interface Customer {
  id: string; name: string; phone: string; wechat: string
  source: 'xiaohongshu' | 'referral' | 'other'; sourceNoteId: string | null
  stage: 'lead' | 'wechat' | 'communicating' | 'followup' | 'closed'
  houseType: string; budget: string; style: string
  followUpDate: string; followUpNote: string
  dealAmount: number | null; notes: string
  createdAt: string; updatedAt: string
  projectId?: string
}
interface CRMData { notes: Note[]; customers: Customer[] }
interface EnrichedCustomer extends Customer {
  sourceLabel: string; sourceIcon: string
}

// ==================== Constants ====================
const STAGES = [
  { id: 'lead', label: '待引流', icon: '📥', dotColor: '#3b82f6', cls: 'stage-lead' },
  { id: 'wechat', label: '已加微信', icon: '💬', dotColor: '#8b5cf6', cls: 'stage-wechat' },
  { id: 'communicating', label: '沟通中', icon: '🤝', dotColor: '#6366f1', cls: 'stage-communicating' },
  { id: 'followup', label: '待跟进', icon: '⏰', dotColor: '#f59e0b', cls: 'stage-followup' },
  { id: 'closed', label: '已成交', icon: '✅', dotColor: '#22c55e', cls: 'stage-closed' },
] as const

const SOURCES = [
  { id: 'xiaohongshu', label: '小红书笔记', icon: '📕' },
  { id: 'referral', label: '老客户介绍', icon: '👥' },
  { id: 'other', label: '其他', icon: '📌' },
] as const

const AVATAR_GRADS = [
  ['#6366f1', '#818cf8'], ['#8b5cf6', '#a78bfa'], ['#ec4899', '#f472b6'],
  ['#f59e0b', '#fbbf24'], ['#22c55e', '#4ade80'], ['#3b82f6', '#60a5fa'],
  ['#ef4444', '#f87171'], ['#06b6d4', '#22d3ee'], ['#f97316', '#fb923c'],
  ['#14b8a6', '#2dd4bf'],
]

const TAG_COLORS: Record<string, { bg: string; text: string }> = {
  '奶油风': { bg: '#4a1d4a', text: '#f9a8d4' },
  '原木风': { bg: '#3d2e1e', text: '#fbbf24' },
  '现代简约': { bg: '#1e293b', text: '#94a3b8' },
  '法式复古': { bg: '#3d1a4a', text: '#e879f9' },
  '美式复古': { bg: '#3d1818', text: '#fca5a5' },
  '日式': { bg: '#1a3d32', text: '#5eead4' },
  '现代轻奢': { bg: '#2d1a4a', text: '#c4b5fd' },
  '新中式': { bg: '#3d2818', text: '#fdba74' },
}

const TABS = [
  { id: 'workbench', label: '工作台', icon: LayoutDashboard },
  { id: 'customers', label: '客户管理', icon: Users },
  { id: 'leadpool', label: '线索池', icon: Filter },
  { id: 'contracts', label: '合同管理', icon: FileText },
  { id: 'dashboard', label: '数据看板', icon: BarChart3 },
  { id: 'notes', label: '笔记管理', icon: FileEdit },
] as const

const STORAGE_KEY = 'lingworks_crm_v3'

// ==================== Helpers ====================
function today(): string { return new Date().toISOString().split('T')[0] }
function daysDiff(d1: string, d2: string): number {
  return Math.ceil((new Date(d1).getTime() - new Date(d2).getTime()) / 86400000)
}
function fmtDate(d: string): string {
  if (!d) return ''
  const p = d.split('-')
  return `${parseInt(p[1])}月${parseInt(p[2])}日`
}
function fuDisplay(date: string | null) {
  if (!date) return null
  const diff = daysDiff(date, today())
  if (diff < 0) return { cls: 'overdue', text: `逾期${Math.abs(diff)}天` }
  if (diff === 0) return { cls: 'today', text: '今天' }
  if (diff === 1) return { cls: 'soon', text: '明天' }
  if (diff <= 3) return { cls: 'soon', text: `${diff}天后` }
  return { cls: 'future', text: `${diff}天后` }
}
function avatarGrad(name: string): [string, string] {
  let h = 0
  for (let i = 0; i < name.length; i++) h = name.charCodeAt(i) + ((h << 5) - h)
  return AVATAR_GRADS[Math.abs(h) % AVATAR_GRADS.length] as [string, string]
}

// ==================== Default Data ====================
function createDefaultData(): CRMData {
  const now = new Date()
  const fmt = (d: Date) => d.toISOString().split('T')[0]
  const a = (d: Date, n: number) => { const r = new Date(d); r.setDate(r.getDate() + n); return r }
  const notes: Note[] = [
    { id: 'n1', title: '奶油风客厅改造实录，附软装清单', publishDate: '2026-06-08', status: 'published', views: 2341, likes: 187, comments: 43 },
    { id: 'n2', title: '89平小三居，这样装显大20平', publishDate: '2026-06-02', status: 'published', views: 5620, likes: 423, comments: 89 },
    { id: 'n3', title: '法式复古卧室，每个角落都是电影感', publishDate: '2026-05-28', status: 'published', views: 1892, likes: 156, comments: 32 },
    { id: 'n4', title: '精装房改造避坑指南', publishDate: '', status: 'draft', views: 0, likes: 0, comments: 0 },
    { id: 'n5', title: '15万预算装120平，附费用明细', publishDate: '2026-06-12', status: 'published', views: 3210, likes: 267, comments: 55 },
    { id: 'n6', title: '原木风厨房，治愈系烟火气', publishDate: '', status: 'draft', views: 0, likes: 0, comments: 0 },
  ]
  const customers: Customer[] = [
    { id: 'c1', name: '张女士', phone: '138****6789', wechat: 'zhang_xx', source: 'xiaohongshu', sourceNoteId: 'n1', stage: 'followup', houseType: '三室两厅', budget: '20万', style: '奶油风', followUpDate: fmt(a(now, 1)), followUpNote: '客户说6.19才有空', dealAmount: null, notes: '对奶油风很感兴趣，发了户型图。需等先生一起看方案。', createdAt: '2026-06-10', updatedAt: '2026-06-15' },
    { id: 'c2', name: '李先生', phone: '139****1234', wechat: 'li_design', source: 'referral', sourceNoteId: null, stage: 'communicating', houseType: '四室两厅', budget: '35万', style: '现代简约', followUpDate: '', followUpNote: '', dealAmount: null, notes: '老客户王姐介绍，看过案例集，意向明确。', createdAt: '2026-06-12', updatedAt: '2026-06-16' },
    { id: 'c3', name: '王女士', phone: '136****8901', wechat: 'wang_home', source: 'xiaohongshu', sourceNoteId: 'n2', stage: 'closed', houseType: '三室一厅', budget: '22万', style: '原木风', followUpDate: '', followUpNote: '', dealAmount: 28000, notes: '已签合同，7月初开工。', createdAt: '2026-05-20', updatedAt: '2026-06-08' },
    { id: 'c4', name: '赵先生', phone: '137****4567', wechat: '', source: 'xiaohongshu', sourceNoteId: 'n3', stage: 'lead', houseType: '', budget: '', style: '法式复古', followUpDate: '', followUpNote: '', dealAmount: null, notes: '评论"怎么联系"，已回复微信，未添加。', createdAt: '2026-06-14', updatedAt: '2026-06-14' },
    { id: 'c5', name: '陈女士', phone: '135****7890', wechat: 'chen_chen', source: 'xiaohongshu', sourceNoteId: 'n1', stage: 'communicating', houseType: '两室两厅', budget: '15万', style: '奶油风', followUpDate: fmt(a(now, 3)), followUpNote: '6.21出差回来再聊', dealAmount: null, notes: '预算偏紧，户型小，需精简方案。', createdAt: '2026-06-11', updatedAt: '2026-06-15' },
    { id: 'c6', name: '刘女士', phone: '133****2345', wechat: 'liu_jia', source: 'xiaohongshu', sourceNoteId: 'n5', stage: 'wechat', houseType: '三室两厅', budget: '18万', style: '', followUpDate: '', followUpNote: '', dealAmount: null, notes: '刚加微信，还没深入沟通。', createdAt: '2026-06-15', updatedAt: '2026-06-15' },
    { id: 'c7', name: '周先生', phone: '132****6789', wechat: 'zhou_2024', source: 'xiaohongshu', sourceNoteId: 'n2', stage: 'closed', houseType: '四室两厅', budget: '40万', style: '现代轻奢', followUpDate: '', followUpNote: '', dealAmount: 42000, notes: '大户型全案，已签约，7月中旬开工。', createdAt: '2026-05-15', updatedAt: '2026-06-05' },
    { id: 'c8', name: '吴女士', phone: '131****0123', wechat: 'wu_design', source: 'referral', sourceNoteId: null, stage: 'followup', houseType: '两室一厅', budget: '12万', style: '日式', followUpDate: fmt(now), followUpNote: '今天联系确认方案', dealAmount: null, notes: '预算有限，基础改造。发了方案还没反馈。', createdAt: '2026-06-08', updatedAt: '2026-06-13' },
    { id: 'c9', name: '林先生', phone: '130****3456', wechat: '', source: 'xiaohongshu', sourceNoteId: 'n3', stage: 'lead', houseType: '', budget: '', style: '美式复古', followUpDate: '', followUpNote: '', dealAmount: null, notes: '私信问美式复古案例，发了案例集未回复。', createdAt: '2026-06-16', updatedAt: '2026-06-16' },
  ]
  return { notes, customers }
}

// ==================== Main Component ====================
export default function CRMPanel() {
  const [data, setData] = useState<CRMData>(createDefaultData)
  const [tab, setTab] = useState<string>('workbench')
  const [viewMode, setViewMode] = useState<'table' | 'kanban'>('table')
  const [editingCustomer, setEditingCustomer] = useState<Partial<Customer> | null>(null)
  const [editingNote, setEditingNote] = useState<Partial<Note> | null>(null)
  const [filterNoteId, setFilterNoteId] = useState<string | null>(null)
  const [loaded, setLoaded] = useState(false)

  // Load from storage
  useEffect(() => {
    const load = async () => {
      if (window.electronAPI) {
        const saved = await window.electronAPI.getStore(STORAGE_KEY)
        if (saved && typeof saved === 'object' && Array.isArray(saved.customers)) {
          setData(saved as CRMData)
        }
      } else {
        const raw = localStorage.getItem(STORAGE_KEY)
        if (raw) {
          try {
            const parsed = JSON.parse(raw)
            if (parsed && Array.isArray(parsed.customers)) setData(parsed)
          } catch { /* use default */ }
        }
      }
      setLoaded(true)
    }
    load()
  }, [])

  const persist = useCallback((d: CRMData) => {
    setData(d)
    if (window.electronAPI) {
      window.electronAPI.setStore(STORAGE_KEY, d)
    } else {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(d))
    }
  }, [])

  const ts = today()

  const enrichCust = useCallback((c: Customer): EnrichedCustomer => {
    const src = SOURCES.find(s => s.id === c.source)
    let sourceLabel = src?.label || ''
    if (c.source === 'xiaohongshu' && c.sourceNoteId) {
      const note = data.notes.find(n => n.id === c.sourceNoteId)
      sourceLabel = note ? note.title.slice(0, 12) : '小红书'
    }
    return { ...c, sourceLabel, sourceIcon: src?.icon || '📌' }
  }, [data.notes])

  const updateCust = useCallback((id: string, upd: Partial<Customer>) => {
    persist({ ...data, customers: data.customers.map(c => c.id === id ? { ...c, ...upd, updatedAt: ts } : c) })
  }, [data, ts, persist])

  const addCust = useCallback((cust: Partial<Customer>) => {
    const c: Customer = {
      id: 'c' + Date.now(), name: cust.name || '', phone: cust.phone || '', wechat: cust.wechat || '',
      source: cust.source || 'xiaohongshu', sourceNoteId: cust.sourceNoteId || null,
      stage: cust.stage || 'lead', houseType: cust.houseType || '', budget: cust.budget || '',
      style: cust.style || '', followUpDate: cust.followUpDate || '', followUpNote: cust.followUpNote || '',
      dealAmount: null, notes: cust.notes || '', createdAt: ts, updatedAt: ts,
    }
    persist({ ...data, customers: [...data.customers, c] })
  }, [data, ts, persist])

  const deleteCust = useCallback((id: string) => {
    if (!confirm('确定删除？')) return
    persist({ ...data, customers: data.customers.filter(c => c.id !== id) })
  }, [data, persist])

  const deleteCusts = useCallback((ids: string[]) => {
    if (!confirm(`确定删除选中的 ${ids.length} 位客户？`)) return
    persist({ ...data, customers: data.customers.filter(c => !ids.includes(c.id)) })
  }, [data, persist])

  const moveCust = useCallback((id: string, newStage: string) => {
    const upd: Partial<Customer> = { stage: newStage as Customer['stage'] }
    if (newStage === 'closed') {
      const amt = prompt('成交金额（元）：', '28000')
      if (!amt) return
      upd.dealAmount = parseInt(amt) || 0
    }
    updateCust(id, upd)
  }, [updateCust])

  const updateNote = useCallback((id: string, upd: Partial<Note>) => {
    persist({ ...data, notes: data.notes.map(n => n.id === id ? { ...n, ...upd } : n) })
  }, [data, persist])

  const addNote = useCallback((note: Partial<Note>) => {
    const n: Note = {
      id: 'n' + Date.now(), title: note.title || '', publishDate: note.publishDate || '',
      status: note.status || 'draft', views: 0, likes: 0, comments: 0,
    }
    persist({ ...data, notes: [...data.notes, n] })
  }, [data, persist])

  const syncNotes = useCallback((scrapedNotes: Array<{ title: string; publish_date: string; views: number; likes: number; collects: number; comments: number; shares: number }>) => {
    let added = 0; let updated = 0; let removed = 0
    const existing = [...data.notes]
    const scrapedTitles = new Set(scrapedNotes.map(n => n.title).filter(Boolean))
    // Mark which note IDs are linked to customers
    const linkedIds = new Set(data.customers.filter(c => c.sourceNoteId).map(c => c.sourceNoteId!))

    // Remove old notes that aren't in scraped data and have no customers
    const filtered = existing.filter(n => {
      if (!scrapedTitles.has(n.title) && !linkedIds.has(n.id)) {
        removed++
        return false
      }
      return true
    })

    for (const sn of scrapedNotes) {
      if (!sn.title.trim()) continue
      const idx = filtered.findIndex(n => n.title === sn.title)
      if (idx >= 0) {
        filtered[idx] = {
          ...filtered[idx],
          publishDate: sn.publish_date || filtered[idx].publishDate,
          views: sn.views || filtered[idx].views,
          likes: sn.likes || filtered[idx].likes,
          comments: sn.comments || filtered[idx].comments,
          status: 'published',
        }
        updated++
      } else {
        filtered.push({
          id: 'n' + Date.now() + '_' + added,
          title: sn.title,
          publishDate: sn.publish_date,
          status: 'published',
          views: sn.views,
          likes: sn.likes,
          comments: sn.comments,
        })
        added++
      }
    }
    persist({ ...data, notes: filtered })
    return { added, updated, removed }
  }, [data, persist])

  const followUps = useMemo(() =>
    data.customers.filter(c => c.followUpDate && c.stage !== 'closed')
      .map(c => ({ ...c, diff: daysDiff(c.followUpDate, ts) }))
      .sort((a, b) => a.diff - b.diff),
    [data.customers, ts])
  const todayCount = followUps.filter(c => c.diff <= 0).length
  const overdueCount = followUps.filter(c => c.diff < 0).length
  const closedCusts = data.customers.filter(c => c.stage === 'closed')
  const leadCount = data.customers.filter(c => c.stage === 'lead').length

  if (!loaded) return <div className="crm-loading">加载中...</div>

  const sharedProps = { data, followUps, todayCount, overdueCount, closedCusts, leadCount, enrichCust, updateCust, addCust, deleteCust, deleteCusts, moveCust, updateNote, addNote, syncNotes, viewMode, setViewMode, filterNoteId, setFilterNoteId, setEditingCustomer, setEditingNote, setTab }

  const sidebarItems = [
    { ...TABS[0], badge: todayCount > 0 ? { count: todayCount, cls: overdueCount > 0 ? 'danger' : 'warn' } : null },
    { ...TABS[1], badge: null },
    { ...TABS[2], badge: leadCount > 0 ? { count: leadCount, cls: 'info' } : null },
    { ...TABS[3], badge: closedCusts.length > 0 ? { count: closedCusts.length, cls: 'success' } : null },
    { ...TABS[4], badge: null },
    { ...TABS[5], badge: null },
  ]

  return (
    <div className="crm-panel">
      <div className="crm-sidebar">
        <div className="crm-sidebar-logo">
          <div className="crm-sidebar-logo-icon">L</div>
          <span className="crm-sidebar-logo-text">客户管理</span>
        </div>
        <div className="crm-sidebar-section">主菜单</div>
        <div className="crm-sidebar-nav">
          {sidebarItems.map(item => {
            const Icon = item.icon
            return (
              <div key={item.id} className={`crm-sidebar-item ${tab === item.id ? 'active' : ''}`} onClick={() => { setTab(item.id); setFilterNoteId(null) }}>
                <span className="crm-sidebar-item-icon"><Icon size={15} /></span>
                <span>{item.label}</span>
                {item.badge && <span className={`crm-sidebar-badge ${item.badge.cls}`}>{item.badge.count}</span>}
              </div>
            )
          })}
        </div>
      </div>
      <div className="crm-main">
        <div className="crm-content">
          {tab === 'workbench' && <Workbench {...sharedProps} />}
          {tab === 'customers' && <CustomerPage {...sharedProps} />}
          {tab === 'leadpool' && <LeadPoolPage {...sharedProps} />}
          {tab === 'contracts' && <ContractPage {...sharedProps} />}
          {tab === 'dashboard' && <DashboardPage {...sharedProps} />}
          {tab === 'notes' && <NotesPage {...sharedProps} />}
        </div>
      </div>
      {editingCustomer && (
        <CustomerModal
          customer={editingCustomer}
          notes={data.notes}
          onSave={c => { c.id ? updateCust(c.id, c) : addCust(c); setEditingCustomer(null) }}
          onDelete={editingCustomer.id ? () => { deleteCust(editingCustomer.id!); setEditingCustomer(null) } : undefined}
          onClose={() => setEditingCustomer(null)}
        />
      )}
      {editingNote && (
        <NoteModal
          note={editingNote}
          onSave={n => { n.id ? updateNote(n.id, n) : addNote(n); setEditingNote(null) }}
          onClose={() => setEditingNote(null)}
        />
      )}
    </div>
  )
}

// ==================== Shared Props Type ====================
interface SharedProps {
  data: CRMData
  followUps: (Customer & { diff: number })[]
  todayCount: number
  overdueCount: number
  closedCusts: Customer[]
  leadCount: number
  enrichCust: (c: Customer) => EnrichedCustomer
  updateCust: (id: string, upd: Partial<Customer>) => void
  addCust: (cust: Partial<Customer>) => void
  deleteCust: (id: string) => void
  deleteCusts: (ids: string[]) => void
  moveCust: (id: string, stage: string) => void
  updateNote: (id: string, upd: Partial<Note>) => void
  addNote: (note: Partial<Note>) => void
  syncNotes: (scrapedNotes: Array<{ title: string; publish_date: string; views: number; likes: number; collects: number; comments: number; shares: number }>) => { added: number; updated: number; removed: number }
  viewMode: 'table' | 'kanban'
  setViewMode: (v: 'table' | 'kanban') => void
  filterNoteId: string | null
  setFilterNoteId: (id: string | null) => void
  setEditingCustomer: (c: Partial<Customer> | null) => void
  setEditingNote: (n: Partial<Note> | null) => void
  setTab: (tab: string) => void
}

// ==================== 1. Workbench ====================
function Workbench({ data, followUps, todayCount, overdueCount, closedCusts, leadCount, enrichCust, setEditingCustomer, setTab }: SharedProps) {
  const total = data.customers.length
  const revenue = closedCusts.reduce((s, c) => s + (c.dealAmount || 0), 0)
  const thisMonth = new Date().toISOString().slice(0, 7)
  const newMonth = data.customers.filter(c => c.createdAt.startsWith(thisMonth)).length
  const urgentFollowUps = followUps.filter(c => c.diff <= 0)
  const recentActivity = [...data.customers].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 5)

  return (
    <div>
      {/* KPI Cards */}
      <div className="crm-kpi-grid">
        <div className="crm-kpi-card accent">
          <span className="crm-kpi-label">总客户数</span>
          <span className="crm-kpi-value">{total}</span>
          <span className="crm-kpi-sub">本月新增 {newMonth}</span>
        </div>
        <div className={`crm-kpi-card ${overdueCount > 0 ? 'danger' : 'warn'}`}>
          <span className="crm-kpi-label">今日待跟进</span>
          <span className="crm-kpi-value">{todayCount}</span>
          <span className="crm-kpi-sub">{overdueCount > 0 ? `${overdueCount} 人已逾期` : '暂无逾期'}</span>
        </div>
        <div className="crm-kpi-card success">
          <span className="crm-kpi-label">已成交</span>
          <span className="crm-kpi-value">{closedCusts.length}</span>
          <span className="crm-kpi-sub">转化率 {total > 0 ? Math.round(closedCusts.length / total * 100) : 0}%</span>
        </div>
        <div className="crm-kpi-card success">
          <span className="crm-kpi-label">总成交额</span>
          <span className="crm-kpi-value" style={{ fontSize: 22 }}>¥{(revenue / 10000).toFixed(1)}<span style={{ fontSize: 13, fontWeight: 500 }}>万</span></span>
          <span className="crm-kpi-sub">均单 ¥{closedCusts.length > 0 ? Math.round(revenue / closedCusts.length / 1000) / 10 : 0}万</span>
        </div>
      </div>

      <div className="crm-wb-grid">
        {/* Follow-up list */}
        <div className="crm-section">
          <div className="crm-section-header">
            <span className="crm-section-title">⏰ 待跟进客户</span>
            <span className="crm-section-sub">{urgentFollowUps.length} 人需要关注</span>
            <button className="crm-btn-ghost-sm" style={{ marginLeft: 'auto' }} onClick={() => setTab('customers')}>全部 →</button>
          </div>
          <div className="crm-fu-list">
            {urgentFollowUps.length === 0 && <div className="crm-empty">暂无待跟进客户</div>}
            {urgentFollowUps.map(c => {
              const fu = fuDisplay(c.followUpDate)
              const [g1, g2] = avatarGrad(c.name)
              return (
                <div key={c.id} className="crm-fu-item" onClick={() => setEditingCustomer(c)}>
                  <div className="crm-avatar" style={{ background: `linear-gradient(135deg,${g1},${g2})` }}>{c.name[0]}</div>
                  <div className="crm-fu-info">
                    <div className="crm-fu-name">{c.name}</div>
                    <div className="crm-fu-detail">{c.houseType || '未填'} · {c.budget || '未填'} · {c.followUpNote || '需跟进'}</div>
                  </div>
                  {fu && <span className={`crm-tag ${fu.cls}`}>{fu.text}</span>}
                </div>
              )
            })}
          </div>
        </div>

        {/* Quick Actions */}
        <div className="crm-section">
          <div className="crm-section-header">
            <span className="crm-section-title">快捷操作</span>
          </div>
          <div className="crm-qa-grid">
            {[
              { label: '新增客户', action: () => { setTab('customers'); setTimeout(() => setEditingCustomer({ stage: 'lead' }), 100) } },
              { label: `线索池 (${leadCount})`, action: () => setTab('leadpool') },
              { label: '看板视图', action: () => setTab('customers') },
              { label: `合同管理 (${closedCusts.length})`, action: () => setTab('contracts') },
              { label: '数据看板', action: () => setTab('dashboard') },
              { label: '笔记管理', action: () => setTab('notes') },
            ].map(qa => (
              <button key={qa.label} className="crm-qa-item" onClick={qa.action}>{qa.label}</button>
            ))}
          </div>
        </div>
      </div>

      {/* Recent Activity */}
      <div className="crm-section" style={{ marginTop: 12 }}>
        <div className="crm-section-header">
          <span className="crm-section-title">最近动态</span>
        </div>
        <div>
          {recentActivity.map(c => {
            const stage = STAGES.find(s => s.id === c.stage)
            return (
              <div key={c.id} className="crm-activity-row" onClick={() => setEditingCustomer(c)}>
                <span className="crm-dot" style={{ background: stage?.dotColor }} />
                <span className="crm-activity-name">{c.name}</span>
                <span className="crm-activity-stage">
                  {c.stage === 'closed' ? `成交 ¥${(c.dealAmount || 0).toLocaleString()}` : `→ ${stage?.label}`}
                </span>
                <span className="crm-activity-date">{fmtDate(c.updatedAt)}</span>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

// ==================== 2. Customer Page ====================
function CustomerPage({ data, viewMode, setViewMode, setEditingCustomer, filterNoteId, setFilterNoteId, enrichCust, moveCust, deleteCusts }: SharedProps) {
  const [search, setSearch] = useState('')
  const [dragId, setDragId] = useState<string | null>(null)
  const [batchMode, setBatchMode] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())

  const customers = data.customers.filter(c => c.stage !== 'closed').map(enrichCust)

  const filtered = useMemo(() => {
    let list = customers
    if (search) list = list.filter(c => c.name.includes(search) || c.phone.includes(search) || c.houseType.includes(search))
    if (filterNoteId) list = list.filter(c => c.sourceNoteId === filterNoteId)
    return list
  }, [customers, search, filterNoteId])

  const kanbanGroups = useMemo(() => {
    const m: Record<string, EnrichedCustomer[]> = {}
    STAGES.filter(s => s.id !== 'closed').forEach(s => { m[s.id] = [] })
    filtered.forEach(c => { if (m[c.stage]) m[c.stage].push(c) })
    return m
  }, [filtered])

  const onAdd = (stage: string) => setEditingCustomer({ stage: stage as Customer['stage'] })

  return (
    <div className="crm-page">
      <div className="crm-toolbar">
        <div className="crm-toolbar-left">
          <Search size={14} style={{ opacity: 0.4 }} />
          <input className="crm-search" placeholder="搜索客户、电话、户型…" value={search} onChange={e => setSearch(e.target.value)} />
          {filterNoteId && (
            <span className="crm-filter-chip">
              📌 {data.notes.find(n => n.id === filterNoteId)?.title?.slice(0, 16)}…
              <button onClick={() => setFilterNoteId(null)}><X size={12} /></button>
            </span>
          )}
        </div>
        <div className="crm-toolbar-right">
          <span className="crm-count-label">{filtered.length} 位客户</span>
          <div className="crm-view-toggle">
            <button className={`crm-view-btn ${viewMode === 'table' ? 'active' : ''}`} onClick={() => setViewMode('table')}>列表</button>
            <button className={`crm-view-btn ${viewMode === 'kanban' ? 'active' : ''}`} onClick={() => setViewMode('kanban')}>看板</button>
          </div>
          {batchMode ? (
            <>
              <button className="crm-btn-danger-outline" onClick={() => { if (selectedIds.size > 0) { deleteCusts(Array.from(selectedIds)); setSelectedIds(new Set()); setBatchMode(false) } }} disabled={selectedIds.size === 0}>
                删除选中 ({selectedIds.size})
              </button>
              <button className="crm-btn-ghost" onClick={() => { setBatchMode(false); setSelectedIds(new Set()) }}>取消</button>
            </>
          ) : (
            <>
              <button className="crm-btn-ghost" onClick={() => { setBatchMode(true); setViewMode('table') }}>管理</button>
              <button className="crm-btn-primary" onClick={() => onAdd('lead')}><Plus size={14} /> 添加客户</button>
            </>
          )}
        </div>
      </div>

      {viewMode === 'table' ? (
        <div className="crm-table-wrap">
          <table className="crm-table">
            <thead>
              <tr>
                {batchMode && <th style={{ width: 36 }}><input type="checkbox" checked={filtered.length > 0 && filtered.every(c => selectedIds.has(c.id))} onChange={e => { if (e.target.checked) setSelectedIds(new Set(filtered.map(c => c.id))); else setSelectedIds(new Set()) }} /></th>}
                <th style={{ width: 140 }}>客户</th>
                <th style={{ width: 130 }}>来源</th>
                <th style={{ width: 80 }}>阶段</th>
                <th style={{ width: 160 }}>需求</th>
                <th style={{ width: 100 }}>跟进</th>
                <th style={{ width: 90 }}>更新时间</th>
                <th style={{ width: 70 }}>操作</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(c => {
                const stage = STAGES.find(s => s.id === c.stage)
                const fu = fuDisplay(c.followUpDate || null)
                const [g1, g2] = avatarGrad(c.name)
                const toggleSel = (id: string) => { const next = new Set(selectedIds); if (next.has(id)) next.delete(id); else next.add(id); setSelectedIds(next) }
                return (
                  <tr key={c.id} onClick={() => { if (batchMode) toggleSel(c.id); else setEditingCustomer(c) }}>
                    {batchMode && <td onClick={e => e.stopPropagation()}><input type="checkbox" checked={selectedIds.has(c.id)} onChange={() => toggleSel(c.id)} /></td>}
                    <td>
                      <div className="crm-td-name">
                        <div className="crm-avatar crm-avatar-sm" style={{ background: `linear-gradient(135deg,${g1},${g2})` }}>{c.name[0]}</div>
                        {c.name}
                      </div>
                    </td>
                    <td><span className="crm-source-link">{c.sourceIcon} {c.sourceLabel}</span></td>
                    <td><span className={`crm-tag stage-${c.stage}`}><span className="crm-dot-sm" style={{ background: stage?.dotColor }} />{stage?.label}</span></td>
                    <td><span className="crm-info-text">{[c.houseType, c.budget, c.style].filter(Boolean).join(' · ') || '未填'}</span></td>
                    <td>{fu ? <span className={`crm-tag ${fu.cls}`}>{fu.text}</span> : <span className="crm-muted">—</span>}</td>
                    <td><span className="crm-muted">{fmtDate(c.updatedAt)}</span></td>
                    <td>
                      <button className="crm-btn-ghost-xs" onClick={e => { e.stopPropagation(); setEditingCustomer(c) }}>详情</button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="crm-kanban">
          {STAGES.filter(s => s.id !== 'closed').map(s => {
            const cards = kanbanGroups[s.id] || []
            return (
              <div key={s.id} className="crm-kanban-col"
                onDragOver={e => { e.preventDefault(); e.currentTarget.classList.add('drag-over') }}
                onDragLeave={e => { e.currentTarget.classList.remove('drag-over') }}
                onDrop={e => { e.currentTarget.classList.remove('drag-over'); if (dragId) moveCust(dragId, s.id); setDragId(null) }}>
                <div className="crm-kanban-col-header">
                  <span className="crm-dot" style={{ background: s.dotColor }} />
                  <span>{s.label}</span>
                  <span className="crm-kanban-count">{cards.length}</span>
                </div>
                <div className="crm-kanban-cards">
                  {cards.map(c => (
                    <div key={c.id} className={`crm-card ${dragId === c.id ? 'dragging' : ''}`}
                      style={{ borderLeftColor: s.dotColor }}
                      draggable
                      onDragStart={e => { e.dataTransfer.effectAllowed = 'move'; setDragId(c.id) }}
                      onDragEnd={() => setDragId(null)}
                      onClick={() => setEditingCustomer(c)}>
                      <div className="crm-card-top">
                        <div className="crm-avatar crm-avatar-sm" style={{ background: `linear-gradient(135deg,${avatarGrad(c.name)[0]},${avatarGrad(c.name)[1]})` }}>{c.name[0]}</div>
                        <div>
                          <div className="crm-card-name">{c.name}</div>
                          <div className="crm-card-source">{c.sourceIcon} {c.sourceLabel}</div>
                        </div>
                      </div>
                      <div className="crm-card-tags">
                        {c.houseType && <span className="crm-card-tag tag-blue">{c.houseType}</span>}
                        {c.budget && <span className="crm-card-tag tag-yellow">{c.budget}</span>}
                        {c.style && <span className="crm-card-tag" style={{ background: (TAG_COLORS[c.style] || {}).bg || 'var(--bg-tertiary)', color: (TAG_COLORS[c.style] || {}).text || 'var(--text-secondary)' }}>{c.style}</span>}
                      </div>
                      <div className="crm-card-footer">
                        {(() => { const fu = fuDisplay(c.followUpDate); return fu ? <span className={`crm-tag ${fu.cls}`}>{fu.text}</span> : <span className="crm-muted">{fmtDate(c.updatedAt)}更新</span> })()}
                      </div>
                    </div>
                  ))}
                </div>
                <button className="crm-kanban-add" onClick={() => onAdd(s.id)}>+ 添加</button>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ==================== 3. Lead Pool ====================
function LeadPoolPage({ data, setEditingCustomer, enrichCust, moveCust }: SharedProps) {
  const leads = data.customers.filter(c => c.stage === 'lead').map(enrichCust)
  return (
    <div className="crm-page">
      <div className="crm-toolbar">
        <span className="crm-page-subtitle">来自笔记评论/私信的未认领线索 · {leads.length} 条</span>
        <button className="crm-btn-primary" onClick={() => setEditingCustomer({ stage: 'lead' })}><Plus size={14} /> 添加线索</button>
      </div>
      {leads.length === 0 ? <div className="crm-empty">没有待处理的线索</div> : (
        <div className="crm-table-wrap">
          <table className="crm-table">
            <thead>
              <tr>
                <th>客户</th><th>来源</th><th>风格偏好</th><th>留言时间</th><th>备注</th><th style={{ width: 120 }}>操作</th>
              </tr>
            </thead>
            <tbody>
              {leads.map(c => (
                <tr key={c.id} onClick={() => setEditingCustomer(c)}>
                  <td>
                    <div className="crm-td-name">
                      <div className="crm-avatar crm-avatar-sm" style={{ background: `linear-gradient(135deg,${avatarGrad(c.name)[0]},${avatarGrad(c.name)[1]})` }}>{c.name[0]}</div>
                      {c.name}
                    </div>
                  </td>
                  <td><span className="crm-source-link">{c.sourceIcon} {c.sourceLabel}</span></td>
                  <td>{c.style || <span className="crm-muted">未填</span>}</td>
                  <td><span className="crm-muted">{fmtDate(c.createdAt)}</span></td>
                  <td className="crm-notes-cell">{c.notes}</td>
                  <td>
                    <div className="crm-actions">
                      <button className="crm-btn-primary-xs" onClick={e => { e.stopPropagation(); moveCust(c.id, 'wechat') }}>认领</button>
                      <button className="crm-btn-ghost-xs" onClick={e => { e.stopPropagation(); setEditingCustomer(c) }}>详情</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ==================== 4. Contract Page ====================
function ContractPage({ closedCusts, setEditingCustomer, enrichCust, deleteCusts }: SharedProps) {
  const total = closedCusts.reduce((s, c) => s + (c.dealAmount || 0), 0)
  const [batchMode, setBatchMode] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())

  return (
    <div className="crm-page">
      <div className="crm-toolbar">
        <span className="crm-page-subtitle">已签合同 {closedCusts.length} 份 · 总金额 ¥{(total / 10000).toFixed(1)}万</span>
        <div style={{ display: 'flex', gap: 8, marginLeft: 'auto' }}>
          {batchMode ? (
            <>
              <button className="crm-btn-danger-outline" onClick={() => { if (selectedIds.size > 0) { deleteCusts(Array.from(selectedIds)); setSelectedIds(new Set()); setBatchMode(false) } }} disabled={selectedIds.size === 0}>
                删除选中 ({selectedIds.size})
              </button>
              <button className="crm-btn-ghost" onClick={() => { setBatchMode(false); setSelectedIds(new Set()) }}>取消</button>
            </>
          ) : (
            <>
              <button className="crm-btn-ghost" onClick={() => setBatchMode(true)}>管理合同</button>
              <button className="crm-btn-primary" onClick={() => setEditingCustomer({ stage: 'closed' })}><Plus size={14} /> 新增合同</button>
            </>
          )}
        </div>
      </div>
      {closedCusts.length === 0 ? <div className="crm-empty">暂无成交合同</div> : (
        <div className="crm-table-wrap">
          <table className="crm-table">
            <thead>
              <tr>
                {batchMode && <th style={{ width: 36 }}><input type="checkbox" checked={closedCusts.length > 0 && closedCusts.every(c => selectedIds.has(c.id))} onChange={e => { if (e.target.checked) setSelectedIds(new Set(closedCusts.map(c => c.id))); else setSelectedIds(new Set()) }} /></th>}
                <th>合同编号</th><th>客户</th><th>户型</th><th>合同金额</th><th>风格</th><th>签约金额</th><th>签约日期</th><th style={{ width: 80 }}>操作</th>
              </tr>
            </thead>
            <tbody>
              {closedCusts.map(c => {
                const ec = enrichCust(c)
                const toggleSel = (id: string) => { const next = new Set(selectedIds); if (next.has(id)) next.delete(id); else next.add(id); setSelectedIds(next) }
                return (
                  <tr key={c.id} onClick={() => { if (batchMode) toggleSel(c.id); else setEditingCustomer(c) }}>
                    {batchMode && <td onClick={e => e.stopPropagation()}><input type="checkbox" checked={selectedIds.has(c.id)} onChange={() => toggleSel(c.id)} /></td>}
                    <td className="crm-mono crm-accent">{c.projectId || `P2026-${c.id.slice(-3).padStart(3, '0')}`}</td>
                    <td>
                      <div className="crm-td-name">
                        <div className="crm-avatar crm-avatar-sm" style={{ background: `linear-gradient(135deg,${avatarGrad(c.name)[0]},${avatarGrad(c.name)[1]})` }}>{c.name[0]}</div>
                        {c.name}
                      </div>
                    </td>
                    <td>{c.houseType || '—'}</td>
                    <td>{c.budget || '—'}</td>
                    <td>{c.style || '—'}</td>
                    <td className="crm-amount">¥{(c.dealAmount || 0).toLocaleString()}</td>
                    <td className="crm-muted">{fmtDate(c.updatedAt)}</td>
                    <td><button className="crm-btn-ghost-xs" onClick={e => { e.stopPropagation(); setEditingCustomer(c) }}>详情</button></td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ==================== 5. Dashboard ====================
function DashboardPage({ data, todayCount }: SharedProps) {
  const total = data.customers.length
  const closed = data.customers.filter(c => c.stage === 'closed').length
  const revenue = data.customers.reduce((s, c) => s + (c.dealAmount || 0), 0)

  const funnel = [
    { label: '留资/咨询', count: total, color: '#3b82f6' },
    { label: '已加微信', count: data.customers.filter(c => ['wechat', 'communicating', 'followup', 'closed'].includes(c.stage)).length, color: '#8b5cf6' },
    { label: '深入沟通', count: data.customers.filter(c => ['communicating', 'followup', 'closed'].includes(c.stage)).length, color: '#6366f1' },
    { label: '报价/跟进', count: data.customers.filter(c => ['followup', 'closed'].includes(c.stage)).length, color: '#f59e0b' },
    { label: '成交', count: closed, color: '#22c55e' },
  ]
  const fmax = Math.max(...funnel.map(s => s.count), 1)

  const topNotes = useMemo(() =>
    [...data.notes].map(n => ({ ...n, leads: data.customers.filter(c => c.sourceNoteId === n.id).length }))
      .sort((a, b) => b.leads - a.leads).slice(0, 5),
    [data.notes, data.customers])

  const rankColors = ['#f59e0b', '#94a3b8', '#fb923c']

  return (
    <div>
      <div className="crm-kpi-grid">
        <div className="crm-kpi-card accent"><span className="crm-kpi-label">总客户</span><span className="crm-kpi-value">{total}</span></div>
        <div className="crm-kpi-card warn"><span className="crm-kpi-label">今日待跟进</span><span className="crm-kpi-value">{todayCount}</span></div>
        <div className="crm-kpi-card success"><span className="crm-kpi-label">已成交</span><span className="crm-kpi-value">{closed}</span></div>
        <div className="crm-kpi-card success"><span className="crm-kpi-label">总成交额</span><span className="crm-kpi-value" style={{ fontSize: 22 }}>¥{(revenue / 10000).toFixed(1)}万</span></div>
      </div>

      <div className="crm-dash-grid">
        <div className="crm-section">
          <div className="crm-section-header">
            <span className="crm-section-title">转化漏斗</span>
          </div>
          <div className="crm-funnel">
            {funnel.map((s, i) => (
              <div key={s.label} className="crm-funnel-row">
                <span className="crm-funnel-label">{s.label}</span>
                <div className="crm-funnel-track">
                  <div className="crm-funnel-fill" style={{ width: `${(s.count / fmax) * 100}%`, background: s.color }}>
                    {i > 0 && funnel[i - 1].count > 0 && <span className="crm-funnel-rate">{Math.round(s.count / funnel[i - 1].count * 100)}%</span>}
                  </div>
                </div>
                <span className="crm-funnel-pct" style={{ color: s.color }}>
                  {i > 0 && funnel[i - 1].count > 0 ? Math.round(s.count / funnel[i - 1].count * 100) + '%' : ''}
                </span>
                <span className="crm-funnel-count">{s.count}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="crm-section">
          <div className="crm-section-header">
            <span className="crm-section-title">笔记获客排行</span>
          </div>
          {topNotes.map((n, i) => (
            <div key={n.id} className="crm-rank-item">
              <span className="crm-rank-num" style={{ background: rankColors[i] || 'var(--bg-tertiary)', color: i < 3 ? '#000' : 'var(--text-muted)' }}>{i + 1}</span>
              <span className="crm-rank-title">{n.title}</span>
              <span className="crm-rank-count">{n.leads} 客户</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ==================== 6. Notes Page ====================
function NotesPage({ data, setEditingNote, setFilterNoteId, setTab, syncNotes }: SharedProps) {
  const [syncing, setSyncing] = useState(false)
  const [syncMsg, setSyncMsg] = useState<string | null>(null)

  const notesWithLeads = useMemo(() => data.notes.map(n => ({
    ...n, leads: data.customers.filter(c => c.sourceNoteId === n.id).length,
  })), [data.notes, data.customers])

  const handleSync = async () => {
    if (!window.electronAPI?.syncXHSNotes) {
      setSyncMsg('同步功能仅在桌面应用中可用')
      return
    }
    setSyncing(true)
    setSyncMsg(null)
    try {
      const result = await window.electronAPI.syncXHSNotes()
      if (result.success && result.notes.length > 0) {
        const { added, updated, removed } = syncNotes(result.notes)
        const parts = [`新增 ${added} 条`, `更新 ${updated} 条`]
        if (removed > 0) parts.push(`清理 ${removed} 条旧笔记`)
        setSyncMsg(parts.join('，'))
      } else if (result.success && result.notes.length === 0) {
        setSyncMsg('CSV 中暂无笔记数据，请先运行 xhs-monitor 采集')
      } else {
        setSyncMsg(result.message || '导入失败')
      }
    } catch {
      setSyncMsg('导入异常，请重试')
    } finally {
      setSyncing(false)
    }
  }

  return (
    <div className="crm-page">
      <div className="crm-toolbar">
        <span className="crm-page-subtitle">{notesWithLeads.length} 条笔记 · {notesWithLeads.filter(n => n.status === 'published').length} 已发布</span>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {syncMsg && <span className="crm-sync-msg">{syncMsg}</span>}
          <button className="crm-btn-primary" onClick={handleSync} disabled={syncing}>
            {syncing ? '同步中...' : '同步小红书笔记'}
          </button>
        </div>
      </div>
      <div className="crm-table-wrap">
        <table className="crm-table">
          <thead>
            <tr>
              <th>笔记标题</th><th style={{ width: 90 }}>发布时间</th><th style={{ width: 70 }}>状态</th>
              <th style={{ width: 80, textAlign: 'right' }}>浏览</th><th style={{ width: 60, textAlign: 'right' }}>赞</th>
              <th style={{ width: 60, textAlign: 'right' }}>评论</th>
              <th style={{ width: 100, textAlign: 'center' }}>带来客户</th>
            </tr>
          </thead>
          <tbody>
            {notesWithLeads.map(n => (
              <tr key={n.id} onClick={() => setEditingNote(n)}>
                <td className="crm-note-title">{n.title}</td>
                <td className="crm-muted">{n.publishDate ? fmtDate(n.publishDate) : '—'}</td>
                <td><span className={`crm-tag ${n.status === 'published' ? 'stage-closed' : 'stage-lead'}`}>{n.status === 'published' ? '已发布' : '草稿'}</span></td>
                <td className="crm-mono crm-num">{n.views.toLocaleString()}</td>
                <td className="crm-mono crm-num">{n.likes}</td>
                <td className="crm-mono crm-num">{n.comments}</td>
                <td style={{ textAlign: 'center' }}>
                  <button className="crm-link-btn" onClick={e => { e.stopPropagation(); setFilterNoteId(n.id); setTab('customers') }}>
                    {n.leads} 人 <ChevronRight size={12} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ==================== Customer Modal ====================
function CustomerModal({ customer, notes, onSave, onDelete, onClose }: {
  customer: Partial<Customer>
  notes: Note[]
  onSave: (c: Partial<Customer> & { id?: string }) => void
  onDelete?: () => void
  onClose: () => void
}) {
  const [form, setForm] = useState({
    name: customer.name || '', phone: customer.phone || '', wechat: customer.wechat || '',
    source: customer.source || 'xiaohongshu', sourceNoteId: customer.sourceNoteId || '',
    stage: customer.stage || 'lead', houseType: customer.houseType || '',
    budget: customer.budget || '', style: customer.style || '',
    followUpDate: customer.followUpDate || '', followUpNote: customer.followUpNote || '',
    notes: customer.notes || '',
  })
  const h = (f: string, v: string) => setForm(p => ({ ...p, [f]: v }))

  return (
    <div className="crm-modal-overlay" onClick={onClose}>
      <div className="crm-modal" onClick={e => e.stopPropagation()}>
        <div className="crm-modal-header">
          <span className="crm-modal-title">{customer.id ? '编辑客户' : '添加客户'}</span>
          <button className="crm-modal-close" onClick={onClose}><X size={18} /></button>
        </div>
        <div className="crm-modal-body">
          <div className="crm-form-row">
            <div className="crm-form-group" style={{ flex: 2 }}>
              <label className="crm-form-label">姓名 *</label>
              <input className="crm-form-input" value={form.name} onChange={e => h('name', e.target.value)} placeholder="客户姓名/称呼" />
            </div>
            <div className="crm-form-group">
              <label className="crm-form-label">阶段</label>
              <select className="crm-form-input" value={form.stage} onChange={e => h('stage', e.target.value)}>
                {STAGES.map(s => <option key={s.id} value={s.id}>{s.icon} {s.label}</option>)}
              </select>
            </div>
          </div>
          <div className="crm-form-row">
            <div className="crm-form-group"><label className="crm-form-label">手机号</label><input className="crm-form-input" value={form.phone} onChange={e => h('phone', e.target.value)} /></div>
            <div className="crm-form-group"><label className="crm-form-label">微信号</label><input className="crm-form-input" value={form.wechat} onChange={e => h('wechat', e.target.value)} /></div>
          </div>
          <div className="crm-form-row">
            <div className="crm-form-group">
              <label className="crm-form-label">来源渠道</label>
              <select className="crm-form-input" value={form.source} onChange={e => h('source', e.target.value)}>
                {SOURCES.map(s => <option key={s.id} value={s.id}>{s.icon} {s.label}</option>)}
              </select>
            </div>
            {form.source === 'xiaohongshu' && (
              <div className="crm-form-group">
                <label className="crm-form-label">来源笔记</label>
                <select className="crm-form-input" value={form.sourceNoteId || ''} onChange={e => h('sourceNoteId', e.target.value)}>
                  <option value="">-- 选择 --</option>
                  {notes.map(n => <option key={n.id} value={n.id}>{n.title.slice(0, 20)}</option>)}
                </select>
              </div>
            )}
          </div>
          <div className="crm-form-row">
            <div className="crm-form-group"><label className="crm-form-label">户型</label><input className="crm-form-input" value={form.houseType} onChange={e => h('houseType', e.target.value)} /></div>
            <div className="crm-form-group"><label className="crm-form-label">预算</label><input className="crm-form-input" value={form.budget} onChange={e => h('budget', e.target.value)} /></div>
            <div className="crm-form-group"><label className="crm-form-label">风格</label>
              <select className="crm-form-input" value={form.style} onChange={e => h('style', e.target.value)}>
                <option value="">-- 选择 --</option>
                <option value="意式极简">意式极简</option>
                <option value="法式风格">法式风格</option>
              </select>
            </div>
          </div>
          <div className="crm-form-row">
            <div className="crm-form-group"><label className="crm-form-label">下次跟进日期</label><input type="date" className="crm-form-input" value={form.followUpDate} onChange={e => h('followUpDate', e.target.value)} /></div>
            <div className="crm-form-group"><label className="crm-form-label">跟进备注</label><input className="crm-form-input" value={form.followUpNote} onChange={e => h('followUpNote', e.target.value)} placeholder="客户说了什么" /></div>
          </div>
          <div className="crm-form-group">
            <label className="crm-form-label">沟通记录</label>
            <textarea className="crm-form-textarea" value={form.notes} onChange={e => h('notes', e.target.value)} rows={3} />
          </div>
        </div>
        <div className="crm-modal-footer">
          {onDelete && <button className="crm-btn-ghost crm-btn-danger" onClick={onDelete}>删除</button>}
          <div style={{ flex: 1 }} />
          <button className="crm-btn-ghost" onClick={onClose}>取消</button>
          <button className="crm-btn-primary" onClick={() => { if (form.name.trim()) onSave({ id: customer.id, ...form }) }}>保存</button>
        </div>
      </div>
    </div>
  )
}

// ==================== Note Modal ====================
function NoteModal({ note, onSave, onClose }: {
  note: Partial<Note>
  onSave: (n: Partial<Note> & { id?: string }) => void
  onClose: () => void
}) {
  const [form, setForm] = useState({
    title: note.title || '', publishDate: note.publishDate || '',
    status: note.status || 'draft', views: note.views || 0, likes: note.likes || 0, comments: note.comments || 0,
  })
  const h = (f: string, v: string | number) => setForm(p => ({ ...p, [f]: v }))

  return (
    <div className="crm-modal-overlay" onClick={onClose}>
      <div className="crm-modal crm-modal-sm" onClick={e => e.stopPropagation()}>
        <div className="crm-modal-header">
          <span className="crm-modal-title">{note.id ? '编辑笔记' : '添加笔记'}</span>
          <button className="crm-modal-close" onClick={onClose}><X size={18} /></button>
        </div>
        <div className="crm-modal-body">
          <div className="crm-form-group">
            <label className="crm-form-label">标题 *</label>
            <input className="crm-form-input" value={form.title} onChange={e => h('title', e.target.value)} />
          </div>
          <div className="crm-form-row">
            <div className="crm-form-group">
              <label className="crm-form-label">状态</label>
              <select className="crm-form-input" value={form.status} onChange={e => h('status', e.target.value)}>
                <option value="published">已发布</option>
                <option value="draft">草稿</option>
              </select>
            </div>
            <div className="crm-form-group">
              <label className="crm-form-label">发布日期</label>
              <input type="date" className="crm-form-input" value={form.publishDate} onChange={e => h('publishDate', e.target.value)} />
            </div>
          </div>
          {form.status === 'published' && (
            <div className="crm-form-row">
              <div className="crm-form-group"><label className="crm-form-label">浏览</label><input type="number" className="crm-form-input" value={form.views} onChange={e => h('views', parseInt(e.target.value) || 0)} /></div>
              <div className="crm-form-group"><label className="crm-form-label">赞</label><input type="number" className="crm-form-input" value={form.likes} onChange={e => h('likes', parseInt(e.target.value) || 0)} /></div>
              <div className="crm-form-group"><label className="crm-form-label">评论</label><input type="number" className="crm-form-input" value={form.comments} onChange={e => h('comments', parseInt(e.target.value) || 0)} /></div>
            </div>
          )}
        </div>
        <div className="crm-modal-footer">
          <button className="crm-btn-ghost" onClick={onClose}>取消</button>
          <button className="crm-btn-primary" onClick={() => { if (form.title.trim()) onSave({ id: note.id, ...form }) }}>保存</button>
        </div>
      </div>
    </div>
  )
}
