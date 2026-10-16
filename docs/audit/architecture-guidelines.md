# Architecture Guidelines — Team Task Web

> Derived from the code as of 2026-10-15 and `docs/architecture.md` (ADR-001…007). This document **describes and preserves** the existing architecture; it proposes only small, evidence-backed additions (marked *New*). Nothing here requires a rewrite.

## 1. Existing architecture (verified)

- **Next.js 16 App Router**, `reactCompiler: true`, `output: "standalone"`. Route groups: `src/app/(app)` (authenticated shell, 285 tracked files), `src/app/(auth)`, `src/app/api` (111 `route.ts`).
- **Two processes:** web (`next start`) and worker (`src/worker.ts`, pg-boss). They share `src/lib/*` and Postgres.
- **Data:** Jira DC is the source of truth; Postgres is a shared read model (ADR-001). User mutations use the user's personal Jira credentials; service accounts read/sync (ADR-002). Webhooks primary, polling reconciles (ADR-003).
- **Server data flow:** server components prefetch with `getServerQueryClient()` (React `cache()`d) and pass state via `HydrationBoundary` (board, watch, issue detail); other pages render a client component that runs `useQuery` after hydration. Query keys live in `src/lib/query-keys.ts`, cache policy in `src/lib/query-policy.ts`.
- **Session:** next-auth v4 JWT; `getSession()` (`src/lib/session.ts`) is `cache()`d; `SessionHydrator` seeds the client `SessionProvider`. Root `SessionProvider` lacks initial `session` by design to keep `/login` and `/register` static (TASK-11), while root `SessionCacheBoundary` prevents cross-user QueryClient cache leaks on client-side login (REF-032.1).
- **Domain code** lives in `src/lib/<domain>/` (jira, bitbucket, queue, bulk, reports, releases, issues, chat, ai, sentry, stale, notify, …). `*-route-service.ts` files hold request-handling logic extracted from `route.ts`; `route.ts` stays thin.
- **Shared UI:** `src/components/ui` (shadcn/Radix), `src/components/shared` (page header, empty/async state, metric cards, filter bar), feature components colocated under `src/app/(app)/<feature>/`.

## 2. Conventions to preserve

1. Jira stays authoritative; never write local cached Jira fields except as the result of a Jira mutation or sync/webhook (`docs/architecture.md` §3.1).
2. Worker handlers are idempotent and events are de-duplicated; do not change queue names, payload shapes, retry/expire options (`docs/clean-code/00-guardrails.md`).
3. `route.ts` stays thin: parse → authorize → call a `lib/` service → map result. Business logic goes in `lib/`.
4. Pure logic (parsers, calculators, policy) lives in small files with tests beside them (`foo.ts` + `foo.test.ts`). 275 test files show this is the house style — keep it.
5. Loading = `Skeleton`; empty = icon + title + hint; semantic colour tokens; lucide icons only (`AGENTS.md`, `design-system/team-task-web/MASTER.md`).
6. Do not add manual `useMemo`/`useCallback`/`memo` to "help" the React Compiler; only with a profile showing need.
7. Public API contracts are tracked in `docs/clean-code/07-api-contract-inventory.md`; update it when a contract changes.
8. Conventional commits; one logical change per commit.

## 3. Recommended improvements (all small, additive)

| # | Improvement | Why (evidence) | Task |
|---|---|---|---|
| 1 | *New* `src/lib/http/fetch-with-timeout.ts` — the only place that wraps `fetch` with timeout + bounded retry | 5+ divergent copies; Bitbucket has none | REF-012 |
| 2 | *New* `src/lib/api/json-body.ts` — the only way an API route parses a JSON body that is not lenient-by-contract | 38 casts, ~13 unguarded | REF-005 |
| 3 | *New* `src/lib/user-gate.ts` — one `cache()`d user lookup for layout/page gates | same row queried 4× per navigation | REF-019 |
| 4 | *New* `src/lib/api/guards.ts` `requireSession`/`requireAdmin` — shape-preserving | 112 hand-rolled 401s | REF-026 |
| 5 | *New* `src/proxy.ts` — headers + Origin check only (no auth logic) | no middleware today; Next 16 renamed middleware → proxy | REF-009 |
| 6 | `logSwallowed` for intentional error swallowing | ~69 silent catches | REF-013 |

Alternatives considered (brainstorming):

- **Request validation:** (a) zod everywhere — strongest, but adds a dependency and touches 38+ routes; (b) hand-written type guards + `readJsonBody` — chosen: zero deps, fixes the real defect (unhandled 500s, unbounded bodies), and a later migration to zod only replaces the `guard` argument; (c) leave as is — leaves the 500s.
- **Auth wrapper:** (a) generic `withAuth({perm, scope, schema})` HOF for all routes — attractive but changes error shapes/status codes and contradicts the clean-code guardrail; (b) `middleware`/`proxy` authentication — Next docs advise proxy not rely on shared modules/globals, and routes need the DB-backed session anyway; (c) small `requireSession` helper adopted incrementally — chosen.
- **Shared caches (report cache, rate limiter):** (a) Redis/Postgres-backed — only needed if the web tier scales out (not demonstrated); (b) bound the in-memory cache — chosen (YAGNI).
- **Avatar proxy:** (a) delete the proxy and let the browser load Jira avatars — breaks auth'd Jira images; (b) keep proxy but authenticate + same-origin credential rule + caps — chosen.

## 4. Component organisation

- Feature code colocated: `src/app/(app)/<feature>/{page.tsx,<feature>-client.tsx,components,hooks,lib}`; shared primitives only when ≥ 2 features use them (`src/components/shared`).
- Prefer splitting a client component by **region with its own state** (row, sheet, toolbar) over generic "container/presentational" layers. Target < 400 lines per component file; do not split for its own sake (REF-024 is the one justified case; other files > 500 lines are deferred until touched).
- Move instrumentation (`performance.mark`) and persistence into named hooks (`useBoardPerfMarks`), not inline effects.

## 5. Server / Client boundaries

- `page.tsx` and `layout.tsx` are Server Components. Do auth gating, redirects and first-paint data there.
- Add `"use client"` at the smallest leaf that needs state/effects/browser APIs. 182 files are already client; do not add more without need.
- Server → client props must be minimal (no full user lists, no secrets): `server-serialization`. Never ship another user's email/credentials in an RSC payload (REF-003).
- Independent awaits go in `Promise.all`; dependent data fetching gets its own `<Suspense>` + skeleton when it blocks first paint (REF-019/020; `async-parallel`, `async-suspense-boundaries`).
- Use `React.cache()` for per-request dedup of DB reads shared by layout + page (`server-cache-react`).
- Heavy libs (recharts, exceljs, dnd-kit) stay behind `next/dynamic` or at the point of use; verify with a measurement before moving anything (REF-021/022).
- Before using any Next API read `node_modules/next/dist/docs/` (AGENTS.md). Notably: `middleware` → `proxy.ts`; `params`/`searchParams` are Promises.

## 6. TypeScript conventions

- `strict` stays on. No `any` (7 non-test occurrences exist; do not add). Prefer `unknown` + a guard at trust boundaries (request bodies, Jira/Bitbucket JSON, webhook payloads, `localStorage`).
- Avoid `as T` on external data; `as` is acceptable on values you just constructed or narrowed. Don't use `JSON.parse(JSON.stringify(x))` to clone/cast.
- Derive types from Prisma selects (`Prisma.UserGetPayload<…>`) instead of re-declaring them.
- Null handling: return `null` for "not found" in lib functions; route layer maps to 404.
- Error values: throw `Error` subclasses with a stable `code`; never rely on `.message` text for control flow or send it to clients.

## 7. Data-access conventions

- Prisma only through `src/lib/prisma.ts`. Always `select` the fields you need (credentials columns must never be selected by accident).
- Never `await` inside a loop for independent DB/HTTP work: batch with `findMany({ where: { x: { in } } })` + `Map`, or bounded concurrency (REF-016).
- Credentials: stored encrypted (AES-GCM, `src/lib/crypto.ts`); decrypt at the edge of use; never log or return them; user-initiated Jira writes use personal credentials, no silent fallback to a more privileged account (architecture invariant) — note the *read* avatar/cache fallbacks to the system account are a known exception to review under REF-001/REF-006.
- Raw SQL only where Prisma can't express it (e.g. trigram search); parameterized.

## 8. Dependency boundaries

- Allowed direction: `app/*` → `components/*`, `lib/*`; `components/*` → `lib/*` (pure helpers, query keys); `lib/*` → `lib/*` (domain modules may depend on `prisma`, `env`, `logger`, `crypto`, `http`). Verified today: `lib` does **not** import `@/app` or `@/components` — keep it that way.
- `lib/*-route-service.ts` may import `next/server` types (current practice). Queue workers and chat code must not import them; if they need the same logic, extract a pure function first.
- Domain modules do not import each other's internals; go through the module's exported facade (e.g. `jira/client.ts` facade, `bulk/ops.ts` entry).
- No new runtime dependency without approval; none are needed for this plan.

## 9. Naming and maintainability

- Files: kebab-case; `*-client.tsx` = top-level client component of a page; `*-route-service.ts` = HTTP-adjacent logic; `*.db.test.ts` = needs Postgres.
- Functions are verbs (`resolveUserProjectScope`, `readJsonBody`); booleans `is/has/can`; constants `UPPER_SNAKE` and defined **once** (REF-018).
- A function doing fetch + parse + persist should be split at those seams (hypothesis for `bulk/ops.ts`, `check-branches.ts`, `dev-status.ts` — act only when touching them).
- Comments explain why (decisions, invariants), not what; link to ADR/decision ids.
- Every behaviour change ships with a test that fails before and passes after.
