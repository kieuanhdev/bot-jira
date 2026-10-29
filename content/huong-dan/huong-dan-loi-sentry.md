# Lỗi Sentry — Hướng dẫn sử dụng

**Tài liệu hướng dẫn sử dụng Team Task Web — Phần 2: Theo dõi lỗi Sentry và chuyển thành task Jira**

| Thông tin | Giá trị |
| --- | --- |
| Hệ thống | Team Task Web — https://jira.kieuanhdev.id.vn/ |
| Trang chức năng | **Lỗi Sentry** (menu Delivery → Lỗi Sentry) |
| Địa chỉ trực tiếp | https://jira.kieuanhdev.id.vn/sentry |
| Yêu cầu | Đã đăng nhập; đã cấu hình token Sentry trong **Cài đặt** (xem "Hướng dẫn cấu hình" trên trang) |
| Phiên bản tài liệu | 1.0 — Cập nhật 24/10/2026 |

---

## 1. Trang này dùng để làm gì?

Trang **Lỗi Sentry** giúp nhóm:

- **Theo dõi** các lỗi (issue) đang xảy ra trên các ứng dụng được giám sát bởi Sentry nội bộ (`sentry.easypos.vn`), xếp theo mức độ nghiêm trọng.
- **Phân tích lỗi bằng AI**: hệ thống tự đọc code theo phiên bản của lỗi và đề xuất nguyên nhân + hướng sửa.
- **Chuyển lỗi thành task Jira** chỉ với vài cú bấm — task được tạo **bằng tài khoản cá nhân của bạn** (bạn là Reporter), kèm toàn bộ thông tin phân tích AI vào phần mô tả.

> 💡 Toàn bộ dữ liệu lỗi được hệ thống **tự đồng bộ từ Sentry mỗi 5 phút**, bạn không cần vào Sentry để kiểm tra thủ công.

## 2. Giao diện tổng quan

Vào **menu Delivery → Lỗi Sentry** (hoặc mở trực tiếp `/sentry`):

![Tổng quan trang Lỗi Sentry](images/sentry-01-tong-quan.png)

Giao diện chia thành các khu vực:

| Khu vực | Chức năng |
| --- | --- |
| Tab dự án (Tất cả / CICM / EPM / MR / EPB / "N đã chọn") | Chỉ xem lỗi của một hoặc vài dự án |
| Hàng thẻ thống kê trên (Nghiêm trọng, Đang tăng nóng, Mới 24h qua, Tỷ lệ nhiễu) | Bức tranh tổng thể về sức khỏe hệ thống; **bấm vào thẻ để lọc** theo tiêu chí đó |
| Hàng thẻ thống kê dưới (Chờ duyệt, Đang tạo, Đã tạo task, Đã bỏ qua, Lỗi, Chưa map dự án) | Trạng thái xử lý của từng lỗi; **bấm vào thẻ để lọc** danh sách bên dưới |
| Ô tìm kiếm + Sắp xếp | Tìm lỗi theo tiêu đề hoặc mã lỗi (vd: `MOB-1`); sắp xếp theo "Ưu tiên xử lý" hoặc "Gần đây nhất" |
| Bộ lọc (Phiên bản / Môi trường / Mức độ / Lần cuối xảy ra) | Thu hẹp danh sách lỗi theo điều kiện cụ thể |
| Tab "Cần xem xét / Có thể là nhiễu / Tất cả" | Lọc mức độ cần xử lý: chỉ lỗi đáng sửa, hay cả lỗi nhiễu (telemetry, info, expected) |
| Danh sách issue | Danh sách lỗi chi tiết kèm nút thao tác |

**Ý nghĩa các thẻ thống kê:**

- **Nghiêm trọng** — số issue lỗi (error/fatal) cần ưu tiên xử lý nhất.
- **Đang tăng nóng** — issue có tần suất xảy ra tăng nhanh gần đây.
- **Mới 24h qua** — số issue mới phát sinh trong 24 giờ (kèm số 7 ngày và biểu đồ xu hướng).
- **Tỷ lệ nhiễu** — phần trăm issue là nhiễu (telemetry, info, expected), không cần sửa.
- **Chờ duyệt** — lỗi đã đồng bộ, đang chờ bạn quyết định (tạo task hoặc bỏ qua).
- **Đang tạo** — lỗi đang trong quá trình tạo task.
- **Đã tạo task** — lỗi đã được chuyển thành task Jira.
- **Đã bỏ qua** — lỗi bạn đánh dấu là không cần xử lý.
- **Lỗi** — các issue gặp lỗi khi tạo task.
- **Chưa map dự án** — lỗi thuộc dự án Sentry chưa được ánh xạ sang dự án Jira (cần cấu hình ở Cài đặt, vd: `mobile-app:EPM`).

## 3. Đọc thông tin một dòng lỗi

Cuộn xuống danh sách issue:

![Danh sách lỗi Sentry](images/sentry-02-danh-sach-loi.png)

Mỗi dòng lỗi gồm:

| Thành phần | Ý nghĩa |
| --- | --- |
| Badge màu (ERROR / FATAL / ...) | Mức độ nghiêm trọng của lỗi — FATAL/ERROR đỏ xếp trước |
| Tiêu đề lỗi | Tên exception và thông điệp lỗi (vd: `TypeError: type 'Null' is not a subtype...`) |
| Mã issue (vd `EASY-HRM-5A`) | Mã trên Sentry — bấm để mở trang gốc trên Sentry |
| `easy-hrm → MHRM` | Dự án Sentry → dự án Jira được ánh xạ |
| Số lần xảy ra | Tổng số lần lỗi xuất hiện — càng nhiều càng nghiêm trọng |
| Lần cuối xảy ra | Thời gian gần nhất lỗi xuất hiện |
| Phiên bản phát hành (vd `vn.softdreams.easyhrm@4.10.2+124`) | Bản build app gây ra lỗi |
| Môi trường (vd `production`) | Môi trường xảy ra lỗi |
| Số người dùng bị ảnh hưởng | Quy mô tác động tới người dùng cuối |

Mỗi dòng có 3 nút thao tác bên phải: **Chi tiết** (👁), **Tạo task**, **Bỏ qua**.

> 💡 Đầu danh sách có ô tick **"Chọn tất cả issue đang hiển thị trên trang này"** và mỗi issue có ô chọn riêng ở đầu dòng — dùng khi cần đánh dấu nhiều issue để xử lý cùng lúc thay vì bấm từng nút theo dòng.

## 4. Xem chi tiết và phân tích lỗi (bằng AI)

Bấm **Chi tiết** trên một dòng lỗi — khung bên phải hiện ra:

![Khung chi tiết lỗi với phân tích AI](images/sentry-03-chi-tiet-loi.png)

Khung chi tiết gồm:

1. **Thông tin tổng quan**: mức độ, phiên bản, môi trường, số lần xảy ra, số người dùng bị ảnh hưởng, lần đầu/lần cuối xuất hiện.
2. **Nguyên nhân & hướng sửa (AI)**: hệ thống dùng AI đọc code theo đúng phiên bản của lỗi và đưa ra:
   - **Luồng dẫn đến lỗi** — tái hiện chuỗi sự kiện gây lỗi từng bước.
   - **Nguyên nhân** — giải thích gốc rễ (kèm thư viện/tệp liên quan).
   - **File liên quan** — danh sách file + dòng nghi vấn.
   - **Hướng sửa** — các bước đề xuất khắc phục.
   - Nhãn **Độ tin cậy** (cao/trung bình/thấp) để bạn đánh giá mức độ tin tưởng.
   - Nút **Phân tích lại** nếu muốn AI chạy lại phân tích.
3. **Exception + Stack trace** — dấu vết lỗi trong code (thông tin nhạy cảm được che bằng `<redacted>`).
4. **Thẻ (tags)** — trình duyệt/thiết bị, hệ điều hành... của người dùng gặp lỗi.
5. Cuối khung có 3 nút: **Mở trên Sentry** (liên kết gốc), **Bỏ qua**, **Tạo task**.

> ⚠️ **Lưu ý**: Nội dung phân tích AI được sinh ra **dựa trên phiên bản của lỗi đó** và sẽ được chép vào mô tả task khi bạn tạo task. Đây là gợi ý — dev vẫn cần đọc và kiểm tra lại trước khi sửa.

## 5. Chuyển lỗi thành task Jira

Bấm **Tạo task** trên dòng lỗi (hoặc trong khung chi tiết). Dialog tạo task hiện ra với các trường **điền sẵn**:

![Dialog tạo task từ lỗi Sentry](images/sentry-04-tao-task.png)

| Trường | Giá trị mặc định | Bạn có thể chỉnh |
| --- | --- | --- |
| Tiêu đề | `[Sentry] <mã issue>: <tên lỗi>` | ✅ Nên viết lại ngắn gọn, rõ ý |
| Loại task | Bug | ✅ Task / Story / Bug... |
| Task cha / Epic | Trống | ✅ Gắn vào Epic nếu cần |
| Người thực hiện | Chưa gán | ✅ Chọn thành viên |
| Mức ưu tiên | Mặc định | ✅ |
| Nhãn | `sentry`, `sentry-id-<n>` (tự gắn để tránh tạo trùng) | Bị khóa, không xóa được |
| Story Points / Ước tính / Hạn hoàn thành / Phiên bản | Trống/Mặc định | ✅ |
| Mô tả (Description) | Tự sinh: link Sentry, level, số lần, thời gian + **toàn bộ phân tích AI** | ✅ Hỗ trợ Markdown/Jira markup, có nút "Khung AC" để chèn khung tiêu chí nghiệm thu |

Cuộn xuống dưới dialog là phần **Trường mở rộng (Custom Fields)**:

![Phần dưới dialog tạo task — trường Severity bắt buộc](images/sentry-05-tao-task-severity.png)

> ⚠️ **Severity là trường bắt buộc** — chưa chọn thì nút **Tạo task** không bấm được (hệ thống hiện cảnh báo "Thiếu trường bắt buộc: Severity" ở góc dưới).

**Thao tác:**

1. Rà lại tiêu đề (viết lại cho dễ hiểu nếu cần).
2. Chọn **Severity** (mức độ nghiêm trọng theo quy định dự án).
3. Gán người thực hiện, hạn hoàn thành nếu cần.
4. Bấm **Tạo task**.

**Sau khi tạo:**

- Task xuất hiện trên **Jira** với bạn là Reporter, mô tả chứa toàn bộ phân tích AI.
- Lỗi chuyển từ thẻ **Chờ duyệt** sang **Đã tạo task** — danh sách tự cập nhật.
- Task có nhãn `sentry-id-<n>` giúp hệ thống **chống tạo trùng**: cùng một lỗi Sentry sẽ không tạo được task thứ hai.

> 💡 Nút **AI tóm tắt lỗi** ở đầu dialog giúp tóm tắt ngắn lỗi nếu mô tả quá dài.

## 6. Bỏ qua lỗi

Với những lỗi không cần xử lý (nhiễu, lỗi của thư viện bên thứ ba, lỗi đã hết hạn sử dụng...):

- Bấm **Bỏ qua** trên dòng lỗi (hoặc trong khung chi tiết).
- Lỗi chuyển sang thẻ **Đã bỏ qua**, không còn xuất hiện trong tab "Cần xem xét".

Tab **"Có thể là nhiễu"** gom sẵn các lỗi hệ thống đánh dấu là telemetry/info/expected — nên duyệt tab này trước khi quyết định bỏ qua từng lỗi ở tab chính.

> 💡 Bỏ qua chỉ ảnh hưởng hiển thị trong Team Task Web, không thay đổi gì trên Sentry gốc. Muốn xử lý lại, mở tab "Tất cả" để tìm lại lỗi.

## 7. Quy trình gợi ý cho một phiên xử lý lỗi

1. Mở trang **Lỗi Sentry**, chọn tab dự án bạn phụ trách.
2. Xem thẻ **Nghiêm trọng** — xử lý các lỗi FATAL/ERROR nhiều lần xảy ra, ảnh hưởng nhiều người dùng trước.
3. Với mỗi lỗi đáng sửa: mở **Chi tiết** → đọc phân tích AI → bấm **Tạo task** → chọn **Severity** → tạo task.
4. Với lỗi nhiễu: kiểm tra tab **"Có thể là nhiễu"**, bấm **Bỏ qua** để dọn danh sách.
5. Theo dõi task trên **Bảng công việc** như task Jira bình thường.
6. Bấm **Làm mới** bất cứ lúc nào để kéo dữ liệu Sentry mới nhất về.

## 8. Xử lý sự cố thường gặp

| Hiện tượng | Nguyên nhân & cách xử lý |
| --- | --- |
| Trang báo chưa kết nối / không có dữ liệu | Chưa cấu hình Sentry ở **Cài đặt**: điền Organization slug, ánh xạ dự án (vd `mobile-app:EPM,employee-app:MHRM`) và Sentry token có quyền `project:read`, `event:read`. Xem link **"Hướng dẫn cấu hình"** trên đầu trang. |
| Lỗi nằm ở thẻ "Chưa map dự án" | Dự án Sentry chưa được ánh xạ sang dự án Jira — thêm dòng `slug:KEY` trong Cài đặt → phần Sentry. |
| Nút "Tạo task" bị mờ | Chưa chọn trường bắt buộc **Severity** ở phần Trường mở rộng trong dialog. |
| Không tìm thấy lỗi vừa thấy | Có thể lỗi đã bị chuyển trạng thái (đã tạo task/bỏ qua) — bấm thẻ trạng thái tương ứng hoặc tab "Tất cả". Dữ liệu cũng tự đồng bộ mỗi 5 phút. |
| Phân tích AI sai hoặc thiếu | AI chỉ đọc theo phiên bản của lỗi — bấm **Phân tích lại**; nếu vẫn sai, sửa trực tiếp phần mô tả trong dialog tạo task trước khi tạo. |
| Cần xem dấu vết lỗi đầy đủ | Bấm **Mở trên Sentry** để xem trang gốc với toàn bộ stack trace, breadcrumb, sự kiện gần nhất. |

---

*Tài liệu viết dựa trên giao diện thực tế của hệ thống (ảnh chụp ở chế độ Sáng, dữ liệu demo tại thời điểm 24/10/2026). Phần tiếp theo của bộ tài liệu: Bảng công việc (Board).*
