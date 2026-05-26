declare var window: any
const { ipcRenderer } = require('electron')

window.electronAPI = {
  getStore: (key: string) => ipcRenderer.invoke('store-get', key),
  setStore: (key: string, value: any) => ipcRenderer.invoke('store-set', key, value),
  deleteStore: (key: string) => ipcRenderer.invoke('store-delete', key),
  clearStore: () => ipcRenderer.invoke('store-clear'),
  saveImage: (dataUrl: string, defaultName: string) => ipcRenderer.invoke('save-image', dataUrl, defaultName),
  openImageWindow: (url: string) => ipcRenderer.invoke('open-image-window', url),
  onNewTab: (cb: (data: { url: string; siteId: string }) => void) => {
    const h = (_e: any, d: { url: string; siteId: string }) => cb(d)
    ipcRenderer.on('new-tab', h)
    return () => { ipcRenderer.removeListener('new-tab', h) }
  },
}
