// 上传区：点击选择 / 拖拽 / 粘贴（Ctrl+V 截图或文件）。未登录时任何上传动作都会先弹登录框。
import { useCallback, useEffect, useRef, useState } from "react";
import { Meter, Text } from "@cloudflare/kumo";
import { UploadSimpleIcon } from "@phosphor-icons/react";
import { ACCEPT_ATTR, IMAGE_TYPES, TEXT_TYPES, kindOf } from "../../../src/shared/limits.ts";
import type { Limits } from "../../../src/shared/types.ts";
import { fmtBytes } from "../format.ts";
import { useAuth } from "./Auth.tsx";

/** 一个正在上传（或刚结束）的文件，显示在上传区底部的进度条里 */
export interface UploadProgress {
  key: string;
  name: string;
  /** 0–1 */
  ratio: number;
  status: "uploading" | "done" | "error";
}

interface Props {
  limits: Limits;
  progress: UploadProgress[];
  /** 交给上层逐个上传 */
  onFiles: (files: File[]) => void;
}

// Meter 的进度条是 from/via/to 渐变，换色要覆盖这三个
const DONE_BAR = "from-kumo-success via-kumo-success to-kumo-success";
const ERROR_BAR = "from-kumo-danger via-kumo-danger to-kumo-danger";

const LOGIN_REASON = "上传图片或文本需要先登录。";

/** 粘贴的截图没有像样的文件名：按时间命名 */
function named(f: File): File {
  if (f.name && f.name !== "image.png" && kindOf(f.name)) return f;
  const ext = Object.entries(IMAGE_TYPES).find(([, m]) => m === f.type)?.[0] ?? (f.type.startsWith("text/") ? "txt" : "");
  if (!ext) return f;
  const d = new Date();
  const stamp = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}-${String(d.getHours()).padStart(2, "0")}${String(d.getMinutes()).padStart(2, "0")}${String(d.getSeconds()).padStart(2, "0")}`;
  return new File([f], `paste-${stamp}.${ext}`, { type: f.type });
}

export function UploadZone({ limits, progress, onFiles }: Props) {
  const { user, requireLogin } = useAuth();
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);

  const take = useCallback(
    (list: FileList | File[] | null | undefined) => {
      const files = [...(list ?? [])].map(named);
      if (!files.length) return;
      if (!requireLogin(LOGIN_REASON)) return;
      onFiles(files);
    },
    [onFiles, requireLogin],
  );

  // 页面任意位置粘贴（输入框里粘贴文字不拦截）
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      const files = [...(e.clipboardData?.files ?? [])];
      if (files.length) {
        e.preventDefault();
        take(files);
      }
    };
    document.addEventListener("paste", onPaste);
    return () => document.removeEventListener("paste", onPaste);
  }, [take]);

  const pick = () => {
    if (!requireLogin(LOGIN_REASON)) return;
    input.current?.click();
  };

  return (
    <>
    <div
      role="button"
      tabIndex={0}
      onClick={pick}
      onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), pick())}
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        take(e.dataTransfer.files);
      }}
      className={`grid cursor-pointer justify-items-center gap-3 rounded-xl border border-dashed px-6 py-10 text-center outline-none focus-visible:ring-2 focus-visible:ring-kumo-focus ${
        over ? "border-kumo-brand bg-kumo-tint" : "border-kumo-line bg-kumo-base hover:bg-kumo-tint"
      }`}
    >
      <span className="flex size-11 items-center justify-center rounded-full bg-kumo-recessed text-kumo-subtle">
        <UploadSimpleIcon size={22} />
      </span>
      <div className="grid gap-1">
        <Text bold>{user ? "拖拽、粘贴或点击上传" : "登录后可上传"}</Text>
        <Text variant="secondary" size="sm">
          图片 ≤ {fmtBytes(limits.maxImageBytes)}，纯文本 ≤ {fmtBytes(limits.maxTextBytes)}（UTF-8）· 可多选
        </Text>
      </div>
      <Text variant="secondary" size="xs">
        支持 {Object.keys(IMAGE_TYPES).join(" ")} · {Object.keys(TEXT_TYPES).slice(0, 10).join(" ")} 等
      </Text>
      {progress.length > 0 && (
        // 进度条：上传中为品牌色，完成变绿，失败变红；结束后由上层稍等移除
        <div className="grid w-full max-w-xl gap-2 text-left" onClick={(e) => e.stopPropagation()}>
          {progress.map((p) => (
            <Meter
              key={p.key}
              label={p.name}
              value={Math.round(p.ratio * 100)}
              customValue={p.status === "done" ? "完成" : p.status === "error" ? "失败" : `${Math.round(p.ratio * 100)}%`}
              indicatorClassName={p.status === "done" ? DONE_BAR : p.status === "error" ? ERROR_BAR : undefined}
            />
          ))}
        </div>
      )}
    </div>
      <input
        ref={input}
        type="file"
        multiple
        accept={ACCEPT_ATTR}
        hidden
        onChange={(e) => {
          take(e.target.files);
          e.target.value = "";
        }}
      />
    </>
  );
}
