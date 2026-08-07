import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { answerFromDocument, createDocumentChunks, traceDocumentQa } from '../../artifacts/offline-citizen-assistant/src/lib/local-assistant.ts';

const NOT_FOUND = 'Information not found in the uploaded document.';
type Fixture = { name: string; text: string; checks: Array<[string, string]> };
const fixtures: Fixture[] = [
  { name: 'Aadhaar card', text: 'Government of India\nRAVI KUMAR\nDOB: 14/08/1999\nMale\n1234 5678 9012', checks: [['What is the applicant name?', 'RAVI KUMAR'], ['What is the Aadhaar number?', '1234 5678 9012'], ['What is the date of birth?', '14/08/1999']] },
  { name: 'Hindi Aadhaar card', text: 'भारत सरकार\nरवि कुमार\nजन्म तिथि: 14/08/1999\nपुरुष\n1234 5678 9012', checks: [['आवेदक का नाम क्या है?', 'रवि कुमार'], ['आधार संख्या क्या है?', '1234 5678 9012'], ['जन्म तिथि क्या है?', '14/08/1999']] },
  { name: 'Telugu Aadhaar card', text: 'భారత ప్రభుత్వం\nరవి కుమార్\nపుట్టిన తేదీ: 14/08/1999\nపురుషుడు\n1234 5678 9012', checks: [['దరఖాస్తుదారు పేరు ఏమిటి?', 'రవి కుమార్'], ['ఆధార్ నంబర్ ఏమిటి?', '1234 5678 9012'], ['పుట్టిన తేదీ ఏమిటి?', '14/08/1999']] },
  { name: 'Mixed-language Aadhaar card', text: 'Government of India\nరవి కుమార్\nDOB: 14/08/1999\nAadhaar No. 1234 5678 9012', checks: [['What is the applicant name?', 'రవి కుమార్'], ['ఆధార్ నంబర్ ఏమిటి?', '1234 5678 9012'], ['What is the date of birth?', '14/08/1999']] },
  { name: 'PAN card', text: 'INCOME TAX DEPARTMENT\nName: PRIYA SHARMA\nDate of Birth: 09/11/1994\nPermanent Account Number ABCDE1234F', checks: [['What is the applicant name?', 'PRIYA SHARMA'], ['What is the PAN number?', 'ABCDE1234F'], ['What is the date of birth?', '09/11/1994']] },
  { name: 'Government form', text: 'Page 1\nApplicant Name: Saira Begum\nDate of Birth: 01/02/1985\nDistrict: Hyderabad', checks: [['What is the applicant name?', 'Saira Begum'], ['What is the date of birth?', '01/02/1985']] },
  { name: 'Semester marks memo', text: 'SEMESTER MARKS MEMORANDUM\nStudent Name  KIRAN REDDY\nDate of Birth 07-03-2002\nSemester IV', checks: [['What is the applicant name?', 'KIRAN REDDY'], ['What is the date of birth?', '07-03-2002']] },
];

let assertions = 0;
for (const fixture of fixtures) {
  assert.ok(createDocumentChunks(fixture.text).length > 0, `${fixture.name}: uploaded OCR text was not indexed`);
  for (const [question, expected] of fixture.checks) {
    const result = answerFromDocument(fixture.text, question, { fileName: `${fixture.name}.png`, language: 'en' });
    assert.equal(result.answer, expected, `${fixture.name}: ${question}`);
    assert.ok(result.sourcePages?.includes(1), `${fixture.name}: missing source page`);
    assert.ok(result.supportingText?.includes(expected), `${fixture.name}: missing grounded evidence`);
    assertions += 3;
  }
  assert.equal(answerFromDocument(fixture.text, 'What is the passport number?').answer, NOT_FOUND, `${fixture.name}: unsupported field must remain blocked`);
  assertions += 1;
}

const aadhaarTrace = traceDocumentQa(fixtures[0].text, 'What is the Aadhaar number?');
assert.equal(aadhaarTrace.chunks[0].extractedFields.aadhaarNumber, '1234 5678 9012');
assert.match(aadhaarTrace.decision, /^Accepted direct field extraction/);
assertions += 2;

const evaluator = await readFile(path.resolve(import.meta.dirname, 'real-psi2-evaluation.ts'), 'utf8');
assert.match(evaluator, /import\s+\{\s*answerFromDocument\s*\}/, 'evaluation must call, not duplicate, production QA');
assert.doesNotMatch(evaluator, /writeFile\([^\n]*artifacts[\\/]+offline-citizen-assistant/i, 'evaluation must not write runtime application files');
assertions += 2;
console.log(`Document QA regression suite passed: ${fixtures.length} uploaded-document fixtures, ${assertions} assertions.`);
