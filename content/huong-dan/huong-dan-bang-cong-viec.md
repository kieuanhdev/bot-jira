# Bảng công việc (Board) — Hướng dẫn sử dụng

**Tài liệu hướng dẫn sử dụng Team Task Web — Phần 9: Bảng công việc Kanban theo dự án**

| Thông tin | Giá trị |
| --- | --- |
| Hệ thống | Team Task Web — https://jira.kieuanhdev.id.vn/ |
| Trang chức năng | **Bảng công việc** (menu Công việc → Bảng công việc) |
| Địa chỉ trực tiếp | https://jira.kieuanhdev.id.vn/board |
| Đối tượng | Toàn bộ thành viên |
| Phiên bản tài liệu | 1.1 — Cập nhật 25/10/2026 |

---

## 1. Trang này dùng để làm gì?

**Bảng công việc** là màn hình làm việc chính hằng ngày — bảng Kanban trực quan theo từng dự án:

- Xem toàn bộ task của dự án xếp theo **cột trạng thái** (Backlog → To do → In Progress → Waiting For Deploy → READY FOR TEST → Done Test...).
- **Kéo-thả thẻ** để chuyển trạng thái task (cập nhật thật lên Jira).
- Lọc, tìm kiếm, tạo task, cập nhật nhanh ngay trên thẻ.

> 💡 Minh họa trong tài liệu này dùng dự án **EPM** (dữ liệu lớn, phạm vi Team); thao tác kéo-thả minh họa bằng task của chính người viết ở dự án **MR**.

## 2. Thanh công cụ trên cùng

![Tổng quan board EPM phạm vi Team](images/board-01-tong-quan-epm.png)

| Nhóm | Thành phần | Chức năng |
| --- | --- | --- |
| Tab dự án | CICM / EPM / MR / EPB / "N đã chọn" | Chuyển nhanh giữa các dự án; số trên mỗi tab là task khớp bộ lọc hiện tại. Bấm "N đã chọn" để tick nhiều dự án cùng xem |
| Phạm vi board | **Cá nhân / Team** | Cá nhân = chỉ task của bạn; Team = task của cả nhóm |
| Đồng bộ | **Đồng bộ Jira** | Kéo dữ liệu mới nhất từ Jira về |
| Tạo | **+ Tạo task** | Mở form tạo task trong dự án đang mở (xem mục 7) |
| Chế độ hiển thị | **Bảng / Danh sách** | Kanban hoặc bảng danh sách (xem mục 9) |
| Cột | **Tùy chỉnh cột N/M** | Ẩn/hiện các cột trạng thái (xem mục 8) |
| Sắp xếp | Ô "Mới cập nhật" | Cách xếp thẻ trong từng cột: **Độ ưu tiên / Mới cập nhật / Cũ nhất trước** |
| Bộ lọc | Tìm kiếm / Người phụ trách / Trạng thái / Độ ưu tiên / **Bộ lọc khác** | Thu hẹp danh sách task (xem mục 4) |
| Thanh thống kê | 1000 task · Mở 137 · Đang làm 61 · Tồn đọng 7d+ 88 · Hoàn thành 863 | Bức tranh tổng theo bộ lọc hiện tại; góc phải hiển thị thời điểm "Đồng bộ" gần nhất |

## 3. Đọc cột và thẻ task

Mỗi **cột** là một trạng thái Jira (vd: Backlog, Selected for Development, In Progress, Waiting For Deploy, READY FOR TEST, Done Test...), có số lượng task và nút `⋯` (tùy chọn cột: thu gọn, ẩn cột) và `>` (chuyển nhanh task sang cột kế tiếp).

Mỗi **thẻ task** hiển thị:

- **Mã task** (vd `EPM-4557`) + loại (New / Task / Bug / Sub / Mobi...).
- **Tiêu đề** công việc.
- **Nhãn bổ trợ**: số nhánh Git liên kết (`8b`), số PR (`1b PR`), badge **Quá hạn** (viền đỏ), độ ưu tiên (High), số điểm (3)...
- **Người phụ trách** (avatar), thời gian cập nhật gần nhất (1d ago...), reporter.
- Nút `⋯` trên thẻ: **mở quick panel** (giống bấm thẻ — xem mục 5).
- Nút `<` `>` dưới thẻ: chuyển cột lùi/tới mà không cần kéo.

## 4. Bộ lọc task

Ngoài 4 bộ lọc chính, bấm **"Bộ lọc khác"** để mở hàng lọc nâng cao:

![Bộ lọc khác: fix version, epic, nhãn và chip lọc nhanh](images/board-03-bo-loc-khac.png)

- **3 dropdown**: lọc theo **Fix Version** (phiên bản phát hành), **Epic** (nhóm công việc cha), **Nhãn**.
- **6 chip lọc nhanh**: `Quá hạn`, `Chưa assign`, `Chưa estimate`, `Stale 7d+` (task nằm yên quá 7 ngày), `Thiếu Approver`, `Thiếu Tester` — bấm để bật/tắt, kết hợp nhiều chip cùng lúc.
- Khi có bộ lọc nào đang bật, nút **"Xóa lọc (N)"** xuất hiện để gỡ toàn bộ một lần.

### 4.1. Lọc theo trạng thái / độ ưu tiên (multi-select)

Bấm **"Tất cả trạng thái"** hoặc **"Tất cả độ ưu tiên"** — dropdown dạng **tick chọn nhiều**:

![Dropdown lọc trạng thái nhiều lựa chọn](images/board-10-loc-trang-thai.png)

Tick 2-3 trạng thái cùng lúc để chỉ xem những cột/task bạn quan tâm (vd: chỉ `In Progress` + `READY FOR TEST`). Bấm ra ngoài hoặc Escape để đóng.

### 4.2. Lọc theo người phụ trách

Ô lọc người hiển thị dạng **chip** (vd: chip `Bạn (anhnk_mb)` với dấu × để gỡ nhanh). Bấm vào ô để tìm và chọn thành viên; nút **"Hiển thị tất cả người phụ trách"** mở toàn bộ danh sách để chọn nhiều người cùng lúc.

### 4.3. Xem nhiều dự án cùng lúc

Bấm nút **"N đã chọn"** cạnh các tab dự án:

![Dialog chọn nhiều dự án hiển thị trên bảng](images/board-11-chon-nhieu-du-an.png)

- Tick nhiều dự án để **hiển thị trên bảng cùng lúc** (mỗi dự án kèm số task).
- Ô **"Nhập dự án muốn có"** — thêm dự án theo mã (vd: `ABC`) nếu chưa có trong danh sách.
- **"Chọn tất cả"** / **"Xong"** để chốt lựa chọn.

## 5. Quick panel — thao tác nhanh trên thẻ

Bấm vào một thẻ task để mở **quick panel** bên phải.

🎬 **Video minh họa**: [quick-panel-task.webm](videos/quick-panel-task.webm) — bấm thẻ, cuộn xem các trường, đóng panel.

![Quick panel của thẻ task](images/board-02-quick-panel.png)

**Hành động nhanh (hàng nút trên):**

| Nút | Chức năng |
| --- | --- |
| **Log work** | Ghi worklog (thời gian làm việc) cho task |
| **Link issue** | Liên kết task với task/issue khác |
| **Impediment** | Đánh dấu task bị vướng/ blocked |
| **Copy link / Copy key** | Sao chép đường dẫn hoặc mã task |
| **Clone** | Nhân bản task |
| **Tạo nhánh Git** | Tạo nhánh Bitbucket từ task (tích hợp với Nhánh & Delivery) |
| **Tách sub-task bằng AI** | Để AI phân rã task thành các sub-task nhỏ |
| **Xóa** | Xóa task (cẩn trọng!) |

**Trường thông tin**: Status, Priority, Assignee, Points, Reporter, Approver, Tester, Due date, Type, Fix Versions (+ nút "Thêm version") — **sửa trực tiếp** bằng dropdown ngay trong panel.

**Cuối panel**: **Watch** (theo dõi task để nhận thông báo), **Xem trên Jira** (mở trang gốc), **Full detail** (mở trang chi tiết đầy đủ của task).

## 6. Kéo-thả chuyển trạng thái (và cách khác)

**Cách 1 — Kéo-thả** (minh họa thật: task `MR-6` của người viết tài liệu).

🎬 **Video minh họa**: [keo-tha-chuyen-trang-thai.webm](videos/keo-tha-chuyen-trang-thai.webm) — kéo thẻ từ Waiting For Deploy sang READY FOR TEST rồi kéo trả về vị trí cũ (xem rõ chuyển động con trỏ và hiệu ứng thẻ).

Trước khi kéo — thẻ `MR-6` đang ở cột **Waiting For Deploy**:

![Trước khi kéo thả](images/board-05-truoc-keo-tha.png)

Giữ chuột vào thẻ, kéo sang cột **READY FOR TEST** và thả:

![Sau khi kéo thả — MR-6 chuyển cột thành công](images/board-06-sau-keo-tha.png)

Kết quả: cột Waiting For Deploy còn 1, READY FOR TEST có 1, thẻ hiển thị "just now" — **trạng thái đã được cập nhật thật trên Jira**.

**Cách 2 — Nút chuyển cột**: bấm nút `<` (lùi) hoặc `>` (tới) dưới thẻ task.

**Cách 3 — Quick panel**: mở thẻ → đổi trường **Status** bằng dropdown.

> ⚠️ **Lưu ý khi kéo-thả**:
> - Kéo-thả **thay đổi thật trạng thái Jira** của task (kể cả task của đồng nghiệp). Chỉ kéo thẻ task bạn được phân công hoặc đã được phép.
> - Một số luồng trạng thái có thể bị Jira từ chối nếu workflow không cho chuyển trực tiếp (vd nhảy cóc quá nhiều cột).

**Chọn nhiều task để chuyển cùng lúc**: tick chọn nhiều thẻ (hoặc kéo quét) — hệ thống hiện thanh nhắc *"Đã chọn N task — kéo một thẻ đã chọn để chuyển tất cả"*:

![Chọn nhiều task và trả task về cột cũ](images/board-07-tra-lai-va-chon-nhieu.png)

Bấm **"Bỏ chọn"** để hạm bỏ bộ chọn nhiều task.

## 7. Tạo task ngay trên board

Bấm **"+ Tạo task"** trên thanh công cụ (hoặc nút "Tạo task trong &lt;tên dự án&gt;"):

![Dialog Tạo task trên board](images/board-08-tao-task-tren-board.png)

| Trường | Bắt buộc | Ghi chú |
| --- | --- | --- |
| **Tiêu đề** | ✅ | |
| **Loại task** | ✅ | Mặc định `Sub-task` |
| **Task cha / Epic** | ✅ (tùy dự án) | MR yêu cầu bắt buộc — Sub-task phải có cha |
| Người thực hiện, Mức ưu tiên, Nhãn, Story Points, Ước tính, Hạn hoàn thành, Phiên bản phát hành | — | |
| **Mô tả (Description)** | — | Hỗ trợ **Markdown và Jira markup** (`h1.`, `*bold*`, `_italic_`, `- [ ]`, `{code}`); có nút **"Khung AC"** chèn khung tiêu chí nghiệm thu; kéo góc dưới để mở rộng |

Tiện ích:

- **"Viết bằng AI"** — mô tả tiêu đề, để AI soạn phần mô tả.
- **"+4 trường tùy chọn"** — mở thêm các trường mở rộng (custom fields).
- Nút **"Tạo task"** chỉ sáng khi đã nhập đủ trường bắt buộc; **"Hủy"** để thoát không lưu.

## 8. Quản lý các cột trạng thái

### 8.1. Tùy chỉnh ẩn/hiện cột

Bấm **"Tùy chỉnh cột N/M"** trên thanh công cụ:

![Dialog Tùy chỉnh hiển thị cột](images/board-09-tuy-chinh-cot.png)

- Mỗi cột có **tick bật/tắt** kèm số task đang có và **icon con mắt** để ẩn riêng.
- **"Hiển thị tất cả (N)"** / **"Ẩn cột trống"** — thao tác nhanh toàn bộ.
- **"Thu gọn các cột trống (thanh dọc)"** — các cột không có task thu thành vạch mỏng, tiết kiệm màn hình.
- **"Khôi phục thiết lập mặc định"** — trả về như ban đầu.
- Thiết lập được **lưu riêng cho từng dự án** (ghi trên dialog: "Lưu riêng cho dự án MR").

### 8.2. Tùy chọn và thu gọn từng cột

Trên đầu mỗi cột có 2 nút:

- **`⋯` (Tùy chọn cột)** — menu thao tác với cột đó (ẩn cột...).
- **`⌃` (Thu gọn cột)** — thu cột thành dải hẹp; bấm lại để mở rộng.

## 9. Chế độ Danh sách

Bấm **"Danh sách"** trên thanh công cụ để chuyển từ Kanban sang bảng — phù hợp khi cần xem/sửa nhiều trường cùng lúc hoặc quét danh sách dài.

### 9.1. Các cột và sửa trực tiếp (inline edit)

![Chế độ Danh sách với các cột sửa trực tiếp](images/board-04-che-do-danh-sach.png)

Mỗi dòng là một task, các trường hiển thị dạng **dropdown sửa trực tiếp** — đổi ngay trên dòng mà không cần mở thẻ:

| Cột | Sửa inline? |
| --- | --- |
| Key (mã task) | Chỉ hiển thị, bấm để mở task |
| Summary (tiêu đề) | Chỉ hiển thị |
| Type, Points, **Status**, Assignee | ✅ Sửa trực tiếp |
| Mức ưu tiên, Hạn hoàn thành, Epic, Fix version, Reporter, **Approver, Tester** | ✅ Sửa trực tiếp |
| Created / Updated | Chỉ hiển thị |

![Các cột bên phải: Epic, Fix version, Reporter, Approver, Tester...](images/board-12-danh-sach-cot-ben-phai.png)

> 💡 Cách sửa inline rất tiện khi cần đổi **Tester/Approver** cho nhiều task tuần tự — không phải mở từng thẻ. Lưu ý đây vẫn là thay đổi thật trên Jira ngay khi chọn giá trị.

### 9.2. Tùy chỉnh cột hiển thị

Bấm **"Tùy chỉnh cột (Đầy đủ)"** — dialog "Cột trong danh sách" cho phép bật/tắt **13 cột** (Loại, Điểm, Trạng thái, Người xử lý, Mức ưu tiên, Hạn hoàn thành, Epic, Fix version, Reporter, Approver, Tester, Ngày tạo, Thời gian cập nhật), mỗi cột còn có icon con mắt ẩn riêng:

![Tùy chỉnh cột trong danh sách](images/board-13-danh-sach-tuy-chinh-cot.png)

### 9.3. Sắp xếp

Bấm tiêu đề cột (Key, Summary, Points, Status...) để sắp xếp tăng/giảm tại chỗ — mũi tên ↑↓ trên cột đang sắp xếp:

![Sắp xếp danh sách theo Key](images/board-14-danh-sach-sap-xep.png)

### 9.4. Sửa hàng loạt ngay trong danh sách

Tick chọn một hoặc nhiều dòng → xuất hiện **thanh sửa hàng loạt** phía trên bảng:

![Thanh sửa hàng loạt trong danh sách](images/board-15-danh-sach-sua-hang-loat.png)

- *"N task đã chọn · Đặt giá trị cho tất cả:"* với 11 dropdown: **Status, Assignee, Priority, Points, Due, Type, Epic, Fix version, Reporter, Approver, Tester**.
- Chọn giá trị trên dropdown nào là áp dụng cho **tất cả dòng đang tick** (thay đổi thật trên Jira — hãy chắc chắn bộ chọn đúng).
- **"Bỏ chọn"** để hủy bộ chọn; tick ô ở tiêu đề cột để chọn tất cả dòng đang hiển thị.

> 💡 So sánh với wizard **Cập nhật hàng loạt** (`/bulk`): thanh này gọn hơn cho 5-10 task liền nhau; wizard phù hợp khi cần bộ lọc phức tạp, xem trước diff và ghi worklog.

### 9.5. Cuộn và tải dữ liệu

Danh sách hỗ trợ cuộn ngang (nhiều cột) và cuộn dọc liên tục — với dự án lớn (EPM: 1000 task), dữ liệu được tải thêm khi cuộn. Kết hợp bộ lọc ở thanh trên để thu hẹp trước khi quét.

## 10. Quy trình gợi ý sử dụng hằng ngày

1. Mở **Bảng công việc** → chọn dự án + phạm vi (**Cá nhân** khi tập trung việc mình, **Team** khi họp nhóm).
2. Bật lọc nhanh cần thiết (vd `Quá hạn` + `Stale 7d+`) để xử lý việc trễ trước.
3. Kéo thẻ task đang làm qua **In Progress** khi bắt đầu; qua **READY FOR TEST** khi code xong chờ test.
4. Bấm thẻ → **Log work** để ghi thời gian; dùng **Tạo nhánh Git** khi bắt đầu code.
5. Cuối ngày bấm **Đồng bộ Jira** trước khi họp review để dữ liệu tươi nhất.

## 11. Xử lý sự cố thường gặp

| Hiện tượng | Nguyên nhân & cách xử lý |
| --- | --- |
| Kéo thẻ xong thẻ quay lại cột cũ | Jira từ chối chuyển trạng thái theo workflow (không cho phép chuyển trực tiếp). Mở quick panel → đổi Status theo các bước trung gian, hoặc liên hệ quản trị Jira về workflow. |
| Không tìm thấy nút tạo task / cột bị thiếu | Board đang ẩn cột hoặc thu gọn — mở **Tùy chỉnh cột** → "Hiển thị tất cả" / "Khôi phục thiết lập mặc định". |
| Sub-task tạo không được (nút Tạo task mờ) | Loại Sub-task yêu cầu **Task cha / Epic** — chọn task cha trước, hoặc đổi loại task thành Task/Bug. |
| Không thấy task mới được giao | Bộ lọc đang lọc kiểu gì đó (nhìn "Xóa lọc (N)" hoặc chip "Bộ lọc khác"); bấm **Đồng bộ Jira** để kéo dữ liệu mới. |
| Thống kê "Tồn đọng 7d+" đỏ | Task chưa di chuyển trong 7+ ngày — dùng chip `Stale 7d+` để lọc ra và xử lý. |
| Tab dự án hiện số 0 dù có task | Tab đếm theo bộ lọc hiện tại; kiểm tra người phụ trách/trạng thái đang lọc. Chọn "N đã chọn" nếu cần xem nhiều dự án. |
| Muốn sửa nhiều task cùng lúc | Kanban: chọn nhiều thẻ rồi kéo một thẻ để chuyển tất cả. Danh sách: tick các dòng rồi dùng thanh "Đặt giá trị cho tất cả". Nhiều task + cần xem trước diff: dùng wizard **Cập nhật hàng loạt**. |
| Sửa nhầm giá trị ở chế độ Danh sách (inline) | Sửa inline áp dụng ngay khi chọn — không có bước xác nhận. Hãy chắc chắn dòng đang chọn trước khi mở dropdown; kiểm tra lại trên task sau khi sửa. |
| Muốn ẩn các cột không dùng | **Tùy chỉnh cột N/M** trên thanh công cụ — chỉ giữ các cột liên quan công việc hiện tại. |

---

*Tài liệu viết dựa trên giao diện thực tế của hệ thống (ảnh chụp ở chế độ Sáng tại thời điểm 25/10/2026). Thao tác kéo-thả minh họa bằng task `MR-6` của chính tài khoản người viết và **đã được trả về trạng thái ban đầu** (Waiting For Deploy) sau khi chụp.*
