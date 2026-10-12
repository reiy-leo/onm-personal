// Worker 与前端共用的纯类型（不依赖 Workers / DOM 类型）。
import type { FileKind } from "./limits.ts";

/** 文件列表 / 详情里的一项。时间均为毫秒时间戳。 */
export interface FileView {
  id: string;
  kind: FileKind;
  name: string;
  ext: string;
  mime: string;
  size: number;
  createdAt: number;
  updatedAt: number;
  /** 文本：当前版本号 */
  version?: number;
  /** 公开链接（绝对地址） */
  urls: FileUrls;
}

export interface FileUrls {
  /** 图片直链 / 文本只读页 */
  view: string;
  /** 文本原文（最新版）；图片同直链 */
  raw: string;
}

export interface VersionMeta {
  version: number;
  size: number;
  note: string | null;
  createdAt: number;
}

export interface VersionView extends VersionMeta {
  content: string;
}

export interface ListResponse {
  files: FileView[];
  /** 还有更多时，下一页的游标 */
  nextCursor: string | null;
}

export interface Limits {
  maxImageBytes: number;
  maxTextBytes: number;
}

export interface SessionInfo {
  email: string;
  name?: string;
  picture?: string;
}

export type LoginError = "unconfigured" | "denied" | "state" | "token" | "id_token" | "unverified" | "forbidden";

/** Worker 注入到 HTML 里的页面数据，前端据此渲染对应页面。user 为 null = 未登录（只读访客）。 */
export type PageData =
  | { kind: "home"; user: SessionInfo | null; loginError: LoginError | null; limits: Limits }
  | { kind: "edit"; user: SessionInfo | null; id: string; limits: Limits }
  | {
      kind: "text";
      user: SessionInfo | null;
      file: FileView;
      /** 正在查看的版本（可能是历史版本） */
      shown: VersionView;
      latest: number;
    }
  | { kind: "notfound"; user: SessionInfo | null };
