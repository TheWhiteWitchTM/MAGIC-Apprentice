const KEYWORDS = [
  'import', 'from', 'class', 'fn', 'end', 'if', 'then', 'else', 'elseif', 'for', 'while',
  'repeat', 'until', 'return', 'break', 'continue', 'let', 'print', 'and', 'or', 'not',
  'true', 'false', 'nil', 'new', 'self', 'super', 'try', 'catch', 'finally', 'throw',
  'await', 'use', 'do', 'to', 'step', 'in', 'as', 'is', 'mod', 'async',
];

const BUILTINS = ['len', 'str', 'num', 'int', 'type', 'keys', 'values', 'push', 'pop', 'time', 'error', 'sleep', 'load'];

const MODULES = [
  ['canvas', 'Pictures, sprites, and a frame loop'],
  ['terminal', 'A grid of letters'],
  ['games', 'Scores, clamp, and choices'],
  ['2d', 'Pictures and the letter grid together'],
  ['sound', 'Tones and notes'],
  ['hex', 'Hex grids'],
  ['3d', 'A 3D scene'],
  ['ui', 'Windows and buttons'],
  ['strict', 'Check the types you wrote'],
];

const DOCS = {
  print: 'Writes a line in the output box.',
  fn: 'A named recipe. end closes it.',
  end: 'Closes fn, if, for, while, class, and try.',
  let: 'Stores a name. The name ends when its block ends.',
  if: 'Chooses. == compares. = stores.',
  for: 'for i = 1 to 3, or for item in bag.',
  while: 'Repeats as long as the test is true. end closes it.',
  return: 'Hands a value back from a fn.',
  class: 'A pattern for objects. Advanced mode uses this more.',
  sprite: 'Places an emoji on a picture. It comes from @canvas.',
  clamp: 'Keeps a number between two ends. It comes from @games.',
};

let editor = null;
let mode = 'beginner';
let themesReady = false;

export function createEditor(host, theme, nextMode, onChange) {
  mode = nextMode === 'advanced' ? 'advanced' : 'beginner';
  defineThemes();
  editor = monaco.editor.create(host, {
    value: '',
    language: 'magic',
    theme: themeId(theme),
    fontSize: mode === 'beginner' ? 20 : 16,
    lineHeight: mode === 'beginner' ? 30 : 24,
    fontFamily: '"ui-monospace", "Cascadia Code", "DejaVu Sans Mono", monospace',
    minimap: { enabled: mode === 'advanced' },
    wordWrap: mode === 'beginner' ? 'on' : 'off',
    scrollBeyondLastLine: false,
    automaticLayout: true,
    tabSize: 2,
    renderWhitespace: 'none',
    padding: { top: 12, bottom: 12 },
    overviewRulerLanes: 0,
    hideCursorInOverviewRuler: true,
    scrollbar: { verticalScrollbarSize: 12, horizontalScrollbarSize: 12 },
  });
  registerMagic();
  editor.onDidChangeModelContent(() => onChange());
  return editor;
}

export function setEditorValue(text) {
  if (!editor) return;
  editor.setValue(text);
  editor.setScrollTop(0);
}

export function editorValue() {
  return editor ? editor.getValue() : '';
}

export function replaceEditor(text) {
  if (!editor) return;
  const model = editor.getModel();
  editor.pushUndoStop();
  editor.executeEdits('suggestion', [{
    range: model.getFullModelRange(),
    text,
  }]);
  editor.pushUndoStop();
}

export function setEditorTheme(theme) {
  if (editor) monaco.editor.setTheme(themeId(theme));
}

export function setEditorMode(next) {
  mode = next === 'advanced' ? 'advanced' : 'beginner';
  if (!editor) return;
  editor.updateOptions({
    fontSize: mode === 'beginner' ? 20 : 16,
    lineHeight: mode === 'beginner' ? 30 : 24,
    minimap: { enabled: mode === 'advanced' },
    wordWrap: mode === 'beginner' ? 'on' : 'off',
  });
}

export function showProblems(problems) {
  if (!editor) return;
  const model = editor.getModel();
  monaco.editor.setModelMarkers(model, 'magic', (problems || []).map((problem) => ({
    startLineNumber: problem.line || 1,
    startColumn: problem.column || 1,
    endLineNumber: problem.line || 1,
    endColumn: model.getLineMaxColumn(problem.line || 1),
    message: problem.plain || problem.message,
    severity: monaco.MarkerSeverity.Error,
  })));
}

export function revealLine(line) {
  if (!editor || !line) return;
  editor.revealLineInCenter(line);
  editor.setPosition({ lineNumber: line, column: 1 });
  editor.focus();
}

function themeId(theme) {
  return theme === 'night' ? 'apprentice-night' : 'apprentice-paper';
}

function defineThemes() {
  if (themesReady) return;
  themesReady = true;
  monaco.editor.defineTheme('apprentice-paper', {
    base: 'vs',
    inherit: true,
    rules: [
      { token: 'keyword', foreground: '0b6b4f', fontStyle: 'bold' },
      { token: 'comment', foreground: '8a7058', fontStyle: 'italic' },
      { token: 'string', foreground: 'a15c12' },
      { token: 'number', foreground: '1d5f99' },
      { token: 'annotation', foreground: '8a3d88', fontStyle: 'bold' },
      { token: 'function', foreground: '24557f' },
    ],
    colors: {
      'editor.background': '#fffaf3',
      'editor.foreground': '#2c2416',
      'editor.lineHighlightBackground': '#f6ecdc',
      'editorLineNumber.foreground': '#b5a48e',
      'editorCursor.foreground': '#0f7a4a',
      'editor.selectionBackground': '#d7ecdf',
    },
  });
  monaco.editor.defineTheme('apprentice-night', {
    base: 'vs-dark',
    inherit: true,
    rules: [
      { token: 'keyword', foreground: '7ddea8', fontStyle: 'bold' },
      { token: 'comment', foreground: 'b09a84', fontStyle: 'italic' },
      { token: 'string', foreground: 'f0a35e' },
      { token: 'number', foreground: '9fd0ff' },
      { token: 'annotation', foreground: 'e7b0e4', fontStyle: 'bold' },
      { token: 'function', foreground: 'd7ecff' },
    ],
    colors: {
      'editor.background': '#1e2838',
      'editor.foreground': '#f4ecdf',
      'editor.lineHighlightBackground': '#28344a',
      'editorLineNumber.foreground': '#8d9bb0',
      'editorCursor.foreground': '#3dbe7a',
      'editor.selectionBackground': '#24553a',
    },
  });
}

let registered = false;

function registerMagic() {
  if (registered) return;
  registered = true;
  monaco.languages.register({ id: 'magic', extensions: ['.magic'], aliases: ['MAGIC', 'magic'] });
  monaco.languages.setLanguageConfiguration('magic', {
    comments: { lineComment: '--' },
    brackets: [['(', ')'], ['[', ']'], ['{', '}']],
    autoClosingPairs: [
      { open: '(', close: ')' },
      { open: '[', close: ']' },
      { open: '{', close: '}' },
      { open: '"', close: '"', notIn: ['string'] },
    ],
    surroundingPairs: [['(', ')'], ['[', ']'], ['{', '}'], ['"', '"']],
    indentationRules: {
      increaseIndentPattern: /^\s*(fn|class|if|elseif|else|while|for|repeat|try|catch|finally)\b.*$/i,
      decreaseIndentPattern: /^\s*(end|else|elseif|catch|finally|until)\b/i,
    },
    onEnterRules: [{
      beforeText: /^\s*(fn|class|if|elseif|else|while|for|repeat|try|catch|finally)\b.*$/i,
      action: { indentAction: monaco.languages.IndentAction.Indent },
    }],
  });
  monaco.languages.setMonarchTokensProvider('magic', {
    ignoreCase: true,
    keywords: KEYWORDS,
    tokenizer: {
      root: [
        [/--.*$/, 'comment'],
        [/@[A-Za-z_][A-Za-z0-9_]*/, 'annotation'],
        [/"""/, { token: 'string', next: '@str3' }],
        [/"([^"\\]|\\.)*"/, 'string'],
        [/'([^'\\]|\\.)*'/, 'string'],
        [/\d+(?:\.\d+)?/, 'number'],
        [/\b(fn)(\s+)([A-Za-z_][\w]*)/, ['keyword', 'white', 'function']],
        [/[A-Za-z_][\w]*/, {
          cases: {
            '@keywords': 'keyword',
            '@default': 'identifier',
          },
        }],
      ],
      str3: [
        [/"""/, 'string', '@pop'],
        [/./, 'string'],
      ],
    },
  });
  monaco.languages.registerCompletionItemProvider('magic', {
    triggerCharacters: ['@'],
    provideCompletionItems(model, position) {
      const word = model.getWordUntilPosition(position);
      const range = {
        startLineNumber: position.lineNumber,
        endLineNumber: position.lineNumber,
        startColumn: word.startColumn,
        endColumn: word.endColumn,
      };
      const before = model.getLineContent(position.lineNumber).slice(0, position.column - 1);
      const suggestions = [];
      if (/@[A-Za-z0-9_]*$/.test(before)) {
        const at = before.lastIndexOf('@');
        const atRange = { ...range, startColumn: at + 1 };
        const modules = mode === 'beginner' ? MODULES.slice(0, 3) : MODULES;
        for (const [name, detail] of modules) {
          suggestions.push({
            label: `@${name}`,
            kind: monaco.languages.CompletionItemKind.Module,
            insertText: `@${name}`,
            detail,
            range: atRange,
          });
        }
        return { suggestions };
      }
      const snippet = (label, insertText, detail) => suggestions.push({
        label,
        kind: monaco.languages.CompletionItemKind.Snippet,
        insertText,
        insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
        detail,
        range,
      });
      snippet('print', 'print "${1:Hello}"', 'Write a line');
      snippet('let', 'let ${1:name} = ${2:"Ada"}', 'Store a name');
      snippet('if', 'if ${1:score} > 0 then\n\t$0\nend', 'Choose');
      snippet('for', 'for ${1:i} = 1 to ${2:3}\n\t$0\nend', 'Count');
      snippet('fn', 'fn ${1:greet}(${2:name})\n\treturn "Hello, " .. ${2:name}\nend', 'A recipe');
      if (mode === 'beginner') {
        snippet('sprite', '@canvas\n\nlet engine = new Engine({ width: 480, height: 270 })\nlet spark = engine.sprite("🌟", 240, 135, 64)\n', 'A picture');
      } else {
        for (const keyword of KEYWORDS) {
          suggestions.push({
            label: keyword,
            kind: monaco.languages.CompletionItemKind.Keyword,
            insertText: keyword,
            range,
          });
        }
        for (const name of BUILTINS) {
          suggestions.push({
            label: name,
            kind: monaco.languages.CompletionItemKind.Function,
            insertText: `${name}($0)`,
            insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
            range,
          });
        }
      }
      return { suggestions };
    },
  });
  monaco.languages.registerHoverProvider('magic', {
    provideHover(model, position) {
      const word = model.getWordAtPosition(position);
      if (!word) return null;
      const text = DOCS[word.word.toLowerCase()];
      if (!text) return null;
      return {
        contents: [{ value: text }],
        range: new monaco.Range(position.lineNumber, word.startColumn, position.lineNumber, word.endColumn),
      };
    },
  });
}
