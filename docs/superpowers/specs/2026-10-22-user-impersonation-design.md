# Thiết kế kỹ thuật: Chuyển đổi tài khoản người dùng cho Admin (User Impersonation)

- **Ngày tạo:** 2026-10-22
- **Tác giả:** Antigravity & Team Lead
- **Trạng thái:** Chờ phê duyệt (Pending Review)

---

## 1. Bối cảnh & Mục đích (Intent & Why)

Trong hệ thống nội bộ, nhiều dữ liệu, bộ lọc công việc, và màn hình nghiệp vụ (bảng công việc cá nhân, thông báo, phân quyền theo dự án) phụ thuộc vào tài khoản thành viên cụ thể. 

Khi thành viên báo lỗi hoặc yêu cầu tính năng, Quản trị viên (Admin/Dev) gặp khó khăn trong việc tái hiện chính xác giao diện và trạng thái mà người dùng đó đang gặp phải nếu không có quyền xem dưới góc nhìn của họ.

Vì đây là ứng dụng nội bộ và các thông tin công việc đều có thể xem được trên Jira chung của công ty, mục tiêu là cung cấp cho Admin công cụ **Chuyển đổi danh tính / Đóng vai người dùng (User Impersonation)** nhanh chóng, trực tiếp trên thanh điều hướng, giúp tái hiện bug và kiểm tra dữ liệu thành viên một cách tức thì.

---

## 2. Mục tiêu (Goals, Non-Goals, Anti-Goals)

### 2.1. Mục tiêu (Goals)
1. **Chuyển đổi tài khoản tức thì (1-click Impersonate):**
   - Admin có thể tìm kiếm và chọn bất kỳ người dùng nào từ danh sách thành viên trên thanh Header hoặc trang Quản trị.
   - Chuyển đổi mà không cần biết hoặc can thiệp vào mật khẩu/token gốc của thành viên.
2. **Ngữ cảnh hiển thị & quyền hạn chân thực 100%:**
   - Khi chuyển sang người dùng X, toàn bộ màn hình, bảng công việc (`/board`), việc của tôi (`/my-work`), thông báo, quyền dự án hiển thị chính xác theo góc nhìn của người dùng X.
   - Thao tác tương tác với Jira (tạo task, đổi trạng thái) được thực thi bằng thông tin xác thực Jira cá nhân của người dùng X (đúng vai trò thành viên đang biến thành).
3. **Thanh cảnh báo trên cùng (Persistent Impersonation Banner):**
   - Luôn hiển thị thanh banner màu vàng cam dính cố định trên cùng màn hình khi đang ở chế độ impersonate:
     `⚠️ Bạn đang xem hệ thống với tư cách: [Tên hiển thị] ([username])`
   - Nút bấm nổi bật `[↩ Quay lại tài khoản Admin]` giúp thoát chế độ đóng vai và trở về phiên Admin ban đầu ngay lập tức.
4. **An toàn & Quản lý phiên (Security & Session Lifecycle):**
   - Chỉ tài khoản có vai trò `admin` thực tế trong token gốc mới có quyền kích hoạt impersonation.
   - Phiên đăng nhập thật của Admin không bị hủy bỏ; hệ thống sử dụng cookie chuyển đổi tạm thời (`botjira_impersonate`).
   - Ghi nhận nhật ký kiểm toán (`UserActivity`) khi bắt đầu và kết thúc việc đóng vai.

### 2.2. Ngoài phạm vi (Non-Goals)
- Không cho phép người dùng thường (member/lead/release_manager) sử dụng tính năng này.
- Không hỗ trợ "lồng ghép nhiều tầng đóng vai" (nested impersonation): khi đang đóng vai user A, không thể đóng vai tiếp sang user B; phải quay về Admin hoặc switch trực tiếp sang B.

### 2.3. Chống mục tiêu (Anti-Goals)
- Không làm lộ token/secret Jira của người dùng được đóng vai ra giao diện client.
- Không để xảy ra tình trạng "kẹt" ở tài khoản người dùng thường mà không thể quay về Admin (cơ chế fallback an toàn luôn sẵn sàng).

---

## 3. Ràng buộc kỹ thuật & Quy chuẩn UI/UX (Constraints)

- **Framework & Libraries:**
  - Next.js 15+ (App Router), React 19, NextAuth.js.
  - Tailwind CSS v4, Lucide icons, shadcn/ui (Radix UI).
  - Phông chữ: Plus Jakarta Sans, Theme tokens trong `src/app/globals.css`.
- **Thiết kế theo Phương án 1 (Header Switcher + Top Banner):**
  - Tuân thủ quy chuẩn `design-system/team-task-web/MASTER.md` và `AGENTS.md`.
  - Banner dùng tông màu cảnh báo (`bg-amber-500 text-amber-950 dark:bg-amber-600 dark:text-amber-50`), chiều cao cố định, độ tương phản text ≥ 4.5:1.
  - Hỗ trợ đầy đủ phím tắt và thao tác mượt mà trong cả Light và Dark mode.

---

## 4. Kiến trúc & Chi tiết triển khai (Architecture & Implementation)

### 4.1. Cơ chế Quản lý Phiên (Session Management)

Hệ thống NextAuth sử dụng JWT strategy. Để chuyển đổi mượt mà mà không làm hỏng JWT của Admin:

1. **Cookie điều khiển (`botjira_impersonate`):**
   - Khi Admin kích hoạt impersonate User X: API gán cookie `botjira_impersonate=<userId>` (`HttpOnly`, `SameSite=Lax`, `Path=/`).
   - Khi Admin bấm "Quay lại Admin": API xóa cookie này.

2. **Tầng phân giải phiên (`src/lib/session.ts`):**
   ```typescript
   export type EffectiveSession = {
     user: {
       id: string;
       name?: string | null;
       email?: string | null;
       role: string;
       jiraUsername?: string | null;
     };
     impersonator?: {
       id: string;
       name?: string | null;
       email?: string | null;
       role: string;
     };
   };
   ```
   - Trong `getSession()`:
     - Lấy phiên thực tế từ `getServerSession(authOptions)`.
     - Nếu người dùng thực tế có `role === "admin"`, kiểm tra cookie `botjira_impersonate`.
     - Nếu có giá trị `<targetUserId>`, truy vấn DB lấy thông tin `targetUser`.
     - Trả về `session` với `session.user` là thông tin của `targetUser`, kèm `session.impersonator` chứa thông tin của Admin thực tế.
     - Hàm `isImpersonating(session)` trả về `true` khi `session.impersonator` tồn tại.
     - Hàm `isAdmin(session)` kiểm tra `session.user.role === "admin" || session.impersonator?.role === "admin"`.

3. **Tương tác Jira (`src/lib/user-gate.ts` & `src/lib/jira/auth-service.ts`):**
   - Vì `getCurrentUserGate(session.user.id)` lấy thông tin theo `session.user.id`, khi đang đóng vai user X, hệ thống tự động giải mã `jiraTokenEnc` của user X để gọi Jira API.
   - Nhờ đó, các hành động sửa, tạo task, chuyển trạng thái trên Jira hoàn toàn mang danh nghĩa của user X như người dùng yêu cầu.

### 4.2. API Endpoints

1. **`POST /api/admin/impersonate`:**
   - **Xác thực:** Kiểm tra người gọi thực tế trong token phải có `role === "admin"`.
   - **Payload:** `{ targetUserId: string }`
   - **Xử lý:**
     - Kiểm tra `targetUser` có tồn tại trong database không.
     - Thiết lập cookie `botjira_impersonate = targetUserId`.
     - Ghi nhận nhật ký: `UserActivity` với `eventType: "auth"`, `action: "auth.impersonate.start"`.
   - **Response:** `{ ok: true, user: { id, displayName, email } }`

2. **`POST /api/admin/impersonate/stop` (hoặc `DELETE /api/admin/impersonate`):**
   - **Xác thực:** Cho phép nếu token thực tế là admin hoặc `botjira_impersonate` cookie đang tồn tại.
   - **Xử lý:**
     - Xóa cookie `botjira_impersonate`.
     - Ghi nhận nhật ký `UserActivity` với `eventType: "auth"`, `action: "auth.impersonate.stop"`.
   - **Response:** `{ ok: true }`

3. **`GET /api/admin/impersonate/users`:**
   - **Xác thực:** Chỉ Admin (thực tế).
   - **Mục đích:** Danh sách nhanh người dùng (id, displayName, email, jiraUsername, role) phục vụ autocomplete/search trên Header switcher.

### 4.3. Thành phần Giao diện (UI Components)

1. **`ImpersonationBanner` (`src/components/impersonation/impersonation-banner.tsx`):**
   - Đặt cố định ở đỉnh màn hình (`sticky top-0 z-50`).
   - Hiển thị khi `session.impersonator` tồn tại.
   - Nội dung:
     - Biểu tượng cảnh báo `AlertTriangle` hoặc `UserCheck`.
     - Dòng chữ: `Đang xem với tư cách: <Tên thành viên> (<jiraUsername || email>)`.
     - Nút `[↩ Quay lại tài khoản Admin]`: Khi bấm, gọi API stop impersonate và tải lại trang.

2. **`UserSwitcherDialog` (`src/components/impersonation/user-switcher-dialog.tsx`):**
   - Hiển thị trên Header (cạnh Theme Toggle / Avatar) khi người dùng là Admin (hoặc Admin đang đóng vai).
   - Giao diện popover/dialog:
     - Ô tìm kiếm nhanh với autofocus.
     - Danh sách kết quả hiển thị avatar, tên đầy đủ, Jira username và vai trò.
     - Nút "Chuyển sang tài khoản này".

3. **Tích hợp vào `AppShell` (`src/app/(app)/app-shell.tsx`):**
   - Chèn `ImpersonationBanner` ngay trên Header khi đang ở chế độ impersonate.
   - Chèn nút `UserSwitcherDialog` trên thanh Header của AppShell.

---

## 5. Kế hoạch Kiểm thử & Xác thực (Testing & Verification)

1. **Kiểm thử phân quyền & an toàn (Security Tests):**
   - Thành viên thường (`role: "member"`) không thể gọi `POST /api/admin/impersonate` (phải trả về `403 Forbidden`).
   - Tự tạo cookie giả `botjira_impersonate` khi đang đăng nhập tài khoản thường không có tác dụng (backend bỏ qua vì token thực tế không phải Admin).
2. **Kiểm thử hiển thị giao diện:**
   - Switch sang User A: Bảng công việc (`/board`), trang việc của tôi (`/my-work`) phải đổi sang dữ liệu của User A.
   - Banner màu cam hiển thị rõ ràng trên cùng trang, không bị lỗi che khuất nội dung.
3. **Kiểm thử thoát đóng vai:**
   - Bấm "Quay lại tài khoản Admin": Cookie bị xóa, trang tải lại trở về đúng danh tính Admin ban đầu.
4. **Kiểm thử gọi Jira:**
   - Thử nghiệm thao tác tạo/sửa issue: verify request gửi sang Jira sử dụng đúng credential của User A.

---

## 6. Quyết định kỹ thuật & Phần giao cho người triển khai (Decisions & Builder Calls)

- **Thời hạn cookie:** Cookie `botjira_impersonate` có thời hạn phiên làm việc (Session cookie) hoặc tối đa 4 giờ, tự động hủy nếu không thao tác để tránh Admin quên đang ở chế độ đóng vai.
- **Xử lý tài khoản chưa liên kết Jira:** Nếu Admin switch sang một user chưa hoàn tất setup Jira token, hệ thống vẫn cho phép xem các dữ liệu nội bộ đã lưu trong DB, đồng thời hiển thị thông báo nhẹ trên banner: *"Người dùng này chưa liên kết Jira API token"*.
