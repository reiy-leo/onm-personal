import type { FileView, ListResponse, VersionMeta, VersionView } from "../../src/shared/types.ts";

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

/** 会话失效（401）时广播，AuthProvider 收到后弹出登录框。 */
export const UNAUTHORIZED_EVENT = "onm:unauthorized";

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const isForm = init.body instanceof FormData;
  const res = await fetch(path, {
    ...init,
    headers: isForm ? init.headers : { "Content-Type": "application/json", ...(init.headers ?? {}) },
  });
  const data = (await res.json().catch(() => ({}))) as { error?: string };
  if (res.status === 401) {
    window.dispatchEvent(new Event(UNAUTHORIZED_EVENT));
    throw new ApiError("需要登录", 401);
  }
  if (!res.ok) throw new ApiError(data.error ?? `请求失败（${res.status}）`, res.status);
  return data as T;
}

const json = (body: unknown) => JSON.stringify(body);

export interface SaveResult { file: FileView; version: VersionMeta; unchanged: boolean }

export const api = {
  list: (p: { kind?: string; q?: string; cursor?: string | null }) => {
    const s = new URLSearchParams();
    if (p.kind && p.kind !== "all") s.set("kind", p.kind);
    if (p.q) s.set("q", p.q);
    if (p.cursor) s.set("cursor", p.cursor);
    return request<ListResponse>(`/api/files?${s}`);
  },
  /** 上传：遇到超时/网关错误/网络中断自动重试 2 次（408 多是上传途中网络或代理卡住）。 */
  upload: async (file: File) => {
    const RETRYABLE = new Set([408, 502, 503, 504, 524]);
    for (let attempt = 0; ; attempt++) {
      const fd = new FormData();
      fd.append("file", file);
      try {
        return await request<{ file: FileView }>("/api/upload", { method: "POST", body: fd });
      } catch (e) {
        const retryable = e instanceof ApiError ? RETRYABLE.has(e.status) : e instanceof TypeError;
        if (!retryable) throw e;
        if (attempt >= 2) {
          const status = e instanceof ApiError ? e.status : 0;
          throw new ApiError(status === 408 ? "上传超时（408）：上传途中网络或代理卡住了，已自动重试 2 次" : `上传失败${status ? `（${status}）` : "：网络中断"}，已自动重试 2 次`, status);
        }
        await new Promise((r) => setTimeout(r, 800 * (attempt + 1)));
      }
    }
  },
  rename: (id: string, name: string) => request<{ file: FileView }>(`/api/files/${id}`, { method: "PATCH", body: json({ name }) }),
  remove: (id: string) => request<{ ok: true }>(`/api/files/${id}`, { method: "DELETE" }),
  createText: (name: string, content: string) => request<{ file: FileView }>("/api/texts", { method: "POST", body: json({ name, content }) }),
  getText: (id: string) => request<{ file: FileView; current: VersionView }>(`/api/texts/${id}`),
  save: (id: string, content: string, baseVersion: number, note?: string) =>
    request<SaveResult>(`/api/texts/${id}`, { method: "PUT", body: json({ content, baseVersion, note }) }),
  versions: (id: string) => request<{ versions: VersionMeta[] }>(`/api/texts/${id}/versions`),
  version: (id: string, v: number) => request<{ version: VersionView }>(`/api/texts/${id}/versions/${v}`),
  rollback: (id: string, version: number) => request<SaveResult>(`/api/texts/${id}/rollback`, { method: "POST", body: json({ version }) }),
};
