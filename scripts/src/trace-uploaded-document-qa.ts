import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { traceDocumentQa } from '../../artifacts/offline-citizen-assistant/src/lib/local-assistant.ts';

const [ocrTextFile, ...questionParts] = process.argv.slice(2);
if (!ocrTextFile) throw new Error('Usage: tsx src/trace-uploaded-document-qa.ts <ocr-text-file> [question]');
const rawOcrText = await readFile(path.resolve(ocrTextFile), 'utf8');
const question = questionParts.join(' ') || 'What is the Aadhaar number?';
console.log(JSON.stringify(traceDocumentQa(rawOcrText, question, { fileName: path.basename(ocrTextFile), language: 'en' }), null, 2));
