# Kế hoạch khắc phục lag và chuyển tab chậm

> Ngày lập: 2026-10-20
> Phạm vi: điều hướng giữa các trang `(app)`, quay lại tab trình duyệt, các poller/invalidation toàn cục, các truy vấn server nặng
> Trạng thái: Proposed
> Liên quan: `docs/BOARD_LOADING_PERFORMANCE_FIX_PLAN.md` (đã làm phần explicit select cho `/api/issues`, commit `d7dc789`), `docs/REPORT_CACHING_PERFORMANCE_PLAN.md` (đã làm cache báo cáo portfolio/project detail, commit `4d26b5b`). Plan này không lặp lại các hạng mục đã xong.

## 1. Kết luận chẩn đoán

Câu hỏi: lag là do **tải quá nhiều dữ liệu** hay do **cache sai**?

Trả lời: **chủ yếu do cơ chế cache và refetch**, cộng thêm **một số trang đọc dữ liệu quá nặng**. Không có lời gọi Jira/Bitbucket đồng bộ trong lúc render; mọi thứ đọc Postgres.

| Triệu chứng | Nguyên nhân chính | Bằng chứng |
|---|---|---|
| Bấm sang trang khác trong app phải chờ skeleton | Mọi page `(app)` là dynamic, `staleTimes.dynamic` mặc định = 0 (Next 16), và page `await prefetchQuery(...)` trước khi trả JSX. Mỗi lần click, server chạy lại toàn bộ truy vấn DB, **kể cả khi TanStack Query ở client đã có dữ liệu còn fresh**. | `next.config.ts` (không có `staleTimes`), `stale/page.tsx:44`, `release/page.tsx:20-54`, `branches/page.tsx:44`, `board/page.tsx:16`, `reports/projects/[projectKey]/page.tsx:71-185` |
| Đổi filter cũng chậm | Filter ghi vào URL bằng `router.replace/push` → tạo RSC round-trip → chạy lại prefetch chặn ở trên, dù client đã tự fetch qua `useQuery`. | `board/board-client.tsx:87`, `branches/lib/use-branches-controller.ts:65`, `stale/hooks/use-stale-url-state.ts:93`, `sentry/sentry-client.tsx:123`, `notifications/hooks/use-notification-filters.ts:58`, `reports/projects/[projectKey]/lib/use-report-url-state.ts:81-84` |
| Quay lại tab trình duyệt thì giật/tải lại | (a) SSE reconnect gửi `data: ready` → `NotificationEvents` invalidate **toàn bộ** `issuesKeys.all` + branches → board refetch tới 1.000 dòng. (b) 2 `SessionProvider` lồng nhau, mỗi cái refetch `/api/auth/session` khi `visibilitychange`. (c) `useActiveSync`, unread count bật `refetchOnWindowFocus: true`. | `components/notification-events.tsx:16-25`, `api/notify/stream/route.ts:35`, `app/providers.tsx:50`, `(app)/session-hydrator.tsx:16`, `hooks/use-active-sync.ts:21`, `hooks/use-notifications.ts:35` |
| Thi thoảng lag dù không thao tác | Poller sync toàn cục đọc cursor của **mọi** project (không lọc theo user). Mỗi khi một sync bất kỳ kết thúc, client invalidate rộng: issues không có project param, `["projects"]` (prefix trùng cả peopleFields/members), `freshnessKeys.all`, `reportsKeys.all` → bão refetch + re-render board. Poll 2,5s khi đang có sync. | `hooks/use-active-sync.ts:14-41`, `api/sync/jira/active/route.ts:26` (`where: { integration: "jira" }`), `lib/query-keys.ts:39-57, 86-98` |
| Một số trang chậm hẳn | Truy vấn đọc cột JSON `raw` không giới hạn: Leaderboard (5.000 dòng, mọi thời gian, kèm `raw`), các tab báo cáo (toàn bộ issue của project kèm `raw`, phân trang trong bộ nhớ), Stale (2.000 dòng, filter trong bộ nhớ), Branches (~30 query/lần, gọi `listBranchesForUser` 2 lần). | `leaderboard/service.ts:48-68`, `reports/query-primitives.ts:28,170-176`, `reports/task-query.ts:41-49`, `stale/query.ts:22-27`, `branches/page.tsx:46-67` |

Không phát hiện lỗi query key giữa server prefetch và client (key khớp cho stale, release, branches, sentry, leaderboard, watch, notifications, reports). Vấn đề không phải "cache sai key" mà là **cache client bị bỏ qua khi điều hướng** và **bị xoá quá rộng khi có sự kiện**.

## 2. Mục tiêu và tiêu chí chấp nhận

- Quay lại một trang đã mở trong phiên (≤ 30s): hiển thị dữ liệu ngay, không có skeleton toàn trang.
- Đổi filter: không phát sinh request RSC (`?_rsc=`), chỉ request `/api/*` tương ứng.
- Quay lại tab trình duyệt sau ≥ 1 phút: không refetch list issues nếu không có thay đổi thực sự.
- Idle 1 phút trên `/board`: số request giảm ≥ 50% so với baseline; không có refetch `/api/issues` do sync của project user không tham gia.
- Leaderboard và tab báo cáo: thời gian server giảm ≥ 50% so với baseline.

## 3. Phase 0: Đo baseline (bắt buộc trước khi sửa)

Thực hiện trên production build (`npm run build && npm start` hoặc Docker image mới build), không đo bằng `next dev`.

1. Thời gian điều hướng sidebar cho từng trang (board, stale, release, branches, sentry, leaderboard, reports): ghi thời gian request RSC trong DevTools Network.
2. Số request trong 1 phút idle trên `/board` (lọc `/api/`), ghi rõ số lần `/api/issues` và `/api/sync/jira/active`.
3. Số request trong 5s sau khi quay lại tab trình duyệt (đã ẩn ≥ 1 phút).
4. Tỉ lệ thời gian `/api/sync/jira/active` trả `syncingProjects` khác rỗng trong 10 phút (để xác nhận poll 2,5s chạy thường xuyên).
5. Thời gian server của `getLeaderboardData`, `getStaleData`, tab tasks/members/history báo cáo (log tạm hoặc `console.time` cục bộ, không commit).

Ghi kết quả vào mục 8 của file này.

## 4. Phase 1: Chặn bão refetch phía client (rủi ro thấp, hiệu quả cao)

### 1.1 SSE chỉ invalidate đúng thứ cần
- File: `src/components/notification-events.tsx`
- Đọc `event.data`. Với `ready` (reconnect): chỉ invalidate `notificationsKeys.all`. Với `changed`: invalidate notifications; issues/branches chỉ invalidate khi server gửi kèm loại sự kiện liên quan (nếu chưa có, giữ notifications-only và để polling/sync xử lý issues).
- Nếu cần invalidate issues, dùng `refetchType: "active"` và không invalidate `branchesKeys.all` lẫn `tasksAll` cùng lúc.
- Test: unit test cho handler theo từng loại message.

### 1.2 Lọc active-sync theo project của user và thu hẹp invalidation
- Files: `src/app/api/sync/jira/active/route.ts`, `src/hooks/use-active-sync.ts`, `src/lib/query-keys.ts`
- Route: chỉ trả cursor thuộc project user có quyền (dùng scope project hiện có, ví dụ `listUserProjects`/user gate `boardProjects`).
- Hook: khi sync xong, không invalidate `boardKeys.projects` (prefix `["projects"]` trùng peopleFields/members); dùng key chính xác `exact: true`. Chỉ invalidate `reportsKeys` của các project vừa sync thay vì `reportsKeys.all`.
- Bỏ `refetchOnWindowFocus: true` hoặc giữ nhưng tăng `staleTime` để không refetch ngay khi focus.
- Gỡ việc mount hook lần 2 trên board (`board/lib/use-jira-sync.ts:14`) nếu có thể dùng chung data qua cùng query key (TanStack đã dedupe request, nhưng effect invalidation chạy 2 lần — cần đảm bảo chỉ một nơi thực hiện invalidation).

### 1.3 SessionProvider không refetch khi focus
- Files: `src/app/providers.tsx`, `src/app/(app)/session-hydrator.tsx`
- Đặt `refetchOnWindowFocus={false}` cho cả hai provider. **Không gỡ provider gốc**: comment REF-032.1 trong `providers.tsx` giải thích lý do phải giữ (xoá cache khi đổi user).

### 1.4 Filter URL không gây RSC round-trip
- Files: các controller filter liệt kê ở mục 1 (board, branches, stale, sentry, notifications, reports).
- Thay `router.replace(url)` bằng `window.history.replaceState(null, "", url)` (Next 16 App Router đồng bộ `useSearchParams` với `history.pushState/replaceState`; xác nhận lại trong `node_modules/next/dist/docs/` trước khi làm).
- Giữ `router.push` cho điều hướng thật giữa các trang.
- Test: thay đổi filter không tạo request `_rsc`; back/forward vẫn khôi phục filter.

Tiêu chí Phase 1: đạt mục 2 về filter, quay lại tab, idle.

## 5. Phase 2: Điều hướng không chờ server

Chọn **một** trong hai hướng, khuyến nghị thử A trước vì thay đổi nhỏ nhất.

### Hướng A: Bật client router cache cho trang dynamic ⚠️ cần duyệt (sửa `next.config.ts`)
- Thêm `experimental.staleTimes: { dynamic: 30 }`.
- Hiệu quả: quay lại trang trong 30s không gọi server; TanStack vẫn tự refetch nền theo `staleTime` của từng query.
- Rủi ro: tính năng experimental; dữ liệu server-prefetch có thể cũ tối đa 30s (chấp nhận được vì client query vẫn revalidate). Cần kiểm tra mutation có `router.refresh()` vẫn làm mới đúng.

### Hướng B: Prefetch không chặn render
- Bỏ `await` ở `prefetchQuery` trong các page; render ngay `HydrationBoundary` + client component có skeleton.
- Lưu ý: nếu không `await`, `dehydrate()` sẽ không có dữ liệu, trừ khi cấu hình dehydrate cả query đang pending (`shouldDehydrateQuery` gồm trạng thái `pending`) và client dùng `useSuspenseQuery`/streaming hydration. Thay đổi lớn hơn, phải sửa từng page và client component.
- Phương án nhẹ hơn của B: chỉ bỏ prefetch server khi client đã có dữ liệu là không khả thi (server không biết cache client), nên B là đổi sang streaming hoàn toàn.

Ngoài ra (áp dụng cho cả hai hướng):
- Thêm `loading.tsx` cho `watch` (hiện chưa có), để có prefetch phần layout và skeleton tức thì.
- Board: `getBoardBootstrap` chạy lại mỗi lần đổi `?project=`; sau 1.4 sẽ hết, nhưng cần kiểm tra lại.

Tiêu chí Phase 2: quay lại trang trong phiên không thấy skeleton, không có request RSC chờ DB.

## 6. Phase 3: Giảm chi phí truy vấn server

### 3.1 Leaderboard
- File: `src/lib/leaderboard/service.ts`, `calculator.ts`
- Bỏ `raw` khỏi select; lấy `customfield_10706` và `resolutiondate` qua cột riêng (xem 4.1) hoặc tạm thời bằng truy vấn JSON path chỉ hai trường.
- Thêm điều kiện thời gian theo kỳ (tháng/quý/năm) vào `where` thay vì lọc trong bộ nhớ.
- Cache kết quả 60s theo khoá `(scope, timeframe, period, project)` tương tự `reports/server-cache.ts`.

### 3.2 Các tab báo cáo
- Files: `src/lib/reports/task-query.ts`, `member-query.ts`, `history-query.ts`, `project-query.ts`, `query-primitives.ts`
- Bỏ `raw` khỏi `REPORT_ISSUE_SELECT` nếu không dùng; nếu dùng, chỉ trích trường cần.
- Task tab: phân trang bằng `skip/take` + `count` trong SQL thay vì lấy hết rồi cắt 20 dòng.
- Đưa các tab vào cache server hiện có (`reports/server-cache.ts`).

### 3.3 Stale
- File: `src/lib/stale/query.ts`, `calculator.ts`
- Đẩy filter assignee/status/"me" xuống SQL. Danh sách option filter lấy bằng `groupBy`/`distinct` riêng để giữ ổn định như comment hiện tại yêu cầu.
- Cache 60s theo scope.

### 3.4 Branches
- File: `src/app/(app)/branches/page.tsx`, `src/lib/bitbucket/branch-query.ts`
- Bỏ lần gọi `listBranchesForUser(..., { pageSize: 1 })` chỉ để lấy facets; tách hàm `getBranchFacets` chỉ chạy các `groupBy` cần.

### 3.5 Đọc lặp user/catalog trong một request
- Files: `src/lib/jira/project-catalog.ts`, `src/lib/reports/scope.ts`, `src/lib/stale/query.ts`, `src/app/api/me/status/route.ts`
- Bọc `listActiveProjects` bằng React `cache()` + TTL cache ngắn (ví dụ 60s, LRU đã có sẵn trong dependency).
- Các helper đang tự `prisma.user.findUnique` chuyển sang dùng `getCurrentUserGate` (đã có `cache()`).

### 3.6 `/api/issues` cho list view
- File: `src/lib/issues/list-route-service.ts`
- Loại các trường dài của `aiScore` (`reasoning`, `risks`, `missingInformation`, `similarTasks`) khỏi list select; chỉ trả ở issue detail. Kiểm tra component board/quick panel đang đọc các trường này để chuyển sang detail query.

Tiêu chí Phase 3: thời gian server các trang trên giảm ≥ 50% so với baseline Phase 0.

## 7. Phase 4: Schema và index ⚠️ cần duyệt (Prisma migration)

### 4.1 Cột trích từ `raw`
- Thêm cột `resolvedAt` (và trường done-at `customfield_10706` nếu cần) vào `IssueCache`, ghi khi sync; backfill một lần.

### 4.2 Index
- `IssueCache`: composite `(projectKey, deletedAt, assigneeJira, statusCategory)` cho board/bootstrap; `(projectKey, resolvedAt)` cho leaderboard sau 4.1.
- `SentryIssueImported`: index `targetProject`, `lastSeen`.
- `BranchInfo`: index `prUpdatedAt`; composite bắt đầu bằng `deletedAt`.
- `IssueTransitionEvent`: kiểm tra đã có `(projectKey, occurredAt)` chưa trước khi thêm.
- Xác nhận bằng `EXPLAIN ANALYZE` trên dữ liệu thật trước và sau.

## 8. Kết quả đo

| Chỉ số | Baseline | Sau Phase 1 | Sau Phase 2 | Sau Phase 3 |
|---|---|---|---|---|
| RSC điều hướng board (ms) | | | | |
| RSC điều hướng leaderboard (ms) | | | | |
| RSC điều hướng reports project (ms) | | | | |
| Request/phút idle trên board | | | | |
| Request trong 5s sau khi quay lại tab | | | | |
| % thời gian có sync active | | | | |

### Baseline thời gian server (Phase 0, mục 5)

Đo ngày 2026-10-20 bằng script cục bộ (không commit), gọi trực tiếp hàm service trên DB thật (7.848 issue: EPM 4.198, MHRM 1.276). Mỗi hàm chạy 4 lần; các lần sau gần như bằng lần đầu nên chi phí nằm ở tính toán/đọc dữ liệu, không phải cache lạnh.

| Hàm | Cold (ms) | Warm (ms) |
|---|---|---|
| `getLeaderboardData` (tháng) | 431 | ~125 |
| `getStaleData` (mọi project) | 11.247 | ~11.200 |
| `getProjectTasks` EPM | 106.046 | ~106.000 |
| `getProjectMembers` EPM | 6.129 | ~6.100 |
| `getProjectHistory` EPM | 4.764 | ~4.740 |
| `getProjectTasks` MHRM | 33.016 | ~33.000 |
| `getProjectMembers` MHRM | 1.157 | ~1.130 |
| `getProjectHistory` MHRM | 1.382 | ~1.385 |

Nhận xét: tab tasks (106s/33s) và stale (11s) vượt xa các con số còn lại và tăng nhanh hơn tuyến tính theo số issue, nên nghi có tính toán O(n²) trong bộ nhớ chứ không chỉ do đọc `raw`. Cần profile trước khi làm Phase 3.2/3.3. Leaderboard hiện nhẹ.

### Kết quả sau khi sửa `businessDaysInclusive` (2026-10-20)

Profile CPU cho thấy ~80% thời gian nằm ở `tzOffset` (`@date-fns/tz`), do `businessDaysInclusive` ([src/lib/date/index.ts](../src/lib/date/index.ts)) lặp từng ngày bằng `TZDate`. Đã thay bằng phép đếm số học (đối chiếu với bản cũ trên ~17.000 cặp ngày, khớp hoàn toàn).

| Hàm | Trước (ms) | Sau (ms) |
|---|---|---|
| `getStaleData` | ~11.200 | ~120 |
| `getProjectTasks` EPM | ~106.000 | ~880 |
| `getProjectTasks` MHRM | ~33.000 | ~225 |
| `getProjectMembers` EPM | ~6.100 | ~690 |
| `getProjectMembers` MHRM | ~1.130 | ~175 |
| `getProjectHistory` EPM | ~4.740 | ~4.800 (không đổi, nguyên nhân khác) |
| `getProjectHistory` MHRM | ~1.385 | ~1.400 (không đổi) |

Còn lại cần điều tra: `getProjectHistory` (4,8s trên EPM). Phase 3.3 (stale) không còn cấp thiết.

### Baseline phía client (Phase 0, mục 2–3), Chrome headless trên production build

Đo bằng Playwright, đăng nhập bằng Jira PAT, tài khoản không có sync nào đang chạy.

| Chỉ số | Kết quả |
|---|---|
| Request trong 60s idle trên `/board` | 7: `/api/sync/jira/active` ×4, `/api/freshness` ×2, `/api/notify/unread-count` ×1 (poll 15s vì không có sync active) |
| Request trong 5s sau khi quay lại tab (ẩn 65s) | `/api/auth/session` ×2 (hai `SessionProvider`); không refetch issues (không giả lập được SSE reconnect) |
| % thời gian có sync active (mục 4) | Chưa đo: tài khoản đo không có sync active; cần đo trên tài khoản có project đang sync |
| Thời gian RSC điều hướng (mục 1) | **Chưa có số đáng tin.** Hai lần đo bằng bộ lọc request khác nhau cho kết quả không nhất quán (nhiều trang không thấy request `_rsc`, một số 30–180 ms). Dữ liệu seed nhỏ nên server-prefetch có thể nhanh; cần đo lại bằng cách theo dõi `Server-Timing`/log server |

### Kết quả sau Phase 1 (2026-10-20, production build, Chrome headless)

Commit: `981f46f` (1.1), `c940bbb` (1.3), `4acfd75` (1.2), `79e3de9` (1.4).

| Chỉ số | Trước | Sau Phase 1 |
|---|---|---|
| Request `/api/auth/session` trong 5s sau khi quay lại tab (ẩn 65s) | 2 | **0** |
| Request `_rsc` khi đổi filter (notifications ×2, stale ×2, sentry ×1) | chưa đo (code dùng `router.replace`) | **0** ở 4/5 lần; lần còn lại là prefetch `<Link>` `/issue/...`, không phải điều hướng filter. URL vẫn cập nhật đúng |
| Request trong 60s idle trên `/board` | 7 | 7 (không đổi: tài khoản đo không có sync nào đang chạy nên không có refetch dư để bỏ) |

Chưa kiểm chứng được: refetch issues khi SSE reconnect (không giả lập được trong headless), và hiệu quả lọc active-sync khi có sync ở project user không tham gia (cần dữ liệu sync thật). Hai mục này được bảo vệ bằng unit test (`notification-events-keys.test.ts`, `active/route.test.ts`, `query-keys.test.ts`).

### Phase 2 đã triển khai (2026-10-20, hướng A)

- `next.config.ts`: thêm `experimental.staleTimes: { dynamic: 30 }`.
- Thêm `src/app/(app)/watch/loading.tsx` (skeleton tức thì).
- `router.refresh()` chỉ còn ở các trang auth (login/register/setup-jira), nơi cần làm mới cache router nên không bị ảnh hưởng.

Kết quả đo (production build, Chrome headless, script `nav.mjs`: click sidebar vào trang, quay về `/board`, rồi vào lại trang đó; mỗi lượt cách nhau khoảng 5s, trong cửa sổ 30s). Bộ lọc chỉ đếm request `_rsc` không phải prefetch.

| Trang | Lần 1 | Lần 2 (vào lại) |
|---|---|---|
| stale, release, branches, sentry, reports, notifications, board | không có RSC | không có RSC |
| leaderboard | 202 ms | không có RSC |
| watch | 43 ms | không có RSC |

- Lần vào lại: 9/9 trang không phát sinh request RSC chờ server, đạt tiêu chí Phase 2.
- Lần 1 của nhiều trang cũng "không có RSC" vì đã được prefetch bởi `<Link>` (bị loại khỏi bộ lọc), nên con số lần 1 không dùng để so sánh với baseline. Baseline RSC điều hướng ở mục 8 vẫn chưa có số đáng tin (xem trên).
- Chưa kiểm tra: mutation có hiển thị dữ liệu cũ tối đa 30s trên trang server-prefetch (client query vẫn revalidate theo `staleTime`).

## 9. Thứ tự triển khai đề xuất

1. Phase 0 (đo).
2. Phase 1: 1.1 → 1.3 → 1.2 → 1.4 (mỗi mục một commit, có test).
3. Phase 2 hướng A (sau khi được duyệt sửa `next.config.ts`), đo lại.
4. Phase 3: 3.1 → 3.2 → 3.5 → 3.3 → 3.4 → 3.6.
5. Phase 4 (sau khi được duyệt migration).

Các file được bảo vệ theo `AGENTS.md`: `next.config.ts`, `package.json`, Prisma migrations chỉ sửa khi developer duyệt đúng thay đổi đó.
