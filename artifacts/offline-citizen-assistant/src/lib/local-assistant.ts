export type CorpusRecord = { qid: string; form_id: string; form_type: string; lang: string; type: 'extraction' | 'reasoning'; question: string; answer: string };

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