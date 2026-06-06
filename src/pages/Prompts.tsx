import { useState, useEffect, useCallback, useRef } from 'react'
import { Search, Copy, Pencil, Trash2, Upload, Download, Sparkles, Check, X } from 'lucide-react'
import type { PromptItem } from '../types'

const CATEGORIES = [
  { id: '__all__', label: '全部', icon: '📂' },
  { id: '生图提示词', label: '生图提示词', icon: '🎨' },
  { id: 'AI对话', label: 'AI对话', icon: '💬' },
  { id: '文案创作', label: '文案创作', icon: '📝' },
  { id: '自动化流程', label: '自动化流程', icon: '⚙️' },
]

const STORE_KEY = 'prompts'

export default function Prompts() {
  const [prompts, setPrompts] = useState<PromptItem[]>([])
  const [activeCat, setActiveCat] = useState('__all__')
  const [search, setSearch] = useState('')
  const [toast, setToast] = useState('')
  const [categories, setCategories] = useState(CATEGORIES)
  const [showAdd, setShowAdd] = useState(false)
  const [showAi, setShowAi] = useState(false)
  const [showCatManager, setShowCatManager] = useState(false)
  const [catNewName, setCatNewName] = useState('')
  const [editId, setEditId] = useState<string | null>(null)

  // Form state
  const [formTitle, setFormTitle] = useState('')
  const [formContent, setFormContent] = useState('')
  const [formCategory, setFormCategory] = useState('生图提示词')
  const [formPlatform, setFormPlatform] = useState('')
  const [formTags, setFormTags] = useState('')

  // AI state
  const [aiMode, setAiMode] = useState<'generate' | 'optimize'>('generate')
  const [aiDesc, setAiDesc] = useState('')
  const [aiOptimizeInput, setAiOptimizeInput] = useState('')
  const [aiCategory, setAiCategory] = useState('生图提示词')
  const [aiResult, setAiResult] = useState('')
  const [aiLoading, setAiLoading] = useState(false)
  const [apiKey, setApiKey] = useState('')
  const [tempApiKey, setTempApiKey] = useState('')
  const [showApiForm, setShowApiForm] = useState(false)

  const toastTimer = useRef<ReturnType<typeof setTimeout>>()

  const showToast = (msg: string) => {
    setToast(msg)
    clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToast(''), 1500)
  }

  const loadPrompts = useCallback(async () => {
    if (window.electronAPI) {
      const saved = await window.electronAPI.getStore(STORE_KEY)
      if (Array.isArray(saved)) setPrompts(saved)
    } else {
      const raw = localStorage.getItem(STORE_KEY)
      if (raw) { try { setPrompts(JSON.parse(raw)) } catch {} }
    }
  }, [])

  const loadCategories = useCallback(async () => {
    if (window.electronAPI) {
      const saved = await window.electronAPI.getStore('promptCategories')
      if (Array.isArray(saved) && saved.length > 0) setCategories(saved)
    }
  }, [])

  const loadApiKey = useCallback(async () => {
    if (window.electronAPI) {
      const models = await window.electronAPI.getStore('customModels')
      if (Array.isArray(models)) {
        const ds = models.find((m: any) => m.name && m.name.toLowerCase().includes('deepseek'))
        if (ds?.apiKey) setApiKey(ds.apiKey)
      }
    }
  }, [])

  useEffect(() => { loadPrompts(); loadCategories(); loadApiKey() }, [loadPrompts, loadCategories, loadApiKey])

  const savePrompts = async (list: PromptItem[]) => {
    setPrompts(list)
    if (window.electronAPI) {
      await window.electronAPI.setStore(STORE_KEY, list)
    } else {
      localStorage.setItem(STORE_KEY, JSON.stringify(list))
    }
  }

  const saveCategories = async (cats: typeof CATEGORIES) => {
    setCategories(cats)
    if (window.electronAPI) {
      await window.electronAPI.setStore('promptCategories', cats)
    }
  }

  // Filter
  const filtered = prompts.filter(p => {
    if (activeCat !== '__all__' && p.category !== activeCat) return false
    if (search) {
      const s = search.toLowerCase()
      return p.title.toLowerCase().includes(s) || p.content.toLowerCase().includes(s) || p.tags.some(t => t.toLowerCase().includes(s))
    }
    return true
  })

  // Counts
  const getCount = (catId: string) => {
    if (catId === '__all__') return prompts.length
    return prompts.filter(p => p.category === catId).length
  }

  // CRUD
  const handleCopy = (content: string) => {
    navigator.clipboard.writeText(content).then(() => showToast('已复制到剪贴板')).catch(() => {})
  }

  const openAdd = () => {
    setEditId(null)
    setFormTitle('')
    setFormContent('')
    setFormCategory('生图提示词')
    setFormPlatform('')
    setFormTags('')
    setShowAdd(true)
  }

  const openEdit = (p: PromptItem) => {
    setEditId(p.id)
    setFormTitle(p.title)
    setFormContent(p.content)
    setFormCategory(p.category)
    setFormPlatform(p.platform)
    setFormTags(p.tags.join(', '))
    setShowAdd(true)
  }

  const handleSave = async () => {
    if (!formTitle.trim() || !formContent.trim()) return
    const item: PromptItem = {
      id: editId || `p-${Date.now()}`,
      title: formTitle.trim(),
      content: formContent,
      category: formCategory,
      platform: formPlatform.trim(),
      tags: formTags.split(',').map(t => t.trim()).filter(Boolean),
      createdAt: editId ? prompts.find(p => p.id === editId)?.createdAt || Date.now() : Date.now(),
      fromAI: editId ? prompts.find(p => p.id === editId)?.fromAI || false : false,
    }
    const next = editId
      ? prompts.map(p => p.id === editId ? item : p)
      : [item, ...prompts]
    await savePrompts(next)
    setShowAdd(false)
  }

  const handleDelete = async (id: string) => {
    await savePrompts(prompts.filter(p => p.id !== id))
  }

  // AI Generate
  const handleAiGenerate = async () => {
    const input = aiMode === 'optimize' ? aiOptimizeInput.trim() : aiDesc.trim()
    if (!input) return
    if (!apiKey) {
      showToast('请先在上方配置 DeepSeek API Key')
      return
    }
    setAiLoading(true)
    setAiResult('')

    const systemPrompt = aiMode === 'optimize'
      ? '你是一个 Prompt 优化专家。用户会给你一条已有的提示词，你需要在保留原意的基础上进行优化：使其更具体、更有条理、去掉歧义、补充细节。直接输出优化后的 Prompt，不要加任何解释。'
      : '你是一个 Prompt 工程专家。用户会描述他想要什么类型的提示词，你直接输出优化后的 Prompt 模板，不要加任何解释。使用 {变量名} 表示可替换的地方。'

    const messages = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: input },
    ]

    try {
      const res = await fetch('https://api.deepseek.com/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({ model: 'deepseek-chat', messages, max_tokens: 2048, temperature: 0.7 }),
      })
      const data = await res.json()
      if (data.choices?.[0]?.message?.content) {
        setAiResult(data.choices[0].message.content)
      } else {
        setAiResult('生成失败：' + (data.error?.message || '未知错误'))
      }
    } catch (e: any) {
      setAiResult('请求失败：' + (e.message || '网络错误'))
    } finally {
      setAiLoading(false)
    }
  }

  const handleSaveApiKey = async () => {
    if (!tempApiKey.trim()) return
    setApiKey(tempApiKey.trim())
    setShowApiForm(false)
    if (window.electronAPI) {
      const models = await window.electronAPI.getStore('customModels')
      let list = Array.isArray(models) ? models : []
      const idx = list.findIndex((m: any) => m.name && m.name.toLowerCase().includes('deepseek'))
      const model = { name: 'DeepSeek', apiKey: tempApiKey.trim(), endpoint: 'https://api.deepseek.com/v1', modelName: 'deepseek-chat' }
      if (idx >= 0) list[idx] = model
      else list.push(model)
      await window.electronAPI.setStore('customModels', list)
    }
    setTempApiKey('')
    showToast('API Key 已保存')
  }

  const handleAiSave = async () => {
    if (!aiResult.trim()) return
    const srcText = aiMode === 'optimize' ? aiOptimizeInput : aiDesc
    const title = srcText.trim().slice(0, 30) + (srcText.trim().length > 30 ? '...' : '')
    const item: PromptItem = {
      id: `p-${Date.now()}`,
      title,
      content: aiResult.trim(),
      category: aiCategory,
      platform: 'DeepSeek',
      tags: ['AI生成', aiCategory],
      createdAt: Date.now(),
      fromAI: true,
    }
    await savePrompts([item, ...prompts])
    setShowAi(false)
    setAiDesc('')
    setAiResult('')
    showToast('已保存到 Prompt 库')
  }

  // Import / Export
  const handleExport = () => {
    const json = JSON.stringify(prompts, null, 2)
    const blob = new Blob([json], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = 'prompts.json'; a.click()
    URL.revokeObjectURL(url)
  }

  const handleImport = () => {
    const input = document.createElement('input')
    input.type = 'file'; input.accept = '.json'
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0]
      if (!file) return
      const text = await file.text()
      try {
        const data = JSON.parse(text)
        if (Array.isArray(data)) {
          await savePrompts(data)
          showToast(`导入了 ${data.length} 条 Prompt`)
        }
      } catch {
        showToast('导入失败：文件格式不正确')
      }
    }
    input.click()
  }

  const handleDeleteCategory = async (catId: string) => {
    if (catId === '__all__') return
    const count = prompts.filter(p => p.category === catId).length
    if (count > 0 && !confirm(`该分类下有 ${count} 条 Prompt，删除后它们会移到「全部」。确定删除？`)) return
    const next = categories.filter(c => c.id !== catId)
    await saveCategories(next)
    // Move prompts in deleted category to first available category
    const targetCat = next.find(c => c.id !== '__all__')?.id || '__all__'
    const updatedPrompts = prompts.map(p => p.category === catId ? { ...p, category: targetCat } : p)
    await savePrompts(updatedPrompts)
    if (activeCat === catId) setActiveCat('__all__')
  }

  // Add category
  const handleAddCategory = () => {
    const name = prompt('输入新分类名称：')
    if (!name?.trim()) return
    if (categories.find(c => c.id === name.trim())) {
      showToast('分类已存在')
      return
    }
    const newCat = { id: name.trim(), label: name.trim(), icon: '📌' }
    saveCategories([...categories, newCat])
  }

  const handleAddCategoryInManager = () => {
    const name = catNewName.trim()
    if (!name) return
    if (categories.find(c => c.id === name)) {
      showToast('分类已存在')
      return
    }
    const newCat = { id: name, label: name, icon: '📌' }
    saveCategories([...categories, newCat])
    setCatNewName('')
  }

  return (
    <div style={{ display: 'flex', height: '100%' }}>
      {/* Categories */}
      <div className="prompts-sidebar">
        {categories.map(c => (
          <div
            key={c.id}
            className={`prompts-cat-item${activeCat === c.id ? ' active' : ''}`}
            onClick={() => setActiveCat(c.id)}
          >
            <span>{c.icon} {c.label}</span>
            <span className="prompts-cat-count">{getCount(c.id)}</span>
          </div>
        ))}
        <div className="prompts-cat-manage" onClick={() => setShowCatManager(true)}>管理分类</div>
      </div>

      {/* Main */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {/* Toolbar */}
        <div className="prompts-toolbar">
          <div style={{ position: 'relative', flex: 1, maxWidth: 300 }}>
            <input
              className="input-base"
              style={{ paddingLeft: 32 }}
              placeholder="搜索 Prompt..."
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
            <Search size={14} style={{ position: 'absolute', left: 10, top: 9, color: 'var(--text-muted)' }} />
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-ghost" onClick={handleImport}><Upload size={13} /> 导入</button>
            <button className="btn btn-ghost" onClick={handleExport}><Download size={13} /> 导出</button>
            <button className="btn btn-accent" onClick={() => setShowAi(true)}><Sparkles size={13} /> AI 生成</button>
            <button className="btn btn-primary" onClick={openAdd}>+ 手动添加</button>
          </div>
        </div>

        {/* List */}
        <div className="prompts-list">
          {filtered.length === 0 ? (
            <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 40 }}>
              {search || activeCat !== '__all__' ? '没有匹配的 Prompt' : '暂无 Prompt，点击上方按钮添加'}
            </div>
          ) : (
            filtered.map(p => (
              <div key={p.id} className="prompts-card">
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{ fontSize: 14, fontWeight: 600 }}>{p.title}</div>
                    <span className="prompts-card-platform">{p.platform || '通用'}</span>
                    {p.fromAI && <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>🤖 AI</span>}
                  </div>
                  <div style={{ display: 'flex', gap: 2 }}>
                    <button className="prompts-card-btn" onClick={() => handleCopy(p.content)} title="复制">
                      <Copy size={13} />
                    </button>
                    <button className="prompts-card-btn" onClick={() => openEdit(p)} title="编辑">
                      <Pencil size={13} />
                    </button>
                    <button className="prompts-card-btn prompts-card-btn-del" onClick={() => handleDelete(p.id)} title="删除">
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>
                <div className="prompts-card-preview">{p.content}</div>
                {p.tags.length > 0 && (
                  <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                    {p.tags.map(t => (
                      <span key={t} className="prompts-tag">{t}</span>
                    ))}
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </div>

      {/* Add / Edit Modal */}
      {showAdd && (
        <div className="modal-overlay">
          <div className="prompts-modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header" style={{ padding: '16px 20px', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ fontSize: 15, fontWeight: 600 }}>{editId ? '编辑 Prompt' : '添加 Prompt'}</h3>
              <button className="btn btn-ghost btn-sm" onClick={() => setShowAdd(false)}><X size={14} /></button>
            </div>
            <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 18, overflowY: 'auto' }}>
              <div style={{ display: 'flex', gap: 12 }}>
                <div style={{ flex: 1 }}>
                  <label className="label">标题</label>
                  <input className="input-base" value={formTitle} onChange={e => setFormTitle(e.target.value)} placeholder="Prompt 标题" />
                </div>
                <div style={{ width: 150 }}>
                  <label className="label">分类</label>
                  <select className="input-base select-base" value={formCategory} onChange={e => setFormCategory(e.target.value)}>
                    {categories.filter(c => c.id !== '__all__').map(c => (
                      <option key={c.id} value={c.id}>{c.label}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <label className="label">适用平台</label>
                <input className="input-base" value={formPlatform} onChange={e => setFormPlatform(e.target.value)} placeholder="如 DeepSeek / ChatGPT / SDXL" />
              </div>
              <div>
                <label className="label">Prompt 内容 <span className="variable-hint">可用 {'{变量名}'} 做占位符</span></label>
                <textarea className="input-base" style={{ minHeight: 180, resize: 'vertical', fontFamily: 'monospace', lineHeight: 1.6, fontSize: 13 }} value={formContent} onChange={e => setFormContent(e.target.value)} placeholder="粘贴 Prompt 内容..." />
              </div>
              <div>
                <label className="label">标签（逗号分隔）</label>
                <input className="input-base" value={formTags} onChange={e => setFormTags(e.target.value)} placeholder="如 人像, 写实, SDXL" />
              </div>
            </div>
            <div className="modal-footer" style={{ padding: '14px 20px', borderTop: '1px solid var(--border-color)', display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button className="btn btn-ghost" onClick={() => setShowAdd(false)}>取消</button>
              <button className="btn btn-primary" onClick={handleSave} disabled={!formTitle.trim() || !formContent.trim()}>保存</button>
            </div>
          </div>
        </div>
      )}

      {/* AI Modal */}
      {showAi && (
        <div className="modal-overlay">
          <div className="prompts-modal" style={{ width: 780, maxHeight: '90vh' }} onClick={e => e.stopPropagation()}>
            <div style={{ padding: '16px 24px', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <h3 style={{ fontSize: 15, fontWeight: 600 }}>🤖 AI 助手</h3>
                <div style={{ display: 'flex', gap: 4, background: 'var(--bg-card)', borderRadius: 8, padding: 2 }}>
                  <button
                    className={`btn btn-sm ${aiMode === 'generate' ? 'btn-primary' : 'btn-ghost'}`}
                    style={{ borderRadius: 6 }}
                    onClick={() => { setAiMode('generate'); setAiResult('') }}
                  >生成</button>
                  <button
                    className={`btn btn-sm ${aiMode === 'optimize' ? 'btn-primary' : 'btn-ghost'}`}
                    style={{ borderRadius: 6 }}
                    onClick={() => { setAiMode('optimize'); setAiResult('') }}
                  >优化</button>
                </div>
              </div>
              <button className="btn btn-ghost btn-sm" onClick={() => setShowAi(false)}><X size={14} /></button>
            </div>
            <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
              {(!apiKey || showApiForm) && (
                <div className="prompts-api-setup">
                  <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>🔑 配置 DeepSeek API Key</div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <input
                      className="input-base"
                      type="password"
                      placeholder="输入 DeepSeek API Key (sk-...)"
                      value={tempApiKey}
                      onChange={e => setTempApiKey(e.target.value)}
                      style={{ flex: 1 }}
                    />
                    <button className="btn btn-primary" onClick={handleSaveApiKey} disabled={!tempApiKey.trim()}>保存</button>
                    {apiKey && (
                      <button className="btn btn-ghost" onClick={() => { setShowApiForm(false); setTempApiKey('') }}>取消</button>
                    )}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
                    获取 Key：<a href="https://platform.deepseek.com/api_keys" target="_blank" style={{ color: 'var(--accent)' }}>platform.deepseek.com</a>
                  </div>
                </div>
              )}
              {apiKey && !showApiForm && (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', borderRadius: 8, background: 'rgba(34,197,94,0.06)', border: '1px solid rgba(34,197,94,0.15)', fontSize: 12 }}>
                  <span>🔑 DeepSeek API 已配置 · <span style={{ color: 'var(--success)' }}>就绪</span></span>
                  <button className="btn btn-ghost btn-sm" onClick={() => setShowApiForm(true)}>更换</button>
                </div>
              )}

              {aiMode === 'generate' && (
                <div>
                  <label className="label" style={{ marginBottom: 6, display: 'block' }}>描述你需要的 Prompt（用自然语言）</label>
                  <textarea
                    className="input-base"
                    style={{ minHeight: 140, maxHeight: 200, resize: 'vertical', lineHeight: 1.6 }}
                    value={aiDesc}
                    onChange={e => setAiDesc(e.target.value)}
                    placeholder='例如：帮我写一个生成国风插画的 Prompt，要求水墨画风、仙鹤、云雾元素...'
                  />
                </div>
              )}

              {aiMode === 'optimize' && (
                <div>
                  <label className="label" style={{ marginBottom: 6, display: 'block' }}>粘贴需要优化的 Prompt</label>
                  <textarea
                    className="input-base"
                    style={{ minHeight: 140, maxHeight: 200, resize: 'vertical', lineHeight: 1.6, fontFamily: 'monospace', fontSize: 13 }}
                    value={aiOptimizeInput}
                    onChange={e => setAiOptimizeInput(e.target.value)}
                    placeholder='粘贴你的原始 Prompt，AI 会帮你优化得更具体、更有条理...'
                  />
                </div>
              )}

              <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end' }}>
                <div style={{ width: 150 }}>
                  <label className="label" style={{ marginBottom: 4, display: 'block' }}>分类到</label>
                  <select className="input-base select-base" value={aiCategory} onChange={e => setAiCategory(e.target.value)}>
                    {categories.filter(c => c.id !== '__all__').map(c => (
                      <option key={c.id} value={c.id}>{c.label}</option>
                    ))}
                  </select>
                </div>
                <button
                  className="btn btn-primary"
                  onClick={handleAiGenerate}
                  disabled={aiLoading || (aiMode === 'optimize' ? !aiOptimizeInput.trim() : !aiDesc.trim())}
                >
                  {aiLoading ? '处理中...' : <>{aiMode === 'optimize' ? <>🪄 优化 Prompt</> : <>✨ 生成 Prompt</>}</>}
                </button>
              </div>

              {aiResult && (
                <div className="prompts-ai-result">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                    <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{aiMode === 'optimize' ? '优化结果：' : '生成结果：'}</span>
                    <button className="btn btn-ghost btn-sm" onClick={() => handleCopy(aiResult)}><Copy size={12} /> 复制</button>
                  </div>
                  <div style={{ whiteSpace: 'pre-wrap', lineHeight: 1.6, fontSize: 13, maxHeight: 200, overflowY: 'auto' }}>{aiResult}</div>
                  <div style={{ display: 'flex', gap: 8, marginTop: 12, justifyContent: 'flex-end' }}>
                    <button className="btn btn-ghost" onClick={handleAiGenerate} disabled={aiLoading}>重新处理</button>
                    <button className="btn btn-primary" onClick={handleAiSave}><Check size={13} /> 加入 Prompt 库</button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Category Manager */}
      {showCatManager && (
        <div className="modal-overlay">
          <div className="prompts-modal" style={{ width: 400 }} onClick={e => e.stopPropagation()}>
            <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ fontSize: 15, fontWeight: 600 }}>分类管理</h3>
              <button className="btn btn-ghost btn-sm" onClick={() => setShowCatManager(false)}><X size={14} /></button>
            </div>
            <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 360, overflowY: 'auto' }}>
              <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                <input
                  className="input-base"
                  placeholder="输入新分类名称"
                  value={catNewName}
                  onChange={e => setCatNewName(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleAddCategoryInManager()}
                  style={{ flex: 1 }}
                />
                <button className="btn btn-primary btn-sm" onClick={handleAddCategoryInManager} disabled={!catNewName.trim()}>新建</button>
              </div>
              {categories.filter(c => c.id !== '__all__').map(c => (
                <div key={c.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', borderRadius: 8, background: 'var(--bg-card)', border: '1px solid var(--border-color)' }}>
                  <span style={{ fontSize: 13 }}>{c.icon} {c.label}</span>
                  <button className="btn btn-ghost btn-sm" style={{ color: '#ef4444' }} onClick={() => {
                    handleDeleteCategory(c.id)
                    if (categories.filter(x => x.id !== '__all__').length <= 1) setShowCatManager(false)
                  }}>删除</button>
                </div>
              ))}
              {categories.filter(c => c.id !== '__all__').length === 0 && (
                <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 20, fontSize: 13 }}>暂无自定义分类</div>
              )}
            </div>
            <div style={{ padding: '12px 20px', borderTop: '1px solid var(--border-color)', display: 'flex', justifyContent: 'flex-end' }}>
              <button className="btn btn-primary" onClick={() => { setShowCatManager(false) }}>完成</button>
            </div>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && <div className="toast success">{toast}</div>}
    </div>
  )
}
