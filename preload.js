const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('maxx', {
  getSnapshot: () => ipcRenderer.invoke('get-snapshot'),
  refreshProvider: (id) => ipcRenderer.invoke('refresh-provider', id),
  getConfig: () => ipcRenderer.invoke('get-config'),
  getTerminals: () => ipcRenderer.invoke('get-terminals'),
  saveConfig: (config) => ipcRenderer.invoke('save-config', config),
  onSnapshot: (cb) => ipcRenderer.on('snapshot', (_e, snap) => cb(snap)),
  close: () => ipcRenderer.send('close-popover'),
  openConfigFile: () => ipcRenderer.send('open-config-file'),
  openSite: () => ipcRenderer.send('open-site'),
  forgeIdeas: () => ipcRenderer.invoke('forge-ideas'),
  forgeFeedback: (payload) => ipcRenderer.invoke('forge-feedback', payload),
  forgeStart: (idea) => ipcRenderer.invoke('forge-start', idea),
})
