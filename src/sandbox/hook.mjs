/**
 * Loaded with node --import before a learner program runs.
 * Node's permission flags already block other programs, workers, and files
 * outside the project. This hook blocks the network, which those flags do not
 * cover. The MAGIC compiler itself is allowed to load its own modules.
 */
import { registerHooks } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const MESSAGE = 'Apprentice blocked a network request. Programs stay on this computer.';

globalThis.fetch = function apprenticeFetch() {
  return Promise.reject(new Error(MESSAGE));
};

const denied = new Set([
  'http',
  'https',
  'http2',
  'net',
  'tls',
  'dgram',
  'dns',
  'dns/promises',
  'quic',
]);

const roots = (process.env.APPRENTICE_SANDBOX_ROOTS || '')
  .split(path.delimiter)
  .filter(Boolean);

function sandboxed(parentURL) {
  if (!parentURL || !parentURL.startsWith('file:')) return false;
  let file = '';
  try {
    file = fileURLToPath(parentURL);
  } catch {
    return false;
  }
  return roots.some((root) => {
    const prefix = root.endsWith(path.sep) ? root : `${root}${path.sep}`;
    return file === root || file.startsWith(prefix);
  });
}

registerHooks({
  resolve(specifier, context, nextResolve) {
    const bare = specifier.startsWith('node:') ? specifier.slice(5) : specifier;
    if (denied.has(bare) && sandboxed(context.parentURL)) {
      const error = new Error(MESSAGE);
      error.code = 'ERR_ACCESS_DENIED';
      throw error;
    }
    return nextResolve(specifier, context);
  },
});
