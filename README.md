# Kargo Hiring Dashboard

Internal hiring tool for Kargo (Mumbai, Series A). Scores CVs against a rubric derived from past
hires, ranks candidates, drafts interview briefs and emails — **and never sends, rejects, or
finalizes anything without Arjun clicking a button.** There is no auto-send and no auto-reject
anywhere in this codebase.

## Stack

- Next.js (App Router, TypeScript), deployed on Vercel
- Neon Postgres, accessed only from server code via `@neondatabase/serverless`
- Google Gemini (`@google/genai`) for scoring, briefs, and email drafts — JSON structured output,
  temperature 0
- Resend for email sending
- Tailwind for styling

## Setup

```bash
npm install
```

### 1. Database

The schema lives in [`db/migrations/0001_init.sql`](db/migrations/0001_init.sql). It was applied
directly against the Neon project via the Neon MCP connector (not via a local `psql`/migration
runner), so treat that file as a record for version control, not something to re-run against an
already-initialized branch.

If you're setting this up against a **new, empty** Neon database, run that file's statements once
(via `psql`, the Neon SQL editor, or the Neon MCP) to create the schema and seed `rubric_criteria`
and `settings.shortlist_size`.

Any future schema change should go in a new numbered file under `db/migrations/` and must be
additive (`ALTER ... ADD`, new tables) — never edit or re-run `0001_init.sql`.

### 2. Environment variables

Copy `.env.example` to `.env.local` and fill in:

| Variable | Notes |
|---|---|
| `DATABASE_URL` | Neon **pooled** connection string. Get it from the Neon console's Connection Details, or `neon connection-string --pooled` once the project is linked. |
| `GEMINI_API_KEY` | From [Google AI Studio](https://aistudio.google.com/apikey). |
| `GEMINI_MODEL` | Current Flash model id. Check [ai.google.dev/gemini-api/docs/models](https://ai.google.dev/gemini-api/docs/models) for updates; default here is `gemini-3.8-flash`. |
| `RESEND_API_KEY` | Leave blank to disable sending — the Send button will show "Email not configured" instead of erroring. |
| `EMAIL_FROM` | Defaults to `Kargo Hiring <onboarding@resend.dev>`. With this sender and no verified domain, Resend only delivers to the email address that owns the Resend account — everything else gets a 403, which the app surfaces as a clear error rather than a crash. |
| `TEST_RECIPIENT_EMAIL` | When set, **every** send is redirected here instead of the candidate's real address, with the subject prefixed `[TEST -> original@address]`. Always set this outside of production. |
| `DASHBOARD_PASSWORD` | Shared password gating every page and API route (simple cookie session, no user accounts). |

`.env.local` is git-ignored. Never commit a real `DATABASE_URL`, API key, or password.

### 3. Run locally

```bash
npm run dev
```

Visit `http://localhost:3000`, log in with `DASHBOARD_PASSWORD`, and go to **Upload**.

### 4. Tests

```bash
npm test
```

Covers `lib/pii.ts` (name/email/phone extraction and redaction) against a few fixture CVs. This is
the module enforcing the privacy guarantee described below, so it's the one with unit tests.

### 5. Manual pipeline test

Three synthetic fixture CVs are in [`fixtures/`](fixtures/) (not real candidates — written to
exercise strong/weak evidence on every rubric criterion): upload `strong_pm_candidate.txt` and
`weak_pm_candidate.txt` as **PM**, and `strong_spm_candidate.txt` as **SPM**, then check the
dashboard, `/candidate/[id]`, and `/analytics` pages render correctly.

## Deploying to Vercel

1. Push this repo to GitHub (see below).
2. Import the repo in Vercel.
3. In the Vercel project's **Settings > Environment Variables**, add every variable from
   `.env.example` (with real values) for the Production (and Preview, if you want) environment.
4. Deploy. Vercel runs `next build` automatically.
5. Visit the deployed URL and log in with `DASHBOARD_PASSWORD`.

```bash
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin <your-github-repo-url>
git push -u origin main
```

Then connect the repo at [vercel.com/new](https://vercel.com/new).

## Data privacy

Personal identifying information (name, email, phone, LinkedIn/GitHub/portfolio URLs) is stripped
from every CV **before** any AI call, in plain deterministic code (`lib/pii.ts`, regex-based, no
AI involved in this step). The stripped text (`cv_content`) is what every Gemini call sees; the
real name/email/phone live only in the separate `candidate_pii` table, which the AI modules never
query — it's structurally impossible for a scoring, brief, or email-drafting call to see it by
accident, because the code that talks to Gemini (`lib/ai.ts`) has no import path to
`candidate_pii`.

Before any AI call runs, an assertion (`assertNoPiiLeaked`) checks the stripped text no longer
contains the stored name, email, or phone; if it does, ingestion aborts with `status: 'error'`
rather than risk a leak. Counts of what was redacted (never the values) are stored in
`pii_redaction_report` for auditability.

Email drafts are written by the model using the literal token `{{FIRST_NAME}}` — the model never
sees a real name — and the first name is substituted server-side from `candidate_pii` only at
preview/send time, immediately before sending.

**On the Gemini API tier:** the free tier may use inputs to improve Google's models; the paid,
billing-enabled tier does not. Given this data is about real job applicants, use a billing-enabled
Gemini API key in production, not a free-tier key.

## Known limitations

- `npm audit` shows a handful of moderate/high vulnerabilities scoped entirely to `vitest`'s dev
  test-runner dependency chain (`esbuild`/`vite`), not to any production dependency. Production
  dependencies (`npm audit --omit=dev`) are clean.
- The Neon MCP server config (`.mcp.json`, git-ignored) was minted with an account-wide API key
  rather than one scoped to this project — scope it down via the Neon console or CLI
  (`neon api-keys revoke <id>` then re-run `neon mcp --project-id <id>`) before sharing this
  environment with anyone else.
