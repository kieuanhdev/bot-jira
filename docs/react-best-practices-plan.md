# Kế hoạch cải thiện theo Vercel React Best Practices

Ngày: 2026-10-15 · Phạm vi: `src/` (Next.js 16 App Router, React 19.2, React Compiler bật, TanStack Query)

> Đã đối chiếu với skill `vercel-react-best-practices` (70 rule, 8 nhóm) sau khi nạp skill. Mã rule trong ngoặc
> (`async-*`, `server-*`, ...) là rule của skill. Chưa chạy `next build` / profiler, nên các mục "đo trước khi sửa" cần xác nhận bằng số liệu.
> Theo AGENTS.md, trước khi sửa code Next.js phải đọc `node_modules/next/dist/docs/` (API Next 16 có thể khác).

> **Bản triển khai chi tiết (có đính chính):** [react-best-practices-detailed-plan.md](react-best-practices-detailed-plan.md)

## 1. Hiện trạng: những gì đã làm tốt (giữ nguyên)

- `reactCompiler: true` và `optimizePackageImports` cho `lucide-react`, `recharts`.
- Chỉ 1/21 `page.tsx` là client; các page mỏng, metadata đặt ở server.
- Code-split tốt chỗ nặng: `next/dynamic` cho Board Kanban/List/QuickPanel, tab Trends/Overview của report (recharts).
- `exceljs` chỉ dùng trong route handler và import động, không lọt vào bundle client chính.
- Có `loading.tsx` / `error.tsx`, Skeleton thay spinner; `Promise.all` được dùng ở API route (26 chỗ).
- `QueryClient` có `staleTime` tập trung (`query-policy.ts`), `refetchOnWindowFocus: false`, SSE invalidate thay vì chỉ polling.
- Polling tắt khi tab nền ở admin (`refetchIntervalInBackground: false`).

## 2. Các vấn đề đề xuất cải thiện (theo mức ưu tiên)

### P1 — Cao (ảnh hưởng tải trang / tải server)

**P1.1 Client-fetch waterfall ở các page "mỏng"** (`async-*`, `server-*`)
- Vấn đề: `watch`, `leaderboard`, `stale`, `release`, `branches`, `notifications`, `reports/projects`, `admin/*` chỉ render `<XxxClient />`, dữ liệu mới fetch sau khi HTML → JS → hydrate xong. Người dùng thấy skeleton rồi mới có dữ liệu.
- Chỉ `board` đã làm đúng (`getBoardBootstrap` ở server).
- Việc làm: với 3–4 trang truy cập nhiều nhất (đề xuất `board` đã xong → `watch`, `stale`, `reports/projects`), prefetch trên server bằng `HydrationBoundary` + `queryClient.prefetchQuery` (hoặc truyền `initialData`), dùng đúng `queryKey` hiện có trong `src/lib/query-keys.ts`.
- Tiêu chí: LCP/thời gian tới dữ liệu đầu tiên giảm; không đổi hành vi refetch.
- Rủi ro: lộ dữ liệu theo user → phải prefetch với session của request, không cache chéo user.

**P1.2 Truy vấn DB lặp ở layout mỗi lần điều hướng** (`server-cache-react`)
- `src/app/(app)/layout.tsx` gọi `getSession()` + `prisma.user.findUnique` ở mọi request; `getSession()` (`src/lib/session.ts`) không bọc `React.cache`, nên layout + page + route con gọi lại `getServerSession` nhiều lần trong cùng một request.
- Việc làm: bọc `getSession` bằng `cache()` của React (dedupe theo request); cân nhắc tách `loadOnboardingUser` thành hàm `cache()` dùng chung với page `setup-jira`.
- Lưu ý: chỉ dedupe trong một request; không đổi ngữ nghĩa bảo mật (vẫn kiểm tra mỗi request).

**P1.3 Polling chồng chéo** (`client-swr-dedupe`, tải server)
- `notifications-client.tsx:75` poll **5 giây** + `useUnreadCount` poll 20 giây + SSE `/api/notify/stream` (đã invalidate toàn bộ `notificationsKeys.all`). Ba cơ chế cho cùng dữ liệu.
- Việc làm: vì đã có SSE, bỏ hoặc nới `refetchInterval: 5000` lên ≥60s (giữ như fallback khi SSE rớt); (đính chính: TanStack Query mặc định đã `refetchIntervalInBackground: false`, không cần thêm — xem bản chi tiết).
- Tiêu chí: số request `/api/notify*` giảm rõ rệt khi tab nền / khi SSE đang sống.

### P2 — Trung bình

**P2.1 `NotificationEvents` invalidate quá rộng** (`rerender-*`, `client-*`)
- Mỗi sự kiện SSE invalidate `notificationsKeys.all`, `issuesKeys.all`, `["branches"]`, `["branches-tasks"]` bất kể loại sự kiện → refetch hàng loạt trên mọi trang đang mount.
- Việc làm: để server gửi `type` trong payload, client chỉ invalidate nhóm key liên quan; dùng `refetchType: "active"` (mặc định) và gom/debounce vài trăm ms khi có bão sự kiện.
- Còn dùng `["branches"]` literal thay vì factory trong `query-keys.ts` → đưa vào `query-keys.ts` cho nhất quán.

**P2.2 Component client quá lớn** (`bundle-dynamic-imports`, `rerender-*`)
- `admin-sync-client.tsx` (1034 dòng), `board-client.tsx` (890), `bulk-configure-step.tsx` (728), `jira-template-dialog.tsx` (679), `jobs-card.tsx` (645), `board-quick-panel.tsx` (623), `stale-std-task-list.tsx` (615), `tasks-tab.tsx` (613).
- Việc làm: tách theo vùng state (state cục bộ xuống component con để giảm re-render), lazy-load dialog/sheet chỉ mở khi cần (`jira-template-dialog`, `csv-import-dialog`, `branch-detail-sheet`, `error-sheet`) bằng `next/dynamic`.
- Đo trước: `next build` + `@next/bundle-analyzer` (cần cài; **thay đổi dependency cần bạn duyệt**) để chọn đúng chỗ.

**P2.3 Danh sách dài không virtualize** (`rendering-content-visibility`)
- `stale-std-task-list.tsx` map toàn bộ `filteredStdTasks` (2 chỗ), `notifications` infinite list, bảng task trong report. Chưa thấy `useVirtualizer`/`content-visibility`.
- Việc làm (nhẹ, không thêm dependency): thêm CSS `content-visibility: auto` + `contain-intrinsic-size` cho hàng/thẻ; chỉ thêm virtualization nếu đo thấy >~300 hàng gây chậm.

**P2.4 Hydration flicker ở sidebar** (`rendering-hydration-no-flicker`)
- `app-shell.tsx` đọc `localStorage` trong `useEffect` + rAF rồi `setCollapsed` → sidebar nháy từ mở sang thu gọn sau hydrate.
- Việc làm: lưu trạng thái vào cookie, đọc ở server layout (`cookies()`) và truyền `defaultCollapsed` xuống `AppShell`; hoặc script inline set `data-sidebar` sớm.

### P3 — Thấp / dọn dẹp

**P3.1 Thừa `useMemo`/`useCallback` khi đã bật React Compiler** (172 chỗ)
- Không gây lỗi, nhưng thêm nhiễu. Việc làm: không sửa hàng loạt; chỉ bỏ khi chạm vào file đó. Giữ lại những chỗ memo phục vụ identity ổn định cho dependency của effect/queryKey.

**P3.2 `<img>` thường cho avatar** (`jira-avatar.tsx`)
- Đã có `eslint-disable` và proxy qua `/api/jira/avatar` có `cache-control`. Thêm `loading="lazy"`, `decoding="async"`, `width/height` (giảm CLS) cho avatar ngoài viewport. Không cần `next/image`.

**P3.3 `import * as React`** trong ~10 file admin/ui
- Chỉ là style; chuyển sang named import (`import { useState } from "react"`) khi chạm file. Không ảnh hưởng bundle thực tế.

**P3.4 Một số route handler `await` tuần tự**
- `members`, `branches/[id]/link`, `releases/[id]`, `issues/[key]/links` có nhiều `await` liên tiếp. Rà từng route: chỉ gộp `Promise.all` khi các lời gọi độc lập (nhiều chỗ là auth → validate → ghi nên **cố ý tuần tự**; đừng đổi mù).

### Kiểm tra bổ sung theo skill (đã rà, kết quả)

- `bundle-barrel-imports`: **không vấn đề** — các barrel `src/lib/*/index.ts` không được client component import.
- `rendering-conditional-render` (`&&` với số), `rerender-no-inline-components`, `js-index-maps` (find trong map): **không thấy vi phạm** qua grep.
- `bundle-defer-third-party`: không có analytics/third-party trong layout/providers — OK.
- `client-passive-event-listeners`: listener `scroll` đã `{ passive: true }` — OK.
- `client-event-listeners` / `advanced-event-handler-refs` (**P3.5, mới**): có 4 listener `window keydown` riêng (`app-shell`, `board-client`, `board-keyboard-nav`, `member-detail-report`); `board-client` và `board-keyboard-nav` đăng ký lại mỗi lần deps đổi (`quickPanel`, `issues`, `focusKey`...). Việc làm: giữ handler trong ref (`useLatest`/`useEffectEvent`) để chỉ đăng ký một lần; cân nhắc một hook keyboard dùng chung. Ưu tiên thấp.
- `js-tosorted-immutable`: `bulk/versions/route.ts` dùng `.sort()` mutate mảng của `item` — vô hại nếu mảng không dùng lại, đổi sang `toSorted()` khi chạm file.
- `server-serialization`: `getBoardBootstrap` → client; nên kiểm tra payload chỉ chứa field UI cần (chưa đo).

## 3. Thứ tự thực hiện đề xuất

| Bước | Mục | Công sức | Rủi ro | Ghi chú |
|---|---|---|---|---|
| 0 | Chạy `next build`, ghi kích thước route + First Load JS làm baseline | S | Thấp | Cần cho mọi đo đạc sau |
| 1 | P1.2 `cache(getSession)` | S | Thấp | Thắng nhanh, dễ test |
| 2 | P1.3 bỏ poll 5s + `refetchIntervalInBackground:false` | S | Thấp | Kiểm SSE còn hoạt động |
| 3 | P2.4 sidebar qua cookie | S | Thấp | |
| 4 | P2.1 SSE invalidate theo loại | M | Trung | Cần đổi payload server |
| 5 | P1.1 prefetch server cho `watch`, `stale`, `reports/projects` | M–L | Trung | Từng trang một, mỗi trang 1 PR |
| 6 | P2.3 `content-visibility` cho danh sách dài | S | Thấp | |
| 7 | P2.2 tách component + lazy dialog | L | Trung | Sau khi có bundle analyzer |
| 8 | P3.x dọn dẹp cơ hội | S | Thấp | Làm kèm khi chạm file |

## 4. Kiểm chứng sau mỗi bước

- `npm run typecheck`, `npm run lint`, `npm test` (và `npm run test:db` nếu đụng DB).
- So `next build` trước/sau (First Load JS theo route).
- Với P1.1/P1.3: kiểm tab Network (số request, thời điểm có dữ liệu đầu tiên) ở cả light/dark mode và khi SSE bị ngắt.

## 5. Ngoài phạm vi / cần bạn quyết định

- Thêm `@next/bundle-analyzer` hoặc thư viện virtualize = thay đổi dependency → cần bạn duyệt.
- Working tree hiện có thay đổi chưa commit (Sentry import review: `src/lib/sentry/*`, `admin/sentry/*`, migrations). Nên commit/tách riêng trước khi bắt đầu để diff tối ưu hoá không lẫn vào.
- Không đụng `.kilo/`, `autoimprove/`, `AGENTS.md`, migrations Prisma trong đợt này.
