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
import { getProviderEndpoint, AGENT_PROVIDERS } from './agent'
import { searchWeb } from './search'

// ===== Agent Chat Options =====

function getProviderShortName(providerId: string): string {
  const p = AGENT_PROVIDERS.find(pr => pr.id === providerId)
  return p ? p.name.split(' ')[0] : providerId
}
export interface AgentChatOptions {
  tavilyApiKey?: string
  currentUrl?: string
  currentContent?: string
  currentPage?: string
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
  {
    type: 'function' as const,
    function: {
      name: 'query_deepseek_usage',
      description:
        '查询 DeepSeek 账户余额和用量数据。当用户询问 DeepSeek 余额、Token 消耗、费用、用量统计时使用。' +
        '返回：账户余额、指定日期范围内的每日明细（flashTokens/proTokens/totalTokens/totalCost）、模型级汇总。' +
        '当用户问"今天/昨天/上周/本月/上月/某天"时，自动计算并传入对应的 start_date 和 end_date（YYYY-MM-DD格式）。',
      parameters: {
        type: 'object',
        properties: {
          start_date: { type: 'string', description: '查询起始日期，格式 YYYY-MM-DD。用户说"上周"时计算上周一到上周日；"本月"用本月1号到今天；"上月"用上月1号到上月最后一天。不传则默认查询最近7天' },
          end_date: { type: 'string', description: '查询结束日期，格式 YYYY-MM-DD。不传则默认今天' },
        },
        required: [],
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

  // 1. User override from settings (highest priority, VPN-proof)
  try {
    if (window.electronAPI?.getStore) {
      // 优先读取新的组合城市（省,市,区），回退读旧格式
      const combined = await window.electronAPI.getStore('preferredCityCombined')
      const preferred = await window.electronAPI.getStore('preferredCity')
      const cityName = (typeof combined === 'string' && combined.trim()) ? combined.trim() : (typeof preferred === 'string' && preferred.trim()) ? preferred.trim() : ''
      if (cityName) {
        _cachedCity = cityName
        return _cachedCity
      }
    }
  } catch { /* ignore */ }

  // 2. Try ip-api.com with Chinese language
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
async function buildSystemPrompt(modelName?: string, providerName?: string): Promise<string> {
  const now = new Date()
  const locale = navigator.language || 'zh-CN'
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Shanghai'
  const weekdays = ['日', '一', '二', '三', '四', '五', '六']
  const dateStr = `${now.getFullYear()}年${now.getMonth() + 1}月${now.getDate()}日 星期${weekdays[now.getDay()]}`
  const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`
  const city = await detectCity()

  return (
    '你是一个强大的AI助手，运行在桌面应用中，可以直接操作用户的电脑。' +
    (modelName ? `\n\n你是由 ${providerName || 'AI服务商'} 提供的 **${modelName}** 模型。当用户询问"你是什么模型"、"用的什么大模型"等问题时，直接回答你正在使用的模型名称。` : '') +
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
    '\n- navigate_to_page：导航到应用内的指定页面' +
    '\n- query_deepseek_usage：查询 DeepSeek 账户余额、Token 用量、费用数据（用户问 DeepSeek 余额/用量/费用时优先使用此工具直接回答，不要让用户自己去查看）' +
    '\n\n使用策略：' +
    '\n1. 天气/新闻/实时数据 → 使用 web_search 搜索（搜索时带上正确的日期）。搜索结果会返回 answer 字段（直接答案）和 results 数组（结构化内容），优先使用 answer 字段' +
    '\n2. 用户问电脑文件 → 用 file_list 列出目录，用 file_read 读取内容' +
    '\n3. 用户要求创建/修改文件 → 用 file_write 或 file_edit' +
    '\n4. 用户问 DeepSeek 余额/用量/Token/费用 → 只需调用 query_deepseek_usage 工具（会自动跳转到 dashboard），然后基于返回的数据用自然语言输出完整回答（余额、各模型Token、每日费用明细）' +
    '\n5. 在回答中自然引用信息来源（如"据XX网站消息……"），直接融入正文流中。**禁止用 > 块引用或单独的来源列表格式**' +
    '\n\n行为规范：' +
    '\n- ⚠️ 重要：当需要同时使用多个工具时，先连续调用所有工具（不要中间输出文字），全部工具返回结果后再一次性输出完整回答。否则工具调用前的文字会被撤销' +
    '\n- 调用工具时直接调用，不要先输出「我来查一下」「让我搜索」之类的预备文字' +
    '\n- 回答完问题即可，不要主动询问是否需要其他帮助，除非用户明确提出后续需求' +
    '\n- 保持回复简洁精准' +
    '\n\n文生图提示词输出格式（严格遵守）：' +
    '\n- 当用户要求"生成/写/优化/要一个文生图提示词"时（例如"帮我写一个小女孩的提示词"、"优化这个提示词给我"），必须使用以下特殊格式' +
    '\n- **绝对禁止**输出任何开场白或前缀文字。包括但不限于："好的"、"以下是"、"这是一个"、"帮你优化了"。回复的第一行必须是 **正向 Prompt：**' +
    '\n- 正向提示词必须以独占一行的 **正向 Prompt：** 开头，紧接着独占一行的 > 开头紧跟提示词英文内容（完整的句子，可多行但都用 > 开头）' +
    '\n- 负向提示词必须以独占一行的 **负向 Prompt（推荐）：** 开头，紧接着独占一行的 > 开头紧跟负面提示词内容' +
    '\n- 格式示例（正向和负向之间必须有一个空行分隔，这是唯一正确的格式）：' +
    '\n  **正向 Prompt：**' +
    '\n  > A cute 5-year-old girl running joyfully on a sunny sandy beach, golden sunlight, soft ocean waves, cinematic lighting, photorealistic, 8K' +
    '\n' +
    '\n  **负向 Prompt（推荐）：**' +
    '\n  > worst quality, low quality, blurry, distorted face, bad anatomy, watermarks, text' +
    '\n- 严格按照此格式输出，多一个空行少一个空行都不行' +
    '\n\n重要区分——以下情况禁止使用上述卡片格式：' +
    '\n- 用户让你"优化提示词"、"改写这段 prompt"、"帮我优化这个需求描述"时，这只是文本润色任务，不是生成文生图提示词' +
    '\n- 此类请求只需输出优化后的纯文本，不要任何开场白、前缀或说明文字（如"以下是"、"帮你优化了"、"优化后的版本："等），第一行直接就是正文' +
    '\n- 更不要把用户原本要问另一个 AI 的问题自己也回答一遍——你只做优化，不做执行' +
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

    case 'query_deepseek_usage': {
      // Read stored credentials from electron store
      const api = window.electronAPI
      if (!api) return JSON.stringify({ error: 'query_deepseek_usage 仅可在桌面环境中使用' })

      const [customModels, platformToken] = await Promise.all([
        api.getStore('customModels') as Promise<any>,
        api.getStore('dsPlatformToken') as Promise<any>,
      ])

      // Extract DeepSeek API key from customModels
      let apiKey = ''
      if (Array.isArray(customModels)) {
        const ds = customModels.find((m: any) => m.name?.toLowerCase().includes('deepseek') || m.modelName?.toLowerCase().includes('deepseek'))
        if (ds?.apiKey) apiKey = ds.apiKey
      }
      const ptToken = typeof platformToken === 'string' ? platformToken : ''

      const result: Record<string, any> = {}

      // 1. Fetch balance (needs apiKey)
      if (apiKey) {
        try {
          const res = await fetch('https://api.deepseek.com/user/balance', {
            headers: { Authorization: `Bearer ${apiKey}` },
            signal: AbortSignal.timeout(10000),
          })
          if (res.ok) {
            const data = await res.json()
            const infos = data.balance_infos || []
            let total = 0, topped = 0
            for (const i of infos) { total += +i.total_balance; topped += +i.topped_up_balance }
            result.balance = {
              currency: infos[0]?.currency || 'CNY',
              totalBalance: +total.toFixed(2),
              toppedUpBalance: +topped.toFixed(2),
              isAvailable: data.is_available ?? total > 0,
            }
          } else {
            result.balanceError = `余额查询失败 (${res.status})`
          }
        } catch (e: any) {
          result.balanceError = `余额查询失败: ${e.message}`
        }
      } else {
        result.balanceError = '未配置 DeepSeek API Key，请在数据看板设置中配置'
      }

      // 2. Fetch monthly usage (needs platformToken)
      if (ptToken) {
        const fetchUsageMonth = async (m: number, y: number) => {
          const h: Record<string, string> = {
            Authorization: `Bearer ${ptToken}`,
            'x-app-version': '1.0.0', Accept: '*/*',
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          }
          const [am, co] = await Promise.all([
            fetch(`https://platform.deepseek.com/api/v0/usage/amount?month=${m}&year=${y}`, { headers: h, signal: AbortSignal.timeout(10000) }),
            fetch(`https://platform.deepseek.com/api/v0/usage/cost?month=${m}&year=${y}`, { headers: h, signal: AbortSignal.timeout(10000) }),
          ])
          if (!am.ok || !co.ok) return null
          return { am: await am.json(), co: await co.json() }
        }

        try {
          const now = new Date()
          const startDate = typeof args.start_date === 'string' ? args.start_date : new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6).toISOString().slice(0, 10)
          const endDate = typeof args.end_date === 'string' ? args.end_date : now.toISOString().slice(0, 10)

          // Determine which months to fetch
          const sd = new Date(startDate)
          const ed = new Date(endDate)
          const allDaily: any[] = []
          const allModels: Record<string, any> = {}
          let monthCost = 0

          for (let d = new Date(sd.getFullYear(), sd.getMonth(), 1); d <= ed; d.setMonth(d.getMonth() + 1)) {
            const m = d.getMonth() + 1, y = d.getFullYear()
            const data = await fetchUsageMonth(m, y)
            if (!data) continue

            const { am, co } = data
            const costTotal = co?.data?.biz_data?.[0]
            const costByDate: Record<string, number> = {}
            if (costTotal) {
              for (const day of (costTotal.days || [])) {
                costByDate[day.date] = (day.data || []).reduce((s: number, md: any) => s + (md.usage || []).filter((e: any) => e.type !== 'REQUEST').reduce((ss: number, ee: any) => ss + (+ee.amount || 0), 0), 0)
                monthCost += costByDate[day.date]
              }
            }

            for (const mu of (am?.data?.biz_data?.total || [])) {
              const ml = (mu.model || '').toLowerCase()
              if (!ml.includes('flash') && !ml.includes('pro')) continue
              let totalTokens = 0, requestCount = 0, cacheHit = 0, cacheMiss = 0, responseTokens = 0
              for (const e of (mu.usage || [])) {
                const v = Math.round(+e.amount || 0)
                switch (e.type) {
                  case 'REQUEST': requestCount = v; break
                  case 'PROMPT_CACHE_HIT_TOKEN': cacheHit = v; totalTokens += v; break
                  case 'PROMPT_CACHE_MISS_TOKEN': cacheMiss = v; totalTokens += v; break
                  case 'RESPONSE_TOKEN': responseTokens = v; totalTokens += v; break
                  case 'PROMPT_TOKEN': totalTokens += v; break
                }
              }
              const key = ml.includes('flash') ? 'V4 Flash' : 'V4 Pro'
              if (!allModels[key]) allModels[key] = { totalTokens: 0, requestCount: 0, cacheHitTokens: 0, cacheMissTokens: 0, responseTokens: 0, cost: 0 }
              allModels[key].totalTokens += totalTokens
              allModels[key].requestCount += requestCount
              allModels[key].cacheHitTokens += cacheHit
              allModels[key].cacheMissTokens += cacheMiss
              allModels[key].responseTokens += responseTokens
            }

            // Cost per model
            if (costTotal) {
              for (const cm of (costTotal.total || [])) {
                const mc = (cm.usage || []).filter((e: any) => e.type !== 'REQUEST').reduce((s: number, e: any) => s + (+e.amount || 0), 0)
                const cml = (cm.model || '').toLowerCase()
                const key = cml.includes('flash') ? 'V4 Flash' : cml.includes('pro') ? 'V4 Pro' : null
                if (key && allModels[key]) allModels[key].cost += mc
              }
            }

            // Per-day data
            const daysByDate: Record<string, { flashTokens: number; proTokens: number; totalTokens: number; totalCost: number }> = {}
            for (const day of (am?.data?.biz_data?.days || [])) {
              let flash = 0, pro = 0, total = 0
              for (const mu of (day.data || [])) {
                let tokens = 0
                for (const e of (mu.usage || [])) {
                  if (['PROMPT_CACHE_HIT_TOKEN', 'PROMPT_CACHE_MISS_TOKEN', 'RESPONSE_TOKEN', 'PROMPT_TOKEN'].includes(e.type)) tokens += Math.round(parseFloat(e.amount) || 0)
                }
                total += tokens
                const ml2 = (mu.model || '').toLowerCase()
                if (ml2.includes('flash')) flash += tokens
                else if (ml2.includes('pro')) pro += tokens
              }
              daysByDate[day.date] = { flashTokens: flash, proTokens: pro, totalTokens: total, totalCost: costByDate[day.date] || 0 }
            }

            for (const [date, dd] of Object.entries(daysByDate)) {
              if (date >= startDate && date <= endDate) allDaily.push({ date, ...dd })
            }
          }

          allDaily.sort((a, b) => a.date.localeCompare(b.date))
          const todayStr = now.toISOString().slice(0, 10)

          result.usage = {
            startDate, endDate,
            monthCost: +monthCost.toFixed(2),
            today: allDaily.find(d => d.date === todayStr) || null,
            models: allModels,
            dailyBreakdown: allDaily,
          }
        } catch (e: any) {
          result.usageError = `用量查询失败: ${e.message}`
        }
      } else {
        result.usageError = '未配置用量 Token，请在数据看板设置中登录 DeepSeek 平台获取'
      }

      return JSON.stringify({ ...result, __autoNavigate: 'dashboard' }, null, 2)
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
    let systemPrompt = await buildSystemPrompt(model.modelName, getProviderShortName(model.providerId))
    if (options?.currentUrl) {
      if (options?.currentContent) {
        // Page content already extracted from webview DOM — use it as primary source
        systemPrompt += `\n\n【用户刚导航到新页面，请以下方当前页面内容为准回答，不要受对话历史中之前页面讨论的影响】\n\n${options.currentContent}`
      } else {
        // No pre-extracted content — mandatory web_fetch
        systemPrompt += `\n\n【用户刚导航到新页面】当前正在浏览: ${options.currentUrl}\n\n⚠️ 该页面的文本内容暂时无法直接提取（可能正在加载中）。你必须立即使用 web_fetch 工具抓取该URL的页面内容，然后基于抓取结果回答用户问题。不要猜测、不要编造、不要提示用户提供内容——直接抓取。`
      }
    } else if (options?.currentPage) {
      // App page context (React pages, not webview)
      const pageContexts: Record<string, string> = {
        dashboard: '用户当前正在查看 **DeepSeek Monitor 数据面板**。该面板显示：账户余额（通过API Key查询DeepSeek余额）、Token用量趋势图（近7天每日Flash/Pro Token消耗）、模型用量卡片（V4 Flash和V4 Pro的Token和费用）、本月Token消耗柱状图、历史月度消费统计。如果用户询问Token消耗、余额、费用等数据，请先检查页面当前显示的数据来回答。如果页面数据不足或你需要实时查询，可以引导用户在设置中配置平台Token（用于用量查询）或API Key（用于余额查询）。\n\n重要：用户可能正在这个数据面板上看着具体数据提问，你应该基于这个上下文来回答问题，而不是跳转页面或乱猜平台。',
        txt2img: '用户当前正在 **文生图** 页面。该页面用于输入文字提示词生成AI图片。',
        img2img: '用户当前正在 **图生图** 页面。该页面用于上传参考图+提示词生成AI图片。',
        prompts: '用户当前正在 **Prompt管理** 页面。该页面用于管理和查看提示词模板。',
        platforms: '用户当前正在 **开放平台** 页面。该页面列出了各种AI开放平台的快捷入口。',
        settings: '用户当前正在 **设置** 页面。该页面用于配置应用参数、模型、快捷键等。',
        accounts: '用户当前正在 **常用账号** 页面。该页面管理常用平台账号信息。',
        recharge: '用户当前正在 **充值平台** 页面。该页面列出了各种充值平台的快捷入口。',
        history: '用户当前正在 **生成历史** 页面。该页面展示之前生成的AI图片历史记录。',
        home: '用户当前在应用 **主页**。',
      }
      const ctx = pageContexts[options.currentPage]
      if (ctx) {
        systemPrompt += `\n\n${ctx}`
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

        // Check for auto-navigate flag from tools like query_deepseek_usage
        if (tc.function.name === 'query_deepseek_usage' || result.includes('"__autoNavigate"')) {
          let navTarget = ''
          try {
            const parsed = JSON.parse(result)
            if (parsed.__autoNavigate) navTarget = String(parsed.__autoNavigate)
          } catch {}
          if (navTarget) {
            yield { type: 'intent', action: 'navigate', page: navTarget }
          }
        }

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
