import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { explainRuntime, parseProblems, stripAnsi } from '../shared/errors.js';
import { hookPath, permissionArgs, readRoots } from './sandbox.js';

/**
 * Calls the MAGIC compiler that already lives next to this app.
 * Nothing here parses or rewrites the language.
 */

export function findNode() {
  const found = [];
  if (process.env.npm_node_execpath) found.push(process.env.npm_node_execpath);
  const which = spawnSync('which', ['node'], { encoding: 'utf8' });
  if (which.status === 0) found.push(...which.stdout.trim().split('\n'));
  found.push('/usr/local/bin/node', '/usr/bin/node');
  for (const item of found) {
    if (!item || item.includes('electron')) continue;
    try {
      if (fs.existsSync(item) && fs.statSync(item).isFile()) return item;
    } catch {
      /* keep looking */
    }
  }
  return null;
}

export function findNpm() {
  const which = spawnSync('which', ['npm'], { encoding: 'utf8' });
  if (which.status === 0) {
    const bin = which.stdout.trim().split('\n')[0];
    if (bin && fs.existsSync(bin)) return bin;
  }
  return '';
}

export function findMagic(fromRoot) {
  const cli = path.resolve(fromRoot, '../MAGIC/dist/cli.js');
  if (fs.existsSync(cli)) {
    return {
      cli,
      root: fs.realpathSync(path.resolve(fromRoot, '../MAGIC')),
    };
  }
  const which = spawnSync('which', ['magic'], { encoding: 'utf8' });
  if (which.status === 0) {
    const bin = which.stdout.trim().split('\n')[0];
    if (bin && fs.existsSync(bin)) {
      const real = fs.realpathSync(bin);
      return { bin: real, cli: null, root: path.dirname(path.dirname(real)) };
    }
  }
  return { cli: null, bin: null, root: null };
}

export function nodeEnv(nodePath) {
  if (nodePath && nodePath === process.execPath) return { ELECTRON_RUN_AS_NODE: '1' };
  return {};
}

function compilerScript(magic) {
  if (magic?.cli && fs.existsSync(magic.cli)) return magic.cli;
  if (magic?.bin && fs.existsSync(magic.bin)) return magic.bin;
  return null;
}

export function checkSource({ nodePath, magic, file, content, projectDir, strict }) {
  return new Promise((resolve) => {
    const script = compilerScript(magic);
    if (!script || !nodePath) {
      resolve({
        ok: false,
        problems: [{
          file,
          line: 1,
          column: 1,
          message: 'The MAGIC language is not built yet. In the MAGIC folder, run npm install.',
        }],
      });
      return;
    }
    const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'apprentice-check-'));
    let target = file;
    if (typeof content === 'string') {
      target = path.join(projectDir, '.apprentice-check.magic');
      fs.writeFileSync(target, content);
    }
    const out = path.join(scratch, 'out.js');
    const args = ['compile', target, '-o', out];
    if (strict) args.push('--strict');
    const child = spawnSandboxed({
      nodePath,
      script,
      magic,
      projectDir,
      scratch,
      write: [scratch],
      args,
    });
    let stderr = '';
    let stdout = '';
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });
    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });
    const finish = (code) => {
      fs.rmSync(scratch, { recursive: true, force: true });
      fs.rmSync(path.join(projectDir, '.apprentice-check.magic'), { force: true });
      let problems = parseProblems(`${stderr}\n${stdout}`, file).map((problem) => (
        problem.file.endsWith('.apprentice-check.magic') ? { ...problem, file } : problem
      ));
      if (code !== 0 && problems.length === 0) {
        const message = stripAnsi(stderr || stdout || `MAGIC compile exited ${code}`).trim();
        problems = [{ file, line: 1, column: 1, message: message.split('\n').pop() || message }];
      }
      resolve({ ok: code === 0, problems });
    };
    child.on('close', finish);
    child.on('error', (error) => {
      stderr = error.message;
      finish(1);
    });
  });
}

export function startRun({ nodePath, magic, file, projectDir, timeoutMs, strict, onData, onExit }) {
  const script = compilerScript(magic);
  if (!script || !nodePath) {
    onExit({
      code: 1,
      plain: 'The MAGIC language is not built yet. In the MAGIC folder, run npm install, then open Apprentice again.',
      hint: '',
      raw: '',
    });
    return { stop() {} };
  }
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'apprentice-run-'));
  const runArgs = ['run', file];
  if (strict) runArgs.push('--strict');
  const child = spawnSandboxed({
    nodePath,
    script,
    magic,
    projectDir,
    scratch,
    write: [scratch],
    args: runArgs,
  });
  let stdout = '';
  let stderr = '';
  let settled = false;
  const timer = setTimeout(() => {
    if (settled) return;
    settled = true;
    try { child.kill('SIGTERM'); } catch { /* already gone */ }
    onExit({
      code: 1,
      plain: 'Stopped. This program kept running, so Apprentice paused it. A loop that never ends will do that.',
      hint: 'Press Run to try again.',
      raw: '',
      timedOut: true,
    });
  }, timeoutMs);
  const push = (chunk, stream) => {
    const text = cleanChunk(chunk.toString());
    if (!text) return;
    if (stream === 'stdout') stdout += text;
    else stderr += text;
    if (stdout.length + stderr.length > 200_000) {
      onData('\n[Output paused. It got very long.]\n');
      try { child.kill('SIGTERM'); } catch { /* already gone */ }
      return;
    }
    onData(text);
  };
  child.stdout.on('data', (chunk) => push(chunk, 'stdout'));
  child.stderr.on('data', (chunk) => push(chunk, 'stderr'));
  child.on('close', (code) => {
    clearTimeout(timer);
    fs.rm(scratch, { recursive: true, force: true }, () => {});
    if (settled) return;
    settled = true;
    if (code === 0) {
      onExit({ code: 0, plain: '', hint: '', raw: '' });
      return;
    }
    const explained = explainRuntime(`${stderr}\n${stdout}`);
    onExit({ code: code ?? 1, ...explained });
  });
  child.on('error', (error) => {
    clearTimeout(timer);
    if (settled) return;
    settled = true;
    onExit({ code: 1, plain: error.message, hint: '', raw: error.message });
  });
  return {
    stop(notify = true) {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try { child.kill('SIGTERM'); } catch { /* already gone */ }
      if (notify) onExit({ code: 1, plain: 'Stopped.', hint: '', raw: '', stopped: true });
    },
  };
}

export function packProject({ nodePath, magic, file, projectDir, outDir, title }) {
  return new Promise((resolve) => {
    const script = compilerScript(magic);
    if (!script || !nodePath) {
      resolve({ ok: false, error: 'The MAGIC language is not built yet. In the MAGIC folder, run npm install.' });
      return;
    }
    fs.rmSync(outDir, { recursive: true, force: true });
    fs.mkdirSync(outDir, { recursive: true });
    const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'apprentice-pack-'));
    const child = spawnSandboxed({
      nodePath,
      script,
      magic,
      projectDir,
      scratch,
      write: [scratch, outDir],
      args: ['app', file, '-o', outDir, '--title', title || 'MAGIC'],
    });
    let stderr = '';
    let stdout = '';
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });
    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });
    child.on('close', (code) => {
      fs.rm(scratch, { recursive: true, force: true }, () => {});
      if (code !== 0 || !fs.existsSync(path.join(outDir, 'index.html'))) {
        const explained = explainRuntime(stderr || stdout);
        resolve({ ok: false, error: explained.plain, hint: explained.hint, raw: explained.raw });
        return;
      }
      resolve({ ok: true, dir: outDir, index: path.join(outDir, 'index.html') });
    });
    child.on('error', (error) => resolve({ ok: false, error: error.message }));
  });
}

function spawnSandboxed({ nodePath, script, magic, projectDir, scratch, write, args }) {
  const nodeArgs = [
    '--import',
    hookPath(),
    ...permissionArgs({
      read: [...readRoots(magic.root), projectDir, scratch, path.dirname(script)],
      write,
    }),
    script,
    ...args,
  ];
  const env = { ...process.env };
  delete env.FORCE_COLOR;
  delete env.ELECTRON_RUN_AS_NODE;
  env.NO_COLOR = '1';
  env.TMPDIR = scratch;
  env.APPRENTICE_SANDBOX_ROOTS = [projectDir, scratch].join(path.delimiter);
  if (nodePath === process.execPath) env.ELECTRON_RUN_AS_NODE = '1';
  return spawn(nodePath, nodeArgs, {
    cwd: projectDir,
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

function cleanChunk(text) {
  return String(text)
    .replace(/\(node:\d+\) Warning:[^\n]*(?:\n|$)/g, '')
    .replace(/\(Use `node --trace-warnings[^\n]*(?:\n|$)/g, '')
    .replace(/The 'NO_COLOR' env[^\n]*(?:\n|$)/g, '');
}
