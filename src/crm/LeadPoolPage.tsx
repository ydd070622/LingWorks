import { Plus } from 'lucide-react'
import { pinyin } from 'pinyin-pro'
import type { SharedProps } from './types'
import { avatarGrad, fmtDate } from './helpers'

export default function LeadPoolPage({ data, setEditingCustomer, enrichCust, moveCust }: SharedProps) {
  const leads = data.customers.filter(c => c.stage === 'lead').map(enrichCust).sort((a, b) => pinyin(a.name).localeCompare(pinyin(b.name)))
  return (
    <div className="crm-page">
      <div className="crm-toolbar">
        <span className="crm-page-subtitle">来自笔记评论/私信的未认领线索 · {leads.length} 条</span>
        <button className="crm-btn-primary" onClick={() => setEditingCustomer({ stage: 'lead' })}><Plus size={14} /> 添加线索</button>
      </div>
      {leads.length === 0 ? <div className="crm-empty">没有待处理的线索</div> : (
        <div className="crm-table-wrap">
          <table className="crm-table">
            <thead>
              <tr>
                <th>客户</th><th>来源</th><th>城市</th><th>归属账号</th><th>留言时间</th><th>备注</th><th style={{ width: 120 }}>操作</th>
              </tr>
            </thead>
            <tbody>
              {leads.map(c => (
                <tr key={c.id} onClick={() => setEditingCustomer(c)}>
                  <td>
                    <div className="crm-td-name">
                      <div className="crm-avatar crm-avatar-sm" style={{ background: `linear-gradient(135deg,${avatarGrad(c.name)[0]},${avatarGrad(c.name)[1]})` }}>{c.name[0]}</div>
                      {c.name}
                    </div>
                  </td>
                  <td><span className="crm-source-link">{c.sourceIcon} {c.sourceLabel}</span></td>
                  <td>{c.city || <span className="crm-muted">未填</span>}</td>
                  <td>{c.style || <span className="crm-muted">未填</span>}</td>
                  <td><span className="crm-muted">{fmtDate(c.createdAt)}</span></td>
                  <td className="crm-notes-cell">{c.notes}</td>
                  <td>
                    <div className="crm-actions">
                      <button className="crm-btn-primary-xs" onClick={e => { e.stopPropagation(); moveCust(c.id, 'wechat') }}>认领</button>
                      <button className="crm-btn-ghost-xs" onClick={e => { e.stopPropagation(); setEditingCustomer(c) }}>详情</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
