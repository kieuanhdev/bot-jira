# Xếp hạng (Bảng Phong Thần) — Hướng dẫn sử dụng

**Tài liệu hướng dẫn sử dụng Team Task Web — Phần 4: Bảng xếp hạng năng suất theo Story Point**

| Thông tin | Giá trị |
| --- | --- |
| Hệ thống | Team Task Web — https://jira.kieuanhdev.id.vn/ |
| Trang chức năng | **Xếp hạng** (menu Phân tích → Xếp hạng) |
| Địa chỉ trực tiếp | https://jira.kieuanhdev.id.vn/leaderboard |
| Đối tượng | Toàn bộ thành viên |
| Phiên bản tài liệu | 1.0 — Cập nhật 25/10/2026 |

---

## 1. Trang này dùng để làm gì?

Trang **Xếp hạng** biến số liệu Story Point thành một bảng xếp hạng năng suất của toàn đội, trình bày theo chủ đề **tu tiên** cho vui mắt:

- **Story Point bạn hoàn thành = "Tu Vi"** tích lũy.
- Tu vi càng nhiều, **"Cảnh giới"** càng cao (Luyện Khí → Trúc Cơ → Kết Dan → Nguyên Anh → Hóa Thần...).
- Xếp hạng theo **tháng / quý / năm** hoặc toàn bộ, lọc theo dự án.

> 💡 Cách tăng tu vi duy nhất là **hoàn thành task thật** trên Jira: task Done có Story Point thì điểm được "chốt" vào tu vi của bạn. Task đang làm dở được tính riêng là **"Đang bế quan"** (chưa chốt, chưa vào hạng).

## 2. Tổng quan giao diện

Vào **menu Phân tích → Xếp hạng** (hoặc mở trực tiếp `/leaderboard`):

![Tổng quan trang Xếp hạng](images/rank-01-tong-quan.png)

| Khu vực | Chức năng |
| --- | --- |
| **Sổ Cảnh Giới Tu Tiên** (nút góc phải) | Xem bảng phân cấp cảnh giới đầy đủ kèm ngưỡng điểm (xem mục 7) |
| **Làm mới** | Kéo dữ liệu Story Point mới nhất về |
| Bộ lọc kỳ: **Theo Tháng / Theo Quý / Theo Năm / Tất Cả** | Chọn khung thời gian xếp hạng |
| 3 ô chọn (Tháng, Năm, Dự án) | Chọn kỳ cụ thể (vd: Tháng 10, Năm 2026) và phạm vi dự án (vd: "Tất cả dự án mobile") |

## 3. Bốn thẻ thống kê tông môn

| Thẻ | Ý nghĩa |
| --- | --- |
| **Tổng tu vi tông môn** | Tổng Story Point toàn đội đã hoàn thành trong kỳ (vd: 1018 pts) |
| **Nhiệm vụ đã chốt** | Tổng số task đã Done trong kỳ (vd: 326 tasks) |
| **Tu vi TB / Đạo hữu** | Điểm trung bình mỗi thành viên (vd: 54 pts/thành viên) — so mình với mặt bằng chung |
| **Chí Tôn Tông Môn (MVP)** | Người đứng đầu kỳ này (vd: chienpm — 255 points tu vi) |

## 4. Thẻ "Tu vi của bạn" — tiến độ cá nhân

Ngay dưới thẻ thống kê là khối theo dõi riêng của bạn:

- **Hạng của bạn** trong tông môn (vd: `#14`) và **Cảnh giới** hiện tại (vd: `Trúc Cơ • Trung Kỳ`).
- **Tu vi tích lũy** (đã chốt) và **Đang bế quan** (task đang làm, chưa Done).
- **Thanh tiến độ đột phá** sang cảnh giới tiếp theo (vd: 71% đến `Trúc Cơ • Hậu Kỳ`).
- **Gợi ý cạnh tranh**: hệ thống tính khoảng cách với đạo hữu đứng ngay trên (vd: *"Khoảng cách với datht_mb chỉ là 2 tu vi! Luyện thêm 1 task là vượt mặt rồi!"*).
- Nút **Xem nhiệm vụ của tôi** — nhảy nhanh sang trang Việc của tôi để nhận việc mới.

> 💡 Đây là mục đích thiết kế của trang: biến việc "thêm 1 task nữa" thành động lực cụ thể — bạn luôn biết mình cần mấy điểm để lên hạng, vượt người trên, hoặc đột phá cảnh giới.

## 5. Bảng Phong Thần — Top 3

![Bảng Phong Thần top 3](images/rank-02-top-3.png)

Bục vinh danh 3 vị trí cao nhất trong kỳ:

| Vị trí | Danh hiệu |
| --- | --- |
| **#1** (giữa, đỉnh cao nhất) | **ĐẠO TỔ** |
| **#2** (trái) | **TIÊN TÔN** |
| **#3** (phải) | **CHÂN QUÂN** |

Mỗi bục hiển thị: avatar, tên + username, cảnh giới hiện tại, tổng tu vi và số nhiệm vụ hoàn thành. Bấm **"Xem nhiệm vụ đóng góp"** / **"Chi tiết nhiệm vụ"** để xem task cụ thể người đó đã làm.

## 6. Bảng Tổng Sắp — toàn bộ thành viên

![Bảng tổng sắp toàn đội](images/rank-03-bang-tong-sap.png)

Bảng xếp hạng đầy đủ (vd: 20 đạo hữu) với các cột:

| Cột | Ý nghĩa |
| --- | --- |
| **Hạng** | Thứ tự trong kỳ (3 vị trí đầu có huy hiệu vàng/bạc/đồng) |
| **Đạo Hữu** | Avatar + tên + username; dòng của bạn có nhãn **"Bạn"** và nền nổi bật để tìm nhanh |
| **Cảnh Giới** | Cấp bậc tu vi theo tổng điểm (vd: `Nguyên Anh • Đại Viên Mãn`, `Trúc Cơ • Trung Kỳ`) |
| **Tu Vi Đã Chốt** | Story Point của các task đã Done trong kỳ — cột chính để xếp hạng |
| **Đang Bế Quan** | Story Point của task đang làm dở, chưa được tính hạng |
| **Nhiệm Vụ** | Số task đã hoàn thành |
| **Đóng Góp** | Phần trăm đóng góp vào tổng tu vi tông môn (kèm thanh tỉ lệ) |
| **Chi Tiết** | Nút **"Xem"** mở danh sách task đóng góp của đạo hữu đó |

**Công cụ hỗ trợ trên bảng:**

- **Ô tìm kiếm "Tìm đạo hữu"** — gõ tên để nhảy tới thành viên.
- **Ô sắp xếp** — đổi tiêu chí: `Tu vi đã chốt (Cao → Thấp)` (mặc định), hoặc các tiêu chí khác như số nhiệm vụ, đóng góp...

## 7. Sổ Cảnh Giới Tu Tiên — bảng phân cấp cảnh giới

Bấm nút **"Sổ Cảnh Giới Tu Tiên"** ở góc trên phải:

![Sổ Cảnh Giới Tu Tiên](images/rank-05-so-canh-gioi.png)

Đây là "luật chơi" của hệ thống cảnh giới:

- **Mỗi Story Point = 1 điểm Tu Vi.**
- Các đại cảnh giới xếp từ thấp lên cao (Luyện Khí → Trúc Cơ → Kết Dan → Nguyên Anh → Hóa Thần), **mỗi đại cảnh giới gồm 4 tầng**: Sơ Kỳ → Trung Kỳ → Hậu Kỳ → Đại Viên Mãn (Đỉnh Phong).
- Mỗi tầng ghi rõ **ngưỡng Tu Vi tối thiểu** (vd: Hóa Thần • Sơ Kỳ `≥ 290 pts`, Hóa Thần • Đỉnh Phong `≥ 500 pts`) kèm mô tả vui về "lộ trình tu luyện".
- Tổng điểm tích lũy của bạn quyết định cảnh giới — và cảnh giới hiển thị bên cạnh tên bạn ở mọi trang xếp hạng.

## 8. Quy trình gợi ý sử dụng

1. **Đầu tháng**: mở trang, chọn kỳ **Theo Tháng** → xem mục tiêu cá nhân: hạng hiện tại, điểm cần để vượt người trên hoặc đột phá cảnh giới.
2. **Hàng tuần**: sau khi chốt task trên Jira, bấm **Làm mới** để cập nhật tu vi.
3. Dùng phần **"Khoảng cách với đạo hữu..."** làm động lực ngắn hạn — thường chỉ cần 1–2 task là đổi hạng.
4. Bấm **Xem** trên dòng bất kỳ để học hỏi: xem người dẫn đầu làm những loại task nào, điểm bao nhiêu.
5. **Cuối kỳ**: xem Bảng Phong Thần và cột **Đóng Góp %** để nhìn lại bức tranh cả team.

## 9. Xử lý sự cố thường gặp

| Hiện tượng | Nguyên nhân & cách xử lý |
| --- | --- |
| Điểm không tăng dù task đã Done | Task cần được chuyển **Done trên Jira** và có **Story Point**; dữ liệu đồng bộ định kỳ — bấm **Làm mới**. Kiểm tra task có nằm trong phạm vi dự án đang lọc không. |
| Cảnh giới hiển thị khác mong đợi | Cảnh giới tính theo **tổng điểm tích lũy** (chứ không chỉ trong kỳ đang xem). Đổi kỳ không đổi cảnh giới. |
| Không thấy mình trong bảng | Bảng hiển thị tối đa các thành viên có dữ liệu; dùng ô **Tìm đạo hữu**. Nếu vẫn không thấy, task của bạn có thể chưa có Story Point hoặc chưa Done. |
| Điểm "Đang bế quan" lớn nhưng hạng thấp | Bình thường — điểm bế quan là task **chưa Done**, chưa tính vào hạng. Hoàn thành task để chuyển điểm vào "Đã chốt". |
| Thứ hạng thay đổi bất ngờ | Tu vi của người khác cũng cập nhật khi họ chốt task. Sắp xếp theo tiêu chí khác trong ô sắp xếp để xem góc độ khác. |
| Muốn xem chi tiết một thành viên | Bấm **Xem** ở cột Chi Tiết, hoặc bấm "Chi tiết nhiệm vụ" trên bục Top 3. |

---

*Tài liệu viết dựa trên giao diện thực tế của hệ thống (ảnh chụp ở chế độ Sáng, dữ liệu kỳ Tháng 10/2026 tại thời điểm 25/10/2026). Các phần tiếp theo của bộ tài liệu: Bảng công việc (Board), Cập nhật hàng loạt, Quản lý phát hành...*
