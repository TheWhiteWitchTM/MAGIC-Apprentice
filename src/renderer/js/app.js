import { explainSource, extractSuggestion } from '../../shared/coach.js';
import { LESSONS } from '../../shared/catalog.js';
import {
  createEditor,
  editorValue,
  replaceEditor,
  revealLine,
  setEditorMode,
  setEditorTheme,
  setEditorValue,
  showProblems,
} from './editor.js';

const $ = (id) => document.getElementById(id);

const state = {
  info: null,
  file: 'main.magic',
  saved: '',
  dirty: false,
  running: false,
  output: '',
  answer: '',
  suggestion: '',
  checkTimer: 0,
};

export async function start() {
  state.info = await window.apprentice.getInfo();
  applyChrome();
  createEditor($('editor'), state.info.theme, state.info.mode, onEdit);
  bind();
  window.apprentice.on('menu:command', (command) => menu(command));
  window.apprentice.on('run:data', (payload) => appendOutput(payload.text || ''));
  window.apprentice.on('run:exit', (payload) => finishRun(payload));
  window.apprentice.on('play:closed', () => {
    if (!state.running) setRunState('Ready');
  });
  window.apprentice.on('ollama:event', (payload) => onHelper(payload));
  window.apprentice.on('export:status', (payload) => onExport(payload));
  renderLibrary();
  renderLesson();
  if (state.info.project) await openFile(state.info.project.main || 'main.magic', { fresh: true });
  $('splash').hidden = true;
  $('app').hidden = false;
  if (state.info.smoke) await smoke();
}

function bind() {
  $('save').onclick = () => save();
  $('mode').onclick = () => setMode(state.info.mode === 'beginner' ? 'advanced' : 'beginner');
  $('theme').onclick = () => setTheme(state.info.theme === 'night' ? 'paper' : 'night');
  $('help').onclick = () => showHelp();
  $('run').onclick = () => run();
  $('stop').onclick = () => window.apprentice.stop();
  $('new-project').onclick = () => newProject();
  $('new-file').onclick = () => newFile();
  $('show-folder').onclick = () => window.apprentice.showProject();
  $('strict').onchange = async () => {
    state.info = await window.apprentice.setSettings({ strict: $('strict').checked });
    scheduleCheck();
  };
  $('explain').onclick = () => explain();
  $('ask-send').onclick = () => ask($('question').value);
  $('use-suggestion').onclick = () => useSuggestion();
  $('export-page').onclick = () => exportPage();
  $('export-app').onclick = () => exportApp();
  $('question').addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      ask($('question').value);
    }
  });
}

function applyChrome() {
  document.body.dataset.theme = state.info.theme;
  document.body.dataset.mode = state.info.mode;
  $('mode').textContent = state.info.mode === 'advanced' ? 'Advanced' : 'Beginner';
  $('mode').setAttribute('aria-pressed', state.info.mode === 'advanced' ? 'true' : 'false');
  $('theme').textContent = state.info.theme === 'night' ? 'Day' : 'Night';
  $('strict').checked = state.info.strict === true;
  const project = state.info.project;
  $('project-name').textContent = project ? project.title : 'No project yet';
}

async function setMode(mode) {
  state.info = await window.apprentice.setSettings({ mode });
  applyChrome();
  setEditorMode(mode);
}

async function setTheme(theme) {
  state.info = await window.apprentice.setSettings({ theme });
  applyChrome();
  setEditorTheme(theme);
}

function renderLibrary() {
  const examples = $('examples');
  examples.replaceChildren();
  for (const example of state.info.examples) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'card';
    button.dataset.example = example.id;
    if (state.info.project?.example === example.id) button.classList.add('active');
    const emoji = document.createElement('span');
    emoji.className = 'emoji';
    emoji.textContent = example.emoji;
    const text = document.createElement('span');
    const title = document.createElement('strong');
    title.textContent = example.title;
    const blurb = document.createElement('span');
    blurb.textContent = example.blurb;
    text.append(title, blurb);
    button.append(emoji, text);
    button.onclick = () => openExample(example.id);
    examples.appendChild(button);
  }
  renderProjects();
  renderFiles();
}

async function renderProjects() {
  const projects = await window.apprentice.listProjects();
  const host = $('projects');
  host.replaceChildren();
  for (const project of projects) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'card';
    if (state.info.project?.id === project.id) button.classList.add('active');
    const title = document.createElement('strong');
    title.textContent = project.title;
    button.append(title);
    button.onclick = () => openProject(project.id);
    host.appendChild(button);
  }
}

function renderFiles() {
  const host = $('files');
  host.replaceChildren();
  const files = state.info.project?.files || [];
  for (const name of files) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'card file-btn';
    if (name === state.file) button.classList.add('active');
    button.textContent = name;
    button.onclick = () => openFile(name);
    host.appendChild(button);
  }
}

function renderLesson() {
  const host = $('lesson');
  const step = state.info.tutorialStep || 0;
  if (state.info.tutorialDismissed || step >= LESSONS.length) {
    host.hidden = true;
    host.replaceChildren();
    return;
  }
  const lesson = LESSONS[step];
  host.hidden = false;
  host.replaceChildren();
  const copy = document.createElement('div');
  copy.className = 'lesson-copy';
  const title = document.createElement('strong');
  title.textContent = `Step ${step + 1} of ${LESSONS.length} · ${lesson.title}`;
  const text = document.createElement('p');
  text.textContent = lesson.text;
  copy.append(title, text);
  const actions = document.createElement('div');
  actions.className = 'lesson-actions';
  actions.append(
    action('Show me', () => openExample(lesson.example)),
    action('Start over', () => resetLesson()),
    action('Next', () => nextLesson()),
    action('Skip', () => skipLesson()),
  );
  host.append(copy, actions);
}

function action(label, onClick) {
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = label;
  button.onclick = onClick;
  return button;
}

async function nextLesson() {
  const step = Math.min(LESSONS.length, (state.info.tutorialStep || 0) + 1);
  state.info = await window.apprentice.setSettings({ tutorialStep: step });
  renderLesson();
  const lesson = LESSONS[step];
  if (lesson) await openExample(lesson.example);
}

async function skipLesson() {
  state.info = await window.apprentice.setSettings({ tutorialDismissed: true });
  renderLesson();
}

async function resetLesson() {
  const lesson = LESSONS[state.info.tutorialStep || 0];
  if (!lesson) return;
  if (state.info.project?.example !== lesson.example) {
    await openExample(lesson.example);
  }
  const ok = await askModal({
    title: 'Start this step over?',
    body: 'This puts the example program back. Your edits in this file are replaced.',
    confirm: 'Start over',
  });
  if (!ok) return;
  await window.apprentice.resetExample();
  await openFile('main.magic', { fresh: true });
}

async function openExample(id) {
  if (state.dirty && !await confirmLose()) return;
  state.info.project = await window.apprentice.openExample(id);
  state.info = await window.apprentice.getInfo();
  applyChrome();
  renderLibrary();
  await openFile(state.info.project.main || 'main.magic', { fresh: true });
}

async function openProject(id) {
  if (state.dirty && !await confirmLose()) return;
  state.info.project = await window.apprentice.openProject(id);
  state.info = await window.apprentice.getInfo();
  applyChrome();
  renderLibrary();
  await openFile(state.info.project.main || 'main.magic', { fresh: true });
}

async function openFile(name, options = {}) {
  if (!options.fresh && state.dirty && name !== state.file && !await confirmLose()) return;
  const data = await window.apprentice.readFile(name);
  state.file = name;
  state.saved = data.content;
  setEditorValue(data.content);
  state.dirty = false;
  $('file-name').textContent = name;
  $('dirty').hidden = true;
  showProblems([]);
  clearProblem();
  renderNotes();
  renderFiles();
  scheduleCheck();
}

function onEdit() {
  const dirty = editorValue() !== state.saved;
  state.dirty = dirty;
  $('dirty').hidden = !dirty;
  renderNotes();
  scheduleCheck();
}

function scheduleCheck() {
  clearTimeout(state.checkTimer);
  state.checkTimer = setTimeout(() => check(), 700);
}

async function check() {
  if (!state.info.project) return;
  const result = await window.apprentice.check({ name: state.file, content: editorValue() });
  showProblems(result.problems || []);
  const problem = result.problems?.[0];
  if (!problem) {
    clearProblem();
    return;
  }
  const host = $('problem');
  host.hidden = false;
  host.replaceChildren();
  const title = document.createElement('strong');
  title.textContent = `Line ${problem.line}: ${problem.plain}`;
  host.appendChild(title);
  if (problem.hint) {
    const hint = document.createElement('div');
    hint.textContent = problem.hint;
    host.appendChild(hint);
  }
  if (state.info.mode === 'advanced' && problem.message) {
    const raw = document.createElement('div');
    raw.textContent = problem.message;
    host.appendChild(raw);
  }
  host.onclick = () => revealLine(problem.line);
}

function clearProblem() {
  const host = $('problem');
  host.hidden = true;
  host.replaceChildren();
}

function renderNotes() {
  const list = $('notes');
  list.replaceChildren();
  for (const note of explainSource(editorValue())) {
    const item = document.createElement('li');
    item.textContent = note;
    list.appendChild(item);
  }
  const helper = state.info.ollama?.ok
    ? `Local helper ready (${state.info.ollama.model}). It stays on this computer.`
    : 'The local helper is off. These notes come from Apprentice. Help shows how to turn the helper on.';
  $('helper-status').textContent = helper;
}

async function save() {
  if (!state.info.project) return false;
  const content = editorValue();
  await window.apprentice.writeFile(state.file, content);
  state.saved = content;
  state.dirty = false;
  $('dirty').hidden = true;
  return true;
}

async function run() {
  if (state.running) return;
  const saved = await save();
  if (!saved) return;
  state.running = true;
  state.output = '';
  $('output').textContent = '';
  setRunState('Running');
  clearProblem();
  try {
    await window.apprentice.run(state.file);
  } catch (error) {
    state.running = false;
    setRunState('Ready');
    appendOutput(`${error.message || error}\n`);
  }
}

function appendOutput(text) {
  state.output += text;
  $('output').textContent = state.output;
  $('output').scrollTop = $('output').scrollHeight;
  const lesson = LESSONS[state.info.tutorialStep || 0];
  if (lesson?.match && lesson.match.test(state.output) && state.info.project?.example === lesson.example) {
    const banner = $('lesson').querySelector('p');
    if (banner) banner.textContent = 'That worked. Press Next for the following step.';
  }
}

function finishRun(payload) {
  state.running = false;
  if (payload?.playing) {
    setRunState('Playing');
    return;
  }
  setRunState(payload?.code ? 'Stopped' : 'Done');
  if (payload?.plain && !payload.stopped) {
    appendOutput(`\n${payload.plain}\n`);
    if (payload.hint) appendOutput(`${payload.hint}\n`);
    const host = $('problem');
    host.hidden = false;
    host.replaceChildren();
    const title = document.createElement('strong');
    title.textContent = payload.plain;
    host.appendChild(title);
    if (payload.hint) {
      const hint = document.createElement('div');
      hint.textContent = payload.hint;
      host.appendChild(hint);
    }
  }
}

function setRunState(text) {
  $('run-state').textContent = text;
}

async function explain() {
  renderNotes();
  if (!state.info.ollama?.ok) {
    $('answer').textContent = 'These notes are built in. The optional helper runs on this computer when Ollama is installed. Open Help for the steps.';
    return;
  }
  await ask('What does this program do? Point at anything that might confuse a new programmer.');
}

async function ask(question) {
  const text = String(question || '').trim();
  if (!text) return;
  if (!state.info.ollama?.ok) {
    state.info.ollama = await window.apprentice.ollamaStatus();
    renderNotes();
  }
  if (!state.info.ollama?.ok) {
    $('answer').textContent = 'The local helper is not running. Apprentice will not send your program anywhere else.';
    return;
  }
  state.answer = '';
  state.suggestion = '';
  $('suggestion').hidden = true;
  $('answer').textContent = 'Thinking…';
  const problem = $('problem').innerText || '';
  await window.apprentice.ask({
    code: editorValue(),
    question: text,
    errorText: problem,
  });
}

function onHelper(payload) {
  if (payload?.text) {
    if (state.answer === '' && $('answer').textContent === 'Thinking…') $('answer').textContent = '';
    state.answer += payload.text;
    $('answer').textContent = state.answer;
  }
  if (payload?.error) {
    $('answer').textContent = payload.error;
  }
  if (payload?.done) {
    const suggestion = extractSuggestion(state.answer);
    state.suggestion = suggestion;
    $('suggestion').hidden = !suggestion;
    $('suggestion-code').textContent = suggestion;
  }
}

async function useSuggestion() {
  if (!state.suggestion) return;
  const ok = await askModal({
    title: 'Use this code?',
    body: 'This replaces the program in the editor. Apprentice does not do that unless you agree. You can undo with Ctrl+Z until you save.',
    confirm: 'Replace my code',
  });
  if (!ok) return;
  replaceEditor(state.suggestion.endsWith('\n') ? state.suggestion : `${state.suggestion}\n`);
  state.dirty = true;
  $('dirty').hidden = false;
  state.suggestion = '';
  $('suggestion').hidden = true;
  scheduleCheck();
}

async function exportPage() {
  if (state.dirty) await save();
  $('export-log').hidden = false;
  $('export-log').textContent = '';
  await window.apprentice.exportPage();
}

async function exportApp() {
  const ok = await askModal({
    title: 'Make an app?',
    body: 'This packs your program and downloads Electron once, then opens it in its own window. Your program is still the same MAGIC file.',
    confirm: 'Make the app',
  });
  if (!ok) return;
  if (state.dirty) await save();
  $('export-log').hidden = false;
  $('export-log').textContent = '';
  await window.apprentice.exportApp();
}

function onExport(payload) {
  const log = $('export-log');
  log.hidden = false;
  log.textContent += payload?.text || '';
  if (payload?.error) log.textContent += `${payload.error}\n`;
}

async function newProject() {
  const title = await askModal({
    title: 'New project',
    body: 'Give it a short name.',
    confirm: 'Create',
    input: 'My game',
  });
  if (!title) return;
  if (state.dirty && !await confirmLose()) return;
  state.info.project = await window.apprentice.createProject(title);
  state.info = await window.apprentice.getInfo();
  applyChrome();
  renderLibrary();
  await openFile('main.magic', { fresh: true });
}

async function newFile() {
  const name = await askModal({
    title: 'New file',
    body: 'A short name. Apprentice adds .magic.',
    confirm: 'Create',
    input: 'extra',
  });
  if (!name) return;
  const created = await window.apprentice.createFile(name);
  state.info = await window.apprentice.getInfo();
  renderFiles();
  await openFile(created.file);
}

async function confirmLose() {
  return askModal({
    title: 'Save first?',
    body: 'This file has unsaved edits. Continue and leave them behind?',
    confirm: 'Leave them',
    cancel: 'Stay',
  });
}

function showHelp() {
  askModal({
    title: 'MAGIC Apprentice',
    body: [
      'A safe place to learn MAGIC, for ages 8 to 16.',
      'Run prints text in the output box. @canvas, @terminal, and @games open a play window when the program draws.',
      'Beginner keeps the screen simple. Advanced adds files, a strict check, and the compiler\'s own words.',
      'Programs stay in a box: no other programs, no internet, and no files outside the project.',
      'The helper is optional and local. It explains. It changes code only after you press Use this code and agree.',
      state.info.installSteps,
    ].join('\n\n'),
    confirm: 'Close',
    cancel: '',
  });
}

function menu(command) {
  if (command === 'save') save();
  if (command === 'run') run();
  if (command === 'stop') window.apprentice.stop();
  if (command === 'mode') setMode(state.info.mode === 'beginner' ? 'advanced' : 'beginner');
  if (command === 'theme') setTheme(state.info.theme === 'night' ? 'paper' : 'night');
  if (command === 'new-project') newProject();
  if (command === 'tutorial') {
    window.apprentice.setSettings({ tutorialDismissed: false, tutorialStep: 0 }).then((info) => {
      state.info = info;
      renderLesson();
    });
  }
  if (command === 'about') showHelp();
}

function askModal({ title, body, confirm, cancel = 'Cancel', input = null }) {
  const modal = $('modal');
  $('modal-title').textContent = title;
  $('modal-body').textContent = body;
  $('modal-ok').textContent = confirm || 'OK';
  $('modal-cancel').hidden = cancel === '';
  $('modal-cancel').textContent = cancel || 'Cancel';
  const field = $('modal-input');
  if (input === null) {
    field.hidden = true;
    field.value = '';
  } else {
    field.hidden = false;
    field.value = input;
  }
  modal.hidden = false;
  if (!field.hidden) field.focus();
  else $('modal-ok').focus();
  return new Promise((resolve) => {
    const close = (value) => {
      modal.hidden = true;
      $('modal-ok').onclick = null;
      $('modal-cancel').onclick = null;
      resolve(value);
    };
    $('modal-ok').onclick = () => close(input === null ? true : field.value.trim());
    $('modal-cancel').onclick = () => close(input === null ? false : '');
  });
}

async function smoke() {
  const result = {
    ok: false,
    run: false,
    editor: !!document.querySelector('.monaco-editor'),
    examples: document.querySelectorAll('[data-example]').length,
    lesson: document.querySelector('#lesson strong')?.textContent || '',
    mode: document.body.dataset.mode,
    theme: document.body.dataset.theme,
  };
  try {
    await openExample('hello');
    await run();
    const started = Date.now();
    while (state.running && Date.now() - started < 20000) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    result.run = /Hello, world!/.test($('output').textContent);
    result.output = $('output').textContent.slice(0, 200);
  } catch (error) {
    result.error = String(error && error.stack || error);
  }
  result.ok = result.editor && result.examples >= 3 && result.run && result.mode === 'beginner' && /Hello, world/.test(result.lesson);
  window.apprentice.smokeDone(result);
}
