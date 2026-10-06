# Kế hoạch tạo task hàng loạt bằng AI và Excel

> Phiên bản: 1.1  
> Ngày cập nhật: 2026-10-03  
> Trạng thái: Đang triển khai (Đã hoàn thành Mục 18: AI-BULK-002A, AI-BULK-002B, AI-BULK-002C, Typecheck & Vitest pass)  
> Phạm vi: `/bulk/create`, AI phân rã yêu cầu, validation Jira, preview, xuất/nhập Excel và tạo task hàng loạt  
> Tài liệu liên quan: `BULK_CREATE_SMART_TASK_PLAN.md`, `BULK_CREATE_EXCEL_TEMPLATE_PLAN.md`, bộ tiêu chí `Jira Work Criteria` (DRAFT)

## 1. Mục tiêu

Cho phép người dùng đưa tài liệu yêu cầu cho AI để sinh một danh sách task có
cấu trúc, sau đó bắt buộc đi qua metadata và validator Jira hiện có trước khi:

1. đưa vào màn Bulk Create để người dùng chỉnh sửa;
2. xuất thành file Excel chuẩn theo project để gửi đi review; hoặc
3. preview và xác nhận tạo task bằng queue hiện có.

AI chỉ tạo **bản nháp đề xuất**. AI không tự ghi Jira, không tự chọn người chịu
trách nhiệm khi thiếu bằng chứng và không được sửa trực tiếp cấu trúc workbook.

## 2. Quyết định kiến trúc

Luồng chuẩn:

```text
Yêu cầu dạng text/tài liệu
        ↓
Chuẩn hóa và giới hạn dữ liệu đầu vào
        ↓
AI trả JSON theo contract cố định
        ↓
Map tên hiển thị → ID trong metadata Jira hiện tại
        ↓
Bulk Create validator + dependency graph
        ↓
Người dùng review/chỉnh sửa
        ↓
Xuất Excel hoặc Preview → Confirm → Queue → Jira
```

Không chọn luồng `AI sửa .xlsx → upload thẳng → Jira`, vì mô hình có thể làm
mất data validation, manifest, named range, đổi header hoặc bịa ID Jira.

Excel là định dạng trao đổi/review. JSON chuẩn hóa mới là contract giữa AI và hệ
thống.

## 3. Phạm vi MVP

### 3.1 Trong phạm vi

- Chọn đúng một Jira project trước khi gọi AI.
- Nhập yêu cầu bằng text hoặc dán nội dung tài liệu.
- Cấu hình cách phân rã: task đơn, task + sub-task, mức chi tiết và số task tối đa.
- AI đề xuất `summary`, `description`, acceptance criteria, issue type, priority,
  labels, points, estimate, due date tương đối và quan hệ cha–con.
- AI trả mức tin cậy, giả định, thông tin còn thiếu và lý do phân rã.
- Chỉ map giá trị nằm trong metadata Jira hiện tại.
- Dùng lại `validateAndNormalizeItem()` và dependency graph của Bulk Create.
- Cho phép chỉnh sửa mọi đề xuất trước khi tạo.
- Xuất bản nháp AI thành file `.xlsx` bằng generator của hệ thống.
- Audit provider, model, prompt version, người gọi, thời gian và kết quả review.
- Giới hạn tối đa 100 task, mặc định AI chỉ sinh tối đa 20 task/lần.

### 3.2 Ngoài phạm vi MVP

- AI đọc trực tiếp file Word/PDF/ảnh bằng OCR.
- Tự động tạo task không cần con người xác nhận.
- Tự chọn Assignee dựa trên phỏng đoán.
- Tự tạo Jira user, issue type, version, component hoặc custom option.
- Nhiều project trong cùng một lần sinh.
- Gửi tài liệu mật sang provider khi project/chính sách chưa cho phép.
- AI tự sửa workbook đã có dữ liệu phức tạp.

## 4. Trải nghiệm người dùng

### 4.1 Điểm vào

Thêm nút **Tạo task bằng AI** trên command bar của `/bulk/create`, cạnh các nút
Nhập Excel và Tải mẫu Excel. Nút chỉ bật khi:


- đã chọn project;
- người dùng có quyền tạo issue;
- metadata project đã tải xong;
- provider AI đã được cấu hình.

### 4.2 Wizard ba bước

#### Bước 1 — Cung cấp yêu cầu

- Textarea: mục tiêu, phạm vi, yêu cầu nghiệp vụ/kỹ thuật.
- Tuỳ chọn dán acceptance criteria, biên bản họp hoặc user story.
- Không nhận token, mật khẩu, secret hoặc dữ liệu cá nhân nhạy cảm.
- Hiển thị số ký tự và cắt/chặn khi vượt giới hạn.

#### Bước 2 — Cách phân rã

- Kiểu đầu ra:
  - Task độc lập.
  - Task cha + sub-task.
  - Epic/Story/Task khi project hỗ trợ và metadata mô tả rõ.
- Mức chi tiết: Gọn / Cân bằng / Chi tiết.
- Số task tối đa: 5–50, mặc định 20.
- Checkbox đề xuất Story Points, Priority, Labels và Estimate.
- Ngôn ngữ đầu ra: theo ngôn ngữ nội dung đầu vào, mặc định tiếng Việt.

Assignee, Fix Version và Due Date mặc định không cho AI tự quyết định. Người dùng
có thể cung cấp constraint rõ ràng; hệ thống vẫn phải map và validate lại.

#### Bước 3 — Review bản nháp

- Hiển thị task dạng cây cha–con.
- Mỗi task có badge `Sẵn sàng`, `Cần xem lại`, `Bị chặn`.
- Hiển thị confidence, assumptions, missing information và warnings.
- Cho sửa từng field bằng editor Bulk Create hiện có.
- Các hành động:
  - Thêm vào danh sách hiện tại.
  - Thay thế danh sách hiện tại.
  - Xuất Excel để gửi review.
  - Sinh lại toàn bộ.
  - Sinh lại riêng một task.

Không có nút “Tạo Jira ngay” trong dialog AI. Dữ liệu phải quay về preview chuẩn
của Bulk Create trước khi confirm.

## 5. Contract dữ liệu AI

### 5.1 Input

```ts
type AiBulkTaskGenerationInput = {
  project: {
    key: string;
    name: string;
  };
  requirements: string;
  mode: "flat" | "parent-subtasks" | "hierarchy";
  detailLevel: "compact" | "balanced" | "detailed";
  maxItems: number;
  locale: "vi" | "en";
  requestedFields: {
    points: boolean;
    priority: boolean;
    labels: boolean;
    originalEstimate: boolean;
  };
  allowedMetadata: {
    issueTypes: Array<{ id: string; name: string; subtask: boolean }>;
    priorities: Array<{ id: string; name: string }>;
    components: Array<{ id: string; name: string }>;
    pointScale: number[];
  };
};
```

Chỉ gửi metadata cần thiết cho việc sinh task. Không gửi Jira token, email không
cần thiết, danh sách user đầy đủ hoặc nội dung project khác.

### 5.2 Output thô từ AI

```ts
type AiBulkTaskDraft = {
  promptVersion: string;
  title: string;
  assumptions: string[];
  missingInformation: string[];
  items: Array<{
    clientRef: string;
    summary: string;
    description: string;
    acceptanceCriteria: string[];
    issueTypeName?: string;
    parentRef?: string;
    priorityName?: string;
    labels?: string[];
    points?: number;
    originalEstimate?: string;
    componentNames?: string[];
    confidence: number;
    reasoning: string;
  }>;
};
```

AI chỉ trả tên hiển thị, không được tự tạo Jira ID. Server map tên sang ID bằng
metadata snapshot hiện tại.

### 5.3 Contract sau chuẩn hóa

Sau khi parse, output phải được chuyển về `BulkCreateRowInput[]`. Mọi field không
map được phải trở thành warning/error; không truyền nguyên text chưa xác thực cho
worker.

## 6. Prompt và nguyên tắc sinh task

Prompt phải chứa:

- Vai trò: BA/Engineering Lead phân rã yêu cầu.
- Danh mục Issue Type/Priority/Component được phép.
- Giới hạn số task và giới hạn độ dài field.
- Quy tắc `Client Ref` duy nhất và quan hệ `parentRef` không vòng lặp.
- Summary bắt đầu bằng động từ, ngắn gọn và không trùng.
- Description gồm mục tiêu, phạm vi, acceptance criteria và ngoài phạm vi.
- Task nên đủ nhỏ để hoàn thành trong 1–3 ngày khi có thể.
- Không bịa Assignee, Jira key, Version, deadline hoặc dependency.
- Thiếu thông tin phải ghi vào `missingInformation` và hạ confidence.
- Chỉ trả JSON, không markdown hoặc văn bản ngoài contract.

Phiên bản prompt riêng: `bulk-task-generation-v1`. Không dùng chung version với
prompt estimate hiện tại.

## 7. Validation và mức độ tin cậy

Validation chạy theo thứ tự:

1. Parse JSON và kiểm tra schema/type/size.
2. Cắt tối đa `maxItems` và không bao giờ vượt 100.
3. Chuẩn hóa chuỗi, giới hạn Summary/Description/Labels.
4. Map Issue Type, Priority, Component theo metadata hiện tại.
5. Chuẩn hóa Story Points về `POINT_SCALE` hoặc báo warning.
6. Kiểm tra Client Ref duy nhất.
7. Kiểm tra parent tồn tại, không tự tham chiếu và không có cycle.
8. Chạy Bulk Create validator theo Issue Type thực tế.
9. Phân loại:
   - `ready`: không lỗi và confidence đạt ngưỡng hiển thị.
   - `review`: hợp lệ kỹ thuật nhưng có assumption/missing info/confidence thấp.
   - `blocked`: vi phạm metadata hoặc validation Jira.

Confidence không được dùng để tự động tạo Jira. Nó chỉ giúp ưu tiên phần cần con
người xem kỹ.

## 8. Kiến trúc backend

### 8.1 Tách contract AI sinh task

Không mở rộng `LLMProvider` hiện tại bằng logic Bulk cụ thể. Tạo contract riêng:

```ts
interface AiTaskGenerator {
  readonly name: string;
  generateTasks(input: AiBulkTaskGenerationInput): Promise<AiBulkTaskDraft>;
}
```

OpenAI-compatible và Ollama có adapter riêng nhưng dùng chung prompt builder,
parser, retry và error taxonomy.

### 8.2 API đề xuất

`POST /api/bulk/create/ai/generate`

- Yêu cầu session và quyền project.
- Kiểm tra cấu hình LLM.
- Rate limit theo user.
- Fetch metadata Jira mới nhất.
- Sanitize input và gọi provider.
- Parse, map, validate rồi trả draft + warnings + metrics.
- Không ghi Jira và chưa tạo `BulkOperation`.

`POST /api/bulk/create/ai/export`

- Nhận draft đã được server validate.
- Revalidate metadata/fingerprint.
- Gọi generator Excel hiện có để xuất workbook chuẩn.
- Không nhận workbook do AI tạo.

Có thể không cần endpoint export riêng ở MVP nếu mở rộng
`generateBulkCreateExcelTemplate()` để nhận `initialItems` và gọi nội bộ từ route.

### 8.3 Timeout và retry

- Timeout mục tiêu: 30 giây/lần gọi.
- Tối đa 2 lần khi lỗi mạng hoặc JSON không parse được.
- Không retry lỗi permission, payload quá lớn hoặc provider từ chối nội dung.
- Nếu hết retry, trả `AI_UNAVAILABLE`; không sinh task giả/fallback.

Với yêu cầu lớn, MVP vẫn gọi đồng bộ. Chuyển sang queue chỉ khi đo thực tế cho
thấy latency thường xuyên vượt giới hạn reverse proxy.

## 9. Lưu trữ và audit

MVP có thể không lưu toàn bộ nội dung yêu cầu. Khuyến nghị model audit tối thiểu:

```prisma
model AiBulkGeneration {
  id                  String   @id @default(cuid())
  userId              String
  projectKey          String
  provider            String
  model               String
  promptVersion       String
  metadataFingerprint String
  inputHash           String
  inputLength         Int
  requestedMaxItems   Int
  outputItemCount     Int
  readyCount          Int
  reviewCount         Int
  blockedCount        Int
  durationMs          Int
  status              String
  errorCode           String?
  createdAt           DateTime @default(now())
}
```

Không lưu prompt/raw response mặc định. Nếu cần debug, dùng feature flag, redact
secret/PII và TTL ngắn. Không ghi requirement đầy đủ vào application log.

## 10. Bảo mật và giới hạn sử dụng

- Server gọi provider; không để API key ở client.
- Giới hạn input theo ký tự/token và từ chối file nhị phân ở MVP.
- Prompt coi nội dung người dùng là dữ liệu, không phải chỉ dẫn hệ thống.
- Không cho nội dung đầu vào thay đổi allowed metadata hoặc output schema.
- Loại bỏ HTML/script, control characters và công thức nguy hiểm khi xuất Excel.
- Rate limit gợi ý: 5 lần/10 phút/user và 30 lần/giờ/project.
- Ghi audit lỗi nhưng không log secret hoặc toàn bộ tài liệu.
- Hiển thị cảnh báo dữ liệu có thể được gửi tới provider bên ngoài.
- Với Ollama nội bộ vẫn áp dụng cùng validation và human review.

## 11. Thay đổi dự kiến theo file

### Backend/domain

- `src/lib/ai/task-generation-types.ts`: input/output/error contracts.
- `src/lib/ai/task-generation-prompt.ts`: prompt builder và prompt version.
- `src/lib/ai/task-generation-parser.ts`: JSON parser + giới hạn dữ liệu.
- `src/lib/ai/task-generator.ts`: provider-neutral interface và adapter factory.
- `src/lib/ai/openai.ts`: thêm primitive generate JSON dùng lại an toàn, không
  để Bulk gọi private method hiện tại.
- `src/lib/ai/ollama.ts`: adapter tương ứng.
- `src/lib/bulk/ai-draft-normalizer.ts`: map tên sang Jira IDs và tạo
  `BulkCreateRowInput[]`.
- `src/app/api/bulk/create/ai/generate/route.ts`: auth, permission, rate limit,
  metadata, AI call và validation.
- `src/lib/bulk/excel-template.ts`: hỗ trợ `initialItems` để xuất draft AI.
- `src/app/api/bulk/create/ai/export/route.ts`: xuất file nếu chọn endpoint riêng.

### UI

- `src/app/(app)/bulk/create/ai-task-dialog.tsx`: wizard chính.
- `src/app/(app)/bulk/create/ai-task-review.tsx`: cây task và cảnh báo.
- `src/app/(app)/bulk/create/bulk-create-command-bar.tsx`: nút mở AI dialog.
- `src/app/(app)/bulk/create/bulk-create-editor-shell.tsx`: nhận draft theo chế
  độ replace/append.
- `src/lib/query-keys.ts`: query/mutation keys nếu dùng TanStack mutation state.

### Database/config/docs

- `prisma/schema.prisma`: audit model nếu chọn lưu DB ở MVP.
- `.env.example`: timeout, input limit, rate limit và feature flag.
- `docs/RUNBOOK.md`: xử lý provider unavailable, timeout, quota và malformed JSON.

## 12. Kế hoạch triển khai

### Pha 0 — Chốt product contract (0,5 ngày)

- Chốt field AI được phép đề xuất.
- Chốt giới hạn input, task và rate limit.
- Chốt việc lưu hay không lưu raw requirement/response.
- Chốt project pilot và provider dùng thử.

**DoD:** Có contract JSON và 5 bộ yêu cầu mẫu được PM/Tech Lead duyệt.

### Pha 1 — Domain, prompt và parser (1–1,5 ngày)

- Tạo types, prompt version và parser.
- Parse JSON có code fence/nội dung thừa nhưng từ chối output không đủ cấu trúc.
- Clamp confidence, points, field length và item count.
- Test prompt injection, JSON lỗi, ref trùng, parent cycle và output quá lớn.

**DoD:** Unit test parser/normalizer bao phủ success và failure path.

### Pha 2 — Provider và API generate (1–1,5 ngày)

- Refactor primitive gọi model dùng chung cho OpenAI-compatible/Ollama.
- Thêm `AiTaskGenerator` và endpoint generate.
- Auth, permission, metadata refresh, timeout, retry và error mapping.
- Không tạo operation hoặc ghi Jira ở endpoint này.

**DoD:** API trả draft chuẩn hóa và phân loại ready/review/blocked.

### Pha 3 — UI wizard và review (2 ngày)

- Thêm nút Tạo task bằng AI.
- Xây wizard input/config/review.
- Dùng Skeleton khi chờ; empty/error state đúng design system.
- Append/replace vào editor, giữ source là `ai` hoặc bổ sung provenance riêng.
- Không mất dữ liệu grid khi đóng dialog hoặc gọi AI lỗi.

**DoD:** Người dùng sinh, sửa và đưa draft vào Bulk Create mà chưa ghi Jira.

### Pha 4 — Xuất Excel từ draft AI (1 ngày)

- Mở rộng generator nhận initial items.
- Ghi dữ liệu vào sheet `Tasks`, giữ dropdown/named range/manifest.
- Kiểm tra công thức nguy hiểm và metadata fingerprint.
- Thêm nút Xuất Excel ở review.

**DoD:** File xuất ra import ngược lại được và cho cùng dữ liệu chuẩn hóa.

### Pha 5 — Audit, hardening và pilot (1–2 ngày)

- Audit metrics, rate limit và feature flag.
- Test quyền, dữ liệu lớn, provider lỗi, timeout và concurrent requests.
- Pilot 30–50 yêu cầu thật với PM/Tech Lead.
- Đo tỷ lệ task được giữ nguyên, task sửa, task xoá và lỗi validation.

**DoD:** Không có đường AI bypass preview/confirm; có số liệu quyết định rollout.

Ước lượng MVP: **6,5–8,5 ngày kỹ thuật**, chưa tính thời gian pilot.

## 13. Chiến lược test

### Unit test

- Prompt luôn chứa allowed metadata và giới hạn.
- Parser chấp nhận JSON sạch/code fence, từ chối dữ liệu sai type.
- Không vượt max items/field length.
- Mapping tên không phân biệt hoa thường nhưng phát hiện tên trùng mơ hồ.
- Parent ref không tồn tại, tự tham chiếu và cycle.
- Story point ngoài scale chỉ warning/normalize theo quyết định product.
- Công thức Excel nguy hiểm được escape khi export.

### Integration test

- API auth/permission/config missing.
- Provider success, timeout, 429, 5xx và malformed output.
- Metadata thay đổi giữa generate và export.
- Draft qua cùng validator với nhập tay/Excel.
- Export Excel rồi import lại cho kết quả tương đương.

### UI/E2E

- Không chọn project thì không gọi AI.
- Loading dùng Skeleton, nút chống double submit.
- Provider lỗi không làm mất nội dung yêu cầu hoặc grid hiện tại.
- Append/replace hoạt động đúng giới hạn 100 dòng.
- Người dùng không thể confirm khi còn item blocked.

## 14. Chỉ số pilot

- Tỷ lệ AI response parse thành công ≥ 98%.
- Tỷ lệ draft không có lỗi metadata ≥ 90%.
- Tỷ lệ task được người review giữ lại ≥ 70%.
- Tỷ lệ task cần sửa Summary/Description/parent.
- Số assumption/missing information trên mỗi lần sinh.
- P50/P95 latency và provider unavailable rate.
- Không có task được tạo mà chưa qua human confirm.
- Không có secret/token xuất hiện trong log hoặc audit record.

## 15. Rủi ro và giảm thiểu

| Rủi ro | Mức độ | Giảm thiểu |
|---|---:|---|
| AI bịa Jira ID hoặc Assignee | Cao | AI chỉ trả tên; server map metadata; Assignee không tự đề xuất trong MVP |
| AI làm hỏng workbook | Cao | AI không sửa Excel; generator hệ thống xuất workbook |
| Task quá lớn/trùng/lạc phạm vi | Trung bình | Prompt rubric, duplicate checks, confidence và human review |
| Prompt injection trong tài liệu | Cao | Tách instruction/data, schema validation, không cấp tool Jira cho model |
| Rò dữ liệu sang provider | Cao | Consent, redact, giới hạn input, Ollama cho project nhạy cảm |
| Provider chậm/không ổn định | Trung bình | Timeout, retry giới hạn, giữ input, không fallback giả |
| Metadata Jira thay đổi | Trung bình | Fingerprint + revalidate trước export/preview |
| Chi phí tăng | Trung bình | Rate limit, max input/items, metrics theo user/project |

## 16. Thứ tự ưu tiên ticket

| Ticket | Nội dung | Ưu tiên | Phụ thuộc |
|---|---|---:|---|
| AI-BULK-001 | Contract, prompt, parser | P0 | Không |
| AI-BULK-002 | Normalizer + Jira metadata validation | P0 | 001 |
| AI-BULK-003 | Provider adapter + generate API | P0 | 001–002 |
| AI-BULK-004 | Wizard input/config | P0 | 003 |
| AI-BULK-005 | Review tree + append/replace | P0 | 002, 004 |
| AI-BULK-006 | Export Excel từ AI draft | P1 | 002, 005 |
| AI-BULK-007 | Audit, rate limit, feature flag | P1 | 003 |
| AI-BULK-008 | Pilot metrics và runbook | P1 | 004–007 |

## 17. Definition of Done tổng

- AI không có API/path ghi Jira trực tiếp.
- Mọi draft đi qua metadata hiện tại và Bulk Create validator.
- Người dùng xem và chỉnh sửa trước preview/confirm.
- Export Excel do server tạo, import lại không mất dữ liệu chuẩn hóa.
- Provider lỗi không tạo output giả và không làm mất dữ liệu người dùng.
- Có test cho parser, prompt injection, parent graph, permission và round-trip Excel.
- Có audit/metrics nhưng không lưu secret hoặc requirement đầy đủ mặc định.
- Light/dark mode, keyboard focus, responsive và loading/empty/error state đạt
  design system của dự án.

## 18. Tích hợp Jira Work Criteria vào AI tạo task

### 18.1 Nguyên tắc áp dụng

Bộ Jira Work Criteria hiện ở trạng thái **DRAFT**, cần leader review trước khi áp
dụng chính thức. Vì vậy không hard-code tiêu chí này thành luật chung. Mỗi project
có một policy với ba chế độ:

- `off`: không áp dụng rule bổ sung.
- `warn`: hiển thị cảnh báo nhưng vẫn cho đưa draft vào editor; dùng khi pilot.
- `enforce`: thiếu field bắt buộc thì item bị `blocked`; chỉ bật sau khi leader chốt.

Khuyến nghị rollout: `off → warn` trong 2–3 sprint → đo dữ liệu → leader duyệt →
`enforce` cho project phù hợp.

AI chỉ tạo **bản nháp theo tiêu chí**, không tự kết luận task đã đạt chuẩn vận hành.
Các rule vẫn được server kiểm tra bằng metadata Jira và code xác định.

### 18.2 Phân biệt tiêu chí lúc tạo và tiêu chí vòng đời

Jira Work Criteria bao phủ cả lúc tạo issue lẫn quá trình thực hiện/báo cáo. AI
Bulk Create chỉ xử lý những tiêu chí có thể xác định trước khi tạo:

| Tiêu chí | Xử lý khi AI tạo task |
|---|---|
| Original Estimate | AI đề xuất; người dùng review; validator kiểm tra cú pháp Jira |
| Story Points | AI đề xuất theo thang `1/2/3/5/8/13`; 13 điểm cần cảnh báo tách nhỏ |
| Loại việc | Bắt buộc chọn `Feature/Defect/Debt/Risk` khi policy bật |
| Fix Version | Người dùng chọn từ metadata; AI không được bịa Version |
| Due Date | Server tính từ ngày bắt đầu + baseline point; AI không tự tính lịch |
| Description/Acceptance Criteria | AI sinh theo template chất lượng, người dùng review |
| Worklog hàng ngày | Không thể có lúc tạo; kiểm tra trong vòng đời task |
| Task “ngâm”, cycle/lead time, overdue | Thuộc bot/reporting sau khi task được tạo |
| Release gate theo Version | Tái sử dụng release gate hiện có, không xử lý trong prompt sinh task |

Điều này tránh việc AI tạo Worklog giả, ngày giả hoặc đánh dấu một task mới là đã
đạt tiêu chí vận hành chỉ vì đủ field khởi tạo.

### 18.3 Contract policy theo project

Bổ sung planning context và policy vào input của AI/server:

```ts
type JiraWorkCriteriaPolicy = {
  version: string; // ví dụ jira-work-criteria-v1
  mode: "off" | "warn" | "enforce";
  requiredAtCreation: Array<
    "originalEstimate" | "points" | "workCategory" | "fixVersion" | "dueDate"
  >;
  pointScale: number[];
  cycleTimeUpperDaysByPoint: Record<string, number>;
  workCategoryMapping: {
    strategy: "label" | "customField" | "issueType";
    fieldId?: string;
    values: {
      feature: string;
      defect: string;
      debt: string;
      risk: string;
    };
  };
};

type AiBulkPlanningContext = {
  defaultWorkCategory?: "feature" | "defect" | "debt" | "risk";
  fixVersionId?: string;
  plannedStartDate?: string;
  businessDeadline?: string;
  businessDeadlineReason?: string;
};
```

Output AI bổ sung:

```ts
type AiWorkCriteriaDraftFields = {
  workCategory: "feature" | "defect" | "debt" | "risk";
  categoryReasoning: string;
  originalEstimate?: string;
  points?: number;
};
```

AI không trả `fixVersionId` hoặc Due Date tự do. Hai field này đến từ planning
context và phép tính xác định phía server.

### 18.4 Phân loại công việc bắt buộc

Mỗi task có đúng một nhóm:

- **Feature**: chức năng mới theo yêu cầu nghiệp vụ.
- **Defect**: lỗi chức năng đang tồn tại cần sửa.
- **Debt**: nợ kỹ thuật được ghi nhận có chủ đích; luôn có label `tech-debt`.
- **Risk**: rủi ro đã nhận diện nhưng chưa xảy ra.

Cách lưu vào Jira phải cấu hình theo project vì có project dùng label, project dùng
custom field hoặc issue type. Mặc định an toàn cho MVP là label
`work-feature/work-defect/tech-debt/work-risk`, nhưng chỉ bật sau khi xác nhận
không xung đột quy ước hiện có.

AI đề xuất category kèm reasoning. Nếu confidence thấp hoặc nội dung nằm giữa
Defect và Debt, item chuyển sang `review`, không tự chốt.

### 18.5 Baseline Story Point và Cycle Time

Baseline khởi điểm từ Jira Work Criteria:

| Point | Cycle time kỳ vọng | Cận trên tính Due Date | Ngưỡng cảnh báo vòng đời |
|---:|---:|---:|---:|
| 1 | 0,5–1 ngày | 1 ngày | > 1,5 ngày |
| 2 | 1–1,5 ngày | 1,5 ngày | > 2,5 ngày |
| 3 | 1,5–2,5 ngày | 2,5 ngày | > 4 ngày |
| 5 | 2,5–4 ngày | 4 ngày | > 6 ngày |
| 8 | 4–6 ngày | 6 ngày | > 9 ngày |
| 13 | 6–9 ngày | 9 ngày | > 13 ngày; khuyến nghị tách task |

Không hard-code bảng này trong prompt. Lưu thành project policy có version để sau
2–3 sprint thay bằng dữ liệu thực đo mà không cần sửa code hoặc prompt.

Prompt phải yêu cầu:

- Point chỉ nhận `1/2/3/5/8/13`.
- Task 13 điểm phải giải thích vì sao chưa tách được.
- Task lớn hơn 13 điểm bắt buộc phân rã thành nhiều task.
- Original Estimate và Story Points là hai field khác nhau.
- Estimate không tương xứng với baseline point phải có reasoning/cảnh báo.

### 18.6 Tính Due Date phía server

Due Date không do LLM tính. Khi có ngày bắt đầu và points:

```text
dueDate = addBusinessDays(plannedStartDate, cycleTimeUpperDays(points), calendar)
```

Quy tắc:

- Không tính thứ Bảy, Chủ nhật; ngày nghỉ lấy từ project calendar nếu có.
- Baseline 1,5 hoặc 2,5 ngày cần quy tắc làm tròn cấu hình; MVP làm tròn lên ngày
  làm việc kế tiếp.
- Deadline nghiệp vụ sớm hơn được phép override nhưng bắt buộc có lý do.
- Không tự động dời Due Date khi trễ.
- Không có ngày bắt đầu thì Due Date ở trạng thái `review/blocked` tuỳ policy,
  không ngầm dùng ngày hiện tại.

### 18.7 Fix Version

- Người dùng chọn Fix Version mục tiêu từ metadata trước hoặc sau khi AI sinh.
- Server áp dụng Version ID đã xác thực cho batch.
- AI không tự chọn từ tên release trong tài liệu, trừ khi server tìm được đúng một
  match và người dùng xác nhận.
- Version released/archived không dùng cho task mới nếu không có override của lead.
- Khi policy `enforce`, thiếu Fix Version làm item `blocked` trước preview.

### 18.8 Template Description do AI sinh

AI tạo description đồng đều theo cấu trúc:

```text
Mục tiêu
<Kết quả cần đạt>

Phạm vi
- <Việc nằm trong task>

Ngoài phạm vi
- <Việc không thuộc task hoặc cần ticket khác>

Tiêu chí nghiệm thu
- [ ] <Điều kiện kiểm chứng được>

Rủi ro/Phụ thuộc
- <Thông tin đã biết; không có thì ghi Không xác định>

Giả định cần xác nhận
- <Các giả định của AI>
```

Không chèn checklist “đủ điều kiện Done” đầy đủ vào mọi description trong MVP vì
checklist chứa Worklog/PR/test là dữ liệu vòng đời. Checklist này phù hợp hơn với
comment/template khi issue chuyển trạng thái.

### 18.9 Quality score xác định bằng rule

Mỗi draft có điểm chất lượng giải thích được, không dùng điểm cảm tính do LLM tự
chấm:

| Thành phần | Điểm |
|---|---:|
| Summary rõ ràng, không trùng | 15 |
| Description đúng template | 15 |
| Acceptance criteria kiểm chứng được | 20 |
| Work category hợp lệ | 10 |
| Original Estimate hợp lệ | 10 |
| Story Points hợp lệ | 10 |
| Fix Version hợp lệ | 10 |
| Due Date có căn cứ | 10 |

- `90–100`: Sẵn sàng review cuối.
- `70–89`: Cần xem lại.
- `< 70` hoặc có rule bắt buộc lỗi: Bị chặn khi policy `enforce`.

Quality score chỉ phản ánh độ đầy đủ của dữ liệu, không đánh giá năng lực cá nhân
và không thay thế validation Jira.

### 18.10 Thay đổi kỹ thuật bổ sung

Các file/module đã triển khai:

- [x] `src/lib/bulk/work-criteria-policy.ts`: policy mode (`off/warn/enforce`), category mapping, required fields, baseline point/cycle time và rule-based quality score.
- [x] `src/lib/bulk/business-days.ts`: tính Due Date theo ngày làm việc/project calendar, bỏ qua cuối tuần/ngày lễ, làm tròn MVP và kiểm tra deadline nghiệp vụ override.
- [x] `src/lib/bulk/ai-draft-normalizer.ts`: map category, validate version/estimate/due date, loại bỏ worklog giả lập lúc tạo và phân loại item (`ready/review/blocked`).
- [ ] `src/app/(app)/bulk/create/ai-task-dialog.tsx`: UI wizard chọn category mặc định, Fix Version và ngày bắt đầu (thuộc phase UI AI-BULK-004).
- [ ] Cấu hình DB hoặc env/project settings cho policy version và mode.

Ticket bổ sung:

| Ticket | Nội dung | Ưu tiên | Trạng thái | Phụ thuộc |
|---|---|---:|---|---|
| AI-BULK-002A | Work Criteria policy + category mapping | P0 | **Đã hoàn thành** (`src/lib/bulk/work-criteria-policy.ts`) | AI-BULK-001 |
| AI-BULK-002B | Business-day Due Date calculator | P0 | **Đã hoàn thành** (`src/lib/bulk/business-days.ts`) | AI-BULK-002A |
| AI-BULK-002C | Rule-based quality score | P1 | **Đã hoàn thành** (`src/lib/bulk/work-criteria-policy.ts`) | AI-BULK-002A |
| AI-BULK-008A | Lifecycle handoff cho Worklog/stale/overdue bot | P1 | Chờ pilot | AI-BULK-008 |

### 18.11 Test bắt buộc bổ sung

Đã triển khai đầy đủ 100% test suites trong Vitest:
- `src/lib/bulk/business-days.test.ts` (14/14 tests pass)
- `src/lib/bulk/work-criteria-policy.test.ts` (7/7 tests pass)
- `src/lib/bulk/ai-draft-normalizer.test.ts` (17/17 tests pass)

- [x] Category `Feature/Defect/Debt/Risk` map đúng theo project config (`label` và `customField`).
- [x] Debt luôn có label `tech-debt` bất kể chiến lược cấu hình.
- [x] Due Date bỏ qua cuối tuần/ngày nghỉ và xử lý đúng point baseline (làm tròn lên ngày làm việc kế tiếp).
- [x] Deadline nghiệp vụ override nhưng thiếu lý do phải warning (warn) hoặc blocked (enforce).
- [x] Policy `off/warn/enforce` cho kết quả phân loại (`ready`, `review`, `blocked`) chính xác.
- [x] Fix Version released/archived bị cảnh báo hoặc từ chối theo policy.
- [x] Point 13 tạo cảnh báo tách nhỏ; point lớn hơn 13 bị chặn/yêu cầu phân rã.
- [x] Worklog không bao giờ được AI giả lập ở thời điểm tạo (tự động strip và cảnh báo).
- [x] Quality score luôn tái lập được từ cùng một input (100% deterministic), không phụ thuộc LLM.

### 18.12 Definition of Done bổ sung

- [x] Work Criteria được cấu hình theo project và mặc định ở chế độ `warn`, không tự bật `enforce` khi còn DRAFT.
- [x] Category, Points, Estimate, Fix Version và Due Date có validation giải thích được với mã lỗi/cảnh báo rõ ràng.
- [x] Due Date do server tính theo business calendar; AI không tự bịa ngày.
- [x] Worklog và các tiêu chí vòng đời không bị giả lập trong task mới (bị loại bỏ và phát cảnh báo nếu xuất hiện).
- [x] Bật/tắt policy không làm thay đổi contract Bulk Create hoặc bỏ qua Jira validator.
- [ ] Có số liệu pilot về tỷ lệ task đủ 5 field khởi tạo, task 13 điểm bị tách và Due Date bị người dùng điều chỉnh (triển khai trong giai đoạn rollout).

