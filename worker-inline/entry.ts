/**
 * 内联部署入口（wrangler.inline.jsonc）。
 * 用 API Token 部署时 Static Assets 上传接口会 401，所以把 public/ 打进脚本，
 * 用一个假的 ASSETS Fetcher 提供给 src/index.ts，其余逻辑完全复用。
 */
import worker from "../src/index";
import type { Env } from "../src/env";
import { INLINE_ASSETS } from "./assets.generated";

function decode(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

const inlineAssets = {
  async fetch(input: RequestInfo | URL): Promise<Response> {
    const url = new URL(input instanceof Request ? input.url : String(input));
    const a = INLINE_ASSETS[url.pathname];
    if (!a) return new Response("Not Found", { status: 404 });
    return new Response(a.b ? decode(a.d) : a.d, {
      headers: {
        "Content-Type": a.t,
        "Cache-Control": url.pathname.startsWith("/assets/")
          ? "public, max-age=31536000, immutable"
          : "public, max-age=0, must-revalidate",
      },
    });
  },
  connect() { throw new Error("not supported"); },
} as unknown as Fetcher;

export default {
  fetch(req: Request, env: Env) {
    return worker.fetch(req, { ...env, ASSETS: inlineAssets });
  },
};
