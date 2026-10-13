import { DEFAULT_MAX_IMAGE_MB, DEFAULT_MAX_TEXT_KB } from "./shared/limits.ts";
import type { Limits } from "./shared/types.ts";

export interface Env {
  /** D1：文件元数据 + 文本版本（migrations/）。 */
  DB: D1Database;
  /** R2：图片二进制。key = `i/<id>.<ext>` */
  BUCKET: R2Bucket;
  /** Workers Static Assets：web/ 构建出的前端（public/）。 */
  ASSETS?: Fetcher;

  // secrets
  SESSION_SECRET?: string;
  /** Google OAuth 2.0 Web client（Google Cloud Console → Credentials）。 */
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;

  // vars
  /** 允许上传/编辑/删除的 Google 邮箱，逗号分隔。 */
  ADMIN_EMAILS?: string;
  /** 图片单文件上限（MB），默认 5。 */
  MAX_IMAGE_MB?: string;
  /** 文本单文件上限（KB），默认 1024。 */
  MAX_TEXT_KB?: string;
  /** 可选，默认 <origin>/auth/callback，必须与 Google 授权回调地址一致。 */
  OAUTH_REDIRECT_URI?: string;
  /** "true" = 跳过登录（假用户）。只对 localhost 生效，仅供本地开发。 */
  AUTH_DISABLED?: string;
}

/** AUTH_DISABLED 只对 localhost 请求生效，线上永远不会因为误配而敞开。 */
export const isAuthDisabled = (env: Env, req: Request) => {
  if ((env.AUTH_DISABLED ?? "").trim().toLowerCase() !== "true") return false;
  const host = new URL(req.url).hostname;
  return host === "localhost" || host === "127.0.0.1" || host === "[::1]";
};

export const googleConfigured = (env: Env) => Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET && env.SESSION_SECRET);

export const adminEmails = (env: Env): string[] =>
  (env.ADMIN_EMAILS ?? "").split(",").map((e) => e.trim().toLowerCase()).filter(Boolean);

const num = (v: string | undefined, d: number) => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : d;
};

export const limitsOf = (env: Env): Limits => ({
  // Worker 请求体上限 100MB（免费/Pro），留余量
  maxImageBytes: Math.min(num(env.MAX_IMAGE_MB, DEFAULT_MAX_IMAGE_MB), 95) * 1024 * 1024,
  // D1 单行上限 2MB，留余量
  maxTextBytes: Math.min(num(env.MAX_TEXT_KB, DEFAULT_MAX_TEXT_KB), 1800) * 1024,
});
