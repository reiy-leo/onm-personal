// 文本只读页（公开）：显示某个版本的内容，可复制 / 看原文 / 下载；站长额外看到「编辑」。
import { useState } from "react";
import { Badge, Banner, Button, LayerCard, LinkButton, Text, useKumoToastManager } from "@cloudflare/kumo";
import { ClockCounterClockwiseIcon, CopyIcon, DownloadSimpleIcon, FileTextIcon, NotePencilIcon } from "@phosphor-icons/react";
import type { FileView, VersionView } from "../../../src/shared/types.ts";
import { AppHeader } from "../components/AppHeader.tsx";
import { useAuth } from "../components/Auth.tsx";
import { fmtBytes, fmtStamp } from "../format.ts";

export function TextViewPage({ file, shown, latest }: { file: FileView; shown: VersionView; latest: number }) {
  const { user } = useAuth();
  const toast = useKumoToastManager();
  const [wrap, setWrap] = useState(true);
  const isLatest = shown.version === latest;
  const raw = isLatest ? file.urls.raw : `${file.urls.raw}?v=${shown.version}`;

  const copy = async () => {
    await navigator.clipboard.writeText(shown.content).catch(() => {});
    toast.add({ title: "内容已复制", variant: "success" });
  };

  return (
    <div className="min-h-screen bg-kumo-canvas">
      <AppHeader>
        {user && (
          <LinkButton href={`/edit/${file.id}`} variant="secondary" icon={NotePencilIcon}>
            编辑
          </LinkButton>
        )}
      </AppHeader>
      <main className="mx-auto grid max-w-5xl gap-4 px-5 py-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="grid min-w-0 gap-1">
            <div className="flex items-center gap-2">
              <span className="text-kumo-subtle"><FileTextIcon size={18} /></span>
              <Text variant="heading" as="h1" truncate>{file.name}</Text>
              <Badge variant={isLatest ? "neutral" : "orange"}>v{shown.version}{isLatest ? "" : ` / 最新 v${latest}`}</Badge>
            </div>
            <Text variant="secondary" size="sm">
              {fmtStamp(shown.createdAt)} · {fmtBytes(shown.size)} · {shown.content.split("\n").length} 行
            </Text>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="ghost" size="sm" onClick={() => setWrap((w) => !w)}>{wrap ? "不换行" : "自动换行"}</Button>
            <Button variant="secondary" size="sm" icon={CopyIcon} onClick={copy}>复制</Button>
            <LinkButton href={raw} variant="secondary" size="sm" target="_blank">原文</LinkButton>
            <LinkButton href={`${raw}${raw.includes("?") ? "&" : "?"}download`} variant="secondary" size="sm" icon={DownloadSimpleIcon}>下载</LinkButton>
          </div>
        </div>

        {!isLatest && (
          <Banner
            variant="secondary"
            icon={<ClockCounterClockwiseIcon />}
            title={`这是历史版本 v${shown.version}`}
            description={<a href={file.urls.view} className="text-kumo-link hover:underline">查看最新版 v{latest}</a>}
          />
        )}

        <LayerCard className="overflow-hidden p-0">
          <pre className={`overflow-x-auto px-5 py-4 font-mono ${wrap ? "whitespace-pre-wrap break-words" : "whitespace-pre"}`}>
            {shown.content || "（空）"}
          </pre>
        </LayerCard>
      </main>
    </div>
  );
}
