# Login Page Design Specification

> **Page:** `/login` (Kết nối Jira)  
> **Target Audience:** Kỹ sư, Product Manager, QA trong nhóm phát triển dự án.  
> **Tone & Mood:** Đáng tin cậy, bảo mật cao, hiện đại (Developer-first, SaaS Sleek), tinh gọn.

---

## 1. Authentication Flow Rules
- **Phương thức duy nhất:** Đăng nhập bằng Jira Personal Access Token (PAT) / API Token.
- **Loại bỏ hoàn toàn:** Tùy chọn Basic Auth (Username + Token) theo yêu cầu sản phẩm.
- **Cơ chế xác thực:** Gửi token tới máy chủ, xác thực trực tiếp với Jira API (`/rest/api/2/myself`) qua Bearer token, sau đó lưu mã hóa AES-256-GCM trên server và cấp phiên JWT an toàn 30 ngày cho trình duyệt.

---

## 2. Visual & Layout Architecture
- **Layout:**
  - Nền hiệu ứng aura gradient tinh tế với dải màu Teal (`oklch(0.6 0.108 184.7)`) đặc trưng của Team Task Web.
  - Lưới card trung tâm kích thước chuẩn mực (`max-w-md`), cân đối giữa mobile và desktop.
  - Logo thương hiệu nổi bật với biểu tượng `Bot` kết hợp hiệu ứng glow và viền bo mềm mại.
  - Phù hiệu bảo mật: "Enterprise Grade · AES-256 Encrypted".
- **Form Controls:**
  - Input Token hỗ trợ nút Toggle Xem/Ẩn token (`Eye` / `EyeOff`), nút hỗ trợ Paste nhanh từ bộ nhớ tạm.
  - Liên kết hướng dẫn trực tiếp "Cách tạo token Jira" mở Popover/Modal hướng dẫn 3 bước ngắn gọn, rõ ràng ngay trên màn hình.
  - Trạng thái loading: Tuân thủ quy chuẩn `Skeleton` của hệ thống (`src/components/ui/skeleton.tsx`), không dùng text spinner đơn thuần.
  - Nút bấm chính "Kết nối Jira và tiếp tục": Tối ưu contrast, hiệu ứng hover mượt mà 200ms, trạng thái active/focus rõ rệt.

---

## 3. Accessibility & Micro-interactions
- Phím tắt tiện lợi: Hỗ trợ autoFocus, dán từ clipboard, thông báo lỗi `role="alert"`.
- Đảm bảo contrast chữ và các icon tối thiểu 4.5:1 ở cả Light Mode và Dark Mode.
- Không dùng icon emoji; 100% sử dụng icon SVG từ bộ `lucide-react`.
- Tôn trọng `prefers-reduced-motion`.
