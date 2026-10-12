export function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(n < 10 * 1024 ? 1 : 0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

const pad = (n: number) => String(n).padStart(2, "0");

/** 2026/10/12 23:40 */
export function fmtTime(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** 带秒，用于版本时间戳 */
export function fmtStamp(ms: number): string {
  const d = new Date(ms);
  return `${fmtTime(ms)}:${pad(d.getSeconds())}`;
}

/** 刚刚 / 5 分钟前 / 3 小时前 / 日期 */
export function fmtAgo(ms: number, now = Date.now()): string {
  const s = Math.max(0, Math.round((now - ms) / 1000));
  if (s < 45) return "刚刚";
  if (s < 3600) return `${Math.round(s / 60)} 分钟前`;
  if (s < 86400) return `${Math.round(s / 3600)} 小时前`;
  if (s < 86400 * 7) return `${Math.round(s / 86400)} 天前`;
  return fmtTime(ms);
}
