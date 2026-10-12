# 工作约定

- **每轮对话完成后 commit 并 push**（main 分支，提交信息用中文，说清改了什么）。
- 提交前跑 `pnpm typecheck && pnpm test`，都过了再推。
- 改了上传限制 / 白名单（`src/shared/limits.ts`）要同步 `docs/PRODUCT.md` 和 README。
- 改了表结构：新增 `migrations/000N_xxx.sql`，不要改已有迁移。
- 部署需要 Rei 明确同意。
