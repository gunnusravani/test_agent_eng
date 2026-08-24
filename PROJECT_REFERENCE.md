# Assignment Repository Evaluator — Project Reference

*A resume/interview prep document. Use this to write your resume bullet points and to prep talking points for interviewers.*

---

## 1. One-line pitch (for resume / elevator pitch)

> Built a full-stack Next.js platform that automatically grades student GitHub repository submissions against a course rubric using an LLM, with an admin dashboard for managing courses, tracking student progress, and analytics.

---

## 2. What it does (functional overview)

This is an **automated assignment grading platform** for a coding bootcamp/course. Students submit a public GitHub repo URL; the system:

1. **Validates repo structure** via the GitHub API — checks for a `README.md`, a `my-work/` directory, and the specific class folder (e.g. `my-work/class-03`), plus an optional "fork check" (verifying the repo is a fork of the expected upstream template). If structure is missing, the student gets an instant ✅/❌ checklist with **zero LLM calls** (cost control).
2. **Gathers source files** recursively from the class folder (skipping `node_modules`, `dist`, `build`, `venv`, `.git`, etc.), with a **token/character budgeting system** (`MAX_FILE_CHARS`, `MAX_CONTEXT_CHARS_PER_CLASS`) so large repos don't blow the LLM context window — oversized files get head/tail truncation with a marker, and files beyond the total budget are recorded as "omitted" rather than dropped silently.
3. **Sends the submission to an LLM** (OpenAI via the Vercel AI SDK's `generateObject`) with a structured Zod schema so the model returns typed, validated JSON — not free text to parse.
4. **Scores the work** 0–10 across five dimensions (completeness, correctness, quality, novelty, understanding) with a confidence score and written feedback (strengths/weaknesses/missing features/recommendations), rolled into a weighted score and a letter grade (A+ through F).
5. **Two classes have hand-built specialized graders** (`lib/graders/class-02.ts`, `lib/graders/class-03.ts`) instead of the generic 5-dimension rubric — these grade against very specific structural/functional requirements (e.g. class-03 is graded directly against a `SPEC.md` the students build against, checking exact file paths, required output dict keys, and required test fixture files by name, not just prose similarity).
6. **Persists every submission ("attempt")** to Postgres, including idempotency: re-submitting the same commit SHA against the same assignment version/prompt/model returns the cached result instead of re-billing the LLM.
7. **Shows a dashboard** with the validation checklist, per-class score cards, an aggregate score, and JSON/Markdown export.
8. Has a **password-protected `/admin` area** (JWT session cookie) for instructors to manage courses/classes, edit rubric weights, version assignments, view a student leaderboard, drill into an individual student's full attempt history, re-run ("regrade") submissions, and see analytics.

---

## 3. Tech stack

| Layer | Choice |
|---|---|
| Framework | Next.js 15 (App Router, Turbopack), React 19, TypeScript |
| Styling/UI | Tailwind CSS 4, shadcn/ui, Base UI, `next-themes` (dark mode) |
| LLM integration | Vercel AI SDK (`ai`, `@ai-sdk/openai`) — `generateObject` for schema-validated structured output |
| Schema/validation | Zod (both for LLM output schemas and API request validation) |
| GitHub integration | Octokit, with `@octokit/plugin-retry` and `@octokit/plugin-throttling` for rate-limit resilience |
| Database | Postgres via Neon (serverless driver), Drizzle ORM + drizzle-kit for migrations |
| Auth | `jose` (JWT) for a signed admin session cookie, checked in Next.js `middleware.ts` |
| Concurrency | `p-limit` (bounding parallel LLM calls when grading multiple classes) |
| Notifications | `sonner` (toasts) |
| Package manager | pnpm |

---

## 4. Architecture highlights worth discussing in an interview

**a. Schema-first LLM output.**
Instead of prompting an LLM and regex/string-parsing its reply, the app defines a Zod schema (`types/schemas.ts`) and uses the AI SDK's `generateObject`, which enforces the model returns validated, typed JSON matching that schema. When the model returns malformed output, `generateObjectWithRetry` (`lib/evaluator.ts`) catches `NoObjectGeneratedError` and **feeds the bad output + validation error back to the model** in a retry prompt (up to 3 attempts) — a self-correcting loop rather than a hard failure. This same retry helper is reused by the specialized class-02/class-03 graders against their own schemas, so the "ask the model to fix its own broken JSON" logic isn't duplicated per-grader.

**b. Cost control by gating LLM calls behind cheap checks first.**
Structural validation (README/my-work/class-folder existence) runs against the GitHub API tree *before* any LLM call. A malformed submission fails fast and free. Idempotency (same commit SHA + assignment version + prompt version + model → return the cached DB row) prevents accidental double-billing on resubmission.

**c. Assignment versioning with rubric integrity.**
Classes have "assignment versions" — a class's title/objective/deliverables/rubric weights can change over time, and each attempt is pinned to the exact assignment version it was graded against (rather than editing a class in place and silently changing grading criteria for past attempts). Rubric weights are `jsonb` and validated to sum to 100 at write time.

**d. A deliberate FK workaround, documented in code.**
`classes.current_assignment_version_id` points at `assignment_versions`, which itself FKs back to `classes` — a circular dependency at the DB level. Rather than adding a junction table, the schema comments document that this column intentionally has **no FK constraint** and is kept in sync only by one function (`createAssignmentVersionAndActivate`) — a real tradeoff you can explain the reasoning for (simplicity vs. DB-enforced integrity) if asked.

**e. Heterogeneous grading strategies behind one API and one results table.**
Most classes use a generic 5-dimension LLM rubric. Two classes (`class-02`, `class-03`) use bespoke graders with entirely different scoring components (class-02 grades four separate mini-projects; class-03 grades six spec-derived components like config files, context-builder correctness, and required test scenario fixtures). The `attempts` table stores this as a discriminated-union `jsonb` column (`structuredResult`), while `weightedScore` is always populated on a common 0–10 scale — so the results table, leaderboard, and analytics need no special-casing per grader type, but the detailed view can still show the rich breakdown.

**f. GitHub API resilience.**
Octokit is wrapped with retry and throttling plugins; rate-limit and secondary-rate-limit responses are handled explicitly (capped retries so a repo the app doesn't control can't hang a request indefinitely), and 403/404 responses are mapped to typed `GitHubError`s the API route translates into proper HTTP status codes (429 for rate limit, 404 for not found).

**g. Auth is intentionally minimal.**
Single shared admin password (no per-admin accounts) checked against `ADMIN_PASSWORD`, issuing a signed JWT (`jose`, HS256) stored in an httpOnly cookie, verified in Next.js `middleware.ts` for both page routes (`/admin/*`, redirect to login) and API routes (`/api/admin/*`, 401 JSON). A reasonable scope decision for an internal instructor tool, not a multi-tenant SaaS product — worth being able to explain *why* you didn't build full RBAC here (no requirement for it yet, YAGNI).

**h. Audit logging.**
An `audit_log` table records admin actions (create/update/archive/publish/rubric_update, etc.) against courses/classes/assignment versions with actor, timestamp, and a `jsonb` details blob — useful for instructors to see history of grading-criteria changes.

---

## 5. Data model (Postgres via Drizzle)

- **courses** — top-level container (slug, title, status: draft/published/archived)
- **classes** — belongs to a course; has an order index, status, and `expectedForkOf` for fork validation
- **assignment_versions** — versioned snapshots of a class's grading criteria (title, objective, deliverables, rubric weights); attempts reference a specific version
- **students** — deduped by lowercased GitHub username
- **attempts** — one row per graded submission: scores per dimension, weighted score, confidence, feedback JSON, optional structured-grader result, status (success/error), commit SHA, prompt version, model name
- **audit_log** — admin action history

---

## 6. Key API routes

| Route | Purpose |
|---|---|
| `POST /api/evaluate` | Core grading endpoint — validates repo, runs the right grader, persists an attempt, returns results + student's results table + attempt history |
| `GET /api/courses`, `/api/courses/[slug]/classes` | Public course/class listing |
| `GET /api/results`, `/api/leaderboard` | Public results/leaderboard lookup |
| `GET /api/attempts/[id]` | Single attempt detail |
| `/api/admin/*` (courses, classes, assignment-version, students, regrade-queue, analytics, login/logout) | Instructor-only, JWT-gated via middleware |

---

## 7. Talking points for interviewers (by likely question)

**"Walk me through the architecture."**
Next.js App Router monolith: React UI + API routes in one deploy. Public evaluate flow (`app/page.tsx` → `EvaluatorApp` → `POST /api/evaluate`) is stateless per request except for the Postgres read/write; admin flow is a separate route group behind middleware-enforced auth.

**"How do you keep LLM costs/latency under control?"**
Cheap structural checks before any LLM call; idempotency cache on (commit SHA, assignment version, prompt version, model); character budget per file and per class so token spend is bounded regardless of repo size; `maxDuration = 300` and Node.js (not Edge) runtime because grading up to ~10 classes can take close to a minute.

**"How do you handle LLM unreliability (bad JSON, hallucinated structure)?"**
Zod schema + AI SDK `generateObject` for enforced structure, plus a bounded retry loop that shows the model its own broken output and the validation error so it can self-correct, rather than failing the whole request on one bad generation.

**"What would you change/improve given more time?"**
Straight from the README's documented MVP limitations: add real per-class progress streaming (currently rotating status text while waiting), a second LLM pass for smarter summarization instead of head/tail truncation, plagiarism detection, and multi-cohort support. The store/db layer was already designed with a swappable interface so persistence could be added without touching call sites — which is exactly what happened (it shipped with an in-memory store, then Postgres was layered in later).

**"Why Drizzle instead of Prisma/raw SQL?"**
(Answer this based on your own reasoning/preference — Drizzle gives type-safe SQL-like queries with lighter runtime overhead than Prisma and first-class migration tooling via drizzle-kit; good to have your own 1-sentence justification ready.)

**"What's a tricky bug or design tradeoff you can speak to?"**
The circular FK between `classes` and `assignment_versions` (section 4d above) is a strong, specific example of an intentional tradeoff you made and documented rather than a bug — good material for a "tell me about a design decision" question.

---

## 8. Suggested resume bullet points

Pick 2–3 depending on the role you're applying for:

- *Full-stack/AI-focused:* "Built a full-stack Next.js/TypeScript platform that grades student GitHub submissions via LLM, using schema-validated structured generation (Zod + Vercel AI SDK) with a self-correcting retry loop for malformed model output."
- *Backend/data-focused:* "Designed a Postgres schema (Drizzle ORM) supporting versioned grading rubrics, idempotent submission tracking, and an audit log, serving a multi-course admin dashboard with per-student analytics and a leaderboard."
- *Systems/reliability-focused:* "Implemented cost- and latency-aware LLM grading pipeline: pre-LLM structural validation, character-budgeted context windows, GitHub API rate-limit handling with retry/throttle plugins, and idempotency caching to avoid redundant LLM calls."

---

*Generated from a read-through of the repo on 2026-08-15 (README, schema, evaluator, auth, API routes, graders). Re-check against the code before an interview if the project has changed since.*
