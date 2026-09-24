# Refactor playbook

Công thức cho từng loại batch. Mỗi công thức: **khi nào làm → cách làm → cách tự kiểm tra behavior không đổi**.

## A. Xoá dead code
- Khi: knip báo + `grep` xác nhận 0 tham chiếu (kể cả string, dynamic import, config, test, `public/`).
- Làm: xoá export trước, chạy tsc; rồi mới xoá file nếu file rỗng.
- Dependency unused: xoá khỏi `package.json` + chạy install bằng đúng package manager để cập nhật lockfile. Không xoá `@types/*`, eslint plugin, prettier plugin, postcss/tailwind plugin, prisma CLI, tsx, pg-boss chỉ vì knip báo — kiểm tra config file trước.
- Check: tsc + build pass.

## B. Siết type
- Thứ tự: type ở boundary (API response, Prisma result, job payload, form) → lan vào trong.
- Response API dùng chung client/server: định nghĩa type/zod ở `src/types` hoặc `src/lib/schemas`, route handler `satisfies`, client fetcher trả đúng type.
- `catch (e: any)` → `catch (e)` + `e instanceof Error ? e.message : String(e)`.
- Check: tsc; không có `as` mới xuất hiện (grep diff: `git diff | grep '^+.* as '`).

## C. Gom duplicate
- Chỉ gom khi ≥ 2 bản **thực sự giống ngữ nghĩa**, không phải chỉ giống hình. Hai hàm giống nhau nhưng xử lý edge case khác → giữ nguyên, ghi report.
- Đặt chỗ: `src/lib/<domain>/` cho logic, `src/components/<domain>/` cho UI, `src/hooks/` cho hook.
- Tránh tạo abstraction có > 3 tham số boolean — dấu hiệu gom sai.
- Check: test hiện có + so sánh output (nếu util thuần, viết test nhanh cho cả input cũ).

## D. Route handler rối
Mục tiêu hình dạng:
```ts
export async function POST(req: Request) {
  return handle(async () => {
    const user = await requireUser();          // throw HttpError(401, <message cũ>)
    const body = await parseJson(req, CreateTaskSchema); // throw HttpError(400, <message cũ>)
    const task = await taskService.create(user.id, body);
    return NextResponse.json(task, { status: 201 });
  });
}
```
- `handle()` map `HttpError` → status + body **y hệt format cũ** (xem response lỗi hiện tại trước khi viết helper). Nếu các route đang trả lỗi format khác nhau → helper phải cho phép giữ format từng route, hoặc chỉ áp dụng cho nhóm route cùng format.
- Business logic dài → `src/server/services/<domain>.ts` (thuần, nhận input đã validate, dễ test).
- Check: diff từng nhánh `return NextResponse...` cũ ↔ mới: status, body, headers.

## E. Component quá lớn
- Khi: > 250 dòng, nhiều trách nhiệm (fetch + state + layout + modal).
- Làm theo thứ tự:
  1. Tách hook: `useXxx()` chứa query/mutation/state logic, component chỉ render.
  2. Tách sub-component thuần hiển thị (props-in, JSX-out) — copy JSX nguyên văn.
  3. Giữ nguyên thứ tự hook gọi trong mỗi component, giữ nguyên `key`.
- Kanban (@dnd-kit): KHÔNG thay đổi cấu trúc `DndContext`/`SortableContext`, sensor, collision detection, id của item. Chỉ tách phần render card/column. Việc tách có thể làm card re-render khác → nếu tách, bọc `memo` phải có lý do.
- Check: DOM output giống (so JSX trước/sau), test component nếu có, build.

## F. TanStack Query
1. Tạo key factory; thay từng `queryKey` literal bằng factory, **đảm bảo giá trị giống**.
2. Tạo `xxxQueryOptions()`; hook `useXxx = () => useQuery(xxxQueryOptions())`.
3. Fetcher: một `apiFetch<T>()` chung (xử lý `!res.ok` giống cách cũ — nếu các chỗ cũ xử lý khác nhau thì giữ khác nhau).
- Check: grep toàn bộ `invalidateQueries|setQueryData|getQueryData|prefetchQuery|removeQueries` và đối chiếu key.

## G. Zustand
- Thay `const { a, b } = useStore()` → `useStore(useShallow(s => ({ a: s.a, b: s.b })))`. Behavior giữ nguyên, bớt re-render.
- Tách store lớn thành slice chỉ khi không dùng `persist` hoặc giữ nguyên shape persisted.

## H. Worker
1. Constant hoá tên job (giá trị cũ).
2. Type + zod payload.
3. Tách mỗi case của switch ra handler file, worker.ts chỉ còn bootstrap: tạo boss → start → đăng ký từ registry → schedule → shutdown hook.
4. Handler lỗi: giữ nguyên hành vi throw (pg-boss dựa vào throw để retry). Không nuốt lỗi.
- Check: chạy `tsc` với tsconfig bao gồm worker; chạy `vitest` cho handler nếu có; khởi động thử worker 5–10s nếu có DB local (`timeout 10 npx tsx src/worker.ts`), không có DB thì bỏ qua và ghi chú.

## I. Đặt tên & cấu trúc
- Đổi tên biến/hàm nội bộ để rõ nghĩa: được. Đổi tên export dùng nhiều nơi: được nếu cập nhật hết và tsc pass. Đổi tên file route/page: **cấm** (đổi URL).
- Không di chuyển hàng loạt thư mục trong một batch. Move file = batch riêng, chỉ move + sửa import.

## Commit message
`refactor(cleanup): <scope>: <việc>` — ví dụ:
- `refactor(cleanup): api/tasks: extract requireUser & parseJson helpers`
- `refactor(cleanup): types: replace any in jira client`
- `chore(cleanup): remove unused deps lodash, moment`
