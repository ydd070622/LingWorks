import { useState, useEffect, useMemo, useCallback } from 'react'
import { toast } from 'sonner'
import { CloudUpload, CloudDownload, ChevronDown } from 'lucide-react'
import type { CRMData, Customer, EnrichedCustomer, FollowUp, Project, BuildProject, DiscardedProject, CompletedBuildProject, ManualDesignProjectInput, ManualBuildProjectInput } from '../crm/types'
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
import BuildOverviewPage from '../crm/BuildOverviewPage'
import BuildProgressPage from '../crm/BuildProgressPage'
import DesignOverviewPage from '../crm/DesignOverviewPage'
import DesignProgressPage from '../crm/DesignProgressPage'
import DiscardedProjectsPage from '../crm/DiscardedProjectsPage'
import CompletedBuildsPage from '../crm/CompletedBuildsPage'

export default function CRMPanel() {
  const [data, setData] = useState<CRMData>(createDefaultData)
  const [tab, setTab] = useState<string>('workbench')
  const [viewMode, setViewMode] = useState<'table' | 'kanban'>('table')
  const [editingCustomer, setEditingCustomer] = useState<Partial<Customer> | null>(null)
  const [editingContract, setEditingContract] = useState(false)
  const [contractPrefillCustomerId, setContractPrefillCustomerId] = useState<string | null>(null)
  const [viewingContract, setViewingContract] = useState<Customer | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [syncStatus, setSyncStatus] = useState({ configured: false, lastSyncAt: '' })
  const [syncing, setSyncing] = useState(false)
  const [followUpFilter, setFollowUpFilter] = useState<{ start: string; end: string } | null>(null)
  const [expandedMenus, setExpandedMenus] = useState<Set<string>>(new Set())

  useEffect(() => {
    const load = async () => {
      // 数据迁移：给老客户补新字段默认值（无感升级），同时剥离废弃字段
      const migrate = (raw: any): CRMData => {
        const { accounts, notes, ...rest } = raw
        const customers: Customer[] = (raw.customers || []).map((c: any) => {
          const contractBase = c.stage === 'closed' ? {
            contractStatus: c.contractStatus || 'signed' as const,
            paymentPlan: c.paymentPlan?.length ? c.paymentPlan : [],
            signDate: c.signDate || '',
          } : {}
          let followUpHistory = c.followUpHistory
          if (!followUpHistory) {
            if (c.followUpNote && c.followUpNote.trim()) {
              followUpHistory = [{ id: 'fu_mig_' + c.id, date: c.updatedAt || c.createdAt || todayStr(), content: c.followUpNote, nextDate: c.followUpDate || undefined }]
            } else { followUpHistory = [] }
          }
          return { ...c, recordDate: c.recordDate || c.createdAt || '', stylePreference: c.stylePreference || '', community: c.community || '', houseArea: c.houseArea || '', ...contractBase, followUpHistory, contractArchived: c.contractArchived ?? false }
        })
        // Clean orphan projects (customer deleted but project remains)
        const custIds = new Set(customers.map(c => c.id))
        const projects = (raw.projects || []).filter((p: any) => custIds.has(p.customerId))
        return {
          ...rest,
          projects,
          buildProjects: raw.buildProjects || [],
          discardedProjects: raw.discardedProjects || [],
          completedBuildProjects: raw.completedBuildProjects || [],
          designers: raw.designers || [],
          customers,
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

  const batchUpdate = useCallback((fn: (data: CRMData) => CRMData) => {
    setData(prev => {
      const next = fn(prev)
      if (window.electronAPI) {
        window.electronAPI.setStore(STORAGE_KEY, next)
      } else {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
      }
      return next
    })
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
    if (!confirm('确定删除？相关项目也会同步删除。')) return
    persist({
      ...data,
      customers: data.customers.filter(c => c.id !== id),
      projects: (data.projects || []).filter(p => p.customerId !== id),
    })
    toast.success('已删除客户及关联项目')
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
    data.customers.filter(c => c.followUpDate && c.stage !== 'closed' && !c.archived)
      .map(c => ({ ...c, diff: daysDiff(c.followUpDate, ts) }))
      .sort((a, b) => a.diff - b.diff),
    [data.customers, ts])
  const todayCount = followUps.filter(c => c.diff <= 0).length
  const overdueCount = followUps.filter(c => c.diff < 0).length
  const closedCusts = data.customers.filter(c => c.stage === 'closed')

  const planningProjects = useMemo(() =>
    (data.projects || []).filter(p => !p.completedDate),
    [data.projects])
  const meetingProjects = useMemo(() =>
    (data.projects || [])
      .filter(p => !!p.completedDate && data.customers.find(c => c.id === p.customerId)?.stage !== 'closed')
      .sort((a, b) => b.completedDate!.localeCompare(a.completedDate!)),
    [data.projects, data.customers])
  const buildProjects = useMemo(() =>
    (data.buildProjects || []),
    [data.buildProjects])
  const discardedProjects = useMemo(() =>
    (data.discardedProjects || []),
    [data.discardedProjects])
  const completedBuildProjects = useMemo(() =>
    (data.completedBuildProjects || []),
    [data.completedBuildProjects])

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
    setTab('meeting')
    toast.success('项目已移至「待约洽谈」')
  }, [data, persist, setTab])

  const uncompleteProject = useCallback((id: string) => {
    persist({
      ...data,
      projects: (data.projects || []).map(p => p.id === id ? { ...p, completedDate: null } : p)
    })
    setTab('planning')
    toast.success('项目已退回「平面规划中」')
  }, [data, persist, setTab])

  const signContract = useCallback((id: string) => {
    const proj = data.projects?.find(p => p.id === id)
    if (!proj) return
    setContractPrefillCustomerId(proj.customerId)
    setEditingContract(true)
  }, [data.projects])

  const deleteProject = useCallback((id: string) => {
    persist({ ...data, projects: (data.projects || []).filter(p => p.id !== id) })
    toast.success('已删除项目')
  }, [data, persist])

  const updateProject = useCallback((id: string, upd: Partial<Project>) => {
    persist({ ...data, projects: (data.projects || []).map(p => p.id === id ? { ...p, ...upd } : p) })
  }, [data, persist])

  const discardProject = useCallback((projectId: string, reason: string, note: string) => {
    const project = (data.projects || []).find(p => p.id === projectId)
    if (!project) return
    const cust = data.customers.find(c => c.id === project.customerId)
    const discarded: DiscardedProject = {
      id: 'discard_' + Date.now(),
      customerId: project.customerId,
      projectId: project.id,
      stage: project.completedDate ? 'meeting' : 'planning',
      projectName: cust?.community ? `${cust.community}·${cust.name}` : `${cust?.name || '客户'}方案`,
      designer: project.designer,
      reason,
      note,
      discardedDate: ts,
      originalProject: project,
    }
    persist({
      ...data,
      projects: (data.projects || []).filter(p => p.id !== projectId),
      discardedProjects: [...(data.discardedProjects || []), discarded],
    })
    toast.success('方案已归档到「废弃方案」')
    setExpandedMenus(prev => new Set(prev).add('archived'))
    setTab('discarded-projects')
  }, [data, persist, ts])

  const discardDesignProject = useCallback((customerId: string, reason: string, note: string) => {
    const cust = data.customers.find(c => c.id === customerId)
    if (!cust) return
    const project = (data.projects || []).find(p => p.customerId === customerId)
    const discarded: DiscardedProject = {
      id: 'discard_' + Date.now(),
      customerId,
      projectId: project?.id,
      stage: 'design',
      projectName: cust.community ? `${cust.community}·${cust.name}` : `${cust.name}设计项目`,
      designer: project?.designer || '',
      reason,
      note,
      discardedDate: ts,
      originalProject: project,
    }
    persist({
      ...data,
      customers: data.customers.map(c => c.id === customerId ? { ...c, contractArchived: true } : c),
      discardedProjects: [...(data.discardedProjects || []), discarded],
    })
    toast.success('设计项目已归档到「废弃方案」')
    setExpandedMenus(prev => new Set(prev).add('archived'))
    setTab('discarded-projects')
  }, [data, persist, ts])

  const restoreDiscardedProject = useCallback((id: string) => {
    const item = (data.discardedProjects || []).find(p => p.id === id)
    if (!item) return
    const restoredProject: Project = item.originalProject || {
      id: item.projectId || 'proj_' + Date.now(),
      customerId: item.customerId,
      startDate: ts,
      estEndDate: ts,
      designer: item.designer,
      completedDate: item.stage === 'planning' ? null : ts,
    }
    persist({
      ...data,
      customers: data.customers.map(c => c.id === item.customerId ? { ...c, contractArchived: false } : c),
      projects: item.stage === 'design' ? (data.projects || []) : [...(data.projects || []), restoredProject],
      discardedProjects: (data.discardedProjects || []).filter(p => p.id !== id),
    })
    toast.success('废弃方案已恢复')
    setTab(item.stage === 'planning' ? 'planning' : item.stage === 'meeting' ? 'meeting' : 'design-overview')
  }, [data, persist, ts])

  const addManualDesignProject = useCallback((input: ManualDesignProjectInput) => {
    const now = Date.now()
    const customerId = 'c_manual_design_' + now
    const projectId = 'proj_manual_design_' + now
    const signDate = input.signDate || ts
    const remark = input.remark.trim()
    const customer: Customer = {
      id: customerId,
      name: input.name.trim(),
      phone: input.phone.trim(),
      wechat: '',
      stage: 'closed',
      houseType: '',
      city: '',
      community: input.community.trim(),
      houseArea: input.houseArea.trim(),
      style: '',
      recordDate: signDate,
      stylePreference: '',
      followUpDate: '',
      followUpNote: '',
      dealAmount: null,
      notes: '手动补录设计项目',
      createdAt: ts,
      updatedAt: ts,
      contractStatus: 'signed',
      paymentPlan: [],
      signDate,
      followUpHistory: [],
      contractArchived: false,
      designProjectName: input.projectName.trim(),
      designProjectDetail: input.detail.trim(),
      designRemark: remark,
      designRemarkHistory: remark ? [{ id: 'design_remark_' + now, date: ts, content: remark }] : [],
      manualSource: 'design',
    }
    const project: Project = {
      id: projectId,
      customerId,
      startDate: signDate,
      estEndDate: input.planEndDate || '',
      designer: input.designer.trim(),
      completedDate: ts,
    }
    persist({
      ...data,
      customers: [...data.customers, customer],
      projects: [...(data.projects || []), project],
    })
    toast.success('补录设计项目已添加')
    setExpandedMenus(prev => new Set(prev).add('design'))
    setTab('design-overview')
  }, [data, persist, ts])

  const addBuildProject = useCallback((bp: Omit<BuildProject, 'id'>) => {
    const p: BuildProject = { id: 'bproj_' + Date.now(), ...bp }
    persist({ ...data, buildProjects: [...(data.buildProjects || []), p] })
    toast.success('施工项目已添加')
  }, [data, persist])

  const updateBuildProject = useCallback((id: string, upd: Partial<BuildProject>) => {
    persist({ ...data, buildProjects: (data.buildProjects || []).map(p => p.id === id ? { ...p, ...upd } : p) })
  }, [data, persist])

  const deleteBuildProject = useCallback((id: string) => {
    if (!confirm('确定删除此施工项目？')) return
    persist({ ...data, buildProjects: (data.buildProjects || []).filter(p => p.id !== id) })
    toast.success('施工项目已删除')
  }, [data, persist])

  const createBuildProjectFromDesign = useCallback((customerId: string, planEndDate?: string, detail?: string) => {
    const cust = data.customers.find(c => c.id === customerId)
    if (!cust) return
    if ((data.buildProjects || []).some(p => p.customerId === customerId)) {
      toast.error('该客户已有施工项目')
      return
    }
    const designProject = (data.projects || []).find(p => p.customerId === customerId)
    const p: BuildProject = {
      id: 'bproj_' + Date.now(),
      customerId,
      projectName: cust.community ? `${cust.community}·${cust.name}` : `${cust.name}施工项目`,
      designer: designProject?.designer || '',
      signDate: cust.signDate || ts,
      planEndDate: planEndDate || '',
      progress: '',
      detail: detail || '由设计阶段转入施工',
    }
    persist({ ...data, buildProjects: [...(data.buildProjects || []), p] })
    toast.success('已转入施工阶段')
    setExpandedMenus(prev => new Set(prev).add('build'))
    setTab('build-overview')
  }, [data, persist, ts])

  const addManualBuildProject = useCallback((input: ManualBuildProjectInput) => {
    const now = Date.now()
    const customerId = 'c_manual_build_' + now
    const signDate = input.signDate || ts
    const customer: Customer = {
      id: customerId,
      name: input.name.trim(),
      phone: input.phone.trim(),
      wechat: '',
      stage: 'closed',
      houseType: '',
      city: '',
      community: input.community.trim(),
      houseArea: input.houseArea.trim(),
      style: '',
      recordDate: signDate,
      stylePreference: '',
      followUpDate: '',
      followUpNote: '',
      dealAmount: null,
      notes: '手动补录施工项目',
      createdAt: ts,
      updatedAt: ts,
      contractStatus: 'signed',
      paymentPlan: [],
      signDate,
      followUpHistory: [],
      contractArchived: false,
      designProjectName: input.projectName.trim(),
      manualSource: 'build',
    }
    const project: BuildProject = {
      id: 'bproj_manual_' + now,
      customerId,
      projectName: input.projectName.trim(),
      designer: input.designer.trim(),
      signDate,
      planEndDate: input.planEndDate || '',
      progress: '',
      detail: input.remark.trim(),
      thisWeekWork: input.thisWeekWork.trim(),
      thisWeekMaterials: input.thisWeekMaterials.trim(),
      thisWeekIssues: input.thisWeekIssues.trim(),
      nextWeekPlan: input.nextWeekPlan.trim(),
      remark: input.remark.trim(),
    }
    persist({
      ...data,
      customers: [...data.customers, customer],
      buildProjects: [...(data.buildProjects || []), project],
    })
    toast.success('补录施工项目已添加')
    setExpandedMenus(prev => new Set(prev).add('build'))
    setTab('build-overview')
  }, [data, persist, ts])

  const completeBuildProject = useCallback((id: string, note?: string) => {
    const project = (data.buildProjects || []).find(p => p.id === id)
    if (!project) return
    const completed: CompletedBuildProject = {
      ...project,
      completedDate: ts,
      completedNote: note || '',
    }
    persist({
      ...data,
      buildProjects: (data.buildProjects || []).filter(p => p.id !== id),
      completedBuildProjects: [...(data.completedBuildProjects || []), completed],
    })
    toast.success('施工项目已归档到「完工归档」')
    setExpandedMenus(prev => new Set(prev).add('archived'))
    setTab('completed-builds')
  }, [data, persist, ts])

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

  const rollbackContract = useCallback((id: string) => {
    const cust = data.customers.find(c => c.id === id)
    if (!cust) return
    persist({
      ...data,
      customers: data.customers.map(c => c.id === id ? {
        ...c, stage: 'communicating' as const, dealAmount: null,
        contractStatus: undefined, paymentPlan: [], signDate: '', projectId: undefined,
      } : c),
      projects: (data.projects || []).map(p =>
        p.customerId === id ? { ...p, completedDate: null } : p
      ),
    })
    toast.success(`${cust.name} 已退回待约洽谈`)
  }, [data, persist])

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

  const sharedProps = { data, followUps, todayCount, overdueCount, closedCusts, leadCount: 0, enrichCust, updateCust, addCust, deleteCust, deleteCusts, moveCust, viewMode, setViewMode, setEditingCustomer, setEditingContract, setViewingContract, setTab, followUpFilter, setFollowUpFilter, planningProjects, meetingProjects, buildProjects, addProject, completeProject, uncompleteProject, signContract, deleteProject, updateProject, discardProject, discardDesignProject, restoreDiscardedProject, discardedProjects, addManualDesignProject, addBuildProject, updateBuildProject, deleteBuildProject, createBuildProjectFromDesign, addManualBuildProject, completeBuildProject, completedBuildProjects, designers: data.designers || [], addDesigner, deleteDesigner, archivedContracts, archiveContract, restoreContract, restoreContracts, rollbackContract }

  const getTabBadge = (id: string): { count: number; cls: string } | null => {
    const activeContracts = closedCusts.filter(c => !c.contractArchived)
    const counts: Record<string, { count: number; cls: string }> = {
      workbench: { count: todayCount, cls: overdueCount > 0 ? 'danger' : 'warn' },
      planning: { count: planningProjects.length, cls: 'info' },
      meeting: { count: meetingProjects.length, cls: 'info' },
      'design-overview': { count: activeContracts.length, cls: 'info' },
      'design-progress': { count: activeContracts.length, cls: 'info' },
      'build-overview': { count: buildProjects.length, cls: 'info' },
      'build-progress': { count: buildProjects.length, cls: 'info' },
      contracts: { count: closedCusts.length, cls: 'success' },
      'archived-customers': { count: data.customers.filter(c => !!c.archived).length, cls: 'info' },
      'discarded-projects': { count: discardedProjects.length, cls: 'danger' },
      'completed-builds': { count: completedBuildProjects.length, cls: 'success' },
      'archived-contracts': { count: archivedContracts.length, cls: 'info' },
    }
    const badge = counts[id]
    return badge && badge.count > 0 ? badge : null
  }

  const sidebarItems = TABS.map((item, i) => {
    let badge: { count: number; cls: string } | null = null
    if (i === 0) badge = getTabBadge('workbench')
    else if (i === 2) badge = (planningProjects.length + meetingProjects.length) > 0 ? { count: planningProjects.length + meetingProjects.length, cls: 'info' } : null
    else if (i === 3) {
      const count = closedCusts.filter(c => !c.contractArchived).length
      badge = count > 0 ? { count, cls: 'info' } : null
    }
    else if (i === 4) badge = buildProjects.length > 0 ? { count: buildProjects.length, cls: 'info' } : null
    else if (i === 5) badge = getTabBadge('contracts')
    else if (i === 6) {
      const count = data.customers.filter(c => !!c.archived).length + discardedProjects.length + completedBuildProjects.length + archivedContracts.length
      badge = count > 0 ? { count, cls: 'info' } : null
    }
    return { ...item, badge }
  })

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
                {hasChildren && isExpanded && item.children!.map((child: { id: string; label: string }) => {
                  const childBadge = getTabBadge(child.id)
                  return (
                    <div
                      key={child.id}
                      className={`crm-sidebar-item crm-sidebar-sub-item ${tab === child.id ? 'active' : ''}`}
                      onClick={() => setTab(child.id)}
                    >
                      <span>{child.label}</span>
                      {childBadge && <span className={`crm-sidebar-badge ${childBadge.cls}`}>{childBadge.count}</span>}
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
          {tab === 'planning' && <ActiveProjectsPage {...sharedProps} batchUpdate={batchUpdate} />}
          {tab === 'meeting' && <DoneProjectsPage {...sharedProps} />}
          {tab === 'design-overview' && <DesignOverviewPage {...sharedProps} />}
          {tab === 'design-progress' && <DesignProgressPage {...sharedProps} />}
          {tab === 'build-overview' && <BuildOverviewPage {...sharedProps} />}
          {tab === 'build-progress' && <BuildProgressPage {...sharedProps} />}
          {tab === 'contracts' && <ContractPage {...sharedProps} />}
          {tab === 'archived-customers' && <CrmArchivedPage {...sharedProps} />}
          {tab === 'discarded-projects' && <DiscardedProjectsPage {...sharedProps} />}
          {tab === 'completed-builds' && <CompletedBuildsPage {...sharedProps} />}
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
          customers={data.customers.filter(c => meetingProjects.some(p => p.customerId === c.id))}
          prefillId={contractPrefillCustomerId}
          onSaveNew={cust => { addCust(cust); setEditingContract(false); setContractPrefillCustomerId(null); setExpandedMenus(prev => new Set(prev).add('design')); setTab('design-overview') }}
          onUpdateExisting={(id, upd) => { updateCust(id, upd); setEditingContract(false); setContractPrefillCustomerId(null); setExpandedMenus(prev => new Set(prev).add('design')); setTab('design-overview') }}
          onClose={() => { setEditingContract(false); setContractPrefillCustomerId(null) }}
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
