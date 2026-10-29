# Workspace Nhánh & Delivery — Hướng dẫn sử dụng

**Tài liệu hướng dẫn sử dụng Team Task Web — Phần 7: Quản lý nhánh Git và duyệt gợi ý liên kết theo Jira Task**

| Thông tin | Giá trị |
| --- | --- |
| Hệ thống | Team Task Web — https://jira.kieuanhdev.id.vn/ |
| Trang chức năng | **Nhánh & Delivery** (menu Delivery → Nhánh & Delivery) |
| Địa chỉ trực tiếp | https://jira.kieuanhdev.id.vn/branches |
| Đối tượng | Toàn bộ thành viên có liên quan đến code (dev, reviewer, leader) |
| Phiên bản tài liệu | 1.0 — Cập nhật 25/10/2026 |

---

## 1. Trang này dùng để làm gì?

**Workspace Nhánh & Delivery** là nơi theo dõi **tiến độ phân phối phần mềm (delivery) theo từng Jira Task**:

- Task nào **đã có nhánh Git** trên Bitbucket, nhánh nào.
- Nhánh đó **đã có Pull Request chưa**, PR đã **merge** hay đang mở/từ chối.
- Hệ thống **tự động dò và gợi ý liên kết** giữa nhánh Git và task Jira (kèm độ tin cậy) — bạn chỉ cần duyệt.

> 💡 Trang này là "cầu nối" giữa Jira và Bitbucket. Nó nuôi dữ liệu cho **Quản lý phát hành** (chỉ số "Tiến độ Git Delivery" trên trang Release lấy từ các trạng thái nhánh/PR ở đây) và cho chức năng **cảnh báo merge trái phép** của Leader.

## 2. Tổng quan giao diện

Vào **menu Delivery → Nhánh & Delivery** (hoặc mở `/branches`):

![Tổng quan Workspace Nhánh & Delivery](images/branch-01-tong-quan.png)

| Thành phần | Chức năng |
| --- | --- |
| **Đồng bộ Bitbucket** (góc phải) | Kéo dữ liệu nhánh/PR mới nhất từ Bitbucket về |
| 5 tab nhóm công việc (xem mục 3) | Lọc danh sách theo trạng thái liên kết |
| **Ô tìm kiếm** | Tìm theo tên nhánh, mã task, tên repository (mẹo: gõ `/` để focus nhanh) |
| 3 bộ lọc | Lọc theo **dự án**, theo **repository**, theo **trạng thái PR** |

## 3. Năm tab nhóm công việc

| Tab | Ý nghĩa |
| --- | --- |
| **Công việc của tôi** | Các task có liên quan đến bạn (phụ trách, gán nhánh...) — mặc định khi vào trang |
| **Cần xử lý** | Task có **tình trạng bất thường** cần bạn hành động (vd: task Done nhưng PR vẫn mở) |
| **Chờ xác nhận** | Các **gợi ý liên kết nhánh ↔ task** do hệ thống tự dò, đang chờ bạn duyệt |
| **Chưa liên kết** | Nhánh Git tồn tại nhưng chưa gắn với task Jira nào (số lượng lớn là bình thường — bao gồm nhánh cũ, nhánh kỹ thuật) |
| **Tất cả branch** | Toàn bộ nhánh đã được hệ thống ghi nhận |

## 4. Đọc một thẻ task và các nhánh liên kết

Mỗi task là một thẻ:

- **Mã task** (vd `MR-26`) — bấm để mở chi tiết task trong hệ thống; icon mở trang Jira gốc.
- **Trạng thái Jira** (vd `Done Test`), **người phụ trách**, **Story Points**.
- **Nhãn tổng quan**: số nhánh (`1 branch`), số PR đang mở (`1 open`), số đã merge (`2 merged`), và nhãn trạng thái (**Cần chú ý**...).
- **Khối cảnh báo + Next action**: hệ thống phân tích tình huống và gợi ý việc cần làm ngay, ví dụ:
  - *"Task is Done but PR is still open"* → Next action: *"Mở PR hoặc kiểm tra lại trạng thái task"*.
- **Danh sách "CÁC NHÁNH LIÊN KẾT"**: từng nhánh hiển thị repository (vd `SMA/sds_picker`), tên nhánh, mô tả commit gần nhất, và trạng thái PR:
  - `PR OPEN` (đang chờ merge) — kèm link **PR #n**.
  - `MERGED` (đã hợp nhất) / `DECLINED` (PR bị từ chối).
  - `Chưa có PR` — nhánh tồn tại nhưng chưa mở Pull Request.
  - Link **Xem Git** — mở nhánh trên Bitbucket.
- **Nút thao tác trên thẻ**:
  - **Tạo PR hàng loạt** — mở PR cho mọi nhánh của task chưa có PR.
  - **Gắn nhánh** — tạo nhánh mới/liên kết nhánh với task.
  - **Mở chi tiết Jira Task & Quản lý nhánh** — vào trang chi tiết task để thao tác sâu hơn.

> 💡 **Trạng thái PR là "ngôn ngữ" của trang**: một task được coi là *sẵn sàng delivery* khi toàn bộ nhánh của nó ở trạng thái MERGED. Nhìn nhãn trên thẻ là biết ngay task còn nợ gì.

## 5. Tab "Cần xử lý" — việc gì cần làm ngay

![Tab Cần xử lý](images/branch-03-can-xu-ly.png)

Gom các task có tình huống lệch chuẩn, ví dụ điển hình:

| Tình huống | Next action |
| --- | --- |
| Task Done nhưng PR vẫn mở | Mở PR hoặc kiểm tra lại trạng thái task |
| PR bị **DECLINED** | Sửa code, mở PR mới hoặc trao đổi với reviewer |
| Task Done Test nhưng chưa có nhánh nào | Gán nhánh cho task |

Mỗi thẻ vẫn giữ nguyên các nhánh liên kết bên dưới để xử lý ngay tại chỗ.

## 6. Tab "Chờ xác nhận" — duyệt gợi ý liên kết tự động

![Tab Chờ xác nhận với gợi ý liên kết AI](images/branch-02-cho-xac-nhan.png)

Hệ thống liên tục dò các nhánh/PR mới trên Bitbucket và **đoán xem nhánh này thuộc task Jira nào**, dựa trên mã task trong tên nhánh hoặc tiêu đề PR:

- Mỗi gợi ý hiển thị: **repository + tên nhánh**, **Độ tin cậy** (vd: 90%), **gợi ý liên kết tới** mã task (vd `FIREBASE-4367`), và **dẫn chứng** (trích tiêu đề PR).
- 4 nút quyết định cho từng gợi ý:

| Nút | Tác dụng |
| --- | --- |
| **Xác nhận** (xanh) | Gắn nhánh này cho task trong hệ thống (chỉ ghi liên kết, **không ghi đè lên Jira/Git**) |
| **Từ chối** (đỏ) | Bỏ qua gợi ý này |
| **Đổi task** | Gợi ý sai task — chọn task đúng để thay |
| **Xem Git** | Mở nhánh trên Bitbucket để kiểm chứng trước khi quyết |

- Nút **"Gắn tất cả (N)"** ở banner trên cùng — duyệt hàng loạt toàn bộ gợi ý có độ tin cậy đủ cao.

> ⚠️ Gợi ý có độ tin cậy thấp (tên nhánh mơ hồ) nên **kiểm tra bằng "Xem Git"** trước khi xác nhận, tránh gắn sai nhánh vào task.

## 7. Quy trình gợi ý sử dụng

1. **Hằng ngày (dev)**: mở tab **Công việc của tôi** → kiểm tra task của mình có cảnh báo gì không → bấm **Gắn nhánh** khi bắt đầu code mới, **Tạo PR hàng loạt** khi code xong.
2. **Sau khi code được test**: theo dõi trạng thái PR — PR đang `OPEN` cần nhắc reviewer; bị `DECLINED` thì sửa và mở PR mới.
3. **Hằng ngày (leader/reviewer)**: duyệt tab **Chờ xác nhận** để hệ thống nắm đúng liên kết nhánh↔task (số liệu Git Delivery ở trang Quản lý phát hành phụ thuộc vào đây).
4. **Trước release**: lọc **Cần xử lý** của dự án — xử lý hết các cảnh báo để task đạt chuẩn "Done & merged".

## 8. Xử lý sự cố thường gặp

| Hiện tượng | Nguyên nhân & cách xử lý |
| --- | --- |
| Nhánh mới tạo chưa xuất hiện | Dữ liệu Bitbucket đồng bộ định kỳ — bấm **Đồng bộ Bitbucket** để kéo ngay. |
| Gợi ý liên kết sai task | Bấm **Đổi task** để chọn đúng, hoặc **Từ chối** nếu không liên quan. |
| Task Done rồi mà vẫn bị cảnh báo PR mở | PR thực sự chưa được merge trên Bitbucket — vào link **PR #n** kiểm tra; nếu đã merge mà hệ thống chưa cập nhật, bấm **Đồng bộ Bitbucket**. |
| Không tìm thấy task của mình | Chuyển tab phù hợp (Công việc của tôi / Tất cả branch), kiểm tra bộ lọc dự án/repository, hoặc dùng ô tìm kiếm theo mã task. |
| "Chưa liên kết" quá nhiều (hàng nghìn) | Bình thường — gồm cả nhánh lịch sử/kỹ thuật. Không cần xử lý hết; chỉ quan tâm các nhánh của task đang hoạt động. |
| Nút "Gắn nhánh" báo lỗi | Cần **token Bitbucket hợp lệ** trong Cài đặt (mục Tích hợp cá nhân). Xem hướng dẫn cấu hình ở trang Tài liệu & Guide. |

---

*Tài liệu viết dựa trên giao diện thực tế của hệ thống (ảnh chụp ở chế độ Sáng tại thời điểm 25/10/2026). Trong quá trình viết, hệ thống chỉ được xem và chuyển tab — không duyệt/từ chối gợi ý nào, không gắn nhánh nào.*
