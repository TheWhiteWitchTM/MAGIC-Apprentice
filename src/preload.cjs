const { contextBridge, ipcRenderer } = require('electron');

const channels = new Set([
  'menu:command',
  'run:data',
  'run:exit',
  'play:closed',
  'ollama:event',
  'export:status',
]);

contextBridge.exposeInMainWorld('apprentice', {
  getInfo: () => ipcRenderer.invoke('app:info'),
  setSettings: (patch) => ipcRenderer.invoke('settings:set', patch || {}),
  listProjects: () => ipcRenderer.invoke('project:list'),
  openProject: (id) => ipcRenderer.invoke('project:open', id),
  createProject: (title) => ipcRenderer.invoke('project:create', title || ''),
  openExample: (id) => ipcRenderer.invoke('example:open', id),
  resetExample: () => ipcRenderer.invoke('example:reset'),
  readFile: (name) => ipcRenderer.invoke('file:read', name),
  writeFile: (name, content) => ipcRenderer.invoke('file:write', { name, content }),
  createFile: (name) => ipcRenderer.invoke('file:create', name || ''),
  check: (payload) => ipcRenderer.invoke('magic:check', payload || {}),
  run: (name) => ipcRenderer.invoke('run:start', name || ''),
  stop: () => ipcRenderer.invoke('run:stop'),
  exportPage: () => ipcRenderer.invoke('export:page'),
  exportApp: () => ipcRenderer.invoke('export:app'),
  showProject: () => ipcRenderer.invoke('shell:project'),
  ollamaStatus: () => ipcRenderer.invoke('ollama:status'),
  ask: (payload) => ipcRenderer.invoke('ollama:ask', payload || {}),
  askCancel: () => ipcRenderer.invoke('ollama:cancel'),
  smokeDone: (result) => ipcRenderer.send('smoke:done', result || {}),
  on: (channel, callback) => {
    if (!channels.has(channel)) throw new Error(`blocked channel ${channel}`);
    const listener = (_event, data) => callback(data);
    ipcRenderer.on(channel, listener);
    return () => ipcRenderer.removeListener(channel, listener);
  },
});
