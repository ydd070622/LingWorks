import { useState, useEffect, useCallback } from 'react'
import { X, Plus, Trash2, Pencil, Settings2, Key, Info } from 'lucide-react'
import type { CustomModel } from '../types'

interface SettingsProps {
  models: CustomModel[]
  onSave: (models: CustomModel[]) => void
  onClose: () => void
}

type TabId = 'general' | 'api' | 'about'

const emptyModel: CustomModel = { name: '', apiKey: '', endpoint: '', modelName: '' }

export default function Settings({ models, onSave, onClose }: SettingsProps) {
  const [activeTab, setActiveTab] = useState<TabId>('general')

  const [showHome, setShowHome] = useState(true)
  const [checkUpdate, setCheckUpdate] = useState(true)
  const [downloadPath, setDownloadPath] = useState('')

  const [list, setList] = useState<CustomModel[]>(() => JSON.parse(JSON.stringify(models)))
  const [editing, setEditing] = useState<CustomModel>({ ...emptyModel })
  const [editingIndex, setEditingIndex] = useState<number | null>(null)

  useEffect(() => {
    const load = async () => {
      if (window.electronAPI) {
        const [savedHome, savedUpdate, savedPath] = await Promise.all([
          window.electronAPI.getStore('showHomeOnStartup'),
          window.electronAPI.getStore('checkUpdate'),
          window.electronAPI.getStore('downloadPath'),
        ])
        if (typeof savedHome === 'boolean') setShowHome(savedHome)
        if (typeof savedUpdate === 'boolean') setCheckUpdate(savedUpdate)
        if (typeof savedPath === 'string') setDownloadPath(savedPath)
        else setDownloadPath(await window.electronAPI.getDesktopPath())
      }
    }
    load()
  }, [])

  const saveGeneral = useCallback(async (key: string, value: any) => {
    if (window.electronAPI) {
      await window.electronAPI.setStore(key, value)
    }
  }, [])

  const startEdit = (m: CustomModel, i: number) => {
    setEditing({ ...m })
    setEditingIndex(i)
  }

  const cancelEdit = () => {
    setEditing({ ...emptyModel })
    setEditingIndex(null)
  }

  const addOrUpdate = () => {
    if (!editing.name.trim()) return
    if (editingIndex !== null) {
      const updated = [...list]
      updated[editingIndex] = { ...editing }
      setList(updated)
    } else {
      setList([...list, { ...editing }])
    }
    setEditing({ ...emptyModel })
    setEditingIndex(null)
  }

  const removeModel = (i: number) => {
    if (editingIndex === i) cancelEdit()
    setList(list.filter((_, idx) => idx !== i))
  }

  const handleSave = () => {
    onSave(list)
    onClose()
  }

  const tabs: { id: TabId; label: string; icon: React.ReactNode }[] = [
    { id: 'general', label: '通用', icon: <Settings2 size={16} /> },
    { id: 'api', label: 'API', icon: <Key size={16} /> },
    { id: 'about', label: '关于', icon: <Info size={16} /> },
  ]

  return (
    <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="settings-panel">
        <div className="settings-panel-header">
          <h2>设置</h2>
          <div className="settings-panel-close" onClick={onClose}><X size={16} /></div>
        </div>

        <div className="settings-panel-body">
          <div className="settings-tabs">
            {tabs.map(tab => (
              <div
                key={tab.id}
                className={`settings-tab${activeTab === tab.id ? ' active' : ''}`}
                onClick={() => setActiveTab(tab.id)}
              >
                {tab.icon}
                <span>{tab.label}</span>
              </div>
            ))}
          </div>

          <div className="settings-content">
            {activeTab === 'general' && (
              <>
                <h3>通用设置</h3>

                <div className="setting-row">
                  <div>
                    <div className="setting-row-label">启动时显示主页</div>
                    <div className="setting-row-desc">打开软件时直接显示主页</div>
                  </div>
                  <div
                    className={`settings-toggle${showHome ? ' on' : ''}`}
                    onClick={() => { setShowHome(!showHome); saveGeneral('showHomeOnStartup', !showHome) }}
                  />
                </div>

                <div className="setting-row">
                  <div>
                    <div className="setting-row-label">启动时检查更新</div>
                    <div className="setting-row-desc">自动从 Gitee 检测是否有新版本</div>
                  </div>
                  <div
                    className={`settings-toggle${checkUpdate ? ' on' : ''}`}
                    onClick={() => { setCheckUpdate(!checkUpdate); saveGeneral('checkUpdate', !checkUpdate) }}
                  />
                </div>

                <div className="setting-row" style={{ marginTop: 20, borderTop: '1px solid var(--border-color)', paddingTop: 20 }}>
                  <div style={{ flex: 1 }}>
                    <div className="setting-row-label">默认下载路径</div>
                    <div className="setting-row-desc">网页中下载的文件直接保存到此位置</div>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                  <input
                    className="input-base"
                    style={{ flex: 1, fontSize: 12 }}
                    value={downloadPath}
                    onChange={e => setDownloadPath(e.target.value)}
                    placeholder="选择或输入下载目录..."
                  />
                  <button className="btn btn-ghost btn-sm" onClick={async () => {
                    if (window.electronAPI) {
                      const p = await window.electronAPI.selectFolder(downloadPath)
                      if (p) setDownloadPath(p)
                    }
                  }}>浏览</button>
                  <button className="btn btn-primary btn-sm" onClick={() => {
                    if (window.electronAPI) {
                      window.electronAPI.setStore('downloadPath', downloadPath)
                    }
                  }}>保存</button>
                </div>

                <div style={{ textAlign: 'right', marginTop: 24 }}>
                  <button className="btn btn-primary" onClick={onClose}>完成</button>
                </div>
              </>
            )}

            {activeTab === 'api' && (
              <>
                <h3>API 模型设置</h3>

                <div className="glass-card" style={{ padding: 16, marginBottom: 16 }}>
                  <div style={{ display: 'grid', gap: 10 }}>
                    <div>
                      <label className="label">名称</label>
                      <input className="input-base" value={editing.name} onChange={e => setEditing({...editing, name: e.target.value})} placeholder="例: 我的模型" />
                    </div>
                    <div>
                      <label className="label">API Key</label>
                      <input className="input-base" type="password" value={editing.apiKey} onChange={e => setEditing({...editing, apiKey: e.target.value})} placeholder="sk-..." />
                    </div>
                    <div>
                      <label className="label">接口地址</label>
                      <input className="input-base" value={editing.endpoint} onChange={e => setEditing({...editing, endpoint: e.target.value})} placeholder="https://api.example.com" />
                    </div>
                    <div>
                      <label className="label">模型名称</label>
                      <input className="input-base" value={editing.modelName} onChange={e => setEditing({...editing, modelName: e.target.value})} placeholder="gpt-4o-image" />
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button className="btn btn-primary btn-sm" onClick={addOrUpdate} disabled={!editing.name.trim()}>
                        {editingIndex !== null ? <><Pencil size={14} /> 更新</> : <><Plus size={14} /> 添加</>}
                      </button>
                      {editingIndex !== null && (
                        <button className="btn btn-ghost btn-sm" onClick={cancelEdit}>取消</button>
                      )}
                    </div>
                  </div>
                </div>

                {list.length === 0 ? (
                  <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 20, fontSize: 13 }}>
                    暂无自定义模型
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {list.map((m, i) => (
                      <div key={i} className="glass-card" style={{ padding: '10px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <div>
                          <div style={{ fontWeight: 500, fontSize: 13 }}>{m.name}</div>
                          <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{m.modelName} · {m.endpoint}</div>
                        </div>
                        <div style={{ display: 'flex', gap: 4 }}>
                          <button className="btn btn-ghost btn-sm" onClick={() => startEdit(m, i)}>
                            <Pencil size={14} />
                          </button>
                          <button className="btn btn-ghost btn-sm" onClick={() => removeModel(i)}>
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                <button className="btn btn-primary" style={{ marginTop: 16, width: '100%' }} onClick={handleSave}>
                  保存 API 设置 ({list.length})
                </button>
              </>
            )}

            {activeTab === 'about' && (
              <>
                <h3>关于</h3>

                <div className="about-section">
                  <div className="about-version">v{__APP_VERSION__}</div>
                  <div className="about-desc">AI Web Tools — 多平台 AI 工具聚合客户端</div>

                  <div style={{ marginTop: 24, display: 'flex', flexDirection: 'column', gap: 12, alignItems: 'center' }}>
                    <div className="setting-row" style={{ width: '100%', maxWidth: 400 }}>
                      <div>
                        <div className="setting-row-label">当前版本</div>
                        <div className="setting-row-desc">已是最新版本</div>
                      </div>
                      <span style={{ fontSize: 13, color: 'var(--success)' }}>v{__APP_VERSION__}</span>
                    </div>

                    <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                      <button className="btn btn-ghost" onClick={() => {
                        if (window.electronAPI) window.electronAPI.openExternal('https://github.com/ydd070622/AI-Web-Tools')
                        else window.open('https://github.com/ydd070622/AI-Web-Tools', '_blank')
                      }}>
                        查看 GitHub
                      </button>
                      <button className="btn btn-ghost" onClick={() => {
                        if (window.electronAPI) window.electronAPI.openExternal('https://gitee.com/ydd070622/ai-web-tools')
                        else window.open('https://gitee.com/ydd070622/ai-web-tools', '_blank')
                      }}>
                        查看 Gitee
                      </button>
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
