import assert from 'node:assert/strict';
import { answerFromDocument, getOcrErrorMessage, validateDocumentFile } from '../../artifacts/offline-citizen-assistant/src/lib/local-assistant.ts';

const englishForm = ['Applicant name: Ananya Rao', 'Annual income: 180000', 'Family members: 4'].join('\n');
const teluguForm = ['పేరు: అనన్య రావు', 'వార్షిక ఆదాయం: 180000', 'కుటుంబ సభ్యులు: 4'].join('\n');

const englishExtraction = answerFromDocument(englishForm, 'What is the applicant name?');
assert.equal(englishExtraction.type, 'extraction');
assert.equal(englishExtraction.answer, 'Ananya Rao');

const teluguExtraction = answerFromDocument(teluguForm, 'పేరు ఏమిటి');
assert.equal(teluguExtraction.type, 'extraction');
assert.equal(teluguExtraction.answer, 'అనన్య రావు');

const eligibility = answerFromDocument(englishForm, 'Is this applicant eligible?');
assert.equal(eligibility.type, 'reasoning');
assert.match(eligibility.answer, /^Yes/);

const noMatch = answerFromDocument(englishForm, 'What is the passport number?');
assert.equal(noMatch.type, 'not-found');

assert.equal(await validateDocumentFile(new File(['%PDF-1.7'], 'form.pdf', { type: 'application/pdf' })), null);
assert.match(await validateDocumentFile(new File(['not a PDF'], 'broken.pdf', { type: 'application/pdf' })) ?? '', /not a valid PDF/);
assert.equal(await validateDocumentFile(new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])], 'form.png', { type: 'image/png' })), null);
assert.match(await validateDocumentFile(new File(['invalid image'], 'broken.png', { type: 'image/png' })) ?? '', /corrupted/);
assert.match(getOcrErrorMessage(new Error('Failed to load worker'), false), /Local OCR files are unavailable/);
assert.match(getOcrErrorMessage(new Error('Invalid PDF structure'), true), /PDF is damaged/);

console.log('AI pipeline and reliability audit passed');
