import type { CRMData, Note, Customer } from './types'

export function createDefaultData(): CRMData {
  const now = new Date()
  const fmt = (d: Date) => d.toISOString().split('T')[0]
  const a = (d: Date, n: number) => { const r = new Date(d); r.setDate(r.getDate() + n); return r }
  const notes: Note[] = [
    { id: 'n1', title: '奶油风客厅改造实录，附软装清单', publishDate: '2026-06-08', status: 'published', views: 2341, likes: 187, comments: 43, account: '主账号' },
    { id: 'n2', title: '89平小三居，这样装显大20平', publishDate: '2026-06-02', status: 'published', views: 5620, likes: 423, comments: 89, account: '主账号' },
    { id: 'n3', title: '法式复古卧室，每个角落都是电影感', publishDate: '2026-05-28', status: 'published', views: 1892, likes: 156, comments: 32, account: '小号A' },
    { id: 'n4', title: '精装房改造避坑指南', publishDate: '', status: 'draft', views: 0, likes: 0, comments: 0, account: '主账号' },
    { id: 'n5', title: '15万预算装120平，附费用明细', publishDate: '2026-06-12', status: 'published', views: 3210, likes: 267, comments: 55, account: '小号A' },
    { id: 'n6', title: '原木风厨房，治愈系烟火气', publishDate: '', status: 'draft', views: 0, likes: 0, comments: 0, account: '小号B' },
  ]
  const customers: Customer[] = [
    { id: 'c1', name: '张女士', phone: '138****6789', wechat: 'zhang_xx', source: 'xiaohongshu', sourceNoteId: 'n1', stage: 'followup', houseType: '三室两厅', budget: '20万', style: '意式极简', followUpDate: fmt(a(now, 1)), followUpNote: '客户说6.19才有空', dealAmount: null, notes: '对意式极简很感兴趣，发了户型图。需等先生一起看方案。', createdAt: '2026-06-10', updatedAt: '2026-06-15' },
    { id: 'c2', name: '李先生', phone: '139****1234', wechat: 'li_design', source: 'referral', sourceNoteId: null, stage: 'communicating', houseType: '四室两厅', budget: '35万', style: '法式风格', followUpDate: '', followUpNote: '', dealAmount: null, notes: '老客户王姐介绍，看过案例集，意向明确。', createdAt: '2026-06-12', updatedAt: '2026-06-16' },
    { id: 'c3', name: '王女士', phone: '136****8901', wechat: 'wang_home', source: 'xiaohongshu', sourceNoteId: 'n2', stage: 'closed', houseType: '三室一厅', budget: '22万', style: '法式风格', followUpDate: '', followUpNote: '', dealAmount: 28000, notes: '已签合同，7月初开工。', createdAt: '2026-05-20', updatedAt: '2026-06-08' },
    { id: 'c4', name: '赵先生', phone: '137****4567', wechat: '', source: 'xiaohongshu', sourceNoteId: 'n3', stage: 'lead', houseType: '', budget: '', style: '法式风格', followUpDate: '', followUpNote: '', dealAmount: null, notes: '评论"怎么联系"，已回复微信，未添加。', createdAt: '2026-06-14', updatedAt: '2026-06-14' },
    { id: 'c5', name: '陈女士', phone: '135****7890', wechat: 'chen_chen', source: 'xiaohongshu', sourceNoteId: 'n1', stage: 'communicating', houseType: '两室两厅', budget: '15万', style: '意式极简', followUpDate: fmt(a(now, 3)), followUpNote: '6.21出差回来再聊', dealAmount: null, notes: '预算偏紧，户型小，需精简方案。', createdAt: '2026-06-11', updatedAt: '2026-06-15' },
    { id: 'c6', name: '刘女士', phone: '133****2345', wechat: 'liu_jia', source: 'xiaohongshu', sourceNoteId: 'n5', stage: 'wechat', houseType: '三室两厅', budget: '18万', style: '', followUpDate: '', followUpNote: '', dealAmount: null, notes: '刚加微信，还没深入沟通。', createdAt: '2026-06-15', updatedAt: '2026-06-15' },
    { id: 'c7', name: '周先生', phone: '132****6789', wechat: 'zhou_2024', source: 'xiaohongshu', sourceNoteId: 'n2', stage: 'closed', houseType: '四室两厅', budget: '40万', style: '意式极简', followUpDate: '', followUpNote: '', dealAmount: 42000, notes: '大户型全案，已签约，7月中旬开工。', createdAt: '2026-05-15', updatedAt: '2026-06-05' },
    { id: 'c8', name: '吴女士', phone: '131****0123', wechat: 'wu_design', source: 'referral', sourceNoteId: null, stage: 'followup', houseType: '两室一厅', budget: '12万', style: '法式风格', followUpDate: fmt(now), followUpNote: '今天联系确认方案', dealAmount: null, notes: '预算有限，基础改造。发了方案还没反馈。', createdAt: '2026-06-08', updatedAt: '2026-06-13' },
    { id: 'c9', name: '林先生', phone: '130****3456', wechat: '', source: 'xiaohongshu', sourceNoteId: 'n3', stage: 'lead', houseType: '', budget: '', style: '法式风格', followUpDate: '', followUpNote: '', dealAmount: null, notes: '私信问案例，发了案例集未回复。', createdAt: '2026-06-16', updatedAt: '2026-06-16' },
  ]
  return { accounts: ['主账号', '小号A', '小号B'], notes, customers }
}
