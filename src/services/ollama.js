import { COACH_SYSTEM } from '../shared/coach.js';

const HOST = 'http://127.0.0.1:11434';

export function helperHost() {
  return HOST;
}

export async function probeOllama() {
  const empty = { ok: false, host: HOST, models: [], model: '' };
  try {
    const response = await fetch(`${HOST}/api/tags`, { signal: AbortSignal.timeout(800) });
    if (!response.ok) return empty;
    const body = await response.json();
    const models = (body.models || []).map((item) => item.name).filter(Boolean);
    return { ok: models.length > 0, host: HOST, models, model: pickModel(models) };
  } catch {
    return empty;
  }
}

export function pickModel(models, preferred = '') {
  const list = models || [];
  if (preferred && list.includes(preferred)) return preferred;
  const ranked = ['helper:latest', 'helper', 'coder:latest', 'coder', 'qwen2.5-coder', 'qwen', 'llama', 'mistral'];
  for (const hint of ranked) {
    const found = list.find((name) => name === hint || name.startsWith(`${hint}:`) || name.includes(hint));
    if (found) return found;
  }
  return list[0] || '';
}

export async function streamExplain({ model, code, question, errorText, signal, onText }) {
  const response = await fetch(`${HOST}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      stream: true,
      messages: [
        { role: 'system', content: COACH_SYSTEM },
        {
          role: 'user',
          content: [
            'Explain this MAGIC program. Do not change it yourself.',
            errorText ? `The learner saw this problem:\n${errorText}` : '',
            question ? `They asked: ${question}` : 'Say what the program does, one idea at a time.',
            'Program:',
            code || '(empty)',
          ].filter(Boolean).join('\n\n'),
        },
      ],
    }),
    signal,
  });
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(detail.slice(0, 240) || `The helper returned ${response.status}`);
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let full = '';
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let index = buffer.indexOf('\n');
    while (index >= 0) {
      const line = buffer.slice(0, index).trim();
      buffer = buffer.slice(index + 1);
      if (line) {
        const message = JSON.parse(line);
        if (message.error) throw new Error(String(message.error));
        const chunk = message.message?.content || '';
        if (chunk) {
          full += chunk;
          onText(chunk);
        }
      }
      index = buffer.indexOf('\n');
    }
  }
  return full;
}

export const INSTALL_STEPS = `The helper is optional. It stays on this computer and only talks to 127.0.0.1.

Install Ollama, then pull a small model:

curl -fsSL https://ollama.com/install.sh | sh
ollama pull qwen2.5-coder:3b
ollama create helper -f ai/helper.Modelfile

Apprentice still explains programs without it. The helper cannot edit a file. A suggestion appears only if you press Use this code and confirm.`;
