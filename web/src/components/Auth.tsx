// 登录状态 + 「需要登录」弹窗。未登录时点上传/新建/编辑等操作 → requireLogin() 弹窗，不跳页。
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { Button, Dialog, Text } from "@cloudflare/kumo";
import { GoogleLogoIcon, LockKeyIcon } from "@phosphor-icons/react";
import type { SessionInfo } from "../../../src/shared/types.ts";
import { UNAUTHORIZED_EVENT } from "../api.ts";

interface AuthValue {
  user: SessionInfo | null;
  /** 已登录返回 true；未登录弹出登录框并返回 false。reason 是弹窗里的说明。 */
  requireLogin: (reason?: string) => boolean;
  loginUrl: () => string;
}

const AuthContext = createContext<AuthValue>({ user: null, requireLogin: () => false, loginUrl: () => "/auth/login" });

export const useAuth = () => useContext(AuthContext);

export function AuthProvider({ user: initial, children }: { user: SessionInfo | null; children: ReactNode }) {
  const [user, setUser] = useState(initial);
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<string | undefined>();
  const [expired, setExpired] = useState(false);

  const loginUrl = useCallback(() => `/auth/login?returnTo=${encodeURIComponent(location.pathname + location.search)}`, []);

  const requireLogin = useCallback(
    (why?: string) => {
      if (user) return true;
      setReason(why);
      setExpired(false);
      setOpen(true);
      return false;
    },
    [user],
  );

  // 接口返回 401（会话过期）：本地视为已退出，弹窗提示重新登录
  useEffect(() => {
    const onUnauthorized = () => {
      setUser(null);
      setExpired(true);
      setReason(undefined);
      setOpen(true);
    };
    window.addEventListener(UNAUTHORIZED_EVENT, onUnauthorized);
    return () => window.removeEventListener(UNAUTHORIZED_EVENT, onUnauthorized);
  }, []);

  const value = useMemo(() => ({ user, requireLogin, loginUrl }), [user, requireLogin, loginUrl]);

  return (
    <AuthContext.Provider value={value}>
      {children}
      <Dialog.Root open={open} onOpenChange={setOpen}>
        <Dialog size="base" className="px-6 py-5">
          <div className="grid gap-5">
            <div className="flex items-start gap-3">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-kumo-recessed text-kumo-subtle">
                <LockKeyIcon size={18} />
              </span>
              <div className="grid gap-1">
                <Dialog.Title className="text-base font-semibold">{expired ? "登录已过期" : "登录原料在线"}</Dialog.Title>
                <Dialog.Description className="text-kumo-subtle">
                  {expired ? "请重新登录后再继续操作。" : (reason ?? "上传、编辑和删除只对站长开放。")}
                </Dialog.Description>
              </div>
            </div>
            <Text variant="secondary" size="sm">公开链接（图片直链、文本只读页）不需要登录。</Text>
            <div className="flex justify-end gap-2">
              <Dialog.Close render={(p) => <Button {...p} variant="secondary">取消</Button>} />
              <Button variant="primary" icon={GoogleLogoIcon} onClick={() => (location.href = loginUrl())}>
                使用 Google 登录
              </Button>
            </div>
          </div>
        </Dialog>
      </Dialog.Root>
    </AuthContext.Provider>
  );
}
