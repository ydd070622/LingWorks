import { useState } from 'react'
import { toast } from 'sonner'
import type { SharedProps } from './types'
import { avatarGrad, fmtDate } from './helpers'
import { CONTRACT_STATUS } from './constants'

export default function ContractArchivePage({ archivedContracts, restoreContract, restoreContracts, setViewingContract }: SharedProps) {
  const [manageMode, setManageMode] = useState(false)
  const [selectedIds, setSelectedIds] = useState<string[]>([])

  const toggleSelect = (id: string) => setSelectedIds(s => s.includes(id) ? s.filter(i => i !== id) : [...s, id])
  const toggleAll = () => setSelectedIds(s => s.length === archivedContracts.length ? [] : archivedContracts.map(c => c.id))

  const batchRestore = () => {
    if (selectedIds.length === 0) return
    if (!confirm(`确定恢复选中的 ${selectedIds.length} 份合同？`)) return
    restoreContracts(selectedIds)
    setSelectedIds([]); setManageMode(false)
  }

  const statusLabel = (contractStatus?: string) => CONTRACT_STATUS.find(s => s.id === contractStatus) || { id: 'signed', label: '已签约', icon: '📋', color: 'blue' }

  const total = archivedContracts.reduce((s, c) => s + (c.dealAmount || 0), 0)
  const totalPaid = archivedContracts.reduce((s, c) => s + (c.paymentPlan || []).filter(p => p.paid).reduce((ss, p) => ss + p.amount, 0), 0)

  return (
    <div>
      <div className="crm-page-header">
        <h2>📋 合同归档</h2>
        <span className="crm-page-count">共 {archivedContracts.length} 份合同 · 总金额 ¥{(total / 10000).toFixed(1)}万 · 已回款 ¥{(totalPaid / 10000).toFixed(1)}万</span>
        <div style={{ flex: 1 }} />
        {manageMode && selectedIds.length > 0 && (
          <button className="btn btn-primary btn-sm" onClick={batchRestore}>退档选中 ({selectedIds.length})</button>
        )}
        <button className={`btn btn-sm ${manageMode ? 'btn-danger' : 'btn-ghost'}`} style={{ marginLeft: 8 }} onClick={() => { setManageMode(!manageMode); setSelectedIds([]) }}>
          {manageMode ? '完成' : '管理'}
        </button>
      </div>

      <div className="crm-table-wrap">
        <table className="crm-table">
          <thead>
            <tr>
              {manageMode && <th style={{ width: 36, textAlign: 'center' }}><input type="checkbox" checked={archivedContracts.length > 0 && selectedIds.length === archivedContracts.length} onChange={toggleAll} /></th>}
              <th>客户</th><th>合同金额</th><th>回款进度</th><th>状态</th><th>签约日期</th><th>备注</th><th>操作</th>
            </tr>
          </thead>
          <tbody>
            {archivedContracts.length === 0 && (
              <tr><td colSpan={manageMode ? 8 : 7}><div className="crm-empty"><span>📭</span>暂无归档合同</div></td></tr>
            )}
            {archivedContracts.map(c => {
              const payments = c.paymentPlan || []
              const paid = payments.filter(p => p.paid).reduce((s, p) => s + p.amount, 0)
              const ratio = (c.dealAmount || 1) > 0 ? (paid / (c.dealAmount || 1) * 100) : 0
              const st = statusLabel(c.contractStatus)
              return (
                <tr key={c.id} onClick={() => { if (manageMode) toggleSelect(c.id); else setViewingContract(c) }} style={{ cursor: 'pointer' }}>
                  {manageMode && <td style={{ width: 36, textAlign: 'center' }} onClick={e => e.stopPropagation()}><input type="checkbox" checked={selectedIds.includes(c.id)} onChange={() => toggleSelect(c.id)} /></td>}
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span className="cell-av" style={{ background: `linear-gradient(135deg,${avatarGrad(c.name)[0]},${avatarGrad(c.name)[1]})` }}>{c.name[0]}</span>
                      <span className="cell-name">{c.name}</span>
                    </div>
                  </td>
                  <td className="crm-amount">¥{(c.dealAmount || 0).toLocaleString()}</td>
                  <td className="crm-pay-cell">
                    <div className="crm-pay-bar-wrap">
                      <div className="crm-pay-bar"><div className={`crm-pay-fill ${ratio >= 100 ? '' : ratio > 0 ? 'partial' : 'none'}`} style={{ width: `${ratio}%` }} /></div>
                      <span className="crm-pay-text">¥{paid.toLocaleString()} / {ratio.toFixed(0)}%</span>
                    </div>
                  </td>
                  <td><span className={`crm-badge crm-badge-${st.color}`}>{st.icon} {st.label}</span></td>
                  <td className="crm-muted">{fmtDate(c.signDate || c.updatedAt)}</td>
                  <td className="crm-notes-cell">{c.notes || <span className="crm-muted">—</span>}</td>
                  <td>
                    <button className="crm-btn-ghost-xs" onClick={e => { e.stopPropagation(); if (confirm('确定退档此合同？将回到合同管理页面。')) { restoreContract(c.id) } }}>
                      退档
                    </button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
