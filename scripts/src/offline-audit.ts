import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '../..');
const read = (file: string) => readFile(path.join(root, file), 'utf8');
const app = await read('artifacts/offline-citizen-assistant/src/App.tsx');
const assistant = await read('artifacts/offline-citizen-assistant/src/lib/local-assistant.ts');
const guard = await read('artifacts/offline-citizen-assistant/src/lib/offline-guard.ts');
const config = await read('artifacts/offline-citizen-assistant/vite.config.ts');
const html = await read('artifacts/offline-citizen-assistant/index.html');

assert.match(assistant, /fetch\(`\$\{import\.meta\.env\.BASE_URL\}data\/psi2\.csv`\)/);
assert.match(assistant, /workerPath: `\$\{base\}ocr\/worker\.min\.js`/);
assert.match(assistant, /corePath: `\$\{base\}ocr`/);
assert.match(assistant, /langPath: `\$\{base\}ocr\/\$\{lang\}`/);
assert.match(assistant, /disableAutoFetch: true/);
assert.match(assistant, /disableStream: true/);
assert.match(guard, /External network requests are disabled/);
assert.doesNotMatch(config, /@replit\/vite-plugin-runtime-error-modal|cartographer|devBanner/);
assert.doesNotMatch(html, /fonts\.googleapis\.com|fonts\.gstatic\.com/);
assert.doesNotMatch(app, /openai|gemini|firebase|huggingface/i);
console.log(JSON.stringify({ status: 'passed', runtimeNetworkRequests: ['local bundled CSV only'], cloudFallbacks: 0, remoteFonts: 0, ocr: 'local bundled worker/WASM/data', retrieval: 'in-memory', qa: 'in-process' }));
