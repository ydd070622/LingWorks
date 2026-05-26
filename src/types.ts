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

declare global {
  interface Window {
    electronAPI?: {
      getStore: (key: string) => Promise<any>
      setStore: (key: string, value: any) => Promise<void>
      deleteStore: (key: string) => Promise<void>
      clearStore: () => Promise<void>
      saveImage: (dataUrl: string, defaultName: string) => Promise<void>
      openImageWindow: (url: string) => Promise<void>
      onNewTab: (cb: (data: { url: string; siteId: string }) => void) => () => void
    }
  }
}
