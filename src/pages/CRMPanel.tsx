import { useState, useEffect, useMemo, useCallback } from 'react'
import type { CRMData, Customer, Note, EnrichedCustomer } from '../crm/types'
import { STAGES, SOURCES, TABS, STORAGE_KEY } from '../crm/constants'
import { today as todayStr, daysDiff } from '../crm/helpers'
import { createDefaultData } from '../crm/defaultData'
import Workbench from '../crm/Workbench'
import CustomerPage from '../crm/CustomerPage'
import LeadPoolPage from '../crm/LeadPoolPage'
import ContractPage from '../crm/ContractPage'
import DashboardPage from '../crm/DashboardPage'
import NotesPage from '../crm/NotesPage'
import CustomerModal from '../crm/CustomerModal'
import NoteModal from '../crm/NoteModal'
import ContractModal from '../crm/ContractModal'
import ContractDetailModal from '../crm/ContractDetailModal'

export default function CRMPanel() {
  const [data, setData] = useState<CRMData>(createDefaultData)
  const [tab, setTab] = useState<string>('workbench')
  const [viewMode, setViewMode] = useState<'table' | 'kanban'>('table')
  const [editingCustomer, setEditingCustomer] = useState<Partial<Customer> | null>(null)
  const [editingNote, setEditingNote] = useState<Partial<Note> | null>(null)
  const [editingContract, setEditingContract] = useState(false)
  const [viewingContract, setViewingContract] = useState<Customer | null>(null)
  const [filterNoteId, setFilterNoteId] = useState<string | null>(null)
  const [loaded, setLoaded] = useState(false)

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

  const ts = todayStr()

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
      dealAmount: cust.dealAmount ?? null, notes: cust.notes || '', createdAt: ts, updatedAt: ts,
      projectId: cust.projectId,
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
      account: note.account || (data.accounts && data.accounts[0]) || '',
    }
    persist({ ...data, notes: [...(data.notes || []), n] })
  }, [data, persist])

  const deleteNotes = useCallback((ids: string[]) => {
    if (!confirm(`确定删除选中的 ${ids.length} 条笔记？`)) return
    persist({ ...data, notes: data.notes.filter(n => !ids.includes(n.id)) })
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

  const sharedProps = { data, followUps, todayCount, overdueCount, closedCusts, leadCount, enrichCust, updateCust, addCust, deleteCust, deleteCusts, moveCust, updateNote, addNote, deleteNotes, viewMode, setViewMode, filterNoteId, setFilterNoteId, setEditingCustomer, setEditingNote, setEditingContract, setViewingContract, setTab }

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
      {editingContract && (
        <ContractModal
          customers={data.customers.filter(c => c.stage !== 'closed' && c.stage !== 'lead')}
          onSaveNew={cust => { addCust(cust); setEditingContract(false) }}
          onUpdateExisting={(id, upd) => { updateCust(id, upd); setEditingContract(false) }}
          onClose={() => setEditingContract(false)}
        />
      )}
      {viewingContract && (
        <ContractDetailModal
          contract={viewingContract}
          onSave={(id, upd) => { updateCust(id, upd); setViewingContract(null) }}
          onDelete={() => { deleteCust(viewingContract.id); setViewingContract(null) }}
          onClose={() => setViewingContract(null)}
        />
      )}
    </div>
  )
}
