import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

type Run = { quantization: string; metric: string; value: number; device: string };
const root = path.resolve(import.meta.dirname, '../..');
const argument = (name: string, fallback: string) => process.argv.slice(2).find((value) => value.startsWith(`${name}=`))?.slice(name.length + 1) ?? fallback;
const input = path.resolve(root, argument('--input', 'reports/handset-runs.csv'));
const outDir = path.resolve(root, argument('--out', 'reports'));
const required = ['cold_load_ms', 'prefill_tokens_per_second', 'decode_tokens_per_second', 'peak_rss_mb', 'cpu_percent', 'sustained_tokens_per_second'];
const percentile = (values: number[], percentileValue: number) => values.length ? values[Math.min(values.length - 1, Math.max(0, Math.ceil(values.length * percentileValue) - 1))] : null;
let runs: Run[] = [];
try {
  const [header, ...rows] = (await readFile(input, 'utf8')).trim().split(/\r?\n/).filter(Boolean).map((line) => line.split(','));
  const columns = Object.fromEntries(header.map((name, index) => [name.trim(), index]));
  runs = rows.map((row) => ({ quantization: row[columns.quantization] ?? '', metric: row[columns.metric] ?? '', value: Number(row[columns.value]), device: row[columns.device] ?? '' })).filter((run) => run.quantization && required.includes(run.metric) && Number.isFinite(run.value));
} catch { /* no real handset sample has been supplied */ }
const quantizations = [...new Set(runs.map((run) => run.quantization))].sort();
const summary = quantizations.flatMap((quantization) => required.map((metric) => {
  const values = runs.filter((run) => run.quantization === quantization && run.metric === metric).map((run) => run.value).sort((a, b) => a - b);
  return { quantization, metric, samples: values.length, p10: percentile(values, .1), p50: percentile(values, .5), p90: percentile(values, .9), min: values[0] ?? null, max: values.at(-1) ?? null };
}));
const report = { generatedAt: new Date().toISOString(), status: runs.length ? 'complete' : 'missing-handset-runs', requiredColumns: ['device', 'quantization', 'run', 'metric', 'value'], minimumRunsPerCondition: 30, summary };
const number = (value: number | null) => value === null ? 'not measured' : value.toFixed(2);
const markdown = ['# PS-I2 handset benchmark report', '', `Status: **${report.status}**`, 'Only real handset samples are accepted. The input CSV has `device,quantization,run,metric,value` columns.', '', '| Quantization | Metric | n | P10 | P50 | P90 | Min–Max |', '|---|---|---:|---:|---:|---:|---:|', ...summary.map((row) => `| ${row.quantization} | ${row.metric} | ${row.samples} | ${number(row.p10)} | ${number(row.p50)} | ${number(row.p90)} | ${number(row.min)}–${number(row.max)} |`), ...(summary.length ? [] : ['', 'No performance values were simulated. Collect 30+ cold/warm/thermal-soak runs per condition from the target handset.'])];
await mkdir(outDir, { recursive: true });
await writeFile(path.join(outDir, 'benchmark.json'), `${JSON.stringify(report, null, 2)}\n`);
await writeFile(path.join(outDir, 'benchmark.md'), `${markdown.join('\n')}\n`);
console.log(`Wrote ${path.join(outDir, 'benchmark.{json,md}')}`);
