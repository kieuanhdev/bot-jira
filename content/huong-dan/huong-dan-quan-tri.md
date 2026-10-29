# Quản trị (Admin) — Hướng dẫn sử dụng

**Tài liệu hướng dẫn sử dụng Team Task Web — Phần 15: Quản trị hệ thống**

| Thông tin | Giá trị |
| --- | --- |
| Hệ thống | Team Task Web — https://jira.kieuanhdev.id.vn/ |
| Trang chức năng | **Quản trị** (menu Quản trị — chỉ hiển thị với vai trò quản trị viên) |
| Địa chỉ trực tiếp | https://jira.kieuanhdev.id.vn/admin |
| Đối tượng | Quản trị viên (Admin) |
| Phiên bản tài liệu | 1.0 — Cập nhật 25/10/2026 |

---

## 1. Trang này dùng để làm gì?

Khu vực **Quản trị** gồm 3 trang: **Tổng quan hệ thống**, **Đồng bộ dự án**, **Truy cập & Hoạt động** — nơi Admin theo dõi sức khỏe nền tảng, quản lý đồng bộ Jira cho từng dự án và kiểm tra hoạt động người dùng.

> 🔒 Chỉ tài khoản có vai trò **quản trị viên** (phân vai ở Cài đặt → Người dùng & vai trò) mới thấy menu này.

## 2. Tổng quan hệ thống

![Tổng quan hệ thống](images/admin-01-tong-quan.png)

| Thành phần | Ý nghĩa |
| --- | --- |
| Banner cảnh báo | Các vấn đề cần lưu ý gộp lại (vd: "1 dịch vụ lỗi (OpenAI) · 30 thông báo gửi lỗi") — bấm để nhảy tới chi tiết |
| **Worker** | Tình trạng tiến trình nền: "Hoạt động tốt" + thời điểm heartbeat gần nhất |
| **Đồng bộ Jira cũ nhất** | Dự án lâu nhất chưa được đồng bộ (vd: 2 phút) |
| **Job đang lỗi** | Số background job thất bại trên tổng số job |
| **Thông báo lỗi** | Thông báo gửi thất bại (0 chờ · 628 đã gửi) |
| **Dịch vụ tích hợp** | Trạng thái từng dịch vụ kèm độ trễ: Cơ sở dữ liệu, Jira, Bitbucket, Sentry, OpenAI — xanh `OK`, xám `Chưa cấu hình`, đỏ `Lỗi` (kèm thông báo lỗi copy được) |
| **Job nền** | Bảng các job định kỳ (Kiểm tra nhánh, poll-jira-project...): trạng thái, lịch chạy, thời gian thực thi, xu hướng hiệu năng, thành công gần nhất; lọc **Tất cả / Lỗi / Đang chạy / Treo / Chưa chạy** |
| **Làm mới** | Kéo trạng thái mới nhất |

> 💡 Khi người dùng báo "dữ liệu không cập nhật" — kiểm tra Worker và Job nền trước; khi "AI chấm điểm" lỗi — xem dịch vụ OpenAI.

## 3. Đồng bộ dự án

![Quản lý đồng bộ từng dự án](images/admin-02-dong-bo-du-an.png)

| Thành phần | Chức năng |
| --- | --- |
| Thẻ thống kê | **Dự án (15)** · **Đang bật (14)** · **Đã tắt (1)** · **Đang lỗi (0)** · **Tùy chỉnh (2)** |
| **Bật tất cả / Tắt tất cả** | Gạt đồng bộ cho toàn bộ dự án một lần |
| **Đồng bộ tất cả** | Chạy đồng bộ Jira ngay cho mọi dự án đang bật |
| Bảng từng dự án | Mã + tên, số issue, trạng thái `Ổn định`, thời gian thành công/chạy gần nhất, và các thao tác: **Đồng bộ** (chạy ngay) · **Toàn bộ** (phạm vi đồng bộ) · **Cấu hình** (tùy chỉnh hạng mục đồng bộ) · **Công tắc bật/tắt** |
| Ô tìm kiếm | Nhảy nhanh theo mã/tên dự án |

> ⚠️ **Dự án đã tắt sẽ không được đồng bộ dưới bất kỳ kịch bản nào** (ghi rõ trên trang) — tắt chỉ dành cho dự án ngừng hoạt động, không dùng để "IMIT" dữ liệu.

## 4. Truy cập & Hoạt động người dùng

![Truy cập và hoạt động người dùng](images/admin-03-truy-cap-hoat-dong.png)

| Thành phần | Ý nghĩa |
| --- | --- |
| **Đang online (15m qua)** | Số người dùng có hoạt động gần nhất |
| **Thành viên trong ngày** | Số tài khoản riêng biệt đã truy cập hôm nay |
| **Tổng lượt xem trang** | Lượt mở trang + chuyển hướng URL trong ngày |
| **Thao tác dữ liệu hôm nay** | Số thao tác thay đổi (đổi trạng thái, tạo task, tương tác) |
| Bộ lọc | Theo **thành viên**, **loại sự kiện**, **thời gian** (Hôm nay...) + tìm kiếm theo trang/nội dung |
| Bảng hoạt động | Thời gian · Người dùng · Loại (Xem trang / Hệ thống...) · Chi tiết hoạt động (page.view...) · Đường dẫn URL · Thiết bị (Chrome · Linux...) |

Dữ liệu cập nhật **theo thời gian thực** (nhãn "Ghi nhận thời gian thực"). Dùng để: tra cứu "ai vừa thao tác gì", kiểm tra thiết bị/đường dẫn khi debug báo lỗi từ thành viên, và đối chiếu khi cần điều tra sự cố.

> ⚠️ Nhật ký hoạt động phục vụ vận hành — sử dụng hợp lý, tôn trọng quyền riêng tư của thành viên.

## 5. Đổi tài khoản (User Impersonation) — xem hệ thống qua tài khoản người khác

Tính năng dành riêng cho Admin (nút **"Đổi tài khoản"** ở chân thanh điều hướng bên trái, kèm chip vai trò hiện tại):

- Mở hộp thoại **"Chuyển đổi tài khoản (User Impersonation)"**: *"Chọn một thành viên để xem giao diện, quyền hạn và dữ liệu đúng theo tài khoản của họ."*
- **Ô tìm kiếm** theo tên hiển thị, Jira username hoặc email.
- Danh sách thành viên theo nhóm chữ cái (A, T, C, H...) hiển thị: tên + username `@jira`, email, vai trò (Admin/Lead/member).
- Bấm **"Chuyển sang"** của thành viên để **xem hệ thống đúng như người đó**: board, task, quyền hạn, thông báo... Tài khoản đang xem có nhãn **"Đang xem"**.
- Hàng dưới hộp thoại ghi rõ: **"Chỉ Admin mới có thể đổi tài khoản"**.

**Khi nào dùng:**

- Kiểm tra "tại sao thành viên X không thấy task/board này" — xem đúng góc nhìn của họ.
- Hỗ trợ từ xa cấu hình (Sentry/Bitbucket) cho thành viên mà không cần hỏi mật khẩu.
- Kiểm chứng quyền hạn sau khi đổi vai trò trong Cài đặt.

> ⚠️ Khi đang impersonation, mọi thao tác (kéo thả, sửa task) đều thực hiện **danh nghĩa tài khoản được xem** — hạn chế thao tác dữ liệu khi impersonate; xong việc nên chuyển về tài khoản Admin của mình.

## 6. Quy trình gợi ý cho Admin

1. **Hằng ngày**: glance Tổng quan — banner cảnh báo có gì không, Worker ổn định, dịch vụ nào đỏ.
2. **Khi có sự cố**: Job nền → lọc **Lỗi** → xem job lỗi và thông báo lỗi; kiểm tra Dịch vụ tích hợp tương ứng; xử lý xong bấm **Đồng bộ tất cả** nếu cần kéo lại dữ liệu.
3. **Thêm dự án mới vào hệ thống**: vào Đồng bộ dự án → tìm dự án → bật công tắc → cấu hình hạng mục → chạy **Đồng bộ** lần đầu.
4. **Cuối tuần**: rà Truy cập & Hoạt động để biết mức độ sử dụng, quyết định dọn tài khoản/ngừng dự án.

## 7. Xử lý sự cố thường gặp

| Hiện tượng | Nguyên nhân & cách xử lý |
| --- | --- |
| Worker không "Hoạt động tốt" | Tiến trình nền gặp sự cố — kiểm tra log máy chủ, khởi động lại dịch vụ; trong lúc chờ, các trang vẫn xem được nhưng dữ liệu không tự cập nhật. |
| Dịch vụ OpenAI đỏ (timeout) | AI chấm điểm/tách sub-task sẽ lỗi tạm thời — kiểm tra mạng/API key máy chủ; các chức năng không AI vẫn bình thường. |
| Dự án "Đang lỗi" trong Đồng bộ dự án | Thường do token/thẩm quyền Jira hoặc dự án đổi key — mở **Cấu hình** của dự án đó, kiểm tra và chạy **Đồng bộ** lại. |
| Thông báo lỗi tăng vọt | Vào Cài đặt/Quản trị xem job gửi thông báo; thường do webhook Discord hoặc Web Push của nhiều người dùng lỗi cùng lúc. |
| Bitbucket "Chưa cấu hình" trên máy chủ | Cần quản trị máy chủ đặt `BITBUCKET_BASE_URL` — người dùng vẫn lưu được token cá nhân nhưng chưa xác minh được. |
| Không thấy nút "Đổi tài khoản" hoạt động | Chỉ vai trò **quản trị viên** dùng được tính năng này; kiểm tra vai trò trong Cài đặt → Người dùng & vai trò. |
| Quên rằng đang xem bằng tài khoản người khác | Nhìn chip tên tài khoản ở nút "Đổi tài khoản" — nếu không phải tên bạn, bấm vào và chuyển về tài khoản Admin trước khi thao tác. |

---

*Tài liệu viết dựa trên giao diện thực tế (ảnh chụp chế độ Sáng, 25/10/2026). Trang chỉ được xem — không bật/tắt đồng bộ, không chạy job nào.*
