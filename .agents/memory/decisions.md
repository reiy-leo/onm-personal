# 决策日志

## 2026-10-12 初始化
- 图片存 R2（`i/<id>.<ext>`），文本内容与版本存 D1（单行 ≤ 2MB，文本上限默认 1MB）。
- 文本版本只增不改：每次保存一个新版本（版本号 + 毫秒时间戳），内容不变不新增；回滚 = 把旧内容另存为新版本。
- 保存带 `baseVersion` 做冲突检测（409）。
- id 为 8 位随机 base62，不复用；图片直链永久缓存（immutable），所以图片不支持“替换内容”。
- 前端沿用 shortlink-personal 的结构：Worker 注入 PageData，React + Kumo 单页渲染。
- 用 API Token 部署时 Static Assets 上传会 401，提供 `deploy:inline`（静态资源内联进脚本）。
