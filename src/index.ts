import { Hono } from "hono";
import type { Context, Next } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { appScript, renderBlockedPage, renderPage, styles } from "./ui";

type Role = "user" | "admin";
type UserStatus = "active" | "muted" | "banned";
type PermissionLevel = "allow" | "muted" | "banned";

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
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const PASSWORD_ITERATIONS = 100_000;
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
  if (password.length < 8 || password.length > 128) {
    return c.json({ error: "密码需要 8-128 个字符" }, 400);
  }

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

  await createSession(c, userId);
  return c.json({ ok: true, user: await getUserById(c.env.DB, userId) }, 201);
});

app.post("/api/login", async (c) => {
  const body = await readJson(c);
  const email = String(body.email ?? "").trim().toLowerCase();
  const password = String(body.password ?? "");
  const user = await c.env.DB.prepare(
    "SELECT id, username, email, password_hash, role, status, created_at FROM users WHERE email = ?"
  ).bind(email).first<(User & { password_hash: string })>();

  if (!user || user.status === "banned" || !(await verifyPassword(password, user.password_hash))) {
    return c.json({ error: "邮箱或密码不正确" }, 401);
  }

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

app.post("/api/agreements", async (c) => {
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
  const status = body.status === "draft" ? "draft" : "published";

  if (!title || title.length < 2) {
    return c.json({ error: "标题太短了" }, 400);
  }
  if (!content || content.length < 10) {
    return c.json({ error: "正文至少 10 个字符" }, 400);
  }
  if (!Number.isInteger(hazardLevel) || hazardLevel < 1 || hazardLevel > 5) {
    return c.json({ error: "评级需要是 1-5 级" }, 400);
  }

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
  return c.json({ ok: true, id, slug }, 201);
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
  const status = body.status === "draft" ? "draft" : "published";
  if (!title || !content || !Number.isInteger(hazardLevel) || hazardLevel < 1 || hazardLevel > 5) {
    return c.json({ error: "帖子字段不完整" }, 400);
  }

  await c.env.DB.prepare(`
    UPDATE posts
    SET title = ?, summary = ?, content = ?, hazard_level = ?, nsfw = ?, cover_key = ?, status = ?, updated_at = ?
    WHERE id = ?
  `).bind(title, summary, content, hazardLevel, nsfw ? 1 : 0, coverKey, status, nowIso(), post.id).run();
  await syncTags(c.env.DB, post.id, tags);
  return c.json({ ok: true });
});

app.post("/api/posts/:id/like", async (c) => {
  const denied = requireWriteAccess(c);
  if (denied) return denied;
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

  const form = await c.req.raw.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    return c.json({ error: "没有收到图片" }, 400);
  }
  if (!file.type.startsWith("image/")) {
    return c.json({ error: "只能上传图片" }, 415);
  }
  if (file.size > MAX_IMAGE_BYTES) {
    return c.json({ error: "图片不能超过 5MB" }, 413);
  }

  const ext = extensionFromName(file.name);
  const key = `uploads/${new Date().toISOString().slice(0, 10)}/${crypto.randomUUID()}${ext}`;
  await c.env.MEDIA.put(key, file.stream(), {
    httpMetadata: {
      contentType: file.type,
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
    SELECT p.id, p.title, p.slug, p.hazard_level, p.nsfw, p.status, p.created_at, p.updated_at, u.username AS author_name
    FROM posts p
    JOIN users u ON u.id = p.author_id
    ORDER BY p.created_at DESC
    LIMIT 100
  `).all<Record<string, unknown>>();
  return c.json({ posts: result.results ?? [] });
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
  const token = randomToken();
  const tokenHash = await sha256Hex(token);
  const now = new Date();
  const expires = new Date(now.getTime() + 1000 * 60 * 60 * 24 * 30);
  await c.env.DB.prepare("INSERT INTO sessions (id, user_id, token_hash, expires_at, created_at) VALUES (?, ?, ?, ?, ?)")
    .bind(crypto.randomUUID(), userId, tokenHash, expires.toISOString(), now.toISOString())
    .run();
  setCookie(c, SESSION_COOKIE, token, {
    path: "/",
    httpOnly: true,
    secure: isHttps(c),
    sameSite: "Lax",
    maxAge: 60 * 60 * 24 * 30
  });
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

function extensionFromName(name: string): string {
  const match = name.toLowerCase().match(/\.(png|jpe?g|gif|webp|avif)$/);
  return match ? match[0].replace(".jpeg", ".jpg") : "";
}

export default app;
