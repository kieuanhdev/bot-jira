# Bundle Baseline Measurement (REF-021)

> Date: 2026-10-15
> Framework: Next.js 16.4.0 (Turbopack production build)
> Methodology: Analyzed `.next/build-manifest.json` and per-route `page_client-reference-manifest.js` client reference entry JS maps. File sizes measured directly from production static chunks in `.next/static/chunks/`.

## 1. Per-Route First Load JS Summary

| Route | Total First Load JS | Shared Framework/App JS | Route-Specific JS | Total Chunks |
|---|---|---|---|---|
| `/board` | **1056.21 kB** (1,081,558 B) | 543.47 kB | 512.74 kB | 24 |
| `/bulk` | **1498.20 kB** (1,534,154 B) | 543.47 kB | 954.72 kB | 21 |
| `/reports/projects/[projectKey]` | **926.19 kB** (948,421 B) | 543.47 kB | 382.72 kB | 19 |
| `/admin/sync` | **892.16 kB** (913,570 B) | 543.47 kB | 348.69 kB | 20 |

### Shared Root Chunks (loaded on all authenticated routes: 543.47 kB)
- `static/chunks/1b-71rcl1-p6y.js`: 224.55 kB (React, React-DOM, Next.js core runtime)
- `static/chunks/01r-h8flivqj6.js`: 155.06 kB (TanStack React Query, Radix primitives, utility libraries)
- `static/chunks/0cz1d0mv5g_q7.js`: 109.96 kB (Polyfill runtime)
- `static/chunks/1uer-8_c5sd2o.js`: 29.91 kB (Framework layout helpers)
- `static/chunks/2n2b5xl2zdujg.js`: 13.00 kB (Client bootstrapping)
- `static/chunks/turbopack-2c3mg3r-05n1w.js`: 10.99 kB (Turbopack loader runtime)

---

## 2. Target Library Investigation (P5 Audit Findings)

### 2.1 `@dnd-kit`
- **Location:** `static/chunks/0-v45co07sfk-.js` (60.34 kB)
- **Status in `/board`:** Present in the First Load JS bundle.
- **Import chain:** `board-client.tsx` -> `board-column.tsx` / `board-kanban-view.tsx` -> `@dnd-kit/core`, `@dnd-kit/sortable`.
- **Finding:** KanBan DnD primitives account for 60.34 kB on `/board`. Since `/board` supports both Kanban and List views, lazy-loading the Kanban DnD context when switching views or keeping it as is was hypothesized in REF-022.

### 2.2 `recharts`
- **Location:** `static/chunks/24951e584sdar.js` (Recharts SVG rendering engine)
- **Status in `/reports/projects/[projectKey]`:** **NOT in First Load JS**.
- **Finding:** The audit hypothesis that `recharts` bloated first paint of report pages was already addressed by previous optimization work. In `project-report-client.tsx` and `overview-tab.tsx`, charts and the Trends tab are already loaded on demand via `next/dynamic`. The initial page load JS for `/reports/projects/[projectKey]` is relatively lean (926.19 kB total, 382.72 kB route-specific).

### 2.3 `exceljs`
- **Location:** None in client bundles.
- **Status in `/bulk`:** **0 kB in client bundle**.
- **Finding:** `exceljs` is exclusively imported in server-side API route handlers:
  - `src/app/api/bulk/create/excel-template/route.ts`
  - `src/app/api/bulk/create/excel-import/route.ts`
  The client components (`csv-import-dialog.tsx` and `bulk-create-editor-shell.tsx`) download and upload Excel files through standard browser `fetch()` requests and multipart form data. The audit hypothesis P5 ("exceljs via bulk-logic.ts") was disproven; no client bundle optimization for `exceljs` is necessary.

### 2.4 Additional Finding: Node Polyfill Chunk in `/bulk`
- **Location:** `static/chunks/1_bgdp4x31_pm.js` (463.24 kB)
- **Status in `/bulk`:** Present in First Load JS.
- **Import chain:** `bulk-client.tsx` imports pure duration helpers `formatJiraDuration` and `parseJiraDuration` from `src/lib/worklogs/schema.ts`.
- **Root cause:** `src/lib/worklogs/schema.ts` imports Node's built-in `crypto` (`import { createHash } from "crypto"` for worklog request hash generation). Importing duration helpers from this file causes Turbopack to pull in browser polyfills (`crypto-browserify`, `stream-browserify`, `vm-browserify`, `Buffer`) totalling 463.24 kB into client bundles that use those pure helpers.
- **Recommendation for REF-022:** Extracting pure duration helpers (`parseJiraDuration`, `formatJiraDuration`) to a leaf module (e.g. `src/lib/worklogs/duration.ts`) without `crypto` imports will eliminate this 463.24 kB polyfill from `/bulk` First Load JS.

---

## 3. Route Chunk Breakdown

### 3.1 `/board` (1056.21 kB)
- `static/chunks/1b-71rcl1-p6y.js`: 224.55 kB (shared)
- `static/chunks/01r-h8flivqj6.js`: 155.06 kB (shared)
- `static/chunks/0cz1d0mv5g_q7.js`: 109.96 kB (shared)
- `static/chunks/0-v45co07sfk-.js`: 60.34 kB (`@dnd-kit`)
- `static/chunks/3pdrshsc3f3g5.js`: 52.67 kB (board components)
- `static/chunks/3ao7723trceyj.js`: 38.30 kB
- `static/chunks/0w2zd3eycsgzz.js`: 35.71 kB
- `static/chunks/0p7y823quzojl.js`: 35.15 kB
- `static/chunks/1b1u2p5x-9vta.js`: 34.98 kB
- `static/chunks/1i-mioc5ce1d9.js`: 29.93 kB
- `static/chunks/1uer-8_c5sd2o.js`: 29.91 kB (shared)
- `static/chunks/1awzle93_tc2v.js`: 28.58 kB
- `static/chunks/12qv3iit3uqia.js`: 26.12 kB
- `static/chunks/2i04mbkw-kjtn.js`: 25.90 kB
- `static/chunks/3k0smkyhdhlcj.js`: 24.95 kB
- `static/chunks/39x_wb28kxx6j.js`: 24.90 kB
- `static/chunks/44jse10045zmv.js`: 24.18 kB
- `static/chunks/14kdix769i-l5.js`: 21.19 kB
- `static/chunks/3uxcztqlwula7.js`: 17.23 kB
- `static/chunks/18uz19vuga8jr.js`: 15.42 kB
- `static/chunks/2n2b5xl2zdujg.js`: 13.00 kB (shared)
- `static/chunks/0rg8ccikw-pkv.js`: 11.62 kB
- `static/chunks/turbopack-2c3mg3r-05n1w.js`: 10.99 kB (shared)
- `static/chunks/30htf1xqeagsm.js`: 5.56 kB

### 3.2 `/bulk` (1498.20 kB)
- `static/chunks/1_bgdp4x31_pm.js`: 463.24 kB (crypto/stream polyfill)
- `static/chunks/1b-71rcl1-p6y.js`: 224.55 kB (shared)
- `static/chunks/01r-h8flivqj6.js`: 155.06 kB (shared)
- `static/chunks/0t3ika0ll3s9v.js`: 118.80 kB (bulk editor / grid logic)
- `static/chunks/0cz1d0mv5g_q7.js`: 109.96 kB (shared)
- `static/chunks/2mfhe8klkkri9.js`: 64.35 kB
- `static/chunks/3ao7723trceyj.js`: 38.30 kB
- `static/chunks/0w2zd3eycsgzz.js`: 35.71 kB
- `static/chunks/0p7y823quzojl.js`: 35.15 kB
- `static/chunks/1b1u2p5x-9vta.js`: 34.98 kB
- `static/chunks/1uer-8_c5sd2o.js`: 29.91 kB (shared)
- `static/chunks/1awzle93_tc2v.js`: 28.58 kB
- `static/chunks/12qv3iit3uqia.js`: 26.12 kB
- `static/chunks/2i04mbkw-kjtn.js`: 25.90 kB
- `static/chunks/44jse10045zmv.js`: 24.18 kB
- `static/chunks/14kdix769i-l5.js`: 21.19 kB
- `static/chunks/3uxcztqlwula7.js`: 17.23 kB
- `static/chunks/18uz19vuga8jr.js`: 15.42 kB
- `static/chunks/2n2b5xl2zdujg.js`: 13.00 kB (shared)
- `static/chunks/turbopack-2c3mg3r-05n1w.js`: 10.99 kB (shared)
- `static/chunks/30htf1xqeagsm.js`: 5.56 kB

### 3.3 `/reports/projects/[projectKey]` (926.19 kB)
- `static/chunks/1b-71rcl1-p6y.js`: 224.55 kB (shared)
- `static/chunks/01r-h8flivqj6.js`: 155.06 kB (shared)
- `static/chunks/0cz1d0mv5g_q7.js`: 109.96 kB (shared)
- `static/chunks/3--i0ol7gf03j.js`: 78.96 kB
- `static/chunks/1t1f3oe8cdsdq.js`: 55.36 kB
- `static/chunks/3ao7723trceyj.js`: 38.30 kB
- `static/chunks/0w2zd3eycsgzz.js`: 35.71 kB
- `static/chunks/0p7y823quzojl.js`: 35.15 kB
- `static/chunks/1uer-8_c5sd2o.js`: 29.91 kB (shared)
- `static/chunks/1awzle93_tc2v.js`: 28.58 kB
- `static/chunks/2i04mbkw-kjtn.js`: 25.90 kB
- `static/chunks/44jse10045zmv.js`: 24.18 kB
- `static/chunks/14kdix769i-l5.js`: 21.19 kB
- `static/chunks/3uxcztqlwula7.js`: 17.23 kB
- `static/chunks/18uz19vuga8jr.js`: 15.42 kB
- `static/chunks/2n2b5xl2zdujg.js`: 13.00 kB (shared)
- `static/chunks/turbopack-2c3mg3r-05n1w.js`: 10.99 kB (shared)
- `static/chunks/30htf1xqeagsm.js`: 5.56 kB
- `static/chunks/3f1k1tsw-x2jp.js`: 1.17 kB

### 3.4 `/admin/sync` (892.16 kB)
- `static/chunks/1b-71rcl1-p6y.js`: 224.55 kB (shared)
- `static/chunks/01r-h8flivqj6.js`: 155.06 kB (shared)
- `static/chunks/0cz1d0mv5g_q7.js`: 109.96 kB (shared)
- `static/chunks/0iltodgmu-6rh.js`: 60.63 kB
- `static/chunks/3ao7723trceyj.js`: 38.30 kB
- `static/chunks/0w2zd3eycsgzz.js`: 35.71 kB
- `static/chunks/0p7y823quzojl.js`: 35.15 kB
- `static/chunks/1uer-8_c5sd2o.js`: 29.91 kB (shared)
- `static/chunks/18q0mhd45qrbt.js`: 29.66 kB
- `static/chunks/1awzle93_tc2v.js`: 28.58 kB
- `static/chunks/12qv3iit3uqia.js`: 26.12 kB
- `static/chunks/2i04mbkw-kjtn.js`: 25.90 kB
- `static/chunks/14kdix769i-l5.js`: 21.19 kB
- `static/chunks/3uxcztqlwula7.js`: 17.23 kB
- `static/chunks/18uz19vuga8jr.js`: 15.42 kB
- `static/chunks/2n2b5xl2zdujg.js`: 13.00 kB (shared)
- `static/chunks/turbopack-2c3mg3r-05n1w.js`: 10.99 kB (shared)
- `static/chunks/27w8tzs66i69c.js`: 5.64 kB
- `static/chunks/30htf1xqeagsm.js`: 5.56 kB
- `static/chunks/1likdf7w_7a0-.js`: 3.58 kB
