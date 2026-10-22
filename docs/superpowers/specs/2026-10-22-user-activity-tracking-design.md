# Thiết kế kỹ thuật: Giám sát Người dùng & Lượt truy cập Web (User Activity Tracking)

- **Ngày tạo:** 2026-10-22
- **Tác giả:** Antigravity & Team Lead
- **Trạng thái:** Đã triển khai hoàn thành (Completed)

---

## 1. Bối cảnh & Mục đích (Intent & Why)

Quản trị viên (Admin) cần một công cụ trực quan và đáng tin cậy trên màn hình Quản trị để theo dõi chi tiết tình trạng ra/vào và sử dụng web thực tế của các thành viên.

Hiện tại, hệ thống đã có:
- Nhật ký đột biến (`AuditLog`) phục vụ kiểm toán bảo mật cho các hành động thay đổi nhạy cảm (role, release, sync).
- Giám sát worker, queue, webhook (`AdminOverview`).

Tuy nhiên, hệ thống **chưa có cơ chế ghi nhận lượt truy cập thông thường** (ai đang online, ai mở những trang nào, tần suất tương tác thế nào trong ngày). Điều này khiến admin khó xác nhận liệu web có người dùng thực tế đang sử dụng hay chỉ có các job nền hoạt động.

Tính năng này bổ sung cơ chế theo dõi phiên người dùng (User Activity Tracking) và màn hình hiển thị trực quan tại tab quản trị **"Truy cập & Hoạt động"** (`/admin/activity`).

---

## 2. Mục tiêu (Goals, Non-Goals, Anti-Goals)

### 2.1. Mục tiêu (Goals)
1. **Ghi nhận sự kiện thời gian thực (Activity Tracking):**
   - **Lượt xem trang (Page View):** Người dùng chuyển trang hoặc mở một URL bất kỳ (kèm đường dẫn, query params không chứa token).
   - **Thao tác nghiệp vụ (Action):** Các hành động quan trọng (đổi trạng thái issue, tạo/sửa task, kích hoạt release, v.v.).
   - **Xác thực (Auth):** Sự kiện đăng nhập thành công.
2. **Thu thập thông tin định danh & ngữ cảnh:**
   - Người dùng: ID, Tên hiển thị, Email/Jira username, Vai trò.
   - Thời gian: Timestamp chính xác.
   - Thiết bị: Trình duyệt, Hệ điều hành (từ User-Agent).
   - Địa chỉ mạng: IP mạng nội bộ/truy cập.
3. **Màn hình quản trị trực quan tại `/admin/activity`:**
   - **4 thẻ chỉ số nhanh (Metric Cards):**
     - Đang online (hoạt động trong 15 phút qua).
     - Số thành viên riêng biệt trong ngày (Daily Active Users - DAU).
     - Tổng lượt xem trang trong ngày.
     - Tổng thao tác trong ngày.
   - **Thanh công cụ lọc linh hoạt:**
     - Theo thành viên (tất cả hoặc một người dùng cụ thể).
     - Theo loại sự kiện (`page_view`, `action`, `auth`).
     - Theo mốc thời gian (Hôm nay, 7 ngày, 30 ngày).
     - Ô tìm kiếm từ khóa (URL, nội dung chi tiết).
   - **Bảng dữ liệu chi tiết:**
     - Sắp xếp mới nhất trước, hỗ trợ phân trang (Pagination).
     - Đầy đủ cột: Thời gian (relative + absolute), Người dùng, Loại sự kiện, Chi tiết hoạt động, Trang (URL), Thiết bị.
     - Nút "Làm mới" (Refresh) và tự động cập nhật định kỳ (30s) bằng React Query.
4. **Hiệu năng & Trải nghiệm:**
   - Việc ghi nhận hoạt động ở client phải chạy ngầm bất đồng bộ (fire-and-forget qua `fetch` hoặc `navigator.sendBeacon`), không chặn hoặc làm chậm quá trình điều hướng của người dùng.
   - Áp dụng cơ chế chống ghi nhận trùng lặp (debounce/throttle) cho cùng một URL trong khoảng thời gian ngắn (ví dụ 10 giây).

### 2.2. Ngoài phạm vi (Non-Goals)
- Không ghi lại toàn bộ thao tác rê chuột, gõ phím hay video session replay (như Hotjar / FullStory) nhằm tối ưu hiệu năng và bảo vệ tính riêng tư.
- Không theo dõi khách vãng lai chưa đăng nhập (ngoại trừ lượt đăng nhập tại `/login`).

### 2.3. Chống mục tiêu (Anti-Goals)
- Không làm rò rỉ token, secret, mật khẩu vào bảng nhật ký hoạt động.
- Không để bảng nhật ký tăng vô hạn gây nghẽn database (cần retention policy tự động dọn dẹp dữ liệu cũ quá 60 hoặc 90 ngày).
- Không làm gián đoạn hoặc lỗi trang web nếu API theo dõi gặp sự cố (fail-safe).

---

## 3. Ràng buộc kỹ thuật & Tuân thủ Design System (Constraints)

- **Framework & Libraries:**
  - Next.js 15+ App Router, React 19.
  - Tailwind CSS v4, shadcn/ui, TanStack Query, Lucide icons.
  - Phông chữ: Plus Jakarta Sans, màu chủ đạo: Teal (`var(--primary)`).
  - Tuân thủ quy chuẩn `design-system/team-task-web/MASTER.md` và `AGENTS.md`:
    - Loading dùng component `Skeleton` (`src/components/ui/skeleton.tsx`).
    - Trạng thái rỗng dùng `EmptyState` (`icon` + `title` + `hint`).
    - Màu ngữ nghĩa (`bg-muted`, `text-muted-foreground`, `border-border`).
    - Hỗ trợ đầy đủ cả Light Mode và Dark Mode.
- **Cơ sở dữ liệu:** PostgreSQL với Prisma ORM (`prisma/schema.prisma`).
- **Phân quyền:** Chỉ tài khoản có `role === "admin"` mới được truy cập `/admin/activity` và API `/api/admin/activity`.

---

## 4. Chi tiết Kiến trúc & Giải pháp (Architecture & Design)

### 4.1. Cấu trúc CSDL (Database Model)

Bổ sung bảng `UserActivity` trong Prisma:

```prisma
model UserActivity {
  id          String   @id @default(cuid())
  userId      String?
  userName    String?
  userEmail   String?
  eventType   String   // "page_view" | "action" | "auth"
  action      String   // Tên ngắn gọn: e.g. "view.board", "issue.transition", "auth.login"
  description String?  // Mô tả dễ đọc: e.g. "Xem bảng Kanban dự án PAY"
  path        String   // URL: e.g. "/board?project=PAY"
  userAgent   String?  // Thông tin trình duyệt / hệ điều hành
  ipAddress   String?  // IP truy cập
  metadata    Json?    // Dữ liệu mở rộng nếu cần (không chứa secrets)
  createdAt   DateTime @default(now())

  @@index([createdAt(sort: Desc)])
  @@index([userId, createdAt(sort: Desc)])
  @@index([eventType, createdAt(sort: Desc)])
  @@index([path])
}
```

### 4.2. Cơ chế Thu thập Dữ liệu (Tracking Mechanism)

1. **Client-side Tracker (`UserActivityTracker`):**
   - Đặt trong App Layout chung (`src/app/(app)/layout.tsx`).
   - Sử dụng hook `usePathname()` và `useSearchParams()`.
   - Mỗi khi URL thay đổi:
     - Kiểm tra URL khác với URL vừa ghi nhận trong 10 giây qua.
     - Gửi request ngầm `POST /api/activity/track` với payload `{ path, title }`.
     - Phía server tự trích xuất thông tin người dùng từ Session NextAuth, Header `User-Agent` và Client IP.
2. **Server-side Activity Helper (`recordActivity()`):**
   - Được gọi từ các mutation API quan trọng hoặc login event để ghi nhận loại sự kiện `action` / `auth`.
   - Bọc trong `try...catch` để lỗi ghi nhận không bao giờ làm gián đoạn tác vụ chính.

### 4.3. API Endpoints

1. `POST /api/activity/track`
   - Nhận payload: `{ path: string, eventType?: string, action?: string, description?: string }`
   - Xác thực: Lấy session hiện tại.
   - Ghi vào bảng `UserActivity`.
   - Trả về: `{ ok: true }` ngay lập tức.
2. `GET /api/admin/activity`
   - Phân quyền: Yêu cầu Admin (`role === "admin"`).
   - Query params:
     - `userId`: lọc theo ID người dùng.
     - `eventType`: lọc theo `page_view` | `action` | `auth` | `all`.
     - `range`: `today` | `7d` | `30d`.
     - `q`: tìm kiếm chuỗi trong `description` hoặc `path`.
     - `page`: số trang (mặc định 1).
     - `limit`: số dòng mỗi trang (mặc định 25).
   - Trả về:
     - `metrics`: `{ onlineCount, activeUsersToday, totalViewsToday, totalActionsToday }`
     - `items`: Danh sách các bản ghi hoạt động.
     - `pagination`: `{ total, page, totalPages }`
     - `users`: Danh sách thành viên phục vụ dropdown bộ lọc.

### 4.4. Giao diện Quản trị (`/admin/activity`)

1. **Cập nhật Admin Navigation (`src/app/(app)/admin/admin-nav.tsx`):**
   - Bổ sung tab:
     ```ts
     { href: "/admin/activity", label: "Truy cập & Hoạt động", icon: Users, exact: false }
     ```
2. **Trang `/admin/activity/page.tsx`:**
   - Server Component hỗ trợ prefetch React Query.
   - Bọc bởi `AdminLayout` hiện có.
3. **Component Khách (`AdminActivityClient`):**
   - **Header:** Tiêu đề "Theo dõi người dùng & Lượt truy cập", mô tả, chỉ báo Live Indicator, nút "Làm mới".
   - **Row 4 Metric Cards:**
     - 🟢 Đang online (15m gần nhất)
     - 👥 Thành viên hoạt động trong ngày
     - 👁️ Lượt xem trang hôm nay
     - ⚡ Thao tác hôm nay
   - **Thanh bộ lọc (Filter Toolbar):**
     - Select chọn Người dùng (kèm avatar/tên).
     - Select chọn Loại sự kiện (Tất cả / Xem trang / Thao tác / Đăng nhập).
     - Select mốc thời gian (Hôm nay / 7 ngày / 30 ngày).
     - Ô Input tìm kiếm nhanh.
   - **Bảng hoạt động (Activity Table):**
     - Hiển thị theo đúng mẫu mockup đã duyệt.
     - Badge màu sắc rõ ràng cho từng loại:
       - `Xem trang`: Sky / Blue badge.
       - `Thao tác`: Amber / Orange badge.
       - `Đăng nhập`: Emerald / Green badge.
     - Phân trang ở chân bảng.

---

## 5. Dành cho Người thực thi (Left to the Builder)

1. Tối ưu parser User-Agent (dùng hàm helper nhẹ nhàng trích xuất OS & Browser chính như Chrome, Safari, Edge, Firefox, Windows, macOS, Linux, iOS, Android thay vì kéo package nặng).
2. Tích hợp Prisma migration an toàn.
3. Viết unit tests cho API endpoints (`/api/activity/track`, `/api/admin/activity`) và component render.
