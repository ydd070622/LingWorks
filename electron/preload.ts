declare var window: any
const { ipcRenderer } = require('electron')

window.electronAPI = {
  getStore: (key: string) => ipcRenderer.invoke('store-get', key),
  setStore: (key: string, value: any) => ipcRenderer.invoke('store-set', key, value),
  deleteStore: (key: string) => ipcRenderer.invoke('store-delete', key),
  clearStore: () => ipcRenderer.invoke('store-clear'),
  saveImage: (dataUrl: string, defaultName: string) => ipcRenderer.invoke('save-image', dataUrl, defaultName),
    saveHistoryImage: (base64: string, id: string) => ipcRenderer.invoke('save-history-image', base64, id),
    readHistoryImage: (filePath: string) => ipcRenderer.invoke('read-history-image', filePath),
    deleteHistoryImage: (filePath: string) => ipcRenderer.invoke('delete-history-image', filePath),
    getHistoryImageDir: () => ipcRenderer.invoke('get-history-image-dir'),
  openImageWindow: (url: string) => ipcRenderer.invoke('open-image-window', url),
  downloadImage: (url: string) => ipcRenderer.invoke('download-image', url),
  openExternal: (url: string) => ipcRenderer.invoke('open-external', url),
  setThemeSource: (source: string) => ipcRenderer.invoke('set-theme-source', source),
  setAutoLaunch: (enable: boolean) => ipcRenderer.invoke('set-auto-launch', enable),
  getAutoLaunch: () => ipcRenderer.invoke('get-auto-launch'),
  setStartMinimized: (enable: boolean) => ipcRenderer.invoke('set-start-minimized', enable),
  getStartMinimized: () => ipcRenderer.invoke('get-start-minimized'),
  setCloseToTray: (enable: boolean) => ipcRenderer.invoke('set-close-to-tray', enable),
  getCloseToTray: () => ipcRenderer.invoke('get-close-to-tray'),
  showNotification: (title: string, body: string) => ipcRenderer.invoke('show-notification', title, body),
  getDesktopPath: () => ipcRenderer.invoke('get-desktop-path'),
  selectFolder: (defaultPath: string) => ipcRenderer.invoke('select-folder', defaultPath),
  cancelDownload: (id: string) => ipcRenderer.invoke('cancel-download', id),
  registerWebviewSession: (wcId: number) => ipcRenderer.invoke('register-webview-session', wcId),
  shellOpenPath: (p: string) => ipcRenderer.invoke('shell-open-path', p),
  shellShowItem: (p: string) => ipcRenderer.invoke('shell-show-item', p),

  minimizeWindow: () => ipcRenderer.invoke('window-minimize'),
  maximizeWindow: () => ipcRenderer.invoke('window-maximize'),
  closeWindow: () => ipcRenderer.invoke('window-close'),
  isMaximized: () => ipcRenderer.invoke('window-is-maximized'),
  setWindowPosition: (x: number, y: number) => ipcRenderer.invoke('window-set-position', x, y),
  onMaximizeChange: (cb: (isMax: boolean) => void) => {
    const h = (_e: any, isMax: boolean) => cb(isMax)
    ipcRenderer.on('window-maximize-change', h)
    return () => { ipcRenderer.removeListener('window-maximize-change', h) }
  },

  onDownloadStarted: (cb: (data: any) => void) => {
    const h = (_e: any, d: any) => cb(d)
    ipcRenderer.on('download-started', h)
    return () => { ipcRenderer.removeListener('download-started', h) }
  },
  onDownloadProgress: (cb: (data: any) => void) => {
    const h = (_e: any, d: any) => cb(d)
    ipcRenderer.on('download-progress', h)
    return () => { ipcRenderer.removeListener('download-progress', h) }
  },
  onDownloadCompleted: (cb: (data: any) => void) => {
    const h = (_e: any, d: any) => cb(d)
    ipcRenderer.on('download-completed', h)
    return () => { ipcRenderer.removeListener('download-completed', h) }
  },
  onDownloadFailed: (cb: (data: any) => void) => {
    const h = (_e: any, d: any) => cb(d)
    ipcRenderer.on('download-failed', h)
    return () => { ipcRenderer.removeListener('download-failed', h) }
  },

  onNewTab: (cb: (data: { url: string; siteId: string }) => void) => {
    const h = (_e: any, d: { url: string; siteId: string }) => cb(d)
    ipcRenderer.on('new-tab', h)
    return () => { ipcRenderer.removeListener('new-tab', h) }
  },
  onPopupNavigate: (cb: (data: { url: string }) => void) => {
    const h = (_e: any, d: { url: string }) => cb(d)
    ipcRenderer.on('popup-navigate', h)
    return () => { ipcRenderer.removeListener('popup-navigate', h) }
  },
  dsLogin: () => ipcRenderer.invoke('ds-login'),

  registerShortcuts: (bindings: Record<string, string>) => ipcRenderer.invoke('register-shortcuts', bindings),
  onShortcutTrigger: (cb: (targetId: string) => void) => {
    const h = (_e: any, targetId: string) => cb(targetId)
    ipcRenderer.on('shortcut-trigger', h)
    return () => { ipcRenderer.removeListener('shortcut-trigger', h) }
  },
  onContextMenuSendToAgent: (cb: (data: { text: string; sourceUrl: string }) => void) => {
    const h = (_e: any, data: { text: string; sourceUrl: string }) => cb(data)
    ipcRenderer.on('context-menu:send-to-agent', h)
    return () => { ipcRenderer.removeListener('context-menu:send-to-agent', h) }
  },
  onContextMenuSearch: (cb: (data: { text: string }) => void) => {
    const h = (_e: any, data: { text: string }) => cb(data)
    ipcRenderer.on('context-menu:search', h)
    return () => { ipcRenderer.removeListener('context-menu:search', h) }
  },
  onContextMenuTranslate: (cb: (data: { text: string }) => void) => {
    const h = (_e: any, data: { text: string }) => cb(data)
    ipcRenderer.on('context-menu:translate', h)
    return () => { ipcRenderer.removeListener('context-menu:translate', h) }
  },

  webSearch: (query: string) => ipcRenderer.invoke('web-search', query),
  translate: (text: string) => ipcRenderer.invoke('translate', text),
  webFetch: (url: string, maxBytes?: number) => ipcRenderer.invoke('web-fetch', url, maxBytes),
  fileList: (path: string) => ipcRenderer.invoke('file-list', path),
  fileRead: (path: string, maxLines?: number) => ipcRenderer.invoke('file-read', path, maxLines),
  fileWrite: (path: string, content: string) => ipcRenderer.invoke('file-write', path, content),
  fileEdit: (path: string, search: string, replace: string) => ipcRenderer.invoke('file-edit', path, search, replace),
}
