# Team Task Web — Wave 5: Clean Code & Performance Plan (REF-028 → REF-040)

> Ngày lập: 2026-10-16 · Trạng thái: **CHỜ DUYỆT** (các mục BEHAVIOUR CHANGE cần chốt ở §3 trước khi làm)
> Nối tiếp `docs/audit/refactoring-plan.md` (Wave 1–4, REF-001 → REF-027 đã DONE/SKIPPED). **Không sửa file đó.**
> Tham chiếu: skill `vercel-react-best-practices`, `design-system/team-task-web/MASTER.md`, `docs/audit/architecture-guidelines.md`, `docs/clean-code/00-guardrails.md`.

---

## 0. Cách dùng tài liệu này (dành cho AI Coder — Antigravity)

1. Đọc theo thứ tự: `AGENTS.md` → `docs/audit/decisions.md` → tài liệu này → `design-system/team-task-web/MASTER.md` (+ `pages/<page>.md` nếu có).
2. Làm **đúng 1 Phase mỗi lần**. Mỗi Phase gồm nhiều task con (REF-0xx.y); **1 task con = 1 commit** (conventional message, kết thúc bằng dòng `Co-Authored-By` theo quy ước repo).
3. Số dòng trong tài liệu là **xấp xỉ** — luôn định vị code bằng tên symbol. Nếu code thực tế mâu thuẫn với kế hoạch: **dừng task đó**, ghi vào `docs/audit/progress.md` mục "Discovered", chuyển sang task kế tiếp. Không đoán.
4. Mục gắn nhãn **[BEHAVIOUR CHANGE — Dx]** chỉ được làm khi quyết định Dx ở §3 đã có trạng thái APPROVED trong `docs/audit/decisions.md`.
5. Sau mỗi task: cập nhật bảng trong `docs/audit/progress.md` (Task | Status | Commit | Lệnh đã chạy + kết quả thật | Ghi chú).

### Luật cứng (giữ nguyên từ Wave 1–4)
- **Không thêm dependency**, không sửa `package.json`, `package-lock.json`, `prisma/`, `.env*`, `compose.yaml`, `Dockerfile`. (Hệ quả: không dùng `@tanstack/react-virtual`, không cài `server-only` — xem REF-040.)
- Không đổi URL, method, status code, JSON shape của API (trừ mục được duyệt ở §3).
- TDD cho mọi logic thuần: viết test fail → sửa → test pass. Không xoá/làm yếu test hiện có.
- Không tuyên bố cải thiện hiệu năng nếu không có số đo trước/sau (phương pháp REF-021 trong `bundle-baseline.md`).
- Không push, merge, deploy, không xoá thay đổi chưa commit có sẵn trong working tree.
- **Giới hạn kiểm thử UI:** vitest chỉ chạy `src/**/*.test.ts` trong môi trường `node` — **không có DOM test**. DoD của phần UI = unit test cho logic thuần được tách ra + QA thủ công ở cả light và dark mode. Không viết "đã test component" khi chỉ test logic.

### V-STD (chạy sau MỌI task)
```bash
npm run typecheck
npm run lint            # --max-warnings=0
npm test                # baseline: CHẠY VÀ GHI LẠI ở bước 0 của Phase 0 (số 307 files / 2778 tests của REF-025 đã cũ sau d99b946)
npm run build           # bắt buộc khi chạm src/app/** hoặc next.config.ts (tắt next dev trước)
```
`npm run test:db` chỉ chạy nếu có PostgreSQL; nếu không ghi "not run: no DB". Trước khi kết thúc Phase: `git diff main -- package.json package-lock.json prisma/` phải rỗng.

---

## 1. Brainstorming — Code Smell & điểm nghẽn hiện tại (đã kiểm chứng)

Số liệu quét ngày 2026-10-16: 1.064 file trong `src/`, **164/258 file `.tsx` (không tính test) có `'use client'`** (191 nếu tính cả hook/lib `.ts` có directive), 44 file > 420 dòng.

### 1.1 Lỗi thật (không phải smell) — đã xác minh bằng đọc code
| # | Lỗi | Bằng chứng | Hậu quả |
|---|---|---|---|
| B1 | Body bị `JSON.stringify` 2 lần | `api()` luôn stringify (`src/lib/api-client.ts:28`), nhưng 6 call site truyền chuỗi đã stringify: `admin/overview/error-sheet.tsx:109,114,135,142`, `admin/sentry/admin-sentry-client.tsx:126,152` | Server `req.json()` nhận về **string** → `body.ids` undefined. Sentry review/retry trả 400. **Retry 1 dòng outbox → retry TẤT CẢ dòng failed (≤500)** vì `outbox/retry/route.ts` rơi vào nhánh "không có ids". |
| B2 | QuickPanel cướp focus khi đang gõ | Effect focus-trap `board-quick-panel.tsx:179-212` deps `[onClose]`; cha truyền lambda mới mỗi render `board-client.tsx:865` `onClose={() => setQuickPanel(null)}` | Mỗi lần BoardClient re-render (toast, isFetching) → `panelRef.focus()` chạy lại, input worklog/comment mất focus; `body.overflow` bị bật/tắt. |
| B3 | Bulk-create gọi Jira live cho project giả | `bulk/create/lib/use-bulk-create-controller.ts:~55` fallback cứng `["EPM","CICM",...]` trước khi `/api/projects` trả về | Một request live `/api/bulk/create/metadata?project=EPM` thừa (hoặc sai quyền), rồi gọi lại cho project thật. |
| B4 | 2 query khác queryFn dùng chung 1 key | `admin/overview/error-sheet.tsx:84-99` (`sentryQuery`, `outboxQuery` cùng `[...adminKeys.overview,"errors",type]`) | Hiện chỉ "may mắn" tách nhau nhờ `enabled`; dễ vỡ. |

### 1.2 Lạm dụng Client Component — đánh giá trung thực
- Có 7 file `'use client'` không dùng hook/event (`pg-boss-card.tsx`, `project-health-summary.tsx`, `leaderboard-summary-cards.tsx`, `board-summary-cards.tsx`, …). **Tất cả đều được import từ cha là client** → bỏ directive **không giảm 1 byte bundle**. Không đưa vào kế hoạch như một "tối ưu".
- Vấn đề thật là **kiến trúc fetch**: 14/19 `page.tsx` chỉ là shell mỏng render một `*-client.tsx` tự `useQuery` sau hydrate → **waterfall: HTML → JS → hydrate → fetch → render**. Chỉ `/watch` prefetch server (`HydrationBoundary`); `/board`, `/issue/[key]`, `/settings` truyền props từ server.
- Phần lớn endpoint đọc **DB (Prisma)** — prefetch được trên server. Các endpoint **live Jira/Bitbucket** phải giữ ở client: `/api/bulk/fields`, `/api/bulk/versions`, `/api/bulk/create/metadata`, transitions, versions, release permissions, `/api/health`, `/api/me/integrations`.

### 1.3 Tệp quá lớn / trách nhiệm trộn lẫn
| File | Dòng | Vấn đề chính |
|---|---|---|
| `board/board-client.tsx` | 871 | 13 useState, 22 useMemo, 7 useCallback; **React Compiler bỏ qua** vì `eslint-disable react-hooks/exhaustive-deps` (L482) |
| `board/board-quick-panel.tsx` | 623 | 23 useState cho 6 mối quan tâm; `setTimeout` không cleanup; fetch cả `/api/watch` để lấy 1 boolean |
| `bulk/bulk-configure-step.tsx` / `bulk-select-step.tsx` | 728 / 511 | Gom nhiều component; `BulkTaskList` render tới 1000+ dòng không windowing |
| `bulk/lib/bulk-logic.ts` | 717 | `filterAndSortIssues` 15 lượt `.filter()` liên tiếp |
| `stale/stale-client.tsx` | 572 | 20 useState; URL ↔ state đồng bộ 2 chiều bằng effect |
| `stale/stale-std-task-list.tsx` | 643 | O(visible × all) mỗi dòng (`buildMissingBulkFields`, `getEstimationMissingLabel`) |
| `reports/.../tasks-tab.tsx` | 613 | Copy props→state + đẩy ngược lên cha bằng effect (vòng lặp đồng bộ) |
| `admin/overview/jobs-card.tsx` | 645 | Mount song song bảng desktop + list mobile, logic trạng thái lặp 2 lần |

### 1.4 Hiệu năng (re-render, bundle, fetching)
- **React Compiler bị vô hiệu ở 3 hàm** do suppression `react-hooks/exhaustive-deps`: `BoardClient` (`board-client.tsx:482`), `BoardColumn` (`board-column.tsx:90`), `useMoreIssues` (`src/hooks/use-issues.ts:215`). Hệ quả: `growColumn` (plain function) phá `memo(BoardColumn)` mỗi render.
- **`@dnd-kit` lọt vào chunk đầu `/board`**: `board/loading.tsx:1` và `board-client.tsx:30` import `BoardSkeleton` từ `./board-column` (file này import `@dnd-kit/core` ở module scope) → vô hiệu `dynamic()` của `BoardKanbanView`. (`@dnd-kit` = 60,34 kB theo `bundle-baseline.md`.)
- **Mount 2 cây cùng lúc** (`md:hidden` + `hidden md:block`): `bulk-create-data-grid.tsx` (100 dòng × 2, mỗi dòng 4 combobox), `stale-std-task-list.tsx`, `jobs-card.tsx`.
- **Bulk-create grid:** mỗi dòng nhận `items={items}` + object mới → gõ 1 ký tự re-render toàn bộ ≤100 dòng và chạy lại `validateAllRows`; `parent-combobox.tsx:90` filter `batchItems` cả khi đóng.
- **Notifications:** `useInfiniteQuery` + `refetchInterval: 60_000` refetch **mọi trang đã tải** mỗi phút; không giới hạn `maxPages`.
- **Query key trùng/lệch** → fetch trùng: `/api/me/status` (`meKeys.status` vs `["me-status"]`), `/api/projects` (`boardKeys.projects` vs `["settings","projects"]`), `/api/board/statuses` (2 key khác nhau), `/api/me/integrations` (useQuery ở banner + raw `fetch` trong `my-integrations.tsx` → **2 lần gọi live Jira+Bitbucket** ở /settings).
- **`/api/me/integrations`** gọi Jira `me()` rồi Bitbucket **tuần tự**; **`/api/health`** ping DB, Jira, Bitbucket, Sentry, Ollama, OpenAI **tuần tự** (`api/health/route.ts:50-83`).
- `SessionProvider` lồng 2 lớp: root (`providers.tsx`, không có session → thêm 1 request `/api/auth/session`) và `session-hydrator.tsx`. Đã phân tích: **giữ nguyên là đúng** (xem REF-032.1). Chỉ cần ghi tài liệu, không refactor.
- `useNow()` ở gốc `admin-overview-client.tsx` re-render cả trang mỗi 15s.

### 1.5 Trùng lặp code (~1.150 LOC có thể gỡ)
- Phân loại status: 5 hàm; **2 hàm cho kết quả khác nhau** — "In Review" là `new` ở `lib/jira/board-config.ts:66 categoryFromLabel` nhưng `indeterminate` ở `lib/jira/project-workflow-store.ts:31 inferCategoryFromLabel`.
- Map màu status ×6, `CATEGORY_DOTS/CATEGORY_TEXT` copy y hệt giữa `board/lib/board-types.ts` và `bulk/lib/bulk-types.ts`; `CATEGORY_DOT_MAP` mâu thuẫn màu với `CATEGORY_TEXT`.
- Formatter thời gian ×4 (`timeAgo` tiếng Anh trong UI tiếng Việt, `formatRelativeTimeVi`, `formatRelativeTime`, `formatAge`), duration ×5, date ×4 + ~10 `toLocaleDateString` inline.
- Metadata loại notification ×3 (màu comment: sky vs blue). Health config ×3 (nhãn "Ổn định" vs "Đúng tiến độ"). Priority list ×6 (3 bản đảo ngược, thiếu "Lowest"). Avatar/initials copy trong `assignee-filter.tsx:24-46`.
- Jira URL tự ghép `${base}/browse/${key}` ở 6 chỗ (bỏ qua `encodeURIComponent`) dù đã có `getJiraIssueUrl`.
- UI state: ~10 error UI tự viết thay vì `ErrorState`, ~25 empty state tự viết thay vì `EmptyState`, 13 ô search tự viết thay vì `SearchField`, 5 bản copy logic đồng bộ URL search params, 3 kiểu footer "Xem thêm"/phân trang.
- Debounce tự viết ×5 (`jira-template-dialog`, `parent-combobox`, `label-combobox`, `bulk-epic-input`, board filter controller).

### 1.6 Web Design Guidelines
- `<html lang="en">` (`src/app/layout.tsx`) trong khi UI tiếng Việt → screen reader đọc sai.
- Không có `not-found.tsx` → `notFound()` ở `/issue/[key]` rơi về trang 404 mặc định không có app shell/style.
- Route thiếu `loading.tsx` riêng (dùng fallback chung `(app)/loading.tsx`): admin/*, branches, bulk/*, leaderboard, notifications, release, stale, watch. Hiện vô hại vì page là shell; **sẽ quan trọng khi thêm server prefetch** (Phase 3).
- `EmptyState` bị dùng làm error state (không có `role="alert"`) ở `board-client.tsx:625-634, 799-808`.
- 1.562 class màu palette thô (`text-amber-600`, `bg-red-50`…) trong 120 file thay vì badge variant/token ngữ nghĩa.

---

## 2. Tối ưu theo Vercel Agent Skills — ánh xạ quy tắc → Phase

| Quy tắc (`vercel-react-best-practices`) | Áp dụng ở | Phase |
|---|---|---|
| `async-suspense-boundaries`, `server-parallel-fetching`, `server-serialization` | Prefetch server + `HydrationBoundary` cho route DB-backed; `loading.tsx` theo route | 3, 8 |
| `async-parallel`, `async-api-routes` | `/api/health`, `/api/me/integrations` chạy song song | 4 |
| `bundle-dynamic-imports`, `bundle-conditional` | Tách `BoardSkeleton` khỏi file import `@dnd-kit` | 2 |
| `client-swr-dedup` (TanStack tương đương) | Chuẩn hoá query key, bỏ raw fetch trùng, `maxPages` | 4, 9 |
| `rerender-derived-state-no-effect`, `rerender-move-effect-to-event` | stale-client, tasks-tab, members-tab, app-shell `toggleSidebar` | 7, 8, 4 |
| `rerender-no-inline-components`, `rerender-memo` | Tách dòng bảng thành component nhận primitive props | 2, 5, 6, 7 |
| `advanced-event-handler-refs` / `useEffectEvent` | Focus-trap QuickPanel | 0, 2 |
| `rendering-content-visibility` + windowing | Bulk task list, notifications, sentry list | 5, 9 |
| `js-combine-iterations`, `js-index-maps`, `js-set-map-lookups` | `filterAndSortIssues`, stale std list | 5, 7 |
| `rerender-transitions` / debounce | Search ở tasks-tab, comboboxes | 6, 8 |
| Web Design Guidelines (loading/error/empty, lang, a11y) | `ErrorState`, `EmptyState`, `SearchField`, `not-found.tsx`, `lang="vi"` | 10 |

**Mẫu prefetch chuẩn** (đã có ở `src/app/(app)/watch/page.tsx`) — mọi Phase dùng prefetch phải tuân theo:
```tsx
// page.tsx (Server Component)
const session = await getSession();
const qc = getServerQueryClient();               // src/lib/query-server.ts (React.cache, per-request)
if (session?.user?.id) {
  try {
    await qc.prefetchQuery({
      queryKey: staleKeys.list(...),              // PHẢI giống hệt key client tạo ở render đầu
      queryFn: () => listStaleForUser(session.user, params), // gọi hàm lib, KHÔNG gọi api()
    });
  } catch (err) { logSwallowed("stale.prefetch", err); } // fallback: client tự fetch
}
return <HydrationBoundary state={dehydrate(qc)}><StaleClient /></HydrationBoundary>;
```
Bắt buộc: (a) queryKey server ≡ client; (b) dữ liệu trả về **cùng JSON shape với API** — `Date` phải chuyển sang ISO string như `listWatchedItems`; (c) hàm lib dùng chung cho cả route handler và page (route gọi lại hàm lib, không copy logic); (d) giữ `try/catch` fallback; (e) đo TTFB/LCP trước–sau (theo tiền lệ REF-023: nếu prefetch làm chậm TTFB rõ rệt thì không merge).

---

## 3. Quyết định cần chủ dự án chốt (D9 → D16)

Ghi kết quả vào `docs/audit/decisions.md`. Mục chưa APPROVED → task tương ứng chỉ làm phần **không đổi hành vi**.

| ID | Câu hỏi | Khuyến nghị | Ảnh hưởng |
|---|---|---|---|
| D9 | Gộp phân loại status: "review/qa/test" là `indeterminate` (workflow-store) hay `new` (board-config)? | `indeterminate` (đúng ngữ nghĩa Jira) | Cột/nhóm của task "In Review" trên board có thể đổi. REF-029.3 |
| D10 | Chuẩn hoá hiển thị vi-VN: `timeAgo` sang tiếng Việt ("5 phút trước") và các `toLocaleString()` không locale sang `vi-VN`? | Có | 26 file hiển thị thời gian khác; dấu phân cách số đổi với trình duyệt tiếng Anh. REF-029.1, REF-029.2 |
| D11 | Initials tách theo `._-` (như `lib/avatar.ts`) cho leaderboard? | Có | "nguyen.van.a" → "NV" thay vì "N". REF-029.5 |
| D12 | Priority fallback: dùng 1 danh sách chuẩn (Highest→Lowest, đủ 5 mức)? | Có | Thứ tự option filter đổi, thêm "Lowest". REF-029.4 |
| D13 | Nhãn health "healthy": "Ổn định" hay "Đúng tiến độ"? Màu notification comment: sky hay blue? Màu `CATEGORY_DOT_MAP`? | "Đúng tiến độ"; sky; theo `STATUS_GROUP_STYLE` | Thay đổi thị giác nhỏ. REF-029.3, REF-029.6 |
| D14 | `POST /api/admin/outbox/retry` không có `ids` → bắt buộc `{ all: true }` mới retry hàng loạt? | Có (fail-safe) | **Đổi API contract**; cập nhật `07-api-contract-inventory.md`. REF-028.1b |
| D15 | Đưa `view`/`sortMode` board, `filter` sentry, `tab/type/severity/q` notifications, `step` bulk-create vào URL? | Có, trừ `step` bulk-create (draft đã ở localStorage) | URL thay đổi, back/forward hoạt động. Phase 2, 9 |
| D16 | Cho phép thêm package `server-only` (sửa manifest)? | Tuỳ chọn — xem REF-040 | Nếu Không: REF-040 bị SKIPPED. |

---

## 4. Thứ tự thực thi

```
Phase 0  REF-028  Sửa lỗi đã xác nhận                       (P0, làm ngay)
Phase 1  REF-029  Thư viện thuần dùng chung (format/status/…)  (nền cho các phase sau)
Phase 2  REF-030  Module Board                               ← phụ thuộc 1
Phase 3  REF-031  Server prefetch route DB-backed            ← độc lập
Phase 4  REF-032  App shell, providers, query keys, API song song
Phase 5  REF-033  Bulk — chọn task                           ← phụ thuộc 1
Phase 6  REF-034  Bulk — tạo hàng loạt
Phase 7  REF-035  Stale                                      ← phụ thuộc 1
Phase 8  REF-036  Reports                                    ← phụ thuộc 1
Phase 9  REF-037  Notifications + Admin
Phase 10 REF-038  Đồng bộ trạng thái UI (loading/error/empty/search)
Phase 11 REF-039  Màu ngữ nghĩa (token hoá palette)          (tuỳ chọn, rủi ro thị giác)
Phase 12 REF-040  Guard `server-only`                        (chỉ khi D16 = Có)
```
Phase 3 và 4 có thể làm song song với 2. Các Phase sau Phase 1 độc lập với nhau trừ khi ghi rõ.

---

## 5. Chi tiết từng Phase

### Phase 0 — REF-028: Sửa lỗi đã xác nhận
**Mục tiêu:** Sửa B1–B4 trước mọi refactor. Không đổi cấu trúc.

**File:**
- `src/app/(app)/admin/overview/error-sheet.tsx`
- `src/app/(app)/admin/sentry/admin-sentry-client.tsx`
- `src/lib/api-client.ts` (+ tạo `src/lib/api-client.test.ts`)
- `src/app/(app)/board/board-quick-panel.tsx`, `src/app/(app)/board/board-client.tsx`
- `src/app/(app)/bulk/create/lib/use-bulk-create-controller.ts`
- `src/lib/query-keys.ts`
- (D14) `src/app/api/admin/outbox/retry/route.ts` + test + `docs/clean-code/07-api-contract-inventory.md`

**Chi tiết:**
- **REF-028.0 Baseline:** chạy V-STD trên `main` hiện tại, ghi số file/test thật vào progress làm baseline Wave 5.
- **REF-028.1 (B1):** Ở 6 call site, truyền object thẳng: `body: { ids: [id] }` thay vì `body: JSON.stringify({ ids: [id] })`. Chặn tái phát **ở tầng type, không throw runtime**: đổi kiểu tham số `body?: unknown` → `body?: object` trong `api()` (string không gán được cho `object`; interface/array/plain object vẫn gán được). `tsc` sẽ báo lỗi ở mọi call site truyền chuỗi. Các call site hiện truyền biến (`use-issue-detail.ts:20`, `board-quick-panel.tsx:235,338`, `board-actions-hook.ts:143`) đều là object — xác nhận bằng typecheck. Test: mock `fetch`, khẳng định body gửi đi là `'{"ids":["x"]}'` (serialize đúng 1 lần). Trước khi sửa, grep lại `rg -n "api\(" src | rg "JSON.stringify"` để chắc không còn site thứ 7.
- **REF-028.1b [BEHAVIOUR CHANGE — D14]:** route chỉ retry hàng loạt khi `body.all === true`; không có `ids` và không có `all` → 400 `ids_or_all_required`. Cập nhật nút "Retry all" ở `error-sheet.tsx` gửi `{ all: true }`.
- **REF-028.2 (B2):** Trong `board-quick-panel.tsx`, bọc `onClose` bằng `useEffectEvent` (React 19.2 có sẵn) và để effect focus-trap chạy **một lần khi mount** (deps chỉ gồm giá trị ổn định). Không dùng `onClose` trực tiếp trong deps. Ở `board-client.tsx`, thay lambda inline bằng handler đặt tên `closeQuickPanel`.
- **REF-028.3 (B3):** Xoá mảng fallback cứng; `availableProjects = projectsData?.items.map(p => p.key) ?? []`; query metadata `enabled: Boolean(projectKey) && Boolean(projectsData)`. Hiển thị Skeleton khi chưa có project. Nếu danh sách project rỗng → `EmptyState` "Chưa có project nào được đồng bộ".
- **REF-028.4 (B4):** Thêm `adminKeys.overviewErrors(type: "sentry" | "outbox")` vào `query-keys.ts`, dùng 2 key riêng cho 2 query.

**DoD:**
- [x] `rg -n "body: JSON.stringify" src/app` chỉ còn các site dùng **raw `fetch`** (setup-jira, register), không còn site nào dùng `api()`.
- [x] `src/lib/api-client.test.ts` pass (body object được serialize đúng 1 lần); `api("/x", { body: "str" })` gây lỗi typecheck (ghi chú `// @ts-expect-error` trong test để khoá hành vi).
- [x] QA thủ công: mở QuickPanel, gõ vào ô worklog trong lúc board refetch (bấm Sync) → không mất focus; Esc vẫn đóng; Tab vẫn bị trap.
- [x] QA: /admin → Error sheet → retry 1 dòng outbox → chỉ dòng đó đổi trạng thái (kiểm tra DB hoặc log). Sentry approve/reject/retry trả 2xx.
- [x] Network tab ở /bulk/create: không còn request `metadata?project=EPM` trước `/api/projects`.
- [x] V-STD pass.

---

### Phase 1 — REF-029: Thư viện thuần dùng chung
**Mục tiêu:** Gom helper trùng lặp về một chỗ, có unit test, **giữ nguyên output** (phần đổi output chờ D9–D13). Đây là nền để các Phase module xoá bản copy cục bộ.

**File tạo mới:**
- `src/lib/format/time.ts` + `time.test.ts` — `formatRelative`, `formatDate`, `formatDateTime`, `formatDuration(seconds, { empty, units })`
- `src/lib/format/number.ts` + `number.test.ts` — `formatNumber` (vi-VN), `formatPercent(value, { digits })`
- `src/lib/status-style.ts` + test — một map duy nhất `STATUS_CATEGORY_STYLE` (dot/text/badge variant)
- `src/lib/jira/priority.ts` + test — `PRIORITIES`, `PRIORITY_RANK`, `isHighPriority`
- `src/lib/jira/urls.ts` + test — `getJiraIssueUrl` (chuyển từ `lib/utils.ts`, giữ re-export), `getJiraVersionUrl`, `trimBaseUrl`
- `src/lib/notify/notification-types.ts` — id, label, icon, tone cho từng loại
- `src/lib/reports/health-style.ts` — label, badge variant, icon cho `HealthStatus`
- `src/hooks/use-debounced-value.ts`

**File sửa:** `src/lib/utils.ts` (re-export, không xoá export cũ), `src/lib/avatar.ts`, `src/lib/status-groups.ts`, `src/lib/jira/board-config.ts`, `src/lib/jira/project-workflow-store.ts`.

**Chi tiết:**
- **REF-029.1 Time:** Viết test "characterization" cho **từng** formatter hiện có (`timeAgo`, `formatRelativeTimeVi`, `formatRelativeTime` ở `project-report-table.tsx`, `formatAge` ở `admin-overview-client.tsx`, `formatJiraDuration`, `formatSecondsToJira`, `formatTimeSpent`, `formatDuration` ở `format-stats.ts`) trước, rồi biểu diễn mỗi cái bằng hàm mới + option. Thay call site **chỉ khi test chứng minh output giống hệt**. `timeAgo` tiếng Anh → tiếng Việt: **[BEHAVIOUR CHANGE — D10]**. Duration: `formatDuration` phải hỗ trợ `units: "jira" | "hm"` và `empty: "0m" | "—" | null` để thay được cả 3 bản.
- **REF-029.2 Number:** gộp `formatNumber` từ `admin/overview/format-stats.ts`; thay `toLocaleString("vi-VN")` inline ở `webhooks-card`, `queues-card`, `sparkline`, `admin-sentry-client`, `project-sync-row` (output giống hệt). Các `toLocaleString()` **không có locale** (`branches-client`, `branch-toolbar`, `task-detail-sheet`, `expanded-row-editor`) đổi dấu phân cách với người dùng trình duyệt tiếng Anh → **[BEHAVIOUR CHANGE — D10]** (gộp chung quyết định "chuẩn hoá hiển thị vi-VN").
- **REF-029.3 Status:** Một classifier `classifyStatusCategory(label, { mode })` trong `lib/status-groups.ts`. Trước khi gộp, test khẳng định hành vi **hiện tại** của từng hàm (`statusGroup`, `normalizeStatusToGroup`, `categoryOf`, `categoryFromLabel`, `inferCategoryFromLabel`). Gộp `categoryFromLabel` + `inferCategoryFromLabel` **[BEHAVIOUR CHANGE — D9]**. Không có D9: chỉ gộp các hàm cho kết quả giống nhau, giữ 2 hàm khác biệt và thêm comment `// Divergent by design pending D9`. Map màu: `GROUP_DOT` (`stale/lib/stale-types.ts`), `CATEGORY_DOTS`/`CATEGORY_TEXT` (board-types + bulk-types) → import từ `lib/status-style.ts`. `CATEGORY_DOT_MAP` **[D13]**.
- **REF-029.4 Priority:** chuyển `PRIORITIES` (bản đúng thứ tự trong `issue/[key]/lib/issue-detail-utils.ts`) + `PRIORITY_RANK`/`PRIORITY_META` (board-types) vào `lib/jira/priority.ts`. Thay 3 bản cùng thứ tự ngay; 3 bản fallback đảo ngược (`issue-filter-bar.tsx:~325`, `board-client.tsx:~738`, `bulk-logic.ts:~68`) **[D12]**.
- **REF-029.5 Avatar:** `assignee-filter.tsx` xoá bản copy `AVATAR_PALETTE/avatarClass/initials`, import `lib/avatar.ts` (output giống hệt). `board/lib/board-utils.ts`/`board-types.ts` bỏ re-export, import trực tiếp. `leaderboard-utils.ts getInitials` **[D11]**.
- **REF-029.6 Notification types / Health:** gộp `notifications/lib/notification-metadata.ts`, `settings/lib/notification-type-details.ts`, `lib/notify/chat-delivery.ts TYPE_LABELS` vào `lib/notify/notification-types.ts` (mỗi consumer chọn field cần). Gộp `HEALTH_CONFIG`/`HEALTH_THEME`/ring-color của portfolio vào `lib/reports/health-style.ts`. Khác biệt nhãn/màu **[D13]**; nếu chưa duyệt, giữ nhãn hiện tại theo từng consumer qua field riêng (`labelShort`, `labelLong`).
- **REF-029.7 Jira URLs:** thay 6 chỗ tự ghép `${base}/browse/${key}` (`bulk-preview-step.tsx`, `bulk-operation-detail.tsx`, `bulk-select-step.tsx`, `release-task-list.tsx`, `board/lib/board-actions-hook.ts`, `lib/notify/outbox.ts`) bằng `getJiraIssueUrl`; chuyển `getJiraVersionUrl` từ `release/release-card.tsx` và thay bản inline ở `release-publish-dialog.tsx`.
- **REF-029.8 Debounce:** `useDebouncedValue<T>(value, delayMs)`; thay ở `jira-template-dialog.tsx`, `parent-combobox.tsx`, `label-combobox.tsx`, `bulk-epic-input.tsx`. Không đổi delay hiện có.

**DoD:**
- [ ] Mỗi file mới trong `src/lib/` có `*.test.ts`; test characterization chứng minh output cũ = output mới cho mọi call site đã thay.
- [ ] `rg -n "GROUP_DOT|CATEGORY_DOTS|CATEGORY_TEXT" src` chỉ còn định nghĩa trong `lib/status-style.ts` (hoặc alias tạm có comment).
- [ ] `rg -n "/browse/\\$\\{" src` = 0 kết quả ngoài `lib/jira/urls.ts`.
- [ ] Không file nào trong `src/lib/format/*`, `status-style.ts`, `priority.ts`, `urls.ts` import Prisma/env/Node built-in (an toàn cho client bundle).
- [ ] Mục chưa có quyết định D9–D13 được ghi "deferred (Dx)" trong progress.
- [ ] V-STD pass.

---

### Phase 2 — REF-030: Module Board
**Mục tiêu:** Bật lại React Compiler cho board, đẩy `@dnd-kit` ra khỏi chunk đầu, tách `board-client.tsx` (871 dòng) và `board-quick-panel.tsx` (623 dòng) thành hook/component có trách nhiệm rõ.

**File:**
- Sửa: `src/app/(app)/board/board-client.tsx`, `board-column.tsx`, `board-quick-panel.tsx`, `board-list-view.tsx`, `board-card.tsx`, `loading.tsx`, `src/hooks/use-issues.ts`
- Tạo: `src/app/(app)/board/board-skeleton.tsx`, `board/hooks/use-board-project-picker.ts`, `board/hooks/use-board-filter-options.ts`, `board/hooks/use-board-columns-model.ts`, `board/board-content.tsx`, `board/board-quick-filter-chips.tsx`, `board/board-toast.tsx`, `board/board-list-row.tsx`, `board/quick-panel/hooks/use-quick-panel-{worklog,clone,delete,link,field-mutation}.ts`, `src/hooks/use-focus-trap.ts`, `src/hooks/use-flash-message.ts`, `src/hooks/use-windowed-rows.ts`

**Chi tiết (đúng thứ tự):**
1. **REF-030.1 Đo baseline** First Load JS `/board` theo phương pháp REF-021 (số liệu cũ đã lỗi thời sau `d99b946`). Ghi vào `bundle-baseline.md` mục "Wave 5 before".
2. **REF-030.2 `BoardSkeleton`** → `board/board-skeleton.tsx` (chỉ import `Skeleton`, không import dnd-kit/board-card). Sửa import ở `loading.tsx` và `board-client.tsx`. `board-column.tsx` re-export nếu cần. Đã truy vết (2026-10-16): các file import `@dnd-kit` là `board-column.tsx`, `board-card.tsx`, `board-kanban-view.tsx`, `lib/board-dnd-hook.ts`; đường **tĩnh** duy nhất từ `board-client.tsx`/`loading.tsx` vào chúng là `import { BoardSkeleton } from "./board-column"` (kanban/list/quick panel đều qua `dynamic()`). Đo lại: `@dnd-kit` không còn trong **entry chunk** của `/board` (vẫn được tải như chunk riêng khi Kanban mount — đúng kỳ vọng). Nếu vẫn còn: truy vết importer tĩnh còn lại, ghi vào progress, không đoán.
3. **REF-030.3 Gỡ 3 suppression** `eslint-disable react-hooks/exhaustive-deps`: `board-client.tsx:~482` (inline `findColumnForIssue` vào `useMemo` của `byColumn` hoặc khai báo đúng deps), `board-column.tsx:~90`, `use-issues.ts:~215`. Không đổi hành vi. **Kiểm chứng đã được compile**: chạy `npm run dev`, mở React DevTools → Components, `BoardClient` và `BoardColumn` phải có badge **"Memo ✨"** (không dựa vào grep bundle production — tên bị minify). Chụp màn hình/ghi chú vào progress. **Chỉ sau bước này** mới được xoá `useMemo/useCallback` thủ công trong các file đó. Xoá memo ở hàm chưa được compile = hồi quy hiệu năng. Áp dụng cùng cách kiểm chứng cho mọi Phase có bước "xoá memo thủ công".
4. **REF-030.4 Ổn định props cho cây memo:** `growColumn`, `closeQuickPanel`, handler ở L847-865 phải là hàm ổn định (tự động sau khi compile; nếu vẫn bị bỏ qua thì `useCallback`). `options` truyền cho `IssueFilterBar` (L735-746) tạo một lần trong `useBoardFilterOptions`.
5. **REF-030.5 Tách `board-client.tsx`:**
   - `useBoardProjectPicker` (state chọn project, add-project, prefetch; ~L125-261)
   - `useBoardFilterOptions` (optData/listOptions/peopleFieldData/personOptions; ~L363-414). Bỏ waterfall: query `issuesKeys.filters` **không** còn `enabled: Boolean(issueData)` — chạy song song với issues.
   - `useBoardColumnsModel` (~L438-509, L565-609)
   - `<BoardContent>` (switch loading/error/empty/kanban/list; ~L795-855). Trạng thái lỗi dùng `ErrorState` (có `role="alert"`), không dùng `EmptyState`.
   - `<BoardQuickFilterChips>`, `<BoardToast>` (dùng `useFlashMessage`, có cleanup timer).
   - Đổi tên export `CardContent` trong `board-card.tsx` → `BoardCardBody` (trùng tên shadcn).
   - Mục tiêu: `board-client.tsx` ≤ 350 dòng, không còn IIFE trong JSX.
6. **REF-030.6 Tách QuickPanel:** 5 hook `use-quick-panel-*` gom 23 useState theo mối quan tâm; `useFocusTrap(ref, { onEscape })` thay effect hiện tại (dùng `useEffectEvent`); `useFlashMessage` thay các `setTimeout` không cleanup (L271, 274, 327, 399). Trạng thái "đang theo dõi" lấy bằng `useQuery({ queryKey: watchKeys.all, select: d => d.items.some(i => i.key === key) })` để dùng chung cache với /watch thay vì fetch riêng.
7. **REF-030.7 List view:** tách `BoardListRow` nhận primitive props (`isSelected`, `statusCategory`); tính `now` một lần ở cha; `options.epics` → `Map` lookup. Tách logic windowing L172-225 thành `src/hooks/use-windowed-rows.ts` (dùng lại ở Phase 5, 9) + test cho hàm tính range thuần.
8. **REF-030.8 [D15]** `view`/`sortMode` vào URL qua `useBoardFilterController` hiện có (giữ localStorage làm giá trị mặc định).

**DoD:**
- [ ] `rg -n "eslint-disable.*react-hooks/(exhaustive-deps|rules-of-hooks)" src` = 0.
- [ ] Bằng chứng badge "Memo ✨" cho `BoardClient` và `BoardColumn` ghi trong progress.
- [ ] Số đo First Load JS `/board` trước/sau ghi trong `bundle-baseline.md`.
- [ ] `board-client.tsx` ≤ 350 dòng; `board-quick-panel.tsx` ≤ 300 dòng; mỗi hook mới có test cho phần logic thuần (`use-windowed-rows` range calc, columns model).
- [ ] Test hiện có trong `board/lib/*.test.ts` pass không sửa.
- [ ] QA thủ công (light + dark): kéo thả kanban, chuyển List/Kanban, multi-select + rubber-band, phím tắt điều hướng, QuickPanel (sửa field, worklog, clone, delete, link, watch), đổi project, filter + quick filter chips, toast tự tắt.
- [ ] React DevTools Profiler: bật toast không re-render các `BoardColumn` (ảnh chụp/ghi chú trong progress).
- [ ] V-STD + build pass.

---

### Phase 3 — REF-031: Server prefetch cho route DB-backed
**Mục tiêu:** Xoá waterfall "hydrate → fetch" ở các trang dữ liệu đọc từ DB, theo mẫu `/watch` (§2). Chuyển logic inline của route handler sang hàm lib dùng chung. Thêm `loading.tsx` theo route để streaming hiển thị khung đúng hình.

**Mỗi route = 1 task con, theo thứ tự rủi ro tăng dần:**

| Task | Route | Hàm lib (tạo/tái dùng) | queryKey phải khớp | Ghi chú |
|---|---|---|---|---|
| 031.1 | `/stale` | tái dùng `parseStaleQueryParams` + `executeStaleQuery(session.user, params)` | `staleKeys.list(project, assignee, status, reason, severity)` với giá trị mặc định theo `?view` | Page hiện bọc `Suspense` vì `useSearchParams`; giữ nguyên |
| 031.2 | `/release` | tạo `listReleasesForUser(session, { includeArchived: true })` trong `src/lib/releases/list-route-service.ts`; route gọi lại hàm này | `["releases","all"]` (chuyển vào `releasesKeys`), `boardKeys.projects`, `meKeys.status` | **Không** prefetch `releasesKeys.permissions` (live Jira) |
| 031.3 | `/leaderboard` | tái dùng `getLeaderboardData` | chuyển key tay `["leaderboard", timeframe, year, month, quarter, project]` vào `leaderboardKeys.list(...)` trong `query-keys.ts`; tính mặc định bằng timezone `Asia/Ho_Chi_Minh` ở **cả** server và client (hàm chung `getDefaultLeaderboardPeriod(now)`) | Lệch timezone ⇒ key lệch ⇒ chỉ refetch, không lỗi; vẫn phải test |
| 031.4 | `/notifications` | tách logic GET khỏi `src/app/api/notify/route.ts` → `src/lib/notify/list.ts listNotifications(userId, { limit, cursor, unreadOnly, type })` | `notificationsKeys.infinite({ unreadOnly:false, type: undefined })` dùng `prefetchInfiniteQuery` với `initialPageParam` giống client | |
| 031.5 | `/admin`, `/admin/sync`, `/admin/sentry` | tái dùng `listAdminProjectSync`; tách `getAdminMetrics()`, `listAuditEntries(limit)`, `listSentryImports(state)` từ route | `adminKeys.projects`, `["admin","sentry","review"]`, metrics, audit | Prefetch trong `admin/layout.tsx` cho 2 query của `AdminNav`. **Không** prefetch `/api/health` |
| 031.6 | `/branches` | tách `listBranchesForUser(session, filters)` / `listDeliveryTasksForUser(...)` từ route (đang inline với `getUserScopedProjects`) | `branchesKeys.tasks(filters)` hoặc `branchesKeys.list(filters)` theo view + `branchesKeys.facets`, filters từ `parseBranchFilters(searchParams)` | `page.tsx` nhận `searchParams: Promise<...>` (Next 16) |

**Mỗi task con gồm:**
- Viết test cho hàm lib mới (shape JSON khớp response hiện tại của route; Date → ISO string). Route handler gọi hàm lib, test route hiện có vẫn pass **không sửa**.
- `page.tsx` thành `async` Server Component theo mẫu §2.
- Tạo `loading.tsx` của route dùng `Skeleton` mô phỏng bố cục thật (header + toolbar + danh sách), tuân `MASTER.md`.
- Đo trước/sau trên build production (`npm run build && npm start`): TTFB và thời điểm nội dung chính xuất hiện (DevTools Performance, 3 lần, lấy trung vị). Ghi số vào progress. Nếu TTFB tăng > 300 ms mà không giảm thời gian thấy nội dung → **không merge**, ghi lý do (tiền lệ REF-023).

**Đọc trước:** `node_modules/next/dist/docs/01-app/01-getting-started/` (fetching data, streaming) và `02-guides/caching-without-cache-components.md` — Next 16 có thay đổi so với kiến thức cũ.

**DoD (mỗi route):**
- [ ] Mở trang với cache trống: tab Network **không** có request tới endpoint đã prefetch trong lần render đầu (React Query DevTools: query ở trạng thái `success` ngay khi mount).
- [ ] Không có hydration warning trong console.
- [ ] Tắt DB / ném lỗi trong hàm lib → trang vẫn render, client tự fetch (fallback hoạt động).
- [ ] Test hàm lib mới pass; test route cũ pass không sửa; API contract không đổi.
- [ ] Số đo trước/sau ghi trong progress.
- [ ] V-STD + build pass; build output: route chuyển sang `ƒ` (dynamic) là đúng kỳ vọng.

---

### Phase 4 — REF-032: App shell, providers, query keys, API song song
**Mục tiêu:** Loại bỏ request trùng trên mọi trang, chuẩn hoá query key, song song hoá 2 API gọi upstream tuần tự.

**File:** `src/app/providers.tsx`, `src/app/(app)/session-hydrator.tsx`, `src/app/(app)/app-shell.tsx`, `src/app/layout.tsx`, `src/lib/query-keys.ts`, `src/app/(app)/settings/my-integrations.tsx`, `src/app/(app)/settings/project-leaders-settings.tsx`, `src/app/(app)/settings/project-people-fields-settings.tsx`, `src/hooks/use-branches.ts`, `src/app/(app)/branches/lib/use-branches-controller.ts`, `src/app/(app)/bulk/lib/use-bulk-configure.ts`, `src/app/api/health/route.ts`, `src/app/api/me/integrations/route.ts`; tạo `src/app/(app)/unread-badge.tsx`.

**Chi tiết:**
- **REF-032.1 Session provider — KHÔNG di chuyển, chỉ ghi tài liệu.** Đã phân tích (2026-10-16): root `SessionProvider` không có `session` nên luôn gọi `/api/auth/session` một lần khi mount. Không bỏ được request này mà không truyền session cho root, và truyền session cho root sẽ làm `/login`, `/register` thành dynamic (TASK-11 cố ý giữ tĩnh). Không chuyển `SessionCacheBoundary` vào `SessionHydrator`: login dùng `signIn(..., { redirect: false })` + `router.push` (điều hướng phía client, `login-client.tsx:~81-123`). Boundary đặt dưới hydrator sẽ remount với ref `undefined` mỗi lần vào `(app)` và **bỏ lỡ việc đổi user** → rò cache user A sang user B. Việc cần làm: thêm comment giải thích ở `providers.tsx` + 1 dòng trong `architecture-guidelines.md`. (Ở `/logout`, `signOut({ callbackUrl })` reload cứng nên an toàn.)
- **REF-032.2 Query key:** Mọi key viết tay → factory trong `query-keys.ts`. **Mỗi lần gộp 2 key thành 1 phải xác nhận cùng endpoint + cùng query params + cùng response type + `select` tương thích**; nếu khác, giữ key riêng nhưng đặt trong factory và ghi chú lý do. Ứng viên: `["me-status"]`, `["me","status"]` → `meKeys.status`; `["settings","projects"]` → `boardKeys.projects`; `["projects"]` (use-bulk-create-controller) → `boardKeys.projects`; `["board","statuses",p]` (use-bulk-configure) → `boardKeys.statuses(p)`; `["issue-search",q]` → `issuesKeys.search`. Về `["projects",p,"people-fields"|"members"]`: **trước khi** đổi prefix, grep mọi `invalidateQueries({ queryKey: boardKeys.projects })` (hiện có ở `use-active-sync.ts:39`, `board-client.tsx:147,240`, `use-jira-sync.ts:61,120`, `admin-sync-client.tsx:103`) và xác định từng chỗ có **cố ý** dựa vào cascade làm mới people-fields/members không (ví dụ sau sync Jira). Chỗ nào cần cascade thì thêm invalidation tường minh cho key con trong cùng commit. Test cho factory (key ổn định, kiểm prefix bằng `matchQuery`).
- **REF-032.3 MyIntegrations:** thay raw `useEffect`+`fetch` bằng `useQuery({ queryKey: meKeys.integrations })` — dùng chung cache với `ReconnectBanner`.
- **REF-032.4 API song song:** `/api/me/integrations` chạy Jira `me()` và Bitbucket check bằng `Promise.all`; `/api/health` chạy các ping bằng `Promise.allSettled`, mỗi ping bọc `withTimeout` (`src/lib/async/with-timeout.ts`, đã có). Giữ nguyên JSON shape; test khẳng định thời gian ≈ max thay vì tổng (fake timers).
- **REF-032.5 App shell:** tách `UnreadBadge` sở hữu `useUnreadCount()` (shell không re-render khi số đổi); gộp 3–4 bản render badge; `toggleSidebar` ghi cookie/localStorage **trong event handler**, không trong updater của `setState` (updater phải thuần — chạy 2 lần ở StrictMode).
- **REF-032.6** `src/app/layout.tsx`: `lang="vi"`.

**DoD:**
- [ ] `rg -n "queryKey: \\[\"" src/app src/hooks src/components` → chỉ còn key có lý do ghi chú (mục tiêu 0).
- [ ] Network khi vào /settings: đúng 1 request `/api/me/integrations`.
- [ ] Comment giải thích vì sao giữ nguyên bố cục SessionProvider/SessionCacheBoundary đã có trong `providers.tsx`.
- [ ] Test `/api/health` và `/api/me/integrations` hiện có pass; test mới cho chạy song song pass.
- [ ] QA: đăng nhập, đăng xuất, đổi user → cache được xoá (không thấy dữ liệu user trước).
- [ ] V-STD + build pass.

---

### Phase 5 — REF-033: Bulk — chọn task (`/bulk`)
**Mục tiêu:** Danh sách tới 1000+ dòng phải mượt; tách 2 file "bó" component; lọc một lượt.

**File:** `src/app/(app)/bulk/bulk-select-step.tsx`, `bulk-configure-step.tsx`, `bulk-select-card.tsx`, `bulk/lib/bulk-logic.ts`, `bulk/lib/use-bulk-selection.ts`, `bulk/lib/use-bulk-operations.ts`; tạo `bulk/bulk-task-filters.tsx`, `bulk/bulk-task-list.tsx`, `bulk/bulk-operation-mode-switch.tsx`, `bulk/bulk-worklog-form.tsx`, `bulk/bulk-transition-form.tsx`, `bulk/bulk-field-picker.tsx`, `bulk/bulk-field-inputs.tsx`, `bulk/lib/bulk-options.ts`, `bulk/lib/bulk-filter.ts`, `bulk/lib/bulk-action.ts`.

**Chi tiết:**
- **REF-033.1 Tách `bulk-logic.ts`** thành `bulk-options.ts` (derive*), `bulk-filter.ts` (`filterAndSortIssues`), `bulk-action.ts`; `bulk-logic.ts` re-export để không vỡ import/test cũ. `bulk-logic.test.ts` pass không sửa.
- **REF-033.2 Lọc một lượt:** viết lại `filterAndSortIssues` thành **một** predicate kết hợp (thay 15 `.filter()`), `now` tính một lần, `Set` cho lookup. Viết test so sánh kết quả cũ/mới trên fixture ≥ 500 issue với tổ hợp filter ngẫu nhiên có seed (property-style). Tách `filterOnlySelected` ra khỏi memo phụ thuộc `selected` để toggle checkbox không chạy lại toàn bộ filter.
- **REF-033.3 Windowing:** `BulkTaskList` dùng `src/hooks/use-windowed-rows.ts` (từ Phase 2 — nếu Phase 2 chưa xong, tạo hook ở đây). **Không** thêm `@tanstack/react-virtual`. Giữ load-more server hiện có.
- **REF-033.4 Tách component** theo danh sách file ở trên; `BulkTaskFilters` nhận `options`/`capabilities` đã tính sẵn. `bulk-history-card` dùng `useQuery` cho `/api/bulk/operations` thay `useEffect` + `api` thủ công (`use-bulk-operations.ts`).
- **REF-033.5** `BulkFieldInputs`: tính `label.split(",")` một lần (tránh O(labels²)).
- **REF-033.6 [D15]** `filterProject`, filters, `quickFilter`, `sortOption` vào URL dùng lại `serializeIssueFilters`/`parseIssueFilters` như board.

**DoD:**
- [ ] Test tương đương `filterAndSortIssues` cũ/mới pass; benchmark nhỏ (vitest `bench` hoặc `performance.now()` trong test) ghi số trước/sau cho 1000 issue.
- [ ] Với 1000 task: số dòng DOM trong danh sách ≤ ~60 (đếm qua DevTools); cuộn mượt, chọn/bỏ chọn không giật.
- [ ] `bulk-configure-step.tsx` và `bulk-select-step.tsx` mỗi file ≤ 200 dòng.
- [ ] QA: chọn task theo filter/quick filter, chọn tất cả, cấu hình từng loại thao tác (worklog, transition, field), preview, chạy, xem lịch sử — light + dark.
- [ ] V-STD + build pass.

---

### Phase 6 — REF-034: Bulk — tạo hàng loạt (`/bulk/create`)
**Mục tiêu:** Gõ trong grid không re-render toàn bộ; chỉ mount 1 cây (desktop hoặc mobile); gom editor field trùng lặp.

**File:** `src/app/(app)/bulk/create/bulk-create-data-grid.tsx`, `bulk-create-table-row.tsx`, `bulk-create-mobile-card.tsx`, `expanded-row-editor.tsx`, `task-detail-sheet.tsx`, `parent-combobox.tsx`, `jira-template-dialog.tsx`, `create-progress.tsx`, `create-preview.tsx`, `csv-import-dialog.tsx`, `bulk-create-client.tsx`, `bulk-create-editor-shell.tsx`; tạo `src/hooks/use-media-query.ts`, `bulk/create/fields/{issue-type,priority,fix-version,components,points,estimate,due-date}-field.tsx`, `bulk/create/description-editor.tsx`, `bulk/create/lib/use-csv-import.ts`, `bulk/create/lib/export-operation-csv.ts`.

**Chi tiết:**
- **REF-034.1 Một cây:** `useMediaQuery("(min-width: 768px)")` (dùng `useSyncExternalStore`, giá trị server = desktop) → chỉ render desktop rows **hoặc** mobile cards. Áp dụng tương tự ở `ExpandedRowEditor` (đang mount 2 lần).
- **REF-034.2 Props ổn định cho dòng:** thay `items={items}` bằng `itemsLength` + `parentCandidates` tính một lần ở grid; `effectiveIssueTypeName` tính trước theo row id (Map); handler theo id (`onToggleExpand(id)`) thay lambda per-row. `validateAllRows` chỉ chạy lại khi `items` đổi thật (đã đúng nếu compiler compile — kiểm chứng như REF-030.3).
- **REF-034.3** `parent-combobox.tsx`: chỉ filter khi `open`. `jira-template-dialog.tsx`: dùng `useDebouncedValue`, dọn `setTimeout` không cleanup (~L283), tách `TemplateIssueList`, `TemplatePreview`.
- **REF-034.4 Field editors dùng chung:** tách 7 field editor + `DescriptionEditor`, dùng ở `bulk-create-table-row`, `bulk-create-mobile-card`, `expanded-row-editor`, `task-detail-sheet`. Mỗi editor là controlled component thuần (value + onChange + metadata).
- **REF-034.5** `create-progress.tsx`: tách `ProgressStatusBanner`, `ProgressItemsTable`/`ProgressItemRow` (memo theo item), chuyển `exportOperationCsv` vào `lib/export-operation-csv.ts` + test. Poll 2s chỉ re-render dòng đổi trạng thái.
- **REF-034.6** `create-preview.tsx`, `csv-import-dialog.tsx` (11 state → `useCsvImport` với `useReducer`), `bulk-create-client.tsx`: tách theo các component đã nêu ở §1.3; xoá memo thủ công **sau khi** xác nhận compile.

**DoD:**
- [ ] Với 100 dòng: gõ vào summary một dòng → Profiler cho thấy chỉ dòng đó (và status bar) re-render.
- [ ] DOM chỉ chứa 1 trong 2 cây (desktop/mobile) ở mỗi breakpoint.
- [ ] Không còn định nghĩa trùng field editor giữa 4 file (grep tên field component chỉ còn trong `fields/`).
- [ ] Test `contract.test.ts`, `bulk-create-*.test.ts`, test mới cho `export-operation-csv` và reducer `use-csv-import` pass.
- [ ] QA: tạo thủ công, dán từ Excel, import CSV/Excel, template Jira, chỉnh dòng mở rộng, draft khôi phục, preview, chạy, export CSV kết quả — desktop + mobile, light + dark.
- [ ] V-STD + build pass.

---

### Phase 7 — REF-035: Stale (`/stale`)
**Mục tiêu:** Một nguồn sự thật cho filter (URL), bỏ O(n²) mỗi dòng, chỉ mount 1 cây.

**File:** `src/app/(app)/stale/stale-client.tsx`, `stale-std-task-list.tsx`, `stale-task-list-card.tsx`, `stale-team-sections.tsx`, `stale/lib/stale-utils.ts`, `stale/lib/stale-types.ts`; tạo `stale/hooks/use-stale-url-state.ts`, `stale/hooks/use-std-keyboard-nav.ts`, `stale/stale-std-task-row.tsx`, `stale/stale-std-mobile-card.tsx`, `stale/stale-standardization-view.tsx`, `stale/stale-analysis-view.tsx`, `src/components/shared/show-more-footer.tsx`, `src/hooks/use-show-more.ts`.

**Chi tiết:**
- **REF-035.1 O(n²):** thêm `buildProjectEstimationUsage(allStdTasks): Map<project, { hasEst, hasPts }>` vào `stale-utils.ts` (tính 1 lần); `getEstimationMissingLabel` và `buildMissingBulkFields` nhận map này. Test tương đương output cũ.
- **REF-035.2 URL state:** `useStaleUrlState` đọc **trực tiếp** từ `useSearchParams` (view, tab, scope filters, std filters gồm cả `stdStatusFilter`) và ghi qua `router.replace` trong event handler. Xoá effect mirror state→URL (L105-123) và việc đọc `window.location.search`. Filter server `project/assignee/status/reason/severity` vào URL **[D15]**. Prune `selectedStdTasks` khi filter đổi (tính trong render, không effect).
- **REF-035.3 Tách:** `StandardizationView`, `StaleAnalysisView`, `ActiveDrilldownChips`, `StdTaskRow`, `StdMobileCard`, `useStdKeyboardNav`. Một cây desktop/mobile qua `useMediaQuery` (Phase 6).
- **REF-035.4 Show more:** `useShowMore(total, step = 50)` + `<ShowMoreFooter>` thay 6 bản copy (stale-std-task-list, stale-task-list-card, stale-client, stale-team-sections, board-team-view, board-column).
- **REF-035.5** Nếu Phase 3 đã prefetch `/stale`, đảm bảo key mặc định từ `useStaleUrlState` khớp key server.

**DoD:**
- [ ] Back/forward trình duyệt khôi phục đúng view/tab/filter; reload giữ filter.
- [ ] Test tương đương cho util mới; test stale hiện có pass.
- [ ] `stale-client.tsx` ≤ 250 dòng; `stale-std-task-list.tsx` ≤ 250 dòng.
- [ ] QA: hai view, drilldown chip, chọn nhiều + quick edit, phím tắt, "Xem thêm" — light + dark, desktop + mobile.
- [ ] V-STD + build pass.

---

### Phase 8 — REF-036: Reports (`/reports/projects`, `/reports/projects/[projectKey]`)
**Mục tiêu:** Bỏ vòng đồng bộ props↔state↔URL, dedupe query members, debounce search, rồi mới prefetch.

**File:** `src/app/(app)/reports/projects/project-portfolio-client.tsx`, `page.tsx`, `project-report-table.tsx`, `[projectKey]/page.tsx`, `project-report-client.tsx`, `tasks-tab.tsx`, `members-tab.tsx`, `trends-tab.tsx`, `[projectKey]/lib/use-project-report-controller.ts`; tạo `reports/lib/parse-period-params.ts`, `reports/projects/[projectKey]/lib/use-report-url-state.ts`, `reports/projects/[projectKey]/lib/use-project-members.ts`, `src/hooks/use-url-state.ts`, `[projectKey]/tasks-tab/{active-filter-banner,activity-pills,tasks-toolbar,report-tasks-table}.tsx`, `src/components/shared/pagination-footer.tsx`.

**Chi tiết:**
- **REF-036.1 Guard `router.replace`:** `project-portfolio-client.tsx` (L~49-62) chỉ `replace` khi query string mới khác hiện tại (dùng lại logic `shouldReplaceReportUrl` của trang chi tiết). **Bắt buộc trước khi prefetch** — nếu không, RSC round-trip sẽ chạy prefetch 2 lần.
- **REF-036.2 Parse period dùng chung:** `parsePeriodParams(searchParams)` dùng `DEFAULT_REPORT_TIMEZONE` từ `lib/reports/period.ts` thay chuỗi cứng `"Asia/Ho_Chi_Minh"` ở 2 nơi. Test.
- **REF-036.3 Tasks tab controlled:** bỏ copy `initial*` props vào state + 3 prev tracker (L98-124) + effect đẩy ngược `onFilterChange` (L127-129). `activity`, `statusGroup`, `assignee`, `search`, `offset` đọc/ghi qua `useReportUrlState` trong controller. `search` debounce 300ms bằng `useDebouncedValue` trước khi vào queryKey.
- **REF-036.4** `useProjectMembers(projectKey, params)` thay 3 bản query members (project-report-client, members-tab, tasks-tab). `members-tab.tsx`: `transitionDirection` tính trong handler, xoá effect setState.
- **REF-036.5 Tách** tasks-tab thành các file trong `tasks-tab/`; `PaginationFooter` dùng chung (cũng thay ở `risk-task-table.tsx`, `branches-client.tsx`). Error UI dùng `ErrorState` (thay 2 bản card giống hệt ở portfolio + report client, 3 bản 1 dòng ở trends/tasks/members).
- **REF-036.6 Prefetch** (sau 036.1): `/reports/projects` prefetch `reportsKeys.portfolio(params)` qua `getOrComputeReport`; `[projectKey]` prefetch `reportsKeys.project(k, params)` và query của tab đang active nếu có `?tab`. Theo DoD Phase 3 (đo trước/sau; hàm lib; key khớp; ISO date). Kiểm tra `report-url-state.ts` không có `"use client"` trước khi import trên server.

**DoD:**
- [ ] Vào trang portfolio: chỉ 1 lần render server (log hoặc đếm request RSC), không có `router.replace` khi URL đã chuẩn.
- [ ] Gõ search ở tasks tab: tối đa 1 request mỗi 300ms ngừng gõ.
- [ ] Đổi tab/filter → URL đổi; back/forward khôi phục đúng.
- [ ] Network: 1 request members cho mỗi tổ hợp params dù 3 component dùng.
- [ ] Test mới (parse period, url state thuần) + test reports hiện có pass.
- [ ] QA: mọi tab, KPI filter, risk table phân trang, member detail, hover prefetch — light + dark.
- [ ] V-STD + build pass.

---

### Phase 9 — REF-037: Notifications + Admin
**File:** `src/app/(app)/notifications/notifications-client.tsx`, `notification-list.tsx`, `src/hooks/use-notifications.ts`, `src/app/api/notify/route.ts` (chỉ nếu D15 + thêm filter `read` server — **đổi contract, cần duyệt riêng**), `src/app/(app)/admin/admin-overview-client.tsx`, `admin/overview/jobs-card.tsx`, `admin/sentry/admin-sentry-client.tsx`; tạo `notifications/hooks/use-notification-filters.ts`, `notifications/hooks/use-notification-selection.ts`, `notifications/notifications-batch-bar.tsx`, `admin/overview/stale-indicator.tsx`, `admin/overview/system-status-banner.tsx`, `admin/overview/jobs/{use-job-rows.ts,job-table-row.tsx,job-mobile-item.tsx,job-filter-tabs.tsx}`, `admin/sentry/{sentry-row,sentry-bulk-bar,sentry-filter-tabs}.tsx`.

**Chi tiết:**
- **REF-037.1 Notifications:** `maxPages: 5` (hoặc chỉ refetch trang đầu bằng `refetchPage` tương đương v5 — đọc docs TanStack v5 trong `node_modules/@tanstack/query-core` trước); windowing danh sách bằng `use-windowed-rows`; `tab/type/severity/q` vào URL **[D15]**. Ghi rõ trong UI rằng `stats` chỉ tính trên các trang đã tải, hoặc lấy số từ server (`/api/notify/unread-count` đã có).
- **REF-037.2 Admin overview:** `useNow()` chuyển vào `<StaleIndicator>` (chỉ component nhỏ re-render mỗi 15s); tách `SystemStatusBanner`, `MetricCardsRow`, `ServicesCard`; thay `formatAge` bằng `lib/format/time`.
- **REF-037.3 Jobs card:** `useJobRows` tính trước `{ failing, isRunning, isStuck }` mỗi job (Set lookup thay `.some/.includes` mỗi dòng); 1 cây desktop/mobile; `showToast` dùng `useFlashMessage`; bỏ IIFE và render helper trong JSX.
- **REF-037.4 Sentry:** phân trang client 50/trang bằng `PaginationFooter`; `selected` được lọc theo danh sách hiện có mỗi lần render (không effect); `filter` vào URL **[D15]**; tách `SentryRow`, `SentryBulkBar`, `SentryFilterTabs`.

**DoD:**
- [ ] Notifications sau 10 lần "tải thêm": mỗi phút chỉ ≤ `maxPages` request; DOM ≤ ~60 item.
- [ ] Admin overview: Profiler cho thấy tick 15s chỉ re-render `StaleIndicator`.
- [ ] `jobs-card.tsx` ≤ 200 dòng; `admin-sentry-client.tsx` ≤ 200 dòng.
- [ ] QA: mark read/unread, batch, filter, SSE đẩy thông báo mới; admin retry/approve/reject (sau Phase 0), filter jobs, error sheet — light + dark.
- [ ] V-STD + build pass.

---

### Phase 10 — REF-038: Đồng bộ trạng thái UI (Web Design Guidelines)
**Mục tiêu:** Mọi loading/error/empty/search dùng component chung; a11y cơ bản.

**File:** `src/components/shared/empty-state.tsx` (thêm `size?: "default" | "compact"`), `async-state.tsx`, `feedback-banner.tsx`, `search-field.tsx`, `src/app/(app)/not-found.tsx` (mới), cùng các file liệt kê trong §1.5 (danh sách đầy đủ: báo cáo trùng lặp mục 2, 3, 12 — tìm bằng grep bên dưới).

**Chi tiết:**
- **REF-038.1 Error:** thay error UI tự viết bằng `ErrorState` (có retry khi có `refetch`), lỗi trong dialog bằng `FeedbackBanner tone="destructive"`. Tìm: `rg -n "bg-destructive/10" src/app`.
- **REF-038.2 Empty:** thêm `size="compact"` cho dialog; thay ~25 empty state tự viết. `status-chart/empty-state.tsx` và `board-empty-projects.tsx` bọc `EmptyState`. Tìm: `rg -n "border-dashed" src/app`.
- **REF-038.3 Search:** thay 13 ô `<Search className="absolute …">` bằng `SearchField` (bao gồm chính `issue-filter-bar.tsx`).
- **REF-038.4 Loading:** `bulk-operation-detail.tsx`, `stale-std-quick-edit.tsx` dùng Skeleton; thống nhất chuỗi "Đang tải…".
- **REF-038.5 404:** `src/app/(app)/not-found.tsx` trong app shell: icon trong vòng muted + "Không tìm thấy" + gợi ý + link về Board. Đọc `node_modules/next/dist/docs` về `not-found` ở Next 16 trước.
- **REF-038.6 Filter primitives:** tách `FacetMultiSelect` (private trong `issue-filter-bar.tsx`) → `src/components/shared/facet-multi-select.tsx`, tạo `facet-select.tsx` cho mẫu "Select + Tất cả"; hằng `ALL` duy nhất trong `src/lib/filters.ts` (hiện lẫn `"ALL"`/`"all"` — **chỉ đổi giá trị khi URL không bị ảnh hưởng**, nếu có ảnh hưởng URL thì giữ giá trị cũ cho từng consumer). Facet list: giới hạn hiển thị 100 option + gợi ý "gõ để tìm".
- **REF-038.7** `branches/branch-toolbar.tsx`: 5 `<select>` native → shadcn `Select`.

**DoD:**
- [ ] `rg -n "bg-destructive/10" src/app` chỉ còn trong `components/shared/*` (hoặc có comment lý do).
- [ ] `rg -n "absolute.*<Search|<Search className=\"absolute" src` = 0 ngoài `search-field.tsx`.
- [ ] Mọi error state có `role="alert"`; mọi icon trang trí có `aria-hidden`; nút có `cursor-pointer`.
- [ ] `/issue/KHONG-TON-TAI-1` hiển thị 404 trong app shell.
- [ ] QA từng trang đã chạm ở light + dark; tương phản chữ ≥ 4.5:1 (DevTools Accessibility).
- [ ] V-STD + build pass.

---

### Phase 11 — REF-039: Token hoá màu (tuỳ chọn)
**Mục tiêu:** Giảm 1.562 class màu palette thô. Rủi ro thị giác cao → làm theo từng file, ảnh chụp trước/sau.
- Ưu tiên file config/map (đã gom ở Phase 1): `lib/leaderboard/tiers.ts`, `lib/status-style.ts`, `lib/notify/notification-types.ts`, `lib/reports/status.ts`.
- Sau đó component: `create-preview.tsx`, `queues-card.tsx`, `leaderboard-podium.tsx`, `jira-template-dialog.tsx`, `task-delivery-list.tsx`, `header-panels.tsx`, `create-progress.tsx`, `branch-detail-sheet.tsx`, `csv-import-csv-preview.tsx`, `release-task-list.tsx`.
- Dùng badge variant `success/warning/danger/info` (`components/ui/badge.tsx`) và token trong `globals.css`. Nếu cần token mới, thêm vào `:root` **và** `.dark` cùng lúc.
- **DoD:** ảnh chụp trước/sau (light + dark) cho mỗi file đính kèm progress; không còn hex ngoài `sparkline.tsx`/`chart.tsx` (chart cần màu cụ thể — ghi chú); V-STD + build pass.

---

### Phase 12 — REF-040: Guard `server-only` (chỉ khi D16 = Có)
**Bối cảnh:** Hiện không có import runtime nào từ client vào module server (đã quét), nhưng **không có gì ngăn tái phát** — đổi một `import type` thành import giá trị là có thể lọt Prisma/secret vào bundle.

**Bẫy đã biết (lý do phải có quyết định):**
- Package `server-only` **không có trong `node_modules`**. Next tự alias khi bundle, nhưng **vitest** (`environment: node`) và **worker** (`tsx src/worker.ts`) không qua Next → sẽ lỗi `Cannot find module 'server-only'`. Typings đã có trong `next/types/global.d.ts` nên `tsc` không lỗi — đừng để typecheck pass đánh lừa.
- Alias trong `vitest.config.ts` chỉ cứu test, **không cứu worker**.

**Nếu D16 = Có (cài package, sửa manifest):**
- Thêm `import "server-only";` vào module chỉ dùng trong Next request: `src/lib/session.ts`, `src/lib/query-server.ts`, `src/lib/user-gate.ts`, `src/lib/board/bootstrap.ts`, `src/lib/*/…-route-service.ts`.
- **Không** thêm vào module mà worker import (bắt đầu từ `src/worker.ts` → `lib/prisma`, `lib/queue/*`, `lib/health/*`, `lib/logger`…). Kiểm tra bằng cách chạy `npm run worker` (Ctrl+C sau khi khởi động) sau mỗi file.
- Thử trước với **1 module** + `npm test` + `npm run worker` + `npm run build` rồi mới mở rộng.

**Nếu D16 = Không:** đánh dấu SKIPPED. Thay thế không cần dependency: thêm rule ESLint `no-restricted-imports` cho `src/app/**/*-client.tsx` và `src/components/**` cấm import `@/lib/prisma`, `@/lib/session`, `@/lib/env`, `@/lib/user-creds` (trừ `import type`). Sửa `eslint.config.mjs` là cấu hình lint, không phải manifest — vẫn ghi rõ trong commit.

---

## 6. Ngoài phạm vi / không làm
- Bỏ `'use client'` ở component lá được import từ cha client (không có lợi ích bundle — §1.2).
- Server prefetch cho danh sách issue của Board và Bulk (key phụ thuộc filter trong localStorage; `buildIssuesQuery` nằm trong file `"use client"`). Có thể xét lại sau Phase 5 khi filter đã vào URL.
- Prefetch các endpoint live Jira/Bitbucket.
- Thay đổi schema Prisma, thêm thư viện virtualization/zod/date.

## 7. Rủi ro hồi quy chính
| Rủi ro | Phase | Giảm thiểu |
|---|---|---|
| Xoá memo khi hàm chưa được compiler compile → chậm hơn | 2, 6, 9 | Bắt buộc bằng chứng compile trước khi xoá |
| queryKey server ≠ client → fetch 2 lần hoặc hydrate dữ liệu sai shape | 3, 8 | Test hàm lib trả đúng JSON shape; DoD kiểm Network |
| Prefetch làm TTFB chậm | 3, 8 | Đo trước/sau; ngưỡng 300 ms; tiền lệ REF-023 |
| Gộp classifier đổi cột trên board | 1 | Chờ D9; test characterization |
| URL state đổi hành vi back/forward, link đã chia sẻ | 2, 5, 7, 8, 9 | Chờ D15; giữ tương thích tham số cũ khi parse |
| Một cây desktop/mobile gây hydration mismatch | 6, 7, 9 | `useSyncExternalStore` với `getServerSnapshot` cố định; QA resize |

## 8. Definition of Done chung cho cả Wave
- [ ] Mọi task có dòng trong `docs/audit/progress.md` với lệnh đã chạy và **kết quả thật**.
- [ ] `npm run typecheck`, `npm run lint`, `npm test`, `npm run build` pass ở commit cuối.
- [ ] `git diff main -- package.json package-lock.json prisma/` rỗng (trừ khi D16 = Có, ghi rõ).
- [ ] `docs/audit/bundle-baseline.md` có mục "Wave 5 after" cho `/board`, `/bulk`, `/reports/projects/[projectKey]`, `/admin/sync`.
- [ ] Mọi thay đổi hành vi đều trỏ về quyết định APPROVED trong `decisions.md`.

---

## 9. Prompt cho Antigravity (dán phần dưới đường kẻ)

---

Bạn là kỹ sư Next.js/TypeScript senior, thực hiện **kế hoạch đã duyệt** trong `docs/audit/wave5-refactoring-plan.md` cho repo hiện tại (Team Task Web — Next.js 16 App Router, React 19 + React Compiler, Prisma 7, TanStack Query 5).

**Đọc trước, theo thứ tự, chưa viết code:** `AGENTS.md` (Next 16 có breaking changes — đọc `node_modules/next/dist/docs/` trước khi dùng bất kỳ API Next nào), `docs/audit/decisions.md`, `docs/audit/wave5-refactoring-plan.md` (§0 luật, §3 quyết định, §5 phase), `design-system/team-task-web/MASTER.md`, `docs/clean-code/00-guardrails.md`, `docs/clean-code/07-api-contract-inventory.md`.

**Phạm vi lần này:** chỉ **Phase <N> — REF-0xx**. Làm từng task con theo thứ tự, mỗi task = 1 commit, chạy V-STD sau mỗi task, cập nhật `docs/audit/progress.md` trong cùng commit. Mục gắn **[BEHAVIOUR CHANGE — Dx]** chỉ làm nếu Dx đã APPROVED trong `decisions.md`; nếu chưa, làm phần không đổi hành vi và ghi "deferred (Dx)".

**Luật cứng:** không thêm dependency; không sửa `package.json`, `package-lock.json`, `prisma/`, `.env*`, `compose.yaml`, `Dockerfile`; không đổi API contract ngoài mục đã duyệt; TDD cho logic thuần; không xoá/làm yếu test; không tuyên bố cải thiện hiệu năng khi không có số đo; định vị code bằng symbol — nếu code mâu thuẫn kế hoạch thì dừng task đó và ghi vào "Discovered"; không push/merge/deploy, không xoá thay đổi có sẵn trong working tree. Vitest không có DOM — phần UI phải QA thủ công ở light và dark mode và ghi kết quả.

**Báo cáo (tiếng Việt) khi xong Phase:** danh sách task + commit, kết quả V-STD thật, số đo trước/sau (nếu có), sai lệch so với kế hoạch, bug phát hiện thêm, việc cần tôi quyết định. Không bắt đầu Phase tiếp theo cho tới khi tôi trả lời "tiếp tục".
