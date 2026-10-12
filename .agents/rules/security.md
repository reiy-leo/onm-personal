# 安全规则

- 所有写操作（上传、新建、编辑、回滚、改名、删除）必须经过 `getAdmin()`，只放行 `ADMIN_EMAILS`。
- 写请求必须同源（`Origin` 校验，见 `src/index.ts` 的 `sameOrigin`）。
- 公开内容（`/i/*`、`/t/*/raw`）一律带 `Content-Security-Policy: … sandbox` 与 `nosniff`；raw 永远是 `text/plain`。不要为了“好看”把 HTML/SVG 以可执行方式返回。
- 页面数据注入 HTML 时必须转义 `<`（见 `src/html.ts`），不要改成拼接字符串。
- 密钥（Google client secret、SESSION_SECRET、deploy key、API token）不入库、不写进文档或 memory。本地放 `.dev.vars`，线上用 `wrangler secret put`。
- `AUTH_DISABLED` 只对 localhost 生效，不要放宽这个判断。
