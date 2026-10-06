# Kế hoạch clean code toàn dự án

> Ngày lập: 2026-10-06 · Branch gốc: `main` · Trạng thái: **chờ duyệt, chưa sửa code**
> Mục tiêu: repo sạch hơn, type chặt hơn, file nhỏ hơn — **hành vi không đổi**.
> Đây là refactor, không phải rewrite, không nâng dependency, không thêm feature.

## 1. Hiện trạng (đo ngày 2026-10-06)

| Hạng mục | Kết quả |
|---|---|
| Quy mô | 562 file trong `src/`, 95 API route, 39 file trong `docs/` (~23.5k dòng) |
| `tsc --noEmit` | 34 lỗi. **Toàn bộ do môi trường**: `recharts` và `exceljs` có trong `package.json` nhưng chưa cài trong `node_modules`; 2 lỗi do cache `.next/` trỏ tới `api/inbox/command/route` không còn tồn tại |
| Vitest | 13 fail / 1089 pass (8 file fail) |
| ESLint | 86 lỗi, 60 cảnh báo |
| `any` | 155 chỗ (`: any` / `as any`) |
| `as unknown as` | 42 chỗ |
| `eslint-disable` | 11 chỗ |
| `@ts-ignore` / `console.log` | 0 / 0 (đã dọn ở đợt 2026-09-24) |

### 1.1 Test đang fail (13)

| File | Số test | Nghi vấn ban đầu |
|---|---|---|
| `bulk/create/excel-import/route.test.ts`, `excel-template/route.test.ts`, `lib/bulk/excel-parser.test.ts`, `excel-template.test.ts` | 4 file | Thiếu `exceljs` → sẽ hết sau `npm install` |
| `lib/jira/board-membership-store.test.ts` | 7 | Chưa rõ: mock Prisma cũ hay code đổi? |
| `lib/queue/workers/refresh-board-membership.test.ts` | 3 | Như trên |
| `api/reports/projects/[projectKey]/sub-routes.test.ts` | 2 | `completedTasks` assertion sai → có thể bug thật |
| `lib/stale/business-days.test.ts` | 1 | Case "same business day", nghi phụ thuộc ngày/giờ chạy |

### 1.2 Phân bố lỗi ESLint

| Rule | Mức | Số lượng |
|---|---|---|
| `@typescript-eslint/no-explicit-any` | error | 60 |
| `@typescript-eslint/no-unused-vars` | warn | 54 |
| `react-hooks/set-state-in-effect` | error | 16 |
| `react-hooks/preserve-manual-memoization` | error | 5 |
| `prefer-const` | error | 3 |
| `react/no-unescaped-entities` | error | 2 |
| `jsx-a11y/role-has-required-aria-props` | warn | 2 |
| `react-hooks/exhaustive-deps` | warn | 2 |
| `@next/next/no-img-element` | warn | 1 |

### 1.3 File quá lớn (> 900 dòng)

| File | Dòng |
|---|---|
| `src/app/(app)/bulk/bulk-client.tsx` | 2254 |
| `src/app/(app)/board/board-client.tsx` | 1993 |
| `src/lib/bulk/ops.ts` | 1933 |
| `src/app/(app)/stale/stale-client.tsx` | 1836 |
| `src/app/(app)/issue/[key]/issue-detail-client.tsx` | 1427 |
| `src/app/(app)/reports/projects/[projectKey]/status-distribution-chart.tsx` | 1324 |
| `src/lib/jira/client.ts` | 1193 |
| `src/lib/bulk/create-ops.ts` | 1111 |
| `src/app/(app)/board/board-quick-panel.tsx` | 1055 |
| `src/app/(app)/leaderboard/leaderboard-client.tsx` | 1045 |
| `src/app/(app)/bulk/create/bulk-create-data-grid.tsx` | 997 |
| `src/app/(app)/bulk/create/csv-import-dialog.tsx` | 960 |
| `src/app/(app)/bulk/create/create-task-grid.tsx` | 954 |

### 1.4 Đợt dọn trước (2026-09-24)

Đã làm: xóa `console.log` debug, 3 file chết, 12 `any`, gom 50 `queryKey` vào `src/lib/query-keys.ts`. Đã bỏ qua có chủ đích: xóa "unused export" vì đó là public API của module. **Không làm lại các việc này.** Từ đó repo thêm ~400 file nên lỗi mới tích lại ở `reports/`, `bulk/`, `board-membership`.

## 2. Bất biến — KHÔNG được thay đổi

- **UI**: markup, `className`, text hiển thị, thứ tự render, a11y attribute. Tách component phải cho DOM y hệt.
- **Business logic**: điều kiện, công thức, thứ tự side-effect, giá trị mặc định.
- **API contract**: URL, HTTP method, status code, shape JSON, header, cookie, tên query param.
- **DB**: `prisma/schema.prisma`, migrations, tên bảng/cột, transaction boundary. Không chạy `migrate` / `db push`.
- **Queue pg-boss**: tên queue/job, shape payload, retry/expire options.
- **Auth** (`authOptions`, session/JWT shape), **web push** (VAPID, payload).
- **Dependencies và config**: không thêm/nâng/hạ package; không đổi `next.config.ts`, `tsconfig.json`, tên env var.
- **Public export** của module dùng chung giữa worker và app.
- Phát hiện bug thật hoặc lỗ hổng bảo mật → ghi vào báo cáo cuối, **không tự sửa**.

## 3. Quy trình mỗi batch

1. Đọc lại code liên quan (không sửa theo trí nhớ).
2. Sửa tối thiểu, tối đa ~10 file hoặc ~300 dòng diff. Lớn hơn thì tách commit.
3. Verify: `npm run typecheck && npm run lint && npm test`; cứ 3 batch (và trước khi kết thúc) chạy thêm `npm run build`.
4. Pass → commit `refactor(cleanup): <mô tả ngắn>`. Fail → sửa tối đa 2 lần, vẫn fail thì `git reset --hard HEAD`, ghi "SKIPPED + lý do" vào log, sang batch kế.
5. Không để số lỗi tsc/eslint/test fail **cao hơn baseline** ở bất kỳ commit nào.
6. Không merge, không push, không mở PR nếu chưa được yêu cầu.

Công cụ có sẵn: `.kilocode/skills/nextjs-clean-code/scripts/{scan,verify}.sh`; log tiến độ ghi vào `.cleanup/LOG.md` (đã nằm trong `.git/info/exclude`).

## 4. Các batch

### Batch 0 — Dọn nền (rủi ro: thấp)

**Mục tiêu:** có baseline đáng tin cậy.

- [ ] `git status` sạch; tạo branch `chore/clean-code-20261006`.
- [ ] `npm install` (chỉ chạm `node_modules`, kiểm tra `git diff package.json package-lock.json` không đổi).
- [ ] Xóa `.next/` rồi `npx prisma generate`.
- [ ] `verify.sh --baseline` → ghi `.cleanup/baseline.txt`.

**Tiêu chí xong:** `tsc` = 0 lỗi; số test fail còn lại là các test thật ở mục 1.1 (kỳ vọng ≤ 9).

### Batch 1 — Phân loại test fail (rủi ro: thấp–trung)

**Mục tiêu:** biết test fail do test cũ hay do bug thật.

- [ ] `board-membership-store.test.ts` (7), `refresh-board-membership.test.ts` (3): so mock với `board-membership-store.ts` và schema hiện tại.
- [ ] `sub-routes.test.ts` (2): kiểm tra `completedTasks` ở `/members`, `/tasks`.
- [ ] `business-days.test.ts` (1): kiểm tra phụ thuộc thời gian/timezone, cố định bằng fake timers nếu đúng.
- [ ] Phân loại từng test: **(a)** test lỗi thời → cập nhật test; **(b)** code lỗi → ghi báo cáo, hỏi bạn trước khi sửa.

**Tiêu chí xong:** mọi test fail đều có kết luận (a) hoặc (b); nhóm (a) về xanh.

### Batch 2 — Lint cơ học (rủi ro: thấp)

- [ ] `eslint --fix` cho phần tự sửa được (3 lỗi + 1 cảnh báo).
- [ ] Xóa 54 import/biến thừa (`no-unused-vars`); không xóa tham số bắt buộc theo chữ ký hàm, đổi tên `_x` nếu cần.
- [ ] Sửa `prefer-const` (3), `no-unescaped-entities` (2).
- [ ] Xem 2 `role-has-required-aria-props`, 1 `no-img-element` — chỉ sửa nếu không đổi DOM/hành vi.

**Tiêu chí xong:** `no-unused-vars` = 0, `prefer-const` = 0, `no-unescaped-entities` = 0.

### Batch 3 — Siết type (rủi ro: thấp–trung)

- [ ] Thay 60 lỗi `no-explicit-any` bằng type thật hoặc `unknown` + narrowing. Chia commit theo thư mục: test (`worklogs`, `releases`, `queue/workers`), `process-webhook.ts`, recharts tooltip (`reports/`), còn lại.
- [ ] Giảm `as unknown as` ở code không phải test. Giữ lại các singleton `globalThis` (`prisma.ts`, `boss.ts`, `webhooks/_shared.ts`) và ép kiểu pg-boss stats.
- [ ] Rà 11 `eslint-disable`: bỏ cái không còn cần, thêm lý do ngắn cho cái giữ.

**Tiêu chí xong:** `no-explicit-any` = 0; `as unknown as` (non-test) giảm ≥ 50%.

### Batch 4 — React hooks & React Compiler (rủi ro: trung)

Dự án bật `babel-plugin-react-compiler`, nên 21 lỗi này có thể làm compiler bỏ qua tối ưu component.

- [ ] 16 chỗ `set-state-in-effect`: derive state trực tiếp trong render, hoặc `useMemo`, hoặc key-reset; chỉ giữ effect khi thật sự đồng bộ với hệ ngoài.
- [ ] 5 chỗ `preserve-manual-memoization`: sửa dependency của `useMemo`/`useCallback` cho khớp.
- [ ] Mỗi component sửa xong phải kiểm tra tay trên trình duyệt (xem mục 6).

**Tiêu chí xong:** 2 rule trên = 0, không đổi hành vi quan sát được.

### Batch 5 — Gom trùng lặp & dependency (rủi ro: trung)

- [ ] Chạy `scan.sh` (knip + jscpd), lọc false positive theo danh sách trong `SKILL.md` (file convention App Router, export đặc biệt, `public/sw.js`, worker entry, script).
- [ ] Route handler: gom phần mở đầu lặp (auth, parse/validate, bắt lỗi) vào helper chung, **giữ nguyên status code và JSON shape**. Làm theo cụm route (`bulk`, `reports`, `board`, `release`…), mỗi cụm một commit.
- [ ] Gom helper trùng ở `lib/jira`, `lib/bulk`.
- [ ] Dependency: chỉ **xóa** package đã xác minh không dùng (`grep` trong `src/ scripts/ prisma/ public/ *.config.*`).

**Tiêu chí xong:** jscpd giảm so với báo cáo ban đầu; không còn dependency chết.

### Batch 6 — Tách file lớn (rủi ro: trung–cao, làm cuối)

Quy tắc chung: tách theo trách nhiệm (hook dữ liệu, util thuần, sub-component trình bày); DOM giữ y hệt; mỗi file lớn là một hoặc nhiều commit riêng. Hàm thuần được tách ra thì bổ sung test nhỏ.

Thứ tự (từ ít rủi ro đến nhiều):

1. [ ] `status-distribution-chart.tsx` (1324) — chart, tách theo từng loại biểu đồ
2. [ ] `stale-client.tsx` (1836)
3. [ ] `leaderboard-client.tsx` (1045)
4. [ ] `board-client.tsx` (1993) + `board-quick-panel.tsx` (1055)
5. [ ] `issue-detail-client.tsx` (1427)
6. [ ] `bulk-client.tsx` (2254) và nhóm `bulk/create/*` (grid, csv-import, template dialog)
7. [ ] `lib/bulk/ops.ts` (1933), `create-ops.ts` (1111) — logic ghi Jira/DB, **chỉ tách khi có test bao phủ**
8. [ ] `lib/jira/client.ts` (1193) — tách theo domain (issue, board, project, auth); giữ nguyên export từ file gốc để import cũ không vỡ

**Tiêu chí xong:** không file nào > ~800 dòng (trừ file đã ghi lý do), UI đúng như trước theo checklist mục 6.

### Batch 7 — Dọn repo (rủi ro: thấp, cần bạn quyết định)

- [ ] `docs/`: giữ `architecture.md`, `RUNBOOK.md`, `release-policy.md`, `BACKUP_RESTORE.md`, `PR_CHECKLIST.md`, `notification-realtime.md`, `IMPLEMENTATION_STATUS.md`. Chuyển các file `*_PLAN.md` / `*_PROGRESS.md` đã thực hiện xong vào `docs/archive/` (dùng `git mv` để giữ lịch sử). Cập nhật link nếu có file khác trỏ tới.
- [ ] `public/`: xóa `file.svg`, `globe.svg`, `next.svg`, `vercel.svg`, `window.svg` nếu `grep` không còn tham chiếu.
- [ ] `.kilocode/` (177 file được commit) và `.kilo/` (7.3 GB, không commit): quyết định giữ, ignore hay chuyển ra ngoài repo.
- [ ] Rà `package.json` scripts, `scripts/` (backfill/cleanup một lần) và `README.md` cho khớp thực tế.

## 5. Quyết định cần bạn xác nhận

| # | Câu hỏi | Đề xuất |
|---|---|---|
| 1 | Làm đến hết Batch 6, hay dừng sau Batch 5 rồi đánh giá? | Dừng sau Batch 5, đánh giá, rồi mới vào Batch 6 |
| 2 | `docs/*_PLAN.md` đã xong: archive hay giữ? | Archive |
| 3 | `.kilocode/` và `.kilo/`: xử lý thế nào? | Ignore, không commit |
| 4 | Test nhóm (b) ở Batch 1 (bug thật): sửa ngay hay chỉ báo cáo? | Chỉ báo cáo, bạn quyết |

## 6. Kiểm thử thủ công cho UI (Batch 4 & 6)

Dự án chưa có test E2E, nên sau mỗi lần sửa component lớn cần chạy `npm run dev` (cổng 3100) và kiểm tra:

- [ ] Board: kéo thả thẻ, quick panel, bộ lọc, ẩn/hiện cột, trạng thái loading/empty
- [ ] Bulk edit và Bulk create: nhập CSV/Excel, chỉnh trong grid, tạo thử
- [ ] Stale, Leaderboard, Issue detail, Reports (các tab và biểu đồ)
- [ ] Light và dark mode, màn hình hẹp

## 7. Báo cáo kết thúc (`.cleanup/REPORT.md`)

- Số batch hoàn thành / bỏ qua (kèm lý do).
- Bảng trước → sau: lỗi tsc, lỗi/cảnh báo eslint, `any`, `as unknown as`, test pass/fail, số dòng (`git diff --stat main...HEAD`), kích thước file lớn nhất.
- Danh sách **phát hiện nhưng chưa sửa** vì chạm bất biến (bug tiềm ẩn, bảo mật, N+1…) để bạn quyết.
