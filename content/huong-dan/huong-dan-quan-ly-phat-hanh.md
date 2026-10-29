# Quản lý phát hành — Hướng dẫn sử dụng

**Tài liệu hướng dẫn sử dụng Team Task Web — Phần 6: Theo dõi Fix Version Jira và trạng thái merge Git**

| Thông tin | Giá trị |
| --- | --- |
| Hệ thống | Team Task Web — https://jira.kieuanhdev.id.vn/ |
| Trang chức năng | **Quản lý phát hành** (menu Delivery → Quản lý phát hành) |
| Địa chỉ trực tiếp | https://jira.kieuanhdev.id.vn/release |
| Đối tượng | Leader, quản lý dự án, thành viên phát hành phiên bản |
| Phiên bản tài liệu | 1.0 — Cập nhật 25/10/2026 |

---

## 1. Trang này dùng để làm gì?

Trang **Quản lý phát hành** theo dõi toàn bộ **bản phát hành (Fix Version)** trên Jira cùng **trạng thái merge Git từ Bitbucket** của từng task, giúp trả lời hai câu hỏi quan trọng:

- **Phiên bản này đã "chín" chưa?** — task đã Done hết chưa, PR đã merge hết chưa (điều kiện **Release Gate**).
- **Còn thiếu gì để phát hành được?** — task nào chưa có nhánh, chưa tạo PR, PR chưa merge.

> 💡 Trang gộp 2 nguồn dữ liệu: **Jira** (trạng thái task, Fix Version) và **Bitbucket** (nhánh, Pull Request). Nút **"Đồng bộ từ Jira"** trên cùng bên phải giúp kéo dữ liệu mới nhất về bất cứ lúc nào.

## 2. Tổng quan giao diện

Vào **menu Delivery → Quản lý phát hành** (hoặc mở `/release`):

![Tổng quan trang Quản lý phát hành](images/release-01-tong-quan.png)

### 2.1. Năm thẻ thống kê phiên bản

| Thẻ | Ý nghĩa |
| --- | --- |
| **Tổng hoạt động** | Toàn bộ phiên bản chưa lưu trữ (vd: 23) |
| **Đang thực hiện** | Phiên bản còn task chưa Done hoặc PR chưa merge (vd: 18) |
| **Sẵn sàng** | Phiên bản mà **tất cả task Done & Git đã merge** — đủ điều kiện bấm phát hành (vd: 2) |
| **Chưa có task** | Phiên bản chưa được gán task nào |
| **Đã phát hành** | Phiên bản đã phát hành trên Jira (vd: 3) |

Bấm thẻ để lọc danh sách bên dưới theo nhóm tương ứng (đồng bộ với hàng chip lọc trạng thái).

### 2.2. Bộ lọc và tìm kiếm

- **Ô chọn dự án** — chỉ xem phiên bản của một dự án (CICM, EPM, MR, EPB...).
- **Chip trạng thái**: Tất cả / Đang thực hiện / Sẵn sàng / Chưa có task / Đã phát hành.
- **Ô tìm kiếm** — gõ tên phiên bản, mã dự án hoặc mã task (vd: `CICM-927`).

## 3. Đọc một thẻ phiên bản

Mỗi phiên bản là một thẻ gồm:

- **Dự án + tên phiên bản** (vd: `CICM v6.11.1 - Báo cáo lỗi ứng dụng`) — có icon mở trang version gốc trên Jira.
- **Trạng thái** (badge): `Đang thực hiện` / `Sẵn sàng phát hành` / `Đã phát hành`.
- **Hai thanh tiến độ song song** — điểm đặc biệt của trang:

| Thanh | Đo lường | Ví dụ |
| --- | --- | --- |
| **Tiến độ Jira** | Tỉ lệ task Done trên tổng task của version | 6 / 22 task Done (27%) |
| **Tiến độ Git Delivery** | Tỉ lệ task "sẵn sàng" (code đã merge đủ) | 0 / 22 task sẵn sàng (0%) |

> 💡 **Hai thanh lệch nhau là tín hiệu quan trọng**: Jira 100% nhưng Git Delivery thấp nghĩa là task đã đóng trên Jira nhưng **code chưa merge hết** — chưa được phát hành, phải xử lý Git trước.

- Nút **"Xem chi tiết N task"** hoặc **"Mở rộng chi tiết"** (mũi tên ˅) — mở danh sách công việc ngay trong thẻ.

## 4. Chi tiết công việc trong phiên bản

Mở rộng thẻ phiên bản đang thực hiện:

![Phiên bản mở rộng với tab Công việc](images/release-02-mo-rong-version.png)

Thẻ mở rộng có 2 tab: **Công việc (N)** và **Ghi chú & Changelog**, kèm nút **"Thêm task vào phiên bản"**.

### 4.1. Tab Công việc — từng task và rào cản của nó

![Danh sách task với cảnh báo rủi ro](images/release-03-danh-sach-task.png)

Mỗi dòng task hiển thị:

- **Mã + tiêu đề task**, người phụ trách, Story Points, mức ưu tiên.
- **Trạng thái Jira** (badge: To do, To Do Test...).
- **Trạng thái Git** (badge: `Chưa có branch` / `Chưa tạo PR` / `PR chưa merge` / `MERGED`).
- **Cảnh báo đỏ** giải thích chính xác điều kiện chưa đạt, ví dụ:
  - *"Trạng thái Jira 'To do' chưa thuộc nhóm Done. Task cần code nhưng chưa có nhánh nào được xác nhận liên kết."*
  - *"Pull Request trên CICB/mobile-cic-2021/feature/report-issue chưa được merge"* (kèm link xem PR).
- **Link nhánh + PR** (vd: `CICB/mobile-cic-2021 / feat/CICM-914 PR #907 (MERGED)`).
- Nút **"Gán nhánh"** — tạo/liên kết nhánh Git cho task chưa có nhánh (tích hợp Bitbucket, xem thêm trang Nhánh & Delivery).

> 💡 **Workflow kiểm tra trước phát hành**: đọc từ trên xuống, mỗi cảnh báo đỏ là một việc cần làm — nhắc dev gán nhánh, tạo PR, hoặc merge PR còn treo.

### 4.2. Tab Ghi chú & Changelog

![Tab Ghi chú & Changelog](images/release-04-ghi-chu-changelog.png)

- Ô văn bản để viết **ghi chú nội bộ hoặc changelog phát hành** cho phiên bản (gồm những gì đã sửa, lỗi đã fix, lưu ý khi deploy...).
- Bấm **"Lưu ghi chú"** để lưu lại cho cả nhóm xem.

## 5. Phát hành phiên bản (Release Gate)

Lọc theo **"Sẵn sàng"** để xem các phiên bản đủ điều kiện:

![Phiên bản Sẵn sàng phát hành](images/release-05-san-sang-phat-hanh.png)

Một phiên bản đạt trạng thái **"Sẵn sàng phát hành"** khi:

1. ✅ **Tiến độ Jira 100%** — toàn bộ task thuộc version đã Done.
2. ✅ **Tiến độ Git Delivery 100%** — toàn bộ task có nhánh xác nhận và PR đã merge.

Khi cả 2 thanh đều xanh đầy, nút **"Phát hành trên Jira"** sáng lên — bấm để chính thức phát hành phiên bản trên Jira (đánh dấu Release Date, chuyển version sang trạng thái Released).

> ⚠️ **Lưu ý quan trọng**: hành động phát hành là thao tác **thật trên Jira** và ảnh hưởng cả nhóm (thông báo phát hành, release gate, lịch sử phiên bản). Chỉ bấm khi bạn có trách nhiệm phát hành và đã kiểm tra đủ điều kiện. Hệ thống có quy tắc **Release Gate** — nếu dự án còn lỗi Sentry blocker chưa giải quyết, việc phát hành có thể bị chặn theo quy định (xem phần Tài liệu & Guide).

## 6. Quy trình gợi ý cho một kỳ phát hành

1. **Đầu sprint**: vào trang, xem các phiên bản **Đang thực hiện** của dự án mình — nắm tổng tiến độ Jira vs Git.
2. **Hàng ngày**: mở rộng phiên bản, đọc các **cảnh báo đỏ** — nhắc đồng nghiệp gán nhánh/tạo PR/merge PR còn thiếu.
3. **Trước ngày phát hành**: lọc **"Sẵn sàng"** — xác nhận version đã 2 thanh 100%, viết **Ghi chú & Changelog**.
4. **Phát hành**: bấm **"Phát hành trên Jira"** trên phiên bản đủ điều kiện.
5. **Sau phát hành**: phiên bản chuyển sang nhóm **Đã phát hành** (kèm ngày phát hành, vd: 17/10/2026) — dùng làm tra cứu khi cần rollback hoặc đối chiếu.

## 7. Xử lý sự cố thường gặp

| Hiện tượng | Nguyên nhân & cách xử lý |
| --- | --- |
| Nút "Phát hành trên Jira" không có/mờ | Phiên bản chưa đủ điều kiện — xem 2 thanh tiến độ và các cảnh báo đỏ trong tab Công việc, xử lý hết task chưa Done và PR chưa merge. |
| Jira đã Done hết nhưng Git Delivery thấp | Task bị đóng trên Jira nhưng nhánh/PR chưa đúng: mở tab Công việc để xem task nào "Chưa có branch", "Chưa tạo PR" hoặc "PR chưa merge". |
| Không thấy phiên bản của mình | Kiểm tra ô chọn dự án và chip trạng thái đang lọc; bấm **"Đồng bộ từ Jira"** để kéo version mới tạo trên Jira về. |
| Task vừa merge PR vẫn còn cảnh báo | Trạng thái merge được cập nhật khi Bitbucket webhook đồng bộ — chờ ít phút rồi bấm **Đồng bộ từ Jira** / **Làm mới**. |
| Thêm task vào phiên bản không thấy task | Chỉ task cùng dự án với version mới được gán; kiểm tra mã dự án khi tìm. |
| Muốn xem luồng công việc chi tiết hơn | Kết hợp với **Báo cáo dự án** (tab Agile & Burndown của version cụ thể) và **Nhánh & Delivery** để theo dõi nhánh/PR chi tiết. |

---

*Tài liệu viết dựa trên giao diện thực tế của hệ thống (ảnh chụp ở chế độ Sáng tại thời điểm 25/10/2026; phiên bản minh họa: CICM v6.11.1). Trong quá trình viết tài liệu, hệ thống chỉ được xem và mở rộng thẻ — không phát hành phiên bản nào.*
