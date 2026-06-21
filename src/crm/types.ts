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

export interface Note {
  id: string; title: string; publishDate: string; status: 'published' | 'draft'
  views: number; likes: number; comments: number
  account: string
  style: string
}

export interface Customer {
  id: string; name: string; phone: string; wechat: string
  source: 'xiaohongshu' | 'referral' | 'other'; sourceNoteId: string | null
  stage: 'lead' | 'wechat' | 'communicating' | 'followup' | 'closed'
  houseType: string; city: string; style: string
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
}

export interface CRMData { accounts: string[]; notes: Note[]; customers: Customer[] }

export interface EnrichedCustomer extends Customer {
  sourceLabel: string; sourceIcon: string
}

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
  updateNote: (id: string, upd: Partial<Note>) => void
  addNote: (note: Partial<Note>) => void
  deleteNotes: (ids: string[]) => void
  viewMode: 'table' | 'kanban'
  setViewMode: (v: 'table' | 'kanban') => void
  filterNoteId: string | null
  setFilterNoteId: (id: string | null) => void
  setEditingCustomer: (c: Partial<Customer> | null) => void
  setEditingNote: (n: Partial<Note> | null) => void
  setEditingContract: (v: boolean) => void
  setViewingContract: (c: Customer | null) => void
  setTab: (tab: string) => void
}
