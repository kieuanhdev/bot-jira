# Kế hoạch cải tiến trang Sentry

Trạng thái: **Đề xuất, chưa triển khai**
Phạm vi: trang `/sentry`, `src/lib/sentry/*`, worker `sentry-import`.

## 1. Bối cảnh

Trang Sentry hiện đã có: phân loại triage (critical/normal/noise), duyệt/bỏ qua từng issue, tạo task Jira hàng loạt, tóm tắt AI, lọc theo project và trạng thái. Phần còn thiếu là **insight** (tìm kiếm, thống kê, phát hiện tăng đột biến). Đồng bộ hai chiều Jira ↔ Sentry đã được loại khỏi phạm vi.

## 2. Ràng buộc kỹ thuật cần lưu ý

- `listSentryImports` ([list.ts](../src/lib/sentry/list.ts)) chỉ lấy `take: 200` theo `lastSeen`; client chia trang 50 dòng trên 200 dòng đó. Tìm kiếm ở client sẽ bỏ sót issue cũ → **tìm kiếm và sắp xếp phải chạy ở server**.
- `seedSentryIssue` ([review-queue.ts](../src/lib/sentry/review-queue.ts)) dùng `upsert` với `update: snapshot`, ghi đè `eventCount` mỗi lần poll (5 phút). Muốn phát hiện tăng nóng phải lưu lại giá trị cũ → cần đổi schema.
- Next.js của dự án có breaking changes (xem `AGENTS.md`): worker phải đọc `node_modules/next/dist/docs/` trước khi viết route/page.
- Trước khi làm UI đọc `design-system/team-task-web/MASTER.md`. Dùng `Skeleton` cho loading, empty state có icon + tiêu đề + gợi ý, token màu semantic, kiểm tra light/dark.
- Migration Prisma cần được developer duyệt rõ ràng. Không áp migration lên DB trong quá trình làm.

## 3. Tổng quan phase

| Phase | Nội dung | Schema | Ước lượng | Phụ thuộc |
|---|---|---|---|---|
| 1 | Tìm kiếm + sắp xếp | không | nhỏ | — |
| 2 | Thanh thống kê đầu trang | không | nhỏ–vừa | tách `buildProjectCondition` |
| 3 | Cờ "tăng nóng" (spike) | có (2 cột) | vừa | Phase 2 (hiển thị thẻ) |

Mỗi phase là một PR riêng, deploy độc lập.

---

## Phase 1: Tìm kiếm + sắp xếp

### Backend
- [list.ts](../src/lib/sentry/list.ts): thêm tham số `opts: { q?: string; sort?: "recent" | "events" | "first" }`.
  - `q`: `OR [title contains (insensitive), shortId contains]`, ghép vào `AND` cùng `stateCondition` và `projectCondition`. Phải giữ nguyên scope của non-admin.
  - `sort`: `recent` (mặc định, như hiện nay), `events` (`eventCount desc`), `first` (`firstSeen desc`, nulls last).
  - Khi có `q`, nâng `take` lên 500.
  - Sort `triage` (mặc định ở tab review) vẫn chạy ở client bằng `compareTriage`.
- [route.ts](../src/app/api/sentry/route.ts): đọc `q`, `sort`; validate bằng zod trong [schemas/sentry.ts](../src/lib/api/schemas/sentry.ts) (`q` tối đa 100 ký tự, `sort` là enum, giá trị sai thì bỏ qua).
- [query-keys.ts](../src/lib/query-keys.ts): `sentryKeys.list(filter, project, q, sort)`.

### Frontend
- Component mới `sentry-toolbar.tsx`: ô tìm kiếm (debounce 300ms) + `Select` sắp xếp, đặt cạnh `SentryFilterTabs`. Tách riêng để [sentry-client.tsx](../src/app/(app)/sentry/sentry-client.tsx) (434 dòng) không dài thêm.
- Đồng bộ `q`/`sort` lên URL bằng `replaceUrlState` như `filter`/`project`.
- Đổi `q` hoặc `sort` thì reset page và selection.
- Empty state riêng cho "Không có kết quả cho '…'".

### Test
- `list.test.ts`: `q` khớp title/shortId, scope non-admin không bị lộ khi có `q`, từng kiểu sort.
- `route.test.ts`: validate tham số.
- `query-keys.test.ts`.

---

## Phase 2: Thanh thống kê đầu trang

### Backend
- Tách `buildProjectCondition(scope, projectKey)` khỏi `listSentryImports` thành hàm dùng chung, để thống kê tuân thủ đúng scope.
- Mới `src/lib/sentry/stats.ts`: `getSentryStats(scope, projectKey)` trả về:
  - `pendingReview`: số issue chờ duyệt.
  - `criticalPending`: số issue chờ duyệt thuộc tier critical (nếu khó đếm ở DB thì đếm trên tập đã lấy và ghi chú là số xấp xỉ).
  - `new24h`: `createdAt >= now - 24h`.
  - `noiseRatio`: `noise / tổng chờ duyệt`.
  - `byDay`: số issue mới theo ngày trong 7 ngày (`groupBy` trên `createdAt`, ngày không có dữ liệu = 0).
- Route `GET /api/sentry/stats`; key `sentryKeys.stats(project)`; prefetch trong [page.tsx](../src/app/(app)/sentry/page.tsx) như `list`.

### Frontend
- Component `sentry-stats.tsx`: 4 thẻ số liệu + sparkline 7 ngày. Loading bằng `Skeleton`.
- Bấm thẻ "Critical" thì chuyển sang filter review với view actionable.

### Test
- `stats.test.ts`: scope non-admin, ranh giới 24h, ngày trống trả 0.

---

## Phase 3: Cờ "tăng nóng" (spike)

### Schema (migration mới, cần duyệt)
```prisma
countBaseline   Int?
countBaselineAt DateTime?
```

### Logic
- `seedSentryIssue`: đọc dòng hiện tại (`findUnique`) trước khi upsert. Nếu `countBaselineAt` null hoặc cũ hơn 24h thì đặt `countBaseline` = `eventCount` đang lưu và `countBaselineAt = now`, rồi mới ghi snapshot mới. Cho cửa sổ trượt ~24h chỉ với 2 cột, không cần bảng lịch sử.
- `src/lib/sentry/spike.ts` (hàm thuần): `spikeOf({ eventCount, countBaseline, countBaselineAt })` → `{ delta, hot }`.
  - `hot` khi `delta >= 50` và `delta >= 50% baseline`; hoặc baseline = 0/null và `eventCount >= 50` (issue mới).
  - Ngưỡng là hằng số có tên, dễ chỉnh.
- [list.ts](../src/lib/sentry/list.ts): trả thêm `countDelta24h`; thêm sort `hot`.
- [triage.ts](../src/lib/sentry/triage.ts): `compareTriage` đẩy issue hot lên đầu trong cùng tier critical/normal; không đổi tier của noise.

### Frontend
- [sentry-row.tsx](../src/app/(app)/sentry/sentry-row.tsx): badge `+N/24h` với icon lucide `Flame`, tooltip giải thích cách tính.
- Thêm thẻ "Đang tăng nóng" vào thanh thống kê Phase 2.

### Test
- `spike.test.ts`: đủ các nhánh.
- `review-queue.test.ts`: baseline xoay đúng sau 24h, không bị ghi đè khi poll liên tiếp, issue mới.

### Rủi ro
Sau deploy, các dòng cũ chưa có baseline nên chưa có cờ nào trong 24h đầu. Chấp nhận được; ghi vào mô tả PR.


---

## 4. Quy trình thực thi

- Claude lập kế hoạch và review; phần code giao agy worker, mỗi phase một worker.
- Sau mỗi phase chạy lint, typecheck và test của dự án; chỉ merge khi tất cả pass.
- Không push, không deploy, không áp migration lên DB nếu chưa được developer duyệt.
- Chỉ commit khi developer yêu cầu.

## 5. Câu hỏi cần chốt

1. Ngưỡng tăng nóng (≥ 50 event và ≥ 50% trong 24h) có hợp lý với lưu lượng thực tế không?
2. Làm Phase 1 riêng hay gộp 1+2 trong một PR?
