import assert from 'node:assert/strict';
import { answerFromDocument, createDocumentChunks } from '../../artifacts/offline-citizen-assistant/src/lib/local-assistant.ts';

const documents = [
  ['Page 1', 'Applicant name: Ananya Rao', 'Application ID: SCH-101', 'District: Mysuru', 'Annual income: 180000', 'Family members: 4', 'Category: OBC', 'Scheme: Student Scholarship', 'Bank: Janata Bank', 'Account ending: 4821'].join('\n'),
  ['Page 1', 'Applicant name: Ravi Kumar', 'Application ID: RAT-202', 'District: Guntur', 'Annual income: 210000', 'Family members: 5', 'Category: BPL', 'Scheme: Ration Card', 'Address: Lakshmi Nagar', 'Card type: Priority household'].join('\n'),
  ['Page 1', 'Applicant name: Meera Devi', 'Application ID: PEN-303', 'District: Warangal', 'Annual income: 120000', 'Family members: 2', 'Category: General', 'Scheme: Old Age Pension', 'Age: 68', 'Pension office: Ward 12'].join('\n'),
];
const metadata = { fileName: 'scholarship-form.pdf', language: 'en' as const, pageCount: 1, fileType: 'application/pdf' };
assert.equal(answerFromDocument(documents[0], 'How many pages are there?', metadata).answer, '1 page.');
assert.equal(answerFromDocument(documents[0], 'What language is the document?', metadata).answer, 'English');
assert.equal(answerFromDocument(documents[0], 'What file name was uploaded?', metadata).answer, 'scholarship-form.pdf');

const cases = [
  [0, 'What is the applicant name?', 'Ananya Rao'], [0, 'What is the application ID?', 'SCH-101'], [0, 'What is the district?', 'Mysuru'], [0, 'What is the annual income?', '180000'], [0, 'How many family members?', '4'], [0, 'What is the category?', 'OBC'], [0, 'What is the scheme?', 'Student Scholarship'], [0, 'What is the bank?', 'Janata Bank'], [0, 'What is the account ending?', '4821'], [0, 'Is the applicant eligible?', 'Information not found in the uploaded document.'],
  [1, 'What is the applicant name?', 'Ravi Kumar'], [1, 'What is the application ID?', 'RAT-202'], [1, 'What is the district?', 'Guntur'], [1, 'What is the annual income?', '210000'], [1, 'How many family members?', '5'], [1, 'What is the category?', 'BPL'], [1, 'What is the scheme?', 'Ration Card'], [1, 'What is the address?', 'Lakshmi Nagar'], [1, 'What is the card type?', 'Priority household'], [1, 'Is the applicant eligible?', 'Information not found in the uploaded document.'],
  [2, 'What is the applicant name?', 'Meera Devi'], [2, 'What is the application ID?', 'PEN-303'], [2, 'What is the district?', 'Warangal'], [2, 'What is the annual income?', '120000'], [2, 'How many family members?', '2'], [2, 'What is the category?', 'General'], [2, 'What is the scheme?', 'Old Age Pension'], [2, 'What is the age?', '68'], [2, 'What is the pension office?', 'Ward 12'], [2, 'Is the applicant eligible?', 'Information not found in the uploaded document.'],
] as const;

for (const document of documents) assert.equal(createDocumentChunks(document).length, 1);
let correct = 0; let hallucinations = 0;
for (const [documentIndex, question, expected] of cases) {
  const result = answerFromDocument(documents[documentIndex], question);
  if (result.answer === expected) correct += 1;
  if (expected === 'Information not found in the uploaded document.' && result.answer !== expected) hallucinations += 1;
  assert.equal(result.answer, expected, question);
  assert.deepEqual(result.sourcePages, expected.startsWith('Information') ? [] : [1]);
  if (!expected.startsWith('Information')) assert.match(result.supportingText ?? '', new RegExp(expected.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
}
console.log(JSON.stringify({ questions: cases.length, retrievalAccuracy: correct / cases.length, answerAccuracy: correct / cases.length, hallucinationRate: hallucinations / cases.length, note: 'Grounded synthetic regression corpus; run the provided QA report against real PDF annotations for judge metrics.' }));
