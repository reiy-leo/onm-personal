// 上传限制与文件类型白名单（Worker 与前端共用）。改这里 = 改全站规则，记得同步 docs/PRODUCT.md。

/** 图片：扩展名 → MIME。SVG 以沙箱 CSP 返回，防止脚本执行。 */
export const IMAGE_TYPES: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  avif: "image/avif",
  svg: "image/svg+xml",
  ico: "image/x-icon",
  bmp: "image/bmp",
};

/** 纯文本：扩展名 → 在线查看/raw 时的 MIME。raw 一律按 text/plain 返回（防 XSS），这里只用于记录。 */
export const TEXT_TYPES: Record<string, string> = {
  txt: "text/plain",
  md: "text/markdown",
  markdown: "text/markdown",
  json: "application/json",
  jsonc: "application/json",
  yaml: "text/yaml",
  yml: "text/yaml",
  toml: "text/plain",
  ini: "text/plain",
  conf: "text/plain",
  csv: "text/csv",
  tsv: "text/tab-separated-values",
  log: "text/plain",
  xml: "application/xml",
  html: "text/html",
  css: "text/css",
  js: "text/javascript",
  mjs: "text/javascript",
  ts: "text/plain",
  tsx: "text/plain",
  jsx: "text/plain",
  py: "text/x-python",
  sh: "text/x-shellscript",
  sql: "text/plain",
  go: "text/plain",
  rs: "text/plain",
  java: "text/plain",
  c: "text/plain",
  h: "text/plain",
  cpp: "text/plain",
  srt: "text/plain",
  vtt: "text/vtt",
};

/** 默认上限（可用 wrangler vars MAX_IMAGE_MB / MAX_TEXT_KB 覆盖）。 */
export const DEFAULT_MAX_IMAGE_MB = 20;
export const DEFAULT_MAX_TEXT_KB = 1024;
/** 每个文本最多保留的版本数没有上限；单次列表最多返回的版本数。 */
export const MAX_NAME_LENGTH = 200;

export const extOf = (name: string) => {
  const m = /\.([A-Za-z0-9]{1,10})$/.exec(name.trim());
  return m ? m[1]!.toLowerCase() : "";
};

export type FileKind = "image" | "text";

/** 按扩展名判断类型；不在白名单返回 null。 */
export function kindOf(name: string): FileKind | null {
  const ext = extOf(name);
  if (ext in IMAGE_TYPES) return "image";
  if (ext in TEXT_TYPES) return "text";
  return null;
}

export const ACCEPT_ATTR = [...Object.keys(IMAGE_TYPES), ...Object.keys(TEXT_TYPES)].map((e) => "." + e).join(",");
