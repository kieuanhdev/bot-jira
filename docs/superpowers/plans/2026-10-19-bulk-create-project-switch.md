# Tạo task hàng loạt (`/bulk/create`): đổi dự án mượt và sửa các lỗi UX quanh nó (Implementation Plan)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Khi người dùng đổi dự án ở màn Tạo task hàng loạt, editor phải giữ nguyên trên màn hình, kể cả ở chế độ toàn màn hình. Hiện tại editor biến mất, hiện skeleton rồi mới quay lại. Plan này cũng sửa các lỗi liên quan tới đổi dự án mà review code phát hiện: mất bản nháp, màn trắng khi đổi dự án ở bước 2 hoặc 3, control bị lặp, copy dialog nói sai.

**Spec:** Người dùng phản ánh ngày 2026-10-19: "khi nhấn đổi dự án nó lại thoát ra rồi vô lại, trông không ổn". Các vấn đề còn lại được tìm thấy khi review `src/app/(app)/bulk/create/` cùng ngày.

**Architecture:**
- Giữ `BulkCreateEditorShell` mounted trong suốt quá trình đổi dự án. Query metadata dùng `placeholderData: keepPreviousData`. Đây là pattern repo đã dùng ở `src/hooks/use-branches.ts:54`, `leaderboard-client.tsx:66` và vài chỗ khác. Trong lúc đang tải dự án mới, shell nhận cờ `isSwitchingProject`: lưới bị khoá, có lớp phủ loading phía trên, các action phụ thuộc metadata bị tắt.
- Các thông báo (bản nháp, handoff AI, lỗi preview, lỗi metadata, thiếu quyền) chuyển vào một vùng "notice" bên trong shell. Nhờ vậy thông báo vẫn thấy được khi đang toàn màn hình.
- Logic bản nháp (khi nào được autosave, khi nào phải hỏi người dùng có khôi phục không) tách thành hàm thuần trong `lib/bulk-create-controller-model.ts` và có unit test bằng vitest. Repo không có `@testing-library/react`, nên phần hook và UI được kiểm bằng `typecheck`, `lint` và checklist thủ công.

**Tech Stack:** Next.js App Router (`reactCompiler: true`), React 19, TanStack Query v5, Tailwind v4 + shadcn/ui (Radix), lucide-react, vitest.

---

## Chẩn đoán

### A. Tại sao "thoát ra rồi vô lại" (lỗi chính)

Xem `bulk-create-client.tsx`:

```tsx
{!isProjectsLoading && Boolean(projectKey) && metadataLoading && <Skeleton … />}
{metadata && metadata.canCreate && <BulkCreateEditorShell … />}
```

1. Người dùng chọn dự án mới, `projectKey` đổi theo, query key `bulkKeys.createMetadata(projectKey)` cũng đổi.
2. Cache chưa có dự án mới nên `metadata === undefined` và `metadataLoading === true`.
3. `BulkCreateEditorShell` bị **unmount** hoàn toàn và skeleton hiện ra.
4. Metadata về thì shell **mount lại từ đầu**.

Hậu quả:
- Ở chế độ toàn màn hình, shell là `fixed inset-0 z-50`. Khi shell unmount, overlay biến mất và người dùng thấy lại trang thường. Khi shell mount lại, overlay bật lên lần nữa. Đây chính là cảm giác "thoát ra rồi vô lại".
- State cục bộ của shell bị reset: dòng đang chọn, con trỏ "lỗi tiếp theo", dialog đang mở, row đang expand. Body scroll lock bị tắt rồi bật lại, nên trang có thể giật vì thanh cuộn.
- Lỗi chỉ xảy ra lần đầu mở một dự án. Quay lại dự án đã mở trong vòng 5 phút thì không bị, vì `staleTime` là 5 phút. Vì vậy lỗi lúc có lúc không.

### B. Đổi dự án làm mất bản nháp của dự án đích (trace từ code, cần xác nhận tay)

Thứ tự effect trong `use-bulk-create-controller.ts`:
1. Effect "Restore draft" (deps `[projectKey, draftKey]`) đặt `draftRestoredRef.current = true`. Nếu có bản nháp thì nó gọi `setDraftAvailable(true)` qua `queueMicrotask`.
2. Effect "Auto-save" (deps `[items, defaults, step, saveDraft]`) **cũng chạy trong cùng commit**, vì `saveDraft` là `useCallback([draftKey])` và đổi theo `draftKey`. Lúc đó ref đã là `true` nên nó gọi `saveDraft(items, defaults)`.

Kết quả sau 1 giây:
- Nếu đổi dự án khi lưới trống: `hasDraftContent` là false, nên `localStorage.removeItem("bulk-create-draft:<dự án mới>")` chạy và **bản nháp của dự án đích bị xoá**. Banner "Tìm thấy bản nháp" vẫn hiện, nhưng bấm "Khôi phục" thì không ra gì.
- Nếu đổi dự án khi có dữ liệu (qua dialog): các dòng mang sang **ghi đè** bản nháp của dự án đích.
- Lần tải trang đầu tiên khi cache đã có `projects` cũng đi đúng thứ tự này: effect restore chạy trước, effect autosave chạy sau. Có thể chính tính năng khôi phục bản nháp đang hỏng sẵn. Task 3 bước 1 sẽ xác nhận việc này trước khi sửa.

### C. Màn trắng khi đổi dự án ở bước 2 hoặc 3

Select dự án ở header hiện ở **mọi bước**. `applyProjectChange` đặt `previewData = null` và `activeOperationId = null` nhưng **không đổi `step`**:
- Ở bước `preview`, điều kiện `step === "preview" && previewData` thành false.
- Ở bước `progress`, điều kiện `step === "progress" && activeOperationId` thành false.

Kết quả là dưới stepper không có gì. Ở bước `progress`, job vẫn đang chạy nền nhưng người dùng mất đường quay lại card tiến độ.

### D. Control bị lặp và copy sai

- **2 Select dự án:** một ở header của trang, một ở `BulkCreateCommandBar`. Cả hai cùng hiện ở chế độ thường.
- **3 nút toàn màn hình ở chế độ thường:** header (`bulk-create-client.tsx`), command bar (`bulk-create-command-bar.tsx:229`), status bar (`bulk-create-status-bar.tsx:170`).
- **Dialog đổi dự án** ghi "Tiêu đề và mô tả công việc sẽ được giữ nguyên". Thực tế `sanitizeItemsForProjectChange` giữ thêm người thực hiện, ước lượng, hạn, điểm và nhãn. Chỉ loại task, độ ưu tiên và phiên bản bị xoá. Copy cũng không nói rằng bản nháp của dự án đích (nếu có) sẽ được hỏi khôi phục.
- Dự án đã chọn **không được ghi lên URL**. Reload trang thì quay về `?project=` cũ hoặc dự án đầu tiên.

---

## Quyết định

| # | Vấn đề | Xử lý |
|---|---|---|
| A | Shell bị unmount khi đổi dự án | Task 1 (giữ shell và lớp phủ loading), Task 2 (đưa notice và trạng thái lỗi vào trong shell) |
| B | Đổi dự án xoá hoặc ghi đè bản nháp | Task 3 |
| C | Màn trắng khi đổi dự án ở bước preview/progress | Task 4. **Khoá** Select dự án ngoài bước `input` thay vì reset step, vì ở `progress` job vẫn đang chạy, còn ở `preview` người dùng có thể bấm "Quay lại" về bước 1 rồi đổi. |
| D1 | 2 Select dự án | Task 5. Chế độ thường chỉ giữ Select ở header. Chế độ toàn màn hình chỉ giữ Select ở command bar. |
| D2 | 3 nút toàn màn hình | Task 5. Chế độ thường giữ nút ở command bar, bỏ nút ở header và status bar. Chế độ toàn màn hình giữ nút "Thoát" ở topbar. |
| D3 | Copy dialog sai | Task 5 |
| D4 | URL không đồng bộ dự án | Task 6 (không bắt buộc) |
| — | Prefetch metadata khi mở dropdown dự án | Task 6 (không bắt buộc). Giúp lần đổi đầu tiên gần như tức thì. |
| — | Dùng `key={projectKey}` để reset shell | **Bỏ.** Làm vậy chính là unmount có chủ đích, tức là đúng lỗi đang cần sửa. |

## Global Constraints

- Không thêm dependency, không sửa `package.json` hay lockfile.
- Không đổi API route hay hành vi server. Mọi thay đổi nằm trong `src/app/(app)/bulk/create/`.
- Không đụng tới `/bulk` (cập nhật hàng loạt). Màn đó có plan riêng `2026-10-19-bulk-update-ui-improvements.md`.
- Đọc `design-system/team-task-web/MASTER.md` và `design-system/team-task-web/pages/bulk-create.md` trước Task 1 và Task 5. Lưu ý mục "Avoid: Leave UI frozen with no feedback": lưới bị khoá thì phải có lớp phủ kèm chữ giải thích.
- Loading dùng `Skeleton` hoặc spinner trong lớp phủ, không dùng text trơn. Empty state gồm icon trong vòng tròn `bg-muted`, một tiêu đề và một dòng gợi ý.
- Chỉ dùng token màu ngữ nghĩa và icon lucide-react. Icon trang trí có `aria-hidden`. Phần tử bấm được có `cursor-pointer`. Transition dài 150–200ms và tôn trọng `prefers-reduced-motion` (`motion-reduce:transition-none`, `motion-reduce:animate-none`).
- Copy viết bằng tiếng Việt, khớp giọng văn hiện có.
- Mỗi task phải qua hết: `npx vitest run "src/app/(app)/bulk/create"`, `npm run typecheck`, `npm run lint`.
- Kiểm cả light và dark mode, cả chế độ thường và toàn màn hình.

## Review Focus

1. **Đổi dự án khi đang toàn màn hình, dự án đích chưa có trong cache** (dùng DevTools → Network → Slow 3G): overlay không được tắt rồi bật lại. Lưới hiện lớp phủ "Đang tải cấu hình dự án X…", nút Xem trước bị tắt. (Task 1, bước 6)
2. **Trong lúc đang tải dự án mới:** không request nào gửi `metadataFingerprint` của dự án cũ, và không quyết định `canCreate` dựa trên placeholder. (Task 1, bước 3)
3. **Dự án đích có bản nháp:** đổi sang, đợi hơn 2 giây, bấm "Khôi phục". Đúng các dòng của bản nháp đó phải quay lại. (Task 3, bước 6)
4. **Đang ở bước Xem trước hoặc Tiến độ:** Select dự án bị khoá và có tooltip giải thích. Không bao giờ ra màn trắng. (Task 4, bước 3)
5. **Dự án đích có `canCreate: false` hoặc metadata lỗi** khi đang toàn màn hình: thông báo hiện bên trong overlay, người dùng đổi lại dự án khác được mà không phải thoát toàn màn hình. (Task 2, bước 5)

---

### Task 1: Giữ editor mounted khi đổi dự án

**Files:**
- Modify: `src/app/(app)/bulk/create/lib/use-bulk-create-controller.ts` (query metadata, `previewMutation`)
- Modify: `src/app/(app)/bulk/create/bulk-create-client.tsx` (điều kiện render skeleton và shell)
- Modify: `src/app/(app)/bulk/create/bulk-create-editor-shell.tsx` (prop `isSwitchingProject`, lớp phủ)
- Modify: `src/app/(app)/bulk/create/bulk-create-command-bar.tsx`, `bulk-create-status-bar.tsx`, `bulk-create-editor-topbar.tsx` (tắt action khi đang chuyển)

**Interfaces:**
- Controller trả thêm `isSwitchingProject: boolean`, bằng `isPlaceholderData` của query metadata.
- `BulkCreateEditorShellProps` thêm `isSwitchingProject?: boolean` và `switchingToProject?: string`.

**Steps:**
- [x] 1. Trong `useQuery` metadata, thêm `placeholderData: keepPreviousData` và lấy thêm `isPlaceholderData`. Import `keepPreviousData` từ `@tanstack/react-query`.
- [x] 2. Định nghĩa trong controller:
  ```ts
  const isSwitchingProject = isPlaceholderData;
  // Metadata thật của projectKey hiện tại, không phải placeholder của dự án cũ
  const currentMetadata = isPlaceholderData ? undefined : metadata;
  ```
  Trả cả `metadata` (để shell còn dữ liệu mà render) lẫn `isSwitchingProject`.
  - **Lưu ý TanStack v5:** `placeholderData` chỉ được dùng khi query đang ở `status === "pending"` (`query-core/build/modern/queryObserver.js:344`). Nếu request của dự án mới **lỗi**, `data` thành `undefined` và shell sẽ unmount lại. Vì vậy controller phải tự giữ metadata thật cuối cùng nhận được, bằng derived state:
    ```ts
    const [shellMetadata, setShellMetadata] = useState<BulkCreateProjectMetadata | undefined>();
    if (currentMetadata && currentMetadata !== shellMetadata) setShellMetadata(currentMetadata);
    ```
    Shell render dựa trên `shellMetadata`, không dựa trên `metadata` của query. Task 2 dùng biến này.
  - Kiểm `queryPolicy.defaults` (`src/app/providers.tsx:44`). Nếu `retry` mặc định là 3, lớp phủ sẽ quay khoảng 7 giây rồi mới báo lỗi. Đặt `retry: 1` riêng cho query metadata.
- [x] 3. Chặn dùng dữ liệu cũ:
  - Đầu `previewMutation.mutationFn`, nếu `isSwitchingProject` thì throw ngay. UI cũng phải tắt nút từ trước.
  - `metadataFingerprint` lấy từ `currentMetadata?.fingerprint`.
  - Banner thiếu quyền (`!canCreate`) chỉ dựa trên `currentMetadata`.
- [x] 4. Trong `bulk-create-client.tsx`:
  - Chỉ hiện skeleton khi `metadataLoading && !metadata`, tức lần tải đầu tiên.
  - Điều kiện render shell đổi thành `metadata && (isSwitchingProject || metadata.canCreate)`. Shell vẫn mounted khi đang chuyển dự án, kể cả khi dự án cũ có `canCreate` còn dự án mới chưa biết.
- [x] 5. Trong shell, khi `isSwitchingProject`:
  - Bọc vùng lưới bằng `relative`. Phủ lên một lớp `absolute inset-0 z-10 flex items-center justify-center bg-background/60 backdrop-blur-[1px]` gồm spinner `Loader2` (`motion-reduce:animate-none`) và chữ "Đang tải cấu hình dự án {switchingToProject}…". Lớp phủ có `role="status"` và `aria-live="polite"`.
  - Đặt `aria-busy="true"` cho vùng lưới và `inert` cho phần lưới bên dưới để không focus hay gõ được vào đó.
  - Truyền `disabled` xuống command bar cho các nút Mặc định, Nhập file, Template, Tải mẫu Excel, Cột và Thêm dòng. **Không** khoá Select dự án, để người dùng đổi tiếp được nếu chọn nhầm.
  - Status bar và topbar: tắt nút Xem trước, đổi tooltip thành "Đang tải cấu hình dự án…".
  - Lớp phủ fade-in 150ms. Không cần fade-out cầu kỳ.
- [x] 6. Kiểm tay:
  - (a) Chế độ thường, Slow 3G: đổi sang dự án chưa mở lần nào. Lưới giữ nguyên, có lớp phủ, không nhảy layout.
  - (b) Lặp lại ở chế độ toàn màn hình: overlay không nhấp nháy.
  - (c) Đổi về dự án đã mở: tức thì, không có lớp phủ.
  - (d) Cột hiển thị cập nhật theo dự án mới sau khi metadata về. Derived state `prevProjectKey`/`prevMetadata` trong shell đã lo việc này, chỉ cần xác nhận.
- [x] 7. `npx vitest run "src/app/(app)/bulk/create"`, `npm run typecheck`, `npm run lint`. Commit: `fix(bulk-create): keep the editor mounted while switching projects`.

---

### Task 2: Đưa thông báo và trạng thái lỗi vào trong shell

Lý do: ở chế độ toàn màn hình, các thứ sau đang bị overlay `fixed` che mất vì chúng render bên ngoài shell: banner bản nháp, banner handoff AI, lỗi preview, lỗi metadata, banner thiếu quyền. Sau Task 1, nếu dự án mới lỗi hoặc không có quyền thì shell vẫn unmount, nên vẫn còn bị "thoát ra" trong hai trường hợp này.

**Files:**
- Modify: `src/app/(app)/bulk/create/bulk-create-client.tsx`
- Modify: `src/app/(app)/bulk/create/bulk-create-editor-shell.tsx`
- Create: `src/app/(app)/bulk/create/bulk-create-draft-banner.tsx` (tách khối banner bản nháp đang viết inline trong client)

**Interfaces:**
- Shell thêm `notices?: React.ReactNode`, render ngay dưới command bar và trên lưới, có `px-3 sm:px-4 pt-3 space-y-2`, rỗng thì không render.
- Shell thêm `blockedState?: React.ReactNode`. Khi có giá trị, nó **thay chỗ lưới**. Command bar và status bar vẫn giữ để người dùng đổi dự án hoặc thoát toàn màn hình.

**Steps:**
- [x] 1. Tách banner bản nháp thành `BulkCreateDraftBanner({ projectKey, onRestore, onDiscard })`. Giữ nguyên markup, nhưng đổi `h-7.5` thành `h-8` cho đồng bộ với các nút khác.
- [x] 2. Trong client, gom `handoffError`, `handoffActive`, `draftAvailable` và `previewMutation.isError` thành `notices` rồi truyền vào shell.
- [x] 3. Điều kiện render shell chỉ còn là `shellMetadata` (metadata thật cuối cùng, xem Task 1 bước 2). **Không** dùng `metadata` của query, vì nó thành `undefined` khi dự án mới lỗi. Khi `metadataError` có giá trị hoặc `currentMetadata?.canCreate === false`, render `blockedState` bên trong shell, dùng lại `ErrorState` và `FeedbackBanner`. Lưới và cột vẫn dựa trên `shellMetadata` của dự án cũ nhưng bị thay bằng `blockedState`, nên không ai thao tác được trên dữ liệu cũ. Riêng lần tải đầu mà metadata lỗi thì vẫn hiện `ErrorState` ngoài trang như hiện nay, vì lúc đó chưa có shell.
- [x] 4. Khi có `blockedState`, nút Xem trước bị tắt và các action phụ thuộc metadata bị tắt, giống trạng thái "switching" ở Task 1.
- [x] 5. Kiểm tay ở chế độ toàn màn hình:
  - (a) Đổi sang dự án có `canCreate: false`. Có thể giả lập bằng cách sửa response tạm trong DevTools → Overrides. Thông báo hiện trong overlay, đổi lại dự án khác được ngay.
  - (b) Chặn request metadata để ra lỗi. Thấy `ErrorState` kèm nút "Thử lại" bên trong overlay.
  - (c) Banner bản nháp thấy được khi đang toàn màn hình.
- [x] 6. Chạy check, commit: `refactor(bulk-create): render notices and blocked states inside the editor shell`.

---

### Task 3: Sửa lỗi bản nháp bị xoá hoặc ghi đè khi đổi dự án

**Files:**
- Modify: `src/app/(app)/bulk/create/lib/bulk-create-controller-model.ts`
- Modify: `src/app/(app)/bulk/create/lib/bulk-create-controller-model.test.ts`
- Modify: `src/app/(app)/bulk/create/lib/use-bulk-create-controller.ts`

**Interfaces (hàm thuần mới):**
```ts
export type DraftStatus = "pending-decision" | "ready";

/** Đọc raw localStorage của một dự án và quyết định có cần hỏi khôi phục không. */
export function resolveDraftStatus(raw: string | null): DraftStatus;

/** Autosave chỉ được ghi khi bản nháp của đúng dự án đó đã được xử lý xong. */
export function canAutosaveDraft(input: {
  draftOwner: string | null;   // dự án mà quyết định bản nháp áp dụng cho
  projectKey: string;
  status: DraftStatus;
  handoffActive: boolean;
  step: "input" | "preview" | "progress";
}): boolean;
```

**Steps:**
- [x] 1. **Xác nhận lỗi trước khi sửa:**
  - Dự án X: gõ 2 dòng, đợi "Đã lưu lúc …". Chuyển sang Y (lưới trống ở Y) rồi quay lại X. Ghi lại X có còn bản nháp không (DevTools → Application → Local Storage → `bulk-create-draft:X`).
  - Reload trang khi X đang có bản nháp, đợi 2 giây, bấm "Khôi phục".
  - Ghi kết quả vào commit message. Nếu reload không làm mất bản nháp, vẫn sửa phần đổi dự án như bên dưới.
- [x] 2. Viết test trước cho `resolveDraftStatus` (null, JSON hỏng, items rỗng, chỉ có dòng trống thì trả `"ready"`; có ít nhất một summary thì trả `"pending-decision"`) và cho `canAutosaveDraft`. Các ca quan trọng:
  - `draftOwner !== projectKey` thì trả `false`. Đây là ca vừa đổi dự án, chính là lỗi B.
  - `status === "pending-decision"` thì trả `false`, vì người dùng chưa chọn Khôi phục hay Bỏ qua.
  - `handoffActive` thì trả `false`.
  - `step !== "input"` thì trả `false`.
- [x] 3. Implement hai hàm cho test pass.
- [x] 4. Trong controller, thay cặp `draftRestoredRef` + `draftAvailable` bằng state `{ owner: string | null; status: DraftStatus }`, cập nhật **đồng bộ trong lúc render** theo pattern derived state mà `bulk-create-editor-shell.tsx` đang dùng (`prevProjectKey`):
  ```ts
  const [draftState, setDraftState] = useState<{ owner: string | null; status: DraftStatus }>({ owner: null, status: "ready" });
  if (projectKey && draftState.owner !== projectKey && !handoffModeRef.current) {
    setDraftState({ owner: projectKey, status: resolveDraftStatus(safeReadDraft(draftKey)) });
  }
  const draftAvailable = draftState.owner === projectKey && draftState.status === "pending-decision";
  ```
  Như vậy không còn `queueMicrotask`, và effect autosave đọc đúng trạng thái ngay trong commit đầu tiên sau khi đổi dự án.
  - `safeReadDraft` phải có guard `typeof window === "undefined"` và try/catch, giống `getStoredEditorMode` trong `lib/editor-preferences.ts:11`, vì nó được gọi trong lúc render.
  - **Đánh đổi có chủ đích:** khi bản nháp đang `pending-decision`, autosave bị tắt. Những gì người dùng gõ trước khi chọn Khôi phục hay Bỏ qua sẽ không được lưu. Đừng "sửa" điểm này. Thêm vào banner một dòng: "Khôi phục sẽ thay thế danh sách hiện tại."
  - **Không** đọc `handoffModeRef.current` trong lúc render. Dùng state `handoffActive` thay thế. Nếu cần chặn trong commit đầu tiên của handoff, gom state handoff vào cùng chỗ với `draftState`.
- [x] 5. Effect autosave chỉ gọi `saveDraft` khi `canAutosaveDraft(...)` trả `true`. `handleRestoreDraft` và `handleDiscardDraft` đặt `status: "ready"`. `handleProjectSelect` và `applyProjectChange` không cần đụng ref nữa, vì `owner` lệch là đủ để tính lại.
- [x] 6. Kiểm tay:
  - (a) Lặp lại kịch bản ở bước 1. Bản nháp của X còn nguyên.
  - (b) Y có bản nháp, đổi từ X (có dữ liệu) sang Y qua dialog, đợi 2 giây, bấm "Khôi phục". Ra đúng bản nháp của Y.
  - (c) Bấm "Bỏ qua" xong gõ tiếp thì autosave chạy lại.
  - (d) Luồng handoff AI không ghi gì vào `bulk-create-draft:*`.
- [x] 7. Chạy check, commit: `fix(bulk-create): stop project switches from wiping the target project's draft`.

---

### Task 4: Khoá đổi dự án ngoài bước nhập dữ liệu

**Files:**
- Modify: `src/app/(app)/bulk/create/bulk-create-client.tsx` (Select ở header)
- Modify: `src/app/(app)/bulk/create/lib/use-bulk-create-controller.ts` (`handleProjectSelect`)

**Steps:**
- [x] 1. Trong `handleProjectSelect`, thêm guard `if (step !== "input") return;` để chặn ở tầng logic.
- [x] 2. Select ở header: `disabled={availableProjects.length === 0 || step !== "input"}`. Bọc trong `Tooltip` (shadcn) với nội dung:
  - `preview`: "Quay lại bước 1 để đổi dự án".
  - `progress`: "Đang tạo task trong {projectKey}. Bấm “Tạo đợt mới” để đổi dự án".
  Lấy đúng nhãn nút reset hiện có trong `create-progress.tsx`. Trigger bị disabled không nhận hover, nên bọc trigger trong một `span tabIndex={0}`.
- [x] 3. Kiểm tay:
  - (a) Ở bước Xem trước, Select bị mờ, có tooltip, không ra màn trắng.
  - (b) Ở bước Tiến độ cũng vậy. Bấm reset thì Select mở lại.
  - (c) Bấm "Quay lại" từ Xem trước về bước 1 thì đổi dự án bình thường.
- [x] 4. Chạy check, commit: `fix(bulk-create): lock the project picker outside the input step`.

---

### Task 5: Bỏ control trùng và sửa copy dialog

**Files:**
- Modify: `src/app/(app)/bulk/create/bulk-create-client.tsx`
- Modify: `src/app/(app)/bulk/create/bulk-create-command-bar.tsx`
- Modify: `src/app/(app)/bulk/create/bulk-create-status-bar.tsx`
- Modify: `src/app/(app)/bulk/create/bulk-create-project-dialog.tsx`

**Steps:**
- [x] 1. **Select dự án:** trong command bar, chỉ render Select khi `isFullscreen`. Ở chế độ thường, header đã có Select. Header vẫn hiện ở các bước 2 và 3, nên người dùng luôn biết mình đang ở dự án nào.
- [x] 2. **Nút toàn màn hình:**
  - Bỏ nút "Toàn màn hình" ở header. Nút ở command bar (đã có điều kiện `!isFullscreen`) là nút duy nhất để vào toàn màn hình.
  - Bỏ nút icon-only ở status bar. Muốn thoát toàn màn hình thì dùng nút "Thoát toàn màn hình" ở topbar. Nếu có phím tắt (xem `bulk-create-shortcuts-dialog.tsx`), giữ nguyên.
  - Nếu prop `onToggleFullscreen` của status bar không còn được dùng thì xoá luôn khỏi interface.
- [ ] 3. **(Không bắt buộc, cần người dùng duyệt trước. Đây là thay đổi về giao diện sản phẩm, không phải sửa lỗi.) Header gọn hơn:** bỏ dòng "Jira Data Center • Batch Operations" và badge "DC REST v2" trên tab điều hướng. Đây là thông tin kỹ thuật, không giúp người dùng làm việc. Rút đoạn mô tả còn tối đa một câu. Màn này có mật độ cao (`pages/bulk-create.md`), nên ưu tiên dành chiều cao cho lưới.
- [x] 4. **Dialog đổi dự án:**
  - Copy mới:
    > Chuyển sang **{pendingProjectKey}**.
    > • Giữ lại: tiêu đề, mô tả, người thực hiện, ước lượng, hạn, điểm, nhãn.
    > • Đặt lại: loại task, mức ưu tiên, phiên bản và các giá trị mặc định (vì khác nhau giữa các dự án).
  - Nếu dự án đích có bản nháp (gọi `resolveDraftStatus` từ Task 3), thêm một dòng: "Dự án {pendingProjectKey} có bản nháp đã lưu, bạn sẽ được hỏi khôi phục sau khi chuyển."
  - Icon cảnh báo dùng token `text-warning` nếu theme có định nghĩa, thay cho `text-amber-600 dark:text-amber-400`. Kiểm `globals.css` trước khi đổi.
  - Sửa chính tả "Huỷ bỏ" thành "Huỷ" cho khớp các dialog khác (grep để kiểm).
- [x] 5. Kiểm tay light và dark, chế độ thường và toàn màn hình, ở bề rộng 375px: không còn control trùng, header không bị wrap xấu.
- [x] 6. Chạy check, commit: `style(bulk-create): drop duplicate project and fullscreen controls`.

---

### Task 6 (không bắt buộc): Đồng bộ URL và prefetch metadata

**Files:**
- Modify: `src/app/(app)/bulk/create/lib/use-bulk-create-controller.ts`
- Modify: `src/app/(app)/bulk/create/bulk-create-client.tsx`, `bulk-create-command-bar.tsx`

**Steps:**
- [x] 1. Sau khi đổi dự án thành công (cả hai nhánh của `handleProjectSelect` và `applyProjectChange`), gọi `router.replace` với `?project=<KEY>` và `{ scroll: false }`, giữ các param khác. Làm theo cách effect handoff đang xoá `handoff`. Gọi `router.replace` trong event handler, không gọi trong effect.
- [x] 2. Thêm `onOpenChange` cho cả hai Select. Khi mở dropdown, gọi `queryClient.prefetchQuery` cho metadata của từng dự án trong danh sách, tối đa 10 dự án và bỏ qua dự án hiện tại. Dùng cùng `queryKey`, `queryFn` và `staleTime` với `useQuery`. Tách `metadataQueryOptions(projectKey)` ra để dùng chung.
- [x] 3. Kiểm tay: đổi dự án rồi reload trang, vẫn đúng dự án. Mở dropdown, đợi 1 giây rồi chọn: không thấy lớp phủ loading.
- [x] 4. Chạy check, commit: `feat(bulk-create): sync the selected project to the URL and prefetch metadata`.

---

## Checklist thủ công cuối

- [x] Chế độ thường và toàn màn hình × light và dark × 1440px và 375px.
- [x] Đổi dự án lần đầu (chưa cache) ở Slow 3G: không nhấp nháy, không mất state shell.
- [x] Bản nháp: tạo ở X, đổi sang Y rồi về X, reload: còn nguyên và khôi phục được.
- [x] Bước Xem trước và Tiến độ: không đổi được dự án, có giải thích, không có màn trắng.
- [x] Handoff AI (`?handoff=`) vẫn đổ đúng dòng và không ghi bản nháp.
- [x] `prefers-reduced-motion`: lớp phủ không có animation quay.
