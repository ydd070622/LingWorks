export interface CustomModel {
  name: string
  apiKey: string
  endpoint: string
  modelName: string
}

export type NavItem =
  | { type: 'website'; id: string; label: string; url: string; icon: string }
  | { type: 'tool'; id: string; label: string; icon: string }
  | { type: 'aggregator'; id: string; label: string; icon: string }
  | { type: 'vpn'; id: string; label: string; url: string; icon: string }
  | { type: 'account'; id: string; label: string; icon: string }

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
      openExternal: (url: string) => Promise<void>
      setThemeSource: (source: string) => Promise<void>
      getDesktopPath: () => Promise<string>
      selectFolder: (defaultPath: string) => Promise<string | null>
      onDownloadStarted: (cb: (data: DownloadItem) => void) => () => void
      onDownloadProgress: (cb: (data: { id: string; receivedBytes: number; totalBytes: number }) => void) => () => void
      onDownloadCompleted: (cb: (data: { id: string; filePath: string }) => void) => () => void
      onDownloadFailed: (cb: (data: { id: string }) => void) => () => void
      cancelDownload: (id: string) => Promise<void>
      shellOpenPath: (p: string) => Promise<void>
      shellShowItem: (p: string) => Promise<void>
      minimizeWindow: () => Promise<void>
      maximizeWindow: () => Promise<void>
      closeWindow: () => Promise<void>
      setWindowPosition: (x: number, y: number) => Promise<void>
      isMaximized: () => Promise<boolean>
      onMaximizeChange: (cb: (isMax: boolean) => void) => () => void
      onNewTab: (cb: (data: { url: string; siteId: string }) => void) => () => void
      onPopupNavigate: (cb: (data: { url: string }) => void) => () => void
      dsLogin: () => Promise<string | null>
    }
  }
}
