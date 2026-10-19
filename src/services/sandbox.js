import fs from 'node:fs';
import path from 'node:path';
import { appRoot } from '../paths.js';

const ENGINE_DIRS = ['emoji-engine-2d', 'emoji-engine-3d', 'emoji-engine-ui'];

/** Resolve a path that must stay inside root. Symlinks that leave root are refused. */
export function jail(root, target = '.') {
  if (!root) throw new Error('Open a project first.');
  const base = fs.realpathSync(root);
  const abs = path.resolve(base, target || '.');
  const relative = path.relative(base, abs);
  if (relative === '') return base;
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error('That path is outside this project.');
  }
  const parts = relative.split(path.sep).filter(Boolean);
  let cursor = base;
  for (const part of parts) {
    if (part === '.' || part === '..') throw new Error('That path is outside this project.');
    cursor = path.join(cursor, part);
    if (!fs.existsSync(cursor)) continue;
    const real = fs.realpathSync(cursor);
    const relReal = path.relative(base, real);
    if (relReal.startsWith('..') || path.isAbsolute(relReal)) {
      throw new Error('That path is outside this project.');
    }
    cursor = real;
  }
  return cursor;
}

export function readRoots(magicRoot) {
  const roots = new Set();
  addRoot(roots, magicRoot);
  for (const name of ENGINE_DIRS) {
    addRoot(roots, path.resolve(appRoot, '..', name));
    if (magicRoot) addRoot(roots, path.resolve(magicRoot, 'node_modules', name));
  }
  addRoot(roots, path.join(appRoot, 'src', 'sandbox'));
  return [...roots];
}

function addRoot(roots, dir) {
  if (!dir) return;
  try {
    const real = fs.realpathSync(dir);
    if (fs.statSync(real).isDirectory()) roots.add(real);
  } catch {
    /* optional install path */
  }
}

/**
 * Flags for one sandboxed compiler or run.
 * Write access is only the scratch directory and, for a pack, the export folder.
 */
export function permissionArgs({ read, write }) {
  const args = ['--permission'];
  const reads = new Set(read.filter(Boolean));
  const writes = new Set(write.filter(Boolean));
  for (const dir of writes) reads.add(dir);
  for (const dir of reads) args.push(`--allow-fs-read=${dir}`);
  for (const dir of writes) args.push(`--allow-fs-write=${dir}`);
  return args;
}

export function hookPath() {
  return path.join(appRoot, 'src', 'sandbox', 'hook.mjs');
}
