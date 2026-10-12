// kumo-design 规则的静态检查（.agents/skills/kumo-design/SKILL.md）。能自动判的都在这里，pnpm test 会跑。
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const RULES = [
  { id: "font-weight", re: /\bfont-bold\b/, msg: "不要用 font-bold，标题 font-semibold，行内强调 font-medium" },
  { id: "font-tracking", re: /\btracking-[a-z0-9[\]-]+/, msg: "不要改字距（tracking-*）" },
  { id: "heading-case", re: /\b(uppercase|capitalize)\b/, msg: "标题用 sentence case，不要 uppercase / capitalize" },
  { id: "hover-color-transitions", re: /\btransition-colors\b|\btransition-all\b/, msg: "hover 颜色变化要即时，不要 transition" },
  { id: "shadow-borders", re: /\bborder\b[^"'`]*\bshadow-(sm|md|lg|xl|2xl)\b|\bshadow-(sm|md|lg|xl|2xl)\b[^"'`]*\bborder\b(?!-)/, msg: "带阴影的元素用 ring ring-kumo-line，不要 border" },
  { id: "raw-colors", re: /\b(bg|text|ring|border)-(red|blue|green|gray|slate|zinc|neutral|yellow|orange|purple)-\d{2,3}\b/, msg: "只用 kumo 语义 token，不要原始 Tailwind 颜色" },
  { id: "no-dark-variant", re: /\bdark:/, msg: "不要 dark: 前缀，深浅色由 kumo token 自动处理" },
  { id: "dialog-rendering", re: /&&\s*\(?\s*<Dialog\.Root/, msg: "Dialog 不要条件渲染，用 open 控制" },
  { id: "content-text-size", re: /^(?!.*variant="heading").*<Text[^>]*\bsize="lg"/, msg: "正文 14px；size=lg 只给标题" },
];

const files = [];
(function walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p);
    else if (/\.(tsx?|css|html)$/.test(name)) files.push(p);
  }
})("web");

let bad = 0;
for (const f of files) {
  readFileSync(f, "utf8").split("\n").forEach((line, i) => {
    for (const r of RULES) {
      if (r.re.test(line)) {
        bad++;
        console.error(`${f}:${i + 1}  [${r.id}] ${r.msg}\n    ${line.trim()}`);
      }
    }
  });
}
if (bad) {
  console.error(`\nkumo-lint：${bad} 处违反 kumo-design 规则`);
  process.exit(1);
}
console.log(`✓ kumo-lint：${files.length} 个文件符合 kumo-design 规则`);
