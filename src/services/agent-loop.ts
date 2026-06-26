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
import type { CRMData, Customer, Note } from '../crm/types'
import { STORAGE_KEY, SOURCES } from '../crm/constants'

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

	// ===== Dynamic CRM helpers for tool descriptions =====
	const SOURCE_OPTIONS = SOURCES.map(s => `${s.id}(${s.label})`).join('、')

// ===== Tool Definitions (OpenAI function-calling format) =====
const TOOL_DEFS = [
  {
    type: 'function' as const,
    function: {
      name: 'list_drives',
      description:
        '列出电脑上所有可用的磁盘/驱动器（如 C:、D:、E:）。' +
        '在你需要搜索文件或浏览文件夹时，先调用此工具获取所有可用驱动器，' +
        '然后在每个驱动器上用 file_search 或 file_list 查找目标。' +
        '当用户问"在我的电脑上找..."而你不知道从哪里搜起时，先调用此工具。',
      parameters: {
        type: 'object',
        properties: {},
        required: [],
      },
    },
  },
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
      name: 'file_rename',
      description:
        '重命名或移动文件/文件夹到新路径。' +
        '当用户要求改名、重命名、移动文件时使用此工具。' +
        '需要提供原始路径和新路径（包含完整目录和文件名）。',
      parameters: {
        type: 'object',
        properties: {
          old_path: { type: 'string', description: '原始文件/文件夹的完整路径' },
          new_path: { type: 'string', description: '新的完整路径（包含目标目录和新文件名）' },
        },
        required: ['old_path', 'new_path'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'file_delete',
      description:
        '删除指定的文件或文件夹。' +
        '当用户要求删除、移除文件时使用此工具。删除文件夹会递归删除其内容。',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: '要删除的文件或文件夹的完整路径' },
        },
        required: ['path'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'file_copy',
      description:
        '复制文件或文件夹到新路径。' +
        '当用户要求复制、拷贝、备份文件时使用此工具。',
      parameters: {
        type: 'object',
        properties: {
          src_path: { type: 'string', description: '源文件/文件夹的完整路径' },
          dest_path: { type: 'string', description: '目标完整路径（包含目标目录和新文件名）' },
        },
        required: ['src_path', 'dest_path'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'file_search',
      description:
        '在指定目录下按文件名搜索文件（支持通配符 * 和 ?，递归子目录，最深5层）。' +
        '当用户要求查找文件、搜索文件名时使用此工具。' +
        '例如：搜索“*.pdf”找所有PDF，“微信*”找微信相关文件，“report*2024*”找2024年报告。',
      parameters: {
        type: 'object',
        properties: {
          dir_path: { type: 'string', description: '搜索起始目录，如 C:\\Users\\Admin\\Desktop' },
          pattern: { type: 'string', description: '文件名匹配模式，支持 * 和 ? 通配符，如 *.jpg、微信*、report*' },
          max_results: { type: 'number', description: '最大返回结果数，默认50' },
        },
        required: ['dir_path', 'pattern'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'file_mkdir',
      description:
        '创建新的文件夹/目录（自动创建父目录）。' +
        '当用户要求新建文件夹、创建目录时使用此工具。',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: '要创建的文件夹完整路径' },
        },
        required: ['path'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'file_info',
      description:
        '获取文件/文件夹的详细信息，包括大小、创建时间、修改时间、文件类型等。' +
        '当用户要求查看文件属性、文件大小、文件详情时使用此工具。',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: '文件或文件夹的完整路径' },
        },
        required: ['path'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'file_open',
      description:
        '用系统默认程序打开文件（如用浏览器打开HTML、用图片查看器打开图片、用Word打开文档）。' +
        '当用户要求打开文件、用默认程序打开时使用此工具。',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: '要打开的文件完整路径' },
        },
        required: ['path'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'file_show',
      description:
        '在文件资源管理器中定位并高亮显示文件。' +
        '当用户要求"在文件夹中显示"、"打开文件所在位置"、"定位文件"时使用此工具。',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: '要定位显示的文件完整路径' },
        },
        required: ['path'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'save_memory',
      description:
        '保存一条用户记忆到 Markdown 记忆文件中。' +
        '当用户要求"记住"、"以后记住"、"别忘了"等时使用此工具。' +
        '分类说明：profile（用户基本信息/身份/职业/公司），work（工作相关内容），preferences（偏好/习惯），' +
        'notes（通用备忘）。' +
        '\n\n⚠️ 内容格式要求：必须对用户的信息进行总结提炼，用结构化的 Markdown 列表格式输出，不要记录原始对话。' +
        '例如用户说"我是做跨境电商的，主要做亚马逊和Shopee"，应输出：' +
        '\n```' +
        '\n📋 职业档案' +
        '\n- 岗位：跨境电商运营' +
        '\n- 平台：亚马逊、Shopee' +
        '\n```' +
        '这样后续读取时才能清晰呈现。',
      parameters: {
        type: 'object',
        properties: {
          category: {
            type: 'string',
            description: '记忆分类：profile、work、preferences、notes 或自定义分类名',
            enum: ['profile', 'work', 'preferences', 'notes'],
          },
          content: { type: 'string', description: '总结提炼后的结构化 Markdown 记忆内容，使用列表格式，不记录原始对话' },
        },
        required: ['category', 'content'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'recall_memory',
      description:
        '回读之前保存的用户记忆（按需检索）。' +
        '你的 system prompt 里已有 profile 全文和其他分类的索引（条数+最近标题）。' +
        '当用户询问 work/preferences/notes 的具体细节时，用此工具按 keyword 检索实际内容。' +
        '例如用户问"我之前说的亚马逊备货计划"，传 keyword="亚马逊" 或 "备货" 检索。' +
        '⚠️ 不要凭索引标题猜测细节，必须调本工具拿到真实内容再回答。' +
        'profile 信息已自动加载，无需用本工具重复拉取。',
      parameters: {
        type: 'object',
        properties: {
          category: {
            type: 'string',
            description: '可选，只在指定分类中检索。不传则检索全部分类',
          },
          keyword: {
            type: 'string',
            description: '可选，关键词检索，只返回内容包含该关键词的记忆条目（大小写不敏感）。建议用用户问题中的核心词',
          },
          limit: {
            type: 'number',
            description: '每分类最多返回条数，默认20',
          },
        },
        required: [],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'delete_memory',
      description:
        '删除用户之前保存的某条记忆。' +
        '当用户要求"忘掉"、"删除记忆"、"不需要记住xxx了"时使用此工具。' +
        '需要指定分类和要删除的内容关键词。',
      parameters: {
        type: 'object',
        properties: {
          category: { type: 'string', description: '记忆所属分类' },
          search: { type: 'string', description: '要删除的记忆关键词，用于在文件中定位' },
        },
        required: ['category', 'search'],
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
  {
    type: 'function' as const,
    function: {
      name: 'crm_stats',
      description:
        '获取CRM客户管理中心的数据概览。' +
        '返回：总客户数、设有跟进日期的客户数（今天/未来/逾期）、成交总额、笔记数量。' +
        '当用户询问"CRM怎么样"、"客户情况"、"今天有什么跟进"、"成交了多少"时使用此工具。',
      parameters: {
        type: 'object',
        properties: {},
        required: [],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'crm_search_customers',
      description:
        '搜索或筛选CRM中的客户。' +
        '支持按姓名/电话搜索、按来源筛选、按笔记风格筛选、按是否有跟进日期筛选。' +
        '当用户询问"帮我查一下xx客户"、"有哪些需要跟进的客户"、"xx笔记的获客"、"xx风格笔记来了多少客户"时使用此工具。' +
        '⚠️ 用户问"需要跟进"时，务必传 hasFollowUp: true，只有设置了跟进日期的客户才算需要跟进。' +
        '⚠️ CRM中笔记和客户的关联：客户的 sourceNoteId 字段指向来源笔记的id。用户问"xx笔记的获客"时，先用 crm_search_notes 查笔记id，再用本工具传 query 搜客户。',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: '搜索关键词，按姓名或电话模糊匹配，可选' },
          source: { type: 'string', description: `筛选来源：${SOURCE_OPTIONS}` },
          hasFollowUp: { type: 'boolean', description: '是否只返回设置了跟进日期的客户。用户问"需要跟进"时传true。' },
          noteStyle: { type: 'string', description: '按来源笔记的风格筛选，如"意式极简"或"法式风格"。用户问"xx风格的笔记获客"时使用。' },
          limit: { type: 'number', description: '最多返回条数，默认10' },
        },
        required: [],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'crm_search_notes',
      description:
        '搜索CRM中的笔记/文章。' +
        '支持按标题搜索、按状态筛选、按风格筛选。返回结果包含每篇笔记带来的客户数(customerCount)和客户名单(customerNames)。' +
        '当用户询问"有哪些笔记"、"找一下xx笔记"、"xx风格的笔记"时使用此工具。' +
        '如果用户追问"这些笔记的获客/带来多少客户"，直接用返回的 customerCount 回答。',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: '搜索关键词，按标题模糊匹配，可选' },
          style: { type: 'string', description: '按笔记风格筛选，如"意式极简"或"法式风格"' },
          status: { type: 'string', description: '筛选状态：published(已发布)、draft(草稿)' },
          limit: { type: 'number', description: '最多返回条数，默认10' },
        },
        required: [],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'wechat_push',
      description:
        '推送消息到用户的微信。' +
        '当用户要求"推送到微信"、"微信通知我"、"发到微信"时使用此工具。\n\n' +
        '📋 输出格式（严格执行）：\n' +
        '1. 禁止思考过程，正文只放最终结果\n' +
        '2. 数据必须用管道符表格（每行以 | 开头、以 | 结尾、列间用 | 分隔、行间真实换行）\n' +
        '3. 表格后接"重点关注"要点\n\n' +
        '✅ 正确格式（唯一的表格写法）：\n' +
        '当前共有 2位客户 需要跟进，具体情况如下：\n\n' +
        '| 客户 | 地区 | 小区 | 面积 | 风格 | 跟进 | 下次跟进时间 | 跟进情况 |\n' +
        '|------|------|------|------|------|------|-------------|----------|\n' +
        '| 张三 | 惠州 | — | 120㎡ | 意式 | 🔴逾期2天 | 6.23 | — |\n' +
        '| 李四 | 深圳 | 万科城 | 89㎡ | 法式 | 🟡3天后 | 6.29 | 客户在香港 |\n\n' +
        '重点关注：\n' +
        '- 张三（惠州）逾期2天，尽快联系。\n\n' +
        '⚠️ 表格列顺序：客户|地区|小区|面积|风格|跟进|下次跟进时间|跟进情况\n' +
        '⚠️ 风格只写喜欢风格简称（意式极简→意式，法式风格→法式），不要带账号，无数据用"—"\n' +
        '⚠️ 下次跟进时间用 M.D 格式（6.23，7.3），不要年份\n' +
        '⚠️ 跟进情况：必须原样输出完整的 followUpNote，不要总结、不要删减、不要改写\n' +
        '⚠️ 跟进：🔴逾期X天 / 🟢今天 / 🟡X天后\n' +
        '⚠️ 每行必须 | 开头 | 结尾，否则微信上不是表格',
      parameters: {
        type: 'object',
        properties: {
          title: { type: 'string', description: '消息标题' },
          content: { type: 'string', description: '正文。表格必须每行 |开头|结尾，列间|分隔，行间真实换行。禁止思考过程' },
        },
        required: ['title', 'content'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'lark_status',
      description:
        '检测飞书CLI工具的安装和登录状态。' +
        '返回：CLI是否已安装、版本号、是否已授权登录、当前登录用户。' +
        '在执行任何飞书操作之前，如果用户是第一次使用飞书相关功能，建议先调用此工具确认状态。' +
        '如果未安装或未授权，此工具会返回具体的安装指引。',
      parameters: {
        type: 'object',
        properties: {},
        required: [],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'lark_exec',
      description:
        '执行飞书(lark) CLI命令，直接操作飞书的各项功能。' +
        '飞书CLI覆盖消息、云文档、多维表格、日历、邮箱、任务、知识库、视频会议、审批、考勤等17个业务域。\n\n' +
        '⚠️ 使用要点：\n' +
        '- 命令必须以 lark-cli 开头（如 lark-cli calendar +agenda）\n' +
        '- 快捷命令（+前缀）最省Token，优先使用。例如 lark-cli calendar +agenda 查日程\n' +
        '- 如果不知道具体命令，可以先用 lark-cli help 查看帮助，或用 lark-cli <domain> help 查看某个业务域的子命令\n' +
        '- 错误时飞书CLI会返回有帮助的错误信息和修复建议，请仔细阅读\n' +
        '- 任务执行完成后，将飞书CLI的输出结果以清晰的方式展示给用户（不要直接 dump JSON）\n\n' +
        '⚡ 常用快捷命令速查（必须严格使用以下参数名，LLM不要自己编造参数）：\n' +
        '- 📨 发消息给自己: lark-cli im +messages-send --user-id <你的open_id> --text "<内容>" --as user\n' +
        '- 📨 发Markdown消息: lark-cli im +messages-send --user-id <id> --markdown "<内容>" --as user\n' +
        '- 📨 发消息到群: lark-cli im +messages-send --chat-id oc_xxx --text "<内容>" --as bot\n' +
        '- 🔍 搜索消息: lark-cli im +messages-search --query <关键词> --as user\n' +
        '- 📅 今日日程: lark-cli calendar +agenda\n' +
        '- 📅 创建日程: lark-cli calendar events create --params \'{"summary":"标题","start_time":"...","end_time":"..."}\'\n' +
        '- 📄 创建文档: lark-cli docs +create --title "<标题>"\n' +
        '- 📊 多维表格列表: lark-cli base +list\n' +
        '- ✅ 创建任务: lark-cli task +task-create --summary "<标题>"\n' +
        '- 📧 搜索邮件: lark-cli mail +search\n' +
        '- 🎥 会议纪要: lark-cli vc +meeting-list（搜索会议）、lark-cli vc +minutes（获取纪要）\n' +
        '- 📋 审批: lark-cli approval +instance-list\n' +
        '\n⚠️ 关键：--user-id = open_id(ou_xxx)，--chat-id = 群ID(oc_xxx)。--as user 以用户身份发，--as bot 以机器人身份发。不确定参数时务必先用 lark-cli <domain> <shortcut> --help 查看正确参数名，绝对不要自己编造参数名！',
      parameters: {
        type: 'object',
        properties: {
          command: {
            type: 'string',
            description:
              '完整的 lark-cli 命令字符串。必须以 lark-cli 或 npx @larksuite/cli 开头。' +
              '例如: "lark-cli calendar +agenda"、"lark-cli im +messages-send --user-id ou_xxx --text hello --as user"、' +
              '"lark-cli docs +create --title 周报"',
          },
        },
        required: ['command'],
      },
    },
  },
]

// ===== City Detection (IP geolocation, cached) =====
let _cachedCity = ''

/** Call this when user changes city in Settings to invalidate stale cache */
export function clearCityCache(): void {
  _cachedCity = ''
}

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

  // Load user memories — layered injection:
  //   - profile: full content (high-frequency, low-volume), truncated to 2000 chars
  //   - work/preferences/notes: index only (count + latest title); details fetched on-demand via recall_memory tool
  let memoryContent = ''
  try {
    if (window.electronAPI?.memoryRecall) {
      const [profileRes, indexRes] = await Promise.all([
        window.electronAPI.memoryRecall('profile', undefined, undefined, 'full'),
        window.electronAPI.memoryRecall(undefined, undefined, undefined, 'index'),
      ])

      const parts: string[] = []

      // 1. Profile full content (truncated defensively to 2000 chars)
      if (profileRes?.mode === 'full' && Array.isArray(profileRes.entries) && profileRes.entries.length > 0) {
        const profileText = profileRes.entries
          .map(e => `${e.heading}\n${e.content}`)
          .join('\n\n')
        const truncated = profileText.length > 2000
        const profileFinal = truncated ? profileText.slice(0, 2000) + '\n...(档案内容已截断)' : profileText
        parts.push('### 用户档案（已加载，回答时直接参考，无需再调工具）\n\n' + profileFinal)
      }

      // 2. Other categories index (count + latest title)
      if (indexRes?.mode === 'index' && Array.isArray(indexRes.categories) && indexRes.categories.length > 0) {
        const otherCats = indexRes.categories.filter(c => c.category !== 'profile')
        if (otherCats.length > 0) {
          const indexLines = otherCats.map(c => {
            const titlePart = c.latestTitle ? `，最近：${c.latestDate || '未知日期'} "${c.latestTitle}"` : ''
            return `- ${c.category}: ${c.count} 条${titlePart}`
          })
          parts.push(
            '### 其他记忆索引（仅显示条数和最近标题，细节需用 recall_memory 工具按关键词检索）\n\n' +
            indexLines.join('\n') +
            '\n\n⚠️ 用户问到具体记忆细节时，必须调用 recall_memory 工具（传 keyword 做关键词检索）拉取实际内容，不要凭索引标题猜测。'
          )
        }
      }

      if (parts.length > 0) {
        memoryContent = '\n\n---\n\n## 用户记忆\n\n' + parts.join('\n\n')
      }
    }
  } catch { /* ignore memory loading errors */ }

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
    '\n- file_rename：重命名或移动文件/文件夹（用户要求改名、重命名、移动文件时使用）' +
    '\n- file_delete：删除文件或文件夹（用户要求删除时使用）' +
    '\n- file_copy：复制文件或文件夹（用户要求复制、备份时使用）' +
    '\n- file_search：按文件名搜索文件（支持 * ? 通配符，递归子目录最深5层，用户要求查找/搜索文件时使用）' +
    '\n- file_mkdir：创建新文件夹（用户要求新建文件夹/目录时使用）' +
    '\n- file_info：获取文件详细信息（大小、创建/修改时间、类型，用户要求查看文件属性时使用）' +
    '\n- file_open：用系统默认程序打开文件（用户要求打开文件时使用）' +
    '\n- file_show：在资源管理器中定位显示文件（用户要求"在文件夹中显示"、"打开所在位置"时使用）' +
    '\n- save_memory：保存用户记忆（用户要求记住某事时使用，分类：profile/个人信息，work/工作，preferences/偏好，notes/备忘）' +
    '\n- recall_memory：回读之前的记忆（用户问"我之前说过什么"时使用）' +
    '\n- delete_memory：删除某条记忆（用户要求"忘掉"时使用）' +
    '\n- navigate_to_page：导航到应用内的指定页面' +
    '\n- query_deepseek_usage：查询 DeepSeek 账户余额、Token 用量、费用数据（用户问 DeepSeek 余额/用量/费用时优先使用此工具直接回答，不要让用户自己去查看）' +
    '\n- lark_status：检测飞书CLI安装和登录状态（首次使用飞书功能前建议调用此工具确认状态）' +
    '\n- lark_exec：执行飞书CLI命令，直接操作飞书各项功能——发送/搜索消息、创建/编辑云文档、管理多维表格记录、查询/创建日程、管理任务、搜索知识库、查邮件、获取会议纪要、查询审批等。命令必须以 lark-cli 或 npx @larksuite/cli 开头。快捷命令（+前缀）最省Token，不确定命令时用 lark-cli help 或 lark-cli <业务域> help 查看帮助' +
    '\n\n使用策略：' +
    '\n1. 天气/新闻/实时数据 → 使用 web_search 搜索（搜索时带上正确的日期）。搜索结果会返回 answer 字段（直接答案）和 results 数组（结构化内容），优先使用 answer 字段' +
    '\n2. 用户问电脑文件 → 用 file_list 列出目录，用 file_read 读取内容' +
    '\n3. 用户要求创建/修改文件 → 用 file_write 或 file_edit' +
    '\n3.1 用户要求重命名/改名/移动文件 → 用 file_rename（先可用 file_list 或 file_search 确认文件存在，再用 file_rename 执行）' +
    '\n3.2 用户要求删除文件 → 用 file_delete' +
    '\n3.3 用户要求复制/备份文件 → 用 file_copy' +
    '\n3.4 用户要求查找/搜索文件 → 用 file_search（先确定搜索目录，如用户桌面 C:\\Users\\Administrator\\Desktop）' +
    '\n3.5 用户要求新建文件夹 → 用 file_mkdir' +
    '\n3.6 用户要求查看文件属性/信息 → 用 file_info' +
    '\n3.7 用户要求打开文件 → 用 file_open（系统默认程序打开）' +
    '\n3.8 用户要求查看文件位置 → 用 file_show（在资源管理器中高亮显示）' +
    '\n4. 用户要求记住/保存信息 → 用 save_memory。\n  ⚠️ 关键：保存前必须先总结提炼用户信息，用结构化 Markdown 列表格式（如"- 岗位：xxx"、"- 擅长：xxx"），不要照搬用户原话。\n  分类选择：个人信息/身份/职业→profile，工作内容/项目→work，偏好/习惯→preferences，零散备忘→notes。保存后简要确认即可' +
    '\n4.1 用户要求回顾记忆/问之前说过什么 → 用 recall_memory 工具检索。' +
    '\n  ⚠️ 重要：你的 system prompt 里已有 profile 全文 + 其他分类（work/preferences/notes）的索引（条数+最近标题）。' +
    '\n  - profile 信息（用户身份/职业/公司）已自动加载，直接使用即可，不要为 profile 调用 recall_memory。' +
    '\n  - 用户问 work/preferences/notes 的具体细节时，从用户问题提取关键词（如"亚马逊备货"→keyword="亚马逊"），调用 recall_memory 检索真实内容。' +
    '\n  - 绝对不要凭索引标题猜测细节后回答，也不要直接说"没记住"——先检索再说。' +
    '\n  - 用户说"忘掉/删掉某条记忆" → 用 delete_memory' +
    '\n5. 用户问 DeepSeek 余额/用量/Token/费用 → 只需调用 query_deepseek_usage 工具（会自动跳转到 dashboard），然后基于返回的数据用自然语言输出完整回答（余额、各模型Token、每日费用明细）' +
    '\n6. 飞书操作 → 用户要求操作飞书时，先调用 lark_status 确认CLI可用。然后构造 lark_exec 命令执行。如果CLI未安装或未授权，按返回的指引告诉用户如何安装/登录。命令执行后，将结果以清晰的文字呈现给用户（不要直接dump原始JSON）。如果操作失败，检查错误信息中的 hint/建议，引导用户修复。\n' +
    '⚠️ 飞书发消息关键规则：\n' +
    '- 发送多行/结构化内容（如CRM跟进汇总、表格、列表）→ 必须用 --markdown 而非 --text。示例: lark-cli im +messages-send --user-id ou_xxx --markdown "# 标题\\n内容...\\n- 项目1" --as user\n' +
    '- 简单一行文本才用 --text\n' +
    '- --markdown 内容中的换行用 \\\\n 转义，确保所有信息包含在一次命令调用中，不要拆分多条消息' +
    '\n7. 在回答中自然引用信息来源（如"据XX网站消息……"），直接融入正文流中。**禁止用 > 块引用或单独的来源列表格式**' +
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
    `\n\nCRM 数据输出要求：查询客户列表、笔记列表时，必须使用 Markdown 表格格式展示。表头应包含关键字段（如姓名、地区、喜欢风格、客户归属、跟进日期、跟进备注等），方便用户一目了然。` +
    '\n\n请用中文回复。' +
    memoryContent
  )
}

const MAX_ROUNDS = 10

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

// ===== Load CRM data from storage =====
async function loadCRMData(): Promise<CRMData | null> {
  try {
    if (window.electronAPI) {
      const saved = await window.electronAPI.getStore(STORAGE_KEY)
      if (saved && typeof saved === 'object' && Array.isArray(saved.customers)) {
        return saved as CRMData
      }
    } else {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (raw) {
        const parsed = JSON.parse(raw)
        if (parsed && Array.isArray(parsed.customers)) return parsed as CRMData
      }
    }
  } catch {}
  return null
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

    // ===== Helper: convert Markdown/HTML to WeChat plain-text with pipe tables =====
    function convertToWeChatText(html: string): string {
      let text = html
      // 1. Unescape JSON-escaped newlines
      text = text.replace(/\\n/g, '\n')
      // 2. <br> → newline
      text = text.replace(/<br\s*\/?>/gi, '\n')
      // 3. HTML table → pipe-separated rows
      text = text.replace(/<\/tr>/gi, '\n')
      text = text.replace(/<tr[^>]*>/gi, '')
      text = text.replace(/<\/t[dh]>/gi, ' | ')
      text = text.replace(/<t[dh][^>]*>/gi, '| ')
      // 4. Remove remaining HTML tags
      text = text.replace(/<\/?(?:thead|tbody|table|colgroup|col|th)[^>]*>/gi, '')
      text = text.replace(/<[^>]*>/g, '')
      // 5. Decode entities
      text = text.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#(\d+);/g, (_, d) => String.fromCharCode(Number(d)))
      text = text.replace(/&nbsp;/gi, ' ')
      // 6. **bold** → ■bold■
      text = text.replace(/\*\*(.+?)\*\*/g, '■$1■')
      // 7. ### → plain text
      text = text.replace(/^#{1,3}\s+/gm, '')
      // 8. Collapse 3+ newlines
      text = text.replace(/\n{3,}/g, '\n\n')

      // 9. Convert space-separated tables to pipe format; keep pipe tables as-is
      const lines = text.split('\n')
      const out: string[] = []
      let spaceBuf: string[][] = []   // accumulating space-separated table rows

      function flushSpaceBuf() {
        if (spaceBuf.length === 0) return
        // Output as pipe-separated rows
        for (const row of spaceBuf) {
          out.push('| ' + row.join(' | ') + ' |')
        }
        out.push('')
        spaceBuf = []
      }

      for (const line of lines) {
        const t = line.trim()
        // Already a pipe row → keep as-is
        if (t.includes('|')) {
          flushSpaceBuf()
          out.push(line)
          continue
        }
        // Space-separated table: 4+ columns (split by 2+ spaces)
        const cells = t.split(/[ ]{2,}/).filter(c => c.length > 0)
        if (cells.length >= 4) {
          spaceBuf.push(cells)
          continue
        }
        // End of space table (fewer columns)
        flushSpaceBuf()
        out.push(line)
      }
      flushSpaceBuf()

      text = out.join('\n')
      // 10. Trim overall
      text = text.trim()
      // 11. Limit for WeChat
      if (text.length > 2000) text = text.slice(0, 2000) + '…'
      return text
    }

    switch (name) {
    case 'list_drives': {
      if (window.electronAPI?.listDrives) {
        try {
          const result = await window.electronAPI.listDrives()
          return JSON.stringify(result, null, 2)
        } catch (e: any) {
          return JSON.stringify({ error: `列出驱动器失败: ${e.message}` })
        }
      }
      return JSON.stringify({ error: 'list_drives 不可用' })
    }

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

    case 'file_rename': {
      const oldPath = args.old_path
      const newPath = args.new_path
      if (!oldPath || typeof oldPath !== 'string') {
        return JSON.stringify({ error: 'file_rename 缺少 old_path 参数' })
      }
      if (!newPath || typeof newPath !== 'string') {
        return JSON.stringify({ error: 'file_rename 缺少 new_path 参数' })
      }
      if (window.electronAPI?.fileRename) {
        try {
          const result = await window.electronAPI.fileRename(oldPath, newPath)
          return JSON.stringify(result, null, 2)
        } catch (e: any) {
          return JSON.stringify({ error: `重命名失败: ${e.message}`, oldPath, newPath })
        }
      }
      return JSON.stringify({ error: 'file_rename 不可用', oldPath, newPath })
    }

    case 'file_delete': {
      const delPath = args.path
      if (!delPath || typeof delPath !== 'string') {
        return JSON.stringify({ error: 'file_delete 缺少 path 参数' })
      }
      if (window.electronAPI?.fileDelete) {
        try {
          const result = await window.electronAPI.fileDelete(delPath)
          return JSON.stringify(result, null, 2)
        } catch (e: any) {
          return JSON.stringify({ error: `删除失败: ${e.message}`, path: delPath })
        }
      }
      return JSON.stringify({ error: 'file_delete 不可用', path: delPath })
    }

    case 'file_copy': {
      const srcPath = args.src_path
      const destPath = args.dest_path
      if (!srcPath || typeof srcPath !== 'string') {
        return JSON.stringify({ error: 'file_copy 缺少 src_path 参数' })
      }
      if (!destPath || typeof destPath !== 'string') {
        return JSON.stringify({ error: 'file_copy 缺少 dest_path 参数' })
      }
      if (window.electronAPI?.fileCopy) {
        try {
          const result = await window.electronAPI.fileCopy(srcPath, destPath)
          return JSON.stringify(result, null, 2)
        } catch (e: any) {
          return JSON.stringify({ error: `复制失败: ${e.message}`, srcPath, destPath })
        }
      }
      return JSON.stringify({ error: 'file_copy 不可用', srcPath, destPath })
    }

    case 'file_search': {
      const dirPath = args.dir_path
      const pattern = args.pattern
      if (!dirPath || typeof dirPath !== 'string') {
        return JSON.stringify({ error: 'file_search 缺少 dir_path 参数' })
      }
      if (!pattern || typeof pattern !== 'string') {
        return JSON.stringify({ error: 'file_search 缺少 pattern 参数' })
      }
      if (window.electronAPI?.fileSearch) {
        try {
          const result = await window.electronAPI.fileSearch(dirPath, pattern, args.max_results)
          return JSON.stringify(result, null, 2)
        } catch (e: any) {
          return JSON.stringify({ error: `搜索失败: ${e.message}`, dirPath, pattern })
        }
      }
      return JSON.stringify({ error: 'file_search 不可用', dirPath, pattern })
    }

    case 'file_mkdir': {
      const mkPath = args.path
      if (!mkPath || typeof mkPath !== 'string') {
        return JSON.stringify({ error: 'file_mkdir 缺少 path 参数' })
      }
      if (window.electronAPI?.fileMkdir) {
        try {
          const result = await window.electronAPI.fileMkdir(mkPath)
          return JSON.stringify(result, null, 2)
        } catch (e: any) {
          return JSON.stringify({ error: `创建目录失败: ${e.message}`, path: mkPath })
        }
      }
      return JSON.stringify({ error: 'file_mkdir 不可用', path: mkPath })
    }

    case 'file_info': {
      const infoPath = args.path
      if (!infoPath || typeof infoPath !== 'string') {
        return JSON.stringify({ error: 'file_info 缺少 path 参数' })
      }
      if (window.electronAPI?.fileInfo) {
        try {
          const result = await window.electronAPI.fileInfo(infoPath)
          return JSON.stringify(result, null, 2)
        } catch (e: any) {
          return JSON.stringify({ error: `获取文件信息失败: ${e.message}`, path: infoPath })
        }
      }
      return JSON.stringify({ error: 'file_info 不可用', path: infoPath })
    }

    case 'file_open': {
      const openPath = args.path
      if (!openPath || typeof openPath !== 'string') {
        return JSON.stringify({ error: 'file_open 缺少 path 参数' })
      }
      if (window.electronAPI?.fileOpen) {
        try {
          const result = await window.electronAPI.fileOpen(openPath)
          return JSON.stringify(result, null, 2)
        } catch (e: any) {
          return JSON.stringify({ error: `打开文件失败: ${e.message}`, path: openPath })
        }
      }
      return JSON.stringify({ error: 'file_open 不可用', path: openPath })
    }

    case 'file_show': {
      const showPath = args.path
      if (!showPath || typeof showPath !== 'string') {
        return JSON.stringify({ error: 'file_show 缺少 path 参数' })
      }
      if (window.electronAPI?.fileShow) {
        try {
          const result = await window.electronAPI.fileShow(showPath)
          return JSON.stringify(result, null, 2)
        } catch (e: any) {
          return JSON.stringify({ error: `显示文件失败: ${e.message}`, path: showPath })
        }
      }
      return JSON.stringify({ error: 'file_show 不可用', path: showPath })
    }

    case 'save_memory': {
      const category = args.category
      const content = args.content
      if (!category || typeof category !== 'string') {
        return JSON.stringify({ error: 'save_memory 缺少 category 参数' })
      }
      if (!content || typeof content !== 'string') {
        return JSON.stringify({ error: 'save_memory 缺少 content 参数' })
      }
      if (window.electronAPI?.memorySave) {
        try {
          const result = await window.electronAPI.memorySave(category, content)
          return JSON.stringify(result, null, 2)
        } catch (e: any) {
          return JSON.stringify({ error: `保存记忆失败: ${e.message}` })
        }
      }
      return JSON.stringify({ error: 'save_memory 不可用' })
    }

    case 'recall_memory': {
      const category = typeof args.category === 'string' ? args.category : undefined
      const keyword = typeof args.keyword === 'string' ? args.keyword : undefined
      const limit = typeof args.limit === 'number' ? args.limit : undefined
      if (window.electronAPI?.memoryRecall) {
        try {
          // Tool calls always want full content, not index
          const result = await window.electronAPI.memoryRecall(category, keyword, limit, 'full')
          return JSON.stringify(result, null, 2)
        } catch (e: any) {
          return JSON.stringify({ error: `回读记忆失败: ${e.message}` })
        }
      }
      return JSON.stringify({ error: 'recall_memory 不可用' })
    }

    case 'delete_memory': {
      const category = args.category
      const search = args.search
      if (!category || typeof category !== 'string') {
        return JSON.stringify({ error: 'delete_memory 缺少 category 参数' })
      }
      if (!search || typeof search !== 'string') {
        return JSON.stringify({ error: 'delete_memory 缺少 search 参数' })
      }
      if (window.electronAPI?.memoryDelete) {
        try {
          const result = await window.electronAPI.memoryDelete(category, search)
          return JSON.stringify(result, null, 2)
        } catch (e: any) {
          return JSON.stringify({ error: `删除记忆失败: ${e.message}` })
        }
      }
      return JSON.stringify({ error: 'delete_memory 不可用' })
    }

    case 'navigate_to_page': {
      const page = args.page
      if (!page || typeof page !== 'string') {
        return JSON.stringify({ error: 'navigate_to_page 缺少 page 参数' })
      }
      return JSON.stringify({ success: true, message: `已导航到页面: ${page}`, page })
    }

    case 'query_deepseek_usage': {
      // Combine external abort signal with internal timeout
      const _abortSig = signal
        ? AbortSignal.any([signal, AbortSignal.timeout(10000)])
        : AbortSignal.timeout(10000)

      // Read stored credentials from electron store
      const api = window.electronAPI
      if (!api) return JSON.stringify({ error: 'query_deepseek_usage 仅可在桌面环境中使用' })

      const [dsApiKey, platformToken] = await Promise.all([
        api.getStore('dsApiKey') as Promise<any>,
        api.getStore('dsPlatformToken') as Promise<any>,
      ])

      // Use dedicated dsApiKey store
      const apiKey = typeof dsApiKey === 'string' ? dsApiKey : ''
      const ptToken = typeof platformToken === 'string' ? platformToken : ''

      const result: Record<string, any> = {}

      // 1. Fetch balance (needs apiKey)
      if (apiKey) {
        try {
          const res = await fetch('https://api.deepseek.com/user/balance', {
            headers: { Authorization: `Bearer ${apiKey}` },
            signal: _abortSig,
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
            fetch(`https://platform.deepseek.com/api/v0/usage/amount?month=${m}&year=${y}`, { headers: h, signal: _abortSig }),
            fetch(`https://platform.deepseek.com/api/v0/usage/cost?month=${m}&year=${y}`, { headers: h, signal: _abortSig }),
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

    case 'crm_stats': {
      const crmData = await loadCRMData()
      if (!crmData) return JSON.stringify({ error: 'CRM 数据不可用，请先在CRM中录入数据' })
      const { customers, notes } = crmData
      const now = new Date()
      const todayStr = now.toISOString().split('T')[0]
      const diffDays = (d: string) => Math.ceil((new Date(todayStr).getTime() - new Date(d).getTime()) / 86400000)

      const followUps = customers.filter(c => c.stage !== 'closed' && c.followUpDate && c.followUpDate.trim())
      const todayFu = followUps.filter(c => c.followUpDate === todayStr).length
      const overdueFu = followUps.filter(c => diffDays(c.followUpDate) > 0).length
      const upcomingFu = followUps.filter(c => diffDays(c.followUpDate) < 0).length
      const closed = customers.filter(c => c.stage === 'closed')
      const revenue = closed.reduce((s, c) => s + (c.dealAmount || 0), 0)

      return JSON.stringify({
        totalCustomers: customers.length,
        totalWithFollowUp: followUps.length,
        todayFollowUps: todayFu,
        upcomingFollowUps: upcomingFu,
        overdueFollowUps: overdueFu,
        closedCount: closed.length,
        totalRevenue: revenue,
        noteCount: notes.length,
        publishedNotes: notes.filter(n => n.status === 'published').length,
      }, null, 2)
    }

    case 'crm_search_customers': {
      const crmData = await loadCRMData()
      if (!crmData) return JSON.stringify({ error: 'CRM 数据不可用' })
      let results = [...crmData.customers]
      const query = args.query?.trim()
      if (query) {
        const q = query.toLowerCase()
        results = results.filter(c => c.name.toLowerCase().includes(q) || c.phone.includes(q))
      }
      if (args.source) results = results.filter(c => c.source === args.source)
      if (args.hasFollowUp === true) results = results.filter(c => c.stage !== 'closed' && c.followUpDate && c.followUpDate.trim())
      if (args.noteStyle) {
        const noteIds = crmData.notes.filter(n => n.style === args.noteStyle).map(n => n.id)
        if (noteIds.length > 0) results = results.filter(c => noteIds.includes(c.sourceNoteId || ''))
        else results = []
      }
      // Sort by follow-up date (urgent first) when filtering for follow-ups
      if (args.hasFollowUp === true) results.sort((a, b) => a.followUpDate.localeCompare(b.followUpDate))
      const limit = args.limit || 10
      results = results.slice(0, limit)

      const sourceLabel = (id: string) => SOURCES.find(s => s.id === id)?.label || id
      const getNoteTitle = (noteId: string | null) => noteId ? (crmData.notes.find(n => n.id === noteId)?.title || '') : ''
      const todayStr2 = new Date().toISOString().split('T')[0]
      const fuDiff = (d: string) => Math.ceil((new Date(todayStr2).getTime() - new Date(d).getTime()) / 86400000)

      return JSON.stringify({
        total: results.length,
        customers: results.map(c => {
          let fuStatus = ''
          if (c.followUpDate && c.followUpDate.trim()) {
            const d = fuDiff(c.followUpDate)
            if (d > 0) fuStatus = `逾期${d}天`
            else if (d === 0) fuStatus = '今天'
            else fuStatus = `${Math.abs(d)}天后`
          }
          return ({
            name: c.name, phone: c.phone,
            source: getNoteTitle(c.sourceNoteId) || sourceLabel(c.source),
            wechat: c.wechat,
            city: c.city, community: c.community, houseArea: c.houseArea,
            stylePreference: c.stylePreference, style: c.style,
            followUpDate: c.followUpDate || undefined,
            followUpStatus: fuStatus || undefined,
            followUpNote: c.followUpNote || undefined,
            dealAmount: c.dealAmount,
            notes: c.notes?.slice(0, 200) || undefined,
            createdAt: c.createdAt, updatedAt: c.updatedAt,
          })
        }),
      }, null, 2)
    }

    case 'crm_search_notes': {
      const crmData = await loadCRMData()
      if (!crmData) return JSON.stringify({ error: 'CRM 数据不可用' })
      let results = [...crmData.notes]
      const query = args.query?.trim()
      if (query) {
        const q = query.toLowerCase()
        results = results.filter(n => n.title.toLowerCase().includes(q))
      }
      if (args.status) results = results.filter(n => n.status === args.status)
      if (args.style) results = results.filter(n => n.style === args.style)
      const limit = args.limit || 10
      results = results.slice(0, limit)

      return JSON.stringify({
        total: results.length,
        notes: results.map(n => {
          const linkedCustomers = crmData.customers.filter(c => c.sourceNoteId === n.id)
          return {
            title: n.title, status: n.status === 'published' ? '已发布' : '草稿',
            publishDate: n.publishDate || undefined,
            style: n.style || undefined,
            customerCount: linkedCustomers.length,
            customerNames: linkedCustomers.length > 0 ? linkedCustomers.map(c => c.name) : undefined,
            views: n.views, likes: n.likes, comments: n.comments,
            account: n.account,
          }
        }),
      }, null, 2)
    }

    case 'wechat_push': {
      if (!args.title && !args.content) return JSON.stringify({ error: '请提供消息标题和内容' })
      const { ipcRenderer } = require('electron')
      try {
        const status = await ipcRenderer.invoke('wx-bot-status')
        if (status?.connected) {
          // 把 Markdown/HTML 转成微信可读的纯文本
          let text = args.title + '\n\n' + (args.content || '')
          text = convertToWeChatText(text)
          const result = await ipcRenderer.invoke('wx-bot-push-self', text)
          if (result?.ok) return JSON.stringify({ success: true, message: '已通过 ClawBot 发送到微信' })
          return JSON.stringify({ error: result?.error || 'ClawBot 发送失败' })
        }
        const token = await ipcRenderer.invoke('store-get', 'wx_push_token')
        if (!token) return JSON.stringify({ error: '微信未连接。请在设置 → 微信中扫码连接 ClawBot，或配置 Server酱 SendKey' })
        return JSON.stringify({ error: 'ClawBot 未连接，Server酱推送暂不可用' })
      } catch (e: any) {
        return JSON.stringify({ error: `推送异常: ${e.message}` })
      }
    }

    case 'lark_status': {
      if (window.electronAPI?.feishuCheck) {
        try {
          const result = await window.electronAPI.feishuCheck()
          return JSON.stringify(result, null, 2)
        } catch (e: any) {
          return JSON.stringify({ error: `飞书状态检测失败: ${e.message}` })
        }
      }
      return JSON.stringify({ error: '飞书CLI功能不可用（非桌面环境）' })
    }

    case 'lark_exec': {
      const command = args.command
      if (!command || typeof command !== 'string') {
        return JSON.stringify({ error: 'lark_exec 缺少 command 参数' })
      }
      if (window.electronAPI?.feishuExec) {
        try {
          const result = await window.electronAPI.feishuExec(command)
          // Pass through the result — includes success/error/hint fields
          return JSON.stringify(result, null, 2)
        } catch (e: any) {
          return JSON.stringify({ error: `飞书命令执行异常: ${e.message}`, command: command.slice(0, 100) })
        }
      }
      return JSON.stringify({ error: '飞书CLI功能不可用（非桌面环境）' })
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

  let hasFinalText = false

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
    hasFinalText = true
    yield { type: 'text_end' }

    if (!fullContent) {
      yield { type: 'text_chunk', content: '(模型未返回内容)' }
      yield { type: 'text_end' }
    }

    break
  }

 if (!hasFinalText) {
    // Collect tool summary from history for the fallback message
    const toolSummary = history
      .filter(h => h.role === 'tool')
      .slice(-3)
      .map(h => {
        try {
          const parsed = JSON.parse(h.content || '{}')
          if (parsed.error) return `⚠️ ${parsed.error}`
          if (parsed.drives) return `发现 ${parsed.drives.length} 个驱动器`
          if (parsed.count !== undefined) return `找到 ${parsed.count} 个匹配结果`
          if (parsed.items) return `目录中有 ${parsed.count || parsed.items.length} 项`
          if (parsed.message) return parsed.message
          return ''
        } catch { return '' }
      })
      .filter(Boolean)
      .join('；')
    const fallback = toolSummary ? `\n（已执行搜索${toolSummary ? '：' + toolSummary : ''}，但模型未生成最终回复。这可能是因为操作步骤较多，请尝试更具体的描述，如"帮我打开D盘里的摄影文件夹"）` : '\n（智能体正在处理，请稍后再问一次）'
    yield { type: 'text_chunk', content: fallback }
    yield { type: 'text_end' }
  }

  yield { type: 'done' }
}
