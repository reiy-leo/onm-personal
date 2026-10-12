# .agents/

给 AI 编程助手（Codex、Claude Code、Cursor、Hark 等）用的项目资料。入口是根目录的 `AGENTS.md`。

| 目录 | 放什么 |
| --- | --- |
| `skills/` | 可复用的 agent skill（`npx skills add …` 安装，例如 `kumo-design`）。`.claude/skills` 是指向这里的软链接 |
| `rules/` | 必须遵守的硬规则（编码规范、安全、禁止事项），每条一个 md |
| `prompts/` | 常用提示词 / 任务模板（如「加一个 API」「发版检查」） |
| `memory/` | 跨对话需要记住的项目决定与背景（决策日志），不放密钥 |
