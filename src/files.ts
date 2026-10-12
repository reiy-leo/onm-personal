// 文件与文本版本的存取：元数据和文本内容在 D1，图片二进制在 R2。
import { limitsOf, type Env } from "./env.ts";
import { IMAGE_TYPES, MAX_NAME_LENGTH, TEXT_TYPES, extOf, kindOf, type FileKind } from "./shared/limits.ts";
import type { FileView, ListResponse, VersionMeta, VersionView } from "./shared/types.ts";

export class InputError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

interface FileRow {
  id: string;
  kind: FileKind;
  name: string;
  ext: string;
  mime: string;
  size: number;
  r2_key: string | null;
  current_version: number | null;
  created_at: number;
  updated_at: number;
}

interface VersionRow {
  version: number;
  size: number;
  note: string | null;
  created_at: number;
  content?: string;
}

export const ID_RE = /^[A-Za-z0-9]{8}$/;
const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
const enc = new TextEncoder();

export function newId(): string {
  // 62 * 4 = 248，丢弃 >= 248 的字节，保证均匀
  let out = "";
  while (out.length < 8) {
    for (const b of crypto.getRandomValues(new Uint8Array(16))) {
      if (b < 248 && out.length < 8) out += ALPHABET[b % 62];
    }
  }
  return out;
}

export const byteLength = (s: string) => enc.encode(s).length;

export function urlsOf(origin: string, row: Pick<FileRow, "id" | "kind" | "ext">) {
  if (row.kind === "image") {
    const u = `${origin}/i/${row.id}.${row.ext}`;
    return { view: u, raw: u };
  }
  return { view: `${origin}/t/${row.id}`, raw: `${origin}/t/${row.id}/raw` };
}

export function toView(origin: string, r: FileRow): FileView {
  return {
    id: r.id,
    kind: r.kind,
    name: r.name,
    ext: r.ext,
    mime: r.mime,
    size: r.size,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    ...(r.current_version != null ? { version: r.current_version } : {}),
    urls: urlsOf(origin, r),
  };
}

const toMeta = (r: VersionRow): VersionMeta => ({ version: r.version, size: r.size, note: r.note, createdAt: r.created_at });

/** 清理显示名：去掉路径和控制字符，限长；保留扩展名。 */
export function cleanName(raw: string): string {
  const base = raw.split(/[\\/]/).pop() ?? "";
  // eslint-disable-next-line no-control-regex
  const name = base.replace(/[\u0000-\u001f\u007f]/g, "").trim();
  if (!name) throw new InputError("文件名不能为空");
  if (name.length <= MAX_NAME_LENGTH) return name;
  const ext = extOf(name);
  return name.slice(0, MAX_NAME_LENGTH - ext.length - 1) + (ext ? "." + ext : "");
}

/** 文本内容：必须是合法 UTF-8；去掉 BOM。 */
function decodeText(bytes: ArrayBuffer): string {
  try {
    return new TextDecoder("utf-8", { fatal: true, ignoreBOM: false }).decode(bytes);
  } catch {
    throw new InputError("只支持 UTF-8 编码的纯文本");
  }
}

function checkTextSize(env: Env, content: string): number {
  const size = byteLength(content);
  const max = limitsOf(env).maxTextBytes;
  if (size > max) throw new InputError(`文本超过 ${Math.round(max / 1024)} KB 上限`, 413);
  return size;
}

export async function getFile(env: Env, id: string): Promise<FileRow | null> {
  if (!ID_RE.test(id)) return null;
  return env.DB.prepare("SELECT * FROM files WHERE id = ?").bind(id).first<FileRow>();
}

async function freshId(env: Env): Promise<string> {
  for (let i = 0; i < 5; i++) {
    const id = newId();
    if (!(await env.DB.prepare("SELECT 1 FROM files WHERE id = ?").bind(id).first())) return id;
  }
  throw new Error("无法生成唯一 id");
}

/** 上传一个文件：图片 → R2；文本 → D1 第 1 版。 */
export async function uploadFile(env: Env, origin: string, file: File): Promise<FileView> {
  const name = cleanName(file.name || "untitled");
  const kind = kindOf(name);
  if (!kind) throw new InputError(`不支持的文件类型：${extOf(name) ? "." + extOf(name) : "无扩展名"}`, 415);
  const ext = extOf(name);
  const limits = limitsOf(env);

  if (kind === "text") {
    if (file.size > limits.maxTextBytes) throw new InputError(`文本超过 ${Math.round(limits.maxTextBytes / 1024)} KB 上限`, 413);
    const content = decodeText(await file.arrayBuffer());
    return createText(env, origin, name, content, "上传");
  }

  if (file.size > limits.maxImageBytes) throw new InputError(`图片超过 ${Math.round(limits.maxImageBytes / 1024 / 1024)} MB 上限`, 413);
  if (file.size === 0) throw new InputError("文件是空的");
  const id = await freshId(env);
  const key = `i/${id}.${ext}`;
  const mime = IMAGE_TYPES[ext]!;
  const now = Date.now();
  await env.BUCKET.put(key, file.stream(), {
    httpMetadata: { contentType: mime },
    customMetadata: { name: encodeURIComponent(name) },
  });
  const row: FileRow = { id, kind, name, ext, mime, size: file.size, r2_key: key, current_version: null, created_at: now, updated_at: now };
  try {
    await env.DB.prepare(
      "INSERT INTO files (id, kind, name, ext, mime, size, r2_key, current_version, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, NULL, ?, ?)",
    ).bind(id, kind, name, ext, mime, file.size, key, now, now).run();
  } catch (e) {
    await env.BUCKET.delete(key).catch(() => {});
    throw e;
  }
  return toView(origin, row);
}

/** 新建文本（在线新建或上传）。没有扩展名时补 .txt。 */
export async function createText(env: Env, origin: string, rawName: string, content: string, note = "新建"): Promise<FileView> {
  let name = cleanName(rawName || "untitled.txt");
  if (!extOf(name)) name += ".txt";
  if (kindOf(name) !== "text") throw new InputError(`不支持的文本类型：.${extOf(name)}`, 415);
  const ext = extOf(name);
  const size = checkTextSize(env, content);
  const id = await freshId(env);
  const now = Date.now();
  const mime = TEXT_TYPES[ext]!;
  await env.DB.batch([
    env.DB.prepare(
      "INSERT INTO files (id, kind, name, ext, mime, size, r2_key, current_version, created_at, updated_at) VALUES (?, 'text', ?, ?, ?, ?, NULL, 1, ?, ?)",
    ).bind(id, name, ext, mime, size, now, now),
    env.DB.prepare("INSERT INTO text_versions (file_id, version, content, size, note, created_at) VALUES (?, 1, ?, ?, ?, ?)").bind(id, content, size, note, now),
  ]);
  return toView(origin, { id, kind: "text", name, ext, mime, size, r2_key: null, current_version: 1, created_at: now, updated_at: now });
}

/** 列表：按更新时间倒序，游标 = "<updated_at>_<id>"。 */
export async function listFiles(env: Env, origin: string, opts: { kind?: string | null; q?: string | null; cursor?: string | null; limit?: number }): Promise<ListResponse> {
  const limit = Math.min(Math.max(opts.limit ?? 50, 1), 200);
  const where: string[] = [];
  const args: unknown[] = [];
  if (opts.kind === "image" || opts.kind === "text") {
    where.push("kind = ?");
    args.push(opts.kind);
  }
  const q = opts.q?.trim();
  if (q) {
    where.push("(name LIKE ? ESCAPE '\\' OR id = ?)");
    args.push(`%${q.replace(/[\\%_]/g, (c) => "\\" + c)}%`, q);
  }
  const m = /^(\d+)_([A-Za-z0-9]{8})$/.exec(opts.cursor ?? "");
  if (m) {
    where.push("(updated_at < ? OR (updated_at = ? AND id < ?))");
    args.push(Number(m[1]), Number(m[1]), m[2]);
  }
  const sql = `SELECT * FROM files ${where.length ? "WHERE " + where.join(" AND ") : ""} ORDER BY updated_at DESC, id DESC LIMIT ?`;
  const { results } = await env.DB.prepare(sql).bind(...args, limit + 1).all<FileRow>();
  const rows = results.slice(0, limit);
  const last = rows[rows.length - 1];
  return { files: rows.map((r) => toView(origin, r)), nextCursor: results.length > limit && last ? `${last.updated_at}_${last.id}` : null };
}

export async function renameFile(env: Env, origin: string, id: string, rawName: string): Promise<FileView> {
  const row = await getFile(env, id);
  if (!row) throw new InputError("文件不存在", 404);
  let name = cleanName(rawName);
  // 扩展名决定类型和直链，改名时保持不变
  if (extOf(name) !== row.ext) name = `${name}.${row.ext}`;
  if (name.length > MAX_NAME_LENGTH + 11) throw new InputError("文件名太长");
  const now = Date.now();
  await env.DB.prepare("UPDATE files SET name = ?, updated_at = ? WHERE id = ?").bind(name, now, id).run();
  return toView(origin, { ...row, name, updated_at: now });
}

export async function deleteFile(env: Env, id: string): Promise<boolean> {
  const row = await getFile(env, id);
  if (!row) return false;
  if (row.r2_key) await env.BUCKET.delete(row.r2_key);
  await env.DB.batch([
    env.DB.prepare("DELETE FROM text_versions WHERE file_id = ?").bind(id),
    env.DB.prepare("DELETE FROM files WHERE id = ?").bind(id),
  ]);
  return true;
}

async function requireText(env: Env, id: string): Promise<FileRow> {
  const row = await getFile(env, id);
  if (!row || row.kind !== "text") throw new InputError("文本不存在", 404);
  return row;
}

export async function listVersions(env: Env, id: string): Promise<VersionMeta[]> {
  await requireText(env, id);
  const { results } = await env.DB.prepare(
    "SELECT version, size, note, created_at FROM text_versions WHERE file_id = ? ORDER BY version DESC",
  ).bind(id).all<VersionRow>();
  return results.map(toMeta);
}

/** 取某个版本；version 省略 = 当前版本。 */
export async function getVersion(env: Env, id: string, version?: number): Promise<VersionView | null> {
  const row = await getFile(env, id);
  if (!row || row.kind !== "text") return null;
  const v = version ?? row.current_version ?? 1;
  const r = await env.DB.prepare("SELECT version, size, note, created_at, content FROM text_versions WHERE file_id = ? AND version = ?")
    .bind(id, v).first<VersionRow>();
  return r ? { ...toMeta(r), content: r.content ?? "" } : null;
}

/**
 * 保存为新版本。baseVersion 用于冲突检测：编辑器打开时的版本 ≠ 当前版本 → 409。
 * 内容与当前版本相同则不新增版本，直接返回。
 */
export async function saveVersion(
  env: Env,
  origin: string,
  id: string,
  content: string,
  opts: { baseVersion?: number; note?: string | null } = {},
): Promise<{ file: FileView; version: VersionMeta; unchanged: boolean }> {
  const row = await requireText(env, id);
  const current = row.current_version ?? 0;
  if (opts.baseVersion != null && opts.baseVersion !== current) {
    throw new InputError(`文本已在别处更新到 v${current}，请先查看历史版本再保存`, 409);
  }
  const size = checkTextSize(env, content);
  const cur = await getVersion(env, id, current);
  if (cur && cur.content === content) return { file: toView(origin, row), version: cur, unchanged: true };

  const next = current + 1;
  const now = Math.max(Date.now(), (cur?.createdAt ?? 0) + 1);
  const note = opts.note?.trim().slice(0, 200) || null;
  try {
    await env.DB.batch([
      env.DB.prepare("INSERT INTO text_versions (file_id, version, content, size, note, created_at) VALUES (?, ?, ?, ?, ?, ?)").bind(id, next, content, size, note, now),
      env.DB.prepare("UPDATE files SET current_version = ?, size = ?, updated_at = ? WHERE id = ? AND current_version = ?").bind(next, size, now, id, current),
    ]);
  } catch (e) {
    // 主键冲突 = 并发保存
    if (String(e).includes("UNIQUE") || String(e).includes("PRIMARY")) throw new InputError("保存冲突，请刷新后重试", 409);
    throw e;
  }
  return {
    file: toView(origin, { ...row, current_version: next, size, updated_at: now }),
    version: { version: next, size, note, createdAt: now },
    unchanged: false,
  };
}

/** 回滚：把旧版本内容另存为新版本（历史不删）。 */
export async function rollback(env: Env, origin: string, id: string, version: number) {
  const row = await requireText(env, id);
  const old = await getVersion(env, id, version);
  if (!old) throw new InputError(`版本 v${version} 不存在`, 404);
  if (version === row.current_version) throw new InputError(`v${version} 已经是当前版本`);
  return saveVersion(env, origin, id, old.content, { note: `回滚自 v${version}` });
}
