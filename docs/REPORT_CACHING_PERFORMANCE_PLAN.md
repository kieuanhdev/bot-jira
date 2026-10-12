# Kế hoạch tối ưu cache và tốc độ tải

## 1. Bối cảnh

Trang Báo cáo và một số màn hình chính hiện tạo cảm giác phải tải lại mỗi lần người dùng quay lại. Hệ thống đã có TanStack Query cache ở phía client, nhưng thời gian `staleTime` phần lớn chỉ từ 15 đến 60 giây, cache chỉ tồn tại trong bộ nhớ của tab trình duyệt và các request API mặc định sử dụng `cache: "no-store"`.

Riêng Báo cáo danh mục còn thực hiện truy vấn tuần tự theo từng dự án, đọc toàn bộ issue của từng dự án và tính toán lại khi API được gọi. API báo cáo được đánh dấu `force-dynamic`, do đó không có server-side response cache.

Kế hoạch này xử lý cả ba lớp:

1. Cache và trải nghiệm tải ở client.
2. Hiệu năng truy vấn và tính toán báo cáo.
3. Cache kết quả tính toán ở server và cơ chế invalidation.

## 2. Mục tiêu

- Quay lại một trang trong cùng phiên phải hiển thị dữ liệu gần như tức thì.
- Khi cache đã stale, vẫn giữ dữ liệu hiện có trên màn hình và cập nhật nền, không quay lại skeleton toàn trang.
- Sau khi Jira đồng bộ xong, dữ liệu mới phải xuất hiện nhanh và có giới hạn rõ ràng về độ trễ.
- Giảm số lượng truy vấn DB của Báo cáo danh mục từ số lượng tăng theo từng project xuống một số lượng gần như cố định.
- Không cache nhầm dữ liệu giữa các tài khoản hoặc giữa các project scope khác nhau.
- Không làm giảm tính realtime của thông báo và trạng thái Jira sync.
- Manual Refresh phải thực sự yêu cầu dữ liệu mới.

## 3. Ngoài phạm vi

- Không thay đổi công thức tính KPI, health, risk hoặc leaderboard.
- Không thay đổi Prisma schema hoặc tạo migration trong đợt tối ưu đầu tiên.
- Không thêm Redis hoặc hạ tầng cache bên ngoài trong giai đoạn đầu.
- Không persist dữ liệu task vào `localStorage`.
- Không đổi toàn bộ API client sang `force-cache`.

## 4. Kiến trúc mục tiêu

```text
Người dùng mở trang
        |
        v
TanStack Query cache trong trình duyệt
        | cache miss
        v
Next.js Route Handler / Server Component
        |
        +-- Server report cache
        |       | cache miss
        |       v
        +-- Prisma batch queries -> tính metrics
```

Trách nhiệm của từng lớp:

- **TanStack Query:** giúp chuyển tab, đổi trang và quay lại màn hình nhanh trong cùng phiên.
- **Next.js server cache:** tránh tính lại cùng một báo cáo khi reload hoặc khi có request lặp lại.
- **Prisma query optimization:** giảm thời gian của một cache miss thực sự.
- **Invalidation:** đánh dấu cache liên quan là cũ khi Jira sync hoặc mutation hoàn tất.

## 5. Giai đoạn 0 — Đo baseline

### 5.1. Instrumentation

Bổ sung đo thời gian cho các bước:

- Xác thực session.
- Resolve project scope.
- Đọc project catalog.
- Đọc release/version.
- Đọc issue và transition event.
- Tính metrics.
- Serialize response.
- Tổng thời gian API.

Thông tin log tối thiểu:

- `route`
- `durationMs`
- `projectCount`
- `issueCount`
- `queryCount` nếu có thể thu thập an toàn
- `cacheStatus`: `HIT`, `MISS` hoặc `BYPASS`

Không ghi task content, access token, Jira token, cookie hoặc thông tin nhạy cảm vào log.

### 5.2. API cần đo

- `GET /api/reports/projects`
- `GET /api/reports/projects/[projectKey]`
- `GET /api/reports/projects/[projectKey]/risks`
- `GET /api/reports/projects/[projectKey]/tasks`
- `GET /api/reports/projects/[projectKey]/members`
- `GET /api/reports/projects/[projectKey]/history`

### 5.3. Kịch bản đo

1. Mở Báo cáo lần đầu.
2. Rời trang rồi quay lại ngay.
3. Quay lại sau 1 phút.
4. Quay lại sau 5 phút.
5. Reload trình duyệt.
6. Chuyển qua lại giữa Tổng quan, Công việc, Thành viên và Xu hướng.
7. Mở trang trong lúc Jira sync và sau khi sync hoàn tất.
8. So sánh tài khoản có ít project với tài khoản có nhiều project.

### 5.4. Kết quả baseline cần lưu

- API duration p50 và p95.
- Số Prisma query trên mỗi request.
- Thời gian skeleton xuất hiện.
- Số request phát sinh khi chuyển tab.
- Kích thước JSON response.
- Số issue được đọc để tạo một report.

## 6. Giai đoạn 1 — Chuẩn hóa cache phía client

Đây là thay đổi ít rủi ro nhất và nên được triển khai trước.

### 6.1. Tạo chính sách cache tập trung

Tạo `src/lib/query-policy.ts` thay vì để các giá trị `staleTime` và `gcTime` rải rác trong component.

Chính sách khởi đầu đề xuất:

| Nhóm dữ liệu | `staleTime` | `gcTime` |
| --- | ---: | ---: |
| Báo cáo tổng hợp | 5 phút | 60 phút |
| Công việc/Thành viên/Xu hướng | 3–5 phút | 30 phút |
| Board và danh sách task | 1–5 phút | 30 phút |
| Release, Watch, Stale | 1–2 phút | 30 phút |
| Project catalog, metadata, cấu hình | 10 phút | 60 phút |
| Trạng thái sync | 2,5–15 giây | 1 phút |
| Thông báo realtime | Giữ hiện trạng | Ngắn |

Cập nhật `src/app/providers.tsx`:

- Đặt `gcTime` mặc định khoảng 30 phút.
- Giữ `refetchOnWindowFocus: false`.
- Đặt `refetchOnReconnect: true`.
- Giữ retry có giới hạn.
- Không tăng `staleTime` cho polling/realtime query.

### 6.2. Chuẩn hóa query key

Mở rộng `reportsKeys` trong `src/lib/query-keys.ts` cho:

- Portfolio.
- Project detail.
- Risks.
- Tasks.
- Members.
- History.

Quy tắc tạo key:

- Project key luôn được chuẩn hóa thành chữ hoa.
- Danh sách project phải được sort.
- Loại bỏ tham số có giá trị mặc định nếu chúng không ảnh hưởng kết quả.
- Dùng cùng một hàm serialize cho `period`, `versionId`, `unit`, filter và pagination.
- Hai request tương đương phải tạo cùng một query key.

### 6.3. Giữ dữ liệu cũ khi refetch

Áp dụng `placeholderData: keepPreviousData` cho:

- Đổi kỳ báo cáo.
- Đổi đơn vị tính.
- Đổi filter.
- Phân trang task/risk.
- Đổi project.

Quy tắc UI:

- Skeleton chỉ xuất hiện khi chưa từng có dữ liệu.
- Khi có dữ liệu cũ, tiếp tục hiển thị dữ liệu đó.
- Trong lúc refetch chỉ hiển thị trạng thái nhỏ như “Đang cập nhật”.
- Nút Refresh phải thể hiện `isFetching` nhưng không xóa nội dung hiện có.

### 6.4. Bảo vệ cache khi đổi tài khoản

Do thời gian giữ cache được tăng lên, QueryClient phải được xóa khi:

- User đăng xuất.
- Session chuyển sang một user ID khác.
- Jira account/onboarding của user bị thay đổi theo cách làm thay đổi project scope.

Không persist query cache vào `localStorage` trong giai đoạn này. Cache chỉ tồn tại trong memory của tab trình duyệt.

### 6.5. File dự kiến thay đổi

- `src/app/providers.tsx`
- `src/lib/query-policy.ts` — file mới
- `src/lib/query-keys.ts`
- `src/app/(app)/reports/projects/project-portfolio-client.tsx`
- `src/app/(app)/reports/projects/[projectKey]/lib/use-project-report-controller.ts`
- `src/app/(app)/reports/projects/[projectKey]/tasks-tab.tsx`
- `src/app/(app)/reports/projects/[projectKey]/members-tab.tsx`
- `src/app/(app)/reports/projects/[projectKey]/trends-tab.tsx`

## 7. Giai đoạn 2 — Tối ưu truy vấn báo cáo

Cache không nên che giấu một truy vấn vốn chậm. Giai đoạn này xử lý nguyên nhân backend.

### 7.1. Loại bỏ vòng lặp truy vấn tuần tự của portfolio

Hiện portfolio thực hiện lần lượt cho từng project:

1. Đọc reference release.
2. Đọc toàn bộ issue.
3. Tính summary.
4. Chuyển sang project tiếp theo.

Thay bằng batch query:

1. Một query lấy release cho toàn bộ project được phép.
2. Một query lấy issue cho toàn bộ project được phép.
3. Group kết quả theo `projectKey` trong memory.
4. Chạy các pure calculator hiện có cho từng project.

Mục tiêu là giảm từ khoảng `2 × N project` query xuống một số query cố định.

Không đổi công thức của `calculatePortfolioProjectSummary` và `calculatePortfolioRollup`.

### 7.2. Tránh đọc project catalog nhiều lần

Trong cùng một request, catalog hiện có thể được đọc tại nhiều lớp:

- Resolve user scope.
- Portfolio service.
- Project access guard.
- Project detail service.

Điều chỉnh interface để scope/catalog đã resolve có thể được truyền xuống service. Không gọi lại DB nếu dữ liệu đã có trong request hiện tại.

### 7.3. Loại bỏ request risk trùng ở Project Detail

Project detail response đã có `topRisks`. Lần đầu mở tab Tổng quan:

- Dùng `report.topRisks` để render.
- Không gọi `/risks` ngay nếu chưa có filter hoặc pagination đặc biệt.
- Chỉ bật risk query khi người dùng phân trang, lọc risk hoặc yêu cầu dữ liệu chi tiết hơn.

### 7.4. Chỉ query tab đang hoạt động

- Tasks chỉ query khi tab Công việc được mở.
- Members chỉ query khi tab Thành viên được mở.
- History chỉ query khi tab Xu hướng được mở.
- Member detail tái sử dụng cache Members thay vì tạo query key khác.
- Prefetch tab chỉ được thực hiện theo user intent ở giai đoạn sau.

### 7.5. Song song hóa truy vấn độc lập

Sau khi đã resolve project/version, các truy vấn không phụ thuộc nhau có thể chạy bằng `Promise.all`, ví dụ:

- Available versions.
- Issue data.
- Freshness.
- Một số transition/snapshot query độc lập.

Không song song hóa các bước cần kết quả của bước trước.

### 7.6. Giữ nguyên business logic

Không thay đổi:

- Health status.
- Completion ratio.
- Risk classification.
- Period comparison.
- Unit selection.
- Cách xác định completion date.

### 7.7. File dự kiến thay đổi

- `src/lib/reports/portfolio-query.ts`
- `src/lib/reports/project-query.ts`
- `src/lib/reports/query-primitives.ts`
- `src/lib/reports/scope.ts`
- `src/app/(app)/reports/projects/[projectKey]/lib/use-project-report-controller.ts`
- `src/app/(app)/reports/projects/[projectKey]/project-report-client.tsx`

## 8. Giai đoạn 3 — Cache kết quả báo cáo phía server

Project hiện chưa bật Next.js Cache Components. Theo mô hình Next.js 16 hiện tại, giải pháp ban đầu nên dùng `unstable_cache` hoặc một server cache abstraction riêng, không bật `cacheComponents` chỉ để xử lý vấn đề này.

### 8.1. Ranh giới cache

Chỉ cache phần tính toán nặng:

- Portfolio metrics.
- Project detail metrics.
- Risk summary không có filter đặc biệt.
- History/snapshot khi dữ liệu đầu vào không đổi.

Không cache chung:

- Session.
- Permission result.
- User-specific access decision.
- Trạng thái worker realtime.
- Error response.

Luồng đúng:

1. Authenticate request.
2. Resolve quyền và project scope.
3. Chuẩn hóa tham số.
4. Gọi cached report computation bằng scope đã xác thực.
5. Ghép freshness hiện tại vào response nếu freshness cần realtime hơn metrics.

### 8.2. Cache key

Cache key bắt buộc chứa:

- Danh sách project được phép, đã chuẩn hóa và sort.
- Project key.
- Period, from, to và timezone.
- Version.
- Unit.
- Filter và pagination.
- Data version hoặc thời điểm Jira sync gần nhất.
- Phiên bản logic/schema của report cache.

Nếu project scope của hai user giống nhau, họ có thể dùng chung kết quả metrics đã được lọc theo đúng scope. Nếu scope khác nhau, cache key phải khác nhau.

### 8.3. Thời gian cache ban đầu

| Dữ liệu | Server cache TTL |
| --- | ---: |
| Portfolio | 60–120 giây |
| Project detail | 60 giây |
| History | 5 phút |
| Version/project metadata | 5–10 phút |

Sau khi có p50/p95 thực tế mới cân nhắc tăng TTL.

### 8.4. Invalidation

Ưu tiên:

1. Client query invalidation khi Jira sync hoàn tất như hiện tại.
2. Đưa sync version hoặc `lastSuccessAt` phù hợp vào server cache key.
3. Manual Refresh gửi yêu cầu bypass server cache.
4. TTL là lớp an toàn cuối cùng nếu invalidation không chạy.

Cần kiểm chứng `IntegrationCursor.lastSuccessAt` có phải nguồn version đáng tin cậy cho từng project hay không. Nếu không, xây fingerprint từ các timestamp liên quan mà không cần migration.

### 8.5. Manual Refresh

Nút Refresh phải có đường đi rõ ràng để bypass server cache, ví dụ tham số nội bộ `refresh=1` hoặc header được route handler kiểm soát.

Yêu cầu:

- Chỉ áp dụng cho request đã xác thực.
- Không vô hiệu hóa cache toàn hệ thống nếu chỉ refresh một project.
- Không cache error response.
- Không để request bypass tạo thundering herd.

### 8.6. Quan sát cache

Thêm response header:

```text
X-Report-Cache: HIT | MISS | BYPASS
```

Log thời gian cache lookup và computation riêng biệt.

### 8.7. Không thay đổi API helper toàn cục

Không chuyển `src/lib/api-client.ts` sang `force-cache` mặc định. Đây là các API có xác thực; browser HTTP cache không phải nơi phù hợp để kiểm soát tính đúng đắn của report data.

## 9. Giai đoạn 4 — Loại bỏ client-fetch waterfall

Cold load hiện phải trải qua:

1. Tải Server Component payload.
2. Tải JavaScript.
3. Hydrate React.
4. Client mới gọi API báo cáo.
5. Đợi API rồi mới có dữ liệu.

### 9.1. Server-side prefetch

Áp dụng cho:

- `/reports/projects`
- `/reports/projects/[projectKey]`

Thiết kế:

1. `page.tsx` đọc `params` và `searchParams` theo API của Next.js 16.
2. Resolve session và user scope trên server.
3. Prefetch query report với cùng query key phía client.
4. `dehydrate` QueryClient.
5. Truyền state qua `HydrationBoundary`.

Khi server report cache hit, dữ liệu có thể đi cùng response đầu tiên và không còn request API nối tiếp sau hydration.

### 9.2. Loading boundary

Thêm `loading.tsx` phù hợp cho reports route:

- Dùng `Skeleton` hiện có.
- Không dùng text spinner.
- Giữ layout gần giống nội dung thật để tránh layout shift.
- Dùng semantic theme tokens, hỗ trợ light/dark mode.

## 10. Giai đoạn 5 — Prefetch theo ý định người dùng

Chỉ triển khai sau khi backend đã nhẹ hơn để tránh tạo tải không cần thiết.

### 10.1. Sidebar

Khi hover hoặc focus vào “Báo cáo dự án”:

- Prefetch route.
- Prefetch portfolio query mặc định nếu chưa có trong cache.

### 10.2. Project report link

Khi hover/focus vào nút mở một project report:

- Prefetch detail query của đúng project.
- Có debounce ngắn.
- Không prefetch tất cả project cùng lúc.

### 10.3. Tab nội bộ

Khi hover/focus vào Công việc, Thành viên hoặc Xu hướng:

- Prefetch đúng query của tab.
- Không prefetch toàn bộ tab ngay khi vào trang.
- Dùng query key chuẩn hóa từ `reportsKeys`.

## 11. Giai đoạn 6 — Áp dụng cho các màn hình khác

Sau khi Báo cáo ổn định, áp dụng chính sách cache dùng chung cho các màn hình còn lại.

### 11.1. Release

- Main release query hiện có thể dùng thời gian mặc định ngắn.
- Đặt stale policy rõ ràng khoảng 1–2 phút.
- Mutation release phải invalidate đúng project thay vì toàn bộ query không liên quan.

### 11.2. Leaderboard

- Tăng cache từ 60 giây lên khoảng 5 phút.
- Invalidate khi dữ liệu nguồn thực sự thay đổi.
- Giữ dữ liệu cũ khi đổi timeframe/filter.

### 11.3. Branches

- Giữ các query 5 phút hiện có.
- Chuẩn hóa query key.
- Kiểm tra invalidation sau thay đổi branch/PR.

### 11.4. Board, Watch và Stale

- Board tiếp tục dựa vào mutation và sync invalidation.
- Watch/Stale giữ dữ liệu cũ khi refetch.
- Không tăng stale time nếu có thể khiến thao tác chỉnh sửa vừa thực hiện không xuất hiện.

### 11.5. Notifications và active sync

- Giữ realtime EventSource và polling hiện tại.
- Không áp cache 5 phút cho dữ liệu này.
- Tránh invalidation rộng hơn phạm vi dữ liệu bị thay đổi.

## 12. Kiểm thử

### 12.1. Unit test

- Query key ổn định khi object có thứ tự thuộc tính khác nhau.
- Danh sách project khác thứ tự vẫn tạo cùng key.
- Project scope khác nhau không dùng chung cache.
- Batch portfolio cho kết quả giống logic cũ.
- Cache key thay đổi khi sync version thay đổi.
- Manual Refresh bypass cache.
- Error response không được cache.
- Data cũ được giữ khi query key thay đổi do filter/pagination.

### 12.2. Route test

Mở rộng:

- `src/app/api/reports/projects/route.test.ts`
- `src/app/api/reports/projects/[projectKey]/route.test.ts`
- `src/app/api/reports/projects/[projectKey]/sub-routes.test.ts`

Kiểm tra:

- Authentication và permission vẫn hoạt động.
- Period/version/unit/filter vẫn cho kết quả đúng.
- Cache hit không chạy lại computation.
- Cache miss chỉ chạy computation một lần khi có request đồng thời.
- Hai user có scope khác nhau không nhận chung kết quả.
- Manual Refresh không trả cache cũ.

### 12.3. Query/service test

Mở rộng `src/lib/reports/query-primitives.test.ts` và bổ sung test cho portfolio/project service:

- Batch query group đúng theo project.
- Project không có issue vẫn xuất hiện đúng.
- Project không có release vẫn hoạt động.
- `deletedAt` được lọc đúng.
- `lastSyncedAt` của từng project chính xác.
- Không thay đổi kết quả metrics so với fixture cũ.

### 12.4. Manual QA

- Light mode và dark mode.
- Desktop và mobile.
- Điều hướng bằng chuột và bàn phím.
- Quay lại bằng sidebar, browser Back và browser Forward.
- Reload trang.
- Đổi user.
- Mất mạng rồi reconnect.
- Jira sync hoàn tất khi đang đứng ở report và khi đang ở trang khác.

### 12.5. Validation command

```bash
npm test
npm run typecheck
npm run lint
npm run build
```

Baseline tương ứng phải chạy trước khi sửa để phân biệt lỗi có sẵn với regression mới.

## 13. Tiêu chí hoàn thành

- Quay lại Báo cáo trong vòng 5 phút không hiện skeleton và không gọi lại API nếu cache chưa bị invalidated.
- Khi cache stale, dữ liệu cũ vẫn hiển thị trong lúc cập nhật nền.
- Cold portfolio không còn số query tăng theo `2 × số project`.
- Mở Project Detail lần đầu không gọi `/risks` trùng với `topRisks` đã có.
- Chuyển lại tab đã mở không tải trắng.
- Jira sync hoàn tất làm dữ liệu mới xuất hiện trong vài giây; fallback server TTL không quá 60 giây cho dữ liệu cần cập nhật nhanh.
- Manual Refresh thực sự lấy dữ liệu mới.
- Reload với server cache hit nhanh hơn rõ rệt so với baseline.
- Đăng xuất hoặc đổi tài khoản không nhìn thấy cache của user trước.
- Không có thay đổi ngoài ý muốn trong công thức report.
- Test, typecheck, lint và build đều pass.

## 14. Thứ tự triển khai

### PR 1 — Baseline và client cache

- Instrumentation.
- Query policy.
- `gcTime` và `staleTime` chuẩn hóa.
- `keepPreviousData`.
- Xóa cache khi đổi session.

### PR 2 — Backend query optimization

- Batch portfolio queries.
- Tái sử dụng catalog/scope.
- Bỏ initial risk request trùng.
- Chuẩn hóa query key cho các tab.

### PR 3 — Server report cache

- Cached computation boundary.
- Cache key theo scope và data version.
- Manual bypass.
- Cache diagnostics.

### PR 4 — Server hydration và prefetch

- Server-side query prefetch.
- HydrationBoundary.
- Route loading skeleton.
- Hover/focus prefetch.

### PR 5 — Các màn hình còn lại

- Release.
- Leaderboard.
- Watch/Stale.
- Rà invalidation của Board và Branches.

Mỗi PR phải được đo lại theo cùng bộ baseline và có thể rollback độc lập.

## 15. Rủi ro và biện pháp kiểm soát

| Rủi ro | Biện pháp |
| --- | --- |
| Dữ liệu cũ sau Jira sync | Client invalidation, sync-version cache key và TTL ngắn |
| Rò dữ liệu giữa user | Authenticate trước cache, đưa normalized scope vào key, clear QueryClient khi đổi user |
| Cache stampede | In-flight deduplication và TTL có jitter nếu cần |
| Manual Refresh vẫn trả cache | Đường bypass được kiểm thử riêng |
| Tăng memory phía browser | `gcTime` có giới hạn, không persist localStorage |
| Batch query dùng nhiều memory | Đo issue count/response size, giữ select tối thiểu cần thiết |
| Server cache khác nhau giữa nhiều instance | Xác nhận mô hình deploy; chỉ cân nhắc remote cache nếu thực sự có nhiều replica |
| Thay đổi metrics ngoài ý muốn | Golden fixtures và so sánh kết quả trước/sau |

## 16. Quyết định kỹ thuật đề xuất

- Không bật Next.js Cache Components trong phạm vi đầu tiên.
- Dùng cache ở tầng computation, không cache session/permission.
- Không thay đổi `api()` toàn cục sang `force-cache`.
- Không persist task data vào browser storage.
- Ưu tiên batch query trước khi tăng server cache TTL.
- Giữ cơ chế invalidation sau Jira sync.
- Dùng dữ liệu cũ trong lúc refetch thay vì hiển thị skeleton lại.
