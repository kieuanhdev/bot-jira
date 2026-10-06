# Tiến trình refactor component dùng chung — PROGRESS LOG

> **Tài liệu gốc (kế hoạch):** [`docs/SHARED_UI_COMPONENT_REFACTOR_PLAN.md`](./SHARED_UI_COMPONENT_REFACTOR_PLAN.md)
> **File này:** ghi lại những gì ĐÃ LÀM, kết quả verify, quyết định đã chốt, và việc CÒN LẠI để có thể resume tiếp được.
> **Cập nhật lần cuối:** 2026-10-01
> **Trạng thái:** Phase 0 → Phase 5 **TẤT CẢ ĐÃ XONG & VERIFY.**

---

## 0. Hiện trạng nhanh (để resume)

| Pha | Trạng thái | Ghi chú |
|---|---|---|
| Phase 0 — baseline | ✅ Xong | Đã đo typecheck/lint/test/build trước khi bắt đầu |
| Phase 1 — foundation + pilot | ✅ Xong | Shared foundation + migrate `/watch`, `/branches` |
| Phase 2 — header/metric/filter | ✅ Xong | **Đã xong: tạo đủ 5 component + migrate toàn bộ 7 route.** |
| Phase 3 — feedback/mutation/dialog | ✅ Xong | inc-1: `FeedbackBanner` + `ConfirmDialog`. inc-2: domain hooks. inc-3: issue-detail + settings hooks. |
| Phase 4 — tách monolith theo domain | ✅ Xong | inc-1: Notifications, Release, Bulk, Stale. inc-2: **Board** (3296→1472) + Leaderboard/Settings cleanup. |
| Phase 5 — enforcement & docs | ✅ Xong | README hoàn thiện, PR checklist, ESLint import boundary, dead code cleanup. |

**Bước tiếp theo (next):** Program hoàn tất. Duy trì: PR checklist cho UI PRs, cân nhắc `ResponsiveDataView` khi có consumer thứ 2.

**Khối lượng còn lại theo plan §10 (thứ tự PR):**
4. Release ✅ → 5. Notifications ✅ → 6. Stale ✅ → 7. Bulk ✅ → 8. Leaderboard ✅ → 9. **Board ✅** → 10. Settings/Issue detail + enforcement ✅.

---

## 1. Kết quả verify (baseline vs hiện tại)

> Môi trường này **không có `npm` trên PATH**; chạy trực tiếp qua `node` (xem §6).

| Gate | Baseline (Phase 0) | Sau Phase 1 | Sau Phase 2 inc-1 | Sau Phase 2 inc-2 | Sau Phase 2 inc-3 | Sau Phase 2 inc-4 | Sau Phase 2 inc-5 | Sau Phase 2 inc-6 | Sau Phase 3 inc-1 | Sau Phase 3 inc-2 | Sau Phase 3 inc-3 | Sau Phase 4 inc-1 | Sau Phase 4 inc-2 | **Sau Phase 5** |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| typecheck | pass | pass | pass | pass | pass | pass | pass | pass | pass | pass | pass | pass | pass | **pass** |
| test | 786 (95 files) | 793 (96) | 793 (96) | 793 (96) | 793 (96) | 793 (96) | 793 (96) | 793 (96) | 793 (96) | 793 (96) | 793 (96) | 793 (96) | 793 (96) | **793 (96)** |
| lint | 46 (14 err, 32 warn) | 46 (14 err, 32 warn) | 41 (14 err, 27 warn) | 40 (14 err, 26 warn) | 40 (14 err, 26 warn) | 40 (14 err, 26 warn) | 40 (14 err, 26 warn) | 40 (14 err, 26 warn) | 40 (14 err, 26 warn) | 35 (14 err, 21 warn) | 35 (14 err, 21 warn) | 34 (14 err, 20 warn) | 26 (14 err, 12 warn) | **26 (14 err, 12 warn)** |
| build | pass (53 static) | pass | pass (53 static) | pass (53 static) | pass (53 static) | pass (53 static) | pass (53 static) | pass (53 static) | pass (53 static) | pass (53 static) | pass (53 static) | pass (53 static) | pass (53 static) | **pass (53 static)** |

- 14 lỗi lint còn lại là **có sẵn trước** (vd `set-state-in-effect` trong `bulk-client` URL-sync, `no-explicit-any` trong test `worklogs/*`), **không** do refactor gây ra, và ngoài phạm vi đợt này.
- Phase 2 inc-1 đã **giảm 5 warning** (xoá 5 import không dùng trong `release-client.tsx`).
- Phase 3 inc-2 đã **giảm thêm 5 warning** (xoá unused imports `CheckCircle2`, `GitPullRequest`, `CheckSquare` trong publish-dialog; dead vars `isEmpty`, `deliveryReadyCount`).
- Phase 4 inc-1: **34** (14 err, 20 warn). Phase 4 inc-2: **26** (14 err, 12 warn — giảm 8 warn từ xoá unused imports + dead code trong Board extraction).
- Phase 5: **26** (14 err, 12 warn — không thay đổi; ESLint boundary rule mới không flag gì vì shared components đã sạch).
- **Không** có lint error mới ở bất kỳ file đã sửa/tạo.

---

## 2. Phase 0 — Baseline & lập component map

- Đã đọc & rà codebase: các hotspot, pattern lặp, UI primitives (`src/components/ui`), design tokens (`src/app/globals.css`), design system `design-system/team-task-web/MASTER.md` + override `pages/board.md`, `pages/leaderboard.md`.
- Đo baseline 4 gate (bảng §1).
- Chốt: màu **phải dùng token oklch trong `globals.css`** (`bg-muted`, `text-destructive`, `border-destructive/30`...), **không** dùng hex trong MASTER hay class Tailwind màu cứng (`red-500`, `teal-400`...).
- Chốt cấu trúc 3 tầng: `ui/` (primitive) → `shared/` (app pattern) → `domain/` (hiểu nghiệp vụ), colocate trong route khi chỉ 1 route dùng.

---

## 3. Phase 1 — Foundation ít rủi ro + 2 pilot

### File MỚI trong `src/components/shared/`
| File | Export | Dùng ở |
|---|---|---|
| `page-container.tsx` | `PageContainer` (size narrow/default/wide/full; chỉ width+center, KHÔNG re-pad vì app shell đã pad) | watch, branches |
| `page-header.tsx` | `PageHeader` (eyebrow/icon/title/meta/description/badge/actions/footer; 1 `h1`, icon `aria-hidden`, actions wrap) | watch, branches, release |
| `empty-state.tsx` | `EmptyState` (icon trong muted circle + title + hint + action; border dashed) | watch, branches, release (sau này) |
| `async-state.tsx` | `AsyncState` (loading>error>empty>children; KHÔNG fetch) + `ErrorState` (token `destructive`, `role="alert"`, retry) | watch, branches |
| `skeleton.tsx` | `ListSkeleton`, `GridSkeleton` | watch (grid), branches (list) |
| `README.md` | — | decision tree + anti-pattern |

### File MỞ RỘNG / SỬA
- `src/lib/api-client.ts`: thêm `getErrorMessage(error, fallback?)` (normalize unknown → message an toàn; giữ `ApiError`).
- `src/lib/api-client.test.ts`: 7 test cho `getErrorMessage` (node env).
- `src/app/(app)/watch/watch-client.tsx`: dùng `PageContainer`+`PageHeader`+`AsyncState`+`GridSkeleton`+`EmptyState`+`ErrorState`; **thêm error state** (trước không có).
- `src/app/(app)/branches/branches-client.tsx`: `PageContainer`+`PageHeader`+`ListSkeleton`+`ErrorState`+`EmptyState`; **fix màu cứng** `red-500`→`destructive`, `teal-400`→`primary`; 3 empty state + jiraNotConfigured → `EmptyState`.
- `src/app/(app)/branches/branch-empty-state.tsx`: domain wrapper delegate sang `EmptyState` (giữ copy riêng).

**Không đổi:** query key, API call, URL/filter, mutation, permission, hành vi nghiệp vụ.

---

## 4. Phase 2 — Header / metric / filter (increment 1)

### File MỚI trong `src/components/shared/`
| File | Export | Ghi chú |
|---|---|---|
| `metric-card.tsx` | `MetricCard`, `MetricTone` | KPI tile; chỉ thành button khi có `onClick`; `tone` chỉ tô icon-chip, **selection ring luôn `primary`** để rõ trạng thái lọc |
| `metric-grid.tsx` | `MetricGrid` (columns 2/3/4/5) | wrapper responsive cho hàng `MetricCard` |
| `filter-bar.tsx` | `FilterBar` | layout-only: primary(trái)/secondary(phải) + nút "Xóa lọc (n)" khi `activeCount>0` & có `onReset` |
| `search-field.tsx` | `SearchField` | icon + nút clear (chỉ hiện khi có value), controlled |
| `segmented-control.tsx` | `SegmentedControl<T>` | `aria-pressed` toggle cluster; `tone` primary/neutral; `count` tuỳ chọn; **màu active đồng nhất** (per-item màu thuộc domain) |

### File SỬA
- `src/components/shared/page-header.tsx`: icon header đổi từ `bg-muted` → **`bg-primary/10 text-primary`** (token-based; ảnh hưởng release/notifications; không ảnh hưởng watch/branches vì không dùng icon).
- `src/app/(app)/release/release-client.tsx`:
  - Header → `PageHeader` (icon Rocket; **toàn bộ logic 5-trạng thái permission-gated "create release" giữ nguyên** trong slot `actions`).
  - Filter row → `FilterBar` + `Select`(dự án) + `SegmentedControl`(pills) + `SearchField`.
  - Xoá 5 import icon không dùng (Filter, CheckCircle2, Clock, Archive, Layers) + `Search` (đã chuyển vào `SearchField`).
- `src/app/(app)/release/release-summary-cards.tsx`: rewrite thành **domain wrapper** dùng `MetricGrid` + 5×`MetricCard` (map readiness → tone); **nút archived giữ nguyên** làm domain affordance.

### Verify Phase 2 inc-1
typecheck pass · test 793 pass · lint 41 (14 err, 27 warn) · build pass.

### Phase 2 increment 2 — Notifications

### File MỚI
- `src/app/(app)/notifications/notifications-summary-cards.tsx`: **domain wrapper** dùng `MetricGrid` + 4×`MetricCard`; "Chưa đọc" dùng `PulseDot` inline component (tone primary); "Cần chú ý" tone warning; selection ring đồng nhất `primary`.

### File SỬA
- `src/app/(app)/notifications/notifications-client.tsx`:
  - Header → `PageHeader` (icon Bell + unread badge trong slot `badge`; actions giữ nguyên).
  - 4 metric cards inline → `<NotificationsSummaryCards />`.
  - Search input → `SearchField`.
  - Status tabs (Tất cả/Chưa đọc/Đã đọc) → `SegmentedControl` (tone neutral).
  - Xoá import không dùng: `Cpu` (dead), `Search`, `CheckCircle2`, `AlertTriangle` (chuyển vào domain wrapper).
  - **Không đụng:** confirm dialog, notification list, category pills (domain-specific).

### Verify Phase 2 inc-2
typecheck pass · test 793 pass · lint 40 (14 err, 26 warn) · build pass.

### Phase 2 increment 3 — Stale

### File SỬA
- `src/app/(app)/stale/stale-client.tsx`:
  - Header → `PageHeader` (eyebrow "Sức khỏe luồng công việc", icon CircleGauge, meta "Cập nhật lúc...", action "Làm mới").
  - Filter panel "Phạm vi phân tích" → `FilterBar` (5 Selects as children, activeCount + onReset).
  - Error card → shared `ErrorState` (token `destructive`, `role="alert"`).
  - Internal `EmptyState` → `StaleEmptyState` domain wrapper delegating to shared `EmptyState` (keeps green CheckCircle2 for "no stale" state).
  - 2 search inputs → `SearchField`.
  - Xoá import không dùng: `Input`, `AlertCircle`.
  - **Không đụng:** view switcher (my-work/team), tab switcher (standardization/stale) — domain-specific dynamic colored badges; DnD/task list/standardization section.

### Verify Phase 2 inc-3
typecheck pass · test 793 pass · lint 40 (14 err, 26 warn) · build pass.

### Phase 2 increment 4 — Bulk

### File SỬA
- `src/app/(app)/bulk/bulk-client.tsx`:
  - Header → `PageHeader` (eyebrow "Không gian làm việc Jira", icon `ListChecks`, description, 2 badge dự-án/đếm-task trong slot `actions`).
  - Row "Chế độ chọn" (Chọn từng task / Tất cả khớp bộ lọc) → `SegmentedControl` (tone neutral; trước là 2 button `aria-pressed` tự viết).
  - Search input → `SearchField` (giữ `aria-label`, placeholder theo dự án; thêm nút clear).
  - Row trạng thái/người phụ trách + "Đặt lại bộ lọc" → `FilterBar` (2 `Select` + dòng đếm task làm `children` trong grid, `activeCount` + `onReset` chuẩn hóa nút reset). Thêm helper `activeFilterCount` + `resetTaskFilters`.
  - **Không đụng:** Top Navigation Switcher (`/bulk` ↔ `/bulk/create`), Progress Steps, Standardization Banner, project scope selector, task list/selection, Step 2 field editor, Step 3 preview/confirm, Operations History, confirm `Dialog`, `AssigneeInput`, `OperationDetail`.
  - `Search` icon vẫn dùng ở empty-state "Không tìm thấy task phù hợp" (không xóa import).

### Verify Phase 2 inc-4
typecheck pass · test 793 pass · lint 40 (14 err, 26 warn — không thêm lỗi mới; 3 lỗi `set-state-in-effect` là có sẵn trong URL-sync, chưa đụng) · build pass (53 static).

### Phase 2 increment 5 — Leaderboard

### File MỚI
- `src/app/(app)/leaderboard/leaderboard-summary-cards.tsx`: **domain wrapper** dùng `MetricGrid` (columns 4) + 4×`MetricCard` (read-only, không `onClick`). Map 4 KPI → tone (Tổng điểm `primary`, Task chốt `success`, Điểm TB `info`, MVP `warning`); unit ("Story Points", "tasks hoàn thành", "pts / người") đưa vào `description`; card MVP dùng value string (tên) + points sub-line; `loading` → skeleton value chuẩn.

### File SỬA
- `src/app/(app)/leaderboard/leaderboard-client.tsx`:
  - Header → `PageHeader` (icon `Trophy`; bỏ gradient icon-chip tự viết → treatment chuẩn `primary/10`; nút "Làm mới" giữ trong `actions`, thêm `motion-reduce:animate-none`).
  - 4 KPI cards inline + skeleton → `<LeaderboardSummaryCards />`.
  - **Thêm error state:** guard `error && !data` quanh vùng dữ liệu (KPI + personal banner + podium + table) → shared `ErrorState` (`getErrorMessage` + retry). Trước đó error bị "ẩn" thành empty.
  - Empty "Không có dữ liệu" → shared `EmptyState` (icon `Inbox`).
  - Xoá import không dùng sau khi tách KPI: `CheckCircle2`.
  - **Không đụng:** filter bar (timeframe/period/project), Personal Performance Banner, Top 3 Podium, ranking table, Task Contribution `Dialog`, `TierIcon`/`RankBadge`.
  - Podium/ranking là **domain visual** giữ nguyên theo override `pages/leaderboard.md`.

### Verify Phase 2 inc-5
typecheck pass · test 793 pass · lint 40 (14 err, 26 warn — không thêm lỗi mới; 6 unused-import + 1 `any` ở sort dropdown là có sẵn) · build pass (53 static).

### Phase 2 increment 6 — Board

### File MỚI
- `src/app/(app)/board/board-summary-cards.tsx`: **domain wrapper** dùng `MetricGrid` (columns 4, gap-2) + 4×`MetricCard` (read-only, `className="p-3"` compact theo override `pages/board.md`). Map 4 KPI → tone: "Mở" `info`, "Đang làm" `primary`, "Tồn đọng (7d+)" `warning`, "Hoàn thành" `success`. Accept `summary` object + `loading` boolean.

### File SỬA
- `src/app/(app)/board/board-client.tsx`:
  - 4 `SummaryTile` inline → `<BoardSummaryCards />` (xoá component `SummaryTile` nội bộ + import `TrendingUp` không còn dùng).
  - Filter row (Search + AssigneeMultiSelect + 2 Select) → `FilterBar` + `SearchField` (flex-1) + selects; thêm `activeFilterCount` + `resetFilters` (reset về default: q="", label="", priority="", assignees=["me"]).
  - Board/List view toggle (2 button tự viết) → `SegmentedControl<ViewMode>` (tone primary; "Bảng" disabled khi `width === "narrow"` theo responsive rule).
  - Empty state "Không có task nào để hiển thị" → shared `EmptyState` (icon `Search`, className="flex-1").
  - **Không đụng:** DnD logic (`DndContext`, `DragOverlay`, `collisionDetection`, `onDragStart/Over/End`), `BoardColumn`, `DraggableCard`, `CardContent`, `BoardSkeleton`, project picker, sync polling, quick panel, command palette, keyboard navigation, optimistic transitions, WIP limit, column collapse.
  - Board header (project tabs + sync + sort + "Tìm nhanh") giữ nguyên — là domain toolbar, không phải page header truyền thống (không có title/icon/description).

### Verify Phase 2 inc-6
typecheck pass · test 793 pass · lint 40 (14 err, 26 warn — không thêm lỗi mới; 2 unused-vars ở QuickPanel là có sẵn) · build pass (53 static).

---

## 4b. Phase 3 — Feedback & confirm (increment 1)

> Bắt đầu Phase 3. Tạo 2 base component + migrate consumer ngay (không orphan). Chuẩn hóa
> pending/disable/retry ở mức dialog; lỗi 401/403/409/428 vẫn giữ nguyên (không đụng API).

### File MỚI trong `src/components/shared/`
| File | Export | Ghi chú |
|---|---|---|
| `confirm-dialog.tsx` | `ConfirmDialog` | Confirm 1 bước (delete/run/submit). Props: `title`, `icon`, `description`, `children` (body tuỳ chọn, vd notes list), `onConfirm`, `confirmLabel`, `cancelLabel`, `tone` (`default`/`destructive`), `pending`, `disabled`, `error`. `pending` chặn close/Escape/overlay + double-submit + spinner; `disabled` chỉ chặn nút confirm. Focus trả về trigger nhờ Radix. **Chỉ** cho confirm thuần — form dialog tiếp tục dùng Radix `Dialog`/domain dialog. |
| `feedback-banner.tsx` | `FeedbackBanner`, `FeedbackTone` | Banner inline status sau mutation / flag stale. `tone` (`info`/`success`/`warning`/`destructive`) → token semantic (primary/teal, emerald, amber, destructive); icon mặc định theo tone; `action` slot (vd nút "Làm mới"); `role` mặc định `alert` cho warning/destructive, `status` còn lại. Server-compatible. |

### File SỬA (migrate consumer)
- `src/app/(app)/notifications/notifications-client.tsx`:
  - Confirm xoá (selected / allRead) → `ConfirmDialog` (`tone="destructive"`, `icon=Trash2`, `pending=isDeleting`, labels "Xác nhận xóa"/"Hủy bỏ"). Xoá import block `Dialog*` (chỉ còn dùng ở 1 dialog). `Trash2` giữ (vẫn dùng ở các nút xoá lẻ).
  - **Không đụng:** list, selection, mark read/unread, category pills, summary cards.
- `src/app/(app)/bulk/bulk-client.tsx`:
  - Confirm chạy thao tác (log-work / update-fields) → `ConfirmDialog` (`tone` default, `icon` theo `isLogWorkOp`, body "Lưu ý trước khi thực thi" vào slot `children`, `pending=confirming`, `disabled` khi không có task, `className="sm:max-w-lg"` giữ chiều rộng cũ). Nút confirm trước có màu teal riêng cho log-work → giờ dùng variant `default` (`bg-primary` = teal) cho cả 2, đồng nhất.
  - 2 banner `previewError` (destructive) + `previewOutdated` (warning + action "Làm mới xem trước") → `FeedbackBanner` (icon mặc định TriangleAlert/CircleAlert khớp bản cũ). Xoá import `TriangleAlert` (không còn dùng); `CircleAlert` giữ (vẫn dùng ở preview bucket).
  - **Không đụng:** selection, field editor, preview table, operation history, DnD, `doPreview`/`doConfirm` logic.

### Verify Phase 3 inc-1
typecheck pass · test 793 pass · lint 40 (14 err, 26 warn — **không thêm lỗi mới**; 3 `set-state-in-effect` ở URL-sync + 1 `isIndeterminate` là có sẵn) · build pass (53 static).

### Phase 3 inc-2 — Domain hooks + `api()` thống nhất

> Mục tiêu: chuyển mutation từ raw `fetch`/inline async sang `useMutation` + `api()` trong domain hooks.
> Giữ nguyên xử lý riêng biệt 401/403/409/428. Không đổi API contract.

### File MỚI
| File | Export | Ghi chú |
|---|---|---|
| `src/hooks/use-releases.ts` | `useReleaseSync`, `useCreateRelease`, `useSaveReleaseNotes`, `usePublishRelease`, `ReleasePublishError`, `ReleaseBlocker` | Domain hooks cho release mutations. `ReleasePublishError extends ApiError` mang `blockers[]` cho 409. Publish dùng raw `fetch` (cần structured error response) nhưng vẫn throw `ApiError`-compatible. 403 ở create → invalidate permissions. |
| `src/hooks/use-branches.ts` | `useBranchSync`, `useBranchLink` | Domain hooks cho branch mutations. `useBranchLink` chấp nhận `{ action: "confirm" | "reject" | "unlink" }` hoặc `{ jiraKey, reason }`. Invalidates cả `["branches"]` và `["branches-tasks"]`. |

### File SỬA (migrate consumer)
- `src/app/(app)/release/release-client.tsx`:
  - Xoá `syncing`/`creating` state + raw `fetch` handlers.
  - Dùng `useReleaseSync()` + `useCreateRelease()`; pending = `mutation.isPending`.
  - Xoá `useQueryClient` (invalidation giờ trong hook).
  - **Không đụng:** query, filter logic, permission-gated UI, KPI cards, dialog form.
- `src/app/(app)/release/release-card.tsx`:
  - `handleSaveNotes`: xoá raw `fetch` + `savingNotes` state → `useSaveReleaseNotes()`.
  - Xoá dead code `isEmpty`.
- `src/app/(app)/release/release-publish-dialog.tsx`:
  - Xoá `useState` loading/error/blockers + raw `fetch` → `usePublishRelease()`.
  - `errorMsg` = derived từ `publishMutation.error`; `blockers` = `error instanceof ReleasePublishError ? error.blockers : []`.
  - Xoá dead code `isReady`; xoá unused imports (`CheckCircle2`, `GitPullRequest`, `CheckSquare`).
- `src/app/(app)/branches/branches-client.tsx`:
  - Xoá `syncing` state + 4 raw `fetch` handlers → `useBranchSync()` + `useBranchLink()`.
  - `handleConfirmSuggestion`/`handleRejectSuggestion` dùng `mutateAsync` (component `await`s callback).
  - `BranchLinkDialog` onSuccess: xoá manual refetch (hook invalidate tự xử lý).
  - **Không đụng:** URL filter state, view rendering, pagination, toolbar, detail sheet.
- `src/app/(app)/branches/branch-link-dialog.tsx`:
  - Xoá `submitting`/`error` state + raw `fetch` → `useBranchLink()`.
  - `error` derived từ mutation; `submitting` → `linkMutation.isPending`.
  - `linkMutation.reset()` sau success để clear error khi reopen.
- `src/app/(app)/freshness-banner.tsx`:
  - Fix màu hardcoded: `bg-red-500/10 text-red-700 dark:text-red-400 border-red-300/40` → `bg-destructive/10 text-destructive border-destructive/30` (token semantic).
  - `border-amber-300/40` → `border-amber-500/30` (đồng nhất với Badge variant).

### Verify Phase 3 inc-2
typecheck pass · test 793 pass · lint **35** (14 err, 21 warn — **giảm 5 warn so với inc-1**; không thêm error mới) · build pass (53 static).

### Quyết định bổ sung
10. **`usePublishRelease` dùng raw `fetch` thay vì `api()`:** endpoint publish trả về structured error response (409 với `blockers[]`, 428 với `error` code) mà `api()` không expose. Hook vẫn throw `ApiError`-compatible để caller xử lý thống nhất qua `getErrorMessage()`.
11. **`ReleasePublishError extends ApiError`:** typed subclass mang `blockers: ReleaseBlocker[]`. Cho phép caller type-guard `instanceof` để render blocker list mà không cần cast.
12. **Branch hooks invalidate 2 key prefix:** `["branches"]` và `["branches-tasks"]` là key arrays riêng biệt (không prefix-match nhau). Hook invalidate cả hai để đảm bảo tất cả active queries được refetch.

### Phase 3 inc-3 — Issue-detail hooks + Settings hooks + `FeedbackBanner`

> Mục tiêu: migrate mutations còn lại (issue-detail-client, settings) sang domain hooks;
> adopt `FeedbackBanner` cho issue-detail message display.

### File MỚI
| File | Export | Ghi chú |
|---|---|---|
| `src/hooks/use-issue-detail.ts` | `useIssueFieldMutation`, `useIssueTransition`, `useIssueWatch`, `useIssueAiScore`, `useIssueAiDecision`, `useIssueComment`, `useIssueCreateBranch`, `useIssueWorklog`, `WorklogBody` | Domain hooks cho issue-detail mutations. Mỗi hook nhận `jiraKey` và invalidate query keys phù hợp. `useIssueWorklog` invalidate cả `issuesKeys.all` và `staleKeys.all`. |

### File SỬA (migrate consumer)
- `src/hooks/use-settings.ts`:
  - Thêm `useNotificationPreferences` (PATCH `/api/notify/preferences`, setQueryData cache).
  - Thêm `useSaveDiscordIntegration` (PUT `/api/discord/integration`, invalidate `chatKeys.identity`).
  - Thêm `useRemoveDiscordIntegration` (DELETE `/api/discord/integration`, invalidate `chatKeys.identity`).
- `src/app/(app)/issue/[key]/issue-detail-client.tsx`:
  - Xoá `doAction` generic wrapper + 8 raw `api()` mutation calls.
  - Dùng 8 hooks từ `use-issue-detail.ts`; local state refresh qua `refreshIssue()` helper.
  - `msg` state đổi từ `string | null` → `{ tone, text } | null`; display dùng `FeedbackBanner` (thay div plain).
  - Error messages dùng `getErrorMessage()` (thay `(e as Error).message`).
  - Xoá import `staleKeys` (giờ trong hook); xoá `type CreateWorklogResult` (giờ trong hook).
  - **Không đụng:** DnD, tabs layout, worklog dialog form, AI score UI, branch table, comment list, URL params logic.
- `src/app/(app)/settings/notification-preferences.tsx`:
  - Inline `useMutation` → `useNotificationPreferences()` hook.
  - Wrapper `mutatePrefs()` thêm `onSuccess` callback cho `setSaveSuccess` (UI state).
  - Xoá import `useMutation`, `useQueryClient`.
- `src/app/(app)/settings/chat-linking.tsx`:
  - 2 inline `useMutation` → `useSaveDiscordIntegration()` + `useRemoveDiscordIntegration()`.
  - `onSuccess` callbacks (clear state, set message) chuyển vào `mutate` call options.
  - Xoá import `useMutation`, `useQueryClient`.

### Verify Phase 3 inc-3
typecheck pass · test 793 pass · lint **35** (14 err, 21 warn — không thêm lỗi mới) · build pass (53 static).

### Quyết định bổ sung (tiếp)
13. **Issue-detail dùng `mutateAsync` + `refreshIssue()`:** page dùng local state cho issue detail (SSR props → `useState`), không dùng query. Hook invalidate queries cho OTHER components (board, stale); page refetch issue cho local state qua `refreshIssue()` helper.
14. **`msg` state structured:** đổi từ `string` → `{ tone, text }` để `FeedbackBanner` biết tone. Progress messages (vd "Đang chấm điểm AI…") dùng tone `info`.
15. **Settings `onSuccess` trong mutate call:** hook chỉ handle API + invalidation. UI-level side effects (`setSaveSuccess`, `setMessage`, `setWebhookUrl("")`) truyền qua `mutate(body, { onSuccess })` — không đưa vào hook.

---

## 4c. Phase 4 — Tách monolith theo domain (increment 1)

> Mục tiêu: tách các file client quá lớn thành phần điều phối + domain section + pure mapper.
> Giữ nguyên API contract, URL, permission, data flow. Mỗi route có 1 PR tách biệt.

### 4A. Notifications (1053 → 471 dòng)

### File MỚI
| File | Export | Ghi chú |
|---|---|---|
| `lib/notification-metadata.ts` | `NOTIFICATION_CATEGORIES`, `getCategoryConfig`, `formatRelativeTimeVi`, `formatFullTimeVi`, `groupNotificationsByDate` | Pure functions + data config cho category/time/grouping |
| `notification-filters.tsx` | `NotificationFilters` | Search + SegmentedControl + category pills (presentational) |
| `notification-row.tsx` | `NotificationRow` | 1 card notification (presentational, nhận callbacks) |
| `notification-list.tsx` | `NotificationList` | Grouped list + loading/error/empty states + load-more |

### File SỬA
- `notifications-client.tsx`: chỉ còn orchestration (state, query, selection, handlers, composition).

### 4B. Release (514 → 422 dòng)

### File MỚI
| File | Export | Ghi chú |
|---|---|---|
| `release-create-dialog.tsx` | `ReleaseCreateDialog` | Form dialog tạo release (presentational, nhận state qua props) |

### File SỬA
- `release-client.tsx`: xoá Dialog inline (99 dòng) → dùng `ReleaseCreateDialog`. Xoá imports `Dialog*`, `Input`, `Label`, `Loader2`.

### 4C. Bulk (2108 → 1719 dòng)

### File MỚI
| File | Export | Ghi chú |
|---|---|---|
| `lib/bulk-types.ts` | All types + `ACTION_LABELS`, `SKIP_LABELS`, `CATEGORY_DOTS`, `CATEGORY_TEXT` | Type definitions + constants |
| `lib/bulk-utils.ts` | `itemHasChange`, `previewBucket`, `stateVariant`, `itemVariant`, `warningVariant`, `categoryOf`, `statusDot`, `formatTime`, `labelList`, `formatSecondsToJira` | Pure utility functions |
| `bulk-assignee-input.tsx` | `AssigneeInput` | Autocomplete combobox (self-contained) |
| `bulk-operation-detail.tsx` | `OperationDetail` | Progress/detail viewer (self-contained, có query + invalidation) |

### File SỬA
- `bulk-client.tsx`: xoá types + utils + 2 sub-components. Giữ `fieldRow` (JSX helper dùng trực tiếp trong component).

### 4D. Stale (2618 → 1828 dòng)

### File MỚI
| File | Export | Ghi chú |
|---|---|---|
| `lib/stale-types.ts` | All interfaces + `ALL`, `SEVERITY_VARIANT`, `SEVERITY_LABEL`, `GROUP_DOT`, `ACTION_BY_REASON` | Type definitions + constants |
| `lib/stale-utils.ts` | `priorityScore`, `sortTasks`, `matchesFocus`, `formatTimeSpent`, `formatDueDate`, `buildMissingBulkFields` | Pure utility functions |
| `stale-task-meta.tsx` | `SeverityBadge`, `TaskMeta`, `GreenCheck` | Small presentational helpers |
| `stale-standardization-action.tsx` | `BulkStandardizationAction` | Complex action button/dropdown (175 dòng) |
| `stale-my-work-healthy.tsx` | `MyWorkHealthyState` | "Tuyệt vời!" card khi không có stale (128 dòng) |
| `stale-team-sections.tsx` | `FocusCard`, `InsightBrief`, `ActionQueue`, `AgingDistribution` | 4 section components cho team view |

### File SỬA
- `stale-client.tsx`: chỉ còn orchestration + `StaleEmptyState` (domain-specific copy).

### Verify Phase 4 inc-1
typecheck pass · test 793 pass · lint 34 (14 err, 20 warn — không thêm lỗi mới) · build pass (53 static).

### Decision
 16. **`fieldRow` giữ trong bulk-client:** là JSX helper dùng trực tiếp 8 lần trong preview section, không đủ lớn để tách riêng. Tách sẽ chỉ thêm 1 file với 1 function.
 17. **`StaleEmptyState` giữ trong stale-client:** dùng `GreenCheck` + copy domain-specific, là domain wrapper nhỏ.

### Phase 4 inc-2 — Board (3296 → 1472 dòng) + Leaderboard/Settings cleanup

> Mục tiêu: tách Board (high risk DnD) thành phần điều phối + domain section + pure mapper.
> Tách pure card/view model TRƯỚC khi động tới DnD để giảm regression risk.
> Leaderboard/Settings: cleanup nhỏ (xoá unused imports).

### 4E. Board (3296 → 1472 dòng)

### File MỚI
| File | Export | Ghi chú |
|---|---|---|
| `lib/board-types.ts` | `Project`, `SortMode`, `QuickAction`, `ViewMode`, `Transition`, `BoardSyncState`, `QuickPanelDetail` + constants `PRIORITY_RANK`, `PRIORITY_META`, `AVATAR_PALETTE`, `CATEGORY_DOTS`, `CATEGORY_TEXT`, `CATEGORY_ORDER`, `CATEGORY_DOT_MAP` | Type definitions + visual constants |
| `lib/board-utils.ts` | `daysSince`, `sortIssues`, `priorityMeta`, `avatarClass`, `initials`, `typeShort`, `statusDot`, `statusText`, `columnKeyForIssue` | Pure utility functions (no React) |
| `board-card.tsx` | `CardContent`, `DraggableCard` | Card body (215 dòng) + DnD wrapper (82 dòng) |
| `board-column.tsx` | `BoardColumn`, `BoardSkeleton` | Droppable column (186 dòng) + loading skeleton (27 dòng) |
| `board-quick-panel.tsx` | `QuickPanel` (+ internal `Section`, `Field`) | Slide-over detail panel (1010 dòng) — self-contained queries/mutations |

### File SỬA
- `board-client.tsx`: chỉ còn orchestration — state, queries, DnD context, transition handlers, toolbar, project picker, filter bar, board rendering, command palette, list view.

### 4F. Leaderboard cleanup
- Xoá 5 unused imports: `Flame`, `Target`, `UserIcon`, `Filter`, `ShieldAlert`, + type `LeaderboardTaskItem`.

### Verify Phase 4 inc-2
typecheck pass · test 793 pass · lint **26** (14 err, 12 warn — **giảm 9 warn so với inc-1**) · build pass (53 static).

### Decision
18. **Board DnD context giữ nguyên trong client:** `DndContext`, `DragOverlay`, `collisionDetection`, `onDragStart/Over/End` là orchestration logic, không phải presentational — giữ trong `board-client.tsx`.
19. **`CardContent` export từ `board-card.tsx`:** cần bởi cả `DraggableCard` (trong board-column) lẫn `DragOverlay` (trong board-client) — không tạo circular import vì board-client import board-card trực tiếp.
20. **`QuickPanel` self-contained:** có query + mutation riêng (transitions, branches, comments, watch, field patches). Tách ra không cần truyền state từ parent ngoài `issue` + `jiraBaseUrl` + `assignees` + `onClose`.

---

## 4d. Phase 5 — Enforcement & docs

> Mục tiêu: hoàn thiện documentation, tạo PR checklist, thêm import boundary rule,
> cleanup dead code. Program hoàn tất sau phase này.

### File SỬA
- `src/components/shared/README.md`: hoàn thiện từ 108 → ~230 dòng. Thêm:
  - Usage examples cho mọi component (full pattern query-backed list, metric row, filter bar, segmented control, feedback banner, confirm dialog).
  - Domain wrapper pattern (example + references).
  - Accessibility rules section.
  - Dark mode & visual rules section.
  - Anti-pattern table (10 items, giải thích aty bad).
  - Verification checklist khi thêm/sửa shared component.
  - Server-compatible column trong catalog table.

### File MỚI
- `docs/PR_CHECKLIST.md`: checklist 10 mục cho UI/refactor PRs. Áp dụng bắt buộc
  cho PR thuộc program này. Bào gồm: scope, reuse/architecture, a11y, visual,
  async states, performance, quality gates, cleanup, documentation, regression test manual.

### File SỬA (config)
- `eslint.config.mjs`: thêm `no-restricted-imports` rule cho `src/components/shared/**`:
  - Cấm import `@/app/*` (route files).
  - Cấm import `@/hooks/*` (domain hooks).
  - Cấm import `@/lib/releases|branches|board/*` (domain lib).
  - Dùng core ESLint rule, không cần plugin mới.

### Dead code cleanup
- Xóa `useNotifications` hook (24 dòng) từ `src/hooks/use-notifications.ts` — bị thay
  thế bằng `useInfiniteQuery` inline trong `notifications-client.tsx`, không còn importer.

### Verify Phase 5
typecheck pass · test 793 (96 files) pass · lint **26** (14 err, 12 warn — không thêm lỗi mới) · build pass (53 static).

### Decision
21. **ESLint boundary dùng `no-restricted-imports` (core rule):** không cần `eslint-plugin-import` hay custom rule. Pattern-based restriction đủ cho 3 boundaries quan trọng (shared → app, shared → hooks, shared → domain lib).
22. **Không thêm barrel `index.ts` cho `shared/`:** import trực tiếp file tránh circular dependency và giữ bundle tối ưu.

---

## 5. Catalog component `shared/` (hiện tại)

**ĐÃ CÓ (14 component + README):**
`PageContainer`, `PageHeader`, `EmptyState`, `AsyncState`, `ErrorState`, `ListSkeleton`, `GridSkeleton`, `MetricCard`, `MetricGrid`, `FilterBar`, `SearchField`, `SegmentedControl`, `ConfirmDialog`, `FeedbackBanner`.

**CHƯA TẠO (đủ consumer thật rồi mới tạo, tránh abstraction mồ côi):**
- `ResponsiveDataView` → Phase 2/3 (branches đã có BranchTable/BranchCardList; thử API sau khi chứng minh giảm lặp).

---

## 6. Lệnh verify (môi trường không có `npm`)

```bash
node node_modules/typescript/bin/tsc --noEmit --incremental false   # typecheck
node node_modules/eslint/bin/eslint.js src scripts prisma           # lint
node node_modules/.bin/vitest run                                   # test
node node_modules/.bin/next build                                   # build
```
(Máy có `npm` thì dùng `npm run typecheck|lint|test|build`.)

**Nguyên tắc mỗi bước:** thêm component + migrate consumer ngay trong cùng bước (không tạo abstraction chưa dùng); sau mỗi route phải pass đủ 4 gate; không trộn redesign/đổi API contract.

---

## 7. Ma trận migration theo route (trạng thái)

| Route | Base pattern đã áp dụng | Trạng thái |
|---|---|---|
| `/watch` | container, header, async/empty/error, grid skeleton | ✅ Phase 1 |
| `/branches` | container, header, async/error/empty, list skeleton, responsive (có sẵn) | ✅ Phase 1 |
| `/release` | header, metric (PoC), filter bar, search, segmented + **tách create-dialog** | ✅ Phase 2 + 4B |
| `/notifications` | header, metric, search, segmented, confirm + **tách filters/row/list/metadata** | ✅ Phase 2 + 3 + 4A |
| `/stale` | header, filter bar, search, async/empty + **tách types/utils/6 sub-components** | ✅ Phase 2 + 4D |
| `/bulk` | header, filter bar, confirm, feedback + **tách types/utils/assignee/operation-detail** | ✅ Phase 2 + 3 + 4C |
| `/leaderboard` | header, metric, async state (+error), empty state + **cleanup unused imports** | ✅ Phase 2 + 4F |
| `/board` | metric, filter bar, search, segmented, empty state + **tách card/column/quick-panel/types/utils** | ✅ Phase 2 + 4E |
| `/settings` | feedback, domain hooks | ✅ Phase 3 + 4F |
| `/issue/[key]` | feedback, domain hooks | ✅ Phase 3 |

---

## 8. Quyết định & deviation (đã chốt, có lý do)

1. **`FeedbackBanner`/`ConfirmDialog` tạo ở Phase 3 inc-1** (không Phase 1): pilot (Phase 1) chưa có consumer thật nên dời sang Phase 3 để tôn trọng anti-pattern "chưa có consumer thứ hai". Mỗi component có ≥2 consumer thật trước khi vào `shared/`.
2. **Chưa có DOM/component render test:** repo chỉ có vitest `node` env (chạy `*.test.ts`, không jsdom/testing-library). Plan §9.1 nói thêm hạ tầng DOM test là **PR riêng** → chỉ test pure function (`getErrorMessage`). Component contract test sẽ làm khi có DOM env.
3. **`MetricCard` selection ring = `primary` đồng nhất:** `tone` chỉ tô icon-chip. Mục đích: trạng thái "đang lọc" luôn rõ, không phụ thuộc màu category (standard hóa theo tinh thần Phase 2).
4. **Mở rộng `PageHeader` thêm slot `meta`** (hint inline cạnh title, vd "• Đã đồng bộ 5m") — plan liệt kê slots cơ bản nhưng cần slot này cho Branches; là composition hợp lý, không phải boolean.
5. **Không đổi width/padding trang Release ở Phase 2:** Release tự có wrapper `max-w-7xl mx-auto px-4 py-6` (double-padding so với app shell). Phase 2 chỉ chuẩn hóa header/metric/filter. **Adopt `PageContainer` cho Release là follow-up** (cần verify visual về độ rộng trước).
6. **Pill/KPI active color** đổi từ màu riêng (amber/teal/emerald) → `primary` đồng nhất; màu category giữ ở icon-chip. Là standard hóa có chủ đích.
7. **Board không dùng `PageHeader`:** top bar của Board là domain toolbar (project tabs + sync + view toggle + sort + search shortcut), không phải page header truyền thống (không có title/icon/description). Ép `PageHeader` vào sẽ làm mất semantics của toolbar. Giữ nguyên layout, chỉ chuẩn hóa phần metric/filter/empty.
8. **`ConfirmDialog` chỉ cho confirm 1 bước; form dialog giữ nguyên** (Create Release, CSV Import, Branch Link, task detail modal). `pending` chặn close/Escape/overlay + double-submit + spinner; `disabled` chỉ chặn nút confirm. Form nhiều field tiếp tục dùng Radix `Dialog`/domain dialog.
9. **Màu confirm/feedback dùng token, không hex:** `ConfirmDialog` tone `default` dùng nút `bg-primary` (teal) cho cả 2 operation Bulk (thay màu teal riêng của log-work, đồng nhất). `FeedbackBanner` tone dùng token semantic (primary/teal, emerald, amber, destructive) theo đúng quy ước status color của app (khớp `Badge` variant) — không hex/Tailwind màu rải rác.

---

## 9. Việc CÒN LẠI (checklist tiếp theo)

### Phase 2 (hoàn tất)
- [x] **Notifications**: `PageHeader` (icon Bell + unread badge) + 4 metric → `MetricGrid`/`MetricCard` (domain wrapper vì pulse-dot + màu giá trị) + `SearchField` + status tabs → `SegmentedControl` (tone neutral). KHÔNG đụng confirm-dialog/list ở bước này.
- [x] **Leaderboard**: `PageHeader` + metric (domain wrapper `leaderboard-summary-cards`) + async state (+error) + empty state. Podium/ranking giữ domain.
- [x] **Stale**: `PageHeader` + filter panel → `FilterBar`/`SegmentedControl` + thay `EmptyState` nội bộ bằng shared.
- [x] **Bulk**: `PageHeader` + filter (segmented + search + filter bar) → `FilterBar`.
- [x] **Board**: metric (domain wrapper `board-summary-cards`) + filter bar (`FilterBar` + `SearchField`) + view toggle → `SegmentedControl` + empty state → shared `EmptyState`. DnD/columns/cards giữ nguyên.
- [ ] (tuỳ chọn) Branches adopt `SearchField`/`SegmentedControl` cho toolbar.

### Phase 3
- [x] **inc-1 — `ConfirmDialog`:** migrate confirm xoá notification + confirm Bulk (không migrate form dialog).
- [x] **inc-1 — `FeedbackBanner`:** migrate 2 banner Bulk (`previewError` destructive + `previewOutdated` warning/action).
- [x] inc-2: chuẩn hóa pending/disable/retry/server-error; domain hooks `use-releases` + `use-branches` với `api()` thống nhất; giữ 401/403/409/428.
- [x] inc-3: migrate mutations issue-detail sang `use-issue-detail` hook; extract settings mutations (`notification-preferences`, `chat-linking`) sang `use-settings`; adopt `FeedbackBanner` cho issue-detail msg display.

### Phase 4
- [x] **4A. Notifications:** tách thành `notification-filters`, `notification-row`, `notification-list` + `lib/notification-metadata.ts`. Client 1053→471 dòng.
- [x] **4B. Release:** tách `release-create-dialog.tsx`. Client 514→422 dòng.
- [x] **4C. Bulk:** tách `lib/bulk-types.ts`, `lib/bulk-utils.ts`, `bulk-assignee-input.tsx`, `bulk-operation-detail.tsx`. Client 2108→1719 dòng.
- [x] **4D. Stale:** tách `lib/stale-types.ts`, `lib/stale-utils.ts`, `stale-task-meta.tsx`, `stale-standardization-action.tsx`, `stale-my-work-healthy.tsx`, `stale-team-sections.tsx`. Client 2618→1828 dòng.
- [x] **4E. Board:** tách `lib/board-types.ts`, `lib/board-utils.ts`, `board-card.tsx`, `board-column.tsx`, `board-quick-panel.tsx`. Client 3296→1472 dòng.
- [x] **4F. Leaderboard & Settings:** xoá 5 unused imports ở leaderboard. Settings đã đủ từ Phase 3.

### Phase 5
- [x] Bổ sung `shared/README.md` (hoàn thiện: examples, a11y rules, anti-patterns, verification checklist).
- [x] PR checklist: `docs/PR_CHECKLIST.md` (10 mục: scope, reuse, a11y, visual, async states, performance, gates, cleanup, docs, regression).
- [x] ESLint import boundary: `no-restricted-imports` rule cho `shared/` (cấm import app/hooks/domain-lib).
- [x] Dead code cleanup: xóa `useNotifications` (orphan hook, 24 dòng).

---

## 10. Definition of Done cho MỘT route (nhắc lại)

Route được xem migrate xong khi: dùng base pattern phù hợp (không còn implementation lặp đã thay); khác biệt nghiệp vụ nằm trong domain component/hook; loading/error/empty/filtered-empty/refetch đúng; API/permission/mutation/invalidation/URL không đổi ngoài thay đổi được duyệt; keyboard/a11y/light-dark/responsive đã kiểm; test + typecheck + lint + build pass; dead code/import cũ đã xoá; docs shared cập nhật nếu API đổi.
