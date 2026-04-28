const ASSET_VERSION = "20260428-global-editor";

export function renderPage(): string {
  return `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>NoMTF 不药娘网</title>
    <meta name="description" content="NoMTF 是一个娱乐向评级社区，用 1-5 级给物品和现象做荒诞评级。">
    <link rel="stylesheet" href="/assets/app.css?v=${ASSET_VERSION}">
    <script src="/assets/app.js?v=${ASSET_VERSION}" defer></script>
  </head>
  <body>
    <div id="modal-root"></div>
    <div id="toast" aria-live="polite"></div>
    <div class="shell">
      <header id="site-header" class="site-header"></header>
      <main id="app" class="app-main" tabindex="-1"></main>
    </div>
  </body>
</html>`;
}

export function renderBlockedPage(): string {
  return `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>访问受限 - NoMTF</title>
    <style>
      body{margin:0;min-height:100vh;display:grid;place-items:center;background:#f8fbff;color:#202332;font-family:Arial,"Microsoft YaHei",sans-serif}
      main{width:min(560px,calc(100vw - 32px));border:1px solid #d8e6f7;background:#fff;padding:28px;border-radius:8px;box-shadow:0 20px 60px rgba(76,108,150,.16)}
      h1{font-size:24px;margin:0 0 12px}
      p{line-height:1.75;margin:0;color:#586173}
    </style>
  </head>
  <body>
    <main>
      <h1>访问已被限制</h1>
      <p>管理员已限制当前访客或网络标识访问本站。如果你认为这是误判，请联系站点管理员处理。</p>
    </main>
  </body>
</html>`;
}

export const styles = String.raw`
:root {
  color-scheme: light;
  --pink: #ff8fc7;
  --pink-strong: #ed5fa8;
  --blue: #75c7ff;
  --blue-strong: #328ed0;
  --ink: #202332;
  --muted: #687185;
  --line: #d8e6f7;
  --soft-line: #edf3fb;
  --bg: #f8fbff;
  --surface: #ffffff;
  --surface-blue: #eff8ff;
  --surface-pink: #fff1f8;
  --good: #2f9b73;
  --warn: #c28b00;
  --bad: #d94f65;
  --shadow: 0 18px 50px rgba(53, 83, 128, .14);
  --radius: 8px;
}

* { box-sizing: border-box; }

html { min-width: 320px; background: var(--bg); }

body {
  margin: 0;
  color: var(--ink);
  font-family: Inter, "Segoe UI", Arial, "Microsoft YaHei", sans-serif;
  line-height: 1.5;
  letter-spacing: 0;
}

button, input, textarea, select {
  font: inherit;
  letter-spacing: 0;
}

button {
  cursor: pointer;
}

a { color: inherit; }

.shell {
  min-height: 100vh;
  background:
    linear-gradient(180deg, rgba(117, 199, 255, .24), rgba(255, 143, 199, .14) 32%, transparent 62%),
    var(--bg);
}

.site-header {
  position: sticky;
  top: 0;
  z-index: 20;
  border-bottom: 1px solid rgba(216, 230, 247, .9);
  background: rgba(248, 251, 255, .92);
  backdrop-filter: blur(18px);
}

.header-inner {
  width: min(1180px, calc(100vw - 32px));
  margin: 0 auto;
  min-height: 68px;
  display: grid;
  grid-template-columns: auto minmax(220px, 1fr) auto;
  align-items: center;
  gap: 18px;
}

.brand {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
  text-decoration: none;
}

.brand-mark {
  width: 40px;
  height: 40px;
  border: 1px solid #c7ddf4;
  border-radius: 8px;
  display: grid;
  place-items: center;
  background: linear-gradient(135deg, #ffffff 0 38%, #ffd6ea 38% 68%, #bde8ff 68%);
  color: var(--ink);
  font-weight: 900;
  box-shadow: 0 10px 24px rgba(50, 142, 208, .14);
}

.brand-text {
  display: grid;
  gap: 0;
}

.brand-name {
  font-size: 19px;
  line-height: 1.05;
  font-weight: 900;
}

.brand-cn {
  font-size: 12px;
  color: var(--muted);
}

.searchbar {
  display: flex;
  align-items: center;
  border: 1px solid var(--line);
  background: var(--surface);
  border-radius: 8px;
  min-width: 0;
  max-width: 100%;
  height: 42px;
  overflow: hidden;
}

.searchbar input {
  min-width: 0;
  flex: 1;
  border: 0;
  outline: 0;
  padding: 0 12px;
  background: transparent;
  color: var(--ink);
  font-size: 14px;
}

.icon-button,
.primary-button,
.ghost-button,
.danger-button,
.plain-button {
  min-height: 38px;
  border-radius: 8px;
  border: 1px solid transparent;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 0 13px;
  font-size: 14px;
  font-weight: 750;
  text-decoration: none;
  white-space: nowrap;
}

.icon-button {
  width: 42px;
  padding: 0;
  border-left: 1px solid var(--soft-line);
  background: transparent;
  color: var(--blue-strong);
}

.primary-button {
  color: #122235;
  background: linear-gradient(135deg, #ffd4e9, #bceaff);
  border-color: #cbe5f7;
  box-shadow: 0 10px 24px rgba(237, 95, 168, .14);
}

.ghost-button {
  color: var(--ink);
  background: var(--surface);
  border-color: var(--line);
}

.danger-button {
  color: #ffffff;
  background: #d94f65;
  border-color: #d94f65;
}

.plain-button {
  border-color: transparent;
  background: transparent;
  color: var(--muted);
}

.nav-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  min-width: 0;
}

.app-main {
  width: min(1180px, calc(100vw - 32px));
  margin: 0 auto;
  padding: 30px 0 56px;
}

.hero {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 360px;
  gap: 24px;
  align-items: stretch;
  margin-bottom: 24px;
}

.hero-copy {
  border: 1px solid var(--line);
  background: rgba(255, 255, 255, .82);
  border-radius: 8px;
  padding: clamp(22px, 4vw, 42px);
  box-shadow: var(--shadow);
}

.hero h1 {
  margin: 0;
  font-size: clamp(34px, 6vw, 68px);
  line-height: .95;
  letter-spacing: 0;
}

.hero h1 span {
  color: var(--pink-strong);
}

.hero-lede {
  margin: 18px 0 0;
  max-width: 680px;
  color: #475065;
  font-size: clamp(16px, 2vw, 19px);
}

.hero-actions {
  margin-top: 24px;
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
}

.rating-board {
  border: 1px solid var(--line);
  border-radius: 8px;
  background: var(--surface);
  box-shadow: var(--shadow);
  padding: 18px;
}

.rating-board h2,
.section-title {
  margin: 0 0 14px;
  font-size: 17px;
  line-height: 1.2;
}

.scale-list {
  display: grid;
  gap: 9px;
}

.scale-row {
  min-height: 52px;
  border: 1px solid var(--soft-line);
  border-radius: 8px;
  display: grid;
  grid-template-columns: 42px 1fr;
  align-items: center;
  gap: 12px;
  padding: 8px 10px;
  background: #fff;
}

.level-badge {
  width: 34px;
  height: 34px;
  border-radius: 8px;
  display: grid;
  place-items: center;
  font-weight: 900;
  color: #fff;
}

.level-1 { background: #38a77a; }
.level-2 { background: #2b9ab3; }
.level-3 { background: #d2a30b; }
.level-4 { background: #df7a38; }
.level-5 { background: #d94f65; }

.scale-row strong {
  display: block;
  font-size: 14px;
}

.scale-row span {
  display: block;
  color: var(--muted);
  font-size: 12px;
}

.layout {
  display: grid;
  grid-template-columns: 250px minmax(0, 1fr);
  gap: 22px;
}

.panel {
  border: 1px solid var(--line);
  border-radius: 8px;
  background: rgba(255, 255, 255, .88);
  box-shadow: 0 10px 28px rgba(53, 83, 128, .08);
}

.filters {
  position: sticky;
  top: 88px;
  padding: 16px;
  align-self: start;
}

.filter-group {
  display: grid;
  gap: 8px;
  margin-bottom: 18px;
}

.filter-group label,
.field label {
  color: #4d5669;
  font-size: 13px;
  font-weight: 800;
}

.segmented {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: 6px;
}

.segment {
  height: 34px;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: #fff;
  color: var(--ink);
  font-size: 13px;
  font-weight: 850;
}

.segment.active {
  background: #e9f7ff;
  border-color: #99d8ff;
  color: var(--blue-strong);
}

.feed {
  display: grid;
  gap: 14px;
}

.post-card {
  border: 1px solid var(--line);
  border-radius: 8px;
  background: var(--surface);
  overflow: hidden;
  display: grid;
  grid-template-columns: 220px minmax(0, 1fr);
  min-height: 176px;
  box-shadow: 0 12px 30px rgba(53, 83, 128, .08);
}

.post-cover {
  position: relative;
  min-height: 176px;
  background: linear-gradient(135deg, #fff0f8, #e8f7ff);
  overflow: hidden;
}

.post-cover img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.cover-fallback {
  height: 100%;
  min-height: 176px;
  display: grid;
  place-items: center;
  color: #23364f;
  font-size: 54px;
  font-weight: 900;
}

.post-body {
  padding: 18px;
  min-width: 0;
}

.post-meta,
.detail-meta,
.admin-meta {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  color: var(--muted);
  font-size: 13px;
}

.post-title {
  margin: 8px 0 8px;
  font-size: clamp(20px, 2.4vw, 28px);
  line-height: 1.12;
}

.post-title button {
  padding: 0;
  border: 0;
  background: transparent;
  color: inherit;
  text-align: left;
  font: inherit;
}

.post-summary {
  margin: 0;
  color: #4c566c;
  overflow-wrap: anywhere;
}

.tag-list {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 14px;
}

.tag {
  border: 1px solid #cfe3f6;
  border-radius: 8px;
  background: #f3faff;
  color: #2c628f;
  min-height: 28px;
  display: inline-flex;
  align-items: center;
  padding: 0 9px;
  font-size: 12px;
  font-weight: 800;
}

.mini-stat {
  min-height: 28px;
  display: inline-flex;
  align-items: center;
  gap: 5px;
  color: var(--muted);
}

.empty-state {
  border: 1px dashed #bcd9f2;
  border-radius: 8px;
  background: rgba(255,255,255,.7);
  padding: 34px;
  text-align: center;
  color: var(--muted);
}

.detail {
  display: grid;
  gap: 18px;
}

.detail-cover {
  border: 1px solid var(--line);
  border-radius: 8px;
  max-height: 440px;
  overflow: hidden;
  background: linear-gradient(135deg, #fff0f8, #e8f7ff);
}

.detail-cover img {
  width: 100%;
  max-height: 440px;
  object-fit: cover;
  display: block;
}

.detail-article {
  padding: clamp(20px, 4vw, 42px);
}

.detail-article h1 {
  margin: 10px 0 14px;
  font-size: clamp(30px, 5vw, 52px);
  line-height: 1.02;
}

.content {
  margin-top: 24px;
  color: #2d3344;
  font-size: 17px;
}

.content p {
  margin: 0 0 18px;
  overflow-wrap: anywhere;
}

.content img {
  width: min(100%, 780px);
  max-height: 520px;
  object-fit: contain;
  display: block;
  margin: 18px auto;
  border-radius: 8px;
  border: 1px solid var(--line);
  background: #fff;
}

.comments {
  padding: 20px;
}

.comment-list {
  display: grid;
  gap: 12px;
}

.comment {
  border-top: 1px solid var(--soft-line);
  padding-top: 12px;
}

.comment p {
  margin: 6px 0 0;
  overflow-wrap: anywhere;
}

.form-grid {
  display: grid;
  gap: 14px;
}

.field {
  display: grid;
  gap: 7px;
}

.field input,
.field textarea,
.field select {
  width: 100%;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: #fff;
  color: var(--ink);
  padding: 10px 12px;
  min-height: 42px;
  outline: 0;
}

.field textarea {
  min-height: 170px;
  resize: vertical;
}

.two-col {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px;
}

.modal-backdrop {
  position: fixed;
  inset: 0;
  z-index: 100;
  background: rgba(25, 34, 49, .42);
  display: grid;
  place-items: center;
  padding: 18px;
}

.modal {
  width: min(720px, 100%);
  max-height: min(86vh, 760px);
  overflow: auto;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: #fff;
  box-shadow: 0 28px 90px rgba(18, 34, 53, .24);
}

.modal.large {
  width: min(940px, 100%);
}

.modal-head {
  position: sticky;
  top: 0;
  z-index: 2;
  display: flex;
  justify-content: space-between;
  gap: 12px;
  align-items: center;
  border-bottom: 1px solid var(--soft-line);
  background: rgba(255,255,255,.96);
  padding: 16px 18px;
}

.modal-head h2 {
  margin: 0;
  font-size: 20px;
}

.modal-body {
  padding: 18px;
}

.terms-copy {
  display: grid;
  gap: 12px;
  color: #3f485c;
}

.terms-copy h3 {
  margin: 8px 0 0;
  font-size: 16px;
}

.terms-copy p {
  margin: 0;
}

.admin-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 16px;
}

.visual-toolbar {
  position: sticky;
  top: 86px;
  z-index: 15;
  padding: 14px 16px;
  margin-bottom: 18px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.editor-toolbar-root {
  width: min(1180px, calc(100vw - 32px));
  margin: 16px auto 0;
  padding: 0;
}

.visual-toolbar h1 {
  margin: 0;
  font-size: 20px;
}

.visual-toolbar p {
  margin: 2px 0 0;
  color: var(--muted);
  font-size: 13px;
}

.visual-toolbar {
  user-select: none;
}

.editor-target {
  cursor: crosshair !important;
}

.editor-hover,
.editor-selected {
  outline: 2px dashed var(--pink-strong) !important;
  outline-offset: 4px !important;
  box-shadow: 0 0 0 8px rgba(255, 143, 199, .16) !important;
}

.editor-code {
  min-height: 86px;
  font-family: Consolas, "SFMono-Regular", monospace;
  font-size: 12px;
}

.searchbar.is-editor-selectable {
  cursor: crosshair;
  outline: 2px dashed var(--pink-strong);
  outline-offset: 4px;
  box-shadow: 0 0 0 8px rgba(255, 143, 199, .16);
}

.searchbar.is-editor-selectable input,
.searchbar.is-editor-selectable button {
  pointer-events: none;
}

.editor-form-preview {
  border: 1px solid var(--line);
  border-radius: 8px;
  background: var(--surface-blue);
  padding: 14px;
}

.admin-section {
  padding: 16px;
}

.table {
  display: grid;
  gap: 8px;
}

.table-row {
  display: grid;
  grid-template-columns: minmax(160px, 1fr) 130px 120px auto;
  gap: 10px;
  align-items: center;
  border-top: 1px solid var(--soft-line);
  padding-top: 10px;
}

.table-row.permissions {
  grid-template-columns: 110px minmax(150px, 1fr) 100px minmax(150px, 1fr) auto;
}

.table-row.users {
  grid-template-columns: minmax(130px, 1fr) minmax(180px, 1fr) 100px 120px auto;
}

.status-pill,
.nsfw-pill {
  border-radius: 8px;
  padding: 4px 8px;
  font-size: 12px;
  font-weight: 850;
  background: var(--surface-blue);
  color: #2c628f;
}

.nsfw-pill {
  background: var(--surface-pink);
  color: #9d3d75;
}

#toast {
  position: fixed;
  right: 18px;
  bottom: 18px;
  z-index: 120;
  display: grid;
  gap: 8px;
}

.toast-item {
  border: 1px solid var(--line);
  border-radius: 8px;
  background: #fff;
  box-shadow: var(--shadow);
  padding: 10px 12px;
  max-width: 320px;
  color: #263144;
}

.spinner {
  min-height: 160px;
  display: grid;
  place-items: center;
  color: var(--muted);
}

.hidden { display: none !important; }

svg {
  width: 18px;
  height: 18px;
  flex: 0 0 auto;
}

@media (max-width: 900px) {
  .header-inner {
    grid-template-columns: 1fr auto;
    min-height: auto;
    padding: 12px 0;
  }
  .searchbar {
    grid-column: 1 / -1;
    order: 3;
  }
  .hero,
  .layout {
    grid-template-columns: 1fr;
  }
  .filters {
    position: static;
  }
  .post-card {
    grid-template-columns: 1fr;
  }
  .post-cover,
  .cover-fallback {
    min-height: 210px;
  }
}

@media (max-width: 620px) {
  .app-main {
    width: min(100vw - 20px, 1180px);
    padding-top: 18px;
  }
  .nav-actions {
    gap: 6px;
  }
  .primary-button,
  .ghost-button,
  .plain-button,
  .danger-button {
    min-height: 36px;
    padding: 0 10px;
    font-size: 13px;
  }
  .brand-name {
    font-size: 17px;
  }
  .hero-copy {
    padding: 20px;
  }
  .hero h1 {
    font-size: 42px;
  }
  .two-col,
  .table-row,
  .table-row.permissions,
  .table-row.users {
    grid-template-columns: 1fr;
  }
}
`;

export const appScript = String.raw`
(function () {
  var state = {
    user: null,
    visitorId: "",
    permission: "allow",
    termsVersion: "2026-04-28",
    posts: [],
    filters: { q: "", level: "", tag: "" },
    post: null,
    comments: [],
    admin: null,
    ui: {
      searchPlaceholder: "搜索物品、现象、标签",
      searchWidthPx: 920,
      editorOverrides: []
    },
    editor: {
      enabled: false,
      active: false,
      selected: "",
      element: null,
      hover: null
    }
  };

  var levels = {
    1: ["1", "轻微整活", "几乎无害，适合拿来开场"],
    2: ["2", "低度扰动", "可能让人多看两眼"],
    3: ["3", "中度混乱", "开始影响场面秩序"],
    4: ["4", "高度警报", "建议谨慎围观"],
    5: ["5", "终极危害", "只适合娱乐性封存"]
  };

  document.addEventListener("DOMContentLoaded", init);
  window.addEventListener("hashchange", route);
  document.addEventListener("click", onEditorClick, true);
  document.addEventListener("click", onClick);
  document.addEventListener("submit", onSubmit);
  document.addEventListener("input", onInput);
  document.addEventListener("mouseover", onEditorHover, true);
  document.addEventListener("mouseout", onEditorHoverOut, true);

  async function init() {
    renderHeader();
    showTermsIfNeeded();
    try {
      var me = await api("/api/me");
      state.user = me.user;
      state.visitorId = me.visitorId;
      state.permission = me.permission;
      state.termsVersion = me.termsVersion || state.termsVersion;
      var settings = await api("/api/site-settings");
      applyUiConfig(settings.ui);
    } catch (error) {
      toast(error.message);
    }
    await route();
  }

  async function route() {
    var hash = location.hash || "#/";
    if (hash === "#/admin/editor") {
      if (!state.user || state.user.role !== "admin") {
        renderHeader();
        document.getElementById("app").innerHTML = '<div class="empty-state">需要管理员权限。</div>';
        return;
      }
      state.editor.enabled = true;
      state.editor.active = false;
      state.editor.selected = "";
      location.hash = "#/";
      return;
    }
    if (!state.user || state.user.role !== "admin") {
      state.editor.enabled = false;
      state.editor.active = false;
      state.editor.selected = "";
    }
    clearEditorHover();
    document.body.classList.toggle("editor-selecting", state.editor.enabled && state.editor.active);
    renderHeader();
    if (hash.indexOf("#/post/") === 0) {
      var slug = decodeURIComponent(hash.replace("#/post/", ""));
      await loadPost(slug);
      renderPost();
      syncEditorChrome();
      return;
    }
    if (hash === "#/admin") {
      await loadAdmin();
      renderAdmin();
      syncEditorChrome();
      return;
    }
    if (hash === "#/new") {
      renderComposePage();
      syncEditorChrome();
      return;
    }
    await loadPosts();
    renderHome();
    syncEditorChrome();
  }

  function renderHeader() {
    var header = document.getElementById("site-header");
    if (!header) return;
    var userBlock = "";
    if (state.user) {
      userBlock =
        '<button class="ghost-button" data-action="new-post" title="发帖">' + icon("plus") + '<span>发帖</span></button>' +
        (state.user.role === "admin" ? '<button class="ghost-button" data-action="admin" title="后台">' + icon("shield") + '<span>后台</span></button>' : "") +
        '<button class="plain-button" data-action="logout" title="退出">' + icon("user") + '<span>' + esc(state.user.username) + '</span></button>';
    } else {
      userBlock = '<button class="primary-button" data-action="auth" title="登录">' + icon("user") + '<span>登录</span></button>';
    }

    var searchWidth = Number(state.ui.searchWidthPx || 920);
    var searchClass = "searchbar" + (state.editor.enabled && state.editor.active ? " is-editor-selectable editor-target" : "");
    var searchAttrs = state.editor.enabled && state.editor.active ? ' data-edit-target="searchbar" data-edit-label="搜索栏"' : "";
    var searchStyle = ' style="width:' + escAttr(String(searchWidth)) + 'px"';

    header.innerHTML =
      '<div class="header-inner">' +
        '<a class="brand" href="#/" data-action="home">' +
          '<span class="brand-mark">N</span>' +
          '<span class="brand-text"><span class="brand-name">NoMTF</span><span class="brand-cn">不药娘网</span></span>' +
        '</a>' +
        '<form class="' + searchClass + '" id="search-form"' + searchAttrs + searchStyle + '>' +
          '<input name="q" type="search" placeholder="' + escAttr(state.ui.searchPlaceholder) + '" value="' + esc(state.filters.q) + '" autocomplete="off">' +
          '<button class="icon-button" type="submit" title="搜索">' + icon("search") + '</button>' +
        '</form>' +
        '<nav class="nav-actions">' + userBlock + '</nav>' +
      '</div>';
  }

  async function loadPosts() {
    var params = new URLSearchParams();
    if (state.filters.q) params.set("q", state.filters.q);
    if (state.filters.level) params.set("level", state.filters.level);
    if (state.filters.tag) params.set("tag", state.filters.tag);
    var data = await api("/api/posts?" + params.toString());
    state.posts = data.posts || [];
  }

  async function loadPost(slug) {
    var data = await api("/api/posts/" + encodeURIComponent(slug));
    state.post = data.post;
    state.comments = data.comments || [];
  }

  async function loadAdmin() {
    if (!state.user || state.user.role !== "admin") {
      state.admin = null;
      return;
    }
    var posts = await api("/api/admin/posts");
    var comments = await api("/api/admin/comments");
    var permissions = await api("/api/admin/permissions");
    var users = await api("/api/admin/users");
    state.admin = {
      posts: posts.posts || [],
      comments: comments.comments || [],
      permissions: permissions.permissions || [],
      users: users.users || []
    };
  }

  function applyUiConfig(ui) {
    ui = ui || {};
    var placeholder = String(ui.searchPlaceholder || state.ui.searchPlaceholder || "搜索物品、现象、标签").trim();
    var width = Math.round(Number(ui.searchWidthPx || state.ui.searchWidthPx || 920));
    state.ui.searchPlaceholder = placeholder.slice(0, 80) || "搜索物品、现象、标签";
    state.ui.searchWidthPx = clamp(width, 240, 1100);
    state.ui.editorOverrides = Array.isArray(ui.editorOverrides) ? ui.editorOverrides.slice(0, 80) : (state.ui.editorOverrides || []);
  }

  function renderHome() {
    var app = document.getElementById("app");
    app.innerHTML =
      '<section class="hero">' +
        '<div class="hero-copy">' +
          '<h1>NoMTF<br><span>不药娘网</span></h1>' +
          '<p class="hero-lede">把物品、现象和网络梗放进娱乐评级表，按“对社会的危害等级”做 1-5 级荒诞归档。本站禁止针对现实个人或受保护群体的仇恨、骚扰与煽动。</p>' +
          '<div class="hero-actions">' +
            '<button class="primary-button" data-action="new-post">' + icon("plus") + '<span>发布评级</span></button>' +
            '<button class="ghost-button" data-action="terms">' + icon("doc") + '<span>用户协议</span></button>' +
          '</div>' +
        '</div>' +
        '<aside class="rating-board">' +
          '<h2>危害等级</h2>' +
          '<div class="scale-list">' + Object.keys(levels).map(function (key) { return levelRow(key); }).join("") + '</div>' +
        '</aside>' +
      '</section>' +
      '<section class="layout">' +
        renderFilters() +
        '<div class="feed">' + renderFeed() + '</div>' +
      '</section>';
  }

  function renderVisualEditor() {
    if (!state.user || state.user.role !== "admin") {
      document.getElementById("app").innerHTML = '<div class="empty-state">需要管理员权限。</div>';
      return;
    }
    state.editor.enabled = true;
    renderHome();
    syncEditorChrome();
  }

  function renderVisualToolbar() {
    return '<section class="panel visual-toolbar">' +
      '<div><h1>图形编辑</h1><p>' + (state.editor.active ? '选择模式已开启，点击任意页面元素进行修改。' : '编辑模式已保持，切换页面不会消失。') + '</p></div>' +
      '<div class="hero-actions">' +
        (state.editor.active
          ? '<button class="danger-button" data-action="editor-stop">' + icon("back") + '<span>停止</span></button>'
          : '<button class="primary-button" data-action="editor-start">' + icon("plus") + '<span>开始</span></button>') +
        '<button class="ghost-button" data-action="admin">' + icon("shield") + '<span>后台</span></button>' +
        '<button class="plain-button" data-action="editor-exit">退出编辑</button>' +
      '</div>' +
    '</section>';
  }

  function syncEditorChrome() {
    document.body.classList.toggle("editor-selecting", state.editor.enabled && state.editor.active);
    applySavedOverrides();
    var oldRoot = document.getElementById("editor-toolbar-root");
    if (oldRoot) oldRoot.remove();
    if (state.editor.enabled && state.user && state.user.role === "admin") {
      var header = document.getElementById("site-header");
      if (header) {
        header.insertAdjacentHTML("afterend", '<div id="editor-toolbar-root" class="editor-toolbar-root">' + renderVisualToolbar() + '</div>');
      }
    }
    decorateEditableElements();
  }

  function applySavedOverrides() {
    var overrides = state.ui.editorOverrides || [];
    for (var i = 0; i < overrides.length; i += 1) {
      applyElementOverride(overrides[i]);
    }
  }

  function applyElementOverride(override) {
    if (!override || !override.selector) return;
    var nodes = [];
    try {
      nodes = Array.prototype.slice.call(document.querySelectorAll(override.selector));
    } catch (_) {
      return;
    }
    nodes.forEach(function (node) {
      if (isEditorUi(node)) return;
      if (typeof override.text === "string" && canEditText(node)) {
        node.textContent = override.text;
      }
      if (typeof override.placeholder === "string" && "placeholder" in node) {
        node.setAttribute("placeholder", override.placeholder);
      }
      applyElementStyles(node, override.styles || {});
    });
  }

  function applyElementStyles(node, styles) {
    var map = {
      width: "width",
      height: "height",
      padding: "padding",
      margin: "margin",
      fontSize: "fontSize",
      color: "color",
      backgroundColor: "backgroundColor",
      borderRadius: "borderRadius"
    };
    Object.keys(map).forEach(function (key) {
      if (styles[key]) node.style[map[key]] = styles[key];
    });
  }

  function decorateEditableElements() {
    Array.prototype.forEach.call(document.querySelectorAll(".editor-target"), function (node) {
      node.classList.remove("editor-target");
    });
    if (!state.editor.enabled || !state.editor.active) return;
    Array.prototype.forEach.call(document.querySelectorAll("#site-header *, #app *"), function (node) {
      if (isEditorUi(node) || !isVisibleElement(node)) return;
      node.classList.add("editor-target");
    });
  }

  function levelRow(key) {
    var item = levels[key];
    return '<button class="scale-row" data-action="filter-level" data-level="' + key + '">' +
      '<span class="level-badge level-' + key + '">' + item[0] + '</span>' +
      '<span><strong>' + item[1] + '</strong><span>' + item[2] + '</span></span>' +
    '</button>';
  }

  function renderFilters() {
    var buttons = Object.keys(levels).map(function (key) {
      return '<button class="segment ' + (state.filters.level === key ? "active" : "") + '" data-action="filter-level" data-level="' + key + '">' + key + '</button>';
    }).join("");
    return '<aside class="panel filters">' +
      '<div class="filter-group"><label>等级筛选</label><div class="segmented">' + buttons + '</div></div>' +
      '<div class="filter-group"><label>标签</label><input id="tag-filter" value="' + esc(state.filters.tag) + '" placeholder="输入标签名"></div>' +
      '<button class="ghost-button" data-action="apply-tag">' + icon("search") + '<span>筛选</span></button> ' +
      '<button class="plain-button" data-action="clear-filters">清空</button>' +
    '</aside>';
  }

  function renderFeed() {
    if (!state.posts.length) {
      return '<div class="empty-state">现在还没有符合条件的评级。</div>';
    }
    return state.posts.map(postCard).join("");
  }

  function postCard(post) {
    var cover = post.coverUrl
      ? '<img src="' + escAttr(post.coverUrl) + '" alt="">'
      : '<div class="cover-fallback"><span class="level-badge level-' + post.hazardLevel + '">' + post.hazardLevel + '</span></div>';
    return '<article class="post-card">' +
      '<div class="post-cover">' + cover + '</div>' +
      '<div class="post-body">' +
        '<div class="post-meta">' +
          '<span class="level-badge level-' + post.hazardLevel + '">' + post.hazardLevel + '</span>' +
          '<span>' + esc(post.authorName) + '</span>' +
          '<span>' + dateText(post.createdAt) + '</span>' +
          (post.nsfw ? '<span class="nsfw-pill">NSFW</span>' : '') +
        '</div>' +
        '<h2 class="post-title"><button data-action="open-post" data-slug="' + escAttr(post.slug) + '">' + esc(post.title) + '</button></h2>' +
        '<p class="post-summary">' + esc(post.summary || excerpt(post.content)) + '</p>' +
        '<div class="tag-list">' + post.tags.map(tagButton).join("") +
          '<span class="mini-stat">' + icon("heart") + esc(String(post.likeCount)) + '</span>' +
          '<span class="mini-stat">' + icon("comment") + esc(String(post.commentCount)) + '</span>' +
        '</div>' +
      '</div>' +
    '</article>';
  }

  function tagButton(tag) {
    return '<button class="tag" data-action="tag" data-tag="' + escAttr(tag) + '">#' + esc(tag) + '</button>';
  }

  function renderPost() {
    var app = document.getElementById("app");
    var post = state.post;
    if (!post) {
      app.innerHTML = '<div class="empty-state">帖子不存在。</div>';
      return;
    }
    app.innerHTML =
      '<section class="detail">' +
        (post.coverUrl ? '<div class="detail-cover"><img src="' + escAttr(post.coverUrl) + '" alt=""></div>' : '') +
        '<article class="panel detail-article">' +
          '<div class="detail-meta">' +
            '<span class="level-badge level-' + post.hazardLevel + '">' + post.hazardLevel + '</span>' +
            '<span>' + esc(post.authorName) + '</span>' +
            '<span>' + dateText(post.createdAt) + '</span>' +
            (post.nsfw ? '<span class="nsfw-pill">NSFW</span>' : '') +
          '</div>' +
          '<h1>' + esc(post.title) + '</h1>' +
          '<div class="tag-list">' + post.tags.map(tagButton).join("") + '</div>' +
          '<div class="content">' + renderMarkdown(post.content) + '</div>' +
          '<div class="hero-actions">' +
            '<button class="' + (post.likedByMe ? "primary-button" : "ghost-button") + '" data-action="like" data-id="' + escAttr(post.id) + '">' + icon("heart") + '<span>' + esc(String(post.likeCount)) + '</span></button>' +
            '<button class="ghost-button" data-action="home">' + icon("back") + '<span>返回</span></button>' +
          '</div>' +
        '</article>' +
        '<section class="panel comments">' +
          '<h2 class="section-title">回复</h2>' +
          renderCommentForm(post.id) +
          '<div class="comment-list">' + renderComments() + '</div>' +
        '</section>' +
      '</section>';
  }

  function renderCommentForm(postId) {
    if (!state.user) {
      return '<div class="empty-state"><button class="primary-button" data-action="auth">' + icon("user") + '<span>登录后回复</span></button></div>';
    }
    return '<form id="comment-form" class="form-grid" data-post-id="' + escAttr(postId) + '">' +
      '<div class="field"><textarea name="content" maxlength="4000" placeholder="写一条回复"></textarea></div>' +
      '<div><button class="primary-button" type="submit">' + icon("comment") + '<span>发送回复</span></button></div>' +
    '</form>';
  }

  function renderComments() {
    if (!state.comments.length) return '<div class="empty-state">还没有回复。</div>';
    return state.comments.map(function (item) {
      return '<article class="comment">' +
        '<div class="post-meta"><strong>' + esc(item.authorName) + '</strong><span>' + dateText(item.createdAt) + '</span></div>' +
        '<p>' + esc(item.content) + '</p>' +
      '</article>';
    }).join("");
  }

  function renderComposePage() {
    var app = document.getElementById("app");
    if (!state.user) {
      showAuth("login");
      location.hash = "#/";
      return;
    }
    app.innerHTML =
      '<section class="panel detail-article">' +
        '<h1>发布评级</h1>' +
        '<form id="compose-form" class="form-grid">' +
          '<div class="two-col">' +
            '<div class="field"><label>标题</label><input name="title" maxlength="120" required></div>' +
            '<div class="field"><label>自定义 slug</label><input name="slug" maxlength="90" placeholder="可留空"></div>' +
          '</div>' +
          '<div class="two-col">' +
            '<div class="field"><label>危害等级</label><select name="hazardLevel"><option value="1">1 轻微整活</option><option value="2">2 低度扰动</option><option value="3">3 中度混乱</option><option value="4">4 高度警报</option><option value="5">5 终极危害</option></select></div>' +
            '<div class="field"><label>标签</label><input name="tags" maxlength="160" placeholder="逗号分隔"></div>' +
          '</div>' +
          '<div class="field"><label>摘要</label><input name="summary" maxlength="240"></div>' +
          '<div class="two-col">' +
            '<div class="field"><label>封面图</label><input name="cover" type="file" accept="image/*"></div>' +
            '<div class="field"><label>正文图片</label><input name="bodyImages" type="file" accept="image/*" multiple></div>' +
          '</div>' +
          '<div class="field"><label>正文</label><textarea name="content" maxlength="80000" required placeholder="支持换行、**加粗**，上传正文图片后会追加到末尾"></textarea></div>' +
          '<label class="post-meta"><input name="nsfw" type="checkbox"> NSFW / 激烈表达提示</label>' +
          '<div class="hero-actions"><button class="primary-button" type="submit">' + icon("plus") + '<span>发布</span></button><button class="ghost-button" type="button" data-action="home">取消</button></div>' +
        '</form>' +
      '</section>';
  }

  function renderAdmin() {
    var app = document.getElementById("app");
    if (!state.user || state.user.role !== "admin") {
      app.innerHTML = '<div class="empty-state">需要管理员权限。</div>';
      return;
    }
    if (!state.admin) {
      app.innerHTML = '<div class="spinner">加载后台中...</div>';
      return;
    }
    app.innerHTML =
      '<section class="admin-grid">' +
        '<div class="panel admin-section"><h1>管理员后台</h1><p class="post-summary">删除帖子、处理回复、限制访客、管理账号权限和调整页面文案。</p><div class="hero-actions"><button class="primary-button" data-action="visual-editor">' + icon("doc") + '<span>图形编辑</span></button></div></div>' +
        renderAdminPosts() +
        renderAdminComments() +
        renderAdminUsers() +
        renderAdminPermissions() +
      '</section>';
  }

  function renderAdminPosts() {
    return '<section class="panel admin-section"><h2 class="section-title">帖子</h2><div class="table">' +
      state.admin.posts.map(function (p) {
        return '<div class="table-row">' +
          '<strong>' + esc(p.title) + '</strong>' +
          '<span>等级 ' + esc(String(p.hazard_level)) + '</span>' +
          '<span class="status-pill">' + esc(p.status) + '</span>' +
          '<button class="danger-button" data-action="admin-delete-post" data-id="' + escAttr(p.id) + '">' + icon("trash") + '<span>删除</span></button>' +
        '</div>';
      }).join("") + '</div></section>';
  }

  function renderAdminComments() {
    return '<section class="panel admin-section"><h2 class="section-title">回复</h2><div class="table">' +
      state.admin.comments.map(function (cm) {
        return '<div class="table-row">' +
          '<span>' + esc(excerpt(cm.content, 80)) + '</span>' +
          '<span>' + esc(cm.author_name || "匿名") + '</span>' +
          '<span class="status-pill">' + esc(cm.status) + '</span>' +
          '<button class="danger-button" data-action="admin-delete-comment" data-id="' + escAttr(cm.id) + '">' + icon("trash") + '<span>删除</span></button>' +
        '</div>';
      }).join("") + '</div></section>';
  }

  function renderAdminUsers() {
    return '<section class="panel admin-section"><h2 class="section-title">用户</h2><div class="table">' +
      state.admin.users.map(function (u) {
        return '<div class="table-row users">' +
          '<strong>' + esc(u.username) + '</strong>' +
          '<span>' + esc(u.email) + '</span>' +
          '<select data-action="user-role" data-id="' + escAttr(u.id) + '"><option value="user" ' + selected(u.role, "user") + '>user</option><option value="admin" ' + selected(u.role, "admin") + '>admin</option></select>' +
          '<select data-action="user-status" data-id="' + escAttr(u.id) + '"><option value="active" ' + selected(u.status, "active") + '>active</option><option value="muted" ' + selected(u.status, "muted") + '>muted</option><option value="banned" ' + selected(u.status, "banned") + '>banned</option></select>' +
          '<span class="admin-meta">' + dateText(u.created_at) + '</span>' +
        '</div>';
      }).join("") + '</div></section>';
  }

  function renderAdminPermissions() {
    return '<section class="panel admin-section"><h2 class="section-title">访客权限</h2>' +
      '<form id="permission-form" class="form-grid">' +
        '<div class="two-col">' +
          '<div class="field"><label>类型</label><select name="kind"><option value="visitor">visitor</option><option value="user">user</option><option value="ip_hash">ip_hash</option></select></div>' +
          '<div class="field"><label>等级</label><select name="level"><option value="muted">muted</option><option value="banned">banned</option><option value="allow">allow</option></select></div>' +
        '</div>' +
        '<div class="field"><label>Subject</label><input name="subject" required placeholder="visitorId / userId / ip_hash"></div>' +
        '<div class="field"><label>原因</label><input name="reason" maxlength="240"></div>' +
        '<button class="primary-button" type="submit">' + icon("shield") + '<span>添加规则</span></button>' +
      '</form>' +
      '<div class="table">' +
      state.admin.permissions.map(function (p) {
        return '<div class="table-row permissions">' +
          '<span class="status-pill">' + esc(p.kind) + '</span>' +
          '<code>' + esc(p.subject) + '</code>' +
          '<span>' + esc(p.level) + '</span>' +
          '<span>' + esc(p.reason || "") + '</span>' +
          '<button class="danger-button" data-action="admin-delete-permission" data-id="' + escAttr(p.id) + '">' + icon("trash") + '<span>删除</span></button>' +
        '</div>';
      }).join("") + '</div></section>';
  }

  async function onClick(event) {
    var target = event.target.closest("[data-action]");
    if (!target) return;
    var action = target.getAttribute("data-action");
    if (action === "home") {
      location.hash = "#/";
    }
    if (action === "auth") showAuth("login");
    if (action === "terms") showTerms(true);
    if (action === "new-post") location.hash = "#/new";
    if (action === "admin") location.hash = "#/admin";
    if (action === "visual-editor") {
      state.editor.enabled = true;
      state.editor.active = false;
      state.editor.selected = "";
      if ((location.hash || "#/") === "#/") {
        await route();
      } else {
        location.hash = "#/";
      }
      return;
    }
    if (action === "editor-start") {
      state.editor.active = true;
      state.editor.selected = "";
      renderHeader();
      syncEditorChrome();
      return;
    }
    if (action === "editor-stop") {
      state.editor.active = false;
      state.editor.selected = "";
      clearEditorHover();
      renderHeader();
      syncEditorChrome();
      return;
    }
    if (action === "editor-exit") {
      state.editor.enabled = false;
      state.editor.active = false;
      state.editor.selected = "";
      clearEditorHover();
      renderHeader();
      syncEditorChrome();
      return;
    }
    if (action === "logout") await logout();
    if (action === "open-post") location.hash = "#/post/" + encodeURIComponent(target.getAttribute("data-slug"));
    if (action === "filter-level") {
      var level = target.getAttribute("data-level");
      state.filters.level = state.filters.level === level ? "" : level;
      location.hash = "#/";
      await route();
    }
    if (action === "tag") {
      state.filters.tag = target.getAttribute("data-tag") || "";
      location.hash = "#/";
      await route();
    }
    if (action === "apply-tag") {
      state.filters.tag = document.getElementById("tag-filter").value.trim();
      await route();
    }
    if (action === "clear-filters") {
      state.filters = { q: "", level: "", tag: "" };
      await route();
    }
    if (action === "like") await likePost(target.getAttribute("data-id"));
    if (action === "close-modal") closeModal();
    if (action === "accept-terms") await acceptTerms();
    if (action === "admin-delete-post") await adminDelete("/api/admin/posts/" + target.getAttribute("data-id"));
    if (action === "admin-delete-comment") await adminDelete("/api/admin/comments/" + target.getAttribute("data-id"));
    if (action === "admin-delete-permission") await adminDelete("/api/admin/permissions/" + target.getAttribute("data-id"));
  }

  function onEditorClick(event) {
    if (!state.editor.enabled || !state.editor.active) return;
    if (isEditorUi(event.target)) return;
    var target = editableTarget(event.target);
    if (!target) return;
    event.preventDefault();
    event.stopPropagation();
    clearEditorHover();
    state.editor.element = target;
    state.editor.selected = describeElement(target);
    target.classList.add("editor-selected");
    var editTarget = target.getAttribute("data-edit-target");
    if (editTarget === "searchbar") {
      state.editor.selected = "searchbar";
      showSearchEditor();
      return;
    }
    showElementEditor(target);
  }

  function onEditorHover(event) {
    if (!state.editor.enabled || !state.editor.active) return;
    var target = editableTarget(event.target);
    if (!target || target === state.editor.hover) return;
    if (state.editor.hover) state.editor.hover.classList.remove("editor-hover");
    state.editor.hover = target;
    target.classList.add("editor-hover");
  }

  function onEditorHoverOut(event) {
    if (!state.editor.enabled || !state.editor.active || !state.editor.hover) return;
    if (event.relatedTarget && state.editor.hover.contains(event.relatedTarget)) return;
    state.editor.hover.classList.remove("editor-hover");
    state.editor.hover = null;
  }

  function clearEditorHover() {
    Array.prototype.forEach.call(document.querySelectorAll(".editor-hover, .editor-selected"), function (node) {
      node.classList.remove("editor-hover", "editor-selected");
    });
    state.editor.hover = null;
    state.editor.element = null;
  }

  function editableTarget(raw) {
    if (!raw || !raw.closest) return null;
    if (isEditorUi(raw)) return null;
    var special = raw.closest("[data-edit-target]");
    if (special && !isEditorUi(special) && isVisibleElement(special)) return special;
    var node = raw.nodeType === 1 ? raw : raw.parentElement;
    if (!node || !node.closest) return null;
    var target = node.closest("button,a,input,textarea,select,label,h1,h2,h3,p,img,article,section,aside,form,div,span");
    if (!target || isEditorUi(target) || target.id === "app" || target.id === "site-header") return null;
    return isVisibleElement(target) ? target : null;
  }

  function isEditorUi(node) {
    return Boolean(node && node.closest && node.closest("#editor-toolbar-root, .modal-backdrop, #toast"));
  }

  function isVisibleElement(node) {
    if (!node || !node.getBoundingClientRect) return false;
    var style = getComputedStyle(node);
    var rect = node.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0 && style.display !== "none" && style.visibility !== "hidden" && style.opacity !== "0";
  }

  function describeElement(node) {
    var label = node.getAttribute("data-edit-label") || node.getAttribute("aria-label") || node.getAttribute("title") || node.textContent || node.getAttribute("placeholder") || node.tagName.toLowerCase();
    return String(label).replace(/\s+/g, " ").trim().slice(0, 80) || node.tagName.toLowerCase();
  }

  function canEditText(node) {
    return !/^(INPUT|TEXTAREA|SELECT|IMG|SVG|PATH)$/i.test(node.tagName);
  }

  function showElementEditor(element) {
    var selector = buildElementSelector(element);
    var existing = findElementOverride(selector);
    var computed = getComputedStyle(element);
    var rect = element.getBoundingClientRect();
    var styles = existing && existing.styles ? existing.styles : {};
    var textValue = typeof existing?.text === "string" ? existing.text : (canEditText(element) ? String(element.textContent || "").replace(/\s+/g, " ").trim().slice(0, 500) : "");
    var placeholderValue = typeof existing?.placeholder === "string" ? existing.placeholder : (("placeholder" in element) ? element.getAttribute("placeholder") || "" : "");
    var supportsPlaceholder = "placeholder" in element;
    var textField = canEditText(element)
      ? '<div class="field"><label>文字</label><textarea name="text" maxlength="500">' + esc(textValue) + '</textarea></div>'
      : "";
    var placeholderField = supportsPlaceholder
      ? '<div class="field"><label>placeholder</label><input name="placeholder" maxlength="160" value="' + escAttr(placeholderValue) + '"></div>'
      : "";
    showModal(
      '<div class="modal large">' +
        '<div class="modal-head"><h2>编辑元素</h2><button class="plain-button" data-action="close-modal">关闭</button></div>' +
        '<div class="modal-body">' +
          '<form id="ui-element-form" class="form-grid" data-can-text="' + (canEditText(element) ? "true" : "false") + '">' +
            '<div class="field"><label>选择器</label><input name="selector" readonly value="' + escAttr(selector) + '"></div>' +
            '<div class="two-col">' + textField + placeholderField + '</div>' +
            '<div class="two-col">' +
              numberField("宽度", "widthPx", cssPxToNumber(styles.width, rect.width)) +
              numberField("高度", "heightPx", cssPxToNumber(styles.height, rect.height)) +
            '</div>' +
            '<div class="two-col">' +
              numberField("内边距", "paddingPx", cssPxToNumber(styles.padding, computed.paddingTop)) +
              numberField("外边距", "marginPx", cssPxToNumber(styles.margin, computed.marginTop)) +
            '</div>' +
            '<div class="two-col">' +
              numberField("字号", "fontSizePx", cssPxToNumber(styles.fontSize, computed.fontSize)) +
              numberField("圆角", "borderRadiusPx", cssPxToNumber(styles.borderRadius, computed.borderTopLeftRadius)) +
            '</div>' +
            '<div class="two-col">' +
              colorField("文字色", "color", styles.color || rgbToHex(computed.color)) +
              colorField("背景色", "backgroundColor", styles.backgroundColor || rgbToHex(computed.backgroundColor)) +
            '</div>' +
            '<div class="field"><label>生成的 CSS</label><textarea class="editor-code" name="cssSnippet" readonly></textarea></div>' +
            '<div class="hero-actions"><button class="primary-button" type="submit">' + icon("doc") + '<span>保存</span></button><button class="ghost-button" type="button" data-action="close-modal">取消</button></div>' +
          '</form>' +
        '</div>' +
      '</div>'
    );
    updateElementCssSnippet(document.getElementById("ui-element-form"));
  }

  function numberField(label, name, value) {
    var number = Number(value);
    return '<div class="field"><label>' + label + '</label><input name="' + name + '" type="number" min="0" max="1600" step="1" value="' + (Number.isFinite(number) ? escAttr(String(Math.round(number))) : "") + '"></div>';
  }

  function colorField(label, name, value) {
    return '<div class="field"><label>' + label + '</label><input name="' + name + '" type="color" value="' + escAttr(value || "#ffffff") + '"></div>';
  }

  function buildElementSelector(element) {
    var editTarget = element.getAttribute("data-edit-target");
    if (editTarget) return '[data-edit-target="' + cssString(editTarget) + '"]';
    if (element.id && element.id !== "app" && element.id !== "site-header") return "#" + cssEscape(element.id);
    var root = element.closest("#site-header") ? "#site-header" : "#app";
    var parts = [];
    var node = element;
    while (node && node.matches && !node.matches(root) && node !== document.body) {
      var part = node.tagName.toLowerCase();
      var stableClass = stableClassName(node);
      if (stableClass) part += "." + cssEscape(stableClass);
      var parent = node.parentElement;
      if (parent) {
        var sameTag = Array.prototype.filter.call(parent.children, function (child) {
          return child.tagName === node.tagName;
        });
        if (sameTag.length > 1) part += ":nth-of-type(" + (sameTag.indexOf(node) + 1) + ")";
      }
      parts.unshift(part);
      var candidate = root + " " + parts.join(" > ");
      try {
        if (document.querySelectorAll(candidate).length === 1) return candidate;
      } catch (_) {
      }
      node = parent;
    }
    return root + " " + parts.join(" > ");
  }

  function stableClassName(node) {
    for (var i = 0; i < node.classList.length; i += 1) {
      var name = node.classList[i];
      if (!/^editor-|^is-editor-selectable$|^active$/.test(name)) return name;
    }
    return "";
  }

  function cssEscape(value) {
    if (window.CSS && CSS.escape) return CSS.escape(value);
    return String(value).replace(/[^a-zA-Z0-9_-]/g, "\\$&");
  }

  function cssString(value) {
    return String(value).replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  }

  function cssPxToNumber(value, fallback) {
    var parsed = parseFloat(String(value || ""));
    if (Number.isFinite(parsed)) return parsed;
    parsed = parseFloat(String(fallback || ""));
    return Number.isFinite(parsed) ? parsed : "";
  }

  function rgbToHex(value) {
    var match = String(value || "").match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/i);
    if (!match) return "#ffffff";
    return "#" + [match[1], match[2], match[3]].map(function (part) {
      return Math.max(0, Math.min(255, Number(part))).toString(16).padStart(2, "0");
    }).join("");
  }

  function findElementOverride(selector) {
    var overrides = state.ui.editorOverrides || [];
    for (var i = 0; i < overrides.length; i += 1) {
      if (overrides[i].selector === selector) return overrides[i];
    }
    return null;
  }

  function collectElementOverride(form) {
    var data = new FormData(form);
    var styles = {};
    setPxStyle(styles, "width", data.get("widthPx"));
    setPxStyle(styles, "height", data.get("heightPx"));
    setPxStyle(styles, "padding", data.get("paddingPx"));
    setPxStyle(styles, "margin", data.get("marginPx"));
    setPxStyle(styles, "fontSize", data.get("fontSizePx"));
    setPxStyle(styles, "borderRadius", data.get("borderRadiusPx"));
    setColorStyle(styles, "color", data.get("color"));
    setColorStyle(styles, "backgroundColor", data.get("backgroundColor"));
    var override = {
      selector: String(data.get("selector") || "").trim(),
      styles: styles
    };
    if (form.getAttribute("data-can-text") === "true") override.text = String(data.get("text") || "").trim().slice(0, 500);
    if (data.has("placeholder")) override.placeholder = String(data.get("placeholder") || "").trim().slice(0, 160);
    return override;
  }

  function setPxStyle(styles, key, value) {
    var number = Math.round(Number(value));
    if (Number.isFinite(number) && number >= 0 && number <= 1600) styles[key] = number + "px";
  }

  function setColorStyle(styles, key, value) {
    value = String(value || "").trim();
    if (/^#[0-9a-f]{6}$/i.test(value)) styles[key] = value;
  }

  function previewElementUi(form) {
    var override = collectElementOverride(form);
    applyElementOverride(override);
  }

  function updateElementCssSnippet(form) {
    if (!form) return;
    var override = collectElementOverride(form);
    var lines = [override.selector + " {"];
    Object.keys(override.styles).forEach(function (key) {
      lines.push("  " + cssPropertyName(key) + ": " + override.styles[key] + ";");
    });
    lines.push("}");
    var field = form.querySelector('textarea[name="cssSnippet"]');
    if (field) field.value = lines.join("\n");
  }

  function cssPropertyName(key) {
    return key.replace(/[A-Z]/g, function (char) { return "-" + char.toLowerCase(); });
  }

  async function saveElementUi(form) {
    try {
      var override = collectElementOverride(form);
      if (!override.selector) throw new Error("没有选中元素");
      var overrides = (state.ui.editorOverrides || []).filter(function (item) {
        return item.selector !== override.selector;
      });
      overrides.push(override);
      var saved = await api("/api/admin/site-settings", { method: "PATCH", body: { ui: currentUiPayload(overrides) } });
      applyUiConfig(saved.ui);
      renderHeader();
      syncEditorChrome();
      closeModal();
      toast("元素样式已保存");
    } catch (error) {
      toast(error.message);
    }
  }

  function currentUiPayload(overrides) {
    return {
      searchPlaceholder: state.ui.searchPlaceholder,
      searchWidthPx: state.ui.searchWidthPx,
      editorOverrides: overrides || state.ui.editorOverrides || []
    };
  }

  async function onSubmit(event) {
    if (event.target.id === "search-form") {
      event.preventDefault();
      if (state.editor.enabled && state.editor.active) {
        showSearchEditor();
        return;
      }
      state.filters.q = new FormData(event.target).get("q").trim();
      location.hash = "#/";
      await route();
      return;
    }
    if (event.target.id === "login-form") {
      event.preventDefault();
      await login(event.target);
      return;
    }
    if (event.target.id === "register-form") {
      event.preventDefault();
      await register(event.target);
      return;
    }
    if (event.target.id === "compose-form") {
      event.preventDefault();
      await createPost(event.target);
      return;
    }
    if (event.target.id === "comment-form") {
      event.preventDefault();
      await createComment(event.target);
      return;
    }
    if (event.target.id === "permission-form") {
      event.preventDefault();
      await createPermission(event.target);
      return;
    }
    if (event.target.id === "ui-search-form") {
      event.preventDefault();
      await saveSearchUi(event.target);
      return;
    }
    if (event.target.id === "ui-element-form") {
      event.preventDefault();
      await saveElementUi(event.target);
    }
  }

  function onInput(event) {
    if (!event.target.closest) return;
    var searchForm = event.target.closest("#ui-search-form");
    if (searchForm) {
      var data = new FormData(searchForm);
      applyUiConfig({
        searchPlaceholder: data.get("searchPlaceholder"),
        searchWidthPx: data.get("searchWidthPx"),
        editorOverrides: state.ui.editorOverrides
      });
      var widthNumber = searchForm.querySelector('input[name="searchWidthNumber"]');
      var widthRange = searchForm.querySelector('input[name="searchWidthPx"]');
      if (widthNumber && widthRange && event.target.name === "searchWidthNumber") {
        widthRange.value = String(clamp(Number(widthNumber.value), 240, 1100));
        state.ui.searchWidthPx = Number(widthRange.value);
      }
      if (widthNumber && widthRange && event.target.name === "searchWidthPx") {
        widthNumber.value = widthRange.value;
      }
      renderHeader();
      syncEditorChrome();
      return;
    }
    var elementForm = event.target.closest("#ui-element-form");
    if (elementForm) {
      previewElementUi(elementForm);
      updateElementCssSnippet(elementForm);
    }
  }

  document.addEventListener("change", async function (event) {
    var target = event.target;
    var action = target.getAttribute && target.getAttribute("data-action");
    if (action === "user-role") {
      await api("/api/admin/users/" + target.getAttribute("data-id"), { method: "PATCH", body: { role: target.value } });
      toast("角色已更新");
      await route();
    }
    if (action === "user-status") {
      await api("/api/admin/users/" + target.getAttribute("data-id"), { method: "PATCH", body: { status: target.value } });
      toast("状态已更新");
      await route();
    }
  });

  async function login(form) {
    try {
      var data = await api("/api/login", { method: "POST", body: Object.fromEntries(new FormData(form)) });
      state.user = data.user;
      closeModal();
      toast("已登录");
      await route();
    } catch (error) {
      toast(error.message);
    }
  }

  async function register(form) {
    try {
      var data = await api("/api/register", { method: "POST", body: Object.fromEntries(new FormData(form)) });
      state.user = data.user;
      closeModal();
      toast("注册成功");
      await route();
    } catch (error) {
      toast(error.message);
    }
  }

  async function logout() {
    await api("/api/logout", { method: "POST" });
    state.user = null;
    state.admin = null;
    state.editor.enabled = false;
    state.editor.active = false;
    toast("已退出");
    location.hash = "#/";
    await route();
  }

  async function createPost(form) {
    try {
      var formData = new FormData(form);
      var coverKey = "";
      var coverFile = formData.get("cover");
      if (coverFile && coverFile.size) {
        var cover = await uploadFile(coverFile);
        coverKey = cover.key;
      }
      var content = String(formData.get("content") || "");
      var bodyImages = formData.getAll("bodyImages").filter(function (file) { return file && file.size; });
      for (var i = 0; i < bodyImages.length; i += 1) {
        var uploaded = await uploadFile(bodyImages[i]);
        content += "\n\n![" + bodyImages[i].name.replace(/[\\[\\]()]/g, "") + "](" + uploaded.url + ")\n";
      }
      var payload = {
        title: formData.get("title"),
        slug: formData.get("slug"),
        summary: formData.get("summary"),
        hazardLevel: Number(formData.get("hazardLevel")),
        tags: formData.get("tags"),
        nsfw: Boolean(formData.get("nsfw")),
        coverKey: coverKey,
        content: content
      };
      var created = await api("/api/posts", { method: "POST", body: payload });
      toast("已发布");
      location.hash = "#/post/" + encodeURIComponent(created.slug);
    } catch (error) {
      toast(error.message);
    }
  }

  async function createComment(form) {
    try {
      var postId = form.getAttribute("data-post-id");
      await api("/api/posts/" + postId + "/comments", { method: "POST", body: Object.fromEntries(new FormData(form)) });
      toast("已回复");
      await loadPost(state.post.slug);
      renderPost();
    } catch (error) {
      toast(error.message);
    }
  }

  async function likePost(postId) {
    try {
      await api("/api/posts/" + postId + "/like", { method: "POST" });
      await loadPost(state.post.slug);
      renderPost();
    } catch (error) {
      toast(error.message);
    }
  }

  async function createPermission(form) {
    try {
      await api("/api/admin/permissions", { method: "POST", body: Object.fromEntries(new FormData(form)) });
      form.reset();
      toast("规则已添加");
      await route();
    } catch (error) {
      toast(error.message);
    }
  }

  function showSearchEditor() {
    showModal(
      '<div class="modal">' +
        '<div class="modal-head"><h2>编辑搜索栏</h2><button class="plain-button" data-action="close-modal">关闭</button></div>' +
        '<div class="modal-body">' +
          '<form id="ui-search-form" class="form-grid">' +
            '<div class="field"><label>提示文字</label><input name="searchPlaceholder" maxlength="80" value="' + escAttr(state.ui.searchPlaceholder) + '"></div>' +
            '<div class="two-col">' +
              '<div class="field"><label>搜索框宽度</label><input name="searchWidthPx" type="range" min="240" max="1100" step="10" value="' + escAttr(String(state.ui.searchWidthPx)) + '"></div>' +
              '<div class="field"><label>像素</label><input name="searchWidthNumber" type="number" min="240" max="1100" step="10" value="' + escAttr(String(state.ui.searchWidthPx)) + '"></div>' +
            '</div>' +
            '<div class="editor-form-preview"><strong>实时预览：</strong><span> 页面顶部搜索栏会跟着变化，保存后所有访客可见。</span></div>' +
            '<div class="hero-actions"><button class="primary-button" type="submit">' + icon("doc") + '<span>保存</span></button><button class="ghost-button" type="button" data-action="close-modal">取消</button></div>' +
          '</form>' +
        '</div>' +
      '</div>'
    );
  }

  async function saveSearchUi(form) {
    try {
      var data = new FormData(form);
      var width = Number(data.get("searchWidthNumber") || data.get("searchWidthPx"));
      var payload = {
        ui: {
          searchPlaceholder: data.get("searchPlaceholder"),
          searchWidthPx: width,
          editorOverrides: state.ui.editorOverrides
        }
      };
      var saved = await api("/api/admin/site-settings", { method: "PATCH", body: payload });
      applyUiConfig(saved.ui);
      renderHeader();
      syncEditorChrome();
      closeModal();
      toast("搜索栏已更新");
    } catch (error) {
      toast(error.message);
    }
  }

  async function adminDelete(path) {
    try {
      await api(path, { method: "DELETE" });
      toast("已删除");
      await route();
    } catch (error) {
      toast(error.message);
    }
  }

  async function uploadFile(file) {
    var body = new FormData();
    body.set("file", file);
    return api("/api/media", { method: "POST", body: body });
  }

  function showAuth(mode) {
    var isRegister = mode === "register";
    showModal(
      '<div class="modal">' +
        '<div class="modal-head"><h2>' + (isRegister ? "注册" : "登录") + '</h2><button class="plain-button" data-action="close-modal">关闭</button></div>' +
        '<div class="modal-body">' +
          (isRegister ? registerForm() : loginForm()) +
          '<div class="hero-actions">' +
            '<button class="plain-button" id="switch-auth">' + (isRegister ? "已有账号，去登录" : "没有账号，去注册") + '</button>' +
          '</div>' +
        '</div>' +
      '</div>'
    );
    document.getElementById("switch-auth").addEventListener("click", function () {
      showAuth(isRegister ? "login" : "register");
    });
  }

  function loginForm() {
    return '<form id="login-form" class="form-grid">' +
      '<div class="field"><label>邮箱</label><input name="email" type="email" required></div>' +
      '<div class="field"><label>密码</label><input name="password" type="password" minlength="8" required></div>' +
      '<button class="primary-button" type="submit">' + icon("user") + '<span>登录</span></button>' +
    '</form>';
  }

  function registerForm() {
    return '<form id="register-form" class="form-grid">' +
      '<div class="two-col"><div class="field"><label>昵称</label><input name="username" minlength="2" maxlength="24" required></div><div class="field"><label>邮箱</label><input name="email" type="email" required></div></div>' +
      '<div class="field"><label>密码</label><input name="password" type="password" minlength="8" required></div>' +
      '<div class="field"><label>管理员邀请码</label><input name="inviteCode" placeholder="普通用户可留空"></div>' +
      '<button class="primary-button" type="submit">' + icon("plus") + '<span>注册</span></button>' +
    '</form>';
  }

  function showTermsIfNeeded() {
    if (localStorage.getItem("nomtf_terms_" + state.termsVersion) !== "accepted") {
      showTerms(false);
    }
  }

  function showTerms(canClose) {
    showModal(
      '<div class="modal large">' +
        '<div class="modal-head"><h2>NoMTF 用户协议与免责声明</h2>' + (canClose ? '<button class="plain-button" data-action="close-modal">关闭</button>' : '') + '</div>' +
        '<div class="modal-body terms-copy">' +
          '<p>本站是娱乐向评级社区，内容可能包含夸张、讽刺、NSFW、粗口、黑色幽默或强烈观点。进入即表示你理解这里的评级不是事实判断、专业建议或现实行动号召。</p>' +
          '<h3>内容边界</h3>' +
          '<p>禁止发布针对现实个人的骚扰、开盒、诽谤、威胁；禁止针对受保护群体的仇恨、贬损、煽动排斥或暴力；禁止违法、未成年人性化、真实自伤鼓励、诈骗和恶意引流内容。</p>' +
          '<h3>NSFW 与过激表达</h3>' +
          '<p>发布者需要对 NSFW、血腥、成人、强烈冒犯或容易引发不适的内容进行标记。管理员可以隐藏、删除、限制传播或限制账号/访客权限。</p>' +
          '<h3>用户责任</h3>' +
          '<p>用户对自己发布的文字、图片、链接和评论负责。免责声明不豁免违法责任，也不保护恶意骚扰和仇恨内容。</p>' +
          '<h3>管理权</h3>' +
          '<p>管理员可以基于安全、合规、社区秩序和平台风险删除帖子、删除回复、封禁账号、限制访客或调整内容状态。</p>' +
          '<div class="hero-actions"><button class="primary-button" data-action="accept-terms">' + icon("doc") + '<span>我已阅读并同意</span></button></div>' +
        '</div>' +
      '</div>'
    );
  }

  async function acceptTerms() {
    localStorage.setItem("nomtf_terms_" + state.termsVersion, "accepted");
    closeModal();
    try {
      await api("/api/agreements", { method: "POST", body: { version: state.termsVersion } });
    } catch (_) {
    }
  }

  function showModal(html) {
    document.getElementById("modal-root").innerHTML = '<div class="modal-backdrop">' + html + '</div>';
  }

  function closeModal() {
    document.getElementById("modal-root").innerHTML = "";
  }

  async function api(path, options) {
    options = options || {};
    var init = { method: options.method || "GET", credentials: "same-origin", headers: {} };
    if (options.body instanceof FormData) {
      init.body = options.body;
    } else if (options.body !== undefined) {
      init.headers["Content-Type"] = "application/json";
      init.body = JSON.stringify(options.body);
    }
    var response = await fetch(path, init);
    var text = await response.text();
    var data = text ? JSON.parse(text) : {};
    if (!response.ok) throw new Error(data.error || "请求失败");
    return data;
  }

  function renderMarkdown(text) {
    var safe = esc(text || "");
    safe = safe.replace(/!\[([^\]]*)\]\((\/media\/[^)]+)\)/g, function (_, alt, url) {
      return '</p><img src="' + escAttr(url) + '" alt="' + escAttr(alt) + '"><p>';
    });
    safe = safe.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
    return '<p>' + safe.split(/\n{2,}/).map(function (part) { return part.replace(/\n/g, "<br>"); }).join("</p><p>") + '</p>';
  }

  function esc(value) {
    return String(value == null ? "" : value).replace(/[&<>"']/g, function (char) {
      return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char];
    });
  }

  function escAttr(value) {
    return esc(value).replace(new RegExp(String.fromCharCode(96), "g"), "&#96;");
  }

  function excerpt(value, max) {
    max = max || 110;
    var text = String(value || "").replace(/\s+/g, " ").trim();
    return text.length > max ? text.slice(0, max - 1) + "..." : text;
  }

  function dateText(value) {
    if (!value) return "";
    return new Intl.DateTimeFormat("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
  }

  function selected(value, expected) {
    return value === expected ? "selected" : "";
  }

  function clamp(value, min, max) {
    value = Number(value);
    if (!Number.isFinite(value)) return min;
    return Math.min(max, Math.max(min, value));
  }

  function toast(message) {
    var wrap = document.getElementById("toast");
    var item = document.createElement("div");
    item.className = "toast-item";
    item.textContent = message;
    wrap.appendChild(item);
    setTimeout(function () { item.remove(); }, 3600);
  }

  function icon(name) {
    var attrs = 'viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"';
    var paths = {
      search: '<circle cx="11" cy="11" r="7"></circle><path d="m20 20-3.2-3.2"></path>',
      plus: '<path d="M12 5v14"></path><path d="M5 12h14"></path>',
      user: '<path d="M20 21a8 8 0 0 0-16 0"></path><circle cx="12" cy="7" r="4"></circle>',
      shield: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z"></path>',
      heart: '<path d="M20.8 4.6a5.4 5.4 0 0 0-7.6 0L12 5.8l-1.2-1.2a5.4 5.4 0 1 0-7.6 7.6L12 21l8.8-8.8a5.4 5.4 0 0 0 0-7.6Z"></path>',
      comment: '<path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4Z"></path>',
      trash: '<path d="M3 6h18"></path><path d="M8 6V4h8v2"></path><path d="M19 6l-1 14H6L5 6"></path>',
      doc: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z"></path><path d="M14 2v6h6"></path><path d="M8 13h8"></path><path d="M8 17h6"></path>',
      back: '<path d="M19 12H5"></path><path d="m12 19-7-7 7-7"></path>'
    };
    return '<svg ' + attrs + '>' + (paths[name] || paths.doc) + '</svg>';
  }
})();
`;
