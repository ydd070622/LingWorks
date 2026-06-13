/**
 * Agent Loop — Tool-calling orchestration for the sidebar AI agent.
 *
 * Architecture (Ports & Adapters, inspired by Kun):
 *   Renderer: agent-loop.ts (Agent Loop + Tool Call orchestration)
 *     ↓ IPC
 *   Main Process: tool-handlers.ts (web_fetch, web_search execution)
 *
 * Flow:
 *   1. Send user message + history + tool definitions to LLM
 *   2. If LLM returns tool_calls → execute tools → feed results back → repeat
 *   3. When LLM returns final answer (no tool_calls) → yield text
 *   Max 5 tool-calling rounds to prevent infinite loops.
 */

import type { AgentModel, ToolCall, AgentEvent } from '../types'
import { getProviderEndpoint } from './agent'
import { searchWeb } from './search'

// ===== Agent Chat Options =====
export interface AgentChatOptions {
  tavilyApiKey?: string
  currentUrl?: string
  currentContent?: string
}

// ===== Tavily Search (one-step: search + answer + structured content) =====
async function tavilySearch(query: string, apiKey: string, signal?: AbortSignal): Promise<any> {
  const resp = await fetch('https://api.tavily.com/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      api_key: apiKey,
      query,
      search_depth: 'basic',
      include_answer: 'advanced',
      include_raw_content: false,
      max_results: 8,
      topic: 'general',
    }),
    signal,
  })
  if (!resp.ok) {
    const text = await resp.text()
    throw new Error(`Tavily API ${resp.status}: ${text.slice(0, 200)}`)
  }
  return resp.json()
}

// ===== Tool Definitions (OpenAI function-calling format) =====
const TOOL_DEFS = [
  {
    type: 'function' as const,
    function: {
      name: 'web_search',
      description:
        '搜索互联网获取最新信息。返回相关网页的标题、摘要和URL。' +
        '当需要实时信息时使用此工具，如：天气、新闻、股价、赛事比分、最新数据等。' +
        '搜索关键词应具体明确。',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: '搜索关键词，用中文或英文，尽量具体' },
        },
        required: ['query'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'web_fetch',
      description:
        '抓取指定URL的网页内容并提取纯文本。' +
        '当搜索返回了链接但需要查看页面详细内容时使用此工具。' +
        '例如：搜索找到了天气网站链接，用web_fetch打开该链接获取具体天气预报。',
      parameters: {
        type: 'object',
        properties: {
          url: { type: 'string', description: '要抓取的网页完整URL（必须以http://或https://开头）' },
          max_bytes: { type: 'number', description: '最大返回字节数，默认50000' },
        },
        required: ['url'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'file_list',
      description:
        '列出指定目录下的文件和文件夹。' +
        '当用户询问电脑里有哪些文件、目录内容、文件列表时使用。',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: '目录路径，如 C:\\Users\\Admin\\Desktop' },
        },
        required: ['path'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'file_read',
      description:
        '读取指定文件的内容。支持文本文件和常见的二进制文件。' +
        '当用户要求查看文件内容、分析文件、搜索文件内容时使用。',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: '文件完整路径' },
          max_lines: { type: 'number', description: '最多读取行数，默认全部' },
        },
        required: ['path'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'file_write',
      description:
        '写入内容到指定文件。如果文件不存在则创建，存在则覆盖。' +
        '当用户要求创建新文件、修改文件时使用。',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: '文件完整路径' },
          content: { type: 'string', description: '要写入的文件内容' },
        },
        required: ['path', 'content'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'file_edit',
      description:
        '对已有文件进行精确替换编辑。找到匹配文本并替换为新内容。' +
        '当用户要求修改文件中的特定内容时使用。',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: '文件完整路径' },
          search: { type: 'string', description: '要搜索替换的原文（必须能在文件中找到）' },
          replace: { type: 'string', description: '替换后的新内容' },
        },
        required: ['path', 'search', 'replace'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'navigate_to_page',
      description:
        '导航到应用的指定功能页面。当用户要求打开/跳转到某个页面时使用。' +
        '可用页面: home(首页), txt2img(文生图), img2img(图生图), history(生成历史), ' +
        'prompts(Prompt管理), platforms(开放平台), recharge(充值平台), dashboard(数据看板), ' +
        'settings(设置), accounts(常用账号), chatgpt(ChatGPT), github(GitHub), gemini(Gemini), ' +
        'liblib(Lib tv), runninghub(RunningHub), tapnow(TapNow)。',
      parameters: {
        type: 'object',
        properties: {
          page: { type: 'string', description: '目标页面ID' },
        },
        required: ['page'],
      },
    },
  },
]

// ===== City Detection (IP geolocation, cached) =====
let _cachedCity = ''

// Common English → Chinese city name mapping
const EN2ZH: Record<string, string> = {
  'Shenzhen': '深圳', 'Guangzhou': '广州', 'Beijing': '北京', 'Shanghai': '上海',
  'Chengdu': '成都', 'Hangzhou': '杭州', 'Wuhan': '武汉', 'Nanjing': '南京',
  'Chongqing': '重庆', 'Xi\'an': '西安', 'Tianjin': '天津', 'Suzhou': '苏州',
  'Dongguan': '东莞', 'Foshan': '佛山', 'Zhengzhou': '郑州', 'Changsha': '长沙',
  'Qingdao': '青岛', 'Dalian': '大连', 'Xiamen': '厦门', 'Hefei': '合肥',
  'Kunming': '昆明', 'Fuzhou': '福州', 'Jinan': '济南', 'Shenyang': '沈阳',
  'Harbin': '哈尔滨', 'Changchun': '长春', 'Nanning': '南宁', 'Guiyang': '贵阳',
  'Haikou': '海口', 'Lanzhou': '兰州', 'Urumqi': '乌鲁木齐', 'Lhasa': '拉萨',
  'Hong Kong': '香港', 'Kowloon': '九龙', 'Taipei': '台北', 'Kaohsiung': '高雄',
  'Macau': '澳门', 'Zhuhai': '珠海', 'Zhongshan': '中山', 'Huizhou': '惠州',
  'Jiangmen': '江门', 'Zhaoqing': '肇庆', 'Yangjiang': '阳江',
  'Singapore': '新加坡', 'Tokyo': '东京', 'Seoul': '首尔', 'Bangkok': '曼谷',
  'New York': '纽约', 'Los Angeles': '洛杉矶', 'London': '伦敦', 'Paris': '巴黎',
  'San Francisco': '旧金山', 'Chicago': '芝加哥', 'Sydney': '悉尼',
}

async function detectCity(): Promise<string> {
  if (_cachedCity) return _cachedCity

  // Try ip-api.com with Chinese language
  try {
    const resp = await fetch('http://ip-api.com/json/?lang=zh-CN&fields=city,country', { signal: AbortSignal.timeout(5000) })
    if (resp.ok) {
      const data = await resp.json()
      if (data.city) {
        _cachedCity = data.city
        return _cachedCity
      }
    }
  } catch { /* ignore */ }

  // Try ipapi.co
  try {
    const resp = await fetch('https://ipapi.co/json/', { signal: AbortSignal.timeout(5000) })
    if (resp.ok) {
      const data = await resp.json()
      const raw = data.city || ''
      // Map English name to Chinese if available
      _cachedCity = EN2ZH[raw] || raw
      if (_cachedCity) return _cachedCity
    }
  } catch { /* ignore */ }

  // Fallback: timezone-based
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone
  const tzCityMap: Record<string, string> = {
    'Asia/Shanghai': '中国大陆', 'Asia/Chongqing': '中国大陆',
    'Asia/Hong_Kong': '香港', 'Asia/Taipei': '台北',
    'Asia/Singapore': '新加坡', 'Asia/Tokyo': '东京',
    'Asia/Seoul': '首尔',
    'America/New_York': '纽约', 'America/Los_Angeles': '洛杉矶',
    'Europe/London': '伦敦', 'Europe/Paris': '巴黎',
  }
  _cachedCity = tzCityMap[tz] || ''
  return _cachedCity
}

// ===== Dynamic System Prompt (injects date, city, locale) =====
async function buildSystemPrompt(): Promise<string> {
  const now = new Date()
  const locale = navigator.language || 'zh-CN'
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Shanghai'
  const weekdays = ['日', '一', '二', '三', '四', '五', '六']
  const dateStr = `${now.getFullYear()}年${now.getMonth() + 1}月${now.getDate()}日 星期${weekdays[now.getDay()]}`
  const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`
  const city = await detectCity()

  return (
    '你是一个强大的AI助手，运行在桌面应用中，可以直接操作用户的电脑。' +
    `\n\n当前环境信息：` +
    `\n- 当前日期时间：${dateStr} ${timeStr}` +
    `\n- 用户时区：${tz}` +
    (city ? `\n- 用户所在城市：${city}` : '') +
    `\n- 系统语言：${locale}` +
    '\n\n你的工具能力：' +
    '\n- web_search / web_fetch：搜索互联网 + 抓取网页内容，用于获取实时信息（天气、新闻、数据等）' +
    '\n- file_list：列出目录下的文件和文件夹' +
    '\n- file_read：读取文件内容（支持文本文件）' +
    '\n- file_write：创建或覆盖写入文件' +
    '\n- file_edit：对文件进行精确的搜索替换编辑' +
    '\n\n使用策略：' +
    '\n1. 天气/新闻/实时数据 → 使用 web_search 搜索（搜索时带上正确的日期）。搜索结果会返回 answer 字段（直接答案）和 results 数组（结构化内容），优先使用 answer 字段' +
    '\n2. 用户问电脑文件 → 用 file_list 列出目录，用 file_read 读取内容' +
    '\n3. 用户要求创建/修改文件 → 用 file_write 或 file_edit' +
    '\n4. 在回答中引用信息来源（标注URL或网站名）' +
    '\n\n行为规范：' +
    '\n- 调用工具时直接调用，不要先输出「我来查一下」「让我搜索」之类的预备文字' +
    '\n- 回答完问题即可，不要主动询问是否需要其他帮助，除非用户明确提出后续需求' +
    '\n- 保持回复简洁精准' +
    '\n\n重要：你已经知道当前日期和用户所在城市，不要再询问用户这些信息。' +
    '\n用户的桌面路径通常是 C:\\Users\\<用户名>\\Desktop，用户文档路径通常是 C:\\Users\\<用户名>\\Documents。' +
    '\n\n请用中文回复。'
  )
}

const MAX_ROUNDS = 5

// ===== Parse SSE stream with tool_call delta support =====
interface StreamChunk {
  type: 'content' | 'tool_call_delta' | 'finish'
  content?: string
  toolCallDelta?: {
    index: number
    id?: string
    type?: string
    function?: { name?: string; arguments?: string }
  }
}

async function* parseStreamResponse(response: Response): AsyncGenerator<StreamChunk> {
  const reader = response.body?.getReader()
  if (!reader) return

  const decoder = new TextDecoder()
  let buffer = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() || ''

    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed || !trimmed.startsWith('data:')) continue
      const data = trimmed.slice(5).trim()
      if (data === '[DONE]') { yield { type: 'finish' }; return }
      try {
        const json = JSON.parse(data)
        const choice = json.choices?.[0]
        if (!choice) continue

        const delta = choice.delta
        if (delta?.content) {
          yield { type: 'content', content: delta.content }
        }
        if (delta?.tool_calls) {
          for (const tc of delta.tool_calls) {
            yield { type: 'tool_call_delta', toolCallDelta: tc }
          }
        }
      } catch {}
    }
  }
}

// ===== Execute a single tool call =====
async function executeTool(tc: ToolCall, options?: AgentChatOptions, signal?: AbortSignal): Promise<string> {
  const { name, arguments: argsStr } = tc.function
  let args: Record<string, any> = {}
  try {
    args = JSON.parse(argsStr)
  } catch {
    return JSON.stringify({ error: `工具参数解析失败: ${argsStr.slice(0, 100)}` })
  }

  switch (name) {
    case 'web_search': {
      const query = args.query
      if (!query || typeof query !== 'string') {
        return JSON.stringify({ error: 'web_search 缺少 query 参数' })
      }

      // Try Tavily first (one-step: answer + structured results)
      if (options?.tavilyApiKey) {
        try {
          const tavilyData = await tavilySearch(query, options.tavilyApiKey, signal)
          return JSON.stringify({
            answer: tavilyData.answer || '',
            count: tavilyData.results?.length || 0,
            results: (tavilyData.results || []).map((r: any) => ({
              title: r.title,
              url: r.url,
              content: r.content?.slice(0, 3000),
              score: r.score,
            })),
          }, null, 2)
        } catch (e: any) {
          console.warn('[web_search] Tavily failed, falling back to DDG:', e.message)
        }
      }

      // Fallback to DDG
      try {
        const results = await searchWeb(query)
        if (results.length === 0) {
          return JSON.stringify({ message: '搜索未返回结果，请尝试更换关键词', results: [] })
        }
        return JSON.stringify({ count: results.length, results }, null, 2)
      } catch (e: any) {
        return JSON.stringify({ error: `搜索失败: ${e.message}` })
      }
    }

    case 'web_fetch': {
      const url = args.url
      if (!url || typeof url !== 'string') {
        return JSON.stringify({ error: 'web_fetch 缺少 url 参数' })
      }
      if (window.electronAPI?.webFetch) {
        try {
          const result = await window.electronAPI.webFetch(url, args.max_bytes || 50000)
          return JSON.stringify(result, null, 2)
        } catch (e: any) {
          return JSON.stringify({ error: `抓取失败: ${e.message}`, url })
        }
      }
      return JSON.stringify({ error: 'web_fetch 不可用（非 Electron 环境）', url })
    }

    case 'file_list': {
      const path = args.path
      if (!path || typeof path !== 'string') {
        return JSON.stringify({ error: 'file_list 缺少 path 参数' })
      }
      if (window.electronAPI?.fileList) {
        try {
          const result = await window.electronAPI.fileList(path)
          return JSON.stringify(result, null, 2)
        } catch (e: any) {
          return JSON.stringify({ error: `列出目录失败: ${e.message}`, path })
        }
      }
      return JSON.stringify({ error: 'file_list 不可用', path })
    }

    case 'file_read': {
      const path = args.path
      if (!path || typeof path !== 'string') {
        return JSON.stringify({ error: 'file_read 缺少 path 参数' })
      }
      if (window.electronAPI?.fileRead) {
        try {
          const result = await window.electronAPI.fileRead(path, args.max_lines)
          return JSON.stringify(result, null, 2)
        } catch (e: any) {
          return JSON.stringify({ error: `读取文件失败: ${e.message}`, path })
        }
      }
      return JSON.stringify({ error: 'file_read 不可用', path })
    }

    case 'file_write': {
      const path = args.path
      const content = args.content
      if (!path || typeof path !== 'string') {
        return JSON.stringify({ error: 'file_write 缺少 path 参数' })
      }
      if (typeof content !== 'string') {
        return JSON.stringify({ error: 'file_write 缺少 content 参数' })
      }
      if (window.electronAPI?.fileWrite) {
        try {
          const result = await window.electronAPI.fileWrite(path, content)
          return JSON.stringify(result, null, 2)
        } catch (e: any) {
          return JSON.stringify({ error: `写入文件失败: ${e.message}`, path })
        }
      }
      return JSON.stringify({ error: 'file_write 不可用', path })
    }

    case 'file_edit': {
      const path = args.path
      const search = args.search
      const replace = args.replace
      if (!path || typeof path !== 'string') {
        return JSON.stringify({ error: 'file_edit 缺少 path 参数' })
      }
      if (typeof search !== 'string' || typeof replace !== 'string') {
        return JSON.stringify({ error: 'file_edit 缺少 search/replace 参数' })
      }
      if (window.electronAPI?.fileEdit) {
        try {
          const result = await window.electronAPI.fileEdit(path, search, replace)
          return JSON.stringify(result, null, 2)
        } catch (e: any) {
          return JSON.stringify({ error: `编辑文件失败: ${e.message}`, path })
        }
      }
      return JSON.stringify({ error: 'file_edit 不可用', path })
    }

    case 'navigate_to_page': {
      const page = args.page
      if (!page || typeof page !== 'string') {
        return JSON.stringify({ error: 'navigate_to_page 缺少 page 参数' })
      }
      return JSON.stringify({ success: true, message: `已导航到页面: ${page}`, page })
    }

    default:
      return JSON.stringify({ error: `未知工具: ${name}` })
  }
}

// ===== Main Agent Chat Generator =====
export async function* agentChat(
  model: AgentModel,
  messages: Array<{ role: string; content: string }>,
  enableTools: boolean,
  signal?: AbortSignal,
  options?: AgentChatOptions,
): AsyncGenerator<AgentEvent> {
  const tools = enableTools ? TOOL_DEFS : undefined

  // Build full message list with system prompt (if tools enabled)
  const history: Array<{ role: string; content: string | null; tool_calls?: any[]; tool_call_id?: string }> = []
  if (enableTools) {
    let systemPrompt = await buildSystemPrompt()
    if (options?.currentUrl) {
      if (options?.currentContent) {
        // Page content already extracted from webview DOM — use it directly
        systemPrompt += `\n\n用户当前正在浏览的网页: ${options.currentUrl}\n\n该页面的文本内容（已从浏览器渲染后的DOM中提取）:\n${options.currentContent}\n\n请基于以上页面内容直接分析和回答用户的问题。如果页面内容不足以回答，再考虑使用 web_fetch 或 web_search 补充信息。`
      } else {
        // No pre-extracted content — fall back to web_fetch
        systemPrompt += `\n\n用户当前正在浏览的网页: ${options.currentUrl}\n如果用户的提问与该页面内容相关，请主动使用 web_fetch 抓取该URL内容进行分析和回答。`
      }
    }
    history.push({ role: 'system', content: systemPrompt })
  }
  for (const m of messages) {
    history.push({ role: m.role, content: m.content })
  }

  yield { type: 'thinking' }

  for (let round = 0; round < MAX_ROUNDS; round++) {
    const endpoint = getProviderEndpoint(model.providerId)
    if (!endpoint) {
      yield { type: 'error', message: '未找到该提供商的 API 端点' }
      yield { type: 'done' }
      return
    }

    const body: Record<string, any> = {
      model: model.modelName,
      messages: history,
      stream: true,
      max_tokens: 4096,
      temperature: 0.7,
    }
    if (tools) {
      body.tools = tools
      body.tool_choice = 'auto'
    }

    // Send streaming request
    let response: Response
    try {
      response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${model.apiKey}`,
        },
        body: JSON.stringify(body),
        signal,
      })
    } catch (e: any) {
      yield { type: 'error', message: e.message }
      yield { type: 'done' }
      return
    }

    if (!response.ok) {
      const text = await response.text()
      let msg = `API 错误 (${response.status})`
      try {
        const e = JSON.parse(text)
        msg = e.error?.message || e.message || msg
      } catch {}
      yield { type: 'error', message: msg }
      yield { type: 'done' }
      return
    }

    // Parse SSE stream: stream content in real-time, revoke if tool_calls appear
    let fullContent = ''
    let hasToolCalls = false
    let streamedText = false
    const tcAcc: Map<number, {
      id?: string; type?: string; function: { name?: string; arguments: string }
    }> = new Map()

    try {
      for await (const chunk of parseStreamResponse(response)) {
        if (chunk.type === 'content') {
          fullContent += chunk.content!
          if (!hasToolCalls) {
            yield { type: 'text_chunk', content: chunk.content! }
            streamedText = true
          }
        } else if (chunk.type === 'tool_call_delta') {
          if (!hasToolCalls) {
            hasToolCalls = true
            // Revoke any streamed thinking text
            if (streamedText) {
              yield { type: 'text_revoke' }
            }
          }
          const tc = chunk.toolCallDelta!
          const existing = tcAcc.get(tc.index) || { function: { arguments: '' } }
          if (tc.id) existing.id = tc.id
          if (tc.type) existing.type = tc.type
          if (tc.function?.name) existing.function!.name = tc.function.name
          if (tc.function?.arguments) existing.function!.arguments += tc.function.arguments
          tcAcc.set(tc.index, existing)
        }
      }
    } catch (e: any) {
      if (e.name === 'AbortError') throw e
      yield { type: 'error', message: e.message }
      yield { type: 'done' }
      return
    }

    if (hasToolCalls) {
      // Build tool calls from accumulated deltas
      const toolCalls: ToolCall[] = [...tcAcc.entries()]
        .sort(([a], [b]) => a - b)
        .map(([_, tc]) => ({
          id: tc.id || '',
          type: 'function' as const,
          function: {
            name: tc.function?.name || '',
            arguments: tc.function?.arguments || '',
          },
        }))

      // Yield tool_call events
      for (const tc of toolCalls) {
        yield { type: 'tool_call', toolCall: tc }
      }

      // Add assistant message (with tool_calls) to history
      history.push({
        role: 'assistant',
        content: fullContent || null,
        tool_calls: toolCalls,
      })

      // Execute tools and add results
      for (const tc of toolCalls) {
        let result: string
        try {
          result = await executeTool(tc, options, signal)
        } catch (e: any) {
          result = JSON.stringify({ error: `工具执行失败: ${e.message}` })
        }
        yield { type: 'tool_result', toolCallId: tc.id, toolName: tc.function.name, result }

        // For navigate_to_page, also yield intent event to trigger UI navigation
        if (tc.function.name === 'navigate_to_page') {
          let args: Record<string, any> = {}
          try { args = JSON.parse(tc.function.arguments) } catch {}
          if (args.page) {
            yield { type: 'intent', action: 'navigate', page: String(args.page) }
          }
        }

        // Truncate very long results to save tokens
        const truncated = result.length > 15000 ? result.slice(0, 15000) + '\n...(结果已截断)' : result
        history.push({
          role: 'tool',
          tool_call_id: tc.id,
          content: truncated,
        })
      }

      // Continue to next round
      continue
    }

    // No tool calls → text was streamed in real-time, just finalize
    yield { type: 'text_end' }

    if (!fullContent) {
      yield { type: 'text_chunk', content: '(模型未返回内容)' }
      yield { type: 'text_end' }
    }

    break
  }

  yield { type: 'done' }
}
