# Thông báo — Hướng dẫn sử dụng

**Tài liệu hướng dẫn sử dụng Team Task Web — Phần 14: Trung tâm thông báo**

| Thông tin | Giá trị |
| --- | --- |
| Hệ thống | Team Task Web — https://jira.kieuanhdev.id.vn/ |
| Trang chức năng | **Thông báo** (menu Công việc → Thông báo; chuông 🔔 trên thanh bên có huyết số chưa đọc) |
| Địa chỉ trực tiếp | https://jira.kieuanhdev.id.vn/notifications |
| Đối tượng | Toàn bộ thành viên |
| Phiên bản tài liệu | 1.0 — Cập nhật 25/10/2026 |

---

## 1. Trang này dùng để làm gì?

**Trung tâm thông báo** gom mọi sự kiện liên quan đến bạn: trao đổi Jira (bình luận, gán việc), luồng phát hành, sự cố Sentry, cảnh báo SLA, kết quả CI...

![Trung tâm thông báo](images/noti-01-trung-tam.png)

## 2. Các khu vực chính

| Khu vực | Chức năng |
| --- | --- |
| 4 thẻ thống kê | **Tổng thông báo** · **Chưa đọc** · **Đã xem** · **Cần chú ý** (các thông báo ưu tiên như blocker, quá SLA) — bấm thẻ để lọc |
| Ô tìm kiếm | Tìm theo tiêu đề, nội dung hoặc mã task |
| Chip **Tất cả / Chưa đọc / Đã đọc** | Lọc theo trạng thái đọc (kèm số lượng) |
| **Phân loại theo danh mục** | Chip lọc theo loại sự kiện: Bình luận · Task Jira · Chuyển cột · SLA / Tồn đọng · Phát hành · Sentry Bug · Build & CI · AI... (cuộn ngang để thấy hết) |
| Danh sách thông báo | Nhóm theo thời gian ("Trong 7 ngày qua"...), mỗi dòng có loại (Xem trang / Hệ thống), nhãn (Mới, CẢNH BÁO), nội dung và link đến đối tượng |
| Nút góc phải | **Đánh dấu tất cả đã đọc** · **Dọn dẹp đã đọc** (xóa các thông báo đã xem) · **Cài đặt** (mở cấu hình loại thông báo) · **Làm mới** (icon ⟳) |

## 3. Quy trình gợi ý

1. **Đầu ngày / sau họp**: mở trang, lọc **"Chưa đọc"** → xử lý mục **"Cần chú ý"** trước (blocker, SLA).
2. Bấm vào thông báo để mở đúng task/release liên quan; thông báo tự chuyển sang "Đã xem".
3. Thỉnh thoảng bấm **"Dọn dẹp đã đọc"** để hộp thư gọn.
4. Nhận thông báo quá nhiều/nhiều loại thừa? Vào **Cài đặt** (link góc phải) để tắt từng loại sự kiện — xem tài liệu Cài đặt, mục 4.

## 4. Kênh nhận thông báo khác

Ngoài trang này, thông báo còn được đẩy qua (cấu hình trong **Cài đặt**):

- **Chuông 🔔 + huyết số** trên thanh bên (in-app).
- **Web Push** — thông báo nổi của trình duyệt khi không mở tab.
- **Discord cá nhân** — tin nhắn riêng.
- **Bản tin tổng hợp hàng ngày** — nếu chọn tần suất tổng hợp thay vì tức thì.

## 5. Xử lý sự cố thường gặp

| Hiện tượng | Nguyên nhân & cách xử lý |
| --- | --- |
| Không thấy thông báo mới | Bấm **Làm mới**; kiểm tra loại sự kiện tương ứng có bị tắt trong Cài đặt → In-app không. |
| Huyết số trên thanh bên khác số trong trang | Bộ đếm chưa làm mới — mở lại trang hoặc bấm Làm mới. |
| Nhận cả thông báo broadcast dù không muốn | Mục "Thông báo chung toàn đội" đang bật trong Cài đặt — tắt đi (thông báo liên quan trực tiếp đến bạn vẫn giữ). |
| Muốn nhận ít nhưng không bỏ sót việc quan trọng | Giữ bật nhóm "Công việc & Task Jira" + chip lọc "Cần chú ý" khi duyệt; tắt nhóm AI & Hệ thống nếu ít dùng. |

---

*Tài liệu viết dựa trên giao diện thực tế (ảnh chụp chế độ Sáng, 25/10/2026). Trang chỉ được xem — không đánh dấu đã đọc hay dọn dẹp thông báo nào.*
