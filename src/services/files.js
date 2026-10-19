import fs from 'node:fs';
import path from 'node:path';
import { appRoot } from '../paths.js';
import { EXAMPLES, exampleById } from '../shared/catalog.js';
import { jail } from './sandbox.js';

const STARTER = 'print "Hello"\n';

export function libraryDir(userData) {
  const dir = path.join(userData, 'library');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export function seedLibrary(userData) {
  const library = libraryDir(userData);
  if (fs.readdirSync(library).length === 0) copyExample(library, 'hello');
  return library;
}

export function listProjects(library) {
  const names = fs.readdirSync(library, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith('.'))
    .map((entry) => entry.name);
  const projects = names.map((name) => describe(library, name)).filter(Boolean);
  projects.sort((a, b) => a.title.localeCompare(b.title));
  return projects;
}

export function copyExample(library, id) {
  const example = exampleById(id);
  if (!example) throw new Error('That example is not in Apprentice.');
  const source = path.join(appRoot, 'examples', example.folder);
  const dest = path.join(library, example.folder);
  if (!fs.existsSync(dest)) {
    fs.mkdirSync(dest, { recursive: true });
    for (const name of ['main.magic', 'project.json']) {
      fs.copyFileSync(path.join(source, name), path.join(dest, name));
    }
  }
  return describe(library, example.folder);
}

export function createProject(library, title) {
  const name = uniqueFolder(library, slug(title) || 'project');
  const dir = path.join(library, name);
  fs.mkdirSync(dir);
  const cleanTitle = String(title || '').trim().slice(0, 40) || 'My project';
  fs.writeFileSync(path.join(dir, 'project.json'), `${JSON.stringify({ title: cleanTitle, example: '' }, null, 2)}\n`);
  fs.writeFileSync(path.join(dir, 'main.magic'), STARTER);
  return describe(library, name);
}

export function resetExample(library, folder) {
  const project = describe(library, folder);
  if (!project?.example) throw new Error('Only an example can be started over.');
  const example = exampleById(project.example);
  if (!example) throw new Error('That example is not in Apprentice.');
  const source = path.join(appRoot, 'examples', example.folder, 'main.magic');
  const dest = jail(path.join(library, folder), 'main.magic');
  fs.copyFileSync(source, dest);
  return dest;
}

export function describe(library, folder) {
  const dir = path.join(library, folder);
  if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) return null;
  const meta = readMeta(dir);
  const file = path.join(dir, 'main.magic');
  return {
    id: folder,
    title: meta.title || folder,
    example: meta.example || '',
    dir,
    main: fs.existsSync(file) ? file : '',
  };
}

export function listMagic(projectDir) {
  const dir = jail(projectDir, '.');
  return fs.readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.magic') && !entry.name.startsWith('.'))
    .map((entry) => entry.name)
    .sort();
}

export function readProjectFile(projectDir, name) {
  const file = magicFile(projectDir, name);
  return { file, content: fs.readFileSync(file, 'utf8') };
}

export function writeProjectFile(projectDir, name, content) {
  const file = magicFile(projectDir, name);
  const text = String(content ?? '');
  if (text.length > 500_000) throw new Error('That program is too long for Apprentice.');
  fs.writeFileSync(file, text);
  return file;
}

export function createMagicFile(projectDir, name) {
  const base = slug(name).replace(/-/g, '_') || 'program';
  const fileName = uniqueFile(projectDir, base);
  const file = jail(projectDir, fileName);
  fs.writeFileSync(file, 'print "Hello"\n');
  return fileName;
}

export function exampleSources() {
  return EXAMPLES.map((example) => ({
    ...example,
    source: fs.readFileSync(path.join(appRoot, 'examples', example.folder, example.file), 'utf8'),
  }));
}

function magicFile(projectDir, name) {
  const base = path.basename(String(name || 'main.magic'));
  if (!/^[\w.-]+\.magic$/i.test(base) || base.startsWith('.')) {
    throw new Error('Use a simple name that ends in .magic.');
  }
  return jail(projectDir, base);
}

function readMeta(dir) {
  try {
    const parsed = JSON.parse(fs.readFileSync(path.join(dir, 'project.json'), 'utf8'));
    return {
      title: typeof parsed.title === 'string' ? parsed.title : '',
      example: typeof parsed.example === 'string' ? parsed.example : '',
    };
  } catch {
    return { title: '', example: '' };
  }
}

function slug(title) {
  return String(title || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40);
}

function uniqueFolder(library, base) {
  let name = base;
  let n = 2;
  while (fs.existsSync(path.join(library, name))) {
    name = `${base}-${n}`;
    n += 1;
  }
  return name;
}

function uniqueFile(projectDir, base) {
  let name = `${base}.magic`;
  let n = 2;
  while (fs.existsSync(path.join(projectDir, name))) {
    name = `${base}_${n}.magic`;
    n += 1;
  }
  return name;
}
