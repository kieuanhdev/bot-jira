# Kế hoạch chi tiết: cải thiện hiệu năng React/Next.js

Ngày: 2026-10-15 · Căn cứ: skill `vercel-react-best-practices` + đọc code thực tế
Tài liệu tổng quan: [react-best-practices-plan.md](react-best-practices-plan.md). File này là bản triển khai chi tiết và **thay thế** mục tổng quan nếu hai bên khác nhau.

## 0. Đính chính so với bản tổng quan (sau khi đọc code kỹ hơn)

| Mục cũ | Đính chính |
|---|---|
| P1.3: "thêm `refetchIntervalInBackground: false`" | **Thừa.** Mặc định của TanStack Query đã là `false`. Bỏ bước này, chỉ chỉnh `refetchInterval`. |
| P2.1: "SSE gửi `type`, client invalidate theo nhóm" | **Không khả thi nhẹ.** Kênh Postgres `notification_changes` chỉ mang `userId` làm payload (`src/lib/notify/realtime.ts`), stream chỉ gửi `data: changed`. Đổi payload cần đổi trigger/migration (thuộc nhóm file bảo vệ). Hạ xuống "gom (debounce) invalidate", làm sau cùng và chỉ khi đo thấy bão refetch. |
| P1.1: prefetch cả `watch`, `stale`, `reports/projects` | `reports/projects` đã có cache phía server (`getOrComputeReport`) và phụ thuộc `period/timezone` từ URL → **hoãn**. `stale` phụ thuộc nhiều tham số URL → **chỉ làm trường hợp mặc định, sau `watch`**. |
| Thêm: `SessionProvider` không có `session` | **Phát hiện mới (P1.4).** Mọi lần tải trang, client phải gọi `/api/auth/session` rồi mới biết `userId` để mở SSE (`NotificationEvents`). |
| Thêm: `GET /api/watch` | **Phát hiện mới (P1.5).** 3 truy vấn nối tiếp, `getUserScopedProjects` không phụ thuộc kết quả `watch.findMany`. |

## 1. Quy tắc làm việc chung

1. **Mỗi phase = một PR/commit riêng**, bắt đầu từ working tree sạch. Hiện đang có thay đổi Sentry chưa commit (`src/lib/sentry/*`, `admin/sentry/*`, 2 migration): commit hoặc stash trước.
2. **Đọc docs Next 16 trước khi sửa** (`node_modules/next/dist/docs/01-app/`) cho: `cookies()` (async), `HydrationBoundary`/data fetching, `cache`. AGENTS.md cảnh báo API có thể khác kiến thức cũ.
3. **Không đụng**: `.kilo/`, `autoimprove/`, `AGENTS.md`, `package.json`/lockfile, `.env*`, `prisma/migrations/`, cấu hình deploy. Không cài dependency nếu bạn chưa duyệt.
4. **Cổng kiểm tra bắt buộc sau mỗi phase**: `npm run typecheck && npm run lint && npm test`. Phase đụng DB thêm `npm run test:db`.
5. **Giới hạn kiểm thử**: `vitest` chỉ chạy `src/**/*.test.ts` trong môi trường `node` → **không có test cho component `.tsx`**. Thay đổi UI phải kiểm tay (checklist ở từng phase), logic tách ra hàm thuần để có test.
6. UI vẫn theo `design-system/team-task-web/MASTER.md` (Skeleton, token màu, light + dark, `prefers-reduced-motion`).

## Phase 0 — Baseline (không đổi code)

**Mục tiêu:** có số liệu trước/sau.

- [ ] `npm run build`, lưu bảng route + First Load JS ra `docs/perf-baseline-2026-10-15.txt` (không commit nếu bạn không muốn).
- [ ] Mở DevTools Network ở `/board` → ghi: số request đầu tiên, thời điểm `/api/auth/session` hoàn tất, số request `/api/notify*` trong 60 giây (tab đang mở / tab nền).
- [ ] Mở `/watch` → ghi thời gian từ điều hướng tới khi hết skeleton.

**Hoàn thành khi:** có 3 con số baseline trên (build size, request notify/60s, thời gian `/watch`).

## Phase 1 — Thắng nhanh, rủi ro thấp (ước tính 0.5–1 ngày)

### 1.1 `React.cache` cho `getSession` — rule `server-cache-react`

- **File:** [src/lib/session.ts](../src/lib/session.ts)
- **Hiện trạng:** `getSession = () => getServerSession(authOptions)`; 128 chỗ gọi; trong một request RSC, `(app)/layout.tsx` + `admin/layout.tsx` + `page.tsx` đều gọi lại.
- **Làm:**
  ```ts
  import { cache } from "react";
  export const getSession = cache(() => getServerSession(authOptions));
  ```
  Giữ nguyên chữ ký (không tham số) → không phải sửa nơi gọi. `requireUser` vẫn trả `getSession()`.
- **Lưu ý:** `cache()` chỉ dedupe trong một lần render RSC; ở route handler nó gọi thẳng (không hại). Test hiện mock `@/lib/session` nên không ảnh hưởng.
- **Kiểm tra:** `npm test`; đăng xuất → vào `/board` phải về `/login`; đổi user → session đúng user (cache không sống qua request).
- **Rollback:** revert 1 dòng.

### 1.2 Giảm polling thông báo — rule `client-swr-dedup` (trùng cơ chế)

- **File:** [notifications-client.tsx:75](../src/app/(app)/notifications/notifications-client.tsx), [use-notifications.ts:34](../src/hooks/use-notifications.ts)
- **Hiện trạng:** danh sách poll 5s + badge poll 20s + SSE (`NotificationEvents` đã invalidate `notificationsKeys.all` khi có thay đổi, và khi reconnect nhận `data: ready`).
- **Làm:**
  - `notifications-client.tsx`: `refetchInterval: 5000` → `60_000` (lưới an toàn khi SSE rớt). Giữ `refetchOnWindowFocus: true`.
  - `use-notifications.ts`: `20_000` → `60_000`. Giữ `refetchOnWindowFocus: true`.
  - **Không** thêm `refetchIntervalInBackground` (đã mặc định false).
- **Kiểm tra tay:** (a) mở 2 tab, tạo thông báo cho user → badge cập nhật gần như tức thì nhờ SSE; (b) tắt SSE bằng cách chặn `/api/notify/stream` trong DevTools → badge vẫn cập nhật trong ≤60s; (c) đếm request `/api/notify*` trong 60s so với baseline (kỳ vọng giảm ~10 lần ở trang thông báo).
- **Rủi ro:** nếu SSE hay rớt ở production (proxy cắt kết nối), độ trễ lên tới 60s. Trong trường hợp đó đặt lại 20s cho badge.

### 1.3 Avatar không gây CLS, tải lười — rule `rendering-*` (CLS)

- **File:** [src/components/jira-avatar.tsx](../src/components/jira-avatar.tsx) (thẻ `<img>` ở khoảng dòng 85)
- **Làm:** thêm `loading="lazy"`, `decoding="async"`, `width`/`height` theo `size` (xs 16, sm 20, md 24, lg 32, xl 48 — khớp `SIZE_MAP`). Giữ nguyên `eslint-disable no-img-element` (ảnh đi qua proxy `/api/jira/avatar` có `cache-control`).
- **Kiểm tra:** avatar vẫn tròn, không méo (class `h-full w-full object-cover` đã có); light/dark; trang board nhiều avatar vẫn hiển thị khi cuộn.

### 1.4 Dọn nhỏ khi chạm file (không PR riêng)

- `import * as React` → named import trong file admin bạn đang sửa.
- `bulk/versions/route.ts`: `.sort()` mutate → `toSorted()` (rule `js-tosorted-immutable`). Kiểm tra `tsconfig` target/lib có `toSorted` (ES2023) trước khi đổi.

**Cổng Phase 1:** typecheck + lint + test xanh; Network cho thấy số request notify giảm.

## Phase 2 — Loại bỏ waterfall khi tải trang (ước tính 1–2 ngày)

### 2.1 Truyền session từ server vào `SessionProvider` — rule `async-*` (P1.4)

- **Vấn đề:** [providers.tsx](../src/app/providers.tsx) dùng `<SessionProvider>` không prop `session` ⇒ client fetch `/api/auth/session` sau hydrate; `NotificationEvents` chờ `userId` rồi mới mở `EventSource`.
- **Làm (ít xâm lấn nhất):** `(app)/layout.tsx` đã có `session`. Tạo wrapper client nhỏ `src/app/(app)/session-hydrator.tsx`:
  ```tsx
  "use client";
  import { SessionProvider } from "next-auth/react";
  export function SessionHydrator({ session, children }) {
    return <SessionProvider session={session}>{children}</SessionProvider>;
  }
  ```
  và bọc `AppShell` trong layout. Provider lồng nhau hợp lệ; Provider ngoài (root) vẫn phục vụ `(auth)`.
- **Cần xác nhận khi làm:** `SessionCacheBoundary` trong `providers.tsx` dùng `useSession()` từ **provider gần nhất**; sau khi bọc, nó nằm *ngoài* provider mới nên vẫn đọc session của provider root → vẫn đúng logic `queryClient.clear()` khi đổi user, nhưng phải kiểm tra login → logout → login user khác không còn thấy cache cũ.
- **Phương án thay thế nếu phức tạp:** truyền `session` ngay tại root layout (`getSession()` ở `app/layout.tsx`) — đơn giản hơn nhưng làm cả trang `/login` thành dynamic; chỉ chọn nếu bạn chấp nhận.
- **Kiểm tra:** Network lần tải đầu không còn `/api/auth/session` trước `/api/notify/stream`; đăng xuất/đăng nhập hoạt động; đổi user không rò cache.
- **Rủi ro:** trung bình (đụng auth/cache chéo user). Làm riêng PR, test kỹ.

### 2.2 Song song hoá `GET /api/watch` + tách hàm dùng chung (P1.5)

- **File:** [src/app/api/watch/route.ts](../src/app/api/watch/route.ts) → tạo `src/lib/watch/list.ts`.
- **Hiện trạng:** `watch.findMany` → `getUserScopedProjects` → `issueCache.findMany` (3 bước nối tiếp, bước 2 độc lập bước 1) — rule `async-parallel`.
- **Làm:**
  ```ts
  export async function listWatchedItems(userId: string, role?: string) {
    const [watches, scope] = await Promise.all([
      prisma.watch.findMany({ where: { userId }, orderBy: { watchedAt: "desc" } }),
      getUserScopedProjects(userId, role),
    ]);
    if (watches.length === 0) return [];
    // issueCache.findMany + join như cũ
    // trả watchedAt dạng ISO string để khớp type `Watched` phía client
  }
  ```
  Route chỉ còn: auth → `listWatchedItems` → `NextResponse.json({ items })`.
- **Đánh đổi:** user không theo dõi gì vẫn chạy thêm 1 truy vấn scope (nhẹ); đổi lại trường hợp thường gặp nhanh hơn.
- **Test:** thêm `src/lib/watch/list.test.ts` (mock prisma): rỗng → `[]`; lọc theo scope; `watchedAt` là string. Giữ nguyên hợp đồng JSON.

### 2.3 Prefetch dữ liệu `/watch` ở server — rule `async-suspense-boundaries` + `server-*`

Phụ thuộc 2.2. Làm **một trang thử nghiệm** để chốt mẫu, rồi mới nhân rộng.

- **Mẫu (đặt ở `src/lib/query-server.ts`, mới):** hàm `getServerQueryClient()` tạo `QueryClient` **mỗi request** (không dùng biến module — rule `server-no-shared-module-state`, tránh rò dữ liệu giữa user), cùng `defaults` từ `queryPolicy`.
- **`watch/page.tsx`:**
  ```tsx
  export default async function WatchPage() {
    const session = await getSession();
    const qc = getServerQueryClient();
    if (session?.user?.id) {
      await qc.prefetchQuery({
        queryKey: watchKeys.all,
        queryFn: async () => ({ items: await listWatchedItems(session.user.id, session.user.role) }),
      });
    }
    return <HydrationBoundary state={dehydrate(qc)}><WatchClient /></HydrationBoundary>;
  }
  ```
  `WatchClient` giữ nguyên (đã dùng đúng `watchKeys.all` và `staleTime` 90s).
- **Bẫy cần tránh:** dữ liệu prefetch phải **cùng hình dạng** với JSON của API (Date → ISO string), nếu không client hiển thị sai/nhấp nháy khi refetch. Prefetch lỗi không được làm sập trang: bọc `try/catch` hoặc dùng `prefetchQuery` (không throw) và để client tự fetch lại.
- **Kiểm tra:** tải `/watch` không còn skeleton + request `/api/watch` ban đầu; unwatch một task vẫn cập nhật; hai user khác nhau không thấy dữ liệu của nhau (đăng nhập 2 trình duyệt).
- **Tiêu chí quyết định nhân rộng:** thời gian tới nội dung đầu tiên giảm rõ so với baseline Phase 0.

### 2.4 `/stale` — chỉ trường hợp mặc định (làm sau 2.3, có điều kiện)

- Đã có sẵn hàm dùng chung `executeStaleQuery(session.user, parseStaleQueryParams(url))` ([api/stale/route.ts](../src/app/api/stale/route.ts)) → dễ gọi từ page.
- Cần **khớp đúng** `staleKeys.list(project, assignee, status, reason, severity)` với giá trị mà `stale-client` tính từ URL (view mặc định `my-work` ⇒ `assignee = "me"`). Nếu lệch một tham số, prefetch vô dụng.
- **Làm nếu và chỉ nếu** 2.3 cho kết quả tốt: page đọc `searchParams`, dựng cùng bộ tham số, prefetch; bất kỳ URL không mặc định → bỏ qua prefetch.
- **Không làm:** `reports/projects` (đã có server cache; phụ thuộc period/timezone).

**Cổng Phase 2:** cổng chung + kiểm tra tay đa user (rò cache) + so baseline.

## Phase 3 — UX hydrate và danh sách dài (ước tính 1 ngày)

### 3.1 Sidebar không nháy khi tải trang — rule `rendering-hydration-no-flicker`

- **File:** [app-shell.tsx](../src/app/(app)/app-shell.tsx) (khối `useEffect` + `requestAnimationFrame` đọc `localStorage`), `(app)/layout.tsx`.
- **Hiện trạng:** server luôn render sidebar mở, client thu gọn sau hydrate ⇒ nháy. Trong repo chưa dùng `cookies()` ở đâu.
- **Làm:**
  1. `layout.tsx`: `const collapsed = (await cookies()).get("sidebar_collapsed")?.value === "true";` (Next 16: `cookies()` async — kiểm docs) → `<AppShell defaultCollapsed={collapsed} ...>`.
  2. `AppShell`: `useState(defaultCollapsed)`; **xoá** effect đọc `localStorage`; `toggleSidebar` ghi cookie: `document.cookie = "sidebar_collapsed=" + next + "; path=/; max-age=31536000; SameSite=Lax"`.
  3. Di trú: người dùng cũ mất trạng thái đã lưu **một lần** (chấp nhận được; hoặc đọc `localStorage` một lần để ghi cookie).
- **Layout đã dynamic** (đọc session/cookie) nên không mất static rendering.
- **Kiểm tra:** thu gọn → F5 → không nháy; light/dark; mobile menu không đổi; phím tắt Ctrl/Cmd+B vẫn chạy.

### 3.2 Danh sách chuẩn hoá (`stale-std-task-list`) — rule `rendering-content-visibility`

- **File:** [stale-std-task-list.tsx](../src/app/(app)/stale/stale-std-task-list.tsx) (map `filteredStdTasks` ở ~dòng 554 và ~588).
- **Hiện trạng:** render toàn bộ cả mobile (card) lẫn desktop (table) cùng lúc (ẩn bằng CSS) ⇒ gấp đôi DOM; không giới hạn số dòng (danh sách chính ở `stale-client` đã có `visibleCount = 50`).
- **Làm:**
  1. Áp dụng cùng cơ chế "Xem thêm" (`visibleCount`, bước 50) cho danh sách chuẩn hoá. **Đây là cách hiệu quả hơn `content-visibility` vì `content-visibility` không dùng được tốt trên `<tr>`.**
  2. Chỉ render **một** biến thể theo viewport nếu có hook media-query sẵn; nếu không, giữ nguyên hai biến thể nhưng cùng bị giới hạn bởi `visibleCount`.
  3. Với card mobile: thêm utility `.cv-auto { content-visibility: auto; contain-intrinsic-size: auto 96px; }` trong `globals.css` (kiểm `prefers-reduced-motion` không liên quan).
  4. "Chọn tất cả" phải làm việc trên **toàn bộ** `filteredStdTasks` hay chỉ phần đang hiển thị? Giữ đúng hành vi hiện tại (hiện là toàn bộ, nhãn nói "đang hiển thị") → ghi rõ trong PR và hỏi bạn nếu muốn đổi.
- **Kiểm tra:** lọc/sắp xếp giữ nguyên; chọn nhiều + hành động hàng loạt đúng; cuộn không nhảy layout.

**Cổng Phase 3:** cổng chung + kiểm tay light/dark/mobile.

## Phase 4 — Cấu trúc code (làm theo cơ hội, cần đo trước)

Chỉ bắt đầu sau khi có số liệu bundle. **Cần bạn duyệt** nếu muốn cài `@next/bundle-analyzer` (đổi `package.json`); nếu không, dùng bảng kích thước route của `next build`.

### 4.1 Lazy-load dialog/sheet chỉ mở khi cần — rule `bundle-dynamic-imports`, `bundle-conditional`

Các import tĩnh hiện tại (đã kiểm):

| Component | Dòng | Import từ | Hành động |
|---|---|---|---|
| `JiraTemplateDialog` | 679 | `bulk/create/bulk-create-editor-shell.tsx:15` | `next/dynamic`, `ssr:false`, chỉ mount khi `open` |
| `CsvImportDialog` | 469 | `bulk/create/bulk-create-editor-shell.tsx:14` | như trên |
| `BranchDetailSheet` | 397 | `branches/branches-client.tsx:26` | như trên |
| `ErrorSheet` | 357 | `admin/admin-overview-client.tsx:39` | như trên (`CopyButton` giữ import tĩnh, vì `jobs-card` dùng) |

- Mẫu giống `board-client.tsx:48-59` (đã dùng `dynamic` đúng cách).
- **Lưu ý:** chỉ render component động khi `open === true` để chunk không tải sớm; thêm preload khi hover nút mở (rule `bundle-preload`) nếu thấy trễ khi mở lần đầu.
- **Kiểm tra:** so First Load JS của `/bulk/create`, `/branches`, `/admin` trước/sau; mở dialog lần đầu không lỗi/nháy; focus trap và đóng bằng Esc vẫn đúng (Radix).

### 4.2 Tách component lớn theo vùng state — rule `rerender-*`

Ưu tiên theo mức "state nóng": `board-client.tsx` (890 dòng), `admin-sync-client.tsx` (1034), `bulk-configure-step.tsx` (728).
- **Làm:** mỗi lần chỉ một file; tách phần có state riêng (toast, filter bar, panel) thành component con để state thay đổi không re-render cả cây. React Compiler đã bật nên **không thêm** `memo`/`useCallback` thủ công.
- **Điều kiện bắt đầu:** profiler (React DevTools) cho thấy re-render đáng kể khi gõ/di chuột; nếu không thấy, **bỏ qua** (tách chỉ vì file dài không phải mục tiêu).
- **Mỗi PR:** không đổi hành vi, chỉ di chuyển; typecheck/lint xanh; kiểm tay luồng chính của trang.

### 4.3 Hợp nhất listener `keydown` — rule `client-event-listeners`, `advanced-event-handler-refs`

- **Vị trí:** `app-shell.tsx:93`, `board-client.tsx:447`, `board/lib/board-keyboard-nav.ts:83`, `member-detail-report.tsx:60`.
- **Làm:** trong `board-client` và `board-keyboard-nav`, giữ handler mới nhất trong ref (hoặc `useEffectEvent` nếu React 19.2 đủ) để `addEventListener` chỉ chạy một lần, thay vì đăng ký lại mỗi lần `quickPanel`/`issues`/`focusKey` đổi. Không cần hợp nhất cả 4 vào một hook.
- **Kiểm tra:** phím điều hướng board, Esc đóng quick panel, Ctrl/Cmd+B vẫn đúng; không double-fire.

### 4.4 Gom invalidate SSE (tuỳ chọn, đo trước)

- **File:** [notification-events.tsx](../src/components/notification-events.tsx)
- Mỗi tin `changed` invalidate 4 nhóm query. Vì payload chỉ có userId nên **giữ nguyên phạm vi**, chỉ thêm debounce ~500ms (trailing) để gom nhiều tin liên tiếp, và chuyển `["branches"]`, `["branches-tasks"]` sang `branchesKeys.list/tasks` prefix trong `query-keys.ts` cho nhất quán.
- Chỉ làm nếu Phase 0 cho thấy bão refetch khi có nhiều thông báo liên tiếp.

## 5. Thứ tự và phụ thuộc

```
P0 baseline
 ├─ P1.1 cache(getSession) ─┐
 ├─ P1.2 giảm polling       ├─ độc lập, làm song song được
 ├─ P1.3 avatar             ┘
 ├─ P2.1 SessionProvider(session)      (độc lập, rủi ro TB)
 └─ P2.2 listWatchedItems ─► P2.3 prefetch /watch ─► (nếu tốt) P2.4 /stale mặc định
P3.1 sidebar cookie, P3.2 danh sách stale        (độc lập)
P4.x chỉ sau số liệu bundle/profiler
```

## 6. Bảng theo dõi

| # | Hạng mục | Rule | Ưu tiên | Công sức | Rủi ro | File chính | Test |
|---|---|---|---|---|---|---|---|
| 0 | Baseline | — | — | S | — | — | số liệu |
| 1.1 | `cache(getSession)` | server-cache-react | Cao | S | Thấp | lib/session.ts | npm test |
| 1.2 | Polling 5s/20s → 60s | client-swr-dedup | Cao | S | Thấp | notifications-client, use-notifications | tay |
| 1.3 | Avatar lazy + kích thước | rendering | Thấp | S | Thấp | jira-avatar.tsx | tay |
| 2.1 | Session từ server | async | Cao | M | TB | providers, (app)/layout | tay đa user |
| 2.2 | `listWatchedItems` song song | async-parallel | Trung | S | Thấp | api/watch, lib/watch | unit mới |
| 2.3 | Prefetch `/watch` | async/server | Cao | M | TB | watch/page, query-server | tay đa user |
| 2.4 | Prefetch `/stale` mặc định | async | Trung | M | TB | stale/page | tay |
| 3.1 | Sidebar cookie | hydration-no-flicker | Trung | S | Thấp | app-shell, layout | tay |
| 3.2 | Giới hạn danh sách stale | content-visibility | Trung | S–M | Thấp | stale-std-task-list | tay |
| 4.1 | Lazy dialog/sheet | bundle-dynamic-imports | Trung | M | Thấp | 4 file | size + tay |
| 4.2 | Tách component lớn | rerender | Thấp | L | TB | board, admin-sync, bulk | profiler |
| 4.3 | Keydown listener | client-event-listeners | Thấp | S | Thấp | board | tay |
| 4.4 | Debounce SSE invalidate | client | Thấp | S | Thấp | notification-events | đo |

## 7. Câu hỏi cần bạn quyết định

1. **P2.1:** chọn bọc session ở `(app)/layout` (ưu tiên, không ảnh hưởng `/login`) hay ở root layout (đơn giản hơn nhưng `/login` thành dynamic)?
2. **P3.1:** chấp nhận người dùng cũ mất trạng thái sidebar đã lưu một lần, hay thêm bước di trú từ `localStorage`?
3. **P3.2:** nút "Chọn tất cả" áp dụng cho toàn bộ kết quả lọc (như hiện tại) hay chỉ phần đang hiển thị?
4. **P4:** có duyệt cài `@next/bundle-analyzer` (chạm `package.json`) không, hay chỉ dùng số liệu `next build`?
5. **P1.2:** SSE ở production có ổn định (không bị proxy cắt) không? Nếu hay rớt, giữ badge ở 20s.
