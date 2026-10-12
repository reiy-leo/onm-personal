# onm-personal 产品说明

## 一句话

Rei 的个人图床（类似 sm.ms）+ 带版本历史的纯文本库，域名 **m.rei8t.dev**。

## 用户与权限

| 角色 | 能做什么 |
| --- | --- |
| 访客（任何人） | 打开图片直链 `/i/<id>.<ext>`；文本只读页 `/t/<id>`、原文 `/t/<id>/raw`，可带 `?v=N` 看历史版本 |
| 站长（Google 登录且在 `ADMIN_EMAILS`，默认 reiy.leoz@gmail.com） | 上传、新建、编辑、保存版本、回滚、改名、删除，查看文件列表 |

未登录时点任何需要登录的操作（上传、拖拽、粘贴、新建文本、打开编辑器），弹出「需要登录」对话框，不跳页；会话过期时接口返回 401，同样弹框。

## MVP 功能

- 上传图片得直链：点击 / 拖拽 / 粘贴（截图），可多选；单张上传后自动复制直链。链接格式：直链、Markdown、HTML、BBCode
- 上传 / 新建文本：上传白名单内的 UTF-8 文本，或在线新建（不写扩展名默认 `.txt`）
- 在线编辑，保存为新版本：每次保存记录版本号 + 时间戳（毫秒）+ 可选备注；内容没变不新增版本；`Ctrl/⌘+S` 保存；未保存离开页面有提醒
- 版本列表与回滚：编辑器右侧列出全部版本，点开只读预览；回滚 = 把旧版本内容另存为新版本（注明「回滚自 vN」），历史永不删除
- 冲突检测：保存时带上编辑器打开时的版本号，若已在别处更新则拒绝（409）
- 文件列表管理：按更新时间倒序，筛选（全部 / 图片 / 文本）、按文件名或 id 搜索、分页加载、改名（扩展名不变、链接不变）、删除（图片同时删 R2 对象，文本同时删全部版本）

## 上传限制与白名单（默认值，待 Rei 确认）

| 项 | 默认 | 在哪改 |
| --- | --- | --- |
| 图片单文件 | **20 MB** | `wrangler.jsonc` → `vars.MAX_IMAGE_MB`（硬上限 95，受 Worker 请求体 100MB 限制） |
| 文本单文件 | **1024 KB**，必须 UTF-8 | `vars.MAX_TEXT_KB`（硬上限 1800，受 D1 单行 2MB 限制） |
| 图片类型 | png jpg jpeg gif webp avif svg ico bmp | `src/shared/limits.ts` → `IMAGE_TYPES` |
| 文本类型 | txt md markdown json jsonc yaml yml toml ini conf csv tsv log xml html css js mjs ts tsx jsx py sh sql go rs java c h cpp srt vtt | `src/shared/limits.ts` → `TEXT_TYPES` |

类型按扩展名判断。SVG 与所有公开内容都以 `Content-Security-Policy: sandbox` 返回，脚本不会执行；文本 raw 一律 `text/plain`。

## 明确不做（MVP 边界）

- 多用户 / 注册 / 分享给他人编辑
- 图片处理（压缩、缩略图、水印、格式转换）、替换已上传图片
- 文本 diff 对比、Markdown 渲染、语法高亮（以后可做）
- 相册 / 文件夹 / 标签
- 访问统计、防盗链、私密链接 / 过期链接
- 非图片的二进制文件（zip、pdf、视频等）

## 以后可以做

- 版本之间 diff；Markdown 预览；代码高亮
- 图片 EXIF 清理、WebP 转换、缩略图（Cloudflare Images）
- 私密文本（需登录才能看）、链接过期
- 批量删除、标签 / 文件夹
- 防盗链（Referer 白名单）与每日上传配额
