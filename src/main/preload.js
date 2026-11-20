'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  trace: (pngBytes, params) => ipcRenderer.invoke('trace', pngBytes, params),
  segment: (input) => ipcRenderer.invoke('segment', input),
  openImage: () => ipcRenderer.invoke('open-image'),
  exportFiles: (payload) => ipcRenderer.invoke('export-files', payload),
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
