// 回款计划中的单笔收款记录
export interface Payment {
  id: string        // 'p' + Date.now() + 随机后缀
  label: string     // 阶段名：定金/进度款/尾款/自定义（如设计费）
  amount: number    // 金额（元）
  paid: boolean     // 是否已收款
  date: string      // 收款日期（YYYY-MM-DD），未收为空串
}

// 跟进历史中的单次跟进记录（追加写，永不覆盖）
export interface FollowUp {
  id: string        // 'fu' + Date.now() + 随机后缀
  date: string      // 跟进日期（YYYY-MM-DD，记录时的时间）
  content: string   // 跟进内容
  nextDate?: string // 约定的下次跟进日期（可选，YYYY-MM-DD）
}

export interface DiscardedProject {
  id: string
  customerId: string
  projectId?: string
  stage: 'planning' | 'meeting' | 'design'
  projectName: string
  designer: string
  reason: string
  note: string
  discardedDate: string
  originalProject?: Project
}

export interface CompletedBuildProject extends BuildProject {
  completedDate: string
  completedNote?: string
}

export interface Customer {
  id: string; name: string; phone: string; wechat: string
  source?: string; sourceNoteId?: string | null
  stage: 'lead' | 'wechat' | 'communicating' | 'followup' | 'closed'
  houseType: string; city: string; community: string; houseArea: string; style: string
  recordDate: string; stylePreference: string
  followUpDate: string; followUpNote: string
  dealAmount: number | null; notes: string
  createdAt: string; updatedAt: string
  projectId?: string
  // —— 合同生命周期 + 回款管理（仅 stage==='closed' 即成交后才有意义）——
  contractStatus?: 'signed' | 'progress' | 'done'   // 合同状态，默认 'signed'
  paymentPlan?: Payment[]                            // 回款计划，默认 []
  signDate?: string                                  // 签约日期（YYYY-MM-DD），独立于 updatedAt
  // —— 跟进历史（追加写，followUpNote 是最新一条的快照）——
  followUpHistory?: FollowUp[]                        // 跟进历史时间线，按时间正序，默认 []
  // —— 归档（放弃客户不会再出现在客户管理页面）——
  archived?: boolean
  // —— 合同归档（手动归档已完工合同）——
  contractArchived?: boolean
  // —— 设计阶段项目备注（独立于合同备注）——
  designProjectDetail?: string
  designProjectName?: string
  designRemark?: string
  designRemarkHistory?: FollowUp[]
  manualSource?: 'design' | 'build'
}

export interface ManualDesignProjectInput {
  projectName: string
  name: string
  phone: string
  community: string
  houseArea: string
  designer: string
  signDate: string
  planEndDate: string
  detail: string
  remark: string
}

export interface ManualBuildProjectInput {
  projectName: string
  name: string
  phone: string
  community: string
  houseArea: string
  designer: string
  signDate: string
  planEndDate: string
  thisWeekWork: string
  thisWeekMaterials: string
  thisWeekIssues: string
  nextWeekPlan: string
  remark: string
}

// 项目管理：平面规划中 / 待约洽谈
export interface Project {
  id: string              // 'proj_' + Date.now()
  customerId: string      // 关联客户 ID
  startDate: string       // 开始日期 YYYY-MM-DD
  estEndDate: string      // 预估完成日期 YYYY-MM-DD
  designer: string        // 设计师
  completedDate: string | null  // 确认完成日期，null=平面规划中，有值=待约洽谈
}

// 施工项目管理
export interface BuildProject {
  id: string                 // 'bproj_' + Date.now()
  projectName: string        // 项目名称
  customerId: string         // 业主 ID
  designer: string           // 设计师
  signDate: string           // 签约起始时间 YYYY-MM-DD
  planEndDate: string        // 计划完成时间 YYYY-MM-DD
  progress: string           // 进度（预留）
  detail: string             // 项目详情
  thisWeekWork?: string       // 本周施工内容
  thisWeekMaterials?: string  // 本周主材进场
  thisWeekIssues?: string     // 本周遗留问题
  nextWeekPlan?: string       // 下周计划施工内容
  remark?: string             // 备注
}

export interface CRMData {
  customers: Customer[]
  projects: Project[]
  buildProjects: BuildProject[]
  discardedProjects: DiscardedProject[]
  completedBuildProjects: CompletedBuildProject[]
  designers: string[]
}

export interface EnrichedCustomer extends Customer {}

export interface SharedProps {
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
  viewMode: 'table' | 'kanban'
  setViewMode: (v: 'table' | 'kanban') => void
  setEditingCustomer: (c: Partial<Customer> | null) => void
  setEditingContract: (v: boolean) => void
  setViewingContract: (c: Customer | null) => void
  setTab: (tab: string) => void
  followUpFilter: { start: string; end: string } | null
  setFollowUpFilter: (f: { start: string; end: string } | null) => void
  // 项目管理
  planningProjects: Project[]     // 平面规划中：无 completedDate
  meetingProjects: Project[]      // 待约洽谈：有 completedDate
  addProject: (proj: Omit<Project, 'id'>) => void
  completeProject: (id: string, completedDate: string) => void
  uncompleteProject: (id: string) => void
  signContract: (id: string) => void
  deleteProject: (id: string) => void
  designers: string[]
  addDesigner: (name: string) => void
  deleteDesigner: (name: string) => void
  updateProject: (id: string, upd: Partial<Project>) => void
  discardProject: (projectId: string, reason: string, note: string) => void
  discardDesignProject: (customerId: string, reason: string, note: string) => void
  restoreDiscardedProject: (id: string) => void
  discardedProjects: DiscardedProject[]
  addManualDesignProject: (input: ManualDesignProjectInput) => void
  // 合同归档
  archivedContracts: Customer[]
  archiveContract: (id: string) => void
  restoreContract: (id: string) => void
  restoreContracts: (ids: string[]) => void
  rollbackContract: (id: string) => void
  // 施工项目
  buildProjects: BuildProject[]
  addBuildProject: (p: Omit<BuildProject, 'id'>) => void
  updateBuildProject: (id: string, upd: Partial<BuildProject>) => void
  deleteBuildProject: (id: string) => void
  createBuildProjectFromDesign: (customerId: string, planEndDate?: string, detail?: string) => void
  addManualBuildProject: (input: ManualBuildProjectInput) => void
  completeBuildProject: (id: string, note?: string) => void
  completedBuildProjects: CompletedBuildProject[]
}
