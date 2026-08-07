import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

type QaRow = { qid: string; lang: string; type: 'extraction' | 'reasoning'; answer: string };
type Prediction = { qid: string; quantization: string; answer: string };
type Metric = { correct: number; total: number; accuracy: number | null };

const root = path.resolve(import.meta.dirname, '../..');
const argument = (name: string, fallback: string) => process.argv.slice(2).find((value) => value.startsWith(`${name}=`))?.slice(name.length + 1) ?? fallback;
const qaPath = path.resolve(root, argument('--qa', '../artifacts/offline-citizen-assistant/public/data/psi2.csv'));
const predictionsPath = path.resolve(root, argument('--predictions', 'reports/predictions.csv'));
const outDir = path.resolve(root, argument('--out', 'reports'));

function csv(text: string) {
  const rows: string[][] = []; let row: string[] = []; let cell = ''; let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (char === '"' && text[index + 1] === '"') { cell += '"'; index += 1; }
    else if (char === '"') quoted = !quoted;
    else if (char === ',' && !quoted) { row.push(cell); cell = ''; }
    else if ((char === '\n' || char === '\r') && !quoted) { if (char === '\r' && text[index + 1] === '\n') index += 1; row.push(cell); if (row.some(Boolean)) rows.push(row); row = []; cell = ''; }
    else cell += char;
  }
  row.push(cell); if (row.some(Boolean)) rows.push(row);
  const [header, ...body] = rows;
  return body.map((values) => Object.fromEntries(header.map((key, index) => [key.trim(), (values[index] ?? '').trim()])));
}

const normalize = (value: string) => value.normalize('NFKC').toLocaleLowerCase().replace(/[\p{P}\p{S}\s]+/gu, ' ').trim();
const metric = (rows: Array<{ answer: string; prediction?: string }>): Metric => {
  const correct = rows.filter((row) => row.prediction !== undefined && normalize(row.answer) === normalize(row.prediction)).length;
  const answered = rows.filter((row) => row.prediction !== undefined).length;
  return { correct, total: rows.length, accuracy: answered === rows.length && rows.length ? correct / rows.length : null };
};

const qa = (await readFile(qaPath, 'utf8')).replace(/^\uFEFF/, '');
const records = csv(qa).map((row) => ({ qid: row.qid, lang: row.lang, type: row.type as QaRow['type'], answer: row.answer })).filter((row) => row.qid && row.answer);
let predictions: Prediction[] = [];
try {
  predictions = csv(await readFile(predictionsPath, 'utf8')).map((row) => ({ qid: row.qid, quantization: row.quantization, answer: row.answer })).filter((row) => row.qid && row.quantization);
} catch { /* A missing prediction file is a valid, explicitly reported not-run state. */ }

const languages = [...new Set(records.map((record) => record.lang))].sort();
const quantizations = [...new Set(predictions.map((prediction) => prediction.quantization))].sort();
const results = quantizations.map((quantization) => {
  const byId = new Map(predictions.filter((prediction) => prediction.quantization === quantization).map((prediction) => [prediction.qid, prediction.answer]));
  const evaluated = records.map((record) => ({ ...record, prediction: byId.get(record.qid) }));
  return {
    quantization,
    coverage: evaluated.filter((record) => record.prediction !== undefined).length / evaluated.length,
    overall: metric(evaluated),
    byType: Object.fromEntries(['extraction', 'reasoning'].map((type) => [type, metric(evaluated.filter((record) => record.type === type))])),
    byLanguage: Object.fromEntries(languages.map((language) => [language, metric(evaluated.filter((record) => record.lang === language))])),
  };
});

const report = { generatedAt: new Date().toISOString(), dataset: path.relative(root, qaPath), records: records.length, status: results.length ? 'complete' : 'missing-predictions', requiredPredictionColumns: ['qid', 'quantization', 'answer'], results };
const pct = (value: number | null) => value === null ? 'not measured' : `${(value * 100).toFixed(2)}%`;
const lines = ['# PS-I2 accuracy report', '', `Dataset: \`${report.dataset}\` (${records.length} rows)`, `Status: **${report.status}**`, '', '| Quantization | Coverage | Overall | Extraction | Reasoning |', '|---|---:|---:|---:|---:|', ...results.map((result) => `| ${result.quantization} | ${(result.coverage * 100).toFixed(2)}% | ${pct(result.overall.accuracy)} | ${pct(result.byType.extraction.accuracy)} | ${pct(result.byType.reasoning.accuracy)} |`), '', '## Per-language accuracy', '', ...results.flatMap((result) => [`### ${result.quantization}`, '', '| Language | Accuracy | Correct / total |', '|---|---:|---:|', ...languages.map((language) => { const value = result.byLanguage[language]; return `| ${language} | ${pct(value.accuracy)} | ${value.correct} / ${value.total} |`; }), '']), ...(results.length ? [] : ['No results were fabricated. Run a local model at each quantization and provide `qid,quantization,answer` predictions.'])];
await mkdir(outDir, { recursive: true });
await writeFile(path.join(outDir, 'accuracy.json'), `${JSON.stringify(report, null, 2)}\n`);
await writeFile(path.join(outDir, 'accuracy.md'), `${lines.join('\n')}\n`);
console.log(`Wrote ${path.join(outDir, 'accuracy.{json,md}')}`);
