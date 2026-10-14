# Kế hoạch — Cấu hình đồng bộ theo từng hạng mục cho mỗi dự án

> Mục tiêu: trên trang `/admin/sync`, admin chọn được **dự án nào đồng bộ những phần nào** (issue, comment, workflow, dev status, AI…), thay vì chỉ một công tắc bật/tắt toàn bộ như hiện nay.
> Liên quan: `docs/ADMIN_MONITOR_UI_PLAN.md` (mục 4, S1–S6 — nâng cấp UI trang sync). Hai kế hoạch làm song song được; kế hoạch này thay đổi phần dữ liệu + worker.
> **Trạng thái:** Đã hoàn thành triển khai toàn bộ **Phase 0–6** (commit `459f298` và `78e00dd`).

---

## 1. Hiện trạng

### Một công tắc duy nhất

- `JiraProject.syncEnabled` (`prisma/schema.prisma:867`) là cờ duy nhất. Tắt → mọi hình thức đồng bộ của dự án dừng (lịch, nút, webhook), dữ liệu cũ giữ nguyên và board hiện cảnh báo.
- Cổng chặn:
  - `isProjectSyncEnabled()` — `src/lib/jira/project-catalog.ts:152` (dùng ở `runPollJiraProject`, `poll-jira.ts:72`).
  - `listSyncEnabledProjectKeys()` — `project-catalog.ts:96` (dispatch, `reconcile-deleted-issues`, `detect-people-fields`).
  - `listSyncDisabledProjectKeys()` — `project-catalog.ts:131` (`sync-dev-status`, `poll-watched-issues`, webhook Jira).
- Bật lại → `toggleProjectSync()` xếp hàng một lượt đồng bộ bù (`src/lib/admin/project-sync.ts:131`). Có audit `project.sync_enable/disable`.

### Một lượt đồng bộ dự án làm những gì

Pipeline: `src/lib/queue/workers/jira-sync/runner.ts`

| Bước | Làm gì | Vị trí |
|------|--------|--------|
| Tải people fields | Thêm các trường người dùng tuỳ chỉnh vào truy vấn search | `runner.ts:48`, `fetch-page.ts:13` |
| Search issue theo trang | JQL theo cursor `updated`; danh sách field mặc định **có `comment`** | `fetch-page.ts`, `src/lib/jira/client.ts:43` |
| Lưu issue | `upsertIssue` + `notifyIssue` (báo watcher) | `persist-page.ts:44-52` |
| Lưu comment | Lấy comment kèm search; nếu bị cắt thì gọi thêm `getComments` **cho từng issue**; `notifyComment` cho comment mới | `persist-page.ts:59-91` |
| Workflow | `getProjectStatuses` → snapshot trạng thái, chạy **mỗi lượt** | `finalize-sync.ts:4-39` |
| Chốt lượt | Ghi cursor, xử lý issue biến mất khi full scan | `finalize-sync.ts:96`, `context.ts:29` |

### Các job nền khác liên quan đến dự án

| Job | Lịch | Hiện có lọc theo dự án? |
|-----|------|--------------------------|
| `poll-jira-dispatch` → `poll-jira-project` | theo `pollIntervalMs` | Có (`syncEnabled`) |
| `poll-watched-issues` | liên tục | Có (`listSyncDisabledProjectKeys`) |
| webhook Jira (issue, comment, issue_deleted) | sự kiện | Có (`webhooks/jira.ts:91-93`) |
| `sync-dev-status` | 5 phút | Có (`sync-dev-status.ts:39-43`) |
| `reconcile-deleted-issues` | 20 phút | Có (`listSyncEnabledProjectKeys`) — gọi Jira lấy toàn bộ key của dự án |
| `detect-people-fields` | 01:30 hằng ngày | Có (`listSyncEnabledProjectKeys`) |
| `capture-project-report-snapshots` | 00:15 hằng ngày | **Chỉ lọc `active`**, không xét `syncEnabled` (`src/lib/reports/snapshot-service.ts:27-31`) |
| `ai-score` | 10 phút | **Không** — quét `issueCache` toàn cục (`ai-score.ts:16`) |
| `stale-detect` | 30 phút | **Không** (`stale-detect.ts:27`) |
| `check-branches` | 5 phút | **Không** — quét repo Bitbucket, đối chiếu với toàn bộ `issueCache` (`check-branches.ts:24`) |
| `parse-comment-branches` | 5 phút | **Không** — đọc comment đã đồng bộ |
| `poll-pr-comments` | 15 phút | **Không** — theo repo/người dùng Bitbucket, không theo dự án |

---

## 2. Thiết kế hạng mục đồng bộ

### Nguyên tắc

1. **`syncEnabled` vẫn là công tắc tổng** = đồng bộ issue. Tắt tổng → mọi hạng mục dừng (giữ nguyên ngữ nghĩa hiện tại).
2. Khi tổng bật, mỗi **hạng mục** bật/tắt riêng. **Thiếu cấu hình = bật** → dự án hiện có không đổi hành vi sau khi deploy.
3. Danh sách hạng mục định nghĩa trong **code** (registry), không phải trong DB, kèm `dependsOn`.
4. Hạng mục con không bật được khi hạng mục cha tắt — kiểm tra ở **API**, không chỉ ở UI.
5. Lỗi đọc cấu hình hoặc dự án không có trong catalog → coi như **bật** (giống `isProjectSyncEnabled`).

### Bảng hạng mục

| Key | Tên hiển thị | Đồng bộ gì | Cổng chặn (nơi sửa) | Chi phí API tiết kiệm khi tắt | Phụ thuộc | Bật lại thì sao |
|-----|--------------|-----------|---------------------|-------------------------------|-----------|-----------------|
| *(tổng)* `syncEnabled` | Issue | Issue, trường cơ bản, cursor | như hiện tại | Toàn bộ | — | Xếp hàng đồng bộ bù (đã có) |
| `comments` | Bình luận | Comment issue + thông báo comment | `persist-page.ts:59`; bỏ `"comment"` khỏi field search của dự án; webhook `jira:issue_commented` (`webhooks/jira.ts:100`) | Payload search nhỏ hơn + bỏ các lệnh `getComments` từng issue | — | **Cần full sync** (cursor đã trôi qua các issue cập nhật trong lúc tắt). Phải **tắt thông báo** trong lượt bù — xem mục 4 |
| `workflow` | Trạng thái workflow | Snapshot status của dự án | `finalize-sync.ts:84` (`refreshWorkflow`) | 1 lệnh `getProjectStatuses`/lượt | — | Tự cập nhật ở lượt sau |
| `peopleFields` | Trường người dùng | Dò + đồng bộ các trường người tuỳ chỉnh | `runner.ts:48`, `detect-people-fields.ts:6` | Field search ít hơn + job dò hằng ngày | — | Cần full sync để điền lại giá trị (cần xác minh) |
| `deletions` | Đối soát issue đã xoá | Job `reconcile-deleted-issues` | `reconcile-deleted-issues.ts:35` | Search toàn bộ key dự án mỗi 20 phút | — | Tự chạy ở lượt sau. Webhook `issue_deleted` vẫn xử lý (rẻ) |
| `devStatus` | Dev status / nhánh / PR | `sync-dev-status`, `check-branches`, `parse-comment-branches` | `sync-dev-status.ts:39`; `check-branches.ts:24` và `parse-comment-branches` **lọc theo tiền tố mã issue** | Lệnh dev-panel Jira theo issue; Bitbucket thì **không giảm** (quét theo repo) | `parse-comment-branches` cần `comments` | Tự bắt kịp ở lượt 5 phút sau (cần xác minh với `sync-dev-status`) |
| `aiScore` | Ước lượng AI | Job `ai-score` | thêm điều kiện `projectKey` vào `ai-score.ts:17` | Gọi LLM | — | Tự chấm các issue chưa có điểm |
| `staleDetect` | Phát hiện issue đứng | Job `stale-detect` + nhắc nhở | thêm điều kiện `projectKey` vào `stale-detect.ts:28` | Không gọi API ngoài; giảm thông báo | — | Tự chạy lượt sau |
| `reportSnapshots` | Snapshot báo cáo | Job `capture-project-report-snapshots` | `snapshot-service.ts:27` (đồng thời sửa để xét `syncEnabled`) | Không gọi API ngoài | — | **Ngày bị bỏ lỡ mất luôn** (snapshot là theo thời điểm) — hộp xác nhận phải nói rõ |
| `notifications` | Thông báo watcher | `notifyIssue` / `notifyComment` từ sync + webhook | `persist-page.ts:48`, `:82`; webhook | Không | — | Chỉ thông báo cho thay đổi mới |

**Không đưa vào:** `poll-pr-comments` (theo repo/người dùng Bitbucket, không gắn được với dự án), `sentry-import`, `deliver-notifications`, `health-alert` (hệ thống).

### Preset để áp dụng nhanh

| Preset | Bật |
|--------|-----|
| **Đầy đủ** (mặc định) | tất cả |
| **Issue + bình luận** | `comments`, `workflow`, `peopleFields`, `deletions`, `notifications` |
| **Chỉ issue** | `workflow`, `deletions` |
| **Tuỳ chỉnh** | do admin chọn |

Preset được áp dụng cho 1 dự án hoặc nhiều dự án đã chọn (bulk).

---

## 3. Mô hình dữ liệu

### Lựa chọn khuyến nghị: cột JSON trên `JiraProject`

```prisma
model JiraProject {
  // ...
  syncEnabled  Boolean @default(true)
  syncFeatures Json    @default("{}") // { comments?: boolean, workflow?: boolean, ... } — thiếu key = bật
}
```

- Lý do: số dự án nhỏ (hàng chục), mỗi job chỉ cần nạp **một lần** toàn bộ cấu hình vào Map → không cần truy vấn theo hạng mục ở SQL.
- Phương án khác (bảng `JiraProjectSyncFeature(projectKey, feature, enabled)`) chỉ đáng khi cần lịch sử/truy vấn theo hạng mục — chưa cần.
- ⚠️ Đây là **Prisma migration** — file được bảo vệ theo `AGENTS.md`, cần developer duyệt trước khi tạo/apply. Migration chỉ thêm cột có default, không đụng dữ liệu cũ.

### Registry + helper (mới: `src/lib/jira/sync-features.ts`)

```ts
export const SYNC_FEATURES = {
  comments:        { label: "Bình luận",            dependsOn: [] },
  workflow:        { label: "Trạng thái workflow",  dependsOn: [] },
  peopleFields:    { label: "Trường người dùng",    dependsOn: [] },
  deletions:       { label: "Đối soát issue đã xoá", dependsOn: [] },
  devStatus:       { label: "Dev status / nhánh / PR", dependsOn: [] },
  aiScore:         { label: "Ước lượng AI",          dependsOn: [] },
  staleDetect:     { label: "Phát hiện issue đứng",  dependsOn: [] },
  reportSnapshots: { label: "Snapshot báo cáo",      dependsOn: [] },
  notifications:   { label: "Thông báo watcher",     dependsOn: [] },
} as const;
export type SyncFeature = keyof typeof SYNC_FEATURES;

/** Parse + chuẩn hoá JSON từ DB; key lạ bị bỏ, thiếu key = true. */
export function resolveSyncFeatures(raw: unknown): Record<SyncFeature, boolean>;

/** Nạp 1 lần / lượt job. Lỗi DB → Map rỗng (mọi dự án coi như bật). */
export async function loadSyncPolicy(): Promise<SyncPolicy>;
// policy.isEnabled(projectKey, feature) — dự án không có trong Map → true
// policy.disabledKeys(feature) — Set<projectKey> để đưa vào `NOT: { projectKey: { in } }`
```

- `isEnabled` trả `false` nếu `syncEnabled = false` hoặc `active = false` (tổng tắt → mọi hạng mục tắt).
- Phụ thuộc giữa hạng mục (`parse-comment-branches` cần `comments`) xử lý trong `isEnabled` cho phần job tương ứng, không cần cấu hình riêng.

---

## 4. Thay đổi phía worker

| # | File | Thay đổi |
|---|------|----------|
| W1 | `jira-sync/types.ts`, `context.ts` | Thêm `features` vào input pipeline; nạp ở `runPollJiraProject` cùng lúc với cổng `isProjectSyncEnabled` (đổi thành `loadSyncPolicy`) |
| W2 | `jira-sync/fetch-page.ts`, `jira/client.ts` | Cho phép truyền danh sách field; bỏ `"comment"` khi `comments` tắt; bỏ people fields khi `peopleFields` tắt |
| W3 | `jira-sync/persist-page.ts` | Bỏ khối comment khi `comments` tắt; bỏ `notifyIssue/notifyComment` khi `notifications` tắt **hoặc** khi lượt chạy có cờ `suppressNotifications` |
| W4 | `jira-sync/finalize-sync.ts` | Bỏ `refreshWorkflow` khi `workflow` tắt |
| W5 | `webhooks/jira.ts` | Sự kiện comment → kiểm `comments`; thông báo → kiểm `notifications` |
| W6 | `reconcile-deleted-issues.ts`, `detect-people-fields.ts` | Lọc theo `deletions` / `peopleFields` |
| W7 | `sync-dev-status.ts`, `check-branches.ts`, `parse-comment-branches.ts` | Lọc theo `devStatus` (2 job sau: lọc theo tiền tố mã issue khi ghi) |
| W8 | `ai-score.ts`, `stale-detect.ts` | Thêm `NOT: { projectKey: { in: policy.disabledKeys(...) } }` |
| W9 | `reports/snapshot-service.ts` | Chỉ chụp dự án `active && syncEnabled && reportSnapshots` |

**Backfill khi bật lại (quan trọng):**
- Bật lại `comments` hoặc `peopleFields` → xếp hàng **full sync** với `suppressNotifications: true` (thêm field này vào `PollJiraProjectJobData`). Hiện `notifyWatchersOfComment` (`src/lib/issues/notify-watchers.ts:162`) không có chặn theo tuổi comment → không chặn thì watcher sẽ nhận hàng loạt thông báo cho comment cũ.
- Các hạng mục còn lại tự bắt kịp ở lượt chạy kế tiếp, không cần backfill.
- Mẫu giống `toggleProjectSync()` hiện tại: bật lại → `enqueueJiraProjectSync(...)`.

---

## 5. API

| Route | Thay đổi |
|-------|----------|
| `GET /api/admin/projects` | Mỗi dòng thêm `features: Record<SyncFeature, boolean>` và `preset: "full" \| "issues_comments" \| "issues_only" \| "custom"` (suy ra) |
| `PATCH /api/admin/projects/[key]` | Nhận thêm `{ features?: Partial<Record<SyncFeature, boolean>> }` hoặc `{ preset }`. Validate: key lạ → 400; vi phạm `dependsOn` → 400. Trả thêm `backfillJobId` khi có hạng mục cần full sync |
| `PATCH /api/admin/projects` (bulk) | Nhận `{ keys: string[], preset }` để áp preset cho nhiều dự án |
| Audit | Action mới `project.sync_features_update`, ghi `before`/`after` là diff các hạng mục |

`syncEnabled` giữ nguyên hợp đồng cũ — client cũ không vỡ.

---

## 6. UI — `/admin/sync`

### Dòng dự án

```
ABC  Tên dự án  [Ổn định]  [Tuỳ chỉnh · 6/9]        [Đồng bộ] [Toàn bộ] [⚙ Cấu hình] (●──)
1 234 issue · thành công 2 phút trước
```

- Badge preset: "Đầy đủ" (ẩn cho gọn) / "Chỉ issue" / "Issue + bình luận" / "Tuỳ chỉnh · n/9".
- Nút **Cấu hình** (icon `SlidersHorizontal`) mở `Sheet` (đã có `src/components/ui/sheet.tsx`) bên phải.

### Sheet cấu hình dự án

```
Cấu hình đồng bộ — ABC
Preset: [Đầy đủ] [Issue + bình luận] [Chỉ issue] [Tuỳ chỉnh]   (SegmentedControl)

Dữ liệu Jira
  (●──) Bình luận                 Lấy comment và gửi thông báo comment
  (●──) Trạng thái workflow       Cập nhật danh sách trạng thái của dự án
  (●──) Trường người dùng         Dò và đồng bộ trường người tuỳ chỉnh
  (●──) Đối soát issue đã xoá     Quét định kỳ 20 phút

Phát triển
  (●──) Dev status / nhánh / PR   Cần "Bình luận" để đọc nhánh từ comment

Tự động hoá & báo cáo
  (●──) Ước lượng AI
  (●──) Phát hiện issue đứng
  (●──) Snapshot báo cáo          Tắt thì các ngày bỏ lỡ không chụp lại được
  (●──) Thông báo watcher

[Huỷ]                                  [Lưu thay đổi]
```

- Tái dùng `SyncSwitch` hiện có trong `admin-sync-client.tsx` (tách ra `src/components/shared/` nếu dùng ở 2 nơi).
- Mỗi hạng mục: nhãn + mô tả 1 dòng `text-xs text-muted-foreground`; khi bị chặn bởi phụ thuộc → switch `disabled` + dòng giải thích.
- Lưu theo nút (không lưu tức thì) để gom nhiều thay đổi → một audit, một lần backfill.
- Khi thay đổi khiến cần backfill hoặc mất dữ liệu (`reportSnapshots`) → `ConfirmDialog` liệt kê hệ quả trước khi lưu.
- Khi công tắc tổng tắt: Sheet hiện banner "Đồng bộ đang tắt — các hạng mục không có hiệu lực", switch vẫn chỉnh được (lưu sẵn cho lần bật lại).

### Bulk

- Thêm checkbox chọn dòng (`src/components/ui/checkbox.tsx` đã có) + thanh hành động "Áp preset…" cho các dự án đã chọn.
- KPI "Tuỳ chỉnh" mới bên cạnh 4 KPI hiện có; bấm để lọc (dùng `MetricCard onClick`, xem S2 trong `ADMIN_MONITOR_UI_PLAN.md`).

### Board

- Banner cảnh báo hiện tại (khi `syncEnabled = false`) mở rộng: dự án có hạng mục tắt → ghi chú nhẹ "Bình luận không được đồng bộ cho dự án này" ở nơi hiển thị comment (cần xác minh vị trí trong `src/app/(app)/board/`).

---

## 7. Lộ trình triển khai

| Phase | Nội dung | Trạng thái |
|-------|----------|------------|
| **0** | Duyệt danh sách hạng mục, preset và mô hình dữ liệu ở tài liệu này | **Đã hoàn thành** |
| **1** | Migration thêm `syncFeatures`; `sync-features.ts` (registry, `resolveSyncFeatures`, `loadSyncPolicy`) + unit test | **Đã hoàn thành** |
| **2** | Worker W1–W5 (pipeline + webhook) + `suppressNotifications` cho backfill | **Đã hoàn thành** |
| **3** | Worker W6–W9 (các job nền) | **Đã hoàn thành** |
| **4** | API GET/PATCH + validate phụ thuộc + audit + backfill khi bật lại | **Đã hoàn thành** |
| **5** | UI: badge preset, Sheet cấu hình, bulk preset, KPI "Tuỳ chỉnh" | **Đã hoàn thành** |
| **6** | Ghi chú trên board cho hạng mục bị tắt | **Đã hoàn thành** |

Toàn bộ các phase đã được commit ở `459f298` và tái cấu trúc mô-đun dùng chung ở `78e00dd`.

---

## 8. Kiểm thử

**Cập nhật test hiện có**
- `src/lib/queue/workers/poll-jira.test.ts` — cổng đổi từ `isProjectSyncEnabled` sang policy.
- `src/lib/queue/workers/jira-sync/pipeline.test.ts` — bỏ comment / workflow / notify theo hạng mục.
- `src/lib/queue/workers/process-webhook.test.ts` — webhook comment khi `comments` tắt.
- `src/lib/admin/project-sync.test.ts`, `src/app/api/admin/projects/route.test.ts` — hợp đồng API mới.
- `reconcile-deleted-issues.test.ts`, `poll-watched-issues.test.ts` — lọc theo policy.

**Test mới**
- `resolveSyncFeatures`: `{}` → tất cả `true`; key lạ bị bỏ; giá trị không phải boolean → `true`.
- `loadSyncPolicy`: lỗi DB → mọi dự án bật; `syncEnabled=false` → mọi hạng mục tắt.
- PATCH: vi phạm `dependsOn` → 400; bật lại `comments` → có `backfillJobId` và job mang `suppressNotifications: true`.
- Pipeline: `comments` tắt → `jira.search` không xin field `comment`, không gọi `getComments`.

**Kiểm tra cuối:** `npm run lint`, `npm run typecheck`, `npm test`.

---

## 9. Rủi ro & câu hỏi mở

- **Mất thông báo:** tắt `notifications` hoặc `comments` đồng nghĩa watcher không nhận cập nhật — Sheet phải nói rõ.
- **Bitbucket không giảm tải:** tắt `devStatus` chỉ bỏ ghi dữ liệu của dự án; `check-branches` / `poll-pr-comments` vẫn quét toàn bộ repo.
- **Dữ liệu cũ trên board:** comment/workflow cũ vẫn hiển thị sau khi tắt — chấp nhận (giống ngữ nghĩa `syncEnabled` hiện tại) hay ẩn? → cần developer quyết.
- **`reportSnapshots` hiện không xét `syncEnabled`:** sửa ở W9 sẽ làm dự án đang tắt đồng bộ ngừng có snapshot — cần xác nhận đây là hành vi mong muốn.
- **Full sync khi bật lại `comments`** có thể mất vài phút với dự án lớn — hiển thị trạng thái "Đang đồng bộ bù" trên dòng dự án.
