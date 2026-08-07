import officialFormsJsonl from '../data/official-forms.jsonl?raw';
import officialQaCsv from '../data/official-qa-flat.csv?raw';

export type OfficialForm = { formId: string; formType: string; textLayers: Record<string, string>; eligibilityRule?: { incomeMax: number; minMembers: number } };
export type OfficialQuestion = { qid: string; formId: string; language: string; question: string; type: 'extraction' | 'reasoning' };

function csvLine(line: string) {
  const out: string[] = []; let cell = ''; let quoted = false;
  for (let index = 0; index < line.length; index += 1) { const character = line[index]; if (character === '"' && line[index + 1] === '"') { cell += '"'; index += 1; } else if (character === '"') quoted = !quoted; else if (character === ',' && !quoted) { out.push(cell); cell = ''; } else cell += character; }
  out.push(cell); return out;
}

/** Exact bundled copies of forms.jsonl and qa_flat.csv; no OCR or network request. */
export function loadOfficialDataset(): { forms: OfficialForm[]; questions: OfficialQuestion[] } {
  const forms = officialFormsJsonl.trim().split(/\r?\n/).filter(Boolean).map((line) => {
    const record = JSON.parse(line) as { form_id: string; form_type: string; text_layer: Record<string, string>; eligibility_rule?: { income_max: number; min_members: number } };
    return { formId: record.form_id, formType: record.form_type, textLayers: record.text_layer, eligibilityRule: record.eligibility_rule ? { incomeMax: record.eligibility_rule.income_max, minMembers: record.eligibility_rule.min_members } : undefined };
  });
  const rows = officialQaCsv.replace(/^\uFEFF/, '').split(/\r?\n/).filter(Boolean);
  const questions = rows.slice(1).map((line) => {
    const [qid, formId, , language, type, question] = csvLine(line);
    return { qid, formId, language, question, type: type as OfficialQuestion['type'] };
  }).filter((question) => question.qid && question.formId && question.question);
  return { forms, questions };
}
