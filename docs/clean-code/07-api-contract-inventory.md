# API Contract Inventory

> Snapshot cho batch 1.1, ngày 2026-10-08.
>
> Phạm vi ưu tiên: Jira sync, Bulk Create, Issue Detail, Releases và Notifications.
> Tài liệu này mô tả contract hiện tại; không phải đề xuất thay đổi API.

## 1. Phạm vi và quy ước

- Đã kiểm kê 41 route files, 49 HTTP handlers và 50 contract flows. `POST /api/bulk/create` có hai flow dùng chung endpoint: preview và confirm.
- Mọi JSON success không ghi status riêng bên dưới mặc định là `200`.
- Lỗi session phổ biến: `401 { error: "unauthorized" }`.
- Route cần Jira credential cá nhân thường trả `428 { error, code: "jira_credentials_required" }`. Worklog dùng code `JIRA_CREDENTIALS_REQUIRED`.
- `ErrorResponse` hiện chưa thống nhất: `{ error: string, code?: string, message?: string, detail?: string, result?: unknown }`.
- Date từ Prisma được JSON serialize thành ISO string. Các DTO ghi `ISODate` bên dưới có nghĩa là chuỗi ISO-8601.
- Cột “Consumer” chỉ ghi production consumer tìm thấy bằng static search; “chưa thấy” không khẳng định endpoint không có caller bên ngoài.

## 2. Jira Sync

| Method + route | Request DTO | Success response DTO | Status contract | Consumer |
|---|---|---|---|---|
| `POST /api/sync/jira` | `JiraSyncRequest`: body `{ projectKey?: string; full?: boolean }`; thiếu key chỉ admin được dispatch all | `JiraSyncAccepted`: `{ state: "queued" \| "already_running"; queued; jobId: string \| null; projectKey: string \| null; full; acceptedAt }` | `202`; `400 unknown_project/project_required`; `401`; `503 queue_unavailable` | `board/lib/board-hooks.ts` |
| `GET /api/sync/jira/active` | Không có | `ActiveJiraSyncResponse`: `{ syncingProjects: string[]; activeSyncs: { projectKey; startedAt: ISODate \| null }[]; timestamp }` | `200`; `401`; `500 { error: "internal_error", message }` | `hooks/use-active-sync.ts` |
| `GET /api/sync/jira/status` | Query `{ projectKey: string; since?: ISODate }` | `JiraSyncStatusResponse`: `{ projectKey; state: "queued" \| "running" \| "succeeded" \| "failed" \| "unknown"; lastStartedAt; lastSuccessAt; lastErrorAt; lastError }` | `200`; `400 missing_project_key/invalid_project_key`; `401` | `board/lib/board-hooks.ts` |

Contract tests: cả 3 route files có test. `ActiveJiraSyncResponse` hiện được export từ route và import bởi client; đây là đầu vào trực tiếp cho batch 1.2.

## 3. Bulk Create

### 3.1 Contract chính

| Method + route | Request DTO | Success response DTO | Status contract | Consumer |
|---|---|---|---|---|
| `POST /api/bulk/create` — preview | `BulkCreateRequest` | `BulkCreatePreviewResult` | `200`; `400` validation/Jira request; `401`; `428` | `bulk-create-client.tsx`; `bulk/create/contract.test.ts` |
| `POST /api/bulk/create` — confirm | `BulkCreateConfirmRequest`: `{ confirm: true; operationId: string }` | `{ operationId; total; actionable; blocked; queued }` | `200`; `400`; `401`; `404` operation missing; `409` already confirmed; `428` | `bulk-create-client.tsx`; `bulk/create/contract.test.ts` |
| `GET /api/bulk/create/metadata` | Query `{ project: string }` | `BulkCreateProjectMetadata` | `200`; `400`; `401`; `428`; Jira status hoặc `500` | `bulk-create-client.tsx` |

`BulkCreateRequest`, `BulkCreatePreviewResult`, `BulkCreateConfirmRequest` và `BulkCreateProjectMetadata` đã nằm ở `src/lib/bulk/create-types.ts`, đúng dependency direction.

### 3.2 Lookup, template và import

| Method + route | Request DTO | Success response DTO | Status contract | Consumer |
|---|---|---|---|---|
| `GET /api/bulk/create/assignees` | Query `{ project; q?: string; limit?: 1..50 }` | `{ users: { id; username; displayName; avatar? }[] }` | `200`; `400`; `401`; `428`; Jira status hoặc `500` | `assignee-combobox.tsx` |
| `GET /api/bulk/create/labels` | Query `{ project; q?: string; limit?: 1..50 }` | `{ labels: string[] }` | `200`; `400`; `401`; `500` | `label-combobox.tsx` |
| `GET /api/bulk/create/parents` | Query `{ project; q?: string; limit?: 1..50 }` | `{ issues: { key; summary; issueTypeName; status }[] }` | `200`; `400`; `401`; `428`; Jira status hoặc `500` | `parent-combobox.tsx`; `bulk-epic-input.tsx` |
| `GET /api/bulk/create/templates` — search | Query `{ project; q?: string; limit?: 1..30 }` | `{ issues: BulkCreateTemplateIssueItem[] }` | `200`; `400`; `401`; `428`; Jira status hoặc `500` | `jira-template-dialog.tsx` |
| `GET /api/bulk/create/templates` — detail | Query `{ project; issueKey }` | `{ template: BulkCreateTemplateRow }` | `200`; `400`; `401`; `403`; `404`; `428`; Jira status hoặc `500` | `jira-template-dialog.tsx` |
| `POST /api/bulk/create/excel-import` | `multipart/form-data`: `file=.xlsx`, `project` form/query | `BulkCreateExcelImportResponse`: `{ items; manifest; isStaleMetadata; projectKeyMatch; fileProjectKey; stats; errors; warnings }` | `200`; `400`; `401`; `422` parse failure | `csv-import-dialog.tsx` |
| `GET /api/bulk/create/excel-template` | Query `{ project }` | XLSX binary; headers `Content-Type`, `Content-Disposition`, `Cache-Control` | `200`; `400`; `401`; `403`; `428`; Jira status hoặc `500` | `bulk-create-editor-shell.tsx`; `csv-import-dialog.tsx` |

`BulkCreateTemplateRow` và `BulkCreateTemplateIssueItem` hiện được export từ route và import trực tiếp bởi `jira-template-dialog.tsx`; batch 1.2 phải chuyển chúng sang shared contract và giữ re-export tương thích nếu cần.

Route-test coverage: `route`, `templates`, `excel-import`, `excel-template` có test; `metadata`, `assignees`, `labels`, `parents` chưa có colocated route test.

## 4. Issue Detail

### 4.1 Issue, workflow và comment

| Method + route | Request DTO | Success response DTO | Status contract | Consumer |
|---|---|---|---|---|
| `GET /api/issues/[key]` | Path `{ key }` | `{ issue: IssueView }` | `200`; `401`; `404` | Issue detail, Board quick panel |
| `PATCH /api/issues/[key]` | `IssuePatchRequest`: optional summary, description, assignee, labels, priority, points, fix versions, issue type, due date, epic và people fields | `{ ok: true; cacheSynced: boolean }` | `200`; `400`; `401`; `428`; `502` | `use-issue-detail`, Board actions/quick panel, Stale quick edit, Release task flows |
| `GET /api/issues/[key]/transitions` | Path `{ key }` | `{ transitions: JiraTransition[] }`; không có auth Jira trả mảng rỗng | `200`; `401`; `502` | Issue detail, Board hooks/quick panel/list |
| `POST /api/issues/[key]/transition` | `{ transitionId: string }` | `{ ok: true; cacheSynced: boolean }` | `200`; `400`; `401`; `403 permission`; `409 workflow`; `428`; `502 upstream` | `use-issue-detail`, Board actions/quick panel |
| `GET /api/issues/[key]/versions` | Path `{ key }` | `{ items: JiraVersion[] }`; không có Jira auth trả mảng rỗng | `200`; `401`; `502` | Issue detail, Board quick panel/list, Stale quick edit |
| `POST /api/issues/[key]/comments` | `{ body: string }` | `{ ok: true; comment: { author; body } }` | `200`; `400`; `401`; `428`; `502` | `use-issue-detail`, Board quick panel |
| `GET /api/issues/[key]/dependencies` | Query `{ depth?: "direct" \| "recursive" }` | `DependencyGraphResponse`: `{ roots; issues; edges; cycles; truncated; missingKeys }` | `200`; `401` | `components/issue-dependencies.tsx` |
| `POST /api/issues/[key]/watch` | Path `{ key }`, body không dùng | `{ watching: boolean }` | `200`; `401` | `use-issue-detail`, Board quick panel, Watch page |

### 4.2 Branch, AI và worklog

| Method + route | Request DTO | Success response DTO | Status contract | Consumer |
|---|---|---|---|---|
| `GET /api/issues/[key]/branches` | Query `{ sync?: "true" }` | `{ items: BranchInfo[]; suggestedItems: BranchInfo[]; bitbucketBaseUrl: string \| null }` | `200`; `401`; `404` | `use-issue-detail`, Issue detail, Board quick panel |
| `POST /api/issues/[key]/branches` | `BranchParams`: `{ repo?; base?; nameTemplate?; comment? }` | `{ ok: true; branch; repo }` | `200`; `400`; `401`; `428` Jira/Bitbucket credential | `use-issue-detail` |
| `POST /api/issues/[key]/branches/sync` | Path `{ key }` | `{ ok: true; syncedBranches; count }` | `200`; `400`; `401`; `428` | Issue detail |
| `POST /api/issues/[key]/ai-score` | Path `{ key }` | `{ suggestedPoints; confidence; reasoning; missingInformation; risks; similarTasks; model }` | `200`; `400` provider config; `401`; `404`; `503 unavailable` | `use-issue-detail` |
| `POST /api/issues/[key]/ai-score/decision` | `{ decision: "accepted" \| "edited" \| "rejected"; points?: number \| null }` | `{ ok: true; decision; finalPoints; jiraWritten }` | `200`; `400`; `401`; `404`; `428`; `502` | `use-issue-detail` |
| `POST /api/issues/[key]/worklogs` | `CreateWorklogInput`: `{ timeSpent; startedAt; comment?; adjustEstimate?: "leave"; idempotencyKey }` | `CreateWorklogResult`: `{ jiraKey; jiraWorklogId; timeSpentSeconds; cacheSynced; duplicate }` | `201` created; `200` idempotent replay; `400`; `401`; `403`; `409`; `428`; `502`; `504` | `use-issue-detail` |

Route-test coverage: branches, branch sync và worklogs có test. Các issue-detail route còn lại dựa chủ yếu vào higher-level/unit coverage và chưa có colocated contract test.

## 5. Releases

| Method + route | Request DTO | Success response DTO | Status contract | Consumer |
|---|---|---|---|---|
| `GET /api/releases` | Query `{ projectKey?; readiness?; includeArchived?: "true" }` | `ReleaseListResponse`: `{ summary; items: EvaluatedRelease[]; jiraBaseUrl; sync }` | `200`; `401`; `403 forbidden_project` | `release-client.tsx` |
| `POST /api/releases` | `{ projectKey?; jiraVersionId?; version; description?; targetLabel?; notes? }` | `{ release }` | `200`; `400`; `401`; `403`; `404`; `428`; `502` | `hooks/use-releases.ts` |
| `POST /api/releases/sync` | Query `{ projectKey?: string }` | `{ success: true; result: ReleaseSyncResult; partial: boolean }` | `200`; `401`; `403`; `404`; `428`; `500`; `502` | `hooks/use-releases.ts` |
| `GET /api/releases/[id]` | Path `{ id }` | `{ item: EvaluatedReleaseDetail }` | `200`; `401`; `404` | Chưa thấy production caller trực tiếp |
| `PATCH /api/releases/[id]` | `{ notes?: string; description?: string }` | `{ ok: true; item: Release }` | `200`; `401`; `403`; `404` | `hooks/use-releases.ts` |
| `GET /api/releases/[id]/versions` | Path `{ id }`; query `{ projectKey? }`; `id=tmp` hỗ trợ create flow | `{ items: JiraVersion[] }` | `200`; `401`; `404`; `428`; `502` | Chưa thấy production caller trực tiếp |
| `GET /api/releases/[id]/checks` | Query `{ limit?: 1..100; offset?: >=0 }` | `{ releaseId; total; limit; offset; checks: ReleaseCheck[] }` | `200`; `401`; `404` | Chưa thấy production caller trực tiếp |
| `POST /api/releases/[id]/ready` | Path `{ id }` | `{ status; ready; gates; blockers; checkId; tasks; dependencyGraph }` | `200`; `401`; `403`; `404`; `500` | Chưa thấy production caller trực tiếp; route test có |
| `POST /api/releases/[id]/release` | Path `{ id }` | Idempotent `{ ok; released; already; releasedAt? }` hoặc `{ ok; released; already: false; release }` | `200`; `401`; `403`; `404`; `409`; `428`; `500`; `502` | `hooks/use-releases.ts` |
| `POST /api/releases/[id]/approvals` | `{ type?: "qa" \| "release_manager"; note?: string }` | `{ approval }` | `200`; `400`; `401`; `403`; `404` | Chưa thấy production caller trực tiếp |
| `DELETE /api/releases/[id]/approvals` | Query `{ approvalId }` | `{ ok: true }` | `200`; `400`; `401`; `403`; `404` | Chưa thấy production caller trực tiếp |
| `POST /api/releases/[id]/overrides` | `{ gate; reason; expiresAt?: ISODate }` | `{ override }` | `200`; `400`; `401`; `403`; `404` | Chưa thấy production caller trực tiếp |
| `DELETE /api/releases/[id]/overrides` | Query `{ overrideId }` | `{ ok: true }` | `200`; `400`; `401`; `403`; `404` | Chưa thấy production caller trực tiếp |

Route-test coverage: root list/create, detail/update, ready, release và sync có test. Versions, checks, approvals và overrides chưa có colocated route test.

## 6. Notifications, Push và Watch

| Method + route | Request DTO | Success response DTO | Status contract | Consumer |
|---|---|---|---|---|
| `GET /api/notify` | Query `{ limit?: 1..100; unreadOnly?: "1" \| "true"; type?; cursor? }` | `NotificationResponse`: `{ items; unreadCount; nextCursor }` | `200`; `401` | Notifications page |
| `DELETE /api/notify` | `{ ids?: string[]; allRead?: boolean; all?: boolean }` | `{ ok: true; unreadCount }` | `200`; `400`; `401` | `hooks/use-notifications.ts` |
| `POST /api/notify/mark-read` | `{ ids?: string[]; all?: boolean; before?: ISODate; unread?: boolean }` | `{ ok: true; unreadCount }` | `200`; `400`; `401` | `hooks/use-notifications.ts` |
| `GET /api/notify/unread-count` | Không có | `{ unread: number }` | `200`; `401` | `hooks/use-notifications.ts` |
| `GET /api/notify/preferences` | Không có | `NotificationPreferences` | `200`; `401` | Settings notification preferences |
| `PATCH /api/notify/preferences` | Partial `{ disabledTypes; pushEnabled; pushDisabledTypes; deliveryMode; digestHour }` | `NotificationPreferences` | `200`; `400`; `401` | Settings hooks/components |
| `GET /api/notify/stream` | SSE request; abort signal closes subscription | `text/event-stream`: `ready`, `changed`, heartbeat | `200`; `401` empty body | `components/notification-events.tsx` |
| `GET /api/push/vapid` | Không có | `{ publicKey: string \| null }` | `200`; `401` | `hooks/use-web-push.ts` |
| `POST /api/push/subscribe` | `{ subscription?: PushSubscriptionJSON; unsubscribe?: boolean }` | `{ ok: true }` | `200`; `400`; `401` | `hooks/use-web-push.ts` |
| `POST /api/push/test` | Không có | `{ ok: true }` | `200`; `400`; `401`; `502` | `hooks/use-web-push.ts` |
| `GET /api/watch` | Không có | `{ items: WatchedIssue[] }` | `200`; `401` | Watch page |

Route-test coverage: notification list/delete, preferences và SSE có test. Mark-read, unread-count, push routes và watch list chưa có colocated route test.

## 7. Consumer và ownership findings

### Dependency-direction violations đã xác nhận tại batch 1.1

| Consumer | Import tại batch 1.1 | Contract cần chuyển ở batch 1.2 |
|---|---|---|
| `src/hooks/use-active-sync.ts` | `@/app/api/sync/jira/active/route` | `ActiveJiraSync`, `ActiveJiraSyncResponse` |
| `src/app/(app)/bulk/create/jira-template-dialog.tsx` | `@/app/api/bulk/create/templates/route` | `BulkCreateTemplateRow`, `BulkCreateTemplateIssueItem` |

Đích đến: contract thuần đặt theo domain trong `src/lib/contracts/`; route có thể re-export tạm thời để giữ compatibility, nhưng UI/hook không import từ `src/app/api`.

Trạng thái sau batch 1.2: cả hai consumer đã chuyển sang `src/lib/contracts/`; route giữ type re-export tương thích và production import scan không còn import từ `@/app/api/**/route`.

### Contract đang bị định nghĩa lặp ở client

- Notification list/preferences có client-local types gần trùng response route.
- Release list/sync/publish có client-local types và một số response dùng structural typing tại call site.
- Issue detail/transitions/versions/branches dùng nhiều inline generic types tại consumer.
- Jira sync status response đang được khai báo inline trong Board hook.

Các mục này là inventory để định hướng; batch 1.1 không hợp nhất hay đổi type.

## 8. Test coverage và ưu tiên khóa contract

- 18/41 route files trong phạm vi có colocated route test; 23/41 chưa có.
- Trước khi refactor từng route chưa có test, cần khóa tối thiểu: auth failure, validation/permission failure, success JSON/status và provider failure quan trọng.
- Ưu tiên gần nhất cho Phase 1.2: sync active và bulk template vì đang vi phạm dependency direction.
- Ưu tiên characterization theo rủi ro cho các phase sau: issue mutation/workflow, release approvals/overrides/check history, notification mark/delete và Bulk Create lookup metadata.

## 9. Bất biến cho các batch sau

- Không đổi path, method, query/body key, status, response field, header hoặc cookie đã ghi ở inventory này nếu không có batch contract-change riêng.
- Giữ personal Jira credential cho mutation; không fallback sang system account ở các route hiện yêu cầu `428`.
- Giữ `202` cho enqueue Jira sync, `201/200` cho create/replay worklog, và các `409` idempotency/readiness/workflow.
- Giữ XLSX response headers và SSE headers/event payload.
- Khi di chuyển type, contract module không import Next.js, Prisma runtime hoặc route implementation.
