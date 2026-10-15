# Agent Handoff — for Google Antigravity

> Concise technical handoff. The plan was produced by a planning-only audit on 2026-10-15; **no application source was modified**. Your job: **execute the approved plan, preserve all existing functionality, and do not freelance.**

## 1. Project context

Team Task Web ("bot jira", package `teamweb-skel`): Next.js 16 App Router + React 19 (Compiler on) + TypeScript strict + Prisma 7/PostgreSQL + pg-boss worker + TanStack Query + next-auth v4 + Tailwind v4/shadcn. An operational layer over Jira DC / Bitbucket DC. Jira is the source of truth; Postgres is a read model. ~159k lines in `src`, 111 API routes, 275 test files.

**Baseline (2026-10-15):** `npm run typecheck` ✔ · `npm run lint` ✔ (0 warnings) · `npm test` ✔ 274 files / 2555 tests · `npm run build` **not run** · `npm run test:db` **not run** (needs Postgres). No pre-existing failures observed.

## 2. Required reading order

1. `AGENTS.md` / `CLAUDE.md` (this Next.js differs from training data — read `node_modules/next/dist/docs/` before using Next APIs; design-system rules).
2. This file.
3. `docs/audit/refactoring-plan.md` (**the plan**), §5 decisions first.
4. `docs/audit/codebase-audit.md` (evidence, coverage limits).
5. `docs/audit/architecture-guidelines.md`.
6. Existing guardrails: `docs/clean-code/00-guardrails.md`, `07-api-contract-inventory.md`, `04-manual-qa.md`, `docs/architecture.md`.
7. Per task: the files it names, plus the Next doc it names.

## 3. Recommended execution sequence

See `refactoring-plan.md` §4. In short: **Wave 1** REF-001, 004, 005, 018, 019, 020, 014, 013, 009 → **Wave 2** REF-011 → 012 → 016, 015, 007 (non-IP), 026 → **Wave 3 (only after decisions)** REF-002 → 027, 003, 006, 008, 010, 017 → **Wave 4 (measure first)** REF-021 → 022, 023, 024, 025. Start with **REF-001 (Critical)**.

## 4. Planning calls (auditor's defaults; D1 is now user-approved, the rest are auditor choices — change only via `docs/audit/decisions.md`)

- Improve in place; **no architectural rewrite**, no Redis, no new dependencies (auditor's default for D1: no zod — the human may still decide otherwise).
- `readJsonBody` hand-written guards, not zod; `requireSession` shape-preserving helper, not a generic `withAuth` HOF.
- Lenient `.catch(() => ({}))` body parsing is **contractual**: leave it.
- CSP only in Report-Only mode; Next 16 file is `src/proxy.ts` (not `middleware.ts`).
- Bundle and `/watch` changes happen only after measurement.

## 5. Implementation constraints

- **Preserve existing functionality.** Public URLs, methods, status codes and JSON shapes in `docs/clean-code/07-api-contract-inventory.md` stay unchanged except tasks labelled BEHAVIOUR CHANGE whose decision is recorded as approved.
- Do **not**: add/upgrade dependencies, edit `package*.json`, change Prisma schema/migrations, edit `.env*`, `compose.yaml`, `Dockerfile` (unless REF-017 is approved), weaken/delete tests, push, merge, deploy, or discard working-tree changes. Do not start a task whose status is CLOSED/CONDITIONAL.
- Re-locate code by symbol; line numbers in the plan are approximate.
- TDD: write the failing test, see it fail, implement, see it pass. Tests that must change because behaviour intentionally changes (REF-002) are rewritten to the new behaviour and called out in the commit message.
- One task = one commit (`fix:`/`refactor:`/`test:`/`perf:`). Small diffs; if a task's diff grows beyond its listed files, stop and record why.
- UI tasks have no automated DOM tests: perform the manual QA in the task and `docs/clean-code/04-manual-qa.md`, light and dark mode.
- If evidence in the code contradicts the plan, **stop that task, record it in `progress.md`, and continue with the next** — the audit had coverage limits (`codebase-audit.md` §3).

## 6. Testing and validation commands

```bash
npm run typecheck
npm run lint
npm test                       # full unit suite
npx vitest run <file-or-dir>   # focused
npm run build                  # stop `next dev` first; writes .next/
npm run test:db                # only if PostgreSQL available (scripts/run-db-integration-tests.mjs)
```
Run typecheck + lint + full `npm test` after **every** task; build for tasks touching `src/app`, `src/proxy.ts`, `next.config.ts`. Record actual output summaries in `progress.md`. Never claim performance gains without a before/after measurement.

## 7. Known risks

- Webhook fail-closed (REF-002) can break deployments that run without secrets → release note.
- Avatar lock-down (REF-001) may hide avatars from unlisted hosts (initials fallback applies).
- `src/proxy.ts` Origin check behind a reverse proxy (Host rewriting) — verify; webhook/auth/chat paths excluded.
- Bitbucket retries/concurrency vs rate limits (GET only, ≤ 2 retries, concurrency 3).
- Audit coverage was partial (unread files listed in `codebase-audit.md` §3); name-based test-gap detection may over-report.

## 8. Decisions (answered 2026-10-15 — see `decisions.md`)

D1 no zod · D2 project scope is only a UI filter → **REF-006 closed** · D3 webhook secret: reject in production · D4 Settings: admin full list, managers id+name via lazy gated route · D5 no reverse proxy → ignore `x-forwarded-for`, no new env · D6 compose/Dockerfile/env edits approved **per file** (confirm before each) · D7 stable error codes approved · D8 no JWT role refresh → **REF-008 closed**. Nothing else is blocked; REF-022/023 wait for measurements.

## 9. Maintaining progress

Create `docs/audit/progress.md` with a table: `Task | Status (TODO/IN-PROGRESS/DONE/BLOCKED/SKIPPED) | Commit | Commands run + real result | Notes/deviations/discovered bugs`. Update it in the same commit as each task. Bugs found outside a task's scope go in a "Discovered" section — do not fix them silently. Keep `docs/clean-code/07-api-contract-inventory.md` in sync for contract changes.

## 10. Definition of Done

Per task and overall: see `refactoring-plan.md` §8. Minimum: acceptance criteria met, V-STD green, new tests for new logic, no tests weakened, diff within listed files, commit made, progress updated, `git diff main -- package.json package-lock.json prisma/` empty.
