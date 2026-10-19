# Cải thiện màn Cập nhật hàng loạt (`/bulk`) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Sửa các lỗi UX của luồng chọn task → chọn thay đổi → xem trước → chạy trên `/bulk`. Phần lớn lỗi nằm sau bước xác nhận. Đồng thời giảm chi phí render danh sách preview lớn và làm gọn phần props giữa các hook với các card.

**Architecture:**
- Logic thuần (trạng thái op đã kết thúc, nhãn số lượng task) đặt trong `src/app/(app)/bulk/lib/bulk-utils.ts` và có unit test bằng vitest.
- Tiến độ chạy được tách thành `BulkRunCard`. Card này đặt ngay dưới bước 2, chiếm chỗ thẻ Preview sau khi người dùng xác nhận. `BulkHistoryCard` chỉ còn hiện danh sách lịch sử.
- Hook không có hạ tầng test (repo không có `@testing-library/react`), nên phần UI được kiểm bằng `typecheck`, `lint` và checklist thủ công.

**Tech Stack:** Next.js App Router (`reactCompiler: true`), React 19, TanStack Query, Tailwind v4 + shadcn/ui, lucide-react, vitest.

**Spec:** Review màn `/bulk` ngày 2026-10-19, gồm 12 mục. Phần quyết định ngay dưới đây ghi rõ mục nào được làm và mục nào bị loại.

## Quyết định

| # | Mục từ review | Xử lý |
|---|---|---|
| 1 | Preview vẫn còn sau khi xác nhận | Task 1 |
| 2 | Tiến độ chạy nằm cuối trang hoặc bị ẩn | Task 2 |
| 3 | Ô nhập trường hiện cả ở chế độ transition/log-work | Task 3 |
| 4 | Danh sách lịch sử không cập nhật state | Task 2 |
| 5 | Số task ở chế độ "Tất cả khớp bộ lọc" chỉ đếm phần đã tải | Task 4 |
| 6, 7 | `toggle`/`values` không memo | **Bỏ.** Dự án bật React Compiler (`next.config.ts:4`), compiler tự memo nên không cần `useCallback`/`useMemo` thủ công. Việc đổi `buildAction()` thành giá trị `action` được gộp vào Task 7 như một bước làm gọn code. |
| 8 | Preview và chi tiết op chưa giới hạn số dòng | Task 5 |
| 9, 10, 11 | Đánh số bước, gợi ý bước 2, ô đếm bằng 0 | Task 6 |
| 12 | `BulkSelectCard` nhận khoảng 40 props | Task 7 (không bắt buộc, làm cuối) |

## Global Constraints

- Không thêm dependency, không sửa `package.json` hay lockfile.
- Không đổi API route hay hành vi server. Mọi thay đổi nằm trong `src/app/(app)/bulk/`.
- Đọc `design-system/team-task-web/MASTER.md` trước khi làm Task 2 và Task 6.
- Loading dùng `Skeleton`. Empty state gồm icon trong vòng tròn `bg-muted`, một tiêu đề và một dòng gợi ý.
- Chỉ dùng token màu ngữ nghĩa (`bg-muted`, `text-muted-foreground`, `border-border`) và icon lucide-react. Icon trang trí phải có `aria-hidden`.
- Phần tử bấm được có `cursor-pointer`. Transition dài 150–200ms. Animation và scroll phải tôn trọng `prefers-reduced-motion`.
- Copy hiển thị viết bằng tiếng Việt, khớp giọng văn hiện có của màn.
- Mỗi task phải qua hết: `npx vitest run "src/app/(app)/bulk"`, `npm run typecheck`, `npm run lint`.
- Kiểm cả light và dark mode.

## Review Focus

1. **Xác nhận thất bại** (API lỗi 4xx/5xx): preview phải còn nguyên, hiện banner lỗi, không xóa danh sách chọn. Kiểm trong Task 1, bước 3.
2. **Bấm "Thử lại" trong lịch sử khi đang có preview mở**: card tiến độ phải hiện và cuộn tới, preview không bị mất. Kiểm trong Task 2, bước 6.
3. **Đổi bucket preview sau khi đã bấm "Xem thêm"**: giới hạn số dòng quay về 50 cho bucket mới. Kiểm trong Task 5, bước 4.
4. **Chuyển update-fields → transition → update-fields**: các trường đã bật và giá trị đã nhập vẫn còn, chỉ bị ẩn khi ở chế độ khác. Kiểm trong Task 3, bước 3.
5. **Chế độ filter với dự án có hơn 1000 task**: nhãn hiện `≥ N`, và preview vẫn ra con số thật từ server. Đã có test ở Task 4. Kiểm tay ở Task 4, bước 5.

---

### Task 1: Đóng preview sau khi xác nhận thành công

**Files:**
- Modify: `src/app/(app)/bulk/bulk-client.tsx` (chỗ gọi `useBulkOperations`, khoảng dòng 47-52)

**Interfaces:**
- Consumes: option có sẵn `onOperationConfirmed?: (operationId: string) => void` của `useBulkOperations`. Option này đã được gọi sau khi confirm thành công, ở `use-bulk-operations.ts:57`. Dùng thêm `preview.resetPreview()` có sẵn.
- Produces: không có gì mới.

- [x] **Step 1:** Trong `bulk-client.tsx`, truyền `onOperationConfirmed: () => preview.resetPreview()` vào `useBulkOperations`. Không sửa `use-bulk-operations.ts`: nhánh `catch` không gọi callback, nên khi lỗi thì preview được giữ lại.
- [x] **Step 2:** Chạy `npm run typecheck && npm run lint`. Kết quả mong đợi: 0 lỗi.
- [x] **Step 3: Kiểm thủ công** (`npm run dev`, mở `/bulk`):
  - (a) Chế độ pick: chọn 2 task, sửa label, xem trước rồi xác nhận. Thẻ Preview biến mất, không hiện banner "đã thay đổi".
  - (b) Chế độ filter: làm tương tự. Không còn nút xác nhận lần hai.
  - (c) Tắt mạng (DevTools → Offline) rồi xác nhận. Preview vẫn còn và hiện `FeedbackBanner` lỗi.
- [x] **Step 4:** Commit.

```bash
git add "src/app/(app)/bulk/bulk-client.tsx"
git commit -m "fix(bulk): close preview after a confirmed run"
```

### Task 2: Card tiến độ chạy ngay sau bước 2 và lịch sử tự cập nhật

**Files:**
- Modify: `src/app/(app)/bulk/lib/bulk-utils.ts`
- Create: `src/app/(app)/bulk/lib/bulk-utils.test.ts`
- Create: `src/app/(app)/bulk/bulk-run-card.tsx`
- Modify: `src/app/(app)/bulk/bulk-operation-detail.tsx` (dòng 37-42, 63; bỏ class `mb-4` ở wrapper ngoài)
- Modify: `src/app/(app)/bulk/bulk-history-card.tsx` (bỏ prop `activeOp`/`jiraBaseUrl` và phần render `OperationDetail` ở dòng 52; dòng 81 dùng helper mới)
- Modify: `src/app/(app)/bulk/bulk-client.tsx`

**Interfaces:**
- Produces:
  - `export const TERMINAL_OP_STATES: readonly string[]` có giá trị `["completed", "partially_failed", "failed", "cancelled"]`.
  - `export function isTerminalOpState(state: string | null | undefined): boolean`.
  - `export function BulkRunCard(props: { id: string; jiraBaseUrl: string; onClose: () => void }): JSX.Element`.
  - `BulkHistoryCard` mới nhận `{ activeOp: string | null; opsLoaded; ops; onSelectOp; onRetry }`. `activeOp` chỉ còn dùng để highlight dòng, không dùng để render chi tiết nữa.

- [x] **Step 1: Viết test lỗi** trong `lib/bulk-utils.test.ts`.

```ts
import { describe, expect, it } from "vitest";
import { isTerminalOpState } from "./bulk-utils";

describe("isTerminalOpState", () => {
  it.each(["completed", "partially_failed", "failed", "cancelled"])("%s is terminal", (s) => {
    expect(isTerminalOpState(s)).toBe(true);
  });
  it.each(["queued", "running", "previewed", "", null, undefined])("%s is not terminal", (s) => {
    expect(isTerminalOpState(s)).toBe(false);
  });
});
```

- [x] **Step 2:** Chạy `npx vitest run "src/app/(app)/bulk/lib/bulk-utils.test.ts"`. Kết quả mong đợi: FAIL với lỗi `isTerminalOpState is not a function` hoặc lỗi export.
- [x] **Step 3:** Thêm `TERMINAL_OP_STATES` và `isTerminalOpState` vào `bulk-utils.ts`.
  - `bulk-operation-detail.tsx` dùng helper này ở dòng 39 và 63.
  - Effect ở dòng 37-42 invalidate thêm `bulkKeys.operations`. Đây là mục 4: badge trong danh sách lịch sử sẽ đổi ngay khi op kết thúc.
  - `bulk-history-card.tsx:81` đổi thành `isTerminalOpState(op.state) && op.state !== "cancelled" && op.failed > 0`. Hành vi giữ nguyên như cũ.
  - Chạy lại test. Kết quả mong đợi: PASS.
- [x] **Step 4:** Tạo `BulkRunCard` trong `bulk-run-card.tsx`.
  - Dùng `Card`. Header có icon `Activity` (lucide, `aria-hidden`), tiêu đề "Tiến độ thực thi" và nút ghost "Đóng" (icon `X`) gọi `onClose`.
  - Body render `<OperationDetail id={id} jiraBaseUrl={jiraBaseUrl} />`.
  - Gắn `id="bulk-run-card"` lên `Card`.
- [x] **Step 5:** Sửa `bulk-client.tsx`:
  - Render `{operations.activeOp && <BulkRunCard id={operations.activeOp} jiraBaseUrl={selection.jiraBaseUrl} onClose={() => operations.setActiveOp(null)} />}` ngay sau khối Preview, trước `BulkHistoryCard`.
  - Khi `activeOp` đổi sang giá trị khác null, cuộn tới `#bulk-run-card` bằng `scrollIntoView({ behavior: prefersReducedMotion ? "auto" : "smooth", block: "start" })`. Làm theo mẫu ở `admin-overview-client.tsx:129-130`.
  - Phần cuộn đặt trong `useEffect` theo `[operations.activeOp]`. Chạy sau commit nên card đã có trong DOM.
  - `BulkHistoryCard`: bỏ hai prop `jiraBaseUrl` và phần chi tiết. Giữ logic `toggled ?? activeOp !== null`.
- [x] **Step 6:** Chạy `npm run typecheck && npm run lint`. Kết quả mong đợi: 0 lỗi. Sau đó kiểm thủ công:
  - (a) Xác nhận một op: card tiến độ hiện ngay dưới bước 2, trang tự cuộn tới, thanh tiến độ chạy và badge trong lịch sử đổi khi xong.
  - (b) Đóng phần lịch sử, chạy op mới: card tiến độ vẫn hiện.
  - (c) Bấm một dòng lịch sử: card hiện chi tiết op đó.
  - (d) Đang mở preview mà bấm "Thử lại" trong lịch sử: card tiến độ hiện dưới thẻ Preview, trang cuộn tới và preview vẫn còn. Bấm "Xem trước" lần nữa thì card tự ẩn, vì `doPreview` gọi `setActiveOp(null)`.
  - (e) Bật OS "reduce motion": trang nhảy thẳng tới card, không cuộn mượt.
- [x] **Step 7:** Commit.

```bash
git add "src/app/(app)/bulk/"
git commit -m "feat(bulk): show run progress inline and refresh history on completion"
```

### Task 3: Chỉ hiện ô nhập trường ở chế độ "update-fields"

**Files:**
- Modify: `src/app/(app)/bulk/bulk-configure-card.tsx` (điều kiện render `BulkFieldInputs`)

**Interfaces:** không đổi.

- [x] **Step 1:** Đổi điều kiện thành `filterProject && operationKind === "update-fields" && enabledFields.size > 0`. Không reset `enabledFields` khi đổi chế độ, để người dùng quay lại vẫn còn giá trị đã nhập. `buildBulkAction` vốn đã bỏ qua các field này ở hai chế độ kia (`bulk-action.ts:82-93`).
- [x] **Step 2:** Chạy `npm run typecheck && npm run lint`.
- [x] **Step 3: Kiểm thủ công.** Bật Assignee và nhập `@abc`, chuyển sang "Chuyển trạng thái": không còn ô Assignee. Quay lại "Cập nhật trường": vẫn còn `@abc`.
- [x] **Step 4:** Commit với message `fix(bulk): hide field inputs outside update-fields mode`.

### Task 4: Nhãn số task đúng ở chế độ "Tất cả khớp bộ lọc"

**Files:**
- Modify: `src/app/(app)/bulk/lib/bulk-utils.ts`, `src/app/(app)/bulk/lib/bulk-utils.test.ts`
- Modify: `src/app/(app)/bulk/bulk-select-step.tsx` (`BulkTaskListFooter`, dòng 203)
- Modify: `src/app/(app)/bulk/bulk-header-parts.tsx` (`BulkActionBar`)
- Modify: `src/app/(app)/bulk/bulk-select-card.tsx`, `src/app/(app)/bulk/bulk-client.tsx` (truyền dữ liệu)

**Interfaces:**
- Produces: `export function effectiveCountLabel(input: { selectionMode: SelectionMode; effectiveCount: number; loadedCount: number; totalServerIssues: number }): { label: string; isLowerBound: boolean }`.
  - `isLowerBound` là `selectionMode === "filter" && loadedCount < totalServerIssues`.
  - `label` là `"≥ N"` khi `isLowerBound`, ngược lại là `"N"`.

- [x] **Step 1: Viết test lỗi.**

```ts
describe("effectiveCountLabel", () => {
  it("is exact in pick mode even when not fully loaded", () => {
    expect(effectiveCountLabel({ selectionMode: "pick", effectiveCount: 3, loadedCount: 1000, totalServerIssues: 2400 }))
      .toEqual({ label: "3", isLowerBound: false });
  });
  it("is a lower bound in filter mode when more issues exist on the server", () => {
    expect(effectiveCountLabel({ selectionMode: "filter", effectiveCount: 812, loadedCount: 1000, totalServerIssues: 2400 }))
      .toEqual({ label: "≥ 812", isLowerBound: true });
  });
  it("is exact in filter mode when everything is loaded", () => {
    expect(effectiveCountLabel({ selectionMode: "filter", effectiveCount: 40, loadedCount: 120, totalServerIssues: 120 }))
      .toEqual({ label: "40", isLowerBound: false });
  });
});
```

- [x] **Step 2:** Chạy test. Kết quả mong đợi: FAIL.
- [x] **Step 3:** Cài đặt `effectiveCountLabel` rồi chạy lại test. Kết quả mong đợi: PASS.
- [x] **Step 4:** Dùng nhãn này ở hai chỗ:
  - Footer: "Tổng số task sẽ cập nhật: {label}". Khi `isLowerBound`, thêm một dòng `text-muted-foreground`: "Bộ lọc áp dụng trên toàn dự án ở server — số chính xác hiển thị ở bước xem trước."
  - `BulkActionBar`: đổi prop `count: number` thành `countLabel: string`.
  - `selectionMode` được truyền thêm qua `BulkSelectCard` xuống `BulkTaskListFooter`.
  - Các text ở worklog form và transition form giữ nguyên.
- [x] **Step 5:** Chạy `npm run typecheck && npm run lint`. Kiểm thủ công với dự án có hơn 1000 task ở chế độ filter: footer và action bar hiện `≥ N`, preview hiện tổng đúng.
- [x] **Step 6:** Commit với message `fix(bulk): mark filter-mode task count as a lower bound when partially loaded`.

### Task 5: Giới hạn số dòng render của preview và chi tiết op

**Files:**
- Modify: `src/app/(app)/bulk/bulk-preview-step.tsx` (danh sách ở khoảng dòng 214-224)
- Modify: `src/app/(app)/bulk/bulk-operation-detail.tsx` (danh sách `op.items`)

**Interfaces:**
- Produces: `export const PREVIEW_PAGE_SIZE = 50` trong `lib/bulk-utils.ts`. Cả hai component dùng chung hằng số này.

- [x] **Step 1:** Trong `BulkPreviewCard`, tách danh sách thành component nội bộ `PreviewItemList({ items, jiraBaseUrl })`.
  - Component có state `limit` với giá trị đầu là `PREVIEW_PAGE_SIZE`, chỉ render `items.slice(0, limit)`.
  - Khi `items.length > limit`, hiện nút outline "Xem thêm (còn X task)" để tăng `limit` thêm `PREVIEW_PAGE_SIZE`.
  - Render với `key={previewView}` để limit reset khi đổi bucket.
- [x] **Step 2:** Làm tương tự trong `OperationDetail` cho `op.items`. Đặt `key={id}` ở chỗ render `OperationDetail` trong `BulkRunCard` để reset limit khi đổi op.
- [x] **Step 3:** Chạy `npm run typecheck && npm run lint`.
- [x] **Step 4: Kiểm thủ công.** Preview khoảng 200 task:
  - Chỉ có 50 card, nút "Xem thêm" hiện đúng số còn lại.
  - Bấm "Xem thêm" một lần rồi đổi sang bucket "Không đổi": danh sách quay về 50.
  - Empty state của bucket rỗng vẫn hiện.
- [x] **Step 5:** Commit với message `perf(bulk): page preview and run item lists`.

### Task 6: Chỉnh nhỏ giao diện (mục 9, 10, 11)

**Files:**
- Create: `src/app/(app)/bulk/bulk-step-badge.tsx`
- Modify: `bulk-select-card.tsx`, `bulk-configure-card.tsx`, `bulk-preview-step.tsx`

**Interfaces:**
- Produces: `export function BulkStepBadge({ step }: { step: 1 | 2 | 3 }): JSX.Element`. Đây là markup vòng tròn số đang có ở `bulk-preview-step.tsx` (khoảng dòng 129-131), tách ra để dùng lại.

- [x] **Step 1:** Ba card dùng `BulkStepBadge` trong `CardTitle`, theo cùng kiểu `flex items-center gap-2` của thẻ Preview.
- [x] **Step 2:** `BulkConfigureCard`: khi `filterProject && effectiveCount === 0`, `CardDescription` hiện "Chọn ít nhất một task ở bước 1 để tiếp tục." Giữ `opacity-60`.
- [x] **Step 3:** Các ô tóm tắt preview có `count === 0` thêm class `opacity-50`, vẫn bấm được để xem empty state. Ô đang chọn luôn giữ opacity đầy đủ.
- [x] **Step 4:** Chạy `npm run typecheck && npm run lint`. Kiểm light và dark mode để chắc độ tương phản số và nhãn ≥ 4.5:1 ở ô bị mờ. Nếu không đạt, chỉ làm mờ icon và nhãn, giữ con số rõ.
- [x] **Step 5:** Commit với message `style(bulk): number all steps and clarify disabled states`.

### Task 7 (không bắt buộc): Truyền controller thay vì props rời

**Files:**
- Modify: `lib/use-bulk-configure.ts`, `lib/use-bulk-preview.ts`, `bulk-client.tsx`, `bulk-select-card.tsx`, `bulk-configure-card.tsx`

**Interfaces:**
- `useBulkConfigure` trả thêm `action: BulkAction | null`, tính bằng `buildBulkAction(...)` ngay trong lúc render. Xóa `buildAction` khi không còn nơi nào dùng.
- `UseBulkPreviewOptions.buildAction` đổi thành `action: BulkAction | null`.
- `BulkSelectCard` đổi thành `{ selection: BulkSelectionController; statusOptions: string[]; myName?: string | null }`.
- `BulkConfigureCard` đổi thành `{ configure: BulkConfigureController; selection: BulkSelectionController; resetPreview: () => void; previewError: string | null }`.
- Các component con bên trong (`BulkTaskFilters`, `BulkTaskList`, …) giữ nguyên props.

- [x] **Step 1:** Đổi `buildAction` thành `action` trong hai hook và trong `bulk-client.tsx` (dòng 40, 76, 170). Chạy `npx vitest run "src/app/(app)/bulk"`: phải PASS vì logic thuần không đổi.
- [x] **Step 2:** Đổi props hai card như mô tả ở Interfaces. Card tự destructure từ controller.
- [x] **Step 3:** Chạy `npm run typecheck && npm run lint`. Đi lại luồng thủ công đủ ba chế độ (update-fields, transition, log-work) và cả chế độ pick lẫn filter. Hành vi phải giống hệt trước.
- [x] **Step 4:** Commit với message `refactor(bulk): pass controllers to step cards`.
