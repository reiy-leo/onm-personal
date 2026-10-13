// 「复制链接」弹窗：图片给 raw 直链 / Markdown / HTML / BBCode，文本给只读页 / raw 原文。
import { Button, ClipboardText, Dialog, Text } from "@cloudflare/kumo";
import type { FileView } from "../../../src/shared/types.ts";

export function linkFormats(f: FileView): { label: string; value: string }[] {
  if (f.kind === "image") {
    const alt = f.name.replace(/\.[^.]+$/, "").replace(/[[\]]/g, "");
    return [
      { label: "raw 直链（原图）", value: f.urls.raw },
      { label: "Markdown", value: `![${alt}](${f.urls.view})` },
      { label: "HTML", value: `<img src="${f.urls.view}" alt="${alt.replace(/"/g, "&quot;")}" />` },
      { label: "BBCode", value: `[img]${f.urls.view}[/img]` },
    ];
  }
  return [
    { label: "只读页", value: f.urls.view },
    { label: "raw 原文（始终最新）", value: f.urls.raw },
    ...(f.version ? [{ label: `raw 原文（固定 v${f.version}）`, value: `${f.urls.raw}?v=${f.version}` }] : []),
  ];
}

export function LinksList({ file }: { file: FileView }) {
  return (
    <div className="grid gap-3">
      {linkFormats(file).map((l) => (
        <div key={l.label} className="grid gap-1.5">
          <Text variant="secondary" size="sm">{l.label}</Text>
          <ClipboardText text={l.value} size="base" />
        </div>
      ))}
    </div>
  );
}

export function LinksDialog({ file, open, onOpenChange }: { file: FileView | null; open: boolean; onOpenChange: (o: boolean) => void }) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog size="lg" className="px-6 py-5">
        <div className="grid gap-5">
          <div className="grid gap-1">
            <Dialog.Title className="text-base font-semibold">复制链接</Dialog.Title>
            <Dialog.Description className="truncate text-kumo-subtle">{file?.name ?? ""}</Dialog.Description>
          </div>
          {file?.kind === "image" && (
            <div className="flex max-h-56 justify-center overflow-hidden rounded-lg bg-kumo-recessed">
              <img src={file.urls.view} alt={file.name} className="max-h-56 object-contain" />
            </div>
          )}
          {file && <LinksList file={file} />}
          <div className="flex justify-end">
            <Dialog.Close render={(p) => <Button {...p} variant="secondary">关闭</Button>} />
          </div>
        </div>
      </Dialog>
    </Dialog.Root>
  );
}
