# NoMTF 投稿 API

投稿 API 用于从外部脚本提交稿件，支持先上传图片，再把图片 key 放进投稿 JSON。正文里已有的站内图片链接会在 Markdown 备份里转换成文件名占位。

## 开启方式

生产环境需要先设置 Worker Secret：

```bash
npx wrangler secret put SUBMISSION_API_KEY
```

未设置 `SUBMISSION_API_KEY` 时，接口会返回 `503`，避免裸奔开放投稿。

## 接口

### 上传图片

```http
POST /api/submissions/media
X-NoMTF-Submit-Key: <SUBMISSION_API_KEY>
Content-Type: multipart/form-data
```

字段：

- `file`：JPG、PNG、GIF、WebP 或 AVIF，最大 15MB。

返回：

```json
{
  "ok": true,
  "key": "uploads/2026-05-04/xxx.jpg",
  "url": "/media/uploads/2026-05-04/xxx.jpg"
}
```

### 创建投稿

```http
POST /api/submissions
X-NoMTF-Submit-Key: <SUBMISSION_API_KEY>
Content-Type: application/json
```

也可以使用：

```http
Authorization: Bearer <SUBMISSION_API_KEY>
```

## JSON 字段

```json
{
  "title": "标题，必填，2-120 字",
  "summary": "摘要，可选，最多 240 字",
  "content": "正文，必填，至少 10 字",
  "finalRating": "仅 rating 分类必填：最终等级，格式为 1-、1、1+ 到 5-、5、5+",
  "ratingReason": "仅 rating 分类必填，最多 240 字",
  "twitterRef": "仅 rating 分类必填：推特链接、@用户名或占位符，最多 160 字",
  "hazardLevel": "仅 rating 分类必填：1-5",
  "category": "rating",
  "tags": "标签1, 标签2",
  "slug": "optional-custom-slug",
  "coverKey": "上传图片返回的 key，可选，仅 1 张封面",
  "bodyImageKeys": ["上传图片返回的 key，最多 10 张，会追加到正文末尾"],
  "nsfw": false
}
```

`category` 可选：

- `rating`：进入审核队列，需要 `finalRating`、`ratingReason`、`twitterRef`、`hazardLevel`。
- `talk`：杂谈页，直接公开，不需要评级、评级原因或推特链接。
- `about`：不允许 API 发布，只能管理员在后台发布。

## 返回示例

```json
{
  "ok": true,
  "id": "post-id",
  "slug": "post-slug",
  "status": "pending",
  "category": "rating"
}
```

## 限制

- 每个 IP 每分钟最多 20 次投稿 API 调用。
- 创建投稿成功后，同一 IP 30 秒内不能再创建下一篇；返回 `429` 时会带 `Retry-After`。
- 图片上传接口每个 IP 10 分钟最多 60 次。
- 管理员后台仍可审核、编辑、置顶或删除 API 投稿。
- 请不要把 `SUBMISSION_API_KEY` 放进浏览器前端代码。

## Telegram Bot

机器人走 `/api/telegram/webhook`，需要设置：

```bash
npx wrangler secret put TELEGRAM_BOT_TOKEN
npx wrangler secret put TELEGRAM_WEBHOOK_SECRET
```

Webhook 需要带 Telegram 的 `secret_token`，机器人会引导用户逐步投稿，支持封面图和最多 10 张正文图片。投稿成功后会额外发送通知；30 秒投稿冷却未结束时会提示剩余秒数。
