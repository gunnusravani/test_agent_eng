# Assignment Repository Evaluator

Validates that a public GitHub repository follows an expected class-assignment
structure, then uses an LLM to qualitatively grade every class's submission
and produces a per-class + aggregate report.

## How it works

1. Paste a public GitHub repo URL and click **Evaluate Repository**.
2. The app checks (via the GitHub API) that the repo has:
   - a `README.md`
   - a `my-work/` directory
   - `my-work/class-01` through `my-work/class-10`
   
   If this structure is missing, you get an immediate ✅/❌ checklist and no
   LLM calls are made.
3. If the structure is valid, the app recursively gathers each class folder's
   source/markdown/notebook files (skipping `node_modules`, `dist`, `build`,
   `venv`, `.git`, etc.), and sends each class to an LLM for evaluation.
4. Each class is scored 0-10 on completeness, correctness, quality, novelty,
   and understanding, plus a letter grade, a confidence score, and written
   feedback (strengths/weaknesses/missing features/recommendations).
5. The dashboard shows the checklist, an aggregate repository score, and one
   card per class. You can export the full report as JSON or Markdown.

## Tech stack

Next.js 15 (App Router) · TypeScript · Tailwind CSS · shadcn/ui · Vercel AI
SDK (`@ai-sdk/openai`) · Octokit · Zod

No database is used yet — reports are returned directly in the API response.
`lib/store.ts` defines a `ReportStore` interface with an in-memory
implementation so a real database (e.g. Supabase/Postgres) can be plugged in
later without touching any call sites.

## Setup

```bash
pnpm install
cp .env.example .env.local
```

Edit `.env.local`:

| Variable | Required | Notes |
|---|---|---|
| `OPENAI_API_KEY` | Yes | Used to call OpenAI for evaluation. |
| `OPENAI_MODEL` | No | Defaults to `gpt-4o`. |
| `GITHUB_TOKEN` | No, but recommended | Raises the GitHub API rate limit from 60 to 5,000 requests/hour. Create a fine-grained token with "Public Repositories (read-only)" access at https://github.com/settings/tokens. |

Then run the dev server:

```bash
pnpm dev
```

Open http://localhost:3000.

## Configuring the curriculum

`config/assignments.ts` ships with 10 generic-but-realistic placeholder
classes (title, learning objective, expected deliverables). **Edit this file
to match your actual curriculum** before evaluating real student
submissions — the LLM prompt is built directly from these fields.

## Tuning context/token budgeting

Two env vars control how much of each class's submission gets sent to the
LLM (both optional, with sane defaults):

- `MAX_FILE_CHARS` (default `8000`) — max characters kept per file (head +
  tail, with a truncation marker in between).
- `MAX_CONTEXT_CHARS_PER_CLASS` (default `40000`) — total character budget
  per class across all its files. Files beyond this budget are recorded as
  "omitted" rather than sent to the LLM.

## Deployment

The `/api/evaluate` route runs on the Node.js runtime (not Edge — it needs
Octokit and the AI SDK) and sets `maxDuration = 300`, since evaluating up to
10 classes in parallel can take up to a minute. On Vercel, make sure your
plan/tier supports function durations in that range (Fluid Compute or Pro),
or self-host.

## Known MVP limitations (by design)

- No streaming progress — the client shows rotating status text while
  waiting, not real per-class progress.
- "Summarization" of oversized files is structural (head/tail truncation),
  not a second LLM pass.
- No persistence beyond the current session/response — see `lib/store.ts`.
- No per-class rubric files, plagiarism detection, instructor dashboard, or
  multi-cohort support. These are intentionally deferred; the code is
  structured so they can be layered in later without a rewrite.
