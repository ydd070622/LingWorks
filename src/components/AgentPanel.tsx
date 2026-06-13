import { useState, useEffect, useRef, useCallback } from 'react'
import type { AgentModel, AgentMessage, AgentContext } from '../types'
import { AGENT_PROVIDERS, loadModels, saveModels, streamChat, parseSSEStream, generateId, fetchProviderModels } from '../services/agent'
import { agentChat } from '../services/agent-loop'
import { Copy, X, Plus, ChevronDown, History, Trash2, Check, RefreshCw, Loader2 } from 'lucide-react'

// ===== Add Model Modal (auto-fetch models, multi-select) =====
function AddModelModal({
  isOpen, onClose, onAdd,
}: {
  isOpen: boolean
  onClose: () => void
  onAdd: (models: AgentModel[]) => void
}) {
  const [providerId, setProviderId] = useState('')
  const [apiKey, setApiKey] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [customModel, setCustomModel] = useState('')
  const [saving, setSaving] = useState(false)

  // Auto-fetch
  const [fetchedModels, setFetchedModels] = useState<string[]>([])
  const [fetching, setFetching] = useState(false)
  const [fetchError, setFetchError] = useState<string | null>(null)
  const [checkedModels, setCheckedModels] = useState<Set<string>>(new Set())

  const isCustom = providerId === 'custom'
  const canSave = providerId && apiKey.trim() && (isCustom ? customModel.trim() : checkedModels.size > 0)

  // Auto-fetch models when provider + apiKey are set
  useEffect(() => {
    setFetchedModels([]); setFetchError(null); setCheckedModels(new Set())
    if (!providerId || isCustom || !apiKey.trim()) return
    let cancelled = false
    setFetching(true)
    fetchProviderModels(providerId, apiKey.trim())
      .then(list => {
        if (!cancelled) { setFetchedModels(list); setFetching(false) }
      })
      .catch(err => {
        if (!cancelled) { setFetchError(err.message); setFetching(false) }
      })
    return () => { cancelled = true }
  }, [providerId, apiKey, isCustom])

  const toggleModel = (name: string) => {
    setCheckedModels(prev => {
      const next = new Set(prev)
      next.has(name) ? next.delete(name) : next.add(name)
      return next
    })
  }

  const handleAdd = async () => {
    if (!canSave || saving) return
    setSaving(true)

    if (isCustom) {
      onAdd([{
        id: generateId(), providerId, apiKey: apiKey.trim(),
        modelName: customModel.trim(), displayName: displayName.trim() || undefined,
      }])
    } else {
      const newModels: AgentModel[] = [...checkedModels].map(name => ({
        id: generateId(), providerId, apiKey: apiKey.trim(),
        modelName: name, displayName: displayName.trim() ? `${displayName.trim()} (${name})` : undefined,
      }))
      onAdd(newModels)
    }

    // Reset
    setProviderId(''); setApiKey(''); setDisplayName(''); setCustomModel('')
    setFetchedModels([]); setFetchError(null); setCheckedModels(new Set())
    setSaving(false)
    onClose()
  }

  useEffect(() => {
    if (isOpen) {
      setProviderId(''); setApiKey(''); setDisplayName(''); setCustomModel('')
      setFetchedModels([]); setFetchError(null); setCheckedModels(new Set())
    }
  }, [isOpen])

  if (!isOpen) return null

  return (
    <div className="agent-modal-overlay" onClick={onClose}>
      <div className="agent-modal" onClick={e => e.stopPropagation()}>
        <div className="agent-modal-header">
          <span>🔧</span>
          <h3>添加模型</h3>
          <button onClick={onClose}><X size={16} /></button>
        </div>
        <div className="agent-modal-body">
          <div className="agent-field">
            <label>模型提供商</label>
            <select value={providerId} onChange={e => { setProviderId(e.target.value) }}>
              <option value="">-- 选择提供商 --</option>
              {AGENT_PROVIDERS.map(p => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>
          <div className="agent-field">
            <label>API 密钥</label>
            <input type="password" value={apiKey} onChange={e => setApiKey(e.target.value)} placeholder="输入 API Key 后自动获取模型列表..." />
            <span className="agent-field-hint">密钥仅本地存储，不会上传到任何服务器</span>
          </div>

          {/* Non-custom: auto-fetch model list */}
          {!isCustom && providerId && apiKey.trim() && (
            <div className="agent-field">
              <div className="agent-model-list-header">
                <label>可用模型</label>
                {fetching ? (
                  <span className="agent-fetch-status"><Loader2 size={12} className="spinning" /> 获取中...</span>
                ) : fetchError ? (
                  <span className="agent-fetch-status agent-fetch-error">⚠️ {fetchError}</span>
                ) : fetchedModels.length > 0 ? (
                  <span className="agent-fetch-status">已加载 {fetchedModels.length} 个模型</span>
                ) : null}
              </div>
              {fetchedModels.length > 0 ? (
                <div className="agent-model-checklist">
                  {fetchedModels.map(name => (
                    <label key={name} className="agent-model-check">
                      <input
                        type="checkbox"
                        checked={checkedModels.has(name)}
                        onChange={() => toggleModel(name)}
                      />
                      <span>{name}</span>
                    </label>
                  ))}
                </div>
              ) : !fetching && !fetchError ? (
                <span className="agent-field-hint">输入 API Key 后自动获取</span>
              ) : null}
            </div>
          )}

          {/* Custom: manual input */}
          {isCustom && (
            <div className="agent-field">
              <label>模型名称 / ID</label>
              <input type="text" value={customModel} onChange={e => setCustomModel(e.target.value)} placeholder="如 gpt-3.5-turbo" />
              <span className="agent-field-hint">输入 OpenAI 兼容的模型 ID</span>
            </div>
          )}
          <div className="agent-field">
            <label>显示名称（可选）</label>
            <input type="text" value={displayName} onChange={e => setDisplayName(e.target.value)} placeholder={isCustom ? '如：我的自定义模型' : '如：硅基流动专用、工作合集'} />
            <span className="agent-field-hint">留空则使用模型名。勾选多个模型时，显示名作为前缀</span>
          </div>
        </div>
        <div className="agent-modal-footer">
          <button className="agent-btn agent-btn-cancel" onClick={onClose}>取消</button>
          <button className="agent-btn agent-btn-primary" disabled={!canSave || saving} onClick={handleAdd}>
            {saving ? '添加中...' : `添加${!isCustom && checkedModels.size > 1 ? ` (${checkedModels.size}个)` : ''}`}
          </button>
        </div>
      </div>
    </div>
  )
}

// ===== Copy Button =====
function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  const handle = async () => {
    await navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }
  return (
    <button className="agent-msg-action" onClick={handle}>
      {copied ? <Check size={12} /> : <Copy size={12} />}
      {copied ? '已复制' : '复制'}
    </button>
  )
}

// ===== Simple Markdown Renderer =====
function SimpleMarkdown({ content }: { content: string }) {
  const renderInline = (text: string) => {
    return text
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')
      .replace(/\*(.+?)\*/g, '<i>$1</i>')
      .replace(/`(.+?)`/g, '<code>$1</code>')
  }

  const segments: Array<{ type: 'text' | 'code'; content: string }> = []
  const codeRegex = /```(\w*)\n?([\s\S]*?)```/g
  let lastIndex = 0
  let match
  while ((match = codeRegex.exec(content)) !== null) {
    if (match.index > lastIndex) {
      segments.push({ type: 'text', content: content.slice(lastIndex, match.index) })
    }
    segments.push({ type: 'code', content: match[2] || '' })
    lastIndex = codeRegex.lastIndex
  }
  if (lastIndex < content.length) {
    segments.push({ type: 'text', content: content.slice(lastIndex) })
  }
  if (segments.length === 0) {
    segments.push({ type: 'text', content })
  }

  return (
    <>
      {segments.map((seg, i) => {
        if (seg.type === 'code') {
          return <pre key={i}><code>{seg.content.trim()}</code></pre>
        }
        const paragraphs = seg.content.split(/\n\n+/)
        return (
          <span key={i}>
            {paragraphs.map((p, pi) => (
              <span key={pi}>
                {pi > 0 && <><br /><br /></>}
                <span dangerouslySetInnerHTML={{
                  __html: renderInline(p).replace(/\n/g, '<br/>'),
                }} />
              </span>
            ))}
          </span>
        )
      })}
    </>
  )
}

// ===== Session type =====
interface Session {
  id: string
  title: string
  modelId: string | null
  messages: AgentMessage[]
}

// ===== Main Panel =====
export default function AgentPanel({ isOpen, onClose, currentUrl, initialContext, onContextConsumed, onNavigate }: {
  isOpen: boolean; onClose: () => void; currentUrl?: string
  initialContext?: AgentContext | null; onContextConsumed?: () => void
  onNavigate?: (page: string) => void
}) {
  const [models, setModels] = useState<AgentModel[]>([])
  const [sessions, setSessions] = useState<Session[]>([])
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null)
  const [loadingSessions, setLoadingSessions] = useState<Set<string>>(new Set())
  const [error, setError] = useState<string | null>(null)
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const [modalOpen, setModalOpen] = useState(false)
  const [tavilyKey, setTavilyKey] = useState(() => localStorage.getItem('agent_tavily_key') || '')
  const [historyOpen, setHistoryOpen] = useState(false)
  const [fontSize, setFontSize] = useState(() => {
    const saved = localStorage.getItem('agent_font_size')
    return saved ? parseInt(saved) : 13
  })

  const messagesContainerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const abortRefs = useRef<Map<string, AbortController>>(new Map())
  const sessionInputs = useRef<Map<string, string>>(new Map())
  const sessionSearchEnabled = useRef<Map<string, boolean>>(new Map())
  const scrollPositions = useRef<Map<string, number>>(new Map())
  const prevActiveSessionId = useRef<string | null>(null)
  const handleSendRef = useRef<((t?: string) => Promise<void>) | null>(null)
  const activeSessionIdRef = useRef<string | null>(null)
  const [, setInputTick] = useState(0)
  const [streamTick, setStreamTick] = useState(0)

  const activeSession = sessions.find(s => s.id === activeSessionId)
  const messages = activeSession?.messages || []
  const activeModelId = activeSession?.modelId || null
  const activeModel = models.find(m => m.id === activeModelId)
  const isCurrentLoading = activeSessionId ? loadingSessions.has(activeSessionId) : false

  const input = activeSessionId ? (sessionInputs.current.get(activeSessionId) || '') : ''
  const setInput = (val: string) => {
    if (activeSessionId) {
      sessionInputs.current.set(activeSessionId, val)
      setInputTick(t => t + 1)
    }
  }
  const searchEnabled = activeSessionId ? (sessionSearchEnabled.current.get(activeSessionId) ?? true) : false
  const toggleSearch = () => {
    if (activeSessionId) {
      sessionSearchEnabled.current.set(activeSessionId, !searchEnabled)
      setInputTick(t => t + 1)
    }
  }

  // Init: load models + start fresh session (never restore old chats)
  useEffect(() => {
    loadModels().then((modelList) => {
      setModels(modelList)
      const sid = generateId()
      const s: Session = { id: sid, title: '新对话', modelId: modelList[0]?.id || null, messages: [] }
      setSessions([s])
      setActiveSessionId(sid)
    })
  }, [])

  const saveModelsFn = useCallback(async (newModels: AgentModel[]) => {
    setModels(newModels)
    await saveModels(newModels)
  }, [])

  // Smart scroll: save/restore per session, auto-scroll only during loading
  useEffect(() => {
    const container = messagesContainerRef.current
    if (!container) return

    // Save scroll position of the previous session
    if (prevActiveSessionId.current && prevActiveSessionId.current !== activeSessionId) {
      const pos = scrollPositions.current.get(prevActiveSessionId.current)
      // already saved on scroll event, nothing more needed
    }
    prevActiveSessionId.current = activeSessionId

    // Restore scroll position for the new session
    const savedPos = activeSessionId ? scrollPositions.current.get(activeSessionId) : undefined
    if (savedPos !== undefined) {
      requestAnimationFrame(() => {
        container.scrollTop = savedPos
      })
    } else if (isCurrentLoading) {
      // During loading (new messages streaming), scroll to bottom
      requestAnimationFrame(() => {
        container.scrollTop = container.scrollHeight
      })
    }
  }, [activeSessionId])

  // Auto-scroll to bottom during streaming (new messages + content growth)
  const prevMsgCount = useRef(0)
  useEffect(() => {
    const container = messagesContainerRef.current
    if (!container || !activeSessionId) return

    const currentCount = messages.length
    const newMsgAdded = currentCount > prevMsgCount.current
    prevMsgCount.current = currentCount

    if (newMsgAdded || isCurrentLoading) {
      const atBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 100
      if (atBottom || newMsgAdded) {
        requestAnimationFrame(() => {
          container.scrollTop = container.scrollHeight
        })
      }
    }
  }, [messages.length, isCurrentLoading, streamTick])

  // Focus input when panel opens
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 350)
    }
  }, [isOpen, activeSessionId])

  // Update session model
  const setSessionModel = useCallback((sessionId: string, modelId: string | null) => {
    setSessions(prev => prev.map(s => s.id === sessionId ? { ...s, modelId } : s))
  }, [])

  // Sync model changes to active session
  useEffect(() => {
    if (activeSession && !activeSession.modelId && models.length > 0) {
      setSessionModel(activeSession.id, models[0].id)
    }
  }, [models, activeSession, setSessionModel])

  const addModel = useCallback(async (newModels: AgentModel[]) => {
    const updated = [...models, ...newModels]
    await saveModelsFn(updated)
    if (!activeModelId && updated.length > 0 && activeSession) {
      setSessionModel(activeSession.id, updated[0].id)
    }
    setError(null)
  }, [models, activeModelId, activeSession, saveModelsFn, setSessionModel])

  const deleteModel = useCallback(async (e: React.MouseEvent, modelId: string) => {
    e.stopPropagation()
    const updated = models.filter(m => m.id !== modelId)
    await saveModelsFn(updated)
    // Update sessions that used this model
    setSessions(prev => prev.map(s =>
      s.modelId === modelId ? { ...s, modelId: updated[0]?.id || null } : s
    ))
  }, [models, saveModelsFn])

  // Session management
  const createSession = useCallback(() => {
    const sid = generateId()
    const s: Session = { id: sid, title: '新对话',
      modelId: models.length > 0 ? models[0].id : null, messages: [] }
    setSessions(prev => [...prev, s])
    setActiveSessionId(sid)
    setError(null)
  }, [models])

  const deleteSession = useCallback((sid: string) => {
    // Abort streaming for this session
    const ctrl = abortRefs.current.get(sid)
    if (ctrl) { ctrl.abort(); abortRefs.current.delete(sid) }
    setLoadingSessions(prev => { const next = new Set(prev); next.delete(sid); return next })

    const remaining = sessions.filter(s => s.id !== sid)
    if (remaining.length === 0) {
      // Always keep at least one
      const ns: Session = { id: generateId(), title: '新对话',
        modelId: models.length > 0 ? models[0].id : null, messages: [] }
      setSessions([ns])
      setActiveSessionId(ns.id)
    } else {
      setSessions(remaining)
      if (activeSessionId === sid) setActiveSessionId(remaining[remaining.length - 1].id)
    }
  }, [sessions, activeSessionId, models])

  // Auto-title: use first user message as title (truncated)
  useEffect(() => {
    if (!activeSession) return
    if (activeSession.title !== '新对话') return
    const firstUser = activeSession.messages.find(m => m.role === 'user')
    if (firstUser) {
      const title = firstUser.content.slice(0, 20) + (firstUser.content.length > 20 ? '...' : '')
      setSessions(prev => prev.map(s => s.id === activeSession.id ? { ...s, title } : s))
    }
  }, [activeSession?.messages.length])

  // Handle initialContext: pre-fill and optionally auto-submit
  useEffect(() => {
    if (!initialContext || !activeSessionIdRef.current) return
    const sid = activeSessionIdRef.current
    let content: string
    if (initialContext.kind === 'image') {
      content = `分析这张生成的图片。原始提示词: ${initialContext.prompt || '无'}`
    } else if (initialContext.kind === 'text') {
      content = initialContext.text
    } else {
      return // intent type handled in P3
    }
    const userMsg: AgentMessage = {
      id: generateId(), role: 'user', content, timestamp: Date.now(),
    }
    setSessions(prev => prev.map(s =>
      s.id === sid ? { ...s, messages: [...s.messages, userMsg] } : s
    ))
    onContextConsumed?.()

    // Auto-submit if requested (use refs to avoid stale closure)
    if (initialContext.autoSubmit) {
      setTimeout(() => handleSendRef.current?.(content), 100)
    }
  }, [initialContext])

  // Send message (Agent Loop with tool calling)
  const handleSend = useCallback(async (overrideText?: string) => {
    const sid = activeSessionId
    const text = (overrideText ?? input).trim()
    if (!text || !activeModel || !sid || loadingSessions.has(sid)) return
    if (!overrideText) setInput('')
    setError(null)

    const userMsg: AgentMessage = {
      id: generateId(), role: 'user', content: text, timestamp: Date.now(),
    }
    setSessions(prev => prev.map(s =>
      s.id === sid ? { ...s, messages: [...s.messages, userMsg] } : s
    ))

    setLoadingSessions(prev => { const next = new Set(prev); next.add(sid); return next })
    const controller = new AbortController()
    abortRefs.current.set(sid, controller)

    // Build chat history (exclude tool messages)
    const currentMsgs = sessions.find(s => s.id === sid)?.messages || []
    const chatHistory: Array<{ role: string; content: string }> = []
    for (const m of currentMsgs) {
      if (m.role === 'user' || m.role === 'assistant') {
        chatHistory.push({ role: m.role, content: m.content })
      }
    }
    chatHistory.push({ role: 'user', content: text })

    const enableTools = sessionSearchEnabled.current.get(sid) ?? true

    try {
      for await (const event of agentChat(activeModel, chatHistory, enableTools, controller.signal, { tavilyApiKey: tavilyKey || undefined, currentUrl })) {
        switch (event.type) {
          case 'thinking':
            break

          case 'tool_call': {
            const tc = event.toolCall
            const args = (() => { try { return JSON.parse(tc.function.arguments) } catch { return {} } })()
            const toolInputLabel = tc.function.name === 'web_search'
              ? args.query || tc.function.arguments
              : tc.function.name === 'web_fetch'
                ? (args.url || '').slice(0, 60)
                : tc.function.arguments
            const toolMsg: AgentMessage = {
              id: generateId(),
              role: 'tool',
              content: '',
              timestamp: Date.now(),
              toolCallId: tc.id,
              toolName: tc.function.name,
              toolInput: typeof toolInputLabel === 'string' ? toolInputLabel : JSON.stringify(toolInputLabel),
              toolStatus: 'calling',
            }
            setSessions(prev => prev.map(s =>
              s.id === sid ? { ...s, messages: [...s.messages, toolMsg] } : s
            ))
            break
          }

          case 'tool_result': {
            setSessions(prev => prev.map(s =>
              s.id === sid ? {
                ...s,
                messages: s.messages.map(m =>
                  m.toolCallId === event.toolCallId
                    ? { ...m, toolResult: event.result, toolStatus: 'done' }
                    : m
                ),
              } : s
            ))
            break
          }

          case 'text': {
            // Legacy full-text event (kept for compatibility)
            const assistantId = generateId()
            setSessions(prev => prev.map(s =>
              s.id === sid ? {
                ...s,
                messages: [...s.messages, {
                  id: assistantId, role: 'assistant' as const,
                  content: event.content, timestamp: Date.now(),
                }],
              } : s
            ))
            break
          }

          case 'text_chunk': {
            setSessions(prev => prev.map(s => {
              if (s.id !== sid) return s
              const msgs = [...s.messages]
              const lastMsg = msgs[msgs.length - 1]
              if (lastMsg && lastMsg.role === 'assistant' && lastMsg.id.startsWith('streaming_')) {
                // Append to existing streaming message
                msgs[msgs.length - 1] = { ...lastMsg, content: lastMsg.content + event.content }
              } else {
                // Create new streaming message
                msgs.push({
                  id: 'streaming_' + generateId(),
                  role: 'assistant' as const,
                  content: event.content,
                  timestamp: Date.now(),
                })
              }
              return { ...s, messages: msgs }
            }))
            setStreamTick(t => t + 1)
            break
          }

          case 'text_revoke': {
            // Remove the last streaming message (intermediate thinking text before tool call)
            setSessions(prev => prev.map(s => {
              if (s.id !== sid) return s
              const msgs = [...s.messages]
              const last = msgs[msgs.length - 1]
              if (last && last.role === 'assistant' && last.id.startsWith('streaming_')) {
                msgs.pop()
              }
              return { ...s, messages: msgs }
            }))
            break
          }

          case 'text_end': {
            setSessions(prev => prev.map(s => {
              if (s.id !== sid) return s
              const msgs = s.messages.map(m => {
                if (m.role === 'assistant' && m.id.startsWith('streaming_')) {
                  return { ...m, id: m.id.replace('streaming_', '') }
                }
                return m
              })
              return { ...s, messages: msgs }
            }))
            break
          }

          case 'intent':
            if (event.action === 'navigate') {
              onNavigate?.(event.page)
            }
            break

          case 'error':
            setError(event.message)
            break

          case 'done':
            break
        }
      }
    } catch (err: any) {
      if (err.name === 'AbortError') {
        setSessions(prev => prev.map(s =>
          s.id === sid ? {
            ...s,
            messages: [...s.messages, {
              id: generateId(), role: 'assistant',
              content: '⏹ 已停止生成', timestamp: Date.now(),
            }],
          } : s
        ))
      } else {
        setError(err.message)
      }
    } finally {
      setLoadingSessions(prev => { const next = new Set(prev); next.delete(sid); return next })
      abortRefs.current.delete(sid)
    }
  }, [input, activeModel, loadingSessions, activeSessionId, sessions])

  // Keep refs in sync (must be after handleSend declaration to avoid TDZ)
  handleSendRef.current = handleSend
  activeSessionIdRef.current = activeSessionId

  const handleStop = useCallback(() => {
    if (activeSessionId) {
      const ctrl = abortRefs.current.get(activeSessionId)
      if (ctrl) ctrl.abort()
    }
  }, [activeSessionId])

  const getProviderName = (pid: string) => {
    const p = AGENT_PROVIDERS.find(pr => pr.id === pid)
    return p ? p.name.split(' ')[0] : pid
  }

  return (
    <div className={`agent-panel ${isOpen ? 'open' : ''}`}>
      <div className="agent-panel-inner">
        {/* Header + Tabs */}
        <div className="agent-panel-header">
          <span className="agent-panel-title">智能体助手</span>
          <button onClick={createSession} title="新建对话"><Plus size={18} /></button>
          <button onClick={() => setHistoryOpen(!historyOpen)} title="历史记录" className={historyOpen ? 'active' : ''}><History size={14} /></button>
          <button onClick={onClose} title="关闭"><X size={16} /></button>
        </div>
        {/* Loading indicator light bar */}
        {isCurrentLoading && <div className="agent-loading-bar" />}

        {historyOpen ? (
          /* ---- History Page ---- */
          <div className="agent-history-page">
            <div className="agent-history-page-header">
              <span className="agent-history-page-title">历史记录</span>
              <span className="agent-history-count">{sessions.length} 个会话</span>
              <button className="agent-history-page-close" onClick={() => setHistoryOpen(false)} title="返回"><X size={16} /></button>
            </div>
            <div className="agent-history-page-list">
              {[...sessions].reverse().map(s => (
                <div
                  key={s.id}
                  className={`agent-history-item ${s.id === activeSessionId ? 'active' : ''}`}
                  onClick={() => { setActiveSessionId(s.id); setHistoryOpen(false); setError(null) }}
                >
                  <div className="agent-history-title">{s.title}</div>
                  <div className="agent-history-meta">
                    <span>{s.messages.filter(m => m.role === 'user').length} 条消息</span>
                    {sessions.length > 1 && (
                      <span className="agent-history-del" onClick={e => { e.stopPropagation(); deleteSession(s.id) }}>
                        <Trash2 size={12} />
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
            <div className="agent-history-page-footer">
              <label style={{ fontSize: 12, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>字体大小: {fontSize}px</label>
              <input
                type="range" min={11} max={18} step={1} value={fontSize}
                onChange={e => {
                  const v = parseInt(e.target.value)
                  setFontSize(v)
                  localStorage.setItem('agent_font_size', String(v))
                }}
                className="agent-font-slider"
              />
            </div>
          </div>
        ) : (
          /* ---- Main Chat Content ---- */
          <>
            {/* Session Tabs */}
            <div className="agent-tabs">
              {sessions.map(s => (
                <div
                  key={s.id}
                  className={`agent-tab ${s.id === activeSessionId ? 'active' : ''}`}
                  onClick={() => { setActiveSessionId(s.id); setError(null) }}
                  title={s.title}
                >
                  <span className="agent-tab-title">{s.title}</span>
                  {sessions.length > 1 && (
                    <span className="agent-tab-close" onClick={e => { e.stopPropagation(); deleteSession(s.id) }} title="关闭">
                      <X size={10} />
                    </span>
                  )}
                </div>
              ))}
            </div>

            {/* Messages */}
            <div
              className="agent-messages"
              style={{ fontSize: `${fontSize}px` }}
              ref={messagesContainerRef}
              onScroll={() => {
                if (activeSessionId && messagesContainerRef.current) {
                  scrollPositions.current.set(activeSessionId, messagesContainerRef.current.scrollTop)
                }
              }}
            >
              {messages.length === 0 && !isCurrentLoading && (
                <div className="agent-empty">
                  <div className="agent-empty-icon">✨</div>
                  <div className="agent-empty-title">有什么我可以帮你的？</div>
                  <div className="agent-empty-sub">
                    {activeModel
                      ? '下方输入你的问题开始对话'
                      : '下方添加一个模型后开始对话'}
                  </div>
                </div>
              )}
              {messages.map(msg => {
                if (msg.role === 'tool') return null
                return (
                  <div key={msg.id} className={`agent-msg agent-msg-${msg.role}`}>
                    <SimpleMarkdown content={msg.content} />
                    {msg.role === 'assistant' && msg.content && !msg.content.includes('⏹') && (
                      <div className="agent-msg-actions">
                        <CopyButton text={msg.content} />
                      </div>
                    )}
                  </div>
                )
              })}
              {error && (
                <div className="agent-msg agent-msg-assistant" style={{ color: 'var(--danger, #ef4444)' }}>
                  ❌ {error}
                </div>
              )}
            </div>

            {/* Input Area */}
            <div className="agent-input-area">
              {!activeModel && (
                <div className="agent-no-model">⚠️ 尚未添加模型，请在下方添加后使用</div>
              )}
              <div className="agent-input-row">
                <textarea
                  ref={inputRef}
                  className="agent-input"
                  placeholder={activeModel ? '输入你的问题... (Enter 发送，Shift+Enter 换行)' : '请先添加模型'}
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault()
                      handleSend()
                    }
                  }}
                  disabled={!activeModel}
                  rows={1}
                  onInput={e => {
                    const el = e.currentTarget
                    el.style.height = 'auto'
                    el.style.height = Math.min(el.scrollHeight, 200) + 'px'
                  }}
                />
              </div>
              <div className="agent-model-row">
                <div className="agent-model-select-wrap">
                  <button
                    className="agent-model-select-btn"
                    onClick={() => setDropdownOpen(!dropdownOpen)}
                    onBlur={(e) => {
                      const rt = e.relatedTarget as HTMLElement
                      if (rt?.closest('.agent-model-dropdown')) return
                      setTimeout(() => setDropdownOpen(false), 150)
                    }}
                  >
                    {activeModel ? (
                      <>
                        <span className="agent-model-dot" style={{
                          background: (() => {
                            const colors: Record<string, string> = { siliconflow: '#6c5ce7', deepseek: '#4d6bfe', openai: '#00d68f', zhipu: '#ffa502', moonshot: '#ff6b81', qwen: '#1e90ff' }
                            return colors[activeModel?.providerId] || '#888'
                          })(),
                        }} />
                        <span>{activeModel.displayName || activeModel.modelName}</span>
                        <span className="agent-model-tag">{getProviderName(activeModel.providerId)}</span>
                      </>
                    ) : (
                      <span style={{ color: 'var(--text-muted)' }}>⚙️ 添加模型...</span>
                    )}
                    <ChevronDown size={12} style={{ marginLeft: 'auto' }} />
                  </button>
                  {dropdownOpen && (
                    <div className="agent-model-dropdown">
                      {models.map(m => (
                        <div
                          key={m.id}
                          className={`agent-model-item ${m.id === activeModelId ? 'selected' : ''}`}
                          onClick={() => {
                            if (activeSession) setSessionModel(activeSession.id, m.id)
                            setDropdownOpen(false)
                            setError(null)
                          }}
                        >
                          <span className="agent-model-dot" style={{
                            background: (() => {
                              const colors: Record<string, string> = { siliconflow: '#6c5ce7', deepseek: '#4d6bfe', openai: '#00d68f', zhipu: '#ffa502', moonshot: '#ff6b81', qwen: '#1e90ff' }
                              return colors[m.providerId] || '#888'
                            })(),
                          }} />
                          <span>{m.displayName || m.modelName}</span>
                          <span className="agent-model-tag">{getProviderName(m.providerId)}</span>
                          <span style={{ flex: 1 }} />
                          <span className="agent-model-delete" onClick={e => deleteModel(e, m.id)} title="删除">
                            <Trash2 size={11} />
                          </span>
                        </div>
                      ))}
                      {models.length > 0 && <div className="agent-model-divider" />}
                      <div className="agent-model-item add" onClick={() => { setDropdownOpen(false); setModalOpen(true) }}>
                        ＋ 添加模型
                      </div>
                      <div className="agent-model-divider" />
                      <div className="agent-model-item tavily-key" onClick={e => e.stopPropagation()}>
                        <span style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 2 }}>Tavily 搜索 API Key（可选，提升搜索质量）</span>
                        <input
                          type="password"
                          value={tavilyKey}
                          onChange={e => {
                            setTavilyKey(e.target.value)
                            localStorage.setItem('agent_tavily_key', e.target.value)
                          }}
                          placeholder="tvly-xxxxxxxxxx"
                          style={{
                            width: '100%', padding: '4px 6px', fontSize: 11,
                            background: 'var(--bg-card)', border: '1px solid var(--border-color)',
                            borderRadius: 4, color: 'var(--text-primary)', outline: 'none',
                          }}
                        />
                      </div>
                    </div>
                  )}
                </div>
                {isCurrentLoading ? (
                  <button className="agent-send-btn agent-stop-btn" onClick={handleStop}>⏹ 停止</button>
                ) : (
                  <button className="agent-send-btn" onClick={() => handleSend()} disabled={!activeModel || !input.trim()}>
                    ↑
                  </button>
                )}
              </div>
              <div className="agent-bottom-hint">AI 生成的内容可能不准确，请注意甄别</div>
            </div>
          </>
        )}
      </div>

      <AddModelModal isOpen={modalOpen} onClose={() => setModalOpen(false)} onAdd={addModel} />
    </div>
  )
}
