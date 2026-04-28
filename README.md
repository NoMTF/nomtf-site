# NoMTF 不药娘网

一个基于 Cloudflare Workers 的娱乐向评级社区 MVP。站点支持免责声明弹窗、注册登录、发帖评级、标签、封面图、正文图片、回复、点赞、搜索，以及管理员删帖、删回复、用户/访客权限管理。

## 技术栈

- Cloudflare Workers: API 与页面服务
- D1: 用户、文章、标签、评论、点赞、权限、协议记录
- R2: 封面图与正文图片
- Hono: Worker 路由
- 原生 HTML/CSS/JS: 粉蓝白界面与后台

## 本地开发

```bash
npm install
npm run types
npm run db:migrate:local
npm run dev
```

打开：

```txt
http://127.0.0.1:8787
```

本地 `.dev.vars` 已放了开发用的 `SESSION_SECRET` 和 `ADMIN_INVITE_CODE`。部署前请换成你自己的值。

## 首个管理员

有两种方式获得管理员：

- 第一个注册用户会自动成为管理员。
- 注册时填写 `ADMIN_INVITE_CODE`，该用户也会成为管理员。

本地默认邀请码：

```txt
nomtf-local-admin
```

## 创建 Cloudflare 资源

```bash
npx wrangler d1 create nomtf
npx wrangler r2 bucket create nomtf
```

如果你重新创建 D1，把 `wrangler d1 create` 返回的 `database_id` 填到 `wrangler.jsonc`：

```jsonc
"d1_databases": [
  {
    "binding": "DB",
    "database_name": "nomtf",
    "database_id": "替换成真实 database_id",
    "migrations_dir": "migrations"
  }
]
```

设置生产 secrets：

```bash
npx wrangler secret put SESSION_SECRET
npx wrangler secret put ADMIN_INVITE_CODE
```

应用远程数据库迁移：

```bash
npm run db:migrate:remote
```

部署：

```bash
npm run deploy
```

## GitHub Actions 部署

仓库里已经包含 `.github/workflows/deploy.yml`。在 GitHub 仓库 Settings -> Secrets and variables -> Actions 添加：

```txt
CLOUDFLARE_API_TOKEN
CLOUDFLARE_ACCOUNT_ID
```

然后推送到 `main` 分支即可自动部署。

## 内容边界

NoMTF 是娱乐向评级社区，不应被用作现实骚扰、仇恨、网暴或煽动平台。用户协议弹窗和后台权限管理已经内置，但真正上线时仍建议保留人工审核流程。

## 已包含

- 注册、登录、退出
- HttpOnly session cookie
- D1 PBKDF2 密码哈希
- 文章发布、更新、列表、详情、搜索
- 1-5 级危害评级
- 标签
- R2 图片上传与读取
- 回复
- 点赞
- 管理员删帖、删回复
- 管理员调整用户角色/状态
- 管理员添加/删除 visitor/user/ip_hash 权限规则
- 管理员图形编辑模式：可在正常页面外观下点击搜索栏，修改提示文字和搜索框宽度
- 免责声明和用户协议弹窗

## 暂未包含

- 更完整的 UI 编辑器组件覆盖面
- 邮箱验证和找回密码
- 第三方 OAuth 登录
- 自动内容审核
- 全文索引 FTS
