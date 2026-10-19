/** Example programs shipped with Apprentice. The files live in examples/. */

export const EXAMPLES = [
  {
    id: 'hello',
    folder: 'hello',
    title: 'Hello, world',
    emoji: '👋',
    blurb: 'Print words in the output box.',
    file: 'main.magic',
  },
  {
    id: 'sprite',
    folder: 'sprite',
    title: 'Emoji sprite',
    emoji: '🌟',
    blurb: 'Draw a star that drifts across a picture.',
    file: 'main.magic',
  },
  {
    id: 'catch',
    folder: 'catch',
    title: 'Tiny game',
    emoji: '🐱',
    blurb: 'Move a cat and catch falling stars.',
    file: 'main.magic',
  },
  {
    id: 'terminal',
    folder: 'terminal',
    title: 'Letter grid',
    emoji: '💬',
    blurb: 'Write on a terminal, one letter at a time.',
    file: 'main.magic',
  },
  {
    id: 'score',
    folder: 'score',
    title: 'Score',
    emoji: '🏆',
    blurb: 'Keep points with @games.',
    file: 'main.magic',
  },
];

export const LESSONS = [
  {
    id: 'hello',
    example: 'hello',
    title: 'Hello, world',
    text: 'Press the big Run button. The output box should say Hello, world!',
    match: /hello,\s*world/i,
  },
  {
    id: 'sprite',
    example: 'sprite',
    title: 'An emoji sprite',
    text: 'Press Run. A play window opens with a star. Close that window when you have seen it move.',
    match: null,
  },
  {
    id: 'catch',
    example: 'catch',
    title: 'A tiny game',
    text: 'Press Run. The arrow keys move the cat. Catch the stars. Close the window when you are done.',
    match: null,
  },
];

export function exampleById(id) {
  return EXAMPLES.find((item) => item.id === id) || null;
}

/** A picture or a letter grid has to open a window. Print programs stay in the output box. */
export function wantsWindow(source) {
  return /@(canvas|terminal|2d|3d|ui)\b/i.test(String(source || ''));
}
