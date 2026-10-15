# Tiến độ cải thiện hiệu năng (Vercel React Best Practices)

## 1. Project Overview
- **Mục tiêu:** Tối ưu hoá toàn diện codebase Next.js / React theo hướng dẫn Vercel React Best Practices, giải quyết các điểm nghẽn hiệu năng thực tế (waterfall, polling thừa, redundant server computation, hydration flicker, lazy loading), bảo toàn 100% chức năng và kiến trúc hiện hữu.
- **Framework & Thư viện chính:**
  - Next.js 16.4.0 (App Router, Turbopack)
  - React 19.2.8 (React Compiler bật)
  - TanStack React Query 5.104.2
  - Tailwind CSS v4 + Radix UI + Lucide React
- **Tài liệu tham chiếu:**
  - `docs/react-best-practices-plan.md`
  - `docs/react-best-practices-detailed-plan.md`
  - Skill: `vercel-react-best-practices`
- **Trạng thái thực thi:** Hoàn thành toàn diện (All Completed)

---

## 2. Task Checklist

| Task ID | Rule | Mô tả | Mức ưu tiên | Rủi ro | File liên quan | Trạng thái | Kết quả kiểm tra |
|---|---|---|---|---|---|---|---|
| **TASK-00** | — | Thiết lập baseline, chạy typecheck, lint, test, build | P0 | Thấp | Toàn bộ | **Completed** | 273 test files (2553 tests) pass, lint 0 warning, build 74 routes OK |
| **TASK-01** | `server-cache-react` | Bọc `getSession` bằng `React.cache()` để dedupe trong mỗi request RSC | P1 | Thấp | `src/lib/session.ts` | **Completed** | Typecheck pass, unit tests auth & routes pass |
| **TASK-02** | `client-swr-dedup` | Giảm tần suất polling notifications (5s/20s -> 60s) vì đã có SSE | P1 | Thấp | `notifications-client.tsx`, `use-notifications.ts` | **Completed** | Giảm ~10 lần số request lặp không cần thiết |
| **TASK-03** | `rendering-*` | Thêm lazy loading, async decoding, width/height cho JiraAvatar chống CLS | P3 | Thấp | `src/components/jira-avatar.tsx` | **Completed** | Avatar có kích thước rõ ràng, tải lười ngoài viewport |
| **TASK-04** | `js-tosorted-immutable` | Thay thế `.sort()` mutate bằng `toSorted()` trong `bulk/versions` | P3 | Thấp | `src/app/api/bulk/versions/route.ts` | **Completed** | `route.test.ts` pass, không mutate state |
| **TASK-05** | `async-parallel` | Tách và song song hoá truy vấn `GET /api/watch` thành `listWatchedItems` | P1 | Thấp | `src/lib/watch/list.ts`, `src/app/api/watch/route.ts` | **Completed** | `src/lib/watch/list.test.ts` (2 tests) pass |
| **TASK-06** | `async-suspense-boundaries`, `server-*` | Prefetch dữ liệu server-side cho trang `/watch` bằng `HydrationBoundary` | P1 | Trung bình | `src/lib/query-server.ts`, `src/app/(app)/watch/page.tsx` | **Completed** | Server query client an toàn theo request, loại bỏ waterfall client |
| **TASK-07** | `rendering-hydration-no-flicker` | Chuyển lưu trạng thái sidebar sang cookie đọc từ server layout | P2 | Thấp | `src/app/(app)/app-shell.tsx`, `src/app/(app)/layout.tsx` | **Completed** | Không nháy giao diện sau hydrate, Next 16 async cookies() |
| **TASK-08** | `rendering-content-visibility` | Giới hạn render (visibleCount / pagination) cho `stale-std-task-list.tsx` | P2 | Thấp | `src/app/(app)/stale/stale-std-task-list.tsx` | **Completed** | Giảm tải DOM, tăng tốc render danh sách dài |
| **TASK-09** | `bundle-dynamic-imports` | Lazy load các Dialog/Sheet nặng chỉ mount khi mở | P2 | Thấp | `bulk-create-editor-shell.tsx`, `branches-client.tsx`, `admin-overview-client.tsx` | **Completed** | Tách chunk riêng cho các dialog nặng |
| **TASK-10** | `client-event-listeners`, `advanced-event-handler-refs` | Ổn định keydown handler bằng ref để tránh re-register event listener mỗi render | P3 | Thấp | `src/app/(app)/board/board-client.tsx`, `src/app/(app)/board/lib/board-keyboard-nav.ts` | **Completed** | Listener bàn phím gắn 1 lần, không thrashing |
| **TASK-11** | `async-*`, `client-*` | Truyền session server vào `SessionHydrator` & debounce SSE notifications | P1 | Trung bình | `session-hydrator.tsx`, `providers.tsx`, `notification-events.tsx` | **Completed** | Loại bỏ request `/api/auth/session` đầu trang, debounce SSE 300ms |

---

## 3. Completed Improvements Chi tiết

1. **`React.cache(getSession)` (`server-cache-react`):**
   - File: `src/lib/session.ts`
   - Bọc `getServerSession` trong `cache()`. Trong một render pass của RSC (layout, page, server actions), session chỉ được truy vấn 1 lần duy nhất thay vì lặp lại ở mọi component con.

2. **Tối ưu Polling thông báo (`client-swr-dedup`):**
   - Files: `src/app/(app)/notifications/notifications-client.tsx`, `src/hooks/use-notifications.ts`
   - Tăng khoảng thời gian fallback poll từ 5s và 20s lên 60s. Vì ứng dụng đã có kênh Server-Sent Events (`/api/notify/stream`) đẩy thông báo ngay lập tức, việc poll dày đặc gây lãng phí CPU và băng thông máy chủ.

3. **Chống CLS và Tải lười Avatar (`rendering-*`):**
   - File: `src/components/jira-avatar.tsx`
   - Bổ sung `DIMENSION_MAP` ánh xạ size (xs: 16px, sm: 20px, md: 24px, lg: 32px, xl: 48px), thêm thuộc tính `width`, `height`, `loading="lazy"`, `decoding="async"`. Tránh hiện tượng Cumulative Layout Shift khi duyệt bảng kanban và danh sách dài.

4. **Sắp xếp bất biến (`js-tosorted-immutable`):**
   - File: `src/app/api/bulk/versions/route.ts`
   - Thay `.sort()` bằng `.toSorted()` cho các mảng `projects`, `releasedProjects`, `archivedProjects` và danh sách trả về để tránh đột biến mảng gốc.

5. **Song song hoá truy vấn Watch (`async-parallel`):**
   - Files: `src/lib/watch/list.ts`, `src/app/api/watch/route.ts`, `src/lib/watch/list.test.ts`
   - Tách logic thành `listWatchedItems(userId, role)`. Chạy song song `prisma.watch.findMany` và `getUserScopedProjects(userId, role)` bằng `Promise.all()`. Viết unit test hoàn chỉnh cho các trường hợp rỗng, lọc scope và định dạng ISO date.

6. **Prefetch Server-side cho `/watch` (`async-suspense-boundaries`, `server-*`):**
   - Files: `src/lib/query-server.ts`, `src/app/(app)/watch/page.tsx`
   - Tạo `getServerQueryClient()` bọc `React.cache()` bảo đảm mỗi request RSC có 1 client Query riêng biệt (ngăn rò rỉ dữ liệu giữa các user). Trang `/watch` prefetch dữ liệu ngay trên server qua `HydrationBoundary`, người dùng nhận HTML có sẵn dữ liệu, không còn thấy skeleton nhấp nháy.

7. **Tránh Hydration Flicker ở Sidebar (`rendering-hydration-no-flicker`):**
   - Files: `src/app/(app)/app-shell.tsx`, `src/app/(app)/layout.tsx`
   - Đọc cookie `sidebar_collapsed` ở `(app)/layout.tsx` bằng `await cookies()` (chuẩn Next.js 16) và truyền `defaultCollapsed` xuống `AppShell`. Khi mở/đóng menu, ghi đồng thời cookie và localStorage. Loại bỏ triệt để hiện tượng giật co/giãn sidebar sau hydrate.

8. **Tối ưu Danh sách chuẩn hoá (`rendering-content-visibility`):**
   - File: `src/app/(app)/stale/stale-std-task-list.tsx`
   - Thêm phân trang `visibleCount = 50` với nút "Xem thêm 50 task" tương tự bảng chính. Bổ sung CSS `[content-visibility:auto] [contain-intrinsic-size:auto_96px]` cho mobile cards. Tránh render đồng loạt hàng trăm DOM node trên cả mobile và desktop.

9. **Dynamic Imports cho Dialog/Sheet nặng (`bundle-dynamic-imports`):**
   - Files: `src/app/(app)/bulk/create/bulk-create-editor-shell.tsx`, `src/app/(app)/branches/branches-client.tsx`, `src/app/(app)/admin/admin-overview-client.tsx`
   - Sử dụng `next/dynamic` với `ssr: false` cho: `CsvImportDialog`, `JiraTemplateDialog`, `BranchDetailSheet`, `ErrorSheet`. Tách mã nguồn hàng nghìn dòng ra khỏi bundle ban đầu, chỉ tải khi người dùng kích hoạt mở.

10. **Ổn định Event Listener bàn phím (`client-event-listeners`, `advanced-event-handler-refs`):**
    - Files: `src/app/(app)/board/board-client.tsx`, `src/app/(app)/board/lib/board-keyboard-nav.ts`
    - Dùng `useRef` lưu giữ handlers và state mới nhất (`quickPanelRef`, `latestRef`), giúp event listener `window.addEventListener("keydown")` chỉ đăng ký một lần duy nhất, loại bỏ việc liên tục remove/add listener sau mỗi lần di chuyển phím hoặc mở panel.

11. **Hydrate Session từ Server & Debounce SSE Notifications (`async-*`, `client-*`):**
    - Files: `src/app/(app)/session-hydrator.tsx`, `src/app/providers.tsx`, `src/components/notification-events.tsx`, `src/lib/query-keys.ts`
    - Bọc `AppShell` trong `SessionHydrator` với `session` có sẵn từ server layout. Client không cần thực hiện thêm request `/api/auth/session` sau khi tải trang.
    - `NotificationEvents` kết nối SSE ngay tức thì, đồng thời gom (debounce) 300ms các đợt phát tín hiệu liên tiếp và dùng `branchesKeys.all` tập trung. Giữ các trang ngoài `(app)` (`/login`, `/register`) tĩnh hoàn toàn (`○`).

---

## 4. Kết quả Kiểm tra & Xác nhận

- **TypeScript (`npm run typecheck`):**
  - Kết quả: PASS (0 lỗi).
- **ESLint (`npm run lint`):**
  - Kết quả: PASS (0 lỗi, 0 cảnh báo với `--max-warnings=0`).
- **Unit & Integration Tests (`npm test`):**
  - Kết quả: 274 test files, 2555 tests PASS 100%.
  - Thêm mới 1 test file: `src/lib/watch/list.test.ts`.
- **Production Build (`npm run build`):**
  - Kết quả: Hoàn thành thành công, 74 routes biên dịch và tối ưu chuẩn Next.js 16 App Router.

---

## 5. Session Handoff
- **Trạng thái:** Toàn bộ 11 hạng mục tối ưu hoá chính đã hoàn tất và vượt qua mọi tiêu chuẩn kiểm thử.
- **Sẵn sàng:** Codebase sạch, working tree không còn lỗi lint/type/test nào.
