// 文本编辑器：左侧编辑，右侧版本历史（按时间戳）。点历史版本 → 只读预览，可回滚（回滚 = 另存为新版本）。
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Badge,
  Banner,
  Button,
  Dialog,
  Empty,
  Input,
  InputArea,
  Loader,
  Text,
  useKumoToastManager,
} from "@cloudflare/kumo";
import {
  ArrowCounterClockwiseIcon,
  ArrowLeftIcon,
  ArrowSquareOutIcon,
  ClockCounterClockwiseIcon,
  FileXIcon,
  FloppyDiskIcon,
  CopyIcon,
  LockKeyIcon,
} from "@phosphor-icons/react";
import type { FileView, VersionMeta, VersionView } from "../../../src/shared/types.ts";
import { api, ApiError } from "../api.ts";
import { AppHeader } from "../components/AppHeader.tsx";
import { useAuth } from "../components/Auth.tsx";
import { fmtAgo, fmtBytes, fmtStamp } from "../format.ts";

const byteLen = (s: string) => new TextEncoder().encode(s).length;

export function EditorPage({ id }: { id: string }) {
  const { user, requireLogin } = useAuth();
  const toast = useKumoToastManager();

  const [file, setFile] = useState<FileView | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saved, setSaved] = useState("");
  const [content, setContent] = useState("");
  const [baseVersion, setBaseVersion] = useState(0);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  const [versions, setVersions] = useState<VersionMeta[] | null>(null);
  const [historyOpen, setHistoryOpen] = useState(() => window.matchMedia("(min-width: 1024px)").matches);
  const [preview, setPreview] = useState<VersionView | null>(null);
  const [previewLoading, setPreviewLoading] = useState<number | null>(null);
  const [rollbackOpen, setRollbackOpen] = useState(false);
  const [rollingBack, setRollingBack] = useState(false);

  const dirty = file !== null && content !== saved;

  const loadVersions = useCallback(async () => {
    try {
      setVersions((await api.versions(id)).versions);
    } catch {
      /* 列表失败不影响编辑 */
    }
  }, [id]);

  useEffect(() => {
    if (!user) {
      requireLogin("编辑文本需要先登录。");
      return;
    }
    (async () => {
      try {
        const d = await api.getText(id);
        setFile(d.file);
        setSaved(d.current.content);
        setContent(d.current.content);
        setBaseVersion(d.current.version);
        void loadVersions();
      } catch (e) {
        if (e instanceof ApiError && e.status === 404) setNotFound(true);
        else if (!(e instanceof ApiError && e.status === 401)) setLoadError(e instanceof Error ? e.message : String(e));
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, user]);

  // 有未保存修改时离开页面提醒
  useEffect(() => {
    if (!dirty) return;
    const h = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [dirty]);

  const save = useCallback(async () => {
    if (!file || saving || !dirty) return;
    setSaving(true);
    try {
      const r = await api.save(id, content, baseVersion, note);
      setFile(r.file);
      setSaved(content);
      setBaseVersion(r.version.version);
      setNote("");
      toast.add({ title: r.unchanged ? "内容没有变化" : `已保存为 v${r.version.version}`, description: fmtStamp(r.version.createdAt), variant: "success" });
      void loadVersions();
    } catch (e) {
      toast.add({ title: "保存失败", description: e instanceof Error ? e.message : String(e), variant: "error" });
    } finally {
      setSaving(false);
    }
  }, [file, saving, dirty, id, content, baseVersion, note, toast, loadVersions]);

  // Ctrl/Cmd + S 保存
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        void save();
      }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [save]);

  async function openVersion(v: number) {
    if (v === baseVersion && !dirty) {
      setPreview(null);
      return;
    }
    setPreviewLoading(v);
    try {
      setPreview((await api.version(id, v)).version);
    } catch (e) {
      toast.add({ title: "读取版本失败", description: e instanceof Error ? e.message : String(e), variant: "error" });
    } finally {
      setPreviewLoading(null);
    }
  }

  async function confirmRollback() {
    if (!preview) return;
    setRollingBack(true);
    try {
      const r = await api.rollback(id, preview.version);
      setFile(r.file);
      setSaved(preview.content);
      setContent(preview.content);
      setBaseVersion(r.version.version);
      setPreview(null);
      setRollbackOpen(false);
      toast.add({ title: `已回滚，生成 v${r.version.version}`, description: `内容来自 v${preview.version}`, variant: "success" });
      void loadVersions();
    } catch (e) {
      toast.add({ title: "回滚失败", description: e instanceof Error ? e.message : String(e), variant: "error" });
    } finally {
      setRollingBack(false);
    }
  }

  const size = useMemo(() => byteLen(content), [content]);

  if (!user) {
    return (
      <Shell>
        <Empty
          icon={<span className="text-kumo-inactive"><LockKeyIcon size={48} /></span>}
          title="需要登录"
          description="编辑文本和查看历史版本只对站长开放。"
          contents={<Button variant="primary" onClick={() => requireLogin("编辑文本需要先登录。")}>登录</Button>}
        />
      </Shell>
    );
  }
  if (notFound) {
    return (
      <Shell>
        <Empty icon={<span className="text-kumo-inactive"><FileXIcon size={48} /></span>} title="文本不存在" description="可能已经被删除。" contents={<Button onClick={() => (location.href = "/")}>回到首页</Button>} />
      </Shell>
    );
  }
  if (loadError) return <Shell><Banner variant="error" title="加载失败" description={loadError} /></Shell>;
  if (!file) return <Shell><Loader size={24} /></Shell>;

  return (
    <div className="flex h-screen flex-col bg-kumo-canvas">
      <AppHeader wide>
        {file && (
          <Button
            variant="ghost"
            icon={CopyIcon}
            className="hidden sm:inline-flex"
            onClick={async () => {
              await navigator.clipboard.writeText(file.urls.raw).catch(() => {});
              toast.add({ title: "已复制 raw 链接", description: file.urls.raw, variant: "success" });
            }}
          >
            复制 raw 链接
          </Button>
        )}
        <Button variant={historyOpen ? "secondary" : "ghost"} icon={ClockCounterClockwiseIcon} onClick={() => setHistoryOpen((o) => !o)}>
          <span className="hidden sm:inline">历史版本</span>
        </Button>
        <Button variant="primary" icon={FloppyDiskIcon} loading={saving} disabled={!dirty || preview !== null} onClick={save}>
          保存
        </Button>
      </AppHeader>

      <div className="flex min-h-0 flex-1">
        <main className="flex min-w-0 flex-1 flex-col gap-3 px-5 py-4">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
            <a href="/" className="text-kumo-subtle hover:text-kumo-default" aria-label="返回首页"><ArrowLeftIcon size={16} /></a>
            <Text variant="heading" as="h1" truncate>{file.name}</Text>
            <Badge variant="neutral">v{baseVersion}</Badge>
            {dirty ? <Badge variant="orange">未保存</Badge> : <Text variant="secondary" size="sm">已保存 · {fmtAgo(file.updatedAt)}</Text>}
            <a href={file.urls.view} target="_blank" rel="noopener" className="ml-auto inline-flex items-center gap-1 text-kumo-link hover:underline">
              只读页 <ArrowSquareOutIcon size={14} />
            </a>
          </div>

          {preview ? (
            <div className="flex min-h-0 flex-1 flex-col gap-3">
              <Banner
                variant="secondary"
                icon={<ClockCounterClockwiseIcon />}
                title={`正在查看 v${preview.version}（只读）`}
                description={`${fmtStamp(preview.createdAt)} · ${fmtBytes(preview.size)}${preview.note ? ` · ${preview.note}` : ""}`}
              />
              <pre className="min-h-0 flex-1 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-kumo-recessed px-4 py-3 font-mono ring ring-kumo-line">{preview.content || "（空）"}</pre>
              <div className="flex flex-wrap justify-end gap-2">
                <Button variant="secondary" onClick={() => setPreview(null)}>返回编辑</Button>
                <Button variant="primary" icon={ArrowCounterClockwiseIcon} disabled={preview.version === baseVersion} onClick={() => setRollbackOpen(true)}>
                  回滚到此版本
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex min-h-0 flex-1 flex-col gap-3">
              <InputArea
                aria-label="文本内容"
                value={content}
                onValueChange={setContent}
                spellCheck={false}
                className="min-h-0 w-full flex-1 resize-none font-mono"
              />
              <div className="flex flex-wrap items-center gap-3">
                <div className="min-w-0 flex-1 sm:max-w-sm">
                  <Input aria-label="版本备注" placeholder="版本备注（可选）" value={note} onChange={(e) => setNote(e.target.value)} />
                </div>
                <Text variant="secondary" size="sm">
                  {content.split("\n").length} 行 · {fmtBytes(size)} · Ctrl/⌘ + S 保存
                </Text>
              </div>
            </div>
          )}
        </main>

        {historyOpen && (
          <aside className="fixed bottom-0 right-0 top-14 z-20 flex w-80 max-w-[85vw] shrink-0 flex-col border-l border-kumo-line bg-kumo-base md:static">
            <div className="flex items-center justify-between border-b border-kumo-line px-4 py-3">
              <Text variant="heading" as="h2">历史版本</Text>
              <Text variant="secondary" size="sm">{versions ? `${versions.length} 个` : ""}</Text>
            </div>
            <ul className="min-h-0 flex-1 overflow-y-auto py-1">
              {!versions && <li className="flex justify-center py-6"><Loader size={16} /></li>}
              {versions?.map((v) => {
                const active = preview ? preview.version === v.version : v.version === baseVersion;
                return (
                  <li key={v.version}>
                    <button
                      type="button"
                      onClick={() => {
                        void openVersion(v.version);
                        if (!window.matchMedia("(min-width: 768px)").matches) setHistoryOpen(false);
                      }}
                      className={`grid w-full gap-0.5 px-4 py-2.5 text-left hover:bg-kumo-tint ${active ? "bg-kumo-tint" : ""}`}
                    >
                      <span className="flex items-center gap-2">
                        <Text bold as="span">v{v.version}</Text>
                        {v.version === baseVersion && <Badge variant="green">当前</Badge>}
                        {previewLoading === v.version && <Loader size={12} />}
                        <span className="ml-auto"><Text variant="secondary" size="xs" as="span">{fmtBytes(v.size)}</Text></span>
                      </span>
                      <Text variant="mono-secondary" as="span">{fmtStamp(v.createdAt)}</Text>
                      {v.note && <Text variant="secondary" size="sm" as="span" truncate>{v.note}</Text>}
                    </button>
                  </li>
                );
              })}
            </ul>
          </aside>
        )}
      </div>


      <Dialog.Root open={rollbackOpen} onOpenChange={setRollbackOpen}>
        <Dialog size="base" className="px-6 py-5">
          <div className="grid gap-4">
            <div className="grid gap-1.5">
              <Dialog.Title className="text-base font-semibold">回滚到 v{preview?.version}？</Dialog.Title>
              <Dialog.Description className="text-kumo-subtle">
                会把 v{preview?.version} 的内容另存为新版本 v{baseVersion + 1}，最多保留最近 5 个版本，最早的会被清理。
                {dirty ? "编辑器里未保存的修改会被丢弃。" : ""}
              </Dialog.Description>
            </div>
            <div className="flex justify-end gap-2">
              <Dialog.Close render={(p) => <Button {...p} variant="secondary">取消</Button>} />
              <Button variant="primary" loading={rollingBack} onClick={confirmRollback}>回滚</Button>
            </div>
          </div>
        </Dialog>
      </Dialog.Root>
    </div>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-kumo-canvas">
      <AppHeader />
      <main className="mx-auto flex max-w-xl justify-center px-5 py-16">{children}</main>
    </div>
  );
}
