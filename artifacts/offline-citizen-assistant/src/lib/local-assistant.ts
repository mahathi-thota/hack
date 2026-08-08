import { Capacitor } from '@capacitor/core';

export type CorpusRecord = { qid: string; form_id: string; form_type: string; lang: string; type: 'extraction' | 'reasoning'; question: string; answer: string };
export type OcrLanguage = 'en' | 'te';
export type OcrProgress = { status: string; progress: number };
export type LocalAnswer = { answer: string; type: 'extraction' | 'reasoning' | 'not-found'; confidence: number; source: string; sourcePages?: number[]; supportingText?: string; chunkIds?: string[] };
export type DocumentMetadata = { fileName: string; language: 'en' | 'te'; pageCount?: number; fileType?: string; eligibilityRule?: { incomeMax: number; minMembers: number } };
export type QaTrace = {
  rawOcrText: string; cleanedOcrText: string; question: string; chunks: Array<{ id: string; page: number; text: string; labels: string[]; extractedFields: Record<string, string | null>; retrievalScore: number }>;
  selectedChunkId: string | null; decision: string; answer: LocalAnswer;
};

export class LocalOcrAssetError extends Error {
  constructor(public readonly assetUrl: string, reason: string) {
    super(`OCR asset unavailable at ${assetUrl}: ${reason}`);
    this.name = 'LocalOcrAssetError';
  }
}

export const isPdfFile = (file: Pick<File, 'name' | 'type'>) =>
  file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');

export async function validateDocumentFile(file: File): Promise<string | null> {
  const bytes = new Uint8Array(await file.slice(0, 512).arrayBuffer());
  if (isPdfFile(file)) {
    return new TextDecoder().decode(bytes.slice(0, 5)) === '%PDF-' ? null : 'This file is not a valid PDF. Choose an uncorrupted PDF form.';
  }

  const isPng = bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47 && bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a;
  const isJpeg = bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  const isGif = bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46;
  const isWebp = bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 && bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50;
  const isSvg = /^\s*(?:<\?xml[^>]*>\s*)?<svg\b/i.test(new TextDecoder().decode(bytes));
  return isPng || isJpeg || isGif || isWebp || isSvg ? null : 'This image is corrupted or uses an unsupported format. Choose a PNG, JPG, WEBP, GIF, or SVG form.';
}

export function getOcrErrorMessage(error: unknown, isPdf: boolean) {
  if (error instanceof LocalOcrAssetError) return `Bundled OCR asset could not be loaded: ${error.assetUrl} (${error.message.replace(/^.*?: /, '')}).`;
  const message = error instanceof Error ? error.message.toLowerCase() : '';
  if (message.includes('worker') || message.includes('wasm') || message.includes('traineddata') || message.includes('networkerror')) return `Local OCR startup failed: ${error instanceof Error ? error.message : 'unknown local worker error'}.`;
  if (isPdf) return 'This PDF is damaged, password-protected, or unsupported. Choose another PDF form.';
  return 'Local OCR could not read this image. Try a sharper photo with clear, well-lit text.';
}

/**
 * Android's picker and camera return File objects backed by content URIs.
 * Copy the bytes into an in-memory File before handing it to canvas, PDF.js,
 * or the OCR worker, so none of those libraries need filesystem URI access.
 */
export async function createMobileSafeFile(file: File): Promise<File> {
  const bytes = await file.arrayBuffer();
  if (!bytes.byteLength) throw new Error('The selected file has no readable bytes.');
  const name = file.name || (file.type.startsWith('image/') ? 'camera-capture.jpg' : 'uploaded-form.pdf');
  return new File([bytes], name, { type: file.type || 'application/octet-stream', lastModified: file.lastModified || Date.now() });
}

const csvLine = (line: string) => {
  const out: string[] = []; let cell = ''; let quoted = false;
  for (let i = 0; i < line.length; i += 1) { const c = line[i]; if (c === '"' && line[i + 1] === '"') { cell += '"'; i += 1; } else if (c === '"') quoted = !quoted; else if (c === ',' && !quoted) { out.push(cell); cell = ''; } else cell += c; }
  out.push(cell); return out;
};
export async function loadCorpus(): Promise<CorpusRecord[]> {
  const response = await fetch(`${import.meta.env.BASE_URL}data/psi2.csv`);
  if (!response.ok) throw new Error(`Could not load the bundled evaluation corpus (${response.status}).`);
  const text = await response.text();
  const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/).filter(Boolean);
  return lines.slice(1).map((line) => { const [qid, form_id, form_type, lang, type, question, answer] = csvLine(line); return { qid, form_id, form_type, lang, type: type as CorpusRecord['type'], question, answer }; }).filter((r) => r.qid);
}

/**
 * Local OCR adapter. Worker, WASM, language files, and image preparation all
 * stay in the device process; the worker is never allowed to resolve a URL.
 */
export async function extractTextFromFile(file: File, language: OcrLanguage, onProgress?: (progress: OcrProgress) => void) {
  const isPdf = isPdfFile(file);
  const [{ createWorker, PSM }, pdfjsLib] = await Promise.all([
    import('tesseract.js'),
    isPdf ? import('pdfjs-dist') : Promise.resolve(null),
  ]);
  const lang = language === 'te' ? 'tel' : 'eng';
  const workerPath = localAssetUrl('ocr/worker.min.js');
  const corePath = localAssetUrl('ocr/');
  const langPath = localAssetUrl(`ocr/${lang}/`);
  // Android AAPT expands .gz assets and exposes them as *.traineddata in the
  // APK. Browsers serve the original .gz files from public/, so select the
  // correct packaged filename and tell Tesseract whether to decompress it.
  const useApkLanguageData = Capacitor.isNativePlatform();
  const traineddataFile = `${lang}.traineddata${useApkLanguageData ? '' : '.gz'}`;
  // Capacitor serves these APK files from its WebView-local origin. Checking
  // the exact URLs before worker startup makes an Android packaging failure
  // diagnosable instead of leaving Tesseract at "loading language" progress.
  await verifyLocalOcrAssets([
    workerPath,
    localAssetUrl('ocr/tesseract-core-simd-lstm.wasm.js'),
    localAssetUrl('ocr/tesseract-core-simd-lstm.wasm'),
    localAssetUrl(`ocr/${lang}/${traineddataFile}`),
  ]);
  const worker = await createWorker(lang, 1, {
    workerPath,
    corePath,
    langPath,
    // A Blob worker has a blob: base URL. Tesseract's WASM glue then resolves
    // its adjacent .wasm file against blob:, which fails in Capacitor. Keep
    // the worker at its bundled same-origin URL so relative core files resolve
    // inside /ocr/ on both Android and desktop.
    workerBlobURL: false,
    gzip: !useApkLanguageData,
    logger: (message) => onProgress?.({ status: message.status, progress: message.progress }),
  });

  try {
    await worker.setParameters({ tessedit_pageseg_mode: PSM.SINGLE_BLOCK, user_defined_dpi: '300', preserve_interword_spaces: '1' });
    if (isPdf && pdfjsLib) {
      pdfjsLib.GlobalWorkerOptions.workerSrc = localAssetUrl('ocr/pdf.worker.mjs');
      const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(await file.arrayBuffer()), disableAutoFetch: true, disableStream: true }).promise;
      const pages = Math.min(pdf.numPages, 5);
      const pageText: string[] = [];
      for (let index = 1; index <= pages; index += 1) {
        const page = await pdf.getPage(index);
        const textLayer = await page.getTextContent();
        const embeddedText = textLayer.items.map((item) => 'str' in item ? item.str : '').join(' ').replace(/\s+/g, ' ').trim();
        if (embeddedText.length >= 12) {
          pageText.push(`Page ${index}\n${embeddedText}`);
          onProgress?.({ status: `Read text layer ${index} of ${pages}`, progress: index / pages });
          continue;
        }
        const viewport = page.getViewport({ scale: 1.7 });
        const canvas = document.createElement('canvas');
        canvas.width = Math.ceil(viewport.width);
        canvas.height = Math.ceil(viewport.height);
        const context = canvas.getContext('2d');
        if (!context) continue;
        await page.render({canvas,canvasContext: context,viewport,}).promise;
        const prepared = preprocessCanvasForOcr(canvas);
        const result = await recognizeBestOrientation(worker, prepared);
        pageText.push(`Page ${index}\n${normaliseOcrText(result.text)}`);
        onProgress?.({ status: `OCR page ${index} of ${pages}`, progress: index / pages });
      }
      return pageText.filter(Boolean).join('\n\n');
    }

    const prepared = await preprocessImageForOcr(file);
    const result = await recognizeBestOrientation(worker, prepared);
    return normaliseOcrText(result.text);
  } finally {
    await worker.terminate();
  }
}

async function verifyLocalOcrAssets(assetUrls: string[]) {
  for (const assetUrl of assetUrls) {
    let response: Response;
    try {
      response = await fetch(assetUrl, { cache: 'no-store' });
    } catch (error) {
      console.error('[Sahaay AI OCR] Local asset request failed', { assetUrl, error });
      throw new LocalOcrAssetError(assetUrl, error instanceof Error ? error.message : 'network request failed');
    }
    if (!response.ok) {
      console.error('[Sahaay AI OCR] Local asset returned an error', { assetUrl, status: response.status, statusText: response.statusText });
      throw new LocalOcrAssetError(assetUrl, `HTTP ${response.status} ${response.statusText}`.trim());
    }
    console.info('[Sahaay AI OCR] Local asset available', { assetUrl, status: response.status, contentLength: response.headers.get('content-length') });
  }
}

function localAssetUrl(path: string) {
  const base = import.meta.env.BASE_URL.endsWith('/') ? import.meta.env.BASE_URL : `${import.meta.env.BASE_URL}/`;
  return new URL(`${base}${path.replace(/^\//, '')}`, window.location.href).href;
}

/** Normalise line endings and Unicode without transliterating Indic scripts. */
export const normaliseOcrText = (text: string) => text.normalize('NFC').replace(/\r\n?/g, '\n').replace(/[\t \u00a0]+/g, ' ').replace(/ *\n */g, '\n').trim();

async function preprocessImageForOcr(file: File): Promise<HTMLCanvasElement> {
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  try {
    const scale = Math.min(2.5, Math.max(1, 1800 / Math.min(bitmap.width, bitmap.height), 2800 / Math.max(bitmap.width, bitmap.height)));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) throw new Error('Could not prepare this image for local OCR.');
    context.fillStyle = '#fff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    return preprocessCanvasForOcr(canvas);
  } finally {
    bitmap.close();
  }
}

function preprocessCanvasForOcr(source: HTMLCanvasElement): HTMLCanvasElement {
  const context = source.getContext('2d', { willReadFrequently: true });
  if (!context) return source;
  const image = context.getImageData(0, 0, source.width, source.height);
  const pixels = image.data;
  const histogram = new Uint32Array(256);
  for (let index = 0; index < pixels.length; index += 4) {
    const gray = Math.round(pixels[index] * 0.299 + pixels[index + 1] * 0.587 + pixels[index + 2] * 0.114);
    pixels[index] = pixels[index + 1] = pixels[index + 2] = gray;
    histogram[gray] += 1;
  }
  const threshold = otsuThreshold(histogram, source.width * source.height);
  for (let index = 0; index < pixels.length; index += 4) {
    const value = pixels[index] < threshold ? 0 : 255;
    pixels[index] = pixels[index + 1] = pixels[index + 2] = value;
    pixels[index + 3] = 255;
  }
  // Remove isolated salt-and-pepper pixels without eroding connected Indic marks.
  const binary = new Uint8Array(source.width * source.height);
  for (let index = 0; index < binary.length; index += 1) binary[index] = pixels[index * 4] < 128 ? 1 : 0;
  for (let y = 1; y < source.height - 1; y += 1) for (let x = 1; x < source.width - 1; x += 1) {
    const position = y * source.width + x;
    if (!binary[position]) continue;
    let neighbours = 0;
    for (let offsetY = -1; offsetY <= 1; offsetY += 1) for (let offsetX = -1; offsetX <= 1; offsetX += 1) if (offsetX || offsetY) neighbours += binary[position + offsetY * source.width + offsetX];
    if (neighbours <= 1) pixels[position * 4] = pixels[position * 4 + 1] = pixels[position * 4 + 2] = 255;
  }
  context.putImageData(image, 0, 0);
  const angle = estimateDeskewAngle(image, source.width, source.height);
  if (Math.abs(angle) < 0.4) return source;
  const corrected = document.createElement('canvas');
  corrected.width = source.width; corrected.height = source.height;
  const correctedContext = corrected.getContext('2d');
  if (!correctedContext) return source;
  correctedContext.fillStyle = '#fff'; correctedContext.fillRect(0, 0, corrected.width, corrected.height);
  correctedContext.translate(corrected.width / 2, corrected.height / 2);
  correctedContext.rotate(angle * Math.PI / 180);
  correctedContext.drawImage(source, -source.width / 2, -source.height / 2);
  return corrected;
}

function otsuThreshold(histogram: Uint32Array, total: number) {
  let sum = 0; for (let index = 0; index < 256; index += 1) sum += index * histogram[index];
  let background = 0; let backgroundSum = 0; let best = 0; let max = -1;
  for (let threshold = 0; threshold < 256; threshold += 1) {
    background += histogram[threshold]; if (!background) continue;
    const foreground = total - background; if (!foreground) break;
    backgroundSum += threshold * histogram[threshold];
    const delta = backgroundSum / background - (sum - backgroundSum) / foreground;
    const variance = background * foreground * delta * delta;
    if (variance > max) { max = variance; best = threshold; }
  }
  return Math.max(70, Math.min(210, best));
}

function estimateDeskewAngle(image: ImageData, width: number, height: number) {
  const sample = Math.max(2, Math.ceil(Math.max(width, height) / 900));
  let bestAngle = 0; let bestScore = 0;
  for (let angle = -5; angle <= 5; angle += 1) {
    const radians = angle * Math.PI / 180; const sine = Math.sin(radians); const cosine = Math.cos(radians);
    const rows = new Uint32Array(Math.ceil((width + height) / sample) + 2);
    for (let y = 0; y < height; y += sample) for (let x = 0; x < width; x += sample) {
      if (image.data[(y * width + x) * 4] < 96) rows[Math.round((sine * x + cosine * y) / sample)] += 1;
    }
    let score = 0; for (const row of rows) score += row * row;
    if (score > bestScore) { bestScore = score; bestAngle = angle; }
  }
  return bestAngle;
}

async function recognizeBestOrientation(worker: { recognize: (image: HTMLCanvasElement) => Promise<{ data: { text: string; confidence: number } }> }, source: HTMLCanvasElement) {
  const first = await worker.recognize(source);
  if (first.data.confidence >= 45 && normaliseOcrText(first.data.text).length >= 20) return first.data;
  let best = first.data;
  for (const angle of [90, 180, 270]) {
    const candidate = await worker.recognize(rotateCanvas(source, angle));
    const candidateText = normaliseOcrText(candidate.data.text);
    if (candidate.data.confidence > best.confidence || (candidate.data.confidence === best.confidence && candidateText.length > normaliseOcrText(best.text).length)) best = candidate.data;
  }
  return best;
}

function rotateCanvas(source: HTMLCanvasElement, angle: number) {
  const quarterTurn = angle % 180 !== 0;
  const canvas = document.createElement('canvas');
  canvas.width = quarterTurn ? source.height : source.width; canvas.height = quarterTurn ? source.width : source.height;
  const context = canvas.getContext('2d');
  if (!context) return source;
  context.fillStyle = '#fff'; context.fillRect(0, 0, canvas.width, canvas.height);
  context.translate(canvas.width / 2, canvas.height / 2); context.rotate(angle * Math.PI / 180);
  context.drawImage(source, -source.width / 2, -source.height / 2);
  return canvas;
}

export function answerFromDocument(text: string, question: string, metadata?: DocumentMetadata): LocalAnswer {
  return answerFromRetrievedChunks(text, question, metadata);

  if (false) { // Legacy keyword-only answer path retained below for migration reference.
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const normalized = normalize(question);
  const reasoning = /eligible|eligib|income cap|household|qualif|pension|scholarship|ration|पात्र|అర్హ|যোগ্য|தகுதி/i.test(question);
  const source = findBestLine(lines, normalized);

  if (reasoning) {
    const income = findNumber(lines, /income|earnings|salary|ఆదాయ|आय|আয়/i);
    const members = findNumber(lines, /family|household|members|persons|కుటుంబ|परिवार|পরিবার/i);
    const cap = findNumber(lines, /cap|limit|threshold|सीमा|పరిమితి/i) ?? 250000;
    if (income !== null && members !== null) {
      const eligible = income! <= cap && members! >= 4;
      // Legacy branch retained temporarily below the grounded retrieval return.
      // @ts-ignore -- unreachable legacy presentation string.
      return {
        // @ts-ignore -- unreachable legacy presentation string.
        answer: `${eligible ? 'Yes' : 'No'} — I found annual income of ₹${income.toLocaleString('en-IN')} and a household size of ${members}. Using the visible demo rule of an income cap of ₹${cap.toLocaleString('en-IN')} and at least 4 household members, this is ${eligible ? 'eligible' : 'not eligible'}.`,
        type: 'reasoning',
        confidence: 0.84,
        source: source?.line || 'OCR text · income and household lines',
      };
    }
    return {
      answer: 'I found the question, but not enough income and household information in the extracted text to apply the local demo rule. Edit the OCR text on the Review OCR screen and try again.',
      type: 'reasoning',
      confidence: 0.45,
      source: 'OCR text · missing rule inputs',
    };
  }

  if (!source || source.score < 0.18) {
    return {
      answer: 'I could not find a close match in this form. Try asking for the applicant name, district, annual income, family members, category, address, or eligibility.',
      type: 'not-found',
      confidence: 0.35,
      source: 'OCR text · local search',
    };
  }

  const answer = source.line.includes(':') ? source.line.split(':').slice(1).join(':').trim() : source.line;
  return { answer: answer || source.line, type: 'extraction', confidence: Math.min(0.96, 0.52 + source.score * 0.44), source: `OCR line · ${source.line.slice(0, 72)}` };
}

function findBestLine(lines: string[], query: string[]) {
  return lines
    .map((line) => ({ line, score: score(line, query) }))
    .sort((a, b) => b.score - a.score)[0];
}

function findNumber(lines: string[], pattern: RegExp) {
  const line = lines.find((candidate) => pattern.test(candidate));
  if (!line) return null;
  const value = line.replace(/,/g, '').match(/\d+(?:\.\d+)?/);
  return value ? Number(value[0]) : null;
}

function normalize(text: string) { return text.toLocaleLowerCase().match(/[\p{L}\p{M}\p{N}]+/gu) ?? []; }
function score(text: string, query: string[]) {
  const lineTokens = new Set(normalize(text));
  const queryTokens = [...new Set(query)].filter((token) => token.length > 1);
  if (!queryTokens.length) return 0;
  const matches = queryTokens.filter((token) => lineTokens.has(token)).length;
  return matches / queryTokens.length;
}

  }
type DocumentChunk = { id: string; page: number; text: string; vector: Float32Array; labels: string[] };
const QA_STOP_WORDS = new Set(['what', 'which', 'who', 'is', 'the', 'a', 'an', 'of', 'for', 'in', 'on', 'please', 'tell', 'me', 'show', 'does', 'this', 'document', 'uploaded', 'applicant', 'application']);
function contentTokens(text: string) { const tokens = normalize(text).filter((token) => token.length > 1 && !QA_STOP_WORDS.has(token)); const base = tokens.length ? tokens : normalize(text); return [...new Set(base.flatMap((token) => token.length >= 5 ? [token, token.slice(0, 5)] : [token]))]; }
function normalize(text: string): string[] { return text.toLocaleLowerCase().match(/[\p{L}\p{M}\p{N}]+/gu) ?? []; }
const NOT_FOUND = 'Information not found in the uploaded document.';
const CHUNK_SIZE = 850;
const CHUNK_OVERLAP = 160;
const TOP_K = 3;

/**
 * Deterministic, device-local retrieval. Character n-grams give related Indic
 * spellings a useful signal without transmitting document text to a service.
 */
export function answerFromRetrievedChunks(text: string, question: string, metadata?: DocumentMetadata): LocalAnswer {
  const chunks = createDocumentChunks(normaliseOcrText(text));
  if (!chunks.length || !normaliseOcrText(question)) return noAnswer();
  const metadataAnswer = answerMetadataQuestion(question, metadata, chunks);
  if (metadataAnswer) return metadataAnswer;
  const eligibility = answerEligibilityQuestion(chunks, question, metadata?.eligibilityRule);
  if (eligibility) return eligibility;
  const directMatch = chunks.map((chunk) => ({ chunk, value: extractFieldValue(chunk.text, question) })).find((match) => match.value);
  if (directMatch?.value) {
    const type = /eligib|eligible|qualif|entitled|scholarship|pension|ration/i.test(question) ? 'reasoning' : 'extraction';
    return grounded(directMatch.value, type, [{ chunk: directMatch.chunk, score: 1 }], .92);
  }
  const ranked = rankChunks(chunks, question);
  const evidence = ranked.slice(0, TOP_K);
  if (!evidence.length) return noAnswer();

  const primary = evidence[0].chunk;
  const direct = extractFieldValue(primary.text, question);
  const supportingText = evidence.map(({ chunk }) => chunk.text).join('\n\n');
  if (!direct) {
    // A whole evidence chunk is still document-grounded, but only return it for a strong retrieval result.
    if (evidence[0].score < .48) return noAnswer();
    return grounded(primary.text, 'extraction', evidence, .42 + evidence[0].score * .42);
  }
  const type = /eligib|eligible|qualif|entitled|scholarship|pension|ration/i.test(question) ? 'reasoning' : 'extraction';
  return grounded(direct, type, evidence, .52 + evidence[0].score * .40, supportingText);
}

export function createDocumentChunks(text: string): DocumentChunk[] {
  const pages = text.split(/(?=^\s*page\s+\d+\b)/im).filter(Boolean);
  const sourcePages = pages.length ? pages : [text];
  const chunks: DocumentChunk[] = [];
  sourcePages.forEach((pageText, pageIndex) => {
    const page = Number(pageText.match(/^\s*page\s+(\d+)\b/i)?.[1]) || pageIndex + 1;
    const cleaned = pageText.replace(/^\s*page\s+\d+\b[:\-]?\s*/i, '').trim();
    const paragraphs = cleaned.split(/\n{2,}|(?<=\.)\s+(?=[A-Z\p{L}])/u).map((part) => part.trim()).filter(Boolean);
    let current = '';
    for (const paragraph of paragraphs) {
      const candidate = current ? `${current}\n${paragraph}` : paragraph;
      if (candidate.length <= CHUNK_SIZE) { current = candidate; continue; }
      if (current) chunks.push(makeChunk(page, chunks.length + 1, current));
      current = `${current.slice(Math.max(0, current.length - CHUNK_OVERLAP))}\n${paragraph}`.slice(-CHUNK_SIZE);
    }
    if (current) chunks.push(makeChunk(page, chunks.length + 1, current));
  });
  return chunks;
}

function makeChunk(page: number, index: number, text: string): DocumentChunk {
  const labels = structuredFields(text).flatMap((field) => contentTokens(field.label));
  return { id: `p${page}-c${index}`, page, text, vector: embedLocally(text), labels };
}

function embedLocally(value: string) {
  const vector = new Float32Array(256);
  const normalized = normaliseOcrText(value).toLocaleLowerCase();
  const features = [...normalize(normalized), ...[...normalized.replace(/\s+/g, ' ')].flatMap((_, index, all) => index + 2 < all.length ? [all.slice(index, index + 3).join('')] : [])];
  for (const feature of features) vector[hash(feature) % vector.length] += feature.length === 3 ? .35 : 1;
  let magnitude = 0; for (const item of vector) magnitude += item * item;
  magnitude = Math.sqrt(magnitude) || 1; for (let index = 0; index < vector.length; index += 1) vector[index] /= magnitude;
  return vector;
}

function hash(value: string) { let state = 2166136261; for (const character of value) { state ^= character.codePointAt(0) ?? 0; state = Math.imul(state, 16777619); } return state >>> 0; }
function cosine(left: Float32Array, right: Float32Array) { let result = 0; for (let index = 0; index < left.length; index += 1) result += left[index] * right[index]; return result; }
function overlap(left: Set<string>, right: Set<string>) { if (!left.size) return 0; let count = 0; for (const item of left) if (right.has(item)) count += 1; return count / left.size; }

function rankChunks(chunks: DocumentChunk[], question: string) {
  const query = embedLocally(question);
  const queryTokens = new Set(contentTokens(question));
  return chunks.map((chunk) => {
    const lexical = overlap(queryTokens, new Set(normalize(chunk.text)));
    const labelMatch = overlap(queryTokens, new Set(chunk.labels));
    const fuzzy = fuzzyTextScore(contentTokens(question), [...new Set([...normalize(chunk.text), ...chunk.labels])]);
    return { chunk, score: cosine(query, chunk.vector) * .35 + lexical * .30 + labelMatch * .20 + fuzzy * .15 };
  }).sort((left, right) => right.score - left.score);
}

function fuzzyTextScore(query: string[], candidates: string[]) {
  if (!query.length || !candidates.length) return 0;
  return query.reduce((total, token) => total + Math.max(...candidates.map((candidate) => tokenSimilarity(token, candidate))), 0) / query.length;
}
function tokenSimilarity(left: string, right: string) {
  if (left === right) return 1;
  if (left.length < 3 || right.length < 3) return 0;
  if (left.startsWith(right) || right.startsWith(left)) return Math.min(left.length, right.length) / Math.max(left.length, right.length);
  const leftTrigrams = new Set([...left].flatMap((_, index, all) => index + 2 < all.length ? [all.slice(index, index + 3).join('')] : []));
  const rightTrigrams = new Set([...right].flatMap((_, index, all) => index + 2 < all.length ? [all.slice(index, index + 3).join('')] : []));
  return overlap(leftTrigrams, rightTrigrams);
}

type StructuredField = { label: string; value: string };
function structuredFields(text: string): StructuredField[] {
  return text.split(/\n+/).map((line) => line.match(/^\s*([^:\-]{2,80}?)(?:\s*[:\-]\s*|\s{2,})(.+?)\s*$/)).filter((value): value is RegExpMatchArray => Boolean(value)).map((match) => ({ label: match[1].trim(), value: match[2].trim() })).filter((field) => field.label && field.value);
}

function extractFieldValue(text: string, question: string) {
  const identityValue = extractIdentityFieldValue(text, question);
  if (identityValue) return identityValue;
  const query = contentTokens(question);
  const best = structuredFields(text).map((field) => ({ field, score: fuzzyTextScore(query, contentTokens(field.label)) })).sort((left, right) => right.score - left.score)[0];
  return best && best.score >= .34 ? best.field.value : null;
}

function answerEligibilityQuestion(chunks: DocumentChunk[], question: string, rule?: { incomeMax: number; minMembers: number }): LocalAnswer | null {
  // The PS-I2 eligibility question explicitly asks for the bundled local rule:
  // Both inputs and the form's supplied rule must be present; otherwise no
  // decision is produced. This prevents a guessed policy from becoming an answer.
  const allFields = chunks.flatMap((chunk) => structuredFields(chunk.text).map((field) => ({ chunk, ...field })));
  const explicitEligibilityIntent = /eligible|eligib|qualif|entitled|scholarship|pension|ration|पात्र|अर्ह|যোগ্য|தகுதி|అర్హ|à²…à²°à³à²¹|à²¹à³Œà²¦à³/i.test(question);
  if (!explicitEligibilityIntent) return null;
  const income = allFields.find((field) => /income|earnings|salary|आय|আয়|ఆదాయ|வருமான|उत्पन्न|ಆದಾಯ/i.test(field.label))?.value.replace(/[^\d.]/g, '');
  const members = allFields.find((field) => /family|household|members|persons|परिवार|পরিবার|కుటుంబ|குடும்ப|कुटुंब|ಕುಟುಂಬ/i.test(field.label))?.value.replace(/[^\d.]/g, '');
  if (!income || !members || !rule) return null;
  const eligible = Number(income) <= rule.incomeMax && Number(members) >= rule.minMembers;
  const evidence = [...new Map(allFields.filter((field) => field.value.replace(/[^\d.]/g, '') === income || field.value.replace(/[^\d.]/g, '') === members).map((field) => [field.chunk.id, { chunk: field.chunk, score: 1 }])).values()];
  return grounded(eligible ? 'yes' : 'no', 'reasoning', evidence, .88);
}

/** Identity cards often put a known field label and value on one OCR line. */
function extractIdentityFieldValue(text: string, question: string): string | null {
  if (/aadhaar|aadhar|\buid\b|आधार|ఆధార్/i.test(question)) {
    const labelled = text.match(/(?:aadhaar|aadhar|uid(?:ai)?|आधार|ఆధార్)(?:\s*(?:no\.?|number|संख्या|नंबर|నంబర్))?\s*[:\-]?\s*((?:\d{4}[\s-]?){2}\d{4})\b/i)?.[1];
    if (labelled) return labelled.replace(/[\s-]+/g, ' ').trim();
    // A printed Aadhaar number is commonly a standalone 4-4-4 line. Require
    // Aadhaar-specific surrounding text so another document number is never used.
    if (/(?:aadhaar|aadhar|uidai|government\s+of\s+india|आधार|भारत सरकार|ఆధార్|భారత ప్రభుత్వం)/i.test(text)) return text.match(/^\s*(\d{4}[\s-]\d{4}[\s-]\d{4})\s*$/m)?.[1]?.replace(/[\s-]+/g, ' ') ?? null;
  }
  if (/\bpan\b|permanent\s+account/i.test(question)) return text.match(/(?:pan|permanent\s+account(?:\s+number)?)\s*[:\-]?\s*([A-Z]{5}\d{4}[A-Z])\b/i)?.[1] ?? null;
  if (/date\s+of\s+birth|birth\s+date|\bdob\b|जन्म\s*तिथि|పుట్టిన\s*తేదీ/i.test(question)) return text.match(/(?:date\s+of\s+birth|birth\s+date|dob|जन्म\s*तिथि|పుట్టిన\s*తేదీ)\s*[:\-]?\s*(\d{1,2}[/.\-]\d{1,2}[/.\-]\d{2,4})\b/i)?.[1] ?? null;
  if (/\b(applicant\s+)?name\b|नाम|పేరు/i.test(question)) {
    const labelled = text.match(/^\s*(?:(?:applicant|student)\s+)?(?:name|नाम|పేరు)\s*[:\-]?\s*([\p{L}][\p{L}\p{M} .'’]{1,80})\s*$/imu)?.[1]?.trim();
    if (labelled) return labelled;
    // Aadhaar cards may print the holder's name directly above DOB without a
    // label. Limit this fallback to that exact, evidence-backed card structure.
    if (/(?:aadhaar|aadhar|uidai|government\s+of\s+india|आधार|भारत सरकार|ఆధార్|భారత ప్రభుత్వం)/i.test(text)) {
      const lines = text.split(/\n+/).map((line) => line.trim()).filter(Boolean);
      const dobIndex = lines.findIndex((line) => /(?:date\s+of\s+birth|birth\s+date|\bdob\b|जन्म\s*तिथि|పుట్టిన\s*తేదీ)\s*[:\-]?\s*\d{1,2}[/.\-]\d{1,2}[/.\-]\d{2,4}/i.test(line));
      const candidate = dobIndex > 0 ? lines[dobIndex - 1] : '';
      if (/^[\p{L}][\p{L}\p{M} .'’]{1,80}$/u.test(candidate) && !/(government|india|male|female|आधार|भारत|सरकार|పురుషుడు|స్త్రీ|భారత)/i.test(candidate)) return candidate;
    }
  }
  return null;
}

/** Diagnostic-only view of the exact local OCR-to-answer path for a document. */
export function traceDocumentQa(rawOcrText: string, question: string, metadata?: DocumentMetadata): QaTrace {
  const cleanedOcrText = normaliseOcrText(rawOcrText);
  const chunks = createDocumentChunks(cleanedOcrText);
  const query = embedLocally(question);
  const queryTokens = new Set(contentTokens(question));
  const ranked = chunks.map((chunk) => {
    const lexical = overlap(queryTokens, new Set(normalize(chunk.text)));
    const labelMatch = overlap(queryTokens, new Set(chunk.labels));
    return { chunk, score: cosine(query, chunk.vector) * .45 + lexical * .25 + labelMatch * .30 };
  }).sort((left, right) => right.score - left.score);
  const direct = chunks.map((chunk) => ({ chunk, value: extractFieldValue(chunk.text, question) })).find((item) => item.value);
  const answer = answerFromRetrievedChunks(cleanedOcrText, question, metadata);
  const selected = direct?.chunk ?? ranked[0]?.chunk;
  const decision = direct ? `Accepted direct field extraction from ${direct.chunk.id}.` : !ranked.length ? 'Rejected: OCR created no searchable chunks.' : ranked[0].score < .48 ? `Rejected ${ranked[0].chunk.id}: retrieval score ${ranked[0].score.toFixed(3)} is below 0.480 and no direct field matched.` : `Accepted ${ranked[0].chunk.id} as document-grounded chunk evidence; no direct field matched.`;
  return {
    rawOcrText, cleanedOcrText, question,
    chunks: ranked.map(({ chunk, score }) => ({ id: chunk.id, page: chunk.page, text: chunk.text, labels: chunk.labels, extractedFields: { name: extractIdentityFieldValue(chunk.text, 'What is the applicant name?'), aadhaarNumber: extractIdentityFieldValue(chunk.text, 'What is the Aadhaar number?'), dateOfBirth: extractIdentityFieldValue(chunk.text, 'What is the date of birth?'), panNumber: extractIdentityFieldValue(chunk.text, 'What is the PAN number?') }, retrievalScore: score })),
    selectedChunkId: selected?.id ?? null, decision, answer,
  };
}

function grounded(answer: string, type: LocalAnswer['type'], evidence: Array<{ chunk: DocumentChunk; score: number }>, confidence: number, supportingText?: string): LocalAnswer {
  const pages = [...new Set(evidence.map(({ chunk }) => chunk.page))];
  return { answer, type, confidence: Math.min(.96, confidence), source: `Document chunk ${evidence[0].chunk.id} · page ${pages.join(', ')}`, sourcePages: pages, supportingText: supportingText ?? evidence.map(({ chunk }) => chunk.text).join('\n\n'), chunkIds: evidence.map(({ chunk }) => chunk.id) };
}

function noAnswer(): LocalAnswer { return { answer: NOT_FOUND, type: 'not-found', confidence: .08, source: 'No supporting document chunk', sourcePages: [], supportingText: '', chunkIds: [] }; }

export function confidenceLabel(confidence: number): 'High' | 'Medium' | 'Low' { return confidence >= .75 ? 'High' : confidence >= .45 ? 'Medium' : 'Low'; }

function answerMetadataQuestion(question: string, metadata: DocumentMetadata | undefined, chunks: DocumentChunk[]): LocalAnswer | null {
  const normalized = question.toLocaleLowerCase();
  const pages = metadata?.pageCount ?? Math.max(1, ...chunks.map((chunk) => chunk.page));
  if (/\b(how many|number of|total)\s+pages?\b|\bpage count\b/i.test(normalized)) return { answer: `${pages} ${pages === 1 ? 'page' : 'pages'}.`, type: 'extraction', confidence: .98, source: 'Document metadata · page count', sourcePages: Array.from({ length: pages }, (_, index) => index + 1), supportingText: `Document contains ${pages} recognised page section${pages === 1 ? '' : 's'}.`, chunkIds: [] };
  if (/\b(document|file)\s+language\b|\bwhat language\b/i.test(normalized) && metadata) {
    const language = metadata.language === 'te' ? 'Telugu' : 'English';
    return { answer: language, type: 'extraction', confidence: .98, source: 'Document metadata · selected language', sourcePages: [], supportingText: `Language selected for local OCR and question answering: ${language}.`, chunkIds: [] };
  }
  if (/\b(uploaded|file)\b.*\b(name|filename)\b|\bwhat file\b/i.test(normalized) && metadata) return { answer: metadata.fileName, type: 'extraction', confidence: .99, source: 'Document metadata · file name', sourcePages: [], supportingText: `Uploaded file name: ${metadata.fileName}`, chunkIds: [] };
  return null;
}
