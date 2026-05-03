import { Hono } from "hono";
import type { Context, Next } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { appScript, renderBlockedPage, renderPage, styles } from "./ui";

type Role = "user" | "admin";
type UserStatus = "active" | "muted" | "banned";
type PermissionLevel = "allow" | "muted" | "banned";
type PostStatus = "draft" | "pending" | "published" | "hidden" | "rejected" | "deleted";

type User = {
  id: string;
  username: string;
  email: string;
  role: Role;
  status: UserStatus;
  created_at: string;
};

type SessionUser = User & {
  session_id: string;
  expires_at: string;
};

type UiConfig = {
  searchPlaceholder: string;
  searchWidthPx: number;
  editorOverrides: ElementOverride[];
};

type ElementOverride = {
  selector: string;
  textChanged?: boolean;
  text?: string;
  placeholderChanged?: boolean;
  placeholder?: string;
  styleKeys: ElementStyleKey[];
  styles: Partial<Record<ElementStyleKey, string>>;
};

type ElementStyleKey = "width" | "height" | "padding" | "margin" | "fontSize" | "color" | "backgroundColor" | "borderRadius";

type Variables = {
  user: User | null;
  visitorId: string;
  permission: PermissionLevel;
  ipHash: string;
};

type RateLimitRule = {
  bucket: string;
  subject: string;
  limit: number;
  windowSeconds: number;
  message: string;
};

type AppEnv = {
  Bindings: Env;
  Variables: Variables;
};

type AppContext = Context<AppEnv>;

const app = new Hono<AppEnv>();
const encoder = new TextEncoder();
const SESSION_COOKIE = "nomtf_sid";
const VISITOR_COOKIE = "nomtf_vid";
const TERMS_VERSION = "2026-04-28";
const MAX_POST_BYTES = 80_000;
const MAX_COMMENT_BYTES = 4_000;
const MAX_IMAGE_BYTES = 15 * 1024 * 1024;
const MAX_MULTIPART_IMAGE_BYTES = MAX_IMAGE_BYTES + 1024 * 1024;
const PASSWORD_ITERATIONS = 100_000;
const PASSWORD_MIN_LENGTH = 10;
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;
const REGISTER_IP_COOLDOWN_SECONDS = 5 * 60;
const CONTENT_WRITE_COOLDOWN_SECONDS = 30;
const LOGIN_FAILURE_WINDOW_SECONDS = 15 * 60;
const LOGIN_LOCK_SECONDS = 15 * 60;
const LOGIN_EMAIL_LOCK_THRESHOLD = 5;
const LOGIN_IP_LOCK_THRESHOLD = 20;
const WEAK_PASSWORD_PARTS = [
  "123456",
  "123456789",
  "000000",
  "111111",
  "654321",
  "qwerty",
  "password",
  "admin",
  "administrator",
  "iloveyou",
  "letmein",
  "nomtf"
];
const DEFAULT_UI_CONFIG: UiConfig = {
  searchPlaceholder: "搜索物品、现象、标签",
  searchWidthPx: 920,
  editorOverrides: []
};

app.onError((err, c) => {
  console.error(JSON.stringify({ level: "error", message: err.message, stack: err.stack }));
  return c.json({ error: "服务器暂时开小差了" }, 500);
});

app.use("*", bindRequestContext);
app.use("/api/*", async (c, next) => {
  if (!isSafeMethod(c.req.method) && !isSameOrigin(c)) {
    return c.json({ error: "跨站请求被拒绝" }, 403);
  }
  if (!isSafeMethod(c.req.method)) {
    const limited = await enforceFixedWindowRateLimit(c, {
      bucket: "api_write_ip",
      subject: ipSubject(c),
      limit: 180,
      windowSeconds: 60,
      message: "请求太频繁了，请稍后再试"
    });
    if (limited) return limited;
  }
  await next();
});

app.get("/assets/app.css", (c) => {
  return new Response(styles, {
    headers: {
      "Content-Type": "text/css; charset=utf-8",
      "Cache-Control": "no-store"
    }
  });
});

app.get("/assets/app.js", (c) => {
  return new Response(appScript, {
    headers: {
      "Content-Type": "text/javascript; charset=utf-8",
      "Cache-Control": "no-store"
    }
  });
});

app.get("/media/*", async (c) => {
  const key = c.req.path.replace(/^\/media\//, "");
  if (!key || key.includes("..")) {
    return new Response("Not found", { status: 404 });
  }

  const object = await c.env.MEDIA.get(key);
  if (!object?.body) {
    return new Response("Not found", { status: 404 });
  }

  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set("etag", object.httpEtag);
  headers.set("Cache-Control", "public, max-age=31536000, immutable");
  if (!headers.has("Content-Type")) {
    headers.set("Content-Type", "application/octet-stream");
  }

  return new Response(object.body, { headers });
});

app.get("/api/me", async (c) => {
  const user = c.get("user");
  return c.json({
    user,
    visitorId: c.get("visitorId"),
    permission: c.get("permission"),
    termsVersion: TERMS_VERSION
  });
});

app.get("/api/site-settings", async (c) => {
  return c.json({
    ui: await getUiConfig(c.env.DB)
  });
});

app.post("/api/register", async (c) => {
  const attemptLimited = await enforceFixedWindowRateLimit(c, {
    bucket: "register_attempt_ip",
    subject: ipSubject(c),
    limit: 8,
    windowSeconds: REGISTER_IP_COOLDOWN_SECONDS,
    message: "这个网络注册太频繁了，请 5 分钟后再试"
  });
  if (attemptLimited) return attemptLimited;

  const body = await readJson(c);
  const username = cleanName(body.username);
  const email = String(body.email ?? "").trim().toLowerCase();
  const password = String(body.password ?? "");
  const inviteCode = String(body.inviteCode ?? "");

  if (!username || username.length < 2 || username.length > 24) {
    return c.json({ error: "昵称需要 2-24 个字符" }, 400);
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return c.json({ error: "邮箱格式不对" }, 400);
  }
  const passwordError = validatePasswordStrength(password, email, username);
  if (passwordError) return c.json({ error: passwordError }, 400);
  const registeredRecently = await requireCooldownAvailable(
    c,
    "register_success_ip",
    ipSubject(c),
    "同一 IP 5 分钟内只能注册 1 个账号"
  );
  if (registeredRecently) return registeredRecently;

  const now = nowIso();
  const existingCount = await c.env.DB.prepare("SELECT COUNT(*) AS count FROM users").first<{ count: number }>();
  const isFirstUser = Number(existingCount?.count ?? 0) === 0;
  const isInviteAdmin = Boolean(c.env.ADMIN_INVITE_CODE) && safeEqualText(inviteCode, c.env.ADMIN_INVITE_CODE);
  const role: Role = isFirstUser || isInviteAdmin ? "admin" : "user";
  const userId = crypto.randomUUID();
  const passwordHash = await hashPassword(password);

  try {
    await c.env.DB.prepare(
      "INSERT INTO users (id, username, email, password_hash, role, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 'active', ?, ?)"
    )
      .bind(userId, username, email, passwordHash, role, now, now)
      .run();
  } catch {
    return c.json({ error: "昵称或邮箱已经被占用" }, 409);
  }

  await setCooldown(c.env.DB, "register_success_ip", ipSubject(c), REGISTER_IP_COOLDOWN_SECONDS);
  await createSession(c, userId);
  return c.json({ ok: true, user: await getUserById(c.env.DB, userId) }, 201);
});

app.post("/api/login", async (c) => {
  const body = await readJson(c);
  const email = String(body.email ?? "").trim().toLowerCase();
  const password = String(body.password ?? "");
  const loginEmailSubject = await hashedSubject(c, "login_email", email || "empty");
  const loginIpSubject = ipSubject(c);
  const limited = await enforceRateLimits(c, [
    {
      bucket: "login_ip",
      subject: ipSubject(c),
      limit: 30,
      windowSeconds: 10 * 60,
      message: "登录尝试太频繁了，请 10 分钟后再试"
    },
    {
      bucket: "login_email",
      subject: await hashedSubject(c, "email", email || "empty"),
      limit: 10,
      windowSeconds: 10 * 60,
      message: "这个邮箱登录尝试太多了，请 10 分钟后再试"
    }
  ]);
  if (limited) return limited;
  const loginLocked = await enforceLoginLock(c, loginEmailSubject, loginIpSubject);
  if (loginLocked) return loginLocked;

  const user = await c.env.DB.prepare(
    "SELECT id, username, email, password_hash, role, status, created_at FROM users WHERE email = ?"
  ).bind(email).first<(User & { password_hash: string })>();

  if (!user || user.status === "banned" || !(await verifyPassword(password, user.password_hash))) {
    await recordLoginFailure(c.env.DB, loginEmailSubject, LOGIN_EMAIL_LOCK_THRESHOLD);
    await recordLoginFailure(c.env.DB, loginIpSubject, LOGIN_IP_LOCK_THRESHOLD);
    return c.json({ error: "邮箱或密码不正确" }, 401);
  }

  await clearLoginFailures(c.env.DB, loginEmailSubject);
  const loginAt = nowIso();
  await c.env.DB.prepare("UPDATE users SET last_login_at = ?, updated_at = ? WHERE id = ?")
    .bind(loginAt, loginAt, user.id)
    .run();
  await createSession(c, user.id);
  const { password_hash: _, ...safeUser } = user;
  return c.json({ ok: true, user: safeUser });
});

app.post("/api/logout", async (c) => {
  const token = getCookie(c, SESSION_COOKIE);
  if (token) {
    const tokenHash = await sha256Hex(token);
    await c.env.DB.prepare("DELETE FROM sessions WHERE token_hash = ?").bind(tokenHash).run();
  }
  deleteCookie(c, SESSION_COOKIE, { path: "/" });
  return c.json({ ok: true });
});

app.post("/api/account/password", async (c) => {
  const user = requireActiveUser(c);
  if (user instanceof Response) return user;
  const limited = await enforceRateLimits(c, [
    {
      bucket: "password_change_user",
      subject: userSubject(user),
      limit: 5,
      windowSeconds: 60 * 60,
      message: "改密码尝试太频繁了，请稍后再试"
    },
    {
      bucket: "password_change_ip",
      subject: ipSubject(c),
      limit: 12,
      windowSeconds: 60 * 60,
      message: "这个网络改密码尝试太频繁了，请稍后再试"
    }
  ]);
  if (limited) return limited;

  const body = await readJson(c);
  const currentPassword = String(body.currentPassword ?? "");
  const newPassword = String(body.newPassword ?? "");
  const row = await c.env.DB.prepare("SELECT id, username, email, password_hash FROM users WHERE id = ?")
    .bind(user.id)
    .first<{ id: string; username: string; email: string; password_hash: string }>();
  if (!row || !(await verifyPassword(currentPassword, row.password_hash))) {
    return c.json({ error: "当前密码不正确" }, 401);
  }
  if (await verifyPassword(newPassword, row.password_hash)) {
    return c.json({ error: "新密码不能和旧密码一样" }, 400);
  }
  const passwordError = validatePasswordStrength(newPassword, row.email, row.username);
  if (passwordError) return c.json({ error: passwordError }, 400);

  const now = nowIso();
  const newHash = await hashPassword(newPassword);
  await c.env.DB.prepare("UPDATE users SET password_hash = ?, password_changed_at = ?, updated_at = ? WHERE id = ?")
    .bind(newHash, now, now, user.id)
    .run();
  await deleteOtherSessions(c, user.id);
  return c.json({ ok: true });
});

app.post("/api/account/logout-others", async (c) => {
  const user = requireActiveUser(c);
  if (user instanceof Response) return user;
  await deleteOtherSessions(c, user.id);
  return c.json({ ok: true });
});

app.post("/api/agreements", async (c) => {
  const limited = await enforceFixedWindowRateLimit(c, {
    bucket: "agreement_ip",
    subject: ipSubject(c),
    limit: 20,
    windowSeconds: 60,
    message: "确认请求太频繁了，请稍后再试"
  });
  if (limited) return limited;

  const visitorId = c.get("visitorId");
  const user = c.get("user");
  const userAgent = c.req.header("User-Agent") ?? "";
  await c.env.DB.prepare(
    "INSERT INTO agreement_events (id, user_id, visitor_id, version, user_agent, ip_hash, accepted_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
  )
    .bind(crypto.randomUUID(), user?.id ?? null, visitorId, TERMS_VERSION, userAgent.slice(0, 300), c.get("ipHash"), nowIso())
    .run();
  return c.json({ ok: true });
});

app.get("/api/posts", async (c) => {
  const limited = await enforceFixedWindowRateLimit(c, {
    bucket: "posts_read_ip",
    subject: ipSubject(c),
    limit: 240,
    windowSeconds: 60,
    message: "刷新太频繁了，请稍后再试"
  });
  if (limited) return limited;

  const q = String(c.req.query("q") ?? "").trim();
  const tag = String(c.req.query("tag") ?? "").trim();
  const level = Number(c.req.query("level") ?? 0);
  const page = Math.max(1, Number(c.req.query("page") ?? 1));
  const limit = Math.min(30, Math.max(1, Number(c.req.query("limit") ?? 12)));
  const offset = (page - 1) * limit;
  const visitorId = c.get("visitorId");
  const user = c.get("user");
  const subjectType = user ? "user" : "visitor";
  const subjectId = user?.id ?? visitorId;

  const conditions = ["p.status = 'published'"];
  const params: Array<string | number> = [];
  if (q) {
    const like = `%${q}%`;
    conditions.push("(p.title LIKE ? OR p.summary LIKE ? OR p.content LIKE ?)");
    params.push(like, like, like);
  }
  if (level >= 1 && level <= 5) {
    conditions.push("p.hazard_level = ?");
    params.push(level);
  }
  if (tag) {
    conditions.push(
      "EXISTS (SELECT 1 FROM post_tags pt2 JOIN tags t2 ON t2.id = pt2.tag_id WHERE pt2.post_id = p.id AND (t2.slug = ? OR t2.name = ?))"
    );
    params.push(slugify(tag), tag);
  }

  const sql = `
    SELECT
      p.id, p.title, p.slug, p.summary, p.content, p.hazard_level, p.nsfw, p.cover_key, p.status, p.created_at, p.updated_at,
      u.username AS author_name,
      COALESCE((SELECT COUNT(*) FROM post_likes pl WHERE pl.post_id = p.id), 0) AS like_count,
      COALESCE((SELECT COUNT(*) FROM comments cm WHERE cm.post_id = p.id AND cm.status = 'published'), 0) AS comment_count,
      EXISTS(SELECT 1 FROM post_likes mine WHERE mine.post_id = p.id AND mine.subject_type = ? AND mine.subject_id = ?) AS liked_by_me,
      COALESCE((SELECT group_concat(t.name, '|') FROM post_tags pt JOIN tags t ON t.id = pt.tag_id WHERE pt.post_id = p.id), '') AS tags
    FROM posts p
    JOIN users u ON u.id = p.author_id
    WHERE ${conditions.join(" AND ")}
    ORDER BY p.created_at DESC
    LIMIT ? OFFSET ?
  `;
  const result = await c.env.DB.prepare(sql)
    .bind(subjectType, subjectId, ...params, limit, offset)
    .all<Record<string, unknown>>();

  return c.json({
    posts: (result.results ?? []).map(normalizePostRow),
    page,
    limit
  });
});

app.get("/api/posts/:slug", async (c) => {
  const limited = await enforceFixedWindowRateLimit(c, {
    bucket: "post_read_ip",
    subject: ipSubject(c),
    limit: 240,
    windowSeconds: 60,
    message: "打开帖子太频繁了，请稍后再试"
  });
  if (limited) return limited;

  const slug = c.req.param("slug");
  const visitorId = c.get("visitorId");
  const user = c.get("user");
  const subjectType = user ? "user" : "visitor";
  const subjectId = user?.id ?? visitorId;
  const row = await c.env.DB.prepare(`
    SELECT
      p.*,
      u.username AS author_name,
      COALESCE((SELECT COUNT(*) FROM post_likes pl WHERE pl.post_id = p.id), 0) AS like_count,
      COALESCE((SELECT COUNT(*) FROM comments cm WHERE cm.post_id = p.id AND cm.status = 'published'), 0) AS comment_count,
      EXISTS(SELECT 1 FROM post_likes mine WHERE mine.post_id = p.id AND mine.subject_type = ? AND mine.subject_id = ?) AS liked_by_me,
      COALESCE((SELECT group_concat(t.name, '|') FROM post_tags pt JOIN tags t ON t.id = pt.tag_id WHERE pt.post_id = p.id), '') AS tags
    FROM posts p
    JOIN users u ON u.id = p.author_id
    WHERE p.slug = ? AND p.status = 'published'
  `).bind(subjectType, subjectId, slug).first<Record<string, unknown>>();

  if (!row) {
    return c.json({ error: "帖子不存在" }, 404);
  }

  const comments = await c.env.DB.prepare(`
    SELECT cm.id, cm.content, cm.parent_id, cm.created_at, cm.updated_at, cm.visitor_id, u.username AS author_name
    FROM comments cm
    LEFT JOIN users u ON u.id = cm.author_id
    WHERE cm.post_id = ? AND cm.status = 'published'
    ORDER BY cm.created_at ASC
  `).bind(String(row.id)).all<Record<string, unknown>>();

  return c.json({
    post: normalizePostRow(row),
    comments: (comments.results ?? []).map(normalizeCommentRow)
  });
});

app.post("/api/posts", async (c) => {
  const user = requireActiveUser(c);
  if (user instanceof Response) return user;
  const denied = requireWriteAccess(c);
  if (denied) return denied;

  const body = await readJson(c);
  const title = cleanText(body.title, 120);
  const summary = cleanText(body.summary, 240);
  const content = cleanText(body.content, MAX_POST_BYTES);
  const hazardLevel = Number(body.hazardLevel ?? body.hazard_level);
  const nsfw = Boolean(body.nsfw);
  const requestedSlug = cleanText(body.slug, 90);
  const coverKey = optionalR2Key(body.coverKey);
  const tags = cleanTags(body.tags);
  const status: PostStatus = user.role === "admin"
    ? (body.status === "draft" ? "draft" : "published")
    : "pending";

  if (!title || title.length < 2) {
    return c.json({ error: "标题太短了" }, 400);
  }
  if (!content || content.length < 10) {
    return c.json({ error: "正文至少 10 个字符" }, 400);
  }
  if (!Number.isInteger(hazardLevel) || hazardLevel < 1 || hazardLevel > 5) {
    return c.json({ error: "评级需要是 1-5 级" }, 400);
  }
  const cooldown = await enforceContentWriteCooldown(c, user);
  if (cooldown) return cooldown;

  const now = nowIso();
  const id = crypto.randomUUID();
  const slug = await uniqueSlug(c.env.DB, requestedSlug || title);
  await c.env.DB.prepare(`
    INSERT INTO posts (id, title, slug, summary, content, hazard_level, nsfw, cover_key, status, author_id, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `)
    .bind(id, title, slug, summary, content, hazardLevel, nsfw ? 1 : 0, coverKey, status, user.id, now, now)
    .run();

  await syncTags(c.env.DB, id, tags);
  return c.json({ ok: true, id, slug, status }, 201);
});

app.patch("/api/posts/:id", async (c) => {
  const user = requireActiveUser(c);
  if (user instanceof Response) return user;
  const post = await c.env.DB.prepare("SELECT id, author_id FROM posts WHERE id = ? AND status != 'deleted'")
    .bind(c.req.param("id"))
    .first<{ id: string; author_id: string }>();
  if (!post) return c.json({ error: "帖子不存在" }, 404);
  if (post.author_id !== user.id && user.role !== "admin") return c.json({ error: "没有权限" }, 403);

  const body = await readJson(c);
  const title = cleanText(body.title, 120);
  const summary = cleanText(body.summary, 240);
  const content = cleanText(body.content, MAX_POST_BYTES);
  const hazardLevel = Number(body.hazardLevel ?? body.hazard_level);
  const nsfw = Boolean(body.nsfw);
  const coverKey = optionalR2Key(body.coverKey);
  const tags = cleanTags(body.tags);
  const status: PostStatus = user.role === "admin"
    ? cleanPostStatus(body.status, "published")
    : "pending";
  if (!title || !content || !Number.isInteger(hazardLevel) || hazardLevel < 1 || hazardLevel > 5) {
    return c.json({ error: "帖子字段不完整" }, 400);
  }

  await c.env.DB.prepare(`
    UPDATE posts
    SET title = ?, summary = ?, content = ?, hazard_level = ?, nsfw = ?, cover_key = ?, status = ?, updated_at = ?
    WHERE id = ?
  `).bind(title, summary, content, hazardLevel, nsfw ? 1 : 0, coverKey, status, nowIso(), post.id).run();
  await syncTags(c.env.DB, post.id, tags);
  return c.json({ ok: true, status });
});

app.post("/api/posts/:id/like", async (c) => {
  const denied = requireWriteAccess(c);
  if (denied) return denied;
  const limited = await enforceRateLimits(c, [
    {
      bucket: "like_actor",
      subject: actorSubject(c),
      limit: 60,
      windowSeconds: 60,
      message: "点赞太快了，请稍后再试"
    },
    {
      bucket: "like_ip",
      subject: ipSubject(c),
      limit: 120,
      windowSeconds: 60,
      message: "这个网络点赞太频繁了，请稍后再试"
    }
  ]);
  if (limited) return limited;

  const postId = c.req.param("id");
  const user = c.get("user");
  const subjectType = user ? "user" : "visitor";
  const subjectId = user?.id ?? c.get("visitorId");
  const existing = await c.env.DB.prepare(
    "SELECT post_id FROM post_likes WHERE post_id = ? AND subject_type = ? AND subject_id = ?"
  ).bind(postId, subjectType, subjectId).first();
  if (existing) {
    await c.env.DB.prepare("DELETE FROM post_likes WHERE post_id = ? AND subject_type = ? AND subject_id = ?")
      .bind(postId, subjectType, subjectId)
      .run();
    return c.json({ ok: true, liked: false });
  }

  await c.env.DB.prepare("INSERT INTO post_likes (post_id, subject_type, subject_id, created_at) VALUES (?, ?, ?, ?)")
    .bind(postId, subjectType, subjectId, nowIso())
    .run();
  return c.json({ ok: true, liked: true });
});

app.post("/api/posts/:id/comments", async (c) => {
  const user = requireActiveUser(c);
  if (user instanceof Response) return user;
  const denied = requireWriteAccess(c);
  if (denied) return denied;
  const postId = c.req.param("id");
  const body = await readJson(c);
  const content = cleanText(body.content, MAX_COMMENT_BYTES);
  const parentId = typeof body.parentId === "string" && body.parentId ? body.parentId : null;

  if (content.length < 2) return c.json({ error: "回复太短了" }, 400);
  const post = await c.env.DB.prepare("SELECT id FROM posts WHERE id = ? AND status = 'published'").bind(postId).first();
  if (!post) return c.json({ error: "帖子不存在" }, 404);
  const cooldown = await enforceContentWriteCooldown(c, user);
  if (cooldown) return cooldown;

  const now = nowIso();
  await c.env.DB.prepare(`
    INSERT INTO comments (id, post_id, author_id, visitor_id, parent_id, content, status, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, 'published', ?, ?)
  `).bind(crypto.randomUUID(), postId, user.id, c.get("visitorId"), parentId, content, now, now).run();
  return c.json({ ok: true }, 201);
});

app.post("/api/media", async (c) => {
  const user = requireActiveUser(c);
  if (user instanceof Response) return user;
  const denied = requireWriteAccess(c);
  if (denied) return denied;
  const contentLength = Number(c.req.header("Content-Length") ?? 0);
  if (Number.isFinite(contentLength) && contentLength > MAX_MULTIPART_IMAGE_BYTES) {
    return c.json({ error: "图片不能超过 15MB" }, 413);
  }
  const limited = await enforceRateLimits(c, [
    {
      bucket: "media_upload_user",
      subject: userSubject(user),
      limit: 40,
      windowSeconds: 10 * 60,
      message: "图片上传太频繁了，请稍后再试"
    },
    {
      bucket: "media_upload_ip",
      subject: ipSubject(c),
      limit: 80,
      windowSeconds: 10 * 60,
      message: "这个网络上传图片太频繁了，请稍后再试"
    }
  ]);
  if (limited) return limited;

  let form: FormData;
  try {
    form = await c.req.raw.formData();
  } catch {
    return c.json({ error: "图片表单解析失败" }, 400);
  }

  const file = form.get("file");
  if (!isUploadedFile(file)) {
    return c.json({ error: "没有收到图片" }, 400);
  }
  if (file.size <= 0) {
    return c.json({ error: "图片文件为空，请重新选择" }, 400);
  }
  if (file.size > MAX_IMAGE_BYTES) {
    return c.json({ error: "图片不能超过 15MB" }, 413);
  }

  const bytes = await file.arrayBuffer();
  const contentType = inferImageContentType(file.name, file.type, bytes);
  if (!contentType) {
    return c.json({ error: "只能上传 JPG、PNG、GIF、WebP 或 AVIF 图片" }, 415);
  }

  const ext = extensionFromName(file.name) || extensionFromContentType(contentType);
  const key = `uploads/${new Date().toISOString().slice(0, 10)}/${crypto.randomUUID()}${ext}`;
  await c.env.MEDIA.put(key, bytes, {
    httpMetadata: {
      contentType,
      cacheControl: "public, max-age=31536000, immutable"
    },
    customMetadata: {
      uploadedBy: user.id
    }
  });
  return c.json({ ok: true, key, url: `/media/${key}` }, 201);
});

app.get("/api/admin/posts", async (c) => {
  const user = requireAdmin(c);
  if (user instanceof Response) return user;
  const result = await c.env.DB.prepare(`
    SELECT
      p.id, p.title, p.slug, p.summary, p.hazard_level, p.nsfw, p.status,
      p.created_at, p.updated_at, p.reviewed_at,
      u.username AS author_name,
      reviewer.username AS reviewed_by_name
    FROM posts p
    JOIN users u ON u.id = p.author_id
    LEFT JOIN users reviewer ON reviewer.id = p.reviewed_by
    WHERE p.status != 'deleted'
    ORDER BY
      CASE p.status
        WHEN 'pending' THEN 0
        WHEN 'published' THEN 1
        WHEN 'hidden' THEN 2
        WHEN 'rejected' THEN 3
        ELSE 4
      END,
      p.created_at DESC
    LIMIT 100
  `).all<Record<string, unknown>>();
  return c.json({ posts: result.results ?? [] });
});

app.patch("/api/admin/posts/:id/status", async (c) => {
  const user = requireAdmin(c);
  if (user instanceof Response) return user;
  const body = await readJson(c);
  const status = cleanOptionalPostStatus(body.status);
  if (!["pending", "published", "hidden", "rejected", "draft"].includes(status)) {
    return c.json({ error: "审核状态不正确" }, 400);
  }

  const existing = await c.env.DB.prepare("SELECT id FROM posts WHERE id = ? AND status != 'deleted'")
    .bind(c.req.param("id"))
    .first<{ id: string }>();
  if (!existing) return c.json({ error: "帖子不存在" }, 404);

  const now = nowIso();
  const reviewer = status === "pending" || status === "draft" ? null : user.id;
  const reviewedAt = status === "pending" || status === "draft" ? null : now;
  await c.env.DB.prepare("UPDATE posts SET status = ?, reviewed_by = ?, reviewed_at = ?, updated_at = ? WHERE id = ?")
    .bind(status, reviewer, reviewedAt, now, existing.id)
    .run();
  return c.json({ ok: true, status });
});

app.delete("/api/admin/posts/:id", async (c) => {
  const user = requireAdmin(c);
  if (user instanceof Response) return user;
  await c.env.DB.prepare("UPDATE posts SET status = 'deleted', deleted_at = ?, updated_at = ? WHERE id = ?")
    .bind(nowIso(), nowIso(), c.req.param("id"))
    .run();
  return c.json({ ok: true });
});

app.get("/api/admin/comments", async (c) => {
  const user = requireAdmin(c);
  if (user instanceof Response) return user;
  const result = await c.env.DB.prepare(`
    SELECT cm.id, cm.content, cm.status, cm.created_at, cm.visitor_id, p.title AS post_title, u.username AS author_name
    FROM comments cm
    JOIN posts p ON p.id = cm.post_id
    LEFT JOIN users u ON u.id = cm.author_id
    ORDER BY cm.created_at DESC
    LIMIT 100
  `).all<Record<string, unknown>>();
  return c.json({ comments: result.results ?? [] });
});

app.delete("/api/admin/comments/:id", async (c) => {
  const user = requireAdmin(c);
  if (user instanceof Response) return user;
  await c.env.DB.prepare("UPDATE comments SET status = 'deleted', deleted_at = ?, updated_at = ? WHERE id = ?")
    .bind(nowIso(), nowIso(), c.req.param("id"))
    .run();
  return c.json({ ok: true });
});

app.get("/api/admin/users", async (c) => {
  const user = requireAdmin(c);
  if (user instanceof Response) return user;
  const result = await c.env.DB.prepare(`
    SELECT id, username, email, role, status, created_at
    FROM users
    ORDER BY created_at DESC
    LIMIT 100
  `).all<Record<string, unknown>>();
  return c.json({ users: result.results ?? [] });
});

app.patch("/api/admin/users/:id", async (c) => {
  const admin = requireAdmin(c);
  if (admin instanceof Response) return admin;
  const body = await readJson(c);
  const status = ["active", "muted", "banned"].includes(String(body.status)) ? String(body.status) : null;
  const role = ["user", "admin"].includes(String(body.role)) ? String(body.role) : null;
  if (!status && !role) return c.json({ error: "没有可更新字段" }, 400);
  if (c.req.param("id") === admin.id && status === "banned") return c.json({ error: "不能封禁自己" }, 400);

  const pieces: string[] = [];
  const values: string[] = [];
  if (status) {
    pieces.push("status = ?");
    values.push(status);
  }
  if (role) {
    pieces.push("role = ?");
    values.push(role);
  }
  await c.env.DB.prepare(`UPDATE users SET ${pieces.join(", ")}, updated_at = ? WHERE id = ?`)
    .bind(...values, nowIso(), c.req.param("id"))
    .run();
  return c.json({ ok: true });
});

app.post("/api/admin/users/:id/revoke-sessions", async (c) => {
  const admin = requireAdmin(c);
  if (admin instanceof Response) return admin;
  const targetId = c.req.param("id");
  if (targetId === admin.id) return c.json({ error: "不能在这里踢掉自己的会话" }, 400);
  await c.env.DB.prepare("DELETE FROM sessions WHERE user_id = ?").bind(targetId).run();
  return c.json({ ok: true });
});

app.get("/api/admin/permissions", async (c) => {
  const user = requireAdmin(c);
  if (user instanceof Response) return user;
  const result = await c.env.DB.prepare(`
    SELECT vp.*, u.username AS created_by_name
    FROM visitor_permissions vp
    LEFT JOIN users u ON u.id = vp.created_by
    ORDER BY vp.created_at DESC
    LIMIT 100
  `).all<Record<string, unknown>>();
  return c.json({ permissions: result.results ?? [] });
});

app.post("/api/admin/permissions", async (c) => {
  const user = requireAdmin(c);
  if (user instanceof Response) return user;
  const body = await readJson(c);
  const kind = ["user", "visitor", "ip_hash"].includes(String(body.kind)) ? String(body.kind) : "";
  const level = ["allow", "muted", "banned"].includes(String(body.level)) ? String(body.level) : "";
  const subject = cleanText(body.subject, 180);
  const reason = cleanText(body.reason, 240);
  const expiresAt = body.expiresAt ? cleanText(body.expiresAt, 80) : null;
  if (!kind || !level || !subject) return c.json({ error: "权限字段不完整" }, 400);

  await c.env.DB.prepare(`
    INSERT INTO visitor_permissions (id, kind, subject, level, reason, expires_at, created_by, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(crypto.randomUUID(), kind, subject, level, reason, expiresAt, user.id, nowIso()).run();
  return c.json({ ok: true }, 201);
});

app.delete("/api/admin/permissions/:id", async (c) => {
  const user = requireAdmin(c);
  if (user instanceof Response) return user;
  await c.env.DB.prepare("DELETE FROM visitor_permissions WHERE id = ?").bind(c.req.param("id")).run();
  return c.json({ ok: true });
});

app.patch("/api/admin/site-settings", async (c) => {
  const user = requireAdmin(c);
  if (user instanceof Response) return user;
  const body = await readJson(c);
  const ui = sanitizeUiConfig(body.ui);
  await c.env.DB.prepare(`
    INSERT INTO site_settings (key, value, updated_at)
    VALUES ('ui_config', ?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
  `).bind(JSON.stringify(ui), nowIso()).run();
  return c.json({ ok: true, ui });
});

app.get("*", (c) => {
  return new Response(renderPage(), {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store"
    }
  });
});

async function bindRequestContext(c: AppContext, next: Next) {
  const visitorId = getCookie(c, VISITOR_COOKIE) ?? crypto.randomUUID();
  setCookie(c, VISITOR_COOKIE, visitorId, {
    path: "/",
    httpOnly: true,
    secure: isHttps(c),
    sameSite: "Lax",
    maxAge: 60 * 60 * 24 * 365
  });

  const secret = getSessionSecret(c.env);
  const ip = c.req.header("CF-Connecting-IP") ?? c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ?? "";
  const ipHash = ip ? await sha256Hex(`${secret}:${ip}`) : "";
  const token = getCookie(c, SESSION_COOKIE);
  const user = token ? await getUserBySession(c.env.DB, token) : null;
  const permission = await resolvePermission(c.env.DB, user, visitorId, ipHash);

  c.set("visitorId", visitorId);
  c.set("user", user);
  c.set("permission", permission);
  c.set("ipHash", ipHash);

  if (permission === "banned" && user?.role !== "admin") {
    if (c.req.path.startsWith("/api/")) {
      return c.json({ error: "访问已被管理员限制" }, 403);
    }
    return new Response(renderBlockedPage(), {
      status: 403,
      headers: { "Content-Type": "text/html; charset=utf-8" }
    });
  }

  await next();
}

async function getUserBySession(db: D1Database, token: string): Promise<User | null> {
  const tokenHash = await sha256Hex(token);
  const row = await db.prepare(`
    SELECT u.id, u.username, u.email, u.role, u.status, u.created_at, s.id AS session_id, s.expires_at
    FROM sessions s
    JOIN users u ON u.id = s.user_id
    WHERE s.token_hash = ? AND s.expires_at > ? AND u.status != 'banned'
  `).bind(tokenHash, nowIso()).first<SessionUser>();
  if (!row) return null;
  return {
    id: row.id,
    username: row.username,
    email: row.email,
    role: row.role,
    status: row.status,
    created_at: row.created_at
  };
}

async function getUserById(db: D1Database, id: string): Promise<User | null> {
  return db.prepare("SELECT id, username, email, role, status, created_at FROM users WHERE id = ?")
    .bind(id)
    .first<User>();
}

async function createSession(c: AppContext, userId: string) {
  const existingToken = getCookie(c, SESSION_COOKIE);
  if (existingToken) {
    await c.env.DB.prepare("DELETE FROM sessions WHERE token_hash = ?")
      .bind(await sha256Hex(existingToken))
      .run();
  }
  const token = randomToken();
  const tokenHash = await sha256Hex(token);
  const userAgentHash = await currentUserAgentHash(c);
  const now = new Date();
  const expires = new Date(now.getTime() + 1000 * SESSION_MAX_AGE_SECONDS);
  await c.env.DB.prepare(`
    INSERT INTO sessions (id, user_id, token_hash, expires_at, created_at, ip_hash, user_agent_hash, last_seen_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `)
    .bind(crypto.randomUUID(), userId, tokenHash, expires.toISOString(), now.toISOString(), ipSubject(c), userAgentHash, now.toISOString())
    .run();
  setCookie(c, SESSION_COOKIE, token, {
    path: "/",
    httpOnly: true,
    secure: isHttps(c),
    sameSite: "Lax",
    maxAge: SESSION_MAX_AGE_SECONDS
  });
}

async function deleteOtherSessions(c: AppContext, userId: string): Promise<void> {
  const token = getCookie(c, SESSION_COOKIE);
  if (!token) {
    await c.env.DB.prepare("DELETE FROM sessions WHERE user_id = ?").bind(userId).run();
    return;
  }
  const tokenHash = await sha256Hex(token);
  await c.env.DB.prepare("DELETE FROM sessions WHERE user_id = ? AND token_hash != ?")
    .bind(userId, tokenHash)
    .run();
}

async function resolvePermission(db: D1Database, user: User | null, visitorId: string, ipHash: string): Promise<PermissionLevel> {
  if (user?.status === "banned") return "banned";
  if (user?.status === "muted") return "muted";
  const rows = await db.prepare(`
    SELECT level
    FROM visitor_permissions
    WHERE (expires_at IS NULL OR expires_at > ?)
      AND (
        (kind = 'visitor' AND subject = ?)
        OR (kind = 'user' AND subject = ?)
        OR (kind = 'ip_hash' AND subject = ?)
      )
  `).bind(nowIso(), visitorId, user?.id ?? "", ipHash).all<{ level: PermissionLevel }>();
  const levels = rows.results ?? [];
  if (levels.some((row) => row.level === "banned")) return "banned";
  if (levels.some((row) => row.level === "muted")) return "muted";
  return "allow";
}

function requireActiveUser(c: AppContext): User | Response {
  const user = c.get("user");
  if (!user) return c.json({ error: "需要先登录" }, 401);
  if (user.status !== "active" || c.get("permission") !== "allow") return c.json({ error: "当前账号没有发布权限" }, 403);
  return user;
}

function requireAdmin(c: AppContext): User | Response {
  const user = c.get("user");
  if (!user) return c.json({ error: "需要先登录" }, 401);
  if (user.role !== "admin") return c.json({ error: "需要管理员权限" }, 403);
  return user;
}

function requireWriteAccess(c: AppContext): Response | null {
  if (c.get("permission") === "muted") return c.json({ error: "当前访客已被限制互动" }, 403);
  if (c.get("permission") === "banned") return c.json({ error: "访问已被管理员限制" }, 403);
  return null;
}

async function enforceContentWriteCooldown(c: AppContext, user: User): Promise<Response | null> {
  const message = `发帖或回复太快了，请 ${CONTENT_WRITE_COOLDOWN_SECONDS} 秒后再试`;
  const userCooldown = await requireCooldownAvailable(c, "content_write_user", userSubject(user), message);
  if (userCooldown) return userCooldown;
  const ipCooldown = await requireCooldownAvailable(c, "content_write_ip", ipSubject(c), message);
  if (ipCooldown) return ipCooldown;

  await setCooldown(c.env.DB, "content_write_user", userSubject(user), CONTENT_WRITE_COOLDOWN_SECONDS);
  await setCooldown(c.env.DB, "content_write_ip", ipSubject(c), CONTENT_WRITE_COOLDOWN_SECONDS);
  return null;
}

async function enforceRateLimits(c: AppContext, rules: RateLimitRule[]): Promise<Response | null> {
  for (const rule of rules) {
    const limited = await enforceFixedWindowRateLimit(c, rule);
    if (limited) return limited;
  }
  return null;
}

async function enforceFixedWindowRateLimit(c: AppContext, rule: RateLimitRule): Promise<Response | null> {
  const nowSeconds = Math.floor(Date.now() / 1000);
  const windowStart = Math.floor(nowSeconds / rule.windowSeconds) * rule.windowSeconds;
  const expiresAt = new Date((windowStart + rule.windowSeconds) * 1000).toISOString();
  const updatedAt = nowIso();

  await c.env.DB.prepare(`
    INSERT INTO rate_limits (bucket, subject, window_start, window_seconds, count, expires_at, updated_at)
    VALUES (?, ?, ?, ?, 1, ?, ?)
    ON CONFLICT(bucket, subject, window_start)
    DO UPDATE SET count = count + 1, expires_at = excluded.expires_at, updated_at = excluded.updated_at
  `).bind(rule.bucket, rule.subject, windowStart, rule.windowSeconds, expiresAt, updatedAt).run();

  const row = await c.env.DB.prepare(`
    SELECT count FROM rate_limits WHERE bucket = ? AND subject = ? AND window_start = ?
  `).bind(rule.bucket, rule.subject, windowStart).first<{ count: number }>();

  maybeScheduleRateLimitCleanup(c, rule.subject, windowStart);
  const count = Number(row?.count ?? 0);
  if (count <= rule.limit) return null;
  return rateLimitedResponse(c, rule.message, windowStart + rule.windowSeconds - nowSeconds);
}

async function requireCooldownAvailable(c: AppContext, bucket: string, subject: string, message: string): Promise<Response | null> {
  const row = await c.env.DB.prepare("SELECT expires_at FROM rate_cooldowns WHERE bucket = ? AND subject = ?")
    .bind(bucket, subject)
    .first<{ expires_at: string }>();
  const retryAfter = secondsUntil(row?.expires_at ?? "");
  if (retryAfter <= 0) return null;
  return rateLimitedResponse(c, message, retryAfter);
}

async function setCooldown(db: D1Database, bucket: string, subject: string, seconds: number): Promise<void> {
  const now = new Date();
  const expiresAt = new Date(now.getTime() + seconds * 1000).toISOString();
  await db.prepare(`
    INSERT INTO rate_cooldowns (bucket, subject, expires_at, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(bucket, subject)
    DO UPDATE SET expires_at = excluded.expires_at, updated_at = excluded.updated_at
  `).bind(bucket, subject, expiresAt, now.toISOString(), now.toISOString()).run();
}

function rateLimitedResponse(c: AppContext, message: string, retryAfterSeconds: number): Response {
  const retryAfter = Math.max(1, Math.ceil(retryAfterSeconds));
  const response = c.json({ error: message, retryAfterSeconds: retryAfter }, 429);
  response.headers.set("Retry-After", String(retryAfter));
  return response;
}

function secondsUntil(iso: string): number {
  const target = Date.parse(iso);
  if (!Number.isFinite(target)) return 0;
  return Math.ceil((target - Date.now()) / 1000);
}

function ipSubject(c: AppContext): string {
  return `ip:${c.get("ipHash") || c.get("visitorId")}`;
}

function userSubject(user: User): string {
  return `user:${user.id}`;
}

function actorSubject(c: AppContext): string {
  const user = c.get("user");
  return user ? userSubject(user) : `visitor:${c.get("visitorId")}`;
}

async function hashedSubject(c: AppContext, kind: string, value: string): Promise<string> {
  return `${kind}:${await sha256Hex(`${getSessionSecret(c.env)}:${kind}:${value}`)}`;
}

async function currentUserAgentHash(c: AppContext): Promise<string> {
  const userAgent = c.req.header("User-Agent")?.slice(0, 300) ?? "";
  return userAgent ? await hashedSubject(c, "ua", userAgent) : "";
}

async function enforceLoginLock(c: AppContext, emailSubject: string, ipSubjectText: string): Promise<Response | null> {
  const [emailRetry, ipRetry] = await Promise.all([
    loginLockSeconds(c.env.DB, emailSubject),
    loginLockSeconds(c.env.DB, ipSubjectText)
  ]);
  const retryAfter = Math.max(emailRetry, ipRetry);
  if (retryAfter <= 0) return null;
  return rateLimitedResponse(c, "登录失败次数太多了，请稍后再试", retryAfter);
}

async function loginLockSeconds(db: D1Database, subject: string): Promise<number> {
  const row = await db.prepare("SELECT locked_until FROM auth_failures WHERE subject = ?")
    .bind(subject)
    .first<{ locked_until: string | null }>();
  return secondsUntil(row?.locked_until ?? "");
}

async function recordLoginFailure(db: D1Database, subject: string, threshold: number): Promise<void> {
  const now = new Date();
  const nowText = now.toISOString();
  const row = await db.prepare("SELECT fail_count, first_failed_at FROM auth_failures WHERE subject = ?")
    .bind(subject)
    .first<{ fail_count: number; first_failed_at: string }>();
  const firstTime = Date.parse(row?.first_failed_at ?? "");
  const insideWindow = Number.isFinite(firstTime) && now.getTime() - firstTime <= LOGIN_FAILURE_WINDOW_SECONDS * 1000;
  const firstFailedAt = insideWindow ? row!.first_failed_at : nowText;
  const failCount = insideWindow ? Number(row?.fail_count ?? 0) + 1 : 1;
  const lockedUntil = failCount >= threshold ? new Date(now.getTime() + LOGIN_LOCK_SECONDS * 1000).toISOString() : null;
  await db.prepare(`
    INSERT INTO auth_failures (subject, fail_count, first_failed_at, last_failed_at, locked_until)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(subject)
    DO UPDATE SET fail_count = excluded.fail_count,
      first_failed_at = excluded.first_failed_at,
      last_failed_at = excluded.last_failed_at,
      locked_until = excluded.locked_until
  `).bind(subject, failCount, firstFailedAt, nowText, lockedUntil).run();
}

async function clearLoginFailures(db: D1Database, subject: string): Promise<void> {
  await db.prepare("DELETE FROM auth_failures WHERE subject = ?").bind(subject).run();
}

function maybeScheduleRateLimitCleanup(c: AppContext, subject: string, windowStart: number) {
  const lastChar = subject.charCodeAt(subject.length - 1) || 0;
  if (windowStart % 600 !== 0 || lastChar % 16 !== 0) return;
  try {
    c.executionCtx.waitUntil(cleanupExpiredRateLimitRows(c.env.DB, nowIso()).catch((error) => {
      console.error(JSON.stringify({ level: "warn", message: "rate limit cleanup failed", error: String(error) }));
    }));
  } catch {
  }
}

async function cleanupExpiredRateLimitRows(db: D1Database, cutoff: string): Promise<void> {
  await db.prepare("DELETE FROM rate_limits WHERE expires_at < ?").bind(cutoff).run();
  await db.prepare("DELETE FROM rate_cooldowns WHERE expires_at < ?").bind(cutoff).run();
  const staleFailures = new Date(Date.now() - LOGIN_FAILURE_WINDOW_SECONDS * 1000).toISOString();
  await db.prepare(`
    DELETE FROM auth_failures
    WHERE (locked_until IS NULL AND first_failed_at < ?)
      OR (locked_until IS NOT NULL AND locked_until < ?)
  `).bind(staleFailures, cutoff).run();
}

async function readJson(c: AppContext): Promise<Record<string, unknown>> {
  try {
    const value = await c.req.json();
    return typeof value === "object" && value !== null ? value as Record<string, unknown> : {};
  } catch {
    return {};
  }
}

async function getUiConfig(db: D1Database): Promise<UiConfig> {
  const row = await db.prepare("SELECT value FROM site_settings WHERE key = 'ui_config'").first<{ value: string }>();
  if (!row?.value) return DEFAULT_UI_CONFIG;
  try {
    return sanitizeUiConfig(JSON.parse(row.value));
  } catch {
    return DEFAULT_UI_CONFIG;
  }
}

function sanitizeUiConfig(value: unknown): UiConfig {
  const raw = typeof value === "object" && value !== null ? value as Record<string, unknown> : {};
  const placeholder = cleanText(raw.searchPlaceholder, 80) || DEFAULT_UI_CONFIG.searchPlaceholder;
  const width = Math.round(Number(raw.searchWidthPx ?? DEFAULT_UI_CONFIG.searchWidthPx));
  return {
    searchPlaceholder: placeholder,
    searchWidthPx: clampNumber(width, 240, 1100, DEFAULT_UI_CONFIG.searchWidthPx),
    editorOverrides: sanitizeEditorOverrides(raw.editorOverrides)
  };
}

function sanitizeEditorOverrides(value: unknown): ElementOverride[] {
  if (!Array.isArray(value)) return [];
  const overrides: ElementOverride[] = [];
  for (const item of value.slice(0, 80)) {
    const raw = typeof item === "object" && item !== null ? item as Record<string, unknown> : {};
    const selector = cleanSelector(raw.selector);
    if (!selector) continue;
    const styleKeys = sanitizeStyleKeys(raw.styleKeys);
    const override: ElementOverride = {
      selector,
      styleKeys,
      styles: sanitizeElementStyles(raw.styles, styleKeys)
    };
    if (raw.textChanged === true && typeof raw.text === "string") {
      override.textChanged = true;
      override.text = cleanText(raw.text, 500);
    }
    if (raw.placeholderChanged === true && typeof raw.placeholder === "string") {
      override.placeholderChanged = true;
      override.placeholder = cleanText(raw.placeholder, 160);
    }
    if (!Object.keys(override.styles).length && !override.textChanged && !override.placeholderChanged) {
      continue;
    }
    overrides.push(override);
  }
  return overrides;
}

function sanitizeStyleKeys(value: unknown): ElementStyleKey[] {
  if (!Array.isArray(value)) return [];
  const allowed = new Set<ElementStyleKey>(["width", "height", "padding", "margin", "fontSize", "color", "backgroundColor", "borderRadius"]);
  const keys: ElementStyleKey[] = [];
  for (const item of value) {
    if (allowed.has(item as ElementStyleKey) && !keys.includes(item as ElementStyleKey)) {
      keys.push(item as ElementStyleKey);
    }
  }
  return keys;
}

function sanitizeElementStyles(value: unknown, styleKeys: ElementStyleKey[]): Partial<Record<ElementStyleKey, string>> {
  const raw = typeof value === "object" && value !== null ? value as Record<string, unknown> : {};
  const styles: Partial<Record<ElementStyleKey, string>> = {};
  const allowedKeys = new Set(styleKeys);
  const lengthKeys: ElementStyleKey[] = ["width", "height", "padding", "margin", "fontSize", "borderRadius"];
  for (const key of lengthKeys) {
    if (!allowedKeys.has(key)) continue;
    const sanitized = cleanCssLength(raw[key]);
    if (sanitized) styles[key] = sanitized;
  }
  for (const key of ["color", "backgroundColor"] as ElementStyleKey[]) {
    if (!allowedKeys.has(key)) continue;
    const sanitized = cleanCssColor(raw[key]);
    if (sanitized) styles[key] = sanitized;
  }
  return styles;
}

function cleanSelector(value: unknown): string {
  const selector = cleanText(value, 240);
  if (!selector || /[{};]/.test(selector)) return "";
  return selector;
}

function cleanCssLength(value: unknown): string {
  const text = String(value ?? "").trim();
  return /^(?:0|0px|[1-9]\d{0,3}(?:px|rem|em|%))$/.test(text) ? text : "";
}

function cleanCssColor(value: unknown): string {
  const text = String(value ?? "").trim();
  return /^#[0-9a-f]{6}$/i.test(text) || /^(transparent|inherit|unset|currentColor)$/i.test(text) ? text : "";
}

async function syncTags(db: D1Database, postId: string, tags: string[]) {
  await db.prepare("DELETE FROM post_tags WHERE post_id = ?").bind(postId).run();
  const now = nowIso();
  for (const name of tags) {
    const slug = slugify(name);
    const existing = await db.prepare("SELECT id FROM tags WHERE slug = ?").bind(slug).first<{ id: string }>();
    const tagId = existing?.id ?? crypto.randomUUID();
    if (!existing) {
      await db.prepare("INSERT INTO tags (id, name, slug, created_at) VALUES (?, ?, ?, ?)")
        .bind(tagId, name, slug, now)
        .run();
    }
    await db.prepare("INSERT OR IGNORE INTO post_tags (post_id, tag_id) VALUES (?, ?)")
      .bind(postId, tagId)
      .run();
  }
}

async function uniqueSlug(db: D1Database, source: string): Promise<string> {
  const base = slugify(source) || crypto.randomUUID().slice(0, 8);
  for (let i = 0; i < 80; i += 1) {
    const slug = i === 0 ? base : `${base}-${i + 1}`;
    const found = await db.prepare("SELECT id FROM posts WHERE slug = ?").bind(slug).first();
    if (!found) return slug;
  }
  return `${base}-${crypto.randomUUID().slice(0, 8)}`;
}

function normalizePostRow(row: Record<string, unknown>) {
  const coverKey = typeof row.cover_key === "string" && row.cover_key ? row.cover_key : "";
  return {
    id: String(row.id),
    title: String(row.title),
    slug: String(row.slug),
    summary: String(row.summary ?? ""),
    content: String(row.content ?? ""),
    hazardLevel: Number(row.hazard_level),
    nsfw: Boolean(Number(row.nsfw ?? 0)),
    coverKey,
    coverUrl: coverKey ? `/media/${coverKey}` : "",
    status: String(row.status ?? "published"),
    authorName: String(row.author_name ?? "匿名"),
    createdAt: String(row.created_at ?? ""),
    updatedAt: String(row.updated_at ?? ""),
    likeCount: Number(row.like_count ?? 0),
    commentCount: Number(row.comment_count ?? 0),
    likedByMe: Boolean(Number(row.liked_by_me ?? 0)),
    tags: String(row.tags ?? "").split("|").filter(Boolean)
  };
}

function normalizeCommentRow(row: Record<string, unknown>) {
  return {
    id: String(row.id),
    content: String(row.content ?? ""),
    parentId: row.parent_id ? String(row.parent_id) : null,
    authorName: String(row.author_name ?? "匿名"),
    visitorId: String(row.visitor_id ?? ""),
    createdAt: String(row.created_at ?? "")
  };
}

function validatePasswordStrength(password: string, email: string, username: string): string | null {
  if (password.length < PASSWORD_MIN_LENGTH || password.length > 128) {
    return `密码需要 ${PASSWORD_MIN_LENGTH}-128 个字符`;
  }
  const lower = password.toLowerCase();
  const normalizedName = username.trim().toLowerCase();
  const emailName = email.split("@")[0]?.toLowerCase() ?? "";
  if (normalizedName.length >= 3 && lower.includes(normalizedName)) {
    return "密码不能包含昵称";
  }
  if (emailName.length >= 3 && lower.includes(emailName)) {
    return "密码不能包含邮箱前缀";
  }
  if (WEAK_PASSWORD_PARTS.some((part) => lower.includes(part))) {
    return "这个密码太常见了，请换一个更难猜的";
  }
  if (/(.)\1{5,}/.test(password)) {
    return "密码不能大量重复同一个字符";
  }
  if (hasLongSequence(lower)) {
    return "密码不能包含连续数字、字母或键盘顺序";
  }
  const classes = [
    /[a-z]/.test(password),
    /[A-Z]/.test(password),
    /\d/.test(password),
    /[^A-Za-z0-9]/.test(password)
  ].filter(Boolean).length;
  if (classes < 3) {
    return "密码至少需要包含大小写字母、数字、符号中的 3 类";
  }
  return null;
}

function hasLongSequence(value: string): boolean {
  const sequences = [
    "0123456789",
    "9876543210",
    "abcdefghijklmnopqrstuvwxyz",
    "zyxwvutsrqponmlkjihgfedcba",
    "qwertyuiop",
    "poiuytrewq",
    "asdfghjkl",
    "lkjhgfdsa",
    "zxcvbnm",
    "mnbvcxz"
  ];
  return sequences.some((sequence) => containsSequence(value, sequence, 5));
}

function containsSequence(value: string, sequence: string, length: number): boolean {
  for (let index = 0; index <= sequence.length - length; index += 1) {
    if (value.includes(sequence.slice(index, index + length))) return true;
  }
  return false;
}

async function hashPassword(password: string): Promise<string> {
  const salt = new Uint8Array(16);
  crypto.getRandomValues(salt);
  const key = await crypto.subtle.importKey("raw", encoder.encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt, iterations: PASSWORD_ITERATIONS, hash: "SHA-256" },
    key,
    256
  );
  return `pbkdf2_sha256$${PASSWORD_ITERATIONS}$${base64Url(salt)}$${base64Url(new Uint8Array(bits))}`;
}

async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, iterationsText, saltText, expectedText] = stored.split("$");
  if (scheme !== "pbkdf2_sha256" || !iterationsText || !saltText || !expectedText) return false;
  const iterations = Number(iterationsText);
  if (!Number.isInteger(iterations) || iterations < 100_000) return false;
  const salt = base64UrlToBytes(saltText);
  const expected = base64UrlToBytes(expectedText);
  const key = await crypto.subtle.importKey("raw", encoder.encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", salt, iterations, hash: "SHA-256" }, key, expected.length * 8);
  return safeEqualBytes(new Uint8Array(bits), expected);
}

async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(input));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function randomToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return base64Url(bytes);
}

function base64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlToBytes(text: string): Uint8Array {
  const normalized = text.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function safeEqualBytes(a: Uint8Array, b: Uint8Array): boolean {
  let diff = a.length ^ b.length;
  const length = Math.max(a.length, b.length);
  for (let i = 0; i < length; i += 1) {
    diff |= (a[i] ?? 0) ^ (b[i] ?? 0);
  }
  return diff === 0;
}

function safeEqualText(a: string, b: string): boolean {
  return safeEqualBytes(encoder.encode(a), encoder.encode(b));
}

function getSessionSecret(env: Env): string {
  if (!env.SESSION_SECRET || env.SESSION_SECRET.length < 24) {
    throw new Error("SESSION_SECRET must be set to at least 24 characters");
  }
  return env.SESSION_SECRET;
}

function isHttps(c: AppContext): boolean {
  return new URL(c.req.url).protocol === "https:";
}

function isSafeMethod(method: string): boolean {
  return method === "GET" || method === "HEAD" || method === "OPTIONS";
}

function isSameOrigin(c: AppContext): boolean {
  const origin = c.req.header("Origin");
  if (!origin) return true;
  return origin === new URL(c.req.url).origin;
}

function nowIso(): string {
  return new Date().toISOString();
}

function cleanName(value: unknown): string {
  return String(value ?? "").trim().replace(/\s+/g, " ");
}

function cleanText(value: unknown, max: number): string {
  return String(value ?? "").trim().slice(0, max);
}

function cleanPostStatus(value: unknown, fallback: PostStatus): PostStatus {
  const status = String(value ?? "").trim();
  return ["draft", "pending", "published", "hidden", "rejected", "deleted"].includes(status)
    ? status as PostStatus
    : fallback;
}

function cleanOptionalPostStatus(value: unknown): PostStatus | "" {
  const status = String(value ?? "").trim();
  return ["draft", "pending", "published", "hidden", "rejected", "deleted"].includes(status)
    ? status as PostStatus
    : "";
}

function clampNumber(value: number, min: number, max: number, fallback: number): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, value));
}

function cleanTags(value: unknown): string[] {
  const raw = Array.isArray(value) ? value : String(value ?? "").split(",");
  const seen = new Set<string>();
  const tags: string[] = [];
  for (const item of raw) {
    const tag = cleanText(item, 24).replace(/^#/, "");
    if (!tag) continue;
    const key = slugify(tag);
    if (seen.has(key)) continue;
    seen.add(key);
    tags.push(tag);
    if (tags.length >= 8) break;
  }
  return tags;
}

function slugify(value: string): string {
  return value
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^\p{Letter}\p{Number}]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function optionalR2Key(value: unknown): string | null {
  const key = String(value ?? "").trim();
  if (!key) return null;
  if (key.includes("..") || key.startsWith("/") || key.length > 300) return null;
  return key;
}

function isUploadedFile(value: unknown): value is File {
  if (typeof value !== "object" || value === null) return false;
  const maybeFile = value as File;
  return typeof maybeFile.name === "string"
    && typeof maybeFile.type === "string"
    && typeof maybeFile.size === "number"
    && typeof maybeFile.arrayBuffer === "function";
}

function extensionFromName(name: string): string {
  const match = name.toLowerCase().match(/\.(png|jpe?g|gif|webp|avif)$/);
  return match ? match[0].replace(".jpeg", ".jpg") : "";
}

function extensionFromContentType(contentType: string): string {
  const map: Record<string, string> = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/gif": ".gif",
    "image/webp": ".webp",
    "image/avif": ".avif"
  };
  return map[contentType] ?? "";
}

function inferImageContentType(name: string, declaredType: string, bytes: ArrayBuffer): string {
  const normalized = declaredType.toLowerCase().split(";")[0].trim();
  if (["image/jpeg", "image/png", "image/gif", "image/webp", "image/avif"].includes(normalized)) {
    return normalized;
  }

  const ext = extensionFromName(name);
  if (ext === ".jpg") return "image/jpeg";
  if (ext === ".png") return "image/png";
  if (ext === ".gif") return "image/gif";
  if (ext === ".webp") return "image/webp";
  if (ext === ".avif") return "image/avif";

  const header = new Uint8Array(bytes.slice(0, 16));
  if (header[0] === 0xff && header[1] === 0xd8 && header[2] === 0xff) return "image/jpeg";
  if (header[0] === 0x89 && header[1] === 0x50 && header[2] === 0x4e && header[3] === 0x47) return "image/png";
  if (header[0] === 0x47 && header[1] === 0x49 && header[2] === 0x46) return "image/gif";
  if (header[0] === 0x52 && header[1] === 0x49 && header[2] === 0x46 && header[3] === 0x46
    && header[8] === 0x57 && header[9] === 0x45 && header[10] === 0x42 && header[11] === 0x50) {
    return "image/webp";
  }
  if (header[4] === 0x66 && header[5] === 0x74 && header[6] === 0x79 && header[7] === 0x70
    && header[8] === 0x61 && header[9] === 0x76 && header[10] === 0x69 && header[11] === 0x66) {
    return "image/avif";
  }
  return "";
}

export default app;
