# Cài đặt — Hướng dẫn sử dụng

**Tài liệu hướng dẫn sử dụng Team Task Web — Phần 11: Cài đặt cá nhân và cấu hình tích hợp**

| Thông tin | Giá trị |
| --- | --- |
| Hệ thống | Team Task Web — https://jira.kieuanhdev.id.vn/ |
| Trang chức năng | **Cài đặt** (menu cuối thanh bên trái) |
| Địa chỉ trực tiếp | https://jira.kieuanhdev.id.vn/settings |
| Đối tượng | Toàn bộ thành viên (một số mục chỉ Admin thấy tác động) |
| Phiên bản tài liệu | 1.0 — Cập nhật 25/10/2026 |

---

## 1. Trang này dùng để làm gì?

Trang **Cài đặt** gồm các nhóm cấu hình theo thứ tự từ trên xuống:

1. **Giao diện** — chế độ Sáng / Tối / Theo hệ thống.
2. **Tích hợp cá nhân** — token Jira, Bitbucket, Sentry của riêng bạn.
3. **Thông báo trên ứng dụng (In-app)** — bật/tắt 9 loại sự kiện.
4. **Thông báo chung toàn đội** (broadcast) — mặc định chỉ Admin bật.
5. **Hình thức & tần suất gửi** — tức thì hoặc bản tin tổng hợp hàng ngày.
6. **Thông báo đẩy ngoài màn hình (Web Push)**.
7. **Thông báo Discord cá nhân**.
8. **Leader theo dự án** — phân quyền nhận cảnh báo merge trái phép.
9. **Trường người theo dự án** — ghim Reporter/Approver/Tester.
10. **Tình trạng dịch vụ** — kiểm tra kết nối các hệ thống.
11. **Người dùng & vai trò** — phân vai thành viên/quản trị viên.

> 💡 Token của bạn được **mã hóa AES-256-GCM phía máy chủ** và không chia sẻ với người khác.

## 2. Giao diện

![Giao diện và Tích hợp cá nhân](images/settings-01-giao-dien-tich-hop.png)

Ba lựa chọn có hình minh họa trực quan: **Sáng** (nền trắng, tương phản cao), **Tối** (dịu mắt ban đêm), **Theo hệ thống** (tự theo thiết bị). Lựa chọn áp dụng ngay và được ghi nhớ giữa các lần truy cập.

## 3. Tích hợp cá nhân (Jira / Bitbucket / Sentry)

Cùng một khối "Tích hợp cá nhân" chứa 3 kết nối:

| Kết nối | Bắt buộc? | Điền gì |
| --- | --- | --- |
| **Jira** | ✅ Bắt buộc — không có sẽ không xem/thao tác được bảng công việc | Username Jira (tùy chọn), loại xác thực (vd `Bearer (Jira DC này)`), **Jira API token** |
| **Bitbucket** | Tùy chọn — cần khi tạo/liên kết nhánh, PR | Username Bitbucket (bắt buộc), **Bitbucket API token** |
| **Sentry** | Tùy chọn — cần cho trang Lỗi Sentry | **Organization slug**, ánh xạ **Dự án Sentry → project Jira** (`slug:KEY`, cách nhau dấu phẩy, vd `mobile-app:EPM,employee-app:MHRM`), **Sentry token** (cần quyền `project:read`, `event:read`) |

Cách thao tác chung:

- Điền thông tin → bấm **"Lưu & xác minh"** — hệ thống kiểm tra token có hợp lệ không.
- Khi đã kết nối, hiển thị nhãn xanh **"đã liên kết · <username>"** kèm link **"Ngắt kết nối"** màu đỏ nếu muốn gỡ.
- Bitbucket: nếu máy chủ chưa cấu hình BITBUCKET_BASE_URL, token vẫn được lưu nhưng hiện cảnh báo "chưa thể xác minh" cho đến khi quản trị viên cấu hình.

![Cấu hình Sentry và tóm tắt thông báo in-app](images/settings-02-sentry-thong-bao.png)

> 💡 Token Sentry để trỏ sai thường là nguyên nhân trang **Lỗi Sentry** không có dữ liệu — xem thêm mục xử lý sự cố của tài liệu Lỗi Sentry.

## 4. Thông báo trên ứng dụng (In-app)

Tùy chỉnh **9 loại sự kiện** hiển thị trên hộp thư nhanh, chuông thông báo và trang Thông báo. Chia 3 nhóm:

![Các loại thông báo in-app](images/settings-03-loai-thong-bao.png)

| Nhóm | Loại sự kiện |
| --- | --- |
| **Công việc & Task Jira (4)** | Bình luận trên task & PR · Cập nhật thông tin task theo dõi (assignee, mô tả, ưu tiên, version...) · Cảnh báo task tồn đọng / quá hạn SLA · Lỗi Sentry blocker nghiêm trọng |
| **Bản phát hành & CI/CD (3)** | Trạng thái bản phát hành (Release) · Chuyển trạng thái workflow task · Kết quả build & kiểm thử CI |
| **AI & Hệ thống (2)** | Gợi ý điểm story point từ AI · Thông báo hệ thống & tiến trình nền (bulk operations hoàn tất, đồng bộ Jira...) |

Thao tác: tick/bỏ tick từng loại, hoặc bấm **"Bật tất cả" / "Tắt tất cả"**. Bộ đếm "9/9 đang bật" cho biết hiện trạng.

## 5. Thông báo chung toàn đội (broadcast)

- Nhận thông báo phát cho toàn hệ thống (release, CI, Sentry, tình trạng dịch vụ).
- **Mặc định chỉ quản trị viên nhận broadcast**; thành viên thường có thể tự bật khi muốn theo dõi hoạt động chung.
- Thông báo liên quan trực tiếp đến bạn vẫn được giữ ngay cả khi tắt mục này.

## 6. Hình thức & tần suất gửi

- **Gửi tức thì (mặc định, khuyên dùng)** — nhận ngay khi có bình luận, chuyển trạng thái, sự cố blocker.
- **Bản tin tổng hợp hàng ngày** — gộp các sự kiện, gửi một lần mỗi ngày vào khung giờ bạn chọn.

## 7. Thông báo đẩy ngoài màn hình (Web Push)

- Nhận **thông báo nổi của trình duyệt** ngay cả khi không mở tab hệ thống.
- Cần đồng ý quyền thông báo của trình duyệt. Nếu bị chặn: bấm biểu tượng ổ khóa cạnh thanh địa chỉ → bật quyền "Thông báo" → tải lại trang (hệ thống hiện hướng dẫn ngay trên trang).

## 8. Thông báo Discord cá nhân

- Nhận thông báo hệ thống dành cho bạn qua **webhook riêng hoặc tin nhắn Discord**.
- Đích đến này **không được chia sẻ** với người khác — cấu hình cá nhân.

## 9. Leader theo dự án

![Phân quyền Leader theo dự án](images/settings-04-leader-du-an.png)

- Chọn **dự án** → xem "Leader hiện tại của dự án" → tick thành viên trong **"Phân quyền Leader"** (có ô tìm kiếm) → bấm **"Lưu thay đổi"**.
- Tác dụng: khi một **PR được merge bởi người không phải Leader** của dự án, hệ thống gửi **cảnh báo tức thì** cho các Leader của dự án đó (chống merge trái phép).
- Nếu dự án chưa có Leader, hệ thống cảnh báo *"cảnh báo merge sẽ bị bỏ qua"* — nên phân công ít nhất 1 người.

## 10. Trường người theo dự án

- Cấu hình ghi đè các trường **Reporter, Approver và Assignee Tester** cho từng dự án (điền mã trường `customfield_...` của Jira).
- Giá trị thủ công này **không bị tác vụ dò hằng ngày ghi đè** — dùng khi Jira của dự án có cấu hình trường riêng.

## 11. Tình trạng dịch vụ

![Kiểm tra kết nối dịch vụ và phân vai](images/settings-05-dich-vu-vai-tro.png)

- Bấm **"Kiểm tra kết nối"** để kiểm tra Postgres, Jira, Bitbucket, Sentry và OpenAI — hữu ích khi nghi ngờ hệ thống lỗi (kết hợp với trang Quản trị).
- Khởi động lại các tác vụ định kỳ nếu cần.

## 12. Người dùng & vai trò

Bảng thành viên của hệ thống: **Người dùng · Jira (username) · Vai trò · Ngày tham gia**. Vai trò đổi bằng dropdown: **quản trị viên / trưởng nhóm / thành viên**. Username Jira được dùng để **gán thông báo** cho đúng người.

> ⚠️ Chỉ đổi vai trò khi có trách nhiệm — vai trò quyết định quyền nhận broadcast và một số quyền hệ thống.

## 13. Xử lý sự cố thường gặp

| Hiện tượng | Nguyên nhân & cách xử lý |
| --- | --- |
| Trang Bảng công việc báo lỗi Jira | Token Jira hết hạn/thiếu quyền — vào Tích hợp cá nhân → Jira, dán token mới → "Lưu & xác minh". |
| Không tạo được nhánh Git | Bitbucket chưa kết nối hoặc token thiếu quyền — điền username + token, lưu & xác minh. |
| Trang Lỗi Sentry trống | Chưa cấu hình Sentry: điền Organization slug, ánh xạ dự án và token có `project:read`, `event:read`. |
| Không nhận được thông báo nổi | Quyền Web Push bị chặn — làm theo hướng dẫn ổ khóa trên trang; kiểm tra chưa tắt loại sự kiện tương ứng ở mục In-app. |
| Thông báo quá nhiều | Tắt bớt loại sự kiện ở mục In-app, hoặc chuyển sang **Bản tin tổng hợp hàng ngày**. |
| Cảnh báo merge không gửi cho Leader nào | Dự án chưa được phân công Leader — phân quyền ở mục 9. |
| Quyền thông báo bị chặn vĩnh viễn trên Chrome | Truy cập `chrome://settings/content/notifications`, xóa trang khỏi danh sách chặn, tải lại. |

---

*Tài liệu viết dựa trên giao diện thực tế của hệ thống (ảnh chụp ở chế độ Sáng tại thời điểm 25/10/2026). Trong quá trình viết, trang chỉ được xem — không lưu cấu hình, không đổi vai trò, không phân quyền Leader nào.*
