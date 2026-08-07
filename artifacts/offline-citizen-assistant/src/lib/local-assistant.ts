export type CorpusRecord = { qid: string; form_id: string; form_type: string; lang: string; type: 'extraction' | 'reasoning'; question: string; answer: string };
export type OcrLanguage = 'en' | 'te';
export type OcrProgress = { status: string; progress: number };
export type LocalAnswer = { answer: string; type: 'extraction' | 'reasoning' | 'not-found'; confidence: number; source: string };

const csvLine = (line: string) => {
  const out: string[] = []; let cell = ''; let quoted = false;
  for (let i = 0; i < line.length; i += 1) { const c = line[i]; if (c === '"' && line[i + 1] === '"') { cell += '"'; i += 1; } else if (c === '"') quoted = !quoted; else if (c === ',' && !quoted) { out.push(cell); cell = ''; } else cell += c; }
  out.push(cell); return out;
};
export async function loadCorpus(): Promise<CorpusRecord[]> {
  const response = await fetch(`${import.meta.env.BASE_URL}data/psi2.csv`);
  const text = await response.text();
  const lines = text.split(/\r?\n/).filter(Boolean);
  return lines.slice(1).map((line) => { const [qid, form_id, form_type, lang, type, question, answer] = csvLine(line); return { qid, form_id, form_type, lang, type: type as CorpusRecord['type'], question, answer }; }).filter((r) => r.qid);
}

/**
 * Local OCR adapter. Worker, WASM, and language files are served from this app's
 * own public directory so an upload does not need a network request.
 */
export async function extractTextFromFile(file: File, language: OcrLanguage, onProgress?: (progress: OcrProgress) => void) {
  const [{ createWorker }, pdfjsLib] = await Promise.all([
    import('tesseract.js'),
    file.type === 'application/pdf' ? import('pdfjs-dist') : Promise.resolve(null),
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
    if (file.type === 'application/pdf' && pdfjsLib) {
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
        await page.render({ canvasContext: context, viewport }).promise;
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
  const normalized = question.toLowerCase();
  const reasoning = /eligible|eligib|income cap|household|qualif|pension|scholarship|ration|पात्र|అర్హ|যোগ্য|தகுதி/i.test(question);
  const sourceLine = findBestLine(lines, normalized);

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
        source: sourceLine || 'OCR text · income and household lines',
      };
    }
    return {
      answer: 'I found the question, but not enough income and household information in the extracted text to apply the local demo rule. Edit the OCR text on the Review OCR screen and try again.',
      type: 'reasoning',
      confidence: 0.45,
      source: 'OCR text · missing rule inputs',
    };
  }

  if (!sourceLine || score(sourceLine, normalized) < 0.08) {
    return {
      answer: 'I could not find a close match in this form. Try asking for the applicant name, district, annual income, family members, category, address, or eligibility.',
      type: 'not-found',
      confidence: 0.35,
      source: 'OCR text · local search',
    };
  }

  const answer = sourceLine.includes(':') ? sourceLine.split(':').slice(1).join(':').trim() : sourceLine;
  return { answer: answer || sourceLine, type: 'extraction', confidence: Math.min(0.96, 0.62 + score(sourceLine, normalized) * 0.28), source: `OCR line · ${sourceLine.slice(0, 72)}` };
}

function findBestLine(lines: string[], query: string) {
  return lines
    .map((line) => ({ line, value: score(line, query) }))
    .sort((a, b) => b.value - a.value)[0]?.line;
}

function findNumber(lines: string[], pattern: RegExp) {
  const line = lines.find((candidate) => pattern.test(candidate));
  if (!line) return null;
  const value = line.replace(/,/g, '').match(/\d+(?:\.\d+)?/);
  return value ? Number(value[0]) : null;
}

export function answerLocally(records: CorpusRecord[], formId: string, lang: string, question: string) {
  const pool = records.filter((r) => r.form_id === formId && (r.lang === lang || r.lang === 'en'));
  const normalized = question.toLowerCase();
  const reasoning = /eligible|eligib|income cap|household|qualif|पात्र|అర్హ|যোগ্য|தகுதி/i.test(question);
  const candidate = reasoning ? pool.find((r) => r.type === 'reasoning') : pool.filter((r) => r.type === 'extraction').sort((a, b) => score(b.question, normalized) - score(a.question, normalized))[0];
  if (!candidate || (!reasoning && score(candidate.question, normalized) < 0.16)) return { answer: 'I could not find a close match in this local form. Try asking for the applicant name, district, annual income, family members, category, or eligibility.', type: 'not-found', confidence: 0.38, source: 'Local corpus search' };
  if (reasoning) {
    const income = Number(pool.find((r) => /income/i.test(r.qid) && r.lang === 'en')?.answer || 0);
    const members = Number(pool.find((r) => /family_members/i.test(r.qid) && r.lang === 'en')?.answer || 0);
    const cap = 250000;
    const eligible = income <= cap && members >= 4;
    return { answer: `${eligible ? 'Yes' : 'No'} — annual income is ₹${income.toLocaleString('en-IN')}, household size is ${members}, and this local rule uses an income cap of ₹${cap.toLocaleString('en-IN')} with at least 4 household members.`, type: 'reasoning', confidence: 0.94, source: candidate.qid };
  }
  return { answer: candidate.answer, type: 'extraction', confidence: Math.min(.98, .74 + score(candidate.question, normalized) * .24), source: candidate.qid };
}
function score(text: string, query: string) { const words = text.toLowerCase().replace(/[?().]/g, '').split(/\s+/).filter(Boolean); return words.filter((word) => query.includes(word)).length / Math.max(words.length, 1); }