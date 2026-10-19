import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { COACH_SYSTEM, explainSource, extractSuggestion } from '../src/shared/coach.js';
import { EXAMPLES, LESSONS, wantsWindow } from '../src/shared/catalog.js';
import { explainProblem, explainRuntime } from '../src/shared/errors.js';
import { appRoot } from '../src/paths.js';
import { copyExample, createProject, seedLibrary } from '../src/services/files.js';
import { checkSource, findMagic, findNode, packProject, startRun } from '../src/services/magic.js';
import { jail } from '../src/services/sandbox.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let failed = 0;

function check(name, condition) {
  if (condition) console.log(`ok  ${name}`);
  else {
    failed += 1;
    console.error(`FAIL ${name}`);
  }
}

check('three lessons', LESSONS.length === 3 && LESSONS.map((item) => item.example).join() === 'hello,sprite,catch');
check('examples on disk', EXAMPLES.every((item) => fs.existsSync(path.join(root, 'examples', item.folder, 'main.magic'))));
check('window detection', wantsWindow('@canvas\n') && wantsWindow('@terminal\n') && !wantsWindow('@games\nprint 1\n'));
check('plain compare error', /==/.test(explainProblem('use == to compare. = assigns a value').plain));
check('plain end error', /end/.test(explainProblem('expected end to close fn').plain));
check('plain network error', /internet/.test(explainRuntime('Apprentice blocked a network request').plain));
check('plain file error', /safe box/.test(explainRuntime("Access to this API has been restricted. Use --allow-fs-read").plain));
check('coach cannot edit', /cannot edit files/i.test(COACH_SYSTEM));
check('suggestion is a fence', extractSuggestion('Here.\n```magic\nprint "Hi"\n```\n') === 'print "Hi"');
check('prose is not a suggestion', extractSuggestion('print is a word, but this is not fenced') === '');
check('local notes mention print', explainSource('print "Hi"\n').some((line) => /print/.test(line)));

const library = seedLibrary(fs.mkdtempSync(path.join(os.tmpdir(), 'apprentice-lib-')));
const outside = path.join(os.tmpdir(), `apprentice-outside-${process.pid}`);
fs.writeFileSync(outside, 'secret');
fs.symlinkSync(outside, path.join(library, 'hello', 'secret.magic'));
let jailed = false;
try {
  jail(path.join(library, 'hello'), 'secret.magic');
} catch {
  jailed = true;
}
check('symlink cannot leave the project', jailed);
fs.unlinkSync(path.join(library, 'hello', 'secret.magic'));

const nodePath = findNode();
const magic = findMagic(appRoot);
check('finds node', Boolean(nodePath));
check('finds MAGIC', Boolean(magic.cli));

const hello = path.join(library, 'hello', 'main.magic');
const good = await checkSource({
  nodePath,
  magic,
  file: hello,
  content: null,
  projectDir: path.join(library, 'hello'),
  strict: false,
});
check('hello checks clean', good.ok);
if (!good.ok) console.error(good.problems);

const bad = await checkSource({
  nodePath,
  magic,
  file: hello,
  content: 'fn\n',
  projectDir: path.join(library, 'hello'),
  strict: false,
});
check('a broken program gets a plain problem', !bad.ok && bad.problems.length > 0 && explainProblem(bad.problems[0].message).plain.length > 0);
if (bad.ok) console.error(bad);

for (const example of EXAMPLES) {
  const file = path.join(root, 'examples', example.folder, 'main.magic');
  const result = await checkSource({
    nodePath,
    magic,
    file,
    content: null,
    projectDir: path.dirname(file),
    strict: false,
  });
  check(`${example.id} compiles`, result.ok);
  if (!result.ok) console.error(result.problems);
}

const run = await new Promise((resolve) => {
  let text = '';
  startRun({
    nodePath,
    magic,
    file: hello,
    projectDir: path.join(library, 'hello'),
    timeoutMs: 15000,
    onData: (chunk) => { text += chunk; },
    onExit: (result) => resolve({ ...result, text }),
  });
});
check('sandboxed hello prints', run.code === 0 && /Hello, world!/.test(run.text));
if (run.code !== 0) console.error(run);

const peekDir = createProject(library, 'peek').dir;
const peekFile = path.join(peekDir, 'main.magic');
fs.writeFileSync(peekFile, 'print load("/etc/passwd")\n');
const peek = await new Promise((resolve) => {
  let text = '';
  startRun({
    nodePath,
    magic,
    file: peekFile,
    projectDir: peekDir,
    timeoutMs: 15000,
    onData: (chunk) => { text += chunk; },
    onExit: (result) => resolve({ ...result, text }),
  });
});
check('reading outside the project is refused', peek.code !== 0 && /safe box|outside/i.test(`${peek.plain}\n${peek.text}`));
if (peek.code === 0) console.error(peek);

const netDir = createProject(library, 'net').dir;
const netFile = path.join(netDir, 'main.magic');
fs.writeFileSync(netFile, 'async fn main()\n  let page = await load("https://example.com")\n  print page\nend\nmain()\n');
const net = await new Promise((resolve) => {
  let text = '';
  startRun({
    nodePath,
    magic,
    file: netFile,
    projectDir: netDir,
    timeoutMs: 15000,
    onData: (chunk) => { text += chunk; },
    onExit: (result) => resolve({ ...result, text }),
  });
});
check('the network is refused', net.code !== 0 && /internet/i.test(`${net.plain}\n${net.text}`));
if (net.code === 0) console.error(net);

const packed = await packProject({
  nodePath,
  magic,
  file: path.join(root, 'examples', 'sprite', 'main.magic'),
  projectDir: path.join(root, 'examples', 'sprite'),
  outDir: path.join(library, 'sprite-page'),
  title: 'My sprite',
});
check('packs a browser page', packed.ok && fs.existsSync(packed.index) && fs.existsSync(path.join(packed.dir, 'game.js')));
if (!packed.ok) console.error(packed);

const again = copyExample(library, 'hello');
check('example copy does not wipe edits', again.id === 'hello');

if (failed) {
  console.error(`${failed} failed`);
  process.exit(1);
}
console.log('smoke ok');
