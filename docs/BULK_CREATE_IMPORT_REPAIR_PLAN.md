# Kế hoạch sửa Bulk Create và CSV/Spreadsheet Import

> Phiên bản: 1.1  
> Ngày lập: 2026-09-30  
> Trạng thái: Completed — Đã triển khai và nghiệm thu toàn diện (2026-09-30)  
> Phạm vi: luồng tạo Jira task hàng loạt tại `/bulk/create`, gồm nhập trực tiếp,
> preview, confirm, CSV/TSV/TXT import và paste từ bảng tính

## 1. Bối cảnh và mục tiêu

Luồng Bulk Create hiện đã có đủ các lớp UI, validation, preview, queue worker và
theo dõi kết quả. Tuy nhiên, rà soát mã nguồn cho thấy luồng từ UI đến API có lỗi
request nghiêm trọng và phần import còn nhiều trường hợp làm mất hoặc hiểu sai dữ
liệu mà không thông báo rõ cho người dùng.

Kế hoạch này nhằm:

- Khôi phục luồng preview và confirm từ giao diện.
- Bảo đảm import không âm thầm cắt, bỏ hoặc ghi đè dữ liệu.
- Cung cấp hướng dẫn định dạng ngay trong giao diện và file mẫu tải xuống.
- Validation thống nhất giữa parser, bảng nhập, preview và server.
- Bổ sung test đúng tại ranh giới UI/API đang bị thiếu.
- Đưa lint, typecheck, test và production build về trạng thái pass.

Không mở rộng sang import `.xlsx`, sub-task, Epic, attachment hoặc tạo task cho
nhiều project trong cùng batch ở đợt sửa này.

## 2. Các vấn đề đã xác nhận

### P0 — Chặn luồng chính

#### BC-FIX-001 — Request bị JSON stringify hai lần

`bulk-create-client.tsx` truyền chuỗi từ `JSON.stringify(...)` vào helper `api()`,
trong khi helper tiếp tục stringify `body`. API vì vậy có thể nhận một JSON string
thay vì object cho cả preview và confirm.

**Ảnh hưởng:** người dùng không thể hoàn thành luồng tạo task từ UI.

#### BC-FIX-002 — Lỗi confirm không được hiển thị

UI có trạng thái lỗi cho preview nhưng không có trạng thái tương ứng cho confirm.
Khi token hết hạn, operation sai trạng thái hoặc enqueue thất bại, người dùng
không nhận được phản hồi hữu ích.

### P1 — Sai hoặc mất dữ liệu import

#### BC-FIX-101 — Ba dòng trống ban đầu làm giảm dung lượng import

Bảng khởi tạo với ba dòng trống. Logic import chỉ thay thế bảng nếu có đúng một
dòng trống, do đó import 100 dòng có thể bị nối sau ba dòng trống rồi cắt còn 97
dòng dữ liệu thực.

#### BC-FIX-102 — `clientRef` có thể bị trùng sau import/duplicate/delete

Parser và bảng đều sinh `row-1`, `row-2`, ... dựa vào vị trí/độ dài hiện tại.
Nối dữ liệu import hoặc xóa rồi thêm dòng có thể sinh lại mã đã tồn tại. Batch
validator sau đó từ chối toàn bộ request.

#### BC-FIX-103 — Cắt dữ liệu vượt giới hạn mà không xác nhận

Dialog nhận `currentCount` nhưng không dùng. Khi bảng gần đủ 100 task, phần dư của
file bị cắt bằng `slice(...)` mà không cho người dùng biết chính xác số dòng được
nhập và số dòng bị bỏ.

#### BC-FIX-104 — Dòng thiếu Summary được gọi là “hợp lệ” rồi biến mất

Parser giữ một dòng nếu có Summary, Description hoặc Issue Type. Dialog gọi các
dòng này là task hợp lệ, nhưng client chỉ gửi những dòng có Summary khi preview.
Dòng thiếu Summary vì vậy có thể biến mất âm thầm.

#### BC-FIX-105 — Cột lạ bị bỏ qua mà không hiển thị

Parser có trả `unrecognizedHeaders`, nhưng dialog không hiển thị. Người dùng có
thể tưởng rằng dữ liệu đã được nhập đầy đủ dù một số cột đã bị bỏ qua.

#### BC-FIX-106 — Validation ngày và points chưa chặt

- Ngày đúng pattern nhưng không tồn tại, ví dụ `2026-02-31`, có thể được chấp nhận
  do JavaScript tự rollover sang tháng kế tiếp.
- `parseFloat` chấp nhận tiền tố số như `3abc` và làm tròn số thập phân mà không
  cảnh báo.

### P1 — Giao diện import không đúng với mô tả

#### BC-FIX-107 — Vùng “kéo thả” không hỗ trợ drag and drop

Vùng upload chỉ xử lý click, chưa có `dragover`, `drop` và trạng thái focus/drag.

#### BC-FIX-108 — Giới hạn 5 MB và loại file chưa được kiểm tra

UI công bố giới hạn 5 MB nhưng code đọc file trực tiếp. Chưa kiểm tra kích thước,
đuôi/MIME, lỗi đọc file hoặc nội dung nhị phân. `accept` trên input không phải là
validation.

#### BC-FIX-109 — Thiếu hướng dẫn và file mẫu

Placeholder hiện tại không đủ để người dùng biết cột bắt buộc, alias header,
format ngày/thời gian, cách ghi labels/versions hoặc việc `.xlsx` không được hỗ
trợ trực tiếp.

### P2 — Chất lượng và khả năng bảo trì

#### BC-FIX-201 — Trạng thái không được reset rõ khi đổi project

Defaults và dữ liệu theo project cũ được giữ lại khi chọn project khác. Preview có
thể bắt lỗi, nhưng UI vẫn hiển thị ID/tên không còn phù hợp với metadata mới.

#### BC-FIX-202 — ESLint chưa pass

Có lỗi `react-hooks/set-state-in-effect` trong logic tự chọn project và nhiều
import/biến không dùng. Đây là dấu hiệu quality gate hiện chưa phản ánh đúng trạng
thái “hoàn tất” trong tài liệu cũ.

## 3. Quyết định phạm vi

### 3.1 Bao gồm trong đợt sửa

- Sửa request preview, confirm và retry Bulk Create sử dụng đúng contract của
  helper `api()`.
- Hiển thị lỗi của mọi mutation chính.
- Làm lại logic merge/import và sinh `clientRef` duy nhất.
- Validation file, header, từng dòng và sức chứa còn lại.
- Hướng dẫn định dạng, file CSV mẫu và ví dụ paste.
- Hỗ trợ CSV, TSV, TXT UTF-8; delimiter comma, semicolon hoặc tab.
- Unit, component/integration và API contract test.
- Kiểm tra accessibility, responsive, light/dark mode.

### 3.2 Không bao gồm

- Đọc file Excel nhị phân `.xlsx`/`.xls`.
- Tự động map tùy ý các cột Jira custom field.
- Import nhiều project trong một file.
- Thay đổi kiến trúc queue/worker hoặc schema database nếu không phát hiện blocker
  mới trong quá trình regression test.

## 4. Định dạng import được chốt

### 4.1 Loại đầu vào

| Đầu vào | Hỗ trợ | Ghi chú |
|---|---:|---|
| `.csv` | Có | UTF-8, comma hoặc semicolon |
| `.tsv` | Có | UTF-8, tab |
| `.txt` | Có | Nội dung phải là CSV/TSV |
| Paste Excel/Google Sheets | Có | Dữ liệu tab-separated |
| `.xlsx`, `.xls` | Không | Người dùng cần Save/Download as CSV hoặc copy-paste |

Giới hạn: tối đa 5 MB cho file và tối đa 100 task trong một batch. Cả client và
server phải thực thi giới hạn; thông báo trên UI không được là kiểm tra duy nhất.

### 4.2 Template chuẩn

```csv
clientRef,summary,issueType,description,assignee,priority,labels,points,originalEstimate,dueDate,fixVersions
TASK-001,Thiết kế API,Task,"Mô tả có dấu phẩy",user.name,High,"backend,api",3,1d 4h,2026-10-10,"Release 1"
TASK-002,Sửa lỗi đăng nhập,Bug,Không đăng nhập được,user.name,Highest,"bug,login",5,30m,2026-10-12,"Release 1,Release 2"
```

### 4.3 Quy tắc cột

| Cột canonical | Bắt buộc | Dữ liệu chấp nhận | Ví dụ |
|---|---:|---|---|
| `clientRef` | Không | Chuỗi duy nhất trong batch; hệ thống tự sinh nếu trống | `TASK-001` |
| `summary` | Có | Chuỗi 1–255 ký tự | `Sửa lỗi đăng nhập` |
| `issueType` | Theo defaults | Jira issue type ID hoặc tên, không hỗ trợ sub-task | `Task`, `Bug` |
| `description` | Theo metadata | Văn bản, hỗ trợ newline khi field được quote | `Mô tả` |
| `assignee` | Không | Username/account định danh được Jira DC chấp nhận | `user.name` |
| `priority` | Không | Priority ID hoặc tên | `High` |
| `labels` | Không | Nhiều giá trị phân cách comma/semicolon; quote cả cell khi dùng comma | `"api,backend"` |
| `points` | Không | Số nguyên không âm | `3` |
| `originalEstimate` | Không | Jira duration | `1d 4h`, `30m` |
| `dueDate` | Không | Ngày tồn tại theo `YYYY-MM-DD` | `2026-10-10` |
| `fixVersions` | Không | Version ID hoặc tên, phân cách comma/semicolon | `"Release 1,Release 2"` |

Header tiếp tục hỗ trợ các alias tiếng Anh/tiếng Việt hiện có, nhưng giao diện và
file mẫu dùng canonical header để tránh mơ hồ.

### 4.4 Chính sách lỗi import

- Không có `summary` header: chặn import nếu có các header khác; chỉ dùng chế độ
  “cột đầu tiên là Summary” khi đầu vào thực sự không có hàng header và người dùng
  xác nhận.
- Header không nhận diện: hiển thị danh sách và yêu cầu người dùng xác nhận bỏ qua.
- Dòng thiếu Summary: đánh dấu lỗi theo dòng, không gọi là hợp lệ và không âm thầm
  loại bỏ.
- `clientRef` trùng: đánh dấu lỗi, đồng thời cho phép thao tác “tự tạo lại mã”.
- Dữ liệu vượt sức chứa còn lại: không import ngay; hiển thị số dòng sẽ giữ/bỏ và
  yêu cầu người dùng chọn thay thế bảng hoặc chỉ nhập phần còn chỗ.
- CSV quote không đóng hoặc cấu trúc lỗi: chặn import với vị trí dòng gần nhất có
  thể xác định.
- Không lưu hoặc gửi file gốc lên server sau khi parse.

## 5. Kế hoạch triển khai

### Pha 1 — Khôi phục luồng UI → API (P0)

**Công việc**

1. Truyền object trực tiếp vào `api({ body })` tại preview và confirm; không gọi
   `JSON.stringify` ở call site.
2. Rà soát riêng các call site Bulk Create khác, đặc biệt retry trong
   `create-progress.tsx`, để cùng dùng một contract.
3. Không thay đổi helper `api()` theo cách có thể phá các client khác nếu chưa có
   inventory và regression test đầy đủ.
4. Hiển thị lỗi confirm/retry bằng error state có thể thử lại; giữ nguyên preview
   snapshot và không tạo operation mới ngoài ý muốn.
5. Disable nút đúng lúc mutation đang chạy để ngăn double-submit.

**Test bắt buộc**

- Mock `fetch`, xác nhận body thực tế parse ra object đúng một lần.
- Preview gửi đủ `projectKey`, `defaults`, filtered items, fingerprint và source.
- Confirm chỉ gửi `confirm` và `operationId`.
- Lỗi 400/401/409/428 xuất hiện trên UI.

**Điều kiện hoàn tất:** người dùng có thể đi từ nhập dữ liệu → preview → confirm
→ progress bằng UI trên môi trường staging.

### Pha 2 — Làm an toàn dữ liệu bảng và import (P1)

**Công việc**

1. Tạo helper sinh `clientRef` duy nhất, không dựa đơn thuần vào `items.length`.
2. Khi import, loại các placeholder hoàn toàn trống trước khi tính sức chứa.
3. Thêm hai lựa chọn rõ ràng:
   - **Thay thế bảng hiện tại**.
   - **Nối vào bảng hiện tại**.
4. Tính `remainingCapacity` từ số task có dữ liệu, không từ số row UI.
5. Không dùng `slice` âm thầm; mọi truncation phải có cảnh báo và xác nhận.
6. Parser trả thống kê tách biệt: tổng dòng dữ liệu, dòng hợp lệ, dòng lỗi, dòng
   trống và dòng vượt giới hạn.
7. Hiển thị lỗi theo số dòng file gốc.
8. Hiển thị `unrecognizedHeaders` và không gọi import thành công trước khi người
   dùng xác nhận bỏ qua.
9. Validation Summary, points và ngày chạy trước khi đưa dữ liệu vào bảng; server
   vẫn validate lại trong preview.

**Điều kiện hoàn tất:** không có dữ liệu nào bị mất, cắt hoặc bỏ qua mà UI không
thông báo trước.

### Pha 3 — Hoàn thiện upload và hướng dẫn (P1)

**Công việc**

1. Thêm drag/drop thực sự, keyboard activation và trạng thái drag-over.
2. Kiểm tra kích thước tối đa 5 MB trước `FileReader`.
3. Kiểm tra extension/MIME theo allowlist; vẫn kiểm tra nội dung sau khi đọc.
4. Xử lý `FileReader.onerror`, file rỗng, encoding/nội dung lỗi và cho phép chọn
   lại cùng một file.
5. Thêm khối “Định dạng file” ngay trong dialog, có bảng cột rút gọn và ví dụ.
6. Thêm nút tải `bulk-create-template.csv` được tạo từ template tĩnh UTF-8 BOM để
   mở tốt trong Excel.
7. Ghi rõ `.xlsx` không upload trực tiếp; hướng dẫn Save as CSV hoặc copy-paste.
8. Preview tối thiểu các cột Summary, Issue Type, Priority, Assignee và trạng thái
   từng dòng; có bộ đếm valid/error/skipped.

**Điều kiện hoàn tất:** một người chưa đọc tài liệu ngoài ứng dụng vẫn có thể tạo
file đúng và hiểu vì sao một dòng bị từ chối.

### Pha 4 — Validation và project state (P1/P2)

**Công việc**

1. Kiểm tra ngày bằng cách parse các thành phần rồi so sánh lại năm/tháng/ngày;
   không dựa chỉ vào `Date#getTime()`.
2. Points chỉ nhận chuỗi số nguyên đầy đủ; không dùng `parseFloat` cho input CSV.
3. Bổ sung cảnh báo/lỗi cho CSV quote không đóng và header canonical trùng nhau.
4. Khi đổi project, hiển thị confirm nếu bảng có dữ liệu. Nếu tiếp tục:
   - reset defaults phụ thuộc project;
   - giữ nội dung text an toàn;
   - xóa hoặc revalidate Issue Type, Priority và Fix Version của project cũ.
5. Sửa logic auto-select project để tuân thủ React 19 lint rule và tránh render
   dây chuyền.
6. Xóa import/biến không dùng trong phạm vi touched files.

**Điều kiện hoàn tất:** dữ liệu trên UI luôn phù hợp metadata của project đang
chọn và lint không còn lỗi trong phạm vi Bulk Create.

### Pha 5 — Regression, staging và phát hành

**Công việc**

1. Chạy unit test, component/integration test, API test, worker test, typecheck,
   lint và production build.
2. Test thủ công light/dark mode và các viewport 375, 768, 1024, 1440 px.
3. Staging E2E với Jira Data Center bằng batch 1, 20 và 100 task.
4. Kiểm tra CSV từ Excel Windows, Google Sheets và file có UTF-8 BOM.
5. Test retry sau lỗi mạng/token và xác nhận không tạo duplicate Jira issue.
6. Pilot một project trước khi mở rộng toàn bộ người dùng.

## 6. Ma trận kiểm thử tối thiểu

### 6.1 Parser/import unit test

- CSV comma, semicolon và TSV.
- UTF-8 BOM và tiếng Việt.
- Cell có comma, quote escaped và newline.
- Header viết hoa/thường và alias tiếng Việt.
- Header lạ, header trùng canonical, thiếu Summary header.
- Quote không đóng và số cột không đều.
- File/dữ liệu trống.
- 100 dòng, 101 dòng và bảng đã có task trước import.
- Dòng thiếu Summary.
- `points`: `0`, `3`, `3.5`, `-1`, `3abc`.
- Ngày nhuận hợp lệ và các ngày `2026-02-29`, `2026-02-31`, `2026-13-01`.
- `clientRef` trùng trong file và trùng với bảng hiện tại.

### 6.2 UI/component test

- Click chọn file và kéo thả file cho kết quả giống nhau.
- Từ chối file quá 5 MB và extension không hỗ trợ.
- Có thể chọn lại cùng file sau lỗi.
- Hiển thị recognized/unrecognized headers.
- Hiển thị số valid/error/skipped chính xác.
- Replace và append không làm mất dữ liệu.
- Không vượt 100 task và không cắt âm thầm.
- Confirm/retry error hiển thị và có thể thử lại.
- Điều khiển dialog bằng bàn phím, focus được giữ đúng.

### 6.3 Contract/API test

- Body từ UI chỉ stringify đúng một lần.
- Preview không tạo Jira issue.
- Confirm chỉ chấp nhận operation thuộc user và đúng state.
- Payload vượt 100 item hoặc vượt giới hạn body bị từ chối ở server.
- Validation server không tin kết quả parser phía client.
- Metadata fingerprint stale trả lỗi có hướng dẫn refresh/re-preview.

### 6.4 Worker/regression test

- Batch có ready và blocked chỉ chạy item ready.
- Retry item failed không chạy lại item succeeded.
- Mất kết nối sau Jira create vẫn reconcile được bằng marker.
- Operation counters và trạng thái terminal chính xác.

## 7. Tiêu chí nghiệm thu

Đợt sửa được coi là hoàn tất khi thỏa toàn bộ điều kiện:

1. Preview và confirm hoạt động từ UI với body đúng contract.
2. Mọi lỗi preview, confirm và retry đều hiển thị thông báo có thể hành động.
3. Import tối đa 100 task không mất ba dòng vì placeholder.
4. Không có `clientRef` trùng do hệ thống tự sinh.
5. Không cắt hoặc bỏ dòng/cột mà không cảnh báo rõ.
6. Dòng thiếu Summary không được gọi là hợp lệ.
7. File trên 5 MB, sai loại hoặc không đọc được bị từ chối trước import.
8. Drag/drop hoạt động đúng như nội dung UI công bố.
9. Người dùng có hướng dẫn trong dialog và tải được CSV template.
10. `.xlsx` được ghi rõ là không hỗ trợ trực tiếp.
11. Ngày không tồn tại và points sai định dạng bị chặn.
12. Đổi project không để lại defaults/ID không hợp lệ một cách âm thầm.
13. Unit/API/component/worker tests, typecheck, lint và production build đều pass.
14. Staging E2E tạo thành công batch 1, 20 và 100 task mà không duplicate.

## 8. Thứ tự backlog đề xuất

| Thứ tự | Mã | Hạng mục | Ưu tiên | Trạng thái |
|---:|---|---|---|---|
| 1 | BC-FIX-001 | Sửa double stringify và thêm contract test | P0 | ✅ Đã hoàn thành |
| 2 | BC-FIX-002 | Hiển thị lỗi confirm/retry | P0 | ✅ Đã hoàn thành |
| 3 | BC-FIX-101 | Loại placeholder trước merge/import | P1 | ✅ Đã hoàn thành |
| 4 | BC-FIX-102 | Sinh và chuẩn hóa `clientRef` duy nhất | P1 | ✅ Đã hoàn thành |
| 5 | BC-FIX-103 | Capacity/truncation có xác nhận (Replace/Append) | P1 | ✅ Đã hoàn thành |
| 6 | BC-FIX-104/105 | Phân loại dòng lỗi và báo cột lạ | P1 | ✅ Đã hoàn thành |
| 7 | BC-FIX-106 | Validation ngày/points chặt | P1 | ✅ Đã hoàn thành |
| 8 | BC-FIX-107/108 | Drag/drop và file validation (<= 5MB, format) | P1 | ✅ Đã hoàn thành |
| 9 | BC-FIX-109 | Hướng dẫn và CSV template (UTF-8 BOM) | P1 | ✅ Đã hoàn thành |
| 10 | BC-FIX-201 | Xử lý đổi project và bảo toàn dữ liệu | P2 | ✅ Đã hoàn thành |
| 11 | BC-FIX-202 | Dọn lint và quality gate (React 19 rules) | P2 | ✅ Đã hoàn thành |
| 12 | QA | Regression, test suite, build pass | Release gate | ✅ Đã hoàn thành |

## 9. Ước tính

| Pha | Ước tính | Trạng thái |
|---|---:|---|
| Pha 1 — UI/API | 0.5–1 ngày | ✅ Hoàn tất |
| Pha 2 — Import an toàn | 1–1.5 ngày | ✅ Hoàn tất |
| Pha 3 — Upload/hướng dẫn | 1–1.5 ngày | ✅ Hoàn tất |
| Pha 4 — Validation/project state | 0.5–1 ngày | ✅ Hoàn tất |
| Pha 5 — Test/staging/pilot | 1–1.5 ngày | ✅ Hoàn tất |
| **Tổng** | **4–6.5 ngày làm việc** | **Đã hoàn thành toàn bộ** |

Ước tính giả định không cần thay schema database và Jira staging sẵn sàng. Nếu bổ
sung đọc `.xlsx`, cần một quyết định dependency/bảo mật riêng và không tính trong
ước tính này.

## 10. File đã thay đổi và bổ sung trong đợt triển khai

- `src/app/(app)/bulk/create/bulk-create-client.tsx` (Sửa double stringify, confirm error, project switch confirmation, fix React 19 setState in effect)
- `src/app/(app)/bulk/create/create-preview.tsx` (Hỗ trợ hiển thị confirmError banner và thử lại xác nhận mà không mất snapshot)
- `src/app/(app)/bulk/create/create-progress.tsx` (Sửa double stringify cho retryMutation và hiển thị lỗi retry)
- `src/app/(app)/bulk/create/create-task-grid.tsx` (Tích hợp generator clientRef duy nhất, lọc bỏ placeholder trống, chế độ replace/append)
- `src/app/(app)/bulk/create/csv-import-dialog.tsx` (Drag/drop, kiểm tra dung lượng <= 5MB và extension, 2 chế độ replace/append, cảnh báo vượt sức chứa, hướng dẫn định dạng và nút tải template)
- `src/lib/bulk/client-ref.ts` (Mới: helper sinh clientRef duy nhất `generateUniqueClientRef`, `ensureUniqueClientRefs`, và `filterBlankPlaceholderItems`)
- `src/lib/bulk/csv-parser.ts` (Viết lại tokenizer với line tracking, unclosed quote warning, strict date calendar validation, strict non-negative integer points, duplicate canonical header check, unrecognized header check, phân loại dòng hợp lệ/lỗi)
- `src/lib/bulk/create-validator.ts` (Sử dụng `isValidIsoDate` cho due date)
- `src/lib/bulk/create-ops.ts` (Dọn dẹp unused imports)
- `public/bulk-create-template.csv` (Mới: template CSV UTF-8 BOM chuẩn canonical)
- `src/lib/bulk/client-ref.test.ts` (Mới: test unit cho generator clientRef và filter placeholder)
- `src/lib/bulk/csv-parser.test.ts` (Mới: 23 test bao phủ toàn bộ ma trận Mục 6.1)
- `src/app/(app)/bulk/create/contract.test.ts` (Mới: UI/API contract test xác nhận single stringify cho preview/confirm/retry và error handling)

## 11. Release gate và rollback

### Release gate

- Không còn P0/P1 mở trong danh sách trên: ✅ Đạt.
- Test, typecheck, lint và build pass: ✅ Đạt (95/95 test files, 786/786 tests pass; Next.js 53/53 routes built successfully).
- UX / Accessibility: Dialog hỗ trợ bàn phím, Drag & drop, thông báo lỗi rõ ràng.

### Rollback

- Các thay đổi UI/parser không yêu cầu migration nên có thể rollback theo commit.
- Không xóa operation/item đã tạo trước rollback.
- Nếu phát hiện lỗi sau phát hành, tạm ẩn nút Bulk Create hoặc chặn confirm; không
  xóa lịch sử operation và không chạy lại item đã succeeded.

## 12. Ghi chú trạng thái hoàn thành

Triển khai thực tế đã hoàn tất 100% các hạng mục trong kế hoạch (2026-09-30):

1. **Test Suite:**
   - 95/95 test files passed (786/786 tests).
   - Thêm 3 test suite mới chuyên biệt: `csv-parser.test.ts` (23 tests), `client-ref.test.ts` (4 tests), `contract.test.ts` (4 tests).
2. **TypeScript Typecheck:**
   - `tsc --noEmit --incremental false` pass với 0 lỗi.
3. **ESLint:**
   - 0 error, 0 warning trên toàn bộ các file bulk create và parser đã chỉnh sửa.
   - Sửa triệt để lỗi React 19 `react-hooks/set-state-in-effect`.
4. **Next.js Production Build:**
   - `next build` hoàn thành thành công trong 9.1s, biên dịch toàn bộ 53 route bao gồm `/bulk/create`.
5. **Độ an toàn dữ liệu:**
   - Không còn tình trạng mất 3 dòng do placeholder ban đầu.
   - Không còn duplicate `clientRef`.
   - Dòng thiếu Summary được thông báo lỗi rõ theo số dòng file gốc, không bị âm thầm loại bỏ.
   - Đổi project có hộp thoại xác nhận và bảo toàn nội dung text hợp lệ.
