# Kế hoạch cải thiện thông báo trên web và Web Push tùy chọn

**Phiên bản:** 1.0 — Đã hoàn tất triển khai hệ thống thông báo web-first và Web Push opt-in  
**Ngày cập nhật:** 2026-09-24  
**Trạng thái:** Đã hoàn tất triển khai (Implemented & Verified)  
**Phạm vi:** In-app notification luôn là nguồn chính; Web Push chỉ bật khi người dùng chủ động cho phép  
**Ngoài phạm vi:** Discord outbound, email, SMS và daily digest  
**Design source:** `design-system/team-task-web/MASTER.md`

## 1. Quyết định phạm vi

Trong giai đoạn hiện tại, hệ thống lấy notification trong web làm nguồn chính và cho phép người dùng bật thêm Web Push:

- Notification được lưu trong database và gắn với đúng user.
- Chuông trên header hiển thị số chưa đọc và các notification mới nhất.
- User có thể đọc, đánh dấu đã đọc và mở tài nguyên liên quan.
- User có thể chọn loại notification muốn nhận trên web.
- In-app notification không phụ thuộc vào việc user có bật Push hay không.
- Web Push mặc định tắt và chỉ được đăng ký sau thao tác rõ ràng của user.
- User có thể tắt Push và thu hồi subscription bất cứ lúc nào.
- Có trang lịch sử nếu được xác nhận cần thiết.

Không triển khai hoặc mở rộng trong đợt này:

- Discord/shared chat/DM.
- Email hoặc SMS.
- Chế độ gửi tức thì/daily digest.

Outbox chỉ được dùng cho Web Push. Đường chat hiện có sẽ được cô lập, không tham gia pipeline đang hoạt động.

## 2. Kết luận hiện trạng

Hệ thống đã có nền tảng in-app cơ bản:

- Bảng `Notification` theo user.
- API lấy danh sách, unread count và mark read.
- Chuông notification trên header.
- Polling mỗi 15 giây.
- Preference theo tám loại event.
- Một số nguồn đã tạo notification: comment, transition, stale task, release, Sentry, bulk operation và system health.

Tuy nhiên, luồng hiện tại chưa nhất quán:

1. Caller có `eventId` và caller không có `eventId` đi qua hai nhánh khác nhau.
2. Dedupe chỉ áp dụng cho outbox; notification trên web vẫn có thể bị tạo trùng.
3. Một số caller bỏ qua preference.
4. Item không có link không thể được đánh dấu đã đọc từ giao diện.
5. Chưa có mark all read, filter, pagination hoặc lịch sử đầy đủ.
6. Loading, error và empty state chưa theo design system.
7. Frontend poll cả unread count lẫn danh sách khi dialog đang đóng.
8. Nội dung notification đang trộn tiếng Anh và tiếng Việt.

Với mô hình web-first, `Notification` là source of truth duy nhất. Web Push chỉ là bản delivery bổ sung của cùng notification khi user đã opt-in; lỗi Push không được làm mất notification trong web.

## 3. Baseline đã kiểm tra

### 3.1 Dữ liệu local ngày 2026-09-23

| Chỉ số | Giá trị |
|---|---:|
| User | 2 |
| Notification | 4 |
| Notification chưa đọc | 4 |
| Loại `stale` | 2 |
| Loại `system` | 2 |
| User có preference riêng | 0 |

Hai outbox row hiện có đều được đánh dấu `sent` nhưng thực tế không gửi push vì user không có subscription. Trạng thái này cần được đổi thành `skipped/no_subscription` để số liệu Push phản ánh đúng kết quả.

### 3.2 UI hiện tại

- Header có nút chuông và badge unread.
- Mở chuông hiển thị tối đa 20 notification trong `Dialog`.
- Link “Xem chi tiết” đánh dấu notification là đã đọc rồi đóng dialog.
- Item không có link không có hành động mark read.
- Empty state chỉ là text.
- Không có loading skeleton hoặc error/retry.
- Không có trang notification riêng.
- Badge chưa rút gọn khi số lượng lớn.
- Nút chuông chưa có accessible label đầy đủ.

### 3.3 API hiện tại

| API | Chức năng | Hạn chế |
|---|---|---|
| `GET /api/notify` | Lấy danh sách mới nhất | Chỉ có `limit`, chưa cursor pagination |
| `GET /api/notify/unread-count` | Đếm chưa đọc | Tạo request polling riêng |
| `POST /api/notify/mark-read` | Mark read theo danh sách ID | Chưa có mark all, mark unread, giới hạn số ID |
| `GET/PATCH /api/notify/preferences` | Bật/tắt type và lưu delivery mode | Chưa tách preference in-app và Push; `deliveryMode/digestHour` không còn phù hợp |
| `POST /api/push/subscribe` | Lưu hoặc xóa push subscription | Chưa có frontend đăng ký service worker, xin quyền và tạo subscription |

## 4. Mục tiêu trải nghiệm

### 4.1 Quick inbox ở header

Chuông notification là nơi xử lý nhanh:

- Badge hiển thị unread count, tối đa `99+`.
- Mở panel mới fetch 8–10 notification gần nhất.
- Mỗi item hiển thị icon loại sự kiện, tiêu đề, mô tả ngắn, thời gian và trạng thái chưa đọc.
- Click toàn bộ item sẽ mark read và điều hướng nếu có link.
- Item không có link vẫn có thể mark read.
- Có “Đánh dấu tất cả đã đọc”.
- Có link “Xem tất cả” nếu triển khai notification center.
- Có loading skeleton, error + retry và empty state đúng design system.
- Desktop dùng popover hoặc side panel nhẹ; mobile dùng sheet phù hợp màn hình.

### 4.2 Notification center

Đề xuất thêm `/notifications` để tránh nhồi toàn bộ lịch sử vào chuông:

- Tab `Tất cả` và `Chưa đọc`.
- Cursor pagination.
- Filter theo loại notification.
- Group theo `Hôm nay`, `Hôm qua`, `Cũ hơn`.
- Mark read từng item hoặc tất cả.
- Có thể mark unread nếu user muốn giữ lại để xử lý sau.
- Deep-link có fallback khi tài nguyên đã bị xóa hoặc user không còn quyền.

Nếu cần rút ngắn đợt đầu, notification center có thể sang giai đoạn 2; quick inbox vẫn phải có trạng thái đầy đủ.

### 4.3 Notification preference

Preference cần tách rõ nội dung nhận trong web và kênh Push bổ sung:

- Hiển thị danh sách loại notification với công tắc bật/tắt.
- Có công tắc tổng `Thông báo ngoài trình duyệt (Web Push)`, mặc định tắt.
- Khi bật, giải thích trước rồi mới gọi browser permission prompt.
- Nếu Push đang bật, cho phép chọn loại sự kiện được đẩy ra ngoài.
- Tắt Push chỉ xóa subscription/dừng delivery bên ngoài, không xóa notification trong web.
- Bỏ lựa chọn `Tức thì/Tổng hợp hàng ngày` khỏi UI.
- Bỏ `digestHour` khỏi form.
- Mô tả rõ phạm vi của từng công tắc, tránh nhầm giữa “không xuất hiện trên web” và “không bắn Push”.
- Có trạng thái đang lưu, lưu thành công và lỗi.
- Tránh gửi nhiều mutation dựa trên dữ liệu cũ khi user click liên tiếp.

## 5. Vấn đề ưu tiên

### P0 — Tính đúng đắn

#### WEB-NOTIFY-001 — Hợp nhất service tạo notification

Hiện có nhánh có `eventId` và nhánh legacy không có `eventId`.

Yêu cầu:

- Mọi notification source gọi cùng một service.
- Mọi event phải có `eventKey` ổn định.
- Service kiểm tra user, preference và dedupe tại một nơi.
- Luôn tạo in-app notification trước; chỉ enqueue push outbox nếu user đã bật Push cho event type đó.
- Không gọi chat trong pipeline đang hoạt động.
- `notifyAll` fan-out vào cùng service và bắt buộc có event key.

#### WEB-NOTIFY-002 — Dedupe notification trên web

Đề xuất thêm vào `Notification`:

```text
eventKey   String
readAt     DateTime?
severity   String @default("info")
```

Và unique constraint:

```text
unique(userId, type, eventKey)
```

Khi cùng webhook/job bị xử lý lại, service trả notification đã tồn tại thay vì tạo row mới.

#### WEB-NOTIFY-003 — Bổ sung event key cho toàn bộ caller

Quy ước đề xuất:

| Nguồn | Event key |
|---|---|
| Jira comment | `jira-comment:<commentId>` |
| Jira transition | `jira-transition:<issueKey>:<status>:<sourceEventId>` |
| Stale task | `stale:<issueKey>:<severity>:<thresholdPeriod>` |
| Bulk result | `bulk:<operationId>:<finalState>` |
| Release check | `release-check:<checkId>:<status>` |
| Release published | `release:<releaseId>:published` |
| Sentry blocker | `sentry:<project>:<issueId>:<action>` |
| System health | `health:<condition>:<incidentId>:<state>` |

Không dùng title/body làm dedupe key.

#### WEB-NOTIFY-004 — Chuẩn hóa preference

- Preference phải được áp dụng cho mọi nguồn.
- User chưa có row dùng default đã chốt.
- Preference in-app và Push phải được đánh giá độc lập.
- Tắt Push không ảnh hưởng notification trong web.
- Chỉ tạo push delivery khi subscription còn hiệu lực và type được phép.
- Thay đổi preference không xóa lịch sử cũ.
- Type không biết phải bị từ chối ở API, không tự lưu giá trị tùy ý.

#### WEB-NOTIFY-005 — Hoàn thiện Web Push opt-in

Backend sender, endpoint subscription và service worker đã tồn tại nhưng chưa có luồng frontend end-to-end.

Yêu cầu:

- Cấu hình VAPID public/private key theo đúng vai trò web/worker.
- Thêm UI trạng thái: chưa bật, đang bật, bị browser chặn, browser không hỗ trợ và subscription lỗi.
- Chỉ gọi `Notification.requestPermission()` sau khi user bấm bật.
- Đăng ký service worker và tạo Push subscription bằng VAPID public key.
- Cho phép tắt Push, xóa subscription ở server và unsubscribe trong browser.
- Tự làm sạch subscription khi provider trả 404/410.
- Có nút gửi notification thử để user xác minh thiết bị.
- Deep-link phải mở/focus đúng trang trong ứng dụng.

### P1 — API và hiệu năng

#### WEB-NOTIFY-101 — API quick inbox

Tạo response duy nhất chứa:

```text
items
unreadCount
nextCursor
```

Yêu cầu:

- Chỉ lấy danh sách khi panel mở.
- Badge có thể poll riêng mỗi 30–60 giây và refetch khi window focus/reconnect.
- Sau mutation, cập nhật query cache ngay thay vì chờ lần poll tiếp theo.
- Không cần WebSocket ở giai đoạn đầu.

#### WEB-NOTIFY-102 — API trạng thái đọc

- Mark read một hoặc nhiều ID.
- Mark all read theo user, có thể giới hạn theo thời điểm.
- Mark unread nếu có notification center.
- Giới hạn số ID mỗi request.
- Luôn filter theo `userId` từ session.
- Trả unread count mới để đồng bộ badge.

#### WEB-NOTIFY-103 — Cursor pagination

- Dùng `(createdAt, id)` làm cursor ổn định.
- Hỗ trợ `unreadOnly` và `type`.
- Không trả duplicate hoặc bỏ sót item khi notification mới được tạo giữa hai lần fetch.
- Giới hạn page size phía server.

### P1 — UI/UX và accessibility

#### WEB-NOTIFY-104 — Thiết kế lại chuông notification

- Nút chuông có `aria-label`, ví dụ “Thông báo, 3 chưa đọc”.
- Lucide icon trang trí có `aria-hidden`.
- Clickable item có `cursor-pointer` và transition 150–200ms.
- Dùng semantic token thay cho màu hardcode.
- Không dùng chỉ màu sắc để phân biệt unread.
- Focus visible và keyboard navigation đầy đủ.
- Tôn trọng `prefers-reduced-motion`.
- Kiểm tra responsive ở 375, 768, 1024 và 1440 px.
- Kiểm tra light/dark mode và contrast tối thiểu 4.5:1.

#### WEB-NOTIFY-105 — Chuẩn hóa nội dung

- UI và template dùng tiếng Việt nhất quán.
- Tiêu đề ngắn, nói rõ đối tượng và thay đổi.
- Body không lặp lại tiêu đề.
- Link label mô tả hành động cụ thể khi cần.
- Không đưa secret, token hoặc stack trace vào body.
- Comment/error dài phải cắt gọn an toàn.

### P2 — Vận hành và vòng đời dữ liệu

#### WEB-NOTIFY-201 — Retention

Khuyến nghị ban đầu:

- Notification đã đọc: giữ 90 ngày.
- Notification chưa đọc: giữ 180 ngày.
- Cleanup theo batch trong worker, không xóa toàn bộ một lần.
- Có index phù hợp cho `userId`, `readAt`, `createdAt` và `eventKey`.

#### WEB-NOTIFY-202 — Observability tối thiểu

- Đếm notification được tạo, bị dedupe và bị preference bỏ qua.
- Theo dõi tỷ lệ unread theo tuổi: 1 ngày, 7 ngày, 30 ngày.
- Ghi structured log với event key và type, không ghi body nhạy cảm.
- Health check theo dõi riêng push outbox nhưng không phụ thuộc vào chat outbox.

## 6. Mô hình dữ liệu đề xuất

```text
Notification
  id
  userId
  eventKey
  type
  severity
  title
  body
  link
  readAt
  createdAt
  expiresAt

  unique(userId, type, eventKey)
  index(userId, readAt, createdAt)
  index(userId, createdAt)

NotificationPreference
  id
  userId
  webDisabledTypes
  pushEnabled
  pushDisabledTypes
  createdAt
  updatedAt

PushSubscription
  id
  userId
  endpointHash
  subscription
  userAgent
  lastSeenAt
  disabledAt

NotificationOutbox
  id
  notificationId
  userId
  subscriptionId
  channel             // push
  state               // pending, processing, delivered, skipped, failed
  attemptCount
  nextAttemptAt
  deliveredAt
  reasonCode
```

`readAt` thay `read: Boolean` để biết chính xác thời điểm xử lý và hỗ trợ phân tích. Có thể giữ `read` trong migration chuyển tiếp nếu muốn giảm rủi ro rollout.

Tách `PushSubscription` khỏi cột JSON đơn trên `User` cho phép một user bật Push trên nhiều browser/thiết bị và tắt từng thiết bị độc lập. Nếu giai đoạn đầu chỉ hỗ trợ một thiết bị, có thể giữ cột hiện tại rồi migration sau.

Các trường `deliveryMode` và `digestHour` có thể:

- Giữ trong database nhưng ngừng trả ra UI/API trong giai đoạn đầu; hoặc
- Xóa ở migration cleanup sau khi pipeline web-first ổn định.

Khuyến nghị giữ tạm để migration đầu tập trung vào correctness.

## 7. Kế hoạch triển khai

### Giai đoạn 1 — Sửa backend correctness (2–3 ngày)

- Thêm `eventKey`, `readAt`, `severity` và unique constraint.
- Backfill event key cho dữ liệu hiện có bằng ID hiện tại; không cố suy luận event cũ.
- Viết notification service web-first thống nhất.
- Chuyển toàn bộ caller sang event key ổn định.
- Luôn tạo in-app trước; chỉ enqueue push khi preference và subscription cho phép.
- Dừng enqueue chat trong service.
- Áp dụng preference nhất quán.
- Thêm unit/integration test cho dedupe và ownership.

**Điều kiện hoàn tất:** Cùng một logical event chỉ tạo một notification cho mỗi user; mọi caller đi qua cùng service.

### Giai đoạn 2 — Quick inbox và API (1,5–2 ngày)

- Response quick inbox gồm items + unread count.
- Mark one/all read và optimistic update.
- Chỉ fetch list khi mở panel.
- Loading skeleton, error/retry và empty state.
- Badge `99+`, accessible label và keyboard interaction.
- Chuẩn hóa nội dung tiếng Việt.

**Điều kiện hoàn tất:** User xử lý được toàn bộ notification mới ngay từ header, kể cả item không có link.

### Giai đoạn 3 — Preference web và Push (0,5–1 ngày)

- Bỏ digest controls khỏi UI.
- Tách công tắc loại notification trên web với công tắc Web Push.
- Cải thiện mutation để không mất thay đổi khi click nhanh.
- Thêm feedback lưu thành công/thất bại.
- Test type enable/disable độc lập theo channel.

**Điều kiện hoàn tất:** UI mô tả và điều khiển chính xác notification trong web và notification được bắn ra ngoài.

### Giai đoạn 4 — Web Push opt-in (2–3 ngày)

- Cấu hình và validate VAPID.
- Đăng ký service worker sau khi user bật tính năng.
- Permission, subscribe, unsubscribe và trạng thái lỗi.
- Outbox retry/backoff chỉ cho channel Push.
- Xử lý subscription hết hạn và hỗ trợ gửi thử.
- Kiểm tra deep-link/focus khi click notification.

**Điều kiện hoàn tất:** User có thể tự bật/tắt Push và nhận notification thử, trong khi in-app vẫn hoạt động nếu Push lỗi.

### Giai đoạn 5 — Notification center tùy chọn (1,5–2 ngày)

- Trang `/notifications`.
- Cursor pagination, tab unread và filter type.
- Group theo ngày.
- Mark unread và bulk actions.
- Responsive/accessibility/light-dark QA.

**Điều kiện hoàn tất:** User có thể tra cứu và xử lý lịch sử ngoài giới hạn quick inbox.

### Giai đoạn 6 — Retention và rollout (0,5–1 ngày)

- Cleanup job và metric tối thiểu.
- Feature flag nếu cần rollout theo nhóm.
- Runbook và smoke test.
- Theo dõi duplicate rate, API latency và unread aging.

**Tổng ước lượng:**

- Không làm notification center: 6,5–10 ngày.
- Có notification center: 8–12 ngày.

## 8. Test plan

### Unit test

- Event key ổn định cho từng nguồn.
- Preference enable/disable.
- Push policy theo opt-in và event type.
- Chuẩn hóa title/body/link/severity.
- Cursor encode/decode.

### Integration test

- Replay cùng event không tạo notification trùng.
- Hai request đồng thời vẫn chỉ tạo một row.
- User A không đọc/sửa notification của user B.
- Disabled web type không tạo notification mới trong web.
- Push tắt hoặc type bị tắt cho Push không tạo outbox row.
- Push thất bại không rollback hoặc xóa in-app notification.
- Subscription 404/410 được vô hiệu hóa và không retry vô hạn.
- Thay đổi preference không xóa lịch sử cũ.
- Mark all chỉ ảnh hưởng notification của session hiện tại.

### UI test

- Badge tăng/giảm sau create/mark read.
- Item có link và không có link đều mark read được.
- Optimistic update rollback khi API lỗi.
- Loading/error/empty state.
- Keyboard, screen reader label và focus management.
- Light/dark và responsive.
- Push permission: default, granted, denied và unsupported.

### E2E smoke test

1. User A watch một Jira task.
2. Tạo comment mới từ user B.
3. Xác minh User A nhận đúng một notification trên web.
4. Replay event và xác minh không bị trùng.
5. Mở chuông, mark read và xác minh unread count giảm.
6. Bật Push và xác minh nhận đúng một browser notification cho event mới.
7. Tắt Push, tạo event khác và xác minh chỉ còn notification trong web.

## 9. Definition of Done

- In-app là source of truth và luôn độc lập với trạng thái Push.
- Web Push mặc định tắt, chỉ hoạt động sau opt-in rõ ràng của user.
- User tự bật/tắt Push được và xem được trạng thái permission/subscription.
- Không enqueue hoặc gửi Discord từ notification service đang hoạt động.
- Mọi source dùng một service và có event key.
- Không có duplicate notification khi webhook/job chạy lại hoặc chạy đồng thời.
- Preference được áp dụng nhất quán.
- Quick inbox có mark one/all, loading/error/empty và accessibility đầy đủ.
- Badge và danh sách đồng bộ ngay sau mutation.
- API có ownership isolation, input limit và cursor pagination khi cần.
- Nội dung tiếng Việt nhất quán.
- Có test cho luồng critical và retention policy đã được chốt.

## 10. Câu hỏi còn cần xác nhận

1. User chỉ cần một công tắc Push chung, hay được chọn riêng loại nào được bắn ra ngoài? Khuyến nghị: một công tắc tổng và danh sách loại bên dưới.
2. Khi tắt một loại notification, có tắt cả in-app lẫn Push hay chỉ tắt Push? Khuyến nghị: tách hai phạm vi để user không vô tình mất lịch sử trong web.
3. Có làm luôn trang `/notifications`, hay đợt đầu chỉ cần chuông quick inbox? Khuyến nghị làm backend + quick inbox + Push trước, notification center ở giai đoạn kế tiếp.
4. Retention 90 ngày cho đã đọc và 180 ngày cho chưa đọc có phù hợp không?

## 11. Các quyết định thiết kế đã chốt và áp dụng

1. **Công tắc Web Push:** Đã triển khai công tắc tổng "Thông báo ngoài trình duyệt (Web Push)" và danh sách từng loại sự kiện được cấu hình bên dưới khi Push được bật.
2. **Phạm vi tắt loại thông báo:** Tách biệt độc lập giữa Web In-App và Web Push. Tắt một loại trên Push không làm mất lịch sử trong web; tắt trên Web sẽ bỏ qua hoàn toàn cả hai kênh.
3. **Trung tâm thông báo (`/notifications`):** Đã triển khai đầy đủ cả quick inbox trên header và trang `/notifications` hoàn chỉnh với bộ lọc, phân nhóm theo ngày và cursor pagination.
4. **VAPID & Service Worker:** Đã sinh và cấu hình VAPID keys, cung cấp endpoint `/api/push/vapid` và `/api/push/test`, tích hợp service worker `/sw.js` và hook `useWebPush`.

## 12. Nhật ký công việc đã thực hiện (Implementation Log — 2026-09-24)

### Giai đoạn 1 — Sửa Backend & Correctness
- **Prisma Schema & Migration (`20260924063000_web_notify_improvements`):**
  - Bảng `Notification`: bổ sung `eventKey` (String, default `""`), `severity` (String, default `"info"`), `readAt` (DateTime nullable).
  - Thêm ràng buộc duy nhất `@@unique([userId, type, eventKey])`.
  - Thêm chỉ mục `@@index([userId, readAt, createdAt])`.
  - Bảng `NotificationPreference`: bổ sung `pushEnabled` (Boolean, default `false`), `pushDisabledTypes` (String[]).
  - **Backfill dữ liệu cũ:** Cập nhật `eventKey = id` cho 4 bản ghi hiện có; chuyển đổi 2 bản ghi `NotificationOutbox` sang trạng thái `skipped` với lỗi `no push subscription`.
- **Hợp nhất Notification Service (`src/lib/notify/index.ts` & `src/lib/notify/outbox.ts`):**
  - Mọi caller đi qua `notifyUser` / `notifyAll` thống nhất.
  - Tự động kiểm tra preference và dedupe theo `(userId, type, eventKey)` trước khi tạo mới. Nếu bản ghi đã tồn tại, trả về notification cũ thay vì tạo trùng.
  - Kênh Chat (Discord) đã được cô lập khỏi pipeline thông báo đang hoạt động.
  - Push delivery chỉ được đưa vào outbox khi user bật `pushEnabled`, sự kiện không nằm trong `pushDisabledTypes`, và user có `pushSubscription`.
  - Cập nhật worker `deliver-notifications.ts`: khi user không có push subscription, đánh dấu `skipped` thay vì `sent`.
- **Chuẩn hóa Event Key và nội dung tiếng Việt cho toàn bộ caller:**
  - `stale-detect.ts`: `stale:<issueKey>:<severity>:<thresholdPeriod>`
  - `bulk/ops.ts`: `bulk:<operationId>:<finalState>`
  - `issues/[key]/transition/route.ts`: `jira-transition:<issueKey>:<status>:<transitionId>`
  - `issues/[key]/comments/route.ts` & `notify-watchers.ts`: `jira-comment:<commentId>`
  - `releases/[id]/ready/route.ts`: `release-check:<checkId>:<status>`
  - `releases/[id]/release/route.ts`: `release:<releaseId>:published`
  - `process-webhook.ts`: `sentry:<project>:<issueId>:<action>`
  - `health-alert.ts`: `health:<condition>:<incidentId>:<state>`

### Giai đoạn 2 — Quick Inbox & API
- **API `GET /api/notify`:**
  - Hỗ trợ `unreadCount`, `items`, `nextCursor`.
  - Hỗ trợ lọc theo `unreadOnly`, `type`, phân trang cursor ổn định `(createdAt, id)`.
- **API `POST /api/notify/mark-read`:**
  - Hỗ trợ `ids: string[]` (giới hạn 100 ID mỗi request).
  - Hỗ trợ `all: true` (đánh dấu tất cả đã đọc cho user hiện tại).
  - Hỗ trợ `unread: true` (đánh dấu chưa đọc, reset `readAt`).
  - Trả về `unreadCount` mới nhất để đồng bộ giao diện ngay lập tức.
- **Quick Inbox UI (`src/app/(app)/notification-popover.tsx`):**
  - Nút chuông header có `aria-label` chi tiết ("Thông báo, 3 thông báo chưa đọc").
  - Badge unread rút gọn khi số lượng lớn (`99+`).
  - Mở Dialog mới fetch dữ liệu (chỉ query khi mở panel).
  - Hiển thị icon theo từng loại sự kiện, tiêu đề, mô tả, timeAgo, badge mức độ (warning/danger).
  - Nút "Đọc tất cả" trên header dialog.
  - Nhấp vào notification sẽ mark read và mở liên kết tài nguyên (nếu có).
  - Loading skeleton (`Skeleton`), empty state (`BellOff` trong vòng tròn muted theo design system), error state kèm nút "Thử lại".
  - Link "Xem tất cả" điều hướng sang `/notifications`.

### Giai đoạn 3 — Preference Web và Web Push
- **API `GET/PATCH /api/notify/preferences`:**
  - Quản trị độc lập `disabledTypes`, `pushEnabled`, `pushDisabledTypes`.
  - Kiểm tra tính hợp lệ của loại thông báo (`knownTypes`).
  - Bỏ `deliveryMode` và `digestHour` khỏi UI.
- **UI Cài đặt thông báo (`src/app/(app)/settings/notification-preferences.tsx`):**
  - Khối thông báo In-app: Danh sách 8 loại thông báo với nhãn tiếng Việt rõ ràng, mô tả mục đích.
  - Khối thông báo Web Push: Công tắc tổng bật/tắt Push, cảnh báo khi trình duyệt bị chặn/không hỗ trợ, nút "Gửi thông báo thử", danh sách loại sự kiện được cấu hình riêng cho Push.

### Giai đoạn 4 — Web Push Opt-in End-to-End
- **Cấu hình VAPID:** Đã sinh cặp khóa VAPID và cấu hình trong `.env`.
- **Endpoint VAPID & Test:**
  - `GET /api/push/vapid`: Trả về public key cho trình duyệt.
  - `POST /api/push/test`: Gửi notification thử nghiệm đến thiết bị của user.
  - `POST /api/push/subscribe`: Lưu hoặc xóa subscription.
- **Hook `useWebPush` (`src/hooks/use-web-push.ts`):** Kiểm tra hỗ trợ, xin quyền `Notification.requestPermission()`, đăng ký service worker `/sw.js`, tạo subscription và đồng bộ server.

### Giai đoạn 5 — Trung tâm thông báo (`/notifications`)
- **Trang `/notifications` (`src/app/(app)/notifications/page.tsx` & `notifications-client.tsx`):**
  - Tabs: "Tất cả" và "Chưa đọc".
  - Bộ lọc dropdown theo loại sự kiện.
  - Phân nhóm thời gian: "Hôm nay", "Hôm qua", "Cũ hơn".
  - Nút "Tải thêm thông báo cũ hơn" dựa trên cursor pagination.
  - Thao tác nhanh trên từng item: Xem chi tiết, Đánh dấu đã đọc / Đánh dấu chưa đọc.
  - Thêm mục "Thông báo" vào thanh điều hướng bên trái (`AppShell`).

### Giai đoạn 6 — Kiểm thử & Độ tin cậy
- Mở rộng unit test cho `outbox.test.ts` (kiểm tra deduplication, preference filter, push opt-in).
- Thêm test suite cho `api/notify/route.test.ts` (kiểm tra cursor pagination, filter, mark read, mark all, mark unread).
- Toàn bộ 38 test suites (378 tests) đạt kết quả PASS (100%).
- Kiểm tra build sản phẩm với `npm run build` thành công, hoàn toàn sạch lỗi TypeScript và lint.
