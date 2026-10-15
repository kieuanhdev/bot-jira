# Hardening & Refactoring Progress

Baseline verified: 2026-10-15
- `npm run typecheck`: exit 0
- `npm run lint`: exit 0
- `npm test`: 274 files / 2555 tests passing, exit 0

## Progress Table

| Task | Status | Commit | Commands run + real result | Notes/deviations |
|---|---|---|---|---|
| REF-001 | DONE | `4dc56ad` | `typecheck` (pass 0 err), `lint` (pass 0 warn), `npm test` (275 files / 2566 tests pass), `npm run build` (pass), `test:db` (not run: no DB) | Lock down avatar proxy: require session (401), rateLimit 120/min, `isJiraOrigin` origin check, Gravatar allowlist, 512KB response cap, 500 entries cache cap. Updated `07-api-contract-inventory.md` and `route.test.ts` for intentional behaviour change. |
| REF-005 | TODO | — | — | `readJsonBody` helper + unguarded routes |
| REF-004 | TODO | — | — | Harden `users/[id]/role` |
| REF-018 | TODO | — | — | De-duplicate `NON_OVERRIDABLE` release gates |
| REF-019 | TODO | — | — | Layout/board waterfalls; cached user gate |
| REF-020 | TODO | — | — | Add missing `loading.tsx` / `error.tsx` |
| REF-014 | TODO | — | — | Worker lifecycle |
| REF-013 | TODO | — | — | Log swallowed errors (`logSwallowed`) |
| REF-009 | TODO | — | — | Security headers + Origin check (`src/proxy.ts`) |
| REF-011 | TODO | — | — | Characterization tests |
| REF-012 | TODO | — | — | Shared `fetchWithTimeout`/retry; fix Bitbucket |
| REF-016 | TODO | — | — | `check-branches` N+1 + concurrency |
| REF-015 | TODO | — | — | Bound report cache; Bitbucket creds TTL |
| REF-007 | TODO | — | — | Auth rate-limit hardening |
| REF-026 | TODO | — | — | `requireSession` guard helper |
| REF-002 | TODO | — | — | Webhook signatures fail closed |
| REF-027 | TODO | — | — | Shared webhook route handler |
| REF-003 | TODO | — | — | Stop shipping all users in Settings |
| REF-010 | TODO | — | — | Stop leaking raw upstream error messages |
| REF-017 | TODO | — | — | Env fail-fast + compose/Dockerfile hardening |
| REF-006 | SKIPPED | — | — | CLOSED by decision D2 (UI filter only) |
| REF-008 | SKIPPED | — | — | CLOSED by decision D8 (accepted risk) |
| REF-021 | TODO | — | — | Bundle baseline measurement |
| REF-022 | TODO | — | — | Bundle fixes (CONDITIONAL on REF-021) |
| REF-023 | TODO | — | — | `/watch` prefetch (CONDITIONAL) |
| REF-024 | TODO | — | — | Split `admin-sync-client.tsx` |
| REF-025 | TODO | — | — | `board-client.tsx` effects cleanup |

## Discovered Issues Outside Task Scope

*(None discovered yet)*
