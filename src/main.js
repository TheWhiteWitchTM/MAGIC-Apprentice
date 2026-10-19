import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {
  app,
  BrowserWindow,
  ipcMain,
  Menu,
  protocol,
  session,
  shell,
} from 'electron';
import { appRoot } from './paths.js';
import {
  copyExample,
  createMagicFile,
  createProject,
  libraryDir,
  listMagic,
  listProjects,
  readProjectFile,
  resetExample,
  seedLibrary,
  writeProjectFile,
} from './services/files.js';
import {
  checkSource,
  findMagic,
  findNode,
  findNpm,
  packProject,
  startRun,
} from './services/magic.js';
import { INSTALL_STEPS, probeOllama, streamExplain } from './services/ollama.js';
import { jail } from './services/sandbox.js';
import { DEFAULTS, loadJson, saveJson } from './services/store.js';
import { EXAMPLES, LESSONS } from './shared/catalog.js';
import { explainProblem } from './shared/errors.js';

const smoke = process.env.MAGIC_APPRENTICE_SMOKE === '1';
if (process.env.MAGIC_APPRENTICE_DATA) {
  app.setPath('userData', path.resolve(process.env.MAGIC_APPRENTICE_DATA));
}

app.setName('magic-apprentice');

protocol.registerSchemesAsPrivileged([
  {
    scheme: 'apprentice',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
      stream: true,
      codeCache: true,
    },
  },
]);

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.cjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ttf': 'font/ttf',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.map': 'application/json; charset=utf-8',
};

let win = null;
let settings = { ...DEFAULTS };
let settingsFile = '';
let library = '';
let current = null;
let runtime = {
  nodePath: '',
  magic: { cli: null, bin: null, root: null },
  npm: '',
  ollama: { ok: false, host: 'http://127.0.0.1:11434', models: [], model: '' },
};
let runHandle = null;
let playWin = null;
let playDir = '';
let askAbort = null;
let exportChild = null;

function version() {
  try {
    return JSON.parse(fs.readFileSync(path.join(appRoot, 'package.json'), 'utf8')).version || '0.1.0';
  } catch {
    return '0.1.0';
  }
}

function send(channel, payload) {
  if (win && !win.isDestroyed()) win.webContents.send(channel, payload);
}

function persist() {
  if (settingsFile) saveJson(settingsFile, settings);
}

function timeoutMs() {
  return settings.mode === 'advanced' ? 5 * 60 * 1000 : 30 * 1000;
}

function useStrict() {
  return settings.mode === 'advanced' && settings.strict === true;
}

function projectSummary(project) {
  if (!project) return null;
  return {
    id: project.id,
    title: project.title,
    example: project.example,
    files: listMagic(project.dir),
    main: project.main ? path.basename(project.main) : 'main.magic',
  };
}

function openId(id) {
  const folder = path.basename(String(id || ''));
  if (!folder || folder.startsWith('.')) throw new Error('That project is not in your library.');
  const dir = jail(library, folder);
  if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) {
    throw new Error('That project is not in your library.');
  }
  const found = listProjects(library).find((item) => item.id === folder);
  if (!found) throw new Error('That project is not in your library.');
  current = found;
  settings = { ...settings, lastProject: found.id };
  persist();
  return found;
}

function currentFile(name) {
  if (!current) throw new Error('Open a project first.');
  const base = path.basename(String(name || 'main.magic'));
  return jail(current.dir, base);
}

function stopRun(notify = true) {
  if (runHandle) {
    const handle = runHandle;
    runHandle = null;
    handle.stop(notify);
  }
  closePlay();
}

function closePlay() {
  const closing = playWin;
  const dir = playDir;
  playWin = null;
  playDir = '';
  if (closing && !closing.isDestroyed()) {
    closing.removeAllListeners('closed');
    closing.once('closed', () => {
      if (dir) fs.rm(dir, { recursive: true, force: true }, () => {});
    });
    closing.close();
    return;
  }
  if (dir) fs.rm(dir, { recursive: true, force: true }, () => {});
}

function blockPlayNetwork() {
  const playSession = session.fromPartition('play');
  playSession.webRequest.onBeforeRequest((details, callback) => {
    if (/^(https?|wss?|ftp):/i.test(details.url || '')) {
      callback({ cancel: true });
      return;
    }
    callback({});
  });
  playSession.setPermissionRequestHandler((_wc, _permission, callback) => {
    callback(false);
  });
}

async function openPlay(file) {
  closePlay();
  const out = fs.mkdtempSync(path.join(app.getPath('userData'), 'play-'));
  playDir = out;
  const packed = await packProject({
    nodePath: runtime.nodePath,
    magic: runtime.magic,
    file,
    projectDir: current.dir,
    outDir: out,
    title: current.title || 'MAGIC',
  });
  if (!packed.ok) return packed;
  playWin = new BrowserWindow({
    width: 960,
    height: 720,
    title: current.title || 'Play',
    backgroundColor: '#1a2230',
    autoHideMenuBar: true,
    parent: win || undefined,
    webPreferences: {
      partition: 'play',
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
    },
  });
  playWin.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  playWin.webContents.on('will-navigate', (event, url) => {
    if (!String(url).startsWith('file:')) event.preventDefault();
  });
  playWin.on('closed', () => {
    playWin = null;
    send('play:closed', {});
  });
  await playWin.loadFile(packed.index);
  return { ok: true };
}

function fromAppUrl(requestUrl) {
  let url;
  try {
    url = new URL(requestUrl);
  } catch {
    return null;
  }
  if (url.hostname !== 'app') return null;
  const rel = decodeURIComponent(url.pathname).replace(/^\/+/, '');
  if (!rel || rel.split('/').includes('..')) return null;
  const file = path.resolve(appRoot, rel);
  if (file !== appRoot && !file.startsWith(`${appRoot}${path.sep}`)) return null;
  return file;
}

function info() {
  return {
    version: version(),
    smoke,
    theme: settings.theme === 'night' ? 'night' : 'paper',
    mode: settings.mode === 'advanced' ? 'advanced' : 'beginner',
    tutorialStep: Number.isInteger(settings.tutorialStep) ? settings.tutorialStep : 0,
    tutorialDismissed: settings.tutorialDismissed === true,
    strict: settings.strict === true,
    magic: Boolean(runtime.magic.cli || runtime.magic.bin),
    examples: EXAMPLES,
    lessons: LESSONS,
    project: projectSummary(current),
    ollama: runtime.ollama,
    installSteps: INSTALL_STEPS,
  };
}

function registerIpc() {
  ipcMain.handle('app:info', () => info());

  ipcMain.handle('settings:set', (_event, patch) => {
    const next = { ...settings };
    if (patch.theme === 'paper' || patch.theme === 'night') next.theme = patch.theme;
    if (patch.mode === 'beginner' || patch.mode === 'advanced') next.mode = patch.mode;
    if (typeof patch.tutorialDismissed === 'boolean') next.tutorialDismissed = patch.tutorialDismissed;
    if (Number.isInteger(patch.tutorialStep) && patch.tutorialStep >= 0 && patch.tutorialStep <= 3) {
      next.tutorialStep = patch.tutorialStep;
    }
    if (typeof patch.strict === 'boolean') next.strict = patch.strict;
    if (typeof patch.aiModel === 'string') next.aiModel = patch.aiModel.slice(0, 80);
    settings = next;
    persist();
    if (runtime.ollama.ok) {
      runtime.ollama = { ...runtime.ollama, model: runtime.ollama.model };
    }
    return info();
  });

  ipcMain.handle('project:list', () => listProjects(library).map(projectSummary));

  ipcMain.handle('project:open', (_event, id) => {
    stopRun();
    return projectSummary(openId(id));
  });

  ipcMain.handle('project:create', (_event, title) => {
    stopRun();
    const project = createProject(library, title);
    current = project;
    settings = { ...settings, lastProject: project.id };
    persist();
    return projectSummary(project);
  });

  ipcMain.handle('example:open', (_event, id) => {
    stopRun();
    const project = copyExample(library, id);
    current = project;
    settings = { ...settings, lastProject: project.id };
    persist();
    return projectSummary(project);
  });

  ipcMain.handle('example:reset', () => {
    if (!current) throw new Error('Open a project first.');
    resetExample(library, current.id);
    return { ok: true, file: 'main.magic' };
  });

  ipcMain.handle('file:read', (_event, name) => readProjectFile(current?.dir, name));

  ipcMain.handle('file:write', (_event, payload) => {
    const file = writeProjectFile(current?.dir, payload?.name, payload?.content);
    return { ok: true, file: path.basename(file) };
  });

  ipcMain.handle('file:create', (_event, name) => {
    const file = createMagicFile(current?.dir, name);
    return { ok: true, file };
  });

  ipcMain.handle('magic:check', async (_event, payload) => {
    if (!current) return { ok: false, problems: [] };
    const name = path.basename(String(payload?.name || 'main.magic'));
    const file = currentFile(name);
    const result = await checkSource({
      nodePath: runtime.nodePath,
      magic: runtime.magic,
      file,
      content: typeof payload?.content === 'string' ? payload.content : null,
      projectDir: current.dir,
      strict: useStrict(),
    });
    return {
      ok: result.ok,
      problems: result.problems.map((problem) => ({
        ...problem,
        file: name,
        ...explainProblem(problem.message),
      })),
    };
  });

  ipcMain.handle('run:start', async (_event, name) => {
    if (!current) return { ok: false, error: 'Open a project first.' };
    if (runHandle || (playWin && !playWin.isDestroyed())) stopRun(false);
    const base = path.basename(String(name || 'main.magic'));
    const file = currentFile(base);
    const source = fs.readFileSync(file, 'utf8');
    const visual = /@(canvas|terminal|2d|3d|ui)\b/i.test(source);
    if (visual) {
      send('run:data', { text: 'Opening the play window…\n' });
      const played = await openPlay(file);
      if (!played.ok) {
        send('run:exit', { code: 1, plain: played.error, hint: played.hint || '', raw: played.raw || '' });
        return { ok: false };
      }
      send('run:data', { text: 'The play window is open. Close it, or press Stop.\n' });
      send('run:exit', { code: 0, plain: '', hint: '', raw: '', playing: true });
      return { ok: true, playing: true };
    }
    runHandle = startRun({
      nodePath: runtime.nodePath,
      magic: runtime.magic,
      file,
      projectDir: current.dir,
      timeoutMs: timeoutMs(),
      strict: useStrict(),
      onData: (text) => send('run:data', { text }),
      onExit: (result) => {
        runHandle = null;
        send('run:exit', result);
      },
    });
    return { ok: true, playing: false };
  });

  ipcMain.handle('run:stop', () => {
    stopRun();
    return { ok: true };
  });

  ipcMain.handle('export:page', async () => exportPacked('page'));

  ipcMain.handle('export:app', async () => exportPacked('app'));

  ipcMain.handle('shell:project', () => {
    if (!current) return { ok: false };
    shell.showItemInFolder(current.dir);
    return { ok: true };
  });

  ipcMain.handle('ollama:status', async () => {
    runtime.ollama = await probeOllama();
    if (settings.aiModel && runtime.ollama.models?.includes(settings.aiModel)) {
      runtime.ollama.model = settings.aiModel;
    }
    return runtime.ollama;
  });

  ipcMain.handle('ollama:ask', async (_event, payload) => {
    if (!runtime.ollama.ok) runtime.ollama = await probeOllama();
    if (!runtime.ollama.ok || !runtime.ollama.model) {
      return { ok: false, error: 'The local helper is not running.', steps: INSTALL_STEPS };
    }
    if (askAbort) askAbort.abort();
    const controller = new AbortController();
    askAbort = controller;
    try {
      await streamExplain({
        model: settings.aiModel && runtime.ollama.models.includes(settings.aiModel)
          ? settings.aiModel
          : runtime.ollama.model,
        code: String(payload?.code || '').slice(0, 20000),
        question: String(payload?.question || '').slice(0, 2000),
        errorText: String(payload?.errorText || '').slice(0, 1000),
        signal: controller.signal,
        onText: (text) => send('ollama:event', { text }),
      });
      send('ollama:event', { done: true });
      return { ok: true };
    } catch (error) {
      if (controller.signal.aborted) return { ok: false, aborted: true };
      const message = error instanceof Error ? error.message : String(error);
      send('ollama:event', { error: message, done: true });
      return { ok: false, error: message };
    } finally {
      if (askAbort === controller) askAbort = null;
    }
  });

  ipcMain.handle('ollama:cancel', () => {
    if (askAbort) askAbort.abort();
    return { ok: true };
  });

  ipcMain.on('smoke:done', (_event, result) => {
    if (!smoke) return;
    const ok = Boolean(result?.ok);
    console.log(`SMOKE ${JSON.stringify(result)}`);
    app.exit(ok ? 0 : 1);
  });
}

async function exportPacked(kind) {
  if (!current) return { ok: false, error: 'Open a project first.' };
  const file = current.main || currentFile('main.magic');
  const outDir = path.join(current.dir, 'export', kind === 'app' ? 'app' : 'page');
  send('export:status', { text: kind === 'app' ? 'Packing the app…\n' : 'Packing the web page…\n' });
  const packed = await packProject({
    nodePath: runtime.nodePath,
    magic: runtime.magic,
    file,
    projectDir: current.dir,
    outDir,
    title: current.title || 'MAGIC',
  });
  if (!packed.ok) {
    send('export:status', { text: `${packed.error}\n`, error: packed.error, done: true });
    return packed;
  }
  if (kind === 'page') {
    const opened = await shell.openPath(packed.index);
    const note = opened
      ? `The page is in the export folder. The browser said: ${opened}\n`
      : 'Opened the page in your browser. The play window inside Apprentice stays in the safe box.\n';
    send('export:status', { text: note, done: true });
    shell.showItemInFolder(packed.index);
    return { ok: true, dir: packed.dir };
  }
  send('export:status', { text: 'The app folder is ready.\n' });
  if (!runtime.npm) {
    send('export:status', {
      text: 'npm was not found, so the folder was not started. A grown-up can run npm install and npm start inside it.\n',
      done: true,
    });
    shell.showItemInFolder(packed.dir);
    return { ok: true, dir: packed.dir, started: false };
  }
  send('export:status', { text: 'Downloading Electron once, then opening the app…\n' });
  const code = await runNpm(['install'], packed.dir);
  if (code !== 0) {
    send('export:status', { text: 'npm install did not finish. The folder is still there.\n', done: true, error: 'npm install failed' });
    shell.showItemInFolder(packed.dir);
    return { ok: false, error: 'npm install failed' };
  }
  const child = spawn(runtime.npm, ['start'], {
    cwd: packed.dir,
    env: process.env,
    detached: true,
    stdio: 'ignore',
  });
  child.unref();
  send('export:status', { text: 'The app is starting in its own window.\n', done: true });
  return { ok: true, dir: packed.dir, started: true };
}

function runNpm(args, cwd) {
  return new Promise((resolve) => {
    if (exportChild) {
      try { exportChild.kill('SIGTERM'); } catch { /* already gone */ }
    }
    const child = spawn(runtime.npm, args, { cwd, env: process.env, stdio: ['ignore', 'pipe', 'pipe'] });
    exportChild = child;
    const push = (chunk) => {
      const text = chunk.toString();
      if (text.trim()) send('export:status', { text });
    };
    child.stdout.on('data', push);
    child.stderr.on('data', push);
    child.on('close', (code) => {
      if (exportChild === child) exportChild = null;
      resolve(code ?? 1);
    });
    child.on('error', () => resolve(1));
  });
}

function buildMenu() {
  const template = [
    {
      label: 'File',
      submenu: [
        { label: 'Save', accelerator: 'CmdOrCtrl+S', click: () => send('menu:command', 'save') },
        { label: 'New project', click: () => send('menu:command', 'new-project') },
        { type: 'separator' },
        { role: 'quit' },
      ],
    },
    {
      label: 'Run',
      submenu: [
        { label: 'Run', accelerator: 'F5', click: () => send('menu:command', 'run') },
        { label: 'Stop', accelerator: 'Shift+F5', click: () => send('menu:command', 'stop') },
      ],
    },
    {
      label: 'View',
      submenu: [
        { label: 'Beginner or Advanced', click: () => send('menu:command', 'mode') },
        { label: 'Light or dark', click: () => send('menu:command', 'theme') },
        { type: 'separator' },
        { role: 'reload' },
        { role: 'togglefullscreen' },
      ],
    },
    {
      label: 'Help',
      submenu: [
        { label: 'Tutorial', click: () => send('menu:command', 'tutorial') },
        { label: 'About MAGIC Apprentice', click: () => send('menu:command', 'about') },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function createWindow() {
  win = new BrowserWindow({
    width: 1280,
    height: 840,
    minWidth: 960,
    minHeight: 640,
    title: 'MAGIC Apprentice',
    backgroundColor: settings.theme === 'night' ? '#1a2230' : '#f4efe4',
    show: false,
    webPreferences: {
      preload: path.join(appRoot, 'src', 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
    },
  });
  win.once('ready-to-show', () => {
    if (!smoke) win.show();
  });
  win.on('closed', () => {
    win = null;
  });
  win.loadURL('apprentice://app/src/renderer/index.html');
}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.whenReady().then(async () => {
    const userData = app.getPath('userData');
    settingsFile = path.join(userData, 'settings.json');
    settings = loadJson(settingsFile, DEFAULTS);
    if (settings.theme !== 'night') settings.theme = 'paper';
    if (settings.mode !== 'advanced') settings.mode = 'beginner';
    library = seedLibrary(userData);
    runtime.nodePath = findNode() || process.execPath;
    runtime.magic = findMagic(appRoot);
    runtime.npm = findNpm();
    runtime.ollama = await probeOllama();
    if (settings.lastProject) {
      try {
        current = openId(settings.lastProject);
      } catch {
        current = null;
      }
    }
    if (!current) {
      const projects = listProjects(library);
      current = projects[0] || null;
    }
    blockPlayNetwork();
    protocol.handle('apprentice', async (request) => {
      const file = fromAppUrl(request.url);
      if (!file) return new Response('forbidden', { status: 403 });
      try {
        const data = await fs.promises.readFile(file);
        const type = MIME[path.extname(file).toLowerCase()] || 'application/octet-stream';
        return new Response(data, { headers: { 'Content-Type': type, 'Cache-Control': 'no-store' } });
      } catch {
        return new Response('missing', { status: 404 });
      }
    });
    registerIpc();
    buildMenu();
    createWindow();
  });

  app.on('window-all-closed', () => {
    stopRun();
    if (askAbort) askAbort.abort();
    if (exportChild) {
      try { exportChild.kill('SIGTERM'); } catch { /* already gone */ }
    }
    if (process.platform !== 'darwin') app.quit();
  });
}
