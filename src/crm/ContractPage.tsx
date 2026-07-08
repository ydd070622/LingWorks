import { useState } from 'react'
import { Plus } from 'lucide-react'
import type { SharedProps } from './types'
import { avatarGrad, fmtDate } from './helpers'
import { CONTRACT_STATUS } from './constants'

export default function ContractPage({
  closedCusts,
  setViewingContract,
  setEditingContract,
  rollbackContract,
  archiveContract,
  deleteCusts,
}: SharedProps) {
  const activeContracts = closedCusts.filter(c => !c.contractArchived)
  const total = activeContracts.reduce((s, c) => s + (c.dealAmount || 0), 0)
  const totalPaid = activeContracts.reduce((s, c) => s + (c.paymentPlan || []).filter(p => p.paid).reduce((ss, p) => ss + p.amount, 0), 0)
  const [batchMode, setBatchMode] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())

  const statusLabel = (contractStatus?: string) =>
    CONTRACT_STATUS.find(s => s.id === contractStatus) || { id: 'signed', label: '已签约', icon: '📋', color: 'blue' }

  const toggleSel = (id: string) => {
    const next = new Set(selectedIds)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setSelectedIds(next)
  }

  const rollbackSelected = () => {
    if (selectedIds.size === 0) return
    Array.from(selectedIds).forEach(id => rollbackContract(id))
    setSelectedIds(new Set())
    setBatchMode(false)
  }

  const deleteSelected = () => {
    if (selectedIds.size === 0) return
    if (!confirm(`确定删除选中的 ${selectedIds.size} 份合同？删除后不可恢复。`)) return
    deleteCusts(Array.from(selectedIds))
    setSelectedIds(new Set())
    setBatchMode(false)
  }

  return (
    <div className="crm-page">
      <div className="crm-toolbar">
        <span className="crm-page-subtitle">
          已签合同 {activeContracts.length} 份 · 总金额 ¥{(total / 10000).toFixed(1)}万 · 已回款 ¥{(totalPaid / 10000).toFixed(1)}万
          {total - totalPaid > 0 ? <> · <span style={{ color: 'var(--danger, #ef4444)' }}>待收 ¥{((total - totalPaid) / 10000).toFixed(1)}万</span></> : ''}
        </span>
        <div style={{ display: 'flex', gap: 8, marginLeft: 'auto' }}>
          {batchMode ? (
            <>
              <button className="crm-btn-warn-outline" onClick={rollbackSelected} disabled={selectedIds.size === 0}>
                退档选中 ({selectedIds.size})
              </button>
              <button className="crm-btn-danger-outline" onClick={deleteSelected} disabled={selectedIds.size === 0}>
                删除选中 ({selectedIds.size})
              </button>
              <button className="crm-btn-ghost" onClick={() => { setBatchMode(false); setSelectedIds(new Set()) }}>取消</button>
            </>
          ) : (
            <>
              <button className="crm-btn-ghost" onClick={() => setBatchMode(true)}>管理合同</button>
              <button className="crm-btn-primary" onClick={() => setEditingContract(true)}><Plus size={14} /> 新增合同</button>
            </>
          )}
        </div>
      </div>

      {activeContracts.length === 0 ? <div className="crm-empty">暂无成交合同</div> : (
        <div className="crm-table-wrap">
          <table className="crm-table">
            <thead>
              <tr>
                {batchMode && (
                  <th style={{ width: 36 }}>
                    <input
                      type="checkbox"
                      checked={activeContracts.length > 0 && activeContracts.every(c => selectedIds.has(c.id))}
                      onChange={e => {
                        if (e.target.checked) setSelectedIds(new Set(activeContracts.map(c => c.id)))
                        else setSelectedIds(new Set())
                      }}
                    />
                  </th>
                )}
                <th>合同编号</th>
                <th>客户</th>
                <th>风格</th>
                <th>合同金额</th>
                <th>回款进度</th>
                <th>状态</th>
                <th>签约日期</th>
                <th style={{ width: 80 }}>操作</th>
              </tr>
            </thead>
            <tbody>
              {activeContracts.map(c => {
                const payments = c.paymentPlan || []
                const paid = payments.filter(p => p.paid).reduce((s, p) => s + p.amount, 0)
                const ratio = (c.dealAmount || 1) > 0 ? (paid / (c.dealAmount || 1) * 100) : 0
                const isOwed = ratio < 100 && c.contractStatus === 'done'
                const st = statusLabel(c.contractStatus)
                const [g1, g2] = avatarGrad(c.name)
                return (
                  <tr key={c.id} onClick={() => { if (batchMode) toggleSel(c.id); else setViewingContract(c) }}>
                    {batchMode && (
                      <td onClick={e => e.stopPropagation()}>
                        <input type="checkbox" checked={selectedIds.has(c.id)} onChange={() => toggleSel(c.id)} />
                      </td>
                    )}
                    <td className="crm-mono crm-accent">{c.projectId || `P2026-${c.id.slice(-3).padStart(3, '0')}`}</td>
                    <td>
                      <div className="crm-td-name">
                        <div className="crm-avatar crm-avatar-sm" style={{ background: `linear-gradient(135deg,${g1},${g2})` }}>{c.name[0]}</div>
                        {c.name}
                      </div>
                    </td>
                    <td>{c.style || '—'}</td>
                    <td className="crm-amount">¥{(c.dealAmount || 0).toLocaleString()}</td>
                    <td className="crm-pay-cell">
                      <div className="crm-pay-bar-wrap">
                        <div className="crm-pay-bar"><div className={`crm-pay-fill ${ratio >= 100 ? '' : ratio > 0 ? 'partial' : 'none'}`} style={{ width: `${ratio}%` }} /></div>
                        <span className={`crm-pay-text ${isOwed ? 'warn' : ''}`}>¥{paid.toLocaleString()} / {ratio.toFixed(0)}%{isOwed ? ' ⚠' : ''}</span>
                      </div>
                    </td>
                    <td><span className={`crm-badge crm-badge-${st.color}`}>{st.icon} {st.label}</span></td>
                    <td className="crm-muted">{fmtDate(c.signDate || c.updatedAt)}</td>
                    <td>
                      <button
                        className="crm-btn-ghost-xs"
                        style={{ color: 'var(--text-muted)' }}
                        onClick={e => {
                          e.stopPropagation()
                          if (confirm('归档后将移至「合同归档」，确定？')) archiveContract(c.id)
                        }}
                      >
                        归档
                      </button>
                    </td>
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
