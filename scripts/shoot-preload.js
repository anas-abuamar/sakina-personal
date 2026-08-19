'use strict';
// Stub bridge so renderer pages can be screenshotted without the real app.
const { contextBridge } = require('electron');
const fixture = JSON.parse(process.env.REST_FIXTURE || '{}');

contextBridge.exposeInMainWorld('rest', {
  get: async () => fixture.state,
  set: async (patch) => ({ ...fixture.state.settings, ...patch }),
  preview: async () => {},
  openDataFile: async () => {},
  finishWelcome: async () => {},
  searchCities: async () => fixture.cityResults || [],
  prayerToday: async () => fixture.prayerToday || null,
  prayerMethods: async () => fixture.methods || [],
  onShow: (fn) => setTimeout(() => fn(fixture.breakPayload), 60),
  finished: () => {},
  skipped: () => {},
});
