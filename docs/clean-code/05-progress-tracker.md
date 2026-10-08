# Progress Tracker

> Đây là nguồn sự thật duy nhất cho tiến độ clean code mới.
>
> Cập nhật trạng thái, owner, commit và bằng chứng ngay khi kết thúc batch.

## Baseline

| Chỉ số | Giá trị ban đầu | Giá trị cuối | Bằng chứng |
|---|---:|---:|---|
| TypeScript errors | 0 | 0 | `npm run typecheck` (batch 0.1) |
| ESLint errors | 0 | 0 | `npm run lint` (batch 0.1) |
| ESLint warnings | 3 | 3 | `npm run lint`; không có warning mới, xử lý ở batch 0.3 |
| Failing tests | 4 | 0 | `npm test`: 1.289/1.289 pass |
| Failing test files | 2 | 0 | `jira-sync-race`, `jira-sync-integration`: 22/22 pass |
| Build | Chưa đo lại | | `npm run build` |
| API routes | 101 | | `find src/app/api -name route.ts` |
| Routes import Prisma | 73 | | `rg '@/lib/prisma' src/app/api` |
| Routes >150 dòng | 15 | | `wc -l` |
| File production lớn nhất | 1.919 dòng | | `src/lib/bulk/ops.ts` |

## Phase Status

| Phase | Nội dung | Trạng thái | Owner | Bắt đầu | Kết thúc | Ghi chú |
|---|---|---|---|---|---|---|
| 0 | Baseline xanh | IN_PROGRESS | Codex | 2026-10-08 | | Batch 0.1 hoàn tất; dừng trước batch 0.2 |
| 1 | Contracts và dependency direction | TODO | | | | |
| 2 | Jira và Issues | TODO | | | | |
| 3 | Queue và Sync | TODO | | | | |
| 4 | Bulk | TODO | | | | |
| 5 | Bitbucket và Releases | TODO | | | | |
| 6 | Reports, Stale, Leaderboard | TODO | | | | |
| 7 | Notify, Chat, AI, Sentry | TODO | | | | |
| 8 | API và Frontend | TODO | | | | |
| 9 | Verification và docs | TODO | | | | |

## Batch Tracker

| ID | Batch | Trạng thái | Owner | PR/Commit | Tests/QA | Blocker/Notes |
|---|---|---|---|---|---|---|
| 0.1 | Jira sync test doubles | DONE | Codex | N/A (không commit theo yêu cầu) | `typecheck` pass; `lint` pass, 3 warning baseline; 22/22 test liên quan và 1.289/1.289 full test pass; manual QA N/A | Mock `issueCache.findMany` đúng semantics `where.jiraKey.in`; không đổi production code |
| 0.2 | Mock contract hygiene | TODO | | | | |
| 0.3 | Lint zero-warning | TODO | | | | |
| 1.1 | API contract inventory | TODO | | | | |
| 1.2 | Shared contracts | TODO | | | | |
| 1.3 | Shared helper direction | TODO | | | | |
| 2.1 | Jira transport characterization | TODO | | | | |
| 2.2 | Jira resource extraction | TODO | | | | |
| 2.3 | Board cache policy | TODO | | | | |
| 2.4 | Issue mapping | TODO | | | | |
| 2.5 | Issue persistence | TODO | | | | |
| 3.1 | pg-boss lifecycle | TODO | | | | |
| 3.2 | Registry và schedules | TODO | | | | |
| 3.3 | Enqueue API | TODO | | | | |
| 3.4 | Jira sync pipeline | TODO | | | | |
| 3.5 | Webhook handlers | TODO | | | | |
| 3.6 | DB integration suite | TODO | | | | |
| 4.1 | Bulk contract và validation | TODO | | | | |
| 4.2 | Bulk selection và preview | TODO | | | | |
| 4.3 | Bulk operation repository | TODO | | | | |
| 4.4 | Bulk action executors | TODO | | | | |
| 4.5 | Bulk retry và notification | TODO | | | | |
| 4.6 | Bulk create metadata/validation | TODO | | | | |
| 4.7 | Bulk create execution | TODO | | | | |
| 4.8 | Bulk UI controller | TODO | | | | |
| 5.1 | Bitbucket transport/resources | TODO | | | | |
| 5.2 | Link reconciliation | TODO | | | | |
| 5.3 | Branch notification policy | TODO | | | | |
| 5.4 | Release context/evaluator | TODO | | | | |
| 5.5 | Release persistence/mutation | TODO | | | | |
| 6.1 | Reports query primitives | TODO | | | | |
| 6.2 | Metrics separation | TODO | | | | |
| 6.3 | Stale route decomposition | TODO | | | | |
| 6.4 | Leaderboard contracts | TODO | | | | |
| 7.1 | Notification delivery contract | TODO | | | | |
| 7.2 | Chat command handlers | TODO | | | | |
| 7.3 | AI provider boundary | TODO | | | | |
| 7.4 | Sentry review | TODO | | | | |
| 8.1 | Làm mỏng route lớn | TODO | | | | |
| 8.2 | Board controller | TODO | | | | |
| 8.3 | Frontend controllers còn lại | TODO | | | | |
| 9.1 | Full automated verification | TODO | | | | |
| 9.2 | Full manual QA | TODO | | | | |
| 9.3 | Architecture/docs/report | TODO | | | | |

## Decision Log

| Ngày | ID | Quyết định | Lý do | Người quyết định |
|---|---|---|---|---|
| 2026-10-08 | D-001 | Test double `issueCache.findMany` lọc in-memory store theo `where.jiraKey.in`; không sửa production code và không xử lý log mock khác | Giữ đúng contract truy vấn của `poll-jira`, khôi phục 4 test đỏ mà không lấn sang batch 0.2 | Codex |

## Findings Ngoài Phạm Vi

| Ngày | ID | Phát hiện | Severity | Hướng xử lý | Issue |
|---|---|---|---|---|---|
| 2026-10-08 | F-001 | Jira sync test doubles thiếu `issueCache.findMany` | P0 | Đã xử lý trong Phase 0.1 | N/A (không commit theo yêu cầu) |
| 2026-10-08 | F-002 | Một số Jira/Prisma mocks thiếu method/model và tạo error log giả | P1 | Phase 0.2 | |
| 2026-10-08 | F-003 | UI import DTO trực tiếp từ API route | P1 | Phase 1.2 | |
| 2026-10-08 | F-004 | Shared JiraAvatar import helper từ Board feature | P1 | Phase 1.3 | |
| 2026-10-08 | F-005 | Board membership SWR inflight promise có nguy cơ trả `undefined` | P1 | Bug batch riêng | |

## Verification Log

| Ngày | Commit | Typecheck | Lint | Tests | Build | Manual QA | Người chạy |
|---|---|---|---|---|---|---|---|
| 2026-10-08 | `10401ab` | Pass | Pass, 3 warnings | Fail, 4 tests | Chưa chạy | Chưa chạy | Codex |
| 2026-10-08 | Worktree, không commit | Pass | Pass, 3 warning baseline | Pass, 165 file / 1.289 test | Không chạy; gate cuối phase/merge | N/A; chỉ sửa test double, race/failure path đã được automated test | Codex |

## Completion Report

Điền khi Phase 9 hoàn tất:

- Tổng phase hoàn thành:
- Batch hoàn thành/skipped:
- Test trước/sau:
- Warning trước/sau:
- File lớn nhất trước/sau:
- Route import Prisma trước/sau:
- Risk còn mở:
- Migration/dependency thay đổi: phải là `Không`, trừ khi có phê duyệt riêng.
