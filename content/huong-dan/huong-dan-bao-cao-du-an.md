# Báo cáo dự án — Hướng dẫn sử dụng

**Tài liệu hướng dẫn sử dụng Team Task Web — Phần 5: Báo cáo danh mục dự án và báo cáo chi tiết từng dự án**

| Thông tin | Giá trị |
| --- | --- |
| Hệ thống | Team Task Web — https://jira.kieuanhdev.id.vn/ |
| Trang chức năng | **Báo cáo dự án** (menu Phân tích → Báo cáo dự án) |
| Địa chỉ trực tiếp | https://jira.kieuanhdev.id.vn/reports/projects |
| Đối tượng | Leader, quản lý dự án, thành viên muốn nắm tình hình dự án |
| Phiên bản tài liệu | 1.0 — Cập nhật 25/10/2026 |

---

## 1. Trang này dùng để làm gì?

Trang **Báo cáo dự án** trả lời hai cấp câu hỏi:

1. **Cấp danh mục**: các dự án (CICM, EPM, MR, EPB...) hiện thế nào — dự án nào đang rủi ro, dự án nào thông thoáng? → xem ngay một bảng duy nhất.
2. **Cấp chi tiết**: một dự án cụ thể có lượng công việc, điểm nghẽn, người phụ trách, xu hướng và tiến độ Sprint/Release ra sao? → mở báo cáo riêng của dự án đó.

Dữ liệu lấy từ **Jira** (đồng bộ định kỳ, có ghi mốc thời gian "Đồng bộ Jira" trên trang) và từ **snapshot hằng ngày** của hệ thống để dựng biểu đồ lịch sử.

## 2. Báo cáo danh mục dự án — nhìn cả hệ thống trong một bảng

Vào **menu Phân tích → Báo cáo dự án** (hoặc mở `/reports/projects`):

![Tổng quan danh mục dự án](images/report-01-danh-muc-tong-quan.png)

### 2.1. Chọn kỳ báo cáo

Góc trên phải có cụm điều khiển kỳ:

| Điều khiển | Chức năng |
| --- | --- |
| Ô chọn kỳ (**Tuần này / Tháng này / Quý này...**) | Chọn loại kỳ báo cáo |
| Nút **‹ / ›** | Lùi lại kỳ trước hoặc sang kỳ sau (vd: "Tuần này (19/10 - 25/10/2026)") |
| Ô **Tự động (Auto)** | Chọn đơn vị thời gian phân tích (Auto / Ngày / Tuần...) |
| Nút **⟳** | Làm mới dữ liệu |

### 2.2. Thẻ phân loại dự án

| Thẻ | Ý nghĩa |
| --- | --- |
| **Tổng dự án** | Số dự án đang theo dõi (vd: 4) |
| **Rủi ro cao** | Dự án có task bị nghẽn/quá hạn nghiêm trọng — ưu tiên xử lý trước |
| **Cần chú ý** | Dự án bắt đầu có tín hiệu xấu nhưng chưa chạm ngưỡng rủi ro cao |
| **Đúng tiến độ** | Dự án khỏe mạnh |
| **Đã hoàn thành** | Dự án đã kết thúc trong kỳ |

Bấm vào thẻ để **lọc bảng bên dưới** theo nhóm đó. Ô tìm kiếm giúp nhảy nhanh tới dự án theo tên hoặc mã.

### 2.3. Đọc bảng danh mục

![Bảng danh mục dự án](images/report-02-danh-muc-bang.png)

Mỗi dòng là một dự án với các chỉ số trong kỳ:

| Cột | Ý nghĩa | Ví dụ (CICM) |
| --- | --- | --- |
| **Dự án** | Tên + mã dự án; bấm để mở báo cáo chi tiết | CICM |
| **Kỳ báo cáo** | Kỳ đang xem | Tuần này (19/10 - 25/10/2026) |
| **Hoàn thành trong kỳ** | Số task Done trong kỳ | 8 task |
| **Tồn cuối kỳ (Open/WIP)** | Task còn mở cuối kỳ, kèm số đang làm | 69 (49 đang làm) |
| **Bị nghẽn** | Task bị chặn (Blocked) cần hỗ trợ | 4 |
| **Quá hạn** | Task trễ deadline | 52 |
| **Thay đổi Backlog** | Chênh lệch task tồn so với kỳ trước: **xanh âm** (↓ tốt — backlog giảm) / **cam dương** (↑ backlog đang phình) | -8 |
| **Sức khỏe** | Đánh giá tự động + lý do (di chuột để xem chi tiết) | Rủi ro cao |
| **Đồng bộ** | Lần gần nhất dữ liệu Jira được cập nhật | 54 phút trước |
| **Báo cáo** | Link **Thành viên** (mở thẳng tab thành viên) và **Xem báo cáo dự án** (mở trang chi tiết) | — |

> 💡 **Cách đọc nhanh sức khỏe dự án**: nhìn cột *Sức khỏe* trước → nếu "Rủi ro cao" thì xem *Bị nghẽn* và *Quá hạn* để biết quy mô → so *Thay đổi Backlog* để biết xu hướng đang xấu đi hay cải thiện (backlog giảm dù quá hạn nhiều vẫn là tín hiệu đang được xử lý dần).

## 3. Báo cáo chi tiết một dự án

Bấm tên dự án (vd **CICM**) trên bảng danh mục:

![Trang báo cáo chi tiết CICM — phần đầu](images/report-03-chi-tiet-cicm-tong-quan.png)

Trang chi tiết có thanh công cụ riêng: chọn kỳ, **lọc theo version** (vd `Tất cả version`), nút **Tải CSV** (xuất dữ liệu về máy) và 5 tab phân tích.

### 3.1. Đánh giá sức khỏe dự án

Khối màu đỏ/vàng/xanh phía trên:

- **Mức đánh giá** (vd: "Rủi ro cao") kèm câu tóm tắt nguyên nhân.
- **Chi tiết nguyên nhân & bằng chứng** — từng mã lý do cụ thể (vd: `[BLOCKER_OVER_SLA]`, `[MANY_OVERDUE_TASKS]`), giúp Leader biết chính xác phải giải quyết gì.
- Một số dự án có thêm **Lưu ý chất lượng dữ liệu** (vd: chưa kích hoạt transition history — chỉ số reopen/cycle time đang ở chế độ ước lượng).

### 3.2. Hàng thẻ chỉ số trong kỳ

| Thẻ | Ý nghĩa |
| --- | --- |
| **Tiến độ** | % task Done trong kỳ trên tổng số task (vd: 10% — 8/77 task) |
| **Hoàn thành trong kỳ** | Số task Done, kèm mũi tên so với kỳ trước (vd: 8, +3) |
| **Tạo mới trong kỳ** | Task mới phát sinh, kèm so sánh kỳ trước (vd: 0, -17) |
| **Đang xử lý (WIP)** | Task đang In Progress / Review / QA (vd: 49) |
| **Bị nghẽn (Blocked)** | Task bị chặn cần hỗ trợ tháo gỡ (vd: 4) |
| **Quá hạn (Overdue)** | Task trễ hạn chót (vd: 52) |
| **Vượt ngưỡng SLA** | Task ở một trạng thái quá lâu so với quy định (vd: 45) |

Dòng **Độ bao phủ dữ liệu** cho biết bao nhiêu % task có Story Points và Estimate — tỷ lệ càng cao, các chỉ số điểm/giờ càng chính xác.

### 3.3. Biểu đồ "Task theo trạng thái"

![Biểu đồ phân bố trạng thái và điểm nghẽn](images/report-04-chi-tiet-bieu-do.png)

Khu vực này có 3 nút chuyển **đơn vị** (Task / SP / giờ) và 3 nút chuyển **chế độ biểu đồ**:

| Chế độ | Hiển thị |
| --- | --- |
| **Tròn** | Biểu đồ tròn cơ cấu task theo trạng thái (Chờ làm / Đang làm / Đang review / QA-Test / Hoàn thành), kèm danh sách chi tiết từng trạng thái bên phải |
| **Luồng** | Biểu đồ luồng (flow) cho thấy task di chuyển giữa các trạng thái thế nào |
| **Bảng** | Bảng số liệu thô |

Bên dưới là 2 biểu đồ phụ:

- **Luồng công việc trong kỳ**: cột so sánh "Tạo mới" vs "Hoàn thành" kỳ hiện tại và kỳ trước — thể hiện team đang tháo backlog hay tích tụ thêm.
- **Điểm nghẽn quy trình (Bottlenecks)**: số task vượt SLA theo từng bước quy trình (To Do Test, In Progress, Waiting For Deploy...) — bước nào cột đỏ cao nhất là bước cần được ưu tiên giải tỏa.

### 3.4. Công việc có tín hiệu rủi ro

![Danh sách công việc có tín hiệu rủi ro](images/report-05-cong-viec-tin-hieu-rui-ro.png)

Bảng liệt kê chính xác từng task có vấn đề, có bộ lọc theo loại rủi ro (**Tất cả / Bị nghẽn / Quá hạn / Quá SLA**):

- **Task + tiêu đề** (bấm mã để mở task).
- **Trạng thái** hiện tại.
- **Người thực hiện**.
- **Loại rủi ro** (badge Quá hạn / Quá SLA / Bị nghẽn).
- **Tuổi trạng thái** — task đã "đứng yên" bao lâu (vd: 19 ngày).
- **Hạn chót** kèm số ngày trễ (vd: 2026-06-30 (+84d)).

> 💡 Đây là **danh sách việc cần làm ngay** của Leader: sắp xếp theo tuổi trạng thái hoặc hạn chót, phân công hỗ trợ từng task.

## 4. Tab "Thành viên" — phân bổ công việc theo người

![Tab Thành viên](images/report-06-thanh-vien.png)

- Thẻ thống kê: số thành viên đang có việc, tổng công việc, số đã hoàn thành, số người **cần hỗ trợ**.
- **Biểu đồ tròn + danh sách chi tiết theo thành viên**: mỗi người hiển thị số task đang giữ, số đã xong, số WIP và % khối lượng — người gánh nhiều nhất đứng đầu.
- Nút **Chọn thành viên** để lọc hiện chỉ những người quan tâm.
- ⚠️ Hệ thống ghi rõ: báo cáo này phản ánh **tải công việc thực tế và tín hiệu cần hỗ trợ** — *"Dữ liệu tuyệt đối không quy đổi thành điểm hiệu suất hay bảng xếp hạng cá nhân"*. Hãy dùng nó để **cân bằng khối lượng**, không phải để đánh giá con người.

## 5. Tab "Xu hướng" — thông lượng theo thời gian

![Tab Xu hướng](images/report-07-xu-huong.png)

- **Throughput chart**: số task hoàn thành theo từng ngày/tuần trong kỳ (dữ liệu lịch sử được tổng hợp từ snapshot hằng ngày).
- Đổi kỳ bằng công cụ phía trên để xem xu hướng dài hơn (tuần trước → tháng này...).
- Đường đi lên/đồn đi cho biết nhịp bàn giao của team — dùng để đối chiếu với cam kết hoặc tìm tuần bị "tắc".

## 6. Tab "Agile & Burndown" — tiến độ Sprint/Release

![Tab Agile & Burndown](images/report-08-burndown.png)

- **Sprint/Release Burndown Chart** theo version (vd: `v6.11.1`):
  - **Đường lý tưởng (Ideal Line)** — nét đứt: tốc độ cần thiết để kịp deadline.
  - **Thực tế còn lại (Actual)** — đường đậm: Story Point thực tế còn chưa xong theo từng ngày.
  - Góc phải hiển thị **Tổng điểm** và **Còn lại** (vd: 114 pts / 102 pts).
  - Nhãn **"Có nguy cơ trễ hạn"** xuất hiện khi đường thực tế cao hơn đường lý tưởng ở cuối kỳ.
- **Cumulative Flow Diagram (CFD)** bên dưới: lượng công việc tích tụ theo trạng thái qua thời gian — nhìn rộng để thấy bước nào phình to bất thường.

> 💡 **Đọc Burndown**: đường thực tế nằm **dưới** đường lý tưởng = đang đi trước kế hoạch; nằm **phẳng ở trên cao** = chưa có task nào được chốt — cần xem lại tại sao (task kẹt ở QA? thiếu người test?).

## 7. Quy trình gợi ý sử dụng

1. **Standup hằng ngày**: Leader mở trang danh mục → nhìn cột Sức khỏe → vào dự án rủi ro cao nhất → mở mục "Công việc có tín hiệu rủi ro" để phân công tháo gỡ.
2. **Họp tuần**: dùng tab **Thành viên** để cân bằng khối lượng, tab **Xu hướng** để đối chiếu nhịp làm việc các tuần.
3. **Theo dõi release**: xem tab **Agile & Burndown** theo version — cảnh báo "Có nguy cơ trễ hạn" xuất hiện là phải hành động ngay.
4. **Báo cáo quản lý**: bấm **Tải CSV** để xuất số liệu kỳ và gửi lên cấp trên.

## 8. Xử lý sự cố thường gặp

| Hiện tượng | Nguyên nhân & cách xử lý |
| --- | --- |
| Số liệu cũ | Xem mốc "Đồng bộ Jira" trên trang; bấm nút **⟳ Làm mới dữ liệu**. Đồng bộ chạy định kỳ nên lệch vài phút là bình thường. |
| Báo cáo hiện "Lưu ý chất lượng dữ liệu" | Dự án chưa bật đầy đủ lịch sử chuyển trạng thái trên Jira — các chỉ số reopen/cycle time chỉ là ước lượng. Liên hệ quản trị để bật webhook/transition events. |
| "Độ bao phủ dữ liệu" thấp (% SP nhỏ) | Nhiều task chưa đặt Story Point/Estimate trên Jira → các biểu đồ theo SP/giờ chưa phản ánh đủ. Khuyến khích team đặt SP khi tạo task. |
| Không thấy dự án nào | Kiểm tra kỳ báo cáo đang chọn (kỳ quá cũ có thể không có dữ liệu) và quyền truy cập dự án của tài khoản. |
| Biểu đồ burndown phẳng | Chưa có task nào chuyển Done trong version đó — xem tab Tổng quan → "Công việc có tín hiệu rủi ro" để tìm nút tắc. |
| Cần số liệu gốc để xử lý ngoài | Bấm **Tải CSV** trên trang chi tiết dự án. |

---

*Tài liệu viết dựa trên giao diện thực tế của hệ thống (ảnh chụp ở chế độ Sáng, kỳ "Tuần này 19/10 - 25/10/2026" tại thời điểm 25/10/2026; dự án minh họa: CICM). Các phần tiếp theo của bộ tài liệu: Bảng công việc (Board), Cập nhật hàng loạt, Quản lý phát hành...*
