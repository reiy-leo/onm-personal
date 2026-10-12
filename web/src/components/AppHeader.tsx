// 吸顶顶栏：左侧站点名，右侧自定义操作 + 账号菜单 / 登录按钮。
import type { ReactNode } from "react";
import { Button, DropdownMenu, Text } from "@cloudflare/kumo";
import { CaretDownIcon, GoogleLogoIcon, ImageSquareIcon, SignOutIcon } from "@phosphor-icons/react";
import { useAuth } from "./Auth.tsx";

export function AppHeader({ children, wide = false }: { children?: ReactNode; wide?: boolean }) {
  const { user, loginUrl } = useAuth();
  return (
    <header className="sticky top-0 z-10 border-b border-kumo-line bg-kumo-base">
      <div className={`mx-auto flex h-14 items-center justify-between gap-3 px-5 ${wide ? "max-w-none" : "max-w-6xl"}`}>
        <a href="/" className="flex min-w-0 items-center gap-2">
          <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-kumo-brand text-white">
            <ImageSquareIcon size={16} weight="bold" />
          </span>
          <Text variant="heading" as="span">onm</Text>
          <span className="hidden sm:inline">
            <Text variant="secondary" as="span">图床 · 文本</Text>
          </span>
        </a>
        <div className="flex min-w-0 items-center gap-2">
          {children}
          {user ? (
            <>
              <DropdownMenu>
                <DropdownMenu.Trigger
                  render={
                    <Button variant="ghost" icon={user.picture ? <img src={user.picture} alt="" className="size-5 rounded-full" referrerPolicy="no-referrer" /> : undefined}>
                      <span className="hidden max-w-40 truncate md:inline">{user.name ?? user.email}</span>
                      <CaretDownIcon />
                    </Button>
                  }
                />
                <DropdownMenu.Content align="end">
                  {/* Label 是 Base UI 的 GroupLabel，必须放在 Group 里，否则抛错白屏 */}
                  <DropdownMenu.Group>
                    <DropdownMenu.Label>{user.email}</DropdownMenu.Label>
                  </DropdownMenu.Group>
                  <DropdownMenu.Separator />
                  <DropdownMenu.Item icon={SignOutIcon} onClick={() => (document.getElementById("logout-form") as HTMLFormElement | null)?.submit()}>
                    退出登录
                  </DropdownMenu.Item>
                </DropdownMenu.Content>
              </DropdownMenu>
              <form id="logout-form" method="post" action="/auth/logout" hidden />
            </>
          ) : (
            <Button variant="secondary" icon={GoogleLogoIcon} onClick={() => (location.href = loginUrl())}>
              登录
            </Button>
          )}
        </div>
      </div>
    </header>
  );
}
