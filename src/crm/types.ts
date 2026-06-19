export interface Note {
  id: string; title: string; publishDate: string; status: 'published' | 'draft'
  views: number; likes: number; comments: number
  account: string
}

export interface Customer {
  id: string; name: string; phone: string; wechat: string
  source: 'xiaohongshu' | 'referral' | 'other'; sourceNoteId: string | null
  stage: 'lead' | 'wechat' | 'communicating' | 'followup' | 'closed'
  houseType: string; budget: string; style: string
  followUpDate: string; followUpNote: string
  dealAmount: number | null; notes: string
  createdAt: string; updatedAt: string
  projectId?: string
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
