// 首页：上传区 + 本次上传结果 + 文件管理（列表 / 筛选 / 搜索 / 改名 / 删除）。
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
  CheckCircleIcon,
  CopyIcon,
  DotsThreeIcon,
  FileTextIcon,
  FolderOpenIcon,
  GoogleLogoIcon,
  LinkSimpleIcon,
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
import { LinksDialog } from "../components/LinksDialog.tsx";
import { UploadZone } from "../components/UploadZone.tsx";
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

type UploadItem = { key: string; name: string; status: "uploading" | "done" | "error"; file?: FileView; error?: string };

function Thumb({ f }: { f: FileView }) {
  return f.kind === "image" ? (
    <img src={f.urls.view} alt="" loading="lazy" className="size-10 shrink-0 rounded-md bg-kumo-recessed object-cover" />
  ) : (
    <span className="flex size-10 shrink-0 items-center justify-center rounded-md bg-kumo-recessed text-kumo-subtle">
      <FileTextIcon size={20} />
    </span>
  );
}

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
  const [uploads, setUploads] = useState<UploadItem[]>([]);
  const seq = useRef(0);

  // ---- 列表 ----
  const [kind, setKind] = useState("all");
  const [query, setQuery] = useState("");
  const [files, setFiles] = useState<FileView[] | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  // ---- 弹窗（始终挂载，用 open 控制）----
  const [linksFile, setLinksFile] = useState<FileView | null>(null);
  const [linksOpen, setLinksOpen] = useState(false);
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

  const onFiles = useCallback(async (list: File[]) => {
    const items = list.map((f) => ({ key: `u${++seq.current}`, name: f.name, status: "uploading" as const }));
    setUploads((prev) => [...items, ...prev].slice(0, 20));
    for (let i = 0; i < list.length; i++) {
      const key = items[i]!.key;
      try {
        const { file } = await api.upload(list[i]!);
        setUploads((prev) => prev.map((u) => (u.key === key ? { ...u, status: "done", file } : u)));
        upsert(file);
        if (list.length === 1) {
          await copyText(file.urls.view);
          toast.add({ title: "上传成功，链接已复制", description: file.urls.view, variant: "success" });
        }
      } catch (e) {
        setUploads((prev) => prev.map((u) => (u.key === key ? { ...u, status: "error", error: e instanceof Error ? e.message : String(e) } : u)));
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const openLinks = (f: FileView) => {
    setLinksFile(f);
    setLinksOpen(true);
  };
  const copyLink = async (f: FileView) => {
    await copyText(f.urls.view);
    toast.add({ title: "已复制", description: f.urls.view, variant: "success" });
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

  async function createText() {
    setBusy(true);
    try {
      const { file } = await api.createText(draftName.trim() || "untitled.txt", draftContent);
      location.href = `/edit/${file.id}`;
    } catch (e) {
      toast.add({ title: "新建失败", description: e instanceof Error ? e.message : String(e), variant: "error" });
      setBusy(false);
    }
  }

  async function confirmRename() {
    if (!renaming) return;
    setBusy(true);
    try {
      const { file } = await api.rename(renaming.id, newName);
      upsert(file);
      setUploads((prev) => prev.map((u) => (u.file?.id === file.id ? { ...u, file } : u)));
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
      setUploads((prev) => prev.filter((u) => u.file?.id !== deleting.id));
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
        <DropdownMenu.Item icon={CopyIcon} onClick={() => copyLink(f)}>复制{f.kind === "image" ? "直链" : "链接"}</DropdownMenu.Item>
        <DropdownMenu.Item icon={LinkSimpleIcon} onClick={() => openLinks(f)}>更多链接格式</DropdownMenu.Item>
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

        <UploadZone limits={limits} onFiles={onFiles} />

        {uploads.length > 0 && (
          <section className="grid gap-3">
            <div className="flex items-center justify-between">
              <Text variant="heading" as="h2">本次上传</Text>
              <Button variant="ghost" size="sm" onClick={() => setUploads([])}>清空</Button>
            </div>
            <LayerCard className="p-0">
              <ul className="divide-y divide-kumo-line">
                {uploads.map((u) => (
                  <li key={u.key} className="flex items-center gap-3 px-4 py-3">
                    {u.file ? <Thumb f={u.file} /> : (
                      <span className="flex size-10 shrink-0 items-center justify-center rounded-md bg-kumo-recessed">
                        {u.status === "uploading" ? <Loader size={16} /> : <span className="text-kumo-danger"><XIcon size={18} /></span>}
                      </span>
                    )}
                    <div className="grid min-w-0 flex-1 gap-0.5">
                      <Text truncate bold>{u.file?.name ?? u.name}</Text>
                      {u.status === "uploading" && <Text variant="secondary" size="sm">上传中…</Text>}
                      {u.status === "error" && <Text variant="error" size="sm">{u.error}</Text>}
                      {u.file && <Text variant="mono-secondary" truncate>{u.file.urls.view}</Text>}
                    </div>
                    {u.file && (
                      <div className="flex shrink-0 items-center gap-1">
                        <span className="hidden text-kumo-success sm:inline-flex"><CheckCircleIcon size={16} weight="fill" /></span>
                        <Tooltip content="复制链接" asChild>
                          <Button variant="ghost" size="sm" shape="square" icon={CopyIcon} aria-label="复制链接" onClick={() => copyLink(u.file!)} />
                        </Tooltip>
                        <Button variant="secondary" size="sm" onClick={() => openLinks(u.file!)}>格式</Button>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            </LayerCard>
          </section>
        )}

        <section className="grid gap-4">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div className="grid gap-1">
              <Text variant="heading" as="h2">文件</Text>
              <Text variant="secondary">{user ? (files ? `已加载 ${files.length} 个${cursor ? "，还有更多" : ""}` : "加载中…") : "登录后可以管理全部文件。"}</Text>
            </div>
            {user && (
              <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
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
          </div>

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
                              <a href={f.kind === "text" ? `/edit/${f.id}` : f.urls.view} target={f.kind === "text" ? undefined : "_blank"} rel="noopener" className="truncate text-kumo-default hover:underline">
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
                            <Tooltip content={f.kind === "image" ? "复制直链" : "复制链接"} asChild>
                              <Button variant="ghost" size="sm" shape="square" icon={CopyIcon} aria-label="复制链接" onClick={() => copyLink(f)} />
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

      <LinksDialog file={linksFile} open={linksOpen} onOpenChange={setLinksOpen} />

      <Dialog.Root open={newOpen} onOpenChange={setNewOpen}>
        <Dialog size="lg" className="px-6 py-5">
          <form
            className="grid gap-5"
            onSubmit={(e) => {
              e.preventDefault();
              void createText();
            }}
          >
            <div className="grid gap-1">
              <Dialog.Title className="text-base font-semibold">新建文本</Dialog.Title>
              <Dialog.Description className="text-kumo-subtle">创建后进入编辑器，每次保存都会生成一个带时间戳的版本。</Dialog.Description>
            </div>
            <Input label="文件名" placeholder="notes.md（不写扩展名默认 .txt）" value={draftName} onChange={(e) => setDraftName(e.target.value)} autoFocus />
            <InputArea label="初始内容（可留空）" value={draftContent} onValueChange={setDraftContent} rows={6} className="font-mono" />
            <div className="flex justify-end gap-2">
              <Dialog.Close render={(p) => <Button {...p} variant="secondary">取消</Button>} />
              <Button type="submit" variant="primary" loading={busy}>创建并编辑</Button>
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
