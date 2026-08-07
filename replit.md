# Namma Form

An offline-first citizen form assistant that helps people understand local government-form data without sending their questions or form values to a server.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string

The current web app runs with:

- `pnpm --filter @workspace/offline-citizen-assistant run dev`
- Preview at `/`

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- `artifacts/offline-citizen-assistant/src/App.tsx` — responsive app shell, navigation, form view, local Q&A, analytics, and limits screens.
- `artifacts/offline-citizen-assistant/src/lib/local-assistant.ts` — browser-side CSV loading, keyword retrieval, extraction answers, and deterministic eligibility reasoning.
- `artifacts/offline-citizen-assistant/public/data/psi2.csv` — the uploaded PSI-2 QA corpus copied into the app's public local data directory.
- `artifacts/offline-citizen-assistant/src/index.css` — app theme, typography, paper-grid treatment, and responsive styling.
- `artifacts/offline-citizen-assistant/README.md` — product handoff, architecture, demo flow, and teammate split.

## Architecture decisions

- The first build is frontend-only and deliberately keeps the corpus in the browser to make the no-network inference claim visible and testable.
- `answerLocally` is the swap boundary for a future llama.cpp / quantized GGUF runner; the citizen-facing routes do not need to change when the adapter changes.
- The current eligibility rule is a transparent demo policy (income cap plus household-size check), not an official government determination.
- Device telemetry and accuracy panels are explicitly labeled simulated where the uploaded corpus cannot provide hardware measurements.

## Product

Users can choose a scholarship, ration-card, or old-age-pension example, switch between English and Telugu, review local fields, ask extraction or eligibility questions, inspect source attribution, see per-language/per-type measurement views, and understand what is real versus simulated.

## User preferences

- Keep the product offline-first and transparent: no inference-time network calls, no authentication, and no unnecessary account flows.
- Preserve the English/Telugu-first experience while leaving the data model open for Hindi, Bengali, Tamil, Marathi, and Kannada.

## Gotchas

- The CSV is loaded from `public/data/psi2.csv`; if the corpus moves, update the fetch path in `src/lib/local-assistant.ts`.
- Artifact workflows provide `PORT` and `BASE_PATH`; use the managed workflow rather than starting Vite manually from the workspace root.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
