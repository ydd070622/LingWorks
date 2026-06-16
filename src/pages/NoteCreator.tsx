import { useState, useRef, useCallback } from 'react'
import { Copy, Send, Sparkles, Tag, Palette, X, ChevronLeft, ChevronRight } from 'lucide-react'
import type { AgentContext } from '../types'

interface NoteCreatorProps {
  onSendToAgent?: (ctx: AgentContext) => void
  onNavigate?: (page: string) => void
  onOpenAgent?: () => void
}

// ---- Topic & Demo Data ----
const TOPICS = [
  { key: '设计案例', icon: '🏠', label: '设计案例' },
  { key: '装修避坑', icon: '⚠️', label: '装修避坑' },
  { key: '预算清单', icon: '💰', label: '预算清单' },
  { key: '空间改造', icon: '🔨', label: '空间改造' },
  { key: '软装搭配', icon: '🛋️', label: '软装搭配' },
  { key: '材料选购', icon: '🧱', label: '材料选购' },
]

const REQ_TEMPLATES: Record<string, string> = {
  case: `• 案例信息：120㎡三室两厅、现代轻奢风、全屋花费32万
• 核心设计：开放式客餐厨一体、主卧大套房、无主灯设计
• 特殊工艺：悬浮吊顶、隐形门、岩板背景墙
• 目标受众：改善型住房业主、追求品质的80/90后
• 特别要求：强调空间感和收纳设计`,
  avoid: `• 装修类型：旧房翻新、120㎡
• 踩坑经历：水电定位错误导致插座被挡、瓷砖色差、全屋定制延期
• 损失金额：多花了约3万
• 核心教训：合同细节要写清楚、水电定位必须亲自到场`,
  budget: `• 房屋信息：100㎡三室一厅、简约风
• 总花费：硬装12万+软装6万+电器5万=23万
• 省钱技巧：瓷砖网购、油漆自己买材料、618买电器
• 最值得花的钱：全屋定制（4.5万）、中央空调（2.8万）`,
  beforeAfter: `• 改造项目：89㎡老房翻新
• 改造前：户型不方正、采光差、收纳不够
• 改造方案：拆厨墙做开放式、阳台包进客厅、次卧改多功能房
• 改造费用：纯改造12万（不含家具）
• 改造成果：收纳翻3倍、采光提升明显、空间感像110㎡`,
}

const COVER_STYLES = ['📸 前后对比', '🏠 完工实拍', '✨ 效果图渲染', '🔤 文字排版']

// ---- Component ----
export default function NoteCreator({ onSendToAgent, onNavigate, onOpenAgent }: NoteCreatorProps) {
  // State
  const [activeTab, setActiveTab] = useState<'write' | 'cover'>('write')
  const [previewMode, setPreviewMode] = useState<'feed' | 'detail'>('feed')
  const [activeTopic, setActiveTopic] = useState('设计案例')
  const [requirements, setRequirements] = useState('')
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [tags, setTags] = useState<string[]>([])
  const [tagInput, setTagInput] = useState('')
  const [titleSuggestions, setTitleSuggestions] = useState<string[]>([])
  const [showTitleSuggestions, setShowTitleSuggestions] = useState(false)
  const [tagRecommendations, setTagRecommendations] = useState<string[]>([])
  const [showTagRecs, setShowTagRecs] = useState(false)
  const [publishModalOpen, setPublishModalOpen] = useState(false)
  const [publishStep, setPublishStep] = useState(0)
  const [toastMsg, setToastMsg] = useState('')
  const [loading, setLoading] = useState('')
  const toastTimer = useRef<ReturnType<typeof setTimeout>>()

  // ---- Toast ----
  const toast = useCallback((msg: string) => {
    setToastMsg(msg)
    clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToastMsg(''), 2000)
  }, [])

  // ---- AI Generation (via Agent Panel) ----
  const sendToAgent = useCallback((prompt: string) => {
    if (onOpenAgent) onOpenAgent()
    onSendToAgent?.({ kind: 'text', text: prompt, autoSubmit: true })
    toast('已发送到智能体，请在右侧面板查看生成结果')
  }, [onSendToAgent, onOpenAgent, toast])

  const buildGenPrompt = useCallback((mode: 'all' | 'title' | 'content' | 'tags'): string => {
    const req = requirements.trim()
    const topic = activeTopic
    let prompt = ''

    if (mode === 'all' || mode === 'title') {
      prompt += `你是一个小红书家装博主。请根据以下信息生成 5 个小红书笔记标题（20字以内，有吸引力）：\n主题：${topic}\n${req ? `需求：${req}\n` : ''}\n\n`
    }
    if (mode === 'all' || mode === 'content') {
      prompt += `${mode === 'content' ? '你是一个小红书家装博主。' : ''}请写一篇小红书笔记正文（300-800字），用 emoji 分段，口语化风格。\n主题：${topic}\n${req ? `需求描述：${req}\n` : ''}${title ? `标题：${title}\n` : ''}\n要求：开头用「姐妹们/家人们」拉近距离，内容有干货，结尾引导评论互动。${mode === 'content' && content.trim() ? `\n现有草稿：${content}\n请对以上草稿进行润色优化。` : ''}\n`
    }
    if (mode === 'all' || mode === 'tags') {
      prompt += `请为以上小红书笔记推荐 8-10 个话题标签。`
    }

    return prompt
  }, [requirements, activeTopic, title, content])

  const handleGenerateAll = () => sendToAgent(buildGenPrompt('all'))
  const handleGenerateTitles = () => sendToAgent(buildGenPrompt('title'))
  const handleGenerateContent = () => sendToAgent(buildGenPrompt('content'))
  const handleGenerateTags = () => sendToAgent(buildGenPrompt('tags'))

  // ---- Tags ----
  const addTag = useCallback((tag: string) => {
    const clean = tag.replace(/^#\s*/, '').trim()
    if (clean && !tags.includes(clean) && tags.length < 10) {
      setTags(prev => [...prev, clean])
      if (showTagRecs) setShowTagRecs(false)
    }
    setTagInput('')
  }, [tags, showTagRecs])

  const removeTag = useCallback((tag: string) => {
    setTags(prev => prev.filter(t => t !== tag))
  }, [])

  const handleTagKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && tagInput.trim()) {
      e.preventDefault()
      addTag(tagInput.trim())
    }
  }

  // ---- Title Suggestions ----
  const applyTitle = useCallback((t: string) => {
    setTitle(t)
    setShowTitleSuggestions(false)
    toast('已采用标题')
  }, [toast])

  // ---- Copy ----
  const handleCopyAll = useCallback(() => {
    const tagText = tags.map(t => '#' + t).join(' ')
    const full = `${title}\n\n${content}\n\n${tagText}`
    navigator.clipboard.writeText(full).then(() => toast('已复制到剪贴板')).catch(() => toast('复制失败'))
  }, [title, content, tags, toast])

  // ---- Publish ----
  const handlePublish = () => {
    if (!title.trim() && !content.trim()) {
      toast('请先生成或编写笔记内容')
      return
    }
    setPublishModalOpen(true)
    setPublishStep(0)
  }

  const simulatePublishSteps = () => {
    const steps = [700, 900, 700, 500]
    let delay = 0
    steps.forEach((d, i) => {
      delay += d
      setTimeout(() => setPublishStep(i + 1), delay)
    })
    setTimeout(() => {
      toast('已切换到创作者中心，请在 WebView 中手动点击发布')
      setPublishModalOpen(false)
      onNavigate?.('xhs_juguang')
    }, delay + 800)
  }

  // ---- Requirements ----
  const fillReqTemplate = (type: string) => {
    setRequirements(REQ_TEMPLATES[type] || '')
    toast('已填入需求模板')
  }

  const hasRequirements = requirements.trim().length > 0

  // ---- Preview Content ----
  const previewTitle = title || '你的笔记标题会显示在这里'
  const previewContent = content || '输入标题和正文后，这里会实时展示笔记在小红书信息流中的预览效果。'
  const previewTagsHtml = tags.length > 0
    ? tags.map(t => `# ${t}`).join('  ')
    : '# 家装设计'

  return (
    <div style={{ display: 'flex', flex: 1, overflow: 'hidden', height: '100%' }}>
      {/* ===== Left: Editor ===== */}
      <div style={{
        flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column',
        borderRight: '1px solid var(--border-color)', background: 'var(--bg-primary)',
      }}>
        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 12, padding: '12px 20px',
          borderBottom: '1px solid var(--border-color)', flexShrink: 0,
        }}>
          <h2 style={{ fontSize: 15, fontWeight: 600, flex: 1, margin: 0 }}>✍️ 笔记创作</h2>
          <div style={{ display: 'flex', gap: 2, background: 'var(--bg-tertiary)', borderRadius: 8, padding: 3 }}>
            <button
              onClick={() => setActiveTab('write')}
              style={{
                padding: '5px 14px', borderRadius: 6, fontSize: 12, cursor: 'pointer',
                border: 'none', fontFamily: 'inherit',
                background: activeTab === 'write' ? 'var(--accent)' : 'transparent',
                color: activeTab === 'write' ? '#fff' : 'var(--text-secondary)',
              }}
            >📝 写笔记</button>
            <button
              onClick={() => setActiveTab('cover')}
              style={{
                padding: '5px 14px', borderRadius: 6, fontSize: 12, cursor: 'pointer',
                border: 'none', fontFamily: 'inherit',
                background: activeTab === 'cover' ? 'var(--accent)' : 'transparent',
                color: activeTab === 'cover' ? '#fff' : 'var(--text-secondary)',
              }}
            >🎨 封面设计</button>
          </div>
        </div>

        {/* Editor Body */}
        {activeTab === 'write' ? (
          <div style={{ flex: 1, overflowY: 'auto', padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
            {/* Requirements */}
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>📋 需求描述</span>
                <span style={{ fontSize: 9, padding: '2px 6px', borderRadius: 4, background: 'rgba(245,158,11,0.15)', color: 'var(--warning)', fontWeight: 600 }}>核心</span>
                <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>填写详细信息，AI 生成更精准</span>
              </div>
              <textarea
                value={requirements}
                onChange={e => setRequirements(e.target.value)}
                placeholder={`描述你的具体需求，AI 会根据这些信息生成定制化内容：\n\n• 案例信息：89㎡小三房、现代简约风、总花费18万\n• 核心卖点：开放式厨房+岛台、全屋收纳翻倍\n• 目标受众：90后刚需房业主\n• 特别要求：强调收纳设计、需要对比改造前后`}
                style={{
                  width: '100%', padding: '10px 14px', borderRadius: 6,
                  background: 'var(--bg-tertiary)', border: '1px solid rgba(245,158,11,0.25)',
                  color: 'var(--text-primary)', fontSize: 12, lineHeight: 1.7,
                  fontFamily: 'inherit', resize: 'vertical', outline: 'none',
                  minHeight: 64, maxHeight: 140,
                }}
              />
              <div style={{ display: 'flex', gap: 4, marginTop: 6, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 10, color: 'var(--text-muted)', marginRight: 4, lineHeight: '22px' }}>快捷模板：</span>
                {Object.entries(REQ_TEMPLATES).map(([key, _]) => (
                  <button key={key} onClick={() => fillReqTemplate(key)} style={{
                    padding: '3px 8px', borderRadius: 10, fontSize: 10, cursor: 'pointer',
                    border: '1px dashed rgba(255,255,255,0.12)', background: 'transparent',
                    color: 'var(--text-muted)', fontFamily: 'inherit',
                  }}>
                    {key === 'case' ? '📐 设计案例' : key === 'avoid' ? '⚠️ 装修避坑' : key === 'budget' ? '💰 预算清单' : '🔨 改造前后'}
                  </button>
                ))}
                <button onClick={() => setRequirements('')} style={{
                  padding: '3px 8px', borderRadius: 10, fontSize: 10, cursor: 'pointer',
                  border: '1px dashed rgba(255,255,255,0.12)', background: 'transparent',
                  color: 'var(--text-muted)', fontFamily: 'inherit',
                }}>✕ 清空</button>
              </div>
              <div style={{ fontSize: 10, color: hasRequirements ? 'var(--success)' : 'var(--text-muted)', marginTop: 4, display: 'flex', alignItems: 'center', gap: 4 }}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: hasRequirements ? 'var(--success)' : 'var(--text-muted)', display: 'inline-block' }} />
                {hasRequirements ? '需求已填写 — AI 将根据你的信息定制内容' : '未填写需求 — AI 将按选定主题随机生成'}
              </div>
            </div>

            {/* Topic Selector */}
            <div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 6 }}>🎯 笔记主题</div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {TOPICS.map(t => (
                  <button key={t.key} onClick={() => setActiveTopic(t.key)} style={{
                    padding: '5px 12px', borderRadius: 14, fontSize: 11, cursor: 'pointer',
                    border: `1px solid ${activeTopic === t.key ? 'var(--accent)' : 'var(--border-color)'}`,
                    background: activeTopic === t.key ? 'var(--accent)' : 'transparent',
                    color: activeTopic === t.key ? '#fff' : 'var(--text-secondary)',
                    fontFamily: 'inherit', transition: 'all 0.12s',
                  }}>{t.icon} {t.label}</button>
                ))}
              </div>
            </div>

            {/* Title */}
            <div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 6, display: 'flex', justifyContent: 'space-between' }}>
                <span>📌 笔记标题</span>
                <span style={{ fontSize: 10 }}>{title.length}/20</span>
              </div>
              <input
                type="text"
                value={title}
                onChange={e => setTitle(e.target.value.slice(0, 20))}
                placeholder="输入标题，或点击「生成标题」让AI帮你起..."
                style={{
                  width: '100%', padding: '10px 14px', borderRadius: 6, fontSize: 15,
                  background: 'var(--bg-tertiary)', border: '1px solid var(--border-color)',
                  color: 'var(--text-primary)', fontFamily: 'inherit', outline: 'none',
                }}
              />
            </div>

            {/* Content */}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 6 }}>📝 笔记正文</div>
              <textarea
                value={content}
                onChange={e => setContent(e.target.value)}
                placeholder={`在这里写笔记正文，或点击「AI 生成文案」自动生成...\n\n小红书家装文案技巧：\n✅ 开头用「姐妹们/家人们」+ 强共鸣钩子\n✅ emoji 分段，增加可读性\n✅ 多用对比（改造前 vs 改造后、花钱 vs 省钱）\n✅ 结尾带互动引导`}
                style={{
                  flex: 1, minHeight: 180, padding: 14, borderRadius: 6,
                  background: 'var(--bg-tertiary)', border: '1px solid var(--border-color)',
                  color: 'var(--text-primary)', fontSize: 13, lineHeight: 1.8,
                  fontFamily: 'inherit', resize: 'none', outline: 'none',
                }}
              />
            </div>

            {/* Tags */}
            <div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 6 }}>🏷️ 话题标签</div>
              <div style={{
                display: 'flex', alignItems: 'center', gap: 6, padding: '8px 12px',
                background: 'var(--bg-tertiary)', border: '1px solid var(--border-color)',
                borderRadius: 6, flexWrap: 'wrap', minHeight: 38,
              }}>
                {tags.map(tag => (
                  <span key={tag} style={{
                    display: 'flex', alignItems: 'center', gap: 4, padding: '3px 8px',
                    background: 'var(--accent)', color: '#fff', borderRadius: 12, fontSize: 11,
                  }}>
                    # {tag}
                    <span onClick={() => removeTag(tag)} style={{ cursor: 'pointer', opacity: 0.7, fontSize: 14, lineHeight: 1 }}>×</span>
                  </span>
                ))}
                <input
                  value={tagInput}
                  onChange={e => setTagInput(e.target.value)}
                  onKeyDown={handleTagKeyDown}
                  placeholder="输入标签按 Enter 添加..."
                  style={{
                    border: 'none', background: 'transparent', color: 'var(--text-primary)',
                    fontSize: 12, outline: 'none', flex: 1, minWidth: 80, fontFamily: 'inherit',
                  }}
                />
              </div>
            </div>

            {/* AI Toolbar */}
            <div style={{ display: 'flex', gap: 8, flexShrink: 0, flexWrap: 'wrap' }}>
              <button onClick={handleGenerateAll} disabled={!!loading} style={aiBtnStyle(true)}>
                {loading === 'all' ? <Spinner /> : <Sparkles size={14} />}
                一键生成完整笔记
              </button>
              <button onClick={handleGenerateTitles} disabled={!!loading} style={aiBtnStyle()}>
                📌 生成标题
              </button>
              <button onClick={handleGenerateContent} disabled={!!loading} style={aiBtnStyle()}>
                📝 扩写/润色
              </button>
              <button onClick={handleGenerateTags} disabled={!!loading} style={aiBtnStyle()}>
                🏷️ 推荐标签
              </button>
              <button onClick={() => setActiveTab('cover')} style={aiBtnStyle()}>
                🎨 生成封面
              </button>
            </div>
          </div>
        ) : (
          /* Cover Tab */
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16, padding: 40 }}>
            <div style={{ fontSize: 48 }}>🎨</div>
            <h3 style={{ fontSize: 15, color: 'var(--text-primary)', margin: 0 }}>封面图自动生成</h3>
            <p style={{ fontSize: 12, color: 'var(--text-secondary)', textAlign: 'center', maxWidth: 360, lineHeight: 1.6 }}>
              基于笔记内容，AI 自动生成 3:4 小红书封面图。<br />
              家装类封面推荐风格：改造前后对比、完工实拍、设计效果图
            </p>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
              {COVER_STYLES.map(s => (
                <button key={s} onClick={() => toast(`已选：${s}`)} style={aiBtnStyle()}>{s}</button>
              ))}
            </div>
            <button onClick={() => { toast('封面图生成功能开发中，将通过文生图生成') }} style={aiBtnStyle(true)}>
              <Sparkles size={14} /> 生成封面图
            </button>
          </div>
        )}

        {/* Bottom Actions Bar */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10, padding: '12px 20px',
          borderTop: '1px solid var(--border-color)', flexShrink: 0, background: 'var(--bg-secondary)',
        }}>
          <span style={{ fontSize: 11, color: 'var(--text-muted)', flex: 1 }}>
            💡 生成笔记后，可复制到剪贴板或发布到小红书创作者中心
          </span>
          <button onClick={handleCopyAll} style={aiBtnStyle()}>
            <Copy size={14} /> 复制全部
          </button>
          <button onClick={handlePublish} style={{
            ...aiBtnStyle(),
            background: '#ff4757', color: '#fff', borderColor: '#ff4757', fontWeight: 600,
          }}>
            <Send size={14} /> 发布到小红书
          </button>
        </div>
      </div>

      {/* ===== Right: Preview ===== */}
      <div style={{
        width: 390, minWidth: 390, background: '#f5f5f5',
        display: 'flex', flexDirection: 'column', overflow: 'hidden', flexShrink: 0,
      }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8, padding: '10px 16px',
          borderBottom: '1px solid rgba(0,0,0,0.08)', flexShrink: 0, background: '#fff',
        }}>
          <span style={{ fontSize: 12, color: '#666', fontWeight: 500, flex: 1 }}>📱 小红书预览</span>
          <button onClick={() => setPreviewMode('feed')} style={{
            padding: '4px 10px', borderRadius: 4, fontSize: 10, cursor: 'pointer', fontFamily: 'inherit',
            border: '1px solid #e0e0e0', background: previewMode === 'feed' ? '#ff4757' : 'transparent',
            color: previewMode === 'feed' ? '#fff' : '#999',
          }}>信息流</button>
          <button onClick={() => setPreviewMode('detail')} style={{
            padding: '4px 10px', borderRadius: 4, fontSize: 10, cursor: 'pointer', fontFamily: 'inherit',
            border: '1px solid #e0e0e0', background: previewMode === 'detail' ? '#ff4757' : 'transparent',
            color: previewMode === 'detail' ? '#fff' : '#999',
          }}>详情页</button>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', fontFamily: '-apple-system, BlinkMacSystemFont, "PingFang SC", sans-serif' }}>
          {previewMode === 'feed' ? (
            <div style={{ background: '#fff', minHeight: '100%', color: '#333' }}>
              {/* XHS Status Bar */}
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 16px 4px', fontSize: 11, color: '#666' }}>
                <span>9:41</span><span>📶 🔋 91%</span>
              </div>
              {/* XHS Header */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 12px' }}>
                <div style={{ flex: 1, padding: '7px 12px', background: '#f5f5f5', borderRadius: 20, fontSize: 12, color: '#999' }}>🔍 搜索小红书</div>
                <span style={{ fontSize: 16 }}>🔔 💬</span>
              </div>
              {/* Feed Tabs */}
              <div style={{ display: 'flex', padding: '0 12px', borderBottom: '1px solid #f0f0f0' }}>
                {['关注', '发现', '附近'].map((tab, i) => (
                  <button key={tab} style={{
                    padding: '8px 14px', fontSize: 13, cursor: 'pointer',
                    background: 'none', border: 'none', fontFamily: 'inherit',
                    color: i === 1 ? '#333' : '#999', fontWeight: i === 1 ? 600 : 400,
                    borderBottom: i === 1 ? '2px solid #ff4757' : '2px solid transparent',
                  }}>{tab}</button>
                ))}
              </div>

              {/* Note Card */}
              <div style={{ paddingBottom: 12, borderBottom: '8px solid #f5f5f5' }}>
                <div style={{
                  width: '100%', aspectRatio: '3/4', position: 'relative', overflow: 'hidden',
                  background: 'linear-gradient(135deg, #f5af19 0%, #f12711 50%, #f5af19 100%)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <div style={{ textAlign: 'center', color: '#fff' }}>
                    <div style={{ fontSize: 44 }}>🏠</div>
                    <div style={{ fontSize: 12, opacity: 0.9 }}>点击「生成封面」添加封面图</div>
                  </div>
                  <span style={{
                    position: 'absolute', top: 12, left: 12, background: 'rgba(0,0,0,0.5)',
                    color: '#fff', fontSize: 10, padding: '3px 8px', borderRadius: 12,
                  }}>封面 3:4</span>
                </div>
                <div style={{ padding: '10px 14px 0' }}>
                  <div style={{
                    fontSize: 15, fontWeight: 700, lineHeight: 1.45,
                    display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
                    overflow: 'hidden', marginBottom: 6,
                  }}>{previewTitle}</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                    <div style={{
                      width: 22, height: 22, borderRadius: '50%',
                      background: 'linear-gradient(135deg, #ff4757, #ff6348)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      color: '#fff', fontSize: 10, fontWeight: 600,
                    }}>黄</div>
                    <span style={{ fontSize: 11, color: '#999', flex: 1 }}>黄掌柜·观弈</span>
                    <button style={{
                      padding: '3px 12px', borderRadius: 12, fontSize: 11, cursor: 'pointer',
                      background: '#ff4757', color: '#fff', border: 'none', fontFamily: 'inherit',
                    }}>+ 关注</button>
                  </div>
                  <div style={{ fontSize: 13, lineHeight: 1.75, whiteSpace: 'pre-wrap', marginBottom: 10 }}>
                    {previewContent}
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
                    {tags.map(t => (
                      <span key={t} style={{ fontSize: 11, color: '#4a6fa5', background: '#f0f4ff', padding: '3px 8px', borderRadius: 4 }}># {t}</span>
                    ))}
                    {tags.length === 0 && <span style={{ fontSize: 11, color: '#4a6fa5', background: '#f0f4ff', padding: '3px 8px', borderRadius: 4 }}># 家装设计</span>}
                  </div>
                  <div style={{ display: 'flex', gap: 6, paddingTop: 10 }}>
                    {['❤️', '💬', '⭐', '↗️'].map(icon => (
                      <button key={icon} style={{
                        flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
                        padding: '6px 0', borderRadius: 6, fontSize: 12, color: '#666',
                        background: '#f9f9f9', border: 'none', cursor: 'pointer', fontFamily: 'inherit',
                      }}>{icon}</button>
                    ))}
                  </div>
                  <div style={{ fontSize: 10, color: '#999', marginTop: 8 }}>📍 发布于 刚刚</div>
                </div>
              </div>

              {/* Feed context */}
              <div style={{ padding: '12px 14px', borderBottom: '8px solid #f5f5f5' }}>
                <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>你可能感兴趣</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  <div style={{ aspectRatio: '1', background: '#eee', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20 }}>🛋️</div>
                  <div style={{ aspectRatio: '1', background: '#eee', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20 }}>🏗️</div>
                </div>
              </div>
              <div style={{ opacity: 0.4, padding: '10px 14px' }}>
                <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>装完就后悔的5个设计，你家中了几个？</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <div style={{ width: 18, height: 18, borderRadius: '50%', background: '#eee', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9 }}>设</div>
                  <span style={{ fontSize: 10, color: '#999' }}>设计师小王</span>
                </div>
              </div>
            </div>
          ) : (
            /* Detail Mode */
            <div style={{ background: '#fff', minHeight: '100%', color: '#333' }}>
              <button onClick={() => setPreviewMode('feed')} style={{
                display: 'flex', alignItems: 'center', gap: 4, padding: '10px 14px',
                fontSize: 13, color: '#333', background: '#fff', cursor: 'pointer',
                border: 'none', fontFamily: 'inherit', width: '100%', textAlign: 'left' as const,
                position: 'sticky', top: 0, zIndex: 10,
              }}>
                <ChevronLeft size={14} /> 返回
              </button>
              <div>
                <div style={{
                  width: '100%', aspectRatio: '3/4', position: 'relative',
                  background: 'linear-gradient(135deg, #f5af19 0%, #f12711 50%, #f5af19 100%)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <div style={{ textAlign: 'center', color: '#fff' }}>
                    <div style={{ fontSize: 44 }}>🏠</div>
                    <div style={{ fontSize: 12, opacity: 0.9 }}>点击「生成封面」添加封面图</div>
                  </div>
                </div>
                <div style={{ padding: '10px 14px 0' }}>
                  <div style={{ fontSize: 15, fontWeight: 700, lineHeight: 1.45, marginBottom: 6 }}>{previewTitle}</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                    <div style={{ width: 22, height: 22, borderRadius: '50%', background: 'linear-gradient(135deg, #ff4757, #ff6348)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 10, fontWeight: 600 }}>黄</div>
                    <span style={{ fontSize: 11, color: '#999', flex: 1 }}>黄掌柜·观弈</span>
                    <button style={{ padding: '3px 12px', borderRadius: 12, fontSize: 11, background: '#ff4757', color: '#fff', border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}>+ 关注</button>
                  </div>
                  <div style={{ fontSize: 13, lineHeight: 1.75, whiteSpace: 'pre-wrap', marginBottom: 10 }}>{previewContent}</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {tags.map(t => <span key={t} style={{ fontSize: 11, color: '#4a6fa5', background: '#f0f4ff', padding: '3px 8px', borderRadius: 4 }}># {t}</span>)}
                    {tags.length === 0 && <span style={{ fontSize: 11, color: '#4a6fa5', background: '#f0f4ff', padding: '3px 8px', borderRadius: 4 }}># 家装设计</span>}
                  </div>
                  <div style={{ fontSize: 12, color: '#999', margin: '8px 0' }}>发布于 刚刚 · IP属地广东</div>
                  <div style={{ display: 'flex', gap: 6, paddingTop: 10 }}>
                    {['❤️', '💬', '⭐', '↗️'].map(icon => (
                      <button key={icon} style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4, padding: '6px 0', borderRadius: 6, fontSize: 12, color: '#666', background: '#f9f9f9', border: 'none', fontFamily: 'inherit' }}>{icon}</button>
                    ))}
                  </div>
                </div>
              </div>
              {/* Comments */}
              <div style={{ padding: 14, borderTop: '8px solid #f5f5f5' }}>
                <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 14 }}>💬 热门评论</div>
                {[
                  { name: '装修小白', text: '这个设计太美了！请问沙发在哪里买的？', time: '5分钟前' },
                  { name: '你的粉丝', text: '终于等到更新了！每次看你的笔记都有新灵感✨', time: '12分钟前' },
                ].map((c, i) => (
                  <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 14, fontSize: 12 }}>
                    <div style={{ width: 28, height: 28, borderRadius: '50%', background: '#eee', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, color: '#999', flexShrink: 0 }}>{c.name.slice(0, 1)}</div>
                    <div>
                      <div style={{ fontWeight: 600, color: '#666', marginBottom: 2 }}>{c.name}</div>
                      <div style={{ color: '#333', lineHeight: 1.5 }}>{c.text}</div>
                      <div style={{ color: '#bbb', marginTop: 2, fontSize: 10 }}>{c.time} · 回复</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ===== Publish Modal ===== */}
      {publishModalOpen && (
        <div onClick={() => setPublishModalOpen(false)} style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 100,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <div onClick={e => e.stopPropagation()} style={{
            background: 'var(--bg-secondary)', border: '1px solid var(--border-color)',
            borderRadius: 16, padding: 24, width: 520, maxWidth: '90vw',
            boxShadow: '0 16px 48px rgba(0,0,0,0.5)',
          }}>
            <h3 style={{ fontSize: 16, fontWeight: 600, margin: '0 0 16px' }}>📕 发布到小红书</h3>
            <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 16, lineHeight: 1.6 }}>
              利用软件已有的 <strong style={{ color: 'var(--text-primary)' }}>小红书聚光 WebView 多账号体系</strong>：
              自动打开创作者中心页面，填入标题、正文、标签，最后一步由你手动点击发布。
            </p>

            {[
              { title: '在已有 WebView 中打开创作者中心', desc: '复用你当前选中的小红书账号的独立 session，直接打开发布页。不用重新登录。' },
              { title: '自动填入标题 + 正文 + 标签', desc: '通过 executeJavaScript 注入，把编辑器里的内容逐一填入发布页输入框。' },
              { title: '自动上传封面图', desc: '如果你在封面设计中已生成封面图，图片会自动添加到笔记中。' },
              { title: '你确认内容无误，手动点击「发布」', desc: '软件切换焦点到 WebView，你最后检查一遍，由你本人点小红书发布按钮。', warn: true },
            ].map((step, i) => (
              <div key={i} style={{
                display: 'flex', alignItems: 'flex-start', gap: 12, padding: 12,
                background: 'var(--bg-tertiary)', borderRadius: 6, marginBottom: 8, fontSize: 12,
              }}>
                <span style={{
                  width: 26, height: 26, borderRadius: '50%', display: 'flex',
                  alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700,
                  background: step.warn ? 'var(--warning)' : 'var(--accent)',
                  color: step.warn ? '#000' : '#fff', flexShrink: 0,
                }}>{step.warn ? '👆' : i + 1}</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600, color: step.warn ? 'var(--warning)' : 'var(--text-primary)', marginBottom: 2 }}>{step.title}</div>
                  <div style={{ color: 'var(--text-muted)', fontSize: 11, lineHeight: 1.5 }}>{step.desc}</div>
                </div>
                <span style={{
                  fontSize: 11, padding: '2px 8px', borderRadius: 4, flexShrink: 0,
                  background: publishStep > i ? 'rgba(34,197,94,0.15)' : 'rgba(255,255,255,0.06)',
                  color: publishStep > i ? 'var(--success)' : 'var(--text-muted)',
                }}>{publishStep > i ? '✅ 已执行' : i === 3 ? '等你确认' : '待执行'}</span>
              </div>
            ))}

            <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
              <div style={{ flex: 1, padding: '10px 12px', background: 'rgba(34,197,94,0.08)', borderRadius: 8, border: '1px solid rgba(34,197,94,0.2)' }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--success)', marginBottom: 4 }}>✅ 这样做的好处</div>
                <div style={{ fontSize: 10, color: 'var(--text-muted)', lineHeight: 1.5 }}>
                  • 不违反小红书 ToS（发布由人操作）<br />• 利用已有登录态<br />• 发布前可最后检查
                </div>
              </div>
              <div style={{ flex: 1, padding: '10px 12px', background: 'rgba(239,68,68,0.08)', borderRadius: 8, border: '1px solid rgba(239,68,68,0.2)' }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--danger)', marginBottom: 4 }}>❌ 不会做的事</div>
                <div style={{ fontSize: 10, color: 'var(--text-muted)', lineHeight: 1.5 }}>
                  • 不会绕过你全自动发布<br />• 不会调用任何非公开 API<br />• 不会批量刷笔记
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button onClick={() => setPublishModalOpen(false)} style={{
                padding: '8px 20px', borderRadius: 6, fontSize: 12, cursor: 'pointer',
                border: '1px solid var(--border-color)', background: 'var(--bg-card)',
                color: 'var(--text-primary)', fontFamily: 'inherit',
              }}>取消</button>
              <button onClick={publishStep >= 3 ? () => { setPublishModalOpen(false); onNavigate?.('xhs_juguang') } : simulatePublishSteps} style={{
                padding: '8px 20px', borderRadius: 6, fontSize: 12, cursor: 'pointer',
                border: 'none', color: '#fff', fontFamily: 'inherit', fontWeight: 600,
                background: publishStep >= 3 ? 'var(--success)' : '#ff4757',
              }}>{publishStep === 0 ? '🚀 开始发布流程' : publishStep >= 3 ? '✅ 切换到创作者中心' : '执行中...'}</button>
            </div>
          </div>
        </div>
      )}

      {/* ===== Toast ===== */}
      {toastMsg && (
        <div style={{
          position: 'fixed', bottom: 40, left: '50%', transform: 'translateX(-50%)',
          background: 'var(--accent)', color: '#fff', padding: '10px 24px', borderRadius: 20,
          fontSize: 13, zIndex: 999, pointerEvents: 'none',
        }}>{toastMsg}</div>
      )}
    </div>
  )
}

// ---- Helpers ----
function aiBtnStyle(primary?: boolean): React.CSSProperties {
  return {
    display: 'flex', alignItems: 'center', gap: 5, padding: '7px 14px',
    borderRadius: 6, fontSize: 12, cursor: 'pointer',
    border: `1px solid ${primary ? 'var(--accent)' : 'var(--border-color)'}`,
    background: primary ? 'var(--accent)' : 'var(--bg-card)',
    color: primary ? '#fff' : 'var(--text-primary)',
    fontFamily: 'inherit', transition: 'all 0.15s', whiteSpace: 'nowrap',
  }
}

function Spinner() {
  return (
    <div style={{
      width: 14, height: 14, border: '2px solid rgba(255,255,255,0.2)',
      borderTopColor: '#fff', borderRadius: '50%',
      animation: 'spin 0.6s linear infinite',
    }} />
  )
}
