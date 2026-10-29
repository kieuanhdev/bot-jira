# Chi tiết task (/issue) — Hướng dẫn sử dụng

**Tài liệu hướng dẫn sử dụng Team Task Web — Phần 10: Trang chi tiết task và quản lý task theo chiều sâu**

| Thông tin | Giá trị |
| --- | --- |
| Hệ thống | Team Task Web — https://jira.kieuanhdev.id.vn/ |
| Trang chức năng | **Chi tiết task** — địa chỉ dạng `https://jira.kieuanhdev.id.vn/issue/<MÃ TASK>` (vd: `/issue/MR-6`) |
| Cách mở | Bấm mã task từ Bảng công việc, Việc của tôi, Task theo dõi; nút **"Full detail"** trên quick panel; link từ Nhánh & Delivery |
| Đối tượng | Toàn bộ thành viên |
| Phiên bản tài liệu | 1.0 — Cập nhật 25/10/2026 |

---

## 1. Trang này dùng để làm gì?

Trang **Chi tiết task** là "hồ sơ đầy đủ" của một task Jira trong hệ thống — nơi bạn:

- Xem toàn bộ thông tin task: mô tả, trạng thái, người liên quan, điểm, hạn chót...
- **Sửa nhanh** các trường quan trọng ngay trên đầu trang.
- **Chuyển trạng thái** task qua mọi bước của workflow.
- Bình luận, ghi worklog, quản lý **nhánh Git/PR** gắn với task.
- Xem **phân tích AI** về task (chấm điểm, cảnh báo thiếu thông tin).

> 💡 Trang này được liên kết từ khắp nơi trong hệ thống: quick panel trên Bảng công việc (nút **"Full detail"**), các thẻ task ở Việc của tôi, Task theo dõi, Nhánh & Delivery...

## 2. Đọc phần đầu trang

![Tổng quan trang chi tiết task](images/issue-01-tong-quan.png)

**Dòng đầu** — các nhịp trạng thái: mã task (icon mở Jira gốc) · trạng thái (`In Progress`) · điểm (`8 điểm`) · cảnh báo (vd `blocked · 3 ngày` — task đang bị chặn 3 ngày).

**Hàng nút góc phải:**

| Nút | Chức năng |
| --- | --- |
| **Xem trên Jira** | Mở trang task gốc trên Jira Data Center |
| Link nhánh (vd `test-web-jira`) | Nhảy nhanh đến nhánh Git chính của task trên Bitbucket |
| **Theo dõi** | Bấm để Watch task — nhận thông báo khi có thay đổi/bình luận (chuyển thành "Bỏ theo dõi" khi đang watch) |
| **Chuyển sang…** | Đổi trạng thái task (xem mục 4) |

**Hàng nút giữa** — sửa nhanh trường:

- **Gán:** — đổi người phụ trách.
- **Priority** (Mức ưu tiên), **Points** (Story Points) — dropdown sửa trực tiếp.
- **Ghi thời gian** — mở form log worklog.
- **Tạo nhánh Git** — tạo nhánh Bitbucket từ task.

**Hàng chip**: **Fix Version** (phiên bản phát hành — thêm/gỡ bằng dấu ×) và **Nhãn** (labels — thêm/gỡ tương tự).

## 3. Tab "Chi tiết" — mô tả và thông tin task

Tab mặc định hiển thị **Mô tả** của task đúng định dạng từ Jira (tiêu đề mục, danh sách, in đậm...). Cuộn xuống dưới còn có các khối thông tin chi tiết (người liên quan, ngày tạo/cập nhật, trường tùy chỉnh...).

## 4. Chuyển trạng thái task

Bấm **"Chuyển sang…"** — menu liệt kê mọi trạng thái workflow cho phép:

![Menu Chuyển sang trạng thái](images/issue-06-chuyen-sang.png)

- Danh sách gồm các trạng thái như: To do, In Progress, Done Test, Plan, Waiting For Deploy, Reject, Rejected, Deploy...
- Bấm trạng thái đích là task được chuyển **ngay trên Jira**.
- Khác với kéo-thả trên Board (chỉ chuyển được cột liền kề theo workflow), menu này cho phép **chuyển trực tiếp đến trạng thái bất kỳ** được phép.

> ⚠️ Chuyển trạng thái là thay đổi thật — kiểm tra kỹ trước khi bấm, đặc biệt với task của người khác.

## 5. Tab "Phụ thuộc" — task bị chặn bởi task nào

![Tab Phụ thuộc](images/issue-02-tab-phu-thuoc.png)

- Liệt kê các task mà task này **bị chặn bởi** (liên kết "is blocked by" trên Jira).
- Nếu trống: *"Không có task phụ thuộc"*.
- Dùng để trả lời câu hỏi "việc này sao chưa làm được?" — kiểm tra việc tiền đề đã xong chưa.

## 6. Tab "Bình luận" — trao đổi trên task

![Tab Bình luận](images/issue-03-tab-binh-luan.png)

- **Ô soạn thảo** "Thêm bình luận lên Jira…" — viết xong bấm **"Bình luận"** để đăng (bình luận được đồng bộ lên Jira gốc).
- Danh sách bình luận theo thứ tự thời gian, hiển thị tác giả + thời điểm chính xác.
- Dùng để trao đổi yêu cầu, báo tiến độ, hỏi đáp ngay trên task thay vì tin nhắn riêng lẻ.

## 7. Tab "AI" — chấm điểm và gợi ý

![Tab AI — chấm điểm task](images/issue-04-tab-ai.png)

Hệ thống dùng AI đọc mô tả task và đưa ra:

- **Số điểm đề xuất** (vd: `5 điểm`) kèm **độ tin cậy** (vd: 65%) và mô hình AI sử dụng.
- **Lý giải**: phân tích độ phức tạp (số chế độ, số màn hình, khối lượng thiết kế...) và so sánh với task tương tự đã có điểm.
- **"Thông tin còn thiếu"**: cảnh báo những gì mô tả đang thiếu (vd: chưa có acceptance criteria, chưa nói dark mode...) — gợi ý để người viết mô tả bổ sung.

> 💡 Mẹo cho Reporter: trước khi ước lượng điểm, mở tab AI xem đề xuất và phần "Thông tin còn thiếu" — bổ sung đủ thông tin giúp team ước lượng chính xác hơn.

## 8. Tab "Nhánh" — nhánh Git và Pull Request của task

![Tab Nhánh](images/issue-05-tab-nhanh.png)

Bảng "Các nhánh liên quan" với các cột:

| Cột | Ý nghĩa |
| --- | --- |
| **Nhánh** | Tên nhánh + link mở trên Bitbucket |
| **Repository** | Repo chứa nhánh (vd `SMA/sds_picker`) |
| **Pull Request** | Số PR kèm trạng thái (`OPEN` / MERGED / DECLINED) |
| **Trạng thái** | Tình trạng nhánh trong hệ thống (vd `đang hoạt động`) |
| **Hoạt động** | Lần cập nhật gần nhất |

Nút tiện ích: **"Đồng bộ Jira"** (làm mới liên kết), **"Xem trong mục Nhánh →"** (nhảy sang trang Workspace Nhánh & Delivery).

> 💡 Đây chính là dữ liệu tạo nên chỉ số "Tiến độ Git Delivery" ở trang Quản lý phát hành — task được coi là delivery xong khi các nhánh của nó đã merge PR.

## 9. Quy trình gợi ý

1. **Nhận task mới**: mở chi tiết → đọc Mô tả → xem tab **AI** (điểm đề xuất + thông tin còn thiếu) → kiểm tra tab **Phụ thuộc** để biết việc tiền đề.
2. **Bắt đầu làm**: bấm **"Chuyển sang…"** → In Progress → **"Tạo nhánh Git"**.
3. **Trong lúc làm**: **Ghi thời gian** mỗi phiên làm việc; trao đổi qua tab **Bình luận**; task vướng thì thêm nhãn/impediment.
4. **Code xong**: chuyển sang READY FOR TEST; theo dõi tab **Nhánh** đến khi PR merge.
5. Muốn nhận thông báo: bấm **"Theo dõi"**.

## 10. Xử lý sự cố thường gặp

| Hiện tượng | Nguyên nhân & cách xử lý |
| --- | --- |
| Không bấm được "Chuyển sang…" hoặc thiếu trạng thái | Workflow Jira giới hạn các bước chuyển hợp lệ theo vai trò/trạng thái — xem trang Jira gốc qua "Xem trên Jira" để biết chi tiết. |
| Nhãn/Fix Version không lưu được | Cần quyền chỉnh sửa task trên Jira; kiểm tra bạn có phải Assignee/Reporter hoặc có quyền dự án. |
| Tab Nhánh trống dù đã tạo nhánh | Dữ liệu Bitbucket đồng bộ định kỳ — bấm **"Đồng bộ Jira"** trong tab; nếu vẫn trống, kiểm tra nhánh có chứa mã task trong tên không. |
| Điểm AI khác xa điểm team thống nhất | AI chỉ dựa trên mô tả — dùng nó làm tham chiếu, quyết định cuối thuộc về team (dùng phần "Thông tin còn thiếu" để cải thiện mô tả). |
| Bình luận không hiện ngay | Bình luận đồng bộ qua Jira — chờ vài giây rồi bấm chuyển tab qua lại để làm mới. |
| Muốn xem lịch sử thay đổi trường | Hiện tại xem trên Jira gốc (nút "Xem trên Jira" → tab History của Jira). |

---

*Tài liệu viết dựa trên giao diện thực tế của hệ thống (ảnh chụp ở chế độ Sáng tại thời điểm 25/10/2026, task minh họa: MR-6). Trong quá trình viết, trang chỉ được xem và mở menu — không sửa trường, không chuyển trạng thái, không đăng bình luận nào.*
