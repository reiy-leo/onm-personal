import type { FileView, ListResponse, VersionMeta, VersionView } from "../../src/shared/types.ts";

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

/** 常见 HTTP 状态码的中文注释：错误提示里统一写成「408 请求超时」这种形式。 */
const STATUS_TEXT: Record<number, string> = {
  400: "请求有误",
  401: "未登录",
  403: "无权限",
  404: "不存在",
  405: "不支持该方法",
  408: "请求超时：上传途中网络或代理卡住",
  409: "版本冲突",
  413: "文件太大",
  415: "不支持的文件类型",
  429: "请求太频繁",
  500: "服务器内部错误",
  502: "网关错误",
  503: "服务暂不可用",
  504: "网关超时",
  524: "源站响应超时",
};
export const statusLabel = (code: number) => (STATUS_TEXT[code] ? `${code} ${STATUS_TEXT[code]}` : String(code));

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
  if (!res.ok) throw new ApiError(data.error ?? `请求失败（${statusLabel(res.status)}）`, res.status);
  return data as T;
}

/** POST /api/upload，带上传进度。网络中断抛 TypeError（与 fetch 一致），HTTP 错误抛 ApiError。 */
function xhrUpload(file: File, onProgress?: (ratio: number) => void): Promise<{ file: FileView }> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const fd = new FormData();
    fd.append("file", file);
    xhr.open("POST", "/api/upload");
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress?.(e.loaded / e.total);
    xhr.onerror = () => reject(new TypeError("network error"));
    xhr.ontimeout = () => reject(new TypeError("timeout"));
    xhr.onload = () => {
      let data: { error?: string; file?: FileView } = {};
      try { data = JSON.parse(xhr.responseText); } catch { /* 非 JSON 响应 */ }
      if (xhr.status === 401) {
        window.dispatchEvent(new Event(UNAUTHORIZED_EVENT));
        return reject(new ApiError("需要登录", 401));
      }
      if (xhr.status < 200 || xhr.status >= 300) return reject(new ApiError(data.error ?? `请求失败（${statusLabel(xhr.status)}）`, xhr.status));
      onProgress?.(1);
      resolve(data as { file: FileView });
    };
    xhr.send(fd);
  });
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
  /**
   * 上传：用 XHR 以便拿到上传进度（onProgress 收到 0–1）。
   * 遇到超时/网关错误/网络中断自动重试 2 次（408 多是上传途中网络或代理卡住），重试时进度从 0 重新开始。
   */
  upload: async (file: File, onProgress?: (ratio: number) => void) => {
    const RETRYABLE = new Set([408, 502, 503, 504, 524]);
    for (let attempt = 0; ; attempt++) {
      try {
        return await xhrUpload(file, onProgress);
      } catch (e) {
        const retryable = e instanceof ApiError ? RETRYABLE.has(e.status) : e instanceof TypeError;
        if (!retryable) throw e;
        if (attempt >= 2) {
          const status = e instanceof ApiError ? e.status : 0;
          throw new ApiError(`上传失败${status ? `（${statusLabel(status)}）` : "（网络中断）"}，已自动重试 2 次`, status);
        }
        onProgress?.(0);
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
