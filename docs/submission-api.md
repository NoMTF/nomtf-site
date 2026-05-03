# NoMTF 投稿 API

投稿 API 用于从外部脚本提交文字稿件，不负责上传图片。图片请继续走站内上传或后台编辑；正文里已有的图片链接会在 Markdown 备份里转换成文件名占位。

## 开启方式

生产环境需要先设置 Worker Secret：

```bash
npx wrangler secret put SUBMISSION_API_KEY
```

未设置 `SUBMISSION_API_KEY` 时，接口会返回 `503`，避免裸奔开放投稿。

## 接口

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
  "ratingReason": "评级原因，必填，最多 240 字",
  "twitterRef": "推特链接、@用户名或占位符，必填，最多 160 字",
  "hazardLevel": 3,
  "category": "rating",
  "tags": "标签1, 标签2",
  "slug": "optional-custom-slug",
  "nsfw": false
}
```

`category` 可选：

- `rating`：进入审核队列。
- `talk`：杂谈页，直接公开。
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
- 管理员后台仍可审核、编辑、置顶或删除 API 投稿。
- 请不要把 `SUBMISSION_API_KEY` 放进浏览器前端代码。
