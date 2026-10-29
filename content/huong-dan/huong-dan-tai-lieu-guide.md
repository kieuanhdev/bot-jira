# Tài liệu & Guide — Hướng dẫn sử dụng

**Tài liệu hướng dẫn sử dụng Team Task Web — Phần 16: Thư viện tài liệu kỹ thuật tích hợp**

| Thông tin | Giá trị |
| --- | --- |
| Hệ thống | Team Task Web — https://jira.kieuanhdev.id.vn/ |
| Trang chức năng | **Tài liệu & Guide** (menu Tài liệu → Tài liệu & Guide) |
| Địa chỉ trực tiếp | https://jira.kieuanhdev.id.vn/docs |
| Đối tượng | Toàn bộ thành viên, đặc biệt người mới cấu hình tích hợp |
| Phiên bản tài liệu | 1.0 — Cập nhật 25/10/2026 |

---

## 1. Trang này dùng để làm gì?

Trang **Tài liệu & Hướng dẫn** là thư viện tập trung các **tài liệu kỹ thuật và hướng dẫn cấu hình** do hệ thống cung cấp sẵn — tổng hợp các tài liệu kỹ thuật, hướng dẫn cấu hình tích hợp và quy trình vận hành cho đội ngũ phát triển.

![Trang Tài liệu & Hướng dẫn](images/docs-01-trang-tai-lieu.png)

## 2. Các tài liệu hiện có

Mỗi tài liệu hiển thị dạng thẻ: nhãn phân loại (Mới cập nhật / Jira + Bitbucket / Xác thực Jira / Git & Code Review / Vận hành), tiêu đề, mô tả chi tiết tính năng, và nút mở:

| Tài liệu | Nhóm | Nội dung chính | Đường dẫn |
| --- | --- | --- | --- |
| **Hướng dẫn Cấu hình Sentry & Tự động tạo Task Jira** | Mới cập nhật · Light & Dark Mode | Lấy token trên Sentry nội bộ (`sentry.easypos.vn`), cấu hình ánh xạ dự án (`easy-hrm:MHRM`), quy trình duyệt lỗi tự động sinh Jira Issue; kèm hình ảnh thực tế và **bộ mô phỏng (Live Simulator)** kiểm tra cú pháp trước khi lưu; bảng tra cứu sự cố (token 401, 404) | `/sentry-config-guide.html` |
| **Hướng dẫn Cấu hình Webhook (Jira & Git Bitbucket)** | Jira + Bitbucket | Cấu hình webhook cho Jira Data Center (`/api/webhooks/jira`) và Bitbucket Git (`/api/webhooks/bitbucket`), cơ chế bảo mật HMAC SHA-256, hướng dẫn sinh khóa bí mật bằng `openssl`, tự động phát hiện và cảnh báo **Unauthorized Merge** tới Leader | `/webhook-config-guide.html` |
| **Kết nối Tài khoản & Personal Access Token (PAT)** | Xác thực Jira | Tạo và quản lý Jira PAT trên Jira Data Center để đồng bộ công việc, log time, cập nhật trạng thái; mã hóa AES-256-GCM tại máy chủ | xem trang **Cài đặt** |
| **Tích hợp Bitbucket Server & Tạo nhánh Git** | Git & Code Review | Kết nối Bitbucket Server để tạo nhanh branch từ task Jira, liên kết Pull Request, cấp quyền đọc 80+ repositories, tự động liên kết commit/PR vào task | xem trang **Nhánh & Delivery** |
| **Quy trình Phát hành & Điều kiện Release Gate** | Vận hành | Tiêu chí kiểm duyệt chất lượng phiên bản, điều kiện khóa release (không còn lỗi Sentry blocker), gửi thông báo phát hành qua Discord và Web Push | xem trang **Quản lý phát hành** |

## 3. Cách sử dụng

1. Vào **menu Tài liệu → Tài liệu & Guide**.
2. Chọn tài liệu phù hợp nhu cầu (cấu hình Sentry / webhook / xác thực...).
3. Bấm **"Xem tài liệu"** để mở trang hướng dẫn chi tiết (mở ngay trong hệ thống, có chế độ Sáng/Tối).
4. Các tài liệu cấu hình đều có **mô phỏng trực tiếp** (Live Simulator) — thử cấu hình trên giao diện mô phỏng trước khi lưu thật.

## 4. Liên kết với bộ tài liệu sử dụng

Trang này chứa tài liệu **kỹ thuật/cấu hình** (dành cho người vận hành hệ thống), bổ trợ cho bộ tài liệu **hướng dẫn sử dụng** mà bạn đang đọc:

- Cần hướng dẫn **dùng chức năng** (board, sentry, release...) → xem bộ tài liệu sử dụng Phần 1–16.
- Cần hướng dẫn **cấu hình nền tảng** (webhook, token hệ thống, PAT) → dùng các tài liệu trên trang này.

---

*Tài liệu viết dựa trên giao diện thực tế (ảnh chụp chế độ Sáng, 25/10/2026).*
