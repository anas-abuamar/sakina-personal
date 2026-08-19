'use strict';
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('rest', {
  get: () => ipcRenderer.invoke('settings:get'),
  set: (patch) => ipcRenderer.invoke('settings:set', patch),
  preview: () => ipcRenderer.invoke('settings:preview'),
  openDataFile: () => ipcRenderer.invoke('settings:openDataFile'),
  finishWelcome: (patch) => ipcRenderer.invoke('welcome:done', patch),
});
