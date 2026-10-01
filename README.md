# Kargo Hiring Dashboard

Internal hiring tool for Kargo (Mumbai, Series A). Scores CVs against a two-layer rubric derived
from past hires, computes a composite score and tier per role, and drafts interview briefs and
emails.

**Decision model:** PASS-tier candidates are rejected automatically the moment they're scored — no
human click required. INTERVIEW and REVIEW tier candidates always wait for Arjun to click Advance
or Reject on the Pipeline page or the candidate's own page; that one click both records the
decision and sends the matching email immediately. This auto-reject-on-PASS behavior is a
deliberate design choice made to match a reference implementation of this project (see "Design
history" below) — it is **not** the zero-automation design this project started from, and it's
worth knowing about before pointing this at real candidates.

## Stack

- Next.js (App Router, TypeScript), deployed on Vercel
- Neon Postgres, accessed only from server code via `@neondatabase/serverless`
- Google Gemini (`@google/genai`) for scoring, briefs, and email drafts — JSON structured output,
  temperature 0
- Resend for email sending
- Tailwind for styling

## Scoring model

Every candidate is scored against three independent criteria layers, each via its own Gemini call:

- **Pattern** (`P1`-`P4`, weights 40/25/20/15, 60% of composite) — shared across both roles,
  derived from patterns in past hires, not the job descriptions.
- **PM role-fit** (`PM1`-`PM4`, weights 30/25/25/20, 40% of composite when evaluating for PM)
- **SPM role-fit** (`SPM1`-`SPM5`, weights 30/25/20/15/10, 40% of composite when evaluating for SPM)

Every candidate is scored against *both* role-fit layers regardless of which role they applied for.
Each criterion score is 0-4 with a confidence level (high/medium/low) and a quoted evidence line.

All of this arithmetic — layer scores, composite, tier — is computed **deterministically in code**
(`lib/scoring.ts`), never by the model itself, so it can't drift between runs. Composite and tier
thresholds:

```
composite = 0.6 * pattern_score + 0.4 * role_score
tier = INTERVIEW if composite >= 75, REVIEW if composite >= 60, else PASS
```

`recommended_role` is whichever role has the higher composite; `reroute_suggested` is set only when
the candidate applied to a specific role that differs from the recommendation (never set for an
unspecified applied role). A separate **guardrail** call then reviews the raw scores for "hollow"
scoring (high scores backed by low-confidence evidence) or near-miss tier boundaries, and can flag
`potential_flag` or override the tier.

## Setup

```bash
npm install
```

### 1. Database

The schema lives in two migrations, applied in order directly against Neon via the Neon MCP
connector (not a local `psql`/migration runner) — treat both as a record for version control, not
something to re-run against an already-initialized branch:

- [`db/migrations/0001_init.sql`](db/migrations/0001_init.sql) — original tables (`candidates`,
  `candidate_pii`, `email_drafts`, `settings`).
- [`db/migrations/0002_pattern_scoring.sql`](db/migrations/0002_pattern_scoring.sql) — replaces the
  old flat rubric with the two-layer `rubric_criteria`/`scores` model above, and adds
  `candidate_scoring` (the deterministic rollup), `briefs`, `decisions`, and `audit_log`.

If you're setting this up against a **new, empty** Neon database, run both files in order (via
`psql`, the Neon SQL editor, or the Neon MCP).

Any future schema change should go in a new numbered file under `db/migrations/` and must be
additive (`ALTER ... ADD`, new tables) — never edit or re-run an existing migration.

### 2. Environment variables

Copy `.env.example` to `.env.local` and fill in:

| Variable | Notes |
|---|---|
| `DATABASE_URL` | Neon **pooled** connection string. Get it from the Neon console's Connection Details, or `neon connection-string --pooled` once the project is linked. |
| `GEMINI_API_KEY` | From [Google AI Studio](https://aistudio.google.com/apikey). |
| `GEMINI_MODEL` | Current Flash model id. Check [ai.google.dev/gemini-api/docs/models](https://ai.google.dev/gemini-api/docs/models) for updates; default here is `gemini-3.8-flash`. |
| `RESEND_API_KEY` | Leave blank to disable sending — the Send/Advance/Reject buttons will show "Email not configured" instead of erroring. |
| `EMAIL_FROM` | Defaults to `Kargo Hiring <onboarding@resend.dev>`. With this sender and no verified domain, Resend only delivers to the email address that owns the Resend account — everything else gets a 403, which the app surfaces as a clear error rather than a crash. |
| `TEST_RECIPIENT_EMAIL` | When set, **every** send is redirected here instead of the candidate's real address, with the subject prefixed `[TEST -> original@address]`. Leave blank when testing against synthetic candidate emails you control (e.g. a course-provided test inbox); set it when candidate emails might be real. |
| `DASHBOARD_PASSWORD` | Shared password gating every page and API route (simple cookie session, no user accounts). |

`.env.local` is git-ignored. Never commit a real `DATABASE_URL`, API key, or password.

### 3. Run locally

```bash
npm run dev
```

Visit `http://localhost:3000`, log in with `DASHBOARD_PASSWORD`, and go to **Upload CVs**.

### 4. Tests

```bash
npm test
```

Covers `lib/pii.ts` (name/email/phone extraction and redaction), `lib/scoring.ts` (composite/tier
math, checked against real reference data points), and a structural test that the AI-facing
modules have no code path to `candidate_pii`.

### 5. Manual pipeline test

Three synthetic fixture CVs are in [`fixtures/`](fixtures/) (not real candidates): upload
`strong_pm_candidate.txt` and `weak_pm_candidate.txt` as **PM**, and `strong_spm_candidate.txt` as
**SPM**, then check the dashboard and `/candidate/[id]` pages render correctly and the Pipeline
page groups them by decision.

## Pages

- `/` — Dashboard: hero, stat cards (Total/Interview/Review/Pass/High potential), filters, and the
  full ranked candidate table.
- `/pipeline` — Kanban-style board: Needs review / Advancing / Declined, with one-click
  Advance/Reject/Undo.
- `/upload` — Upload CVs (single or multi-file, drag-and-drop), applied role optional.
- `/candidate/[id]` — Full scorecard: pattern layer, both role-fit layers, guardrail notes, why-
  ranked-here, probe questions, structured interview brief, decision controls, and the editable
  email draft.

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
`candidate_pii`. A test (`lib/__tests__/pii-boundary.test.ts`) enforces this by scanning the
AI-facing modules' source for the string `candidate_pii`.

Before any AI call runs, an assertion (`assertNoPiiLeaked`) checks the stripped text no longer
contains the stored name, email, or phone; if it does, ingestion aborts with `status: 'error'`
rather than risk a leak. Counts of what was redacted (never the values) are stored in
`pii_redaction_report` for auditability.

Email drafts are written by the model using the literal token `{{FIRST_NAME}}` — the model never
sees a real name — and the first name is substituted server-side from `candidate_pii` only at
preview/send time, immediately before sending.

**No API route returns raw, unredacted CV text.** Every candidate-facing API response is built from
`cv_content` (already stripped) plus `candidate_pii` fields explicitly selected one at a time —
there's no "return everything about this candidate" endpoint.

**On the Gemini API tier:** the free tier may use inputs to improve Google's models; the paid,
billing-enabled tier does not. Given this data is about real job applicants, use a billing-enabled
Gemini API key in production, not a free-tier key.

## Design history

The scoring model (pattern + role-fit layers, composite formula, tier thresholds, guardrail pass,
reroute suggestion, decision workflow) was reverse-engineered from a teammate's separate
implementation of this same assignment, to standardize on one shared design. The composite formula
and all layer weights were solved precisely from that implementation's live data (least-squares fit
against real candidate scores, confirmed exact to rounding); criterion descriptions were written
fresh from the criterion names and observed evidence patterns, since the original rubric text
wasn't available.

Two things were deliberately **not** copied from that reference, because they were found to be
privacy gaps rather than design choices worth matching:
- No password gate — this app keeps `DASHBOARD_PASSWORD` protecting every page and route.
- An API route that returned the candidate's raw, unredacted CV text alongside the scrubbed
  version — this app never does that (see "Data privacy" above).

## Known limitations

- `npm audit` shows a handful of moderate/high vulnerabilities scoped entirely to `vitest`'s dev
  test-runner dependency chain (`esbuild`/`vite`), not to any production dependency. Production
  dependencies (`npm audit --omit=dev`) are clean.
- The Neon MCP server config (`.mcp.json`, git-ignored) was minted with an account-wide API key
  rather than one scoped to this project — scope it down via the Neon console or CLI
  (`neon api-keys revoke <id>` then re-run `neon mcp --project-id <id>`) before sharing this
  environment with anyone else.
- Auto-reject-on-PASS (see top of this file) means a bad rubric or a transient model error that
  silently under-scores a real candidate results in a rejection email going out with no human in
  the loop. Worth a manual spot-check of PASS-tier decisions periodically, especially right after
  a rubric change.
