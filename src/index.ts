// onm-personal：Rei 的个人图床 + 文本版本库（m.rei8t.dev）
//
// 公开（任何人可访问）：
//   GET  /i/:id.:ext              图片直链（R2）
//   GET  /t/:id[?v=3]             文本只读页（默认最新版）
//   GET  /t/:id/raw[?v=3]         文本原文（text/plain）
// 页面：
//   GET  /                        首页：上传 + 文件管理（未登录只显示上传入口，点了弹登录框）
//   GET  /edit/:id                文本编辑器 + 版本历史
// 登录：GET /auth/login | /auth/callback, POST /auth/logout（Google OAuth，ADMIN_EMAILS 白名单）
// API（需登录）：
//   GET    /api/files?kind=&q=&cursor=      列表
//   POST   /api/upload                      上传（multipart，字段 file）
//   PATCH  /api/files/:id                   改名 {name}
//   DELETE /api/files/:id                   删除
//   POST   /api/texts                       新建文本 {name, content}
//   GET    /api/texts/:id                   文本 + 当前内容
//   PUT    /api/texts/:id                   保存为新版本 {content, baseVersion?, note?}
//   GET    /api/texts/:id/versions          版本列表
//   GET    /api/texts/:id/versions/:v       某个版本的内容
//   POST   /api/texts/:id/rollback          回滚 {version}
import { callback, getAdmin, login, logout, type SessionUser } from "./auth.ts";
import { limitsOf, type Env } from "./env.ts";
import {
  createText,
  deleteFile,
  getFile,
  getVersion,
  ID_RE,
  InputError,
  listFiles,
  listVersions,
  renameFile,
  rollback,
  saveVersion,
  toView,
  uploadFile,
} from "./files.ts";
import { renderPage } from "./html.ts";
import type { LoginError, SessionInfo } from "./shared/types.ts";

const LOGIN_ERRORS = new Set(["unconfigured", "denied", "state", "token", "id_token", "unverified", "forbidden"]);

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } });

/** 写操作要求同源（Origin 头），配合 SameSite=Lax cookie 防 CSRF。 */
const sameOrigin = (req: Request) => {
  const o = req.headers.get("Origin");
  return o === null ? req.method === "GET" || req.method === "HEAD" : o === new URL(req.url).origin;
};

const sessionInfo = (u: SessionUser | null): SessionInfo | null =>
  u ? { email: u.email, ...(u.name ? { name: u.name } : {}), ...(u.picture ? { picture: u.picture } : {}) } : null;

async function body<T>(req: Request): Promise<Partial<T>> {
  const b = await req.json().catch(() => null);
  if (!b || typeof b !== "object" || Array.isArray(b)) throw new InputError("请求体需要是 JSON 对象");
  return b as Partial<T>;
}

const str = (v: unknown, field: string) => {
  if (typeof v !== "string") throw new InputError(`${field} 需要是字符串`);
  return v;
};

async function handleApi(req: Request, env: Env, path: string, origin: string): Promise<Response> {
  if (path === "/api/me") return json({ user: sessionInfo(await getAdmin(req, env)), limits: limitsOf(env) });
  if (!(await getAdmin(req, env))) return json({ error: "需要登录", code: "unauthorized" }, 401);
  if (req.method !== "GET" && !sameOrigin(req)) return json({ error: "来源不合法" }, 403);
  const m = req.method;
  const url = new URL(req.url);
  let r: RegExpExecArray | null;
  try {
    if (path === "/api/files" && m === "GET") {
      const p = url.searchParams;
      return json(await listFiles(env, origin, { kind: p.get("kind"), q: p.get("q"), cursor: p.get("cursor"), limit: Number(p.get("limit") ?? 50) }));
    }
    if (path === "/api/upload" && m === "POST") {
      const form = await req.formData().catch(() => null);
      const file = form?.get("file");
      if (!file || typeof file === "string") throw new InputError("缺少文件（字段 file）");
      return json({ file: await uploadFile(env, origin, file) }, 201);
    }
    if ((r = /^\/api\/files\/([A-Za-z0-9]{8})$/.exec(path))) {
      const id = r[1]!;
      if (m === "GET") {
        const row = await getFile(env, id);
        return row ? json({ file: toView(origin, row) }) : json({ error: "文件不存在" }, 404);
      }
      if (m === "PATCH") return json({ file: await renameFile(env, origin, id, str((await body<{ name: string }>(req)).name, "name")) });
      if (m === "DELETE") return (await deleteFile(env, id)) ? json({ ok: true }) : json({ error: "文件不存在" }, 404);
    }
    if (path === "/api/texts" && m === "POST") {
      const b = await body<{ name: string; content: string }>(req);
      return json({ file: await createText(env, origin, str(b.name ?? "", "name"), str(b.content ?? "", "content")) }, 201);
    }
    if ((r = /^\/api\/texts\/([A-Za-z0-9]{8})$/.exec(path))) {
      const id = r[1]!;
      if (m === "GET") {
        const row = await getFile(env, id);
        if (!row || row.kind !== "text") return json({ error: "文本不存在" }, 404);
        return json({ file: toView(origin, row), current: await getVersion(env, id) });
      }
      if (m === "PUT") {
        const b = await body<{ content: string; baseVersion: number; note: string }>(req);
        const baseVersion = typeof b.baseVersion === "number" ? b.baseVersion : undefined;
        return json(await saveVersion(env, origin, id, str(b.content, "content"), { baseVersion, note: typeof b.note === "string" ? b.note : null }));
      }
    }
    if ((r = /^\/api\/texts\/([A-Za-z0-9]{8})\/versions$/.exec(path)) && m === "GET") {
      return json({ versions: await listVersions(env, r[1]!) });
    }
    if ((r = /^\/api\/texts\/([A-Za-z0-9]{8})\/versions\/(\d{1,9})$/.exec(path)) && m === "GET") {
      const v = await getVersion(env, r[1]!, Number(r[2]));
      return v ? json({ version: v }) : json({ error: "版本不存在" }, 404);
    }
    if ((r = /^\/api\/texts\/([A-Za-z0-9]{8})\/rollback$/.exec(path)) && m === "POST") {
      const v = (await body<{ version: number }>(req)).version;
      if (typeof v !== "number" || !Number.isInteger(v) || v < 1) throw new InputError("version 需要是正整数");
      return json(await rollback(env, origin, r[1]!, v));
    }
    return json({ error: "未找到" }, 404);
  } catch (e) {
    if (e instanceof InputError) return json({ error: e.message }, e.status);
    console.error("api error", e);
    return json({ error: e instanceof Error ? e.message : "服务器错误" }, 500);
  }
}

const PUBLIC_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "X-Content-Type-Options": "nosniff",
  // 公开内容一律沙箱：SVG / 文本里的脚本不会执行
  "Content-Security-Policy": "default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'; sandbox",
};

/** GET /i/:id.:ext —— 图片直链，支持 Range / 条件请求。 */
async function serveImage(req: Request, env: Env, id: string, ext: string): Promise<Response> {
  const row = await getFile(env, id);
  if (!row || row.kind !== "image" || row.ext !== ext.toLowerCase() || !row.r2_key) return new Response("Not Found", { status: 404, headers: PUBLIC_HEADERS });
  const obj = await env.BUCKET.get(row.r2_key, { onlyIf: req.headers, range: req.headers });
  if (!obj) return new Response("Not Found", { status: 404, headers: PUBLIC_HEADERS });
  const headers = new Headers(PUBLIC_HEADERS);
  obj.writeHttpMetadata(headers);
  headers.set("Content-Type", row.mime);
  headers.set("ETag", obj.httpEtag);
  // id 不复用、图片不可替换 → 永久缓存
  headers.set("Cache-Control", "public, max-age=31536000, immutable");
  headers.set("Content-Disposition", `inline; filename*=UTF-8''${encodeURIComponent(row.name)}`);
  headers.set("Accept-Ranges", "bytes");
  if (!("body" in obj)) return new Response(null, { status: 304, headers });
  const range = (obj as R2ObjectBody & { range?: { offset?: number; length?: number } }).range;
  if (range && req.headers.has("Range") && range.offset != null && range.length != null) {
    headers.set("Content-Range", `bytes ${range.offset}-${range.offset + range.length - 1}/${obj.size}`);
    headers.set("Content-Length", String(range.length));
    return new Response(req.method === "HEAD" ? null : obj.body, { status: 206, headers });
  }
  headers.set("Content-Length", String(obj.size));
  return new Response(req.method === "HEAD" ? null : obj.body, { headers });
}

const parseV = (url: URL) => {
  const v = url.searchParams.get("v");
  if (v == null) return undefined;
  const n = Number(v);
  return Number.isInteger(n) && n > 0 ? n : -1;
};

/** GET /t/:id/raw[?v=] —— 原文，一律 text/plain。 */
async function serveRaw(req: Request, env: Env, id: string): Promise<Response> {
  const url = new URL(req.url);
  const want = parseV(url);
  const v = want === -1 ? null : await getVersion(env, id, want);
  if (!v) return new Response("Not Found", { status: 404, headers: PUBLIC_HEADERS });
  const etag = `"${id}-v${v.version}"`;
  const headers = new Headers({
    ...PUBLIC_HEADERS,
    "Content-Type": "text/plain; charset=utf-8",
    ETag: etag,
    // 指定版本内容不变 → 长缓存；最新版每次校验
    "Cache-Control": want ? "public, max-age=31536000, immutable" : "public, no-cache",
  });
  if (url.searchParams.has("download")) {
    const row = await getFile(env, id);
    headers.set("Content-Disposition", `attachment; filename*=UTF-8''${encodeURIComponent(row?.name ?? id + ".txt")}`);
  }
  if (req.headers.get("If-None-Match") === etag) return new Response(null, { status: 304, headers });
  return new Response(req.method === "HEAD" ? null : v.content, { headers });
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    const path = url.pathname;
    const origin = url.origin;
    const readMethod = req.method === "GET" || req.method === "HEAD";
    let r: RegExpExecArray | null;

    if (path === "/auth/login" && req.method === "GET") return login(req, env);
    if (path === "/auth/callback" && req.method === "GET") return callback(req, env);
    if (path === "/auth/logout" && req.method === "POST") return logout(req);
    if (path.startsWith("/api/")) return handleApi(req, env, path, origin);
    if (path === "/health") return json({ ok: true });
    if (path === "/robots.txt") return new Response("User-agent: *\nDisallow: /\n", { headers: { "Content-Type": "text/plain" } });
    // 前端静态资源（正常情况下由 Static Assets 直接响应，不会走到这里）
    if (path.startsWith("/assets/") && env.ASSETS) return env.ASSETS.fetch(req);
    if (!readMethod) return new Response("Method Not Allowed", { status: 405 });

    if ((r = /^\/i\/([A-Za-z0-9]{8})\.([A-Za-z0-9]{1,10})$/.exec(path))) return serveImage(req, env, r[1]!, r[2]!);
    if ((r = /^\/t\/([A-Za-z0-9]{8})\/raw$/.exec(path))) return serveRaw(req, env, r[1]!);

    const user = sessionInfo(await getAdmin(req, env));
    if (path === "/") {
      const err = url.searchParams.get("login_error");
      return renderPage(env, req, { kind: "home", user, loginError: !user && LOGIN_ERRORS.has(err ?? "") ? (err as LoginError) : null, limits: limitsOf(env) });
    }
    if ((r = /^\/edit\/([A-Za-z0-9]{8})$/.exec(path))) {
      return renderPage(env, req, { kind: "edit", user, id: r[1]!, limits: limitsOf(env) });
    }
    if ((r = /^\/t\/([A-Za-z0-9]{8})$/.exec(path)) && ID_RE.test(r[1]!)) {
      const row = await getFile(env, r[1]!);
      const want = parseV(url);
      const shown = row?.kind === "text" && want !== -1 ? await getVersion(env, row.id, want) : null;
      if (row && shown) {
        return renderPage(env, req, { kind: "text", user, file: toView(origin, row), shown, latest: row.current_version ?? shown.version });
      }
    }
    return renderPage(env, req, { kind: "notfound", user }, 404);
  },
} satisfies ExportedHandler<Env>;
