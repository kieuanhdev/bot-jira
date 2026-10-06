# Clean code toàn dự án — kế hoạch & tiến độ

> Cập nhật: 2026-10-06 · Branch: `chore/clean-code-20261006` (từ `main`) · **Chưa merge, chưa push**
> Mục tiêu: repo sạch hơn, type chặt hơn, file nhỏ hơn — **hành vi không đổi**.
> Đây là refactor, không phải rewrite, không nâng dependency, không thêm feature.

## 0. Tóm tắt trạng thái

| Batch | Nội dung | Trạng thái |
|---|---|---|
| 0 | Dọn nền (`npm install`, prisma generate, baseline) | ✅ Xong |
| 1 | Phân loại test fail | ✅ Xong |
| 2 | Lint cơ học | ✅ Xong |
| 3 | Siết type | 🟡 Xong phần code; **test còn `any`** bị tắt rule ở mức file |
| 4 | React hooks / React Compiler | ✅ Xong |
| 5 | Gom trùng lặp & dependency | 🟡 Xong phần route + dependency; **còn clone ở `lib/`** (cố ý giữ nguyên) |
| 6 | Tách file lớn (UI components) | ✅ **Hoàn thành 100% nhóm UI** — Toàn bộ UI files đều < 800 dòng |
| 7 | Dọn repo (`docs/`, `public/`, `.kilocode/`, scripts) | ✅ **Xong** (`docs/archive/` 32 files, xóa 5 SVG mẫu trong `public/`) |
| — | Kiểm tra tay trên trình duyệt | ⬜ **Chưa làm bất kỳ mục nào** |

## 1. Số liệu trước → sau

| Hạng mục | Trước (2026-10-06, `main`) | Sau (branch hiện tại) |
|---|---|---|
| `tsc --noEmit` | 34 lỗi (toàn bộ do môi trường: thiếu `recharts`/`exceljs`, cache `.next/`) | **0** |
| ESLint | 86 lỗi, 60 cảnh báo | **0 lỗi, 0 cảnh báo** |
| Vitest | 13 fail / 1089 pass (145 file) | **1219 pass / 0 fail (154 file)**, +130 test mới |
| `next build` | pass | **pass (64 static/dynamic routes)** |
| Kích thước file UI lớn nhất | 2277 (`bulk-client.tsx`) | **780 (`board-client.tsx`), 777 (`bulk-client.tsx`)** |

Kích thước file đã tách (Batch 6):

| File | Trước | Sau | File mới sinh ra |
|---|---|---|---|
| `reports/projects/[projectKey]/status-distribution-chart.tsx` | 1322 | **274** | 8 file trong `status-chart/` |
| `stale/stale-client.tsx` | 1836 | **469** | 9 component + hàm thuần trong `lib/stale-utils.ts` |
| `board/board-client.tsx` | 1987 | **780** | `board-header`, `board-kanban-view`, `useBoardActions`, `useBoardDnD`, `useBoardKeyboardNav` |
| `bulk/bulk-client.tsx` | 2277 | **777** | `bulk-select-card`, `bulk-configure-card`, `useBulkFieldState`, `bulk-logic.ts` |
| `issue/[key]/issue-detail-client.tsx` | 1429 | **521** | 7 component + `lib/issue-detail-utils.ts` (10 tests) |
| `board/board-quick-panel.tsx` | 1056 | **334** | 5 component trong `quick-panel/` + `lib/quick-panel-utils.ts` (6 tests) |
| `leaderboard/leaderboard-client.tsx` | 1044 | **191** | 7 component + `lib/leaderboard-utils.ts` (15 tests) |
| `bulk/create/bulk-create-data-grid.tsx` | 1005 | **391** | 4 component + `lib/bulk-create-grid-utils.ts` (5 tests) |
| `bulk/create/csv-import-dialog.tsx` | 961 | **464** | 3 preview component + `lib/csv-import-utils.ts` (7 tests) |

## 2. Đã làm — chi tiết theo batch

### Batch 0 — Dọn nền
- Tạo branch, `npm install` (khôi phục `recharts`, `exceljs` có trong `package.json` nhưng thiếu trong `node_modules`), xóa `.next/`, `prisma generate`.
- Kết quả: `tsc` 34 → 0 lỗi; 4 file test Excel hết fail.
- Commit: `ee2a002` (thêm tài liệu kế hoạch), `4542a89` (baseline; `eslint.config.mjs` bỏ qua `.kilo/`, `.kilocode/`, `.cleanup/`; sửa cách đếm trong `verify.sh`).

### Batch 1 — Phân loại test fail (13 test)
| Nhóm | Nguyên nhân | Cách xử lý | Commit |
|---|---|---|---|
| `excel-*` (4 file) | thiếu `exceljs` | hết sau Batch 0 | — |
| `business-days.test` (1) | test phụ thuộc múi giờ máy (`UTC+7` làm `17:00Z` sang ngày sau) | dùng giờ local trong test | `ad0c4f0` |
| `sub-routes.test` (2) | test hard-code ngày 2026-10-02 nhưng `period=this_week` tính theo ngày chạy | cố định `Date` bằng fake timers | `ad0c4f0` |
| `board-membership-store.test` (7), `refresh-board-membership.test` (3) | là **test tích hợp ghi vào DB thật** trong `.env`, DB không dùng được | viết lại thành unit test với Prisma giả trong bộ nhớ | `c369acc` |

⚠️ Hệ quả của dòng cuối: hai file test này **không còn kiểm tra transaction/generation thật**. Xem mục 4.

### Batch 2 — Lint cơ học
- Xóa import/biến thừa (54), `prefer-const` (3), `no-unescaped-entities` (2). Commit `6eea03a`.

### Batch 3 — Siết type
- Thay `any` bằng type thật ở code (`process-webhook.ts`, `board-membership-store.ts`, `use-issues.ts`, `components/ui/chart.tsx`, …): `6b2c5a2`. Ở test: `96a0bfa`.
- `as unknown as`: bỏ các cast thừa ở 6 worker (`ai-score`, `sentry-import`, `deliver-notifications`, `check-branches`, `parse-comment-branches`, `health-alert`), `boss.ts` (`{ ...stats }`), `board-client.tsx`, `jira/client.ts`, và gom 11 cast trong test. 54 → 35. Commit `2e52091`.
- 3 cảnh báo cuối → 0 (`createHash` thừa; hai `eslint-disable` có lý do cho `<img>` avatar Jira và ARIA combobox do Radix tự thêm `aria-controls`). Commit `2e52091`.

### Batch 4 — React hooks & React Compiler
- 16 `set-state-in-effect` + 5 `preserve-manual-memoization` → 0, bằng "đồng bộ state trong render" (`if (x !== prevX) { setPrevX(x); … }`) và khởi tạo lazy từ `localStorage`. Commit `7c668f6`.
- Sửa sau review (`7bd69fe`):
  - `tasks-tab.tsx`: khôi phục đồng bộ **từng filter độc lập** (bản đầu ghi đè cả ba khi một prop đổi).
  - Ghi chú trong 3 file đọc `localStorage` ở lần render đầu: an toàn vì chỉ render sau khi `useQuery` có dữ liệu ở client (repo không dùng `HydrationBoundary`/`initialData`).
- Đã xác nhận **không** có hydration mismatch thật; nếu sau này thêm SSR prefetch thì phải xem lại 3 chỗ đó.
- Xóa 5 file chết (`create-task-grid`, `create-defaults-form`, `jira-option-select`, `workload-chart`, `assignee-multi-select`, ~1885 dòng; 0 tham chiếu). Commit `96e1f20`.

### Batch 5 — Gom trùng lặp & dependency
- `src/lib/reports/route-guard.ts` → `guardProjectReport(params, { permission?, forbiddenMessage? })` dùng cho 6 route `reports/projects/[projectKey]/*`; giữ nguyên thứ tự kiểm tra và JSON/status; có test (6). Commit `061e6fa`.
- `src/lib/jira/credentials-required.ts` → `jiraCredentialsRequired()` thay response 428 giống hệt ở **26 chỗ / 24 route**. Route `projects`, `projects/validate`, `releases/sync` có payload khác nên **giữ nguyên**. Commit `c344979`.
- Gỡ dependency chết: `zustand`, `@dnd-kit/sortable`, `@types/bcryptjs` (đã grep 0 tham chiếu; `tsc`/test/build pass). Commit `4e87ffc`.

### Batch 6 — Tách file lớn (4/13)
Nguyên tắc đã áp dụng: **state và handler giữ ở component cha**; chỉ tách (1) hàm thuần có test, (2) hook tự chứa gọi cùng thứ tự, (3) JSX chuyển nguyên văn thành component ở module scope (không tạo component trong component, không thêm wrapper).

| File | Cách tách | Test thêm | Commit |
|---|---|---|---|
| `status-distribution-chart.tsx` | `status-chart/{model.ts, use-status-chart-preferences.ts, controls, header-panels, donut/pipeline/table-view, empty-state}` | `model.test.ts` (8) | `bacb160` |
| `stale-client.tsx` | `stale-{view-switcher, scope-filter, std-overview, std-filters, std-task-list, focus-sections, task-list-card, insight-cards, empty-state}.tsx`; `filterFocusedTasks/computeFocusCounts/filterStdTasks` vào `lib/stale-utils.ts` | +7 trong `stale-utils.test.ts` | `ee8232d` |
| `board-client.tsx` | `lib/board-columns.ts` (xây cột, transition, thống kê; biểu thức "cột được phép thả" lặp 3 lần → `allowedColumnKeys`), `lib/board-hooks.ts` (`useBoardWidth`, `useDragAutoScroll`, `useJiraSync`, `useTransitionCache`, `useColumnPreferences`), 6 component | `board-columns.test.ts` (12) | `243ce01` |
| `bulk-client.tsx` | `lib/bulk-logic.ts` (tùy chọn lọc, lọc/sắp xếp, task giữ chỗ, dựng action, body preview, đếm bucket, nhãn xác nhận), `bulk-{header-parts, select-step, configure-step, preview-step, history-card, confirm-dialog, preview-field-row}.tsx` | `bulk-logic.test.ts` (24) | `657714b` |

#### Cách kiểm chứng "không đổi UI" (quan trọng)
Dự án chưa có E2E. Mỗi file được kiểm bằng **so sánh HTML**: render bản cũ (lấy từ git) và bản mới bằng `renderToStaticMarkup` với cùng dữ liệu giả (react-query được seed sẵn, mock `next/navigation`/`next-auth`), ép các state khởi tạo khác nhau (chế độ, preview, giá trị trường…). Kết quả: giống hệt ở 12 (chart) + 5 (stale) + 9 (board) + 24 (bulk) kịch bản. Đã thử cố ý đổi một class để chắc harness bắt được.

Giới hạn của cách này (**cần kiểm tay**): không chạy effect, click, kéo-thả, mutation, gọi mạng, URL sync.
Harness hiện **chưa nằm trong repo** (để ở thư mục tạm của phiên làm việc); nếu muốn dùng tiếp thì cần quyết định lưu ở đâu (mục 6).

## 3. Chưa làm

### 3.1 Batch 6 — các file lớn còn lại

| File | Dòng | Gợi ý tách (chưa thực hiện) | Rủi ro |
|---|---|---|---|
| `lib/bulk/ops.ts` | 1933 | Tách theo thao tác (preview, execute, retry…); giữ file gốc làm entry re-export; **trước tiên grep `vi.mock`/`vi.spyOn` trên module này** | Cao: ghi Jira/DB, dùng chung worker và app |
| `issue/[key]/issue-detail-client.tsx` | 1428 | Hàm thuần cho validate worklog; component cho header, quick-action bar, panel nhánh, panel AI, bình luận, dialog Log Work; state giữ ở cha. Có thể dùng lại harness SSR (seed 5 query, mock các hook `use-issue-detail`) | Trung bình |
| `lib/jira/client.ts` | 1193 | Chỉ tách nếu `jiraWith` là closure trả một object literal trên một `request` dùng chung và type `JiraClient` giữ nguyên; nếu không sạch thì **bỏ qua và ghi lý do** | Cao |
| `lib/bulk/create-ops.ts` | 1111 | Như `ops.ts`; chỉ tách khi có test bao phủ | Cao |
| `board/board-quick-panel.tsx` | 1055 | Chưa khảo sát chi tiết | Trung bình |
| `leaderboard/leaderboard-client.tsx` | 1043 | Chưa khảo sát chi tiết | Trung bình |
| `bulk/create/bulk-create-data-grid.tsx` | 1005 | **Giữ nguyên** thuộc tính `data-row-index`, `data-field` và `ref` mà cha dùng để `querySelector`/focus | Trung bình–cao |
| `bulk/create/csv-import-dialog.tsx` | 960 | Tách parser/mapping thành hàm thuần có test, dialog chỉ còn trình bày | Trung bình |

Các file cha vẫn còn lớn sau khi tách (chấp nhận được vì phần còn lại là state/handler cohesive, nhưng có thể tách tiếp):
- `board-client.tsx` 1088: còn bộ lọc + URL sync, project picker, kéo-thả (`useBoardFilters`, `useBoardDnd` là hướng có thể làm; các effect đan xen nên cần cẩn thận).
- `bulk-client.tsx` 985; `bulk-configure-step.tsx` 689.

Ngoài kế hoạch gốc (> 600 dòng, tùy chọn): `lib/bulk/create-validator.ts` 815, `settings/notification-preferences.tsx` 757, `bulk/create/bulk-create-client.tsx` 682, `jira-template-dialog.tsx` 678, `lib/jira/board-config.ts` 624.

**Tiêu chí xong của Batch 6** (chưa đạt): không file nào > ~800 dòng trừ khi ghi lý do.

### 3.2 Batch 7 — Dọn repo (chưa động vào)
- [ ] `docs/` (40 file): archive các file `*_PLAN.md` / `*_PROGRESS.md` đã thực hiện xong vào `docs/archive/` bằng `git mv`; giữ `architecture.md`, `RUNBOOK.md`, `release-policy.md`, `BACKUP_RESTORE.md`, `PR_CHECKLIST.md`, `notification-realtime.md`, `IMPLEMENTATION_STATUS.md`; sửa link trỏ tới.
- [ ] `public/`: `file.svg`, `globe.svg`, `next.svg`, `vercel.svg`, `window.svg` — grep tham chiếu rồi xóa nếu không dùng.
- [ ] `.kilocode/` (177 file được commit) và `.kilo/` (7,3 GB, không commit): giữ, ignore hay chuyển ra ngoài repo.
- [ ] Rà `package.json` scripts, `scripts/` (backfill/cleanup dùng một lần), `README.md`.

### 3.3 Batch 3 — phần còn dở
- [ ] 7 file test có `/* eslint-disable @typescript-eslint/no-explicit-any */` đầu file (~99 chỗ `any`): `jira-sync-integration.test`, `jira-sync-race.test`, `jira-sync-lease-renewal.test`, `workers/poll-jira.test`, `workers/poll-pr-comments.test`, `cache-transaction.test`, `cache-error-propagation.test`. Rule lint đang "xanh" nhờ suppress, **không phải nhờ đã có type**.
- [ ] `as unknown as` còn 35, trong đó **hợp lệ giữ lại**: singleton `globalThis` (`prisma.ts`, `boss.ts`, `realtime.ts`, `webhooks/_shared.ts`), ép `Buffer` cho exceljs/`Response`, `pushSubscription` kiểu JSON, `rawJob` của pg-boss; còn lại chủ yếu ở test mock.
- [ ] 12 `eslint-disable`: chỉ 5 cái ở code đã có lý do; chưa rà `use-web-push.ts:61`, `board-column.tsx:86`, `board-client.tsx:534`.

### 3.4 Batch 5 — phần còn dở (cố ý bỏ qua vì chạm code dùng chung worker/app)
Clone còn lại ở `lib/`: `issues/cache.ts`, `bitbucket/link-service.ts`, `jira/board-config.ts`, `notify-commit-comment` ↔ `notify-pr-comment`, `reports/member-query` ↔ `project-query`, `ai/ollama` ↔ `ai/openai`, `queue/workers/check-branches.ts`, `process-webhook.ts`. Cũng còn phần mở đầu lặp ở nhóm `bulk/create/*` (session → tham số `project` → 428), mỗi route chỉ ~3 dòng thật sự trùng nên chưa gom.
- [ ] 43 "unused export" và 107 "unused exported type" do knip báo: **giữ** vì là API công khai của module (quyết định từ đợt dọn 2026-09-24).

### 3.5 Kiểm tra tay trên trình duyệt (chưa mục nào được làm)
Mỗi commit tách file có ghi đường dẫn click trong message. Tổng hợp:
- [ ] **Reports → dự án → Overview**: đổi Task/SP/giờ, Tròn/Luồng/Bảng, hover/click trạng thái để lọc, bật/tắt tùy chọn, reload để xem preference còn lưu; tab Tasks: đổi từng filter và kiểm tra phân trang.
- [ ] **/stale**: chuyển "Việc của tôi"/"Toàn dự án", các tab, bộ lọc phạm vi, thẻ ưu tiên, bộ lọc + chọn nhiều + bulk action ở danh sách chuẩn hóa, "Xem thêm".
- [ ] **/board**: đổi dự án, picker + thêm dự án, nút đồng bộ, **kéo thả thẻ** (cột được phép/bị chặn), menu cột (ẩn/thu gọn/khôi phục, chế độ danh sách), bộ lọc, "Xem thêm" ở chế độ danh sách, phím mũi tên + Enter, quick panel.
- [ ] **/bulk**: chọn dự án, lọc + chọn tất cả, từng chế độ (cập nhật trường / chuyển trạng thái / log work), bật nhiều trường và nhập giá trị, **Xem trước → các tab → Chạy**, hủy xem trước, thử lại ở lịch sử, `/bulk?keys=…&returnTo=standardization`.
- [ ] **/bulk/create**: mở với `editor-mode=fullscreen` đã lưu và xem console có cảnh báo hydration không.
- [ ] Light/dark mode, màn hình hẹp.

## 4. Phát hiện nhưng chưa sửa (chạm hành vi hoặc bất biến — cần bạn quyết)

| # | Vấn đề | Vị trí | Ghi chú |
|---|---|---|---|
| 1 | **Bug thật, hẹp**: refresh nền (SWR) lưu `Promise<void>` vào `Map<string, Promise<T>>` bằng cast; request đến sau `staleUntil` khi refresh còn chạy sẽ nhận `undefined` như dữ liệu | `lib/jira/board-membership.ts:276`, `lib/jira/board-options.ts:69` | Sửa: cho refresh nền trả dữ liệu mới, hoặc không đưa vào Map đó |
| 2 | `null as unknown as object` để xóa cột JSON `pushSubscription`; Prisma thường yêu cầu `Prisma.DbNull` | `lib/queue/workers/deliver-notifications.ts:131` | Cần thử trên DB thật trước khi đổi |
| 3 | Hai file test membership giờ dùng Prisma giả → mất kiểm tra transaction/generation thật | `board-membership-store.test.ts`, `refresh-board-membership.test.ts` | Cân nhắc giữ thêm bản integration chạy riêng (cần DB test) |
| 4 | `bulk-client`: effect cũ ép project về URL mỗi lần đổi project và khôi phục danh sách chọn (khiến không đổi được project khi vào bằng `?keys=`). Bản mới chỉ đồng bộ khi `initialKeys` đổi | `bulk/bulk-client.tsx` | Đã chủ ý giữ hành vi mới; cần kiểm tay |
| 5 | `components/ui/chart.tsx`: `item.value !== undefined` → `!= null` (trước đây `null` làm crash `.toLocaleString()`) | `components/ui/chart.tsx` | Sửa lỗi nhỏ nhưng là đổi hành vi |
| 6 | knip báo `dotenv`, `postcss` chưa khai báo trong `package.json` (đang chạy nhờ phụ thuộc gián tiếp); `tailwindcss` bị báo thừa là **false positive** (dùng qua plugin PostCSS) | `package.json` | Thêm dependency là ngoài phạm vi dọn dẹp; **đừng xóa `tailwindcss`** |
| 7 | `eslint.config.mjs` bị sửa để bỏ qua `.kilo/`, `.kilocode/`, `.cleanup/` | `4542a89` | Là thay đổi cấu hình, xem lại có muốn giữ không |
| 8 | Handler preview/confirm/retry của Bulk, kéo-thả của Board, đồng bộ Jira/URL **không** được harness HTML bao phủ | — | Chỉ có kiểm tra tay (mục 3.5) và review diff từng dòng |

## 5. Bất biến — KHÔNG được thay đổi (giữ nguyên cho phần còn lại)

- **UI**: markup, `className`, text hiển thị, thứ tự render, a11y attribute. Tách component phải cho DOM y hệt.
- **Business logic**: điều kiện, công thức, thứ tự side-effect, giá trị mặc định.
- **API contract**: URL, HTTP method, status code, shape JSON, header, cookie, tên query param.
- **DB**: `prisma/schema.prisma`, migrations, tên bảng/cột, transaction boundary. Không chạy `migrate` / `db push`.
- **Queue pg-boss**: tên queue/job, shape payload, retry/expire options.
- **Auth** (`authOptions`, session/JWT shape), **web push** (VAPID, payload).
- **Dependencies và config**: không thêm/nâng/hạ package; không đổi `next.config.ts`, `tsconfig.json`, tên env var.
- **Public export** của module dùng chung giữa worker và app.
- Phát hiện bug thật hoặc lỗ hổng → ghi vào mục 4, **không tự sửa**.

## 6. Quy trình & lưu ý cho phần còn lại

1. Đọc lại code liên quan trước khi sửa (không sửa theo trí nhớ). Mỗi batch nhỏ, mỗi file lớn một commit riêng.
2. Verify mỗi commit: `npm run typecheck && npm run lint && npm test`; trước khi kết thúc thêm `npm run build`.
3. Khi tách file lớn:
   - Component mới phải ở **module scope** (component định nghĩa trong component sẽ remount mỗi lần render → mất focus/state).
   - **Không** chuyển `useState` vào component con render có điều kiện (dialog, tab, `{open && …}`) vì state sẽ reset khi unmount; chỉ chuyển vào hook gọi từ cùng component.
   - Giữ các khối "đồng bộ state trong render" của Batch 4 cùng chỗ với state mà chúng set.
   - Giữ `ref` và thuộc tính DOM mà component cha truy vấn (`data-row-index`, `data-field`…).
   - Với file `lib/*` dùng chung worker/app: giữ file gốc làm điểm re-export, không đổi đường dẫn import ở cùng commit, kiểm tra mock `vi.mock("@/lib/...")`/`vi.spyOn` trước.
   - Cẩn thận khi sinh code bằng script: `return` xuống dòng trước biểu thức bị ASI hiểu thành `return;` và `tsc` **không báo** (đã gặp một lần ở `buildPreviewRequestBody`, được test bắt).
4. Hàm thuần tách ra phải có test; hàm chạm Jira/DB chỉ tách khi đã có test bao phủ.
5. Không merge, không push, không mở PR nếu chưa được yêu cầu.

## 7. Quyết định cần bạn xác nhận

| # | Câu hỏi | Đề xuất |
|---|---|---|
| 1 | Harness so sánh HTML cũ/mới hiện nằm ngoài repo. Lưu vào repo (ví dụ `scripts/cleanup-equiv/`, không chạy trong `npm test`) để dùng cho các file còn lại? | Có, nhưng tách riêng khỏi `npm test` |
| 2 | Tiếp tục Batch 6 cho `issue-detail-client`, `board-quick-panel`, `leaderboard-client`, `bulk-create-data-grid`, `csv-import-dialog` (UI, có thể kiểm bằng harness) trước, còn `ops.ts`/`create-ops.ts`/`jira/client.ts` (ghi Jira/DB) để sau hoặc bỏ? | Làm nhóm UI trước |
| 3 | Gỡ `eslint-disable` đầu file ở 7 file test bằng cách gõ type thật, hay chấp nhận cho test? | Gõ type dần, ưu tiên khi chạm vào file đó |
| 4 | Sửa bug #1 và kiểm tra #2 (mục 4)? | Sửa #1 kèm test; #2 chỉ khi có DB để thử |
| 5 | `docs/*_PLAN.md` đã xong: archive hay giữ? `.kilocode/`, `.kilo/`: ignore hay giữ? | Archive; ignore, không commit |
| 6 | Hướng xử lý test membership (mục 4 #3)? | Giữ bản mock; thêm bản integration chạy riêng khi có DB test |

## 8. Báo cáo kết thúc (`.cleanup/REPORT.md`) — khi hoàn tất

- Số batch hoàn thành / bỏ qua (kèm lý do).
- Bảng trước → sau: lỗi tsc, lỗi/cảnh báo eslint, `any`, `as unknown as`, test pass/fail, số dòng (`git diff --stat main...HEAD`), kích thước file lớn nhất.
- Danh sách phát hiện chưa sửa (mục 4) để bạn quyết.
