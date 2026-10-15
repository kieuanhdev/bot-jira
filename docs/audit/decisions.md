# Decisions Log

Approved by the project owner (user) on 2026-10-15 in the Claude Code session. Options/recommendations: `refactoring-plan.md` §5.

| ID | Question (short) | Status | Chosen option | Effect on plan |
|---|---|---|---|---|
| D1 | Add zod dependency? | APPROVED (no) | Not now | `readJsonBody` hand-written guards; no dependency changes |
| D2 | Project scope = authorization boundary for issue reads? | APPROVED | Only a UI filter | **REF-006 closed as won't-fix**; add one sentence to `architecture-guidelines.md` §7 |
| D3 | Webhook secret missing | APPROVED | Reject in production, accept + warn in dev | REF-002 READY |
| D4 | Who sees full user list in Settings | APPROVED | Admin: full; project managers: id+displayName via lazy gated route; others: none | REF-003 READY |
| D5 | Client IP source | APPROVED | **No reverse proxy (direct access)** | REF-007 IP part: ignore `x-forwarded-for` (client-controlled), do not add `TRUSTED_PROXY_HOPS`; key the limiter by account identifier (+ coarse global bucket) unless a socket IP is available — read Next docs first |
| D6 | Edit compose/Dockerfile/env required vars | APPROVED (per file) | Yes, approval per file | REF-017 READY, but ask for confirmation before each protected file |
| D7 | Stable error codes instead of raw 5xx text | APPROVED | Yes, after consumer grep | REF-010 READY |
| D8 | Refresh JWT role every 5 min | APPROVED (no) | No | **REF-008 closed (not doing)**; document the 30-day role staleness as accepted risk |
