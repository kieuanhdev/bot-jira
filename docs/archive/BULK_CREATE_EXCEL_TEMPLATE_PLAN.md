# Kế hoạch Bulk Create bằng Excel theo cấu hình dự án

> Phiên bản: 1.0  
> Ngày lập: 2026-10-01  
> Trạng thái: Proposed  
> Phạm vi: `/bulk/create`, xuất mẫu `.xlsx`, nhập `.xlsx`, Jira create metadata,
> data validation, preview và tạo task hàng loạt  
> Tài liệu liên quan: `docs/BULK_CREATE_SMART_TASK_PLAN.md`

## 1. Mục tiêu

Cho phép người dùng nhập nhanh nhiều task bằng một file Excel được sinh riêng cho
dự án đã chọn. Các trường có tập giá trị do Jira quản lý phải có dropdown trong
Excel để giảm lỗi nhập sai và giúp người dùng không cần nhớ ID hoặc giá trị nội bộ.

Luồng mục tiêu:

1. Người dùng chọn dự án trên `/bulk/create`.
2. Hệ thống tải create metadata và quyền từ Jira.
3. Người dùng bấm **Tải mẫu Excel theo dự án**.
4. Hệ thống sinh file `.xlsx` chứa dropdown và hướng dẫn tương ứng với dự án.
5. Người dùng điền tối đa 100 task rồi tải file lên.
6. Hệ thống đọc file, chuẩn hóa dữ liệu và hiển thị preview theo từng dòng.
7. Người dùng sửa lỗi hoặc xác nhận để tạo task bằng queue hiện có.

## 2. Lý do tách khỏi luồng CSV hiện tại

CSV, TSV và dữ liệu paste chỉ chứa text, không lưu được dropdown, kiểu ô, hướng
dẫn, công thức validation hay sheet danh mục. Vì vậy yêu cầu này phải dùng định
dạng `.xlsx` thực sự, không đổi tên một file CSV thành `.xlsx`.

Luồng CSV/paste hiện tại vẫn được giữ để phục vụ nhập nhanh và tương thích ngược.
Excel là lựa chọn ưu tiên cho người dùng cần chuẩn bị batch lớn theo mẫu dự án.

## 3. Phạm vi

### 3.1 Trong phạm vi

- Sinh mẫu `.xlsx` theo project đang chọn.
- Dropdown cho Issue Type, Priority, Assignee, Fix Version và custom field có
  `allowedValues`.
- Validation kiểu dữ liệu cho ngày, Story Points và các trường số.
- Hỗ trợ task cha–con bằng `clientRef`, `parentRef` và `parentKey`.
- Nhập trực tiếp file `.xlsx` vào Bulk Create.
- Map tên hiển thị trong Excel về ID Jira.
- Preview và validation lại hoàn toàn ở server trước khi tạo task.
- Giữ giới hạn tối đa 100 task trong một batch.
- Cảnh báo khi metadata của project đã thay đổi kể từ lúc tải mẫu.

### 3.2 Ngoài phạm vi bản đầu

- Định dạng `.xls` cũ.
- Macro/VBA và file `.xlsm`.
- Attachment hoặc ảnh nhúng trong Excel.
- Nhiều project trong cùng một file.
- Tạo user, version, priority, issue type hoặc option mới trên Jira.
- Chỉnh sửa file Excel trực tuyến trong ứng dụng.
- Dropdown nhiều lựa chọn thực sự trong một ô bằng macro.

## 4. Trải nghiệm người dùng

### 4.1 Tải mẫu

Trong hộp thoại import, thêm nút chính:

**Tải mẫu Excel cho `{PROJECT_KEY}`**

Khi metadata đang tải, nút dùng Skeleton hoặc bị vô hiệu hóa với mô tả rõ ràng.
Nếu không đọc được metadata hay người dùng không có quyền tạo issue, không sinh
mẫu rỗng hoặc mẫu dùng giá trị giả.

Tên file đề xuất:

```text
bulk-create-{PROJECT_KEY}-{YYYYMMDD}.xlsx
```

Ví dụ:

```text
bulk-create-MOBILE-20261001.xlsx
```

### 4.2 Nhập file

Khu vực tải file chấp nhận thêm `.xlsx`. Sau khi chọn file, giao diện hiển thị:

- Tên project trong file và project đang chọn.
- Thời điểm mẫu được tạo.
- Tổng số dòng đọc được, dòng hợp lệ và dòng có lỗi.
- Metadata có còn khớp hay đã thay đổi.
- Lỗi theo đúng số dòng và tên cột Excel.
- Lựa chọn thay thế danh sách hiện tại hoặc nối thêm.

Không đưa dữ liệu vào grid nếu file sai project, sai cấu trúc nghiêm trọng hoặc
vượt giới hạn mà người dùng chưa xác nhận cắt bớt.

## 5. Cấu trúc workbook

Workbook gồm ba sheet:

### 5.1 Sheet `Tasks`

Đây là sheet duy nhất người dùng cần thao tác.

| Cột | Bắt buộc | Kiểu nhập | Ghi chú |
|-----|:--------:|-----------|---------|
| Client Ref | Có | Text | Duy nhất trong file, ví dụ `TASK-001` |
| Summary | Có | Text | Tối đa 255 ký tự |
| Issue Type | Có | Dropdown | Lấy từ issue type của project |
| Parent Ref | Có điều kiện | Dropdown/Text | Dùng cho sub-task trỏ đến dòng cha trong file |
| Parent Jira Key | Có điều kiện | Text | Dùng cho sub-task trỏ đến issue Jira có sẵn |
| Description | Không | Text nhiều dòng | Không vượt giới hạn Jira |
| Assignee | Không | Dropdown | Chỉ user assignable trong project |
| Priority | Theo metadata | Dropdown | Không dùng danh sách priority giả định |
| Labels | Không | Text | Phân cách bằng dấu phẩy; cho phép giá trị mới |
| Story Points | Theo metadata | Số nguyên | Chỉ xuất khi project hỗ trợ |
| Original Estimate | Theo metadata | Text | Ví dụ `1d 4h`, `2h` |
| Due Date | Theo metadata | Date | Hiển thị `yyyy-mm-dd` |
| Fix Versions | Không | Dropdown/Text | MVP hỗ trợ một version; nhiều version phân cách bằng dấu phẩy |
| Custom fields | Theo metadata | Tùy schema | Sinh động theo create metadata |

Các cột không khả dụng trong project không nên xuất hiện. Trường bắt buộc được
đánh dấu bằng `*`, có màu header riêng và có ghi chú hướng dẫn trong ô header.

Freeze hàng tiêu đề, bật filter và đặt độ rộng cột phù hợp. Tạo sẵn 100 dòng
trống có data validation, tương ứng giới hạn hiện tại của Bulk Create.

### 5.2 Sheet `Danh_muc`

Sheet này chứa nguồn cho dropdown:

- Issue type: ID, tên, `subtask`.
- Priority: ID, tên.
- Assignee: username/account identifier, display name.
- Fix Version: ID, tên, trạng thái released/archived.
- Allowed values của từng custom field.

Các vùng dữ liệu được khai báo bằng named range thay vì nhúng toàn bộ danh sách
trực tiếp vào công thức data validation. Cách này tránh giới hạn độ dài chuỗi
validation của Excel và hỗ trợ danh sách lớn tốt hơn.

Sheet được đặt trạng thái hidden trong MVP. Không dùng `veryHidden` như một biện
pháp bảo mật vì dữ liệu trong workbook vẫn có thể được đọc bằng công cụ khác.

### 5.3 Sheet `Huong_dan`

Nội dung ngắn gọn bằng tiếng Việt:

- Không đổi tên sheet `Tasks` hoặc tên header.
- Không xóa `Client Ref` của dòng có dữ liệu.
- Chỉ dùng một trong `Parent Ref` và `Parent Jira Key`.
- Cách nhập label, estimate và nhiều Fix Version.
- File chỉ áp dụng cho project được ghi trong mẫu.
- Dropdown chỉ là hỗ trợ nhập; dữ liệu vẫn được kiểm tra lại khi upload.

## 6. Quy tắc dropdown và mapping

### 6.1 Giá trị hiển thị và giá trị Jira

Người dùng cần thấy tên dễ hiểu, không phải ID Jira. Khi import, hệ thống map tên
về ID dựa trên snapshot trong workbook rồi đối chiếu lại metadata hiện tại.

Để tránh nhập nhầm khi hai option trùng tên, giá trị dropdown nên có dạng:

```text
Task [10001]
High [3]
Nguyễn Văn A [nguyenvana]
Release 1 [10420]
```

Importer không được tin ID trong file một cách tuyệt đối. ID phải tồn tại trong
metadata hiện tại và hợp lệ với Issue Type của dòng.

### 6.2 Trường đơn lựa chọn

Áp dụng dropdown chuẩn của Excel cho:

- Issue Type.
- Priority.
- Assignee.
- Custom select/radio field.
- Fix Version trong MVP một lựa chọn.

Cho phép ô trống nếu Jira cho phép. Với trường bắt buộc, Excel hiển thị cảnh báo
nhưng server vẫn là nguồn quyết định cuối cùng.

### 6.3 Trường đa lựa chọn

Excel data validation không hỗ trợ multi-select chuẩn nếu không dùng macro. Do
đó MVP dùng chuỗi phân cách bằng dấu phẩy cho:

- Labels.
- Nhiều Fix Version.
- Custom multi-select.

Có thể bổ sung sheet nhập dạng bảng phụ ở pha sau nếu nhu cầu multi-select cao;
không dùng VBA vì tăng rủi ro bảo mật và giảm tương thích.

### 6.4 Field phụ thuộc Issue Type

Create metadata của Jira có thể trả allowed values và required fields khác nhau
cho từng Issue Type. Workbook tĩnh không thể phản ánh hoàn hảo mọi thay đổi khi
người dùng đổi Issue Type trên một dòng.

Quyết định cho MVP:

- Xuất hợp của các custom field được phép tạo trong project.
- Ghi rõ Issue Type áp dụng trong comment/header.
- Chỉ đưa dropdown những giá trị có thể map an toàn.
- Khi import, validate field theo Issue Type thực tế của từng dòng.
- Field không áp dụng sẽ bị bỏ qua kèm cảnh báo hoặc bị chặn nếu có nguy cơ gửi
  dữ liệu sai sang Jira.

Pha sau có thể dùng named range phụ thuộc Issue Type cho các project có metadata
ổn định, nhưng server validation vẫn bắt buộc.

## 7. Assignee

Endpoint assignee hiện tại là API tìm kiếm, tối đa 50 kết quả mỗi truy vấn. Cơ
chế này phù hợp với combobox trên web nhưng chưa bảo đảm lấy đủ danh sách để đưa
vào Excel.

Trước khi xuất dropdown assignee cần chọn một trong hai hướng:

1. Bổ sung API phân trang để lấy toàn bộ user assignable của project.
2. Giới hạn dropdown ở danh sách user thường dùng/gần đây và vẫn cho phép nhập
   username thủ công, sau đó xác thực lại khi upload.

Khuyến nghị chọn hướng 1 nếu Jira API của phiên bản đang dùng hỗ trợ phân trang
ổn định. Nếu số user quá lớn, file vẫn có thể chứa danh mục nhưng UI phải cảnh
báo thời gian sinh mẫu lâu hơn.

Không đưa token, email không cần thiết hoặc dữ liệu xác thực vào workbook.

## 8. Metadata snapshot và file manifest

Workbook cần chứa manifest để xác định nguồn gốc và phát hiện mẫu cũ. Có thể đặt
trong custom properties hoặc một vùng ẩn của sheet danh mục:

```json
{
  "schemaVersion": 1,
  "projectKey": "MOBILE",
  "generatedAt": "2026-10-01T10:00:00.000Z",
  "metadataFingerprint": "sha256:...",
  "maxItems": 100
}
```

Khi upload:

- `projectKey` khác project đang chọn: chặn import.
- `schemaVersion` không hỗ trợ: chặn và yêu cầu tải mẫu mới.
- `metadataFingerprint` thay đổi: vẫn đọc file nhưng cảnh báo, sau đó validate
  toàn bộ bằng metadata mới nhất.
- Không có manifest: coi là workbook ngoài hệ thống và chỉ import nếu header có
  thể map an toàn; hiển thị cảnh báo rõ ràng.

## 9. Kiến trúc đề xuất

### 9.1 API xuất mẫu

```text
GET /api/bulk/create/excel-template?project={PROJECT_KEY}
```

Trách nhiệm:

1. Kiểm tra session và Jira credentials.
2. Chuẩn hóa project key.
3. Kiểm tra quyền create issue.
4. Lấy create metadata, versions và assignee.
5. Sinh workbook trong bộ nhớ.
6. Trả file với MIME type `.xlsx` và `Content-Disposition: attachment`.

Không nhận metadata do client gửi lên để sinh danh mục vì dữ liệu có thể cũ hoặc
bị sửa.

### 9.2 API import Excel

```text
POST /api/bulk/create/excel-import
Content-Type: multipart/form-data
```

API chỉ phân tích và chuẩn hóa file, chưa tạo Jira issue. Kết quả trả về tương
thích với `BulkCreateRowInput` và cấu trúc lỗi hiện tại để có thể đưa vào grid.

Các bước:

1. Kiểm tra session, extension, MIME type và kích thước.
2. Đọc workbook, chỉ chấp nhận cấu trúc cần thiết.
3. Đọc manifest và header.
4. Giới hạn số sheet, số dòng, số cột và độ dài ô.
5. Map giá trị hiển thị về canonical value/ID.
6. Chống formula injection và không thực thi external link/macro.
7. Trả danh sách row, lỗi và cảnh báo.

Sau khi người dùng xác nhận import vào grid, luồng preview/confirm hiện có tiếp
tục chịu trách nhiệm validation nghiệp vụ và tạo operation.

### 9.3 Module dùng chung

Đề xuất tách các phần sau:

```text
src/lib/bulk/excel-template.ts       — Sinh workbook và named ranges
src/lib/bulk/excel-parser.ts         — Đọc, giới hạn và chuẩn hóa workbook
src/lib/bulk/excel-schema.ts         — Header, manifest và schema version
src/app/api/bulk/create/excel-template/route.ts
src/app/api/bulk/create/excel-import/route.ts
```

Không đặt toàn bộ logic đọc/ghi Excel trong React component.

## 10. Validation

### 10.1 Trong Excel

- Summary không trống và tối đa 255 ký tự.
- Story Points là số nguyên không âm.
- Due Date là ngày hợp lệ.
- Dropdown dùng named range tương ứng.
- Conditional formatting đánh dấu các ô bắt buộc trống.
- Parent Ref và Parent Jira Key không được cùng có giá trị.

Validation trong Excel chỉ nhằm hỗ trợ nhập liệu, không phải lớp bảo mật.

### 10.2 Khi import

- Header bắt buộc tồn tại và không trùng canonical field.
- Không quá 100 dòng có dữ liệu.
- Client Ref không trùng.
- Không chấp nhận công thức ở trường text; lấy giá trị an toàn hoặc báo lỗi.
- Issue Type, Priority, Version và custom option phải map được.
- Ngày và số dùng parser nghiêm ngặt, không phụ thuộc locale của máy chủ.
- Không dùng đồng thời Parent Ref và Parent Jira Key.

### 10.3 Khi preview

Tái sử dụng validator hiện tại để kiểm tra:

- Required field theo Issue Type.
- Allowed values hiện tại của Jira.
- Assignee có thực sự assignable.
- Quan hệ task cha–con và cycle.
- Metadata fingerprint.
- Duplicate summary và các rule nghiệp vụ hiện có.

## 11. Bảo mật và độ bền

- Giới hạn kích thước file, đề xuất ban đầu 5 MB.
- Chỉ chấp nhận `.xlsx`; từ chối `.xls`, `.xlsm`, file nén tùy ý và workbook mã
  hóa bằng mật khẩu.
- Giới hạn tối đa số sheet, row, column, shared strings và độ dài từng cell để
  giảm nguy cơ zip bomb hoặc cạn bộ nhớ.
- Không tải external links, embedded object hoặc remote resource.
- Không đánh giá công thức.
- Khi xuất CSV/Excel, escape text bắt đầu bằng `=`, `+`, `-`, `@` nếu có thể bị
  Excel hiểu là công thức.
- Không ghi Jira token hay thông tin bí mật vào file/log.
- Log metric thời gian sinh/đọc file, số dòng, số lỗi; không log Description hoặc
  dữ liệu nhạy cảm của task.

## 12. Lộ trình triển khai

### P0 — Nền tảng Excel

| Ticket | Nội dung | Kết quả |
|--------|----------|---------|
| BC-XLSX-001 | Chọn thư viện `.xlsx` và tạo spike | Xác nhận hỗ trợ data validation, named range, hidden sheet và đọc file an toàn |
| BC-XLSX-002 | Định nghĩa schema/manifest v1 | Header và version contract có test |
| BC-XLSX-003 | API sinh mẫu theo project | Tải được workbook có `Tasks`, `Danh_muc`, `Huong_dan` |
| BC-XLSX-004 | Dropdown trường chuẩn | Issue Type, Priority, Assignee, Fix Version lấy từ Jira |
| BC-XLSX-005 | Nút tải mẫu trong UI | Nút gắn với project đang chọn, có loading/error state |

### P1 — Import và preview

| Ticket | Nội dung | Kết quả |
|--------|----------|---------|
| BC-XLSX-101 | Parser `.xlsx` an toàn | Trả `BulkCreateRowInput`, errors và warnings |
| BC-XLSX-102 | API upload/import | Nhận multipart, kiểm tra giới hạn và manifest |
| BC-XLSX-103 | UI upload `.xlsx` | Hiển thị thống kê và lỗi theo dòng/cột |
| BC-XLSX-104 | Mapping tên về Jira ID | Không yêu cầu người dùng nhập ID Jira |
| BC-XLSX-105 | Metadata stale handling | Cảnh báo mẫu cũ và validate lại bằng metadata mới |
| BC-XLSX-106 | Parent mapping | Hỗ trợ `parentRef`, `parentKey` và cycle validation hiện có |

### P2 — Custom field và nâng cao

| Ticket | Nội dung | Kết quả |
|--------|----------|---------|
| BC-XLSX-201 | Custom select fields | Sinh cột/dropdown từ `allowedValues` |
| BC-XLSX-202 | Custom field theo Issue Type | Chỉ dẫn và validation chính xác theo từng loại issue |
| BC-XLSX-203 | Multi-value UX | Chuẩn hóa labels, versions và custom multi-select |
| BC-XLSX-204 | Assignee pagination | Danh sách dropdown đầy đủ hoặc chiến lược giới hạn rõ ràng |
| BC-XLSX-205 | Template compatibility | Migration/error message khi schema version thay đổi |

## 13. Tiêu chí nghiệm thu MVP

- Chọn project A và tải mẫu thì dropdown chỉ chứa giá trị hợp lệ của project A.
- File mở bình thường trên Microsoft Excel mà không báo workbook bị hỏng.
- LibreOffice và Google Sheets có thể mở file; khác biệt dropdown được ghi nhận
  trong tài liệu kiểm thử.
- Có sẵn tối đa 100 dòng nhập với validation.
- Người dùng không cần biết Jira ID để điền Issue Type, Priority và Version.
- Upload `.xlsx` tạo ra dữ liệu grid tương đương nhập tay.
- File sai project bị chặn trước khi thêm vào grid.
- Mẫu cũ metadata hiển thị cảnh báo và không bỏ qua server validation.
- Giá trị dropdown đã bị xóa khỏi Jira bị báo đúng dòng/cột.
- Assignee không assignable bị chặn trước khi tạo operation.
- Task cha–con trong file được tạo đúng thứ tự bằng worker hiện tại.
- CSV/TSV/paste hiện tại không bị ảnh hưởng.

## 14. Kế hoạch kiểm thử

### Unit test

- Sinh đúng header, manifest và named ranges.
- Escape tên range và tên option đặc biệt.
- Parse date, number, empty cell và formatted cell.
- Map display value về ID.
- Phát hiện duplicate header/clientRef.
- Phát hiện formula cell, file sai project và schema không hỗ trợ.
- Giới hạn 100 item và độ dài cell.

### Integration test

- Metadata Jira mẫu → workbook → parser → `BulkCreateRowInput`.
- Mẫu tải trước, metadata thay đổi, sau đó upload.
- Issue Type thường và Sub-task có Parent Ref.
- Required custom field và allowed value theo Issue Type.
- Assignee không còn assignable.

### UI/E2E

- Chọn project → tải mẫu → điền file → upload → preview → confirm.
- Loading dùng Skeleton; lỗi có hướng xử lý.
- Empty state có icon, tiêu đề và mô tả.
- Light/dark mode và keyboard navigation của màn upload.
- Không làm mất các dòng đang có khi chọn chế độ append.

### Kiểm thử tương thích thủ công

- Microsoft Excel desktop.
- Excel Online.
- Google Sheets.
- LibreOffice Calc.

Microsoft Excel là nền tảng chuẩn để nghiệm thu dropdown; các nền tảng còn lại
được hỗ trợ ở mức best effort vì cách diễn giải data validation có thể khác nhau.

## 15. Rủi ro và hướng xử lý

| Rủi ro | Ảnh hưởng | Hướng xử lý |
|--------|-----------|-------------|
| Metadata đổi sau khi tải mẫu | Option trong file trở nên cũ | Fingerprint + validate lại khi upload |
| Danh sách assignee lớn | File nặng hoặc thiếu user | Phân trang, giới hạn có cảnh báo, validate server |
| Multi-select không có trong Excel chuẩn | Người dùng nhập khó | Chuỗi phân cách + preview; không dùng macro |
| Custom field phụ thuộc Issue Type | Dropdown có thể không chính xác tuyệt đối | MVP dùng union + validation theo từng dòng |
| Tên option trùng nhau | Map sai ID | Hiển thị tên kèm ID ổn định |
| Formula/external link độc hại | Rủi ro bảo mật | Không evaluate, giới hạn parser, sanitize cell |
| Workbook khác nhau giữa các ứng dụng | Dropdown/format lệch | Test compatibility, lấy Excel làm chuẩn |

## 16. Quyết định đề xuất

1. Ưu tiên Excel template/import trước các cải tiến nhập liệu nhỏ khác của Bulk
   Create vì đây là luồng chính cho batch lớn.
2. Giữ CSV/paste như phương án nhập nhanh, không cố thêm dropdown vào CSV.
3. MVP chỉ hỗ trợ `.xlsx`, không hỗ trợ `.xls` và macro.
4. Dùng Jira metadata tại thời điểm tải mẫu để hỗ trợ nhập, nhưng dùng metadata
   mới nhất tại thời điểm preview làm nguồn sự thật.
5. Tái sử dụng `BulkCreateRowInput`, validator, dependency graph, preview và queue
   worker hiện có; chỉ bổ sung lớp xuất/nhập Excel.
6. Triển khai P0 và P1 trước; custom field phụ thuộc Issue Type và multi-select
   nâng cao nằm ở P2.

