# Tài liệu Kỹ thuật: Cải tiến Logic và Trải nghiệm Tạo Task Hàng Loạt (Bulk Task Creation)

> **Cập nhật ngày:** 2026-10-03  
> **Phiên bản:** 2.0  
> **Phạm vi:** Module `/bulk/create`, Jira Client API, Metadata Caching, Validation & Dependency Rules, Dynamic Custom Fields UI, Preview Quick-Actions & Post-Execution Results Export.  
> **Trạng thái:** ✅ Đã hoàn thành toàn bộ (Quality Gate: 124 test files / 978 unit & contract tests passed).

---

## 1. Tổng quan mục tiêu
Tính năng **Bulk Task Creation** (`/bulk/create`) cho phép người dùng tạo từ vài chục đến hàng trăm task lên Jira một cách nhanh chóng qua bảng trực quan, file CSV/TSV, hoặc copy-paste từ Excel.

Trước khi nâng cấp, luồng tạo task gặp phải một số hạn chế nghiệp vụ:
1. **Thiếu Hợp phần (Jira Components):** Nhiều dự án Jira bắt buộc phải chọn Component nhưng hệ thống chưa fetch, validate hoặc hỗ trợ chọn component.
2. **Cascade Subtask Block bị treo:** Khi task cha trong batch bị lỗi dữ liệu ở Bước 2 (Preview), subtask con vẫn hiển thị trạng thái "sẵn sàng" ở Preview nhưng lại bị kẹt hoặc fail ngầm lúc thực thi, không có nút loại bỏ nhanh các dòng lỗi.
3. **Chặn liên kết Epic (Epic Link):** Các Issue Type tiêu chuẩn (Story, Task, Bug) bị chặn gán Parent với lỗi `PARENT_NOT_ALLOWED`, khiến người dùng không thể liên kết Story/Task vào một Epic Jira có sẵn hoặc tạo trong cùng batch.
4. **Bế tắc với Custom Fields bắt buộc:** Nếu issue type có trường tùy biến bắt buộc từ Jira (`required: true`), hệ thống báo lỗi `REQUIRED_CUSTOM_FIELD_MISSING` nhưng giao diện không có chỗ để người dùng nhập/chọn giá trị.
5. **Thiếu xuất danh sách kết quả:** Sau khi tạo hàng chục task thành công, người dùng chỉ có nút copy chuỗi Jira Key mà không có báo cáo chi tiết để chia sẻ hoặc lưu trữ.

Tài liệu này tổng hợp toàn bộ giải pháp kỹ thuật đã triển khai để giải quyết triệt để các vấn đề trên.

---

## 2. Chi tiết các module cải tiến

### 2.1 Hỗ trợ Hợp phần (Jira Components) toàn diện (End-to-End)
* **Jira Client (`src/lib/jira/client.ts` & `src/lib/jira/types.ts`)**:
  * Định nghĩa interface `JiraComponent { id: string; name: string; description?: string }`.
  * Bổ sung method `getProjectComponents(projectKey)` gọi Jira REST API: `/rest/api/2/project/{key}/components`.
* **Metadata & Types (`src/lib/bulk/create-types.ts` & `src/lib/bulk/create-ops.ts`)**:
  * Thêm `components?: Array<{ id: string; name: string; description?: string }>` vào `BulkCreateProjectMetadata`.
  * Thêm `componentIds?: string[]` vào `BulkCreateRowInput`, `BulkCreateFieldDefaults`, và `CanonicalCreateItem`.
  * `fetchBulkCreateMetadata()` fetch danh sách component song song, lưu cache và nhúng `components` vào SHA-256 fingerprint snapshot.
* **Validation & Parser (`src/lib/bulk/create-validator.ts` & `src/lib/bulk/csv-parser.ts`)**:
  * Validator đối chiếu `componentIds` theo cả ID và Tên (case-insensitive).
  * Chuẩn hóa về ID hợp lệ, báo lỗi `COMPONENT_NOT_FOUND` nếu không tồn tại.
  * Kiểm tra tính bắt buộc nếu schema Jira yêu cầu `components.required === true`.
  * Parser nhận diện các alias cột: `components`, `component`, `hợp phần`, `thành phần` (phân tách nhiều giá trị bằng dấu phẩy `;` hoặc `,`).
* **Giao diện người dùng (`src/app/(app)/bulk/create/components-combobox.tsx`)**:
  * Xây dựng `ComponentsCombobox`: Multi-select badge combobox có tìm kiếm, hỗ trợ chế độ compact (hiển thị trong ô bảng dữ liệu Data Grid) và chế độ full (hiển thị trong form, drawer, expanded editor).
  * Tích hợp vào Data Grid (cột `components`), Trình soạn thảo chi tiết dòng (`expanded-row-editor.tsx`), Drawer chi tiết (`task-detail-sheet.tsx`), Hộp thoại giá trị mặc định (`bulk-create-defaults-dialog.tsx`), và Thanh công cụ thao tác hàng loạt (`bulk-selection-toolbar.tsx`).

---

### 2.2 Xử lý Subtask phân tầng & Nút loại bỏ nhanh dòng lỗi ở Bước 2 Preview
* **Cascade Block Subtask (`src/lib/bulk/create-ops.ts`)**:
  * Trong `previewBulkCreate()`: Duyệt đồ thị phụ thuộc (`buildDependencyGraph`).
  * Nếu một task cha trong cùng batch bị phân loại là `blocked` (lỗi validation, thiếu summary, v.v.), tất cả subtask con trỏ tới task cha này sẽ tự động bị chặn:
    * `classification = "blocked"`.
    * `errors.push({ field: "parent", code: "PARENT_BLOCKED", message: 'Task cha "[parentRef]" trong batch đang bị lỗi, không thể tạo subtask này' })`.
* **Nút loại bỏ nhanh dòng lỗi (`src/app/(app)/bulk/create/create-preview.tsx` & `bulk-create-client.tsx`)**:
  * Tại thanh công cụ Bước 2 (Preview), khi có dòng bị lỗi (`blocked > 0`), hệ thống hiển thị nút:
    `Bỏ qua {blocked} dòng lỗi` kèm icon `Trash2`.
  * Handler `handleDiscardBlockedRows`:
    * Lọc bỏ toàn bộ các dòng bị lỗi khỏi danh sách batch items.
    * Tự động gọi lại `previewMutation.mutate()` để cập nhật bản Preview mới ngay lập tức.
    * Toàn bộ các dòng còn lại đạt trạng thái 100% hợp lệ, sẵn sàng bấm **"Tạo task trên Jira"**.

---

### 2.3 Hỗ trợ Liên kết Epic (Epic Link) cho Task thông thường
* **Nhận diện Epic Link Field (`src/lib/bulk/create-ops.ts`)**:
  * Tự động quét `issuetypes.fields` để tìm ID trường Epic Link (hỗ trợ cả Jira Server/DC custom field `com.pyxis.greenhopper.jira:gh-epic-link` hoặc các trường có tên "Epic Link" / "Epic").
  * Lưu `epicLinkFieldId` vào metadata snapshot và payload của `BulkOperation`.
* **Nới lỏng quy tắc Parent trong Validator (`src/lib/bulk/create-validator.ts`)**:
  * Trước đây: Mọi issue type không phải subtask (`!isSubtask && parent`) đều bị chặn với mã `PARENT_NOT_ALLOWED`.
  * Hiện tại:
    * Cho phép Issue Type tiêu chuẩn (Story, Task, Bug) gán Parent (trỏ tới Jira Key của Epic hoặc Epic được định nghĩa trong cùng batch).
    * Chỉ chặn `PARENT_NOT_ALLOWED` khi bản thân issue type là `Epic` (`isEpic && parent`).
    * Subtask vẫn giữ nguyên quy tắc bắt buộc phải có task cha (`PARENT_REQUIRED`).
* **Thực thi trên Jira Worker (`src/lib/bulk/create-ops.ts`)**:
  * Khi tạo issue trên Jira trong `processCreateItem`:
    * Nếu là `subtask`: truyền `extraFields.parent = { key: resolvedParentKey }`.
    * Nếu là task thông thường (Story/Task/Bug): gán `extraFields[epicLinkFieldId] = resolvedParentKey`. Nếu không có trường Epic Link riêng (như Jira Cloud Team-Managed), fallback sang `extraFields.parent = { key: resolvedParentKey }`.
* **UI thân thiện (`src/app/(app)/bulk/create/`)**:
  * Cập nhật `ParentCombobox` cho phép tìm kiếm và chọn cả Epic lẫn Task cha.
  * Khi người dùng đổi loại task từ Subtask sang Story/Task, không còn tự động xóa trắng parent nữa (chỉ xóa khi chuyển sang Epic).
  * Placeholder hiển thị rõ: Subtask hiển thị `"Bắt buộc *"`, Task thường hiển thị `"Chọn Epic / Task cha (tùy chọn)"`.

---

### 2.4 Giao diện Dynamic Custom Fields cho các trường tùy biến Jira
* **Component `DynamicCustomFields` (`src/app/(app)/bulk/create/dynamic-custom-fields.tsx`)**:
  * Tự động đối chiếu `metadata.fieldsByIssueType[effectiveIssueTypeId]` để lọc ra các trường custom field (ngoài các trường cơ bản như summary, description, assignee, priority, labels, timetracking, duedate, fixVersions, components, points, epicLink).
  * Phân tách thành hai nhóm:
    1. **Trường bắt buộc (`required: true`)**: Luôn hiển thị với nhãn màu cảnh báo nổi bật.
    2. **Trường tùy chọn (`required: false`)**: Thu gọn trong accordion "Mở rộng tùy chọn" để không làm rối giao diện.
  * Hỗ trợ render linh hoạt theo schema:
    * `allowedValues` có sẵn: Dropdown `Select` chọn giá trị.
    * `schemaType === "number"`: Input nhập số.
    * `schemaType === "date"`: Input chọn ngày `type="date"`.
    * Chuỗi thông thường: Text input.
* **Tích hợp**:
  * `expanded-row-editor.tsx`: Soạn thảo nhanh custom fields cho từng dòng trong bảng.
  * `task-detail-sheet.tsx`: Cung cấp tab/khung soạn thảo custom fields chi tiết ở drawer cạnh phải.
  * `bulk-create-defaults-dialog.tsx`: Cho phép cài đặt giá trị custom fields mặc định áp dụng chung cho toàn bộ batch.

---

### 2.5 Xuất kết quả tạo Task ra File CSV (Export Results)
* **Tính năng (`src/app/(app)/bulk/create/create-progress.tsx`)**:
  * Tại màn hình theo dõi tiến độ hoàn thành, bổ sung nút **"Xuất CSV ({total})"** kèm icon `Download`.
  * Cơ chế xuất:
    * Tạo nội dung CSV định dạng chuẩn RFC 4180 có escaping ký tự đặc biệt và dấu ngoặc kép.
    * Thêm tiền tố **UTF-8 BOM (`\uFEFF`)** để Microsoft Excel và Google Sheets mở trực tiếp mà không bị lỗi font chữ tiếng Việt có dấu.
    * Cột dữ liệu: `STT, Client Ref, Jira Key, Summary, Trạng thái, Lỗi / Chi tiết`.
    * Tên file xuất tự động: `bulk-create-[projectKey]-[opId].csv`.

---

## 3. Danh mục Files Chỉnh sửa & Tạo mới

| Đường dẫn File | Loại | Mô tả thay đổi |
|---|:---:|---|
| `src/lib/jira/types.ts` | Sửa | Định nghĩa type `JiraComponent`. |
| `src/lib/jira/client.ts` | Sửa | Thêm hàm `getProjectComponents(projectKey)`. |
| `src/lib/bulk/create-types.ts` | Sửa | Thêm `components`, `componentIds`, `epicLinkFieldId` vào type metadata, row input, canonical item. |
| `src/lib/bulk/create-ops.ts` | Sửa | Fetch/cache components, cascade block subtask ở preview, map components & epic link ở worker. |
| `src/lib/bulk/create-validator.ts` | Sửa | Validate components, nới lỏng parent cho standard tasks (Epic Link), chỉ block parent với Epic. |
| `src/lib/bulk/csv-parser.ts` | Sửa | Nhận diện alias CSV cho cột components (`hợp phần`, `thành phần`). |
| `src/app/(app)/bulk/create/components-combobox.tsx` | Mới | Multi-select badge combobox chọn Hợp phần. |
| `src/app/(app)/bulk/create/dynamic-custom-fields.tsx` | Mới | Trình render và chỉnh sửa linh hoạt các custom fields Jira. |
| `src/app/(app)/bulk/create/lib/column-definitions.ts` | Sửa | Thêm định nghĩa cột `components` vào Data Grid. |
| `src/app/(app)/bulk/create/bulk-create-data-grid.tsx` | Sửa | Hiển thị cột Hợp phần trên bảng grid. |
| `src/app/(app)/bulk/create/expanded-row-editor.tsx` | Sửa | Tích hợp Components, Dynamic Custom Fields, chỉnh logic đổi Issue Type. |
| `src/app/(app)/bulk/create/task-detail-sheet.tsx` | Sửa | Tích hợp Components, Dynamic Custom Fields vào Drawer chi tiết. |
| `src/app/(app)/bulk/create/bulk-create-defaults-dialog.tsx` | Sửa | Thêm thiết lập mặc định cho Components và Dynamic Custom Fields. |
| `src/app/(app)/bulk/create/create-defaults-form.tsx` | Sửa | Thêm lựa chọn Components mặc định. |
| `src/app/(app)/bulk/create/bulk-selection-toolbar.tsx` | Sửa | Thao tác gán Components hàng loạt, không wipe parent của standard task. |
| `src/app/(app)/bulk/create/create-preview.tsx` | Sửa | Thêm nút "Bỏ qua {X} dòng lỗi" (`Trash2`). |
| `src/app/(app)/bulk/create/bulk-create-client.tsx` | Sửa | Handler `handleDiscardBlockedRows` và tự động re-preview. |
| `src/app/(app)/bulk/create/create-progress.tsx` | Sửa | Thêm tính năng xuất kết quả CSV (`Download`). |
| `src/lib/bulk/create-validator.test.ts` | Sửa | Bổ sung unit test cho components, epic linking và epic block. |
| `src/app/(app)/bulk/create/lib/bulk-create-utils.test.ts` | Sửa | Cập nhật mock metadata chứa components. |

---

## 4. Kết quả Kiểm thử & Chất lượng Hệ thống

1. **Kiểm tra Kiểu (TypeScript)**:
   * Lệnh: `node ./node_modules/typescript/bin/tsc --noEmit`
   * Kết quả: **0 errors**, strict type safety.
2. **Kiểm thử Tự động (Vitest Suite)**:
   * Lệnh: `node ./node_modules/vitest/vitest.mjs run`
   * Kết quả: **124/124 test files passed**, **978/978 unit & contract tests passed**.
3. **Triển khai Container (Docker)**:
   * Các container `teamweb-web-1`, `teamweb-worker-1`, `teamweb-db-1` được build production bundle sạch sẽ và khởi chạy thành công tại `http://localhost:3100/bulk/create`.
