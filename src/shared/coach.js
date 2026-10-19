/**
 * The local helper explains code. It never receives permission to edit.
 * A suggestion is only a fenced draft the learner can accept.
 */

export const COACH_SYSTEM = `You are the helper inside MAGIC Apprentice, a programming tool for ages 8 to 16.
MAGIC looks like BASIC mixed with Lua. @canvas draws pictures, @terminal draws a letter grid, and @games has scores, clamps, and loops. end closes if, for, while, fn, and class. = stores a value. == compares. print writes a line. Indexes start at 0.
Explain in short, kind sentences. Use words a ten-year-old can follow, without talking down.
You cannot edit files. You cannot run commands. You cannot change the learner's program yourself.
If a change would help, show one complete program inside a single magic code fence and tell them they can press Use this code if they want it. Their file stays as it is until they choose.
Do not invent shell commands. Do not tell them to download anything unless they ask how to turn this helper on.
If you are unsure, say so.`;

export function explainSource(source) {
  const text = String(source || '');
  const notes = [];
  if (/^\s*print\b/im.test(text)) notes.push('print writes a line in the output box.');
  if (/@canvas\b/i.test(text)) notes.push('@canvas draws pictures. Run opens a play window.');
  if (/@terminal\b/i.test(text)) notes.push('@terminal draws a grid of letters in a play window.');
  if (/@games\b/i.test(text)) notes.push('@games gives you scores, clamp, and lists of choices.');
  if (/\bfn\b/i.test(text)) notes.push('fn starts a recipe you can call. end closes it.');
  if (/\bfor\b/i.test(text)) notes.push('for repeats lines. for i = 1 to 3 visits 1, then 2, then 3.');
  if (/\bif\b/i.test(text)) notes.push('if chooses. == compares two values. = stores a value.');
  if (/sprite\s*\(/.test(text)) notes.push('sprite places an emoji on the picture.');
  if (/isKeyDown/.test(text)) notes.push('isKeyDown is true while that key is held. ArrowLeft and ArrowRight are the arrow keys.');
  if (/new Score/.test(text)) notes.push('Score remembers the points and the best total. add raises it.');
  if (!notes.length) notes.push('This is a MAGIC program. Press Run to start it.');
  return notes;
}

/** The last fenced program in a helper reply, if it looks like MAGIC. */
export function extractSuggestion(text) {
  const fences = [...String(text || '').matchAll(/```(?:magic|MAGIC)?[^\n]*\n([\s\S]*?)```/g)];
  if (!fences.length) return '';
  const body = String(fences[fences.length - 1][1] || '').replace(/\s+$/, '').replace(/^\n/, '');
  if (!body || body.length > 20000) return '';
  if (!/(@canvas|@terminal|@games|\bprint\b|\bfn\b|\blet\b|\bend\b)/i.test(body)) return '';
  return body;
}
