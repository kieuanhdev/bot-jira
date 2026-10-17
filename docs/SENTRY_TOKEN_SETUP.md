# Hướng dẫn kết nối Sentry bằng token cá nhân

Hệ thống: `https://jira.kieuanhdev.id.vn/`

Mỗi người tự nhập token Sentry của mình trên web. Hệ thống dùng token đó để lấy
các lỗi **chưa giải quyết** từ Sentry (mỗi 5 phút), đưa vào hàng chờ duyệt, rồi
tạo task Jira cho đội xử lý. Không cần quyền admin trên Sentry và không cần
cấu hình webhook.

Tài liệu gồm hai phần: **Phần A** cho người triển khai (làm một lần), **Phần B**
cho người dùng nhập token.

## Luồng hoạt động

```
Người dùng nhập org + dự án + token (Settings)
   → hệ thống kiểm tra token đọc được dự án, lưu mã hóa
   → mỗi 5 phút worker lấy lỗi chưa giải quyết từ Sentry
   → lỗi vào hàng chờ tại /admin/sentry
   → admin duyệt
   → hệ thống tạo task Jira: "[Sentry] <mã lỗi>: <tiêu đề>"
```

---

## Phần A. Dành cho người triển khai

### A1. Chạy migration cơ sở dữ liệu

Bản cập nhật thêm 5 cột vào bảng `User`. Chạy một lần trên môi trường cần dùng:

```
npm run db:deploy
```

Chưa chạy bước này thì tính năng không hoạt động. Migration nằm ở
`prisma/migrations/20261017090000_user_sentry_credentials/`.

### A2. Kiểm tra cấu hình `.env`

| Biến | Yêu cầu |
|------|---------|
| `CRED_ENCRYPTION_KEY` | Bắt buộc. Khóa mã hóa token cá nhân. Không đổi khi đã có người lưu token, vì đổi sẽ làm token cũ không đọc được |
| `JIRA_BASE_URL` và token Jira hệ thống | Bắt buộc. Worker dùng tài khoản Jira hệ thống để tạo task |
| `SENTRY_BASE_URL` | `https://sentry.io`, hoặc URL Sentry self-hosted. Người dùng không tự đổi được |
| `SENTRY_IMPORT_REQUIRE_APPROVAL` | Nên để `true` để admin duyệt trước khi tạo task |

Không cần `SENTRY_ORG`, `SENTRY_PROJECT`, `SENTRY_TOKEN`, `SENTRY_WEBHOOK_SECRET`
và `SENTRY_PROJECT_MAPPINGS` cho luồng này.

### A3. Triển khai

Build và deploy bản mới, rồi khởi động lại **cả hai** service `web` và `worker`.

### A4. Đảm bảo project Jira có trong danh mục

Khi lưu, hệ thống chỉ chấp nhận key Jira đã có trong danh mục project của hệ
thống. Điều này ngăn người dùng đẩy task vào project tùy ý. Nếu một project chưa
có, admin cần thêm vào danh mục trước.

### A5. Kiểm tra sau triển khai

1. Một người dùng nhập token theo Phần B.
2. Tạo một lỗi thử trên dự án Sentry đã khai báo.
3. Trong tối đa 5 phút, lỗi xuất hiện tại `https://jira.kieuanhdev.id.vn/admin/sentry`
   ở trạng thái chờ duyệt.
4. Admin duyệt. Tối đa 5 phút sau, task Jira được tạo.
5. Xem hàng thất bại bằng `GET /api/admin/sentry-import`.

---

## Phần B. Dành cho người dùng nhập token

### B1. Tạo token trên Sentry

1. Đăng nhập Sentry, vào phần cài đặt tài khoản và chọn **Personal Tokens**
   (tên menu có thể khác tùy phiên bản Sentry).
2. Tạo token mới, cấp tối thiểu hai quyền: `project:read` và `event:read`.
3. Sao chép token ngay vì Sentry chỉ hiển thị một lần.

Token này cho phép hệ thống đọc dữ liệu giống như bạn. Chỉ nhập vào trang web
của hệ thống, không gửi qua chat hay email.

### B2. Tìm thông tin cần nhập

- **Organization slug:** nằm trong đường dẫn Sentry,
  `https://sentry.io/organizations/<org>/...`.
- **Slug dự án Sentry:** nằm trong đường dẫn
  `https://sentry.io/organizations/<org>/projects/<slug>/`.
- **Key project Jira:** ví dụ `EPM`, `MHRM`.

### B3. Nhập trên web

Vào trang **Settings**, mục **Tích hợp cá nhân → Sentry** và điền:

| Ô | Ví dụ |
|---|-------|
| Organization slug | `my-org` |
| Dự án Sentry → project Jira | `mobile-app:EPM,employee-app:MHRM` |
| Sentry token | token vừa tạo |

Quy tắc ô thứ hai: mỗi cặp là `slug-sentry:KEYJIRA`, các cặp cách nhau bằng dấu
phẩy, tối đa 10 cặp. Nếu thử một dự án, chỉ nhập một cặp.

Bấm **Lưu & xác minh**. Hệ thống kiểm tra:
- Key Jira có trong danh mục của hệ thống.
- Token đọc được từng dự án Sentry.

Nếu sai, bạn nhận thông báo lỗi và cấu hình cũ (nếu có) được giữ nguyên.

### B4. Sửa hoặc ngắt kết nối

- Đổi org hoặc danh sách dự án: sửa ô tương ứng, để trống ô token để dùng lại
  token đã lưu, rồi lưu.
- Đổi token: dán token mới vào ô token rồi lưu.
- Ngắt kết nối: bấm **Ngắt kết nối** ở mục Sentry. Cấu hình và token bị xóa.

---

## Lưu ý

- **Lần chạy đầu** hệ thống lấy tối đa 25 lỗi chưa giải quyết mới nhất của mỗi
  dự án. Với `SENTRY_IMPORT_REQUIRE_APPROVAL=true`, chúng chờ admin duyệt, không
  tự tạo task hàng loạt.
- **Độ trễ:** tối đa khoảng 5 phút. Mỗi lần chỉ lấy 25 lỗi, nên dự án phát sinh
  rất nhiều lỗi cùng lúc có thể bị bỏ sót một phần.
- **Nhiều người cùng dự án:** mỗi cặp (org, dự án) chỉ được lấy một lần, và task
  vào project Jira theo cấu hình của người được dùng để lấy lỗi trước. Hãy
  thống nhất key Jira giữa những người cùng khai báo một dự án.
- **Gắn với người nhập:** nếu người nhập nghỉ việc hoặc bị đổi quyền trên
  Sentry, tích hợp của họ ngừng. Người khác nhập lại để thay thế.
- **Release gate và `/api/health`** vẫn chỉ xét token hệ thống, không xét token
  cá nhân.

## Xử lý sự cố

| Hiện tượng | Nguyên nhân thường gặp | Cách xử lý |
|------------|------------------------|------------|
| Không lưu được, báo "Project Jira ... chưa có trong danh mục" | Key Jira sai hoặc chưa được đăng ký | Kiểm tra key, nhờ admin thêm project |
| Báo "Không đọc được dự án Sentry ..." (401/403/404) | Token thiếu quyền, sai org hoặc sai slug | Kiểm tra quyền token, org slug, slug dự án |
| Settings hiện cảnh báo "Lần lấy lỗi gần nhất thất bại" | Token hết hạn hoặc bị thu hồi | Tạo token mới và nhập lại |
| Lỗi không xuất hiện ở `/admin/sentry` | Chưa quá 5 phút, hoặc worker không chạy | Chờ, kiểm tra service `worker` đang chạy |
| Đã duyệt nhưng không có task Jira | Jira hệ thống hoặc worker lỗi | Xem `GET /api/admin/sentry-import`, kiểm tra Jira hệ thống |
| Mọi token cũ báo lỗi sau khi đổi cấu hình | `CRED_ENCRYPTION_KEY` bị đổi | Khôi phục khóa cũ, hoặc để mọi người nhập lại token |
