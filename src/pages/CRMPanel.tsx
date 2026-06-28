import { useState, useEffect, useMemo, useCallback } from 'react'
import { toast } from 'sonner'
import { CloudUpload, CloudDownload, ChevronDown, Users, FileText } from 'lucide-react'
import type { CRMData, Customer, EnrichedCustomer, FollowUp, Project } from '../crm/types'
import { STAGES, TABS, STORAGE_KEY } from '../crm/constants'
import { today as todayStr, daysDiff } from '../crm/helpers'
import { createDefaultData } from '../crm/defaultData'
import Workbench from '../crm/Workbench'
import CustomerPage from '../crm/CustomerPage'
import ContractPage from '../crm/ContractPage'
import DashboardPage from '../crm/DashboardPage'
import CustomerModal from '../crm/CustomerModal'
import ContractModal from '../crm/ContractModal'
import ContractDetailModal from '../crm/ContractDetailModal'
import ActiveProjectsPage from '../crm/ActiveProjectsPage'
import DoneProjectsPage from '../crm/DoneProjectsPage'
import CrmArchivedPage from '../crm/CrmArchivedPage'
import ContractArchivePage from '../crm/ContractArchivePage'

export default function CRMPanel() {
  const [data, setData] = useState<CRMData>(createDefaultData)
  const [tab, setTab] = useState<string>('workbench')
  const [viewMode, setViewMode] = useState<'table' | 'kanban'>('table')
  const [editingCustomer, setEditingCustomer] = useState<Partial<Customer> | null>(null)
  const [editingContract, setEditingContract] = useState(false)
  const [viewingContract, setViewingContract] = useState<Customer | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [syncStatus, setSyncStatus] = useState({ configured: false, lastSyncAt: '' })
  const [syncing, setSyncing] = useState(false)
  const [followUpFilter, setFollowUpFilter] = useState<{ start: string; end: string } | null>(null)
  const [expandedMenus, setExpandedMenus] = useState<Set<string>>(new Set(['archived']))

  useEffect(() => {
    const load = async () => {
      // 数据迁移：给老客户补新字段默认值（无感升级），同时剥离废弃字段
      const migrate = (raw: any): CRMData => {
        const { accounts, notes, ...rest } = raw
        return {
          ...rest,
          projects: raw.projects || [],
          designers: raw.designers || [],
          customers: (raw.customers || []).map((c: any) => {
          // 合同字段（仅 closed 客户）
          const contractBase = c.stage === 'closed' ? {
            contractStatus: c.contractStatus || 'signed' as const,
            paymentPlan: c.paymentPlan?.length ? c.paymentPlan : [],
            signDate: c.signDate || '',
          } : {}
          // 跟进历史：已有则保留；老客户有 followUpNote 的，转成一条历史
          let followUpHistory = c.followUpHistory
          if (!followUpHistory) {
            if (c.followUpNote && c.followUpNote.trim()) {
              const entry: FollowUp = {
                id: 'fu_mig_' + c.id,
                date: c.updatedAt || c.createdAt || todayStr(),
                content: c.followUpNote,
                nextDate: c.followUpDate || undefined,
              }
              followUpHistory = [entry]
            } else {
              followUpHistory = []
            }
          }
          return { ...c, recordDate: c.recordDate || c.createdAt || '', stylePreference: c.stylePreference || '', community: c.community || '', houseArea: c.houseArea || '', ...contractBase, followUpHistory, contractArchived: c.contractArchived ?? false }
        }),
      }
      }
      if (window.electronAPI) {
        const saved = await window.electronAPI.getStore(STORAGE_KEY)
        if (saved && typeof saved === 'object' && Array.isArray(saved.customers)) {
          setData(migrate(saved as CRMData))
        }
      } else {
        const raw = localStorage.getItem(STORAGE_KEY)
        if (raw) {
          try {
            const parsed = JSON.parse(raw)
            if (parsed && Array.isArray(parsed.customers)) setData(migrate(parsed))
          } catch { /* use default */ }
        }
      }
      setLoaded(true)
      // Check sync status
      if (window.electronAPI?.syncStatus) {
        const ss = await window.electronAPI.syncStatus()
        setSyncStatus(ss)
      }
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

  const enrichCust = useCallback((c: Customer): EnrichedCustomer => c, [])

  const updateCust = useCallback((id: string, upd: Partial<Customer>) => {
    const oldCust = data.customers.find(c => c.id === id)
    let finalUpd = { ...upd }

    // 跟进备注变化时——记录新的跟进内容到历史
    if (oldCust && upd.followUpNote !== undefined && upd.followUpNote !== (oldCust.followUpNote || '') && upd.followUpHistory === undefined) {
      const newNote = (upd.followUpNote || '').trim()
      if (newNote) {
        const newEntry: FollowUp = {
          id: 'fu_' + Date.now(),
          date: ts,
          content: newNote,  // 记录新内容
          nextDate: upd.followUpDate !== undefined ? upd.followUpDate : oldCust.followUpDate || undefined,
        }
        finalUpd.followUpHistory = [...(oldCust.followUpHistory || []), newEntry]
      }
    }

    persist({ ...data, customers: data.customers.map(c => c.id === id ? { ...c, ...finalUpd, updatedAt: ts } : c) })
  }, [data, ts, persist])

  const addCust = useCallback((cust: Partial<Customer>) => {
    const c: Customer = {
      id: 'c' + Date.now(), name: cust.name || '', phone: cust.phone || '', wechat: cust.wechat || '',
      stage: cust.stage || 'lead', houseType: cust.houseType || '', city: cust.city || '',
      community: cust.community || '', houseArea: cust.houseArea || '',
      style: cust.style || '', recordDate: cust.recordDate || ts, stylePreference: cust.stylePreference || '',
      followUpDate: cust.followUpDate || '', followUpNote: cust.followUpNote || '',
      dealAmount: cust.dealAmount ?? null, notes: cust.notes || '', createdAt: ts, updatedAt: ts,
      projectId: cust.projectId,
      contractStatus: cust.contractStatus,
      paymentPlan: cust.paymentPlan,
      signDate: cust.signDate,
      followUpHistory: cust.followUpHistory ?? [],
    }
    persist({ ...data, customers: [...data.customers, c] })
  }, [data, ts, persist])

  const deleteCust = useCallback((id: string) => {
    if (!confirm('确定删除？')) return
    persist({ ...data, customers: data.customers.filter(c => c.id !== id) })
    toast.success('已删除客户')
  }, [data, persist])

  const deleteCusts = useCallback((ids: string[]) => {
    if (!confirm(`确定删除选中的 ${ids.length} 位客户？`)) return
    persist({ ...data, customers: data.customers.filter(c => !ids.includes(c.id)) })
    toast.success(`已删除 ${ids.length} 位客户`)
  }, [data, persist])

  const moveCust = useCallback((id: string, newStage: string) => {
    const upd: Partial<Customer> = { stage: newStage as Customer['stage'] }
    if (newStage === 'closed') {
      const amt = prompt('成交金额（元）：', '28000')
      if (!amt) return
      upd.dealAmount = parseInt(amt) || 0
      toast.success(`已成交 ¥${(parseInt(amt) || 0).toLocaleString()}`)
    } else {
      const cust = data.customers.find(c => c.id === id)
      toast.success(`${cust?.name || '客户'} → ${STAGES.find(s => s.id === newStage)?.label || newStage}`)
    }
    updateCust(id, upd)
  }, [updateCust, data.customers])

  const followUps = useMemo(() =>
    data.customers.filter(c => c.followUpDate && c.stage !== 'closed')
      .map(c => ({ ...c, diff: daysDiff(c.followUpDate, ts) }))
      .sort((a, b) => a.diff - b.diff),
    [data.customers, ts])
  const todayCount = followUps.filter(c => c.diff <= 0).length
  const overdueCount = followUps.filter(c => c.diff < 0).length
  const closedCusts = data.customers.filter(c => c.stage === 'closed')

  const activeProjects = useMemo(() =>
    (data.projects || []).filter(p => !p.completedDate),
    [data.projects])
  const doneProjects = useMemo(() =>
    (data.projects || []).filter(p => !!p.completedDate).sort((a, b) => b.completedDate!.localeCompare(a.completedDate!)),
    [data.projects])

  const archivedContracts = useMemo(() =>
    data.customers.filter(c => c.stage === 'closed' && c.contractArchived === true),
    [data.customers])

  const addProject = useCallback((proj: Omit<Project, 'id'>) => {
    const p: Project = { id: 'proj_' + Date.now(), ...proj }
    persist({ ...data, projects: [...(data.projects || []), p] })
  }, [data, persist])

  const completeProject = useCallback((id: string, completedDate: string) => {
    persist({
      ...data,
      projects: (data.projects || []).map(p => p.id === id ? { ...p, completedDate } : p)
    })
    setTab('done-projects')
    toast.success('项目已移至「已做项目」')
  }, [data, persist, setTab])

  const deleteProject = useCallback((id: string) => {
    persist({ ...data, projects: (data.projects || []).filter(p => p.id !== id) })
    toast.success('已删除项目')
  }, [data, persist])

  const updateProject = useCallback((id: string, upd: Partial<Project>) => {
    persist({ ...data, projects: (data.projects || []).map(p => p.id === id ? { ...p, ...upd } : p) })
  }, [data, persist])

  const archiveContract = useCallback((id: string) => {
    updateCust(id, { contractArchived: true })
    toast.success('合同已归档')
  }, [updateCust])

  const restoreContract = useCallback((id: string) => {
    updateCust(id, { contractArchived: false })
    toast.success('合同已恢复')
  }, [updateCust])

  const restoreContracts = useCallback((ids: string[]) => {
    ids.forEach(id => updateCust(id, { contractArchived: false }))
    toast.success(`已恢复 ${ids.length} 份合同`)
  }, [updateCust])

  const addDesigner = useCallback((name: string) => {
    if ((data.designers || []).includes(name)) return
    persist({ ...data, designers: [...(data.designers || []), name] })
  }, [data, persist])

  const deleteDesigner = useCallback((name: string) => {
    persist({ ...data, designers: (data.designers || []).filter(d => d !== name) })
  }, [data, persist])

  if (!loaded) return <div className="crm-loading">加载中...</div>

  const handleSyncUpload = async () => {
    if (syncing || !syncStatus.configured) return
    setSyncing(true)
    try {
      const result = await window.electronAPI!.syncUpload()
      if (result?.ok) {
        toast.success('已上传到云端 ✓')
        setSyncStatus(s => ({ ...s, lastSyncAt: new Date().toISOString() }))
      } else {
        toast.error(result?.error || '上传失败')
      }
    } catch (e: any) {
      toast.error(`上传异常: ${e.message}`)
    } finally { setSyncing(false) }
  }

  const handleSyncDownload = async () => {
    if (syncing || !syncStatus.configured) return
    setSyncing(true)
    try {
      const result = await window.electronAPI!.syncDownload()
      if (result?.ok) {
        toast.success('已从云端下载 ✓')
        setSyncStatus(s => ({ ...s, lastSyncAt: new Date().toISOString() }))
        // Reload CRM data
        window.location.reload()
      } else {
        toast.error(result?.error || '下载失败')
      }
    } catch (e: any) {
      toast.error(`下载异常: ${e.message}`)
    } finally { setSyncing(false) }
  }

  const fmtSyncTime = (iso: string) => {
    if (!iso) return ''
    const d = new Date(iso)
    return `${d.getMonth()+1}/${d.getDate()} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`
  }

  const sharedProps = { data, followUps, todayCount, overdueCount, closedCusts, leadCount: 0, enrichCust, updateCust, addCust, deleteCust, deleteCusts, moveCust, viewMode, setViewMode, setEditingCustomer, setEditingContract, setViewingContract, setTab, followUpFilter, setFollowUpFilter, activeProjects, doneProjects, addProject, completeProject, deleteProject, updateProject, designers: data.designers || [], addDesigner, deleteDesigner, archivedContracts, archiveContract, restoreContract, restoreContracts }

  const sidebarItems = [
    { ...TABS[0], badge: todayCount > 0 ? { count: todayCount, cls: overdueCount > 0 ? 'danger' : 'warn' } : null },
    { ...TABS[1], badge: null },
    { ...TABS[2], badge: activeProjects.length > 0 ? { count: activeProjects.length, cls: 'info' } : null },
    { ...TABS[3], badge: doneProjects.length > 0 ? { count: doneProjects.length, cls: 'success' } : null },
    { ...TABS[4], badge: closedCusts.length > 0 ? { count: closedCusts.length, cls: 'success' } : null },
    { ...TABS[5], badge: null, children: [
      { id: 'archived-customers', label: '客户归档', icon: Users },
      { id: 'archived-contracts', label: '合同归档', icon: FileText },
    ] as const },
    { ...TABS[6], badge: null },
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
            const hasChildren = 'children' in item && item.children && item.children.length > 0
            const isExpanded = expandedMenus.has(item.id)
            // Parent is "active" if any child tab is selected
            const isParentActive = hasChildren && item.children!.some((c: { id: string }) => c.id === tab)
            const isItemActive = tab === item.id

            const toggleMenu = () => {
              setExpandedMenus(prev => {
                const next = new Set(prev)
                if (next.has(item.id)) next.delete(item.id)
                else next.add(item.id)
                return next
              })
            }

            return (
              <div key={item.id}>
                <div
                  className={`crm-sidebar-item ${(isItemActive || isParentActive) ? 'active' : ''} ${hasChildren ? 'crm-sidebar-parent' : ''}`}
                  onClick={() => {
                    if (hasChildren) {
                      toggleMenu()
                    } else {
                      setTab(item.id)
                    }
                  }}
                >
                  <span className="crm-sidebar-item-icon"><Icon size={15} /></span>
                  <span>{item.label}</span>
                  {hasChildren && (
                    <ChevronDown size={12} className={`crm-sidebar-chevron ${isExpanded ? 'open' : ''}`} />
                  )}
                  {item.badge && <span className={`crm-sidebar-badge ${item.badge.cls}`}>{item.badge.count}</span>}
                </div>
                {hasChildren && isExpanded && item.children!.map((child: { id: string; label: string; icon: any }) => {
                  const ChildIcon = child.icon
                  return (
                    <div
                      key={child.id}
                      className={`crm-sidebar-item crm-sidebar-sub-item ${tab === child.id ? 'active' : ''}`}
                      onClick={() => setTab(child.id)}
                    >
                      <span className="crm-sidebar-item-icon"><ChildIcon size={13} /></span>
                      <span>{child.label}</span>
                    </div>
                  )
                })}
              </div>
            )
          })}
        </div>
        {syncStatus.configured && (
          <div className="crm-sidebar-sync">
            <div className="crm-sidebar-sync-row">
              <button className="crm-sidebar-sync-btn upload" onClick={handleSyncUpload} disabled={syncing} title="上传到云端">
                <CloudUpload size={13} /><span>上传</span>
              </button>
              <button className="crm-sidebar-sync-btn download" onClick={handleSyncDownload} disabled={syncing} title="从云端下载">
                <CloudDownload size={13} /><span>下载</span>
              </button>
            </div>
            {syncStatus.lastSyncAt && (
              <div className="crm-sidebar-sync-time">已同步 {fmtSyncTime(syncStatus.lastSyncAt)}</div>
            )}
          </div>
        )}
      </div>
      <div className="crm-main">
        <div className="crm-content">
          {tab === 'workbench' && <Workbench {...sharedProps} />}
          {tab === 'customers' && <CustomerPage {...sharedProps} />}
          {tab === 'active-projects' && <ActiveProjectsPage {...sharedProps} />}
          {tab === 'done-projects' && <DoneProjectsPage {...sharedProps} />}
          {tab === 'contracts' && <ContractPage {...sharedProps} />}
          {tab === 'archived-customers' && <CrmArchivedPage {...sharedProps} />}
          {tab === 'archived-contracts' && <ContractArchivePage {...sharedProps} />}
          {tab === 'dashboard' && <DashboardPage {...sharedProps} />}
        </div>
      </div>
      {editingCustomer && (
        <CustomerModal
          customer={editingCustomer}
          onSave={c => { c.id ? updateCust(c.id, c) : addCust(c); setEditingCustomer(null) }}
          onDelete={editingCustomer.id ? () => { deleteCust(editingCustomer.id!); setEditingCustomer(null) } : undefined}
          onClose={() => setEditingCustomer(null)}
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
          onArchive={() => { archiveContract(viewingContract.id); setViewingContract(null) }}
          onClose={() => setViewingContract(null)}
        />
      )}
    </div>
  )
}
