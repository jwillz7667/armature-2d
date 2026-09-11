// Executes the shipped worker's startup in a browser-like global without Node require/Buffer/stream.
// This catches the audited pngjs startup crash even when bundling itself succeeds with warnings.
import { readFile, readdir } from 'node:fs/promises';
import { Script, createContext } from 'node:vm';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const directory = fileURLToPath(new URL('../apps/editor/out/renderer/assets/', import.meta.url));
const files = (await readdir(directory)).filter((file) =>
  /^video-encoder\.worker-.*\.js$/.test(file),
);
if (files.length !== 1) throw new Error(`Expected one built video worker, found ${files.length}`);
const listeners = [];
const context = createContext({
  TextEncoder,
  TextDecoder,
  Uint8Array,
  ArrayBuffer,
  performance,
  setTimeout,
  clearTimeout,
  postMessage: () => {},
  addEventListener: (type, callback) => listeners.push({ type, callback }),
});
const code = await readFile(join(directory, files[0]), 'utf8');
new Script(code, { filename: files[0] }).runInContext(context, { timeout: 10000 });
if (!listeners.some((listener) => listener.type === 'message'))
  throw new Error('Video worker did not register its message handler');
console.log('Built video worker starts without Node globals and registers its message handler.');
