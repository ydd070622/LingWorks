export interface CustomModel {
  name: string
  apiKey: string
  endpoint: string
  modelName: string
}

export type NavItem =
  | { type: 'website'; id: string; label: string; url: string; icon: string }
| { type: 'comfyui'; id: string; label: string; url: string; icon: string }
 | { type: 'comfyui-page'; id: string; label: string; icon: string }
  | { type: 'xhs'; id: string; label: string; url: string; icon: string }
| { type: 'tool'; id: string; label: string; icon: string }
 | { type: 'aggregator'; id: string; label: string; icon: string }
  | { type: 'vpn'; id: string; label: string; url: string; icon: string }
  | { type: 'account'; id: string; label: string; icon: string }
  | { type: 'crm'; id: string; label: string; icon: string }

export interface Account {
  id: string
  name: string
  username: string
  password: string
  note?: string
}

export interface GenerationResult {
  images: string[]
  prompt: string
  timestamp: number
  modelName: string
}

export type BookmarkItem =
  | { id: string; name: string; type: 'folder'; children: BookmarkItem[] }
  | { id: string; name: string; type: 'bookmark'; url: string; icon: string }

export interface DownloadItem {
  id: string
  filename: string
  filePath?: string
  totalBytes: number
  receivedBytes: number
  state: 'progress' | 'completed' | 'failed'
}

export interface PromptItem {
  id: string
  title: string
  content: string
  category: string
  platform: string
  tags: string[]
  createdAt: number
  fromAI: boolean
}

export interface ShortcutBindings {
  [keyCombo: string]: string  // "Alt+1" -> "chatgpt"
}

// ===== Agent Panel Types =====
export interface AgentProvider {
  id: string
  name: string
  endpoint: string
  models: string[]
}

export interface AgentModel {
  id: string
  providerId: string
  apiKey: string
  modelName: string
  displayName?: string
}

export interface AgentMessage {
  id: string
  role: 'user' | 'assistant' | 'system' | 'tool'
  content: string
  timestamp: number
  /** Tool call metadata (role === 'tool') */
  toolCallId?: string
  toolName?: string
  toolInput?: string
  toolResult?: string
  toolStatus?: 'calling' | 'done'
}

export interface AgentSession {
  id: string
  title: string
  modelId: string
  messages: AgentMessage[]
  createdAt: number
  updatedAt: number
}

// ===== Agent Tool Types =====
export interface ToolCall {
  id: string
  type: 'function'
  function: {
    name: string
    arguments: string
  }
}

export type AgentEvent =
  | { type: 'thinking' }
  | { type: 'tool_call'; toolCall: ToolCall }
  | { type: 'tool_result'; toolCallId: string; toolName: string; result: string }
  | { type: 'text'; content: string }
  | { type: 'text_chunk'; content: string }
  | { type: 'text_end' }
  | { type: 'text_revoke' }
  | { type: 'intent'; action: string; page: string; prefill?: Record<string, any> }
  | { type: 'error'; message: string }
  | { type: 'done' }

// ===== Agent Integration Context =====
export type AgentContext =
  | { kind: 'text'; text: string; sourceUrl?: string; autoSubmit?: boolean }
  | { kind: 'image'; data: string; prompt?: string; model?: string; autoSubmit?: boolean }
  | { kind: 'intent'; action: 'navigate'; page: string; prefill?: Record<string, any> }

declare global {
  interface Window {
    electronAPI?: {
      getStore: (key: string) => Promise<any>
      setStore: (key: string, value: any) => Promise<void>
      deleteStore: (key: string) => Promise<void>
      clearStore: () => Promise<void>
      saveImage: (dataUrl: string, defaultName: string) => Promise<void>
      saveHistoryImage: (base64: string, id: string) => Promise<string>
      readHistoryImage: (filePath: string) => Promise<string | null>
      deleteHistoryImage: (filePath: string) => Promise<void>
      getHistoryImageDir: () => Promise<string>
      openImageWindow: (url: string) => Promise<void>
      downloadImage: (url: string) => Promise<string | null>
      openExternal: (url: string) => Promise<void>
      setThemeSource: (source: string) => Promise<void>
      getDesktopPath: () => Promise<string>
      selectFolder: (defaultPath: string) => Promise<string | null>
      onDownloadStarted: (cb: (data: DownloadItem) => void) => () => void
      onDownloadProgress: (cb: (data: { id: string; receivedBytes: number; totalBytes: number }) => void) => () => void
      onDownloadCompleted: (cb: (data: { id: string; filePath: string }) => void) => () => void
      onDownloadFailed: (cb: (data: { id: string }) => void) => () => void
      cancelDownload: (id: string) => Promise<void>
      registerWebviewSession: (wcId: number) => Promise<boolean>
      shellOpenPath: (p: string) => Promise<void>
      shellShowItem: (p: string) => Promise<void>
      minimizeWindow: () => Promise<void>
      maximizeWindow: () => Promise<void>
      closeWindow: () => Promise<void>
      setWindowPosition: (x: number, y: number) => Promise<void>
      isMaximized: () => Promise<boolean>
      onMaximizeChange: (cb: (isMax: boolean) => void) => () => void
      onNewTab: (cb: (data: { url: string; siteId: string }) => void) => () => void
      onPopupNavigate: (cb: (data: { url: string; hostWebContentsId?: number }) => void) => () => void
      dsLogin: () => Promise<string | null>
      registerShortcuts: (bindings: Record<string, string>) => Promise<void>
      onShortcutTrigger: (cb: (targetId: string) => void) => () => void
      onContextMenuSendToAgent: (cb: (data: { text: string; sourceUrl: string }) => void) => () => void
      onContextMenuSearch: (cb: (data: { text: string }) => void) => () => void
      onContextMenuTranslate: (cb: (data: { text: string }) => void) => () => void
      webSearch: (query: string) => Promise<Array<{ title: string; snippet: string; url: string; source?: string }>>
      translate: (text: string) => Promise<string | null>
      webFetch: (url: string, maxBytes?: number) => Promise<{ url?: string; title?: string; content?: string; error?: string }>
      fileList: (path: string) => Promise<{ path?: string; count?: number; items?: Array<{ name: string; isDir: boolean; size?: number; modified: string }>; error?: string }>
      fileRead: (path: string, maxLines?: number) => Promise<{ path?: string; size?: number; sizeKB?: string; totalLines?: number; content?: string; truncated?: boolean; error?: string }>
      fileWrite: (path: string, content: string) => Promise<{ path?: string; size?: number; message?: string; error?: string }>
      fileEdit: (path: string, search: string, replace: string) => Promise<{ path?: string; message?: string; oldLines?: number; newLines?: number; error?: string }>
    }
  }
}
