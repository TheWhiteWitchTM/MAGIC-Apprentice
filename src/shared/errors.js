/** Turn compiler and sandbox text into sentences a learner can use. */

const RULES = [
  {
    test: /use == to compare/i,
    plain: '= stores a value. To ask whether two things are the same, write ==.',
    hint: 'Try score == 0',
  },
  {
    test: /this value is unused/i,
    plain: 'That line works out a value and then throws it away.',
    hint: 'Print it, or store it with =.',
  },
  {
    test: /this cannot be assigned/i,
    plain: 'The left side of = has to be a name you can store into.',
    hint: 'Write score = 1, not 1 = score.',
  },
  {
    test: /expected end|needs an? end/i,
    plain: 'A block is still open. if, for, while, fn, and class close with the word end.',
    hint: 'Put end on its own line under the block.',
  },
  {
    test: /already declared/i,
    plain: 'That name is already used here.',
    hint: 'Pick a new name, or remove the extra let.',
  },
  {
    test: /already a parameter/i,
    plain: 'That parameter name is used twice.',
    hint: 'Each name in the parentheses has to be different.',
  },
  {
    test: /is a Magic word/i,
    plain: 'That word belongs to MAGIC. Pick a different name.',
    hint: 'if, end, for, and print are words you cannot use as names.',
  },
  {
    test: /is reserved/i,
    plain: 'That name is reserved. Pick a different one.',
    hint: 'A plain word like score or player is a good name.',
  },
  {
    test: /this string never ends|a string has to end|unknown escape/i,
    plain: 'A quote was opened and not closed.',
    hint: 'Every " needs a matching " on the same line.',
  },
  {
    test: /interpolation never ends|interpolation is empty|interpolation has extra/i,
    plain: 'A fill-in brace inside text is not finished.',
    hint: 'Write $"Hello, {name}" with one value inside the braces.',
  },
  {
    test: /cannot find/i,
    plain: 'MAGIC could not find that file or module.',
    hint: 'Check the spelling. Picture, letters, and scores start with @canvas, @terminal, and @games.',
  },
  {
    test: /comes from both/i,
    plain: 'Two modules are trying to use the same name.',
    hint: 'Give the second one a nickname, like @terminal as term.',
  },
  {
    test: /module annotation belongs at the top/i,
    plain: '@canvas, @terminal, and @games belong at the top of the file.',
    hint: 'Move that line above the rest of the program.',
  },
  {
    test: /does not take arguments/i,
    plain: 'Write the module name with no parentheses.',
    hint: '@canvas is enough.',
  },
  {
    test: /return belongs inside/i,
    plain: 'return belongs inside a fn.',
    hint: 'Put it between fn name() and end.',
  },
  {
    test: /break belongs inside|continue belongs inside/i,
    plain: 'break and continue belong inside a loop.',
    hint: 'Use them in for, while, or repeat.',
  },
  {
    test: /for i = start to stop/i,
    plain: 'A for loop looks like for i = 1 to 10, or for item in bag.',
    hint: 'Check the word to or the word in.',
  },
  {
    test: /this function needs a name/i,
    plain: 'This function needs a name.',
    hint: 'Write fn greet(), then end.',
  },
  {
    test: /try needs catch or finally/i,
    plain: 'try needs catch or finally.',
    hint: 'catch runs when something goes wrong.',
  },
  {
    test: /await belongs inside/i,
    plain: 'await belongs inside an async fn.',
    hint: 'Write async fn main() and call main() on its own line.',
  },
  {
    test: /belongs at the top of the script/i,
    plain: 'That line belongs at the top of the file, before other code.',
    hint: 'Move it up so it is not inside fn, if, or for.',
  },
  {
    test: /push expects a list|pop expects a list/i,
    plain: 'push and pop work on a list, like bag = ["a", "b"].',
    hint: 'Check that the value before push or pop is a list.',
  },
  {
    test: /unexpected (.+)/i,
    plain: (match) => `MAGIC did not expect ${cleanToken(match[1])} here.`,
    hint: 'Look at the line above. A quote, a parenthesis, or an end may be missing.',
  },
  {
    test: /expected (.+)/i,
    plain: (match) => `MAGIC expected ${cleanToken(match[1])}.`,
    hint: 'Check the spelling, and the line just above this one.',
  },
];

function cleanToken(text) {
  const value = String(text || '').replace(/\s+/g, ' ').trim();
  if (!value || value.length > 80) return 'something else';
  return value;
}

export function explainProblem(message) {
  const raw = String(message || '').trim();
  for (const rule of RULES) {
    const match = raw.match(rule.test);
    if (!match) continue;
    const plain = typeof rule.plain === 'function' ? rule.plain(match) : rule.plain;
    return { plain, hint: rule.hint, raw };
  }
  if (!raw) {
    return { plain: 'MAGIC found a problem.', hint: 'Check the highlighted line.', raw };
  }
  return {
    plain: 'MAGIC stopped on this line.',
    hint: raw.length > 180 ? `${raw.slice(0, 180)}…` : raw,
    raw,
  };
}

export function explainRuntime(text) {
  const raw = stripAnsi(String(text || '')).trim();
  if (!raw) return { plain: 'The program stopped.', hint: '', raw };
  if (/blocked a network request|ECONN|ENET|getaddrinfo/i.test(raw)) {
    return {
      plain: 'This program tried to use the internet. Apprentice keeps programs on this computer.',
      hint: 'Take out load of a web address.',
      raw,
    };
  }
  if (/child process|ChildProcess|allow-child-process/i.test(raw)) {
    return {
      plain: 'This program tried to start another program. Apprentice does not allow that.',
      hint: 'Programs here can print, draw, and keep score.',
      raw,
    };
  }
  if (/FileSystemRead|allow-fs-read/i.test(raw)) {
    return {
      plain: 'This program tried to read a file outside the project. Apprentice keeps programs in a safe box.',
      hint: 'You can load a file that sits next to your program.',
      raw,
    };
  }
  if (/FileSystemWrite|allow-fs-write/i.test(raw)) {
    return {
      plain: 'This program tried to change a file outside the safe box.',
      hint: 'Print the result instead of writing a file.',
      raw,
    };
  }
  if (/WorkerThreads|allow-worker/i.test(raw)) {
    return {
      plain: 'This program tried to start a background worker. Apprentice does not allow that.',
      hint: '',
      raw,
    };
  }
  const problemLine = raw.split(/\r?\n/).find((line) => /:\d+:\d+\s+/.test(line));
  if (problemLine) {
    const message = problemLine.replace(/^.*:\d+:\d+\s+/, '');
    const explained = explainProblem(message);
    return explained;
  }
  const tail = raw.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).slice(-4).join(' ');
  return {
    plain: 'The program hit a problem while it was running.',
    hint: tail.length > 220 ? `${tail.slice(0, 220)}…` : tail,
    raw,
  };
}

export function stripAnsi(text) {
  return String(text).replace(/\x1B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])/g, '');
}

/** Pull `file:line:column message` rows out of a compiler log. */
export function parseProblems(text, fallbackFile = '') {
  const problems = [];
  const seen = new Set();
  for (const rawLine of String(text || '').split(/\r?\n/)) {
    const line = stripAnsi(rawLine).trim();
    if (!line) continue;
    const match = line.match(/^(.*?):(\d+):(\d+)\s+([\s\S]+)$/);
    if (!match) continue;
    let file = match[1].trim();
    if (!file || file.includes('://') || file.startsWith('at ')) continue;
    const problem = {
      file: file || fallbackFile,
      line: Number(match[2]),
      column: Number(match[3]),
      message: match[4].trim(),
    };
    if (!problem.message || !Number.isFinite(problem.line)) continue;
    const key = `${problem.file}:${problem.line}:${problem.column}:${problem.message}`;
    if (seen.has(key)) continue;
    seen.add(key);
    problems.push(problem);
  }
  return problems;
}
