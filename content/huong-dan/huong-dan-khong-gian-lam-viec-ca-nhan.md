# Không gian làm việc cá nhân (Việc của tôi) — Hướng dẫn sử dụng

**Tài liệu hướng dẫn sử dụng Team Task Web — Phần 3: Không gian làm việc cá nhân**

| Thông tin | Giá trị |
| --- | --- |
| Hệ thống | Team Task Web — https://jira.kieuanhdev.id.vn/ |
| Trang chức năng | **Việc của tôi** (menu Công việc → Việc của tôi) |
| Địa chỉ trực tiếp | https://jira.kieuanhdev.id.vn/my-work |
| Đối tượng | Toàn bộ thành viên |
| Phiên bản tài liệu | 1.0 — Cập nhật 25/10/2026 |

---

## 1. Trang này dùng để làm gì?

**Không gian làm việc cá nhân** là "trạm điều khiển" của riêng bạn, gom về một chỗ:

- Toàn bộ **nhiệm vụ được giao** (kể cả task quá hạn, đang làm).
- Các task **chờ bạn Review hoặc Test**.
- **Lộ trình hạn chót** trong 14 ngày tới.
- **Biểu đồ phân tích năng suất** cá nhân và lịch sử hoạt động.

> 💡 Trang tổng hợp dữ liệu từ nhiều nguồn (Jira, phân tích hệ thống). Nếu số liệu có vẻ cũ, bấm nút **Làm mới** ở góc trên bên phải.

## 2. Tổng quan giao diện

Vào **menu Công việc → Việc của tôi** (hoặc mở trực tiếp `/my-work`):

![Tổng quan Không gian làm việc cá nhân](images/mywork-01-tong-quan.png)

### 2.1. Bốn thẻ thống kê đầu trang

| Thẻ | Ý nghĩa |
| --- | --- |
| **Nhiệm vụ được giao** | Tổng task đang phụ trách. Kèm số **quá hạn** (màu đỏ) và **đang làm**. Bấm vào thẻ để nhảy nhanh danh sách. |
| **Cần tôi xử lý (Review/QA)** | Số task đang **chờ bạn duyệt code hoặc test** — không phản hồi kịp sẽ làm chặn luồng của đồng nghiệp. |
| **Hoàn thành gần đây** | Số task đã xong trong **7 ngày qua**, kèm tỷ lệ **Đúng hạn** — thước đo kỷ luật deadline của bạn. |
| **Tiến độ Release hiện tại** | Thanh tiến độ của phiên bản phát hành hiện tại (vd: `5.10.1` — 1/2 task). Cho biết bạn đang góp phần vào release nào. |

## 3. Tab "Nhiệm vụ của tôi" — quản lý công việc hằng ngày

Đây là tab mặc định, gồm 3 lớp bộ lọc và danh sách nhiệm vụ:

![Danh sách nhiệm vụ của tôi](images/mywork-02-danh-sach-nhiem-vu.png)

### 3.1. Bộ lọc vai trò (hàng chip xanh)

| Chip | Hiển thị task nào |
| --- | --- |
| **Được giao cho tôi** (mặc định) | Task có bạn là Người phụ trách (Assignee) |
| **Chờ tôi Review** | Task đang chờ bạn duyệt code/PR |
| **Chờ tôi Test** | Task đang chờ bạn kiểm thử |
| **Tôi báo cáo** | Task bạn là người tạo (Reporter) — theo dõi tiến độ xử lý giúp bạn |
| **Đang theo dõi** | Task bạn bấm theo dõi (Watching) để nhận thông báo |

### 3.2. Bộ lọc trạng thái (hàng pill) + ô tìm kiếm

- **Đang xử lý** (mặc định) — task chưa xong, ưu tiên hàng đầu.
- **Tất cả** — toàn bộ task theo bộ lọc vai trò đang chọn.
- **Đã hoàn thành** — task đã xong (dùng để tra cứu lại).
- **Ô tìm kiếm** — gõ mã task (vd `MR-32`) hoặc từ khóa trong tiêu đề để lọc tức thì.

### 3.3. Đọc thông tin một thẻ nhiệm vụ

Mỗi thẻ task hiển thị:

- **Mã task + icon mở Jira** (vd `MHRM-1079`) — bấm vào để mở trang chi tiết task trong hệ thống.
- **Loại task** (Bug / Task...) và **mức ưu tiên** (High / Medium...).
- Nhãn vai trò như **Watching** nếu bạn theo dõi task đó.
- **Tiêu đề** công việc.
- **Hạn hoàn thành** — hiện màu đỏ kèm biểu tượng lịch khi **quá hạn** (vd: `Quá hạn: 8/10/2026`), giờ đã log (worklog) nếu có.
- **Trạng thái Jira** (vd `READY FOR TEST`, `Waiting For Deploy`) ở góc phải.
- **Story Points** (vd `13 points`) nếu task có ước lượng độ phức tạp.

> 💡 Thẻ task quá hạn được viền đỏ nổi bật — nên xử lý chúng trước khi nhận việc mới.

## 4. Tab "Hiệu suất cá nhân" — đo năng suất

Bấm tab **Hiệu suất cá nhân** để xem phân tích:

![Biểu đồ hiệu suất cá nhân](images/mywork-03-hieu-suat.png)

| Thành phần | Ý nghĩa |
| --- | --- |
| **Personal Velocity** (biểu đồ cột 8 tuần) | Số **Story Points tích lũy** và **số Task hoàn thành** theo từng tuần (W36 → W43). Dùng để tự đánh giá nhịp làm việc, so sánh giữa các tuần. |
| **Cycle Time trung bình** | Thời gian trung bình từ lúc task chuyển sang **Đang làm (In Progress)** đến khi **Hoàn thành (Done)** — đo tốc độ thực thi. |
| **Lead Time trung bình** | Tổng thời gian từ khi task được **tạo** đến khi **bàn giao xong** — bao gồm cả thời gian chờ trong hàng đợi. |
| **Phân bổ công việc theo loại** | Biểu đồ tròn tỉ lệ Task / Bug / Story... bạn đã làm. |

> 💡 Nếu **Cycle Time thấp nhưng Lead Time cao** → task của bạn chờ lâu trước khi bắt đầu (chờ review, chờ duyệt, chờ xử lý đầu vào). Căn cứ đó để trao đổi với Leader về thứ tự ưu tiên.

## 5. Tab "Lộ trình Timeline" — lộ trình hạn chót

Bấm tab **Lộ trình Timeline**:

![Lộ trình hạn chót Timeline](images/mywork-04-timeline.png)

- Hiển thị các nhiệm vụ có hạn chót trong **14 ngày tới**, nhóm theo mốc thời gian để dễ xếp thứ tự ưu tiên:
  - **QUÁ HẠN** (viền đỏ) — cần xử lý ngay lập tức.
  - Các nhóm theo ngày/đến hạn gần.
  - **CHƯA CÓ HẠN** — task chưa đặt deadline.
- Mỗi dòng giữ nguyên thông tin thẻ task (mã, loại, ưu tiên, trạng thái, points) kèm **ngày hạn** bên phải.

> 💡 Mẹo: bắt đầu ngày làm việc bằng tab này để trả lời câu hỏi "hôm nay và tuần này cần xong gì trước?".

## 6. Tab "Hoạt động gần đây" — nhật ký phiên làm việc

Bấm tab **Hoạt động gần đây**:

![Nhật ký hoạt động gần đây](images/mywork-05-hoat-dong.png)

- Ghi lại **các thao tác và truy cập gần đây của chính bạn** trong phiên làm việc (mở trang nào, lúc nào), hiển thị tối đa **25 sự kiện gần nhất**.
- Dùng để tra cứu lại "lúc nãy mình đang xem task nào", hoặc tự kiểm tra thao tác đã thực hiện.

## 7. Quy trình gợi ý sử dụng hằng ngày

1. **Đầu ngày**: mở **Việc của tôi** → nhìn 4 thẻ thống kê → ưu tiên mục **Nhiệm vụ được giao** có "quá hạn".
2. Xem tab **Lộ trình Timeline** để xếp việc theo hạn chót 14 ngày tới.
3. Kiểm tra thẻ **Cần tôi xử lý (Review/QA)** — trả lời review/test sớm để không chặn đồng nghiệp.
4. Trong ngày: làm việc trên **Bảng công việc**; task mới được giao sẽ tự xuất hiện lại ở đây (bấm **Làm mới** nếu cần).
5. **Cuối tuần**: xem tab **Hiệu suất cá nhân** để đánh giá Velocity và tỷ lệ đúng hạn của mình.

## 8. Xử lý sự cố thường gặp

| Hiện tượng | Nguyên nhân & cách xử lý |
| --- | --- |
| Số liệu thẻ thống kê không khớp Bảng công việc | Hai trang tính theo thời điểm khác nhau — bấm **Làm mới**; dữ liệu cũng tự đồng bộ định kỳ từ Jira. |
| Không thấy task mình vừa được giao | Task mới cần chờ đồng bộ Jira; bấm **Làm mới**. Cũng kiểm tra bạn đang ở đúng chip lọc (**Được giao cho tôi** / **Tôi báo cáo**...) và trạng thái (**Đang xử lý**). |
| Tỷ lệ "Đúng hạn" thấp dù làm rất nhiều | Chỉ tính task hoàn thành **trong 7 ngày qua** — hoàn thành sau deadline vẫn bị tính trễ. Kiểm tra hạn chót trên tab Timeline. |
| Timeline trống dù đang có task | Tab này chỉ liệt kê task **có ngày hạn chót** trong 14 ngày tới (hoặc quá hạn). Task chưa đặt due date nằm ở nhóm "Chưa có hạn". |
| Biểu đồ Hiệu suất trống / ít dữ liệu | Biểu đồ tính trên các task **đã hoàn thành** gần đây (vd Cycle/Lead Time dựa trên mẫu 4 task). Nếu mới tham gia, cần thời gian tích lũy dữ liệu. |
| Muốn xem task của người khác | Trang này chỉ dành cho cá nhân bạn. Dùng **Bảng công việc** (phạm vi Team) hoặc chức năng Đổi tài khoản (chỉ Admin). |

---

*Tài liệu viết dựa trên giao diện thực tế của hệ thống (ảnh chụp ở chế độ Sáng, dữ liệu cá nhân demo tại thời điểm 25/10/2026). Phần tiếp theo của bộ tài liệu: Bảng công việc (Board).*
