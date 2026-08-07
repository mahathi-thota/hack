export type CorpusRecord = { qid: string; form_id: string; form_type: string; lang: string; type: 'extraction' | 'reasoning'; question: string; answer: string };
export type OcrLanguage = 'en' | 'te';
export type OcrProgress = { status: string; progress: number };
export type LocalAnswer = { answer: string; type: 'extraction' | 'reasoning' | 'not-found'; confidence: number; source: string };

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
  const message = error instanceof Error ? error.message.toLowerCase() : '';
  if (message.includes('worker') || message.includes('wasm') || message.includes('traineddata') || message.includes('networkerror')) return 'Local OCR files are unavailable. Reinstall the app assets and try again.';
  if (isPdf) return 'This PDF is damaged, password-protected, or unsupported. Choose another PDF form.';
  return 'Local OCR could not read this image. Try a sharper photo with clear, well-lit text.';
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
 * Local OCR adapter. Worker, WASM, and language files are served from this app's
 * own public directory so an upload does not need a network request.
 */
export async function extractTextFromFile(file: File, language: OcrLanguage, onProgress?: (progress: OcrProgress) => void) {
  const isPdf = isPdfFile(file);
  const [{ createWorker }, pdfjsLib] = await Promise.all([
    import('tesseract.js'),
    isPdf ? import('pdfjs-dist') : Promise.resolve(null),
  ]);
  const base = import.meta.env.BASE_URL;
  const lang = language === 'te' ? 'tel' : 'eng';
  const worker = await createWorker(lang, 1, {
    workerPath: `${base}ocr/worker.min.js`,
    corePath: `${base}ocr`,
    langPath: `${base}ocr/${lang}`,
    workerBlobURL: false,
    gzip: true,
    logger: (message) => onProgress?.({ status: message.status, progress: message.progress }),
  });

  try {
    if (isPdf && pdfjsLib) {
      pdfjsLib.GlobalWorkerOptions.workerSrc = `${base}ocr/pdf.worker.mjs`;
      const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
      const pages = Math.min(pdf.numPages, 5);
      const pageText: string[] = [];
      for (let index = 1; index <= pages; index += 1) {
        const page = await pdf.getPage(index);
        const viewport = page.getViewport({ scale: 1.7 });
        const canvas = document.createElement('canvas');
        canvas.width = Math.ceil(viewport.width);
        canvas.height = Math.ceil(viewport.height);
        const context = canvas.getContext('2d');
        if (!context) continue;
        await page.render({canvas,canvasContext: context,viewport,}).promise;
        const result = await worker.recognize(canvas);
        pageText.push(`Page ${index}\n${result.data.text.trim()}`);
        onProgress?.({ status: `OCR page ${index} of ${pages}`, progress: index / pages });
      }
      return pageText.filter(Boolean).join('\n\n');
    }

    const result = await worker.recognize(file);
    return result.data.text.trim();
  } finally {
    await worker.terminate();
  }
}

export function answerFromDocument(text: string, question: string): LocalAnswer {
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const normalized = normalize(question);
  const reasoning = /eligible|eligib|income cap|household|qualif|pension|scholarship|ration|पात्र|అర్హ|যোগ্য|தகுதி/i.test(question);
  const source = findBestLine(lines, normalized);

  if (reasoning) {
    const income = findNumber(lines, /income|earnings|salary|ఆదాయ|आय|আয়/i);
    const members = findNumber(lines, /family|household|members|persons|కుటుంబ|परिवार|পরিবার/i);
    const cap = findNumber(lines, /cap|limit|threshold|सीमा|పరిమితి/i) ?? 250000;
    if (income !== null && members !== null) {
      const eligible = income <= cap && members >= 4;
      return {
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
