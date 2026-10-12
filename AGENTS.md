# AGENTS.md — onm-personal

> 给 AI 编程助手的项目说明。`CLAUDE.md` 指向本文件。更多资料在 `.agents/`（rules / prompts / memory / skills）。

## 目标

Rei 的个人图床（类似 sm.ms）+ 带版本历史的纯文本库，部署在 **https://m.rei8t.dev**。
图片上传后得到公开直链；纯文本可在线编辑，每次保存按时间戳生成新版本，可查看、回滚历史版本。
完整产品说明、限制与白名单见 [`docs/PRODUCT.md`](docs/PRODUCT.md)。

## 边界

- 只有站长（Google OAuth 登录且邮箱在 `ADMIN_EMAILS`，默认 reiy.leoz@gmail.com）能上传、编辑、删除；生成的链接公开可访问。
- 未登录点需要登录的操作 → 弹「需要登录」对话框（`web/src/components/Auth.tsx` 的 `requireLogin`），不跳页。
- 不做：多用户、图片处理 / 替换、文件夹标签、统计、非图片二进制文件（详见 PRODUCT.md「明确不做」）。

## 技术栈

- **Worker**：TypeScript + Wrangler，无框架。路由、API、Google OAuth、公开直链，把「页面 + 数据」注入 HTML
- **存储**：R2（图片，key `i/<id>.<ext>`）+ D1（文件元数据 `files`、文本版本 `text_versions`，见 `migrations/`）
- **前端**：React 19 + [Kumo](https://github.com/cloudflare/kumo)（Cloudflare 设计系统）+ Tailwind v4 + Phosphor 图标，Vite 构建到 `public/`，Workers Static Assets 提供
- **语言**：中文 UI；深浅色跟随系统

## 目录

```
src/                     Worker
  index.ts               路由：/、/edit/:id、/t/:id(/raw)、/i/:id.:ext、/auth/*、/api/*
  files.ts               D1/R2 读写：上传、文本版本、回滚、列表、改名、删除
  auth.ts / session.ts   Google OAuth 2.0 + ADMIN_EMAILS 白名单，HMAC 签名 cookie
  html.ts                读 public/index.html 注入 PageData
  env.ts                 绑定与变量、上传上限
  shared/limits.ts       上传限制与类型白名单（Worker 与前端共用）
  shared/types.ts        共用类型（FileView、VersionView、PageData…）
web/                     前端（React + Kumo）
  src/App.tsx            按 PageData.kind 渲染；编辑器懒加载
  src/pages/             HomePage（上传 + 文件管理）、EditorPage（编辑 + 历史）、TextViewPage（公开只读）、NotFoundPage
  src/components/        Auth（登录弹窗）、AppHeader、UploadZone、LinksDialog
migrations/              D1 迁移（只增不改）
worker-inline/           内联静态资源的部署入口（API Token 部署用）
scripts/                 kumo-lint.mjs（设计规则检查）、build-inline-assets.mjs
test/run-tests.ts        node:sqlite 模拟 D1 + 内存 R2，跑全流程
docs/PRODUCT.md          产品说明、限制、边界
.agents/                 skills / rules / prompts / memory
```

## 命令

```bash
pnpm install
cp .dev.vars.example .dev.vars        # 填 Google client 与 SESSION_SECRET；或 AUTH_DISABLED=true 本地免登录
pnpm db:migrate:local                 # 本地 D1 建表
pnpm dev                              # 构建前端 + wrangler dev（http://localhost:8787）
pnpm dev:web                          # 只跑前端（需另开 wrangler dev 提供 API）
pnpm typecheck                        # Worker + 前端类型检查
pnpm test                             # kumo-lint + 全流程测试
pnpm db:migrate:remote                # 线上 D1 迁移
pnpm deploy | pnpm deploy:inline      # 部署（需 Rei 同意）
```

## 设计

全站设计以 **kumo-design** skill 为准（`.agents/skills/kumo-design/SKILL.md`），尽量用 Kumo 组件（Button、Dialog、Table、Tabs、LayerCard、Empty、Banner、Badge、ClipboardText、InputArea、DropdownMenu、Toast…）。要点：正文 14px、标题 sentence case、不用 `font-bold` / `tracking-*`、hover 不做颜色过渡、阴影配 `ring` 不配 `border`、吸顶元素 `border-b`、LayerCard 不嵌套、Dialog 永远挂载用 `open` 控制、只用 `kumo-*` 语义色、不用 `dark:`。`pnpm lint` 自动检查能判断的规则。

## 代码规范

- TypeScript strict；Worker 侧不引入框架，依赖越少越好
- Worker 与前端共用的东西放 `src/shared/`（纯类型 / 纯函数，不依赖 Workers 或 DOM 类型）
- 错误信息面向用户，用中文；API 统一 `{ error }` + 合适的 HTTP 状态码
- 新功能配测试（`test/run-tests.ts`）

## 禁止事项

- 不要提交任何密钥（`.dev.vars`、私钥、token）；不要把密钥写进文档或 memory
- 不要绕过 `getAdmin()` 或同源校验做写操作；不要放宽 `AUTH_DISABLED` 只认 localhost 的判断
- 不要把公开内容以可执行的 HTML / SVG 返回（保持 CSP sandbox、raw 为 text/plain）
- 不要修改已存在的 migration；不要删除文本历史版本（回滚也是新增版本）
- 未经 Rei 同意不部署

## 工作约定

- **每轮对话完成后 commit 并 push**（main 分支，中文提交信息）。提交前 `pnpm typecheck && pnpm test`。
- 改上传限制 / 白名单 → 同步 `docs/PRODUCT.md` 与 README。
- 重要决定记到 `.agents/memory/decisions.md`。
