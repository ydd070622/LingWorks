declare var window: any
const { ipcRenderer } = require('electron')

window.electronAPI = {
  getStore: (key: string) => ipcRenderer.invoke('store-get', key),
  setStore: (key: string, value: any) => ipcRenderer.invoke('store-set', key, value),
  deleteStore: (key: string) => ipcRenderer.invoke('store-delete', key),
  clearStore: () => ipcRenderer.invoke('store-clear'),
  saveImage: (dataUrl: string, defaultName: string) => ipcRenderer.invoke('save-image', dataUrl, defaultName),
  openImageWindow: (url: string) => ipcRenderer.invoke('open-image-window', url),
  openExternal: (url: string) => ipcRenderer.invoke('open-external', url),
  setThemeSource: (source: string) => ipcRenderer.invoke('set-theme-source', source),
  getDesktopPath: () => ipcRenderer.invoke('get-desktop-path'),
  selectFolder: (defaultPath: string) => ipcRenderer.invoke('select-folder', defaultPath),
  cancelDownload: (id: string) => ipcRenderer.invoke('cancel-download', id),
  shellOpenPath: (p: string) => ipcRenderer.invoke('shell-open-path', p),
  shellShowItem: (p: string) => ipcRenderer.invoke('shell-show-item', p),

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
}
