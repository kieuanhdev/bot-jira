# Task cần xử lý — Hướng dẫn sử dụng

**Tài liệu hướng dẫn sử dụng Team Task Web — Phần 12: Sức khỏe luồng công việc và chuẩn hóa dữ liệu task**

| Thông tin | Giá trị |
| --- | --- |
| Hệ thống | Team Task Web — https://jira.kieuanhdev.id.vn/ |
| Trang chức năng | **Task cần xử lý** (menu Công việc → Task cần xử lý) |
| Địa chỉ trực tiếp | https://jira.kieuanhdev.id.vn/stale |
| Đối tượng | Toàn bộ thành viên (góc nhìn Cả nhóm dành cho Leader/quản lý) |
| Phiên bản tài liệu | 1.0 — Cập nhật 25/10/2026 |

---

## 1. Trang này dùng để làm gì?

Trang **Task cần xử lý** là "bác sĩ kiểm tra sức khỏe" của luồng công việc: tìm ra các task **thiếu dữ liệu chuẩn** (chưa có points, chưa log work, thiếu due date...) hoặc **vượt SLA** (nằm yên một trạng thái quá lâu), để bạn xử lý từng việc và tháo gỡ điểm nghẽn.

## 2. Tổng quan giao diện

![Tổng quan trang Task cần xử lý](images/stale-01-tong-quan.png)

| Thành phần | Chức năng |
| --- | --- |
| Nút **"Việc của tôi"** | Chuyển góc nhìn giữa task của bạn và cả nhóm |
| Tab **"Cần chuẩn hóa (N)"** | Task thiếu dữ liệu theo chính sách luồng (chính sách luồng v1.0) |
| Tab **"Tồn đọng (SLA) (N)"** | Task ở một trạng thái quá lâu so với ngưỡng SLA |
| **"Chuẩn hóa hàng loạt (N)"** | Đi thẳng vào wizard Cập nhật hàng loạt với các task được chọn |
| **Làm mới** | Kéo dữ liệu phân tích mới nhất |
| 4 thẻ thống kê | Số task vi phạm từng tiêu chí: **Estimate/Points**, **Worklog**, **Fix Version**, **Due date** |
| Bộ lọc | Tìm kiếm, dự án, trạng thái SLA, sắp xếp "Thiếu nhiều mục nhất" |

## 3. Hàng đợi chuẩn hóa — xử lý từng task

![Hàng đợi chuẩn hóa với chi tiết vi phạm](images/stale-02-hang-doi-chuan-hoa.png)

Mỗi dòng là một task chưa đạt chuẩn, gồm:

| Thành phần | Ý nghĩa |
| --- | --- |
| **Task + trạng thái** | Mã, loại, dự án, tiêu đề, trạng thái Jira — bấm mã để mở chi tiết |
| **Kiểm tra tiêu chuẩn** | Từng tiêu chí đạt ✅ (vd `13pt`, `easy_jira`) hay lỗi ❌ (vd `Chưa log work`, `Thiếu Due date`) |
| **SLA & rủi ro** | Tình trạng SLA (vd "Trong hạn SLA (0/5d)") và cờ rủi ro (vd `Quá hạn 1 ngày`, `Bị chặn`) |
| **Hành động** | **Ghi Worklog** (mở form log nhanh), **Sửa trường** (bổ sung points/due date...), **Mở task** |

**Phím tắt tiện ích** (ghi dưới bảng): `J/K` di chuyển · `X` chọn · `0` mở task · `P` nhập points · `W` ghi worklog · `/` tìm kiếm · `Esc` bỏ chọn dòng.

## 4. Quy trình gợi ý

1. Mở tab **"Cần chuẩn hóa"** — xử lý các task của mình trước (điền points, log work, đặt due date).
2. Dùng nút **"Chuẩn hóa hàng loạt"** khi nhiều task thiếu cùng một thứ (vd cùng thiếu due date) — hệ thống đưa thẳng vào wizard Cập nhật hàng loạt.
3. Tab **"Tồn đọng (SLA)"** — với Leader: kiểm tra task nằm quá lâu ở một bước (kẹt QA, kêt review...) để thúc đẩy.
4. Bấm **Làm mới** sau khi xử lý để tính lại điểm sức khỏe.

## 5. Xử lý sự cố thường gặp

| Hiện tượng | Nguyên nhân & cách xử lý |
| --- | --- |
| Task vừa bổ sung vẫn còn trong hàng đợi | Dữ liệu phân tích tính theo chu kỳ đồng bộ — bấm **Làm mới**. |
| Task của người khác hiện trong góc nhìn của tôi | Kiểm tra nút góc nhìn đang bật ("Việc của tôi" chỉ tính task bạn phụ trách/liên quan). |
| "Chuẩn hóa hàng loạt" mở wizard trống | Chưa tick chọn task nào ở hàng đợi — tick ô từng dòng hoặc ô chọn tất cả. |

---

*Tài liệu viết dựa trên giao diện thực tế (ảnh chụp chế độ Sáng, 25/10/2026). Trang chỉ được xem — không ghi worklog hay sửa trường nào.*
