import fs from 'node:fs';
import path from 'node:path';

export const DEFAULTS = {
  theme: 'paper',
  mode: 'beginner',
  tutorialStep: 0,
  tutorialDismissed: false,
  strict: false,
  lastProject: '',
  aiModel: '',
};

export function loadJson(file, fallback) {
  try {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (fallback && typeof fallback === 'object' && !Array.isArray(fallback) && parsed && typeof parsed === 'object') {
      return { ...fallback, ...parsed };
    }
    return parsed;
  } catch {
    return fallback;
  }
}

export function saveJson(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const next = `${JSON.stringify(data, null, 2)}\n`;
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, next);
  fs.renameSync(tmp, file);
}
