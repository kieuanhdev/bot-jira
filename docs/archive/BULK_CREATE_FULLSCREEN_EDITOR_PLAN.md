# Kế hoạch nâng cấp Bulk Create thành trình soạn thảo toàn màn hình

> Ngày lập: 2026-10-01  
> Ngày cập nhật: 2026-10-01  
> Trạng thái: **Đã triển khai hoàn tất (P0 + P1)**  
> Phạm vi: UX/UI bước nhập dữ liệu tại `/bulk/create`; giữ nguyên contract API,
> preview, queue worker và cơ chế tạo task hiện có  
> Mục tiêu: người dùng có thể nhập và chỉnh toàn bộ dữ liệu của nhiều task ngay
> trên một màn hình, không phải mở chi tiết từng dòng

## 1. Kết luận sản phẩm

Nên chuyển bước **Nhập dữ liệu** sang một **workspace toàn màn hình dạng
spreadsheet**. Đây không nên chỉ là việc tăng `max-width`, vì vấn đề hiện tại đến
từ cả chiều ngang, chiều dọc và cách tương tác:

- Nội dung đang bị giới hạn bởi `max-w-7xl` trong `bulk-create-client.tsx`.
- Header, stepper, project card và defaults card chiếm nhiều chiều cao trước khi
  người dùng tới được bảng.
- Bảng desktop có 10–12 cột, nhưng vẫn chưa có `Description` và custom fields.
- Một số field chỉ sửa được qua `TaskDetailSheet`; mỗi task lại cần một chu kỳ
  mở, nhập, đóng.
- Bảng có horizontal scroll nhưng thiếu cơ chế spreadsheet như sticky header,
  sticky cột chính, điều hướng bằng bàn phím, paste nhiều ô và chọn cột hiển thị.
- Ở mobile, mỗi task thành một card dài; cách này phù hợp để kiểm tra nhưng không
  phải môi trường hiệu quả để soạn hàng chục task.

Quyết định đề xuất:

1. `/bulk/create` vẫn giữ luồng ba bước hiện tại.
2. Riêng bước 1 có nút **Mở trình soạn thảo toàn màn hình** và tự mở chế độ này
   trên desktop sau khi project/metadata sẵn sàng.
3. Fullscreen editor chiếm toàn bộ vùng nhìn bên trong app, che sidebar và loại
   bỏ padding của shell bằng một lớp `fixed inset-0 z-*`, không phụ thuộc độ rộng
   content hiện tại.
4. Tất cả field hỗ trợ phải có thể nhập inline trong grid hoặc trong một hàng mở
   rộng ngay tại bảng. `TaskDetailSheet` chỉ là công cụ hỗ trợ xem/chỉnh sâu,
   tuyệt đối không phải đường duy nhất để nhập field.
5. Người dùng có thể chọn cột, đổi độ rộng cột và lưu cấu hình hiển thị theo
   project trên máy hiện tại.
6. Desktop/tablet ngang là trải nghiệm soạn thảo chính. Mobile cung cấp chế độ
   chỉnh từng task rõ ràng, không cố nhồi một spreadsheet 12 cột vào 375 px.

## 2. Mục tiêu và chỉ số thành công

### 2.1 Mục tiêu

- Nhập 20–100 task mà không phải mở detail sheet cho từng dòng.
- Tận dụng tối đa viewport, đặc biệt trên màn hình 1366×768 và 1440×900.
- Thao tác liên tục bằng bàn phím tương tự Excel/Google Sheets.
- Nhìn thấy ngay field đang kế thừa default, field đã override và field lỗi.
- Giữ nguyên draft, import, template, preview, validation và bulk apply hiện có.
- Không tạo hai nguồn state khác nhau giữa grid và detail editor.

### 2.2 Chỉ số kiểm chứng sau triển khai

- Có thể tạo 20 task gồm Summary, Type, Assignee, Priority, Points, Estimate,
  Due date và Description mà không mở `TaskDetailSheet`.
- Median số click để hoàn thành 10 task giảm ít nhất 50% so với luồng hiện tại.
- Ở 1440×900, grid có ít nhất 65% chiều cao viewport để nhập liệu.
- Không mất dữ liệu khi vào/thoát fullscreen, đổi cấu hình cột hoặc quay lại từ
  preview để sửa lỗi.
- Người dùng bàn phím có thể đi qua cell, thêm dòng và mở combobox mà không cần
  chuột.

## 3. Ngoài phạm vi

- Không đổi API `/api/bulk/create`, database schema hoặc queue worker.
- Không tăng giới hạn `MAX_BULK_CREATE_ITEMS = 100` trong đợt này.
- Không xây công thức, sort/filter dữ liệu kiểu spreadsheet hoàn chỉnh.
- Không hỗ trợ nhiều project trong cùng batch.
- Không thay đổi logic parent/subtask hay validation nghiệp vụ Jira.
- Không tối ưu nhập liệu phức tạp trên điện thoại ngang bằng desktop.

## 4. Hiện trạng code đã xác nhận

| Khu vực | Hiện trạng | Hệ quả UX |
|---|---|---|
| `bulk-create-client.tsx` | Root dùng `max-w-7xl`; step 1 xếp project, defaults rồi grid theo chiều dọc | Không gian nhập bị thu hẹp cả ngang lẫn dọc |
| `app-shell.tsx` | `<main>` có `p-4 md:p-6`, sidebar vẫn hiện | Mất thêm diện tích hữu dụng |
| `create-task-grid.tsx` | Desktop table `min-w-[960px]`, có nhiều cột và horizontal scroll | Cột co hẹp, khó theo dõi dòng khi cuộn |
| `create-task-grid.tsx` | Inline được hầu hết field chuẩn nhưng chưa có Description/custom fields | Vẫn phải mở chi tiết cho dữ liệu quan trọng |
| `task-detail-sheet.tsx` | Có đầy đủ field chuẩn, Description cao 240 px | Tốt cho một task, chậm khi lặp lại nhiều task |
| `create-defaults-form.tsx` | Card mở rộng đặt phía trên grid | Hữu ích nhưng chiếm viewport và tách khỏi ngữ cảnh bảng |
| `bulk-selection-toolbar.tsx` | Có bulk apply cho các dòng đã chọn | Nên giữ và đưa vào toolbar cố định |
| Draft localStorage | Tự lưu theo project | Có thể tái sử dụng nguyên trạng |

Lưu ý: kế hoạch cũ trong `BULK_CREATE_SMART_TASK_PLAN.md` đề xuất để các field
chi tiết trong side panel nhằm hạn chế chiều rộng. Phản hồi sử dụng thực tế cho
thấy side panel đang trở thành nút thắt. Kế hoạch này điều chỉnh quyết định đó:
**ẩn/hiện cột theo nhu cầu và row expansion**, thay vì bắt buộc vào side panel.

## 5. Kiến trúc trải nghiệm đề xuất

### 5.1 Hai chế độ hiển thị, một nguồn dữ liệu

- **Trang chuẩn:** giữ header, stepper và phần giải thích; phù hợp chọn project,
  import và xem tổng quan.
- **Editor toàn màn hình:** tập trung nhập liệu; dùng cùng `items`, `defaults`,
  `metadata` và các callback từ `BulkCreateClient`.
- Nút vào/thoát fullscreen chỉ đổi presentation state, không copy dữ liệu sang
  state thứ hai và không remount form theo cách làm mất focus/draft.
- Lưu `editorMode` và column preferences vào localStorage; dữ liệu task vẫn dùng
  draft key hiện tại.

### 5.2 Wireframe desktop

```text
┌─────────────────────────────────────────────────────────────────────────────┐
│ ← Thoát   Tạo task · EPM    18/100 task    Đã lưu 10:42    [Xem trước 18] │
├─────────────────────────────────────────────────────────────────────────────┤
│ Project [EPM]  Defaults [4 field ▾]  Import  Template  Columns  Shortcuts │
├─────────────────────────────────────────────────────────────────────────────┤
│ 3 dòng đã chọn  [Assignee] [Priority] [Due date] [Xóa override] [Xóa]     │
├────┬────┬──────────────┬──────────┬────────┬──────────┬─────┬──────────────┤
│ ✓  │ #  │ Summary      │ Type     │ Parent │ Assignee │ ... │ Description  │ sticky
├────┼────┼──────────────┼──────────┼────────┼──────────┼─────┼──────────────┤
│ □  │ 1  │ ...          │ Task     │ —      │ An      │ ... │ ...          │
│ □  │ 2  │ ...          │ Sub-task │ EPM-1  │ Bình    │ ... │ ...          │
│ □  │ 3  │ ...          │ Bug      │ —      │ —       │ ... │ ...          │
│    │ +  │ Nhập task mới hoặc paste nhiều dòng...                           │
├─────────────────────────────────────────────────────────────────────────────┤
│ 2 lỗi · 1 cảnh báo   Cell: Due date dòng 3   Tab/Shift+Tab di chuyển       │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 5.3 Phân vùng màn hình

**A. Top bar cố định, cao khoảng 52–56 px**

- Thoát fullscreen.
- Tên project và số task đã có Summary.
- Trạng thái autosave: `Đang lưu…`, `Đã lưu`, `Không thể lưu`.
- CTA chính `Kiểm tra & Xem trước N task`.
- Khi preview pending, dùng trạng thái nút hiện có; không thêm spinner text mới
  ngoài pattern đang dùng.

**B. Command bar cố định, cao khoảng 44–48 px**

- Project selector.
- Defaults dạng popover/drawer gọn, badge số field đang đặt.
- Import CSV/Excel, tải mẫu, lấy task Jira làm mẫu.
- `Cột hiển thị`, `Mật độ dòng`, `Phím tắt`.
- `Thêm dòng`, `Nhân bản`, `Làm mới` ở nhóm thao tác cuối.

**C. Bulk toolbar theo ngữ cảnh**

- Chỉ hiện khi có dòng được chọn, thay vì đẩy bảng xuống bằng vùng luôn tồn tại.
- Giữ chức năng hiện tại: apply field, clear override, delete.
- Có `Áp dụng giá trị của cell đang chọn xuống các dòng đã chọn` ở P1.

**D. Grid chiếm phần không gian còn lại**

- Container dùng `min-h-0 flex-1 overflow-auto`.
- Header sticky theo trục dọc.
- Checkbox, số dòng và Summary sticky theo trục ngang để không mất ngữ cảnh.
- Action cuối dòng có thể sticky bên phải nếu không che nội dung.
- Footer/status bar cố định hiển thị lỗi/cảnh báo và gợi ý phím tắt.

## 6. Thiết kế grid

### 6.1 Nhóm cột

**Luôn hiển thị**

- Chọn dòng.
- Số thứ tự/trạng thái validation.
- Summary.
- Issue Type.
- Actions tối thiểu: duplicate, delete, expand.

**Hiển thị mặc định nếu metadata hỗ trợ**

- Parent.
- Assignee.
- Priority.
- Points.
- Original Estimate.
- Due Date.

**Cho phép bật trong menu Columns**

- Labels.
- Fix Versions.
- Description.
- Các custom field có input renderer được hỗ trợ.
- Client Ref khi cần cấu hình quan hệ parent trong batch.

Thứ tự mặc định ưu tiên tốc độ nhập hơn độ đầy đủ. Cấu hình cột lưu theo key
`bulk-create-columns:<projectKey>` để project có field khác nhau không ghi đè
lẫn nhau.

### 6.2 Description và field dài

Description phải nhập được mà không mở sheet, nhưng không nên ép mọi dòng cao
240 px. Dùng ba cách bổ sung nhau:

1. Cột Description dạng textarea một dòng, mở rộng đến 3 dòng khi focus.
2. `Shift+Space` hoặc nút expand mở **expanded row editor** ngay dưới dòng, rộng
   theo viewport để nhập Description/custom fields dài.
3. `TaskDetailSheet` vẫn tồn tại như tùy chọn cho người thích form dọc hoặc màn
   hình hẹp.

Expanded row dùng cùng component field editor với sheet để tránh lệch hành vi.

### 6.3 Trạng thái kế thừa defaults

- Cell chưa override hiển thị giá trị effective bằng màu muted và nhãn nhỏ
  `Mặc định` trong tooltip, không để placeholder gây hiểu nhầm là rỗng.
- Cell override hiển thị giá trị bình thường và có action `Dùng lại mặc định`.
- `null` chủ động và `undefined` kế thừa phải được biểu diễn khác nhau trong UI.
- Defaults popover cho biết số dòng đang kế thừa trước khi người dùng thay đổi.

### 6.4 Validation trong lúc nhập

- Validate rẻ tại client khi blur/change: Summary rỗng/quá dài, số âm, date sai,
  subtask thiếu parent và format estimate cơ bản.
- Cell lỗi có border semantic danger và icon Lucide; tooltip/popover chứa lỗi cụ
  thể. Không chỉ đổi màu.
- Số lỗi/cảnh báo tổng hợp ở status bar và có nút nhảy tới lỗi kế tiếp.
- Server preview vẫn là nguồn xác nhận cuối cùng.
- Khi `onFixRow` từ preview quay lại, mở fullscreen, scroll tới đúng dòng, mở cột
  liên quan và focus đúng cell nếu error trả về `field`.

### 6.5 Điều hướng bàn phím

| Phím | Hành vi |
|---|---|
| `Tab` / `Shift+Tab` | Sang cell editable kế/sau |
| `Enter` | Bắt đầu edit hoặc xác nhận cell rồi xuống cùng cột ở dòng kế |
| `Shift+Enter` | Xuống dòng trong textarea |
| `Arrow keys` | Di chuyển cell khi không mở combobox |
| `Ctrl/Cmd+D` | Nhân bản dòng hiện tại |
| `Ctrl/Cmd+Enter` | Thêm dòng mới sau dòng hiện tại |
| `Ctrl/Cmd+Shift+V` | Paste dạng plain text/matrix |
| `Delete/Backspace` | Xóa giá trị các cell đã chọn sau xác nhận phù hợp |
| `Esc` | Đóng menu/editor; nếu không có overlay thì thoát edit cell, không thoát fullscreen ngay |

Phím tắt không được chặn hành vi nhập text bên trong textarea/combobox. Cần có
dialog trợ giúp và `aria-keyshortcuts` cho action phù hợp.

### 6.6 Paste từ spreadsheet

- Paste một cột vào Summary sẽ tạo/điền nhiều dòng liên tiếp.
- Paste ma trận TSV bắt đầu từ cell đang chọn, ánh xạ theo các cột đang hiển thị.
- Hiển thị preview nhỏ khi dữ liệu vượt số dòng/cột còn lại hoặc vượt giới hạn
  100 task.
- Select/combobox resolve theo tên hiển thị không phân biệt hoa thường; giá trị
  mơ hồ hoặc không tồn tại được đánh dấu lỗi, không tự chọn bừa.
- Tái sử dụng parser/normalize hiện có khi có thể; không tạo quy tắc nhập khác
  giữa dialog Import và paste trực tiếp.

## 7. Responsive và accessibility

### 7.1 Breakpoint

- `>= 1024 px`: fullscreen spreadsheet đầy đủ.
- `768–1023 px`: fullscreen grid, ít cột mặc định hơn; Description qua expanded
  row; defaults mở trong drawer.
- `< 768 px`: giữ card editor, nhưng fullscreen loại bỏ chrome không cần thiết;
  thêm điều hướng `Task trước / Task sau` và thanh save/preview sticky.

Không yêu cầu mobile hiển thị mọi cột đồng thời và không tạo horizontal scroll
toàn trang. Chỉ grid desktop/tablet được scroll bên trong vùng riêng.

### 7.2 Accessibility

- Grid có label, row/column semantics rõ ràng; không giả lập ARIA grid nếu chưa
  triển khai đầy đủ keyboard contract.
- Focus ring dùng token `ring`; focus không bị sticky header che.
- Lỗi không truyền đạt chỉ bằng màu.
- Mọi icon trang trí dùng `aria-hidden`; icon button có accessible name.
- Popover/combobox giữ focus hợp lý và trả focus về cell khi đóng.
- Transition 150–200 ms và tôn trọng `prefers-reduced-motion`.
- Kiểm tra contrast tối thiểu 4.5:1 ở light và dark mode.

## 8. Thiết kế kỹ thuật đề xuất

### 8.1 Component boundary

```text
BulkCreateClient
├── BulkCreatePageHeader                 (normal mode)
├── CreateDefaultsForm                   (normal mode)
├── BulkCreateEditorShell                (fullscreen presentation)
│   ├── BulkCreateEditorTopbar
│   ├── BulkCreateCommandBar
│   ├── BulkSelectionToolbar             (reuse/refactor)
│   ├── BulkCreateDataGrid
│   │   ├── BulkCreateGridHeader
│   │   ├── BulkCreateGridRow
│   │   ├── BulkCreateCellEditor
│   │   └── ExpandedRowEditor
│   ├── BulkCreateColumnPicker
│   └── BulkCreateStatusBar
└── TaskDetailSheet                      (fallback/optional)
```

Không tách `items` thành state riêng trong editor. State nghiệp vụ vẫn do
`BulkCreateClient` sở hữu trong P0 để tránh regression. Nếu hiệu năng kém mới
chuyển sang reducer/store ở P2 sau khi có profiling.

### 8.2 Column definition thay vì JSX viết cứng

Tạo cấu hình cột typed, ví dụ mỗi column có:

- `id`, `label`, `width`, `minWidth`, `defaultVisible`, `sticky`.
- `isAvailable(metadata)`.
- `getValue(row, defaults)` và `setValue(row, value)`.
- `renderCell`, `parsePastedValue`, `validateClient`.

Một cấu hình dùng chung sẽ giảm khác biệt giữa header, cell, column picker,
paste matrix và focus-to-error. Không cần đưa TanStack Table vào chỉ để giải
quyết layout nếu bảng hiện tại có thể refactor an toàn; chỉ cân nhắc dependency
mới sau spike hiệu năng/keyboard.

### 8.3 Fullscreen shell

Ưu tiên một overlay trong React tree:

- `fixed inset-0 z-50 bg-background`.
- `h-dvh` thay cho `h-screen` để đúng viewport động.
- `overflow-hidden` ở shell; chỉ grid body scroll.
- Lock scroll của document khi mở và restore chính xác khi đóng/unmount.
- Không dùng Fullscreen Browser API làm cơ chế chính vì quyền/thoát fullscreen
  của trình duyệt làm luồng khó đoán. Có thể bổ sung sau như tiện ích tùy chọn.

### 8.4 Hiệu năng

- Mục tiêu hiện tại tối đa 100 dòng nên chưa cần virtualization ngay.
- Memo hóa row/cell và giữ callback ổn định để một lần gõ không render lại toàn
  bộ combobox của 100 dòng.
- Debounce draft hiện tại 1 giây được giữ; bổ sung chỉ báo save.
- Không mount dropdown content/query của Assignee/Parent cho mọi cell khi chưa
  mở.
- Đo React Profiler với 100 dòng × toàn bộ cột trước khi quyết định virtualize.
- Nếu typing vượt 50 ms/keystroke ở máy mục tiêu, P2 áp dụng virtualization cho
  row; cần kiểm tra tương thích sticky column, auto-height và focus restoration.

## 9. Kế hoạch triển khai theo pha

### P0 — Fullscreen foundation và nhập đủ field

Mục tiêu: giải quyết ngay hai vấn đề người dùng nêu — không gian nhỏ và phải mở
chi tiết từng task.

1. Thêm state `isEditorFullscreen` tại `BulkCreateClient`.
2. Tạo `BulkCreateEditorShell` với top bar, command bar, grid area và status bar.
3. Bỏ giới hạn `max-w-7xl` khi fullscreen; dùng `fixed inset-0 h-dvh`.
4. Chuyển toolbar/import/defaults vào command bar; defaults dùng popover hoặc
   drawer, không chiếm chiều cao thường trực.
5. Sticky header và sticky các cột checkbox/index/Summary.
6. Thêm Description inline và expanded row editor.
7. Dùng shared field components giữa expanded editor và `TaskDetailSheet`.
8. Giữ nút sheet nhưng đổi nhãn/ý nghĩa thành tùy chọn `Mở form đầy đủ`.
9. Thêm autosave indicator và confirm khi thoát nếu localStorage save thất bại.
10. Bảo đảm preview/back-to-fix khôi phục fullscreen, dòng và focus.

**Definition of Done P0**

- 100% field chuẩn trong `BulkCreateRowInput` nhập được mà không bắt buộc mở
  sheet.
- Ở desktop 1440 px, editor chiếm toàn viewport và grid tự chiếm phần còn lại.
- Vào/thoát fullscreen không mất state, selection hoặc draft.
- Light/dark, 1024/1440 px và keyboard cơ bản đạt tiêu chí.

### P1 — Column manager và spreadsheet workflow

1. Tạo typed column definitions.
2. Column picker: ẩn/hiện, reorder, reset mặc định.
3. Lưu preference theo project.
4. Keyboard navigation giữa cell.
5. Paste một cột và paste matrix TSV.
6. Fill down/copy value cho các dòng đã chọn.
7. Resize cột với min/max hợp lý.
8. Density `Compact / Comfortable`; mặc định Comfortable theo design system.
9. Validation status bar và `Next error`.

**Definition of Done P1**

- Người dùng có thể nhập luồng chính chỉ bằng bàn phím.
- Paste 20 Summary tạo/điền đúng 20 dòng và không vượt giới hạn 100.
- Preference hỏng/field biến mất sau đổi metadata tự fallback an toàn.

### P2 — Dynamic custom fields và tối ưu hiệu năng

1. Render custom fields có schema đã hỗ trợ từ `fieldsByIssueType`.
2. Bật/tắt cột theo issue type và metadata thực tế.
3. Shared renderer cho text, textarea, number, date, select, multi-select.
4. Profile 100 dòng; memo hóa hoặc virtualize nếu đạt ngưỡng cần thiết.
5. Thêm telemetry sự kiện UI ở mức không chứa nội dung task:
   `editor_opened`, `column_toggled`, `matrix_pasted`, `preview_started`.

**Definition of Done P2**

- Custom required field được nhìn thấy và sửa trước preview khi renderer hỗ trợ.
- Typing và scroll đạt ngưỡng hiệu năng đã thống nhất trên máy mục tiêu.

## 10. Danh sách file dự kiến

### File sửa

- `src/app/(app)/bulk/create/bulk-create-client.tsx`
  - quản lý editor mode, phục hồi focus từ preview, chia nhỏ page header.
- `src/app/(app)/bulk/create/create-task-grid.tsx`
  - tách row/cell, bổ sung Description/expanded row, sticky behavior.
- `src/app/(app)/bulk/create/create-defaults-form.tsx`
  - hỗ trợ render compact trong popover/drawer.
- `src/app/(app)/bulk/create/task-detail-sheet.tsx`
  - dùng shared field editor; giữ vai trò fallback.
- `src/app/(app)/bulk/create/bulk-selection-toolbar.tsx`
  - hỗ trợ layout sticky/contextual và fill-down.
- `src/app/(app)/bulk/create/create-preview.tsx`
  - trả về cả `rowIndex` và `field` cho luồng focus sửa lỗi.
- `src/app/(app)/bulk/create/page.tsx`
  - cập nhật skeleton tương ứng nếu editor auto-open.

### File mới đề xuất

- `src/app/(app)/bulk/create/bulk-create-editor-shell.tsx`
- `src/app/(app)/bulk/create/bulk-create-editor-topbar.tsx`
- `src/app/(app)/bulk/create/bulk-create-command-bar.tsx`
- `src/app/(app)/bulk/create/bulk-create-data-grid.tsx`
- `src/app/(app)/bulk/create/bulk-create-grid-row.tsx`
- `src/app/(app)/bulk/create/bulk-create-cell-editor.tsx`
- `src/app/(app)/bulk/create/bulk-create-column-picker.tsx`
- `src/app/(app)/bulk/create/expanded-row-editor.tsx`
- `src/app/(app)/bulk/create/bulk-create-status-bar.tsx`
- `src/app/(app)/bulk/create/lib/column-definitions.tsx`
- `src/app/(app)/bulk/create/lib/editor-preferences.ts`
- `src/app/(app)/bulk/create/lib/grid-navigation.ts`
- `src/app/(app)/bulk/create/lib/paste-matrix.ts`
- `src/app/(app)/bulk/create/shared-task-fields.tsx`

Tên/file boundary có thể tinh gọn khi triển khai; tránh để `create-task-grid.tsx`
tiếp tục thành một component quá lớn.

## 11. Kế hoạch kiểm thử

### 11.1 Unit test

- Column availability theo metadata.
- Preference serialize/deserialize, version migration và fallback.
- Cell update giữ đúng `undefined` so với `null`.
- Keyboard navigation bỏ qua cột ẩn/disabled.
- Paste TSV: quoted text, dòng trống, thừa cột, vượt 100 dòng.
- Parse select theo label/ID và báo ambiguous value.
- Client validation cho Summary, Points, Due date, Parent, Estimate.

### 11.2 Component/integration test

- Mở/đóng fullscreen không mất items/defaults.
- Thay project trong editor vẫn chạy confirm hiện tại và reset đúng field phụ
  thuộc project.
- Chỉnh cell cập nhật cùng state mà sheet/preview đọc.
- Giá trị default và override hiển thị/clear chính xác.
- Chọn nhiều dòng và bulk apply không ảnh hưởng dòng không chọn.
- Preview lỗi → quay lại → đúng dòng/cell được focus.
- Import append/replace trong fullscreen hoạt động như trang chuẩn.
- Autosave và restore draft sau reload.

### 11.3 E2E viewport

- 375×812: mobile card editor, sticky CTA không che nội dung.
- 768×1024: tablet mode, drawer defaults, expanded row.
- 1024×768: grid còn đủ chiều cao, toolbar không wrap phá layout.
- 1366×768 và 1440×900: luồng nhập chính.
- 1920×1080: không kéo giãn Summary/Description quá mức; giới hạn column width.
- Light/dark mode và reduced motion.

### 11.4 Kịch bản nghiệm thu nghiệp vụ

1. Tạo 20 task khác assignee/priority/due date/description hoàn toàn trong grid.
2. Tạo parent và subtask trong cùng batch, chọn parent inline.
3. Paste 30 Summary từ Excel, fill-down Type và Assignee, preview thành công.
4. Import file, sửa ba dòng lỗi từ preview, quay lại preview không mất selection.
5. Đổi project khi đang có dữ liệu và xác nhận preservation/reset đúng contract.
6. Reload tab, restore draft rồi tiếp tục ở cấu hình cột đã lưu.

## 12. Rủi ro và cách giảm thiểu

| Rủi ro | Mức độ | Cách giảm thiểu |
|---|---:|---|
| Grid quá nhiều cột vẫn gây choáng | Cao | Cột mặc định tối giản, column picker, sticky Summary, lưu preference |
| Re-render 100 combobox khi gõ | Cao | Tách/memo row, lazy dropdown content, profile trước virtualization |
| Keyboard xung đột Select/Combobox/Textarea | Cao | State edit/navigation rõ ràng, test theo từng editor, Esc phân tầng |
| Fullscreen overlay làm mất scroll/focus | Trung bình | Lock/restore document scroll, focus trap có chủ đích, E2E open/close |
| Hai UI desktop/mobile lệch logic | Trung bình | Shared task-field components và column definitions |
| Preference cũ không hợp metadata mới | Trung bình | Version schema, lọc column không còn available, reset mặc định |
| Description auto-grow phá row alignment | Trung bình | Giới hạn 3 dòng; nội dung dài dùng expanded row |
| Kế hoạch UI mở rộng scope backend | Thấp | Giữ nguyên payload và preview/confirm contracts trong P0–P1 |

## 13. Thứ tự ưu tiên khuyến nghị

Không nên triển khai tất cả spreadsheet feature cùng lúc. Thứ tự có giá trị cao
nhất là:

1. Fullscreen shell + sticky grid.
2. Defaults dạng compact command.
3. Description và mọi standard field nhập được inline/expanded row.
4. Quay lại đúng cell từ preview.
5. Column picker và lưu preference.
6. Keyboard navigation.
7. Paste matrix/fill down.
8. Custom fields động và virtualization nếu profiling yêu cầu.

P0 đã đủ giải quyết trực tiếp phản hồi hiện tại. P1 biến công cụ thành trải
nghiệm bulk thực sự nhanh; P2 chỉ nên bắt đầu sau khi đo hành vi và hiệu năng.

## 14. Tiêu chí chốt trước khi code

- Fullscreen là mặc định trên desktop hay chỉ mở theo nút. Khuyến nghị: tự mở
  sau khi metadata tải xong, nhưng ghi nhớ lựa chọn gần nhất của người dùng.
- Danh sách cột mặc định theo workflow thực tế của team. Khuyến nghị ban đầu:
  Summary, Type, Parent, Assignee, Priority, Points, Estimate, Due Date.
- Description dùng plain textarea như hiện tại hay Jira rich text. Kế hoạch này
  giữ plain textarea để không mở rộng backend contract.
- Ngưỡng hiệu năng cụ thể cho typing/scroll trên máy mục tiêu trước khi quyết
  định virtualization.

Sau khi chốt bốn điểm trên, có thể triển khai P0 độc lập mà không phải sửa API
hay worker.

## 15. Kết quả triển khai thực tế (2026-10-01)

Đã hoàn thành toàn bộ mục tiêu của **P0 (Fullscreen Foundation)** và **P1 (Spreadsheet Workflow & Column Management)**:

### 15.1 Các tính năng đã hoàn thiện

1. **Workspace toàn màn hình (`BulkCreateEditorShell`)**:
   - Sử dụng layout overlay `fixed inset-0 z-50 h-dvh bg-background text-foreground overflow-hidden` khi ở chế độ fullscreen.
   - Tự động khoá cuộn trang của document (`document.body.style.overflow = "hidden"`) khi mở và phục hồi nguyên vẹn khi thoát.
   - Hỗ trợ chuyển đổi linh hoạt giữa chế độ toàn màn hình và chế độ inline chuẩn bằng nút trên header và command bar.
   - Ghi nhớ trạng thái chế độ hiển thị trong `localStorage` (`bulk-create:editor-mode`).

2. **Top Bar cố định (`BulkCreateEditorTopbar`)**:
   - Nút thoát toàn màn hình (`Minimize2`).
   - Huy hiệu dự án (`FolderKanban`) và chỉ số task sẵn sàng/tổng dòng.
   - Trạng thái tự động lưu bản nháp theo thời gian thực (Đang lưu… / Đã lưu lúc HH:mm / Tự động lưu nháp).
   - Nút CTA chính `Kiểm tra & Xem trước N task` với hiệu ứng loading spinner khi preview đang xử lý.

3. **Command Bar đa năng (`BulkCreateCommandBar`)**:
   - Bộ chọn dự án Jira (kèm modal cảnh báo xác nhận khi đang có dữ liệu).
   - Nút mở popup cài đặt `Giá trị mặc định` (`BulkCreateDefaultsDialog`) với badge số lượng trường đang đặt, giải phóng hoàn toàn chiều cao màn hình so với form cố định trước đây.
   - Các hành động nhanh: `Nhập CSV / Excel`, `Tải mẫu Excel` (.xlsx), `Lấy task Jira làm mẫu`.
   - Quản lý cột hiển thị (`BulkCreateColumnPicker`), chuyển đổi mật độ hiển thị (`Thoải mái` / `Nhỏ gọn`).
   - Cửa sổ trợ giúp phím tắt (`BulkCreateShortcutsDialog`).
   - Phím tắt và nút thêm dòng mới, làm mới bảng.

4. **Trình soạn thảo bảng tính (`BulkCreateDataGrid`)**:
   - Header cố định theo trục dọc (`sticky top-0 z-20 bg-card/95 backdrop-blur-xs`).
   - Các cột nhận diện cố định theo trục ngang: Checkbox (`sticky left-0`), Số dòng/Trạng thái lỗi (`sticky left-9`), Tiêu đề Summary (`sticky left-[76px]`), Cột thao tác (`sticky right-0`).
   - Hỗ trợ chỉnh sửa trực tiếp (inline editing) toàn bộ các trường chuẩn: Tiêu đề (Summary auto-grow), Loại task, Parent, Mức ưu tiên, Người thực hiện, Nhãn, Story Points, Ước tính thời gian, Hạn chót, Phiên bản phát hành, Mô tả công việc.
   - Dòng mở rộng trực tiếp (`ExpandedRowEditor`): mở rộng ngay dưới task bằng nút hoặc phím `Shift+Space`, cho phép nhập mô tả chi tiết không giới hạn và tùy biến toàn bộ thuộc tính mà không cần mở side panel.
   - Vẫn duy trì tùy chọn `TaskDetailSheet` cho những người dùng cần chế độ xem chi tiết dạng modal.

5. **Quản trị cấu hình cột và tùy biến (`lib/column-definitions.ts`, `lib/editor-preferences.ts`)**:
   - Cấu trúc typed column definition đầy đủ với cờ `isAvailable(metadata)` và `canToggle`.
   - Menu dropdown checkbox bật/tắt cột (`BulkCreateColumnPicker`) và nút khôi phục mặc định.
   - Lưu trữ preferences theo dự án (`bulk-create-columns:<projectKey>`).

6. **Sao chép - dán bảng tính (`lib/paste-matrix.ts`)**:
   - Hỗ trợ dán danh sách task nhiều dòng hoặc bảng tính TSV nhiều cột từ Excel / Google Sheets vào ô Summary.
   - Tự động tạo và điền vào các dòng liên tiếp (tối đa giới hạn 100 task).
   - Tự động khớp các trường Loại task, Mức ưu tiên, Người thực hiện, Story Points, Hạn chót.

7. **Validation và thanh trạng thái đáy (`lib/client-validation.ts`, `BulkCreateStatusBar`)**:
   - Kiểm tra client tức thì: bắt buộc có Tiêu đề, Sub-task bắt buộc có Parent, Points không âm, định dạng thời gian ước tính, độ dài mô tả tối đa.
   - Hiển thị tổng số lỗi và cảnh báo ở thanh trạng thái đáy, đi kèm nút `Tới dòng lỗi` tự động cuộn và focus vào cell cần sửa.
   - Tóm tắt các phím tắt phổ biến (`Tab`, `Ctrl+Enter`, `Ctrl+D`, `Ctrl+V`).

8. **Luồng quay lại sửa lỗi từ Preview (`onFixRow`)**:
   - Khi bấm sửa lỗi ở bước Xem trước (`CreatePreview`), hệ thống tự động quay lại màn hình nhập, tự mở toàn màn hình, cuộn tới đúng dòng và focus ngay vào ô gặp lỗi (hoặc mở rộng dòng nếu lỗi ở phần Mô tả).

### 15.2 Danh sách file đã tạo và cập nhật

- **File mới**:
  - `src/app/(app)/bulk/create/bulk-create-editor-shell.tsx`
  - `src/app/(app)/bulk/create/bulk-create-editor-topbar.tsx`
  - `src/app/(app)/bulk/create/bulk-create-command-bar.tsx`
  - `src/app/(app)/bulk/create/bulk-create-data-grid.tsx`
  - `src/app/(app)/bulk/create/bulk-create-defaults-dialog.tsx`
  - `src/app/(app)/bulk/create/bulk-create-column-picker.tsx`
  - `src/app/(app)/bulk/create/bulk-create-shortcuts-dialog.tsx`
  - `src/app/(app)/bulk/create/bulk-create-status-bar.tsx`
  - `src/app/(app)/bulk/create/expanded-row-editor.tsx`
  - `src/app/(app)/bulk/create/lib/column-definitions.ts`
  - `src/app/(app)/bulk/create/lib/editor-preferences.ts`
  - `src/app/(app)/bulk/create/lib/client-validation.ts`
  - `src/app/(app)/bulk/create/lib/paste-matrix.ts`
  - `src/app/(app)/bulk/create/lib/bulk-create-utils.test.ts`
- **File cập nhật**:
  - `src/app/(app)/bulk/create/bulk-create-client.tsx`
  - `src/app/(app)/bulk/create/create-preview.tsx`
  - `src/components/ui/dropdown-menu.tsx`
  - `docs/BULK_CREATE_FULLSCREEN_EDITOR_PLAN.md`

### 15.3 Kết quả kiểm thử

- **TypeScript check**: `tsc --noEmit` đạt 0 lỗi (clean).
- **Unit & Contract tests**: 122/122 test suites passed, 958/958 tests passed (bao gồm toàn bộ contract test và utils test mới).

