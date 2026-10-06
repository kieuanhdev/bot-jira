# Kế hoạch triển khai các hạng mục chưa hoàn thiện

> Dự án: Team Task Web  
> Phiên bản kế hoạch: 1.0  
> Ngày lập: 2026-09-23  
> Phạm vi: Các hạng mục đang ở trạng thái “đã có code nhưng chưa vận hành end-to-end” hoặc còn thiếu nghiệp vụ để dùng production  
> Tổng ước lượng: 9–13 ngày công, chưa tính 1–2 tuần shadow/pilot

## 1. Mục tiêu

Đưa các hạng mục chưa hoàn thiện về trạng thái có thể pilot và tiến tới production:

- Worker nền chạy liên tục và có cảnh báo khi dừng.
- Sentry tự tạo đúng Jira issue, đúng project và không trùng lặp.
- Bitbucket cung cấp dữ liệu branch/PR thật cho release gate.
- Discord, Web Push và Watch hoạt động end-to-end.
- Release manager có thể kiểm tra và thực sự release Jira Fix Version từ web.
- CI và manual approval tham gia vào release gate.
- AI estimation được pilot, đo chất lượng và chỉ bật tự động khi đạt tiêu chí.
- Mọi mutation quan trọng có RBAC, audit, metrics và runbook xử lý sự cố.

Kế hoạch này không thay đổi nguyên tắc kiến trúc hiện tại:

- Jira vẫn là source of truth cho issue, workflow, assignee, story point và Fix Version.
- Bitbucket là source of truth cho branch và pull request.
- Sentry là source of truth cho lỗi runtime.
- CI là source of truth cho build/test status.
- PostgreSQL là read model, queue storage và nơi lưu metadata riêng của Team Task Web.
- AI chỉ đưa ra gợi ý, không tự quyết định release và không tự ghi point nếu chưa có người xác nhận.

## 2. Hiện trạng tại thời điểm lập kế hoạch

### 2.1 Mã nguồn

- Unit test: 249/249 pass.
- TypeScript typecheck: pass.
- Production build: pass.
- Source lint trên `src`, `scripts`, `prisma`: pass.
- `npm run lint` toàn workspace chạy quá lâu; cần xác minh lại phạm vi ignore `.next`.
- Database có 16 migration và đang up to date.

### 2.2 Dữ liệu và vận hành

| Dữ liệu | Số lượng |
|---|---:|
| Jira issue cache | 6.901 |
| Stale snapshot | 418 |
| Release | 0 |
| Branch/PR cache | 0 |
| Sentry import | 0 |
| AI score | 0 |
| Watch | 0 |

Worker nền không chạy tại thời điểm kiểm tra. Jira sync cuối đã cũ khoảng 14,5 giờ. Jira và AI đã có cấu hình cơ bản; Bitbucket thiếu danh sách repository; Sentry, Discord, Web Push và webhook chưa đủ cấu hình để xác nhận end-to-end.

## 3. Trạng thái đích và Definition of Done

Một hạng mục chỉ chuyển sang màu xanh khi thỏa toàn bộ điều kiện:

1. Có implementation đầy đủ cho backend, worker và UI liên quan.
2. Có cấu hình thật trên môi trường staging/pilot.
3. Có dữ liệu thật chứng minh luồng hoạt động.
4. Unit test và integration test pass.
5. Có ít nhất một kịch bản end-to-end pass.
6. Có log, metrics hoặc audit đủ để điều tra lỗi.
7. Có hành vi fail-safe khi integration unavailable.
8. Có hướng rollback hoặc retry an toàn.
9. Không để lộ token, password, comment hoặc description nhạy cảm trong log.
10. Tài liệu cấu hình và runbook được cập nhật.

## 4. Thứ tự triển khai tổng thể

```text
Pha 1: Worker + cấu hình + health
   ↓
Pha 2: Bitbucket + Sentry + Discord/Push/Watch
   ↓
Pha 3: RBAC + release execution + approval + CI gate
   ↓
Pha 4: Audit + observability + AI pilot + E2E
   ↓
Shadow mode 1–2 tuần
   ↓
Pilot release thật trên một project
```

Không triển khai release thật trước khi worker, freshness alert và RBAC hoàn thành.

---

## 5. Pha 1 — Nền tảng vận hành

**Ưu tiên:** P0  
**Ước lượng:** 1–2 ngày  
**Kết quả:** Worker chạy ổn định, cấu hình nhất quán và có cảnh báo freshness.

### OPS-01 — Chạy worker liên tục

#### Phạm vi

- Khởi động service `worker` từ `compose.yaml`.
- Xác minh `restart: unless-stopped` hoạt động.
- Xác minh pg-boss tự đăng ký lại schedule sau restart.
- Xác minh các job sau có heartbeat:
  - `poll-jira`
  - `check-branches`
  - `parse-comment-branches`
  - `ai-score`
  - `sentry-import`
  - `stale-detect`
  - `deliver-notifications`
- Không chạy worker ngầm bên trong web process.

#### File dự kiến ảnh hưởng

- `compose.yaml`
- `src/worker.ts`
- `src/lib/queue/boss.ts`
- `src/app/api/health/route.ts`
- `.env.example`
- `README.md`

#### Công việc chi tiết

1. Chuẩn hóa biến môi trường của worker.
2. Thêm worker heartbeat vào `IntegrationCursor` hoặc model riêng nếu cần.
3. Mỗi job ghi:
   - `lastStartedAt`
   - `lastSuccessAt`
   - `lastErrorAt`
   - `lastError`
   - duration
   - item count
4. Health endpoint phân loại:
   - `healthy`: job gần nhất trong SLA.
   - `degraded`: job lỗi hoặc cursor sắp quá hạn.
   - `down`: worker heartbeat mất quá 2 phút.
5. Thêm graceful shutdown và xác minh job đang chạy không bị claim trùng sau restart.

#### Tiêu chí nghiệm thu

- Jira cursor cập nhật tối thiểu mỗi 1–2 phút.
- Notification delivery chạy mỗi phút.
- Stale detector chạy mỗi 30 phút.
- Restart worker không làm mất job.
- Hai worker vô tình chạy đồng thời không xử lý trùng singleton job.
- Health API phát hiện worker dừng trong không quá 2 phút.

### OPS-02 — Chuẩn hóa cấu hình và secret

#### Phạm vi

Không để cấu hình của `web` và `worker` lệch nhau. Không hardcode secret production trong compose.

#### Ma trận cấu hình bắt buộc

| Nhóm | Web | Worker |
|---|---:|---:|
| Database | Bắt buộc | Bắt buộc |
| Jira read/mutation | Bắt buộc | Bắt buộc |
| Credential encryption | Bắt buộc | Nếu worker đọc credential cá nhân |
| Bitbucket | Có | Bắt buộc cho sync |
| Sentry | Có | Bắt buộc cho import |
| LLM | Có | Bắt buộc nếu auto-score |
| VAPID | Public/private theo vai trò | Private key để gửi push |
| Discord | Webhook receive | Outbound delivery |
| Webhook secrets | Bắt buộc trên web | Không bắt buộc nếu worker chỉ đọc event đã verify |

#### Công việc chi tiết

- Bổ sung các biến còn thiếu vào `compose.yaml`.
- Dùng `.env.production`, Podman secret hoặc secret manager của môi trường triển khai.
- Thêm validation lúc startup cho biến bắt buộc.
- Error chỉ ghi tên biến bị thiếu, không ghi giá trị.
- Viết tài liệu rotate Jira, Bitbucket, Sentry, Discord, VAPID và encryption key.
- Không rotate `CRED_ENCRYPTION_KEY` nếu chưa có quy trình re-encrypt credential người dùng.

#### Tiêu chí nghiệm thu

- Web và worker cùng đọc một nguồn cấu hình production.
- Startup fail-fast nếu thiếu database hoặc Jira config bắt buộc.
- Integration optional trả `not_configured`, không giả thành success.
- Không có secret thật trong git diff hoặc log.

### OPS-03 — Health alert và freshness alert

#### Công việc chi tiết

- Cảnh báo khi Jira sync quá 5 phút.
- Cảnh báo khi Bitbucket/Sentry quá freshness SLA.
- Cảnh báo khi outbox pending quá 10 phút.
- Cảnh báo khi một job lỗi 3 lần liên tiếp.
- Hiển thị banner trên UI khi dữ liệu chung bị stale.
- Gửi notification cho admin qua in-app; thêm Discord khi đã cấu hình.
- Dedupe alert để không spam mỗi phút.

#### Tiêu chí nghiệm thu

- Dừng worker trong staging tạo đúng một cảnh báo.
- Khởi động lại worker và có recovery notification.
- Release gate trả `unknown` khi dữ liệu bắt buộc quá cũ.

---

## 6. Pha 2 — Kích hoạt integration thật

**Ưu tiên:** P0/P1  
**Ước lượng:** 3–4 ngày  
**Kết quả:** Có dữ liệu Bitbucket, Sentry, notification và chat thật.

### INT-01 — Bitbucket branch/PR sync

#### Phạm vi

- Cấu hình `BITBUCKET_REPOS`.
- Đồng bộ branch và PR từ Bitbucket Data Center.
- Dùng Jira comment parser làm fallback, không thay thế hoàn toàn Bitbucket API.

#### Công việc chi tiết

1. Xác nhận format repo slug theo Bitbucket hiện tại.
2. Xác minh token có quyền:
   - list branch
   - đọc pull request
   - tạo branch nếu dùng bulk action
3. Chạy full sync ban đầu.
4. Lưu rõ:
   - repo
   - branch
   - Jira key
   - PR id
   - PR state
   - destination branch
   - merged flag
   - checked time
5. Mapping branch → Jira task ưu tiên:
   - `BranchInfo.jiraKey` được tạo khi web tạo branch.
   - Jira key trong branch name.
   - Link/comment có cấu trúc.
6. Commit và đưa `parse-comment-branches` vào baseline chính thức.
7. Trang Branches hiển thị sync time và integration state.

#### Chính sách trạng thái

| Trạng thái | Kết quả |
|---|---|
| MERGED vào đúng base/release branch | Passed |
| OPEN | Failed hoặc blocker theo release policy |
| CLOSED nhưng không merged | Failed |
| DECLINED | Failed |
| Không có PR | Failed |
| Không đọc được Bitbucket | Unknown |
| Chỉ có Jira comment nhưng thiếu trạng thái mới nhất | Unknown hoặc advisory có giải thích |

#### Test bắt buộc

- MERGED vào đúng destination được tính merged.
- MERGED vào sai destination không được pass.
- CLOSED/DECLINED không được tính merged.
- Không có token hoặc API timeout trả `unknown`.
- Parser Jira comment xử lý created, updated, merged, closed, declined.

#### Tiêu chí nghiệm thu

- Database có branch/PR thật của ít nhất một repo pilot.
- Branch page khớp dữ liệu Bitbucket.
- Release có PR chưa merge không thể thành `ready`.

### INT-02 — Sentry import đúng project và không trùng

#### Vấn đề hiện tại

Worker đã có idempotency, nhưng import đang tạo issue vào `jiraProjectList[0]`. Cấu hình hiện tại chỉ hỗ trợ tốt một Sentry project và chưa có luồng import ngay từ webhook.

#### Thiết kế cấu hình đề xuất

```env
SENTRY_PROJECT_MAPPINGS=mobile-app:EPM,employee-app:MHRM
```

Nếu có nhiều organization hoặc environment, chuyển sang JSON config hoặc model database:

```json
[
  {
    "sentryOrg": "mobile",
    "sentryProject": "mobile-app",
    "jiraProject": "EPM",
    "issueType": "Bug",
    "labels": ["sentry", "mobile"],
    "environment": ["production"]
  }
]
```

#### Công việc chi tiết

1. Parse và validate project mapping lúc startup.
2. Webhook Sentry enqueue import ngay, không chỉ gửi alert.
3. Scheduled poll tiếp tục làm reconciliation mỗi 5 phút.
4. Dùng `(sentryProject, sentryIssueId)` làm idempotency key.
5. Trước khi tạo Jira issue:
   - kiểm tra mapping table
   - kiểm tra Jira label `sentry-id-*`
6. Map severity:
   - fatal → Blocker/Critical theo policy team
   - error regression → Critical/Major theo policy
   - error thông thường → Major hoặc default
7. Ghi vào Jira description:
   - permalink
   - level
   - count
   - first/last seen
   - environment/release nếu có
8. Thêm admin API/UI để xem import pending/failed và retry.
9. Khi đủ max attempts, gửi alert có Sentry ID và lỗi rút gọn.

#### Xử lý idempotency/crash

```text
Nhận event
  → claim/create mapping pending
  → tìm Jira issue qua mapping hoặc label
  → nếu đã tồn tại: recover mapping
  → nếu chưa tồn tại: tạo Jira issue
  → ghi jiraKey + state=created
```

Nếu Jira tạo thành công nhưng database update thất bại, lần retry phải tìm lại issue qua label trước khi tạo mới.

#### Test bắt buộc

- Cùng event gửi hai lần chỉ tạo một Jira issue.
- Webhook và poll gặp cùng issue chỉ tạo một Jira issue.
- Worker crash sau Jira create được phục hồi bằng label.
- Hai Sentry project đi đúng hai Jira project.
- Project không có mapping bị đưa vào failed/ignored rõ ràng.
- Token lỗi không tạo issue thiếu dữ liệu.

#### Tiêu chí nghiệm thu

- Sentry issue production mới xuất hiện trên Jira trong dưới 2 phút.
- Không có duplicate trong test retry, webhook redelivery và worker restart.
- Có audit trail từ Sentry issue sang Jira key.

### INT-03 — Discord command end-to-end

#### Công việc chi tiết

- Cấu hình bot token, channel ID và webhook secret.
- Public webhook bắt buộc HTTPS.
- Link Discord user với user trong web.
- Xác minh command chạy bằng Jira credential của user đã link.
- Test các command:
  - `/task`
  - `/move`
  - `/assign`
  - `/watch`
  - `/unwatch`
  - `/release <version> check`
  - `/stale`
  - `/confirm`
- Không cho câu lệnh mơ hồ thực hiện mutation.
- Multi-task mutation phải preview và confirm.
- Gắn correlation ID từ inbound message đến audit/Jira call.

#### Test bắt buộc

- Chữ ký webhook sai trả 401.
- User chưa link không chạy mutation.
- Jira 403 trả trạng thái blocked.
- `/move` nhiều task không chạy trước `/confirm`.
- Confirmation hết hạn không chạy được.
- Discord retry không tạo mutation trùng.

#### Tiêu chí nghiệm thu

- Một user pilot chuyển trạng thái Jira thành công từ Discord.
- Có ChatMessage/audit record cho toàn bộ command.
- Kết quả lỗi hiển thị dễ hiểu, không lộ token hoặc raw upstream response nhạy cảm.

### INT-04 — Web Push và Watch comment

#### Công việc chi tiết

- Tạo VAPID key production.
- Serve qua HTTPS.
- Xác minh service worker đăng ký đúng scope.
- Kiểm tra notification preference instant/digest.
- Jira comment webhook và poll fallback cùng gọi một luồng dedupe.
- Không gửi lại notification cho chính tác giả comment nếu map được identity.
- Dọn push subscription khi provider trả 404/410.

#### Test bắt buộc

- Comment trực tiếp trên Jira tạo đúng một notification.
- Cùng comment đến từ webhook và poll không gửi trùng.
- Tắt event type `comment` thì không tạo delivery.
- User không có push subscription vẫn nhận in-app notification.
- Push subscription expired được clear.

#### Tiêu chí nghiệm thu

- Có ít nhất một watch thật trong database.
- Comment Jira gửi được in-app và Web Push.
- Outbox không còn pending vô hạn.

---

## 7. Pha 3 — Hoàn thiện release management

**Ưu tiên:** P0 trước production  
**Ước lượng:** 3–4 ngày  
**Kết quả:** Release được kiểm tra, approve và phát hành từ web một cách an toàn.

### REL-01 — Thêm role `release_manager`

#### Thay đổi dữ liệu

Thêm `release_manager` vào enum `Role` trong Prisma và tạo migration.

#### Permission matrix

| Hành động | member | release_manager | admin |
|---|---:|---:|---:|
| Xem release | Có | Có | Có |
| Chạy ready-check | Không hoặc theo policy | Có | Có |
| Tạo/sửa release | Không | Có | Có |
| Approve/override | Không | Có | Có |
| Release Fix Version | Không | Có | Có |
| Quản lý user/integration | Không | Không | Có |

#### Công việc chi tiết

- Tạo helper permission dùng chung cho API routes.
- Kiểm tra role ở server, không chỉ hide button.
- Cập nhật user-role API và Settings UI.
- Cập nhật chat release command.
- Thêm test member gọi trực tiếp API bị 403.

#### Tiêu chí nghiệm thu

- `member` không thể gọi release/override API bằng HTTP trực tiếp.
- `release_manager` không thể sửa role hoặc integration hệ thống.
- `admin` giữ đầy đủ quyền.

### REL-02 — API và UI thực sự release Jira Fix Version

#### API mới

```text
POST /api/releases/:id/release
```

#### Luồng xử lý

```text
Xác thực session
  → kiểm tra release_manager/admin
  → đọc release + Jira Fix Version
  → chạy lại mandatory gates
  → kiểm tra freshness
  → nếu blocked/unknown: trả 409 + blockers
  → gọi Jira releaseVersion(versionId)
  → cập nhật DB status=released, releasedAt
  → ghi audit
  → gửi notification
```

#### Quy tắc an toàn

- Không dùng ready-check quá cũ làm căn cứ duy nhất.
- Chạy lại gate ngay trước Jira mutation.
- Release rỗng không được phát hành.
- Gate `unknown` không được phát hành.
- Endpoint phải idempotent.
- Không cập nhật DB thành `released` nếu Jira trả lỗi.
- Nếu Jira thành công nhưng DB lỗi, reconciliation phải đọc Jira version và phục hồi trạng thái.
- Không hỗ trợ force release nếu chưa có override model và audit.

#### UI

- Nút `Release version` chỉ hiển thị cho đúng role.
- Dialog xác nhận gồm:
  - project
  - version
  - số task done/total
  - kết quả gate mới nhất
  - cảnh báo hành động không dễ hoàn tác
- Dùng trạng thái loading rõ ràng và chặn double-click.
- Hiển thị người release và thời điểm release.

#### Test bắt buộc

- Release ready gọi Jira đúng một lần.
- Release blocked/unknown trả 409.
- Member trả 403.
- Jira timeout không cập nhật DB sai.
- Gọi lại release đã phát hành trả success idempotent.
- Hai request đồng thời không release hai lần.

#### Tiêu chí nghiệm thu

- Có thể phát hành một Fix Version pilot từ web.
- Jira và PostgreSQL có cùng trạng thái released.
- Có audit và notification.

### REL-03 — Manual approval và gate override

#### Model đề xuất

```prisma
model ReleaseApproval {
  id           String   @id @default(cuid())
  releaseId    String
  type         String   // qa | release_manager
  approvedById String
  note         String   @default("")
  approvedAt   DateTime @default(now())
  revokedAt    DateTime?
}

model ReleaseGateOverride {
  id          String   @id @default(cuid())
  releaseId   String
  gate        String
  reason      String
  createdById String
  createdAt   DateTime @default(now())
  expiresAt   DateTime?
  revokedAt   DateTime?
}
```

#### Quy tắc

- Approval và override bắt buộc có actor.
- Override bắt buộc có lý do.
- Không override `non_empty_release`.
- Có thể cấm override critical Sentry/Jira blocker theo policy.
- Override hết hiệu lực khi:
  - bị revoke
  - quá hạn
  - release scope thay đổi
  - task/branch/CI source data thay đổi, tùy policy
- UI hiển thị `overridden`, không hiển thị giả thành `passed`.
- Release check lưu evidence của approval/override đã sử dụng.

#### API dự kiến

```text
POST   /api/releases/:id/approvals
DELETE /api/releases/:id/approvals/:approvalId
POST   /api/releases/:id/overrides
DELETE /api/releases/:id/overrides/:overrideId
```

#### Tiêu chí nghiệm thu

- Approval/revoke được phản ánh ngay trong ready-check.
- Override có lý do, actor và audit.
- Override hết hạn không còn được tính.

### REL-04 — CI gate

#### Model read model đề xuất

```prisma
model CiBuildStatus {
  id          String   @id @default(cuid())
  provider    String
  externalId  String
  repo        String
  branch      String
  commitSha   String
  status      String   // pending | success | failed | cancelled
  testStatus  String?
  url         String?
  startedAt   DateTime?
  completedAt DateTime?
  receivedAt  DateTime @default(now())

  @@unique([provider, externalId])
  @@index([repo, branch, commitSha])
}
```

#### Công việc chi tiết

1. Chuẩn hóa payload CI webhook.
2. Verify signature trước khi lưu event.
3. Upsert trạng thái pipeline theo external ID.
4. Xác định commit cần kiểm tra cho release:
   - merge commit của PR vào release/base branch; hoặc
   - head commit của configured release branch.
5. Thêm `ci` gate vào gate engine.
6. Lưu source time và build URL trong gate evidence.

#### Policy

| CI state | Gate state |
|---|---|
| Build + test success trên đúng commit | Passed |
| Build/test failed | Failed |
| Pending | Unknown |
| Không có build | Unknown |
| Build success trên commit cũ | Unknown |
| CI integration unavailable/stale | Unknown |

#### Test bắt buộc

- CI đỏ làm release blocked.
- CI xanh trên đúng commit làm gate pass.
- CI xanh trên commit cũ không được dùng.
- Webhook duplicate không tạo build row trùng.
- Payload không hợp lệ không làm release ready.

#### Tiêu chí nghiệm thu

- Release pilot hiển thị build URL và commit được kiểm tra.
- Không có CI evidence thì không thể release khi gate được cấu hình mandatory.

### REL-05 — Làm rõ “task lớn”

Release readiness hiện được tính theo Jira Fix Version. Nếu “task lớn” nghĩa là Epic/Initiative thì cần scope bổ sung:

- Sync parent/epic relation vào `IssueCache`.
- Hiển thị readiness theo Epic.
- Tổng hợp child task done/blocked/unknown.
- Cảnh báo Epic có child chưa thuộc Fix Version.
- Không coi Epic done nếu mandatory child chưa done, theo policy project.

Đây là hạng mục tùy chọn, cần product owner xác nhận trước khi triển khai vì khác với release readiness theo Fix Version.

---

## 8. Pha 4 — AI pilot, audit và hardening

**Ưu tiên:** P0/P2 tùy hạng mục  
**Ước lượng:** 2–3 ngày triển khai, sau đó thu thập dữ liệu pilot 1–2 tuần.

### AI-01 — Pilot AI estimation

#### Nguyên tắc rollout

Không bật `AI_AUTO_SCORE=true` cho toàn bộ issue ngay lập tức.

#### Kế hoạch

1. Chọn một Jira project pilot.
2. Chọn 30–50 task có description đủ mức độ khác nhau.
3. Chạy estimate thủ công.
4. Tech lead thực hiện Accept/Edit/Reject.
5. Theo dõi:
   - accept rate
   - edit rate
   - reject rate
   - mean absolute deviation
   - confidence theo issue type
   - latency và lỗi provider
6. Điều chỉnh prompt, point scale và dữ liệu similar tasks.
7. Thêm cấu hình auto-score theo project thay vì cờ global nếu cần.
8. Chỉ auto-score task mới hoặc task có nội dung thay đổi sau lần score trước.

#### Điều kiện bật auto-score

- Không ghi fallback giả thành estimate thật.
- Có rate limit/concurrency limit.
- Chi phí và latency trong SLA.
- Team thống nhất ngưỡng chất lượng.
- AI vẫn không tự ghi story point vào Jira.

#### Tiêu chí nghiệm thu

- Có ít nhất 30 decision thật.
- Metrics endpoint phản ánh đúng Accept/Edit/Reject.
- Provider lỗi trả unavailable và không tạo score giả.

### SEC-01 — Audit log đầy đủ

#### Model

Sử dụng model AuditLog đã đề xuất trong `docs/IMPLEMENTATION_PLAN.md`.

#### Hành động bắt buộc audit

- Edit/transition/comment task.
- Bulk preview confirmation và kết quả.
- Tạo branch.
- Tạo/sửa/release Fix Version.
- Approval/override.
- Thay đổi role.
- Thay đổi integration credential.
- Chat command.

#### Yêu cầu

- Có actor, source, target, before/after và correlation ID.
- Không lưu raw token.
- Với description/comment nhạy cảm, lưu metadata hoặc hash thay vì toàn bộ nội dung nếu không cần.
- Audit log append-only đối với user thông thường.

### OBS-01 — Metrics và alert

#### Metrics tối thiểu

- Job duration, success, failure, retry.
- External API latency và error rate.
- Jira/Bitbucket/Sentry freshness.
- Outbox pending/failed.
- Sentry import pending/failed.
- Release count theo status.
- Gate failure/unknown theo loại.
- AI latency, unavailable rate và decision metrics.

#### Alert tối thiểu

- Worker mất heartbeat quá 2 phút.
- Jira cursor quá 5 phút.
- Integration lỗi 3 lần liên tiếp.
- Outbox pending quá 10 phút.
- Sentry import failed sau max attempts.
- Release đã ready nhưng dữ liệu nguồn thay đổi hoặc trở thành stale.

### QA-01 — Sửa lint và quality gate

#### Công việc

- Xác minh `globalIgnores` thực sự loại `.next/**`.
- Đổi script lint thành phạm vi rõ nếu cần:

```json
"lint": "eslint src scripts prisma"
```

- Đặt timeout hợp lý trong CI.
- Quality gate bắt buộc:

```text
npm test
npm run typecheck
npm run lint
npm run build
```

- Không merge nếu migration chưa được thử trên database snapshot.

### OPS-04 — Backup, restore và runbook

#### Công việc

- Backup PostgreSQL hằng ngày.
- Thiết lập retention phù hợp.
- Restore thử trên môi trường test.
- Viết runbook cho:
  - Jira unavailable
  - Bitbucket unavailable
  - Sentry unavailable
  - AI unavailable
  - Worker queue stuck
  - notification outbox backlog
  - credential expired
  - database restore

#### Tiêu chí nghiệm thu

- Có bằng chứng restore thành công.
- Có RPO/RTO được team chấp nhận.
- Người trực vận hành có thể xử lý theo runbook mà không cần đọc source code.

---

## 9. Kế hoạch kiểm thử

### 9.1 Unit test

- Environment mapping parser.
- Permission helper.
- Release precondition.
- Gate override expiry.
- CI state mapping.
- Sentry project mapping và idempotency.
- Branch/PR state mapping.
- Notification dedupe.

### 9.2 Integration test

- Jira mock: versions, release version, transitions, comments.
- Sentry event → đúng một Jira issue.
- Bitbucket PR event → BranchInfo → release gate.
- CI event → CI read model → release gate.
- Jira comment → watcher notification.
- Worker restart tiếp tục job đúng.
- Token invalid không fallback âm thầm sang credential có quyền cao hơn.

### 9.3 End-to-end test

1. Tạo release và Jira Fix Version.
2. Gắn task bằng bulk action.
3. Chạy ready-check và nhận blocker.
4. Merge PR, đóng critical bug và gửi CI xanh.
5. QA/release manager approve.
6. Ready-check chuyển `ready`.
7. Release manager phát hành version từ web.
8. Jira Fix Version và database cùng chuyển `released`.
9. Watch một task rồi comment trực tiếp trên Jira.
10. Nhận một notification duy nhất.
11. Gửi cùng Sentry event hai lần và xác nhận chỉ có một Jira bug.
12. Dừng worker và xác nhận freshness alert.

### 9.4 Security test

- Member gọi release API trả 403.
- Webhook chữ ký sai trả 401.
- CSRF/session protection cho mutation.
- Không log token.
- Không expose encrypted credential qua API.
- Chat user chưa link không thể chạy mutation.
- Override luôn có actor và lý do.

## 10. Kế hoạch rollout

### Bước 1 — Staging

- Deploy web, worker và database staging.
- Dùng một Jira project pilot.
- Dùng một Bitbucket repo pilot.
- Dùng một Sentry project pilot.
- Discord channel riêng cho staging.

### Bước 2 — Shadow mode trong 1–2 tuần

- Gate engine đưa kết luận nhưng không gọi release thật.
- Release manager ghi lại kết luận thủ công để so sánh.
- Theo dõi false positive và false negative.
- Hiệu chỉnh policy theo project.

### Bước 3 — Limited pilot

- Bật release action cho một project.
- Chỉ một nhóm release manager được cấp quyền.
- Không cho override critical blocker trong tuần đầu.
- Theo dõi metrics và audit sau mỗi release.

### Bước 4 — Mở rộng

- Mở thêm project từng bước.
- Mỗi project có:
  - owner
  - Jira workflow mapping
  - release policy
  - Bitbucket repo mapping
  - Sentry project mapping
  - CI mapping

## 11. Rollback

### Worker/integration

- Có thể dừng worker mà không làm mất read model hiện có.
- Web hiển thị dữ liệu stale và không cho release.
- Event đã lưu trong `IntegrationEvent` có thể enqueue lại.

### Release feature

- Feature flag cho endpoint/nút release trong giai đoạn pilot.
- Nếu phát hiện gate sai, tắt release action và quay lại shadow mode.
- Không tự động unreleased Jira version; thao tác rollback Jira phải do release manager thực hiện theo runbook.

### Database migration

- Dùng expand–migrate–contract.
- Không xóa field/model cũ trong cùng release thêm schema mới.
- Backup trước migration production.

## 12. Backlog ưu tiên

| Thứ tự | ID | Hạng mục | Ưu tiên | Phụ thuộc | Ước lượng |
|---:|---|---|---:|---|---:|
| 1 | OPS-01 | Worker liên tục + heartbeat | P0 | — | 1 ngày |
| 2 | OPS-02 | Env parity + secret management | P0 | OPS-01 | 0,5 ngày |
| 3 | OPS-03 | Health/freshness alert | P0 | OPS-01 | 0,5 ngày |
| 4 | INT-01 | Bitbucket sync thật | P0 | OPS-01/02 | 0,5–1 ngày |
| 5 | INT-02 | Sentry mapping + webhook import | P0 | OPS-01/02 | 1,5–2 ngày |
| 6 | INT-03 | Discord end-to-end | P1 | OPS-02 | 0,5–1 ngày |
| 7 | INT-04 | Web Push + Watch E2E | P1 | OPS-01/02 | 0,5–1 ngày |
| 8 | REL-01 | `release_manager` RBAC | P0 | — | 0,5 ngày |
| 9 | REL-02 | Release Fix Version API/UI | P0 | REL-01, OPS-03 | 1–1,5 ngày |
| 10 | REL-03 | Approval + override | P1 | REL-01 | 1 ngày |
| 11 | REL-04 | CI read model + gate | P1 | OPS-01/02 | 1,5–2 ngày |
| 12 | SEC-01 | Audit log | P0 trước production | REL-01/02/03 | 1 ngày |
| 13 | OBS-01 | Metrics + alert | P0 trước production | OPS-01 | 0,5–1 ngày |
| 14 | AI-01 | AI pilot/calibration | P2 | Worker + AI config | 1 ngày + pilot |
| 15 | QA-01 | Quality gate/lint/E2E | P0 trước production | Tất cả | 1–2 ngày |
| 16 | OPS-04 | Backup/restore/runbook | P0 trước production | Staging | 1 ngày |

## 13. Điều kiện cho phép release production đầu tiên

- [ ] Worker heartbeat và Jira freshness alert hoạt động.
- [ ] Jira sync success rate đạt ít nhất 99% trong giai đoạn shadow.
- [ ] Bitbucket branch/PR mapping đã được đối chiếu thủ công.
- [ ] Sentry duplicate test pass.
- [ ] CI gate dùng đúng commit.
- [ ] `release_manager` RBAC pass security test.
- [ ] Release API chạy lại gate ngay trước mutation.
- [ ] Không release khi mandatory gate failed/unknown.
- [ ] Manual approval và override có audit.
- [ ] Backup và restore đã thử thành công.
- [ ] Unit, integration, E2E, lint, typecheck và build pass.
- [ ] Có rollback/runbook.
- [ ] Pilot project có owner và release manager chịu trách nhiệm.

## 14. Chỉ số đánh giá sau pilot

### Độ tin cậy

- Jira sync success rate ≥ 99%.
- Không có Sentry issue bị tạo Jira trùng.
- Không có notification duplicate từ cùng logical event.
- Không có release được đánh dấu ready khi mandatory data là unknown.
- Không có version được release bởi user thiếu role.

### Hiệu quả

- Thời gian chuẩn bị release giảm ít nhất 30%.
- Thời gian phát hiện blocker dưới 5 phút từ khi có event.
- Bulk action 100 task hoàn tất trong SLA team thống nhất.
- Giảm ít nhất 30% thao tác Jira thủ công trong project pilot.

### AI

- Có số liệu Accept/Edit/Reject.
- Không coi fallback/unavailable là AI success.
- Theo dõi sai lệch giữa AI point và final point.
- Chỉ bật auto-score khi team chấp nhận chất lượng và chi phí.

## 15. Các quyết định cần xác nhận trước khi bắt đầu

1. “Task lớn” có nghĩa là Jira Epic/Initiative hay Jira Fix Version/release.
2. Jira priority tương ứng với Sentry `fatal`, `error regression` và `error`.
3. CI provider và payload webhook chuẩn.
4. Branch đích dùng để xác định merged cho từng project/repo.
5. Gate nào được phép override và ai được override.
6. Manual approval cần một hay hai cấp: QA và release manager.
7. Freshness SLA cho Jira, Bitbucket, Sentry và CI.
8. Project được chọn làm pilot.
9. Kênh nhận alert production: Discord, Web Push hay cả hai.
10. Ngưỡng chất lượng AI trước khi bật auto-score.

