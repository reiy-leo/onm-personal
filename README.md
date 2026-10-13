# Material Online（原料在线）

> 仓库 / Worker 名：`onm-personal`

Rei 的个人图床 + 带版本历史的纯文本库，跑在单个 Cloudflare Worker 上，域名 **m.rei8t.dev**。

- **图片**：上传（点击 / 拖拽 / 粘贴截图）后得到公开直链 `https://m.rei8t.dev/i/<id>.<ext>`，一键复制直链 / Markdown / HTML / BBCode
- **文本**：上传或在线新建纯文本，在线编辑；每次保存按时间戳生成新版本（保留最近 5 个），可查看、回滚
  - 只读页 `https://m.rei8t.dev/t/<id>`，原文 `…/t/<id>/raw`，历史版本加 `?v=N`
- **权限**：只有站长（Google 登录 + 邮箱白名单）能上传、编辑、删除；链接对所有人公开。未登录点上传等操作会弹出登录框

## 技术栈

Cloudflare Worker（TypeScript）+ R2（图片）+ D1（元数据与文本版本）+ React 19 + [Kumo](https://github.com/cloudflare/kumo) + Tailwind v4 + Vite。目录与约定见 [AGENTS.md](AGENTS.md)，产品细节见 [docs/PRODUCT.md](docs/PRODUCT.md)。

## 默认限制

| 项 | 默认 |
| --- | --- |
| 图片单文件 | 5 MB（`MAX_IMAGE_MB`） |
| 文本单文件 | 1024 KB，UTF-8（`MAX_TEXT_KB`） |
| 图片类型 | png jpg jpeg gif webp avif svg ico bmp |
| 文本类型 | txt md json yaml toml ini csv log xml html css js ts py sh sql go rs … 共 32 种（`src/shared/limits.ts`） |

## 本地开发

```bash
pnpm install
cp .dev.vars.example .dev.vars   # 本地免登录可只写 AUTH_DISABLED=true
pnpm db:migrate:local
pnpm dev                         # http://localhost:8787
pnpm typecheck && pnpm test
```

## 部署

```bash
npx wrangler d1 create onm-personal-db        # 把 database_id 填进 wrangler.jsonc（和 wrangler.inline.jsonc）
npx wrangler r2 bucket create onm-personal
pnpm db:migrate:remote
openssl rand -base64 48 | npx wrangler secret put SESSION_SECRET   # 本项目独立生成
npx wrangler secret put GOOGLE_CLIENT_ID
npx wrangler secret put GOOGLE_CLIENT_SECRET
pnpm deploy            # 或 pnpm deploy:inline（API Token 部署，静态资源内联）
```

Google Cloud 授权回调地址：`https://m.rei8t.dev/auth/callback` 与 `http://localhost:8787/auth/callback`。

## API（需登录）

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/me` | 当前登录状态与上传上限（不需登录） |
| GET | `/api/files?kind=image\|text&q=&cursor=` | 文件列表（按更新时间倒序，游标分页） |
| POST | `/api/upload` | 上传，multipart 字段 `file` |
| PATCH | `/api/files/:id` | 改名 `{ name }`（扩展名不变） |
| DELETE | `/api/files/:id` | 删除（图片连同 R2 对象，文本连同全部版本） |
| POST | `/api/texts` | 新建文本 `{ name, content }` |
| GET | `/api/texts/:id` | 文本信息 + 当前内容 |
| PUT | `/api/texts/:id` | 保存为新版本 `{ content, baseVersion, note? }`，版本冲突返回 409 |
| GET | `/api/texts/:id/versions` | 版本列表 |
| GET | `/api/texts/:id/versions/:v` | 某个版本内容 |
| POST | `/api/texts/:id/rollback` | 回滚 `{ version }`（另存为新版本） |

写请求需同源（`Origin`）。

## License

MIT
