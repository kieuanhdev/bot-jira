# Team Task Web — Hướng dẫn đăng nhập

**Tài liệu hướng dẫn sử dụng — Phần 1: Đăng nhập bằng Jira Personal Access Token (PAT)**

| Thông tin | Giá trị |
| --- | --- |
| Hệ thống | Team Task Web — Nền tảng điều phối công việc nội bộ |
| Địa chỉ truy cập | https://jira.kieuanhdev.id.vn/ |
| Phương thức đăng nhập | Jira Personal Access Token (PAT) |
| Đối tượng | Toàn bộ thành viên sử dụng hệ thống |
| Phiên bản tài liệu | 1.0 — Cập nhật 24/10/2026 |

---

## 1. Tổng quan

Team Task Web sử dụng **Jira Personal Access Token (PAT)** để xác thực. Bạn **không cần nhập mật khẩu Jira** — chỉ cần dán token cá nhân một lần, hệ thống sẽ:

- Đồng bộ task, worklog và quyền hạn đúng theo tài khoản Jira của bạn.
- Lưu phiên đăng nhập trên trình duyệt trong **30 ngày**, không phải đăng nhập lại mỗi ngày.

**Cam kết bảo mật của hệ thống (ghi trên trang đăng nhập):**

- Token được mã hóa **AES-256-GCM** tại máy chủ nội bộ.
- Trình duyệt chỉ lưu phiên 30 ngày, **không lưu raw token**.
- Không yêu cầu mật khẩu đăng nhập Jira của bạn.

## 2. Chuẩn bị trước khi đăng nhập

- Bạn có tài khoản Jira Data Center còn hoạt động (Jira nội bộ của công ty).
- Bạn đã tạo **Personal Access Token (PAT)** trên Jira. Nếu chưa có, xem mục **Bước 2** bên dưới.
- Trình duyệt: Chrome, Edge hoặc Firefox phiên bản mới.

## 3. Các bước đăng nhập

### Bước 1 — Mở trang đăng nhập

Mở trình duyệt và truy cập địa chỉ: **https://jira.kieuanhdev.id.vn/**

Hệ thống tự chuyển đến trang **Đăng nhập** với các thành phần:

![Trang đăng nhập Team Task Web](images/01-trang-dang-nhap.png)

1. Ô nhập **Jira Personal Access Token (PAT)**.
2. Nút **"Cách lấy token?"** — xem hướng dẫn tạo token nếu chưa có.
3. Nút **"Dán"** — dán nhanh token từ clipboard.
4. Nút **"Kết nối và tiếp tục"** — còn mờ (không bấm được) cho tới khi bạn nhập token.

> Nếu bạn vẫn còn phiên đăng nhập cũ (trong 30 ngày), hệ thống đưa thẳng vào Bảng công việc mà không cần đăng nhập lại.

### Bước 2 — Lấy token Jira (nếu chưa có)

Bấm nút **"Cách lấy token?"** trên trang đăng nhập. Hộp thoại hướng dẫn hiện ra với 4 bước:

![Hộp thoại hướng dẫn tạo token](images/02-hop-thoai-cach-lay-token.png)

1. **Mở hồ sơ cá nhân trên Jira**: Đăng nhập Jira → bấm **Avatar** ở góc trên bên phải → chọn **Profile**.
2. **Vào mục Personal Access Tokens**: Ở menu bên trái trang Profile, chọn **Personal Access Tokens**.
3. **Tạo token mới**: Bấm **Create token** → đặt tên (ví dụ: `Team Task Web`) → chọn thời hạn → bấm **Create**.
4. **Sao chép & dán vào hệ thống**: Copy mã token vừa xuất hiện và dán vào ô trên trang đăng nhập.

> ⚠️ **Lưu ý quan trọng**: Token **chỉ hiển thị đúng 1 lần duy nhất** ngay khi tạo. Nếu lỡ đóng màn hình mà chưa copy, hãy thu hồi (revoke) token cũ và tạo token mới.
>
> Tham khảo thêm: [Tài liệu chính thức của Atlassian về Personal Access Tokens](https://confluence.atlassian.com/enterprise/using-personal-access-tokens-1026032365.html).

### Bước 3 — Dán token và kết nối

1. Dán token vào ô **Jira Personal Access Token (PAT)** (dùng `Ctrl+V`, hoặc bấm nút **"Dán"**).
2. Token hiển thị dưới dạng che khuất (●●●●) để bảo mật. Có thể bấm **icon con mắt** 👁 bên phải ô nhập nếu muốn xem lại token.
3. Nút **"Kết nối và tiếp tục"** sáng lên → bấm để đăng nhập.

![Nhập token vào ô PAT](images/03-nhap-token.png)

### Bước 4 — Hoàn tất đăng nhập

Hệ thống xác thực token với Jira trong vài giây, sau đó tự động chuyển vào **Bảng công việc** — màn hình chính của hệ thống:

![Bảng công việc sau khi đăng nhập](images/04-dang-nhap-thanh-cong.png)

Từ đây bạn có thể sử dụng các chức năng chính qua menu bên trái:

| Nhóm | Chức năng | Mô tả ngắn |
| --- | --- | --- |
| Công việc | Việc của tôi | Nhiệm vụ được giao, task cần duyệt/test, hạn chót, năng suất cá nhân |
| Công việc | Bảng công việc | Bảng Kanban theo dự án (CICM, EPM, MR, EPB): kéo thẻ, lọc, tìm kiếm, tạo task |
| Công việc | Task cần xử lý | Task thiếu dữ liệu chuẩn hoặc vượt SLA cần tháo gỡ |
| Công việc | Task theo dõi | Các task bạn theo dõi, nhận thông báo khi có thay đổi |
| Công việc | Thông báo | Trung tâm thông báo: trao đổi Jira, phát hành, sự cố, cảnh báo SLA |
| Delivery | Lỗi Sentry | Theo dõi lỗi Sentry và chuyển thành task Jira |
| Delivery | Cập nhật hàng loạt | Sửa/nhiều task cùng lúc theo 3 bước có xem trước |
| Delivery | Quản lý phát hành | Theo dõi Fix Version Jira và trạng thái merge từ Bitbucket |
| Delivery | Nhánh & Delivery | Quản lý nhánh Git, liên kết Pull Request với task |
| Phân tích | Báo cáo dự án | Báo cáo tuần/tháng, rủi ro và tiến độ dự án |
| Phân tích | Xếp hạng | Bảng xếp hạng năng suất theo Story Point |
| Tài liệu | Tài liệu & Guide | Các hướng dẫn cấu hình có sẵn của hệ thống |
| Hệ thống | Quản trị / Cài đặt | Quản trị hệ thống (Admin) và cài đặt cá nhân |

> 💡 Cuối menu trái có thể chuyển **giao diện Sáng / Tối / Theo hệ thống** tuỳ sở thích.

*(Chi tiết từng chức năng sẽ được trình bày trong các phần tiếp theo của bộ tài liệu.)*

## 4. Các lần truy cập sau

- Trong **30 ngày** kể từ lần đăng nhập, bạn chỉ cần mở địa chỉ **https://jira.kieuanhdev.id.vn/** — hệ thống tự đưa bạn vào Bảng công việc, không cần nhập lại token.
- Sau 30 ngày, phiên hết hạn và trang Đăng nhập xuất hiện lại — thực hiện lại các bước ở mục 3.
> Hiện tại hệ thống chưa có nút "Đăng xuất" trên giao diện chính. Nếu cần kết thúc phiên ngay (ví dụ dùng máy chung), truy cập địa chỉ **https://jira.kieuanhdev.id.vn/api/auth/signout** và bấm **Sign out**.

## 5. Xử lý sự cố thường gặp

### 5.1. Báo "Token Jira không chính xác hoặc không có quyền truy cập"

![Thông báo lỗi khi nhập sai token](images/05-loi-sai-token.png)

Nguyên nhân và cách xử lý:

| Nguyên nhân | Cách xử lý |
| --- | --- |
| Token bị copy thiếu/thừa ký tự | Copy lại toàn bộ token (dán vào Notepad để kiểm tra) rồi dán lại |
| Token đã hết thời hạn | Vào Jira → Profile → Personal Access Tokens → tạo token mới |
| Token đã bị thu hồi (revoke) | Tạo token mới và đăng nhập lại |
| Token của hệ thống Jira khác | Đảm bảo dùng PAT tạo trên Jira Data Center nội bộ của công ty |

### 5.2. Nút "Kết nối và tiếp tục" bị mờ, không bấm được

→ Ô token đang trống. Dán token vào ô, nút sẽ sáng lên tự động.

### 5.3. Lỡ làm mất token (chưa kịp copy)

→ Token chỉ hiển thị 1 lần khi tạo. Hãy vào Jira → Profile → Personal Access Tokens, thu hồi token cũ (nếu cần) và tạo token mới.

### 5.4. Muốn đăng nhập bằng tài khoản Jira khác

→ Kết thúc phiên hiện tại (xem mục 4) rồi đăng nhập bằng token của tài khoản mới.

---

*Tài liệu này được viết dựa trên giao diện thực tế của hệ thống (ảnh chụp màn hình thật, chế độ Sáng). Gặp vướng mắc khi đăng nhập, liên hệ quản trị viên hệ thống.*
