# Kế hoạch bổ sung kiểm tra chuẩn hóa task vào Phân tích task tồn đọng

> Dự án: Team Task Web  
> Phiên bản kế hoạch: 1.0  
> Ngày lập: 2026-09-30  
> Phạm vi chính: Trang `/stale`, API `/api/stale`, dữ liệu Jira cache và luồng hành động chuẩn hóa task  
> Trạng thái: Đề xuất triển khai

## 1. Bối cảnh

Thông báo Jira Bot hiện cho người dùng biết các task đang thực hiện và task ngâm,
đồng thời ghi ngay trên từng task các dữ liệu còn thiếu, ví dụ:

- Estimate/Story point/Task Points.
- Worklog.
- Fix Version.
- Due date.
- Số ngày ngâm so với ngưỡng.

Thông báo còn hướng người dùng đến tab "Kiểm tra tiêu chuẩn", nhưng trang
`/stale` hiện chưa có một danh sách cá nhân chuyên biệt để người dùng nhìn thấy
toàn bộ task chưa đạt chuẩn và hành động.

Hiện trạng kỹ thuật:

1. `/api/stale` đã đọc toàn bộ issue chưa Done trong phạm vi project và đã xác
   định được task của người đang đăng nhập qua `jiraUsername` cùng alias.
2. Danh sách `tasks` chỉ chứa task đã vượt SLA. Task chưa vượt SLA nhưng thiếu
   dữ liệu chuẩn hóa không xuất hiện trong danh sách hành động.
3. `myWork.tasks` có toàn bộ task đang hoạt động của người dùng nhưng mới chỉ trả
   `jiraKey`, `summary`, `status`, `points` và `updatedAt`.
4. `IssueCache` đã có points, worklog (`timeSpent`), Fix Version và Due date.
   Original Estimate hiện được đồng bộ trong `raw.timeoriginalestimate`, chưa có
   cột riêng.
5. Khối "Kiểm tra chất lượng dữ liệu" hiện chỉ tổng hợp trên tập task vượt SLA,
   không nêu task nào thiếu trường nào và không tạo hàng đợi hành động cá nhân.
6. Trạng thái "Bạn không có task nào bị tồn đọng" có thể vẫn xuất hiện khi người
   dùng còn task chưa đạt chuẩn, dễ tạo cảm giác công việc đã hoàn toàn ổn.
7. Repository hiện chưa có logic tạo đúng mẫu thông báo được cung cấp. Quy tắc
   trong bot có thể nằm ở dịch vụ khác; khi triển khai phải xác nhận chủ sở hữu
   để tránh tồn tại hai bộ quy tắc khác nhau.

## 2. Mục tiêu

Sau thay đổi, ở góc nhìn **Việc của tôi** của trang `/stale`, người dùng phải trả
lời được ngay:

1. Tôi có bao nhiêu task đang hoạt động?
2. Bao nhiêu task đã đạt đủ tiêu chuẩn và bao nhiêu task còn thiếu dữ liệu?
3. Mỗi task đang thiếu chính xác trường nào?
4. Tôi cần mở task nào hoặc dùng thao tác hàng loạt nào để bổ sung dữ liệu?
5. Task đó có đồng thời bị ngâm/quá hạn/bị chặn hay không?

Kết quả mong muốn là biến cảnh báo trong bot thành một hàng đợi có thể xử lý,
không chỉ là thông tin để đọc.

## 3. Nguyên tắc sản phẩm

### 3.1 Chuẩn hóa và tồn đọng là hai trục độc lập

Không dùng `stale` làm điều kiện để kiểm tra tiêu chuẩn.

```text
activeTask = deletedAt IS NULL AND statusCategory != "done"
standardizationIssue = activeTask AND missingRequirements.length > 0
staleIssue = activeTask AND stateAgeDays >= slaDays
```

Một task có thể thuộc một trong bốn trường hợp:

| Trạng thái | Cách hiển thị |
|---|---|
| Đạt chuẩn, chưa ngâm | Bình thường, không cần hành động |
| Chưa đạt chuẩn, chưa ngâm | Hiện trong hàng đợi "Cần chuẩn hóa" |
| Đạt chuẩn, đang ngâm | Hiện trong hàng đợi tồn đọng |
| Chưa đạt chuẩn, đang ngâm | Hiện ở cả hai góc nhìn nhưng dùng cùng dữ liệu task, không nhân đôi KPI |

### 3.2 Phạm vi "task của tôi"

- Chỉ lấy task chưa Done, chưa bị xóa trong cache và thuộc project người dùng có
  quyền xem.
- Assignee phải khớp `jiraUsername` hoặc alias bằng so sánh không phân biệt hoa
  thường, dùng lại `jiraUsernameAliases()`.
- Không coi reporter, watcher hoặc người tạo task là chủ sở hữu chuẩn hóa.
- Bộ lọc project trên trang phải áp dụng giống nhau cho dữ liệu tồn đọng và dữ
  liệu chuẩn hóa.
- MVP kiểm tra toàn bộ task chưa Done. Nếu nghiệp vụ chỉ muốn kiểm tra nhóm đang
  làm/review, bổ sung policy theo status thay vì hardcode trong UI.

### 3.3 Một nguồn quy tắc duy nhất

Tách bộ đánh giá tiêu chuẩn thành module dùng chung, dự kiến:

```text
src/lib/issues/standardization.ts
```

API trang web và dịch vụ tạo thông báo phải cùng dùng kết quả của module này hoặc
cùng tiêu thụ một contract/version quy tắc. Không sao chép điều kiện thiếu field
ở UI, API và bot.

## 4. Bộ tiêu chuẩn đề xuất

### 4.1 Các yêu cầu có thể kiểm tra

| Mã | Đạt khi | Thông báo khi thiếu | Hành động |
|---|---|---|---|
| `ESTIMATION` | `points > 0` **hoặc** `originalEstimateSeconds > 0` | Thiếu Estimate/Story point/Task Points | Đặt Points hoặc Original Estimate |
| `WORKLOG` | `timeSpent > 0` | Chưa log Worklog | Ghi Worklog |
| `FIX_VERSION` | Có ít nhất một `fixVersionId`/`fixVersionName` hợp lệ | Thiếu Fix Version | Gán Fix Version |
| `DUE_DATE` | `dueDate != null` | Thiếu Due date | Đặt Due date |

Số ngày ngâm, quá hạn và blocked là tín hiệu vận hành, không phải trường chuẩn
hóa. Chúng được hiển thị cạnh kết quả chuẩn hóa nhưng không đưa vào
`missingRequirements`.

### 4.2 Policy theo loại luồng

Mẫu thông báo cho thấy yêu cầu có thể khác theo label: `flow-feature` và
`flow-support` có kiểm tra estimation, trong khi `flow-bug`, `flow-defect` và
`flow-debt` trong mẫu không báo thiếu estimation. Vì quy tắc này chưa tồn tại
trong repository, triển khai theo policy cấu hình được thay vì rải điều kiện
theo label.

Policy khởi tạo đề xuất, cần Product Owner xác nhận trước khi bật production:

| Profile | Label áp dụng | Trường bắt buộc |
|---|---|---|
| `planned-work` | `flow-feature`, `flow-support` | Estimation, Worklog, Fix Version, Due date |
| `maintenance-work` | `flow-bug`, `flow-defect`, `flow-debt` | Worklog, Fix Version, Due date |
| `default` | Không có label khớp | Estimation, Worklog, Fix Version, Due date |

Quy tắc chọn profile:

1. Chuẩn hóa label về lowercase.
2. Mỗi task chỉ chọn một profile.
3. Nếu có nhiều label thuộc nhiều profile, dùng thứ tự ưu tiên được cấu hình và
   trả thêm cảnh báo `AMBIGUOUS_POLICY_LABEL` để quản trị viên xử lý.
4. Trả `policyId` và `policyVersion` trong API để bot và web có thể đối soát.
5. Chưa hỗ trợ ngoại lệ theo cá nhân. Nếu cần miễn một tiêu chuẩn, phải dùng
   label/policy có tên rõ ràng và có thể audit.

### 4.3 Trạng thái đánh giá

Mỗi task có một trong ba trạng thái:

| Trạng thái | Ý nghĩa |
|---|---|
| `complete` | Tất cả yêu cầu của profile đã đạt |
| `incomplete` | Có ít nhất một yêu cầu xác định là thiếu |
| `unknown` | Không đủ dữ liệu đáng tin cậy để kết luận, ví dụ cache cũ hoặc field không được đồng bộ |

`unknown` không được hiển thị thành "đạt chuẩn". UI phải ghi rõ cần đồng bộ lại
dữ liệu thay vì yêu cầu người dùng điền một field có thể đã tồn tại trên Jira.

## 5. Trải nghiệm người dùng đề xuất

### 5.1 Vị trí và cấu trúc

Giữ hai góc nhìn hiện tại **Việc của tôi** và **Toàn dự án**. Trong **Việc của
tôi**, thêm hai tab nội dung:

- **Cần chuẩn hóa**: mở mặc định nếu còn task chưa đạt chuẩn.
- **Tồn đọng**: giữ phân tích SLA hiện tại.

Nếu người dùng đi từ link trong thông báo, hỗ trợ URL có trạng thái rõ ràng:

```text
/stale?view=my-work&tab=standardization
```

Không tạo trang riêng trong MVP để tránh chia nhỏ ngữ cảnh. Sau này có thể đổi
tên menu thành "Sức khỏe công việc" nếu phạm vi trang không còn chủ yếu là task
tồn đọng.

### 5.2 Khối tổng quan cá nhân

Hiển thị ngay sau bộ lọc project:

- `18/22 task cần chuẩn hóa` hoặc `22/22 task đã đạt chuẩn`.
- Số task thiếu từng nhóm: Estimation, Worklog, Fix Version, Due date.
- Thời điểm dữ liệu Jira được đồng bộ gần nhất.
- CTA **Chuẩn hóa task**; nếu chọn nhiều task thì CTA **Chuẩn hóa đã chọn**.

Không hiển thị trạng thái xanh "mọi việc đều ổn" chỉ vì `totalStale = 0`. Trạng
thái khỏe hoàn toàn chỉ dùng khi đồng thời:

```text
totalStale = 0 AND standardization.incomplete = 0 AND standardization.unknown = 0
```

### 5.3 Danh sách task cần chuẩn hóa

Mỗi dòng/card gồm:

- Jira key và summary.
- Status, project và labels quyết định policy.
- Checklist field: đạt, thiếu hoặc chưa xác định.
- Dòng tóm tắt: `Thiếu 3 mục: Worklog, Fix Version, Due date`.
- Tín hiệu phụ: ngâm bao nhiêu ngày, quá hạn, blocked nếu có.
- CTA **Mở task** và **Chuẩn hóa**.

Bộ lọc/tìm kiếm:

- Thiếu field nào.
- Project.
- Status.
- Có/không bị ngâm.
- Từ khóa Jira key/summary.
- Sắp xếp mặc định: task thiếu nhiều mục nhất, sau đó task đang ngâm lâu nhất,
  rồi Jira key.

Mobile dùng card; desktop dùng table. Dùng semantic badge, Lucide icon, skeleton
khi tải, empty state có icon + tiêu đề + hướng dẫn theo design system hiện tại.

### 5.4 Luồng hành động

MVP:

1. **Mở task** dẫn đến `/issue/{jiraKey}`.
2. **Chuẩn hóa** dẫn sang Bulk Edit với task đã chọn sẵn và chỉ làm nổi bật các
   operation đang thiếu: set points/estimate, log work, add Fix Version, set due
   date.
3. Sau mutation thành công, refresh issue cache và invalidate query `/api/stale`
   để task biến mất khỏi hàng đợi ngay khi đã đủ chuẩn.

Không tự điền dữ liệu thay người dùng và không tự đặt giá trị giả chỉ để chuyển
task sang `complete`.

Giai đoạn sau có thể cho sửa nhanh ngay tại `/stale`, nhưng phải dùng lại API
preview/execute của Bulk Edit, quyền Jira và xử lý partial failure; không tạo
đường ghi Jira thứ hai.

## 6. Thay đổi backend

### 6.1 Chuẩn hóa model đọc

Khuyến nghị thêm cột nullable vào `IssueCache`:

```text
originalEstimateSeconds Int?
```

Sau đó cập nhật `issueCacheData()` để lấy `timeoriginalestimate` hoặc giá trị
tương đương từ `timetracking`. Có thể đọc tạm từ `raw` trong giai đoạn chuyển
tiếp, nhưng evaluator không nên phụ thuộc lâu dài vào JSON không có kiểu.

Không cần thêm cột boolean kiểu `isStandardized`, vì đây là dữ liệu suy ra từ
policy và các field Jira; lưu boolean sẽ dễ lỗi thời khi policy thay đổi.

### 6.2 Module đánh giá dùng chung

Interface đề xuất:

```ts
type RequirementCode = "ESTIMATION" | "WORKLOG" | "FIX_VERSION" | "DUE_DATE";

interface StandardizationResult {
  status: "complete" | "incomplete" | "unknown";
  policyId: string;
  policyVersion: string;
  required: RequirementCode[];
  missing: RequirementCode[];
  satisfied: RequirementCode[];
  unknown: RequirementCode[];
}
```

Evaluator phải là hàm thuần và có unit test cho từng profile, giá trị biên bằng
0, field null, label viết hoa/thường, nhiều label và dữ liệu không xác định.

### 6.3 Contract `/api/stale`

Giữ dữ liệu SLA hiện tại để tương thích, bổ sung khối cá nhân:

```json
{
  "myWork": {
    "username": "chienpm",
    "totalActive": 22,
    "totalStale": 12,
    "standardization": {
      "complete": 4,
      "incomplete": 18,
      "unknown": 0,
      "missingCounts": {
        "ESTIMATION": 12,
        "WORKLOG": 18,
        "FIX_VERSION": 18,
        "DUE_DATE": 18
      },
      "tasks": [
        {
          "jiraKey": "MHRM-1255",
          "summary": "Chỉnh sửa giao diện nút feedback",
          "status": "READY FOR TEST",
          "labels": ["flow-feature"],
          "policyId": "planned-work",
          "policyVersion": "1",
          "statusResult": "incomplete",
          "missing": ["ESTIMATION", "WORKLOG", "FIX_VERSION", "DUE_DATE"],
          "isStale": true,
          "stateAgeDays": 5,
          "slaDays": 2,
          "lastSyncedAt": "2026-09-30T08:00:00.000Z"
        }
      ]
    }
  }
}
```

Lưu ý triển khai:

- Đánh giá chuẩn hóa trên `myIssues`, không phải `allTasks`, vì `allTasks` chỉ có
  issue đã vượt SLA.
- Không để filter `reason` và `severity` của SLA làm mất task chuẩn hóa. Project,
  status và assignee có thể dùng chung; filter riêng của mỗi tab phải có state
  riêng và được biểu diễn trên URL.
- Trả `lastSyncedAt` hoặc freshness tổng hợp. Nếu cache quá SLA dữ liệu, kết quả
  chuyển thành `unknown` hoặc gắn `dataStale = true`.
- Giữ giới hạn truy cập theo `boardProjects`; không nhận username tùy ý từ client
  để đọc task của người khác trong góc nhìn cá nhân.

### 6.4 Hiệu năng

- Lần đầu có thể tính evaluator trong memory trên tập issue đã được query.
- Chỉ trả task `incomplete`/`unknown` trong danh sách chuẩn hóa; các số tổng hợp
  vẫn bao gồm tất cả task cá nhân.
- Tránh thêm một query Jira trực tiếp trên mỗi request. Dùng `IssueCache` và
  action refresh hiện có.
- Theo dõi giới hạn `take: 2000`: nếu phạm vi project có thể vượt giới hạn, cần
  phân trang/query theo database để KPI không bị thiếu âm thầm.

## 7. Đồng bộ với thông báo Jira Bot

Thông báo và trang web phải cho cùng kết quả tại cùng thời điểm dữ liệu:

1. Link "Kiểm tra tiêu chuẩn" trỏ tới
   `/stale?view=my-work&tab=standardization`.
2. Số `18/22` trong bot phải tương ứng với `incomplete / totalActive` trên trang.
3. Thứ tự và tên lý do thiếu dùng cùng mapping từ `RequirementCode`.
4. Bot có thể giới hạn số task hiển thị, nhưng tổng số và link xem đầy đủ không
   được sai.
5. "Ngâm N ngày" hiển thị như cảnh báo phụ, không ghép vào danh sách field thiếu.
6. Gắn `policyVersion` vào log của job gửi thông báo để điều tra khi web và bot
   lệch kết quả.

Nếu bot nằm ngoài repository này, ưu tiên một trong hai cách:

- Bot gọi một endpoint nội bộ trả kết quả evaluator; hoặc
- Đưa policy/evaluator vào package dùng chung có version.

Không duy trì thủ công hai bảng mapping label và tiêu chuẩn.

## 8. Phân kỳ triển khai

### Giai đoạn 0 — Chốt nghiệp vụ

- Xác nhận task nào được coi là "đang hoạt động": toàn bộ non-Done hay chỉ WIP.
- Xác nhận ma trận field bắt buộc theo từng `flow-*` label.
- Xác nhận trường hợp nhiều flow label và task không có flow label.
- Xác nhận freshness SLA của Jira cache.
- Xác định repository/chủ sở hữu của job đang sinh thông báo mẫu.

Đầu ra: policy v1 được Product Owner phê duyệt và có ví dụ pass/fail.

### Giai đoạn 1 — Domain và dữ liệu

- Thêm `originalEstimateSeconds` vào `IssueCache` và migration/backfill cần thiết.
- Cập nhật mapper Jira cache.
- Tạo module evaluator và cấu hình policy.
- Thêm unit test đầy đủ.

### Giai đoạn 2 — API

- Mở rộng `myWork.standardization` trong `/api/stale`.
- Bổ sung summary, missing counts, task result và freshness.
- Thêm test auth, project scope, alias, filter và contract.
- Đảm bảo field mới chỉ là additive change để UI cũ vẫn chạy.

### Giai đoạn 3 — UI `/stale`

- Đồng bộ `view`/`tab` với URL.
- Thêm tab "Cần chuẩn hóa", summary cards, filter và danh sách task.
- Sửa healthy/empty state để xét cả stale và standardization.
- Thêm CTA mở Issue Detail và Bulk Edit đã chọn task.
- Kiểm tra light/dark mode, keyboard, screen reader và responsive.

### Giai đoạn 4 — Hành động và bot

- Cho Bulk Edit nhận danh sách key và operation gợi ý từ query/state an toàn.
- Refresh cache + invalidate query sau khi sửa thành công.
- Cập nhật link và cách tính của thông báo Jira Bot.
- Thêm đối soát log giữa tổng số bot và API trong giai đoạn rollout.

### Giai đoạn 5 — Rollout

- Bật bằng feature flag cho một project pilot.
- Chạy evaluator ở shadow mode và so sánh với thông báo hiện tại tối thiểu 5 ngày
  làm việc.
- Điều tra mọi chênh lệch trước khi bật CTA cho toàn bộ người dùng.
- Sau khi ổn định mới cân nhắc bỏ phần text tiêu chuẩn lặp lại ở các thông báo
  khác hoặc rút gọn chúng thành summary + deep link.

## 9. Kiểm thử

### 9.1 Unit test evaluator

- Points > 0 đạt estimation dù không có Original Estimate.
- Original Estimate > 0 đạt estimation dù points null.
- Cả hai null/0 thì thiếu estimation nếu profile yêu cầu.
- Profile maintenance không yêu cầu estimation.
- `timeSpent = 0/null` thiếu Worklog; số dương thì đạt.
- Fix Version rỗng/null thiếu; có version thì đạt.
- Due date null thiếu; có ngày thì đạt, kể cả đã quá hạn.
- Label không phân biệt hoa thường.
- Nhiều flow label cho kết quả theo precedence và có cảnh báo.
- Cache/field không xác định trả `unknown`, không trả `complete`.

### 9.2 API/integration test

- Chỉ trả task thuộc user hiện tại và alias hợp lệ.
- Không rò task ngoài `boardProjects`.
- Task chưa stale nhưng thiếu field vẫn xuất hiện.
- Task stale nhưng đủ field không xuất hiện trong danh sách chuẩn hóa.
- Summary luôn thỏa:

```text
totalActive = complete + incomplete + unknown
```

- Missing count khớp danh sách task.
- Project/status filter cho kết quả nhất quán.
- User chưa cấu hình Jira username nhận trạng thái hướng dẫn cấu hình, không nhận
  sai kết quả "0 task".

### 9.3 UI/E2E

- Deep link từ bot mở đúng góc nhìn và tab.
- Empty state phân biệt: không có task, mọi task đạt chuẩn, không có task khớp bộ
  lọc và không xác định được Jira username.
- Chọn task rồi mở Bulk Edit giữ đúng danh sách key.
- Sau khi sửa đủ field, task biến mất và KPI cập nhật.
- Danh sách dài phân trang/xem thêm không mất selection.
- Hoạt động ở 375px, 768px, 1024px và 1440px; không cuộn ngang ngoài bảng có
  chủ đích.

## 10. Quan sát và đo lường

Theo dõi tối thiểu:

- Số task active, incomplete và unknown theo project/policy.
- Tỷ lệ task đạt chuẩn theo tuần.
- Số task được mở từ tab chuẩn hóa.
- Số lượt chuyển sang Bulk Edit và số lượt sửa thành công/partial failure.
- Chênh lệch số liệu giữa bot và web.
- Tuổi dữ liệu Jira cache và số kết quả `unknown`.

Không dùng số task thiếu chuẩn theo cá nhân làm bảng xếp hạng hiệu suất. Dữ liệu
phục vụ nhắc việc, cải thiện chất lượng dữ liệu và hỗ trợ vận hành.

## 11. Rủi ro và biện pháp

| Rủi ro | Ảnh hưởng | Biện pháp |
|---|---|---|
| Web và bot dùng hai policy | Người dùng thấy số liệu mâu thuẫn | Một evaluator/contract có version |
| Đọc Estimate từ `raw` | Sai kiểu hoặc mất field sau thay đổi payload | Thêm cột typed và backfill |
| Policy theo label chưa rõ | False positive, người dùng mất niềm tin | Shadow mode, PO duyệt matrix, feature flag |
| Cache Jira cũ | Báo thiếu field đã được sửa | Freshness indicator, trạng thái `unknown`, nút refresh |
| Trộn stale với chuẩn hóa | KPI khó hiểu, danh sách lặp | Hai tab/hàng đợi, cùng một task model và cờ `isStale` |
| Bulk Edit chưa nhận selection từ URL | CTA không tạo được hành động nhanh | Mở rộng contract selection có validate và giới hạn số key |
| Query giới hạn 2.000 issue | KPI thiếu dữ liệu âm thầm | Pagination/DB aggregation và telemetry truncation |

## 12. Tiêu chí nghiệm thu

Tính năng hoàn thành khi:

1. Người dùng mở `/stale` và thấy số task cá nhân chưa chuẩn hóa độc lập với số
   task tồn đọng.
2. Mỗi task chưa đạt chuẩn liệt kê chính xác các field còn thiếu theo policy.
3. Task chưa vượt SLA vẫn xuất hiện nếu thiếu field bắt buộc.
4. Task đủ chuẩn nhưng bị ngâm chỉ xuất hiện trong phân tích tồn đọng.
5. Người dùng có thể mở task hoặc đưa các task đã chọn vào luồng Bulk Edit.
6. Sau khi cập nhật Jira và refresh cache, kết quả cùng KPI thay đổi đúng.
7. Bot và web dùng cùng policy version, tổng số khớp nhau với cùng snapshot dữ
   liệu.
8. Không rò dữ liệu ngoài project/user scope và không có trạng thái xanh giả khi
   dữ liệu `unknown`.
9. Unit, API và E2E test nêu trên đều pass; UI đạt yêu cầu light/dark,
   accessibility và responsive của design system.

## 13. Các quyết định cần xác nhận trước khi code

1. "Task đang hoạt động" gồm toàn bộ status chưa Done hay chỉ In Progress/In
   Review?
2. `flow-bug`, `flow-defect`, `flow-debt` có thực sự được miễn estimation không?
3. Task không có `flow-*` label dùng profile mặc định hay được báo thêm lỗi thiếu
   phân loại?
4. Worklog chỉ cần tổng `timeSpent > 0` hay phải có worklog trong ngày/sprint
   hiện tại?
5. Fix Version released/archived có được tính là hợp lệ cho task đang hoạt động
   không?
6. CTA MVP chỉ mở trang chi tiết/Bulk Edit hay cho phép sửa nhanh ngay tại
   `/stale`?

Khuyến nghị mặc định: kiểm tra mọi task non-Done, áp dụng profile theo bảng ở
mục 4.2, yêu cầu `timeSpent > 0`, chỉ chấp nhận Fix Version còn hợp lệ, và dùng
Bulk Edit làm đường ghi duy nhất trong MVP.
