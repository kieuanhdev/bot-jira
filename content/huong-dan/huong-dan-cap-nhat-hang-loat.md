# Cập nhật hàng loạt & Tạo task hàng loạt — Hướng dẫn sử dụng

**Tài liệu hướng dẫn sử dụng Team Task Web — Phần 8: Thao tác hàng loạt trên Jira**

| Thông tin | Giá trị |
| --- | --- |
| Hệ thống | Team Task Web — https://jira.kieuanhdev.id.vn/ |
| Trang chức năng | **Cập nhật hàng loạt** (menu Delivery → Cập nhật hàng loạt) |
| Địa chỉ trực tiếp | https://jira.kieuanhdev.id.vn/bulk (cập nhật) · https://jira.kieuanhdev.id.vn/bulk/create (tạo mới) |
| Đối tượng | Leader, quản lý dự án, thành viên cần sửa/nhiều task cùng lúc |
| Phiên bản tài liệu | 1.0 — Cập nhật 25/10/2026 |

---

## 1. Trang này dùng để làm gì?

Khu vực **Cập nhật hàng loạt** gồm 2 công cụ, chọn qua 2 tab ở đầu trang:

| Công cụ | Địa chỉ | Dùng khi |
| --- | --- | --- |
| **Cập nhật task hàng loạt** | `/bulk` | Sửa một lúc nhiều task đã có: đổi người phụ trách, nhãn, ưu tiên, trạng thái, ghi worklog... |
| **Tạo task mới hàng loạt** | `/bulk/create` | Soạn và tạo nhiều task mới cùng lúc, có thể dán trực tiếp từ Excel/Google Sheets hoặc nhập CSV |

Cả hai đều theo nguyên tắc an toàn: **Chọn → Xem trước → Xác nhận mới chạy**, kèm hàng đợi nền và lịch sử thao tác để tra cứu kết quả từng task.

> ⚠️ Thao tác hàng loạt **thay đổi thật trên Jira** với số lượng lớn. Luôn đọc kỹ bước xem trước trước khi bấm chạy; nhầm một bộ lọc có thể sửa oan hàng trăm task.

## 2. Cập nhật task hàng loạt — wizard 3 bước

### Bước 1 — Chọn dự án & task

![Bước 1: chọn dự án và task](images/bulk-01-buoc-1-chon-task.png)

- **Dự án mục tiêu** (bắt buộc): mỗi lần chỉ làm việc trên **một dự án**.
- **2 chế độ chọn**:
  - **Chọn từng task** — tick từng task trong danh sách (dùng khi sửa một nhóm nhỏ cụ thể).
  - **Tất cả khớp bộ lọc** — chọn mọi task thỏa bộ lọc hiện tại (dùng khi sửa hàng loạt lớn, ví dụ "tất cả task của @ngocdv còn To do").
- **Bộ lọc hỗ trợ**: tìm kiếm theo mã/tiêu đề, người phụ trách, trạng thái, độ ưu tiên, bộ lọc khác.
- Thanh dưới danh sách hiển thị **"Tổng số task sẽ cập nhật: N"** — luôn đối chiếu con số này với ý định của bạn trước khi qua bước 2.

![Danh sách task với tick chọn](images/bulk-02-chon-task-danh-dau.png)

Task được chọn có nền nổi bật; góc phải trên hiển thị **"Đã chọn N / tổng"**, có nút **"Hiện đã chọn"** để thu gọn danh sách chỉ còn task đã tick, và **"Chọn tất cả"** nếu cần.

### Bước 2 — Chọn trường cần sửa

![Bước 2: chọn trường và nhập giá trị](images/bulk-03-buoc-2-chon-truong.png)

Có **3 chế độ sửa**:

| Chế độ | Làm gì |
| --- | --- |
| **Cập nhật trường** | Sửa giá trị các trường: Người phụ trách, Nhãn, Độ ưu tiên, Type, Story/Task Points, Due date, Fix Versions, Epic/Task cha, Reporter, Tester |
| **Chuyển trạng thái** | Đẩy tất cả task đã chọn sang một trạng thái Jira mới |
| **Ghi Worklog** | Log thời gian làm việc cho tất cả task đã chọn |

Lưu ý khi dùng:

- Bật **tick các trường** cần sửa rồi nhập giá trị mới bên dưới (vd: bật "Độ ưu tiên" → chọn High).
- Một số trường **"Không khả dụng"** (mờ, không tick được — vd Original Estimate, Approver) do Jira của dự án không hỗ trợ sửa qua chế độ này.
- Chỉ tick đúng những trường thực sự cần đổi — mọi trường được bật sẽ **ghi đè lên toàn bộ task đã chọn**.

### Bước 3 — Xem trước & Chạy

![Bước 3: xem trước tổng quan](images/bulk-04-buoc-3-xem-truoc.png)

Bấm **"Xem trước N thay đổi"** để hệ thống phân tích trước khi thực sự chạy. Kết quả chia 4 nhóm:

| Nhóm | Ý nghĩa |
| --- | --- |
| **Sẽ thay đổi** | Task sẽ được sửa đúng như cấu hình |
| **Không đổi** | Giá trị hiện tại đã giống giá trị mới — không cần ghi |
| **Cảnh báo** | Có thể thay đổi nhưng có điểm cần lưu ý (vd: nhãn `stale data` — dữ liệu local có thể đã cũ so với Jira) |
| **Bị chặn** | Task không thể sửa (quyền, lỗi dữ liệu...) |

Bấm từng thẻ để xem **chi tiết từng task dạng diff** — dòng thay đổi được highlight với mũi tên "cũ → mới" (vd: `Độ ưu tiên: Medium → High`):

![Chi tiết xem trước dạng diff từng task](images/bulk-05-xem-truoc-chi-tiet.png)

Chốt hạ:

- Đọc kỹ danh sách **"Sẽ thay đổi"** — đây là những task sẽ bị ghi thật.
- Bấm **"Cập nhật N task"** để chạy (hệ thống đưa vào hàng đợi nền, hiển thị tiến độ và kết quả từng task).
- Bấm **"Hủy xem trước"** nếu thấy bất thường — quay lại chỉnh bộ lọc/trường.

**Lịch sử thao tác**: mục "Lịch sử thao tác (N)" ở dưới trang lưu kết quả chi tiết từng task của các lần chạy gần đây — dùng để đối soát sau khi chạy hoặc tìm lỗi task bị chặn.

## 3. Tạo task mới hàng loạt

Chuyển sang tab **"Tạo task mới hàng loạt"** (hoặc mở `/bulk/create`). Trang đánh dấu *DC REST v2* — tạo task trực tiếp qua API Jira Data Center.

### 3.1. Bảng soạn thảo

![Bảng soạn thảo tạo task hàng loạt](images/bulk-06-tao-moi-bang.png)

Giao diện là **bảng tính trực tiếp** (tối đa **100 dòng**), mỗi dòng là một task sắp tạo:

| Cột | Bắt buộc | Ghi chú |
| --- | --- | --- |
| **Tiêu đề (Summary)** | ✅ | Ô nhập văn bản, hỗ trợ paste từ Excel |
| **Loại task** | ✅ | 11 loại: `Sub-task` (mặc định), `Epic`, `Story`, `Task`, `Bug`, `Improvement`, `New Feature`, `TechDebt`, `Security`, `Defect`, `Risk` |
| **Task cha (Parent)** | — | Bắt buộc khi loại là Sub-task; chọn Epic/Task cha cho các loại khác |
| **Mức ưu tiên** | — | Mặc định là "Mặc định" (theo cấu hình Jira) |
| **Người thực hiện** | — | Combobox tìm thành viên, mặc định "Chưa gán" |
| **Nhãn (Labels)** | ⚠️ *tùy dự án* | Combobox có gợi ý nhãn có sẵn (vd: `flow-bug`, `flow-feature`, `CIC`...); **một số dự án yêu cầu bắt buộc** (xem 3.1) |
| **Points** | — | Story Points |
| **Ước tính** | — | Thời gian ước tính (vd `1d 2h`) |
| **Hạn chót** | — | Due date |
| **Mô tả** | — | Có thể dán văn bản dài |

Cột **Thao tác** của mỗi dòng: nhảy tới dòng, bản sao dòng (nhân bản nhanh), xóa dòng.

### 3.2. Tạo task bằng Excel (chi tiết)

Đây là cách hiệu quả nhất khi cần tạo **nhiều chục task** — soạn ngoài Excel/Google Sheets rồi đưa vào hệ thống. Có **2 đường đưa dữ liệu vào**:

**Cách A — Dán trực tiếp từ Excel/Google Sheets:** copy vùng dữ liệu trong bảng tính → dán thẳng vào bảng soạn thảo (ô Tiêu đề ghi rõ "Hỗ trợ paste Excel"), hệ thống tự tách cột theo thứ tự.

**Cách B — Nhập file qua mẫu Excel chuẩn (khuyên dùng):**

1. Bấm **"Tải mẫu Excel"** — hệ thống sinh file `.xlsx` riêng cho dự án đang chọn (vd `bulk-create-CICM-20261025.xlsx`).
2. Điền dữ liệu vào sheet **Tasks** (giữ nguyên cấu trúc).
3. Lưu file → bấm **"Nhập CSV / Excel"** để tải lên.

**Cấu trúc file mẫu (4 sheet):**

| Sheet | Nội dung |
| --- | --- |
| **Tasks** | Sheet nhập dữ liệu chính: 100 dòng có sẵn mã `TASK-001` → `TASK-100`, 13 cột |
| **Danh_muc** | Danh sách giá trị hợp lệ của dự án (loại issue kèm mã, mức ưu tiên, fix version...) — dùng làm dropdown chọn trong ô |
| **Vi_du** | Ví dụ minh họa cách liên kết task cha – con (**không nhập dữ liệu thật ở sheet này**) |
| **Huong_dan** | Hướng dẫn chi tiết từng cột nhúng ngay trong file |

**13 cột của sheet Tasks:**

| Cột | Bắt buộc | Quy tắc |
| --- | --- | --- |
| **Client Ref** | ✅ | Mã định danh duy nhất trong file, có sẵn `TASK-001`→`TASK-100`. Không xóa, không trùng nhau |
| **Summary** | ✅ | Tiêu đề task, tối đa 255 ký tự |
| **Issue Type** | ✅ | Chọn từ dropdown (đúng cấu hình dự án, vd `Task [10003]`) |
| **Parent Ref** | — | Khi tạo Sub-task: điền **Client Ref của task cha trong cùng file** (vd `TASK-001`) |
| **Parent Jira Key** | — | Hoặc điền **Jira key của task cha đã có trên Jira** (vd `CICM-123`). **Chỉ điền MỘT trong hai cột** |
| Description | — | Mô tả chi tiết |
| Assignee, Priority, Labels | — | Chọn từ dropdown hoặc nhập username trực tiếp; nhiều nhãn phân cách bằng dấu phẩy (vd `frontend, mobile`) |
| Story Points | — | Số nguyên không âm (1, 2, 3, 5, 8...) |
| Original Estimate | — | Cú pháp Jira (`1d 4h`, `2h 30m`, `45m`) |
| Due Date | — | Định dạng `YYYY-MM-DD` (vd `2026-10-15`) |
| Fix Versions | — | Chọn từ dropdown (đồng bộ từ Jira) |

**Quy tắc quan trọng:**

- ⚠️ **Chỉ nhập dữ liệu thật ở sheet `Tasks`** — không đổi tên sheet, không đổi tiêu đề cột.
- 📏 **Giới hạn 100 task / 1 file** (ghi trong sheet Hướng dẫn và manifest của file).
- 🔗 **Liên kết cha – con**: tạo Epic ở dòng `TASK-001`, rồi các Sub-task dòng dưới điền `Parent Ref = TASK-001` — hệ thống sẽ tự nối đúng thứ bậc khi tạo (xem ví dụ trong sheet `Vi_du`).
- Sau khi import, dữ liệu đổ vào bảng soạn thảo và đi qua **cùng bước xem trước** như nhập tay (xem 3.4) — dòng lỗi sẽ được đánh dấu để sửa trước khi tạo.

### 3.3. Thanh công cụ

| Nút | Chức năng |
| --- | --- |
| **Nhập CSV / Excel** | Chọn file từ máy để import — hệ thống tự đọc cột theo mẫu |
| **Tải mẫu Excel** | Tải file mẫu chuẩn về điền (đảm bảo đúng cấu trúc cột) |
| **Lấy mẫu Jira** | Lấy thông tin một task Jira có sẵn làm khuôn điền sẵn |
| **Cột hiển thị 8/9** | Ẩn/hiện từng cột (Task cha, Mức ưu tiên, Người thực hiện, Nhãn, Story Points, Ước tính, Hạn chót...) kèm nút "Khôi phục mặc định" |
| **Thoải mái** | Chế độ độ cao dòng dễ đọc |
| **+ Thêm dòng** | Thêm dòng mới (icon ⟳ để làm mới bảng về 1 dòng trống) |
| **Thoát toàn màn hình** | Bảng chiếm trọn màn hình — tiện khi soạn nhiều dòng; bấm lại để thu nhỏ |
| Icon bàn phím | Danh sách phím tắt hữu ích khi soạn thảo |

**Thanh trạng thái:**

- Trên phải: **"N/M task sẵn sàng"** — số dòng hợp lệ trên tổng dòng; nút **"Kiểm tra & Xem trước N task"** chỉ mở khi có ít nhất 1 dòng hợp lệ.
- Trên giữa: **"Tự động lưu bản nháp"** — soạn dở được lưu tự động (hiện "Đã lưu lúc HH:MM"), quay lại trang vẫn còn.
- Dưới trái: **"N lỗi cần sửa"** + nút **"Tới lỗi"** nhảy đến dòng đầu tiên có lỗi.
- Dưới phải: **"N/100"** — số dòng đã dùng trên giới hạn 100.

### 3.4. Bước 2 — Xem trước & Xác nhận

Bấm **"Kiểm tra & Xem trước N task"**: hệ thống kiểm tra chuẩn hóa, cảnh báo trùng lặp và lỗi trước khi tạo. Kết quả chia 4 nhóm: **Tổng số task / Sẵn sàng tạo / Có cảnh báo / Bị chặn (lỗi)**.

Ví dụ dòng **bị chặn** vì thiếu trường bắt buộc:

![Dòng bị chặn vì thiếu Nhãn](images/bulk-08-tao-moi-bi-chan-thieu-nhan.png)

- Mỗi dòng lỗi có thông báo cụ thể (vd: *"Trường bắt buộc 'Labels' chưa có dữ liệu"* — mỗi dự án có quy định trường bắt buộc riêng).
- Thanh công cụ xử lý lỗi: **"Quay lại chỉnh sửa"**, **"Sửa lỗi đầu tiên"** (nhảy thẳng đến ô lỗi), **"Bỏ qua N dòng lỗi"** (chỉ tạo các dòng hợp lệ).
- Nút **"Xác nhận tạo N task"** chỉ đếm số dòng **Sẵn sàng** — dòng bị lỗi không được tạo.

Sau khi bổ sung Nhãn, dòng chuyển sang **"Sẵn sàng"**:

![Dòng sẵn sàng tạo](images/bulk-09-tao-moi-san-sang.png)

- Nhãn **"Sẵn sàng"** + trạng thái "Hợp lệ" ở cột Chi tiết/Thông báo.
- Nút **"Xác nhận tạo 1 task"** sáng lên. **Bấm nút này = task được tạo thật trên Jira** (qua hàng đợi nền) — kiểm tra kỹ tiêu đề, loại, nhãn trước khi bấm.
- Bước 3 **"Tiến độ & Kết quả"** hiển thị tiến độ tạo từng dòng và kết quả cuối (thành công/thất bại + mã task Jira được cấp).

### 3.5. Quy trình tóm tắt

**Nhập dữ liệu & Mặc định** (dán Excel / CSV / nhập tay) → **Xem trước & Xác nhận** (sửa hết dòng bị chặn, rà dòng cảnh báo) → **Xác nhận tạo** → **Tiến độ & Kết quả** (đối soát mã task mới).

## 4. Quy trình gợi ý sử dụng

1. Xác định rõ **mục tiêu thay đổi** (ai nhận việc, nhãn gì, ưu tiên nào) trước khi mở trang.
2. Bước 1: chọn dự án → dùng bộ lọc thu hẹp → kiểm tra con số **"Tổng số task sẽ cập nhật"** khớp dự kiến.
3. Bước 2: chỉ bật đúng các trường cần sửa, nhập giá trị mới.
4. Bước 3: đọc nhóm **"Sẽ thay đổi"** và **diff** từng task; xử lý các task **"Cảnh báo"** (kiểm tra lại dữ liệu mới nhất trên Jira nếu thấy `stale data`).
5. Chạy, sau đó mở **Lịch sử thao tác** đối soát kết quả từng task; task **"Bị chặn"** xử lý riêng (thường do quyền hoặc dữ liệu Jira đặc biệt).

## 5. Xử lý sự cố thường gặp

| Hiện tượng | Nguyên nhân & cách xử lý |
| --- | --- |
| Nút "Xem trước" bị mờ | Chưa chọn task nào, hoặc đã bật trường nhưng **chưa nhập giá trị mới** cho trường đó. |
| Nhiều task rơi vào nhóm "Cảnh báo" với nhãn `stale data` | Dữ liệu task trong bộ nhớ local cũ hơn Jira — thường vô hại, nhưng nếu nghi ngờ hãy bấm **Làm mới/Đồng bộ Jira** rồi lặp lại wizard. |
| Task nằm ở nhóm "Bị chặn" | Tài khoản không có quyền sửa task đó trên Jira, hoặc task ở trạng thái đặc biệt. Xem chi tiết trong nhóm Bị chặn / Lịch sử thao tác. |
| Dán Excel bị lệch cột | Kiểm tra vùng copy có đúng số cột theo mẫu — dùng **"Tải mẫu Excel"** làm chuẩn; xóa bảng ("Làm mới bảng") và dán lại. |
| Bảng tạo task không cho chuyển bước | Còn dòng lỗi — xem đếm **"N lỗi cần sửa"** ở góc dưới và bấm **"Tới lỗi"**; lỗi phổ biến nhất là thiếu Tiêu đề/Loại task, hoặc thiếu **Nhãn** với các dự án bắt buộc nhãn (bấm "Sửa lỗi đầu tiên" ở bước xem trước để nhảy thẳng tới ô lỗi). |
| Muốn hoàn tác thay đổi vừa chạy | Hệ thống không có hoàn tác hàng loạt — đối soát **Lịch sử thao tác** để biết chính xác task nào bị đổi giá trị gì, sau đó tạo một lần cập nhật ngược (cần lưu ý: một số trường như trạng thái khó đảo chiều). Vì vậy **hãy tận dụng tối đa bước xem trước**. |

---

*Tài liệu viết dựa trên giao diện thực tế của hệ thống (ảnh chụp ở chế độ Sáng tại thời điểm 25/10/2026, dữ liệu minh họa dự án CICM). Khi viết phần "Tạo task hàng loạt", một dòng mẫu được soạn để chụp bước xem trước nhưng đã được **xóa sạch khỏi bảng nháp** — không có task nào được tạo trên Jira.*
