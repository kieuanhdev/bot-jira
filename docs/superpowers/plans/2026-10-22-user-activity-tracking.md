# Kế hoạch thực hiện: Theo dõi Người dùng & Lượt truy cập Web trong Admin (Implementation Plan)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Xây dựng tính năng theo dõi chi tiết người dùng và lượt truy cập web (User Activity Tracking) hiển thị tại màn hình Quản trị (`/admin/activity`), cho phép admin biết chính xác ai đang online, ai vừa vào trang nào và thực hiện thao tác gì.

**Spec:** [docs/superpowers/specs/2026-10-22-user-activity-tracking-design.md](file:///data/Workspace/bot%20jira/docs/superpowers/specs/2026-10-22-user-activity-tracking-design.md)

**Architecture:**
- **Model `UserActivity` (Prisma):** Lưu lịch sử sự kiện gồm `userId`, `userName`, `userEmail`, `eventType` (`page_view` | `action` | `auth`), `action`, `description`, `path`, `userAgent`, `ipAddress`, `createdAt`.
- **Client Tracker Hook / Component (`<UserActivityTracker />`):** Mount trong `src/app/(app)/layout.tsx`, bắt thay đổi đường dẫn `pathname` và `searchParams`, throttle 10 giây tránh ghi nhận trùng, gọi API `POST /api/activity/track` ngầm (fire-and-forget).
- **Admin Query API (`GET /api/admin/activity`):** Kiểm tra quyền Admin, hỗ trợ bộ lọc (`userId`, `eventType`, `range`, `q`, `page`, `limit`), tính toán metrics tức thì (online 15m, user/ngày, page views, actions).
- **Admin UI (`/admin/activity`):**
  - Thêm tab "Truy cập & Hoạt động" vào `AdminNav`.
  - Hàng 4 thẻ Metric Cards trực quan.
  - Bộ lọc chọn thành viên, loại sự kiện, khoảng thời gian và tìm kiếm.
  - Bảng dữ liệu chi tiết có phân trang, định dạng thời gian relative + absolute, badge phân loại theo semantic màu, thiết bị/trình duyệt.

**Tech Stack:** Next.js 15+ App Router, React 19, Prisma ORM, PostgreSQL, TanStack Query v5, Tailwind CSS v4, shadcn/ui, lucide-react, Vitest.

---

## Danh sách công việc (Tasks)

### Task 1: Bổ sung Database Model `UserActivity` & Service Helper
- [x] Bổ sung model `UserActivity` vào `prisma/schema.prisma` với đầy đủ indexes tối ưu.
- [x] Chạy `npx prisma db push` hoặc tạo migration cập nhật schema.
- [x] Tạo module `src/lib/activity/service.ts`:
  - Hàm `recordActivity(input)`: lưu sự kiện an toàn, fail-safe (bắt try-catch không làm hỏng app).
  - Hàm `parseUserAgent(ua)`: tách trình duyệt và hệ điều hành gọn nhẹ.
  - Hàm `getActivityMetrics(range)`: thống kê số lượng online (15m qua), người dùng hôm nay, page views, actions.
  - Hàm `listUserActivities(filters)`: truy vấn danh sách có phân trang và lọc theo user/loại/ngày.
- [x] Viết unit test cho `src/lib/activity/service.test.ts`.

### Task 2: API Ghi nhận Hoạt động (`POST /api/activity/track`) & Client Tracker Component
- [x] Tạo API Route `src/app/api/activity/track/route.ts`:
  - Đọc session người dùng hiện tại (nếu có).
  - Đọc User-Agent và IP từ request headers.
  - Gọi `recordActivity()` lưu sự kiện `page_view` hoặc `action`.
  - Trả về status 200 `{ ok: true }` ngay lập tức.
- [x] Tạo Client Component `src/components/activity-tracker.tsx`:
  - Lắng nghe `usePathname()` và `useSearchParams()`.
  - Lưu ref URL gần nhất và timestamp để debounce/throttle 10 giây.
  - Gửi request ngầm bằng `fetch` với `keepalive: true` hoặc `navigator.sendBeacon`.
- [x] Nhúng `<UserActivityTracker />` vào layout chung `src/app/(app)/layout.tsx`.
- [x] Gắn ghi nhận sự kiện đăng nhập `auth` thành công vào `src/lib/auth.ts`.
- [x] Viết test cho `src/app/api/activity/track/route.test.ts`.

### Task 3: API Quản trị Truy vấn Hoạt động (`GET /api/admin/activity`) & Query Keys
- [x] Tạo API Route `src/app/api/admin/activity/route.ts`:
  - Kiểm tra quyền `isAdmin(session)` - trả về 403 nếu không có quyền.
  - Xử lý các query params: `userId`, `eventType`, `range`, `q`, `page`, `limit`.
  - Gọi `listUserActivities()` và `getActivityMetrics()`.
  - Trả về danh sách user có trong hệ thống để đổ vào dropdown filter.
- [x] Thêm query key `activity` vào `src/lib/query-keys.ts` (`adminKeys.activity(...)`).
- [x] Viết test cho `src/app/api/admin/activity/route.test.ts`.

### Task 4: Giao diện Quản trị (`/admin/activity`)
- [x] Thêm tab mới "Truy cập & Hoạt động" vào `src/app/(app)/admin/admin-nav.tsx` (icon `Users` hoặc `ActivitySquare`).
- [x] Tạo `src/app/(app)/admin/activity/page.tsx`:
  - Prefetch dữ liệu với TanStack Query trên server.
  - Thiết lập Metadata: `Quản trị · Truy cập & Hoạt động`.
- [x] Tạo `src/app/(app)/admin/activity/admin-activity-client.tsx`:
  - PageHeader với nút "Làm mới", Live badge.
  - 4 Metric Cards (Online, DAU, Page views, Actions) hỗ trợ Skeleton khi đang tải.
  - Toolbar lọc: Select thành viên, Select loại sự kiện, Select khoảng thời gian, Input tìm kiếm.
  - Bảng dữ liệu: Cột Thời gian, Người dùng, Loại (Badge semantic), Chi tiết hoạt động, Đường dẫn (URL), Thiết bị (OS/Browser).
  - EmptyState khi không có bản ghi phù hợp.
  - Điều hướng phân trang (Pagination controls).
  - Tự động refetch mỗi 30 giây khi tab đang active.

### Task 5: Kiểm thử Toàn diện & Xác nhận Hoạt động
- [x] Chạy `npm run typecheck` xác nhận không có lỗi TypeScript.
- [x] Chạy `npm run test` xác nhận các unit test mới và cũ đều pass 100%.
- [x] Kiểm tra thực tế bằng trình duyệt/curl:
  - Điều hướng qua các trang web và xác nhận bản ghi xuất hiện trong `/admin/activity`.
  - Kiểm tra bộ lọc theo người dùng và loại sự kiện.
