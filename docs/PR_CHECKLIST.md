# PR Checklist — UI/Refactor

Checklist cho mỗi PR thay đổi UI, component, hoặc refactor frontend. Áp dụng
bắt buộc cho các PR thuộc chương trình refactor shared UI component (xem
[`SHARED_UI_COMPONENT_REFACTOR_PLAN.md`](./SHARED_UI_COMPONENT_REFACTOR_PLAN.md)).

## 1. Scope & correctness

- [ ] PR chỉ làm MỘT việc (tạo component + migrate consumer, HOẶC tách file, HOẶC fix bug). Không trộn refactor với feature/đổi API.
- [ ] Không đổi API contract, URL, permission, data flow, hay business logic (trừ bug fix tách riêng).
- [ ] Không tạo component shared chưa có consumer thật trong cùng PR.
- [ ] Query key, invalidation, optimistic update không đổi (trừ khi PR cụ biệt cho việc đó).

## 2. Reuse & architecture

- [ ] Search `src/components/shared/` trước khi tự viết header, empty state, error state, metric card, filter bar, search field, segmented control, confirm dialog, feedback banner.
- [ ] Component mới chỉ được đặt vào `shared/` khi có ≥2 consumer trong cùng PR.
- [ ] Không thêm prop `mode`/`variant` theo domain vào shared component.
- [ ] Không import business type, API URL, hay query key vào `shared/`.
- [ ] Domain wrapper (route-specific copy/anatomy) nằm trong route, không fork shared.
- [ ] Không tạo index barrel (`index.ts`) trong `shared/`.

## 3. Accessibility (a11y)

- [ ] Một `h1` duy nhất mỗi page (thông qua `PageHeader`).
- [ ] Heading hierarchy không nhảy cấp.
- [ ] Icon trang trí có `aria-hidden="true"`.
- [ ] Interactive elements có keyboard support (Tab, Enter, Space, Escape).
- [ ] Focus visible (`focus-visible:ring-2`); focus không bị trap.
- [ ] Dialog: focus trả về trigger sau khi đóng; Escape đóng (trừ `pending`).
- [ ] `role` đúng: `alert` cho lỗi, `status` cho thông tin, `group` cho segmented control.
- [ ] Không dùng màu làm tín hiệu duy nhất (có icon/text bổ sung).

## 4. Visual & design system

- [ ] Dùng semantic tokens (`bg-muted`, `text-foreground`, `border-border`, `text-destructive`, `bg-primary`...), **không** hardcoded hex hay Tailwind màu cứng (`red-500`, `teal-400`).
- [ ] Status colors: emerald (success), amber (warning), destructive (error), primary/teal (info/action).
- [ ] Verified cả **light mode** và **dark mode**.
- [ ] Text contrast ≥ 4.5:1 trong cả hai mode.
- [ ] Clickable elements có `cursor-pointer`.
- [ ] Transitions 150–200ms; animation có `motion-safe:` hoặc `motion-reduce:`.
- [ ] Responsive: test ở 375, 768, 1024, 1440 px. Không horizontal scroll ngoài data table có chủ ý.

## 5. Async states

- [ ] Loading: dùng `Skeleton`/`ListSkeleton`/`GridSkeleton` (không spinner text).
- [ ] Error: dùng `ErrorState` (token `destructive`, `role="alert"`, retry button).
- [ ] Empty dataset: dùng `EmptyState` (icon + title + hint).
- [ ] No-results do filter: `EmptyState` với copy khác + action "Xóa lọc".
- [ ] Stale-while-revalidate: giữ content cũ visible, thể hiện refetch nhẹ (không full-page loading).
- [ ] Mutation pending: disable button + spinner; không double-submit.

## 6. Performance & bundle

- [ ] `"use client"` chỉ ở component cần event/state/browser API.
- [ ] Presentational shared component không import `useQueryClient`, `useState`, hay hook query.
- [ ] Không barrel import nặng; import trực tiếp file.
- [ ] Không tăng client bundle đáng kể (check `next build` output).

## 7. Quality gates (bắt buộc)

Trước khi tạo PR, chạy và confirm **cả 4** pass:

```bash
npm run typecheck   # hoặc: node node_modules/typescript/bin/tsc --noEmit --incremental false
npm run lint        # hoặc: node node_modules/eslint/bin/eslint.js src scripts prisma
npm test            # hoặc: node node_modules/.bin/vitest run
npm run build       # hoặc: node node_modules/.bin/next build
```

- [ ] `typecheck` pass (0 errors).
- [ ] `lint` không thêm error/warning mới so với baseline.
- [ ] `test` pass (không giảm số test pass).
- [ ] `build` pass (static page count không giảm).

## 8. Cleanup

- [ ] Xóa import không dùng.
- [ ] Xóa dead code (variable, function, component) bị thay thế.
- [ ] Không giữ alias/compat layer vô thời hạn — xóa khi import graph sạch.
- [ ] Nếu component cũ bị thay thế hoàn toàn: xóa file cũ (không comment out).

## 9. Documentation

- [ ] Nếu thêm/sửa component trong `shared/`: cập nhật `src/components/shared/README.md`.
- [ ] Nếu đổi API của shared component: ghi rõ breaking change trong PR description.
- [ ] PR description mô tả: gì thay đổi, tại sao, how to verify.

## 10. Regression test manual (khi applicable)

Mỗi route bị migrate phải kiểm tra:

- [ ] Loading lần đầu.
- [ ] Success có dữ liệu.
- [ ] Empty dataset.
- [ ] No-results do filter.
- [ ] Network/server error + retry.
- [ ] Background refetch (dữ liệu cũ vẫn visible).
- [ ] Mutation pending/success/error.
- [ ] Permission/config blocker (nếu route có).
- [ ] URL/query params sau refresh/back/forward.
- [ ] Mobile + desktop layout.
