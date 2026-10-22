# Kế hoạch thực hiện: Chuyển đổi tài khoản người dùng cho Admin (User Impersonation)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cho phép tài khoản Admin có thể chuyển sang đóng vai bất kỳ thành viên nào (User Impersonation) để xem giao diện, dữ liệu và kiểm tra bug dưới góc nhìn của họ; hiển thị banner cảnh báo dính trên cùng với nút 1-click quay lại tài khoản Admin.

**Spec:** [docs/superpowers/specs/2026-10-22-user-impersonation-design.md](file:///data/Workspace/bot%20jira/docs/superpowers/specs/2026-10-22-user-impersonation-design.md)

**Tech Stack:** Next.js 15+ App Router, React 19, NextAuth.js (JWT), Prisma ORM, PostgreSQL, Tailwind CSS v4, shadcn/ui (Radix UI), TanStack Query, Lucide icons, Vitest.

---

## Danh sách công việc (Tasks)

### Task 1: Cơ chế Quản lý Phiên Impersonation trong `src/lib/session.ts`
- [x] Mở rộng kiểu dữ liệu Session:
  - Thêm trường `impersonator?: { id: string; name?: string | null; email?: string | null; role: string }` vào kiểu `AppSession` và `next-auth.d.ts`.
- [x] Cập nhật hàm `getSession()`:
  - Lấy session thực tế từ `getServerSession(authOptions)`.
  - Nếu session thực tế là admin (`role === "admin"`), đọc cookie `botjira_impersonate` từ `cookies()`.
  - Nếu có `targetUserId`, truy vấn thông tin `targetUser` từ database.
  - Nếu `targetUser` tồn tại, gán `session.user` thành thông tin của `targetUser` và `session.impersonator` là admin thực tế.
- [x] Thêm các helper functions:
  - `isImpersonating(session: AppSession): boolean`
  - Cập nhật `isAdmin(session: AppSession): boolean` và `isRealAdmin(session: AppSession): boolean`.
- [x] Viết unit test cho `src/lib/session.test.ts`.

### Task 2: Xây dựng các API Endpoints Quản lý Impersonation
- [x] Tạo API Route `src/app/api/admin/impersonate/route.ts`:
  - `POST`: Nhận `{ targetUserId }`. Kiểm tra session thực tế phải là `admin`. Thiết lập cookie `botjira_impersonate` (`httpOnly: true, path: "/", sameSite: "lax", maxAge: 14400`). Ghi log activity `auth.impersonate.start`.
  - `DELETE`: Xóa cookie `botjira_impersonate`. Ghi log activity `auth.impersonate.stop`.
- [x] Tạo API Route `src/app/api/admin/impersonate/stop/route.ts`:
  - `POST`: Hỗ trợ phương thức POST để client dễ dàng gọi dừng impersonate. Xóa cookie và trả về `{ ok: true }`.
- [x] Tạo API Route `src/app/api/admin/impersonate/users/route.ts`:
  - `GET`: Kiểm tra quyền admin (thực tế). Trả về danh sách thành viên (`id, displayName, email, jiraUsername, role, hasJiraLinked`) để nạp vào danh sách tìm kiếm của switcher dialog.
- [x] Viết unit test cho các API routes:
  - `src/app/api/admin/impersonate/route.test.ts`
  - `src/app/api/admin/impersonate/users/route.test.ts`

### Task 3: Xây dựng Client Components: `ImpersonationBanner` & `UserSwitcherDialog`
- [x] Tạo `src/components/impersonation/impersonation-banner.tsx`:
  - Component dính cố định đỉnh màn hình (`sticky top-0 z-50`).
  - Sử dụng semantic tokens chuẩn design system (`bg-warning/15 border-warning/30 text-warning`).
  - Hiển thị: `⚠️ Bạn đang xem hệ thống với tư cách [User.displayName] ([User.jiraUsername || User.email])`.
  - Nút bấm `[↩ Quay lại tài khoản Admin]`: gọi `POST /api/admin/impersonate/stop` và reload trang.
  - Nút bấm `[Đổi người khác]` mở dialog chọn user tức thì.
- [x] Tạo `src/components/impersonation/user-switcher-dialog.tsx`:
  - Nút icon `[👥 Đổi tài khoản]` trên Header với badge/tooltip.
  - Dialog tìm kiếm người dùng (search debounce theo tên, username, email).
  - Hiển thị danh sách kết quả, click chọn thành viên sẽ gọi `POST /api/admin/impersonate` và reload trang.
- [x] Viết unit test cho component `src/components/impersonation/impersonation-banner.test.ts`.

### Task 4: Tích hợp vào Layout Chung & Header (`AppShell`)
- [x] Cập nhật `src/app/(app)/layout.tsx`:
  - Đọc `session.impersonator` và truyền xuống `AppShell`.
  - Bỏ qua chặn redirect `setup-jira` nếu Admin đang đóng vai user chưa setup Jira.
- [x] Cập nhật `src/app/(app)/app-shell.tsx`:
  - Nếu đang ở chế độ impersonate (`session.impersonator` tồn tại), render `<ImpersonationBanner />` ở trên cùng trang.
  - Trên thanh điều hướng máy tính và di động, render nút kích hoạt `<UserSwitcherDialog />` cho Admin.
- [x] Kiểm tra responsive trên mobile/desktop để thanh banner và dialog hiển thị đẹp mắt, không làm lệch bố cục.

### Task 5: Kiểm thử Toàn diện, Build & Xác nhận Nghiệp vụ
- [x] Chạy `npm run typecheck` xác nhận không có lỗi TypeScript (passed).
- [x] Chạy `npm run test` và `design-guard.test.ts` xác nhận 100% tests mới và cũ đều pass, tuân thủ design system.
- [x] Kiểm thử tích hợp luồng nghiệp vụ:
  - Chuyển sang thành viên khác qua dialog -> cookie `botjira_impersonate` được set -> trang tải lại đúng góc nhìn thành viên đó.
  - Hiển thị banner cảnh báo dính trên đầu trang.
  - Bấm "Quay lại Admin" -> cookie bị xóa -> trang tải lại về tài khoản Admin ban đầu.
