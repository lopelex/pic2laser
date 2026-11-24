'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  version: () => ipcRenderer.invoke('app-version'),
  manual: () => ipcRenderer.invoke('manual-read'),
  update: {
    state: () => ipcRenderer.invoke('update-state'),
    check: () => ipcRenderer.invoke('update-check'),
    download: () => ipcRenderer.invoke('update-download'),
    cancel: () => ipcRenderer.invoke('update-cancel'),
    install: () => ipcRenderer.invoke('update-install'),
    openPage: () => ipcRenderer.invoke('update-open-page'),
    onState: (cb) => {
      const handler = (_e, s) => cb(s);
      ipcRenderer.on('update-state', handler);
      return () => ipcRenderer.removeListener('update-state', handler);
    },
  },
  // image: { bits: Uint8Array (1 = schwarz), w, h }; lane: eigener Prozess je Spur (Füllung/Umriss laufen parallel)
  trace: (image, params, lane) => ipcRenderer.invoke('trace', image, params, lane),
  system: {
    profile: () => ipcRenderer.invoke('system-profile'),
  },
  perf: {
    status: () => ipcRenderer.invoke('perf-status'),
    set: (patch) => ipcRenderer.invoke('perf-set', patch),
    clearCache: () => ipcRenderer.invoke('perf-cache-clear'),
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
  cameraAccess: () => ipcRenderer.invoke('camera-access'),
  exportFiles: (payload) => ipcRenderer.invoke('export-files', payload),
  dragPrepare: (payload) => ipcRenderer.invoke('drag-prepare', payload),
  dragStart: (kind = 'result') => ipcRenderer.send('drag-start', kind),
  lightburnSend: (payload) => ipcRenderer.invoke('lightburn-send', payload),
  cancelAll: () => ipcRenderer.invoke('cancel-all'),
  showInFolder: (filePath) => ipcRenderer.invoke('show-in-folder', filePath),

  history: {
    list: () => ipcRenderer.invoke('history-list'),
    save: (entry) => ipcRenderer.invoke('history-save', entry),
    load: (id) => ipcRenderer.invoke('history-load', id),
    loadResult: (id) => ipcRenderer.invoke('history-load-result', id),
    loadPreview: (id) => ipcRenderer.invoke('history-load-preview', id),
    duplicate: (id) => ipcRenderer.invoke('history-duplicate', id),
    remove: (id) => ipcRenderer.invoke('history-delete', id),
    clear: () => ipcRenderer.invoke('history-clear'),
    exportSvg: (id) => ipcRenderer.invoke('history-export-svg', id),
    openFolder: (id) => ipcRenderer.invoke('history-open-folder', id),
  },
});
