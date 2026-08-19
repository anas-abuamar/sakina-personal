'use strict';
const { contextBridge, ipcRenderer } = require('electron');

// The break screen gets exactly two verbs and one event. Nothing else from the
// main process is reachable from a window that renders user-supplied text.
contextBridge.exposeInMainWorld('rest', {
  onShow: (fn) => ipcRenderer.on('break:show', (_e, payload) => fn(payload)),
  finished: () => ipcRenderer.send('break:finished'),
  skipped: () => ipcRenderer.send('break:skipped'),
});
