# Hướng dẫn cấu hình Webhook (Jira + Bitbucket)

Domain của app: `https://jira.kieuanhdev.id.vn`

| Nguồn | Endpoint | Xác thực |
|-------|----------|----------|
| Jira | `https://jira.kieuanhdev.id.vn/api/webhooks/jira` | Header `X-Atlassian-Token: <secret>` hoặc `X-Webhook-Signature: <hmac-sha256-hex>` |
| Bitbucket DC | `https://jira.kieuanhdev.id.vn/api/webhooks/bitbucket` | Header `X-Hub-Signature: sha256=<hmac>` (Bitbucket tự gửi) |

Mỗi nguồn dùng **một secret chung** cho mọi dự án/repo.

## 1. Tạo secret và cấu hình app

```bash
openssl rand -hex 32   # chạy 2 lần: một cho Jira, một cho Bitbucket
```

Điền vào `.env` rồi restart `web` (và `worker`):

```env
JIRA_WEBHOOK_SECRET=<secret-jira>
BITBUCKET_WEBHOOK_SECRET=<secret-bitbucket>
```

> **Bảo mật:** Trong môi trường production (`NODE_ENV=production`), app sẽ từ chối (`401`) mọi request webhook nếu chưa cấu hình secret tương ứng. Trong môi trường development/test, request được chấp nhận kèm log warning một lần. Luôn đặt secret trước khi mở endpoint ra ngoài.

## 2. Cấu hình Jira (Server / Data Center)

1. Vào **Jira Administration → System → WebHooks → Create a WebHook**.
2. Điền:
   - **Name:** `Team Task Bot`
   - **URL:** `https://jira.kieuanhdev.id.vn/api/webhooks/jira?token=<secret-jira>`
   - **Events:**
     - Issue: created, updated, deleted
     - Comment: created, updated, deleted
     - Sprint / Version (nếu dùng release, sprint)
   - **JQL filter:** để trống (mọi dự án), hoặc `project in (ABC, XYZ)`.
3. Jira không tự thêm header tùy ý, nên để reverse proxy đổi `?token=` thành header `X-Atlassian-Token`.

Ví dụ nginx:

```nginx
location /api/webhooks/jira {
    if ($arg_token != "<secret-jira>") { return 401; }
    proxy_set_header X-Atlassian-Token "<secret-jira>";
    proxy_pass http://127.0.0.1:3000;   # đổi theo cổng/service của web
}
```

Nếu dùng Automation for Jira hoặc plugin cho phép thêm header, gửi thẳng `X-Atlassian-Token: <secret-jira>` và bỏ `?token=` khỏi URL.

4. Kiểm tra endpoint sống:

```bash
curl https://jira.kieuanhdev.id.vn/api/webhooks/jira
# {"ok":true,"source":"jira"}
```

5. Sửa thử một issue trên Jira, xem log `web` và `worker`.

## 3. Cấu hình Bitbucket Data Center

Cấp **Project** (áp dụng mọi repo trong project) hoặc cấp **Repository**:

**Settings → Webhooks → Create webhook**

- **Name:** `Team Task Bot`
- **URL:** `https://jira.kieuanhdev.id.vn/api/webhooks/bitbucket`
- **Secret:** `<secret-bitbucket>`
- **Events:**
  - Repository: Push
  - Pull request: tick toàn bộ, đặc biệt **Merged** (`pr:merged`) và **Comment** (added, edited, deleted).
- Bấm **Test connection**: `200` là đúng, `401` là sai secret.

> **Lưu ý tính năng Cảnh báo Merge trái phép:** Khi event `pr:merged` được gửi tới, bot sẽ kiểm tra người bấm merge với danh sách Leader của dự án tương ứng (cấu hình tại **Settings → Leader theo dự án**). Nếu người merge không phải Leader của dự án, bot sẽ gửi cảnh báo tức thì tới tất cả Leader của dự án đó.

Có nhiều project thì tạo webhook ở từng project với cùng URL và cùng secret.

## 4. Kiểm tra nhanh bằng tay (giả lập Bitbucket)

Test ping:
```bash
BODY='{"eventKey":"diagnostics:ping"}'
SIG=$(printf '%s' "$BODY" | openssl dgst -sha256 -hmac "<secret-bitbucket>" -hex | sed 's/^.* //')
curl -i -X POST https://jira.kieuanhdev.id.vn/api/webhooks/bitbucket \
  -H "Content-Type: application/json" \
  -H "X-Hub-Signature: sha256=$SIG" \
  -d "$BODY"
```

Test cảnh báo merge không phải leader (`pr:merged`):
```bash
BODY='{"eventKey":"pr:merged","actor":{"name":"dev_user","displayName":"Dev User"},"repository":{"slug":"core-repo","project":{"key":"EPM"}},"pullRequest":{"id":101,"title":"Refactor auth","fromRef":{"branch":"feature/EPM-123"},"toRef":{"branch":"master"}}}'
SIG=$(printf '%s' "$BODY" | openssl dgst -sha256 -hmac "<secret-bitbucket>" -hex | sed 's/^.* //')
curl -i -X POST https://jira.kieuanhdev.id.vn/api/webhooks/bitbucket \
  -H "Content-Type: application/json" \
  -H "X-Hub-Signature: sha256=$SIG" \
  -d "$BODY"
```

## 5. Xử lý sự cố

| Triệu chứng | Nguyên nhân thường gặp |
|-------------|------------------------|
| `401 invalid signature` | Sai secret, hoặc proxy không thêm header `X-Atlassian-Token` |
| `429 rate limited` | Quá 100 request / 10 giây mỗi nguồn; Jira/Bitbucket sẽ thử lại |
| Jira/Bitbucket không gọi được | Firewall, DNS, hoặc chứng chỉ TLS không hợp lệ phía server Jira/Bitbucket |
| Có event nhưng không thấy cập nhật | `worker` không chạy, kiểm tra `/api/health` |

Lưu ý: webhook không đảm bảo 100% tới nơi, app vẫn có đồng bộ định kỳ để bù event bị lỡ.
