# Form tạo task dùng chung + AI hỗ trợ — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Board, Sentry (duyệt 1 lỗi) và tạo hàng loạt dùng cùng một bộ field tạo task; thêm AI để điền form từ ý tưởng thô, tóm tắt lỗi Sentry và tách sub-task.

**Architecture:** Tách các field component đang nằm trong `bulk/create` ra `src/components/task-fields/`. Dựng `TaskCreateForm` và `TaskCreateDialog` dùng chung. Mọi lần tạo một task đều đi qua pipeline bulk như một batch 1 dòng (preview → confirm → worker pg-boss), chạy bằng token Jira của người bấm. AI dùng `aiProvider` có sẵn qua một helper `generateJson`, kết quả được map về ID của Jira bằng `normalizeAiDraftBatch` có sẵn.

**Tech Stack:** Next.js App Router, React 19, TanStack Query, Tailwind v4 + shadcn/ui, Prisma, pg-boss, vitest, OpenAI-compatible LLM.

**Spec:** mục "Quyết định thiết kế" ngay bên dưới (đã chốt với dev ngày 2026-10-17).

## Quyết định thiết kế

Các quyết định dev đã chốt:
1. **Board:** có nút "Tạo task" trên header. Bấm vào mở Sheet chứa form đầy đủ field. Project lấy theo tab đang chọn (`selectedProject`).
2. **Sentry:** chỉ luồng duyệt **1 lỗi** dùng form đầy đủ, điền sẵn từ Sentry. Duyệt nhiều lỗi vẫn giữ dialog đơn giản và worker `sentry-import` như hiện tại.
3. **Tạo task:** qua pipeline bulk, dùng **token Jira của người bấm**. Với Sentry thì người bấm là admin.
4. **AI có ba phần:**
   - (a) ý tưởng thô → AI điền form;
   - (b) AI tóm tắt lỗi Sentry từ event mới nhất;
   - (c) AI tách sub-task rồi chuyển sang màn tạo hàng loạt.
5. **Không** làm gợi ý story point trong form.
6. **Sentry API mới:** chỉ thêm endpoint lấy event mới nhất của một issue. Token cần scope `event:read`; [SENTRY_TOKEN_SETUP.md](../../SENTRY_TOKEN_SETUP.md) đã yêu cầu sẵn scope này.

Các quyết định của người lập plan (dev có thể đổi):
- **Không có migration Prisma.**
  - Trong lúc op bulk từ luồng Sentry đang chạy, row Sentry giữ nguyên state hiện tại (`review`/`pending`/`rejected`).
  - Liên kết giữa op và row nằm trong `BulkOperation.payload.source = {type:"sentry", sentryImportId}`.
  - Khi item tạo xong, executor chuyển row sang `created`.
- **Chống tạo trùng Sentry:**
  - Form Sentry luôn ép thêm hai label `sentry` và `sentryLabel({id: sentryIssueId})`. Nhờ vậy nếu sau đó row bị duyệt hàng loạt, `findJiraIssueByLabel` của worker sẽ liên kết lại issue cũ thay vì tạo mới.
  - Route tạo từ Sentry trả 409 nếu row đó đang có một op bulk chưa xong.
- **Hai luồng tạo cùng tồn tại cho Sentry:**
  - form 1 lỗi: bulk + token admin;
  - duyệt nhiều lỗi: worker + token hệ thống.

  Cả hai đều lấy nội dung mặc định từ `buildSentryTaskDraft`.
- **Đồng bộ cache:** pipeline bulk hiện **không** ghi `issueCache`. Plan thêm bước upsert sau khi tạo thành công để task mới hiện ngay trên board.
- **Chuyển sub-task sang màn bulk:** dùng sessionStorage với key riêng `bulk-create-handoff:<id>` và query `?handoff=<id>`. Không ghi vào `bulk-create-draft:*` để không đè lên bản nháp của người dùng.
- **Nguồn creds Sentry để lấy event:**
  - ưu tiên env (`SENTRY_ORG`/`SENTRY_TOKEN`) khi `row.sentryProject === env.sentryProject`;
  - nếu không khớp, lấy user có `sentryTokenEnc` và có mapping chứa slug đó, giải mã giống `loadSentryUsers` trong `sentry-import.ts`.

## Global Constraints

- Đọc hướng dẫn route handler trong `node_modules/next/dist/docs/` trước khi viết route mới, vì đây là Next.js bản mới (AGENTS.md).
- Đọc `design-system/team-task-web/MASTER.md` trước khi làm UI. Màu dùng token ngữ nghĩa (`bg-muted`, `text-muted-foreground`, `border-border`), không hardcode hex.
- Loading dùng `Skeleton`. Empty state gồm icon trong vòng tròn muted, một tiêu đề ngắn và một dòng gợi ý.
- Icon chỉ dùng `lucide-react`; icon trang trí phải có `aria-hidden`. Phần tử bấm được có `cursor-pointer`. Transition 150–200ms và tôn trọng `prefers-reduced-motion`.
- Kiểm tra cả light và dark mode, độ tương phản chữ ≥ 4.5:1.
- Chữ trên UI bằng tiếng Việt. Identifier, comment và commit message bằng tiếng Anh.
- Không thêm dependency, không tạo migration Prisma.
- Giới hạn: summary 1 dòng ≤ 255 ký tự (`MAX_SUMMARY_LENGTH`), description ≤ `MAX_DESCRIPTION_LENGTH`.
- Mọi nút AI chỉ hiện khi `hasOpenAiConfig()` là true.
- AI chỉ **điền gợi ý vào form**, không bao giờ tự tạo issue.
- Mọi dữ liệu gửi tới LLM phải đi qua `src/lib/ai/sanitizer.ts` và bộ cắt gọn của Task 10.
- Lệnh kiểm tra sau mỗi task: `npm run lint && npm run typecheck && npm test`.

## Review Focus

1. **Worker pg-boss không chạy:** op nằm ở `queued` mãi. Form phải chuyển sang trạng thái "Đang chờ hàng đợi…" sau 20 giây và cho đóng form. Không được quay vô hạn. Test ở Task 3.
2. **Preview trả lỗi chặn hoặc cảnh báo trùng:** ví dụ thiếu field bắt buộc, hoặc summary trùng với một issue đang có. Form hiện lỗi hoặc cảnh báo ngay tại field và không tự confirm. Riêng cảnh báo trùng thì cho người dùng bấm "Vẫn tạo". Test ở Task 3.
3. **Admin bấm "Tạo task" Sentry hai lần, hoặc hai admin cùng bấm:** chỉ tạo đúng 1 issue, lần sau nhận 409. Test ở Task 6.
4. **User không có quyền tạo trong project** (`metadata.canCreate === false`): form hiện `permissionReason` và khoá nút Tạo. Test ở Task 4.
5. **LLM trả JSON hỏng, tên loại issue/priority/component không có trong project, hoặc timeout:** form giữ nguyên dữ liệu đang có, hiện lỗi "AI không phản hồi, thử lại". Field nào không map được ID thì để trống kèm cảnh báo. Test ở Task 8 và Task 9.

---

## Giai đoạn 1 — Form dùng chung, Board, Sentry 1 lỗi

### Task 1: Tách field component sang `src/components/task-fields/`

**Files:**
- Move (`git mv`): `src/app/(app)/bulk/create/fields/*` → `src/components/task-fields/fields/*`
- Move: `assignee-combobox.tsx`, `label-combobox.tsx`, `components-combobox.tsx`, `parent-combobox.tsx`, `dynamic-custom-fields.tsx`, `description-editor.tsx` → `src/components/task-fields/`
- Create: `src/components/task-fields/index.ts` (barrel)
- Modify: 8 file đang import các component trên (`grep -rln "bulk/create/fields\|assignee-combobox\|label-combobox\|parent-combobox\|dynamic-custom-fields\|description-editor\|components-combobox" src`)

**Interfaces:**
- Produces: `@/components/task-fields` export `IssueTypeField, PriorityField, FixVersionField, ComponentsField, PointsField, EstimateField, DueDateField, AssigneeCombobox, LabelCombobox, ComponentsCombobox, ParentCombobox, DynamicCustomFields, DescriptionEditor`. Props giữ nguyên.

- [ ] **Step 1:** Chuyển file bằng `git mv`, sửa import tương đối bên trong các file vừa chuyển, rồi sửa import ở nơi dùng sang `@/components/task-fields`.
- [ ] **Step 2:** Chạy `npm run lint && npm run typecheck && npm test`. Kỳ vọng PASS, không đổi hành vi.
- [ ] **Step 3:** Commit `refactor: move task field components to shared task-fields module`.

### Task 2: Mở rộng pipeline bulk cho nguồn `single`/`sentry` và upsert cache

**Files:**
- Modify: `src/lib/bulk/create-types.ts:63` (union `source`)
- Modify: `src/lib/bulk/validation.ts` (validate `source`)
- Modify: `src/lib/bulk/create-execution.ts` (`executeBulkCreateOperation`: upsert cache + hook Sentry)
- Create: `src/lib/sentry/bulk-completion.ts`
- Test: `src/lib/bulk/validation.test.ts` (thêm case), `src/lib/sentry/bulk-completion.test.ts`

**Interfaces:**
- Produces:
  ```ts
  // create-types.ts
  source?:
    | { type: "grid" | "paste" | "csv" | "excel"; fileName?: string | null }
    | { type: "single"; origin: "board" }
    | { type: "sentry"; sentryImportId: string };
  // bulk-completion.ts
  export async function markSentryRowFromBulkOp(operationId: string): Promise<void>;
  ```
- `source` phải được lưu trong `BulkOperation.payload`. Kiểm tra `previewBulkCreate` (`create-ops.ts:191`) đã ghi `req.source` vào payload chưa; nếu chưa thì thêm.

- [ ] **Step 1: Viết test fail.** Trong `validation.test.ts`:
  - `{type:"sentry", sentryImportId:"abc"}` hợp lệ;
  - `{type:"sentry"}` (thiếu id) → lỗi;
  - `{type:"single", origin:"board"}` hợp lệ.

  Trong `bulk-completion.test.ts`, mock prisma:
  - op có `payload.source = {type:"sentry", sentryImportId:"r1"}` và createItem `status:"created", jiraKey:"ABC-1"` → `sentryIssueImported.update` được gọi với `{where:{id:"r1"}, data:{state:"created", jiraKey:"ABC-1", importedAt: any Date, lastError:null}}`;
  - op có item `failed` với `error:"boom"` → update `{lastError:"boom"}`, state không đổi;
  - op nguồn `grid` → không gọi update.
- [ ] **Step 2:** `npx vitest run src/lib/bulk/validation.test.ts src/lib/sentry/bulk-completion.test.ts`. Kỳ vọng FAIL.
- [ ] **Step 3:** Implement union, validation và `markSentryRowFromBulkOp`. Update row bằng `updateMany` có điều kiện `state: {in: ["review","pending","rejected"]}` để không ghi đè row đã được worker tạo.
- [ ] **Step 4:** Ở cuối `executeBulkCreateOperation`, sau khi op chuyển sang trạng thái kết thúc:
  - với mỗi item có `jiraKey` mới: gọi `jira.getIssue(key)` rồi `upsertJiraIssue` (cách làm như `sentry-import.ts:fileRow`), bọc best-effort `try/catch`;
  - sau đó gọi `markSentryRowFromBulkOp(operationId)`.
- [ ] **Step 5:** Chạy lại test cùng `npm run typecheck`. Kỳ vọng PASS.
- [ ] **Step 6:** Commit `feat(bulk): accept single/sentry sources and sync created issues to cache`.

### Task 3: Hook `useSingleTaskCreate`

**Files:**
- Create: `src/components/task-create/single-create-model.ts` (reducer thuần)
- Create: `src/components/task-create/use-single-task-create.ts`
- Test: `src/components/task-create/single-create-model.test.ts`

**Interfaces:**
- Consumes: `POST /api/bulk/create` (preview, rồi `{confirm:true, operationId}`), `GET /api/bulk/operations/[id]`, `bulkKeys.operation(id)`.
- Produces:
  ```ts
  export type SingleCreatePhase =
    | { kind: "idle" }
    | { kind: "previewing" }
    | { kind: "blocked"; errors: BulkCreateValidationError[] }
    | { kind: "duplicate"; warnings: BulkCreateValidationWarning[]; operationId: string }
    | { kind: "creating"; operationId: string; startedAt: number }
    | { kind: "queued-slow"; operationId: string }
    | { kind: "done"; jiraKey: string }
    | { kind: "failed"; message: string };
  export function singleCreateReducer(s: SingleCreatePhase, e: SingleCreateEvent): SingleCreatePhase;
  export function useSingleTaskCreate(opts: {
    projectKey: string;
    source: BulkCreateRequest["source"];
    onCreated?: (jiraKey: string) => void;
  }): { phase: SingleCreatePhase; submit(row: BulkCreateRowInput): void; forceConfirm(): void; reset(): void };
  ```
- `SLOW_QUEUE_MS = 20_000`. Poll mỗi 2000ms (giống `create-progress.tsx`).
- Với nguồn `sentry`, hook gọi route ở Task 6 thay cho `/api/bulk/create`, qua tham số `endpoint?: string`.

- [ ] **Step 1: Viết test fail cho reducer:**
  - preview có `blocked > 0` → `blocked` kèm errors;
  - preview có warning trùng → `duplicate`;
  - preview sạch → `creating`;
  - poll trả `createItems[0].jiraKey="ABC-1"` → `done`;
  - poll trả item `failed` → `failed` với message bằng `item.error`;
  - tick lúc `now - startedAt >= 20000` mà vẫn `queued` → `queued-slow`;
  - đang ở `queued-slow` mà poll ra key → `done`.
- [ ] **Step 2:** `npx vitest run src/components/task-create/single-create-model.test.ts`. Kỳ vọng FAIL.
- [ ] **Step 3:** Implement reducer, rồi đến hook (`useMutation` cho preview/confirm, `useQuery` có `refetchInterval` cho poll). Khi `done` thì invalidate các query board.
- [ ] **Step 4:** Chạy lại test. Kỳ vọng PASS.
- [ ] **Step 5:** Commit `feat(task-create): single task create hook over bulk pipeline`.

### Task 4: `TaskCreateForm` + `TaskCreateDialog`

**Files:**
- Create: `src/components/task-create/task-create-form.tsx`
- Create: `src/components/task-create/task-create-dialog.tsx`
- Create: `src/components/task-create/task-create-form-model.ts` (hàm thuần: `emptyRow`, `applyPrefill`, `lockedLabels`, `canSubmit`)
- Test: `src/components/task-create/task-create-form-model.test.ts`

**Interfaces:**
- Consumes: Task 1 (fields), Task 3 (hook), metadata query `bulkKeys.createMetadata(projectKey)` → `/api/bulk/create/metadata?project=`.
- Produces:
  ```ts
  export type TaskCreatePrefill = Partial<Omit<BulkCreateRowInput, "clientRef">>;
  export function TaskCreateDialog(props: {
    open: boolean;
    onOpenChange(open: boolean): void;
    projectKey: string;
    title?: string;                    // mặc định "Tạo task"
    prefill?: TaskCreatePrefill;
    lockedLabels?: string[];           // luôn gộp vào labels, không xoá được (Sentry)
    source: BulkCreateRequest["source"];
    endpoint?: string;
    extraActions?: React.ReactNode;    // chỗ cắm nút AI (Task 9, 11, 12)
    onCreated?(jiraKey: string): void;
  }): JSX.Element;
  export function TaskCreateForm(props: {
    value: BulkCreateRowInput;
    onChange(row: BulkCreateRowInput): void;
    metadata: BulkCreateProjectMetadata;
    projectKey: string;
    lockedLabels?: string[];
    fieldErrors?: Record<string, string>;
  }): JSX.Element;
  ```
- Thứ tự field lấy theo `task-detail-sheet.tsx`: Tiêu đề*, Loại issue, Parent, Assignee, Priority, Labels, Fix version, Components, Points (nhập tay), Estimate, Due date, Custom fields, Mô tả.
  - `ParentCombobox` dùng không có `batchItems` (chỉ parent `{type:"jira"}`).
  - Mặc định `issueTypeId = metadata.defaultIssueTypeId`, `clientRef = "single-1"`.
- `task-detail-sheet.tsx` của bulk chuyển sang render `TaskCreateForm` để hai nơi không lệch nhau.
- UI của từng phase:
  - `creating`: nút loading kèm "Đang tạo…";
  - `queued-slow`: dòng "Đang chờ hàng đợi, task sẽ được tạo khi worker chạy" và cho đóng dialog;
  - `done`: toast có link `/issue/<key>`, rồi đóng dialog.
- Đang tải metadata thì hiện `Skeleton`. Khi `!metadata.canCreate`, hiện `permissionReason` và disable nút Tạo.

- [ ] **Step 1: Viết test fail:**
  - `canSubmit(row, meta)`:
    - false khi summary rỗng hoặc có `\n`;
    - false khi `!meta.canCreate`;
    - false khi thiếu custom field `required` của loại issue đang chọn;
    - true khi hợp lệ.
  - `applyPrefill(emptyRow(meta), {summary:"x", labels:["a"]}, ["sentry","sentry-123"])` cho `labels` bằng `["a","sentry","sentry-123"]`, không trùng.
  - `lockedLabels` vẫn còn sau khi `onChange` xoá chúng.
- [ ] **Step 2:** `npx vitest run src/components/task-create/task-create-form-model.test.ts`. Kỳ vọng FAIL.
- [ ] **Step 3:** Implement model, form và dialog (dùng `Sheet` giống `task-detail-sheet.tsx`). Sửa `task-detail-sheet.tsx` để dùng `TaskCreateForm`.
- [ ] **Step 4:** Chạy test và `npm run typecheck`. Kỳ vọng PASS. Tự kiểm tra màn bulk: mở chi tiết một dòng, các field vẫn sửa được.
- [ ] **Step 5:** Commit `feat(task-create): shared task create form and dialog`.

### Task 5: Nút "Tạo task" trên board

**Files:**
- Modify: `src/app/(app)/board/board-header.tsx`, `src/app/(app)/board/board-client.tsx`

**Interfaces:**
- Consumes: `TaskCreateDialog` (Task 4) với `projectKey = picker.selectedProject` và `source = {type:"single", origin:"board"}`.

- [ ] **Step 1:** Thêm `Button` có icon `Plus` (`aria-hidden`) và chữ "Tạo task" vào header, cạnh nút sync. Dialog được render ở `board-client.tsx`. `onCreated` thì invalidate query danh sách board. Nút ẩn khi chưa có `selectedProject`.
- [ ] **Step 2:** Chạy `npm run lint && npm run typecheck`. Kỳ vọng PASS.
- [ ] **Step 3:** Chạy app (`npm run dev` + `npm run worker`) và tạo một task ở project test. Task phải hiện trên board sau khi tạo xong mà không cần sync tay. Kiểm tra cả light và dark.
- [ ] **Step 4:** Commit `feat(board): create task button using shared form`.

### Task 6: Route tạo task từ Sentry (1 lỗi)

**Files:**
- Create: `src/app/api/admin/sentry-import/[id]/create/route.ts`
- Create: `src/lib/sentry/create-from-form.ts` (logic thuần, để test)
- Test: `src/lib/sentry/create-from-form.test.ts`

**Interfaces:**
- Consumes: `previewBulkCreate`, `confirmBulkCreate` (`create-ops.ts`), `enqueueBulkOperation`, `sentryLabel` (`src/lib/sentry/idempotency.ts:33`), `audit`.
- Produces: `POST /api/admin/sentry-import/[id]/create`, chỉ cho admin.
  - Body: `{ row: BulkCreateRowInput, confirm?: boolean, operationId?: string }`. Có cùng hai pha preview/confirm như `/api/bulk/create` để hook Task 3 dùng lại.
  - Response giữ đúng shape của `/api/bulk/create`.
  ```ts
  export function buildSentryBulkRequest(
    row: BulkCreateRowInput,
    sentry: { id: string; sentryIssueId: string; targetProject: string | null }
  ): BulkCreateRequest | { error: string };
  export async function hasInflightSentryOp(sentryImportId: string): Promise<boolean>;
  ```
- Quy tắc:
  - Row phải ở state `review`, `pending` hoặc `rejected`; nếu không, trả 409.
  - `targetProject` null → trả 400 "Chưa map project Jira cho Sentry project này".
  - `projectKey` luôn bằng `targetProject`.
  - `labels` luôn gồm `sentry` và `sentryLabel({id: sentryIssueId})`.
  - `source = {type:"sentry", sentryImportId: id}`.
  - Có op với `payload.source.sentryImportId == id` và state chưa kết thúc → trả 409 "Task cho lỗi này đang được tạo". Dùng Prisma JSON path filter.
  - Ghi `reviewedBy` và `reviewedAt` lên row khi confirm.
  - Audit action `admin.sentry.create_form`.
  - Dùng token Jira của admin (`userJiraAuth`), giống `/api/bulk/create/route.ts`.

- [ ] **Step 1: Viết test fail cho `buildSentryBulkRequest`:**
  - labels `["x"]` → `["x","sentry","sentry-<id>"]`;
  - `targetProject` null → `{error}`;
  - `projectKey` bằng `targetProject` dù `row` có giá trị khác.

  Test `hasInflightSentryOp` với prisma mock: op state `queued` → true, `completed` → false.
- [ ] **Step 2:** `npx vitest run src/lib/sentry/create-from-form.test.ts`. Kỳ vọng FAIL.
- [ ] **Step 3:** Implement lib và route.
- [ ] **Step 4:** Chạy test cùng `npm run typecheck`. Kỳ vọng PASS.
- [ ] **Step 5:** Commit `feat(sentry): file single reviewed issue through bulk pipeline with admin token`.

### Task 7: Dialog duyệt 1 lỗi Sentry dùng form chung

**Files:**
- Modify: `src/app/(app)/admin/sentry/admin-sentry-client.tsx`, `src/app/(app)/admin/sentry/sentry-approve-dialog.tsx`

**Interfaces:**
- Consumes: `TaskCreateDialog` (Task 4) với:
  - `projectKey = row.targetProject`;
  - `prefill = {summary: row.draftSummary ?? draft.summary, description: row.draftDescription ?? draft.description, issueTypeId: id của loại "Bug" trong metadata nếu có}`;
  - `lockedLabels = ["sentry", sentryLabel({id: row.sentryIssueId})]`;
  - `source = {type:"sentry", sentryImportId: row.id}`;
  - `endpoint = /api/admin/sentry-import/${row.id}/create`.

- [ ] **Step 1:** Khi `rows.length === 1`, mở `TaskCreateDialog`. Khi nhiều lỗi, giữ `SentryApproveDialog` cũ ở chế độ danh sách. Đã có form thì bỏ phần sửa summary/description khỏi `sentry-approve-dialog.tsx`. `onCreated` thì invalidate query hàng đợi Sentry.
- [ ] **Step 2:** Chạy `npm run lint && npm run typecheck && npm test`. Kỳ vọng PASS.
- [ ] **Step 3:** Thử trên app:
  - duyệt 1 lỗi → issue có label `sentry`, row chuyển `created` và có `jiraKey`;
  - bấm hai lần → lần hai nhận 409;
  - sau đó duyệt hàng loạt row đó → không tạo trùng.
- [ ] **Step 4:** Commit `feat(sentry): approve single issue with full task form`.

---

## Giai đoạn 2 — AI điền form và AI tóm tắt Sentry

### Task 8: Helper `generateJson` và cờ bật AI cho client

**Files:**
- Create: `src/lib/ai/generate-json.ts`
- Modify: `src/lib/ai/provider.ts` (thêm `generate(prompt: string, timeoutMs?: number): Promise<string>` vào interface `LLMProvider`)
- Modify: `src/app/api/me/route.ts` (thêm `aiEnabled: hasOpenAiConfig()` vào response)
- Test: `src/lib/ai/generate-json.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export async function generateJson<T>(
    prompt: string,
    parse: (obj: unknown) => T,          // ném lỗi nếu sai shape
    opts?: { attempts?: number; timeoutMs?: number; provider?: Pick<LLMProvider, "generate"> }
  ): Promise<T>;                          // ném AiUnavailableError khi hết lượt thử
  ```
  Dùng `withJsonRetry` và `extractJsonObject`. Mặc định `attempts = 2`, `timeoutMs = 30_000`.

- [ ] **Step 1: Viết test fail.** Dùng provider giả:
  - trả `"```json\n{\"a\":1}\n```"` → `{a:1}`;
  - lần 1 trả rác, lần 2 trả JSON hợp lệ → thành công;
  - cả hai lần là rác → `AiUnavailableError`;
  - `parse` ném lỗi → thử lại.
- [ ] **Step 2:** `npx vitest run src/lib/ai/generate-json.test.ts`. Kỳ vọng FAIL.
- [ ] **Step 3:** Implement. Thêm `aiEnabled` vào `/api/me`.
- [ ] **Step 4:** Chạy lại test. Kỳ vọng PASS.
- [ ] **Step 5:** Commit `feat(ai): generic JSON generation helper and aiEnabled flag`.

### Task 9: AI điền form từ ý tưởng thô

**Files:**
- Create: `src/lib/ai/task-draft-prompt.ts`
- Create: `src/app/api/ai/task-draft/route.ts`
- Create: `src/components/task-create/ai-idea-panel.tsx`
- Test: `src/lib/ai/task-draft-prompt.test.ts`

**Interfaces:**
- Consumes: `generateJson` (Task 8), `fetchBulkCreateMetadata`, `normalizeAiDraftBatch` (`src/lib/bulk/ai-draft-normalizer.ts:472`), `RawAiDraftTaskItem`.
- Produces:
  ```ts
  export const TASK_DRAFT_PROMPT_VERSION = "task-draft-v1";
  export function buildTaskDraftPrompt(input: {
    idea: string; projectKey: string;
    issueTypes: string[]; priorities: string[]; components: string[]; labels: string[];
    current?: { summary?: string; description?: string };
  }): string;
  export function parseTaskDraft(obj: unknown): RawAiDraftTaskItem; // bắt buộc có summary
  // POST /api/ai/task-draft  body {projectKey, idea, current?}
  // → { prefill: TaskCreatePrefill, warnings: BulkCreateValidationWarning[] }
  ```
- Prompt yêu cầu:
  - trả về một object JSON có `summary` (tiếng Việt, ≤ 120 ký tự, động từ ở đầu), `description` (các mục "Bối cảnh", "Yêu cầu", "Tiêu chí chấp nhận"), `issueTypeName`, `priorityName`, `componentNames`, `labels`;
  - chỉ chọn trong danh sách được đưa vào.
- `idea` tối đa 4000 ký tự, nếu dài hơn trả 400.
- UI:
  - nút "Viết bằng AI" (icon `Sparkles`) trong `extraActions` mở một ô `Textarea` cho ý tưởng;
  - kết quả gộp vào form, chỉ ghi đè những field đang rỗng, trừ summary và description (luôn ghi đè sau khi hỏi xác nhận nếu đang có nội dung);
  - warnings hiện thành một dòng chú thích bên dưới.

- [ ] **Step 1: Viết test fail:**
  - `buildTaskDraftPrompt` chứa đủ các tên trong `issueTypes`, `priorities`, `components`;
  - `parseTaskDraft({})` ném lỗi;
  - `parseTaskDraft({summary:"Sửa A", issueTypeName:"Task"})` trả item đúng.

  Thêm test tích hợp lib: gọi `normalizeAiDraftBatch` với metadata không có component "Foo" → `componentIds` rỗng và có warning.
- [ ] **Step 2:** `npx vitest run src/lib/ai/task-draft-prompt.test.ts`. Kỳ vọng FAIL.
- [ ] **Step 3:** Implement prompt, route (cần session và Jira auth giống `/api/bulk/create`, không có `aiEnabled` thì trả 503) và panel. Gắn panel vào `TaskCreateDialog` ở board.
- [ ] **Step 4:** Chạy test và typecheck. Kỳ vọng PASS. Thử trên app: gõ "thêm nút xuất excel ở màn báo cáo", form được điền, task chưa được tạo.
- [ ] **Step 5:** Commit `feat(ai): draft task fields from a rough idea`.

### Task 10: Lấy event mới nhất từ Sentry và cắt gọn trước khi gửi AI

**Files:**
- Modify: `src/lib/sentry/client.ts` (thêm `requestSentryOrg`, `getLatestEvent`)
- Create: `src/lib/sentry/event-digest.ts`
- Create: `src/lib/sentry/creds-for-project.ts`
- Test: `src/lib/sentry/event-digest.test.ts`, `src/lib/sentry/creds-for-project.test.ts`

**Interfaces:**
- Produces:
  ```ts
  // client.ts — GET {base}/api/0/organizations/{org}/issues/{issueId}/events/latest/
  export async function getLatestEvent(issueId: string, creds: SentryCreds, options?: SentryRequestOptions): Promise<SentryEvent>;
  export type SentryEvent = { eventID: string; culprit?: string; message?: string; platform?: string;
    tags?: { key: string; value: string }[]; entries?: { type: string; data: unknown }[] };
  // event-digest.ts
  export type SentryEventDigest = { exceptionType?: string; exceptionValue?: string; culprit?: string;
    frames: { file: string; fn: string; line?: number }[]; tags: Record<string, string>; requestUrl?: string };
  export function digestSentryEvent(e: SentryEvent): SentryEventDigest;
  // creds-for-project.ts
  export async function sentryCredsForProject(sentryProject: string): Promise<SentryCreds | null>;
  ```
- Quy tắc của `digestSentryEvent`:
  - lấy exception cuối cùng trong entry `exception`;
  - chỉ giữ frame `inApp === true`, đảo ngược để frame gần lỗi nhất đứng đầu, tối đa 10 frame;
  - chỉ giữ các tag `environment`, `release`, `browser`, `os`, `url`, `transaction`;
  - bỏ query string khỏi `requestUrl`;
  - mọi chuỗi đi qua `sanitizeAiErrorMessage` hoặc sanitizer của module ai;
  - xoá email bằng regex.
- Bước đầu tiên: dùng `curl` với token thật để xác nhận đường dẫn `.../issues/{id}/events/latest/`. Nếu 404 thì thử `/api/0/issues/{id}/events/latest/` và ghi đường dẫn đúng vào code.

- [ ] **Step 1:** Xác nhận endpoint bằng `curl -H "Authorization: Bearer $SENTRY_TOKEN" "$SENTRY_BASE_URL/api/0/organizations/$SENTRY_ORG/issues/<id>/events/latest/"`. Kỳ vọng 200 và có `entries`. Lưu một response đã ẩn dữ liệu nhạy cảm làm fixture `src/lib/sentry/__fixtures__/latest-event.json`.
- [ ] **Step 2: Viết test fail dựa trên fixture:**
  - frames ≤ 10 và đều là in-app;
  - `requestUrl` không có `?`;
  - chuỗi `user@example.com` trong message bị thay bằng `[email]`;
  - tag `user.ip` bị loại.

  Test `sentryCredsForProject`:
  - slug bằng `env.sentryProject` → creds từ env;
  - slug khác → creds của user có mapping khớp;
  - không ai khớp → null.
- [ ] **Step 3:** `npx vitest run src/lib/sentry/event-digest.test.ts src/lib/sentry/creds-for-project.test.ts`. Kỳ vọng FAIL.
- [ ] **Step 4:** Implement.
- [ ] **Step 5:** Chạy lại test. Kỳ vọng PASS.
- [ ] **Step 6:** Commit `feat(sentry): fetch and digest latest event for AI summary`.

### Task 11: AI tóm tắt lỗi Sentry trong form

**Files:**
- Create: `src/lib/ai/sentry-summary-prompt.ts`
- Create: `src/app/api/admin/sentry-import/[id]/ai-summary/route.ts`
- Create: `src/app/(app)/admin/sentry/sentry-ai-summary-button.tsx`
- Test: `src/lib/ai/sentry-summary-prompt.test.ts`

**Interfaces:**
- Consumes: Task 8, Task 10, `buildSentryTaskDraft`.
- Produces:
  ```ts
  export function buildSentrySummaryPrompt(row: SentryTaskSource, digest: SentryEventDigest | null): string;
  export function parseSentrySummary(obj: unknown): { summary: string; description: string; priorityName?: string };
  // POST /api/admin/sentry-import/[id]/ai-summary → { summary, description, priorityName?, usedEvent: boolean }
  ```
- `summary` có dạng `[Sentry] <shortId>: <mô tả ngắn tiếng Việt>`.
- `description` gồm các mục "Hiện tượng", "Vị trí trong code", "Ảnh hưởng (level, số lần, lần cuối)", "Hướng điều tra", rồi cuối cùng là phần thông tin gốc của `buildSentryTaskDraft`, giữ nguyên link Sentry.
- Không lấy được creds hoặc event → vẫn gọi AI chỉ với snapshot và trả `usedEvent:false`. UI hiện "Không lấy được stacktrace, tóm tắt từ thông tin cơ bản".

- [ ] **Step 1: Viết test fail:**
  - prompt có chứa `culprit` và frame đầu khi có digest;
  - với digest null, prompt không chứa chữ "undefined";
  - `parseSentrySummary` ép `summary` bắt đầu bằng `[Sentry] <shortId>:`;
  - `description` luôn chứa `permalinkUrl`.
- [ ] **Step 2:** `npx vitest run src/lib/ai/sentry-summary-prompt.test.ts`. Kỳ vọng FAIL.
- [ ] **Step 3:** Implement prompt, route (chỉ admin, 503 khi không có `aiEnabled`) và nút "AI tóm tắt lỗi" đặt vào `extraActions` của dialog Sentry ở Task 7.
- [ ] **Step 4:** Chạy test và typecheck. Kỳ vọng PASS. Thử trên app với một lỗi Sentry thật.
- [ ] **Step 5:** Commit `feat(sentry): AI summary of error into task form`.

---

## Giai đoạn 3 — AI tách sub-task

### Task 12: AI tách sub-task và chuyển sang màn tạo hàng loạt

**Files:**
- Create: `src/lib/ai/subtask-split-prompt.ts`
- Create: `src/app/api/ai/subtask-split/route.ts`
- Create: `src/lib/bulk/handoff.ts`
- Create: `src/components/task-create/ai-split-button.tsx`
- Modify: `src/app/(app)/bulk/create/lib/use-bulk-create-controller.ts` (đọc `?handoff=`)
- Test: `src/lib/ai/subtask-split-prompt.test.ts`, `src/lib/bulk/handoff.test.ts`

**Interfaces:**
- Consumes: Task 8, `normalizeAiDraftBatch`, `fetchBulkCreateMetadata`.
- Produces:
  ```ts
  export function buildSubtaskSplitPrompt(input: { summary: string; description: string;
    issueTypes: string[]; components: string[] }): string;
  export function parseSubtaskSplit(obj: unknown): RawAiDraftTaskItem[]; // 1..15 item
  // POST /api/ai/subtask-split body {projectKey, parentKey, summary, description}
  // → { items: BulkCreateRowInput[] }  (parent = {type:"jira", jiraKey: parentKey}, issueTypeId = defaultSubtaskTypeId nếu có)
  // handoff.ts
  export function writeHandoff(projectKey: string, items: BulkCreateRowInput[]): string; // trả id
  export function readHandoff(id: string): { projectKey: string; items: BulkCreateRowInput[] } | null; // đọc xong thì xoá
  ```
- Key là `bulk-create-handoff:<id>` trong sessionStorage. `id` là random 8 ký tự. Mọi truy cập storage bọc trong try/catch.
- Vị trí nút "Tách sub-task bằng AI":
  - trong toast "Đã tạo ABC-1" sau khi tạo xong ở Task 4;
  - ở quick panel của issue trên board (`quick-panel-actions.tsx`).

  Bấm vào sẽ gọi API, `writeHandoff`, rồi `router.push("/bulk/create?project=<p>&handoff=<id>")`.
- Màn bulk:
  - có `handoff` hợp lệ thì `setItems(items)` và bỏ qua banner khôi phục draft;
  - không đụng tới `bulk-create-draft:*`;
  - handoff hết hạn hoặc không có thì hiện toast "Không tìm thấy danh sách sub-task, hãy thử lại".

- [ ] **Step 1: Viết test fail:**
  - `parseSubtaskSplit` cắt danh sách còn tối đa 15 item;
  - mảng rỗng → lỗi;
  - `writeHandoff` rồi `readHandoff` trả lại dữ liệu, lần đọc thứ hai trả null;
  - storage ném lỗi → `readHandoff` trả null, không crash.
- [ ] **Step 2:** `npx vitest run src/lib/ai/subtask-split-prompt.test.ts src/lib/bulk/handoff.test.ts`. Kỳ vọng FAIL.
- [ ] **Step 3:** Implement prompt, route, handoff, nút và phần đọc handoff trong controller.
- [ ] **Step 4:** Chạy `npm run lint && npm run typecheck && npm test`. Kỳ vọng PASS. Thử trên app: tách sub-task từ một task vừa tạo, màn bulk mở ra với các dòng có parent đúng, còn draft cũ vẫn khôi phục được.
- [ ] **Step 5:** Commit `feat(ai): split task into sub-tasks and hand off to bulk create`.

---

## Đã xác nhận với dev

- Token Sentry trên môi trường thật đã có `event:read`.
- `OPENAI_BASE_URL` trỏ tới AI nội bộ của công ty, nên được phép gửi stacktrace đã cắt gọn. Vẫn giữ bước sanitize ở Task 10 để chống lộ secret.
