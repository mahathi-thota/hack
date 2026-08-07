import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

type Sample = { lang: string; words: number; sentences: number; beforeTokens: number; afterTokens: number };
const root = path.resolve(import.meta.dirname, '../..');
const argument = (name: string, fallback: string) => process.argv.slice(2).find((value) => value.startsWith(`${name}=`))?.slice(name.length + 1) ?? fallback;
const input = path.resolve(root, argument('--input', 'reports/tokenizer-samples.csv'));
const outDir = path.resolve(root, argument('--out', 'reports'));
let samples: Sample[] = [];
try {
  const [header, ...rows] = (await readFile(input, 'utf8')).trim().split(/\r?\n/).filter(Boolean).map((line) => line.split(','));
  const columns = Object.fromEntries(header.map((name, index) => [name.trim(), index]));
  samples = rows.map((row) => ({ lang: row[columns.lang] ?? '', words: Number(row[columns.words]), sentences: Number(row[columns.sentences]), beforeTokens: Number(row[columns.before_tokens]), afterTokens: Number(row[columns.after_tokens]) })).filter((sample) => sample.lang && sample.words > 0 && sample.sentences > 0 && sample.beforeTokens >= 0 && sample.afterTokens >= 0);
} catch { /* no tokenizer output has been supplied */ }
const languages = [...new Set(samples.map((sample) => sample.lang))].sort();
const report = { generatedAt: new Date().toISOString(), status: samples.length ? 'complete' : 'missing-tokenizer-samples', methodology: 'Supply real tokenizer counts for identical text before and after the tokenizer intervention. Fertility is tokens per word.', rows: languages.map((lang) => {
  const values = samples.filter((sample) => sample.lang === lang); const words = values.reduce((total, value) => total + value.words, 0); const sentences = values.reduce((total, value) => total + value.sentences, 0); const before = values.reduce((total, value) => total + value.beforeTokens, 0); const after = values.reduce((total, value) => total + value.afterTokens, 0);
  return { lang, samples: values.length, before: { averageTokensPerWord: before / words, averageTokensPerSentence: before / sentences, fertility: before / words }, after: { averageTokensPerWord: after / words, averageTokensPerSentence: after / sentences, fertility: after / words } };
}) };
const value = (number: number) => number.toFixed(3);
const markdown = ['# PS-I2 tokenizer fertility report', '', `Status: **${report.status}**`, '', '| Language | Samples | Before tokens/word | Before tokens/sentence | Before fertility | After tokens/word | After tokens/sentence | After fertility |', '|---|---:|---:|---:|---:|---:|---:|---:|', ...report.rows.map((row) => `| ${row.lang} | ${row.samples} | ${value(row.before.averageTokensPerWord)} | ${value(row.before.averageTokensPerSentence)} | ${value(row.before.fertility)} | ${value(row.after.averageTokensPerWord)} | ${value(row.after.averageTokensPerSentence)} | ${value(row.after.fertility)} |`), ...(report.rows.length ? [] : ['', 'No tokenizer values were estimated. Export counts from the selected model tokenizer for the same seven-language fertility probe.'])];
await mkdir(outDir, { recursive: true });
await writeFile(path.join(outDir, 'tokenizer.json'), `${JSON.stringify(report, null, 2)}\n`);
await writeFile(path.join(outDir, 'tokenizer.md'), `${markdown.join('\n')}\n`);
console.log(`Wrote ${path.join(outDir, 'tokenizer.{json,md}')}`);
