export interface HistoryItem {
  id: string
  type: 'text-to-image' | 'image-to-image'
  prompt: string
  imagePath: string
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

// Resolve image URL from a path stored in history item
// In Electron: reads file and returns data URL via IPC
// In browser: returns imagePath directly (it's already a data URL from localStorage)
export async function getImageUrl(item: HistoryItem): Promise<string> {
  if (window.electronAPI && item.imagePath && !item.imagePath.startsWith('data:')) {
    const dataUrl = await window.electronAPI.readHistoryImage(item.imagePath)
    return dataUrl || item.imagePath
  }
  return item.imagePath
}

class HistoryService {
  async getAll(): Promise<HistoryItem[]> {
    const items = await storeGet<HistoryItem[]>(STORAGE_KEY)
    return items || []
  }

  async addItem(item: Omit<HistoryItem, 'id' | 'timestamp' | 'imagePath'> & { imageBase64: string }) {
    const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 8)

    // Save image to disk (Electron) or keep base64 (browser fallback)
    let imagePath: string
    if (window.electronAPI) {
      imagePath = await window.electronAPI.saveHistoryImage(item.imageBase64, id)
    } else {
      imagePath = item.imageBase64
    }

    const newItem: HistoryItem = {
      type: item.type,
      prompt: item.prompt,
      imagePath,
      modelName: item.modelName,
      parameters: item.parameters,
      id,
      timestamp: Date.now(),
    }

    const items = await this.getAll()
    items.unshift(newItem)
    if (items.length > MAX_ITEMS) {
      // Clean up images for removed items
      if (window.electronAPI) {
        for (const old of items.slice(MAX_ITEMS)) {
          if (old.imagePath && !old.imagePath.startsWith('data:')) {
            window.electronAPI.deleteHistoryImage(old.imagePath)
          }
        }
      }
      items.length = MAX_ITEMS
    }
    await storeSet(STORAGE_KEY, items)
    return newItem
  }

  async deleteItem(id: string) {
    const items = await this.getAll()
    const item = items.find(i => i.id === id)
    if (item && window.electronAPI && item.imagePath && !item.imagePath.startsWith('data:')) {
      window.electronAPI.deleteHistoryImage(item.imagePath)
    }
    await storeSet(STORAGE_KEY, items.filter(i => i.id !== id))
  }

  async clearAll() {
    const items = await this.getAll()
    if (window.electronAPI) {
      for (const item of items) {
        if (item.imagePath && !item.imagePath.startsWith('data:')) {
          window.electronAPI.deleteHistoryImage(item.imagePath)
        }
      }
    }
    await storeSet(STORAGE_KEY, [])
  }
}

export const historyService = new HistoryService()
