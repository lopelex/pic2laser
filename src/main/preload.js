'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  trace: (pngBytes, params) => ipcRenderer.invoke('trace', pngBytes, params),
  system: {
    profile: () => ipcRenderer.invoke('system-profile'),
  },
  presets: {
    list: () => ipcRenderer.invoke('presets-list'),
    save: (preset) => ipcRenderer.invoke('presets-save', preset),
    remove: (name) => ipcRenderer.invoke('presets-delete', name),
  },
  models: {
    status: () => ipcRenderer.invoke('model-status'),
    ensure: (id) => ipcRenderer.invoke('model-ensure', id),
    remove: (id) => ipcRenderer.invoke('model-remove', id),
    run: (id, feeds, outputs) => ipcRenderer.invoke('model-run', id, feeds, outputs),
    onProgress: (cb) => {
      const handler = (_e, p) => cb(p);
      ipcRenderer.on('model-progress', handler);
      return () => ipcRenderer.removeListener('model-progress', handler);
    },
  },
  openImage: () => ipcRenderer.invoke('open-image'),
  exportFiles: (payload) => ipcRenderer.invoke('export-files', payload),
  dragPrepare: (payload) => ipcRenderer.invoke('drag-prepare', payload),
  dragStart: () => ipcRenderer.send('drag-start'),
  showInFolder: (filePath) => ipcRenderer.invoke('show-in-folder', filePath),

  history: {
    list: () => ipcRenderer.invoke('history-list'),
    save: (entry) => ipcRenderer.invoke('history-save', entry),
    load: (id) => ipcRenderer.invoke('history-load', id),
    remove: (id) => ipcRenderer.invoke('history-delete', id),
    clear: () => ipcRenderer.invoke('history-clear'),
    exportSvg: (id) => ipcRenderer.invoke('history-export-svg', id),
    openFolder: (id) => ipcRenderer.invoke('history-open-folder', id),
  },
});
