// 用 node:sqlite 模拟 D1、内存 Map 模拟 R2，跑一遍核心流程：
//   node --experimental-strip-types test/run-tests.ts（pnpm test）
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import worker from "../src/index.ts";
import type { Env } from "../src/env.ts";

// ---- 假 D1（只实现用到的 API）----
const sqlite = new DatabaseSync(":memory:");
sqlite.exec(readFileSync(new URL("../migrations/0001_init.sql", import.meta.url), "utf8"));
class Stmt {
  args: unknown[] = [];
  sql: string;
  constructor(sql: string) { this.sql = sql; }
  bind(...a: unknown[]) { this.args = a; return this; }
  private st() { return sqlite.prepare(this.sql); }
  async first<T>() { return (this.st().get(...(this.args as never[])) as T) ?? null; }
  async all<T>() { return { results: this.st().all(...(this.args as never[])).map((r) => ({ ...r })) as T[] }; }
  async run() { this.st().run(...(this.args as never[])); return { success: true }; }
}
const DB = {
  prepare: (sql: string) => new Stmt(sql),
  async batch(stmts: Stmt[]) {
    sqlite.exec("BEGIN");
    try { for (const s of stmts) await s.run(); sqlite.exec("COMMIT"); } catch (e) { sqlite.exec("ROLLBACK"); throw e; }
    return [];
  },
};

// ---- 假 R2 ----
const objects = new Map<string, { data: Uint8Array; type: string }>();
const BUCKET = {
  async put(key: string, value: ReadableStream, opts: { httpMetadata?: { contentType?: string } }) {
    objects.set(key, { data: new Uint8Array(await new Response(value).arrayBuffer()), type: opts.httpMetadata?.contentType ?? "" });
  },
  async get(key: string) {
    const o = objects.get(key);
    if (!o) return null;
    return { body: new Blob([o.data]).stream(), size: o.data.length, httpEtag: `"${key}"`, writeHttpMetadata(h: Headers) { h.set("Content-Type", o.type); } };
  },
  async delete(key: string) { objects.delete(key); },
};

// 假的 Static Assets：只提供前端壳 index.html
const SHELL = "<!doctype html><html><head><title>x</title><!--PAGE_DATA--></head><body><div id=root></div></body></html>";
const ASSETS = { fetch: async (u: string | URL | Request) => new URL(u instanceof Request ? u.url : u).pathname === "/index.html" ? new Response(SHELL) : new Response("nf", { status: 404 }) };
const pageOf = async (r: Response) => JSON.parse((await r.text()).match(/<script id="page-data" type="application\/json">(.*?)<\/script>/)![1]!);

const L = "http://localhost:8787";
const admin = { DB, BUCKET, ASSETS, AUTH_DISABLED: "true", ADMIN_EMAILS: "reiy.leoz@gmail.com", MAX_TEXT_KB: "1" } as unknown as Env;
const guest = { ...admin, AUTH_DISABLED: "false", SESSION_SECRET: "x".repeat(32) } as unknown as Env;

const call = (env: Env, path: string, init: RequestInit = {}) =>
  worker.fetch(new Request(L + path, { ...init, headers: { Origin: L, ...(init.headers ?? {}) } }) as never, env);
const api = (path: string, method = "GET", body?: unknown, env: Env = admin) =>
  call(env, path, { method, headers: { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
const upload = (name: string, data: BlobPart, env: Env = admin) => {
  const fd = new FormData();
  fd.append("file", new File([data], name));
  return call(env, "/api/upload", { method: "POST", body: fd });
};

// ---- 权限 ----
assert.equal((await api("/api/files", "GET", undefined, guest)).status, 401, "访客不能列文件");
assert.equal((await upload("a.png", "x", guest)).status, 401, "访客不能上传");
assert.equal((await api("/api/texts", "POST", { name: "a.txt", content: "x" }, guest)).status, 401);
const me = await (await api("/api/me", "GET", undefined, guest)).json() as { user: unknown; limits: { maxTextBytes: number } };
assert.equal(me.user, null);
assert.equal(me.limits.maxTextBytes, 1024);
// 跨站写请求被拒
assert.equal((await call(admin, "/api/texts", { method: "POST", headers: { Origin: "https://evil.example", "Content-Type": "application/json" }, body: "{}" })).status, 403);

// ---- 图片上传与直链 ----
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);
let res = await upload("截图 1.PNG", PNG);
assert.equal(res.status, 201);
const img = (await res.json() as { file: { id: string; urls: { view: string }; ext: string; name: string } }).file;
assert.equal(img.ext, "png");
assert.equal(img.urls.view, `${L}/i/${img.id}.png`);
res = await call(guest, `/i/${img.id}.png`);
assert.equal(res.status, 200, "直链公开可访问");
assert.equal(res.headers.get("Content-Type"), "image/png");
assert.match(res.headers.get("Content-Security-Policy") ?? "", /sandbox/);
assert.deepEqual(new Uint8Array(await res.arrayBuffer()), PNG);
assert.equal((await call(guest, `/i/${img.id}.jpg`)).status, 404, "扩展名不符 404");
assert.equal((await upload("evil.exe", "MZ")).status, 415, "白名单外拒绝");

// ---- 文本：上传、新建、版本 ----
res = await upload("notes.md", "# 你好\n");
assert.equal(res.status, 201);
const md = (await res.json() as { file: { id: string; version: number } }).file;
assert.equal(md.version, 1);
assert.equal((await upload("bad.txt", new Uint8Array([0xff, 0xfe, 0xfd]))).status, 400, "非 UTF-8 拒绝");
assert.equal((await upload("big.txt", "a".repeat(2000))).status, 413, "超过文本上限");

res = await api("/api/texts", "POST", { name: "草稿", content: "v1" });
assert.equal(res.status, 201);
const t = (await res.json() as { file: { id: string; name: string } }).file;
assert.equal(t.name, "草稿.txt", "无扩展名补 .txt");

res = await api(`/api/texts/${t.id}`, "PUT", { content: "v2", baseVersion: 1 });
assert.equal(res.status, 200);
assert.equal((await res.json() as { version: { version: number } }).version.version, 2);
res = await api(`/api/texts/${t.id}`, "PUT", { content: "v2", baseVersion: 2 });
assert.equal((await res.json() as { unchanged: boolean }).unchanged, true, "内容不变不新增版本");
assert.equal((await api(`/api/texts/${t.id}`, "PUT", { content: "stale", baseVersion: 1 })).status, 409, "旧版本基础上保存 → 冲突");
await api(`/api/texts/${t.id}`, "PUT", { content: "v3", baseVersion: 2, note: "第三版" });

let versions = (await (await api(`/api/texts/${t.id}/versions`)).json() as { versions: { version: number; note: string | null; createdAt: number }[] }).versions;
assert.deepEqual(versions.map((v) => v.version), [3, 2, 1]);
assert.equal(versions[0]!.note, "第三版");
assert.ok(versions[0]!.createdAt > versions[1]!.createdAt, "按时间戳递增");

res = await api(`/api/texts/${t.id}/rollback`, "POST", { version: 1 });
assert.equal(res.status, 200);
versions = (await (await api(`/api/texts/${t.id}/versions`)).json() as typeof versions extends infer V ? { versions: V } : never).versions as typeof versions;
assert.equal(versions[0]!.version, 4);
assert.equal(versions[0]!.note, "回滚自 v1");
assert.equal((await api(`/api/texts/${t.id}/rollback`, "POST", { version: 4 })).status, 400, "回滚到当前版本无意义");

// ---- 公开只读页与 raw ----
res = await call(guest, `/t/${t.id}/raw`);
assert.equal(res.status, 200);
assert.equal(await res.text(), "v1", "raw 默认最新版（回滚后 = v1 内容）");
assert.match(res.headers.get("Content-Type")!, /^text\/plain/);
assert.equal(await (await call(guest, `/t/${t.id}/raw?v=3`)).text(), "v3");
assert.equal((await call(guest, `/t/${t.id}/raw?v=99`)).status, 404);
let page = await pageOf(await call(guest, `/t/${t.id}?v=2`));
assert.equal(page.kind, "text");
assert.equal(page.user, null);
assert.equal(page.shown.content, "v2");
assert.equal(page.latest, 4);
// </script> 注入防护
const x = (await (await api("/api/texts", "POST", { name: "x.html", content: "</script><script>alert(1)</script>" })).json() as { file: { id: string } }).file;
const html = await (await call(guest, `/t/${x.id}`)).text();
assert.ok(!html.includes("</script><script>alert"), "页面数据里的 </script> 被转义");

// ---- 列表、搜索、分页、改名、删除 ----
let list = await (await api("/api/files")).json() as { files: { id: string; kind: string }[]; nextCursor: string | null };
assert.equal(list.files.length, 4);
assert.equal(list.files[0]!.id, x.id, "按更新时间倒序");
list = await (await api("/api/files?kind=image")).json() as typeof list;
assert.deepEqual(list.files.map((f) => f.id), [img.id]);
list = await (await api(`/api/files?q=${encodeURIComponent("草稿")}`)).json() as typeof list;
assert.deepEqual(list.files.map((f) => f.id), [t.id]);
list = await (await api("/api/files?limit=3")).json() as typeof list;
assert.equal(list.files.length, 3);
assert.ok(list.nextCursor);
const page2 = await (await api(`/api/files?limit=3&cursor=${list.nextCursor}`)).json() as typeof list;
assert.equal(page2.files.length, 1);
assert.equal(page2.nextCursor, null);

res = await api(`/api/files/${img.id}`, "PATCH", { name: "封面" });
assert.equal((await res.json() as { file: { name: string } }).file.name, "封面.png", "改名保留扩展名");

assert.equal((await api(`/api/files/${img.id}`, "DELETE")).status, 200);
assert.equal(objects.size, 0, "R2 对象一并删除");
assert.equal((await call(guest, `/i/${img.id}.png`)).status, 404);
assert.equal((await api(`/api/files/${t.id}`, "DELETE")).status, 200);
assert.equal((sqlite.prepare("SELECT COUNT(*) AS n FROM text_versions WHERE file_id = ?").get(t.id) as { n: number }).n, 0, "版本一并删除");

// ---- 页面 ----
page = await pageOf(await call(guest, "/?login_error=forbidden"));
assert.equal(page.kind, "home");
assert.equal(page.loginError, "forbidden");
page = await pageOf(await call(admin, `/edit/${md.id}`));
assert.equal(page.kind, "edit");
assert.equal(page.user.email, "dev@localhost");
assert.equal((await call(guest, "/t/zzzzzzzz")).status, 404);

console.log("✓ 全部测试通过");
