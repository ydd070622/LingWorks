import { useState, useEffect, useRef, useCallback } from 'react'
import type { AgentModel, AgentMessage, AgentContext } from '../types'
import { AGENT_PROVIDERS, loadModels, streamChat, parseSSEStream, generateId } from '../services/agent'
import { agentChat } from '../services/agent-loop'
import { Copy, X, Plus, ChevronDown, History, Trash2, Check, RefreshCw, Loader2, Sparkles } from 'lucide-react'

// ===== Code Block with Copy Button =====
function CodeBlock({ code }: { code: string }) {
  const [copied, setCopied] = useState(false)
  const handle = async () => {
    await navigator.clipboard.writeText(code)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }
  return (
    <div className="agent-code-block">
      <pre><code>{code}</code></pre>
      <button className="agent-code-copy" onClick={handle}>
        {copied ? <Check size={12} /> : <Copy size={12} />}
        {copied ? '已复制' : '复制'}
      </button>
    </div>
  )
}

// ===== Quote Block with Copy Button (styled as text box card) =====
function QuoteBlock({ text, label }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false)
  const handleCopy = async () => {
    await navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }
  // Detect prompt type from label: only show card style for explicit prompt keywords
  const promptType: 'positive' | 'negative' | null = (() => {
    if (!label) return null
    const lowerLabel = label.toLowerCase()
    if (lowerLabel.includes('negative') || label.includes('负向') || label.includes('负面')) return 'negative'
    // Only treat as positive prompt if label explicitly mentions prompt-related keywords
    if (lowerLabel.includes('prompt') || label.includes('提示词') || label.includes('正向') || label.includes('正面')) return 'positive'
    // Regular blockquote (e.g., 信息来源, 核心定位, 功能说明) — no card, render inline
    return null
  })()
  // For non-prompt blockquotes: render as simple inline text (no card, no copy button)
  if (!promptType) {
    return <span className="agent-inline-quote">{text}</span>
  }
  const handleAdopt = () => {
    if (promptType) {
      window.dispatchEvent(new CustomEvent('adopt-prompt', { detail: { type: promptType, text } }))
    }
  }
  return (
    <div className="agent-prompt-box">
      {label && <div className="agent-prompt-label">{label}</div>}
      <div className="agent-prompt-text">{text}</div>
      <div className="agent-prompt-actions">
        {promptType && (
          <button className="agent-prompt-adopt" onClick={handleAdopt} title="采用到文生图">
            <Sparkles size={14} />
            采用
          </button>
        )}
        <button className="agent-prompt-copy" onClick={handleCopy}>
          {copied ? <Check size={14} /> : <Copy size={14} />}
          {copied ? ' 已复制' : ' 复制'}
        </button>
      </div>
    </div>
  )
}

// ===== Table Block =====
function TableBlock({ text }: { text: string }) {
  const lines = text.trim().split('\n').filter(l => l.trim().startsWith('|'))
  if (lines.length < 3) return <span>{text}</span>
  const parseRow = (line: string) =>
    line.replace(/^\|\s*/, '').replace(/\s*\|$/, '').split('|').map(c => c.trim())
  const header = parseRow(lines[0])
  const body = lines.slice(2)
  // Render inline markdown (bold, italic, code) in table cells
  const renderCell = (text: string) =>
    text
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')
      .replace(/\*(.+?)\*/g, '<i>$1</i>')
      .replace(/`(.+?)`/g, '<code>$1</code>')
  return (
    <table className="agent-table">
      <thead>
        <tr>{header.map((h, i) => <th key={i} dangerouslySetInnerHTML={{ __html: renderCell(h) }} />)}</tr>
      </thead>
      <tbody>
        {body.map((row, ri) => (
          <tr key={ri}>{parseRow(row).map((c, ci) => <td key={ci} dangerouslySetInnerHTML={{ __html: renderCell(c) }} />)}</tr>
        ))}
      </tbody>
    </table>
  )
}

// ===== Extract tables from a text block, returning alternating [text, table] segments =====
function extractTables(text: string): Array<{ type: 'text' | 'table'; content: string }> {
  const lines = text.split('\n')
  const result: Array<{ type: 'text' | 'table'; content: string }> = []
  let i = 0
  let textBuf: string[] = []

  while (i < lines.length) {
    // Look for table start: three consecutive lines that all start/end with |
    const isPipeLine = (idx: number) => {
      const l = (lines[idx] || '').trim()
      return l.startsWith('|') && l.endsWith('|')
    }
    const isSepLine = (idx: number) => {
      const s = (lines[idx] || '').trim().replace(/\s/g, '')
      return /^\|[-:]+\|[-:|]+\|?[-:|]*\|?$/.test(s)
    }

    if (isPipeLine(i) && i + 1 < lines.length && isSepLine(i + 1) && i + 2 < lines.length && isPipeLine(i + 2)) {
      // Flush text buffer
      if (textBuf.length > 0) {
        result.push({ type: 'text', content: textBuf.join('\n') })
        textBuf = []
      }
      // Collect table lines
      const tableLines: string[] = []
      while (i < lines.length && isPipeLine(i)) {
        tableLines.push(lines[i])
        i++
      }
      result.push({ type: 'table', content: tableLines.join('\n') })
    } else {
      textBuf.push(lines[i])
      i++
    }
  }
  if (textBuf.length > 0) {
    result.push({ type: 'text', content: textBuf.join('\n') })
  }
  return result.length > 0 ? result : [{ type: 'text', content: text }]
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
          return <CodeBlock key={i} code={seg.content.trim()} />
        }
        const paragraphs = seg.content.split(/\n\n+/)
        return (
          <span key={i}>
            {paragraphs.map((p, pi) => {
              // Extract tables from the paragraph
              const parts = extractTables(p)
              return (
                <span key={pi}>
                  {pi > 0 && <><br /><br /></>}
                  {parts.map((part, idx) => {
                    if (part.type === 'table') {
                      return <TableBlock key={idx} text={part.content} />
                    }
                    // Process text part: detect blockquotes
                    const textLines = part.content.split('\n')
                    const quoteLines = textLines.filter(l => l.trim().startsWith('>'))
                    const firstQuoteIdx = textLines.findIndex(l => l.trim().startsWith('>'))
                    const labelLines = firstQuoteIdx >= 0
                      ? textLines.slice(0, firstQuoteIdx).filter(l => {
                          const t = l.trim()
                          return t && !t.startsWith('---')
                        })
                      : []
                    if (quoteLines.length > 0) {
                      const quoteText = quoteLines.map(l => l.replace(/^> ?/, '')).join('\n').trim()
                      const labelRaw = labelLines.map(l => l.trim()).join(' / ')
                      const labelClean = labelRaw.replace(/\*\*(.+?)\*\*/g, '$1').replace(/\*(.+?)\*/g, '$1').trim()
                      return <QuoteBlock key={idx} text={quoteText} label={labelClean || undefined} />
                    }
                    return (
                      <span key={idx} dangerouslySetInnerHTML={{
                        __html: renderInline(part.content).replace(/\n/g, '<br/>'),
                      }} />
                    )
                  })}
                </span>
              )
            })}
          </span>
        )
      })}
    </>
  )
}

// ===== Check if content contains prompt blocks (for "一键采用" button) =====
function hasPromptBlocks(content: string): boolean {
  return /\*\*正[向面].*Prompt.*\*\*/m.test(content) || /\*\*负[向面].*Prompt.*\*\*/m.test(content)
}

// ===== One-click adopt all prompts in a message =====
function handleAdoptAll(e: React.MouseEvent) {
  const msgDiv = (e.currentTarget as HTMLElement).closest('.agent-msg') as HTMLElement
  if (!msgDiv) return
  const boxes = msgDiv.querySelectorAll<HTMLElement>('.agent-prompt-box')
  boxes.forEach((box, i) => {
    const label = box.querySelector('.agent-prompt-label')?.textContent || ''
    const text = box.querySelector('.agent-prompt-text')?.textContent || ''
    if (!text) return
    const type: 'positive' | 'negative' =
      label.includes('负向') || label.includes('负面') || label.toLowerCase().includes('negative')
        ? 'negative' : 'positive'
    // Stagger events so React processes each state update separately
    setTimeout(() => {
      window.dispatchEvent(new CustomEvent('adopt-prompt', { detail: { type, text } }))
    }, i * 50)
  })
}

// ===== Session type =====
interface Session {
  id: string
  title: string
  modelId: string | null
  messages: AgentMessage[]
}

// ===== Main Panel =====
export default function AgentPanel({ isOpen, onClose, currentUrl, currentContent, currentPage, initialContext, onContextConsumed, onNavigate }: {
  isOpen: boolean; onClose: () => void; currentUrl?: string; currentContent?: string; currentPage?: string
  initialContext?: AgentContext | null; onContextConsumed?: () => void
  onNavigate?: (page: string) => void
}) {
  const [models, setModels] = useState<AgentModel[]>([])
  const [sessions, setSessions] = useState<Session[]>([])
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null)
  const [loadingSessions, setLoadingSessions] = useState<Set<string>>(new Set())
  const [error, setError] = useState<string | null>(null)
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [fontSize, setFontSize] = useState(() => {
    const saved = localStorage.getItem('agent_font_size')
    return saved ? parseInt(saved) : 13
  })
  const [quotedText, setQuotedText] = useState<string | null>(null)

  const messagesContainerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const abortRefs = useRef<Map<string, AbortController>>(new Map())
  const sessionInputs = useRef<Map<string, string>>(new Map())
  const sessionSearchEnabled = useRef<Map<string, boolean>>(new Map())
  const scrollPositions = useRef<Map<string, number>>(new Map())
  const prevActiveSessionId = useRef<string | null>(null)
  const handleSendRef = useRef<((t?: string) => Promise<void>) | null>(null)
  const activeSessionIdRef = useRef<string | null>(null)
  const currentUrlRef = useRef(currentUrl)
  const currentContentRef = useRef(currentContent)
  const currentPageRef = useRef(currentPage)
  currentUrlRef.current = currentUrl
  currentContentRef.current = currentContent
  currentPageRef.current = currentPage
  const tavilyKeyRef = useRef<string>('')

  // Load Tavily key from persistent store (survives restart), localStorage fallback
  useEffect(() => {
    const loadKey = async () => {
      if (window.electronAPI) {
        const saved = await window.electronAPI.getStore('agent_tavily_key')
        if (typeof saved === 'string' && saved) {
          tavilyKeyRef.current = saved
          return
        }
      }
      tavilyKeyRef.current = localStorage.getItem('agent_tavily_key') || ''
    }
    loadKey()
  }, [])
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

  // Reload models when changed from Settings
  useEffect(() => {
    const handler = () => {
      loadModels().then(setModels)
    }
    window.addEventListener('agent-models-changed', handler)
    return () => window.removeEventListener('agent-models-changed', handler)
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

  // Handle initialContext: text → quote reference, image → auto-submit
  useEffect(() => {
    if (!initialContext || !activeSessionIdRef.current) return
    const sid = activeSessionIdRef.current

    if (initialContext.kind === 'text') {
      // Set as quoted reference, user will type their question
      setQuotedText(initialContext.text)
      onContextConsumed?.()
      // Focus input
      setTimeout(() => inputRef.current?.focus(), 100)
      return
    }

    if (initialContext.kind === 'image') {
      const content = `分析这张生成的图片。原始提示词: ${initialContext.prompt || '无'}`
      if (initialContext.autoSubmit) {
        onContextConsumed?.()
        setTimeout(() => handleSendRef.current?.(content), 100)
        return
      }
      const userMsg: AgentMessage = {
        id: generateId(), role: 'user', content, timestamp: Date.now(),
      }
      setSessions(prev => prev.map(s =>
        s.id === sid ? { ...s, messages: [...s.messages, userMsg] } : s
      ))
      onContextConsumed?.()
      return
    }
    // intent type handled elsewhere
  }, [initialContext])

  // Send message (Agent Loop with tool calling)
  const handleSend = useCallback(async (overrideText?: string) => {
    const sid = activeSessionId
    const text = (overrideText ?? input).trim()
    if (!text || !activeModel || !sid || loadingSessions.has(sid)) return
    if (!overrideText) setInput('')
    setError(null)

    // Prepend quoted text if present
    let finalText = text
    if (quotedText) {
      finalText = `> ${quotedText}\n\n${text}`
      setQuotedText(null)
    }

    const userMsg: AgentMessage = {
      id: generateId(), role: 'user', content: finalText, timestamp: Date.now(),
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
    chatHistory.push({ role: 'user', content: finalText })

    const enableTools = sessionSearchEnabled.current.get(sid) ?? true

    // Use refs to always read LATEST page context (prevents stale closure)
    const ctxUrl = currentUrlRef.current
    const ctxContent = currentContentRef.current
    const ctxPage = currentPageRef.current

    try {
      for await (const event of agentChat(activeModel, chatHistory, enableTools, controller.signal, { tavilyApiKey: tavilyKeyRef.current || localStorage.getItem('agent_tavily_key') || undefined, currentUrl: ctxUrl, currentContent: ctxContent, currentPage: ctxPage })) {
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
    <div className={`agent-panel ${isOpen ? 'open' : ''}`} style={isOpen ? { width: 340 } : undefined}>
      <div className="agent-panel-inner" style={isOpen ? { width: 340 } : undefined}>
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
                    <span className="agent-history-del" onClick={e => { e.stopPropagation(); deleteSession(s.id) }}>
                      <Trash2 size={12} />
                    </span>
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
                  <span className="agent-tab-close" onClick={e => { e.stopPropagation(); deleteSession(s.id) }} title="关闭">
                    <X size={10} />
                  </span>
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
                const hasPrompts = hasPromptBlocks(msg.content)
                return (
                  <div key={msg.id} className={`agent-msg agent-msg-${msg.role}`}>
                    <SimpleMarkdown content={msg.content} />
                    {msg.role === 'assistant' && hasPrompts && (
                      <div className="agent-msg-actions">
                        <button className="agent-msg-adopt-all" onClick={handleAdoptAll}>
                          <Sparkles size={13} /> 一键采用
                        </button>
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
              {quotedText && (
                <div className="agent-quoted-text">
                  <div className="agent-quote-content">
                    <span className="agent-quote-label">引用</span>
                    <span className="agent-quote-text">{quotedText.length > 100 ? quotedText.slice(0, 100) + '...' : quotedText}</span>
                  </div>
                  <button className="agent-quote-close" onClick={() => setQuotedText(null)} title="取消引用">
                    <X size={14} />
                  </button>
                </div>
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
                        </div>
                      ))}
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
            </div>
          </>
        )}
      </div>
    </div>
  )
}
