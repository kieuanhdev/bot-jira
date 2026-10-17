# Hướng dẫn kết nối Sentry với hệ thống Jira nội bộ

Dành cho người quản lý/giám sát Sentry. Sau khi làm xong, mỗi lỗi **mới** trên
Sentry sẽ tự chuyển về hệ thống `https://jira.kieuanhdev.id.vn/`, chờ duyệt rồi
tạo task Jira cho đội xử lý.

Bạn **không cần** cài thêm gì vào code của các dự án. Chỉ cần thao tác trên
Sentry và gửi lại cho người triển khai 2 thông tin (mục 4).

## 1. Luồng hoạt động

```
Sentry có lỗi mới
   → gửi webhook tới https://jira.kieuanhdev.id.vn/api/webhooks/sentry
   → hệ thống kiểm tra chữ ký (chống giả mạo) và ghi nhận lỗi
   → admin vào https://jira.kieuanhdev.id.vn/admin/sentry để duyệt
   → trong tối đa 5 phút, hệ thống tạo task Jira: "[Sentry] <mã lỗi>: <tiêu đề>"
```

- Chỉ lỗi **mới phát sinh** sau khi kết nối mới được gửi sang. Lỗi cũ không tự vào.
- Lỗi thuộc dự án chưa được map với project Jira sẽ bị bỏ qua (trạng thái `ignored`).
- Lỗi có mức độ `fatal` còn gửi thêm thông báo "Lỗi Sentry chặn phát hành".

## 2. Việc bạn cần làm trên Sentry

Tạo **một** integration duy nhất, không tạo riêng cho từng dự án, vì hệ thống
chỉ nhận một khóa bí mật duy nhất.

**Giai đoạn chạy thử (1 dự án):** vẫn tạo integration như bình thường, nhưng ở
mục 3 chỉ khai báo **một** dự án thử nghiệm. Webhook của Sentry gửi lỗi của mọi
dự án trong organization, nhưng hệ thống chỉ tạo task cho dự án có trong bảng
map. Các dự án còn lại bị bỏ qua (trạng thái `ignored`), không sinh task.

Khi chạy chính thức, chỉ cần thêm các dự án khác vào bảng map. Không phải tạo
lại integration hay đổi secret.

1. Đăng nhập Sentry bằng tài khoản có quyền Owner/Manager của organization.
2. Vào **Settings → Developer Settings** (tên menu có thể hơi khác tùy phiên bản).
3. Chọn **Create New Integration → Internal Integration**.
4. Điền:
   - **Name:** `Jira Task Bridge` (hoặc tên bất kỳ dễ nhận biết).
   - **Webhook URL:** `https://jira.kieuanhdev.id.vn/api/webhooks/sentry`
   - **Permissions:** `Issue & Event` = **Read**; `Project` = **Read**.
   - **Webhooks:** tick resource **issue**.
5. Bấm **Save Changes**.
6. Mở lại integration vừa tạo, sao chép **Client Secret**. Đây là khóa ký
   webhook, coi như mật khẩu.

## 3. Lấy danh sách dự án (slug)

Mỗi dự án Sentry có một **slug**, nằm trong đường dẫn:
`https://sentry.io/organizations/<org>/projects/<slug>/`

Lập bảng cho người triển khai, ví dụ:

| Slug dự án Sentry | Project Jira nhận task |
|-------------------|------------------------|
| `mobile-app`      | `EPM`                  |
| `employee-app`    | `MHRM`                 |

Chỉ dự án nằm trong bảng này mới sinh task.

## 4. Thông tin cần gửi lại cho người triển khai

1. **Client Secret** của integration. Gửi qua kênh an toàn (trình quản lý mật
   khẩu hoặc tin nhắn riêng). **Không** dán vào email, nhóm chat chung hay ticket.
2. **Bảng slug → project Jira** ở mục 3.

Người triển khai sẽ đặt vào cấu hình của hệ thống:

```
SENTRY_WEBHOOK_SECRET=<Client Secret>
SENTRY_PROJECT_MAPPINGS=mobile-app:EPM,employee-app:MHRM
```

và khởi động lại hai service `web` và `worker`.

## 5. Kiểm tra sau khi kết nối

1. Mở `https://jira.kieuanhdev.id.vn/api/webhooks/sentry` trong trình duyệt.
   Kết quả đúng: `{"ok":true,"source":"sentry"}`.
2. Tạo một lỗi thử trên dự án đã map (ví dụ gửi một exception test).
3. Vào `https://jira.kieuanhdev.id.vn/admin/sentry`, lỗi phải xuất hiện ở trạng
   thái chờ duyệt (`review`). Duyệt lỗi đó.
4. Chờ tối đa 5 phút, kiểm tra Jira đã có task `[Sentry] ...` trong project tương ứng.

## 6. Khi có sự cố

| Hiện tượng | Nguyên nhân thường gặp | Cách xử lý |
|---|---|---|
| Sentry báo webhook lỗi 401 | Client Secret trong hệ thống không khớp | Gửi lại secret đúng, người triển khai cập nhật và restart |
| Lỗi mới không xuất hiện ở `/admin/sentry` | Dự án chưa có trong bảng map, hoặc chưa kết nối webhook | Kiểm tra mục 3, 2 |
| Lỗi nằm ở trạng thái `ignored` | Slug chưa được map | Báo thêm mapping; chỉ áp dụng cho lỗi mới, không tự áp ngược cho lỗi đã ignored |
| Đã duyệt nhưng không có task Jira | Worker hoặc Jira hệ thống lỗi | Báo người triển khai kiểm tra `GET /api/admin/sentry-import` |

## 7. Thêm dự án Sentry mới sau này

Không cần tạo lại integration hay đổi secret. Chỉ cần gửi cho người triển khai
một dòng mapping mới (`slug:PROJECTKEY`) để họ thêm vào `SENTRY_PROJECT_MAPPINGS`
và restart.

## 8. Lưu ý bảo mật

- Nếu nghi ngờ lộ Client Secret: tạo lại secret trong integration, gửi giá trị
  mới cho người triển khai. Trong lúc chưa cập nhật, mọi webhook sẽ bị từ chối
  (đó là hành vi mong muốn, không mất dữ liệu cũ).
- Hệ thống chỉ nhận một secret. Nếu có nhiều organization Sentry khác nhau,
  hãy báo trước để người triển khai bổ sung hỗ trợ.
