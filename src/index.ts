import { Hono } from "hono";
import type { Context, Next } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { ASSET_VERSION, SITE_DESCRIPTION, SITE_ORIGIN, appScript, renderBlockedPage, renderPage, styles } from "./ui";

type Role = "user" | "admin";
type UserStatus = "active" | "muted" | "banned";
type PermissionLevel = "allow" | "muted" | "banned";
type PostStatus = "draft" | "pending" | "published" | "hidden" | "rejected" | "deleted";
type PostCategory = "rating" | "about" | "talk";
type TelegramStep = "category" | "submitterName" | "title" | "finalRating" | "hazardLevel" | "ratingReason" | "twitterRef" | "tags" | "summary" | "nsfw" | "cover" | "bodyImages" | "content" | "confirm";

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
  imageChanged?: boolean;
  imageSrc?: string;
  imageAltChanged?: boolean;
  imageAlt?: string;
  styleKeys: ElementStyleKey[];
  styles: Partial<Record<ElementStyleKey, string>>;
};

type ElementStyleKey = "width" | "height" | "padding" | "margin" | "fontSize" | "color" | "backgroundColor" | "borderRadius";

type Variables = {
  user: User | null;
  visitorId: string;
  permission: PermissionLevel;
  ipHash: string;
  ipAddress: string;
  ipLocation: IpLocation;
};

type IpLocation = {
  country: string;
  continent: string;
  region: string;
  regionCode: string;
  city: string;
  postalCode: string;
  metroCode: string;
  timezone: string;
  latitude: string;
  longitude: string;
  asn: string;
  asOrganization: string;
  colo: string;
};

type BrowserLocationInput = {
  latitude: string;
  longitude: string;
  accuracy: string;
  altitude: string;
  altitudeAccuracy: string;
  heading: string;
  speed: string;
  recordedAt: string;
};

type RateLimitRule = {
  bucket: string;
  subject: string;
  limit: number;
  windowSeconds: number;
  message: string;
};

type SubmissionInput = {
  title: string;
  summary: string;
  content: string;
  category: Exclude<PostCategory, "about">;
  finalRating: string;
  ratingReason: string;
  twitterRef: string;
  hazardLevel: number;
  nsfw: boolean;
  requestedSlug: string;
  coverKey: string | null;
  submitterName: string;
  tags: string[];
};

type CreatedSubmission = {
  id: string;
  slug: string;
  status: PostStatus;
  category: Exclude<PostCategory, "about">;
};

type TelegramDraft = Partial<{
  category: Exclude<PostCategory, "about">;
  title: string;
  submitterName: string;
  finalRating: string;
  hazardLevel: number;
  ratingReason: string;
  twitterRef: string;
  tags: string;
  summary: string;
  nsfw: boolean;
  coverKey: string;
  bodyImageKeys: string[];
  content: string;
}>;

type TelegramSession = {
  chatId: string;
  step: TelegramStep;
  draft: TelegramDraft;
};

type TelegramPhotoSize = {
  file_id: string;
  file_unique_id?: string;
  width?: number;
  height?: number;
  file_size?: number;
};

type TelegramMessage = {
  message_id: number;
  chat: { id: number | string; type?: string };
  from?: { id: number; first_name?: string; username?: string };
  text?: string;
  caption?: string;
  photo?: TelegramPhotoSize[];
};

type TelegramCallbackQuery = {
  id: string;
  from?: { id: number; first_name?: string; username?: string };
  data?: string;
  message?: TelegramMessage;
};

type TelegramUpdate = {
  update_id: number;
  message?: TelegramMessage;
  callback_query?: TelegramCallbackQuery;
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
const MAX_COMMENT_LENGTH = 200;
const MAX_IMAGE_BYTES = 15 * 1024 * 1024;
const MAX_MULTIPART_IMAGE_BYTES = MAX_IMAGE_BYTES + 1024 * 1024;
const MAX_TELEGRAM_BODY_IMAGES = 10;
const TELEGRAM_API_BASE = "https://api.telegram.org";
const PASSWORD_ITERATIONS = 100_000;
const PASSWORD_MIN_LENGTH = 10;
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;
const REGISTER_IP_COOLDOWN_SECONDS = 5 * 60;
const CONTENT_WRITE_COOLDOWN_SECONDS = 30;
const COMMENT_WRITE_COOLDOWN_SECONDS = 5;
const SUBMISSION_WRITE_COOLDOWN_SECONDS = 30;
const LOGIN_FAILURE_WINDOW_SECONDS = 15 * 60;
const LOGIN_LOCK_SECONDS = 15 * 60;
const LOGIN_EMAIL_LOCK_THRESHOLD = 5;
const LOGIN_IP_LOCK_THRESHOLD = 20;
const MAX_SEARCH_QUERY_LENGTH = 80;
const MAX_SEARCH_TERMS = 8;
const INDEXNOW_KEY = "b3d9f2a6c8e14f0db7a24591c6e83a40";
const MAX_FINAL_RATING_LENGTH = 3;
const MAX_RATING_REASON_LENGTH = 240;
const MAX_TWITTER_REF_LENGTH = 160;
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

app.use("*", enforceHttps);
app.use("*", applySecurityHeaders);
app.use("*", bindRequestContext);
app.use("/api/*", async (c, next) => {
  if (!isSafeMethod(c.req.method) && !isSameOrigin(c) && !isExternalWebhookRequest(c)) {
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

app.get("/favicon.ico", async (c) => {
  return serveMediaObject(c, "site/search-icon-48.png", "image/png");
});

app.get("/site.webmanifest", (c) => {
  const manifest = {
    name: "NoMTF 不药娘网",
    short_name: "NoMTF",
    description: SITE_DESCRIPTION,
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#f8fbff",
    theme_color: "#69cbed",
    icons: [
      { src: `/media/site/search-icon-192.png?v=${ASSET_VERSION}`, sizes: "192x192", type: "image/png" },
      { src: `/media/site/search-icon-512.png?v=${ASSET_VERSION}`, sizes: "512x512", type: "image/png" }
    ]
  };
  return new Response(JSON.stringify(manifest), {
    headers: {
      "Content-Type": "application/manifest+json; charset=utf-8",
      "Cache-Control": "public, max-age=3600"
    }
  });
});

app.get("/robots.txt", () => {
  return new Response(`User-agent: *
Allow: /
Sitemap: ${SITE_ORIGIN}/sitemap.xml
`, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=3600"
    }
  });
});

app.get(`/${INDEXNOW_KEY}.txt`, () => {
  return new Response(INDEXNOW_KEY, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=86400"
    }
  });
});

app.get("/sitemap.xml", async (c) => {
  const rows = await c.env.DB.prepare(`
    SELECT slug, updated_at, created_at
    FROM posts
    WHERE status = 'published'
    ORDER BY updated_at DESC
    LIMIT 5000
  `).all<{ slug: string; updated_at: string; created_at: string }>();
  const urls = [
    { loc: `${SITE_ORIGIN}/`, lastmod: nowIso() },
    ...(rows.results ?? []).map((row) => ({
      loc: postPublicUrl(row.slug),
      lastmod: row.updated_at || row.created_at || nowIso()
    }))
  ];
  const body = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((item) => `  <url>
    <loc>${xmlEscape(item.loc)}</loc>
    <lastmod>${xmlEscape(item.lastmod.slice(0, 10))}</lastmod>
    <changefreq>daily</changefreq>
  </url>`).join("\n")}
</urlset>
`;
  return new Response(body, {
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": "public, max-age=1800"
    }
  });
});

app.get("/", async (c) => {
  const rows = await c.env.DB.prepare(`
    SELECT p.title, p.slug, p.summary, p.content, p.category, p.updated_at, p.created_at,
      COALESCE(NULLIF(p.submitter_name, ''), u.username) AS author_name
    FROM posts p
    JOIN users u ON u.id = p.author_id
    WHERE p.status = 'published'
    ORDER BY CASE WHEN p.pinned_at IS NULL THEN 1 ELSE 0 END, p.pinned_at DESC, p.created_at DESC
    LIMIT 20
  `).all<Record<string, unknown>>();
  return new Response(renderPage({
    title: "NoMTF 不药娘网 - nomtf.com 独立评级网站",
    description: "NoMTF 不药娘网（nomtf.com）是一个独立的娱乐评级网站，内容切勿当真。",
    canonical: `${SITE_ORIGIN}/`,
    staticHtml: renderStaticHomeHtml(rows.results ?? []),
    jsonLd: buildWebsiteJsonLd()
  }), {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "public, max-age=300"
    }
  });
});

app.get("/media/*", async (c) => {
  const key = c.req.path.replace(/^\/media\//, "");
  if (!key || key.includes("..")) {
    return new Response("Not found", { status: 404 });
  }

  return serveMediaObject(c, key);
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

app.get("/api/search/trends", async (c) => {
  const limited = await enforceFixedWindowRateLimit(c, {
    bucket: "search_trends_ip",
    subject: ipSubject(c),
    limit: 120,
    windowSeconds: 60,
    message: "搜索热榜刷新太频繁了，请稍后再试"
  });
  if (limited) return limited;
  return c.json({ trends: await getSearchTrends(c.env.DB, 10) });
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
  const ipAddress = c.get("ipAddress");
  const ipHash = c.get("ipHash");

  try {
    await c.env.DB.prepare(
      "INSERT INTO users (id, username, email, password_hash, role, status, created_at, updated_at, last_ip, last_ip_hash, last_seen_at) VALUES (?, ?, ?, ?, ?, 'active', ?, ?, ?, ?, ?)"
    )
      .bind(userId, username, email, passwordHash, role, now, now, ipAddress, ipHash, now)
      .run();
  } catch {
    return c.json({ error: "昵称或邮箱已经被占用" }, 409);
  }

  await recordUserIpEvent(c, userId);
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
  await c.env.DB.prepare("UPDATE users SET last_login_at = ?, last_ip = ?, last_ip_hash = ?, last_seen_at = ?, updated_at = ? WHERE id = ?")
    .bind(loginAt, c.get("ipAddress"), c.get("ipHash"), loginAt, loginAt, user.id)
    .run();
  await recordUserIpEvent(c, user.id);
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

app.post("/api/account/location", async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: "需要先登录" }, 401);
  const limited = await enforceRateLimits(c, [
    {
      bucket: "precise_location_user",
      subject: userSubject(user),
      limit: 24,
      windowSeconds: 60 * 60,
      message: "位置更新太频繁了，请稍后再试"
    },
    {
      bucket: "precise_location_ip",
      subject: ipSubject(c),
      limit: 80,
      windowSeconds: 60 * 60,
      message: "这个网络位置更新太频繁了，请稍后再试"
    }
  ]);
  if (limited) return limited;

  const body = await readJson(c);
  const latitude = cleanCoordinate(body.latitude, -90, 90);
  const longitude = cleanCoordinate(body.longitude, -180, 180);
  const accuracy = cleanNonNegativeNumber(body.accuracy, 1000000);
  if (!latitude || !longitude) return c.json({ error: "定位坐标无效" }, 400);

  await recordUserIpEvent(c, user.id);
  await recordBrowserLocation(c, user.id, {
    latitude,
    longitude,
    accuracy,
    altitude: cleanOptionalNumber(body.altitude, -12000, 100000),
    altitudeAccuracy: cleanNonNegativeNumber(body.altitudeAccuracy, 1000000),
    heading: cleanOptionalNumber(body.heading, 0, 360),
    speed: cleanNonNegativeNumber(body.speed, 10000),
    recordedAt: cleanBrowserLocationTimestamp(body.timestamp)
  });
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

  const q = normalizeSearchQuery(c.req.query("q"));
  const tag = String(c.req.query("tag") ?? "").trim();
  const rawCategory = String(c.req.query("category") ?? "").trim();
  const searchPlan = buildPostSearchPlan(q);
  const category = rawCategory === "all" || (searchPlan && !rawCategory) ? "" : cleanPostCategory(rawCategory, "rating");
  const level = Number(c.req.query("level") ?? 0);
  const page = Math.max(1, Number(c.req.query("page") ?? 1));
  const limit = Math.min(30, Math.max(1, Number(c.req.query("limit") ?? 12)));
  const offset = (page - 1) * limit;
  const visitorId = c.get("visitorId");
  const user = c.get("user");
  const subjectType = user ? "user" : "visitor";
  const subjectId = user?.id ?? visitorId;
  if (q) {
    c.executionCtx.waitUntil(recordSearchEvent(c, q).catch((error) => {
      console.error(JSON.stringify({ level: "warn", message: "search event record failed", error: String(error) }));
    }));
  }

  const conditions = ["p.status = 'published'"];
  const params: Array<string | number> = [];
  if (category) {
    conditions.push("p.category = ?");
    params.push(category);
  }
  if (searchPlan) {
    conditions.push(searchPlan.whereSql);
    params.push(...searchPlan.whereParams);
  }
  if (category === "rating" && level >= 1 && level <= 5) {
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
      p.id, p.title, p.slug, p.summary, p.content, p.final_rating, p.rating_reason, p.twitter_ref,
      p.category, p.pinned_at, p.hazard_level, p.nsfw, p.cover_key, p.status, COALESCE(p.view_count, 0) AS view_count, p.created_at, p.updated_at,
      COALESCE(NULLIF(p.submitter_name, ''), u.username) AS author_name,
      ${searchPlan ? `${searchPlan.scoreSql} AS search_score,` : ""}
      COALESCE((SELECT COUNT(*) FROM post_likes pl WHERE pl.post_id = p.id), 0) AS like_count,
      COALESCE((SELECT COUNT(*) FROM comments cm WHERE cm.post_id = p.id AND cm.status = 'published'), 0) AS comment_count,
      EXISTS(SELECT 1 FROM post_likes mine WHERE mine.post_id = p.id AND mine.subject_type = ? AND mine.subject_id = ?) AS liked_by_me,
      COALESCE((SELECT group_concat(t.name, '|') FROM post_tags pt JOIN tags t ON t.id = pt.tag_id WHERE pt.post_id = p.id), '') AS tags
    FROM posts p
    JOIN users u ON u.id = p.author_id
    WHERE ${conditions.join(" AND ")}
    ORDER BY ${searchPlan ? "search_score DESC," : ""} CASE WHEN p.pinned_at IS NULL THEN 1 ELSE 0 END, p.pinned_at DESC, p.created_at DESC
    LIMIT ? OFFSET ?
  `;
  const result = await c.env.DB.prepare(sql)
    .bind(...(searchPlan?.scoreParams ?? []), subjectType, subjectId, ...params, limit, offset)
    .all<Record<string, unknown>>();

  return c.json({
    posts: (result.results ?? []).map(normalizePostRow),
    page,
    limit
  });
});

app.get("/api/posts/hot", async (c) => {
  const limited = await enforceFixedWindowRateLimit(c, {
    bucket: "hot_posts_ip",
    subject: ipSubject(c),
    limit: 180,
    windowSeconds: 60,
    message: "热榜刷新太频繁了，请稍后再试"
  });
  if (limited) return limited;

  const visitorId = c.get("visitorId");
  const user = c.get("user");
  const subjectType = user ? "user" : "visitor";
  const subjectId = user?.id ?? visitorId;
  const limit = Math.min(10, Math.max(3, Number(c.req.query("limit") ?? 6)));
  const result = await c.env.DB.prepare(`
    SELECT
      p.id, p.title, p.slug, p.summary, p.content, p.final_rating, p.rating_reason, p.twitter_ref,
      p.category, p.pinned_at, p.hazard_level, p.nsfw, p.cover_key, p.status, COALESCE(p.view_count, 0) AS view_count, p.created_at, p.updated_at,
      COALESCE(NULLIF(p.submitter_name, ''), u.username) AS author_name,
      COALESCE((SELECT COUNT(*) FROM post_likes pl WHERE pl.post_id = p.id), 0) AS like_count,
      COALESCE((SELECT COUNT(*) FROM comments cm WHERE cm.post_id = p.id AND cm.status = 'published'), 0) AS comment_count,
      EXISTS(SELECT 1 FROM post_likes mine WHERE mine.post_id = p.id AND mine.subject_type = ? AND mine.subject_id = ?) AS liked_by_me,
      COALESCE((SELECT group_concat(t.name, '|') FROM post_tags pt JOIN tags t ON t.id = pt.tag_id WHERE pt.post_id = p.id), '') AS tags,
      (
        COALESCE(p.view_count, 0)
        + COALESCE((SELECT COUNT(*) FROM post_likes pl2 WHERE pl2.post_id = p.id), 0) * 5
        + COALESCE((SELECT COUNT(*) FROM comments cm2 WHERE cm2.post_id = p.id AND cm2.status = 'published'), 0) * 4
      ) AS hot_score
    FROM posts p
    JOIN users u ON u.id = p.author_id
    WHERE p.status = 'published'
    ORDER BY CASE WHEN p.pinned_at IS NULL THEN 1 ELSE 0 END, p.pinned_at DESC, hot_score DESC, p.created_at DESC
    LIMIT ?
  `).bind(subjectType, subjectId, limit).all<Record<string, unknown>>();

  return c.json({ posts: (result.results ?? []).map(normalizePostRow) });
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
      COALESCE(NULLIF(p.submitter_name, ''), u.username) AS author_name,
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

  row.view_count = Number(row.view_count ?? 0) + 1;
  c.executionCtx.waitUntil(c.env.DB.prepare("UPDATE posts SET view_count = view_count + 1 WHERE id = ?")
    .bind(String(row.id))
    .run()
    .catch((error) => {
      console.error(JSON.stringify({ level: "warn", message: "view count update failed", error: String(error), postId: String(row.id) }));
    }));

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
  const category = cleanPostCategory(body.category, "rating");
  const isRating = category === "rating";
  const finalRating = isRating ? cleanFinalRating(body.finalRating ?? body.final_rating) : "";
  const ratingReason = isRating ? cleanText(body.ratingReason ?? body.rating_reason, MAX_RATING_REASON_LENGTH) : "";
  const twitterRef = isRating ? cleanText(body.twitterRef ?? body.twitter_ref, MAX_TWITTER_REF_LENGTH) : "";
  const hazardLevel = isRating ? Number(body.hazardLevel ?? body.hazard_level) : 1;
  const nsfw = Boolean(body.nsfw);
  const requestedSlug = cleanText(body.slug, 90);
  const coverKey = optionalR2Key(body.coverKey);
  const tags = cleanTags(body.tags);
  if (category === "about" && user.role !== "admin") {
    return c.json({ error: "关于页只能由管理员发布" }, 403);
  }
  const status = postStatusForCreate(user, category, body.status);

  if (!title || title.length < 2) {
    return c.json({ error: "标题太短了" }, 400);
  }
  if (!content || content.length < 10) {
    return c.json({ error: "正文至少 10 个字符" }, 400);
  }
  if (isRating) {
    if (!isValidFinalRating(finalRating)) {
      return c.json({ error: "最终等级必填，格式只能是 1-、1、1+ 到 5-、5、5+" }, 400);
    }
    if (!ratingReason) {
      return c.json({ error: "评级原因必填" }, 400);
    }
    if (!twitterRef) {
      return c.json({ error: "推特链接/用户名必填；没有就填占位符或 @用户名" }, 400);
    }
    if (!Number.isInteger(hazardLevel) || hazardLevel < 1 || hazardLevel > 5) {
      return c.json({ error: "评级需要是 1-5 级" }, 400);
    }
  }
  const cooldown = await enforceContentWriteCooldown(c, user);
  if (cooldown) return cooldown;

  const now = nowIso();
  const id = crypto.randomUUID();
  const slug = await uniqueSlug(c.env.DB, requestedSlug || title);
  await c.env.DB.prepare(`
    INSERT INTO posts (id, title, slug, summary, content, final_rating, rating_reason, twitter_ref, category, hazard_level, nsfw, cover_key, status, author_id, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `)
    .bind(id, title, slug, summary, content, finalRating, ratingReason, twitterRef, category, hazardLevel, nsfw ? 1 : 0, coverKey, status, user.id, now, now)
    .run();

  await syncTags(c.env.DB, id, tags);
  return c.json({ ok: true, id, slug, status }, 201);
});

app.post("/api/submissions/media", async (c) => {
  const deniedApi = requireSubmissionApiAccess(c);
  if (deniedApi) return deniedApi;
  const denied = requireWriteAccess(c);
  if (denied) return denied;
  const contentLength = Number(c.req.header("Content-Length") ?? 0);
  if (Number.isFinite(contentLength) && contentLength > MAX_MULTIPART_IMAGE_BYTES) {
    return c.json({ error: "图片不能超过 15MB" }, 413);
  }
  const limited = await enforceRateLimits(c, [
    {
      bucket: "submission_media_api_ip",
      subject: ipSubject(c),
      limit: 60,
      windowSeconds: 10 * 60,
      message: "投稿 API 图片上传太频繁了，请稍后再试"
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
  if (!isUploadedFile(file)) return c.json({ error: "没有收到图片" }, 400);
  try {
    const uploaded = await storeImageFile(c.env, file, "submission-api");
    return c.json({ ok: true, key: uploaded.key, url: uploaded.url }, 201);
  } catch (error) {
    return c.json({ error: error instanceof Error ? error.message : "图片上传失败" }, 400);
  }
});

app.post("/api/submissions", async (c) => {
  const deniedApi = requireSubmissionApiAccess(c);
  if (deniedApi) return deniedApi;
  const denied = requireWriteAccess(c);
  if (denied) return denied;
  const limited = await enforceRateLimits(c, [
    {
      bucket: "submission_api_ip",
      subject: ipSubject(c),
      limit: 20,
      windowSeconds: 60,
      message: "投稿 API 调用太频繁了，请稍后再试"
    }
  ]);
  if (limited) return limited;

  const body = await readJson(c);
  const title = cleanText(body.title, 120);
  const summary = cleanText(body.summary, 240);
  const bodyImageKeys = cleanR2Keys(body.bodyImageKeys ?? body.body_image_keys ?? body.imageKeys ?? body.image_keys).slice(0, MAX_TELEGRAM_BODY_IMAGES);
  const content = cleanText(appendImageKeysToContent(String(body.content ?? ""), bodyImageKeys), MAX_POST_BYTES);
  const category = cleanPostCategory(body.category, "rating");
  const isRating = category === "rating";
  const finalRating = isRating ? cleanFinalRating(body.finalRating ?? body.final_rating) : "";
  const ratingReason = isRating ? cleanText(body.ratingReason ?? body.rating_reason, MAX_RATING_REASON_LENGTH) : "";
  const twitterRef = isRating ? cleanText(body.twitterRef ?? body.twitter_ref, MAX_TWITTER_REF_LENGTH) : "";
  const hazardLevel = isRating ? Number(body.hazardLevel ?? body.hazard_level) : 1;
  const nsfw = Boolean(body.nsfw);
  const requestedSlug = cleanText(body.slug, 90);
  const coverKey = optionalR2Key(body.coverKey ?? body.cover_key);
  const submitterName = cleanName(body.submitterName ?? body.submitter_name).slice(0, 40);
  const tags = cleanTags(body.tags);
  if (category === "about") return c.json({ error: "关于页只能由管理员在后台发布" }, 403);
  if (!title || title.length < 2) return c.json({ error: "标题太短了" }, 400);
  if (!content || content.length < 10) return c.json({ error: "正文至少 10 个字符" }, 400);
  if (isRating) {
    if (!ratingReason) return c.json({ error: "评级原因必填" }, 400);
    if (!twitterRef) return c.json({ error: "推特链接/用户名必填；没有就填占位符或 @用户名" }, 400);
    if (!Number.isInteger(hazardLevel) || hazardLevel < 1 || hazardLevel > 5) return c.json({ error: "评级需要是 1-5 级" }, 400);
  }

  if (isRating && !isValidFinalRating(finalRating)) {
    return c.json({ error: "最终等级必填，格式只能是 1-、1、1+ 到 5-、5、5+" }, 400);
  }

  const cooldown = await submissionApiCooldown(c);
  if (cooldown) return cooldown;

  const created = await createExternalSubmission(c.env.DB, {
    title,
    summary,
    content,
    category: category as Exclude<PostCategory, "about">,
    finalRating,
    ratingReason,
    twitterRef,
    hazardLevel,
    nsfw,
    requestedSlug,
    coverKey,
    submitterName,
    tags
  });
  if (!created) return c.json({ error: "没有可用的管理员作者账号" }, 500);
  await setCooldown(c.env.DB, "submission_api_ip", ipSubject(c), SUBMISSION_WRITE_COOLDOWN_SECONDS);
  return c.json({ ok: true, ...created }, 201);
});

app.post("/api/telegram/webhook", async (c) => {
  const token = getTelegramBotToken(c.env);
  const secret = getTelegramWebhookSecret(c.env);
  if (!token || !secret) return c.json({ error: "Telegram bot 尚未配置" }, 503);
  const provided = c.req.header("X-Telegram-Bot-Api-Secret-Token") ?? "";
  if (!safeEqualText(provided, secret)) return c.json({ error: "Telegram webhook secret 不正确" }, 403);

  const update = await readJson(c) as TelegramUpdate;
  console.log(JSON.stringify({
    level: "info",
    message: "telegram webhook received",
    updateId: update.update_id,
    kind: update.callback_query ? "callback_query" : update.message ? "message" : "other"
  }));
  c.executionCtx.waitUntil(handleTelegramUpdate(c.env, update).catch((error) => {
    console.error(JSON.stringify({ level: "error", message: "telegram webhook failed", error: String(error) }));
  }));
  return c.json({ ok: true });
});

app.patch("/api/posts/:id", async (c) => {
  const user = requireActiveUser(c);
  if (user instanceof Response) return user;
  const post = await c.env.DB.prepare("SELECT id, author_id, slug FROM posts WHERE id = ? AND status != 'deleted'")
    .bind(c.req.param("id"))
    .first<{ id: string; author_id: string; slug: string }>();
  if (!post) return c.json({ error: "帖子不存在" }, 404);
  if (post.author_id !== user.id && user.role !== "admin") return c.json({ error: "没有权限" }, 403);

  const body = await readJson(c);
  const title = cleanText(body.title, 120);
  const summary = cleanText(body.summary, 240);
  const content = cleanText(body.content, MAX_POST_BYTES);
  const category = cleanPostCategory(body.category, "rating");
  const isRating = category === "rating";
  const finalRating = isRating ? cleanFinalRating(body.finalRating ?? body.final_rating) : "";
  const ratingReason = isRating ? cleanText(body.ratingReason ?? body.rating_reason, MAX_RATING_REASON_LENGTH) : "";
  const twitterRef = isRating ? cleanText(body.twitterRef ?? body.twitter_ref, MAX_TWITTER_REF_LENGTH) : "";
  const hazardLevel = isRating ? Number(body.hazardLevel ?? body.hazard_level) : 1;
  const nsfw = Boolean(body.nsfw);
  const requestedSlug = user.role === "admin" ? cleanText(body.slug, 90) : "";
  const coverKey = optionalR2Key(body.coverKey);
  const tags = cleanTags(body.tags);
  if (category === "about" && user.role !== "admin") {
    return c.json({ error: "关于页只能由管理员发布" }, 403);
  }
  const status: PostStatus = user.role === "admin"
    ? cleanPostStatus(body.status, "published")
    : (category === "talk" ? "published" : "pending");
  if (!title || !content) {
    return c.json({ error: "帖子字段不完整" }, 400);
  }

  if (isRating) {
    if (!Number.isInteger(hazardLevel) || hazardLevel < 1 || hazardLevel > 5) {
      return c.json({ error: "评级需要是 1-5 级" }, 400);
    }
    if (!ratingReason || !twitterRef) {
      return c.json({ error: "评级原因和推特链接/用户名都必填" }, 400);
    }
  }

  if (isRating && !isValidFinalRating(finalRating)) {
    return c.json({ error: "最终等级必填，格式只能是 1-、1、1+ 到 5-、5、5+" }, 400);
  }

  const nextSlug = user.role === "admin" && requestedSlug
    ? await uniqueSlug(c.env.DB, requestedSlug, post.id)
    : post.slug;

  await c.env.DB.prepare(`
    UPDATE posts
    SET title = ?, slug = ?, summary = ?, content = ?, final_rating = ?, rating_reason = ?, twitter_ref = ?, category = ?, hazard_level = ?, nsfw = ?, cover_key = ?, status = ?, updated_at = ?
    WHERE id = ?
  `).bind(title, nextSlug, summary, content, finalRating, ratingReason, twitterRef, category, hazardLevel, nsfw ? 1 : 0, coverKey, status, nowIso(), post.id).run();
  await syncTags(c.env.DB, post.id, tags);
  return c.json({ ok: true, status, slug: nextSlug });
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
  const user = c.get("user");
  const denied = requireWriteAccess(c);
  if (denied) return denied;
  const postId = c.req.param("id");
  const body = await readJson(c);
  const rawContent = String(body.content ?? "").trim();
  if (rawContent.length > MAX_COMMENT_LENGTH) return c.json({ error: "评论最多 200 字" }, 400);
  const content = cleanText(rawContent, MAX_COMMENT_LENGTH);
  const parentId = typeof body.parentId === "string" && body.parentId ? body.parentId : null;

  if (content.length < 2) return c.json({ error: "回复太短了" }, 400);
  const post = await c.env.DB.prepare("SELECT id FROM posts WHERE id = ? AND status = 'published'").bind(postId).first();
  if (!post) return c.json({ error: "帖子不存在" }, 404);
  const cooldown = await enforceCommentWriteCooldown(c);
  if (cooldown) return cooldown;

  const now = nowIso();
  await c.env.DB.prepare(`
    INSERT INTO comments (id, post_id, author_id, visitor_id, parent_id, content, status, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, 'published', ?, ?)
  `).bind(crypto.randomUUID(), postId, user?.id ?? null, c.get("visitorId"), parentId, content, now, now).run();
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
  try {
    const uploaded = await storeImageFile(c.env, file, user.id);
    return c.json({ ok: true, key: uploaded.key, url: uploaded.url }, 201);
  } catch (error) {
    return c.json({ error: error instanceof Error ? error.message : "图片上传失败" }, 400);
  }
});

app.get("/api/admin/posts", async (c) => {
  const user = requireAdmin(c);
  if (user instanceof Response) return user;
  const result = await c.env.DB.prepare(`
    SELECT
      p.id, p.title, p.slug, p.summary, p.category, p.pinned_at, p.hazard_level, p.nsfw, p.status, COALESCE(p.view_count, 0) AS view_count,
      p.created_at, p.updated_at, p.reviewed_at,
      COALESCE(NULLIF(p.submitter_name, ''), u.username) AS author_name,
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
      CASE WHEN p.pinned_at IS NULL THEN 1 ELSE 0 END,
      p.pinned_at DESC,
      p.created_at DESC
    LIMIT 100
  `).all<Record<string, unknown>>();
  return c.json({ posts: result.results ?? [] });
});

app.get("/api/admin/stats", async (c) => {
  const user = requireAdmin(c);
  if (user instanceof Response) return user;
  const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const [posts, users, searches] = await Promise.all([
    c.env.DB.prepare(`
      SELECT
        COUNT(*) AS total_posts,
        SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) AS pending_posts,
        SUM(CASE WHEN status = 'published' THEN 1 ELSE 0 END) AS published_posts
      FROM posts
      WHERE status != 'deleted'
    `).first<Record<string, number>>(),
    c.env.DB.prepare(`
      SELECT
        COUNT(*) AS total_users,
        SUM(CASE WHEN status = 'banned' THEN 1 ELSE 0 END) AS banned_users,
        SUM(CASE WHEN role = 'admin' THEN 1 ELSE 0 END) AS admin_users
      FROM users
    `).first<Record<string, number>>(),
    c.env.DB.prepare("SELECT COUNT(*) AS search_count FROM search_events WHERE created_at >= ?")
      .bind(since24h)
      .first<{ search_count: number }>()
  ]);
  return c.json({
    stats: {
      totalPosts: Number(posts?.total_posts ?? 0),
      pendingPosts: Number(posts?.pending_posts ?? 0),
      publishedPosts: Number(posts?.published_posts ?? 0),
      totalUsers: Number(users?.total_users ?? 0),
      bannedUsers: Number(users?.banned_users ?? 0),
      adminUsers: Number(users?.admin_users ?? 0),
      searches24h: Number(searches?.search_count ?? 0),
      hotSearches: await getSearchTrends(c.env.DB, 8)
    }
  });
});

app.get("/api/admin/export/markdown", async (c) => {
  const user = requireAdmin(c);
  if (user instanceof Response) return user;
  const result = await c.env.DB.prepare(`
    SELECT
      p.id, p.title, p.slug, p.summary, p.content, p.final_rating, p.rating_reason, p.twitter_ref,
      p.category, p.hazard_level, p.nsfw, p.cover_key, p.status, p.view_count, p.pinned_at, p.created_at, p.updated_at,
      COALESCE(NULLIF(p.submitter_name, ''), u.username) AS author_name,
      COALESCE((SELECT group_concat(t.name, '|') FROM post_tags pt JOIN tags t ON t.id = pt.tag_id WHERE pt.post_id = p.id), '') AS tags
    FROM posts p
    JOIN users u ON u.id = p.author_id
    WHERE p.status != 'deleted'
    ORDER BY p.category ASC, CASE WHEN p.pinned_at IS NULL THEN 1 ELSE 0 END, p.pinned_at DESC, p.created_at DESC
    LIMIT 2000
  `).all<Record<string, unknown>>();
  const markdown = renderMarkdownBackup(result.results ?? []);
  const filename = `nomtf-posts-${new Date().toISOString().slice(0, 10)}.md`;
  return new Response(markdown, {
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store"
    }
  });
});

app.get("/api/admin/posts/:id", async (c) => {
  const user = requireAdmin(c);
  if (user instanceof Response) return user;
  const row = await c.env.DB.prepare(`
    SELECT
      p.*,
      COALESCE(NULLIF(p.submitter_name, ''), u.username) AS author_name,
      COALESCE((SELECT COUNT(*) FROM post_likes pl WHERE pl.post_id = p.id), 0) AS like_count,
      COALESCE((SELECT COUNT(*) FROM comments cm WHERE cm.post_id = p.id AND cm.status = 'published'), 0) AS comment_count,
      0 AS liked_by_me,
      COALESCE((SELECT group_concat(t.name, '|') FROM post_tags pt JOIN tags t ON t.id = pt.tag_id WHERE pt.post_id = p.id), '') AS tags
    FROM posts p
    JOIN users u ON u.id = p.author_id
    WHERE p.id = ? AND p.status != 'deleted'
  `).bind(c.req.param("id")).first<Record<string, unknown>>();
  if (!row) return c.json({ error: "帖子不存在" }, 404);
  return c.json({ post: normalizePostRow(row) });
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

app.post("/api/admin/posts/:id/pin", async (c) => {
  const user = requireAdmin(c);
  if (user instanceof Response) return user;
  const existing = await c.env.DB.prepare("SELECT id FROM posts WHERE id = ? AND status != 'deleted'")
    .bind(c.req.param("id"))
    .first<{ id: string }>();
  if (!existing) return c.json({ error: "帖子不存在" }, 404);
  const now = nowIso();
  await c.env.DB.prepare("UPDATE posts SET pinned_at = ?, pinned_by = ?, updated_at = ? WHERE id = ?")
    .bind(now, user.id, now, existing.id)
    .run();
  return c.json({ ok: true, pinnedAt: now });
});

app.delete("/api/admin/posts/:id/pin", async (c) => {
  const user = requireAdmin(c);
  if (user instanceof Response) return user;
  await c.env.DB.prepare("UPDATE posts SET pinned_at = NULL, pinned_by = NULL, updated_at = ? WHERE id = ? AND status != 'deleted'")
    .bind(nowIso(), c.req.param("id"))
    .run();
  return c.json({ ok: true });
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
    SELECT cm.id, cm.content, cm.status, cm.created_at, cm.visitor_id, COALESCE(p.title, '已删除帖子') AS post_title, u.username AS author_name
    FROM comments cm
    LEFT JOIN posts p ON p.id = cm.post_id
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
    SELECT id, username, email, role, status, created_at, last_ip, last_ip_hash, last_seen_at, last_login_at,
      COALESCE((SELECT COUNT(*) FROM sessions s WHERE s.user_id = users.id AND s.expires_at > ?), 0) AS session_count
    FROM users
    ORDER BY created_at DESC
    LIMIT 100
  `).bind(nowIso()).all<Record<string, unknown>>();
  return c.json({ users: await attachUserIpPreviews(c.env.DB, result.results ?? []) });
});

app.patch("/api/admin/users/:id", async (c) => {
  const admin = requireAdmin(c);
  if (admin instanceof Response) return admin;
  const body = await readJson(c);
  const username = body.username === undefined ? null : cleanName(body.username);
  const email = body.email === undefined ? null : String(body.email ?? "").trim().toLowerCase();
  const status = ["active", "muted", "banned"].includes(String(body.status)) ? String(body.status) : null;
  const role = ["user", "admin"].includes(String(body.role)) ? String(body.role) : null;
  if (!status && !role && username === null && email === null) return c.json({ error: "没有可更新字段" }, 400);
  if (c.req.param("id") === admin.id && status === "banned") return c.json({ error: "不能封禁自己" }, 400);
  if (c.req.param("id") === admin.id && role === "user") return c.json({ error: "不能移除自己的管理员权限" }, 400);
  if (username !== null && (username.length < 2 || username.length > 24)) {
    return c.json({ error: "昵称需要 2-24 个字符" }, 400);
  }
  if (email !== null && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return c.json({ error: "邮箱格式不对" }, 400);
  }
  const target = await c.env.DB.prepare("SELECT id, role FROM users WHERE id = ?")
    .bind(c.req.param("id"))
    .first<{ id: string; role: Role }>();
  if (!target) return c.json({ error: "用户不存在" }, 404);
  if (target.role === "admin" && role === "user" && await isLastAdmin(c.env.DB, target.id)) {
    return c.json({ error: "不能移除最后一个管理员" }, 400);
  }

  const pieces: string[] = [];
  const values: string[] = [];
  if (username !== null) {
    pieces.push("username = ?");
    values.push(username);
  }
  if (email !== null) {
    pieces.push("email = ?");
    values.push(email);
  }
  if (status) {
    pieces.push("status = ?");
    values.push(status);
  }
  if (role) {
    pieces.push("role = ?");
    values.push(role);
  }
  try {
    await c.env.DB.prepare(`UPDATE users SET ${pieces.join(", ")}, updated_at = ? WHERE id = ?`)
      .bind(...values, nowIso(), c.req.param("id"))
      .run();
  } catch {
    return c.json({ error: "昵称或邮箱已被占用" }, 409);
  }
  return c.json({ ok: true });
});

app.delete("/api/admin/users/:id", async (c) => {
  const admin = requireAdmin(c);
  if (admin instanceof Response) return admin;
  const targetId = c.req.param("id");
  if (targetId === admin.id) return c.json({ error: "不能删除自己" }, 400);
  const target = await c.env.DB.prepare("SELECT id, role FROM users WHERE id = ?")
    .bind(targetId)
    .first<{ id: string; role: Role }>();
  if (!target) return c.json({ error: "用户不存在" }, 404);
  if (target.role === "admin" && await isLastAdmin(c.env.DB, target.id)) {
    return c.json({ error: "不能删除最后一个管理员" }, 400);
  }
  await c.env.DB.prepare("DELETE FROM sessions WHERE user_id = ?").bind(targetId).run();
  await c.env.DB.prepare("DELETE FROM users WHERE id = ?").bind(targetId).run();
  return c.json({ ok: true });
});

app.post("/api/admin/users/:id/ban", async (c) => {
  const admin = requireAdmin(c);
  if (admin instanceof Response) return admin;
  const targetId = c.req.param("id");
  if (targetId === admin.id) return c.json({ error: "不能封禁自己" }, 400);
  const target = await c.env.DB.prepare("SELECT id, role FROM users WHERE id = ?")
    .bind(targetId)
    .first<{ id: string; role: Role }>();
  if (!target) return c.json({ error: "用户不存在" }, 404);
  if (target.role === "admin" && await isLastAdmin(c.env.DB, target.id)) {
    return c.json({ error: "不能封禁最后一个管理员" }, 400);
  }
  const now = nowIso();
  await c.env.DB.prepare("UPDATE users SET status = 'banned', updated_at = ? WHERE id = ?")
    .bind(now, targetId)
    .run();
  await c.env.DB.prepare("DELETE FROM sessions WHERE user_id = ?").bind(targetId).run();
  return c.json({ ok: true });
});

app.post("/api/admin/users/:id/ban-ip", async (c) => {
  const admin = requireAdmin(c);
  if (admin instanceof Response) return admin;
  const targetId = c.req.param("id");
  const target = await c.env.DB.prepare("SELECT id, username, last_ip, last_ip_hash FROM users WHERE id = ?")
    .bind(targetId)
    .first<{ id: string; username: string; last_ip: string | null; last_ip_hash: string | null }>();
  if (!target) return c.json({ error: "用户不存在" }, 404);
  const ipRows = await c.env.DB.prepare("SELECT ip_hash, ip FROM user_ip_events WHERE user_id = ?")
    .bind(target.id)
    .all<{ ip_hash: string; ip: string }>();
  const targets = uniqueIpBanTargets(ipRows.results ?? [], target.last_ip_hash, target.last_ip);
  if (!targets.length) return c.json({ error: "这个用户还没有记录到 IP" }, 400);
  const now = nowIso();
  const batch = targets.map((item) => c.env.DB.prepare(`
      INSERT INTO visitor_permissions (id, kind, subject, level, reason, expires_at, created_by, created_at)
      VALUES (?, 'ip_hash', ?, 'banned', ?, NULL, ?, ?)
    `).bind(crypto.randomUUID(), item.ipHash, `一键 ban IP：${target.username} ${item.ip}`.slice(0, 240), admin.id, now));
  await c.env.DB.batch(batch);
  return c.json({ ok: true, banned: targets.length, ipHashes: targets.map((item) => item.ipHash) });
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

app.get("/post/:slug", async (c) => {
  const slug = c.req.param("slug");
  const row = await c.env.DB.prepare(`
    SELECT p.title, p.slug, p.summary, p.content, p.cover_key, p.category, p.hazard_level, p.final_rating, p.rating_reason, p.twitter_ref, p.created_at, p.updated_at,
      COALESCE(NULLIF(p.submitter_name, ''), u.username) AS author_name
    FROM posts p
    JOIN users u ON u.id = p.author_id
    WHERE p.slug = ? AND p.status = 'published'
  `).bind(slug).first<Record<string, unknown>>();
  if (!row) {
    return new Response(renderPage({
      title: "帖子不存在 - NoMTF 不药娘网",
      description: SITE_DESCRIPTION,
      canonical: `${SITE_ORIGIN}/`
    }), {
      status: 404,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store"
      }
    });
  }
  const coverKey = String(row.cover_key ?? "");
  const title = String(row.title);
  const description = seoDescription(row.summary || row.content);
  const canonical = postPublicUrl(String(row.slug));
  const image = coverKey ? `${SITE_ORIGIN}/media/${coverKey}` : undefined;
  return new Response(renderPage({
    title: `${title} - NoMTF 不药娘网`,
    description,
    canonical,
    image,
    type: "article",
    staticHtml: renderStaticPostHtml(row),
    jsonLd: buildPostJsonLd(row, canonical, image)
  }), {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "public, max-age=300"
    }
  });
});

app.get("*", (c) => {
  return new Response(renderPage(), {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store"
    }
  });
});

async function enforceHttps(c: AppContext, next: Next) {
  if (shouldRedirectToHttps(c)) {
    const url = new URL(c.req.url);
    url.protocol = "https:";
    return c.redirect(url.toString(), 308);
  }
  await next();
}

async function applySecurityHeaders(c: AppContext, next: Next) {
  await next();
  c.res.headers.set("X-Content-Type-Options", "nosniff");
  c.res.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  c.res.headers.set("X-Frame-Options", "SAMEORIGIN");
  c.res.headers.set("Cross-Origin-Resource-Policy", "same-origin");
  c.res.headers.set("Permissions-Policy", "geolocation=(), camera=(), microphone=(), payment=()");
  if (isHttps(c)) {
    c.res.headers.set("Strict-Transport-Security", "max-age=15552000; includeSubDomains");
  }
}

async function serveMediaObject(c: AppContext, key: string, fallbackContentType = "application/octet-stream"): Promise<Response> {
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
    headers.set("Content-Type", fallbackContentType);
  }

  return new Response(object.body, { headers });
}

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
  const ip = clientIpFromRequest(c);
  const ipHash = ip ? await sha256Hex(`${secret}:${ip}`) : "";
  const ipLocation = ipLocationFromRequest(c, ip);
  const token = getCookie(c, SESSION_COOKIE);
  const user = token ? await getUserBySession(c.env.DB, token) : null;
  const permission = await resolvePermission(c.env.DB, user, visitorId, ipHash);

  c.set("visitorId", visitorId);
  c.set("user", user);
  c.set("permission", permission);
  c.set("ipHash", ipHash);
  c.set("ipAddress", ip);
  c.set("ipLocation", ipLocation);
  if (user) {
    c.executionCtx.waitUntil(updateUserPresence(c, user).catch((error) => {
      console.error(JSON.stringify({ level: "warn", message: "user presence update failed", error: String(error) }));
    }));
  }

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

function clientIpFromRequest(c: AppContext): string {
  const trueClientIp = c.req.header("True-Client-IP")?.trim();
  if (trueClientIp) return trueClientIp;
  const cfConnectingIp = c.req.header("CF-Connecting-IP")?.trim();
  if (cfConnectingIp) return cfConnectingIp;
  const url = new URL(c.req.url);
  if (url.hostname === "localhost" || url.hostname === "127.0.0.1" || url.hostname.endsWith(".localhost")) {
    return c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ?? "";
  }
  return "";
}

function ipLocationFromRequest(c: AppContext, ip: string): IpLocation {
  const cf = c.req.raw.cf as Record<string, unknown> | undefined;
  const country = cleanText(cf?.country ?? c.req.header("CF-IPCountry") ?? "", 8).toUpperCase();
  const region = cleanText(cf?.region, 80);
  const regionCode = cleanText(cf?.regionCode, 24);
  const city = cleanText(cf?.city, 80);
  const postalCode = cleanText(cf?.postalCode, 32);
  const metroCode = cleanText(cf?.metroCode, 32);
  const timezone = cleanText(cf?.timezone, 80);
  const latitude = cleanText(cf?.latitude, 32);
  const longitude = cleanText(cf?.longitude, 32);
  const continent = cleanText(cf?.continent, 8).toUpperCase();
  const asn = cleanText(cf?.asn, 32);
  const asOrganization = cleanText(cf?.asOrganization, 120);
  const colo = cleanText(cf?.colo, 20);
  const fallback = fallbackIpLocation(ip);
  return {
    country: country || fallback.country,
    continent: continent || fallback.continent,
    region: region || fallback.region,
    regionCode: regionCode || fallback.regionCode,
    city: city || fallback.city,
    postalCode: postalCode || fallback.postalCode,
    metroCode: metroCode || fallback.metroCode,
    timezone: timezone || fallback.timezone,
    latitude: latitude || fallback.latitude,
    longitude: longitude || fallback.longitude,
    asn: asn || fallback.asn,
    asOrganization: asOrganization || fallback.asOrganization,
    colo: colo || fallback.colo
  };
}

function fallbackIpLocation(ip: string): IpLocation {
  if (/^147\.79\.59\./.test(ip)) return emptyIpLocation({ country: "JP", region: "Tokyo", city: "Tokyo" });
  return emptyIpLocation();
}

function emptyIpLocation(overrides: Partial<IpLocation> = {}): IpLocation {
  return {
    country: "",
    continent: "",
    region: "",
    regionCode: "",
    city: "",
    postalCode: "",
    metroCode: "",
    timezone: "",
    latitude: "",
    longitude: "",
    asn: "",
    asOrganization: "",
    colo: "",
    ...overrides
  };
}

function formatIpLocation(country: string, region: string, city: string, colo: string): string {
  const countryName = countryNameZh(country);
  const cityName = cityNameZh(city);
  const regionName = cityName ? "" : regionNameZh(region);
  const main = [countryName, regionName, cityName].filter(Boolean).join("");
  return main || (colo ? `Cloudflare ${colo}` : "");
}

function countryNameZh(country: string): string {
  const map: Record<string, string> = {
    CN: "中国",
    HK: "香港",
    MO: "澳门",
    TW: "台湾",
    JP: "日本",
    US: "美国",
    SG: "新加坡",
    KR: "韩国",
    RU: "俄罗斯",
    DE: "德国",
    FR: "法国",
    GB: "英国",
    CA: "加拿大",
    AU: "澳大利亚",
    NL: "荷兰",
    VN: "越南",
    TH: "泰国",
    MY: "马来西亚",
    ID: "印度尼西亚",
    PH: "菲律宾"
  };
  return map[country] ?? country;
}

function cityNameZh(city: string): string {
  const key = city.trim().toLowerCase();
  const map: Record<string, string> = {
    tokyo: "东京",
    osaka: "大阪",
    "hong kong": "香港",
    singapore: "新加坡",
    seoul: "首尔",
    beijing: "北京",
    shanghai: "上海",
    guangzhou: "广州",
    shenzhen: "深圳",
    hangzhou: "杭州",
    chengdu: "成都",
    wuhan: "武汉",
    "new york": "纽约",
    "los angeles": "洛杉矶",
    "san francisco": "旧金山",
    london: "伦敦",
    paris: "巴黎",
    frankfurt: "法兰克福",
    sydney: "悉尼"
  };
  return map[key] ?? city.trim();
}

function regionNameZh(region: string): string {
  const key = region.trim().toLowerCase();
  const map: Record<string, string> = {
    tokyo: "东京",
    "tokyo prefecture": "东京",
    california: "加利福尼亚",
    "new york": "纽约",
    "new south wales": "新南威尔士"
  };
  return map[key] ?? region.trim();
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

async function isLastAdmin(db: D1Database, userId: string): Promise<boolean> {
  const row = await db.prepare("SELECT COUNT(*) AS count FROM users WHERE role = 'admin' AND status != 'banned' AND id != ?")
    .bind(userId)
    .first<{ count: number }>();
  return Number(row?.count ?? 0) === 0;
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

async function updateUserPresence(c: AppContext, user: User): Promise<void> {
  const ipAddress = c.get("ipAddress");
  const ipHash = c.get("ipHash");
  if (!ipHash) return;
  const now = nowIso();
  await c.env.DB.prepare("UPDATE users SET last_ip = ?, last_ip_hash = ?, last_seen_at = ? WHERE id = ?")
    .bind(ipAddress, ipHash, now, user.id)
    .run();
  await recordUserIpEvent(c, user.id, now);
}

async function attachUserIpPreviews(db: D1Database, users: Record<string, unknown>[]): Promise<Record<string, unknown>[]> {
  const ids = users.map((row) => String(row.id ?? "")).filter(Boolean);
  if (!ids.length) return users;
  const placeholders = ids.map(() => "?").join(",");
  const result = await db.prepare(`
    SELECT user_id, ip_hash, ip, country, continent, region, region_code, city, postal_code, metro_code, timezone, latitude, longitude, asn, as_organization, colo, browser_latitude, browser_longitude, browser_accuracy, browser_altitude, browser_altitude_accuracy, browser_heading, browser_speed, browser_recorded_at, first_seen_at, last_seen_at, seen_count
    FROM user_ip_events
    WHERE user_id IN (${placeholders})
    ORDER BY CASE WHEN country = 'CN' THEN 0 ELSE 1 END, last_seen_at DESC
  `).bind(...ids).all<Record<string, unknown>>();
  const grouped = new Map<string, Record<string, unknown>[]>();
  for (const row of result.results ?? []) {
    const userId = String(row.user_id ?? "");
    const list = grouped.get(userId) ?? [];
    list.push(row);
    grouped.set(userId, list);
  }
  return users.map((user) => {
    const list = grouped.get(String(user.id ?? "")) ?? [];
    const previews = list.map(ipPreviewFromRow);
    if (!previews.length && user.last_ip) {
      previews.push(ipPreviewFromRow({
        ip: user.last_ip,
        ip_hash: user.last_ip_hash,
        last_seen_at: user.last_seen_at,
        seen_count: 1,
        ...fallbackIpLocation(String(user.last_ip))
      }));
    }
    previews.sort(compareIpPreview);
    return {
      ...user,
      ip_previews: previews,
      ip_preview: previews[0]?.label ?? (user.last_ip ? `${user.last_ip}` : "未记录")
    };
  });
}

function ipPreviewFromRow(row: Record<string, unknown>) {
  const ip = String(row.ip ?? "");
  const country = String(row.country ?? "").toUpperCase();
  const continent = String(row.continent ?? "").toUpperCase();
  const region = String(row.region ?? "");
  const regionCode = String(row.region_code ?? row.regionCode ?? "");
  const city = String(row.city ?? "");
  const postalCode = String(row.postal_code ?? row.postalCode ?? "");
  const metroCode = String(row.metro_code ?? row.metroCode ?? "");
  const timezone = String(row.timezone ?? "");
  const latitude = String(row.latitude ?? "");
  const longitude = String(row.longitude ?? "");
  const asn = String(row.asn ?? "");
  const asOrganization = String(row.as_organization ?? row.asOrganization ?? "");
  const colo = String(row.colo ?? "");
  const browserLatitude = String(row.browser_latitude ?? row.browserLatitude ?? "");
  const browserLongitude = String(row.browser_longitude ?? row.browserLongitude ?? "");
  const browserAccuracy = String(row.browser_accuracy ?? row.browserAccuracy ?? "");
  const browserAltitude = String(row.browser_altitude ?? row.browserAltitude ?? "");
  const browserAltitudeAccuracy = String(row.browser_altitude_accuracy ?? row.browserAltitudeAccuracy ?? "");
  const browserHeading = String(row.browser_heading ?? row.browserHeading ?? "");
  const browserSpeed = String(row.browser_speed ?? row.browserSpeed ?? "");
  const browserRecordedAt = String(row.browser_recorded_at ?? row.browserRecordedAt ?? "");
  const location = formatIpLocation(country, region, city, String(row.colo ?? ""));
  const details = buildIpPrecisionDetails({
    continent,
    regionCode,
    postalCode,
    metroCode,
    timezone,
    latitude,
    longitude,
    asn,
    asOrganization,
    colo,
    browserLatitude,
    browserLongitude,
    browserAccuracy,
    browserAltitude,
    browserAltitudeAccuracy,
    browserHeading,
    browserSpeed,
    browserRecordedAt
  });
  return {
    ip,
    ipHash: String(row.ip_hash ?? ""),
    country,
    continent,
    region,
    regionCode,
    city,
    postalCode,
    metroCode,
    timezone,
    latitude,
    longitude,
    asn,
    asOrganization,
    colo,
    browserLatitude,
    browserLongitude,
    browserAccuracy,
    browserAltitude,
    browserAltitudeAccuracy,
    browserHeading,
    browserSpeed,
    browserRecordedAt,
    hasPreciseLocation: Boolean(browserLatitude && browserLongitude),
    location,
    label: location ? `${ip}（${location}）` : ip || "未记录",
    detail: details.join(" · "),
    lastSeenAt: String(row.last_seen_at ?? ""),
    firstSeenAt: String(row.first_seen_at ?? ""),
    seenCount: Number(row.seen_count ?? 1)
  };
}

function buildIpPrecisionDetails(location: Pick<IpLocation, "continent" | "regionCode" | "postalCode" | "metroCode" | "timezone" | "latitude" | "longitude" | "asn" | "asOrganization" | "colo"> & {
  browserLatitude: string;
  browserLongitude: string;
  browserAccuracy: string;
  browserAltitude: string;
  browserAltitudeAccuracy: string;
  browserHeading: string;
  browserSpeed: string;
  browserRecordedAt: string;
}): string[] {
  const details: string[] = [];
  if (location.browserLatitude && location.browserLongitude) {
    const accuracy = location.browserAccuracy ? ` ±${location.browserAccuracy}m` : "";
    details.push(`浏览器定位 ${location.browserLatitude}, ${location.browserLongitude}${accuracy}`);
  }
  if (location.browserAltitude) details.push(`海拔 ${location.browserAltitude}m${location.browserAltitudeAccuracy ? ` ±${location.browserAltitudeAccuracy}m` : ""}`);
  if (location.browserHeading) details.push(`朝向 ${location.browserHeading}°`);
  if (location.browserSpeed) details.push(`速度 ${location.browserSpeed}m/s`);
  if (location.browserRecordedAt) details.push(`授权定位 ${location.browserRecordedAt}`);
  if (location.postalCode) details.push(`邮编 ${location.postalCode}`);
  if (location.latitude && location.longitude) details.push(`坐标 ${location.latitude}, ${location.longitude}`);
  if (location.timezone) details.push(`时区 ${location.timezone}`);
  if (location.regionCode) details.push(`地区码 ${location.regionCode}`);
  if (location.metroCode) details.push(`都会区 ${location.metroCode}`);
  if (location.asn || location.asOrganization) details.push(`ASN ${[location.asn, location.asOrganization].filter(Boolean).join(" ")}`);
  if (location.continent) details.push(`洲 ${location.continent}`);
  if (location.colo) details.push(`CF ${location.colo}`);
  return details;
}

function compareIpPreview(a: { country: string; lastSeenAt: string; hasPreciseLocation?: boolean }, b: { country: string; lastSeenAt: string; hasPreciseLocation?: boolean }): number {
  const china = (a.country === "CN" ? 0 : 1) - (b.country === "CN" ? 0 : 1);
  if (china !== 0) return china;
  const precise = (b.hasPreciseLocation ? 1 : 0) - (a.hasPreciseLocation ? 1 : 0);
  if (precise !== 0) return precise;
  return b.lastSeenAt.localeCompare(a.lastSeenAt);
}

function uniqueIpBanTargets(rows: Array<{ ip_hash: string; ip: string }>, lastIpHash: string | null, lastIp: string | null) {
  const seen = new Set<string>();
  const targets: Array<{ ipHash: string; ip: string }> = [];
  for (const row of rows) {
    if (!row.ip_hash || seen.has(row.ip_hash)) continue;
    seen.add(row.ip_hash);
    targets.push({ ipHash: row.ip_hash, ip: row.ip || "" });
  }
  if (lastIpHash && !seen.has(lastIpHash)) {
    targets.push({ ipHash: lastIpHash, ip: lastIp ?? "" });
  }
  return targets;
}

async function recordUserIpEvent(c: AppContext, userId: string, timestamp = nowIso()): Promise<void> {
  const ipHash = c.get("ipHash");
  if (!ipHash) return;
  const location = c.get("ipLocation");
  await c.env.DB.prepare(`
    INSERT INTO user_ip_events (
      user_id, ip_hash, ip, country, continent, region, region_code, city, postal_code, metro_code, timezone, latitude, longitude, asn, as_organization, colo, first_seen_at, last_seen_at, seen_count
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
    ON CONFLICT(user_id, ip_hash)
    DO UPDATE SET
      ip = excluded.ip,
      country = CASE WHEN excluded.country != '' THEN excluded.country ELSE user_ip_events.country END,
      continent = CASE WHEN excluded.continent != '' THEN excluded.continent ELSE user_ip_events.continent END,
      region = CASE WHEN excluded.region != '' THEN excluded.region ELSE user_ip_events.region END,
      region_code = CASE WHEN excluded.region_code != '' THEN excluded.region_code ELSE user_ip_events.region_code END,
      city = CASE WHEN excluded.city != '' THEN excluded.city ELSE user_ip_events.city END,
      postal_code = CASE WHEN excluded.postal_code != '' THEN excluded.postal_code ELSE user_ip_events.postal_code END,
      metro_code = CASE WHEN excluded.metro_code != '' THEN excluded.metro_code ELSE user_ip_events.metro_code END,
      timezone = CASE WHEN excluded.timezone != '' THEN excluded.timezone ELSE user_ip_events.timezone END,
      latitude = CASE WHEN excluded.latitude != '' THEN excluded.latitude ELSE user_ip_events.latitude END,
      longitude = CASE WHEN excluded.longitude != '' THEN excluded.longitude ELSE user_ip_events.longitude END,
      asn = CASE WHEN excluded.asn != '' THEN excluded.asn ELSE user_ip_events.asn END,
      as_organization = CASE WHEN excluded.as_organization != '' THEN excluded.as_organization ELSE user_ip_events.as_organization END,
      colo = CASE WHEN excluded.colo != '' THEN excluded.colo ELSE user_ip_events.colo END,
      last_seen_at = excluded.last_seen_at,
      seen_count = user_ip_events.seen_count + 1
  `).bind(
    userId,
    ipHash,
    c.get("ipAddress"),
    location.country,
    location.continent,
    location.region,
    location.regionCode,
    location.city,
    location.postalCode,
    location.metroCode,
    location.timezone,
    location.latitude,
    location.longitude,
    location.asn,
    location.asOrganization,
    location.colo,
    timestamp,
    timestamp
  ).run();
}

async function recordBrowserLocation(c: AppContext, userId: string, location: BrowserLocationInput): Promise<void> {
  const ipHash = c.get("ipHash");
  if (!ipHash) return;
  await c.env.DB.prepare(`
    UPDATE user_ip_events
    SET
      browser_latitude = ?,
      browser_longitude = ?,
      browser_accuracy = ?,
      browser_altitude = ?,
      browser_altitude_accuracy = ?,
      browser_heading = ?,
      browser_speed = ?,
      browser_recorded_at = ?,
      last_seen_at = ?
    WHERE user_id = ? AND ip_hash = ?
  `).bind(
    location.latitude,
    location.longitude,
    location.accuracy,
    location.altitude,
    location.altitudeAccuracy,
    location.heading,
    location.speed,
    location.recordedAt,
    nowIso(),
    userId,
    ipHash
  ).run();
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

function isAdminRequest(c: AppContext): boolean {
  return c.get("user")?.role === "admin";
}

async function enforceContentWriteCooldown(c: AppContext, user: User): Promise<Response | null> {
  if (user.role === "admin" || isAdminRequest(c)) return null;
  const message = `发帖或回复太快了，请 ${CONTENT_WRITE_COOLDOWN_SECONDS} 秒后再试`;
  const userCooldown = await requireCooldownAvailable(c, "content_write_user", userSubject(user), message);
  if (userCooldown) return userCooldown;
  const ipCooldown = await requireCooldownAvailable(c, "content_write_ip", ipSubject(c), message);
  if (ipCooldown) return ipCooldown;

  await setCooldown(c.env.DB, "content_write_user", userSubject(user), CONTENT_WRITE_COOLDOWN_SECONDS);
  await setCooldown(c.env.DB, "content_write_ip", ipSubject(c), CONTENT_WRITE_COOLDOWN_SECONDS);
  return null;
}

async function enforceCommentWriteCooldown(c: AppContext): Promise<Response | null> {
  if (isAdminRequest(c)) return null;
  const message = `评论太快了，请 ${COMMENT_WRITE_COOLDOWN_SECONDS} 秒后再试`;
  const actorCooldown = await requireCooldownAvailable(c, "comment_write_actor", actorSubject(c), message);
  if (actorCooldown) return actorCooldown;
  const ipCooldown = await requireCooldownAvailable(c, "comment_write_ip", ipSubject(c), message);
  if (ipCooldown) return ipCooldown;

  await setCooldown(c.env.DB, "comment_write_actor", actorSubject(c), COMMENT_WRITE_COOLDOWN_SECONDS);
  await setCooldown(c.env.DB, "comment_write_ip", ipSubject(c), COMMENT_WRITE_COOLDOWN_SECONDS);
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
  if (isAdminRequest(c)) return null;
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
  if (isAdminRequest(c)) return null;
  const retryAfter = await getCooldownSeconds(c.env.DB, bucket, subject);
  if (retryAfter <= 0) return null;
  return rateLimitedResponse(c, message, retryAfter);
}

async function getCooldownSeconds(db: D1Database, bucket: string, subject: string): Promise<number> {
  const row = await db.prepare("SELECT expires_at FROM rate_cooldowns WHERE bucket = ? AND subject = ?")
    .bind(bucket, subject)
    .first<{ expires_at: string }>();
  return secondsUntil(row?.expires_at ?? "");
}

async function submissionApiCooldown(c: AppContext): Promise<Response | null> {
  const retryAfter = await getCooldownSeconds(c.env.DB, "submission_api_ip", ipSubject(c));
  if (retryAfter <= 0) return null;
  return rateLimitedResponse(c, `投稿冷却中，剩余 ${retryAfter} 秒`, retryAfter);
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
  if (isAdminRequest(c)) return null;
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

async function recordSearchEvent(c: AppContext, rawQuery: string): Promise<void> {
  const query = normalizeSearchQuery(rawQuery);
  if (!query) return;
  await c.env.DB.prepare(`
    INSERT INTO search_events (id, query, query_key, user_id, visitor_id, ip_hash, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).bind(crypto.randomUUID(), query, searchQueryKey(query), c.get("user")?.id ?? null, c.get("visitorId"), c.get("ipHash"), nowIso()).run();
}

async function getSearchTrends(db: D1Database, limit: number): Promise<Array<{ query: string; count: number }>> {
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const result = await db.prepare(`
    SELECT query, COUNT(*) AS count, MAX(created_at) AS latest_at
    FROM search_events
    WHERE created_at >= ?
    GROUP BY query_key
    ORDER BY count DESC, latest_at DESC
    LIMIT ?
  `).bind(since, Math.min(20, Math.max(1, limit))).all<{ query: string; count: number }>();
  return (result.results ?? []).map((row) => ({
    query: row.query,
    count: Number(row.count ?? 0)
  }));
}

async function getSubmissionAuthorId(db: D1Database): Promise<string | null> {
  const row = await db.prepare("SELECT id FROM users WHERE role = 'admin' AND status = 'active' ORDER BY created_at ASC LIMIT 1")
    .first<{ id: string }>();
  return row?.id ?? null;
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
  const staleSearches = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  await db.prepare("DELETE FROM search_events WHERE created_at < ?").bind(staleSearches).run();
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
    if (raw.imageChanged === true && typeof raw.imageSrc === "string") {
      const imageSrc = cleanImageSource(raw.imageSrc);
      if (imageSrc) {
        override.imageChanged = true;
        override.imageSrc = imageSrc;
      }
    }
    if (raw.imageAltChanged === true && typeof raw.imageAlt === "string") {
      override.imageAltChanged = true;
      override.imageAlt = cleanText(raw.imageAlt, 160);
    }
    if (!Object.keys(override.styles).length && !override.textChanged && !override.placeholderChanged && !override.imageChanged && !override.imageAltChanged) {
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

function cleanImageSource(value: unknown): string {
  const text = cleanText(value, 600).replace(/[\u0000-\u001f\u007f]/g, "");
  if (!text) return "";
  if (/^\/(?:media|assets)\/[^\s"'<>\\]{1,560}$/i.test(text)) return text;
  try {
    const url = new URL(text);
    if (url.protocol === "https:" && !url.username && !url.password && url.href.length <= 600) {
      return url.href;
    }
  } catch {
    return "";
  }
  return "";
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

async function uniqueSlug(db: D1Database, source: string, excludePostId = ""): Promise<string> {
  const base = slugify(source) || crypto.randomUUID().slice(0, 8);
  for (let i = 0; i < 80; i += 1) {
    const slug = i === 0 ? base : `${base}-${i + 1}`;
    const found = excludePostId
      ? await db.prepare("SELECT id FROM posts WHERE slug = ? AND id != ?").bind(slug, excludePostId).first()
      : await db.prepare("SELECT id FROM posts WHERE slug = ?").bind(slug).first();
    if (!found) return slug;
  }
  return `${base}-${crypto.randomUUID().slice(0, 8)}`;
}

async function createExternalSubmission(db: D1Database, input: SubmissionInput): Promise<CreatedSubmission | null> {
  const authorId = await getSubmissionAuthorId(db);
  if (!authorId) return null;
  const now = nowIso();
  const id = crypto.randomUUID();
  const slug = await uniqueSlug(db, input.requestedSlug || input.title);
  const status: PostStatus = input.category === "talk" ? "published" : "pending";
  await db.prepare(`
    INSERT INTO posts (id, title, slug, summary, content, final_rating, rating_reason, twitter_ref, category, hazard_level, nsfw, cover_key, submitter_name, status, author_id, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `)
    .bind(
      id,
      input.title,
      slug,
      input.summary,
      input.content,
      input.finalRating,
      input.ratingReason,
      input.twitterRef,
      input.category,
      input.hazardLevel,
      input.nsfw ? 1 : 0,
      input.coverKey,
      input.submitterName,
      status,
      authorId,
      now,
      now
    )
    .run();
  await syncTags(db, id, input.tags);
  return { id, slug, status, category: input.category };
}

function requireSubmissionApiAccess(c: AppContext): Response | null {
  const apiKey = getSubmissionApiKey(c.env);
  if (!apiKey) return c.json({ error: "投稿 API 尚未开启，请先配置 SUBMISSION_API_KEY" }, 503);
  const provided = c.req.header("X-NoMTF-Submit-Key") ?? c.req.header("Authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  if (!provided || !safeEqualText(provided, apiKey)) return c.json({ error: "投稿 API key 不正确" }, 401);
  return null;
}

async function storeImageFile(env: Env, file: File, uploadedBy: string) {
  if (file.size <= 0) {
    throw new Error("图片文件为空，请重新选择");
  }
  const bytes = await file.arrayBuffer();
  return storeImageBytes(env, bytes, file.name, file.type, uploadedBy);
}

async function storeImageBytes(env: Env, bytes: ArrayBuffer, name: string, declaredType: string, uploadedBy: string) {
  if (bytes.byteLength <= 0) {
    throw new Error("图片文件为空，请重新选择");
  }
  if (bytes.byteLength > MAX_IMAGE_BYTES) {
    throw new Error("图片不能超过 15MB");
  }
  const contentType = inferImageContentType(name, declaredType, bytes);
  if (!contentType) {
    throw new Error("只能上传 JPG、PNG、GIF、WebP 或 AVIF 图片");
  }

  const ext = extensionFromName(name) || extensionFromContentType(contentType);
  const key = `uploads/${new Date().toISOString().slice(0, 10)}/${crypto.randomUUID()}${ext}`;
  await env.MEDIA.put(key, bytes, {
    httpMetadata: {
      contentType,
      cacheControl: "public, max-age=31536000, immutable"
    },
    customMetadata: {
      uploadedBy: uploadedBy.slice(0, 120)
    }
  });
  return { key, url: `/media/${key}` };
}

function cleanR2Keys(value: unknown): string[] {
  const raw = Array.isArray(value) ? value : String(value ?? "").split(/[\n,]+/);
  const seen = new Set<string>();
  const keys: string[] = [];
  for (const item of raw) {
    const key = optionalR2Key(item);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    keys.push(key);
    if (keys.length >= MAX_TELEGRAM_BODY_IMAGES) break;
  }
  return keys;
}

function appendImageKeysToContent(content: string, keys: string[]): string {
  let text = String(content ?? "").trim();
  for (const key of keys) {
    text += `\n\n![${fileNameFromKey(key)}](/media/${key})\n`;
  }
  return text.trim();
}

async function handleTelegramUpdate(env: Env, update: TelegramUpdate): Promise<void> {
  if (update.callback_query) {
    await answerTelegramCallback(env, update.callback_query.id);
    await handleTelegramCallback(env, update.callback_query);
    return;
  }
  if (update.message) {
    await handleTelegramMessage(env, update.message);
  }
}

async function handleTelegramCallback(env: Env, callback: TelegramCallbackQuery): Promise<void> {
  const data = callback.data ?? "";
  const chatId = telegramChatId(callback.message) || (callback.from ? String(callback.from.id) : "");
  if (!chatId) return;

  if (data === "tg:new") {
    await startTelegramSubmission(env, chatId);
    return;
  }
  if (data === "tg:cancel") {
    await deleteTelegramSession(env.DB, chatId);
    await sendTelegramMessage(env, chatId, "已取消本次投稿。", startKeyboard());
    return;
  }
  if (data.startsWith("tg:cat:")) {
    const category = data.endsWith(":talk") ? "talk" : "rating";
    await saveTelegramSession(env.DB, chatId, "submitterName", { category });
    await sendTelegramMessage(env, chatId, `已选择：${categoryTextForTelegram(category)}\n\n请先发送投稿者署名（2-40 字，会显示在网站作者位置；可以填“匿名”）。`, cancelKeyboard());
    return;
  }

  const session = await getTelegramSession(env.DB, chatId);
  if (!session) {
    await sendTelegramMessage(env, chatId, "当前没有进行中的投稿。", startKeyboard());
    return;
  }
  const draft = session.draft;

  if (data.startsWith("tg:hazard:")) {
    const level = Number(data.replace("tg:hazard:", ""));
    if (!Number.isInteger(level) || level < 1 || level > 5) {
      await askTelegramHazardLevel(env, chatId, draft);
      return;
    }
    draft.hazardLevel = level;
    await saveTelegramSession(env.DB, chatId, "ratingReason", draft);
    await sendTelegramMessage(env, chatId, "请发送评级原因（会显示在正文上方，最多 240 字）。", cancelKeyboard());
    return;
  }
  if (data.startsWith("tg:nsfw:")) {
    draft.nsfw = data.endsWith(":1");
    await saveTelegramSession(env.DB, chatId, "cover", draft);
    await sendTelegramMessage(env, chatId, "请发送封面图（只收 1 张）。也可以点跳过。", skipKeyboard("cover"));
    return;
  }
  if (data === "tg:skip:tags") {
    draft.tags = "";
    await saveTelegramSession(env.DB, chatId, "summary", draft);
    await sendTelegramMessage(env, chatId, "请发送摘要（最多 240 字）。也可以点跳过。", skipKeyboard("summary"));
    return;
  }
  if (data === "tg:skip:summary") {
    draft.summary = "";
    await saveTelegramSession(env.DB, chatId, "nsfw", draft);
    await askTelegramNsfw(env, chatId);
    return;
  }
  if (data === "tg:skip:cover") {
    draft.coverKey = "";
    await saveTelegramSession(env.DB, chatId, "bodyImages", draft);
    await sendTelegramMessage(env, chatId, "现在可以连续发送正文图片，最多 10 张。发完点“图片完成”，也可以跳过。", bodyImagesKeyboard(draft));
    return;
  }
  if (data === "tg:skip:bodyImages" || data === "tg:done:bodyImages") {
    await saveTelegramSession(env.DB, chatId, "content", draft);
    await sendTelegramMessage(env, chatId, "最后一步：请发送正文文字（至少 10 字）。", cancelKeyboard());
    return;
  }
  if (data === "tg:confirm") {
    await sendTelegramMessage(env, chatId, "收到确认，正在提交到 NoMTF...");
    await finalizeTelegramSubmission(env, chatId, draft);
  }
}

async function handleTelegramMessage(env: Env, message: TelegramMessage): Promise<void> {
  const chatId = telegramChatId(message);
  if (!chatId) return;
  const text = cleanTelegramText(message.text ?? message.caption ?? "");
  const lower = text.toLowerCase();
  if (lower === "/start" || lower === "/help") {
    await deleteTelegramSession(env.DB, chatId);
    await sendTelegramMessage(env, chatId, "这里是 NoMTF 投稿机器人。点下面的按钮开始，我会一步一步问你要投稿信息和图片。", startKeyboard());
    return;
  }
  if (lower === "/new" || text === "投稿" || text === "开始投稿") {
    await startTelegramSubmission(env, chatId);
    return;
  }
  if (lower === "/cancel" || text === "取消") {
    await deleteTelegramSession(env.DB, chatId);
    await sendTelegramMessage(env, chatId, "已取消本次投稿。", startKeyboard());
    return;
  }

  const session = await getTelegramSession(env.DB, chatId);
  if (!session) {
    await sendTelegramMessage(env, chatId, "还没有开始投稿。点按钮开始。", startKeyboard());
    return;
  }

  if (session.step === "cover" && message.photo?.length) {
    const uploaded = await uploadTelegramPhoto(env, message.photo, chatId);
    session.draft.coverKey = uploaded.key;
    await saveTelegramSession(env.DB, chatId, "bodyImages", session.draft);
    await sendTelegramMessage(env, chatId, "封面已收到。现在可以发送正文图片，最多 10 张。发完点“图片完成”。", bodyImagesKeyboard(session.draft));
    return;
  }
  if (session.step === "bodyImages" && message.photo?.length) {
    const added = await addTelegramBodyPhoto(env, session.draft, message.photo, chatId);
    if (!added) {
      await sendTelegramMessage(env, chatId, "正文图片已经满 10 张了，请点“图片完成”进入正文。", bodyImagesKeyboard(session.draft));
      return;
    }
    if (text.length >= 10) {
      session.draft.content = cleanText(text, MAX_POST_BYTES);
      await saveTelegramSession(env.DB, chatId, "confirm", session.draft);
      await sendTelegramMessage(env, chatId, "图文正文已收到。\n\n" + telegramDraftPreview(session.draft), confirmKeyboard());
      return;
    }
    await saveTelegramSession(env.DB, chatId, "bodyImages", session.draft);
    await sendTelegramMessage(env, chatId, `已收到第 ${(session.draft.bodyImageKeys ?? []).length} 张正文图片。还可以继续发，或点“图片完成”。`, bodyImagesKeyboard(session.draft));
    return;
  }
  if (session.step === "content" && message.photo?.length) {
    const added = await addTelegramBodyPhoto(env, session.draft, message.photo, chatId);
    if (!added) {
      await sendTelegramMessage(env, chatId, "正文图片已经满 10 张了。请只发送正文文字。", cancelKeyboard());
      return;
    }
    if (text.length < 10) {
      await saveTelegramSession(env.DB, chatId, "content", session.draft);
      await sendTelegramMessage(env, chatId, "图片已收到。请再发送正文文字，或重新发送一张带正文说明的图片（caption 至少 10 字）。", cancelKeyboard());
      return;
    }
    session.draft.content = cleanText(text, MAX_POST_BYTES);
    await saveTelegramSession(env.DB, chatId, "confirm", session.draft);
    await sendTelegramMessage(env, chatId, "图文正文已收到。\n\n" + telegramDraftPreview(session.draft), confirmKeyboard());
    return;
  }

  if (!text) {
    await sendTelegramMessage(env, chatId, "这一步需要文字或图片。发送 /cancel 可以取消。", cancelKeyboard());
    return;
  }

  await handleTelegramTextStep(env, chatId, session, text);
}

async function handleTelegramTextStep(env: Env, chatId: string, session: TelegramSession, text: string): Promise<void> {
  const draft = session.draft;
  if ((session.step === "tags" || session.step === "summary" || session.step === "cover" || session.step === "bodyImages") && isSkipText(text)) {
    const next = session.step === "tags" ? "summary" : session.step === "summary" ? "nsfw" : session.step === "cover" ? "bodyImages" : "content";
    if (session.step === "tags") draft.tags = "";
    if (session.step === "summary") draft.summary = "";
    if (session.step === "cover") draft.coverKey = "";
    await saveTelegramSession(env.DB, chatId, next, draft);
    if (next === "summary") await sendTelegramMessage(env, chatId, "请发送摘要（最多 240 字）。也可以点跳过。", skipKeyboard("summary"));
    else if (next === "nsfw") await askTelegramNsfw(env, chatId);
    else if (next === "bodyImages") await sendTelegramMessage(env, chatId, "现在可以连续发送正文图片，最多 10 张。发完点“图片完成”，也可以跳过。", bodyImagesKeyboard(draft));
    else await sendTelegramMessage(env, chatId, "最后一步：请发送正文文字（至少 10 字）。", cancelKeyboard());
    return;
  }

  if (session.step === "submitterName") {
    const submitterName = cleanName(text).slice(0, 40);
    if (submitterName.length < 2) {
      await sendTelegramMessage(env, chatId, "署名太短了，请发送 2-40 字；想匿名就发“匿名”。", cancelKeyboard());
      return;
    }
    draft.submitterName = submitterName;
    await saveTelegramSession(env.DB, chatId, "title", draft);
    await sendTelegramMessage(env, chatId, "署名已记录。现在请发送标题（2-120 字）。", cancelKeyboard());
    return;
  }

  if (session.step === "title") {
    const title = cleanText(text, 120);
    if (title.length < 2) {
      await sendTelegramMessage(env, chatId, "标题太短了，请重新发送 2-120 字标题。", cancelKeyboard());
      return;
    }
    draft.title = title;
    if (draft.category === "rating") {
      await saveTelegramSession(env.DB, chatId, "finalRating", draft);
      await sendTelegramMessage(env, chatId, "请发送最终评级，格式例如：1-、1、1+、2、3+、5。", cancelKeyboard());
    } else {
      await saveTelegramSession(env.DB, chatId, "tags", draft);
      await sendTelegramMessage(env, chatId, "请发送标签，多个标签用逗号分隔。也可以点跳过。", skipKeyboard("tags"));
    }
    return;
  }
  if (session.step === "finalRating") {
    const finalRating = cleanFinalRating(text);
    if (!isValidFinalRating(finalRating)) {
      await sendTelegramMessage(env, chatId, "最终评级格式不对，只能是 1-、1、1+ 到 5-、5、5+。请重新发送。", cancelKeyboard());
      return;
    }
    draft.finalRating = finalRating;
    await saveTelegramSession(env.DB, chatId, "hazardLevel", draft);
    await askTelegramHazardLevel(env, chatId, draft);
    return;
  }
  if (session.step === "hazardLevel") {
    const level = Number(text);
    if (!Number.isInteger(level) || level < 1 || level > 5) {
      await askTelegramHazardLevel(env, chatId, draft);
      return;
    }
    draft.hazardLevel = level;
    await saveTelegramSession(env.DB, chatId, "ratingReason", draft);
    await sendTelegramMessage(env, chatId, "请发送评级原因（会显示在正文上方，最多 240 字）。", cancelKeyboard());
    return;
  }
  if (session.step === "ratingReason") {
    draft.ratingReason = cleanText(text, MAX_RATING_REASON_LENGTH);
    await saveTelegramSession(env.DB, chatId, "twitterRef", draft);
    await sendTelegramMessage(env, chatId, "请发送推特链接或 @用户名；没有就发“占位符”。", cancelKeyboard());
    return;
  }
  if (session.step === "twitterRef") {
    draft.twitterRef = cleanText(text, MAX_TWITTER_REF_LENGTH);
    await saveTelegramSession(env.DB, chatId, "tags", draft);
    await sendTelegramMessage(env, chatId, "请发送标签，多个标签用逗号分隔。也可以点跳过。", skipKeyboard("tags"));
    return;
  }
  if (session.step === "tags") {
    draft.tags = cleanText(text, 160);
    await saveTelegramSession(env.DB, chatId, "summary", draft);
    await sendTelegramMessage(env, chatId, "请发送摘要（最多 240 字）。也可以点跳过。", skipKeyboard("summary"));
    return;
  }
  if (session.step === "summary") {
    draft.summary = cleanText(text, 240);
    await saveTelegramSession(env.DB, chatId, "nsfw", draft);
    await askTelegramNsfw(env, chatId);
    return;
  }
  if (session.step === "cover") {
    await sendTelegramMessage(env, chatId, "这一步请直接发送图片作为封面，或点跳过。", skipKeyboard("cover"));
    return;
  }
  if (session.step === "bodyImages") {
    await sendTelegramMessage(env, chatId, "这一步请发送图片，或点“图片完成/跳过”进入正文。", bodyImagesKeyboard(draft));
    return;
  }
  if (session.step === "content") {
    const content = cleanText(text, MAX_POST_BYTES);
    if (content.length < 10) {
      await sendTelegramMessage(env, chatId, "正文至少 10 个字符，请重新发送。", cancelKeyboard());
      return;
    }
    draft.content = content;
    await saveTelegramSession(env.DB, chatId, "confirm", draft);
    await sendTelegramMessage(env, chatId, telegramDraftPreview(draft), confirmKeyboard());
  }
}

async function finalizeTelegramSubmission(env: Env, chatId: string, draft: TelegramDraft): Promise<void> {
  try {
    const retryAfter = await getCooldownSeconds(env.DB, "telegram_submission_chat", chatId);
    if (retryAfter > 0) {
      await sendTelegramMessage(env, chatId, `投稿冷却中，剩余 ${retryAfter} 秒。稍后再点确认提交即可。`, confirmKeyboard());
      return;
    }
    const input = telegramDraftToSubmissionInput(draft);
    const created = await createExternalSubmission(env.DB, input);
    if (!created) {
      await sendTelegramMessage(env, chatId, "投稿失败：没有可用的管理员作者账号。");
      return;
    }
    await setCooldown(env.DB, "telegram_submission_chat", chatId, SUBMISSION_WRITE_COOLDOWN_SECONDS);
    await deleteTelegramSession(env.DB, chatId);
    const statusText = created.status === "published" ? "已公开" : "已进入审核队列";
    const link = created.status === "published" ? `\n链接：https://nomtf.com/#/post/${encodeURIComponent(created.slug)}` : "";
    await sendTelegramMessage(env, chatId, `投稿成功，${statusText}。${link}`, startKeyboard());
    await sendTelegramMessage(env, chatId, created.status === "published"
      ? "通知：你的投稿已经发布到网站。"
      : "通知：你的投稿已经提交给管理员审核，审核通过后会在网站显示。");
  } catch (error) {
    await sendTelegramMessage(env, chatId, `投稿失败：${error instanceof Error ? error.message : "字段不完整"}`, cancelKeyboard());
  }
}

function telegramDraftToSubmissionInput(draft: TelegramDraft): SubmissionInput {
  const category = draft.category === "talk" ? "talk" : "rating";
  const bodyImageKeys = cleanR2Keys(draft.bodyImageKeys ?? []);
  const content = cleanText(appendImageKeysToContent(draft.content ?? "", bodyImageKeys), MAX_POST_BYTES);
  const title = cleanText(draft.title, 120);
  const submitterName = cleanName(draft.submitterName).slice(0, 40) || "匿名投稿者";
  if (title.length < 2) throw new Error("标题太短");
  if (content.length < 10) throw new Error("正文至少 10 个字符");

  const isRating = category === "rating";
  const finalRating = isRating ? cleanFinalRating(draft.finalRating) : "";
  const ratingReason = isRating ? cleanText(draft.ratingReason, MAX_RATING_REASON_LENGTH) : "";
  const twitterRef = isRating ? cleanText(draft.twitterRef, MAX_TWITTER_REF_LENGTH) : "";
  const hazardLevel = isRating ? Number(draft.hazardLevel) : 1;
  if (isRating && !isValidFinalRating(finalRating)) throw new Error("最终等级格式不正确");
  if (isRating && (!ratingReason || !twitterRef)) throw new Error("评级原因和推特链接/用户名都必填");
  if (isRating && (!Number.isInteger(hazardLevel) || hazardLevel < 1 || hazardLevel > 5)) throw new Error("危害等级需要是 1-5");

  return {
    title,
    summary: cleanText(draft.summary, 240),
    content,
    category,
    finalRating,
    ratingReason,
    twitterRef,
    hazardLevel,
    nsfw: Boolean(draft.nsfw),
    requestedSlug: "",
    coverKey: optionalR2Key(draft.coverKey),
    submitterName,
    tags: cleanTags(draft.tags ?? "")
  };
}

async function startTelegramSubmission(env: Env, chatId: string): Promise<void> {
  await saveTelegramSession(env.DB, chatId, "category", {});
  await sendTelegramMessage(env, chatId, "开始投稿。先选择分类：", {
    inline_keyboard: [
      [{ text: "评级投稿", callback_data: "tg:cat:rating" }],
      [{ text: "杂谈投稿", callback_data: "tg:cat:talk" }],
      [{ text: "取消", callback_data: "tg:cancel" }]
    ]
  });
}

async function askTelegramHazardLevel(env: Env, chatId: string, draft: TelegramDraft): Promise<void> {
  await saveTelegramSession(env.DB, chatId, "hazardLevel", draft);
  await sendTelegramMessage(env, chatId, "请选择危害等级（1-5）：", {
    inline_keyboard: [
      [
        { text: "1", callback_data: "tg:hazard:1" },
        { text: "2", callback_data: "tg:hazard:2" },
        { text: "3", callback_data: "tg:hazard:3" },
        { text: "4", callback_data: "tg:hazard:4" },
        { text: "5", callback_data: "tg:hazard:5" }
      ],
      [{ text: "取消", callback_data: "tg:cancel" }]
    ]
  });
}

async function askTelegramNsfw(env: Env, chatId: string): Promise<void> {
  await sendTelegramMessage(env, chatId, "是否标记 NSFW / 激烈表达提示？", {
    inline_keyboard: [
      [
        { text: "是", callback_data: "tg:nsfw:1" },
        { text: "否", callback_data: "tg:nsfw:0" }
      ],
      [{ text: "取消", callback_data: "tg:cancel" }]
    ]
  });
}

async function addTelegramBodyPhoto(env: Env, draft: TelegramDraft, photos: TelegramPhotoSize[], chatId: string): Promise<boolean> {
  const keys = draft.bodyImageKeys ?? [];
  if (keys.length >= MAX_TELEGRAM_BODY_IMAGES) return false;
  const uploaded = await uploadTelegramPhoto(env, photos, chatId);
  draft.bodyImageKeys = keys.concat(uploaded.key);
  return true;
}

async function uploadTelegramPhoto(env: Env, photos: TelegramPhotoSize[], chatId: string) {
  const photo = photos.slice().sort((a, b) => Number(b.file_size ?? 0) - Number(a.file_size ?? 0))[0];
  if (!photo?.file_id) throw new Error("没有收到可用图片");
  if (Number(photo.file_size ?? 0) > MAX_IMAGE_BYTES) throw new Error("图片不能超过 15MB");
  const file = await telegramApi<{ file_path?: string; file_size?: number }>(env, "getFile", { file_id: photo.file_id });
  if (Number(file.file_size ?? photo.file_size ?? 0) > MAX_IMAGE_BYTES) throw new Error("图片不能超过 15MB");
  if (!file.file_path) throw new Error("Telegram 图片路径为空");
  const token = getTelegramBotToken(env);
  const response = await fetch(`${TELEGRAM_API_BASE}/file/bot${token}/${file.file_path}`);
  if (!response.ok) throw new Error("下载 Telegram 图片失败");
  const bytes = await response.arrayBuffer();
  return storeImageBytes(env, bytes, file.file_path, response.headers.get("Content-Type") ?? "", `telegram:${chatId}`);
}

async function getTelegramSession(db: D1Database, chatId: string): Promise<TelegramSession | null> {
  const row = await db.prepare("SELECT chat_id, step, draft_json FROM telegram_sessions WHERE chat_id = ?")
    .bind(chatId)
    .first<{ chat_id: string; step: string; draft_json: string }>();
  if (!row) return null;
  try {
    return {
      chatId: row.chat_id,
      step: cleanTelegramStep(row.step),
      draft: JSON.parse(row.draft_json || "{}") as TelegramDraft
    };
  } catch {
    return { chatId: row.chat_id, step: "category", draft: {} };
  }
}

async function saveTelegramSession(db: D1Database, chatId: string, step: TelegramStep, draft: TelegramDraft): Promise<void> {
  const now = nowIso();
  await db.prepare(`
    INSERT INTO telegram_sessions (chat_id, step, draft_json, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(chat_id)
    DO UPDATE SET step = excluded.step, draft_json = excluded.draft_json, updated_at = excluded.updated_at
  `).bind(chatId, step, JSON.stringify(draft), now, now).run();
}

async function deleteTelegramSession(db: D1Database, chatId: string): Promise<void> {
  await db.prepare("DELETE FROM telegram_sessions WHERE chat_id = ?").bind(chatId).run();
}

function cleanTelegramStep(value: unknown): TelegramStep {
  const step = String(value ?? "");
  return ["category", "submitterName", "title", "finalRating", "hazardLevel", "ratingReason", "twitterRef", "tags", "summary", "nsfw", "cover", "bodyImages", "content", "confirm"].includes(step)
    ? step as TelegramStep
    : "category";
}

function telegramDraftPreview(draft: TelegramDraft): string {
  const category = draft.category === "talk" ? "talk" : "rating";
  const lines = [
    "请确认投稿：",
    `分类：${categoryTextForTelegram(category)}`,
    `署名：${draft.submitterName || "匿名投稿者"}`,
    `标题：${draft.title ?? ""}`,
    `标签：${draft.tags || "无"}`,
    `摘要：${draft.summary || "无"}`,
    `NSFW：${draft.nsfw ? "是" : "否"}`,
    `封面：${draft.coverKey ? "已上传" : "无"}`,
    `正文图片：${(draft.bodyImageKeys ?? []).length} 张`
  ];
  if (category === "rating") {
    lines.splice(3, 0, `最终等级：${draft.finalRating ?? ""}`, `危害等级：${draft.hazardLevel ?? ""}`, `评级原因：${draft.ratingReason ?? ""}`, `推特：${draft.twitterRef ?? ""}`);
  }
  lines.push("", "确认后会提交到网站。评级投稿进入审核；杂谈会直接公开。");
  return lines.join("\n");
}

function startKeyboard() {
  return {
    inline_keyboard: [
      [{ text: "开始投稿", callback_data: "tg:new" }],
      [{ text: "打开网站", url: "https://nomtf.com/" }]
    ]
  };
}

function cancelKeyboard() {
  return { inline_keyboard: [[{ text: "取消", callback_data: "tg:cancel" }]] };
}

function skipKeyboard(kind: "tags" | "summary" | "cover") {
  return { inline_keyboard: [[{ text: "跳过", callback_data: `tg:skip:${kind}` }], [{ text: "取消", callback_data: "tg:cancel" }]] };
}

function bodyImagesKeyboard(draft: TelegramDraft) {
  const count = (draft.bodyImageKeys ?? []).length;
  return {
    inline_keyboard: [
      [{ text: count ? `图片完成（已收 ${count} 张）` : "跳过正文图片", callback_data: count ? "tg:done:bodyImages" : "tg:skip:bodyImages" }],
      [{ text: "取消", callback_data: "tg:cancel" }]
    ]
  };
}

function confirmKeyboard() {
  return {
    inline_keyboard: [
      [{ text: "确认提交", callback_data: "tg:confirm" }],
      [{ text: "取消", callback_data: "tg:cancel" }]
    ]
  };
}

async function sendTelegramMessage(env: Env, chatId: string, text: string, replyMarkup?: unknown): Promise<void> {
  await telegramApi(env, "sendMessage", {
    chat_id: chatId,
    text: text.slice(0, 3900),
    reply_markup: replyMarkup
  });
}

async function answerTelegramCallback(env: Env, callbackQueryId: string): Promise<void> {
  await telegramApi(env, "answerCallbackQuery", { callback_query_id: callbackQueryId });
}

async function telegramApi<T = unknown>(env: Env, method: string, payload: Record<string, unknown>): Promise<T> {
  const token = getTelegramBotToken(env);
  if (!token) throw new Error("TELEGRAM_BOT_TOKEN 未配置");
  const response = await fetch(`${TELEGRAM_API_BASE}/bot${token}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  const data = await response.json().catch(() => ({})) as { ok?: boolean; result?: T; description?: string };
  if (!response.ok || data.ok !== true) {
    console.error(JSON.stringify({
      level: "error",
      message: "telegram api failed",
      method,
      status: response.status,
      description: data.description ?? ""
    }));
    throw new Error(data.description || `Telegram API ${method} 调用失败`);
  }
  return data.result as T;
}

function telegramChatId(message: TelegramMessage | undefined): string {
  return message?.chat?.id === undefined ? "" : String(message.chat.id);
}

function cleanTelegramText(value: string): string {
  return String(value ?? "").trim();
}

function isSkipText(value: string): boolean {
  const text = value.trim().toLowerCase();
  return text === "/skip" || text === "跳过" || text === "skip" || text === "/done" || text === "完成";
}

function categoryTextForTelegram(category: Exclude<PostCategory, "about">): string {
  return category === "talk" ? "杂谈投稿" : "评级投稿";
}

function renderMarkdownBackup(rows: Record<string, unknown>[]): string {
  const lines = [
    "# NoMTF 文章干备份",
    "",
    `导出时间：${nowIso()}`,
    "",
    "> 不包含图片二进制；封面和正文图片均以文件名占位。",
    ""
  ];
  for (const row of rows) {
    const tags = String(row.tags ?? "").split("|").filter(Boolean);
    const isRating = String(row.category ?? "rating") === "rating";
    lines.push("---", "");
    lines.push(`# ${markdownLine(row.title)}`);
    lines.push("");
    lines.push(`- ID: ${markdownLine(row.id)}`);
    lines.push(`- Slug: ${markdownLine(row.slug)}`);
    lines.push(`- 分类: ${markdownLine(row.category ?? "rating")}`);
    lines.push(`- 状态: ${markdownLine(row.status)}`);
    lines.push(`- 作者: ${markdownLine(row.author_name ?? "匿名")}`);
    if (isRating) lines.push(`- 危害等级: ${markdownLine(row.hazard_level)}`);
    if (isRating && row.final_rating) lines.push(`- 最终等级: ${markdownLine(row.final_rating)}`);
    lines.push(`- NSFW: ${Number(row.nsfw ?? 0) ? "yes" : "no"}`);
    lines.push(`- 浏览量: ${markdownLine(row.view_count ?? 0)}`);
    if (row.pinned_at) lines.push(`- 置顶时间: ${markdownLine(row.pinned_at)}`);
    lines.push(`- 创建时间: ${markdownLine(row.created_at)}`);
    lines.push(`- 更新时间: ${markdownLine(row.updated_at)}`);
    if (tags.length) lines.push(`- 标签: ${tags.map((tag) => `#${markdownLine(tag)}`).join(" ")}`);
    if (row.cover_key) lines.push(`- 封面: [图片: ${markdownLine(fileNameFromKey(String(row.cover_key)))}]`);
    lines.push("");
    if (row.summary) {
      lines.push(`> ${markdownLine(row.summary)}`, "");
    }
    if (isRating && row.final_rating) {
      lines.push(`**最终等级：${markdownLine(row.final_rating)}**`, "");
    }
    if (isRating && row.rating_reason) {
      lines.push(`**评级原因：${markdownLine(row.rating_reason)}**`, "");
    }
    lines.push(stripImagesToFileNames(String(row.content ?? "")), "");
    if (isRating && row.twitter_ref) {
      lines.push(`<span style="color:#777">推特：${markdownLine(row.twitter_ref)}</span>`, "");
    }
  }
  return `${lines.join("\n").trim()}\n`;
}

function stripImagesToFileNames(content: string): string {
  return content.replace(/!\[([^\]]*)\]\(\/media\/([^)]+)\)/g, (_match, alt: string, key: string) => {
    const label = alt ? `${alt} / ${fileNameFromKey(key)}` : fileNameFromKey(key);
    return `[图片: ${label}]`;
  });
}

function fileNameFromKey(key: string): string {
  return key.split("/").filter(Boolean).pop() || key;
}

function markdownLine(value: unknown): string {
  return String(value ?? "").replace(/\r?\n/g, " ").trim();
}

function postPublicUrl(slug: string): string {
  return `${SITE_ORIGIN}/post/${encodeURIComponent(slug)}`;
}

function renderStaticHomeHtml(rows: Record<string, unknown>[]): string {
  const items = rows.map((row) => {
    const title = htmlEscape(row.title);
    const url = postPublicUrl(String(row.slug));
    const summary = seoDescription(row.summary || row.content);
    return `<article>
      <h2><a href="${htmlAttr(url)}">${title}</a></h2>
      <p>${htmlEscape(summary)}</p>
      <p><strong>作者：</strong>${htmlEscape(row.author_name ?? "匿名")} <strong>分类：</strong>${htmlEscape(row.category ?? "rating")}</p>
    </article>`;
  }).join("");
  return `<section class="page-section detail-article">
    <h1>NoMTF 不药娘网 - nomtf.com</h1>
    <p>NoMTF 不药娘网（nomtf.com）是一个独立的娱乐评级网站，中文名为不药娘网，内容切勿当真。</p>
    <p>关键词：NoMTF、nomtf、nomtf.com、不药娘网、不药娘、独立评级网站、娱乐评级。</p>
    <p>本站内容仅供娱乐和讨论，不应被当作事实判断或现实行动依据。</p>
    <nav><a href="${SITE_ORIGIN}/sitemap.xml">Sitemap</a></nav>
    <section>
      <h2>最新内容</h2>
      ${items || "<p>暂无已发布内容。</p>"}
    </section>
  </section>`;
}

function buildWebsiteJsonLd() {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: "NoMTF 不药娘网",
    alternateName: ["NoMTF", "nomtf", "不药娘网", "不药娘"],
    url: SITE_ORIGIN,
    description: SITE_DESCRIPTION,
    potentialAction: {
      "@type": "SearchAction",
      target: `${SITE_ORIGIN}/?q={search_term_string}`,
      "query-input": "required name=search_term_string"
    }
  };
}

function renderStaticPostHtml(row: Record<string, unknown>): string {
  const title = htmlEscape(row.title);
  const author = htmlEscape(row.author_name ?? "匿名");
  const category = htmlEscape(row.category ?? "rating");
  const coverKey = String(row.cover_key ?? "");
  const cover = coverKey ? `<figure class="detail-cover"><img src="/media/${htmlAttr(coverKey)}" alt="${title}"></figure>` : "";
  const rating = String(row.category ?? "rating") === "rating"
    ? `<p><strong>危害等级：</strong>${htmlEscape(row.hazard_level ?? "")}</p>` +
      (row.final_rating ? `<p><strong>最终等级：</strong>${htmlEscape(row.final_rating)}</p>` : "") +
      (row.rating_reason ? `<p><strong>评级原因：</strong>${htmlEscape(row.rating_reason)}</p>` : "")
    : "";
  const twitter = row.twitter_ref ? `<p><strong>推特：</strong>${htmlEscape(row.twitter_ref)}</p>` : "";
  return `<article class="page-section detail-article">
    ${cover}
    <h1>${title}</h1>
    <p><strong>作者：</strong>${author} <strong>分类：</strong>${category}</p>
    ${row.summary ? `<p>${htmlEscape(row.summary)}</p>` : ""}
    ${rating}
    <div class="content">${staticParagraphs(row.content)}</div>
    ${twitter}
  </article>`;
}

function buildPostJsonLd(row: Record<string, unknown>, canonical: string, image?: string) {
  return {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: String(row.title ?? ""),
    description: seoDescription(row.summary || row.content),
    author: {
      "@type": "Person",
      name: String(row.author_name ?? "匿名")
    },
    publisher: {
      "@type": "Organization",
      name: "NoMTF 不药娘网",
      url: SITE_ORIGIN
    },
    mainEntityOfPage: canonical,
    url: canonical,
    image: image ? [image] : [`${SITE_ORIGIN}/media/site/search-icon-512.png?v=${ASSET_VERSION}`],
    datePublished: String(row.created_at ?? ""),
    dateModified: String(row.updated_at ?? row.created_at ?? "")
  };
}

function staticParagraphs(value: unknown): string {
  return String(value ?? "")
    .replace(/!\[[^\]]*]\((\/media\/[^)]+)\)/g, (_match, url) => `<figure><img src="${htmlAttr(url)}" alt="正文图片"></figure>`)
    .split(/\n{2,}/)
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => part.startsWith("<figure>") ? part : `<p>${htmlEscape(part).replace(/\n/g, "<br>")}</p>`)
    .join("");
}

function seoDescription(value: unknown): string {
  const text = String(value ?? "")
    .replace(/!\[[^\]]*]\([^)]+\)/g, " ")
    .replace(/[*_`>#\[\]()]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return cleanText(text || SITE_DESCRIPTION, 150);
}

function htmlEscape(value: unknown): string {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char] || char);
}

function htmlAttr(value: unknown): string {
  return htmlEscape(value);
}

function xmlEscape(value: unknown): string {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[char] || char);
}

function normalizePostRow(row: Record<string, unknown>) {
  const coverKey = typeof row.cover_key === "string" && row.cover_key ? row.cover_key : "";
  return {
    id: String(row.id),
    title: String(row.title),
    slug: String(row.slug),
    summary: String(row.summary ?? ""),
    content: String(row.content ?? ""),
    finalRating: String(row.final_rating ?? ""),
    ratingReason: String(row.rating_reason ?? ""),
    twitterRef: String(row.twitter_ref ?? ""),
    category: String(row.category ?? "rating"),
    pinnedAt: String(row.pinned_at ?? ""),
    hazardLevel: Number(row.hazard_level),
    nsfw: Boolean(Number(row.nsfw ?? 0)),
    coverKey,
    coverUrl: coverKey ? `/media/${coverKey}` : "",
    status: String(row.status ?? "published"),
    viewCount: Number(row.view_count ?? 0),
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

function getSubmissionApiKey(env: Env): string {
  return String((env as Env & { SUBMISSION_API_KEY?: string }).SUBMISSION_API_KEY ?? "");
}

function getTelegramBotToken(env: Env): string {
  return String((env as Env & { TELEGRAM_BOT_TOKEN?: string }).TELEGRAM_BOT_TOKEN ?? "");
}

function getTelegramWebhookSecret(env: Env): string {
  return String((env as Env & { TELEGRAM_WEBHOOK_SECRET?: string }).TELEGRAM_WEBHOOK_SECRET ?? "");
}

function isHttps(c: AppContext): boolean {
  return new URL(c.req.url).protocol === "https:";
}

function shouldRedirectToHttps(c: AppContext): boolean {
  const url = new URL(c.req.url);
  if (url.protocol === "https:") return false;
  const host = url.hostname.toLowerCase();
  if (host === "localhost" || host === "127.0.0.1" || host === "::1" || host.endsWith(".localhost")) return false;
  return url.protocol === "http:";
}

function isSafeMethod(method: string): boolean {
  return method === "GET" || method === "HEAD" || method === "OPTIONS";
}

function isSameOrigin(c: AppContext): boolean {
  const origin = c.req.header("Origin");
  if (!origin) return true;
  return origin === new URL(c.req.url).origin;
}

function isExternalWebhookRequest(c: AppContext): boolean {
  return new URL(c.req.url).pathname === "/api/telegram/webhook";
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

function cleanCoordinate(value: unknown, min: number, max: number): string {
  const number = Number(value);
  if (!Number.isFinite(number) || number < min || number > max) return "";
  return number.toFixed(6);
}

function cleanOptionalNumber(value: unknown, min: number, max: number): string {
  if (value === null || value === undefined || value === "") return "";
  const number = Number(value);
  if (!Number.isFinite(number) || number < min || number > max) return "";
  return String(Math.round(number * 100) / 100);
}

function cleanNonNegativeNumber(value: unknown, max: number): string {
  return cleanOptionalNumber(value, 0, max);
}

function cleanBrowserLocationTimestamp(value: unknown): string {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) return nowIso();
  const date = new Date(number);
  if (Number.isNaN(date.getTime())) return nowIso();
  const now = Date.now();
  if (date.getTime() > now + 5 * 60 * 1000) return nowIso();
  return date.toISOString();
}

function cleanFinalRating(value: unknown): string {
  return String(value ?? "").normalize("NFKC").trim().replace(/\s+/g, "").slice(0, MAX_FINAL_RATING_LENGTH);
}

function isValidFinalRating(value: string): boolean {
  return /^[1-5][+-]?$/.test(value);
}

function normalizeSearchQuery(value: unknown): string {
  return cleanText(value, MAX_SEARCH_QUERY_LENGTH).replace(/\s+/g, " ");
}

function searchQueryKey(value: string): string {
  return value.trim().toLowerCase();
}

function buildPostSearchPlan(query: string): { whereSql: string; whereParams: Array<string | number>; scoreSql: string; scoreParams: Array<string | number> } | null {
  const normalized = normalizeSearchQuery(query);
  if (!normalized) return null;
  const terms = searchTerms(normalized);
  if (!terms.length) return null;
  const whereParts: string[] = [];
  const whereParams: Array<string | number> = [];
  for (const term of terms) {
    const like = searchLike(term);
    const slugLike = searchLike(slugify(term) || term);
    whereParts.push(`(
      p.title LIKE ? ESCAPE '\\'
      OR p.slug LIKE ? ESCAPE '\\'
      OR p.summary LIKE ? ESCAPE '\\'
      OR p.content LIKE ? ESCAPE '\\'
      OR p.final_rating LIKE ? ESCAPE '\\'
      OR p.rating_reason LIKE ? ESCAPE '\\'
      OR p.twitter_ref LIKE ? ESCAPE '\\'
      OR p.submitter_name LIKE ? ESCAPE '\\'
      OR u.username LIKE ? ESCAPE '\\'
      OR EXISTS (
        SELECT 1 FROM post_tags search_pt
        JOIN tags search_t ON search_t.id = search_pt.tag_id
        WHERE search_pt.post_id = p.id
          AND (search_t.name LIKE ? ESCAPE '\\' OR search_t.slug LIKE ? ESCAPE '\\')
      )
    )`);
    whereParams.push(like, slugLike, like, like, like, like, like, like, like, like, slugLike);
  }

  const scoreParts: string[] = [];
  const scoreParams: Array<string | number> = [];
  const exactLike = searchLike(normalized);
  const prefixLike = `${escapeLike(normalized)}%`;
  const exactSlug = slugify(normalized);
  const exactSlugLike = searchLike(exactSlug || normalized);
  scoreParts.push("CASE WHEN p.title = ? COLLATE NOCASE THEN 1200 ELSE 0 END");
  scoreParams.push(normalized);
  scoreParts.push("CASE WHEN p.title LIKE ? ESCAPE '\\' THEN 900 ELSE 0 END");
  scoreParams.push(prefixLike);
  scoreParts.push("CASE WHEN p.title LIKE ? ESCAPE '\\' THEN 720 ELSE 0 END");
  scoreParams.push(exactLike);
  scoreParts.push("CASE WHEN p.slug LIKE ? ESCAPE '\\' THEN 650 ELSE 0 END");
  scoreParams.push(exactSlugLike);
  scoreParts.push(`CASE WHEN EXISTS (
    SELECT 1 FROM post_tags score_exact_pt
    JOIN tags score_exact_t ON score_exact_t.id = score_exact_pt.tag_id
    WHERE score_exact_pt.post_id = p.id
      AND (score_exact_t.name = ? COLLATE NOCASE OR score_exact_t.slug = ?)
  ) THEN 620 ELSE 0 END`);
  scoreParams.push(normalized, exactSlug);
  scoreParts.push("CASE WHEN p.submitter_name LIKE ? ESCAPE '\\' OR u.username LIKE ? ESCAPE '\\' THEN 360 ELSE 0 END");
  scoreParams.push(exactLike, exactLike);
  scoreParts.push("CASE WHEN p.twitter_ref LIKE ? ESCAPE '\\' THEN 320 ELSE 0 END");
  scoreParams.push(exactLike);
  scoreParts.push("CASE WHEN p.summary LIKE ? ESCAPE '\\' THEN 260 ELSE 0 END");
  scoreParams.push(exactLike);
  scoreParts.push("CASE WHEN p.rating_reason LIKE ? ESCAPE '\\' THEN 220 ELSE 0 END");
  scoreParams.push(exactLike);
  scoreParts.push("CASE WHEN p.content LIKE ? ESCAPE '\\' THEN 120 ELSE 0 END");
  scoreParams.push(exactLike);
  scoreParts.push("CASE WHEN p.final_rating = ? COLLATE NOCASE THEN 180 ELSE 0 END");
  scoreParams.push(normalized);

  for (const term of terms) {
    const like = searchLike(term);
    const slugLike = searchLike(slugify(term) || term);
    scoreParts.push("CASE WHEN p.title LIKE ? ESCAPE '\\' THEN 120 ELSE 0 END");
    scoreParams.push(like);
    scoreParts.push(`CASE WHEN EXISTS (
      SELECT 1 FROM post_tags score_term_pt
      JOIN tags score_term_t ON score_term_t.id = score_term_pt.tag_id
      WHERE score_term_pt.post_id = p.id
        AND (score_term_t.name LIKE ? ESCAPE '\\' OR score_term_t.slug LIKE ? ESCAPE '\\')
    ) THEN 110 ELSE 0 END`);
    scoreParams.push(like, slugLike);
    scoreParts.push("CASE WHEN p.submitter_name LIKE ? ESCAPE '\\' OR u.username LIKE ? ESCAPE '\\' THEN 70 ELSE 0 END");
    scoreParams.push(like, like);
    scoreParts.push("CASE WHEN p.twitter_ref LIKE ? ESCAPE '\\' THEN 65 ELSE 0 END");
    scoreParams.push(like);
    scoreParts.push("CASE WHEN p.summary LIKE ? ESCAPE '\\' THEN 55 ELSE 0 END");
    scoreParams.push(like);
    scoreParts.push("CASE WHEN p.rating_reason LIKE ? ESCAPE '\\' THEN 50 ELSE 0 END");
    scoreParams.push(like);
    scoreParts.push("CASE WHEN p.content LIKE ? ESCAPE '\\' THEN 18 ELSE 0 END");
    scoreParams.push(like);
  }

  scoreParts.push("MIN(COALESCE(p.view_count, 0), 500) * 0.08");
  scoreParts.push("COALESCE((SELECT COUNT(*) FROM post_likes score_like WHERE score_like.post_id = p.id), 0) * 3");
  scoreParts.push("COALESCE((SELECT COUNT(*) FROM comments score_comment WHERE score_comment.post_id = p.id AND score_comment.status = 'published'), 0) * 2");
  return {
    whereSql: `(${whereParts.join(" AND ")})`,
    whereParams,
    scoreSql: `(${scoreParts.join(" + ")})`,
    scoreParams
  };
}

function searchTerms(query: string): string[] {
  const normalized = normalizeSearchQuery(query).normalize("NFKC");
  const parts = normalized
    .split(/[\s,，、。.!?！？;；:：#@/\\|()[\]{}"'“”‘’<>《》+=~`]+/u)
    .map((part) => part.trim())
    .filter(Boolean);
  const source = parts.length ? parts : [normalized];
  const seen = new Set<string>();
  const terms: string[] = [];
  for (const item of source) {
    const key = item.toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    terms.push(item.slice(0, MAX_SEARCH_QUERY_LENGTH));
    if (terms.length >= MAX_SEARCH_TERMS) break;
  }
  return terms;
}

function searchLike(value: string): string {
  return `%${escapeLike(value)}%`;
}

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (char) => `\\${char}`);
}

function cleanPostCategory(value: unknown, fallback: PostCategory): PostCategory {
  const category = String(value ?? "").trim();
  return ["rating", "about", "talk"].includes(category)
    ? category as PostCategory
    : fallback;
}

function postStatusForCreate(user: User, category: PostCategory, rawStatus: unknown): PostStatus {
  if (user.role === "admin") return cleanPostStatus(rawStatus, "published") === "draft" ? "draft" : "published";
  if (category === "talk") return "published";
  return "pending";
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
