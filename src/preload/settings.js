'use strict';
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('rest', {
  get: () => ipcRenderer.invoke('settings:get'),
  set: (patch) => ipcRenderer.invoke('settings:set', patch),
  preview: (id) => ipcRenderer.invoke('settings:preview', id),
  openDataFile: () => ipcRenderer.invoke('settings:openDataFile'),
  finishWelcome: (patch) => ipcRenderer.invoke('welcome:done', patch),
  searchCities: (q) => ipcRenderer.invoke('cities:search', q),
  prayerToday: () => ipcRenderer.invoke('prayer:today'),
  prayerMethods: () => ipcRenderer.invoke('prayer:methods'),
});
