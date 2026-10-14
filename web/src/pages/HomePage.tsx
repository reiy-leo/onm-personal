// 首页：上传区 + 文件管理（列表 / 筛选 / 搜索 / 改名 / 删除）。
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Badge,
  Banner,
  Button,
  Dialog,
  DropdownMenu,
  Empty,
  Input,
  InputArea,
  LayerCard,
  Loader,
  Table,
  Tabs,
  Text,
  Tooltip,
  useKumoToastManager,
} from "@cloudflare/kumo";
import {
  ArrowSquareOutIcon,
  CopyIcon,
  DotsThreeIcon,
  FileTextIcon,
  FolderOpenIcon,
  GoogleLogoIcon,
  MagnifyingGlassIcon,
  NotePencilIcon,
  PencilSimpleIcon,
  PlusIcon,
  TrashIcon,
  WarningCircleIcon,
  XIcon,
} from "@phosphor-icons/react";
import type { FileView, Limits, LoginError } from "../../../src/shared/types.ts";
import { api } from "../api.ts";
import { useAuth } from "../components/Auth.tsx";
import { AppHeader } from "../components/AppHeader.tsx";
import { UploadZone, type UploadProgress } from "../components/UploadZone.tsx";
import { fmtAgo, fmtBytes, fmtTime } from "../format.ts";

const LOGIN_ERRORS: Record<LoginError, string> = {
  unconfigured: "Google 登录尚未配置：缺少 GOOGLE_CLIENT_ID、GOOGLE_CLIENT_SECRET 或 SESSION_SECRET。",
  denied: "你取消了 Google 授权。",
  state: "登录状态已过期，请重新登录。",
  token: "向 Google 换取凭证失败，请重试。",
  id_token: "Google 返回的身份信息无效，请重试。",
  unverified: "这个 Google 账号的邮箱尚未验证。",
  forbidden: "这个 Google 账号没有管理权限。",
};


function Thumb({ f }: { f: FileView }) {
  return f.kind === "image" ? (
    <img src={f.urls.view} alt="" loading="lazy" className="size-10 shrink-0 rounded-md bg-kumo-recessed object-cover" />
  ) : (
    <span className="flex size-10 shrink-0 items-center justify-center rounded-md bg-kumo-recessed text-kumo-subtle">
      <FileTextIcon size={20} />
    </span>
  );
}

/** raw 链接的中文名：图片叫「原图链接」，文本叫「原文链接」（最新版纯文本）。 */
const rawLabel = (f: FileView) => (f.kind === "image" ? "原图链接" : "原文链接");

const copyText = async (s: string) => {
  await navigator.clipboard.writeText(s).catch(() => {});
};

export function HomePage({ limits, loginError }: { limits: Limits; loginError: LoginError | null }) {
  const { user, requireLogin } = useAuth();
  const toast = useKumoToastManager();

  // ---- 登录错误：只显示一次。进页面就把 ?login_error 从地址栏抹掉（刷新/登录回跳都不会再带上），
  //      点关闭后不再显示；已登录时不显示。----
  const [shownError, setShownError] = useState<LoginError | null>(loginError);
  useEffect(() => {
    const url = new URL(location.href);
    if (!url.searchParams.has("login_error")) return;
    url.searchParams.delete("login_error");
    history.replaceState(history.state, "", url.pathname + url.search + url.hash);
  }, []);

  // ---- 上传 ----
  const [progress, setProgress] = useState<UploadProgress[]>([]);
  const seq = useRef(0);

  // ---- 列表 ----
  const [kind, setKind] = useState("all");
  const [query, setQuery] = useState("");
  const [files, setFiles] = useState<FileView[] | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  // ---- 弹窗（始终挂载，用 open 控制）----
  const [renaming, setRenaming] = useState<FileView | null>(null);
  const [renameOpen, setRenameOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [deleting, setDeleting] = useState<FileView | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [newOpen, setNewOpen] = useState(false);
  const [draftName, setDraftName] = useState("");
  const [draftContent, setDraftContent] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(
    async (more = false) => {
      if (!user) return;
      try {
        if (more) setLoadingMore(true);
        const d = await api.list({ kind, q: query.trim(), cursor: more ? cursor : null });
        setFiles((prev) => (more && prev ? [...prev, ...d.files] : d.files));
        setCursor(d.nextCursor);
        setLoadError(null);
      } catch (e) {
        setLoadError(e instanceof Error ? e.message : String(e));
      } finally {
        setLoadingMore(false);
      }
    },
    [user, kind, query, cursor],
  );

  // 筛选 / 搜索变化：防抖后重新加载
  useEffect(() => {
    if (!user) return;
    const t = setTimeout(() => void load(false), query ? 250 : 0);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, kind, query]);

  const upsert = (f: FileView) => setFiles((prev) => (prev ? [f, ...prev.filter((x) => x.id !== f.id)] : prev));

  // 上传/新建进度显示在上传区底部：完成变绿、失败变红，稍等后消失；成功的文件直接出现在列表顶部。
  const patch = (key: string, p: Partial<UploadProgress>) => setProgress((prev) => prev.map((x) => (x.key === key ? { ...x, ...p } : x)));
  const dismiss = (key: string, ms: number) => setTimeout(() => setProgress((prev) => prev.filter((x) => x.key !== key)), ms);
  const track = (name: string): string => {
    const key = `u${++seq.current}`;
    setProgress((prev) => [...prev, { key, name, ratio: 0, status: "uploading" }]);
    return key;
  };
  /** 跑一个上传/新建任务并驱动它的进度条；返回是否成功。single=true 时成功后自动复制 raw 链接 */
  const runTracked = async (key: string, name: string, job: (onProgress: (r: number) => void) => Promise<{ file: FileView }>, single: boolean, failTitle = "上传失败") => {
    try {
      const { file } = await job((ratio) => patch(key, { ratio }));
      patch(key, { ratio: 1, status: "done" });
      dismiss(key, 1500);
      upsert(file);
      if (single) {
        await copyText(file.urls.raw);
        toast.add({ title: `${failTitle === "上传失败" ? "上传成功" : "已创建"}，${rawLabel(file)}已复制`, description: file.urls.raw, variant: "success" });
      }
      return true;
    } catch (e) {
      patch(key, { ratio: 1, status: "error" });
      dismiss(key, 4000);
      toast.add({ title: `${failTitle}：${name}`, description: e instanceof Error ? e.message : String(e), variant: "error" });
      return false;
    }
  };

  const onFiles = useCallback(async (list: File[]) => {
    const keys = list.map((f) => track(f.name));
    let ok = 0;
    for (let i = 0; i < list.length; i++) {
      const f = list[i]!;
      if (await runTracked(keys[i]!, f.name, (onP) => api.upload(f, onP), list.length === 1)) ok++;
    }
    if (list.length > 1 && ok > 0) toast.add({ title: `已上传 ${ok} 个文件`, variant: "success" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** 复制按钮统一复制 raw 链接（原图链接 / 原文链接）：图片是原图直链，文本是最新版原文。 */
  const copyLink = async (f: FileView) => {
    await copyText(f.urls.raw);
    toast.add({ title: `已复制${rawLabel(f)}`, description: f.urls.raw, variant: "success" });
  };
  const openNew = () => {
    if (!requireLogin("新建文本需要先登录。")) return;
    setDraftName("");
    setDraftContent("");
    setNewOpen(true);
  };
  const askRename = (f: FileView) => {
    setRenaming(f);
    setNewName(f.name);
    setRenameOpen(true);
  };
  const askDelete = (f: FileView) => {
    setDeleting(f);
    setDeleteOpen(true);
  };

  /** 新建文本：关掉弹窗留在首页，进度条显示在上传区底部，不跳转编辑器 */
  function createText() {
    const name = draftName.trim() || "untitled.txt";
    const content = draftContent;
    setNewOpen(false);
    const key = track(name);
    patch(key, { ratio: 0.3 });
    void runTracked(key, name, () => api.createText(name, content), true, "新建失败");
  }

  async function confirmRename() {
    if (!renaming) return;
    setBusy(true);
    try {
      const { file } = await api.rename(renaming.id, newName);
      upsert(file);
      setRenameOpen(false);
      toast.add({ title: "已重命名", description: file.name, variant: "success" });
    } catch (e) {
      toast.add({ title: "重命名失败", description: e instanceof Error ? e.message : String(e), variant: "error" });
    } finally {
      setBusy(false);
    }
  }

  async function confirmDelete() {
    if (!deleting) return;
    setBusy(true);
    try {
      await api.remove(deleting.id);
      setFiles((prev) => prev?.filter((f) => f.id !== deleting.id) ?? prev);
      setDeleteOpen(false);
      toast.add({ title: `已删除 ${deleting.name}`, variant: "success" });
    } catch (e) {
      toast.add({ title: "删除失败", description: e instanceof Error ? e.message : String(e), variant: "error" });
    } finally {
      setBusy(false);
    }
  }

  const actions = (f: FileView) => (
    <DropdownMenu>
      <DropdownMenu.Trigger render={<Button variant="ghost" size="sm" shape="square" icon={DotsThreeIcon} aria-label={`${f.name} 的操作`} />} />
      <DropdownMenu.Content align="end">
        <DropdownMenu.Item icon={CopyIcon} onClick={() => copyLink(f)}>复制{rawLabel(f)}</DropdownMenu.Item>
        <DropdownMenu.LinkItem icon={ArrowSquareOutIcon} href={f.urls.view} target="_blank">打开</DropdownMenu.LinkItem>
        {f.kind === "text" && <DropdownMenu.LinkItem icon={NotePencilIcon} href={`/edit/${f.id}`}>编辑与历史版本</DropdownMenu.LinkItem>}
        <DropdownMenu.Item icon={PencilSimpleIcon} onClick={() => askRename(f)}>重命名</DropdownMenu.Item>
        <DropdownMenu.Separator />
        <DropdownMenu.Item icon={TrashIcon} variant="danger" onClick={() => askDelete(f)}>删除</DropdownMenu.Item>
      </DropdownMenu.Content>
    </DropdownMenu>
  );

  return (
    <div className="min-h-screen bg-kumo-canvas">
      <AppHeader>
        <Button variant="secondary" icon={PlusIcon} onClick={openNew}>
          新建文本
        </Button>
      </AppHeader>

      <main className="mx-auto grid max-w-6xl gap-6 px-5 py-6">
        {shownError && !user && (
          <Banner
            variant="error"
            icon={<WarningCircleIcon weight="fill" />}
            title="登录失败"
            description={LOGIN_ERRORS[shownError]}
            action={<Button variant="ghost" shape="square" size="sm" icon={XIcon} aria-label="关闭" onClick={() => setShownError(null)} />}
          />
        )}

        <UploadZone limits={limits} progress={progress} onFiles={onFiles} />

        <section className="grid gap-4">
          {user && (
            // 筛选（全部 / 图片 / 文本）靠左，搜索靠右
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Tabs
                value={kind}
                onValueChange={setKind}
                tabs={[
                  { value: "all", label: "全部" },
                  { value: "image", label: "图片" },
                  { value: "text", label: "文本" },
                ]}
              />
              <div className="relative min-w-0 flex-1 sm:w-56 sm:flex-none">
                <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-kumo-subtle">
                  <MagnifyingGlassIcon size={14} />
                </span>
                <Input aria-label="搜索" placeholder="按文件名或 id 搜索" value={query} onChange={(e) => setQuery(e.target.value)} className="w-full pl-8" />
              </div>
            </div>
          )}

          {loadError && <Banner variant="error" icon={<XIcon />} title="加载失败" description={loadError} />}

          {!user ? (
            <LayerCard>
              <LayerCard.Primary>
                <Empty
                  icon={<span className="text-kumo-inactive"><FolderOpenIcon size={48} /></span>}
                  title="文件列表仅站长可见"
                  description="图片直链和文本只读页对所有人公开；上传、编辑和删除需要登录。"
                  contents={<Button variant="primary" icon={GoogleLogoIcon} onClick={() => requireLogin()}>登录</Button>}
                />
              </LayerCard.Primary>
            </LayerCard>
          ) : !files ? (
            <div className="flex justify-center py-16"><Loader size={24} /></div>
          ) : files.length === 0 ? (
            <LayerCard>
              <LayerCard.Primary>
                <Empty
                  icon={<span className="text-kumo-inactive"><FolderOpenIcon size={48} /></span>}
                  title={query ? `没有匹配「${query}」的文件` : "还没有文件"}
                  description={query ? "换个关键词试试。" : "上传一张图片或新建一个文本开始。"}
                  contents={query ? undefined : <Button variant="primary" icon={PlusIcon} onClick={openNew}>新建文本</Button>}
                />
              </LayerCard.Primary>
            </LayerCard>
          ) : (
            <>
              <LayerCard className="overflow-x-auto p-0">
                <Table>
                  <Table.Header>
                    <Table.Row>
                      <Table.Head>名称</Table.Head>
                      <Table.Head className="hidden sm:table-cell">类型</Table.Head>
                      <Table.Head className="hidden text-right md:table-cell">大小</Table.Head>
                      <Table.Head className="hidden md:table-cell">更新</Table.Head>
                      <Table.Head className="w-24"><span className="sr-only">操作</span></Table.Head>
                    </Table.Row>
                  </Table.Header>
                  <Table.Body>
                    {files.map((f) => (
                      <Table.Row key={f.id}>
                        <Table.Cell className="max-w-md">
                          <div className="flex items-center gap-3">
                            <Thumb f={f} />
                            <div className="grid min-w-0 gap-0.5">
                              <a href={f.urls.view} target="_blank" rel="noopener" className="truncate text-kumo-default hover:underline">
                                {f.name}
                              </a>
                              <Text variant="mono-secondary">{f.id}</Text>
                            </div>
                          </div>
                        </Table.Cell>
                        <Table.Cell className="hidden sm:table-cell">
                          {f.kind === "image" ? <Badge variant="blue">图片</Badge> : <Badge variant="neutral">文本 · v{f.version}</Badge>}
                        </Table.Cell>
                        <Table.Cell className="hidden whitespace-nowrap text-right tabular-nums text-kumo-subtle md:table-cell">{fmtBytes(f.size)}</Table.Cell>
                        <Table.Cell className="hidden whitespace-nowrap text-kumo-subtle md:table-cell">
                          <span title={fmtTime(f.updatedAt)}>{fmtAgo(f.updatedAt)}</span>
                        </Table.Cell>
                        <Table.Cell>
                          <div className="flex items-center justify-end gap-1">
                            <Tooltip content={`复制${rawLabel(f)}`} asChild>
                              <Button variant="ghost" size="sm" shape="square" icon={CopyIcon} aria-label={`复制${rawLabel(f)}`} onClick={() => copyLink(f)} />
                            </Tooltip>
                            {actions(f)}
                          </div>
                        </Table.Cell>
                      </Table.Row>
                    ))}
                  </Table.Body>
                </Table>
              </LayerCard>
              {cursor && (
                <div className="flex justify-center">
                  <Button variant="secondary" loading={loadingMore} onClick={() => load(true)}>加载更多</Button>
                </div>
              )}
            </>
          )}
        </section>
      </main>


      <Dialog.Root open={newOpen} onOpenChange={setNewOpen}>
        <Dialog size="lg" className="px-6 py-5">
          <form
            className="grid gap-5"
            onSubmit={(e) => {
              e.preventDefault();
              createText();
            }}
          >
            <div className="grid gap-1">
              <Dialog.Title className="text-base font-semibold">新建文本</Dialog.Title>
              <Dialog.Description className="text-kumo-subtle">创建后留在首页，可在文件列表里打开编辑；每次保存都会生成一个带时间戳的版本。</Dialog.Description>
            </div>
            <Input label="文件名" placeholder="notes.md（不写扩展名默认 .txt）" value={draftName} onChange={(e) => setDraftName(e.target.value)} autoFocus />
            <InputArea label="初始内容（可留空）" value={draftContent} onValueChange={setDraftContent} rows={6} className="font-mono" />
            <div className="flex justify-end gap-2">
              <Dialog.Close render={(p) => <Button {...p} variant="secondary">取消</Button>} />
              <Button type="submit" variant="primary">创建</Button>
            </div>
          </form>
        </Dialog>
      </Dialog.Root>

      <Dialog.Root open={renameOpen} onOpenChange={setRenameOpen}>
        <Dialog size="base" className="px-6 py-5">
          <form
            className="grid gap-5"
            onSubmit={(e) => {
              e.preventDefault();
              void confirmRename();
            }}
          >
            <div className="grid gap-1">
              <Dialog.Title className="text-base font-semibold">重命名</Dialog.Title>
              <Dialog.Description className="text-kumo-subtle">扩展名保持 .{renaming?.ext}，链接不会变。</Dialog.Description>
            </div>
            <Input label="文件名" value={newName} onChange={(e) => setNewName(e.target.value)} autoFocus />
            <div className="flex justify-end gap-2">
              <Dialog.Close render={(p) => <Button {...p} variant="secondary">取消</Button>} />
              <Button type="submit" variant="primary" loading={busy} disabled={!newName.trim()}>保存</Button>
            </div>
          </form>
        </Dialog>
      </Dialog.Root>

      <Dialog.Root open={deleteOpen} onOpenChange={setDeleteOpen}>
        <Dialog size="sm" className="px-6 py-5">
          <div className="grid gap-4">
            <div className="grid gap-1.5">
              <Dialog.Title className="text-base font-semibold">删除 {deleting?.name}？</Dialog.Title>
              <Dialog.Description className="text-kumo-subtle">
                {deleting?.kind === "text" ? "文本和全部历史版本都会删除，" : "图片直链会立即失效，"}无法恢复。
              </Dialog.Description>
            </div>
            <div className="flex justify-end gap-2">
              <Dialog.Close render={(p) => <Button {...p} variant="secondary">取消</Button>} />
              <Button variant="destructive" loading={busy} onClick={confirmDelete}>删除</Button>
            </div>
          </div>
        </Dialog>
      </Dialog.Root>
    </div>
  );
}
