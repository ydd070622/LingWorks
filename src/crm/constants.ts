import { LayoutDashboard, Users, FileText, BarChart3, Hammer, CheckCircle, Archive } from 'lucide-react'
import type { Payment } from './types'

export const STAGES = [
  { id: 'lead', label: '待引流', icon: '📥', dotColor: '#3b82f6', cls: 'stage-lead' },
  { id: 'wechat', label: '已加微信', icon: '💬', dotColor: '#8b5cf6', cls: 'stage-wechat' },
  { id: 'communicating', label: '沟通中', icon: '🤝', dotColor: '#6366f1', cls: 'stage-communicating' },
  { id: 'followup', label: '待跟进', icon: '⏰', dotColor: '#f59e0b', cls: 'stage-followup' },
  { id: 'closed', label: '已成交', icon: '✅', dotColor: '#22c55e', cls: 'stage-closed' },
] as const

// 合同生命周期状态（仅成交后 stage==='closed' 时有意义），自由跳转不强制顺序
export const CONTRACT_STATUS = [
  { id: 'signed',   label: '已签约', icon: '📋', color: 'blue' },
  { id: 'progress', label: '施工中', icon: '🔨', color: 'yellow' },
  { id: 'done',     label: '已完工', icon: '✅', color: 'green' },
] as const

// 标准回款分期模板：定金 30% + 进度款 40% + 尾款 30%（尾款取整补差，保证三期之和=总额）
export function defaultPaymentPlan(totalAmount: number): Payment[] {
  const deposit = Math.round(totalAmount * 0.3)
  const progress = Math.round(totalAmount * 0.4)
  const final = totalAmount - deposit - progress
  return [
    { id: 'p_dep_' + Date.now(), label: '定金',   amount: deposit,  paid: false, date: '' },
    { id: 'p_pro_' + Date.now(), label: '进度款', amount: progress, paid: false, date: '' },
    { id: 'p_fin_' + Date.now(), label: '尾款',   amount: final,    paid: false, date: '' },
  ]
}

export const AVATAR_GRADS: [string, string][] = [
  ['#6366f1', '#818cf8'], ['#8b5cf6', '#a78bfa'], ['#ec4899', '#f472b6'],
  ['#f59e0b', '#fbbf24'], ['#22c55e', '#4ade80'], ['#3b82f6', '#60a5fa'],
  ['#ef4444', '#f87171'], ['#06b6d4', '#22d3ee'], ['#f97316', '#fb923c'],
  ['#14b8a6', '#2dd4bf'],
]

export const STYLES = [
  { id: '意式极简', label: '意式极简' },
  { id: '法式风格', label: '法式风格' },
] as const

export const ACCOUNTS = [
  { id: '守一意式', label: '守一意式' },
  { id: '守中意式', label: '守中意式' },
  { id: '守中法式', label: '守中法式' },
] as const

export const TAG_COLORS: Record<string, { bg: string; text: string }> = {
  '守一意式': { bg: '#3b82f6', text: '#fff' },
  '守中意式': { bg: '#8b5cf6', text: '#fff' },
  '守中法式': { bg: '#ec4899', text: '#fff' },
  '意式极简': { bg: '#6366f1', text: '#fff' },
  '法式风格': { bg: '#f59e0b', text: '#fff' },
}

export const TABS = [
  { id: 'workbench', label: '工作台', icon: LayoutDashboard },
  { id: 'customers', label: '客户管理', icon: Users },
  { id: 'active-projects', label: '在做项目', icon: Hammer },
  { id: 'done-projects', label: '已做项目', icon: CheckCircle },
  { id: 'contracts', label: '合同管理', icon: FileText },
  { id: 'archived', label: '已完成项', icon: Archive },
  { id: 'dashboard', label: '数据看板', icon: BarChart3 },
] as const

export const STORAGE_KEY = 'lingworks_crm_v3'
