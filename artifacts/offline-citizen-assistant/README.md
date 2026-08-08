# Sahaay AI

Sahaay AI is an offline-first citizen form assistant for the PSI-2 problem statement, “Intelligence Without the Data Centre.” It gives citizens a readable way to inspect a government-form example and ask natural-language questions without sending form data or inference requests to a server.

## What the MVP demonstrates

- Scholarship, ration-card, and old-age-pension form examples.
- English and Telugu UI/data paths, with the other five corpus languages visible as future-ready.
- The uploaded PSI-2 corpus loaded locally in the browser from `public/data/psi2.csv`.
- Extraction questions such as applicant name, district, annual income, family members, and category.
- Reasoning questions that apply a visible income-cap plus household-size eligibility rule.
- Answer metadata with question type, confidence, and source `qid`.
- Offline/aeroplane-mode indicators throughout the experience.
- Analytics for accuracy by language and question type, plus clearly labeled simulated device measurements.
- A limits screen that distinguishes real demo behavior from simulated telemetry and future adapter work.

## Architecture

```text
Local CSV
   ↓
Browser CSV parser
   ↓
Structured corpus records
   ↓
Keyword retrieval + rule-based reasoning
   ↓
Answer, question type, confidence, source qid
```

The browser-side `answerLocally` function in `src/lib/local-assistant.ts` is the deliberate adapter boundary. It can later be replaced with a local llama.cpp / Qwen2.5 GGUF runner without changing the page-level experience. The same shape can receive OCR output from a Tesseract or Google ML Kit adapter in a future mobile build.

There are no authentication flows, user accounts, database writes, or inference-time network calls in this MVP.

## Demo flow

1. Open the app and choose Scholarship, Ration card, or Old-age pension.
2. Select English or Telugu.
3. Open the form view to inspect and edit local example values.
4. Choose Ask locally and try:
   - `What is the applicant name?`
   - `What is the annual income?`
   - `Is this applicant eligible?`
5. Open Local metrics to show per-language/per-type reporting and simulated hardware distributions.
6. Open Boundaries to explain what is real, simulated, and ready for a real on-device model.

## Team split for the next iteration

- **Frontend and UX:** responsive form viewer, question history, accessibility, and language polish.
- **On-device AI:** replace `answerLocally` with a llama.cpp/GGUF adapter and add token/latency instrumentation.
- **OCR and evaluation:** add image/PDF ingestion, Tesseract/ML Kit adapters, and real per-language evaluation reports.

## Run

```bash
pnpm --filter @workspace/offline-citizen-assistant run dev
pnpm --filter @workspace/offline-citizen-assistant run typecheck
```

The managed artifact workflow supplies the runtime port and base path.

## Important limits

The eligibility policy is intentionally a demo rule and is not an official government decision. Hardware measurements are simulated distributions for the target device class (less than or equal to ₹12,000, with a target resident memory budget of less than or equal to 1.2 GB). The uploaded CSV provides QA examples, not real-time government records.
