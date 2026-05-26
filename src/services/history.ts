export interface HistoryItem {
  id: string
  type: 'text-to-image' | 'image-to-image'
  prompt: string
  imageBase64: string
  timestamp: number
  modelName: string
  parameters?: Record<string, any>
}

const STORAGE_KEY = 'generationHistory'
const MAX_ITEMS = 100

async function storeGet<T>(key: string): Promise<T | null> {
  if (window.electronAPI) {
    return window.electronAPI.getStore(key)
  }
  const raw = localStorage.getItem(key)
  if (!raw) return null
  try { return JSON.parse(raw) } catch { return null }
}

async function storeSet(key: string, value: any) {
  if (window.electronAPI) {
    await window.electronAPI.setStore(key, value)
  } else {
    localStorage.setItem(key, JSON.stringify(value))
  }
}

class HistoryService {
  async getAll(): Promise<HistoryItem[]> {
    const items = await storeGet<HistoryItem[]>(STORAGE_KEY)
    return items || []
  }

  async addItem(item: Omit<HistoryItem, 'id' | 'timestamp'>) {
    const items = await this.getAll()
    const newItem: HistoryItem = {
      ...item,
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 8),
      timestamp: Date.now(),
    }
    items.unshift(newItem)
    if (items.length > MAX_ITEMS) items.length = MAX_ITEMS
    await storeSet(STORAGE_KEY, items)
    return newItem
  }

  async deleteItem(id: string) {
    const items = await this.getAll()
    await storeSet(STORAGE_KEY, items.filter(i => i.id !== id))
  }

  async clearAll() {
    await storeSet(STORAGE_KEY, [])
  }
}

export const historyService = new HistoryService()
