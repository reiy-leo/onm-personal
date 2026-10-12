# 部署前检查

1. `pnpm typecheck && pnpm test` 通过
2. D1 已创建且 `wrangler.jsonc` 里的 `database_id` 是真实值；`pnpm db:migrate:remote` 已执行
3. R2 bucket `onm-personal` 已创建
4. Secrets 已设置：`SESSION_SECRET`（本项目独立）、`GOOGLE_CLIENT_ID`、`GOOGLE_CLIENT_SECRET`
5. Google Cloud 授权回调含 `https://m.rei8t.dev/auth/callback`
6. 部署：`pnpm deploy`（本地 wrangler）或 `pnpm deploy:inline`（API Token，静态资源内联）
7. 线上验证：未登录点上传弹登录框；登录后上传图片拿到直链；文本保存 / 回滚；raw 与只读页公开可访问
